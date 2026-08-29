"use strict";
// =============================================================
// MeetRe 笔记/标签 云对象
// 说明：
// 1. 云函数拥有数据库管理员权限，不受 schema permission 限制
// 2. _before 校验客户端 token（uni-id-lite），未登录/失效回退 local_user
// 3. 排名分由前端按开发文档 3.1.5 公式实时计算，云端只存原始数据
// =============================================================

const uniIdLite = require("uni-id-lite");

const db = uniCloud.database();
const dbCmd = db.command;
const notesCol = db.collection("notes");
const tagsCol = db.collection("tags");

const SNOOZE_DURATION = 7 * 24 * 60 * 60 * 1000; // 暂时不想看：7 天

module.exports = {
  /** 校验 token 并挂到 this.userId，供各方法直接读取 */
  _before() {
    let token = "";
    try {
      token = this.getUniIdToken() || "";
    } catch (e) {
      token = "";
    }
    const res = token ? uniIdLite.checkToken(token) : null;
    this.userId = res && res.errCode === 0 ? res.uid : "local_user";
  },

  /** 启动时拉取全部数据（笔记 + 标签），并处理暂不看到期恢复 */
  async loadAll() {
    const userId = this.userId;

    const tagsRes = await tagsCol.where({ userId }).limit(1000).get();

    // 「暂时不想看」到期自动恢复为学习中
    const now = Date.now();
    const expired = tagsRes.data.filter(
      (t) => t.status === "snoozed" && t.snoozeExpireAt && t.snoozeExpireAt <= now
    );
    if (expired.length) {
      await Promise.all(
        expired.map((t) =>
          tagsCol.doc(t._id).update({ status: "learning", snoozeExpireAt: null })
        )
      );
      expired.forEach((t) => {
        t.status = "learning";
        t.snoozeExpireAt = null;
      });
    }

    const notesRes = await notesCol
      .where({ userId, isDeleted: false })
      .orderBy("createTime", "desc")
      .limit(1000)
      .get();

    return { errCode: 0, notes: notesRes.data, tags: tagsRes.data };
  },

  /** 新增笔记（自动创建/关联标签），支持附件：images 字符串数组 / audios 对象数组 */
  async addNote({ content, tag, scene, sceneType, images, audios }) {
    const userId = this.userId;
    const now = Date.now();
    const tags = tag ? [tag] : [];

    // 附件白名单清洗（最多各 9 个，字段只保留必要项）
    const imgList = Array.isArray(images)
      ? images.filter((u) => typeof u === "string" && u).slice(0, 9)
      : [];
    const audList = Array.isArray(audios)
      ? audios
          .filter((a) => a && typeof a.cloudPath === "string" && a.cloudPath)
          .slice(0, 9)
          .map((a) => ({
            cloudPath: String(a.cloudPath).slice(0, 500),
            duration: Number(a.duration) || 0,
          }))
      : [];

    const res = await notesCol.add({
      userId,
      content,
      tags,
      scene: scene || "",
      sceneType: sceneType || "other",
      images: imgList,
      audios: audList,
      dictLookups: 0,
      noteReviews: 0,
      createTime: now,
      isDeleted: false,
    });

    if (tag) {
      const exist = await tagsCol.where({ userId, name: tag }).count();
      if (exist.total === 0) {
        await tagsCol.add({
          userId,
          name: tag,
          noteCount: 1,
          status: "learning",
          rankScore: 0,
          familiarity: null,
          userDefinition: null,
          notes: [res.id],
        });
      } else {
        await tagsCol.where({ userId, name: tag }).update({
          noteCount: dbCmd.inc(1),
          notes: dbCmd.push(res.id),
        });
      }
    }

    return { errCode: 0, id: res.id };
  },

  /** 更新标签状态：learning / mastered / snoozed */
  async setTagStatus({ name, status }) {
    const userId = this.userId;
    const now = Date.now();

    const update = { status };
    if (status === "mastered") {
      update.masteredAt = now;
      update.snoozeExpireAt = null;
    } else if (status === "snoozed") {
      update.snoozeExpireAt = now + SNOOZE_DURATION;
      update.masteredAt = null;
    } else {
      update.masteredAt = null;
      update.snoozeExpireAt = null;
    }

    await tagsCol.where({ userId, name }).update(update);
    return { errCode: 0 };
  },

  /** 删除标签（笔记保留，仅解除聚合） */
  async removeTag({ name }) {
    const userId = this.userId;
    await tagsCol.where({ userId, name }).remove();
    return { errCode: 0 };
  },

  /**
   * 复习行为埋点：action = "dict"（查词典）| "review"（回看笔记）
   * - 行为计数记到标签最新一条笔记（各笔记求和 = 标签级行为数，排名公式语义不变）
   * - v1.0 行为推断（开发文档 3.2）：
   *   记完 5 分钟内查词典 → 熟悉度=不熟；记完 5 分钟内回看 → 熟悉度=有点印象
   * - 已掌握后查词典 → 自动取消掌握，排名分清零（重新掌握从 0 开始）
   */
  async recordAction({ name, action }) {
    const userId = this.userId;
    const now = Date.now();
    const RECENT_ADD_WINDOW = 5 * 60 * 1000;

    // 最新一条未删除笔记
    const latestRes = await notesCol
      .where({ userId, tags: name, isDeleted: false })
      .orderBy("createTime", "desc")
      .limit(1)
      .get();
    const latestNote = latestRes.data[0];
    const recentAdd =
      latestNote && now - latestNote.createTime < RECENT_ADD_WINDOW;

    if (latestNote) {
      const field = action === "dict" ? "dictLookups" : "noteReviews";
      await notesCol.doc(latestNote._id).update({ [field]: dbCmd.inc(1) });
    }

    // 更新标签：lastReviewed / 熟悉度推断 / 自动取消掌握
    const tagRes = await tagsCol.where({ userId, name }).get();
    const tag = tagRes.data[0];
    let patch = {};
    if (tag) {
      patch = { lastReviewed: now };
      if (action === "dict" && tag.status === "mastered") {
        patch.status = "learning";
        patch.masteredAt = null;
        patch.rankScore = 0;
      }
      // 用户手动标记 > 行为推断（开发文档 3.2），手动标记后不再覆盖
      if (recentAdd && tag.familiaritySource !== "user") {
        patch.familiarity = action === "dict" ? "unfamiliar" : "fuzzy";
        patch.familiaritySource = "behavior";
        patch.familiarityUpdatedAt = now;
      } else if (
        action === "dict" &&
        tag.familiarity === "familiar" &&
        tag.familiaritySource !== "user"
      ) {
        // v2.0 熟悉度自动降级：标了「熟」却还要查词典 → 降为有点印象
        patch.familiarity = "fuzzy";
        patch.familiaritySource = "behavior";
        patch.familiarityUpdatedAt = now;
      }
      await tagsCol.doc(tag._id).update(patch);
    }

    return { errCode: 0, patch };
  },

  /** 保存用户释义（source: auto=采用自动提取 / manual=手动编辑） */
  async setUserDefinition({ name, text, source }) {
    const userId = this.userId;
    const userDefinition = {
      text,
      source: source === "auto" ? "auto" : "manual",
      weak: false,
      updatedAt: Date.now(),
    };
    await tagsCol
      .where({ userId, name })
      .update({ userDefinition });
    return { errCode: 0, userDefinition };
  },

  /**
   * 保存后反馈：用户手动标记熟悉度（开发文档 3.2.2 v1.5）
   * familiarity: familiar=能 / fuzzy=有点悬 / unfamiliar=不能
   * 手动标记优先级高于行为推断，不会被覆盖
   */
  async setFamiliarity({ name, familiarity }) {
    const userId = this.userId;
    if (!["unfamiliar", "fuzzy", "familiar"].includes(familiarity)) {
      return { errCode: 1, errMsg: "参数错误" };
    }
    await tagsCol.where({ userId, name }).update({
      familiarity,
      familiaritySource: "user",
      familiarityUpdatedAt: Date.now(),
    });
    return { errCode: 0 };
  },

  /** 迁移附件工具：整体替换笔记的 images/audios（白名单清洗，校验归属） */
  async updateNoteAttachments({ noteId, images, audios }) {
    const userId = this.userId;
    if (!noteId) return { errCode: 1, errMsg: "参数错误" };
    const imgList = Array.isArray(images)
      ? images.filter((u) => typeof u === "string" && u).slice(0, 9)
      : [];
    const audList = Array.isArray(audios)
      ? audios
          .filter((a) => a && typeof a.cloudPath === "string" && a.cloudPath)
          .slice(0, 9)
          .map((a) => ({
            cloudPath: String(a.cloudPath).slice(0, 500),
            duration: Number(a.duration) || 0,
          }))
      : [];
    const res = await notesCol
      .where({ _id: noteId, userId })
      .update({ images: imgList, audios: audList });
    return { errCode: 0, updated: res.updated || 0 };
  },

  /**
   * 一次性本地数据补传（换服务空间迁移用）：
   * - 笔记按 userId+createTime+content 指纹去重，幂等可重复触发
   * - 保留原始 createTime / 行为计数 / 附件引用
   * - 标签按 userId+name upsert，携带熟悉度/释义/状态等完整元数据
   * - 返回 idMap（旧本地id → 新云端_id），客户端据此重映射
   */
  async pushLocalData({ notes, tags }) {
    const userId = this.userId;
    const inputNotes = Array.isArray(notes) ? notes.slice(0, 1000) : [];
    const inputTags = Array.isArray(tags) ? tags.slice(0, 500) : [];

    const existRes = await notesCol.where({ userId }).limit(1000).get();
    const fingerprint = new Set(
      existRes.data.map((d) => `${d.createTime}|${d.content}`)
    );
    const idMap = {};
    let notesPushed = 0;

    for (const n of inputNotes) {
      if (!n || typeof n.content !== "string") continue;
      const fp = `${n.createTime}|${n.content}`;
      if (fingerprint.has(fp)) continue;
      const res = await notesCol.add({
        userId,
        content: n.content,
        tags: Array.isArray(n.tags) ? n.tags : [],
        scene: n.scene || "",
        sceneType: n.sceneType || "other",
        images: Array.isArray(n.images) ? n.images.slice(0, 9) : [],
        audios: Array.isArray(n.audios)
          ? n.audios
              .filter((a) => a && typeof a.cloudPath === "string")
              .slice(0, 9)
              .map((a) => ({
                cloudPath: String(a.cloudPath).slice(0, 500),
                duration: Number(a.duration) || 0,
              }))
          : [],
        dictLookups: Number(n.dictLookups) || 0,
        noteReviews: Number(n.noteReviews) || 0,
        createTime: Number(n.createTime) || Date.now(),
        isDeleted: !!n.isDeleted,
      });
      fingerprint.add(fp);
      if (n.id) idMap[n.id] = res.id;
      notesPushed++;
    }

    let tagsPushed = 0;
    for (const t of inputTags) {
      if (!t || !t.name) continue;
      const noteIds = (Array.isArray(t.notes) ? t.notes : [])
        .map((id) => idMap[id] || id)
        .filter((id) => typeof id === "string");
      const doc = {
        name: t.name,
        status: ["learning", "mastered", "snoozed"].includes(t.status)
          ? t.status
          : "learning",
        notes: noteIds,
        noteCount: noteIds.length,
        rankScore: Number(t.rankScore) || 0,
        familiarity: t.familiarity || null,
        userDefinition: t.userDefinition || null,
        sysDefinition: t.sysDefinition || null,
      };
      if (t.masteredAt) doc.masteredAt = Number(t.masteredAt);
      if (t.snoozeExpireAt) doc.snoozeExpireAt = Number(t.snoozeExpireAt);
      if (t.lastReviewed) doc.lastReviewed = Number(t.lastReviewed);
      if (t.familiaritySource) doc.familiaritySource = t.familiaritySource;
      if (t.familiarityUpdatedAt)
        doc.familiarityUpdatedAt = Number(t.familiarityUpdatedAt);

      const exist = await tagsCol.where({ userId, name: t.name }).get();
      if (exist.data.length) {
        await tagsCol.doc(exist.data[0]._id).update(doc);
      } else {
        await tagsCol.add({ userId, ...doc });
      }
      tagsPushed++;
    }

    return { errCode: 0, notesPushed, tagsPushed, idMap };
  },

  /**
   * 系统释义兜底（开发文档 3.6.2 第二层，v1.5）
   * 英文词走 dictionaryapi.dev 免费词典 API，取回后缓存到标签；失败/中文返回 null 退回空状态
   */
  async getSysDefinition({ name }) {
    const userId = this.userId;
    const tagRes = await tagsCol.where({ userId, name }).get();
    const tag = tagRes.data[0];
    if (tag && tag.sysDefinition) {
      return { errCode: 0, sysDefinition: tag.sysDefinition };
    }
    // 仅支持纯英文词
    if (!/^[a-zA-Z][a-zA-Z'-]*$/.test(name || "")) {
      return { errCode: 0, sysDefinition: null };
    }
    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(name.toLowerCase())}`;
      const res = await uniCloud.httpclient.request(url, {
        method: "GET",
        dataType: "json",
        timeout: 5000,
      });
      const entry = Array.isArray(res.data) ? res.data[0] : null;
      const meaning = entry && entry.meanings && entry.meanings[0];
      const def = meaning && meaning.definitions && meaning.definitions[0];
      if (!def || !def.definition) {
        return { errCode: 0, sysDefinition: null };
      }
      const sysDefinition = {
        text: def.definition,
        pos: meaning.partOfSpeech || "",
        source: "dictionaryapi.dev",
        updatedAt: Date.now(),
      };
      if (tag) await tagsCol.doc(tag._id).update({ sysDefinition });
      return { errCode: 0, sysDefinition };
    } catch (e) {
      // 兜底失败退回空状态，不报错
      return { errCode: 0, sysDefinition: null };
    }
  },
};
