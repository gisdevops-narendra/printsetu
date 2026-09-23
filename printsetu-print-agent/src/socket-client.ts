import { io, Socket } from 'socket.io-client';
import { AgentConfig } from './config';
import { AgentJobPayload } from './http-client';
import { JobProcessor } from './job-processor';
import { PrinterReporter } from './printer-reporter';
import { logger } from './logger';

/**
 * SRS §13.1: "Agent maintains a persistent secure connection to the
 * backend using WSS/WebSocket." socket.io's own reconnection handles
 * transient network loss; the HTTP polling loop in index.ts is the
 * documented fallback for when this socket cannot stay connected at all.
 */
export class AgentSocketClient {
  private socket: Socket | null = null;
  private _connected = false;

  constructor(
    private readonly config: AgentConfig,
    private readonly processor: JobProcessor,
    private readonly printerReporter: PrinterReporter,
  ) {}

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    this.socket = io(`${this.config.backendWsUrl}/agent`, {
      auth: { token: `${this.config.agentId}.${this.config.agentSecret}` },
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });

    this.socket.on('connect', () => {
      this._connected = true;
      logger.info('Connected to PrintSetu backend over WebSocket.');
      void this.printerReporter.report(true);
    });

    this.socket.on('disconnect', (reason) => {
      this._connected = false;
      logger.warn(`WebSocket disconnected (${reason}); polling fallback will take over.`);
    });

    this.socket.on('connect_error', (error) => {
      this._connected = false;
      logger.warn(`WebSocket connection error: ${error.message}`);
    });

    this.socket.on('error', (payload) => {
      logger.error(`Backend reported error: ${JSON.stringify(payload)}`);
    });

    // The shopkeeper asked the dashboard to re-scan this computer's printers.
    this.socket.on('printers:refresh', () => {
      void this.printerReporter.report(true);
    });

    this.socket.on('job:assigned', (payload: AgentJobPayload) => {
      logger.info(`Received job ${payload.jobId} over WebSocket.`);
      this.processor.handle(payload).catch((error) => logger.error(error.message));
    });
  }

  sendHeartbeat(): void {
    if (this._connected) this.socket?.emit('heartbeat');
  }

  disconnect(): void {
    this.socket?.disconnect();
  }
}
