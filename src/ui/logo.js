// 标志：和 3D 是同一颗晶体——诞生时的那一颗（四个角一样远），一个角正对你；下面是它在水里的影子。
// 轮廓不是另画的，直接由生长规则算出来（core/growth.js · SOFT、DIAMOND）：3D 的形改了，标志跟着改。
//   主体   圆润的菱形，极光五彩在表面上：上尖薄荷、下尖兰紫，中间一圈是四类事的颜色；
//          上半映出头顶的光，下沿一条清楚的地平线（和 3D 一样）；朝光的那条边一道很淡的光
//   影子   同一颗晶体在水里的样子：倒过来、淡一点，越往下越淡；只映颜色，不映头顶的光
//   水面   主体和影子之间的一道缝，就是水面；可以再加一条很淡的水线
// 小尺寸与单色：影子改成三道横线（水里的倒影），任何颜色、任何尺寸都立得住。
import { shellPlaneList, softPoint, DIAMOND } from '../core/growth.js';

// 诞生时的晶体：四个角一样远，一个角正对你。它前后对称，所以正面看到的轮廓就是它的中截面
let outline = null;
function crystalOutline() {
  if (outline) return outline;
  const planes = shellPlaneList([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2], [1, 1, 1, 1], DIAMOND.top, DIAMOND.bottom);
  const m = 2048;
  const pts = [];
  for (let i = 0; i < m; i++) {
    const a = (i / m) * 2 * Math.PI, x = Math.cos(a), y = Math.sin(a);
    const r = softPoint(planes, x, y, 0);
    pts.push([x * r, y * r]);
  }
  // 点按轮廓弯的程度分布：尖和角上密，直的地方疏
  const turn = pts.map((p, i) => {
    const a = pts[(i + m - 1) % m], b = pts[(i + 1) % m];
    const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    return Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1)));
  });
  const mean = turn.reduce((s, v) => s + v, 0) / m;
  const cdf = [0];
  for (let i = 0; i < m; i++) cdf.push(cdf[i] + Math.sqrt(turn[i] + 0.25 * mean));
  const n = 72, keep = [];
  for (let s = 0, j = 0; s < n; s++) {
    const target = (s / n) * cdf[m];
    while (j < m - 1 && cdf[j + 1] < target) j++;
    keep.push(pts[j]);
  }
  outline = keep;
  return outline;
}

// 平滑的闭合路径（Catmull-Rom → 三次贝塞尔），SVG 坐标（y 朝下）
function pathOf(pts, s) {
  const P = pts.map(([x, y]) => [x * s, -y * s]);
  const n = P.length, f = (v) => +v.toFixed(2);
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

// 极光五彩：和 3D 同一套色调（core/color.js · appleTone）。左到右：兰紫、蓝、青、绿、金、琥珀、珊瑚；上尖薄荷，下尖兰紫
const SPECTRUM = [
  [0, '#8173F5'], [0.2, '#5996F9'], [0.36, '#4BD0ED'], [0.5, '#49D57C'], [0.7, '#F5C531'], [0.86, '#F9AE2E'], [1, '#F65B75'],
];
const MINT = '#6EE7D0', VIOLET = '#B174EC', PINK = '#F05EA6';

let uid = 0;

// theme: 'light' | 'dark'；mono: false | 颜色（单色版，比如 '#1C1C22' 或 '#FFFFFF'）；
// water: 'soft'（渐隐的倒影）| 'lines'（三道横线）| 'none'；line: 是否画水线；reach: 影子露出多少（占主体的高度）；
// glint: 朝光的那条边亮多少；motion: 色带缓缓流动；bare: 只要里面的内容（拼进 App 图标、字标）
export function logoSvg({ theme = 'light', mono = false, water = 'soft', line = false, reach = null, glint = 0.55, motion = false, size = null, title = 'derbeebee', bare = false } = {}) {
  const dark = theme === 'dark';
  // 影子露出多少：浅色底上露到倒过来的赤道附近；深色底上短一些（低透明度的颜色落在黑上会发灰，只留亮的那一段）
  reach ??= dark && !mono ? 0.5 : 0.6;
  const fade = dark && !mono ? 0.34 : 0.6;
  const id = `dbbLogo${++uid}`;
  const S = 40;
  const pts = crystalOutline();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const W = Math.max(...xs) * S, top = Math.max(...ys) * S, bot = -Math.min(...ys) * S;
  const H = top + bot;
  const gap = 0.3 * S;
  const yw = bot + gap / 2; // 水面
  const reflTop = yw + gap / 2; // 影子的尖
  const reflEnd = water === 'none' ? bot : reflTop + reach * H;
  const pad = 3;
  const vb = [-W - pad, -top - pad, 2 * (W + pad), (water === 'none' ? bot : reflEnd) + top + 2 * pad];
  const body = pathOf(pts, S);
  const sz = size ? ` width="${size * (vb[2] / vb[3])}" height="${size}"` : '';
  const stop = (o, c, a = 1) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`;
  let defs = `<clipPath id="${id}c"><path d="${body}"/></clipPath>`;
  let fill;
  if (mono) {
    fill = `<path d="${body}" fill="${mono}"/>`;
  } else {
    // 色带稍微斜一点（−10°），顺着面的方向，像光在流；动起来时在 −15° 与 −5° 之间缓缓摆动，和 3D 的颜色一样慢
    const flow = motion ? '<animateTransform attributeName="gradientTransform" type="rotate" values="-10;-15;-5;-10" dur="16s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"/>' : '';
    defs += `<linearGradient id="${id}h" gradientUnits="userSpaceOnUse" x1="${-W}" y1="0" x2="${W}" y2="0" gradientTransform="rotate(-10)">${SPECTRUM.map(([o, c]) => stop(o, c)).join('')}${flow}</linearGradient>`;
    defs += `<linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="0" y1="${-top}" x2="0" y2="${-0.3 * S}">${stop(0, MINT)}${stop(0.3, MINT, 0.8)}${stop(1, MINT, 0)}</linearGradient>`;
    // 往下尖走：中间先是一段清透的亮（相冲的颜色之间不走灰，和 3D 一样），再到兰紫
    defs += `<linearGradient id="${id}b" gradientUnits="userSpaceOnUse" x1="0" y1="${0.3 * S}" x2="0" y2="${bot}">${stop(0, '#FFFFFF', 0)}${stop(0.45, '#FFFFFF', 0.2)}${stop(0.72, PINK, 0.45)}${stop(1, VIOLET)}</linearGradient>`;
    fill = `<g clip-path="url(#${id}c)"><rect x="${-W}" y="${-top}" width="${2 * W}" height="${H}" fill="url(#${id}h)"/><rect x="${-W}" y="${-top}" width="${2 * W}" height="${H}" fill="url(#${id}t)"/><rect x="${-W}" y="${-top}" width="${2 * W}" height="${H}" fill="url(#${id}b)"/></g>`;
  }
  // 光：上半映出头顶的光，下沿一条清楚的地平线（和 3D 一样落在赤道上）；左边朝光，亮一点；右下的面深一点。
  // 左右两个面之间是柔的，没有线。影子里不映这些
  let light = '';
  if (mono !== '#FFFFFF') {
    const a = mono ? 0.16 : dark ? 0.2 : 0.26, b = mono ? 0.08 : dark ? 0.08 : 0.11;
    defs += `<linearGradient id="${id}s" gradientUnits="userSpaceOnUse" x1="${-W}" y1="0" x2="${W}" y2="0">${stop(0, '#FFFFFF', a)}${stop(0.4, '#FFFFFF', a * 0.9)}${stop(0.6, '#FFFFFF', b)}${stop(1, '#FFFFFF', b * 0.8)}</linearGradient>`;
    light += `<g clip-path="url(#${id}c)"><rect x="${-W}" y="${-top}" width="${2 * W}" height="${top - 0.02 * S}" fill="url(#${id}s)"/>`;
    if (!mono) {
      defs += `<linearGradient id="${id}d" gradientUnits="userSpaceOnUse" x1="${-0.12 * W}" y1="0" x2="${0.12 * W}" y2="0">${stop(0, '#1B1030', 0)}${stop(1, '#1B1030', dark ? 0.08 : 0.06)}</linearGradient>`;
      light += `<rect x="${-W}" y="0" width="${2 * W}" height="${bot}" fill="url(#${id}d)"/>`;
    }
    light += '</g>';
    if (glint && !mono) {
      // 朝光的那条边（左上）一道很淡的光，像抛光玻璃的边；只在左上，别的边没有
      defs += `<radialGradient id="${id}g" gradientUnits="userSpaceOnUse" cx="${-0.5 * W}" cy="${-0.5 * top}" r="${0.62 * W}">${stop(0, '#FFFFFF', 1)}${stop(0.6, '#FFFFFF', 0.5)}${stop(1, '#FFFFFF', 0)}</radialGradient>`;
      defs += `<mask id="${id}k" maskUnits="userSpaceOnUse" x="${-W}" y="${-top}" width="${2 * W}" height="${H}"><rect x="${-W}" y="${-top}" width="${2 * W}" height="${H}" fill="url(#${id}g)"/></mask>`;
      light += `<g clip-path="url(#${id}c)" mask="url(#${id}k)"><path d="${body}" fill="none" stroke="#FFFFFF" stroke-opacity="${glint}" stroke-width="${0.08 * S}"/></g>`;
    }
  }
  // 影子：同一颗晶体以水面为轴倒过来（只映颜色，不映头顶的光），越往下越淡
  let shadow = '';
  const flip = `translate(0 ${2 * yw}) scale(1 -1)`;
  if (water === 'soft') {
    const a0 = mono ? 0.34 : dark ? 0.6 : 0.5;
    defs += `<linearGradient id="${id}f" gradientUnits="userSpaceOnUse" x1="0" y1="${reflTop}" x2="0" y2="${reflEnd}">${stop(0, '#FFFFFF', a0)}${stop(0.4, '#FFFFFF', a0 * fade)}${stop(1, '#FFFFFF', 0)}</linearGradient>`;
    defs += `<mask id="${id}m" maskUnits="userSpaceOnUse" x="${-W - pad}" y="${yw}" width="${2 * (W + pad)}" height="${reflEnd - yw + pad}"><rect x="${-W - pad}" y="${yw}" width="${2 * (W + pad)}" height="${reflEnd - yw + pad}" fill="url(#${id}f)"/></mask>`;
    // 深色底上，影子里的颜色提亮一些：像水面上的一片光，而不是一团暗色
    const lift = !mono && dark ? `<g clip-path="url(#${id}c)"><rect x="${-W}" y="${-top}" width="${2 * W}" height="${H}" fill="#EEEAFF" fill-opacity="0.45"/></g>` : '';
    shadow = `<g mask="url(#${id}m)"><g transform="${flip}">${fill}${lift}</g></g>`;
  } else if (water === 'lines') {
    // 三道横线：水里的倒影。越往下越细、越短，间距越大
    const bands = [[0, 0.15], [0.23, 0.33], [0.43, 0.49]].map(([a, b]) => [reflTop + a * reach * H, reflTop + b * reach * H]);
    defs += `<clipPath id="${id}l">${bands.map(([y0, y1]) => `<rect x="${-W - pad}" y="${y0.toFixed(2)}" width="${2 * (W + pad)}" height="${(y1 - y0).toFixed(2)}"/>`).join('')}</clipPath>`;
    shadow = `<g clip-path="url(#${id}l)" opacity="${mono ? 0.55 : 0.6}"><g transform="${flip}">${fill}</g></g>`;
  }
  const waterline = line && water !== 'none'
    ? (() => {
        defs += `<linearGradient id="${id}w" gradientUnits="userSpaceOnUse" x1="${-W}" y1="0" x2="${W}" y2="0">${stop(0, mono || (dark ? '#FFFFFF' : '#1C1C22'), 0)}${stop(0.5, mono || (dark ? '#FFFFFF' : '#1C1C22'), dark ? 0.35 : 0.22)}${stop(1, mono || (dark ? '#FFFFFF' : '#1C1C22'), 0)}</linearGradient>`;
        return `<rect x="${-W}" y="${(yw - 0.3).toFixed(2)}" width="${2 * W}" height="0.6" fill="url(#${id}w)"/>`;
      })()
    : '';
  const inner = `<defs>${defs}</defs>${shadow}${waterline}${fill}${light}`;
  if (bare) return { inner, box: vb, top, bot, W };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map((v) => +v.toFixed(2)).join(' ')}"${sz} role="img" aria-label="${title}"><title>${title}</title>${inner}</svg>`;
}

// App 图标：连续曲率的圆角方块（和 iOS 的图标同一种圆角），晶体在上，影子落在下面，淡进底色里
export function appIconSvg({ theme = 'light', size = null, title = 'derbeebee' } = {}) {
  const dark = theme === 'dark';
  const m = logoSvg({ theme, bare: true, reach: dark ? 0.46 : 0.52 });
  const N = 1024, id = `dbbIcon${++uid}`;
  // 晶体的主体约占图标高度的 46%，主体的中心落在视觉中心（略高于正中），影子在下面
  const s = (0.46 * N) / (m.top + m.bot);
  const cy = 0.42 * N - s * ((m.bot - m.top) / 2);
  const bg = dark ? ['#1C1C24', '#0A0A0E'] : ['#FFFFFF', '#E9E8F0'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}"${size ? ` width="${size}" height="${size}"` : ''} role="img" aria-label="${title}"><title>${title}</title><defs><linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient><clipPath id="${id}sq"><path d="${squircle(N, 0.2237 * N)}"/></clipPath></defs><g clip-path="url(#${id}sq)"><rect width="${N}" height="${N}" fill="url(#${id}bg)"/><g transform="translate(${N / 2} ${cy.toFixed(1)}) scale(${s.toFixed(4)})">${m.inner}</g></g></svg>`;
}

// 连续曲率的圆角方块（超椭圆的四个角，找不到“圆角从哪里开始”）
function squircle(N, r) {
  const n = 5, pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= 24; i++) {
      const a = a0 + (i / 24) * (Math.PI / 2);
      const c = Math.cos(a), s = Math.sin(a);
      pts.push([cx + r * Math.sign(c) * Math.abs(c) ** (2 / n), cy + r * Math.sign(s) * Math.abs(s) ** (2 / n)]);
    }
  };
  corner(N - r, N - r, 0);
  corner(r, N - r, Math.PI / 2);
  corner(r, r, Math.PI);
  corner(N - r, r, (3 * Math.PI) / 2);
  return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
}

// 标志 + 字标。字标沿用页面上的衬线小写、字距放宽：温和、像一个名字，而不是一个机器的型号。
// 字的 x 高度正好骑在晶体的地平线（赤道）上
export function lockupSvg({ theme = 'light', mono = false, size = null, title = 'derbeebee' } = {}) {
  const dark = theme === 'dark';
  const m = logoSvg({ theme, mono, bare: true, reach: 0.34 });
  const ink = mono || (dark ? '#EEEEF3' : '#1C1C22');
  const [x0, y0, w, h] = m.box;
  const fs = 0.42 * (m.top + m.bot), tx = x0 + w + 0.22 * fs;
  const W = w + 0.22 * fs + fs * 5.7;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(2)} ${y0.toFixed(2)} ${W.toFixed(2)} ${h.toFixed(2)}"${size ? ` height="${size}" width="${((size * W) / h).toFixed(1)}"` : ''} role="img" aria-label="${title}"><title>${title}</title>${m.inner}<text x="${tx.toFixed(2)}" y="${(0.24 * fs).toFixed(2)}" font-family="Georgia, 'Times New Roman', serif" font-size="${fs.toFixed(2)}" letter-spacing="${(fs * 0.1).toFixed(2)}" fill="${ink}">derbeebee</text></svg>`;
}

// 页签上的小图标：只留主体（16 像素里影子会糊成一片）
export function faviconHref() {
  return `data:image/svg+xml,${encodeURIComponent(logoSvg({ water: 'none', glint: 0 }))}`;
}
