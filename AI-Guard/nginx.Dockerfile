FROM nginx:alpine
WORKDIR /app

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ⚠️ НЕ копируем сертификаты!

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
