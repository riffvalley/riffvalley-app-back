import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Auth } from '../../../identity/auth/decorators/auth.decorator';
import { ValidRoles } from '../../../identity/auth/interfaces/valid-roles';
import { ResolveLocalityDto } from '../dto/resolve-locality.dto';
import { InspectLocalitiesBatchDto } from '../dto/inspect-localities-batch.dto';
import { ManageLocalityAliasDto } from '../dto/manage-locality-alias.dto';
import { LocalitiesService } from './localities.service';

@Controller('localities')
export class LocalitiesController {
  constructor(private readonly localitiesService: LocalitiesService) {}

  @Post('inspect-batch')
  inspectBatch(@Body() dto: InspectLocalitiesBatchDto) {
    return this.localitiesService.inspectBatch(dto);
  }

  @Post('resolve')
  @Auth(ValidRoles.riffvalley)
  resolve(@Body() dto: ResolveLocalityDto) {
    return this.localitiesService.resolveAndGeocode(dto);
  }

  @Post(':id/aliases')
  @Auth(ValidRoles.riffvalley)
  addAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManageLocalityAliasDto,
  ) {
    return this.localitiesService.addAlias(id, dto);
  }

  @Delete(':id/aliases/:aliasId')
  @Auth(ValidRoles.riffvalley)
  removeAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
  ) {
    return this.localitiesService.removeAlias(id, aliasId);
  }
}
