# ZODIAK AI : API + worker intégré + interface web (aucune dépendance npm à installer).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps ./apps
COPY catalog ./catalog
COPY workflows ./workflows
ENV NODE_ENV=production DATA_DIR=/data WEB_DIR=/app/apps/web/public CATALOG_DIR=/app/catalog WORKFLOWS_DIR=/app/workflows NODE_NO_WARNINGS=1
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/src/server.ts"]
