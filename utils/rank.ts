import type { Note, RankedTag, Tag, TagSortMode } from "@/types";

// =============================================================
// MeetRe 排名计算核心逻辑（v1.6 极简版）
// 排序规则就一条：笔记数量降序，次数相同按最近相遇时间降序。
// 没有行为加权、没有时间衰减、没有熟悉度算法——排名是镜子，不是工具。
// =============================================================

export interface TagScoreResult {
  /** 排名分 = 相遇次数（笔记数） */
  score: number;
  /** 相遇次数（未删除的笔记数） */
  noteCount: number;
  /** 最近相遇时间（最后一笔笔记的时间，无笔记为 0） */
  lastTime: number;
  /** 初遇时间（最早一笔笔记的时间，无笔记为 0） */
  firstTime: number;
}

export function calculateTagScore(tag: Tag, notes: Note[]): TagScoreResult {
  const tagNotes = notes.filter(
    (n) => n.tags.includes(tag.name) && !n.isDeleted
  );

  const noteCount = tagNotes.length;
  if (noteCount === 0) {
    return { score: 0, noteCount: 0, lastTime: 0, firstTime: 0 };
  }

  let lastTime = 0;
  let firstTime = Number.MAX_SAFE_INTEGER;
  for (const n of tagNotes) {
    if (n.createTime > lastTime) lastTime = n.createTime;
    if (n.createTime < firstTime) firstTime = n.createTime;
  }

  return { score: noteCount, noteCount, lastTime, firstTime };
}

export function computeRankedTags(
  tags: Tag[],
  notes: Note[],
  now: number = Date.now()
): RankedTag[] {
  // 休息到期后自动恢复参与排名（v1.6）：
  // 即使存储层 status 尚未写回 learning，显示层也按已恢复处理
  const activeTags = tags.filter(
    (t) =>
      t.status !== "mastered" &&
      !(t.status === "snoozed" && (t.snoozeExpireAt || 0) > now)
  );

  const scored = activeTags.map((tag) => {
    const { score, noteCount, lastTime, firstTime } = calculateTagScore(
      tag,
      notes
    );
    return { ...tag, score, noteCount, lastTime, firstTime };
  });

  // 笔记数量降序；次数相同按最近相遇时间降序
  const sorted = scored.sort(
    (a, b) => b.noteCount - a.noteCount || b.lastTime - a.lastTime
  );

  return sorted.map((tag, index) => ({ ...tag, rank: index + 1 }));
}

/**
 * 我的词排序（v1.6）：
 * - count：相遇次数降序（默认），次数相同最近相遇优先
 * - recent：最近相遇降序
 * - first：初遇时间升序（最早认识的排前面）
 */
export function sortRankedTags(
  list: RankedTag[],
  mode: TagSortMode
): RankedTag[] {
  const copy = [...list];
  if (mode === "recent") {
    copy.sort((a, b) => b.lastTime - a.lastTime);
  } else if (mode === "first") {
    copy.sort((a, b) => a.firstTime - b.firstTime);
  } else {
    copy.sort(
      (a, b) => b.noteCount - a.noteCount || b.lastTime - a.lastTime
    );
  }
  return copy;
}

/** 本地日期键：YYYY-MM-DD */
function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 老朋友提醒（v1.6）：
 * - 只看活跃词，休息中 / 已掌握不参与
 * - 相遇至少 2 次，且距最近一笔相遇超过 7 天
 * - 候选不足 3 个 → 不显示
 * - 每天确定性地换一个（用当天日期做种子，同一天内稳定，第二天自动换人）
 */
export function pickOldFriend(
  tags: Tag[],
  notes: Note[],
  now: number = Date.now()
): Tag | null {
  const today = new Date(dayKey(now) + "T00:00:00").getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const candidates = tags.filter((t) => {
    if (t.status !== "learning") return false;
    const { noteCount, lastTime } = calculateTagScore(t, notes);
    if (noteCount < 2 || !lastTime) return false;
    return today - new Date(dayKey(lastTime) + "T00:00:00").getTime() > sevenDays;
  });

  if (candidates.length < 3) return null;

  // 按名字排序保证候选集合顺序稳定，再用日期种子取一个
  candidates.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const seed = Number(dayKey(now).replace(/-/g, ""));
  return candidates[seed % candidates.length];
}
