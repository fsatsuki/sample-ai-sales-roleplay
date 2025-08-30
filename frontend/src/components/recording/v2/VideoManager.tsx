import React, { useState, useEffect } from "react";
import { Box } from "@mui/material";
import VideoRecorder from "./VideoRecorder";

interface VideoManagerProps {
  sessionId: string;
  sessionStarted: boolean;
  sessionEnded: boolean;
}

/**
 * ビデオ録画管理コンポーネント
 * セッションのライフサイクル全体を通じてビデオ録画の状態を管理します。
 * このコンポーネントは商談ページ内で常に表示され続けるため、
 * 商談開始時のコンポーネント再マウントの問題を回避します。
 */
const VideoManager: React.FC<VideoManagerProps> = ({
  sessionId,
  sessionStarted,
  sessionEnded,
}) => {
  const [videoKey, setVideoKey] = useState<string>("");
  const [recordingError, setRecordingError] = useState<string>("");

  // sessionIdの変化をログ出力
  useEffect(() => {
    console.log(
      "VideoManager: sessionId変更:",
      sessionId,
      "sessionStarted:",
      sessionStarted,
      "sessionEnded:",
      sessionEnded,
    );
  }, [sessionId, sessionStarted, sessionEnded]);

  // 録画完了時の処理
  const handleRecordingComplete = (key: string) => {
    console.log(`録画完了: ${key}`);
    setVideoKey(key);

    // セッション情報に録画キーを関連付けて保存
    localStorage.setItem(`session_${sessionId}_videoKey`, key);
    localStorage.setItem("lastRecordingKey", key);
  };

  // エラー処理
  const handleRecordingError = (error: string) => {
    console.error(`録画エラー: ${error}`);
    setRecordingError(error);
  };

  // videoKey が変更されたときにコンソールに記録
  useEffect(() => {
    if (videoKey) {
      console.log(`VideoManager: 新しいvideoKey設定: ${videoKey}`);
    }
  }, [videoKey]);

  return (
    <Box>
      {/* 
        VideoRecorderコンポーネントはマウントされたままで、
        isActiveプロパティによって録画のON/OFFを制御します
      */}
      <VideoRecorder
        sessionId={sessionId}
        isActive={sessionStarted && !sessionEnded && sessionId !== ""}
        onRecordingComplete={handleRecordingComplete}
        onError={handleRecordingError}
      />

      {recordingError && (
        <Box
          mt={1}
          p={1}
          bgcolor="error.light"
          color="error.contrastText"
          borderRadius={1}
        >
          {recordingError}
        </Box>
      )}
    </Box>
  );
};

export default VideoManager;
