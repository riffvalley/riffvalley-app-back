import { IsUrl, MaxLength } from 'class-validator';

export class LinkSpotifyPlaylistDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  spotifyUrl: string;
}
