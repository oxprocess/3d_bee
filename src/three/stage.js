// PearlStage：derbeebee 的 3D 形态。
// 只读 FormSpec（见 core/view.js），从不改账本；账本变了，由宿主把 change 交给 stage.apply()。
//
// 深度（挖掘）有 N+1 个停靠点，N = 代数：
//   0        外形    完整的晶体，水里是倒影
//   1        剖开    揭顶：上面的尖顶抬起、向后翻开，下半露出赤道剖面（一圈是一代）
//   2 … N    剥开    从最外一层起，一层层化开；剖面上留下一道虚线，标出它后来长到的位置
//            深度就是时间：剥掉 k 层，看到的就是 k 代以前的它。最深处是核——诞生时的它。
// 在剖面上点一圈，镜头推近那一代；再点，选中其中一条细纹——那一次真实的比较。
import * as THREE from 'three';
import { RULE } from '../core/growth.js';
import { hexToRgb, mixHex, oklabOf } from '../core/color.js';
import { tone, layerTone } from '../core/tone.js';
import { createCrystal, crystalShared, createCapMaterial, MAX_LAYERS, MAX_LAMELLAE } from './materials.js';
import { shapeField, surfaceGeometry, capGeometry, outlineGeometry, radiusAt, extents } from './geometry.js';
import { buildEnvironment } from './env.js';
import { readPalette, watchTheme, reducedMotion, LOOK } from './palette.js';
import { Animator, Orientation, damp, dampVec3, ease } from './motion.js';
import { Water } from './water.js';
import { Droplets, LightColumn } from './effects.js';
import { StageInput } from './input.js';

const WS = RULE.worldScale;
const GAP = 0.42;
const FOV = 28;
const UP = new THREE.Vector3(0, 1, 0);
const IDENT = new THREE.Quaternion();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

export class PearlStage extends EventTarget {
  constructor(host, opts = {}) {
    super();
    this.host = host;
    this.opts = { interactive: true, wheelDigs: false, haptics: true, captions: true, labels: true, ...opts };
    this.reduce = reducedMotion();
    host.classList.add('dbb-stage');
    if (!host.hasAttribute('tabindex')) host.tabIndex = 0;
    host.setAttribute('role', 'group');
    host.setAttribute('aria-roledescription', '可转动的 3D 晶体');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dbb-canvas';
    host.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 120);
    this.camPos = new THREE.Vector3(0, 2, 12);
    this.camTarget = new THREE.Vector3(0, 0.5, 0);
    this.camera.position.copy(this.camPos);

    // 本体
    this.anchor = new THREE.Group();
    this.orient = new THREE.Group();
    this.scaleG = new THREE.Group();
    this.scene.add(this.anchor);
    this.anchor.add(this.orient);
    this.orient.add(this.scaleG);
    this.shared = crystalShared();
    this.proxyMat = createCrystal({ shared: this.shared });
    this.proxy = new THREE.Mesh(new THREE.BufferGeometry(), this.proxyMat);
    this.proxy.name = 'pearl';
    this.scaleG.add(this.proxy);

    // 倒影：挂在一个 y 轴镜像的组下面，只在反射通道里渲染
    this.mirror = new THREE.Group();
    this.mirror.scale.y = -1;
    this.sAnchor = new THREE.Group();
    this.sOrient = new THREE.Group();
    this.sScale = new THREE.Group();
    this.scene.add(this.mirror);
    this.mirror.add(this.sAnchor);
    this.sAnchor.add(this.sOrient);
    this.sOrient.add(this.sScale);
    this.sShared = crystalShared();
    this.shadowMat = createCrystal({ shared: this.sShared, fade: true, tint: true, shadow: true });
    // 倒影里看到的是晶体的底面：环境光按镜像取样，底面照到的是水和身下的光，而不是天空
    this.shadowMat.envMapRotation.set(Math.PI, 0, 0);
    this.shadowMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.shadowMat);
    this.shadowMesh.layers.set(1);
    this.sScale.add(this.shadowMesh);

    this.capMat = createCapMaterial();
    this.outlineMat = new THREE.LineDashedMaterial({ color: 0x8e86a0, dashSize: 0.045, gapSize: 0.035, transparent: true, opacity: 0.8, depthWrite: false });

    this.water = new Water();
    this.scene.add(this.water.mesh);
    this.droplets = new Droplets();
    this.scene.add(this.droplets.group);
    this.column = new LightColumn();
    this.scene.add(this.column.group);
    // 光谱（Apple Intelligence 式）：每一类事的分量、成熟度，缓慢流动的相位，事件时的流速与浓度
    const specState = () => ({ w: new Float32Array(8), wT: new Float32Array(8), mature: 0, matureT: 0, phase: 0, flow: 0, boost: 0 });
    this.spec = { body: specState(), shadow: specState() };

    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.water.material.uniforms.uRefl.value = this.rt.texture;

    this.orientation = new Orientation();
    this.orientation.setYaw(-0.35);
    this.animator = new Animator();
    if (this.reduce) this.animator.speed = 0.25;

    this.qDisplay = new THREE.Quaternion();
    this.qShadow = new THREE.Quaternion();
    this.qGaze = new THREE.Quaternion();
    this.restTilt = new THREE.Quaternion();
    this.tiltAmt = 1;
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0 };
    // 光跟着注意力：指针、按住的手指，或者手机的倾斜，让玻璃上的主光轻轻移动
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.tilt = { x: 0, y: 0, base: null };
    this.onTilt = (e) => {
      if (e.beta == null || e.gamma == null) return;
      const t = this.tilt;
      if (!t.base) t.base = { b: e.beta, g: e.gamma };
      // 基准慢慢跟上当前的握持角度：只对“倾斜的变化”有反应
      t.base.b += (e.beta - t.base.b) * 0.02;
      t.base.g += (e.gamma - t.base.g) * 0.02;
      t.x = clamp((e.gamma - t.base.g) / 25, -1, 1);
      t.y = clamp(-(e.beta - t.base.b) / 25, -1, 1);
    };
    // 不需要授权的设备才听倾斜（iOS 需要弹窗授权，不为一道高光去打扰人）
    if (!this.reduce && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      window.addEventListener('deviceorientation', this.onTilt);
    }
    this.time = 0;
    this.breathPhase = 0;
    this.doze = 0;
    this.lastActive = performance.now();
    this.depth = 0;
    this.depthTarget = 0;
    this.digElev = 0.66;
    this.sel = null;
    this.focus = null;
    this.hoverY = 1.2;
    this.hoverTarget = 1.2;
    this.shadowDip = 0;
    this.shiver = 0;
    this.agreement = 1;
    this.clarity = 1;
    this.reflAmt = 1;
    this.glowBody = 0;
    this.glowShadow = 0;
    this.glowTargets = { body: 0, shadow: 0 };
    this.pressing = false;
    // 按下去有一点回弹：像碰到一个有弹性的、活的东西（弹簧，稍欠阻尼，回来时轻轻越过一点）
    this.spring = { x: 1, v: 0, target: 1 };
    this.anchors = new Map();
    this.visible = true;
    this.hinge = { point: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0) };

    this.buildOverlay();
    this.applyTheme();
    this.unwatchTheme = watchTheme(() => this.applyTheme());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.io = new IntersectionObserver((es) => { this.visible = es[0]?.isIntersecting ?? true; }, { threshold: 0 });
    this.io.observe(host);
    this.input = new StageInput(this, this.canvas);
    this.raycaster = new THREE.Raycaster();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // ───────────────────────── 视图 ─────────────────────────

  setView(view, { transition = 'none' } = {}) {
    const first = !this.view;
    this.view = view;
    const F = shapeField(view);
    this.F = F;
    const N = view.layers.length;
    this.N = N;
    this.ext = extents(F, N - 1);
    this.layerMax = view.layers.map((_, k) => extents(F, k).max);
    this.hoverTarget = this.ext.bottom * WS + GAP;
    if (first) this.hoverY = this.hoverTarget;

    const geo = surfaceGeometry(F, N - 1);
    const dur = this.reduce ? 0 : transition === 'grow' ? 1.8 : transition === 'morph' ? 1.1 : 0;
    if (!first && dur > 0 && this.proxy.geometry.attributes.position?.count === geo.attributes.position.count) this.morphMesh(this.proxy, geo, dur);
    else this.swapGeometry(this.proxy, geo);

    this.updateShadow(view, transition === 'none' || first ? 0 : 1.2);
    this.writeCapData();
    const p = view.pose;
    this.restTilt.setFromAxisAngle(new THREE.Vector3(...p.axis), p.angle);

    this.disposeAssembly();
    if (this.depthTarget > 0) {
      this.depthTarget = Math.min(this.depthTarget, N);
      this.buildAssembly();
    }
    this.sel = null;
    this.focus = null;
    this.capMat.uniforms.uSel.value = -1;
    this.capMat.uniforms.uLam.value = -1;
    this.updateSpectrum(first);
    this.syncDroplets();
    this.updateProbLabels();
    this.updateAria();
    this.applyColumnColor();
    this.emit('view', { view });
  }

  // 光谱的数据（Apple Intelligence 式）。颜色不是贴上去的，是从这颗晶体的生长算出来的：
  //   在哪一侧   每一类事的颜色落在它长出来的那一侧（类别的方位角）
  //   占多宽     这一类事长出的厚度之和，占得越多，那一片颜色越宽、越浓
  //   有多浓     成熟度 = 已经长成几代：诞生时只有很淡的一圈光谱，经历让颜色变浓
  //   倒影       再加上正在练的那一层（按练习进度），所以倒影的颜色偏向它在练的那类事
  //   挖掘       剥到第 k 代，就只算到第 k 代：往深处挖，颜色退回那时候的样子
  updateSpectrum(snap = false) {
    const v = this.view;
    if (!v) return;
    const cats = [...v.cats.values()].slice(0, 8);
    const N = v.layers.length;
    const left = this.depthTarget <= 1 ? N : N - (this.depthTarget - 1);
    const cand = v.shadow.mode === 'practice' && this.depthTarget === 0 ? v.shadow.candidate : null;
    const p = cand ? v.shadow.progress : 0;
    const share = (extra) => {
      const m = new Map(cats.map((c) => [c.id, 0]));
      const add = (L, k) => { for (const lb of L.lobes) if (m.has(lb.cat)) m.set(lb.cat, m.get(lb.cat) + L.t * lb.w * k); };
      for (let k = 1; k < left; k++) add(v.layers[k], 1);
      if (cand && extra > 0) add(cand, extra);
      const max = Math.max(0, ...m.values());
      return cats.map((c) => (max > 0 ? m.get(c.id) / max : 0));
    };
    const lab = cats.map((c) => oklabOf(tone(c.color, 'apple')));
    const sets = [[this.shared, this.spec.body, share(0), left], [this.sShared, this.spec.shadow, share(p), left + p]];
    for (const [u, st, w, n] of sets) {
      u.uSpecN.value = cats.length;
      st.wT.fill(0);
      cats.forEach((c, i) => {
        u.uCatAz.value[i] = c.az;
        u.uCatLab.value[i].set(...lab[i]);
        st.wT[i] = w[i];
      });
      st.matureT = clamp((n - 1) / 4, 0, 1);
      // 第一次出现：分量直接到位，浓度从诞生般的淡慢慢亮起来——它醒过来（减少动态效果时直接到位）
      if (snap || this.reduce) { st.w.set(st.wT); st.mature = this.reduce ? st.matureT : 0; }
    }
  }

  swapGeometry(mesh, geo) {
    const old = mesh.geometry;
    mesh.geometry = geo;
    mesh.updateMorphTargets();
    old?.dispose();
  }

  morphMesh(mesh, geo, duration) {
    const old = mesh.geometry;
    const g = geo.clone();
    g.morphAttributes.position = [old.attributes.position.clone()];
    g.morphAttributes.normal = [old.attributes.normal.clone()];
    g.morphTargetsRelative = false;
    mesh.geometry = g;
    mesh.updateMorphTargets();
    mesh.morphTargetInfluences[0] = 1;
    old.dispose();
    return this.animator.run(duration, (t) => { if (mesh.geometry === g) mesh.morphTargetInfluences[0] = 1 - t; }, { easing: ease.inOutCubic }).then(() => {
      if (mesh.geometry === g) { mesh.geometry = geo; g.dispose(); mesh.updateMorphTargets(); }
      else geo.dispose();
    });
  }

  updateShadow(view, morph = 0) {
    const F = this.F, N = view.layers.length, s = view.shadow;
    const p = s.mode === 'practice' && F.hasCandidate ? s.progress : 0;
    // 倒影的底色：只蒙一层很薄的白（水里的东西总是淡一点），练习时再带一点它在练的那类事的颜色
    const practiceTint = mixHex('#FFFFFF', tone(s.catColor ?? s.color), 0.35);
    const geo = surfaceGeometry(F, N - 1, 'full', { extra: p });
    if (morph > 0 && !this.reduce && this.shadowMesh.geometry.attributes.position?.count === geo.attributes.position.count) this.morphMesh(this.shadowMesh, geo, morph);
    else this.swapGeometry(this.shadowMesh, geo);
    this.targetClarity = s.clarity;
    this.targetAgreement = s.agreement;
    const own = this.shadowMat.userData.own;
    own.uTint.value.set(s.mode === 'practice' ? practiceTint : LOOK.mirrorTint);
    own.uTintAmt.value = s.mode === 'practice' ? 0.14 + 0.14 * (1 - s.clarity) : 0.08;
  }

  writeCapData() {
    const u = this.capMat.uniforms;
    const data = this.capMat.userData.lamData;
    data.fill(0);
    this.view.layers.forEach((L, k) => {
      if (k >= MAX_LAYERS) return;
      // 剖面是大片的平面，同样的颜色铺开会比晶体表面显得重，提亮一点
      const shown = this.mapColor(L.color, L.core, L);
      const [r, g, b] = hexToRgb(L.core ? shown : mixHex(shown, '#FFFFFF', 0.22));
      u.uColors.value[k].setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      const lam = L.lamellae ?? [];
      u.uCounts.value[k] = Math.max(1, Math.min(MAX_LAMELLAE, lam.length || 1));
      lam.slice(0, MAX_LAMELLAE).forEach((l, i) => {
        const o = 4 * (k * MAX_LAMELLAE + i);
        data[o] = Math.round(clamp(l.surpriseShadow ?? 0.3, 0, 1) * 255);
        data[o + 1] = l.outcome ? 255 : 0;
        data[o + 2] = l.winner === 'shadow' ? 255 : 0;
        data[o + 3] = 255;
      });
      u.uDis.value[k] = 0;
      u.uLit.value[k] = 0;
    });
    this.capMat.userData.lamTex.needsUpdate = true;
  }

  // ───────────────────────── 剖开的组件 ─────────────────────────

  buildAssembly() {
    this.disposeAssembly();
    const F = this.F, N = this.N;
    const asm = new THREE.Group();
    const bowl = new THREE.Group();
    const lidPivot = new THREE.Group();
    const lidInner = new THREE.Group();
    asm.add(bowl, lidPivot);
    lidPivot.add(lidInner);
    const layers = [];
    for (let k = 0; k < N; k++) {
      const mat = createCrystal({ shared: this.shared, dissolve: true });
      mat.userData.own.uDisR.value = Math.max(0.3, extents(F, k).full);
      const lower = new THREE.Mesh(surfaceGeometry(F, k, 'lower'), mat);
      const upper = new THREE.Mesh(surfaceGeometry(F, k, 'upper'), mat);
      lower.userData.layer = k;
      upper.userData.layer = k;
      bowl.add(lower);
      lidInner.add(upper);
      let outline = null;
      if (k > 0) {
        outline = new THREE.Line(outlineGeometry(F, k), this.outlineMat.clone());
        outline.computeLineDistances();
        const Lk = this.view.layers[k];
        outline.material.color.set(this.mapColor(Lk.color, Lk.core, Lk)).multiplyScalar(0.75);
        outline.visible = false;
        bowl.add(outline);
      }
      layers.push({ k, mat, lower, upper, outline });
    }
    const capUp = new THREE.Mesh(capGeometry(F, true), this.capMat);
    const capDown = new THREE.Mesh(capGeometry(F, false), this.capMat);
    capUp.userData.cap = 'bowl';
    capDown.userData.cap = 'lid';
    bowl.add(capUp);
    lidInner.add(capDown);
    this.scaleG.add(asm);
    this.asm = { group: asm, bowl, lidPivot, lidInner, layers, capUp, capDown };
    this.placeHinge();
  }

  disposeAssembly() {
    if (!this.asm) return;
    this.asm.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== this.capMat) o.material.dispose();
    });
    this.scaleG.remove(this.asm.group);
    this.asm = null;
  }

  // 铰链放在离镜头最远的一侧：盖子朝后翻开，剖面正对着你
  placeHinge() {
    if (!this.asm) return;
    const inv = this.qDisplayLevel().invert();
    const cam = this.camera.position.clone().sub(this.anchor.position).applyQuaternion(inv);
    cam.y = 0;
    if (cam.lengthSq() < 1e-6) cam.set(0, 0, 1);
    const dir = cam.normalize().multiplyScalar(-1);
    const r = radiusAt(this.F, this.N - 1, dir.x, 0, dir.z);
    this.hinge.point.copy(dir).multiplyScalar(r);
    this.hinge.axis.crossVectors(UP, dir).normalize();
    this.asm.lidPivot.position.copy(this.hinge.point);
    this.asm.lidInner.position.copy(this.hinge.point).multiplyScalar(-1);
  }

  qDisplayLevel() {
    return this.orientation.levelNow();
  }

  // ───────────────────────── 深度（挖掘） ─────────────────────────

  get depthStops() {
    const N = this.N ?? 1;
    const stops = [{ d: 0, label: '外形' }, { d: 1, label: '剖面' }];
    for (let d = 2; d <= N; d++) stops.push({ d, label: `第 ${N - d + 1} 代` });
    return stops;
  }

  setDepth(d) {
    if (!this.view) return;
    d = clamp(Math.round(d), 0, this.N);
    if (d === this.depthTarget) return;
    const from = this.depthTarget;
    if (d > 0 && !this.asm) this.buildAssembly();
    if (from === 0 && d > 0) {
      this.orientation.yawOnly = true;
      this.orientation.w.set(0, this.orientation.w.y, 0);
      this.placeHinge();
    }
    if (d === 0) this.orientation.yawOnly = false;
    this.depthTarget = d;
    this.updateSpectrum();
    this.clearSelection(false);
    this.haptic(d > from ? 10 : 6);
    const layersLeft = d <= 1 ? this.N : this.N - (d - 1);
    this.emit('depth', { depth: d, max: this.N, layersLeft, label: this.depthStops[d]?.label, gen: d >= 1 ? layersLeft : null });
    if (d === 1 && from === 0) this.caption('剖开来看：一圈是一代，最里面是诞生时的它');
    else if (d >= 2) {
      const L = this.view.layers[layersLeft - 1];
      this.caption(layersLeft === 1 ? '最深处：诞生时的它，还没有属于你的学习历史' : `回到第 ${layersLeft} 代：${fmtShort(L)}`);
    } else if (d === 0) this.caption('');
    this.updateAria();
  }

  dig(delta) {
    this.setDepth(this.depthTarget + delta);
  }

  back() {
    if (this.sel) this.clearSelection();
    else if (this.depthTarget > 0) this.setDepth(this.depthTarget - 1);
  }

  reset() {
    this.clearSelection(false);
    this.setDepth(0);
    this.orientation.w.set(0, 0, 0);
    this.animator.run(0.8, (t) => { this.orientation.q.slerp(new THREE.Quaternion().setFromAxisAngle(UP, -0.35), t); });
    this.emit('reset', {});
  }

  // 转过来：把某一个方位（类别的方位角）转到正对你，略偏右一点，左边还看得见相邻的一类
  turnTo(az, duration = 1.6) {
    const target = new THREE.Quaternion().setFromAxisAngle(UP, az - Math.PI / 2 - 0.2);
    const from = this.orientation.q.clone();
    this.orientation.w.set(0, 0, 0);
    return this.animator.run(this.reduce ? 0.01 : duration, (t) => {
      if (this.orientation.dragging) return;
      this.orientation.q.slerpQuaternions(from, target, t);
      this.orientation.w.set(0, 0, 0);
    }, { easing: ease.inOutCubic });
  }

  // ───────────────────────── 选中 ─────────────────────────

  select(k, lam = -1, point = null) {
    if (!this.view) return;
    const L = this.view.layers[k];
    if (!L) return;
    this.sel = { k, lam };
    this.capMat.uniforms.uSel.value = k;
    this.capMat.uniforms.uLam.value = lam;
    if (point && this.depthTarget > 0) this.focus = point.clone();
    const lamella = lam >= 0 ? L.lamellae[lam] : null;
    this.emit('select', { k, gen: k + 1, layer: L, lamellaIndex: lam, lamella, view: this.view });
    this.haptic(lam >= 0 ? 6 : 12);
  }

  clearSelection(emit = true) {
    const had = !!this.sel;
    this.sel = null;
    this.focus = null;
    this.capMat.uniforms.uSel.value = -1;
    this.capMat.uniforms.uLam.value = -1;
    if (emit && had) this.emit('select', { k: -1, view: this.view });
  }

  selectNext(dir = 1) {
    if (!this.view) return;
    if (this.depthTarget === 0) { this.setDepth(1); return; }
    const top = this.depthTarget <= 1 ? this.N - 1 : this.N - this.depthTarget;
    const cur = this.sel ? this.sel.k : top + 1;
    let k = cur - dir;
    if (k < 0) k = top;
    if (k > top) k = 0;
    this.select(k, -1, this.sectionPoint(k));
  }

  // 剖面上第 k 层的中点（朝镜头右前方）
  sectionPoint(k) {
    if (!this.asm) return null;
    const dirW = new THREE.Vector3(0.55, 0, 0.83);
    const inv = this.orient.quaternion.clone().invert();
    const dl = dirW.clone().applyQuaternion(inv);
    dl.y = 0;
    dl.normalize();
    const r0 = k === 0 ? 0 : radiusAt(this.F, k - 1, dl.x, 0, dl.z);
    const r1 = radiusAt(this.F, k, dl.x, 0, dl.z);
    const p = dl.multiplyScalar((r0 + r1) / 2);
    return this.asm.bowl.localToWorld(p);
  }

  // ───────────────────────── 手势 ─────────────────────────

  wake() {
    this.lastActive = performance.now();
  }

  ndc(p) {
    return new THREE.Vector2((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1);
  }

  hover(p) {
    if (!p || !this.opts.interactive) { this.gaze.tx = 0; this.gaze.ty = 0; this.pointer.tx = 0; this.pointer.ty = 0; return; }
    const n = this.ndc(p);
    this.pointer.tx = clamp(n.x, -1, 1);
    this.pointer.ty = clamp(n.y, -1, 1);
    if (this.reduce) return;
    this.gaze.tx = n.x * 0.09;
    this.gaze.ty = -n.y * 0.05;
    this.wake();
  }

  pick(p) {
    this.raycaster.setFromCamera(this.ndc(p), this.camera);
    this.scene.updateMatrixWorld();
    const targets = [];
    if (this.depth > 0.02 && this.asm) {
      targets.push(this.asm.capUp, this.asm.capDown);
      this.asm.layers.forEach((l) => { if (l.lower.visible) targets.push(l.lower, l.upper); });
    } else targets.push(this.proxy);
    targets.push(...this.droplets.hitTargets());
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length) return hits[0];
    const plane = new THREE.Plane(UP, 0);
    const pt = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, pt)) {
      const R = this.ext.max * WS;
      if (Math.abs(pt.x) < R * 1.6 && pt.z > -R * 1.2 && pt.z < R * 6) return { water: true, point: pt };
    }
    return null;
  }

  press(p) {
    this.pressing = true;
    const n = this.ndc(p);
    this.pointer.tx = clamp(n.x, -1, 1);
    this.pointer.ty = clamp(n.y, -1, 1);
    const hit = this.pick(p);
    if (!hit) return;
    if (hit.water) { this.water.touch(hit.point.x, hit.point.z); return; }
    if (hit.object === this.proxy || hit.object.userData.layer !== undefined) {
      const local = this.scaleG.worldToLocal(hit.point.clone());
      this.shared.uWarmPos.value.copy(local);
      this.warmTarget = 1;
      this.spring.target = 0.975;
    }
  }

  release() {
    this.pressing = false;
    this.warmTarget = 0;
    this.spring.target = 1;
    this.water.release();
    if (!matchMedia?.('(hover: hover)').matches) { this.pointer.tx = 0; this.pointer.ty = 0; }
  }

  beginDrag() {
    this.orientation.dragging = true;
    this.orientation.w.set(0, 0, 0);
    this.dragging = true;
    this.gaze.tx = 0; this.gaze.ty = 0;
  }

  dragBy(dx, dy) {
    if (this.depthTarget > 0) {
      this.orientation.drag(dx, 0, this.camera, 0, 0.0085);
      this.digElev = clamp(this.digElev + dy * 0.004, 0.28, 1.3);
    } else this.orientation.drag(dx, dy, this.camera, 0, 0.0085);
    this.wake();
  }

  endDrag() {
    this.orientation.dragging = false;
    this.dragging = false;
    this.orientation.release();
  }

  nudge(x, y) {
    if (this.depthTarget > 0) {
      this.orientation.impulse(UP, x * 1.6);
      this.digElev = clamp(this.digElev + y * 0.12, 0.28, 1.3);
    } else {
      this.orientation.impulse(UP, x * 1.8);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this.orientation.impulse(right, y * 1.2);
    }
  }

  tap(p) {
    const hit = this.pick(p);
    if (!hit) {
      if (this.sel) this.clearSelection();
      this.emit('tap', { target: 'empty' });
      return;
    }
    if (hit.water) {
      this.water.touch(hit.point.x, hit.point.z);
      setTimeout(() => this.water.release(), 380);
      this.emit('tap', { target: 'shadow', view: this.view });
      this.haptic(6);
      return;
    }
    if (hit.object.userData.dropletId) {
      this.droplets.pulse(hit.object.userData.dropletId);
      this.emit('tap', { target: 'droplet', id: hit.object.userData.dropletId, view: this.view });
      this.haptic(6);
      return;
    }
    if (hit.object === this.proxy) {
      this.emit('tap', { target: 'pearl', view: this.view });
      this.select(this.N - 1);
      return;
    }
    if (hit.object.userData.cap) {
      const obj = hit.object;
      const local = obj.worldToLocal(hit.point.clone());
      const r = Math.hypot(local.x, local.z);
      const dx = local.x / (r || 1), dz = local.z / (r || 1);
      const top = this.depthTarget <= 1 ? this.N - 1 : this.N - this.depthTarget;
      let k = 0;
      for (; k < top; k++) if (radiusAt(this.F, k, dx, 0, dz) >= r) break;
      const r0 = k === 0 ? 0 : radiusAt(this.F, k - 1, dx, 0, dz);
      const r1 = radiusAt(this.F, k, dx, 0, dz);
      const s = clamp((r - r0) / Math.max(1e-4, r1 - r0), 0, 0.9999);
      const L = this.view.layers[k];
      const n = Math.max(1, Math.min(MAX_LAMELLAE, L.lamellae.length || 1));
      const lam = this.sel && this.sel.k === k && L.lamellae.length ? Math.floor(s * n) : -1;
      this.select(k, lam, hit.point);
      return;
    }
    if (hit.object.userData.layer !== undefined) {
      this.select(hit.object.userData.layer);
    }
  }

  // 长按：数一数它长了几代
  hold() {
    this.count();
  }

  async count() {
    if (this.counting || !this.view) return;
    this.counting = true;
    const top = this.depthTarget <= 1 ? this.N - 1 : this.N - this.depthTarget;
    const lit = this.capMat.uniforms.uLit.value;
    for (let k = 0; k <= top; k++) {
      this.countK = k;
      if (this.depthTarget > 0) { lit.fill(0); lit[k] = 1; }
      else this.pulse = 1;
      if (this.depthTarget === 0) this.spec.body.flow += 0.6;
      this.emit('count', { k, n: k + 1, total: top + 1, layer: this.view.layers[k] });
      this.haptic(8);
      await this.animator.wait(this.reduce ? 0.12 : 0.42);
    }
    lit.fill(0);
    this.countK = null;
    this.emit('count', { done: true, total: top + 1 });
    this.caption(`数到 ${top + 1}：它长了 ${top + 1} 代`);
    this.counting = false;
  }

  haptic(ms) {
    if (!this.opts.haptics) return;
    try { navigator.vibrate?.(ms); } catch { /* 不支持就算了 */ }
  }

  // ───────────────────────── 账本事件 → 形态上的变化 ─────────────────────────

  async apply(change) {
    const { effect, view } = change;
    // 动画是异步的：先记下最新的状态，动画结束时用最新的，而不是动画开始时的
    this.latest = view;
    switch (effect.type) {
      case 'observe':
        this.setView(view);
        // 它在听：颜色流得快一阵，再慢慢静下来
        this.spec.body.flow += 5;
        this.caption('它在听：你说的，变成它此刻的状态');
        break;
      case 'seal': {
        this.setView(view);
        const p = effect.prediction;
        this.glowTargets.body = p.pBody;
        this.glowTargets.shadow = p.pShadow;
        this.flash = 1;
        // 两者都给出了判断：两者的颜色各自浓一下、流一下，浓淡按各自的概率
        this.spec.body.boost += 0.7 * p.pBody;
        this.spec.shadow.boost += 0.7 * p.pShadow;
        this.spec.body.flow += 1.5;
        this.spec.shadow.flow += 1.5;
        this.caption(`结果之前已写下：本体 ${pct(p.pBody)}，影子 ${pct(p.pShadow)}`);
        break;
      }
      case 'prepare':
        this.setView(view);
        this.droplets.pulse(effect.prediction.id);
        this.caption('下一步已经准备好；水面平静，等结果');
        break;
      case 'resolve':
        await this.resolveSequence(change);
        break;
      case 'inherit':
        await this.inheritSequence(change);
        break;
      case 'clock':
        this.setView(view);
        break;
      case 'continue':
        this.setView(view);
        this.continueSequence(effect);
        break;
      default:
        this.setView(view, { transition: 'morph' });
    }
    this.emit('applied', change);
  }

  async resolveSequence(change) {
    const { effect, view } = change;
    const id = effect.prediction.id;
    const at = await this.droplets.fall(id);
    const pos = at ?? { x: this.droplets.layout.x, z: this.droplets.layout.z };
    const amp = (this.reduce ? 0.35 : 0.55) + 1.7 * effect.surpriseShadow;
    const catCol = view.cats.get(effect.category)?.color ?? '#ffffff';
    this.water.addRipple(pos.x, pos.z, amp, mixHex(tone(catCol), '#FFFFFF', 0.25), this.time);
    // 结果落在倒影上：倒影的颜色被搅动，意外越大搅得越厉害；晶体的颜色不动
    this.spec.shadow.flow += 3 + 7 * effect.surpriseShadow;
    this.spec.shadow.boost += 0.3 + 0.8 * effect.surpriseShadow;
    this.haptic(14);
    this.glowTargets.body = 0;
    this.glowTargets.shadow = 0;
    // 晶体没动；倒影抖一下，变一点
    this.shiverT = 0;
    this.setView(this.latest ?? view, { transition: 'shadow' });
    this.caption(effect.winner === 'shadow'
      ? `结果到来（${effect.prediction.outcome ? '发生了' : '没发生'}）：影子更近。晶体没动，倒影变了一点`
      : `结果到来（${effect.prediction.outcome ? '发生了' : '没发生'}）：本体更近。晶体没动，倒影模糊了一点`);
  }

  async inheritSequence(change) {
    const { view, effect } = change;
    if (this.depthTarget > 0) { this.setDepth(0); await this.animator.wait(1.0); }
    this.busy = true;
    const h = this.hoverY;
    this.column.place(h, Math.max(0.5, this.ext.max * WS * 0.95), 0, 0.05);
    this.caption('迭代时刻：倒影经得起检验');
    // 它转过来，把要长新一层的那一面对着你
    const grownCat = (this.latest ?? view).layers.at(-1)?.category;
    const az = (this.latest ?? view).cats.get(grownCat)?.az;
    if (az != null) this.turnTo(az, 2.2);
    await this.animator.run(0.9, (t) => { this.water.shimmer = t * 0.9; this.glowTargets.shadow = t; });
    await this.animator.run(1.1, (t) => { this.column.rise = t; this.column.amt = t; }, { easing: ease.outCubic });
    const own = this.proxyMat.userData.own;
    const next = this.latest ?? view;
    const newCat = next.layers[next.layers.length - 1]?.category;
    own.uGrowColor.value.set(tone(next.cats.get(newCat)?.color ?? '#FFFFFF'));
    // setView 之后，新一层的颜色按它的分量慢慢铺开（光谱的分量有过渡）
    this.setView(next, { transition: 'grow' });
    this.spec.body.boost += 1.0;
    this.spec.body.flow += 3;
    await this.animator.run(1.9, (t) => { own.uGrow.value = Math.sin(Math.PI * t) * 0.3; });
    own.uGrow.value = 0;
    this.haptic(24);
    await this.animator.run(1.3, (t) => {
      this.column.amt = 1 - t;
      this.water.shimmer = (1 - t) * 0.9;
      this.glowTargets.shadow = 0;
    });
    this.column.rise = 0;
    this.busy = false;
    const g = effect.generation;
    this.caption(`第 ${g.gen} 代长成。它学会了：${g.learned ?? ''}上一代退到了里面，成为一圈年轮。`);
  }

  continueSequence(effect) {
    this.animator.run(1.6, (t) => { this.shadowDip = -Math.sin(Math.PI * t) * 0.14; });
    this.spec.shadow.flow += 1.5;
    this.caption(effect.reason === 'count'
      ? `还差 ${effect.need} 次比较。倒影继续留在水里练；晶体不变`
      : '倒影还没有比本体更准，继续留在水里练；晶体不变');
  }

  // 水滴悬在晶体与倒影之间：落下时正好落在倒影上——结果改变的是影子，不是本体。
  syncDroplets() {
    const R = this.ext.max * WS;
    const h = this.hoverTarget;
    const cam = new THREE.Vector3(), tgt = new THREE.Vector3();
    const keep = this.depth;
    this.depth = 0;
    this.frame(cam, tgt);
    this.depth = keep;
    const zw = (cam.z * h) / (cam.y + h); // 镜头看到倒影中心的那一点水面
    const zd = zw * 0.62;
    const bottomY = h - this.ext.bottom * WS;
    const yLine = cam.y + (bottomY - cam.y) * ((cam.z - zd) / cam.z);
    const yTop = Math.max(0.3, yLine - 0.1);
    this.droplets.setLayout({ x: R * 0.22 + 0.08, z: zd, yTop, yBottom: 0.14, size: 0.06 + 0.015 * Math.min(1, R) });
    this.droplets.sync(this.view.pending.map((p) => ({ ...p, color: LOOK.droplet })), this.reduce);
  }

  // ───────────────────────── 画面 ─────────────────────────

  buildOverlay() {
    const o = document.createElement('div');
    o.className = 'dbb-overlay';
    o.setAttribute('aria-hidden', 'true');
    this.overlay = o;
    this.host.appendChild(o);
    this.dirEls = new Map();
    this.probBody = mk('div', 'dbb-prob dbb-prob-body', o);
    this.probShadow = mk('div', 'dbb-prob dbb-prob-shadow', o);
    this.countEl = mk('div', 'dbb-count', o);
    this.cap = mk('div', 'dbb-caption', this.host);
    this.cap.setAttribute('aria-live', 'polite');
  }

  updateProbLabels() {
    const p = this.view?.pending?.[0];
    this.probBody.hidden = this.probShadow.hidden = !p || !this.opts.labels;
    if (p) {
      this.probBody.innerHTML = `<b>本体</b>${pct(p.pBody)}`;
      this.probShadow.innerHTML = `<b>影子</b>${pct(p.pShadow)}<small>演示估计，不是准确率</small>`;
      this.glowTargets.body = Math.max(this.glowTargets.body, p.pBody * 0.55);
      this.glowTargets.shadow = Math.max(this.glowTargets.shadow, p.pShadow * 0.55);
    }
    // 方向标签
    for (const el of this.dirEls.values()) el.remove();
    this.dirEls.clear();
    if (this.view && this.opts.labels) {
      for (const c of this.view.categories) {
        const el = mk('div', 'dbb-dir', this.overlay);
        el.innerHTML = `<i style="background:${tone(c.color)}"></i>${c.label}`;
        this.dirEls.set(c.id, el);
      }
    }
  }

  caption(text, ms = 5200) {
    if (!this.opts.captions) { this.emit('caption', { text }); return; }
    this.cap.textContent = text;
    this.cap.classList.toggle('on', !!text);
    clearTimeout(this.capTimer);
    if (text) this.capTimer = setTimeout(() => this.cap.classList.remove('on'), ms);
    this.emit('caption', { text });
  }

  updateAria() {
    if (!this.view) return;
    const v = this.view, s = v.shadow;
    const shadow = s.mode === 'mirror' ? '倒影和它一模一样' : `倒影正在练习，${s.n}/${v.policy.minComparisons} 次`;
    const depth = this.depthTarget === 0 ? '外形' : this.depthTarget === 1 ? '剖开' : `剥到第 ${this.N - this.depthTarget + 1} 代`;
    this.host.setAttribute('aria-label', `derbeebee 的晶体：${v.layers.length} 代，${shadow}，当前视角：${depth}。拖动转动，双指或 + − 键挖深，轻点选中。`);
  }

  // 数据颜色怎么显示（见 core/tone.js）：落进光谱的色调；核用晶体的底色
  mapColor(hex, isCore, L = null) {
    if (isCore) return LOOK.pearl;
    return L ? layerTone(L) : tone(hex);
  }

  // 光柱：从水里升起的，是正在长成的那一类事的颜色（提亮一些，一道柔和的光）
  applyColumnColor() {
    const v = this.view;
    const L = v?.layers[v.layers.length - 1];
    const c = v?.cats.get(v.shadow.category ?? L?.category)?.color;
    this.column.mat.uniforms.uColor.value.set(c ? mixHex(tone(c), '#FFFFFF', 0.35) : '#F4FFFA');
  }

  applyTheme() {
    const pal = readPalette(this.host);
    this.pal = pal;
    const old = this.envRT;
    this.envRT = buildEnvironment(this.renderer, pal);
    this.scene.environment = this.envRT.texture;
    old?.dispose();
    const wu = this.water.material.uniforms;
    wu.uSky.value.set(pal.bg);
    wu.uSkyHi.value.set(pal.skyHi);
    wu.uTint.value.set(pal.waterTint);
    this.capMat.uniforms.uBg.value.set(pal.bg);
    this.capMat.uniforms.uCoreGlow.value.set(pal.coreGlow);
    this.renderer.toneMappingExposure = pal.exposure;
    this.outlineMat.color.set(pal.sub);
    // 光谱：两极的颜色；倒影里的主光也按镜像，倒影才像同一个东西的倒影
    const sp = LOOK.spec;
    for (const [u, mirror] of [[this.shared, false], [this.sShared, true]]) {
      u.uSpecDark.value = pal.dark ? 1 : 0;
      u.uSpecTop.value.set(...oklabOf(sp.top));
      u.uSpecBottom.value.set(...oklabOf(sp.bottom));
      // 倒影在着色器里把世界坐标的 y 翻回来（uMirrorY），摄影棚还是同一个
      u.uMirrorY.value = mirror ? -1 : 1;
      const gl = LOOK.glass;
      const mode = pal.dark ? 'dark' : 'light';
      u.uGlaze.value = gl ? gl.glaze : 0;
      if (gl?.facet) u.uFacetK.value.set(...gl.facet);
      u.uLit.value = gl?.lit ?? 0;
      u.uIri.value = gl?.iri ?? 0;
      u.uGloss.value = gl?.gloss ?? 0;
      if (gl?.trans) u.uTrans.value.set(...gl.trans);
      if (gl?.sheen) u.uSheen.value.set(...gl.sheen);
      u.uView.value = gl?.view ?? 1;
      u.uRim.value = gl?.rim ?? 0;
      u.uClear.value = gl?.clear ?? 1;
      u.uChromaGain.value = gl?.chroma?.[0] ?? 1;
      u.uChromaCap.value = gl?.chroma?.[1] ?? 0.16;
      u.uDeep.value = gl?.deep?.[pal.dark ? 1 : 0] ?? 0;
      const studio = gl?.studio?.[mode];
      if (studio) {
        u.uStudioSky.value.setRGB(...studio.sky);
        u.uStudioFloor.value.setRGB(...studio.floor);
        u.uStudioKey.value.setRGB(...studio.key);
      }
    }
    this.applyColumnColor();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.w = w; this.h = h;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 640 ? 1.75 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const rw = Math.max(2, Math.round((w * dpr) / 2)), rh = Math.max(2, Math.round((h * dpr) / 2));
    this.rt.setSize(rw, rh);
    this.water.material.uniforms.uTexel.value.set(1 / rw, 1 / rh);
    this.water.material.uniforms.uAspect.value = w / h;
  }

  // 镜头取景：外形时平视，看见晶体和它的倒影；剖开时俯视剖面
  frame(outPos, outTarget) {
    const aspect = this.w / this.h;
    const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const D = this.depth;
    const open = smooth(clamp(D, 0, 1));
    const Rw = this.ext.max * WS;
    const hy = this.hoverY;
    // 外形
    const top = hy + this.ext.top * WS + 0.28;
    const bottom = -(hy + this.ext.top * WS) * 0.62; // 倒影只取上半截：晶体大一点，水面、水滴和倒影都还在
    let H = Math.max(4.4, top - bottom);
    const cy = (top + bottom) / 2 - Math.max(0, 4.4 - (top - bottom)) * 0.12;
    const dH = H / 2 / tanH;
    const dW = (Rw * 2.7 + 0.8) / 2 / (tanH * aspect);
    const d0 = Math.max(dH, dW) * 1.03;
    const e0 = 0.085;
    const p0 = new THREE.Vector3(0, cy + Math.sin(e0) * d0, Math.cos(e0) * d0);
    const t0 = new THREE.Vector3(0, cy, 0);
    // 剖开
    const peel = clamp(D - 1, 0, this.N - 1);
    const kTop = this.N - 1 - peel;
    const kf = Math.floor(kTop), fr = kTop - kf;
    const Rrem = ((this.layerMax[kf] ?? this.ext.max) * (1 - fr) + (this.layerMax[Math.min(this.N - 1, kf + 1)] ?? this.ext.max) * fr) * WS;
    const R1 = Math.max(Rrem, 0.36);
    const Rfull = Math.max(this.ext.max * WS, 0.36);
    const e1 = this.digElev;
    const H1 = R1 * 2.3 + Rfull * 2.2;
    const d1 = Math.max(H1 / 2 / tanH, (Math.max(R1 * 3.2, Rfull * 2.6)) / 2 / (tanH * aspect));
    const t1 = new THREE.Vector3(0, hy + Rfull * 0.62, -Rfull * 0.55);
    const p1 = new THREE.Vector3(0, t1.y + Math.sin(e1) * d1, t1.z + Math.cos(e1) * d1);
    outPos.copy(p0).lerp(p1, open);
    outTarget.copy(t0).lerp(t1, open);
    if (this.focus && D > 0.5) {
      const d2 = Math.max(1.9, R1 * 2.0);
      const ft = this.focus.clone();
      const dir = new THREE.Vector3(0, Math.sin(e1), Math.cos(e1));
      outTarget.copy(ft);
      outPos.copy(ft).addScaledVector(dir, d2);
    }
  }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.w, y: ((1 - p.y) / 2) * this.h, visible: p.z < 1 && p.z > -1 };
  }

  getAnchor(name) {
    return this.anchors.get(name);
  }

  updateAnchors() {
    const R = this.ext.max * WS;
    const c = this.anchor.position;
    const set = (name, v) => this.anchors.set(name, this.project(v));
    set('pearl.center', c.clone());
    set('pearl.top', c.clone().add(new THREE.Vector3(0, this.ext.top * WS, 0)));
    set('pearl.side', c.clone().add(new THREE.Vector3(R * 0.78, R * 0.42, 0)));
    set('pearl.left', c.clone().add(new THREE.Vector3(-R * 0.8, R * 0.2, 0)));
    const sc = new THREE.Vector3(0, -c.y, 0);
    set('shadow.center', sc.clone());
    set('shadow.side', sc.clone().add(new THREE.Vector3(R * 0.78, -R * 0.25, 0)));
    set('shadow.left', sc.clone().add(new THREE.Vector3(-R * 0.8, -R * 0.1, 0)));
    set('water', new THREE.Vector3(-R * 1.25, 0, 0.9));
    set('water.right', new THREE.Vector3(R * 1.35, 0, 0.9));
    const dp = this.view?.pending?.[0] ? this.droplets.positionOf(this.view.pending[0].id) : null;
    if (dp) set('droplet', dp); else this.anchors.delete('droplet');
    if (this.asm && this.depth > 0.3) {
      set('section', this.asm.bowl.localToWorld(new THREE.Vector3(0, 0, 0)));
      for (const cat of this.view.categories) {
        const info = this.view.cats.get(cat.id);
        const [x, , z] = info.dir;
        const r = radiusAt(this.F, this.N - 1, x, 0, z) + 0.26;
        set(`dir.${cat.id}`, this.asm.bowl.localToWorld(new THREE.Vector3(x * r, 0, z * r)));
      }
      if (this.countK != null) {
        const p = this.sectionPoint(this.countK);
        if (p) set('count', p);
      }
    } else {
      for (const cat of this.view?.categories ?? []) this.anchors.delete(`dir.${cat.id}`);
      this.anchors.delete('section');
      if (this.countK != null) set('count', c.clone().add(new THREE.Vector3(0, this.ext.top * WS + 0.25, 0)));
    }
  }

  placeOverlay() {
    const put = (el, a, show = true) => {
      if (!a || !show || !a.visible) { el.style.opacity = '0'; return; }
      el.style.opacity = '1';
      el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`;
    };
    const open = clamp(this.depth, 0, 1);
    for (const [id, el] of this.dirEls) {
      const a = this.anchors.get(`dir.${id}`);
      put(el, a, open > 0.6);
    }
    const p = this.view?.pending?.[0];
    put(this.probBody, this.anchors.get('pearl.side'), !!p && open < 0.1);
    put(this.probShadow, this.anchors.get('shadow.side'), !!p && open < 0.1);
    const ca = this.anchors.get('count');
    if (this.countK != null && ca) {
      this.countEl.textContent = `${this.countK + 1}`;
      put(this.countEl, ca, true);
    } else this.countEl.style.opacity = '0';
  }

  // ───────────────────────── 每一帧 ─────────────────────────

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible || !this.view || document.hidden) return;
    this.update(dt);
    this.render();
    this.updateAnchors();
    this.placeOverlay();
    this.emit('frame', null);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.animator.tick(dt);
    const idle = (performance.now() - this.lastActive) / 1000;
    this.doze = damp(this.doze, idle > 25 ? 1 : 0, 0.6, dt);

    // 深度
    const Dt = this.depthTarget;
    this.depth = this.reduce ? Dt : damp(this.depth, Dt, 3.6, dt);
    if (Math.abs(this.depth - Dt) < 1e-3) this.depth = Dt;
    const D = this.depth;
    const open = clamp(D, 0, 1);

    // 姿态：拖动 × 扶正 × 注视 × 由质心决定的静止倾角
    if (this.orientation.yawOnly && !this.orientation.dragging) {
      const lvl = this.orientation.levelNow();
      this.orientation.q.slerp(lvl, 1 - Math.exp(-6 * dt));
    }
    this.orientation.step(dt);
    this.tiltAmt = damp(this.tiltAmt, Dt > 0 ? 0 : 1, 3, dt);
    const gzOn = !this.dragging && Dt === 0 && !this.reduce;
    this.gaze.x = damp(this.gaze.x, gzOn ? this.gaze.tx : 0, 2.6, dt);
    this.gaze.y = damp(this.gaze.y, gzOn ? this.gaze.ty : 0, 2.6, dt);
    this.qGaze.setFromEuler(new THREE.Euler(this.gaze.y, this.gaze.x, 0, 'YXZ'));
    const qTilt = new THREE.Quaternion().slerpQuaternions(IDENT, this.restTilt, this.tiltAmt);
    this.qDisplay.copy(this.qGaze).multiply(this.orientation.q).multiply(qTilt);
    this.orient.quaternion.copy(this.qDisplay);

    // 呼吸：它在。不是数据，不改变结构。
    const period = 5.6 + 2.2 * this.doze;
    this.breathPhase += (dt * Math.PI * 2) / period;
    const breath = this.reduce ? 0 : Math.sin(this.breathPhase);
    const sp = this.spring;
    if (this.reduce) { sp.x = sp.target; sp.v = 0; }
    else for (let i = 0; i < 2; i++) { sp.v += (260 * (sp.target - sp.x) - 15 * sp.v) * (dt / 2); sp.x += sp.v * (dt / 2); }
    const s = WS * (1 + 0.0045 * breath * (1 - 0.4 * this.doze)) * sp.x;
    this.scaleG.scale.setScalar(s);
    this.hoverY = damp(this.hoverY, this.hoverTarget, 1.6, dt);
    const bob = this.reduce ? 0 : 0.012 * Math.sin(this.breathPhase + 0.6);
    this.anchor.position.set(0, this.hoverY + bob, 0);

    // 倒影：跟着本体转，但慢半拍——两者判断越一致，跟得越紧
    this.agreement = damp(this.agreement, this.targetAgreement ?? 1, 1.5, dt);
    this.clarity = damp(this.clarity, this.targetClarity ?? 1, 1.2, dt);
    const lam = 2.2 + 11 * this.agreement;
    this.qShadow.slerp(this.qDisplay, 1 - Math.exp(-lam * dt));
    this.sOrient.quaternion.copy(this.qShadow);
    this.sAnchor.position.set(0, this.hoverY + bob - this.shadowDip, 0);
    this.shiverT = (this.shiverT ?? 9) + dt;
    const shiver = this.reduce ? 0 : Math.sin(this.shiverT * 24) * Math.exp(-this.shiverT * 4.5) * 0.028;
    this.sScale.scale.set(s * (1 + shiver), s * (1 - shiver * 0.6), s * (1 + shiver));

    // 信心与数数都表现为颜色变浓（没有光晕，不往轮廓上加白光）：预判封存时本体和倒影各自浓一下
    this.flash = damp(this.flash ?? 0, 0, 1.4, dt);
    this.pulse = damp(this.pulse ?? 0, 0, 5, dt);
    this.glowBody = damp(this.glowBody, this.glowTargets.body, 2, dt);
    this.glowShadow = damp(this.glowShadow, this.glowTargets.shadow, 2, dt);
    const awake = 1 - 0.35 * this.doze;
    // 光谱：分量慢慢流到新的比例；颜色一直在缓缓流动（它在），事件时流得快一阵、浓一阵
    const B = this.spec.body, S = this.spec.shadow;
    for (const st of [B, S]) {
      for (let i = 0; i < 8; i++) st.w[i] = this.reduce ? st.wT[i] : damp(st.w[i], st.wT[i], 1.4, dt);
      st.mature = this.reduce ? st.matureT : damp(st.mature, st.matureT, 1.1, dt);
      st.flow = damp(st.flow, 0, 0.8, dt);
      st.boost = damp(st.boost, 0, 0.7, dt);
    }
    const speed = this.reduce ? 0 : 1 - 0.6 * this.doze;
    B.phase += dt * speed * (1 + B.flow);
    // 倒影的颜色跟着本体流；被结果搅动以后，按两者判断的一致程度，慢慢回到和本体一样
    S.phase += dt * speed * (1 + S.flow);
    S.phase += (B.phase - S.phase) * (1 - Math.exp(-(0.25 + 1.1 * this.agreement) * dt));
    // 主光跟着指针（或手指、手机的倾斜）慢慢移过去
    const P = this.pointer;
    P.x = damp(P.x, clamp(P.tx + this.tilt.x, -1, 1), 3, dt);
    P.y = damp(P.y, clamp(P.ty + this.tilt.y, -1, 1), 3, dt);
    this.shared.uPointer.value.set(P.x, P.y);
    this.sShared.uPointer.value.set(P.x, P.y);
    this.capMat.uniforms.uPointer.value.set(P.x, P.y);
    // 主光（世界坐标）跟着指针；倒影里 y 翻过来，在着色器的局部坐标里自然就对了
    this.shared.uGlowKey.value.set(-0.52 + 0.3 * P.x, 0.6 + 0.2 * P.y, 0.6).normalize();
    this.sShared.uGlowKey.value.set(-0.52 + 0.3 * P.x, -(0.6 + 0.2 * P.y), 0.6).normalize();
    const gB = this.glowBody * 0.45 + this.flash * this.glowTargets.body * 0.5 + this.pulse * 0.6;
    const gS = this.glowShadow * 0.55 + this.flash * this.glowTargets.shadow * 0.6;
    // 晶体也在呼吸（亮度 ±4%），事情发生时按浓度亮一点；打盹时暗一点
    const breathe = this.reduce ? 0 : 0.04 * Math.sin(this.breathPhase - 0.4);
    for (const [u, st, g] of [[this.shared, B, gB], [this.sShared, S, gS]]) {
      u.uCatW.value.set(st.w);
      u.uSpecMature.value = st.mature;
      u.uSpecTime.value = st.phase;
      u.uSpecBoost.value = Math.min(1.6, st.boost + g * awake);
      u.uLum.value = (1 + breathe + 0.06 * Math.min(1.2, u.uSpecBoost.value)) * (0.94 + 0.06 * awake);
    }
    this.shared.uWarmAmt.value = damp(this.shared.uWarmAmt.value, this.warmTarget ? 1 : 0, this.warmTarget ? 8 : 0.9, dt);

    // 剖开：盖子绕铰链向后翻，剥开的层化开
    this.proxy.visible = D <= 0.002 || !this.asm;
    if (this.asm) {
      this.asm.group.visible = D > 0.002;
      const o = ease.inOutCubic(open);
      this.asm.lidPivot.quaternion.setFromAxisAngle(this.hinge.axis, o * 1.9);
      this.asm.lidPivot.position.copy(this.hinge.point).addScaledVector(UP, o * 0.05);
      const dis = this.capMat.uniforms.uDis.value;
      for (const L of this.asm.layers) {
        const j = this.N - 1 - L.k;
        const p = L.k === 0 ? 0 : clamp(D - 1 - j, 0, 1);
        L.mat.userData.own.uDissolve.value = p;
        dis[L.k] = p;
        const gone = p >= 0.999;
        L.lower.visible = L.upper.visible = !gone;
        if (L.outline) {
          L.outline.visible = p > 0.05;
          L.outline.material.opacity = 0.85 * smooth(clamp((p - 0.2) / 0.8, 0, 1));
        }
      }
      if (D <= 0.002 && Dt === 0) this.disposeAssembly();
    }
    this.capMat.uniforms.uCamPos.value.copy(this.camera.position);

    // 水与倒影
    this.reflAmt = damp(this.reflAmt, 1 - 0.85 * open, 4, dt);
    const wu = this.water.material.uniforms;
    wu.uClarity.value = this.clarity;
    wu.uReflAmt.value = this.reflAmt;
    wu.uCam.value.copy(this.camera.position);
    const scNdc = new THREE.Vector3(0, -this.hoverY * 0.75, 0).project(this.camera);
    wu.uSheetC.value.set(scNdc.x, scNdc.y);
    const Rw = this.ext.max * WS;
    wu.uSheetR.value.set(1.0, 0.95).multiplyScalar(clamp(0.55 + Rw * 0.35, 0.6, 1.2));
    const own = this.shadowMat.userData.own;
    // 靠近水面的部分最实，越往下越淡
    own.uFadeTop.value = -(this.hoverY - this.ext.bottom * WS) + 0.05;
    own.uFadeBottom.value = -(this.hoverY + this.ext.top * WS) * 1.35;
    own.uAlpha.value = 0.92;
    this.droplets.update(dt, t, this.reduce);
    this.water.update(dt, t);
    this.column.update(dt, t);

    // 镜头
    const fp = new THREE.Vector3(), ft = new THREE.Vector3();
    this.frame(fp, ft);
    const lamCam = this.reduce ? 30 : 3.2;
    dampVec3(this.camPos, fp, lamCam, dt);
    dampVec3(this.camTarget, ft, lamCam, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  // 测试用：按固定步长推进模拟（截图时不受帧率影响）
  async advance(seconds, step = 1 / 30) {
    for (let t = 0, i = 0; t < seconds; t += step, i++) {
      this.update(step);
      await Promise.resolve();
    }
    this.render();
    this.updateAnchors();
    this.placeOverlay();
  }

  render() {
    const r = this.renderer;
    this.camera.layers.set(1);
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    if (this.reflAmt > 0.01) r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    this.camera.layers.set(0);
    r.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('deviceorientation', this.onTilt);
    this.input.dispose();
    this.ro.disconnect();
    this.io.disconnect();
    this.unwatchTheme();
    this.disposeAssembly();
    this.renderer.dispose();
    this.rt.dispose();
    this.envRT?.dispose();
    this.canvas.remove();
    this.overlay.remove();
    this.cap.remove();
  }
}

function mk(tag, cls, parent) {
  const el = document.createElement(tag);
  el.className = cls;
  parent.appendChild(el);
  return el;
}

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

function fmtShort(L) {
  if (!L || L.core) return '诞生';
  return `${L.source ?? ''}`;
}
