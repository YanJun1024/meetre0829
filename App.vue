<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useNotesStore } from "@/store/notes";
import { useUserStore } from "@/store/user";
import { syncReviewLog } from "@/utils/review-log";

// 自定义隐私授权弹窗：注册后微信不再弹「原生隐私弹窗」
// （开发者工具原生弹窗有渲染卡死 bug，自定义普通 modal 规避之，真机行为一致）
// 注意：同意动作必须由真实的 <button open-type="agreePrivacyAuthorization"> 触发，
// 普通 modal 的 confirm 直接 resolve 会被微信以 "buttonId is wrong" 拒绝，
// 因此这里只把 resolve 转发给全局 PrivacyPopup 组件（内含官方同意按钮）。

type PrivacyResolve = (opts: { event: string; buttonId?: string }) => void;

// onLaunch 阶段 PrivacyPopup 尚未挂载，隐私回调的 resolve 先缓存在这里，
// 等首页 PrivacyPopup 挂载后通过 __consumePendingPrivacy 补消费
let pendingPrivacyResolve: PrivacyResolve | null = null;

function setupPrivacyHandler() {
  const onNeedPrivacy = (uni as any).onNeedPrivacyAuthorization;
  if (!onNeedPrivacy) return; // 基础库 <2.32.3 无此 API，由接口报错分支兜底
  onNeedPrivacy((resolve: PrivacyResolve) => {
    // 上一个请求还没被弹窗接管：按拒绝结束，避免微信侧悬挂
    if (pendingPrivacyResolve) {
      pendingPrivacyResolve({ event: "disagree" });
    }
    pendingPrivacyResolve = resolve;
    // 弹窗已挂载 → 事件实时触发；未挂载 → resolve 暂存，等组件挂载时补取
    uni.$emit("meetre-privacy", resolve);
  });
  // 供 PrivacyPopup 挂载时补取启动阶段悬挂的授权请求，取走即清空
  (uni as any).__consumePendingPrivacy = (): PrivacyResolve | null => {
    const r = pendingPrivacyResolve;
    pendingPrivacyResolve = null;
    return r;
  };
}

onLaunch(() => {
  console.log("MeetRe App Launch");
  setupPrivacyHandler();

  const notesStore = useNotesStore();
  // 数据加载与登录解耦：loadAll 内部先从本地缓存秒恢复，云端失败自动降级本地模式。
  // 不能 await ensureLogin——无 token 时 uni.login 会触发隐私授权，而隐私弹窗要等
  // 首页 PrivacyPopup 挂载后才能展示，串行 await 会把 loadAll 永久阻塞（列表全空）。
  notesStore.loadAll();
  // 复习日志同步自带本地降级，不依赖登录态
  syncReviewLog();
  // 登录后台进行；成功后补拉一次云端（当天已同步则 loadAll 内部 0 读库直接返回）
  useUserStore()
    .ensureLogin()
    .then((ok) => {
      if (ok) notesStore.loadAll();
    });
});
</script>

<style>
@import "./styles/tokens.css";

page {
  background-color: var(--color-bg-system);
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  color: var(--color-text-body);
}
</style>
