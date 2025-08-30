import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Container,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Box,
  CircularProgress,
  Pagination,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  SelectChangeEvent,
} from "@mui/material";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import PersonIcon from "@mui/icons-material/Person";
import { useNavigate } from "react-router-dom";
import { ApiService } from "../../services/ApiService";
import { SessionInfo, ScenarioInfo } from "../../types/api";
import { AuthService } from "../../services/AuthService";

/**
 * セッション履歴一覧ページ
 * ユーザーの過去の会話セッション一覧を表示します
 */
const SessionHistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const apiService = ApiService.getInstance();
  const authService = AuthService.getInstance();

  // 状態管理
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [tokenHistory, setTokenHistory] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [scenarioFilter, setScenarioFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 1ページあたりの表示数
  const ITEMS_PER_PAGE = 10;

  // 初期データ読み込み
  useEffect(() => {
    const initializeData = async () => {
      try {
        // ユーザー情報を取得
        const currentUser = await authService.getCurrentUser();

        // ユーザーがログインしている場合のみデータをロード
        if (currentUser) {
          loadSessions();
          loadScenarios();
        }
      } catch (error) {
        console.error("ユーザー情報の取得に失敗しました:", error);
        setError(t("history.error.userLoadFailed"));
      }
    };

    initializeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // シナリオフィルターが変更されたとき
  useEffect(() => {
    // フィルターが変更されたらページをリセットして再読み込み
    setPage(1);
    setNextToken(undefined);
    setTokenHistory([undefined]);
    loadSessions(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioFilter]);

  // セッション一覧を読み込む
  const loadSessions = async (token?: string) => {
    setLoading(true);
    try {
      // scenarioFilterパラメータを使用（バックエンドが適切に処理するか確認）
      const response = await apiService.getSessions(
        ITEMS_PER_PAGE,
        token,
        scenarioFilter,
      );
      setSessions(response.sessions);
      setNextToken(response.nextToken);

      // 合計ページ数の計算（概算）
      if (page === 1 && !token) {
        // 最初のページの場合、次のトークンがあれば少なくとも2ページ以上ある
        setTotalPages(
          response.nextToken
            ? Math.max(2, Math.ceil(response.sessions.length / ITEMS_PER_PAGE))
            : 1,
        );
      }
    } catch (err) {
      console.error("セッション履歴の読み込みに失敗しました", err);
      setError(t("history.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  // シナリオ一覧を読み込む
  const loadScenarios = async () => {
    try {
      const response = await apiService.getScenarios();
      setScenarios(response.scenarios);
    } catch (err) {
      console.error("シナリオ一覧の読み込みに失敗しました", err);
    }
  };

  // ページ変更ハンドラー
  const handlePageChange = (
    _event: React.ChangeEvent<unknown>,
    newPage: number,
  ) => {
    if (newPage > page) {
      // 次のページへ
      if (nextToken) {
        setPage(newPage);
        loadSessions(nextToken);
        setTokenHistory([...tokenHistory, nextToken]);
      }
    } else if (newPage < page) {
      // 前のページへ
      const previousToken = tokenHistory[newPage - 1];
      setPage(newPage);
      loadSessions(previousToken);
    }
  };

  // セッション詳細ページへ遷移
  const handleSessionClick = (sessionId: string) => {
    navigate(`/history/session/${sessionId}`);
  };

  // フィルターハンドラー
  const handleScenarioFilterChange = (event: SelectChangeEvent<string>) => {
    setScenarioFilter(event.target.value);
  };

  // 検索ハンドラー
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  // 日付フォーマット用関数
  const formatDate = (dateString: string) => {
    if (!dateString) return "-";

    try {
      const date = new Date(dateString);
      // 有効な日付かチェック
      if (isNaN(date.getTime())) {
        return "-";
      }

      return new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch (error) {
      console.error("Date formatting error:", error);
      return "-";
    }
  };

  // 表示用にフィルタリングされたセッションリスト
  const filteredSessions = sessions.filter(
    (session) =>
      (session.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (session.npcInfo?.name &&
        session.npcInfo.name.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        {/* フィルター部分 */}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
            mb: 4,
          }}
        >
          <Box sx={{ flex: { xs: "1 1 100%", md: "1 1 45%" } }}>
            <TextField
              label={t("history.search")}
              variant="outlined"
              fullWidth
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={t("history.searchPlaceholder")}
            />
          </Box>
          <Box sx={{ flex: { xs: "1 1 100%", md: "1 1 45%" } }}>
            <FormControl fullWidth>
              <InputLabel id="scenario-filter-label">
                {t("history.scenarioFilter")}
              </InputLabel>
              <Select
                labelId="scenario-filter-label"
                value={scenarioFilter}
                onChange={handleScenarioFilterChange}
                label={t("history.scenarioFilter")}
              >
                <MenuItem value="">{t("history.allScenarios")}</MenuItem>
                {scenarios.map((scenario) => (
                  <MenuItem
                    key={scenario.scenarioId}
                    value={scenario.scenarioId}
                  >
                    {scenario.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* エラー表示 */}
        {error && (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {/* ローディング表示 */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredSessions.length === 0 ? (
          // セッションがない場合のメッセージ
          <Box sx={{ mt: 4, textAlign: "center" }}>
            <Typography variant="h6">{t("history.noSessions")}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t("history.startNewSession")}
            </Typography>
          </Box>
        ) : (
          // セッション一覧
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "1fr 1fr",
                },
                gap: 3,
              }}
            >
              {filteredSessions.map((session) => (
                <Card
                  key={session.sessionId}
                  elevation={3}
                  sx={{
                    height: "100%",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: 6,
                    },
                  }}
                >
                  <CardActionArea
                    onClick={() => handleSessionClick(session.sessionId)}
                  >
                    <CardContent>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          mb: 1,
                        }}
                      >
                        <Typography
                          variant="h6"
                          component="div"
                          noWrap
                          sx={{ flexGrow: 1 }}
                        >
                          {session.title || t("history.untitledSession")}
                        </Typography>
                        <Chip
                          label={
                            session.status === "completed"
                              ? t("history.completed")
                              : t("history.active")
                          }
                          color={
                            session.status === "completed"
                              ? "success"
                              : "primary"
                          }
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          color: "text.secondary",
                          mb: 1,
                        }}
                      >
                        <PersonIcon fontSize="small" sx={{ mr: 1 }} />
                        <Typography variant="body2">
                          {session.npcInfo?.name || t("history.unknownNPC")} (
                          {session.npcInfo?.role || ""})
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          color: "text.secondary",
                        }}
                      >
                        <CalendarTodayIcon fontSize="small" sx={{ mr: 1 }} />
                        <Typography variant="body2">
                          {formatDate(session.createdAt || "")}
                        </Typography>
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
            </Box>

            {/* ページネーション */}
            {totalPages > 1 && (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={handlePageChange}
                  color="primary"
                />
              </Box>
            )}
          </>
        )}
      </Container>
    </>
  );
};

export default SessionHistoryPage;
