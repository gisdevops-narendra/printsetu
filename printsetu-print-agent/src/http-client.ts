import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import { AgentConfig } from './config';
import { logger } from './logger';

export interface AgentJobPayload {
  jobId: string;
  originalName: string;
  mimeType: string;
  options: { paperSize: string; colorMode: string; sideMode: string; copies: number };
  attemptId: string;
  documentSignedUrl: string;
}

export type AgentJobStatus = 'ACCEPTED' | 'PRINTING' | 'PRINTED' | 'PRINT_FAILED' | 'PRINT_UNKNOWN';

/** HTTP side of the agent contract (SRS §17): polling fallback + status reporting. */
export class BackendHttpClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: AgentConfig) {
    this.http = axios.create({
      baseURL: config.backendHttpUrl,
      headers: { Authorization: `Bearer ${config.agentId}.${config.agentSecret}` },
      timeout: 15_000,
    });
  }

  async pollNextJob(): Promise<AgentJobPayload | null> {
    const { data } = await this.http.get('/agent/jobs/next');
    return data.job ?? null;
  }

  async reportStatus(jobId: string, status: AgentJobStatus, agentAttemptId: string, message?: string): Promise<void> {
    await this.http.post(`/agent/jobs/${jobId}/status`, { status, agentAttemptId, message });
  }

  async heartbeat(): Promise<void> {
    await this.http.post('/agent/heartbeat');
  }

  async downloadToFile(url: string, destPath: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'stream', timeout: 60_000 });
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async safeHeartbeat(): Promise<void> {
    try {
      await this.heartbeat();
    } catch (error) {
      logger.warn(`Heartbeat failed: ${(error as Error).message}`);
    }
  }
}
