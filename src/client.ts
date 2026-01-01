/**
 * SwarmPulse 3D - Worker 用戶端
 * 負責收集本機系統資訊並定時發送心跳給 Server
 */

import { hostname, cpus, totalmem, freemem, networkInterfaces } from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { AppRouter, ContainerInfo } from './contract';
import type { RouterClient } from '@orpc/server';

const execAsync = promisify(exec);

// ============================================
// 配置
// ============================================

// Server URL（可透過環境變數覆蓋）
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// 心跳間隔（毫秒）
const HEARTBEAT_INTERVAL_MS = 1000;

// 節點 ID（使用 hostname + 隨機後綴確保唯一性）
const NODE_ID = `${hostname()}-${Math.random().toString(36).substring(2, 8)}`;

// ============================================
// 系統資訊收集
// ============================================

// 上一次的 CPU 時間，用於計算使用率
let lastCpuInfo = cpus();
let lastCpuTime = Date.now();

/**
 * 計算 CPU 使用率
 * 基於兩次採樣之間的 CPU 時間變化
 */
function getCpuUsage(): number {
    const currentCpus = cpus();
    const now = Date.now();

    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < currentCpus.length; i++) {
        const cpu = currentCpus[i];
        const lastCpu = lastCpuInfo[i];

        // 計算各狀態的時間差
        const idleDiff = cpu.times.idle - (lastCpu?.times.idle || 0);
        const userDiff = cpu.times.user - (lastCpu?.times.user || 0);
        const niceDiff = cpu.times.nice - (lastCpu?.times.nice || 0);
        const sysDiff = cpu.times.sys - (lastCpu?.times.sys || 0);
        const irqDiff = cpu.times.irq - (lastCpu?.times.irq || 0);

        totalIdle += idleDiff;
        totalTick += idleDiff + userDiff + niceDiff + sysDiff + irqDiff;
    }

    // 更新上次記錄
    lastCpuInfo = currentCpus;
    lastCpuTime = now;

    // 計算使用率（避免除以零）
    if (totalTick === 0) {
        return 0;
    }

    const usage = ((totalTick - totalIdle) / totalTick) * 100;
    return Math.round(usage * 100) / 100; // 保留兩位小數
}

/**
 * 獲取記憶體使用率
 */
function getMemoryUsage(): number {
    const total = totalmem();
    const free = freemem();
    const used = total - free;
    const usage = (used / total) * 100;
    return Math.round(usage * 100) / 100; // 保留兩位小數
}

/**
 * 獲取磁碟使用率
 */
async function getDiskUsage(): Promise<number | undefined> {
    try {
        const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}'");
        return parseFloat(stdout.replace('%', ''));
    } catch {
        return undefined;
    }
}

/**
 * 獲取節點角色
 */
async function getRole(): Promise<'manager' | 'worker' | undefined> {
    try {
        const { stdout } = await execAsync("docker info --format '{{.Swarm.ControlAvailable}}'");
        return stdout.trim() === 'true' ? 'manager' : 'worker';
    } catch {
        return undefined;
    }
}

/**
 * 獲取本地 IP
 */
function getIp(): string | undefined {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            // 跳過非 IPv4 和回環位址
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return undefined;
}

/**
 * 獲取運行中的 Containers
 */
async function getContainers(): Promise<ContainerInfo[] | undefined> {
    try {
        const { stdout } = await execAsync('docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}"');
        return stdout.trim().split('\n').filter(Boolean).map(line => {
            const [id, name, image, status] = line.split('|');
            return { id, name, image, status };
        });
    } catch {
        return undefined;
    }
}

// ============================================
// oRPC Client
// ============================================

const link = new RPCLink({
    url: SERVER_URL,
    // 設定超時時間
    fetch: (input, init) =>
        fetch(input, {
            ...init,
            signal: AbortSignal.timeout(5000),
        }),
});

const client: RouterClient<AppRouter> = createORPCClient(link);

// ============================================
// 心跳邏輯
// ============================================

let consecutiveFailures = 0;
const MAX_FAILURES_LOG = 5; // 連續失敗多少次後減少日誌輸出

/**
 * 發送心跳
 */
async function sendHeartbeat(): Promise<void> {
    // 並行取得非同步資料
    const [diskUsage, role, containers] = await Promise.all([
        getDiskUsage(),
        getRole(),
        getContainers()
    ]);

    const nodeState = {
        nodeId: NODE_ID,
        hostname: hostname(),
        cpuUsage: getCpuUsage(),
        memoryUsage: getMemoryUsage(),
        diskUsage,
        role,
        ip: getIp(),
        containers,
        timestamp: Date.now(),
    };

    try {
        await client.heartbeat(nodeState);

        if (consecutiveFailures > 0) {
            console.log(`[Client] ✅ 連線恢復，已重新與 Server 建立連接`);
        }
        consecutiveFailures = 0;

        // 正常運行時的狀態輸出（每 10 秒一次）
        if (Date.now() % 10000 < HEARTBEAT_INTERVAL_MS) {
            console.log(
                `[Client] 💓 心跳: CPU=${nodeState.cpuUsage.toFixed(1)}%, ` +
                `Memory=${nodeState.memoryUsage.toFixed(1)}%`
            );
        }
    } catch (error) {
        consecutiveFailures++;

        // 控制錯誤日誌輸出頻率
        if (consecutiveFailures <= MAX_FAILURES_LOG || consecutiveFailures % 10 === 0) {
            console.error(
                `[Client] ❌ 心跳失敗 (${consecutiveFailures}): ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}

// ============================================
// 啟動
// ============================================

console.log('╔════════════════════════════════════════════════╗');
console.log('║         🔧 SwarmPulse 3D Worker 啟動           ║');
console.log('╠════════════════════════════════════════════════╣');
console.log(`║  📛 節點 ID: ${NODE_ID.padEnd(29)}║`);
console.log(`║  🖥️  主機名: ${hostname().padEnd(29)}║`);
console.log(`║  📡 Server: ${SERVER_URL.padEnd(30)}║`);
console.log(`║  ⏱️  間隔: ${HEARTBEAT_INTERVAL_MS}ms                            ║`);
console.log('╚════════════════════════════════════════════════╝');

// 立即發送第一次心跳
sendHeartbeat();

// 設定定時心跳
const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

// 優雅關閉
process.on('SIGINT', () => {
    console.log('\n[Client] 正在關閉...');
    clearInterval(heartbeatTimer);
    console.log('[Client] 已關閉');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Client] 收到終止信號，正在關閉...');
    clearInterval(heartbeatTimer);
    console.log('[Client] 已關閉');
    process.exit(0);
});
