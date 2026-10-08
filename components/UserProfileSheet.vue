<template>
  <!--
    双保险：
    1) v-if 由父组件 sheetVisible 控制，关闭时节点完全卸载（比 v-show 稳，避免 tabbar 页内存残留导致的"遮罩挂着抽屉不在"脏状态）
    2) 即使 visible=true 但 shown=false（进场前 / 退场后），mask 也必须是：透明 + pointer-events:none
       —— 只有 shown=true（抽屉滑入就位）的瞬间才真正「加黑 + 拦截点击」。
    这双重保险解决了：
      - sheetVisible 意外滞留在 true（热重载/中断导致的 emit 丢失）→ 透明不挡点击不压暗
      - chooseAvatar 返回/昵称键盘引起的 layout 错位残留点击 → 仍不生效
  -->
  <view v-if="visible" class="ups-mask" :class="{ 'ups-mask-active': shown }">
    <view class="ups-sheet" :class="{ 'ups-show': shown }" :catchtouchmove.prevent="noop">
      <view class="ups-handle" />
      <view class="ups-header">
        <text class="ups-title">个人信息</text>
        <text class="ups-close" @tap="onCancel">×</text>
      </view>

      <!-- ====================== 头像区（整行可点，热区最大） ====================== -->
      <!--
        chooseAvatar 必须用微信原生 <button open-type="chooseAvatar">。
        微信原生 button 默认自带 min-width: 200rpx / min-height: 88rpx / border。
        解决方案：
        1) button 外层不包任何带 flex:1 的容器（避免 width:0 导致 min-width 撑不开）
        2) 给 button 加 display:block + width/height 明确尺寸，彻底覆盖默认
        3) ::after 用 display:none 杀死默认 1px 边框（uni-app 的 2x 像素 bug）
      -->
      <button
        class="ups-avatar-btn"
        open-type="chooseAvatar"
        @chooseavatar="onChooseAvatar"
        hover-class="ups-hover"
      >
        <view class="ups-avatar-cell">
          <view class="ups-avatar-left">
            <image
              v-if="displayAvatar"
              class="ups-avatar"
              :src="displayAvatar"
              mode="aspectFill"
            />
            <view v-else class="ups-avatar ups-avatar-ph">
              <text class="ups-avatar-ph-text">{{ avatarPlaceholder }}</text>
            </view>
          </view>
          <view class="ups-avatar-middle">
            <text class="ups-cell-title">头像</text>
            <text class="ups-cell-sub">点击更换（微信头像 / 相册 / 拍摄）</text>
          </view>
          <text class="ups-cell-arrow">›</text>
        </view>
      </button>

      <!-- ====================== 昵称行：仅接受 type=nickname 官方填入；保存时强制校验，不在输入期拦截 ====================== -->
      <view class="ups-row">
        <text class="ups-label">昵称</text>
        <input
          class="ups-input"
          type="nickname"
          :value="editNickname"
          placeholder="点击后使用『微信昵称』一键填入"
          placeholder-class="ups-ph"
          @input="onNicknameInput"
          @blur="onNicknameBlur"
          maxlength="20"
          confirm-type="done"
          adjust-position
        />
      </view>

      <!-- ====================== 手机号行：独立大按钮，视觉上一眼能认 ====================== -->
      <view class="ups-phone-wrap">
        <template v-if="displayMobile">
          <view class="ups-row ups-row-split">
            <text class="ups-label">手机号</text>
            <text class="ups-mobile">{{ displayMobile }}</text>
          </view>
          <button
            class="ups-btn-plain"
            open-type="getPhoneNumber"
            @getphonenumber="onGetPhoneNumber"
            hover-class="ups-hover-plain"
          >更换手机号</button>
        </template>
        <template v-else>
          <button
            class="ups-btn-phone"
            open-type="getPhoneNumber"
            @getphonenumber="onGetPhoneNumber"
            hover-class="ups-hover-phone"
          >
            <view class="ups-phone-inner">
              <view class="ups-phone-text">
                <text class="ups-phone-title">授权绑定手机号</text>
                <text class="ups-phone-sub">用于账号识别 · 选填 · 可随时解绑</text>
              </view>
              <text class="ups-phone-chevron">›</text>
            </view>
          </button>
        </template>
      </view>

      <!-- ====================== 本地模式提示 ====================== -->
      <view v-if="!userStore.loggedIn" class="ups-tip">
        <text class="ups-tip-title">当前为本地模式</text>
        <text class="ups-tip-body">资料和头像只保存在本机。点击下方「保存并登录」可同步到云端跨设备使用。</text>
      </view>

      <!-- ====================== 操作区 ====================== -->
      <view class="ups-actions">
        <button
          class="ups-btn ups-btn-sec"
          :disabled="saving"
          hover-class="ups-hover-sec"
          @tap="onCancel"
        >取消</button>
        <button
          class="ups-btn ups-btn-pri"
          :loading="saving"
          :disabled="saving"
          hover-class="ups-hover-pri"
          @tap="onSave"
        >
          <block v-if="saving">保存中…</block>
          <block v-else-if="!userStore.loggedIn">保存并登录</block>
          <block v-else>保存</block>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import {
  useUserStore,
  uploadAvatar,
  resolveTempUrl,
} from "@/store/user";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: "update:visible", v: boolean): void;
  (e: "saved"): void;
}>();

const userStore = useUserStore();

const shown = ref(false); // 抽屉滑入动画的第二拍：先挂 DOM 再动画，避免 0ms 动画
const saving = ref(false);

const editNickname = ref("");
/**
 * 昵称锁定：
 * - 有值 = 已经通过「微信昵称官方填入」或「userStore 已存合法值」确认
 * - 空 = 还没走微信填入；保存时会强制拦截（不接受手敲的任意内容）
 * 不再在 @input 期做任何回滚，避免 nextTick 重写 :value 触发微信 input 失焦 → 键盘秒关 → 抽屉连锁关的副作用
 */
const nicknameLocked = ref("");
const editAvatarTemp = ref("");
const editAvatarFileID = ref("");
const editMobileMasked = ref("");
const resolvedAvatar = ref("");

/** 空函数：catchtouchmove 占位，防止滚动穿透到下层 profile 页 */
function noop() {}

/** toast 节流：防止连续敲键盘时刷屏 */
let _tipTimer: any = null;
function tipOnce(msg: string) {
  if (_tipTimer) return;
  uni.showToast({ title: msg, icon: "none" });
  _tipTimer = setTimeout(() => { _tipTimer = null; }, 1200);
}

watch(
  () => props.visible,
  async (v) => {
    clearSafetyTimer();
    if (v) {
      const exist = userStore.nickname || "";
      editNickname.value = exist;
      nicknameLocked.value = exist; // 打开时已有值 → 视作合法来源，锁定
      editAvatarTemp.value = "";
      editAvatarFileID.value = "";
      editMobileMasked.value = userStore.mobileMasked || "";
      resolvedAvatar.value = await resolveTempUrl(userStore.avatarUrl || "");
      await nextTick();
      shown.value = true;
      /**
       * 自洁计时器：如果 visible=true 后 600ms 内 shown 没能保持 true（异常/竞态），
       * 说明抽屉处于"遮罩挂着抽屉不在"的脏状态，自动卸载 mask 兜底，
       * 保证上层页面永远不会出现"变暗 + 点击全失效"。
       */
      _safetyTimer = setTimeout(() => {
        if (props.visible && !shown.value) {
          emit("update:visible", false);
        }
        _safetyTimer = null;
      }, 600);
    } else {
      shown.value = false;
    }
  },
  { immediate: true }
);

let _safetyTimer: any = null;
function clearSafetyTimer() {
  if (_safetyTimer) {
    clearTimeout(_safetyTimer);
    _safetyTimer = null;
  }
}
onUnmounted(clearSafetyTimer);

const displayAvatar = computed(() => {
  if (editAvatarTemp.value) return editAvatarTemp.value;
  return resolvedAvatar.value;
});
const avatarPlaceholder = computed(
  () => (userStore.nickname || editNickname.value || "M").charAt(0)
);
const displayMobile = computed(() => {
  if (editMobileMasked.value) return editMobileMasked.value;
  return userStore.mobileMasked || "";
});

// =============================================================
// 头像
// =============================================================
function onChooseAvatar(e: any) {
  const url = e?.detail?.avatarUrl;
  if (!url) {
    uni.showToast({ title: "未选择头像", icon: "none" });
    return;
  }
  editAvatarTemp.value = url;
  uni.showToast({ title: "头像已选，记得保存哦", icon: "none" });
}

// =============================================================
// 昵称：@input 只做"接收/锁定"，绝不做强制回滚（否则会触发微信 native 层 input 失焦 = 键盘秒关）
// 真正的"只允许微信填入"校验放在 blur + onSave 两步
// =============================================================

/**
 * 只在「旧值空 && 新值 length >= 2」时锁定——这个特征几乎只出现在用户点了键盘上方的微信昵称快捷填入。
 * 用户手敲键盘时：
 *   - 我们也允许显示（不回滚、不强制改值）→ 不会有任何"输入被弹回"的对抗感
 *   - 键盘也不会因为 :value 被外部重设而失焦
 *   - 但保存时如果 nicknameLocked 是空，会强制拦截提示
 */
function onNicknameInput(e: any) {
  const raw = (e?.detail?.value || "") as string;
  const newVal = raw.slice(0, 20);
  const oldVal = editNickname.value;
  const locked = nicknameLocked.value;

  // 已锁定：允许显示用户新输入的字符（不回滚），但保存时会用锁定值再次校验
  editNickname.value = newVal;

  // 没锁定 + 空 → 一次性填入 ≥2 字符：判定为微信填入，锁定
  if (!locked && !oldVal && newVal.length >= 2) {
    nicknameLocked.value = newVal;
    tipOnce("昵称已填入");
    return;
  }

  // 清到空：如果之前是锁定的，解锁（让用户可以重新走一次"微信填入"流程）
  if (newVal === "" && locked) {
    nicknameLocked.value = "";
    return;
  }
  // 其他情况：就显示着，什么都不做
}

/**
 * 失焦时：如果最终结果与「锁定值」不一致 → 清回锁定值（用户没走官方快捷填入时，会被这里拉回）
 * 因为 blur 后键盘本来就要收，所以覆写 :value 不会引发"键盘瞬关"的连锁副作用
 */
function onNicknameBlur() {
  const locked = nicknameLocked.value;
  const cur = editNickname.value.trim();
  if (locked) {
    if (cur !== locked) {
      editNickname.value = locked;
      tipOnce("昵称已使用微信填入，不支持手动修改");
    }
    return;
  }
  // 无锁定值 + 失焦时用户手敲了内容 → 清空，引导下次用官方填入
  if (cur) {
    editNickname.value = "";
    tipOnce("请点击键盘上方『使用微信昵称』一键填入");
  }
}

// =============================================================
// 手机号
// =============================================================
async function onGetPhoneNumber(e: any) {
  const detail = e?.detail || {};
  // 用户拒绝：errMsg 形如 "getPhoneNumber:fail user deny" / "getPhoneNumber:fail cancel"
  if (detail.errMsg && detail.errMsg.indexOf("ok") === -1) {
    const msg = String(detail.errMsg || "");
    if (msg.indexOf("deny") !== -1 || msg.indexOf("cancel") !== -1) {
      uni.showToast({ title: "已取消手机号授权", icon: "none" });
    } else {
      uni.showToast({ title: "手机号授权失败：" + msg, icon: "none" });
    }
    return;
  }
  if (!detail.code) {
    uni.showToast({ title: "未获取到授权凭证", icon: "none" });
    return;
  }
  // 未登录：先走 ensureLogin，让用户有登录态再解密（后端要 token 鉴权）
  if (!userStore.loggedIn) {
    uni.showLoading({ title: "正在登录…", mask: true });
    const ok = await userStore.ensureLogin();
    uni.hideLoading({ fail: () => {} });
    if (!ok) {
      uni.showToast({ title: "登录失败，请稍后重试", icon: "none" });
      return;
    }
    uni.showToast({ title: "已登录，再次点击绑定即可", icon: "none" });
    return;
  }
  uni.showLoading({ title: "绑定中…", mask: true });
  try {
    const masked = await userStore.bindMobileByCode(detail.code || "");
    if (masked) {
      editMobileMasked.value = masked;
      uni.showToast({ title: "手机号绑定成功", icon: "success" });
    }
  } finally {
    uni.hideLoading({ fail: () => {} });
  }
}

// =============================================================
// 取消 / 保存
// =============================================================
function onCancel() {
  shown.value = false;
  // 等动画结束再卸载，避免瞬间闪一下
  setTimeout(() => emit("update:visible", false), 280);
}

async function onSave() {
  // 1. 昵称强制校验：必须来自微信昵称能力（nicknameLocked 有值）
  const locked = nicknameLocked.value;
  if (!locked) {
    uni.showToast({
      title: "请先点击键盘上方『使用微信昵称』填入昵称",
      icon: "none",
      duration: 2000,
    });
    return;
  }
  const nickname = locked.trim();
  if (!nickname) {
    uni.showToast({ title: "昵称不能为空", icon: "none" });
    return;
  }
  saving.value = true;
  uni.showLoading({ title: "保存中…", mask: true });
  try {
    let avatarFileID: string | undefined;
    if (editAvatarTemp.value) {
      if (userStore.loggedIn) {
        try {
          const uid = userStore.uid || "local_user";
          avatarFileID = await uploadAvatar(editAvatarTemp.value, uid);
          editAvatarFileID.value = avatarFileID;
          resolvedAvatar.value = await resolveTempUrl(avatarFileID);
          editAvatarTemp.value = "";
        } catch (e) {
          console.warn("[profile-sheet] 头像上传失败，保留本地版：", e);
          uni.showToast({ title: "头像上传失败，使用本地版", icon: "none" });
          avatarFileID = undefined;
        }
      } else {
        // 未登录 → 把 wxfile:// 临时路径塞 store 作为本机预览，下次启动可能失效，兜底回首字
        avatarFileID = editAvatarTemp.value;
      }
    }

    const ok = await userStore.saveProfile({
      nickname,
      avatarFileID,
      mobileMasked: editMobileMasked.value || undefined,
    });
    uni.showToast({ title: ok ? "保存成功" : "已保存", icon: "success" });
    emit("saved");
    onCancel();
  } catch (e) {
    console.warn("[profile-sheet] 保存异常：", e);
    uni.showToast({ title: "保存失败", icon: "none" });
  } finally {
    saving.value = false;
    uni.hideLoading({ fail: () => {} });
  }
}
</script>

<style scoped>
/* ========================= 遮罩 & 抽屉容器 ========================= */
/**
 * .ups-mask 默认状态（visible=true 但 shown=false）：
 *  - 透明（不压暗页面）
 *  - pointer-events: none（点击全部穿透，不会出现"所有按钮点不动"）
 *  .ups-mask-active（抽屉就位后）：
 *  - 淡入半透明黑底
 *  - 开始拦截点击
 *  即使 sheetVisible 意外滞留在 true（热重载后脏状态），用户也完全感知不到异常
 */
.ups-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  display: flex;
  align-items: flex-end;
  background-color: transparent;
  pointer-events: none;
  transition: background-color 220ms ease;
}
.ups-mask-active {
  background-color: rgba(0, 0, 0, 0.48);
  pointer-events: auto;
}

.ups-sheet {
  width: 100%;
  background-color: var(--color-bg-card);
  border-top-left-radius: 24rpx;
  border-top-right-radius: 24rpx;
  padding: 16rpx var(--space-lg) calc(env(safe-area-inset-bottom) + var(--space-lg));
  box-sizing: border-box;
  box-shadow: var(--shadow-sheet);
  transform: translateY(100%);
  transition: transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
  max-height: 90vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.ups-show { transform: translateY(0); }

.ups-handle {
  width: 72rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background-color: var(--color-border-light);
  margin: 8rpx auto 24rpx;
}

.ups-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.ups-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.ups-close {
  font-size: 44rpx;
  line-height: 1;
  color: var(--color-text-placeholder);
  padding: 0 12rpx;
}

/* ========================= 通用按钮「去默认样式」关键段 =========================
   微信小程序原生 <button> 自带：
   - margin-left/right auto
   - min-height: 88rpx
   - min-width: 200rpx
   - background: #f8f8f8
   - border-radius 4rpx
   - ::after 四周 1px 边框（真机非常显眼，且容易和自定义 border 叠加）
   必须全部覆写掉，按钮热区才真正对齐到视觉形状上
*/
button {
  margin: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  min-height: 0;
  min-width: 0;
  line-height: normal;
  font-size: inherit;
  color: inherit;
  text-align: inherit;
  font-weight: normal;
}
button::after {
  display: none !important;
  border: none;
  width: 0;
  height: 0;
}

/* ========================= 头像：整行是 chooseAvatar 按钮 ========================= */
.ups-avatar-btn {
  display: block;
  width: 100%;
  margin-bottom: 20rpx;
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.ups-hover {
  background-color: var(--color-bg-input);
}
.ups-avatar-cell {
  display: flex;
  align-items: center;
  padding: 24rpx 20rpx;
  gap: 20rpx;
  width: 100%;
  box-sizing: border-box;
}
.ups-avatar-left {
  flex-shrink: 0;
  width: 104rpx;
  height: 104rpx;
  border-radius: var(--radius-full);
  overflow: hidden;
  background-color: var(--color-primary-bg);
  /* 头像有暖影让它「看起来像个按钮」 */
  box-shadow: 0 2px 12px rgba(184, 134, 11, 0.12);
}
.ups-avatar {
  width: 104rpx;
  height: 104rpx;
  border-radius: var(--radius-full);
}
.ups-avatar-ph {
  display: flex;
  align-items: center;
  justify-content: center;
}
.ups-avatar-ph-text {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
}
.ups-avatar-middle {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.ups-cell-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
.ups-cell-sub {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  line-height: 1.4;
}
.ups-cell-arrow {
  font-size: 40rpx;
  line-height: 1;
  color: var(--color-text-placeholder);
  flex-shrink: 0;
  padding-right: 4rpx;
}

/* ========================= 行：label + 控件 ========================= */
.ups-row {
  display: flex;
  align-items: center;
  padding: 28rpx 20rpx;
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 20rpx;
  gap: 20rpx;
}
.ups-row-split {
  margin-bottom: 12rpx;
}
.ups-label {
  width: 120rpx;
  flex-shrink: 0;
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}
.ups-input {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 20rpx;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  background-color: var(--color-bg-input);
  border-radius: var(--radius-sm);
  box-sizing: border-box;
}
:deep(.ups-ph) {
  color: var(--color-text-placeholder);
  font-size: var(--font-size-base);
}
.ups-clear {
  width: 48rpx;
  height: 48rpx;
  line-height: 44rpx;
  text-align: center;
  font-size: 36rpx;
  color: var(--color-text-placeholder);
  background-color: var(--color-bg-input);
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

/* ========================= 手机号：单独的大按钮，强视觉引导 ========================= */
.ups-phone-wrap {
  margin-bottom: 24rpx;
}
.ups-mobile {
  flex: 1;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
  letter-spacing: 1rpx;
}

/* 未绑定：暗金印章底 + 暖白大按钮，一眼是「操作区」（纸墨感不用渐变） */
.ups-btn-phone {
  display: block;
  width: 100%;
  min-height: 128rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  border-radius: var(--radius-xl);
  background: var(--color-primary);
  box-shadow: var(--shadow-float);
}
.ups-hover-phone {
  background: var(--color-primary-dark);
  box-shadow: var(--shadow-button-active);
}
.ups-phone-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 128rpx;
  padding: 0 8rpx;
  box-sizing: border-box;
}
.ups-phone-text {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}
.ups-phone-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-inverse);
}
.ups-phone-sub {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.85);
}
.ups-phone-chevron {
  font-size: 48rpx;
  line-height: 1;
  color: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
}

/* 已绑定：更换按钮，朴素次级 */
.ups-btn-plain {
  display: block;
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  background-color: var(--color-primary-bg);
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-semibold);
}
.ups-hover-plain {
  background-color: #EADFC4;
}

/* ========================= 提示条 ========================= */
.ups-tip {
  margin-bottom: 24rpx;
  padding: 20rpx 24rpx;
  background-color: var(--color-yellow-bg);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.ups-tip-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-yellow-dark);
}
.ups-tip-body {
  font-size: var(--font-size-xs);
  color: var(--color-yellow-dark);
  line-height: 1.6;
  opacity: 0.9;
}

/* ========================= 操作按钮 ========================= */
.ups-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 8rpx;
}
.ups-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: var(--radius-full);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  text-align: center;
}
.ups-btn-sec {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}
.ups-hover-sec {
  background-color: var(--color-bg-input);
}
.ups-btn-pri {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}
.ups-hover-pri {
  background-color: var(--color-primary-dark);
}
.ups-btn-pri[disabled] {
  opacity: 0.65;
  background-color: var(--color-primary-light) !important;
  color: var(--color-text-inverse) !important;
}
</style>
