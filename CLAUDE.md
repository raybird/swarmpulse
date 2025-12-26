# SwarmPulse 3D

## 專案概述
分散式 Docker Swarm 3D 視覺化監控系統。

## 技術棧
- Runtime: Bun
- RPC: oRPC
- 3D Engine: PlayCanvas (CDN)
- Container: Docker Swarm

## 開發指令

```bash
# 安裝依賴
bun install

# 啟動 Server
bun run server

# 啟動 Client
bun run client

# Docker 建置
docker compose build

# Docker 啟動
docker compose up
```

## 結構
- `src/contract.ts` - oRPC Schema
- `src/server.ts` - Server 邏輯
- `src/client.ts` - Client 邏輯
- `public/` - PlayCanvas 前端
