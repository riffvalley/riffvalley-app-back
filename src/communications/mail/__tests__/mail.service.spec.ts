import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SmtpTransportService } from 'src/integrations/smtp-integration/smtp-transport.service';
import { MailService } from '../mail.service';
import type { NationalReleaseNotification } from '../mail.service';
import { MailSenderService } from '../senders/mail-sender.service';

describe('MailService', () => {
  const originalEnv = { ...process.env };
  const sendMail: jest.MockedFunction<SmtpTransportService['sendMail']> =
    jest.fn();
  let service: MailService;
  const nationalRelease: NationalReleaseNotification = {
    artistName: 'Artist',
    discName: 'Album',
    discType: 'album',
    genre: 'Rock',
    releaseDay: '2026-10-14',
    link: 'https://example.test/album',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.MAIL_USER = 'mailer@test.invalid';
    process.env.MAIL_FROM_DEFAULT = 'contact@test.invalid';
    process.env.MAIL_FROM_NO_REPLY = 'no-reply@test.invalid';
    process.env.MAIL_TO = 'notifications@test.invalid';
    delete process.env.SPOTIFY_REAUTH_NOTIFICATION_EMAIL;
    delete process.env.TIKTOK_REAUTH_NOTIFICATION_EMAIL;
    const module = await Test.createTestingModule({
      providers: [
        MailService,
        MailSenderService,
        { provide: SmtpTransportService, useValue: { sendMail } },
      ],
    }).compile();
    service = module.get(MailService);
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
      from: '"Riff Valley" <contact@test.invalid>',
      replyTo: 'new@test.invalid',
      to: 'contacto@riffvalley.es',
      subject: 'Solicitud de acceso de nuevo usuario',
      html: expect.stringContaining('<td>new@test.invalid</td>'),
    });
    expect(sendMail.mock.calls[0][0].html).toContain('<td>NewUser</td>');
  });

  it('sends password reset in escaped HTML and plain text without swallowing SMTP errors', async () => {
    const resetUrl = 'https://app.riffvalley.es/reset-password#token=a&b';
    sendMail.mockResolvedValueOnce({
      accepted: ['listener@test.invalid'],
    } as never);
    await service.sendPasswordReset('listener@test.invalid', resetUrl);

    const [{ from, html, text, subject, to, replyTo }] = sendMail.mock.calls[0];
    expect(from).toBe('"Riff Valley" <no-reply@test.invalid>');
    expect(replyTo).toBeUndefined();
    expect(to).toBe('listener@test.invalid');
    expect(subject).toBe('Recupera tu contraseña de Riff Valley App');
    expect(text).toContain('Riff Valley App');
    expect(html).toContain(
      'src="https://app.riffvalley.es/LOGO-RIFF-VALLEY.svg"',
    );
    expect(html).toContain(
      '<h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;color:#ffffff;">Riff Valley App</h1>',
    );
    expect(html).toContain(
      'href="https://app.riffvalley.es/reset-password#token=a&amp;b"',
    );
    expect(text).toContain(resetUrl);
    expect(text).toContain('30 minutos');
    expect(html).toContain('ignora este mensaje');
    expect(html).toContain(
      'nunca te pedirá tu contraseña por correo electrónico',
    );

    sendMail.mockResolvedValueOnce({ accepted: [] } as never);
    await expect(
      service.sendPasswordReset('listener@test.invalid', resetUrl),
    ).rejects.toThrow('Password reset email was not accepted by SMTP');

    const error = new Error('SMTP unavailable');
    sendMail.mockRejectedValueOnce(error);
    await expect(
      service.sendPasswordReset('listener@test.invalid', resetUrl),
    ).rejects.toBe(error);
  });

  it('composes national release fields including the optional link', async () => {
    await service.sendNationalReleaseNotification(nationalRelease);

    expect(sendMail).toHaveBeenCalledWith({
      from: '"Riff Valley" <contact@test.invalid>',
      replyTo: 'contact@test.invalid',
      to: 'notifications@test.invalid',
      subject: 'Nueva novedad nacional: Artist - Album',
      html: expect.stringContaining(
        '<tr><td><strong>Artista</strong></td><td>Artist</td></tr>',
      ),
    });
    const [{ html }] = sendMail.mock.calls[0];
    expect(html).toContain('<td>Album</td>');
    expect(html).toContain('<td>album</td>');
    expect(html).toContain('<td>Rock</td>');
    expect(html).toContain('<td>2026-10-14</td>');
    expect(html).toContain('https://example.test/album');
  });

  it('keeps national release transport errors swallowed after logging', async () => {
    const error = new Error('SMTP unavailable');
    const loggerError = jest.spyOn(Logger.prototype, 'error');
    sendMail.mockRejectedValueOnce(error);

    await expect(
      service.sendNationalReleaseNotification(nationalRelease),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith(
      'Error sending national release email',
      error,
    );
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
      from: '"Riff Valley" <contact@test.invalid>',
      replyTo: 'contact@test.invalid',
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
      from: '"Riff Valley" <contact@test.invalid>',
      replyTo: 'contact@test.invalid',
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

  it('keeps the legacy SMTP user as the default sender when MAIL_FROM_DEFAULT is absent', async () => {
    delete process.env.MAIL_FROM_DEFAULT;
    await service.sendAccessRequestNotification('new@test.invalid', 'NewUser');

    expect(sendMail.mock.calls[0][0]).toMatchObject({
      from: '"Riff Valley" <mailer@test.invalid>',
      replyTo: 'new@test.invalid',
    });
  });

  it('rejects absent or invalid sender settings before invoking SMTP', async () => {
    delete process.env.MAIL_FROM_NO_REPLY;
    await expect(
      service.sendPasswordReset(
        'listener@test.invalid',
        'https://app.test/reset#token=x',
      ),
    ).rejects.toThrow('MAIL_FROM_NO_REPLY must be configured');

    process.env.MAIL_FROM_NO_REPLY = 'not-an-email';
    await expect(
      service.sendPasswordReset(
        'listener@test.invalid',
        'https://app.test/reset#token=x',
      ),
    ).rejects.toThrow('MAIL_FROM_NO_REPLY must be configured');
    expect(sendMail).not.toHaveBeenCalled();

    process.env.MAIL_FROM_DEFAULT = 'bad-address';
    await expect(
      service.sendAccessRequestNotification('new@test.invalid', 'NewUser'),
    ).rejects.toThrow('MAIL_FROM_DEFAULT must be configured');
    expect(sendMail).not.toHaveBeenCalled();
  });
});
