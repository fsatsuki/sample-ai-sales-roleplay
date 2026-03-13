# Nova 2 Sonic移行 - 補足質問

回答を確認しました。いくつか補足確認が必要です。

---

## Clarification 1: Q8 - フロントエンドの接続方式

Q6でAgentCore Runtime（B）を選択されました。AgentCore Runtimeはコンテナベースで、ポート8080の`/ws`パスでWebSocketエンドポイントを公開します。

この場合、フロントエンドからの接続フローは以下のようになります:

```
フロントエンド → AgentCore Runtime WebSocket(/ws) → コンテナ内のBidiAgent → Nova 2 Sonic
```

現行のTranscribe WebSocket（API Gateway → Lambda）とは異なるアーキテクチャになります。

A) AgentCore RuntimeのWebSocketエンドポイントに直接接続（SigV4認証。フロントエンドからCognito Identity Poolで一時認証情報を取得してAgentCore Runtimeに接続）
B) API Gateway WebSocketを中継として維持（フロントエンド → API Gateway WebSocket → Lambda → AgentCore Runtime WebSocket。既存のJWT認証パターンを維持）
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Clarification 2: Q11 - マルチリージョンデプロイ

Q11で3つのリージョン（us-east-1, us-east-2, ap-northeast-1）を回答されました。Nova 2 Sonicは以下のリージョンで利用可能です:
- us-east-1 ✅
- us-west-2 ✅
- ap-northeast-1 ✅
- **us-east-2 ❌ 利用不可**

us-east-2環境ではNova 2 Sonicが利用できません。どのように対応しますか？

A) us-east-2環境ではNova 2 Sonicを使用せず、従来のTranscribe + Claude方式を維持する（フィーチャーフラグで切り替え）
B) us-east-2環境からus-east-1のNova 2 Sonicをクロスリージョンで呼び出す
C) us-east-2環境へのNova 2 Sonic導入は見送り、us-east-1とap-northeast-1のみ対応する
D) Other (please describe after [Answer]: tag below)

[Answer]: 
以下のリージョンとします。
- us-east-1 
- us-west-2 
- ap-northeast-1 

---

## Clarification 3: Session Continuation実装の確認

Q3でSession Continuation（A）を選択されました。Q6でAgentCore Runtime（B）を選択されているため、Session Continuationのロジックはコンテナ内のBidiAgentに実装することになります。

技術調査ドキュメントのSession Continuationパターンでは、以下の管理が必要です:
- セッション時間の監視（6分でモニタリング開始）
- バックグラウンドでの次セッション作成
- 音声バッファリング（10秒分）
- シームレスなセッション切り替え

これらはすべてAgentCore Runtimeのコンテナ内で処理する想定でよいですか？

A) はい、すべてコンテナ内で処理する（SessionTransitionManagerをBidiAgent内に実装）
B) セッション管理はフロントエンド側で行い、8分経過前にフロントエンドが新しいセッションを開始する
C) Other (please describe after [Answer]: tag below)

[Answer]: A


