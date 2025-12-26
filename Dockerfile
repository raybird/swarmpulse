# 使用官方 Bun Alpine 映像
FROM oven/bun:1-alpine AS base

WORKDIR /app

# 安裝依賴階段
FROM base AS deps

# 複製 package 檔案
COPY package.json bun.lock* ./

# 安裝依賴
RUN bun install --frozen-lockfile

# 建置階段（可選，Bun 可以直接運行 TypeScript）
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 這裡可以加入建置步驟（如果需要）
# RUN bun run build

# 執行階段
FROM base AS runner

WORKDIR /app

# 建立非 root 用戶
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bunjs

# 複製必要檔案
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=bunjs:nodejs . .

# 設定用戶
USER bunjs

# 預設環境變數
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 預設 Server 模式，可透過環境變數切換
ENV ENTRYPOINT_MODE=server

# 暴露端口（僅 Server 模式使用）
EXPOSE 3000

# 使用 shell 形式以支援環境變數
CMD if [ "$ENTRYPOINT_MODE" = "client" ]; then \
      bun run src/client.ts; \
    else \
      bun run src/server.ts; \
    fi
