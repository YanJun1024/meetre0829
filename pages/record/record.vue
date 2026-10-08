<template>
  <view class="page">
    <view class="content">
      <!-- 问候：像坐下来写字时，有人轻声打招呼 -->
      <view class="greeting">
        <text class="greet-main">{{ greeting }}</text>
        <text class="greet-sub">今天遇到什么新词了吗？</text>
      </view>

      <!-- 输入卡片：遇到的词 + 笔记（v1.6 定稿） -->
      <view class="input-card" :style="{ opacity: cardOpacity }">
        <text class="input-label">遇到的词</text>
        <input
          v-model="word"
          class="word-input"
          placeholder="写下一个词"
          placeholder-class="word-placeholder"
          :maxlength="50"
          :focus="wordFocus"
          confirm-type="next"
        />
        <!-- v1.6：已存在轻提示 -->
        <view v-if="existInfo" class="exist-hint show">
          你已经跟它相遇过 {{ existInfo.count }} 次了
        </view>
        <view class="divider" />
        <textarea
          v-model="note"
          class="note-input"
          placeholder="在哪里遇到的？什么场景？"
          placeholder-class="note-placeholder"
          :maxlength="200"
          auto-height
        />

        <!-- 附件区域：图片 + 录音（云存储，隐私授权链路见下方脚本） -->
        <view class="attach-row">
          <view class="attach-chip" @click="chooseImages">
            <AppIcon name="camera" :size="15" />
            <text>添加照片{{ images.length ? `（${images.length}）` : "（可选）" }}</text>
          </view>
          <view v-if="!recording" class="attach-chip" @click="startRecord">
            <AppIcon name="mic" :size="15" />
            <text>添加录音{{ audios.length ? `（${audios.length}）` : "" }}</text>
          </view>
          <view v-else class="attach-chip recording" @click="stopRecord">
            <AppIcon name="stop" :size="15" color="#FFFEF5" />
            <text>停止录音（{{ recordSeconds }}s）</text>
          </view>
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

        <view class="input-footer">
          <view class="scene-btn" @click="sceneSheetOpen = true">
            <text v-if="currentScene">{{ currentScene.icon }} {{ currentScene.label }}</text>
            <text v-else>＋ 场景</text>
          </view>
          <button class="save-btn" @click="save">记下来</button>
        </view>
      </view>

      <!-- 自动识别释义提示：2.5s 自动消失，点击去详情 -->
      <view v-if="autoDefHint" class="autodef-bar" @click="goAutoDef">
        <AppIcon name="book" :size="14" color="#9A7209" />
        <text class="ad-text"
          >已记下你对 {{ autoDefHint.name }} 的理解：{{ autoDefHint.text }}</text
        >
        <view class="ad-link">
          <AppIcon name="edit" :size="13" color="#9A7209" />
          <text>看看</text>
        </view>
      </view>

      <!-- 今天的相遇 -->
      <view class="today-section">
        <view class="section-head">
          <text class="title-deco">今天的相遇</text>
          <text class="section-count">{{ todayNotes.length }} 个</text>
        </view>

        <!-- v1.6 首页扉页：今天还没有记录时 -->
        <view v-if="!todayNotes.length" class="flyleaf">
          <text class="flyleaf-mark">✦ 欢 迎 ✦</text>
          <text class="flyleaf-title">这是你和单词的相遇本</text>
          <text class="flyleaf-desc">记下你遇到的第一个词吧</text>
          <text class="flyleaf-sign">—— MeetRe ——</text>
        </view>

        <view
          v-for="n in todayNotes"
          :key="'today:' + (n._id || n.id)"
          class="today-item"
          @click="goTagDetail(n.word)"
        >
          <view class="today-icon">
            <image
              v-if="n.image"
              class="today-icon-img"
              :src="n.image"
              mode="aspectFill"
            />
            <text v-else>{{ n.sceneIcon }}</text>
          </view>
          <view class="today-body">
            <text class="today-word">{{ n.word }}</text>
            <text class="today-note">{{ n.noteText || "（没有写笔记）" }}</text>
          </view>
          <view class="today-badge">
            <text v-if="n.isFirst" class="badge badge-first">初遇</text>
            <text v-else class="badge badge-count">{{ n.count }} 次</text>
          </view>
        </view>

        <view class="more-link" @click="goEarlier">
          <text>查看更早的记录 →</text>
        </view>
      </view>

      <!-- v1.6 老朋友提醒：白卡片，每日确定性换一个，不可关闭 -->
      <view v-if="oldFriend" class="old-friend-card" @click="goTagDetail(oldFriend)">
        <text class="old-label">💭 这位老朋友好久没见了</text>
        <view class="old-row">
          <text class="old-word">{{ oldFriend }}</text>
          <text class="old-go">去看看 →</text>
        </view>
      </view>
    </view>

    <!-- 场景选择弹层（v1.6：底部网格） -->
    <view v-if="sceneSheetOpen" class="sheet-mask" @click="sceneSheetOpen = false">
      <view class="sheet" @click.stop>
        <text class="sheet-title">选择场景</text>
        <view class="scene-grid">
          <view
            v-for="s in scenes"
            :key="'scene:' + s.label"
            class="scene-grid-item"
            :class="{ active: currentScene?.label === s.label }"
            @click="selectScene(s)"
          >
            <text class="scene-icon">{{ s.icon }}</text>
            <text class="scene-name">{{ s.label }}</text>
          </view>
        </view>
        <view class="sheet-cancel" @click="sceneSheetOpen = false">取消</view>
      </view>
    </view>

    <!-- 全局隐私授权弹窗（含官方 agreePrivacyAuthorization 按钮） -->
    <PrivacyPopup />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { findTagCI, normalizeWord, useNotesStore } from "@/store/notes";
import { useUserStore } from "@/store/user";
import { pickOldFriend } from "@/utils/rank";
import { compressImage } from "@/utils/media";
import AttachmentList from "@/components/AttachmentList.vue";
import AppIcon from "@/components/AppIcon.vue";
import PrivacyPopup from "@/components/PrivacyPopup.vue";

const store = useNotesStore();
const userStore = useUserStore();

const word = ref("");
const note = ref("");
const cardOpacity = ref(1);
const wordFocus = ref(false);

// 从「我的词」搜索无结果跳回：带入搜索词并聚焦单词框
onShow(() => {
  try {
    const pending = uni.getStorageSync("meetre_pending_word");
    if (pending) {
      uni.removeStorageSync("meetre_pending_word");
      word.value = String(pending);
      nextTick(() => {
        wordFocus.value = true;
      });
    }
  } catch (e) {
    /* 忽略 */
  }
});

interface SceneOption {
  label: string;
  type: string;
  icon: string;
}

/** v1.6 场景：随手记 / 读书 / 看剧 / 聊天 / 播客 / 其他 */
const scenes: SceneOption[] = [
  { label: "随手记", type: "casual", icon: "📝" },
  { label: "读书", type: "reading", icon: "📖" },
  { label: "看剧", type: "show", icon: "📺" },
  { label: "聊天", type: "chat", icon: "💬" },
  { label: "播客", type: "podcast", icon: "🎧" },
  { label: "其他", type: "other", icon: "✨" },
];

const currentScene = ref<SceneOption | null>(null);
const sceneSheetOpen = ref(false);

function selectScene(s: SceneOption) {
  currentScene.value = currentScene.value?.label === s.label ? null : s;
  sceneSheetOpen.value = false;
}

/** 时段问候（v1.6） */
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "早上好 ☀️";
  if (h >= 12 && h < 18) return "下午好 🌤️";
  if (h >= 18 && h < 23) return "晚上好 ☁️";
  return "还没睡呀 ✦";
});

/** v1.6：输入单词时查重（大小写不敏感），返回相遇次数
 *  用 debouncedWord 避免每输入一个字符就遍历全量 tags+notes */
const debouncedWord = ref("");
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(word, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debouncedWord.value = val;
  }, 300);
});

const existInfo = computed(() => {
  const w = normalizeWord(debouncedWord.value);
  if (!w) return null;
  const tag = findTagCI(store.tags, w);
  if (!tag) return null;
  const count = store.notes.filter(
    (n) => n.tags.includes(tag.name) && !n.isDeleted
  ).length;
  return count > 0 ? { name: tag.name, count } : null;
});

// 自动识别释义提示：保存时命中释义句式才出现
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

function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// =============================================================
// 今天的相遇（v1.6：场景图标 / 单词 / 笔记 / 初遇或 N 次徽章）
// =============================================================

interface TodayItem {
  id: string;
  word: string;
  noteText: string;
  sceneIcon: string;
  image: string;
  count: number;
  isFirst: boolean;
}

const todayNotes = computed<TodayItem[]>(() => {
  const key = dayKey(Date.now());
  const items: TodayItem[] = [];
  const sorted = store.notes
    .filter((n) => !n.isDeleted && dayKey(n.createTime) === key)
    .sort((a, b) => b.createTime - a.createTime);
  for (const n of sorted) {
    const w = n.tags[0] || "";
    const wordNotes = store.notes.filter(
      (x) => x.tags.includes(w) && !x.isDeleted
    );
    items.push({
      id: n.id,
      word: w,
      noteText: n.content || "",
      sceneIcon: scenes.find((s) => s.type === n.sceneType)?.icon || "✨",
      image: n.images?.[0] || "",
      count: wordNotes.length,
      isFirst: wordNotes.length === 1,
    });
  }
  return items;
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

// =============================================================
// 老朋友提醒（v1.6 算法：活跃 / ≥2 次 / >7 天未见 / 候选≥3 / 每日一个）
// =============================================================

const oldFriend = computed(
  () => pickOldFriend(store.tags, store.notes)?.name || ""
);

// =============================================================
// 附件（图片/录音，云存储上传）
// images 存云文件ID；audios 存 { cloudPath, duration }（秒）
// =============================================================

const images = ref<string[]>([]);
const audios = ref<{ cloudPath: string; duration: number }[]>([]);
const uploading = ref(0); // 进行中的上传任务数

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
  const w = word.value.trim();
  if (!w) {
    uni.showToast({ title: "先写下一个词吧", icon: "none" });
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

  const norm = normalizeWord(w);
  const text = note.value.trim();
  // 保存前判定：首次相遇 / 老朋友回归（休息中或已掌握的词又记了新笔记）
  const existedTag = findTagCI(store.tags, norm);
  const isFirst = !existedTag;
  const isBack =
    !!existedTag &&
    (existedTag.status === "mastered" || existedTag.status === "snoozed");
  const sceneOpt = currentScene.value || scenes[5]; // 默认「其他」

  const saved = store.addNote(
    text,
    norm,
    sceneOpt.label,
    sceneOpt.type,
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

  // 已掌握 / 休息中的词记了新笔记 → 自动回到活跃列表（行为比标记更诚实）
  if (isBack) {
    store.setTagStatus(norm, "learning");
  }

  // 系统释义兜底：新词无释义时后台静默拉取
  const tagAfter = findTagCI(store.tags, norm);
  if (tagAfter && !tagAfter.userDefinition?.text && !tagAfter.sysDefinition) {
    store.fetchSysDefinition(norm); // 不 await，静默后台
  }

  // v1.6 保存反馈：第一次相遇 / 老朋友回归 / 普通
  const tip = isFirst
    ? "第一次相遇 ✦"
    : isBack
    ? "这位老朋友又回来啦"
    : "记下来啦";
  uni.showToast({ title: tip, icon: "none", duration: 1800 });

  // 清空输入
  word.value = "";
  note.value = "";
  currentScene.value = null;
  images.value = [];
  audios.value = [];

  // v1.6：输入卡片轻闪
  cardOpacity.value = 0.82;
  setTimeout(() => {
    cardOpacity.value = 1;
  }, 120);
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
  min-height: 100vh;
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
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  line-height: 1.3;
}

.greet-sub {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* v1.6 输入卡片：白卡 + 细边 + 暖影 */
.input-card {
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  box-shadow: var(--shadow-card);
  transition: opacity 0.3s;
}

.input-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  letter-spacing: 0.08em;
  margin-bottom: var(--space-xs);
}

.word-input {
  width: 100%;
  height: 40px;
  line-height: 40px;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  padding: 0;
  box-sizing: border-box;
}

:deep(.word-placeholder) {
  color: var(--color-text-placeholder);
  font-weight: 400;
  font-size: var(--font-size-2xl);
  line-height: 40px;
}

:deep(.note-placeholder) {
  color: var(--color-text-placeholder);
  font-size: var(--font-size-md);
}

/* v1.6 已存在提示 */
.exist-hint {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  padding: 2px 0 6px;
  letter-spacing: 0.02em;
}

.divider {
  height: 1px;
  background-color: var(--color-border);
}

.note-input {
  width: 100%;
  font-size: var(--font-size-md);
  line-height: 1.6;
  color: var(--color-text-body);
  padding: 10px 0;
  min-height: 50px;
  box-sizing: border-box;
}

/* 附件区域 */
.attach-row {
  margin-top: var(--space-xs);
  margin-bottom: var(--space-xs);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
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
  margin-top: var(--space-sm);
}

/* 卡片底部：场景按钮 + 记下来 */
.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-md);
}

.scene-btn {
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  padding: 8px 14px;
  border-radius: 14px;
}

.scene-btn:active {
  background-color: var(--color-primary-bg);
}

.save-btn {
  height: 36px;
  line-height: 36px;
  padding: 0 28px;
  margin: 0;
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-float);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.save-btn::after {
  border: none;
}

/* 印章按下：颜色加深 + 轻缩 150ms */
.save-btn:active {
  background-color: var(--color-primary-dark);
  transform: scale(0.97);
}

/* 自动识别释义提示条：文档流内轻条 */
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

/* 今天的相遇 */
.today-section {
  margin-top: 28px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.title-deco {
  position: relative;
  padding-left: 10px;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  letter-spacing: 0.02em;
}

.title-deco::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 14px;
  background-color: var(--color-primary);
  border-radius: 2px;
  opacity: 0.85;
}

.section-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.today-item {
  display: flex;
  align-items: center;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
  box-shadow: var(--shadow-card);
}

.today-item:active {
  transform: scale(0.99);
}

.today-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  margin-right: 12px;
  flex-shrink: 0;
  overflow: hidden;
}

.today-icon-img {
  width: 100%;
  height: 100%;
}

.today-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.today-word {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.today-note {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.today-badge {
  margin-left: var(--space-sm);
  flex-shrink: 0;
}

.badge {
  font-size: var(--font-size-xs);
  padding: 3px 10px;
  border-radius: 10px;
}

.badge-first {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.badge-count {
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
}

.more-link {
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  padding: 14px 0 4px;
}

/* v1.6 扉页空状态 */
.flyleaf {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
}

.flyleaf-mark {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  letter-spacing: 0.6em;
  padding-left: 0.6em;
  margin-bottom: 22px;
}

.flyleaf-title {
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.06em;
  margin-bottom: 12px;
}

.flyleaf-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 2;
}

.flyleaf-sign {
  margin-top: 28px;
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  letter-spacing: 0.15em;
}

/* v1.6 老朋友卡片 */
.old-friend-card {
  margin-top: 20px;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 16px 18px;
}

.old-friend-card:active {
  transform: scale(0.99);
}

.old-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
}

.old-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--space-sm);
}

.old-word {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.old-go {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
}

/* 底部弹层（场景选择） */
.sheet-mask {
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

.sheet {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-lg);
  padding-bottom: calc(var(--space-lg) + env(safe-area-inset-bottom));
}

.sheet-title {
  display: block;
  text-align: center;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-md);
}

.scene-grid {
  display: flex;
  flex-wrap: wrap;
}

.scene-grid-item {
  width: 33.33%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-md) 0;
}

.scene-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background-color: var(--color-bg-secondary);
  text-align: center;
  line-height: 44px;
  font-size: 20px;
}

.scene-grid-item.active .scene-icon {
  background-color: var(--color-primary-bg);
}

.scene-name {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

.scene-grid-item.active .scene-name {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.sheet-cancel {
  margin-top: var(--space-md);
  text-align: center;
  padding: var(--space-md) 0;
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}
</style>
