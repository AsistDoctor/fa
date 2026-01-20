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
    float light = max(dot(normal, -u_lightDir), 0.15);
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

function addPlane(mesh, size, color) {
  const s = size / 2;
  const data = [
    // posX, posY, posZ,   u, v
    -s, 0, -s, 0, 0,
    s, 0, -s, 1, 0,
    s, 0, s, 1, 1,

    -s, 0, -s, 0, 0,
    s, 0, s, 1, 1,
    -s, 0, s, 0, 1,
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

// Размер квадрата с планом (остаётся 220, но вынесен в константу для удобства)
const PLAN_SIZE = 220;

const floorMesh = createMesh();
addPlane(floorMesh, PLAN_SIZE, [0.6, 0.6, 0.6]);

// ----- Загрузка модели из OBJ файла -----
const buildingMesh = createMesh();
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
async function loadOBJModel(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.split("\n");

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

    // Выравниваем модель по полу + небольшой зазор (1-2% от размера плана)
    const offsetY = -minY * scale + PLAN_SIZE * 0.02;

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
        buildingMesh.positions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
        buildingMesh.normals.push(
          normalX, normalY, normalZ,
          normalX, normalY, normalZ,
          normalX, normalY, normalZ,
        );
        buildingMesh.colors.push(...color, ...color, ...color);
        buildingMesh.uvs.push(0, 0, 0, 0, 0, 0);
      }
    }

    // Проверяем, что созданы треугольники
    const triangleCount = buildingMesh.positions.length / 3;
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
// buildingGPU будет создан после загрузки OBJ
let buildingGPU = uploadMesh(buildingMesh); // временно пустой
const wallsGPU = uploadMesh(wallsMesh);
const roomsGPU = uploadMesh(roomsMesh);

let showPlan = true;

// Загружаем модель из OBJ файла и обновляем buildingGPU
if (USE_OBJ_MODEL) {
  loadOBJModel("building_model (3).obj").then((success) => {
    if (success) {
      modelLoaded = true;
      if (buildingGPU.buffers) {
        buildingGPU.buffers.forEach((buf) => gl.deleteBuffer(buf));
      }
      const newBuildingGPU = uploadMesh(buildingMesh);
      buildingGPU.vao = newBuildingGPU.vao;
      buildingGPU.count = newBuildingGPU.count;
      buildingGPU.buffers = newBuildingGPU.buffers;
      console.log("Модель загружена и готова к отображению");
    }
  });
}

const texture = gl.createTexture();
let textureLoaded = false;
const planCandidates = [
  "assets/plan.jpg",
  "assets/plan.jpeg",
  "assets/plan.png",
  "assets/plan.webp",
];

function tryLoadPlan(index) {
  if (index >= planCandidates.length) {
    showError(
      'Не найден файл чертежа. Положи его в "assets" как plan.jpg/png/jpeg/webp.',
    );
    return;
  }
  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    // Настройка для NPOT‑текстур (любого размера)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureLoaded = true;
  };
  image.onerror = () => {
    tryLoadPlan(index + 1);
  };
  image.src = planCandidates[index];
}

tryLoadPlan(0);

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

canvas.addEventListener("mousedown", (event) => {
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
  const maxPitch = 1.5; // почти вертикально сверху
  if (camera.pitch < minPitch) camera.pitch = minPitch;
  if (camera.pitch > maxPitch) camera.pitch = maxPitch;
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  camera.distance += event.deltaY * 0.2;
  camera.distance = Math.max(60, Math.min(320, camera.distance));
});

// Быстрый "рестарт камеры" по клавише R, если уехал в космос
window.addEventListener("keydown", (event) => {
  if (event.key === "r" || event.key === "R") {
    camera.target = [0, 2, -10];
    camera.distance = 240;
    camera.yaw = Math.PI / 4;
    camera.pitch = 0.9;
  }
});

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
  if (mesh.vao) {
    gl.bindVertexArray(mesh.vao);
  } else {
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
}

function render() {
  gl.clearColor(0.88, 0.88, 0.88, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  gl.useProgram(program);

  const eye = getCameraPosition();
  const view = mat4LookAt(eye, camera.target, [0, 1, 0]);
  const proj = mat4Perspective(
    (55 * Math.PI) / 180,
    canvas.width / canvas.height,
    0.1,
    1000,
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
    drawMesh(floorGPU, textureLoaded);
  }
  drawMesh(buildingGPU, false);
  drawMesh(wallsGPU, false);
  drawMesh(roomsGPU, false);

  requestAnimationFrame(render);
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

// Кнопка экспорта
const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", exportToOBJ);
}

const togglePlanBtn = document.getElementById("togglePlanBtn");
if (togglePlanBtn) {
  togglePlanBtn.addEventListener("click", () => {
    showPlan = !showPlan;
    togglePlanBtn.textContent = showPlan ? "Hide Plan" : "Show Plan";
  });
}

render();
