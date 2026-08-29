<template>
  <view v-if="images.length || audios.length" class="att-list">
    <!-- 图片：宫格缩略图，点击全屏预览（image 组件直接支持云文件ID） -->
    <view v-if="images.length" class="att-imgs">
      <view v-for="(img, i) in images" :key="img" class="att-img-wrap">
        <image
          class="att-img"
          :src="img"
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

    <!-- 录音：播放条（播放时经 getTempFileURL 换临时链接，带缓存） -->
    <view
      v-for="(a, i) in audios"
      :key="a.cloudPath"
      class="att-audio"
      @click="togglePlay(a.cloudPath)"
    >
      <text class="att-audio-icon">{{ playingPath === a.cloudPath ? "⏸" : "▶" }}</text>
      <text class="att-audio-text">录音 {{ fmt(a.duration) }}</text>
      <text
        v-if="editable"
        class="att-remove"
        @click.stop="removeAudio(i)"
      >✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";

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

function preview(index: number) {
  uni.previewImage({ urls: props.images, current: props.images[index] });
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// =============================================================
// 录音播放：云文件ID → 临时链接（缓存），单实例复用
// =============================================================

const playingPath = ref("");
const tempUrlCache = new Map<string, Promise<string>>();
let audioCtx: UniApp.InnerAudioContext | null = null;

function resolveAudio(cloudPath: string): Promise<string> {
  if (!cloudPath.startsWith("cloud://")) return Promise.resolve(cloudPath);
  if (!tempUrlCache.has(cloudPath)) {
    tempUrlCache.set(
      cloudPath,
      new Promise<string>((resolve, reject) => {
        // eslint-disable-next-line
        uniCloud.getTempFileURL({
          fileList: [cloudPath],
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
  return tempUrlCache.get(cloudPath)!;
}

function togglePlay(cloudPath: string) {
  if (playingPath.value === cloudPath) {
    audioCtx?.stop();
    playingPath.value = "";
    return;
  }
  audioCtx?.stop();
  resolveAudio(cloudPath)
    .then((src) => {
      if (!audioCtx) {
        audioCtx = uni.createInnerAudioContext();
        audioCtx.onEnded(() => (playingPath.value = ""));
        audioCtx.onError(() => (playingPath.value = ""));
      }
      audioCtx.src = src;
      audioCtx.play();
      playingPath.value = cloudPath;
    })
    .catch(() => uni.showToast({ title: "播放失败", icon: "none" }));
}

function removeAudio(index: number) {
  if (playingPath.value === props.audios[index]?.cloudPath) {
    audioCtx?.stop();
    playingPath.value = "";
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
  border-radius: var(--radius-md);
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
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background-color: var(--color-bg-input);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-md);
  align-self: flex-start;
}

.att-audio-icon {
  font-size: var(--font-size-sm);
  color: var(--color-primary-dark);
}

.att-audio-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
}
</style>
