// 倒影（影子）正在练什么、练到哪了。每一格是一次比较：薄荷色 = 影子更近，淡紫 = 本体更近。
import { DbbElement, esc, define, catChip } from './base.js';
import { fmtDay } from '../core/time.js';

export class ShadowMeter extends DbbElement {
  bind({ store }) {
    this.unbind();
    this.subscribe(store, (ch) => { this.data = ch.view; });
    this.data = store.view;
    return this;
  }

  render() {
    const v = this._data;
    if (!v) { this.innerHTML = ''; return; }
    const s = v.shadow;
    const need = v.policy.minComparisons;
    if (s.mode === 'mirror') {
      this.innerHTML = `
        <article class="dbb-card dbb-shadow">
          <p class="dbb-eyebrow">倒影 · 影子 <span class="dbb-pill">和它一模一样</span></p>
          <h3>还没有开始练</h3>
          <p class="dbb-kv">刚诞生，或刚继承：倒影和晶体完全一样，清清楚楚。下一次结果到来，它就开始练一个新的方法。</p>
          <div class="dbb-slots" aria-hidden="true">${Array.from({ length: need }, () => '<i></i>').join('')}</div>
          <p class="dbb-rule">满 ${need} 次比较、并且影子比本体更准，才会长到它身上。</p>
        </article>`;
      return;
    }
    const lam = s.lamellae ?? [];
    const slots = Array.from({ length: Math.max(need, lam.length) }, (_, i) => {
      const l = lam[i];
      if (!l) return '<i></i>';
      const cls = l.winner === 'shadow' ? 'w-s' : l.winner === 'body' ? 'w-b' : 'w-t';
      return `<i class="${cls}" title="${esc(`${fmtDay(l.at)} ${l.note ?? ''}`)}"></i>`;
    }).join('');
    const pill = s.canInherit ? '<span class="dbb-pill ok">可以迭代</span>' : '<span class="dbb-pill mint">练习中</span>';
    this.innerHTML = `
      <article class="dbb-card dbb-shadow">
        <p class="dbb-eyebrow">倒影 · 影子 ${pill}</p>
        <h3>正在练：${esc(s.source ?? '')}</h3>
        <p class="dbb-when">${catChip(v, s.category)}${s.startedAt ? ` ${fmtDay(s.startedAt)}开始` : ''}</p>
        <p class="dbb-learned">想学会：${esc(s.learned ?? '')}</p>
        <div class="dbb-slots" role="img" aria-label="已比较 ${s.n} 次，共需 ${need} 次，影子更准 ${s.wins} 次">${slots}</div>
        <p class="dbb-kv">已比较 <em>${s.n}</em>/${need} 次 · 影子更准 <em>${s.wins}</em> 次 · 清晰度 <em>${s.clarity.toFixed(2)}</em> · 同步 <em>${s.agreement.toFixed(2)}</em></p>
        <p class="dbb-rule${s.canInherit ? ' ok' : ''}">${s.canInherit
          ? `已满足：满 ${need} 次，且影子更准。到了迭代时刻，它会升上来，成为新的一层。`
          : `满 ${need} 次、并且影子比本体更准，才会长到它身上；没练好，就继续留在水里练，晶体不变。`}</p>
      </article>`;
  }
}

define('dbb-shadow-meter', ShadowMeter);
