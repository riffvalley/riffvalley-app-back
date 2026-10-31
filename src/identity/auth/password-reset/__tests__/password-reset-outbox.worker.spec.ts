import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetOutboxWorker } from '../password-reset-outbox.worker';

describe('PasswordResetOutboxWorker', () => {
  const delivery = {
    requestId: 'e220ee5b-35e5-4b86-b418-35c4d8c3a9da',
    email: 'person@example.test',
    token: 'a'.repeat(43),
  };
  const lockedUntil = new Date(Date.now() + 60_000);

  function createWorker(
    sendPasswordReset: jest.Mock,
    claim = [{ requestId: delivery.requestId, attemptCount: 1, lockedUntil }],
  ) {
    const passwordReset = {
      cleanupTerminalRequests: jest.fn().mockResolvedValue(0),
      failExhaustedDeliveries: jest.fn().mockResolvedValue(undefined),
      claimPendingDeliveries: jest.fn().mockResolvedValue(claim),
      getClaimedDelivery: jest.fn().mockResolvedValue(delivery),
      activateDeliveredRequest: jest.fn().mockResolvedValue(true),
      retryPendingDelivery: jest.fn().mockResolvedValue(undefined),
      failPendingDelivery: jest.fn().mockResolvedValue(false),
    };
    const config = new ConfigService({
      AUTH_PASSWORD_RESET_URL: 'http://localhost:5173/reset-password',
      STAGE: 'dev',
    });
    return {
      worker: new PasswordResetOutboxWorker(
        config,
        passwordReset as never,
        { sendPasswordReset } as never,
      ),
      passwordReset,
    };
  }

  it('sends the reconstructed token link and activates only after SMTP acceptance', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { worker, passwordReset } = createWorker(send);

    await worker.processBatch();

    expect(send).toHaveBeenCalledWith(
      delivery.email,
      `http://localhost:5173/reset-password#token=${delivery.token}`,
    );
    expect(passwordReset.activateDeliveredRequest).toHaveBeenCalledWith(
      delivery.requestId,
    );
    expect(passwordReset.retryPendingDelivery).not.toHaveBeenCalled();
  });

  it('schedules bounded exponential retry without logging SMTP error contents', async () => {
    const send = jest.fn().mockRejectedValue(new Error('private SMTP details'));
    const { worker, passwordReset } = createWorker(send, [
      { requestId: delivery.requestId, attemptCount: 3, lockedUntil },
    ]);
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await worker.processBatch();

    expect(passwordReset.retryPendingDelivery).toHaveBeenCalledWith(
      delivery.requestId,
      120,
      5,
      lockedUntil,
    );
    expect(passwordReset.activateDeliveredRequest).not.toHaveBeenCalled();
    const logged = warning.mock.calls
      .map(([message]) => String(message))
      .join('\n');
    expect(logged).not.toContain(delivery.email);
    expect(logged).not.toContain(delivery.token);
    expect(logged).not.toContain('private SMTP details');
    warning.mockRestore();
  });

  it('marks delivery terminal after the final failed attempt', async () => {
    const send = jest.fn().mockRejectedValue(new Error('SMTP unavailable'));
    const { worker, passwordReset } = createWorker(send, [
      { requestId: delivery.requestId, attemptCount: 5, lockedUntil },
    ]);

    await worker.processBatch();

    expect(passwordReset.retryPendingDelivery).toHaveBeenCalledWith(
      delivery.requestId,
      480,
      5,
      lockedUntil,
    );
  });

  it('does not activate a request replaced while SMTP is in flight', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { worker, passwordReset } = createWorker(send);
    passwordReset.activateDeliveredRequest.mockResolvedValue(false);

    await worker.processBatch();

    expect(passwordReset.failPendingDelivery).toHaveBeenCalledWith(
      delivery.requestId,
    );
  });

  it('continues to rely on PostgreSQL claims for parallel worker exclusion', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { worker, passwordReset } = createWorker(send, []);

    await worker.processBatch();

    expect(passwordReset.claimPendingDeliveries).toHaveBeenCalledWith(
      10,
      60,
      5,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
