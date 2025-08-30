"""
セッション完全データ関連のAPIハンドラー

セッション完全データ取得などの機能を提供します。
"""

import os
import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.event_handler.exceptions import (
    InternalServerError, NotFoundError, BadRequestError
)
import boto3.dynamodb.conditions

from utils import get_user_id_from_event, sessions_table, messages_table, scenarios_table, dynamodb
from feedback_service import generate_feedback_with_bedrock, save_feedback_to_dynamodb

# ロガー設定
logger = Logger(service="complete-data-handlers")

def register_complete_data_routes(app: APIGatewayRestResolver):
    """
    セッション完全データ関連のルートを登録
    
    Args:
        app: APIGatewayRestResolverインスタンス
    """
    
    @app.get("/sessions/<session_id>/complete-data")
    def get_session_complete_data(session_id: str):
        """
        セッション完全データ取得APIエンドポイント
        ResultPageで使用する全データを一括取得
        """
        try:
            logger.info("Processing get session complete data request", extra={
                "session_id": session_id
            })
            
            # バリデーション
            if not session_id:
                raise BadRequestError("セッションIDは必須です")
            
            # ユーザーIDを取得
            user_id = get_user_id_from_event(app)
            
            # 各テーブル名を取得
            session_feedback_table_name = os.environ.get('SESSION_FEEDBACK_TABLE', 'dev-AISalesRolePlay-SessionFeedback')

            # セッション基本情報を取得
            if not sessions_table:
                raise InternalServerError("セッションテーブル未定義")
                
            session_response = sessions_table.scan(
                FilterExpression=boto3.dynamodb.conditions.Attr('sessionId').eq(session_id) & 
                               boto3.dynamodb.conditions.Attr('userId').eq(user_id)
            )
            
            session_items = session_response.get('Items', [])
            if not session_items:
                raise NotFoundError("指定されたセッションが見つかりません")
            
            session_info = session_items[0]
            
            # メッセージ履歴を取得
            if not messages_table:
                raise InternalServerError("メッセージテーブル未定義")
                
            messages_response = messages_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
                ScanIndexForward=True  # 時系列順
            )
            
            messages = messages_response.get('Items', [])
            
            # フィードバックデータとリアルタイムメトリクスを取得
            feedback_table = dynamodb.Table(session_feedback_table_name)
            feedback_response = feedback_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
                ScanIndexForward=False  # 降順ソート（最新が先頭）
            )
            
            feedback_items = feedback_response.get('Items', [])
            
            # データを分類（最新の個別レコード形式のみサポート）
            final_feedback = None
            realtime_metrics = []
            
            for item in feedback_items:
                data_type = item.get('dataType')
                
                if data_type == 'final-feedback':
                    # 最終フィードバック
                    final_feedback = item
                elif data_type == 'realtime-metrics':
                    # リアルタイムメトリクス（個別レコード）
                    realtime_metrics.append(item)
            
            # シナリオゴール定義を取得
            scenario_goals = []
            scenario_id = session_info.get('scenarioId')
            if scenario_id:
                try:
                    if scenarios_table:
                        scenario_response = scenarios_table.get_item(
                            Key={'scenarioId': scenario_id}
                        )
                        
                        scenario_data = scenario_response.get('Item')
                        if scenario_data and scenario_data.get('goals'):
                            scenario_goals = scenario_data['goals']
                            logger.info("シナリオゴール定義を取得しました", extra={
                                "session_id": session_id,
                                "scenario_id": scenario_id,
                                "goals_count": len(scenario_goals)
                            })
                            
                except Exception as e:
                    logger.warning("シナリオゴール定義の取得に失敗しました", extra={
                        "error": str(e),
                        "session_id": session_id,
                        "scenario_id": scenario_id
                    })
            
            # コンプライアンス違反データを取得（リアルタイムメトリクスから統合）
            compliance_violations = []
            try:
                # リアルタイムメトリクスからコンプライアンス違反を抽出（重複除去なし）
                for metric in realtime_metrics:
                    if metric.get('complianceData') and metric['complianceData'].get('violations'):
                        compliance_violations.extend(metric['complianceData']['violations'])
                
                if compliance_violations:
                    logger.debug("リアルタイムメトリクスからコンプライアンス違反を統合しました", extra={
                        "session_id": session_id,
                        "violations_count": len(compliance_violations)
                    })
                    
            except Exception as e:
                logger.warning("コンプライアンス違反データの統合に失敗しました", extra={
                    "session_id": session_id,
                    "error": str(e)
                })
            
            # シナリオ情報から言語を取得（ビデオ分析でも使用）
            language = "ja"  # デフォルト値
            if session_info and 'scenarioId' in session_info:
                scenario_id = session_info['scenarioId']
                try:
                    if scenarios_table:
                        scenario_response = scenarios_table.get_item(
                            Key={'scenarioId': scenario_id}
                        )
                        
                        scenario_data = scenario_response.get('Item')
                        if scenario_data and 'language' in scenario_data:
                            language = scenario_data['language']
                            logger.info(f"シナリオ言語を検出: {language}", extra={
                                "session_id": session_id,
                                "scenario_id": scenario_id,
                                "language": language
                            })
                except Exception as e:
                    logger.warning(f"シナリオ言語の取得に失敗: {str(e)}")
            
            # レスポンスデータを構築
            response_data = {
                "success": True,
                "sessionId": session_id,
                "sessionInfo": session_info,
                "messages": messages,
                "realtimeMetrics": realtime_metrics,
                "complianceViolations": compliance_violations
            }
            
            # ゴール結果データを構築
            goal_statuses = []
            goal_score = 0
            
            # まず最新のリアルタイムメトリクスからゴール情報を取得
            if realtime_metrics:
                # DynamoDBから既に最新順（ScanIndexForward=False）で取得しているため、
                # 配列の先頭が最新データになっている
                for metric in realtime_metrics:
                    if "goalStatuses" in metric:
                        goal_statuses = metric["goalStatuses"]
                        goal_score = int(metric.get("goalScore", 0))
                        logger.debug("最新のリアルタイムメトリクスからゴール状況を取得", extra={
                            "session_id": session_id,
                            "metric_timestamp": metric.get("createdAt"),
                            "goal_statuses_count": len(goal_statuses)
                        })
                        break
            
            # フィードバック処理（存在しない場合は自動生成）
            if final_feedback:
                # 既存のフィードバックを使用
                response_data["feedback"] = final_feedback.get("feedbackData")
                response_data["finalMetrics"] = final_feedback.get("finalMetrics")
                response_data["feedbackCreatedAt"] = final_feedback.get("createdAt")
                    
                logger.info("既存フィードバックを使用します", extra={
                    "session_id": session_id,
                    "feedback_score": final_feedback.get("feedbackData", {}).get("scores", {}).get("overall")
                })
            else:
                # フィードバックが存在しない場合は自動生成
                logger.info("フィードバックが存在しないため自動生成を開始します", extra={
                    "session_id": session_id,
                    "messages_count": len(messages)
                })
                
                try:
                    # 最終メトリクスを構築
                    final_metrics_for_feedback = {"angerLevel": 1, "trustLevel": 1, "progressLevel": 1}
                    if realtime_metrics:
                        latest_metric = realtime_metrics[-1]
                        final_metrics_for_feedback = {
                            "angerLevel": int(latest_metric.get("angerLevel", 1)),
                            "trustLevel": int(latest_metric.get("trustLevel", 1)),
                            "progressLevel": int(latest_metric.get("progressLevel", 1)),
                            "analysis": latest_metric.get("analysis", "")
                        }
                    
                    # リアルタイムメトリクスからゴール状況を事前に取得
                    temp_goal_statuses = []
                    temp_goal_score = 0
                    if realtime_metrics:
                        for metric in realtime_metrics:
                            if "goalStatuses" in metric:
                                temp_goal_statuses = metric["goalStatuses"]
                                temp_goal_score = int(metric.get("goalScore", 0))
                                break
                    
                    # フィードバック生成を実行
                    feedback_data = generate_feedback_with_bedrock(
                        session_id=session_id,
                        metrics=final_metrics_for_feedback,
                        messages=messages,
                        goal_statuses=temp_goal_statuses,
                        scenario_goals=scenario_goals,
                        language=language
                    )
                    
                    # ゴールデータを構築
                    goal_data = None
                    if temp_goal_statuses or scenario_goals:
                        goal_data = {
                            "goalStatuses": temp_goal_statuses,
                            "scenarioGoals": scenario_goals,
                            "goalScore": feedback_data.get("scores", {}).get("goalAchievement", 0) * 10 if feedback_data.get("scores", {}).get("goalAchievement") else temp_goal_score
                        }
                    
                    # 生成したフィードバックをDynamoDBに保存
                    save_success = save_feedback_to_dynamodb(
                        session_id=session_id,
                        feedback_data=feedback_data,
                        final_metrics=final_metrics_for_feedback,
                        messages=messages,
                        goal_data=goal_data
                    )
                    
                    if save_success:
                        logger.info("フィードバック自動生成と保存が完了しました", extra={
                            "session_id": session_id,
                            "overall_score": feedback_data.get("scores", {}).get("overall")
                        })
                    
                    # レスポンスにフィードバックデータを追加
                    response_data["feedback"] = feedback_data
                    response_data["finalMetrics"] = final_metrics_for_feedback
                    response_data["feedbackCreatedAt"] = "auto-generated"
                    
                    # ゴール結果を設定
                    if goal_data:
                        goal_statuses = goal_data.get("goalStatuses", [])
                        goal_score = goal_data.get("goalScore", 0)
                    
                except Exception as feedback_error:
                    logger.error("フィードバック自動生成に失敗しました", extra={
                        "error": str(feedback_error),
                        "session_id": session_id
                    })
                    # フィードバック生成に失敗した場合は、エラー情報をレスポンスに追加
                    response_data["feedbackError"] = str(feedback_error)
                    response_data["feedback"] = None
                    response_data["finalMetrics"] = final_metrics_for_feedback
                    response_data["feedbackCreatedAt"] = "generation-failed"
                    
                    # リアルタイムメトリクスから最新のゴール情報のみ取得
                    if realtime_metrics:
                        for metric in realtime_metrics:
                            if "goalStatuses" in metric:
                                goal_statuses = metric["goalStatuses"]
                                goal_score = int(metric.get("goalScore", 0))
                                break
            
            # ゴール結果データを追加
            if scenario_goals or goal_statuses:
                goal_results = {
                    "scenarioGoals": scenario_goals,
                    "goalStatuses": goal_statuses,
                    "goalScore": goal_score
                }
                response_data["goalResults"] = goal_results
                
                logger.info("ゴール結果データを追加しました", extra={
                    "session_id": session_id,
                    "scenario_goals_count": len(scenario_goals),
                    "goal_statuses_count": len(goal_statuses),
                    "goal_score": goal_score
                })
            
            logger.info("Session complete data retrieved successfully", extra={
                "session_id": session_id,
                "messages_count": len(messages),
                "realtime_metrics_count": len(realtime_metrics),
                "has_feedback": bool(final_feedback)
            })
            
            return response_data
            
        except NotFoundError:
            raise
        except BadRequestError:
            raise
        except InternalServerError:
            raise
        except Exception as error:
            logger.exception("Unexpected error in get session complete data handler", extra={
                "error": str(error),
                "session_id": session_id
            })
            raise InternalServerError(f"セッション完全データ取得中にエラーが発生しました: {str(error)}")