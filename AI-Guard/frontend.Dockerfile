# ---- stage 1: сборка фронтенда ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN touch .npmrc
COPY .npmrc* ./

RUN npm ci

COPY . .
RUN npm run build

# ---- stage 2: nginx ----
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
