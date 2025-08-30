import React from "react";
import {
  Box,
  Typography,
  Chip,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

/**
 * メッセージの型定義
 */
interface Message {
  message: string;
  related: boolean;
  relatedDocument?: string;
  reviewComment?: string;
}

/**
 * メッセージアコーディオンのプロパティ
 */
interface MessageAccordionProps {
  message: Message;
  index: number;
}

/**
 * メッセージの状態に応じたプロパティを取得
 * @param message メッセージオブジェクト
 * @param t 翻訳関数
 * @returns メッセージプロパティ
 */
const getMessageProps = (
  message: { related: boolean },
  t: (key: string, defaultValue: string) => string,
) => {
  if (message.related) {
    return {
      color: "success" as const,
      icon: <CheckCircleIcon />,
      label: t("referenceCheck.status.success", "適切"),
    };
  } else {
    return {
      color: "warning" as const,
      icon: <WarningIcon />,
      label: t("referenceCheck.status.issue", "問題あり"),
    };
  }
};

/**
 * メッセージアコーディオンコンポーネント
 */
const MessageAccordion: React.FC<MessageAccordionProps> = ({
  message,
  index,
}) => {
  const { t } = useTranslation();
  const messageProps = getMessageProps(message, t);

  return (
    <Accordion sx={{ mb: 2 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display="flex" alignItems="center" gap={2} sx={{ width: "100%" }}>
          <Box display="flex" alignItems="center" gap={1}>
            {messageProps.icon}
            <Typography variant="subtitle1">
              {t("referenceCheck.messageNumber", "メッセージ {{number}}", {
                number: index + 1,
              })}
            </Typography>
          </Box>
          <Chip
            label={messageProps.label}
            color={messageProps.color}
            size="small"
            variant="outlined"
          />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box>
          {/* ユーザーメッセージ */}
          <Paper sx={{ p: 2, mb: 2, bgcolor: "#e3f2fd" }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              {t("referenceCheck.userMessage", "ユーザーの発言")}
            </Typography>
            <Typography variant="body2">{message.message}</Typography>
          </Paper>

          {/* 関連ドキュメント */}
          <Paper sx={{ p: 2, mb: 2, bgcolor: "#f5f5f5" }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {t("referenceCheck.relatedDocument", "関連ドキュメント")}
            </Typography>
            <Typography variant="body2">
              {message.relatedDocument || "N/A"}
            </Typography>
          </Paper>

          {/* レビューコメント */}
          <Paper
            sx={{
              p: 2,
              bgcolor: message.related ? "#e8f5e8" : "#fff3e0",
            }}
          >
            <Typography
              variant="subtitle2"
              color={messageProps.color}
              gutterBottom
            >
              {t("referenceCheck.reviewComment", "レビューコメント")}
            </Typography>
            <Typography variant="body2">
              {message.reviewComment || "N/A"}
            </Typography>
          </Paper>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default MessageAccordion;
