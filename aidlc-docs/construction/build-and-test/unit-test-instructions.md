# Unit Test Execution - Nova 2 Sonic移行

## フロントエンドユニットテスト実行

### 1. 全テスト実行
```bash
cd frontend
npm run test
```

### 2. カバレッジ付きテスト
```bash
cd frontend
npm run test:coverage
```

### 3. 変更ファイルに関連するテスト
```bash
cd frontend
npx jest --testPathPattern="ConversationPage|SessionSettingsPanel|SidebarPanel|ApiService|AgentCoreService" --passWithNoTests
```

### 4. テスト結果の確認
- 既存テストが全てパスすること
- TranscribeService/SilenceDetector削除による既存テストの破壊がないこと

## テスト観点

### ConversationPage
- NovaSonicServiceの初期化・接続・切断が正しく動作すること
- ASR転写テキスト受信時にチャットUIが更新されること
- NPC応答テキスト受信時にチャットUIが更新されること
- エラー発生時にエラーUIが表示されること
- TranscribeService/SilenceDetectorへの参照が完全に削除されていること

### SessionSettingsPanel
- endpointingSensitivity設定UIが表示されること
- HIGH/MEDIUM/LOWの選択が正しく動作すること
- デフォルト値がMEDIUMであること
- localStorage永続化が動作すること
- silenceThreshold設定が削除されていること

### SidebarPanel
- silenceThreshold/setSilenceThreshold propsが削除されていること
- 既存機能が正常に動作すること

### AgentCoreService
- chatWithNPC()メソッドが削除されていること
- 他のメソッド（スコアリング、フィードバック等）が正常に動作すること

### NovaSonicService（新規）
- SigV4WebSocketClient経由のWebSocket接続が正しく初期化されること
- 音声チャンク送信が正しくエンコードされること
- テキストメッセージ送信が正しくフォーマットされること
- イベントリスナーの登録・解除が正しく動作すること
- エラーハンドリングが適切に動作すること

### AudioOutputManager（新規）
- 音声ソース切り替え（polly/nova-sonic）が正しく動作すること
- Nova 2 Sonic音声データのデコード・再生が正しく動作すること
- ボリューム制御が正しく動作すること
- 停止・再生状態管理が正しく動作すること

## バックエンドユニットテスト

### BidiAgentコンテナ
```bash
cd cdk/agents/nova-sonic-bidi
python -m pytest tests/ -v  # テストディレクトリが存在する場合
```

テスト観点:
- `session_transition_manager.py`: セッション遷移ロジック（6分タイマー、MONITORING状態遷移）
- `conversation_resumption.py`: 会話履歴取得・再送信ロジック
- `event_handler.py`: Nova 2 Sonicイベントパース（ASR転写、NPC応答、音声出力）
- `memory_manager.py`: AgentCore Memory API呼び出しロジック
- `prompts.py`: システムプロンプト生成（日英対応）

## i18n検証
```bash
cd frontend
npm run validate-i18n
```

確認事項:
- endpointingSensitivity関連キーが日英両方に存在すること
- silenceThreshold/silenceNote キーが削除されていること（使用箇所がないこと）
