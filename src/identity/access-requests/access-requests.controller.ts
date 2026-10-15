import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AccessRequestsService } from './access-requests.service';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';

@Controller('access-requests')
export class AccessRequestsController {
  constructor(private readonly service: AccessRequestsService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  create(@Body() dto: CreateAccessRequestDto) {
    return this.service.create(dto);
  }
}
