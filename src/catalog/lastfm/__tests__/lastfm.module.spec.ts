import { AuthModule } from 'src/identity/auth/auth.module';
import { DiscModule } from 'src/catalog/discs/discs.module';
import { LastfmIntegrationModule } from 'src/integrations/lastfm-integration/lastfm-integration.module';
import { LastfmController } from '../lastfm.controller';
import { LastfmModule } from '../lastfm.module';
import { LastfmService } from '../lastfm.service';

describe('LastfmModule dependencies', () => {
  it('connects the local use case to Catalog, Auth and the provider module', () => {
    expect(Reflect.getMetadata('imports', LastfmModule)).toEqual(
      expect.arrayContaining([DiscModule, AuthModule, LastfmIntegrationModule]),
    );
    expect(Reflect.getMetadata('providers', LastfmModule)).toContain(
      LastfmService,
    );
    expect(Reflect.getMetadata('controllers', LastfmModule)).toContain(
      LastfmController,
    );
  });
});
