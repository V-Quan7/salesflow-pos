FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm install

COPY tsconfig.base.json ./
COPY apps/api ./apps/api

RUN cd apps/api && DATABASE_URL="postgresql://salesflow:salesflow_dev_password@localhost:5432/salesflow?schema=public" npx prisma generate --schema prisma/schema.prisma

EXPOSE 3001

CMD ["npm", "run", "dev:api"]
