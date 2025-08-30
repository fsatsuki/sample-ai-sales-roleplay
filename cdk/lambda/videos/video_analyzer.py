"""
ビデオ分析モジュール

このモジュールは、セッションのビデオファイルを分析してフィードバックを生成する機能を提供します。
Amazon Nova モデルを使用してビデオの内容を分析し、営業スキルの評価を行います。
"""

import json
import os
import boto3
from typing import Dict, Any, Optional
from datetime import datetime
from botocore.exceptions import ClientError
from aws_lambda_powertools import Logger

# プロンプトテンプレートをインポート
from prompts.analysis_prompt import VIDEO_ANALYSIS_PROMPT_JA, VIDEO_ANALYSIS_PROMPT_EN

# ロガー設定
logger = Logger(service="video-analyzer")

# AWSクライアント
s3_client = boto3.client('s3')


class VideoAnalyzer:
    """ビデオ分析クラス"""
    
    def __init__(self, video_bucket: str, model_id: str = 'us.amazon.nova-premier-v1:0', region: str = None):
        """
        初期化
        
        Args:
            video_bucket: ビデオファイルが保存されているS3バケット名
            model_id: 使用するNova モデルID
            region: Bedrockクライアントのリージョン
        """
        self.video_bucket = video_bucket
        self.model_id = model_id
        
        self.bedrock_client = boto3.client('bedrock-runtime')
        self.sts_client = boto3.client('sts')
    
    def analyze_session_video(self, session_id: str, video_key: str, language: str = 'ja') -> Optional[Dict[str, Any]]:
        """
        セッションのビデオを分析する
        
        Args:
            session_id: セッションID
            video_key: ビデオファイルのS3キー
            language: 分析言語 ('ja' または 'en')
            
        Returns:
            ビデオ分析結果の辞書（エラー時はNone）
        """
        try:
            # ファイル情報を取得
            head_response = s3_client.head_object(Bucket=self.video_bucket, Key=video_key)
            file_size = head_response.get('ContentLength', 0)
            
            # ファイルサイズチェック（1GB制限）
            if file_size > 1024 * 1024 * 1024:
                logger.error("ビデオファイルが1GBを超えています", extra={
                    "session_id": session_id,
                    "file_size_mb": file_size / (1024 * 1024)
                })
                return None
            
            # ビデオフォーマットを決定
            video_format = self._get_video_format(video_key)
            
            # 分析プロンプト
            prompt = self._get_analysis_prompt(language)

            analysis_result = self._analyze_with_s3_uri(session_id, video_key, video_format, prompt)
            
            if analysis_result:
                logger.info("ビデオ分析が完了しました", extra={
                    "session_id": session_id,
                    "overall_score": analysis_result.get('overallScore'),
                    "analysis_method": "base64" if file_size < 25 * 1024 * 1024 else "s3_uri"
                })
            
            return analysis_result
            
        except Exception as e:
            logger.error("ビデオ分析でエラーが発生", extra={
                "session_id": session_id,
                "error": str(e),
                "error_type": type(e).__name__
            })
            return None
    
    def _get_video_format(self, video_key: str) -> str:
        """ビデオファイルの拡張子からフォーマットを決定（MP4のみサポート）"""
        if video_key.lower().endswith('.mp4'):
            return "mp4"
        else:
            raise ValueError(f"サポートされていないビデオ形式です。MP4ファイルのみサポートしています: {video_key}")
    
    def _get_analysis_prompt(self, language: str = 'ja') -> str:
        """
        ビデオ分析用のプロンプトを取得
        
        Args:
            language: 言語コード ('ja' または 'en')
            
        Returns:
            ビデオ分析用のプロンプト文字列
        """
        if language.lower() == 'en':
            return VIDEO_ANALYSIS_PROMPT_EN
        else:
            return VIDEO_ANALYSIS_PROMPT_JA
    
    def _analyze_with_s3_uri(self, session_id: str, video_key: str, video_format: str, prompt: str) -> Optional[Dict[str, Any]]:
        """S3 URI方式でビデオ分析を実行"""
        try:
            # AWS アカウントIDを取得
            account_id = self.sts_client.get_caller_identity()['Account']
            video_url = f"s3://{self.video_bucket}/{video_key}"
            
            # Nova モデル用のConverse APIリクエスト構造
            messages = [{
                "role": "user",
                "content": [
                    {
                        "video": {
                            "format": video_format,
                            "source": {
                                "s3Location": {
                                    "uri": video_url,
                                    "bucketOwner": account_id
                                }
                            }
                        }
                    },
                    {
                        "text": prompt
                    }
                ]
            }]
            
            system = [{
                "text": "営業トレーニング専門家として、有効なJSONのみを出力してください。"
            }]
            
            inference_config = {
                "maxTokens": 2000,
                "temperature": 0.1
            }
            
            logger.debug("Bedrock Converse API呼び出し開始（S3 URI方式）", extra={
                "session_id": session_id,
                "model_id": self.model_id,
                "video_url": video_url,
                "account_id": account_id
            })
            
            # Converse APIを使用
            response = self.bedrock_client.converse(
                modelId=self.model_id,
                messages=messages,
                system=system,
                inferenceConfig=inference_config
            )
            
            # Converse APIレスポンス解析
            ai_response = response["output"]["message"]["content"][0]["text"]
            
            logger.debug("Bedrock Converse API呼び出し成功", extra={
                "session_id": session_id,
                "response_length": len(ai_response)
            })
            
            return self._parse_analysis_response(ai_response)
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            logger.error("Bedrock API呼び出しエラー（S3 URI方式）", extra={
                "session_id": session_id,
                "error_code": error_code,
                "error_message": error_message,
                "model_id": self.model_id,
                "video_format": video_format,
                "video_url": video_url
            })
            return None
            
        except Exception as e:
            logger.error("S3 URIビデオ分析でエラー", extra={
                "session_id": session_id,
                "error": str(e),
                "error_type": type(e).__name__
            })
            return None
    
    def _parse_analysis_response(self, ai_response: str) -> Optional[Dict[str, Any]]:
        """AI応答をJSONとして解析"""
        try:
            # JSONデータを抽出
            json_str = ai_response
            if '{' in ai_response:
                json_str = ai_response[ai_response.find('{'):ai_response.rfind('}')+1]
            
            analysis_result = json.loads(json_str)
            
            # 必須フィールドの検証
            required_fields = ['eyeContact', 'facialExpression', 'gesture', 'emotion']
            for field in required_fields:
                if field not in analysis_result:
                    raise ValueError(f"Missing field: {field}")
                analysis_result[field] = int(analysis_result[field])
            
            # overallScoreを計算
            if 'overallScore' not in analysis_result:
                overall = sum(analysis_result[field] for field in required_fields) / len(required_fields)
                analysis_result['overallScore'] = int(round(overall))
            else:
                analysis_result['overallScore'] = int(analysis_result['overallScore'])
            
            return analysis_result
            
        except Exception as e:
            logger.error("AI応答の解析に失敗", extra={"error": str(e)})
            # フォールバック結果
            return {
                "eyeContact": 5,
                "facialExpression": 5,
                "gesture": 5,
                "emotion": 5,
                "overallScore": 5,
                "strengths": [{"title": "分析エラー", "description": "データ解析に問題がありました"}],
                "improvements": [{"title": "分析エラー", "description": "データ解析に問題がありました"}],
                "analysis": f"AIレスポンスの解析中にエラーが発生: {str(e)}"
            }


def find_session_video(session_id: str, video_bucket: str) -> Optional[str]:
    """
    セッションIDに基づいてS3バケット内のビデオファイルを検索
    
    Args:
        session_id: セッションID
        video_bucket: ビデオ保存用S3バケット名
        
    Returns:
        ビデオファイルのS3キー（見つからない場合はNone）
    """
    try:
        if not video_bucket:
            logger.warning("ビデオバケット名が設定されていません", extra={
                "session_id": session_id
            })
            return None
        
        # S3でビデオファイルを検索
        prefix = f"videos/{session_id}/"
        
        try:
            response = s3_client.list_objects_v2(
                Bucket=video_bucket,
                Prefix=prefix
            )
        except ClientError as e:
            logger.error("S3バケットにアクセスできません", extra={
                "session_id": session_id,
                "bucket": video_bucket,
                "error": str(e),
                "error_code": e.response.get('Error', {}).get('Code', 'Unknown')
            })
            return None
        
        # ファイルが見つからない場合
        if 'Contents' not in response or not response['Contents']:
            logger.debug("セッションのビデオファイルが見つかりませんでした", extra={
                "session_id": session_id,
                "prefix": prefix
            })
            return None
        
        # ビデオファイルをフィルタリング
        video_files = []
        for obj in response['Contents']:
            key = obj['Key']
            # ディレクトリエントリをスキップ
            if key.endswith('/'):
                continue
            
            # ビデオファイル拡張子をチェック（MP4のみサポート）
            if key.lower().endswith('.mp4'):
                video_files.append({
                    'key': key,
                    'last_modified': obj['LastModified'],
                    'size': obj['Size']
                })
        
        if not video_files:
            logger.debug("ビデオファイル形式のファイルが見つかりませんでした", extra={
                "session_id": session_id,
                "total_files": len(response['Contents'])
            })
            return None
        
        # 複数のファイルがある場合は最新のファイルを選択
        if len(video_files) > 1:
            video_files.sort(key=lambda x: x['last_modified'], reverse=True)
            logger.debug("複数のビデオファイルが見つかりました。最新のファイルを選択します", extra={
                "session_id": session_id,
                "total_files": len(video_files),
                "selected_file": video_files[0]['key']
            })
        
        selected_file = video_files[0]
        
        logger.debug("ビデオファイルが見つかりました", extra={
            "session_id": session_id,
            "video_key": selected_file['key'],
            "file_size_mb": selected_file['size'] / (1024 * 1024)
        })
        
        return selected_file['key']
        
    except Exception as e:
        logger.error("ビデオファイル検索でエラーが発生", extra={
            "session_id": session_id,
            "bucket": video_bucket,
            "error": str(e),
            "error_type": type(e).__name__
        })
        return None


def check_existing_video_analysis(session_id: str, session_feedback_table_name: str) -> Optional[Dict[str, Any]]:
    """
    DynamoDBのSessionFeedbackテーブルから既存のビデオ分析結果を確認
    
    Args:
        session_id: セッションID
        session_feedback_table_name: SessionFeedbackテーブル名
        
    Returns:
        既存のビデオ分析結果（存在しない場合はNone）
    """
    try:
        dynamodb = boto3.resource('dynamodb')
        feedback_table = dynamodb.Table(session_feedback_table_name)
        
        # final-feedbackレコードを検索（dataTypeでフィルタリング）
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
            FilterExpression=boto3.dynamodb.conditions.Attr('dataType').eq('final-feedback'),
            ScanIndexForward=False  # 降順ソート（最新が先頭）
        )
        
        items = response.get('Items', [])
        if not items:
            logger.info("final-feedbackレコードが見つかりませんでした", extra={
                "session_id": session_id
            })
            return None
        
        # 最新のfinal-feedbackレコードを取得
        final_feedback = items[0]
        
        # videoAnalysisフィールドの存在をチェック
        if 'videoAnalysis' in final_feedback:
            video_analysis_data = {
                'videoAnalysis': final_feedback['videoAnalysis'],
                'videoAnalysisCreatedAt': final_feedback.get('videoAnalysisCreatedAt'),
                'videoUrl': final_feedback.get('videoUrl'),
                'createdAt': final_feedback.get('createdAt')  # キー情報も含める
            }
            
            logger.info("既存のビデオ分析結果が見つかりました", extra={
                "session_id": session_id,
                "created_at": final_feedback.get('createdAt'),
                "video_analysis_created_at": video_analysis_data.get('videoAnalysisCreatedAt'),
                "overall_score": final_feedback['videoAnalysis'].get('overallScore') if isinstance(final_feedback['videoAnalysis'], dict) else None
            })
            
            return video_analysis_data
        else:
            logger.info("ビデオ分析結果が存在しません", extra={
                "session_id": session_id,
                "created_at": final_feedback.get('createdAt'),
                "final_feedback_exists": True
            })
            return None
            
    except Exception as e:
        logger.error("既存ビデオ分析結果の確認でエラーが発生", extra={
            "session_id": session_id,
            "error": str(e),
            "error_type": type(e).__name__
        })
        return None


def save_video_analysis_to_dynamodb(session_id: str, analysis_result: Dict[str, Any], video_url: str, session_feedback_table_name: str) -> bool:
    """
    ビデオ分析結果をDynamoDBのSessionFeedbackテーブルに保存
    
    Args:
        session_id: セッションID
        analysis_result: ビデオ分析結果の辞書
        video_url: ビデオファイルのS3 URL
        session_feedback_table_name: SessionFeedbackテーブル名
        
    Returns:
        bool: 保存が成功した場合はTrue、それ以外はFalse
    """
    try:
        dynamodb = boto3.resource('dynamodb')
        feedback_table = dynamodb.Table(session_feedback_table_name)
        
        # タイムスタンプ（ISO 8601形式）
        current_time = datetime.utcnow().isoformat() + 'Z'
        
        # 分析結果の検証
        required_fields = ['eyeContact', 'facialExpression', 'gesture', 'emotion', 'overallScore', 'strengths', 'improvements', 'analysis']
        missing_fields = [field for field in required_fields if field not in analysis_result]
        
        if missing_fields:
            logger.error("ビデオ分析結果に必須フィールドが不足", extra={
                "session_id": session_id,
                "missing_fields": missing_fields
            })
            return False
        
        # まず既存のfinal-feedbackレコードを検索
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
            FilterExpression=boto3.dynamodb.conditions.Attr('dataType').eq('final-feedback'),
            ScanIndexForward=False  # 降順ソート（最新が先頭）
        )
        
        items = response.get('Items', [])
        if not items:
            logger.error("final-feedbackレコードが見つかりません", extra={
                "session_id": session_id
            })
            return False
        
        # 最新のfinal-feedbackレコードを取得
        final_feedback_item = items[0]
        created_at = final_feedback_item['createdAt']
        
        # DynamoDBに保存（正しいキーを使用）
        feedback_table.update_item(
            Key={
                'sessionId': session_id,
                'createdAt': created_at
            },
            UpdateExpression="SET videoAnalysis = :va, videoAnalysisCreatedAt = :ts, videoUrl = :url",
            ExpressionAttributeValues={
                ':va': analysis_result,
                ':ts': current_time,
                ':url': video_url
            },
            ReturnValues="UPDATED_NEW"
        )
        
        logger.info("ビデオ分析結果を保存しました", extra={
            "session_id": session_id,
            "created_at": created_at,
            "overall_score": analysis_result.get('overallScore'),
            "video_url": video_url
        })
        
        return True
        
    except Exception as e:
        logger.error("ビデオ分析結果の保存に失敗しました", extra={
            "session_id": session_id,
            "error": str(e),
            "error_type": type(e).__name__
        })
        return False


def integrate_video_analysis_to_response(
    session_id: str, 
    existing_video_analysis: Optional[Dict[str, Any]], 
    video_key: Optional[str], 
    video_bucket: Optional[str],
    language: str = 'ja'
) -> Dict[str, Any]:
    """
    ビデオ分析結果をレスポンス形式に統合する
    
    Args:
        session_id: セッションID
        existing_video_analysis: 既存のビデオ分析結果
        video_key: ビデオファイルのS3キー
        video_bucket: ビデオファイルが保存されているS3バケット名
        language: 分析言語 ('ja' または 'en')
        
    Returns:
        ビデオ分析結果を含む辞書
    """
    try:        
        if existing_video_analysis:            
            video_analysis = existing_video_analysis.get('videoAnalysis')
            if video_analysis and isinstance(video_analysis, dict):
                required_fields = ['eyeContact', 'facialExpression', 'gesture', 'emotion', 'overallScore']
                missing_fields = [field for field in required_fields if field not in video_analysis]
                
                if missing_fields:
                    return {
                        'videoAnalysisError': f"既存のビデオ分析データが不完全です（不足フィールド: {', '.join(missing_fields)}）"
                    }
                
                return existing_video_analysis
            else:
                logger.error("既存のビデオ分析結果の形式が不正です", extra={
                    "session_id": session_id,
                    "video_analysis_type": type(video_analysis).__name__,
                    "operation": "existing_analysis_invalid_format"
                })
                return {
                    'videoAnalysisError': "既存のビデオ分析データの形式が不正です"
                }
                
        elif video_key and video_bucket:            
            try:
                # 新しいビデオ分析モジュールを使用
                model_id = os.environ.get('VIDEO_ANALYSIS_MODEL_ID', 'us.amazon.nova-premier-v1:0')
                video_analyzer = VideoAnalyzer(video_bucket, model_id)
                analysis_result = video_analyzer.analyze_session_video(session_id, video_key, language)
                
                if analysis_result:
                    video_url = f"s3://{video_bucket}/{video_key}"
                    current_time = datetime.utcnow().isoformat() + 'Z'
                    
                    # 分析結果をDynamoDBに保存
                    session_feedback_table_name = os.environ.get('SESSION_FEEDBACK_TABLE', 'dev-AISalesRolePlay-SessionFeedback')
                    save_success = save_video_analysis_to_dynamodb(session_id, analysis_result, video_url, session_feedback_table_name)
                    
                    if save_success:
                        logger.debug("ビデオ分析結果の保存が完了しました", extra={
                            "session_id": session_id,
                            "video_url": video_url,
                            "overall_score": analysis_result.get('overallScore'),
                            "operation": "video_analysis_save_success"
                        })
                    else:
                        logger.warning("ビデオ分析結果の保存に失敗しましたが、レスポンスには含めます", extra={
                            "session_id": session_id,
                            "video_url": video_url,
                            "operation": "video_analysis_save_failed_but_continue"
                        })
                    
                    response_data = {
                        'videoAnalysis': analysis_result,
                        'videoAnalysisCreatedAt': current_time,
                        'videoUrl': video_url
                    }
                    
                    logger.debug("新規ビデオ分析結果をレスポンスに統合しました", extra={
                        "session_id": session_id,
                        "video_url": video_url,
                        "overall_score": analysis_result.get('overallScore'),
                        "operation": "new_video_analysis_integrated"
                    })
                    
                    return response_data
                else:
                    error_message = "ビデオ分析の実行中にエラーが発生しました"
                    logger.error("ビデオ分析の実行に失敗しました", extra={
                        "session_id": session_id,
                        "video_key": video_key,
                        "video_bucket": video_bucket,
                        "error_message": error_message,
                        "operation": "video_analysis_execution_failed"
                    })
                    return {
                        'videoAnalysisError': error_message
                    }
                    
            except Exception as video_error:
                import traceback
                error_type = type(video_error).__name__
                error_message = str(video_error)
                
                logger.error("ビデオ分析処理中に予期しない例外が発生しました", extra={
                    "session_id": session_id,
                    "video_key": video_key,
                    "video_bucket": video_bucket,
                    "error": error_message,
                    "error_type": error_type,
                    "stack_trace": traceback.format_exc(),
                    "function_name": "integrate_video_analysis_to_response",
                    "operation": "video_analysis_unexpected_exception"
                })
                
                return {
                    'videoAnalysisError': f"ビデオ分析エラー ({error_type}): {error_message}"
                }
        else:
            if not video_bucket:
                logger.debug("ビデオバケットが設定されていないため、ビデオ分析をスキップします", extra={
                    "session_id": session_id,
                    "operation": "video_analysis_skipped_no_bucket"
                })
            else:
                logger.debug("ビデオファイルが見つからないため、ビデオ分析をスキップします", extra={
                    "session_id": session_id,
                    "video_bucket": video_bucket,
                    "has_existing_analysis": bool(existing_video_analysis),
                    "operation": "video_analysis_skipped_no_file"
                })
            
            return {}
        
    except Exception as integration_error:
        import traceback
        error_type = type(integration_error).__name__
        error_message = str(integration_error)
        
        logger.error("ビデオ分析統合処理で予期しないエラーが発生しました", extra={
            "session_id": session_id,
            "error": error_message,
            "error_type": error_type,
            "stack_trace": traceback.format_exc(),
            "function_name": "integrate_video_analysis_to_response",
            "has_existing_analysis": bool(existing_video_analysis),
            "has_video_key": bool(video_key),
            "video_bucket": video_bucket,
            "operation": "video_integration_error"
        })
        
        return {
            'videoAnalysisError': f"ビデオ分析統合エラー ({error_type}): {error_message}"
        }