import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AccessRequestsController } from '../access-requests.controller';
import { CreateAccessRequestDto } from '../dto/create-access-request.dto';

describe('AccessRequestsController', () => {
  const handler = AccessRequestsController.prototype.create;

  it('preserves the public POST route and throttling policy', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AccessRequestsController)).toBe(
      'access-requests',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      ThrottlerGuard,
    ]);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(3);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60000);
  });

  it('delegates the submitted DTO to the service', () => {
    const dto = {
      alias: 'listener',
      email: 'listener@example.com',
    } as CreateAccessRequestDto;
    const response = { message: 'Solicitud de acceso enviada correctamente' };
    const service = { create: jest.fn().mockReturnValue(response) };
    const controller = new AccessRequestsController(service as never);

    expect(controller.create(dto)).toBe(response);
    expect(service.create).toHaveBeenCalledWith(dto);
  });
});
