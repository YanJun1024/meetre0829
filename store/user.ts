import { defineStore } from "pinia";
import { ref } from "vue";

// =============================================================
// 用户会话：微信小程序静默登录（uni.login code → 云对象 user）
// token 存入 uni_id_token 等官方键，uniCloud SDK 随每次调用自动上传
// 资料：avatarUrl（云端 fileID）/ nickname / mobile（脱敏展示用）
// =============================================================

const TOKEN_KEY = "uni_id_token";
const EXPIRED_KEY = "uni_id_token_expired";
const UID_KEY = "uni_id_token_uid";
const NICK_KEY = "meetre_nickname";
const AVATAR_KEY = "meetre_avatar";
const MOBILE_KEY = "meetre_mobile"; // 存脱敏后的 138****1234，避免明文手机号落本地

/** 云对象句柄（customUI：静默登录失败不弹 SDK 默认错误框） */
export function userApi(): any {
  // eslint-disable-next-line
  return uniCloud.importObject("user", { customUI: true });
}

/**
 * uni.login 取 code（回调包 Promise，兼容各版本 API）
 * 8s 超时兜底：隐私授权弹窗无人消费 / 网络挂起时，uni.login 可能既不 success 也不 fail，
 * 超时后 reject，保证启动流程不会永久卡死（调用方 catch 后降级本地模式）
 */
function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("uni.login 超时"));
    }, 8000);
    uni.login({
      provider: "weixin",
      success: (res: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(res.code || "");
      },
      fail: (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

/** 手机号脱敏：13812341234 → 138****1234 */
export function maskMobile(mobile: string): string {
  if (!mobile || mobile.length < 7) return "";
  return mobile.slice(0, 3) + "****" + mobile.slice(-4);
}

/** 上传本地图片到云存储，返回 cloud:// fileID */
export function uploadAvatar(tempFilePath: string, uid: string): Promise<string> {
  const ext =
    tempFilePath.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const cloudPath = `avatar/${uid || "local_user"}/${Date.now()}_${Math.floor(
    Math.random() * 1e6
  )}.${safeExt}`;
  return new Promise<string>((resolve, reject) => {
    // eslint-disable-next-line
    uniCloud.uploadFile({
      filePath: tempFilePath,
      cloudPath,
      success: (res: any) => resolve(res.fileID),
      fail: (err: any) => reject(err),
    } as any);
  });
}

/**
 * 把 cloud:// fileID 解析为真机可渲染的 https 临时 URL
 * - 开发者工具里 cloud:// 可直接渲染，真机需要这一步
 */
export function resolveTempUrl(fileID: string): Promise<string> {
  if (!fileID || !fileID.startsWith("cloud://")) return Promise.resolve(fileID);
  return new Promise((resolve) => {
    // eslint-disable-next-line
    uniCloud.getTempFileURL({
      fileList: [fileID],
      success: (res: any) => {
        const item = (res.fileList || [])[0];
        resolve(item?.tempFileURL || item?.download_url || fileID);
      },
      fail: () => resolve(fileID),
    } as any);
  });
}

export const useUserStore = defineStore("user", () => {
  const uid = ref("");
  const nickname = ref("");
  const avatarUrl = ref(""); // cloud:// fileID，展示时转 https 临时 URL
  const mobileMasked = ref(""); // 脱敏展示用，不存明文
  const loggedIn = ref(false);

  /** 从本地缓存恢复资料字段（登录/未登录状态下都可用） */
  function restoreFromCache() {
    nickname.value = uni.getStorageSync(NICK_KEY) || "";
    avatarUrl.value = uni.getStorageSync(AVATAR_KEY) || "";
    mobileMasked.value = uni.getStorageSync(MOBILE_KEY) || "";
  }

  /** 把资料字段写入本地缓存（供下次启动立即显示） */
  function persistCache() {
    if (nickname.value) uni.setStorageSync(NICK_KEY, nickname.value);
    if (avatarUrl.value) uni.setStorageSync(AVATAR_KEY, avatarUrl.value);
    if (mobileMasked.value) uni.setStorageSync(MOBILE_KEY, mobileMasked.value);
  }

  /** 启动时先秒级回填缓存，避免依赖云端 */
  restoreFromCache();

  /**
   * 静默登录：有未过期 token 直接复用；否则重新换 code 登录
   * @returns 是否已登录（失败时调用方仍可用本地模式）
   */
  async function ensureLogin(): Promise<boolean> {
    const token = uni.getStorageSync(TOKEN_KEY);
    const expired = uni.getStorageSync(EXPIRED_KEY) || 0;
    if (token && expired > Date.now()) {
      uid.value = uni.getStorageSync(UID_KEY) || "";
      restoreFromCache();
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
      uid.value = res.uid;
      // 登录返回 nickname 以云端为准，本地已有的 avatarUrl / mobileMasked 保留
      if (res.nickname) {
        nickname.value = res.nickname;
        uni.setStorageSync(NICK_KEY, res.nickname);
      }
      // 若云端也回传了 avatar / mobile，则覆盖本地（供后续扩展）
      if (res.avatarUrl) {
        avatarUrl.value = res.avatarUrl;
        uni.setStorageSync(AVATAR_KEY, res.avatarUrl);
      }
      if (res.mobileMasked) {
        mobileMasked.value = res.mobileMasked;
        uni.setStorageSync(MOBILE_KEY, res.mobileMasked);
      }
      loggedIn.value = true;
      console.log("[user] 静默登录成功", res.uid);
      return true;
    } catch (e) {
      // 隐私未授权时 uni.login fail 的 errMsg 含 "privacy"，属预期分支，降噪日志
      const msg = String(
        (e as any)?.errMsg || (e as any)?.message || "",
      ).toLowerCase();
      if (msg.includes("privacy")) {
        console.warn("[user] 隐私未授权，静默登录中止（本地模式）");
      } else {
        console.warn("[user] 静默登录失败，当前为本地模式：", e);
      }
      return false;
    }
  }

  /**
   * 保存资料：先写本地，再异步推云端；成功后以云端返回为准回写
   * @param next.nickname  空字符串表示不改（前端点击"保存"时必须传非空或 undefined）
   * @param next.avatarFileID  已上传到云存储的 cloud:// fileID；undefined 表示不改
   * @param next.mobileMasked  手机号解密后由前端脱敏传入；undefined 表示不改
   */
  async function saveProfile(next: {
    nickname?: string;
    avatarFileID?: string;
    mobileMasked?: string;
  }): Promise<boolean> {
    // 1. 本地先乐观更新，UI 秒级响应
    let changed = false;
    if (typeof next.nickname === "string" && next.nickname) {
      if (nickname.value !== next.nickname) {
        nickname.value = next.nickname;
        changed = true;
      }
    }
    if (typeof next.avatarFileID === "string") {
      if (avatarUrl.value !== next.avatarFileID) {
        avatarUrl.value = next.avatarFileID;
        changed = true;
      }
    }
    if (typeof next.mobileMasked === "string") {
      if (mobileMasked.value !== next.mobileMasked) {
        mobileMasked.value = next.mobileMasked;
        changed = true;
      }
    }
    if (changed) persistCache();

    // 2. 未登录只存本机即可
    if (!loggedIn.value) return changed;

    // 3. 已登录 → 推云端（失败不报错，下次启动自动重试补齐）
    try {
      const payload: any = {};
      if (typeof next.nickname === "string" && next.nickname) payload.nickname = next.nickname;
      if (typeof next.avatarFileID === "string") payload.avatar = next.avatarFileID;
      if (Object.keys(payload).length === 0) return changed;

      const res = await userApi().saveProfile(payload);
      if (res && res.errCode === 0) {
        // 云端权威回写
        if (res.nickname && res.nickname !== nickname.value) {
          nickname.value = res.nickname;
          uni.setStorageSync(NICK_KEY, res.nickname);
        }
        if (res.avatar && res.avatar !== avatarUrl.value) {
          avatarUrl.value = res.avatar;
          uni.setStorageSync(AVATAR_KEY, res.avatar);
        }
        return true;
      }
      return changed;
    } catch (e) {
      console.warn("[user] 资料云端保存失败，本机已生效：", e);
      return changed;
    }
  }

  /**
   * 用手机号授权 code 去云端解密并绑定手机号
   * @returns 绑定成功后返回脱敏手机号；失败或用户拒绝返回空字符串
   */
  async function bindMobileByCode(code: string): Promise<string> {
    if (!code) return "";
    if (!loggedIn.value) {
      uni.showToast({ title: "请先登录后再绑定手机号", icon: "none" });
      return "";
    }
    try {
      const res = await userApi().bindMobile({ code });
      if (!res || res.errCode !== 0) {
        uni.showToast({
          title: (res && res.errMsg) || "手机号绑定失败",
          icon: "none",
        });
        return "";
      }
      const masked = maskMobile(res.mobile || "");
      if (masked) {
        mobileMasked.value = masked;
        uni.setStorageSync(MOBILE_KEY, masked);
      }
      return masked;
    } catch (e) {
      console.warn("[user] 手机号绑定失败：", e);
      uni.showToast({ title: "手机号绑定失败", icon: "none" });
      return "";
    }
  }

  return {
    uid,
    nickname,
    avatarUrl,
    mobileMasked,
    loggedIn,
    ensureLogin,
    saveProfile,
    bindMobileByCode,
  };
});
