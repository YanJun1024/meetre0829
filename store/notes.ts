import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import type { Familiarity, Note, Tag, TagStatus } from "@/types";
import { computeRankedTags } from "@/utils/rank";
import { extractDefinition } from "@/utils/definition";

/** 从笔记内容中解析 #标签 */
export function parseTags(content: string): string[] {
  const matches = content.match(/#([^\s#]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
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

/** 云端文档（_id）→ 前端模型（id） */
function noteFromCloud(doc: Record<string, any>): Note {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Note;
}

function tagFromCloud(doc: Record<string, any>): Tag {
  const { _id, ...rest } = doc;
  return { ...rest } as Tag;
}

/** 云对象句柄 */
function notesApi(): any {
  // eslint-disable-next-line
  return uniCloud.importObject("notes");
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

  /** 最近标签快捷入口（3-5 个） */
  const recentTags = computed(() =>
    rankedTags.value.slice(0, 5).map((t) => t.name)
  );

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
        notes.value = cached.notes as Note[];
        tags.value = (cached.tags || []) as Tag[];
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
    const tagNames = new Set(tags.value.map((t) => t.name));
    const mergedTags = [...tags.value];
    for (const doc of cloudTags) {
      if (!tagNames.has(doc.name)) mergedTags.push(tagFromCloud(doc));
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
    const note: Note = {
      id: tempId,
      userId: "local_user",
      content,
      tags: tagName ? [tagName] : [],
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

    if (tagName && !tags.value.some((t) => t.name === tagName)) {
      tags.value.push(createTag(tagName));
    }
    const tag = tags.value.find((t) => t.name === tagName);
    if (tag && !tag.notes.includes(tempId)) {
      tag.notes.push(tempId);
    }

    // 云端写穿：成功后用云端 _id 替换临时 id
    notesApi()
      .addNote({ content, tag: tagName, scene, sceneType, images, audios })
      .then((res: { id: string }) => {
        cloudReady.value = true;
        note.id = res.id;
        if (tag) {
          const idx = tag.notes.indexOf(tempId);
          if (idx >= 0) tag.notes[idx] = res.id;
        }
      })
      .catch(warnOffline);
  }

  function setTagStatus(name: string, status: TagStatus) {
    const tag = tags.value.find((t) => t.name === name);
    if (!tag) return;
    tag.status = status;
    if (status === "mastered") {
      tag.masteredAt = Date.now();
      delete tag.snoozeExpireAt;
    } else if (status === "snoozed") {
      // 暂时不想看：7 天后自动恢复
      tag.snoozeExpireAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      delete tag.masteredAt;
    } else {
      delete tag.masteredAt;
      delete tag.snoozeExpireAt;
    }

    notesApi()
      .setTagStatus({ name, status })
      .then(() => {
        cloudReady.value = true;
      })
      .catch(warnOffline);
  }

  function removeTag(name: string) {
    tags.value = tags.value.filter((t) => t.name !== name);

    notesApi()
      .removeTag({ name })
      .then(() => {
        cloudReady.value = true;
      })
      .catch(warnOffline);
  }

  /** 行为数累加到标签最新一条笔记（求和 = 标签级行为数） */
  function bumpLatestNote(
    name: string,
    field: "dictLookups" | "noteReviews"
  ) {
    const latest = notes.value
      .filter((n) => n.tags.includes(name) && !n.isDeleted)
      .sort((a, b) => b.createTime - a.createTime)[0];
    if (latest) latest[field]++;
  }

  /** 应用云端推断结果（熟悉度 / 自动取消掌握） */
  function applyTagPatch(name: string, patch: Record<string, any>) {
    const tag = tags.value.find((t) => t.name === name);
    if (!tag || !patch) return;
    Object.assign(tag, patch);
    if (patch.status === "learning") delete tag.masteredAt;
  }

  /** 查词典行为（打开词典视图触发） */
  function recordLookup(name: string) {
    bumpLatestNote(name, "dictLookups");
    const tag = tags.value.find((t) => t.name === name);
    if (tag) {
      tag.lastReviewed = Date.now();
      // v2.0 熟悉度自动降级：标「熟」却查词典 → 降为有点印象（本地乐观更新）
      if (tag.familiarity === "familiar" && tag.familiaritySource !== "user") {
        tag.familiarity = "fuzzy";
        tag.familiaritySource = "behavior";
        tag.familiarityUpdatedAt = Date.now();
      }
    }

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
  function recordNoteReview(name: string) {
    bumpLatestNote(name, "noteReviews");
    const tag = tags.value.find((t) => t.name === name);
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
  function setUserDefinition(name: string, text: string, source: "auto" | "manual") {
    const tag = tags.value.find((t) => t.name === name);
    if (!tag) return;
    tag.userDefinition = { text, source, weak: false, updatedAt: Date.now() };

    notesApi()
      .setUserDefinition({ name, text, source })
      .then(() => {
        cloudReady.value = true;
      })
      .catch(warnOffline);
  }

  /** 保存后反馈：用户手动标记熟悉度（优先级高于行为推断） */
  function setFamiliarity(name: string, familiarity: Familiarity) {
    const tag = tags.value.find((t) => t.name === name);
    if (!tag) return;
    tag.familiarity = familiarity;
    tag.familiaritySource = "user";
    tag.familiarityUpdatedAt = Date.now();

    notesApi()
      .setFamiliarity({ name, familiarity })
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
  async function fetchSysDefinition(name: string) {
    const tag = tags.value.find((t) => t.name === name);
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
    addNote,
    setTagStatus,
    removeTag,
    recordLookup,
    recordNoteReview,
    setUserDefinition,
    setFamiliarity,
    fetchSysDefinition,
  };
});
