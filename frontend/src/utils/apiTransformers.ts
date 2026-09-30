/**
 * バックエンドレスポンスの変換ユーティリティ
 *
 * バックエンド（Python）はsnake_caseでレスポンスを返すため、
 * フロントエンド（TypeScript camelCase）に変換する関数群を提供する。
 */

import type {
  ComplianceViolation,
  ComplianceCheck,
  ImportStats,
  ImportResponse,
  ImportedScenarioDetail,
  SkippedScenarioDetail,
  ImportErrorDetail,
  AnalysisFeedbackItem,
  VideoAnalysisResult,
} from "../types/api";

// ============================================================
// バックエンド生データ型（snake_case）
// ============================================================

/** バックエンドから返されるComplianceViolationの生データ型 */
interface RawComplianceViolation {
  rule_id: string;
  rule_name: string;
  severity: string;
  message: string;
  context: string;
  confidence: number;
  rule_name_key?: string;
  rule_name_params?: Record<string, string | number>;
  message_key?: string;
  message_params?: Record<string, string | number>;
}

/** バックエンドから返されるImportStatsの生データ型 */
interface RawImportStats {
  imported_scenarios: number;
  updated_scenarios: number;
  imported_npcs: number;
  updated_npcs: number;
  errors: number;
}

/** バックエンドから返されるComplianceCheckの生データ型 */
interface RawComplianceCheck {
  score?: number;
  passed?: boolean;
  violations?: RawComplianceViolation[];
  risk_level?: string;
  analysis?: string;
  recommendations?: string[];
}

/** バックエンドから返されるImportResponseの生データ型 */
interface RawImportResponse {
  success?: boolean;
  message?: string;
  stats?: RawImportStats;
  /** インポート成功件数（現行バックエンド） */
  imported?: number;
  /** スキップ件数（現行バックエンド） */
  skipped?: number;
  /** エラー件数（現行バックエンド）。レガシー形式では文字列配列の場合がある */
  errors?: number | string[];
  details?: {
    importedScenarios?: ImportedScenarioDetail[];
    skippedScenarios?: SkippedScenarioDetail[];
    errors?: ImportErrorDetail[];
  };
  importedScenarios?: number;
  updatedScenarios?: number;
}

/** バックエンドから返されるVideoAnalysisResultの生データ型 */
interface RawVideoAnalysisResult {
  overallScore: number;
  eyeContact: number;
  facialExpression: number;
  gesture: number;
  emotion: number;
  strengths: (AnalysisFeedbackItem | string)[];
  improvements: (AnalysisFeedbackItem | string)[];
  analysis: string;
}

// ============================================================
// 変換関数
// ============================================================

/**
 * バックエンドのComplianceViolation（snake_case）をフロントエンド型（camelCase）に変換
 */
export function transformComplianceViolation(
  raw: RawComplianceViolation,
): ComplianceViolation {
  return {
    ruleId: raw.rule_id,
    ruleName: raw.rule_name,
    severity: raw.severity as ComplianceViolation["severity"],
    message: raw.message,
    context: raw.context,
    confidence: raw.confidence,
    ruleNameKey: raw.rule_name_key,
    ruleNameParams: raw.rule_name_params,
    messageKey: raw.message_key,
    messageParams: raw.message_params,
  };
}

/**
 * ComplianceCheck内のviolations配列を変換
 * バックエンドのsnake_case形式またはフロントエンド形式のどちらも受け付ける
 */
export function transformComplianceCheck(
  raw: RawComplianceCheck | ComplianceCheck | undefined,
): ComplianceCheck | undefined {
  if (!raw) return undefined;

  // 既にフロントエンド型（camelCase）の場合はviolationsのみ正規化して返す
  if ('riskLevel' in raw || ('violations' in raw && Array.isArray(raw.violations) && raw.violations.length > 0 && 'ruleId' in raw.violations[0])) {
    return raw as ComplianceCheck;
  }

  // バックエンド型（snake_case）の場合は変換
  const rawCheck = raw as RawComplianceCheck;
  return {
    score: rawCheck.score ?? 0,
    passed: rawCheck.passed,
    violations: Array.isArray(rawCheck.violations)
      ? rawCheck.violations.map(transformComplianceViolation)
      : [],
    riskLevel: rawCheck.risk_level as ComplianceCheck['riskLevel'],
    analysis: rawCheck.analysis ?? '',
    recommendations: rawCheck.recommendations,
  };
}

/**
 * バックエンドのImportStats（snake_case）をフロントエンド型（camelCase）に変換
 */
export function transformImportStats(raw: RawImportStats): ImportStats {
  return {
    importedScenarios: raw.imported_scenarios,
    updatedScenarios: raw.updated_scenarios,
    importedNpcs: raw.imported_npcs,
    updatedNpcs: raw.updated_npcs,
    errors: raw.errors,
  };
}

/**
 * インポートレスポンスを正規化する
 *
 * 現行バックエンドは `imported` / `skipped` / `errors`（件数）と `details`
 * （明細）を返す。レガシーな `stats` 形式のレスポンスも受け付ける。
 * どちらの形式でもUIが件数と明細を参照できるように正規化する。
 */
export function transformImportResponse(
  raw: RawImportResponse | ImportResponse,
): ImportResponse {
  const rawResp = (raw ?? {}) as RawImportResponse;

  const details = rawResp.details ?? {};
  const importedScenarios: ImportedScenarioDetail[] = Array.isArray(
    details.importedScenarios,
  )
    ? details.importedScenarios
    : [];
  const skippedScenarios: SkippedScenarioDetail[] = Array.isArray(
    details.skippedScenarios,
  )
    ? details.skippedScenarios
    : [];
  const errorDetails: ImportErrorDetail[] = Array.isArray(details.errors)
    ? details.errors
    : [];

  // レガシーなstats形式（snake_case / camelCase）も受け付ける
  const stats: ImportStats = rawResp.stats
    ? "importedScenarios" in rawResp.stats
      ? (rawResp.stats as unknown as ImportStats)
      : transformImportStats(rawResp.stats)
    : {
        importedScenarios: 0,
        updatedScenarios: 0,
        importedNpcs: 0,
        updatedNpcs: 0,
        errors: 0,
      };

  // 件数はトップレベルの値を優先し、無い場合は明細・statsから導出する
  const imported =
    typeof rawResp.imported === "number"
      ? rawResp.imported
      : importedScenarios.length || stats.importedScenarios;
  const skipped =
    typeof rawResp.skipped === "number"
      ? rawResp.skipped
      : skippedScenarios.length;
  const errorCount =
    typeof rawResp.errors === "number"
      ? rawResp.errors
      : Array.isArray(rawResp.errors)
        ? rawResp.errors.length
        : errorDetails.length || stats.errors;

  return {
    // バックエンドはsuccessを返さないため、エラー0件を成功とみなす
    success: rawResp.success ?? errorCount === 0,
    message: rawResp.message,
    imported,
    skipped,
    errorCount,
    stats: { ...stats, importedScenarios: imported, errors: errorCount },
    details: {
      importedScenarios,
      skippedScenarios,
      errors: errorDetails,
    },
  };
}

/**
 * VideoAnalysisResultのstrengths/improvementsを正規化
 * 旧形式（string[]）を AnalysisFeedbackItem[] に変換する
 */
export function normalizeAnalysisItems(
  items: (AnalysisFeedbackItem | string)[] | undefined,
): AnalysisFeedbackItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) =>
    typeof item === "string" ? { title: item, description: "" } : item,
  );
}

/**
 * VideoAnalysisResultのstrengths/improvementsを正規化
 */
export function transformVideoAnalysisResult(
  raw: RawVideoAnalysisResult | VideoAnalysisResult | undefined,
): VideoAnalysisResult | undefined {
  if (!raw) return undefined;
  return {
    overallScore: raw.overallScore,
    eyeContact: raw.eyeContact,
    facialExpression: raw.facialExpression,
    gesture: raw.gesture,
    emotion: raw.emotion,
    analysis: raw.analysis,
    strengths: normalizeAnalysisItems(raw.strengths),
    improvements: normalizeAnalysisItems(raw.improvements),
  };
}

/**
 * メトリクス文字列値を安全にnumberに変換する
 * NaN/Infinity/undefined/null時はデフォルト値を返す
 */
export function safeParseMetric(
  value: string | number | undefined | null,
  defaultValue: number = 0,
  min: number = 0,
  max: number = 10,
): number {
  if (value === undefined || value === null) return defaultValue;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return defaultValue;
  return Math.max(min, Math.min(max, num));
}
