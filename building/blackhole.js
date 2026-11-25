// 시로의 집 — 지하실 한가운데의 블랙홀 (2단계 블랙홀멍, 두호 2026-11-23: "움직이는 모델로, 더 실사같이, 거의 인터스텔라",
// "지하실 한가운데에 캠프파이어처럼. 멍때리다 보면(조작이 없으면) 배경이 점점 사라지고 블랙홀만 남게")
// 모델이 아니라 셰이더다. 방 가운데 지름 2.4 m 공(building.js 가 만든다) 화소마다 카메라에서 광선을 쏘아 슈바르츠실트 블랙홀
// 둘레의 휜 경로(a = -1.5 h² r / r⁵, 도약개구리 적분)를 따라가며 얇은 강착 원반(fbm 필라멘트, 차등 회전, 도플러·중력 적색편이)을
// 지나는 빛을 모은다. 지평선에 떨어진 광선은 검정, 비껴간 광선은 투명(방이 비쳐 보인다). 그 위에 2단 블룸, ACES.
// 비용을 아끼려고 화면의 1/2 해상도 버퍼에 (미리 곱한 알파로) 그린 뒤 공의 화소가 화면 좌표로 읽어 간다 — 지하실에서 공이 보일 때만.
// 좌표: 세계 좌표 → (p − CENTER) / SCALE 이 셰이더 공간. 원반은 셰이더 y=0 평면(수평), 눈높이가 원반보다 높아 자연히 내려다본다.
// 블랙홀 회전은 '동작 줄이기' 설정과 무관하게 늘 움직인다 — 물멍·불멍처럼 움직임 자체가 내용이다.
import * as THREE from 'three';

const VERT = 'in vec3 position; out vec2 v; void main(){ v = position.xy; gl_Position = vec4(position.xy, 0., 1.); }';

const SCENE = /* glsl */`
precision highp float;
in vec2 v; out vec4 o;
uniform float t, tanV, aspect; uniform vec3 camPos; uniform mat3 rayMat;
const float BOUND = 16.0;
float hash(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0., w = .5; for (int i = 0; i < 5; i++) { a += w * noise(p); p *= 2.07; w *= .5; } return a; }
// 원반 색(반지름 기준, 인터스텔라 가르강튀아 참고 이미지, 두호 2026-11-24): 안쪽 흰 크림 → 노랑 → 주황 → 바깥은 어두운 적갈색으로 꺼진다
vec3 diskColor(float rc){ float x = (rc - 2.3) / 7.7;
  vec3 c0 = vec3(1., .97, .90), c1 = vec3(1., .72, .36), c2 = vec3(.62, .22, .07), c3 = vec3(.10, .03, .01);
  return mix(mix(mix(c0, c1, smoothstep(0., .22, x)), c2, smoothstep(.22, .62, x)), c3, smoothstep(.62, 1., x)); }
const float rin = 2.3, rout = 10.0;                                       // 원반 바깥을 13.5→10 으로: 그림자(2.6) 대비 원반이 참고 이미지 비율(약 4배)
// 원반 밀도: 매끈한 반지름 분포 × 나선으로 길게 늘인 실(각도에 반지름을 더해 비틀어 나선이 된다, MisterPrada/singularity 의 회전 위상 발상만 참고) — 가는 동심원 줄무늬는 넣지 않는다
float diskDens(float rc, float A){
  float prof = smoothstep(rin, rin + .4, rc) * (1. - smoothstep(rout - 2.5, rout, rc));
  float S = A + rc * 0.55;                                                   // 나선 위상
  float fil = fbm(vec3(rc * 0.8, 2.2 * cos(S), 2.2 * sin(S)));                // 각도를 원 위의 점으로 넣어 둘레가 이어진다(atan 의 ±π 이음새 없음)
  float fil2 = noise(vec3(rc * 2.6, 5.0 * cos(2. * S), 5.0 * sin(2. * S)));
  return prof * (0.55 + 0.6 * fil) * (0.85 + 0.3 * fil2);                   // 대비를 낮게 — 참고 이미지는 실이 많아도 전체가 매끈하게 빛난다
}
void main(){
  vec3 rd = normalize(rayMat * vec3(v.x * tanV * aspect, v.y * tanV, -1.));
  // 경계 공(반지름 BOUND)과 만나는 데서 시작한다. 비껴가면 투명
  float b = dot(camPos, rd), c0 = dot(camPos, camPos) - BOUND * BOUND, disc = b * b - c0;
  if (disc < 0.) { o = vec4(0.); return; }
  float t0 = max(0., -b - sqrt(disc));
  vec3 p = camPos + rd * t0, vel = rd;
  vec3 h = cross(p, vel); float h2 = dot(h, h);
  vec3 col = vec3(0); float trans = 1.;
  bool hit = false;
  for (int i = 0; i < 360; i++) {                                           // 걸음을 촘촘히(0.05 r) 하고 횟수를 늘려 광자 고리·렌즈 가장자리가 매끈하게
    float r = length(p);
    if (r < 1.02) { hit = true; break; }
    if (r > BOUND && dot(p, vel) > 0.) break;
    float dt = clamp(r * 0.05, 0.015, 0.5);
    vec3 a = -1.5 * h2 * p / pow(r, 5.);
    vec3 vh = vel + a * dt * .5; vec3 pn = p + vh * dt; float rn = length(pn);
    vec3 an = -1.5 * h2 * pn / pow(rn, 5.); vec3 vn = vh + an * dt * .5;
    float rcv = length(p.xz);
    // 원반 위아래로 번지는 얇은 빛안개(원반에 두께감, 참고 이미지의 고리 둘레 번짐) — 평면 가까이에서만 적분한다
    if (abs(p.y) < 1.2 && rcv > rin && rcv < rout + 1.5) {
      float hz = exp(-abs(p.y) * 5.0) * smoothstep(rin, rin + .6, rcv) * (1. - smoothstep(rout - 3., rout + 1.5, rcv));
      col += trans * diskColor(rcv) * hz * dt * (0.02 + 0.14 * pow(rin / rcv, 1.6));
    }
    if (p.y * pn.y < 0.) {                                                   // 원반 평면을 지난다
      float f = p.y / (p.y - pn.y); vec3 c = mix(p, pn, f); float rc = length(c.xz);
      if (rc > rin && rc < rout) {
        float ang = atan(c.z, c.x);
        float om = 2.2 * pow(rc, -1.5);
        float A = ang + om * t * 2.2;                                        // 차등 회전(안쪽이 빠름)
        float dens = diskDens(rc, A);
        // 도플러 빔 δ³ (gargantua-cinema 의 식): 원 궤도 속도 β = 1/√(2(r−1)), δ = 1/(γ(1−βμ)), μ = 속도 방향 · 카메라 쪽. 다가오는 쪽이 훨씬 밝다
        vec3 vd = normalize(vec3(-sin(ang), 0., cos(ang)));
        float beta = min(0.99, inversesqrt(2.0 * max(rc - 1.0, 0.05)));
        float gam = inversesqrt(1.0 - beta * beta);
        float mu = dot(vd, -normalize(vn));
        float del = 1.0 / (gam * (1.0 - beta * mu));
        float dop = clamp(del * del * del, 0.12, 5.0) * 0.6;
        float grav = sqrt(max(0., 1. - 1.0 / rc));                          // 중력 적색편이
        vec3 e = diskColor(rc) * dens * dop * grav * (0.3 + 2.6 * pow(rin / rc, 1.6));
        float alpha = clamp(dens * 0.8, 0., 1.);
        col += trans * e * alpha; trans *= (1. - alpha * 0.92);
        if (trans < 0.02) break;
      }
    }
    p = pn; vel = vn;
  }
  float cov = hit ? 1. : clamp(1. - trans + min(0.4, dot(col, vec3(0.3))), 0., 1.);   // 덮는 정도: 지평선은 1(검정), 원반은 불투명도(+빛안개 조금), 비껴가면 0
  o = vec4(col, cov);                                                        // 미리 곱한 알파
}`;

const BLUR = /* glsl */`
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D src; uniform vec2 dir; uniform float thr;
void main(){ vec2 uv = v * .5 + .5; vec2 px = dir / vec2(textureSize(src, 0));
  float w[9] = float[](0.16, 0.15, 0.12, 0.09, 0.06, 0.035, 0.02, 0.01, 0.005);
  vec3 s = vec3(0);
  for (int i = -8; i <= 8; i++) { vec3 c = texture(src, uv + px * float(i) * 1.5).rgb; c = max(c - thr, 0.); s += c * w[abs(i)]; }
  o = vec4(s, 1.); }`;

// 공의 재질: 화면 좌표로 버퍼를 읽고 블룸을 얹어 톤을 누른다. 선형 색·미리 곱한 알파로 내놓는다 (감마는 building.js 의 후처리가 한다)
const SPHERE = /* glsl */`
precision highp float;
out vec4 o;
uniform sampler2D base, glow, glow2; uniform vec2 res;
void main(){ vec2 uv = gl_FragCoord.xy / res;
  vec4 b = texture(base, uv);
  float m = mix(1.0, 0.1, step(0.999, b.a));                                               // 지평선(a=1) 안으로는 빛무리가 번지지 않는다 — 그림자는 검어야 한다
  vec3 g = (texture(glow, uv).rgb * 0.8 + texture(glow2, uv).rgb * 0.7) * m;
  vec3 c = (b.rgb + g) * 1.15;
  vec3 x = c; c = clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);   // ACES
  float a = clamp(b.a + dot(g, vec3(0.5)), 0., 1.);                                        // 빛무리도 조금 가린다
  o = vec4(c, a); }`;

export const BH = {
  CENTER: new THREE.Vector3(0, -3.1, 0),        // 세계 좌표. 지하실(바닥 −4.2, 천장 높이 4.2 m) 한가운데, 바닥 위 1.1 m — 눈높이(1.45)에서 살짝 내려다본다
  RADIUS: 2.1,                                  // 경계 공 반지름(m). 방 안(벽 ±2.2) 에 들어가야 한다 — 벽이 공의 뒷면을 가리면 블랙홀이 사라진다
  // 거리 압축(2026-11-25 두호 "현실성을 좀 무시해도 돼. 가까이 가려 할수록 진짜 블랙홀 사이즈처럼 커 보이는 거지"):
  // 실제 거리 d(m) 를 셰이더 거리 g(d) 단위로 옮긴다. 벽가(3.2 m) 에서는 16 단위(원반 밖, 인터스텔라 구도), 가장 가까운 0.7 m(충돌 원) 에서는
  // 6.5 단위 — 원반 안쪽까지 들어가지만 앙각을 과장(TILT)해 위에서 내려다보므로 지평선이 화면을 크게 채운다.
  NEAR_M: 0.7, FAR_M: 3.2, NEAR_U: 6.5, FAR_U: 16.0,
  TILT_FAR: 2.0, TILT_NEAR: 0.3,                // 앙각 배율(실제 앙각의 탄젠트에 곱한다): 벽가 2배(살짝 내려다보는 인터스텔라 구도) → 가장 가까이 0.3배(눈이 원반 높이 가까이 내려가
                                                // 원반 위를 걷는 느낌, 지평선이 눈앞에 벽처럼 선다 — 두호 2026-11-25 "위에서 보는 게 아니고 강착원반에서 걷는 느낌"). 시선은 되돌려 블랙홀이 실제 자리에 보인다
  tilt(d) { const t = Math.min(1, Math.max(0, (d - this.NEAR_M) / (this.FAR_M - this.NEAR_M))); return this.TILT_NEAR + (this.TILT_FAR - this.TILT_NEAR) * t; },
  dist(d) { const t = Math.min(1, Math.max(0, (d - this.NEAR_M) / (this.FAR_M - this.NEAR_M))); return this.NEAR_U + (this.FAR_U - this.NEAR_U) * t; },
};

export function createBlackHole(renderer) {
  const mk = (frag, uniforms) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const sceneMat = mk(SCENE, { t: { value: 0 }, tanV: { value: 0.5 }, aspect: { value: 1 }, camPos: { value: new THREE.Vector3() }, rayMat: { value: new THREE.Matrix3() } });
  const blurMat = mk(BLUR, { src: { value: null }, dir: { value: new THREE.Vector2() }, thr: { value: 0 } });
  const windowMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: 'in vec3 position; uniform mat4 modelViewMatrix, projectionMatrix; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: SPHERE, uniforms: { base: { value: null }, glow: { value: null }, glow2: { value: null }, res: { value: new THREE.Vector2(1, 1) } },
    transparent: true, depthWrite: false, side: THREE.BackSide,   // 안쪽 면을 그린다 — 공이 방을 거의 채워 사람이 공 안에 서 있을 때가 많다 (앞면이면 안에서는 사라진다)
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneMat);
  const qscene = new THREE.Scene(); qscene.add(quad);
  const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
  let T = null;
  const real = new THREE.Vector3(), virt = new THREE.Vector3(), dirA = new THREE.Vector3(), dirB = new THREE.Vector3(), qFix = new THREE.Quaternion(), mFix = new THREE.Matrix4(), m4 = new THREE.Matrix4();
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qscene, qcam); }
  return {
    material: windowMat,
    coverage: () => (T ? T.base.texture : null),      // 화면 좌표 버퍼(알파 = 블랙홀이 덮는 정도). 후처리가 '멍' 때 배경을 지울 때 쓴다
    // 버퍼 크기: 화면 화소의 scale 배. 전체 캔버스 크기(화소)도 받아 창 재질이 화면 좌표를 읽게 한다
    setSize(cw, ch, scale) {
      const w = Math.max(8, Math.floor(cw * scale)), h = Math.max(8, Math.floor(ch * scale));
      if (T && T.base.width === w && T.base.height === h) { windowMat.uniforms.res.value.set(cw, ch); return; }
      if (T) for (const k in T) T[k].dispose();
      T = { base: rt(w, h), a: rt(w >> 2, h >> 2), b: rt(w >> 2, h >> 2), c: rt(w >> 3, h >> 3), d: rt(w >> 3, h >> 3) };
      windowMat.uniforms.base.value = T.base.texture; windowMat.uniforms.glow.value = T.b.texture; windowMat.uniforms.glow2.value = T.d.texture;
      windowMat.uniforms.res.value.set(cw, ch);
    },
    // 지금 카메라가 보는 대로 블랙홀을 그린다 (세계 좌표 → 셰이더 공간)
    render(camera, time) {
      if (!T) return;
      const u = sceneMat.uniforms;
      u.t.value = time;
      u.tanV.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); u.aspect.value = camera.aspect;
      // 거리 압축 + 앙각 과장: 실제 카메라 위치 → 가상 위치. 시선 기준은 '블랙홀 중심이 실제 자리에 보이도록' 돌린다
      real.copy(camera.position).sub(BH.CENTER); const d = real.length();
      virt.set(real.x, real.y * BH.tilt(d), real.z).normalize().multiplyScalar(BH.dist(d));
      u.camPos.value.copy(virt);
      dirA.copy(real).multiplyScalar(-1).normalize(); dirB.copy(virt).multiplyScalar(-1).normalize();
      qFix.setFromUnitVectors(dirA, dirB); mFix.makeRotationFromQuaternion(qFix);
      m4.multiplyMatrices(mFix, camera.matrixWorld); u.rayMat.value.setFromMatrix4(m4);
      const prev = renderer.getRenderTarget();
      pass(sceneMat, T.base);
      const bu = blurMat.uniforms;
      bu.src.value = T.base.texture; bu.dir.value.set(1, 0); bu.thr.value = 0.45; pass(blurMat, T.a);
      bu.src.value = T.a.texture; bu.dir.value.set(0, 1); bu.thr.value = 0; pass(blurMat, T.b);
      bu.src.value = T.b.texture; bu.dir.value.set(1, 0); pass(blurMat, T.c);
      bu.src.value = T.c.texture; bu.dir.value.set(0, 1); pass(blurMat, T.d);
      renderer.setRenderTarget(prev);
    },
  };
}
