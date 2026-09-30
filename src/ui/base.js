// 组件基类：轻量 Web Component，渲染在 light DOM 里，样式全部来自 dbb.css 的令牌。
// 用法：el.data = {...}；或 el.bind({ store, stage })，让它自己订阅变化。
// 颜色都经过 core/tone.js，和晶体用同一种颜色。
import { tone } from '../core/tone.js';

export class DbbElement extends HTMLElement {
  constructor() {
    super();
    this._data = null;
    this._off = [];
  }
  set data(v) {
    this._data = v;
    if (this.isConnected) this.render();
  }
  get data() {
    return this._data;
  }
  connectedCallback() {
    this.classList.add('dbb-el');
    this.render();
  }
  disconnectedCallback() {
    this.unbind();
  }
  unbind() {
    this._off.forEach((f) => f());
    this._off = [];
  }
  listen(target, type, fn) {
    target.addEventListener(type, fn);
    this._off.push(() => target.removeEventListener(type, fn));
  }
  subscribe(store, fn) {
    this._off.push(store.subscribe(fn));
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }
  render() {}
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;

export function define(name, cls) {
  if (!customElements.get(name)) customElements.define(name, cls);
}

export function catChip(view, id) {
  const c = view?.cats?.get(id);
  if (!c) return '';
  return `<span class="dbb-chip"><i style="background:${tone(c.color)}"></i>${esc(c.label)}</span>`;
}
