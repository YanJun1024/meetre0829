<template>
  <view
    class="float-add"
    :style="{ bottom: bottomPx + 'px' }"
    @click="handleClick"
  >+</view>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";

const BOTTOM_REST = 120;     // 键盘未弹起时的 resting 位置（避开 tabBar）
const BOTTOM_KEYPAD_GAP = 16; // 吸附键盘时与键盘顶边之间的呼吸间距
const bottomPx = ref(BOTTOM_REST);

function handleClick() {
  uni.switchTab({ url: "/pages/record/record" });
}

/**
 * 键盘弹起/收起时动态调整 bottom：
 *  - 收起态：维持 resting 位置（避开 tabBar）
 *  - 弹起态：吸附在键盘上沿（只叠加一个呼吸间距），因为键盘本身已经覆盖了 tabBar 区域，
 *    不能再叠加 120px ，否则按钮会浮在半空显得布局失衡。
 *  这是典型 overlay 键盘（iOS 微信小程序为主）的「单一补偿模型」方案。
 */
function onKeyboardHeight(e: { height: number }) {
  const h = e.height || 0;
  bottomPx.value = h > 0 ? h + BOTTOM_KEYPAD_GAP : BOTTOM_REST;
}

onMounted(() => {
  // #ifndef H5
  uni.onKeyboardHeightChange(onKeyboardHeight);
  // #endif
});

onBeforeUnmount(() => {
  // #ifndef H5
  uni.offKeyboardHeightChange(onKeyboardHeight);
  // #endif
});
</script>

<style scoped>
.float-add {
  position: fixed;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  font-size: 32px;
  line-height: 56px;
  text-align: center;
  box-shadow: var(--shadow-float);
  z-index: 999;
  transition: bottom 0.2s ease, transform 0.15s ease, background-color 0.15s ease;
}

/* 印章按下：轻缩一下再弹回（动效规范 150ms） */
.float-add:active {
  background-color: var(--color-primary-dark);
  transform: scale(0.94);
}
</style>
