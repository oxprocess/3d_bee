// 材质：晶体（本体与倒影）、剖面、水面、水滴、光柱。
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

// 本体（或倒影）共享的参数：触摸的余温；光谱与玻璃
export function crystalShared() {
  return {
    uWarmPos: { value: new THREE.Vector3(0, 0, 50) },
    uWarmAmt: { value: 0 },
    // Apple Intelligence 式光谱：每一类事的方位、色调、分量；成熟度；流动；事件时的亮度
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
    // 晶体：表面反射的强度；摄影棚
    uGlaze: { value: 1 },
    uMirrorY: { value: 1 },
    uPointer: { value: new THREE.Vector2() },
    uStudioSky: { value: new THREE.Color(0.92, 0.92, 0.95) },
    uStudioFloor: { value: new THREE.Color(0.72, 0.72, 0.77) },
    uStudioKey: { value: new THREE.Color(2.4, 2.4, 2.45) },
    // 跟着主光与头顶的明暗（基础、增益）；朝光的面提亮；全息偏色；抛光；主光
    uFacetK: { value: new THREE.Vector2(0.82, 0.3) },
    uLit: { value: 0 }, // 朝光的面提亮多少（像光透过来）
    uIri: { value: 0 }, // 色相随角度偏多少（弧度）：全息
    uGloss: { value: 0 }, // 抛光：柔光箱与头顶的光映在表面上的强度
    uGlowKey: { value: new THREE.Vector3(-0.52, 0.6, 0.6).normalize() }, // 主光（世界坐标，跟着指针）
    uChromaGain: { value: 1 },
    uChromaCap: { value: 0.16 },
    uDeep: { value: 0 }, // 颜色的深浅
    uTrans: { value: new THREE.Vector3(0.8, 0.35, 0.35) }, // 透光：映出地面时暗到多少、看见灯时亮多少、朗伯明暗占多少
    uView: { value: 0.7 }, // 侧过去的面暗到多少
    uSheen: { value: new THREE.Vector3(0.28, 0.5, 0.72) }, // 头顶的光：强度，地平线的下沿、上沿
    uRim: { value: 0.15 }, // 轮廓内侧一圈深多少
    uClear: { value: 1.4 }, // 两种颜色相冲时，中间清透的一段亮多少
    uLum: { value: 1 }, // 整体的亮度：呼吸、打盹、事件
  };
}

// 光谱的颜色场。颜色挂在晶体自己身上（跟着它转），每一类事的颜色在它长出来的那一侧；
// 两个尖各有一种颜色（上尖清亮的薄荷、下尖兰紫）。
// 混色在 OKLab（感知均匀的颜色空间）里做：亮度过渡均匀，不会有一道比两边都亮的黄，也不会突然跳色。
//
// 材质是“极光水晶”：只有一层，五彩极光就在表面上。形状是圆润的菱形（见 core/growth.js · SOFT），所以光也是顺着曲面走的
//   极光       颜色顺着方位与高度流过整颗晶体，跨过圆润的棱是连续的；往尖走，颜色沿色相环转向尖的颜色；
//              两种颜色几乎相对时，中间是一段清透的晶体（亮、淡，像紫黄晶、西瓜碧玺的色带之间），不走灰
//   晶莹       正对你的面透亮，侧过去的面颜色深而浓（看宝石时就是这样：明暗跟着视线，不跟着灯）；
//              视线折进晶体、从背面出来，看见身后倒过来的摄影棚：上半映出地面、深一点，下半映出天光、亮一点
//   抛光       头顶的光映在朝上的面上，下沿是一条清楚的地平线；柔光箱在曲面上是一块跟着转动走的亮；
//              轮廓内侧一圈稍深（光在里面全反射），掠射处按菲涅耳反射摄影棚
//   没有光晕   所有的光都在轮廓以内
export const SPECTRAL_GLSL = /* glsl */ `
#define DBB_MAXC 8
uniform float uSpecN; uniform float uCatAz[DBB_MAXC]; uniform vec3 uCatLab[DBB_MAXC]; uniform float uCatW[DBB_MAXC];
uniform float uSpecMature; uniform float uSpecTime; uniform float uSpecBoost;
uniform vec3 uSpecTop; uniform vec3 uSpecBottom; uniform float uSpecDark;
uniform float uGlaze; uniform float uMirrorY; uniform vec2 uPointer;
uniform vec3 uStudioSky; uniform vec3 uStudioFloor; uniform vec3 uStudioKey;
uniform vec2 uFacetK; uniform float uLit; uniform float uIri; uniform float uGloss;
uniform float uChromaGain; uniform float uChromaCap; uniform float uDeep;
uniform vec3 uTrans; uniform float uView; uniform vec3 uSheen; uniform float uRim; uniform float uClear; uniform float uLum;
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
// 颜色场：方位 phi（绕竖轴）与高度 y（−1 下尖，0 赤道，1 上尖）上是什么颜色（OKLab）。
// 高度按晶体自己的尖来量，平的面上，同一高度是一条直线：上尖、下尖的颜色是平直的横向色带，四类事的颜色沿赤道展开。
// 没有噪声：抛光的面上，渐变是干净的
vec3 dbbField(float phi, float y) {
  float T = uSpecTime;
  // 缓慢流动：色带整体轻轻摆动；哪一类在哪一侧不变
  phi += 0.07 * sin(T * 0.05);
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
  // 先把赤道一圈的颜色混好：色相相近的按色相混，彩度不掉；几乎相对的往兰紫那边绕，不走灰
  ws = max(ws, 1e-5);
  U /= ws; AB /= ws; Ls /= ws; Cs /= ws;
  float coh = length(U);
  U += vec2(0.26, -0.97) * 0.5 * (1.0 - smoothstep(0.15, 0.6, coh));
  coh = length(U);
  vec2 abE = mix(AB, U / max(coh, 1e-4) * Cs, smoothstep(0.35, 0.8, coh));
  // 再往两个尖的颜色过渡：份额只看高度。色相相近的，在色相环上走最短的一段，彩度不掉（青走蓝紫到下尖，金黄走绿到上尖）；
  // 几乎相对的两种颜色，中间是一段清透的晶体：亮、淡，不经过一团灰（像紫黄晶的紫与黄之间）。
  // 两条路按色相差柔和地换过去，没有一个固定的“切点”，所以整颗晶体上哪里都没有接缝
  float pt = smoothstep(0.25, 0.95, y), pb = smoothstep(0.25, 0.95, -y);
  vec3 P = pt >= pb ? uSpecTop : uSpecBottom;
  float tp = max(pt, pb);
  float Ce = length(abE), Cp = length(P.yz);
  float hE = atan(abE.y, abE.x);
  float dh = atan(P.z, P.y) - hE;
  dh = atan(sin(dh), cos(dh));
  float ha = hE + dh * tp;
  float Ca = mix(Ce, Cp, tp);
  float La = mix(Ls, P.x, tp);
  vec3 arc = vec3(La, Ca * cos(ha), Ca * sin(ha));
  vec2 ab = mix(abE, P.yz, tp);
  vec3 clr = vec3(La + max(Ca - length(ab), 0.0) * uClear, ab);
  vec3 res = mix(arc, clr, smoothstep(0.62 * 3.14159, 0.95 * 3.14159, abs(dh)));
  Ls = res.x;
  float C = length(res.yz);
  vec2 h = C > 1e-5 ? res.yz / C : vec2(1.0, 0.0);
  // 琥珀和绿之间那一段黄绿：色相往金黄那边挪（不是荧光的黄绿，也不是橄榄），彩度收一点、亮一点
  float hd = degrees(atan(h.y, h.x));
  float lime = exp(-pow((hd - 122.0) / 16.0, 2.0));
  float warp = radians(-26.0 * lime);
  h = vec2(h.x * cos(warp) - h.y * sin(warp), h.x * sin(warp) + h.y * cos(warp));
  C *= 1.0 - 0.1 * lime;
  Ls += 0.05 * lime;
  return vec3(Ls, h * C);
}
// 摄影棚：左上的柔光箱（跟着指针）、右侧一条窄灯带、头顶一盏灯。曲面上一块清楚的方形会被拉成奇怪的形状，
// 所以灯的边缘是柔的：映在圆润的晶体上，是一片顺着曲面走的亮，而不是一面贴上去的旗子
vec3 dbbStudio(vec3 r) {
  vec3 c = mix(uStudioFloor, uStudioSky, smoothstep(-0.3, 0.5, r.y));
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 kd = normalize(vec3(-0.52 + 0.3 * uPointer.x, 0.6 + 0.2 * uPointer.y, 0.6));
  float dk = dot(r, kd);
  if (dk > 0.0) {
    vec3 ku = normalize(cross(up, kd));
    vec3 kv = cross(kd, ku);
    vec2 q = vec2(dot(r, ku), dot(r, kv)) / max(dk, 0.2);
    float sd = length(max(abs(q) - vec2(0.32, 0.2), 0.0)) - 0.06;
    c += uStudioKey * (1.0 - smoothstep(-0.12, 0.16, sd));
  }
  vec3 sdir = normalize(vec3(0.95, 0.2, 0.25));
  float ds = dot(r, sdir);
  if (ds > 0.0) {
    vec3 su = normalize(cross(up, sdir));
    vec3 sv = cross(sdir, su);
    vec2 q2 = vec2(dot(r, su), dot(r, sv)) / max(ds, 0.2);
    float sd2 = length(max(abs(q2) - vec2(0.05, 0.7), 0.0)) - 0.02;
    c += uStudioKey * 0.75 * (1.0 - smoothstep(-0.06, 0.1, sd2));
  }
  c += uStudioKey * 0.4 * smoothstep(0.86, 0.98, r.y);
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
// local：表面点（晶体自己的坐标）；viewL：同一坐标里从表面点到镜头；normL：法线；keyL：主光；nW / vW：世界坐标里的法线与视线
vec3 dbbGlass(vec3 local, vec3 viewL, vec3 normL, vec3 keyL, vec3 nW, vec3 vW) {
  vec3 V = normalize(viewL);
  vec3 N = normalize(normL);
  if (dot(N, V) < 0.0) N = -N;
  float r = max(length(local), 1e-4);
  float f = clamp(dot(N, V), 0.0, 1.0); // 这个面正对你的程度
  // 高度：切面和竖轴的交点就是这个面的尖（平的地方，尖的高度 = 平面到中心的距离 / 法线的 y），在面上是线性的；
  // 到了圆润的棱和尖，切面跟着转，高度也连续地变过去
  float hA = dot(N, local) / (abs(N.y) > 1e-4 ? N.y : 1e-4);
  float y = clamp(local.y / max(abs(hA), 1e-4), -1.0, 1.0);
  // ① 极光就在表面上：颜色只看方位和高度，顺着曲面流过圆润的棱
  vec3 lab = dbbField(atan(local.z, local.x), y);
  float L = lab.x;
  float C = length(lab.yz);
  vec2 h = C > 1e-5 ? lab.yz / C : vec2(1.0, 0.0);
  C *= 1.0 + 0.3 * uSpecBoost; // 事件：颜色浓一阵
  // 黄色一压暗就是橄榄色：黄的地方少压暗，背光时也少暗一点
  float yl = exp(-pow((degrees(atan(h.y, h.x)) - 98.0) / 26.0, 2.0));
  L -= uDeep * (0.05 + 0.25 * max(L - 0.62, 0.0)) * (1.0 - 0.8 * yl);
  C = uChromaCap * tanh(C * uChromaGain / uChromaCap);
  // 诞生时很淡：颜色都在，都很浅；经历让颜色变浓
  C *= mix(0.4, 1.0, uSpecMature);
  L = mix(0.93, L, mix(0.45, 1.0, uSpecMature));
  // 全息：色相随角度轻轻偏一点，越侧过去偏得越多，转动时颜色在曲面上流过
  float ang = (1.0 - f) * uIri;
  h = vec2(h.x * cos(ang) - h.y * sin(ang), h.x * sin(ang) + h.y * cos(ang));
  vec3 base = dbbVivid(L, h * C);
  // ② 晶莹：明暗主要跟着视线走（宝石是这样的），只留一点跟着主光（左上方，跟着指针）
  vec3 nWm = normalize(vec3(nW.x, nW.y * uMirrorY, nW.z));
  vec3 vWm = normalize(vec3(vW.x, vW.y * uMirrorY, vW.z));
  vec3 kL = normalize(keyL);
  float Kk = dot(N, kL) * 0.5 + 0.5;
  float Kt = nWm.y * 0.5 + 0.5;
  // 透光：视线从表面折进晶体，从背面出来时朝轴弯（凸的晶体就是一片透镜，折射率 1.5），看见身后倒过来的摄影棚：
  // 映出地面的地方深一点，映出天光的地方亮一点，正好透过来一盏灯的地方，朝同一个色相亮起来——光在晶体里面
  vec3 wv = -vWm;
  float ti = acos(clamp(dot(nWm, vWm), 0.0, 1.0));
  float dev = 2.0 * (ti - asin(sin(ti) / 1.5));
  vec3 nt = nWm - dot(nWm, wv) * wv;
  float lt = length(nt);
  vec3 wo = lt > 1e-4 ? normalize(cos(dev) * wv - sin(dev) * nt / lt) : wv;
  const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  float bT = dot(dbbStudio(wo), LUM);
  float skyL = dot(uStudioSky, LUM), floorL = dot(uStudioFloor, LUM);
  float tau = smoothstep(floorL, skyL, bT);
  float kap = clamp((bT - skyL) / max(dot(uStudioKey, LUM), 1e-3), 0.0, 1.0);
  float shadeT = mix(uTrans.x, 1.0, tau);
  float shadeK = uFacetK.x + uFacetK.y * (0.7 * Kk + 0.3 * Kt);
  float shadeV = mix(uView, 1.0, smoothstep(0.12, 0.9, f));
  // 明暗在感知亮度上做：暗的地方只降亮度、彩度留着，是浓郁的宝石色，不发灰；黄色在暗处往琥珀橙偏（暗处更暖），不发橄榄
  float shade = mix(mix(shadeT, shadeK, uTrans.z) * shadeV, 1.0, 0.3 * yl) * uLum;
  float warm = -max(1.0 - shade, 0.0) * yl * 0.9;
  vec2 hw = vec2(h.x * cos(warm) - h.y * sin(warm), h.x * sin(warm) + h.y * cos(warm));
  vec3 col = dbbVivid(L * pow(shade, 1.0 / 3.0), hw * C);
  col = mix(col, dbbVivid(min(L + 0.12, 0.95), h * C * 0.8), smoothstep(0.6, 1.0, Kk) * uLit);
  col = mix(col, dbbVivid(min(L + 0.16, 0.97), h * C * 0.9), kap * uTrans.y);
  // 主光在整颗晶体上的一片光：朝光的一侧亮一点
  col *= 0.9 + 0.14 * smoothstep(-0.45, 0.95, dot(local / r, kL));
  // ③ 抛光：柔光箱映在表面上，边界清楚，里面上亮下暗；转动时这块亮从平的面上扫过、沿着圆润的棱滑过去
  vec3 Rr = reflect(-V, N);
  vec3 ku = normalize(cross(vec3(0.0, 1.0, 0.0), kL));
  vec3 kv = cross(kL, ku);
  float dk = dot(Rr, kL);
  vec2 q = vec2(dot(Rr, ku), dot(Rr, kv)) / max(dk, 0.2);
  float sd = length(max(abs(q) - vec2(0.42, 0.26), 0.0)) - 0.05;
  float box = (1.0 - smoothstep(-0.05, 0.06, sd)) * step(0.0, dk);
  col = mix(col, mix(base, vec3(1.0), 0.85), box * (0.2 + 0.16 * smoothstep(0.25, -0.25, q.y)) * uGloss);
  // 头顶的光：朝上的面映出一片亮，下沿是一条清楚的地平线（落在圆润的赤道上）——抛光玻璃最明白的样子
  col = mix(col, mix(base, vec3(1.0), 0.6), smoothstep(uSheen.y, uSheen.z, Rr.y) * uSheen.x * uGloss);
  // 轮廓内侧一圈稍深：光在晶体里全反射，边缘有了厚度
  col *= 1.0 - uRim * smoothstep(0.04, 0.16, f) * (1.0 - smoothstep(0.16, 0.42, f));
  // 掠射处按菲涅耳反射摄影棚（真实的视线）：侧过去的地方像镜子一样带一点天光
  float cv = clamp(dot(nWm, vWm), 0.0, 1.0);
  float F = (0.04 + 0.96 * pow(1.0 - cv, 5.0)) * uGlaze;
  return col * (1.0 - F) + dbbStudio(reflect(-vWm, nWm)) * F;
}
`;

// 晶体的材质：颜色全在着色器里算（光谱 + 玻璃，见 SPECTRAL_GLSL），物理材质只是载体，留最基本的一层。
// dissolve：剥层时从剖面那道边化开；fade：倒影越往下越淡；tint：倒影蒙一层薄薄的底色；shadow：倒影稍微糙一点、暗一点
export function createCrystal({ shared, dissolve = false, fade = false, tint = false, shadow = false } = {}) {
  const own = {
    uDissolve: { value: 0 },
    uDisR: { value: 1.5 },
    uEdgeColor: { value: new THREE.Color('#fff3da') },
    uFadeTop: { value: -0.1 },
    uFadeBottom: { value: -3 },
    uAlpha: { value: 1 },
    uTint: { value: new THREE.Color('#ffffff') },
    uTintAmt: { value: 0 },
    uGrow: { value: 0 },
    uGrowColor: { value: new THREE.Color('#ffffff') },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.3 + (shadow ? 0.08 : 0),
    metalness: 0,
    envMapIntensity: shadow ? 0.16 : 0.2,
    transparent: fade,
  });
  // 光谱是算好的颜色，不再经过色调映射：画出来的就是设计的那个颜色
  m.toneMapped = false;
  m.userData.own = own;
  m.userData.shared = shared;
  const defs = [dissolve ? '#define DBB_DISSOLVE' : '', fade ? '#define DBB_FADE' : '', tint ? '#define DBB_TINT' : ''].join('\n');
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDbbLocal;\nvarying vec3 vDbbWorld;\nvarying vec3 vDbbViewL;\nvarying vec3 vDbbNormalL;\nvarying vec3 vDbbKeyL;\nuniform vec3 uGlowKey;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDbbLocal = transformed;\nvDbbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nmat4 dbbInv = inverse(modelMatrix);\nvDbbViewL = (dbbInv * vec4(cameraPosition, 1.0)).xyz - transformed;\nvDbbNormalL = objectNormal;\nvDbbKeyL = (dbbInv * vec4(uGlowKey, 0.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${defs}
varying vec3 vDbbLocal;
varying vec3 vDbbWorld;
varying vec3 vDbbViewL;
varying vec3 vDbbNormalL;
varying vec3 vDbbKeyL;
uniform vec3 uWarmPos; uniform float uWarmAmt;
uniform float uDissolve; uniform float uDisR; uniform vec3 uEdgeColor; uniform float uFadeTop; uniform float uFadeBottom; uniform float uAlpha;
uniform vec3 uTint; uniform float uTintAmt; uniform float uGrow; uniform vec3 uGrowColor;
${NOISE_GLSL}
${SPECTRAL_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
float dbbEdge = 0.0;
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
        '#include <opaque_fragment>',
        `#ifdef DBB_FADE
  diffuseColor.a *= uAlpha * smoothstep(uFadeBottom, uFadeTop, vDbbWorld.y);
#endif
{
  vec3 nS = normalize(normal);
  vec3 sc = dbbGlass(vDbbLocal, vDbbViewL, vDbbNormalL, vDbbKeyL, inverseTransformDirection(nS, viewMatrix), normalize(cameraPosition - vDbbWorld));
#ifdef DBB_TINT
  sc = mix(sc, uTint, uTintAmt);
#endif
  // 按住的地方一点暖色；新的一层长成时一阵同色的光；剥层时化开的那道边
  float rim = pow(1.0 - clamp(dot(nS, normalize(vViewPosition)), 0.0, 1.0), 2.4);
  float dw = distance(vDbbLocal, uWarmPos);
  sc += vec3(1.0, 0.78, 0.62) * uWarmAmt * exp(-dw * dw / 0.1) * 0.5;
  sc += uGrowColor * uGrow * (0.45 + 0.55 * rim);
  sc += uEdgeColor * dbbEdge * 2.2;
  outgoingLight = sc;
}
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `dbb-crystal-${dissolve ? 'd' : ''}${fade ? 'f' : ''}${tint ? 't' : ''}`;
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
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float core = exp(-x * x / 0.08);
  float halo = exp(-x * x / 0.45) * 0.45;
  float head = 1.0 - smoothstep(uRise - 0.1, uRise + 0.02, y);
  float ends = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.82, 1.0, y) * 0.6);
  float streak = 0.8 + 0.2 * dbb_snoise(vec3(x * 3.0, y * 4.0 - uTime * 1.4, uTime * 0.25));
  float a = uAmt * (core + halo) * head * ends * streak;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.85));
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
