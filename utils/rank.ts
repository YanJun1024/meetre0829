import type { Familiarity, Note, RankedTag, Tag } from "@/types";

// =============================================================
// MeetRe 排名计算核心逻辑（v1.5 极简版）
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
}

export function calculateTagScore(tag: Tag, notes: Note[]): TagScoreResult {
  const tagNotes = notes.filter(
    (n) => n.tags.includes(tag.name) && !n.isDeleted
  );

  const noteCount = tagNotes.length;
  if (noteCount === 0) return { score: 0, noteCount: 0, lastTime: 0 };

  const lastTime = Math.max(...tagNotes.map((n) => n.createTime));

  return { score: noteCount, noteCount, lastTime };
}

export function computeRankedTags(
  tags: Tag[],
  notes: Note[],
  now: number = Date.now()
): RankedTag[] {
  // 休息到期后自动恢复参与排名（开发文档 3.4）：
  // 即使存储层 status 尚未写回 learning，显示层也按已恢复处理
  const activeTags = tags.filter(
    (t) =>
      t.status !== "mastered" &&
      !(t.status === "snoozed" && (t.snoozeExpireAt || 0) > now)
  );

  const scored = activeTags.map((tag) => {
    const { score, noteCount, lastTime } = calculateTagScore(tag, notes);
    return { ...tag, score, noteCount, lastTime };
  });

  // 笔记数量降序；次数相同按最近相遇时间降序
  const sorted = scored.sort(
    (a, b) => b.noteCount - a.noteCount || b.lastTime - a.lastTime
  );

  return sorted.map((tag, index) => ({
    ...tag,
    rank: index + 1,
    statusLevel: getStatusLevel(tag, now),
  }));
}

/** 状态灯：只看相遇次数和最近有没有翻回去看，不做熟悉度判断 */
export function getStatusLevel(
  tag: { score: number; lastReviewed?: number },
  now: number
): "red" | "yellow" | "green" {
  const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
  const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

  if (
    tag.score >= 3 &&
    (!tag.lastReviewed || tag.lastReviewed < threeDaysAgo)
  ) {
    return "red";
  }
  if (tag.lastReviewed && tag.lastReviewed >= twoDaysAgo) {
    return "green";
  }
  return "yellow";
}

/**
 * 有效熟悉度（v2.0 熟悉度自动降级 · 惰性显示层）
 * 存储值不动，仅展示时计算：
 * - 手动标记（familiaritySource === 'user'）永不自动降，原样返回
 * - 行为推断的标记，超过 30 天无互动逐级降档：🟢→🟡、🟡→🔴（🔴 到底）
 * - 互动 = 记新笔记 / 查词典 / 回看 / 标记本身，任何互动重置 30 天计时
 */
export function effectiveFamiliarity(
  tag: Tag,
  notes: Note[],
  now: number = Date.now()
): Familiarity | null {
  const fam = tag.familiarity;
  if (!fam || tag.familiaritySource === "user" || fam === "unfamiliar") {
    return fam;
  }

  const lastNoteTime = notes
    .filter((n) => n.tags.includes(tag.name) && !n.isDeleted)
    .reduce((max, n) => Math.max(max, n.createTime), 0);
  const lastInteraction = Math.max(
    lastNoteTime,
    tag.lastReviewed || 0,
    tag.familiarityUpdatedAt || 0
  );

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (now - lastInteraction < thirtyDays) return fam;
  return fam === "familiar" ? "fuzzy" : "unfamiliar";
}
