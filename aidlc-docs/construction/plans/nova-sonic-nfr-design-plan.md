# NFR設計計画: Nova 2 Sonic移行

## 概要
Nova 2 Sonic移行におけるNFR設計パターンと論理コンポーネントの設計計画です。
NFR要件定義書（nfr-requirements.md）および技術スタック決定書（tech-stack-decisions.md）に基づき、
レジリエンス、パフォーマンス、セキュリティ、可観測性の設計パターンと論理コンポーネントを定義します。

## ベース
- AgentCore Runtime Migration NFR Design（2026-01-08）をベースに、Nova 2 Sonic固有の変更を反映

---

## 計画ステップ

### Part 1: NFR設計パターン（nfr-design-patterns.md）

- [x] 1.1 レジリエンスパターン設計
  - Session Continuation失敗時のConversation Resumption自動リカバリフロー
  - ModelTimeoutException発生時のリカバリフロー
  - WebSocket接続切断時のエラーハンドリング
  - タイムアウト戦略（120秒）

- [x] 1.2 セッション継続パターン設計
  - SessionTransitionManagerのライフサイクル設計
  - 音声バッファリング戦略（10秒、320KB）
  - セッション切り替えトリガー条件（6分経過 + アシスタント発話検出）
  - 会話履歴テキスト転送フロー
  - Conversation Resumptionフォールバック実装

- [x] 1.3 パフォーマンスパターン設計
  - Nova 2 Sonic双方向ストリーミングのデータフロー
  - 音声入力（PCM 16kHz）→ ASR転写 → NPC応答テキスト → 音声出力（24kHz）のパイプライン
  - Polly音声とNova 2 Sonic音声の切り替えパターン
  - Cross-modal Input（テキスト + 音声併用）のデータフロー

- [x] 1.4 セキュリティパターン設計
  - SigV4認証フロー（Cognito Identity Pool → 一時認証情報 → 署名付きWebSocket URL）
  - 既存AgentCore Identity（JWT）との認証方式の使い分け
  - データ分離（マイクロVM + セッションID）

- [x] 1.5 可観測性パターン設計
  - Session Continuationイベントログ設計
  - usageEventトークン使用量ログ
  - エラー率・レイテンシーアラーム設定

### Part 2: 論理コンポーネント設計（logical-components.md）

- [x] 2.1 システムアーキテクチャ概要
  - フロントエンド → AgentCore Runtime（nova-sonic BidiAgent）→ Nova 2 Sonic のフロー
  - 既存コンポーネント（スコアリング、Step Functions等）との統合

- [x] 2.2 nova-sonic BidiAgentコンポーネント設計
  - BidiAgent + BidiNovaSonicModel + カスタムWebSocket I/O
  - SessionTransitionManager統合
  - ツール定義（スコアリング連携等）
  - 入出力インターフェース

- [x] 2.3 フロントエンドコンポーネント設計
  - NovaSonicService（TranscribeService置き換え）
  - SigV4WebSocketClient
  - AudioOutputManager（Polly/Nova 2 Sonic切り替え）
  - endpointingSensitivity設定UI

- [x] 2.4 認証フロー設計
  - nova-sonic BidiAgent: SigV4認証（Cognito Identity Pool）
  - realtime-scoring: AgentCore Identity JWT（既存維持）
  - Step Functions内: IAMロール（既存維持）

- [x] 2.5 データフロー設計
  - 会話フロー（音声入力 → ASR → NPC応答 → 音声出力/Polly）
  - Session Continuationフロー（セッション切り替え時のデータ転送）
  - スコアリング連携フロー（ASR転写テキストをスコアリングAPIに送信）

- [x] 2.6 廃止コンポーネント一覧
  - Transcribe WebSocket関連（API Gateway、Lambda、DynamoDB）
  - NPC会話AgentCore Runtime（Claude 4.5 Haiku）
  - TranscribeService.ts、SilenceDetector.ts

- [x] 2.7 エラーハンドリング設計
  - Nova 2 Sonic固有エラー種別と対応
  - Session Continuation失敗時のConversation Resumptionフロー
  - フロントエンドエラーUI設計

---

## 質問

以下の質問に回答してください。NFR設計パターンと論理コンポーネントの詳細設計に必要な情報です。

### Q1. Session Continuation中のスコアリング連携

Session Continuation（セッション切り替え）中、リアルタイムスコアリングの状態はどのように扱いますか？

A) セッション切り替え中もスコアリングは継続（ASR転写テキストが途切れない限り影響なし）
B) セッション切り替え中はスコアリングを一時停止し、切り替え完了後に再開
C) その他（具体的に記述）

[Answer]: A

### Q2. Nova 2 Sonic音声出力のフロントエンド処理

Nova 2 Sonic音声出力（24kHz LPCM）をフロントエンドで再生する際の処理方式はどうしますか？

A) Web Audio APIでデコード・再生（AudioWorklet使用）
B) AudioContextのdecodeAudioDataで再生
C) 音声出力は当面無視し、Pollyのみ使用（Nova 2 Sonic音声の再生機能は将来実装）

[Answer]: A

### Q3. endpointingSensitivity設定UIの配置

endpointingSensitivity（ターン検出感度）の設定UIはどこに配置しますか？

A) セッション開始前の設定ダイアログ内（シナリオ選択後、セッション開始前）
B) アプリケーション全体の設定画面（ユーザー設定ページ）
C) 会話画面のサイドパネル/ツールバー内（セッション中は変更不可の注意書き付き）

[Answer]: B

### Q4. Conversation Resumption時の会話履歴保存場所

Conversation Resumption（自動リカバリ）で使用する会話履歴テキストの保存場所はどこにしますか？

A) AgentCore Runtimeコンテナ内のインメモリ（SessionTransitionManagerが管理）
B) AgentCore Memoryから取得（ListEvents API）
C) フロントエンド側で保持し、リカバリ時にバックエンドに送信

[Answer]: B

### Q5. Cross-modal Inputの活用範囲

Cross-modal Input（音声セッション中のテキスト送信）をどの範囲で活用しますか？

A) システムプロンプト + 会話履歴のみ（ユーザー入力は音声のみ）
B) システムプロンプト + 会話履歴 + ユーザーのテキスト入力も可能（チャット入力欄を残す）
C) その他（具体的に記述）

[Answer]: B

---

## 成果物

1. `aidlc-docs/construction/nova-sonic/nfr-design/nfr-design-patterns.md`
2. `aidlc-docs/construction/nova-sonic/nfr-design/logical-components.md`

---

**作成日**: 2026-03-11
**バージョン**: 1.0
