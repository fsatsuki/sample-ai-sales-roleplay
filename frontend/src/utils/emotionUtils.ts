/**
 * 感情状態計算ユーティリティ
 *
 * メトリクス（怒り、信頼度、進捗度）から感情状態を計算し、
 * 対応する絵文字を提供するためのユーティリティ関数群です。
 *
 * @module emotionUtils
 * @author AI営業ロールプレイ開発チーム
 * @version 1.0.0
 * @example
 * // 基本的な使用方法
 * import { calculateEmotionState, getEmojiForEmotion } from '../utils/emotionUtils';
 *
 * // 感情状態の計算
 * const emotion = calculateEmotionState({
 *   angerLevel: 3,
 *   trustLevel: 8,
 *   progressLevel: 6
 * });
 *
 * // 絵文字の取得
 * const emoji = getEmojiForEmotion(emotion);
 */

import { EmotionState, EmotionCalculationParams } from "../types/index";

/**
 * 感情状態と絵文字のデフォルトマッピング
 *
 * 各感情状態に対応するデフォルトの絵文字を定義します。
 * カスタム絵文字が指定されていない場合に使用されます。
 *
 * @type {Record<EmotionState, string>}
 */
export const DEFAULT_EMOTION_EMOJI_MAP: Record<EmotionState, string> = {
  angry: "😡",
  annoyed: "😒",
  neutral: "😐",
  satisfied: "🙂",
  happy: "😄",
};

/**
 * 感情状態の説明テキスト（アクセシビリティ用）
 *
 * 各感情状態の簡潔な説明テキストです。
 * スクリーンリーダーユーザーに対して、現在の感情状態を伝えるために使用されます。
 *
 * @type {Record<EmotionState, string>}
 */
export const EMOTION_DESCRIPTIONS: Record<EmotionState, string> = {
  angry: "怒っている",
  annoyed: "不満を感じている",
  neutral: "中立的",
  satisfied: "満足している",
  happy: "喜んでいる",
};

/**
 * 感情状態の詳細な説明テキスト（アクセシビリティ用）
 *
 * 各感情状態の詳細な説明テキストです。
 * スクリーンリーダーユーザーが詳細情報を要求した場合に使用されます。
 *
 * @type {Record<EmotionState, string>}
 */
export const EMOTION_DETAILED_DESCRIPTIONS: Record<EmotionState, string> = {
  angry: "対話相手は非常に怒っています。即座に対応が必要です。",
  annoyed: "対話相手は不満を感じています。別のアプローチを考えるべきです。",
  neutral: "対話相手は中立的な状態です。特に強い感情は示していません。",
  satisfied: "対話相手は満足しています。良い方向に進んでいます。",
  happy: "対話相手は非常に喜んでいます。この調子を維持しましょう。",
};

/**
 * 感情状態のアクセシビリティ用色情報
 *
 * 色覚異常を考慮し、十分なコントラスト比を確保した色の定義です。
 * 各感情状態に対して、明るい背景用、暗い背景用、高コントラストモード用の色を定義します。
 * WCAG 2.1 AA基準に準拠したコントラスト比を確保しています。
 *
 * @type {Record<EmotionState, { light: string; dark: string; highContrast: string }>}
 */
export const EMOTION_COLORS: Record<
  EmotionState,
  { light: string; dark: string; highContrast: string }
> = {
  angry: {
    light: "#d32f2f", // 赤色 - 明るい背景用
    dark: "#ff6659", // 赤色の明るいバージョン - 暗い背景用
    highContrast: "#ffffff", // 高コントラストモード用
  },
  annoyed: {
    light: "#ed6c02", // 琥珀色 - 明るい背景用
    dark: "#ffac42", // 琥珀色の明るいバージョン - 暗い背景用
    highContrast: "#ffffff", // 高コントラストモード用
  },
  neutral: {
    light: "#757575", // 灰色 - 明るい背景用
    dark: "#a4a4a4", // 灰色の明るいバージョン - 暗い背景用
    highContrast: "#ffffff", // 高コントラストモード用
  },
  satisfied: {
    light: "#2e7d32", // 緑色 - 明るい背景用
    dark: "#60ad5e", // 緑色の明るいバージョン - 暗い背景用
    highContrast: "#ffffff", // 高コントラストモード用
  },
  happy: {
    light: "#0288d1", // 青色 - 明るい背景用
    dark: "#5eb8ff", // 青色の明るいバージョン - 暗い背景用
    highContrast: "#ffffff", // 高コントラストモード用
  },
};

/**
 * 感情状態計算の定数
 */
const HYSTERESIS_THRESHOLD = 1.5; // ヒステリシス（履歴効果）の閾値
const ANGER_THRESHOLD = 7.5; // 怒り状態の閾値
const ANGER_MULTIPLIER = 1.2; // 怒りスコアの乗数

/**
 * 感情状態のスコア計算
 * 各感情状態の「強さ」をスコア化する
 */
interface EmotionScores {
  angry: number;
  annoyed: number;
  neutral: number;
  satisfied: number;
  happy: number;
}

/**
 * メトリクス値を有効な範囲（0-10）に制限する
 *
 * 指定されたメトリクス値が範囲外の場合、有効な範囲内に制限します。
 * 未定義またはnullの場合はデフォルト値（5）を返します。
 *
 * @param {number} value - メトリクス値
 * @returns {number} - 有効範囲内に制限された値
 */
const clampMetricValue = (value: number): number => {
  if (value === undefined || value === null) return 5; // デフォルト値
  return Math.max(0, Math.min(10, value));
};

/**
 * 感情状態のスコアを計算する
 */
const calculateEmotionScores = (
  params: EmotionCalculationParams,
): EmotionScores => {
  // メトリクス値を有効範囲に制限
  const anger = clampMetricValue(params.angerLevel);
  const trust = clampMetricValue(params.trustLevel);
  const progress = clampMetricValue(params.progressLevel);

  // 各感情状態のスコア計算
  return {
    angry: anger >= ANGER_THRESHOLD ? anger * ANGER_MULTIPLIER : 0, // 怒りが高い場合、優先度を上げる
    annoyed: anger >= 6 ? anger : 0,
    neutral: 5, // 中立は常に基準値として存在
    satisfied: trust >= 6 ? trust + progress * 0.3 : 0, // 進捗度も少し考慮
    happy: trust >= 8 ? trust + progress * 0.5 : 0, // 高信頼度と高進捗度で最も幸せ
  };
};

/**
 * 最も高いスコアの感情状態を取得する
 */
const getHighestEmotionState = (scores: EmotionScores): EmotionState => {
  let highestScore = -1;
  let highestEmotion: EmotionState = "neutral"; // デフォルト値

  (Object.keys(scores) as EmotionState[]).forEach((emotion) => {
    if (scores[emotion] > highestScore) {
      highestScore = scores[emotion];
      highestEmotion = emotion;
    }
  });

  return highestEmotion;
};

/**
 * ヒステリシスを適用して感情状態を決定する
 */
const applyHysteresis = (
  newEmotion: EmotionState,
  previousEmotion: EmotionState | undefined,
  scores: EmotionScores,
): EmotionState => {
  // 前回の感情状態がない場合は新しい感情状態をそのまま返す
  if (!previousEmotion) return newEmotion;

  // 'angry'状態への変化は即時に反映（重要なフィードバックのため）
  // 怒りスコアが閾値以上の場合は必ず怒り状態にする（優先度最高）
  if (scores.angry >= ANGER_THRESHOLD * ANGER_MULTIPLIER - 0.1) return "angry"; // 浮動小数点誤差を考慮して0.1のマージンを設定

  // 前回と同じ感情状態の場合はそのまま返す
  if (newEmotion === previousEmotion) return newEmotion;

  // 前回の感情状態と新しい感情状態のスコア差を計算
  const previousScore = scores[previousEmotion] || 0;
  const newScore = scores[newEmotion] || 0;
  const scoreDifference = Math.abs(newScore - previousScore);

  // スコア差がヒステリシス閾値以上の場合のみ感情状態を変更
  return scoreDifference >= HYSTERESIS_THRESHOLD ? newEmotion : previousEmotion;
};

/**
 * メトリクスから感情状態を計算する
 *
 * 指定されたメトリクス（怒り、信頼度、進捗度）から適切な感情状態を計算します。
 * ヒステリシス（履歴効果）を適用して、微小な変化による頻繁な状態変化を防止します。
 *
 * @param {EmotionCalculationParams} params - 計算パラメータ
 * @param {number} params.angerLevel - 怒りレベル (0-10)
 * @param {number} params.trustLevel - 信頼度レベル (0-10)
 * @param {number} params.progressLevel - 進捗度レベル (0-10)
 * @param {EmotionState} [params.previousEmotion] - 前回の感情状態
 * @returns {EmotionState} - 計算された感情状態
 */
export const calculateEmotionState = (
  params: EmotionCalculationParams,
): EmotionState => {
  try {
    // 感情状態のスコアを計算
    const scores = calculateEmotionScores(params);

    // 最も高いスコアの感情状態を取得
    const highestEmotion = getHighestEmotionState(scores);

    // ヒステリシスを適用して最終的な感情状態を決定
    return applyHysteresis(highestEmotion, params.previousEmotion, scores);
  } catch (error) {
    console.error("感情状態の計算中にエラーが発生しました:", error);
    return "neutral"; // エラー時はデフォルトで中立を返す
  }
};

/**
 * 感情状態に対応する絵文字を取得する
 *
 * 指定された感情状態に対応する絵文字を返します。
 * カスタム絵文字マップが指定されている場合はそれを使用し、
 * そうでない場合はデフォルトの絵文字マッピングから取得します。
 *
 * @param {EmotionState} emotion - 感情状態
 * @param {Record<EmotionState, string>} [customEmojis] - カスタム絵文字マップ
 * @returns {string} - 感情状態に対応する絵文字
 */
export const getEmojiForEmotion = (
  emotion: EmotionState | string,
  customEmojis?: Record<EmotionState, string>,
): string => {
  try {
    // 無効な感情状態の場合は中立の絵文字を返す
    if (
      !Object.values(DEFAULT_EMOTION_EMOJI_MAP).length ||
      !(emotion in DEFAULT_EMOTION_EMOJI_MAP)
    ) {
      return DEFAULT_EMOTION_EMOJI_MAP.neutral;
    }

    const safeEmotion = emotion as EmotionState;

    // カスタム絵文字が提供されている場合はそれを使用
    if (customEmojis && customEmojis[safeEmotion]) {
      return customEmojis[safeEmotion];
    }

    // デフォルトの絵文字マッピングから取得
    return DEFAULT_EMOTION_EMOJI_MAP[safeEmotion];
  } catch (error) {
    console.error("絵文字の取得中にエラーが発生しました:", error);
    return DEFAULT_EMOTION_EMOJI_MAP.neutral; // エラー時はデフォルトで中立の絵文字を返す
  }
};

/**
 * カスタム絵文字マップを検証し、不足している感情状態をデフォルトで補完する
 *
 * 指定されたカスタム絵文字マップを検証し、定義されていない感情状態があれば
 * デフォルトの絵文字で補完した完全なマップを返します。
 * カスタム絵文字マップが指定されていない場合は、デフォルトのマップを返します。
 *
 * @param {Record<EmotionState, string>} [customEmojis] - カスタム絵文字マップ
 * @returns {Record<EmotionState, string>} - 完全な絵文字マップ
 */
export const validateAndCompleteEmojiMap = (
  customEmojis?: Record<EmotionState, string>,
): Record<EmotionState, string> => {
  if (!customEmojis) return DEFAULT_EMOTION_EMOJI_MAP;

  const completeMap = { ...DEFAULT_EMOTION_EMOJI_MAP };

  // カスタム絵文字マップの各エントリをデフォルトマップに上書き
  (Object.keys(DEFAULT_EMOTION_EMOJI_MAP) as EmotionState[]).forEach(
    (emotion) => {
      if (customEmojis[emotion]) {
        completeMap[emotion] = customEmojis[emotion];
      }
    },
  );

  return completeMap;
};
