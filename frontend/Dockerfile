FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["sh","-c","npm run dev -- -p 3000 -H 0.0.0.0"]
