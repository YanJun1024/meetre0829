<template>
  <view class="page">
    <view class="content">
      <!-- 用户信息 -->
      <view class="user-card">
        <view class="avatar">{{ avatarText }}</view>
        <view class="user-info">
          <text class="nickname">微信用户</text>
          <text class="login-hint" @click="login">点击登录</text>
        </view>
      </view>

      <!-- 核心数据 -->
      <view class="stats-card">
        <view v-for="s in stats" :key="s.label" class="stat-item">
          <text class="stat-value">{{ s.value }}</text>
          <text class="stat-label">{{ s.label }}</text>
        </view>
      </view>

      <!-- 已掌握词库入口 -->
      <view class="cell" @click="showMastered">
        <text>已掌握词库（{{ masteredCount }}个）</text>
        <text class="cell-arrow">›</text>
      </view>

      <!-- 设置区 -->
      <view class="cell">
        <text>设置</text>
        <text class="cell-arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useNotesStore } from "@/store/notes";

const store = useNotesStore();

const masteredCount = computed(() => store.masteredTags.length);

const stats = computed(() => [
  { label: "学习天数", value: 0 },
  { label: "掌握词数", value: masteredCount.value },
  { label: "累计记录", value: store.notes.length },
  { label: "连续天数", value: 0 },
  { label: "本周复习", value: 0 },
]);

const avatarText = computed(() => "M");

function login() {
  // TODO: 接入 uni-id-pages（微信登录 + 手机号登录）
  uni.showToast({ title: "待接入 uni-id-pages", icon: "none" });
}

function showMastered() {
  // TODO: 已掌握词库页面
  uni.showToast({ title: "已掌握词库（待实现）", icon: "none" });
}
</script>

<style scoped>
.page {
  height: 100vh;
  background-color: var(--color-bg-system);
}

.content {
  padding: var(--space-lg);
  background-color: var(--color-bg-page);
  min-height: 100%;
  box-sizing: border-box;
}

.user-card {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg);
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
}

.avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  text-align: center;
  line-height: 56px;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.nickname {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.login-hint {
  font-size: var(--font-size-sm);
  /* 深赭石压白底 4.8:1，小字达标 WCAG AA */
  color: var(--color-primary-dark);
}

.stats-card {
  display: flex;
  justify-content: space-between;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  flex: 1;
}

.stat-value {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.cell {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-sm);
  font-size: var(--font-size-base);
  color: var(--color-text-body);
}

.cell-arrow {
  color: var(--color-text-placeholder);
}
</style>
