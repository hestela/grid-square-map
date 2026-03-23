FROM nginx:alpine

# curl + bash needed to run setup.sh during build
RUN apk add --no-cache curl bash

WORKDIR /usr/share/nginx/html

# Copy source files (generated assets are excluded via .dockerignore)
COPY . .

# Download all assets (Leaflet, world.geojson, states.geojson) into the image
RUN bash setup.sh

EXPOSE 80
