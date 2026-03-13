/**
 * SigV4WebSocketClient
 *
 * Cognito Identity Poolの一時認証情報を使用して、
 * AgentCore Runtime WebSocketエンドポイントにSigV4署名付きで接続するクライアント。
 */
import { fetchAuthSession } from "aws-amplify/auth";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";

// 接続状態
export enum WsConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  RECONNECTING = "RECONNECTING",
  ERROR = "ERROR",
}

// コールバック型定義
export interface SigV4WebSocketCallbacks {
  onMessage?: (data: string) => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Event) => void;
  onStateChange?: (state: WsConnectionState) => void;
}

// 接続設定
export interface SigV4WebSocketConfig {
  /** AgentCore Runtime エンドポイントARN */
  agentEndpoint: string;
  /** AWSリージョン */
  region: string;
  /** 接続タイムアウト（ミリ秒） */
  connectTimeoutMs?: number;
}

export class SigV4WebSocketClient {
  private ws: WebSocket | null = null;
  private state: WsConnectionState = WsConnectionState.DISCONNECTED;
  private callbacks: SigV4WebSocketCallbacks = {};
  private config: SigV4WebSocketConfig;
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(config: SigV4WebSocketConfig) {
    this.config = {
      connectTimeoutMs: 15000,
      ...config,
    };
  }

  /** 現在の接続状態を取得 */
  public getState(): WsConnectionState {
    return this.state;
  }

  /** コールバックを設定 */
  public setCallbacks(callbacks: SigV4WebSocketCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 接続中かどうか */
  public isConnected(): boolean {
    return this.state === WsConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * SigV4署名付きWebSocket接続を確立
   */
  public async connect(): Promise<void> {
    if (this.isConnected()) {
      console.warn("SigV4WebSocketClient: 既に接続済みです");
      return;
    }

    this.setState(WsConnectionState.CONNECTING);

    try {
      const signedUrl = await this.generateSignedUrl();
      await this.establishConnection(signedUrl);
    } catch (error) {
      console.error("SigV4WebSocketClient: 接続エラー:", error);
      this.setState(WsConnectionState.ERROR);
      throw error;
    }
  }

  /**
   * WebSocket接続を切断
   */
  public disconnect(): void {
    this.clearConnectTimeout();

    if (this.ws) {
      // oncloseハンドラが重複発火しないよう先にnull化
      const ws = this.ws;
      this.ws = null;

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "クライアントから切断");
      }
    }

    this.setState(WsConnectionState.DISCONNECTED);
  }

  /**
   * メッセージを送信
   */
  public send(data: string): void {
    if (!this.isConnected()) {
      throw new Error("WebSocket未接続です。send()の前にconnect()を呼び出してください");
    }
    this.ws!.send(data);
  }

  /**
   * リソースを解放
   */
  public dispose(): void {
    this.disconnect();
    this.callbacks = {};
  }

  // --- Private Methods ---

  private setState(newState: WsConnectionState): void {
    if (this.state !== newState) {
      const prev = this.state;
      this.state = newState;
      console.log(`SigV4WebSocketClient: 状態変更 ${prev} → ${newState}`);
      this.callbacks.onStateChange?.(newState);
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  /**
   * Cognito Identity Poolから一時認証情報を取得し、SigV4署名付きURLを生成
   */
  private async generateSignedUrl(): Promise<string> {
    // 一時認証情報を取得
    const session = await fetchAuthSession();
    const credentials = session.credentials;

    if (!credentials) {
      throw new Error("認証情報を取得できません。ログインしてください");
    }

    const { agentEndpoint, region } = this.config;

    // AgentCore Runtime WebSocketエンドポイントURLを構築
    // 形式: wss://bedrock-agentcore.<region>.amazonaws.com/runtimes/<runtimeArn>/ws?qualifier=DEFAULT
    // 注意: ARNはエンコードせずそのまま使用（AWS公式サンプル準拠）
    const host = `bedrock-agentcore.${region}.amazonaws.com`;
    const path = `/runtimes/${agentEndpoint}/ws`;

    // SigV4署名用のHTTPリクエストを構築（httpsプロトコルで署名）
    const request = new HttpRequest({
      method: "GET",
      protocol: "https:",
      hostname: host,
      path,
      headers: {
        host,
      },
      query: {
        qualifier: "DEFAULT",
      },
    });

    // SigV4署名
    const signer = new SignatureV4({
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
      region,
      service: "bedrock-agentcore",
      sha256: Sha256,
    });

    const signedRequest = await signer.presign(request, {
      expiresIn: 300, // 5分間有効
    });

    // 署名済みクエリパラメータからURLを構築
    const queryParams = new URLSearchParams();
    if (signedRequest.query) {
      for (const [key, value] of Object.entries(signedRequest.query)) {
        if (typeof value === "string") {
          queryParams.set(key, value);
        }
      }
    }

    const signedUrl = `wss://${host}${path}?${queryParams.toString()}`;
    console.log("SigV4WebSocketClient: 署名済みURL生成完了 (host:", host, "path:", path, ")");
    return signedUrl;
  }

  /**
   * 署名済みURLでWebSocket接続を確立
   */
  private establishConnection(signedUrl: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(signedUrl);

        // 接続タイムアウト
        this.connectTimeoutId = setTimeout(() => {
          if (this.state === WsConnectionState.CONNECTING) {
            const error = new Error(
              `WebSocket接続タイムアウト（${this.config.connectTimeoutMs}ms）`
            );
            this.disconnect();
            reject(error);
          }
        }, this.config.connectTimeoutMs);

        this.ws.onopen = () => {
          this.clearConnectTimeout();
          this.setState(WsConnectionState.CONNECTED);
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          if (typeof event.data === "string") {
            this.callbacks.onMessage?.(event.data);
          }
        };

        this.ws.onclose = (event: CloseEvent) => {
          this.clearConnectTimeout();
          const wasConnecting = this.state === WsConnectionState.CONNECTING;
          this.ws = null;
          this.setState(WsConnectionState.DISCONNECTED);
          console.log(`SigV4WebSocketClient: WebSocket onclose code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
          this.callbacks.onClose?.(event.code, event.reason);

          if (wasConnecting) {
            reject(new Error(`WebSocket接続が閉じられました: code=${event.code}, reason=${event.reason || "不明"}`));
          }
        };

        this.ws.onerror = (event: Event) => {
          this.clearConnectTimeout();
          console.error("SigV4WebSocketClient: WebSocketエラー:", event);
          console.error("SigV4WebSocketClient: WebSocket readyState:", this.ws?.readyState);
          this.callbacks.onError?.(event);

          if (this.state === WsConnectionState.CONNECTING) {
            this.setState(WsConnectionState.ERROR);
            reject(new Error("WebSocket接続エラーが発生しました"));
          } else {
            this.setState(WsConnectionState.ERROR);
          }
        };
      } catch (error) {
        this.clearConnectTimeout();
        this.setState(WsConnectionState.ERROR);
        reject(error);
      }
    });
  }
}
