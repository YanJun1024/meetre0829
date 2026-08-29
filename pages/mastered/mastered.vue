<template>
  <view class="page">
    <view class="content">
      <!-- 顶部搜索区：白色操作容器，包住浅米色输入井 -->
      <view class="search-panel">
        <view class="search-field">
          <text class="search-icon">🔍</text>
          <input
            v-model="keyword"
            class="search-input"
            placeholder="搜索已掌握标签"
            placeholder-class="input-placeholder"
          />
        </view>
      </view>

      <!-- 已掌握列表（按掌握时间降序） -->
      <view v-if="filteredTags.length" class="quote-tip">
        💡 研究表明，一个词需要在不同场景遇到 5-7 次才能真正记住
      </view>

      <view class="mastered-list">
        <view
          v-for="tag in filteredTags"
          :key="tag.name"
          class="mastered-card"
          @click="viewDict(tag.name)"
          @longpress="confirmRestore(tag.name)"
        >
          <view class="card-info">
            <text class="card-name">#{{ tag.name }}</text>
            <text class="card-meta">
              {{ noteCount(tag.name) }} 条笔记 · 掌握于 {{ formatTime(tag.masteredAt) }}
            </text>
            <text class="card-tip">点击查看词典 · 长按恢复学习</text>
          </view>
          <view class="check-badge">✓</view>
        </view>

        <view v-if="!filteredTags.length" class="empty">
          {{ keyword ? "没有匹配的已掌握标签" : "还没有已掌握的词，长按复习页卡片标记吧" }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useNotesStore } from "@/store/notes";

const store = useNotesStore();
const keyword = ref("");

/** 已掌握标签：按掌握时间降序 */
const filteredTags = computed(() =>
  store.masteredTags
    .filter((t) => t.name.includes(keyword.value))
    .sort((a, b) => (b.masteredAt || 0) - (a.masteredAt || 0))
);

function noteCount(name: string): number {
  return store.notes.filter((n) => n.tags.includes(name) && !n.isDeleted).length;
}

/**
 * 恢复学习：解除门槛高于进入门槛（开发文档 3.3）
 * 长按 + 二次确认，避免误触破坏「永久已掌握」语义
 */
function confirmRestore(name: string) {
  uni.showModal({
    title: "恢复学习",
    content: `# ${name} 将恢复为「学习中」，排名分重新累计，确定吗？`,
    confirmText: "恢复",
    success: ({ confirm }) => {
      if (confirm) {
        store.setTagStatus(name, "learning");
        uni.showToast({ title: "已恢复学习" });
      }
    },
  });
}

/**
 * 查看词典 → 自动取消掌握（开发文档 3.2.1 / 3.3.2）：
 * 已掌握后查词典 = 其实忘了，从 0 开始重新学习
 */
function viewDict(name: string) {
  uni.showModal({
    title: "查看词典",
    content: `查看 #${name} 的词典会自动取消掌握状态，从 0 开始重新学习，继续吗？`,
    confirmText: "查看",
    cancelText: "再想想",
    success: ({ confirm }) => {
      if (confirm) {
        store.setTagStatus(name, "learning");
        uni.navigateTo({
          url: `/pages/tag-detail/tag-detail?name=${encodeURIComponent(name)}`,
        });
      }
    },
  });
}

function formatTime(ts?: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

.mastered-list {
  margin-top: var(--space-sm);
}

/* 文档 3.3.3 提示语 */
.quote-tip {
  margin-top: var(--space-md);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  text-align: center;
}

.mastered-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
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

/* 绿色对勾徽章：与状态灯 dot-green 语义一致 */
.check-badge {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background-color: var(--color-green);
  color: #ffffff;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-align: center;
  line-height: 24px;
  flex-shrink: 0;
}

.empty {
  text-align: center;
  color: var(--color-text-secondary);
  padding: var(--space-3xl) 0;
  font-size: var(--font-size-base);
}
</style>
