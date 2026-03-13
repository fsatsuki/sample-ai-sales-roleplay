# Build Instructions - Nova 2 Sonic移行

## Prerequisites
- Node.js 18.x以上
- Python 3.12以上（BidiAgentコンテナ用）
- Docker（BidiAgentコンテナビルド用）
- npm（フロントエンド依存関係管理）
- AWS CLI最新版
- AWS CDK最新版

## Build Steps

### 1. フロントエンド依存関係インストール
```bash
cd frontend
npm install
```

新規追加パッケージ:
- `@aws-crypto/sha256-js` - SigV4署名用
- `@aws-sdk/protocol-http` - HTTP リクエスト構築用
- `@aws-sdk/signature-v4` - SigV4署名用

### 2. フロントエンドリント
```bash
cd frontend
npm run lint
```

### 3. フロントエンドビルド（型チェック付き）
```bash
cd frontend
npm run build:full
```

### 4. ビルド成功の確認
- `frontend/dist/` ディレクトリにビルド成果物が生成されること
- TypeScript型エラーが0件であること
- ESLintエラーが0件であること

### 5. BidiAgentコンテナビルド確認
```bash
cd cdk/agents/nova-sonic-bidi
docker build --platform linux/arm64 -t nova-sonic-bidi-agent .
```

確認事項:
- Dockerfileが正常にビルドされること
- Python依存関係（strands-agents, fastapi, uvicorn等）がインストールされること

### 6. CDKデプロイ（開発環境）
```bash
cd cdk
npm run deploy:dev
```

デプロイ内容:
- nova-sonic-bidi-agent AgentCore Runtimeインスタンス作成
- npc-conversation AgentCore Runtimeインスタンス削除
- TranscribeWebSocketConstruct削除
- Cognito Identity Pool権限更新（bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream）
- CfnOutput: NovaSonicAgentEndpoint

### 7. 環境変数設定
デプロイ後、CDK出力から以下の値を取得してフロントエンド環境変数に設定:
```bash
# frontend/.env に設定
VITE_NOVA_SONIC_AGENT_ENDPOINT=<CDK出力のNovaSonicAgentEndpoint>
VITE_NOVA_SONIC_AGENT_REGION=us-west-2
```

## Troubleshooting

### TypeScript型エラー
- `NovaSonicService`、`SigV4WebSocketClient`、`AudioOutputManager` の型定義を確認
- `TranscribeService`、`SilenceDetector` への参照が残っていないことを確認

### npm install失敗
- `@aws-crypto/sha256-js`、`@aws-sdk/protocol-http`、`@aws-sdk/signature-v4` のバージョン互換性を確認

### CDKデプロイ失敗
- AgentCore Runtime権限（`bedrock:InvokeModelWithBidirectionalStream`）が正しく設定されていることを確認
- Cognito Identity Pool認証済みロールの権限を確認

### BidiAgentコンテナビルド失敗
- Python 3.12ベースイメージが利用可能であることを確認
- `requirements.txt` の依存関係バージョンを確認
