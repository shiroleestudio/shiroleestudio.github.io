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
  ['돌계단', -3.45, -1.3, -0.3, 0], ['지하실', 1.8, -2.6, 0.3, -2.0], ['블랙홀멍', 1.2, -2.6, 1.6, 0.5],
];
// 막혀야 하는 자리 [이름, x, y, z]
const WALLS = [['1층 벽', 2.95, 0.08, 0.0], ['지하 벽', 2.9, -2.6, 0.0], ['지하 긴 의자', 0.0, -2.6, 1.95], ['블랙홀', 0.0, -2.6, 0.0], ['2층 칸막이', 0.3, 2.9, -1.0], ['데크 밖', -0.3, 5.6, 0.0], ['2층 구멍', -2.4, 2.9, -1.0], ['울타리', 8.5, 0, 0]];
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
      return { walking: window.__house.walking, barBottom: r.bottom, inner: innerHeight, btn: document.querySelector('[data-walk]').textContent, joy: !!document.getElementById('joy') };
    });
    if (!st.walking) bad('걷기가 기본이 아님');
    if (st.barBottom > st.inner + 1) bad(`하단 버튼 줄이 화면 밖 (${st.barBottom.toFixed(0)} > ${st.inner})`);
    if (st.btn !== '둘러보기') bad(`단추 글자 ${st.btn}`);
    await shot(page, path.join(outDir, `${name}-start.png`));
    if (name === 'pc-wide') {
      for (const [label, x, y, z, yaw] of SPOTS) {
        const ok = await page.evaluate(([x, y, z]) => { const H = window.__house; H.teleport(x, y, z); return { stand: H.canStand(x, z), h: H.surfaceAt(x, z, y) }; }, [x, y, z]);
        if (!ok.stand || Math.abs(ok.h - y) > 0.3) bad(`${label} 에 설 수 없음 (canStand ${ok.stand}, 바닥 ${ok.h})`);
        await page.evaluate(([x, y, z, yaw]) => { window.__house.teleport(x, y, z, yaw); window.__house.look(yaw, 0.02); }, [x, y, z, yaw]);
        await page.waitForTimeout(400);
        await shot(page, path.join(outDir, `spot-${SPOTS.indexOf(SPOTS.find((s) => s[0] === label)) + 1}-${label}.png`));
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
      // 멍: 조작이 없으면 배경이 사라진다 (검사에서는 0.3초 뒤부터 1초에 걸쳐)
      await page.evaluate(() => { window.__house.idle(0.3, 1.0); window.__house.teleport(1.2, -2.6, 1.6, 0.5); });
      await page.waitForTimeout(1800);
      const fd = await page.evaluate(() => window.__house.fade);
      if (fd < 0.99) bad(`멍 때려도 배경이 안 사라짐 (fade ${fd})`);
      await shot(page, path.join(outDir, 'blackhole-idle.png'));
      await page.evaluate(() => window.__house.idle(6, 14));
      await page.keyboard.down('KeyA'); await page.waitForTimeout(100); await page.keyboard.up('KeyA'); await page.waitForTimeout(1200);
      const fd2 = await page.evaluate(() => window.__house.fade);
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
      // 둘러보기 전환·복귀
      await page.evaluate(() => document.querySelector('[data-walk]').click()); await page.waitForTimeout(300);   // page.click 은 화면이 '안정'되길 기다리다 무거운 화면에서 시간이 넘친다
      const orbit = await page.evaluate(() => !window.__house.walking && document.querySelector('[data-walk]').textContent);
      if (orbit !== '걷기') bad('둘러보기 전환 실패');
      await shot(page, path.join(outDir, 'orbit.png'));
      await page.evaluate(() => document.querySelector('[data-walk]').click()); await page.waitForTimeout(300);   // page.click 은 화면이 '안정'되길 기다리다 무거운 화면에서 시간이 넘친다
    }
    if (logs.length) { for (const l of logs) bad(l); }
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(fails ? `\n${fails} 건 실패` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
});
