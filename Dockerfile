FROM node:24-bookworm-slim AS build

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos necesarios
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Instala las dependencias
RUN apt-get update && apt-get install -y procps && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.28.7 --activate && pnpm install --frozen-lockfile

# Copia todo el proyecto
COPY . .

# Construye la aplicación
RUN pnpm run build

# Expone el puerto
EXPOSE 3000

# Comando para ejecutar la aplicación
CMD ["pnpm", "run", "start:prod"]
