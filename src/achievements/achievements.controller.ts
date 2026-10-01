import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AchievementsService } from './achievements.service';
import { AchievementsEvaluatorService } from './achievements-evaluator.service';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { UpdateAchievementDto } from './dto/update-achievement.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/auth/entities/user.entity';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@Controller('achievements')
export class AchievementsController {
  constructor(
    private readonly achievementsService: AchievementsService,
    private readonly achievementsEvaluatorService: AchievementsEvaluatorService,
  ) {}

  // ==========================================
  // 1. RUTAS ESTÁTICAS Y ESPECÍFICAS (Arriba, antes de ':id')
  // ==========================================

  @Get()
  @Auth()
  getCatalog(
    @GetUser() user: User,
    @Query('categoryId') categoryId?: string,
    @Query('categoryCode') categoryCode?: string,
  ) {
    return this.achievementsService.listCatalogForUser(user.id, {
      categoryId,
      categoryCode,
    });
  }

  @Get('categories')
  @Auth()
  getCategories() {
    return this.achievementsService.listCategories();
  }

  @Get('mine')
  @Auth()
  getMine(@GetUser() user: User) {
    return this.achievementsService.listUnlockedForUser(user.id);
  }

  @Get('me/summary')
  @Auth()
  getMySummary(@GetUser() user: User) {
    return this.achievementsService.getSummary(user.id);
  }

  @Get('leaderboard')
  @Auth()
  getLeaderboard(@Query('limit') limit?: string) {
    return this.achievementsService.getLeaderboard(
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('user/:userId')
  @Auth()
  getForUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.achievementsService.listUnlockedForUser(userId);
  }

  // ==========================================
  // 2. RUTA RAÍZ (creación admin)
  // ==========================================

  @Post()
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  create(@Body() createAchievementDto: CreateAchievementDto) {
    return this.achievementsService.create(createAchievementDto);
  }

  // ==========================================
  // 3. RECÁLCULO (admin)
  // ==========================================

  @Post(':id/recalculate')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  recalculateAchievement(@Param('id', ParseUUIDPipe) id: string) {
    return this.achievementsEvaluatorService.recalculateForAchievement(id);
  }

  @Post('user/:userId/recalculate')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  recalculateUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.achievementsEvaluatorService.recalculateForUser(userId);
  }

  // ==========================================
  // 4. RUTAS GENÉRICAS CON :id (Al final, admin)
  // ==========================================

  @Get(':id')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.achievementsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAchievementDto: UpdateAchievementDto,
  ) {
    return this.achievementsService.update(id, updateAchievementDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.achievementsService.softDelete(id);
  }
}
