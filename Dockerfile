# One image running the whole sandbox:
#   API (provider endpoints + /_sandbox control API) on 15080
#   UI on 15088
#
#   docker build -t sandbox .
#   docker run -p 15080:15080 -p 15088:15088 -e ASAAS_WEBHOOK_URL=http://host.docker.internal:3000/webhooks/asaas sandbox

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/sandbox-api/package.json packages/sandbox-api/
COPY packages/sandbox-app/package.json packages/sandbox-app/
RUN npm ci
COPY packages packages
RUN npm run build

FROM node:22-alpine
WORKDIR /srv
ENV NODE_ENV=production \
    PORT=15080 \
    APP_PORT=15088 \
    PUBLIC_URL=http://localhost:15080
COPY package.json package-lock.json ./
COPY packages/sandbox-api/package.json packages/sandbox-api/
COPY packages/sandbox-app/package.json packages/sandbox-app/
RUN npm ci --omit=dev -w sandbox-api && npm cache clean --force
COPY --from=build /repo/packages/sandbox-api/dist packages/sandbox-api/dist
COPY --from=build /repo/packages/sandbox-app/dist app
COPY docker/start.mjs ./
USER node
EXPOSE 15080 15088
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:15080/health && wget -qO- http://127.0.0.1:15088/ > /dev/null || exit 1
CMD ["node", "start.mjs"]
