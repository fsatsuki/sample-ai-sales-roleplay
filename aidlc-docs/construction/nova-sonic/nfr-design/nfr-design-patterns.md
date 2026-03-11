# NFR設計パターン: Nova 2 Sonic移行

## 1. 概要

本ドキュメントは、Nova 2 Sonic移行におけるNFR設計パターンを定義します。
AgentCore Runtime Migration NFR Design（2026-01-08）をベースに、Nova 2 Sonic固有のレジリエンス、
セッション継続、パフォーマンス、セキュリティ、可観測性の設計パターンを追加・変更します。

---

## 2. レジリエンスパターン

### 2.1 Session Continuation失敗時のConversation Resumption自動リカバリ

**決定**: Session Continuation失敗時、Conversation Resumptionで自動リカバリ（最大1回）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Session Continuation 失敗時のリカバリフロー                               │
│                                                                          │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │ SessionTransition │────▶│ 次セッション作成  │────▶│  作成失敗検出    │   │
│  │ Manager          │     │ 試行             │     │                 │   │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘   │
│                                                          │              │
│                                                          ▼              │
│                                              ┌─────────────────────┐   │
│                                              │ Conversation        │   │
│                                              │ Resumption 開始     │   │
│                                              └─────────────────────┘   │
│                                                          │              │
│                                                          ▼              │
│                                              ┌─────────────────────┐   │
│                                              │ AgentCore Memory    │   │
│                                              │ から会話履歴取得     │   │
│                                              │ (ListEvents API)    │   │
│                                              └─────────────────────┘   │
│                                                          │              │
│                                                          ▼              │
│                                              ┌─────────────────────┐   │
│                                              │ 新セッション作成     │   │
│                                              │ + 履歴テキスト再送信 │   │
│                                              └─────────────────────┘   │
│                                                          │              │
│                                              ┌───────────┴──────────┐  │
│                                              ▼                      ▼  │
│                                      ┌──────────────┐    ┌──────────┐ │
│                                      │ 成功:         │    │ 失敗:    │ │
│                                      │ 会話継続      │    │ エラー   │ │
│                                      │ (一瞬の中断)  │    │ UI表示   │ │
│                                      └──────────────┘    └──────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**実装パターン**:
```python
# AgentCore Runtimeコンテナ内 SessionTransitionManager
class SessionTransitionManager:
    async def handle_transition_failure(self, error: Exception):
        """Session Continuation失敗時のConversation Resumptionリカバリ"""
        logger.warning(f"Session Continuation failed: {error}")
        
        try:
            # 1. AgentCore Memoryから会話履歴を取得
            history = await self.memory.list_events(
                session_id=self.session_id,
                event_type="conversation"
            )
            
            # 2. 新しいNova 2 Sonicセッションを作成
            new_session = await self.create_nova_sonic_session()
            
            # 3. システムプロンプトを送信
            await new_session.send_system_prompt(self.system_prompt)
            
            # 4. 会話履歴をテキストとして再送信（interactive=false）
            for event in history:
                await new_session.send_history(
                    role=event.role,
                    text=event.text,
                    interactive=False
                )
            
            # 5. 音声ストリーミングを再開
            await new_session.start_audio_streaming()
            
            logger.info("Conversation Resumption successful")
            
        except Exception as resume_error:
            # リカバリも失敗した場合はエラーをフロントエンドに通知
            logger.error(f"Conversation Resumption failed: {resume_error}")
            await self.notify_frontend_error(
                error_type="SESSION_RECOVERY_FAILED",
                message="セッションの復旧に失敗しました。再度お試しください。"
            )
```

**理由**:
- Session Continuationはバックグラウンドで次セッションを準備するため、失敗は稀
- 失敗時はAgentCore Memoryに保存済みの会話履歴テキストで復旧可能
- リトライは最大1回（無限リトライによるリソース消費を防止）
- ユーザーには一瞬の中断が発生するが、会話コンテキストは維持

### 2.2 ModelTimeoutException リカバリ

**決定**: Conversation Resumptionで自動リカバリ（最大1回）

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Nova 2 Sonic    │────▶│ ModelTimeout     │────▶│ Conversation        │
│ セッション       │     │ Exception検出    │     │ Resumption実行      │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                                                          │
                                              ┌───────────┴──────────┐
                                              ▼                      ▼
                                      ┌──────────────┐    ┌──────────┐
                                      │ 成功:         │    │ 失敗:    │
                                      │ 新セッション  │    │ エラー   │
                                      │ で会話継続    │    │ UI表示   │
                                      └──────────────┘    └──────────┘
```

**実装**: Session Continuation失敗時と同じConversation Resumptionフローを使用

**理由**:
- ModelTimeoutExceptionは8分制限到達時に発生する可能性がある
- Session Continuationが正常動作していれば発生しないが、安全策として実装

### 2.3 WebSocket接続切断時のエラーハンドリング

**決定**: フロントエンドでエラー表示（自動再接続なし）

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ フロントエンド    │────▶│ WebSocket        │────▶│ エラーUI表示         │
│ (NovaSonicService)│    │ onclose/onerror  │     │ - エラーメッセージ   │
└─────────────────┘     └──────────────────┘     │ - セッション再開ボタン│
                                                  └─────────────────────┘
```

**理由**:
- AgentCore Runtime WebSocket切断はセッション状態の喪失を意味する
- 自動再接続してもNova 2 Sonicセッションは復元できない
- ユーザーに明示的にセッション再開を促す方が適切

### 2.4 タイムアウト戦略

**決定**: 120秒タイムアウト（既存AgentCore移行NFR踏襲）

**適用箇所**:
| 接続 | タイムアウト | 備考 |
|------|------------|------|
| フロントエンド → AgentCore Runtime WebSocket | 120秒 | 接続確立タイムアウト |
| AgentCore Runtime → Nova 2 Sonic | AgentCore内部管理 | コンテナ内で処理 |
| スコアリングAPI呼び出し | 120秒 | 既存維持 |

---

## 3. セッション継続パターン

### 3.1 SessionTransitionManagerライフサイクル

**決定**: AgentCore Runtimeコンテナ内でSessionTransitionManagerが全ライフサイクルを管理

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SessionTransitionManager ライフサイクル                                   │
│                                                                          │
│  Phase 1: 初期化（セッション開始時）                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ - BidiAgent + BidiNovaSonicModel初期化                          │    │
│  │ - sessionStartイベント送信（endpointingSensitivity設定）          │    │
│  │ - システムプロンプト送信                                          │    │
│  │ - 会話履歴送信（Conversation Resumption時のみ）                   │    │
│  │ - 音声ストリーミング開始                                          │    │
│  │ - セッション開始時刻記録                                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  Phase 2: 通常動作（0〜6分）                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ - 音声入力の転送（フロントエンド → Nova 2 Sonic）                  │    │
│  │ - ASR転写テキストの転送（Nova 2 Sonic → フロントエンド）           │    │
│  │ - NPC応答テキスト・音声の転送                                     │    │
│  │ - Cross-modal テキスト入力の処理                                  │    │
│  │ - 経過時間の監視                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼ 6分経過                                    │
│  Phase 3: 切り替え監視（6:00〜8:00）                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ - アシスタントのAUDIO contentStart検出を待機                      │    │
│  │ - 検出後: 音声バッファリング開始（直近10秒分）                     │    │
│  │ - バックグラウンドで次セッション作成開始                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼ 次セッション準備完了                        │
│  Phase 4: ハンドオフ                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ - 会話履歴テキストを次セッションに転送                             │    │
│  │ - バッファした音声を次セッションに送信                             │    │
│  │ - アクティブセッションを切り替え                                   │    │
│  │ - 旧セッションをバックグラウンドで閉じる                           │    │
│  │ - endpointingSensitivityは現在の設定を引き継ぎ                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  Phase 5: 継続（Phase 2に戻る）                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ - 新セッションでPhase 2を再開                                     │    │
│  │ - 6分経過でPhase 3に遷移（繰り返し）                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 音声バッファリング戦略

**決定**: 直近10秒分のPCM音声をリングバッファで保持

| パラメータ | 値 | 理由 |
|---|---|---|
| バッファ長 | 10秒 | 切り替え中の音声欠落防止に十分 |
| メモリ使用量 | 約320KB | 16kHz × 16bit × 1ch × 10秒 |
| バッファ方式 | リングバッファ | 固定メモリ、古いデータを自動上書き |
| バッファ開始 | Phase 3（6分経過後、アシスタント発話検出時） | 通常動作中はバッファ不要 |

### 3.3 セッション切り替えトリガー条件

```
切り替え判定ロジック:
  IF 経過時間 >= 360秒（6分）:
    状態 = MONITORING
    IF アシスタントのAUDIO contentStart検出:
      音声バッファリング開始
      バックグラウンドで次セッション作成
      IF 次セッション準備完了:
        ハンドオフ実行
      ELIF タイムアウト（30秒）:
        Conversation Resumptionにフォールバック
```

### 3.4 スコアリング連携（Session Continuation中）

**決定**: セッション切り替え中もスコアリングは継続（Q1=A）

**理由**:
- Session Continuationはコンテナ内で完結し、フロントエンドへのASR転写テキスト配信は途切れない
- スコアリングAPIはフロントエンドから独立して呼び出されるため、セッション切り替えの影響を受けない
- 切り替え中の一瞬（オーバーヘッド2%以下）にASR転写が途切れても、スコアリングは直前のメッセージで継続可能

---

## 4. パフォーマンスパターン

### 4.1 Nova 2 Sonic双方向ストリーミング データフロー

```
┌──────────────────────────────────────────────────────────────────────────┐
│  音声対話データフロー                                                      │
│                                                                          │
│  ┌─────────────┐  PCM 16kHz   ┌──────────────────┐  Bedrock API        │
│  │ フロントエンド │─────────────▶│ AgentCore Runtime │─────────────────▶  │
│  │ (AudioWorklet│  Base64      │ (BidiAgent)      │  audioInput         │
│  │  音声キャプチャ)│             │                  │                     │
│  └─────────────┘              └──────────────────┘                     │
│        ▲                              │                                  │
│        │                              │                                  │
│        │  ┌───────────────────────────┘                                  │
│        │  │                                                              │
│        │  ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  レスポンス処理（コンテナ内）                                      │    │
│  │                                                                   │    │
│  │  1. ASR転写テキスト（USER, FINAL）                                │    │
│  │     → フロントエンドに転送（チャット表示 + スコアリングAPI呼び出し） │    │
│  │                                                                   │    │
│  │  2. NPC応答テキスト（ASSISTANT, SPECULATIVE → FINAL）             │    │
│  │     → フロントエンドに転送（チャット表示）                         │    │
│  │                                                                   │    │
│  │  3. 音声出力（AUDIO, ASSISTANT）                                  │    │
│  │     → フロントエンドに転送（AudioWorkletで再生 or Polly切り替え）  │    │
│  │                                                                   │    │
│  │  4. usageEvent（トークン使用量）                                   │    │
│  │     → ログに記録                                                  │    │
│  │                                                                   │    │
│  │  5. AgentCore Memoryに会話履歴保存                                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 音声出力切り替えパターン（Polly / Nova 2 Sonic）

**決定**: Web Audio API（AudioWorklet）でNova 2 Sonic音声を再生可能にし、Pollyと切り替え可能（Q2=A）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  音声出力切り替えパターン                                                  │
│                                                                          │
│  AgentCore Runtime                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  NPC応答テキスト ──┬──▶ フロントエンドに転送                      │    │
│  │                    │                                             │    │
│  │  音声出力データ ───┼──▶ フロントエンドに転送                      │    │
│  └────────────────────┼─────────────────────────────────────────────┘    │
│                       │                                                  │
│  フロントエンド        ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  AudioOutputManager                                             │    │
│  │                                                                   │    │
│  │  IF audioSource === 'nova-sonic':                                │    │
│  │    → Nova 2 Sonic音声をAudioWorkletで再生                        │    │
│  │    → 24kHz LPCM → AudioBuffer → AudioBufferSourceNode           │    │
│  │                                                                   │    │
│  │  ELIF audioSource === 'polly' (デフォルト):                       │    │
│  │    → NPC応答テキストでPolly APIを呼び出し                         │    │
│  │    → SSML + Viseme対応音声を再生                                  │    │
│  │    → Nova 2 Sonic音声データは破棄                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

**AudioWorklet実装方針**:
```typescript
// NovaSonicAudioProcessor（AudioWorkletProcessor）
// - 24kHz LPCM Base64デコード → Float32Array変換
// - チャンクごとにキューイング → 連続再生
// - ボリューム制御（GainNode経由）

class AudioOutputManager {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private audioSource: 'polly' | 'nova-sonic' = 'polly'; // デフォルト: Polly

  async playNovaSonicAudio(base64Chunk: string): Promise<void> {
    if (this.audioSource !== 'nova-sonic') return; // Pollyモードなら無視
    // AudioWorkletにチャンクを送信
    this.workletNode?.port.postMessage({ type: 'audio', data: base64Chunk });
  }

  setAudioSource(source: 'polly' | 'nova-sonic'): void {
    this.audioSource = source;
  }
}
```

### 4.3 Cross-modal Input データフロー

**決定**: システムプロンプト + 会話履歴 + ユーザーテキスト入力をサポート（Q5=B）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Cross-modal Input フロー                                                │
│                                                                          │
│  フロントエンド                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  音声入力（マイク）──────────────────────────────────────▶ WebSocket │    │
│  │                                                                   │    │
│  │  テキスト入力（チャット入力欄）──────────────────────────▶ WebSocket │    │
│  │  ※ 音声ストリーミング中にテキスト送信可能                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  AgentCore Runtime（BidiAgent）                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  音声入力 → contentStart(AUDIO, USER, interactive=true)         │    │
│  │           → audioInput(Base64 PCM chunks)                       │    │
│  │                                                                   │    │
│  │  テキスト入力 → contentStart(TEXT, USER, interactive=true)       │    │
│  │              → textInput(テキスト内容)                           │    │
│  │              → contentEnd                                        │    │
│  │  ※ 音声ストリーミングを停止せずにテキスト入力を挿入               │    │
│  │  ※ contentNameは入力ごとに新しいUUIDを生成                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  Nova 2 Sonic                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  音声 + テキストを統合的に理解し、音声で応答                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

**ユースケース**:
- ユーザーが音声で話しながら、補足情報をテキストで入力
- 音声認識精度が低い場合にテキストで正確な入力を提供
- 音声入力が困難な環境でテキストのみで対話

---

## 5. セキュリティパターン

### 5.1 SigV4認証フロー（nova-sonic BidiAgent）

**決定**: Cognito Identity Pool → 一時認証情報 → SigV4署名付きWebSocket URL

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SigV4認証フロー                                                         │
│                                                                          │
│  ┌─────────────┐  1. ログイン  ┌──────────────┐                         │
│  │ フロントエンド │────────────▶│ Cognito      │                         │
│  │ (Amplify)   │             │ User Pool    │                         │
│  └─────────────┘             └──────────────┘                         │
│        │                           │                                     │
│        │ 2. JWT取得                │                                     │
│        │◀──────────────────────────│                                     │
│        │                                                                 │
│        │ 3. 一時認証情報取得                                              │
│        │──────────────────────────▶┌──────────────┐                     │
│        │                           │ Cognito      │                     │
│        │                           │ Identity Pool│                     │
│        │◀──────────────────────────│ (既存)       │                     │
│        │  AccessKeyId,             └──────────────┘                     │
│        │  SecretAccessKey,                                               │
│        │  SessionToken                                                   │
│        │                                                                 │
│        │ 4. SigV4署名付きWebSocket URL生成                                │
│        │  ┌─────────────────────────────────────────────────────┐       │
│        │  │ @aws-sdk/signature-v4 + @aws-crypto/sha256-js      │       │
│        │  │ URL: wss://{runtime-endpoint}:8080/ws              │       │
│        │  │ + SigV4クエリパラメータ                              │       │
│        │  └─────────────────────────────────────────────────────┘       │
│        │                                                                 │
│        │ 5. WebSocket接続                                                │
│        │──────────────────────────▶┌──────────────────┐                 │
│        │                           │ AgentCore Runtime │                 │
│        │                           │ (BidiAgent /ws)  │                 │
│        │◀──────────────────────────│                  │                 │
│        │  6. 接続確立               └──────────────────┘                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**実装パターン**:
```typescript
import { fetchAuthSession } from 'aws-amplify/auth';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

async function createSignedWebSocketUrl(endpoint: string, region: string): Promise<string> {
  const session = await fetchAuthSession();
  const credentials = session.credentials;
  
  if (!credentials) throw new Error('認証情報が取得できません');

  const signer = new SignatureV4({
    service: 'bedrock-agentcore',
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    sha256: Sha256,
  });

  // SigV4署名付きURLを生成
  const signedUrl = await signer.presign(/* ... */);
  return signedUrl;
}
```

### 5.2 認証方式の使い分け

| エージェント | 呼び出し元 | 認証方式 | 変更 |
|------------|-----------|---------|------|
| nova-sonic BidiAgent | フロントエンド | SigV4（Cognito Identity Pool） | 新規 |
| realtime-scoring | フロントエンド | AgentCore Identity (JWT) | 既存維持 |
| feedback-analysis | Step Functions | IAMロール | 既存維持 |
| video-analysis | Step Functions | IAMロール | 既存維持 |
| audio-analysis | Step Functions | IAMロール | 既存維持 |

### 5.3 データ分離

**決定**: マイクロVM分離 + セッションID分離（既存AgentCore NFR踏襲）

- AgentCore Runtimeのマイクロ VM分離により、セッション間のデータ漏洩を防止
- 音声データはコンテナ内で処理し、永続化しない
- 転送時暗号化: TLS 1.2+（WebSocket over WSS）

---

## 6. 可観測性パターン

### 6.1 Session Continuationイベントログ

**決定**: セッション切り替えイベントをCloudWatch Logsに記録

```json
{
  "event": "session_transition",
  "timestamp": "2026-03-11T10:30:00Z",
  "session_id": "session-xxx",
  "old_nova_session": "nova-session-001",
  "new_nova_session": "nova-session-002",
  "transition_type": "session_continuation",
  "elapsed_seconds": 372,
  "buffer_size_bytes": 320000,
  "transition_duration_ms": 150,
  "success": true
}
```

### 6.2 usageEventトークン使用量ログ

**決定**: Nova 2 SonicのusageEventをログに記録（専用監視は不要）

```json
{
  "event": "nova_sonic_usage",
  "timestamp": "2026-03-11T10:30:00Z",
  "session_id": "session-xxx",
  "input_audio_tokens": 1500,
  "output_audio_tokens": 800,
  "input_text_tokens": 200,
  "output_text_tokens": 150
}
```

### 6.3 アラーム設定

**決定**: 既存AgentCore NFR踏襲（基本メトリクスのみ）

| アラーム | 閾値 | アクション |
|---------|-----|----------|
| エラー率 | 10% 超過 | SNS通知 |
| レイテンシー | 60秒 超過 | SNS通知 |

Nova 2 Sonic固有の追加アラームは不要（既存AWS Budgets月次アラートで十分）

---

## 7. データ保存パターン

### 7.1 AgentCore Memory活用（既存NFR踏襲 + 変更点）

**変更点**: 会話履歴の保存元がClaude NPC → Nova 2 Sonic ASR転写 + NPC応答テキストに変更

```
┌─────────────────────────────────────────────────────────────┐
│                 AgentCore Memory                            │
│                                                             │
│  保存データ:                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  セッションID: session-xxx                           │   │
│  │  ├── 会話履歴 (ASR転写テキスト + NPC応答テキスト)     │   │
│  │  ├── メトリクス履歴 (スコアリング結果)               │   │
│  │  ├── ゴール状態                                     │   │
│  │  └── セッションメタデータ                            │   │
│  │       ├── nova_sonic_session_count (切り替え回数)    │   │
│  │       └── endpointing_sensitivity (設定値)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  保存期間: 365日間（Short-Term Memory）                      │
│  Conversation Resumption: ListEvents APIで履歴取得          │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. 設計決定サマリー

| カテゴリ | パターン | 決定内容 | 変更 |
|---------|---------|---------|------|
| レジリエンス | Session Continuation失敗 | Conversation Resumption自動リカバリ（1回） | 新規 |
| レジリエンス | ModelTimeoutException | Conversation Resumption自動リカバリ（1回） | 新規 |
| レジリエンス | WebSocket切断 | エラーUI表示（自動再接続なし） | 変更 |
| レジリエンス | タイムアウト | 120秒（既存維持） | 維持 |
| セッション継続 | SessionTransitionManager | コンテナ内で全ライフサイクル管理 | 新規 |
| セッション継続 | 音声バッファ | 10秒リングバッファ（320KB） | 新規 |
| セッション継続 | スコアリング連携 | 切り替え中も継続 | 新規 |
| パフォーマンス | 音声出力 | AudioWorklet再生 + Polly切り替え可能 | 新規 |
| パフォーマンス | Cross-modal Input | テキスト入力も可能 | 新規 |
| セキュリティ | BidiAgent認証 | SigV4（Cognito Identity Pool） | 新規 |
| セキュリティ | スコアリング認証 | AgentCore Identity JWT（既存維持） | 維持 |
| セキュリティ | データ分離 | MicroVM + セッションID（既存維持） | 維持 |
| 可観測性 | Session Continuationログ | CloudWatch Logs記録 | 新規 |
| 可観測性 | トークン使用量 | ログ記録のみ（専用監視なし） | 新規 |
| 可観測性 | アラーム | 基本メトリクスのみ（既存維持） | 維持 |
| データ保存 | 会話履歴 | AgentCore Memory（365日、保存元変更） | 変更 |
| データ保存 | Conversation Resumption | AgentCore Memory ListEvents API | 新規 |

---

**作成日**: 2026-03-11
**ベース**: AgentCore Runtime Migration NFR Design (2026-01-08)
**バージョン**: 1.0
