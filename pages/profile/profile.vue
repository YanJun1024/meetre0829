<template>
  <view class="page">
    <view class="content">
      <!-- 用户信息 -->
      <view class="user-card">
        <view class="avatar">{{ avatarText }}</view>
        <view class="user-info">
          <text class="nickname">{{ nickname }}</text>
          <text class="login-hint" @click="login">
            {{ userStore.loggedIn ? "已登录" : "点击登录" }}
          </text>
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
import { useUserStore } from "@/store/user";

const store = useNotesStore();
const userStore = useUserStore();

/** 昵称取首字符作头像 */
const avatarText = computed(() => userStore.nickname.charAt(0) || "M");
const nickname = computed(() => userStore.nickname || "微信用户");

/** 静默登录失败时可手动重试 */
function login() {
  if (userStore.loggedIn) {
    uni.showToast({ title: "已登录", icon: "none" });
    return;
  }
  userStore.ensureLogin().then((ok) => {
    uni.showToast({ title: ok ? "登录成功" : "登录失败", icon: "none" });
  });
}

const masteredCount = computed(() => store.masteredTags.length);

// =============================================================
// 统计数据（基于笔记 createTime + 标签 lastReviewed 真实计算）
// =============================================================

/** 本地日期键：YYYY-MM-DD */
function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 活跃天集合：记录笔记的天 + 复习过的天 */
const activeDays = computed(() => {
  const days = new Set<string>();
  store.notes.forEach((n) => {
    if (!n.isDeleted) days.add(dayKey(n.createTime));
  });
  store.tags.forEach((t) => {
    if (t.lastReviewed) days.add(dayKey(t.lastReviewed));
  });
  return days;
});

/** 连续天数：今天没记则从昨天起算 */
const streakDays = computed(() => {
  const days = activeDays.value;
  if (!days.size) return 0;
  const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
});

/** 本周复习：本周（周一起算）复习过的标签数 */
const weekReviews = computed(() => {
  const now = new Date();
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7)
  ).getTime();
  return store.tags.filter(
    (t) => t.lastReviewed && t.lastReviewed >= weekStart
  ).length;
});

const stats = computed(() => [
  { label: "学习天数", value: activeDays.value.size },
  { label: "掌握词数", value: masteredCount.value },
  { label: "累计记录", value: store.notes.length },
  { label: "连续天数", value: streakDays.value },
  { label: "本周复习", value: weekReviews.value },
]);

function showMastered() {
  uni.navigateTo({ url: "/pages/mastered/mastered" });
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
