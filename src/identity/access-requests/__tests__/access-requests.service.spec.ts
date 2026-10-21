import { BadRequestException } from '@nestjs/common';
import { AccessRequestsService } from '../access-requests.service';

describe('AccessRequestsService', () => {
  const usersService = { isUsernameTaken: jest.fn() };
  const mailService = { sendAccessRequestNotification: jest.fn() };
  let service: AccessRequestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.isUsernameTaken.mockResolvedValue(false);
    mailService.sendAccessRequestNotification.mockResolvedValue(undefined);
    service = new AccessRequestsService(
      usersService as never,
      mailService as never,
    );
  });

  it('checks the alias through Users and preserves the successful response and mail call', async () => {
    await expect(
      service.create({ alias: 'listener', email: 'listener@example.test' }),
    ).resolves.toEqual({
      message: 'Solicitud de acceso enviada correctamente',
    });
    expect(usersService.isUsernameTaken).toHaveBeenCalledWith('listener');
    expect(mailService.sendAccessRequestNotification).toHaveBeenCalledWith(
      'listener@example.test',
      'listener',
    );
  });

  it('rejects occupied aliases without sending mail', async () => {
    usersService.isUsernameTaken.mockResolvedValue(true);

    await expect(
      service.create({ alias: 'listener', email: 'listener@example.test' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mailService.sendAccessRequestNotification).not.toHaveBeenCalled();
  });

  it('keeps notification delivery best-effort', async () => {
    mailService.sendAccessRequestNotification.mockRejectedValue(
      new Error('mail unavailable'),
    );

    await expect(
      service.create({ alias: 'listener', email: 'listener@example.test' }),
    ).resolves.toEqual({
      message: 'Solicitud de acceso enviada correctamente',
    });
  });
});
