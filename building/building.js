// 시로의 집 — 3D 건물 (2026-10-26)
// 허브 첫 화면(/)의 주인공. 1층 찻집 · 2층 갤러리(화실+공방) · 3층 다락(놀이방·천문대) + 루프탑. 지붕 위 돔에서 망원경이 나온다.
// 모델: house.glb (model/build_house.py 로 Blender 에서 만든다. 콘셉트 그림은 두호의 나노바나나 초안).
// 그림체(3단계 그래픽 일신, 두호 2026-11-23: '8번 출구'급 실사 + 몽환적 판타지 동화풍): PBR 실사 재질(색·법선·거칠기 지도, 모델에 든 것) + 구운 구석 그늘(정점색)
// + 해 그림자맵 + 하늘 환경광(PMREM) + 후처리(블룸·거리 안개·ACES 톤·색 보정·비네트·필름 그레인·약한 색수차). 배경은 셰이더 하늘(낮: 구름, 밤: 별·달).
// 1인칭 걷기만 있다(두호 2026-11-23: 게임처럼 이용하는 사이트, 조감도·둘러보기 모드는 뺐다): 마당에서 시작해 현관으로 들어가고, 서쪽 벽 계단으로 2층·루프탑,
// 바깥 돌계단으로 지하실에 간다 (아래 '1인칭 걷기'). 메뉴(방 이름표 = 링크)는 그 방 가까이 갔을 때만 뜬다.
// 지하실 한가운데에는 캠프파이어처럼 블랙홀이 떠서 돈다(blackhole.js, '블랙홀멍'). 보일 때만 저해상도 버퍼에 그리고, 방은 그 주황빛으로 물든다.
// 가만히 있으면(조작 없음) 방이 서서히 어두워져 블랙홀만 남는다. 조작하면 바로 돌아온다.
// 캐릭터는 아직 없다. TODO(character-sheet).
import * as THREE from 'three';
import { GLTFLoader } from '../assets/vendor/three/addons/loaders/GLTFLoader.js';
import { createBlackHole, BH } from './blackhole.js?v=0.15.1';   // 지하실 한가운데의 블랙홀 (building.js 와 함께 ?v= 를 올린다)

const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const labelLayer = document.getElementById('labels');
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

const hemi = new THREE.HemisphereLight(0xfff6e4, 0x9c8a72, 0.55);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
sun.position.set(-6, 14, 9);
const SUN_DIR = sun.position.clone().normalize();
// 해 그림자: 집 전체(반지름 약 7m)를 덮는 직교 카메라 하나. 걷어 낸 벽은 그림자도 안 드리운다.
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -11;
sun.shadow.camera.right = sun.shadow.camera.top = 11;
sun.shadow.camera.near = 2; sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(hemi, sun, sun.target);
// 지하실: 블랙홀(강착 원반)이 내는 주황빛. 지하에 있을 때만 켜고, 모닥불처럼 일렁인다
const bhLight = new THREE.PointLight(0xff9a4e, 0, 9, 2);
bhLight.position.copy(BH.CENTER);
bhLight.visible = false;
scene.add(bhLight);
const bh = createBlackHole(renderer);
const bhSphere = new THREE.Mesh(new THREE.SphereGeometry(BH.RADIUS, 24, 16), bh.material);   // 블랙홀이 든 경계 공. 화소마다 셰이더가 광선을 쏜다
bhSphere.position.copy(BH.CENTER); bhSphere.visible = false; bhSphere.renderOrder = 10;
scene.add(bhSphere);
let bhOn = false;
let lastInput = performance.now(), fade = 0;    // '멍': 조작이 없으면 IDLE_START 초 뒤부터 IDLE_DUR 초에 걸쳐 방이 사라진다
const IDLE = { start: 6, dur: 14 };
const touched = () => { lastInput = performance.now(); if (fade > 0) dirty = true; };
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4();

// 하늘 환경광: 작은 하늘 공을 PMREM 으로 구워 scene.environment 에 — PBR 재질의 반사·간접광. 테마가 바뀌면 다시 굽는다
const pmrem = new THREE.PMREMGenerator(renderer);
const skyEnvMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { zen: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, gnd: { value: new THREE.Color() }, sunDir: { value: SUN_DIR }, sunCol: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform vec3 zen, hor, gnd, sunDir, sunCol; varying vec3 vDir;
    void main(){ float y = vDir.y; vec3 c = y > 0. ? mix(hor, zen, pow(y, 0.6)) : mix(hor, gnd, min(1., -y * 3.));
      c += sunCol * pow(max(dot(vDir, sunDir), 0.), 48.) * 2.0; gl_FragColor = vec4(c, 1.); }`,
});
const skyEnvScene = new THREE.Scene(); skyEnvScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), skyEnvMat));
let envTex = null;
function bakeEnvironment() {
  if (envTex) envTex.dispose();
  envTex = pmrem.fromScene(skyEnvScene, 0.02).texture;
  scene.environment = envTex;
}

// ---- 후처리 (화면 공간) ----
// 1) 장면을 HDR(HalfFloat, 4x MSAA) 로 그린다 → 2) 밝은 곳만 뽑아 1/4·1/8 로 흐린다(블룸) → 3) 합성: 하늘 배경, 거리 안개, 블룸, ACES 톤, 색 보정, 비네트, 그레인, 색수차, 멍(fade)
const rtColor = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });   // 4x MSAA (WebGL2)
rtColor.depthTexture = new THREE.DepthTexture(1, 1);
const mkRT = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
const bloomRT = { a: mkRT(1, 1), b: mkRT(1, 1), c: mkRT(1, 1), d: mkRT(1, 1) };
const blurMat = new THREE.ShaderMaterial({
  uniforms: { src: { value: null }, dir: { value: new THREE.Vector2() }, thr: { value: 0 }, texel: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `uniform sampler2D src; uniform vec2 dir, texel; uniform float thr; varying vec2 vUv;
    void main(){ float w[7]; w[0]=0.2; w[1]=0.17; w[2]=0.12; w[3]=0.07; w[4]=0.035; w[5]=0.015; w[6]=0.005;
      vec3 s = vec3(0.);
      for (int i = -6; i <= 6; i++) { vec3 c = texture2D(src, vUv + dir * texel * float(i) * 1.5).rgb; c = max(c - thr, 0.); s += c * w[i < 0 ? -i : i]; }
      gl_FragColor = vec4(s, 1.); }`,
  depthTest: false, depthWrite: false,
});
const post = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: rtColor.texture }, tDepth: { value: rtColor.depthTexture }, tBloom: { value: bloomRT.b.texture }, tBloom2: { value: bloomRT.d.texture },
    texel: { value: new THREE.Vector2() }, near: { value: camera.near }, far: { value: camera.far }, time: { value: 0 },
    zen: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, fogCol: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
    night: { value: 0.0 }, fogDensity: { value: 0.011 }, exposure: { value: 1.0 }, cloud: { value: 1.0 },
    camMat: { value: new THREE.Matrix3() }, tanV: { value: 0.5 }, aspect: { value: 1 }, sunDir: { value: SUN_DIR },
    tCover: { value: null }, fade: { value: 0.0 },   // 블랙홀멍: 블랙홀이 덮는 정도(화면 버퍼 알파)와 배경을 지우는 정도
    ssao: { value: 0.0 },                              // 화면 공간 구석 그늘 세기(리모델링 3, 2026-11-27). 0 이면 끔
    bhOn: { value: 0.0 },                              // 블랙홀이 그려지는 프레임(1): 블랙홀이 덮는 곳에는 필름 그레인을 넣지 않는다(검은 지평선 위의 알갱이가 자글거린다, 2026-11-27)
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tColor, tDepth, tBloom, tBloom2, tCover; uniform vec2 texel; uniform float near, far, night, fogDensity, exposure, fade, time, tanV, aspect, cloud, ssao, bhOn;
    uniform vec3 zen, hor, fogCol, sunCol, sunDir; uniform mat3 camMat; varying vec2 vUv;
    float lin(float z){ return (2.0*near*far)/(far+near-(z*2.0-1.0)*(far-near)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0., 1.); }
    // 하늘: 지평선→천정 그라데이션, 해 무리, 느리게 흐르는 구름(낮), 별·달(밤)
    vec3 sky(vec3 d){
      float y = max(d.y, 0.0);
      vec3 c = mix(hor, zen, pow(y, 0.42));
      float sd = max(dot(d, sunDir), 0.0);
      c += sunCol * (pow(sd, 32.0) * 0.6 + pow(sd, 600.0) * 6.0);
      if (d.y > 0.01 && cloud > 0.0) {                                       // 구름: 하늘 평면에 투영한 fbm 세 층
        vec2 uv = d.xz / (d.y + 0.15) * 0.9 + vec2(time * 0.004, time * 0.0015);
        float n = vnoise(uv) * 0.55 + vnoise(uv * 2.1 + 3.0) * 0.3 + vnoise(uv * 4.3 + 7.0) * 0.15;
        float cl = smoothstep(0.52, 0.78, n) * smoothstep(0.0, 0.25, d.y) * cloud;
        vec3 cc = mix(hor * 1.15, vec3(1.0, 0.98, 0.95), 0.5) * (1.0 - night * 0.8);
        c = mix(c, cc, cl * 0.85);
      }
      if (night > 0.0) {
        vec2 g = floor((d.xz / (d.y + 0.2)) * 160.0);
        float st = step(0.985, hash(g + 3.0)) * (0.4 + 0.6 * hash(g + 9.0)) * smoothstep(0.05, 0.4, d.y);
        c += night * st * vec3(0.9, 0.9, 1.0) * 0.8;
        vec3 moon = normalize(vec3(0.55, 0.5, -0.6));
        float md = dot(d, moon);
        c += night * (smoothstep(0.9985, 0.9992, md) * vec3(1.0, 0.97, 0.9) * 2.0 + pow(max(md, 0.0), 80.0) * vec3(0.25, 0.3, 0.45));
      }
      return c;
    }
    void main(){
      vec2 q = (vUv - 0.5) * 2.0;
      // 약한 색수차: 가장자리에서 R·B 를 바깥쪽으로 조금
      vec2 ca = q * dot(q, q) * 0.0012;
      vec4 c = texture2D(tColor, vUv);
      c.r = texture2D(tColor, vUv - ca).r; c.b = texture2D(tColor, vUv + ca).b;
      vec3 col = c.rgb;
      // 하늘 배경(장면이 없는 화소) + 거리 안개
      vec3 dir = normalize(camMat * vec3(q.x * tanV * aspect, q.y * tanV, -1.0));
      vec3 bg = sky(dir);
      float dz = lin(texture2D(tDepth, vUv).r);
      // SSAO(2026-11-27 리모델링 3): 깊이 지도에서 화소 둘레 12점을 재어, 나보다 앞(가까이)에 있는 이웃이 많을수록 구석 그늘.
      // 반지름 0.45 m 를 화면 비율로 바꾸고(멀수록 작게), 화소마다 다른 각도로 돌려 띠무늬를 없앤다. 정점 AO·라이트맵이 못 잡는 소품 밑·벽 모서리를 조인다.
      if (ssao > 0.0 && c.a > 0.5) {
        float rad = 0.45 / (2.0 * dz * tanV);
        vec2 rv = vec2(rad / aspect, rad);
        float ang = hash(floor(gl_FragCoord.xy) + 0.37) * 6.2832;
        float occ = 0.0;
        for (int i = 0; i < 12; i++) {
          float a = ang + float(i) * 0.5236; float rr = (0.25 + 0.75 * fract(float(i) * 0.618 + 0.1));
          vec2 o = vec2(cos(a), sin(a)) * rv * rr;
          float zs = lin(texture2D(tDepth, clamp(vUv + o, 0.001, 0.999)).r);
          float d = dz - zs;                                                   // 양수 = 이웃이 더 가깝다(가린다)
          occ += step(0.04, d) * (1.0 - smoothstep(0.45, 1.2, d)) * (1.0 - rr * 0.35);
        }
        col *= 1.0 - ssao * occ / 12.0 * 0.9;
      }
      float fog = 1.0 - exp(-dz * fogDensity);
      vec3 fc = mix(fogCol, bg, 0.5);
      col = mix(col, fc, fog * 0.9);
      col = mix(bg, col, c.a);
      // 블룸 (밝은 창·블랙홀·해 무리가 번진다)
      col += texture2D(tBloom, vUv).rgb * 0.3 + texture2D(tBloom2, vUv).rgb * 0.2;
      // 톤: 노출 → ACES → 색 보정(그늘은 살짝 보라·파랑, 밝은 곳은 따뜻하게 — 몽환) → 채도
      col = aces(col * exposure);
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(0.018, 0.01, 0.038) * (1.0 - lum) * smoothstep(0.0, 0.06, lum);   // 순검정(블랙홀 지평선)은 그대로 둔다
      col = mix(col, col * vec3(1.03, 1.0, 0.96), lum);
      col = mix(vec3(lum), col, 1.12);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.2);                   // 살짝 S 자 대비
      col = pow(max(col, 0.0), vec3(1.0 / 2.2));
      // 비네트 + 필름 그레인(화소마다 고정 — 깜빡이지 않는다)
      col *= 1.0 - 0.14 * dot(q, q) * 0.7;
      float g = hash(floor(gl_FragCoord.xy)) - 0.5;
      if (bhOn > 0.5) g *= 1.0 - texture2D(tCover, vUv).a;                 // 블랙홀 위에는 그레인 없음(2026-11-27)
      col += g * 0.022;
      if (fade > 0.0) {                                                     // 멍: 블랙홀이 아닌 곳은 어둠으로, 어둠 속에 별이 조금
        vec4 tc = texture2D(tCover, vUv); float cov = tc.a;
        float st = step(0.9985, hash(floor(gl_FragCoord.xy / 1.5) + 11.0)) * (0.3 + 0.7 * hash(floor(gl_FragCoord.xy / 1.5) + 5.0));
        // 반투명한 원반·빛안개 뒤로 방이 비치지 않게, 블랙홀 버퍼(미리 곱한 색)만 다시 톤을 눌러 별 위에 얹는다(2026-11-24)
        vec3 x = tc.rgb * 1.15; vec3 bhc = clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);
        vec3 dark = vec3(st * 0.35, st * 0.33, st * 0.4) * (1.0 - cov) + bhc + (texture2D(tBloom, vUv).rgb * 0.3 + texture2D(tBloom2, vUv).rgb * 0.2) * 0.6;
        col = mix(col, dark, fade);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene();
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
postScene.add(postQuad);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function blurPass(src, dst, dx, dy, thr) {
  postQuad.material = blurMat;
  blurMat.uniforms.src.value = src.texture; blurMat.uniforms.dir.value.set(dx, dy); blurMat.uniforms.thr.value = thr;
  blurMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
  renderer.setRenderTarget(dst); renderer.render(postScene, postCam);
}
function composite() {
  blurPass(rtColor, bloomRT.a, 1, 0, 1.5); blurPass(bloomRT.a, bloomRT.b, 0, 1, 0);
  blurPass(bloomRT.b, bloomRT.c, 1, 0, 0); blurPass(bloomRT.c, bloomRT.d, 0, 1, 0);
  postQuad.material = post;
  post.uniforms.camMat.value.setFromMatrix4(camera.matrixWorld);
  post.uniforms.tanV.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); post.uniforms.aspect.value = camera.aspect;
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}

function applyTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' || (darkQuery.matches && document.documentElement.dataset.theme !== 'light');
  const u = post.uniforms, e = skyEnvMat.uniforms;
  // 낮: 연한 라벤더-파랑 하늘, 크림빛 지평선, 따뜻한 해. 밤: 먹빛 남색, 별·달, 차가운 달빛 — 창은 노랗게 빛난다
  u.zen.value.setStyle(dark ? '#0d1226' : '#7f9bd0', THREE.SRGBColorSpace);
  u.hor.value.setStyle(dark ? '#262c48' : '#eadfcb', THREE.SRGBColorSpace);
  u.fogCol.value.setStyle(dark ? '#242c4c' : '#d9d2c8', THREE.SRGBColorSpace);
  u.sunCol.value.setStyle(dark ? '#334066' : '#ffe2b0', THREE.SRGBColorSpace);
  u.night.value = dark ? 1 : 0;
  fogBase = dark ? 0.008 : 0.006; u.fogDensity.value = fogBase;
  u.exposure.value = dark ? 1.5 : 1.2;   // 소유자 피드백(2026-11-24) '너무 어둡다' — 밤은 달빛이 충분히 비추게, 낮도 한 단 밝게
  u.cloud.value = dark ? 0.35 : 1.0;
  e.zen.value.copy(u.zen.value); e.hor.value.copy(u.hor.value); e.sunCol.value.copy(u.sunCol.value);
  e.gnd.value.setStyle(dark ? '#141412' : '#6f6a55', THREE.SRGBColorSpace);
  hemiBase = dark ? 0.6 : 0.42; hemi.intensity = hemiBase;      // 하늘빛의 큰 몫은 라이트맵이 맡는다(큰 면). 소품은 이 값만 받는다
  lmBoost = dark ? 0.25 : 0.75; for (const m of lmMats) m.lightMapIntensity = LM_SCALE * lmBoost;   // 큰 면은 해 직접광(실시간) + 라이트맵(하늘·반사광)
  for (const m of glassMats) { m.emissiveIntensity = dark ? 2.6 : 0.0; m.opacity = dark ? 0.7 : 0.42; m.envMapIntensity = dark ? 0.6 : 1.8; }
  sun.intensity = dark ? 1.3 : 2.6;
  sun.color.set(dark ? 0x9fb3e6 : 0xfff0d8);
  hemi.color.set(dark ? 0x7f90b8 : 0xfff6e4);
  glowBoost = dark ? 3.2 : 1.6;
  for (const m of glowMats) m.color.copy(m.userData.base).multiplyScalar(glowBoost);
  bakeEnvironment();
  dirty = true;
}

// ---- 모델 ----
const anchors = {};              // anchor_<방id>: 이름표 자리
let house = null, door = null;   // door: 현관 문짝 (원점이 경첩, 가까이 가면 연다)
let dirty = true;
let hemiBase = 0.55;         // 테마가 정한 하늘빛 세기 (지하실에서는 0.25 배로 어둡게)
let fogBase = 0.011;          // 테마가 정한 안개 농도 (지하실에서는 0)
let glowBoost = 1.6;          // 불 켜진 창·전구의 밝기 배율(HDR — 블룸이 번진다). 밤에 더 밝다
const glowMats = [], glassMats = [];
let lmBoost = 1.0;            // 라이트맵 세기 배율(낮 1, 밤 0.3)

// 라이트맵(build_house.py 가 Cycles 로 구운 해 반사광 + 하늘빛, 두 번째 UV). 값은 /LM_SCALE 로 저장돼 있어 세기를 LM_SCALE 로 되돌린다.
// 밤에는 달빛이라 치고 약하게·푸르게. 소품·나무는 라이트맵이 없어(uv1 없음) 정점 AO 만 쓴다.
const LM_SCALE = 2.0;
const lightMap = new THREE.TextureLoader().load(new URL('house.lightmap.webp', import.meta.url).href);
lightMap.colorSpace = THREE.SRGBColorSpace; lightMap.flipY = false; lightMap.anisotropy = 4;
lightMap.channel = 1;   // glTF TEXCOORD_1(uv1) 로 샘플링 — 기본 0 이면 색 텍스처 좌표로 아틀라스가 벽에 타일링돼 얼룩처럼 보인다
const lmMats = [];
const matCache = new Map();
function materialize(m, vc, lm) {
  // 모델의 PBR 재질(MeshStandardMaterial: 색·법선·거칠기 지도)을 그대로 쓰되, 구워 둔 구석 그늘(COLOR_0)을 곱하고 결이 뭉개지지 않게 한다
  const key = m.name + (vc ? '+vc' : '') + (lm ? '+lm' : '');
  if (matCache.has(key)) return matCache.get(key);
  let out;
  if (m.name === 'glow') {                          // 창: 유리 — 낮에는 하늘이 비치고 안이 들여다보이며, 밤에는 따뜻하게 빛난다(발광 → 블룸)
    out = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.8, transparent: true, opacity: 0.42,
      emissive: m.color.clone(), emissiveIntensity: 0, side: THREE.DoubleSide, depthWrite: false });
    out.userData.base = m.color.clone(); glassMats.push(out);
  } else if (m.name.startsWith('glow')) {           // 전구·줄 전등: 조명 없이 밝게 (HDR → 블룸)
    out = new THREE.MeshBasicMaterial({ color: m.color.clone().multiplyScalar(glowBoost) });
    out.userData.base = m.color.clone(); glowMats.push(out);
  } else {
    out = m.clone();
    out.vertexColors = vc;
    out.envMapIntensity = 0.6;
    for (const t of [out.map, out.normalMap, out.roughnessMap, out.metalnessMap]) if (t) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (out.normalMap) out.normalScale.set(0.9, 0.9);
    if (lm) { out.lightMap = lightMap; out.lightMapIntensity = LM_SCALE * lmBoost; lmMats.push(out); }
  }
  matCache.set(key, out);
  return out;
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
      const vc = !!o.geometry.getAttribute('color'), lm = !!o.geometry.getAttribute('uv1');
      o.material = Array.isArray(o.material) ? o.material.map((m) => materialize(m, vc, lm)) : materialize(o.material, vc, lm);
      if (o.material.transparent) { o.renderOrder = 5; o.castShadow = false; }   // 유리창은 해를 가리지 않는다
      o.castShadow = o.receiveShadow = true;
    }
    if (o.name.startsWith('anchor_')) anchors[o.name.slice(7)] = o;
    if (o.name === 'door') door = o;
  });
  scene.add(house);
  sun.target.position.set(0, 0, 0);
  loading.remove();
  startWalk();
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

// ---- 입력 (1인칭): 왼쪽 반 터치 = 조이스틱, 오른쪽 반·마우스 = 둘러보기. 탭·클릭 = 가까운 방 열기 ----
let lastX = 0, lastY = 0, moved = 0, downAt = 0;
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.callout')) return;
  touched();
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
});
stage.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyId) {
    touched();
    const dx = e.clientX - joyOrigin.x, dy = e.clientY - joyOrigin.y;
    const len = Math.hypot(dx, dy), k = len > JOY_R ? JOY_R / len : 1;
    joy.r = (dx * k) / JOY_R; joy.f = -(dy * k) / JOY_R;               // 위로 밀면 앞으로
    joyKnob.style.transform = `translate(${(dx * k).toFixed(0)}px, ${(dy * k).toFixed(0)}px)`;
  } else if (e.pointerId === lookId || (locked && e.pointerType === 'mouse')) {
    touched();
    const dx = locked ? e.movementX : e.clientX - lastX, dy = locked ? e.movementY : e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    const k = e.pointerType === 'mouse' ? (locked ? 0.0034 : 0.0056) : 0.0032;   // 시선 감도(두호 2026-11-24 '좀 더 높여줘': 0.0022/0.004 → 약 1.5배)
    wYaw -= dx * k; wPitch = Math.min(0.9, Math.max(-0.9, wPitch - dy * k * 0.7)); dirty = true;
  }
});
function walkRelease(e) {
  if (e.pointerId === joyId) { joyId = null; joy.f = joy.r = 0; joyEl.hidden = true; return false; }
  if (e.pointerId === lookId) { lookId = null; return true; }
  return false;
}
stage.addEventListener('pointerup', (e) => { if (walkRelease(e) && moved < 8 && performance.now() - downAt < 400) openNear(); });
stage.addEventListener('pointercancel', walkRelease);
// ---- 가상 게임패드 (세로 폰, 두호 2026-11-26): 무대 아래 띠에 왼쪽 고정 스틱(PSP 식) + 오른쪽 터치패드(스팀 컨트롤러 식). 무대 위 터치 조작도 그대로 둔다 ----
const padStick = document.getElementById('padStick'), padLook = document.getElementById('padLook');
const padKnob = padStick ? padStick.querySelector('.knob') : null;
const PAD_R = 40;                                           // 스틱이 움직이는 반지름(px)
let padStickId = null, padLookId = null, padLastX = 0, padLastY = 0, padMoved = 0, padDownAt = 0;
const padCenter = { x: 0, y: 0 };
function padStickMove(e) {
  const dx = e.clientX - padCenter.x, dy = e.clientY - padCenter.y;
  const len = Math.hypot(dx, dy), k = len > PAD_R ? PAD_R / len : 1;
  joy.r = (dx * k) / PAD_R; joy.f = -(dy * k) / PAD_R;
  padKnob.style.transform = `translate(${(dx * k).toFixed(0)}px, ${(dy * k).toFixed(0)}px)`;
}
if (padStick && padLook) {
  padStick.addEventListener('pointerdown', (e) => {
    if (padStickId !== null) return;
    touched(); e.preventDefault();
    try { padStick.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 */ }
    const b = padStick.querySelector('.base').getBoundingClientRect();
    padCenter.x = b.left + b.width / 2; padCenter.y = b.top + b.height / 2;
    padStickId = e.pointerId; padStick.classList.add('on'); padStickMove(e);
  });
  padStick.addEventListener('pointermove', (e) => { if (e.pointerId === padStickId) { touched(); padStickMove(e); } });
  const stickRelease = (e) => { if (e.pointerId === padStickId) { padStickId = null; joy.f = joy.r = 0; padStick.classList.remove('on'); padKnob.style.transform = 'translate(0px, 0px)'; } };
  padStick.addEventListener('pointerup', stickRelease);
  padStick.addEventListener('pointercancel', stickRelease);
  padLook.addEventListener('pointerdown', (e) => {
    if (padLookId !== null) return;
    touched(); e.preventDefault();
    try { padLook.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 */ }
    padLookId = e.pointerId; padLastX = e.clientX; padLastY = e.clientY; padMoved = 0; padDownAt = performance.now(); padLook.classList.add('on');
  });
  padLook.addEventListener('pointermove', (e) => {
    if (e.pointerId !== padLookId) return;
    touched();
    const dx = e.clientX - padLastX, dy = e.clientY - padLastY;
    padLastX = e.clientX; padLastY = e.clientY; padMoved += Math.abs(dx) + Math.abs(dy);
    const k = 0.0048;                                       // 패드가 무대보다 작아 무대 끌기(0.0032)보다 1.5배
    wYaw -= dx * k; wPitch = Math.min(0.9, Math.max(-0.9, wPitch - dy * k * 0.7)); dirty = true;
  });
  const lookRelease = (e, tap) => { if (e.pointerId === padLookId) { padLookId = null; padLook.classList.remove('on'); if (tap && padMoved < 8 && performance.now() - padDownAt < 400) openNear(); } };
  padLook.addEventListener('pointerup', (e) => lookRelease(e, true));
  padLook.addEventListener('pointercancel', (e) => lookRelease(e, false));
  for (const el of [padStick, padLook]) el.addEventListener('contextmenu', (e) => e.preventDefault());   // 길게 눌러도 메뉴가 뜨지 않게
}
// 터치 기기 판정은 maxTouchPoints 로(S펜 폰처럼 hover:hover 를 내는 기기가 있어 hover 만으로는 패드가 안 뜬다 — 두호 2026-11-26). <html class="touch"> 를 CSS 가 본다
const TOUCH = navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;
if (TOUCH) document.documentElement.classList.add('touch');
const portraitQuery = matchMedia('(orientation: portrait)');
const padShown = () => TOUCH && portraitQuery.matches;
// iOS Safari: 무대 위 두 손가락은 페이지 확대가 아니다
stage.addEventListener('gesturestart', (e) => e.preventDefault());
stage.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
const wp = new THREE.Vector3();

// ---- 크기 ----
// 블랙홀 버퍼 해상도(두호 2026-11-24: 블랙홀만이라도 고해상도로). PC 는 화면 화소 그대로(폭 1600 상한), 터치 기기는 0.75(폭 1200 상한).
// 지하실에서 프레임이 느리면(34 ms 넘게) 한 단씩 줄이고, 빠르면(14 ms 아래) 다시 올린다 — 아이폰 15·갤럭시 S23 급이 기준.
let bhQ = 1.0, bhAcc = 0, bhN = 0, bhLock = false;   // bhLock: 검토 스크립트가 해상도를 고정할 때
function bhResize() {
  const w = stage.clientWidth, h = stage.clientHeight, pr = renderer.getPixelRatio();
  const touch = matchMedia('(hover: none)').matches;
  const base = touch ? Math.min(0.75, 1200 / (w * pr)) : Math.min(1.0, 1600 / (w * pr));
  bh.setSize(w * pr, h * pr, Math.max(0.3, base * bhQ));
}
function bhGovern(dt) {
  if (bhLock) return;
  bhAcc += dt; bhN++;
  if (bhN < 45) return;
  const avg = bhAcc / bhN; bhAcc = 0; bhN = 0;
  if (avg > 0.034 && bhQ > 0.52) { bhQ = Math.max(0.5, bhQ * 0.8); bhResize(); }   // 최저 0.4→0.5(2026-11-27): 더 줄이면 블록이 보인다
  else if (avg < 0.014 && bhQ < 1) { bhQ = Math.min(1, bhQ * 1.15); bhResize(); }
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  rtColor.setSize(w * pr, h * pr);
  bloomRT.a.setSize((w * pr) >> 2, (h * pr) >> 2); bloomRT.b.setSize((w * pr) >> 2, (h * pr) >> 2);
  bloomRT.c.setSize((w * pr) >> 3, (h * pr) >> 3); bloomRT.d.setSize((w * pr) >> 3, (h * pr) >> 3);
  bhResize();
  post.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr));
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 85 : 62;                                        // 세로 화면은 시야를 넓게
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(stage);
darkQuery.addEventListener('change', applyTheme);
applyTheme();

// ---- 매 프레임 ----
const v = new THREE.Vector3();
let lastT = performance.now();
function frame() {
  const now = performance.now(); const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (house) walkStep(dt);
  if (house && dirty) {
    dirty = false;
    camera.position.set(player.x, player.y + eyeH, player.z);   // 눈높이에서 보는 방향대로
    camera.rotation.set(wPitch, wYaw, 0, 'YXZ');                 // 좌우(yaw) 먼저, 그 다음 위아래 — 기본 XYZ 면 고개를 든 채 돌 때 시선이 비스듬히 밀린다
    camera.updateMatrixWorld(true);
    updateNear();
    // 지하실의 블랙홀: 지하에 있고 공이 화면에 들어올 때만 그린다. 보이는 동안은 매 프레임(동작 줄이기와 무관 — 움직임이 내용이다)
    const inCellar = player.y < -1.0 && player.x > -3.1 && Math.abs(player.z) < 2.3;   // 지하실 안(문턱 포함). 바깥 돌계단에서는 벽 뒤라 안 보인다
    bhSphere.visible = inCellar;
    bhOn = inCellar && frustum.setFromProjectionMatrix(projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)).intersectsObject(bhSphere);
    bhLight.visible = inCellar; sun.visible = !inCellar;                       // 지하는 해가 안 든다. 하늘빛도 줄여 블랙홀이 돋보이게
    hemi.intensity = inCellar ? hemiBase * 0.25 : hemiBase;
    if (inCellar) bhLight.intensity = 16 + 3.0 * Math.sin(now * 0.0021) + 1.5 * Math.sin(now * 0.0057 + 1.0) + 0.8 * Math.sin(now * 0.013);   // 모닥불처럼
    if (bhOn) { bh.render(camera, now / 1000); bhGovern(dt); }
    // 멍: 지하실에서 조작이 없으면 방이 사라진다 (블랙홀 공이 안 보이면 지우지 않는다 — 깜깜해지기만 하니까)
    const idle = (now - lastInput) / 1000;
    fade = bhOn ? Math.min(1, Math.max(0, (idle - IDLE.start) / IDLE.dur)) : 0;
    post.uniforms.fade.value = fade; post.uniforms.tCover.value = bh.coverage(); post.uniforms.bhOn.value = bhOn ? 1 : 0;

    // 1) 장면(HDR) 2) 블룸 3) 합성
    post.uniforms.time.value = reduceMotion.matches ? 0 : now / 1000;
    post.uniforms.fogDensity.value = inCellar ? 0 : fogBase;
    renderer.setRenderTarget(rtColor); renderer.clear(); renderer.render(scene, camera);
    composite();

    placeLabels();
    if (inCellar) dirty = true;        // 블랙홀·빛이 움직이니 다음 프레임도 그린다
  }
  requestAnimationFrame(frame);
}

// ---- 1인칭 걷기 (두호 2026-11-18: 남코뮤지엄처럼 들어가 보기 · 2026-11-23: 기본 모드, 계단·지하실) ----
// 울타리 문 앞에서 시작해 마당을 걷고, 현관으로 1층 찻집에 들어간다. 찻집 서쪽 벽 계단으로 2층, 그 위 계단으로 루프탑 데크. 집 서쪽 바깥 돌계단으로 지하실.
// 다락(놀이방·천문대)은 데크에서 서쪽 지붕면의 도머 입구(z 0.05~0.95)로 걸어 들어간다(2026-11-24). 지붕이 낮은 양옆(|x-1.2| > 0.98)은 못 간다.
// 키보드 WASD·방향키. 터치는 모바일 FPS 식: 왼쪽 반을 누른 자리에 조이스틱이 떠서 밀면 걷고, 오른쪽 반을 끌면 둘러본다(두 손가락 동시 가능).
// 세로 폰(터치 기기 + portrait)은 무대를 16:10 으로 줄이고 그 아래 가상 게임패드(#pad: 왼쪽 고정 스틱, 오른쪽 터치패드)를 둔다(두호 2026-11-26). 무대 위 터치도 그대로 된다.
// 마우스는 클릭하면 잠겨 움직이는 대로 둘러본다(Esc 로 풀림). 잠기지 않으면 끌어서 돌린다.
// three 좌표: 모델의 남쪽(정문)이 +z, 위가 +y. 집 발자국 ±3 × ±2.5, 현관은 x 0.35~1.25 의 남쪽 벽.
// 발높이·충돌 수치는 model/build_house.py 의 계단(ST12·ST23·HOLE12·HOLE23)·지하(BZ·TRX·TRY·CELLAR_DOOR)와 같아야 한다.
const joyEl = document.getElementById('joy');              // 가상 조이스틱 (왼쪽 반을 누른 자리에 뜬다)
const joyKnob = joyEl ? joyEl.firstElementChild : null;
const JOY_R = 44;                                           // 스틱이 움직이는 반지름(px)
const joy = { f: 0, r: 0 }, joyOrigin = { x: 0, y: 0 };
let joyId = null, lookId = null, locked = false;
const hintEl = document.querySelector('.bar .hint');
const START = new THREE.Vector3(0.8, 0, 6.6);     // 울타리 문 앞, 돌길 끝
const player = START.clone();                     // y = 발 높이
let wYaw = 0, wPitch = 0;                         // yaw 0 = 북쪽(집) 을 본다
const EYE = 1.45, SPEED = 2.4, STEP = 0.62;       // 눈높이(m), 걸음(m/s), 한 번에 오르내릴 수 있는 높이(m) — 계단 한 단은 0.24
let eyeH = EYE;
const keys = new Set();
const TREES = [[-6.5, 4.5], [-7, -3.5], [6.8, -4.5], [7.2, 3.8], [-3.5, -6], [4, -6.3], [-8.3, 0.5], [8.4, -0.8], [-5.5, 6.5], [5.8, 6.4], [1.7, 5.1]];
// 계단·구덩이 (three 좌표. z 는 모델 y 의 부호 반대)
const SX0 = -2.85, SX1 = -1.95;                                 // 안 계단 폭(판정용). 동쪽 끝은 위층 바닥 구멍(HOLE12·HOLE23)의 끝과 같아야 계단에서 위층으로 건너갈 틈이 없다
const R12 = { z0: 0.6, z1: -2.28, y0: 0.08, y1: 2.9 };          // 1층→2층: z0(아래) 에서 z1(위) 로
const R23 = { z0: 0.6, z1: -2.1, y0: 2.9, y1: 5.6 };            // 2층→루프탑
const HOLE12 = [-2.9, -1.95, -2.28, -0.25], HOLE23 = [-2.9, -1.95, -2.1, -0.3];   // [x0,x1,z0,z1] 위층 바닥 구멍
const TRX0 = -3.87, TRX1 = -3.06;                               // 바깥 돌계단 구덩이 x
const RC = { z0: -2.5, z1: 1.5, y0: 0, y1: -4.2 };              // 북(땅) 에서 남으로 내려간다 (18단, 4.2 m)
const BZ = -4.2, CDOOR = [1.5, 2.3];                            // 지하실 바닥(2026-11-25 두호: 천장을 높여 4.2 m), 서쪽 벽 문(z)
const inRect = (x, z, r) => x > r[0] && x < r[1] && z > r[2] && z < r[3];
const rampY = (r, z) => r.y0 + (r.y1 - r.y0) * (z - r.z0) / (r.z1 - r.z0);
const onRamp = (r, x0, x1, x, z) => x > x0 && x < x1 && z > Math.min(r.z0, r.z1) - 0.02 && z < Math.max(r.z0, r.z1) + 0.02;
// (x,z) 에 설 수 있는 바닥 높이들 중 지금 발높이와 가장 가까운 것. 없으면 NaN
function surfaceAt(x, z, y) {
  const c = [];
  const inHouse = Math.abs(x) < 2.87 && Math.abs(z) < 2.37;
  const inLot = Math.abs(x) <= 8.2 && Math.abs(z) <= 6.7;
  const inFoot = Math.abs(x) < 3.06 && Math.abs(z) < 2.56;
  const inTrench = x > TRX0 && x < TRX1 && z > -2.5 && z < 2.6;
  if (inLot && !inFoot && !inTrench) c.push(0);                                      // 마당
  const on12 = onRamp(R12, SX0, SX1, x, z), on23 = onRamp(R23, SX0, SX1, x, z);
  // 계단 띠 위에서는 그 아래층 바닥을 후보에서 뺀다 — 안 빼면 발높이에 가장 가까운 바닥(1층)이 늘 뽑혀 계단을 밟지 못하고 그 밑을 지나간다(두호 2026-11-26 '계단이 그냥 통과돼')
  if (inHouse) { if (!on12) c.push(0.08); if (!inRect(x, z, HOLE12) && !on23) c.push(2.9); }   // 1층 · 2층
  if (x > 0.3 && x < 1.3 && z >= 2.37 && z < 2.62) c.push(0.08);                      // 현관 문턱(벽 두께 구간). 이게 없으면 문이 열려도 문턱에서 막힌다 (두호 2026-11-23 보고)
  if (inHouse && !inRect(x, z, HOLE23)) c.push(5.6);                                   // 루프탑 데크 + 다락 바닥 (어디가 설 수 있는 곳인지는 blocked 가 가른다)
  if (Math.abs(x) < 2.7 && Math.abs(z) < 2.2) c.push(BZ);                              // 지하실
  if (x > -3.06 && x < -2.7 && z > CDOOR[0] && z < CDOOR[1]) c.push(BZ);               // 지하실 문턱
  if (on12) c.push(rampY(R12, z));
  if (on23) c.push(rampY(R23, z));
  if (inTrench) c.push(z < RC.z1 ? rampY(RC, Math.max(z, RC.z0)) : BZ);                 // 돌계단, 그 아래 바닥
  let best = NaN, bd = Infinity;
  for (const h of c) { const d = Math.abs(h - y); if (d < bd) { bd = d; best = h; } }
  return best;
}
// 벽·가구. 층은 발높이로 가른다
const LEVEL = (y) => (y < -1.0 ? 'B' : y < 1.5 ? 1 : y < 4.3 ? 2 : 3);
const OBST = {      // [x0,x1,z0,z1] 가구 (모델 좌표에서 z 부호를 바꾼 것)
  1: [[0.9, 2.6, -1.35, -0.75], [2.05, 2.65, -0.8, 0.4], [2.1, 2.7, 1.55, 2.05], [-0.05, 0.25, 3.35, 3.65], [1.35, 1.65, 3.35, 3.65]],   // 카운터 ㄱ자, 난로, 현관 포치 기둥 둘(모델 PX0·PX1·PY)
  2: [[0.8, 2.7, -2.2, -1.4], [0.85, 1.95, 0.8, 1.4], [-1.9, -1.1, 0.0, 0.8], [2.15, 2.65, -0.05, 0.45], [-1.95, -1.8, -1.6, -0.25]],   // 작업대, 책상, 이젤, 상자, 계단 구멍 난간
  3: [[-2.45, -1.95, 0.85, 1.35], [-1.45, -0.95, 1.15, 1.65], [-1.95, -1.45, 0.95, 1.45], [-2.85, -2.35, 1.65, 2.15], [-1.95, -1.8, -1.6, -0.3], [-2.9, -1.85, -0.35, -0.2],
      [0.6, 1.0, 0.7, 1.1], [1.75, 2.75, 1.2, 2.2], [1.8, 2.3, -0.15, 0.35], [0.45, 0.95, -2.05, -1.55]],   // 데크 의자 둘·탁자·화분, 계단 머리 난간 / 다락: 장난감 로켓, 텐트, 삼각대, 지구본 탁자
  B: [[1.7, 2.3, 1.2, 1.8], [-0.95, 0.95, 1.7, 2.2], [-0.95, 0.95, -2.2, -1.7]],      // 상자, 남·북 벽의 긴 의자 둘
};
const TABLES = [[-1.5, 1.3], [-0.6, 0.2], [-1.0, -1.2]];     // 1층 둥근 탁자
function blocked(x, z, y) {
  const lv = LEVEL(y);
  const inside = Math.abs(x) < 2.7 && Math.abs(z) < 2.2;
  for (const r of OBST[lv]) if (inRect(x, z, r)) return true;
  if (lv === 'B') {
    if (Math.hypot(x, z) < 0.7) return true;                                                    // 블랙홀 한가운데(반지름 0.7 m)로는 못 들어간다 — 거기가 지평선을 바로 위에서 내려다보는 가장 가까운 자리
    if (inside) return false;
    if (x > TRX0 && x < TRX1 && z > -2.5 && z < 2.6) return false;                        // 구덩이
    if (x >= -3.06 && x <= -2.7 && z > CDOOR[0] && z < CDOOR[1]) return false;              // 문
    return true;
  }
  if (lv === 3) {
    // 데크(서쪽) / 도머 통로(모델 YD0..YD1·XA..XD 를 z 부호만 바꾼 것) / 다락 가운데(지붕이 머리 위 1.5 m 넘는 x 구간: |x-1.2| < 0.98)
    const deck = x > -2.85 && x < -0.65 && Math.abs(z) < 2.3;
    const dormer = x >= -0.75 && x < 0.22 && z > 0.05 && z < 0.95;
    const attic = x >= 0.22 && x < 2.18 && Math.abs(z) < 2.2;
    return !(deck || dormer || attic);
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
    const dy = wp.y - (player.y + eyeH);
    if (r.id !== 'dome' && Math.abs(dy) > 1.6) continue;                          // 다른 층(지하실에서 찻집 등)은 가깝게 재지 않는다
    const d = Math.hypot(wp.x - player.x, dy * 0.6, wp.z - player.z);
    if (d < (REACH[r.id] || 2.2) && d < bd) { bd = d; best = r; }
  }
  if (best !== nearRoom) { nearRoom = best; dirty = true; }
}
function openNear() { if (nearRoom) location.href = nearRoom.href; }
function setHint() {
  if (!hintEl) return;
  hintEl.textContent = padShown() ? '아래 왼쪽 스틱으로 걷고, 오른쪽 패드를 끌어 둘러봐요. 방에 다가가면 이름이 뜨고, 패드를 톡 치면 열려요'
    : TOUCH ? '왼쪽을 누른 채 밀어 걷고, 오른쪽을 끌어 둘러봐요. 방에 다가가면 이름이 떠요'
    : '클릭하면 마우스로 둘러보고(Esc 로 풀기), WASD·방향키로 걸어요. 방에 다가가면 이름이 떠요';
}
portraitQuery.addEventListener('change', setHint);
function startWalk() {
  player.copy(START); wYaw = 0; wPitch = 0.05; nearRoom = null;
  stage.classList.add('walking');
  camera.near = 0.1; camera.far = 80; post.uniforms.near.value = 0.1; post.uniforms.far.value = 80;
  setHint();
  post.uniforms.ssao.value = TOUCH ? 0.55 : 0.8;                                 // 폰은 깊이 12점 읽기가 부담이라 약하게
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));                     // 조금 낮은 해상도로 — 프레임이 끊기면 멀미가 난다
  resize();
  dirty = true;
}
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; stage.classList.toggle('locked', locked); });
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, button, a')) return;
  if (e.code === 'KeyE' || e.code === 'Enter') { openNear(); return; }
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); touched(); }
});
addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
addEventListener('blur', () => keys.clear());
// 검토 스크립트(model/check.js)가 쓰는 손잡이. 사이트 기능이 아니다
window.__house = { get player() { return player; }, get walking() { return true; }, get near() { return nearRoom; }, get blackhole() { return bhOn; }, get bhQ() { return bhQ; }, set bhQ(q) { bhQ = q; bhLock = true; bhResize(); }, get fade() { return fade; }, idle(start, dur) { IDLE.start = start; IDLE.dur = dur; }, teleport(x, y, z, yaw) { player.set(x, y, z); if (yaw !== undefined) wYaw = yaw; touched(); dirty = true; }, canStand, surfaceAt, look(yaw, pitch) { wYaw = yaw; wPitch = pitch; dirty = true; } };

// 이름표(메뉴): 가까운 방 하나만, 그 자리 위에 뜬다
function placeLabels() {
  const b = canvas.getBoundingClientRect();
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
}

frame();
