# Phase 1: 核心互動強化 - 詳細實作計畫

> **階段目標**: 提升基本用戶體驗，讓用戶能與 3D 節點進行有意義的互動

**文件建立日期**: 2026-01-01  
**最後更新日期**: 2026-01-01  
**預估總工時**: 13 小時

---

## 📋 功能總覽

| # | 功能 | 優先級 | 預估工時 | 狀態 |
|:---:|:---|:---:|:---:|:---:|
| 1.1 | Hover 資訊面板 | P0 | 4h | 🔲 |
| 1.2 | 點擊節點展開詳情 | P1 | 6h | 🔲 |
| 1.3 | 節點搜尋與篩選 | P2 | 3h | 🔲 |

---

## 1.1 Hover 資訊面板

### 功能描述
滑鼠懸停星球時，在滑鼠附近顯示該節點的即時狀態資訊面板。

### 視覺設計

```
┌─────────────────────────────┐
│ 🔮 swarm-worker-01          │
├─────────────────────────────┤
│ Node ID: abc123...          │
│ ─────────────────────────── │
│ CPU      ████████░░  78.5%  │
│ Memory   ██████░░░░  62.3%  │
│ ─────────────────────────── │
│ Uptime: 3d 14h 22m          │
│ Last heartbeat: 2s ago      │
└─────────────────────────────┘
```

### 技術實作步驟

#### Step 1: 建立 Raycast 滑鼠偵測 (public/game.js)
```javascript
// 新增全域變數
let hoveredNode = null;
let raycaster = null;

// 在 setupScene() 中初始化
function setupRaycast() {
    const canvas = app.graphicsDevice.canvas;
    
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height * 2 - 1);
        
        // 從相機發射射線
        const from = cameraEntity.getPosition();
        const to = screenToWorld(x, y, 100);
        
        const result = app.systems.rigidbody?.raycastFirst(from, to);
        // 或使用自定義碰撞偵測
        
        updateHoveredNode(result, e.clientX, e.clientY);
    });
}
```

#### Step 2: 建立自定義碰撞偵測
```javascript
function findHoveredNode(screenX, screenY) {
    const camera = cameraEntity.camera;
    const near = camera.screenToWorld(screenX, screenY, camera.nearClip);
    const far = camera.screenToWorld(screenX, screenY, camera.farClip);
    
    let closestNode = null;
    let closestDistance = Infinity;
    
    for (const [nodeId, nodeData] of nodeEntities) {
        const pos = nodeData.entity.getPosition();
        const dist = rayToSphereDistance(near, far, pos, CONFIG.NODE_BASE_SIZE);
        
        if (dist !== null && dist < closestDistance) {
            closestDistance = dist;
            closestNode = { nodeId, nodeData, distance: dist };
        }
    }
    
    return closestNode;
}

function rayToSphereDistance(rayOrigin, rayEnd, sphereCenter, sphereRadius) {
    // 射線與球體碰撞偵測演算法
    const rayDir = new pc.Vec3().sub2(rayEnd, rayOrigin).normalize();
    const L = new pc.Vec3().sub2(sphereCenter, rayOrigin);
    const tca = L.dot(rayDir);
    const d2 = L.dot(L) - tca * tca;
    const radius2 = sphereRadius * sphereRadius;
    
    if (d2 > radius2) return null;
    return tca - Math.sqrt(radius2 - d2);
}
```

#### Step 3: 建立 HTML 浮動面板 (public/index.html)
```html
<!-- 在 body 內新增 -->
<div id="hover-panel" class="hover-panel hidden">
    <div class="hover-header">
        <span class="hover-icon">🔮</span>
        <span id="hover-hostname" class="hover-hostname">-</span>
    </div>
    <div class="hover-body">
        <div class="hover-row">
            <span class="hover-label">Node ID:</span>
            <span id="hover-nodeid" class="hover-value">-</span>
        </div>
        <div class="hover-divider"></div>
        <div class="hover-row">
            <span class="hover-label">CPU</span>
            <div class="hover-bar">
                <div id="hover-cpu-bar" class="hover-bar-fill"></div>
            </div>
            <span id="hover-cpu-value" class="hover-value">-</span>
        </div>
        <div class="hover-row">
            <span class="hover-label">Memory</span>
            <div class="hover-bar">
                <div id="hover-mem-bar" class="hover-bar-fill"></div>
            </div>
            <span id="hover-mem-value" class="hover-value">-</span>
        </div>
        <div class="hover-divider"></div>
        <div class="hover-row">
            <span class="hover-label">Last heartbeat:</span>
            <span id="hover-heartbeat" class="hover-value">-</span>
        </div>
    </div>
</div>
```

#### Step 4: 浮動面板樣式 (public/index.html 或獨立 CSS)
```css
.hover-panel {
    position: fixed;
    pointer-events: none;
    background: rgba(10, 15, 30, 0.95);
    border: 1px solid rgba(100, 150, 255, 0.3);
    border-radius: 8px;
    padding: 12px 16px;
    min-width: 220px;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    transition: opacity 0.15s ease;
}

.hover-panel.hidden {
    opacity: 0;
    pointer-events: none;
}

.hover-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.hover-hostname {
    font-size: 14px;
    font-weight: 600;
    color: #7dd3fc;
}

.hover-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
    font-size: 12px;
}

.hover-label {
    color: #888;
    min-width: 60px;
}

.hover-value {
    color: #fff;
    font-family: monospace;
}

.hover-bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
}

.hover-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #22c55e, #eab308, #ef4444);
    transition: width 0.2s ease;
}

.hover-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 8px 0;
}
```

#### Step 5: 面板更新邏輯 (public/game.js)
```javascript
function updateHoverPanel(nodeData, mouseX, mouseY) {
    const panel = document.getElementById('hover-panel');
    
    if (!nodeData) {
        panel.classList.add('hidden');
        return;
    }
    
    panel.classList.remove('hidden');
    
    // 定位面板（避免超出視窗）
    const offset = 15;
    let x = mouseX + offset;
    let y = mouseY + offset;
    
    const rect = panel.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
        x = mouseX - rect.width - offset;
    }
    if (y + rect.height > window.innerHeight) {
        y = mouseY - rect.height - offset;
    }
    
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    
    // 更新內容
    const state = nodeData.state;
    document.getElementById('hover-hostname').textContent = state.hostname;
    document.getElementById('hover-nodeid').textContent = state.nodeId.slice(0, 12) + '...';
    document.getElementById('hover-cpu-value').textContent = state.cpuUsage.toFixed(1) + '%';
    document.getElementById('hover-mem-value').textContent = state.memoryUsage.toFixed(1) + '%';
    document.getElementById('hover-cpu-bar').style.width = state.cpuUsage + '%';
    document.getElementById('hover-mem-bar').style.width = state.memoryUsage + '%';
    
    // 計算 heartbeat 時間
    const ago = Math.round((Date.now() - state.timestamp) / 1000);
    document.getElementById('hover-heartbeat').textContent = `${ago}s ago`;
}
```

### 驗證方式
- [ ] 滑鼠移到星球上時面板出現
- [ ] 面板顯示正確的節點資訊
- [ ] 面板跟隨滑鼠移動
- [ ] 滑鼠移開時面板消失
- [ ] 拖曳相機時不觸發 hover

---

## 1.2 點擊節點展開詳情

### 功能描述
點擊星球彈出側邊浮動視窗，顯示該節點的完整詳情與 Container 列表。

### 視覺設計

```
┌────────────────────────────────────┐
│ ✕     swarm-worker-01 詳情         │
├────────────────────────────────────┤
│                                    │
│  ▸ 基本資訊                        │
│    Node ID: abc123def456...        │
│    IP: 10.0.0.5                    │
│    Role: Worker                    │
│                                    │
│  ▸ 資源使用率                       │
│    CPU:    ████████░░  78.5%       │
│    Memory: ██████░░░░  62.3%       │
│    Disk:   ███░░░░░░░  28.1%       │
│                                    │
│  ▸ 運行中的 Containers (3)          │
│    ┌──────────────────────────┐    │
│    │ 📦 nginx:latest          │    │
│    │    Status: Running       │    │
│    │    CPU: 2.3% | MEM: 64MB │    │
│    └──────────────────────────┘    │
│    ┌──────────────────────────┐    │
│    │ 📦 redis:7               │    │
│    │    Status: Running       │    │
│    └──────────────────────────┘    │
│                                    │
└────────────────────────────────────┘
```

### 後端變更

#### Step 1: 擴充 NodeStateSchema (src/contract.ts)
```typescript
// 新增 Container 資訊 Schema
export const ContainerInfoSchema = z.object({
    id: z.string(),
    name: z.string(),
    image: z.string(),
    status: z.string(),
    cpuPercent: z.number().optional(),
    memoryUsage: z.string().optional(), // e.g., "64MB / 512MB"
});

export type ContainerInfo = z.infer<typeof ContainerInfoSchema>;

// 擴充 NodeStateSchema
export const NodeStateSchema = z.object({
    nodeId: z.string().min(1),
    hostname: z.string(),
    cpuUsage: z.number().min(0).max(100),
    memoryUsage: z.number().min(0).max(100),
    diskUsage: z.number().min(0).max(100).optional(), // 新增
    timestamp: z.number(),
    role: z.enum(['manager', 'worker']).optional(), // 新增
    ip: z.string().optional(), // 新增
    containers: z.array(ContainerInfoSchema).optional(), // 新增
});
```

#### Step 2: 擴充 Client 收集資料 (src/client.ts)
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function getContainerList(): Promise<ContainerInfo[]> {
    try {
        const { stdout } = await execAsync(
            'docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}"'
        );
        
        return stdout.trim().split('\n').filter(Boolean).map(line => {
            const [id, name, image, status] = line.split('|');
            return { id, name, image, status };
        });
    } catch {
        return [];
    }
}

async function getDiskUsage(): Promise<number> {
    try {
        const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}'");
        return parseFloat(stdout.replace('%', ''));
    } catch {
        return 0;
    }
}
```

### 前端變更

#### Step 3: 建立詳情面板 HTML
```html
<div id="detail-panel" class="detail-panel hidden">
    <div class="detail-header">
        <button id="detail-close" class="detail-close">✕</button>
        <span id="detail-hostname" class="detail-title">-</span>
    </div>
    <div class="detail-body">
        <!-- 動態內容 -->
    </div>
</div>
```

#### Step 4: 點擊事件處理
```javascript
let selectedNodeId = null;

canvas.addEventListener('click', (e) => {
    if (isDragging) return;
    
    const node = findHoveredNode(e.clientX, e.clientY);
    
    if (node) {
        selectNode(node.nodeId);
    } else {
        deselectNode();
    }
});

function selectNode(nodeId) {
    selectedNodeId = nodeId;
    const nodeData = nodeEntities.get(nodeId);
    
    if (nodeData) {
        // 高亮選取的節點
        highlightNode(nodeData, true);
        // 淡化其他節點
        dimOtherNodes(nodeId);
        // 顯示詳情面板
        showDetailPanel(nodeData);
    }
}

function deselectNode() {
    if (selectedNodeId) {
        const nodeData = nodeEntities.get(selectedNodeId);
        if (nodeData) {
            highlightNode(nodeData, false);
        }
        resetNodeOpacity();
        selectedNodeId = null;
    }
    hideDetailPanel();
}
```

### 驗證方式
- [ ] 點擊星球彈出詳情面板
- [ ] 詳情面板顯示完整節點資訊
- [ ] 顯示 Container 列表（需部署 Container 測試）
- [ ] 選取節點高亮，其他淡化
- [ ] 點擊空白處或 ✕ 關閉面板

---

## 1.3 節點搜尋與篩選

### 功能描述
提供搜尋輸入框，輸入 hostname 關鍵字快速篩選並高亮特定節點。

### 視覺設計

```
┌──────────────────────────────┐
│ 🔍 Search nodes...           │
└──────────────────────────────┘
      │
      ▼ (輸入 "worker")
┌──────────────────────────────┐
│ 🔍 worker                  ✕ │
├──────────────────────────────┤
│ ✓ swarm-worker-01            │
│ ✓ swarm-worker-02            │
│   swarm-manager-01 (dimmed)  │
└──────────────────────────────┘
```

### 實作步驟

#### Step 1: 新增搜尋 UI
```html
<div class="search-container">
    <span class="search-icon">🔍</span>
    <input type="text" id="search-input" placeholder="Search nodes..." />
    <button id="search-clear" class="search-clear hidden">✕</button>
</div>
```

#### Step 2: 搜尋邏輯
```javascript
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    searchClear.classList.toggle('hidden', !query);
    
    if (!query) {
        resetNodeOpacity();
        return;
    }
    
    for (const [nodeId, nodeData] of nodeEntities) {
        const matches = nodeData.state.hostname.toLowerCase().includes(query);
        setNodeOpacity(nodeData, matches ? 1.0 : 0.2);
    }
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    resetNodeOpacity();
});
```

#### Step 3: 相機聚焦功能
```javascript
function focusOnMatchingNodes(query) {
    const matchingNodes = [];
    
    for (const [nodeId, nodeData] of nodeEntities) {
        if (nodeData.state.hostname.toLowerCase().includes(query)) {
            matchingNodes.push(nodeData.entity.getPosition());
        }
    }
    
    if (matchingNodes.length === 1) {
        // 單一結果：聚焦該節點
        animateCameraTo(matchingNodes[0]);
    } else if (matchingNodes.length > 1) {
        // 多個結果：調整視角包含所有節點
        const center = calculateCenter(matchingNodes);
        animateCameraTo(center);
    }
}
```

### 驗證方式
- [ ] 輸入關鍵字即時篩選節點
- [ ] 符合節點高亮，不符合淡化
- [ ] 清除按鈕正常運作
- [ ] Enter 鍵觸發相機聚焦

---

## 🗓️ 開發時程建議

| 日期 | 任務 | 產出 |
|:---|:---|:---|
| Day 1 | 1.1 Hover 資訊面板 | Raycast + 浮動面板 |
| Day 2 | 1.2 點擊詳情 (前端) | 詳情面板 UI |
| Day 3 | 1.2 點擊詳情 (後端) | 擴充 Schema + Container 資料 |
| Day 4 | 1.3 搜尋篩選 | 搜尋 UI + 聚焦功能 |
| Day 5 | 整合測試 | Bug 修復 + 優化 |

---

## 📝 開發備註

### 注意事項
1. **效能考量**: Raycast 每幀執行可能影響效能，建議使用節流 (throttle) 或只在低 FPS 時降低偵測頻率
2. **向後相容**: 擴充 Schema 時使用 `.optional()` 確保舊版 Client 仍可運作
3. **行動裝置**: Hover 在觸控裝置無效，考慮改用長按觸發

### 相依性
- 1.2 依賴 1.1 的 Raycast 基礎
- 1.3 可獨立開發

---

*此文件由 SwarmPulse 團隊維護*
