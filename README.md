# MeetRe

> MeetRe：在复习时，重新遇见你记过的东西。

复习驱动的场景化单词学习微信小程序。核心逻辑：**记笔记越多的词，说明越没记住**——系统根据行为数据自动排名，告诉你现在最该复习哪个词。

## 核心特性

- **排名驱动复习**：笔记数 +1、查词典 +2、回看笔记 +1，叠加时间衰减与熟悉度系数，得分越高越靠前
- **零干扰熟悉度**：v1.0 纯行为推断（记完查词典 = 不熟），v1.5 保存后轻反馈，v2.0 预览区徽章 + 自动降级；用户手动标记永远优先
- **滑动即复习**：左滑看「我的理解」（用户释义 > 系统释义 > 空状态引导），右滑回看笔记，不跳转页面
- **已掌握词库**：解除门槛高于进入门槛，长按恢复；查词典自动降级防「假掌握」
- **场景化记录**：5 个预设场景 + 自定义，附件支持图片（自动压缩）与 60 秒录音
- **数据看板**：学习天数/连续天数/近 7 天复习趋势/最需复习 TOP 3/最近动态

## 技术栈

| 层级 | 选型 |
|---|---|
| 前端 | Vue 3 + uni-app + TypeScript + Pinia |
| 后端 | uniCloud 云对象（支付宝云空间） |
| 数据库 | uniCloud 云数据库（notes / tags / uni-id-users） |
| 认证 | 微信静默登录 + 自研轻量 JWT（uni-id-lite，HS256） |
| 词典兜底 | dictionaryapi.dev（云函数服务端请求 + 结果缓存） |

## 项目结构

```
meetre/
├── pages/               # 页面：review(复习) record(记录) profile(我的)
│                        #       tag-detail(标签详情) mastered(已掌握词库)
├── components/          # AttachmentList 附件 / FloatAddButton 浮动按钮
├── store/               # Pinia：notes(核心数据+排名) user(登录态)
├── utils/               # rank 排名公式 / definition 三层释义
│                        # media 压缩与迁移 / review-log 按天复习日志
├── styles/tokens.css    # 设计令牌（分层染色配色系统）
├── uniCloud-alipay/     # 云函数：notes / user / common/uni-id-lite
└── meetre开发文档.md     # 产品与开发规格
```

## 快速开始

1. HBuilderX 导入项目，`manifest.json` 已配置微信小程序 AppID
2. 右键 `uniCloud-alipay` → 关联你的 uniCloud 支付宝云服务空间
3. **配置密钥**（两处，均不进版本库）：
   - `uniCloud-alipay/cloudfunctions/user/config.json` → 填入微信 AppSecret
   - `uniCloud-alipay/cloudfunctions/common/uni-id-lite/config.js` → 修改 JWT `tokenSecret`
4. 右键 `common/uni-id-lite` → 上传公共模块；右键 `notes`、`user` → 上传并部署
5. 运行到微信开发者工具；真机调试建议在 HBuilderX 前端控制台切换「连接云端云函数」

> 首次运行自动完成微信静默登录，并把本机 `local_user` 数据迁移到真实账号。

## 安全说明

- `user/config.json`（AppSecret）与 `uni-id-lite/config.js`（JWT 密钥）已在 `.gitignore` 中排除
- 云数据库以 `userId` 隔离数据；云函数端校验 token，客户端不持有敏感信息

## 版本状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| v1.0 | 行为推断 + 排名公式 + 永久已掌握 + 词库 + 释义提取 | ✅ |
| v1.5 | 保存后反馈 + 系统释义兜底 | ✅ |
| v2.0 | 预览区徽章 + 自动降级 + 个性化回访 | ✅ |

手机号登录需企业主体资质，暂未接入；App 端规划中。
