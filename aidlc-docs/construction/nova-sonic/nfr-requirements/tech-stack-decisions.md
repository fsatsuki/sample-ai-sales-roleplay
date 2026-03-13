# 技術スタック決定書: Nova 2 Sonic移行

## 1. 概要

本ドキュメントは、Amazon Transcribe Streaming + Claude NPC会話 → Nova 2 Sonic BidiAgent移行における技術スタック選定の決定事項を記録します。既存のAgentCore Runtime移行（2026-01-08）の技術スタックをベースに、Nova 2 Sonic固有の変更を反映しています。

---

## 2. インフラストラクチャ

### 2.1 コンピューティング

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| NPC会話エージェント | AgentCore Runtime (Strands Agent + Claude 4.5 Haiku) | AgentCore Runtime (Strands BidiAgent + Nova 2 Sonic) | Speech-to-Speech統合 |
| リアルタイムスコアリング | AgentCore Runtime (Strands Agent) | 変更なし | 現行維持 |
| Transcribe WebSocket Lambda | AWS Lambda (Python) | 廃止 | Nova 2 Sonic内蔵ASRに置き換え |

### 2.2 認証・認可

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| NPC会話認証 | AgentCore Identity (Inbound Auth) | SigV4認証 (Cognito Identity Pool) | BidiAgent WebSocket接続にSigV4が必要 |
| Identity Pool | 既存（Amplify設定で使用中） | 既存を継続使用 | 追加作成不要 |
| スコアリング認証 | AgentCore Identity (Inbound Auth) | 変更なし | 現行維持 |
| その他API認証 | API Gateway + Cognito Authorizer | 変更なし | 現行維持 |

### 2.3 API

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| NPC会話 | AgentCore Runtime直接呼び出し | AgentCore Runtime WebSocket (/ws) | BidiAgent双方向ストリーミング |
| Transcribe WebSocket | API Gateway WebSocket | 廃止 | Nova 2 Sonic内蔵ASRに置き換え |
| スコアリング | AgentCore Runtime直接呼び出し | 変更なし | 現行維持 |
| その他API | API Gateway REST | 変更なし | 現行維持 |

### 2.4 データストア

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| 会話履歴 | AgentCore Memory | AgentCore Memory（継続） | 保存元がNova 2 Sonic ASR転写+応答テキストに変更 |
| Transcribe接続管理 | DynamoDB | 廃止 | Transcribe WebSocket廃止に伴い不要 |
| セッション結果 | DynamoDB | 変更なし | 現行維持 |
| シナリオ/NPC | DynamoDB | 変更なし | 現行維持 |

### 2.5 監視・ログ

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| メトリクス | CloudWatch + AgentCore Observability | 変更なし | 基本メトリクスのみ（既存NFR踏襲） |
| ログ | CloudWatch Logs | 変更なし | 30日保持（既存NFR踏襲） |
| コスト監視 | AWS Budgets | 変更なし | Nova 2 Sonic固有の追加監視は不要 |

---

## 3. アプリケーション

### 3.1 バックエンド（Nova 2 Sonic BidiAgent）

| 項目 | 技術 | バージョン | 理由 |
|-----|------|----------|------|
| エージェントフレームワーク | Strands Agents SDK (BidiAgent) | 最新 | Nova 2 Sonic双方向ストリーミング対応 |
| BidiAgentモジュール | strands.experimental.bidi | experimental | Nova Sonic統合の公式モジュール |
| モデル | BidiNovaSonicModel | - | Nova 2 Sonic専用モデルプロバイダー |
| モデルID | amazon.nova-2-sonic-v1:0 | - | Nova 2 Sonic |
| 言語 | Python | 3.9+ | 既存実装継続 |
| Session Continuation | SessionTransitionManager | カスタム実装 | 8分セッション制限対応 |
| AgentCore SDK | bedrock-agentcore | 最新 | Runtime統合必須 |

### 3.2 バックエンド（既存維持）

| 項目 | 技術 | バージョン | 理由 |
|-----|------|----------|------|
| スコアリング | Strands Agents SDK + Claude 4.5 Haiku | 既存 | 変更なし |
| フィードバック分析 | Step Functions + Lambda | 既存 | 変更なし |
| 動画分析 | Lambda + Nova Premiere | 既存 | 変更なし |
| 音声合成 | Amazon Polly (SSML + Viseme) | 既存 | 変更なし |

### 3.3 フロントエンド

| 項目 | 技術 | バージョン | 理由 |
|-----|------|----------|------|
| フレームワーク | React | 19.1.1 | 既存実装継続 |
| 認証 | AWS Amplify | v6.15.5 | 既存実装継続 |
| SigV4署名 | @aws-sdk/signature-v4 + @aws-crypto/sha256-js | 最新 | AgentCore Runtime WebSocket SigV4認証 |
| WebSocket | ブラウザネイティブWebSocket API | - | AgentCore Runtime /ws接続 |
| 音声キャプチャ | Web Audio API (AudioWorklet) | - | PCM 16kHz音声取得 |

### 3.4 IaC

| 項目 | 技術 | バージョン | 理由 |
|-----|------|----------|------|
| IaCフレームワーク | AWS CDK | 2.1026.0 | 既存実装継続 |
| AgentCore Runtime | CfnRuntime (L1) | aws-cdk-lib | 既存パターン踏襲 |
| セキュリティチェック | cdk-nag | 2.37.9 | 既存実装継続 |

---

## 4. 新規導入技術

### 4.1 Strands BidiAgent (Nova 2 Sonic)

**選定理由**:
- Nova 2 Sonicの双方向ストリーミングをわずか約20行で構築可能
- Strands Agents SDKの公式モジュール（experimentalステータス）
- ツール統合（@toolデコレータ）サポート
- マルチモデル対応（将来的なモデル切り替えが容易）

**コンテナ内実装構成**:
```python
from strands.experimental.bidi.agent import BidiAgent
from strands.experimental.bidi.models.nova_sonic import BidiNovaSonicModel

model = BidiNovaSonicModel(
    region="ap-northeast-1",
    model_id="amazon.nova-2-sonic-v1:0"
)

agent = BidiAgent(
    model=model,
    audio_io=custom_websocket_io,  # AgentCore Runtime WebSocket I/O
    system_prompt="...",
    tools=[...]
)
```

### 4.2 SessionTransitionManager

**選定理由**:
- 8分セッション制限への対応
- ユーザーに中断を感じさせないシームレスな切り替え
- 公式サンプル（Python）をベースに実装

**主要パラメータ**:
| パラメータ | 値 | 理由 |
|---|---|---|
| transition_threshold_seconds | 360（6分） | 切り替え準備に十分な時間を確保 |
| audio_buffer_duration_seconds | 10 | 切り替え中の音声欠落防止 |
| audio_start_timeout_seconds | 100 | アシスタント発話開始の最大待機時間 |
| next_session_ready_timeout_seconds | 30 | 次セッション準備のタイムアウト |

### 4.3 SigV4認証（フロントエンド）

**選定理由**:
- AgentCore Runtime WebSocket接続にSigV4認証が必要
- Cognito Identity Poolで一時認証情報を取得
- 既存のIdentity Poolを使用（新規作成不要）

**実装方法**:
```typescript
import { fetchAuthSession } from 'aws-amplify/auth';

// Cognito Identity Poolから一時認証情報を取得
const session = await fetchAuthSession();
const credentials = session.credentials;

// SigV4署名付きWebSocket URLを生成
const signedUrl = await signWebSocketUrl(
  agentCoreEndpoint,
  credentials,
  region
);

// WebSocket接続
const ws = new WebSocket(signedUrl);
```

### 4.4 Nova 2 Sonic音声出力転送

**選定理由**:
- Nova 2 Sonicは音声出力を完全に無効化できない（audioOutputConfiguration必須）
- 音声データをフロントエンドに転送し、Polly音声と切り替え可能にする
- 将来的にNova 2 Sonic音声に移行する選択肢を残す

**実装方針**:
- デフォルト: Polly音声（SSML + Viseme）
- オプション: Nova 2 Sonic音声（フロントエンド設定で切り替え）
- 音声出力データはaudioOutputイベントからBase64デコードして取得

---

## 5. 廃止技術

### 5.1 廃止対象

| 項目 | 理由 |
|-----|------|
| Amazon Transcribe Streaming | Nova 2 Sonic内蔵ASRに置き換え |
| Transcribe WebSocket API Gateway | Transcribe廃止に伴い不要 |
| Transcribe WebSocket Lambda群 (connect/disconnect/default) | Transcribe廃止に伴い不要 |
| Transcribe接続管理DynamoDBテーブル | Transcribe廃止に伴い不要 |
| AgentCore Runtime (npc-conversation) | Nova 2 Sonic BidiAgentに置き換え |
| Claude 4.5 Haiku (NPC会話用) | Nova 2 Sonic対話生成に置き換え |
| TranscribeService.ts (フロントエンド) | NovaSonicServiceに置き換え |
| SilenceDetector.ts (フロントエンド) | Nova 2 SonicのendpointingSensitivityに置き換え |

### 5.2 継続使用

| 項目 | 理由 |
|-----|------|
| Cognito User Pool + Identity Pool | 既存ユーザーベース維持、SigV4認証に使用 |
| AgentCore Runtime (realtime-scoring) | 変更なし |
| AgentCore Memory | 会話履歴保存継続 |
| Amazon Polly (SSML + Viseme) | 音声合成継続（デフォルト） |
| DynamoDB (セッション、シナリオ、NPC) | マスタデータ・結果保存 |
| S3 (動画、音声、PDF) | 変更なし |
| Step Functions (セッション分析) | 変更なし |
| 3Dアバター (VRM) | 変更なし |

---

## 6. 技術的リスクと対策

| リスク | 影響度 | 対策 |
|-------|-------|------|
| 日本語ASR精度低下 | 高 | 精度に関わらずNova 2 Sonic ASRを使用、フォールバックなし。精度改善はAWS側に期待 |
| 日本語対話生成品質 | 高 | プロンプトエンジニアリングで品質向上、検証後に判断 |
| Strands BidiAgent experimental | 中 | APIの安定性を検証。experimentalステータスのため破壊的変更の可能性あり |
| 8分セッション制限 | 中 | Session Continuation実装。失敗時はConversation Resumptionで自動リカバリ |
| Nova 2 Sonic音声出力コスト | 低 | 音声出力は無効化不可だが、帯域幅コストは許容範囲。将来的に活用可能 |
| SigV4認証の複雑さ | 低 | Cognito Identity Pool + AWS SDK for JSで対応。既存Identity Pool使用 |

---

## 7. 決定履歴

| 日付 | 決定事項 | 理由 |
|-----|---------|------|
| 2026-03-11 | Nova 2 Sonic BidiAgent採用 | Speech-to-Speech統合、Transcribe + Claude置き換え |
| 2026-03-11 | Session Continuation実装 | 8分セッション制限対応 |
| 2026-03-11 | Conversation Resumption自動リカバリ | Session Continuation失敗時のフォールバック |
| 2026-03-11 | 日本語ASRフォールバックなし | シンプルな実装優先、精度改善はAWS側に期待 |
| 2026-03-11 | endpointingSensitivity MEDIUM + 画面変更可能 | 営業ロールプレイの発話パターンに合わせた柔軟な設定 |
| 2026-03-11 | Nova 2 Sonic音声出力をフロントエンドに転送 | 将来的なNova 2 Sonic音声移行オプション保持 |
| 2026-03-11 | WebSocketタイムアウト120秒 | 既存AgentCore移行NFR踏襲 |
| 2026-03-11 | Nova 2 Sonic固有のトークン監視不要 | 既存AWS Budgets月次アラートで十分 |
| 2026-03-11 | 既存Cognito Identity Pool使用 | Amplify設定で既に使用中、新規作成不要 |
| 2026-03-11 | SigV4認証採用 | AgentCore Runtime WebSocket接続要件 |

---

**作成日**: 2026-03-11
**ベース**: AgentCore Runtime Migration Tech Stack (2026-01-08)
**バージョン**: 1.0
