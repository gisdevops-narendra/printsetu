FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

RUN npm run prisma:generate && npm run build
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
# tsconfig.json: not needed to run dist/main.js, but IS needed by `npx
# prisma db seed` (runs prisma/seed.ts straight through ts-node — see the
# "prisma.seed" field below — rather than a compiled dist/ output).
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
