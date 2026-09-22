# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# angular.json's build target defaults to the "production" configuration,
# which swaps in src/environments/environment.prod.ts (apiBaseUrl: "/api")
# via fileReplacements — no hardcoded backend host/port in the output.
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist/printsetu-frontend/browser /usr/share/nginx/html
COPY nginx.frontend.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
