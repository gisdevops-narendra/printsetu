import { IsDefined } from 'class-validator';

export class UpdateSystemSettingDto {
  @IsDefined()
  value!: unknown;
}
