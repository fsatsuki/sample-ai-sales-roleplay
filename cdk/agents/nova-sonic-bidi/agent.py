"""
Nova 2 Sonic BidiAgent エントリーポイント

BedrockAgentCoreApp + Strands BidiAgent構成。
最初のメッセージでセッション設定を受け取り、NPCのシステムプロンプトを生成。
その後websocket.receive_json / websocket.send_json を直接I/Oとして使用。
AgentCore Memoryに会話ログを自動保存（セッション分析で使用）。
Conversation Resumption: 7分でBidiAgentを再起動し、8分制限を超えて会話を継続。
"""

import json
import os
import time
import asyncio
import logging
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from starlette.websockets import WebSocket, WebSocketDisconnect

from strands.experimental.bidi.agent import BidiAgent
from strands.experimental.bidi.models.nova_sonic import BidiNovaSonicModel

from prompts import build_npc_system_prompt, get_default_npc_info, get_default_emotion_params

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-2-sonic-v1:0")
AWS_REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-west-2"))
AGENTCORE_MEMORY_ID = os.environ.get("AGENTCORE_MEMORY_ID", "")
# セッション切り替え閾値（秒）。Nova Sonicの8分制限に対して余裕を持たせる
SESSION_TRANSITION_SECONDS = int(os.environ.get("SESSION_TRANSITION_THRESHOLD_SECONDS", "420"))

app = BedrockAgentCoreApp()


def create_session_manager(session_id: str, actor_id: str = "default_user"):
    """AgentCore Memory SessionManagerを作成（会話ログ自動保存用）"""
    if not AGENTCORE_MEMORY_ID:
        logger.warning("[Server] AGENTCORE_MEMORY_ID未設定、Memory連携なし")
        return None
    try:
        from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
        from bedrock_agentcore.memory.integrations.strands.session_manager import (
            AgentCoreMemorySessionManager,
        )

        config = AgentCoreMemoryConfig(
            memory_id=AGENTCORE_MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
        )
        sm = AgentCoreMemorySessionManager(
            agentcore_memory_config=config,
            region_name=AWS_REGION,
        )
        logger.info(f"[Server] SessionManager作成: memory={AGENTCORE_MEMORY_ID}, session={session_id}")
        return sm
    except ImportError as e:
        logger.warning(f"[Server] AgentCore Memory SDK未インストール: {e}")
        return None
    except Exception as e:
        logger.error(f"[Server] SessionManager作成エラー: {e}")
        return None


def get_conversation_history(session_id: str, actor_id: str = "default_user"):
    """AgentCore Memoryから会話履歴を取得し、Strands Messages形式に変換"""
    if not AGENTCORE_MEMORY_ID:
        return []
    try:
        from bedrock_agentcore.memory import MemoryClient

        client = MemoryClient(region_name=AWS_REGION)
        events = client.list_events(
            memory_id=AGENTCORE_MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
            max_results=200,
        )
        if not events:
            return []

        messages = []
        for event in events:
            payload_list = event.get("payload", [])
            for payload_item in payload_list:
                conversational = payload_item.get("conversational", {})
                if not conversational:
                    continue
                role_raw = conversational.get("role", "").upper()
                content_obj = conversational.get("content", {})
                text = content_obj.get("text", "") if isinstance(content_obj, dict) else ""

                # JSON文字列の場合はパース
                if text.startswith("{"):
                    try:
                        parsed = json.loads(text)
                        text = parsed.get("content", text)
                    except (json.JSONDecodeError, TypeError):
                        pass

                if not text.strip():
                    continue

                role = "user" if role_raw in ("USER", "HUMAN") else "assistant"
                messages.append({"role": role, "content": [{"text": text}]})

        logger.info(f"[Server] Memory履歴取得: {len(messages)}件")
        return messages
    except Exception as e:
        logger.error(f"[Server] Memory履歴取得エラー: {e}")
        return []


def create_bidi_model(sensitivity: str = "MEDIUM"):
    """BidiNovaSonicModelを作成"""
    return BidiNovaSonicModel(
        model_id=MODEL_ID,
        client_config={"region": AWS_REGION},
        provider_config={
            "audio": {"input_rate": 16000, "output_rate": 24000},
            "session": {"endpointing_sensitivity": sensitivity},
        },
    )


@app.websocket
async def websocket_handler(websocket: WebSocket, context):
    await websocket.accept()
    logger.info("[Server] WebSocket connected")

    # 最初のメッセージでセッション設定を受け取る
    system_prompt = "あなたは日本語で応答するアシスタントです。"
    sensitivity = "MEDIUM"
    session_id = ""

    try:
        first_msg = await websocket.receive_json()
        logger.info(f"[Server] First message: {json.dumps(first_msg, ensure_ascii=False)[:200]}")

        if first_msg.get("type") == "session_config":
            npc_config = first_msg.get("npcConfig", {})
            scenario_description = first_msg.get("scenarioDescription", "")
            language = first_msg.get("language", "ja")
            sensitivity = first_msg.get("endpointingSensitivity", "MEDIUM")
            session_id = first_msg.get("sessionId", "")

            npc_info = npc_config if npc_config else get_default_npc_info()
            emotion_params = get_default_emotion_params()
            system_prompt = build_npc_system_prompt(
                npc_info=npc_info,
                emotion_params=emotion_params,
                language=language,
                scenario_description=scenario_description,
            )
            logger.info(f"[Server] System prompt generated ({len(system_prompt)} chars)")

            await websocket.send_json({
                "type": "session_status",
                "status": "active",
                "novaSonicSessionCount": 1,
            })
        else:
            logger.info("[Server] No session_config, using default prompt")
    except Exception as e:
        logger.error(f"[Server] Error reading first message: {e}")

    # Conversation Resumptionループ
    # 各BidiAgentセッションは最大SESSION_TRANSITION_SECONDS秒で切り替え
    nova_session_count = 0
    client_disconnected = False

    while not client_disconnected:
        nova_session_count += 1
        logger.info(f"[Server] === Nova Sonic session #{nova_session_count} starting ===")

        # SessionManager作成（会話ログ自動保存）
        session_manager = None
        if session_id:
            session_manager = create_session_manager(session_id)

        # 会話履歴を取得（2回目以降のセッション）
        history_messages = []
        if nova_session_count > 1 and session_id:
            history_messages = get_conversation_history(session_id)
            logger.info(f"[Server] Resuming with {len(history_messages)} history messages")

        # BidiAgent作成
        model = create_bidi_model(sensitivity)
        agent_kwargs = {
            "model": model,
            "tools": [],
            "system_prompt": system_prompt,
        }
        if history_messages:
            agent_kwargs["messages"] = history_messages
        if session_manager:
            agent_kwargs["session_manager"] = session_manager

        agent = BidiAgent(**agent_kwargs)

        # セッション切り替え通知
        if nova_session_count > 1:
            try:
                await websocket.send_json({
                    "type": "session_status",
                    "status": "active",
                    "novaSonicSessionCount": nova_session_count,
                })
            except Exception:
                break

        # タイムアウト付きでagent.run()を実行
        session_start_time = time.time()

        try:
            await asyncio.wait_for(
                agent.run(
                    inputs=[websocket.receive_json],
                    outputs=[websocket.send_json],
                ),
                timeout=SESSION_TRANSITION_SECONDS,
            )
            # agent.run()が正常終了 = クライアント切断
            logger.info(f"[Server] Session #{nova_session_count} completed normally")
            client_disconnected = True

        except asyncio.TimeoutError:
            elapsed = time.time() - session_start_time
            logger.info(f"[Server] Session #{nova_session_count} timeout after {elapsed:.0f}s, transitioning...")

            # BidiAgentを停止（Memoryにフラッシュ）
            try:
                await agent.stop()
            except Exception as e:
                logger.warning(f"[Server] Agent stop error: {e}")

            # SessionManagerのバッファをフラッシュ
            if session_manager:
                try:
                    session_manager.close()
                    logger.info("[Server] SessionManager flushed before transition")
                except Exception as e:
                    logger.warning(f"[Server] SessionManager close error: {e}")

            # 切り替え中通知
            try:
                await websocket.send_json({
                    "type": "session_status",
                    "status": "transitioning",
                    "novaSonicSessionCount": nova_session_count,
                })
            except Exception:
                client_disconnected = True
                break

            # 少し待ってから次のセッションへ
            await asyncio.sleep(0.5)
            continue

        except WebSocketDisconnect:
            logger.info(f"[Server] Client disconnected during session #{nova_session_count}")
            client_disconnected = True

        except Exception as e:
            logger.error(f"[Server] Session #{nova_session_count} error: {e}")
            import traceback
            traceback.print_exc()
            client_disconnected = True

        finally:
            # agent.run()が正常終了またはエラーの場合のクリーンアップ
            if client_disconnected:
                try:
                    await agent.stop()
                except Exception:
                    pass
                if session_manager:
                    try:
                        session_manager.close()
                    except Exception:
                        pass

    # WebSocket接続を閉じる
    logger.info(f"[Server] All sessions done. Total Nova Sonic sessions: {nova_session_count}")
    try:
        await websocket.close()
    except Exception:
        pass
    logger.info("[Server] Done")


if __name__ == "__main__":
    app.run()
