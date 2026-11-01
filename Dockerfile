FROM node:22-bookworm-slim

# ffmpeg (conversions), python3 (yt-dlp), outils de compilation (better-sqlite3 si pas de binaire précompilé)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl make g++ git \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
ENV NODE_ENV=production PORT=3000
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD curl -fs http://localhost:${PORT}/health || exit 1
CMD ["node", "index.js"]
