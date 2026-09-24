// 水滴与光柱。
//   水滴：一次封存的预判，悬在珍珠和水面之间，还没落下。离期限越近，它离水面越近。
//         结果到来时它落进水里，激起涟漪。
//   光柱：迭代时刻，倒影经得起检验，一道光从水里升起，接到珍珠身上。
import * as THREE from 'three';
import { createColumnMaterial, createMoteMaterial, createDropMaterial, glowTexture } from './materials.js';
import { damp } from './motion.js';
import { mixHex } from '../core/color.js';

function teardrop() {
  const g = new THREE.SphereGeometry(1, 32, 22);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0) { const k = 1 - 0.62 * Math.pow(y, 1.7); x *= k; z *= k; y *= 1.32; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export class Droplets {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'droplets';
    this.geo = teardrop();
    this.hitGeo = new THREE.SphereGeometry(2.6, 8, 6);
    this.hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.glowTex = glowTexture();
    this.items = new Map();
    this.layout = { x: 1.2, z: 0.6, yTop: 1.0, yBottom: 0.2, size: 0.075 };
  }

  setLayout(l) {
    Object.assign(this.layout, l);
  }

  slot(i) {
    const { x, z } = this.layout;
    const side = i % 2 ? -1 : 1;
    return { x: x + side * Math.ceil(i / 2) * 0.42, z: z - Math.ceil(i / 2) * 0.35 };
  }

  sync(pending, reduce) {
    const ids = new Set(pending.map((p) => p.id));
    pending.forEach((p, i) => {
      let it = this.items.get(p.id);
      if (!it) {
        const mat = createDropMaterial(mixHex('#BFD9EE', p.color, 0.35));
        const mesh = new THREE.Mesh(this.geo, mat);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTex, color: new THREE.Color(mixHex('#FFFFFF', p.color, 0.5)), transparent: true, depthWrite: false, opacity: 0,
        }));
        const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
        hit.userData.dropletId = p.id;
        const g = new THREE.Group();
        g.add(glow, mesh, hit);
        this.group.add(g);
        const s = this.slot(i);
        it = { id: p.id, g, mesh, glow, hit, mat, x: s.x, z: s.z, y: this.layout.yTop + 0.25, vy: 0, form: reduce ? 1 : 0, state: 'hang', phase: Math.random() * 6.28, pulse: 0 };
        this.items.set(p.id, it);
      }
      const s = this.slot(i);
      it.x = s.x; it.z = s.z;
      it.remaining = p.remaining;
      it.targetY = this.layout.yBottom + (this.layout.yTop - this.layout.yBottom) * p.remaining;
    });
    for (const [id, it] of this.items) {
      if (!ids.has(id) && it.state === 'hang') this.remove(id);
    }
  }

  pulse(id) {
    const it = this.items.get(id);
    if (it) it.pulse = 1;
  }

  // 落下：返回落水点（世界坐标）
  fall(id) {
    const it = this.items.get(id);
    if (!it) return Promise.resolve(null);
    it.state = 'fall';
    it.vy = 0;
    return new Promise((resolve) => { it.onImpact = resolve; });
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.group.remove(it.g);
    it.mat.dispose();
    it.glow.material.dispose();
    this.items.delete(id);
  }

  positionOf(id, out = new THREE.Vector3()) {
    const it = this.items.get(id);
    return it ? out.set(it.x, it.y, it.z) : null;
  }

  update(dt, time, reduce) {
    const size = this.layout.size;
    for (const [id, it] of this.items) {
      it.form = Math.min(1, it.form + dt / 0.9);
      const f = 1 - Math.pow(1 - it.form, 3);
      it.pulse = damp(it.pulse, 0, 2.5, dt);
      if (it.state === 'hang') {
        const sway = reduce ? 0 : Math.sin(time * 1.1 + it.phase) * 0.012;
        it.y = damp(it.y, it.targetY + sway, 2.2, dt);
      } else if (it.state === 'fall') {
        it.vy -= 3.4 * dt;
        it.y += it.vy * dt;
        if (it.y <= 0.02) {
          const at = { x: it.x, z: it.z };
          it.state = 'gone';
          const cb = it.onImpact;
          this.remove(id);
          cb?.(at);
          continue;
        }
      }
      it.g.position.set(it.x, it.y, it.z);
      const stretch = it.state === 'fall' ? 1 + Math.min(0.35, -it.vy * 0.12) : 1;
      it.mesh.scale.set(size * f, size * f * stretch, size * f);
      it.glow.scale.setScalar(size * 5.5 * f * (1 + it.pulse * 0.6));
      it.glow.material.opacity = (0.5 + it.pulse * 0.4) * f;
      it.hit.scale.setScalar(size);
    }
  }

  hitTargets() {
    return [...this.items.values()].map((it) => it.hit);
  }
}

export class LightColumn {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'light-column';
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.mat = createColumnMaterial();
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 5;
    const n = 64, seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.28;
      seeds.set([Math.cos(a) * r, Math.sin(a) * r, Math.random(), Math.random()], i * 4);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.moteMat = createMoteMaterial();
    this.motes = new THREE.Points(pg, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 6;
    this.group.add(this.mesh, this.motes);
    this.group.visible = false;
    this.amt = 0;
    this.rise = 0;
  }

  place(height, width, x = 0, z = 0) {
    this.group.position.set(x, 0, z);
    this.mesh.scale.set(width, height, 1);
    this.moteMat.uniforms.uHeight.value = height;
  }

  update(dt, time) {
    this.group.visible = this.amt > 0.002;
    this.mat.uniforms.uAmt.value = this.amt;
    this.mat.uniforms.uRise.value = this.rise;
    this.mat.uniforms.uTime.value = time;
    this.moteMat.uniforms.uTime.value = time;
    this.moteMat.uniforms.uAmt.value = this.amt * 0.9;
  }
}
