/**
 * SwarmPulse 3D - 共享契約層
 * 定義 oRPC 路由和 Zod Schema
 */

import { os } from '@orpc/server';
import * as z from 'zod';

// ============================================
// Schema 定義
// ============================================

/**
 * Container 資訊 Schema
 */
export const ContainerInfoSchema = z.object({
    id: z.string(),
    name: z.string(),
    image: z.string(),
    status: z.string(),
});

export type ContainerInfo = z.infer<typeof ContainerInfoSchema>;

/**
 * 節點狀態 Schema
 * 描述單一 Swarm 節點的運行狀態
 */
export const NodeStateSchema = z.object({
    // 節點唯一識別碼
    nodeId: z.string().min(1),
    // 主機名稱
    hostname: z.string(),
    // CPU 使用率（0-100）
    cpuUsage: z.number().min(0).max(100),
    // 記憶體使用率（0-100）
    memoryUsage: z.number().min(0).max(100),
    // 磁碟使用率（0-100，可選）
    diskUsage: z.number().min(0).max(100).optional(),
    // 節點角色（可選）
    role: z.enum(['manager', 'worker']).optional(),
    // IP 位址（可選）
    ip: z.string().optional(),
    // Container 列表（可選）
    containers: z.array(ContainerInfoSchema).optional(),
    // 心跳時間戳
    timestamp: z.number(),
});

export type NodeState = z.infer<typeof NodeStateSchema>;

/**
 * 叢集狀態 Schema
 * 描述整個叢集的狀態快照
 */
export const ClusterStatusSchema = z.object({
    // 所有活躍節點
    nodes: z.array(NodeStateSchema),
    // 最後更新時間
    lastUpdate: z.number(),
});

export type ClusterStatus = z.infer<typeof ClusterStatusSchema>;

// ============================================
// oRPC Procedures
// ============================================

/**
 * 心跳程序 - Worker 節點定時呼叫以回報狀態
 */
export const heartbeat = os
    .input(NodeStateSchema)
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
        // 實際邏輯在 server.ts 中實現
        // 這裡只定義契約
        return { success: true };
    });

/**
 * 獲取叢集狀態 - 前端輪詢呼叫以獲取最新狀態
 */
export const getClusterStatus = os
    .output(ClusterStatusSchema)
    .handler(async () => {
        // 實際邏輯在 server.ts 中實現
        return { nodes: [], lastUpdate: Date.now() };
    });

// ============================================
// Router 定義
// ============================================

export const router = {
    heartbeat,
    getClusterStatus,
};

export type AppRouter = typeof router;
