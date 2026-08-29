"use strict";
/** uni-id-lite 配置：部署前请把 tokenSecret 改为随机长字符串 */
module.exports = {
  tokenSecret: "meetre-token-secret-CHANGE-ME-to-random-long-string",
  tokenExpiresIn: 30 * 24 * 60 * 60, // 30 天（秒）
};
