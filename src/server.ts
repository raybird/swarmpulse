/**
 * SwarmPulse 3D - oRPC 伺服器
 * 負責收集所有 Swarm Worker 的狀態並提供給前端
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { RPCHandler } from '@orpc/server/node';
import { CORSPlugin } from '@orpc/server/plugins';
import { onError, os } from '@orpc/server';
import * as z from 'zod';
import { NodeStateSchema, ClusterStatusSchema, type NodeState } from './contract';

// ============================================
// 狀態管理
// ============================================

// 存儲所有節點狀態的 Map
const clusterState = new Map<string, NodeState>();

// 節點超時時間（毫秒）- 超過此時間無心跳則視為離線
const NODE_TIMEOUT_MS = 5000;

/**
 * 清理超時節點
 */
function cleanupStaleNodes(): void {
    const now = Date.now();
    for (const [nodeId, state] of clusterState.entries()) {
        if (now - state.timestamp > NODE_TIMEOUT_MS) {
            console.log(`[Server] 節點離線: ${state.hostname} (${nodeId})`);
            clusterState.delete(nodeId);
        }
    }
}

// 每秒清理一次超時節點
setInterval(cleanupStaleNodes, 1000);

// ============================================
// oRPC Procedures 實現
// ============================================

/**
 * 心跳程序 - Worker 節點定時呼叫以回報狀態
 */
const heartbeat = os
    .input(NodeStateSchema)
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
        const previousState = clusterState.get(input.nodeId);
        clusterState.set(input.nodeId, input);

        if (!previousState) {
            console.log(`[Server] 新節點加入: ${input.hostname} (${input.nodeId})`);
        }

        return { success: true };
    });

/**
 * 獲取叢集狀態 - 前端輪詢呼叫以獲取最新狀態
 */
const getClusterStatus = os
    .output(ClusterStatusSchema)
    .handler(async () => {
        const nodes = Array.from(clusterState.values());
        return {
            nodes,
            lastUpdate: Date.now(),
        };
    });

// Router 定義
const router = {
    heartbeat,
    getClusterStatus,
};

// ============================================
// HTTP 伺服器
// ============================================

// MIME 類型對照表
const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

/**
 * 處理靜態檔案請求
 */
async function serveStaticFile(
    req: IncomingMessage,
    res: ServerResponse,
    urlPath: string
): Promise<boolean> {
    // 預設為 index.html
    let filePath = urlPath === '/' ? '/index.html' : urlPath;

    // 防止目錄遍歷攻擊
    if (filePath.includes('..')) {
        res.statusCode = 403;
        res.end('Forbidden');
        return true;
    }

    const publicDir = join(import.meta.dir, '..', 'public');
    const fullPath = join(publicDir, filePath);

    try {
        const fileStat = await stat(fullPath);
        if (!fileStat.isFile()) {
            return false;
        }

        const content = await readFile(fullPath);
        const ext = extname(fullPath);
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'no-cache');
        res.end(content);
        return true;
    } catch {
        return false;
    }
}

// 建立 oRPC Handler
const rpcHandler = new RPCHandler(router, {
    plugins: [new CORSPlugin()],
    interceptors: [
        onError((error) => {
            console.error('[oRPC Error]', error);
        }),
    ],
});

// 建立 HTTP 伺服器
const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // 處理 CORS 預檢請求
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.statusCode = 204;
        res.end();
        return;
    }

    // 嘗試處理 oRPC 請求（所有 POST 請求）
    if (req.method === 'POST') {
        const result = await rpcHandler.handle(req, res, {
            context: { headers: req.headers },
        });

        if (result.matched) {
            return;
        }
    }

    // 嘗試提供靜態檔案
    const served = await serveStaticFile(req, res, url.pathname);
    if (served) {
        return;
    }

    // 404 Not Found
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
});

// 啟動伺服器
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║         🚀 SwarmPulse 3D Server 啟動           ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║  📡 服務位址: http://${HOST}:${PORT}               ║`);
    console.log('║  🎮 3D 視覺化: http://localhost:3000           ║');
    console.log('║  ⏰ 節點超時: 5 秒                             ║');
    console.log('╚════════════════════════════════════════════════╝');
});

// 優雅關閉
process.on('SIGINT', () => {
    console.log('\n[Server] 正在關閉...');
    server.close(() => {
        console.log('[Server] 已關閉');
        process.exit(0);
    });
});
