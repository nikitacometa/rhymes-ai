# ==========================================
# Stage 1: Dependencies (кэшируется отдельно!)
# ==========================================
FROM node:20-alpine AS deps

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Копируем ТОЛЬКО package files — этот слой кэшируется
COPY package*.json ./
COPY prisma ./prisma/

# Устанавливаем зависимости
RUN npm ci

# Генерируем Prisma клиент
RUN npx prisma generate

# ==========================================
# Stage 2: Build
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем node_modules из deps (уже с Prisma client!)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Копируем исходники
COPY . .

# Собираем
RUN npm run build

# ==========================================
# Stage 3: Production
# ==========================================
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production

# Копируем package.json и prisma
COPY package*.json ./
COPY prisma ./prisma/

# Устанавливаем ТОЛЬКО production deps
RUN npm ci --omit=dev

# Генерируем Prisma клиент для production
RUN npx prisma generate

# Копируем собранное приложение
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
