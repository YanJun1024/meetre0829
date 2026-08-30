<template>
  <image
    class="app-icon"
    :src="src"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * 通用线性图标组件：SVG data-uri 渲染，替代 emoji
 * 统一 24x24 viewBox / 2px 圆头描边，跨机型渲染一致
 * 颜色需传具体色值（data-uri 内不继承 CSS 变量），
 * 常用色值：#6B655E 辅助灰 / #A85F3A 深赭石(primary-dark) / #FFFFFF 反色
 */
const ICONS: Record<string, string> = {
  // 打开的书：复习 / 词典
  book: '<path d="M12 5.5C10 3.8 7 3.5 4 4v14c3-.5 6-.2 8 1.5 2-1.7 5-2 8-1.5V4c-3-.5-6-.2-8 1.5z"/><path d="M12 5.5v14"/>',
  // 相机
  camera:
    '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7l1.2-2.2a1.5 1.5 0 0 1 1.3-.8h2a1.5 1.5 0 0 1 1.3.8L15.5 7"/><circle cx="12" cy="13.5" r="3.5"/>',
  // 麦克风
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
  // 停止（录音中）
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  // 铅笔：编辑
  edit: '<path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19 4 20z"/><path d="M14.5 6l3.5 3.5"/>',
  // 圆圈对勾：成功
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  // 灯泡：提示
  bulb: '<path d="M9.5 17.5h5"/><path d="M10.5 21h3"/><path d="M12 3a6 6 0 0 1 3.5 10.9c-.8.6-1 1.3-1 2.1h-5c0-.8-.2-1.5-1-2.1A6 6 0 0 1 12 3z"/>',
  // 放大镜：搜索
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  // 便签：笔记
  note: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  // 定位：场景
  location:
    '<path d="M12 21s-6.5-5.3-6.5-10a6.5 6.5 0 0 1 13 0c0 4.7-6.5 10-6.5 10z"/><circle cx="12" cy="11" r="2.5"/>',
  // 熟悉度三态：笑 / 平 / 皱眉
  faceGood:
    '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  faceMeh:
    '<circle cx="12" cy="12" r="9"/><path d="M8.5 15h7"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  faceBad:
    '<circle cx="12" cy="12" r="9"/><path d="M8.5 16a4.5 4.5 0 0 1 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  // 书写：动态
  write:
    '<path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19 4 20z"/>',
};

const props = withDefaults(
  defineProps<{ name: string; size?: number; color?: string }>(),
  { size: 16, color: "#6B655E" }
);

const src = computed(() => {
  const body = ICONS[props.name] || ICONS.note;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${props.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    body +
    `</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
});
</script>

<style scoped>
.app-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
