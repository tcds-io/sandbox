# Two images from one file:
#   docker build --target api -t sandbox-api .
#   docker build --target app -t sandbox-app .
# docker-compose.yml builds and runs both.

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/sandbox-api/package.json packages/sandbox-api/
COPY packages/sandbox-app/package.json packages/sandbox-app/
RUN npm ci
COPY packages packages
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /srv
ENV NODE_ENV=production PORT=4000
COPY package.json package-lock.json ./
COPY packages/sandbox-api/package.json packages/sandbox-api/
COPY packages/sandbox-app/package.json packages/sandbox-app/
RUN npm ci --omit=dev -w sandbox-api && npm cache clean --force
COPY --from=build /repo/packages/sandbox-api/dist packages/sandbox-api/dist
WORKDIR /srv/packages/sandbox-api
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/main.js"]

FROM nginx:1.27-alpine AS app
ENV SANDBOX_API_URL=http://api:4000
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/packages/sandbox-app/dist /usr/share/nginx/html
EXPOSE 8080
