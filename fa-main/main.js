const canvas = document.querySelector("#c");
const gl = canvas.getContext("webgl");

function showError(message) {
  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.left = "12px";
  label.style.bottom = "12px";
  label.style.right = "12px";
  label.style.maxWidth = "520px";
  label.style.background = "rgba(0, 0, 0, 0.7)";
  label.style.color = "#f2b8b5";
  label.style.padding = "10px 12px";
  label.style.borderRadius = "6px";
  label.style.fontSize = "12px";
  label.style.lineHeight = "1.4";
  label.textContent = message;
  document.body.appendChild(label);
}

if (!gl) {
  showError("WebGL недоступен в этом браузере.");
}

const vsSource = `
  attribute vec3 a_position;
  attribute vec3 a_normal;
  attribute vec2 a_uv;
  attribute vec3 a_color;
  uniform mat4 u_viewProj;
  uniform vec3 u_lightDir;
  varying vec3 v_color;
  varying vec2 v_uv;
  varying float v_light;
  varying float v_height;
  void main() {
    vec3 normal = normalize(a_normal);
    float light = max(abs(dot(normal, -u_lightDir)), 0.15);
    v_light = light;
    v_color = a_color;
    v_uv = a_uv;
    v_height = a_position.y;
    gl_Position = u_viewProj * vec4(a_position, 1.0);
  }
`;

const fsSource = `
  precision mediump float;
  varying vec3 v_color;
  varying vec2 v_uv;
  varying float v_light;
  varying float v_height;
  uniform sampler2D u_tex;
  uniform float u_useTexture;
  uniform float u_floorStep;
  uniform float u_floorBand;
  void main() {
    vec3 base = v_color;
    if (u_useTexture > 0.5) {
      base = texture2D(u_tex, v_uv).rgb;
    }

    // Яркие тонкие полосы между этажами (как светящийся бордер)
    if (u_floorStep > 0.0) {
      float level = fract(v_height / u_floorStep);
      float stripe = step(level, u_floorBand) + step(1.0 - level, u_floorBand);
      stripe = clamp(stripe, 0.0, 1.0);
      vec3 glowColor = vec3(1.15, 1.15, 1.25);
      base = mix(base, glowColor, stripe * 0.55);
    }

    gl_FragColor = vec4(base * v_light, 1.0);
  }
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function createProgram(vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

// Column‑major матрицы как в WebGL (совместимо с glMatrix)
function mat4Perspective(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  const out = new Array(16);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;

  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;

  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;

  out[12] = 0;
  out[13] = 0;
  out[14] = 2 * far * near * nf;
  out[15] = 0;
  return out;
}

function mat4LookAt(eye, target, up) {
  const out = new Array(16);
  let x0;
  let x1;
  let x2;
  let y0;
  let y1;
  let y2;
  let z0;
  let z1;
  let z2;

  z0 = eye[0] - target[0];
  z1 = eye[1] - target[1];
  z2 = eye[2] - target[2];

  let len = z0 * z0 + z1 * z1 + z2 * z2;
  if (len === 0) {
    z2 = 1;
  } else {
    len = 1 / Math.sqrt(len);
    z0 *= len;
    z1 *= len;
    z2 *= len;
  }

  x0 = up[1] * z2 - up[2] * z1;
  x1 = up[2] * z0 - up[0] * z2;
  x2 = up[0] * z1 - up[1] * z0;
  len = x0 * x0 + x1 * x1 + x2 * x2;
  if (len === 0) {
    x0 = 0;
    x1 = 0;
    x2 = 0;
  } else {
    len = 1 / Math.sqrt(len);
    x0 *= len;
    x1 *= len;
    x2 *= len;
  }

  y0 = z1 * x2 - z2 * x1;
  y1 = z2 * x0 - z0 * x2;
  y2 = z0 * x1 - z1 * x0;

  len = y0 * y0 + y1 * y1 + y2 * y2;
  if (len === 0) {
    y0 = 0;
    y1 = 0;
    y2 = 0;
  } else {
    len = 1 / Math.sqrt(len);
    y0 *= len;
    y1 *= len;
    y2 *= len;
  }

  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

function mat4Multiply(a, b) {
  const out = new Array(16);
  const a00 = a[0];
  const a01 = a[1];
  const a02 = a[2];
  const a03 = a[3];
  const a10 = a[4];
  const a11 = a[5];
  const a12 = a[6];
  const a13 = a[7];
  const a20 = a[8];
  const a21 = a[9];
  const a22 = a[10];
  const a23 = a[11];
  const a30 = a[12];
  const a31 = a[13];
  const a32 = a[14];
  const a33 = a[15];

  let b0 = b[0];
  let b1 = b[1];
  let b2 = b[2];
  let b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4];
  b1 = b[5];
  b2 = b[6];
  b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8];
  b1 = b[9];
  b2 = b[10];
  b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12];
  b1 = b[13];
  b2 = b[14];
  b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

function addBox(mesh, cx, cy, cz, w, h, d, color) {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const positions = [
    // Front
    cx - x, cy - y, cz + z,
    cx + x, cy - y, cz + z,
    cx + x, cy + y, cz + z,
    cx - x, cy - y, cz + z,
    cx + x, cy + y, cz + z,
    cx - x, cy + y, cz + z,
    // Back
    cx + x, cy - y, cz - z,
    cx - x, cy - y, cz - z,
    cx - x, cy + y, cz - z,
    cx + x, cy - y, cz - z,
    cx - x, cy + y, cz - z,
    cx + x, cy + y, cz - z,
    // Left
    cx - x, cy - y, cz - z,
    cx - x, cy - y, cz + z,
    cx - x, cy + y, cz + z,
    cx - x, cy - y, cz - z,
    cx - x, cy + y, cz + z,
    cx - x, cy + y, cz - z,
    // Right
    cx + x, cy - y, cz + z,
    cx + x, cy - y, cz - z,
    cx + x, cy + y, cz - z,
    cx + x, cy - y, cz + z,
    cx + x, cy + y, cz - z,
    cx + x, cy + y, cz + z,
    // Top
    cx - x, cy + y, cz + z,
    cx + x, cy + y, cz + z,
    cx + x, cy + y, cz - z,
    cx - x, cy + y, cz + z,
    cx + x, cy + y, cz - z,
    cx - x, cy + y, cz - z,
    // Bottom
    cx - x, cy - y, cz - z,
    cx + x, cy - y, cz - z,
    cx + x, cy - y, cz + z,
    cx - x, cy - y, cz - z,
    cx + x, cy - y, cz + z,
    cx - x, cy - y, cz + z,
  ];

  const normals = [
    // Front
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    // Back
    0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Left
    -1, 0, 0, -1, 0, 0, -1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0,
    // Right
    1, 0, 0, 1, 0, 0, 1, 0, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0,
    // Top
    0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0,
    // Bottom
    0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0,
  ];

  for (let i = 0; i < positions.length; i += 3) {
    mesh.positions.push(positions[i], positions[i + 1], positions[i + 2]);
    mesh.normals.push(normals[i], normals[i + 1], normals[i + 2]);
    mesh.colors.push(color[0], color[1], color[2]);
    mesh.uvs.push(0, 0);
  }
}

function addPlane(mesh, size, color, y = 0) {
  const s = size / 2;
  const data = [
    // posX, posY, posZ,   u, v
    -s, y, -s, 0, 0,
    s, y, -s, 1, 0,
    s, y, s, 1, 1,

    -s, y, -s, 0, 0,
    s, y, s, 1, 1,
    -s, y, s, 0, 1,
  ];
  for (let i = 0; i < data.length; i += 5) {
    const px = data[i];
    const py = data[i + 1];
    const pz = data[i + 2];
    let u = data[i + 3];
    let v = data[i + 4];
    if (FLIP_PLAN_U) u = 1 - u;
    if (FLIP_PLAN_V) v = 1 - v;
    mesh.positions.push(px, py, pz);
    mesh.normals.push(0, 1, 0);
    mesh.colors.push(color[0], color[1], color[2]);
    mesh.uvs.push(u, v);
  }
}

function addGrid(mesh, size, gridSize, color, y = 0, lineWidth = 0.05) {
  // gridSize - размер одной ячейки сетки
  // size - общий размер сетки
  const halfSize = size / 2;
  const lineHeight = y + lineWidth * 0.1; // Немного выше пола для видимости
  
  // Вертикальные линии (параллельны оси Z, идут вдоль оси X)
  for (let x = -halfSize; x <= halfSize + 0.1; x += gridSize) {
    // Тонкая линия как узкий прямоугольник, вытянутый вдоль Z
    addBox(mesh, x, lineHeight, 0, lineWidth, lineWidth * 2, size, color);
  }
  
  // Горизонтальные линии (параллельны оси X, идут вдоль оси Z)
  for (let z = -halfSize; z <= halfSize + 0.1; z += gridSize) {
    // Тонкая линия как узкий прямоугольник, вытянутый вдоль X
    addBox(mesh, 0, lineHeight, z, size, lineWidth * 2, lineWidth, color);
  }
}

function createMesh() {
  return { positions: [], normals: [], uvs: [], colors: [] };
}

const vs = compileShader(gl.VERTEX_SHADER, vsSource);
const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
const program = createProgram(vs, fs);

if (!program) {
  showError("Ошибка инициализации WebGL.");
}

const attribs = {
  position: gl.getAttribLocation(program, "a_position"),
  normal: gl.getAttribLocation(program, "a_normal"),
  uv: gl.getAttribLocation(program, "a_uv"),
  color: gl.getAttribLocation(program, "a_color"),
};
const uniforms = {
  viewProj: gl.getUniformLocation(program, "u_viewProj"),
  lightDir: gl.getUniformLocation(program, "u_lightDir"),
  useTexture: gl.getUniformLocation(program, "u_useTexture"),
  tex: gl.getUniformLocation(program, "u_tex"),
  floorStep: gl.getUniformLocation(program, "u_floorStep"),
  floorBand: gl.getUniformLocation(program, "u_floorBand"),
};

// Можно зеркалить план по осям, если нужно совместить с геометрией
const FLIP_PLAN_U = false; // отражение по горизонтали
const FLIP_PLAN_V = false; // отражение по вертикали

// Поворот модели на 180° вокруг оси Y (если "ушки" смотрят не туда)
const ROTATE_MODEL_Y_180 = true;

// Размер квадрата с планом (увеличен в 5 раз)
const PLAN_SIZE = 220 * 5; // 1100
const PLAN_TEXTURE_SIZE = PLAN_SIZE * 1.35;
const PLAN_Y = -PLAN_SIZE * 0.03;
const POSITION_STEP = PLAN_SIZE * 0.01;
const ROTATION_STEP = Math.PI / 36;

const floorMesh = createMesh();
addPlane(floorMesh, PLAN_TEXTURE_SIZE, [0.6, 0.6, 0.6], PLAN_Y);

// Создаем сетку на полу для ориентации в размерах
const gridMesh = createMesh();
const GRID_CELL_SIZE = 20 * 5; // Размер одной ячейки сетки (увеличен пропорционально полу)
const GRID_COLOR = [0.35, 0.35, 0.4]; // Темно-серый цвет для сетки (немного темнее для контраста)
addGrid(gridMesh, PLAN_TEXTURE_SIZE, GRID_CELL_SIZE, GRID_COLOR, PLAN_Y, 0.1);

// ----- Загрузка модели из OBJ файла -----
const buildingMeshes = [
  createMesh(), // model1
  createMesh(), // model2
  createMesh(), // model3
  createMesh(), // model4
  createMesh(), // model5
  createMesh(), // model6
  createMesh(), // model7
  createMesh(), // model8
];

// Для обратной совместимости
const buildingMesh = buildingMeshes[0];
const buildingMesh2 = buildingMeshes[1];

// Список файлов моделей
const modelFiles = [
  "models/11111.obj",                    // model1
  "models/2к 3D.obj",                    // model2 (заменена на модель 3)
  "models/3к 3D.obj",                   // model3 (было model4)
  "models/4к 3D.obj",                   // model4 (было model5)
  "models/5к.obj",                      // model5 (было model6)
  "models/6к.obj",                      // model6 (было model7)
  "models/7к.obj",                      // model7 (было model8)
];

const modelOffsets = {};
const modelRotations = {};
const modelBasePositions = {};
const modelBaseCenters = {};
const modelHeights = {}; // Высоты моделей для нормализации

// Инициализация позиций и поворотов для всех моделей
for (let i = 0; i < buildingMeshes.length; i++) {
  const modelKey = `model${i + 1}`;
  modelOffsets[modelKey] = { 
    x: (i % 3) * PLAN_SIZE * 0.5 - PLAN_SIZE * 0.5, 
    y: 0, 
    z: Math.floor(i / 3) * PLAN_SIZE * 0.5 - PLAN_SIZE * 0.25 
  };
  modelRotations[modelKey] = { yaw: 0 };
  modelBasePositions[modelKey] = null;
  modelBaseCenters[modelKey] = null;
}
const wallsMesh = createMesh();
const roomsMesh = createMesh();

// Если нужно вернуться к "рабочей" версии без OBJ, переключи на false
const USE_OBJ_MODEL = true;

function resetMesh(mesh) {
  mesh.positions.length = 0;
  mesh.normals.length = 0;
  mesh.uvs.length = 0;
  mesh.colors.length = 0;
}

function offsetMesh(mesh, dx, dy, dz) {
  for (let i = 0; i < mesh.positions.length; i += 3) {
    mesh.positions[i] += dx;
    mesh.positions[i + 1] += dy;
    mesh.positions[i + 2] += dz;
  }
}

function computeMeshCenter(positions) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
}

function computeMeshHeight(positions) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    const y = positions[i];
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return maxY - minY;
}

// Функция для нормализации высоты всех моделей до максимальной
function normalizeModelHeights() {
  // Находим максимальную высоту среди всех моделей
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
  
  // Масштабируем все модели по оси Y до максимальной высоты
  for (let i = 0; i < buildingMeshes.length; i++) {
    const modelKey = `model${i + 1}`;
    const base = modelBasePositions[modelKey];
    const center = modelBaseCenters[modelKey];
    
    if (!base || !center || !modelHeights[modelKey]) continue;
    
    const currentHeight = modelHeights[modelKey];
    if (currentHeight === 0) continue;
    
    const scaleY = maxHeight / currentHeight;
    
    // Применяем масштабирование только по оси Y
    const scaledPositions = new Array(base.length);
    for (let j = 0; j < base.length; j += 3) {
      const x = base[j];
      const y = base[j + 1];
      const z = base[j + 2];
      
      // Масштабируем относительно центра модели
      scaledPositions[j] = x;
      scaledPositions[j + 1] = center[1] + (y - center[1]) * scaleY;
      scaledPositions[j + 2] = z;
    }
    
    // Обновляем базовые позиции
    modelBasePositions[modelKey] = scaledPositions;
    modelBaseCenters[modelKey] = computeMeshCenter(scaledPositions);
    modelHeights[modelKey] = maxHeight; // Обновляем высоту до нормализованной
    
    // Применяем трансформацию
    const mesh = buildingMeshes[i];
    applyTransformFromBase(
      mesh,
      modelBasePositions[modelKey],
      modelBaseCenters[modelKey],
      modelOffsets[modelKey],
      modelRotations[modelKey],
    );
    
    // Обновляем GPU буфер
    buildingGPUs[i] = refreshMeshGPU(mesh, buildingGPUs[i]);
  }
  
  console.log(`Высота всех моделей нормализована до ${maxHeight.toFixed(2)} единиц`);
}

function applyTransformFromBase(mesh, basePositions, center, offset, rotation) {
  if (!basePositions || !center) return;
  const cosY = Math.cos(rotation.yaw);
  const sinY = Math.sin(rotation.yaw);
  const cx = center[0];
  const cy = center[1];
  const cz = center[2];
  mesh.positions = new Array(basePositions.length);
  for (let i = 0; i < basePositions.length; i += 3) {
    const x = basePositions[i] - cx;
    const y = basePositions[i + 1] - cy;
    const z = basePositions[i + 2] - cz;
    const rx = x * cosY - z * sinY;
    const rz = x * sinY + z * cosY;
    mesh.positions[i] = rx + cx + offset.x;
    mesh.positions[i + 1] = y + cy + offset.y;
    mesh.positions[i + 2] = rz + cz + offset.z;
  }
}

function refreshMeshGPU(mesh, gpu) {
  if (gpu && gpu.buffers) {
    gpu.buffers.forEach((buf) => gl.deleteBuffer(buf));
  }
  const updated = uploadMesh(mesh);
  if (!gpu) return updated;
  gpu.vao = updated.vao;
  gpu.count = updated.count;
  gpu.buffers = updated.buffers;
  return gpu;
}

function nudgeActiveModel(dx, dy, dz) {
  if (activeModel < 1 || activeModel > buildingMeshes.length) return;
  const meshIndex = activeModel - 1;
  const mesh = buildingMeshes[meshIndex];
  const modelKey = `model${activeModel}`;
  const base = modelBasePositions[modelKey];
  const center = modelBaseCenters[modelKey];
  const offset = modelOffsets[modelKey];
  const rotation = modelRotations[modelKey];
  if (!base) return;
  offset.x += dx;
  offset.y += dy;
  offset.z += dz;
  applyTransformFromBase(mesh, base, center, offset, rotation);
  if (buildingGPUs[meshIndex]) {
    buildingGPUs[meshIndex] = refreshMeshGPU(mesh, buildingGPUs[meshIndex]);
  }
}

function rotateActiveModel(deltaYaw) {
  if (activeModel < 1 || activeModel > buildingMeshes.length) return;
  const meshIndex = activeModel - 1;
  const mesh = buildingMeshes[meshIndex];
  const modelKey = `model${activeModel}`;
  const base = modelBasePositions[modelKey];
  const center = modelBaseCenters[modelKey];
  const offset = modelOffsets[modelKey];
  const rotation = modelRotations[modelKey];
  if (!base) return;
  rotation.yaw += deltaYaw;
  applyTransformFromBase(mesh, base, center, offset, rotation);
  if (buildingGPUs[meshIndex]) {
    buildingGPUs[meshIndex] = refreshMeshGPU(mesh, buildingGPUs[meshIndex]);
  }
}

function updatePositionModeLabel() {
  if (!positionModeBtn) return;
  const status = positionMode ? "On" : "Off";
  positionModeBtn.textContent = `Position Mode: ${status} (Model ${activeModel})`;
}

function buildPlanMock() {
  resetMesh(buildingMesh);
  resetMesh(wallsMesh);
  resetMesh(roomsMesh);

  const contourHeight = 0.3;
  const bottomWidth = PLAN_SIZE * 0.90;
  const bottomDepth = PLAN_SIZE * 0.20;
  const bottomZ = -PLAN_SIZE * 0.20;

  // Контур: нижняя длинная часть
  addBox(
    buildingMesh,
    0,
    contourHeight / 2,
    bottomZ,
    bottomWidth,
    contourHeight,
    bottomDepth,
    [0.5, 0.5, 0.5],
  );

  // Левый блок
  const leftBlockWidth = PLAN_SIZE * 0.32;
  const leftBlockDepth = PLAN_SIZE * 0.24;
  addBox(
    buildingMesh,
    -bottomWidth / 2 + leftBlockWidth / 2,
    contourHeight / 2,
    bottomZ + (bottomDepth - leftBlockDepth) / 2,
    leftBlockWidth,
    contourHeight,
    leftBlockDepth,
    [0.5, 0.5, 0.5],
  );

  // Правый блок
  const rightBlockWidth = PLAN_SIZE * 0.30;
  const rightBlockDepth = PLAN_SIZE * 0.26;
  addBox(
    buildingMesh,
    bottomWidth / 2 - rightBlockWidth / 2,
    contourHeight / 2,
    bottomZ + (bottomDepth - rightBlockDepth) / 2,
    rightBlockWidth,
    contourHeight,
    rightBlockDepth,
    [0.5, 0.5, 0.5],
  );

  // Крылья
  const wingWidth = PLAN_SIZE * 0.20;
  const wingDepth = PLAN_SIZE * 0.70;
  const wingsZ = bottomZ + bottomDepth / 2 + wingDepth / 2;
  const wingsOffsetX = PLAN_SIZE * 0.32;

  addBox(
    buildingMesh,
    -wingsOffsetX,
    contourHeight / 2,
    wingsZ,
    wingWidth,
    contourHeight,
    wingDepth,
    [0.5, 0.5, 0.5],
  );

  addBox(
    buildingMesh,
    wingsOffsetX,
    contourHeight / 2,
    wingsZ,
    wingWidth,
    contourHeight,
    wingDepth,
    [0.5, 0.5, 0.5],
  );

  // Стены
  const wallThickness = 0.15;
  const wallHeight = 2.0;

  function addWall(x, z, width, depth, isVertical) {
    const w = isVertical ? wallThickness : width;
    const d = isVertical ? depth : wallThickness;
    addBox(wallsMesh, x, wallHeight / 2, z, w, wallHeight, d, [0.05, 0.05, 0.05]);
  }

  addWall(0, bottomZ, bottomWidth * 0.85, wallThickness, false);
  addWall(-wingsOffsetX, wingsZ, wallThickness, wingDepth * 0.8, true);
  addWall(wingsOffsetX, wingsZ, wallThickness, wingDepth * 0.8, true);

  const numCrossWalls = 8;
  for (let i = 0; i < numCrossWalls; i++) {
    const x = -bottomWidth / 2 + (bottomWidth / (numCrossWalls + 1)) * (i + 1);
    addWall(x, bottomZ, wallThickness, bottomDepth * 0.6, true);
  }

  const numWingWalls = 6;
  for (let i = 0; i < numWingWalls; i++) {
    const z = bottomZ + bottomDepth / 2 + (wingDepth / (numWingWalls + 1)) * (i + 1);
    addWall(-wingsOffsetX, z, wingWidth * 0.7, wallThickness, false);
    addWall(wingsOffsetX, z, wingWidth * 0.7, wallThickness, false);
  }

  const roomHeight = 0.1;
  const roomColor = [0.7, 0.75, 0.8];

  function addRoom(x, z, width, depth) {
    addBox(roomsMesh, x, contourHeight + roomHeight / 2, z, width, roomHeight, depth, roomColor);
  }

  const roomSpacing = bottomWidth / (numCrossWalls + 1);
  const roomWidth = roomSpacing * 0.85;
  const roomDepth = bottomDepth * 0.35;

  for (let i = 0; i < numCrossWalls + 1; i++) {
    const x = -bottomWidth / 2 + roomSpacing * (i + 0.5);
    addRoom(x, bottomZ - bottomDepth * 0.25, roomWidth, roomDepth);
    addRoom(x, bottomZ + bottomDepth * 0.25, roomWidth, roomDepth);
  }

  const wingRoomSpacing = wingDepth / (numWingWalls + 1);
  const wingRoomWidth = wingWidth * 0.35;
  const wingRoomDepth = wingRoomSpacing * 0.85;

  for (let i = 0; i < numWingWalls + 1; i++) {
    const z = bottomZ + bottomDepth / 2 + wingRoomSpacing * (i + 0.5);
    addRoom(-wingsOffsetX - wingWidth * 0.25, z, wingRoomWidth, wingRoomDepth);
    addRoom(-wingsOffsetX + wingWidth * 0.25, z, wingRoomWidth, wingRoomDepth);
  }

  for (let i = 0; i < numWingWalls + 1; i++) {
    const z = bottomZ + bottomDepth / 2 + wingRoomSpacing * (i + 0.5);
    addRoom(wingsOffsetX - wingWidth * 0.25, z, wingRoomWidth, wingRoomDepth);
    addRoom(wingsOffsetX + wingWidth * 0.25, z, wingRoomWidth, wingRoomDepth);
  }
}

// Функция для парсинга OBJ файла с улучшенной обработкой граней
async function loadOBJModel(url, targetMesh) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.split("\n");

    resetMesh(targetMesh);

    const vertices = [];
    const normals = [];
    const faces = [];
    let maxRawIndex = 0;
    let hasZeroIndex = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("v ")) {
        // Вершина: v x y z
        const parts = trimmed.split(/\s+/);
        vertices.push([
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        ]);
      } else if (trimmed.startsWith("vn ")) {
        // Нормаль: vn x y z
        const parts = trimmed.split(/\s+/);
        normals.push([
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        ]);
      } else if (trimmed.startsWith("f ")) {
        // Грань: f v1/vt1/vn1 v2/vt2/vn2 v3/vt3/vn3 ...
        const parts = trimmed.split(/\s+/).slice(1);
        const faceIndices = [];
        for (const part of parts) {
          // Извлекаем индекс вершины (первое число до /)
          const raw = parseInt(part.split("/")[0]);
          if (!Number.isNaN(raw)) {
            if (raw === 0) {
              hasZeroIndex = true;
            }
            if (raw > maxRawIndex) {
              maxRawIndex = raw;
            }
            faceIndices.push(raw);
          }
        }
        if (faceIndices.length >= 3) {
          faces.push(faceIndices);
        }
      }
    }

    // Проверяем, что есть вершины
    if (vertices.length === 0) {
      console.error("OBJ файл не содержит вершин");
      showError("OBJ файл не содержит вершин.");
      return false;
    }

    // Вычисляем границы модели для центрирования и масштабирования
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    for (const v of vertices) {
      if (!v || v.length < 3) continue;
      minX = Math.min(minX, v[0]);
      maxX = Math.max(maxX, v[0]);
      minY = Math.min(minY, v[1]);
      maxY = Math.max(maxY, v[1]);
      minZ = Math.min(minZ, v[2]);
      maxZ = Math.max(maxZ, v[2]);
    }

    if (minX === Infinity || maxX === -Infinity) {
      console.error("Не удалось вычислить границы модели");
      showError("Не удалось вычислить границы модели.");
      return false;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Масштабируем модель под размер плана (используем X и Z для горизонтального размера)
    const modelWidth = maxX - minX;
    const modelDepth = maxZ - minZ;
    const modelHeight = maxY - minY;
    const maxDimension = Math.max(modelWidth, modelDepth);
    
    if (maxDimension === 0) {
      console.error("Модель имеет нулевой размер");
      showError("Модель имеет нулевой размер.");
      return false;
    }
    
    const scale = (PLAN_SIZE * 0.9) / maxDimension; // немного меньше плана для запаса

    // Выравниваем модель по полу + гарантированный зазор над планом
    const MODEL_LIFT = PLAN_SIZE * 0.12;
    const PLAN_GAP = PLAN_SIZE * 0.06;
    const baseOffset = -minY * scale + PLAN_SIZE * 0.02 + MODEL_LIFT;
    const minAllowedOffset = (PLAN_Y + PLAN_GAP) - (minY - centerY) * scale;
    const offsetY = Math.max(baseOffset, minAllowedOffset);

    const isZeroBased = hasZeroIndex || maxRawIndex === vertices.length - 1;

    function resolveIndex(rawIndex) {
      if (rawIndex === 0) {
        return null;
      }
      if (rawIndex < 0) {
        return vertices.length + rawIndex;
      }
      return isZeroBased ? rawIndex : rawIndex - 1;
    }

    let skippedTriangles = 0;

    // Создаем треугольники из граней
    for (const face of faces) {
      if (!face || face.length < 3) continue;
      
      // Разбиваем многоугольники на треугольники (fan triangulation)
      for (let i = 1; i < face.length - 1; i++) {
        const idx0 = resolveIndex(face[0]);
        const idx1 = resolveIndex(face[i]);
        const idx2 = resolveIndex(face[i + 1]);
        
        // Проверяем валидность индексов
        if (idx0 === null || idx1 === null || idx2 === null ||
            idx0 < 0 || idx0 >= vertices.length ||
            idx1 < 0 || idx1 >= vertices.length ||
            idx2 < 0 || idx2 >= vertices.length) {
          skippedTriangles += 1;
          continue; // пропускаем некорректные треугольники
        }
        
        const v0 = vertices[idx0];
        const v1 = vertices[idx1];
        const v2 = vertices[idx2];

        // Применяем трансформации: центрируем, масштабируем, выравниваем
        const x0 = (v0[0] - centerX) * scale;
        const y0 = (v0[1] - centerY) * scale + offsetY;
        const z0 = (v0[2] - centerZ) * scale;

        const x1 = (v1[0] - centerX) * scale;
        const y1 = (v1[1] - centerY) * scale + offsetY;
        const z1 = (v1[2] - centerZ) * scale;

        const x2 = (v2[0] - centerX) * scale;
        const y2 = (v2[1] - centerY) * scale + offsetY;
        const z2 = (v2[2] - centerZ) * scale;

        // Вычисляем нормаль для треугольника
        const dx1 = x1 - x0;
        const dy1 = y1 - y0;
        const dz1 = z1 - z0;
        const dx2 = x2 - x0;
        const dy2 = y2 - y0;
        const dz2 = z2 - z0;

        const nx = dy1 * dz2 - dz1 * dy2;
        const ny = dz1 * dx2 - dx1 * dz2;
        const nz = dx1 * dy2 - dy1 * dx2;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (!len || len < 1e-8) {
          continue; // вырожденный треугольник, пропускаем
        }
        const normalX = nx / len;
        const normalY = ny / len;
        const normalZ = nz / len;

        // Цвет модели (светло-серый)
        const color = [0.5, 0.5, 0.5];

        // Добавляем треугольник с правильным порядком вершин
        targetMesh.positions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
        targetMesh.normals.push(
          normalX, normalY, normalZ,
          normalX, normalY, normalZ,
          normalX, normalY, normalZ,
        );
        targetMesh.colors.push(...color, ...color, ...color);
        targetMesh.uvs.push(0, 0, 0, 0, 0, 0);
      }
    }

    // Проверяем, что созданы треугольники
    const triangleCount = targetMesh.positions.length / 3;
    if (triangleCount === 0) {
      console.error("Не удалось создать треугольники из граней");
      showError("Не удалось создать треугольники из граней.");
      return false;
    }

    if (skippedTriangles > 0) {
      console.warn(`Пропущено треугольников: ${skippedTriangles}`);
    }
    console.log(
      `Загружено ${vertices.length} вершин, ${normals.length} нормалей, ${faces.length} граней, ${triangleCount} треугольников`,
    );
    return true;
  } catch (error) {
    console.error("Ошибка загрузки OBJ:", error);
    showError("Не удалось загрузить модель из OBJ файла.");
    return false;
  }
}

// Загружаем модель из OBJ файла асинхронно
let modelLoaded = false;


function uploadMesh(mesh) {
  const vao = gl.createVertexArray ? gl.createVertexArray() : null;
  if (vao) gl.bindVertexArray(vao);

  function bindBuffer(data, attrib, size) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(attrib);
    gl.vertexAttribPointer(attrib, size, gl.FLOAT, false, 0, 0);
    return buffer;
  }

  const positionBuffer = bindBuffer(mesh.positions, attribs.position, 3);
  const normalBuffer = bindBuffer(mesh.normals, attribs.normal, 3);
  const uvBuffer = bindBuffer(mesh.uvs, attribs.uv, 2);
  const colorBuffer = bindBuffer(mesh.colors, attribs.color, 3);

  if (vao) gl.bindVertexArray(null);

  return {
    vao,
    count: mesh.positions.length / 3,
    buffers: [positionBuffer, normalBuffer, uvBuffer, colorBuffer],
  };
}

// Строим макет, если OBJ отключен
if (!USE_OBJ_MODEL) {
  buildPlanMock();
}

const floorGPU = uploadMesh(floorMesh);
const gridGPU = uploadMesh(gridMesh);
// Массив GPU буферов для всех моделей
const buildingGPUs = buildingMeshes.map(mesh => uploadMesh(mesh)); // временно пустые
// Для обратной совместимости
let buildingGPU = buildingGPUs[0];
let buildingGPU2 = buildingGPUs[1];
const wallsGPU = uploadMesh(wallsMesh);
const roomsGPU = uploadMesh(roomsMesh);

let showPlan = true;
let positionMode = false;
let activeModel = 1;
let positionModeBtn = null;
let exportPositionsBtn = null;

// Загружаем модели из OBJ файлов и обновляем GPU
if (USE_OBJ_MODEL) {
  // Загружаем все модели из массива modelFiles
  for (let i = 0; i < Math.min(modelFiles.length, buildingMeshes.length); i++) {
    const modelIndex = i;
    const modelKey = `model${modelIndex + 1}`;
    const mesh = buildingMeshes[modelIndex];
    const file = modelFiles[modelIndex];
    
    loadOBJModel(file, mesh).then((success) => {
      if (success) {
        modelLoaded = true;
        modelBasePositions[modelKey] = mesh.positions.slice();
        modelBaseCenters[modelKey] = computeMeshCenter(modelBasePositions[modelKey]);
        modelHeights[modelKey] = computeMeshHeight(modelBasePositions[modelKey]);
        applyTransformFromBase(
          mesh,
          modelBasePositions[modelKey],
          modelBaseCenters[modelKey],
          modelOffsets[modelKey],
          modelRotations[modelKey],
        );
        buildingGPUs[modelIndex] = refreshMeshGPU(mesh, buildingGPUs[modelIndex]);
        console.log(`Модель ${modelIndex + 1} (${file}) загружена, высота: ${modelHeights[modelKey].toFixed(2)}`);
      } else {
        console.warn(`Не удалось загрузить модель ${modelIndex + 1}: ${file}`);
      }
    }).catch((error) => {
      console.error(`Ошибка загрузки модели ${modelIndex + 1} (${file}):`, error);
    });
  }
  
  // Загружаем позиции из JSON файла и нормализуем высоты после загрузки всех моделей (с задержкой)
  setTimeout(() => {
    loadModelPositions();
    // Нормализуем высоты всех моделей до максимальной
    normalizeModelHeights();
  }, 3000); // Даём время моделям загрузиться
}

// Функция загрузки позиций моделей из JSON файла
async function loadModelPositions() {
  try {
    const response = await fetch("model_positions.json");
    if (!response.ok) {
      console.log("Файл model_positions.json не найден, используются позиции по умолчанию");
      return;
    }
    const positions = await response.json();
    
    // Применяем позиции ко всем моделям
    for (const modelKey in positions) {
      if (positions[modelKey] && modelOffsets[modelKey] && modelRotations[modelKey]) {
        const pos = positions[modelKey];
        if (pos.offset) {
          modelOffsets[modelKey].x = pos.offset.x || modelOffsets[modelKey].x;
          modelOffsets[modelKey].y = pos.offset.y || modelOffsets[modelKey].y;
          modelOffsets[modelKey].z = pos.offset.z || modelOffsets[modelKey].z;
        }
        if (pos.rotation) {
          modelRotations[modelKey].yaw = pos.rotation.yaw || modelRotations[modelKey].yaw;
        }
        
        // Применяем трансформацию к модели
        const modelIndex = parseInt(modelKey.replace("model", "")) - 1;
        if (modelIndex >= 0 && modelIndex < buildingMeshes.length) {
          const mesh = buildingMeshes[modelIndex];
          const base = modelBasePositions[modelKey];
          const center = modelBaseCenters[modelKey];
          if (base && center) {
            applyTransformFromBase(
              mesh,
              base,
              center,
              modelOffsets[modelKey],
              modelRotations[modelKey],
            );
            buildingGPUs[modelIndex] = refreshMeshGPU(mesh, buildingGPUs[modelIndex]);
          }
        }
      }
    }
    console.log("Позиции моделей загружены из model_positions.json");
  } catch (error) {
    console.warn("Не удалось загрузить позиции из model_positions.json:", error);
  }
}

const texture = gl.createTexture();
let textureLoaded = false;

const camera = {
  // целимся в центр макета, камера всегда сверху
  target: [0, 2, -10],
  distance: 240,
  yaw: Math.PI / 4,
  pitch: 0.9,
};

let isDragging = false;
let lastX = 0;
let lastY = 0;

// Отслеживание нажатых клавиш для плавного движения камеры
const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  w: false,
  W: false,
  s: false,
  S: false,
  a: false,
  A: false,
  d: false,
  D: false,
  Space: false,
  Shift: false,
  PageUp: false,
  PageDown: false,
  q: false,
  Q: false,
  e: false,
  E: false,
};

// Устанавливаем фокус на canvas при клике и при загрузке
canvas.addEventListener("click", () => {
  canvas.focus();
});

// Устанавливаем фокус при загрузке страницы
window.addEventListener("load", () => {
  canvas.focus();
});

canvas.addEventListener("mousedown", (event) => {
  canvas.focus(); // Убеждаемся, что canvas имеет фокус
  isDragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
});
window.addEventListener("mouseup", () => {
  isDragging = false;
});
window.addEventListener("mousemove", (event) => {
  if (!isDragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  camera.yaw -= dx * 0.005;
  camera.pitch += dy * 0.005; // инвертируем, чтобы движение мыши было интуитивным
  // мягкие ограничения: камера всегда остаётся над полом
  const minPitch = 0.2; // почти горизонтально
  const maxPitch = 2.2; // увеличен максимальный угол для более высокого полёта
  if (camera.pitch < minPitch) camera.pitch = minPitch;
  if (camera.pitch > maxPitch) camera.pitch = maxPitch;
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  camera.distance += event.deltaY * 0.2;
  camera.distance = Math.max(60, Math.min(2000, camera.distance)); // увеличена максимальная дальность
});

// Обработка нажатий клавиш
window.addEventListener("keydown", (event) => {
  if (event.key === "r" || event.key === "R") {
    camera.target = [0, 2, -10];
    camera.distance = 240;
    camera.yaw = Math.PI / 4;
    camera.pitch = 0.9;
    return;
  }

  // Переключение между моделями (1-8)
  if (event.key >= "1" && event.key <= "8") {
    const modelNum = parseInt(event.key);
    if (modelNum >= 1 && modelNum <= buildingMeshes.length) {
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
    keys.W = true;
  } else if (event.key === "s" || event.key === "S") {
    event.preventDefault();
    keys.s = true;
    keys.S = true;
  } else if (event.key === "a" || event.key === "A") {
    event.preventDefault();
    keys.a = true;
    keys.A = true;
  } else if (event.key === "d" || event.key === "D") {
    event.preventDefault();
    keys.d = true;
    keys.D = true;
  } else if (event.key === "q" || event.key === "Q") {
    event.preventDefault();
    keys.q = true;
    keys.Q = true;
  } else if (event.key === "e" || event.key === "E") {
    event.preventDefault();
    keys.e = true;
    keys.E = true;
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
  if (event.key === "ArrowUp") {
    keys.ArrowUp = false;
  } else if (event.key === "ArrowDown") {
    keys.ArrowDown = false;
  } else if (event.key === "ArrowLeft") {
    keys.ArrowLeft = false;
  } else if (event.key === "ArrowRight") {
    keys.ArrowRight = false;
  } else if (event.key === "w" || event.key === "W") {
    keys.w = false;
    keys.W = false;
  } else if (event.key === "s" || event.key === "S") {
    keys.s = false;
    keys.S = false;
  } else if (event.key === "a" || event.key === "A") {
    keys.a = false;
    keys.A = false;
  } else if (event.key === "d" || event.key === "D") {
    keys.d = false;
    keys.D = false;
  } else if (event.key === " ") {
    keys.Space = false;
  } else if (event.key === "Shift") {
    keys.Shift = false;
  } else if (event.key === "PageUp") {
    keys.PageUp = false;
  } else if (event.key === "PageDown") {
    keys.PageDown = false;
  } else if (event.key === "q" || event.key === "Q") {
    keys.q = false;
    keys.Q = false;
  } else if (event.key === "e" || event.key === "E") {
    keys.e = false;
    keys.E = false;
  }
});

// Функция обновления вращения моделей на основе нажатых клавиш
function updateModelRotation() {
  if (positionMode) return; // В режиме позиционирования вращение обрабатывается напрямую
  if (activeModel < 1 || activeModel > buildingMeshes.length) return;
  
  const rotationSpeed = ROTATION_STEP * 0.5; // Плавное вращение при удержании клавиш
  
  if (keys.q || keys.Q) {
    rotateActiveModel(-rotationSpeed);
  }
  if (keys.e || keys.E) {
    rotateActiveModel(rotationSpeed);
  }
}

// Функция обновления позиции камеры на основе нажатых клавиш
function updateCameraMovement() {
  if (positionMode) return; // Не двигаем камеру в режиме позиционирования
  
  if (!camera || !camera.target || !Array.isArray(camera.target)) {
    return; // Проверка на валидность камеры
  }

  try {
    const moveSpeed = 5.0; // Скорость движения камеры (увеличена для большого поля)
    const forwardX = -Math.sin(camera.yaw);
    const forwardZ = -Math.cos(camera.yaw);
    const leftX = -Math.cos(camera.yaw);
    const leftZ = Math.sin(camera.yaw);

    let moveX = 0;
    let moveZ = 0;
    let moveY = 0;

    // Вперёд/назад
    if (keys.ArrowUp || keys.w || keys.W) {
      moveX += forwardX * moveSpeed;
      moveZ += forwardZ * moveSpeed;
    }
    if (keys.ArrowDown || keys.s || keys.S) {
      moveX -= forwardX * moveSpeed;
      moveZ -= forwardZ * moveSpeed;
    }

    // Влево/вправо
    if (keys.ArrowLeft || keys.a || keys.A) {
      moveX += leftX * moveSpeed;
      moveZ += leftZ * moveSpeed;
    }
    if (keys.ArrowRight || keys.d || keys.D) {
      moveX -= leftX * moveSpeed;
      moveZ -= leftZ * moveSpeed;
    }

    // Вверх/вниз
    if (keys.Space || keys.PageUp) {
      moveY += moveSpeed;
    }
    if (keys.Shift || keys.PageDown) {
      moveY -= moveSpeed;
    }

    // Проверяем, что значения валидны перед применением
    if (isFinite(moveX) && isFinite(moveY) && isFinite(moveZ)) {
      camera.target[0] += moveX;
      camera.target[1] += moveY;
      camera.target[2] += moveZ;
    }
  } catch (error) {
    console.error("Ошибка в updateCameraMovement:", error);
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
}
window.addEventListener("resize", resize);
resize();

function getCameraPosition() {
  const x =
    camera.target[0] +
    Math.cos(camera.pitch) * Math.sin(camera.yaw) * camera.distance;
  const y = camera.target[1] + Math.sin(camera.pitch) * camera.distance;
  const z =
    camera.target[2] +
    Math.cos(camera.pitch) * Math.cos(camera.yaw) * camera.distance;
  return [x, y, z];
}

function drawMesh(mesh, useTexture) {
  if (!mesh || !mesh.count || mesh.count <= 0) {
    return; // Пропускаем пустые меши
  }
  
  try {
    if (mesh.vao) {
      gl.bindVertexArray(mesh.vao);
    } else {
      if (!mesh.buffers || mesh.buffers.length < 4) {
        return; // Нет необходимых буферов
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[0]);
      gl.enableVertexAttribArray(attribs.position);
      gl.vertexAttribPointer(attribs.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[1]);
      gl.enableVertexAttribArray(attribs.normal);
      gl.vertexAttribPointer(attribs.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[2]);
      gl.enableVertexAttribArray(attribs.uv);
      gl.vertexAttribPointer(attribs.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[3]);
      gl.enableVertexAttribArray(attribs.color);
      gl.vertexAttribPointer(attribs.color, 3, gl.FLOAT, false, 0, 0);
    }
    gl.uniform1f(uniforms.useTexture, useTexture ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    if (mesh.vao) gl.bindVertexArray(null);
  } catch (error) {
    console.error("Ошибка при отрисовке меша:", error);
    // Не выбрасываем ошибку дальше, просто пропускаем этот меш
  }
}

function render() {
  try {
    // Проверяем, что WebGL контекст не потерян
    if (!gl || gl.isContextLost()) {
      console.error("WebGL контекст потерян");
      return;
    }

    // Обновляем движение камеры на основе нажатых клавиш
    updateCameraMovement();
    
    // Обновляем вращение моделей на основе нажатых клавиш
    updateModelRotation();

    gl.clearColor(0.88, 0.88, 0.88, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    gl.useProgram(program);

    const eye = getCameraPosition();
    const view = mat4LookAt(eye, camera.target, [0, 1, 0]);
    
    // Проверяем, что canvas имеет валидные размеры
    const aspect = canvas.width / canvas.height;
    if (!isFinite(aspect) || aspect <= 0) {
      requestAnimationFrame(render);
      return;
    }
    
    const proj = mat4Perspective(
      (55 * Math.PI) / 180,
      aspect,
      0.1,
      10000, // Увеличена дальность обзора для видимости всего большого пола
    );
    const viewProj = mat4Multiply(proj, view);
    gl.uniformMatrix4fv(uniforms.viewProj, false, new Float32Array(viewProj));
    gl.uniform3f(uniforms.lightDir, -0.3, -1.0, -0.2);
    // Макет только первого этажа — отключаем межэтажные полосы
    gl.uniform1f(uniforms.floorStep, 0.0);
    gl.uniform1f(uniforms.floorBand, 0.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.tex, 0);

    if (showPlan) {
      gl.disable(gl.DEPTH_TEST);
      if (floorGPU && floorGPU.count > 0) {
        drawMesh(floorGPU, false);
      }
      gl.enable(gl.DEPTH_TEST);
      // Рисуем сетку поверх пола для ориентации в размерах
      if (gridGPU && gridGPU.count > 0) {
        drawMesh(gridGPU, false);
      }
    }
    // Рисуем все загруженные модели
    for (let i = 0; i < buildingGPUs.length; i++) {
      if (buildingGPUs[i] && buildingGPUs[i].count > 0) {
        drawMesh(buildingGPUs[i], false);
      }
    }
    if (wallsGPU && wallsGPU.count > 0) {
      drawMesh(wallsGPU, false);
    }
    if (roomsGPU && roomsGPU.count > 0) {
      drawMesh(roomsGPU, false);
    }

    requestAnimationFrame(render);
  } catch (error) {
    console.error("Ошибка в функции render:", error);
    // Не перезагружаем страницу, просто останавливаем рендеринг
    // requestAnimationFrame(render); // Закомментировано, чтобы не было бесконечного цикла ошибок
  }
}

// Экспорт модели в OBJ формат
function exportToOBJ() {
  const mesh = buildingMesh;
  const positions = mesh.positions;
  const vertexCount = positions.length / 3;

  let objContent = "# Exported 3D Building Model\n";
  objContent += `# Vertices: ${vertexCount}\n\n`;

  // Выводим все вершины
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    objContent += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}\n`;
  }

  objContent += "\n";

  // Выводим грани (треугольники)
  for (let i = 0; i < vertexCount; i += 3) {
    const v1 = i + 1; // OBJ индексы начинаются с 1
    const v2 = i + 2;
    const v3 = i + 3;
    objContent += `f ${v1} ${v2} ${v3}\n`;
  }

  // Скачиваем файл
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

function exportPositions() {
  const payload = {};
  // Экспортируем позиции всех загруженных моделей
  for (let i = 0; i < buildingMeshes.length; i++) {
    const modelKey = `model${i + 1}`;
    if (modelOffsets[modelKey] && modelRotations[modelKey]) {
      payload[modelKey] = {
        offset: { ...modelOffsets[modelKey] },
        rotation: { ...modelRotations[modelKey] },
        file: modelFiles[i] || `models/model${i + 1}.obj`
      };
    }
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

// Кнопка экспорта
const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", exportToOBJ);
}

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

const togglePlanBtn = document.getElementById("togglePlanBtn");
if (togglePlanBtn) {
  togglePlanBtn.addEventListener("click", () => {
    showPlan = !showPlan;
    togglePlanBtn.textContent = showPlan ? "Hide Plan" : "Show Plan";
  });
}

// Глобальный обработчик ошибок для предотвращения перезагрузки страницы
window.addEventListener("error", (event) => {
  console.error("Глобальная ошибка:", event.error);
  event.preventDefault(); // Предотвращаем перезагрузку страницы
  return false;
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Необработанное обещание:", event.reason);
  event.preventDefault(); // Предотвращаем перезагрузку страницы
});

render();
