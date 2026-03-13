import {
  shouldEndSession,
  getSessionEndReason,
  calculateCurrentTurns,
} from "../../utils/dialogueEngine";
import { dialogueConfig } from "../../config/dialogueConfig";
import type { Metrics, Goal, GoalStatus, Scenario } from "../../types/index";

describe("dialogueEngine", () => {
  // テスト用の基本データ
  const baseMetrics: Metrics = {
    angerLevel: 3,
    trustLevel: 5,
    progressLevel: 4,
  };

  const baseGoals: Goal[] = [
    {
      id: "goal1",
      description: "Goal 1",
      priority: 1,
      criteria: [],
      isRequired: true,
    },
    {
      id: "goal2",
      description: "Goal 2",
      priority: 2,
      criteria: [],
      isRequired: false,
    },
  ];

  const baseGoalStatuses: GoalStatus[] = [
    { goalId: "goal1", achieved: false, progress: 0 },
    { goalId: "goal2", achieved: false, progress: 0 },
  ];

  const baseScenario: Scenario = {
    id: "test-scenario",
    title: "Test Scenario",
    description: "Test description",
    npc: {
      id: "test-npc",
      name: "Test NPC",
      role: "Tester",
      company: "Test Company",
      personality: ["Test"],
      avatar: "😀",
      description: "Test description",
    },
    industry: "Test",
    difficulty: "easy",
    initialMetrics: baseMetrics,
    goals: baseGoals,
  };

  describe("calculateCurrentTurns", () => {
    it("正しいターン数を計算する - 偶数の場合", () => {
      expect(calculateCurrentTurns(4)).toBe(2);
      expect(calculateCurrentTurns(6)).toBe(3);
    });

    it("正しいターン数を計算する - 奇数の場合", () => {
      expect(calculateCurrentTurns(3)).toBe(2);
      expect(calculateCurrentTurns(5)).toBe(3);
    });
  });

  describe("shouldEndSession", () => {
    it("怒りが最大値に達した場合はtrueを返す", () => {
      const angryMetrics = {
        ...baseMetrics,
        angerLevel: dialogueConfig.METRICS_MAX,
      };
      expect(
        shouldEndSession(
          angryMetrics,
          5,
          baseGoalStatuses,
          baseGoals,
          baseScenario,
        ),
      ).toBe(true);
    });

    it("すべてのゴールが達成された場合はtrueを返す", () => {
      const allGoalsAchieved = [
        { goalId: "goal1", achieved: true, progress: 100 },
        { goalId: "goal2", achieved: true, progress: 100 },
      ];
      expect(
        shouldEndSession(
          baseMetrics,
          5,
          allGoalsAchieved,
          baseGoals,
          baseScenario,
        ),
      ).toBe(true);
    });

    it("ターン数に関係なくfalseを返す（時間制限で管理）", () => {
      // ターン数ベースの終了判定は廃止。多数のメッセージでもfalse
      expect(
        shouldEndSession(
          baseMetrics,
          100,
          baseGoalStatuses,
          baseGoals,
          baseScenario,
        ),
      ).toBe(false);
    });

    it("他の条件が満たされていない場合はfalseを返す", () => {
      expect(
        shouldEndSession(
          baseMetrics,
          6,
          baseGoalStatuses,
          baseGoals,
          baseScenario,
        ),
      ).toBe(false);
    });
  });

  describe("getSessionEndReason", () => {
    it("怒りが最大値に達した場合は怒りに関するメッセージを返す", () => {
      const angryMetrics = {
        ...baseMetrics,
        angerLevel: dialogueConfig.METRICS_MAX,
      };
      const reason = getSessionEndReason(
        angryMetrics,
        5,
        baseGoalStatuses,
        baseGoals,
        baseScenario,
      );
      expect(reason).toContain("不快");
    });

    it("すべてのゴールが達成された場合はゴール達成に関するメッセージを返す", () => {
      const allGoalsAchieved = [
        { goalId: "goal1", achieved: true, progress: 100 },
        { goalId: "goal2", achieved: true, progress: 100 },
      ];
      const reason = getSessionEndReason(
        baseMetrics,
        5,
        allGoalsAchieved,
        baseGoals,
        baseScenario,
      );
      expect(reason).toContain("すべての商談目標を達成");
    });

    it("他の条件が満たされていない場合は時間終了メッセージを返す", () => {
      const reason = getSessionEndReason(
        baseMetrics,
        6,
        baseGoalStatuses,
        baseGoals,
        baseScenario,
      );
      expect(reason).toContain("商談時間が終了");
    });
  });
});
