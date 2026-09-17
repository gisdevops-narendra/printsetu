import { DocumentsService } from './documents.service';
import { AuthenticatedUser } from '../common/types/request-context';
export declare class ShopDocumentsController {
    private readonly documentsService;
    constructor(documentsService: DocumentsService);
    previewUrl(id: string, user: AuthenticatedUser): Promise<{
        url: string;
        expiresInSeconds: number;
    }>;
}
