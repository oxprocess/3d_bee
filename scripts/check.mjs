// 冒烟检查：用无头浏览器直接打开 dist 里的单文件页面（file://，和双击打开一样），
// 走一遍关键步骤，报告控制台错误，截图放到 .cache/check/。
// 需要 Playwright：npm i -D playwright（或全局安装）。
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('没有找到 playwright。先运行：npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.cache/check');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const cases = [
  { page: 'index.html', size: [1440, 900], scheme: 'light', steps: ['#seal', '#resolve', '#dig', '#lens'] },
  { page: 'index.html', size: [390, 844], scheme: 'dark', steps: ['#inherit'] },
  { page: 'lab.html', size: [1440, 900], scheme: 'light', clicks: ['seal', 'yes', 'iterate', 'burst'], dig: true },
];
let failed = 0;
for (const c of cases) {
  const page = await browser.newPage({ viewport: { width: c.size[0], height: c.size[1] }, colorScheme: c.scheme });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // 字体来自 Google Fonts；离线或代理环境加载失败不算页面错误
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto(pathToFileURL(path.join(root, 'dist', c.page)).href);
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__dbb.stage.advance(1));
  const tag = `${c.page.replace('.html', '')}-${c.size[0]}-${c.scheme}`;
  await page.screenshot({ path: path.join(out, `${tag}-0.png`) });
  for (const [i, sel] of (c.steps ?? []).entries()) {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView(), sel);
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__dbb.stage.advance(3));
    await page.screenshot({ path: path.join(out, `${tag}-${i + 1}.png`) });
  }
  for (const [i, ev] of (c.clicks ?? []).entries()) {
    await page.click(`[data-ev="${ev}"]`);
    await page.evaluate((e) => window.__dbb.stage.advance(e === 'iterate' ? 7 : 2.5), ev);
    await page.waitForTimeout(ev === 'burst' ? 9000 : 600);
    await page.evaluate(() => window.__dbb.stage.advance(2.5));
    await page.screenshot({ path: path.join(out, `${tag}-${i + 1}.png`) });
  }
  if (c.dig) {
    // 剖开、剥到最深，再合上：圆润的环带、化开的层、剖面的轮廓都走一遍
    await page.evaluate(() => { window.__dbb.stage.setDepth(1); return window.__dbb.stage.advance(2.5); });
    await page.screenshot({ path: path.join(out, `${tag}-section.png`) });
    await page.evaluate(() => { window.__dbb.stage.setDepth(window.__dbb.stage.N); return window.__dbb.stage.advance(3); });
    await page.screenshot({ path: path.join(out, `${tag}-core.png`) });
    await page.evaluate(() => { window.__dbb.stage.setDepth(0); return window.__dbb.stage.advance(2); });
  }
  const state = await page.evaluate(() => ({ layers: window.__dbb.store.view.layers.length, events: window.__dbb.store.ledger.events.length }));
  console.log(`${errors.length ? '✗' : '✓'} ${tag}  代数 ${state.layers} · 账本 ${state.events} 行${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
  failed += errors.length ? 1 : 0;
  await page.close();
}
await browser.close();
console.log(`截图：${path.relative(root, out)}/`);
process.exit(failed ? 1 : 0);
