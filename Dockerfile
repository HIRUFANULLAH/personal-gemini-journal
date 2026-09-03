# ---- build stage: compile the client bundle and the API server ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# emits dist/ (client assets) and dist/server.cjs (bundled Express API)
RUN npm run build


# ---- runtime stage: serve the API *and* the static client from Node ----
FROM node:20-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

# production dependencies only — server.cjs is bundled with --packages=external
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Cloud Run overrides this; server.ts reads process.env.PORT
ENV PORT=8080
EXPOSE 8080

# drop root
USER node

CMD ["node", "dist/server.cjs"]
