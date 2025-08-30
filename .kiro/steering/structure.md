# プロジェクト構造

## 主要ディレクトリ

### `/frontend`
フロントエンドアプリケーション（React + TypeScript）

- `/src/components`: UIコンポーネント

  - `/video`: 動画録画・再生コンポーネント
  - `/emoji`: 絵文字フィードバックコンポーネント
  - `/charts`: データ可視化コンポーネント
- `/src/pages`: アプリケーションページ
- `/src/services`: APIサービス、認証等
- `/src/hooks`: カスタムReactフック
- `/src/utils`: ユーティリティ関数
- `/src/types`: TypeScript型定義
- `/src/i18n`: 国際化設定（日本語・英語対応）
- `/src/config`: 設定ファイル
- `/docs`: フロントエンド固有ドキュメント
- `/eslint-plugin-i18n-keys`: カスタムESLintプラグイン

### `/cdk`
AWS CDKによるインフラストラクチャコード

- `/lib`: CDKスタック定義
  - `/constructs`: 再利用可能なCDKコンストラクト
    - `/api`: API Gateway関連コンストラクト
    - `/storage`: S3、DynamoDB関連コンストラクト
    - `/compute`: Lambda関連コンストラクト
  - `/stacks`: デプロイ可能なスタック
- `/bin`: CDKエントリーポイント
- `/lambda`: Lambda関数実装
  - `/bedrock`: Amazon Bedrock連携Lambda
  - `/scoring`: スコアリングエンジンLambda
  - `/textToSpeech`: 音声合成Lambda（SSML対応）
  - `/scenarios`: シナリオ管理Lambda
  - `/sessions`: セッション管理Lambda
  - `/guardrails`: Guardrails管理Lambda
  - `/videos`: 動画分析Lambda（Nova Premiere連携）
  - `/rankings`: ランキング機能Lambda
  - `/referenceCheck`: Knowledge Base参照評価Lambda
  - `/audioComplianceCheck`: 音声コンプライアンスチェックLambda
  - `/custom-resources`: カスタムリソース管理Lambda
- `/data`: 初期データ（シナリオ、Guardrails設定）

### `/memory-bank`
プロジェクト関連ドキュメント

- `productContext.md`: 製品コンテキスト
- `techContext.md`: 技術コンテキスト
- `projectbrief.md`: プロジェクト概要

### `/docs`
ドキュメント



## ファイル命名規則

- **React コンポーネント**: PascalCase（例: `VideoRecorder.tsx`）
- **ユーティリティ関数**: camelCase（例: `dialogueEngine.ts`）
- **テストファイル**: 対象ファイル名 + `.test.ts`（例: `prompt_builder.py` → `test_prompt_builder.py`）
- **CDKコンストラクト**: kebab-case（例: `api-gateway.ts`）

## アーキテクチャ設計原則

1. **フロントエンド**:
   - コンポーネントの責務を明確に分離
   - 状態管理はReact Contextを使用
   - UIとロジックの分離

2. **バックエンド**:
   - マイクロサービスアーキテクチャ
   - 各Lambdaは単一責任の原則に従う
   - CDKコンストラクトの再利用性を重視

3. **データフロー**:
   - RESTful APIによる効率的な通信
   - DynamoDBによる高速データアクセス
   - RDSによる関係データの永続化

4. **セキュリティ**:
   - 最小権限の原則に基づくIAMポリシー
   - Cognitoによる認証・認可
   - 機密データの暗号化