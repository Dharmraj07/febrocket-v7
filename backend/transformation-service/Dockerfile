FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache \
  ghostscript \
  poppler-utils \
  libvips \
  libc6-compat

COPY package*.json ./
RUN npm install --include=dev --no-fund --no-audit

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
