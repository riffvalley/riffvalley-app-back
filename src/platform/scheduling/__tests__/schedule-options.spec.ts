import { shouldEnableCronJobs } from '../schedule-options';

describe('shouldEnableCronJobs', () => {
  it('desactiva solo los cron jobs al solicitarlo en desarrollo', () => {
    expect(shouldEnableCronJobs('dev', 'true')).toBe(false);
  });

  it('mantiene cron jobs activos por defecto en desarrollo', () => {
    expect(shouldEnableCronJobs('dev', undefined)).toBe(true);
    expect(shouldEnableCronJobs('dev', 'false')).toBe(true);
  });

  it('no permite desactivar cron jobs fuera de desarrollo', () => {
    expect(shouldEnableCronJobs('prod', 'true')).toBe(true);
    expect(shouldEnableCronJobs(undefined, 'true')).toBe(true);
  });
});
