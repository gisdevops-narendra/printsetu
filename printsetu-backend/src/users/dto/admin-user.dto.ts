import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * There is exactly one ADMIN for the whole platform (seeded in Keycloak; see
 * keycloak/printsetu-realm.json), so this endpoint only ever creates
 * SHOPKEEPER users and always requires a shop.
 */
export class CreateUserDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() mobile?: string;
  @IsString() @IsNotEmpty() shopId!: string;
}

export class UpdateUserStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}
