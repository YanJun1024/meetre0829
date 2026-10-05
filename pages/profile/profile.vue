<template>
  <view class="page">
    <view class="content">
      <!-- 用户信息 -->
      <view class="user-card">
        <image
          v-if="avatarRenderUrl"
          class="avatar avatar-img"
          :src="avatarRenderUrl"
          mode="aspectFill"
        />
        <view v-else class="avatar">{{ avatarText }}</view>
        <view class="user-info">
          <text class="nickname">{{ nickname }}</text>
          <text class="login-hint" @click="onLoginHintTap">
            <text>{{ userStore.loggedIn ? "已登录" : "点击登录" }}</text>
            <text v-if="userStore.loggedIn" class="login-arrow">›</text>
          </text>
        </view>
      </view>

      <!-- 三句话数字：不做数据看板，像日记本里写给自己的三行话 -->
      <view class="stats-card">
        <text class="stat-line">你已经认识了 <text class="stat-num">{{ knownCount }}</text> 个词</text>
        <text class="stat-line">跟它们相遇了 <text class="stat-num">{{ meetCount }}</text> 次</text>
        <text class="stat-line">坚持记录 <text class="stat-num">{{ recordDays }}</text> 天了</text>
      </view>

      <!-- 相遇趋势图（近7天相遇次数柱状图） -->
      <view class="section-card">
        <view class="section-title-row">
          <text class="section-title">近 7 天相遇趋势</text>
          <text class="section-hint">查词典 · 回看相遇史</text>
        </view>
        <view class="trend-chart">
          <view v-for="(d, i) in trend" :key="i" class="trend-col">
            <text class="trend-count">{{ d.total || "" }}</text>
            <view class="trend-bar-zone">
              <view class="trend-bar-stack" :style="{ height: barHeight(d.total) }">
                <view
                  class="trend-seg seg-dict"
                  :style="{ height: segHeight(d.dict, d.total) }"
                />
                <view
                  class="trend-seg seg-review"
                  :style="{ height: segHeight(d.review, d.total) }"
                />
              </view>
            </view>
            <text class="trend-day" :class="{ today: i === 6 }">{{ trendLabel(i) }}</text>
          </view>
        </view>
        <view class="legend-row">
          <view class="legend-item"><view class="legend-dot seg-dict" /><text>查词典</text></view>
          <view class="legend-item"><view class="legend-dot seg-review" /><text>回看相遇史</text></view>
        </view>
      </view>

      <!-- 相遇最多的老朋友 TOP 3 -->
      <view class="section-card">
        <view class="section-title-row">
          <text class="section-title">相遇最多的老朋友</text>
        </view>
        <template v-if="topNeed.length">
          <view v-for="(t, i) in topNeed" :key="t._id || ('top:' + i + ':' + t.name)" class="top-item">
            <text class="top-rank" :class="`top-rank-${i + 1}`">{{ i + 1 }}</text>
            <view class="top-info">
              <text class="top-name">#{{ t.name }}</text>
              <text class="top-meta">相遇 {{ t.noteCount }} 次 · {{ levelText(t) }}</text>
            </view>
            <view class="top-btn" @click="goReview(t.name)">看看</view>
          </view>
        </template>
        <view v-else class="empty-hint">多记几笔，这里会摆上你最常见的老朋友</view>
      </view>

      <!-- 最近动态（流水账） -->
      <view class="section-card">
        <view class="section-title-row">
          <text class="section-title">最近动态</text>
        </view>
        <template v-if="activities.length">
          <view v-for="(a, i) in activities" :key="i" class="act-item">
            <AppIcon :name="a.icon" :size="16" :color="a.color" />
            <text class="act-text">{{ a.text }}</text>
            <text class="act-time">{{ a.time }}</text>
          </view>
        </template>
        <view v-else class="empty-hint">还没有故事，去记第一笔吧</view>
      </view>

      <!-- 休息中的词入口：暂时收起来的书 -->
      <view class="cell" @click="showSnoozed">
        <text>🌙 休息中的词（{{ snoozedCount }}个）</text>
        <text class="cell-arrow">›</text>
      </view>

      <!-- 已掌握词库入口：读完的书 -->
      <view class="cell" @click="showMastered">
        <text>✨ 已掌握词库（{{ masteredCount }}个）</text>
        <text class="cell-arrow">›</text>
      </view>

      <!-- 设置区 -->
      <view class="cell">
        <text>设置</text>
        <text class="cell-arrow">›</text>
      </view>
    </view>

    <!-- 个人信息抽屉（底部） -->
    <UserProfileSheet v-model:visible="sheetVisible" @saved="onProfileSaved" />

    <!-- 全局隐私授权弹窗：profile 使用 chooseAvatar / getPhoneNumber 属于敏感接口 -->
    <PrivacyPopup />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useNotesStore } from "@/store/notes";
import { useUserStore, resolveTempUrl } from "@/store/user";
import { getWeeklyTrend } from "@/utils/review-log";
import AppIcon from "@/components/AppIcon.vue";
import UserProfileSheet from "@/components/UserProfileSheet.vue";
import PrivacyPopup from "@/components/PrivacyPopup.vue";

const store = useNotesStore();
const userStore = useUserStore();

const sheetVisible = ref(false);
/** 头像渲染用的实际 URL（cloud:// → 真机需转 https 临时） */
const avatarRenderUrl = ref("");
/** 记录最近一次解析的 cloud:// key，有变化时才重新拉临时 URL（减少重复请求+避免layout抖动） */
let _lastAvatarKey = "";

async function refreshAvatar(force = false) {
  const key = userStore.avatarUrl || "";
  if (!force && key === _lastAvatarKey && avatarRenderUrl.value) return;
  _lastAvatarKey = key;
  avatarRenderUrl.value = await resolveTempUrl(key);
}

/**
 * 每次回到本页：刷新 7 天趋势 + 解析头像 URL（头像有缓存时不重复拉）
 * 但要注意：如果抽屉正开着（用户选头像 → 系统面板关闭 → 回到本页触发 onShow），
 * 跳过解析步骤，避免 layout 抖动影响抽屉节点稳定性
 */
onShow(async () => {
  trend.value = getWeeklyTrend();
  if (sheetVisible.value) return;
  await refreshAvatar();
});

/** 保存成功后：重新解析头像 URL（可能是刚上传的 cloud://） */
async function onProfileSaved() {
  await refreshAvatar(true);
}

/** 昵称取首字符作头像（没真实头像时兜底） */
const avatarText = computed(() => userStore.nickname.charAt(0) || "M");
const nickname = computed(() => userStore.nickname || "微信用户");

/** 点击「已登录 / 点击登录」：
 * - 已登录 → 打开个人信息抽屉（方案 A：保留「已登录 ›」文案）
 *   ★ 额外的"脏状态兜底"：如果 sheetVisible 已经是 true（之前中断/热重载造成的脏值残留），
 *     会先 false → nextTick → true 强制组件走一次"干净的挂载流程"，保证每次点击都能弹出。
 *     这相当于代码层面自动帮用户"切 tab 清脏状态"。
 * - 未登录 → 静默登录（与原逻辑一致）
 */
function onLoginHintTap() {
  if (userStore.loggedIn) {
    openSheetCleanly();
    return;
  }
  userStore.ensureLogin().then(async (ok) => {
    uni.showToast({ title: ok ? "登录成功" : "登录失败", icon: "none" });
    if (ok) {
      await refreshAvatar(true);
      // 登录成功后自动打开抽屉让用户填头像/昵称/手机号
      openSheetCleanly();
    }
  });
}

/**
 * 干净地打开个人信息抽屉：
 * 不管 sheetVisible 现在是 true/false/脏值，都强制先走一次卸载（false）→ 再挂载（true）。
 * 避免了 sheetVisible 脏值 true 时响应式无更新导致的"点击无反应抽屉不弹"。
 */
function openSheetCleanly() {
  sheetVisible.value = false;
  nextTick(() => {
    sheetVisible.value = true;
  });
}

const masteredCount = computed(() => store.masteredTags.length);

/** 休息中且未到期的词数（到期的会自动回来，不计入） */
const snoozedCount = computed(() => {
  const now = Date.now();
  return store.tags.filter(
    (t) => t.status === "snoozed" && (t.snoozeExpireAt || 0) > now
  ).length;
});

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

/* 三句话数字（v1.5）：认识的词 / 相遇次数 / 记录天数 */
const knownCount = computed(() => store.tags.length);
const meetCount = computed(() => store.notes.filter((n) => !n.isDeleted).length);
const recordDays = computed(() => activeDays.value.size);

// =============================================================
// 近 7 天复习趋势（本地按天聚合日志，启用当天开始积累）
// =============================================================

const trend = ref(getWeeklyTrend());

onShow(() => {
  trend.value = getWeeklyTrend(); // 回到本页时刷新（含刚发生的复习行为）
});

const maxTrend = computed(() => Math.max(...trend.value.map((d) => d.total), 1));

function barHeight(total: number): string {
  return total ? `${Math.max((total / maxTrend.value) * 100, 6)}%` : "3%";
}

function segHeight(count: number, total: number): string {
  if (!total) return "0%";
  return `${(count / total) * 100}%`;
}

function trendLabel(i: number): string {
  const labels = ["6天前", "5天前", "4天前", "3天前", "前天", "昨天", "今天"];
  return labels[i];
}

// =============================================================
// 当前最需复习 TOP 3（排名前列 + 去复习定位）
// =============================================================

const topNeed = computed(() => store.rankedTags.slice(0, 3));

function levelText(t: { statusLevel?: string }): string {
  const map: Record<string, string> = {
    red: "该看看了",
    yellow: "常来看看",
    green: "挺熟啦",
  };
  return map[t.statusLevel || "yellow"];
}

function goReview(name: string) {
  uni.setStorageSync("meetre_go_review_tag", name);
  uni.switchTab({ url: "/pages/review/review" });
}

// =============================================================
// 最近动态（流水账：记笔记 + 复习，合并按时间倒序）
// =============================================================

interface Activity {
  icon: string;
  color: string;
  text: string;
  time: string;
  ts: number;
}

const activities = computed<Activity[]>(() => {
  const list: Activity[] = [];
  for (const n of store.notes) {
    if (n.isDeleted) continue;
    const tagText = n.tags.length ? `#${n.tags[0]}` : "";
    list.push({
      icon: "write",
      color: "#9A7209",
      text: tagText ? `记了一笔 ${tagText}` : "记了一笔",
      time: timeText(n.createTime),
      ts: n.createTime,
    });
  }
  for (const t of store.tags) {
    if (t.lastReviewed) {
      list.push({
        icon: "book",
        color: "#5C6B7A",
        text: `翻了翻 #${t.name}`,
        time: timeText(t.lastReviewed),
        ts: t.lastReviewed,
      });
    }
  }
  return list.sort((a, b) => b.ts - a.ts).slice(0, 10);
});

function timeText(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  if (diff < 48 * 60 * 60 * 1000) return `昨天 ${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${d.getMonth() + 1}-${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function showMastered() {
  uni.navigateTo({ url: "/pages/mastered/mastered" });
}

function showSnoozed() {
  uni.navigateTo({ url: "/pages/snoozed/snoozed" });
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
  border: 1px solid var(--color-border);
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
  flex-shrink: 0;
}

.avatar.avatar-img {
  padding: 0;
  background-color: var(--color-bg-input);
  overflow: hidden;
  line-height: 0;
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
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.login-arrow {
  font-size: 22px;
  line-height: 1;
  color: var(--color-primary);
  margin-left: 2px;
}

/* 三句话数字：便签卡上的三行话，数字用暗金强调，不是数据看板 */
.stats-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg) 20px;
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
}

.stat-line {
  font-size: var(--font-size-md);
  color: var(--color-text-body);
  line-height: 1.5;
}

.stat-num {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  margin: 0 2px;
}

.cell {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-sm);
  font-size: var(--font-size-base);
  color: var(--color-text-body);
}

/* 按压态：轻米色反馈 */
.cell:active {
  background-color: var(--color-bg-input);
}

.cell-arrow {
  color: var(--color-text-placeholder);
}

.cell-main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.cell-sub {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

/* ---- 区块卡片通用：便签纸 + 折痕边 ---- */
.section-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-md);
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-md);
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.section-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.empty-hint {
  padding: var(--space-xl) 0;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
}

/* ---- 趋势图 ---- */
.trend-chart {
  display: flex;
  align-items: flex-end;
  gap: var(--space-sm);
  height: 150px;
}

.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  height: 100%;
}

.trend-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  min-height: 16px;
}

.trend-bar-zone {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.trend-bar-stack {
  width: 18px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  border-radius: 4px;
  overflow: hidden;
}

.trend-seg {
  width: 100%;
}

.seg-dict {
  background-color: var(--color-swipe-left);
}

.seg-review {
  background-color: var(--color-swipe-right);
}

.trend-day {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.trend-day.today {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.legend-row {
  display: flex;
  justify-content: center;
  gap: var(--space-lg);
  margin-top: var(--space-md);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
}

/* ---- TOP 3 ---- */
.top-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
}

.top-rank {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-align: center;
  line-height: 24px;
  flex-shrink: 0;
}

.top-rank-1 {
  background-color: var(--color-red-bg);
  color: var(--color-red);
}

.top-rank-2 {
  background-color: var(--color-yellow-bg);
  color: var(--color-yellow);
}

.top-rank-3 {
  background-color: var(--color-green-bg);
  color: var(--color-green);
}

.top-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.top-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.top-meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.top-btn {
  padding: 6px 14px;
  border-radius: 14px;
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.top-btn:active {
  background-color: var(--color-primary-dark);
  color: var(--color-text-inverse);
}

/* ---- 最近动态 ---- */
.act-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.act-item:last-child {
  border-bottom: none;
}

.act-text {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

.act-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  flex-shrink: 0;
}
</style>
