import json
import os
from strands import tool
from aws_lambda_powertools import Logger
import boto3

KNOWLEDGE_BASE_ID = os.environ.get("KNOWLEDGE_BASE_ID")

bedrock_agent_runtime = boto3.client("bedrock-agent-runtime")

# ロガー
logger = Logger(service="referenceCheck-agent-tool")


@tool
def check_single_message_reference(scenario_id: str, query: str) -> str:
    """
    単一のユーザーメッセージに対してリファレンスチェックを実行する
    この関数は、指定されたシナリオIDに関連するナレッジベースを検索し、
    ユーザーの発言内容が参考文書と矛盾していないかを検証します。
    Bedrock Agent Runtimeのretrieve APIを使用して、
    関連ドキュメントを検索し、結果を文字列で返します。

    Args:
      scenario_id: シナリオID
      query: 検索クエリ

    Returns:
      検索結果のテキスト
    """

    logger.debug(f"check_single_message_reference start")
    # 指定されたシナリオIDに一致するドキュメントのみを検索対象とする
    filter = {
        "equals": {"key": "scenarioId", "value": scenario_id},
    }

    try:
        # retrieveは検索のみを行うAPIエンドポイント
        response = bedrock_agent_runtime.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={"text": query},
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "filter": filter,
                    "numberOfResults": 10,
                },
            },
        )

        # 検索結果を整形
        results = response.get("retrievalResults", [])
        logger.debug(f"kb retrieve results: {results}")
        if not results:
            return "Knowledge Baseで関連するドキュメントが見つかりませんでした。一般的な営業知識に基づいて評価してください。"

        # すべての結果を結合
        return json.dumps(results)

    except Exception as e:
        print(f"単一メッセージのリファレンスチェック中にエラー: {str(e)}")
        return f"リファレンスチェック中にエラーが発生しました: {str(e)}"
