import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Box } from "@mui/material";
import type {
  Message,
  Metrics,
  Session,
  Goal,
  GoalStatus,
  Scenario,
} from "../types/index";
import type { 
  ComplianceViolation, 
  DifficultyLevel, 
  SpeechRecognitionEvent, 
  SpeechRecognitionErrorEvent 
} from "../types/api";
import type { CompositionEventType } from "../types/components";
import { shouldEndSession, getSessionEndReason } from "../utils/dialogueEngine";
import { ApiService } from "../services/ApiService";
import { AudioService } from "../services/AudioService";
import { LanguageService } from "../services/LanguageService";
import { PollyService } from "../services/PollyService";
import { getSpeechRecognitionLanguage } from "../i18n/utils/languageUtils";
import type { EmotionState } from "../types/index";
import {
  initializeGoalStatuses,
  calculateGoalScore,
  areAllRequiredGoalsAchieved,
} from "../utils/goalUtils";
import VideoManager from "../components/recording/v2/VideoManager";

// 分割したコンポーネントをインポート
import ConversationHeader from "../components/conversation/ConversationHeader";
import NPCInfoCard from "../components/conversation/NPCInfoCard";
import EmojiFeedbackContainer from "../components/conversation/EmojiFeedbackContainer";
import MessageList from "../components/conversation/MessageList";
import MessageInput from "../components/conversation/MessageInput";
import SidebarPanel from "../components/conversation/SidebarPanel";
import ComplianceAlert from "../components/compliance/ComplianceAlert";

/**
 * 会話ページコンポーネント
 */
const ConversationPage: React.FC = () => {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const navigate = useNavigate();

  // 状態管理
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<Metrics>({
    angerLevel: 0,
    trustLevel: 0,
    progressLevel: 0,
  });
  const [prevMetrics, setPrevMetrics] = useState<Metrics | null>(null);
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  // セッション開始後、コンポーネントの再マウントを防止するためのRef
  const hasComponentMounted = useRef(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  // アバターの表情状態管理用の状態変数
  const [currentEmotion, setCurrentEmotion] = useState<string>("neutral");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioVolume, setAudioVolume] = useState<number>(80);
  const [speechRate, setSpeechRate] = useState<number>(1.15);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognitionError, setSpeechRecognitionError] = useState<
    string | null
  >(null);
  const [metricsUpdating, setMetricsUpdating] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalStatuses, setGoalStatuses] = useState<GoalStatus[]>([]);
  // ゴールの達成スコア（セッション終了時に使用）
  const [goalScore, setGoalScore] = useState<number>(0);
  // コンプライアンス違反の通知管理
  const [activeViolation, setActiveViolation] =
    useState<ComplianceViolation | null>(null);
  const [showComplianceAlert, setShowComplianceAlert] =
    useState<boolean>(false);
  // カメラ初期化状態管理
  const [isCameraInitialized, setIsCameraInitialized] = useState<boolean>(false);


  // コンポーネントの初期マウント時のフラグ設定
  useEffect(() => {
    hasComponentMounted.current = true;
    // コンポーネントのマウント状態をログ出力
    console.log("ConversationPageコンポーネントがマウントされました");
  }, []);

  // 初期化
  useEffect(() => {
    const fetchScenario = async () => {
      if (scenarioId) {
        try {
          const apiService = ApiService.getInstance();
          const scenarioInfo = await apiService.getScenarioDetail(scenarioId);

          if (scenarioInfo) {
            console.log("取得したシナリオ情報:", scenarioInfo); // デバッグ用

            // APIから取得したScenarioInfo型をScenario型に変換
            const convertedScenario: Scenario = {
              id: scenarioInfo.scenarioId,
              title: scenarioInfo.title,
              description: scenarioInfo.description,
              difficulty: scenarioInfo.difficulty as DifficultyLevel,
              industry: scenarioInfo.category || scenarioInfo.industry || "",
              // シナリオに定義された初期メッセージと言語を反映
              initialMessage: scenarioInfo.initialMessage,
              language: scenarioInfo.language || "ja",
              npc: {
                // APIではnpcInfoではなくnpcフィールドが使われている可能性に対応
                id:
                  scenarioInfo.npc?.id ||
                  scenarioInfo.npcInfo?.id ||
                  `npc-${scenarioId}`,
                name:
                  scenarioInfo.npc?.name || scenarioInfo.npcInfo?.name || "",
                role:
                  scenarioInfo.npc?.role || scenarioInfo.npcInfo?.role || "",
                company:
                  scenarioInfo.npc?.company ||
                  scenarioInfo.npcInfo?.company ||
                  "",
                personality:
                  scenarioInfo.npc?.personality ||
                  scenarioInfo.npcInfo?.personality ||
                  [],
                avatar:
                  scenarioInfo.npc?.avatar ||
                  scenarioInfo.npcInfo?.avatar ||
                  "👤",
                description:
                  scenarioInfo.npc?.description ||
                  scenarioInfo.npcInfo?.description ||
                  "",
              },
              // 文字列型で返される可能性があるmaxTurnsを数値型に変換
              maxTurns:
                scenarioInfo.maxTurns !== undefined
                  ? Number(scenarioInfo.maxTurns)
                  : undefined,
              goals: (scenarioInfo.goals || []).map((goal) => {
                // goalが文字列の場合はオブジェクトに変換
                if (typeof goal === "string") {
                  return {
                    id: `goal-${Math.random().toString(36).substr(2, 9)}`,
                    description: goal,
                    priority: 3,
                    criteria: [],
                    isRequired: false,
                  };
                }
                // goalがオブジェクトの場合は必要なプロパティを確認
                return {
                  id:
                    goal.id ||
                    `goal-${Math.random().toString(36).substr(2, 9)}`,
                  description: goal.description || "",
                  priority: Number(goal.priority || 3),
                  criteria: goal.criteria || [],
                  isRequired: Boolean(goal.isRequired),
                };
              }),
              initialMetrics: {
                // 文字列型の場合は数値に変換する
                angerLevel: Number(
                  scenarioInfo.initialMetrics?.angerLevel || 1,
                ),
                trustLevel: Number(
                  scenarioInfo.initialMetrics?.trustLevel || 1,
                ),
                progressLevel: Number(
                  scenarioInfo.initialMetrics?.progressLevel || 1,
                ),
              },
            };

            setScenario(convertedScenario);
            setCurrentMetrics(convertedScenario.initialMetrics);

            // ゴール情報の初期化
            setGoals(
              convertedScenario.goals && convertedScenario.goals.length > 0
                ? convertedScenario.goals
                : []
            );
            const initialGoalStatuses =
              initializeGoalStatuses(convertedScenario);
            setGoalStatuses(initialGoalStatuses);

            // AudioServiceの初期設定
            const audioSvc = AudioService.getInstance();
            audioSvc.setAudioEnabled(audioEnabled);
            audioSvc.setVolume(audioVolume / 100);
          } else {
            navigate("/scenarios");
          }
        } catch (error) {
          console.error("シナリオ情報の取得に失敗しました:", error);
          navigate("/scenarios");
        }
      }
    };

    fetchScenario();
  }, [scenarioId, navigate, audioEnabled, audioVolume]);

  // メトリクス更新の初期化
  useEffect(() => {
    if (scenario) {
      // メトリクスは直接APIから取得します
      console.log("メトリクス更新の初期化");
    }
  }, [scenario]);

  // 音声設定変更時の処理
  useEffect(() => {
    const audioSvc = AudioService.getInstance();
    audioSvc.setAudioEnabled(audioEnabled);
    audioSvc.setVolume(audioVolume / 100);
  }, [audioEnabled, audioVolume]);

  // 読み上げ速度変更時の処理
  useEffect(() => {
    const pollySvc = PollyService.getInstance();
    pollySvc.setSpeechRate(speechRate);
  }, [speechRate]);

  // シナリオ言語に応じたUI言語の設定
  useEffect(() => {
    if (scenario?.language) {
      const languageService = LanguageService.getInstance();
      const currentLang = languageService.getCurrentLanguage();

      // シナリオの言語がUIの言語と異なる場合、UI言語も変更する
      if (scenario.language !== currentLang) {
        console.log(
          `シナリオの言語(${scenario.language})に合わせてUI言語を変更します`,
        );
        languageService
          .changeLanguage(scenario.language)
          .catch((err) => console.error("言語設定の変更に失敗しました:", err));
      }
    }
  }, [scenario?.language]);

  // 商談開始
  // 録画関連のstateは、VideoManagerコンポーネントに移動

  // 商談開始（カメラを起動して録画も開始）
  const startConversation = async () => {
    if (!scenario) return;

    // React 18のStrictモードで二重レンダリングを防止
    if (sessionStarted) {
      console.log("商談はすでに開始されています");
      return;
    }

    // フロントエンド側でセッションIDを生成
    const newSessionId = crypto.randomUUID();
    console.log("新しいセッションIDを生成:", newSessionId);

    // セッションIDを先に設定し、状態更新を確実に行う
    setSessionId(newSessionId);

    // 短い遅延を入れてセッションIDの状態更新を確実に反映させる
    setTimeout(() => {
      console.log("セッション開始状態を更新 - sessionId:", newSessionId);
      setSessionStarted(true);
    }, 50);

    // シナリオに定義された初期メッセージがある場合はそれを使用、なければデフォルトメッセージを表示
    const initialContent =
      scenario?.initialMessage ||
      `こんにちは。${scenario?.npc.company}の${scenario?.npc.name}です。本日はお忙しい中、お時間をいただきありがとうございます。どのようなご提案でしょうか？`;

    // 少し遅延してからメッセージを追加（レンダリング安定化のため）
    setTimeout(() => {
      const initialMessageId = crypto.randomUUID();

      const initialMessage: Message = {
        id: initialMessageId,
        sender: "npc",
        content: initialContent,
        timestamp: new Date(),
        metrics: currentMetrics,
      };

      setMessages([initialMessage]);
      setCurrentEmotion("neutral");
    }, 100); // 100ms遅延させる

    // 初期メッセージの音声合成
    if (audioEnabled) {
      setIsSpeaking(true);
      const audioSvc = AudioService.getInstance();
      const initialMessageId = crypto.randomUUID();
      audioSvc
        .synthesizeAndQueueAudio(initialContent, initialMessageId)
        .catch((error) => {
          console.error("初期メッセージの音声合成エラー:", error);
          const synth = window.speechSynthesis;
          if (synth) {
            const utterance = new SpeechSynthesisUtterance(initialContent);
            utterance.lang = "ja-JP";
            utterance.onend = () => setIsSpeaking(false);
            synth.speak(utterance);
          }
        });
    }
  };

  // メッセージ送信
  const sendMessage = async () => {
    if (!userInput.trim() || !scenario || isProcessing) return;

    setIsProcessing(true);

    // ユーザーメッセージを追加
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sender: "user",
      content: userInput.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setUserInput("");

    // メッセージ送信時に一時的に感情状態を更新
    // ユーザーが入力している間は中立的な状態にする
    setCurrentEmotion("neutral");

    // NPCの応答を生成
    setTimeout(
      async () => {
        console.log("=== ConversationPage: NPC応答生成開始 ===");
        console.log("userInput:", userInput.trim());
        console.log("currentMetrics:", currentMetrics);
        console.log("scenario.npc:", scenario.npc);

        try {
          const apiService = ApiService.getInstance();
          // セッションIDとメッセージIDを追加
          const messageId = crypto.randomUUID();
          // フロントエンドで生成されたセッションIDを使用
          const currentSessionId = sessionId;

          // /bedrock/conversation エンドポイントからメトリクス出力を廃止したため、デフォルトのメトリクスを使用
          const result = await apiService.chatWithNPC(
            userInput.trim(),
            scenario.npc,
            updatedMessages,
            currentSessionId,
            messageId,
            // 感情パラメータを追加
            {
              angerLevel: currentMetrics.angerLevel,
              trustLevel: currentMetrics.trustLevel,
              progressLevel: currentMetrics.progressLevel,
            },
            // シナリオIDを追加
            scenario.id,
          );

          const { response } = result;

          // フロントエンドで生成されたセッションIDを使用
          const activeSessionId = sessionId;

          // メトリクスは現在の値を維持
          const newMetrics = { ...currentMetrics };

          console.log("=== API応答受信 ===");
          console.log("response:", response);
          console.log("newMetrics:", newMetrics);
          console.log("activeSessionId:", activeSessionId);

          const npcMessage: Message = {
            id: crypto.randomUUID(),
            sender: "npc",
            content: response,
            timestamp: new Date(),
            metrics: newMetrics,
          };

          // 話している状態を開始
          setIsSpeaking(true);

          const finalMessages = [...updatedMessages, npcMessage];
          setMessages(finalMessages);
          setCurrentMetrics(newMetrics);

          // Amazon Polly で音声合成
          if (audioEnabled) {
            const audioService = AudioService.getInstance();
            audioService
              .synthesizeAndQueueAudio(response, messageId)
              .catch((error) => {
                console.error("Amazon Polly音声合成エラー:", error);
              });
          }

          // NPCの応答後にリアルタイム評価を実行（有効なsessionIDがある場合のみ）
          if (activeSessionId) {
            try {
              console.log(
                "リアルタイム評価API呼び出し開始",
                "activeSessionId:",
                activeSessionId,
              );
              const evaluationResult = await apiService.getRealtimeEvaluation(
                userInput.trim(),
                finalMessages,
                activeSessionId, // 正しいセッションIDを使用
                goalStatuses,
                goals,
                scenario.id, // シナリオIDを追加
                scenario.language, // シナリオの言語設定を追加
              );

              // コンプライアンスチェック結果の確認
              if (
                evaluationResult.compliance &&
                evaluationResult.compliance.violations &&
                evaluationResult.compliance.violations.length > 0
              ) {
                // 最も重大度の高い違反を表示
                const sortedViolations = [
                  ...evaluationResult.compliance.violations,
                ].sort((a, b) => {
                  const severityOrder: Record<
                    "high" | "medium" | "low",
                    number
                  > = { high: 3, medium: 2, low: 1 };
                  return (
                    severityOrder[b.severity as "high" | "medium" | "low"] -
                    severityOrder[a.severity as "high" | "medium" | "low"]
                  );
                });

                // 最も重大な違反を通知用に設定
                setActiveViolation(sortedViolations[0]);
                setShowComplianceAlert(true);

                console.log("コンプライアンス違反を検出:", sortedViolations[0]);
              }

              if (evaluationResult) {
                // 前回のメトリクスを保存
                setPrevMetrics(currentMetrics);

                // 新しいメトリクスを設定
                setCurrentMetrics((prevMetrics) => ({
                  ...prevMetrics,
                  angerLevel:
                    evaluationResult.scores?.angerLevel ||
                    prevMetrics.angerLevel,
                  trustLevel:
                    evaluationResult.scores?.trustLevel ||
                    prevMetrics.trustLevel,
                  progressLevel:
                    evaluationResult.scores?.progressLevel ||
                    prevMetrics.progressLevel,
                  analysis: evaluationResult.analysis || prevMetrics.analysis,
                }));

                // 更新中の状態を表示
                setMetricsUpdating(true);
                setTimeout(() => setMetricsUpdating(false), 1000);

                // ゴールステータス更新
                if (evaluationResult.goalStatuses) {
                  setGoalStatuses(evaluationResult.goalStatuses);
                  setGoalScore(
                    calculateGoalScore(evaluationResult.goalStatuses, goals),
                  );
                }
              }
            } catch (error) {
              console.error("リアルタイム評価API呼び出しエラー:", error);
            }
          }

          // 発言の長さに応じて話している状態をシミュレート（音声合成が終わる前に状態を更新）
          setTimeout(() => {
            setIsProcessing(false);
            // 話している状態は音声再生の状態に応じて設定されるため、ここでは変更しない
          }, response.length * 20); // テキストの長さに比例した時間（短縮）

          // セッション終了の判定
          if (
            scenario &&
            shouldEndSession(
              newMetrics,
              finalMessages.length,
              goalStatuses,
              goals,
              scenario,
            )
          ) {
            setTimeout(async () => {
              await endSession(finalMessages, newMetrics);
            }, 2000);
          }
        } catch (error) {
          console.error("=== ConversationPage: API呼び出しエラー ===");
          console.error("エラー詳細:", error);

          // エラー時はセッションを終了
          setIsProcessing(false);
          console.error("API呼び出しエラーのため、セッションを終了します");
          throw error; // エラーを再スロー
        }
      },
      1000 + Math.random() * 1000,
    ); // 1-2秒の遅延でリアル感を演出
  };

  /**
   * セッション終了処理
   *
   * 会話セッションを終了し、結果ページに遷移する
   *
   * @param finalMessages 最終的なメッセージリスト
   * @param finalMetrics 最終的なメトリクス
   */
  const endSession = useCallback(
    async (finalMessages: Message[], finalMetrics: Metrics) => {
      console.log("セッション終了処理を開始します");
      setSessionEnded(true);

      // 最終的なゴールスコアを計算
      const finalGoalScore = calculateGoalScore(goalStatuses, goals);
      setGoalScore(finalGoalScore);

      // 終了理由を取得
      const endReason = getSessionEndReason(
        finalMetrics,
        finalMessages.length,
        goalStatuses,
        goals,
        scenario || undefined,
      );

      // セッションデータを作成
      const session: Session = {
        id: sessionId,
        scenarioId: scenario!.id,
        startTime: new Date(Date.now() - finalMessages.length * 30000),
        endTime: new Date(),
        messages: finalMessages,
        finalMetrics,
        finalScore: 0,
        feedback: [],
        goalStatuses: goalStatuses,
        goalScore: goalScore,
        endReason: endReason,
      };

      // セッションデータをlocalStorageに保存
      localStorage.setItem(`session_${session.id}`, JSON.stringify(session));

      // 録画完了を確実に待つ処理を改善
      const waitForRecordingUpload = () => {
        return new Promise<void>((resolve) => {
          let uploadCompleted = false;
          
          // 60秒でタイムアウト（大きなファイル対応）
          const timeoutId = setTimeout(() => {
            console.warn("録画アップロード待機がタイムアウトしました");
            window.removeEventListener('recordingComplete', handleRecordingComplete as EventListener);
            resolve();
          }, 60000);

          const checkUploadComplete = () => {
            const videoKey = localStorage.getItem("lastRecordingKey");
            if (videoKey && !uploadCompleted) {
              uploadCompleted = true;
              console.log(`録画アップロード完了: ${videoKey}`);
              localStorage.setItem(`session_${session.id}_videoKey`, videoKey);
              clearTimeout(timeoutId);
              resolve();
            }
          };

          // 録画完了イベントリスナー
          const handleRecordingComplete = (event: CustomEvent) => {
            console.log("録画完了イベント受信:", event.detail);
            checkUploadComplete();
          };

          window.addEventListener('recordingComplete', handleRecordingComplete as EventListener);

          // 既に完了している場合もチェック
          checkUploadComplete();
        });
      };

      // 録画アップロード完了を待ってから遷移
      await waitForRecordingUpload();
      
      setTimeout(() => {
        navigate(`/result/${session.id}`);
      }, 1000);
    },
    [
      goals,
      goalStatuses,
      navigate,
      scenario,
      setGoalScore,
      setSessionEnded,
      goalScore,
      sessionId,
    ],
  );

  // 手動終了
  const handleManualEnd = async () => {
    if (messages.length > 0) {
      await endSession(messages, currentMetrics);
    } else {
      navigate("/scenarios");
    }
  };

  // Enter キー処理
  const handleKeyDown = (event: CompositionEventType) => {
    // IME入力中の場合は何もしない
    if (event.nativeEvent.isComposing || event.key === "Process") {
      return;
    }

    // Enterキーで送信（Shift + Enterは改行）
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  // 音声入力を開始
  const startSpeechRecognition = () => {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      setSpeechRecognitionError("not-supported");
      return;
    }

    try {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSpeechRecognitionError("not-supported");
        return;
      }
      const recognition = new SpeechRecognition();

      // シナリオの言語に基づいて音声認識の言語を設定
      const languageCode = scenario?.language || "ja";
      const speechRecognitionLang = getSpeechRecognitionLanguage(languageCode);
      console.log(
        `音声認識言語を設定: ${speechRecognitionLang} (シナリオ言語: ${languageCode})`,
      );
      recognition.lang = speechRecognitionLang;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechRecognitionError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        // 既存のテキストに追加する（既にテキストがある場合はスペースを挿入）
        setUserInput((prevInput) => {
          if (prevInput && prevInput.trim()) {
            return `${prevInput} ${transcript}`;
          }
          return transcript;
        });
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("音声認識エラー:", event.error);
        setIsListening(false);

        switch (event.error) {
          case "not-allowed":
            setSpeechRecognitionError("permission");
            break;
          case "no-speech":
            setSpeechRecognitionError("no-speech");
            break;
          case "network":
            setSpeechRecognitionError("network");
            break;
          default:
            setSpeechRecognitionError("unknown");
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // 音声認識が終了しても、テキストはクリアせず保持する
      };

      recognition.start();
    } catch (error) {
      console.error("音声認識の開始エラー:", error);
      setSpeechRecognitionError("unknown");
    }
  };

  // テキスト入力モードに切り替え
  const switchToTextInput = () => {
    setSpeechRecognitionError(null);
    setIsListening(false);
  };

  // 感情状態変化のハンドラー
  const handleEmotionChange = useCallback((emotion: EmotionState) => {
    console.log("感情状態変化:", emotion);
    setCurrentEmotion(emotion);
  }, []);

  // カメラ初期化状態のハンドラー
  const handleCameraInitialized = useCallback((initialized: boolean) => {
    console.log("カメラ初期化状態変更:", initialized);
    setIsCameraInitialized(initialized);
  }, []);

  // ゴール達成時の通知表示
  useEffect(() => {
    // 前回のゴール状態と比較して新たに達成されたゴールを検出
    const newlyAchievedGoals = goalStatuses.filter((status) => {
      if (!status.achieved) return false;
      const goal = goals.find((g) => g.id === status.goalId);
      return (
        goal &&
        status.achievedAt &&
        new Date(status.achievedAt).getTime() > Date.now() - 5000
      ); // 5秒以内に達成されたゴール
    });

    // 新たに達成されたゴールがある場合、通知を表示
    if (newlyAchievedGoals.length > 0) {
      const achievedGoal = newlyAchievedGoals[0];
      const goal = goals.find((g) => g.id === achievedGoal.goalId);

      if (goal) {
        // ここで通知を表示する処理を実装
        // 例: トースト通知やアラートなど
        console.log(`ゴール達成: ${goal.description}`);

        // 必須ゴールがすべて達成された場合、セッションを終了
        if (areAllRequiredGoalsAchieved(goalStatuses, goals)) {
          setTimeout(async () => {
            if (!sessionEnded && messages.length > 0) {
              await endSession(messages, currentMetrics);
            }
          }, 2000);
        }
      }
    }
  }, [goalStatuses, goals, messages, currentMetrics, sessionEnded, endSession]);

  if (!scenario) {
    return null;
  }

  // 録画完了時のハンドラー

  // 現在の感情状態を使用してレンダリングに影響を与えるためのクラス名を生成
  const emotionClassName = `emotion-${currentEmotion}`;

  return (
    <Container
      maxWidth="lg"
      className={`conversation-container ${emotionClassName}`}
      sx={{ py: 2, height: "100vh", display: "flex", flexDirection: "column" }}
    >
      {/* ヘッダー */}
      <ConversationHeader
        scenario={scenario}
        sessionStarted={sessionStarted}
        sessionEnded={sessionEnded}
        onManualEnd={handleManualEnd}
        messageCount={messages.length}
      />

      <Box
        display="flex"
        gap={2}
        flexGrow={1}
        minHeight={0}
        sx={{
          "@media (max-width: 1024px)": {
            flexDirection: "column",
          },
        }}
      >
        {/* メイン対話エリア */}
        <Box flexGrow={1} display="flex" flexDirection="column">
          {/* ヘッダー部分: NPC情報と絵文字フィードバックを横並びに */}
          <Box display="flex" gap={2} mb={2}>
            {/* NPC情報カード - 幅を制限 */}
            <Box flexGrow={1} maxWidth="60%">
              <NPCInfoCard npc={scenario.npc} />
            </Box>

            {/* 絵文字フィードバック表示エリア - 中央に配置 */}
            {sessionStarted && (
              <Box
                sx={{
                  width: "20%",
                  minWidth: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <EmojiFeedbackContainer
                  angerLevel={currentMetrics.angerLevel}
                  trustLevel={currentMetrics.trustLevel}
                  progressLevel={currentMetrics.progressLevel}
                  isSpeaking={isSpeaking}
                  onEmotionChange={handleEmotionChange}
                />
              </Box>
            )}

            {/* 録画コンポーネント - 右側に配置 */}
            <Box sx={{ width: "20%", minWidth: "100px" }}>
              {/* 新しいVideoManagerコンポーネントを使用 */}
              <VideoManager
                sessionId={sessionId}
                sessionStarted={sessionStarted}
                sessionEnded={sessionEnded}
                onCameraInitialized={handleCameraInitialized}
              />
            </Box>
          </Box>

          {/* メッセージエリア */}
          <MessageList
            messages={messages}
            isProcessing={isProcessing}
            sessionStarted={sessionStarted}
            sessionEnded={sessionEnded}
            currentMetrics={currentMetrics}
            scenario={scenario}
            onStartConversation={startConversation}
            isCameraInitialized={isCameraInitialized}
          />

          {/* メッセージ入力エリア */}
          {/* コンプライアンス違反通知 */}
          {showComplianceAlert && activeViolation && (
            <ComplianceAlert
              violation={activeViolation}
              open={showComplianceAlert}
              onClose={() => setShowComplianceAlert(false)}
            />
          )}

          <MessageInput
            userInput={userInput}
            setUserInput={setUserInput}
            sendMessage={sendMessage}
            isProcessing={isProcessing}
            isListening={isListening}
            speechRecognitionError={speechRecognitionError}
            startSpeechRecognition={startSpeechRecognition}
            switchToTextInput={switchToTextInput}
            handleKeyDown={handleKeyDown}
            sessionStarted={sessionStarted}
            sessionEnded={sessionEnded}
          />
        </Box>

        {/* サイドバー - 評価指標と録画 */}
        <Box display="flex" flexDirection="column" width="300px">
          <SidebarPanel
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            audioVolume={audioVolume}
            setAudioVolume={setAudioVolume}
            speechRate={speechRate}
            setSpeechRate={setSpeechRate}
            currentMetrics={currentMetrics}
            prevMetrics={prevMetrics}
            metricsUpdating={metricsUpdating}
            goals={goals}
            goalStatuses={goalStatuses}
          />
        </Box>
      </Box>
    </Container>
  );
};

export default ConversationPage;
