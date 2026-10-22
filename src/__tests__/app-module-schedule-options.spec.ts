type ScheduleModuleOptions = {
  cronJobs?: boolean;
};

type ScheduleDynamicModule = {
  module?: { name?: string };
  providers?: Array<{ provide: unknown; useValue?: unknown }>;
};

const originalStage = process.env.STAGE;
const originalDisableScheduledTasks = process.env.DISABLE_SCHEDULED_TASKS;

async function getConfiguredCronJobs(
  stage: string | undefined,
  disableScheduledTasks: string | undefined,
): Promise<boolean | undefined> {
  if (stage === undefined) {
    delete process.env.STAGE;
  } else {
    process.env.STAGE = stage;
  }

  if (disableScheduledTasks === undefined) {
    delete process.env.DISABLE_SCHEDULED_TASKS;
  } else {
    process.env.DISABLE_SCHEDULED_TASKS = disableScheduledTasks;
  }

  jest.resetModules();
  const { AppModule } = await import('../app.module');
  const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
  const scheduleModule = imports.find(
    (module): module is ScheduleDynamicModule =>
      typeof module === 'object' &&
      module !== null &&
      'module' in module &&
      typeof module.module === 'function' &&
      module.module.name === 'ScheduleModule',
  );
  const options = scheduleModule?.providers?.find(
    ({ provide }) => provide === 'SCHEDULE_MODULE_OPTIONS',
  )?.useValue as ScheduleModuleOptions | undefined;

  return options?.cronJobs;
}

afterEach(() => {
  if (originalStage === undefined) {
    delete process.env.STAGE;
  } else {
    process.env.STAGE = originalStage;
  }

  if (originalDisableScheduledTasks === undefined) {
    delete process.env.DISABLE_SCHEDULED_TASKS;
  } else {
    process.env.DISABLE_SCHEDULED_TASKS = originalDisableScheduledTasks;
  }
});

describe('AppModule scheduled jobs configuration', () => {
  it('disables cron jobs only when requested in development', async () => {
    await expect(getConfiguredCronJobs('dev', 'true')).resolves.toBe(false);
  });

  it('keeps cron jobs enabled by default in development', async () => {
    await expect(getConfiguredCronJobs('dev', undefined)).resolves.toBe(true);
    await expect(getConfiguredCronJobs('dev', 'false')).resolves.toBe(true);
  });

  it('does not allow disabling cron jobs outside development', async () => {
    await expect(getConfiguredCronJobs('prod', 'true')).resolves.toBe(true);
    await expect(getConfiguredCronJobs('test', 'true')).resolves.toBe(true);
  });
});
