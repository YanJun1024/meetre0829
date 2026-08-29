<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useNotesStore } from "@/store/notes";
import { useUserStore } from "@/store/user";

// 自定义隐私授权弹窗：注册后微信不再弹「原生隐私弹窗」
// （开发者工具原生弹窗有渲染卡死 bug，自定义普通 modal 规避之，真机行为一致）
// 注意：同意动作必须由真实的 <button open-type="agreePrivacyAuthorization"> 触发，
// 普通 modal 的 confirm 直接 resolve 会被微信以 "buttonId is wrong" 拒绝，
// 因此这里只把 resolve 转发给全局 PrivacyPopup 组件（内含官方同意按钮）。
function setupPrivacyHandler() {
  const onNeedPrivacy = (uni as any).onNeedPrivacyAuthorization;
  if (!onNeedPrivacy) return; // 基础库 <2.32.3 无此 API，由接口报错分支兜底
  onNeedPrivacy((resolve: (opts: { event: string; buttonId?: string }) => void) => {
    uni.$emit("meetre-privacy", resolve);
  });
}

onLaunch(async () => {
  console.log("MeetRe App Launch");
  setupPrivacyHandler();
  // 先静默登录（token 自动随云对象调用上传），再拉取数据；登录失败仍以本地模式运行
  await useUserStore().ensureLogin();
  useNotesStore().loadAll();
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
