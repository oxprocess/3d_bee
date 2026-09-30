// 导出标志文件到 docs/brand/：和页面用的是同一个 ui/logo.js，轮廓由生长规则算出来。
// 用法：node scripts/brand.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { logoSvg, appIconSvg, lockupSvg } from '../src/ui/logo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/brand');
await mkdir(out, { recursive: true });
const files = {
  'logo.svg': logoSvg({ theme: 'light' }), // 主标志：浅色底
  'logo-dark.svg': logoSvg({ theme: 'dark' }), // 深色底
  'logo-motion.svg': logoSvg({ theme: 'light', motion: true }), // 色带缓缓流动（网页用）
  'logo-mono.svg': logoSvg({ mono: '#1C1C22' }), // 单色（屏幕）
  'logo-lines.svg': logoSvg({ mono: '#1C1C22', water: 'lines' }), // 单色，影子是三道横线（印刷、雕刻）
  'logo-white.svg': logoSvg({ mono: '#FFFFFF', water: 'lines' }), // 反白
  'mark.svg': logoSvg({ water: 'none', glint: 0 }), // 只留主体：页签图标、极小的尺寸
  'app-icon.svg': appIconSvg({ theme: 'light' }),
  'app-icon-dark.svg': appIconSvg({ theme: 'dark' }),
  'lockup.svg': lockupSvg({ theme: 'light' }),
  'lockup-dark.svg': lockupSvg({ theme: 'dark' }),
};
for (const [name, svg] of Object.entries(files)) {
  await writeFile(path.join(out, name), `${svg}\n`);
  console.log(`docs/brand/${name}  ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
}
