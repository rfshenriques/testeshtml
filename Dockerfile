# Sitewright: API + workers + operator console in one image. Astro template builds run at runtime,
# so the full workspace (including apps/templates and its dependencies) ships in the image.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
ENV NODE_ENV=production PORT=3000 STORAGE_DRIVER=s3 BUILD_WORK_DIR=/tmp/sitewright/builds LOCAL_STORAGE_DIR=/tmp/sitewright/storage
EXPOSE 3000
CMD ["sh", "scripts/railway-start.sh"]
