# derbeebee 3D 形态

一颗悬在水面上的晶体，和它在水里的倒影。晶体是本体（现在替你准备下一步的方法），倒影是影子（正在练习的新方法），涟漪是一件真实发生的事。这个仓库把它做成了可以转动、可以一层层挖到最深、每个细节都接着数据的 3D 形态，并拆成可以复用的模块。

## 打开看

不用安装，直接双击（离线可用，单个文件）：

- `dist/index.html`：**形态走查**。左边一段段读生长过程与分析，右边的晶体跟着演到哪一段
- `dist/lab.html`：**形态实验台**。换晶体、落一件事、挖到最深、打开接口透视，全部模块一起试

怎么碰它：拖动转动 · 双指张开 / Ctrl + 滚轮往里挖一层 · 轻点选中一代、一次 · 长按数一数 · 双击复位。键盘：←→↑↓ · + − · Enter · C · Esc。

完整的规则、公式和接口在 [`docs/spec.md`](docs/spec.md)。

形状是一颗**圆润的晶体**：赤道上一类事一个角（工作、健康、朋友、家人），哪一类经历得多，那个角就伸得远；轮廓修长，上尖短、下尖长；棱和尖都磨圆了（超椭圆，曲率连续，尖是柔和的圆头），像一颗被水流打磨过的晶石；每一代是一个完整的小晶体，一个套一个，圆角也一层套一层。色彩是 **Apple Intelligence 式**的极光五彩，质感是**圆润的极光水晶**：只有一层，五彩极光就在表面上，顺着曲面流过圆润的棱，相冲的两种颜色之间是一段清透的亮；明暗跟着视线（正对你的面透亮，侧过去的面深而浓）；抛光的曲面映出头顶的光，下沿一条清楚的地平线，柔光箱跟着你的指针走；按一下它会轻轻回弹；没有光晕。每一类事的颜色在它的那个角，长得越多那一片越宽，代数越多颜色越浓；诞生时颜色都在，都很淡。为什么这样设计（亲和、智能、未来、极光，以及平静、活的、可信……）见 spec 第 11.6 节；详图 [`docs/crystal-aurora.jpg`](docs/crystal-aurora.jpg)，规则见 spec 第 7、11 节。

**标志**是同一颗晶体：一个主体，一个影子。影子藏在主体身后，正斜过身来看你（脚藏在主体后面，身子往右斜一点、稍稍踮起脚），边是柔的，颜色是透过晶体的蓝紫，不用黑；第一眼只看见晶体，再看才发现身后有东西在看你。会动的标志里，影子平时藏着，隔一会儿侧过身来看你一下，又藏回去。主体就是 App 里的那颗菱形（五色极光停在标准的那一刻：浅天蓝、薰衣草紫、蓝、青、绿、洋红，四周一圈很柔的光晕），轮廓由同一条生长规则算出来；有浅色、深色、会动的、单色（影子用细横线）、反白、App 图标、页签图标、字标组合，文件在 [`docs/brand/`](docs/brand/)，详图 [`docs/logo.jpg`](docs/logo.jpg)，说明见 spec 第 13 节。

## 结构

```
src/
  core/        数据：账本（只追加）、从账本推导的形态状态、生长规则、演示数据
    ledger.js    createStore / reduce / canInherit
    view.js      deriveView / BINDINGS（每个细节 ← 哪个字段）
    growth.js    RULE / layerSpec / radiiField / diamondField / SOFT（磨圆）/ restPose
    tone.js      显示色调：3D、卡片、时间轴用同一套颜色
    demo-data.js 宽展、收束、偏展、转向、诞生、爸妈出游
  three/       3D：PearlStage（晶体、倒影、水面、水滴、光柱、手势、挖掘）
  ui/          组件（Web Components）、标志 logo.js 与设计令牌 dbb.css
  pages/       两个页面的脚本与样式
  index.html   形态走查（开发版）
  lab.html     形态实验台（开发版）
scripts/
  build.mjs    打包成单文件：dist/*.html；dist/artifact/* 为去掉外壳、发布用的版本
  check.mjs    用无头浏览器打开 dist 页面，走一遍关键步骤，报告控制台错误
  brand.mjs    导出标志文件：docs/brand/*.svg
docs/spec.md   产品形态、生长阶段、挖掘、交互、公式、数据接口、需要统一的口径、标志
docs/brand/    标志文件（SVG）
```

## 开发

```bash
npm install
npm run dev        # http://localhost:5173/src/index.html 与 /src/lab.html
npm run build      # 生成 dist/
npm run check      # 可选：需要 Playwright
```

## 接入真实数据

```js
import { createStore } from './src/core/ledger.js';
import { PearlStage } from './src/three/stage.js';
import './src/ui/index.js';

const store = createStore(myLedger);                // 按 docs/spec.md 8.1 的格式
const stage = new PearlStage(document.querySelector('#pearl'));
stage.setView(store.view);
store.subscribe((change) => stage.apply(change));    // 每一条记录 → 形态上的一处变化

document.querySelector('dbb-shadow-meter').bind({ store });
document.querySelector('dbb-layer-card').bind({ stage });
```

页面中的事情、次数和日期均为演示；形态为示意，展示的是生长规则。
