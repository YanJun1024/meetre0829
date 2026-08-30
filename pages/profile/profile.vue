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

      <!-- 复习趋势图（近7天复习次数柱状图） -->
      <view class="section-card">
        <view class="section-title-row">
          <text class="section-title">近 7 天复习趋势</text>
          <text class="section-hint">查词典 + 回看笔记</text>
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
          <view class="legend-item"><view class="legend-dot seg-review" /><text>回看笔记</text></view>
        </view>
      </view>

      <!-- 当前最需复习 TOP 3 -->
      <view class="section-card">
        <view class="section-title-row">
          <text class="section-title">当前最需复习 TOP 3</text>
        </view>
        <template v-if="topNeed.length">
          <view v-for="(t, i) in topNeed" :key="t.name" class="top-item">
            <text class="top-rank" :class="`top-rank-${i + 1}`">{{ i + 1 }}</text>
            <view class="top-info">
              <text class="top-name">#{{ t.name }}</text>
              <text class="top-meta">{{ t.noteCount }}条笔记 · {{ levelText(t) }}</text>
            </view>
            <view class="top-btn" @click="goReview(t.name)">去复习</view>
          </view>
        </template>
        <view v-else class="empty-hint">记录一些笔记后，这里会告诉你先复习什么</view>
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
        <view v-else class="empty-hint">还没有动态，去记录第一条笔记吧</view>
      </view>

      <!-- 已掌握词库入口 -->
      <view class="cell" @click="showMastered">
        <text>已掌握词库（{{ masteredCount }}个）</text>
        <text class="cell-arrow">›</text>
      </view>

      <!-- 数据补传（换服务空间迁移用，幂等可重复触发） -->
      <view class="cell" @click="pushToCloud">
        <view class="cell-main">
          <text>数据补传到云端</text>
          <text v-if="lastPushText" class="cell-sub">{{ lastPushText }}</text>
        </view>
        <text class="cell-arrow">›</text>
      </view>

      <!-- 附件迁移：旧空间文件转存当前云端（压缩后） -->
      <view class="cell" @click="migrateAttachments">
        <view class="cell-main">
          <text>迁移旧附件文件</text>
          <text class="cell-sub">旧空间图片/录音转存当前云端（图片压缩）</text>
        </view>
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
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useNotesStore } from "@/store/notes";
import { useUserStore } from "@/store/user";
import { isLegacyFileID } from "@/utils/media";
import { getWeeklyTrend } from "@/utils/review-log";
import AppIcon from "@/components/AppIcon.vue";

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
    red: "需复习",
    yellow: "复习中",
    green: "状态良好",
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
      color: "#A85F3A",
      text: tagText ? `记录了 ${tagText}` : "记录了一条笔记",
      time: timeText(n.createTime),
      ts: n.createTime,
    });
  }
  for (const t of store.tags) {
    if (t.lastReviewed) {
      list.push({
        icon: "book",
        color: "#5A8A6A",
        text: `复习了 #${t.name}`,
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

// =============================================================
// 数据补传：本地缓存 → 云端（换空间后一次性迁移，幂等）
// =============================================================

const PUSH_DAY_KEY = "meetre_last_push";
const pushing = ref(false);

const lastPushText = computed(() => {
  const ts = Number(uni.getStorageSync(PUSH_DAY_KEY) || 0);
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `上次补传 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
});

function pushToCloud() {
  if (pushing.value) return;
  uni.showModal({
    title: "数据补传",
    content: `将本机 ${store.notes.length} 条笔记、${store.tags.length} 个标签推送到云端？已有数据会自动去重，可重复执行。`,
    success: async ({ confirm }) => {
      if (!confirm) return;
      pushing.value = true;
      uni.showLoading({ title: "补传中…", mask: true });
      const res = await store.pushLocalToCloud();
      uni.hideLoading({ fail: () => {} } as any);
      pushing.value = false;
      if (res) {
        uni.setStorageSync(PUSH_DAY_KEY, Date.now());
        uni.showToast({
          title: `已推送 ${res.notesPushed} 条笔记、${res.tagsPushed} 个标签`,
          icon: "none",
        });
      }
    },
  });
}

// =============================================================
// 附件迁移：旧空间 bspapp.com 文件 → 下载 → 压缩 → 当前云端
// =============================================================

const migrating = ref(false);

const legacyNoteCount = computed(
  () =>
    store.notes.filter(
      (n) =>
        (n.images || []).some(isLegacyFileID) ||
        (n.audios || []).some((a) => a && isLegacyFileID(a.cloudPath))
    ).length
);

function migrateAttachments() {
  if (migrating.value) return;
  if (!legacyNoteCount.value) {
    uni.showToast({ title: "没有需要迁移的旧附件", icon: "none" });
    return;
  }
  uni.showModal({
    title: "迁移旧附件",
    content: `发现 ${legacyNoteCount.value} 条笔记含旧空间附件，将下载并压缩后转存到当前云端。请保持网络畅通。`,
    success: async ({ confirm }) => {
      if (!confirm) return;
      migrating.value = true;
      uni.showLoading({ title: "迁移中…", mask: true });
      const res = await store.migrateOldAttachments();
      uni.hideLoading({ fail: () => {} } as any);
      migrating.value = false;
      if (res) {
        uni.showToast({
          title: res.failed
            ? `迁移 ${res.migrated} 个，失败 ${res.failed} 个`
            : `已迁移 ${res.migrated} 个附件`,
          icon: "none",
        });
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
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary-dark);
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

/* ---- 区块卡片通用 ---- */
.section-card {
  background-color: var(--color-bg-card);
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
  border-radius: var(--radius-full);
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
