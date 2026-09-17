"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AnalysisClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisClientService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
let AnalysisClientService = AnalysisClientService_1 = class AnalysisClientService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(AnalysisClientService_1.name);
    }
    async analyze(buffer, mimeType, filename) {
        const baseUrl = this.config.get('docAnalysis', { infer: true }).url;
        try {
            const form = new form_data_1.default();
            form.append('file', buffer, { filename, contentType: mimeType });
            const { data } = await axios_1.default.post(`${baseUrl}/analyze`, form, {
                headers: form.getHeaders(),
                timeout: 20_000,
                maxContentLength: 50 * 1024 * 1024,
            });
            return {
                pageCount: data.pageCount,
                colorPages: data.colorPages,
                confidence: data.confidence,
            };
        }
        catch (error) {
            this.logger.warn(`Document analysis failed: ${error.message}`);
            return null;
        }
    }
};
exports.AnalysisClientService = AnalysisClientService;
exports.AnalysisClientService = AnalysisClientService = AnalysisClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AnalysisClientService);
//# sourceMappingURL=analysis-client.service.js.map