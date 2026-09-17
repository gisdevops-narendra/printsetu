import { NotificationEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare class NotificationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    record(shopId: string, printJobId: string | null, eventType: NotificationEvent): Promise<{
        id: string;
        eventType: import(".prisma/client").$Enums.NotificationEvent;
        channel: import(".prisma/client").$Enums.NotificationChannel;
        destination: string | null;
        status: import(".prisma/client").$Enums.NotificationStatus;
        providerRef: string | null;
        createdAt: Date;
        shopId: string;
        printJobId: string | null;
    }>;
    listForShop(shopId: string, page?: number, pageSize?: number): Promise<{
        items: {
            id: string;
            eventType: import(".prisma/client").$Enums.NotificationEvent;
            channel: import(".prisma/client").$Enums.NotificationChannel;
            destination: string | null;
            status: import(".prisma/client").$Enums.NotificationStatus;
            providerRef: string | null;
            createdAt: Date;
            shopId: string;
            printJobId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
}
