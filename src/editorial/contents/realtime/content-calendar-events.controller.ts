import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { ContentCalendarStreamService } from './content-calendar-stream.service';

@Controller('contents')
export class ContentCalendarEventsController {
  constructor(private readonly streamService: ContentCalendarStreamService) {}

  @Get('events')
  @Auth(ValidRoles.riffvalley)
  openStream(@Req() request: Request, @Res() response: Response): void {
    this.streamService.open(request, response);
  }
}
