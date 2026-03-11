# 論理コンポーネント設計: Nova 2 Sonic移行

## 1. 概要

本ドキュメントは、Nova 2 Sonic移行における論理コンポーネントの設計を定義します。
AgentCore Runtime Migration論理コンポーネント設計（2026-01-08）をベースに、
Nova 2 Sonic BidiAgent、Session Continuation、SigV4認証、音声出力管理の
コンポーネントを追加・変更します。

---

## 2. システムアーキテクチャ概要

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              フロントエンド                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         React Application                       │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │    │
│  │  │ 会話画面      │  │ 評価画面      │  │ 設定画面      │          │    │
│  │  │ (音声+テキスト)│  │              │  │ (sensitivity) │          │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │    │
│  │        │                   │                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │    │
│  │  │NovaSonicService│ │AudioOutput   │  │SigV4WebSocket│          │    │
│  │  │              │  │Manager       │  │Client        │          │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│         │ SigV4 WebSocket          │ JWT                                │
│         ▼                          ▼                                    │
└──────────────────────────────────────────────────────────────────────────┘
          │                          │
          ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         AgentCore Runtime                                │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │ nova-sonic BidiAgent  │  │ realtime-scoring     │                     │
│  │ (WebSocket /ws)       │  │ (AgentCore Identity) │                     │
│  │  ┌────────────────┐  │  └──────────────────────┘                     │
│  │  │SessionTransition│  │                                               │
│  │  │Manager         │  │                                               │
│  │  └────────────────┘  │                                               │
│  └──────────────────────┘                                               │
│            │                                                             │
│            ▼                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      AgentCore Memory                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Amazon Nova 2 Sonic                                    │
│              (InvokeModelWithBidirectionalStream)                         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. バックエンドコンポーネント

### 3.1 nova-sonic BidiAgent

**名前**: `nova-sonic-bidi-agent`
**種別**: AgentCore Runtime（WebSocket /ws）
**認証**: SigV4（Cognito Identity Pool経由）

**責務**:
- Nova 2 Sonicとの双方向ストリーミング管理
- 音声入力の転送（フロントエンド → Nova 2 Sonic）
- ASR転写テキスト・NPC応答テキスト・音声出力の転送（Nova 2 Sonic → フロントエンド）
- Cross-modal テキスト入力の処理
- Session Continuation（8分セッション制限対応）
- Conversation Resumption（エラーリカバリ）
- 会話履歴のAgentCore Memory保存

**内部構成**:
```python
# コンテナ内の主要コンポーネント
nova-sonic-bidi-agent/
├── agent.py                    # BidiAgentエントリーポイント
├── session_transition_manager.py  # Session Continuation管理
├── conversation_resumption.py  # Conversation Resumptionリカバリ
├── websocket_io.py             # AgentCore Runtime WebSocket I/O
├── event_handler.py            # Nova 2 Sonicイベント処理
├── memory_manager.py           # AgentCore Memory連携
├── tools.py                    # ツール定義（将来拡張用）
├── prompts.py                  # システムプロンプト管理
├── models.py                   # データモデル定義
├── Dockerfile                  # コンテナイメージ
└── requirements.txt            # Python依存関係
```

**入力（WebSocketメッセージ）**:
```json
// 音声入力
{
  "type": "audio",
  "data": "<Base64エンコードPCM 16kHz>",
  "sessionId": "string",
  "scenarioId": "string"
}

// テキスト入力（Cross-modal）
{
  "type": "text",
  "content": "テキストメッセージ",
  "sessionId": "string"
}

// セッション開始
{
  "type": "session_start",
  "sessionId": "string",
  "scenarioId": "string",
  "npcConfig": { "name": "string", "personality": "string", "role": "string" },
  "endpointingSensitivity": "HIGH" | "MEDIUM" | "LOW",
  "language": "ja" | "en"
}

// セッション終了
{
  "type": "session_end",
  "sessionId": "string"
}
```

**出力（WebSocketメッセージ）**:
```json
// ASR転写テキスト
{
  "type": "asr_transcript",
  "text": "ユーザーの発話テキスト",
  "isFinal": true
}

// NPC応答テキスト
{
  "type": "npc_response",
  "text": "NPC応答テキスト",
  "generationStage": "SPECULATIVE" | "FINAL"
}

// 音声出力
{
  "type": "audio_output",
  "data": "<Base64エンコードLPCM 24kHz>"
}

// セッション状態
{
  "type": "session_status",
  "status": "active" | "transitioning" | "error",
  "novaSonicSessionCount": 1
}

// エラー
{
  "type": "error",
  "errorType": "SESSION_RECOVERY_FAILED" | "MODEL_TIMEOUT" | "CONNECTION_ERROR",
  "message": "エラーメッセージ"
}
```

**依存関係**:
- Amazon Nova 2 Sonic（Bedrock InvokeModelWithBidirectionalStream）
- AgentCore Memory（会話履歴保存・取得）
- Strands Agents SDK（BidiAgent, BidiNovaSonicModel）

### 3.2 SessionTransitionManager

**責務**:
- Nova 2 Sonicセッションのライフサイクル管理
- 8分制限到達前のシームレスなセッション切り替え
- 音声バッファリング（10秒リングバッファ）
- 切り替え失敗時のConversation Resumptionフォールバック

**主要パラメータ**:
```python
class SessionTransitionConfig:
    transition_threshold_seconds: int = 360    # 6分で監視開始
    audio_buffer_duration_seconds: int = 10    # 10秒バッファ
    audio_start_timeout_seconds: int = 100     # アシスタント発話待機
    next_session_ready_timeout_seconds: int = 30  # 次セッション準備タイムアウト
```

**状態遷移**:
```
ACTIVE → MONITORING → BUFFERING → HANDOFF → ACTIVE（新セッション）
                                     ↓ 失敗
                              CONVERSATION_RESUMPTION → ACTIVE or ERROR
```

### 3.3 realtime-scoring（既存維持）

**変更点**: なし（既存AgentCore Runtime移行のまま維持）
**認証**: AgentCore Identity (JWT)
**呼び出し元**: フロントエンド（ASR転写テキスト受信後にスコアリングAPI呼び出し）

---

## 4. フロントエンドコンポーネント

### 4.1 NovaSonicService（新規 - TranscribeService置き換え）

**責務**:
- AgentCore Runtime WebSocket接続管理（SigV4認証）
- 音声入力の送信（AudioWorkletからPCM 16kHzを取得しBase64エンコード）
- テキスト入力の送信（Cross-modal Input）
- レスポンスイベントの処理・配信
- セッション開始・終了の管理

**インターフェース**:
```typescript
interface NovaSonicService {
  // 接続管理
  connect(config: SessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // 音声入力
  sendAudioChunk(base64PcmData: string): void;

  // テキスト入力（Cross-modal）
  sendTextMessage(text: string): void;

  // イベントリスナー
  onAsrTranscript(callback: (text: string, isFinal: boolean) => void): void;
  onNpcResponse(callback: (text: string, stage: 'SPECULATIVE' | 'FINAL') => void): void;
  onAudioOutput(callback: (base64Data: string) => void): void;
  onSessionStatus(callback: (status: SessionStatus) => void): void;
  onError(callback: (error: NovaSonicError) => void): void;
}

interface SessionConfig {
  sessionId: string;
  scenarioId: string;
  npcConfig: NpcConfig;
  endpointingSensitivity: 'HIGH' | 'MEDIUM' | 'LOW';
  language: 'ja' | 'en';
  agentCoreEndpoint: string;
  region: string;
}
```

### 4.2 SigV4WebSocketClient（新規）

**責務**:
- Cognito Identity Poolから一時認証情報を取得
- SigV4署名付きWebSocket URLを生成
- WebSocket接続の確立・維持・切断

**インターフェース**:
```typescript
interface SigV4WebSocketClient {
  connect(endpoint: string, region: string): Promise<WebSocket>;
  disconnect(): void;
  send(message: string | ArrayBuffer): void;
  onMessage(callback: (data: MessageEvent) => void): void;
  onClose(callback: (event: CloseEvent) => void): void;
  onError(callback: (event: Event) => void): void;
}
```

### 4.3 AudioOutputManager（新規）

**責務**:
- Polly音声とNova 2 Sonic音声の切り替え管理
- Nova 2 Sonic音声のAudioWorklet再生
- Polly SSML + Viseme音声の再生（既存ロジック活用）
- ボリューム制御

**インターフェース**:
```typescript
interface AudioOutputManager {
  // 音声ソース切り替え
  setAudioSource(source: 'polly' | 'nova-sonic'): void;
  getAudioSource(): 'polly' | 'nova-sonic';

  // Nova 2 Sonic音声再生
  playNovaSonicChunk(base64LpcmData: string): void;

  // Polly音声再生（既存）
  playPollyAudio(text: string, ssml?: boolean): Promise<void>;

  // 制御
  stop(): void;
  setVolume(volume: number): void;
  isPlaying(): boolean;
}
```

**AudioWorklet構成**:
```
AudioOutputManager
  ├── NovaSonicAudioProcessor (AudioWorkletProcessor)
  │   └── 24kHz LPCM Base64 → Float32Array → 連続再生
  ├── GainNode (ボリューム制御)
  └── AudioContext.destination (スピーカー出力)
```

### 4.4 endpointingSensitivity設定UI（新規）

**配置**: ユーザー設定ページ（Q3=B）

**責務**:
- endpointingSensitivity（HIGH/MEDIUM/LOW）の選択UI
- 設定値の永続化（localStorage or ユーザー設定API）
- セッション開始時に設定値をNovaSonicServiceに渡す

**UI仕様**:
```typescript
// ユーザー設定ページ内のセクション
interface EndpointingSensitivitySetting {
  value: 'HIGH' | 'MEDIUM' | 'LOW';
  defaultValue: 'MEDIUM';
  label: string;  // i18n: "ターン検出感度" / "Turn Detection Sensitivity"
  description: string;  // i18n: 各レベルの説明
  // セッション中は変更不可の注意書き表示
}
```

**注意事項**:
- セッション開始時（sessionStartイベント）に適用
- セッション中の変更は不可（次回Session Continuation切り替え時または新セッション開始時に適用）
- 設定画面に「セッション中は変更が反映されません」の注意書きを表示

---

## 5. 認証フロー設計

### 5.1 nova-sonic BidiAgent（SigV4認証）

```
┌─────────────┐  1.ログイン  ┌──────────────┐  2.JWT  ┌─────────────────┐
│ フロントエンド │────────────▶│ Cognito      │────────▶│ フロントエンド    │
│ (Amplify)   │             │ User Pool    │         │ (JWT保持)       │
└─────────────┘             └──────────────┘         └─────────────────┘
      │                                                      │
      │ 3. fetchAuthSession() → credentials                  │
      │──────────────────────────▶┌──────────────┐           │
      │                           │ Cognito      │           │
      │◀──────────────────────────│ Identity Pool│           │
      │  AccessKeyId,             └──────────────┘           │
      │  SecretAccessKey,                                     │
      │  SessionToken                                         │
      │                                                       │
      │ 4. SigV4署名付きWebSocket URL生成                      │
      │ 5. WebSocket接続                                       │
      │──────────────────────────▶┌──────────────────┐        │
      │                           │ AgentCore Runtime │        │
      │◀──────────────────────────│ (BidiAgent /ws)  │        │
      │  6. 接続確立               └──────────────────┘        │
```

### 5.2 realtime-scoring（AgentCore Identity JWT - 既存維持）

```
┌─────────────┐  JWT  ┌──────────────────┐  検証  ┌──────────────────┐
│ フロントエンド │──────▶│ AgentCore Identity│──────▶│ AgentCore Runtime │
│             │       │ (JWT Authorizer) │       │ (scoring)        │
└─────────────┘       └──────────────────┘       └──────────────────┘
```

### 5.3 Step Functions内（IAMロール - 既存維持）

```
┌─────────────────┐  IAM  ┌──────────────────┐
│ Step Functions  │──────▶│ AgentCore Runtime │
│ (IAM Role)      │       │ (analysis agents) │
└─────────────────┘       └──────────────────┘
```

---

## 6. データフロー設計

### 6.1 会話フロー（音声対話）

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ フロントエンド │     │ AgentCore Runtime │     │ Nova 2 Sonic    │
│             │     │ (BidiAgent)      │     │                 │
└──────┬──────┘     └────────┬─────────┘     └────────┬────────┘
       │                     │                         │
       │ 1. session_start    │                         │
       │ (config+sensitivity)│                         │
       │────────────────────▶│                         │
       │                     │ 2. sessionStart         │
       │                     │ (endpointingSensitivity)│
       │                     │────────────────────────▶│
       │                     │ 3. promptStart          │
       │                     │ (audioOutputConfig)     │
       │                     │────────────────────────▶│
       │                     │ 4. systemPrompt(TEXT)   │
       │                     │────────────────────────▶│
       │                     │                         │
       │ 5. audio chunks     │                         │
       │ (PCM 16kHz Base64)  │                         │
       │────────────────────▶│ 6. audioInput           │
       │                     │────────────────────────▶│
       │                     │                         │
       │                     │ 7. ASR転写(USER,FINAL)  │
       │                     │◀────────────────────────│
       │ 8. asr_transcript   │                         │
       │◀────────────────────│                         │
       │                     │                         │
       │ [スコアリングAPI呼出]│                         │
       │                     │                         │
       │                     │ 9. NPC応答テキスト       │
       │                     │◀────────────────────────│
       │ 10. npc_response    │                         │
       │◀────────────────────│                         │
       │                     │                         │
       │                     │ 11. 音声出力(AUDIO)     │
       │                     │◀────────────────────────│
       │ 12. audio_output    │                         │
       │◀────────────────────│                         │
       │                     │                         │
       │ [AudioOutputManager │                         │
       │  Polly or Nova音声] │                         │
       │                     │                         │
       │                     │ 13. Memory保存          │
       │                     │──▶ AgentCore Memory     │
```

### 6.2 Session Continuationフロー

```
┌──────────────────┐
│ BidiAgent        │
│ (コンテナ内)      │
└────────┬─────────┘
         │
         │ 6分経過 → MONITORING状態
         │
         │ アシスタントAUDIO contentStart検出
         ▼
┌──────────────────┐     ┌──────────────────┐
│ 音声バッファリング │     │ 次セッション作成  │
│ 開始（10秒分）    │     │ (バックグラウンド) │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         │                        ▼
         │               ┌──────────────────┐
         │               │ 次セッション準備   │
         │               │ - sessionStart    │
         │               │ - promptStart     │
         │               │ - systemPrompt    │
         │               │ - 会話履歴転送     │
         │               └────────┬─────────┘
         │                        │
         ▼                        ▼
┌──────────────────────────────────────────┐
│ ハンドオフ                                │
│ - バッファ音声を次セッションに送信         │
│ - アクティブセッション切り替え             │
│ - 旧セッション閉じる                      │
│ - フロントエンドへの配信は途切れない       │
└──────────────────────────────────────────┘
```

### 6.3 スコアリング連携フロー

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ フロントエンド │     │ AgentCore Runtime │     │ AgentCore Runtime │
│             │     │ (BidiAgent)      │     │ (scoring)        │
└──────┬──────┘     └────────┬─────────┘     └────────┬─────────┘
       │                     │                         │
       │ ASR転写テキスト受信  │                         │
       │◀────────────────────│                         │
       │                     │                         │
       │ スコアリングAPI呼出  │                         │
       │ (JWT認証)           │                         │
       │─────────────────────────────────────────────▶│
       │                     │                         │
       │ スコアリング結果     │                         │
       │◀─────────────────────────────────────────────│
       │                     │                         │
       │ [UI更新: 怒りメーター、信頼度、進捗度]          │
```

**ポイント**:
- スコアリングはフロントエンドからASR転写テキスト受信後に独立して呼び出し
- BidiAgentとスコアリングエージェントは直接通信しない
- Session Continuation中もASR転写テキストは途切れないため、スコアリングは継続

---

## 7. 廃止コンポーネント一覧

### 7.1 バックエンド廃止

| コンポーネント | 種別 | 廃止理由 |
|--------------|------|---------|
| Transcribe WebSocket API Gateway | API Gateway WebSocket | Nova 2 Sonic内蔵ASRに置き換え |
| Transcribe Connect Lambda | Lambda (Python) | Transcribe廃止に伴い不要 |
| Transcribe Disconnect Lambda | Lambda (Python) | Transcribe廃止に伴い不要 |
| Transcribe Default Lambda | Lambda (Python) | Transcribe廃止に伴い不要 |
| Transcribe接続管理DynamoDBテーブル | DynamoDB | Transcribe廃止に伴い不要 |
| npc-conversation AgentCore Runtime | AgentCore Runtime | nova-sonic BidiAgentに置き換え |
| npc-conversation-agent コンテナ | ECR イメージ | nova-sonic-bidi-agentに置き換え |

### 7.2 フロントエンド廃止

| コンポーネント | ファイル | 廃止理由 |
|--------------|---------|---------|
| TranscribeService | TranscribeService.ts | NovaSonicServiceに置き換え |
| SilenceDetector | SilenceDetector.ts | Nova 2 SonicのendpointingSensitivityに置き換え |

### 7.3 継続使用コンポーネント

| コンポーネント | 変更 |
|--------------|------|
| Cognito User Pool + Identity Pool | 変更なし（SigV4認証にIdentity Pool使用） |
| AgentCore Runtime (realtime-scoring) | 変更なし |
| AgentCore Memory | 保存元変更（Claude NPC → Nova 2 Sonic ASR+応答） |
| Amazon Polly (SSML + Viseme) | 変更なし（デフォルト音声出力） |
| DynamoDB (セッション、シナリオ、NPC) | 変更なし |
| S3 (動画、音声、PDF) | 変更なし |
| Step Functions (セッション分析) | 変更なし |
| 3Dアバター (VRM) | 変更なし |
| API Gateway (REST) | 変更なし |

---

## 8. エラーハンドリング設計

### 8.1 Nova 2 Sonic固有エラー種別

| エラー種別 | 発生条件 | 対応 |
|-----------|---------|------|
| ModelTimeoutException | 8分セッション制限到達 | Conversation Resumption自動リカバリ |
| SessionTransitionFailure | Session Continuation失敗 | Conversation Resumption自動リカバリ |
| ConversationResumptionFailure | リカバリ失敗 | エラーUI表示、手動セッション再開 |
| WebSocketDisconnect | ネットワーク切断 | エラーUI表示、手動セッション再開 |
| SigV4AuthError | 認証情報期限切れ | 再ログイン促進 |
| AudioWorkletError | 音声再生失敗 | Pollyにフォールバック |

### 8.2 フロントエンドエラーハンドリング

```typescript
enum NovaSonicErrorType {
  SESSION_RECOVERY_FAILED = 'SESSION_RECOVERY_FAILED',
  MODEL_TIMEOUT = 'MODEL_TIMEOUT',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  AUDIO_ERROR = 'AUDIO_ERROR',
}

const handleNovaSonicError = (error: NovaSonicError) => {
  switch (error.errorType) {
    case NovaSonicErrorType.SESSION_RECOVERY_FAILED:
      // セッション復旧失敗 → エラーメッセージ + 再開ボタン
      showError(t('errors.sessionRecoveryFailed'));
      setCanRestart(true);
      break;
    case NovaSonicErrorType.AUTH_ERROR:
      // 認証エラー → 再ログイン
      redirectToLogin();
      break;
    case NovaSonicErrorType.AUDIO_ERROR:
      // 音声再生エラー → Pollyにフォールバック
      audioOutputManager.setAudioSource('polly');
      showWarning(t('warnings.audioFallbackToPolly'));
      break;
    default:
      // その他 → エラーメッセージ + 再開ボタン
      showError(error.message);
      setCanRestart(true);
  }
};
```

---

## 9. コンポーネント一覧サマリー

### 9.1 新規コンポーネント

| コンポーネント | 種別 | 認証 | 依存関係 |
|--------------|------|------|---------|
| nova-sonic-bidi-agent | AgentCore Runtime (WebSocket) | SigV4 | Nova 2 Sonic, Memory |
| SessionTransitionManager | コンテナ内モジュール | - | BidiAgent内部 |
| NovaSonicService | フロントエンドサービス | SigV4 | SigV4WebSocketClient |
| SigV4WebSocketClient | フロントエンドサービス | Cognito Identity Pool | @aws-sdk/signature-v4 |
| AudioOutputManager | フロントエンドサービス | - | Web Audio API |
| endpointingSensitivity設定 | フロントエンドUI | - | ユーザー設定ページ |

### 9.2 変更コンポーネント

| コンポーネント | 変更内容 |
|--------------|---------|
| AgentCore Memory | 保存元変更（Nova 2 Sonic ASR転写+応答テキスト） |
| 会話画面 | NovaSonicService統合、テキスト入力欄追加 |

### 9.3 廃止コンポーネント

| コンポーネント | 廃止理由 |
|--------------|---------|
| Transcribe WebSocket（API GW + Lambda×3 + DynamoDB） | Nova 2 Sonic内蔵ASR |
| npc-conversation AgentCore Runtime | nova-sonic BidiAgent |
| TranscribeService.ts | NovaSonicService |
| SilenceDetector.ts | endpointingSensitivity |

---

**作成日**: 2026-03-11
**ベース**: AgentCore Runtime Migration Logical Components (2026-01-08)
**バージョン**: 1.0
