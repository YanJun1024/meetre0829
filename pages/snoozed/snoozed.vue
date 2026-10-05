<template>
  <view class="page">
    <view class="content">
      <!-- 顶部搜索区：白色操作容器，包住浅米色输入井 -->
      <view class="search-panel">
        <view class="search-field">
          <AppIcon name="search" :size="18" class="search-icon" />
          <input
            v-model="keyword"
            class="search-input"
            placeholder="搜索休息中的词"
            placeholder-class="input-placeholder"
          />
        </view>
      </view>

      <!-- 休息中列表（按回来时间升序：最早回来的排前面） -->
      <view v-if="filteredTags.length" class="quote-tip">
        <AppIcon name="bulb" :size="13" color="#7A6F5E" />
        <text>休息够了，它们会自己回到书架上</text>
      </view>

      <view class="snoozed-list">
        <view
          v-for="tag in filteredTags"
          :key="tag._id || ('sn:' + tag.name)"
          class="snoozed-card"
          @click="viewDetail(tag.name)"
          @longpress="confirmRestore(tag.name)"
        >
          <view class="card-info">
            <text class="card-name">#{{ tag.name }}</text>
            <text class="card-meta">
              相遇 {{ noteCount(tag.name) }} 次 · {{ backText(tag.snoozeExpireAt) }}
            </text>
            <text class="card-tip">点击查看相遇记录 · 长按提前放回</text>
          </view>
          <view class="moon-badge">🌙</view>
        </view>

        <view v-if="!filteredTags.length" class="empty">
          <AppIcon name="check" :size="40" color="#C9BCA8" />
          <text>{{
            keyword
              ? "没找到这个词"
              : "还没有休息中的词。在「我的词」里点一张卡片，就能让它休息一会儿"
          }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useNotesStore } from "@/store/notes";
import AppIcon from "@/components/AppIcon.vue";

const store = useNotesStore();
const keyword = ref("");

/** 休息中且未到期的标签：按回来时间升序 */
const filteredTags = computed(() => {
  const now = Date.now();
  return store.tags
    .filter(
      (t) =>
        t.status === "snoozed" &&
        (t.snoozeExpireAt || 0) > now &&
        t.name.includes(keyword.value)
    )
    .sort((a, b) => (a.snoozeExpireAt || 0) - (b.snoozeExpireAt || 0));
});

function noteCount(name: string): number {
  return store.notes.filter((n) => n.tags.includes(name) && !n.isDeleted).length;
}

/** 提前放回：长按 + 二次确认，与已掌握词库同一手感 */
function confirmRestore(name: string) {
  uni.showModal({
    title: "提前放回",
    content: `# ${name} 将提前结束休息，回到「我的词」，确定吗？`,
    confirmText: "放回去",
    success: ({ confirm }) => {
      if (confirm) {
        store.setTagStatus(name, "learning");
        uni.showToast({ title: "放回去啦", icon: "none" });
      }
    },
  });
}

/** 点击查看相遇记录（看不动状态，记一笔才会回来） */
function viewDetail(name: string) {
  uni.navigateTo({
    url: `/pages/tag-detail/tag-detail?name=${encodeURIComponent(name)}`,
  });
}

/** 回来时间的轻声表达：今天 / 明天 / M-D */
function backText(expireAt?: number): string {
  if (!expireAt) return "—";
  const d = new Date(expireAt);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isToday) return "今天就回来";
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  if (isTomorrow) return "明天回来";
  return `${d.getMonth() + 1}-${d.getDate()} 回来`;
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

.search-panel {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
}

.search-field {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background-color: var(--color-bg-input);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-sm) var(--space-xs) var(--space-lg);
}

.search-icon {
  font-size: var(--font-size-md);
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  background-color: transparent;
  font-size: var(--font-size-base);
}

.input-placeholder {
  color: var(--color-text-placeholder);
}

.snoozed-list {
  margin-top: var(--space-sm);
}

.quote-tip {
  margin-top: var(--space-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  text-align: center;
}

.snoozed-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: 12px;
}

/* 按压态：轻米色反馈 */
.snoozed-card:active {
  background-color: var(--color-bg-input);
}

.card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.card-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.card-meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.card-tip {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

/* 月亮徽章：休息中的安静标记 */
.moon-badge {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
  line-height: 24px;
  flex-shrink: 0;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  text-align: center;
  color: var(--color-text-secondary);
  padding: var(--space-3xl) 0;
  font-size: var(--font-size-base);
}
</style>
