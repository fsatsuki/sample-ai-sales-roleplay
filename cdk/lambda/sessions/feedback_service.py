"""
フィードバック生成サービス

Bedrockを使用したフィードバック生成とDynamoDBへの保存機能を提供します。
"""

import json
import time
import os
import boto3
from typing import Dict, Any, List, Optional
from aws_lambda_powertools import Logger
import boto3.dynamodb.conditions

from utils import convert_decimal_to_json_serializable, dynamodb, sessions_table
from prompts import get_analysis_prompt

# ロガー設定
logger = Logger(service="feedback-service")

# Bedrockクライアント初期化
bedrock_runtime = boto3.client('bedrock-runtime')

def generate_feedback_with_bedrock(session_id: str, metrics: Dict[str, Any], messages: List[Dict[str, Any]], goal_statuses: List[Dict[str, Any]] = None, scenario_goals: List[Dict[str, Any]] = None, language: str = "ja") -> Dict[str, Any]:
    """
    Bedrockを使用して会話のフィードバック分析を実行
    
    Args:
        session_id: セッションID
        metrics: 最終メトリクス (angerLevel, trustLevel, progressLevelなど)
        messages: 会話履歴
        goal_statuses: ゴール達成状況（オプション）
        scenario_goals: シナリオのゴール定義（オプション）
        language: 言語設定
        
    Returns:
        詳細なフィードバック分析とスコアを含む辞書
    """
    # フィードバック生成用のモデルIDを取得
    model_id = os.environ.get('BEDROCK_MODEL_FEEDBACK', 'amazon.nova-pro-v1:0')
    
    # 言語に応じたラベル設定
    if language == "en":
        user_label = "User"
        npc_label = "NPC"
    else:
        user_label = "ユーザー"
        npc_label = "NPC"
        
    conversation_text = "\n\n".join([
        f"{user_label if msg['sender'] == 'user' else npc_label}: {msg['content']}"
        for msg in messages
    ])
    
    # メトリクスのキー名のフォールバック処理
    anger_value = metrics.get('angerLevel', metrics.get('anger', 0))
    trust_value = metrics.get('trustLevel', metrics.get('trust', 0))
    progress_value = metrics.get('progressLevel', metrics.get('progress', 0))
    
    # ゴール分析セクションの作成
    goal_analysis_section = ""
    if scenario_goals and goal_statuses:
        achieved_goals = [status for status in goal_statuses if status.get('achieved', False)]
        # Decimal型をJSON対応形式に変換
        scenario_goals_json = convert_decimal_to_json_serializable(scenario_goals)
        goal_statuses_json = convert_decimal_to_json_serializable(goal_statuses)
        goal_analysis_section = f"""

## ゴール達成状況分析
- 設定ゴール数: {len(scenario_goals)}個
- 達成済みゴール: {len(achieved_goals)}個
- シナリオのゴール定義: {json.dumps(scenario_goals_json, ensure_ascii=False)}
- 現在の達成状況: {json.dumps(goal_statuses_json, ensure_ascii=False)}

**重要**: goalFeedbackセクションでは、必ず上記のシナリオのゴール定義に基づいて分析してください。
- achievedGoals: 実際に達成されたシナリオのゴールのdescriptionを記載
- partiallyAchievedGoals: 部分的に達成されたシナリオのゴールのdescriptionを記載  
- missedGoals: 未達成のシナリオのゴールのdescriptionを記載
- 一般的な営業観点ではなく、このシナリオ固有のゴールに焦点を当てる
"""
    elif scenario_goals:
        # Decimal型をJSON対応形式に変換
        scenario_goals_json = convert_decimal_to_json_serializable(scenario_goals)
        goal_analysis_section = f"""

## ゴール設定
- シナリオのゴール: {json.dumps(scenario_goals_json, ensure_ascii=False)}

**重要**: goalFeedbackセクションでは、必ず上記のシナリオのゴール定義に基づいて分析してください。
会話内容からゴール達成度を推測し、シナリオで定義された具体的なゴールのdescriptionを使用してください。
一般的な営業観点ではなく、このシナリオ固有のゴールに焦点を当てて評価してください。
"""
    
    # Converse APIのリクエストパラメータ
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "text": get_analysis_prompt(anger_value, trust_value, progress_value, conversation_text, goal_analysis_section, language)
                }
            ]
        }
    ]
    
    system = [
        {
            "text": """あなたは営業トレーニングの専門家です。

重要な出力ルール:
1. 必ず有効なJSON形式のみで出力してください
2. JSONの前後に説明文、コメント、コードブロック記号（```）は一切含めないでください
3. 出力は { で始まり } で終わる有効なJSONオブジェクトのみにしてください
4. マークダウン形式やその他の装飾は使用しないでください

出力例:
{"scores": {"overall": 75}, "strengths": ["例1"], "improvements": ["例2"]}"""
        }
    ]
    
    inference_config = {
        "maxTokens": 2000,
        "temperature": 0.2
    }
    
    try:
        logger.info("Invoking Bedrock model for feedback analysis", extra={
            "model_id": model_id,
            "session_id": session_id
        })
        
        # Converse APIでBedrockモデル呼び出し
        response = bedrock_runtime.converse(
            modelId=model_id,
            messages=messages,
            system=system,
            inferenceConfig=inference_config
        )
        
        # レスポンス解析
        output_message = response['output']['message']
        model_response = output_message['content'][0]['text']
        
        # JSONとして解析
        feedback_data = json.loads(model_response)
        
        logger.info("Successfully generated feedback with Bedrock", extra={
            "session_id": session_id,
            "overall_score": feedback_data.get("scores", {}).get("overall")
        })
        
        return feedback_data
        
    except json.JSONDecodeError as json_error:
        logger.error("Failed to parse JSON response", extra={
            "error": str(json_error),
            "response": model_response if 'model_response' in locals() else "Not available"
        })
        raise ValueError("AIの応答をJSONとして解析できませんでした")
    
    except Exception as e:
        logger.exception("Bedrock model invocation failed", extra={
            "model_id": model_id,
            "session_id": session_id,
            "error": str(e)
        })
        raise

def save_feedback_to_dynamodb(session_id: str, feedback_data: Dict[str, Any], final_metrics: Dict[str, Any], messages: List[Dict[str, Any]], goal_data: Optional[Dict[str, Any]] = None) -> bool:
    """
    フィードバックデータを固定キーで保存（更新ベース）
    
    Args:
        session_id: セッションID
        feedback_data: フィードバック分析結果
        final_metrics: 最終メトリクス
        messages: 会話履歴
        goal_data: ゴール関連データ（オプション）
        
    Returns:
        bool: 保存が成功した場合はTrue、それ以外はFalse
    """
    try:
        # セッション情報からシナリオIDを取得
        scenario_id = None
        user_id = None
        
        # セッション情報を取得
        if sessions_table:
            try:
                # まず、セッションの所有者を特定するために全ユーザーからスキャン
                session_response = sessions_table.scan(
                    FilterExpression=boto3.dynamodb.conditions.Attr('sessionId').eq(session_id)
                )
                
                session_items = session_response.get('Items', [])
                if session_items:
                    session_info = session_items[0]
                    scenario_id = session_info.get('scenarioId')
                    user_id = session_info.get('userId')
                    
                    logger.info("セッション情報を取得しました", extra={
                        "session_id": session_id,
                        "scenario_id": scenario_id,
                        "user_id": user_id
                    })
            except Exception as session_error:
                logger.warning("セッション情報の取得に失敗しました", extra={
                    "error": str(session_error),
                    "session_id": session_id
                })
        
        # 環境変数からテーブル名を取得
        table_name = os.environ.get('SESSION_FEEDBACK_TABLE', 'dev-AISalesRolePlay-SessionFeedback')
        
        table = dynamodb.Table(table_name)
        
        # TTLの設定（180日後に自動削除）
        ttl = int(time.time()) + (180 * 24 * 60 * 60)
        current_timestamp = time.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        
        # 総合スコアを取得
        overall_score = feedback_data.get("scores", {}).get("overall", 0)
        
        # 保存するデータを作成（固定ソートキーを使用）
        item = {
            "sessionId": session_id,
            "createdAt": current_timestamp,  # タイムスタンプをソートキーとして使用
            "dataType": "final-feedback",
            "feedbackData": feedback_data,
            "finalMetrics": final_metrics,
            "messageCount": len(messages),
            "updatedAt": current_timestamp,  # 実際の更新時刻
            "expireAt": ttl,
            "overallScore": overall_score  # GSIのソートキー用に総合スコアを追加
        }
        
        # シナリオIDとユーザーIDがある場合は追加
        if scenario_id:
            item["scenarioId"] = scenario_id  # GSIのパーティションキー用
        
        if user_id:
            item["userId"] = user_id  # ユーザー情報も保存
        
        # ゴールデータがある場合は追加
        if goal_data:
            item["goalResults"] = goal_data
            logger.info("ゴールデータも含めて保存します", extra={
                "session_id": session_id,
                "goal_score": goal_data.get("goalScore", 0),
                "goal_statuses_count": len(goal_data.get("goalStatuses", []))
            })
        
        # DynamoDBに保存（既存があれば上書き）
        table.put_item(Item=item)
        
        logger.info("フィードバックデータを保存しました", extra={
            "session_id": session_id,
            "scenario_id": scenario_id,
            "overall_score": overall_score,
            "message_count": len(messages),
            "has_goal_data": bool(goal_data),
            "updated_at": current_timestamp
        })
        
        return True
        
    except Exception as e:
        logger.error("フィードバックデータの保存に失敗しました", extra={
            "error": str(e),
            "session_id": session_id
        })
        return False