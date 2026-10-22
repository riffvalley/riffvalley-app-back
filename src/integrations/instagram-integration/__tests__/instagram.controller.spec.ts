import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { InstagramPostsQueryDto } from '../dto/instagram-posts-query.dto';
import { InstagramController } from '../instagram.controller';
import { InstagramService } from '../instagram.service';

describe('InstagramController', () => {
  it('preserves the public posts route and delegates the query DTO', async () => {
    const result = { data: [], totalItems: 0, hasMore: false };
    const service: jest.Mocked<Pick<InstagramService, 'findPosts'>> = {
      findPosts: jest.fn().mockResolvedValue(result),
    };
    const module = await Test.createTestingModule({
      controllers: [InstagramController],
      providers: [{ provide: InstagramService, useValue: service }],
    }).compile();
    const controller = module.get(InstagramController);
    const query = new InstagramPostsQueryDto();
    query.limit = 8;
    query.offset = 4;

    expect(Reflect.getMetadata(PATH_METADATA, InstagramController)).toBe('instagram');
    expect(Reflect.getMetadata(PATH_METADATA, InstagramController.prototype.findPosts)).toBe('posts');
    expect(Reflect.getMetadata(METHOD_METADATA, InstagramController.prototype.findPosts)).toBe(0);
    await expect(controller.findPosts(query)).resolves.toBe(result);
    expect(service.findPosts).toHaveBeenCalledWith(query);
    await module.close();
  });
});
