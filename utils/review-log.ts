/**
 * 复习日志：本地按天聚合 + 云端备份（notes 云对象 review_logs 集合）
 * - 结构：{ "2026-8-29": { dict: 3, review: 5 }, ... }，只保留近 7 天
 * - 写入：每次行为先落本地；云端推送采用 debounce（5s 内多次合并一次），避免每条行为都写云
 * - 同步：syncReviewLog() 在启动时调用，取云端 → 本地+云端 MAX 合并 → 回写两端
 * - 离线：云调用失败静默降级，下次启动或下次行为时自动重试补齐
 */

const LOG_KEY = "meetre_review_log_v1";
const KEEP_DAYS = 7;
const PUSH_DEBOUNCE_MS = 5000;

interface DayCount {
  dict: number;
  review: number;
}

type ReviewLog = Record<string, DayCount>;

/** 云对象句柄（customUI：失败静默，不弹 SDK 默认错误框） */
function notesApi(): any {
  // eslint-disable-next-line
  return uniCloud.importObject("notes", { customUI: true });
}

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

function saveLog(log: ReviewLog) {
  try {
    uni.setStorageSync(LOG_KEY, log);
  } catch (e) {
    console.warn("[review-log] 写入失败", e);
  }
}

/** 清理只保留近 7 天（含今天） */
export function prune(log: ReviewLog): ReviewLog {
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

/** 合并两份日志：按天按字段取 MAX（用于跨设备 / 云端与本地同步，天然防重复） */
export function mergeLogs(a: ReviewLog, b: ReviewLog): ReviewLog {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: ReviewLog = {};
  for (const k of keys) {
    const av = a[k] || { dict: 0, review: 0 };
    const bv = b[k] || { dict: 0, review: 0 };
    out[k] = {
      dict: Math.max(Number(av.dict) || 0, Number(bv.dict) || 0),
      review: Math.max(Number(av.review) || 0, Number(bv.review) || 0),
    };
  }
  return out;
}

// =============================================================
// 行为埋点：本地 + debounce 推云端
// =============================================================

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushScheduled = false;

/** 触发一次云端推送（内部使用 debounce） */
function scheduleCloudPush() {
  if (pushScheduled) return;
  pushScheduled = true;
  pushTimer = setTimeout(() => {
    pushScheduled = false;
    pushTimer = null;
    const log = prune(loadLog());
    if (!Object.keys(log).length) return;
    notesApi()
      .pushReviewLog({ log })
      .then((res: any) => {
        if (res && res.errCode === 0 && res.log) {
          // 以云端返回的合并结果为权威，回写本地
          saveLog(prune(res.log as ReviewLog));
        }
      })
      .catch((e: unknown) => {
        console.warn("[review-log] 云端推送失败（下次自动重试）：", e);
      });
  }, PUSH_DEBOUNCE_MS);
}

/** 记一次复习行为：type = dict（查词典）| review（回看笔记） */
export function logReview(type: "dict" | "review") {
  const log = prune(loadLog());
  const day = dayKeyLocal();
  if (!log[day]) log[day] = { dict: 0, review: 0 };
  log[day][type]++;
  saveLog(log);
  scheduleCloudPush();
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

// =============================================================
// 启动同步：拉云端 → 合并权威结果 → 回写两端
// =============================================================

let syncRunning = false;

/**
 * 从云端拉取复习日志并与本地合并（MAX），
 * 合并结果作为权威版本回写到本地 + 云端，
 * 保证：本机未上传的离线计数 + 另一设备的计数 都出现在最终结果中。
 * 启动时（App.onLaunch）调用 1 次即可。
 */
export async function syncReviewLog(): Promise<void> {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const res: any = await notesApi().getReviewLog();
    if (!res || res.errCode !== 0 || !res.log) return;
    const cloudLog = res.log as ReviewLog;
    const localLog = prune(loadLog());
    const merged = prune(mergeLogs(localLog, cloudLog));
    saveLog(merged);

    // 如果合并结果比云端或本地任一方更"大"，推回云端使其成为权威
    const localKeys = Object.keys(localLog);
    const cloudKeys = Object.keys(cloudLog);
    const mergedKeys = Object.keys(merged);
    const needsPush =
      mergedKeys.length !== cloudKeys.length ||
      localKeys.some((k) => !cloudKeys.includes(k)) ||
      mergedKeys.some((k) => {
        const m = merged[k];
        const c = cloudLog[k] || { dict: 0, review: 0 };
        return m.dict > c.dict || m.review > c.review;
      });
    if (needsPush) {
      try {
        const pushRes: any = await notesApi().pushReviewLog({ log: merged });
        if (pushRes && pushRes.errCode === 0 && pushRes.log) {
          saveLog(prune(pushRes.log as ReviewLog));
        }
      } catch (e) {
        console.warn("[review-log] 同步后回推云端失败，下次再试：", e);
      }
    }
  } catch (e) {
    console.warn("[review-log] 同步失败，当前以本地为准：", e);
  } finally {
    syncRunning = false;
  }
}
