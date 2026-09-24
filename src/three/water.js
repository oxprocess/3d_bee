// 水面：倒影在这里被看见。涟漪只来自真实的结果；触摸只留下一点水光。
import * as THREE from 'three';
import { createWaterMaterial, MAX_RIPPLES } from './materials.js';
import { damp } from './motion.js';

export class Water {
  constructor() {
    this.material = createWaterMaterial();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'water';
    this.ripples = [];
    this.glint = { x: 0, z: 0, amt: 0, target: 0 };
    this.shimmer = 0;
  }

  // amp：这一次的意外程度决定涟漪多大
  addRipple(x, z, amp, color, time) {
    this.ripples.push({ x, z, t0: time, amp, color: new THREE.Color(color) });
    while (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
    this.writeRipples();
  }

  writeRipples() {
    const u = this.material.uniforms;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = this.ripples[i];
      if (r) { u.uRip.value[i].set(r.x, r.z, r.t0, r.amp); u.uRipCol.value[i].copy(r.color); }
      else u.uRip.value[i].set(0, 0, -99, 0);
    }
  }

  touch(x, z) {
    this.glint.x = x; this.glint.z = z; this.glint.target = 1;
  }

  release() {
    this.glint.target = 0;
  }

  update(dt, time) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    const before = this.ripples.length;
    this.ripples = this.ripples.filter((r) => time - r.t0 < 10);
    if (this.ripples.length !== before) this.writeRipples();
    this.glint.amt = damp(this.glint.amt, this.glint.target, this.glint.target > this.glint.amt ? 10 : 2.2, dt);
    u.uGlint.value.set(this.glint.x, this.glint.z, this.glint.amt);
    u.uShimmer.value = this.shimmer;
  }
}
