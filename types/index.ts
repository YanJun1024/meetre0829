/** 熟悉度：不熟 / 有点印象 / 熟 */
export type Familiarity = "unfamiliar" | "fuzzy" | "familiar";

/** 标签状态：学习中 / 已掌握 / 暂时不想看 */
export type TagStatus = "learning" | "mastered" | "snoozed";

export interface Note {
  id: string;
  userId: string;
  content: string;
  tags: string[];
  scene: string;
  sceneType: string;
  images: string[];
  audios: { cloudPath: string; duration: number }[];
  dictLookups: number;
  noteReviews: number;
  createTime: number;
  isDeleted: boolean;
}

export interface UserDefinition {
  text: string;
  source: "auto" | "manual";
  weak: boolean;
  updatedAt: number;
}

export interface Tag {
  name: string;
  status: TagStatus;
  masteredAt?: number;
  snoozeExpireAt?: number;
  lastReviewed?: number;
  notes: string[];
  rankScore: number;
  familiarity: Familiarity | null;
  /** 熟悉度来源：behavior=行为推断 / user=保存后反馈手动选择（优先级更高） */
  familiaritySource?: "behavior" | "user";
  familiarityUpdatedAt?: number;
  userDefinition: UserDefinition | null;
  /** 系统释义（第二层兜底，云端词典 API，取回后缓存） */
  sysDefinition?: {
    text: string;
    pos?: string;
    source: string;
    updatedAt: number;
  } | null;
}

export interface RankedTag extends Tag {
  rank: number;
  score: number;
  noteCount: number;
  /** 最近相遇时间（最后一笔笔记的时间，无笔记为 0） */
  lastTime: number;
  statusLevel: "red" | "yellow" | "green";
}
