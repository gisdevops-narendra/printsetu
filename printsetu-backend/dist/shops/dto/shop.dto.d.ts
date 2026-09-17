export declare class CreateShopDto {
    name: string;
    ownerName: string;
    mobile: string;
    email: string;
    address: string;
    city: string;
}
export declare class UpdateShopDto {
    name?: string;
    ownerName?: string;
    mobile?: string;
    email?: string;
    address?: string;
    city?: string;
}
export declare class UpdateShopStatusDto {
    status: 'ACTIVE' | 'INACTIVE';
}
export declare class UpdatePrintSettingsDto {
    retentionMinutes?: number;
    maxFileSizeBytes?: number;
}
