"""
Session Continuation管理

8分セッション制限に対応するため、6分経過でMONITORING状態に遷移し、
アシスタントAUDIO contentStart検出後にバックグラウンドで次セッションを作成、
シームレスなハンドオフを実行する。
失敗時はConversation Resumptionにフォールバック。
"""

import asyncio
import time
import logging
from typing import Optional, Callable, Awaitable, Any
from collections import deque

from models import TransitionState, SessionTransitionConfig

logger = logging.getLogger(__name__)


class SessionTransitionManager:
    """Nova 2 Sonicセッションのライフサイクル管理"""

    def __init__(
        self,
        config: Optional[SessionTransitionConfig] = None,
        on_transition_status: Optional[Callable[[str, int], Awaitable[None]]] = None,
    ):
        self._config = config or SessionTransitionConfig()
        self._on_transition_status = on_transition_status
        self._state = TransitionState.ACTIVE
        self._session_start_time: float = 0.0
        self._nova_sonic_session_count: int = 0
        self._audio_buffer: deque = deque()
        self._buffer_max_bytes = (
            16000 * 2 * self._config.audio_buffer_duration_seconds
        )  # 16kHz * 16bit * duration

    def start_session(self) -> None:
        """新しいNova 2 Sonicセッション開始を記録"""
        self._session_start_time = time.time()
        self._nova_sonic_session_count += 1
        self._state = TransitionState.ACTIVE
        self._audio_buffer.clear()
        logger.info(
            f"セッション開始: count={self._nova_sonic_session_count}"
        )

    @property
    def session_count(self) -> int:
        return self._nova_sonic_session_count

    @property
    def state(self) -> TransitionState:
        return self._state

    def elapsed_seconds(self) -> float:
        """現在のセッション経過時間（秒）"""
        if self._session_start_time == 0:
            return 0.0
        return time.time() - self._session_start_time

    def should_monitor(self) -> bool:
        """MONITORING状態に遷移すべきか判定"""
        return (
            self._state == TransitionState.ACTIVE
            and self.elapsed_seconds() >= self._config.transition_threshold_seconds
        )

    def enter_monitoring(self) -> None:
        """MONITORING状態に遷移"""
        self._state = TransitionState.MONITORING
        logger.info(
            f"MONITORING状態遷移: elapsed={self.elapsed_seconds():.1f}s"
        )

    def on_assistant_audio_content_start(self) -> bool:
        """
        アシスタントのAUDIO contentStart検出時に呼ばれる。
        MONITORING状態の場合、BUFFERING状態に遷移してTrueを返す。
        """
        if self._state == TransitionState.MONITORING:
            self._state = TransitionState.BUFFERING
            logger.info("BUFFERING状態遷移: アシスタント音声検出")
            return True
        return False

    def buffer_audio(self, audio_data: bytes) -> None:
        """音声データをリングバッファに追加"""
        self._audio_buffer.append(audio_data)
        # バッファサイズ制限（古いデータを自動削除）
        total_size = sum(len(chunk) for chunk in self._audio_buffer)
        while total_size > self._buffer_max_bytes and self._audio_buffer:
            removed = self._audio_buffer.popleft()
            total_size -= len(removed)

    def get_buffered_audio(self) -> list:
        """バッファされた音声データを取得"""
        return list(self._audio_buffer)

    def enter_handoff(self) -> None:
        """HANDOFF状態に遷移"""
        self._state = TransitionState.HANDOFF
        logger.info("HANDOFF状態遷移")

    def complete_handoff(self) -> None:
        """ハンドオフ完了、新セッションでACTIVE状態に戻る"""
        self._session_start_time = time.time()
        self._state = TransitionState.ACTIVE
        self._audio_buffer.clear()
        logger.info(
            f"ハンドオフ完了: count={self._nova_sonic_session_count}"
        )

    def enter_error(self) -> None:
        """ERROR状態に遷移"""
        self._state = TransitionState.ERROR
        logger.error("ERROR状態遷移")

    async def notify_status(self) -> None:
        """フロントエンドにセッション状態を通知"""
        if self._on_transition_status:
            status = "active"
            if self._state in (TransitionState.MONITORING, TransitionState.BUFFERING, TransitionState.HANDOFF):
                status = "transitioning"
            elif self._state == TransitionState.ERROR:
                status = "error"
            await self._on_transition_status(status, self._nova_sonic_session_count)
