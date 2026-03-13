# Code Generation Plan: Nova 2 Sonic移行

## 概要
Nova 2 Sonic移行のコード生成プランです。全設計成果物（NFR Requirements、NFR Design、Infrastructure Design）に基づき、バックエンド（AgentCore Runtime BidiAgent）、CDKインフラ、フロントエンドの順に実装します。

## 前提条件
- NFR Requirements: 完了（承認済み）
- NFR Design: 完了（承認済み）
- Infrastructure Design: 完了（承認済み）
- 既存コードベース分析: 完了

## 要件トレーサビリティ

| 要件ID | 概要 | 実装ステップ |
|--------|------|-------------|
| FR-001 | Nova 2 Sonic双方向ストリーミング接続 | Step 1, 5, 6 |
| FR-002 | Cross-modal Input対応 | Step 1, 6 |
| FR-003 | NPC対話生成 | Step 1 |
| FR-004 | ASR転写テキスト取得 | Step 1, 6 |
| FR-005 | Polly音声合成継続 | Step 7 |
| FR-006 | Session Continuation | Step 1 |
| FR-007 | 会話履歴管理 | Step 1 |
| FR-008 | リアルタイムスコアリング統合 | Step 8 |
| FR-009 | フロントエンドサービス置き換え | Step 5, 6, 7, 8 |
| FR-010 | AgentCore Runtime BidiAgentデプロイ | Step 1, 3 |
| FR-011 | ターン検出設定 | Step 1, 9 |
| FR-012 | エラーハンドリング | Step 1, 6, 8 |
| FR-013 | コスト試算ドキュメント更新 | Step 12 |
| NFR-001〜008 | 非機能要件 | 全ステップで考慮 |

---

## 実行ステップ

### Step 1: バックエンド - nova-sonic BidiAgentコンテナコード作成
`cdk/agents/nova-sonic-bidi/` ディレクトリに以下のファイルを作成:

- [x] `Dockerfile` - コンテナイメージ定義（linux/arm64、Python 3.12、FastAPI + uvicorn）
- [x] `requirements.txt` - Python依存関係（strands-agents, strands-agents-bedrock, bedrock-agentcore-memory, fastapi, uvicorn）
- [x] `agent.py` - BidiAgentエントリーポイント（FastAPI /ws WebSocketエンドポイント + /ping ヘルスチェック）
  - BidiNovaSonicModel初期化
  - BidiAgent初期化
  - WebSocket接続ハンドラ（session_start, audio, text, session_end）
  - Nova 2 Sonicイベント処理（ASR転写、NPC応答、音声出力のフロントエンド転送）
  - AgentCore Memory連携（会話履歴保存）
- [x] `session_transition_manager.py` - Session Continuation管理
  - 6分経過でMONITORING状態遷移
  - アシスタントAUDIO contentStart検出
  - 10秒リングバッファ音声バッファリング
  - バックグラウンド次セッション作成
  - ハンドオフ実行
  - 失敗時Conversation Resumptionフォールバック
- [x] `conversation_resumption.py` - Conversation Resumptionリカバリ
  - AgentCore Memory ListEvents APIで会話履歴取得
  - 新セッション作成 + 履歴テキスト再送信
  - 最大1回リトライ
- [x] `event_handler.py` - Nova 2 Sonicイベント処理
  - contentStart/contentEnd/textOutput/audioOutput/usageEventの処理
  - ASR転写テキスト（USER, FINAL/SPECULATIVE）の抽出
  - NPC応答テキスト（ASSISTANT, FINAL/SPECULATIVE）の抽出
  - 音声出力データ（LPCM 24kHz Base64）の転送
- [x] `memory_manager.py` - AgentCore Memory連携
  - 会話履歴保存（ASR転写 + NPC応答テキスト）
  - メトリクス保存
  - セッションメタデータ保存（nova_sonic_session_count, endpointing_sensitivity）
  - ListEvents APIによる履歴取得（Conversation Resumption用）
- [x] `prompts.py` - システムプロンプト管理
  - 日本語/英語対応のNPCシステムプロンプト
  - 既存npc-conversation/prompts.pyをベースに移行
- [x] `models.py` - データモデル定義
  - WebSocketメッセージ型（session_start, audio, text, session_end）
  - レスポンスイベント型（asr_transcript, npc_response, audio_output, session_status, error）
  - SessionTransitionConfig

### Step 2: バックエンド - nova-sonic BidiAgentコードサマリー
- [x] Step 1で生成したコードの概要を記録

### Step 3: CDKインフラ - AgentCore Runtimeコンストラクト修正 + nova-sonic BidiAgentインスタンス化
- [x] `cdk/lib/constructs/agentcore/agentcore-runtime.ts` 修正
  - `bedrock:InvokeModelWithBidirectionalStream` を標準Bedrock権限に追加
- [x] `cdk/lib/constructs/auth.ts` 修正
  - Cognito Identity Pool認証済みロールに `bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream` 権限追加
- [x] `cdk/lib/infrastructure-stack.ts` 修正
  - nova-sonic-bidi-agent AgentCore Runtimeインスタンス化追加（IAM認証、環境変数設定）
  - npc-conversation AgentCore Runtimeインスタンス化削除
  - TranscribeWebSocketConstructインスタンス化削除
  - CfnOutput追加（NovaSonicAgentEndpoint）
- [x] `cdk/lib/constructs/api.ts` 修正
  - TranscribeWebSocketConstruct関連のimport・プロパティ・インスタンス化を削除

### Step 4: CDKインフラ - 削除対象ファイル・ディレクトリ
- [x] `cdk/lib/constructs/api/transcribe-websocket.ts` 削除
- [x] `cdk/lambda/transcribeWebSocket/` ディレクトリ削除
- [x] `cdk/agents/npc-conversation/` ディレクトリ削除

### Step 5: フロントエンド - SigV4WebSocketClient作成
`frontend/src/services/SigV4WebSocketClient.ts` を新規作成:

- [x] SigV4署名付きWebSocket URL生成
  - Cognito Identity Poolから一時認証情報取得（fetchAuthSession）
  - @aws-sdk/signature-v4 + @aws-crypto/sha256-js でSigV4署名
  - AgentCore Runtime WebSocketエンドポイントURL構築
- [x] WebSocket接続管理（connect, disconnect, send, onMessage, onClose, onError）
- [x] 接続状態管理

### Step 6: フロントエンド - NovaSonicService作成
`frontend/src/services/NovaSonicService.ts` を新規作成（TranscribeService + AgentCoreService.chatWithNPC置き換え）:

- [x] SigV4WebSocketClient統合
- [x] セッション管理（connect, disconnect, isConnected）
- [x] 音声入力送信（sendAudioChunk - PCM 16kHz Base64）
- [x] テキスト入力送信（sendTextMessage - Cross-modal Input）
- [x] イベントリスナー登録
  - onAsrTranscript（ASR転写テキスト受信）
  - onNpcResponse（NPC応答テキスト受信）
  - onAudioOutput（音声出力データ受信）
  - onSessionStatus（セッション状態変更）
  - onError（エラー通知）
- [x] エラーハンドリング（SESSION_RECOVERY_FAILED, MODEL_TIMEOUT, CONNECTION_ERROR, AUTH_ERROR）
- [x] SessionConfig型定義（sessionId, scenarioId, npcConfig, endpointingSensitivity, language, agentCoreEndpoint, region）

### Step 7: フロントエンド - AudioOutputManager作成
`frontend/src/services/AudioOutputManager.ts` を新規作成:

- [x] 音声ソース切り替え管理（'polly' | 'nova-sonic'、デフォルト: 'polly'）
- [x] Nova 2 Sonic音声再生（AudioWorklet - 24kHz LPCM Base64デコード → Float32Array → 連続再生）
- [x] AudioWorkletProcessor定義（NovaSonicAudioProcessor）
- [x] Polly音声再生（既存PollyService/AudioService連携）
- [x] ボリューム制御（GainNode）
- [x] 停止・再生状態管理

### Step 8: フロントエンド - ConversationPage統合
`frontend/src/pages/ConversationPage.tsx` を修正:

- [x] TranscribeService → NovaSonicService置き換え
  - import変更
  - transcribeServiceRef → novaSonicServiceRef
  - initializeConnection → NovaSonicService.connect
  - startListening → NovaSonicService経由の音声キャプチャ
  - stopListening → NovaSonicService.disconnect
- [x] AgentCoreService.chatWithNPC() 呼び出し削除
  - NPC応答はNovaSonicServiceのonNpcResponseコールバックで受信
- [x] ASR転写テキスト受信フロー更新
  - onAsrTranscriptコールバックでチャットUI更新 + スコアリングAPI呼び出し
- [x] NPC応答テキスト受信フロー更新
  - onNpcResponseコールバックでチャットUI更新 + Polly音声合成
- [x] AudioOutputManager統合
  - Nova 2 Sonic音声出力受信時の処理
  - Polly/Nova切り替え対応
- [x] エラーハンドリング更新
  - NovaSonicServiceのonErrorコールバック処理
  - エラーUI表示（セッション再開ボタン）
- [x] 環境変数参照更新
  - VITE_TRANSCRIBE_WEBSOCKET_URL → VITE_NOVA_SONIC_AGENT_ENDPOINT + VITE_NOVA_SONIC_AGENT_REGION
- [x] SilenceDetector関連コード削除（silenceThreshold状態、setSilenceThreshold呼び出し等）

### Step 9: フロントエンド - endpointingSensitivity設定UI
`frontend/src/components/conversation/SessionSettingsPanel.tsx` を修正:

- [x] endpointingSensitivity設定セクション追加（HIGH/MEDIUM/LOW ラジオボタン or セレクト）
- [x] デフォルト値: MEDIUM
- [x] localStorage永続化
- [x] i18nキー追加（日英対応: "ターン検出感度" / "Turn Detection Sensitivity"）
- [x] 「セッション中は変更が反映されません」注意書き表示
- [x] silenceThreshold設定の削除（SilenceDetector廃止に伴い不要）

### Step 10: フロントエンド - 廃止ファイル削除
- [x] `frontend/src/services/TranscribeService.ts` 削除
- [x] `frontend/src/services/SilenceDetector.ts` 削除
- [x] AgentCoreService.tsからchatWithNPC()メソッド削除

### Step 11: フロントエンド - 環境変数更新 + npm依存関係追加
- [x] `frontend/.env` / `.env.local` 更新（.env.dev/.staging/.prodは存在しないため対象外）
  - VITE_TRANSCRIBE_WEBSOCKET_URL 削除
  - VITE_NOVA_SONIC_AGENT_ENDPOINT 追加（プレースホルダー）
  - VITE_NOVA_SONIC_AGENT_REGION 追加
- [x] `cdk/.env.dev` / `.env.staging` / `.env.prod` 確認済み（Transcribe関連設定なし、変更不要）
- [x] `frontend/package.json` に依存関係追加
  - @aws-crypto/sha256-js
  - @aws-sdk/protocol-http
  - @aws-sdk/signature-v4
- [x] i18n翻訳ファイル更新（日英）
  - endpointingSensitivity関連キー追加（ja.json, en.json）
  - silenceThreshold/silenceNote キー削除（SilenceDetector廃止に伴い不要）
- [x] SidebarPanel.tsx からsilenceThreshold/setSilenceThreshold props削除

### Step 12: ドキュメント - コスト試算更新
- [x] `docs/cost/コスト試算.md` 更新（FR-013）
  - Transcribe Streaming廃止コスト削除
  - Nova 2 Sonicトークン課金追加
  - AgentCore Runtime（nova-sonic BidiAgent）コスト追加
  - NPC会話AgentCore Runtime廃止コスト削除
  - 1人あたりコスト・コスト構成比の再計算

---

## 依存関係

```
Step 1 (BidiAgentコンテナ) → Step 2 (サマリー)
Step 3 (CDKインフラ修正) → Step 4 (ファイル削除)  ※Step 1完了後に実行
Step 5 (SigV4Client) → Step 6 (NovaSonicService) → Step 7 (AudioOutputManager)
Step 6, 7 → Step 8 (ConversationPage統合)
Step 8 → Step 9 (設定UI) → Step 10 (廃止ファイル削除) → Step 11 (環境変数)
Step 11 → Step 12 (ドキュメント)
```

---

## 推定スコープ

| カテゴリ | 新規ファイル | 修正ファイル | 削除ファイル |
|---------|------------|------------|------------|
| バックエンド（BidiAgent） | 8 | 0 | 0 |
| CDKインフラ | 0 | 4 | 1 |
| フロントエンド | 3 | 3+ | 2 |
| Lambda | 0 | 0 | 1ディレクトリ |
| コンテナ | 0 | 0 | 1ディレクトリ |
| ドキュメント | 0 | 1 | 0 |
| 合計 | 11 | 8+ | 4+ |

---

**作成日**: 2026-03-11
**バージョン**: 1.0
