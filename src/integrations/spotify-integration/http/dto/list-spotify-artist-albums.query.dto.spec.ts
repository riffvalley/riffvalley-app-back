import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListSpotifyArtistAlbumsQueryDto } from './list-spotify-artist-albums.query.dto';

describe('ListSpotifyArtistAlbumsQueryDto', () => {
  it('transforma y acepta album,single y un límite de 1', async () => {
    const query = plainToInstance(ListSpotifyArtistAlbumsQueryDto, {
      include_groups: 'album,single',
      limit: '1',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.include_groups).toEqual(['album', 'single']);
    expect(query.limit).toBe(1);
  });

  it('usa album,single y límite 1 por defecto', async () => {
    const query = plainToInstance(ListSpotifyArtistAlbumsQueryDto, {});

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.include_groups).toEqual(['album', 'single']);
    expect(query.limit).toBe(1);
  });

  it.each([
    ['group desconocido', { include_groups: 'album,artist' }],
    ['group vacío', { include_groups: '' }],
    ['group duplicado', { include_groups: 'album,album' }],
    ['límite cero', { limit: '0' }],
    ['límite superior a 50', { limit: '51' }],
    ['límite fraccionario', { limit: '1.5' }],
    ['límite no numérico', { limit: 'muchos' }],
  ])('rechaza %s', async (_case, params) => {
    const query = plainToInstance(ListSpotifyArtistAlbumsQueryDto, params);
    const errors = await validate(query);

    expect(errors.length).toBeGreaterThan(0);
  });
});
