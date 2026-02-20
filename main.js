// ========== THREE.JS VERSION (ES Modules) ==========
// Использует Three.js из node_modules через importmap

// Импортируем Three.js и модули
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

console.log('✓ Three.js загружен из node_modules');

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let activeModel = 1;
let positionMode = false;
let addLabelMode = false;
let allLabels = []; // Массив всех меток
let editingLabel = null; // Текущая редактируемая метка
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let lastCameraPosition = new THREE.Vector3();
let lastCameraRotation = new THREE.Euler();

// Глобальные ссылки на объекты сцены (будут установлены в initApp)
let globalCamera = null;
let globalLoadedModels = [];

// Глобальные переменные для сцены, камеры, рендерера (будут инициализированы в initApp)
let scene = null;
let camera = null;
let renderer = null;
let labelRenderer = null;
let controls = null;
let canvas = null;

// Система этажей
let currentFloor = 0; // 0 = все этажи, 1+ = конкретный этаж
let floorHeight = 3.5; // Высота одного этажа в единицах 3D (метры)
let buildingFloors = {}; // Количество этажей для каждого здания {model1: 5, model2: 3, ...}
let floorViewMode = false; // Режим просмотра этажа (орто-камера сверху)

/**
 * Проверяет видимость метки (не перекрыта ли зданием)
 * @param {THREE.CSS2DObject} label - Метка для проверки
 * @param {THREE.Vector3} labelPosition - Позиция метки в 3D пространстве
 * @returns {boolean} - true если метка видима, false если скрыта за зданием
 */
function checkLabelVisibility(label, labelPosition) {
  if (!globalCamera || !labelPosition || !globalLoadedModels.length) return true;
  
  // Создаем луч от камеры до метки
  const direction = new THREE.Vector3();
  direction.subVectors(labelPosition, globalCamera.position).normalize();
  
  const checkRaycaster = new THREE.Raycaster();
  checkRaycaster.set(globalCamera.position, direction);
  
  // Проверяем пересечение с моделями (исключаем пол и сетку)
  const objectsToCheck = globalLoadedModels.filter(m => m !== null);
  const intersects = checkRaycaster.intersectObjects(objectsToCheck, true);
  
  if (intersects.length === 0) {
    // Нет пересечений - метка видима
    return true;
  }
  
  // Проверяем расстояние до первого пересечения
  const distanceToLabel = globalCamera.position.distanceTo(labelPosition);
  const distanceToIntersection = intersects[0].distance;
  
  // Если первое пересечение ближе метки - метка скрыта
  // Добавляем небольшой запас для точности (10 единиц)
  return distanceToIntersection >= distanceToLabel - 10;
}

/**
 * Обновляет видимость всех меток на основе их позиций относительно зданий
 */
function updateLabelsVisibility() {
  if (!globalCamera || allLabels.length === 0) return;
  
  // Проверяем, изменилась ли позиция или поворот камеры
  const cameraPosition = globalCamera.position.clone();
  const cameraRotation = globalCamera.rotation.clone();
  
  const cameraChanged = 
    !cameraPosition.equals(lastCameraPosition) ||
    Math.abs(cameraRotation.x - lastCameraRotation.x) > 0.01 ||
    Math.abs(cameraRotation.y - lastCameraRotation.y) > 0.01 ||
    Math.abs(cameraRotation.z - lastCameraRotation.z) > 0.01;
  
  // Обновляем кэш позиции камеры
  lastCameraPosition.copy(cameraPosition);
  lastCameraRotation.copy(cameraRotation);
  
  // Обновляем видимость меток только если камера изменилась или это первый кадр
  if (!cameraChanged && lastCameraPosition.length() > 0) {
    return; // Камера не изменилась, пропускаем проверку
  }
  
  allLabels.forEach((labelData) => {
    if (!labelData.label || !labelData.marker) return;
    
    // Получаем позицию метки в 3D пространстве
    const labelPosition = labelData.label.position.clone();
    
    // Проверяем видимость
    const isVisible = checkLabelVisibility(labelData.label, labelPosition);
    
    // Скрываем/показываем метку
    if (labelData.label.element) {
      labelData.label.element.style.display = isVisible ? 'block' : 'none';
    }
  });
}

/**
 * Обновляет панель со списком меток
 */
function updateLabelsPanel() {
  const labelsList = document.getElementById('labelsList');
  if (!labelsList) {
    console.warn("labelsList не найден");
    return;
  }
  
  labelsList.innerHTML = '';
  
  if (allLabels.length === 0) {
    labelsList.innerHTML = '<div class="label-hint" style="padding: 8px; text-align: center;">Нет меток</div>';
    return;
  }
  
  allLabels.forEach((labelData) => {
    const item = document.createElement('div');
    item.className = 'label-item';
    item.innerHTML = `
      <div class="label-item-text" title="${labelData.text}">${labelData.text}</div>
      <div class="label-item-actions">
        <button class="label-item-btn" onclick="editLabel('${labelData.id}')">✏️</button>
        <button class="label-item-btn" onclick="deleteLabelFromUI('${labelData.id}')">🗑️</button>
      </div>
    `;
    labelsList.appendChild(item);
  });
}

// Делаем функцию доступной глобально
window.updateLabelsPanel = updateLabelsPanel;

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
canvas = document.querySelector("#c");
if (!canvas) {
  console.error("Canvas не найден!");
  return; // Выходим если canvas не найден
}

scene = new THREE.Scene();
scene.background = new THREE.Color(0xe0e0e0);

camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  10000
);

// Сохраняем глобальную ссылку на камеру для функций проверки видимости
globalCamera = camera;

// Начальная позиция камеры
camera.position.set(0, 480, 480);  // Высота увеличена в 2 раза
camera.lookAt(0, 2, -10);

renderer = new THREE.WebGLRenderer({ 
  canvas, 
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;

// ========== CSS2DRenderer ДЛЯ МЕТОК ==========
labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none'; // Позволяет кликать сквозь метки
document.getElementById('app').appendChild(labelRenderer.domElement);

// ========== УПРАВЛЕНИЕ КАМЕРОЙ ==========
controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, -10);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 60;
controls.maxDistance = 2000;
controls.maxPolarAngle = Math.PI * 0.6;
controls.minPolarAngle = 0.2;

// Сохраняем ссылку на controls для доступа из других функций
if (canvas) {
  canvas.userData = canvas.userData || {};
  canvas.userData.controls = controls;
}

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

// Сохраняем глобальную ссылку на массив моделей для функций проверки видимости
globalLoadedModels = loadedModels;
const modelOffsets = {};
const modelRotations = {};
const modelHeights = {};
const initialModelScales = {}; // Начальные масштабы для ползунка

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
            initialModelScales[modelKey] = {
              x: object.scale.x,
              y: object.scale.y,
              z: object.scale.z
            };
            
            // Автоматически определяем количество этажей на основе высоты модели
            const estimatedFloors = Math.max(1, Math.floor(height / floorHeight));
            buildingFloors[modelKey] = estimatedFloors;
            
            console.log(`✓ Модель ${index + 1} (${file}) загружена, высота: ${height.toFixed(2)}`);
            console.log(`  → Определено этажей: ${estimatedFloors} (высота: ${height.toFixed(2)}, высота этажа: ${floorHeight})`);
            
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
      // Пропускаем секцию "labels" и другие не-модели
      if (modelKey === "labels" || !modelKey.startsWith("model")) {
        continue;
      }
      
      if (positions[modelKey]) {
        const pos = positions[modelKey];
        const modelIndex = parseInt(modelKey.replace("model", "")) - 1;
        
        // Проверяем валидность индекса модели
        if (modelIndex < 0 || modelIndex >= loadedModels.length) {
          console.warn(`Неверный индекс модели для ${modelKey}: ${modelIndex}`);
          continue;
        }
        
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
        // Убеждаемся, что начальный масштаб сохранён (должен быть сохранён при загрузке модели)
        if (!initialModelScales[modelKey]) {
          // Если по какой-то причине не сохранён, сохраняем текущий
          initialModelScales[modelKey] = {
            x: model.scale.x,
            y: model.scale.y,
            z: model.scale.z
          };
        }
        
        const initialScale = initialModelScales[modelKey];
        
        if (pos.scale) {
          // Значения из JSON интерпретируем как относительные множители (1.0 = 100%)
          let scaleX = pos.scale.x !== undefined ? pos.scale.x : 1.0;
          let scaleY = pos.scale.y !== undefined ? pos.scale.y : 1.0;
          let scaleZ = pos.scale.z !== undefined ? pos.scale.z : 1.0;
          
          // Проверяем, не являются ли значения масштаба слишком большими
          // Если масштаб больше 10, вероятно это абсолютное значение из старого формата
          if (scaleX > 10 || scaleY > 10 || scaleZ > 10) {
            // Конвертируем из старого формата (абсолютные значения) в новый (относительные)
            scaleX = scaleX / initialScale.x;
            scaleY = scaleY / initialScale.y;
            scaleZ = scaleZ / initialScale.z;
          }
          
          model.scale.set(
            initialScale.x * scaleX,
            initialScale.y * scaleY,
            initialScale.z * scaleZ
          );
        }
      }
    }
  } catch (error) {
    console.error("Ошибка загрузки позиций моделей:", error);
  }
  
  // Расширяем план под все модели после применения позиций (вызываем один раз)
  // Используем небольшую задержку, чтобы убедиться, что все модели позиционированы
  setTimeout(() => {
    expandFloorToFitModels();
    
    // Загружаем сохраненные метки
    loadLabelsFromJSON();
  }, 500);
}

// Загружаем модели после инициализации
loadAllModels();

// Запускаем анимацию после инициализации
animate();

// Добавляем обработчик ресайза
window.addEventListener("resize", resize);

// ========== СОЗДАНИЕ МЕТОК (CSS2DRenderer) ==========
/**
 * Создает метку в 3D пространстве
 * @param {string} text - Текст метки
 * @param {THREE.Object3D} object - Объект, к которому привязана метка
 * @param {Object} options - Опции стилизации
 * @returns {THREE.Object3D} - Группа с меткой
 */
function createLabel(text, object, options = {}) {
  // Создаем HTML элемент для метки
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = text;
  labelDiv.style.backgroundColor = options.backgroundColor || 'rgba(0, 0, 0, 0.7)';
  labelDiv.style.color = options.color || '#fff';
  labelDiv.style.padding = options.padding || '8px 12px';
  labelDiv.style.borderRadius = options.borderRadius || '4px';
  labelDiv.style.fontSize = options.fontSize || '14px';
  labelDiv.style.fontWeight = options.fontWeight || '500';
  labelDiv.style.whiteSpace = 'nowrap';
  labelDiv.style.pointerEvents = 'auto'; // Разрешаем взаимодействие с меткой
  labelDiv.style.cursor = 'pointer';
  labelDiv.style.userSelect = 'none';
  
  // Добавляем тень для лучшей читаемости
  labelDiv.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
  
  // Создаем CSS2DObject (специальный объект Three.js для HTML меток)
  const label = new CSS2DObject(labelDiv);
  
  // Добавляем обработчик клика для редактирования (после создания label)
  labelDiv.addEventListener('click', (e) => {
    e.stopPropagation();
    const labelId = label.userData?.labelId;
    if (labelId) {
      openLabelEditModal(labelId);
    }
  });
  
  // Позиционируем метку относительно объекта
  const offset = options.offset || { x: 0, y: 1, z: 0 };
  label.position.set(
    object.position.x + offset.x,
    object.position.y + offset.y,
    object.position.z + offset.z
  );
  
  // Сохраняем offset в userData для последующего обновления
  label.userData.offset = offset;
  label.userData.targetObject = object; // Сохраняем ссылку на объект
  
  // Добавляем в сцену
  scene.add(label);
  
  return label;
}

/**
 * Создает метку для модели по её индексу
 * @param {number} modelIndex - Индекс модели (1-9)
 * @param {string} labelText - Текст метки
 * @param {Object} options - Опции
 */
function addModelLabel(modelIndex, labelText, options = {}) {
  if (modelIndex < 1 || modelIndex > loadedModels.length) {
    console.warn(`Модель ${modelIndex} не существует`);
    return null;
  }
  
  const model = loadedModels[modelIndex - 1];
  if (!model) {
    console.warn(`Модель ${modelIndex} не загружена`);
    return null;
  }
  
  // Вычисляем высоту модели для позиционирования метки
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const height = size.y;
  
  // Позиционируем метку над моделью
  const offset = {
    x: options.offsetX || 0,
    y: options.offsetY !== undefined ? options.offsetY : height * 0.6, // Над моделью
    z: options.offsetZ || 0
  };
  
  const label = createLabel(labelText, model, {
    backgroundColor: options.backgroundColor,
    color: options.color,
    padding: options.padding,
    borderRadius: options.borderRadius,
    fontSize: options.fontSize,
    fontWeight: options.fontWeight,
    offset: offset
  });
  
  // Сохраняем ссылку на метку для обновления позиции
  if (!model.userData.labels) {
    model.userData.labels = [];
  }
  model.userData.labels.push(label);
  
  return label;
}

/**
 * Обновляет позицию метки относительно модели
 * @param {THREE.Object3D} model - Модель
 * @param {THREE.CSS2DObject} label - Метка
 * @param {Object} offset - Смещение метки
 */
function updateLabelPosition(model, label, offset = { x: 0, y: 1, z: 0 }) {
  if (!model || !label) return;
  
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const height = size.y;
  
  label.position.set(
    model.position.x + (offset.x || 0),
    model.position.y + (offset.y !== undefined ? offset.y : height * 0.6),
    model.position.z + (offset.z || 0)
  );
}

/**
 * Обновляет все метки модели при изменении её позиции
 * @param {THREE.Object3D} model - Модель
 */
function updateModelLabels(model) {
  if (!model) return;
  
  // Находим индекс модели
  const modelIndex = loadedModels.indexOf(model) + 1;
  if (modelIndex === 0) return;
  
  // Обновляем все метки, привязанные к этой модели
  allLabels.forEach((labelData) => {
    if (labelData.modelIndex === modelIndex) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const height = size.y;
      
      // Обновляем позицию маркера
      labelData.marker.position.copy(model.position);
      
      // Обновляем позицию метки
      const offsetY = labelData.offsetY !== undefined ? labelData.offsetY : height * 0.6;
      labelData.label.position.set(
        model.position.x,
        model.position.y + offsetY,
        model.position.z
      );
      labelData.label.userData.offset.y = offsetY;
    }
  });
}

// ========== УПРАВЛЕНИЕ МЕТКАМИ ЧЕРЕЗ UI ==========
/**
 * Создает новую метку в указанной позиции
 */
function createNewLabel(position, modelIndex = null) {
  const labelId = `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Создаем объект-маркер для позиции
  const marker = new THREE.Object3D();
  marker.position.copy(position);
  scene.add(marker);
  
  // Определяем offset
  let offsetY = 20;
  if (modelIndex !== null && modelIndex >= 1 && modelIndex <= loadedModels.length) {
    const model = loadedModels[modelIndex - 1];
    if (model) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      offsetY = size.y * 0.6;
    }
  }
  
  // Создаем метку
  const label = createLabel("Новая метка", marker, {
    backgroundColor: 'rgba(74, 158, 255, 0.9)',
    color: '#fff',
    fontSize: '14px',
    offset: { x: 0, y: offsetY, z: 0 }
  });
  
  // Сохраняем данные метки
  label.userData.labelId = labelId;
  label.userData.modelIndex = modelIndex;
  label.userData.marker = marker;
  
  allLabels.push({
    id: labelId,
    label: label,
    marker: marker,
    modelIndex: modelIndex,
    text: "Новая метка",
    backgroundColor: 'rgba(74, 158, 255, 0.9)',
    color: '#ffffff',
    fontSize: '14px',
    offsetY: offsetY
  });
  
  updateLabelsPanel();
  saveLabelsToJSON();
  
  // Открываем модальное окно для редактирования
  openLabelEditModal(labelId);
  
  return label;
}

/**
 * Обновляет текст и стили метки
 */
function updateLabel(labelId, data) {
  const labelData = allLabels.find(l => l.id === labelId);
  if (!labelData) return;
  
  const label = labelData.label;
  const labelDiv = label.element;
  
  // Обновляем текст
  if (data.text !== undefined) {
    labelDiv.textContent = data.text;
    labelData.text = data.text;
  }
  
  // Обновляем стили
  if (data.backgroundColor !== undefined) {
    labelDiv.style.backgroundColor = data.backgroundColor;
    labelData.backgroundColor = data.backgroundColor;
  }
  
  if (data.color !== undefined) {
    labelDiv.style.color = data.color;
    labelData.color = data.color;
  }
  
  if (data.fontSize !== undefined) {
    labelDiv.style.fontSize = data.fontSize + 'px';
    labelData.fontSize = data.fontSize + 'px';
  }
  
  if (data.offsetY !== undefined) {
    const marker = labelData.marker;
    const modelIndex = labelData.modelIndex;
    
    if (modelIndex !== null && modelIndex >= 1 && modelIndex <= loadedModels.length) {
      const model = loadedModels[modelIndex - 1];
      if (model) {
        label.position.set(
          model.position.x,
          model.position.y + data.offsetY,
          model.position.z
        );
        marker.position.copy(model.position);
      }
    } else {
      label.position.y = marker.position.y + data.offsetY;
    }
    
    label.userData.offset.y = data.offsetY;
    labelData.offsetY = data.offsetY;
  }
  
  updateLabelsPanel();
  saveLabelsToJSON();
}

/**
 * Удаляет метку
 */
function deleteLabel(labelId) {
  const index = allLabels.findIndex(l => l.id === labelId);
  if (index === -1) return;
  
  const labelData = allLabels[index];
  
  // Удаляем метку из сцены
  scene.remove(labelData.label);
  scene.remove(labelData.marker);
  
  // Удаляем из массива
  allLabels.splice(index, 1);
  
  updateLabelsPanel();
  saveLabelsToJSON();
}

/**
 * Открывает модальное окно для редактирования метки
 */
function openLabelEditModal(labelId) {
  const labelData = allLabels.find(l => l.id === labelId);
  if (!labelData) return;
  
  editingLabel = labelId;
  const modal = document.getElementById('labelEditModal');
  const modalTitle = document.getElementById('modalTitle');
  
  modalTitle.textContent = labelId === editingLabel && !allLabels.find(l => l.id === labelId) ? 'Создать метку' : 'Редактировать метку';
  
  // Заполняем форму
  document.getElementById('labelTextInput').value = labelData.text;
  document.getElementById('labelColorInput').value = rgbToHex(labelData.backgroundColor);
  document.getElementById('labelTextColorInput').value = labelData.color;
  document.getElementById('labelFontSizeInput').value = parseInt(labelData.fontSize) || 14;
  document.getElementById('fontSizeValue').textContent = (parseInt(labelData.fontSize) || 14) + 'px';
  document.getElementById('labelOffsetYInput').value = labelData.offsetY || '';
  
  // Заполняем список моделей
  const modelSelect = document.getElementById('labelModelSelect');
  modelSelect.innerHTML = '<option value="">Не привязана</option>';
  for (let i = 1; i <= loadedModels.length; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Модель ${i}`;
    if (labelData.modelIndex === i) {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  }
  
  modal.style.display = 'flex';
}

/**
 * Закрывает модальное окно
 */
function closeLabelEditModal() {
  const modal = document.getElementById('labelEditModal');
  modal.style.display = 'none';
  editingLabel = null;
}

/**
 * Конвертирует rgba в hex
 */
function rgbToHex(rgba) {
  if (rgba.startsWith('#')) return rgba;
  
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#4a9eff';
  
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Конвертирует hex в rgba
 */
function hexToRgba(hex, alpha = 0.9) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Сохраняет метки в localStorage (без автоматического скачивания)
 * Метки будут включены в model_positions.json при экспорте позиций
 */
function saveLabelsToJSON() {
  const labelsData = {};
  
  allLabels.forEach((labelData) => {
    labelsData[labelData.id] = {
      text: labelData.text,
      position: {
        x: labelData.marker.position.x,
        y: labelData.marker.position.y,
        z: labelData.marker.position.z
      },
      modelIndex: labelData.modelIndex,
      backgroundColor: labelData.backgroundColor,
      color: labelData.color,
      fontSize: labelData.fontSize,
      offsetY: labelData.offsetY
    };
  });
  
  // Сохраняем в localStorage
  localStorage.setItem('3d_labels', JSON.stringify(labelsData));
  
  console.log(`✓ Метки сохранены в localStorage (${Object.keys(labelsData).length} меток)`);
  
  // Возвращаем данные для скачивания
  return labelsData;
}

/**
 * Скачивает метки в отдельный JSON файл
 */
function downloadLabels() {
  const labelsData = saveLabelsToJSON();
  
  // Создаем JSON строку с форматированием
  const jsonString = JSON.stringify(labelsData, null, 2);
  
  // Создаем Blob и скачиваем файл
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'labels.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  console.log(`✓ Файл labels.json скачан (${Object.keys(labelsData).length} меток)`);
}

/**
 * Загружает метки из model_positions.json или localStorage
 */
async function loadLabelsFromJSON() {
  try {
    // Сначала пытаемся загрузить из labels.json
    try {
      const response = await fetch("labels.json");
      if (response.ok) {
        const labelsData = await response.json();
        console.log(`✓ Загружено меток из labels.json: ${Object.keys(labelsData).length}`);
        
        // Проверяем, что это объект с метками, а не пустой
        if (!labelsData || typeof labelsData !== 'object' || Object.keys(labelsData).length === 0) {
          console.log("Файл labels.json пуст или имеет неверный формат");
          return;
        }
          
          // Загружаем метки из файла
          Object.keys(labelsData).forEach((labelId) => {
            const data = labelsData[labelId];
            const position = new THREE.Vector3(
              data.position.x,
              data.position.y,
              data.position.z
            );
            
            // Создаем маркер
            const marker = new THREE.Object3D();
            marker.position.copy(position);
            scene.add(marker);
            
            // Определяем offset
            let offsetY = data.offsetY || 20;
            if (data.modelIndex !== null && data.modelIndex >= 1 && data.modelIndex <= loadedModels.length) {
              const model = loadedModels[data.modelIndex - 1];
              if (model) {
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                offsetY = data.offsetY !== undefined ? data.offsetY : size.y * 0.6;
              }
            }
            
            // Создаем метку
            const label = createLabel(data.text || "Метка", marker, {
              backgroundColor: data.backgroundColor || 'rgba(74, 158, 255, 0.9)',
              color: data.color || '#fff',
              fontSize: data.fontSize || '14px',
              offset: { x: 0, y: offsetY, z: 0 }
            });
            
            // Сохраняем данные метки
            label.userData.labelId = labelId;
            label.userData.modelIndex = data.modelIndex;
            label.userData.marker = marker;
            
            allLabels.push({
              id: labelId,
              label: label,
              marker: marker,
              modelIndex: data.modelIndex,
              text: data.text || "Метка",
              backgroundColor: data.backgroundColor || 'rgba(74, 158, 255, 0.9)',
              color: data.color || '#ffffff',
              fontSize: data.fontSize || '14px',
              offsetY: offsetY
            });
          });
          
          updateLabelsPanel();
          // Сохраняем в localStorage для синхронизации
          localStorage.setItem('3d_labels', JSON.stringify(labelsData));
          return;
        }
    } catch (fileError) {
      console.log("Файл labels.json не найден, пытаемся загрузить из localStorage");
    }
    
    // Если меток нет в model_positions.json, загружаем из localStorage
    const saved = localStorage.getItem('3d_labels');
    if (!saved) return;
    
    const labelsData = JSON.parse(saved);
    
    Object.keys(labelsData).forEach((labelId) => {
      const data = labelsData[labelId];
      const position = new THREE.Vector3(
        data.position.x,
        data.position.y,
        data.position.z
      );
      
      // Создаем маркер
      const marker = new THREE.Object3D();
      marker.position.copy(position);
      scene.add(marker);
      
      // Определяем offset
      let offsetY = data.offsetY || 20;
      if (data.modelIndex !== null && data.modelIndex >= 1 && data.modelIndex <= loadedModels.length) {
        const model = loadedModels[data.modelIndex - 1];
        if (model) {
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          offsetY = data.offsetY !== undefined ? data.offsetY : size.y * 0.6;
        }
      }
      
      // Создаем метку
      const label = createLabel(data.text || "Метка", marker, {
        backgroundColor: data.backgroundColor || 'rgba(74, 158, 255, 0.9)',
        color: data.color || '#fff',
        fontSize: data.fontSize || '14px',
        offset: { x: 0, y: offsetY, z: 0 }
      });
      
      // Сохраняем данные метки
      label.userData.labelId = labelId;
      label.userData.modelIndex = data.modelIndex;
      label.userData.marker = marker;
      
      allLabels.push({
        id: labelId,
        label: label,
        marker: marker,
        modelIndex: data.modelIndex,
        text: data.text || "Метка",
        backgroundColor: data.backgroundColor || 'rgba(74, 158, 255, 0.9)',
        color: data.color || '#ffffff',
        fontSize: data.fontSize || '14px',
        offsetY: offsetY
      });
    });
    
    updateLabelsPanel();
    console.log(`✓ Загружено меток: ${Object.keys(labelsData).length}`);
  } catch (error) {
    console.warn("Ошибка загрузки меток:", error);
  }
}

// Глобальные функции для вызова из HTML
window.editLabel = function(labelId) {
  openLabelEditModal(labelId);
};

window.deleteLabelFromUI = function(labelId) {
  if (confirm('Удалить эту метку?')) {
    deleteLabel(labelId);
  }
};

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
  
  // Обновляем метки модели при перемещении
  updateModelLabels(model);
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
        
        if (sliderX) sliderX.value = Math.max(0.1, Math.min(10, currentScaleX)).toFixed(2);
        if (sliderY) sliderY.value = Math.max(0.1, Math.min(10, currentScaleY)).toFixed(2);
        if (sliderZ) sliderZ.value = Math.max(0.1, Math.min(10, currentScaleZ)).toFixed(2);
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
      
      // Обновляем отображение этажей для новой активной модели
      const floorDisplay = document.getElementById("floorDisplay");
      if (floorDisplay) {
        const modelKey = `model${activeModel}`;
        const maxFloors = buildingFloors[modelKey] || 1;
        if (currentFloor > maxFloors) {
          currentFloor = maxFloors;
        }
        if (currentFloor === 0) {
          floorDisplay.textContent = "Все этажи";
        } else {
          floorDisplay.textContent = `Этаж ${currentFloor} / ${maxFloors}`;
        }
      }
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
  
  // Экспортируем позиции моделей
  for (let i = 0; i < loadedModels.length; i++) {
    const model = loadedModels[i];
    if (!model) continue;
    
    const modelKey = `model${i + 1}`;
    
    // Вычисляем относительные масштабы (текущий / начальный)
    const initialScale = initialModelScales[modelKey] || {
      x: model.scale.x,
      y: model.scale.y,
      z: model.scale.z
    };
    
    const relativeScaleX = model.scale.x / initialScale.x;
    const relativeScaleY = model.scale.y / initialScale.y;
    const relativeScaleZ = model.scale.z / initialScale.z;
    
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
        x: relativeScaleX,  // Сохраняем относительный масштаб (1.0 = 100%)
        y: relativeScaleY,
        z: relativeScaleZ
      },
      file: modelFiles[i] || `models/model${i + 1}.obj`
    };
  }
  
  // Добавляем метки в экспорт
  if (allLabels.length > 0) {
    payload.labels = {};
    allLabels.forEach((labelData) => {
      payload.labels[labelData.id] = {
        text: labelData.text,
        position: {
          x: labelData.marker.position.x,
          y: labelData.marker.position.y,
          z: labelData.marker.position.z
        },
        modelIndex: labelData.modelIndex,
        backgroundColor: labelData.backgroundColor,
        color: labelData.color,
        fontSize: labelData.fontSize,
        offsetY: labelData.offsetY
      };
    });
    console.log(`✓ В экспорт добавлено ${allLabels.length} меток`);
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
  
  console.log(`✓ Позиции моделей и меток экспортированы в model_positions.json`);
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

// Кнопки "Hide Plan" и "Export to OBJ" удалены по запросу пользователя

// ========== UI ДЛЯ УПРАВЛЕНИЯ МЕТКАМИ ==========
// Инициализация кнопок перенесена в функцию initLabelButtons(), 
// которая вызывается после загрузки DOM

// Обработчики модального окна редактирования метки
const labelEditModal = document.getElementById("labelEditModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const saveLabelBtn = document.getElementById("saveLabelBtn");
const deleteLabelBtn = document.getElementById("deleteLabelBtn");
const cancelLabelBtn = document.getElementById("cancelLabelBtn");
const labelFontSizeInput = document.getElementById("labelFontSizeInput");
const fontSizeValue = document.getElementById("fontSizeValue");

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", closeLabelEditModal);
}

if (cancelLabelBtn) {
  cancelLabelBtn.addEventListener("click", closeLabelEditModal);
}

if (labelEditModal) {
  labelEditModal.addEventListener("click", (e) => {
    if (e.target === labelEditModal) {
      closeLabelEditModal();
    }
  });
}

if (labelFontSizeInput && fontSizeValue) {
  labelFontSizeInput.addEventListener("input", (e) => {
    fontSizeValue.textContent = e.target.value + "px";
  });
}

if (saveLabelBtn) {
  saveLabelBtn.addEventListener("click", () => {
    if (!editingLabel) return;
    
    const text = document.getElementById("labelTextInput").value.trim();
    if (!text) {
      alert("Введите текст метки");
      return;
    }
    
    const backgroundColor = hexToRgba(document.getElementById("labelColorInput").value);
    const color = document.getElementById("labelTextColorInput").value;
    const fontSize = parseInt(document.getElementById("labelFontSizeInput").value);
    const offsetY = document.getElementById("labelOffsetYInput").value ? 
      parseFloat(document.getElementById("labelOffsetYInput").value) : undefined;
    const modelIndex = document.getElementById("labelModelSelect").value ? 
      parseInt(document.getElementById("labelModelSelect").value) : null;
    
    // Обновляем привязку к модели если изменилась
    const labelData = allLabels.find(l => l.id === editingLabel);
    if (labelData && labelData.modelIndex !== modelIndex) {
      labelData.modelIndex = modelIndex;
      // Обновляем позицию метки если привязана к модели
      if (modelIndex !== null && modelIndex >= 1 && modelIndex <= loadedModels.length) {
        const model = loadedModels[modelIndex - 1];
        if (model) {
          labelData.marker.position.copy(model.position);
          updateModelLabels(model);
        }
      }
    }
    
    updateLabel(editingLabel, {
      text,
      backgroundColor,
      color,
      fontSize,
      offsetY
    });
    
    closeLabelEditModal();
  });
}

if (deleteLabelBtn) {
  deleteLabelBtn.addEventListener("click", () => {
    if (!editingLabel) return;
    if (confirm("Удалить эту метку?")) {
      deleteLabel(editingLabel);
      closeLabelEditModal();
    }
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
  if (!camera || !renderer || !labelRenderer) return;
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Обновляем камеру в зависимости от типа
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  } else if (camera instanceof THREE.OrthographicCamera) {
    // Обновляем ортографическую камеру
    const aspect = width / height;
    const viewSize = Math.max(camera.right - camera.left, camera.top - camera.bottom) / Math.max(aspect, 1);
    camera.left = -viewSize * aspect / 2;
    camera.right = viewSize * aspect / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    camera.updateProjectionMatrix();
  }
  
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height); // Обновляем размер меток
}

// ========== РЕНДЕРИНГ ==========
function animate() {
  requestAnimationFrame(animate);
  
  // Проверяем, что все объекты инициализированы
  if (!scene || !camera || !renderer || !labelRenderer) {
    return;
  }
  
  // Обновляем движение камеры только если не в режиме добавления меток
  if (!addLabelMode) {
    updateCameraMovement();
    updateModelRotation();
  }
  
  // Обновляем контролы только если они включены
  if (controls && controls.enabled) {
    controls.update();
  }
  
  // Рендерим 3D сцену
  renderer.render(scene, camera);
  
  // Обновляем видимость меток (скрываем за зданиями)
  updateLabelsVisibility();
  
  // Рендерим метки (CSS2DRenderer)
  labelRenderer.render(scene, camera);
}

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

// ========== ОБРАБОТКА КЛИКОВ НА СЦЕНУ ДЛЯ ДОБАВЛЕНИЯ МЕТОК ==========
canvas.addEventListener("click", (event) => {
  if (!addLabelMode) return;
  if (positionMode) return; // Не добавляем метки в режиме позиционирования
  
  // Блокируем стандартное поведение (вращение камеры)
  event.preventDefault();
  event.stopPropagation();
  
  // Проверяем, не кликнули ли по UI элементу (кнопке, панели и т.д.)
  const target = event.target;
  if (target && (
    target.closest('.hud') || 
    target.closest('.labels-panel') || 
    target.closest('.modal') ||
    target.classList.contains('label') ||
    target.tagName === 'BUTTON' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'SELECT'
  )) {
    // Клик по UI элементу - не обрабатываем
    return;
  }
  
  // Получаем координаты мыши в нормализованных координатах (-1 до +1)
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Обновляем raycaster
  raycaster.setFromCamera(mouse, camera);
  
  // Проверяем пересечение с моделями
  const intersects = raycaster.intersectObjects(loadedModels.filter(m => m !== null), true);
  
  let hitPoint = null;
  let modelIndex = null;
  
  if (intersects.length > 0) {
    // Клик по модели
    const intersect = intersects[0];
    hitPoint = intersect.point;
    
    // Находим индекс модели
    for (let i = 0; i < loadedModels.length; i++) {
      if (loadedModels[i] && loadedModels[i].traverse) {
        let found = false;
        loadedModels[i].traverse((child) => {
          if (child === intersect.object || child === intersect.object.parent) {
            found = true;
          }
        });
        if (found) {
          modelIndex = i + 1;
          break;
        }
      }
    }
  } else {
    // Клик по пустому месту - создаем метку на плоскости
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), PLAN_Y);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);
    hitPoint = intersectPoint;
  }
  
  if (hitPoint) {
    createNewLabel(hitPoint, modelIndex);
  }
});

// ========== ОБРАБОТКА КЛИКОВ НА ЗДАНИЯ ДЛЯ ПЕРЕКЛЮЧЕНИЯ ЭТАЖЕЙ ==========
canvas.addEventListener("click", (event) => {
  // Работаем только если НЕ включен режим добавления меток и НЕ режим позиционирования
  if (addLabelMode) return;
  if (positionMode) return;
  
  // Проверяем, не кликнули ли по UI элементу
  const target = event.target;
  if (target && (
    target.closest('.hud') || 
    target.closest('.labels-panel') || 
    target.closest('.modal') ||
    target.classList.contains('label') ||
    target.tagName === 'BUTTON' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'SELECT'
  )) {
    return;
  }
  
  // Получаем координаты мыши в нормализованных координатах (-1 до +1)
  const rect = canvas.getBoundingClientRect();
  const clickMouse = new THREE.Vector2();
  clickMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  clickMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Обновляем raycaster
  const clickRaycaster = new THREE.Raycaster();
  clickRaycaster.setFromCamera(clickMouse, camera);
  
  // Проверяем пересечение с моделями
  const intersects = clickRaycaster.intersectObjects(loadedModels.filter(m => m !== null), true);
  
  if (intersects.length > 0) {
    // Клик по модели - находим индекс модели
    const intersect = intersects[0];
    let clickedModelIndex = null;
    
    for (let i = 0; i < loadedModels.length; i++) {
      if (loadedModels[i] && loadedModels[i].traverse) {
        let found = false;
        loadedModels[i].traverse((child) => {
          if (child === intersect.object || child === intersect.object.parent || 
              (intersect.object.parent && child === intersect.object.parent.parent)) {
            found = true;
          }
        });
        if (found) {
          clickedModelIndex = i + 1;
          break;
        }
      }
    }
    
    // Если нашли модель, делаем её активной и обновляем отображение этажей
    if (clickedModelIndex && clickedModelIndex !== activeModel) {
      activeModel = clickedModelIndex;
      updatePositionModeLabel();
      
      // Обновляем отображение этажей
      const floorDisplay = document.getElementById("floorDisplay");
      if (floorDisplay) {
        const modelKey = `model${activeModel}`;
        const maxFloors = buildingFloors[modelKey] || 1;
        
        // Если текущий этаж больше максимального для нового здания, сбрасываем на максимум
        if (currentFloor > maxFloors) {
          currentFloor = maxFloors;
        }
        
        // Если был режим просмотра этажа, обновляем его для нового здания
        if (currentFloor > 0) {
          applyFloorView();
        }
        
        // Обновляем отображение
        if (currentFloor === 0) {
          floorDisplay.textContent = "Все этажи";
        } else {
          floorDisplay.textContent = `Этаж ${currentFloor} / ${maxFloors}`;
        }
      }
      
      console.log(`✓ Выбрано здание ${activeModel} для просмотра этажей`);
    }
  }
});

  // Инициализируем кнопки меток после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initLabelButtons();
    });
  } else {
    // DOM уже загружен
    initLabelButtons();
  }
  
  window.addEventListener("load", () => {
    canvas.focus();
    console.log("✓ Приложение загружено");
  });
}

// ========== ИНИЦИАЛИЗАЦИЯ КНОПОК МЕТОК ==========
let labelButtonsInitialized = false;

function initLabelButtons() {
  if (labelButtonsInitialized) {
    console.log("Кнопки меток уже инициализированы, пропускаем...");
    return;
  }
  
  console.log("Инициализация кнопок меток...");
  
  const addLabelModeBtn = document.getElementById("addLabelModeBtn");
  console.log("addLabelModeBtn найден:", !!addLabelModeBtn);
  
  if (addLabelModeBtn && !addLabelModeBtn.dataset.initialized) {
    addLabelModeBtn.dataset.initialized = "true";
    
    addLabelModeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addLabelMode = !addLabelMode;
      addLabelModeBtn.textContent = `Add Label Mode: ${addLabelMode ? "On" : "Off"}`;
      addLabelModeBtn.style.background = addLabelMode ? "#4caf50" : "#4a9eff";
      const canvas = document.querySelector("#c");
      if (canvas) {
        canvas.style.cursor = addLabelMode ? "crosshair" : "default";
      }
      
      // Отключаем/включаем управление камерой при режиме добавления меток
      const canvasEl = document.querySelector("#c");
      if (canvasEl && canvasEl.userData && canvasEl.userData.controls) {
        const controlsRef = canvasEl.userData.controls;
        controlsRef.enabled = !addLabelMode; // Отключаем управление когда режим меток включен
        console.log(`Управление камерой: ${controlsRef.enabled ? "включено" : "отключено"}`);
      }
      
      console.log(`Add Label Mode: ${addLabelMode ? "On" : "Off"}`);
      return false;
    });
    
    console.log("✓ Кнопка Add Label Mode инициализирована");
  } else {
    console.warn("✗ Кнопка addLabelModeBtn не найдена!");
  }

  const showLabelsPanelBtn = document.getElementById("showLabelsPanelBtn");
  const labelsPanel = document.getElementById("labelsPanel");
  console.log("showLabelsPanelBtn найден:", !!showLabelsPanelBtn);
  console.log("labelsPanel найден:", !!labelsPanel);
  
  if (showLabelsPanelBtn && labelsPanel && !showLabelsPanelBtn.dataset.initialized) {
    showLabelsPanelBtn.dataset.initialized = "true";
    
    showLabelsPanelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isVisible = labelsPanel.style.display !== "none";
      labelsPanel.style.display = isVisible ? "none" : "flex";
      showLabelsPanelBtn.textContent = isVisible ? "Show Labels" : "Hide Labels";
      if (!isVisible) {
        updateLabelsPanel();
      }
      console.log(`Labels panel: ${isVisible ? "hidden" : "shown"}`);
      return false;
    });
    
    console.log("✓ Кнопка Show Labels инициализирована");
  } else {
    console.warn("✗ Кнопка showLabelsPanelBtn или панель labelsPanel не найдены!");
    if (!showLabelsPanelBtn) console.warn("  - showLabelsPanelBtn отсутствует");
    if (!labelsPanel) console.warn("  - labelsPanel отсутствует");
  }

  const closeLabelsPanelBtn = document.getElementById("closeLabelsPanelBtn");
  if (closeLabelsPanelBtn && labelsPanel && !closeLabelsPanelBtn.dataset.initialized) {
    closeLabelsPanelBtn.dataset.initialized = "true";
    closeLabelsPanelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      labelsPanel.style.display = "none";
      const showBtn = document.getElementById("showLabelsPanelBtn");
      if (showBtn) {
        showBtn.textContent = "Show Labels";
      }
      return false;
    });
  }
  
  // Инициализация кнопки скачивания меток
  const downloadLabelsBtn = document.getElementById("downloadLabelsBtn");
  if (downloadLabelsBtn && !downloadLabelsBtn.dataset.initialized) {
    downloadLabelsBtn.dataset.initialized = "true";
    downloadLabelsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      downloadLabels();
      return false;
    });
    console.log("✓ Кнопка скачивания меток инициализирована");
  }
  
  // Помечаем как инициализированные если обе основные кнопки найдены
  if (addLabelModeBtn && showLabelsPanelBtn) {
    labelButtonsInitialized = true;
    console.log("✓ Все кнопки меток успешно инициализированы");
  }
}

/**
 * Инициализация кнопок управления этажами
 */
function initFloorButtons() {
  const floorUpBtn = document.getElementById("floorUpBtn");
  const floorDownBtn = document.getElementById("floorDownBtn");
  const floorResetBtn = document.getElementById("floorResetBtn");
  const floorDisplay = document.getElementById("floorDisplay");
  
  if (!floorUpBtn || !floorDownBtn || !floorResetBtn || !floorDisplay) {
    console.warn("Кнопки управления этажами не найдены");
    return;
  }
  
  // Обновляем отображение текущего этажа
  function updateFloorDisplay() {
    const modelKey = `model${activeModel}`;
    const maxFloors = buildingFloors[modelKey] || 1;
    
    if (currentFloor === 0) {
      floorDisplay.textContent = "Все этажи";
    } else {
      // Ограничиваем текущий этаж максимальным количеством этажей
      if (currentFloor > maxFloors) {
        currentFloor = maxFloors;
      }
      floorDisplay.textContent = `Этаж ${currentFloor} / ${maxFloors}`;
    }
  }
  
  // Кнопка "Вверх" - следующий этаж
  floorUpBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const modelKey = `model${activeModel}`;
    const maxFloors = buildingFloors[modelKey] || 1;
    
    if (currentFloor < maxFloors) {
      currentFloor++;
      updateFloorDisplay();
      applyFloorView();
    }
    
    return false;
  });
  
  // Кнопка "Вниз" - предыдущий этаж
  floorDownBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (currentFloor > 0) {
      currentFloor--;
      updateFloorDisplay();
      applyFloorView();
    }
    
    return false;
  });
  
  // Кнопка "Все" - показать все этажи
  floorResetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    currentFloor = 0;
    updateFloorDisplay();
    applyFloorView();
    
    return false;
  });
  
  // Инициализируем отображение
  updateFloorDisplay();
  console.log("✓ Кнопки управления этажами инициализированы");
}

/**
 * Применяет режим просмотра этажа
 */
function applyFloorView() {
  if (!camera || !controls || activeModel < 1 || activeModel > loadedModels.length) return;
  
  const model = loadedModels[activeModel - 1];
  if (!model) return;
  
  const modelKey = `model${activeModel}`;
  const maxFloors = buildingFloors[modelKey] || 1;
  
  if (currentFloor === 0) {
    // Показываем все этажи - возвращаемся к обычному виду
    floorViewMode = false;
    
    // Возвращаем перспективную камеру если была ортографическая
    if (camera instanceof THREE.OrthographicCamera) {
      const aspect = window.innerWidth / window.innerHeight;
      const newCamera = new THREE.PerspectiveCamera(55, aspect, 0.1, 10000);
      newCamera.position.copy(camera.position);
      newCamera.rotation.copy(camera.rotation);
      
      // Обновляем controls для новой камеры
      controls.object = newCamera;
      scene.remove(camera);
      camera = newCamera;
      globalCamera = camera;
      scene.add(camera);
    }
    
    // Возвращаем камеру в нормальное положение
    camera.position.set(0, 480, 480);
    controls.target.set(0, 2, -10);
    controls.update();
    
  } else {
    // Показываем конкретный этаж - переключаемся на вид сверху
    floorViewMode = true;
    
    // Вычисляем позицию этажа
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Высота этажа от основания здания
    const floorY = model.position.y + (currentFloor - 1) * floorHeight + floorHeight / 2;
    
    // Переключаемся на ортографическую камеру для вида сверху
    if (!(camera instanceof THREE.OrthographicCamera)) {
      const aspect = window.innerWidth / window.innerHeight;
      const viewSize = Math.max(size.x, size.z) * 1.5; // Размер области обзора
      
      const orthoCamera = new THREE.OrthographicCamera(
        -viewSize * aspect / 2,
        viewSize * aspect / 2,
        viewSize / 2,
        -viewSize / 2,
        0.1,
        10000
      );
      
      // Позиционируем камеру сверху здания
      orthoCamera.position.set(center.x, floorY + viewSize * 0.8, center.z);
      orthoCamera.lookAt(center.x, floorY, center.z);
      
      // Обновляем controls
      controls.object = orthoCamera;
      scene.remove(camera);
      camera = orthoCamera;
      globalCamera = camera;
      scene.add(camera);
    } else {
      // Обновляем позицию существующей ортографической камеры
      const aspect = window.innerWidth / window.innerHeight;
      const viewSize = Math.max(size.x, size.z) * 1.5;
      
      camera.left = -viewSize * aspect / 2;
      camera.right = viewSize * aspect / 2;
      camera.top = viewSize / 2;
      camera.bottom = -viewSize / 2;
      camera.updateProjectionMatrix();
      
      camera.position.set(center.x, floorY + viewSize * 0.8, center.z);
      camera.lookAt(center.x, floorY, center.z);
    }
    
    controls.target.set(center.x, floorY, center.z);
    controls.update();
  }
  
  console.log(`Режим этажей: ${currentFloor === 0 ? 'Все этажи' : `Этаж ${currentFloor}`}`);
}

// Запускаем инициализацию
initApp();

// Дополнительная инициализация кнопок после загрузки (на случай если DOMContentLoaded уже прошел)
// Пробуем несколько раз с задержками для надежности
setTimeout(() => {
  if (typeof initLabelButtons === 'function') {
    initLabelButtons();
  }
  initFloorButtons();
}, 100);

setTimeout(() => {
  if (typeof initLabelButtons === 'function') {
    initLabelButtons();
  }
  initFloorButtons();
}, 500);

// Также инициализируем при полной загрузке страницы
window.addEventListener('load', () => {
  setTimeout(() => {
    if (typeof initLabelButtons === 'function') {
      initLabelButtons();
    }
    initFloorButtons();
  }, 100);
});
