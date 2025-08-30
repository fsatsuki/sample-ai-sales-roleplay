import React from "react";
import { Box, TextField, Button, Tooltip } from "@mui/material";
import { Send as SendIcon, Mic as MicIcon } from "@mui/icons-material";
import SpeechRecognitionFeedback from "../SpeechRecognitionFeedback";
import { useTranslation } from "react-i18next";

interface MessageInputProps {
  userInput: string;
  setUserInput: (input: string) => void;
  sendMessage: () => void;
  isProcessing: boolean;
  isListening: boolean;
  speechRecognitionError: string | null;
  startSpeechRecognition: () => void;
  switchToTextInput: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  sessionStarted: boolean;
  sessionEnded: boolean;
}

/**
 * メッセージ入力コンポーネント
 */
const MessageInput: React.FC<MessageInputProps> = ({
  userInput,
  setUserInput,
  sendMessage,
  isProcessing,
  isListening,
  speechRecognitionError,
  startSpeechRecognition,
  switchToTextInput,
  handleKeyDown,
  sessionStarted,
  sessionEnded,
}) => {
  const { t } = useTranslation();

  if (!sessionStarted || sessionEnded) {
    return null;
  }

  // マイクボタンのツールチップテキスト
  const micTooltip = userInput
    ? t("conversation.input.continueVoice") // "音声入力を継続（既存のテキストは保持されます）"
    : t("conversation.input.startVoice"); // "音声入力を開始"

  return (
    <>
      {/* 音声認識フィードバック */}
      <SpeechRecognitionFeedback
        isListening={isListening}
        isProcessing={isProcessing}
        errorState={speechRecognitionError}
        onSwitchToTextInput={switchToTextInput}
      />

      {/* 入力エリア */}
      <Box display="flex" gap={2} mt={2}>
        <TextField
          fullWidth
          multiline
          maxRows={3}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("conversation.input.placeholder")}
          disabled={isProcessing || isListening}
        />
        <Box display="flex" flexDirection="column" gap={1}>
          <Tooltip title={t("conversation.input.send")} placement="top">
            <span>
              <Button
                variant="contained"
                onClick={sendMessage}
                disabled={!userInput.trim() || isProcessing || isListening}
                sx={{ minWidth: "auto", px: 3, flex: 1 }}
                aria-label={t("conversation.input.send")}
              >
                <SendIcon />
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={micTooltip} placement="top">
            <span>
              <Button
                variant="outlined"
                onClick={startSpeechRecognition}
                disabled={isProcessing || isListening}
                sx={{ minWidth: "auto", px: 3, flex: 1 }}
                color="secondary"
                aria-label={micTooltip}
              >
                <MicIcon />
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </>
  );
};

export default MessageInput;
