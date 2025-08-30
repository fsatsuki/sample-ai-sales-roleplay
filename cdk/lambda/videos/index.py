"""
動画管理・分析Lambda関数

このモジュールは、録画動画のアップロード・分析処理を行うLambda関数を実装します。
主な機能は以下の通りです：
- 録画動画アップロード用の署名付きURL生成 (/videos/upload-url)
- 動画のAmazon Nova分析実行 (/videos/analyze)
- 動画分析結果の取得 (/videos/{sessionId})
"""

import json
import os
import time
import boto3
import boto3.dynamodb.conditions
from botocore.config import Config
from datetime import datetime
from typing import Dict, Any, Optional
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

# video_analyzerモジュールをインポート
from video_analyzer import VideoAnalyzer, find_session_video, save_video_analysis_to_dynamodb

# 環境変数
SESSION_FEEDBACK_TABLE = os.environ.get('SESSION_FEEDBACK_TABLE', 'dev-AISalesRolePlay-SessionFeedback')
VIDEO_BUCKET = os.environ.get('VIDEO_BUCKET', '')
MAX_VIDEO_SIZE_MB = int(os.environ.get('MAX_VIDEO_SIZE_MB', '100'))  # デフォルト最大100MB
DEFAULT_PRESIGNED_URL_EXPIRY = int(os.environ.get('DEFAULT_PRESIGNED_URL_EXPIRY', '600'))  # デフォルト10分
MAX_VIDEO_LENGTH_SECONDS = int(os.environ.get('MAX_VIDEO_LENGTH_SECONDS', '1800'))  # デフォルト最大30分

# CORS設定
cors_config = CORSConfig(
    allow_origin="*",
    allow_headers=["*"],
    max_age=300
)

# APIGatewayルーター
app = APIGatewayRestResolver(cors=cors_config)

# ロガー
logger = Logger(service="videos-api")

# AWSクライアント - リージョン指定と署名バージョン設定
if VIDEO_BUCKET:
    s3 = boto3.client(
        's3',
        region_name=os.environ.get('AWS_REGION'),  # Lambda実行リージョンを自動取得
        config=Config(
            signature_version='s3v4',  # 署名バージョンv4を明示指定
            s3={'addressing_style': 'virtual'},  # virtual-hosted-style URLを使用
            retries={'max_attempts': 3}  # リトライ設定
        )
    )
    logger.info(f"S3クライアント初期化完了（動画用）: region={os.environ.get('AWS_REGION')}")
else:
    s3 = None
    logger.warning("VIDEO_BUCKET環境変数が設定されていません")

dynamodb = boto3.resource('dynamodb')
bedrock_runtime = boto3.client('bedrock-runtime')

# 例外クラス
class BadRequestError(Exception):
    pass

class ResourceNotFoundError(Exception):
    pass

class InternalServerError(Exception):
    pass

def execute_video_analysis(session_id: str, language: str = 'ja') -> Optional[Dict[str, Any]]:
    """
    セッションIDに対して動画分析を実行する
    
    Args:
        session_id: セッションID
        language: 分析言語 ('ja' または 'en')
        
    Returns:
        動画分析結果の辞書（エラー時はNone）
    """
    try:
        logger.info(f"動画分析実行開始: session_id={session_id}, language={language}")
        
        # ビデオファイルを検索
        video_key = find_session_video(session_id, VIDEO_BUCKET)
        if not video_key:
            logger.warn(f"セッション {session_id} のビデオファイルが見つかりません")
            raise ResourceNotFoundError(f"Video file not found for session: {session_id}")
        
        logger.info(f"ビデオファイルが見つかりました: {video_key}")
        
        # ビデオ分析を実行
        model_id = os.environ.get('VIDEO_ANALYSIS_MODEL_ID', 'us.amazon.nova-premier-v1:0')
        model_region = os.environ.get('MODEL_REGION', 'us-east-1')
        video_analyzer = VideoAnalyzer(VIDEO_BUCKET, model_id, model_region)
        analysis_result = video_analyzer.analyze_session_video(session_id, video_key, language)
        
        if not analysis_result:
            logger.error(f"ビデオ分析の実行に失敗しました: session_id={session_id}")
            raise InternalServerError("Video analysis execution failed")
        
        # 分析結果をDynamoDBに保存
        video_url = f"s3://{VIDEO_BUCKET}/{video_key}"
        save_success = save_video_analysis_to_dynamodb(
            session_id, 
            analysis_result, 
            video_url, 
            SESSION_FEEDBACK_TABLE
        )
        
        if not save_success:
            logger.warning(f"ビデオ分析結果の保存に失敗しましたが、レスポンスには含めます: session_id={session_id}")
        
        # レスポンス形式で返す
        current_time = datetime.utcnow().isoformat() + 'Z'
        result = {
            "sessionId": session_id,
            "videoAnalysis": analysis_result,
            "createdAt": current_time,
            "videoUrl": video_url
        }
        
        logger.info(f"動画分析実行完了: session_id={session_id}, overall_score={analysis_result.get('overallScore')}")
        return result
        
    except ResourceNotFoundError:
        # 既にログ出力済みなので再スロー
        raise
    except InternalServerError:
        # 既にログ出力済みなので再スロー
        raise
    except Exception as e:
        logger.error(f"動画分析実行中に予期しないエラーが発生: session_id={session_id}, error={str(e)}")
        import traceback
        logger.error(f"スタックトレース: {traceback.format_exc()}")
        raise InternalServerError(f"Unexpected error during video analysis: {str(e)}")

# S3アップロード用の署名付きURL生成
@app.get("/videos/upload-url")
def generate_upload_url():
    """
    動画アップロード用の署名付きURLを生成するエンドポイント
    
    クエリパラメータ:
    - sessionId: セッションID
    - contentType: 動画のMIMEタイプ（video/mp4のみサポート）
    - fileName: ファイル名（オプション）
    
    レスポンス:
    - uploadUrl: アップロード用の署名付きURL
    - videoKey: S3バケット内のオブジェクトキー
    """
    try:
        # リクエストパラメータの取得
        session_id = app.current_event.get_query_string_value(name="sessionId", default_value=None)
        content_type = app.current_event.get_query_string_value(name="contentType", default_value=None)
        file_name = app.current_event.get_query_string_value(name="fileName", default_value="recording.mp4")
        
        if not session_id:
            raise BadRequestError("sessionId is required")
        
        if not content_type:
            raise BadRequestError("contentType is required")
        
        if content_type != 'video/mp4':
            raise BadRequestError("Only video/mp4 format is supported")
        
        # S3オブジェクトキーの生成
        timestamp = int(time.time())
        video_key = f"videos/{session_id}/{timestamp}_{file_name}"
        
        # S3署名付きPOSTフォーム作成（CORS回避のため）
        if not VIDEO_BUCKET:
            raise InternalServerError("VIDEO_BUCKET environment variable is not set")
        
        logger.info(f"署名付きURL生成開始（動画用）: bucket={VIDEO_BUCKET}, key={video_key}, contentType={content_type}, region={os.environ.get('AWS_REGION')}")
        
        # generate_presigned_postを使用してCORSプリフライトリクエストを回避
        post_data = s3.generate_presigned_post(
            Bucket=VIDEO_BUCKET,
            Key=video_key,
            Fields={'Content-Type': content_type},
            Conditions=[
                ['content-length-range', 1, MAX_VIDEO_SIZE_MB * 1024 * 1024],  # 100MB制限
                {'Content-Type': content_type}
            ],
            ExpiresIn=DEFAULT_PRESIGNED_URL_EXPIRY
        )
        
        logger.info(f"署名付きPOST URL生成成功（動画用）: bucket={VIDEO_BUCKET}, key={video_key}")
        logger.info(f"生成されたURL（動画用）: {post_data['url']}")
        logger.info(f"フォームデータのフィールド数（動画用）: {len(post_data['fields'])}")
        logger.debug(f"フォームデータの内容（動画用）: {list(post_data['fields'].keys())}")
        
        return {
            "uploadUrl": post_data["url"],
            "formData": post_data["fields"],
            "videoKey": video_key,
            "expiresIn": DEFAULT_PRESIGNED_URL_EXPIRY
        }
        
    except BadRequestError as e:
        logger.warn(f"Bad request: {str(e)}")
        return {"error": str(e)}, 400
    
    except InternalServerError as e:
        logger.error(f"Internal server error: {str(e)}")
        return {"error": "Internal server error"}, 500
    
    except Exception as e:
        logger.error(f"Error generating presigned URL: {str(e)}")
        return {"error": "Failed to generate upload URL"}, 500

# 動画分析の実行と結果取得
@app.get("/videos/<sessionId>")
def get_video_analysis(sessionId: str):
    """
    セッションIDに対応する動画分析を実行し、結果を取得するエンドポイント
    
    パスパラメータ:
    - sessionId: セッションID
    
    クエリパラメータ:
    - language: 分析言語 ('ja' または 'en', デフォルト: 'ja')
    
    レスポンス:
    - 動画分析結果（既存の場合は既存結果、未実行の場合は新規実行）
    """
    try:
        logger.debug(f"=== get_video_analysis開始 ===")
        logger.debug(f"リクエストされたsessionId: {sessionId}")
        logger.debug(f"使用するテーブル名: {SESSION_FEEDBACK_TABLE}")
        
        # クエリパラメータから言語を取得
        language = app.current_event.get_query_string_value(name="language", default_value="ja")
        logger.debug(f"分析言語: {language}")
        
        # テーブル参照
        feedback_table = dynamodb.Table(SESSION_FEEDBACK_TABLE)
        logger.debug(f"DynamoDBテーブル参照を取得しました: {feedback_table.table_name}")
        
        # 既存の分析結果を確認
        logger.debug(f"DynamoDBから既存の分析結果を検索中...")
        
        # まず、sessionIdでクエリしてfinal-feedbackデータを探す
        response = feedback_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(sessionId),
            FilterExpression=boto3.dynamodb.conditions.Attr('dataType').eq('final-feedback'),
            ScanIndexForward=False  # 降順ソート（最新が先頭）
        )
        
        logger.info(f"DynamoDBクエリレスポンス: Items数={len(response.get('Items', []))}")
        
        feedback_items = response.get('Items', [])
        if not feedback_items:
            logger.warn(f"セッション {sessionId} のフィードバックデータが見つかりません")
            raise ResourceNotFoundError(f"Feedback data not found for session: {sessionId}")
        
        # 最新のfinal-feedbackアイテムを取得
        item = feedback_items[0]
        logger.info(f"取得したアイテムのキー: {list(item.keys())}")
        logger.info(f"アイテムのdataType: {item.get('dataType')}")
        logger.info(f"アイテムのcreatedAt: {item.get('createdAt')}")
        
        # 既存の動画分析結果があるかチェック
        if 'videoAnalysis' in item:
            video_analysis = item.get('videoAnalysis')
            video_analysis_created_at = item.get('videoAnalysisCreatedAt')
            video_url = item.get('videoUrl')
            
            logger.debug(f"既存の動画分析データを返します")
            logger.debug(f"- 分析結果のキー: {list(video_analysis.keys()) if isinstance(video_analysis, dict) else 'dict以外の型'}")
            logger.debug(f"- 作成日時: {video_analysis_created_at}")
            logger.debug(f"- 動画URL: {video_url}")
            
            result = {
                "sessionId": sessionId,
                "videoAnalysis": video_analysis,
                "createdAt": video_analysis_created_at,
                "videoUrl": video_url
            }
            
            logger.debug(f"=== get_video_analysis正常終了（既存結果） ===")
            return result
        
        # 既存の分析結果がない場合、新規に動画分析を実行
        logger.info(f"既存の動画分析結果がないため、新規分析を実行します")
        
        # 動画分析を実行
        analysis_result = execute_video_analysis(sessionId, language)
        
        if analysis_result:
            logger.debug(f"動画分析が正常に完了しました")
            return analysis_result
        else:
            logger.warn(f"動画分析の実行に失敗しました")
            raise InternalServerError("Video analysis execution failed")
        
    except ResourceNotFoundError as e:
        logger.warn(f"リソースが見つかりません: {str(e)}")
        return {"error": str(e)}, 404
    
    except InternalServerError as e:
        logger.error(f"内部サーバーエラー: {str(e)}")
        return {"error": str(e)}, 500
    
    except Exception as e:
        logger.error(f"動画分析取得中にエラーが発生しました: {str(e)}")
        logger.error(f"エラーの詳細: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(f"スタックトレース: {traceback.format_exc()}")
        return {"error": "Failed to retrieve video analysis"}, 500

# Lambda handler
@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    Lambda関数のエントリポイント
    """
    try:
        return app.resolve(event, context)
    except Exception as e:
        logger.exception(f"Unhandled exception: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error"}),
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*"
            }
        }
