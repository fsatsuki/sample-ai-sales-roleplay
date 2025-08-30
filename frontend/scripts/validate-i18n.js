#!/usr/bin/env node

/**
 * i18n翻訳ファイルのバリデーションスクリプト
 * - JSONの構文チェック
 * - 言語間での欠落キーの検出
 * - ネストされた翻訳キーのチェック
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// カラーコード
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

// 翻訳ファイルのディレクトリ
const LOCALES_DIR = path.join(__dirname, "../src/i18n/locales");

// 出力メッセージをフォーマットする関数
function log(message, color = "") {
  console.log(`${color}${message}${RESET}`);
}

function error(message) {
  log(`❌ ${message}`, RED);
  return false;
}

function success(message) {
  log(`✅ ${message}`, GREEN);
  return true;
}

function warn(message) {
  log(`⚠️ ${message}`, YELLOW);
}

// 翻訳ファイルの一覧を取得
function getLocaleFiles() {
  try {
    return fs
      .readdirSync(LOCALES_DIR)
      .filter((file) => file.endsWith(".json"))
      .map((file) => ({
        name: file,
        path: path.join(LOCALES_DIR, file),
        lang: file.replace(".json", ""),
      }));
  } catch (err) {
    error(`翻訳ファイルディレクトリの読み込みに失敗しました: ${err.message}`);
    return [];
  }
}

// JSONの構文チェック
function validateJsonSyntax(filePath, fileName) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    JSON.parse(content);
    return success(`${fileName}の構文チェックに成功しました`);
  } catch (err) {
    return error(`${fileName}の構文エラー: ${err.message}`);
  }
}

// 言語間での欠落キーのチェック
function checkMissingKeys(files) {
  if (files.length < 2) {
    warn(
      "複数の言語ファイルがないため、言語間の欠落キーチェックをスキップします",
    );
    return true;
  }

  try {
    const translations = {};
    let baseKeys = null;
    let baseLang = null;

    // 各言語ファイルをロード
    files.forEach((file) => {
      const content = fs.readFileSync(file.path, "utf8");
      const data = JSON.parse(content);
      translations[file.lang] = data;

      // 最初の言語をベースとして使用
      if (baseKeys === null) {
        baseKeys = extractKeys(data);
        baseLang = file.lang;
      }
    });

    let hasError = false;

    // 各言語ファイルで欠落キーをチェック
    Object.keys(translations).forEach((lang) => {
      if (lang === baseLang) return;

      const langKeys = extractKeys(translations[lang]);
      const missingKeys = baseKeys.filter((key) => !langKeys.includes(key));
      const extraKeys = langKeys.filter((key) => !baseKeys.includes(key));

      if (missingKeys.length > 0) {
        error(
          `${lang}.jsonには${baseLang}.jsonに存在する以下のキーが欠落しています:`,
        );
        missingKeys.forEach((key) => console.log(`  - ${key}`));
        hasError = true;
      }

      if (extraKeys.length > 0) {
        warn(`${lang}.jsonには${baseLang}.jsonに存在しない追加キーがあります:`);
        extraKeys.forEach((key) => console.log(`  - ${key}`));
      }
    });

    if (!hasError) {
      success(`すべての言語ファイル間でキーの整合性が取れています`);
    }

    return !hasError;
  } catch (err) {
    return error(`言語間の欠落キーチェックに失敗: ${err.message}`);
  }
}

// ネストされたオブジェクトからすべてのキーを抽出（ドット区切りで）
function extractKeys(obj, prefix = "") {
  let keys = [];

  Object.keys(obj).forEach((key) => {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof obj[key] === "object" && obj[key] !== null) {
      keys = keys.concat(extractKeys(obj[key], newKey));
    } else {
      keys.push(newKey);
    }
  });

  return keys;
}

// メイン関数
function main() {
  log("\n🔍 i18n翻訳ファイルのバリデーションを開始します...\n");

  const files = getLocaleFiles();
  if (files.length === 0) {
    error("翻訳ファイルが見つかりませんでした");
    process.exit(1);
  }

  let hasErrors = false;

  // 各ファイルのバリデーション
  files.forEach((file) => {
    log(`\n📄 ${file.name} のチェック:`, YELLOW);

    // JSON構文チェック
    const syntaxValid = validateJsonSyntax(file.path, file.name);
    if (!syntaxValid) hasErrors = true;
  });

  // 言語間での欠落キーチェック
  log("\n🌐 言語間の整合性チェック:", YELLOW);
  const missingKeysValid = checkMissingKeys(files);
  if (!missingKeysValid) hasErrors = true;

  // 結果出力
  log("\n📊 バリデーション結果:", YELLOW);
  if (hasErrors) {
    error(
      "翻訳ファイルにエラーが見つかりました。上記のエラーを修正してください。",
    );
    process.exit(1);
  } else {
    success("すべての検証に合格しました！");
    process.exit(0);
  }
}

// スクリプト実行
main();
