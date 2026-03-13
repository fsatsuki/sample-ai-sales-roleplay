# NFR Requirements Plan: Nova 2 Sonic移行

## 概要
Nova 2 Sonic移行における非機能要件の詳細化と技術スタック決定を行います。
既存のAgentCore Runtime移行NFR（2026-01-08作成）をベースに、Nova 2 Sonic固有の要件を追加・更新します。

## 前提条件
- 要件定義書（requirements.md）承認済み
- 技術調査ドキュメント（docs/nova2-sonic-technical-research.md）確認済み
- 既存AgentCore移行NFR成果物確認済み

---

## NFR Assessment Steps

- [x] Step 1: 質問ファイル作成・回答収集
- [x] Step 2: 回答分析・曖昧さチェック
- [x] Step 3: NFR要件定義書生成
- [x] Step 4: 技術スタック決定書生成
- [x] Step 5: レビュー・承認

---

## 質問

### Q1: Nova 2 Sonicセッションエラー時のリカバリ戦略
8分セッション制限のSession Continuation失敗時、またはModelTimeoutException発生時のリカバリ戦略はどうしますか？

A) Conversation Resumption（会話履歴テキスト再送信）で自動リカバリ - 一瞬の中断あり、会話コンテキスト維持
B) エラー表示のみ（リトライなし）- 既存AgentCore移行NFRの決定（即座にエラー表示）を踏襲
C) ユーザーに「再接続」ボタンを表示し、手動でConversation Resumptionを実行

[Answer]:A

### Q3: 日本語ASR精度の許容基準
Nova 2 Sonicの日本語ASR（音声認識）は非公式サポートです。精度が低い場合のフォールバック方針はどうしますか？

A) 精度に関わらずNova 2 Sonic ASRを使用し続ける - シンプルな実装、精度改善はAWS側に期待
B) ASR精度が実用レベルに達しない場合、Transcribe Streamingへのフォールバックを実装する - 複雑だが安全
C) テキスト入力モードへのフォールバックを実装する - Cross-modal Inputを活用、音声認識を回避

[Answer]:A

### Q4: endpointingSensitivity（ターン検出感度）の初期設定
Nova 2 Sonicの`endpointingSensitivity`は発話終了検出の感度を制御します。営業ロールプレイの発話パターンに合わせた初期設定はどうしますか？

A) HIGH - 短い間（ま）でも発話終了と判定。テンポの速い会話向き
B) MEDIUM - バランスの取れた設定。一般的な会話パターン向き
C) LOW - 長い間（ま）を許容。考えながら話す営業トレーニング向き

[Answer]: B

### Q5: Nova 2 Sonicの音声出力の扱い
要件定義書ではPolly継続と決定していますが、Nova 2 Sonicは音声出力を完全に無効化できません（audioOutputConfigurationが必須）。生成される音声データの扱いはどうしますか？

A) 音声出力データを受信するが、フロントエンドに転送せず破棄する - 帯域幅コストは発生するが実装がシンプル
B) 音声出力データをフロントエンドに転送し、Polly音声と切り替え可能にする - 将来的にNova 2 Sonic音声に移行する選択肢を残す

[Answer]: B

### Q6: WebSocket接続のタイムアウト設定
フロントエンドからAgentCore Runtime WebSocket（/ws）への接続タイムアウトはどうしますか？

A) 120秒（既存AgentCore移行NFRの決定を踏襲）
B) 600秒（10分）- 8分セッション + Session Continuation切り替え時間を考慮
C) タイムアウトなし - セッション終了まで接続維持、サーバー側で管理

[Answer]: A

### Q7: Nova 2 Sonicトークン使用量の監視
Nova 2 Sonicは音声トークン + テキストトークンで課金されます。コスト監視の粒度はどうしますか？

A) 基本監視のみ - AWS Budgetsでの月次アラート（既存NFR踏襲）
B) セッション単位の詳細監視 - usageEventからトークン使用量を記録し、セッションごとのコストを可視化
C) リアルタイム監視 - トークン使用量をCloudWatchカスタムメトリクスに送信し、閾値超過時にアラート

[Answer]: 不要

### Q8: Cognito Identity Pool設定
SigV4認証にはCognito Identity Poolが必要です。現在のプロジェクトでのIdentity Pool設定はどうしますか？

A) 新規作成 - Nova 2 Sonic専用のIdentity Poolを作成
B) 既存のIdentity Poolを使用 - 既にAmplify設定で使用しているIdentity Poolがある場合
C) 不明 - 現在のプロジェクトにIdentity Poolが存在するか確認が必要

[Answer]: B

