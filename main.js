// ========== THREE.JS VERSION (ES Modules) ==========
// Использует Three.js из node_modules через importmap

// Импортируем Three.js и модули
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

console.log('✓ Three.js загружен из node_modules');

// Функция инициализации приложения
function initApp() {

  // ========== КОНСТАНТЫ ==========
const PLAN_SIZE = 220 * 5; // 1100 (базовый размер, используется для масштабирования моделей)
// План будет расширен динамически на основе позиций моделей
let PLAN_TEXTURE_SIZE = PLAN_SIZE * 1.35; // Начальный размер, будет пересчитан
const PLAN_Y = -PLAN_SIZE * 0.03;
const POSITION_STEP = PLAN_SIZE * 0.01;
const ROTATION_STEP = Math.PI / 36;

// Список файлов моделей
const modelFiles = [
  "models/11111.obj",
  "models/2к 3D.obj",
  "models/3к 3D.obj",
  "models/4к 3D.obj",
  "models/5к.obj",
  "models/6к.obj",
  "models/7к.obj",
  "models/highway road.obj",  // Дорога
  "models/blueCorp.obj",  // Синий корпус
];

// ========== ИНИЦИАЛИЗАЦИЯ СЦЕНЫ ==========
const canvas = document.querySelector("#c");
if (!canvas) {
  console.error("Canvas не найден!");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe0e0e0);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);

// Начальная позиция камеры
camera.position.set(0, 480, 480);  // Высота увеличена в 2 раза
camera.lookAt(0, 2, -10);

const renderer = new THREE.WebGLRenderer({ 
  canvas, 
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;

// ========== УПРАВЛЕНИЕ КАМЕРОЙ ==========
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, -10);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 60;
controls.maxDistance = 2000;
controls.maxPolarAngle = Math.PI * 0.6;
controls.minPolarAngle = 0.2;

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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);  // Увеличена яркость
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);  // Увеличена яркость
directionalLight.position.set(-0.3, -1.0, -0.2);
scene.add(directionalLight);

// Добавляем дополнительный свет сверху для лучшей видимости
const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
topLight.position.set(0, 1, 0);
scene.add(topLight);

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

// Флаг для предотвращения повторных обновлений плана
let floorExpanded = false;

// Функция для расширения плана на основе позиций моделей
function expandFloorToFitModels() {
  if (loadedModels.length === 0 || floorExpanded) return;
  
  // Находим границы всех моделей
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  loadedModels.forEach((model) => {
    if (!model) return;
    
    // Получаем границы модели
    const box = new THREE.Box3().setFromObject(model);
    const min = box.min;
    const max = box.max;
    
    minX = Math.min(minX, min.x);
    maxX = Math.max(maxX, max.x);
    minZ = Math.min(minZ, min.z);
    maxZ = Math.max(maxZ, max.z);
  });
  
  // Проверяем, что нашли валидные границы
  if (minX === Infinity || maxX === -Infinity) return;
  
  // Добавляем запас (20% от размера)
  const paddingX = (maxX - minX) * 0.2;
  const paddingZ = (maxZ - minZ) * 0.2;
  minX -= paddingX;
  maxX += paddingX;
  minZ -= paddingZ;
  maxZ += paddingZ;
  
  // Вычисляем новый размер плана
  const newSizeX = maxX - minX;
  const newSizeZ = maxZ - minZ;
  const newSize = Math.max(newSizeX, newSizeZ);
  
  // Минимальный размер для красоты
  const minSize = PLAN_SIZE * 2;
  const targetSize = Math.max(newSize, minSize);
  
  // Обновляем только если размер значительно изменился (более чем на 10%)
  if (Math.abs(targetSize - PLAN_TEXTURE_SIZE) / PLAN_TEXTURE_SIZE < 0.1) {
    floorExpanded = true;
    return;
  }
  
  PLAN_TEXTURE_SIZE = targetSize;
  
  // Обновляем геометрию пола
  if (floor) {
    // Удаляем старую геометрию из памяти
    const oldGeometry = floor.geometry;
    // Создаём новую геометрию с новым размером
    const floorGeometry = new THREE.PlaneGeometry(PLAN_TEXTURE_SIZE, PLAN_TEXTURE_SIZE);
    floor.geometry = floorGeometry;
    // Освобождаем память старой геометрии после замены
    oldGeometry.dispose();
  }
  
  // Обновляем сетку
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper.dispose(); // Освобождаем память
    const gridSize = Math.ceil(PLAN_TEXTURE_SIZE / 100) * 100; // Округляем до сотен
    const divisions = Math.max(20, Math.floor(gridSize / 100)); // Минимум 20 делений
    gridHelper = new THREE.GridHelper(
      gridSize,
      divisions,
      0x595966,
      0x595966
    );
    gridHelper.position.y = PLAN_Y + 0.01;
    scene.add(gridHelper);
  }
  
  floorExpanded = true;
  console.log(`✓ План расширен до размера: ${PLAN_TEXTURE_SIZE.toFixed(2)} x ${PLAN_TEXTURE_SIZE.toFixed(2)}`);
}

createFloor();

// ========== ЗАГРУЗКА МОДЕЛЕЙ ==========
const loadedModels = [];
const modelOffsets = {};
const modelRotations = {};
const modelHeights = {};
const initialModelScales = {}; // Начальные масштабы для ползунка

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
  console.log("Начинаем загрузку моделей...");
  
  const loadPromises = modelFiles.map((file, index) => {
    return new Promise((resolve, reject) => {
      loader.load(
        file,
        (object) => {
          try {
            // Вычисляем границы модели
            const box = new THREE.Box3().setFromObject(object);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.z);
            
            if (maxDim === 0) {
              console.warn(`Модель ${index + 1} имеет нулевой размер`);
              reject(new Error("Zero size"));
              return;
            }
            
            // Масштабирование под размер плана
            const scale = (PLAN_SIZE * 0.9) / maxDim;
            object.scale.multiplyScalar(scale);
            
            // Центрируем модель
            object.position.sub(center.multiplyScalar(scale));
            
            // Выравниваем по полу
            const MODEL_LIFT = PLAN_SIZE * 0.12;
            object.position.y = MODEL_LIFT;
            
            // Применяем материал с правильными настройками и исправляем геометрию
            object.traverse((child) => {
              if (child.isMesh && child.geometry) {
                const geometry = child.geometry;
                
                // Всегда пересчитываем нормали для правильного отображения
                // Используем более агрессивный алгоритм для исправления проблем
                geometry.computeVertexNormals(true);  // true = использовать углы граней для весов
                
                // Для первой модели добавляем детальное логирование и дополнительные исправления
                if (index === 0) {
                  console.log(`Модель 1 (${file}): детальная информация:`);
                  const initialVertexCount = geometry.attributes.position.count;
                  console.log(`  Вершин до обработки: ${initialVertexCount}`);
                  console.log(`  Нормалей: ${geometry.attributes.normal ? geometry.attributes.normal.count : 0}`);
                  if (geometry.index) {
                    console.log(`  Индексов: ${geometry.index.count}`);
                  }
                  
                  // Проверяем геометрию на проблемы
                  geometry.computeBoundingBox();
                  const bbox = geometry.boundingBox;
                  console.log(`  Размеры: ${bbox.max.x - bbox.min.x} x ${bbox.max.y - bbox.min.y} x ${bbox.max.z - bbox.min.z}`);
                  
                  // Убеждаемся, что геометрия валидна
                  if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) {
                    console.warn(`  ВНИМАНИЕ: Нормали отсутствуют после обработки!`);
                    geometry.computeVertexNormals(true);
                  }
                  
                  console.log(`  ✓ Модель 1 обработана успешно`);
                }
                
                // Применяем материал с улучшенными настройками
                child.material = new THREE.MeshStandardMaterial({
                  color: 0xdddddd,  // Ещё более светлый цвет для лучшей видимости
                  side: THREE.DoubleSide,  // Рендерить обе стороны граней (важно для исправления прозрачности)
                  flatShading: false,  // Плавное затенение
                  vertexColors: false,
                  metalness: 0.1,  // Небольшая металличность
                  roughness: 0.7   // Средняя шероховатость для лучшего отражения света
                });
              }
            });
            
            // Вычисляем высоту для нормализации
            const height = size.y * scale;
            const modelKey = `model${index + 1}`;
            modelHeights[modelKey] = height;
            
            // Позиции будут применены из JSON после загрузки всех моделей
            // Пока используем базовую позицию Y (выравнивание по полу)
            object.position.y = MODEL_LIFT;
            
            loadedModels[index] = object;
            scene.add(object);
            
            // Сохраняем начальный масштаб модели для ползунка
            // modelKey уже объявлен выше
            initialModelScales[modelKey] = {
              x: object.scale.x,
              y: object.scale.y,
              z: object.scale.z
            };
            
            console.log(`✓ Модель ${index + 1} (${file}) загружена, высота: ${height.toFixed(2)}`);
            resolve(object);
          } catch (error) {
            console.error(`Ошибка обработки модели ${index + 1}:`, error);
            reject(error);
          }
        },
        undefined,
        (error) => {
          console.error(`✗ Ошибка загрузки модели ${index + 1} (${file}):`, error);
          reject(error);
        }
      );
    });
  });
  
  try {
    const results = await Promise.allSettled(loadPromises);
    const loadedCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`Загружено моделей: ${loadedCount}/${modelFiles.length}`);
    
    // Применяем позиции из JSON (нормализация высоты отключена)
    setTimeout(async () => {
      // normalizeModelHeights();  // Отключено - не растягиваем модели под новые
      await loadModelPositions();
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
  
  console.log(`✓ Высота всех моделей нормализована`);
}

// Загрузка позиций из JSON
async function loadModelPositions() {
  try {
    const response = await fetch("model_positions.json");
    if (!response.ok) {
      console.log("Файл model_positions.json не найден, используются позиции по умолчанию");
      // Применяем позиции по умолчанию
      for (let i = 0; i < loadedModels.length; i++) {
        const model = loadedModels[i];
        if (!model) continue;
        const modelKey = `model${i + 1}`;
        model.position.x = modelOffsets[modelKey].x;
        model.position.z = modelOffsets[modelKey].z;
        model.rotation.y = modelRotations[modelKey].yaw;
      }
      return;
    }
    const positions = await response.json();
    
    for (const modelKey in positions) {
      if (positions[modelKey]) {
        const pos = positions[modelKey];
        const modelIndex = parseInt(modelKey.replace("model", "")) - 1;
        const model = loadedModels[modelIndex];
        
        if (!model) {
          console.warn(`Модель ${modelKey} не найдена для применения позиции`);
          continue;
        }
        
        // Применяем позиции из JSON
        if (pos.offset) {
          const x = pos.offset.x !== undefined ? pos.offset.x : modelOffsets[modelKey]?.x || 0;
          const y = pos.offset.y !== undefined ? pos.offset.y : model.position.y;
          const z = pos.offset.z !== undefined ? pos.offset.z : modelOffsets[modelKey]?.z || 0;
          
          model.position.set(x, y, z);
          
          // Обновляем modelOffsets для синхронизации
          if (!modelOffsets[modelKey]) modelOffsets[modelKey] = {};
          modelOffsets[modelKey].x = x;
          modelOffsets[modelKey].y = y;
          modelOffsets[modelKey].z = z;
        }
        
        // Применяем поворот из JSON
        if (pos.rotation && pos.rotation.yaw !== undefined) {
          model.rotation.y = pos.rotation.yaw;
          
          // Обновляем modelRotations для синхронизации
          if (!modelRotations[modelKey]) modelRotations[modelKey] = {};
          modelRotations[modelKey].yaw = pos.rotation.yaw;
        }
        
        // Применяем масштаб из JSON
        if (pos.scale) {
          const scaleX = pos.scale.x !== undefined ? pos.scale.x : model.scale.x;
          const scaleY = pos.scale.y !== undefined ? pos.scale.y : model.scale.y;
          const scaleZ = pos.scale.z !== undefined ? pos.scale.z : model.scale.z;
          
          model.scale.set(scaleX, scaleY, scaleZ);
          
          // Обновляем начальный масштаб для ползунков (если не был сохранён ранее)
          if (!initialModelScales[modelKey]) {
            initialModelScales[modelKey] = {
              x: scaleX,
              y: scaleY,
              z: scaleZ
            };
          } else {
            // Если начальный масштаб уже есть, обновляем его под текущий загруженный
            // Это нужно для правильной работы ползунков
            initialModelScales[modelKey] = {
              x: scaleX,
              y: scaleY,
              z: scaleZ
            };
          }
        }
      }
    }
    console.log("✓ Позиции и масштабы моделей загружены и применены из model_positions.json");
    
    // Обновляем ползунки после загрузки масштабов
    updatePositionModeLabel();
  } catch (error) {
    console.warn("Не удалось загрузить позиции из model_positions.json:", error);
    // Применяем позиции по умолчанию при ошибке
    for (let i = 0; i < loadedModels.length; i++) {
      const model = loadedModels[i];
      if (!model) continue;
      const modelKey = `model${i + 1}`;
      model.position.x = modelOffsets[modelKey].x;
      model.position.z = modelOffsets[modelKey].z;
      model.rotation.y = modelRotations[modelKey].yaw;
    }
  }
  
  // Расширяем план под все модели после применения позиций (вызываем один раз)
  // Используем небольшую задержку, чтобы убедиться, что все модели позиционированы
  setTimeout(() => {
    expandFloorToFitModels();
  }, 100);
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

function scaleActiveModel(scaleFactor) {
  if (activeModel < 1 || activeModel > loadedModels.length) return;
  const model = loadedModels[activeModel - 1];
  if (!model) return;
  
  model.scale.multiplyScalar(scaleFactor);
}

function updatePositionModeLabel() {
  if (!positionModeBtn) return;
  const status = positionMode ? "On" : "Off";
  positionModeBtn.textContent = `Position Mode: ${status} (Model ${activeModel})`;
  
  // Обновляем метку ползунка масштаба
  const scaleLabel = document.getElementById("scaleLabel");
  if (scaleLabel) {
    scaleLabel.textContent = `Масштаб модели (Model ${activeModel}):`;
  }
  
  // Обновляем значения ползунков под текущий масштаб модели
  const sliderX = document.getElementById("modelScaleXSlider");
  const sliderY = document.getElementById("modelScaleYSlider");
  const sliderZ = document.getElementById("modelScaleZSlider");
  
  if (activeModel >= 1 && activeModel <= loadedModels.length) {
    const model = loadedModels[activeModel - 1];
    if (model) {
      const modelKey = `model${activeModel}`;
      const initial = initialModelScales[modelKey];
      
      if (initial) {
        // Вычисляем масштаб относительно начального для каждой оси
        const currentScaleX = model.scale.x / initial.x;
        const currentScaleY = model.scale.y / initial.y;
        const currentScaleZ = model.scale.z / initial.z;
        
        if (sliderX) sliderX.value = Math.max(0.1, Math.min(3, currentScaleX)).toFixed(2);
        if (sliderY) sliderY.value = Math.max(0.1, Math.min(3, currentScaleY)).toFixed(2);
        if (sliderZ) sliderZ.value = Math.max(0.1, Math.min(3, currentScaleZ)).toFixed(2);
      } else {
        // Если начальный масштаб не сохранён, считаем что масштаб = 1 (100%)
        if (sliderX) sliderX.value = "1.00";
        if (sliderY) sliderY.value = "1.00";
        if (sliderZ) sliderZ.value = "1.00";
      }
      updateScaleValue();
    }
  }
}

function updateScaleValue() {
  const sliderX = document.getElementById("modelScaleXSlider");
  const sliderY = document.getElementById("modelScaleYSlider");
  const sliderZ = document.getElementById("modelScaleZSlider");
  const scaleXValue = document.getElementById("scaleXValue");
  const scaleYValue = document.getElementById("scaleYValue");
  const scaleZValue = document.getElementById("scaleZValue");
  
  if (sliderX && scaleXValue) {
    const percent = (parseFloat(sliderX.value) * 100).toFixed(0);
    scaleXValue.textContent = `${percent}%`;
  }
  if (sliderY && scaleYValue) {
    const percent = (parseFloat(sliderY.value) * 100).toFixed(0);
    scaleYValue.textContent = `${percent}%`;
  }
  if (sliderZ && scaleZValue) {
    const percent = (parseFloat(sliderZ.value) * 100).toFixed(0);
    scaleZValue.textContent = `${percent}%`;
  }
}

// ========== ОБРАБОТКА КЛАВИАТУРЫ ==========
window.addEventListener("keydown", (event) => {
  // Сброс камеры
  if (event.key === "r" || event.key === "R") {
    camera.position.set(0, 480, 480);  // Высота увеличена в 2 раза
    controls.target.set(0, 2, -10);
    controls.update();
    return;
  }
  
  // Переключение между моделями (1-9)
  if (event.key >= "1" && event.key <= "9") {
    const modelNum = parseInt(event.key);
    if (modelNum >= 1 && modelNum <= loadedModels.length) {
      activeModel = modelNum;
      updatePositionModeLabel();  // Обновит и ползунок масштаба
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
      nudgeActiveModel(-POSITION_STEP, 0, 0);  // Влево
      return;
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeActiveModel(POSITION_STEP, 0, 0);  // Вправо
      return;
    } else if (event.key === "q" || event.key === "Q") {
      event.preventDefault();
      rotateActiveModel(-ROTATION_STEP);
      return;
    } else if (event.key === "e" || event.key === "E") {
      event.preventDefault();
      rotateActiveModel(ROTATION_STEP);
      return;
    } else if (event.key === "PageUp" || event.key === " ") {
      // Space или PageUp - поднять модель
      event.preventDefault();
      nudgeActiveModel(0, POSITION_STEP, 0);
      return;
    } else if (event.key === "PageDown" || event.key === "Shift") {
      // Shift или PageDown - опустить модель
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
    move.add(right.clone().multiplyScalar(-moveSpeed));  // Исправлена инверсия
  }
  if (keys.ArrowRight || keys.d) {
    move.add(right.clone().multiplyScalar(moveSpeed));  // Исправлена инверсия
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
      scale: {
        x: model.scale.x,
        y: model.scale.y,
        z: model.scale.z
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
  if (loadedModels.length === 0 || !loadedModels[0]) {
    alert("Нет загруженных моделей для экспорта");
    return;
  }
  
  const model = loadedModels[0];
  let objContent = "# Exported 3D Building Model\n";
  
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

// Функция для применения масштаба по осям (масштабирование относительно центра модели)
function applyModelScale(axis, scaleValue) {
  if (activeModel < 1 || activeModel > loadedModels.length) return;
  const model = loadedModels[activeModel - 1];
  if (!model) return;
  
  const modelKey = `model${activeModel}`;
  
  // Если начальный масштаб не сохранён, сохраняем текущий
  if (!initialModelScales[modelKey]) {
    initialModelScales[modelKey] = {
      x: model.scale.x,
      y: model.scale.y,
      z: model.scale.z
    };
  }
  
  // Получаем центр модели ДО масштабирования (в локальных координатах относительно позиции)
  const boxBefore = new THREE.Box3().setFromObject(model);
  const centerBefore = boxBefore.getCenter(new THREE.Vector3());
  const centerOffsetBefore = centerBefore.clone().sub(model.position);
  
  // Применяем масштаб относительно начального для указанной оси
  const initial = initialModelScales[modelKey];
  const newScale = parseFloat(scaleValue);
  
  if (axis === 'x') {
    model.scale.x = initial.x * newScale;
  } else if (axis === 'y') {
    model.scale.y = initial.y * newScale;
  } else if (axis === 'z') {
    model.scale.z = initial.z * newScale;
  }
  
  // Обновляем матрицу трансформации
  model.updateMatrixWorld(true);
  
  // Получаем центр модели ПОСЛЕ масштабирования
  const boxAfter = new THREE.Box3().setFromObject(model);
  const centerAfter = boxAfter.getCenter(new THREE.Vector3());
  const centerOffsetAfter = centerAfter.clone().sub(model.position);
  
  // Компенсируем смещение центра, чтобы модель оставалась на месте
  const offsetDiff = centerOffsetBefore.clone().sub(centerOffsetAfter);
  model.position.add(offsetDiff);
}

// Ползунки масштабирования модели по осям
const modelScaleXSlider = document.getElementById("modelScaleXSlider");
const modelScaleYSlider = document.getElementById("modelScaleYSlider");
const modelScaleZSlider = document.getElementById("modelScaleZSlider");

if (modelScaleXSlider) {
  modelScaleXSlider.addEventListener("input", (e) => {
    updateScaleValue();
    applyModelScale('x', e.target.value);
  });
}

if (modelScaleYSlider) {
  modelScaleYSlider.addEventListener("input", (e) => {
    updateScaleValue();
    applyModelScale('y', e.target.value);
  });
}

if (modelScaleZSlider) {
  modelScaleZSlider.addEventListener("input", (e) => {
    updateScaleValue();
    applyModelScale('z', e.target.value);
  });
}

// Инициализируем значения при загрузке
updateScaleValue();

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
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Необработанное обещание:", event.reason);
});

// Устанавливаем фокус на canvas
canvas.addEventListener("click", () => {
  canvas.focus();
});

  window.addEventListener("load", () => {
    canvas.focus();
    console.log("✓ Приложение загружено");
  });
}

// Запускаем инициализацию
initApp();
