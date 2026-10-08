import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import type { Note, Tag, TagStatus } from "@/types";
import { computeRankedTags } from "@/utils/rank";
import { extractDefinition } from "@/utils/definition";
import { logReview } from "@/utils/review-log";

/**
 * 单词归一（v1.6 单词去重逻辑）：
 * 不区分大小写，统一转成小写存储和比较（Apple = apple）。
 * 内部空格压缩为单个空格。
 */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 从笔记内容中解析 #标签（统一小写，兼容历史正文写法） */
export function parseTags(content: string): string[] {
  const matches = content.match(/#([^\s#]+)/g) || [];
  return [...new Set(matches.map((m) => normalizeWord(m.slice(1))))];
}

/** 大小写不敏感地查找标签（Apple 能命中 apple） */
export function findTagCI(tags: Tag[], name: string): Tag | undefined {
  const lower = normalizeWord(name);
  return tags.find((t) => t.name.toLowerCase() === lower);
}

function createTag(name: string): Tag {
  return {
    name,
    status: "learning",
    notes: [],
    rankScore: 0,
    familiarity: null,
    userDefinition: null,
  };
}

/** 云端文档（_id）→ 前端模型（id）；标签名统一小写（v1.6 Apple=apple） */
function noteFromCloud(doc: Record<string, any>): Note {
  const { _id, tags, ...rest } = doc;
  return {
    id: _id,
    tags: Array.isArray(tags) ? tags.map((t: string) => normalizeWord(t)) : [],
    ...rest,
  } as Note;
}

function tagFromCloud(doc: Record<string, any>): Tag {
  const { _id, name, ...rest } = doc;
  return { name: normalizeWord(name), ...rest } as Tag;
}

/** 云对象句柄（customUI：云调用失败不弹 SDK 默认错误框，由业务层 warnOffline 统一静默降级） */
function notesApi(): any {
  // eslint-disable-next-line
  return uniCloud.importObject("notes", { customUI: true });
}

export const useNotesStore = defineStore("notes", () => {
  const notes = ref<Note[]>([]);
  const tags = ref<Tag[]>([]);
  const loading = ref(false);
  /** 云端是否可用；失败时自动回退本地模式，数据不丢失 */
  const cloudReady = ref(false);
  let offlineToastShown = false;

  /** 参与排名的标签列表（按排名分降序） */
  const rankedTags = computed(() => computeRankedTags(tags.value, notes.value));

  /** 最近标签快捷入口（3-5 个）：按最近活跃（复习/记录）时间降序，而非排名分（开发文档 2.1） */
  const recentTags = computed(() => {
    const lastActive = (name: string): number => {
      const tag = tags.value.find((t) => t.name === name);
      const latestNote = notes.value
        .filter((n) => n.tags.includes(name) && !n.isDeleted)
        .sort((a, b) => b.createTime - a.createTime)[0];
      return Math.max(tag?.lastReviewed || 0, latestNote?.createTime || 0);
    };
    return rankedTags.value
      .map((t) => t.name)
      .sort((a, b) => lastActive(b) - lastActive(a))
      .slice(0, 5);
  });

  const masteredTags = computed(() =>
    tags.value.filter((t) => t.status === "mastered")
  );

  function warnOffline(e: unknown) {
    cloudReady.value = false;
    if (!offlineToastShown) {
      offlineToastShown = true;
      uni.showToast({ title: "云端连接失败，当前为本地模式", icon: "none" });
    }
    console.warn("[notes] 云端操作失败：", e);
  }

  /** 行为上报节流：同一标签同一行为 60s 内只写云端一次（省读库配额；本地计数不受影响） */
  const lastActionReport = new Map<string, number>();
  function shouldReport(name: string, action: string) {
    const key = `${action}:${name}`;
    const now = Date.now();
    if (now - (lastActionReport.get(key) || 0) < 60_000) return false;
    lastActionReport.set(key, now);
    return true;
  }

  /** ---------- 设备本地持久化 + 每日一次云端同步（省读库配额） ---------- */
  const CACHE_KEY = "meetre_notes_cache_v1";
  const SYNC_DAY_KEY = "meetre_last_sync_day";

  function dayKey(ts = Date.now()) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /** 启动时从设备缓存秒恢复，返回是否有缓存 */
  function restoreLocal(): boolean {
    try {
      const cached = uni.getStorageSync(CACHE_KEY);
      if (cached && Array.isArray(cached.notes)) {
        // v1.6：历史缓存里的标签名/笔记 tags 统一归一为小写（Apple → apple）
        notes.value = (cached.notes as Note[]).map((n) => ({
          ...n,
          tags: Array.isArray(n.tags)
            ? n.tags.map((t) => normalizeWord(t))
            : [],
        }));
        tags.value = ((cached.tags || []) as Tag[]).map((t) => ({
          ...t,
          name: normalizeWord(t.name),
        }));
        return notes.value.length > 0 || tags.value.length > 0;
      }
    } catch (e) {
      console.warn("[notes] 本地缓存恢复失败", e);
    }
    return false;
  }

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  function persistLocal() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try {
        uni.setStorageSync(CACHE_KEY, {
          notes: notes.value,
          tags: tags.value,
        });
      } catch (e) {
        console.warn("[notes] 本地缓存写入失败", e);
      }
    }, 300);
  }
  watch([notes, tags], persistLocal, { deep: true });

  /** 云端数据只补本地缺失的记录（本地直通写入更新，不覆盖本地） */
  function mergeCloudData(cloudNotes: Record<string, any>[], cloudTags: Record<string, any>[]) {
    const noteIds = new Set(notes.value.map((n) => n.id));
    const mergedNotes = [...notes.value];
    for (const doc of cloudNotes) {
      if (!noteIds.has(doc._id)) mergedNotes.push(noteFromCloud(doc));
    }
    const tagNames = new Set(tags.value.map((t) => normalizeWord(t.name)));
    const mergedTags = [...tags.value];
    for (const doc of cloudTags) {
      const normalized = normalizeWord(doc.name);
      if (!tagNames.has(normalized)) {
        tagNames.add(normalized);
        mergedTags.push(tagFromCloud(doc));
      }
    }
    notes.value = mergedNotes;
    tags.value = mergedTags;
  }

  /** 启动同步：本地缓存秒开；当天已同步过则 0 读库，否则云端补缺一次 */
  async function loadAll() {
    const hasCache = restoreLocal();
    if (hasCache && uni.getStorageSync(SYNC_DAY_KEY) === dayKey()) {
      cloudReady.value = true;
      return;
    }
    loading.value = !hasCache;
    try {
      const res = await notesApi().loadAll();
      mergeCloudData(res.notes || [], res.tags || []);
      cloudReady.value = true;
      uni.setStorageSync(SYNC_DAY_KEY, dayKey());
    } catch (e) {
      warnOffline(e);
    } finally {
      loading.value = false;
    }
  }

  function addNote(
    content: string,
    tagName: string,
    scene: string,
    sceneType: string,
    images: string[] = [],
    audios: { cloudPath: string; duration: number }[] = []
  ) {
    const now = Date.now();
    const tempId = `local_${now}`;
    // v1.6：单词统一小写存储（Apple = apple）
    const normalizedTag = tagName ? normalizeWord(tagName) : "";
    const note: Note = {
      id: tempId,
      userId: "local_user",
      content,
      tags: normalizedTag ? [normalizedTag] : [],
      scene,
      sceneType,
      images,
      audios,
      dictLookups: 0,
      noteReviews: 0,
      createTime: now,
      isDeleted: false,
    };
    notes.value.push(note);

    if (normalizedTag && !findTagCI(tags.value, normalizedTag)) {
      tags.value.push(createTag(normalizedTag));
    }
    const tag = findTagCI(tags.value, normalizedTag);
    if (tag && !tag.notes.includes(tempId)) {
      tag.notes.push(tempId);
    }

    // 自动提取释义落库（开发文档 3.6.5 入口二的数据来源）：
    // 仅规则 1/2（明确释义句式）才写入 userDefinition；rule 3 兜底整句
    // 只在阅读时实时展示，不作为「你的理解」保存
    let autoDef: { name: string; text: string } | null = null;
    if (tag && !tag.userDefinition?.text) {
      const extracted = extractDefinition(normalizedTag, notes.value);
      if (extracted && extracted.rule !== 3 && extracted.text) {
        setUserDefinition(normalizedTag, extracted.text, "auto");
        autoDef = { name: normalizedTag, text: extracted.text };
      }
    }

    // 云端写穿：成功后用云端 _id 替换临时 id
    notesApi()
      .addNote({ content, tag: normalizedTag, scene, sceneType, images, audios })
      .then((res: { id: string }) => {
        cloudReady.value = true;
        note.id = res.id;
        if (tag) {
          const idx = tag.notes.indexOf(tempId);
          if (idx >= 0) tag.notes[idx] = res.id;
        }
      })
      .catch(warnOffline);

    return autoDef;
  }

  function setTagStatus(name: string, status: TagStatus, snoozeDays = 7) {
    const norm = normalizeWord(name);
    const tag = findTagCI(tags.value, norm);
    if (!tag) return;
    tag.status = status;
    if (status === "mastered") {
      tag.masteredAt = Date.now();
      delete tag.snoozeExpireAt;
    } else if (status === "snoozed") {
      // 休息中：到期自动回到活跃列表（v1.6 支持一天 / 三天 / 一周）
      tag.snoozeExpireAt =
        Date.now() + snoozeDays * 24 * 60 * 60 * 1000;
      delete tag.masteredAt;
    } else {
      delete tag.masteredAt;
      delete tag.snoozeExpireAt;
    }

    notesApi()
      .setTagStatus({ name: norm, status })
      .then(() => {
        cloudReady.value = true;
      })
      .catch(warnOffline);
  }

  /**
   * 「休息中」到期持久恢复：
   * rank.ts 已做显示层惰性放行，这里负责把存储层 status 写回 learning
   */
  function restoreExpiredSnoozes() {
    const now = Date.now();
    for (const tag of tags.value) {
      if (
        tag.status === "snoozed" &&
        tag.snoozeExpireAt &&
        tag.snoozeExpireAt <= now
      ) {
        tag.status = "learning";
        delete tag.snoozeExpireAt;
        notesApi()
          .setTagStatus({ name: tag.name, status: "learning" })
          .then(() => {
            cloudReady.value = true;
          })
          .catch(warnOffline);
      }
    }
  }

  function removeTag(name: string) {
    const norm = normalizeWord(name);
    tags.value = tags.value.filter((t) => normalizeWord(t.name) !== norm);

    notesApi()
      .removeTag({ name: norm })
      .then(() => {
        cloudReady.value = true;
      })
      .catch(warnOffline);
  }

  /** 行为数累加到标签最新一条笔记（求和 = 标签级行为数） */
  function bumpLatestNote(
    rawName: string,
    field: "dictLookups" | "noteReviews"
  ) {
    const name = normalizeWord(rawName);
    const latest = notes.value
      .filter((n) => n.tags.includes(name) && !n.isDeleted)
      .sort((a, b) => b.createTime - a.createTime)[0];
    if (latest) latest[field]++;
  }

  /** 应用云端回写结果（如自动取消掌握） */
  function applyTagPatch(rawName: string, patch: Record<string, any>) {
    const tag = findTagCI(tags.value, rawName);
    if (!tag || !patch) return;
    // v1.6 客户端不展示熟悉度，云端即使回写也忽略相关字段
    delete patch.familiarity;
    delete patch.familiaritySource;
    delete patch.familiarityUpdatedAt;
    Object.assign(tag, patch);
    if (patch.status === "learning") delete tag.masteredAt;
  }

  /** 查词典行为（打开词典视图触发） */
  function recordLookup(rawName: string) {
    const name = normalizeWord(rawName);
    bumpLatestNote(name, "dictLookups");
    logReview("dict"); // 按天聚合，供「我的」页近7天趋势图
    const tag = findTagCI(tags.value, name);
    if (tag) tag.lastReviewed = Date.now();

    if (shouldReport(name, "dict")) {
      notesApi()
        .recordAction({ name, action: "dict" })
        .then((res: { patch: Record<string, any> }) => {
          cloudReady.value = true;
          applyTagPatch(name, res.patch);
        })
        .catch(warnOffline);
    }
  }

  /** 回看笔记行为（打开笔记视图触发） */
  function recordNoteReview(rawName: string) {
    const name = normalizeWord(rawName);
    bumpLatestNote(name, "noteReviews");
    logReview("review"); // 按天聚合，供「我的」页近7天趋势图
    const tag = findTagCI(tags.value, name);
    if (tag) tag.lastReviewed = Date.now();

    if (shouldReport(name, "review")) {
      notesApi()
        .recordAction({ name, action: "review" })
        .then((res: { patch: Record<string, any> }) => {
          cloudReady.value = true;
          applyTagPatch(name, res.patch);
        })
        .catch(warnOffline);
    }
  }

  /** 保存用户释义（source: auto=采用自动提取 / manual=手动编辑） */
  function setUserDefinition(rawName: string, text: string, source: "auto" | "manual") {
    const name = normalizeWord(rawName);
    const tag = findTagCI(tags.value, name);
    if (!tag) return;
    tag.userDefinition = { text, source, weak: false, updatedAt: Date.now() };

    notesApi()
      .setUserDefinition({ name, text, source })
      .then(() => {
        cloudReady.value = true;
      })
      .catch(warnOffline);
  }

  /** 系统释义查询中（记录当前标签名） */
  const sysDefLoading = ref("");

  /**
   * 系统释义兜底（v1.5 3.6.2 第二层）：
   * 仅当用户释义/自动提取都没有时才请求云端词典，取回后缓存到标签
   */
  async function fetchSysDefinition(rawName: string) {
    const name = normalizeWord(rawName);
    const tag = findTagCI(tags.value, name);
    if (!tag || tag.userDefinition?.text || tag.sysDefinition) return;
    if (extractDefinition(name, notes.value)?.text) return; // 第一层已覆盖
    if (sysDefLoading.value === name) return;
    sysDefLoading.value = name;
    try {
      const res = await notesApi().getSysDefinition({ name });
      if (res.sysDefinition) {
        tag.sysDefinition = res.sysDefinition;
      }
      cloudReady.value = true;
    } catch (e) {
      warnOffline(e);
    } finally {
      sysDefLoading.value = "";
    }
  }

  return {
    notes,
    tags,
    loading,
    cloudReady,
    sysDefLoading,
    rankedTags,
    recentTags,
    masteredTags,
    loadAll,
    restoreExpiredSnoozes,
    addNote,
    setTagStatus,
    removeTag,
    recordLookup,
    recordNoteReview,
    setUserDefinition,
    fetchSysDefinition,
  };
});
