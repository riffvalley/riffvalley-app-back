import { Module } from '@nestjs/common';
import { I18nModule, I18nJsonLoader, HeaderResolver } from 'nestjs-i18n';
import * as path from 'path';

@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loader: I18nJsonLoader,
      loaderOptions: {
        path: path.join(__dirname, '../i18n/'), // Asegúrate de que esta ruta sea correcta
      },
      resolvers: [new HeaderResolver(['x-custom-lang'])],
    }),
  ],
})
export class I18nConfigModule {}
