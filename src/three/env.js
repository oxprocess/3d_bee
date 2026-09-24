// 环境光：一只柔和的摄影棚。左上主光、右侧补光、身后一条暖色地平线、身下水面的反光。
// 珍珠表面的桃色带、薄荷色边，都来自这里的反射。
import * as THREE from 'three';

const GRADIENT_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GRADIENT_FS = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
varying vec3 vDir;
void main() {
  float y = vDir.y;
  vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.6)) : mix(uHorizon, uBottom, pow(-y, 0.5));
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildEnvironment(renderer, pal) {
  const scene = new THREE.Scene();
  const disposables = [];
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(pal.envTop) },
        uHorizon: { value: new THREE.Color(pal.envHorizon) },
        uBottom: { value: new THREE.Color(pal.envBottom) },
      },
      vertexShader: GRADIENT_VS,
      fragmentShader: GRADIENT_FS,
    }),
  );
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);

  const box = (w, h, color, intensity, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
    disposables.push(m.geometry, m.material);
  };
  const layout = pal.look?.env ?? 'studio';
  if (layout === 'space') {
    // 太空：只有一个太阳，从左侧硬硬地照过来；背后一条青色的仪表光；几乎没有补光
    box(0.9, 0.9, pal.key, 16.0, [-8.5, 1.8, 2.4]);
    box(0.35, 4.5, pal.rim, 1.6, [6.4, 0.6, -4.8]);
    box(3.0, 2.0, pal.fill, 0.45, [2.0, 1.0, 7.0]);
    box(8.0, 0.5, '#E8A33D', 0.5, [0, -0.6, -7.8]);
  } else {
    const k = pal.dark ? 0.75 : 1;
    box(3.0, 2.0, pal.key, 4.2 * k, [-3.6, 5.2, 4.4]); // 主光：左上前方
    box(1.4, 3.6, pal.fill, 1.6 * k, [6.2, 1.0, 1.6]); // 补光：右侧，淡紫
    box(9.0, 1.3, pal.envHorizon, 1.25 * k, [0, 0.2, -7.5]); // 身后暖色地平线
    box(9.0, 1.1, pal.envHorizon, 0.9 * k, [0, -0.2, 7.5]); // 身前一条暖色，让腰线有桃色
    box(6.0, 6.0, pal.rim, 0.8 * k, [0, -6.5, 0.5]); // 身下水面的反光，薄荷色
    box(1.1, 1.1, pal.key, 2.6 * k, [4.4, 3.4, 3.2]); // 右上一点小高光
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  return rt;
}
