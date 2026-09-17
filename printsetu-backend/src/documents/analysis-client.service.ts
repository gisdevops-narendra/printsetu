import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';
import { AppConfig } from '../config/configuration';

export interface AnalysisResult {
  pageCount: number;
  colorPages: number;
  confidence: 'HIGH' | 'LOW' | 'UNKNOWN';
}

/**
 * Client for the dedicated Python/PyMuPDF document-analysis service (SRS
 * §10.1 / §14). Kept as a thin HTTP client so the backend never links a
 * PDF library directly — the analysis engine can be swapped or scaled
 * independently.
 */
@Injectable()
export class AnalysisClientService {
  private readonly logger = new Logger(AnalysisClientService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async analyze(buffer: Buffer, mimeType: string, filename: string): Promise<AnalysisResult | null> {
    const baseUrl = this.config.get('docAnalysis', { infer: true }).url;
    try {
      const form = new FormData();
      form.append('file', buffer, { filename, contentType: mimeType });
      const { data } = await axios.post(`${baseUrl}/analyze`, form, {
        headers: form.getHeaders(),
        timeout: 20_000,
        maxContentLength: 50 * 1024 * 1024,
      });
      return {
        pageCount: data.pageCount,
        colorPages: data.colorPages,
        confidence: data.confidence,
      };
    } catch (error) {
      this.logger.warn(`Document analysis failed: ${(error as Error).message}`);
      return null;
    }
  }
}
