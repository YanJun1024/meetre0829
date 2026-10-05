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
const reviewLogsCol = db.collection("review_logs");

const SNOOZE_DURATION = 7 * 24 * 60 * 60 * 1000; // 暂时不想看：7 天
const REMASTER_INIT_SCORE = 1; // 退出已掌握后的初始排名分（开发文档 3.1.5）
const REVIEW_KEEP_DAYS = 7; // 复习日志云端保留天数

/** 复习日志：按天取 MAX 合并（防重复累加，支持跨设备），并裁至近 N 天 */
function mergePruneReviewLog(existing = {}, incoming = {}, now = Date.now()) {
  const keep = new Set();
  for (let i = 0; i < REVIEW_KEEP_DAYS; i++) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    keep.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  }
  const days = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const out = {};
  for (const k of days) {
    if (!keep.has(k)) continue;
    const e = existing[k] || { dict: 0, review: 0 };
    const i = incoming[k] || { dict: 0, review: 0 };
    out[k] = {
      dict: Math.max(Number(e.dict) || 0, Number(i.dict) || 0),
      review: Math.max(Number(e.review) || 0, Number(i.review) || 0),
    };
  }
  return out;
}

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

  /** 更新标签状态：learning / mastered / snoozed；reset=退出已掌握，从 0 开始 */
  async setTagStatus({ name, status, reset }) {
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

    // 开发文档 3.3.2：退出「已掌握」→ 从 0 开始（清空熟悉度，排名分回初始值）
    if (reset && status === "learning") {
      update.familiarity = null;
      update.familiarityUpdatedAt = now;
      update.rankScore = REMASTER_INIT_SCORE;
      update.familiaritySource = null;
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

  // =============================================================
  // 复习日志（近7天趋势图）云备份
  // =============================================================

  /** 拉取用户复习日志（已裁至近 7 天） */
  async getReviewLog() {
    const userId = this.userId;
    const res = await reviewLogsCol.where({ userId }).limit(1).get();
    const doc = res.data[0];
    const log = mergePruneReviewLog(doc?.log || {}, {});
    return { errCode: 0, log };
  },

  /**
   * 推送本地日志并合并：
   * - 按天按字段取 MAX（防重复推送导致重复计数；另一设备更高的值自然胜出）
   * - 裁至近 7 天
   * - 返回合并后的权威日志，供前端回写本地缓存
   */
  async pushReviewLog({ log }) {
    const userId = this.userId;
    const now = Date.now();
    const existingRes = await reviewLogsCol.where({ userId }).limit(1).get();
    const existing = existingRes.data[0];
    const merged = mergePruneReviewLog(existing?.log || {}, log || {}, now);

    if (existing) {
      await reviewLogsCol.doc(existing._id).update({ log: merged, updatedAt: now });
    } else {
      await reviewLogsCol.add({ userId, log: merged, createdAt: now, updatedAt: now });
    }
    return { errCode: 0, log: merged };
  },
};
