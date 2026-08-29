import type { Note } from "@/types";

// =============================================================
// 释义自动提取（对应开发文档 3.6.2 三条规则）
// 规则1：[词]是... / [词]意思是...
// 规则2：[词]：... / [词]——... / [词]: ...
// 规则3：兜底 → 整句
// 优先级：规则1 > 规则2 > 规则3；同级取最新命中的笔记
// =============================================================

export interface ExtractedDefinition {
  text: string;
  noteId: string;
  rule: 1 | 2 | 3;
}

/** 清理提取文本：截取首行、去掉 #标签、修剪空白 */
function cleanExtracted(raw: string): string {
  return raw
    .split("\n")[0]
    .replace(/#[^\s#]+/g, "")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 前置分隔符：避免 "pineapple" 误命中标签 "apple" */
const PREFIX = "(^|[\\s#，。,.！!？?；;：:])";

/** 规则1：[词]是... / [词]意思是... */
function matchIsDefinition(tagName: string, content: string): string | null {
  const re = new RegExp(
    `${PREFIX}${escapeRegExp(tagName)}\\s*(?:意思是|是)(.+)`
  );
  const m = content.match(re);
  return m ? cleanExtracted(m[2]) : null;
}

/** 规则2：[词]：... / [词]——... */
function matchColonDefinition(tagName: string, content: string): string | null {
  const re = new RegExp(`${PREFIX}${escapeRegExp(tagName)}\\s*[：:——](.+)`);
  const m = content.match(re);
  return m ? cleanExtracted(m[2]) : null;
}

/**
 * 从标签的笔记中自动提取释义
 * @param tagName 标签名（不含 #）
 * @param notes 全部笔记
 */
export function extractDefinition(
  tagName: string,
  notes: Note[]
): ExtractedDefinition | null {
  const tagNotes = notes
    .filter((n) => n.tags.includes(tagName) && !n.isDeleted && n.content)
    .sort((a, b) => b.createTime - a.createTime);

  if (!tagNotes.length) return null;

  for (const note of tagNotes) {
    const text = matchIsDefinition(tagName, note.content);
    if (text) return { text, noteId: note.id, rule: 1 };
  }
  for (const note of tagNotes) {
    const text = matchColonDefinition(tagName, note.content);
    if (text) return { text, noteId: note.id, rule: 2 };
  }
  return {
    text: cleanExtracted(tagNotes[0].content),
    noteId: tagNotes[0].id,
    rule: 3,
  };
}
