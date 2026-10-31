import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { PassportModule } from '@nestjs/passport';
import { VideosController } from '../videos.controller';
import { VideosService } from '../videos.service';
import { Video } from '../entities/video.entity';
import { Content } from '../../contents/entities/content.entity';
import { ListVideoQueryDto } from '../dto/list-video.query.dto';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { UsersService } from 'src/identity/users/users.service';

describe('VideosController public Content reference', () => {
  it('preserves video fields and removes editorial Content fields', async () => {
    const video = Object.assign(new Video(), {
      id: 'video-id',
      name: 'Published video',
      content: Object.assign(new Content(), {
        id: 'content-id',
        name: 'Unpublished plan',
        notes: 'Internal notes',
        publicationDate: new Date('2026-10-30T00:00:00.000Z'),
        closeDate: new Date('2026-11-01T00:00:00.000Z'),
        ready: true,
        backlog: true,
        author: { id: 'author-id' },
      }),
    });
    const service: Pick<VideosService, 'findAll'> = {
      findAll: jest.fn().mockResolvedValue([video]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [VideosController],
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      providers: [
        { provide: VideosService, useValue: service },
        {
          provide: UsersService,
          useValue: { findIdentityById: jest.fn() },
        },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthGuard())
      .useValue({ canActivate: () => true })
      .compile();
    const controller = moduleRef.get(VideosController);

    await expect(controller.findAll(new ListVideoQueryDto())).resolves.toEqual([
      { ...video, content: { id: 'content-id' } },
    ]);
    await moduleRef.close();
  });
});
