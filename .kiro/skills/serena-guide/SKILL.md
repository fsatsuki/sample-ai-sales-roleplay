---
name: serena-guide
description: >
  Serena MCPサーバーを効果的に使用してコードベースをシンボルレベルで分析、検索、編集、管理するためのガイド。
  ユーザーがコード構造について質問したり、特定の関数、クラス、メソッドを検索・変更したい場合、
  コードをリファクタリングしたり、外科的編集を実行したり、コードの依存関係を分析したい場合に使用します。
  また、「認証ロジックを見つけて更新」「このクラスをリファクタリング」「このクラスにメソッドを追加」
  「この関数への参照を全て検索」といったタスクや、コード編集、検索、構造変更タスクでトリガーします。
  このスキルは、シンボルレベルの精度が重要な大規模コードベースで特に価値があります。
  TypeScript、Python、Java、その他30以上のサポート言語で精密なIDEライクなコード操作が必要な場合は、
  このスキルを必ず使用してください。
---

# Serena MCP ガイド

このスキルは、Serena MCPサーバーを使用してコードベースをシンボルレベルの精度で分析、検索、編集するための効果的なガイドです。

## Serenaとは？

SerenaはLLMにIDEライクな機能を提供するコーディングエージェントツールキットです。コードを単なるテキストとして扱うのではなく、Language Server Protocol（LSP）またはJetBrainsプラグインを通じてコード構造を理解し、精密でシンボルを認識した操作を可能にします。

**主な利点:**

- **シンボルレベルの精度**: 行番号ではなく、名前で関数、クラス、メソッドを操作
- **セマンティック検索**: 名前ではなく、何をするかでコードを検索
- **安全な編集**: シンボルに対してコードを挿入し、構文エラーのリスクを軽減
- **言語理解**: 30以上のプログラミング言語でLSPを活用

## 前提条件

**最初に実行必須**: ほとんどのSerenaツールを使用する前に、プロジェクトをアクティブ化する必要があります。

```
activate_project(project_name="your-project-name")
```

ユーザーがプロジェクト名を知らない場合は:

- `get_current_config()`を使用して利用可能なプロジェクトを確認
- プロジェクト名は通常、`.serena/project.yml`のディレクトリ名と一致します

プロジェクトをアクティブ化せずにコード関連ツールを呼び出すと、エラーが発生したり、不完全な結果になる可能性があります。

## 利用可能なツール

### 1. プロジェクト管理

**`activate_project`**

- 目的: プロジェクトをセッションにロードし、他のツールからアクセス可能にする
- 使用タイミング: コードを扱う前に必ず最初に実行
- パラメータ:
  - `project_name`: プロジェクト名（Serenaで設定されたもの）

**`get_current_config`**

- 目的: 利用可能なプロジェクト、アクティブなモード、ツール設定を含む現在のSerena設定を表示
- 使用タイミング: どのプロジェクトが利用可能かを確認したり、設定の問題をトラブルシューティングする場合

**`check_onboarding_performed`**

- 目的: プロジェクトのオンボーディング（初期構造分析）が完了しているかチェック
- 使用タイミング: 新しいプロジェクトで作業を開始する場合、または分析の問題をトラブルシューティングする場合

**`onboarding`**

- 目的: 初期プロジェクト分析を実行し、構造と重要なタスクを識別
- 使用タイミング: プロジェクトで初めて作業する場合、または大きな構造変更後

**`remove_project`**

- 目的: Serenaの設定からプロジェクトを削除
- 使用タイミング: クリーンアップ時、または不要になったプロジェクトを削除する場合

### 2. シンボル検索と発見

**`find_symbol`** (完全一致)

- 目的: 正確な名前でシンボル（関数、クラス、メソッド、変数）を検索
- 使用タイミング: 探しているものの正確な名前を知っている場合
- パラメータ:
  - `name`: 正確なシンボル名（大文字小文字を区別、例: "UserService.authenticate"）
  - `raw_output`: 機械可読形式の場合はTrueに設定
- 戻り値: シンボルの定義、場所、メタデータ

**`search_for_pattern`** (ワイルドカード検索)

- 目的: ワイルドカードまたは正規表現を使用してファイルやコードパターンを検索
- 使用タイミング: 名前の一部を知っている場合、または複数の関連項目を検索する必要がある場合
- パラメータ:
  - `pattern`: 検索パターン（`*authenticate*`のようなワイルドカードをサポート）
  - その他の検索オプション
- 戻り値: マッチしたファイルまたはコードスニペット

**`get_symbols_overview`**

- 目的: ファイル内で定義されているトップレベルシンボルの概要を取得
- 使用タイミング: ファイル全体を読まずに構造を理解する場合
- パラメータ:
  - `file_path`: ファイルへのパス
  - `raw_output`: 機械可読形式の場合はTrueに設定
- 戻り値: クラス、関数、トップレベル定義のリスト

**`find_referencing_symbols`**

- 目的: 指定されたシンボルを参照している全てのシンボルを検索（誰がこれを呼んでいる？）
- 使用タイミング: 影響分析、依存関係の理解、またはリファクタリング時
- パラメータ:
  - `symbol_location`: 対象シンボルの場所
  - `symbol_type`: シンボルタイプでフィルタ（function、class、method、variable）
- 戻り値: 対象を参照しているシンボルのリスト

**`find_referencing_code_snippets`**

- 目的: シンボルが参照されている実際のコードスニペットを検索
- 使用タイミング: 誰が呼んでいるかだけでなく、使用コンテキストも確認したい場合
- パラメータ:
  - `symbol_location`: 対象シンボルの場所
- 戻り値: シンボルの使用方法を示すコードスニペット

### 3. ファイル操作

**`read_file`**

- 目的: ファイルの内容を読み取る
- 使用タイミング: 編集前にコードを確認する場合、またはコンテキストを理解する場合
- パラメータ:
  - `file_path`: ファイルへのパス（プロジェクトルートからの相対パス）
  - `start_line`: オプションの開始行番号
  - `end_line`: オプションの終了行番号
- 戻り値: ファイルの内容（全体または部分）

**`create_text_file`**

- 目的: 新しいファイルを作成、または既存ファイルを上書き
- 使用タイミング: 新しいソースファイル、設定ファイル、テストを作成する場合
- パラメータ:
  - `file_path`: ファイルを作成するパス
  - `content`: ファイルの完全な内容
- 注意: 既存ファイルは上書きされるため注意が必要

**`list_dir`**

- 目的: 指定されたディレクトリ内のファイルとディレクトリを一覧表示
- 使用タイミング: プロジェクト構造を探索する場合、またはファイルを見つける場合
- パラメータ:
  - `directory_path`: 一覧表示するパス（プロジェクトルートからの相対パス）
  - `recursive`: サブディレクトリを再帰的に一覧表示するか
- 戻り値: ファイルとディレクトリのリスト

### 4. コード編集（シンボル認識）

Serenaの編集ツールはシンボルレベルで動作し、行ベースの編集よりも信頼性が高くなります。

**`replace_symbol_body`**

- 目的: 関数、メソッド、クラスの実装全体を置換
- 使用タイミング: リファクタリング、完全な書き直し、またはシンボルへの大きな変更時
- パラメータ:
  - `symbol_name`: 置換するシンボルの名前
  - `new_body`: 新しい実装
- 利点: 行番号を知る必要がない。Serenaが自動的にシンボルを見つける

**`insert_after_symbol`**

- 目的: シンボルの定義直後に新しいコードを挿入
- 使用タイミング: クラスに新しいメソッドを追加する場合、または既存の関数の後に新しい関数を追加する場合
- パラメータ:
  - `symbol_name`: その後に挿入するシンボルの名前
  - `content`: 挿入するコード
- 例: 行を数えずにクラスに新しいメソッドを追加

**`insert_before_symbol`**

- 目的: シンボルの定義直前に新しいコードを挿入
- 使用タイミング: インポート、デコレータ、または前置定義を追加する場合
- パラメータ:
  - `symbol_name`: その前に挿入するシンボルの名前
  - `content`: 挿入するコード

**`insert_at_line`**

- 目的: 特定の行番号にコンテンツを挿入
- 使用タイミング: シンボルベースの挿入が適切でない場合（例: 関数の途中）
- パラメータ:
  - `file_path`: 対象ファイル
  - `line_number`: コンテンツを挿入する行
  - `content`: 挿入するコンテンツ

**`replace_lines`**

- 目的: 行の範囲を新しいコンテンツで置換
- 使用タイミング: シンボル境界に合わない編集の場合
- パラメータ:
  - `file_path`: 対象ファイル
  - `start_line`: 置換する最初の行
  - `end_line`: 置換する最後の行
  - `new_content`: 置換コンテンツ

**`delete_lines`**

- 目的: ファイルから行の範囲を削除
- 使用タイミング: コードセクションを削除する場合、未使用コードをクリーンアップする場合
- パラメータ:
  - `file_path`: 対象ファイル
  - `start_line`: 削除する最初の行
  - `end_line`: 削除する最後の行

### 5. メモリ管理

Serenaは、セッション間で情報を永続化するためのプロジェクト固有のメモリストアを維持します。

**`write_memory`**

- 目的: 将来の参照のためにSerenaのメモリに情報を保存
- 使用タイミング: 決定事項、パターン、プロジェクト規約、または後で必要になるものを記録する場合
- パラメータ:
  - `name`: メモリエントリ名（キーとして使用）
  - `content`: 保存する情報
- 例: コーディング規約、アーキテクチャの決定、頻繁に使用するシンボル

**`read_memory`**

- 目的: 以前に保存されたメモリエントリを取得
- 使用タイミング: 以前のセッションからの情報を思い出す場合
- パラメータ:
  - `name`: 取得するメモリエントリの名前

**`list_memories`**

- 目的: 現在のプロジェクトで利用可能な全てのメモリエントリを一覧表示
- 使用タイミング: 何が記憶されているかを確認する場合、または忘れたメモリ名を見つける場合

**`delete_memory`**

- 目的: メモリエントリを削除
- 使用タイミング: 古い情報や不正確な情報をクリーンアップする場合

### 6. ユーティリティとモード

**`switch_modes`**

- 目的: Serenaの動作を変更する特定の操作モードをアクティブ化
- 使用タイミング: 特別な機能や制約を有効にする場合（例: 読み取り専用モード）
- パラメータ:
  - `mode_names`: アクティブ化するモード名のリスト
- 一般的なモード: `interactive`、`editing`、`read_only`

**`execute_shell_command`**

- 目的: プロジェクトディレクトリでシェルコマンドを実行
- 使用タイミング: ビルド、テスト、スクリプト実行、その他のコマンドライン操作時
- パラメータ:
  - `command`: 実行するシェルコマンド
- 注意して使用: セキュリティへの影響を考慮

**`restart_language_server`**

- 目的: プロジェクトのLSP言語サーバーを再起動
- 使用タイミング: LSPが応答しない場合、またはコードベースへの外部変更後
- 注意: 数秒かかる可能性があり、一時的にコード分析が中断される

**`initial_instructions`**

- 目的: 現在のプロジェクトの初期セットアップ指示を取得
- 使用タイミング: システムプロンプトを設定できない環境（例: Claude Desktop）

**`prepare_for_new_conversation`**

- 目的: 適切なコンテキストで新しい会話で作業を続けるための指示を取得
- 使用タイミング: 新しいセッションを開始し、コンテキストを復元する必要がある場合

**`summarize_changes`**

- 目的: コードベースの変更を要約するための指示を取得
- 使用タイミング: コードレビュー、コミットメッセージ、変更ログ作成時

### 7. シンキングツール

Serenaは、エージェントが作業を振り返るのに役立つメタ認知ツールを提供します。

**`think_about_collected_information`**

- 目的: 十分な情報を収集したかどうかを振り返る
- 使用タイミング: 重要な決定や編集を行う前

**`think_about_task_adherence`**

- 目的: ユーザーの元のタスクに沿っているかをチェック
- 使用タイミング: ドリフトを避けるために、複雑な複数ステップの操作中

**`think_about_whether_you_are_done`**

- 目的: タスクが本当に完了したかを評価
- 使用タイミング: ユーザーに完了を報告する前

## ツール選択ガイドライン

### コードの検索

1. **正確な名前を知っている** → `find_symbol`を使用
   - 例: "UserService.authenticateを探して"
   - 高速で正確

2. **名前の一部を知っている** → `search_for_pattern`を使用
   - 例: "名前に'auth'を含む全ての関数を探して"
   - ワイルドカードをサポート

3. **ファイル構造を理解したい** → `get_symbols_overview`を使用
   - 例: "auth.tsで何が定義されているか見せて"
   - 高レベルの理解に適している

4. **このコードを使用している人を確認する必要がある** → `find_referencing_symbols`または`find_referencing_code_snippets`を使用
   - 影響分析やリファクタリング用
   - 構造の場合はsymbolsを、コンテキストの場合はsnippetsを選択

### コードの編集

1. **関数/メソッド全体を置換** → `replace_symbol_body`を使用
   - 完全な書き直しに最も信頼性が高い
   - 行番号管理が不要

2. **クラスに追加** → `insert_after_symbol`または`insert_before_symbol`を使用
   - 行を数えずにメソッドを追加
   - 適切な位置を維持

3. **細かい編集** → `replace_lines`または`insert_at_line`を使用
   - シンボル境界に合わない変更用
   - 行番号を知るためにファイルを読む必要がある

4. **新しいファイルの作成** → `create_text_file`を使用
   - 新しいソースファイル、テスト、設定用

### 情報の管理

1. **何かを記憶する必要がある** → `write_memory`を使用
   - プロジェクト規約、アーキテクチャの決定、一般的なパターン

2. **以前の情報を思い出す** → `read_memory`または`list_memories`を使用
   - 新しいメモリを書く前に何が記憶されているかをチェック

## 典型的なワークフロー

### ワークフロー1: 特定の関数を検索して更新

```
1. activate_project(project_name="myproject")
2. find_symbol(name="AuthService.login")           # シンボルを特定
3. read_file(file_path="src/auth/service.ts",      # コンテキストを理解するために読む
             start_line=45, end_line=70)
4. replace_symbol_body(                            # 実装を更新
     symbol_name="AuthService.login",
     new_body="async login(credentials) { ... }")
```

### ワークフロー2: 既存のクラスに新しいメソッドを追加

```
1. activate_project(project_name="myproject")
2. find_symbol(name="UserController")              # クラスを検索
3. get_symbols_overview(                           # 既存のメソッドを確認
     file_path="src/controllers/user.ts")
4. insert_after_symbol(                            # 新しいメソッドを追加
     symbol_name="UserController.create",
     content="async update(id, data) { ... }")
```

### ワークフロー3: リファクタリング前の影響分析

```
1. activate_project(project_name="myproject")
2. find_symbol(name="calculateDiscount")           # 対象を検索
3. find_referencing_symbols(                       # 誰がこれを呼んでいる？
     symbol_location="src/pricing.ts:45:3")
4. find_referencing_code_snippets(                 # どのように使われている？
     symbol_location="src/pricing.ts:45:3")
5. write_memory(                                   # 発見を保存
     name="discount-refactoring-impact",
     content="Called by: OrderService, CartService...")
6. replace_symbol_body(...)                        # リファクタリングを進める
```

### ワークフロー4: 新しいコードベースを探索して理解

```
1. activate_project(project_name="myproject")
2. get_current_config()                            # プロジェクトのセットアップを確認
3. list_dir(directory_path="src", recursive=true)  # 構造を探索
4. get_symbols_overview(file_path="src/index.ts")  # エントリポイントを理解
5. find_symbol(name="main")                        # main関数を検索
6. write_memory(                                   # 学習内容を記録
     name="project-structure",
     content="Entry: src/index.ts, Main: main()...")
```

### ワークフロー5: 複数ファイルにわたるバグ修正

```
1. activate_project(project_name="myproject")
2. search_for_pattern(pattern="*deprecated_api*")  # 全ての使用箇所を検索
3. read_memory(name="migration-guide")             # 以前に見たかチェック
4. 各ファイルに対して:
   a. read_file(file_path=...)                     # コンテキストを理解
   b. replace_lines(...)                           # 修正を行う
5. write_memory(                                   # 移行を記録
     name="api-migration-completed",
     content="Migrated deprecated_api to new_api in 5 files")
```

## よくある間違いと落とし穴

### ❌ 最初にプロジェクトをアクティブ化しない

**間違い:**

```
find_symbol(name="SomeFunction")  # エラー: プロジェクトがロードされていない
```

**正しい:**

```
activate_project(project_name="myproject")
find_symbol(name="SomeFunction")
```

### ❌ シンボルを使えるのに行番号を使用

**非効率で脆弱:**

```
read_file(file_path="service.ts")        # ファイル全体を読む
replace_lines(file_path="service.ts",    # 行番号が正しいことを期待
              start_line=45, end_line=60, ...)
```

**より良い方法:**

```
replace_symbol_body(symbol_name="MyService.myMethod", ...)
```

### ❌ リファクタリング前に参照をチェックしない

**リスクがある:**

```
replace_symbol_body(symbol_name="calculatePrice", ...)  # 何も壊れないことを期待
```

**より安全:**

```
find_referencing_symbols(symbol_location=...)  # 誰がこれを呼んでいるかを確認
find_referencing_code_snippets(...)            # 使用方法を理解
# 次に影響を理解して変更を進める
```

### ❌ 複雑な編集前に読まない

**バグを導入する可能性:**

```
insert_after_symbol(symbol_name="MyClass.foo",  # コンテキストを知らない
                   content="bar() { ... }")
```

**より良い方法:**

```
get_symbols_overview(file_path="myclass.ts")  # 構造を理解
read_file(file_path="myclass.ts")             # 完全なコンテキストを確認
insert_after_symbol(...)                      # 情報に基づいた編集
```

### ❌ 読まずにファイルを上書き

**危険:**

```
create_text_file(file_path="config.ts", content=...)  # データを失う可能性
```

**より安全:**

```
read_file(file_path="config.ts")              # ファイルが存在するかチェック
# 編集するか上書きするかを決定
create_text_file(...)  # または replace_lines(...) または replace_symbol_body(...)
```

## ベストプラクティス

1. **常に最初にプロジェクトをアクティブ化**: `activate_project`がエントリポイント

2. **シンボルベースの操作を優先**: 行ベースの編集よりも信頼性が高い
   - 可能な限り`replace_lines`より`replace_symbol_body`を使用
   - 可能な限り`insert_at_line`より`insert_after_symbol`を使用

3. **変更前に確認**:
   - 影響を評価するために`find_referencing_symbols`を使用
   - コンテキストを理解するために`read_file`を使用
   - 構造を理解するために`get_symbols_overview`を使用

4. **永続化のためにメモリを使用**:
   - アーキテクチャの決定、規約、パターンを保存
   - 実行前に複雑なリファクタリング計画を記録
   - 頻繁に使用するシンボル名やファイルパスを保存

5. **行動前に考える**:
   - 複雑なタスクにはシンキングツール（`think_about_*`）を使用
   - 十分な情報があるかを振り返る
   - ユーザーの目標に沿っているかをチェック

6. **セマンティック検索を活用**:
   - 探索作業にはワイルドカードを使った`search_for_pattern`を使用
   - 包括的な理解のためにシンボル検索と参照検索を組み合わせる

7. **エラーを優雅に処理**:
   - シンボルが見つからない場合は、`search_for_pattern`で類似の名前を探す
   - LSPが応答しない場合は、`restart_language_server`を試す
   - プロジェクトのセットアップが不明な場合は、`get_current_config`を確認

## トラブルシューティング

### "Symbol not found"エラー

→ シンボル名が正確でない可能性があります。ワイルドカードを使って`search_for_pattern`を試してください。

### "Project not activated"エラー

→ `activate_project`を実行していません。常にこれから始めてください。

### 編集がコード構造を反映しない

→ 言語サーバーが分析に時間を必要とする可能性があります。少し待つか、`restart_language_server`を使用してください。

### 参照が見つからない

→ プロジェクトが分析されていることを確認してください。必要に応じて`check_onboarding_performed`と`onboarding`を実行してください。

### 検索結果が多すぎる

→ より具体的なパターンを使用するか、ファイルパスフィルタリングと組み合わせてください。

## 言語サポート

SerenaはLSPを通じて30以上のプログラミング言語をサポートしています:

- TypeScript/JavaScript
- Python
- Java, Kotlin
- C/C++, C#
- Go, Rust
- Ruby, PHP
- その他多数

このガイドのツール選択とワークフローは、サポートされている全ての言語に適用されます。

## まとめ

Serenaは強力なシンボル認識コード編集ツールキットです。効果的に使用するには:

1. 常に`activate_project`から始める
2. 信頼性のためにシンボルベースの操作を優先
3. 変更前に参照を確認
4. 重要な情報を永続化するためにメモリを使用
5. 探索にセマンティック検索を活用
6. タスクについてメタ認知的に考える

これらのガイドラインに従うことで、大規模なコードを効率的に扱い、自信を持って正確な編集を行うことができます。
