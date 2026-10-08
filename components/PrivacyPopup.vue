<template>
  <view v-if="visible" class="pp-mask">
    <view class="pp-panel">
      <text class="pp-title">隐私保护提示</text>
      <text class="pp-text">
        在使用拍照选图、录音等功能前，请阅读并同意
        <text class="pp-link" @click="openContract">《用户隐私保护指引》</text>
        。
      </text>
      <button
        id="agree-btn"
        class="pp-agree"
        open-type="agreePrivacyAuthorization"
        @agreeprivacyauthorization="onAgree"
      >
        同意并继续
      </button>
      <button class="pp-refuse" @click="onRefuse">拒绝</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

/**
 * 微信自定义隐私授权弹窗（配合 App.vue 的 onNeedPrivacyAuthorization）。
 * 关键：同意动作必须来自 open-type="agreePrivacyAuthorization" 的真实 button，
 * resolve 时回传该 button 的 id；用普通 modal 的 confirm 回传会被微信以
 * "privacy permission is not authorized or buttonId is wrong" 拒绝，
 * 导致同意后接口依然报 privacy 错。
 */
const visible = ref(false);
type ResolveFn = (opts: { event: string; buttonId?: string }) => void;
let resolveFn: ResolveFn | null = null;

function onShowPrivacy(resolve: ResolveFn) {
  // 弹窗接管后清掉 App 侧暂存，保证同一个 resolve 只被一方持有
  const consume = (uni as any).__consumePendingPrivacy;
  if (typeof consume === "function") consume();
  resolveFn = resolve;
  visible.value = true;
}
uni.$on("meetre-privacy", onShowPrivacy);

// App.onLaunch 阶段本组件尚未挂载，uni.login 触发的授权 resolve 被暂存在 App 侧，
// 首页挂载后这里补取并弹窗，避免授权请求无人消费、uni.login 永久挂起
onMounted(() => {
  const consume = (uni as any).__consumePendingPrivacy;
  if (typeof consume === "function") {
    const pending = consume();
    if (pending) onShowPrivacy(pending);
  }
});

function onAgree() {
  finish({ event: "agree", buttonId: "agree-btn" });
  uni.$emit("meetre-privacy-agreed");
}

function onRefuse() {
  finish({ event: "disagree" });
}

/**
 * 结束本次授权：resolve 只由用户实际点击的那个实例调用一次，
 * 同时广播关闭其他页面的实例（record / profile 两个 tab 各挂了一个，
 * tab 页不卸载、监听器都活着，不广播会在切 tab 后看到残留弹窗）
 */
function finish(result: { event: string; buttonId?: string }) {
  const fn = resolveFn;
  visible.value = false;
  resolveFn = null;
  uni.$emit("meetre-privacy-close");
  fn?.(result);
}

/** 其他实例已完成授权：关闭本实例弹窗，但不重复调用 resolve */
function onRemoteClose() {
  visible.value = false;
  resolveFn = null;
}
uni.$on("meetre-privacy-close", onRemoteClose);

function openContract() {
  const openPrivacy = (uni as any).openPrivacyContract;
  if (openPrivacy) openPrivacy({});
}

onUnmounted(() => {
  uni.$off("meetre-privacy", onShowPrivacy);
  uni.$off("meetre-privacy-close", onRemoteClose);
});
</script>

<style scoped>
/* 遮罩与全项目半屏抽屉（drawer-mask）保持一致 */
.pp-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pp-panel {
  width: 78%;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  box-shadow: var(--shadow-card-hover);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.pp-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  text-align: center;
}

.pp-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
  line-height: 1.7;
}

.pp-link {
  color: var(--color-primary);
}

.pp-agree {
  margin: 0;
  width: 100%;
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-full);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.pp-agree::after {
  border: none;
}

.pp-agree:active {
  background-color: var(--color-primary-dark);
}

/* 次要按钮：次要区域底色，与拒绝的低强调语义匹配 */
.pp-refuse {
  margin: 0;
  width: 100%;
  background-color: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border-radius: var(--radius-full);
  font-size: var(--font-size-base);
}

.pp-refuse::after {
  border: none;
}
</style>
