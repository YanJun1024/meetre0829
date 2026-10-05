<template>
  <view class="page">
    <view class="content">
      <!-- 按时间看：整本相遇日记，按天翻页 -->
      <template v-if="groups.length">
        <view v-for="g in groups" :key="'day:' + g.key" class="day-group">
          <text class="day-label">{{ g.label }}</text>
          <view
            v-for="n in g.list"
            :key="'tl:' + n.id"
            class="note-card"
            @click="open(n)"
          >
            <view class="note-head">
              <text v-if="n.tags[0]" class="note-tag">#{{ n.tags[0] }}</text>
              <text class="note-time">{{ timeHM(n.createTime) }}</text>
            </view>
            <text class="note-content">{{ n.content }}</text>
            <!-- 附件区单独拦冒泡：预览/播放不触发卡片跳转 -->
            <view
              v-if="(n.images && n.images.length) || (n.audios && n.audios.length)"
              class="note-attach"
              @click.stop
            >
              <AttachmentList :images="n.images || []" :audios="n.audios || []" />
            </view>
          </view>
        </view>
      </template>

      <!-- 空状态：相遇本的扉页 -->
      <view v-else class="empty title-page">
        <text class="tp-welcome">✦ 欢迎 ✦</text>
        <text class="tp-line">这里会按时间记下每一次相遇</text>
        <text class="tp-line">去写下第一笔吧</text>
        <text class="tp-sign">—— MeetRe ——</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useNotesStore } from "@/store/notes";
import type { Note } from "@/types";
import AttachmentList from "@/components/AttachmentList.vue";

const store = useNotesStore();

interface DayGroup {
  key: string;
  label: string;
  list: Note[];
}

/** 全部未删除笔记按 createTime 倒序，按天分组（今天/昨天/M月D日） */
const groups = computed<DayGroup[]>(() => {
  const sorted = store.notes
    .filter((n) => !n.isDeleted)
    .sort((a, b) => b.createTime - a.createTime);

  const now = new Date();
  const todayKey = dayKey(now.getTime());
  const yesterdayKey = dayKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()
  );

  const map = new Map<string, Note[]>();
  for (const n of sorted) {
    const key = dayKey(n.createTime);
    const list = map.get(key);
    if (list) list.push(n);
    else map.set(key, [n]);
  }

  return [...map.entries()].map(([key, list]) => ({
    key,
    label: dayLabel(key, list[0].createTime, todayKey, yesterdayKey),
    list,
  }));
});

function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayLabel(
  key: string,
  ts: number,
  todayKey: string,
  yesterdayKey: string
): string {
  if (key === todayKey) return "今天";
  if (key === yesterdayKey) return "昨天";
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function timeHM(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 有标签的条目点进去看相遇记录 */
function open(n: Note) {
  const name = n.tags[0];
  if (!name) return;
  uni.navigateTo({
    url: `/pages/tag-detail/tag-detail?name=${encodeURIComponent(name)}`,
  });
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

/* 日期小标题：像日记本上每一天的页眉 */
.day-group {
  margin-bottom: var(--space-lg);
}

.day-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-sm);
  letter-spacing: 1px;
}

.note-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

/* 按压态：轻米色反馈 */
.note-card:active {
  background-color: var(--color-bg-input);
}

.note-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.note-tag {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  flex-shrink: 0;
  margin-left: auto;
}

.note-content {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.note-attach {
  margin-top: var(--space-xs);
}

/* 空状态 = 相遇本的扉页：居中、留白宽、字像印在环衬页上 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.title-page {
  gap: 14px;
  padding: 96px 0 var(--space-3xl);
}

.tp-welcome {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  letter-spacing: 4px;
  margin-bottom: var(--space-sm);
}

.tp-line {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  line-height: 1.7;
}

.tp-sign {
  margin-top: var(--space-lg);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  letter-spacing: 2px;
}
</style>
