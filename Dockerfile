# --- Etapa 1: Construcción y Pruebas (builder) ---
FROM node:24-alpine AS builder
WORKDIR /app

# Copiamos solo los archivos de dependencias primero para aprovechar la caché de Docker
COPY package*.json ./
RUN npm ci

# ¡AQUÍ ESTABA EL ERROR 1! Faltaba esta línea para copiar el resto del código
COPY . .

# Ejecutar las pruebas
RUN npm test

# --- Etapa 2: Imagen final ligera ---
FROM node:24-alpine
WORKDIR /app

# Copiamos dependencias y configuraciones
COPY package*.json ./
RUN npm ci --omit=dev

# ¡AQUÍ ESTABA EL ERROR 2! Copiamos los archivos sueltos porque no tienes carpeta "src"
COPY --from=builder /app/server.js ./
COPY --from=builder /app/db.js ./
COPY --from=builder /app/public ./public

# Producción arranca con node directamente: npm no es necesario en la imagen final.
# Retirarlo reduce superficie de ataque y elimina dependencias globales vulnerables.
RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
    && mkdir -p /app/data \
    && chown -R node:node /app
USER node

EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "server.js"]
