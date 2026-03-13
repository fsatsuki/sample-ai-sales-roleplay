# Nova 2 Sonic移行 - 要件確認質問

技術調査ドキュメント（docs/nova2-sonic-technical-research.md）を確認しました。以下の質問に回答をお願いします。

---

## Question 1
Nova 2 Sonicの利用パターンについて、どのパターンを採用しますか？

技術調査ドキュメントでは3つのパターンが記載されています:
- パターンA: 音声入力 → 音声出力（Speech-to-Speech）
- パターンB: 音声+テキスト入力 → 音声出力（Cross-modal Input）
- パターンC: 音声+テキスト入力 → テキスト出力

A) パターンA: 音声入力 → 音声出力（Nova 2 Sonicが音声認識・対話生成・音声合成をすべて担当。Pollyは使用しない）
B) パターンB: Cross-modal Input（音声ストリーミング中にテキストメッセージも送信可能。Nova 2 Sonicが音声で応答）
C) パターンC: 音声入力 → テキスト出力のみ抽出（Nova 2 Sonicは音声認識+対話生成のみ。音声合成はPolly継続）
D) パターンBベース + Polly音声合成（Nova 2 Sonicで音声認識+対話生成、音声出力はPollyで別途実施）
E) Other (please describe after [Answer]: tag below)

[Answer]: Cross-modal Inputで音声ストリーミング中にテキストメッセージも送信可能。ユーザーへの出力はNova2 Sonicの音声ではなく、Pollyを継続利用する。

---

## Question 2
Nova 2 Sonicの日本語は公式サポート外です。日本語対応についてどのように進めますか？

A) 日本語非公式サポートのまま進める（精度低下を許容。システムプロンプトで日本語応答を指示）
B) 英語のみで実装し、日本語は将来対応とする
C) Nova 2 Sonicは音声認識（ASR）のみ使用し、対話生成は引き続きClaude 4.5 Haikuを使用する
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 3
8分のセッション制限への対応方針を教えてください。営業ロールプレイセッションは8分を超える可能性があります。

A) Session Continuation（シームレスなセッション継続）を実装する（推奨。ユーザーに中断を感じさせない）
B) Conversation Resumption（会話再開）のみ実装する（シンプルだが一瞬の中断あり）
C) Session Continuation + Conversation Resumption（フォールバック）の両方を実装する
D) 8分制限をそのまま受け入れる（セッションが8分で終了）
E) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 4
Nova 2 Sonicの対話生成を採用する場合、現在のNPC会話エージェント（AgentCore Runtime上のStrands Agent + Claude 4.5 Haiku）はどうしますか？

A) 完全に置き換える（Nova 2 SonicがNPC対話を直接生成。AgentCore NPC会話Runtimeは廃止）
B) 併用する（Nova 2 Sonicは音声認識のみ、NPC対話生成は引き続きAgentCore Runtime）
C) Nova 2 Sonicをオーケストレーターとし、AgentCoreのサブエージェントをtool useで呼び出す（技術調査セクション9.3のマルチエージェントパターン）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 5
リアルタイムスコアリング（怒りメーター、信頼度、進捗度）との統合方針を教えてください。

現在はユーザーメッセージ送信後にリアルタイムスコアリングAPIを別途呼び出しています。

A) Nova 2 Sonicのtool useでリアルタイムスコアリングを呼び出す（Nova Sonicが自動的にスコアリングをトリガー）
B) 現行方式を維持（フロントエンドからNPC応答受信後に別途スコアリングAPIを呼び出す）
C) Nova 2 SonicのASR転写テキストを取得し、それを使ってスコアリングAPIを呼び出す
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 6
Nova 2 Sonicのバックエンド実装方式を教えてください。

A) Lambda + WebSocket API Gateway（現行のTranscribe WebSocketと同様のアーキテクチャ。Lambda内でNova 2 Sonicの双方向ストリーミングを処理）
B) AgentCore Runtime上にデプロイ（Strands BidiAgentを使用。コンテナベース）
C) ECS/Fargate上にデプロイ（カスタムコンテナでNova 2 Sonicセッションを管理）
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 7
AgentCore Memoryとの統合方針を教えてください。現在、会話履歴はAgentCore Memoryに保存されています。

A) Nova 2 Sonicの会話履歴（ASR転写 + 応答テキスト）をAgentCore Memoryに保存し続ける
B) Nova 2 Sonicのセッション内で会話コンテキストを管理し、AgentCore Memoryは使用しない
C) Nova 2 Sonicのセッション内管理 + セッション終了時にAgentCore Memoryに一括保存
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 8
フロントエンドの音声入力方式について確認します。現在はTranscribeService経由でWebSocket接続し、マイク音声をPCM 16kHzでストリーミングしています。

A) 現行と同様のWebSocket方式（フロントエンド → WebSocket API Gateway → Lambda/コンテナ → Nova 2 Sonic）
B) フロントエンドから直接Bedrock APIに接続（SigV4認証。Cognito Identity Poolで一時認証情報を取得）
C) Other (please describe after [Answer]: tag below)

[Answer]: Q6の回答を踏まえると、選択肢はどうなりますか？

---

## Question 9
Polly音声合成の継続利用について確認します。Nova 2 Sonicの対話生成テキストをPollyで音声化する場合、現在のViseme（口形状）データとの統合はどうしますか？

A) 現行通りPolly + Visemeを維持（Nova 2 Sonicから取得したNPC応答テキストをPollyに渡す）
B) Pollyは使用するがVisemeは不要（3Dアバターのリップシンクは音量ベースに戻す）
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 10
移行戦略について確認します。

A) ビッグバン移行（Transcribe + Claude NPC会話を一度にNova 2 Sonicに置き換え）
B) 段階的移行 Phase 1: 音声認識のみNova 2 Sonic、対話生成はClaude維持 → Phase 2: 対話生成もNova 2 Sonic
C) フィーチャーフラグで切り替え可能にする（Nova 2 Sonic / 従来方式を動的に切り替え）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 11
Nova 2 Sonicのリージョンについて確認します。現在のシステムはどのリージョンにデプロイされていますか？

A) ap-northeast-1（東京）- Nova 2 Sonic利用可能
B) us-east-1（バージニア）- Nova 2 Sonic利用可能
C) us-west-2（オレゴン）- Nova 2 Sonic利用可能
D) Other (please describe after [Answer]: tag below)

[Answer]: us-east-1, us-east-2, ap-northeast-1

