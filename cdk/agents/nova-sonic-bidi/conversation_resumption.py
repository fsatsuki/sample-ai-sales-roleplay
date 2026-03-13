"""
Conversation Resumptionリカバリ

Session Continuation失敗時やModelTimeoutException発生時に、
AgentCore Memory ListEvents APIで会話履歴を取得し、
新セッション作成 + 履歴テキスト再送信でリカバリする。
最大1回リトライ。
"""

import logging
from typing import Optional, Callable, Awaitable, Any

from memory_manager import MemoryManager

logger = logging.getLogger(__name__)


class ConversationResumption:
    """Conversation Resumptionによるセッションリカバリ"""

    def __init__(
        self,
        memory_manager: MemoryManager,
        create_nova_sonic_session: Callable[..., Awaitable[Any]],
        send_error_to_frontend: Callable[[str, str], Awaitable[None]],
    ):
        self._memory = memory_manager
        self._create_session = create_nova_sonic_session
        self._send_error = send_error_to_frontend

    async def resume(
        self,
        system_prompt: str,
        endpointing_sensitivity: str = "MEDIUM",
    ) -> Optional[Any]:
        """
        Conversation Resumptionを実行（最大1回リトライ）

        Returns:
            新しいセッションオブジェクト（成功時）、None（失敗時）
        """
        logger.info("Conversation Resumption開始")
        try:
            history = self._memory.list_conversation_events()
            logger.info(f"会話履歴取得完了: {len(history)}件")

            new_session = await self._create_session(
                system_prompt=system_prompt,
                endpointing_sensitivity=endpointing_sensitivity,
                conversation_history=history,
            )
            logger.info("Conversation Resumption成功")
            return new_session

        except Exception as e:
            logger.error(f"Conversation Resumption失敗: {e}")
            await self._send_error(
                "SESSION_RECOVERY_FAILED",
                "セッションの復旧に失敗しました。再度お試しください。",
            )
            return None
