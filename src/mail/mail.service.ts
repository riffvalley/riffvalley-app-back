import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { CreateNationalReleaseDto } from '../national-releases/dto/create-national-release.dto';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT),
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  async sendNationalReleaseNotification(dto: CreateNationalReleaseDto): Promise<void> {
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
      await this.transporter.sendMail({
        from: `"Riff Valley" <${process.env.MAIL_USER}>`,
        to: process.env.MAIL_TO,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error('Error sending national release email', error);
    }
  }
}
