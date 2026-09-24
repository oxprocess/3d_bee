// 账本里的时间都是本地时间的 ISO 字符串（不带时区），显示时按原样读出。
const pad = (n) => String(n).padStart(2, '0');

export const toDate = (iso) => (iso instanceof Date ? iso : new Date(iso));
export const fmtClock = (iso) => { const d = toDate(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtMonth = (iso) => `${toDate(iso).getMonth() + 1}月`;
export const fmtDay = (iso) => { const d = toDate(iso); return `${d.getMonth() + 1}月${d.getDate()}日`; };
export const fmtDayClock = (iso) => `${fmtDay(iso)} ${fmtClock(iso)}`;
export const fmtYearMonth = (iso) => { const d = toDate(iso); return `${d.getFullYear()}年${d.getMonth() + 1}月`; };

export function toIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addMinutes(iso, minutes) {
  const d = toDate(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return toIso(d);
}

export function lerpIso(a, b, t) {
  const A = toDate(a).getTime(), B = toDate(b).getTime();
  return toIso(new Date(A + (B - A) * t));
}

export const minutesBetween = (a, b) => (toDate(b).getTime() - toDate(a).getTime()) / 60000;
