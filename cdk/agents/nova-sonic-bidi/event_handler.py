"""
Nova 2 Sonicイベント処理

contentStart/contentEnd/textOutput/audioOutput/usageEventの処理を行い、
ASR転写テキスト、NPC応答テキスト、音声出力データを抽出してフロントエンドに転送する。
"""

import json
import logging
from typing import Callable, Awaitable, Optional

from models import (
    AsrTranscriptEvent,
    NpcResponseEvent,
    AudioOutputEvent,
    SessionStatusEvent,
    ErrorEvent,
)

logger = logging.getLogger(__name__)


class NovaSonicEventHandler:
    """Nova 2 Sonicイベントを処理し、フロントエンドに転送するハンドラ"""

    def __init__(
        self,
        send_to_frontend: Callable[[str], Awaitable[None]],
        on_asr_final: Optional[Callable[[str], Awaitable[None]]] = None,
        on_npc_final: Optional[Callable[[str], Awaitable[None]]] = None,
    ):
        """
        Args:
            send_to_frontend: フロントエンドにJSONメッセージを送信するコールバック
            on_asr_final: ASR FINAL転写テキスト受信時のコールバック（Memory保存用）
            on_npc_final: NPC FINAL応答テキスト受信時のコールバック（Memory保存用）
        """
        self._send = send_to_frontend
        self._on_asr_final = on_asr_final
        self._on_npc_final = on_npc_final

    async def handle_event(self, event: dict) -> None:
        """
        Nova 2 Sonicからのイベントを処理してフロントエンドに転送する。

        BidiAgentのコールバックから呼ばれる。イベント構造:
        - contentStart: コンテンツブロック開始（type, role, speculative情報）
        - contentEnd: コンテンツブロック終了
        - textOutput: テキスト出力（ASR転写 or NPC応答）
        - audioOutput: 音声出力（LPCM 24kHz Base64）
        - usageEvent: トークン使用量
        """
        event_type = event.get("event_type") or event.get("type", "")

        try:
            if event_type == "textOutput":
                await self._handle_text_output(event)
            elif event_type == "audioOutput":
                await self._handle_audio_output(event)
            elif event_type == "usageEvent":
                self._handle_usage_event(event)
            elif event_type == "contentStart":
                # contentStartはセッション遷移管理で使用（外部から監視）
                pass
            elif event_type == "contentEnd":
                pass
            else:
                logger.debug(f"未処理のイベントタイプ: {event_type}")
        except Exception as e:
            logger.error(f"イベント処理エラー: {event_type} - {e}")

    async def _handle_text_output(self, event: dict) -> None:
        """テキスト出力イベントを処理"""
        role = event.get("role", "")
        text = event.get("content", "") or event.get("text", "")
        is_speculative = event.get("speculative", False)
        generation_stage = "SPECULATIVE" if is_speculative else "FINAL"

        if not text:
            return

        if role == "USER":
            # ASR転写テキスト
            is_final = not is_speculative
            msg = AsrTranscriptEvent(text=text, isFinal=is_final)
            await self._send(msg.model_dump_json())

            if is_final and self._on_asr_final:
                await self._on_asr_final(text)

        elif role == "ASSISTANT":
            # NPC応答テキスト
            msg = NpcResponseEvent(text=text, generationStage=generation_stage)
            await self._send(msg.model_dump_json())

            if generation_stage == "FINAL" and self._on_npc_final:
                await self._on_npc_final(text)

    async def _handle_audio_output(self, event: dict) -> None:
        """音声出力イベントを処理（LPCM 24kHz Base64をフロントエンドに転送）"""
        data = event.get("content", "") or event.get("data", "")
        if data:
            msg = AudioOutputEvent(data=data)
            await self._send(msg.model_dump_json())

    def _handle_usage_event(self, event: dict) -> None:
        """トークン使用量をログに記録"""
        usage = event.get("usage", event)
        logger.info(
            "nova_sonic_usage",
            extra={
                "event": "nova_sonic_usage",
                "input_audio_tokens": usage.get("inputAudioTokens", 0),
                "output_audio_tokens": usage.get("outputAudioTokens", 0),
                "input_text_tokens": usage.get("inputTextTokens", 0),
                "output_text_tokens": usage.get("outputTextTokens", 0),
            },
        )
