# インフラストラクチャ設計書: Nova 2 Sonic移行

## 1. 概要

本ドキュメントは、Nova 2 Sonic移行におけるインフラストラクチャ設計を定義します。
AgentCore Runtime Migration Infrastructure Design（2026-01-08）をベースに、
Nova 2 Sonic BidiAgent固有のSigV4認証、WebSocket接続、Transcribe WebSocket廃止の変更を反映します。

---

## 2. 設計決定サマリー

| 項目 | 決定内容 | 根拠 |
|-----|---------|------|
| nova-sonic BidiAgent認証 | IAM認証（`RuntimeAuthorizerConfiguration.usingIAM()`） | SigV4認証にはIAMモードが必要 |
| Cognito Identity Pool権限 | `bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream` | AWS公式ドキュメントで確認済み |
| BidiAgentコンテナ権限 | `bedrock:InvokeModelWithBidirectionalStream` をコンストラクトに追加 | Nova 2 Sonic双方向ストリーミングAPI |
| CDKコンストラクト配置 | 既存 `agentcore-runtime.ts` を再利用 | パラメータで差異を吸収 |
| Transcribe WebSocket削除 | インスタンス化削除 + ファイル削除 | 完全廃止 |
| NPC会話AgentCore Runtime | 即時削除（CDKデプロイで自動削除） | nova-sonic BidiAgentに完全置き換え |
| フロントエンド環境変数 | `VITE_NOVA_SONIC_AGENT_ENDPOINT` + `VITE_NOVA_SONIC_AGENT_REGION` | Transcribe WebSocket URL置き換え |

---

## 3. nova-sonic BidiAgent AgentCore Runtime設計

### 3.1 エージェント構成

| 項目 | 設定 |
|-----|------|
| エージェント名 | `nova-sonic-bidi-agent` |
| 認証方式 | IAM認証（SigV4、Cognito Identity Pool経由） |
| WebSocketパス | `/ws`（ポート8080） |
| コンテナイメージ | ECR（`cdk/agents/nova-sonic-bidi/` からビルド） |
| プラットフォーム | linux/arm64 |
| ネットワーク | PUBLIC（VPCなし、既存NFR踏襲） |

### 3.2 CDK実装（既存コンストラクト再利用）

```typescript
// 既存 AgentCoreRuntime コンストラクトを使用
const novaSonicBidiAgent = new AgentCoreRuntime(this, 'NovaSonicBidiAgent', {
  envId: props.envId,
  resourceNamePrefix: props.resourceNamePrefix,
  cognitoUserPoolId: props.cognitoUserPoolId,
  cognitoClientId: props.cognitoClientId,
  agentCodePath: 'agents/nova-sonic-bidi',
  agentName: 'nova_sonic_bidi',
  description: 'Nova 2 Sonic BidiAgent - 双方向音声ストリーミング',
  enableJwtAuth: false,  // IAM認証（SigV4用）
  memoryId: props.agentCoreMemoryId,
  additionalPolicies: [
    // Nova 2 Sonic固有: 双方向ストリーミング権限は
    // コンストラクト標準権限に含まれるため追加不要
  ],
  additionalEnvironmentVariables: {
    NOVA_SONIC_MODEL_ID: 'amazon.nova-2-sonic-v1:0',
    NOVA_SONIC_REGION: cdk.Stack.of(this).region,
    DEFAULT_ENDPOINTING_SENSITIVITY: 'MEDIUM',
    SESSION_TRANSITION_THRESHOLD_SECONDS: '360',
    AUDIO_BUFFER_DURATION_SECONDS: '10',
  },
});
```

### 3.3 AgentCore Runtimeコンストラクト修正

既存の `agentcore-runtime.ts` に `bedrock:InvokeModelWithBidirectionalStream` 権限を標準権限として追加します。

```typescript
// 修正箇所: agentcore-runtime.ts の Bedrock InvokeModel権限
runtime.addToRolePolicy(new iam.PolicyStatement({
  sid: 'BedrockModelInvocation',
  effect: iam.Effect.ALLOW,
  actions: [
    'bedrock:InvokeModel',
    'bedrock:InvokeModelWithResponseStream',
    'bedrock:InvokeModelWithBidirectionalStream',  // 追加
  ],
  resources: ['arn:aws:bedrock:*::foundation-model/*', `arn:aws:bedrock:${region}:${account}:*`],
}));
```

---

## 4. SigV4認証 IAM設計

### 4.1 Cognito Identity Pool認証済みロール権限追加

既存の `auth.ts` に AgentCore Runtime WebSocket接続権限を追加します。

```typescript
// auth.ts に追加: AgentCore Runtime WebSocket権限
idPool.authenticatedRole.attachInlinePolicy(
  new Policy(this, 'GrantAccessAgentCoreWebSocket', {
    statements: [
      new PolicyStatement({
        actions: [
          'bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream',
        ],
        resources: [
          `arn:aws:bedrock-agentcore:*:${cdk.Stack.of(this).account}:runtime/*`,
        ],
      }),
    ],
  })
);
```

### 4.2 認証フロー

```
フロントエンド
  1. Cognito User Poolでログイン → JWTトークン取得
  2. fetchAuthSession() → Cognito Identity Poolから一時認証情報取得
     (AccessKeyId, SecretAccessKey, SessionToken)
  3. SigV4署名付きWebSocket URLを生成
     URL: wss://bedrock-agentcore.<region>.amazonaws.com/runtimes/<runtimeArn>/ws
     + SigV4クエリパラメータ
  4. WebSocket接続確立
```

### 4.3 認証方式の使い分け（全エージェント）

| エージェント | 呼び出し元 | 認証方式 | 変更 |
|------------|-----------|---------|------|
| nova-sonic BidiAgent | フロントエンド | SigV4（Cognito Identity Pool） | 新規 |
| realtime-scoring | フロントエンド | AgentCore Identity JWT | 既存維持 |
| feedback-analysis | Step Functions | IAMロール | 既存維持 |
| video-analysis | Step Functions | IAMロール | 既存維持 |
| audio-analysis | Step Functions | IAMロール | 既存維持 |

---

## 5. nova-sonic BidiAgentコンテナ IAMロール設計

### 5.1 ロール権限

```typescript
// AgentCore Runtimeコンストラクトが自動付与する権限:
// - bedrock:InvokeModel
// - bedrock:InvokeModelWithResponseStream
// - bedrock:InvokeModelWithBidirectionalStream（新規追加）
// - bedrock-agentcore:CreateEvent, GetEvent, ListEvents, GetMemory（Memory使用時）
// - logs:CreateLogGroup, CreateLogStream, PutLogEvents
// - xray:PutTraceSegments, PutTelemetryRecords

// 追加権限は不要（既存コンストラクトの標準権限で十分）
```

### 5.2 IAM最小権限サマリー

| ロール | 権限 | リソース |
|-------|------|---------|
| nova-sonic BidiAgent Runtime Role | Bedrock InvokeModel*, InvokeModelWithBidirectionalStream | foundation-model/* |
| nova-sonic BidiAgent Runtime Role | AgentCore Memory CRUD | memory/{memoryId} |
| Cognito Identity Pool Authenticated Role | InvokeAgentRuntimeWithWebSocketStream | runtime/* |

---

## 6. 削除対象インフラ

### 6.1 Transcribe WebSocket（完全削除）

| リソース | CDKファイル | 削除方法 |
|---------|-----------|---------|
| API Gateway WebSocket | `transcribe-websocket.ts` | ファイル削除 |
| Lambda: ConnectHandler | `transcribe-websocket.ts` | ファイル削除 |
| Lambda: DisconnectHandler | `transcribe-websocket.ts` | ファイル削除 |
| Lambda: DefaultHandler | `transcribe-websocket.ts` | ファイル削除 |
| DynamoDB: TranscribeConnections | `transcribe-websocket.ts` | ファイル削除 |
| Lambda関数コード | `lambda/transcribeWebSocket/` | ディレクトリ削除 |

削除手順:
1. `TranscribeWebSocketConstruct` のインスタンス化コードを削除
2. `cdk/lib/constructs/api/transcribe-websocket.ts` ファイルを削除
3. `cdk/lambda/transcribeWebSocket/` ディレクトリを削除
4. CDKデプロイで自動削除

### 6.2 NPC会話AgentCore Runtime（即時削除）

| リソース | 削除方法 |
|---------|---------|
| AgentCore Runtime: npc-conversation | CDKコード内のインスタンス化削除 → CDKデプロイで自動削除 |
| コンテナイメージ: npc-conversation-agent | `cdk/agents/npc-conversation/` ディレクトリ削除 |

削除手順:
1. npc-conversation AgentCore Runtimeのインスタンス化コードを削除
2. `cdk/agents/npc-conversation/` ディレクトリを削除
3. CDKデプロイで自動削除

---

## 7. 継続使用インフラ

### 7.1 変更なしのリソース

| リソース | 理由 |
|---------|------|
| Cognito User Pool | 既存ユーザーベース維持 |
| Cognito Identity Pool | SigV4認証に使用（権限追加のみ） |
| AgentCore Runtime: realtime-scoring | 変更なし |
| AgentCore Runtime: feedback-analysis | 変更なし |
| AgentCore Runtime: video-analysis | 変更なし |
| AgentCore Runtime: audio-analysis | 変更なし |
| AgentCore Memory | 保存元変更のみ（インフラ変更なし） |
| DynamoDB: Sessions, Scenarios, NPC, Users | 変更なし |
| S3: Videos, Audio, PDF | 変更なし |
| API Gateway REST | 変更なし |
| Step Functions | 変更なし |
| Amazon Polly | 変更なし |

---

## 8. フロントエンド環境変数設計

### 8.1 削除する環境変数

```bash
# 削除
VITE_TRANSCRIBE_WEBSOCKET_URL=wss://xxx.execute-api.ap-northeast-1.amazonaws.com/prod
```

### 8.2 追加する環境変数

```bash
# 追加
VITE_NOVA_SONIC_AGENT_ENDPOINT=<AgentCore Runtime Endpoint URL>
VITE_NOVA_SONIC_AGENT_REGION=ap-northeast-1
```

### 8.3 環境別設定

```bash
# .env.dev
VITE_NOVA_SONIC_AGENT_ENDPOINT=<dev AgentCore Runtime Endpoint>
VITE_NOVA_SONIC_AGENT_REGION=ap-northeast-1

# .env.staging
VITE_NOVA_SONIC_AGENT_ENDPOINT=<staging AgentCore Runtime Endpoint>
VITE_NOVA_SONIC_AGENT_REGION=ap-northeast-1

# .env.prod
VITE_NOVA_SONIC_AGENT_ENDPOINT=<prod AgentCore Runtime Endpoint>
VITE_NOVA_SONIC_AGENT_REGION=ap-northeast-1
```

### 8.4 CDK出力からの環境変数取得

```typescript
// CDKスタックからのOutput
new cdk.CfnOutput(this, 'NovaSonicAgentEndpoint', {
  value: novaSonicBidiAgent.endpointArn,
  exportName: `${props.resourceNamePrefix}nova-sonic-bidi-endpoint`,
});
```

---

## 9. CDKスタック構成

### 9.1 変更概要

```
InfrastructureStack
├── 既存リソース（継続使用）
│   ├── Cognito User Pool
│   ├── Cognito Identity Pool（権限追加: InvokeAgentRuntimeWithWebSocketStream）
│   ├── DynamoDB (Scenarios, NPC, Users, Sessions)
│   ├── S3 (Videos, Audio, Sessions, PDF)
│   ├── API Gateway REST
│   ├── Step Functions
│   ├── AgentCore Runtime: realtime-scoring
│   ├── AgentCore Runtime: feedback-analysis
│   ├── AgentCore Runtime: video-analysis
│   └── AgentCore Runtime: audio-analysis
│
├── 新規リソース（追加）
│   └── AgentCore Runtime: nova-sonic-bidi-agent（IAM認証、WebSocket /ws）
│
└── 削除リソース
    ├── TranscribeWebSocketConstruct（API GW + Lambda×3 + DynamoDB）
    └── AgentCore Runtime: npc-conversation
```

---

## 10. セキュリティ設計

### 10.1 IAM最小権限

| ロール | 権限 | リソース |
|-------|------|---------|
| nova-sonic BidiAgent Runtime Role | Bedrock InvokeModel* | foundation-model/* |
| nova-sonic BidiAgent Runtime Role | AgentCore Memory CRUD | memory/{memoryId} |
| Cognito Authenticated Role | InvokeAgentRuntimeWithWebSocketStream | runtime/* |
| Cognito Authenticated Role | Bedrock InvokeModel（既存） | foundation-model/* |
| Cognito Authenticated Role | Polly SynthesizeSpeech（既存） | * |

### 10.2 データ暗号化

| データ | 暗号化方式 | 変更 |
|-------|----------|------|
| WebSocket通信 | TLS 1.2+（WSS） | 新規（SigV4署名付き） |
| AgentCore Memory | AWS管理キー（デフォルト） | 既存維持 |
| S3 | SSE-S3 | 既存維持 |

---

## 11. 監視設計

### 11.1 CloudWatch メトリクス

| メトリクス | 閾値 | アラーム | 変更 |
|----------|-----|---------|------|
| AgentCore Runtime Errors (nova-sonic) | 10% | SNS通知 | 新規 |
| AgentCore Runtime Latency (nova-sonic) | 60秒 | SNS通知 | 新規 |
| AgentCore Runtime Errors (scoring) | 10% | SNS通知 | 既存維持 |

### 11.2 CloudWatch Logs

| ログ | 保持期間 | 変更 |
|-----|---------|------|
| /aws/bedrock-agentcore/runtimes/nova-sonic-bidi | 30日 | 新規 |
| /aws/bedrock-agentcore/runtimes/realtime-scoring | 30日 | 既存維持 |

---

**作成日**: 2026-03-11
**ベース**: AgentCore Runtime Migration Infrastructure Design (2026-01-08)
**バージョン**: 1.0
