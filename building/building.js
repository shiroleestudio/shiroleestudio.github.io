// 시로의 집 — 3D 건물 뼈대 (2026-10-26, 두호 승인)
// 1층 찻집 · 2층 갤러리(화실+공방) · 3층 천문대·루프탑·놀이방.
// 이 파일은 "구조"만 잡는다: 상자 모델, 가로 회전, 카메라 쪽 벽 숨김, 방 라벨(HTML 링크), 층 고르기.
// 그림체(수채·툰·외곽선·종이 결)와 glTF 모델, 캐릭터는 다음 단계. TODO(character-sheet).
// 외부 스크립트 없음: three.js 는 ../assets/vendor/three/ 에 둔 사본.
import * as THREE from '../assets/vendor/three/three.module.min.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const labelLayer = document.getElementById('labels');
const floorButtons = [...document.querySelectorAll('[data-floor]')];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---- 색: 사이트 토큰을 그대로 읽는다 (라이트/다크 둘 다) ----
function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}
function palette() {
  return {
    paper: cssColor('--paper', '#e2dbc8'),
    ink: cssColor('--ink', '#3a2c22'),
    wood: cssColor('--wood', '#4e3b2d'),
    wood2: cssColor('--wood-2', '#33251c'),
    cream: cssColor('--cream', '#e9e2d0'),
    green: cssColor('--green', '#4a5e4f'),
    night: cssColor('--night', '#2b3240'),
    rule: cssColor('--rule', '#bfb39b'),
  };
}
let P = palette();

// ---- 방 ↔ 링크 (두호 2026-10-26 층 구성; 배치표는 확정 전 제안) ----
// pos: 건물 좌표 (x: 가로 -5..5, y: 높이, z: 깊이 -4..4). 라벨은 이 점 위에 붙는다.
const FLOOR_H = 3;
const ROOMS = [
  { floor: 1, id: 'cafe',    name: '찻집 · 커피 레시피', note: '테이블에서 시로가 커피를 내려요', href: 'https://shiroleestudio.github.io/coffee/', pos: [-2.2, 1.2, 1.2] },
  { floor: 1, id: 'counter', name: '카운터 · 문의',       note: '버그 신고, 제안은 여기로',          href: '../support/',  pos: [2.6, 1.3, -1.8] },
  { floor: 1, id: 'board',   name: '칠판 · 소식',         note: '오늘의 메뉴처럼 새 소식',          href: '../news/',     pos: [0, 2.4, -3.6] },
  { floor: 2, id: 'atelier', name: '화실 · 타임라인',     note: '벽에 길게 걸린 역사 연표',        href: '../works/timeline/', pos: [-2.6, FLOOR_H + 1.6, -1.5] },
  { floor: 2, id: 'shop',    name: '공방 · 실험실',       note: '작업대 위의 메모함과 작은 도구들', href: '../works/#lab', pos: [2.4, FLOOR_H + 1.2, 1.2] },
  { floor: 2, id: 'desk',    name: '작업 노트 · 시로 이야기', note: '스튜디오가 생긴 이야기',    href: '../about/',    pos: [2.6, FLOOR_H + 1.0, -2.4] },
  { floor: 3, id: 'dome',    name: '천문대 · 우주 작품',  note: '지붕 창 밖으로 나온 망원경',      href: '../works/',    pos: [-2.4, FLOOR_H * 2 + 2.6, -1.6] },
  { floor: 3, id: 'play',    name: '놀이방 · 스페이스서퍼', note: '장난감 로켓과 블록',          href: '../works/space-surfer/', pos: [2.4, FLOOR_H * 2 + 1.2, 1.4] },
  { floor: 3, id: 'roof',    name: '루프탑 · 시로 채널',  note: '밤하늘을 보는 자리, 유튜브',       href: 'https://www.youtube.com/@shiroleebunny', pos: [-2.0, FLOOR_H * 2 + 1.0, 2.8] },
];

// ---- 렌더러 · 장면 · 카메라 ----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const TARGET = new THREE.Vector3(0, 4.6, 0);
let yaw = -0.6;            // 가로 회전만 (두호: 폰에서 잡고 돌리기)
let yawVel = 0;
const PITCH = 0.42;        // 고정 높이각 — 도감의 비스듬한 부감
let radius = 23;
let targetY = TARGET.y;

scene.add(new THREE.HemisphereLight(0xfff6e4, 0x8a7a66, 1.1));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.2);
sun.position.set(6, 12, 8);
scene.add(sun);

// 3단계 톤 그라데이션 — 수채처럼 명암을 끊는다 (그림체 작업의 출발점)
const tone = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1);
tone.minFilter = tone.magFilter = THREE.NearestFilter;
tone.needsUpdate = true;
const mats = {};
function mat(key, color) {
  if (!mats[key]) mats[key] = new THREE.MeshToonMaterial({ color, gradientMap: tone, transparent: true });
  return mats[key];
}
const outlineMat = new THREE.MeshBasicMaterial({ color: P.ink, side: THREE.BackSide, transparent: true });

const building = new THREE.Group();
scene.add(building);
const walls = [];      // { mesh, normal, floor }
const floorGroups = {};
const pickables = [];  // 클릭 → 링크

function box(w, h, d, color, x, y, z, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat(color.getHexString(), color));
  m.position.set(x, y + h / 2, z);
  if (opts.outline !== false) {
    const o = new THREE.Mesh(geo, outlineMat);
    o.scale.set(1 + 0.05 / w, 1 + 0.05 / h, 1 + 0.05 / d); // 뒤집은 껍질로 잉크 외곽선

    m.add(o);
  }
  return m;
}
function cyl(r, h, color, x, y, z, seg = 24) {
  const geo = new THREE.CylinderGeometry(r, r, h, seg);
  const m = new THREE.Mesh(geo, mat(color.getHexString(), color));
  m.position.set(x, y + h / 2, z);
  const o = new THREE.Mesh(geo, outlineMat);
  o.scale.set(1 + 0.05 / r, 1 + 0.05 / h, 1 + 0.05 / r);
  m.add(o);
  return m;
}

const W = 10, D = 8, T = 0.25; // 가로 · 깊이 · 벽 두께
function buildFloor(n) {
  const g = new THREE.Group();
  const y0 = (n - 1) * FLOOR_H;
  g.add(box(W, T, D, P.rule, 0, y0, 0));                       // 바닥 (연한 나무색 = --rule)
  const h = n === 3 ? FLOOR_H * 0.9 : FLOOR_H;
  const wallColor = P.cream;
  const specs = [
    { size: [W, h, T], pos: [0, y0, -D / 2 + T / 2], normal: [0, 0, -1] },
    { size: [W, h, T], pos: [0, y0, D / 2 - T / 2],  normal: [0, 0, 1] },
    { size: [T, h, D], pos: [-W / 2 + T / 2, y0, 0], normal: [-1, 0, 0] },
    { size: [T, h, D], pos: [W / 2 - T / 2, y0, 0],  normal: [1, 0, 0] },
  ];
  for (const s of specs) {
    if (n === 3 && s.normal[2] === 1) continue;                 // 3층 앞은 루프탑(벽 없음)
    const m = box(...s.size, wallColor, ...s.pos);
    m.material = m.material.clone();                            // 벽마다 투명도를 따로
    m.children[0].material = outlineMat.clone();
    g.add(m);
    walls.push({ mesh: m, normal: new THREE.Vector3(...s.normal), floor: n });
  }
  floorGroups[n] = g;
  building.add(g);
  return { g, y0 };
}

// 1층 찻집
{
  const { g, y0 } = buildFloor(1);
  g.add(box(3.2, 1.0, 0.9, P.wood2, 2.6, y0, -1.8));            // 카운터
  for (const [x, z] of [[-3.2, 1.2], [-1.2, 1.2], [-2.2, -1.4]]) {
    g.add(cyl(0.55, 0.08, P.wood, x, y0 + 0.8, z));             // 둥근 테이블
    g.add(cyl(0.08, 0.8, P.wood2, x, y0, z, 10));
    g.add(cyl(0.16, 0.14, P.cream, x + 0.2, y0 + 0.88, z - 0.1, 12)); // 커피잔
  }
  g.add(box(3.4, 1.6, 0.08, P.night, 0, y0 + 1.3, -D / 2 + T + 0.04)); // 칠판
  // TODO(character-sheet): 시로 임시 표현 — 카운터 뒤 (캡슐 + 귀 두 개)
  g.add(cyl(0.32, 0.7, P.cream, 2.6, y0, -2.6, 16));
  g.add(cyl(0.08, 0.5, P.cream, 2.48, y0 + 0.7, -2.6, 8));
  g.add(cyl(0.08, 0.5, P.cream, 2.72, y0 + 0.7, -2.6, 8));
}
// 2층 갤러리: 화실 + 공방
{
  const { g, y0 } = buildFloor(2);
  g.add(box(0.06, 1.4, 4.2, P.paper, -W / 2 + T + 0.04, y0 + 1.0, -1.0)); // 벽에 걸린 긴 연표
  g.add(box(0.9, 1.5, 0.08, P.paper, -2.6, y0 + 0.6, -1.5));    // 이젤 위 그림
  g.add(box(0.08, 1.7, 0.08, P.wood2, -2.6, y0, -1.2));
  g.add(box(2.8, 0.9, 1.1, P.wood2, 2.4, y0, 1.2));             // 작업대
  g.add(box(2.6, 0.5, 0.9, P.wood, 2.6, y0, -2.4));             // 작은 책상(노트)
  g.add(box(0.7, 0.05, 0.5, P.paper, 2.6, y0 + 0.5, -2.4));
  // TODO(character-sheet): 카피바라씨 임시 표현 — 작업대 옆
  g.add(cyl(0.34, 0.75, P.wood, 2.4, y0, 2.4, 16));
}
// 3층: 천문대 + 놀이방 + 루프탑
{
  const { g, y0 } = buildFloor(3);
  g.add(box(T, FLOOR_H * 0.9, 3.4, P.cream, 0, y0, -2.3));        // 천문대 / 놀이방 칸막이
  g.add(box(W, 0.3, D * 0.55, P.wood2, 0, y0 + FLOOR_H * 0.9, -D * 0.225)); // 지붕
  // 데포르메 망원경: 지붕 창을 뚫고 나와 비스듬히 하늘을 본다
  const tel = cyl(0.42, 3.0, P.green, 0, 0, 0, 18);
  tel.position.set(-2.4, y0 + FLOOR_H * 0.9 + 0.9, -1.6);
  tel.rotation.z = 0.9; tel.rotation.x = -0.35;
  g.add(tel);
  g.add(cyl(0.95, 0.5, P.wood, -2.4, y0 + FLOOR_H * 0.9 + 0.3, -1.6, 20)); // 지붕 위 둥근 창틀
  // 놀이방: 체크 카펫, 블록, 장난감 로켓
  g.add(box(3.0, 0.04, 2.4, P.green, 2.4, y0 + T / 2, 1.4));
  for (const [x, z, c] of [[1.6, 0.9, P.cream], [2.1, 0.9, P.wood], [1.85, 0.9, P.green]]) g.add(box(0.4, 0.4, 0.4, c, x, y0 + T / 2 + (c === P.green ? 0.4 : 0), z));
  g.add(cyl(0.25, 1.1, P.cream, 3.2, y0 + T / 2, 2.0, 12));
  g.add(cyl(0.1, 0.4, P.wood2, 3.2, y0 + T / 2 + 1.1, 2.0, 8));
  // 루프탑: 의자 둘, 담요
  g.add(box(0.7, 0.4, 0.7, P.wood2, -2.6, y0 + T / 2, 2.6));
  g.add(box(0.7, 0.4, 0.7, P.wood2, -1.4, y0 + T / 2, 2.6));
  g.add(box(0.7, 0.5, 0.1, P.wood2, -2.6, y0 + T / 2 + 0.4, 2.95));
  // TODO(character-sheet): 코알라씨 임시 표현 — 루프탑 의자
  g.add(cyl(0.3, 0.6, P.rule, -1.4, y0 + T / 2 + 0.4, 2.6, 16));
}
// 땅
scene.add(box(W + 6, 0.2, D + 6, P.paper, 0, -0.2, 0, { outline: false }));

// 클릭 영역: 방마다 보이지 않는 상자 (라벨과 같은 링크)
for (const r of ROOMS) {
  const hit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 2.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(r.pos[0], r.pos[1], r.pos[2]);
  hit.userData.room = r;
  floorGroups[r.floor].add(hit);
  pickables.push(hit);
}

// ---- 라벨: 도감의 인출선처럼, HTML 로 (글자가 선명하고 그 자체가 링크) ----
const labelEls = ROOMS.map((r) => {
  const a = document.createElement('a');
  a.className = 'callout';
  a.href = r.href;
  if (r.href.startsWith('http')) a.rel = 'noopener';
  a.innerHTML = `<span class="pin"></span><span class="txt"><b>${r.name}</b><small>${r.note}</small></span>`;
  labelLayer.appendChild(a);
  return a;
});

// ---- 층 고르기: 그 층 위는 지붕처럼 걷어낸다 (모형집) ----
let shownUpTo = 3;
function showFloors(n) {
  shownUpTo = n;
  for (const k of [1, 2, 3]) floorGroups[k].visible = k <= n;
  targetY = n === 3 ? 4.6 : n === 2 ? 3.2 : 1.6;
  for (const b of floorButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.floor) === n));
}
for (const b of floorButtons) b.addEventListener('click', () => showFloors(Number(b.dataset.floor)));
showFloors(3);

// ---- 입력: 가로 드래그 회전, 탭 → 방 링크 ----
let dragging = false, lastX = 0, moved = 0, downAt = 0;
stage.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; moved = 0; downAt = performance.now(); yawVel = 0; stage.setPointerCapture(e.pointerId); });
stage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
  const d = -dx * 0.008; yaw += d; yawVel = d;
});
stage.addEventListener('pointerup', (e) => {
  dragging = false;
  if (moved < 6 && performance.now() - downAt < 400 && e.target === canvas) pick(e);
});
stage.addEventListener('pointercancel', () => { dragging = false; });
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
function pick(e) {
  const b = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables.filter((m) => m.parent.visible), false)[0];
  if (hit) location.href = hit.object.userData.room.href;
}

// ---- 크기 ----
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  radius = w < 480 ? 27 : 23;
}
new ResizeObserver(resize).observe(stage);
resize();

// 테마가 바뀌면 색을 다시 읽는다
function recolor() {
  P = palette();
  outlineMat.color.copy(P.ink);
  for (const wl of walls) { wl.mesh.material.color.copy(P.cream); wl.mesh.children[0].material.color.copy(P.ink); }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);

// ---- 매 프레임 ----
const camDir = new THREE.Vector3(); const v = new THREE.Vector3();
function frame() {
  if (!dragging) {
    yaw += yawVel; yawVel *= 0.92;
    if (!reduceMotion.matches && Math.abs(yawVel) < 0.0005) yaw += 0.0012; // 가만히 두면 천천히 돈다
  }
  TARGET.y += (targetY - TARGET.y) * 0.08;
  camera.position.set(TARGET.x + radius * Math.cos(PITCH) * Math.sin(yaw), TARGET.y + radius * Math.sin(PITCH), TARGET.z + radius * Math.cos(PITCH) * Math.cos(yaw));
  camera.lookAt(TARGET);
  camDir.subVectors(camera.position, TARGET).setY(0).normalize();

  // 카메라를 향한 벽은 걷어낸다 (단면)
  for (const wl of walls) {
    const facing = wl.normal.dot(camDir);
    const want = facing > 0.2 ? 0 : 1;
    const m = wl.mesh.material; m.opacity += (want - m.opacity) * 0.2;
    wl.mesh.visible = m.opacity > 0.03;
    wl.mesh.children[0].material.opacity = m.opacity;
  }
  renderer.render(scene, camera);

  // 라벨 위치 — 뒤쪽(카메라 반대편) 방의 라벨은 접는다
  const b = canvas.getBoundingClientRect();
  ROOMS.forEach((r, i) => {
    const el = labelEls[i];
    if (r.floor > shownUpTo) { el.hidden = true; return; }
    v.set(r.pos[0], r.pos[1], r.pos[2]);
    const side = v.clone().setY(0).normalize().dot(camDir);
    v.project(camera);
    const x = (v.x * 0.5 + 0.5) * b.width, y = (-v.y * 0.5 + 0.5) * b.height;
    el.hidden = side < -0.35;
    const flip = x > b.width * 0.62;                       // 오른쪽 가장자리면 왼쪽으로 펼친다
    el.classList.toggle('flip', flip);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${flip ? ' translateX(-100%)' : ''}`;
    el.style.zIndex = String(Math.round((1 - v.z) * 1000));
  });
  requestAnimationFrame(frame);
}
frame();
