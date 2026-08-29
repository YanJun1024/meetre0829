<template>
  <view class="page">
    <!-- 内容层：暖米色 -->
    <view class="content">
      <!-- 顶部搜索区：白色操作容器，包住浅米色输入井 -->
      <view class="search-panel">
        <view class="search-field">
          <text class="search-icon">🔍</text>
          <input
            v-model="keyword"
            class="search-input"
            placeholder="搜索已记录标签"
            placeholder-class="input-placeholder"
          />
          <!-- 内嵌快捷标签：点击直接填入搜索词 -->
          <view
            v-if="quickTag && !keyword"
            class="quick-chip"
            @click="keyword = quickTag"
          >
            #{{ quickTag }}
          </view>
        </view>
        <!-- 最近标签快捷入口 -->
        <scroll-view v-if="recentTags.length" scroll-x class="recent-row">
          <view
            v-for="name in recentTags"
            :key="name"
            class="recent-chip"
            @click="keyword = name"
          >
            #{{ name }}
          </view>
        </scroll-view>
      </view>

      <!-- 个性化回访提示（v2.0 智能维护）：红档中最久未复习的标签，当日可关闭 -->
      <view v-if="revisitName && !keyword" class="revisit-banner">
        <text class="revisit-text" @click="goRevisit">
          💡 好久不见 #{{ revisitName }}，来复习一下？
        </text>
        <text class="revisit-close" @click="dismissRevisit">✕</text>
      </view>

      <!-- 排名列表（按排名分降序）：左滑词典 / 右滑笔记 -->
      <view class="rank-list">
        <view v-for="tag in filteredTags" :key="tag.name" class="card-wrap">
          <!-- 滑动底色：右滑露出左侧「笔记」(亮橙)，左滑露出右侧「词典」(深灰蓝) -->
          <view class="swipe-bg">
            <view class="swipe-hint hint-notes">
              <text>📝 笔记 →</text>
            </view>
            <view class="swipe-hint hint-dict">
              <text>← 📖 词典</text>
            </view>
          </view>

          <!-- 白色主卡片：跟随手指平移 -->
          <view
            class="rank-card"
            :class="{ swiping: swipingName === tag.name }"
            :style="cardStyle(tag.name)"
            @touchstart="onTouchStart($event, tag.name)"
            @touchmove.stop.prevent="onTouchMove"
            @touchend="onTouchEnd"
            @click="onCardClick(tag)"
            @longpress="showActions(tag)"
          >
            <!-- 默认排名视图 -->
            <template v-if="expandedName !== tag.name">
              <text class="rank-no">{{ tag.rank }}</text>
              <view class="rank-info">
                <text class="rank-name">#{{ tag.name }}</text>
                <text class="rank-meta">{{ tag.noteCount }} 条笔记</text>
                <text class="swipe-tip">左滑查词典 · 右滑看笔记</text>
              </view>
              <view class="status-dot" :class="`dot-${tag.statusLevel}`" />
            </template>

            <!-- 词典视图：三层释义（用户释义 > 系统释义 > 空状态，开发文档 3.6.6） -->
            <template v-else-if="expandedView === 'dict'">
              <view class="expand-view">
                <view class="expand-header">
                  <text class="back-btn" @click.stop="collapse">← 返回</text>
                  <text class="expand-title">#{{ tag.name }} · 我的理解</text>
                </view>

                <!-- 第一/二层：有效释义 -->
                <view v-if="defView(tag).text" class="def-section">
                  <view class="def-label-row">
                    <text class="def-label">
                      {{ defView(tag).source === "sys" ? "系统释义" : "我的释义" }}
                    </text>
                    <text class="def-source">{{ defSourceLabel(tag) }}</text>
                  </view>
                  <text class="def-text" :class="{ muted: defView(tag).source === 'sys' }">
                    {{ defView(tag).text }}
                  </text>
                  <text v-if="defView(tag).source === 'sys'" class="def-tip">
                    💡 这是系统释义，换成你自己的话会更记得住
                  </text>
                  <text class="def-edit" @click.stop="openEditor(tag)">✏️ 改一下</text>
                </view>

                <!-- 第三层：空状态引导 -->
                <view v-else class="def-empty">
                  <text class="def-empty-title">
                    {{ store.sysDefLoading === tag.name ? "正在查询系统释义…" : "还没写下它的意思呢" }}
                  </text>
                  <text class="def-empty-tip">下次遇到的时候，顺手记一下就好</text>
                  <text class="def-edit" @click.stop="openEditor(tag)">✏️ 写一句</text>
                </view>

                <!-- 遇到场景（开发文档 3.6.4） -->
                <view v-if="tagScenes(tag.name).length" class="scene-section">
                  <text class="def-label">📍 遇到场景</text>
                  <text
                    v-for="s in tagScenes(tag.name)"
                    :key="s"
                    class="scene-item"
                  >· {{ s }}</text>
                </view>
              </view>
            </template>

            <!-- 笔记视图：该标签的全部笔记 -->
            <template v-else>
              <view class="expand-view">
                <view class="expand-header">
                  <text class="back-btn" @click.stop="collapse">← 返回</text>
                  <text class="expand-title">#{{ tag.name }} · 笔记</text>
                </view>

                <view v-if="getTagNotes(tag.name).length" class="notes-list">
                  <view
                    v-for="note in getTagNotes(tag.name)"
                    :key="note.id"
                    class="note-item"
                  >
                    <text class="note-content">{{ note.content }}</text>
                    <AttachmentList
                      :images="note.images || []"
                      :audios="note.audios || []"
                    />
                    <text class="note-time">{{ formatTime(note.createTime) }}</text>
                  </view>
                </view>
                <view v-else class="def-empty">
                  <text class="def-empty-title">还没有笔记</text>
                  <text class="def-empty-tip">点右下角 + 记一条吧</text>
                </view>
              </view>
            </template>
          </view>
        </view>

        <view v-if="!filteredTags.length" class="empty">
          还没有记录，点右下角 + 开始吧
        </view>
      </view>
    </view>

    <!-- 释义编辑弹层 -->
    <view v-if="editingName" class="editor-mask" @click="closeEditor">
      <view class="editor-panel" @click.stop>
        <text class="editor-title">编辑 #{{ editingName }} 的释义</text>
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

    <!-- 常驻浮动"+"按钮 -->
    <FloatAddButton />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import FloatAddButton from "@/components/FloatAddButton.vue";
import AttachmentList from "@/components/AttachmentList.vue";
import { useNotesStore } from "@/store/notes";
import { resolveDefinition } from "@/utils/definition";
import type { Note, RankedTag } from "@/types";

const store = useNotesStore();
const keyword = ref("");

const filteredTags = computed(() =>
  keyword.value
    ? store.rankedTags.filter((t) => t.name.includes(keyword.value))
    : store.rankedTags
);

const recentTags = computed(() => store.recentTags);

/** 内嵌在搜索框里的快捷标签（排名第一/最新标签），开始输入时隐藏 */
const quickTag = computed(() => store.recentTags[0] || "");

// =============================================================
// 个性化回访（v2.0 智能维护）：红档中最久未复习的标签
// 点按定位到该标签；关闭后当日不再出现
// =============================================================

const VISIT_MUTE_KEY = "meetre_visit_muted";

function dayKeyOf(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const revisitMuted = ref(
  uni.getStorageSync(VISIT_MUTE_KEY) === dayKeyOf(Date.now())
);

const revisitName = computed(() => {
  if (revisitMuted.value) return "";
  const reds = [...store.rankedTags]
    .filter((t) => t.statusLevel === "red")
    .sort((a, b) => (a.lastReviewed || 0) - (b.lastReviewed || 0));
  return reds[0]?.name || "";
});

function goRevisit() {
  if (revisitName.value) keyword.value = revisitName.value;
}

function dismissRevisit() {
  revisitMuted.value = true;
  uni.setStorageSync(VISIT_MUTE_KEY, dayKeyOf(Date.now()));
}

// =============================================================
// 滑动手势：左滑 → 词典，右滑 → 笔记（阈值 60px，阻尼上限 100px）
// =============================================================

const expandedName = ref("");
const expandedView = ref<"dict" | "notes">("dict");

const touch = reactive({
  name: "",
  startX: 0,
  startY: 0,
  dx: 0,
  horizontal: false,
  active: false,
});
let lastSwipeTs = 0;

const swipingName = computed(() => (touch.active ? touch.name : ""));

function onTouchStart(e: any, name: string) {
  if (expandedName.value) return; // 展开视图内用返回按钮，不再响应滑动
  touch.name = name;
  touch.startX = e.touches[0].clientX;
  touch.startY = e.touches[0].clientY;
  touch.dx = 0;
  touch.horizontal = false;
  touch.active = true;
}

function onTouchMove(e: any) {
  if (!touch.active) return;
  const dx = e.touches[0].clientX - touch.startX;
  const dy = e.touches[0].clientY - touch.startY;
  if (!touch.horizontal && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
    touch.horizontal = Math.abs(dx) > Math.abs(dy);
  }
  touch.dx = touch.horizontal ? Math.max(-100, Math.min(100, dx)) : 0;
}

function onTouchEnd() {
  if (!touch.active) return;
  if (touch.dx <= -60) {
    openView(touch.name, "dict");
  } else if (touch.dx >= 60) {
    openView(touch.name, "notes");
  }
  if (touch.horizontal) lastSwipeTs = Date.now();
  touch.active = false;
  touch.dx = 0;
  touch.name = "";
}

/** 打开词典/笔记视图，并记录行为埋点；词典视图按需拉取系统释义兜底 */
function openView(name: string, view: "dict" | "notes") {
  expandedName.value = name;
  expandedView.value = view;
  if (view === "dict") {
    store.recordLookup(name);
    store.fetchSysDefinition(name);
  } else {
    store.recordNoteReview(name);
  }
}

function collapse() {
  expandedName.value = "";
}

function cardStyle(name: string) {
  const dx = swipingName.value === name ? touch.dx : 0;
  return dx ? { transform: `translateX(${dx}px)` } : "";
}

function onCardClick(tag: RankedTag) {
  // 滑动结束后 500ms 内忽略 click，避免误触详情
  if (Date.now() - lastSwipeTs < 500) return;
  if (expandedName.value) return;
  uni.navigateTo({
    url: `/pages/tag-detail/tag-detail?name=${encodeURIComponent(tag.name)}`,
  });
}

// =============================================================
// 词典/笔记视图数据
// =============================================================

function getTagNotes(name: string): Note[] {
  return store.notes
    .filter((n) => n.tags.includes(name) && !n.isDeleted)
    .sort((a, b) => b.createTime - a.createTime);
}

/** 遇到场景：该标签笔记的场景去重，最新优先，最多 3 条（开发文档 3.6.4） */
function tagScenes(name: string): string[] {
  const scenes: string[] = [];
  getTagNotes(name).forEach((n) => {
    if (n.scene && !scenes.includes(n.scene)) scenes.push(n.scene);
  });
  return scenes.slice(0, 3);
}

/** 三层释义视图（开发文档 3.6.6）：text 为空表示落到空状态引导 */
interface DefView {
  text: string;
  source: "user" | "auto" | "sys" | "none";
}

function defView(tag: RankedTag): DefView {
  const resolved = resolveDefinition(tag, store.notes);
  return resolved || { text: "", source: "none" };
}

function defSourceLabel(tag: RankedTag): string {
  const source = defView(tag).source;
  if (source === "sys") return "内置词库";
  if (source === "user") return "手动编辑";
  return "自动提取";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// =============================================================
// 释义编辑弹层
// =============================================================

const editingName = ref("");
const editText = ref("");

function openEditor(tag: RankedTag) {
  editingName.value = tag.name;
  editText.value = defView(tag).text;
}

function closeEditor() {
  editingName.value = "";
}

function saveEditor() {
  const text = editText.value.trim();
  const name = editingName.value;
  closeEditor();
  if (!text || !name) return;
  store.setUserDefinition(name, text, "manual");
  uni.showToast({ title: "释义已保存" });
}

/** 长按卡片 → 操作菜单（已掌握/暂时不想看/删除） */
function showActions(tag: RankedTag) {
  uni.showActionSheet({
    itemList: ["已掌握", "暂时不想看", "删除"],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) {
        store.setTagStatus(tag.name, "mastered");
        uni.showToast({ title: "已移入已掌握词库" });
      } else if (tapIndex === 1) {
        store.setTagStatus(tag.name, "snoozed");
        uni.showToast({ title: "7 天后自动恢复" });
      } else if (tapIndex === 2) {
        store.removeTag(tag.name);
        uni.showToast({ title: "已删除" });
      }
    },
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

/* 操作交互层：白色容器，与米色内容层形成层次 */
.search-panel {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
}

/* 输入框内部：浅米色输入井，嵌在白色容器中 */
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

/* 内嵌快捷标签：白底描边芯片，在浅米色输入井上保持层次 */
.quick-chip {
  flex-shrink: 0;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-md);
}

.input-placeholder {
  color: var(--color-text-placeholder);
}

.recent-row {
  white-space: nowrap;
  margin-top: var(--space-md);
}

.recent-chip {
  display: inline-block;
  background-color: var(--color-primary-bg);
  /* 深赭石替代主色，米色底上对比度 3.05 → 4.15 */
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-md);
  margin-right: var(--space-sm);
  font-size: var(--font-size-sm);
}

.rank-list {
  margin-top: var(--space-sm);
}

/* 个性化回访提示条（v2.0）：轻量主色条，不阻断列表 */
.revisit-banner {
  margin-top: var(--space-md);
  background-color: var(--color-primary-bg);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.revisit-text {
  font-size: var(--font-size-sm);
  color: var(--color-primary-dark);
  flex: 1;
}

.revisit-close {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  padding: 0 var(--space-xs);
}

/* 卡片容器：底层滑动色，上层白色卡片 */
.card-wrap {
  position: relative;
  margin-bottom: var(--space-md);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* 滑动底色：左「笔记」亮橙 / 右「词典」深灰蓝（对应滑动色语义） */
.swipe-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
}

.swipe-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.hint-notes {
  background-color: var(--color-swipe-right);
}

.hint-dict {
  background-color: var(--color-swipe-left);
}

.rank-card {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease;
  min-height: 56px;
  box-sizing: border-box;
}

/* 手指跟随中：关闭过渡，实时平移 */
.rank-card.swiping {
  transition: none;
}

.rank-no {
  width: 32px;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
}

.rank-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.rank-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.rank-meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.swipe-tip {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
}

.dot-red {
  background-color: var(--color-red);
}

.dot-yellow {
  background-color: var(--color-yellow);
}

.dot-green {
  background-color: var(--color-green);
}

/* 展开视图（词典/笔记） */
.expand-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.expand-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.back-btn {
  color: var(--color-primary-dark);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  padding: var(--space-xs) 0;
}

.expand-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

/* 释义区：米色纸面，嵌在白色卡片上 */
.def-section {
  background-color: var(--color-bg-page);
  border-radius: var(--radius-md);
  padding: var(--space-md);
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

.def-edit {
  align-self: flex-start;
  color: var(--color-primary-dark);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.def-tip {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* 遇到场景区：米色纸面，与释义区同级 */
.scene-section {
  background-color: var(--color-bg-page);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.scene-item {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
  line-height: 1.6;
}

/* 空状态 */
.def-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xl) 0;
}

.def-empty-title {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.def-empty-tip {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 笔记列表 */
.notes-list {
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

/* 释义编辑弹层 */
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
  color: #ffffff;
  font-weight: var(--font-weight-semibold);
}

/* 去掉小程序 button 默认描边 */
.editor-btn::after {
  border: none;
}

.empty {
  text-align: center;
  color: var(--color-text-secondary);
  padding: var(--space-3xl) 0;
  font-size: var(--font-size-base);
}
</style>
