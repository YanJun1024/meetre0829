"use strict";
// =============================================================
// MeetRe 笔记/标签 云对象
// 说明：
// 1. 云函数拥有数据库管理员权限，不受 schema permission 限制
// 2. uni-id 未接入前使用临时用户标识，接入后在此校验 token 换取真实 uid
// 3. 排名分由前端按开发文档 3.1.5 公式实时计算，云端只存原始数据
// =============================================================

const db = uniCloud.database();
const dbCmd = db.command;
const notesCol = db.collection("notes");
const tagsCol = db.collection("tags");

const SNOOZE_DURATION = 7 * 24 * 60 * 60 * 1000; // 暂时不想看：7 天

/** 获取当前用户标识（TODO: uni-id 接入后校验 token，返回 auth.uid） */
function getUserId() {
  return "local_user";
}

module.exports = {
  _before() {},

  /** 启动时拉取全部数据（笔记 + 标签），并处理暂不看到期恢复 */
  async loadAll() {
    const userId = getUserId();

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

  /** 新增笔记（自动创建/关联标签） */
  async addNote({ content, tag, scene, sceneType }) {
    const userId = getUserId();
    const now = Date.now();
    const tags = tag ? [tag] : [];

    const res = await notesCol.add({
      userId,
      content,
      tags,
      scene: scene || "",
      sceneType: sceneType || "other",
      images: [],
      audios: [],
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
    const userId = getUserId();
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
    const userId = getUserId();
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
    const userId = getUserId();
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
      if (recentAdd) {
        patch.familiarity = action === "dict" ? "unfamiliar" : "fuzzy";
        patch.familiarityUpdatedAt = now;
      }
      await tagsCol.doc(tag._id).update(patch);
    }

    return { errCode: 0, patch };
  },

  /** 保存用户释义（source: auto=采用自动提取 / manual=手动编辑） */
  async setUserDefinition({ name, text, source }) {
    const userId = getUserId();
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
};
