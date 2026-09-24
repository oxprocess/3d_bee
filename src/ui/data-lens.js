// 接口透视：打开后，每个视觉细节旁边标出它由哪个数据字段驱动、现在的值是多少。
// 它是一张活的对照表：换一颗珍珠、落一件事，数值跟着变。
import { DbbElement, esc, define } from './base.js';
import { BINDINGS } from '../core/view.js';

// 每个细节标在哪里、放在哪一侧
const ANCHOR = {
  form: ['L', 'pearl.left'],
  layers: ['L', 'pearl.top'],
  pose: ['L', 'pearl.center'],
  breath: ['L', 'pearl.top'],
  shadowShape: ['L', 'shadow.left'],
  clarity: ['L', 'shadow.center'],
  outer: ['R', 'pearl.side'],
  glow: ['R', 'pearl.side'],
  lamellae: ['R', 'section', 'pearl.side'],
  droplet: ['R', 'droplet'],
  ripple: ['R', 'water.right'],
  lag: ['R', 'shadow.side'],
  dirs: ['R', 'dir.work', 'dir.family'],
};
const ORDER = ['form', 'shadowShape', 'clarity', 'droplet', 'ripple', 'layers', 'lag', 'glow', 'outer', 'lamellae', 'dirs', 'pose', 'breath'];

export class DataLens extends DbbElement {
  bind({ stage }) {
    this.unbind();
    this.stage = stage;
    stage.host.appendChild(this);
    this.listen(stage, 'frame', () => this.place());
    this.listen(stage, 'view', () => this.render());
    this.listen(stage, 'depth', () => this.render());
    this.render();
    return this;
  }

  set on(v) {
    this.toggleAttribute('on', !!v);
    this.render();
  }

  get on() {
    return this.hasAttribute('on');
  }

  render() {
    const st = this.stage;
    const v = st?.view;
    if (!v || !this.on) { this.innerHTML = ''; this.items = []; return; }
    const items = ORDER.map((id) => BINDINGS.find((b) => b.id === id)).filter(Boolean);
    this.items = items;
    this.innerHTML = `<svg class="dbb-lens-lines" aria-hidden="true"></svg>${items.map((b) => `
      <div class="dbb-lens-item" data-id="${b.id}" title="${esc(b.visual)} · ${esc(b.when)}">
        <p><b>${esc(b.element)}</b><em>${esc(b.value(v))}</em></p>
        <code>← ${esc(b.field)}</code>
      </div>`).join('')}`;
    this.place();
  }

  place() {
    if (!this.on || !this.items?.length || !this.stage) return;
    const st = this.stage, w = st.w, h = st.h;
    const compact = w < 560;
    const itemW = compact ? 138 : 196, pad = 10, gap = 6, top = compact ? 56 : 64, bottom = 64;
    const sides = { L: [], R: [] };
    for (const el of this.querySelectorAll('.dbb-lens-item')) {
      const [side, ...names] = ANCHOR[el.dataset.id] ?? ['R'];
      const a = names.map((n) => st.getAnchor(n)).find((x) => x && x.visible);
      if (!a) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.width = `${itemW}px`;
      sides[side].push({ el, a, h: el.offsetHeight || 44 });
    }
    let lines = '';
    for (const side of ['L', 'R']) {
      const list = sides[side];
      // 放得下几个就放几个，按重要程度取舍，再按锚点高低排
      let used = 0;
      const keep = [];
      for (const it of list) {
        if (used + it.h + gap > h - top - bottom) { it.el.style.display = 'none'; continue; }
        used += it.h + gap;
        keep.push(it);
      }
      keep.sort((p, q) => p.a.y - q.a.y);
      let y = top;
      const room = h - bottom;
      keep.forEach((it, i) => {
        const rest = keep.slice(i + 1).reduce((acc, x) => acc + x.h + gap, 0);
        const yy = Math.max(y, Math.min(room - rest - it.h, it.a.y - it.h / 2));
        y = yy + it.h + gap;
        const x = side === 'L' ? pad : w - pad - itemW;
        it.el.style.transform = `translate(${x}px, ${yy}px)`;
        const ex = side === 'L' ? x + itemW : x;
        const ey = yy + Math.min(14, it.h / 2);
        lines += `<path d="M${ex} ${ey} C ${(ex + it.a.x) / 2} ${ey}, ${(ex + it.a.x) / 2} ${it.a.y}, ${it.a.x} ${it.a.y}"/><circle cx="${it.a.x}" cy="${it.a.y}" r="3"/>`;
      });
    }
    const svg = this.querySelector('.dbb-lens-lines');
    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.innerHTML = lines;
    }
  }
}

define('dbb-data-lens', DataLens);
