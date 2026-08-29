<template>
  <view class="float-add" @click="handleClick">+</view>
</template>

<script setup lang="ts">
function handleClick() {
  uni.switchTab({ url: "/pages/record/record" });
}
</script>

<style scoped>
.float-add {
  position: fixed;
  right: 24px;
  bottom: 120px;
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
}

.float-add:active {
  background-color: var(--color-primary-dark);
}
</style>
