# Nova 2 Sonic移行 - 要件定義書

## 1. Intent Analysis

- **ユーザーリクエスト**: Amazon Nova 2 Sonicを使用して、現在の会話プロセス（Transcribe + Claude NPC会話）をNova 2 Sonicに置き換える。音声合成はAmazon Pollyを継続利用。
- **リクエストタイプ**: Migration（技術移行）
- **スコープ**: Multiple Components（フロントエンド音声認識、バックエンドNPC会話、WebSocket、CDKインフラ）
- **複雑度**: Complex（新しいSpeech-to-Speechモデル統合、8分セッション制限対応、日本語非公式サポート）
- **技術調査ドキュメント**: `docs/nova2-sonic-technical-research.md`

---

## 2. アーキテクチャ概要

### 2.1 現行アーキテクチャ（置き換え対象）

```
ユーザー音声 → フロントエンド(TranscribeService)
  → WebSocket API Gateway → Lambda → Amazon Transcribe Streaming
  → ASR転写テキスト → フロントエンド
  → AgentCore Runtime(Strands Agent + Claude 4.5 Haiku) → NPC応答テキスト
  → Amazon Polly(SSML) → 音声再生
  → リアルタイムスコアリングAPI → メトリクス更新
```

### 2.2 移行後アーキテクチャ

```
ユーザー音声 → フロントエンド(NovaSonicService)
  → AgentCore Runtime WebSocket(/ws) [SigV4認証]
  → コンテナ内 BidiAgent(Strands experimental)
  → Nova 2 Sonic(InvokeModelWithBidirectionalStream)
    - 音声認識（ASR）: Nova 2 Sonic内蔵
    - 対話生成: Nova 2 Sonic内蔵（Cross-modal Input対応）
    - 音声出力: 使用しない（Polly継続）
  → NPC応答テキスト → フロントエンド
  → Amazon Polly(SSML + Viseme) → 音声再生 + リップシンク
  → リアルタイムスコアリングAPI → メトリクス更新（現行方式維持）
```

### 2.3 廃止対象

| コンポーネント | 現行 | 移行後 |
|---|---|---|
| 音声認識 | Transcribe Streaming + WebSocket API Gateway + Lambda | Nova 2 Sonic内蔵ASR |
| NPC対話生成 | AgentCore Runtime (Strands Agent + Claude 4.5 Haiku) | Nova 2 Sonic (BidiAgent) |
| 音声合成 | Amazon Polly (SSML + Viseme) | Amazon Polly 継続 |
| リアルタイムスコアリング | AgentCore Runtime (realtime-scoring) | 変更なし |
| フィードバック分析 | Step Functions + Lambda | 変更なし |
| 動画分析 | Lambda (Nova Premiere) | 変更なし |

### 2.4 廃止されるインフラリソース

- Transcribe WebSocket API Gateway
- Transcribe WebSocket Lambda関数群（connect, disconnect, default）
- Transcribe接続管理用DynamoDBテーブル
- AgentCore Runtime: NPC会話エージェント（npc-conversation）

---

## 3. 機能要件

### FR-001: Nova 2 Sonic双方向ストリーミング接続
- フロントエンドからAgentCore RuntimeのWebSocketエンドポイント（`/ws`）に接続する
- SigV4認証を使用する（Cognito Identity Poolで一時認証情報を取得）
- PCM 16kHz モノラル音声をBase64エンコードしてストリーミング送信する

### FR-002: Cross-modal Input対応
- 音声ストリーミング中にテキストメッセージを送信できる（パターンB）
- システムプロンプト、会話履歴はテキストで送信する
- ユーザーの音声入力とテキスト入力を併用できる

### FR-003: NPC対話生成
- Nova 2 Sonicがユーザーの音声を認識し、NPC応答テキストを生成する
- システムプロンプトで日本語での応答を指示する
- NPC応答テキスト（FINAL generationStage）をフロントエンドに返す
- Nova 2 Sonicの音声出力は使用しない（Polly継続のため）

### FR-004: ASR転写テキスト取得
- Nova 2 SonicのASR転写結果（USER, FINAL）をフロントエンドに返す
- 部分的な転写結果（SPECULATIVE）もリアルタイムで表示する
- 転写テキストはチャットUIに表示する

### FR-005: Polly音声合成継続
- NPC応答テキストを受信後、現行のPollyService経由で音声合成する
- SSML対応を維持する
- Viseme（口形状）データを取得し、3Dアバターのリップシンクに使用する

### FR-006: Session Continuation（8分超セッション対応）
- AgentCore Runtimeコンテナ内にSessionTransitionManagerを実装する
- 6分経過時点でセッション切り替え監視を開始する
- バックグラウンドで次のNova 2 Sonicセッションを作成する
- 10秒分の音声バッファリングを行う
- ユーザーに中断を感じさせないシームレスな切り替えを実現する
- 会話履歴を次のセッションにテキストとして引き継ぐ

### FR-007: 会話履歴管理
- Nova 2 Sonicの会話履歴（ASR転写 + NPC応答テキスト）をAgentCore Memoryに保存する
- セッション開始時に会話履歴をNova 2 Sonicセッションに送信する（`interactive: false`）
- 評価画面（ResultPage）での会話履歴表示を維持する

### FR-008: リアルタイムスコアリング統合
- 現行方式を維持する
- フロントエンドがNPC応答テキスト受信後に、既存のリアルタイムスコアリングAPIを呼び出す
- スコアリング入力: ユーザーメッセージ + NPC応答 + 会話履歴 + ゴール状態
- スコアリング出力: 怒りメーター、信頼度、進捗度、ゴール状態、コンプライアンス、NPC感情、ジェスチャー

### FR-009: フロントエンドサービス置き換え
- TranscribeServiceをNovaSonicServiceに置き換える
- SilenceDetectorは不要になる（Nova 2 Sonicの`endpointingSensitivity`で発話終了を検出）
- ConversationPageの音声認識フローを更新する
- AgentCoreService.chatWithNPC()の呼び出しをNovaSonicService経由に変更する

### FR-010: AgentCore Runtime BidiAgentデプロイ
- Strands BidiAgent（`strands.experimental.bidi`）を使用する
- AgentCore Runtimeにコンテナとしてデプロイする
- WebSocketエンドポイント（ポート8080、`/ws`パス）を公開する
- ヘルスチェックエンドポイントを提供する

### FR-011: ターン検出設定
- Nova 2 Sonicの`endpointingSensitivity`を設定可能にする（HIGH/MEDIUM/LOW）
- 営業ロールプレイの発話パターンに合わせて調整する
- 現行のSilenceDetector（クライアントサイド無音検出）を廃止する

### FR-012: エラーハンドリング
- Nova 2 Sonicセッション切断時のリカバリ処理を実装する
- ModelTimeoutExceptionへの対応（Conversation Resumptionパターン）
- フロントエンドへのエラー通知とユーザーフレンドリーなメッセージ表示
- 接続失敗時のリトライロジック

### FR-013: コスト試算ドキュメント更新
- `docs/cost/コスト試算.md` をNova 2 Sonic移行後のアーキテクチャに合わせて更新する
- 廃止されるサービスのコスト削除:
  - Amazon Transcribe Streaming（リアルタイム音声認識）: $270.00/月
  - API Gateway WebSocket API（Transcribe用）: $0.19/月
  - AWS Lambda（WebSocket処理）: $0.01/月
  - Amazon DynamoDB（WebSocket接続管理）: $0.05/月
- 追加されるサービスのコスト算出:
  - Nova 2 Sonic トークン課金（音声トークン + テキストトークン）
  - AgentCore Runtime（nova-sonic BidiAgent）のコンテナ稼働コスト
- 変更されるサービスのコスト更新:
  - AgentCore Runtime: NPC会話エージェント廃止 → nova-sonic BidiAgent追加（長時間稼働）
  - Amazon Bedrock: Claude 4.5 Haiku NPC会話トークン廃止 → Nova 2 Sonicトークンに変更
- 1人あたりコスト・コスト構成比の再計算

---

## 4. 非機能要件

### NFR-001: レイテンシー
- 音声認識（ASR）: ユーザー発話終了から転写テキスト表示まで1秒以内
- NPC応答生成: ユーザー発話終了からNPC応答テキスト取得まで3秒以内
- 音声合成（Polly）: NPC応答テキスト取得から音声再生開始まで1秒以内（現行維持）

### NFR-002: 日本語対応
- Nova 2 Sonicは日本語を公式サポートしていない
- システムプロンプトで日本語応答を指示する
- 音声認識精度の低下を許容する
- 日本語ASR精度が実用レベルに達しない場合のフォールバック方針を検討する

### NFR-003: セッション制限
- 1セッション最大8分の接続制限に対応する
- Session Continuationにより、ユーザーが知覚できない即時ハンドオフを実現する
- 会話効率98%以上（オーバーヘッド2%以下）を目標とする

### NFR-004: セキュリティ
- SigV4認証によるAgentCore Runtime WebSocket接続
- Cognito Identity Poolで一時認証情報を取得
- 音声データの暗号化（転送時）
- セッションデータの適切な分離

### NFR-005: 可用性
- AgentCore Runtimeの自動スケーリング
- コンテナクラッシュ時の自動復旧
- エラー時のユーザーフレンドリーなフォールバック

### NFR-006: コスト
- Nova 2 Sonicのトークンベース課金（音声トークン + テキストトークン）
- AgentCore Runtimeのコンテナ稼働コスト
- Polly音声合成コスト（現行維持）
- Transcribe Streaming廃止によるコスト削減

### NFR-007: 対応リージョン
- us-east-1（バージニア）
- us-west-2（オレゴン）
- ap-northeast-1（東京）
- 各リージョンでNova 2 Sonicが利用可能であることを確認済み

### NFR-008: 国際化
- 日本語・英語の多言語サポートを維持する
- Nova 2 Sonicのシステムプロンプトを言語別に用意する
- エラーメッセージは日英両言語で提供する

---

## 5. 技術的決定事項

### 5.1 利用パターン
- Cross-modal Input（パターンB）ベース + Polly音声合成
- Nova 2 Sonicは音声認識 + 対話生成を担当
- 音声出力はNova 2 Sonicから受信するが再生しない（Polly継続）

### 5.2 バックエンド実装
- AgentCore Runtime上にStrands BidiAgentをデプロイ
- モデルID: `amazon.nova-2-sonic-v1:0`
- コンテナ内でSessionTransitionManagerを実装

### 5.3 フロントエンド接続
- AgentCore RuntimeのWebSocketエンドポイントに直接接続
- SigV4認証（Cognito Identity Pool経由）
- 現行のTranscribeService → NovaSonicServiceに置き換え

### 5.4 移行戦略
- ビッグバン移行（Transcribe + Claude NPC会話を一度にNova 2 Sonicに置き換え）
- AgentCore NPC会話Runtime（npc-conversation）は廃止
- Transcribe WebSocketインフラは廃止

### 5.5 会話履歴
- AgentCore Memoryに保存を継続
- Nova 2 Sonicセッション内でも会話コンテキストを管理
- 評価画面での会話履歴表示を維持

### 5.6 スコアリング
- 現行方式を維持（フロントエンドから別途API呼び出し）
- Nova 2 Sonicのtool useは使用しない

---

## 6. 影響範囲

### 6.1 フロントエンド変更

| ファイル | 変更内容 |
|---|---|
| `TranscribeService.ts` | 廃止 → NovaSonicServiceに置き換え |
| `SilenceDetector.ts` | 廃止（Nova 2 Sonicのターン検出に置き換え） |
| `AgentCoreService.ts` | chatWithNPC()をNovaSonicService経由に変更 |
| `ConversationPage.tsx` | 音声認識フロー更新、NovaSonicService統合 |
| `AudioService.ts` | NPC応答テキスト受信方式の変更に対応 |
| `amplify-config` | Cognito Identity Pool設定追加（SigV4認証用） |

### 6.2 バックエンド変更

| コンポーネント | 変更内容 |
|---|---|
| AgentCore Runtime (nova-sonic) | 新規作成: BidiAgent + SessionTransitionManager |
| AgentCore Runtime (npc-conversation) | 廃止 |
| Transcribe WebSocket構成 | 廃止（API Gateway, Lambda, DynamoDB） |
| CDKインフラ | AgentCore Runtime nova-sonic追加、Transcribe WebSocket削除 |

### 6.3 変更なし

- リアルタイムスコアリング（AgentCore Runtime realtime-scoring）
- フィードバック分析（Step Functions + Lambda）
- 動画分析（Lambda + Nova Premiere）
- 音声合成（Polly Lambda）
- セッション管理（DynamoDB）
- 3Dアバター（VRM）
- 評価画面（ResultPage） ※会話履歴取得元がAgentCore Memoryのまま

---

## 7. リスクと軽減策

| リスク | 影響度 | 軽減策 |
|---|---|---|
| 日本語ASR精度低下 | 高 | システムプロンプトで日本語指示、精度検証後に判断 |
| 日本語対話生成品質 | 高 | プロンプトエンジニアリングで品質向上、検証後に判断 |
| Strands BidiAgent experimental | 中 | APIの安定性を検証、フォールバック方針を策定 |
| 8分セッション制限 | 中 | Session Continuation実装で対応 |
| AgentCore Runtimeコスト | 中 | コンテナサイズ・スケーリング設定の最適化 |
| SigV4認証の複雑さ | 低 | Cognito Identity Pool + AWS SDK for JSで対応 |

---

## 8. 参考資料

- 技術調査ドキュメント: `docs/nova2-sonic-technical-research.md`
- Nova 2 Sonic公式ドキュメント: https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-getting-started.html
- Strands BidiAgent: https://strandsagents.com/latest/user-guide/concepts/model-providers/bidi-model-providers/nova-sonic/
- Session Continuation Sample: https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech/amazon-nova-2-sonic/repeatable-patterns/session-continuation
