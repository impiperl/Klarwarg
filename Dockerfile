# Klarwarg als ein Container: Editor (Expo-Export) und Server (gebündelt) in einem kleinen Image.
# Gebaut und gestartet wird über ./klarwarg.sh — siehe INSTALLATION.md.

FROM docker.io/library/node:22-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx expo export --platform web --clear && npm run build:server

FROM docker.io/library/node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    DATA_DIR=/data
COPY --from=build /app/server-build ./server-build
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/src/styles.css ./src/styles.css
COPY --from=build /app/node_modules/sql.js ./node_modules/sql.js
COPY deploy/entrypoint.sh /usr/local/bin/klarwarg-entrypoint
RUN chmod 0755 /usr/local/bin/klarwarg-entrypoint && mkdir -p /data
VOLUME /data
EXPOSE 4317
ENTRYPOINT ["klarwarg-entrypoint"]
CMD ["node", "server-build/index.mjs"]
