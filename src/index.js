/**
 * Notememo - Cloudflare Worker 备忘录应用
 *
 * UI 风格：animal-island-ui（暖色调 / 3D 阴影按钮 / 燕尾飘带标题 / blob Modal / 无 emoji 图标）
 *
 * 路由：
 *   GET   /                    返回备忘录 Web 应用
 *   GET   /api/notes           获取全部备忘录
 *   POST  /api/notes          新建备忘录
 *   POST  /api/notes/import   批量导入备忘录
 *   PUT   /api/notes/:id      更新备忘录
 *   DELETE /api/notes/:id     删除备忘录
 *
 * 存储：
 *   - 若 Worker 绑定了名为 NOTES 的 KV namespace，则数据持久化到 KV。
 *   - 未绑定时使用内存 Map（仅用于预览，重启后数据丢失）。
 */

// ========== 工具函数 ==========
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders },
  });
}

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// 内存存储（仅当未绑定 KV 时使用，作为快速预览）
const memoryStore = new Map();

function createStore(env) {
  const kv = env && env.NOTES;
  if (kv) {
    return {
      async getAll() {
        const list = await kv.list({ prefix: 'note:' });
        const notes = [];
        for (const key of list.keys) {
          const raw = await kv.get(key.name);
          if (raw) {
            try { notes.push(JSON.parse(raw)); } catch (e) { /* 忽略损坏数据 */ }
          }
        }
        return notes;
      },
      async get(id) {
        const raw = await kv.get('note:' + id);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
      },
      async put(note) {
        await kv.put('note:' + note.id, JSON.stringify(note));
      },
      async delete(id) {
        await kv.delete('note:' + id);
      },
    };
  }
  return {
    async getAll() {
      return Array.from(memoryStore.values());
    },
    async get(id) {
      return memoryStore.get(id) || null;
    },
    async put(note) {
      memoryStore.set(note.id, note);
    },
    async delete(id) {
      memoryStore.delete(id);
    },
  };
}

function sortNotes(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return new Date(b.updatedAt) - new Date(a.updatedAt);
}

// ========== API 处理 ==========
async function handleApi(request, method, pathname, env) {
  const store = createStore(env);
  const persistent = !!(env && env.NOTES);

  // GET /api/notes - 获取全部备忘录
  if (pathname === '/api/notes' && method === 'GET') {
    const notes = await store.getAll();
    notes.sort(sortNotes);
    return json({ ok: true, notes, persistent });
  }

  // POST /api/notes - 新建备忘录
  if (pathname === '/api/notes' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const title = (body.title || '').toString().trim();
    const content = (body.content || '').toString().trim();
    if (!title && !content) {
      return json({ ok: false, error: '标题和内容不能同时为空' }, 400);
    }
    const now = new Date().toISOString();
    const note = {
      id: generateId(),
      title: title || '无标题',
      content,
      done: false,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    await store.put(note);
    return json({ ok: true, note }, 201);
  }

  // POST /api/notes/import - 批量导入备忘录（相同 id 覆盖，新 id 追加）
  if (pathname === '/api/notes/import' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const arr = Array.isArray(body.notes) ? body.notes : [];
    const now = new Date().toISOString();
    let imported = 0;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const title = (item.title || '').toString().trim();
      const content = (item.content || '').toString().trim();
      if (!title && !content) continue;
      const note = {
        id: item.id ? String(item.id) : generateId(),
        title: title || '无标题',
        content,
        done: !!item.done,
        pinned: !!item.pinned,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      };
      await store.put(note);
      imported++;
    }
    return json({ ok: true, imported });
  }

  // PUT/DELETE /api/notes/:id
  const match = pathname.match(/^\/api\/notes\/([^/]+)$/);
  if (match) {
    const id = match[1];

    if (method === 'PUT') {
      const existing = await store.get(id);
      if (!existing) return json({ ok: false, error: '备忘录不存在' }, 404);
      const body = await request.json().catch(() => ({}));
      if (body.title !== undefined) {
        const t = body.title.toString().trim();
        existing.title = t || '无标题';
      }
      if (body.content !== undefined) existing.content = body.content.toString().trim();
      if (body.done !== undefined) existing.done = !!body.done;
      if (body.pinned !== undefined) existing.pinned = !!body.pinned;
      existing.updatedAt = new Date().toISOString();
      await store.put(existing);
      return json({ ok: true, note: existing });
    }

    if (method === 'DELETE') {
      await store.delete(id);
      return json({ ok: true });
    }
  }

  return json({ ok: false, error: '接口不存在' }, 404);
}

// ========== 前端页面（animal-island-ui 风格） ==========
const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>备忘录 · Notememo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root {
  --animal-font: 'Nunito','Noto Sans SC',-apple-system,'PingFang SC','Hiragino Sans GB',sans-serif;
  --animal-primary: #19c8b9;
  --animal-primary-hover: #3dd4c6;
  --animal-primary-active: #11a89b;
  --animal-primary-bg: #e6f9f6;
  --animal-text: #794f27;
  --animal-text-body: #725d42;
  --animal-text-secondary: #9f927d;
  --animal-text-muted: #8a7b66;
  --animal-text-disabled: #c4b89e;
  --animal-bg: #f8f8f0;
  --animal-bg-content: rgb(247,243,223);
  --animal-bg-disabled: #f0ece2;
  --animal-border: #c4b89e;
  --animal-border-hover: #a89878;
  --animal-radius-sm: 12px;
  --animal-radius: 18px;
  --animal-radius-lg: 24px;
  --animal-radius-pill: 50px;
  --animal-shadow-btn: #bdaea0;
  --animal-shadow-input: #d4c9b4;
  --animal-focus-yellow: #ffcc00;
  --animal-focus-yellow-d: #e0b800;
  --animal-success: #6fba2c;
  --animal-warning: #f5c31c;
  --animal-error: #e05a5a;
  --animal-ease: cubic-bezier(0.4,0,0.2,1);
  --animal-duration-fast: 0.15s;
  --animal-duration: 0.25s;
  --animal-duration-slow: 0.35s;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  font-family: var(--animal-font);
  font-weight: 500;
  color: var(--animal-text-body);
  background:
    radial-gradient(circle, rgba(196,184,158,.15) 1.5px, transparent 1.5px) 0 0/28px 28px,
    radial-gradient(circle, rgba(196,184,158,.1) 1px, transparent 1px) 7px 7px/14px 14px,
    var(--animal-bg-content);
  min-height: 100vh;
  line-height: 1.5;
}

.app { max-width: 720px; margin: 0 auto; padding: 20px 16px 60px; }

/* ===== 顶栏 ===== */
.app-head { margin-bottom: 18px; }
.head-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.hero-title-wrap { display: inline-block; margin: 4px 0 6px; }

/* Title 燕尾飘带 */
.ai-title {
  position: relative; display: inline-flex; height: 2em; padding: 0 1.6em;
  letter-spacing: .04em; filter: drop-shadow(0 .08em .12em rgba(0,0,0,.05));
  --rf: #19c8b9; --rb: #0e9a8e; --rk: #074f4a; --rt: #fff; font-weight: 800;
}
.ai-title .t-back-l, .ai-title .t-back-r { position: absolute; bottom: -.4em; width: 1.7em; height: 1.7em; background: var(--rb); z-index: 0; }
.ai-title .t-back-l { left: -1.7em; clip-path: polygon(100% 0%,100% 100%,0% 100%,30% 50%,0% 0%); }
.ai-title .t-back-r { right: -1.7em; clip-path: polygon(0% 0%,100% 0%,70% 50%,100% 100%,0% 100%); }
.ai-title .t-fold-l { position: absolute; left: -1.7em; bottom: -.4em; width: 0; height: 0; border-width: 0 .95em .45em 0; border-style: solid; border-color: transparent var(--rk) transparent transparent; z-index: 1; }
.ai-title .t-fold-r { position: absolute; right: -1.7em; bottom: -.4em; width: 0; height: 0; border-width: 0 0 .45em .95em; border-style: solid; border-color: transparent transparent transparent var(--rk); z-index: 1; }
.ai-title .t-front {
  position: absolute; inset: 0 .1em; background: var(--rf); border-radius: .2em;
  transform: perspective(11.5em) rotateX(3deg); display: flex; align-items: center;
  justify-content: center; z-index: 2;
}
.ai-title .t-front span { color: var(--rt); font-weight: 900; letter-spacing: .04em; text-shadow: 0 .05em .1em rgba(0,0,0,.12); padding-top: .11em; }

.head-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

/* ===== 按钮 ===== */
.ai-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 45px; padding: 0 20px; border-radius: var(--animal-radius-pill);
  border: 2px solid transparent; font-size: 14px; font-weight: 600; letter-spacing: .02em;
  line-height: 1; cursor: pointer; transition: all .2s var(--animal-ease); text-align: center;
  background: none; font-family: var(--animal-font);
}
.ai-btn-primary { color: var(--animal-text); background: #f8f8f0; border-color: #f8f8f0; box-shadow: 0 5px 0 0 var(--animal-shadow-btn); }
.ai-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 0 0 var(--animal-shadow-btn); }
.ai-btn-primary:active { transform: translateY(2px); box-shadow: 0 1px 0 0 var(--animal-shadow-btn); }
.ai-btn-primary:focus-visible { outline: 2px solid var(--animal-primary); outline-offset: 2px; }
.ai-btn-default { color: var(--animal-text-body); background: rgb(247,243,223); border-color: var(--animal-border); box-shadow: 0 2px 4px 0 rgba(61,52,40,.06); }
.ai-btn-default:hover { color: var(--animal-primary); border-color: var(--animal-primary); box-shadow: 0 3px 10px 0 rgba(61,52,40,.1); transform: translateY(-1px); }
.ai-btn-default:active { transform: translateY(0); box-shadow: 0 2px 4px 0 rgba(61,52,40,.06); }
.ai-btn:disabled { opacity: .5; cursor: not-allowed; transform: none !important; box-shadow: 0 5px 0 0 var(--animal-shadow-btn); }

/* primary 按钮内的加号（纯 CSS，不用 emoji） */
.plus { position: relative; width: 12px; height: 12px; margin-right: 8px; flex-shrink: 0; }
.plus::before, .plus::after { content: ''; position: absolute; background: currentColor; border-radius: 2px; }
.plus::before { left: 50%; top: 0; width: 2px; height: 12px; transform: translateX(-50%); }
.plus::after { top: 50%; left: 0; width: 12px; height: 2px; transform: translateY(-50%); }

/* ===== 搜索框 ===== */
.ai-input {
  height: 40px; padding: 0 18px; border-radius: 50px;
  background: #fffdf7; color: var(--animal-text-muted); font-weight: 500; font-size: 14px;
  letter-spacing: .01em; border: none; outline: none; font-family: var(--animal-font);
  transition: box-shadow .2s var(--animal-ease);
}
.ai-input::placeholder { color: var(--animal-text-disabled); font-weight: 400; }
.ai-input:hover { box-shadow: 0 3px 0 0 var(--animal-border); }
.ai-input:focus { box-shadow: 0 3px 0 0 var(--animal-focus-yellow-d), 0 0 0 3px rgba(255,204,0,.15); }
.ai-input-search { flex: 1; min-width: 180px; max-width: 320px; }
.ai-input-block { width: 100%; margin-bottom: 12px; }

/* ===== 第二行：搜索 + 统计 ===== */
.head-row2 { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 10px; }
.head-stats { font-size: 13px; font-weight: 700; color: var(--animal-text-secondary); letter-spacing: .01em; }

/* ===== 横幅 ===== */
.ai-banner {
  background: #fbf3d8; border: 2px solid var(--animal-warning); color: #92400e;
  border-radius: 14px; padding: 10px 16px; font-size: 13px; font-weight: 600;
  margin-bottom: 14px; line-height: 1.5;
}

/* ===== 笔记列表 ===== */
.note-list { display: flex; flex-direction: column; gap: 12px; }
.note-card {
  background: var(--animal-bg-content);
  border: 2px solid transparent;
  border-radius: 20px;
  padding: 16px 18px 12px;
  color: var(--animal-text-body);
  font-weight: 500;
  transition: transform .25s var(--animal-ease), border-color .25s var(--animal-ease);
}
.note-card:hover { transform: translateY(-2px); border-color: #e8dcc8; }
.note-card.pinned { border-color: var(--animal-warning); background: #fbf6e3; }
.note-card.done .note-title { color: var(--animal-text-disabled); text-decoration: line-through; }
.note-card.done .note-content { color: var(--animal-text-disabled); }

.note-top { display: flex; gap: 12px; align-items: flex-start; }
.note-text { flex: 1; min-width: 0; }

/* Checkbox（圆形 + SVG 对勾） */
.ai-checkbox { position: relative; display: inline-block; width: 22px; height: 22px; flex-shrink: 0; margin-top: 2px; }
.ai-checkbox input {
  appearance: none; -webkit-appearance: none;
  width: 22px; height: 22px; border: 2px solid var(--animal-border);
  border-radius: 50%; background: rgb(247,243,223);
  cursor: pointer; transition: background .25s var(--animal-ease), border-color .25s var(--animal-ease);
}
.ai-checkbox input:hover { border-color: var(--animal-primary); }
.ai-checkbox input:checked { background: var(--animal-primary); border-color: var(--animal-primary-active); }
.ai-checkbox input:focus-visible { outline: 2px solid var(--animal-focus-yellow); outline-offset: 2px; }
.ai-checkbox .check {
  position: absolute; top: 50%; left: 50%; width: 12px; height: 11px;
  transform: translate(-50%,-54%); pointer-events: none;
}
.ai-checkbox .check path {
  stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; fill: none;
  stroke-dasharray: 19; stroke-dashoffset: 19;
  transition: stroke-dashoffset .3s ease .2s;
}
.ai-checkbox input:checked ~ .check path { stroke-dashoffset: 0; }

.note-title { font-size: 16px; font-weight: 700; color: var(--animal-text); word-break: break-word; line-height: 1.5; }
.note-content {
  margin-top: 4px; font-size: 14px; color: var(--animal-text-muted); line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.note-foot {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e8dcc8;
}
.note-time { font-size: 12px; font-weight: 600; color: var(--animal-text-secondary); }
.note-actions { display: flex; gap: 2px; }

/* 卡片内小按钮 */
.note-btn {
  background: none; border: none; cursor: pointer; font-size: 12px; font-weight: 700;
  color: var(--animal-text-secondary); padding: 5px 10px; border-radius: 10px;
  font-family: var(--animal-font);
  transition: all .15s var(--animal-ease);
}
.note-btn:hover { color: var(--animal-primary); background: var(--animal-primary-bg); }
.note-btn.active { color: #b57a00; background: rgba(245,195,28,.2); }
.note-btn.danger:hover { color: var(--animal-error); background: #fdecec; }

/* 空状态 */
.empty {
  text-align: center; padding: 60px 16px; color: var(--animal-text-secondary);
  font-size: 15px; font-weight: 600; letter-spacing: .01em;
}

/* ===== Modal（blob clip-path） ===== */
.ai-modal-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  animation: ai-fade-in .25s ease;
}
.ai-modal {
  position: relative; width: 100%; max-width: 480px; max-height: calc(100vh - 64px);
  overflow: auto; clip-path: url(#animal-modal-clip); background: rgb(247,243,223);
  color: rgb(128,115,89); padding: 48px 48px 32px;
  animation: ai-zoom-in .3s ease;
}
.ai-modal-title { font-size: 28px; font-weight: 700; color: rgba(114,93,66,1); padding-bottom: 15px; line-height: 1.4; }
.ai-modal-body { font-size: 16px; font-weight: 600; line-height: 1.6; color: var(--animal-text-muted); padding-bottom: 20px; }
.ai-modal-close {
  position: absolute; top: 20px; right: 20px; width: 32px; height: 32px; border-radius: 50%;
  border: none; background: transparent; color: rgba(114,93,66,.6); cursor: pointer; transition: all .2s var(--animal-ease);
}
.ai-modal-close::before, .ai-modal-close::after {
  content: ''; position: absolute; top: 50%; left: 50%; width: 14px; height: 2px; background: currentColor; border-radius: 2px;
}
.ai-modal-close::before { transform: translate(-50%,-50%) rotate(45deg); }
.ai-modal-close::after { transform: translate(-50%,-50%) rotate(-45deg); }
.ai-modal-close:hover { background: rgba(114,93,66,.1); color: rgba(114,93,66,1); }
@keyframes ai-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ai-zoom-in { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }

/* Textarea */
.ai-textarea {
  width: 100%; padding: 14px 18px; border-radius: var(--animal-radius);
  background: #fffdf7; color: var(--animal-text-muted); font-weight: 500; font-size: 14px;
  font-family: var(--animal-font); border: none; outline: none; resize: vertical;
  min-height: 120px; line-height: 1.6;
  transition: box-shadow .2s var(--animal-ease);
}
.ai-textarea::placeholder { color: var(--animal-text-disabled); font-weight: 400; }
.ai-textarea:hover { box-shadow: 0 3px 0 0 var(--animal-border); }
.ai-textarea:focus { box-shadow: 0 3px 0 0 var(--animal-focus-yellow-d), 0 0 0 3px rgba(255,204,0,.15); }

.modal-actions { display: flex; justify-content: flex-end; gap: 12px; }

.hidden { display: none !important; }

@media (max-width: 600px) {
  .head-row { flex-direction: column; align-items: stretch; }
  .head-tools { justify-content: flex-end; }
  .ai-input-search { max-width: none; width: 100%; }
  .ai-modal { padding: 40px 24px 24px; }
  .ai-modal-title { font-size: 22px; }
  .note-actions { flex-wrap: wrap; justify-content: flex-end; }
}
</style>
</head>
<body>

<!-- Modal blob clip-path 定义 -->
<svg style="position:absolute;width:0;height:0" aria-hidden="true">
  <defs>
    <clipPath id="animal-modal-clip" clipPathUnits="objectBoundingBox">
      <path d="M0.501,0.005 L0.501,0.005 L0.523,0.005 L0.549,0.006 C0.704,0.01,0.796,0.017,0.825,0.027 L0.827,0.028 C0.872,0.045,0.939,0.044,0.978,0.17 C1,0.254,1,0.365,0.99,0.505 L0.988,0.513 C0.979,0.558,0.971,0.598,0.965,0.633 C0.956,0.689,0.979,0.77,0.964,0.865 C0.953,0.928,0.921,0.966,0.869,0.979 C0.821,0.986,0.773,0.992,0.726,0.995 L0.712,0.996 L0.694,0.997 C0.648,1,0.586,1,0.507,1 L0.501,1 L0.464,1 C0.385,1,0.325,0.998,0.283,0.995 C0.234,0.992,0.184,0.987,0.133,0.979 C0.081,0.966,0.05,0.928,0.039,0.865 C0.023,0.77,0.047,0.689,0.037,0.633 C0.031,0.595,0.023,0.552,0.013,0.505 C-0.006,0.365,-0.002,0.254,0.024,0.17 C0.064,0.045,0.13,0.045,0.174,0.028 L0.175,0.028 C0.204,0.017,0.303,0.009,0.474,0.005 L0.501,0.005"/>
    </clipPath>
  </defs>
</svg>

<div class="app">
  <header class="app-head">
    <div class="head-row">
      <div class="hero-title-wrap">
        <div class="ai-title">
          <span class="t-back-l"></span><span class="t-back-r"></span>
          <span class="t-fold-l"></span><span class="t-fold-r"></span>
          <span class="t-front"><span>备忘录</span></span>
        </div>
      </div>
      <div class="head-tools">
        <button class="ai-btn ai-btn-default" id="btnImport">导入</button>
        <button class="ai-btn ai-btn-default" id="btnExport">导出</button>
        <button class="ai-btn ai-btn-primary" id="btnNew"><span class="plus"></span>新建</button>
      </div>
    </div>
    <div class="head-row2">
      <input type="search" id="search" class="ai-input ai-input-search" placeholder="搜索备忘标题或内容…">
      <span class="head-stats" id="stats"></span>
    </div>
  </header>

  <div class="ai-banner hidden" id="persistBanner">提示：当前为内存模式，数据不会持久化。请按 README 配置 Cloudflare KV 绑定后重启 Worker。</div>

  <main id="noteList" class="note-list"></main>
  <div id="empty" class="empty hidden"></div>
</div>

<!-- 编辑 Modal -->
<div class="ai-modal-mask hidden" id="modal">
  <div class="ai-modal">
    <button class="ai-modal-close" id="btnClose" aria-label="关闭"></button>
    <h2 class="ai-modal-title" id="modalTitle">新建备忘</h2>
    <div class="ai-modal-body">
      <input type="text" id="noteTitle" class="ai-input ai-input-block" placeholder="标题（可选）" maxlength="100">
      <textarea id="noteContent" class="ai-textarea" placeholder="写点什么…" rows="6"></textarea>
    </div>
    <div class="modal-actions">
      <button class="ai-btn ai-btn-default" id="btnCancel">取消</button>
      <button class="ai-btn ai-btn-primary" id="btnSave">保存</button>
    </div>
  </div>
</div>

<input type="file" id="fileInput" accept=".json,application/json" class="hidden">

<script>
(function() {
  'use strict';
  var notes = [];
  var currentId = null;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = Date.now() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function sortNotes() {
    notes.sort(function(a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  function getNote(id) {
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === id) return notes[i];
    }
    return null;
  }

  function updateLocal(note) {
    var found = false;
    notes = notes.map(function(n) {
      if (n.id === note.id) { found = true; return note; }
      return n;
    });
    if (!found) notes.push(note);
    sortNotes();
    renderNotes();
  }

  function renderNotes() {
    var listEl = $('noteList');
    var emptyEl = $('empty');
    var statsEl = $('stats');
    var keyword = ($('search').value || '').trim().toLowerCase();

    var filtered = notes.filter(function(n) {
      if (!keyword) return true;
      return (n.title || '').toLowerCase().indexOf(keyword) > -1 ||
             (n.content || '').toLowerCase().indexOf(keyword) > -1;
    });

    var doneCount = notes.filter(function(n) { return n.done; }).length;
    var pinnedCount = notes.filter(function(n) { return n.pinned; }).length;
    statsEl.textContent = '共 ' + notes.length + ' 条 · 已完成 ' + doneCount + ' · 已置顶 ' + pinnedCount;

    listEl.innerHTML = '';
    if (!filtered.length) {
      emptyEl.classList.remove('hidden');
      emptyEl.textContent = keyword ? '没有找到相关备忘' : '还没有备忘，点击「新建」开始记录吧～';
      return;
    }
    emptyEl.classList.add('hidden');

    filtered.forEach(function(n) {
      var card = document.createElement('div');
      card.className = 'note-card' + (n.pinned ? ' pinned' : '') + (n.done ? ' done' : '');
      card.dataset.id = n.id;

      var pinLabel = n.pinned ? '取消置顶' : '置顶';
      var pinClass = n.pinned ? ' active' : '';

      card.innerHTML =
        '<div class="note-top">' +
          '<label class="ai-checkbox">' +
            '<input type="checkbox"' + (n.done ? ' checked' : '') + ' data-action="toggle" aria-label="标记完成">' +
            '<svg class="check" viewBox="0 0 12 11" aria-hidden="true"><path d="M1 5.5L4.5 9L11 1.5"/></svg>' +
          '</label>' +
          '<div class="note-text">' +
            '<h3 class="note-title">' + escapeHtml(n.title) + '</h3>' +
            (n.content ? '<p class="note-content">' + escapeHtml(n.content) + '</p>' : '') +
          '</div>' +
        '</div>' +
        '<div class="note-foot">' +
          '<span class="note-time">' + formatTime(n.updatedAt) + '</span>' +
          '<span class="note-actions">' +
            '<button class="note-btn' + pinClass + '" data-action="pin">' + pinLabel + '</button>' +
            '<button class="note-btn" data-action="edit">编辑</button>' +
            '<button class="note-btn danger" data-action="delete">删除</button>' +
          '</span>' +
        '</div>';

      listEl.appendChild(card);
    });
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) { return r.json(); });
  }

  function loadNotes() {
    fetch('/api/notes').then(function(r) { return r.json(); }).then(function(res) {
      if (!res.ok) return;
      notes = res.notes || [];
      sortNotes();
      if (!res.persistent) $('persistBanner').classList.remove('hidden');
      renderNotes();
    }).catch(function() { /* 网络异常时保持页面 */ });
  }

  function openModal(id) {
    currentId = id || null;
    $('modalTitle').textContent = id ? '编辑备忘' : '新建备忘';
    $('noteTitle').value = '';
    $('noteContent').value = '';
    if (id) {
      var n = getNote(id);
      if (n) {
        $('noteTitle').value = n.title === '无标题' ? '' : n.title;
        $('noteContent').value = n.content || '';
      }
    }
    $('modal').classList.remove('hidden');
    $('noteTitle').focus();
  }

  function closeModal() {
    $('modal').classList.add('hidden');
    currentId = null;
  }

  function saveNote() {
    var title = $('noteTitle').value.trim();
    var content = $('noteContent').value.trim();
    if (!title && !content) { alert('标题和内容不能同时为空'); return; }
    var url = '/api/notes';
    var method = 'POST';
    if (currentId) { url = '/api/notes/' + encodeURIComponent(currentId); method = 'PUT'; }
    api(method, url, { title: title, content: content })
      .then(function(res) {
        if (res.ok) { closeModal(); updateLocal(res.note); }
        else { alert(res.error || '保存失败'); }
      })
      .catch(function() { alert('网络错误，保存失败'); });
  }

  function toggleNote(id, done) {
    api('PUT', '/api/notes/' + encodeURIComponent(id), { done: done })
      .then(function(res) { if (res.ok) updateLocal(res.note); });
  }

  function togglePin(id) {
    var n = getNote(id);
    if (!n) return;
    api('PUT', '/api/notes/' + encodeURIComponent(id), { pinned: !n.pinned })
      .then(function(res) { if (res.ok) updateLocal(res.note); });
  }

  function deleteNote(id) {
    if (!confirm('确定要删除这条备忘吗？')) return;
    api('DELETE', '/api/notes/' + encodeURIComponent(id))
      .then(function(res) {
        if (res.ok) {
          notes = notes.filter(function(n) { return n.id !== id; });
          renderNotes();
        }
      });
  }

  function exportNotes() {
    var data = {
      app: 'notememo',
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: notes
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'notememo-export-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importNotes() {
    var fileInput = $('fileInput');
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        var arr = Array.isArray(data) ? data : (data && Array.isArray(data.notes) ? data.notes : null);
        if (!arr) throw new Error('bad format');
        api('POST', '/api/notes/import', { notes: arr })
          .then(function(res) {
            if (res.ok) {
              alert('导入成功：' + res.imported + ' 条备忘');
              loadNotes();
            } else {
              alert(res.error || '导入失败');
            }
          })
          .catch(function() { alert('网络错误，导入失败'); });
      } catch (err) {
        alert('文件格式不正确，请选择本应用导出的 JSON 文件');
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  }

  // 绑定事件
  $('btnNew').addEventListener('click', function() { openModal(null); });
  $('btnCancel').addEventListener('click', closeModal);
  $('btnClose').addEventListener('click', closeModal);
  $('btnSave').addEventListener('click', saveNote);
  $('search').addEventListener('input', renderNotes);
  $('btnExport').addEventListener('click', exportNotes);
  $('btnImport').addEventListener('click', function() { $('fileInput').click(); });
  $('fileInput').addEventListener('change', importNotes);

  $('modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  $('noteTitle').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(); }
  });

  $('noteList').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var card = btn.closest('.note-card');
    if (!card) return;
    var id = card.dataset.id;
    var action = btn.dataset.action;
    if (action === 'toggle') toggleNote(id, btn.checked);
    else if (action === 'pin') togglePin(id);
    else if (action === 'edit') openModal(id);
    else if (action === 'delete') deleteNote(id);
  });

  loadNotes();
})();
</script>
</body>
</html>`;

// ========== Worker 入口 ==========
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (pathname.startsWith('/api/')) {
      return handleApi(request, method, pathname, env);
    }

    return new Response(HTML_PAGE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};