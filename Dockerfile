FROM node:24-alpine

WORKDIR /app

COPY . .

RUN yarn && yarn build

CMD [ "yarn", "start" ]