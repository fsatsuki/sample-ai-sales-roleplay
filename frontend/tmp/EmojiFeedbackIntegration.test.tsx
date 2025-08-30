import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ConversationPage from "../../pages/ConversationPage";
import { ApiService } from "../../services/ApiService";
import { DEFAULT_EMOTION_EMOJI_MAP } from "../../utils/emotionUtils";

// モックの設定

jest.mock("../../services/ApiService", () => ({
  ApiService: {
    getInstance: jest.fn().mockReturnValue({
      getRealtimeEvaluation: jest.fn().mockImplementation(async () => ({
        scores: {
          angerLevel: 3,
          trustLevel: 7,
          progressLevel: 6,
        },
        analysis: "テスト分析",
      })),
      chatWithNPC: jest.fn().mockResolvedValue({
        response: "NPCの応答です",
      }),
    }),
  },
}));

jest.mock("../../services/AudioService", () => ({
  AudioService: {
    getInstance: jest.fn().mockReturnValue({
      setAudioEnabled: jest.fn(),
      setVolume: jest.fn(),
      synthesizeAndQueueAudio: jest.fn().mockResolvedValue({}),
      stopAllAudio: jest.fn(),
    }),
  },
}));

jest.mock("../../data/scenarios", () => ({
  getScenarioById: jest.fn().mockReturnValue({
    id: "test-scenario",
    title: "テストシナリオ",
    description: "テスト用のシナリオです",
    difficulty: "medium",
    industry: "テスト業界",
    npc: {
      id: "test-npc",
      name: "テスト太郎",
      role: "営業部長",
      company: "テスト株式会社",
      personality: ["真面目", "論理的"],
      avatar: "👨",
      description: "テスト用のNPCです",
    },
    objectives: ["目標1", "目標2"],
    initialMetrics: { angerLevel: 0, trustLevel: 5, progressLevel: 0 },
  }),
}));

// テストスイート
describe("EmojiFeedback統合テスト", () => {
  beforeEach(() => {
    // モックをリセット
    jest.clearAllMocks();
  });

  test("ConversationPageでEmojiFeedbackが正しく表示されること", async () => {
    render(
      <MemoryRouter initialEntries={["/conversation/test-scenario"]}>
        <Routes>
          <Route
            path="/conversation/:scenarioId"
            element={<ConversationPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // NPCの情報が表示されることを確認
    expect(screen.getByText("テスト太郎")).toBeInTheDocument();

    // 商談開始ボタンをクリック
    fireEvent.click(screen.getByText("商談開始"));

    // EmojiFeedbackコンポーネントが表示されることを確認
    // 初期状態では中立の絵文字が表示されるはず
    await waitFor(() => {
      expect(
        screen.getByText(DEFAULT_EMOTION_EMOJI_MAP.neutral),
      ).toBeInTheDocument();
    });
  });

  test("メッセージ送信時にEmojiFeedbackが更新されること", async () => {
    render(
      <MemoryRouter initialEntries={["/conversation/test-scenario"]}>
        <Routes>
          <Route
            path="/conversation/:scenarioId"
            element={<ConversationPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // 商談開始ボタンをクリック
    fireEvent.click(screen.getByText("商談開始"));

    // テキスト入力
    const inputField =
      screen.getByPlaceholderText("メッセージを入力してください...");
    fireEvent.change(inputField, {
      target: { value: "こんにちは、提案があります" },
    });

    // 送信ボタンをクリック
    const sendButton = screen.getByRole("button", { name: "" }); // 送信アイコンボタン
    fireEvent.click(sendButton);

    // APIレスポンスが返ってくるまで待機
    await waitFor(() => {
      expect(screen.getByText("NPCの応答です")).toBeInTheDocument();
    });

    // APIからのメトリクス更新をシミュレート
    const apiInstance = ApiService.getInstance();

    // 怒りレベルを上げるメトリクス更新をモック
    apiInstance.getRealtimeEvaluation = jest.fn().mockResolvedValue({
      scores: {
        angerLevel: 9,
        trustLevel: 3,
        progressLevel: 2,
      },
      analysis: "怒りが高まっています",
    });

    // 怒りの絵文字に更新されることを確認
    await waitFor(() => {
      expect(
        screen.getByText(DEFAULT_EMOTION_EMOJI_MAP.angry),
      ).toBeInTheDocument();
    });

    // 別のメトリクス更新をモック（信頼度を上げる）
    apiInstance.getRealtimeEvaluation = jest.fn().mockResolvedValue({
      scores: {
        angerLevel: 2,
        trustLevel: 9,
        progressLevel: 7,
      },
      analysis: "信頼度が高まっています",
    });

    // メッセージを再度送信して新しいメトリクスを取得
    fireEvent.change(inputField, { target: { value: "もう一度提案します" } });
    fireEvent.click(sendButton);

    // 幸せの絵文字に更新されることを確認
    await waitFor(() => {
      expect(
        screen.getByText(DEFAULT_EMOTION_EMOJI_MAP.happy),
      ).toBeInTheDocument();
    });
  });

  test("アクセシビリティ要素が正しく設定されていること", async () => {
    render(
      <MemoryRouter initialEntries={["/conversation/test-scenario"]}>
        <Routes>
          <Route
            path="/conversation/:scenarioId"
            element={<ConversationPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // 商談開始ボタンをクリック
    fireEvent.click(screen.getByText("商談開始"));

    // アクセシビリティ用のラベルが存在することを確認
    expect(screen.getByText("対話相手の感情状態")).toBeInTheDocument();

    // アクセシビリティ用の説明が存在することを確認
    expect(
      screen.getByText("対話相手の現在の感情状態を表す絵文字です"),
    ).toBeInTheDocument();
  });
});
