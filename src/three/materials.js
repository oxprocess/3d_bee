// 材质：晶体（本体与倒影；另有珍珠母、The Expanse 两个色彩方向）、剖面、水面、水滴、光柱。
import * as THREE from 'three';

export const MAX_LAYERS = 24;
export const MAX_LAMELLAE = 64;
export const MAX_RIPPLES = 8;
export const MAX_SHELLS = 8; // 晶体里最多画 8 个幻影（最外面的 8 代）
export const MAX_FACES = 16; // 最多 16 个刻面（8 类事）

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

// 晶体每一代外壳的刻面：宽 MAX_FACES（每个面一个平面：法线 xyz、到中心的距离 w），高 MAX_LAYERS（一行一代）
export function planesTexture() {
  const t = new THREE.DataTexture(new Float32Array(MAX_FACES * MAX_LAYERS * 4), MAX_FACES, MAX_LAYERS, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

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
    // Apple Intelligence 式光谱：每一类事的方位、色调、分量；成熟度；流动；事件时的亮度
    uSpec: { value: 0 },
    uSpecN: { value: 0 },
    uCatAz: { value: new Float32Array(8) },
    uCatLab: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, // OKLab
    uCatW: { value: new Float32Array(8) },
    uSpecMature: { value: 1 },
    uSpecTime: { value: 0 },
    uSpecBoost: { value: 0 },
    uSpecTop: { value: new THREE.Vector3(0.84, -0.06, 0.01) }, // 两极的颜色（OKLab）
    uSpecBottom: { value: new THREE.Vector3(0.7, 0.07, -0.05) },
    uSpecDark: { value: 0 },
    // 晶体：折射率（隔着外壳看心）；表面反射的强度；摄影棚
    uIor: { value: 1.33 },
    uGlaze: { value: 1 },
    uMirrorY: { value: 1 },
    uPointer: { value: new THREE.Vector2() },
    uStudioSky: { value: new THREE.Color(0.92, 0.92, 0.95) },
    uStudioFloor: { value: new THREE.Color(0.72, 0.72, 0.77) },
    uStudioKey: { value: new THREE.Color(2.4, 2.4, 2.45) },
    // 心的每个面的明暗（基础、增益）；心；外面的清玻璃；全息光带；外壳的棱
    uFacetK: { value: new THREE.Vector2(0.82, 0.3) },
    uCore: { value: new THREE.Vector2(0.62, 0.45) }, // 心：赤道上的角收进多少、心的棱多亮
    uClear: { value: new THREE.Vector2(0.1, 0.5) }, // 外面的清玻璃：带多少银、色相随角度偏多少
    uBgLin: { value: new THREE.Color(0.9, 0.9, 0.93) }, // 身后的底色（线性）：清玻璃透出来的就是它
    uGlassTint: { value: new THREE.Color(0.8, 0.84, 0.92) }, // 清玻璃本身一点冷调的银
    uBand: { value: 0 }, // 全息光带的亮度
    uEdgeCol: { value: new THREE.Color(1, 1, 1) }, // 棱的颜色
    uLines: { value: new THREE.Vector3(0.7, 0.12, 0.5) }, // 外壳的棱：亮线、棱边的彩虹、轮廓
    // 晶体：每一代外壳的刻面（局部坐标的平面，一行一代），上下两个尖的倍数，里面的幻影（颜色、强度）
    uPlanes: { value: planesTexture() },
    uFaces: { value: 0 },
    uOuterRow: { value: 0 },
    uTopR: { value: 1.22 },
    uBotR: { value: 1.6 },
    uChromaGain: { value: 1 },
    uChromaCap: { value: 0.16 },
    uDeep: { value: 0 }, // 颜色的深浅
    uShellN: { value: 0 },
    uShellCol: { value: Array.from({ length: MAX_SHELLS }, () => new THREE.Color()) },
    uShellAmt: { value: 0 },
  };
}

// 光谱的颜色场。颜色挂在晶体自己身上（跟着它转），每一类事的颜色在它的那个角；
// 两个尖各有一种颜色（上尖清亮的薄荷、下尖兰紫）。
// 混色在 OKLab（感知均匀的颜色空间）里做：亮度过渡均匀，不会有一道比两边都亮的黄，也不会突然跳色。
//
// 材质是“极光水晶”：清玻璃里一颗发光的心
//   心         一颗更瘦的晶体，和外壳共用上下两个尖；隔着外壳折射进去才看见它，转动时有一点视差
//   极光       心的每个面是一段完整、平滑的渐变，面与面按朝向分出明暗；一道全息光带横过，面转过来时跟着滑动
//   清玻璃     外壳透出身后的底色，带一点冷调的银；心的光在里面淡淡散开
//   棱         外壳一道细亮线，棱边上一道极细的彩虹（棱镜的色散）；心的棱隔着玻璃，更淡；轮廓一道
//   光泽       表面反射摄影棚，掠射处按菲涅耳变亮
//   没有光晕   所有的光都在轮廓以内
export const SPECTRAL_GLSL = /* glsl */ `
#define DBB_MAXC 8
#define DBB_MAXS ${MAX_SHELLS}
uniform float uSpec; uniform float uSpecN; uniform float uCatAz[DBB_MAXC]; uniform vec3 uCatLab[DBB_MAXC]; uniform float uCatW[DBB_MAXC];
uniform float uSpecMature; uniform float uSpecTime; uniform float uSpecBoost;
uniform vec3 uSpecTop; uniform vec3 uSpecBottom; uniform float uSpecDark;
uniform float uIor; uniform float uGlaze; uniform float uMirrorY; uniform vec2 uPointer;
uniform vec3 uStudioSky; uniform vec3 uStudioFloor; uniform vec3 uStudioKey;
uniform vec2 uFacetK; uniform vec2 uCore; uniform vec2 uClear; uniform vec3 uBgLin; uniform vec3 uGlassTint; uniform float uBand; uniform vec3 uEdgeCol; uniform vec3 uLines;
uniform float uShellN; uniform vec3 uShellCol[DBB_MAXS]; uniform float uShellAmt;
uniform sampler2D uPlanes; uniform float uFaces; uniform float uOuterRow; uniform float uTopR; uniform float uBotR;
uniform float uChromaGain; uniform float uChromaCap; uniform float uDeep;
vec3 dbbOklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
// 视线（从 O 出发、方向 D，局部坐标）穿过第 row 层外壳：最后进入与倒数第二进入的距离、最先离开与第二离开的距离。
// 两个“进入”的距离越接近，说明离两个面相交的棱越近；“离开”的也一样。凸多面体，所以只要比一遍所有面
vec4 dbbHull(vec3 O, vec3 D, int row, out vec3 nOut) {
  float in1 = -1e5, in2 = -1e5, out1 = 1e5, out2 = 1e5;
  nOut = -D;
  int nf = int(uFaces + 0.5);
  for (int j = 0; j < 16; j++) {
    if (j >= nf) break;
    vec4 P = texelFetch(uPlanes, ivec2(j, row), 0);
    float nd = dot(P.xyz, D);
    if (abs(nd) < 1e-5) continue;
    float t = (P.w - dot(P.xyz, O)) / nd;
    if (nd < 0.0) { if (t > in1) { in2 = in1; in1 = t; } else if (t > in2) { in2 = t; } }
    else { if (t < out1) { out2 = out1; out1 = t; nOut = P.xyz; } else if (t < out2) { out2 = t; } }
  }
  return vec4(in1, in2, out1, out2);
}
// 表面上的点离这个刻面最近的一条棱多远：到其他面的平面的有符号距离取最小（局部坐标）。
// 越过棱就变成负的，屏幕上的导数是连续的，线不会断成虚线；nOther 是棱另一侧那个面的法线
float dbbEdgeDist(vec3 p, vec3 nSelf, int row, out vec3 nOther) {
  float e = 1e5;
  nOther = nSelf;
  int nf = int(uFaces + 0.5);
  for (int j = 0; j < 16; j++) {
    if (j >= nf) break;
    vec4 P = texelFetch(uPlanes, ivec2(j, row), 0);
    if (dot(P.xyz, nSelf) > 0.999) continue;
    float d = P.w - dot(P.xyz, p);
    if (d < e) { e = d; nOther = P.xyz; }
  }
  return e;
}
// 一道宽 w 个像素、边缘抗锯齿的线（g 是离线的距离）
float dbbLine(float g, float w) {
  return 1.0 - smoothstep(0.0, w * max(fwidth(g), 1e-5), g);
}
// 颜色场用的方向：先把高高的晶体压回一个正八面体（上下两个尖按 DIAMOND 的倍数压回去），
// 四个角的颜色才铺得满整个身体，而不是挤在赤道上窄窄的一条
vec3 dbbShapeDir(vec3 p) {
  vec3 q = vec3(p.x, p.y / (p.y > 0.0 ? uTopR : uBotR), p.z);
  return q / max(length(q), 1e-5);
}
// 颜色场：晶体自己坐标里的方向 d 上是什么颜色（OKLab）
vec3 dbbField(vec3 d) {
  float T = uSpecTime;
  // 缓慢流动：色带轻轻摆动、两极的边界轻轻起伏；哪一类在哪一侧不变
  float n1 = dbb_snoise(d * 0.85 + vec3(T * 0.04, T * 0.06, -T * 0.03));
  float n2 = dbb_snoise(d * 1.05 + vec3(-T * 0.045, 11.0 + T * 0.035, T * 0.05));
  // 晶体上流动收得很轻：颜色像极光一样在玻璃里缓缓流动，渐变是干净的，不花
  float wob = 0.0;
  float phi = atan(d.z, d.x) + 0.26 * n1 * wob + 0.07 * sin(T * 0.05);
  float y = clamp(d.y + 0.09 * n2 * wob, -1.0, 1.0);
  vec2 U = vec2(0.0), AB = vec2(0.0);
  float Ls = 0.0, Cs = 0.0, ws = 0.0;
  // 每一类事占一片：自己的方位上最强，分量越大这一片越宽；一次都没长过的类别也留一点影子。
  // 权重先平方再归一化：每一片中间是比较纯的颜色，交界处是一段宽而柔和的过渡
  float eq = 1.0 - 0.6 * y * y;
  for (int i = 0; i < DBB_MAXC; i++) {
    if (float(i) >= uSpecN) break;
    float dp = phi - uCatAz[i];
    dp = atan(sin(dp), cos(dp));
    float w = uCatW[i];
    float width = 0.95 + 0.6 * w;
    float k = exp(-dp * dp / (width * width)) * (0.45 + 0.85 * w) * eq;
    k = k * k;
    vec3 c = uCatLab[i];
    float C = max(length(c.yz), 1e-4);
    U += c.yz / C * k; AB += c.yz * k; Ls += c.x * k; Cs += C * k; ws += k;
  }
  // 两极：顶上清凉、底下兰紫，占纬度 45° 以上的一片
  for (int j = 0; j < 2; j++) {
    vec3 P = j == 0 ? uSpecTop : uSpecBottom;
    float k = 1.05 * smoothstep(0.15, 0.95, j == 0 ? y : -y);
    k = k * k;
    float C = max(length(P.yz), 1e-4);
    U += P.yz / C * k; AB += P.yz * k; Ls += P.x * k; Cs += C * k; ws += k;
  }
  ws = max(ws, 1e-5);
  U /= ws; AB /= ws; Ls /= ws; Cs /= ws;
  // 色相相近的颜色按色相混，彩度不掉（蓝到兰紫、琥珀到玫红都是干净的过渡）；
  // 只有几乎相对的两种颜色才直接在 OKLab 里混，免得绕色轮走出一道不相干的颜色
  float coh = length(U);
  // 几乎相对的两种颜色（比如上尖的薄荷与玫红）之间不走灰：往兰紫那边绕过去，彩度不掉（Apple Intelligence 的渐变也是这样走：蓝、紫、粉、橙）
  U += vec2(0.26, -0.97) * 0.5 * (1.0 - smoothstep(0.15, 0.6, coh));
  coh = length(U);
  vec2 ab = mix(AB, U / max(coh, 1e-4) * Cs, smoothstep(0.35, 0.8, coh));
  float C = length(ab);
  vec2 h = C > 1e-5 ? ab / C : vec2(1.0, 0.0);
  // 每一片颜色内部也有一点起伏（色相 ±10° 缓慢漂移）：像光在里面流动，不是一块平涂
  float hj = 0.17 * wob * dbb_snoise(d * 1.35 + vec3(7.0 - T * 0.05, T * 0.03, 3.0 + T * 0.04));
  h = vec2(h.x * cos(hj) - h.y * sin(hj), h.x * sin(hj) + h.y * cos(hj));
  // 琥珀和绿之间会绕出一道荧光的黄绿，那不是极光的颜色：这一段色相收一点彩度、压一点亮度
  float hd = degrees(atan(h.y, h.x));
  float lime = exp(-pow((hd - 125.0) / 24.0, 2.0));
  C *= 1.0 - 0.4 * lime;
  Ls -= 0.03 * lime;
  return vec3(Ls, h * C);
}
// 表面的光泽：摄影棚，边界清楚——左上的柔光箱（跟着指针）、右侧一条窄灯带、头顶一盏灯。
// 平的刻面反射的是一整片，正好对上灯的那个面整面亮一下，转一下就换一个面
vec3 dbbStudioSharp(vec3 r) {
  vec3 c = mix(uStudioFloor, uStudioSky, smoothstep(-0.3, 0.5, r.y));
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 kd = normalize(vec3(-0.52 + 0.3 * uPointer.x, 0.6 + 0.2 * uPointer.y, 0.6));
  float dk = dot(r, kd);
  if (dk > 0.0) {
    vec3 ku = normalize(cross(up, kd));
    vec3 kv = cross(kd, ku);
    vec2 q = vec2(dot(r, ku), dot(r, kv)) / max(dk, 0.2);
    float sd = length(max(abs(q) - vec2(0.32, 0.2), 0.0)) - 0.06;
    c += uStudioKey * (1.0 - smoothstep(-0.02, 0.03, sd));
  }
  vec3 sdir = normalize(vec3(0.95, 0.2, 0.25));
  float ds = dot(r, sdir);
  if (ds > 0.0) {
    vec3 su = normalize(cross(up, sdir));
    vec3 sv = cross(sdir, su);
    vec2 q2 = vec2(dot(r, su), dot(r, sv)) / max(ds, 0.2);
    float sd2 = length(max(abs(q2) - vec2(0.05, 0.7), 0.0)) - 0.02;
    c += uStudioKey * 0.75 * (1.0 - smoothstep(-0.01, 0.025, sd2));
  }
  c += uStudioKey * 0.4 * smoothstep(0.94, 0.975, r.y);
  return c;
}
// 颜色落到屏幕上：OKLab → 线性 RGB；超出屏幕色域的颜色往同样亮度的灰收一点，不去截断某一个通道（截断会偏色）
vec3 dbbVivid(float L, vec2 ab) {
  vec3 c = dbbOklabToLinear(vec3(L, ab));
  float gy = L * L * L;
  float lo = min(min(c.r, c.g), c.b), hi = max(max(c.r, c.g), c.b);
  float gt = 1.0;
  if (lo < 0.0) gt = min(gt, gy / max(gy - lo, 1e-5));
  if (hi > 1.0) gt = min(gt, (1.0 - gy) / max(hi - gy, 1e-5));
  return clamp(vec3(gy) + (c - vec3(gy)) * gt, 0.0, 1.0);
}
// 心：一颗更瘦的晶体，和外壳共用上下两个尖，赤道上的角收进 s 倍（外壳的平面按水平方向缩放：n' ∝ (n.x/s, n.y, n.z/s)）。
// 视线（从 O 出发、方向 D）进入心的距离与离开的距离；nIn 是进入的那个面的法线
vec2 dbbCore(vec3 O, vec3 D, int row, float s, out vec3 nIn) {
  float in1 = -1e5, out1 = 1e5;
  nIn = vec3(0.0, 1.0, 0.0);
  int nf = int(uFaces + 0.5);
  for (int j = 0; j < 16; j++) {
    if (j >= nf) break;
    vec4 P = texelFetch(uPlanes, ivec2(j, row), 0);
    vec3 n = vec3(P.x / s, P.y, P.z / s);
    float l = length(n);
    n /= l;
    float nd = dot(n, D);
    if (abs(nd) < 1e-5) continue;
    float t = (P.w / l - dot(n, O)) / nd;
    if (nd < 0.0) { if (t > in1) { in1 = t; nIn = n; } }
    else out1 = min(out1, t);
  }
  return vec2(in1, out1);
}
// 心的表面上的点离它最近的一条棱多远（到心的其他面的有符号距离，越过棱是负的，线是连续的）
float dbbCoreEdge(vec3 p, vec3 nSelf, int row, float s) {
  float e = 1e5;
  int nf = int(uFaces + 0.5);
  for (int j = 0; j < 16; j++) {
    if (j >= nf) break;
    vec4 P = texelFetch(uPlanes, ivec2(j, row), 0);
    vec3 n = vec3(P.x / s, P.y, P.z / s);
    float l = length(n);
    n /= l;
    if (dot(n, nSelf) > 0.999) continue;
    e = min(e, P.w / l - dot(n, p));
  }
  return e;
}
// local：表面点（晶体自己的坐标）；viewL / normL：同一坐标里朝向镜头的方向与法线；nW / vW：世界坐标里的法线与视线
vec3 dbbGlass(vec3 local, vec3 viewL, vec3 normL, vec3 nW, vec3 vW) {
  vec3 V = normalize(viewL);
  vec3 N = normalize(normL);
  if (dot(N, V) < 0.0) N = -N;
  float r = max(length(local), 1e-4);
  int row = int((uRow >= 0.0 ? uRow : uOuterRow) + 0.5);
  vec3 Tr = refract(-V, N, 1.0 / uIor);
  if (dot(Tr, Tr) < 1e-6) Tr = -N;
  // ① 心：隔着外面的清玻璃，折射进去看见的那颗更瘦的晶体。它是鲜亮的极光
  vec3 nC;
  vec2 ch = dbbCore(local, Tr, row, uCore.x, nC);
  float thickC = ch.y - ch.x;
  float coreMask = smoothstep(0.0, 1.4 * max(fwidth(thickC), 1e-6), thickC) * step(0.0, ch.y);
  vec3 Pc = local + Tr * max(ch.x, 0.0);
  vec3 lab = dbbField(normalize(dbbShapeDir(Pc) + 0.16 * nC));
  float L = lab.x;
  float C = length(lab.yz);
  vec2 h = C > 1e-5 ? lab.yz / C : vec2(1.0, 0.0);
  C *= 1.0 + 0.3 * uSpecBoost; // 事件：颜色浓一阵
  L -= uDeep * (0.05 + 0.25 * max(L - 0.62, 0.0));
  C = uChromaCap * tanh(C * uChromaGain / uChromaCap);
  // 诞生时很淡：颜色都在，都很浅；经历让颜色变浓
  C *= mix(0.4, 1.0, uSpecMature);
  L = mix(0.93, L, mix(0.45, 1.0, uSpecMature));
  // 心的每个面明暗分得开：朝上的亮一点，正对你的亮一点
  float shade = uFacetK.x + uFacetK.y * (0.55 * nC.y + 0.45 * max(dot(nC, -Tr), 0.0));
  vec3 core = dbbVivid(L, h * C) * shade;
  // 全息的光带：横过心的每个面，面转过来时跟着滑动
  float tc = clamp(Pc.y * nC.y / max(dot(nC, Pc), 1e-4), 0.0, 1.0);
  float bc = mix(0.8, 0.3, smoothstep(0.4, 1.0, max(dot(nC, -Tr), 0.0)));
  float band = exp(-pow((tc - bc) / 0.12, 2.0));
  vec2 hb = vec2(h.x * cos(0.55) - h.y * sin(0.55), h.x * sin(0.55) + h.y * cos(0.55));
  core = mix(core, dbbVivid(min(L + 0.1, 0.94), hb * C), clamp(band * uBand, 0.0, 1.0));
  // 心的棱：隔着玻璃看，一道细亮线
  float ec = dbbCoreEdge(Pc, nC, row, uCore.x);
  float eCore = 1.0 - smoothstep(0.0, 1.2 * max(fwidth(ec), 1e-6), abs(ec));
  core = mix(core, mix(core, vec3(1.0), 0.8), eCore * uCore.y);
  // ② 外面一层清透的玻璃：透出身后的底色，只带一点淡淡的颜色；色相随角度偏一点（像全息片）
  float f = clamp(dot(N, V), 0.0, 1.0);
  float ang = (1.0 - f) * uClear.y;
  vec2 hs = vec2(h.x * cos(ang) - h.y * sin(ang), h.x * sin(ang) + h.y * cos(ang));
  vec3 clear = mix(mix(uBgLin, uGlassTint, uClear.x), dbbVivid(0.9, hs * C * 0.5), uClear.x * 0.5);
  // 心的光在玻璃里散开：靠近心的地方带着它淡淡的颜色，往外渐渐清透
  float glow = exp(min(thickC, 0.0) / (0.22 * r)) * (1.0 - coreMask);
  clear = mix(clear, dbbVivid(mix(L, 0.92, 0.45), h * C * 0.7), glow * uBand * 0.9);
  vec3 inner = mix(clear, core, coreMask);
  // ③ 抛光：反射摄影棚（左上柔光箱跟着指针、右侧灯带、头顶一盏）；菲涅耳：正对时很淡，侧过去像镜子
  vec3 nWm = normalize(vec3(nW.x, nW.y * uMirrorY, nW.z));
  vec3 vWm = normalize(vec3(vW.x, vW.y * uMirrorY, vW.z));
  float cv = clamp(dot(nWm, vWm), 0.0, 1.0);
  float F = (0.04 + 0.96 * pow(1.0 - cv, 5.0)) * uGlaze;
  vec3 col = inner * (1.0 - F) + dbbStudioSharp(reflect(-vWm, nWm)) * F;
  // ④ 外壳的棱：一道清楚的亮线，里侧一点柔光；棱边上一道极细的彩虹（棱镜的色散）；轮廓一道
  vec3 nO, nDummy;
  float ed = dbbEdgeDist(local, N, row, nO);
  float efw = max(fwidth(ed), 1e-6);
  float fr = ed / (7.0 * efw);
  if (fr < 1.0) {
    vec3 prism = clamp(abs(fract(fr * 0.85 + vec3(0.0, 0.33, 0.67)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    col = mix(col, mix(col, prism, 0.5), (1.0 - fr) * smoothstep(0.1, 0.35, fr) * uLines.y * 2.5);
  }
  float eLine = 1.0 - smoothstep(0.0, 1.2 * efw, abs(ed));
  vec4 hv = dbbHull(local, -V, row, nDummy);
  float eSil = dbbLine(max(hv.z, 0.0), 1.5);
  return mix(col, uEdgeCol, clamp(uLines.x * eLine + uLines.z * eSil, 0.0, 1.0));
}
`;

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
    uRow: { value: -1 }, // 剖开时每一层自己的外壳（-1：整颗晶体的最外一层）
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
      .replace('#include <common>', '#include <common>\nvarying vec3 vDbbLocal;\nvarying vec3 vDbbWorld;\nvarying vec3 vDbbViewL;\nvarying vec3 vDbbNormalL;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDbbLocal = transformed;\nvDbbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nmat4 dbbInv = inverse(modelMatrix);\nvDbbViewL = (dbbInv * vec4(cameraPosition, 1.0)).xyz - transformed;\nvDbbNormalL = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${defs}
varying vec3 vDbbLocal;
varying vec3 vDbbWorld;
varying vec3 vDbbViewL;
varying vec3 vDbbNormalL;
uniform float uGlow; uniform vec3 uGlowColor; uniform vec3 uWarmPos; uniform float uWarmAmt;
uniform float uSweepY; uniform float uSweepAmt; uniform float uBaseGlow; uniform float uSwirlSeed; uniform float uPulse;
uniform float uDissolve; uniform float uDisR; uniform vec3 uEdgeColor; uniform float uFadeTop; uniform float uFadeBottom; uniform float uAlpha;
uniform vec3 uTint; uniform float uTintAmt; uniform float uGrow; uniform vec3 uGrowColor; uniform float uRow;
uniform float uAurora; uniform float uAurTime;
${NOISE_GLSL}
${AURORA_GLSL}
${SPECTRAL_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
float dbbEdge = 0.0;
vec3 dbbAurCol = vec3(0.0);
float dbbAurAmt = 0.0;
vec3 dbbFx = vec3(0.0);
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
  dbbFx += uGlowColor * (uGlow * (0.22 + 0.78 * rim) + uBaseGlow * (0.4 + rim));
  float dw = distance(vDbbLocal, uWarmPos);
  dbbFx += vec3(1.0, 0.78, 0.62) * uWarmAmt * exp(-dw * dw / 0.1) * 0.5;
  float band = exp(-pow((vDbbLocal.y - uSweepY) / 0.16, 2.0));
  dbbFx += vec3(0.93, 0.91, 1.0) * uSweepAmt * band * (0.25 + 0.75 * rim) * 0.55;
  dbbFx += uGlowColor * uPulse * (0.35 + 0.65 * rim) * 0.5;
  dbbFx += uGrowColor * uGrow * (0.45 + 0.55 * rim);
  dbbFx += uEdgeColor * dbbEdge * 2.2;
  if (uAurora > 0.001) {
    // 沿轮廓流动：角度决定颜色，缓慢转动，再加一点噪声让它像光幕而不是色环
    float ang = atan(nV.y, nV.x) / 6.28318;
    float flow = ang + uAurTime * 0.05 + dbb_snoise(vec3(vDbbLocal.xy * 1.3, uAurTime * 0.12)) * 0.16;
    dbbAurCol = dbbAurora(flow);
    float band = pow(rim, 1.3);
    dbbFx += dbbAurCol * uAurora * (band * 1.7 + 0.1);
    // 浅色背景上光是加不出来的：同时把轮廓染上极光的颜色
    dbbAurAmt = clamp(uAurora * band * 1.1, 0.0, 0.8);
  }
  totalEmissiveRadiance += dbbFx;
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
if (uSpec > 0.001) {
  vec3 nS = normalize(normal);
  vec3 sc = dbbGlass(vDbbLocal, vDbbViewL, vDbbNormalL, inverseTransformDirection(nS, viewMatrix), normalize(cameraPosition - vDbbWorld));
#ifdef DBB_TINT
  sc = mix(sc, uTint, uTintAmt);
#endif
  outgoingLight = mix(outgoingLight, sc + dbbFx, uSpec);
}
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
uniform float uGlassCap;
uniform vec2 uPointer;
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
  float spec = pow(max(dot(R, uKey), 0.0), 24.0) * 0.28 * (1.0 - 0.7 * uGlassCap);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.12;
  col = col * diff + vec3(spec + fres);
  if (uGlassCap > 0.0) {
    // 像一片抛光的玛瑙：每一圈靠外的边缘更透、更亮（和晶体轮廓内侧的倒角是同一种亮）；
    // 表面一层柔和的釉光，跟着指针移动
    if (k > 0) col = mix(col, col + vec3(0.09), smoothstep(0.5, 1.0, vS) * uGlassCap);
    vec3 kd = normalize(vec3(-0.52 + 0.3 * uPointer.x, 0.6 + 0.2 * uPointer.y, 0.6));
    col += vec3(pow(max(dot(R, kd), 0.0), 7.0) * 0.2 * uGlassCap);
  }
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
      uGlassCap: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
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

// 光柱：继承时，一道光从水里升起，接到晶体身上。浅色背景上用柔和的半透明光，而不是叠加发光。
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
