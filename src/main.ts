import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './winston.config';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://spammusic.netlify.app',
      'https://app.riffvalley.es',
    ], // Especifica los dominios permitidos
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Métodos permitidos
    credentials: true, // Si necesitas enviar cookies
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina campos desconocidos
      forbidNonWhitelisted: true,
      transform: true, // convierte tipos (p.ej. strings a números/fechas)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // import { SeedService } from './seeds/seed.service';
  // const seedService = app.get(SeedService);
  // await seedService.createSeed(); // Ejecuta el seed

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
