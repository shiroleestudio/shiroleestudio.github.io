// 시로의 집 — 3D 건물 (2026-10-26)
// 1층 찻집 · 2층 갤러리(화실+공방) · 3층 다락(놀이방·천문대) + 루프탑. 지붕 위 돔에서 망원경이 나온다.
// 모델: house.glb (model/build_house.py 로 Blender 에서 만든다. 콘셉트 그림은 두호의 나노바나나 초안).
// 그림체: 툰 3단 명암 + 화면 공간 잉크 외곽선 + 종이 결. 색은 모델 재질 색, 배경은 site.css 토큰.
// 가로 회전만. 카메라를 향한 벽·지붕은 걷어 낸다(단면). 방 라벨은 HTML 링크.
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
  { id: 'counter', floor: 1, name: '카운터 · 문의',          note: '버그 신고, 제안은 여기로', href: '../support/' },
  { id: 'board',   floor: 1, name: '칠판 · 소식',            note: '오늘의 메뉴처럼 새 소식', href: '../news/' },
  { id: 'atelier', floor: 2, name: '화실 · 타임라인',        note: '벽에 길게 걸린 역사 연표', href: '../works/timeline/' },
  { id: 'shop',    floor: 2, name: '공방 · 실험실',          note: '작업대 위의 작은 도구들', href: '../works/#lab' },
  { id: 'desk',    floor: 2, name: '작업 노트 · 시로 이야기', note: '스튜디오가 생긴 이야기', href: '../about/' },
  { id: 'dome',    floor: 3, name: '천문대 · 우주 작품',     note: '지붕 위 돔의 망원경', href: '../works/' },
  { id: 'play',    floor: 3, name: '놀이방 · 스페이스서퍼',  note: '장난감 로켓과 블록', href: '../works/space-surfer/' },
  { id: 'roof',    floor: 3, name: '루프탑 · 시로 채널',     note: '밤하늘을 보는 자리', href: 'https://www.youtube.com/@shiroleebunny' },
];

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
let radius = 26, fitR = 6;
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

new GLTFLoader().load('house.glb', (gltf) => {
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
  if (r.href.startsWith('http')) a.rel = 'noopener';
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

// ---- 입력: 가로 드래그 회전, 탭 → 가장 가까운 방 ----
let yaw = 0.75, yawVel = 0;             // 처음엔 오른쪽 앞에서 (콘셉트 그림의 각도)
const PITCH = 0.36;
let dragging = false, lastX = 0, moved = 0, downAt = 0;
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.callout')) return;
  dragging = true; lastX = e.clientX; moved = 0; downAt = performance.now(); yawVel = 0;
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
  const d = -dx * 0.008; yaw += d; yawVel = d; dirty = true;
});
stage.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  if (moved < 6 && performance.now() - downAt < 400) pick(e);
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
  radius = (fitR / Math.sin(Math.min(vf, hf))) * 0.78;
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
  }
  if (Math.abs(targetY - lookCur) > 0.005) { lookCur += (targetY - lookCur) * 0.12; dirty = true; }
  if (house && (dirty || yaw !== lastYaw)) {
    lastYaw = yaw;
    dirty = false;
    const tgt = new THREE.Vector3(center.x, lookCur, center.z);
    camera.position.set(tgt.x + radius * Math.cos(PITCH) * Math.sin(yaw), tgt.y + radius * Math.sin(PITCH), tgt.z + radius * Math.cos(PITCH) * Math.cos(yaw));
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

// 라벨: 방 위치에 붙이고, 뒤쪽 방은 접고, 겹치면 아래로 민다
function placeLabels() {
  const b = canvas.getBoundingClientRect();
  const placed = [];
  const items = [];
  ROOMS.forEach((r, i) => {
    const el = labelEls[i], a = anchors[r.id];
    if (!a || r.floor > shownUpTo) { el.hidden = true; return; }
    a.getWorldPosition(v);
    const side = v.clone().sub(center).setY(0).normalize().dot(camDir);
    if (side < -0.8 && r.id !== 'dome') { el.hidden = true; return; }
    v.project(camera);
    if (v.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    items.push({ el, x: (v.x * 0.5 + 0.5) * b.width, y: (-v.y * 0.5 + 0.5) * b.height, z: v.z });
  });
  items.sort((p, q) => p.y - q.y);
  for (const it of items) {
    const w = it.el.offsetWidth || 120, h = it.el.offsetHeight || 34;
    const flip = it.x > b.width * 0.6;
    let left = flip ? it.x - w : it.x, top = it.y - h;
    for (let k = 0; k < 6; k++) {
      const hitRect = placed.find((p) => left < p.r && left + w > p.l && top < p.b && top + h > p.t);
      if (!hitRect) break;
      top = hitRect.b + 2;
    }
    placed.push({ l: left, r: left + w, t: top, b: top + h });
    it.el.classList.toggle('flip', flip);
    it.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    it.el.style.zIndex = String(Math.round((1 - it.z) * 1000));
  }
}

showFloors(3);
frame();
