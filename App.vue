<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useNotesStore } from "@/store/notes";
import { useUserStore } from "@/store/user";

// 自定义隐私授权弹窗：注册后微信不再弹「原生隐私弹窗」
// （开发者工具原生弹窗有渲染卡死 bug，自定义普通 modal 规避之，真机行为一致）
function setupPrivacyHandler() {
  const onNeedPrivacy = (uni as any).onNeedPrivacyAuthorization;
  if (!onNeedPrivacy) return; // 基础库 <2.32.3 无此 API，由接口报错分支兜底
  onNeedPrivacy((resolve: (opts: { event: string }) => void) => {
    uni.showModal({
      title: "隐私保护提示",
      content: "使用拍照选图、录音等功能前，请阅读并同意《用户隐私保护指引》",
      confirmText: "同意",
      cancelText: "拒绝",
      success: ({ confirm }) => resolve({ event: confirm ? "agree" : "disagree" }),
    });
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
