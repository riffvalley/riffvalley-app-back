import { ValidationPipe } from '@nestjs/common';
import { ContentType } from '../entities/content.entity';
import { CreateContentDto } from './create-content.dto';
import { UpdateContentDto } from './update-content.dto';

describe('Content ready and backlog validation', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const createContent = (payload: object) =>
    validationPipe.transform(
      {
        type: ContentType.ARTICLE,
        name: 'Article content',
        authorId: '00000000-0000-4000-8000-000000000001',
        ...payload,
      },
      { type: 'body', metatype: CreateContentDto },
    );

  const updateContent = (payload: object) =>
    validationPipe.transform(payload, {
      type: 'body',
      metatype: UpdateContentDto,
    });

  it.each([
    ['create', createContent],
    ['update', updateContent],
  ])('%s accepts true and false without coercion', async (_name, validate) => {
    await expect(
      validate({ ready: true, backlog: false }),
    ).resolves.toMatchObject({ ready: true, backlog: false });
    await expect(
      validate({ ready: false, backlog: true }),
    ).resolves.toMatchObject({ ready: false, backlog: true });
  });

  it.each([
    ['create', createContent],
    ['update', updateContent],
  ])('%s keeps omitted flags optional', async (_name, validate) => {
    const dto = await validate({});
    expect(dto).not.toHaveProperty('ready');
    expect(dto).not.toHaveProperty('backlog');
  });

  it.each([
    ['ready', 'null', { ready: null }],
    ['backlog', 'null', { backlog: null }],
    ['ready', 'string', { ready: 'false' }],
    ['backlog', 'string', { backlog: 'true' }],
    ['ready', 'number', { ready: 0 }],
    ['backlog', 'number', { backlog: 1 }],
  ])(
    'rejects %s %s on create before persistence',
    async (_field, _kind, payload) => {
      await expect(createContent(payload)).rejects.toMatchObject({
        status: 400,
      });
    },
  );

  it.each([
    ['ready', 'null', { ready: null }],
    ['backlog', 'null', { backlog: null }],
    ['ready', 'string', { ready: 'false' }],
    ['backlog', 'string', { backlog: 'true' }],
    ['ready', 'number', { ready: 0 }],
    ['backlog', 'number', { backlog: 1 }],
  ])(
    'rejects %s %s on update before persistence',
    async (_field, _kind, payload) => {
      await expect(updateContent(payload)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});
