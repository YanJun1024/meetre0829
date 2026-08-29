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

      <!-- 保存 -->
      <button class="save-btn" @click="save">保存</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { parseTags, useNotesStore } from "@/store/notes";

const store = useNotesStore();

const content = ref("");
const scene = ref("");
const customScene = ref("");

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

function save() {
  const text = content.value.trim();
  if (!text) {
    uni.showToast({ title: "先写点什么吧", icon: "none" });
    return;
  }
  const tags = parseTags(text);
  const matched = scenes.find((s) => s.label === scene.value);

  store.addNote(
    text,
    tags[0] || "",
    scene.value === "其他" ? customScene.value.trim() : scene.value,
    matched ? matched.type : "other"
  );

  content.value = "";
  scene.value = "";
  customScene.value = "";

  if (tags.length) {
    uni.showToast({ title: `已保存 #${tags[0]}` });
  } else {
    uni.showToast({ title: "已保存", icon: "none" });
  }
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

.save-btn {
  margin-top: var(--space-2xl);
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-full);
  /* 白字压赭石底需按大字号标准（WCAG AA Large ≥3:1） */
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.save-btn::after {
  border: none;
}

.save-btn:active {
  background-color: var(--color-primary-dark);
}
</style>
