const SIZE = 72;
const STEP = 76;
const FACES = [
  { id: "f", normal: { x: 0, y: 0, z: 1 } },
  { id: "b", normal: { x: 0, y: 0, z: -1 } },
  { id: "r", normal: { x: 1, y: 0, z: 0 } },
  { id: "l", normal: { x: -1, y: 0, z: 0 } },
  { id: "u", normal: { x: 0, y: -1, z: 0 } },
  { id: "d", normal: { x: 0, y: 1, z: 0 } },
];

const COLORS = {
  f: "green",
  b: "blue",
  r: "red",
  l: "orange",
  u: "white",
  d: "yellow",
};

const STORAGE_KEY = "mb05-rubiks-cube";

const cubeEl = document.getElementById("cube");
const pivotEl = document.getElementById("pivot");
const stageEl = document.getElementById("stage");
const movesEl = document.getElementById("moves");
const scrambleBtn = document.getElementById("scrambleBtn");
const undoBtn = document.getElementById("undoBtn");
const resetBtn = document.getElementById("resetBtn");
const resetModal = document.getElementById("resetModal");
const confirmResetBtn = document.getElementById("confirmResetBtn");
const cancelResetBtn = document.getElementById("cancelResetBtn");

const cubies = [];
let orbitX = -22;
let orbitY = -32;
let animating = false;
let history = [];
let moveLabels = [];

function identity() {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

function mul(a, b) {
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      c[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return c;
}

function mulVec(m, v) {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}

function rotMat(axis, quarter) {
  const a = (quarter * Math.PI) / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (axis === "x") {
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c],
    ];
  }
  if (axis === "y") {
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c],
    ];
  }
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

function rx(deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

function ry(deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

function toMatrix3d(m) {
  return `matrix3d(${m[0][0]},${m[1][0]},${m[2][0]},0,${m[0][1]},${m[1][1]},${m[2][1]},0,${m[0][2]},${m[1][2]},${m[2][2]},0,0,0,0,1)`;
}

function roundCoord(n) {
  return Math.round(n);
}

function axisCoord(pos, axis) {
  return roundCoord(pos[axis]);
}

function stickerColor(face, x, y, z) {
  if (face === "r" && x === 1) return COLORS.r;
  if (face === "l" && x === -1) return COLORS.l;
  if (face === "u" && y === -1) return COLORS.u;
  if (face === "d" && y === 1) return COLORS.d;
  if (face === "f" && z === 1) return COLORS.f;
  if (face === "b" && z === -1) return COLORS.b;
  return "";
}

function applyCubieTransform(cubie) {
  const { x, y, z } = cubie.pos;
  cubie.el.style.transform = `translate3d(${x * STEP}px, ${y * STEP}px, ${z * STEP}px) ${toMatrix3d(cubie.rot)}`;
}

function updateOrbit() {
  cubeEl.style.transform = `rotateX(${orbitX}deg) rotateY(${orbitY}deg)`;
}

function createCubie(x, y, z) {
  const el = document.createElement("div");
  el.className = "cubie";

  FACES.forEach((face) => {
    const faceEl = document.createElement("div");
    faceEl.className = `face ${face.id}`;
    const sticker = document.createElement("div");
    const color = stickerColor(face.id, x, y, z);
    sticker.className = color ? `sticker ${color}` : "sticker";
    faceEl.appendChild(sticker);
    faceEl.dataset.face = face.id;
    el.appendChild(faceEl);
  });

  const cubie = {
    el,
    origin: { x, y, z },
    pos: { x, y, z },
    rot: identity(),
  };
  el.addEventListener("pointerdown", (event) => onCubiePointerDown(event, cubie));
  cubeEl.appendChild(el);
  applyCubieTransform(cubie);
  cubies.push(cubie);
}

function buildCube() {
  cubies.length = 0;
  cubeEl.querySelectorAll(".cubie").forEach((node) => node.remove());
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x === 0 && y === 0 && z === 0) continue;
        createCubie(x, y, z);
      }
    }
  }
  updateOrbit();
}

function layerCubies(axis, layer) {
  return cubies.filter((cubie) => axisCoord(cubie.pos, axis) === layer);
}

function moveName(axis, layer, dir) {
  const map = {
    x: { "-1": "L", "1": "R", "0": "M" },
    y: { "-1": "U", "1": "D", "0": "E" },
    z: { "-1": "B", "1": "F", "0": "S" },
  };
  let name = map[axis][String(layer)];
  const inverted =
    (axis === "x" && layer === 1) ||
    (axis === "y" && layer === -1) ||
    (axis === "z" && layer === 1);
  let turns = dir;
  if (inverted) turns = -turns;
  if (name === "M" || name === "E" || name === "S") {
    /* slice names already follow world axes */
  }
  if (turns === -1) return `${name}'`;
  if (turns === 2 || turns === -2) return `${name}2`;
  return name;
}

function renderMoves() {
  movesEl.textContent = moveLabels.join("  ");
}

function setBusy(busy) {
  animating = busy;
  scrambleBtn.disabled = busy;
  undoBtn.disabled = busy || history.length === 0;
  resetBtn.disabled = busy;
}

function rotateLayer(axis, layer, dir, { record = true, duration = 220 } = {}) {
  if (animating) return Promise.resolve();
  const group = layerCubies(axis, layer);
  if (!group.length) return Promise.resolve();

  setBusy(true);
  group.forEach((cubie) => pivotEl.appendChild(cubie.el));

  const deg = dir * 90;
  const rotate =
    axis === "x" ? `rotateX(${deg}deg)` : axis === "y" ? `rotateY(${deg}deg)` : `rotateZ(${deg}deg)`;

  pivotEl.style.transition = "none";
  pivotEl.style.transform = "none";
  void pivotEl.offsetWidth;
  pivotEl.style.transition = `transform ${duration}ms cubic-bezier(.2,.7,.2,1)`;
  pivotEl.style.transform = rotate;

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pivotEl.removeEventListener("transitionend", onEnd);
      const R = rotMat(axis, dir);
      group.forEach((cubie) => {
        cubie.pos = {
          x: roundCoord(mulVec(R, cubie.pos).x),
          y: roundCoord(mulVec(R, cubie.pos).y),
          z: roundCoord(mulVec(R, cubie.pos).z),
        };
        cubie.rot = mul(R, cubie.rot);
        cubeEl.appendChild(cubie.el);
        applyCubieTransform(cubie);
      });
      pivotEl.style.transition = "none";
      pivotEl.style.transform = "none";
      if (record) {
        history.push({ axis, layer, dir });
        moveLabels.push(moveName(axis, layer, dir));
        renderMoves();
      }
      setBusy(false);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target !== pivotEl) return;
      finish();
    };
    pivotEl.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, duration + 80);
  });
}

function nearestAxis(v) {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return { axis: "x", sign: v.x >= 0 ? 1 : -1, vec: { x: Math.sign(v.x) || 1, y: 0, z: 0 } };
  if (ay >= az) return { axis: "y", sign: v.y >= 0 ? 1 : -1, vec: { x: 0, y: Math.sign(v.y) || 1, z: 0 } };
  return { axis: "z", sign: v.z >= 0 ? 1 : -1, vec: { x: 0, y: 0, z: Math.sign(v.z) || 1 } };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function projectToScreen(v) {
  const world = mulVec(rx(orbitX), mulVec(ry(orbitY), v));
  return { x: world.x, y: world.y };
}

function cubieNormal(cubie, faceId) {
  const face = FACES.find((item) => item.id === faceId);
  return mulVec(cubie.rot, face.normal);
}

let drag = null;

function onCubiePointerDown(event, cubie) {
  if (animating) return;
  const faceEl = event.target.closest(".face");
  if (!faceEl) return;
  event.stopPropagation();
  event.preventDefault();
  drag = {
    type: "layer",
    pointerId: event.pointerId,
    cubie,
    face: faceEl.dataset.face,
    startX: event.clientX,
    startY: event.clientY,
    decided: false,
  };
  stageEl.setPointerCapture(event.pointerId);
}

function onStagePointerDown(event) {
  if (animating) return;
  if (event.target.closest(".cubie")) return;
  drag = {
    type: "orbit",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    orbitX,
    orbitY,
  };
  stageEl.classList.add("dragging");
  stageEl.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;

  if (drag.type === "orbit") {
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    orbitY = drag.orbitY + dx * 0.4;
    orbitX = Math.max(-75, Math.min(75, drag.orbitX - dy * 0.4));
    updateOrbit();
    return;
  }

  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (drag.decided || dx * dx + dy * dy < 64) return;

  const n = nearestAxis(cubieNormal(drag.cubie, drag.face)).vec;
  const axes = ["x", "y", "z"].filter((axis) => Math.abs(n[axis]) < 0.5);
  const screenDrag = { x: dx, y: dy, z: 0 };

  let best = null;
  axes.forEach((axis) => {
    [-1, 1].forEach((sign) => {
      const a = { x: 0, y: 0, z: 0 };
      a[axis] = sign;
      const motion = projectToScreen(cross(a, n));
      const score = motion.x * screenDrag.x + motion.y * screenDrag.y;
      if (!best || score > best.score) {
        best = { axis, dir: sign, score };
      }
    });
  });

  if (!best || best.score < 8) return;
  drag.decided = true;
  const layer = axisCoord(drag.cubie.pos, best.axis);
  rotateLayer(best.axis, layer, best.dir);
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag = null;
  stageEl.classList.remove("dragging");
}

async function scramble() {
  if (animating) return;
  const axes = ["x", "y", "z"];
    const layers = [-1, 1];
  const dirs = [-1, 1];
  let last = null;
  moveLabels = [];
  history = [];
  renderMoves();
  for (let i = 0; i < 25; i += 1) {
    let axis;
    let layer;
    let dir;
    do {
      axis = axes[Math.floor(Math.random() * axes.length)];
      layer = layers[Math.floor(Math.random() * layers.length)];
      dir = dirs[Math.floor(Math.random() * dirs.length)];
    } while (last && last.axis === axis && last.layer === layer);
    last = { axis, layer, dir };
    await rotateLayer(axis, layer, dir, { duration: 110 });
  }
}

function resetCube() {
  if (animating) return;
  cubies.forEach((cubie) => {
    cubie.pos = { ...cubie.origin };
    cubie.rot = identity();
    applyCubieTransform(cubie);
  });
  history = [];
  moveLabels = [];
  renderMoves();
  undoBtn.disabled = true;
}

async function undo() {
  if (animating || !history.length) return;
  const last = history.pop();
  moveLabels.pop();
  renderMoves();
  await rotateLayer(last.axis, last.layer, -last.dir, { record: false });
}

const KEY_MOVES = {
  u: { axis: "y", layer: -1, dir: -1 },
  d: { axis: "y", layer: 1, dir: -1 },
  l: { axis: "x", layer: -1, dir: 1 },
  r: { axis: "x", layer: 1, dir: -1 },
  f: { axis: "z", layer: 1, dir: -1 },
  b: { axis: "z", layer: -1, dir: 1 },
  e: { axis: "y", layer: 0, dir: -1 },
  m: { axis: "x", layer: 0, dir: 1 },
  s: { axis: "z", layer: 0, dir: -1 },
};

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea")) return;
  const key = event.key.toLowerCase();
  if (key === " ") {
    event.preventDefault();
    scramble();
    return;
  }
  const move = KEY_MOVES[key];
  if (!move) return;
  event.preventDefault();
  const dir = event.shiftKey ? -move.dir : move.dir;
  rotateLayer(move.axis, move.layer, dir);
});

stageEl.addEventListener("pointerdown", onStagePointerDown);
stageEl.addEventListener("pointermove", onPointerMove);
stageEl.addEventListener("pointerup", onPointerUp);
stageEl.addEventListener("pointercancel", onPointerUp);
scrambleBtn.addEventListener("click", scramble);
resetBtn.addEventListener("click", resetCube);
undoBtn.addEventListener("click", undo);

buildCube();
undoBtn.disabled = true;
