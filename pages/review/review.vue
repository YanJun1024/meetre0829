<template>
  <view class="page">
    <!-- 内容层：暖米色 -->
    <view class="content">
      <!-- 顶部搜索区：吸顶容器（米色铺底防内容穿透），内层白色操作容器，包住浅米色输入井 -->
      <view class="search-sticky">
        <view class="search-panel">
          <view class="search-field">
            <AppIcon name="search" :size="18" class="search-icon" />
            <input
              v-model="keyword"
              class="search-input"
              placeholder="搜索我的词"
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
              :key="'recent:' + name"
              class="recent-chip"
              @click="keyword = name"
            >
              #{{ name }}
            </view>
          </scroll-view>
          <!-- 显示休息中的词：打开后灰排在列表末尾 -->
          <view class="rest-row">
            <text class="rest-label">显示休息中的词</text>
            <switch
              class="rest-switch"
              :checked="showResting"
              color="#B8860B"
              @change="onToggleResting"
            />
          </view>
        </view>
      </view>

      <!-- 个性化回访提示（v2.0 智能维护）：红档中最久未复习的标签，当日可关闭 -->
      <view v-if="revisitName && !keyword" class="revisit-banner">
        <view class="revisit-text" @click="goRevisit">
          <AppIcon name="bulb" :size="14" color="#9A7209" />
          <text>这位老朋友 #{{ revisitName }} 好久没见了</text>
        </view>
        <text class="revisit-close" @click="dismissRevisit">✕</text>
      </view>

      <!-- 排名列表（按排名分降序）：左滑词典 / 右滑笔记 -->
      <view class="rank-list">
        <view v-for="(tag, index) in filteredTags" :key="tag._id || ('card:' + tag.name)" class="card-wrap">
          <!-- 滑动底色：右滑露出左侧「相遇史」(暗金)，左滑露出右侧「词典」(暖灰蓝) -->
          <view class="swipe-bg">
            <view class="swipe-hint hint-notes">
              <AppIcon name="note" :size="16" color="#FFFEF5" />
              <text>相遇史</text>
            </view>
            <view class="swipe-hint hint-dict">
              <text>词典</text>
              <AppIcon name="book" :size="16" color="#FFFEF5" />
            </view>
          </view>

          <!-- 便签纸主卡片：跟随手指平移（左滑词典 / 右滑相遇史 / 点按管理） -->
          <view
            class="rank-card"
            :class="{ swiping: swipingName === tag.name, resting: tag.status === 'snoozed' }"
            :style="cardStyle(tag.name)"
            @touchstart="onTouchStart($event, tag.name)"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
            @touchcancel="onTouchCancel"
            @click="onCardClick(tag)"
            @longpress="showActions(tag)"
          >
            <text class="rank-no">{{ tag.status === 'snoozed' ? '🌙' : tag.rank }}</text>
            <view class="rank-info">
              <text class="rank-name">#{{ tag.name }}</text>
              <text class="rank-meta">
                你们已相遇 {{ tag.noteCount }} 次<text v-if="tag.status === 'snoozed'" class="rest-meta"> · 休息中</text>
              </text>
              <text v-if="index === 0 && tag.status !== 'snoozed'" class="swipe-tip">左滑查词典 · 右滑看相遇史</text>
            </view>
            <view class="status-dot" :class="`dot-${tag.statusLevel}`" />
          </view>
        </view>

        <!-- 空状态：相遇本的扉页 -->
        <view v-if="!filteredTags.length" class="empty title-page">
          <text class="tp-welcome">✦ 欢迎 ✦</text>
          <text class="tp-line">这是你和单词的相遇本</text>
          <text class="tp-line">记下你遇到的第一个词吧</text>
          <text class="tp-sign">—— MeetRe ——</text>
        </view>
      </view>
    </view>

    <!-- 侧边抽屉（笔记从左滑入，词典从右滑入） -->
    <view
      v-if="drawerVisible"
      class="drawer-mask"
      :class="{ show: drawerShowState === 'open' || drawerShowState === 'opening' }"
      @click="closeDrawer"
    >
      <view
        class="drawer-panel"
        :class="[drawerSide === 'left' ? 'from-left' : 'from-right', {
          show: drawerShowState === 'open' || drawerShowState === 'opening',
          dragging: drawerDragActive,
        }]"
        :style="drawerStyle"
        @touchstart="onDrawerTouchStart"
        @touchmove="onDrawerTouchMove"
        @touchend="onDrawerTouchEnd"
        @touchcancel="onDrawerTouchCancel"
        @click.stop
      >
        <!-- 笔记抽屉 -->
        <template v-if="drawerTag && drawerSide === 'left'">
          <view class="drawer-inner">
            <view class="expand-header">
              <view class="back-btn" @click.stop="closeDrawer">← 返回</view>
              <text class="expand-title">#{{ drawerTag.name }} · 相遇史</text>
            </view>

            <scroll-view
              v-if="getTagNotes(drawerTag.name).length"
              scroll-y
              class="drawer-scroll"
            >
              <view class="notes-list">
                <view
                  v-for="note in getTagNotes(drawerTag.name)"
                  :key="'n:' + (note._id || note.id)"
                  class="note-item"
                >
                  <!-- 文字内容：默认 3 行截断，超过才显示展开按钮；展开后全文显示 -->
                  <view class="note-content-wrap">
                    <text
                      class="note-content"
                      :class="{
                        clamped:
                          !expandedNoteIds.has(note.id) && isLongText(note.content),
                      }"
                    >{{ note.content }}</text>
                    <text
                      v-if="isLongText(note.content)"
                      class="note-toggle"
                      @click.stop="toggleNoteExpand(note.id)"
                    >{{ expandedNoteIds.has(note.id) ? "收起 ▲" : "展开 ▼" }}</text>
                  </view>
                  <AttachmentList
                    :images="note.images || []"
                    :audios="note.audios || []"
                  />
                  <text class="note-time">{{ formatTime(note.createTime) }}</text>
                </view>
              </view>
            </scroll-view>
            <view v-else class="def-empty">
              <text class="def-empty-title">还没有笔记</text>
              <text class="def-empty-tip">点右下角 + 记一条吧</text>
            </view>
          </view>
        </template>

        <!-- 词典抽屉 -->
        <template v-else-if="drawerTag && drawerSide === 'right'">
          <view class="drawer-inner">
            <view class="expand-header">
              <view class="back-btn" @click.stop="closeDrawer">← 返回</view>
              <text class="expand-title">#{{ drawerTag.name }} · 我的理解</text>
            </view>

            <scroll-view scroll-y class="drawer-scroll">
              <!-- 第一/二层：有效释义 -->
              <view v-if="defView(drawerTag).text" class="def-section">
                <view class="def-label-row">
                  <text class="def-label">
                    {{ defView(drawerTag).source === "sys" ? "系统释义" : "我的释义" }}
                  </text>
                  <text class="def-source">{{ defSourceLabel(drawerTag) }}</text>
                </view>
                <text class="def-text" :class="{ muted: defView(drawerTag).source === 'sys' }">
                  {{ defView(drawerTag).text }}
                </text>
                <view v-if="defView(drawerTag).source === 'sys'" class="def-tip">
                  <AppIcon name="bulb" :size="13" color="#7A6F5E" />
                  <text>这是系统释义，换成你自己的话会更记得住</text>
                </view>
                <view class="def-edit" @click="openEditor(drawerTag)">
                  <AppIcon name="edit" :size="13" color="#9A7209" />
                  <text>改一下</text>
                </view>
              </view>

              <!-- 第三层：空状态引导 -->
              <view v-else class="def-empty">
                <text class="def-empty-title">
                  {{ store.sysDefLoading === drawerTag.name ? "正在查询系统释义…" : "还没写下它的意思呢" }}
                </text>
                <text class="def-empty-tip">下次遇到的时候，顺手记一下就好</text>
                <view class="def-edit" @click="openEditor(drawerTag)">
                  <AppIcon name="edit" :size="13" color="#9A7209" />
                  <text>写一句</text>
                </view>
              </view>

              <!-- 遇到场景（开发文档 3.6.4） -->
              <view v-if="tagScenes(drawerTag.name).length" class="scene-section">
                <view class="def-label">
                  <AppIcon name="location" :size="13" color="#7A6F5E" />
                  <text>遇到场景</text>
                </view>
                <text
                  v-for="s in tagScenes(drawerTag.name)"
                  :key="s"
                  class="scene-item"
                >· {{ s }}</text>
              </view>
            </scroll-view>
          </view>
        </template>
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
import AppIcon from "@/components/AppIcon.vue";
import { useNotesStore } from "@/store/notes";
import { resolveDefinition } from "@/utils/definition";
import { calculateTagScore } from "@/utils/rank";
import type { Note, RankedTag, Tag } from "@/types";
import { onShow } from "@dcloudio/uni-app";

const store = useNotesStore();
const keyword = ref("");

/** 是否显示休息中的词（开关打开后，灰在列表末尾） */
const showResting = ref(false);

function onToggleResting(e: any) {
  showResting.value = !!e.detail.value;
}

/** 休息中的词：按最近一次相遇时间倒序，附在活跃列表末尾（搜索时同样可命中） */
const restingTags = computed<RankedTag[]>(() => {
  if (!showResting.value) return [];
  const now = Date.now();
  const kw = keyword.value;
  return store.tags
    .filter(
      (t) =>
        t.status === "snoozed" &&
        (t.snoozeExpireAt || 0) > now &&
        (!kw || t.name.includes(kw))
    )
    .map((t: Tag) => {
      const { score, noteCount, lastTime } = calculateTagScore(t, store.notes);
      return { ...t, score, noteCount, lastTime, rank: 0, statusLevel: "yellow" as const };
    })
    .sort((a, b) => b.lastTime - a.lastTime);
});

// 「我的」页 TOP3 去复习：跨 tab 交接标签名，填入搜索框定位
onShow(() => {
  // 「暂时不想看」到期的标签写回 learning（开发文档 3.4）
  store.restoreExpiredSnoozes();
  try {
    const goTag = uni.getStorageSync("meetre_go_review_tag");
    if (goTag) {
      uni.removeStorageSync("meetre_go_review_tag");
      keyword.value = String(goTag);
    }
  } catch (e) {
    /* 忽略 */
  }
});

const filteredTags = computed(() => {
  const active = keyword.value
    ? store.rankedTags.filter((t) => t.name.includes(keyword.value))
    : store.rankedTags;
  return [...active, ...restingTags.value];
});

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
// 滑动手势：左滑 → 开右侧词典抽屉；右滑 → 开左侧笔记抽屉
// 阈值 60px，阻尼上限 100px
// =============================================================

type DrawerSide = "left" | "right";
type DrawerShowState = "closed" | "opening" | "open" | "closing";

const drawerVisible = ref(false);
const drawerSide = ref<DrawerSide>("right");
const drawerTagName = ref("");
const drawerShowState = ref<DrawerShowState>("closed");

/** 当前抽屉对应的标签对象 */
const drawerTag = computed<RankedTag | undefined>(() =>
  store.rankedTags.find((t) => t.name === drawerTagName.value)
);

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
  // 抽屉刚打开（过渡中）：忽略卡片触摸，防止回位动画被打断卡死在歪的位置
  if (Date.now() - drawerOpenedAt < CARD_LOCK_AFTER_DRAWER) return;
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
  resetTouch();
}

/** 触摸被系统中断（页面滚动抢占/系统手势/控制中心等）——必须复位，否则卡片会带着 translateX 卡死 */
function onTouchCancel() {
  resetTouch();
}

function resetTouch() {
  touch.active = false;
  touch.dx = 0;
  touch.horizontal = false;
  touch.name = "";
}

function cardStyle(name: string) {
  const dx = swipingName.value === name ? touch.dx : 0;
  return dx ? { transform: `translateX(${dx}px)` } : "";
}

// =============================================================
// 侧边抽屉：笔记（左出）/ 词典（右出）
// 关闭方式：①遮罩点击 ②返回按钮 ③反向滑动（笔记→左滑 / 词典→右滑）
// =============================================================

const DRAWER_WIDTH_RATIO = 0.88; // 抽屉占屏比

const drawerDrag = reactive({
  startX: 0,
  startY: 0,
  dx: 0,
  active: false,
  directionLocked: false,
});
const drawerDragActive = computed(() => drawerDrag.active);

/** 抽屉打开的时间戳：打开抽屉后 350ms 内卡片不再响应触摸，
 *  防止抽屉遮罩入动画的第一帧还没铺全时，用户手仍在卡片上触发新 touchstart，
 *  导致卡片 transition 回位被打断，translateX 卡在某个中间值不回位 */
let drawerOpenedAt = 0;
const CARD_LOCK_AFTER_DRAWER = 350;

const drawerStyle = computed(() => {
  if (!drawerDrag.active) return {};
  // 笔记抽屉（左进）：左滑越偏越关闭；词典抽屉（右进）：右滑越偏越关闭
  const { dx, startX } = drawerDrag;
  const side = drawerSide.value;
  const width = Math.round(uni.getSystemInfoSync().windowWidth * DRAWER_WIDTH_RATIO);
  let clamped = 0;
  if (side === "left") {
    clamped = dx > 0 ? 0 : dx; // 只允许向左推走
    clamped = Math.max(-width, clamped);
  } else {
    clamped = dx < 0 ? 0 : dx; // 只允许向右推走
    clamped = Math.min(width, clamped);
  }
  return clamped ? { transform: `translateX(${clamped}px)` } : {};
});

/** 打开抽屉：view='notes' 笔记（左侧），view='dict' 词典（右侧） */
function openView(name: string, view: "dict" | "notes") {
  // **先**复位卡片触摸状态，让卡片第一时间回到 translate 0（配合 transition 平滑回位）
  resetTouch();
  drawerTagName.value = name;
  drawerSide.value = view === "dict" ? "right" : "left";
  drawerVisible.value = true;
  drawerShowState.value = "opening";
  drawerOpenedAt = Date.now();
  // 下一帧切到 open，触发 CSS 过渡入
  setTimeout(() => {
    drawerShowState.value = "open";
  }, 20);

  if (view === "dict") {
    store.recordLookup(name);
    store.fetchSysDefinition(name);
  } else {
    store.recordNoteReview(name);
  }
}

/** 关闭抽屉（带动画） */
function closeDrawer() {
  if (drawerShowState.value === "closed") return;
  drawerShowState.value = "closing";
  // 等过渡动画完成再卸 DOM
  setTimeout(() => {
    drawerShowState.value = "closed";
    drawerVisible.value = false;
    drawerTagName.value = "";
  }, 240);
}

/** 抽屉内反向滑动关闭：笔记（左）→ 左滑；词典（右）→ 右滑
 *  注意：监听不使用 .stop/.prevent，触摸事件会完整传递给子元素，
 *  因此必须严格守卫方向：竖滑/反方向横滑立即放弃本次拖拽，
 *  让 AttachmentList 的图片点击、录音播放、scroll-view 滚动不受影响。 */
function onDrawerTouchStart(e: any) {
  drawerDrag.startX = e.touches[0].clientX;
  drawerDrag.startY = e.touches[0].clientY;
  drawerDrag.dx = 0;
  drawerDrag.active = false; // 先不激活，等 move 里方向确认
  drawerDrag.directionLocked = false;
}

function onDrawerTouchMove(e: any) {
  const dx = e.touches[0].clientX - drawerDrag.startX;
  const dy = e.touches[0].clientY - drawerDrag.startY;

  // 方向判定阶段：|dx| 或 |dy| 任一超过 10px 锁方向
  if (!drawerDrag.directionLocked) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    drawerDrag.directionLocked = true;

    const side = drawerSide.value;
    const isClosingHorizontal =
      Math.abs(dx) > Math.abs(dy) &&
      ((side === "left" && dx < 0) || (side === "right" && dx > 0));

    if (!isClosingHorizontal) {
      // 竖滑 / 非关闭方向：直接放弃，让子元素接管滚动/点击
      drawerDrag.active = false;
      return;
    }
    drawerDrag.active = true; // 是关闭方向，开始接管拖拽
  }

  if (!drawerDrag.active) return;
  drawerDrag.dx = dx;
}

function onDrawerTouchEnd() {
  if (!drawerDrag.active) {
    drawerDrag.directionLocked = false;
    return;
  }
  const side = drawerSide.value;
  const threshold = 80;
  const shouldClose =
    (side === "left" && drawerDrag.dx <= -threshold) ||
    (side === "right" && drawerDrag.dx >= threshold);
  drawerDrag.active = false;
  drawerDrag.directionLocked = false;
  drawerDrag.dx = 0;
  if (shouldClose) closeDrawer();
}

function onDrawerTouchCancel() {
  drawerDrag.active = false;
  drawerDrag.directionLocked = false;
  drawerDrag.dx = 0;
}

/** 卡片单击 → 直接打开词典抽屉（单手用户兜底） */
function onCardClick(tag: RankedTag) {
  // 滑动结束后 500ms 内忽略 click，避免横滑后立刻弹菜单
  if (Date.now() - lastSwipeTs < 500) return;
  showActions(tag);
}

// =============================================================
// 词典/笔记视图数据
// =============================================================

function getTagNotes(name: string): Note[] {
  return store.notes
    .filter((n) => n.tags.includes(name) && !n.isDeleted)
    .sort((a, b) => b.createTime - a.createTime);
}

// =============================================================
// 笔记条目：默认 3 行截断 + 展开/收起
// 文字长度阈值：3 行 * 每行 ~36 汉字 ≈ 110 字，超过才显示展开按钮（避免 4 行小短文也显示按钮）
// =============================================================

const NOTE_CLAMP_LINES = 3;
const LONG_TEXT_CHARS = 110;

const expandedNoteIds = reactive(new Set<string>());

/** 文本是否足够长，需要显示展开/收起按钮 */
function isLongText(text: string): boolean {
  return (text?.length || 0) > LONG_TEXT_CHARS;
}

function toggleNoteExpand(id: string) {
  if (expandedNoteIds.has(id)) expandedNoteIds.delete(id);
  else expandedNoteIds.add(id);
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

/** 点按卡片 → 管理菜单（v1.5：休息一天/三天/一周、完全掌握、删除） */
function showActions(tag: RankedTag) {
  uni.showActionSheet({
    itemList: [
      "🌙 休息一天",
      "🌙 休息三天",
      "🌙 休息一周",
      "✨ 我完全掌握了",
      "🗑️ 删除这条记录",
    ],
    success: ({ tapIndex }) => {
      if (tapIndex <= 2) {
        const days = [1, 3, 7][tapIndex];
        store.setTagStatus(tag.name, "snoozed", days);
        uni.showToast({ title: `让它休息 ${days} 天`, icon: "none" });
      } else if (tapIndex === 3) {
        store.setTagStatus(tag.name, "mastered");
        uni.showToast({ title: "收进已掌握词库啦", icon: "none" });
      } else if (tapIndex === 4) {
        store.removeTag(tag.name);
        uni.showToast({ title: "已删除", icon: "none" });
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

/* 吸顶容器：米色铺底 + 负边距通栏，防止列表内容从圆角缝隙穿透 */
.search-sticky {
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: var(--color-bg-page);
  margin: 0 calc(-1 * var(--space-lg));
  padding: 0 var(--space-lg) var(--space-md);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

/* 操作交互层：便签纸容器，折痕边 + 暖棕淡影 */
.search-panel {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  box-shadow: var(--shadow-card);
  margin-bottom: 0;
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

/* 内嵌快捷标签：淡墨金底小标签 */
.quick-chip {
  flex-shrink: 0;
  background-color: var(--color-primary-bg);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-md);
}

.quick-chip:active {
  background-color: var(--color-bg-input);
}

.input-placeholder {
  color: var(--color-text-placeholder);
}

.recent-row {
  white-space: nowrap;
  margin-top: var(--space-md);
}

/* 「显示休息中的词」开关行：安静、无框，只留一条淡折痕 */
.rest-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-border-light);
}

.rest-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.rest-switch {
  transform: scale(0.8);
  transform-origin: right center;
  margin: 0;
}

/* 与 quick-chip 统一：淡金底 + 深暗金文字，10px 标签圆角 */
.recent-chip {
  display: inline-block;
  background-color: var(--color-primary-bg);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-md);
  margin-right: var(--space-sm);
  font-size: var(--font-size-sm);
}

.recent-chip:active {
  background-color: var(--color-bg-input);
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
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-sm);
  color: var(--color-primary-dark);
}

.revisit-close {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  padding: 0 var(--space-xs);
}

/* 卡片容器：底层滑动色，上层便签纸卡片（列表间距 12px） */
.card-wrap {
  position: relative;
  margin-bottom: 12px;
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
  gap: 6px;
  color: #FFFEF5;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

/* 左滑时卡片向右平移，露出左侧「笔记」—— 把内容贴左边缘，确保平移 80px 就完整露出 */
.hint-notes {
  background-color: var(--color-swipe-right);
  justify-content: flex-start;
  padding-left: 20px;
}

/* 右滑时卡片向左平移，露出右侧「词典」—— 把内容贴右边缘，确保平移 80px 就完整露出 */
.hint-dict {
  background-color: var(--color-swipe-left);
  justify-content: flex-end;
  padding-right: 20px;
}

.rank-card {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease;
  min-height: 56px;
  box-sizing: border-box;
}

/* 手指跟随中：关闭过渡，实时平移 */
.rank-card.swiping {
  transition: none;
}

/* 按压态：轻米色反馈（不用 transform，避免与滑动平移冲突） */
.rank-card:active {
  background-color: var(--color-bg-input);
}

/* 休息中的词：灰在末尾，像被收到一边的书 */
.rank-card.resting {
  background-color: var(--color-bg-secondary);
  border-color: var(--color-border-light);
  box-shadow: none;
}

.rank-card.resting .rank-name {
  color: var(--color-text-secondary);
}

.rank-card.resting .rank-meta,
.rank-card.resting .status-dot {
  color: var(--color-text-placeholder);
}

.rank-card.resting .status-dot {
  background-color: var(--color-text-placeholder);
  box-shadow: 0 0 0 3px transparent;
}

.rest-meta {
  color: var(--color-text-placeholder);
}

/* =============================================================
   侧边抽屉样式（笔记从左进 / 词典从右进）
   ============================================================= */

/* 遮罩层：入出用透明度过渡 */
.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 950;
  background-color: rgba(0, 0, 0, 0);
  transition: background-color 0.24s ease;
}
.drawer-mask.show {
  background-color: rgba(0, 0, 0, 0.45);
}

/* 抽屉面板：宽度 = 屏幕 88%，高度铺满 */
.drawer-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 88%;
  background-color: var(--color-bg-card);
  box-shadow: var(--shadow-drawer);
  transition: transform 0.24s ease;
  overflow: hidden;
}

/* 左抽屉（笔记）：从屏幕左侧推入 */
.drawer-panel.from-left {
  left: 0;
  transform: translateX(-100%);
  border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
}
.drawer-panel.from-left.show {
  transform: translateX(0);
}

/* 右抽屉（词典）：从屏幕右侧推入 */
.drawer-panel.from-right {
  right: 0;
  transform: translateX(100%);
  border-radius: var(--radius-xl) 0 0 var(--radius-xl);
}
.drawer-panel.from-right.show {
  transform: translateX(0);
}

/* 手指拖拽中：关闭过渡实时平移 */
.drawer-panel.dragging {
  transition: none;
}

/* 抽屉内部：顶部 header 固定，下部 scroll-view 可滚动 */
.drawer-inner {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--space-lg);
  box-sizing: border-box;
  gap: var(--space-md);
}

.drawer-scroll {
  flex: 1;
  min-height: 0;
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

/* 列表单词 16px 墨色 */
.rank-name {
  font-size: var(--font-size-lg);
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
  flex-shrink: 0;
}

/* 同色浅底光晕：提升小色点的可读性 */
.dot-red {
  background-color: var(--color-red);
  box-shadow: 0 0 0 3px var(--color-red-bg);
}

.dot-yellow {
  background-color: var(--color-yellow);
  box-shadow: 0 0 0 3px var(--color-yellow-bg);
}

.dot-green {
  background-color: var(--color-green);
  box-shadow: 0 0 0 3px var(--color-green-bg);
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
  padding: 10px 16px 10px 0; /* 放大点击热区（左16 不重要），iOS 最小可点击 44px */
  margin: -10px 0 -10px -16px; /* 负边距抵消 padding 引起的占位位移 */
  min-width: 60px;
  min-height: 44px;
  display: flex;
  align-items: center;
}

.expand-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

/* 释义区：浅米纸面，嵌在便签卡片上 */
.def-section {
  background-color: var(--color-bg-secondary);
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
  display: flex;
  align-items: center;
  gap: 4px;
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
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--color-primary-dark);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.def-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* 遇到场景区：浅米纸面，与释义区同级 */
.scene-section {
  background-color: var(--color-bg-secondary);
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
  white-space: pre-wrap;
  word-break: break-word;
}

/* 默认 3 行截断（微信小程序端通过 -webkit-box 生效） */
.note-content.clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.note-content-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.note-toggle {
  font-size: var(--font-size-sm);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
  padding: 2px 0;
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
  color: var(--color-text-inverse);
  font-weight: var(--font-weight-semibold);
}

/* 去掉小程序 button 默认描边 */
.editor-btn::after {
  border: none;
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

/* 空状态 = 相遇本的扉页：居中、留白宽、字像印在环衬页上 */
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
