import { IsIn, IsString } from 'class-validator';

export class ReconcileRequestDto {
  @IsString()
  @IsIn(['csv', 'xlsx'])
  fileType: 'csv' | 'xlsx';
}
