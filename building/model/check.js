// 시로의 집 — 걷기 검토 스크립트 (선택 도구, 저장소 의존성 아님. 계획서 7절 '오류 0 검토 루프')
// 헤드리스 크로미움으로 네 화면 크기에서 첫 화면을 열고, 걷기가 기본으로 켜졌는지, 콘솔 오류·경고가 없는지,
// 마당→현관→1층→계단→2층→루프탑, 바깥 돌계단→지하실 자리에 설 수 있는지(발높이), 벽을 뚫지 못하는지, 지하 관측창의 블랙홀이 창을 볼 때만 그려지고 움직이는지 확인한 뒤 캡처한다.
// 필요: node + playwright(크로미움). 실행: node building/model/check.js <저장소 뿌리> <출력 폴더>
// building.js 가 window.__house 로 내놓는 손잡이(teleport·canStand·surfaceAt·look)를 쓴다.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [dir, outDir] = process.argv.slice(2);
if (!dir || !outDir) { console.error('사용: node check.js <저장소 뿌리> <출력 폴더>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', glb: 'model/gltf-binary', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dir, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f).slice(1)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
// 서 있을 수 있어야 하는 자리 [이름, x, y(발), z, yaw]
const SPOTS = [
  ['마당', 0.8, 0, 6.6, 0], ['현관 앞', 0.8, 0, 3.0, 0], ['찻집', 0.0, 0.08, 0.5, 0.6],
  ['계단 중간', -2.4, 1.5, -0.85, 0], ['2층', -1.0, 2.9, -1.5, 2.2], ['루프탑', -1.5, 5.6, 0.5, 2.6],
  ['돌계단', -3.45, -2.3, -0.3, 0], ['지하실', 1.8, -4.2, 0.3, -2.0], ['블랙홀멍', 2.2, -4.2, -1.0, 1.99],
  ['도머 입구', -0.5, 5.6, 0.5, -1.57], ['다락', 1.2, 5.6, 0.3, 0.8], ['현관 포치', 0.8, 0, 4.2, 0],
];
// 막혀야 하는 자리 [이름, x, y, z]
const WALLS = [['1층 벽', 2.95, 0.08, 0.0], ['지하 벽', 2.9, -4.2, 0.0], ['지하 긴 의자', 0.0, -4.2, 1.95], ['블랙홀', 0.0, -4.2, 0.0], ['2층 칸막이', 0.3, 2.9, -1.0], ['데크 밖', -0.3, 5.6, 0.0], ['2층 구멍', -2.4, 2.9, -1.0], ['울타리', 8.5, 0, 0], ['다락 낮은 쪽', 2.5, 5.6, 0.0], ['도머 옆벽', -0.3, 5.6, 1.3], ['포치 기둥', 0.1, 0, 3.5]];
// 캡처: locator.screenshot 은 요소가 '안정'될 때까지 기다리는데 무거운 화면에서는 시간이 넘친다 → 무대 영역을 잘라 바로 찍는다
const shot = async (page, file) => { const r = await page.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }); return page.screenshot({ path: file, clip: r, animations: 'disabled', timeout: 60000 }); };
const SIZES = [['pc-wide', 1536, 700], ['pc-tall', 1280, 900], ['phone', 390, 844], ['phone-land', 844, 390]];
srv.listen(0, async () => {
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let fails = 0;
  const bad = (m) => { fails++; console.log('  FAIL', m); };
  for (const [name, w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: name.startsWith('phone') });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/GL Driver Message|GPU stall/.test(m.text())) logs.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => !document.querySelector('.loading') && window.__house, null, { timeout: 90000 });
    await page.waitForTimeout(800);
    console.log(`[${name}] ${w}x${h}`);
    const st = await page.evaluate(() => {
      const bar = document.querySelector('.bar'), r = bar.getBoundingClientRect();
      const pad = document.getElementById('pad'), sb = document.getElementById('stage').getBoundingClientRect();
      return { walking: window.__house.walking, barBottom: r.bottom, inner: innerHeight, joy: !!document.getElementById('joy'), pad: getComputedStyle(pad).display !== 'none', ratio: sb.width / sb.height };
    });
    if (!st.walking) bad('걷기가 기본이 아님');
    if (st.barBottom > st.inner + 1) bad(`하단 버튼 줄이 화면 밖 (${st.barBottom.toFixed(0)} > ${st.inner})`);
    // 세로 폰: 무대 16:10 + 아래 가상 게임패드. 그 외는 패드 없음
    if (name === 'phone') { if (!st.pad) bad('세로 폰에 게임패드가 없음'); if (Math.abs(st.ratio - 1.6) > 0.05) bad(`세로 폰 무대 비율 ${st.ratio.toFixed(2)} (16:10 이어야)`); await page.screenshot({ path: path.join(outDir, 'phone-page.png'), animations: 'disabled', timeout: 60000 }); }
    else if (st.pad) bad(`${name} 에 게임패드가 보임`);
    await shot(page, path.join(outDir, `${name}-start.png`));
    if (name === 'pc-wide') {
      for (const [label, x, y, z, yaw] of SPOTS) {
        const ok = await page.evaluate(([x, y, z]) => { const H = window.__house; H.teleport(x, y, z); return { stand: H.canStand(x, z), h: H.surfaceAt(x, z, y) }; }, [x, y, z]);
        if (!ok.stand || Math.abs(ok.h - y) > 0.3) bad(`${label} 에 설 수 없음 (canStand ${ok.stand}, 바닥 ${ok.h})`);
        await page.evaluate(([x, y, z, yaw]) => { window.__house.teleport(x, y, z, yaw); window.__house.look(yaw, 0.02); }, [x, y, z, yaw]);
        await page.waitForTimeout(400);
        await shot(page, path.join(outDir, `spot-${SPOTS.indexOf(SPOTS.find((s) => s[0] === label)) + 1}-${label}.png`));
        if (label === '계단 중간') {
          // 걸어서 올라가기: 1층 계단 아래에서 0.1 m 씩 옮기며(북 → 꼭대기에서 동쪽 2층 → 남 → 위 계단 → 북 → 동쪽 데크) 발높이가 2층(2.9)·루프탑(5.6)에 닿는지 (두호 2026-11-26 '계단이 그냥 통과돼')
          const top = await page.evaluate(() => { const H = window.__house; const PATH = [[-2.4, 1.0], [-2.4, -2.1], [-1.0, -2.1], [-1.0, 1.0], [-2.4, 1.0], [-2.4, -2.0], [-1.7, -2.0]]; let [x, z] = PATH[0]; let y = 0.08; H.teleport(x, y, z); const ys = []; for (let k = 1; k < PATH.length; k++) { const [tx, tz] = PATH[k]; const n = Math.ceil(Math.hypot(tx - x, tz - z) / 0.1); for (let i = 1; i <= n; i++) { const nx = x + (tx - x) * i / n, nz = z + (tz - z) * i / n; if (!H.canStand(nx, nz)) return { stop: [nx.toFixed(2), nz.toFixed(2)], y: y.toFixed(2), ys }; y = H.surfaceAt(nx, nz, y); H.teleport(nx, y, nz); } x = tx; z = tz; ys.push(+y.toFixed(2)); } return { ys }; });
          if (top.stop || Math.abs(top.ys[2] - 2.9) > 0.05 || Math.abs(top.ys[6] - 5.6) > 0.05) bad(`걸어서 계단을 못 오름 ${JSON.stringify(top)}`);
          await page.evaluate(([x, y, z, yaw]) => { window.__house.teleport(x, y, z, yaw); window.__house.look(yaw, 0.02); }, [x, y, z, yaw]);
        }
        // 블랙홀은 창을 볼 때만 그려야 한다 (지하실 자리는 남쪽 벽을 보고, 블랙홀멍 자리는 북쪽 창을 본다)
        const bhOn = await page.evaluate(() => window.__house.blackhole);
        if (label === '블랙홀멍' && !bhOn) bad('블랙홀을 보는데 그려지지 않음');
        if (label !== '블랙홀멍' && label !== '지하실' && bhOn) bad(`${label} 에서 블랙홀이 그려짐`);
      }
      // 블랙홀은 늘 움직인다: 두 시점의 캡처가 달라야 한다
      await page.evaluate(() => { window.__house.teleport(1.2, -2.6, 1.6, 0.5); window.__house.look(0.5, -0.15); });
      await page.waitForTimeout(400);
      const f1 = await shot(page, path.join(outDir, 'blackhole-1.png')); await page.waitForTimeout(700);
      const f2 = await shot(page, path.join(outDir, 'blackhole-2.png'));
      if (f1.equals(f2)) bad('블랙홀이 움직이지 않음');
      // 실제로 그려졌는지: 캡처 가운데 띠에 밝은 화소(원반)와 아주 어두운 화소(지평선)가 함께 있어야 한다
      // (WebGL 캔버스는 그린 뒤 버퍼를 비워 drawImage 로 읽을 수 없으니, 스크린샷 PNG 를 페이지 안에서 풀어 센다)
      const bright = await page.evaluate((b64) => new Promise((res) => {
        const im = new Image(); im.onload = () => {
          const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
          const y0 = Math.floor(im.height * 0.45), d = x.getImageData(0, y0, im.width, Math.max(1, Math.floor(im.height * 0.1))).data; let hi = 0, lo = 0;
          for (let i = 0; i < d.length; i += 4) { const m = Math.max(d[i], d[i + 1], d[i + 2]); if (m > 180) hi++; if (m < 25) lo++; }
          res({ hi, lo });
        }; im.src = 'data:image/png;base64,' + b64;
      }), f2.toString('base64'));
      if (bright.hi < 50 || bright.lo < 50) bad(`블랙홀이 안 보임 (밝은 화소 ${bright.hi}, 어두운 화소 ${bright.lo})`);
      // 멍: 조작이 없으면 배경이 사라진다 (검사에서는 0.3초 뒤부터 1초에 걸쳐)
      await page.evaluate(() => { window.__house.idle(0.3, 1.0); window.__house.teleport(1.2, -2.6, 1.6, 0.5); });
      const fd = await page.waitForFunction(() => window.__house.fade >= 0.99, null, { timeout: 15000 }).then(() => 1).catch(() => page.evaluate(() => window.__house.fade));   // 헤드리스는 한 장에 1~2초 걸리니 시간이 아니라 값으로 기다린다
      if (fd < 0.99) bad(`멍 때려도 배경이 안 사라짐 (fade ${fd})`);
      await shot(page, path.join(outDir, 'blackhole-idle.png'));
      await page.evaluate(() => window.__house.idle(6, 14));
      await page.keyboard.down('KeyA'); await page.waitForTimeout(100); await page.keyboard.up('KeyA');
      const fd2 = await page.waitForFunction(() => window.__house.fade <= 0.01, null, { timeout: 15000 }).then(() => 0).catch(() => page.evaluate(() => window.__house.fade));
      if (fd2 > 0.01) bad(`조작했는데 배경이 안 돌아옴 (fade ${fd2})`);
      for (const [label, x, y, z] of WALLS) {
        const ok = await page.evaluate(([x, y, z]) => { const H = window.__house; H.teleport(0, y, 0); H.player.y = y; return H.canStand(x, z); }, [x, y, z]);
        if (ok) bad(`${label} 을 뚫고 지나감`);
      }
      // 실제로 걷기: 마당에서 앞으로 3초 → 현관을 지나 찻집 안
      await page.evaluate(() => { window.__house.teleport(0.8, 0, 6.6, 0); window.__house.look(0, 0.02); });
      await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
      const pz = await page.evaluate(() => window.__house.player.z);
      if (pz > 6.5) bad(`앞으로 걸어도 움직이지 않음 (z ${pz.toFixed(2)})`);       // 헤드리스는 느려서 거리는 재지 않는다
      const doorOk = await page.evaluate(() => { const H = window.__house; H.teleport(0.8, 0.0, 2.8); return [2.6, 2.45, 2.3, 2.0].every((z) => H.canStand(0.8, z)); });   // 문턱(벽 두께 구간 2.37~2.56)도 지나야 한다
      if (!doorOk) bad('현관 문턱을 지날 수 없음');
    }
    if (logs.length) { for (const l of logs) bad(l); }
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(fails ? `\n${fails} 건 실패` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
});
