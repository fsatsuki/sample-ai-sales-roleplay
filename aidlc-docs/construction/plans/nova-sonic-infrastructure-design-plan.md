# Infrastructure Design Plan: Nova 2 Sonic移行

## 概要
Nova 2 Sonic移行における論理コンポーネントを実際のAWSサービス・CDKリソースにマッピングするためのインフラストラクチャ設計プランです。

## 前提条件
- NFR Requirements: 完了（承認済み）
- NFR Design: 完了（承認済み）
- 既存AgentCore Runtime CDKコンストラクト: `cdk/lib/constructs/agentcore/agentcore-runtime.ts`（L2 Construct版）
- 既存Transcribe WebSocket CDKコンストラクト: `cdk/lib/constructs/api/transcribe-websocket.ts`（削除対象）
- 既存Cognito Identity Pool: `cdk/lib/constructs/auth.ts`（SigV4認証用IAMロール追加）

---

## 実行ステップ

### Step 1: 設計成果物の分析
- [x] NFR Design成果物の読み込み（nfr-design-patterns.md, logical-components.md）
- [x] NFR Requirements成果物の読み込み（nfr-requirements.md, tech-stack-decisions.md）
- [x] 既存AgentCore Runtime CDKコンストラクトの分析
- [x] 既存Transcribe WebSocket CDKコンストラクトの分析（削除対象）
- [x] 既存Cognito Identity Pool CDK構成の分析（SigV4認証用）
- [x] 前回AgentCore移行Infrastructure Design成果物の参照

### Step 2: Infrastructure Design質問の作成
- [x] nova-sonic BidiAgent CfnRuntime/L2 Construct設計に関する質問
- [x] SigV4認証用IAMロール設計に関する質問
- [x] CDKコンストラクト構成に関する質問
- [x] 削除対象リソースの確認
- [x] 環境変数・設定に関する質問

### Step 3: ユーザー回答の収集・分析
- [x] 全質問への回答を収集
- [x] 曖昧な回答の確認・フォローアップ（Q2: ドキュメント確認完了、`bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream`を特定）

### Step 4: Infrastructure Design成果物の生成
- [x] infrastructure-design.md の作成
- [x] deployment-architecture.md の作成

### Step 5: ユーザー承認
- [x] 完了メッセージの提示
- [x] ユーザー承認の取得（2026-03-11 承認済み）

---

## 質問

以下の質問に回答してください。各質問の `[Answer]:` タグの後に回答を記入してください。

---

### Q1. nova-sonic BidiAgent用AgentCore Runtimeの認証方式

既存のAgentCore Runtimeコンストラクト（`agentcore-runtime.ts`）は `enableJwtAuth` フラグでJWT認証とIAM認証を切り替えています。nova-sonic BidiAgentはSigV4認証（Cognito Identity Pool経由）を使用するため、IAM認証モードで作成する必要があります。

既存のL2 Constructの `RuntimeAuthorizerConfiguration.usingIAM()` をそのまま使用する方針で問題ありませんか？

- A) はい、既存L2 Constructの `enableJwtAuth: false`（IAM認証）をそのまま使用する
- B) いいえ、別の認証設定が必要（詳細を記述してください）

[Answer]:A

---

### Q2. Cognito Identity Pool認証済みロールへのAgentCore Runtime権限追加

既存の `auth.ts` では、Identity Poolの認証済みロールに `bedrock:InvokeModel` と `polly:SynthesizeSpeech` の権限が付与されています。nova-sonic BidiAgentへのSigV4接続には、AgentCore Runtime関連の権限を追加する必要があります。

追加する権限として以下を想定していますが、問題ありませんか？

```
bedrock-agentcore:InvokeAgent（AgentCore Runtime呼び出し）
bedrock-agentcore:InvokeAgentWithWebSocket（WebSocket接続）
```

- A) 上記の権限で問題ない
- B) 権限を調整する必要がある（詳細を記述してください）
- C) 正確な権限名が不明なので、AgentCore Runtimeのドキュメントを確認して決定する

[Answer]: C

---

### Q3. nova-sonic BidiAgentコンテナのBedrock権限

nova-sonic BidiAgentのAgentCore Runtimeロールには、Nova 2 Sonicの双方向ストリーミングAPI呼び出し権限が必要です。既存のAgentCore Runtimeコンストラクトでは `bedrock:InvokeModel` と `bedrock:InvokeModelWithResponseStream` が付与されています。

Nova 2 Sonicには `bedrock:InvokeModelWithBidirectionalStream` 権限が追加で必要です。この権限を `additionalPolicies` で追加する方針で問題ありませんか？

- A) はい、`additionalPolicies` で `bedrock:InvokeModelWithBidirectionalStream` を追加する
- B) いいえ、AgentCore Runtimeコンストラクト自体を修正して標準権限に含める

[Answer]: B

---

### Q4. CDKコンストラクトの配置

nova-sonic BidiAgent用のCDKコンストラクトの配置方針を確認します。

- A) 既存の `agentcore-runtime.ts` をそのまま使用し、nova-sonic BidiAgent用のインスタンスを作成する（パラメータで差異を吸収）
- B) nova-sonic専用のCDKコンストラクトを新規作成する（`cdk/lib/constructs/agentcore/nova-sonic-runtime.ts`）

[Answer]: A

---

### Q5. Transcribe WebSocketインフラの削除方法

Transcribe WebSocket関連リソース（API Gateway WebSocket、Lambda×3、DynamoDB接続管理テーブル）の削除方法を確認します。

- A) `TranscribeWebSocketConstruct` のインスタンス化をコメントアウト/削除し、CDKデプロイで自動削除する
- B) CDKコンストラクトファイル自体（`transcribe-websocket.ts`）も削除する
- C) A + B の両方（インスタンス化削除 + ファイル削除）

[Answer]: C

---

### Q6. フロントエンド環境変数

フロントエンドからAgentCore Runtime WebSocketエンドポイントに接続するために、以下の環境変数が必要です。既存のTranscribe WebSocket URLの環境変数を置き換える形で問題ありませんか？

現行（削除）:
```
VITE_TRANSCRIBE_WEBSOCKET_URL=wss://xxx.execute-api.ap-northeast-1.amazonaws.com/prod
```

移行後（追加）:
```
VITE_NOVA_SONIC_AGENT_ENDPOINT=<AgentCore Runtime Endpoint URL>
VITE_NOVA_SONIC_AGENT_REGION=ap-northeast-1
```

- A) 上記の環境変数で問題ない
- B) 環境変数名や構成を変更する（詳細を記述してください）

[Answer]: A

---

### Q7. 既存NPC会話AgentCore Runtimeの削除

前回のAgentCore移行で作成された `npc-conversation` AgentCore Runtimeは、nova-sonic BidiAgentに置き換えられるため削除が必要です。

削除方法を確認します:
- A) CDKコード内のnpc-conversation AgentCore Runtimeインスタンス化を削除し、CDKデプロイで自動削除する
- B) 段階的に削除する（まずnova-sonic BidiAgentをデプロイし、動作確認後にnpc-conversationを削除）

[Answer]: A

---

**作成日**: 2026-03-11
**バージョン**: 1.0
