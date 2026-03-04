'use strict';

const express = require('express');
const multer = require('multer');
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ──────────────────────────────────────────────
//  Merge logic (ported from merge_history.py)
// ──────────────────────────────────────────────

const KNOWN_INLINE_EMOJIS = [
  'Broken','Chuckle','CoolGuy','Facepalm','Frown','GoForIt','Grin',
  'Hey','Hurt','Joyful','Lol','MyBad','Party','Respect','Salute',
  'Scowl','Smart','ThumbsUp','Toasted','Trick','Wow','Proud',
  'Lips','Smug','Grimace','Shhh','Boring','Awesome','Addoil',
  'Onlooker','Sigh','Snicker','Duh',
  '呲牙','嘿哈','尴尬','强','得意','捂脸','机智','破涕为笑','苦涩','发呆',
];

function normalizeInlineEmoji(text) {
  if (!text) return text;
  for (const name of KNOWN_INLINE_EMOJIS) {
    text = text.split(`[${name}]`).join(`(${name})`);
  }
  return text;
}

function cleanXmlMetadata(content) {
  if (!content.includes('<msg>')) return content;
  try {
    const xmlMatch = content.match(/<msg>[\s\S]*?<\/msg>/);
    if (!xmlMatch) return content;
    const xml = xmlMatch[0];

    const titleMatch = xml.match(/<title>([\s\S]*?)<\/title>/);
    if (titleMatch) return `[卡片: ${titleMatch[1].trim()}]`;

    const dimMatch = xml.match(/cdnthumbwidth="(\d+)" cdnthumbheight="(\d+)"/);
    if (dimMatch) return `[图片 ${dimMatch[1]}x${dimMatch[2]}]`;
    if (xml.includes('<img')) return '[图片]';

    if (xml.includes('<emoji')) return '[动画表情]';

    return '[引用内容]';
  } catch {
    return content;
  }
}

function parseQuoteReplyEnhanced(content) {
  const quotePattern = /\n\n\[引用\]\(([^)]+)\)([^:]+):([\s\S]+)$/;
  const match = content.match(quotePattern);
  if (!match) return content;

  const quoteTime = match[1].trim();
  const quoteSpeaker = match[2].trim();
  const quoteContent = cleanXmlMetadata(match[3].trim());
  const actualContent = normalizeInlineEmoji(content.slice(0, match.index).trim());

  const timeParts = quoteTime.split(' ');
  const timeOnly = timeParts.length >= 2 ? timeParts[1] : quoteTime;

  return `> 引用 ${quoteSpeaker} 在 ${timeOnly} 说: ${quoteContent}\n${actualContent}`;
}

function mergeData(usersJson, chatJson, startDate, endDate) {
  // Build wxid → nickname map
  const nicknameMap = {};
  for (const [, info] of Object.entries(usersJson)) {
    if (info.wxid && info.nickname) nicknameMap[info.wxid] = info.nickname;
  }

  let messages = Array.isArray(chatJson) ? chatJson : [];

  // Filter by date range
  if (startDate) {
    messages = messages.filter(m => (m.CreateTime || '') >= startDate);
  }
  if (endDate) {
    const endInclusive = endDate + ' 23:59:59';
    messages = messages.filter(m => (m.CreateTime || '') <= endInclusive);
  }

  // Sort by time
  messages.sort((a, b) => (a.CreateTime || '').localeCompare(b.CreateTime || ''));

  // Format output
  const lines = [];
  for (const msg of messages) {
    const talkerId = msg.talker || '';
    const nickname = nicknameMap[talkerId] || 'Unknown';
    const createTime = msg.CreateTime || 'No time';
    const typeName = msg.type_name || 'Unknown Type';
    let content = msg.msg || '';

    if (typeName === '引用回复') {
      content = parseQuoteReplyEnhanced(content);
    } else {
      content = normalizeInlineEmoji(content);
    }

    lines.push(`${createTime} ${nickname} [${typeName}]`);
    lines.push(`${content}`);
    lines.push('');
  }

  return { text: lines.join('\n'), count: messages.length };
}

// ──────────────────────────────────────────────
//  HTML (single-page UI)
// ──────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>微信聊天记录合并工具</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f0f2f5;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(0,0,0,.08);
    padding: 40px;
    width: 100%;
    max-width: 520px;
  }
  .logo {
    font-size: 36px;
    text-align: center;
    margin-bottom: 8px;
  }
  h1 {
    font-size: 20px;
    font-weight: 700;
    text-align: center;
    color: #111;
    margin-bottom: 4px;
  }
  .subtitle {
    font-size: 13px;
    color: #888;
    text-align: center;
    margin-bottom: 32px;
  }
  .field { margin-bottom: 20px; }
  label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #444;
    margin-bottom: 6px;
  }
  .hint { font-size: 12px; color: #aaa; font-weight: 400; margin-left: 4px; }
  .drop-zone {
    border: 2px dashed #d9d9d9;
    border-radius: 10px;
    padding: 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color .2s, background .2s;
    position: relative;
    background: #fafafa;
  }
  .drop-zone:hover, .drop-zone.drag-over {
    border-color: #07c160;
    background: #f0fff4;
  }
  .drop-zone input[type=file] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
  }
  .drop-zone .icon { font-size: 28px; margin-bottom: 6px; }
  .drop-zone .text { font-size: 14px; color: #555; }
  .drop-zone .filename {
    margin-top: 8px; font-size: 13px; color: #07c160; font-weight: 600; word-break: break-all;
  }
  .date-row { display: flex; gap: 12px; }
  .date-row .field { flex: 1; }
  input[type=date] {
    width: 100%; padding: 9px 12px; border: 1.5px solid #e0e0e0; border-radius: 8px;
    font-size: 14px; color: #333; outline: none; transition: border-color .2s;
    background: #fff;
  }
  input[type=date]:focus { border-color: #07c160; }
  .btn {
    width: 100%; padding: 14px; background: #07c160; color: #fff; border: none;
    border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer;
    transition: background .2s, transform .1s;
    margin-top: 4px;
  }
  .btn:hover:not(:disabled) { background: #06ad56; }
  .btn:active:not(:disabled) { transform: scale(.98); }
  .btn:disabled { background: #b2dfcc; cursor: not-allowed; }
  .status {
    margin-top: 16px; padding: 12px 16px; border-radius: 8px;
    font-size: 14px; display: none;
  }
  .status.info  { background: #e8f4fd; color: #0969da; display: block; }
  .status.ok    { background: #dff5e8; color: #1a7f37; display: block; }
  .status.error { background: #fde8e8; color: #cf222e; display: block; }
  .spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid currentColor; border-top-color: transparent;
    border-radius: 50%; animation: spin .7s linear infinite; margin-right: 6px;
    vertical-align: middle;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="card">
  <div class="logo">💬</div>
  <h1>微信聊天记录合并</h1>
  <p class="subtitle">上传两个 JSON 文件，在线合并后下载，服务器不保留任何数据</p>

  <form id="form">
    <div class="field">
      <label>用户信息文件 <span class="hint">users.json</span></label>
      <div class="drop-zone" id="zone1">
        <input type="file" name="users" accept=".json" required id="input1">
        <div class="icon">👤</div>
        <div class="text">点击或拖拽上传 users.json</div>
        <div class="filename" id="name1"></div>
      </div>
    </div>

    <div class="field">
      <label>聊天记录文件 <span class="hint">wxid_*.json</span></label>
      <div class="drop-zone" id="zone2">
        <input type="file" name="chat" accept=".json" required id="input2">
        <div class="icon">💬</div>
        <div class="text">点击或拖拽上传聊天记录 JSON</div>
        <div class="filename" id="name2"></div>
      </div>
    </div>

    <div class="date-row">
      <div class="field">
        <label>开始日期 <span class="hint">可选</span></label>
        <input type="date" name="startDate" id="startDate">
      </div>
      <div class="field">
        <label>结束日期 <span class="hint">可选</span></label>
        <input type="date" name="endDate" id="endDate">
      </div>
    </div>

    <button class="btn" type="submit" id="btn">开始合并并下载</button>
  </form>

  <div class="status" id="status"></div>
</div>

<script>
  // Drag-over visual feedback
  ['zone1','zone2'].forEach(id => {
    const zone = document.getElementById(id);
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', () => zone.classList.remove('drag-over'));
  });

  // Show filename on select
  document.getElementById('input1').addEventListener('change', e => {
    document.getElementById('name1').textContent = e.target.files[0]?.name || '';
  });
  document.getElementById('input2').addEventListener('change', e => {
    document.getElementById('name2').textContent = e.target.files[0]?.name || '';
  });

  function setStatus(type, html) {
    const el = document.getElementById('status');
    el.className = 'status ' + type;
    el.innerHTML = html;
  }

  document.getElementById('form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn');
    btn.disabled = true;
    setStatus('info', '<span class="spinner"></span>正在处理，请稍候…');

    const fd = new FormData(e.target);
    try {
      const res = await fetch('/merge', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '服务器错误' }));
        throw new Error(err.error || '未知错误');
      }
      const blob = await res.blob();
      const count = res.headers.get('X-Message-Count') || '?';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'merged_chat_history.txt';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('ok', \`✅ 合并完成，共 <strong>\${count}</strong> 条消息，文件已开始下载。\`);
    } catch (err) {
      setStatus('error', '❌ ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });
</script>
</body>
</html>`;

// ──────────────────────────────────────────────
//  Routes
// ──────────────────────────────────────────────

app.get('/', (_req, res) => res.send(HTML));

app.post(
  '/merge',
  upload.fields([
    { name: 'users', maxCount: 1 },
    { name: 'chat',  maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const usersFile = req.files?.users?.[0];
      const chatFile  = req.files?.chat?.[0];

      if (!usersFile || !chatFile) {
        return res.status(400).json({ error: '请上传两个 JSON 文件' });
      }

      let usersJson, chatJson;
      try {
        usersJson = JSON.parse(usersFile.buffer.toString('utf-8'));
      } catch {
        return res.status(400).json({ error: 'users.json 解析失败，请检查文件格式' });
      }
      try {
        chatJson = JSON.parse(chatFile.buffer.toString('utf-8'));
      } catch {
        return res.status(400).json({ error: '聊天记录 JSON 解析失败，请检查文件格式' });
      }

      const startDate = req.body.startDate || null;
      const endDate   = req.body.endDate   || null;

      const { text, count } = mergeData(usersJson, chatJson, startDate, endDate);

      const buffer = Buffer.from(text, 'utf-8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="merged_chat_history.txt"');
      res.setHeader('X-Message-Count', String(count));
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服务器内部错误: ' + err.message });
    }
  }
);

// ──────────────────────────────────────────────
//  Start
// ──────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ 服务已启动: http://localhost:${PORT}`);
});
