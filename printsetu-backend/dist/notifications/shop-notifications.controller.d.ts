import { NotificationsService } from './notifications.service';
import { AuthenticatedUser } from '../common/types/request-context';
export declare class ShopNotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationsService);
    list(user: AuthenticatedUser, page?: string, pageSize?: string): Promise<{
        items: {
            id: string;
            shopId: string;
            printJobId: string | null;
            eventType: import(".prisma/client").$Enums.NotificationEvent;
            channel: import(".prisma/client").$Enums.NotificationChannel;
            destination: string | null;
            status: import(".prisma/client").$Enums.NotificationStatus;
            providerRef: string | null;
            createdAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
