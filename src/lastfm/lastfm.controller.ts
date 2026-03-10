import { Controller, Get, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { LastfmService } from './lastfm.service';

class WeeklyImagesQueryDto {
  @IsInt() @Min(1) @Max(12) @Type(() => Number) month: number;
  @IsInt() @Min(2020) @Type(() => Number) year: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) week?: number;
}

@Controller('lastfm')
export class LastfmController {
  constructor(private readonly lastfmService: LastfmService) {}

  @Get('artist')
  getArtistInfo(@Query('artist') artist: string) {
    return this.lastfmService.getArtistInfo(artist);
  }

  @Post('fill-images')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  fillWeeklyImages(@Query() dto: WeeklyImagesQueryDto) {
    return this.lastfmService.fillWeeklyImages(dto.month, dto.year, dto.week);
  }
}
