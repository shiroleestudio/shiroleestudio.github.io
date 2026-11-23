// 시로의 집 — 지하실 관측창의 블랙홀 (2단계 블랙홀멍, 두호 2026-11-23: "움직이는 모델로, 더 실사같이, 거의 인터스텔라")
// 모델이 아니라 셰이더다. 관측창 판(glb 의 'blackhole' 노드, 재질 glowhole) 화소마다 광선을 쏘아 슈바르츠실트 블랙홀 둘레의
// 휜 경로(a = -1.5 h² r / r⁵, 도약개구리 적분)를 따라가며 얇은 강착 원반(fbm 필라멘트, 차등 회전, 도플러·중력 적색편이)을
// 지나는 빛을 모은다. 지평선에 떨어진 광선은 검정. 뒤는 별·은하수. 그 결과에 2단 블룸을 더하고 ACES 로 톤을 누른다.
// 비용을 아끼려고 화면의 1/2~1/3 해상도 버퍼에 그린 뒤 관측창 화소가 화면 좌표로 읽어 간다(창이 보일 때만, 지하실에 있을 때만).
// 좌표: 세계 좌표 → (R_tilt · (p − CENTER)) / SCALE 이 셰이더 공간. 원반은 셰이더 y=0 평면. 시선 높이에서 조금 내려다보게 기울인다.
// 블랙홀 회전은 '동작 줄이기' 설정과 무관하게 늘 움직인다 — 물멍·불멍처럼 움직임 자체가 내용이다.
import * as THREE from 'three';

const VERT = 'in vec3 position; out vec2 v; void main(){ v = position.xy; gl_Position = vec4(position.xy, 0., 1.); }';

const SCENE = /* glsl */`
precision highp float;
in vec2 v; out vec4 o;
uniform float t, tanV, aspect; uniform vec3 camPos; uniform mat3 rayMat;
float hash(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0., w = .5; for (int i = 0; i < 5; i++) { a += w * noise(p); p *= 2.07; w *= .5; } return a; }
vec3 stars(vec3 d){
  vec3 col = vec3(0);
  float band = exp(-6. * abs(d.y + 0.25 * d.x));                       // 은하수 띠
  col += vec3(.035, .03, .05) * band * fbm(d * 4. + 1.) * 2.0;
  vec3 g = d * 170.; vec3 id = floor(g); vec3 fr = fract(g) - .5; float h = hash(id);
  if (h > .978) { float s = 1. - smoothstep(0., .2, length(fr)); float b = (h - .978) / .022;
    col += mix(vec3(1., .92, .82), vec3(.75, .82, 1.), hash(id + 1.)) * s * s * (0.4 + 3.0 * b * b); }
  return col;
}
vec3 diskColor(float T){ vec3 c0 = vec3(1., .36, .08), c1 = vec3(1., .70, .38), c2 = vec3(1., .95, .86);   // T 1 = 안쪽(가장 뜨거움)
  return mix(mix(c0, c1, smoothstep(0., .5, T)), c2, smoothstep(.5, 1., T)); }
void main(){
  vec3 rd = normalize(rayMat * vec3(v.x * tanV * aspect, v.y * tanV, -1.));
  vec3 p = camPos, vel = rd;
  vec3 h = cross(p, vel); float h2 = dot(h, h);
  vec3 col = vec3(0); float trans = 1.;
  const float rin = 2.3, rout = 13.5;
  bool hit = false;
  for (int i = 0; i < 260; i++) {
    float r = length(p);
    if (r < 1.02) { hit = true; break; }
    if (r > 70. && dot(p, vel) > 0.) break;
    float dt = clamp(r * 0.07, 0.02, 0.6);
    vec3 a = -1.5 * h2 * p / pow(r, 5.);
    vec3 vh = vel + a * dt * .5; vec3 pn = p + vh * dt; float rn = length(pn);
    vec3 an = -1.5 * h2 * pn / pow(rn, 5.); vec3 vn = vh + an * dt * .5;
    if (p.y * pn.y < 0.) {                                                   // 원반 평면을 지난다
      float f = p.y / (p.y - pn.y); vec3 c = mix(p, pn, f); float rc = length(c.xz);
      if (rc > rin && rc < rout) {
        float ang = atan(c.z, c.x);
        float om = 2.2 * pow(rc, -1.5);
        float A = ang + om * t * 2.2;                                        // 차등 회전(안쪽이 빠름)
        float fil = fbm(vec3(rc * 3.2, A * 1.6, 0.7));
        float fil2 = noise(vec3(rc * 14.0, A * 3.0, 2.0));
        float fil3 = noise(vec3(rc * 40.0, A * 1.2, 5.0));
        float dens = smoothstep(rin, rin + .35, rc) * pow(1. - smoothstep(rout - 5.5, rout, rc), 1.6);
        dens *= pow(0.35 + 1.0 * fil, 2.6) * (0.7 + 0.6 * fil2) * (0.8 + 0.4 * fil3);
        float T = clamp(1.08 * pow(rin / rc, 0.9), 0., 1.);
        vec3 vd = normalize(vec3(-sin(ang), 0., cos(ang))) * sqrt(1.0 / rc) * 0.7;
        float dop = clamp(1.0 + 1.6 * dot(vd, -normalize(vn)), 0.35, 2.0);  // 다가오는 쪽이 밝다
        float grav = sqrt(max(0., 1. - 1.0 / rc));                          // 중력 적색편이
        vec3 e = diskColor(T) * dens * dop * grav * (0.35 + 1.9 * pow(rin / rc, 1.7));
        float alpha = clamp(dens * 0.75, 0., 1.);
        col += trans * e * alpha; trans *= (1. - alpha * 0.9);
        if (trans < 0.02) break;
      }
    }
    p = pn; vel = vn;
  }
  if (!hit) col += trans * stars(normalize(vel));
  o = vec4(col, hit ? 0. : 1.);                                             // a=0: 지평선. 블룸이 그 위로 번지지 않게 가린다
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

// 관측창 판의 재질: 화면 좌표로 버퍼를 읽고 블룸을 얹어 톤을 누른다. 선형 색으로 내놓는다 (감마는 building.js 의 후처리가 한다)
const WINDOW = /* glsl */`
precision highp float;
out vec4 o;
uniform sampler2D base, glow, glow2; uniform vec2 res;
void main(){ vec2 uv = gl_FragCoord.xy / res;
  vec4 b = texture(base, uv); float m = mix(0.12, 1.0, b.a);
  vec3 c = b.rgb + (texture(glow, uv).rgb * 0.8 + texture(glow2, uv).rgb * 0.5) * m;
  c *= 1.15;
  vec3 x = c; c = clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);   // ACES
  o = vec4(c, 1.); }`;

export const BH = {
  CENTER: new THREE.Vector3(0, -1.3, -11.56),   // 세계 좌표. 관측창(z −2.56) 9 m 뒤, 시선 높이 근처 (지하 바닥 −2.6 + 1.3)
  SCALE: 0.5,                                   // m / 셰이더 단위. 원반 바깥 반지름 13.5 단위 = 6.75 m
  TILT: 0.17,                                   // 원반을 보는 사람 쪽으로 기울여 조금 내려다보게 (인터스텔라 각도)
};

export function createBlackHole(renderer) {
  const mk = (frag, uniforms) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const sceneMat = mk(SCENE, { t: { value: 0 }, tanV: { value: 0.5 }, aspect: { value: 1 }, camPos: { value: new THREE.Vector3() }, rayMat: { value: new THREE.Matrix3() } });
  const blurMat = mk(BLUR, { src: { value: null }, dir: { value: new THREE.Vector2() }, thr: { value: 0 } });
  const windowMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: 'in vec3 position; uniform mat4 modelViewMatrix, projectionMatrix; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: WINDOW, uniforms: { base: { value: null }, glow: { value: null }, glow2: { value: null }, res: { value: new THREE.Vector2(1, 1) } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneMat);
  const qscene = new THREE.Scene(); qscene.add(quad);
  const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
  let T = null;
  const tilt = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationX(-BH.TILT));
  const camRot = new THREE.Matrix3(), tmp = new THREE.Vector3();
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qscene, qcam); }
  return {
    material: windowMat,
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
      tmp.copy(camera.position).sub(BH.CENTER).applyMatrix3(tilt).divideScalar(BH.SCALE); u.camPos.value.copy(tmp);
      camRot.setFromMatrix4(camera.matrixWorld);
      u.rayMat.value.copy(tilt).multiply(camRot);
      const prev = renderer.getRenderTarget();
      pass(sceneMat, T.base);
      const bu = blurMat.uniforms;
      bu.src.value = T.base.texture; bu.dir.value.set(1, 0); bu.thr.value = 0.6; pass(blurMat, T.a);
      bu.src.value = T.a.texture; bu.dir.value.set(0, 1); bu.thr.value = 0; pass(blurMat, T.b);
      bu.src.value = T.b.texture; bu.dir.value.set(1, 0); pass(blurMat, T.c);
      bu.src.value = T.c.texture; bu.dir.value.set(0, 1); pass(blurMat, T.d);
      renderer.setRenderTarget(prev);
    },
  };
}
