# Amazon Nova 2 Sonic 技術調査レポート

## 調査日: 2026年3月11日

---

## 1. 概要

Amazon Nova 2 Sonic（モデルID: `amazon.nova-2-sonic-v1:0`）は、Amazon Bedrockの双方向ストリーミングAPI（`InvokeModelWithBidirectionalStream`）を通じて利用できるSpeech-to-Speech基盤モデルです。音声理解と音声生成を単一モデルに統合し、リアルタイムの人間らしい音声会話を実現します。

- 公式ドキュメント: [Nova 2 Sonic User Guide](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-getting-started.html)
- API: `InvokeModelWithBidirectionalStream`（Bedrock Runtime）
- 接続制限: 1セッション最大8分（接続更新による会話継続パターンあり）
- コンテキストウィンドウ: 1Mトークン

---

## 2. 日本語対応状況

### 公式サポート言語（2025年12月時点）

| 言語 | ロケール | 女性音声 | 男性音声 |
|------|----------|----------|----------|
| English (US) | en-US | tiffany | matthew |
| English (UK) | en-GB | amy | - |
| English (AU) | en-AU | olivia | - |
| English (IN) | en-IN | kiara | arjun |
| French | fr-FR | ambre | florian |
| Italian | it-IT | beatrice | lorenzo |
| German | de-DE | tina | lennart |
| Spanish (US) | es-US | lupe | carlos |
| Portuguese | pt-BR | carolina | leo |
| Hindi | hi-IN | kiara | arjun |

### 日本語の状況

- **日本語は公式サポート対象外**です
- AWS AI Service Cardには「English, Spanish, German, French, Italian, Portuguese, and Hindi languages use cases only」と明記されています
- 「unsupported languages may result in reduced speech recognition accuracy, less natural-sounding voice responses, or content errors」と警告されています
- ただし、Nova 2 Sonicは多言語データで学習されており、日本語を含む非公式言語でも一定程度動作する可能性があります
- Amazon Connectとの統合においても「Japanese regions and the Japanese language are not yet supported」と報告されています（[classmethod.jp](https://dev.classmethod.jp/en/articles/aws-reinvent-amazon-connect-supports-nova-sonic/)）

### リージョン可用性

Nova 2 Sonicは以下のリージョンで利用可能です:
- US East (N. Virginia) - `us-east-1`
- US West (Oregon) - `us-west-2`
- Asia Pacific (Tokyo) - `ap-northeast-1` ✅

東京リージョンで利用可能なため、レイテンシーの観点では日本からのアクセスに有利です。

---

## 3. 利用パターン別の技術的方法

Nova 2 Sonicはイベント駆動型アーキテクチャを採用しており、すべての通信は構造化されたJSON形式のイベントで行われます。基本的なイベントフローは以下の通りです:

```
sessionStart → promptStart → [contentStart → input → contentEnd]* → promptEnd → sessionEnd
```

### 3.1 パターンA: 音声入力 → 音声出力（Speech-to-Speech）

これがNova 2 Sonicの主要な利用パターンです。

#### イベントフロー

```
1. sessionStart（推論設定、ターン検出設定）
2. promptStart（音声出力設定、テキスト出力設定）
3. contentStart（SYSTEM, TEXT）→ textInput（システムプロンプト）→ contentEnd
4. contentStart（USER, AUDIO）→ audioInput（音声チャンク連続送信）→ contentEnd
5. [レスポンス受信: ASR転写 → テキスト応答 → 音声応答]
6. promptEnd → sessionEnd
```

#### 実装の要点

**セッション開始:**
```json
{
  "event": {
    "sessionStart": {
      "inferenceConfiguration": {
        "maxTokens": 1024,
        "topP": 0.9,
        "temperature": 0.7
      },
      "turnDetectionConfiguration": {
        "endpointingSensitivity": "HIGH"
      }
    }
  }
}
```

`endpointingSensitivity`は`HIGH`/`MEDIUM`/`LOW`から選択可能で、ユーザーの発話終了検出の感度を制御します。

**音声出力設定（promptStart内）:**
```json
{
  "event": {
    "promptStart": {
      "promptName": "<UUID>",
      "textOutputConfiguration": {
        "mediaType": "text/plain"
      },
      "audioOutputConfiguration": {
        "mediaType": "audio/lpcm",
        "sampleRateHertz": 24000,
        "sampleSizeBits": 16,
        "channelCount": 1,
        "voiceId": "matthew",
        "encoding": "base64",
        "audioType": "SPEECH"
      }
    }
  }
}
```

出力サンプルレートは `8000`、`16000`、`24000` から選択可能です。

**音声入力設定:**
```json
{
  "event": {
    "contentStart": {
      "promptName": "<UUID>",
      "contentName": "<UUID>",
      "type": "AUDIO",
      "interactive": true,
      "role": "USER",
      "audioInputConfiguration": {
        "mediaType": "audio/lpcm",
        "sampleRateHertz": 16000,
        "sampleSizeBits": 16,
        "channelCount": 1,
        "audioType": "SPEECH",
        "encoding": "base64"
      }
    }
  }
}
```

入力サンプルレートも `8000`、`16000`、`24000` から選択可能です。

**音声チャンク送信:**
```json
{
  "event": {
    "audioInput": {
      "promptName": "<UUID>",
      "contentName": "<UUID>",
      "content": "<base64エンコードされた音声データ>"
    }
  }
}
```

音声フレームは約32msごとにキャプチャし、リアルタイムで送信します。

**レスポンスの構造:**

モデルからの応答は以下の順序で返されます:
1. `completionStart` - 応答開始
2. `contentStart`(TEXT, USER, FINAL) → `textOutput` → `contentEnd` - ASR転写（ユーザーの発話テキスト）
3. `contentStart`(TEXT, ASSISTANT, SPECULATIVE) → `textOutput` → `contentEnd` - テキスト応答プレビュー
4. `contentStart`(AUDIO, ASSISTANT) → `audioOutput`(複数チャンク) → `contentEnd` - 音声応答
5. `contentStart`(TEXT, ASSISTANT, FINAL) → `textOutput` → `contentEnd` - 最終転写
6. `usageEvent` - トークン使用量
7. `completionEnd` - 応答完了

#### 日本語での利用に関する注意

- システムプロンプトで日本語での応答を指示することは可能です
- ただし、voiceIdに日本語ネイティブの音声はないため、英語音声（matthew, tiffanyなど）で日本語を読み上げることになります
- 音声認識（ASR）の精度は公式サポート言語と比較して低下する可能性があります
- 音声合成の自然さも低下する可能性があります

---

### 3.2 パターンB: 音声+テキスト入力 → 音声出力（Cross-modal Input → Speech Output）

Nova 2 Sonicの「Cross-modal Input」機能を使用して、音声ストリーミングセッション中にテキストメッセージを送信し、音声で応答を受け取るパターンです。

#### 重要な前提条件

- Cross-modal入力には**アクティブなストリーミングセッション**が必要です
- セッションは通常の音声セッションと同様に連続ストリーミングを維持する必要があります
- ストリーミングが停止すると、標準のセッションタイムアウトが適用され接続が切断されます

#### ユースケース

1. **Webアプリ/モバイルアプリ統合**: テキストと音声の両方でインタラクション
2. **Model-start-first**: セッション開始直後にテキストメッセージを送信してモデルに発話を開始させる
3. **非同期ツール呼び出し中のガイド**: ツール処理中にテキストで「少々お待ちください」等のメッセージを送信
4. **DTMF統合**: 電話のキーパッド入力をテキストに変換して送信

#### イベントフロー

```
1. sessionStart
2. promptStart（audioOutputConfiguration含む）
3. contentStart（SYSTEM, TEXT）→ textInput（システムプロンプト）→ contentEnd
4. contentStart（USER, AUDIO）→ audioInput（音声ストリーミング開始）
   ↕ 音声ストリーミング中に以下を挿入可能:
5. contentStart（USER, TEXT, interactive=true）→ textInput（テキストメッセージ）→ contentEnd
   [レスポンス: 音声で応答]
6. 音声ストリーミング継続...
```

#### テキスト入力イベントの構造

**contentStart（テキスト入力開始）:**
```json
{
  "event": {
    "contentStart": {
      "promptName": "<prompt_name>",
      "contentName": "<新しいUUID>",
      "role": "USER",
      "type": "TEXT",
      "interactive": true,
      "textInputConfiguration": {
        "mediaType": "text/plain"
      }
    }
  }
}
```

`interactive: true` がCross-modal入力の鍵です。これにより、アクティブな音声セッション中にテキストメッセージを送信できます。

**textInput（テキスト内容送信）:**
```json
{
  "event": {
    "textInput": {
      "promptName": "<prompt_name>",
      "contentName": "<新しいUUID>",
      "content": "ここにテキストメッセージを入力"
    }
  }
}
```

**contentEnd（テキスト入力終了）:**
```json
{
  "event": {
    "contentEnd": {
      "promptName": "<prompt_name>",
      "contentName": "<新しいUUID>"
    }
  }
}
```

#### 注意点

- テキスト入力ごとに新しいUUIDを`contentName`に生成する必要があります
- `promptName`はセッション全体で一貫して同じ値を使用します
- 音声ストリーミングを停止せずにテキスト入力を挿入できます
- レスポンスは`audioOutputConfiguration`で設定した音声形式で返されます

#### 日本語での活用方法

このパターンは日本語利用において特に有用です:
- テキスト入力部分は日本語テキストをそのまま送信可能
- 音声認識の精度問題を回避し、テキストで正確な入力を提供できる
- システムプロンプトやコンテキスト情報をテキストで補完しつつ、ユーザーの音声入力も受け付ける

---

### 3.3 パターンC: 音声+テキスト入力 → テキスト出力（Speech/Text Input → Text Output）

Nova 2 Sonicは基本的にSpeech-to-Speechモデルとして設計されており、**音声出力を完全に無効化してテキストのみを返す公式な方法は提供されていません**。

ただし、以下の方法でテキスト応答を取得することは可能です。

#### 方法: 音声出力を受信しつつテキスト応答を抽出する

Nova 2 Sonicのレスポンスには常に以下が含まれます:
1. **ASR転写**（`textOutput`, role=USER, generationStage=FINAL）: ユーザーの発話のテキスト化
2. **テキスト応答プレビュー**（`textOutput`, role=ASSISTANT, generationStage=SPECULATIVE）: モデルが発話する予定のテキスト
3. **音声応答**（`audioOutput`）: 実際の音声データ
4. **最終転写**（`textOutput`, role=ASSISTANT, generationStage=FINAL）: 実際に発話されたテキスト

#### 実装アプローチ

```python
# レスポンス処理でテキストのみを抽出する例
async def _process_responses(self):
    while self.is_active:
        output = await self.stream.await_output()
        result = await output[1].receive()
        
        if result.value and result.value.bytes_:
            response_data = result.value.bytes_.decode('utf-8')
            json_data = json.loads(response_data)
            
            if 'event' in json_data:
                if 'contentStart' in json_data['event']:
                    content_start = json_data['event']['contentStart']
                    self.role = content_start.get('role')
                    
                    # generationStageを確認
                    if 'additionalModelFields' in content_start:
                        additional = json.loads(content_start['additionalModelFields'])
                        self.generation_stage = additional.get('generationStage')
                
                elif 'textOutput' in json_data['event']:
                    text = json_data['event']['textOutput']['content']
                    
                    if self.role == "USER" and self.generation_stage == "FINAL":
                        # ユーザーの発話テキスト（ASR結果）
                        print(f"[ASR] User: {text}")
                    
                    elif self.role == "ASSISTANT" and self.generation_stage == "SPECULATIVE":
                        # モデルの応答テキスト（プレビュー）
                        print(f"[Preview] Assistant: {text}")
                    
                    elif self.role == "ASSISTANT" and self.generation_stage == "FINAL":
                        # モデルの最終応答テキスト
                        print(f"[Final] Assistant: {text}")
                
                elif 'audioOutput' in json_data['event']:
                    # 音声データは無視（再生しない）
                    pass
```

#### 制約事項

- `promptStart`で`audioOutputConfiguration`を省略することはできません（セッション確立に必要）
- 音声データは生成・送信されるため、帯域幅とコスト（speechトークン）は発生します
- テキストのみが必要な場合でも、音声生成分のトークンが課金されます

#### 日本語での活用

- ASR転写を利用して、日本語音声をテキスト化する用途に使える可能性があります
- ただし、日本語ASRの精度は公式サポート言語より低い可能性があります
- テキスト応答（SPECULATIVE/FINAL）は日本語で返される可能性がありますが、品質は保証されません

---

## 4. 会話履歴の管理

Nova 2 Sonicでは、システムプロンプトの後、音声ストリーミング開始前に会話履歴を含めることができます。

```json
// USER履歴
{
  "event": {
    "contentStart": {
      "promptName": "<UUID>",
      "contentName": "<UUID>",
      "type": "TEXT",
      "interactive": false,
      "role": "USER",
      "textInputConfiguration": { "mediaType": "text/plain" }
    }
  }
}
// → textInput → contentEnd

// ASSISTANT履歴
{
  "event": {
    "contentStart": {
      "promptName": "<UUID>",
      "contentName": "<UUID>",
      "type": "TEXT",
      "interactive": false,
      "role": "ASSISTANT",
      "textInputConfiguration": { "mediaType": "text/plain" }
    }
  }
}
// → textInput → contentEnd
```

会話履歴はテキスト形式で提供し、`interactive: false`に設定します。

---

## 5. 8分超のセッション継続

Nova 2 Sonicには1セッションあたり最大約8分の接続制限があります。しかし、AWSが提供する2つのパターンを使用することで、8分を超える長時間の会話を実現できます。

### 5.1 Session Continuation（シームレスなセッション継続）

8分の制限に達する前にバックグラウンドで次のセッションを作成し、ユーザーに気づかれることなく切り替えるパターンです。長時間の連続会話に最適です。

公式サンプル: [session-continuation (Python)](https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech/amazon-nova-2-sonic/repeatable-patterns/session-continuation/console-python)

#### 動作フロー

```
Phase 1: 通常動作（0〜6分）
  → セッション1が通常通り動作

Phase 2: 監視開始（6:00〜8:00）
  → しきい値到達、アシスタントの発話開始を待機

Phase 3: バッファリング（アシスタント発話検出時）
  → アシスタントのAUDIO contentStart検出をトリガーに
  → 直近10秒間のユーザー音声をバッファリング開始
  → バックグラウンドで次のセッションを作成

Phase 4: ハンドオフ（次セッション準備完了時）
  → 会話履歴を次のセッションに転送
  → バッファした音声を次のセッションに送信
  → 即座にセッションを切り替え
  → 旧セッションをバックグラウンドで閉じる

Phase 5: 継続
  → セッション2がアクティブに
  → セッション2が制限に近づいたら同じプロセスを繰り返し
```

#### 主要な設定パラメータ

| パラメータ | デフォルト | 説明 |
|---|---|---|
| `transition_threshold_seconds` | 360（6分） | セッション切り替え監視を開始するタイミング |
| `audio_buffer_duration_seconds` | 10 | 切り替え中にバッファする音声の長さ（秒） |
| `audio_start_timeout_seconds` | 100 | アシスタント発話開始の最大待機時間 |
| `next_session_ready_timeout_seconds` | 30 | 次セッション準備のタイムアウト |

#### パフォーマンス

公式サンプルの計測結果によると:
- セッション切り替え時間: ユーザーが知覚できない即時ハンドオフ
- 会話効率: 98.2%が実際の会話時間（オーバーヘッドは1.8%）
- メモリ使用量: バッファは320KB（16kHz PCMで10秒分）、切り替え中のみアクティブ
- 音声欠落: なし（バッファリングにより保護）

#### 実装の要点

`SessionTransitionManager`がコアコンポーネントとして以下を管理します:

1. 現在のセッションと次のセッションのライフサイクル
2. 音声の適切なルーティング
3. セッション時間の監視
4. 切り替えロジックとオーディオバッファ

```python
# 設定例（本番環境向け）
config = {
    "transition_threshold_seconds": 360,    # 6分でモニタリング開始
    "audio_buffer_duration_seconds": 10,    # 10秒バッファ
    "enable_session_recording": True,       # デバッグ用録音
    "recording_output_dir": "./session_recordings"
}
```

### 5.2 Conversation Resumption（会話再開）

セッション切断後に会話履歴をテキストとして再送信し、コンテキストを復元するパターンです。エラーリカバリや意図的な中断後の再開に適しています。

公式サンプル: [resume-conversation (NodeJS)](https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech/amazon-nova-2-sonic/repeatable-patterns/resume-conversation)

#### 実装手順

1. 会話中のテキスト履歴（ASR転写結果 + アシスタント応答テキスト）を保存
2. 新しいセッションを開始し、システムプロンプトを送信
3. システムプロンプトの後、音声ストリーミング開始前に、保存した会話履歴を送信
4. 音声ストリーミングを開始し、会話を継続

```typescript
// 会話履歴の送信例（システムプロンプト後、音声ストリーム開始前）
// 必ずUSER → ASSISTANTの順序で交互に送信
// 最初のメッセージはUSERロールである必要がある
await session.setupHistoryForConversationResumtion(
    undefined, "こんにちは、保険の見直しについて相談したいのですが", "USER"
);
await session.setupHistoryForConversationResumtion(
    undefined, "かしこまりました。現在ご加入の保険の種類を教えていただけますか？", "ASSISTANT"
);
await session.setupHistoryForConversationResumtion(
    undefined, "生命保険と医療保険に入っています", "USER"
);
await session.setupHistoryForConversationResumtion(
    undefined, "ありがとうございます。それぞれの月額保険料はおいくらですか？", "ASSISTANT"
);
// → この後、音声ストリーミングを開始
// → ユーザーは保険料の回答から会話を再開できる
```

#### 適用シーン

- `ModelTimeoutException`（モデルタイムアウト）からのリカバリ
- 予期しない接続切断後のコンテキスト復元
- ユーザーが意図的に中断した会話の再開

### 5.3 2つのパターンの比較

| 観点 | Session Continuation | Conversation Resumption |
|---|---|---|
| 主な用途 | 長時間の連続会話 | エラーリカバリ・中断後の再開 |
| ユーザー体験 | シームレス（中断なし） | 一瞬の中断あり |
| 実装複雑度 | 高（バッファリング・並行セッション管理） | 中（履歴保存・再送信） |
| 音声の欠落 | なし（バッファで保護） | 切断中の音声は失われる |
| コンテキスト保持 | 会話履歴 + 音声バッファ | 会話履歴（テキストのみ） |
| 公式サンプル言語 | Python | NodeJS (TypeScript) |

### 5.4 本プロジェクトへの適用

営業ロールプレイセッションは8分を超える可能性が十分にあるため、Session Continuationパターンの採用が適切です。加えて、Conversation Resumptionをエラーリカバリ用のフォールバックとして併用することで、堅牢な長時間会話を実現できます。

実装時の考慮点:
- 会話履歴の保存は、リアルタイムスコアリングのコンテキスト維持にも活用可能
- セッション切り替え時にスコアリング状態（怒りメーター、信頼度等）も引き継ぐ必要がある
- `transition_threshold_seconds`は営業ロールプレイの平均的な発話パターンに合わせて調整

---

## 6. ツール呼び出し（Function Calling）

Nova 2 Sonicはツール呼び出しをサポートしており、外部データソースやAPIとの連携が可能です。

**promptStartでツール定義:**
```json
{
  "event": {
    "promptStart": {
      "promptName": "<UUID>",
      "toolConfiguration": {
        "tools": [
          {
            "toolSpec": {
              "name": "get_weather",
              "description": "指定された都市の天気情報を取得",
              "inputSchema": {
                "json": "{\"type\":\"object\",\"properties\":{\"city\":{\"type\":\"string\"}}}"
              }
            }
          }
        ]
      }
    }
  }
}
```

**ツール結果の返却:**
```json
{
  "event": {
    "contentStart": {
      "promptName": "<UUID>",
      "contentName": "<UUID>",
      "interactive": false,
      "type": "TOOL",
      "role": "TOOL",
      "toolResultInputConfiguration": {
        "toolUseId": "<tool_use_id>",
        "type": "TEXT",
        "textInputConfiguration": { "mediaType": "text/plain" }
      }
    }
  }
}
```

---

## 7. SDK対応状況

### 双方向ストリーミングAPI対応SDK

| SDK | 対応状況 |
|-----|----------|
| AWS SDK for JavaScript | ✅ 対応 |
| AWS SDK for Python（実験的SDK） | ✅ 対応（`aws-sdk-bedrock-runtime`パッケージ） |
| AWS SDK for Java | ✅ 対応 |
| AWS SDK for .NET | ✅ 対応 |
| AWS SDK for C++ | ✅ 対応 |
| AWS SDK for Kotlin | ✅ 対応 |
| AWS SDK for Ruby | ✅ 対応 |
| AWS SDK for Rust | ✅ 対応 |
| AWS SDK for Swift | ✅ 対応 |

### Python実装の注意

Python開発者向けには、双方向ストリーミングを簡単に利用するための実験的SDKが提供されています:
- パッケージ: `aws-sdk-bedrock-runtime`
- 標準の`boto3`ではなく、専用のSDKを使用する必要があります

### JavaScript/TypeScript実装

AWS SDK for JavaScript v3の`@aws-sdk/client-bedrock-runtime`パッケージで`InvokeModelWithBidirectionalStreamCommand`が利用可能です。WebSocketベースのNode.jsサーバーを中継として使用するアーキテクチャが一般的です（[AWS Samples参照](https://aws-samples.github.io/sample-ai-possibilities/demos/health-voice-ai-agent-websocket-nodejs)）。

---

## 8. 料金

Nova 2 Sonicの料金はトークンベースで、音声トークンとテキストトークンに分かれています。

- **音声トークン**: 音声入出力に対して課金
- **テキストトークン**: システムプロンプト、ツール呼び出し、会話履歴、Knowledge Base連携等に対して課金

具体的な料金は[Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)の「Pricing for Speech Understanding and Generation Models」セクションを参照してください。

---

## 9. Strands Agents / Bedrock AgentCore 統合

### 9.1 Strands Agents での Nova 2 Sonic 利用

[Strands Agents SDK](https://github.com/strands-agents/sdk-python)は、AWS公式のオープンソースAIエージェントフレームワークです。Nova 2 Sonicとの統合は `strands.experimental.bidi` モジュールで提供されており、現在experimentalステータスです。

#### BidiAgent クラス

`BidiAgent`は双方向ストリーミング対応のエージェントクラスで、Nova Sonicの音声会話機能をわずか約20行のコードで構築できます。

**インストール:**
```bash
pip install strands-agents strands-agents-tools
```

**基本実装例:**
```python
import asyncio
from strands.experimental.bidi.agent import BidiAgent
from strands.experimental.bidi.models.nova_sonic import BidiNovaSonicModel
from strands.experimental.bidi.audio.audio_io import BidiAudioIO

async def main():
    # Nova Sonic モデルの初期化
    model = BidiNovaSonicModel(
        region="ap-northeast-1",
        model_id="amazon.nova-2-sonic-v1:0"
    )
    
    # 音声I/Oの初期化（マイク入力 + スピーカー出力）
    audio_io = BidiAudioIO()
    
    # BidiAgent の構築
    agent = BidiAgent(
        model=model,
        audio_io=audio_io,
        system_prompt="あなたは営業トレーニング用のAIアシスタントです。日本語で応答してください。",
        tools=[]  # ツール定義を追加可能
    )
    
    # 会話セッション開始
    await agent.run()

asyncio.run(main())
```

#### テキスト入出力モード（BidiTextIO）

音声デバイスを使わずテキストベースで対話する場合は `BidiTextIO` を使用できます。テスト・デバッグ時に有用です。

```python
from strands.experimental.bidi.audio.text_io import BidiTextIO

text_io = BidiTextIO()
agent = BidiAgent(
    model=model,
    audio_io=text_io,
    system_prompt="..."
)
```

#### マルチモデル対応

Strands BidiAgentは同じコード構造で以下のモデルにも対応しており、モデル切り替えが容易です:
- Amazon Nova Sonic（`BidiNovaSonicModel`）
- OpenAI Realtime API
- Google Gemini Live

#### ツール統合

BidiAgentはStrands Agentsの標準ツール機構をサポートしており、`@tool`デコレータで定義したツールをNova Sonicのfunction calling経由で呼び出せます。

```python
from strands import tool

@tool
def get_scenario_info(scenario_id: str) -> dict:
    """シナリオ情報を取得する"""
    # DynamoDB等からシナリオ情報を取得
    return {"name": "クレーム対応", "difficulty": "中級"}

agent = BidiAgent(
    model=model,
    audio_io=audio_io,
    system_prompt="...",
    tools=[get_scenario_info]
)
```

### 9.2 Bedrock AgentCore Runtime での利用

[Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock/latest/userguide/agentcore.html) Runtimeは、エージェントをマネージドインフラストラクチャ上にデプロイするためのサービスです。Nova 2 Sonicの双方向ストリーミングをネイティブにサポートしています。

#### 主要機能

- **WebSocket双方向ストリーミング**: ポート8080の`/ws`パスでWebSocketエンドポイントを公開
- **コンテナデプロイ**: ECS/EKSベースのマネージドコンテナ実行環境
- **SigV4認証**: AWS署名バージョン4による安全な接続
- **自動スケーリング**: トラフィックに応じた自動スケール
- **セッション管理**: ステートフルなセッション維持

#### デプロイアーキテクチャ

AgentCore Runtimeにデプロイする場合、エージェントはコンテナイメージとしてパッケージングし、以下の要件を満たす必要があります:

1. ポート8080でHTTP/WebSocketリクエストを受け付ける
2. `/ws`パスでWebSocket接続を処理する
3. ヘルスチェックエンドポイントを提供する
4. SigV4認証ヘッダーを検証する

### 9.3 マルチエージェントアーキテクチャパターン

AWS公式ブログ「[Building a multi-agent voice assistant with Amazon Nova Sonic and Amazon Bedrock AgentCore](https://aws.amazon.com/blogs/machine-learning/building-a-multi-agent-voice-assistant-with-amazon-nova-sonic-and-amazon-bedrock-agentcore/)」で推奨されているアーキテクチャパターンです。

#### 構成

```
ユーザー（音声）
    ↕
Nova 2 Sonic（オーケストレーター）
    │  - 音声インターフェース（STT/TTS）
    │  - 意図分類・対話管理
    │  - tool use によるサブエージェント呼び出し
    ↕
AgentCore Runtime 上のサブエージェント群
    ├── スコアリングエージェント（Strands Agent）
    ├── フィードバック分析エージェント（Strands Agent）
    └── シナリオ管理エージェント（Strands Agent）
```

#### 動作フロー

1. **Nova 2 Sonic**がオーケストレーターとして音声入出力を担当
2. ユーザーの発話内容に基づき、Nova Sonicが**tool use**でサブエージェントを呼び出し
3. サブエージェントはStrands Agentsで構築し、AgentCore Runtimeにデプロイ
4. サブエージェントの処理結果をNova Sonicが受け取り、音声で応答

#### メリット

- **関心の分離**: 音声処理とビジネスロジックを明確に分離
- **独立スケーリング**: 各サブエージェントを個別にスケール可能
- **再利用性**: サブエージェントは音声以外のインターフェースからも呼び出し可能
- **段階的移行**: 既存のLambda関数をサブエージェントとして段階的に移行可能

### 9.4 本プロジェクトへの適用考察

現在のAI営業ロールプレイシステムにStrands Agents / AgentCoreを適用する場合、以下のアーキテクチャが考えられます:

#### 想定アーキテクチャ

| 役割 | 現行 | Nova Sonic + AgentCore |
|------|------|------------------------|
| 音声認識 | Transcribe Streaming | Nova 2 Sonic（内蔵） |
| 対話生成 | Claude 4.5 Haiku | Nova 2 Sonic（内蔵） |
| 音声合成 | Polly（SSML） | Nova 2 Sonic（内蔵） |
| リアルタイム評価 | Lambda（Bedrock呼び出し） | サブエージェント（AgentCore） |
| フィードバック分析 | Lambda（Bedrock呼び出し） | サブエージェント（AgentCore） |
| 動画分析 | Lambda（Nova Premiere） | 変更なし |
| コンプライアンス | Guardrails | サブエージェント経由で統合 |

#### 段階的導入案

1. **Phase 1**: Strands BidiAgentでNova Sonic音声対話のPoC実施（日本語精度検証）
2. **Phase 2**: スコアリング・フィードバック機能をStrands Agentとして実装し、AgentCoreにデプロイ
3. **Phase 3**: Nova Sonicオーケストレーター + AgentCoreサブエージェント構成への移行

#### 注意事項

- Strands BidiAgentは**experimentalステータス**のため、本番利用には慎重な検証が必要
- AgentCore Runtimeは**コンテナベース**のため、現行のLambdaアーキテクチャからの移行コストが発生
- 日本語サポートが公式に追加されるまでは、PoCレベルでの検証に留めることを推奨

### 9.5 参考リンク（Strands / AgentCore）

- [Strands Agents SDK（GitHub）](https://github.com/strands-agents/sdk-python)
- [Strands BidiAgent ドキュメント](https://strandsagents.com/latest/user-guide/concepts/model-providers/bidi-model-providers/nova-sonic/)
- [Building a multi-agent voice assistant with Nova Sonic and AgentCore（AWS Blog）](https://aws.amazon.com/blogs/machine-learning/building-a-multi-agent-voice-assistant-with-amazon-nova-sonic-and-amazon-bedrock-agentcore/)
- [Nova 2 Sonic Integrations](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-integrations.html)
- [Amazon Bedrock AgentCore ドキュメント](https://docs.aws.amazon.com/bedrock/latest/userguide/agentcore.html)

---

## 10. 本プロジェクトへの適用に関する考察

### 現在のアーキテクチャとの比較

現在のシステムは以下のパイプラインで音声対話を実現しています:
1. **音声認識**: Amazon Transcribe Streaming（WebSocket）
2. **対話生成**: Amazon Bedrock（Claude 4.5 Haiku）
3. **音声合成**: Amazon Polly（SSML対応）

Nova 2 Sonicを導入すると、これら3つのサービスを1つのモデルに統合できる可能性があります。

### メリット

- **レイテンシー削減**: 3サービス間の通信オーバーヘッドが不要
- **自然な対話**: バージイン（割り込み）のネイティブサポート
- **コンテキスト保持**: 音声のプロソディ（韻律）を理解した応答生成
- **アーキテクチャ簡素化**: 単一APIで音声入出力を処理

### 課題・リスク

- **日本語非対応**: 最大の課題。音声認識精度・音声合成品質ともに保証されない
- **日本語音声なし**: voiceIdに日本語ネイティブ音声がないため、不自然な発音になる可能性
- **評価機能との統合**: 現在のリアルタイムスコアリング（怒りメーター、信頼度等）をNova 2 Sonicのツール呼び出しで実現する必要がある
- **Guardrails統合**: 現在のBedrock Guardrailsとの統合方法が異なる可能性
- **接続制限**: 8分のセッション制限があり、長時間のロールプレイセッションでは接続更新が必要

### 推奨アプローチ

日本語が正式サポートされるまでは、以下の段階的アプローチを推奨します:

1. **短期（現時点）**: 現行アーキテクチャ（Transcribe + Claude + Polly）を維持
2. **検証フェーズ**: Nova 2 Sonicで日本語音声入力の認識精度と応答品質をPoC検証
3. **日本語サポート後**: Nova 2 Sonicへの移行を本格検討

---

## 11. 参考リンク

- [Nova 2 Sonic Getting Started](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-getting-started.html)
- [Bidirectional Streaming API](https://docs.aws.amazon.com/nova/latest/userguide/speech-bidirection.html)
- [Input Events](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-input-events.html)
- [Output Events](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-output-events.html)
- [Cross-modal Input](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-cross-modal.html)
- [Handling Errors / Conversation Resumption](https://docs.aws.amazon.com/nova/latest/userguide/speech-errors.html)
- [Session Continuation Sample (Python)](https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech/amazon-nova-2-sonic/repeatable-patterns/session-continuation/console-python)
- [Conversation Resumption Sample (NodeJS)](https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech/amazon-nova-2-sonic/repeatable-patterns/resume-conversation)
- [Language Support](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html)
- [AWS AI Service Card - Nova 2 Sonic](https://docs.aws.amazon.com/ai/responsible-ai/nova-2-sonic/overview.html)
- [Nova Sonic GitHub Samples](https://github.com/aws-samples/)
- [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Strands Agents SDK（GitHub）](https://github.com/strands-agents/sdk-python)
- [Strands BidiAgent ドキュメント](https://strandsagents.com/latest/user-guide/concepts/model-providers/bidi-model-providers/nova-sonic/)
- [Building a multi-agent voice assistant with Nova Sonic and AgentCore（AWS Blog）](https://aws.amazon.com/blogs/machine-learning/building-a-multi-agent-voice-assistant-with-amazon-nova-sonic-and-amazon-bedrock-agentcore/)
- [Nova 2 Sonic Integrations](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-integrations.html)
- [Amazon Bedrock AgentCore ドキュメント](https://docs.aws.amazon.com/bedrock/latest/userguide/agentcore.html)

Content was rephrased for compliance with licensing restrictions. Sources are linked inline.
