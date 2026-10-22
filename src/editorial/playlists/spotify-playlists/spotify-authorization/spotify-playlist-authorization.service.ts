import { Injectable } from '@nestjs/common';
import { SpotifyConnectionService } from 'src/integrations/spotify-integration/oauth/spotify-connection.service';

@Injectable()
export class SpotifyPlaylistAuthorizationService {
  constructor(private readonly spotifyConnection: SpotifyConnectionService) {}

  startSpotifyConnection() {
    return this.spotifyConnection.startSpotifyConnection();
  }

  completeSpotifyConnection(code: string, state: string) {
    return this.spotifyConnection.completeSpotifyConnection(code, state);
  }

  getSpotifyConnection() {
    return this.spotifyConnection.getSpotifyConnection();
  }

  disconnectSpotify() {
    return this.spotifyConnection.disconnectSpotify();
  }

  getValidAccessToken(requiredScopes: string[] = []): Promise<string> {
    return this.spotifyConnection.getValidAccessToken(requiredScopes);
  }
}
