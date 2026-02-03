// ПРИМЕР: Как бы выглядел ваш код с Three.js
// Это демонстрация - не запускайте напрямую!

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ========== ИНИЦИАЛИЗАЦИЯ (20 строк вместо 200) ==========
const canvas = document.querySelector("#c");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xe0e0e0);

// Управление камерой (автоматически!)
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 60;
controls.maxDistance = 2000;
controls.maxPolarAngle = Math.PI * 0.6; // Ограничение угла

// ========== ОСВЕЩЕНИЕ (5 строк вместо 50) ==========
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(-0.3, -1.0, -0.2);
scene.add(directionalLight);

// ========== ПОЛ И СЕТКА (10 строк вместо 100) ==========
const PLAN_SIZE = 1100;
const floorGeometry = new THREE.PlaneGeometry(PLAN_SIZE * 1.35, PLAN_SIZE * 1.35);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = PLAN_SIZE * -0.03;
scene.add(floor);

const gridHelper = new THREE.GridHelper(PLAN_SIZE * 1.35, 55, 0x595966, 0x595966);
gridHelper.position.y = PLAN_SIZE * -0.02;
scene.add(gridHelper);

// ========== ЗАГРУЗКА МОДЕЛЕЙ (30 строк вместо 200) ==========
const modelFiles = [
  "models/11111.obj",
  "models/2к 3D.obj",
  "models/3к 3D.obj",
  "models/4к 3D.obj",
  "models/5к.obj",
  "models/6к.obj",
  "models/7к.obj",
];

const loadedModels = [];
const modelPositions = {}; // Для сохранения позиций

const loader = new OBJLoader();
modelFiles.forEach((file, index) => {
  loader.load(file, (object) => {
    // Автоматическое масштабирование и центрирование
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);
    const scale = (PLAN_SIZE * 0.9) / maxDim;
    
    object.scale.multiplyScalar(scale);
    object.position.sub(center.multiplyScalar(scale));
    object.position.y = PLAN_SIZE * 0.12;
    
    // Материал
    object.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ 
          color: 0x808080,
          flatShading: true 
        });
      }
    });
    
    loadedModels[index] = object;
    scene.add(object);
    
    // Загружаем сохранённые позиции
    loadModelPositions();
  });
});

// ========== УПРАВЛЕНИЕ МОДЕЛЯМИ (50 строк вместо 300) ==========
let activeModelIndex = 0;
let positionMode = false;

// Переключение моделей (1-7)
window.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '7') {
    activeModelIndex = parseInt(e.key) - 1;
    updateUI();
  }
  
  if (e.key === 'r' || e.key === 'R') {
    // Сброс камеры
    camera.position.set(0, 240, 240);
    controls.target.set(0, 2, -10);
    controls.update();
  }
  
  // Позиционирование модели
  if (positionMode && loadedModels[activeModelIndex]) {
    const model = loadedModels[activeModelIndex];
    const step = PLAN_SIZE * 0.01;
    
    if (e.key === 'ArrowUp') model.position.z -= step;
    if (e.key === 'ArrowDown') model.position.z += step;
    if (e.key === 'ArrowLeft') model.position.x -= step;
    if (e.key === 'ArrowRight') model.position.x += step;
    if (e.key === 'PageUp') model.position.y += step;
    if (e.key === 'PageDown') model.position.y -= step;
    if (e.key === 'q' || e.key === 'Q') model.rotation.y -= Math.PI / 36;
    if (e.key === 'e' || e.key === 'E') model.rotation.y += Math.PI / 36;
  }
});

// ========== ЭКСПОРТ ПОЗИЦИЙ (10 строк вместо 50) ==========
function exportPositions() {
  const positions = {};
  loadedModels.forEach((model, index) => {
    if (model) {
      positions[`model${index + 1}`] = {
        offset: { x: model.position.x, y: model.position.y, z: model.position.z },
        rotation: { yaw: model.rotation.y },
        file: modelFiles[index]
      };
    }
  });
  
  const blob = new Blob([JSON.stringify(positions, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'model_positions.json';
  a.click();
}

// ========== РЕНДЕРИНГ (5 строк вместо 100) ==========
function animate() {
  requestAnimationFrame(animate);
  controls.update(); // Автоматическое обновление камеры
  renderer.render(scene, camera);
}
animate();

// ========== ИТОГО: ~150 строк вместо 1700! ==========
