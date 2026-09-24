// 材质：珍珠母（本体与倒影）、剖面、水面、水滴、光柱。
import * as THREE from 'three';

export const MAX_LAYERS = 24;
export const MAX_LAMELLAE = 64;
export const MAX_RIPPLES = 8;

// 3D simplex noise（Ashima Arts / Stefan Gustavson，MIT）
export const NOISE_GLSL = /* glsl */ `
vec3 dbb_mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 dbb_mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 dbb_permute(vec4 x){ return dbb_mod289(((x * 34.0) + 10.0) * x); }
vec4 dbb_taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float dbb_snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = dbb_mod289(i);
  vec4 p = dbb_permute(dbb_permute(dbb_permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = dbb_taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// three r186 的 morphcolor_vertex 把 vec3 加到 vec4 的 vColor 上，编译失败；这里换成修正版。
const MORPHCOLOR_FIX = /* glsl */ `
#if defined( USE_MORPHCOLORS )
  vColor *= morphTargetBaseInfluence;
  for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
    #if defined( USE_COLOR_ALPHA )
      if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
    #elif defined( USE_COLOR )
      if ( morphTargetInfluences[ i ] != 0.0 ) vColor.rgb += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
    #endif
  }
#endif
`;

// 本体共享的效果参数：微光、触摸的余温、倾听时的流光、新层的生长光
export function nacreShared() {
  return {
    uGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color('#ffffff') },
    uWarmPos: { value: new THREE.Vector3(0, 0, 50) },
    uWarmAmt: { value: 0 },
    uSweepY: { value: -3 },
    uSweepAmt: { value: 0 },
    uBaseGlow: { value: 0 },
    uSwirlSeed: { value: 0 },
    uPulse: { value: 0 },
    // 极光：沿轮廓流动的彩色辉光。强度与颜色由色彩方向和事件决定
    uAurora: { value: 0 },
    uAurCols: { value: ['#3FA9FF', '#8D5BFF', '#FF5EB8', '#FF9F43'].map((c) => new THREE.Color(c)) },
    uAurTime: { value: 0 },
  };
}

// 四个颜色首尾相接的循环渐变（极光的颜色带）
export const AURORA_GLSL = /* glsl */ `
uniform vec3 uAurCols[4];
vec3 dbbAurora(float f) {
  f = fract(f) * 4.0;
  float i = floor(f);
  float t = smoothstep(0.0, 1.0, fract(f));
  vec3 a = i < 1.0 ? uAurCols[0] : i < 2.0 ? uAurCols[1] : i < 3.0 ? uAurCols[2] : uAurCols[3];
  vec3 b = i < 1.0 ? uAurCols[1] : i < 2.0 ? uAurCols[2] : i < 3.0 ? uAurCols[3] : uAurCols[0];
  return mix(a, b, t);
}
`;

// 珍珠母：物理材质 + 虹彩厚度随表面缓慢起伏（每颗的纹路都不一样）
export function createNacre({
  shared,
  roughness = 0.26,
  metalness = 0.12,
  iridescence = 1,
  irRange = [220, 620],
  clearcoat = 1,
  sheen = 0.6,
  sheenColor = '#E3D6F6',
  envMapIntensity = 0.95,
  dissolve = false,
  fade = false,
  tint = false,
} = {}) {
  const own = {
    uDissolve: { value: 0 },
    uDisR: { value: 1.5 },
    uEdgeColor: { value: new THREE.Color('#fff3da') },
    uFadeTop: { value: -0.1 },
    uFadeBottom: { value: -3 },
    uAlpha: { value: 1 },
    uTint: { value: new THREE.Color('#bfe9da') },
    uTintAmt: { value: 0 },
    uGrow: { value: 0 },
    uGrowColor: { value: new THREE.Color('#bff0dc') },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness: 0.1,
    iridescence,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: irRange,
    sheen,
    sheenColor: new THREE.Color(sheenColor),
    sheenRoughness: 0.42,
    envMapIntensity,
    transparent: fade,
  });
  m.userData.own = own;
  m.userData.shared = shared;
  const defs = [dissolve ? '#define DBB_DISSOLVE' : '', fade ? '#define DBB_FADE' : '', tint ? '#define DBB_TINT' : ''].join('\n');
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <morphcolor_vertex>', MORPHCOLOR_FIX)
      .replace('#include <common>', '#include <common>\nvarying vec3 vDbbLocal;\nvarying vec3 vDbbWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDbbLocal = transformed;\nvDbbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${defs}
varying vec3 vDbbLocal;
varying vec3 vDbbWorld;
uniform float uGlow; uniform vec3 uGlowColor; uniform vec3 uWarmPos; uniform float uWarmAmt;
uniform float uSweepY; uniform float uSweepAmt; uniform float uBaseGlow; uniform float uSwirlSeed; uniform float uPulse;
uniform float uDissolve; uniform float uDisR; uniform vec3 uEdgeColor; uniform float uFadeTop; uniform float uFadeBottom; uniform float uAlpha;
uniform vec3 uTint; uniform float uTintAmt; uniform float uGrow; uniform vec3 uGrowColor;
uniform float uAurora; uniform float uAurTime;
${NOISE_GLSL}
${AURORA_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
float dbbEdge = 0.0;
vec3 dbbAurCol = vec3(0.0);
float dbbAurAmt = 0.0;
#ifdef DBB_DISSOLVE
  if (uDissolve > 0.0) {
    // 从剖面那道边开始化开，像把一层轻轻揭下来
    float nz = dbb_snoise(vDbbLocal * 11.0) * 0.5 + 0.5;
    float dn = clamp(0.74 * abs(vDbbLocal.y) / uDisR + 0.26 * nz, 0.0, 1.0);
    float thr = uDissolve * 1.08 - 0.04;
    if (dn < thr) discard;
    dbbEdge = 1.0 - smoothstep(0.0, 0.045, dn - thr);
  }
#endif`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
#ifdef DBB_TINT
  diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintAmt);
#endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 nV = normalize(normal);
  vec3 vV = normalize(vViewPosition);
  float rim = pow(1.0 - clamp(dot(nV, vV), 0.0, 1.0), 2.4);
  totalEmissiveRadiance += uGlowColor * (uGlow * (0.22 + 0.78 * rim) + uBaseGlow * (0.4 + rim));
  float dw = distance(vDbbLocal, uWarmPos);
  totalEmissiveRadiance += vec3(1.0, 0.78, 0.62) * uWarmAmt * exp(-dw * dw / 0.1) * 0.5;
  float band = exp(-pow((vDbbLocal.y - uSweepY) / 0.16, 2.0));
  totalEmissiveRadiance += vec3(0.93, 0.91, 1.0) * uSweepAmt * band * (0.25 + 0.75 * rim) * 0.55;
  totalEmissiveRadiance += uGlowColor * uPulse * (0.35 + 0.65 * rim) * 0.5;
  totalEmissiveRadiance += uGrowColor * uGrow * (0.45 + 0.55 * rim);
  totalEmissiveRadiance += uEdgeColor * dbbEdge * 2.2;
  if (uAurora > 0.001) {
    // 沿轮廓流动：角度决定颜色，缓慢转动，再加一点噪声让它像光幕而不是色环
    float ang = atan(nV.y, nV.x) / 6.28318;
    float flow = ang + uAurTime * 0.05 + dbb_snoise(vec3(vDbbLocal.xy * 1.3, uAurTime * 0.12)) * 0.16;
    dbbAurCol = dbbAurora(flow);
    float band = pow(rim, 1.3);
    totalEmissiveRadiance += dbbAurCol * uAurora * (band * 1.7 + 0.1);
    // 浅色背景上光是加不出来的：同时把轮廓染上极光的颜色
    dbbAurAmt = clamp(uAurora * band * 1.1, 0.0, 0.8);
  }
}`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_IRIDESCENCE
  {
    float sw = dbb_snoise(vDbbLocal * 1.35 + vec3(uSwirlSeed, 0.0, -uSwirlSeed)) * 0.5 + 0.5;
    float sw2 = dbb_snoise(vDbbLocal * 3.1 + 17.0) * 0.5 + 0.5;
    material.iridescenceThickness = mix(iridescenceThicknessMinimum, iridescenceThicknessMaximum, clamp(sw * 0.8 + sw2 * 0.2, 0.0, 1.0));
  }
#endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#ifdef DBB_FADE
  diffuseColor.a *= uAlpha * smoothstep(uFadeBottom, uFadeTop, vDbbWorld.y);
#endif
outgoingLight = mix(outgoingLight, dbbAurCol * 1.05, dbbAurAmt);
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `dbb-nacre-${dissolve ? 'd' : ''}${fade ? 'f' : ''}${tint ? 't' : ''}`;
  return m;
}

// 剖面：每一层一种颜色；层里的细纹一条是一次比较，意外越大纹越深；层与层之间一道细白线。
const CAP_VS = /* glsl */ `
attribute float aLayer;
attribute float aS;
varying float vLayer;
varying float vS;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vLocal;
void main() {
  vLayer = aLayer;
  vS = aS;
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorldPos = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CAP_FS = /* glsl */ `
#define MAXL ${MAX_LAYERS}
uniform vec3 uColors[MAXL];
uniform float uCounts[MAXL];
uniform float uDis[MAXL];
uniform float uLit[MAXL];
uniform float uSel;
uniform float uLam;
uniform sampler2D uLamTex;
uniform vec2 uLamSize;
uniform vec3 uCamPos;
uniform vec3 uKey;
uniform vec3 uBg;
uniform vec3 uCoreGlow;
uniform float uTime;
uniform float uDiffMin;
varying float vLayer;
varying float vS;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  int k = int(vLayer + 0.5);
  float dis = uDis[k];
  float edge = 0.0;
  if (dis > 0.0) {
    float dn = 0.26 * (dbb_snoise(vLocal * 11.0) * 0.5 + 0.5);
    float thr = dis * 1.08 - 0.04;
    if (dn < thr) discard;
    edge = 1.0 - smoothstep(0.0, 0.03, dn - thr);
  }
  vec3 base = uColors[k];
  float n = max(uCounts[k], 1.0);
  float x = vS * n;
  float fw = fwidth(x);
  float cell = min(floor(x), n - 1.0);
  vec4 lam = texture2D(uLamTex, vec2((cell + 0.5) / uLamSize.x, (vLayer + 0.5) / uLamSize.y));
  float surprise = lam.r;
  float resolveAmt = 1.0 - smoothstep(0.22, 0.75, fw);
  float d = fract(x);
  d = min(d, 1.0 - d);
  float line = 1.0 - smoothstep(0.0, fw * 1.4 + 0.015, d);
  if (k == 0) { line = 0.0; }
  float lineAmt = line * resolveAmt * mix(0.1, 0.42, surprise);
  float band = (mod(cell, 2.0) < 1.0 ? 0.018 : -0.018) * resolveAmt;
  vec3 col = base * (1.0 + band);
  col = mix(col, col * 0.7, lineAmt);
  if (k == 0) {
    float r = vS;
    col = mix(uCoreGlow, base, smoothstep(0.0, 0.95, r));
  }
  // 抛光的切面：漫反射 + 一道斜向的光带
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(uCamPos - vWorldPos);
  float diff = uDiffMin + (1.0 - uDiffMin) * max(dot(N, uKey), 0.0);
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, uKey), 0.0), 24.0) * 0.28;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.12;
  col = col * diff + vec3(spec + fres);
  // 层与层之间的细白线
  float fs = fwidth(vS);
  float sep = 1.0 - smoothstep(0.0, fs * 1.8, 1.0 - vS);
  col = mix(col, vec3(1.0), sep * 0.8);
  // 选中与数一数
  float hasSel = step(-0.5, uSel);
  float me = 1.0 - step(0.5, abs(vLayer - uSel));
  col = mix(col, mix(col, uBg, 0.5), hasSel * (1.0 - me));
  col += vec3(0.05) * me * hasSel;
  float lamMe = me * hasSel * step(-0.5, uLam) * (1.0 - step(0.5, abs(cell - uLam)));
  col = mix(col, vec3(1.0, 0.97, 0.88), lamMe * 0.5);
  col += vec3(1.0, 0.96, 0.9) * uLit[k] * 0.22;
  col += vec3(1.0, 0.95, 0.85) * edge * 1.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createCapMaterial(side = THREE.FrontSide) {
  const colors = Array.from({ length: MAX_LAYERS }, () => new THREE.Color('#ffffff'));
  const lamData = new Uint8Array(MAX_LAMELLAE * MAX_LAYERS * 4);
  const lamTex = new THREE.DataTexture(lamData, MAX_LAMELLAE, MAX_LAYERS, THREE.RGBAFormat);
  lamTex.magFilter = THREE.NearestFilter;
  lamTex.minFilter = THREE.NearestFilter;
  lamTex.needsUpdate = true;
  const m = new THREE.ShaderMaterial({
    side,
    uniforms: {
      uColors: { value: colors },
      uCounts: { value: new Float32Array(MAX_LAYERS) },
      uDis: { value: new Float32Array(MAX_LAYERS) },
      uLit: { value: new Float32Array(MAX_LAYERS) },
      uSel: { value: -1 },
      uLam: { value: -1 },
      uLamTex: { value: lamTex },
      uLamSize: { value: new THREE.Vector2(MAX_LAMELLAE, MAX_LAYERS) },
      uCamPos: { value: new THREE.Vector3() },
      uKey: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() },
      uBg: { value: new THREE.Color('#F3EDF7') },
      uCoreGlow: { value: new THREE.Color('#ffffff') },
      uTime: { value: 0 },
      uDiffMin: { value: 0.8 },
    },
    vertexShader: CAP_VS,
    fragmentShader: CAP_FS,
  });
  m.userData.lamData = lamData;
  m.userData.lamTex = lamTex;
  return m;
}

// 水面：平静如镜。只有结果到来时才起涟漪；手指碰到只有一点水光。
const WATER_VS = /* glsl */ `
varying vec3 vWorld;
varying vec4 vClip;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vClip = projectionMatrix * viewMatrix * w;
  gl_Position = vClip;
}`;

const WATER_FS = /* glsl */ `
#define MAXR ${MAX_RIPPLES}
uniform sampler2D uRefl;
uniform vec2 uTexel;
uniform float uTime;
uniform vec4 uRip[MAXR];
uniform vec3 uRipCol[MAXR];
uniform vec3 uGlint;
uniform float uClarity;
uniform float uReflAmt;
uniform vec3 uSky;
uniform vec3 uSkyHi;
uniform vec3 uTint;
uniform vec3 uCam;
uniform vec3 uKey;
uniform vec2 uSheetC;
uniform vec2 uSheetR;
uniform float uAspect;
uniform float uShimmer;
uniform vec3 uShimmerCol;
uniform vec2 uCenter;
varying vec3 vWorld;
varying vec4 vClip;

vec4 blurRefl(vec2 uv, vec2 r) {
  vec4 acc = texture2D(uRefl, uv) * 0.16;
  acc += texture2D(uRefl, uv + r * vec2( 0.98,  0.18)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2(-0.62,  0.77)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2(-0.55, -0.83)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2( 0.37, -0.93)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2( 0.12,  0.99)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2(-0.97, -0.21)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2( 0.49,  0.42)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2(-0.41,  0.09)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2( 0.05, -0.47)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2( 0.71, -0.52)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2(-0.74, -0.47)) * 0.07;
  acc += texture2D(uRefl, uv + r * vec2( 0.31,  0.71)) * 0.07;
  return acc;
}

void main() {
  vec2 p = vWorld.xz;
  vec2 grad = vec2(0.0);
  float crest = 0.0;
  vec3 ripTint = vec3(0.0);
  for (int i = 0; i < MAXR; i++) {
    vec4 r = uRip[i];
    if (r.w <= 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0) continue;
    vec2 dd = p - r.xy;
    float dist = length(dd) + 1e-4;
    float front = age * 0.78;
    float x = dist - front;
    float env = exp(-x * x / 0.12) * exp(-age * 0.34) * smoothstep(0.0, 0.12, age) * r.w;
    float k = 24.0;
    float s = sin(x * k);
    float c = cos(x * k);
    grad += (env * k * c) * (dd / dist);
    crest += env * max(s, 0.0);
    ripTint += uRipCol[i] * env * max(s, 0.0);
  }
  vec2 gd = p - uGlint.xy;
  float gAmt = uGlint.z * exp(-dot(gd, gd) / 0.03);
  grad += gd * gAmt * 5.0;

  vec3 n = normalize(vec3(-grad.x * 0.02, 1.0, -grad.y * 0.02));
  vec3 V = normalize(uCam - vWorld);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);

  vec2 ndc = vClip.xy / vClip.w;
  vec2 suv = ndc * 0.5 + 0.5;
  vec2 duv = suv + n.xz * 0.08;
  vec2 blurR = (mix(0.0, 9.0, 1.0 - uClarity) + 0.8) * uTexel;
  vec4 refl = blurRefl(duv, blurR);

  vec2 q = (ndc - uSheetC) * vec2(uAspect, 1.0) / uSheetR;
  float sheet = 1.0 - smoothstep(0.35, 1.0, length(q));

  vec3 base = mix(uSky, uTint, 0.8);
  float baseA = 0.24 * sheet;
  float k2 = uReflAmt * mix(0.55, 1.0, sheet);
  vec3 col = base * baseA * (1.0 - refl.a * k2) + refl.rgb * k2;
  float a = baseA + refl.a * k2 * (1.0 - baseA);

  col += uSkyHi * fres * 0.28 * sheet;
  vec3 H = normalize(uKey + V);
  float spec = pow(max(dot(n, H), 0.0), 160.0) * 1.3 * clamp(crest * 4.0 + gAmt * 2.5, 0.0, 1.0);
  col += vec3(spec) * max(sheet, 0.3);
  col += ripTint * 0.4;
  a = clamp(a + spec * 0.6 + crest * 0.3, 0.0, 1.0);
  vec2 cd = p - uCenter;
  float sh = uShimmer * exp(-dot(cd, cd) / 0.4);
  col += uShimmerCol * sh;
  a = clamp(a + sh * 0.5, 0.0, 1.0);
  col += vec3(1.0, 0.98, 0.95) * gAmt * 0.35;
  a = clamp(a + gAmt * 0.2, 0.0, 1.0);

  gl_FragColor = vec4(col / max(a, 1e-4), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <premultiplied_alpha_fragment>
}`;

export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    uniforms: {
      uRefl: { value: null },
      uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      uTime: { value: 0 },
      uRip: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uRipCol: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Color('#ffffff')) },
      uGlint: { value: new THREE.Vector3(0, 0, 0) },
      uClarity: { value: 1 },
      uReflAmt: { value: 1 },
      uSky: { value: new THREE.Color('#F3EDF7') },
      uSkyHi: { value: new THREE.Color('#FFFFFF') },
      uTint: { value: new THREE.Color('#EEE7F5') },
      uCam: { value: new THREE.Vector3() },
      uKey: { value: new THREE.Vector3(-0.4, 0.85, 0.35).normalize() },
      uSheetC: { value: new THREE.Vector2(0, -0.4) },
      uSheetR: { value: new THREE.Vector2(0.9, 0.7) },
      uAspect: { value: 1 },
      uShimmer: { value: 0 },
      uShimmerCol: { value: new THREE.Color('#dff7ee') },
      uCenter: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: WATER_VS,
    fragmentShader: WATER_FS,
  });
}

// 光柱：继承时，一道光从水里升起，接到珍珠身上。浅色背景上用柔和的半透明光，而不是叠加发光。
const COLUMN_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const COLUMN_FS = /* glsl */ `
uniform float uAmt;
uniform float uTime;
uniform float uRise;
uniform vec3 uColor;
uniform float uAurMix;
varying vec2 vUv;
${NOISE_GLSL}
${AURORA_GLSL}
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float core = exp(-x * x / 0.08);
  float halo = exp(-x * x / 0.45) * 0.45;
  float head = 1.0 - smoothstep(uRise - 0.1, uRise + 0.02, y);
  float ends = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.82, 1.0, y) * 0.6);
  float streak = 0.8 + 0.2 * dbb_snoise(vec3(x * 3.0, y * 4.0 - uTime * 1.4, uTime * 0.25));
  // 极光幕：竖直的光褶，颜色沿横向和高度缓慢流动
  float fold = 0.55 + 0.45 * dbb_snoise(vec3(x * 7.0, y * 1.2 - uTime * 0.5, uTime * 0.15));
  float curtain = exp(-x * x / 0.6) * fold;
  vec3 col = mix(uColor, dbbAurora(vUv.x * 0.7 + y * 0.35 + uTime * 0.06), uAurMix);
  float body = mix(core + halo, curtain + core * 0.5, uAurMix);
  float a = uAmt * body * head * ends * streak;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
  #include <colorspace_fragment>
}`;

export function createColumnMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uAmt: { value: 0 },
      uTime: { value: 0 },
      uRise: { value: 0 },
      uColor: { value: new THREE.Color('#F4FFFA') },
      uAurMix: { value: 0 },
      uAurCols: { value: ['#3FA9FF', '#8D5BFF', '#FF5EB8', '#FF9F43'].map((c) => new THREE.Color(c)) },
    },
    vertexShader: COLUMN_VS,
    fragmentShader: COLUMN_FS,
  });
}

// 升起的光点
const MOTE_VS = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uHeight;
uniform float uAmt;
uniform float uSize;
varying float vA;
void main() {
  float ph = fract(aSeed.w + uTime * (0.18 + aSeed.z * 0.22));
  vec3 p = vec3(aSeed.x, ph * uHeight, aSeed.y);
  p.x += sin(uTime * 1.3 + aSeed.w * 12.0) * 0.03;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + aSeed.z) / -mv.z;
  vA = uAmt * smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.75, 1.0, ph));
}`;

const MOTE_FS = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = vA * smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

export function createMoteMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: 1.5 },
      uAmt: { value: 0 },
      uSize: { value: 70 },
      uColor: { value: new THREE.Color('#ffffff') },
    },
    vertexShader: MOTE_VS,
    fragmentShader: MOTE_FS,
  });
}

// 水滴：大部分透明，边缘更实，高光不被透明度吃掉——像一滴真的水。
const DROP_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const DROP_FS = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uKey;
uniform float uAmt;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float f = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, uKey), 0.0), 80.0) * 1.2 + pow(max(dot(R, normalize(vec3(0.7, 0.35, 0.6))), 0.0), 30.0) * 0.35;
  vec3 col = mix(vec3(1.0), uTint, 0.28);
  col = mix(col, uTint * 0.72, smoothstep(0.3, 0.85, f) * 0.55);
  float a = 0.12 + 0.6 * f;
  col = mix(col, vec3(1.0), clamp(spec, 0.0, 1.0));
  a = clamp(a + spec, 0.0, 1.0) * uAmt;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export function createDropMaterial(tint) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTint: { value: new THREE.Color(tint) },
      uKey: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() },
      uAmt: { value: 1 },
    },
    vertexShader: DROP_VS,
    fragmentShader: DROP_FS,
  });
}

// 光晕：珍珠身后一圈流动的彩色辉光（Apple Intelligence 式色彩方向用）
const HALO_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const HALO_FS = /* glsl */ `
uniform float uAmt;
uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
${AURORA_GLSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x) / 6.28318;
  float wob = dbb_snoise(vec3(p * 1.6, uTime * 0.2)) * 0.06;
  float ring = exp(-pow((r - 0.62 - wob) / 0.2, 2.0));
  float inner = exp(-pow(r / 0.62, 2.0)) * 0.18;
  vec3 c = dbbAurora(ang + uTime * 0.05 + wob);
  float a = uAmt * (ring + inner) * (1.0 - smoothstep(0.86, 1.0, r));
  gl_FragColor = vec4(c * a, a);
  #include <colorspace_fragment>
}`;

export function createHaloMaterial(shared) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 }, uAurCols: shared.uAurCols },
    vertexShader: HALO_VS,
    fragmentShader: HALO_FS,
  });
}

// 柔光贴图（水滴的光晕、水面的光斑）
export function glowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
