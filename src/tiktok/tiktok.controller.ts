import {
  Controller,
  Delete,
  Get,
  HttpException,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { TiktokService } from './tiktok.service';
import { TiktokVideosQueryDto } from './dto/tiktok-videos-query.dto';

@Controller('tiktok')
export class TiktokController {
  constructor(
    private readonly tiktokService: TiktokService,
    private readonly configService: ConfigService,
  ) {}

  @Post('connect')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  connect() {
    return this.tiktokService.startConnection();
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      if (oauthError)
        throw new HttpException(`TikTok OAuth: ${oauthError}`, 400);
      const result = await this.tiktokService.completeConnection(code, state);
      const redirectUrl = this.frontendRedirectUrl('connected');
      if (redirectUrl) return response.redirect(redirectUrl);
      return result;
    } catch (error) {
      const redirectUrl = this.frontendRedirectUrl('error');
      if (redirectUrl) return response.redirect(redirectUrl);
      throw error;
    }
  }

  @Get('connection')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  getConnection() {
    return this.tiktokService.getConnection();
  }

  @Delete('connection')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  disconnect() {
    return this.tiktokService.disconnect();
  }

  @Get('videos')
  findVideos(@Query() dto: TiktokVideosQueryDto) {
    return this.tiktokService.findVideos(dto);
  }

  private frontendRedirectUrl(status: 'connected' | 'error'): string | null {
    const configured = this.configService.get<string>(
      'TIKTOK_FRONTEND_REDIRECT_URL',
    );
    if (!configured) return null;
    const url = new URL(configured);
    url.searchParams.set('tiktok', status);
    return url.toString();
  }
}
