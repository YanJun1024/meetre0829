<template>
  <view class="page">
    <view class="content">
      <!-- 头部：标签信息 -->
      <view class="head-card">
        <view class="head-row">
          <text class="head-name">#{{ tagName }}</text>
          <view class="status-chip">
            <view class="status-dot" :class="`dot-${tag?.status || 'learning'}`" />
            <text class="status-text">{{ statusText }}</text>
          </view>
        </view>
        <text class="head-meta">
          你们已经相遇 {{ notes.length }} 次 · 认识 {{ knownDays }} 天了
        </text>
      </view>

      <!-- 释义：三层解析（用户释义 > 自动提取 > 系统释义，开发文档 3.6.6） -->
      <view class="def-card">
        <view class="def-label-row">
          <text class="def-label">{{ defView.source === "sys" ? "系统释义" : "我的释义" }}</text>
          <text class="def-source">{{ defSourceLabel }}</text>
        </view>
        <text class="def-text" :class="{ muted: defView.source === 'sys' }">{{ defView.text || "还没有释义" }}</text>
        <view v-if="defView.source === 'sys'" class="def-tip">
          <AppIcon name="bulb" :size="13" color="#7A6F5E" />
          <text>这是系统释义，换成你自己的话会更记得住</text>
        </view>
        <view class="def-edit" @click="openEditor">
          <AppIcon name="edit" :size="13" color="#9A7209" />
          <text>改一下</text>
        </view>
      </view>

      <!-- 相遇记录：从上到下 = 从新到旧 -->
      <view class="notes-card">
        <text class="def-label">相遇记录</text>
        <view v-if="notes.length" class="notes-list">
          <view v-for="(note, i) in notes" :key="'n:' + (note._id || note.id)" class="note-item">
            <text class="note-content">{{ note.content }}</text>
            <AttachmentList
              :images="note.images || []"
              :audios="note.audios || []"
            />
            <view class="note-meta">
              <text class="note-time">{{ formatMeetTime(note.createTime) }}</text>
              <!-- 里程碑小星星：第 10/20/50 次相遇，悄悄出现 -->
              <text v-if="isMilestone(i)" class="note-star">✦ 第 {{ meetingNo(i) }} 次相遇</text>
              <!-- 最底部节点：初遇标记 -->
              <text v-if="i === notes.length - 1" class="note-first">🌱 第一次遇见你</text>
            </view>
          </view>
        </view>
        <view v-else class="def-empty">
          <text class="def-empty-tip">还没有相遇记录，去记第一笔吧</text>
        </view>
      </view>
    </view>

    <!-- 释义编辑弹层 -->
    <view v-if="editing" class="editor-mask" @click="closeEditor">
      <view class="editor-panel" @click.stop>
        <text class="editor-title">编辑 #{{ tagName }} 的释义</text>
        <textarea
          v-model="editText"
          class="editor-input"
          :maxlength="200"
          auto-height
        />
        <view class="editor-actions">
          <button class="editor-btn cancel" @click="closeEditor">取消</button>
          <button class="editor-btn save" @click="saveEditor">保存</button>
        </view>
      </view>
    </view>

    <FloatAddButton />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import FloatAddButton from "@/components/FloatAddButton.vue";
import AttachmentList from "@/components/AttachmentList.vue";
import AppIcon from "@/components/AppIcon.vue";
import { findTagCI, normalizeWord, useNotesStore } from "@/store/notes";
import { resolveDefinition } from "@/utils/definition";
import { formatMeetTime } from "@/utils/time";

const store = useNotesStore();
const tagName = ref("");

onLoad((options: any) => {
  // v1.6：单词大小写归一（Apple = apple）
  tagName.value = normalizeWord(decodeURIComponent(options?.name || ""));
  if (!tagName.value) return;
  // 打开详情 = 回看笔记，记录行为埋点；同时按需拉取系统释义兜底
  store.recordNoteReview(tagName.value);
  store.fetchSysDefinition(tagName.value);
});

const tag = computed(() => findTagCI(store.tags, tagName.value));

const notes = computed(() =>
  store.notes
    .filter((n) => n.tags.includes(tagName.value) && !n.isDeleted)
    .sort((a, b) => b.createTime - a.createTime)
);

/** 认识天数：从最早一笔笔记到今天，含首尾（v1.6，至少 1 天） */
const knownDays = computed(() => {
  if (!notes.value.length) return 1;
  const earliest = notes.value[notes.value.length - 1].createTime;
  const dayMs = 24 * 60 * 60 * 1000;
  const p = (ts: number) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  return Math.max(1, Math.floor((p(Date.now()) - p(earliest)) / dayMs) + 1);
});

const statusText = computed(() => {
  const s = tag.value?.status;
  if (s === "mastered") return "已掌握";
  if (s === "snoozed") return "休息中";
  return "相遇中";
});

/** 三层释义视图：用户释义 > 自动提取 > 系统释义 */
const defView = computed(() => {
  const resolved = resolveDefinition(tag.value, store.notes);
  return resolved || { text: "", source: "none" as const };
});

const defSourceLabel = computed(() => {
  if (defView.value.source === "sys") return "内置词库";
  if (defView.value.source === "user") return "手动编辑";
  return "自动提取";
});

// =============================================================
// 释义编辑弹层
// =============================================================

const editing = ref(false);
const editText = ref("");

function openEditor() {
  editText.value = defView.value.text;
  editing.value = true;
}

function closeEditor() {
  editing.value = false;
}

function saveEditor() {
  const text = editText.value.trim();
  editing.value = false;
  if (!text) return;
  store.setUserDefinition(tagName.value, text, "manual");
  uni.showToast({ title: "释义已保存" });
}

/** 相遇序号：从初遇（最旧一条）数起，最旧 = 第 1 次 */
function meetingNo(index: number): number {
  return notes.value.length - index;
}

/** 里程碑：第 10 / 20 / 50 次相遇的节点 */
function isMilestone(index: number): boolean {
  return [10, 20, 50].includes(meetingNo(index));
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

/* 头部卡片：便签纸 + 折痕边 */
.head-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.head-name {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

/* 状态徽标：色点 + 文字（与复习页状态灯语义一致） */
.status-chip {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background-color: var(--color-primary-bg);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-md);
  flex-shrink: 0;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
}

.dot-learning {
  background-color: var(--color-yellow);
}

.dot-mastered {
  background-color: var(--color-green);
}

.dot-snoozed {
  background-color: var(--color-text-placeholder);
}

.status-text {
  font-size: var(--font-size-xs);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
}

.head-meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 释义卡片：米色纸面 */
.def-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.def-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.def-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.def-source {
  font-size: var(--font-size-xs);
  color: var(--color-primary-dark);
  background-color: var(--color-primary-bg);
  border-radius: var(--radius-full);
  padding: 2px var(--space-sm);
}

.def-text {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  line-height: 1.6;
}

.def-text.muted {
  color: var(--color-text-placeholder);
}

.def-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.def-edit {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--color-primary-dark);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

/* 笔记卡片 */
.notes-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
}

.notes-list {
  margin-top: var(--space-sm);
  display: flex;
  flex-direction: column;
}

.note-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.note-item:last-child {
  border-bottom: none;
}

.note-content {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  line-height: 1.6;
}

.note-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.note-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

/* 里程碑星星：安静，不张扬 */
.note-star {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
}

/* 初遇标记：底部微微暖意 */
.note-first {
  font-size: var(--font-size-sm);
  color: var(--color-green);
}

/* 空状态 */
.def-empty {
  padding: var(--space-xl) 0;
}

.def-empty-tip {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 释义编辑弹层（与复习页一致） */
.editor-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 999;
}

.editor-panel {
  width: 100%;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-xl) var(--space-lg) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  box-sizing: border-box;
}

.editor-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  text-align: center;
}

.editor-input {
  width: 100%;
  min-height: 96px;
  background-color: var(--color-bg-input);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  box-sizing: border-box;
}

.editor-actions {
  display: flex;
  gap: var(--space-md);
}

.editor-btn {
  flex: 1;
  font-size: var(--font-size-base);
  border-radius: var(--radius-full);
  padding: var(--space-sm) 0;
}

.editor-btn.cancel {
  background-color: var(--color-bg-input);
  color: var(--color-text-secondary);
}

.editor-btn.save {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  font-weight: var(--font-weight-semibold);
}

.editor-btn::after {
  border: none;
}
</style>
