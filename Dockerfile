FROM node:20-bookworm-slim AS build

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos necesarios
COPY package*.json ./

# Instala las dependencias
RUN apt-get update && apt-get install -y procps && rm -rf /var/lib/apt/lists/*
RUN npm install

# Copia todo el proyecto
COPY . .

# Construye la aplicación
RUN npm run build

# Expone el puerto
EXPOSE 3000

# Comando para ejecutar la aplicación
CMD ["npm", "run", "start:prod"]
