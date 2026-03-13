import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  FormControlLabel,
  Switch,
  Box,
  Slider,
  RadioGroup,
  Radio,
  FormControl,
  FormLabel,
} from "@mui/material";
import {
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
  Person as PersonIcon,
  PersonOff as PersonOffIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

type EndpointingSensitivity = "HIGH" | "MEDIUM" | "LOW";

interface SessionSettingsPanelProps {
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  audioVolume: number;
  setAudioVolume: (volume: number) => void;
  speechRate: number;
  setSpeechRate: (rate: number) => void;
  // アバター表示トグル（セッション中のランタイム切替）
  avatarVisible?: boolean;
  setAvatarVisible?: (visible: boolean) => void;
  avatarEnabled?: boolean;
}

/**
 * セッション設定パネルコンポーネント
 * 音声設定、アバター表示切替、ターン検出感度を統合
 */
const SessionSettingsPanel: React.FC<SessionSettingsPanelProps> = ({
  audioEnabled,
  setAudioEnabled,
  audioVolume,
  setAudioVolume,
  speechRate,
  setSpeechRate,
  avatarVisible,
  setAvatarVisible,
  avatarEnabled,
}) => {
  const { t, i18n } = useTranslation();
  const [ready, setReady] = useState<boolean>(i18n.isInitialized);

  // endpointingSensitivity設定（localStorageで永続化）
  const [endpointingSensitivity, setEndpointingSensitivity] = useState<EndpointingSensitivity>(() => {
    const saved = localStorage.getItem('endpointingSensitivity') as EndpointingSensitivity | null;
    return saved || "MEDIUM";
  });

  // i18n初期化の完了を待つ
  useEffect(() => {
    if (!i18n.isInitialized) {
      const checkInit = () => {
        if (i18n.isInitialized) {
          setReady(true);
        } else {
          setTimeout(checkInit, 50);
        }
      };
      checkInit();
    }
  }, [i18n]);

  // endpointingSensitivity変更時にlocalStorageに保存
  const handleSensitivityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value as EndpointingSensitivity;
    setEndpointingSensitivity(value);
    localStorage.setItem('endpointingSensitivity', value);
  };

  // フォールバックテキスト（翻訳が読み込まれるまでの一時的なテキスト）
  const getDefaultText = (key: string): string => {
    const defaults: Record<string, string> = {
      "conversation.audioSettings.title": "音声設定",
      "conversation.audioSettings.outputOn": "音声出力 ON",
      "conversation.audioSettings.outputOff": "音声出力 OFF",
      "conversation.audioSettings.volume": `音量: ${audioVolume}%`,
      "conversation.audioSettings.speechRate": `読み上げ速度: ${speechRate.toFixed(1)}x`,
      "conversation.audioSettings.npcResponseNote": "※ NPCの応答が音声で再生されます",
      "conversation.settings.title": "設定",
      "conversation.settings.avatarOn": "3Dアバター表示 ON",
      "conversation.settings.avatarOff": "3Dアバター表示 OFF",
      "conversation.settings.endpointingSensitivity": "ターン検出感度",
      "conversation.settings.endpointingSensitivityHigh": "高（短い間で発話終了を検出）",
      "conversation.settings.endpointingSensitivityMedium": "中（標準）",
      "conversation.settings.endpointingSensitivityLow": "低（長い間を許容）",
      "conversation.settings.endpointingSensitivityNote": "※ 次回セッション開始時に反映されます",
    };
    return defaults[key] || key;
  };

  // 翻訳関数のラッパー - 初期化前はデフォルトテキストを返す
  const translate = (
    key: string,
    options?: Record<string, unknown>,
  ): string => {
    if (!ready) return getDefaultText(key);
    return t(key, options);
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        {/* アバター表示トグル（シナリオでアバターが有効な場合のみ表示） */}
        {avatarEnabled && setAvatarVisible && (
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={avatarVisible ?? false}
                  onChange={(e) => setAvatarVisible(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  {avatarVisible ? (
                    <PersonIcon fontSize="small" sx={{ mr: 1 }} />
                  ) : (
                    <PersonOffIcon fontSize="small" sx={{ mr: 1 }} />
                  )}
                  <Typography variant="body2">
                    {avatarVisible
                      ? translate("conversation.settings.avatarOn")
                      : translate("conversation.settings.avatarOff")}
                  </Typography>
                </Box>
              }
            />
          </Box>
        )}

        {/* 音声出力トグル */}
        <FormControlLabel
          control={
            <Switch
              checked={audioEnabled}
              onChange={(e) => setAudioEnabled(e.target.checked)}
              color="primary"
            />
          }
          label={
            <Box display="flex" alignItems="center">
              {audioEnabled ? (
                <VolumeUpIcon fontSize="small" sx={{ mr: 1 }} />
              ) : (
                <VolumeOffIcon fontSize="small" sx={{ mr: 1 }} />
              )}
              <Typography variant="body2">
                {audioEnabled
                  ? translate("conversation.audioSettings.outputOn")
                  : translate("conversation.audioSettings.outputOff")}
              </Typography>
            </Box>
          }
        />

        {audioEnabled && (
          <>
            <Box mt={2}>
              <Typography variant="body2" gutterBottom>
                {translate("conversation.audioSettings.volume", {
                  volume: audioVolume,
                })}
              </Typography>
              <Slider
                value={audioVolume}
                onChange={(_, value) => setAudioVolume(value as number)}
                aria-labelledby="audio-volume-slider"
                step={10}
                marks
                min={0}
                max={100}
              />
            </Box>

            <Box mt={2}>
              <Typography variant="body2" gutterBottom>
                {translate("conversation.audioSettings.speechRate", {
                  rate: speechRate.toFixed(1),
                })}
              </Typography>
              <Slider
                value={speechRate}
                onChange={(_, value) => setSpeechRate(value as number)}
                aria-labelledby="speech-rate-slider"
                step={0.1}
                marks={[
                  { value: 0.5, label: "0.5x" },
                  { value: 1.0, label: "1.0x" },
                  { value: 1.5, label: "1.5x" },
                  { value: 2.0, label: "2.0x" },
                ]}
                min={0.5}
                max={2.0}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value.toFixed(1)}x`}
              />
            </Box>
          </>
        )}

        {/* ターン検出感度設定（endpointingSensitivity） */}
        <Box mt={2}>
          <FormControl component="fieldset">
            <FormLabel component="legend" id="endpointing-sensitivity-label">
              <Typography variant="body2">
                {translate("conversation.settings.endpointingSensitivity")}
              </Typography>
            </FormLabel>
            <RadioGroup
              aria-labelledby="endpointing-sensitivity-label"
              value={endpointingSensitivity}
              onChange={handleSensitivityChange}
            >
              <FormControlLabel
                value="HIGH"
                control={<Radio size="small" />}
                label={
                  <Typography variant="body2">
                    {translate("conversation.settings.endpointingSensitivityHigh")}
                  </Typography>
                }
              />
              <FormControlLabel
                value="MEDIUM"
                control={<Radio size="small" />}
                label={
                  <Typography variant="body2">
                    {translate("conversation.settings.endpointingSensitivityMedium")}
                  </Typography>
                }
              />
              <FormControlLabel
                value="LOW"
                control={<Radio size="small" />}
                label={
                  <Typography variant="body2">
                    {translate("conversation.settings.endpointingSensitivityLow")}
                  </Typography>
                }
              />
            </RadioGroup>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.5 }}
            >
              {translate("conversation.settings.endpointingSensitivityNote")}
            </Typography>
          </FormControl>
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1 }}
        >
          {translate("conversation.audioSettings.npcResponseNote")}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default SessionSettingsPanel;
