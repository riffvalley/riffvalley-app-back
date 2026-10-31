import { Injectable, Logger } from '@nestjs/common';
import { SmtpTransportService } from 'src/integrations/smtp-integration/smtp-transport.service';
import { MailSenderService } from './senders/mail-sender.service';

export interface NationalReleaseNotification {
  artistName: string;
  discName: string;
  discType: string;
  genre: string;
  releaseDay: string;
  link?: string;
}

export function escapeMailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escaped[character] ?? character;
  });
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly smtpTransport: SmtpTransportService,
    private readonly mailSender: MailSenderService,
  ) {}

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const logoUrl = 'https://app.riffvalley.es/LOGO-RIFF-VALLEY.svg';
    const safeUrl = escapeMailHtml(resetUrl);
    const result = await this.smtpTransport.sendMail({
      ...this.mailSender.getHeaders('password-reset'),
      to: email,
      subject: 'Recupera tu contraseña de Riff Valley App',
      text: [
        'Riff Valley App',
        '',
        'Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.',
        `Recupérala aquí: ${resetUrl}`,
        'El enlace caduca 30 minutos después de que se active tras la aceptación del correo.',
        'Si no solicitaste este cambio, ignora este mensaje.',
        'Riff Valley nunca te pedirá tu contraseña por correo electrónico.',
      ].join('\n'),
      html: `
        <main style="margin:0;background-color:#f3f4f6;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#172554;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;border-collapse:separate;border-spacing:0;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:28px 24px;background-color:#172554;color:#ffffff;">
                <img src="${logoUrl}" alt="Riff Valley App" width="64" height="64" style="display:block;width:64px;height:64px;margin:0 auto 12px;border:0;" />
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;color:#ffffff;">Riff Valley App</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 16px;font-size:16px;line-height:1.6;color:#374151;">
                <p style="margin:0 0 20px;">Hemos recibido una solicitud para cambiar la contraseña de tu cuenta.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px;">
                  <tr>
                    <td align="center" bgcolor="#f4a7bb" style="border-radius:10px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:14px 24px;border:1px solid #f4a7bb;border-radius:10px;color:#172554;text-decoration:none;font-weight:700;">Recuperar contraseña</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 16px;">El enlace caduca 30 minutos después de que se active tras la aceptación del correo.</p>
                <p style="margin:0 0 16px;">Si no solicitaste este cambio, ignora este mensaje.</p>
                <p style="margin:0;font-size:14px;color:#6b7280;">Riff Valley App nunca te pedirá tu contraseña por correo electrónico.</p>
              </td>
            </tr>
          </table>
        </main>
      `,
    });
    if (result.accepted.length === 0) {
      throw new Error('Password reset email was not accepted by SMTP');
    }
  }

  async sendAccessRequestNotification(
    email: string,
    alias: string,
  ): Promise<void> {
    const subject = 'Solicitud de acceso de nuevo usuario';

    const html = `
      <h2>Solicitud de acceso de nuevo usuario</h2>
      <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;">
        <tr><td><strong>Email</strong></td><td>${email}</td></tr>
        <tr><td><strong>Alias</strong></td><td>${alias}</td></tr>
      </table>
    `;

    try {
      await this.smtpTransport.sendMail({
        ...this.mailSender.getHeaders('contact-notification', email),
        to: 'contacto@riffvalley.es',
        subject,
        html,
      });
    } catch (error) {
      this.logger.error('Error sending access request email', error);
      throw error;
    }
  }

  async sendNationalReleaseNotification(
    dto: NationalReleaseNotification,
  ): Promise<void> {
    const subject = `Nueva novedad nacional: ${dto.artistName} - ${dto.discName}`;

    const html = `
      <h2>Nueva novedad nacional recibida</h2>
      <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;">
        <tr><td><strong>Artista</strong></td><td>${dto.artistName}</td></tr>
        <tr><td><strong>Disco</strong></td><td>${dto.discName}</td></tr>
        <tr><td><strong>Tipo</strong></td><td>${dto.discType}</td></tr>
        <tr><td><strong>Género</strong></td><td>${dto.genre}</td></tr>
        <tr><td><strong>Fecha de lanzamiento</strong></td><td>${dto.releaseDay}</td></tr>
        ${dto.link ? `<tr><td><strong>Enlace</strong></td><td><a href="${dto.link}">${dto.link}</a></td></tr>` : ''}
      </table>
    `;

    try {
      await this.smtpTransport.sendMail({
        ...this.mailSender.getHeaders('administrative-notification'),
        to: process.env.MAIL_TO,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error('Error sending national release email', error);
    }
  }

  async sendSpotifyReauthorizationReminder(
    displayName: string | null,
    expiresAt: Date,
    daysRemaining: number,
  ): Promise<boolean> {
    const recipient =
      process.env.SPOTIFY_REAUTH_NOTIFICATION_EMAIL || process.env.MAIL_TO;
    if (!recipient) {
      this.logger.warn(
        'No se envió el aviso OAuth de Spotify: falta SPOTIFY_REAUTH_NOTIFICATION_EMAIL o MAIL_TO',
      );
      return false;
    }

    const expired = daysRemaining <= 0;
    const subject = expired
      ? 'La autorización de Spotify necesita renovarse'
      : `La autorización de Spotify caduca en ${daysRemaining} días`;
    const html = `
      <h2>${subject}</h2>
      <p>Cuenta: <strong>${displayName || 'Cuenta oficial de Riff Valley'}</strong></p>
      <p>Fecha de caducidad: <strong>${expiresAt.toLocaleDateString('es-ES', {
        timeZone: 'Europe/Madrid',
      })}</strong></p>
      <p>Abre la gestión de playlists de festivales y pulsa <strong>Volver a autorizar Spotify</strong>.</p>
      <p>No es necesario guardar ni compartir la contraseña de Spotify.</p>
    `;

    await this.smtpTransport.sendMail({
      ...this.mailSender.getHeaders('administrative-notification'),
      to: recipient,
      subject,
      html,
    });
    return true;
  }

  async sendTiktokReauthorizationReminder(
    displayName: string | null,
    expiresAt: Date,
    daysRemaining: number,
  ): Promise<boolean> {
    const recipient =
      process.env.TIKTOK_REAUTH_NOTIFICATION_EMAIL || process.env.MAIL_TO;
    if (!recipient) {
      this.logger.warn(
        'No se envió el aviso OAuth de TikTok: falta TIKTOK_REAUTH_NOTIFICATION_EMAIL o MAIL_TO',
      );
      return false;
    }

    const expired = daysRemaining <= 0;
    const subject = expired
      ? 'La autorización de TikTok necesita renovarse'
      : `La autorización de TikTok caduca en ${daysRemaining} días`;
    const html = `
      <h2>${subject}</h2>
      <p>Cuenta: <strong>${displayName || 'Cuenta oficial de Riff Valley'}</strong></p>
      <p>Fecha de caducidad: <strong>${expiresAt.toLocaleDateString('es-ES', {
        timeZone: 'Europe/Madrid',
      })}</strong></p>
      <p>Abre la gestión de integraciones y pulsa <strong>Volver a autorizar TikTok</strong>.</p>
      <p>No es necesario guardar ni compartir la contraseña de TikTok.</p>
    `;

    await this.smtpTransport.sendMail({
      ...this.mailSender.getHeaders('administrative-notification'),
      to: recipient,
      subject,
      html,
    });
    return true;
  }
}
