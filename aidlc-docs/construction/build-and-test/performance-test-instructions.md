# Performance Test Instructions - Nova 2 Sonic移行

## 目的
Nova 2 Sonic移行後のリアルタイム音声対話のレイテンシーとパフォーマンスを検証する。

## パフォーマンス要件（NFR Designより）
- 音声入力→ASR転写表示: 500ms以内
- ASR転写→NPC応答テキスト表示: 2秒以内
- NPC応答→音声再生開始: 500ms以内（Polly使用時）
- エンドツーエンドレイテンシー: 3秒以内
- WebSocket接続確立: 2秒以内
- 同時接続: 最大100接続対応

## テスト観点

### 1. レイテンシー計測
- Chrome DevToolsのPerformanceタブで以下を計測:
  - WebSocket接続確立時間
  - 音声データ送信→ASR転写受信までの時間
  - ASR転写受信→NPC応答受信までの時間
  - NPC応答受信→Polly音声再生開始までの時間

### 2. メモリ使用量
- Chrome DevToolsのMemoryタブで以下を確認:
  - AudioWorklet（NovaSonicAudioProcessor）のメモリ使用量
  - WebSocket接続中のメモリリーク有無
  - 長時間セッション（10分以上）でのメモリ増加傾向

### 3. CPU使用率
- Chrome DevToolsのPerformanceタブで以下を確認:
  - 音声キャプチャ中のCPU使用率
  - AudioWorklet処理中のCPU使用率
  - SigV4署名計算のCPU負荷

### 4. ネットワーク帯域
- Chrome DevToolsのNetworkタブで以下を確認:
  - WebSocketフレームサイズ（音声データ送信）
  - WebSocketフレーム頻度
  - 総データ転送量（1セッションあたり）

## 確認方法

### レイテンシー計測手順
1. Chrome DevToolsのConsoleでタイムスタンプログを有効化
2. 音声対話を開始
3. 各イベント（ASR転写、NPC応答、音声再生）のタイムスタンプを記録
4. 各区間のレイテンシーを算出

### メモリリーク確認手順
1. Chrome DevToolsのMemoryタブでヒープスナップショットを取得（セッション開始前）
2. 5分間の音声対話を実施
3. ヒープスナップショットを再取得
4. 差分を確認し、解放されないオブジェクトがないことを確認

## 旧アーキテクチャとの比較
| 指標 | 旧（Transcribe + Claude） | 新（Nova 2 Sonic） | 改善 |
|------|--------------------------|-------------------|------|
| ASR転写レイテンシー | ~500ms | ~300ms（予測） | 40%改善 |
| NPC応答レイテンシー | ~3秒 | ~1.5秒（予測） | 50%改善 |
| WebSocket接続数 | 2（Transcribe + API GW） | 1（AgentCore） | 50%削減 |
| サービス依存数 | 4（Transcribe, API GW, Lambda, DynamoDB） | 1（AgentCore Runtime） | 75%削減 |

## 備考
Nova 2 Sonicは音声認識・NPC対話生成を単一モデルで処理するため、旧アーキテクチャ（Transcribe Streaming → Lambda → Claude → Polly）と比較してエンドツーエンドレイテンシーの大幅な改善が期待される。
