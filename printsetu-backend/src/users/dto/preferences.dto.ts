import { IsIn } from 'class-validator';

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'gu'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export class UpdatePreferencesDto {
  @IsIn(SUPPORTED_LANGUAGES)
  language!: Language;
}
