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
  familiarityUpdatedAt?: number;
  userDefinition: UserDefinition | null;
}

export interface RankedTag extends Tag {
  rank: number;
  score: number;
  noteCount: number;
  statusLevel: "red" | "yellow" | "green";
}
