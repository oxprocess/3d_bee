// 账本：只追加、不改写。形态上的每一处变化，都能在这里找到一条记录。
import { DbbElement, esc, pct, define } from './base.js';
import { fmtDayClock } from '../core/time.js';

const TYPE = {
  observe: ['对话', '观察'],
  seal: ['预测', '封存'],
  prepare: ['准备', '行动'],
  resolve: ['成长', '结果'],
  iterate: ['成长', '迭代时刻'],
  practice: ['成长', '新候选'],
};

function summary(e) {
  switch (e.type) {
    case 'observe': return `“${esc(e.text)}”`;
    case 'seal': return `${esc(e.prediction.question)} · 本体 ${pct(e.prediction.pBody)} / 影子 ${pct(e.prediction.pShadow)}`;
    case 'prepare': return `准备好 ${e.items.length} 件事：${esc(e.items.slice(0, 3).join('、'))}${e.items.length > 3 ? '…' : ''}`;
    case 'resolve': return `${e.outcome ? '发生了' : '没发生'}${e.note ? `：${esc(e.note)}` : ''} → 影子更新（形态：涟漪、倒影变一点）`;
    case 'iterate': return e.result === 'inherit' ? '影子经得起检验 → 继承为新的一层（形态：光柱、晶体多一层）' : '还不够 → 继续练（形态：晶体不变）';
    case 'practice': return `影子开始练：${esc(e.source ?? '')}`;
    default: return '';
  }
}

export class EventLog extends DbbElement {
  bind({ store }) {
    this.unbind();
    this.subscribe(store, (ch) => { this.data = ch.ledger.events; });
    this.data = store.ledger.events;
    return this;
  }

  render() {
    const ev = this._data ?? [];
    if (!ev.length) {
      this.innerHTML = '<p class="dbb-kv dbb-log-empty">账本里还没有新的记录。每做一件事，这里多一行；形态上的每一处变化，都对应其中一行。</p>';
      return;
    }
    this.innerHTML = `<ol class="dbb-log" reversed>${[...ev].reverse().map((e) => {
      const [tab, what] = TYPE[e.type] ?? [e.type, ''];
      return `<li><time>${e.at ? fmtDayClock(e.at) : ''}</time><span class="dbb-log-tag">${tab} · ${what}</span><p>${summary(e)}</p></li>`;
    }).join('')}</ol>`;
  }
}

define('dbb-event-log', EventLog);
