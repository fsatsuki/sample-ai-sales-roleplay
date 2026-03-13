# デプロイメントアーキテクチャ: Nova 2 Sonic移行

## 1. 概要

本ドキュメントは、Nova 2 Sonic移行のデプロイメントアーキテクチャを定義します。
AgentCore Runtime Migration Deployment Architecture（2026-01-08）をベースに、
Nova 2 Sonic BidiAgent固有のSigV4認証、Transcribe WebSocket廃止、NPC会話AgentCore Runtime廃止の変更を反映します。

---

## 2. アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              フロントエンド                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         React Application                               │   │
│  │                         (Amplify Hosting)                               │   │
│  │                                                                         │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │   │
│  │  │ NovaSonicService │  │ AudioOutputManager│  │ SigV4WebSocket   │     │   │
│  │  │ (音声+テキスト)   │  │ (Polly/Nova切替) │  │ Client           │     │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│           │ SigV4 WebSocket              │ JWT                                 │
│           ▼                              ▼                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────────────────┐    ┌───────────────────────────────────────┐
│  AgentCore Runtime                │    │         API Gateway                   │
│  ┌─────────────────────────────┐  │    │  ┌─────────────────────────────────┐  │
│  │  nova-sonic-bidi-agent      │  │    │  │  Cognito Authorizer             │  │
│  │  (SigV4 IAM認証)           │  │    │  │  (既存)                         │  │
│  │  WebSocket /ws :8080        │  │    │  └─────────────────────────────────┘  │
│  └─────────────────────────────┘  │    └───────────────────────────────────────┘
│  ┌─────────────────────────────┐  │                    │
│  │  realtime-scoring-agent     │  │                    ▼
│  │  (AgentCore Identity JWT)   │  │    ┌───────────────────────────────────────┐
│  └─────────────────────────────┘  │    │         Lambda                        │
└───────────────────────────────────┘    │  ┌─────────────────────────────────┐  │
            │                            │  │  evaluation-api                 │  │
            ▼                            │  │  scenarios, sessions, etc.      │  │
┌───────────────────────────────────┐    │  └─────────────────────────────────┘  │
│     Amazon Nova 2 Sonic           │    └───────────────────────────────────────┘
│  (InvokeModelWithBidirectional    │                    │
│   Stream)                         │                    ▼
└───────────────────────────────────┘    ┌───────────────────────────────────────┐
            │                            │  DynamoDB / S3 / RDS                  │
            ▼                            └───────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────────────┐
│                           AgentCore Memory                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  会話履歴(ASR転写+NPC応答) | メトリクス | ゴール状態 | セッションメタデータ │  │
│  │  保持期間: 365日 (Short-Term Memory)                                    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 認証アーキテクチャ

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         認証フロー全体図                                       │
│                                                                              │
│  ┌─────────────┐                                                            │
│  │ フロントエンド │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│    ┌────┴────────────────────────────────────────────────┐                   │
│    │                                                      │                   │
│    ▼                                                      ▼                   │
│  ┌──────────────────┐                          ┌──────────────────┐          │
│  │ Cognito User Pool │                          │ Cognito Identity │          │
│  │ (ログイン→JWT)    │                          │ Pool (一時認証情報)│          │
│  └──────────────────┘                          └──────────────────┘          │
│    │                                                      │                   │
│    │ JWT                                                  │ SigV4             │
│    │                                                      │                   │
│    ├──▶ AgentCore Identity → realtime-scoring             │                   │
│    ├──▶ API Gateway → Lambda (既存API)                    │                   │
│    │                                                      │                   │
│    │                                                      ▼                   │
│    │                                           ┌──────────────────┐          │
│    │                                           │ AgentCore Runtime │          │
│    │                                           │ nova-sonic-bidi   │          │
│    │                                           │ (WebSocket /ws)   │          │
│    │                                           └──────────────────┘          │
│    │                                                                         │
│    │  Step Functions (IAMロール)                                              │
│    └──▶ feedback-analysis / video-analysis / audio-analysis                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 認証方式サマリー

| エージェント/API | 呼び出し元 | 認証方式 | 変更 |
|----------------|-----------|---------|------|
| nova-sonic BidiAgent | フロントエンド | SigV4（Cognito Identity Pool） | 新規 |
| realtime-scoring | フロントエンド | AgentCore Identity JWT | 既存維持 |
| feedback-analysis | Step Functions | IAMロール | 既存維持 |
| video-analysis | Step Functions | IAMロール | 既存維持 |
| audio-analysis | Step Functions | IAMロール | 既存維持 |
| REST API (Lambda) | フロントエンド | Cognito Authorizer JWT | 既存維持 |

---

## 4. データフローアーキテクチャ

### 4.1 音声対話フロー（Nova 2 Sonic）

```
User（マイク）
  │ PCM 16kHz
  ▼
Frontend (AudioWorklet音声キャプチャ)
  │ Base64エンコード
  ▼
NovaSonicService → SigV4WebSocketClient
  │ WebSocket (SigV4認証)
  ▼
AgentCore Runtime (nova-sonic-bidi-agent)
  │
  ├──▶ Nova 2 Sonic (InvokeModelWithBidirectionalStream)
  │         │
  │         ├── ASR転写テキスト → フロントエンド → チャット表示
  │         │                                   → スコアリングAPI呼び出し
  │         ├── NPC応答テキスト → フロントエンド → チャット表示
  │         └── 音声出力(LPCM 24kHz) → フロントエンド → AudioOutputManager
  │                                                      ├── Nova音声再生(AudioWorklet)
  │                                                      └── Polly音声再生(デフォルト)
  │
  └──▶ AgentCore Memory (会話履歴保存)
```

### 4.2 Cross-modal テキスト入力フロー

```
User（テキスト入力欄）
  │ テキストメッセージ
  ▼
Frontend (NovaSonicService)
  │ WebSocket
  ▼
AgentCore Runtime (nova-sonic-bidi-agent)
  │ contentStart(TEXT, USER) → textInput → contentEnd
  ▼
Nova 2 Sonic → 音声+テキスト統合理解 → 音声応答
```

### 4.3 スコアリングフロー（既存維持）

```
Frontend (ASR転写テキスト受信後)
  │ JWT認証
  ▼
AgentCore Identity → AgentCore Runtime (realtime-scoring)
  │
  ├──▶ Bedrock Claude 4.5 Haiku
  └──▶ AgentCore Memory (メトリクス保存)
  │
  ▼
スコア結果 → Frontend → UI更新（怒りメーター、信頼度、進捗度）
```

### 4.4 Session Continuationフロー

```
AgentCore Runtime (nova-sonic-bidi-agent) コンテナ内

  [6分経過] → MONITORING状態
       │
       ▼ アシスタントAUDIO contentStart検出
  ┌─────────────────────────────────────────────┐
  │ 並行処理:                                     │
  │  A) 音声バッファリング開始（10秒リングバッファ） │
  │  B) 次Nova 2 Sonicセッション作成               │
  │     - sessionStart(endpointingSensitivity)    │
  │     - promptStart(audioOutputConfig)          │
  │     - systemPrompt送信                        │
  │     - 会話履歴テキスト転送                     │
  └─────────────────────────────────────────────┘
       │
       ▼ 次セッション準備完了
  ┌─────────────────────────────────────────────┐
  │ ハンドオフ:                                    │
  │  - バッファ音声を次セッションに送信             │
  │  - アクティブセッション切り替え                 │
  │  - 旧セッション閉じる                          │
  │  - フロントエンドへの配信は途切れない           │
  └─────────────────────────────────────────────┘
       │
       ▼ 失敗時
  Conversation Resumption（AgentCore Memory ListEvents → 履歴復元）
```

### 4.5 評価画面データ取得フロー（既存維持）

```
User → Frontend → API Gateway → Lambda (evaluation-api)
                                       │
                                       ├──▶ AgentCore Memory (ListEvents)
                                       │         → 会話履歴、メトリクス
                                       │
                                       └──▶ S3
                                                 → フィードバック、動画分析結果
                                                 │
                                                 ▼
                                       Frontend → 評価画面表示
```

---

## 5. CDKスタック構成

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         InfrastructureStack                                     │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  既存リソース（継続使用）                                                  │   │
│  │  - Cognito User Pool                                                    │   │
│  │  - Cognito Identity Pool（権限追加: InvokeAgentRuntimeWithWebSocketStream）│  │
│  │  - DynamoDB (Scenarios, NPC, Users, Sessions)                           │   │
│  │  - S3 (Videos, Audio, Sessions, PDF)                                    │   │
│  │  - API Gateway REST (その他エンドポイント)                                │   │
│  │  - Step Functions (セッション分析)                                       │   │
│  │  - AgentCore Runtime: realtime-scoring-agent                            │   │
│  │  - AgentCore Runtime: feedback-analysis-agent                           │   │
│  │  - AgentCore Runtime: video-analysis-agent                              │   │
│  │  - AgentCore Runtime: audio-analysis-agent                              │   │
│  │  - AgentCore Memory                                                     │   │
│  │  - Amazon Polly (SSML + Viseme)                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  新規リソース（追加）                                                     │   │
│  │  - AgentCore Runtime: nova-sonic-bidi-agent（IAM認証、WebSocket /ws）    │   │
│  │  - IAM Policy: Cognito Authenticated Role                               │   │
│  │    → bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream             │   │
│  │  - IAM Policy: nova-sonic Runtime Role                                  │   │
│  │    → bedrock:InvokeModelWithBidirectionalStream（コンストラクト標準化）    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  削除リソース                                                            │   │
│  │  - TranscribeWebSocketConstruct                                         │   │
│  │    - API Gateway WebSocket                                              │   │
│  │    - Lambda: ConnectHandler, DisconnectHandler, DefaultHandler           │   │
│  │    - DynamoDB: TranscribeConnections                                    │   │
│  │  - AgentCore Runtime: npc-conversation-agent                            │   │
│  │  - コンテナイメージ: npc-conversation-agent                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 環境別デプロイ構成

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AWS Account                                        │
│                                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
│  │      dev環境        │  │    staging環境      │  │      prod環境       │     │
│  │                     │  │                     │  │                     │     │
│  │  AgentCore Runtime  │  │  AgentCore Runtime  │  │  AgentCore Runtime  │     │
│  │  - nova-sonic-bidi  │  │  - nova-sonic-bidi  │  │  - nova-sonic-bidi  │     │
│  │  - scoring          │  │  - scoring          │  │  - scoring          │     │
│  │  - feedback         │  │  - feedback         │  │  - feedback         │     │
│  │  - video            │  │  - video            │  │  - video            │     │
│  │  - audio            │  │  - audio            │  │  - audio            │     │
│  │                     │  │                     │  │                     │     │
│  │  Cognito User Pool  │  │  Cognito User Pool  │  │  Cognito User Pool  │     │
│  │  + Identity Pool    │  │  + Identity Pool    │  │  + Identity Pool    │     │
│  │  (SigV4権限追加)    │  │  (SigV4権限追加)    │  │  (SigV4権限追加)    │     │
│  │                     │  │                     │  │                     │     │
│  │  環境変数:          │  │  環境変数:          │  │  環境変数:          │     │
│  │  VITE_NOVA_SONIC_   │  │  VITE_NOVA_SONIC_   │  │  VITE_NOVA_SONIC_   │     │
│  │  AGENT_ENDPOINT     │  │  AGENT_ENDPOINT     │  │  AGENT_ENDPOINT     │     │
│  │  VITE_NOVA_SONIC_   │  │  VITE_NOVA_SONIC_   │  │  VITE_NOVA_SONIC_   │     │
│  │  AGENT_REGION       │  │  AGENT_REGION       │  │  AGENT_REGION       │     │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘     │
│                                                                                 │
│  ※ npc-conversation AgentCore Runtime: 全環境で削除                              │
│  ※ TranscribeWebSocketConstruct: 全環境で削除                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. デプロイ手順

### 7.1 CDKデプロイコマンド

```bash
# 開発環境
cd cdk
npm run deploy:dev

# ステージング環境
npm run deploy:staging

# 本番環境
npm run deploy:prod
```

### 7.2 デプロイ順序（ビッグバン移行）

CDKデプロイは1回のコマンドで以下を同時に実行します:

```
Step 1: 新規リソース作成
  ├── nova-sonic-bidi-agent AgentCore Runtime作成
  │   ├── IAMロール作成（bedrock:InvokeModelWithBidirectionalStream含む）
  │   ├── エージェントコードS3アップロード
  │   └── CfnRuntime作成（IAM認証モード）
  │
  └── Cognito Identity Pool認証済みロール更新
      └── bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream追加

Step 2: 削除リソース
  ├── TranscribeWebSocketConstruct削除
  │   ├── API Gateway WebSocket削除
  │   ├── Lambda×3削除
  │   └── DynamoDB TranscribeConnections削除
  │
  └── npc-conversation AgentCore Runtime削除

Step 3: フロントエンド更新
  ├── 環境変数更新
  │   ├── VITE_TRANSCRIBE_WEBSOCKET_URL 削除
  │   ├── VITE_NOVA_SONIC_AGENT_ENDPOINT 追加
  │   └── VITE_NOVA_SONIC_AGENT_REGION 追加
  │
  └── ビルド・デプロイ
```

### 7.3 ファイル変更一覧

| 操作 | ファイル/ディレクトリ | 内容 |
|------|---------------------|------|
| 修正 | `cdk/lib/constructs/agentcore/agentcore-runtime.ts` | `bedrock:InvokeModelWithBidirectionalStream` を標準権限に追加 |
| 修正 | `cdk/lib/constructs/auth.ts` | Cognito Identity Pool認証済みロールに `InvokeAgentRuntimeWithWebSocketStream` 追加 |
| 追加 | `cdk/agents/nova-sonic-bidi/` | nova-sonic BidiAgentコンテナコード |
| 修正 | CDKスタック（nova-sonic-bidi-agent インスタンス化追加） | AgentCore Runtime新規作成 |
| 削除 | CDKスタック（npc-conversation インスタンス化削除） | AgentCore Runtime削除 |
| 削除 | CDKスタック（TranscribeWebSocketConstruct インスタンス化削除） | Transcribe WebSocket削除 |
| 削除 | `cdk/lib/constructs/api/transcribe-websocket.ts` | CDKコンストラクトファイル削除 |
| 削除 | `cdk/lambda/transcribeWebSocket/` | Lambda関数コード削除 |
| 削除 | `cdk/agents/npc-conversation/` | npc-conversationコンテナコード削除 |
| 追加 | `frontend/src/services/NovaSonicService.ts` | Nova 2 Sonic WebSocketサービス |
| 追加 | `frontend/src/services/SigV4WebSocketClient.ts` | SigV4署名付きWebSocketクライアント |
| 追加 | `frontend/src/services/AudioOutputManager.ts` | 音声出力管理（Polly/Nova切替） |
| 削除 | `frontend/src/services/TranscribeService.ts` | Transcribeサービス削除 |
| 削除 | `frontend/src/services/SilenceDetector.ts` | 無音検出削除 |
| 修正 | `frontend/.env.*` | 環境変数更新 |
| 修正 | 会話画面コンポーネント | NovaSonicService統合 |
| 追加 | ユーザー設定ページ | endpointingSensitivity設定UI |

---

## 8. ロールバック手順

### 8.1 ロールバック戦略

ビッグバン移行のため、ロールバックは旧バージョンのCDKコードを再デプロイします。

```bash
# 1. 旧バージョンのCDKコードをチェックアウト
git checkout <previous-commit>

# 2. 旧リソースを再デプロイ
cd cdk
npm run deploy:dev

# 3. フロントエンドも旧バージョンに戻す
cd frontend
npm run build
# デプロイ
```

### 8.2 データ復旧

| データ | 影響 | 復旧方法 |
|-------|------|---------|
| AgentCore Memory | 影響なし（365日保持） | 復旧不要 |
| S3 (動画、音声、PDF) | 影響なし | 復旧不要 |
| DynamoDB (Sessions等) | 影響なし | 復旧不要 |
| Transcribe接続管理DynamoDB | CDKデプロイで削除 | ロールバック時にCDKが再作成 |

### 8.3 ロールバック判断基準

| 条件 | アクション |
|------|----------|
| nova-sonic BidiAgent接続失敗率 > 50% | ロールバック実行 |
| Session Continuation成功率 < 80% | 調査後判断 |
| ASR認識精度が著しく低下 | ロールバック実行 |
| 音声出力が再生不可 | Pollyフォールバック確認後判断 |

---

## 9. 監視・アラート構成

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CloudWatch                                              │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  メトリクス                                                              │   │
│  │  - AgentCore Runtime Invocations (nova-sonic-bidi)                      │   │
│  │  - AgentCore Runtime Errors (nova-sonic-bidi)                           │   │
│  │  - AgentCore Runtime Latency (nova-sonic-bidi)                          │   │
│  │  - AgentCore Runtime Invocations (scoring) [既存]                       │   │
│  │  - AgentCore Runtime Errors (scoring) [既存]                            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  アラーム                                                                │   │
│  │  - nova-sonic Error Rate > 10% → SNS通知                                │   │
│  │  - nova-sonic Latency > 60s → SNS通知                                   │   │
│  │  - scoring Error Rate > 10% → SNS通知 [既存]                            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  ログ                                                                   │   │
│  │  - /aws/bedrock-agentcore/runtimes/nova-sonic-bidi (30日保持) [新規]     │   │
│  │    - Session Continuationイベント                                        │   │
│  │    - usageEvent（トークン使用量）                                         │   │
│  │    - Conversation Resumptionイベント                                     │   │
│  │  - /aws/bedrock-agentcore/runtimes/realtime-scoring (30日保持) [既存]    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  コスト監視                                                              │   │
│  │  - AWS Budgets月次アラート [既存]                                         │   │
│  │  - Nova 2 Sonic固有の追加監視は不要                                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Step Functions アーキテクチャ（既存維持）

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Session Analysis Step Functions                         │
│                         ※ 変更なし（既存維持）                                    │
│                                                                                 │
│  ┌─────────────┐                                                               │
│  │  セッション   │                                                               │
│  │  終了トリガー │                                                               │
│  └─────────────┘                                                               │
│         │                                                                       │
│         ▼                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Parallel State                                  │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │   │
│  │  │ AgentCore Runtime│  │ AgentCore Runtime│  │ AgentCore Runtime│         │   │
│  │  │ feedback-analysis│  │ video-analysis  │  │ audio-analysis  │         │   │
│  │  │ -agent          │  │ -agent          │  │ -agent          │         │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘         │   │
│  │         │                    │                    │                    │   │
│  │         ▼                    ▼                    ▼                    │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │   │
│  │  │  S3 保存        │  │  S3 保存        │  │  S3 保存        │         │   │
│  │  │  feedback.json  │  │  video.json     │  │  audio.json     │         │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│         │                                                                       │
│         ▼                                                                       │
│  ┌─────────────────┐                                                           │
│  │  完了通知        │                                                           │
│  └─────────────────┘                                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

**作成日**: 2026-03-11
**ベース**: AgentCore Runtime Migration Deployment Architecture (2026-01-08)
**バージョン**: 1.0
