import { MailService } from './mail.service';

describe('MailService', () => {
  const originalEnv = { ...process.env };
  const sendMail = jest.fn();
  let service: MailService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAIL_USER = 'mailer@test.invalid';
    process.env.MAIL_TO = 'notifications@test.invalid';
    delete process.env.SPOTIFY_REAUTH_NOTIFICATION_EMAIL;
    delete process.env.TIKTOK_REAUTH_NOTIFICATION_EMAIL;
    service = new MailService({ sendMail } as any);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('composes the access request notification and rethrows send errors', async () => {
    const error = new Error('SMTP unavailable');
    sendMail.mockRejectedValueOnce(error);

    await expect(
      service.sendAccessRequestNotification('new@test.invalid', 'NewUser'),
    ).rejects.toBe(error);
    expect(sendMail).toHaveBeenCalledWith({
      from: '"Riff Valley" <mailer@test.invalid>',
      to: 'contacto@riffvalley.es',
      subject: 'Solicitud de acceso de nuevo usuario',
      html: expect.stringContaining('<td>new@test.invalid</td>'),
    });
    expect(sendMail.mock.calls[0][0].html).toContain('<td>NewUser</td>');
  });

  it('composes national release fields including the optional link', async () => {
    await service.sendNationalReleaseNotification({
      artistName: 'Artist',
      discName: 'Album',
      discType: 'album',
      genre: 'Rock',
      releaseDay: '2026-10-14',
      link: 'https://example.test/album',
    } as any);

    expect(sendMail).toHaveBeenCalledWith({
      from: '"Riff Valley" <mailer@test.invalid>',
      to: 'notifications@test.invalid',
      subject: 'Nueva novedad nacional: Artist - Album',
      html: expect.stringContaining('https://example.test/album'),
    });
  });

  it('keeps national release transport errors swallowed after logging', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await expect(
      service.sendNationalReleaseNotification({
        artistName: 'Artist',
        discName: 'Album',
      } as any),
    ).resolves.toBeUndefined();
  });

  it('composes the Spotify reminder and retains its recipient fallback', async () => {
    await expect(
      service.sendSpotifyReauthorizationReminder(
        'Festival',
        new Date('2026-11-01T00:00:00Z'),
        3,
      ),
    ).resolves.toBe(true);

    expect(sendMail).toHaveBeenCalledWith({
      from: '"Riff Valley" <mailer@test.invalid>',
      to: 'notifications@test.invalid',
      subject: 'La autorización de Spotify caduca en 3 días',
      html: expect.stringContaining('Festival'),
    });
  });

  it('composes the TikTok reminder and uses its provider-specific recipient', async () => {
    process.env.TIKTOK_REAUTH_NOTIFICATION_EMAIL = 'tiktok@test.invalid';

    await expect(
      service.sendTiktokReauthorizationReminder(
        null,
        new Date('2026-11-01T00:00:00Z'),
        0,
      ),
    ).resolves.toBe(true);

    expect(sendMail).toHaveBeenCalledWith({
      from: '"Riff Valley" <mailer@test.invalid>',
      to: 'tiktok@test.invalid',
      subject: 'La autorización de TikTok necesita renovarse',
      html: expect.stringContaining('Cuenta oficial de Riff Valley'),
    });
  });

  it('skips OAuth reminders when neither provider recipient nor MAIL_TO is set', async () => {
    delete process.env.MAIL_TO;

    await expect(
      service.sendSpotifyReauthorizationReminder(null, new Date(), 1),
    ).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
