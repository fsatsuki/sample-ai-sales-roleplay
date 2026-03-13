"""
Nova 2 Sonic セッションマネージャー

aws_sdk_bedrock_runtimeを使用してNova Sonicと直接双方向ストリーミングを行う。
ワークショップサンプルベース。
"""
import asyncio
import json
import uuid
import logging
import warnings

from s2s_events import S2sEvent
from aws_sdk_bedrock_runtime.client import (
    BedrockRuntimeClient,
    InvokeModelWithBidirectionalStreamOperationInput,
)
from aws_sdk_bedrock_runtime.models import (
    InvokeModelWithBidirectionalStreamInputChunk,
    BidirectionalInputPayloadPart,
)
from aws_sdk_bedrock_runtime.config import Config

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)


class S2sSessionManager:
    """Nova Sonic双方向ストリーミングセッション管理"""

    def __init__(self, region, model_id="amazon.nova-2-sonic-v1:0"):
        self.model_id = model_id
        self.region = region

        # キュー
        self.audio_input_queue: asyncio.Queue = asyncio.Queue()
        self.output_queue: asyncio.Queue = asyncio.Queue()

        self.response_task = None
        self.audio_task = None
        self.stream = None
        self.is_active = False
        self.bedrock_client = None

        # セッション情報
        self.prompt_name = None
        self.audio_content_name = None

    def _initialize_client(self):
        """Bedrockクライアントを初期化（boto3経由で認証情報を取得）"""
        import boto3
        from smithy_aws_core.identity import AWSCredentialsIdentity

        class BotoCredentialsResolver:
            """boto3のデフォルト認証チェーンを使用するカスタムリゾルバー"""
            def __init__(self, region):
                self._region = region

            async def resolve_identity(self, *, identity_properties=None):
                session = boto3.Session(region_name=self._region)
                creds = session.get_credentials().get_frozen_credentials()
                return AWSCredentialsIdentity(
                    access_key_id=creds.access_key,
                    secret_access_key=creds.secret_key,
                    session_token=creds.token,
                )

        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=BotoCredentialsResolver(self.region),
        )
        self.bedrock_client = BedrockRuntimeClient(config=config)
        logger.info("Bedrockクライアント初期化完了")

    async def initialize_stream(self):
        """双方向ストリームを初期化"""
        if not self.bedrock_client:
            self._initialize_client()

        self.stream = await self.bedrock_client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
        )
        self.is_active = True

        # レスポンス処理タスク開始
        self.response_task = asyncio.create_task(self._process_responses())
        # 音声入力処理タスク開始
        self.audio_task = asyncio.create_task(self._process_audio_input())

        await asyncio.sleep(0.1)
        logger.info("Nova Sonicストリーム初期化完了")

    async def setup_session(self, system_prompt: str, voice_id: str = "tomo"):
        """セッション開始イベントを送信"""
        self.prompt_name = str(uuid.uuid4())
        self.audio_content_name = str(uuid.uuid4())

        # 音声出力設定
        audio_output_config = {
            **S2sEvent.DEFAULT_AUDIO_OUTPUT_CONFIG,
            "voiceId": voice_id,
        }

        # 1. sessionStart
        await self.send_raw_event(S2sEvent.session_start())

        # 2. promptStart
        await self.send_raw_event(S2sEvent.prompt_start(self.prompt_name, audio_output_config))

        # 3. systemPrompt (contentStart → textInput → contentEnd)
        text_content_name = str(uuid.uuid4())
        await self.send_raw_event(
            S2sEvent.content_start_text(self.prompt_name, text_content_name, interactive=False, role="SYSTEM")
        )
        await self.send_raw_event(
            S2sEvent.text_input(self.prompt_name, text_content_name, system_prompt)
        )
        await self.send_raw_event(
            S2sEvent.content_end(self.prompt_name, text_content_name)
        )

        # 4. audioContentStart（音声ストリーム開始）
        await self.send_raw_event(
            S2sEvent.content_start_audio(self.prompt_name, self.audio_content_name)
        )

        logger.info(f"セッションセットアップ完了: prompt={self.prompt_name}")

    async def send_raw_event(self, event_data):
        """生イベントをBedrockストリームに送信"""
        if not self.stream or not self.is_active:
            return
        event_json = json.dumps(event_data)
        event = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=event_json.encode("utf-8"))
        )
        await self.stream.input_stream.send(event)

    def add_audio_chunk(self, audio_base64: str):
        """音声チャンクをキューに追加"""
        self.audio_input_queue.put_nowait({
            "prompt_name": self.prompt_name,
            "content_name": self.audio_content_name,
            "audio_data": audio_base64,
        })

    async def send_text(self, text: str):
        """テキスト入力を送信（cross-modal input）"""
        content_name = str(uuid.uuid4())
        await self.send_raw_event(
            S2sEvent.content_start_text(self.prompt_name, content_name, interactive=True, role="USER")
        )
        await self.send_raw_event(
            S2sEvent.text_input(self.prompt_name, content_name, text)
        )
        await self.send_raw_event(
            S2sEvent.content_end(self.prompt_name, content_name)
        )
        logger.info(f"テキスト送信: '{text[:50]}'")

    async def _process_audio_input(self):
        """キューから音声データを取り出してBedrockに送信"""
        while self.is_active:
            try:
                data = await asyncio.wait_for(self.audio_input_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            try:
                audio_event = S2sEvent.audio_input(
                    data["prompt_name"],
                    data["content_name"],
                    data["audio_data"],
                )
                await self.send_raw_event(audio_event)
            except Exception as e:
                logger.error(f"音声送信エラー: {e}")

    async def _process_responses(self):
        """Bedrockからのレスポンスを処理してoutput_queueに入れる"""
        while self.is_active:
            try:
                output = await self.stream.await_output()
                result = await output[1].receive()

                if result.value and result.value.bytes_:
                    response_data = result.value.bytes_.decode("utf-8")
                    json_data = json.loads(response_data)

                    # output_queueに入れてフロントエンドに転送
                    await self.output_queue.put(json_data)

            except StopAsyncIteration:
                logger.info("レスポンスストリーム終了")
                break
            except json.JSONDecodeError as e:
                logger.error(f"JSON解析エラー: {e}")
            except Exception as e:
                error_str = str(e)
                if "ValidationException" in error_str:
                    logger.error(f"バリデーションエラー: {error_str}")
                else:
                    logger.error(f"レスポンス処理エラー: {e}")
                break

        self.is_active = False

    async def close(self):
        """セッションを閉じる"""
        if not self.is_active:
            return
        self.is_active = False

        # キュークリア
        while not self.audio_input_queue.empty():
            try:
                self.audio_input_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        if self.stream:
            try:
                await self.stream.input_stream.close()
            except Exception as e:
                logger.debug(f"ストリームクローズエラー: {e}")

        if self.response_task and not self.response_task.done():
            self.response_task.cancel()
            try:
                await self.response_task
            except asyncio.CancelledError:
                pass

        if self.audio_task and not self.audio_task.done():
            self.audio_task.cancel()
            try:
                await self.audio_task
            except asyncio.CancelledError:
                pass

        self.stream = None
        logger.info("セッションクローズ完了")
