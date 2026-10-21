import {
  ArgumentMetadata,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  PipeTransform,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { NationalReleasesService } from './national-releases.service';
import { CreateNationalReleaseDto } from './dto/create-national-release.dto';
import { UpdateNationalReleaseDto } from './dto/update-national-release.dto';
import { LinkDiscDto } from './dto/link-disc.dto';
import { CreateNationalReleaseFromDiscDto } from './dto/create-national-release-from-disc.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

const MIN_RELEASE_YEAR = 1;
const MAX_RELEASE_YEAR = 9999;

class CreateNationalReleaseBodyPipe implements PipeTransform {
  private readonly dtoPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });

  transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const dtoMetadata = {
      ...metadata,
      metatype: CreateNationalReleaseDto,
    };

    if (Array.isArray(value)) {
      return Promise.all(
        value.map((item) => this.validateDto(item, dtoMetadata)),
      );
    }

    return this.validateDto(value, dtoMetadata);
  }

  private validateDto(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    if (value === null || value === undefined) {
      throw new BadRequestException('National release body is required');
    }

    return this.dtoPipe.transform(value, metadata);
  }
}

@Controller('national-releases')
export class NationalReleasesController {
  constructor(private readonly service: NationalReleasesService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  create(
    @Body(new CreateNationalReleaseBodyPipe())
    dto: CreateNationalReleaseDto | CreateNationalReleaseDto[],
  ) {
    return Array.isArray(dto)
      ? this.service.createMany(dto)
      : this.service.create(dto);
  }

  @Post('from-disc')
  @Auth(ValidRoles.riffvalley)
  createFromDisc(@Body() dto: CreateNationalReleaseFromDiscDto) {
    return this.service.createFromDisc(dto);
  }

  @Post('bulk')
  @Auth(ValidRoles.riffvalley)
  createBulk(
    @Body(new CreateNationalReleaseBodyPipe()) dto: CreateNationalReleaseDto[],
  ) {
    return this.service.createMany(dto);
  }

  @Get()
  findAll(@Query('month') month?: string, @Query('year') year?: string) {
    return this.service.findAll(
      this.parseIntegerQuery(month, 'month', 1, 12),
      this.parseIntegerQuery(year, 'year', MIN_RELEASE_YEAR, MAX_RELEASE_YEAR),
    );
  }

  @Get('public')
  findAllPublic(@Query('month') month?: string, @Query('year') year?: string) {
    return this.service.findAllPublic(
      this.parseIntegerQuery(month, 'month', 1, 12),
      this.parseIntegerQuery(year, 'year', MIN_RELEASE_YEAR, MAX_RELEASE_YEAR),
    );
  }

  @Get('all')
  @Auth(ValidRoles.riffvalley)
  findAllAdmin(
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('approved') approved?: string,
  ) {
    const approvedFilter = this.parseApprovedQuery(approved);
    return this.service.findAllAdmin(
      this.parseIntegerQuery(month, 'month', 1, 12),
      this.parseIntegerQuery(year, 'year', MIN_RELEASE_YEAR, MAX_RELEASE_YEAR),
      approvedFilter,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOnePublic(id);
  }

  @Patch(':id/link-disc')
  @Auth(ValidRoles.riffvalley)
  linkDisc(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkDiscDto) {
    return this.service.linkDisc(id, dto);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNationalReleaseDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  private parseIntegerQuery(
    value: string | undefined,
    field: 'month' | 'year',
    minimum: number,
    maximum: number,
  ): number | undefined {
    if (value === undefined) return undefined;

    if (
      typeof value !== 'string' ||
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value))
    ) {
      throw new BadRequestException(
        `${field} must be an integer between ${minimum} and ${maximum}`,
      );
    }

    const parsedValue = Number(value);
    if (parsedValue < minimum || parsedValue > maximum) {
      throw new BadRequestException(
        `${field} must be an integer between ${minimum} and ${maximum}`,
      );
    }

    return parsedValue;
  }

  private parseApprovedQuery(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;

    throw new BadRequestException('approved must be the literal true or false');
  }
}
