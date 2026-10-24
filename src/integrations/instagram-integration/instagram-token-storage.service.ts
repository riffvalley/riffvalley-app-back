import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  instagramErrorMessage,
  instagramResponseDiagnostic,
  sanitizeInstagramLogValue,
} from './helpers/instagram-log-sanitizer';

@Injectable()
export class InstagramTokenStorageService {
  // Preserve the existing logger context while the persistence code moves.
  private readonly logger = new Logger('InstagramService');

  // En Heroku el filesystem es efímero: un .env escrito a mano no sobrevive
  // a un restart/redeploy del dyno. Si hay credenciales de la Heroku
  // Platform API, persistimos ahí para que el token sobreviva; si no
  // (entorno local), caemos al .env de siempre.
  async persistAccessToken(token: string): Promise<void> {
    const herokuApiKey = process.env.IG_HEROKU_API_TOKEN;
    const herokuAppName = process.env.IG_HEROKU_APP_NAME;

    if (herokuApiKey && herokuAppName) {
      try {
        const res = await fetch(
          `https://api.heroku.com/apps/${herokuAppName}/config-vars`,
          {
            method: 'PATCH',
            headers: {
              Accept: 'application/vnd.heroku+json; version=3',
              Authorization: `Bearer ${herokuApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ IG_ACCESS_TOKEN: token }),
          },
        );

        if (!res.ok) {
          const responseBody = await res.text();
          this.logger.error(
            `Could not persist refreshed Instagram token to Heroku config vars: ${res.status} ${instagramResponseDiagnostic(responseBody, [token, herokuApiKey])}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Could not persist refreshed Instagram token to Heroku config vars: ${this.safeErrorMessage(error, token, herokuApiKey)}`,
        );
      }
      return;
    }

    const envPath = path.join(process.cwd(), '.env');

    try {
      const contents = fs.readFileSync(envPath, 'utf8');
      const updated = contents.includes('IG_ACCESS_TOKEN=')
        ? contents.replace(/^IG_ACCESS_TOKEN=.*$/m, `IG_ACCESS_TOKEN=${token}`)
        : `${contents}\nIG_ACCESS_TOKEN=${token}\n`;
      fs.writeFileSync(envPath, updated);
    } catch (error) {
      this.logger.error(
        `Could not persist refreshed Instagram token to .env: ${this.safeErrorMessage(error, token)}`,
      );
    }
  }

  private safeLogValue(value: string, ...secrets: string[]) {
    return sanitizeInstagramLogValue(value, secrets).slice(0, 500);
  }

  private safeErrorMessage(error: unknown, ...secrets: string[]) {
    return this.safeLogValue(instagramErrorMessage(error), ...secrets);
  }
}
