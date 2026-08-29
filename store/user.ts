import { defineStore } from "pinia";
import { ref } from "vue";

// =============================================================
// 用户会话：微信小程序静默登录（uni.login code → 云对象 user）
// token 存入 uni_id_token 等官方键，uniCloud SDK 随每次调用自动上传
// =============================================================

const TOKEN_KEY = "uni_id_token";
const EXPIRED_KEY = "uni_id_token_expired";
const UID_KEY = "uni_id_token_uid";
const NICK_KEY = "meetre_nickname";

/** 云对象句柄（customUI：静默登录失败不弹 SDK 默认错误框） */
function userApi(): any {
  // eslint-disable-next-line
  return uniCloud.importObject("user", { customUI: true });
}

/** uni.login 取 code（回调包 Promise，兼容各版本 API） */
function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: "weixin",
      success: (res: any) => resolve(res.code || ""),
      fail: (err: any) => reject(err),
    });
  });
}

export const useUserStore = defineStore("user", () => {
  const uid = ref("");
  const nickname = ref("");
  const loggedIn = ref(false);

  /**
   * 静默登录：有未过期 token 直接复用；否则重新换 code 登录
   * @returns 是否已登录（失败时调用方仍可用本地模式）
   */
  async function ensureLogin(): Promise<boolean> {
    const token = uni.getStorageSync(TOKEN_KEY);
    const expired = uni.getStorageSync(EXPIRED_KEY) || 0;
    if (token && expired > Date.now()) {
      uid.value = uni.getStorageSync(UID_KEY) || "";
      nickname.value = uni.getStorageSync(NICK_KEY) || "微信用户";
      loggedIn.value = true;
      return true;
    }

    try {
      const code = await wxLoginCode();
      if (!code) throw new Error("uni.login 未返回 code");
      const res = await userApi().loginByWeixin({ code });
      if (res.errCode !== 0) throw new Error(res.errMsg || "登录失败");

      uni.setStorageSync(TOKEN_KEY, res.token);
      uni.setStorageSync(EXPIRED_KEY, res.tokenExpired);
      uni.setStorageSync(UID_KEY, res.uid);
      uni.setStorageSync(NICK_KEY, res.nickname || "微信用户");
      uid.value = res.uid;
      nickname.value = res.nickname || "微信用户";
      loggedIn.value = true;
      console.log("[user] 静默登录成功", res.uid);
      return true;
    } catch (e) {
      console.warn("[user] 静默登录失败，当前为本地模式：", e);
      return false;
    }
  }

  return { uid, nickname, loggedIn, ensureLogin };
});
