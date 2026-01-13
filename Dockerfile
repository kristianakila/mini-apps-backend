FROM node:18-alpine

WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm ci --only=production

# Копирование исходного кода
COPY . .

# Создание пользователя node
RUN addgroup -g 1001 -S nodejs
RUN adduser -S node -u 1001
USER node

# Открытие порта
EXPOSE 3000

# Запуск приложения
CMD ["node", "index.js"]
