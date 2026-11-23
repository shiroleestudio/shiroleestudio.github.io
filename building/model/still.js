// 시로의 집 — 정지 그림 만들기 (선택 도구, 저장소 의존성 아님)
// 3D 가 안 되는 기기의 대체 그림(building/house.webp)과 공유 이미지(assets/og.png)의 원본을 헤드리스 브라우저로 찍는다(마당 구석에서 집을 본 1인칭 시점).
// 필요: node + playwright(크로미움). 실행: node building/model/still.js <저장소 뿌리> <출력 폴더> → stage.png.
// 그 뒤 PIL 등으로 house.webp(가로 1200, WebP 78) 와 og.png(1200x630, 128색 PNG) 로 줄인다. 모델이나 그림체가 바뀌면 다시 만든다.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [dir, outDir] = process.argv.slice(2);
const types = { html:'text/html', js:'text/javascript', css:'text/css', glb:'model/gltf-binary', png:'image/png', svg:'image/svg+xml', webp:'image/webp' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dir, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f).slice(1)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
srv.listen(0, async () => {
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 860 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !document.querySelector('.loading') && window.__house, null, { timeout: 90000 });
  await page.evaluate(() => { window.__house.teleport(-2.4, 0, 6.8, -0.4); window.__house.look(-0.4, 0.12); });   // 길 왼쪽(가로등·우편함 반대편)에서 집을 비스듬히 올려다본다
  await page.waitForTimeout(2500);
  await page.locator('#stage').screenshot({ path: path.join(outDir, 'stage.png') });
  await browser.close(); srv.close();
});
