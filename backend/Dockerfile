FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

COPY assets ./assets

EXPOSE 3001

CMD ["sh","-c","npm run prisma:generate && npm run db:push && npm run dev"]
