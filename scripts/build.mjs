// 打包：把每个页面连同 three.js、样式和脚本内联成一个 HTML，双击就能离线打开。
//   dist/index.html  形态走查
//   dist/lab.html    形态实验台
//   dist/artifact/*  去掉 <html>/<head>/<body> 外壳的版本（发布到 claude.ai 用）
// 用法：node scripts/build.mjs [--lab-url=…] [--walk-url=…]
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const links = { lab: arg('lab-url'), walk: arg('walk-url') };

const pages = [
  { html: 'src/index.html', entry: 'src/pages/walkthrough.js', out: 'index.html' },
  { html: 'src/lab.html', entry: 'src/pages/lab.js', out: 'lab.html' },
];

async function bundle(entry) {
  const res = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    target: 'es2021',
    legalComments: 'none',
    logLevel: 'warning',
  });
  return res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

async function inlineCss(html, htmlPath) {
  const dir = path.dirname(path.join(root, htmlPath));
  const re = /<link rel="stylesheet" href="(\.\/[^"]+\.css)">/g;
  let out = html;
  for (const m of html.matchAll(re)) {
    const css = await readFile(path.join(dir, m[1]), 'utf8');
    out = out.replace(m[0], `<style>\n${css.replace(/<\/style/gi, '<\\/style')}</style>`);
  }
  return out;
}

function artifactVariant(html) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
  const rest = head
    .replace(title, '')
    .replace(/<meta charset="utf-8">\s*/, '')
    .replace(/<meta name="viewport"[^>]*>\s*/, '');
  let out = `${title}\n${rest.trim()}\n${body.trim()}\n`;
  // 发布后两页在不同的链接下：有链接就指过去，没有就去掉这一项
  out = out.replace(/<a href="[^"]*" data-lab-link>([^<]*)<\/a>/g, (m, text) => (links.lab ? `<a href="${links.lab}" target="_blank" rel="noopener">${text}</a>` : `<span>${text}</span>`));
  out = out.replace(/<a href="[^"]*" data-walk-link>([^<]*)<\/a>/g, (m, text) => (links.walk ? `<a href="${links.walk}" target="_blank" rel="noopener">${text}</a>` : `<span>${text}</span>`));
  return out;
}

await mkdir(path.join(root, 'dist/artifact'), { recursive: true });
for (const p of pages) {
  const js = await bundle(p.entry);
  let html = await readFile(path.join(root, p.html), 'utf8');
  html = await inlineCss(html, p.html);
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
  html = html.replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script type="module">\n${js}</script>`);
  await writeFile(path.join(root, 'dist', p.out), html);
  await writeFile(path.join(root, 'dist/artifact', p.out), artifactVariant(html));
  console.log(`dist/${p.out}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}
