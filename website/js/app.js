/* ============================================================
 * 后端工程师的自我修养 · 知识库网站
 * 所有内容实时读取自 GitHub 仓库（jsDelivr CDN + GitHub API）
 * ============================================================ */
'use strict';

const REPO = 'tghrxxxyyy/knowledge-base';
const BRANCH = 'main';
const RAW_BASE = `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/`;
const TREE_API = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
const GH_BASE = `https://github.com/${REPO}/blob/${BRANCH}/`;
const IDX_URL = `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/website/search-index.json`;

const BOARD_META = {
  '基础知识': { icon: '🧱', color: '#7c9cff' },
  '设计模式': { icon: '🏛️', color: '#9d7bff' },
  '算法': { icon: '🧮', color: '#4fd1c5' },
  '分库分表与数据迁移': { icon: '🗄️', color: '#ff9d6b' },
  '场景设计': { icon: '🎯', color: '#ff7ab8' },
  'DDD': { icon: '🧩', color: '#6ee7a0' },
  '云原生': { icon: '☁️', color: '#5ab0ff' },
  '架构': { icon: '🏗️', color: '#ffc46b' },
  '业务模型': { icon: '💼', color: '#f472b6' },
  '技术选型': { icon: '⚖️', color: '#a78bfa' },
  '源码系列': { icon: '🔬', color: '#34d399' },
  '测试与代码质量': { icon: '🧪', color: '#fbbf24' },
  'SRE与稳定性工程': { icon: '🛡️', color: '#f87171' },
  '安全工程': { icon: '🔐', color: '#60a5fa' },
  '大模型': { icon: '🤖', color: '#c084fc' },
  '开源项目': { icon: '⭐', color: '#fde047' },
};

const state = {
  index: null,          // search-index.json
  tree: null,           // GitHub trees 降级
  sidebarOpen: false,
  currentPath: null,
  renderedHeadings: [],
};

const $ = (id) => document.getElementById(id);

/* ---------- 工具 ---------- */
function encPath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}
function rawUrl(p) {
  return RAW_BASE + encPath(p);
}
function normalizePath(p) {
  const parts = [];
  for (const seg of p.replace(/^\.\//, '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}
function isMd(p) { return /\.md$/i.test(p); }
function esc(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function toast(msg, isErr = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', isErr);
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- 数据加载 ---------- */
async function fetchJSON(url, fallback) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    if (fallback) return fallback();
    throw e;
  }
}

async function loadIndex() {
  // 优先用构建索引，失败则回退 GitHub trees API
  try {
    const idx = await fetchJSON(IDX_URL);
    if (idx && idx.entries && idx.entries.length) {
      state.index = idx;
      return;
    }
  } catch (e) { /* 继续降级 */ }
  try {
    const tree = await fetchJSON(TREE_API);
    state.tree = tree;
    const entries = (tree.tree || [])
      .filter(t => t.type === 'blob' && isMd(t.path))
      .map(t => ({
        path: t.path,
        title: t.path.split('/').pop().replace(/\.md$/, ''),
        excerpt: '',
        board: t.path.includes('/') ? t.path.split('/')[0] : '(根)',
        lines: t.size ? Math.max(1, Math.round(t.size / 40)) : 0,
      }));
    state.index = { entries, total: entries.length, fromTree: true };
  } catch (e) {
    toast('索引加载失败，请检查网络后刷新', true);
  }
}

async function fetchDoc(path) {
  const r = await fetch(rawUrl(path));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

/* ---------- 侧边栏 ---------- */
function boardOf(p) { return p.includes('/') ? p.split('/')[0] : '📌 根目录'; }

function renderSidebar() {
  if (!state.index) return;
  const entries = state.index.entries;
  $('doc-count').textContent = state.index.total + ' 篇';

  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.board)) groups.set(e.board, []);
    groups.get(e.board).push(e);
  }
  const order = ['基础知识', '设计模式', '算法', '分库分表与数据迁移', '场景设计', 'DDD', '云原生',
    '架构', '业务模型', '技术选型', '源码系列', '测试与代码质量', 'SRE与稳定性工程',
    '安全工程', '大模型', '开源项目'];

  const root = $('tree');
  root.innerHTML = '';
  let firstOpen = false;
  for (const board of order) {
    const list = groups.get(board);
    if (!list) continue;
    const meta = BOARD_META[board] || { icon: '📂', color: '#7c9cff' };
    const sec = document.createElement('section');
    sec.className = 'tree-board' + (firstOpen ? ' open' : '');
    firstOpen = true;

    const toggle = document.createElement('button');
    toggle.className = 'tree-board-toggle';
    toggle.innerHTML = `<span class="tw">▶</span><span class="bd-icon" style="background:${meta.color}22">${meta.icon}</span>
      <span class="bd-name">${esc(board)}</span><span class="bd-count">${list.length}</span>`;
    toggle.onclick = () => sec.classList.toggle('open');

    const body = document.createElement('div');
    body.className = 'tree-board-body';

    const readme = list.find(e => e.path.endsWith('/README.md'));
    const docs = [...list.filter(e => !e.path.endsWith('/README.md')),
      ...(readme ? [readme] : [])]; // README 置底
    for (const e of docs) {
      const a = document.createElement('a');
      a.className = 'tree-file';
      a.href = '#/' + encPath(e.path);
      a.dataset.path = e.path;
      const isR = e.path.endsWith('README.md');
      a.innerHTML = `<span class="tf-ico">${isR ? '🏠' : '📄'}</span><span>${esc(e.title)}</span>`;
      a.addEventListener('click', () => { if (window.innerWidth <= 980) closeSidebar(); });
      body.appendChild(a);
    }
    sec.appendChild(toggle);
    sec.appendChild(body);
    root.appendChild(sec);
  }
  $('tree-state').textContent = '数据源：GitHub 实时同步';
  markActive();
}

function markActive() {
  document.querySelectorAll('.tree-file').forEach(a => {
    a.classList.toggle('active', a.dataset.path === state.currentPath);
  });
}

function openSidebar() { state.sidebarOpen = true; $('sidebar').classList.add('show'); }
function closeSidebar() { state.sidebarOpen = false; $('sidebar').classList.remove('show'); }

/* ---------- 首页仪表盘 ---------- */
const PATHS = [
  { tag: 'PATH A', title: '后端工程师成长闭环', desc: 'Java → JVM → MySQL → Redis → Spring 源码 → 设计模式 → 算法', route: '基础知识 → 源码系列 → 设计模式 → 算法', start: '基础知识/README.md' },
  { tag: 'PATH B', title: '高并发架构师实战', desc: '系统设计 → 分布式锁 → 缓存一致性 → 限流熔断 → DDD → K8s', route: '场景设计 → DDD → 云原生 → 源码系列', start: '场景设计/4S设计法.md' },
  { tag: 'PATH C', title: '大模型 / Agent 应用落地', desc: '提示词 → 上下文工程 → RAG → 智能体 → 训练部署', route: '大模型板块全景', start: '大模型/README.md' },
  { tag: 'PATH D', title: '数据工程与研发效能', desc: '大数据 → 时序库 → CI/CD → 测试质量 → SRE → 安全', route: '基础知识 → 测试 → SRE → 安全工程', start: '基础知识/大数据/README.md' },
];

function renderHome() {
  state.currentPath = null;
  document.title = '后端工程师的自我修养 · 知识库';
  markActive();

  const entries = state.index ? state.index.entries : [];
  const totalLines = entries.reduce((s, e) => s + (e.lines || 0), 0);
  const boards = [...new Set(entries.map(boardOf))].filter(b => b !== '📌 根目录');
  const emoji = entries.filter(e => e.lines && e.lines < 60).length;
  const imgDocs = entries.length;

  const pathCards = PATHS.map(p => `
    <div class="path-card" onclick="location.hash='#/${encPath(p.start)}'">
      <div class="pc-tag">${p.tag}</div>
      <h3>${p.title}</h3>
      <p>${p.desc}</p>
      <div class="pc-route">${p.route}</div>
    </div>`).join('');

  const boardCards = boards.map((b, i) => {
    const meta = BOARD_META[b] || { icon: '📂', color: ['#7c9cff', '#9d7bff', '#4fd1c5'][i % 3] };
    const list = entries.filter(e => boardOf(e) === b);
    const docs = list.filter(e => !/README\.md$/.test(e.path)).length;
    const lines = list.reduce((s, e) => s + (e.lines || 0), 0);
    const desc = list.find(e => e.path.endsWith('README.md'));
    const excerpt = desc && desc.excerpt ? desc.excerpt.slice(0, 46) + '…' : '点击进入板块';
    return `
    <div class="board-card" style="--bc:${meta.color}" onclick="location.hash='#/${encPath(b + '/README.md')}'">
      <div class="bc-icon">${meta.icon}</div>
      <h3>${esc(b)}</h3>
      <p>${esc(excerpt)}</p>
      <div class="bc-meta"><span>📄 ${docs} 篇</span><span>⏱ ${(lines / 100).toFixed(0)}k 行</span></div>
    </div>`;
  }).join('');

  const hero = `
  <div class="hero glass">
    <h1><span class="grad">后端工程师的自我修养</span></h1>
    <p>把踩过的坑、想通的事、读过的源码，写成一本可以随时翻开的、属于自己的书。</p>
    <div class="hero-stats">
      <div class="stat"><b>${imgDocs}</b><span>技术文档</span></div>
      <div class="stat"><b>${boards.length}</b><span>知识板块</span></div>
      <div class="stat"><b>${(totalLines / 1000).toFixed(1)}k</b><span>代码/正文行</span></div>
      <div class="stat"><b>${emoji}</b><span>精悍速查</span></div>
    </div>
  </div>`;

  const content = `
  <section>${hero}</section>
  <div class="paths-title">🧭 四条阅读路径</div>
  <section class="path-grid">${pathCards}</section>
  <div class="boards-title">🗂️ 知识板块（点击进入）</div>
  <section class="board-grid">${boardCards}</section>`;

  $('content').innerHTML = content;
}

/* ---------- 文档渲染 ---------- */
function setupMarked() {
  const renderer = new marked.Renderer();

  renderer.image = (href, title, text) => {
    if (!href) return '';
    let url = href;
    if (!/^(https?:|data:)/.test(href)) {
      url = rawUrl(normalizePath(dirOf(state.currentPath) + '/' + href));
    }
    return `<img src="${esc(url)}" alt="${esc(text || '')}" title="${esc(title || '')}" loading="lazy">`;
  };

  renderer.link = (href, title, text) => {
    if (!href) return text;
    if (/^(https?:|mailto:)/.test(href)) {
      return `<a href="${esc(href)}" target="_blank" rel="noopener" title="${esc(title || '')}">${text}</a>`;
    }
    if (href.startsWith('#')) return `<a href="${href}" title="${esc(title || '')}">${text}</a>`;
    if (isMd(href.split('?')[0])) {
      const target = normalizePath(dirOf(state.currentPath) + '/' + href.split('#')[0]);
      const hash = href.includes('#') ? '#' + href.split('#')[1] : '';
      return `<a class="kb-link" data-target="${esc(target)}" href="#/${encPath(target)}${hash}" title="${esc(title || '')}">${text}</a>`;
    }
    // 非 md 资源（如相对代码文件），直接转 CDN
    const url = rawUrl(normalizePath(dirOf(state.currentPath) + '/' + href));
    return `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(title || '')}">${text}</a>`;
  };

  marked.setOptions({
    renderer,
    gfm: true,
    breaks: false,
    mangle: false,
    headerIds: true,
  });
}

function dirOf(p) { return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; }

function collectHeadings() {
  state.renderedHeadings = [...document.querySelectorAll('.doc-body h1, .doc-body h2, .doc-body h3')]
    .map(h => ({ level: +h.tagName[1], text: h.textContent.trim(), id: h.id }))
    .filter(h => h.textContent && h.textContent !== '免责声明');
  renderToc();
}

function renderToc() {
  const toc = $('toc');
  if (!toc) return;
  if (!state.renderedHeadings.length) { toc.innerHTML = ''; return; }
  toc.innerHTML = `<div class="toc-title">📑 本页目录</div>` +
    state.renderedHeadings
      .filter(h => h.level <= 3)
      .map(h => `<a class="lv${h.level}" href="#${esc(h.id)}">${esc(h.text)}</a>`)
      .join('');
}

function afterRender() {
  // 代码高亮
  document.querySelectorAll('.doc-body pre code').forEach(block => {
    const lang = (block.className.match(/language-([\w+-]+)/) || [])[1];
    if (window.hljs && lang && hljs.getLanguage(lang)) {
      try { hljs.highlightElement(block); } catch (e) { /* 忽略 */ }
    } else if (window.hljs) {
      try { hljs.highlightElement(block); } catch (e) { /* 忽略 */ }
    }
  });

  // Mermaid
  document.querySelectorAll('.doc-body pre code.language-mermaid').forEach(el => {
    if (!window.mermaid) return;
    const pre = el.closest('pre');
    if (!pre) return;
    const code = el.textContent;
    pre.innerHTML = `<div class="mermaid">${esc(code)}</div>`;
  });
  if (window.mermaid && document.querySelector('.doc-body .mermaid')) {
    try {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
      mermaid.run({ nodes: document.querySelectorAll('.doc-body .mermaid') }).catch(() => {});
    } catch (e) { /* 忽略 */ }
  }

  // KaTeX
  if (window.renderMathInElement) {
    try {
      renderMathInElement(document.querySelector('.doc-body'), {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    } catch (e) { /* 忽略 */ }
  }

  collectHeadings();
}

async function renderDoc(path) {
  const loading = $('content');
  state.currentPath = path;
  markActive();

  loading.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-dim)">
    <div style="font-size:13px">正在从 GitHub 拉取文档…</div>
    <div class="spinner" style="margin:14px auto;width:22px;height:22px"></div></div>`;

  let md;
  try {
    md = await fetchDoc(path);
  } catch (e) {
    loading.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-dim)">
      <div style="font-size:34px">🌩️</div>
      <p style="margin-top:10px">文档拉取失败（${esc(e.message)}）</p>
      <a href="https://github.com/${REPO}/blob/${BRANCH}/${encPath(path)}" target="_blank" rel="noopener" style="font-size:13px">在 GitHub 上查看原文 →</a></div>`;
    toast('文档加载失败', true);
    return;
  }

  const entry = state.index && state.index.entries.find(e => e.path === path);
  const title = entry && entry.title ? entry.title : path.split('/').pop();
  const html = marked.parse(md);

  const board = boardOf(path);
  const boardMeta = BOARD_META[board] || { icon: '📂', color: '#7c9cff' };

  // 上一篇/下一篇
  let prev = null, next = null;
  if (state.index) {
    const flat = state.index.entries.filter(e => e.path.endsWith('.md'));
    const idx = flat.findIndex(e => e.path === path);
    if (idx > 0) prev = flat[idx - 1];
    if (idx < flat.length - 1) next = flat[idx + 1];
  }

  const breadcrumb = path.split('/').map((seg, i, arr) => {
    if (i === arr.length - 1) return `<span>${esc(seg)}</span>`;
    const prefix = arr.slice(0, i + 1).join('/');
    const target = i === 0 ? prefix + '/README.md' : prefix;
    return `<a href="#/${encPath(target)}">${esc(seg)}</a> / `;
  }).join('');

  $('content').innerHTML = `
    <div class="doc-shell">
      <article class="doc-body glass">
        <div class="doc-crumb">📁 ${breadcrumb}</div>
        <div class="markdown-body">${html}</div>
        <div class="doc-toolbar">
          <a href="${GH_BASE}${encPath(path)}" target="_blank" rel="noopener">🔗 GitHub 原文</a>
          <a href="${rawUrl(path)}" target="_blank" rel="noopener">⬇️ 原始 Markdown</a>
          <a href="#/">🏠 返回首页</a>
          <span style="flex:1"></span>
          <a href="#" id="btn-back-top">⬆️ 回到顶部</a>
        </div>
        ${next ? `<a class="doc-next" href="#/${encPath(next.path)}">下一篇 · ${esc(next.title)} →</a>` : ''}
      </article>
      <aside class="toc glass" id="toc"></aside>
    </div>`;

  document.title = `${title} · 后端工程师的自我修养`;
  $('btn-back-top').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  afterRender();
  window.scrollTo({ top: 0 });
}

/* ---------- 路由 ---------- */
function parseHash() {
  const h = location.hash;
  if (!h || h === '#/') return null;
  const m = h.match(/^#\/(.+?)(#.*)?$/);
  if (!m) return null;
  try {
    return { path: decodeURIComponent(m[1]), anchor: m[2] || '' };
  } catch (e) {
    return null;
  }
}

async function route() {
  const r = parseHash();
  if (!r) {
    renderHome();
    return;
  }
  // 锚点滚动（本页内）
  if (state.currentPath === r.path && r.anchor) {
    const el = document.getElementById(r.anchor.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  await renderDoc(r.path);
  if (r.anchor) {
    setTimeout(() => {
      const el = document.getElementById(r.anchor.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  }
}

/* ---------- 搜索 ---------- */
function fuzzy(hay, q) {
  if (!hay) return false;
  hay = hay.toLowerCase();
  q = q.toLowerCase();
  if (hay.includes(q)) return true;
  let qi = 0;
  for (const ch of hay) {
    if (ch === q[qi]) qi++;
    if (qi === q.length) return true;
  }
  return false;
}

function runSearch(q) {
  const panel = $('search-panel');
  if (!q.trim()) { panel.hidden = true; return; }
  if (!state.index) return;

  const ql = q.trim().toLowerCase();
  const results = state.index.entries.filter(e =>
    fuzzy(e.title, ql) || fuzzy(e.path, ql) || fuzzy(e.board, ql) || fuzzy(e.excerpt, ql)
  ).slice(0, 12);

  if (!results.length) {
    panel.innerHTML = `<div class="search-empty">没有找到「${esc(q)}」相关文档</div>`;
    panel.hidden = false;
    return;
  }
  const hl = (s) => {
    if (!ql) return esc(s);
    const i = s.toLowerCase().indexOf(ql);
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + `<mark>${esc(s.slice(i, i + ql.length))}</mark>` + esc(s.slice(i + ql.length));
  };
  panel.innerHTML = results.map(e => `
    <a class="search-item" href="#/${encPath(e.path)}">
      <div class="si-title">${hl(e.title)}</div>
      <div class="si-meta">${esc(e.board)} / ${esc(e.path)}</div>
      ${e.excerpt ? `<div class="si-excerpt">${hl(e.excerpt)}</div>` : ''}
    </a>`).join('');
  panel.hidden = false;
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  $('btn-sidebar').addEventListener('click', () => {
    state.sidebarOpen ? closeSidebar() : openSidebar();
  });

  $('btn-theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('kb-theme', next);
    const mdCss = $('gh-md-css');
    if (mdCss) {
      mdCss.href = next === 'dark'
        ? 'https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown-dark.min.css'
        : 'https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.1/github-markdown-light.min.css';
    }
    if (window.mermaid) {
      try { mermaid.initialize({ theme: next === 'dark' ? 'dark' : 'neutral' }); } catch (e) {}
    }
  });

  const input = $('search-input');
  input.addEventListener('input', () => runSearch(input.value));
  input.addEventListener('focus', () => { if (input.value.trim()) runSearch(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('search-panel').hidden) {
      const first = $('search-panel').querySelector('.search-item');
      if (first) { first.click(); input.blur(); }
    }
    if (e.key === 'Escape') { $('search-panel').hidden = true; input.blur(); }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) $('search-panel').hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) {
      e.preventDefault(); input.focus();
    }
  });

  // 站内 markdown 相对链接（直接点击渲染后的 a）
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || !a.classList.contains('kb-link')) return;
    e.preventDefault();
    location.hash = a.getAttribute('href');
  });

  // 大纲高亮
  const tocBox = document.getElementById('toc');
  if (tocBox) {
    window.addEventListener('scroll', () => {
      if (!state.renderedHeadings.length || !tocBox.innerHTML) return;
      const pos = window.scrollY + 140;
      let cur = '';
      for (const h of state.renderedHeadings) {
        const el = document.getElementById(h.id);
        if (el && el.offsetTop <= pos) cur = h.id;
      }
      tocBox.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
    }, { passive: true });
  }
}

/* ---------- 启动 ---------- */
(async function init() {
  // 主题
  const saved = localStorage.getItem('kb-theme');
  if (saved) document.documentElement.dataset.theme = saved;

  bindEvents();

  // 显示首页骨架
  renderHome();

  // 加载索引并渲染侧边栏
  await loadIndex();
  renderSidebar();

  // 路由
  window.addEventListener('hashchange', route);
  await route();
})();
