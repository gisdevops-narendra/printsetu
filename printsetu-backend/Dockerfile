FROM node:20-alpine AS build
WORKDIR /app
# Prisma's query engine needs libssl at both generate-time (to pick the
# right engine binary) and runtime; recent node:20-alpine base images
# don't ship it, which makes the container crash-loop on startup with
# "Error loading shared library libssl.so.1.1" even though the build
# itself succeeds.
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
