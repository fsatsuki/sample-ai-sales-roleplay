"""
Nova 2 Sonic BidiAgent データモデル定義

WebSocketメッセージ型、レスポンスイベント型、SessionTransitionConfigを定義。
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal, Dict, Any
from enum import Enum


# --- WebSocket入力メッセージ型 ---

class SessionStartMessage(BaseModel):
    """セッション開始メッセージ"""
    type: Literal["session_start"] = "session_start"
    sessionId: str
    scenarioId: str
    npcConfig: Dict[str, Any] = Field(default_factory=dict)
    endpointingSensitivity: Literal["HIGH", "MEDIUM", "LOW"] = "MEDIUM"
    language: str = "ja"


class AudioMessage(BaseModel):
    """音声入力メッセージ"""
    type: Literal["audio"] = "audio"
    data: str  # Base64エンコードPCM 16kHz
    sessionId: str
    scenarioId: Optional[str] = None


class TextMessage(BaseModel):
    """テキスト入力メッセージ（Cross-modal Input）"""
    type: Literal["text"] = "text"
    content: str
    sessionId: str


class SessionEndMessage(BaseModel):
    """セッション終了メッセージ"""
    type: Literal["session_end"] = "session_end"
    sessionId: str


# --- WebSocket出力メッセージ型 ---

class AsrTranscriptEvent(BaseModel):
    """ASR転写テキストイベント"""
    type: Literal["asr_transcript"] = "asr_transcript"
    text: str
    isFinal: bool = True


class NpcResponseEvent(BaseModel):
    """NPC応答テキストイベント"""
    type: Literal["npc_response"] = "npc_response"
    text: str
    generationStage: Literal["SPECULATIVE", "FINAL"] = "FINAL"


class AudioOutputEvent(BaseModel):
    """音声出力イベント"""
    type: Literal["audio_output"] = "audio_output"
    data: str  # Base64エンコードLPCM 24kHz


class SessionStatusEvent(BaseModel):
    """セッション状態イベント"""
    type: Literal["session_status"] = "session_status"
    status: Literal["active", "transitioning", "error"]
    novaSonicSessionCount: int = 1


class ErrorEvent(BaseModel):
    """エラーイベント"""
    type: Literal["error"] = "error"
    errorType: Literal[
        "SESSION_RECOVERY_FAILED",
        "MODEL_TIMEOUT",
        "CONNECTION_ERROR",
        "AUTH_ERROR",
    ]
    message: str


# --- Session Transition設定 ---

class TransitionState(str, Enum):
    """Session Transition状態"""
    ACTIVE = "active"
    MONITORING = "monitoring"
    BUFFERING = "buffering"
    HANDOFF = "handoff"
    CONVERSATION_RESUMPTION = "conversation_resumption"
    ERROR = "error"


class SessionTransitionConfig(BaseModel):
    """Session Continuation設定"""
    transition_threshold_seconds: int = 360  # 6分で監視開始
    audio_buffer_duration_seconds: int = 10  # 10秒バッファ
    audio_start_timeout_seconds: int = 100  # アシスタント発話待機
    next_session_ready_timeout_seconds: int = 30  # 次セッション準備タイムアウト
