import React from "react";
import { Box, Typography, IconButton, Button, Chip } from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Stop as StopIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { Scenario } from "../../types/index";
import { useTranslation } from "react-i18next";
import { calculateCurrentTurns } from "../../utils/dialogueEngine";

interface ConversationHeaderProps {
  scenario: Scenario;
  sessionStarted: boolean;
  sessionEnded: boolean;
  onManualEnd: () => void;
  messageCount: number; // メッセージ数を追加
}

/**
 * 会話ページのヘッダーコンポーネント
 */
const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  scenario,
  sessionStarted,
  sessionEnded,
  onManualEnd,
  messageCount,
}) => {
  // 現在のターン数と最大ターン数
  const currentTurns = sessionStarted ? calculateCurrentTurns(messageCount) : 0;
  const maxTurns = scenario.maxTurns || 10; // デフォルトは10ターン
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      mb={2}
    >
      <Box display="flex" alignItems="center" gap={2}>
        <IconButton
          onClick={() => navigate("/scenarios")}
          aria-label={t("navigation.back")}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h6" color="primary">
            {scenario.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {scenario.npc.name} (
            {t("conversation.npcRole", { role: scenario.npc.role })})
          </Typography>
        </Box>
      </Box>

      <Box display="flex" alignItems="center" gap={2}>
        {/* ターン数表示 */}
        {sessionStarted && !sessionEnded && (
          <Chip
            label={`${t("conversation.turn")}: ${currentTurns} / ${maxTurns}`}
            color={currentTurns >= maxTurns - 2 ? "warning" : "default"}
            variant="outlined"
            size="small"
          />
        )}

        {sessionStarted && !sessionEnded && (
          <Button
            variant="outlined"
            startIcon={<StopIcon />}
            onClick={onManualEnd}
            color="secondary"
          >
            {t("conversation.endConversation")}
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default ConversationHeader;
