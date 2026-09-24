// 手势语法（鼠标、手指、键盘一一对应）
//   拖动            转动它（松手后带惯性，然后慢慢扶正）
//   双指张开 / 捏合  往里挖一层 / 退回一层     （触控板捏合、Ctrl+滚轮同样）
//   轻点            选中：外面 → 此刻的它；剖面 → 那一代；再点 → 那一次；水面 → 倒影；水滴 → 那个预判
//   长按            数一数：它长了几代
//   双击            回到完整的样子
//   键盘            ←→↑↓ 转动 · + / − 挖深 / 退回 · Enter 下一层 · C 数一数 · Esc 返回 · Home 复位
export class StageInput {
  constructor(stage, el) {
    this.stage = stage;
    this.el = el;
    this.pointers = new Map();
    this.pinch = null;
    this.single = null;
    this.lastTap = null;
    this.wheelAcc = 0;
    this.holdTimer = 0;
    this.on = [];
    const add = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.on.push(() => target.removeEventListener(type, fn, opts)); };
    add(el, 'pointerdown', (e) => this.down(e));
    add(el, 'pointermove', (e) => this.move(e));
    add(el, 'pointerup', (e) => this.up(e));
    add(el, 'pointercancel', (e) => this.up(e, true));
    add(el, 'pointerleave', (e) => { if (e.pointerType === 'mouse') stage.hover(null); });
    add(el, 'wheel', (e) => this.wheel(e), { passive: false });
    add(el, 'contextmenu', (e) => e.preventDefault());
    add(stage.host, 'keydown', (e) => this.key(e));
  }

  dispose() {
    this.on.forEach((f) => f());
    clearTimeout(this.holdTimer);
  }

  local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }

  down(e) {
    if (!this.stage.opts.interactive) return;
    this.el.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, { ...p, x0: p.x, y0: p.y, t0: performance.now() });
    this.stage.wake();
    if (this.pointers.size === 1) {
      this.single = { id: e.pointerId, moved: false, lastX: p.x, lastY: p.y, t0: performance.now() };
      this.stage.press(p);
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.single && !this.single.moved) { this.single.held = true; this.stage.hold(p); }
      }, 520);
    } else if (this.pointers.size === 2) {
      clearTimeout(this.holdTimer);
      if (this.single?.moved) this.stage.endDrag();
      this.single = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      this.stage.release();
    }
  }

  move(e) {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') this.stage.hover(p);
      return;
    }
    const q = this.pointers.get(e.pointerId);
    q.x = p.x; q.y = p.y;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = Math.log(d / this.pinch.d0);
      if (k > 0.22) { this.stage.dig(+1); this.pinch.d0 = d; }
      else if (k < -0.22) { this.stage.dig(-1); this.pinch.d0 = d; }
      return;
    }
    const s = this.single;
    if (!s || s.id !== e.pointerId || s.held) return;
    const dx = p.x - s.lastX, dy = p.y - s.lastY;
    if (!s.moved && Math.hypot(p.x - q.x0, p.y - q.y0) > 5) {
      s.moved = true;
      clearTimeout(this.holdTimer);
      this.stage.beginDrag();
    }
    if (s.moved) this.stage.dragBy(dx, dy);
    s.lastX = p.x; s.lastY = p.y;
  }

  up(e, cancelled = false) {
    const q = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    clearTimeout(this.holdTimer);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) this.stage.release();
      return;
    }
    const s = this.single;
    if (!s || s.id !== e.pointerId) return;
    this.single = null;
    this.stage.release();
    if (s.moved) { this.stage.endDrag(); return; }
    if (cancelled || s.held || !q) return;
    const now = performance.now();
    if (now - s.t0 > 400) return;
    const p = { x: q.x, y: q.y, w: q.w, h: q.h };
    if (this.lastTap && now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 24) {
      this.lastTap = null;
      clearTimeout(this.tapTimer);
      this.stage.reset();
      return;
    }
    this.lastTap = { t: now, x: p.x, y: p.y };
    clearTimeout(this.tapTimer);
    // 等一下，确认不是双击
    this.tapTimer = setTimeout(() => this.stage.tap(p), 230);
  }

  wheel(e) {
    if (!this.stage.opts.interactive) return;
    if (!(this.stage.opts.wheelDigs || e.ctrlKey)) return;
    e.preventDefault();
    this.stage.wake();
    this.wheelAcc += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    if (this.wheelAcc < -60) { this.stage.dig(+1); this.wheelAcc = 0; }
    else if (this.wheelAcc > 60) { this.stage.dig(-1); this.wheelAcc = 0; }
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => { this.wheelAcc = 0; }, 260);
  }

  key(e) {
    if (e.target !== this.stage.host) return;
    const st = this.stage;
    const map = {
      ArrowLeft: () => st.nudge(-1, 0), ArrowRight: () => st.nudge(1, 0),
      ArrowUp: () => st.nudge(0, -1), ArrowDown: () => st.nudge(0, 1),
      '+': () => st.dig(+1), '=': () => st.dig(+1), PageDown: () => st.dig(+1),
      '-': () => st.dig(-1), _: () => st.dig(-1), PageUp: () => st.dig(-1),
      Enter: () => st.selectNext(1), ' ': () => st.selectNext(1),
      c: () => st.count(), C: () => st.count(),
      Escape: () => st.back(), Home: () => st.reset(),
    };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); st.wake(); fn(); }
  }
}
