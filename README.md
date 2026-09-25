# derbeebee 3D 形态

一颗悬在水面上的珍珠，和它在水里的倒影。珍珠是本体（现在替你准备下一步的方法），倒影是影子（正在练习的新方法），涟漪是一件真实发生的事。这个仓库把它做成了可以转动、可以一层层挖到最深、每个细节都接着数据的 3D 形态，并拆成可以复用的模块。

## 打开看

不用安装，直接双击（离线可用，单个文件）：

- `dist/index.html`：**形态走查**。左边一段段读生长过程与分析，右边的珍珠跟着演到哪一段
- `dist/lab.html`：**形态实验台**。换珍珠、落一件事、挖到最深、打开接口透视，全部模块一起试

怎么碰它：拖动转动 · 双指张开 / Ctrl + 滚轮往里挖一层 · 轻点选中一代、一次 · 长按数一数 · 双击复位。键盘：←→↑↓ · + − · Enter · C · Esc。

完整的规则、公式和接口在 [`docs/spec.md`](docs/spec.md)。

色彩定为 **Apple Intelligence 式**，质感是**釉面月光石**：光谱在它身体里，隔着一层磨砂玻璃；里面隐约看得见一圈圈年轮，一片柔光浮在表面下，轮廓一道细亮边，主光跟着你的指针；没有光晕。质感的调研与参数见 spec 第 11.6 节、详图 [`docs/material-glass.jpg`](docs/material-glass.jpg)。每一类事的颜色落在它长出来的那一侧，长得越多那一片越宽，代数越多颜色越浓；诞生时只有很淡的一圈。详图 [`docs/color-apple.jpg`](docs/color-apple.jpg)，规则见 spec 第 11 节。另外两个方向（珍珠母、The Expanse 式）留作对比：[`docs/color-directions.jpg`](docs/color-directions.jpg)，在实验台左侧可以切换。

## 结构

```
src/
  core/        数据：账本（只追加）、从账本推导的形态状态、生长规则、演示数据
    ledger.js    createStore / reduce / canInherit
    view.js      deriveView / BINDINGS（每个细节 ← 哪个字段）
    growth.js    RULE / layerSpec / radiiField / restPose
    tone.js      显示色调：3D、卡片、时间轴用同一套颜色
    demo-data.js 宽展、收束、偏展、转向、诞生、爸妈出游
  three/       3D：PearlStage（珍珠、倒影、水面、水滴、光柱、手势、挖掘）
  ui/          组件（Web Components）与设计令牌 dbb.css
  pages/       两个页面的脚本与样式
  index.html   形态走查（开发版）
  lab.html     形态实验台（开发版）
scripts/
  build.mjs    打包成单文件：dist/*.html；dist/artifact/* 为去掉外壳、发布用的版本
  check.mjs    用无头浏览器打开 dist 页面，走一遍关键步骤，报告控制台错误
docs/spec.md   产品形态、生长阶段、挖掘、交互、公式、数据接口、需要统一的口径
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
