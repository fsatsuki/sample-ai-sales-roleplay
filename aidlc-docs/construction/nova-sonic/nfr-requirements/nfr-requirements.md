# NFR要件定義書: Nova 2 Sonic移行

## 1. パフォーマンス要件

### 1.1 レスポンスタイム
| 項目 | 要件 | 備考 |
|-----|------|------|
| 音声認識（ASR） | ユーザー発話終了から転写テキスト表示まで1秒以内 | Nova 2 Sonic内蔵ASR |
| NPC応答生成 | ユーザー発話終了からNPC応答テキスト取得まで3秒以内 | Nova 2 Sonic対話生成 |
| 音声合成（Polly） | NPC応答テキスト取得から音声再生開始まで1秒以内 | 現行維持 |
| Session Continuation切り替え | ユーザーが知覚できない即時ハンドオフ | オーバーヘッド2%以下 |

### 1.2 コールドスタート
- **許容度**: 特に制限なし（既存AgentCore移行NFR踏襲）
- **Provisioned Concurrency**: 不要
- **理由**: コスト最適化優先、小規模利用想定

### 1.3 スループット
- **同時セッション数**: 10未満（小規模、既存NFR踏襲）
- **ピーク時想定**: 通常の2倍程度
- **注意**: Nova 2 Sonicセッションは長時間WebSocket接続を維持するため、同時接続数に注意

---

## 2. スケーラビリティ要件

### 2.1 スケーリング戦略
| 項目 | 設定 |
|-----|------|
| スケーリング方式 | AgentCore Runtime自動スケーリング（既存NFR踏襲） |
| 最小インスタンス | 0（コスト最適化） |
| 最大インスタンス | AgentCore Runtimeデフォルト |

### 2.2 負荷対応
- **通常負荷**: 同時10セッション未満
- **ピーク負荷**: AgentCore Runtimeの自動スケーリングに依存
- **スケールダウン**: アイドル時は0にスケールダウン
- **Nova 2 Sonic固有**: 1セッション = 1 WebSocket接続（最大8分 + Session Continuation）

---

## 3. 可用性要件

### 3.1 可用性目標
| 項目 | 目標 |
|-----|------|
| 可用性SLA | AgentCore Runtime SLAに依存（既存NFR踏襲） |
| 計画停止 | CDKデプロイ時のみ |
| 障害復旧 | 自動（AgentCore Runtime管理） |

### 3.2 障害時動作・リカバリ戦略

#### 3.2.1 Session Continuation失敗時
- **リカバリ方式**: Conversation Resumption（自動リカバリ）
- **動作**: 会話履歴テキストを新セッションに再送信し、コンテキストを復元
- **ユーザー体験**: 一瞬の中断あり、会話コンテキストは維持
- **実装**: AgentCore Runtimeコンテナ内で自動実行

#### 3.2.2 ModelTimeoutException発生時
- **リカバリ方式**: Conversation Resumption（自動リカバリ）
- **動作**: 新しいNova 2 Sonicセッションを作成し、会話履歴を再送信
- **リトライ回数**: 最大1回（失敗時はエラー表示）

#### 3.2.3 WebSocket接続切断時
- **リカバリ方式**: フロントエンドでエラー表示
- **動作**: ユーザーにエラーメッセージを表示し、セッション再開を促す
- **通知**: CloudWatchアラーム（基本メトリクス）

---

## 4. セキュリティ要件

### 4.1 認証・認可
| 項目 | 実装 |
|-----|------|
| WebSocket認証 | SigV4認証（Cognito Identity Pool経由） |
| 一時認証情報 | Cognito Identity Poolで取得 |
| Identity Pool | 既存のAmplify設定で使用しているIdentity Poolを使用 |
| ユーザー識別 | Cognito JWT claims（sub, email） |

### 4.2 データ保護
| 項目 | 実装 |
|-----|------|
| 転送時暗号化 | TLS 1.2+（WebSocket over WSS） |
| 保存時暗号化 | AgentCore Memory暗号化（既存NFR踏襲） |
| セッション分離 | マイクロVM分離（AgentCore Runtime） |
| 音声データ | コンテナ内で処理、永続化しない |

### 4.3 アクセス制御
- **IAMロール**: 最小権限の原則（既存NFR踏襲）
- **Bedrock モデルアクセス**: `bedrock:InvokeModelWithBidirectionalStream` 権限
- **AgentCore Memory**: 既存のメモリアクセス権限を継続
- **監査ログ**: CloudTrail統合

---

## 5. 運用性要件

### 5.1 監視
| 項目 | 実装 |
|-----|------|
| メトリクス | 基本メトリクスのみ（既存NFR踏襲） |
| ダッシュボード | CloudWatch基本ダッシュボード |
| アラーム | エラー率閾値超過時 |
| Nova 2 Sonic固有監視 | 不要（既存AWS Budgets月次アラートで十分） |

### 5.2 ログ
| 項目 | 設定 |
|-----|------|
| ログ出力 | CloudWatch Logs |
| 保持期間 | 30日間（既存NFR踏襲） |
| ログレベル | INFO（本番）、DEBUG（開発） |
| Session Continuationログ | セッション切り替えイベントを記録 |

### 5.3 トレーシング
- **実装**: AgentCore Observability基本機能（既存NFR踏襲）
- **詳細トレーシング**: 不要（コスト最適化）
- **X-Ray統合**: 基本レベル

---

## 6. コスト要件

### 6.1 コスト最適化戦略
| 項目 | 方針 |
|-----|------|
| 優先度 | コスト最優先（既存NFR踏襲） |
| Provisioned Concurrency | 使用しない |
| アイドル時 | 0スケールダウン |
| トークン監視 | 既存AWS Budgets月次アラートのみ |

### 6.2 コスト監視
- **予算アラート**: AWS Budgets設定（既存踏襲）
- **コスト配分タグ**: 環境別（dev/staging/prod）
- **月次レビュー**: コストレポート確認
- **Nova 2 Sonic固有**: usageEventのトークン使用量はログに記録するが、専用監視は不要

### 6.3 コスト構造変化
| 項目 | 変化 |
|-----|------|
| 廃止 | Transcribe Streaming、Transcribe WebSocket API Gateway/Lambda/DynamoDB、Claude 4.5 Haiku NPC会話トークン |
| 追加 | Nova 2 Sonic音声トークン + テキストトークン |
| 変更 | AgentCore Runtime: NPC会話エージェント廃止 → nova-sonic BidiAgent（長時間稼働） |
| 維持 | Polly音声合成、リアルタイムスコアリング、AgentCore Memory |

---

## 7. Nova 2 Sonic固有要件

### 7.1 セッション管理
| 項目 | 設定 |
|-----|------|
| 最大セッション時間 | 8分（Nova 2 Sonic制限） |
| Session Continuation | 実装する（コンテナ内SessionTransitionManager） |
| 切り替え監視開始 | 6分経過時点 |
| 音声バッファ | 10秒分（16kHz PCM、約320KB） |
| 会話効率目標 | 98%以上（オーバーヘッド2%以下） |

### 7.2 ターン検出設定
| 項目 | 設定 |
|-----|------|
| endpointingSensitivity | MEDIUM（デフォルト） |
| 変更可能性 | フロントエンド設定画面で変更可能 |
| 適用タイミング | セッション開始時（sessionStartイベント） |
| セッション中変更 | 不可（次回Session Continuation切り替え時または新セッション開始時に適用） |

### 7.3 音声入出力設定
| 項目 | 設定 |
|-----|------|
| 入力形式 | PCM 16kHz モノラル、Base64エンコード |
| 出力形式 | audio/lpcm 24kHz（audioOutputConfiguration必須） |
| 音声出力の扱い | フロントエンドに転送し、Polly音声と切り替え可能にする |
| デフォルト音声 | Polly（SSML + Viseme） |
| Nova 2 Sonic音声 | 将来的な移行オプションとして保持 |

### 7.4 日本語対応
| 項目 | 設定 |
|-----|------|
| サポート状況 | 非公式（公式サポート対象外） |
| ASR精度 | 低下を許容 |
| フォールバック | なし（精度に関わらずNova 2 Sonic ASRを使用） |
| 対話生成 | システムプロンプトで日本語応答を指示 |
| 音声合成 | Polly継続（日本語ネイティブ音声使用） |

### 7.5 WebSocket接続設定
| 項目 | 設定 |
|-----|------|
| 接続タイムアウト | 120秒（既存AgentCore移行NFR踏襲） |
| プロトコル | WebSocket over WSS（ポート8080、/wsパス） |
| 認証 | SigV4（Cognito Identity Pool経由） |
| 再接続 | 自動再接続なし（エラー時はConversation Resumptionで対応） |

### 7.6 Cross-modal Input
| 項目 | 設定 |
|-----|------|
| テキスト入力 | 音声ストリーミング中にテキストメッセージ送信可能 |
| システムプロンプト | テキストで送信 |
| 会話履歴 | テキストで送信（interactive: false） |
| ユーザー入力 | 音声 + テキスト併用可能 |

---

## 8. AgentCore固有要件（既存NFRからの継続・変更）

### 8.1 AgentCore Memory
| 項目 | 設定 |
|-----|------|
| 活用範囲 | 既存NFR踏襲（全セッションデータの統合管理） |
| 保存データ | 会話履歴、メトリクス履歴、ゴール状態、セッションメタデータ |
| 保存期間 | 365日間（Short-Term Memory、既存NFR踏襲） |
| 変更点 | 会話履歴の保存元がClaude NPC → Nova 2 Sonic ASR転写 + NPC応答テキストに変更 |

### 8.2 AgentCore Identity
| 項目 | 設定 |
|-----|------|
| nova-sonic BidiAgent | SigV4認証（Cognito Identity Pool経由） |
| realtime-scoring | Cognito JWT（Inbound Auth、既存維持） |
| Step Functions内Lambda | IAMロール認証（既存維持） |

### 8.3 AgentCore Observability
| 項目 | 設定 |
|-----|------|
| メトリクス | 基本メトリクスのみ（既存NFR踏襲） |
| トレーシング | 基本レベル（既存NFR踏襲） |
| カスタムメトリクス | 不要 |

---

## 9. 制約事項

### 9.1 技術的制約
- CDKデプロイ必須（CLI/コンソール操作禁止）
- 既存Cognito User Pool + Identity Pool継続使用
- Strands Agents SDK継続使用（BidiAgentはexperimentalステータス）
- Nova 2 Sonicの日本語は非公式サポート
- audioOutputConfigurationは省略不可（音声出力は常に生成される）

### 9.2 運用制約
- Session Continuation失敗時のフォールバック: Conversation Resumption（自動）
- 日本語ASR精度のフォールバック: なし
- 旧Transcribe WebSocketインフラ: 即時削除
- 旧NPC会話AgentCore Runtime: 即時削除

---

**作成日**: 2026-03-11
**ベース**: AgentCore Runtime Migration NFR (2026-01-08)
**バージョン**: 1.0
