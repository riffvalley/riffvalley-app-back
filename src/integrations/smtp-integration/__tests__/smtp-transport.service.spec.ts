import * as nodemailer from 'nodemailer';
import { SmtpTransportService } from '../smtp-transport.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('SmtpTransportService', () => {
  const sendMail = jest.fn();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAIL_HOST = 'smtp.test.invalid';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_USER = 'mailer@test.invalid';
    process.env.MAIL_PASS = 'test-only-password';
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates the Nodemailer transport with the existing SMTP configuration', () => {
    new SmtpTransportService();

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.test.invalid',
      port: 587,
      secure: false,
      auth: {
        user: 'mailer@test.invalid',
        pass: 'test-only-password',
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  });

  it('forwards the exact message options and returns Nodemailer’s result', async () => {
    const result = { messageId: 'mock-message-id' };
    sendMail.mockResolvedValue(result);
    const service = new SmtpTransportService();
    const options = {
      from: 'Riff Valley <mailer@test.invalid>',
      to: 'reader@test.invalid',
      subject: 'Test message',
      text: 'Body',
    };

    await expect(service.sendMail(options)).resolves.toBe(result);
    expect(sendMail).toHaveBeenCalledWith(options);
  });

  it('propagates transport errors unchanged', async () => {
    const error = new Error('SMTP unavailable');
    sendMail.mockRejectedValue(error);
    const service = new SmtpTransportService();

    await expect(service.sendMail({ subject: 'Test' })).rejects.toBe(error);
  });
});
