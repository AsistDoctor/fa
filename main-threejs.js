// ========== THREE.JS VERSION - Refactored from WebGL ==========
// Импорты Three.js и модулей
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ========== КОНСТАНТЫ ==========
const PLAN_SIZE = 220 * 5; // 1100
const PLAN_TEXTURE_SIZE = PLAN_SIZE * 1.35;
const PLAN_Y = -PLAN_SIZE * 0.03;
const POSITION_STEP = PLAN_SIZE * 0.01;
const ROTATION_STEP = Math.PI / 36;
const GRID_CELL_SIZE = 20 * 5;

// Список файлов моделей
const modelFiles = [
  "models/11111.obj",
  "models/2к 3D.obj",
  "models/3к 3D.obj",
  "models/4к 3D.obj",
  "models/5к.obj",
  "models/6к.obj",
  "models/7к.obj",
];

// ========== ИНИЦИАЛИЗАЦИЯ СЦЕНЫ ==========
const canvas = document.querySelector("#c");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe0e0e0);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);

// Начальная позиция камеры
camera.position.set(0, 240, 240);
camera.lookAt(0, 2, -10);

const renderer = new THREE.WebGLRenderer({ 
  canvas, 
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false; // Отключаем тени для производительности

// ========== УПРАВЛЕНИЕ КАМЕРОЙ ==========
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, -10);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 60;
controls.maxDistance = 2000;
controls.maxPolarAngle = Math.PI * 0.6; // Ограничение угла сверху
controls.minPolarAngle = 0.2; // Минимальный угол

// Дополнительное управление клавиатурой для камеры
let keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  w: false,
  s: false,
  a: false,
  d: false,
  Space: false,
  Shift: false,
  PageUp: false,
  PageDown: false,
};

// ========== ОСВЕЩЕНИЕ ==========
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(-0.3, -1.0, -0.2);
scene.add(directionalLight);

// ========== ПОЛ И СЕТКА ==========
let showPlan = true;
let floor = null;
let gridHelper = null;

function createFloor() {
  const floorGeometry = new THREE.PlaneGeometry(PLAN_TEXTURE_SIZE, PLAN_TEXTURE_SIZE);
  const floorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x999999,
    side: THREE.DoubleSide
  });
  floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = PLAN_Y;
  scene.add(floor);

  // Сетка для ориентации
  gridHelper = new THREE.GridHelper(
    PLAN_TEXTURE_SIZE, 
    55, 
    0x595966, 
    0x595966
  );
  gridHelper.position.y = PLAN_Y + 0.01;
  scene.add(gridHelper);
}

createFloor();

// ========== ЗАГРУЗКА МОДЕЛЕЙ ==========
const loadedModels = [];
const modelOffsets = {};
const modelRotations = {};
const modelBaseScales = {};
const modelBaseCenters = {};
const modelHeights = {};

let activeModel = 1;
let positionMode = false;

const loader = new OBJLoader();

// Инициализация позиций по умолчанию
for (let i = 0; i < modelFiles.length; i++) {
  const modelKey = `model${i + 1}`;
  modelOffsets[modelKey] = {
    x: (i % 3) * PLAN_SIZE * 0.5 - PLAN_SIZE * 0.5,
    y: 0,
    z: Math.floor(i / 3) * PLAN_SIZE * 0.5 - PLAN_SIZE * 0.25
  };
  modelRotations[modelKey] = { yaw: 0 };
}

// Загрузка всех моделей
async function loadAllModels() {
  const loadPromises = modelFiles.map((file, index) => {
    return new Promise((resolve, reject) => {
      loader.load(
        file,
        (object) => {
          // Вычисляем границы модели
          const box = new THREE.Box3().setFromObject(object);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.z);
          
          // Масштабирование под размер плана
          const scale = (PLAN_SIZE * 0.9) / maxDim;
          object.scale.multiplyScalar(scale);
          
          // Сохраняем базовый масштаб и центр
          const modelKey = `model${index + 1}`;
          modelBaseScales[modelKey] = scale;
          modelBaseCenters[modelKey] = center.clone();
          
          // Центрируем модель
          object.position.sub(center.multiplyScalar(scale));
          
          // Выравниваем по полу
          const MODEL_LIFT = PLAN_SIZE * 0.12;
          object.position.y = MODEL_LIFT;
          
          // Применяем материал
          object.traverse((child) => {
            if (child.isMesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                flatShading: true
              });
            }
          });
          
          // Вычисляем высоту для нормализации
          const height = size.y * scale;
          modelHeights[modelKey] = height;
          
          loadedModels[index] = object;
          scene.add(object);
          
          console.log(`Модель ${index + 1} (${file}) загружена, высота: ${height.toFixed(2)}`);
          resolve(object);
        },
        undefined,
        (error) => {
          console.error(`Ошибка загрузки модели ${index + 1} (${file}):`, error);
          reject(error);
        }
      );
    });
  });
  
  try {
    await Promise.all(loadPromises);
    // Загружаем сохранённые позиции после загрузки всех моделей
    setTimeout(() => {
      loadModelPositions();
      normalizeModelHeights();
    }, 500);
  } catch (error) {
    console.error("Ошибка при загрузке моделей:", error);
  }
}

// Нормализация высоты всех моделей
function normalizeModelHeights() {
  let maxHeight = 0;
  for (const modelKey in modelHeights) {
    if (modelHeights[modelKey] > maxHeight) {
      maxHeight = modelHeights[modelKey];
    }
  }
  
  if (maxHeight === 0) {
    console.warn("Не найдено моделей с валидной высотой");
    return;
  }
  
  console.log(`Нормализация высоты моделей до ${maxHeight.toFixed(2)} единиц`);
  
  for (let i = 0; i < loadedModels.length; i++) {
    const model = loadedModels[i];
    if (!model) continue;
    
    const modelKey = `model${i + 1}`;
    const currentHeight = modelHeights[modelKey];
    if (!currentHeight || currentHeight === 0) continue;
    
    const scaleY = maxHeight / currentHeight;
    const currentScale = model.scale.y;
    model.scale.y = currentScale * scaleY;
    
    // Корректируем позицию Y
    const baseY = PLAN_SIZE * 0.12;
    model.position.y = baseY;
  }
  
  console.log(`Высота всех моделей нормализована до ${maxHeight.toFixed(2)} единиц`);
}

// Загрузка позиций из JSON
async function loadModelPositions() {
  try {
    const response = await fetch("model_positions.json");
    if (!response.ok) {
      console.log("Файл model_positions.json не найден, используются позиции по умолчанию");
      return;
    }
    const positions = await response.json();
    
    for (const modelKey in positions) {
      if (positions[modelKey] && modelOffsets[modelKey] && modelRotations[modelKey]) {
        const pos = positions[modelKey];
        const modelIndex = parseInt(modelKey.replace("model", "")) - 1;
        const model = loadedModels[modelIndex];
        
        if (!model) continue;
        
        if (pos.offset) {
          modelOffsets[modelKey].x = pos.offset.x || modelOffsets[modelKey].x;
          modelOffsets[modelKey].y = pos.offset.y || modelOffsets[modelKey].y;
          modelOffsets[modelKey].z = pos.offset.z || modelOffsets[modelKey].z;
          
          model.position.x = modelOffsets[modelKey].x;
          model.position.y = modelOffsets[modelKey].y;
          model.position.z = modelOffsets[modelKey].z;
        }
        
        if (pos.rotation) {
          modelRotations[modelKey].yaw = pos.rotation.yaw || modelRotations[modelKey].yaw;
          model.rotation.y = modelRotations[modelKey].yaw;
        }
      }
    }
    console.log("Позиции моделей загружены из model_positions.json");
  } catch (error) {
    console.warn("Не удалось загрузить позиции из model_positions.json:", error);
  }
}

// Загружаем модели
loadAllModels();

// ========== УПРАВЛЕНИЕ МОДЕЛЯМИ ==========
function nudgeActiveModel(dx, dy, dz) {
  if (activeModel < 1 || activeModel > loadedModels.length) return;
  const model = loadedModels[activeModel - 1];
  if (!model) return;
  
  model.position.x += dx;
  model.position.y += dy;
  model.position.z += dz;
  
  const modelKey = `model${activeModel}`;
  modelOffsets[modelKey].x = model.position.x;
  modelOffsets[modelKey].y = model.position.y;
  modelOffsets[modelKey].z = model.position.z;
}

function rotateActiveModel(deltaYaw) {
  if (activeModel < 1 || activeModel > loadedModels.length) return;
  const model = loadedModels[activeModel - 1];
  if (!model) return;
  
  model.rotation.y += deltaYaw;
  
  const modelKey = `model${activeModel}`;
  modelRotations[modelKey].yaw = model.rotation.y;
}

function updatePositionModeLabel() {
  if (!positionModeBtn) return;
  const status = positionMode ? "On" : "Off";
  positionModeBtn.textContent = `Position Mode: ${status} (Model ${activeModel})`;
}

// ========== ОБРАБОТКА КЛАВИАТУРЫ ==========
window.addEventListener("keydown", (event) => {
  // Сброс камеры
  if (event.key === "r" || event.key === "R") {
    camera.position.set(0, 240, 240);
    controls.target.set(0, 2, -10);
    controls.update();
    return;
  }
  
  // Переключение между моделями (1-7)
  if (event.key >= "1" && event.key <= "7") {
    const modelNum = parseInt(event.key);
    if (modelNum >= 1 && modelNum <= loadedModels.length) {
      activeModel = modelNum;
      updatePositionModeLabel();
    }
    return;
  }
  
  // В режиме позиционирования модели
  if (positionMode) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudgeActiveModel(0, 0, -POSITION_STEP);
      return;
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudgeActiveModel(0, 0, POSITION_STEP);
      return;
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeActiveModel(-POSITION_STEP, 0, 0);
      return;
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeActiveModel(POSITION_STEP, 0, 0);
      return;
    } else if (event.key === "q" || event.key === "Q") {
      event.preventDefault();
      rotateActiveModel(-ROTATION_STEP);
      return;
    } else if (event.key === "e" || event.key === "E") {
      event.preventDefault();
      rotateActiveModel(ROTATION_STEP);
      return;
    } else if (event.key === "PageUp") {
      event.preventDefault();
      nudgeActiveModel(0, POSITION_STEP, 0);
      return;
    } else if (event.key === "PageDown") {
      event.preventDefault();
      nudgeActiveModel(0, -POSITION_STEP, 0);
      return;
    }
  }
  
  // Управление камерой (когда не в режиме позиционирования)
  if (event.key === "ArrowUp") {
    event.preventDefault();
    keys.ArrowUp = true;
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    keys.ArrowDown = true;
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    keys.ArrowLeft = true;
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    keys.ArrowRight = true;
  } else if (event.key === "w" || event.key === "W") {
    event.preventDefault();
    keys.w = true;
  } else if (event.key === "s" || event.key === "S") {
    event.preventDefault();
    keys.s = true;
  } else if (event.key === "a" || event.key === "A") {
    event.preventDefault();
    keys.a = true;
  } else if (event.key === "d" || event.key === "D") {
    event.preventDefault();
    keys.d = true;
  } else if (event.key === " ") {
    event.preventDefault();
    keys.Space = true;
  } else if (event.key === "Shift") {
    event.preventDefault();
    keys.Shift = true;
  } else if (event.key === "PageUp") {
    event.preventDefault();
    keys.PageUp = true;
  } else if (event.key === "PageDown") {
    event.preventDefault();
    keys.PageDown = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowUp") keys.ArrowUp = false;
  else if (event.key === "ArrowDown") keys.ArrowDown = false;
  else if (event.key === "ArrowLeft") keys.ArrowLeft = false;
  else if (event.key === "ArrowRight") keys.ArrowRight = false;
  else if (event.key === "w" || event.key === "W") keys.w = false;
  else if (event.key === "s" || event.key === "S") keys.s = false;
  else if (event.key === "a" || event.key === "A") keys.a = false;
  else if (event.key === "d" || event.key === "D") keys.d = false;
  else if (event.key === " ") keys.Space = false;
  else if (event.key === "Shift") keys.Shift = false;
  else if (event.key === "PageUp") keys.PageUp = false;
  else if (event.key === "PageDown") keys.PageDown = false;
});

// Обновление движения камеры
function updateCameraMovement() {
  if (positionMode) return;
  
  const moveSpeed = 5.0;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  
  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
  right.normalize();
  
  const move = new THREE.Vector3(0, 0, 0);
  
  if (keys.ArrowUp || keys.w) {
    move.add(forward.clone().multiplyScalar(moveSpeed));
  }
  if (keys.ArrowDown || keys.s) {
    move.add(forward.clone().multiplyScalar(-moveSpeed));
  }
  if (keys.ArrowLeft || keys.a) {
    move.add(right.clone().multiplyScalar(moveSpeed));
  }
  if (keys.ArrowRight || keys.d) {
    move.add(right.clone().multiplyScalar(-moveSpeed));
  }
  if (keys.Space || keys.PageUp) {
    move.y += moveSpeed;
  }
  if (keys.Shift || keys.PageDown) {
    move.y -= moveSpeed;
  }
  
  if (move.length() > 0) {
    camera.position.add(move);
    controls.target.add(move);
  }
}

// Обновление вращения моделей
function updateModelRotation() {
  if (positionMode) return;
  if (activeModel < 1 || activeModel > loadedModels.length) return;
  
  const rotationSpeed = ROTATION_STEP * 0.5;
  
  if (keys.q || keys.Q) {
    rotateActiveModel(-rotationSpeed);
  }
  if (keys.e || keys.E) {
    rotateActiveModel(rotationSpeed);
  }
}

// ========== ЭКСПОРТ ==========
function exportPositions() {
  const payload = {};
  for (let i = 0; i < loadedModels.length; i++) {
    const model = loadedModels[i];
    if (!model) continue;
    
    const modelKey = `model${i + 1}`;
    payload[modelKey] = {
      offset: {
        x: model.position.x,
        y: model.position.y,
        z: model.position.z
      },
      rotation: {
        yaw: model.rotation.y
      },
      file: modelFiles[i] || `models/model${i + 1}.obj`
    };
  }
  
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "model_positions.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportToOBJ() {
  // Экспорт первой модели в OBJ (для совместимости)
  if (loadedModels.length === 0 || !loadedModels[0]) {
    alert("Нет загруженных моделей для экспорта");
    return;
  }
  
  const model = loadedModels[0];
  let objContent = "# Exported 3D Building Model\n";
  
  // Собираем все вершины из модели
  const vertices = [];
  model.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const positions = child.geometry.attributes.position;
      if (positions) {
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);
          vertices.push([x, y, z]);
        }
      }
    }
  });
  
  objContent += `# Vertices: ${vertices.length}\n\n`;
  
  for (const [x, y, z] of vertices) {
    objContent += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
  }
  
  objContent += "\n";
  
  // Грани (упрощённо - каждая тройка вершин = треугольник)
  for (let i = 0; i < vertices.length; i += 3) {
    const v1 = i + 1;
    const v2 = i + 2;
    const v3 = i + 3;
    if (v3 <= vertices.length) {
      objContent += `f ${v1} ${v2} ${v3}\n`;
    }
  }
  
  const blob = new Blob([objContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "building_model.obj";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== UI КНОПКИ ==========
let positionModeBtn = null;
let exportPositionsBtn = null;
let togglePlanBtn = null;

positionModeBtn = document.getElementById("positionModeBtn");
if (positionModeBtn) {
  positionModeBtn.addEventListener("click", () => {
    positionMode = !positionMode;
    updatePositionModeLabel();
  });
  updatePositionModeLabel();
}

exportPositionsBtn = document.getElementById("exportPositionsBtn");
if (exportPositionsBtn) {
  exportPositionsBtn.addEventListener("click", exportPositions);
}

const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", exportToOBJ);
}

togglePlanBtn = document.getElementById("togglePlanBtn");
if (togglePlanBtn) {
  togglePlanBtn.addEventListener("click", () => {
    showPlan = !showPlan;
    if (floor) floor.visible = showPlan;
    if (gridHelper) gridHelper.visible = showPlan;
    togglePlanBtn.textContent = showPlan ? "Hide Plan" : "Show Plan";
  });
}

// ========== РЕСАЙЗ ==========
function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", resize);

// ========== РЕНДЕРИНГ ==========
function animate() {
  requestAnimationFrame(animate);
  
  updateCameraMovement();
  updateModelRotation();
  
  controls.update();
  renderer.render(scene, camera);
}

animate();

// ========== ОБРАБОТКА ОШИБОК ==========
window.addEventListener("error", (event) => {
  console.error("Глобальная ошибка:", event.error);
  event.preventDefault();
  return false;
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Необработанное обещание:", event.reason);
  event.preventDefault();
});

// Устанавливаем фокус на canvas
canvas.addEventListener("click", () => {
  canvas.focus();
});

window.addEventListener("load", () => {
  canvas.focus();
});
