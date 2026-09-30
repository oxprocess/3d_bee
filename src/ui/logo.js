// 标志：和 3D 是同一颗晶体——诞生时的那一颗（四个角一样远），一个角正对你；身后是它的影子。
// 轮廓不是另画的，直接由生长规则算出来（core/growth.js · SOFT、DIAMOND）：3D 的形改了，标志跟着改。
//   主体   圆润的菱形，就是 App 里的那颗（derbeebee 的 2D 形象）：颜色、光晕与玻璃来自网页版的球——五色极光（黄、洋红、紫、
//          蓝、绿）在身体里流，停在标准的那一刻（第 4.5 秒）：上尖浅天蓝，中间一横从左到右是薰衣草紫、蓝、青、绿、黄绿，
//          洋红沉在下尖；左上一道细细的蓝边，右边一道淡淡的亮边；四周一圈很宽很柔的光晕
//   影子   紧贴在主体身后，形影不离。它是影子，不是第二个东西：没有轮廓线，边是柔的，不映光、没有细节，
//          越往下越淡。不用黑：晶体透光，透过来的光把影子染成蓝紫（画家说影子从来不是黑的；极光的顶被阳光照到，
//          也是这种蓝紫）。深色底上它是透过来的光，远的那条边一道很淡的极光色
//   神秘   它从主体身后斜过身来看你：下尖（脚）藏在主体后面不动，身子往右斜 7°，稍稍踮起脚，只比主体大一点。
//          身子前倾、歪头，是好奇、专注、没有敌意的姿态。大一点、斜一点、踮一点，都只是“一点”——它是预示，
//          不是宣告：第一眼只看见一颗晶体，再看才发现身后有东西在探身看你（幽玄：说一半，留一半）
//   动     平时它整个藏在主体身后；隔一会儿，侧过身来看你一下，又藏回去。静态的标志是它看你那一下的定格
// 单色：主体是一块平的颜色，影子用细横线排出来（版画里画阴影的办法，也像全息投影的扫描线），越往下线越细。
// 页签图标只留主体，也不要光晕。
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

// 主体的颜色：从 App 里那颗菱形标准的那一刻（第 4.5 秒）取下来的 9×12 颜色网格（左到右、上到下；轮廓外面的格子用最近的里面的颜色）。
// 上尖浅天蓝；中间一横从左到右是薰衣草紫、蓝、青、绿、黄绿；下尖洋红到亮粉。画成小方块，再大大地模糊，就是一片柔的光
const FIELD = {
  nx: 9,
  ny: 12,
  c: [
    'a0c6fc', 'a0c6fc', '94c9f5', '94c9f5', '7ac5e7', '63c1d1', '63c1d1', '65c5ae', '65c5ae',
    'aac4fd', 'a0c6fc', 'a0c6fc', '88bdf6', '5cb0de', '53b8bf', '65c5ae', '65c5ae', '76d48c',
    'aac4fd', 'aac4fd', '99bdfc', '78aef3', '67afdc', '5eb9bb', '66c89d', '76d48c', '76d48c',
    'b1bffb', 'a5bbfd', '8aaffa', '81b3f0', '75bbda', '68c3b9', '69cd96', '76d67a', '89de6d',
    'abb0fb', '8fa0fa', '87aaf5', '8bbeeb', '78c7d4', '67cfb5', '67d595', '70da6e', '86e151',
    '9c8ff7', '807ff4', '819aed', '7fb6df', '71c8c9', '5ed5ab', '5cd88e', '6bd867', '87dd3c',
    '9c76f1', '8a66ed', '827ee4', '7a9fd4', '6bbabb', '5bca9f', '5cce83', '74cd59', '8fd337',
    'ab75ed', 'a45ee7', '955edd', '897ccc', '7a97b5', '6da997', '74b176', '8db851', '9bc73c',
    'ab75ed', 'bf5ce2', 'b943d7', 'ac46c6', '9d5bb2', '956c93', 'a17e71', 'a89557', '9bc73c',
    'bf5ce2', 'bf5ce2', 'db3bd2', 'da1ec3', 'd123b0', 'cc3695', 'ce4d7b', 'a89557', 'a89557',
    'f049d3', 'f049d3', 'f049d3', 'f624c6', 'f50ab0', 'ee1897', 'e82e85', 'e82e85', 'e82e85',
    'f049d3', 'f049d3', 'f049d3', 'f936c7', 'f616b3', 'f20d9e', 'e82e85', 'e82e85', 'e82e85',
  ],
};

// 新月色边（深色底上影子远的那条边）用到的两种颜色
const MINT = '#6EE7D0', PINK = '#F05EA6';

let uid = 0;

// 影子的颜色：长春花蓝 → 蓝紫 → 紫（左到右），都是冷的。浅色底上它比底色深一点（是影子），深色底上比底色亮一点（是透过来的光）
const SHADE = { light: ['#6F8CF2', '#8570EE', '#A06AE6'], dark: ['#6C8DF5', '#8A74F4', '#A77BEA'] };

// theme: 'light' | 'dark'；mono: false | 颜色（单色版，比如 '#1C1C22' 或 '#FFFFFF'）；shadow: 要不要身后的影子；
// glint: 边（左上的蓝边、右边的亮边）有多明显；glow: 四周的光晕；motion: 主体里的颜色慢慢漂一点，影子平时藏在主体身后，
// 隔一会儿侧过身来看你一下；
// behind: 影子的位置与分寸（k 大小、dx/dy 错开、rot 转角，a 浓淡、blur 边有多柔、fade 往下隐掉多少、fringe 彩边多亮）；
// bare: 只要里面的内容（拼进 App 图标、字标）
export function logoSvg({ theme = 'light', mono = false, shadow = true, glint = 0.55, glow = true, motion = false, behind = {}, size = null, title = 'derbeebee', bare = false } = {}) {
  const dark = theme === 'dark';
  const id = `dbbLogo${++uid}`;
  const S = 40;
  const pts = crystalOutline();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const W = Math.max(...xs) * S, top = Math.max(...ys) * S, bot = -Math.min(...ys) * S;
  const H = top + bot;
  const pad = 3;
  // 身后的影子：同一颗晶体，大一点、斜一点、踮一点——都只是“一点”：它是预示，不是宣告
  const B = { k: 1.08, rot: 7, dx: 0, dy: -0.03, a: dark ? 0.4 : 0.34, blur: dark ? 0.06 : 0.045, fade: 0.8, fringe: dark ? 0.5 : 0, ...behind };
  // 它斜过身来看你：像人从别人身后探出身，脚不动，身子往右斜。所以绕着下尖转（下尖藏在主体身后），
  // 上半从主体的右上探出来；以下尖为准放大一点、再往上提一点，像踮起脚
  const py = bot;
  const T = `translate(${(B.dx * W).toFixed(2)} ${(B.dy * H).toFixed(2)}) translate(0 ${py}) rotate(${B.rot}) scale(${B.k}) translate(0 ${-py})`;
  // 画出来的范围：主体，加上影子（不含柔边）
  let ink = [-W, -top, W, bot];
  if (shadow) {
    const c = Math.cos((B.rot * Math.PI) / 180), sn = Math.sin((B.rot * Math.PI) / 180);
    for (const [x, y] of pts) {
      const u = x * S * B.k, v = (-y * S - py) * B.k;
      const X = u * c - v * sn + B.dx * W, Y = u * sn + v * c + py + B.dy * H;
      ink = [Math.min(ink[0], X), Math.min(ink[1], Y), Math.max(ink[2], X), Math.max(ink[3], Y)];
    }
  }
  const g = mono ? 0 : glow ? 0.8 * S : shadow ? 0.24 * S : 0; // 光晕、柔边四周留够余量，不被切出直边（深浅两种底一样大，换主题时标志不跳）
  const vb = [ink[0] - pad - g, ink[1] - pad - g, ink[2] - ink[0] + 2 * (pad + g), ink[3] - ink[1] + 2 * (pad + g)];
  const body = pathOf(pts, S);
  const sz = size ? ` width="${size * (vb[2] / vb[3])}" height="${size}"` : '';
  const stop = (o, c, a = 1) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`;
  const rect = (x, y, w, h, f, more = '') => `<rect x="${+x.toFixed(2)}" y="${+y.toFixed(2)}" width="${+w.toFixed(2)}" height="${+h.toFixed(2)}" fill="${f}"${more}/>`;
  let defs = `<clipPath id="${id}c"><path d="${body}"/></clipPath>`;
  let fill, aura = '', rim = '';
  if (mono) {
    fill = `<path d="${body}" fill="${mono}"/>`;
  } else {
    // 主体的颜色：颜色网格画成小方块（最外一圈往外多铺两格，模糊时边上不掺进透明），再模糊成一片，按轮廓裁出来。
    // 动起来时，整片颜色慢慢地漂一点
    const { nx, ny, c: cells } = FIELD, cw = (2 * W) / nx, ch = H / ny;
    let tiles = '';
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x0 = -W + i * cw - (i === 0 ? 2 * cw : 0), x1 = -W + (i + 1) * cw + (i === nx - 1 ? 2 * cw : 0);
      const y0 = -top + j * ch - (j === 0 ? 2 * ch : 0), y1 = -top + (j + 1) * ch + (j === ny - 1 ? 2 * ch : 0);
      tiles += rect(x0 - 0.3, y0 - 0.3, x1 - x0 + 0.6, y1 - y0 + 0.6, `#${cells[j * nx + i]}`);
    }
    defs += `<filter id="${id}q2" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${(0.62 * cw).toFixed(2)}"/></filter>`;
    const drift = motion ? `<animateTransform attributeName="transform" type="translate" values="0 0;${(0.35 * cw).toFixed(2)} ${(-0.25 * ch).toFixed(2)};${(-0.3 * cw).toFixed(2)} ${(0.3 * ch).toFixed(2)};0 0" dur="17s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"/>` : '';
    const layers = `<g filter="url(#${id}q2)"><g>${drift}${tiles}</g></g>`;
    fill = `<g clip-path="url(#${id}c)">${layers}</g>`;
    // 边：左上一道很细的蓝（比里面饱和一点），像玻璃的边；右边一道很淡的亮边。都只在那一侧，往两头淡掉
    if (glint) {
      defs += `<radialGradient id="${id}g" gradientUnits="userSpaceOnUse" cx="${-0.45 * W}" cy="${-0.45 * top}" r="${0.8 * W}">${stop(0, '#FFFFFF', 1)}${stop(0.6, '#FFFFFF', 0.6)}${stop(1, '#FFFFFF', 0)}</radialGradient>`;
      defs += `<mask id="${id}k" maskUnits="userSpaceOnUse" x="${-W}" y="${-top}" width="${2 * W}" height="${H}">${rect(-W, -top, 2 * W, H, `url(#${id}g)`)}</mask>`;
      defs += `<radialGradient id="${id}g2" gradientUnits="userSpaceOnUse" cx="${0.7 * W}" cy="${0.05 * bot}" r="${0.7 * W}">${stop(0, '#FFFFFF', 1)}${stop(1, '#FFFFFF', 0)}</radialGradient>`;
      defs += `<mask id="${id}k2" maskUnits="userSpaceOnUse" x="${-W}" y="${-top}" width="${2 * W}" height="${H}">${rect(-W, -top, 2 * W, H, `url(#${id}g2)`)}</mask>`;
      rim = `<g clip-path="url(#${id}c)"><g mask="url(#${id}k)"><path d="${body}" fill="none" stroke="#557CF0" stroke-opacity="${Math.min(1, 1.6 * glint).toFixed(2)}" stroke-width="${(0.036 * S).toFixed(2)}"/></g>` +
        `<g mask="url(#${id}k2)"><path d="${body}" fill="none" stroke="#FFFFFF" stroke-opacity="${(0.55 * glint).toFixed(2)}" stroke-width="${(0.06 * S).toFixed(2)}"/></g></g>`;
    }
    // 光晕：主体自己的颜色，柔柔地漫出来一点（像参考图里那样，四周的底色被染上一点）
    // 光晕照着 App 里的球：颜色放大到 1.3 倍、大大地模糊、透明度 0.35；深色底上降三成（不然像霓虹灯）
    defs += `<filter id="${id}y2" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${(0.3 * S).toFixed(2)}"/></filter>`;
    const cy0 = (bot - top) / 2;
    if (glow) aura = `<g opacity="${dark ? 0.245 : 0.35}" filter="url(#${id}y2)"><g transform="translate(0 ${cy0.toFixed(2)}) scale(1.3) translate(0 ${(-cy0).toFixed(2)})">${fill}</g></g>`;
  }
  const light = rim;
  // 影子：在主体身后。它是影子，不是第二个东西：没有轮廓线，边是柔的（半影），不映光，也没有细节，越往下越淡。
  // 不用黑——晶体是透光的，透过来的光把影子染上颜色；画家说影子从来不是黑的，是天空的蓝紫。
  // 它以脚（下尖）为轴斜过身来看你，只比主体大一点：好奇、专注，也有它自己的意思
  let back = '';
  if (shadow) {
    // 它的姿势：静态的标志是它看你那一下的定格。会动的标志：平时它整个藏在主体身后（一样大、不斜，被主体挡住）；
    // 页面打开 1.2 秒后，它侧过身来（1 秒，多斜一点再落回来，像探头时那一下），看你一下（1 秒），又藏回去（1.2 秒）；
    // 每 12 秒一次。主体不动
    const pose = (content) => {
      if (!motion) return `<g transform="${T}">${content}</g>`;
      const run = 'dur="12s" repeatCount="indefinite"';
      const kt = 'keyTimes="0;0.1;0.183;0.217;0.3;0.4;1" calcMode="spline" keySplines="0 0 1 1;.2 .7 .3 1;.4 0 .6 1;0 0 1 1;.5 0 .5 1;0 0 1 1"';
      const at = (type, v) => `<animateTransform attributeName="transform" type="${type}" values="${v.join(';')}" ${kt} ${run}/>`;
      const ox = (B.dx * W).toFixed(2), oy = (B.dy * H).toFixed(2);
      const lift = at('translate', ['0 0', '0 0', `${ox} ${oy}`, `${ox} ${oy}`, `${ox} ${oy}`, '0 0', '0 0']);
      const lean = at('rotate', [0, 0, B.rot + 1.2, B.rot, B.rot, 0, 0]);
      const rise = at('scale', [1, 1, B.k, B.k, B.k, 1, 1]);
      const show = `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.1;0.14;0.33;0.4;1" ${run}/>`;
      return `<g transform="translate(0 ${py})"><g transform="translate(${ox} ${oy})">${lift}<g transform="rotate(${B.rot})">${lean}<g transform="scale(${B.k})">${rise}<g transform="translate(0 ${-py})"><g>${show}${content}</g></g></g></g></g></g>`;
    };
    const box = [-1.6 * W, -1.6 * top, 3.2 * W, 1.6 * top + 1.6 * bot]; // 影子自己的坐标里，够大的一块
    const fadeStops = `${stop(0, '#FFFFFF')}${stop(0.45, '#FFFFFF', 1 - 0.2 * B.fade)}${stop(0.8, '#FFFFFF', 1 - 0.75 * B.fade)}${stop(1, '#FFFFFF', 1 - B.fade)}`;
    defs += `<linearGradient id="${id}v" gradientUnits="userSpaceOnUse" x1="0" y1="${-top}" x2="0" y2="${bot}">${fadeStops}</linearGradient>`;
    if (mono) {
      // 单色：影子用细横线排出来——版画里画阴影就是这样，线越细越淡；也像全息投影的扫描线。
      // 线在影子的外面、主体的四周留一道空，两者不粘在一起
      const [y0, y1] = [ink[1], ink[3]], period = 0.065 * S;
      let lines = '';
      for (let y = y0 + 0.5 * period, i = 0; y < y1; y += period, i++) {
        const f = (y - y0) / (y1 - y0);
        const th = 0.028 * S * Math.max(0, 1 - B.fade * f * 1.1);
        if (th > 0.15) lines += rect(ink[0] - pad, y - th / 2, ink[2] - ink[0] + 2 * pad, th, mono);
      }
      defs += `<clipPath id="${id}l"><path d="${body}" transform="${T}"/></clipPath>`;
      defs += `<mask id="${id}o" maskUnits="userSpaceOnUse" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}">${rect(vb[0], vb[1], vb[2], vb[3], '#FFFFFF')}<path d="${body}" fill="#000000" stroke="#000000" stroke-width="${(0.14 * S).toFixed(2)}"/></mask>`;
      back = `<g mask="url(#${id}o)"><g clip-path="url(#${id}l)">${lines}</g></g>`;
    } else {
      const uv = SHADE[dark ? 'dark' : 'light'];
      defs += `<linearGradient id="${id}u" gradientUnits="userSpaceOnUse" x1="${-W}" y1="0" x2="${W}" y2="0">${stop(0, uv[0])}${stop(0.5, uv[1])}${stop(1, uv[2])}</linearGradient>`;
      defs += `<mask id="${id}f" maskUnits="userSpaceOnUse" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}">${rect(box[0], box[1], box[2], box[3], `url(#${id}v)`)}</mask>`;
      defs += `<filter id="${id}x" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${(B.blur * S).toFixed(2)}"/></filter>`;
      let fringe = '';
      if (B.fringe) {
        // 影子远的那条边（右上）一道很淡的彩边：光擦过晶体的边，被分成几种颜色，落在影子的边上
        const f = 0.09 * S;
        defs += `<mask id="${id}e" maskUnits="userSpaceOnUse" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}"><path d="${body}" fill="#FFFFFF"/><path d="${body}" transform="translate(${(-0.7 * f).toFixed(2)} ${f.toFixed(2)})" fill="#000000"/></mask>`;
        defs += `<linearGradient id="${id}r" gradientUnits="userSpaceOnUse" x1="${-0.5 * W}" y1="${-top}" x2="${W}" y2="${0.3 * bot}">${stop(0, MINT)}${stop(0.35, '#6FA8F7')}${stop(0.65, '#8173F5')}${stop(1, PINK)}</linearGradient>`;
        defs += `<filter id="${id}y" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${(0.035 * S).toFixed(2)}"/></filter>`;
        fringe = `<g opacity="${B.fringe}" filter="url(#${id}y)"><g mask="url(#${id}f)"><g mask="url(#${id}e)">${rect(box[0], box[1], box[2], box[3], `url(#${id}r)`)}</g></g></g>`;
      }
      back = pose(`<g opacity="${B.a}"><g filter="url(#${id}x)"><path d="${body}" fill="url(#${id}u)" mask="url(#${id}f)"/></g></g>${fringe}`);
    }
  }
  const inner = `<defs>${defs}</defs>${aura}${back}${fill}${light}`;
  if (bare) return { inner, box: vb, ink, top, bot, W };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map((v) => +v.toFixed(2)).join(' ')}"${sz} role="img" aria-label="${title}"><title>${title}</title>${inner}</svg>`;
}

// App 图标：连续曲率的圆角方块（和 iOS 的图标同一种圆角），晶体在中间，影子在它身后斜过身来
export function appIconSvg({ theme = 'light', size = null, title = 'derbeebee' } = {}) {
  const dark = theme === 'dark';
  const m = logoSvg({ theme, bare: true });
  const N = 1024, id = `dbbIcon${++uid}`;
  // 晶体的主体约占图标高度的 44%。主体和影子一起放在视觉中心（略高于正中）；影子淡，只算它一半的分量
  const s = (0.44 * N) / (m.top + m.bot);
  const [x0, y0, x1, y1] = m.ink;
  const mx = 0.5 * ((x0 + x1) / 2), my = 0.5 * ((m.bot - m.top) / 2 + (y0 + y1) / 2);
  const tx = N / 2 - s * mx, ty = 0.49 * N - s * my;
  const bg = dark ? ['#1C1C24', '#0A0A0E'] : ['#FFFFFF', '#E9E8F0'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}"${size ? ` width="${size}" height="${size}"` : ''} role="img" aria-label="${title}"><title>${title}</title><defs><linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient><clipPath id="${id}sq"><path d="${squircle(N, 0.2237 * N)}"/></clipPath></defs><g clip-path="url(#${id}sq)"><rect width="${N}" height="${N}" fill="url(#${id}bg)"/><g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(4)})">${m.inner}</g></g></svg>`;
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
// 字的 x 高度正好骑在晶体最宽的那一圈（赤道）上
export function lockupSvg({ theme = 'light', mono = false, size = null, title = 'derbeebee' } = {}) {
  const dark = theme === 'dark';
  const m = logoSvg({ theme, mono, bare: true });
  const ink = mono || (dark ? '#EEEEF3' : '#1C1C22');
  const [x0, y0, , h] = m.box;
  // 字从影子的右边起（影子的柔边可以伸到字的底下）
  const fs = 0.42 * (m.top + m.bot), tx = m.ink[2] + 0.3 * fs;
  const W = tx - x0 + fs * 5.7;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(2)} ${y0.toFixed(2)} ${W.toFixed(2)} ${h.toFixed(2)}"${size ? ` height="${size}" width="${((size * W) / h).toFixed(1)}"` : ''} role="img" aria-label="${title}"><title>${title}</title>${m.inner}<text x="${tx.toFixed(2)}" y="${(0.24 * fs).toFixed(2)}" font-family="Georgia, 'Times New Roman', serif" font-size="${fs.toFixed(2)}" letter-spacing="${(fs * 0.1).toFixed(2)}" fill="${ink}">derbeebee</text></svg>`;
}

// 页签上的小图标：只留主体（16 像素里影子会糊成一片）
export function faviconHref() {
  return `data:image/svg+xml,${encodeURIComponent(logoSvg({ shadow: false, glow: false, glint: 0 }))}`;
}
