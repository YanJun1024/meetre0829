"use strict";
/**
 * uni-id-lite 轻量 token 公共模块
 * 自研 HS256 JWT（uni-id 风格），供 user（签发）与 notes（校验）共用
 * 注意：tokenSecret 仅存于云端，勿提交到公开仓库
 */
const crypto = require("crypto");
const config = require("./config");

function b64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64"
  ).toString("utf8");
}

function sign(data) {
  return b64urlEncode(
    crypto.createHmac("sha256", config.tokenSecret).update(data).digest()
  );
}

/** 签发 token：payload = { uid, iat, exp } */
function createToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { uid, iat: now, exp: now + config.tokenExpiresIn };
  const h = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64urlEncode(JSON.stringify(payload));
  return {
    token: `${h}.${p}.${sign(`${h}.${p}`)}`,
    tokenExpired: payload.exp * 1000,
    uid,
  };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** 校验 token：返回 { errCode, uid?, errMsg? }，errCode 0 = 有效 */
function checkToken(token) {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    return { errCode: 401, errMsg: "token无效" };
  }
  const [h, p, s] = token.split(".");
  if (!safeEqual(s, sign(`${h}.${p}`))) {
    return { errCode: 401, errMsg: "token无效" };
  }
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(p));
  } catch (e) {
    return { errCode: 401, errMsg: "token无效" };
  }
  if (!payload || !payload.uid) {
    return { errCode: 401, errMsg: "token无效" };
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return { errCode: 401, errMsg: "token已过期" };
  }
  return { errCode: 0, uid: payload.uid };
}

module.exports = { createToken, checkToken };
