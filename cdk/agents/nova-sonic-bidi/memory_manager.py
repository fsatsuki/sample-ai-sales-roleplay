"""
AgentCore Memory連携

会話履歴保存（ASR転写 + NPC応答テキスト）、メトリクス保存、
セッションメタデータ保存、ListEvents APIによる履歴取得を行う。
"""

import os
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

AGENTCORE_MEMORY_ID = os.environ.get('AGENTCORE_MEMORY_ID', '')
AWS_REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))


class MemoryManager:
    """AgentCore Memoryとの連携を管理"""

    def __init__(self, session_id: str, actor_id: str = "nova-sonic-bidi"):
        self.session_id = session_id
        self.actor_id = actor_id
        self.memory_id = AGENTCORE_MEMORY_ID
        self._client = None

    def _get_client(self):
        """AgentCore Memory クライアントを遅延初期化"""
        if self._client is not None:
            return self._client

        if not self.memory_id:
            logger.warning("AGENTCORE_MEMORY_ID未設定、Memory機能無効")
            return None

        try:
            from bedrock_agentcore.memory.client import AgentCoreMemoryClient
            self._client = AgentCoreMemoryClient(
                memory_id=self.memory_id,
                region_name=AWS_REGION,
            )
            logger.info(f"AgentCore Memory初期化完了: session={self.session_id}")
            return self._client
        except ImportError:
            logger.warning("bedrock_agentcore.memory パッケージが利用不可")
            return None
        except Exception as e:
            logger.error(f"AgentCore Memory初期化エラー: {e}")
            return None

    async def save_conversation_event(
        self, role: str, text: str, event_type: str = "conversation"
    ) -> None:
        """会話イベントを保存（ASR転写テキスト or NPC応答テキスト）"""
        client = self._get_client()
        if not client:
            return

        try:
            client.create_event(
                session_id=self.session_id,
                actor_id=self.actor_id,
                event_type=event_type,
                payload={
                    "role": role,
                    "text": text,
                },
            )
            logger.debug(f"会話イベント保存: role={role}, len={len(text)}")
        except Exception as e:
            logger.error(f"会話イベント保存エラー: {e}")

    async def save_session_metadata(
        self,
        nova_sonic_session_count: int,
        endpointing_sensitivity: str,
    ) -> None:
        """セッションメタデータを保存"""
        client = self._get_client()
        if not client:
            return

        try:
            client.create_event(
                session_id=self.session_id,
                actor_id=self.actor_id,
                event_type="session_metadata",
                payload={
                    "nova_sonic_session_count": nova_sonic_session_count,
                    "endpointing_sensitivity": endpointing_sensitivity,
                },
            )
            logger.debug(f"セッションメタデータ保存: count={nova_sonic_session_count}")
        except Exception as e:
            logger.error(f"メタデータ保存エラー: {e}")

    def list_conversation_events(self) -> List[Dict[str, Any]]:
        """会話履歴を取得（Conversation Resumption用）"""
        client = self._get_client()
        if not client:
            return []

        try:
            events = client.list_events(
                session_id=self.session_id,
                actor_id=self.actor_id,
            )
            # conversationタイプのイベントのみフィルタ
            conversation_events = []
            for event in events:
                payload = event.get("payload", {})
                if isinstance(payload, dict) and payload.get("role"):
                    conversation_events.append(payload)
            logger.info(f"会話履歴取得: {len(conversation_events)}件")
            return conversation_events
        except Exception as e:
            logger.error(f"会話履歴取得エラー: {e}")
            return []
