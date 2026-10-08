// =============================================================
// 相遇时间显示（v1.6 时间线详情页格式）
// 今天的记录 → 「14:30」
// 昨天的 → 「昨天 14:30」
// 一周内的 → 「周一 14:30」
// 今年更早的 → 「10月5日 14:30」
// 去年及以前的 → 「2025年10月5日」
// =============================================================

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatMeetTime(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const todayMid = new Date(dayKey(new Date(now)) + "T00:00:00").getTime();
  const thatMid = new Date(dayKey(d) + "T00:00:00").getTime();
  const diffDays = Math.round((todayMid - thatMid) / 86400000);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;

  if (diffDays <= 0) return hm;
  if (diffDays === 1) return `昨天 ${hm}`;
  if (diffDays < 7) return `${WEEKDAYS[d.getDay()]} ${hm}`;
  if (d.getFullYear() === new Date(now).getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
