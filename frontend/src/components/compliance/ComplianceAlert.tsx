import React from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AlertTitle,
  Box,
  Snackbar,
  IconButton,
  Typography,
  Collapse,
} from "@mui/material";
import {
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { ComplianceViolation } from "../../types/api";

interface ComplianceAlertProps {
  violation: ComplianceViolation;
  open: boolean;
  onClose: () => void;
  autoHideDuration?: number;
}

/**
 * コンプライアンス違反を通知するアラートコンポーネント
 */
const ComplianceAlert: React.FC<ComplianceAlertProps> = ({
  violation,
  open,
  onClose,
  autoHideDuration = 8000,
}) => {
  const { t } = useTranslation();

  // 違反の重大度に応じてアイコンと色を選択
  const getSeverityInfo = (severity: string) => {
    switch (severity) {
      case "high":
        return {
          icon: <ErrorIcon />,
          color: "error",
          label: t("compliance.severityHigh", "High"),
        };
      case "medium":
        return {
          icon: <WarningIcon />,
          color: "warning",
          label: t("compliance.severityMedium", "Medium"),
        };
      default:
        return {
          icon: <InfoIcon />,
          color: "info",
          label: t("compliance.severityLow", "Low"),
        };
    }
  };

  const severityInfo = getSeverityInfo(violation.severity);

  // アラートをSnackbarとして表示
  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert
        severity={
          severityInfo.color as "error" | "warning" | "info" | "success"
        }
        variant="filled"
        icon={severityInfo.icon}
        action={
          <IconButton
            size="small"
            aria-label="close"
            color="inherit"
            onClick={onClose}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
        sx={{
          width: "100%",
          maxWidth: 500,
          boxShadow: 3,
        }}
      >
        <AlertTitle>
          {/* Use translation key if available, otherwise fallback to original text */}
          {violation.rule_name_key
            ? String(
                t(violation.rule_name_key, violation.rule_name_params || {}),
              )
            : violation.rule_name ||
              t("compliance.violation", "Compliance Violation")}
        </AlertTitle>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {/* Use translation key if available, otherwise fallback to original text */}
          {violation.message_key
            ? String(t(violation.message_key, violation.message_params || {}))
            : violation.message}
        </Typography>
        <Collapse in={Boolean(violation.context)}>
          <Box
            sx={{
              mt: 1,
              p: 1,
              borderRadius: 1,
              bgcolor: "rgba(0, 0, 0, 0.1)",
              fontStyle: "italic",
              fontSize: "0.9rem",
            }}
          >
            "{violation.context}"
          </Box>
        </Collapse>
      </Alert>
    </Snackbar>
  );
};

export default ComplianceAlert;
