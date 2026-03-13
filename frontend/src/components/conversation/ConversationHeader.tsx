import React from "react";
import { Box, Typography, IconButton, Button, Chip, Tooltip } from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Stop as StopIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { Scenario } from "../../types/index";
import { useTranslation } from "react-i18next";

interface ConversationHeaderProps {
  scenario: Scenario;
  sessionStarted: boolean;
  sessionEnded: boolean;
  onManualEnd: () => void;
  messageCount: number;
  /** セッション経過時間（秒） */
  sessionRemainingSeconds?: number | null;
  /** 時間制限警告中かどうか（未使用、後方互換性のため残す） */
  sessionTimeWarning?: boolean;
  onToggleRightPanels?: () => void;
  onToggleMetrics?: () => void;
  onOpenSettings?: () => void;
  rightPanelsVisible?: boolean;
  metricsVisible?: boolean;
}

/**
 * 会話ページのヘッダーコンポーネント
 * アクションボタン群（📋📊🔊）とセッション終了ボタンを含む
 */
const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  scenario,
  sessionStarted,
  sessionEnded,
  onManualEnd,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  messageCount,
  sessionRemainingSeconds,
  onToggleRightPanels,
  onToggleMetrics,
  onOpenSettings,
  rightPanelsVisible,
  metricsVisible,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // 経過時間のフォーマット（mm:ss）
  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 2,
        py: 1.25,
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        zIndex: 50,
      }}
    >
      {/* 戻るボタン */}
      <IconButton
        onClick={() => navigate("/scenarios")}
        aria-label={t("navigation.back")}
        size="small"
        sx={{
          width: 36,
          height: 36,
          backgroundColor: "#f3f4f6",
          "&:hover": { backgroundColor: "#e5e7eb" },
        }}
      >
        <ArrowBackIcon fontSize="small" />
      </IconButton>

      {/* シナリオ情報 */}
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            sx={{ fontWeight: 700, fontSize: "0.9375rem" }}
            color="primary"
          >
            {scenario.title}
          </Typography>
          <Chip
            label={scenario.difficulty}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.6875rem",
              fontWeight: 600,
            }}
            color="warning"
            variant="outlined"
          />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {scenario.npc.name} (
          {t("conversation.npcRole", { role: scenario.npc.role })})
        </Typography>
      </Box>

      {/* 経過時間表示 */}
      {sessionStarted && !sessionEnded && sessionRemainingSeconds != null && (
        <Chip
          label={`⏱ ${formatElapsedTime(sessionRemainingSeconds)}`}
          color="default"
          variant="outlined"
          size="small"
          aria-label={t("conversation.elapsedTime", { time: formatElapsedTime(sessionRemainingSeconds) })}
        />
      )}

      {/* アクションボタン群 */}
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {onToggleRightPanels && (
          <Tooltip title={t("conversation.header.toggleRightPanels")}>
            <IconButton
              onClick={onToggleRightPanels}
              aria-label={t("conversation.header.toggleRightPanels")}
              aria-pressed={rightPanelsVisible}
              size="small"
              sx={{
                width: 36,
                height: 36,
                fontSize: "1.125rem",
                backgroundColor: rightPanelsVisible ? "action.selected" : "transparent",
                "&:hover": { backgroundColor: "#f3f4f6" },
              }}
            >
              📋
            </IconButton>
          </Tooltip>
        )}
        {onToggleMetrics && (
          <Tooltip title={t("conversation.header.toggleMetrics")}>
            <IconButton
              onClick={onToggleMetrics}
              aria-label={t("conversation.header.toggleMetrics")}
              aria-pressed={metricsVisible}
              size="small"
              sx={{
                width: 36,
                height: 36,
                fontSize: "1.125rem",
                backgroundColor: metricsVisible ? "action.selected" : "transparent",
                "&:hover": { backgroundColor: "#f3f4f6" },
              }}
            >
              📊
            </IconButton>
          </Tooltip>
        )}
        {onOpenSettings && (
          <Tooltip title={t("conversation.header.openSettings")}>
            <IconButton
              onClick={onOpenSettings}
              aria-label={t("conversation.header.openSettings")}
              size="small"
              sx={{
                width: 36,
                height: 36,
                fontSize: "1.125rem",
                "&:hover": { backgroundColor: "#f3f4f6" },
              }}
            >
              ⚙️
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* セッション終了ボタン - 常に表示 */}
      {sessionStarted && (
        <Button
          variant="outlined"
          startIcon={<StopIcon />}
          onClick={onManualEnd}
          color="secondary"
          size="small"
        >
          {t("conversation.header.endSession")}
        </Button>
      )}
    </Box>
  );
};

export default ConversationHeader;
