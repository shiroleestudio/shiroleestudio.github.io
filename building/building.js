// 시로의 집 — 3D 건물 (2026-10-26)
// 허브 첫 화면(/)의 주인공. 1층 찻집 · 2층 갤러리(화실+공방) · 3층 다락(놀이방·천문대) + 루프탑. 지붕 위 돔에서 망원경이 나온다.
// 모델: house.glb (model/build_house.py 로 Blender 에서 만든다. 콘셉트 그림은 두호의 나노바나나 초안).
// 그림체: 툰 4단 명암 + 구운 구석 그늘(모델 정점색) + 해 그림자 + 화면 공간 잉크 외곽선 + 종이 결. 색은 모델 재질 색, 배경은 site.css 토큰.
// 손가락을 따라 상하·좌우로 돈다. 카메라를 향한 벽·지붕은 걷어 낸다(단면). 방 이름표는 건물 밖 양옆에 세우고 인출선으로 잇는다(HTML 링크).
// 기본은 1인칭 걷기(두호 2026-11-23: 게임처럼 이용하는 사이트): 마당에서 시작해 현관으로 들어가고, 서쪽 벽 계단으로 2층·루프탑, 바깥 돌계단으로 지하실에 간다 (아래 '1인칭 걷기').
// '둘러보기' 단추로 예전의 돌려 보는 모드(층 떼어 보기·확대)가 된다.
// 캐릭터는 아직 없다. TODO(character-sheet).
import * as THREE from 'three';
import { GLTFLoader } from '../assets/vendor/three/addons/loaders/GLTFLoader.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const labelLayer = document.getElementById('labels');
const floorButtons = [...document.querySelectorAll('[data-floor]')];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

// 방 ↔ 링크. 위치는 모델의 anchor_<id> 가 정한다.
const ROOMS = [
  { id: 'cafe',    floor: 1, name: '찻집 · 커피 레시피',     note: '시로가 커피를 내리는 자리', href: 'https://coffee.shiroleestudio.com/' },
  { id: 'counter', floor: 1, name: '카운터 · 문의',          note: '버그 신고, 제안은 여기로', href: 'support/' },
  { id: 'board',   floor: 1, name: '칠판 · 소식',            note: '오늘의 메뉴처럼 새 소식', href: 'news/' },
  { id: 'atelier', floor: 2, name: '화실 · 타임라인',        note: '벽에 길게 걸린 역사 연표', href: 'works/timeline/' },
  { id: 'shop',    floor: 2, name: '공방 · 실험실',          note: '작업대 위의 작은 도구들', href: 'works/#lab' },
  { id: 'desk',    floor: 2, name: '작업 노트 · 시로 이야기', note: '스튜디오가 생긴 이야기', href: 'about/' },
  { id: 'dome',    floor: 3, name: '천문대 · 우주 작품',     note: '지붕 위 돔의 망원경', href: 'works/' },
  { id: 'play',    floor: 3, name: '놀이방 · 스페이스서퍼',  note: '장난감 로켓과 블록', href: 'works/space-surfer/' },
  { id: 'roof',    floor: 3, name: '루프탑 · 시로 채널',     note: '밤하늘을 보는 자리', href: 'https://www.youtube.com/@shiroleebunny' },
];

// 링크는 사이트 뿌리 기준 (이 파일은 /building/ 에 있고, 페이지는 / 에 있다)
const SITE = new URL('../', import.meta.url);
for (const r of ROOMS) r.href = new URL(r.href, SITE).href;

const css = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

// ---- 렌더러 ----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 200);

const hemi = new THREE.HemisphereLight(0xfff6e4, 0x9c8a72, 1.4);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
sun.position.set(-6, 14, 9);
// 해 그림자: 집 전체(반지름 약 7m)를 덮는 직교 카메라 하나. 걷어 낸 벽은 그림자도 안 드리운다.
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -11;
sun.shadow.camera.right = sun.shadow.camera.top = 11;
sun.shadow.camera.near = 2; sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(hemi, sun, sun.target);

// 4단 톤 — 수채 그림처럼 명암을 끊는다 (구석 그늘은 모델 정점색이, 해 그림자는 그림자맵이 더한다)
const tone = new THREE.DataTexture(new Uint8Array([138, 138, 138, 255, 178, 178, 178, 255, 218, 218, 218, 255, 255, 255, 255, 255]), 4, 1);
tone.minFilter = tone.magFilter = THREE.NearestFilter;
tone.needsUpdate = true;

// ---- 외곽선 + 종이 결 (화면 공간 후처리) ----
const rtColor = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });   // 4x MSAA (WebGL2)
rtColor.depthTexture = new THREE.DepthTexture(1, 1);
const rtNormal = new THREE.WebGLRenderTarget(1, 1);
const normalMat = new THREE.MeshNormalMaterial();
const post = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: rtColor.texture }, tDepth: { value: rtColor.depthTexture }, tNormal: { value: rtNormal.texture },
    texel: { value: new THREE.Vector2() }, near: { value: camera.near }, far: { value: camera.far },
    ink: { value: new THREE.Color() }, paper: { value: new THREE.Color() }, line: { value: 1.0 },
    sky: { value: new THREE.Color() }, night: { value: 0.0 },   // 배경 하늘: 위는 sky, 지평선 쪽은 paper. 밤이면 별
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth, tNormal; uniform vec2 texel; uniform float near, far, line, night;
    uniform vec3 ink, paper, sky; varying vec2 vUv;
    float lin(float z){ return (2.0*near*far)/(far+near-(z*2.0-1.0)*(far-near)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    vec3 toSRGB(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
    void main(){
      vec2 o = texel * line;
      float d0 = texture2D(tDepth, vUv).r;
      float dc = lin(d0);
      vec3 nc = texture2D(tNormal, vUv).rgb;
      float ed = 0.0, en = 0.0;
      vec2 offs[4]; offs[0]=vec2(o.x,0.); offs[1]=vec2(-o.x,0.); offs[2]=vec2(0.,o.y); offs[3]=vec2(0.,-o.y);
      for (int i=0;i<4;i++){
        float d = lin(texture2D(tDepth, vUv+offs[i]).r);
        ed += abs(d - dc) / max(min(d, dc), 0.001);
        vec3 n = texture2D(tNormal, vUv+offs[i]).rgb;
        en += length(n - nc);
      }
      float edge = clamp(smoothstep(0.06, 0.14, ed) + smoothstep(0.35, 0.7, en), 0.0, 1.0);
      vec4 c = texture2D(tColor, vUv);
      // 하늘: 수채처럼 위에서 아래로 번지는 두 색. 밤에는 드문드문 별 (화소마다 고정이라 깜빡이지 않는다)
      vec3 bg = mix(paper, sky, smoothstep(0.15, 0.95, vUv.y));
      float star = step(0.9975, hash(floor(gl_FragCoord.xy / 1.5) + 3.0)) * smoothstep(0.3, 0.7, vUv.y);
      bg += star * night * (0.5 + 0.5 * hash(floor(gl_FragCoord.xy / 1.5) + 9.0)) * vec3(0.9, 0.85, 0.7);
      vec3 col = mix(bg, toSRGB(c.rgb), c.a);
      col = mix(col, ink, edge * 0.85);
      float g = hash(floor(gl_FragCoord.xy)) * 0.035 - 0.0175;          // 종이 결
      float g2 = hash(floor(gl_FragCoord.xy / 3.0) + 7.0) * 0.025 - 0.0125;
      col *= 1.0 + g + g2;
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function applyTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' || (darkQuery.matches && document.documentElement.dataset.theme !== 'light');
  post.uniforms.paper.value.setStyle(css('--paper-2', '#d8d0bb'), THREE.NoColorSpace);
  post.uniforms.sky.value.setStyle(dark ? '#161c2a' : '#c9d1c6', THREE.NoColorSpace);   // 낮: 옅은 세이지 하늘 · 밤: 먹빛 남색
  post.uniforms.night.value = dark ? 1 : 0;
  post.uniforms.ink.value.setStyle(dark ? '#1a140f' : '#3a2c22', THREE.NoColorSpace);
  hemi.intensity = dark ? 0.85 : 1.4;
  sun.intensity = dark ? 0.7 : 1.6;
  hemi.color.set(dark ? 0x9fb0d0 : 0xfff6e4);
  dirty = true;
}

// ---- 모델 ----
const DIRS = { S: new THREE.Vector3(0, 0, 1), N: new THREE.Vector3(0, 0, -1), E: new THREE.Vector3(1, 0, 0), W: new THREE.Vector3(-1, 0, 0) };
const cuttables = [];   // { obj, dir }
const floorNodes = [];  // { obj, floor }
const baseNodes = [];   // 땅·바깥 소품: 1층만 볼 때와 전체일 때만
const cellarNodes = []; // 지하실 (floor -1)
const anchors = {};
const pickables = [];
const center = new THREE.Vector3(0, 4.2, 0);
let radius = 26, fitR = 6, rowsMode = false;
let house = null, door = null;   // door: 현관 문짝 (원점이 경첩, 걷기 모드에서 연다)
let dirty = true;

const toonCache = new Map();
function toonize(m, vc) {
  if (m.name.startsWith('glow')) return new THREE.MeshBasicMaterial({ color: m.color });
  const key = m.name + (vc ? '+vc' : '');
  // map: 모델에 든 생성 텍스처(나뭇결·지붕널·회벽…). vertexColors: 구워 둔 구석 그늘(COLOR_0)을 곱한다 (없는 메시는 재질 색만)
  if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy();   // 비스듬한 바닥·지붕에서도 결이 뭉개지지 않게
  if (!toonCache.has(key)) toonCache.set(key, new THREE.MeshToonMaterial({ color: m.color, map: m.map || null, gradientMap: tone, vertexColors: vc }));
  return toonCache.get(key);
}

const loading = document.createElement('p');
loading.className = 'loading';
loading.textContent = '시로의 집을 짓는 중…';
stage.appendChild(loading);

new GLTFLoader().load(new URL('house.glb', import.meta.url).href, (gltf) => {
  house = gltf.scene;
  house.traverse((o) => {
    if (o.isMesh) {
      if (!o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals();   // glb 에 법선을 안 넣는다 (면이 평평해 계산값이 같다)
      const vc = !!o.geometry.getAttribute('color');
      o.material = Array.isArray(o.material) ? o.material.map((m) => toonize(m, vc)) : toonize(o.material, vc);
      o.castShadow = o.receiveShadow = true;
      pickables.push(o);
    }
    const ud = o.userData || {};
    if (ud.cut && DIRS[ud.cut]) cuttables.push({ obj: o, dir: DIRS[ud.cut] });
    if (typeof ud.floor === 'number' && ud.floor > 0) floorNodes.push({ obj: o, floor: ud.floor });
    if (ud.floor === 0) baseNodes.push(o);
    if (ud.floor === -1) cellarNodes.push(o);          // 지하실: 둘러보기(단면)에서는 숨기고 걷기에서만
    if (o.name.startsWith('anchor_')) anchors[o.name.slice(7)] = o;
    if (o.name === 'door') door = o;
  });
  scene.add(house);
  // 화면 맞춤은 집(1~3층)만 — 둘레의 터·언덕(floor 0)은 배경이라 재지 않는다
  const box = new THREE.Box3();
  for (const { obj } of floorNodes) box.expandByObject(obj);
  const sph = box.getBoundingSphere(new THREE.Sphere());
  center.copy(sph.center); center.y -= 0.3;
  fitR = sph.radius;
  sun.target.position.set(center.x, 0, center.z);
  targetY = lookCur = center.y;
  showFloors(shownFloor);
  loading.remove();
  setWalking(!new URLSearchParams(location.search).has('view'));   // 기본은 걷기. ?view 가 있으면 둘러보기
  resize();
  dirty = true;
}, undefined, () => {
  loading.textContent = '3D 모델을 불러오지 못했어요. 아래 목록에서 방을 고르세요.';
  stage.classList.add('failed');
});

// ---- 라벨 ----
const labelEls = ROOMS.map((r) => {
  const a = document.createElement('a');
  a.className = 'callout';
  a.href = r.href;
  if (!r.href.startsWith(SITE.href)) a.rel = 'noopener';
  a.innerHTML = `<span class="pin"></span><span class="txt"><b>${r.name}</b><small>${r.note}</small></span>`;
  a.hidden = true;
  labelLayer.appendChild(a);
  return a;
});

// ---- 층 고르기: 기본은 집 전체, 층을 고르면 그 층만 떼어 보여 준다 ----
let shownFloor = 0;     // 0 = 전체
let targetY = center.y;
let zoom = 1, zoomTarget = 1;
const floorOn = (f) => shownFloor === 0 || f === shownFloor;
function showFloors(n) {
  shownFloor = n;
  for (const b of floorButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.floor) === n));
  for (const { obj, floor } of floorNodes) obj.visible = floorOn(floor);
  for (const o of baseNodes) o.visible = n <= 1;
  for (const o of cellarNodes) o.visible = walking;
  targetY = center.y; zoomTarget = 1;
  if (n > 0 && house) {
    const box = new THREE.Box3();
    for (const { obj, floor } of floorNodes) if (floor === n) box.expandByObject(obj);
    if (!box.isEmpty()) {
      const sph = box.getBoundingSphere(new THREE.Sphere());
      targetY = sph.center.y;
      zoomTarget = Math.min(1, Math.max(0.55, sph.radius / fitR));
    }
  }
  dirty = true;
}
for (const b of floorButtons) b.addEventListener('click', () => showFloors(Number(b.dataset.floor)));

// ---- 입력: 손가락(마우스)을 따라 상하·좌우 회전, 탭 → 가장 가까운 방 ----
let yaw = 0.75, yawVel = 0;             // 처음엔 오른쪽 앞에서 (콘셉트 그림의 각도)
let pitch = 0.36, pitchVel = 0;         // 위아래 각도. 땅 바로 위 ~ 거의 내려다보기
const PITCH_MIN = 0.04, PITCH_MAX = 1.0;
const clampPitch = (p) => Math.min(PITCH_MAX, Math.max(PITCH_MIN, p));
// 확대·축소: 두 손가락 벌리기/오므리기, 마우스 휠, +/− 버튼
let lastRR = NaN;
let userZoom = 1;                       // 거리 배율. 작을수록 가까이
const ZOOM_MIN = 0.45, ZOOM_MAX = 1.8;
function zoomBy(f) { userZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, userZoom * f)); dirty = true; }
let dragging = false, lastX = 0, lastY = 0, moved = 0, downAt = 0;
const pointers = new Map(); let pinchD = 0;
const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.callout')) return;
  if (walking) {                       // 1인칭: 왼쪽 반 터치 = 조이스틱, 그 밖(오른쪽·마우스) = 끌어서 둘러보기
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 */ }
    const b = stage.getBoundingClientRect();
    if (e.pointerType === 'mouse' && !locked && canvas.requestPointerLock) {     // PC: 클릭하면 마우스가 잠기고 움직이는 대로 둘러본다 (Esc 로 풀림)
      try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* 미지원 */ }
    }
    if (e.pointerType !== 'mouse' && joyId === null && e.clientX - b.left < b.width / 2) {
      joyId = e.pointerId; joyOrigin.x = e.clientX; joyOrigin.y = e.clientY; joy.f = joy.r = 0;
      joyEl.hidden = false; joyEl.style.left = `${e.clientX - b.left}px`; joyEl.style.top = `${e.clientY - b.top}px`;
      joyKnob.style.transform = 'translate(0px, 0px)';
      return;
    }
    if (lookId !== null) return;
    lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = 0; downAt = performance.now();
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.setPointerCapture(e.pointerId);
  if (pointers.size === 2) { pinchD = pinchDist(); moved = 99; yawVel = pitchVel = 0; return; }
  dragging = true; lastX = e.clientX; lastY = e.clientY; moved = 0; downAt = performance.now(); yawVel = pitchVel = 0;
});
stage.addEventListener('pointermove', (e) => {
  if (walking) {
    if (e.pointerId === joyId) {
      const dx = e.clientX - joyOrigin.x, dy = e.clientY - joyOrigin.y;
      const len = Math.hypot(dx, dy), k = len > JOY_R ? JOY_R / len : 1;
      joy.r = (dx * k) / JOY_R; joy.f = -(dy * k) / JOY_R;               // 위로 밀면 앞으로
      joyKnob.style.transform = `translate(${(dx * k).toFixed(0)}px, ${(dy * k).toFixed(0)}px)`;
    } else if (e.pointerId === lookId || (locked && e.pointerType === 'mouse')) {
      const dx = locked ? e.movementX : e.clientX - lastX, dy = locked ? e.movementY : e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      const k = e.pointerType === 'mouse' ? (locked ? 0.0022 : 0.004) : 0.0022;   // 손가락·잠긴 마우스는 둔하게 (멀미)
      wYaw -= dx * k; wPitch = Math.min(0.9, Math.max(-0.9, wPitch - dy * k * 0.7)); dirty = true;
    }
    return;
  }
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    const d = pinchDist();
    if (pinchD > 0 && d > 0 && !walking) zoomBy(pinchD / d);
    pinchD = d;
    return;
  }
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  const d = -dx * 0.008, dp = dy * 0.006;
  yaw += d; yawVel = d;
  const np = clampPitch(pitch + dp); pitchVel = np - pitch; pitch = np;
  dirty = true;
});
function release(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 1) {          // 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 돌린다
    const [p] = pointers.values(); lastX = p.x; lastY = p.y; dragging = true; pinchD = 0;
    return false;
  }
  const was = dragging; dragging = false; pinchD = 0;
  return was;
}
function walkRelease(e) {
  if (e.pointerId === joyId) { joyId = null; joy.f = joy.r = 0; joyEl.hidden = true; return false; }
  if (e.pointerId === lookId) { lookId = null; return true; }
  return false;
}
stage.addEventListener('pointerup', (e) => {
  if (walking) { if (walkRelease(e) && moved < 8 && performance.now() - downAt < 400) openNear(); return; }
  if (!pointers.has(e.pointerId)) return;
  if (release(e) && moved < 8 && performance.now() - downAt < 400) pick(e);
});
stage.addEventListener('pointercancel', (e) => { if (walking) walkRelease(e); else release(e); });
// iOS Safari: 무대 위 두 손가락은 페이지 확대가 아니라 집 확대로
stage.addEventListener('gesturestart', (e) => e.preventDefault());
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (walking) return;
  zoomBy(Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
}, { passive: false });
for (const b of document.querySelectorAll('[data-zoom]')) b.addEventListener('click', () => zoomBy(b.dataset.zoom === 'in' ? 0.8 : 1.25));
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
const wp = new THREE.Vector3();
function pick(e) {
  if (!house) return;
  const b = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables.filter(visibleChain), false)[0];
  if (!hit) return;
  let best = null, bd = 2.6;
  for (const r of ROOMS) {
    const a = anchors[r.id];
    if (!a || !floorOn(r.floor)) continue;
    const d = a.getWorldPosition(wp).distanceTo(hit.point);
    if (d < bd) { bd = d; best = r; }
  }
  if (best) location.href = best.href;
}
function visibleChain(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

// ---- 크기 ----
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  rtColor.setSize(w * pr, h * pr); rtNormal.setSize(w * pr, h * pr);
  post.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr));
  post.uniforms.line.value = Math.max(1, pr * 0.9);
  camera.aspect = w / h;
  camera.fov = walking ? (camera.aspect < 1 ? 85 : 62) : 28;
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  // 건물은 가운데 폭의 일부만 쓰고, 양옆은 이름표 칸으로 비워 둔다
  // 폰처럼 좁으면 이름표를 위아래 띠로 보내고 건물이 폭을 거의 다 쓴다
  rowsMode = w < 520;
  const hfit = Math.atan(Math.tan(hf) * (rowsMode ? 0.92 : w < 760 ? 0.5 : 0.52));
  const vfit = Math.atan(Math.tan(vf) * (rowsMode ? 0.56 : 0.94));
  radius = (fitR / Math.sin(Math.min(vfit, hfit))) * 0.86;
  lastRR = NaN;
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(stage);
darkQuery.addEventListener('change', applyTheme);
applyTheme();

// ---- 매 프레임 ----
const camDir = new THREE.Vector3(); const v = new THREE.Vector3();
let lastYaw = NaN;
let lookCur = center.y;
let lastT = performance.now();
function frame() {
  const now = performance.now(); const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (walking) walkStep(dt);
  else if (!dragging) {
    if (Math.abs(yawVel) > 0.0003) { yaw += yawVel; yawVel *= 0.92; dirty = true; }
    else if (!reduceMotion.matches && house) { yaw += 0.0011; dirty = true; }
    if (Math.abs(pitchVel) > 0.0003) { pitch = clampPitch(pitch + pitchVel); pitchVel *= 0.9; dirty = true; }
  }
  if (Math.abs(targetY - lookCur) > 0.005) { lookCur += (targetY - lookCur) * 0.12; dirty = true; }
  if (Math.abs(zoomTarget - zoom) > 0.002) { zoom += (zoomTarget - zoom) * 0.12; dirty = true; }
  if (house && (dirty || yaw !== lastYaw)) {
    lastYaw = yaw;
    dirty = false;
    const tgt = new THREE.Vector3(center.x, lookCur, center.z);
    const rr = radius * zoom * userZoom;
    if (!walking && rr !== lastRR) {    // 둘러보기: 가까이 가면 앞 클립면도 당긴다 (걷기는 setWalking 이 0.1 로 고정 — 안 그러면 0.8 m 안의 벽이 잘려 벽이 사라져 보인다)
      lastRR = rr;
      camera.near = Math.max(0.2, rr * 0.08); camera.far = rr + fitR * 3;
      post.uniforms.near.value = camera.near; post.uniforms.far.value = camera.far;
      camera.updateProjectionMatrix();
    }
    if (walking) {                    // 1인칭: 눈높이에서 보는 방향대로. 벽은 걷어 내지 않는다
      camera.position.set(player.x, player.y + eyeH, player.z);
      camera.rotation.set(wPitch, wYaw, 0, 'YXZ');   // 좌우(yaw) 먼저, 그 다음 위아래 — 기본 XYZ 면 고개를 든 채 돌 때 시선이 비스듬히 밀린다
      camDir.set(-Math.sin(wYaw), 0, -Math.cos(wYaw));
    } else {
      camera.position.set(tgt.x + rr * Math.cos(pitch) * Math.sin(yaw), tgt.y + rr * Math.sin(pitch), tgt.z + rr * Math.cos(pitch) * Math.cos(yaw));
      camera.lookAt(tgt);
      camDir.subVectors(camera.position, tgt).setY(0).normalize();
    }

    for (const { obj, floor } of floorNodes) obj.visible = floorOn(floor);
    for (const { obj, dir } of cuttables) if (obj.visible) obj.visible = walking || dir.dot(camDir) < 0.3;
    if (walking) updateNear();

    // 1) 색 2) 법선 3) 외곽선·종이 결
    renderer.setRenderTarget(rtColor); renderer.clear(); renderer.render(scene, camera);
    scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(rtNormal); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    scene.overrideMaterial = null;
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);

    placeLabels();
  }
  requestAnimationFrame(frame);
}

// ---- 1인칭 걷기 (두호 2026-11-18: 남코뮤지엄처럼 들어가 보기 · 2026-11-23: 기본 모드, 계단·지하실) ----
// 울타리 문 앞에서 시작해 마당을 걷고, 현관으로 1층 찻집에 들어간다. 찻집 서쪽 벽 계단으로 2층, 그 위 계단으로 루프탑 데크. 집 서쪽 바깥 돌계단으로 지하실.
// 다락(놀이방·천문대)은 지붕이 낮아 들어가지 않고 데크에서 본다 — 집을 다시 만드는 3단계에서 문을 낸다.
// 키보드 WASD·방향키. 터치는 모바일 FPS 식: 왼쪽 반을 누른 자리에 조이스틱이 떠서 밀면 걷고, 오른쪽 반을 끌면 둘러본다(두 손가락 동시 가능).
// 마우스는 클릭하면 잠겨 움직이는 대로 둘러본다(Esc 로 풀림). 잠기지 않으면 끌어서 돌린다.
// three 좌표: 모델의 남쪽(정문)이 +z, 위가 +y. 집 발자국 ±3 × ±2.5, 현관은 x 0.35~1.25 의 남쪽 벽.
// 발높이·충돌 수치는 model/build_house.py 의 계단(ST12·ST23·HOLE12·HOLE23)·지하(BZ·TRX·TRY·CELLAR_DOOR)와 같아야 한다.
const walkBtn = document.querySelector('[data-walk]');
const joyEl = document.getElementById('joy');              // 가상 조이스틱 (왼쪽 반을 누른 자리에 뜬다)
const joyKnob = joyEl ? joyEl.firstElementChild : null;
const JOY_R = 44;                                           // 스틱이 움직이는 반지름(px)
const joy = { f: 0, r: 0 }, joyOrigin = { x: 0, y: 0 };
let joyId = null, lookId = null, locked = false;
const hintEl = document.querySelector('.bar .hint');
const hintOrbit = hintEl ? hintEl.textContent : '';
let walking = false;
const START = new THREE.Vector3(0.8, 0, 6.6);     // 울타리 문 앞, 돌길 끝
const player = START.clone();                     // y = 발 높이
let wYaw = 0, wPitch = 0;                         // yaw 0 = 북쪽(집) 을 본다
const EYE = 1.45, SPEED = 2.4, STEP = 0.62;       // 눈높이(m), 걸음(m/s), 한 번에 오르내릴 수 있는 높이(m) — 계단 한 단은 0.24
let eyeH = EYE;
const keys = new Set();
const TREES = [[-6.5, 4.5], [-7, -3.5], [6.8, -4.5], [7.2, 3.8], [-3.5, -6], [4, -6.3], [-8.3, 0.5], [8.4, -0.8], [-5.5, 6.5], [5.8, 6.4], [1.7, 5.1]];
// 계단·구덩이 (three 좌표. z 는 모델 y 의 부호 반대)
const SX0 = -2.85, SX1 = -2.0;                                  // 안 계단 폭
const R12 = { z0: 0.6, z1: -2.28, y0: 0.08, y1: 2.9 };          // 1층→2층: z0(아래) 에서 z1(위) 로
const R23 = { z0: 0.6, z1: -2.1, y0: 2.9, y1: 5.6 };            // 2층→루프탑
const HOLE12 = [-2.9, -1.95, -2.28, -0.25], HOLE23 = [-2.9, -1.95, -2.1, -0.3];   // [x0,x1,z0,z1] 위층 바닥 구멍
const TRX0 = -3.87, TRX1 = -3.06;                               // 바깥 돌계단 구덩이 x
const RC = { z0: -1.7, z1: 1.1, y0: 0, y1: -2.6 };              // 북(땅) 에서 남으로 내려간다
const BZ = -2.6, CDOOR = [1.1, 1.9];                            // 지하실 바닥, 서쪽 벽 문(z)
const inRect = (x, z, r) => x > r[0] && x < r[1] && z > r[2] && z < r[3];
const rampY = (r, z) => r.y0 + (r.y1 - r.y0) * (z - r.z0) / (r.z1 - r.z0);
const onRamp = (r, x0, x1, x, z) => x > x0 && x < x1 && z > Math.min(r.z0, r.z1) - 0.02 && z < Math.max(r.z0, r.z1) + 0.02;
// (x,z) 에 설 수 있는 바닥 높이들 중 지금 발높이와 가장 가까운 것. 없으면 NaN
function surfaceAt(x, z, y) {
  const c = [];
  const inHouse = Math.abs(x) < 2.87 && Math.abs(z) < 2.37;
  const inLot = Math.abs(x) <= 8.2 && Math.abs(z) <= 6.7;
  const inFoot = Math.abs(x) < 3.06 && Math.abs(z) < 2.56;
  const inTrench = x > TRX0 && x < TRX1 && z > -1.7 && z < 2.0;
  if (inLot && !inFoot && !inTrench) c.push(0);                                      // 마당
  if (inHouse) { c.push(0.08); if (!inRect(x, z, HOLE12)) c.push(2.9); }               // 1층 · 2층
  if (inHouse && x < -0.65 && !inRect(x, z, HOLE23)) c.push(5.6);                      // 루프탑 데크
  if (Math.abs(x) < 2.7 && Math.abs(z) < 2.2) c.push(BZ);                              // 지하실
  if (x > -3.06 && x < -2.7 && z > CDOOR[0] && z < CDOOR[1]) c.push(BZ);               // 지하실 문턱
  if (onRamp(R12, SX0, SX1, x, z)) c.push(rampY(R12, z));
  if (onRamp(R23, SX0, SX1, x, z)) c.push(rampY(R23, z));
  if (inTrench) c.push(z < RC.z1 ? rampY(RC, Math.max(z, RC.z0)) : BZ);                 // 돌계단, 그 아래 바닥
  let best = NaN, bd = Infinity;
  for (const h of c) { const d = Math.abs(h - y); if (d < bd) { bd = d; best = h; } }
  return best;
}
// 벽·가구. 층은 발높이로 가른다
const LEVEL = (y) => (y < -1.3 ? 'B' : y < 1.5 ? 1 : y < 4.3 ? 2 : 3);
const OBST = {      // [x0,x1,z0,z1] 가구 (모델 좌표에서 z 부호를 바꾼 것)
  1: [[0.9, 2.6, -1.35, -0.75], [2.05, 2.65, -0.8, 0.4], [2.1, 2.7, 1.55, 2.05]],          // 카운터 ㄱ자, 난로
  2: [[0.8, 2.7, -2.2, -1.4], [0.85, 1.95, 0.8, 1.4], [-1.9, -1.1, 0.0, 0.8], [2.15, 2.65, -0.05, 0.45], [-1.95, -1.8, -1.6, -0.25]],   // 작업대, 책상, 이젤, 상자, 계단 구멍 난간
  3: [[-2.45, -1.95, 0.85, 1.35], [-1.45, -0.95, 1.15, 1.65], [-1.95, -1.45, 0.95, 1.45], [-2.85, -2.35, 1.65, 2.15], [-1.95, -1.8, -1.6, -0.3], [-2.9, -1.85, -0.35, -0.2]],   // 데크 의자 둘·탁자·화분, 계단 머리 난간
  B: [[-1.12, -0.88, 0.68, 0.92], [0.88, 1.12, -0.92, -0.68], [1.7, 2.3, 1.2, 1.8]],      // 기둥 둘, 상자
};
const TABLES = [[-1.5, 1.3], [-0.6, 0.2], [-1.0, -1.2]];     // 1층 둥근 탁자
function blocked(x, z, y) {
  const lv = LEVEL(y);
  const inside = Math.abs(x) < 2.7 && Math.abs(z) < 2.2;
  for (const r of OBST[lv]) if (inRect(x, z, r)) return true;
  if (lv === 'B') {
    if (inside) return false;
    if (x > TRX0 && x < TRX1 && z > -1.7 && z < 2.0) return false;                        // 구덩이
    if (x >= -3.06 && x <= -2.7 && z > CDOOR[0] && z < CDOOR[1]) return false;              // 문
    return true;
  }
  if (lv === 3) {
    if (!(x > -2.85 && x < -0.65 && Math.abs(z) < 2.3)) return true;                         // 데크 밖(난간·무릎벽)
    return false;
  }
  if (lv === 2) {
    if (!inside) return true;
    if (x > 0.2 && x < 0.4 && z < -0.2) return true;                                          // 칸막이
    return false;
  }
  // 마당 · 1층
  if (Math.abs(x) > 8.2 || Math.abs(z) > 6.7) return true;                                    // 울타리
  const wall = !inside && Math.abs(x) < 3.05 && Math.abs(z) < 2.55;
  const door = x > 0.3 && x < 1.3 && z > 1.8;
  if (wall && !door) return true;
  if (x < TRX0 - 0.0 && x > TRX0 - 0.25 && z > -1.9 && z < 2.1) return true;                 // 구덩이 서쪽 옹벽
  if (z > 1.95 && z < 2.15 && x > TRX0 - 0.25 && x < TRX1) return true;                      // 구덩이 남쪽 옹벽
  if (inside) for (const [tx, tz] of TABLES) if (Math.hypot(x - tx, z - tz) < 0.42) return true;
  if (Math.hypot((x + 5.2) / 1.7, (z + 2.0) / 1.3) < 1) return true;                          // 연못
  for (const [tx, tz] of TREES) if (Math.hypot(x - tx, z - tz) < 0.45) return true;
  return false;
}
function canStand(x, z) {
  if (blocked(x, z, player.y)) return false;
  const h = surfaceAt(x, z, player.y);
  return !Number.isNaN(h) && Math.abs(h - player.y) <= STEP;      // 너무 높거나 낮은 곳(구멍·난간 밖)은 못 간다
}
function walkStep(dt) {
  if (door) {                                                                  // 현관 앞 1.8 m 안이면 문이 안쪽으로 열린다
    const want = Math.hypot(player.x - door.position.x, player.z - door.position.z) < 1.8 && player.y > -1 ? -1.7 : 0;
    const ry = door.rotation.y + (want - door.rotation.y) * Math.min(1, dt * 6);
    if (Math.abs(ry - door.rotation.y) > 0.0005) { door.rotation.y = ry; dirty = true; }
  }
  let f = joy.f, r = joy.r;
  if (keys.has('f')) f += 1; if (keys.has('b')) f -= 1; if (keys.has('r')) r += 1; if (keys.has('l')) r -= 1;
  if (Math.abs(f) >= 0.05 || Math.abs(r) >= 0.05) {
    const len = Math.hypot(f, r); if (len > 1) { f /= len; r /= len; }   // 스틱은 살짝 밀면 천천히
    const sy = Math.sin(wYaw), cy = Math.cos(wYaw);
    const dx = (-sy * f + cy * r) * SPEED * dt, dz = (-cy * f - sy * r) * SPEED * dt;
    if (canStand(player.x + dx, player.z + dz)) { player.x += dx; player.z += dz; }
    else if (canStand(player.x + dx, player.z)) player.x += dx;                     // 벽을 따라 미끄러진다
    else if (canStand(player.x, player.z + dz)) player.z += dz;
    dirty = true;
  }
  const h = surfaceAt(player.x, player.z, player.y);                              // 발이 바닥을 따라간다 (계단은 비탈처럼)
  if (!Number.isNaN(h) && Math.abs(h - player.y) > 0.002) { player.y += (h - player.y) * Math.min(1, dt * 14); dirty = true; }
}
// 가까운 방: 2.2 m 안(천문대는 데크에서 보이니 4.5 m)에 들어오면 이름표가 뜨고, 탭·클릭·E 로 연다
let nearRoom = null;
const REACH = { dome: 4.5 };
function updateNear() {
  let best = null, bd = Infinity;
  for (const r of ROOMS) {
    const a = anchors[r.id]; if (!a) continue;
    a.getWorldPosition(wp);
    const d = Math.hypot(wp.x - player.x, (wp.y - (player.y + eyeH)) * 0.6, wp.z - player.z);
    if (d < (REACH[r.id] || 2.2) && d < bd) { bd = d; best = r; }
  }
  if (best !== nearRoom) { nearRoom = best; dirty = true; }
}
function openNear() { if (nearRoom) location.href = nearRoom.href; }
function setWalking(on) {
  walking = on;
  if (on) { showFloors(0); player.copy(START); wYaw = 0; wPitch = 0.05; nearRoom = null; }
  else { if (door) door.rotation.y = 0; if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }
  for (const o of cellarNodes) o.visible = on;
  for (const b of floorButtons) b.disabled = on;
  for (const b of document.querySelectorAll('[data-zoom]')) b.disabled = on;
  if (walkBtn) { walkBtn.setAttribute('aria-pressed', String(on)); walkBtn.textContent = on ? '둘러보기' : '걷기'; }
  if (joyEl) joyEl.hidden = true;
  joyId = lookId = null; joy.f = joy.r = 0;
  if (hintEl) hintEl.textContent = on ? (matchMedia('(hover: none)').matches ? '왼쪽을 누른 채 밀어 걷고, 오른쪽을 끌어 둘러봐요. 방에 다가가면 이름이 떠요' : '클릭하면 마우스로 둘러보고(Esc 로 풀기), WASD·방향키로 걸어요. 방에 다가가면 이름이 떠요') : hintOrbit;
  stage.classList.toggle('walking', on);
  if (on) { camera.near = 0.1; camera.far = 80; post.uniforms.near.value = 0.1; post.uniforms.far.value = 80; }
  lastRR = NaN; keys.clear();
  renderer.setPixelRatio(Math.min(devicePixelRatio, on ? 1.5 : 2));           // 걷는 동안은 조금 낮은 해상도로 — 프레임이 끊기면 멀미가 난다
  resize();                                                                    // 시야각(걷기: 세로 화면 85°, 가로 62°)·크기 다시
  dirty = true;
}
if (walkBtn) walkBtn.addEventListener('click', () => setWalking(!walking));
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; stage.classList.toggle('locked', locked); });
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
addEventListener('keydown', (e) => {
  if (!walking || e.target.closest('input, textarea, button, a')) return;
  if (e.code === 'KeyE' || e.code === 'Enter') { openNear(); return; }
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
});
addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
addEventListener('blur', () => keys.clear());
// 검토 스크립트(model/check.js)가 쓰는 손잡이. 사이트 기능이 아니다
window.__house = { get player() { return player; }, get walking() { return walking; }, get near() { return nearRoom; }, setWalking, teleport(x, y, z, yaw) { player.set(x, y, z); if (yaw !== undefined) wYaw = yaw; dirty = true; }, canStand, surfaceAt, look(yaw, pitch) { wYaw = yaw; wPitch = pitch; dirty = true; } };

// 라벨: 건물 밖 양옆 칸에 세우고, 방까지 인출선으로 잇는다 (도감처럼)
const NS = 'http://www.w3.org/2000/svg';
const leads = document.createElementNS(NS, 'svg');
leads.setAttribute('class', 'leads');
leads.setAttribute('aria-hidden', 'true');
labelLayer.prepend(leads);
const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
function houseRect(b) {
  const box = new THREE.Box3();
  for (const { obj, floor } of floorNodes) if (floorOn(floor)) box.expandByObject(obj);
  if (box.isEmpty()) box.setFromObject(house);
  let l = Infinity, r = -Infinity, t = Infinity, bot = -Infinity;
  let i = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = corners[i++].set(x, y, z).project(camera);
    const sx = (p.x * 0.5 + 0.5) * b.width, sy = (-p.y * 0.5 + 0.5) * b.height;
    l = Math.min(l, sx); r = Math.max(r, sx); t = Math.min(t, sy); bot = Math.max(bot, sy);
  }
  return { l, r, t, bot };
}
// 한 줄에서 겹치지 않게: 앞에서부터 밀고, 끝을 넘으면 거꾸로 당긴다
function spread(list, pos, size, lo, hi, gap) {
  let min = lo;
  for (const it of list) { it[pos] = Math.max(it[pos], min); min = it[pos] + it[size] + gap; }
  let max = hi;
  for (let k = list.length - 1; k >= 0; k--) { const it = list[k]; it[pos] = Math.min(it[pos], max - it[size]); max = it[pos] - gap; }
  for (const it of list) it[pos] = Math.max(lo, it[pos]);
}
function placeLabels() {
  const b = canvas.getBoundingClientRect();
  if (walking) {                       // 1인칭: 가까운 방 하나만, 그 자리 위에 (인출선 없음)
    leads.innerHTML = '';
    ROOMS.forEach((r, i) => {
      const el = labelEls[i];
      if (r !== nearRoom) { el.hidden = true; el.classList.remove('near'); return; }
      anchors[r.id].getWorldPosition(v).project(camera);
      if (v.z > 1) { el.hidden = true; return; }
      el.hidden = false; el.classList.add('near');
      const sx = (v.x * 0.5 + 0.5) * b.width, sy = (-v.y * 0.5 + 0.5) * b.height;
      const w = el.offsetWidth, h = el.offsetHeight;
      const x = Math.min(b.width - w - 6, Math.max(6, sx - w / 2)), y = Math.min(b.height - h - 6, Math.max(6, sy - h - 18));
      el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    });
    return;
  }
  const hr = houseRect(b);
  const GAP = 14, EDGE = 6, OUT = 16;
  const shown = [];
  ROOMS.forEach((r, i) => {
    const el = labelEls[i], a = anchors[r.id];
    if (!a || !floorOn(r.floor)) { el.hidden = true; return; }
    a.getWorldPosition(v);
    el.classList.remove('near');
    const side = v.clone().sub(center).setY(0).normalize().dot(camDir);
    if (side < -0.8 && r.id !== 'dome') { el.hidden = true; return; }
    v.project(camera);
    if (v.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    shown.push({ el, ax: (v.x * 0.5 + 0.5) * b.width, ay: (-v.y * 0.5 + 0.5) * b.height });
  });
  let path = '', dots = '';
  const put = (it, side) => {
    for (const k of ['left', 'right', 'top', 'bottom']) it.el.classList.toggle(k, k === side);
    it.el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
    let lx, ly, bx, by;
    if (side === 'left' || side === 'right') {
      ly = by = it.y + it.h / 2;
      lx = side === 'left' ? it.x + it.w + 3 : it.x - 3;
      bx = side === 'left' ? lx + 10 : lx - 10;
    } else {
      lx = bx = it.x + it.w / 2;
      ly = side === 'top' ? it.y + it.h + 3 : it.y - 3;
      by = side === 'top' ? ly + 8 : ly - 8;
    }
    path += `M${lx.toFixed(1)} ${ly.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}L${it.ax.toFixed(1)} ${it.ay.toFixed(1)}`;
    dots += `<circle cx="${it.ax.toFixed(1)}" cy="${it.ay.toFixed(1)}" r="3.2"/>`;
  };
  const measure = (it, maxW) => { it.el.style.maxWidth = `${maxW.toFixed(0)}px`; it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; };

  if (!rowsMode) {
    // 넓은 화면: 건물 양옆 칸. 방이 건물 어느 쪽에 있느냐로 나눈다
    const mid = (hr.l + hr.r) / 2;
    for (const key of ['left', 'right']) {
      const list = shown.filter((it) => (it.ax < mid) === (key === 'left')).sort((p, q) => p.ay - q.ay);
      const colW = Math.max(150, key === 'left' ? hr.l - GAP - EDGE : b.width - hr.r - GAP - EDGE);
      for (const it of list) { measure(it, Math.min(colW, 220)); it.y = it.ay - it.h / 2; }
      spread(list, 'y', 'h', EDGE, b.height - EDGE, 6);
      // 무대 가장자리에 붙이고 긴 인출선으로 잇는다 (건물과 겹치면 건물 쪽 끝까지만)
      for (const it of list) {
        it.x = key === 'left' ? Math.min(OUT, hr.l - GAP - it.w) : Math.max(b.width - OUT - it.w, hr.r + GAP);
        it.x = Math.max(EDGE, Math.min(b.width - EDGE - it.w, it.x));
        put(it, key);
      }
    }
  } else {
    // 좁은 화면: 건물 위아래 띠. 많으면 두 줄로 엇갈려 선이 이름표 사이로 지나가게
    const mid = (hr.t + hr.bot) / 2;
    const maxW = (b.width - 2 * EDGE - 12) / 3;
    for (const key of ['top', 'bottom']) {
      const list = shown.filter((it) => (it.ay < mid) === (key === 'top')).sort((p, q) => p.ax - q.ax);
      for (const it of list) measure(it, maxW);
      const total = list.reduce((s, it) => s + it.w + 6, 0);
      const rows = total > b.width - 2 * EDGE ? [list.filter((_, k) => k % 2 === 0), list.filter((_, k) => k % 2 === 1)] : [list];
      // 띠는 무대 위아래 끝에서 시작해 건물 쪽으로 쌓는다. 먼 줄을 바깥에
      const bandH = rows.reduce((s, row) => s + Math.max(0, ...row.map((it) => it.h)) + 6, 0);
      let edge = key === 'top' ? Math.min(OUT + bandH, Math.max(EDGE + bandH, hr.t - GAP)) : Math.max(b.height - OUT - bandH, Math.min(b.height - EDGE - bandH, hr.bot + GAP));
      for (const row of rows) {
        const h = Math.max(0, ...row.map((it) => it.h));
        for (const it of row) it.x = it.ax - it.w / 2;
        spread(row, 'x', 'w', EDGE, b.width - EDGE, 6);
        for (const it of row) {
          it.y = key === 'top' ? Math.max(EDGE, edge - it.h) : Math.min(b.height - EDGE - it.h, edge);
          put(it, key);
        }
        edge = key === 'top' ? edge - h - 6 : edge + h + 6;
      }
    }
  }
  leads.setAttribute('viewBox', `0 0 ${b.width.toFixed(0)} ${b.height.toFixed(0)}`);
  leads.innerHTML = `<path d="${path}"/>${dots}`;
}

showFloors(0);
frame();
