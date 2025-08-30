import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Dialog,
  Divider,
  CardActionArea,
  Stack,
} from "@mui/material";
import {
  School as SchoolIcon,
  PlayArrow as PlayArrowIcon,
  Close as CloseIcon,
} from "@mui/icons-material";

import DemoGuide from "./DemoGuide";

interface DemoStarterProps {
  onClose: () => void;
}

const DemoStarter: React.FC<DemoStarterProps> = ({ onClose }) => {
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);

  const demoOptions = [
    {
      id: "new-it-proposal-demo",
      title: "新規IT企業への提案",
      description:
        "IT企業の購買担当者に対するクラウドサービス提案のデモシナリオ",
      icon: "💻",
      difficulty: "上級",
      duration: "約8分",
    },
    {
      id: "healthcare-solution-demo",
      title: "医療機関向けソリューション",
      description: "病院での業務効率化と患者ケア向上のためのシステム提案デモ",
      icon: "🏥",
      difficulty: "中級",
      duration: "約6分",
    },
  ];

  const handleSelectDemo = (demoId: string) => {
    setSelectedDemo(demoId);
  };

  const handleCloseDemo = () => {
    setSelectedDemo(null);
  };

  return (
    <>
      <Card sx={{ maxWidth: 800, mx: "auto", my: 3 }}>
        <CardContent>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={3}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <SchoolIcon color="primary" />
              <Typography variant="h5" fontWeight="bold" color="primary">
                デモガイド
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              onClick={onClose}
              startIcon={<CloseIcon />}
            >
              閉じる
            </Button>
          </Box>

          <Typography variant="body1" paragraph>
            効果的な営業トークの進め方を学べるデモガイドです。
            以下のシナリオから選択して、ステップバイステップで成功する営業の流れを確認できます。
          </Typography>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" gutterBottom>
            シナリオを選択
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ mt: 1 }}
          >
            {demoOptions.map((demo) => (
              <Card
                component="div"
                variant="outlined"
                sx={{
                  width: { xs: "100%", sm: "50%" },
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.2s",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: 2,
                  },
                }}
                key={demo.id}
              >
                <CardActionArea
                  onClick={() => handleSelectDemo(demo.id)}
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                  }}
                >
                  <Box
                    sx={{
                      p: 3,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: "3rem",
                      backgroundColor: "action.hover",
                    }}
                  >
                    {demo.icon}
                  </Box>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" component="h3" gutterBottom>
                      {demo.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      paragraph
                    >
                      {demo.description}
                    </Typography>
                    <Box display="flex" justifyContent="space-between" mt={1}>
                      <Typography variant="caption" color="text.secondary">
                        難易度: {demo.difficulty}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {demo.duration}
                      </Typography>
                    </Box>
                  </CardContent>
                  <Box
                    sx={{
                      p: 1,
                      textAlign: "center",
                      borderTop: "1px solid #eee",
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="primary"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 0.5,
                        fontWeight: "medium",
                      }}
                    >
                      <PlayArrowIcon fontSize="small" />
                      デモを見る
                    </Typography>
                  </Box>
                </CardActionArea>
              </Card>
            ))}
          </Stack>

          <Box sx={{ mt: 4, p: 2, bgcolor: "#f5f5f5", borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              💡 <strong>ヒント:</strong>{" "}
              デモガイドではテキストをコピーして対話に利用できます。
              実際の対話では、顧客の反応に応じて臨機応変に対応することが重要です。
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 選択されたデモを表示するダイアログ */}
      <Dialog
        open={selectedDemo !== null}
        onClose={handleCloseDemo}
        maxWidth="md"
        fullWidth
      >
        {selectedDemo && (
          <DemoGuide demoId={selectedDemo} onClose={handleCloseDemo} />
        )}
      </Dialog>
    </>
  );
};

export default DemoStarter;
