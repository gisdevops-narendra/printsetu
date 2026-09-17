import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
export interface AnalysisResult {
    pageCount: number;
    colorPages: number;
    confidence: 'HIGH' | 'LOW' | 'UNKNOWN';
}
export declare class AnalysisClientService {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService<AppConfig, true>);
    analyze(buffer: Buffer, mimeType: string, filename: string): Promise<AnalysisResult | null>;
}
