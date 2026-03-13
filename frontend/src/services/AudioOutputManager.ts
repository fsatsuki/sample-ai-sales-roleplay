/**
 * AudioOutputManager
 *
 * 音声出力ソースの切り替え管理。
 * - 'polly': 既存AudioService/PollyService経由（デフォルト）
 * - 'nova-sonic': Nova 2 Sonic BidiAgentからのLPCM 24kHz音声をAudioWorkletで再生
 */

/** 音声ソース種別 */
export type AudioSource = "polly" | "nova-sonic";

export class AudioOutputManager {
  private static instance: AudioOutputManager | null = null;
  private audioSource: AudioSource = "polly";
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private workletReady = false;

  private constructor() { }

  public static getInstance(): AudioOutputManager {
    if (!AudioOutputManager.instance) {
      AudioOutputManager.instance = new AudioOutputManager();
    }
    return AudioOutputManager.instance;
  }

  /** 現在の音声ソースを取得 */
  public getAudioSource(): AudioSource {
    return this.audioSource;
  }

  /** 音声ソースを切り替え */
  public setAudioSource(source: AudioSource): void {
    if (this.audioSource !== source) {
      this.stopNovaSonicPlayback();
      this.audioSource = source;
      console.log(`AudioOutputManager: 音声ソース変更 → ${source}`);
    }
  }

  /**
   * Nova 2 Sonic音声データを再生（LPCM 24kHz Base64）
   * AudioWorkletを使用してリアルタイム連続再生する。
   */
  public async playNovaSonicAudio(base64Data: string): Promise<void> {
    if (this.audioSource !== "nova-sonic") {
      return;
    }

    try {
      // AudioContext初期化（初回のみ）
      if (!this.audioContext || this.audioContext.state === "closed") {
        this.audioContext = new AudioContext({ sampleRate: 24000 });
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        await this.initWorklet();
      }

      // suspended状態の場合はresume
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Base64デコード → Float32Array変換
      const pcmData = this.decodeBase64ToFloat32(base64Data);

      // WorkletNodeにデータを送信
      if (this.workletNode && this.workletReady) {
        this.workletNode.port.postMessage({ type: "audio", data: pcmData });
        this.isPlaying = true;
      }
    } catch (error) {
      console.error("AudioOutputManager: Nova Sonic音声再生エラー:", error);
    }
  }

  /** ボリュームを設定（0.0〜1.0） */
  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(clamped, this.audioContext?.currentTime ?? 0);
    }
  }

  /** Nova Sonic音声再生を停止 */
  public stopNovaSonicPlayback(): void {
    if (this.workletNode && this.workletReady) {
      this.workletNode.port.postMessage({ type: "clear" });
    }
    this.isPlaying = false;
  }

  /** 再生中かどうか */
  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /** リソースを解放 */
  public dispose(): void {
    this.stopNovaSonicPlayback();

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => { });
      this.audioContext = null;
    }

    this.workletReady = false;
    this.isPlaying = false;
    AudioOutputManager.instance = null;
  }

  // --- Private Methods ---

  /**
   * AudioWorkletProcessorを初期化
   * インラインでprocessorコードをBlobURLとして登録する。
   */
  private async initWorklet(): Promise<void> {
    if (!this.audioContext || !this.gainNode) return;

    // AudioWorkletProcessorをインラインで定義
    const processorCode = `
      class NovaSonicAudioProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = [];
          this.port.onmessage = (event) => {
            if (event.data.type === 'audio') {
              this.buffer.push(...event.data.data);
            } else if (event.data.type === 'clear') {
              this.buffer = [];
            }
          };
        }

        process(inputs, outputs) {
          const output = outputs[0];
          if (!output || output.length === 0) return true;

          const channel = output[0];
          const samplesToWrite = Math.min(channel.length, this.buffer.length);

          for (let i = 0; i < samplesToWrite; i++) {
            channel[i] = this.buffer[i];
          }

          // 書き込んだ分をバッファから削除
          if (samplesToWrite > 0) {
            this.buffer.splice(0, samplesToWrite);
          }

          // バッファが空の場合は無音を出力（既にゼロ初期化済み）
          return true;
        }
      }

      registerProcessor('nova-sonic-audio-processor', NovaSonicAudioProcessor);
    `;

    const blob = new Blob([processorCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);

    try {
      await this.audioContext.audioWorklet.addModule(url);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "nova-sonic-audio-processor"
      );
      this.workletNode.connect(this.gainNode);
      this.workletReady = true;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Base64エンコードされたLPCM 16bit音声データをFloat32Arrayに変換
   */
  private decodeBase64ToFloat32(base64: string): Float32Array {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // 16bit signed PCM → Float32 (-1.0 〜 1.0)
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    return float32;
  }
}
