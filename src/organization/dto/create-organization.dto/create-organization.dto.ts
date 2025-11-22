import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Organization Name' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'organization@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ 
    example: 'SecurePassword123!',
    description: 'Organization password (min 8 characters)',
    minLength: 8
  })
  @IsString()
  @MinLength(8)
  password: string;
}
