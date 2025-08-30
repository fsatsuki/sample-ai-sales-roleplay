import { VideoAnalysisResult } from "../../types/api";

// APIのモック
jest.mock("aws-amplify/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

// ApiServiceのモック
jest.mock("../ApiService", () => ({
  ApiService: {
    getInstance: jest.fn(() => ({
      getVideoUploadUrl: jest.fn(),
      analyzeVideo: jest.fn(),
      getVideoAnalysis: jest.fn(),
    })),
  },
}));

import { ApiService } from "../ApiService";

describe("ApiService - ビデオ関連機能のテスト", () => {
  let apiService: {
    getVideoUploadUrl: jest.Mock;
    analyzeVideo: jest.Mock;
    getVideoAnalysis: jest.Mock;
  };

  beforeEach(() => {
    apiService = ApiService.getInstance();
    jest.clearAllMocks();
  });

  describe("getVideoUploadUrl", () => {
    it("署名付きURLの取得に成功するとき", async () => {
      // モックレスポンスの設定
      const mockResponse = {
        uploadUrl:
          "https://example-bucket.s3.amazonaws.com/videos/test-session-id/test-video.webm",
        videoKey: "videos/test-session-id/test-video.webm",
        expiresIn: 600,
      };

      // ApiServiceのモック設定
      apiService.getVideoUploadUrl.mockResolvedValue(mockResponse);

      // 関数の実行
      const result = await apiService.getVideoUploadUrl(
        "test-session-id",
        "video/webm",
        "test-video.webm",
      );

      // 関数が正しく呼び出されたことの検証
      expect(apiService.getVideoUploadUrl).toHaveBeenCalledWith(
        "test-session-id",
        "video/webm",
        "test-video.webm",
      );

      // 結果が正しいことの検証
      expect(result).toEqual(mockResponse);
    });

    it("エラーが発生するとき", async () => {
      // エラーの設定
      apiService.getVideoUploadUrl.mockRejectedValue(new Error("APIエラー"));

      // 関数の実行とエラーの検証
      await expect(
        apiService.getVideoUploadUrl("test-session-id", "video/webm"),
      ).rejects.toThrow("APIエラー");
    });
  });

  describe("analyzeVideo", () => {
    it("動画分析に成功するとき", async () => {
      // モックレスポンスの設定
      const mockResponse = {
        jobId: "test-job-id",
        status: "completed",
        result: {
          eyeContact: 7,
          facialExpression: 6,
          gesture: 8,
          emotion: 7,
          overallScore: 7,
          strengths: ["テスト強み1", "テスト強み2"],
          improvements: ["テスト改善点1", "テスト改善点2"],
          analysis: "テスト分析結果",
        },
      };

      // ApiServiceのモック設定
      apiService.analyzeVideo.mockResolvedValue(mockResponse);

      // 関数の実行
      const result = await apiService.analyzeVideo(
        "test-session-id",
        "videos/test-video.webm",
      );

      // 関数が正しく呼び出されたことの検証
      expect(apiService.analyzeVideo).toHaveBeenCalledWith(
        "test-session-id",
        "videos/test-video.webm",
      );

      // 結果が正しいことの検証
      expect(result).toEqual(mockResponse);
    });
  });

  describe("getVideoAnalysis", () => {
    it("動画分析結果の取得に成功するとき", async () => {
      // モック分析結果
      const mockVideoAnalysis: VideoAnalysisResult = {
        eyeContact: 7,
        facialExpression: 6,
        gesture: 8,
        emotion: 7,
        overallScore: 7,
        strengths: ["テスト強み1", "テスト強み2"],
        improvements: ["テスト改善点1", "テスト改善点2"],
        analysis: "テスト分析結果",
      };

      // モックレスポンスの設定
      const mockResponse = {
        sessionId: "test-session-id",
        videoAnalysis: mockVideoAnalysis,
        createdAt: "2025-07-29T12:00:00Z",
        videoUrl: "s3://bucket/videos/test-session-id/video.webm",
      };

      // ApiServiceのモック設定
      apiService.getVideoAnalysis.mockResolvedValue(mockResponse);

      // 関数の実行
      const result = await apiService.getVideoAnalysis("test-session-id");

      // 関数が正しく呼び出されたことの検証
      expect(apiService.getVideoAnalysis).toHaveBeenCalledWith(
        "test-session-id",
      );

      // 結果が正しいことの検証
      expect(result).toEqual(mockResponse);
    });
  });
});
