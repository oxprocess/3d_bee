// 封存的预判：一个问题、一个期限、两个答案（本体、影子），都在结果之前写下。
import { DbbElement, esc, pct, define, catChip } from './base.js';
import { fmtClock, minutesBetween } from '../core/time.js';
import { lamellaStats } from '../core/view.js';

function left(now, deadline) {
  const m = Math.max(0, Math.round(minutesBetween(now, deadline)));
  if (m <= 0) return '已到期限';
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? `还有 ${h} 小时 ${mm} 分` : `还有 ${mm} 分`;
}

export class SealCard extends DbbElement {
  bind({ store }) {
    this.unbind();
    const pick = (v, ledger) => {
      const pending = ledger.predictions.filter((p) => p.status === 'sealed');
      const p = pending[pending.length - 1] ?? ledger.predictions[ledger.predictions.length - 1] ?? null;
      return p ? { view: v, p, now: ledger.now } : { view: v, p: null };
    };
    this.subscribe(store, (ch) => { this.data = pick(ch.view, ch.ledger); });
    this.data = pick(store.view, store.ledger);
    return this;
  }

  render() {
    const d = this._data;
    const p = d?.p;
    if (!p) {
      this.innerHTML = `
        <article class="dbb-card dbb-seal empty">
          <p class="dbb-eyebrow">预测</p>
          <p class="dbb-kv">现在没有封存的预判。它听到你的近况后，会在事情发生之前写下一个判断。</p>
        </article>`;
      return;
    }
    const resolved = p.status === 'resolved';
    let status = '';
    if (resolved) {
      const st = lamellaStats(p);
      status = `<p class="dbb-status ${st.winner === 'shadow' ? 'ok' : ''}">${fmtClock(p.resolvedAt)} 揭晓：${p.outcome ? '发生了' : '没发生'}${p.note ? `（${esc(p.note)}）` : ''} · ${st.winner === 'shadow' ? '影子更近' : st.winner === 'body' ? '本体更近' : '一样近'}</p>`;
    }
    const prep = p.prepared?.length
      ? `<div class="dbb-prep"><p class="dbb-sub">已经准备好</p><ul>${p.prepared.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
      : '';
    this.innerHTML = `
      <article class="dbb-card dbb-seal">
        <p class="dbb-eyebrow">预测 <span class="dbb-stamp">结果之前已写下 · ${fmtClock(p.sealedAt)}</span></p>
        <h3 class="dbb-q">${esc(p.question)}</h3>
        <p class="dbb-when">${catChip(d.view, p.category)} 期限 ${fmtClock(p.deadline)}${resolved ? '' : ` · ${left(d.now ?? p.sealedAt, p.deadline)}`}</p>
        <div class="dbb-bars">
          <div class="dbb-bar body"><span>本体</span><i><b style="width:${pct(p.pBody)}"></b></i><em>${pct(p.pBody)}</em></div>
          <div class="dbb-bar shadow"><span>影子</span><i><b style="width:${pct(p.pShadow)}"></b></i><em>${pct(p.pShadow)}</em></div>
        </div>
        <p class="dbb-note">演示估计，不是准确率</p>
        ${prep}
        ${status}
      </article>`;
  }
}

define('dbb-seal-card', SealCard);
