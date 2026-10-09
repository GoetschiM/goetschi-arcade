FROM node:22-alpine
RUN apk add --no-cache nginx && mkdir -p /run/nginx /data/arcade
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY public/ /usr/share/nginx/html/
COPY server/ /opt/arcade/server/
EXPOSE 80
VOLUME ["/data/arcade"]
CMD ["/bin/sh", "-c", "node /opt/arcade/server/index.mjs & exec nginx -g 'daemon off;'"]
