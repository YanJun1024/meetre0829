import type { Note, RankedTag, Tag } from "@/types";

// =============================================================
// MeetRe 排名计算核心逻辑（对应开发文档 3.1.5）
// =============================================================

export const RANK_CONFIG = {
  NOTE_WEIGHT: 1,
  DICT_LOOKUP_WEIGHT: 2,
  NOTE_REVIEW_WEIGHT: 1,
  DECAY_START_DAYS: 30,
  DECAY_MIN_FACTOR: 0.5,
  DECAY_RATE: 0.02,
  REMASTER_INIT_SCORE: 1,
} as const;

export const FAMILIARITY_WEIGHT = {
  unfamiliar: 1.5,
  fuzzy: 1.0,
  familiar: 0.3,
} as const;

export function calculateTagScore(
  tag: Tag,
  notes: Note[],
  now: number = Date.now()
): { score: number; noteCount: number } {
  const tagNotes = notes.filter(
    (n) => n.tags.includes(tag.name) && !n.isDeleted
  );

  const noteCount = tagNotes.length;
  if (noteCount === 0) return { score: 0, noteCount: 0 };

  let behaviorScore = 0;
  tagNotes.forEach((note) => {
    behaviorScore += RANK_CONFIG.NOTE_WEIGHT;
    behaviorScore += (note.dictLookups || 0) * RANK_CONFIG.DICT_LOOKUP_WEIGHT;
    behaviorScore += (note.noteReviews || 0) * RANK_CONFIG.NOTE_REVIEW_WEIGHT;
  });

  const lastActiveTime = Math.max(
    ...tagNotes.map((n) => n.createTime),
    tag.lastReviewed || 0
  );
  const daysSinceActive = (now - lastActiveTime) / (24 * 60 * 60 * 1000);

  let decayFactor = 1;
  if (daysSinceActive > RANK_CONFIG.DECAY_START_DAYS) {
    const decayDays = daysSinceActive - RANK_CONFIG.DECAY_START_DAYS;
    decayFactor = Math.max(
      RANK_CONFIG.DECAY_MIN_FACTOR,
      1 - decayDays * RANK_CONFIG.DECAY_RATE
    );
  }

  const familiarityFactor = tag.familiarity
    ? FAMILIARITY_WEIGHT[tag.familiarity] || 1.0
    : 1.0;

  return {
    score: behaviorScore * decayFactor * familiarityFactor,
    noteCount,
  };
}

export function computeRankedTags(
  tags: Tag[],
  notes: Note[],
  now: number = Date.now()
): RankedTag[] {
  // 「暂时不想看」7 天到期后自动恢复参与排名（开发文档 3.4）：
  // 即使存储层 status 尚未写回 learning，显示层也按已恢复处理
  const activeTags = tags.filter(
    (t) =>
      t.status !== "mastered" &&
      !(t.status === "snoozed" && (t.snoozeExpireAt || 0) > now)
  );

  const scored = activeTags.map((tag) => {
    const { score, noteCount } = calculateTagScore(tag, notes, now);
    return { ...tag, score, noteCount };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);

  return sorted.map((tag, index) => ({
    ...tag,
    rank: index + 1,
    statusLevel: getStatusLevel(tag, now),
  }));
}

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
