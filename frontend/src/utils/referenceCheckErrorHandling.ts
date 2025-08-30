/**
 * エラーハンドリング用ユーティリティ
 */

/**
 * HTTPエラーレスポンスの型定義
 */
interface HttpErrorResponse {
  response?: {
    status?: number;
  };
}

/**
 * カスタムエラーの型定義
 */
export interface CustomError extends Error {
  isReferenceCheckInProgress?: boolean;
  statusCode?: number;
}

/**
 * エラーステータスコードを取得する
 * @param error エラーオブジェクト
 * @returns ステータスコード（取得できない場合はnull）
 */
export const getErrorStatus = (error: unknown): number | null => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as HttpErrorResponse).response;
    if (response && typeof response === "object" && "status" in response) {
      return response.status || null;
    }
  }
  return null;
};

/**
 * 504 Gateway Timeoutエラーかどうかを判定する
 * @param error エラーオブジェクト
 * @returns 504エラーの場合true
 */
export const isGatewayTimeoutError = (error: unknown): boolean => {
  return getErrorStatus(error) === 504;
};

/**
 * 404 Not Foundエラーかどうかを判定する
 * @param error エラーオブジェクト
 * @returns 404エラーの場合true
 */
export const is404Error = (error: unknown): boolean => {
  return getErrorStatus(error) === 404;
};

/**
 * 409 Conflictエラーかどうかを判定する
 * @param error エラーオブジェクト
 * @returns 409エラーの場合true
 */
export const is409Error = (error: unknown): boolean => {
  return getErrorStatus(error) === 409;
};

/**
 * エラーメッセージから409エラーを検出する
 * @param error エラーオブジェクト
 * @returns 409エラーの場合true
 */
export const isConflictErrorFromMessage = (error: unknown): boolean => {
  if (error instanceof Error) {
    return (
      error.message.includes("既に実行中") ||
      error.message.includes("in progress") ||
      error.message.includes("409")
    );
  }
  return false;
};

/**
 * リファレンスチェック実行中エラーかどうかを判定する
 * @param error エラーオブジェクト
 * @returns 実行中エラーの場合true
 */
export const isReferenceCheckInProgress = (error: unknown): boolean => {
  const customError = error as CustomError;
  const errorStatus = getErrorStatus(error);
  const is409FromMessage = isConflictErrorFromMessage(error);

  return (
    (customError && customError.isReferenceCheckInProgress) ||
    errorStatus === 409 ||
    is409FromMessage
  );
};

/**
 * エラーの種類を判定する
 * @param error エラーオブジェクト
 * @returns エラーの種類
 */
export const getErrorType = (
  error: unknown,
): "in-progress" | "not-found" | "timeout" | "other" => {
  if (isReferenceCheckInProgress(error)) {
    return "in-progress";
  }
  if (is404Error(error)) {
    return "not-found";
  }
  if (isGatewayTimeoutError(error)) {
    return "timeout";
  }
  return "other";
};
