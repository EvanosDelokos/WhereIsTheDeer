# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.17.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"
WORKDIR /app
ENV NODE_ENV="production"

FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package-lock.json package.json ./
RUN npm ci

COPY . .

FROM base

COPY --from=build /app /app

# No mounted /data volume needed if DB is baked in
# VOLUME /data
# ENV DATABASE_URL="file:///data/sqlite.db"

EXPOSE 3000
CMD [ "npm", "run", "start" ]
