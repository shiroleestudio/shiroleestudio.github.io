// 시로의 집 — 3D 건물 (2026-10-26)
// 허브 첫 화면(/)의 주인공. 1층 찻집 · 2층 갤러리(화실+공방) · 3층 다락(놀이방·천문대) + 루프탑. 지붕 위 돔에서 망원경이 나온다.
// 모델: house.glb (model/build_house.py 로 Blender 에서 만든다. 콘셉트 그림은 두호의 나노바나나 초안).
// 그림체: 툰 3단 명암 + 화면 공간 잉크 외곽선 + 종이 결. 색은 모델 재질 색, 배경은 site.css 토큰.
// 손가락을 따라 상하·좌우로 돈다. 카메라를 향한 벽·지붕은 걷어 낸다(단면). 방 이름표는 건물 밖 양옆에 세우고 인출선으로 잇는다(HTML 링크).
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
  { id: 'cafe',    floor: 1, name: '찻집 · 커피 레시피',     note: '시로가 커피를 내리는 자리', href: 'https://shiroleestudio.github.io/coffee/' },
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
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 200);

const hemi = new THREE.HemisphereLight(0xfff6e4, 0x9c8a72, 1.4);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
sun.position.set(-6, 14, 9);
scene.add(hemi, sun);

// 3단 톤 — 수채 그림처럼 명암을 끊는다
const tone = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]), 3, 1);
tone.minFilter = tone.magFilter = THREE.NearestFilter;
tone.needsUpdate = true;

// ---- 외곽선 + 종이 결 (화면 공간 후처리) ----
const rtColor = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
rtColor.depthTexture = new THREE.DepthTexture(1, 1);
const rtNormal = new THREE.WebGLRenderTarget(1, 1);
const normalMat = new THREE.MeshNormalMaterial();
const post = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: rtColor.texture }, tDepth: { value: rtColor.depthTexture }, tNormal: { value: rtNormal.texture },
    texel: { value: new THREE.Vector2() }, near: { value: camera.near }, far: { value: camera.far },
    ink: { value: new THREE.Color() }, paper: { value: new THREE.Color() }, line: { value: 1.0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth, tNormal; uniform vec2 texel; uniform float near, far, line;
    uniform vec3 ink, paper; varying vec2 vUv;
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
      vec3 col = mix(paper, toSRGB(c.rgb), c.a);
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
const anchors = {};
const pickables = [];
const center = new THREE.Vector3(0, 4.2, 0);
let radius = 26, fitR = 6, rowsMode = false;
let house = null;
let dirty = true;

const toonCache = new Map();
function toonize(m) {
  if (m.name.startsWith('glow')) return new THREE.MeshBasicMaterial({ color: m.color });
  const key = m.color.getHexString();
  if (!toonCache.has(key)) toonCache.set(key, new THREE.MeshToonMaterial({ color: m.color, gradientMap: tone }));
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
      o.material = Array.isArray(o.material) ? o.material.map(toonize) : toonize(o.material);
      pickables.push(o);
    }
    const ud = o.userData || {};
    if (ud.cut && DIRS[ud.cut]) cuttables.push({ obj: o, dir: DIRS[ud.cut] });
    if (typeof ud.floor === 'number' && ud.floor > 0) floorNodes.push({ obj: o, floor: ud.floor });
    if (o.name.startsWith('anchor_')) anchors[o.name.slice(7)] = o;
  });
  scene.add(house);
  const box = new THREE.Box3().setFromObject(house);
  const sph = box.getBoundingSphere(new THREE.Sphere());
  center.copy(sph.center); center.y -= 0.3;
  fitR = sph.radius;
  targetY = lookCur = center.y;
  showFloors(shownUpTo);
  loading.remove();
  resize();
  dirty = true;
}, undefined, () => {
  loading.textContent = '3D 모델을 불러오지 못했어요. 아래 목록에서 방을 고르세요.';
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

// ---- 층 고르기: 위층을 걷어 모형집처럼 ----
let shownUpTo = 3;
let targetY = center.y;
function showFloors(n) {
  shownUpTo = n;
  for (const b of floorButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.floor) === n));
  targetY = n === 3 ? center.y : n === 2 ? center.y - 1.2 : center.y - 2.4;
  dirty = true;
}
for (const b of floorButtons) b.addEventListener('click', () => showFloors(Number(b.dataset.floor)));

// ---- 입력: 손가락(마우스)을 따라 상하·좌우 회전, 탭 → 가장 가까운 방 ----
let yaw = 0.75, yawVel = 0;             // 처음엔 오른쪽 앞에서 (콘셉트 그림의 각도)
let pitch = 0.36, pitchVel = 0;         // 위아래 각도. 땅 바로 위 ~ 거의 내려다보기
const PITCH_MIN = 0.04, PITCH_MAX = 1.0;
const clampPitch = (p) => Math.min(PITCH_MAX, Math.max(PITCH_MIN, p));
let dragging = false, lastX = 0, lastY = 0, moved = 0, downAt = 0;
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.callout')) return;
  dragging = true; lastX = e.clientX; lastY = e.clientY; moved = 0; downAt = performance.now(); yawVel = pitchVel = 0;
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
  const d = -dx * 0.008, dp = dy * 0.006;
  yaw += d; yawVel = d;
  const np = clampPitch(pitch + dp); pitchVel = np - pitch; pitch = np;
  dirty = true;
});
stage.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  if (moved < 8 && performance.now() - downAt < 400) pick(e);
});
stage.addEventListener('pointercancel', () => { dragging = false; });
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
    if (!a || r.floor > shownUpTo) continue;
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
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  // 건물은 가운데 폭의 일부만 쓰고, 양옆은 이름표 칸으로 비워 둔다
  // 폰처럼 좁으면 이름표를 위아래 띠로 보내고 건물이 폭을 거의 다 쓴다
  rowsMode = w < 520;
  const hfit = Math.atan(Math.tan(hf) * (rowsMode ? 0.92 : w < 760 ? 0.56 : 0.6));
  const vfit = Math.atan(Math.tan(vf) * (rowsMode ? 0.62 : 0.94));
  radius = (fitR / Math.sin(Math.min(vfit, hfit))) * 0.86;
  camera.far = radius * 3; camera.near = Math.max(0.5, radius * 0.2);
  post.uniforms.near.value = camera.near; post.uniforms.far.value = camera.far;
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
function frame() {
  if (!dragging) {
    if (Math.abs(yawVel) > 0.0003) { yaw += yawVel; yawVel *= 0.92; dirty = true; }
    else if (!reduceMotion.matches && house) { yaw += 0.0011; dirty = true; }
    if (Math.abs(pitchVel) > 0.0003) { pitch = clampPitch(pitch + pitchVel); pitchVel *= 0.9; dirty = true; }
  }
  if (Math.abs(targetY - lookCur) > 0.005) { lookCur += (targetY - lookCur) * 0.12; dirty = true; }
  if (house && (dirty || yaw !== lastYaw)) {
    lastYaw = yaw;
    dirty = false;
    const tgt = new THREE.Vector3(center.x, lookCur, center.z);
    camera.position.set(tgt.x + radius * Math.cos(pitch) * Math.sin(yaw), tgt.y + radius * Math.sin(pitch), tgt.z + radius * Math.cos(pitch) * Math.cos(yaw));
    camera.lookAt(tgt);
    camDir.subVectors(camera.position, tgt).setY(0).normalize();

    for (const { obj, floor } of floorNodes) obj.visible = floor <= shownUpTo;
    for (const { obj, dir } of cuttables) if (obj.visible) obj.visible = dir.dot(camDir) < 0.3;

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

// 라벨: 건물 밖 양옆 칸에 세우고, 방까지 인출선으로 잇는다 (도감처럼)
const NS = 'http://www.w3.org/2000/svg';
const leads = document.createElementNS(NS, 'svg');
leads.setAttribute('class', 'leads');
leads.setAttribute('aria-hidden', 'true');
labelLayer.prepend(leads);
const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
function houseRect(b) {
  const box = new THREE.Box3();
  for (const { obj, floor } of floorNodes) if (floor <= shownUpTo) box.expandByObject(obj);
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
  const hr = houseRect(b);
  const GAP = 14, EDGE = 6;
  const shown = [];
  ROOMS.forEach((r, i) => {
    const el = labelEls[i], a = anchors[r.id];
    if (!a || r.floor > shownUpTo) { el.hidden = true; return; }
    a.getWorldPosition(v);
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
      const colW = Math.max(64, key === 'left' ? hr.l - GAP - EDGE : b.width - hr.r - GAP - EDGE);
      for (const it of list) { measure(it, Math.min(colW, 220)); it.y = it.ay - it.h / 2; }
      spread(list, 'y', 'h', EDGE, b.height - EDGE, 6);
      for (const it of list) {
        it.x = key === 'left' ? Math.max(EDGE, hr.l - GAP - it.w) : Math.min(b.width - EDGE - it.w, hr.r + GAP);
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
      let edge = key === 'top' ? Math.max(EDGE, hr.t - GAP) : Math.min(b.height - EDGE, hr.bot + GAP);
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

showFloors(3);
frame();
