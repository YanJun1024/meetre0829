<template>
  <view class="page">
    <view class="content">
      <!-- 问候：像坐下来写字时，有人轻声打招呼 -->
      <view class="greeting">
        <text class="greet-main">{{ greeting }} ☁️</text>
        <text class="greet-sub">今天遇到什么新词了吗？</text>
      </view>

      <!-- 主输入框：便签纸卡片，包住浅米色输入井 -->
      <view class="input-panel">
        <textarea
          v-model="content"
          class="content-input"
          placeholder="随手写下来，用 #单词 做个记号吧"
          placeholder-class="input-placeholder"
          :maxlength="-1"
          auto-height
        />
      </view>

      <!-- 已有笔记预览（开发文档 3.2.3 v2.0）：输入 #tag 且有历史时显示 -->
      <view v-if="previewTag" class="preview-panel">
        <view class="preview-head">
          <view class="preview-title">
            <AppIcon name="book" :size="14" color="#9A7209" />
            <text>你之前记过 #{{ previewTag.name }}</text>
            <!-- 熟悉度徽章（v2.0 3.2.3）：彩色小圆点，点击展开调整面板；未标记过不显示 -->
            <view
              v-if="previewFam"
              class="fam-dot"
              :class="`fam-${previewFam}`"
              @click.stop="famPickerOpen = !famPickerOpen"
            />
          </view>
          <text class="preview-count">（{{ previewTag.count }}条）</text>
        </view>
        <!-- 熟悉度调整面板：点圆点展开，三选一 -->
        <view v-if="famPickerOpen" class="fam-picker">
          <view
            v-for="opt in famOptions"
            :key="'fam:' + opt.value"
            class="fam-picker-opt"
            :class="{ active: previewFam === opt.value }"
            @click="pickFamiliarity(opt.value)"
          >
            <view class="fam-dot" :class="`fam-${opt.value}`" />
            <text>{{ opt.label }}</text>
          </view>
        </view>
        <!-- 最近 2 条笔记摘要（开发文档 Tab2 规格） -->
        <text
          v-for="n in previewTag.latestList"
          :key="n.createTime"
          class="preview-note"
        >· {{ dayKey(n.createTime) }} {{ n.content }}</text>
        <text
          v-if="previewTag.count > 2"
          class="preview-more"
          @click="allDrawerTag = previewTag.name"
        >查看全部（{{ previewTag.count }}条）→</text>
      </view>

      <!-- 场景选择 -->
      <view class="scene-title">是在什么场景遇到的？</view>
      <view class="scene-row">
        <view
          v-for="s in scenes"
          :key="s.label"
          class="scene-chip"
          :class="{ active: scene === s.label }"
          @click="selectScene(s.label)"
        >
          {{ s.label }}
        </view>
      </view>
      <view v-if="scene === '其他'" class="input-panel custom-panel">
        <input
          v-model="customScene"
          class="custom-scene"
          placeholder="写写具体场景"
          placeholder-class="input-placeholder"
        />
      </view>

      <!-- 附件区域（开发文档 Tab2）：默认收起"···"，展开后添加图片/录音 -->
      <view class="attach-row">
        <view class="attach-toggle" @click="attachExpanded = !attachExpanded">
          <text class="attach-toggle-text">···</text>
          <text v-if="attachmentCount" class="attach-badge">
            ({{ attachmentCount }})
          </text>
        </view>
        <template v-if="attachExpanded">
          <view class="attach-chip" @click="chooseImages">
            <AppIcon name="camera" :size="16" />
            <text>添加照片</text>
          </view>
          <view v-if="!recording" class="attach-chip" @click="startRecord">
            <AppIcon name="mic" :size="16" />
            <text>添加录音</text>
          </view>
          <view v-else class="attach-chip recording" @click="stopRecord">
            <AppIcon name="stop" :size="16" color="#FFFEF5" />
            <text>停止录音（{{ recordSeconds }}s）</text>
          </view>
        </template>
      </view>

      <!-- 附件预览（可删除） -->
      <AttachmentList
        v-if="images.length || audios.length"
        class="attach-preview"
        :images="images"
        :audios="audios"
        editable
        @remove-image="images.splice($event, 1)"
        @remove-audio="audios.splice($event, 1)"
      />

      <!-- 保存 -->
      <button class="save-btn" @click="save">保存</button>

      <!-- 自动识别释义提示（开发文档 3.6.5 入口二）：2.5s 自动消失，点击去详情 -->
      <view v-if="autoDefHint" class="autodef-bar" @click="goAutoDef">
        <AppIcon name="book" :size="14" color="#9A7209" />
        <text class="ad-text"
          >已记下你对 #{{ autoDefHint.name }} 的理解：{{ autoDefHint.text }}</text
        >
        <view class="ad-link">
          <AppIcon name="edit" :size="13" color="#9A7209" />
          <text>看看</text>
        </view>
      </view>

      <!-- 保存后反馈（v1.5 3.2.2）：底部轻反馈条，2.5s 自动消失 -->
      <view v-if="famFeedbackTag" class="fam-bar">
        <view class="fam-head">
          <AppIcon name="check" :size="14" color="#9A7209" />
          <text class="fam-title">已保存 #{{ famFeedbackTag }}</text>
        </view>
        <text class="fam-question">这个词你现在能说出来吗？</text>
        <view class="fam-options">
          <view class="fam-opt" @click="answerFamiliarity('familiar')">😎 能</view>
          <view class="fam-opt" @click="answerFamiliarity('fuzzy')">😅 有点悬</view>
          <view class="fam-opt" @click="answerFamiliarity('unfamiliar')">🤔 不能</view>
        </view>
      </view>

      <!-- 今天的相遇：今天写的便签 -->
      <view v-if="todayNotes.length" class="today-section">
        <text class="section-label">今天的相遇</text>
        <view
          v-for="n in todayNotes"
          :key="'today:' + (n._id || n.id)"
          class="today-card"
          @click="goTagDetail(n.tags[0] || '')"
        >
          <view class="today-head">
            <text v-if="n.tags[0]" class="today-tag">#{{ n.tags[0] }}</text>
            <text class="today-time">{{ timeHM(n.createTime) }}</text>
          </view>
          <text class="today-content">{{ n.content }}</text>
        </view>

        <view class="earlier-link" @click="goEarlier">
          <text>查看更早的 →</text>
        </view>
      </view>

      <!-- 老朋友提醒：一位好久没见的朋友，当日可关闭 -->
      <view v-if="oldFriend" class="oldfriend-bar">
        <view class="of-text" @click="goOldFriend">
          <AppIcon name="bulb" :size="14" color="#9A7209" />
          <text>这位老朋友 #{{ oldFriend }} 好久没见了</text>
        </view>
        <text class="of-close" @click="dismissOldFriend">✕</text>
      </view>
    </view>

    <!-- 查看全部笔记抽屉（开发文档 Tab2：半屏抽屉，完整笔记列表） -->
    <view v-if="allDrawerTag" class="drawer-mask" @click="allDrawerTag = ''">
      <view class="drawer-panel" @click.stop>
        <view class="drawer-head">
          <text class="drawer-title">#{{ allDrawerTag }} 的全部笔记</text>
          <text class="drawer-close" @click="allDrawerTag = ''">✕</text>
        </view>
        <scroll-view scroll-y class="drawer-list">
          <view v-for="n in drawerNotes" :key="n.createTime" class="drawer-item">
            <text class="drawer-item-content">{{ n.content }}</text>
            <text class="drawer-item-date">{{ dayKey(n.createTime) }}</text>
          </view>
          <view v-if="!drawerNotes.length" class="drawer-empty">
            <text>还没有笔记</text>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 全局隐私授权弹窗（含官方 agreePrivacyAuthorization 按钮） -->
    <PrivacyPopup />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { parseTags, useNotesStore } from "@/store/notes";
import { useUserStore } from "@/store/user";
import type { Familiarity } from "@/types";
import { effectiveFamiliarity } from "@/utils/rank";
import { compressImage } from "@/utils/media";
import AttachmentList from "@/components/AttachmentList.vue";
import AppIcon from "@/components/AppIcon.vue";
import PrivacyPopup from "@/components/PrivacyPopup.vue";

const store = useNotesStore();
const userStore = useUserStore();

const content = ref("");
const scene = ref("");
const customScene = ref("");

/** 时段问候（首页：你此刻坐下来写字的桌子） */
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
});

/** 已有笔记预览（3.2.3 v2.0）：取输入中的第一个标签，无历史不显示；摘要取最近 2 条 */
const previewTag = computed(() => {
  const name = parseTags(content.value)[0] || "";
  if (!name) return null;
  const tag = store.tags.find((t) => t.name === name);
  if (!tag) return null;
  const notes = store.notes
    .filter((n) => n.tags.includes(name) && !n.isDeleted)
    .sort((a, b) => b.createTime - a.createTime);
  return { name, tag, count: notes.length, latestList: notes.slice(0, 2) };
});

/** 有效熟悉度（v2.0 惰性降级）：手动标记原样，推断标记超 30 天无互动逐级降档 */
const previewFam = computed(() =>
  previewTag.value
    ? effectiveFamiliarity(previewTag.value.tag, store.notes)
    : null
);

// =============================================================
// 查看全部抽屉（开发文档 Tab2：半屏抽屉，完整笔记列表）
// =============================================================

const allDrawerTag = ref("");

const drawerNotes = computed(() =>
  allDrawerTag.value
    ? store.notes
        .filter((n) => n.tags.includes(allDrawerTag.value) && !n.isDeleted)
        .sort((a, b) => b.createTime - a.createTime)
    : []
);

// =============================================================
// 熟悉度徽章（v2.0 3.2.3）：预览区圆点点击展开，三选一调整
// =============================================================

const famPickerOpen = ref(false);

const famOptions: { value: Familiarity; label: string }[] = [
  { value: "familiar", label: "😎 能" },
  { value: "fuzzy", label: "😅 有点悬" },
  { value: "unfamiliar", label: "🤔 不能" },
];

function pickFamiliarity(f: Familiarity) {
  if (!previewTag.value) return;
  store.setFamiliarity(previewTag.value.name, f);
  famPickerOpen.value = false;
}

// 自动识别释义提示（3.6.5 入口二）：保存时命中释义句式才出现
const autoDefHint = ref<{ name: string; text: string } | null>(null);
let autoDefTimer: ReturnType<typeof setTimeout> | null = null;

function goAutoDef() {
  const name = autoDefHint.value?.name;
  if (!name) return;
  autoDefHint.value = null;
  uni.navigateTo({
    url: `/pages/tag-detail/tag-detail?name=${encodeURIComponent(name)}`,
  });
}

const scenes = [
  { label: "上班时", type: "work" },
  { label: "看剧时", type: "show" },
  { label: "读书时", type: "reading" },
  { label: "和人聊天", type: "chat" },
  { label: "其他", type: "other" },
];

function selectScene(label: string) {
  scene.value = scene.value === label ? "" : label;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function timeHM(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// =============================================================
// 今天的相遇 / 老朋友提醒（v1.5 首页结构）
// =============================================================

/** 今天写的便签，新的在前 */
const todayNotes = computed(() => {
  const key = dayKey(Date.now());
  return store.notes
    .filter((n) => !n.isDeleted && dayKey(n.createTime) === key)
    .sort((a, b) => b.createTime - a.createTime);
});

function goTagDetail(name: string) {
  if (!name) return;
  uni.navigateTo({
    url: `/pages/tag-detail/tag-detail?name=${encodeURIComponent(name)}`,
  });
}

function goEarlier() {
  uni.navigateTo({ url: "/pages/timeline/timeline" });
}

/** 老朋友提醒：红档中最久未翻看的词，关闭后当日不再出现 */
const HOME_VISIT_KEY = "meetre_home_visit_muted";

const homeVisitMuted = ref(
  uni.getStorageSync(HOME_VISIT_KEY) === dayKey(Date.now())
);

// 回到首页时重新读当日关闭状态（跨天自动复位）
onShow(() => {
  homeVisitMuted.value =
    uni.getStorageSync(HOME_VISIT_KEY) === dayKey(Date.now());
});

const oldFriend = computed(() => {
  if (homeVisitMuted.value) return "";
  const reds = [...store.rankedTags]
    .filter((t) => t.statusLevel === "red")
    .sort((a, b) => (a.lastReviewed || 0) - (b.lastReviewed || 0));
  return reds[0]?.name || "";
});

function goOldFriend() {
  if (oldFriend.value) goTagDetail(oldFriend.value);
}

function dismissOldFriend() {
  homeVisitMuted.value = true;
  uni.setStorageSync(HOME_VISIT_KEY, dayKey(Date.now()));
}

// =============================================================
// 保存后反馈（v1.5 3.2.2）：当天第1-2次记录才弹，已有标记不弹
// 底部轻反馈条，2.5s 自动消失；连续3次未点击 → 冷却3天
// =============================================================

const FAM_ASKED_KEY = "meetre_fam_asked_date";
const FAM_SKIP_KEY = "meetre_fam_skip_count";

const famFeedbackTag = ref("");
let famTimer: ReturnType<typeof setTimeout> | null = null;

function shouldAskFamiliarity(tagName: string): boolean {
  const tag = store.tags.find((t) => t.name === tagName);
  if (!tag || tag.familiarity) return false;

  const today = dayKey(Date.now());
  if (uni.getStorageSync(FAM_ASKED_KEY) === today) return false;

  // 当天第3次+不弹（todayNotes 在 save 后已更新）
  if (todayNotes.value.length > 2) return false;

  const skip = uni.getStorageSync(FAM_SKIP_KEY) || { count: 0, until: 0 };
  if (skip.count >= 3 && Date.now() < skip.until) return false;

  return true;
}

function showFamiliarityBar(tagName: string) {
  famFeedbackTag.value = tagName;
  uni.setStorageSync(FAM_ASKED_KEY, dayKey(Date.now()));
  if (famTimer) clearTimeout(famTimer);
  famTimer = setTimeout(() => dismissFamiliarityBar(true), 2500);
}

function answerFamiliarity(f: Familiarity) {
  store.setFamiliarity(famFeedbackTag.value, f);
  uni.removeStorageSync(FAM_SKIP_KEY); // 有点击 → 重置跳过计数
  dismissFamiliarityBar(false);
}

function dismissFamiliarityBar(skipped: boolean) {
  if (famTimer) {
    clearTimeout(famTimer);
    famTimer = null;
  }
  famFeedbackTag.value = "";
  if (skipped) {
    // 未点击自动消失 → 累计跳过，满3次冷却3天
    const skip = uni.getStorageSync(FAM_SKIP_KEY) || { count: 0, until: 0 };
    skip.count += 1;
    if (skip.count >= 3) {
      skip.until = Date.now() + 3 * 24 * 60 * 60 * 1000;
    }
    uni.setStorageSync(FAM_SKIP_KEY, skip);
  }
}

// =============================================================
// 附件（开发文档 Tab2：图片/录音，云存储上传）
// images 存云文件ID；audios 存 { cloudPath, duration }（秒）
// =============================================================

const attachExpanded = ref(false);
const images = ref<string[]>([]);
const audios = ref<{ cloudPath: string; duration: number }[]>([]);
const uploading = ref(0); // 进行中的上传任务数
const attachmentCount = computed(
  () => images.value.length + audios.value.length
);

/** 上传本地文件到云存储，返回 fileID */
function uploadFile(filePath: string, ext: string): Promise<string> {
  uploading.value += 1;
  const uidVal = userStore.uid || "local_user";
  const cloudPath = `notes/${uidVal}/${Date.now()}_${Math.floor(
    Math.random() * 1e6
  )}.${ext}`;
  return new Promise<string>((resolve, reject) => {
    // eslint-disable-next-line
    uniCloud.uploadFile({
      filePath,
      cloudPath,
      success: (res: any) => resolve(res.fileID),
      fail: (err: any) => reject(err),
    } as any);
  }).finally(() => {
    uploading.value -= 1;
  });
}

/**
 * 隐私协议未同意的恢复流程：
 * 调起微信官方隐私授权弹窗（requirePrivacyAuthorize），同意后自动重试。
 * 注意：openPrivacyContract 只是「阅读」协议不产生授权，直接看协议无法恢复。
 * 防死循环：部分环境（尤其开发者工具）同意后仍可能报 privacy 错，
 * 限制自动重试次数，超限后提示用户，避免 onError→重试→onError 无限空转。
 */
let privacyRetries = 0;
function handlePrivacyError(retry: () => void) {
  console.info("[attach] handlePrivacyError 进入，已重试次数 =", privacyRetries);
  if (privacyRetries >= 2) {
    privacyRetries = 0;
    uni.showModal({
      title: "无法完成隐私授权",
      content: "开发者工具对隐私接口的模拟可能不准，请用真机预览验证；真机如仍失败请升级微信版本",
      showCancel: false,
    });
    return;
  }
  privacyRetries++;
  const reqPrivacy = (uni as any).requirePrivacyAuthorize;
  if (reqPrivacy) {
    reqPrivacy({
      success: () => {
        console.info("[attach] requirePrivacyAuthorize 成功，重试操作");
        retry();
      },
      fail: () => {
        console.info("[attach] requirePrivacyAuthorize 失败（用户拒绝或不可用）");
        privacyRetries = 0;
        uni.showToast({
          title: "需同意《用户隐私保护指引》后才能继续",
          icon: "none",
        });
      },
    });
  } else {
    // 基础库过低（<2.32.3）无授权 API：引导查看协议 + 升级微信
    const openPrivacy = (uni as any).openPrivacyContract;
    if (openPrivacy) {
      uni.showModal({
        title: "需要同意隐私协议",
        content: "当前微信版本过低，请升级微信后重试",
        confirmText: "查看协议",
        success: ({ confirm }) => {
          if (confirm) openPrivacy({});
        },
      });
    } else {
      uni.showToast({ title: "请升级微信后重试", icon: "none" });
    }
  }
}

function chooseImages() {
  console.info("[attach] chooseImages 点击触发");
  const left = 9 - images.value.length;
  if (left <= 0) {
    uni.showToast({ title: "最多 9 张图片", icon: "none" });
    return;
  }
  uni.chooseImage({
    count: left,
    sizeType: ["compressed"],
    success: async ({ tempFilePaths }: any) => {
      privacyRetries = 0;
      uni.showLoading({ title: "上传中…" });
      for (const p of tempFilePaths) {
        try {
          const compressed = await compressImage(p); // 长边1280px/60%质量
          const fileID = await uploadFile(compressed, "jpg");
          images.value.push(fileID);
        } catch (e) {
          console.warn("[attach] 图片上传失败", e);
          uni.showToast({ title: "图片上传失败", icon: "none" });
        }
      }
      uni.hideLoading({ fail: () => {} } as any);
    },
    fail: (err: any) => {
      const msg = (err && err.errMsg) || "";
      console.warn("[attach] chooseImage 失败", msg);
      if (msg.indexOf("privacy") >= 0) {
        // 隐私协议未同意：拉起官方授权弹窗，同意后自动重试选图
        handlePrivacyError(chooseImages);
      } else if (msg.indexOf("cancel") >= 0) {
        // 用户主动取消不提示
      } else if (msg.indexOf("auth") >= 0 || msg.indexOf("deny") >= 0) {
        // 系统权限（相册/相机）被拒过：微信不再弹系统框，引导去设置开启
        guideAlbumPermission();
      } else {
        uni.showToast({ title: "选择图片失败", icon: "none" });
      }
    },
  });
}

/** 相册/相机系统权限被拒后的引导（与录音链路对齐） */
function guideAlbumPermission() {
  uni.getSetting({
    success: ({ authSetting }: any) => {
      const denied =
        authSetting["scope.album"] === false || authSetting["scope.camera"] === false;
      if (!denied) {
        uni.showToast({ title: "选择图片失败", icon: "none" });
        return;
      }
      uni.showModal({
        title: "需要相册权限",
        content: "请在设置中允许使用相册/相机，用于添加图片笔记",
        confirmText: "去设置",
        success: ({ confirm }) => {
          if (confirm) uni.openSetting({});
        },
      });
    },
    fail: () => uni.showToast({ title: "选择图片失败", icon: "none" }),
  });
}

// ---- 录音（uni.getRecorderManager，mp3，单条上限 60s）----

const recorder = uni.getRecorderManager();
const recording = ref(false);
const recordSeconds = ref(0);
let recordTimer: ReturnType<typeof setInterval> | null = null;
let startPending = false; // start() 已发出但未 onStart：防授权弹窗期间连点

recorder.onStart(() => {
  console.info("[attach] recorder.onStart 录音真正开始");
  privacyRetries = 0;
  startPending = false;
  recording.value = true;
  recordSeconds.value = 0;
  recordTimer = setInterval(() => {
    recordSeconds.value += 1;
    if (recordSeconds.value >= 60) stopRecord(); // 单条上限 60s
  }, 1000);
});

recorder.onStop((res: any) => {
  startPending = false;
  recording.value = false;
  clearRecordTimer();
  const duration = Math.round((res.duration || 0) / 1000);
  if (duration < 1) {
    uni.showToast({ title: "录音太短了", icon: "none" });
    return;
  }
  uni.showLoading({ title: "上传中…" });
  uploadFile(res.tempFilePath, "mp3")
    .then((fileID) => {
      audios.value.push({ cloudPath: fileID, duration });
    })
    .catch((e) => {
      console.warn("[attach] 录音上传失败", e);
      uni.showToast({ title: "录音上传失败", icon: "none" });
    })
    .finally(() => uni.hideLoading({ fail: () => {} } as any));
});

recorder.onError((err: any) => {
  console.warn("[attach] recorder.onError:", (err && err.errMsg) || err);
  startPending = false;
  recording.value = false;
  clearRecordTimer();
  const msg = (err && err.errMsg) || "";
  // 微信拦截顺序：隐私层 → scope 授权，errMsg 忠实反映当前失败原因
  if (msg.indexOf("privacy") >= 0) {
    // 隐私协议未同意：拉起官方授权弹窗，同意后自动重试录音
    handlePrivacyError(startRecord);
    return;
  }
  uni.getSetting({
    success: ({ authSetting }: any) => {
      if (authSetting && authSetting["scope.record"] === false) {
        // 明确拒绝过：mp-weixin 不会再弹授权框，必须引导去设置页
        uni.showModal({
          title: "需要录音权限",
          content: "请在设置中允许使用麦克风",
          confirmText: "去设置",
          success: ({ confirm }) => {
            if (confirm) {
              uni.openSetting({
                success: (res: any) => {
                  // 设置页开启后自动继续录音，闭环
                  if (res.authSetting && res.authSetting["scope.record"]) {
                    startRecord();
                  }
                },
              });
            }
          },
        });
      } else {
        uni.showToast({ title: "录音失败，请重试", icon: "none" });
      }
    },
    fail: () => uni.showToast({ title: "录音失败，请重试", icon: "none" }),
  });
});

function clearRecordTimer() {
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
}

function startRecord() {
  if (recording.value || startPending) {
    console.info("[attach] startRecord 忽略重复点击", { recording: recording.value, startPending });
    return;
  }
  console.info("[attach] startRecord 发起录音");
  startPending = true;
  recorder.start({ format: "mp3", duration: 60000 });
}

function stopRecord() {
  if (recording.value) {
    clearRecordTimer(); // 立即停表，防 60s 自动停止时 onStop 回来前多 tick
    recorder.stop();
  }
}

function save() {
  const text = content.value.trim();
  if (!text) {
    uni.showToast({ title: "先写点什么吧", icon: "none" });
    return;
  }
  if (recording.value) {
    uni.showToast({ title: "请先停止录音", icon: "none" });
    return;
  }
  if (uploading.value > 0) {
    // 用 modal 而非 toast：loading 显示中弹 toast 会触发 uni-app 框架内部
    // 的 hideLoading（promise 模式），产生 UnhandledPromiseRejection
    uni.showModal({
      title: "请稍等",
      content: "附件还在上传中，完成后再保存",
      showCancel: false,
    });
    return;
  }
  const tags = parseTags(text);
  const matched = scenes.find((s) => s.label === scene.value);

  const saved = store.addNote(
    text,
    tags[0] || "",
    scene.value === "其他" ? customScene.value.trim() : scene.value,
    matched ? matched.type : "other",
    [...images.value],
    [...audios.value]
  );

  // 命中释义句式 → 显示「已记下你的理解」提示（2.5s 自动消失）
  if (saved) {
    autoDefHint.value = saved;
    if (autoDefTimer) clearTimeout(autoDefTimer);
    autoDefTimer = setTimeout(() => {
      autoDefHint.value = null;
      autoDefTimer = null;
    }, 2500);
  }

  content.value = "";
  scene.value = "";
  customScene.value = "";
  images.value = [];
  audios.value = [];
  attachExpanded.value = false;

  if (!tags.length) {
    uni.showToast({ title: "已保存", icon: "none" });
    return;
  }

  // 已掌握 / 休息中的词记了新笔记 → 自动回到活跃列表（v1.5：行为比标记更诚实）
  const tag = store.tags.find((t) => t.name === tags[0]);
  if (tag && (tag.status === "mastered" || tag.status === "snoozed")) {
    store.setTagStatus(tags[0], "learning");
    uni.showToast({ title: "这位老朋友又回来啦", icon: "none", duration: 2000 });
    return;
  }

  // 系统释义兜底（v1.5）：新 tag 无释义时后台静默拉取
  if (tag && !tag.userDefinition?.text && !tag.sysDefinition) {
    store.fetchSysDefinition(tags[0]); // 不 await，静默后台
  }

  // 保存后反馈（v1.5）：第1-2次记录且未标记过熟悉度；与 autoDefHint 互斥（同屏只留一个轻提示）
  if (!saved && shouldAskFamiliarity(tags[0])) {
    showFamiliarityBar(tags[0]);
  }

  uni.showToast({ title: `已保存 #${tags[0]}` });
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
  display: flex;
  flex-direction: column;
}

/* 问候语：22px 暖墨色，行高 1.3，像翻开本子时的第一行 */
.greeting {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: var(--space-lg);
}

.greet-main {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  line-height: 1.3;
}

.greet-sub {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* 便签纸卡片：偏暖的白 + 若有若无的折痕边 + 暖棕淡影 */
.input-panel {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-sm);
  box-shadow: var(--shadow-card);
}

.custom-panel {
  margin-top: var(--space-md);
}

/* 输入井：浅米底，8px 圆角，不抢卡片的戏 */
.content-input {
  background-color: var(--color-bg-input);
  border-radius: var(--radius-sm);
  padding: var(--space-lg);
  min-height: 200px;
  width: auto;
  font-size: var(--font-size-md);
  line-height: 1.6;
  color: var(--color-text-body);
  box-sizing: border-box;
}

.input-placeholder {
  color: var(--color-text-placeholder);
}

.scene-title {
  margin: var(--space-xl) 0 var(--space-md);
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.scene-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.scene-chip {
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

/* 选中：淡墨金字底，像用淡墨水标出的场景 */
.scene-chip.active {
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

/* 按压态：轻米色反馈 */
.scene-chip:active,
.attach-toggle:active {
  background-color: var(--color-primary-bg);
}

.custom-scene {
  background-color: var(--color-bg-input);
  border-radius: var(--radius-sm);
  padding: var(--space-md) var(--space-lg);
  font-size: var(--font-size-base);
}

/* 已有笔记预览（v2.0）：浅米纸片，不抢输入焦点 */
.preview-panel {
  margin-top: var(--space-md);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.preview-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-dark);
}

.preview-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.preview-note {
  font-size: var(--font-size-xs);
  color: var(--color-text-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-more {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  margin-top: var(--space-xs);
}

/* 熟悉度徽章（v2.0 3.2.3）：彩色小圆点，配色与复习页状态灯一致 */
.fam-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin: 0 3px; /* 给 3px 光晕留出空间 */
}

.fam-unfamiliar {
  background-color: var(--color-red);
  box-shadow: 0 0 0 3px var(--color-red-bg);
}

.fam-fuzzy {
  background-color: var(--color-yellow);
  box-shadow: 0 0 0 3px var(--color-yellow-bg);
}

.fam-familiar {
  background-color: var(--color-green);
  box-shadow: 0 0 0 3px var(--color-green-bg);
}

/* 熟悉度调整面板：三选一横排，选中项淡金底 */
.fam-picker {
  display: flex;
  gap: var(--space-sm);
  padding-top: var(--space-xs);
}

.fam-picker-opt {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: var(--space-sm) 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

.fam-picker-opt.active {
  background-color: var(--color-primary-bg);
  border-color: var(--color-primary);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
}

/* 查看全部抽屉：半透明遮罩 + 底部白色半屏面板 */
.drawer-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 999;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.drawer-panel {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-lg);
  padding-bottom: calc(var(--space-lg) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  max-height: 65vh;
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.drawer-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.drawer-close {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  padding: var(--space-xs);
}

.drawer-list {
  max-height: 55vh;
}

.drawer-item {
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.drawer-item-content {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
  line-height: 1.6;
}

.drawer-item-date {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.drawer-empty {
  text-align: center;
  padding: var(--space-xl) 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

/* 主按钮：暗金印章按在暖纸上——胶囊形、暖白字、金色淡影 */
.save-btn {
  margin-top: var(--space-2xl);
  height: 40px;
  line-height: 40px;
  padding: 0;
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-float);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

/* 附件区域：收起的"···"与展开的操作项 */
.attach-row {
  margin-top: var(--space-md);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.attach-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-md);
}

.attach-toggle-text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  letter-spacing: 2px;
}

.attach-badge {
  font-size: var(--font-size-xs);
  color: var(--color-primary-dark);
}

.attach-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: 6px var(--space-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

/* 按压态：淡金底反馈（置于 .recording 之前，录音中红底不被覆盖） */
.attach-chip:active {
  background-color: var(--color-primary-bg);
}

.attach-chip.recording {
  background-color: var(--color-red);
  border-color: var(--color-red);
  color: var(--color-text-inverse);
}

.attach-preview {
  margin-top: var(--space-md);
}

.save-btn::after {
  border: none;
}

/* 印章按下：颜色加深 + 轻缩 150ms */
.save-btn:active {
  background-color: var(--color-primary-dark);
  transform: scale(0.97);
}

/* 自动识别释义提示条（3.6.5 入口二）：文档流内轻条，不遮挡底部反馈条 */
.autodef-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  background-color: var(--color-primary-bg);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.ad-text {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--color-primary-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ad-link {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary-dark);
}

/* 保存后反馈条（v1.5 3.2.2）：文档流内轻条，淡金底，三选项横排 */
.fam-bar {
  margin-top: var(--space-md);
  background-color: var(--color-primary-bg);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.fam-head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.fam-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-dark);
}

.fam-question {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

.fam-options {
  display: flex;
  gap: var(--space-sm);
}

.fam-opt {
  flex: 1;
  text-align: center;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: var(--space-sm) 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

/* 按压态：淡金反馈 */
.fam-opt:active {
  background-color: var(--color-bg-input);
}

/* 今天的相遇：今天写的便签小卡片 */
.today-section {
  margin-top: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.section-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.today-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.today-card:active {
  background-color: var(--color-bg-input);
}

.today-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.today-tag {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-dark);
}

.today-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  flex-shrink: 0;
}

.today-content {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.earlier-link {
  align-self: flex-end;
  font-size: var(--font-size-sm);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
  padding: var(--space-xs) 0;
}

/* 老朋友提醒：轻声一句，可关 */
.oldfriend-bar {
  margin-top: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

.of-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-sm);
  color: var(--color-primary-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.of-close {
  flex-shrink: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  padding: var(--space-xs);
}
</style>
