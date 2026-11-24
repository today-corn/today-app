/* 玉米的App — 第一部分：工具、数据层、弹窗、单日（今天）页 */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = s => { const a = String(s).split('-').map(Number); return new Date(a[0], (a[1] || 1) - 1, a[2] || 1); };
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const num = v => Math.round(Number(v) || 0);
const money = v => (Math.round((Number(v) || 0) * 10) / 10).toString();
const fmtDate = s => { const d = parseYmd(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()]; };
const todayStr = () => ymd(new Date());
const dayDiff = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 86400000);

/* 相对今天的叫法 */
function relLabel(key) {
  const diff = dayDiff(key, todayStr());
  if (diff === 0) return '今天';
  if (diff === -1) return '昨天';
  if (diff === 1) return '明天';
  if (diff === -2) return '前天';
  if (diff === 2) return '后天';
  return '周' + WEEK[parseYmd(key).getDay()];
}

function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = x.getDay();
  x.setDate(x.getDate() + (w === 0 ? -6 : 1 - w));
  return x;
}
const mondayStr = d => ymd(mondayOf(d));
function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/* ---------- 数据层 ---------- */
const DB_KEY = 'corn_app_v1';
let db = {};
let modalCtx = {};
let currentTab = 'today';
let viewDate = todayStr();
let recipeFilter = 'all';
let recipeQuery = '';
let activeMondayStr = mondayStr(new Date());
let spendRange = 'week';
let pickerExtra = [];
let calYM = '';
let pendingPhoto = null;

function initDB(seed) {
  let parsed = null;
  try { parsed = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch (e) { parsed = null; }
  db = seed || parsed || {};
  db.customRecipes = db.customRecipes || [];
  db.customExercises = db.customExercises || [];
  db.recipeEdits = db.recipeEdits || {};
  db.cats = db.cats || [];
  db.catAdj = db.catAdj || {};
  db.catOverride = db.catOverride || {};
  db.catHidden = db.catHidden || [];
  db.plan = db.plan || {};
  db.links = db.links || {};
  db.photos = db.photos || {};
  db.recipeIcons = db.recipeIcons || {};
  db.weights = db.weights || [];
  db.expenses = db.expenses || [];
  db.checked = db.checked || {};
  db.fridge = db.fridge || [];
  db.shopExtra = db.shopExtra || {};
  db.shopHide = db.shopHide || {};
  db.shopEdit = db.shopEdit || {};
  db.shopDays = db.shopDays || {};
  db.shopChecked = db.shopChecked || {};
}
function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('存储空间不够了，先删掉几张照片再存'); return false; }
}
/* 菜谱读取时统一套用用户改过的内容（预置菜也能改） */
function allRecipes() {
  return PRESET_RECIPES.concat(db.customRecipes).map(function (r) {
    const e = db.recipeEdits[r.id];
    return e ? Object.assign({}, r, e) : r;
  });
}
const allExercises = () => PRESET_EXERCISES.concat(db.customExercises);
const recipeById = id => allRecipes().filter(r => r.id === id)[0];
const exerciseById = id => allExercises().filter(x => x.id === id)[0];
const photoOf = id => db.photos[id] || '';
/* 菜谱图案：自己选的 emoji 优先，其次是自己做的菜照片，最后才是默认图标 */
function recipeEmoji(r) { const c = (db.recipeIcons || {})[r.id]; return c || r.emoji || '🍽️'; }
function recipePhoto(r) { return (db.recipeIcons || {})[r.id] ? '' : (db.photos[r.id] || ''); }
function getPlan(date) {
  if (!db.plan[date]) db.plan[date] = { dishes: [], exercises: [], done: {} };
  const p = db.plan[date];
  p.dishes = p.dishes || [];
  p.exercises = p.exercises || [];
  p.done = p.done || {};
  return p;
}
const readPlan = date => db.plan[date] || { dishes: [], exercises: [], done: {} };
function latestWeight() {
  if (!db.weights.length) return null;
  const sorted = db.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1];
}
function expenseOf(date) {
  return db.expenses.filter(e => e.date === date).reduce((s, e) => s + Number(e.amount || 0), 0);
}
function searchLinks(kw) {
  const k = encodeURIComponent((kw || '家常菜') + ' 做法');
  return {
    bili: 'https://search.bilibili.com/all?keyword=' + k,
    douyin: 'https://www.douyin.com/search/' + k,
    xhs: 'https://www.xiaohongshu.com/search_result?keyword=' + k
  };
}

/* ---------- 照片：压缩后存本地 ---------- */
function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, (maxSide || 760) / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', quality || 0.72));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

/* ---------- 提示与弹窗 ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function openModal(html, ctx) {
  modalCtx = ctx || {};
  $('#modalRoot').innerHTML = '<div class="modal-mask"><div class="modal">' + html + '</div></div>';
}
function closeModal() {
  $('#modalRoot').innerHTML = '';
  modalCtx = {};
}

/* ---------- 单日页 ---------- */
function viewToday() {
  const date = viewDate;
  const plan = readPlan(date);
  const dishes = (plan.dishes || []).map(recipeById).filter(Boolean);
  const exs = (plan.exercises || []).map(exerciseById).filter(Boolean);
  const doneMap = plan.done || {};
  const kcal = dishes.reduce((s, r) => s + num(r.kcal), 0);
  const burn = exs.reduce((s, x) => s + num(x.kcal), 0);
  const dayExp = db.expenses.filter(e => e.date === date);
  const spend = expenseOf(date);
  const w = latestWeight();
  const d = parseYmd(date);
  const isToday = date === todayStr();

  let html = '';
  html += '<div class="page-head"><div class="day-nav">' +
    '<button class="nav-arrow" data-action="day-prev" title="前一天">‹</button>' +
    '<button class="date-chip" data-action="open-calendar" title="点开可以选任意一天"><b>📅 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日</b>' +
    '<span>' + relLabel(date) + ' · 周' + WEEK[d.getDay()] + ' · 点开换一天</span></button>' +
    '<button class="nav-arrow" data-action="day-next" title="后一天">›</button>' +
    '</div><div class="head-btns">' +
    '<button class="btn small ghost" data-action="goto-blind" title="抽一餐">🎲 抽一餐</button>' +
    '<button class="btn small" data-action="add-dish" data-date="' + date + '">＋ 加菜</button></div></div>';

  if (!isToday) {
    html += '<div class="back-today"><button class="link-btn" data-action="back-today">回到今天</button></div>';
  }

  const hour = new Date().getHours();
  const hello = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const summary = (dishes.length || exs.length)
    ? '已排 ' + dishes.length + ' 道菜 · ' + exs.length + ' 项运动'
    : '今天还空着，先排两道菜吧';

  html += '<div class="hero">' + '<img class="hero-art" src="icons/icon-192.png" alt="">' +
    '<div class="hero-top"><div>' +
    '<div class="hero-hello">' + relLabel(date) + ' · ' + hello + '</div>' +
    '<div class="hero-line">' + summary + '</div></div>' +
    '<div class="hero-badge">' + (isToday ? '今天 · 周' + WEEK[d.getDay()] : '周' + WEEK[d.getDay()]) + '</div>' +
    '</div>' +
    '<div class="hero-stats">' +
    '<div class="hs"><b>' + kcal + '</b><span>摄入 kcal</span></div>' +
    '<div class="hs"><b>' + burn + '</b><span>运动消耗</span></div>' +
    '<div class="hs"><b>' + money(spend) + '</b><span>花费 ¥</span></div>' +
    '</div></div>';

  html += '<div class="card weight-strip">' +
    '<div class="ws-left"><span class="ws-ico">⚖️</span><div><div class="ws-title">' +
    (w ? '当前体重 ' + w.kg + ' kg' : '还没记录体重') + '</div>' +
    '<div class="ws-sub">' + (w ? '记录于 ' + fmtDate(w.date) : '记一条，开始看你的曲线') + '</div></div></div>' +
    '<button class="btn ghost small" data-action="add-weight-quick">记录</button>' +
    '</div>';

  html += '<div class="section-head"><h3>这天的菜</h3><span class="muted">' + kcal + ' kcal</span></div>';
  if (dishes.length) {
    html += '<div class="dish-list">';
    dishes.forEach(r => {
      const done = !!doneMap[r.id];
      const img = recipePhoto(r);
      html += '<div class="card dish-card' + (done ? ' is-done' : '') + '">' +
        '<div class="dish-emoji' + (img ? ' has-photo' : '') + '" data-action="open-recipe" data-id="' + r.id + '"' +
        (img ? ' style="background-image:url(' + img + ')"' : '') + '>' + (img ? '' : recipeEmoji(r)) + '</div>' +
        '<div class="dish-main" data-action="open-recipe" data-id="' + r.id + '">' +
        '<div class="dish-name">' + esc(r.name) + '</div>' +
        '<div class="dish-meta">' + num(r.kcal) + ' kcal · 蛋白 ' + esc(r.p) + 'g · ' + num(r.time) + ' 分钟</div>' +
        '</div>' +
        '<div class="dish-ops">' +
        '<button class="chip' + (done ? ' chip-on' : '') + '" data-action="toggle-done" data-date="' + date + '" data-id="' + r.id + '">' + (done ? '已做 ✓' : '标记已做') + '</button>' +
        '<button class="icon-btn tiny" data-action="remove-dish" data-date="' + date + '" data-id="' + r.id + '" title="移除">✕</button>' +
        '</div></div>';
    });
    html += '</div>';
  } else {
    html += emptyBlock('这天还没排菜', '点「加菜」从菜谱库挑两道，或者去「一周」页面把整周安排掉', 'add-dish', '＋ 加菜');
  }

  html += '<div class="section-head"><h3>这天的运动</h3><span class="muted">消耗 ' + burn + ' kcal</span></div>';
  if (exs.length) {
    html += '<div class="dish-list">';
    exs.forEach(x => {
      const done = !!doneMap[x.id];
      html += '<div class="card dish-card' + (done ? ' is-done' : '') + '">' +
        '<div class="dish-emoji">' + (x.emoji || '🏃') + '</div>' +
        '<div class="dish-main"><div class="dish-name">' + esc(x.name) + '</div>' +
        '<div class="dish-meta">' + num(x.dur) + ' 分钟 · 约消耗 ' + num(x.kcal) + ' kcal</div></div>' +
        '<div class="dish-ops">' +
        '<button class="chip' + (done ? ' chip-on' : '') + '" data-action="toggle-done" data-date="' + date + '" data-id="' + x.id + '">' + (done ? '完成 ✓' : '完成') + '</button>' +
        '<button class="icon-btn tiny" data-action="remove-ex" data-date="' + date + '" data-id="' + x.id + '" title="移除">✕</button>' +
        '</div></div>';
    });
    html += '</div>';
  } else {
    html += emptyBlock('这天还没安排运动', '散步 30 分钟也算，先动起来', 'add-ex', '＋ 加运动');
  }

  html += '<div class="section-head"><h3>这天的花费</h3><span class="muted">¥' + money(spend) + '</span></div>';
  if (dayExp.length) {
    html += '<div class="card list-card">';
    dayExp.forEach(e => {
      html += '<div class="row"><span class="row-cat">' + esc(e.cat || '其他') + '</span><span class="row-name">' + esc(e.name) + '</span><span class="row-amt">¥' + money(e.amount) + '</span></div>';
    });
    html += '</div>';
  } else {
    html += '<p class="muted pad">还没记。买菜钱、外卖钱都可以记一笔。</p>';
  }
  html += '<div class="btn-row"><button class="btn ghost" data-action="add-exp" data-date="' + date + '">＋ 记一笔</button></div>';

  return html;
}

function emptyBlock(title, sub, action, label) {
  return '<div class="card empty"><div class="empty-ico">🌽</div><p class="empty-title">' + esc(title) + '</p>' +
    '<p class="muted">' + esc(sub) + '</p>' +
    (action ? '<button class="btn small" data-action="' + action + '">' + esc(label) + '</button>' : '') + '</div>';
}

/* ---------- 日历弹窗（可跳任意一天） ---------- */
function openCalendar() {
  const d = parseYmd(viewDate);
  calYM = d.getFullYear() + '-' + pad(d.getMonth() + 1);
  renderCalendar();
}
function renderCalendar() {
  const parts = calYM.split('-').map(Number);
  const y = parts[0], m = parts[1];
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // 周一开头
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayStr();

  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="cal-cell empty"></span>';
  for (let day = 1; day <= daysInMonth; day++) {
    const key = ymd(new Date(y, m - 1, day));
    const plan = readPlan(key);
    const hasPlan = (plan.dishes || []).length || (plan.exercises || []).length;
    const cls = 'cal-cell' + (key === today ? ' is-today' : '') + (key === viewDate ? ' is-picked' : '') + (hasPlan ? ' has-plan' : '');
    cells += '<button class="' + cls + '" data-action="cal-pick" data-date="' + key + '">' + day +
      (hasPlan ? '<i class="dot"></i>' : '') + '</button>';
  }

  const html = '<div class="modal-head"><h3>选一天</h3><button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<div class="cal-bar">' +
    '<button class="nav-arrow" data-action="cal-prev">‹</button>' +
    '<b>' + y + '年' + m + '月</b>' +
    '<button class="nav-arrow" data-action="cal-next">›</button>' +
    '</div>' +
    '<div class="cal-week">' + ['一', '二', '三', '四', '五', '六', '日'].map(x => '<span>' + x + '</span>').join('') + '</div>' +
    '<div class="cal-grid">' + cells + '</div>' +
    '<div class="cal-tip muted small">有安排的日期下面有小圆点；点日期直接跳过去。</div>' +
    '<div class="modal-foot"><button class="btn ghost" data-action="back-today">回到今天</button></div>';
  openModal(html, { cal: true });
}

