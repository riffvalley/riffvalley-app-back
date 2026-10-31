import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';

export type MailPurpose =
  | 'password-reset'
  | 'contact-notification'
  | 'administrative-notification';

export interface MailSenderHeaders {
  from: string;
  replyTo?: string;
}

@Injectable()
export class MailSenderService {
  getHeaders(purpose: MailPurpose, contactReplyTo?: string): MailSenderHeaders {
    const defaultAddress = this.requireAddress(
      'MAIL_FROM_DEFAULT',
      process.env.MAIL_FROM_DEFAULT || process.env.MAIL_USER,
    );

    if (purpose === 'password-reset') {
      if (contactReplyTo) {
        throw new Error(
          'Password reset messages cannot set a contact Reply-To',
        );
      }
      const noReplyAddress = this.requireAddress(
        'MAIL_FROM_NO_REPLY',
        process.env.MAIL_FROM_NO_REPLY,
      );

      return { from: this.formatFrom(noReplyAddress) };
    }

    const replyTo = contactReplyTo
      ? this.requireAddress('Reply-To', contactReplyTo)
      : defaultAddress;

    return {
      from: this.formatFrom(defaultAddress),
      replyTo,
    };
  }

  private requireAddress(variable: string, value: string | undefined): string {
    if (!value || !isEmail(value)) {
      throw new Error(
        `${variable} must be configured with a valid email address`,
      );
    }
    return value;
  }

  private formatFrom(address: string): string {
    return `"Riff Valley" <${address}>`;
  }
}
