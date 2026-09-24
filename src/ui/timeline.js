// 时间轴：每个点是一次长成新层的时刻，颜色是那一层的颜色；最右一段虚线是“现在”——倒影还在练的部分。
// 点一个点，珍珠就剥回那一代的样子（深度和时间是同一根轴）。
import { DbbElement, esc, define } from './base.js';
import { fmtMonth } from '../core/time.js';

export class Timeline extends DbbElement {
  bind({ stage }) {
    this.unbind();
    this.stage = stage;
    const sync = () => { this.data = { view: stage.view, depth: stage.depthTarget }; };
    this.listen(stage, 'depth', sync);
    this.listen(stage, 'view', sync);
    sync();
    return this;
  }

  render() {
    const d = this._data;
    const v = d?.view;
    if (!v) { this.innerHTML = ''; return; }
    const N = v.layers.length;
    const shownGen = d.depth <= 1 ? N : N - d.depth + 1;
    const s = v.shadow;
    const dots = v.layers.map((L, k) => {
      const x = N === 1 ? 0 : (k / (N - 1)) * 100;
      const cls = [k + 1 === shownGen && d.depth > 0 ? 'on' : '', k + 1 > shownGen ? 'later' : ''].join(' ');
      const label = L.core ? '诞生' : fmtMonth(L.bornAt);
      return `<button type="button" class="dbb-tl-dot ${cls}" style="left:${x}%;--c:${L.core ? 'var(--dbb-card-solid)' : L.color}" data-gen="${k + 1}" aria-label="第 ${k + 1} 代，${esc(label)}${L.source ? `，${esc(L.source)}` : ''}"><i></i><span>${esc(label)}</span></button>`;
    }).join('');
    const now = s.mode === 'mirror' ? '现在：倒影一模一样' : `现在：倒影练习中 ${s.n}/${v.policy.minComparisons}`;
    this.innerHTML = `
      <div class="dbb-timeline">
        <div class="dbb-tl-track"><div class="dbb-tl-line"></div>${dots}</div>
        <div class="dbb-tl-now${d.depth === 0 ? ' on' : ''}"><i style="--p:${Math.round((s.progress ?? 0) * 100)}%"></i><button type="button" data-now>${esc(now)}</button></div>
      </div>`;
    this.querySelectorAll('.dbb-tl-dot').forEach((b) => b.addEventListener('click', () => {
      const gen = +b.dataset.gen;
      this.stage?.setDepth(gen === N ? 1 : N - gen + 1);
    }));
    this.querySelector('[data-now]')?.addEventListener('click', () => this.stage?.setDepth(0));
  }
}

define('dbb-timeline', Timeline);
