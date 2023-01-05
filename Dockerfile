# Build image
# --------------------------------------
FROM node:16-alpine AS build

WORKDIR /build

COPY package.json ./
COPY yarn.lock ./

RUN set -xe && \
    yarn install

COPY . ./

RUN set -xe && \
    yarn build

# Final image
# --------------------------------------
FROM node:16-alpine AS runtime-image

WORKDIR /app

COPY --from=build --chown=nobody:nobody /build /app

RUN set -xe && \
    chown nobody:nobody /app

USER nobody

CMD [ "yarn", "start" ]
