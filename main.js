// ====================================================================================
// БЛОК 1: ИМПОРТЫ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ====================================================================================
// Импортируем Three.js и необходимые модули для работы с 3D графикой
// OBJLoader - для загрузки 3D моделей в формате .obj
// OrbitControls - для управления камерой (вращение, масштабирование)
// CSS2DRenderer - для отображения HTML меток в 3D пространстве

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

console.log('✓ Three.js загружен из node_modules');

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
// Хранят состояние приложения: активная модель, режимы работы, метки, камера и т.д.
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

// Глобальные переменные для управления солнцем и луной
let sunLightRef = null;
let moonLightRef = null;
let ambientLightRef = null;
let sunMesh = null; // Визуальный объект солнца
let moonMesh = null; // Визуальный объект луны
let sunTargetRef = null; // Цель направленного света солнца (центр сцены)
const sunTargetPosition = new THREE.Vector3();
const moonTargetPosition = new THREE.Vector3();
const visualSunPosition = new THREE.Vector3();
const visualMoonPosition = new THREE.Vector3();
const LIGHT_SMOOTHING = 0.08;
const SHADOW_LIGHT_UPDATE_MS = 250;
let lastShadowLightUpdateMs = 0;

// DEV API для реактивного сохранения позиций в БД
const DEV_API_BASE = "/api/dev";
const DEV_CLIENT_ID = `client-${Math.random().toString(36).slice(2, 10)}`;
let devApiAvailable = false;
let devApiDetectionPromise = null;
let devEventSource = null;
let applyingRemoteUpdate = false;
const modelSyncTimers = new Map();

// Система этажей
let currentFloor = 0; // 0 = все этажи, 1+ = конкретный этаж
let floorHeight = 3.5; // Высота одного этажа в единицах 3D (метры)
let buildingFloors = {}; // Количество этажей для каждого здания {model1: 5, model2: 3, ...}
let floorViewMode = false; // Режим просмотра этажа (орто-камера сверху)

// Список файлов моделей (глобальная переменная)
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

// Глобальные константы для размеров плана (используются в loadAllModels)
const PLAN_SIZE = 220 * 5; // 1100 (базовый размер, используется для масштабирования моделей)

// ====================================================================================
// БЛОК 2: ФУНКЦИИ ПРОВЕРКИ ВИДИМОСТИ МЕТОК
// ====================================================================================
// Использует raycasting для определения, не перекрыта ли метка зданием
// Если между камерой и меткой есть здание - метка скрывается

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

// ====================================================================================
// БЛОК 3: ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ====================================================================================
// Основная функция, которая настраивает всю 3D сцену: камеру, освещение, пол, сетку
// Вызывается один раз при загрузке страницы

function initApp() {
  console.log("🦆═══════════════════════════════════════════════════════🦆");
  console.log("🦆🚀 НАЧАЛО initApp() 🦆");
  console.log("🦆═══════════════════════════════════════════════════════🦆");

  // ========== КОНСТАНТЫ ==========
  // Размеры плана, шаги перемещения и поворота моделей
  // PLAN_SIZE теперь глобальная константа (определена выше)
  // План будет расширен динамически на основе позиций моделей
  let PLAN_TEXTURE_SIZE = PLAN_SIZE * 1.35; // Начальный размер, будет пересчитан
  const PLAN_Y = -PLAN_SIZE * 0.03;
  
  // Делаем PLAN_TEXTURE_SIZE доступной глобально для функции expandFloorToFitModels
  window.PLAN_TEXTURE_SIZE = PLAN_TEXTURE_SIZE;
  const POSITION_STEP = PLAN_SIZE * 0.01;
  const ROTATION_STEP = Math.PI / 36;

// ========== ИНИЦИАЛИЗАЦИЯ СЦЕНЫ ==========
// Создаем 3D сцену, камеру, WebGL рендерер для отрисовки моделей
console.log("🦆 Ищем canvas элемент... 🦆");
canvas = document.querySelector("#c");
if (!canvas) {
  console.error("🦆✗ Canvas не найден! 🦆");
  return; // Выходим если canvas не найден
}
console.log("🦆✓ Canvas найден 🦆");

scene = new THREE.Scene();
// Фон будет обновляться в зависимости от времени суток в updateSunMoonPosition()
scene.background = new THREE.Color(0x87ceeb); // Начальный цвет - голубое небо

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
// Определяем мобильное устройство для оптимизации pixel ratio
const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                      (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
const initialPixelRatio = isMobileDevice 
                         ? Math.min(window.devicePixelRatio, 1.5) 
                         : Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(initialPixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ========== СОЗДАНИЕ ОСВЕЩЕНИЯ ==========
// Атмосферное освещение (меняется в зависимости от времени суток)
ambientLightRef = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLightRef);

// Солнце - основной источник света с тенями
sunLightRef = new THREE.DirectionalLight(0xffd700, 1.5); // Золотистый цвет солнца
sunLightRef.castShadow = true;
sunLightRef.shadow.mapSize.width = 2048;
sunLightRef.shadow.mapSize.height = 2048;
sunLightRef.shadow.camera.near = 0.5;
sunLightRef.shadow.camera.far = 2000;
sunLightRef.shadow.camera.left = -1400;
sunLightRef.shadow.camera.right = 1400;
sunLightRef.shadow.camera.top = 1400;
sunLightRef.shadow.camera.bottom = -1400;
sunLightRef.shadow.bias = -0.0005;
sunLightRef.shadow.normalBias = 0.02;
sunLightRef.shadow.radius = 2;
scene.add(sunLightRef);

// Цель солнца: центр сцены/пола, чтобы тени не "ломались" при движении света
sunTargetRef = new THREE.Object3D();
sunTargetRef.position.set(0, 0, 0);
scene.add(sunTargetRef);
sunLightRef.target = sunTargetRef;

// Луна - слабый источник света ночью
moonLightRef = new THREE.DirectionalLight(0x9bb0ff, 0.3); // Голубоватый цвет луны
moonLightRef.castShadow = true;
moonLightRef.shadow.mapSize.width = 1024;
moonLightRef.shadow.mapSize.height = 1024;
moonLightRef.shadow.camera.near = 0.5;
moonLightRef.shadow.camera.far = 2000;
moonLightRef.shadow.camera.left = -500;
moonLightRef.shadow.camera.right = 500;
moonLightRef.shadow.camera.top = 500;
moonLightRef.shadow.camera.bottom = -500;
moonLightRef.shadow.bias = -0.0001;
moonLightRef.shadow.radius = 4;
moonLightRef.castShadow = false; // Ночные тени отключены для стабильности и производительности
scene.add(moonLightRef);

// ========== ВИЗУАЛЬНЫЕ ОБЪЕКТЫ СОЛНЦА И ЛУНЫ ==========
// Создаем визуальное представление солнца (большая светящаяся сфера)
const sunGeometry = new THREE.SphereGeometry(50, 32, 32);
const sunMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd700,
  emissive: 0xffd700,
  emissiveIntensity: 2.5,
  metalness: 0.0,
  roughness: 0.0
});
sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
sunMesh.position.copy(sunLightRef.position);
sunMesh.position.y *= 10; // Поднимаем визуальное солнце в 10 раз выше
sunMesh.renderOrder = 999; // Рендерим солнце поверх всего
scene.add(sunMesh);

// Создаем визуальное представление луны (светящаяся сфера)
const moonGeometry = new THREE.SphereGeometry(30, 32, 32);
const moonMaterial = new THREE.MeshStandardMaterial({
  color: 0x9bb0ff,
  emissive: 0x9bb0ff,
  emissiveIntensity: 1.5,
  metalness: 0.0,
  roughness: 0.0
});
moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
moonMesh.position.copy(moonLightRef.position);
moonMesh.position.y *= 10; // Поднимаем визуальную луну в 10 раз выше
moonMesh.renderOrder = 998; // Рендерим луну поверх всего
scene.add(moonMesh);

// ========== CSS2DRenderer ДЛЯ МЕТОК ==========
// Отдельный рендерер для HTML меток, которые отображаются поверх 3D сцены
labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none'; // Позволяет кликать сквозь метки
document.getElementById('app').appendChild(labelRenderer.domElement);

// ========== УПРАВЛЕНИЕ КАМЕРОЙ ==========
// OrbitControls позволяет вращать камеру мышью, масштабировать колесиком
// Дополнительно настроено управление с клавиатуры (WASD, стрелки)
controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, -10);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 60;
controls.maxDistance = 2000;
controls.maxPolarAngle = Math.PI * 0.6;
controls.minPolarAngle = 0.2;

// Оптимизация для мобильных устройств (используем уже определенную переменную)
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

if (isMobileDevice || isTouchDevice) {
  // Улучшенные настройки для touch-устройств
  controls.enablePan = true;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
  };
  controls.panSpeed = 0.8;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  
  // Уменьшаем минимальное расстояние для лучшего обзора на маленьких экранах
  controls.minDistance = 40;
  
  console.log("✓ Мобильные оптимизации активированы");
}

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

// ========== ОСВЕЩЕНИЕ С РЕАЛЬНЫМ ВРЕМЕНЕМ ==========
// Солнце и луна с динамическим позиционированием на основе текущего времени

// Глобальные переменные для управления солнцем и луной (инициализируются после создания renderer)

/**
 * Вычисляет позицию солнца и луны на основе реального времени
 * @param {Date} date - Дата и время (по умолчанию текущее)
 * @returns {Object} Объект с позициями солнца и луны, а также интенсивностью освещения
 */
function calculateSunMoonPosition(date = new Date()) {
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);

  // Суточный цикл: 0..2PI, где солнце в зените около 12:00
  const cycle = (hours / 24) * Math.PI * 2;
  const dayAngle = cycle - Math.PI / 2;

  // Небольшая сезонная вариация высоты дуги солнца
  const seasonalTilt = Math.sin(((dayOfYear - 81) / 365) * Math.PI * 2) * 0.2;

  // Базовое расстояние до источников света
  const distance = 1400;
  const verticalScale = 0.95 + seasonalTilt;

  // Солнце
  const sunX = Math.cos(dayAngle) * distance;
  const sunY = Math.sin(dayAngle) * distance * verticalScale;
  const sunZ = Math.sin(dayAngle * 0.65) * distance * 0.55;

  // Луна противоположна солнцу
  const moonX = -sunX;
  const moonY = -sunY;
  const moonZ = -sunZ;

  // Нормализованный "дневной" фактор
  const daylight = Math.max(0, sunY / (distance * verticalScale));
  const moonlight = Math.max(0, -sunY / (distance * verticalScale));

  // Интенсивности
  const sunIntensity = Math.min(1.45, daylight * 1.45);
  const moonIntensity = Math.min(0.45, moonlight * 0.35);
  const ambientIntensity = 0.18 + daylight * 0.42 + moonlight * 0.08;

  const sunElevation = Math.asin(Math.max(-1, Math.min(1, sunY / (distance * verticalScale))));

  return {
    sun: { x: sunX, y: sunY, z: sunZ, intensity: sunIntensity },
    moon: { x: moonX, y: moonY, z: moonZ, intensity: moonIntensity },
    ambient: ambientIntensity,
    sunElevation: sunElevation
  };
}

/**
 * Обновляет позиции солнца и луны на основе текущего времени
 */
function updateSunMoonPosition() {
  if (!sunLightRef || !moonLightRef || !ambientLightRef) return;
  const positions = calculateSunMoonPosition();
  const nowMs = performance.now();

  // Центрируем цель света по центру пола, если пол уже создан
  if (sunTargetRef) {
    const tx = floor ? floor.position.x : 0;
    const tz = floor ? floor.position.z : 0;
    sunTargetRef.position.set(tx, 0, tz);
    sunTargetRef.updateMatrixWorld();
  }
  
  // Целевая позиция солнца
  const safeSunY = positions.sun.intensity > 0.08 ? Math.max(positions.sun.y, 160) : positions.sun.y;
  sunTargetPosition.set(positions.sun.x, safeSunY, positions.sun.z);
  
  // Визуальное солнце обновляем каждый кадр (гладко)
  if (sunMesh) {
    visualSunPosition.set(sunTargetPosition.x, sunTargetPosition.y * 10, sunTargetPosition.z);
    sunMesh.position.lerp(visualSunPosition, LIGHT_SMOOTHING);
    sunMesh.visible = positions.sun.intensity > 0.1;
    sunMesh.material.emissiveIntensity = Math.max(0.5, positions.sun.intensity);
  }

  // Целевая позиция луны
  moonTargetPosition.set(positions.moon.x, positions.moon.y, positions.moon.z);

  // Визуальную луну обновляем каждый кадр (гладко)
  if (moonMesh) {
    visualMoonPosition.set(moonTargetPosition.x, moonTargetPosition.y * 10, moonTargetPosition.z);
    moonMesh.position.lerp(visualMoonPosition, LIGHT_SMOOTHING);
    moonMesh.visible = positions.moon.intensity > 0.1;
    moonMesh.material.emissiveIntensity = Math.max(0.3, positions.moon.intensity * 2);
  }

  // Теневой свет обновляем не каждый кадр, чтобы убрать микродергания и снизить нагрузку
  if (nowMs - lastShadowLightUpdateMs >= SHADOW_LIGHT_UPDATE_MS) {
    lastShadowLightUpdateMs = nowMs;

    sunLightRef.position.copy(sunTargetPosition);
    sunLightRef.intensity = positions.sun.intensity;
    sunLightRef.visible = positions.sun.intensity > 0.1;

    moonLightRef.position.copy(moonTargetPosition);
    moonLightRef.intensity = positions.moon.intensity;
    moonLightRef.visible = positions.moon.intensity > 0.1;

    ambientLightRef.intensity = positions.ambient;
  }
  
  // Обновляем цвет неба в зависимости от времени суток
  if (positions.sunElevation > 0) {
    // День - светлое небо
    scene.background = new THREE.Color(0x87ceeb); // Голубое небо
  } else if (positions.sunElevation > -0.2) {
    // Закат/рассвет - оранжевое небо
    const factor = (positions.sunElevation + 0.2) / 0.2;
    scene.background = new THREE.Color().lerpColors(
      new THREE.Color(0xff6347), // Красноватый закат
      new THREE.Color(0x87ceeb), // Голубое небо
      factor
    );
  } else {
    // Ночь - темное небо
    scene.background = new THREE.Color(0x191970); // Темно-синее ночное небо
  }
}

// ========== ПОЛ И СЕТКА ==========
// Создаем плоскость пола и сетку для ориентации в пространстве
// Пол автоматически расширяется под все модели
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
  floor.receiveShadow = true; // Пол принимает тени
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

// Функция для расширения плана на основе позиций моделей
// Может вызываться многократно для динамического расширения
function expandFloorToFitModels() {
  if (!loadedModels || loadedModels.length === 0) {
    console.log("🦆 Модели еще не загружены, пропускаем расширение плана 🦆");
    return;
  }
  
  // Находим границы всех моделей
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  let validModels = 0;
  loadedModels.forEach((model) => {
    if (!model) return;
    validModels++;
    
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
  if (minX === Infinity || maxX === -Infinity || validModels === 0) {
    console.log("🦆 Не найдено валидных границ моделей 🦆");
    return;
  }
  
  console.log(`🦆 Найдено ${validModels} моделей, границы: X[${minX.toFixed(2)}, ${maxX.toFixed(2)}], Z[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}] 🦆`);
  
  // Добавляем запас в 5 раз больше для полного покрытия всех корпусов
  const paddingX = (maxX - minX) * 2.5; // Увеличено в 5 раз (было 0.3, стало 2.5)
  const paddingZ = (maxZ - minZ) * 2.5; // Увеличено в 5 раз (было 0.3, стало 2.5)
  minX -= paddingX;
  maxX += paddingX;
  minZ -= paddingZ;
  maxZ += paddingZ;
  
  // Вычисляем новый размер плана
  const newSizeX = maxX - minX;
  const newSizeZ = maxZ - minZ;
  const newSize = Math.max(newSizeX, newSizeZ);
  
  // Минимальный размер увеличен в 5 раз для лучшего покрытия
  const minSize = PLAN_SIZE * 12.5; // Увеличено в 5 раз (было 2.5, стало 12.5)
  const targetSize = Math.max(newSize, minSize);
  
  // Получаем текущий размер плана (может быть изменен внутри initApp)
  const currentPlanSize = window.PLAN_TEXTURE_SIZE || PLAN_SIZE * 1.35;
  
  console.log(`🦆 Текущий размер плана: ${currentPlanSize.toFixed(2)}, целевой размер: ${targetSize.toFixed(2)} 🦆`);
  
  // Всегда обновляем пол, если размер изменился (даже если уже расширяли ранее)
  if (Math.abs(targetSize - currentPlanSize) < 1) {
    console.log("🦆 Размер плана оптимален, не требует изменений 🦆");
    return;
  }
  
  // Обновляем глобальную переменную размера плана
  window.PLAN_TEXTURE_SIZE = targetSize;
  
  // Обновляем геометрию пола
  if (floor) {
    // Удаляем старую геометрию из памяти
    const oldGeometry = floor.geometry;
    // Создаём новую геометрию с новым размером
    const floorGeometry = new THREE.PlaneGeometry(targetSize, targetSize);
    floor.geometry = floorGeometry;
    // Освобождаем память старой геометрии после замены
    oldGeometry.dispose();
  }
  
  // Обновляем сетку
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper.dispose(); // Освобождаем память
    const gridSize = Math.ceil(targetSize / 100) * 100; // Округляем до сотен
    const divisions = Math.max(20, Math.floor(gridSize / 100)); // Минимум 20 делений
    gridHelper = new THREE.GridHelper(
      gridSize,
      divisions,
      0x595966,
      0x595966
    );
    const PLAN_Y = -PLAN_SIZE * 0.03;
    gridHelper.position.y = PLAN_Y + 0.01;
    scene.add(gridHelper);
  }
  
  console.log(`✓ План расширен до размера: ${targetSize.toFixed(2)} x ${targetSize.toFixed(2)}`);
  
  // Центрируем пол относительно всех моделей (используем координаты после добавления padding)
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  if (floor) {
    floor.position.x = centerX;
    floor.position.z = centerZ;
    console.log(`✓ Пол перемещен в центр: X=${centerX.toFixed(2)}, Z=${centerZ.toFixed(2)}`);
  }
  if (gridHelper) {
    gridHelper.position.x = centerX;
    gridHelper.position.z = centerZ;
    console.log(`✓ Сетка перемещена в центр: X=${centerX.toFixed(2)}, Z=${centerZ.toFixed(2)}`);
  }
}

createFloor();
console.log("🦆✓ Пол создан 🦆");

// Инициализируем позиции солнца и луны на основе текущего времени
updateSunMoonPosition();
console.log("🦆✓ Солнце и луна инициализированы 🦆");

// ========== ЗАГРУЗКА МОДЕЛЕЙ ==========
console.log("🦆 Инициализируем массивы для моделей... 🦆");
const loadedModels = [];

// Сохраняем глобальную ссылку на массив моделей для функций проверки видимости
globalLoadedModels = loadedModels;
const modelOffsets = {};
const modelRotations = {};
const modelHeights = {};
const initialModelScales = {}; // Начальные масштабы для ползунка

console.log("🦆 Создаем OBJLoader... 🦆");
const loader = new OBJLoader();
console.log("🦆✓ OBJLoader создан 🦆");

// Инициализация позиций по умолчанию
console.log(`🦆 Инициализируем позиции для ${modelFiles.length} моделей... 🦆`);
for (let i = 0; i < modelFiles.length; i++) {
  const modelKey = `model${i + 1}`;
  modelOffsets[modelKey] = {
    x: (i % 3) * PLAN_SIZE * 0.5 - PLAN_SIZE * 0.5,
    y: 0,
    z: Math.floor(i / 3) * PLAN_SIZE * 0.5 - PLAN_SIZE * 0.25
  };
  modelRotations[modelKey] = { yaw: 0 };
}
console.log("🦆✓ Позиции инициализированы 🦆");

// Загружаем модели после инициализации
console.log("🦆═══════════════════════════════════════════════════════🦆");
console.log("🦆🚀 ВЫЗОВ loadAllModels()... 🦆");
console.log(`🦆  modelFiles доступен: ${typeof modelFiles !== 'undefined'} 🦆`);
console.log(`🦆  loader доступен: ${typeof loader !== 'undefined'} 🦆`);
console.log(`🦆  scene доступен: ${typeof scene !== 'undefined'} 🦆`);
console.log("🦆═══════════════════════════════════════════════════════🦆");

try {
  console.log("🦆 Пытаемся вызвать loadAllModels()... 🦆");
  const loadPromise = loadAllModels();
  console.log("🦆✓ loadAllModels() вызвана, промис получен 🦆");
  loadPromise.catch((error) => {
    console.error("🦆✗ Необработанная ошибка в loadAllModels():", error, "🦆");
  });
} catch (error) {
  console.error("🦆✗ ОШИБКА при вызове loadAllModels():", error, "🦆");
}

// Расширяем план под все модели после применения позиций (вызываем несколько раз для надежности)
// Используем небольшие задержки, чтобы убедиться, что все модели позиционированы
console.log("🦆 Настраиваем setTimeout для расширения плана... 🦆");
setTimeout(() => {
  expandFloorToFitModels();
  
  // Повторно расширяем через большее время для гарантии
  setTimeout(() => {
    expandFloorToFitModels();
  }, 2000);
  
  // Загружаем сохраненные метки
  loadLabelsFromJSON();
}, 500);

// ====================================================================================
// БЛОК 4: ЗАГРУЗКА И ОБРАБОТКА 3D МОДЕЛЕЙ
// ====================================================================================
// Загружает .obj файлы моделей корпусов, применяет материалы, масштабирует
// Автоматически определяет количество этажей для каждого здания
// Ограничивает этажи до 4 для всех корпусов, кроме самого большого

// ====================================================================================
// БЛОК 4.1: УПРАВЛЕНИЕ ПРОГРЕССОМ ЗАГРУЗКИ
// ====================================================================================
function updateLoadingProgress(loaded, total, modelName = '') {
  const progressBar = document.getElementById('loadingBar');
  const progressStatus = document.getElementById('loadingStatus');
  const loadingText = document.querySelector('.loading-text');
  
  // Вычисляем процент заранее, чтобы использовать в логировании
  const percentage = Math.round((loaded / total) * 100);
  
  if (progressBar && progressStatus) {
    progressBar.style.width = `${percentage}%`;
    
    progressStatus.textContent = `${percentage}%`;
    
    if (loadingText && modelName) {
      loadingText.textContent = `Загрузка: ${modelName}`;
    } else if (loadingText) {
      loadingText.textContent = `Загрузка 3D карты...`;
    }
  }
  
  // Логируем в консоль для отладки
  console.log(`🦆 Прогресс загрузки: ${loaded}/${total} (${percentage}%) ${modelName ? '- ' + modelName : ''} 🦆`);
}

function showLoadingProgress() {
  console.log("🦆 Показываем прогресс-бар загрузки 🦆");
  const loadingProgress = document.getElementById('loadingProgress');
  if (loadingProgress) {
    loadingProgress.style.display = 'flex';
    loadingProgress.classList.remove('hidden');
    updateLoadingProgress(0, modelFiles.length, 'Инициализация...');
    console.log("🦆✓ Прогресс-бар отображен 🦆");
  } else {
    console.error("🦆✗ Элемент loadingProgress не найден! 🦆");
  }
}

function hideLoadingProgress() {
  console.log("🦆 Скрываем прогресс-бар загрузки 🦆");
  const loadingProgress = document.getElementById('loadingProgress');
  if (loadingProgress) {
    loadingProgress.classList.add('hidden');
    setTimeout(() => {
      loadingProgress.style.display = 'none';
      console.log("🦆✓ Прогресс-бар скрыт 🦆");
    }, 500);
  } else {
    console.warn("🦆⚠ Элемент loadingProgress не найден при скрытии 🦆");
  }
}

// ====================================================================================
// БЛОК 4: ЗАГРУЗКА И ОБРАБОТКА 3D МОДЕЛЕЙ (С ЛЕНИВОЙ ЗАГРУЗКОЙ)
// ====================================================================================
// Загружает .obj файлы моделей корпусов с ленивой загрузкой
// Приоритетная загрузка первых моделей, остальные загружаются постепенно
// Автоматически определяет количество этажей для каждого здания

async function loadAllModels() {
  console.log("🦆 Начинаем ленивую загрузку моделей... 🦆");
  
  // Проверяем, что modelFiles доступен
  if (!modelFiles || modelFiles.length === 0) {
    console.error("🦆✗ modelFiles не определен или пуст! 🦆");
    hideLoadingProgress();
    return;
  }
  
  console.log(`🦆✓ Найдено моделей для загрузки: ${modelFiles.length} 🦆`);
  
  // Показываем прогресс-бар
  showLoadingProgress();
  
  const PRIORITY_COUNT = 3; // Количество моделей для приоритетной загрузки
  const BATCH_SIZE = 2; // Количество моделей для загрузки одновременно после приоритетных
  const BATCH_DELAY = 300; // Задержка между батчами (мс)
  
  let loadedCount = 0;
  const totalModels = modelFiles.length;
  
  // Проверяем, что loader доступен
  if (!loader) {
    console.error("🦆✗ OBJLoader не инициализирован! 🦆");
    hideLoadingProgress();
    return;
  }
  
  console.log("🦆✓ OBJLoader доступен, начинаем загрузку моделей 🦆");
  
  // Функция для загрузки одной модели
  const loadSingleModel = (file, index) => {
    return new Promise((resolve, reject) => {
      console.log(`🦆    → Запрос загрузки модели ${index + 1}: ${file} 🦆`);
      const startTime = performance.now();
      
      loader.load(
        file,
        (object) => {
          const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
          console.log(`🦆    ✓ Модель ${index + 1} загружена за ${loadTime}с: ${file} 🦆`);
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
                geometry.computeVertexNormals(true);
                
                // Для первой модели добавляем детальное логирование
                if (index === 0) {
                  console.log(`Модель 1 (${file}): детальная информация:`);
                  const initialVertexCount = geometry.attributes.position.count;
                  console.log(`  Вершин до обработки: ${initialVertexCount}`);
                  console.log(`  Нормалей: ${geometry.attributes.normal ? geometry.attributes.normal.count : 0}`);
                  if (geometry.index) {
                    console.log(`  Индексов: ${geometry.index.count}`);
                  }
                  
                  geometry.computeBoundingBox();
                  const bbox = geometry.boundingBox;
                  console.log(`  Размеры: ${bbox.max.x - bbox.min.x} x ${bbox.max.y - bbox.min.y} x ${bbox.max.z - bbox.min.z}`);
                  
                  if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) {
                    console.warn(`  ВНИМАНИЕ: Нормали отсутствуют после обработки!`);
                    geometry.computeVertexNormals(true);
                  }
                  
                  console.log(`  ✓ Модель 1 обработана успешно`);
                }
                
                // Применяем материал с улучшенными настройками
                child.material = new THREE.MeshStandardMaterial({
                  color: 0xdddddd,
                  side: THREE.DoubleSide,
                  flatShading: false,
                  vertexColors: false,
                  metalness: 0.1,
                  roughness: 0.7
                });
                
                // Включаем тени для моделей
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            
            // Вычисляем высоту для нормализации
            const height = size.y * scale;
            const modelKey = `model${index + 1}`;
            modelHeights[modelKey] = height;
            
            // Позиции будут применены из JSON после загрузки всех моделей
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
            
            loadedCount++;
            updateLoadingProgress(loadedCount, totalModels, `Модель ${index + 1}`);
            
            console.log(`🦆✓ Модель ${index + 1} (${file}) загружена, высота: ${height.toFixed(2)} 🦆`);
            console.log(`🦆  → Определено этажей: ${estimatedFloors} (высота: ${height.toFixed(2)}, высота этажа: ${floorHeight}) 🦆`);
            
            resolve(object);
          } catch (error) {
            console.error(`🦆 Ошибка обработки модели ${index + 1}:`, error, "🦆");
            loadedCount++;
            updateLoadingProgress(loadedCount, totalModels);
            reject(error);
          }
        },
        (progress) => {
          // Логируем прогресс загрузки для больших файлов
          if (progress.lengthComputable) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            console.log(`    → Прогресс загрузки модели ${index + 1}: ${percent}% (${file})`);
          }
        },
        (error) => {
          const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
          console.error(`🦆✗ Ошибка загрузки модели ${index + 1} (${file}) за ${loadTime}с:`, error, "🦆");
          console.error(`🦆  Детали ошибки:`, {
            message: error.message,
            type: error.type,
            target: error.target?.src || error.target?.url || 'неизвестно'
          }, "🦆");
          loadedCount++;
          updateLoadingProgress(loadedCount, totalModels);
          reject(error);
        }
      );
    });
  };
  
  try {
    // Шаг 1: Приоритетная загрузка первых моделей (параллельно)
    console.log(`🦆 Приоритетная загрузка первых ${PRIORITY_COUNT} моделей... 🦆`);
    const priorityFiles = modelFiles.slice(0, PRIORITY_COUNT);
    console.log(`🦆  Файлы для приоритетной загрузки:`, priorityFiles, "🦆");
    
    const priorityPromises = priorityFiles.map((file, index) => {
      console.log(`  [${index + 1}/${PRIORITY_COUNT}] Начинаем загрузку: ${file}`);
      return loadSingleModel(file, index);
    });
    
    const priorityResults = await Promise.allSettled(priorityPromises);
    console.log(`🦆  Результаты приоритетной загрузки:`, priorityResults.map((r, i) => ({
      file: priorityFiles[i],
      status: r.status,
      error: r.status === 'rejected' ? r.reason : null
    })), "🦆");
    
    // Шаг 2: Ленивая загрузка остальных моделей батчами
    const remainingModels = modelFiles.slice(PRIORITY_COUNT);
    console.log(`🦆 Ленивая загрузка остальных ${remainingModels.length} моделей батчами по ${BATCH_SIZE}... 🦆`);
    
    for (let i = 0; i < remainingModels.length; i += BATCH_SIZE) {
      const batch = remainingModels.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(remainingModels.length / BATCH_SIZE);
      console.log(`🦆  Батч ${batchIndex}/${totalBatches}: загрузка ${batch.length} моделей 🦆`);
      console.log(`🦆    Файлы:`, batch, "🦆");
      
      const batchPromises = batch.map((file, batchLocalIndex) => {
        const globalIndex = PRIORITY_COUNT + i + batchLocalIndex;
        console.log(`    [${globalIndex + 1}/${totalModels}] Начинаем загрузку: ${file}`);
        return loadSingleModel(file, globalIndex);
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      console.log(`🦆  Батч ${batchIndex} завершен:`, batchResults.map((r, bi) => ({
        file: batch[bi],
        status: r.status,
        error: r.status === 'rejected' ? r.reason : null
      })), "🦆");
      
      // Небольшая задержка между батчами для плавности
      if (i + BATCH_SIZE < remainingModels.length) {
        console.log(`🦆  Пауза ${BATCH_DELAY}мс перед следующим батчем... 🦆`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    
    const finalLoadedCount = loadedModels.filter(m => m !== null && m !== undefined).length;
    const successCount = loadedModels.filter(m => m !== null && m !== undefined).length;
    const failedCount = totalModels - successCount;
    
    console.log(`🦆═══════════════════════════════════════════════════════🦆`);
    console.log(`🦆📊 ИТОГИ ЗАГРУЗКИ МОДЕЛЕЙ: 🦆`);
    console.log(`🦆  Всего моделей: ${totalModels} 🦆`);
    console.log(`🦆  ✓ Успешно загружено: ${successCount} 🦆`);
    console.log(`🦆  ✗ Ошибок загрузки: ${failedCount} 🦆`);
    console.log(`🦆═══════════════════════════════════════════════════════🦆`);
    
    if (failedCount > 0) {
      console.warn(`🦆⚠ ВНИМАНИЕ: ${failedCount} моделей не загружено! 🦆`);
      for (let i = 0; i < loadedModels.length; i++) {
        if (!loadedModels[i]) {
          console.warn(`🦆  - Модель ${i + 1} (${modelFiles[i]}) не загружена 🦆`);
        }
      }
    }
    
    // Находим самое большое здание (по высоте) для исключения из ограничения этажей
    let maxHeight = 0;
    let tallestBuildingKey = null;
    for (const modelKey in modelHeights) {
      if (modelHeights[modelKey] > maxHeight) {
        maxHeight = modelHeights[modelKey];
        tallestBuildingKey = modelKey;
      }
    }
    
    // Ограничиваем количество этажей до 4 для всех зданий, кроме самого большого
    for (const modelKey in buildingFloors) {
      if (modelKey !== tallestBuildingKey && buildingFloors[modelKey] > 4) {
        console.log(`  → Ограничено этажей для ${modelKey}: ${buildingFloors[modelKey]} → 4`);
        buildingFloors[modelKey] = 4;
      }
    }
    
    if (tallestBuildingKey) {
      console.log(`✓ Самое большое здание: ${tallestBuildingKey} (${buildingFloors[tallestBuildingKey]} этажей)`);
    }
    
    // Скрываем прогресс-бар после завершения загрузки
    updateLoadingProgress(totalModels, totalModels, 'Завершено');
    setTimeout(() => {
      hideLoadingProgress();
    }, 500);
    
    // Применяем позиции из JSON (нормализация высоты отключена)
    setTimeout(async () => {
      await loadModelPositions();
    }, 500);
  } catch (error) {
    console.error("🦆═══════════════════════════════════════════════════════🦆");
    console.error("🦆✗ КРИТИЧЕСКАЯ ОШИБКА при загрузке моделей:", error, "🦆");
    console.error("🦆  Стек ошибки:", error.stack, "🦆");
    console.error("🦆═══════════════════════════════════════════════════════🦆");
    hideLoadingProgress();
  }
}

// ====================================================================================
// БЛОК 5: НОРМАЛИЗАЦИЯ ВЫСОТЫ МОДЕЛЕЙ (ОТКЛЮЧЕНО)
// ====================================================================================
// Функция для выравнивания высоты всех моделей (не используется, код закомментирован)
/*
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
*/

// ====================================================================================
// БЛОК 6: ЗАГРУЗКА И СОХРАНЕНИЕ ПОЗИЦИЙ МОДЕЛЕЙ
// ====================================================================================
// Загружает позиции, повороты и масштабы моделей из model_positions.json
// Применяет сохраненные настройки к моделям после их загрузки

async function detectDevApi() {
  if (devApiDetectionPromise) {
    return devApiDetectionPromise;
  }

  devApiDetectionPromise = (async () => {
    try {
      const response = await fetch(`${DEV_API_BASE}/status`);
      if (!response.ok) {
        devApiAvailable = false;
        return false;
      }
      const status = await response.json();
      devApiAvailable = !!status?.ok;
      console.log(`✓ DEV API ${devApiAvailable ? "доступен" : "недоступен"}`);
      return devApiAvailable;
    } catch (_error) {
      devApiAvailable = false;
      return false;
    }
  })();

  return devApiDetectionPromise;
}

function applyModelPositionData(modelKey, pos) {
  if (!pos || !modelKey.startsWith("model")) return;

  const modelIndex = parseInt(modelKey.replace("model", ""), 10) - 1;
  if (modelIndex < 0 || modelIndex >= loadedModels.length) {
    return;
  }

  const model = loadedModels[modelIndex];
  if (!model) return;

  // Применяем позиции
  if (pos.offset) {
    const x = pos.offset.x !== undefined ? pos.offset.x : modelOffsets[modelKey]?.x || 0;
    const y = pos.offset.y !== undefined ? pos.offset.y : model.position.y;
    const z = pos.offset.z !== undefined ? pos.offset.z : modelOffsets[modelKey]?.z || 0;
    model.position.set(x, y, z);

    if (!modelOffsets[modelKey]) modelOffsets[modelKey] = {};
    modelOffsets[modelKey].x = x;
    modelOffsets[modelKey].y = y;
    modelOffsets[modelKey].z = z;
  }

  // Применяем поворот
  if (pos.rotation && pos.rotation.yaw !== undefined) {
    model.rotation.y = pos.rotation.yaw;
    if (!modelRotations[modelKey]) modelRotations[modelKey] = {};
    modelRotations[modelKey].yaw = pos.rotation.yaw;
  }

  // Применяем масштаб
  if (!initialModelScales[modelKey]) {
    initialModelScales[modelKey] = {
      x: model.scale.x,
      y: model.scale.y,
      z: model.scale.z
    };
  }

  const initialScale = initialModelScales[modelKey];
  if (pos.scale) {
    let scaleX = pos.scale.x !== undefined ? pos.scale.x : 1.0;
    let scaleY = pos.scale.y !== undefined ? pos.scale.y : 1.0;
    let scaleZ = pos.scale.z !== undefined ? pos.scale.z : 1.0;

    if (scaleX > 10 || scaleY > 10 || scaleZ > 10) {
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

async function loadModelPositions() {
  try {
    await detectDevApi();

    let positions = null;

    if (devApiAvailable) {
      const apiResponse = await fetch(`${DEV_API_BASE}/model_positions`);
      if (apiResponse.ok) {
        positions = await apiResponse.json();
        if (positions && Object.keys(positions).length > 0) {
          console.log("✓ Позиции загружены из DEV API");
        }
      }
    }

    if (!positions || Object.keys(positions).length === 0) {
      const response = await fetch("model_positions.json");
      if (!response.ok) {
        console.log("Файл model_positions.json не найден, используются позиции по умолчанию");
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
      positions = await response.json();
      console.log("✓ Позиции загружены из model_positions.json");
    }

    for (const modelKey in positions) {
      if (modelKey === "labels" || !modelKey.startsWith("model")) {
        continue;
      }
      applyModelPositionData(modelKey, positions[modelKey]);
    }
  } catch (error) {
    console.error("Ошибка загрузки позиций моделей:", error);
  }
}

// ====================================================================================
// БЛОК 7: СИСТЕМА МЕТОК (CSS2DRenderer)
// ====================================================================================
// Создание, редактирование, удаление HTML меток в 3D пространстве
// Метки привязываются к моделям или свободным позициям, сохраняются в JSON
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

// ====================================================================================
// БЛОК 8: UI ДЛЯ УПРАВЛЕНИЯ МЕТКАМИ
// ====================================================================================
// Модальные окна для редактирования меток: текст, цвет, размер шрифта, позиция
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
// ====================================================================================
// БЛОК 7.1: ЛЕНИВАЯ ЗАГРУЗКА МЕТОК
// ====================================================================================
// Загружает метки только после загрузки основных моделей
async function loadLabelsFromJSON() {
  try {
    // Небольшая задержка для оптимизации (метки загружаются после моделей)
    await new Promise(resolve => setTimeout(resolve, 100));
    
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

// ====================================================================================
// БЛОК 9: УПРАВЛЕНИЕ МОДЕЛЯМИ
// ====================================================================================
// Перемещение, поворот, масштабирование моделей через клавиатуру и UI
// Режим позиционирования позволяет точно настраивать расположение корпусов
function buildModelPayloadByIndex(modelIndex) {
  const model = loadedModels[modelIndex];
  if (!model) return null;
  const modelKey = `model${modelIndex + 1}`;
  const initialScale = initialModelScales[modelKey] || {
    x: model.scale.x,
    y: model.scale.y,
    z: model.scale.z
  };

  return {
    offset: {
      x: model.position.x,
      y: model.position.y,
      z: model.position.z
    },
    rotation: {
      yaw: model.rotation.y
    },
    scale: {
      x: model.scale.x / initialScale.x,
      y: model.scale.y / initialScale.y,
      z: model.scale.z / initialScale.z
    },
    file: modelFiles[modelIndex] || `models/model${modelIndex + 1}.obj`,
    clientId: DEV_CLIENT_ID
  };
}

async function syncModelTransformToApi(modelIndex) {
  if (!devApiAvailable || applyingRemoteUpdate) return;
  const modelKey = `model${modelIndex + 1}`;
  const payload = buildModelPayloadByIndex(modelIndex);
  if (!payload) return;

  try {
    await fetch(`${DEV_API_BASE}/models/${modelKey}/transform`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.warn(`Не удалось синхронизировать ${modelKey} с API:`, error);
  }
}

function scheduleModelTransformSync(modelIndex, delayMs = 250) {
  if (modelIndex < 0) return;
  const existingTimer = modelSyncTimers.get(modelIndex);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    modelSyncTimers.delete(modelIndex);
    syncModelTransformToApi(modelIndex);
  }, delayMs);

  modelSyncTimers.set(modelIndex, timer);
}

function connectDevEvents() {
  if (!devApiAvailable || devEventSource) return;
  try {
    devEventSource = new EventSource(`${DEV_API_BASE}/events`);
    devEventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type !== "model_transform_updated") return;
        if (payload?.clientId === DEV_CLIENT_ID) return;

        const modelKey = payload.modelKey;
        const pos = payload.data;
        if (!modelKey || !pos) return;

        applyingRemoteUpdate = true;
        applyModelPositionData(modelKey, pos);
      } catch (error) {
        console.warn("Ошибка обработки realtime-события:", error);
      } finally {
        applyingRemoteUpdate = false;
      }
    };

    devEventSource.onerror = () => {
      // Позволяем EventSource автоматически переподключаться.
    };
    console.log("✓ Realtime подписка на DEV API активирована");
  } catch (error) {
    console.warn("Не удалось подключить realtime-подписку:", error);
  }
}

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
  scheduleModelTransformSync(activeModel - 1);
}

function rotateActiveModel(deltaYaw) {
  if (activeModel < 1 || activeModel > loadedModels.length) return;
  const model = loadedModels[activeModel - 1];
  if (!model) return;
  
  model.rotation.y += deltaYaw;
  
  const modelKey = `model${activeModel}`;
  modelRotations[modelKey].yaw = model.rotation.y;
  scheduleModelTransformSync(activeModel - 1);
}

function scaleActiveModel(scaleFactor) {
  if (activeModel < 1 || activeModel > loadedModels.length) return;
  const model = loadedModels[activeModel - 1];
  if (!model) return;
  
  model.scale.multiplyScalar(scaleFactor);
  scheduleModelTransformSync(activeModel - 1);
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


// ====================================================================================
// БЛОК 11: ЭКСПОРТ ДАННЫХ
// ====================================================================================
// Экспорт позиций моделей и меток в JSON файл для сохранения и загрузки
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

// ====================================================================================
// БЛОК 12: UI КНОПКИ И ПОЛЗУНКИ
// ====================================================================================
// Инициализация всех кнопок интерфейса и ползунков масштабирования моделей
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

  // Синхронизируем изменение масштаба в dev API
  scheduleModelTransformSync(activeModel - 1);
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

// ====================================================================================
// БЛОК 13: ОБРАБОТКА ИЗМЕНЕНИЯ РАЗМЕРА ОКНА
// ====================================================================================
// Обновляет размеры камеры и рендереров при изменении размера окна браузера
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
  
  // Оптимизация pixel ratio для мобильных устройств
  const pixelRatio = isMobileDevice ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
}

// ====================================================================================
// БЛОК 14: ГЛАВНЫЙ ЦИКЛ РЕНДЕРИНГА
// ====================================================================================
// Анимационный цикл, который обновляет сцену каждый кадр
// Обновляет движение камеры, проверяет видимость меток, отрисовывает все объекты
function animate() {
  requestAnimationFrame(animate);
  
  // Проверяем, что все объекты инициализированы
  if (!scene || !camera || !renderer || !labelRenderer) {
    return;
  }
  
  // Обновляем движение камеры только если не в режиме добавления меток
  if (!addLabelMode) {
    updateCameraMovement();
    if (window.updateModelRotation) {
      window.updateModelRotation();
    }
  }
  
  // Обновляем позиции солнца и луны каждый кадр со сглаживанием
  updateSunMoonPosition();
  
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

  // ====================================================================================
  // БЛОК 16: ОБРАБОТКА КЛИКОВ НА СЦЕНУ
  // ====================================================================================
  // Клик по сцене в режиме добавления меток создает новую метку
  // Использует raycasting для определения точки клика в 3D пространстве
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

  // ====================================================================================
  // БЛОК 17: ОБРАБОТКА КЛИКОВ НА ЗДАНИЯ ДЛЯ ПЕРЕКЛЮЧЕНИЯ ЭТАЖЕЙ
  // ====================================================================================
  // Клик по зданию выбирает его для просмотра этажей
  // Автоматически обновляет отображение этажей для выбранного здания
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
    
    // Инициализация аккордеона меню
    const hudMenu = document.getElementById('hudMenu');
    const hudHeader = hudMenu?.querySelector('.hud-header');
    
    if (hudHeader) {
      hudHeader.addEventListener('click', () => {
        hudMenu.classList.toggle('expanded');
      });
    }
    
    // Инициализация утки со звуком
    initDuckButton();

    // Активируем realtime-синхронизацию в dev режиме
    detectDevApi().then((enabled) => {
      if (enabled) {
        connectDevEvents();
      }
    });
  });
  
  /**
   * Инициализирует кнопку утки со звуком "кря"
   */
  function initDuckButton() {
    const duckButton = document.getElementById('duckButton');
    if (!duckButton) return;
    
    duckButton.addEventListener('click', () => {
      playQuackSound();
    });
    
    console.log("✓ Утка инициализирована");
  }
  
  /**
   * Воспроизводит звук "кря" используя Web Audio API
   */
  function playQuackSound() {
    try {
      // Создаем контекст аудио (если еще не создан)
      if (!window.audioContext) {
        window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const audioContext = window.audioContext;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      // Настраиваем звук "кря" - комбинация частот для реалистичного звука
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.2);
      
      // Настраиваем громкость (envelope)
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
      
      // Подключаем узлы
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Воспроизводим звук
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.25);
      
      console.log("🦆 Кря!");
    } catch (error) {
      console.warn("Не удалось воспроизвести звук утки:", error);
      // Fallback: просто выводим в консоль
      console.log("🦆 Кря!");
    }
  }
  
  // ====================================================================================
  // БЛОК 10: ОБРАБОТКА КЛАВИАТУРЫ
  // ====================================================================================
  // Управление камерой (WASD/стрелки), выбор моделей (1-9), поворот моделей (Q/E)
  // В режиме позиционирования: перемещение моделей стрелками, подъем/опускание Space/Shift
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
  
  // ====================================================================================
  // БЛОК 15: ОБРАБОТКА ОШИБОК
  // ====================================================================================
  // Глобальные обработчики ошибок для отлова проблем при загрузке и выполнении
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
  
  // Делаем функцию доступной глобально для вызова из animate()
  window.updateModelRotation = updateModelRotation;
  
  // Запускаем анимацию после инициализации
  animate();

  // Добавляем обработчик ресайза
  window.addEventListener("resize", resize);
}

// ====================================================================================
// БЛОК 18: ИНИЦИАЛИЗАЦИЯ КНОПОК МЕТОК
// ====================================================================================
// Настраивает обработчики событий для всех кнопок управления метками
// Кнопки: добавление меток, показ/скрытие панели меток, скачивание меток

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

// ====================================================================================
// БЛОК 19: ИНИЦИАЛИЗАЦИЯ КНОПОК УПРАВЛЕНИЯ ЭТАЖАМИ
// ====================================================================================
// Настраивает кнопки для переключения этажей: +, -, "Все"
// Обновляет отображение текущего этажа и применяет режим просмотра

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

// ====================================================================================
// БЛОК 20: РЕЖИМ ПРОСМОТРА ЭТАЖА
// ====================================================================================
// Переключает камеру в ортографический режим для вида сверху на выбранный этаж
// При выборе "Все этажи" возвращает перспективную камеру
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
  
  console.log(`Режим этажей: ${currentFloor === 0 ? 'Все этажи' : 'Этаж ' + currentFloor}`);
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
