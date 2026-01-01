/**
 * SwarmPulse 3D - PlayCanvas 3D 視覺化引擎
 * 將 Docker Swarm 節點狀態轉換為動態 3D 場景
 */

import * as pc from 'playcanvas';

// ============================================
// 配置常數
// ============================================

const CONFIG = {
    // 輪詢間隔（毫秒）
    POLL_INTERVAL: 500,

    // 節點排列半徑
    NODE_CIRCLE_RADIUS: 4,

    // 能量球基礎大小
    NODE_BASE_SIZE: 0.5,

    // 旋轉速度範圍（度/秒）
    MIN_ROTATION_SPEED: 5,
    MAX_ROTATION_SPEED: 180,

    // 發光強度範圍
    MIN_EMISSION: 0.2,
    MAX_EMISSION: 2.0,

    // 消散動畫時間（秒）
    DISSOLVE_DURATION: 1.0,

    // 出現動畫時間（秒）
    APPEAR_DURATION: 0.5,
};

// ============================================
// 全域狀態
// ============================================

/** @type {pc.Application} */
let app;

/** @type {pc.Entity} */
let cameraEntity;

// 節點實體映射 { nodeId: { entity, state, rotationSpeed, emissionIntensity } }
const nodeEntities = new Map();

// 正在消散的節點
const dissolvingNodes = new Map();

// 相機控制狀態
let cameraAngle = 0;
let cameraHeight = 5;
let cameraDistance = 12;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Hover 狀態
let mouseScreenX = 0;
let mouseScreenY = 0;
let hoveredNodeId = null;
let selectedNodeId = null;
let searchQuery = '';

// ============================================
// 初始化 PlayCanvas
// ============================================

async function initPlayCanvas() {
    const canvas = document.getElementById('application');

    // 建立應用程式
    app = new pc.Application(canvas, {
        graphicsDeviceOptions: {
            antialias: true,
            alpha: false,
        },
    });

    // 設定解析度
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);

    // 視窗大小變更時調整
    window.addEventListener('resize', () => {
        app.resizeCanvas();
    });

    // 啟動渲染循環
    app.start();

    // 設定場景
    setupScene();

    // 設定相機控制
    setupCameraControls();

    // 初始化詳情面板關閉按鈕
    document.getElementById('detail-close').onclick = () => deselectNode();

    // 隱藏載入提示
    document.getElementById('loading').style.display = 'none';

    console.log('[PlayCanvas] 3D 場景初始化完成');
}

// ============================================
// 場景設定
// ============================================

function setupScene() {
    // 設定天空盒顏色（深藍色太空風格）
    app.scene.ambientLight = new pc.Color(0.1, 0.1, 0.15);

    // 建立相機
    cameraEntity = new pc.Entity('camera');
    cameraEntity.addComponent('camera', {
        clearColor: new pc.Color(0.02, 0.02, 0.05),
        fov: 60,
        nearClip: 0.1,
        farClip: 1000,
    });
    updateCameraPosition();
    app.root.addChild(cameraEntity);

    // 建立主光源
    const mainLight = new pc.Entity('mainLight');
    mainLight.addComponent('light', {
        type: 'directional',
        color: new pc.Color(0.8, 0.9, 1.0),
        intensity: 0.8,
        castShadows: true,
        shadowResolution: 2048,
    });
    mainLight.setEulerAngles(45, 135, 0);
    app.root.addChild(mainLight);

    // 建立環境光
    const ambientLight = new pc.Entity('ambientLight');
    ambientLight.addComponent('light', {
        type: 'directional',
        color: new pc.Color(0.3, 0.4, 0.6),
        intensity: 0.3,
    });
    ambientLight.setEulerAngles(-30, -45, 0);
    app.root.addChild(ambientLight);

    // 建立中心指示器
    createCenterIndicator();

    // 建立星空背景
    createStarfield();

    // 建立地板網格
    createFloorGrid();
}

/**
 * 建立中心指示器（原點標記）
 */
function createCenterIndicator() {
    const center = new pc.Entity('center');

    // 使用一個小的發光球體
    center.addComponent('render', {
        type: 'sphere',
    });
    center.setLocalScale(0.2, 0.2, 0.2);

    // 建立發光材質
    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(0.2, 0.6, 1.0);
    material.emissive = new pc.Color(0.2, 0.6, 1.0);
    material.emissiveIntensity = 1.0;
    material.update();
    center.render.meshInstances[0].material = material;

    app.root.addChild(center);
}

/**
 * 建立星空背景
 */
function createStarfield() {
    // 建立一個包含多個小球體的星空
    for (let i = 0; i < 200; i++) {
        const star = new pc.Entity('star');
        star.addComponent('render', {
            type: 'sphere',
        });

        // 隨機位置（球殼分佈）
        const radius = 80 + Math.random() * 40;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        star.setPosition(x, y, z);

        // 隨機大小
        const size = 0.05 + Math.random() * 0.15;
        star.setLocalScale(size, size, size);

        // 發光材質
        const material = new pc.StandardMaterial();
        const brightness = 0.5 + Math.random() * 0.5;
        material.emissive = new pc.Color(brightness, brightness, brightness);
        material.emissiveIntensity = 1.0;
        material.update();
        star.render.meshInstances[0].material = material;

        app.root.addChild(star);
    }
}

/**
 * 建立地板網格
 */
function createFloorGrid() {
    const gridSize = 20;
    const gridStep = 2;

    for (let x = -gridSize; x <= gridSize; x += gridStep) {
        for (let z = -gridSize; z <= gridSize; z += gridStep) {
            // 只在邊緣畫點
            if (Math.abs(x) < gridSize && Math.abs(z) < gridSize) {
                if (x % (gridStep * 2) !== 0 && z % (gridStep * 2) !== 0) continue;
            }

            const dot = new pc.Entity('gridDot');
            dot.addComponent('render', {
                type: 'sphere',
            });
            dot.setPosition(x, -0.5, z);
            dot.setLocalScale(0.03, 0.03, 0.03);

            const material = new pc.StandardMaterial();
            material.emissive = new pc.Color(0.2, 0.4, 0.6);
            material.emissiveIntensity = 0.5;
            material.update();
            dot.render.meshInstances[0].material = material;

            app.root.addChild(dot);
        }
    }
}

// ============================================
// 相機控制
// ============================================

function updateCameraPosition() {
    const x = Math.sin(cameraAngle) * cameraDistance;
    const z = Math.cos(cameraAngle) * cameraDistance;
    cameraEntity.setPosition(x, cameraHeight, z);
    cameraEntity.lookAt(0, 0, 0);
}

function setupCameraControls() {
    const canvas = app.graphicsDevice.canvas;

    // 滑鼠拖曳旋轉
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;

        cameraAngle += deltaX * 0.01;
        cameraHeight = Math.max(2, Math.min(20, cameraHeight - deltaY * 0.05));

        updateCameraPosition();

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    // 滾輪縮放
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        cameraDistance = Math.max(5, Math.min(30, cameraDistance + e.deltaY * 0.01));
        updateCameraPosition();
    });

    // 觸控支援
    let lastTouchDistance = 0;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            lastTouchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();

        if (e.touches.length === 1 && isDragging) {
            const deltaX = e.touches[0].clientX - lastMouseX;
            const deltaY = e.touches[0].clientY - lastMouseY;

            cameraAngle += deltaX * 0.01;
            cameraHeight = Math.max(2, Math.min(20, cameraHeight - deltaY * 0.05));

            updateCameraPosition();

            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const touchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );

            const delta = lastTouchDistance - touchDistance;
            cameraDistance = Math.max(5, Math.min(30, cameraDistance + delta * 0.05));
            updateCameraPosition();

            lastTouchDistance = touchDistance;
        }
    });

    canvas.addEventListener('touchend', () => {
        isDragging = false;
    });

    // 監聽滑鼠移動以進行 Hover 偵測
    canvas.addEventListener('mousemove', (e) => {
        mouseScreenX = e.clientX;
        mouseScreenY = e.clientY;
    });

    // 監聽點擊以選取節點
    canvas.addEventListener('mousedown', (e) => {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener('mouseup', (e) => {
        // 如果移動距離很小，視為點擊而非拖曳
        const dist = Math.hypot(e.clientX - lastMouseX, e.clientY - lastMouseY);
        if (dist < 5) {
            const nodeId = findHoveredNode(e.clientX, e.clientY);
            if (nodeId) {
                selectNode(nodeId);
            } else {
                deselectNode();
            }
        }
    });
}

// ============================================
// 節點視覺化
// ============================================

/**
 * 建立節點 3D 實體
 */
function createNodeEntity(nodeState, index, totalNodes) {
    const entity = new pc.Entity(`node-${nodeState.nodeId}`);

    // 外層容器（用於軌道旋轉）
    const container = new pc.Entity('container');
    entity.addChild(container);

    // 能量球主體
    const sphere = new pc.Entity('sphere');
    sphere.addComponent('render', {
        type: 'sphere',
    });

    // 計算位置（圓形排列）
    const angle = (index / Math.max(totalNodes, 1)) * Math.PI * 2;
    const x = Math.cos(angle) * CONFIG.NODE_CIRCLE_RADIUS;
    const z = Math.sin(angle) * CONFIG.NODE_CIRCLE_RADIUS;
    entity.setPosition(x, 0, z);

    // 初始大小（會從 0 放大到正常大小）
    sphere.setLocalScale(0.01, 0.01, 0.01);

    // 建立材質
    const material = createNodeMaterial(nodeState);
    sphere.render.meshInstances[0].material = material;

    container.addChild(sphere);

    // 建立光環
    const ring = createNodeRing();
    container.addChild(ring);

    app.root.addChild(entity);

    // 存儲節點資訊
    const nodeData = {
        entity,
        container,
        sphere,
        ring,
        material,
        state: nodeState,
        rotationSpeed: calculateRotationSpeed(nodeState.cpuUsage),
        emissionIntensity: calculateEmission(nodeState.memoryUsage),
        appearProgress: 0, // 出現動畫進度
        targetScale: CONFIG.NODE_BASE_SIZE,
    };

    nodeEntities.set(nodeState.nodeId, nodeData);

    return nodeData;
}

/**
 * 建立節點材質
 */
function createNodeMaterial(nodeState) {
    const material = new pc.StandardMaterial();

    // 基於 hostname 產生顏色（使用雜湊）
    const hue = hashString(nodeState.hostname) % 360;
    const color = hslToRgb(hue, 0.7, 0.5);

    material.diffuse = new pc.Color(color.r, color.g, color.b);
    material.emissive = new pc.Color(color.r, color.g, color.b);
    material.emissiveIntensity = CONFIG.MIN_EMISSION;
    material.metalness = 0.3;
    material.gloss = 0.8;
    material.update();

    return material;
}

/**
 * 建立節點光環
 */
function createNodeRing() {
    const ring = new pc.Entity('ring');
    ring.addComponent('render', {
        type: 'torus',
    });
    ring.setLocalScale(0.8, 0.8, 0.1);
    ring.setEulerAngles(90, 0, 0);

    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(0.3, 0.6, 1.0);
    material.emissive = new pc.Color(0.3, 0.6, 1.0);
    material.emissiveIntensity = 0.5;
    material.opacity = 0.5;
    material.blendType = pc.BLEND_ADDITIVE;
    material.update();
    ring.render.meshInstances[0].material = material;

    return ring;
}

/**
 * 更新節點狀態
 */
function updateNodeState(nodeData, newState) {
    nodeData.state = newState;
    nodeData.rotationSpeed = calculateRotationSpeed(newState.cpuUsage);
    nodeData.emissionIntensity = calculateEmission(newState.memoryUsage);
}

/**
 * 開始節點消散動畫
 */
function startDissolveAnimation(nodeId) {
    const nodeData = nodeEntities.get(nodeId);
    if (!nodeData) return;

    nodeEntities.delete(nodeId);
    dissolvingNodes.set(nodeId, {
        ...nodeData,
        dissolveProgress: 0,
    });
}

/**
 * 重新排列所有節點位置
 */
function rearrangeNodes() {
    const nodes = Array.from(nodeEntities.values());
    const total = nodes.length;

    nodes.forEach((nodeData, index) => {
        const angle = (index / Math.max(total, 1)) * Math.PI * 2;
        const targetX = Math.cos(angle) * CONFIG.NODE_CIRCLE_RADIUS;
        const targetZ = Math.sin(angle) * CONFIG.NODE_CIRCLE_RADIUS;

        // 平滑移動到新位置
        const pos = nodeData.entity.getPosition();
        const newX = pc.math.lerp(pos.x, targetX, 0.1);
        const newZ = pc.math.lerp(pos.z, targetZ, 0.1);
        nodeData.entity.setPosition(newX, 0, newZ);
    });
}

// ============================================
// 輔助函數
// ============================================

function calculateRotationSpeed(cpuUsage) {
    return pc.math.lerp(CONFIG.MIN_ROTATION_SPEED, CONFIG.MAX_ROTATION_SPEED, cpuUsage / 100);
}

function calculateEmission(memoryUsage) {
    return pc.math.lerp(CONFIG.MIN_EMISSION, CONFIG.MAX_EMISSION, memoryUsage / 100);
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function hslToRgb(h, s, l) {
    h /= 360;
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return { r, g, b };
}

/**
 * 尋找滑鼠下方的節點（Raycast）
 */
function findHoveredNode(screenX, screenY) {
    const camera = cameraEntity.camera;

    // 將螢幕座標轉換為世界空間的射線
    const near = camera.screenToWorld(screenX, screenY, camera.nearClip);
    const far = camera.screenToWorld(screenX, screenY, camera.farClip);

    const rayOrigin = near;
    const rayDir = new pc.Vec3().sub2(far, near).normalize();

    let closestNodeId = null;
    let minDistance = Infinity;

    for (const [nodeId, nodeData] of nodeEntities) {
        const spherePos = nodeData.entity.getPosition();
        // 簡單的點到射線距離偵測（球體碰撞）
        const distance = rayToSphereDistance(rayOrigin, rayDir, spherePos, CONFIG.NODE_BASE_SIZE);

        if (distance !== null && distance < minDistance) {
            minDistance = distance;
            closestNodeId = nodeId;
        }
    }

    return closestNodeId;
}

/**
 * 射線與球體碰撞偵測
 */
function rayToSphereDistance(rayOrigin, rayDir, sphereCenter, sphereRadius) {
    const L = new pc.Vec3().sub2(sphereCenter, rayOrigin);
    const tca = L.dot(rayDir);
    if (tca < 0) return null; // 球在射線後方

    const d2 = L.dot(L) - tca * tca;
    const radius2 = sphereRadius * sphereRadius;

    if (d2 > radius2) return null; // 沒射中

    const thc = Math.sqrt(radius2 - d2);
    return tca - thc; // 回傳最近的交點距離
}

/**
 * 更新 Hover 面板 UI
 */
function updateHoverPanel(nodeId, mouseX, mouseY) {
    const panel = document.getElementById('hover-panel');

    if (!nodeId) {
        panel.classList.add('hidden');
        hoveredNodeId = null;
        return;
    }

    const nodeData = nodeEntities.get(nodeId);
    if (!nodeData) return;

    panel.classList.remove('hidden');
    hoveredNodeId = nodeId;

    // 定位面板
    const offset = 20;
    let x = mouseX + offset;
    let y = mouseY + offset;

    // 檢查邊界防止超出視窗
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;

    if (x + panelWidth > window.innerWidth) {
        x = mouseX - panelWidth - offset;
    }
    if (y + panelHeight > window.innerHeight) {
        y = mouseY - panelHeight - offset;
    }

    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;

    // 更新內容
    const state = nodeData.state;
    document.getElementById('hover-hostname').textContent = state.hostname;
    document.getElementById('hover-nodeid').textContent = state.nodeId.slice(0, 12) + '...';

    const cpuVal = state.cpuUsage.toFixed(1);
    const memVal = state.memoryUsage.toFixed(1);

    document.getElementById('hover-cpu-value').textContent = `${cpuVal}%`;
    document.getElementById('hover-mem-value').textContent = `${memVal}%`;
    document.getElementById('hover-cpu-bar').style.width = `${state.cpuUsage}%`;
    document.getElementById('hover-mem-bar').style.width = `${state.memoryUsage}%`;

    // 計算最後心跳時間
    const secondsAgo = Math.max(0, Math.floor((Date.now() - state.timestamp) / 1000));
    document.getElementById('hover-heartbeat').textContent = `${secondsAgo} 秒前`;
}

/**
 * 選取節點
 */
function selectNode(nodeId) {
    selectedNodeId = nodeId;
    const nodeData = nodeEntities.get(nodeId);
    if (!nodeData) return;

    updateDetailPanel(nodeId);
    document.getElementById('detail-panel').classList.remove('hidden');
}

/**
 * 取消選取
 */
function deselectNode() {
    selectedNodeId = null;
    document.getElementById('detail-panel').classList.add('hidden');
}

/**
 * 更新詳情面板
 */
function updateDetailPanel(nodeId) {
    const nodeData = nodeEntities.get(nodeId);
    if (!nodeData) return;

    const state = nodeData.state;
    const container = document.getElementById('detail-content');

    // 生成 Containers HTML
    let containersHtml = '<p style="color: #666; font-size: 13px;">無運行中的容器</p>';
    if (state.containers && state.containers.length > 0) {
        containersHtml = state.containers.map(c => `
            <div class="container-item">
                <div class="container-name">📦 ${c.name}</div>
                <div class="container-image">${c.image}</div>
                <div class="container-status">${c.status}</div>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div class="detail-section">
            <div class="detail-section-title">📍 基本資訊</div>
            <div class="detail-info-grid">
                <div class="detail-info-item">
                    <span class="detail-info-label">HOSTNAME</span>
                    <span class="detail-info-value">${state.hostname}</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">ROLE</span>
                    <span class="detail-info-value">${(state.role || 'worker').toUpperCase()}</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">IP ADDRESS</span>
                    <span class="detail-info-value">${state.ip || '未知'}</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">NODE ID</span>
                    <span class="detail-info-value">${state.nodeId.slice(0, 12)}...</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">📊 資源使用率</div>
            <div class="detail-info-grid">
                <div class="detail-info-item">
                    <span class="detail-info-label">CPU USAGE</span>
                    <span class="detail-info-value">${state.cpuUsage.toFixed(1)}%</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">MEMORY USAGE</span>
                    <span class="detail-info-value">${state.memoryUsage.toFixed(1)}%</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">DISK USAGE</span>
                    <span class="detail-info-value">${state.diskUsage ? state.diskUsage.toFixed(1) + '%' : '未知'}</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-section-title">📦 CONTAINERS (${state.containers?.length || 0})</div>
            <div class="container-list">
                ${containersHtml}
            </div>
        </div>
    `;
}

// ============================================
// 更新迴圈
// ============================================

function setupUpdateLoop() {
    let time = 0;

    app.on('update', (dt) => {
        time += dt;

        // 更新所有節點
        for (const nodeData of nodeEntities.values()) {
            // 出現動畫
            if (nodeData.appearProgress < 1) {
                nodeData.appearProgress += dt / CONFIG.APPEAR_DURATION;
                nodeData.appearProgress = Math.min(1, nodeData.appearProgress);

                const scale = pc.math.lerp(0.01, nodeData.targetScale, easeOutBack(nodeData.appearProgress));
                nodeData.sphere.setLocalScale(scale, scale, scale);
            }

            // 旋轉
            nodeData.container.rotate(0, nodeData.rotationSpeed * dt, 0);

            // 更新發光強度（平滑過渡）
            const currentEmission = nodeData.material.emissiveIntensity;
            const targetEmission = nodeData.emissionIntensity;
            nodeData.material.emissiveIntensity = pc.math.lerp(currentEmission, targetEmission, dt * 2);
            nodeData.material.update();

            // 光環脈動
            const ringScale = 0.8 + Math.sin(time * 2) * 0.05;
            nodeData.ring.setLocalScale(ringScale, ringScale, 0.1);
        }

        // 更新消散動畫
        for (const [nodeId, nodeData] of dissolvingNodes.entries()) {
            nodeData.dissolveProgress += dt / CONFIG.DISSOLVE_DURATION;

            if (nodeData.dissolveProgress >= 1) {
                // 動畫完成，移除實體
                nodeData.entity.destroy();
                dissolvingNodes.delete(nodeId);
            } else {
                // 縮小並上升
                const scale = pc.math.lerp(nodeData.targetScale, 0.01, nodeData.dissolveProgress);
                nodeData.sphere.setLocalScale(scale, scale, scale);

                const pos = nodeData.entity.getPosition();
                nodeData.entity.setPosition(pos.x, pos.y + dt * 2, pos.z);

                // 增加透明度（模擬消散）
                nodeData.material.opacity = 1 - nodeData.dissolveProgress;
                nodeData.material.update();
            }
        }

        // 重新排列節點
        rearrangeNodes();

        // 自動旋轉相機（非常緩慢）
        if (!isDragging) {
            cameraAngle += dt * 0.05;
            updateCameraPosition();
        }

        // 處理選取狀態與搜尋篩選的視覺效果
        for (const [nodeId, nodeData] of nodeEntities) {
            let targetOpacity = 1.0;

            // 搜尋篩選優先
            if (searchQuery && !nodeData.state.hostname.toLowerCase().includes(searchQuery)) {
                targetOpacity = 0.1; // 不符合搜尋的變更暗
            } else if (selectedNodeId && nodeId !== selectedNodeId) {
                targetOpacity = 0.3; // 非選取但符合搜尋的節點
            }

            const currentOpacity = nodeData.material.opacity || 1.0;
            if (Math.abs(currentOpacity - targetOpacity) > 0.01) {
                nodeData.material.opacity = pc.math.lerp(currentOpacity, targetOpacity, dt * 5);
                nodeData.material.blendType = nodeData.material.opacity < 0.99 ? pc.BLEND_NORMAL : pc.BLEND_NONE;
                nodeData.material.update();
            }
        }

        // 處理 Hover 偵測
        const currentHoveredId = findHoveredNode(mouseScreenX, mouseScreenY);
        updateHoverPanel(currentHoveredId, mouseScreenX, mouseScreenY);

        // 如果詳情面板開啟，持續更新內容（針對當前選取的節點）
        if (selectedNodeId) {
            updateDetailPanel(selectedNodeId);
        }
    });
}

function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// ============================================
// 資料同步
// ============================================

let previousNodeIds = new Set();

async function fetchClusterStatus() {
    try {
        const response = await fetch(window.location.origin + '/getClusterStatus', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('[SwarmPulse] 獲取叢集狀態失敗:', error);
        return null;
    }
}

async function syncClusterState() {
    const result = await fetchClusterStatus();

    if (!result) {
        updateConnectionStatus(false);
        return;
    }

    // oRPC 回傳格式為 { json: { nodes, lastUpdate } }
    const status = result.json || result;

    if (!status || !status.nodes) {
        updateConnectionStatus(false);
        return;
    }

    updateConnectionStatus(true);

    const currentNodeIds = new Set(status.nodes.map((n) => n.nodeId));
    const nodes = status.nodes;

    // 檢查新增的節點
    for (const node of nodes) {
        if (!nodeEntities.has(node.nodeId)) {
            // 新節點
            createNodeEntity(node, nodeEntities.size, nodes.length);
            console.log(`[SwarmPulse] 新節點加入: ${node.hostname}`);
        } else {
            // 更新現有節點
            updateNodeState(nodeEntities.get(node.nodeId), node);
        }
    }

    // 檢查離線的節點
    for (const nodeId of previousNodeIds) {
        if (!currentNodeIds.has(nodeId)) {
            // 節點離線
            console.log(`[SwarmPulse] 節點離線: ${nodeId}`);
            startDissolveAnimation(nodeId);
        }
    }

    previousNodeIds = currentNodeIds;

    // 更新 UI
    updateStatusPanel(status);
    updateNodeList(status.nodes);
}


// ============================================
// UI 更新
// ============================================

function updateConnectionStatus(isConnected) {
    const statusEl = document.getElementById('connection-status');
    if (isConnected) {
        statusEl.textContent = '已連線';
        statusEl.classList.add('online');
    } else {
        statusEl.textContent = '連線中斷';
        statusEl.classList.remove('online');
    }
}

function updateStatusPanel(status) {
    document.getElementById('node-count').textContent = status.nodes.length;

    const date = new Date(status.lastUpdate);
    document.getElementById('last-update').textContent = date.toLocaleTimeString('zh-TW');
}

function updateNodeList(nodes) {
    const container = document.getElementById('nodes-container');

    if (nodes.length === 0) {
        container.innerHTML = `
      <p style="color: #888; text-align: center; padding: 20px;">
        等待節點連線...
      </p>
    `;
        return;
    }

    // 按 hostname 排序
    const sortedNodes = [...nodes].sort((a, b) => a.hostname.localeCompare(b.hostname));

    container.innerHTML = sortedNodes
        .map(
            (node) => `
    <div class="node-item" id="node-ui-${node.nodeId}">
      <div class="node-hostname">🔮 ${node.hostname}</div>
      <div class="node-stats">
        <div class="node-stat">
          <span class="node-stat-label">CPU:</span>
          <span class="node-stat-value cpu-value">${node.cpuUsage.toFixed(1)}%</span>
        </div>
        <div class="node-stat">
          <span class="node-stat-label">MEM:</span>
          <span class="node-stat-value mem-value">${node.memoryUsage.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  `
        )
        .join('');
}

/**
 * 搜尋功能初始化
 */
function setupSearch() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');

    input.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        clearBtn.classList.toggle('hidden', !searchQuery);
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        searchQuery = '';
        clearBtn.classList.add('hidden');
        input.focus();
    });

    // 防止在搜尋框輸入時觸發 3D 快捷鍵（如果有地話）
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
    });
}

// ============================================
// 啟動
// ============================================

async function main() {
    console.log('[SwarmPulse] 初始化中...');

    await initPlayCanvas();
    setupUpdateLoop();
    setupSearch();

    // 開始資料同步
    await syncClusterState();
    setInterval(syncClusterState, CONFIG.POLL_INTERVAL);

    console.log('[SwarmPulse] 啟動完成！');
}

main().catch(console.error);
