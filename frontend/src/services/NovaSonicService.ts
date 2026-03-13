/**
 * NovaSonicService
 *
 * SigV4WebSocketClientを使用してAgentCore Runtime上のBidiAgentと通信する。
 * クライアントはBidiイベント形式のJSONを直接送受信する。
 */
import {
  SigV4WebSocketClient,
  WsConnectionState,
} from "./SigV4WebSocketClient";
import { amplifyConfig } from "../amplifyconfiguration";

// --- 型定義 ---

/** セッション接続設定 */
export interface NovaSonicSessionConfig {
  sessionId: string;
  scenarioId: string;
  npcConfig: Record<string, unknown>;
  scenarioDescription?: string;
  endpointingSensitivity?: "HIGH" | "MEDIUM" | "LOW";
  language?: string;
  systemPrompt?: string;
}

/** ASR転写イベント */
export interface AsrTranscriptEvent {
  text: string;
  isFinal: boolean;
}

/** NPC応答イベント */
export interface NpcResponseEvent {
  text: string;
  isFinal: boolean;
  responseId: string;
}

/** 音声出力イベント */
export interface AudioOutputEvent {
  data: string;
}

/** セッション状態イベント */
export interface SessionStatusEvent {
  status: "active" | "transitioning" | "error";
  novaSonicSessionCount: number;
}

/** エラー種別 */
export type NovaSonicErrorType =
  | "SESSION_RECOVERY_FAILED"
  | "MODEL_TIMEOUT"
  | "CONNECTION_ERROR"
  | "AUTH_ERROR";

/** エラーイベント */
export interface NovaSonicErrorEvent {
  errorType: NovaSonicErrorType;
  message: string;
}

/** 応答完了イベント */
export interface ResponseCompleteEvent {
  responseId: string;
  stopReason: string;
}

/** イベントリスナー */
export interface NovaSonicEventListeners {
  onAsrTranscript?: (event: AsrTranscriptEvent) => void;
  onNpcResponse?: (event: NpcResponseEvent) => void;
  onResponseComplete?: (event: ResponseCompleteEvent) => void;
  onAudioOutput?: (event: AudioOutputEvent) => void;
  onSessionStatus?: (event: SessionStatusEvent) => void;
  onError?: (event: NovaSonicErrorEvent) => void;
  onConnectionStateChange?: (state: WsConnectionState) => void;
}

/** BidiAgentから受信するイベント型 */
interface BidiOutputEvent {
  type: string;
  // bidi_transcript_stream
  role?: string;
  text?: string;
  is_final?: boolean;
  // bidi_audio_stream
  audio?: string;
  format?: string;
  sample_rate?: number;
  channels?: number;
  // bidi_connection_start/close
  connection_id?: string;
  reason?: string;
  // bidi_response_start/complete
  response_id?: string;
  stop_reason?: string;
  // bidi_error
  message?: string;
}

export class NovaSonicService {
  private static instance: NovaSonicService | null = null;
  private wsClient: SigV4WebSocketClient | null = null;
  private listeners: NovaSonicEventListeners = {};
  private sessionConfig: NovaSonicSessionConfig | null = null;
  private connected = false;
  private currentResponseId = "";

  private constructor() { }

  public static getInstance(): NovaSonicService {
    if (!NovaSonicService.instance) {
      NovaSonicService.instance = new NovaSonicService();
    }
    return NovaSonicService.instance;
  }

  public setListeners(listeners: NovaSonicEventListeners): void {
    this.listeners = listeners;
  }

  public isConnected(): boolean {
    return this.connected && (this.wsClient?.isConnected() ?? false);
  }

  public getConnectionState(): WsConnectionState {
    return this.wsClient?.getState() ?? WsConnectionState.DISCONNECTED;
  }

  /** BidiAgentに接続 */
  public async connect(config: NovaSonicSessionConfig): Promise<void> {
    if (this.wsClient) {
      this.disconnect();
    }
    this.sessionConfig = config;

    const agentEndpoint = amplifyConfig.NOVA_SONIC.agentEndpoint;
    const region = amplifyConfig.NOVA_SONIC.region;

    if (!agentEndpoint) {
      throw new Error("Nova Sonic AgentCore Runtimeエンドポイントが設定されていません");
    }

    console.log("NovaSonicService: 接続開始", {
      agentEndpoint: agentEndpoint.substring(0, 50) + "...",
      region,
      sessionId: config.sessionId,
    });

    this.wsClient = new SigV4WebSocketClient({
      agentEndpoint,
      region,
      connectTimeoutMs: 15000,
    });

    this.wsClient.setCallbacks({
      onMessage: (data) => this.handleMessage(data),
      onClose: (code, reason) => this.handleClose(code, reason),
      onError: () => this.handleWsError(),
      onStateChange: (state) => {
        this.connected = state === WsConnectionState.CONNECTED;
        this.listeners.onConnectionStateChange?.(state);
      },
    });

    await this.wsClient.connect();

    // セッション設定をBidiAgentに送信（システムプロンプト生成用）
    this.sendJson({
      type: "session_config",
      sessionId: config.sessionId,
      scenarioId: config.scenarioId,
      npcConfig: config.npcConfig,
      scenarioDescription: config.scenarioDescription ?? "",
      endpointingSensitivity: config.endpointingSensitivity ?? "MEDIUM",
      language: config.language ?? "ja",
    });

    // 接続成功を通知（session_statusはバックエンドからも来るが、即時通知用）
    this.listeners.onSessionStatus?.({
      status: "active",
      novaSonicSessionCount: 1,
    });

    // 接続直後に無音データを送信してBidiAgentの音声ストリームを開始
    const silenceSamples = 160; // 10ms @ 16kHz
    const silenceBuffer = new Int16Array(silenceSamples);
    const uint8 = new Uint8Array(silenceBuffer.buffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const silenceBase64 = btoa(binary);
    this.sendJson({
      type: "bidi_audio_input",
      audio: silenceBase64,
      format: "pcm",
      sample_rate: 16000,
      channels: 1,
    });
    console.log("NovaSonicService: 初期無音データ送信");
  }

  /** 切断 */
  public disconnect(): void {
    if (this.wsClient) {
      this.wsClient.dispose();
      this.wsClient = null;
    }
    this.connected = false;
    this.sessionConfig = null;
  }

  /** 音声チャンク送信（BidiAudioInputEvent形式） */
  public sendAudioChunk(base64Audio: string): void {
    if (!this.isConnected()) return;
    this.sendJson({
      type: "bidi_audio_input",
      audio: base64Audio,
      format: "pcm",
      sample_rate: 16000,
      channels: 1,
    });
  }

  /** テキスト送信（BidiTextInputEvent形式） */
  public sendTextMessage(content: string): void {
    if (!this.isConnected()) {
      throw new Error("セッションが接続されていません");
    }
    this.sendJson({ type: "bidi_text_input", text: content });
  }

  /** リソース解放 */
  public dispose(): void {
    this.disconnect();
    this.listeners = {};
    NovaSonicService.instance = null;
  }

  // --- Private Methods ---

  private sendJson(data: Record<string, unknown>): void {
    if (!this.wsClient?.isConnected()) {
      throw new Error("WebSocket未接続です");
    }
    this.wsClient.send(JSON.stringify(data));
  }

  /** BidiAgentからのイベントを処理 */
  private handleMessage(data: string): void {
    let event: BidiOutputEvent;
    try {
      event = JSON.parse(data) as BidiOutputEvent;
    } catch {
      console.error("NovaSonicService: メッセージ解析エラー:", data);
      return;
    }

    switch (event.type) {
      case "bidi_transcript_stream":
        if (!event.text) break;
        if (event.role === "user") {
          this.listeners.onAsrTranscript?.({
            text: event.text,
            isFinal: event.is_final ?? false,
          });
        } else if (event.role === "assistant") {
          this.listeners.onNpcResponse?.({
            text: event.text,
            isFinal: event.is_final ?? false,
            responseId: this.currentResponseId,
          });
        }
        break;

      case "bidi_audio_stream":
        if (event.audio) {
          this.listeners.onAudioOutput?.({ data: event.audio });
        }
        break;

      case "bidi_response_start":
        this.currentResponseId = event.response_id ?? "";
        break;

      case "bidi_response_complete":
        this.listeners.onResponseComplete?.({
          responseId: this.currentResponseId,
          stopReason: event.stop_reason ?? "",
        });
        this.currentResponseId = "";
        break;

      case "bidi_connection_start":
        console.log("NovaSonicService: BidiAgent接続開始", event.connection_id);
        break;

      case "bidi_connection_close":
        console.log("NovaSonicService: BidiAgent接続終了", event.reason);
        break;

      case "bidi_error":
        this.listeners.onError?.({
          errorType: "CONNECTION_ERROR",
          message: event.message ?? "Nova Sonicエラー",
        });
        break;

      case "session_status":
        // バックエンドからのセッション状態通知
        break;

      default:
        console.log("NovaSonicService: 未処理イベント:", event.type, event);
    }
  }

  private handleClose(code: number, reason: string): void {
    console.log(`NovaSonicService: WebSocket切断 code=${code}, reason=${reason}`);
    this.connected = false;
    if (code !== 1000) {
      this.listeners.onError?.({
        errorType: "CONNECTION_ERROR",
        message: `WebSocket接続が切断されました (code=${code})`,
      });
    }
  }

  private handleWsError(): void {
    this.listeners.onError?.({
      errorType: "CONNECTION_ERROR",
      message: "WebSocket接続エラーが発生しました",
    });
  }
}
