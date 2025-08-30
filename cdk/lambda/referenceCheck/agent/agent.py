import os
from strands import Agent
from strands.models import BedrockModel
from aws_lambda_powertools import Logger
from botocore.config import Config as BotocoreConfig
from agent.tools import check_single_message_reference
from agent.types import QueryKnowledgeBaseOutput

BEDROCK_MODEL_REFERENCE_CHECK = os.environ.get("BEDROCK_MODEL_REFERENCE_CHECK")
REGION = os.environ["AWS_REGION"]

# ロガー
logger = Logger(service="referenceCheck-agent")

# Create a BedrockModel
boto_config = BotocoreConfig(
    retries={"max_attempts": 3, "mode": "standard"},
    connect_timeout=5,
    read_timeout=300,
)

bedrock_model = BedrockModel(
    model_id=BEDROCK_MODEL_REFERENCE_CHECK,
    region_name=REGION,
    system_prompt="日本語で回答します",
    boto_client_config=boto_config,
)


def call_agent(
    user_message: str, context: str, scenario_id: str
) -> QueryKnowledgeBaseOutput:
    """
    Strands Agentを使用してリファレンスチェックを実行する

    Args:
      user_message: ユーザーのメッセージ
      context: 会話のコンテキスト
      scenario_id: シナリオID

    Returns:
      リファレンスチェック結果の辞書
    """
    try:
        # 検索用プロンプト（単一メッセージ用）
        prompt = f"""
以下のユーザーの発言について、Knowledge Baseを参照して内容の正確性を検証してください。
ドキュメントに記載の内容と矛盾する内容があれば指摘してください。

## シナリオID
{scenario_id}

## 会話のコンテキスト
{context}

## 検証対象のメッセージ
{user_message}

## 指摘の例
- ユーザーは「住宅ローン金利は2-3%です」と説明したが、ドキュメントには「1%」と記載されている。
- ユーザーは団体信用生命保険の説明で「表皮ガンと診断されても保険金が出る」と説明したが、ドキュメントには「表皮ガンは対象外」と記載されている。
- ユーザーは夏のエアコンの消費電力について「0.2kWh程度」と説明したが、ドキュメントを参照すると、これは室温が設定温度になった場合の維持運転の場合の例であって、猛暑日にエアコンの電源を入れた直後の消費電力は1kWhである。説明が不足している。

## ツール
check_single_message_reference: Knowledge Baseのクエリが可能。ユーザー発言の根拠となるドキュメントを検索します。

## 処理ステップ
1. 会話のコンテキストを理解して、何についての会話が行われているかを理解する
2. 会話のコンテキストを踏まえて、ユーザーの発言の意図を理解する
3. 「検証対象のメッセージ」の根拠となるドキュメントを「check_single_message_reference」のツールで調査する
4. ツールの結果を踏まえて、「検証対象のメッセージ」の妥当性を評価する

## 出力要件
以下の4つのフィールドを必ず含む構造化された出力を生成してください
- message: 検証対象のユーザーメッセージ
- relatedDocument: ユーザーの発言とドキュメントに記載されている内容の矛盾の根拠を引用する。矛盾がない場合は空文字列。
- reviewComment: 指摘事項を理由をつけて説明する。問題がない場合は空文字列。
- related: ユーザーのメッセージがドキュメントの根拠と比較して適切か。一部でも不適切であればfalseとする。（true/false）

注意: 必ず上記の4つのフィールドを含む構造化された出力を生成してください。
"""

        logger.debug(f"prompt: {prompt}")

        agent = Agent(
            tools=[check_single_message_reference],
            model=bedrock_model,
        )

        agent(prompt)

        result = agent.structured_output(
            QueryKnowledgeBaseOutput,
            """
			以下の4つのフィールドを必ず含む構造化された出力を生成してください
			- message: 検証対象のユーザーメッセージ
			- relatedDocument: ユーザーの発言とドキュメントに記載されている内容の矛盾の根拠を引用する。矛盾がない場合は空文字列。
			- reviewComment: 指摘事項を理由をつけて説明する。問題がない場合は空文字列。
			- related: ドキュメントに関連する内容かどうか（true/false）
			""",
        )

        return result

    except Exception as e:
        logger.error(f"Error in call_agent: {str(e)}")
        raise e
