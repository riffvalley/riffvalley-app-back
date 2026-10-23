import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Disc } from '../entities/disc.entity';
import * as cheerio from 'cheerio';
import { SpotifyClientCredentialsService } from 'src/integrations/spotify-integration/api';

interface DiscLinkMaintenanceOptions {
  summaryOnly?: boolean;
}

type BandcampSearchResult =
  | {
      status: 'found';
      link: string;
      image: string | null;
      albumName: string | null;
      artistName: string | null;
    }
  | { status: 'not-found' }
  | { status: 'error' };

@Injectable()
export class DiscLinkMaintenanceService {
  private readonly logger = new Logger(DiscLinkMaintenanceService.name);

  constructor(
    @InjectRepository(Disc)
    private readonly discRepo: Repository<Disc>,
    private readonly spotifyClient: SpotifyClientCredentialsService,
  ) {}

  // Ejecuta todos los días a las 6:00 AM
  @Cron('0 6 * * *', {
    timeZone: 'Europe/Madrid',
  })
  async runDailyLinkMaintenance() {
    await this.checkMissingSpotifyLinks({ summaryOnly: true });
  }

  async checkMissingSpotifyLinks({
    summaryOnly = false,
  }: DiscLinkMaintenanceOptions = {}) {
    if (!summaryOnly) {
      this.logger.log('Starting daily check for missing Spotify links...');
    }
    const today = new Date();
    let updatedCount = 0;
    let noMatchCount = 0;
    let queryErrorCount = 0;

    try {
      // Find discs with missing links or errors that are already released
      const discsToUpdate = await this.discRepo
        .createQueryBuilder('disc')
        .leftJoinAndSelect('disc.artist', 'artist')
        .leftJoinAndSelect('disc.genre', 'genre')
        .where('disc.releaseDate <= :today', { today })
        .andWhere(
          '(disc.link IS NULL OR disc.link = :empty OR disc.link = :notFound OR disc.link = :error)',
          {
            empty: '',
            notFound: 'No se encontró el álbum',
            error: 'Error al realizar la búsqueda',
          },
        )
        .getMany();

      if (summaryOnly) {
        this.logger.log(
          `check-spotify iniciado: ${discsToUpdate.length} discos pendientes`,
        );
      } else {
        this.logger.log(
          `Found ${discsToUpdate.length} discs to check for Spotify links.`,
        );
      }

      if (discsToUpdate.length === 0) {
        if (summaryOnly) {
          this.logDailySummary(updatedCount, noMatchCount, queryErrorCount);
        } else {
          this.logger.log('Found 0 discs to check. Daily check finished.');
        }
        return;
      }

      let token: string | null;
      try {
        token = await this.spotifyClient.getOptionalAccessToken();
      } catch (error) {
        if (summaryOnly) {
          queryErrorCount++;
          this.logDailySummary(updatedCount, noMatchCount, queryErrorCount);
          return;
        }
        this.logger.error('Error getting Spotify token', error);
        token = null;
      }
      if (!token) {
        if (summaryOnly) {
          queryErrorCount++;
          this.logDailySummary(updatedCount, noMatchCount, queryErrorCount);
        } else {
          this.logger.error(
            'Could not get Spotify token. Daily check finished.',
          );
        }
        return;
      }

      for (const disc of discsToUpdate) {
        try {
          const normalizedArtist = this.normalizeString(disc.artist.name);
          const normalizedAlbum = this.normalizeString(disc.name);
          // Use normalized strings for strict search too, or at least for handling quotes
          const query = encodeURIComponent(
            `album:${normalizedAlbum} artist:${normalizedArtist}`,
          );
          const url = this.spotifyClient.albumSearchUrl(query);
          if (!summaryOnly) {
            this.logger.log(`Spotify Search URL: ${url}`);
          }
          let data: Awaited<
            ReturnType<
              SpotifyClientCredentialsService['searchAlbumsByRawQuery']
            >
          > = null;
          try {
            data = await this.spotifyClient.searchAlbumsByRawQuery(query);
            if (!data) {
              throw new Error('Spotify search returned no response');
            }
          } catch (error) {
            queryErrorCount++;
            if (!summaryOnly) {
              this.logger.error(`Error searching album ${disc.name}`, error);
            }
          }

          if (data?.albums?.items?.length > 0) {
            const album = data.albums.items[0];
            disc.link = album.external_urls.spotify;
            disc.image = album.images?.[0]?.url || null;
            disc.verified = true;

            await this.discRepo.save(disc);
            updatedCount++;
            if (!summaryOnly) {
              this.logger.log(
                `Updated Spotify link for: ${disc.artist.name} - ${disc.name}`,
              );
            }
          } else {
            if (!summaryOnly) {
              this.logger.log(
                `Album not found on Spotify strict search. Trying Bandcamp for: ${disc.artist.name} - ${disc.name}`,
              );
            }

            // Fallback to Bandcamp
            const bandcampResult = summaryOnly
              ? await this.searchBandcamp(disc.artist.name, disc.name, true)
              : await this.searchBandcamp(disc.artist.name, disc.name);

            if (bandcampResult.status === 'error') {
              queryErrorCount++;
            }

            if (bandcampResult.status === 'found') {
              disc.link = bandcampResult.link;
              disc.image = bandcampResult.image || disc.image;
              disc.verified = true;

              await this.discRepo.save(disc);
              updatedCount++;
              if (!summaryOnly) {
                this.logger.log(
                  `Updated Bandcamp link for: ${disc.name} - ${disc.artist.name} (Bandcamp album: "${bandcampResult.albumName}", artist: "${bandcampResult.artistName}")`,
                );
              }
            } else {
              // Fallback: Try loose search (just name + artist)
              if (!summaryOnly) {
                this.logger.log(
                  `Strict search and bandcamp search failed. Trying loose search for: ${disc.name} - ${disc.artist.name}`,
                );
              }
              const looseQuery = encodeURIComponent(
                `${normalizedArtist} ${normalizedAlbum}`,
              );
              let looseData: Awaited<
                ReturnType<
                  SpotifyClientCredentialsService['searchAlbumsByRawQuery']
                >
              > = null;
              try {
                looseData =
                  await this.spotifyClient.searchAlbumsByRawQuery(looseQuery);
                if (!looseData) {
                  throw new Error('Spotify search returned no response');
                }
              } catch (error) {
                queryErrorCount++;
                if (!summaryOnly) {
                  this.logger.error(
                    `Error searching album ${disc.name}`,
                    error,
                  );
                }
              }

              if (looseData?.albums?.items?.length > 0) {
                const album = looseData.albums.items[0];
                const artistMatch = album.artists.some(
                  (artist) =>
                    this.normalizeString(artist.name).toLowerCase() ===
                    normalizedArtist.toLowerCase(),
                );

                if (artistMatch) {
                  disc.link = album.external_urls.spotify;
                  disc.image = album.images?.[0]?.url || null;
                  disc.verified = true;

                  await this.discRepo.save(disc);
                  updatedCount++;
                  if (!summaryOnly) {
                    this.logger.log(
                      `Updated Spotify link (loose search) for: ${disc.name} - ${disc.artist.name}`,
                    );
                  }
                } else {
                  if (!summaryOnly) {
                    this.logger.log(
                      `Loose search found album "${album.name}" but artist "${album.artists[0].name}" did not match expected "${disc.artist.name}"`,
                    );
                  }
                  if (disc.link !== 'No se encontró el álbum') {
                    disc.link = 'No se encontró el álbum';
                    await this.discRepo.save(disc);
                  }
                  noMatchCount++;
                }
              } else if (looseData && disc.link !== 'No se encontró el álbum') {
                disc.link = 'No se encontró el álbum';
                await this.discRepo.save(disc);
                noMatchCount++;
              } else if (looseData) {
                noMatchCount++;
              } else if (disc.link !== 'Error al realizar la búsqueda') {
                disc.link = 'Error al realizar la búsqueda';
                await this.discRepo.save(disc);
              }
            }
          }
        } catch (error) {
          queryErrorCount++;
          if (!summaryOnly) {
            this.logger.error(`Error searching album ${disc.name}`, error);
          }
          if (disc.link !== 'Error al realizar la búsqueda') {
            disc.link = 'Error al realizar la búsqueda';
            await this.discRepo.save(disc);
          }
        }
      }

      if (summaryOnly) {
        this.logDailySummary(updatedCount, noMatchCount, queryErrorCount);
      } else {
        this.logger.log(
          `Daily check completed. Updated links for ${updatedCount} discs.`,
        );
      }
    } catch (error) {
      if (summaryOnly) {
        queryErrorCount++;
        this.logDailySummary(updatedCount, noMatchCount, queryErrorCount);
      } else {
        this.logger.error('Error checking missing Spotify links', error);
      }
    }
  }

  private logDailySummary(
    updatedCount: number,
    noMatchCount: number,
    queryErrorCount: number,
  ): void {
    this.logger.log(
      `check-spotify finalizado: enlaces guardados=${updatedCount}, búsquedas sin coincidencia=${noMatchCount}, errores de consulta=${queryErrorCount}`,
    );
  }

  private normalizeString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/’/g, "'") // Handle smart quotes
      .trim();
  }

  private async searchBandcamp(
    artist: string,
    album: string,
    summaryOnly = false,
  ): Promise<BandcampSearchResult> {
    try {
      const query = encodeURIComponent(`${artist} ${album}`);
      const url = `https://bandcamp.com/search?q=${query}&item_type=a`;
      if (!summaryOnly) {
        this.logger.log(`Bandcamp Search URL: ${url}`);
      }
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        if (!summaryOnly) {
          this.logger.warn(`Bandcamp search failed: ${response.statusText}`);
        }
        return { status: 'error' };
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Find the first album result
      const firstResult = $('ul.result-items li.searchresult').first();

      if (firstResult.length > 0) {
        const linkElement = firstResult.find('a').first();
        const linkUrl = linkElement.attr('href');

        if (linkUrl) {
          // Get image and upgrade to high-res (1200x1200) by replacing suffix with _10
          const imgElement = firstResult.find('img').first();
          let image = imgElement.attr('src') || null;
          if (image) {
            image = image.replace(/_\d+\./, '_10.');
          }

          // Extract album name from the heading
          const albumName = firstResult.find('.heading').text().trim() || null;

          // Extract artist name from the subhead ("by ArtistName")
          const subheadText = firstResult.find('.subhead').text().trim();
          const artistName = subheadText
            ? subheadText.replace(/^by\s+/i, '').trim()
            : null;

          if (!summaryOnly) {
            this.logger.log(
              `Bandcamp result — Album: "${albumName}", Artist: "${artistName}", Image: ${image}`,
            );
          }

          return {
            status: 'found',
            link: linkUrl.split('?')[0],
            image,
            albumName,
            artistName,
          };
        }
      }

      return { status: 'not-found' };
    } catch (error) {
      if (!summaryOnly) {
        this.logger.error(
          `Error searching Bandcamp for ${artist} - ${album}`,
          error,
        );
      }
      return { status: 'error' };
    }
  }
}
