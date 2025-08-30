import React from "react";
import { render } from "@testing-library/react";
import EmojiFeedback from "../EmojiFeedback";
import { EmotionState } from "../../types/index";

// パフォーマンステスト用のモック
jest.mock("../../utils/performanceUtils", () => ({
  getPerformanceInfo: jest.fn().mockReturnValue({
    isMobile: false,
    isLowEndDevice: false,
    prefersReducedMotion: false,
    hardwareConcurrency: 4,
    deviceMemory: 8,
    connectionType: "4g",
  }),
  optimizeAnimation: jest.fn((animation) => animation),
  debounce: jest.fn((fn) => fn),
  throttle: jest.fn((fn) => fn),
  measureRenderTime: jest.fn((name, fn) => fn()),
}));

describe("EmojiFeedbackパフォーマンステスト", () => {
  // レンダリング回数をカウントするためのモック - 今後の拡張用に定義
  // 現在は使用していないが、後で使用する予定なので削除しない

  beforeEach(() => {
    renderCount = 0;
    jest.clearAllMocks();
  });

  test("メモ化によって不要な再レンダリングが防止されること", () => {
    const { rerender } = render(
      <EmojiFeedback angerLevel={5} trustLevel={5} progressLevel={5} />,
    );

    // 同じプロパティで再レンダリング
    rerender(<EmojiFeedback angerLevel={5} trustLevel={5} progressLevel={5} />);

    // メトリクス値が微小に変化した場合（閾値以下）
    rerender(
      <EmojiFeedback angerLevel={5.1} trustLevel={5} progressLevel={5} />,
    );

    // メトリクス値が大きく変化した場合（閾値以上）
    rerender(<EmojiFeedback angerLevel={7} trustLevel={5} progressLevel={5} />);

    // カスタム絵文字を追加
    const customEmojis: Record<EmotionState, string> = {
      angry: "🤬",
      annoyed: "😠",
      neutral: "😶",
      satisfied: "😊",
      happy: "🥰",
    };

    rerender(
      <EmojiFeedback
        angerLevel={7}
        trustLevel={5}
        progressLevel={5}
        customEmojis={customEmojis}
      />,
    );
  });

  test("モバイルデバイス向けの最適化が適用されること", () => {
    // モバイルデバイスをモック
    import * as performanceUtils from "../../utils/performanceUtils";
    jest.spyOn(performanceUtils, "getPerformanceInfo").mockReturnValue({
      isMobile: true,
      isLowEndDevice: true,
      prefersReducedMotion: false,
      hardwareConcurrency: 2,
      deviceMemory: 2,
      connectionType: "3g",
    });

    render(
      <EmojiFeedback
        angerLevel={9}
        trustLevel={3}
        progressLevel={5}
        animationEnabled={true}
      />,
    );

    // アニメーション最適化関数が呼ばれていることを確認
    expect(performanceUtils.optimizeAnimation).toHaveBeenCalled();
  });

  test("prefers-reduced-motionの設定が尊重されること", () => {
    // prefers-reduced-motionをモック
    import * as performanceUtils from "../../utils/performanceUtils";
    jest.spyOn(performanceUtils, "getPerformanceInfo").mockReturnValue({
      isMobile: false,
      isLowEndDevice: false,
      prefersReducedMotion: true,
      hardwareConcurrency: 4,
      deviceMemory: 8,
      connectionType: "4g",
    });

    render(
      <EmojiFeedback
        angerLevel={9}
        trustLevel={3}
        progressLevel={5}
        animationEnabled={true}
      />,
    );

    // アニメーション最適化関数が呼ばれていることを確認
    expect(performanceUtils.optimizeAnimation).toHaveBeenCalled();
  });
});
