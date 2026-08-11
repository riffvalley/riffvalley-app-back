# Riff Valley App API


1. Clonar proyecto
2. ```yarn install ```

3. Levantar la base de datos

```
docker-compose up -d
```

4. Subir a git 

```
git push heroku main
```

# Migraciones

npm run migration:generate src/migrations/MigrationName

npm run migration:run
