import dataSource from '../src/data-source';
import {
  configureRolesMigrationDiscovery,
  runRolesMigrationChain,
} from '../src/roles-migration/run-roles-migration-chain';

export {
  configureRolesMigrationDiscovery,
  isTimestampedMigrationFile,
  runRolesMigrationChain,
} from '../src/roles-migration/run-roles-migration-chain';

if (require.main === module) {
  Promise.resolve()
    .then(() => {
      configureRolesMigrationDiscovery(dataSource);
      return runRolesMigrationChain(dataSource);
    })
    .then((migrations) => {
      if (migrations.length === 0) {
        console.log('Las migraciones de roles ya están aplicadas.');
        return;
      }
      console.log(`Migraciones de roles aplicadas: ${migrations.join(', ')}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
