import { Test } from '@nestjs/testing';
import { LastfmApiService } from '../lastfm-api.service';
import { LastfmIntegrationModule } from '../lastfm-integration.module';

describe('LastfmIntegrationModule', () => {
  it('provides the Last.fm client without importing Catalog', async () => {
    const module = await Test.createTestingModule({
      imports: [LastfmIntegrationModule],
    }).compile();

    expect(module.get(LastfmApiService)).toBeInstanceOf(LastfmApiService);
    expect(Reflect.getMetadata('imports', LastfmIntegrationModule) ?? []).toEqual([]);
    await module.close();
  });
});
