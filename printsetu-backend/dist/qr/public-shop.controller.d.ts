import { QrService } from './qr.service';
export declare class PublicShopController {
    private readonly qrService;
    constructor(qrService: QrService);
    resolve(publicCode: string): Promise<{
        shopCode: string;
        shopName: string;
        city: string;
    }>;
}
