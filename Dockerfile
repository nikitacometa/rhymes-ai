# ==========================================
# Stage 1: Build
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package files
COPY package*.json ./
COPY prisma ./prisma/

# Устанавливаем ВСЕ зависимости (нужны dev для сборки)
RUN npm ci --ignore-scripts

# Копируем исходники
COPY . .

# Генерируем Prisma клиент и собираем
RUN npx prisma generate
RUN npm run build

# ==========================================
# Stage 2: Production
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Копируем package files
COPY package*.json ./
COPY prisma ./prisma/

# Устанавливаем ТОЛЬКО production зависимости
RUN npm ci --omit=dev --ignore-scripts

# Генерируем Prisma клиент (нужен в runtime)
RUN npx prisma generate

# Копируем собранное приложение
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
