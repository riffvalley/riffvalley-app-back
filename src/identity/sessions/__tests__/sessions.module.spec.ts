import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '../../auth/auth.module';
import { SessionsModule } from '../sessions.module';
import { SessionsService } from '../sessions.service';

describe('SessionsModule ownership', () => {
  it('exports only its internal service and depends on no Auth module', () => {
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      SessionsModule,
    ) as unknown[] | undefined;
    const authImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AuthModule,
    ) as unknown[];
    const sessionImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      SessionsModule,
    ) as unknown[];

    expect(exports).toEqual([SessionsService]);
    expect(authImports).toContain(SessionsModule);
    expect(sessionImports).not.toContain(AuthModule);
  });
});
