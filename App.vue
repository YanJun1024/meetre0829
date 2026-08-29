<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useNotesStore } from "@/store/notes";

onLaunch(() => {
  console.log("MeetRe App Launch");
  // 启动时从 uniCloud 拉取笔记与标签数据
  useNotesStore().loadAll();
  // TODO: uni-id 自动登录（checkToken），接入 uni-id-pages 后实现
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
