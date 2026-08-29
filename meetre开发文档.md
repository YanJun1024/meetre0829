MeetRe 开发文档
1\. 项目概述
1.1 产品信息
项目	内容
产品名称	MeetRe
产品定位	复习驱动的场景化单词学习工具
核心价值	"记笔记越多的词，说明越没记住"——排名驱动复习
品牌Slogan	"MeetRe：在复习时，重新遇见你记过的东西。"
目标平台	微信小程序（优先）、App（后续）
1.2 技术栈
层级	技术选型
前端框架	Vue 3 + uni-app
状态管理	Pinia
后端	uniCloud（阿里云）
数据库	uniCloud 云数据库
认证	uni-id（微信登录 + 手机号登录）
前端语言	TypeScript
1.3 核心交互图
text
用户打开小程序
&#x20;   │
&#x20;   ▼
加载页（自动登录，无感）
&#x20;   │
&#x20;   ▼
首页（复习Tab - 默认）
&#x20;   │
&#x20;   ├── 排名列表（按排名分降序）
&#x20;   │   ├── 点击卡片 → 进入标签详情页
&#x20;   │   ├── 左滑卡片 → 词典视图（我的理解）
&#x20;   │   ├── 右滑卡片 → 笔记列表视图
&#x20;   │   └── 长按卡片 → 操作菜单（已掌握/暂时不想看/删除）
&#x20;   │
&#x20;   ├── 顶部搜索框 → 搜索已记录标签
&#x20;   ├── 最近标签快捷入口（3-5个）
&#x20;   │
&#x20;   ▼
底部Tab切换
&#x20;   │
&#x20;   ├── 📚 复习（默认首页）
&#x20;   ├── ✍️ 记录
&#x20;   └── 👤 我的
&#x20;   │
&#x20;   ▼
浮动"+"按钮（常驻，快速记录）
2\. 信息架构
2.1 底部导航结构
text
┌─────────────────────────────────────────────────────────────────┐
│                        底部导航（3个Tab）                      │
├─────────────────────────────────────────────────────────────────┤
│  Tab 1: 📚 复习（默认首页）                                   │
│  ├── 顶部：搜索框（搜索已记录标签）                           │
│  │   └── 下方：最近标签快捷入口（3-5个）                     │
│  ├── 主体：标签排名卡片列表                                   │
│  │   ├── 卡片内容：排名 + 标签名 + 笔记数 + 复习状态         │
│  │   ├── 点击 → 标签详情页                                   │
│  │   ├── 左滑 → 词典视图（"我的理解"）                      │
│  │   ├── 右滑 → 笔记列表视图（当前标签）                     │
│  │   └── 长按 → 操作菜单（已掌握/暂时不想看/删除）          │
│  └── 底部：浮动"+"按钮                                        │
├─────────────────────────────────────────────────────────────────┤
│  Tab 2: ✍️ 记录                                               │
│  ├── 主输入框（内容 + #标签）                                │
│  │   └── 占位文字："今天在哪遇到的？写下来吧"                │
│  ├── 场景选择区域                                             │
│  │   ├── 5个预设选项：\[上班时]\[看剧时]\[读书时]\[和人聊天]\[其他]│
│  │   └── "其他"选中 → 展开自定义输入框                       │
│  ├── 已有笔记预览区域（输入#tag后自动显示）                  │
│  │   ├── 显示：最近2条笔记摘要                                │
│  │   ├── 熟悉度徽章（🟡 有点印象）← 可点击调整              │
│  │   └── \[查看全部] → 半屏抽屉（完整笔记列表）              │
│  ├── 附件区域（三个点展开）                                  │
│  │   ├── 默认收起，显示"···"                                 │
│  │   ├── 点击展开：\[📷 添加图片]\[🎤 添加录音]              │
│  │   └── 有附件时显示数量标 (1)                              │
│  └── 底部：\[保存] 按钮                                       │
├─────────────────────────────────────────────────────────────────┤
│  Tab 3: 👤 我的                                               │
│  ├── 头部：用户信息 + 核心数据                               │
│  │   ├── 头像 + 昵称                                        │
│  │   └── 数据：学习天数 / 掌握词数 / 累计记录 / 连续天数 / 本周复习│
│  ├── 复习趋势图（近7天复习次数柱状图）                       │
│  ├── 当前最需复习 TOP 3（带"去复习"按钮）                   │
│  ├── 最近动态（流水账）                                     │
│  ├── 已掌握词库入口                                          │
│  └── 设置区                                                  │
└─────────────────────────────────────────────────────────────────┘
3\. 核心功能设计
3.1 排名机制
核心逻辑： 标签按"排名分"降序排列，排名分越高 = 越需要复习。

3.1.1 排名分计算公式
text
原始排名分 = 笔记数 × 1 + 查词典次数 × 2 + 回看笔记次数 × 1
最终排名分 = 原始排名分 × 时间衰减系数 × 熟悉度系数
3.1.2 行为权重
行为	权重	说明
记一条笔记	+1	基础行为
查词典（左滑看释义）	+2	强信号：用户需要确认
回看笔记（右滑）	+1	中等信号
3.1.3 熟悉度系数
熟悉度	系数	说明
不熟（🔴）	× 1.5	排名更靠前
有点印象（🟡）	× 1.0	默认
熟（🟢）	× 0.3	排名大幅靠后
3.1.4 时间衰减配置
配置项	默认值	说明
DECAY\_START\_DAYS	30	多少天后开始衰减
DECAY\_MIN\_FACTOR	0.5	最低衰减到 0.5
DECAY\_RATE	0.02	每天衰减 2%
3.1.5 完整实现代码
typescript
// \============================================================
// MeetRe 排名计算核心逻辑
// \============================================================

const RANK\_CONFIG = {
&#x20; NOTE\_WEIGHT: 1,
&#x20; DICT\_LOOKUP\_WEIGHT: 2,
&#x20; NOTE\_REVIEW\_WEIGHT: 1,
&#x20; DECAY\_START\_DAYS: 30,
&#x20; DECAY\_MIN\_FACTOR: 0.5,
&#x20; DECAY\_RATE: 0.02,
&#x20; REMASTER\_INIT\_SCORE: 1,
}

const FAMILIARITY\_WEIGHT = {
&#x20; unfamiliar: 1.5,
&#x20; fuzzy: 1.0,
&#x20; familiar: 0.3,
}

interface Note {
&#x20; id: string
&#x20; tags: string\[]
&#x20; createTime: number
&#x20; isDeleted: boolean
&#x20; dictLookups: number
&#x20; noteReviews: number
}

interface Tag {
&#x20; name: string
&#x20; status: 'learning' | 'mastered' | 'snoozed'
&#x20; masteredAt?: number
&#x20; snoozeExpireAt?: number
&#x20; lastReviewed?: number
&#x20; notes: string\[]
&#x20; rankScore: number
&#x20; familiarity: 'unfamiliar' | 'fuzzy' | 'familiar' | null
&#x20; familiarityUpdatedAt?: number
&#x20; userDefinition: {
&#x20;   text: string
&#x20;   source: 'auto' | 'manual'
&#x20;   weak: boolean
&#x20;   updatedAt: number
&#x20; } | null
}

interface RankedTag extends Tag {
&#x20; rank: number
&#x20; score: number
&#x20; noteCount: number
&#x20; statusLevel: 'red' | 'yellow' | 'green'
}

function calculateTagScore(
&#x20; tag: Tag,
&#x20; notes: Note\[],
&#x20; now: number = Date.now()
): { score: number; noteCount: number } {
&#x20; const tagNotes = notes.filter(n =>
&#x20;   n.tags.includes(tag.name) && !n.isDeleted
&#x20; )

&#x20; const noteCount = tagNotes.length
&#x20; if (noteCount \=== 0) return { score: 0, noteCount: 0 }

&#x20; let behaviorScore = 0
&#x20; tagNotes.forEach(note => {
&#x20;   behaviorScore += RANK\_CONFIG.NOTE\_WEIGHT
&#x20;   behaviorScore += (note.dictLookups || 0) \* RANK\_CONFIG.DICT\_LOOKUP\_WEIGHT
&#x20;   behaviorScore += (note.noteReviews || 0) \* RANK\_CONFIG.NOTE\_REVIEW\_WEIGHT
&#x20; })

&#x20; const lastActiveTime = Math.max(
&#x20;   ...tagNotes.map(n => n.createTime),
&#x20;   tag.lastReviewed || 0
&#x20; )
&#x20; const daysSinceActive = (now - lastActiveTime) / (24 \* 60 \* 60 \* 1000)

&#x20; let decayFactor = 1
&#x20; if (daysSinceActive > RANK\_CONFIG.DECAY\_START\_DAYS) {
&#x20;   const decayDays = daysSinceActive - RANK\_CONFIG.DECAY\_START\_DAYS
&#x20;   decayFactor = Math.max(
&#x20;     RANK\_CONFIG.DECAY\_MIN\_FACTOR,
&#x20;     1 - decayDays \* RANK\_CONFIG.DECAY\_RATE
&#x20;   )
&#x20; }

&#x20; const familiarityFactor = tag.familiarity
&#x20;   ? FAMILIARITY\_WEIGHT\[tag.familiarity] || 1.0
&#x20;   : 1.0

&#x20; return {
&#x20;   score: behaviorScore \* decayFactor \* familiarityFactor,
&#x20;   noteCount,
&#x20; }
}

function computeRankedTags(
&#x20; tags: Tag\[],
&#x20; notes: Note\[],
&#x20; now: number = Date.now()
): RankedTag\[] {
&#x20; const activeTags = tags.filter(t =>
&#x20;   t.status !\== 'mastered' && t.status !\== 'snoozed'
&#x20; )

&#x20; const scored = activeTags.map(tag => {
&#x20;   const { score, noteCount } = calculateTagScore(tag, notes, now)
&#x20;   return { ...tag, score, noteCount }
&#x20; })

&#x20; const sorted = scored.sort((a, b) => b.score - a.score)

&#x20; return sorted.map((tag, index) => ({
&#x20;   ...tag,
&#x20;   rank: index + 1,
&#x20;   statusLevel: getStatusLevel(tag, now),
&#x20; }))
}

function getStatusLevel(
&#x20; tag: { score: number; lastReviewed?: number },
&#x20; now: number
): 'red' | 'yellow' | 'green' {
&#x20; const threeDaysAgo = now - 3 \* 24 \* 60 \* 60 \* 1000
&#x20; const twoDaysAgo = now - 2 \* 24 \* 60 \* 60 \* 1000

&#x20; if (tag.score >= 3 && (!tag.lastReviewed || tag.lastReviewed < threeDaysAgo)) {
&#x20;   return 'red'
&#x20; }
&#x20; if (tag.lastReviewed && tag.lastReviewed >= twoDaysAgo) {
&#x20;   return 'green'
&#x20; }
&#x20; return 'yellow'
}
3.2 熟悉度标记策略
核心原则：熟悉度标记是系统的工具，不是用户的任务。

数据来源优先级：用户手动标记 > 行为推断 > 默认值（fuzzy × 1.0）

3.2.1 v1.0：行为推断优先
v1.0 不添加任何用户主动标记熟悉度的 UI 元素，完全通过用户行为自动推断：

用户行为	系统推断	熟悉度
记完立刻查词典（左滑）	用户不认识	不熟
记完立刻回看笔记（右滑）	想回顾内容	有点印象
记完直接关闭	认识或只想记录	有点印象
已掌握后查词典	其实忘了	自动取消掌握
3.2.2 v1.5：保存后反馈
触发条件（频率控制）：

条件	是否弹出
当天第 1-2 次记录	✅ 弹出
当天第 3 次及以上	❌ 不弹
该词已有熟悉度标记	❌ 不弹
连续 3 次未点击	接下来 3 天不弹
视觉形态：

text
┌──────────────────────────────────────────┐
│  ✅ 已保存 #apple                       │
│                                          │
│  这个词你现在能说出来吗？                │
│  \[😎 能]   \[😅 有点悬]   \[🤔 不能]      │
└──────────────────────────────────────────┘
底部轻反馈条，非弹窗，不阻断操作

2.5 秒自动消失

3.2.3 v2.0：预览区熟悉度徽章
记录页 → 输入 #tag → 下方“已有笔记预览”区域：

text
📖 你之前记过 #apple 🟡（3条）
· 2026-08-20 超市看到蛇果标签
标签名后彩色小圆点（🔴🟡🟢），可点击调整

未标记过不显示

3.3 已掌握机制
核心原则： 解除门槛高于进入门槛。v1.0 不做自动过期。

3.3.1 进入“已掌握”
长按卡片 → 操作菜单 → “已掌握”：

退出排名，排名分冻结

永久有效

3.3.2 退出“已掌握”
行为	系统反应
记新笔记	弹确认框：“重新加入复习吗？”
查词典（左滑）	自动取消掌握，从 0 开始
回看笔记（右滑）	不做处理
手动“我忘了”	取消掌握，从 0 开始
3.3.3 已掌握词库页面（“我的”Tab）
text
📚 已掌握词库（32个）
┌─────────────────────────────────────────┐
│  #apple    2026-08-20  5条笔记        │
│  #book     2026-08-18  3条笔记        │
└─────────────────────────────────────────┘

💡 研究表明，一个词需要在不同场景遇到 5-7 次才能真正记住。
3.4 暂时不想看
长按卡片 → “暂时不想看”

退出排名，7 天后自动恢复

排名分不变

3.5 标签状态汇总
状态	说明	排名	自动恢复
learning	学习中	✅ 参与	—
mastered	已掌握	❌ 退出	永久
snoozed	暂时不想看	❌ 退出	7天
3.6 词典（我的理解）设计
3.6.1 设计定位
词典是复习的脚手架，不是学习的主菜。用户左滑是为了“确认我记得对不对”，不是“查词”。

原则	说明
不全	只给最必要的信息（释义+场景）
不跳	左滑即显示，不跳转页面
不冷	内容和“你的记录”关联
3.6.2 数据来源：三层架构
层级	数据来源	优先级
第一层	用户自己的释义	✅ 最高
第二层	系统释义（内置词库/API）	✅ 兜底
第三层	空状态引导	⚠️ 最低
3.6.3 用户释义自动提取
优先级	规则	示例
1	\[词] + 是/就是/意思是 + \[释义]	“#serendipity 意思是意外发现珍奇事物的能力”
2	\[词] + ：或 —— + \[释义]	“#ubiquitous：无处不在的”
3	兜底：去掉 #tag 后的整句话	“今天在超市看到 #apple”
3.6.4 左滑词典视图
有用户释义时：

text
┌──────────────────────────────────────────┐
│  📖 我的理解              #serendipity  │
│  ──────────────────────────────────────  │
│                                          │
│  \[用户释义，大号字]                      │
│                                          │
│  💭 你自己写的释义                       │
│                                          │
│  ──────────────────────────────────────  │
│                                          │
│  📍 遇到场景：                           │
│  · 看剧时听到的                          │
│                                          │
│                        ✏️ 改一下释义     │
└──────────────────────────────────────────┘
有系统释义、无用户释义时：

text
┌──────────────────────────────────────────┐
│  📖 我的理解              #serendipity  │
│  ──────────────────────────────────────  │
│                                          │
│  \[系统释义，正常字号]                    │
│                                          │
│  💡 这是系统释义，换成你自己的话会更记得住│
│     ✏️ 改一下                           │
│                                          │
│  ──────────────────────────────────────  │
│                                          │
│  📍 遇到场景：                           │
│  · 看剧时听到的                          │
└──────────────────────────────────────────┘
无释义时（空状态）：

text
┌──────────────────────────────────────────┐
│  📖 我的理解              #serendipity  │
│  ──────────────────────────────────────  │
│                                          │
│        还没写下它的意思呢                │
│      下次遇到的时候，顺手记一下就好      │
│                                          │
│  ──────────────────────────────────────  │
│                                          │
│  📍 遇到场景：                           │
│  · 看剧时听到的                          │
│                                          │
│                        ✏️ 写一句         │
└──────────────────────────────────────────┘
3.6.5 释义编辑入口
入口	位置	时机
入口一	左滑视图底部“改一下释义”	复习时发现不准
入口二	记录页自动识别提示	记录时写了新释义
3.6.6 展示优先级
text
用户有释义 → 显示用户释义（不显示系统释义）
用户无释义，系统有 → 显示系统释义 + “换成自己的话”提示
用户无释义，系统无 → 显示空状态引导
4\. 数据结构
4.1 用户表（uni-id-users）
javascript
{
&#x20; "\_id": "user\_001",
&#x20; "mobile": "13800001111",
&#x20; "mobileVerified": false,
&#x20; "wxOpenid": "oXXXXXXXX",
&#x20; "wxUnionid": "uXXXXXXXX",
&#x20; "nickname": "用户\_abc123",
&#x20; "avatar": "",
&#x20; "isVip": false,
&#x20; "stats": {
&#x20;   "totalNotes": 0,
&#x20;   "masteredTags": 0,
&#x20;   "studyDays": 0,
&#x20;   "continuousDays": 0,
&#x20;   "weeklyReviews": \[]
&#x20; }
}
4.2 笔记表（notes）
javascript
{
&#x20; "\_id": "note\_001",
&#x20; "userId": "user\_001",
&#x20; "content": "今天在超市看到蛇果，标签是英文的 #apple",
&#x20; "tags": \["apple"],
&#x20; "scene": "在超市看到蛇果标签",
&#x20; "sceneType": "other",
&#x20; "images": \["https\://xxx.cdn.bspapp.com/cloudstorage/xxx.jpg"],
&#x20; "audios": \[{ "cloudPath": "audios/xxx.mp3", "duration": 15 }],
&#x20; "dictLookups": 3,
&#x20; "noteReviews": 2,
&#x20; "createTime": 1724300000000,
&#x20; "isDeleted": false
}
4.3 标签聚合数据
javascript
{
&#x20; "name": "apple",
&#x20; "noteCount": 5,
&#x20; "status": "learning",
&#x20; "rankScore": 7,
&#x20; "masteredAt": null,
&#x20; "snoozeExpireAt": null,
&#x20; "lastReviewed": 1724300000000,
&#x20; "familiarity": "fuzzy",
&#x20; "familiarityUpdatedAt": 1724300000000,
&#x20; "userDefinition": {
&#x20;   "text": "苹果，一种常见的水果",
&#x20;   "source": "manual",
&#x20;   "weak": false,
&#x20;   "updatedAt": 1724300000000
&#x20; },
&#x20; "notes": \["note\_001", "note\_002"]
}
5\. 版本路线图
阶段	功能	目的
v1.0	行为推断 + 排名公式 + 永久已掌握 + 已掌握词库 + 用户释义自动提取	零干扰，让用户先记
v1.5	保存后反馈（“能说出来吗？”）+ 系统释义兜底	收集熟悉度数据，覆盖冷启动
v2.0	预览区熟悉度徽章 + 熟悉度自动降级 + 个性化回访	手动调整入口 + 智能维护
6\. 配色系统
6.1 设计原则
MeetRe 配色传递三个关键词：清晰 · 可信 · 适度温暖

原则	说明
清晰	复习是认知任务，颜色帮助用户快速判断状态
可信	学习记录是用户资产，颜色传递稳定感
适度温暖	区别于冷冰冰的考试工具，营造“笔记本/纸墨”氛围
6.2 配色架构（分层染色）
核心思想：看的东西用纸色，操作的东西用白色。

区域类型	背景色	用途
系统框架层	#FFFFFF 纯白	页面根容器、导航栏、弹窗、ActionSheet
内容展示层	#F7F4EB 暖米色	排名卡片背景、笔记列表、设置单元格
操作交互层	#FFFFFF 纯白	卡片内部、弹窗内容、底部面板、输入框区域
输入框内部	#F5F2EB 浅米色	搜索框、文本输入框
优势： 系统组件（导航栏胶囊、系统弹窗）是纯白，页面最外层也是纯白，两者不会“打架”。暖米色只出现在“内容层”，用户在浏览内容时感受到纸墨质感，但又不会和系统组件产生颜色冲突。

6.3 六色语义分布
六个主要颜色各占一个色相区间，跨语义层不撞色：

层级	颜色	色值	色相位置
品牌主色	赭石	#C4744A	橙棕
滑动-右（笔记）	亮橙	#E07528	橙
滑动-左（词典）	深灰蓝	#3D5A78	蓝
状态-需复习	柔红	#D9605A	红
状态-复习中	暖金	#D4A44A	黄
状态-已掌握	柔和绿	#5A8A6A	绿
6.4 CSS 变量表（最终定版）
css
/\* \============================================================
&#x20;  MeetRe 设计令牌（Design Tokens）
&#x20;  最终定版 · 基于分层染色架构
&#x20;  \============================================================ \*/

:root {
&#x20; /\* \========== 品牌色 \========== \*/
&#x20; \--color-primary: #C4744A;        /\* 赭石 - 主品牌色 \*/
&#x20; \--color-primary-dark: #A85F3A;   /\* 按压/深色状态 \*/
&#x20; \--color-primary-light: #D49A7A;  /\* 浅色/辅助 \*/
&#x20; \--color-primary-bg: #F5EDE4;     /\* 品牌色背景 \*/

&#x20; /\* \========== 状态色 \========== \*/
&#x20; \--color-red: #D9605A;      /\* 需复习 - 柔和红 \*/
&#x20; \--color-red-bg: #F8ECEA;
&#x20; \--color-yellow: #D4A44A;   /\* 复习中 - 暖金 \*/
&#x20; \--color-yellow-bg: #F8F0E0;
&#x20; \--color-green: #5A8A6A;    /\* 已掌握 - 柔和绿 \*/
&#x20; \--color-green-bg: #E8F0EA;

&#x20; /\* \========== 滑动动作色 \========== \*/
&#x20; \--color-swipe-left: #3D5A78;   /\* 左滑-词典（深灰蓝） \*/
&#x20; \--color-swipe-right: #E07528;  /\* 右滑-笔记（亮橙） \*/

&#x20; /\* \========== 背景色（分层染色） \========== \*/
&#x20; \--color-bg-system: #FFFFFF;    /\* 系统框架层 \*/
&#x20; \--color-bg-page: #F7F4EB;      /\* 内容层 - 暖米色 \*/
&#x20; \--color-bg-card: #FFFFFF;      /\* 操作交互层 \*/
&#x20; \--color-bg-secondary: #F0EBE2; /\* 分割/次要区域 \*/
&#x20; \--color-bg-input: #F5F2EB;     /\* 输入框内部 \*/

&#x20; /\* \========== 边框 \========== \*/
&#x20; \--color-border: #E4DDD4;
&#x20; \--color-border-light: #EDE8E0;

&#x20; /\* \========== 文字色 \========== \*/
&#x20; \--color-text-primary: #1A2332;     /\* 主标题 \*/
&#x20; \--color-text-body: #3D4A5C;        /\* 正文 \*/
&#x20; \--color-text-secondary: #6B655E;   /\* 辅助文字（WCAG AA 达标） \*/
&#x20; \--color-text-placeholder: #B5AFA8; /\* 占位符 \*/
&#x20; \--color-text-inverse: #FFFFFF;     /\* 反色文字 \*/

&#x20; /\* \========== 阴影 \========== \*/
&#x20; \--shadow-card: 0 2px 12px rgba(43, 45, 66, 0.07);
&#x20; \--shadow-card-hover: 0 4px 20px rgba(43, 45, 66, 0.12);
&#x20; \--shadow-float: 0 4px 16px rgba(196, 116, 74, 0.30);
&#x20; \--shadow-tab: 0 -2px 10px rgba(43, 45, 66, 0.06);

&#x20; /\* \========== 圆角 \========== \*/
&#x20; \--radius-sm: 6px;
&#x20; \--radius-md: 10px;
&#x20; \--radius-lg: 16px;
&#x20; \--radius-xl: 20px;
&#x20; \--radius-full: 9999px;

&#x20; /\* \========== 间距 \========== \*/
&#x20; \--space-xs: 4px;
&#x20; \--space-sm: 8px;
&#x20; \--space-md: 12px;
&#x20; \--space-lg: 16px;
&#x20; \--space-xl: 24px;
&#x20; \--space-2xl: 32px;
&#x20; \--space-3xl: 48px;

&#x20; /\* \========== 字体 \========== \*/
&#x20; \--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
&#x20; \--font-size-xs: 11px;
&#x20; \--font-size-sm: 13px;
&#x20; \--font-size-base: 15px;
&#x20; \--font-size-md: 17px;
&#x20; \--font-size-lg: 20px;
&#x20; \--font-size-xl: 24px;
&#x20; \--font-size-2xl: 32px;

&#x20; \--font-weight-regular: 400;
&#x20; \--font-weight-medium: 500;
&#x20; \--font-weight-semibold: 600;
&#x20; \--font-weight-bold: 700;
}
6.5 配色使用规范
场景	色值	使用说明
页面根容器	#FFFFFF	所有页面的最外层
页面内容背景	#F7F4EB	卡片列表、设置列表的背景
卡片背景	#FFFFFF	排名卡片、记录卡片、弹窗内容
主按钮	#C4744A	保存、确认等主要操作
主按钮按压	#A85F3A	按钮点击反馈
底部Tab选中	#C4744A	当前所在Tab
底部Tab未选中	#6B655E	非当前Tab
浮动+按钮	#C4744A + 白色图标	常驻快速记录入口
左滑-词典	#3D5A78	左滑背景色，隐喻“探索/外部”
右滑-笔记	#E07528	右滑背景色，隐喻“记录/内省”
需复习状态	#D9605A	🔴 排名卡片状态标识
复习中状态	#D4A44A	🟡 排名卡片状态标识
已掌握状态	#5A8A6A	🟢 排名卡片状态标识
标题文字	#1A2332	标签名、数据数字
正文文字	#3D4A5C	笔记内容、描述
辅助文字	#6B655E	时间、笔记数、脚注
输入框背景	#F5F2EB	搜索框、文本输入框
文件二：决策记录（ADR）.md
