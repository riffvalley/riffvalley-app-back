FROM node:20-bookworm-slim AS build

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos necesarios
COPY package.json yarn.lock ./

# Instala las dependencias
RUN apt-get update && apt-get install -y procps && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare yarn@1.22.22 --activate && yarn install --frozen-lockfile

# Copia todo el proyecto
COPY . .

# Construye la aplicación
RUN yarn build

# Expone el puerto
EXPOSE 3000

# Comando para ejecutar la aplicación
CMD ["yarn", "start:prod"]
