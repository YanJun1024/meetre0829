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
            placeholder="搜索已掌握的词"
            placeholder-class="input-placeholder"
          />
        </view>
      </view>

      <!-- 已掌握列表（按掌握时间降序） -->
      <view v-if="filteredTags.length" class="quote-tip">
        <AppIcon name="bulb" :size="13" color="#7A6F5E" />
        <text>一个词在不同的场景里多遇见几次，就会慢慢熟起来</text>
      </view>

      <view class="mastered-list">
        <view
          v-for="tag in filteredTags"
          :key="tag._id || ('ms:' + tag.name)"
          class="mastered-card"
          @click="viewDict(tag.name)"
          @longpress="confirmRestore(tag.name)"
        >
          <view class="card-info">
            <text class="card-name">#{{ tag.name }}</text>
            <text class="card-meta">
              相遇 {{ noteCount(tag.name) }} 次 · 收于 {{ formatTime(tag.masteredAt) }}
            </text>
            <text class="card-tip">点击查看词典 · 长按放回我的词</text>
          </view>
          <view class="check-badge">✓</view>
        </view>

        <view v-if="!filteredTags.length" class="empty">
          <AppIcon name="check" :size="40" color="#C9BCA8" />
          <text>{{
            keyword
              ? "没找到这个词"
              : "还没有读完的书。在「我的词」里点一张卡片，就能把它收进来"
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

/** 长按标志位：防止长按后抬手触发 click 导致弹两次窗 */
let longPressed = false;

/** 已掌握标签：按掌握时间降序（v1.6：搜索大小写不敏感） */
const filteredTags = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return store.masteredTags
    .filter((t) => !kw || t.name.toLowerCase().includes(kw))
    .sort((a, b) => (b.masteredAt || 0) - (a.masteredAt || 0));
});

function noteCount(name: string): number {
  return store.notes.filter((n) => n.tags.includes(name) && !n.isDeleted).length;
}

/**
 * 放回我的词：解除门槛高于进入门槛（开发文档 3.3）
 * 长按 + 二次确认，避免误触破坏「永久已掌握」语义
 */
function confirmRestore(name: string) {
  longPressed = true;
  uni.showModal({
    title: "放回我的词",
    content: `# ${name} 将放回「我的词」，重新出现在书架上，确定吗？`,
    confirmText: "放回去",
    success: ({ confirm }) => {
      if (confirm) {
        store.setTagStatus(name, "learning");
        uni.showToast({ title: "放回去啦", icon: "none" });
      }
    },
  });
}

/**
 * 查看词典 → 自动移出已掌握词库（开发文档 3.2.1 / 3.3.2）：
 * 还来查词典，说明这位老朋友还没真的读完
 */
function viewDict(name: string) {
  // 长按后抬手会触发 click，用标志位拦截
  if (longPressed) {
    longPressed = false;
    return;
  }
  uni.showModal({
    title: "查看词典",
    content: `查看 #${name} 的词典会把它移出已掌握词库，放回「我的词」，继续吗？`,
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
  min-height: 100vh;
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

:deep(.input-placeholder) {
  color: var(--color-text-placeholder);
  font-size: var(--font-size-base);
}

.mastered-list {
  margin-top: var(--space-sm);
}

/* 文档 3.3.3 提示语 */
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

.mastered-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
}

/* 按压态：轻米色反馈 */
.mastered-card:active {
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
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
}

/* 绿色对勾徽章：与状态灯 dot-green 语义一致 */
.check-badge {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background-color: var(--color-green);
  color: var(--color-text-inverse);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
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
