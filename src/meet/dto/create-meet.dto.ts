import { IsString, IsDate, IsArray } from 'class-validator';
import { User } from 'src/users/entities/user.entity';

export class CreateMeetDto {
  @IsString()
  link: string;

  @IsDate()
  startDate: Date;

  @IsDate()
  endDate: Date;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsString()
  title: string;

  @IsArray()
  @IsString({ each: true })
  users: string[];
}