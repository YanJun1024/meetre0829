<template>
  <view class="page">
    <view class="content">
      <!-- 主输入框：白色操作容器，包住浅米色输入井 -->
      <view class="input-panel">
        <textarea
          v-model="content"
          class="content-input"
          placeholder="今天在哪遇到的？写下来吧"
          placeholder-class="input-placeholder"
          :maxlength="-1"
          auto-height
        />
      </view>

      <!-- 已有笔记预览（开发文档 3.2.3 v2.0）：输入 #tag 且有历史时显示 -->
      <view v-if="previewTag" class="preview-panel">
        <view class="preview-head">
          <text class="preview-title">📖 你之前记过 #{{ previewTag.name }}</text>
          <view
            v-if="previewTag.tag.familiarity"
            class="preview-dot"
            :class="`dot-${previewTag.tag.familiarity}`"
            @click="adjustFamiliarity(previewTag.name)"
          />
          <text class="preview-count">（{{ previewTag.count }}条）</text>
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
      <view class="scene-title">在什么场景遇到的？</view>
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
          <view class="attach-chip" @click="chooseImages">📷 添加图片</view>
          <view v-if="!recording" class="attach-chip" @click="startRecord">
            🎤 添加录音
          </view>
          <view v-else class="attach-chip recording" @click="stopRecord">
            ⏹ 停止录音（{{ recordSeconds }}s）
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
    </view>

    <!-- 保存后轻反馈条（开发文档 3.2.2 v1.5）：非弹窗，2.5s 自动消失 -->
    <view v-if="feedback.visible" class="feedback-bar">
      <text class="fb-title">✅ 已保存 #{{ feedback.tagName }}</text>
      <text class="fb-question">这个词你现在能说出来吗？</text>
      <view class="fb-options">
        <view class="fb-chip" @click="answerFeedback('familiar')">😎 能</view>
        <view class="fb-chip" @click="answerFeedback('fuzzy')">😅 有点悬</view>
        <view class="fb-chip" @click="answerFeedback('unfamiliar')">🤔 不能</view>
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
import { computed, reactive, ref } from "vue";
import type { Familiarity } from "@/types";
import { parseTags, useNotesStore } from "@/store/notes";
import { useUserStore } from "@/store/user";
import { compressImage } from "@/utils/media";
import AttachmentList from "@/components/AttachmentList.vue";
import PrivacyPopup from "@/components/PrivacyPopup.vue";

const store = useNotesStore();
const userStore = useUserStore();

const content = ref("");
const scene = ref("");
const customScene = ref("");

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

/** 点击圆点手动调整熟悉度（用户手动 > 行为推断，开发文档 3.2） */
function adjustFamiliarity(name: string) {
  uni.showActionSheet({
    itemList: ["😎 熟", "😅 有点印象", "🤔 不熟"],
    success: ({ tapIndex }) => {
      const levels: Familiarity[] = ["familiar", "fuzzy", "unfamiliar"];
      store.setFamiliarity(name, levels[tapIndex]);
      uni.showToast({ title: "已更新", icon: "none" });
    },
  });
}

// =============================================================
// 保存后反馈（3.2.2 v1.5）频率控制
// 当天 1-2 次记录才弹 / 该词已有熟悉度不弹 / 连续 3 次未点击静默 3 天
// =============================================================

const SAVE_STAT_KEY = "meetre_save_stat";
const FB_MISSES_KEY = "meetre_fb_misses";
const FB_MUTED_KEY = "meetre_fb_muted_until";
const FEEDBACK_DURATION = 2500; // 2.5s 自动消失

const feedback = reactive({ visible: false, tagName: "" });
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

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

/** 尝试展示反馈条；展示则返回 true（保存 toast 让位给反馈条） */
function tryShowFeedback(tagName: string, saveCount: number): boolean {
  const tag = store.tags.find((t) => t.name === tagName);
  const mutedUntil = uni.getStorageSync(FB_MUTED_KEY) || 0;
  const canShow =
    saveCount <= 2 && !tag?.familiarity && Date.now() >= mutedUntil;
  if (!canShow) return false;

  feedback.tagName = tagName;
  feedback.visible = true;
  feedbackTimer = setTimeout(() => {
    // 未点击自动消失：计入连续未点击，满 3 次静默 3 天
    feedback.visible = false;
    feedbackTimer = null;
    const misses = (uni.getStorageSync(FB_MISSES_KEY) || 0) + 1;
    if (misses >= 3) {
      uni.setStorageSync(FB_MISSES_KEY, 0);
      uni.setStorageSync(FB_MUTED_KEY, Date.now() + 3 * 24 * 60 * 60 * 1000);
    } else {
      uni.setStorageSync(FB_MISSES_KEY, misses);
    }
  }, FEEDBACK_DURATION);
  return true;
}

/** 点击：用户手动标记熟悉度（优先级高于行为推断） */
function answerFeedback(level: Familiarity) {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }
  feedback.visible = false;
  uni.setStorageSync(FB_MISSES_KEY, 0); // 点击重置连续未点击计数
  store.setFamiliarity(feedback.tagName, level);
  uni.showToast({ title: "已记录", icon: "none" });
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

  store.addNote(
    text,
    tags[0] || "",
    scene.value === "其他" ? customScene.value.trim() : scene.value,
    matched ? matched.type : "other",
    [...images.value],
    [...audios.value]
  );

  content.value = "";
  scene.value = "";
  customScene.value = "";
  images.value = [];
  audios.value = [];
  attachExpanded.value = false;

  // 当天记录计数（反馈条频率控制）
  const stat = uni.getStorageSync(SAVE_STAT_KEY) || { date: "", count: 0 };
  const today = dayKey(Date.now());
  const saveCount = stat.date === today ? stat.count + 1 : 1;
  uni.setStorageSync(SAVE_STAT_KEY, { date: today, count: saveCount });

  if (!tags.length) {
    uni.showToast({ title: "已保存", icon: "none" });
    return;
  }

  // 已掌握标签记新笔记 → 确认重新加入复习（开发文档 3.3.2）
  const tag = store.tags.find((t) => t.name === tags[0]);
  if (tag?.status === "mastered") {
    uni.showModal({
      title: "重新加入复习吗？",
      content: `笔记已保存。#${tags[0]} 已在已掌握词库，重新加入后将继续参与排名复习`,
      confirmText: "加入",
      cancelText: "暂不",
      success: ({ confirm }) => {
        if (confirm) store.setTagStatus(tags[0], "learning");
      },
    });
    return; // 恢复确认优先，本次不再弹熟悉度反馈
  }

  if (tryShowFeedback(tags[0], saveCount)) {
    return; // 反馈条已包含「已保存」提示
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

/* 操作交互层：白色容器，与米色内容层形成层次 */
.input-panel {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-sm);
  box-shadow: var(--shadow-card);
}

.custom-panel {
  margin-top: var(--space-md);
}

/* 输入框内部：浅米色输入井，嵌在白色容器中 */
.content-input {
  background-color: var(--color-bg-input);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  min-height: 200px;
  width: auto;
  font-size: var(--font-size-base);
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
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-full);
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

.scene-chip.active {
  background-color: var(--color-primary-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.custom-scene {
  background-color: var(--color-bg-input);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
  font-size: var(--font-size-base);
}

/* 已有笔记预览（v2.0）：轻量米色卡片，不抢输入焦点 */
.preview-panel {
  margin-top: var(--space-md);
  background-color: var(--color-bg-page);
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
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-dark);
}

.preview-dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.dot-familiar {
  background-color: var(--color-green);
}

.dot-fuzzy {
  background-color: var(--color-yellow);
}

.dot-unfamiliar {
  background-color: var(--color-red);
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
  background-color: var(--color-bg-page);
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

.save-btn {
  margin-top: var(--space-2xl);
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-full);
  /* 白字压赭石底需按大字号标准（WCAG AA Large ≥3:1） */
  font-size: var(--font-size-lg);
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
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
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

.save-btn:active {
  background-color: var(--color-primary-dark);
}

/* 保存后轻反馈条：底部卡片，非弹窗不阻断 */
.feedback-bar {
  position: fixed;
  left: var(--space-lg);
  right: var(--space-lg);
  bottom: calc(var(--space-lg) + env(safe-area-inset-bottom));
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  z-index: 998;
}

.fb-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary-dark);
}

.fb-question {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.fb-options {
  display: flex;
  gap: var(--space-sm);
}

.fb-chip {
  flex: 1;
  text-align: center;
  background-color: var(--color-primary-bg);
  border-radius: var(--radius-full);
  padding: var(--space-sm) 0;
  font-size: var(--font-size-sm);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
}

.fb-chip:active {
  background-color: var(--color-bg-input);
}
</style>
