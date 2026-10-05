"use strict";
/**
 * MeetRe 用户云对象
 * 微信小程序静默登录：uni.login code → code2session → 查/建用户 → 签发 token
 * 客户端将 token 存入 uni_id_token 等存储键后，uniCloud SDK 会随每次调用自动上传
 * 资料保存 / 手机号绑定：依赖 _before 中通过 token 校验出的 this.userId
 */
const uniIdLite = require("uni-id-lite");
const config = require("./config.json");
const db = uniCloud.database();
const usersCol = db.collection("uni-id-users");
const notesCol = db.collection("notes");
const tagsCol = db.collection("tags");

/** 内存级 access_token 缓存（1.5h 内复用，过期自动换） */
let _tokenCache = { accessToken: "", expiresAt: 0 };

async function getWxAccessToken() {
  const now = Date.now();
  if (_tokenCache.accessToken && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.accessToken;
  }
  const url =
    "https://api.weixin.qq.com/cgi-bin/token" +
    `?grant_type=client_credential&appid=${config.wxAppid}` +
    `&secret=${config.wxSecret}`;
  const res = await uniCloud.httpclient.request(url, {
    method: "GET",
    dataType: "json",
    timeout: 6000,
  });
  const data = res.data || {};
  if (!data.access_token) {
    throw new Error(
      `获取 access_token 失败：${data.errmsg || JSON.stringify(data)}`
    );
  }
  _tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 7200) * 1000,
  };
  return _tokenCache.accessToken;
}

module.exports = {
  /**
   * 校验客户端 token 并挂到 this.userId：
   * - 有有效 token → this.userId = 真实 uid（saveProfile / bindMobile 用）
   * - 无 token / 过期 → this.userId = "local_user"（loginByWeixin 不需要它，会跳过）
   */
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

  /**
   * 微信静默登录
   * @param {string} code uni.login 获取的临时凭证
   * 首次登录会把本机 local_user 的数据迁移到真实 uid（多设备下数据合并）
   * 返回中同步携带已存的 avatar / mobile，便于前端登录后立刻显示
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
    let avatar = "";
    let mobile = "";
    if (found.data.length) {
      const doc = found.data[0];
      uid = doc._id;
      nickname = doc.nickname || nickname;
      avatar = doc.avatar || "";
      mobile = doc.mobile || "";
    } else {
      const added = await usersCol.add({
        nickname,
        avatar: "",
        mobile: "",
        wx_openid: { "mp-weixin": openid },
        register_date: Date.now(),
      });
      uid = added.id;
    }

    // 数据迁移：登录前以 local_user 写入的本机数据归入当前用户
    await notesCol.where({ userId: "local_user" }).update({ userId: uid });
    await tagsCol.where({ userId: "local_user" }).update({ userId: uid });

    const { token, tokenExpired } = uniIdLite.createToken(uid);
    return {
      errCode: 0,
      token,
      tokenExpired,
      uid,
      nickname,
      avatarUrl: avatar,
      mobileMasked:
        mobile && mobile.length >= 7
          ? mobile.slice(0, 3) + "****" + mobile.slice(-4)
          : "",
    };
  },

  /**
   * 保存昵称 / 头像：只能改当前登录用户
   * payload: { nickname?, avatar? (cloud:// fileID) }
   */
  async saveProfile(payload = {}) {
    const userId = this.userId;
    if (!userId || userId === "local_user") {
      return { errCode: 2, errMsg: "未登录" };
    }
    const update = {};
    if (typeof payload.nickname === "string" && payload.nickname) {
      update.nickname = String(payload.nickname).slice(0, 32);
    }
    if (typeof payload.avatar === "string") {
      if (!payload.avatar.startsWith("cloud://") && payload.avatar !== "") {
        return { errCode: 1, errMsg: "头像必须是 cloud:// fileID" };
      }
      update.avatar = payload.avatar.slice(0, 512);
    }
    if (!Object.keys(update).length) {
      return { errCode: 1, errMsg: "没有可保存的字段" };
    }
    await usersCol.doc(userId).update(update);
    return {
      errCode: 0,
      nickname: update.nickname !== undefined ? update.nickname : undefined,
      avatar: update.avatar !== undefined ? update.avatar : undefined,
    };
  },

  /**
   * 绑定手机号：前端 getPhoneNumber 按钮授权后的 code → 后端调用微信解密
   * - 成功：将明文 mobile 写入 uni-id-users，返回给前端（前端自己脱敏存）
   * - 失败 / 用户拒绝：返回对应错误码
   */
  async bindMobile({ code } = {}) {
    const userId = this.userId;
    if (!userId || userId === "local_user") {
      return { errCode: 2, errMsg: "未登录" };
    }
    if (!code || typeof code !== "string") {
      return { errCode: 1, errMsg: "缺少授权 code" };
    }
    try {
      const accessToken = await getWxAccessToken();
      const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
      const res = await uniCloud.httpclient.request(url, {
        method: "POST",
        contentType: "json",
        dataType: "json",
        data: { code },
        timeout: 8000,
      });
      const data = res.data || {};
      if (data.errcode !== 0) {
        // 常见错误码：-1 系统繁忙 / 100015 code无效 / 100018 code过期 / 40029 code无效
        return {
          errCode: 4,
          errMsg: `微信解密失败：${data.errmsg || "errcode=" + data.errcode}`,
        };
      }
      const phoneInfo = data.phone_info || {};
      const mobile = phoneInfo.phoneNumber || "";
      if (!mobile) {
        return { errCode: 5, errMsg: "手机号字段为空" };
      }
      await usersCol.doc(userId).update({ mobile });
      return { errCode: 0, mobile };
    } catch (e) {
      console.error("[user] bindMobile 异常：", e);
      return {
        errCode: 3,
        errMsg: `网络异常：${e && e.message ? e.message : String(e)}`,
      };
    }
  },
};
