export function shouldEnableCronJobs(
  stage: string | undefined,
  disableScheduledTasks: string | undefined,
): boolean {
  return !(stage === 'dev' && disableScheduledTasks === 'true');
}
