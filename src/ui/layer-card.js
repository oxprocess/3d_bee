// 一代的来历：第几代、何时长成、来自哪件事、经过多少次比较、它学会了什么。
// 下方一排细纹 = 这一代的每一次比较；点一条，看那一次真实发生的事。
import { DbbElement, esc, pct, define, catChip } from './base.js';
import { fmtDay, fmtDayClock } from '../core/time.js';

const MODE = { now: '此刻的它', section: '剖开：最外一层', past: '那时候的它', select: '这一代', count: '数到这一代' };

export class LayerCard extends DbbElement {
  bind({ stage }) {
    this.unbind();
    this.stage = stage;
    const now = () => this.stage.view && { view: this.stage.view, k: this.stage.view.layers.length - 1, lamellaIndex: -1, mode: 'now' };
    this.listen(stage, 'select', (e) => {
      const d = e.detail;
      this.data = d.k < 0 ? now() : { view: d.view, k: d.k, lamellaIndex: d.lamellaIndex, mode: 'select' };
    });
    this.listen(stage, 'view', () => { this.data = now(); });
    this.listen(stage, 'depth', (e) => {
      const d = e.detail;
      this.data = d.depth >= 1 ? { view: stage.view, k: d.layersLeft - 1, lamellaIndex: -1, mode: d.depth > 1 ? 'past' : 'section' } : now();
    });
    this.listen(stage, 'count', (e) => {
      if (!e.detail.done) this.data = { view: stage.view, k: e.detail.k, lamellaIndex: -1, mode: 'count' };
    });
    this.data = now();
    return this;
  }

  render() {
    const d = this._data;
    if (!d?.view) { this.innerHTML = ''; return; }
    const { view, k } = d;
    const L = view.layers[k];
    if (!L) { this.innerHTML = ''; return; }
    const N = view.layers.length;
    const lam = L.lamellae ?? [];
    const sel = d.lamellaIndex ?? -1;
    const eyebrow = MODE[d.mode] ?? '这一代';
    let body;
    if (L.core) {
      body = `
        <p class="dbb-when">${L.bornAt ? `${fmtDay(L.bornAt)} ` : ''}诞生</p>
        <p class="dbb-learned">一个完整的身份，还没有属于你的学习历史。</p>
        <p class="dbb-kv">核没有细纹：它不是从哪一件事里长出来的。之后的每一层，都来自你的一件事。</p>`;
    } else {
      const ticks = lam.map((l, i) => {
        const h = 22 + Math.round((l.surpriseShadow ?? 0.3) * 78);
        const cls = l.winner === 'shadow' ? 'w-s' : l.winner === 'body' ? 'w-b' : 'w-t';
        const label = `第 ${i + 1} 次：${l.note ?? ''}，${l.outcome ? '发生了' : '没发生'}，影子 ${pct(l.pShadow)}，本体 ${pct(l.pBody)}`;
        return `<button type="button" class="dbb-tick ${cls}${i === sel ? ' on' : ''}" data-i="${i}" aria-label="${esc(label)}" aria-pressed="${i === sel}"><i style="height:${h}%"></i></button>`;
      }).join('');
      const l = sel >= 0 ? lam[sel] : null;
      const detail = l
        ? `<b>${fmtDayClock(l.at)}</b> · ${esc(l.note ?? '')} · ${l.outcome ? '发生了' : '没发生'}<br>影子 ${pct(l.pShadow)} · 本体 ${pct(l.pBody)} · ${l.winner === 'shadow' ? '影子更近' : l.winner === 'body' ? '本体更近' : '一样近'} · 意外 ${(l.surpriseShadow ?? 0).toFixed(2)}`
        : '一条细纹是一次比较。越高，那一次越出乎意料；薄荷色是影子更近，淡紫是本体更近。点一条看看。';
      body = `
        <p class="dbb-when">${L.bornAt ? `${fmtDay(L.bornAt)}长成 · ` : ''}来自 ${catChip(view, L.category)} ${esc(L.source ?? '')}</p>
        <p class="dbb-learned">它学会了：${esc(L.learned ?? '')}</p>
        <p class="dbb-kv">经过 <em>${L.n}</em> 次比较，其中影子更准 <em>${lam.filter((x) => x.winner === 'shadow').length}</em> 次，留了下来。</p>
        <div class="dbb-ticks" role="group" aria-label="这一代的 ${lam.length} 次比较">${ticks}</div>
        <p class="dbb-tick-detail" aria-live="polite">${detail}</p>`;
    }
    const retired = L.retiredAt && k < N - 1 ? `<p class="dbb-retired">${fmtDay(L.retiredAt)} 被第 ${k + 2} 代接替，退到了里面，成为一圈年轮。</p>` : '';
    this.innerHTML = `
      <article class="dbb-card dbb-layer">
        <p class="dbb-eyebrow">${eyebrow}</p>
        <h3 class="dbb-gen">第 <b>${k + 1}</b> 代<span>/ 共 ${N} 代</span></h3>
        ${body}
        ${retired}
      </article>`;
    this.querySelectorAll('.dbb-tick').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      if (this.stage) this.stage.select(k, i === sel ? -1 : i, this.stage.depthTarget > 0 ? this.stage.sectionPoint(k) : null);
      else this.data = { ...d, lamellaIndex: i === sel ? -1 : i };
      this.emit('lamella', { k, index: i });
    }));
  }
}

define('dbb-layer-card', LayerCard);
