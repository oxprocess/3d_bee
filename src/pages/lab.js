// 形态实验台：同一个 store、同一个舞台，全部模块绑在上面。按钮只做一件事：往账本里写一行。
import { boot, load, themeToggle } from './boot.js';
import { LEDGERS, STORY, CATEGORIES } from '../core/demo-data.js';
import { deriveView } from '../core/view.js';
import { normalizeLedger } from '../core/ledger.js';
import { glyphSvg } from '../ui/shape-glyph.js';
import { addMinutes } from '../core/time.js';
import { mulberry32, clamp } from '../core/rng.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const { store, stage } = boot({ stageEl: $('#stage'), ledger: 'story', stageOpts: { wheelDigs: true } });
window.__dbb = { store, stage };
themeToggle($('#theme'));

$('#rail').bind({ stage });
$('#timeline').bind({ stage });
$('#layerCard').bind({ stage });
$('#shadowMeter').bind({ store });
$('#sealCard').bind({ store });
$('#log').bind({ store });
const lens = document.createElement('dbb-data-lens');
lens.bind({ stage });
$('#lensBtn').addEventListener('click', () => {
  lens.on = !lens.on;
  $('#lensBtn').setAttribute('aria-pressed', String(lens.on));
});

// 选一颗晶体：缩略图由数据直接算出
const views = Object.fromEntries($$('#picks button').map((b) => [b.dataset.ledger, deriveView(normalizeLedger(LEDGERS[b.dataset.ledger]))]));
const markPick = (id) => $$('#picks button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ledger === id)));
$$('#picks button').forEach((b) => {
  b.querySelector('.g').innerHTML = glyphSvg(views[b.dataset.ledger], 46);
  b.addEventListener('click', () => {
    stopStory();
    stage.setDepth(0);
    load(store, b.dataset.ledger);
    markPick(b.dataset.ledger);
  });
});
markPick('story');

// 色彩方向：同一份数据，只换颜色、光和极光出现的方式
$$('#looks button').forEach((b) => b.addEventListener('click', () => {
  stage.setLook(b.dataset.look);
  $$('#looks button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));

$('#sealCat').innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
$('#sealCat').value = 'family';

// 模拟的事情：演示用
const rnd = mulberry32(20260924);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const r2 = (v) => Math.round(v * 100) / 100;
const OBSERVE = ['刚下班，有点累。', '明天要早起开会。', '周末想回趟家。', '这周跑步断了两天。', '朋友说下周来玩。', '爸妈说想出去走走。'];
const QUESTIONS = {
  family: [['今晚 22 点前，爸妈会找你确认住宿', '爸妈问起酒店'], ['周日晚上，妈妈会打电话来', '妈妈来电话'], ['这周爸爸会问体检结果', '爸爸问体检']],
  work: [['明早例会前，经理会要上周的数字', '例会要数字'], ['今天下班前，客户会改需求', '客户改需求'], ['周五前，要交季度汇报的初稿', '季度汇报']],
  health: [['今晚会下雨，跑步要改到室内', '下雨改室内'], ['这周会有一天睡得太晚', '睡得太晚']],
  friends: [['周末会有朋友约饭', '周末约饭'], ['明天老同学会发来消息', '老同学来消息']],
};
const PREP = {
  family: ['三天的天气', '订酒店', '随身药盒', '家里的安排', '一键复制给爸妈'],
  work: ['上周的三个数字', '例会议程', '上次的约定'],
  health: ['室内跑步的时段', '提前半小时提醒'],
  friends: ['大家的口味', '两家备选餐厅', '人数和时间'],
};

const now = () => store.ledger.now ?? '2026-09-24T18:00';
const later = (m) => addMinutes(now(), m);
const pending = () => store.ledger.predictions.filter((p) => p.status === 'sealed');

function seal(cat) {
  const [question, topic] = pick(QUESTIONS[cat]);
  const pBody = r2(0.5 + rnd() * 0.32);
  const pShadow = r2(clamp(pBody + (rnd() - 0.3) * 0.24, 0.2, 0.95));
  return store.dispatch({ type: 'seal', at: later(4), prediction: { question, topic, category: cat, deadline: later(4 + 180), pBody, pShadow } });
}

function resolve(outcome, p = pending()[0]) {
  if (!p) return null;
  return store.dispatch({ type: 'resolve', at: later(20), id: p.id, outcome, note: p.topic });
}

const ACTIONS = {
  observe: () => store.dispatch({ type: 'observe', at: later(3), text: pick(OBSERVE) }),
  seal: () => seal($('#sealCat').value),
  prepare: () => {
    const p = [...pending()].reverse().find((x) => !x.prepared);
    if (p) store.dispatch({ type: 'prepare', at: later(2), id: p.id, items: PREP[p.category] ?? ['下一步'] });
  },
  yes: () => resolve(true),
  no: () => resolve(false),
  iterate: () => store.dispatch({ type: 'iterate', at: later(30) }),
  count: () => stage.count(),
  burst: () => burst(),
  story: () => playStory(),
};
$$('[data-ev]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.ev !== 'story') stopStory(); ACTIONS[b.dataset.ev]?.(); }));

// 按钮随账本状态可用或不可用；满足继承条件时，“迭代时刻”亮起来
function refresh() {
  const v = store.view;
  const pend = pending();
  $('[data-ev="prepare"]').disabled = !pend.some((p) => !p.prepared);
  $('[data-ev="yes"]').disabled = $('[data-ev="no"]').disabled = !pend.length;
  $('[data-ev="seal"]').disabled = pend.length >= 3;
  const it = $('[data-ev="iterate"]');
  it.disabled = v.shadow.mode === 'mirror';
  it.classList.toggle('ready', v.shadow.canInherit);
}
store.subscribe(refresh);
refresh();

// 再比较 10 次：一阵细雨。影子大约六成半的时候更近
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let bursting = false;
async function burst() {
  if (bursting) return;
  bursting = true;
  for (let i = 0; i < 10; i++) {
    const cat = store.view.shadow.category ?? pick(CATEGORIES).id;
    const ch = seal(cat);
    if (!ch) break;
    await wait(360);
    const p = ch.effect.prediction;
    const shadowSaysMore = p.pShadow >= p.pBody;
    const shadowWins = rnd() < 0.66;
    resolve(shadowWins === shadowSaysMore, p);
    await wait(420);
  }
  bursting = false;
}

// 讲一遍故事：18:12 到 23:00
let storyTimers = [];
function stopStory() {
  storyTimers.forEach(clearTimeout);
  storyTimers = [];
}
function playStory() {
  stopStory();
  stage.setDepth(0);
  load(store, 'story');
  markPick('story');
  const plan = [
    [900, () => store.dispatch(STORY.steps[0].event)],
    [3200, () => store.dispatch(STORY.steps[1].event)],
    [6400, () => store.dispatch(STORY.steps[2].event)],
    [8600, () => store.setNow('2026-09-24T19:40')],
    [10800, () => store.dispatch(STORY.steps[3].event)],
    [15500, () => store.dispatch(STORY.steps[4].event)],
  ];
  plan.forEach(([ms, fn]) => storyTimers.push(setTimeout(fn, ms)));
}

// 在 3D 里点水面、点水滴：把对应的卡片滚到眼前
stage.addEventListener('tap', (e) => {
  const t = e.detail.target;
  const el = t === 'shadow' ? $('#shadowMeter') : t === 'droplet' ? $('#sealCard') : null;
  el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  el?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 420 });
});
