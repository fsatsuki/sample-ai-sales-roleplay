import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Person as PersonIcon,
  Support as SupportIcon,
  Info as InfoIcon,
  Close as CloseIcon,
  ArrowForward as ArrowForwardIcon,
  ContentCopy as ContentCopyIcon,
} from "@mui/icons-material";

import { getDemoStoryById } from "../utils/demoStory";

interface DemoGuideProps {
  demoId: string;
  onClose?: () => void;
}

const DemoGuide: React.FC<DemoGuideProps> = ({ demoId, onClose }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const demo = getDemoStoryById(demoId);

  if (!demo) {
    return <Typography color="error">デモが見つかりません</Typography>;
  }

  const handleNext = () => {
    setActiveStep((prevActiveStep) =>
      Math.min(prevActiveStep + 1, demo.steps.length - 1),
    );
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => Math.max(prevActiveStep - 1, 0));
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        // コピー成功時のフィードバック
        alert("テキストをコピーしました");
      })
      .catch((err) => {
        console.error("テキストのコピーに失敗しました:", err);
      });
  };

  return (
    <Card sx={{ mx: 2, mb: 3 }}>
      <CardContent>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
        >
          <Typography
            variant="h6"
            component="h2"
            fontWeight="bold"
            color="primary"
          >
            {demo.title}
          </Typography>

          <Box>
            <Tooltip title="デモガイドについて">
              <IconButton onClick={() => setHelpDialogOpen(true)} size="small">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {onClose && (
              <Tooltip title="閉じる">
                <IconButton onClick={onClose} size="small">
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" mb={3}>
          {demo.description}
        </Typography>

        <Divider sx={{ mb: 3 }} />

        <Stepper activeStep={activeStep} orientation="vertical" sx={{ mb: 3 }}>
          {demo.steps.map((step, index) => (
            <Step key={index}>
              <StepLabel
                icon={
                  step.speaker === "user" ? <PersonIcon /> : <SupportIcon />
                }
              >
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="subtitle2">
                    {step.speaker === "user" ? "あなた" : "NPC"}
                  </Typography>
                  {step.explanation && (
                    <Tooltip title={step.explanation}>
                      <InfoIcon fontSize="small" color="action" />
                    </Tooltip>
                  )}
                </Box>
              </StepLabel>
              <StepContent>
                <Box display="flex" flexDirection="column" gap={1}>
                  <Typography variant="body1" mb={1}>
                    {step.message}
                  </Typography>

                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ContentCopyIcon />}
                      onClick={() => handleCopyText(step.message)}
                    >
                      コピー
                    </Button>
                  </Box>

                  {step.expectedMetricsChange && (
                    <Box mt={1} pt={1} borderTop="1px dashed #eee">
                      <Typography variant="caption" color="text.secondary">
                        期待される効果:
                      </Typography>
                      <Box display="flex" gap={1} mt={0.5}>
                        {step.expectedMetricsChange.angerLevel && (
                          <Chip
                            label={`😡 ${step.expectedMetricsChange.angerLevel > 0 ? "+" : ""}${step.expectedMetricsChange.angerLevel}`}
                            size="small"
                            color={
                              step.expectedMetricsChange.angerLevel > 0
                                ? "error"
                                : "default"
                            }
                            variant="outlined"
                          />
                        )}
                        {step.expectedMetricsChange.trustLevel && (
                          <Chip
                            label={`🤝 ${step.expectedMetricsChange.trustLevel > 0 ? "+" : ""}${step.expectedMetricsChange.trustLevel}`}
                            size="small"
                            color={
                              step.expectedMetricsChange.trustLevel > 0
                                ? "success"
                                : "default"
                            }
                            variant="outlined"
                          />
                        )}
                        {step.expectedMetricsChange.progressLevel && (
                          <Chip
                            label={`📈 ${step.expectedMetricsChange.progressLevel > 0 ? "+" : ""}${step.expectedMetricsChange.progressLevel}`}
                            size="small"
                            color={
                              step.expectedMetricsChange.progressLevel > 0
                                ? "info"
                                : "default"
                            }
                            variant="outlined"
                          />
                        )}
                      </Box>
                    </Box>
                  )}

                  {step.explanation && (
                    <Box mt={1} p={1.5} bgcolor="#f9f9f9" borderRadius={1}>
                      <Typography variant="body2" color="text.secondary">
                        <InfoIcon
                          fontSize="small"
                          sx={{ verticalAlign: "middle", mr: 0.5 }}
                        />
                        {step.explanation}
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ mb: 2, mt: 1 }}>
                    <div>
                      <Button
                        disabled={index === 0}
                        onClick={handleBack}
                        sx={{ mt: 1, mr: 1 }}
                      >
                        戻る
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handleNext}
                        sx={{ mt: 1, mr: 1 }}
                        endIcon={<ArrowForwardIcon />}
                        disabled={index === demo.steps.length - 1}
                      >
                        次へ
                      </Button>
                    </div>
                  </Box>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </CardContent>

      {/* ヘルプダイアログ */}
      <Dialog open={helpDialogOpen} onClose={() => setHelpDialogOpen(false)}>
        <DialogTitle>デモガイドについて</DialogTitle>
        <DialogContent>
          <DialogContentText>
            このデモガイドは、効果的な営業シナリオの進め方の例を示しています。
            各ステップには説明と期待される効果が記載されていますので、実際の対話の参考にしてください。
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            <strong>使い方</strong>
          </DialogContentText>
          <DialogContentText>
            1. ステップごとに表示される文章例を参考にしてください
            <br />
            2.
            「コピー」ボタンでテキストをコピーし、入力欄に貼り付けることができます
            <br />
            3.
            各ステップの説明や期待される効果を参考に、効果的な営業トークを学んでください
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpDialogOpen(false)}>閉じる</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default DemoGuide;
