FROM node:18-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY src/ src/
COPY tsconfig.json ./
RUN npm run build

FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/dist/ dist/

EXPOSE 10000

CMD ["node", "dist/index.js"]
