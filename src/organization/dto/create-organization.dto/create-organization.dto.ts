import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
