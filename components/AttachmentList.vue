<template>
  <view v-if="images.length || audios.length" class="att-list">
    <!-- 图片：宫格缩略图，点击全屏预览 -->
    <!-- 真机上 image 组件不能直接解析 cloud:// 文件ID，必须先换 getTempFileURL 临时链接 -->
    <view v-if="images.length" class="att-imgs">
      <view v-for="(img, i) in images" :key="img" class="att-img-wrap">
        <image
          class="att-img"
          :src="displayImages[i] || img"
          mode="aspectFill"
          @click="preview(i)"
        />
        <text
          v-if="editable"
          class="att-remove"
          @click.stop="$emit('remove-image', i)"
        >✕</text>
      </view>
    </view>

    <!-- 录音：播放条（播放时经 getTempFileURL 换临时链接，带缓存）
         播放中显示：进度条 + 已播放时间 / 总时长 + 剩余时间（倒计时） -->
    <view
      v-for="(a, i) in audios"
      :key="a.cloudPath"
      class="att-audio"
      @click="togglePlay(a.cloudPath)"
    >
      <text class="att-audio-icon">{{ playingPath === a.cloudPath ? "⏸" : "▶" }}</text>
      <view class="att-audio-body">
        <view class="att-audio-label-row">
          <text class="att-audio-text">
            {{ playingPath === a.cloudPath ? "播放中" : "录音" }}
            {{ fmt(currentPlayTime) }} / {{ fmt(a.duration) }}
          </text>
          <text
            v-if="playingPath === a.cloudPath"
            class="att-audio-countdown"
          >-{{ fmt(Math.max(0, (a.duration || 0) - currentPlayTime)) }}</text>
        </view>
        <view class="att-audio-bar">
          <view
            class="att-audio-bar-fill"
            :style="barStyle(a.cloudPath, a.duration)"
          />
        </view>
      </view>
      <text
        v-if="editable"
        class="att-remove audio-remove"
        @click.stop="removeAudio(i)"
      >✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    images?: string[];
    audios?: { cloudPath: string; duration: number }[];
    editable?: boolean;
  }>(),
  { images: () => [], audios: () => [], editable: false }
);

defineEmits<{
  (e: "remove-image", index: number): void;
  (e: "remove-audio", index: number): void;
}>();

// =============================================================
// 云文件ID → 临时链接（全局缓存，图片与录音共用）
// mp-weixin 真机上 image/previewImage 无法直接解析 cloud:// fileID
// =============================================================

const urlCache = new Map<string, Promise<string>>();

function resolveUrl(url: string): Promise<string> {
  if (!url.startsWith("cloud://")) return Promise.resolve(url);
  if (!urlCache.has(url)) {
    urlCache.set(
      url,
      new Promise<string>((resolve, reject) => {
        // eslint-disable-next-line
        uniCloud.getTempFileURL({
          fileList: [url],
          success: (res: any) => {
            const f = res.fileList && res.fileList[0];
            if (f && f.tempFileURL) resolve(f.tempFileURL);
            else reject(new Error("无临时链接"));
          },
          fail: (err: any) => reject(err),
        } as any);
      })
    );
  }
  return urlCache.get(url)!;
}

/** 图片显示链接列表：按 props.images 逐个换临时链接，失败保留原值 */
const displayImages = ref<string[]>([]);
watch(
  () => [...props.images],
  async (imgs) => {
    displayImages.value = await Promise.all(
      imgs.map((u) =>
        resolveUrl(u).catch((e) => {
          console.warn("[attach] 图片临时链接解析失败", u, e);
          return u;
        })
      )
    );
  },
  { immediate: true }
);

function preview(index: number) {
  uni.previewImage({
    urls: displayImages.value,
    current: displayImages.value[index],
  });
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// =============================================================
// 录音播放：云文件ID → 临时链接（缓存），单实例复用
// =============================================================

const playingPath = ref("");
const currentPlayTime = ref(0); // 正在播放的音频当前进度（秒）
let audioCtx: UniApp.InnerAudioContext | null = null;

/** 进度条样式（只有当前播放的那条填充，其他条宽 0） */
function barStyle(cloudPath: string, duration: number): Record<string, string> {
  if (playingPath.value !== cloudPath) return { width: "0%" };
  const total = duration || 0;
  const ratio = total > 0 ? Math.min(1, currentPlayTime.value / total) : 0;
  return { width: `${ratio * 100}%` };
}

function togglePlay(cloudPath: string) {
  if (playingPath.value === cloudPath) {
    audioCtx?.stop();
    playingPath.value = "";
    currentPlayTime.value = 0;
    return;
  }
  audioCtx?.stop();
  playingPath.value = "";
  currentPlayTime.value = 0;
  resolveUrl(cloudPath)
    .then((src) => {
      if (!audioCtx) {
        audioCtx = uni.createInnerAudioContext();
        audioCtx.onTimeUpdate(() => {
          // InnerAudioContext 里的 currentTime / duration 是秒，按秒粒度更新就够
          currentPlayTime.value = audioCtx?.currentTime || 0;
        });
        audioCtx.onEnded(() => {
          playingPath.value = "";
          currentPlayTime.value = 0;
        });
        audioCtx.onError(() => {
          playingPath.value = "";
          currentPlayTime.value = 0;
        });
      }
      audioCtx.src = src;
      currentPlayTime.value = 0;
      audioCtx.play();
      playingPath.value = cloudPath;
    })
    .catch(() => uni.showToast({ title: "播放失败", icon: "none" }));
}

function removeAudio(index: number) {
  if (playingPath.value === props.audios[index]?.cloudPath) {
    audioCtx?.stop();
    playingPath.value = "";
    currentPlayTime.value = 0;
  }
  props.audios.splice(index, 1);
}

onUnmounted(() => {
  audioCtx?.destroy();
  audioCtx = null;
});
</script>

<style scoped>
.att-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.att-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.att-img-wrap {
  position: relative;
}

.att-img {
  width: 120rpx;
  height: 120rpx;
  border-radius: var(--radius-sm); /* 图片缩略图 8px */
  background-color: var(--color-bg-input);
}

.att-remove {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-text-secondary);
  color: var(--color-text-inverse);
  font-size: 20rpx;
  text-align: center;
  line-height: 36rpx;
}

.att-audio {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background-color: var(--color-bg-input);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  align-self: flex-start;
  min-width: 240px;
}

.att-audio-icon {
  font-size: var(--font-size-md);
  color: var(--color-primary-dark);
  flex-shrink: 0;
}

.att-audio-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.att-audio-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.att-audio-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}

.att-audio-countdown {
  font-size: var(--font-size-xs);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* 进度条容器：100% 宽，米色；填充：赭石色，左对齐 */
.att-audio-bar {
  width: 100%;
  height: 4px;
  border-radius: var(--radius-full);
  background-color: var(--color-border-light);
  overflow: hidden;
}
.att-audio-bar-fill {
  height: 100%;
  width: 0;
  border-radius: var(--radius-full);
  background-color: var(--color-primary);
  transition: width 0.2s linear;
}

/* 录音条内的删除按钮：相对定位贴右上，避免干扰条体点击 */
.audio-remove {
  top: -6px;
  right: -6px;
}
</style>
