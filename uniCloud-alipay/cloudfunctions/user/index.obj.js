"use strict";
/**
 * MeetRe 用户云对象
 * 微信小程序静默登录：uni.login code → code2session → 查/建用户 → 签发 token
 * 客户端将 token 存入 uni_id_token 等存储键后，uniCloud SDK 会随每次调用自动上传
 */
const uniIdLite = require("uni-id-lite");
const config = require("./config.json");
const db = uniCloud.database();
const usersCol = db.collection("uni-id-users");
const notesCol = db.collection("notes");
const tagsCol = db.collection("tags");

module.exports = {
  _before() {},

  /**
   * 微信静默登录
   * @param {string} code uni.login 获取的临时凭证
   * 首次登录会把本机 local_user 的数据迁移到真实 uid（多设备下数据合并）
   */
  async loginByWeixin({ code } = {}) {
    if (!code) return { errCode: 1, errMsg: "缺少 code" };
    if (!config.wxSecret || config.wxSecret.indexOf("请填写") === 0) {
      return { errCode: 3, errMsg: "未配置 wxSecret（user/config.json）" };
    }

    const url =
      "https://api.weixin.qq.com/sns/jscode2session" +
      `?appid=${config.wxAppid}&secret=${config.wxSecret}` +
      `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const res = await uniCloud.httpclient.request(url, {
      method: "GET",
      dataType: "json",
    });
    const wx = res.data;
    if (!wx || !wx.openid) {
      return {
        errCode: 2,
        errMsg: `微信登录失败：${(wx && wx.errmsg) || "code2session 无响应"}`,
      };
    }

    // 查/建用户（uni-id-users 集合，兼容后续接入官方 uni-id）
    const openid = wx.openid;
    const found = await usersCol
      .where({ "wx_openid.mp-weixin": openid })
      .limit(1)
      .get();
    let uid;
    let nickname = "微信用户";
    if (found.data.length) {
      uid = found.data[0]._id;
      nickname = found.data[0].nickname || nickname;
    } else {
      const added = await usersCol.add({
        nickname,
        wx_openid: { "mp-weixin": openid },
        register_date: Date.now(),
      });
      uid = added.id;
    }

    // 数据迁移：登录前以 local_user 写入的本机数据归入当前用户
    await notesCol.where({ userId: "local_user" }).update({ userId: uid });
    await tagsCol.where({ userId: "local_user" }).update({ userId: uid });

    const { token, tokenExpired } = uniIdLite.createToken(uid);
    return { errCode: 0, token, tokenExpired, uid, nickname };
  },
};
