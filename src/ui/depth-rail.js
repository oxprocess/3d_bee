// 挖掘深度：外形 → 剖面 → 第 N 代 … 第 1 代。深度就是时间：越往里，越早。
import { DbbElement, esc, define } from './base.js';

export class DepthRail extends DbbElement {
  bind({ stage }) {
    this.unbind();
    this.stage = stage;
    const sync = () => { this.data = { stops: stage.depthStops, depth: stage.depthTarget }; };
    this.listen(stage, 'depth', sync);
    this.listen(stage, 'view', sync);
    sync();
    return this;
  }

  render() {
    const d = this._data;
    if (!d) { this.innerHTML = ''; return; }
    this.innerHTML = `
      <div class="dbb-rail" role="group" aria-label="挖掘深度：越往里越早">
        ${d.stops.map((s) => `<button type="button" data-d="${s.d}" aria-pressed="${s.d === d.depth}" class="${s.d === d.depth ? 'on' : ''}${s.d < d.depth ? ' past' : ''}"><i></i><span>${esc(s.label)}</span></button>`).join('')}
      </div>`;
    this.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => this.stage?.setDepth(+b.dataset.d));
      b.addEventListener('keydown', (e) => {
        const n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
        if (!n) return;
        e.preventDefault();
        const next = Math.max(0, Math.min(d.stops.length - 1, d.depth + n));
        this.stage?.setDepth(next);
        requestAnimationFrame(() => this.querySelector(`button[data-d="${next}"]`)?.focus());
      });
    });
  }
}

define('dbb-depth-rail', DepthRail);
