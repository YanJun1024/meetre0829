import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Note, Tag, TagStatus } from "@/types";
import { computeRankedTags } from "@/utils/rank";

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

  /** 启动时从云端拉取全部数据 */
  async function loadAll() {
    loading.value = true;
    try {
      const res = await notesApi().loadAll();
      notes.value = (res.notes || []).map(noteFromCloud);
      tags.value = (res.tags || []).map(tagFromCloud);
      cloudReady.value = true;
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
    sceneType: string
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
      images: [],
      audios: [],
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
      .addNote({ content, tag: tagName, scene, sceneType })
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
    if (tag) tag.lastReviewed = Date.now();

    notesApi()
      .recordAction({ name, action: "dict" })
      .then((res: { patch: Record<string, any> }) => {
        cloudReady.value = true;
        applyTagPatch(name, res.patch);
      })
      .catch(warnOffline);
  }

  /** 回看笔记行为（打开笔记视图触发） */
  function recordNoteReview(name: string) {
    bumpLatestNote(name, "noteReviews");
    const tag = tags.value.find((t) => t.name === name);
    if (tag) tag.lastReviewed = Date.now();

    notesApi()
      .recordAction({ name, action: "review" })
      .then((res: { patch: Record<string, any> }) => {
        cloudReady.value = true;
        applyTagPatch(name, res.patch);
      })
      .catch(warnOffline);
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

  return {
    notes,
    tags,
    loading,
    cloudReady,
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
  };
});
