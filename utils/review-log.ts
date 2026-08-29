/**
 * 复习日志：按天聚合本地复习次数（storage 持久化）
 * 数据从启用当天开始积累，历史无法回溯（行为计数是累计值、无时间戳）
 * 结构：{ "2026-8-29": { dict: 3, review: 5 }, ... }，只保留近 7 天
 */

const LOG_KEY = "meetre_review_log_v1";
const KEEP_DAYS = 7;

interface DayCount {
  dict: number;
  review: number;
}

type ReviewLog = Record<string, DayCount>;

function dayKeyLocal(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadLog(): ReviewLog {
  try {
    const raw = uni.getStorageSync(LOG_KEY);
    if (raw && typeof raw === "object") return raw as ReviewLog;
  } catch (e) {
    console.warn("[review-log] 读取失败", e);
  }
  return {};
}

/** 清理只保留近 7 天（含今天） */
function prune(log: ReviewLog): ReviewLog {
  const keep = new Set<string>();
  for (let i = 0; i < KEEP_DAYS; i++) {
    keep.add(dayKeyLocal(Date.now() - i * 24 * 60 * 60 * 1000));
  }
  const out: ReviewLog = {};
  for (const k of Object.keys(log)) {
    if (keep.has(k)) out[k] = log[k];
  }
  return out;
}

/** 记一次复习行为：type = dict（查词典）| review（回看笔记） */
export function logReview(type: "dict" | "review") {
  const log = prune(loadLog());
  const day = dayKeyLocal();
  if (!log[day]) log[day] = { dict: 0, review: 0 };
  log[day][type]++;
  try {
    uni.setStorageSync(LOG_KEY, log);
  } catch (e) {
    console.warn("[review-log] 写入失败", e);
  }
}

/** 近 7 天趋势：从今天往回 7 天，无数据的天为 0 */
export function getWeeklyTrend(): { dict: number; review: number; total: number }[] {
  const log = prune(loadLog());
  const out: { dict: number; review: number; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const ts = Date.now() - i * 24 * 60 * 60 * 1000;
    const key = dayKeyLocal(ts);
    const c = log[key] || { dict: 0, review: 0 };
    out.push({ dict: c.dict, review: c.review, total: c.dict + c.review });
  }
  return out;
}
