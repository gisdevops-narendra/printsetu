import { PaperSize, ColorMode, SideMode } from '@prisma/client';
export declare class SetPricingDto {
    paperSize: PaperSize;
    colorMode: ColorMode;
    sideMode: SideMode;
    pricePerPage: number;
}
