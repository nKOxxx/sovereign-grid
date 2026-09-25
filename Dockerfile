# Sovereign Grid — single-container production image (Fly.io / any Docker host).
# Builds the frontend, then serves API + SPA from one Express process
# (server/src/boot.js: migrate + idempotent seed + listen).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist /app/dist
COPY server/ ./
ENV PORT=8080 NODE_ENV=production SG_BOOT_MIGRATE=1 SG_STATIC_DIR=/app/dist
EXPOSE 8080
CMD ["node", "src/boot.js"]
