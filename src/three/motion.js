// 动效：所有变化都用阻尼和缓动，没有线性的机械感。
import * as THREE from 'three';

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inQuad: (t) => t * t,
  outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

// 指数阻尼：当前值朝目标靠近，与帧率无关
export const damp = (cur, target, lambda, dt) => target + (cur - target) * Math.exp(-lambda * dt);

export function dampVec3(v, target, lambda, dt) {
  const k = Math.exp(-lambda * dt);
  v.x = target.x + (v.x - target.x) * k;
  v.y = target.y + (v.y - target.y) * k;
  v.z = target.z + (v.z - target.z) * k;
  return v;
}

// 一条条可等待的动画；舞台每帧推进。
export class Animator {
  constructor() {
    this.items = new Set();
    this.speed = 1;
  }
  run(duration, fn, { easing = ease.inOutCubic, delay = 0 } = {}) {
    return new Promise((resolve) => {
      const it = { t: -delay, duration: Math.max(1e-3, duration * this.speed), fn, easing, resolve };
      this.items.add(it);
      if (duration * this.speed <= 1e-3 && delay <= 0) { fn(1, 1); this.items.delete(it); resolve(); }
    });
  }
  wait(seconds) {
    return this.run(seconds, () => {}, { easing: ease.linear });
  }
  tick(dt) {
    for (const it of this.items) {
      it.t += dt;
      if (it.t < 0) continue;
      const raw = Math.min(1, it.t / it.duration);
      it.fn(it.easing(raw), raw);
      if (raw >= 1) { this.items.delete(it); it.resolve(); }
    }
  }
  clear() {
    for (const it of this.items) it.resolve();
    this.items.clear();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion();

// 它有重量：拖动时跟手，松手后带着惯性转，然后像不倒翁一样慢慢扶正。
export class Orientation {
  constructor() {
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3(); // 角速度（世界坐标，rad/s）
    this.dragging = false;
    this.righting = 9; // 扶正的“弹性”
    this.tiltDamping = 3.4; // 扶正时的摇晃衰减
    this.spinDamping = 1.15; // 自转的滑行衰减
    this.yawOnly = false;
    this._samples = [];
  }
  setYaw(rad) {
    this.q.setFromAxisAngle(UP, rad);
    this.w.set(0, 0, 0);
  }
  // 屏幕拖动 → 绕与拖动方向垂直的轴转（在世界坐标里左乘）
  drag(dx, dy, camera, dt, gain = 0.0085) {
    const right = _a.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = _v.set(0, 1, 0).applyQuaternion(camera.quaternion);
    let axis;
    if (this.yawOnly) axis = new THREE.Vector3(0, dx, 0);
    else axis = up.clone().multiplyScalar(dx).addScaledVector(right, dy);
    const len = axis.length();
    if (len < 1e-6) return;
    const angle = len * gain;
    axis.divideScalar(len);
    _q.setFromAxisAngle(axis, angle);
    this.q.premultiply(_q).normalize();
    const now = performance.now();
    this._samples.push({ t: now, axis: axis.clone(), angle });
    while (this._samples.length && now - this._samples[0].t > 90) this._samples.shift();
  }
  release() {
    const s = this._samples;
    if (s.length >= 2) {
      const span = Math.max(16, s[s.length - 1].t - s[0].t) / 1000;
      const acc = new THREE.Vector3();
      for (const it of s) acc.addScaledVector(it.axis, it.angle);
      this.w.copy(acc.divideScalar(span));
      const max = 9;
      if (this.w.length() > max) this.w.setLength(max);
    }
    this._samples = [];
  }
  impulse(axis, amount) {
    this.w.addScaledVector(axis, amount);
  }
  step(dt) {
    if (this.dragging) return;
    // 扶正：把自己的“上”转回世界的上
    const u = _v.set(0, 1, 0).applyQuaternion(this.q);
    const torque = _a.crossVectors(u, UP); // |torque| = sin(倾角)
    this.w.addScaledVector(torque, this.righting * dt);
    // 分开衰减：自转慢慢停，倾斜的摇晃快一点停
    const spin = this.w.dot(UP);
    const tilt = this.w.clone().addScaledVector(UP, -spin);
    const s = spin * Math.exp(-this.spinDamping * dt);
    tilt.multiplyScalar(Math.exp(-this.tiltDamping * dt));
    this.w.copy(tilt).addScaledVector(UP, s);
    if (this.yawOnly) this.w.set(0, s, 0);
    const ang = this.w.length() * dt;
    if (ang > 1e-7) {
      _q.setFromAxisAngle(_a.copy(this.w).normalize(), ang);
      this.q.premultiply(_q).normalize();
    }
  }
  // 一次性扶正（例如切开之前）：保留朝向，去掉倾斜
  levelNow() {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, 1);
    f.normalize();
    const yaw = Math.atan2(f.x, f.z);
    return new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  }
}
