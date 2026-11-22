# Optionales Multi-Arch-Container-Template (linux/amd64 + linux/arm64 für Docker / Raspberry Pi)
# Bauen (Multi-Arch):
#   docker buildx build --platform linux/amd64,linux/arm64 -f deploy/docker/Dockerfile -t sidelineos-core:alpha .

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
ARG VITE_APP_BRAND_NAME=SidelineOS
ENV VITE_APP_BRAND_NAME=${VITE_APP_BRAND_NAME}
COPY . .
RUN npm run build && npm run build:sdk

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/.sidelineos-data/plugins && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/tsx", "server.ts"]
