# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system nodeapp && useradd --system --gid nodeapp --home /app nodeapp

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/lib ./lib

USER nodeapp
EXPOSE 3002
CMD ["npm", "start"]
