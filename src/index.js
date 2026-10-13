/**
 * Notememo - 基于 Cloudflare Workers 的备忘录应用
 *
 * 路由：
 *   GET  /                 返回备忘录 Web 应用（单页）
 *   GET  /api/notes         获取全部备忘录
 *   POST /api/notes        新建备忘录
 *   PUT  /api/notes/:id    更新备忘录
 *   DELETE /api/notes/:id 删除备忘录
 *
 * 存储：
 *   - 若 Worker 绑定了名为 NOTES 的 KV namespace，数据持久化到 KV。
 *   - 未绑定时使用内存 Map（仅用于快速预览，重启后数据丢失）。
 */

// ===================== 前端页面 =====================
const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>备忘录 Notememo</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: linear-gradient(135deg, #eef2ff 0%, #f8faff 100%);
    min-height: 100vh;
    color: #1e293b;
  }
  .app { max-width: 720px; margin: 0 auto; padding: 24px 16px 80px; }
  .app-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0 16px; flex-wrap: wrap; gap: 12px;
  }
  .logo {
    font-size: 26px; font-weight: 800; letter-spacing: 1px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .header-actions { display: flex; gap: 10px; flex: 1; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
  #search {
    padding: 10px 16px; border: 1px solid #e2e8f0; border-radius: 999px;
    background: #fff; width: 220px; outline: none; font-size: 14px;
    transition: box-shadow .2s, border-color .2s;
  }
  #search:focus { box-shadow: 0 0 0 3px rgba(79,70,229,.15); border-color: #a5b4fc; }
  .btn-primary {
    background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; border: none;
    padding: 10px 20px; border-radius: 999px; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: transform .15s, box-shadow .15s;
    box-shadow: 0 4px 12px rgba(79,70,229,.28);
  }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(79,70,229,.38); }
  .btn-primary:active { transform: translateY(0); }
  .banner {
    background: #fef3c7; border: 1px solid #fcd34d; color: #92400e;
    padding: 11px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; margin: 4px 0 14px;
  }
  .banner a { color: #92400e; font-weight: 700; }
  .stats { font-size: 13px; color: #64748b; margin: 10px 4px; }
  .note-list { display: flex; flex-direction: column; gap: 12px; }
  .note-card {
    background: #fff; border-radius: 16px; padding: 16px 18px;
    box-shadow: 0 2px 8px rgba(15,23,42,.05); border: 1px solid #eef2f7;
    transition: box-shadow .2s, transform .15s; cursor: pointer; position: relative;
  }
  .note-card:hover { box-shadow: 0 6px 20px rgba(15,23,42,.08); transform: translateY(-2px); }
  .note-card.pinned { border-left: 4px solid #f59e0b; }
  .note-card.done { background: #fafbfc; }
  .note-card.done .note-title { text-decoration: line-through; color: #94a3b8; }
  .note-card-top { display: flex; align-items: flex-start; gap: 10px; }
  .checkbox { position: relative; margin-top: 3px; flex-shrink: 0; width: 20px; height: 20px; }
  .checkbox input { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; z-index: 1; }
  .checkbox span {
    display: block; width: 20px; height: 20px; border-radius: 6px;
    border: 2px solid #cbd5e1; transition: all .15s; background: #fff;
  }
  .checkbox input:checked + span { background: #4f46e5; border-color: #4f46e5; }
  .checkbox input:checked + span::after {
    content: ""; position: absolute; left: 6px; top: 2px; width: 5px; height: 10px;
    border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
  }
  .note-title { flex: 1; font-size: 16px; font-weight: 600; word-break: break-all; line-height: 1.5; }
  .note-actions { display: flex; gap: 2px; flex-shrink: 0; }
  .icon-btn {
    background: none; border: none; cursor: pointer; font-size: 15px;
    padding: 5px; border-radius: 8px; opacity: .5; transition: opacity .15s, background .15s, transform .15s;
  }
  .icon-btn:hover { opacity: 1; background: #f1f5f9; transform: scale(1.1); }
  .icon-btn.pin-off { filter: grayscale(1); opacity: .35; }
  .note-content {
    margin: 10px 0 0; color: #475569; font-size: 14px; line-height: 1.65;
    white-space: pre-wrap; word-break: break-all;
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  }
  .note-footer { margin-top: 12px; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between; }
  .tag-pin { font-size: 11px; color: #b45309; background: #fef3c7; padding: 2px 8px; border-radius: 999px; }
  .empty { text-align: center; color: #94a3b8; padding: 70px 0; font-size: 15px; line-height: 1.8; }
  .hidden { display: none !important; }

  .modal {
    position: fixed; inset: 0; background: rgba(15,23,42,.45);
    display: flex; align-items: center; justify-content: center; padding: 20px;
    z-index: 100; backdrop-filter: blur(3px);
  }
  .modal-card {
    background: #fff; border-radius: 20px; padding: 26px; width: 100%; max-width: 500px;
    box-shadow: 0 20px 60px rgba(15,23,42,.25); animation: modalIn .2s ease;
  }
  @keyframes modalIn {
    from { opacity: 0; transform: translateY(14px) scale(.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .modal-card h2 { font-size: 18px; margin-bottom: 18px; }
  .modal-card input[type="text"], .modal-card textarea {
    width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 12px;
    font-size: 14px; font-family: inherit; outline: none; margin-bottom: 14px;
    transition: box-shadow .2s, border-color .2s;
  }
  .modal-card input[type="text"]:focus, .modal-card textarea:focus {
    box-shadow: 0 0 0 3px rgba(79,70,229,.15); border-color: #4f46e5;
  }
  .modal-card textarea { resize: vertical; min-height: 130px; line-height: 1.6; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
  .btn-cancel {
    background: #f1f5f9; color: #475569; border: none; padding: 10px 20px;
    border-radius: 999px; font-size: 14px; cursor: pointer; transition: background .15s;
  }
  .btn-cancel:hover { background: #e2e8f0; }

  @media (max-width: 520px) {
    .header-actions { justify-content: stretch; }
    #search { flex: 1; width: auto; }
    .app { padding-top: 14px; }
  }
</style>
</head>
<body>
<div class="app">
  <header class="app-header">
    <div class="logo">📝 备忘录</div>
    <div class="header-actions">
      <input type="search" id="search" placeholder="搜索备忘..." autocomplete="off">
      <button class="btn-primary" id="btnNew">＋ 新建</button>
    </div>
  </header>

  <div id="persist-banner" class="banner hidden">
    ⚠️ 当前为<b>内存模式</b>，数据在 Worker 重启后会丢失。请配置
    <a href="https://developers.cloudflare.com/kv/" target="_blank" rel="noopener">Cloudflare KV</a>
    绑定（变量名 <code>NOTES</code>）以持久化数据，详见项目 README。
  </div>

  <div class="stats" id="stats"></div>

  <main id="noteList" class="note-list"></main>
  <div id="empty" class="empty hidden">还没有备忘<br>点击右上角「＋ 新建」开始记录吧 ✨</div>
</div>

<!-- 新建 / 编辑弹窗 -->
<div id="modal" class="modal hidden">
  <div class="modal-card">
    <h2 id="modalTitle">新建备忘</h2>
    <input type="text" id="noteTitle" placeholder="标题（可选）" maxlength="100">
    <textarea id="noteContent" placeholder="写点什么..."></textarea>
    <div class="modal-actions">
      <button class="btn-cancel" id="btnCancel">取消</button>
      <button class="btn-primary" id="btnSave">保存</button>
    </div>
  </div>
</div>

<script>
(function () {
  "use strict";

  var notes = [];
  var currentId = null; // 正在编辑的笔记 id，null 表示新建

  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function formatTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var diff = Date.now() - d.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
    if (diff < 172800000) return "昨天 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function render() {
    var listEl = $("noteList");
    var emptyEl = $("empty");
    var statsEl = $("stats");
    var keyword = ($("search").value || "").trim().toLowerCase();

    var filtered = notes.filter(function (n) {
      if (!keyword) return true;
      return (n.title || "").toLowerCase().indexOf(keyword) > -1 ||
             (n.content || "").toLowerCase().indexOf(keyword) > -1;
    });

    listEl.innerHTML = "";
    if (!filtered.length) {
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
    }

    var doneCount = notes.filter(function (n) { return n.done; }).length;
    var pinnedCount = notes.filter(function (n) { return n.pinned; }).length;
    var statsParts = ["共 " + notes.length + " 条备忘"];
    if (doneCount) statsParts.push("已完成 " + doneCount);
    if (pinnedCount) statsParts.push("置顶 " + pinnedCount);
    statsEl.textContent = statsParts.join(" · ");

    filtered.forEach(function (n) {
      var card = document.createElement("div");
      card.className = "note-card" + (n.done ? " done" : "") + (n.pinned ? " pinned" : "");
      card.dataset.id = n.id;

      var titleHtml = escapeHtml(n.title || "无标题");
      var contentHtml = escapeHtml(n.content || "");
      var contentBlock = contentHtml ? '<p class="note-content">' + contentHtml + "</p>" : "";
      var pinTag = n.pinned ? '<span class="tag-pin">置顶</span>' : "";
      var pinBtnClass = n.pinned ? "" : " pin-off";

      card.innerHTML =
        '<div class="note-card-top">' +
          '<label class="checkbox"><input type="checkbox" data-action="toggle" ' + (n.done ? "checked" : "") + "><span></span></label>" +
          '<h3 class="note-title">' + titleHtml + "</h3>" +
          '<div class="note-actions">' +
            '<button class="icon-btn' + pinBtnClass + '" data-action="pin" title="' + (n.pinned ? "取消置顶" : "置顶") + '">📌</button>' +
            '<button class="icon-btn" data-action="delete" title="删除">🗑️</button>' +
          "</div>" +
        "</div>" +
        contentBlock +
        '<div class="note-footer"><span>' + formatTime(n.updatedAt) + "</span>" + pinTag + "</div>";

      listEl.appendChild(card);
    });
  }

  function loadNotes() {
    return fetch("/api/notes", { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok) {
          notes = res.notes || [];
          if (!res.persistent) {
            $("persist-banner").classList.remove("hidden");
          } else {
            $("persist-banner").classList.add("hidden");
          }
          render();
        }
      })
      .catch(function () {});
  }

  function openModal(id) {
    currentId = id || null;
    $("modalTitle").textContent = currentId ? "编辑备忘" : "新建备忘";
    $("noteTitle").value = "";
    $("noteContent").value = "";
    if (currentId) {
      for (var i = 0; i < notes.length; i++) {
        if (notes[i].id === currentId) {
          $("noteTitle").value = notes[i].title || "";
          $("noteContent").value = notes[i].content || "";
          break;
        }
      }
    }
    $("modal").classList.remove("hidden");
    $("noteTitle").focus();
  }

  function closeModal() {
    $("modal").classList.add("hidden");
    currentId = null;
  }

  function saveNote() {
    var title = $("noteTitle").value.trim();
    var content = $("noteContent").value.trim();
    if (!title && !content) {
      alert("标题和内容不能同时为空");
      return;
    }
    var url = "/api/notes";
    var method = "POST";
    if (currentId) {
      url = "/api/notes/" + encodeURIComponent(currentId);
      method = "PUT";
    }
    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title, content: content })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok) {
          closeModal();
          loadNotes();
        } else {
          alert((res && res.error) || "保存失败");
        }
      })
      .catch(function () { alert("网络错误，保存失败"); });
  }

  // 列表事件委托
  $("noteList").addEventListener("click", function (e) {
    var target = e.target;
    var actionBtn = target.closest ? target.closest("[data-action]") : null;

    if (actionBtn) {
      e.stopPropagation();
      var card = actionBtn.closest(".note-card");
      var id = card.dataset.id;
      var action = actionBtn.dataset.action;

      if (action === "toggle") {
        toggleNote(id, actionBtn.checked);
      } else if (action === "pin") {
        togglePin(id);
      } else if (action === "delete") {
        deleteNote(id);
      }
      return;
    }

    // 点击卡片空白处 -> 编辑
    var noteCard = target.closest ? target.closest(".note-card") : null;
    if (noteCard) openModal(noteCard.dataset.id);
  });

  function toggleNote(id, done) {
    updateNote(id, { done: done });
  }

  function togglePin(id) {
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === id) {
        updateNote(id, { pinned: !notes[i].pinned });
        return;
      }
    }
  }

  function updateNote(id, patch) {
    fetch("/api/notes/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok) {
          // 本地同步更新，避免整页闪烁
          for (var i = 0; i < notes.length; i++) {
            if (notes[i].id === id) {
              for (var k in patch) { notes[i][k] = patch[k]; }
              notes[i].updatedAt = res.note.updatedAt;
              break;
            }
          }
          render();
        }
      })
      .catch(function () {});
  }

  function deleteNote(id) {
    if (!confirm("确定删除这条备忘吗？")) return;
    fetch("/api/notes/" + encodeURIComponent(id), { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok) {
          notes = notes.filter(function (n) { return n.id !== id; });
          render();
        }
      })
      .catch(function () { alert("网络错误，删除失败"); });
  }

  // 绑定按钮
  $("btnNew").addEventListener("click", function () { openModal(null); });
  $("btnSave").addEventListener("click", saveNote);
  $("btnCancel").addEventListener("click", closeModal);
  $("modal").addEventListener("click", function (e) {
    if (e.target === $("modal")) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && !$("modal").classList.contains("hidden")) {
      if (e.target === $("noteContent")) return; // 允许内容里换行
      e.preventDefault();
      saveNote();
    }
  });
  $("search").addEventListener("input", render);

  // 初始化
  loadNotes();
})();
</script>
</body>
</html>`;

// ===================== 工具函数 =====================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function generateId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function sortNotes(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return new Date(b.updatedAt) - new Date(a.updatedAt);
}

// ===================== 存储层 =====================

// 未绑定 KV 时的内存存储（模块级，同一 Worker isolate 内共享）
const memoryStore = new Map();

function createStore(env) {
  const kv = env && env.NOTES;

  if (kv) {
    // Cloudflare KV 持久化存储
    return {
      async getAll() {
        const list = await kv.list({ prefix: "note:" });
        const notes = [];
        for (const key of list.keys) {
          const raw = await kv.get(key.name);
          if (raw) {
            try {
              notes.push(JSON.parse(raw));
            } catch (e) {
              // 跳过损坏数据
            }
          }
        }
        return notes;
      },
      async get(id) {
        const raw = await kv.get("note:" + id);
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      },
      async put(note) {
        await kv.put("note:" + note.id, JSON.stringify(note));
      },
      async delete(id) {
        await kv.delete("note:" + id);
      },
    };
  }

  // 内存 fallback（快速预览用）
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

// ===================== API 处理 =====================

async function handleApi(request, method, pathname, env) {
  const store = createStore(env);
  const persistent = !!(env && env.NOTES);

  // GET /api/notes - 获取全部备忘录
  if (pathname === "/api/notes" && method === "GET") {
    const notes = await store.getAll();
    notes.sort(sortNotes);
    return json({ ok: true, notes, persistent });
  }

  // POST /api/notes - 新建备忘录
  if (pathname === "/api/notes" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const title = (body.title || "").toString().trim();
    const content = (body.content || "").toString().trim();
    if (!title && !content) {
      return json({ ok: false, error: "标题和内容不能同时为空" }, 400);
    }
    const now = new Date().toISOString();
    const note = {
      id: generateId(),
      title: title || "无标题",
      content,
      done: false,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    await store.put(note);
    return json({ ok: true, note }, 201);
  }

  // PUT /api/notes/:id - 更新备忘录
  const match = pathname.match(/^\/api\/notes\/([^/]+)$/);
  if (match) {
    const id = match[1];

    if (method === "PUT") {
      const existing = await store.get(id);
      if (!existing) {
        return json({ ok: false, error: "备忘录不存在" }, 404);
      }
      const body = await request.json().catch(() => ({}));
      if (body.title !== undefined) {
        const t = body.title.toString().trim();
        existing.title = t || "无标题";
      }
      if (body.content !== undefined) {
        existing.content = body.content.toString().trim();
      }
      if (body.done !== undefined) {
        existing.done = !!body.done;
      }
      if (body.pinned !== undefined) {
        existing.pinned = !!body.pinned;
      }
      existing.updatedAt = new Date().toISOString();
      await store.put(existing);
      return json({ ok: true, note: existing });
    }

    // DELETE /api/notes/:id - 删除备忘录
    if (method === "DELETE") {
      await store.delete(id);
      return json({ ok: true });
    }
  }

  return json({ ok: false, error: "接口不存在" }, 404);
}

// ===================== 入口 =====================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // CORS 预检
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // API 路由
    if (pathname.startsWith("/api/")) {
      return handleApi(request, method, pathname, env);
    }

    // 前端页面
    return new Response(HTML_PAGE, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};