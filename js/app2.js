/* 玉米的App — 第二部分：一周页、菜谱页、安排弹窗、菜谱详情、新建菜谱 */

/* ---------- 一周页 ---------- */
function viewWeek() {
  const monday = parseYmd(activeMondayStr);
  const today = todayStr();
  const end = addDays(monday, 6);
  let html = '<div class="page-head"><div><h2>一周清单</h2><p class="muted">' +
    (monday.getMonth() + 1) + '月' + monday.getDate() + '日 — ' +
    (end.getMonth() + 1) + '月' + end.getDate() + '日</p></div>' +
    '<div class="head-btns"><button class="btn small ghost" data-action="open-calendar">选日期</button>' +
    '<button class="btn small" data-action="open-picker" data-date="' + activeMondayStr + '">＋ 安排</button></div></div>';

  html += '<div class="seg">' +
    '<button class="seg-btn" data-action="week-prev">‹ 上一周</button>' +
    '<button class="seg-btn" data-action="week-now">本周</button>' +
    '<button class="seg-btn" data-action="week-next">下一周 ›</button>' +
    '</div>';

  let weekKcal = 0, weekBurn = 0, weekSpend = 0;

  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const key = ymd(d);
    const plan = readPlan(key);
    const dishes = (plan.dishes || []).map(recipeById).filter(Boolean);
    const exs = (plan.exercises || []).map(exerciseById).filter(Boolean);
    const kcal = dishes.reduce((s, r) => s + num(r.kcal), 0);
    const burn = exs.reduce((s, x) => s + num(x.kcal), 0);
    const spend = expenseOf(key);
    weekKcal += kcal; weekBurn += burn; weekSpend += spend;

    html += '<div class="card week-day' + (key === today ? ' today' : '') + (key === viewDate ? ' picked' : '') + '">' +
      '<div class="wd-date" data-action="open-calendar"><b>' + d.getDate() + '</b><span>周' + WEEK[d.getDay()] + (key === today ? ' · 今天' : '') + '</span></div>' +
      '<div class="wd-body">';
    if (dishes.length) {
      html += '<div class="chips">' + dishes.map(r => {
        const img = recipePhoto(r);
        return '<button class="chip chip-dish" data-action="open-recipe" data-id="' + r.id + '">' +
          (img ? '<img class="chip-photo" src="' + img + '" alt="">' : recipeEmoji(r)) + ' ' + esc(r.name) + '</button>';
      }).join('') + '</div>';
    }
    if (exs.length) {
      html += '<div class="chips">' + exs.map(x =>
        '<button class="chip chip-ex" data-action="open-picker" data-date="' + key + '">' + (x.emoji || '🏃') + ' ' + esc(x.name) + ' ' + num(x.kcal) + 'kcal</button>'
      ).join('') + '</div>';
    }
    if (!dishes.length && !exs.length) {
      html += '<p class="muted small">还没安排</p>';
    }
    html += '</div>' +
      '<div class="wd-right"><span class="wd-kcal">' + (kcal ? '🔥' + kcal : '') + (spend ? ' 💰' + money(spend) : '') + '</span>' +
      '<button class="btn small ghost" data-action="open-picker" data-date="' + key + '">安排</button></div>' +
      '</div>';
  }

  html += '<div class="card week-sum"><div><span class="muted">本周合计</span></div>' +
    '<div class="ws-items"><span>🔥 摄入 ' + weekKcal + '</span><span>💪 消耗 ' + weekBurn + '</span><span>💰 花费 ¥' + money(weekSpend) + '</span></div></div>';

  html += '<div class="btn-row"><button class="btn" data-action="goto-shopping">→ 生成这周的买菜清单</button></div>';
  return html;
}

/* ---------- 菜谱页 ---------- */
const FILTERS = [
  { k: 'all', label: '全部' },
  { k: '快手', label: '快手' },
  { k: '减脂', label: '减脂' },
  { k: 'hotpot', label: '米线火锅' },
  { k: '早餐', label: '早餐' },
  { k: '汤', label: '汤羹' },
  { k: '下饭', label: '下饭' },
  { k: 'custom', label: '我加的' }
];

function viewRecipes() {
  let html = '<div class="page-head"><div><h2>菜谱库</h2><p class="muted">' + allRecipes().length + ' 道，可上传自己做的成品照</p></div>' +
    '<button class="btn small" data-action="new-recipe">＋ 新增</button></div>';
  html += '<div class="voice-row"><input id="recipeSearch" class="search" placeholder="搜菜名或食材，比如 番茄 / 鸡胸" value="' + esc(recipeQuery) + '" autocomplete="off">' +
    '<button class="mic-btn" data-action="voice" data-target="recipeSearch" title="用语音搜">🎤</button></div>';
  html += '<div class="chips filter-row">' + FILTERS.map(f =>
    '<button class="chip' + (recipeFilter === f.k ? ' chip-on' : '') + '" data-action="filter" data-k="' + f.k + '">' + f.label + '</button>'
  ).join('') + '</div>';

  html += '<div id="recipeGrid" class="recipe-grid">' + recipeGridHTML() + '</div>';
  return html;
}

function filteredRecipes() {
  const q = recipeQuery.trim();
  let list = allRecipes();
  if (recipeFilter === 'custom') list = list.filter(r => db.customRecipes.some(c => c.id === r.id));
  else if (recipeFilter === 'hotpot') list = list.filter(r => HOT_IDS.indexOf(r.id) >= 0);
  else if (recipeFilter !== 'all') list = list.filter(r => (r.tags || []).indexOf(recipeFilter) >= 0);
  if (q) list = list.filter(r => (r.name + ' ' + (r.ing || []).map(i => i.n).join(' ')).indexOf(q) >= 0);
  return list;
}

function recipeGridHTML() {
  const list = filteredRecipes();
  const q = recipeQuery.trim();
  if (!list.length) {
    return cardsEmptyHTML(q ? '没找到「' + q + '」' : '这个分类还没有菜', '换个关键词，或者自己新增一道');
  }
  return cardsHTML(list);
}

function cardsHTML(list) {
  return list.map(r => {
    const img = recipePhoto(r);
    return '<div class="card recipe-card" data-action="open-recipe" data-id="' + r.id + '">' +
      '<div class="rc-cover' + (img ? ' has-photo' : '') + '"' + (img ? ' style="background-image:url(' + img + ')"' : '') + '>' + (img ? '' : recipeEmoji(r)) + '</div>' +
      '<div class="rc-name">' + esc(r.name) + '</div>' +
      '<div class="rc-meta">' + num(r.kcal) + ' kcal · ' + num(r.time) + ' 分钟</div>' +
      '<div class="rc-tags">' + (r.tags || []).slice(0, 2).map(t => '<span class="tag">' + esc(t) + '</span>').join('') +
      (img ? '<span class="tag tag-photo">我的成品照</span>' : '') + '</div>' +
      '</div>';
  }).join('');
}

function cardsEmptyHTML(title, sub) {
  return '<div class="no-result"><span class="nr-emoji">🍽️</span><p>' + esc(title) + '</p>' +
    '<p class="muted small">' + esc(sub) + '</p>' +
    '<button class="btn small" data-action="new-recipe">＋ 新增菜谱</button></div>';
}

function updateRecipeGrid() {
  const g = $('#recipeGrid');
  if (g) g.innerHTML = recipeGridHTML();
}

/* ---------- 分类找菜 ---------- */
const HOME_CATS = [
  { k: 'light', label: '减脂餐', icon: '🥗' },
  { k: 'meat', label: '荤菜', icon: '🥩' },
  { k: 'veg', label: '素菜', icon: '🥬' },
  { k: 'staple', label: '主食一餐', icon: '🍚' },
  { k: 'soup', label: '汤羹', icon: '🍲' },
  { k: 'hotpot', label: '米线火锅', icon: '🍜' },
  { k: 'breakfast', label: '早餐', icon: '🥣' },
  { k: 'quick', label: '快手菜', icon: '⚡' },
  { k: 'custom', label: '我加的', icon: '✍️' }
];

const ING_GROUPS = [
  { k: '土豆', label: '土豆', test: /土豆/ },
  { k: '番茄', label: '番茄', test: /番茄/ },
  { k: '鸡蛋', label: '鸡蛋', test: /鸡蛋/ },
  { k: '鸡肉', label: '鸡肉', test: /鸡/ },
  { k: '牛肉', label: '牛肉', test: /牛/ },
  { k: '猪肉', label: '猪肉', test: /猪|五花|排骨/ },
  { k: '虾', label: '虾', test: /虾/ },
  { k: '鱼', label: '鱼', test: /鱼/ },
  { k: '豆腐', label: '豆制品', test: /豆腐|豆皮/ },
  { k: '叶菜', label: '叶菜', test: /白菜|包菜|生菜|青菜|西兰花/ },
  { k: '粉面', label: '米线粉面', test: /米线|粉|面/ },
  { k: '菌菇', label: '菌菇', test: /香菇|蘑菇/ },
  { k: '南瓜', label: '南瓜', test: /南瓜/ }
];

let classCat = '';
let classIng = '';

function allCats() {
  const base = HOME_CATS.concat(db.cats || []);
  return base
    .filter(c => (db.catHidden || []).indexOf(c.k) < 0)
    .map(c => Object.assign({}, c, db.catOverride[c.k] || {}));
}
function isBuiltinCat(k) { return HOME_CATS.some(c => c.k === k); }

/* 内置分类的默认规则 */
function catBase(r, k) {
  const tags = r.tags || [];
  const type = recipeType(r);
  switch (k) {
    case 'light': return tags.indexOf('减脂') >= 0;
    case 'meat': return type === 'protein';
    case 'veg': return type === 'veg';
    case 'staple': return type === 'staple' || type === 'rice';
    case 'soup': return type === 'soup';
    case 'hotpot': return HOT_IDS.indexOf(r.id) >= 0;
    case 'breakfast': return tags.indexOf('早餐') >= 0;
    case 'quick': return tags.indexOf('快手') >= 0;
    case 'custom': return db.customRecipes.some(c => c.id === r.id);
    default: return false;
  }
}

/* 用户在分类里手动加/减的菜，优先于默认规则 */
function catMatch(r, k) {
  const adj = db.catAdj[k] || { add: [], remove: [] };
  if ((adj.remove || []).indexOf(r.id) >= 0) return false;
  if ((adj.add || []).indexOf(r.id) >= 0) return true;
  return catBase(r, k);
}

function ingMatch(r, k) {
  const g = ING_GROUPS.filter(x => x.k === k)[0];
  if (!g) return true;
  return (r.ing || []).some(i => g.test.test(i.n));
}

function classifyList() {
  let list = allRecipes();
  if (classCat) list = list.filter(r => catMatch(r, classCat));
  if (classIng) list = list.filter(r => ingMatch(r, classIng));
  return list;
}

function viewClassify() {
  const catObj = classCat ? allCats().filter(c => c.k === classCat)[0] : null;
  const ingLabel = classIng ? (ING_GROUPS.filter(g => g.k === classIng)[0] || {}).label : '';
  let html = '<div class="page-head"><div><h2>分类找菜</h2><p class="muted">类型和食材都能筛，分类里的菜可以自己调</p></div></div>';

  html += '<div class="section-head"><h3>按类型</h3><span class="sec-hint">点卡片右上角 ✎ 可以改名、加菜、减菜</span></div>';
  html += '<div class="cat-grid">';
  allCats().forEach(c => {
    const n = allRecipes().filter(r => catMatch(r, c.k)).length;
    html += '<div class="cat-tile' + (classCat === c.k ? ' on' : '') + '" data-action="class-cat" data-k="' + c.k + '">' +
      '<span class="ct-edit" data-action="class-edit" data-k="' + c.k + '" title="编辑这个分类">✎</span>' +
      '<span class="ct-ico">' + (c.icon || '📌') + '</span><span class="ct-name">' + esc(c.label) + '</span>' +
      '<span class="ct-count">' + n + ' 道</span></div>';
  });
  html += '<div class="cat-tile cat-new" data-action="class-new">' +
    '<span class="ct-ico">＋</span><span class="ct-name">新建分类</span><span class="ct-count">比如「汤面」</span></div>';
  html += '</div>';

  html += '<div class="section-head"><h3>按食材</h3><span class="muted">比如土豆的各种做法</span></div>';
  html += '<div class="chips ing-row">';
  ING_GROUPS.forEach(g => {
    const n = allRecipes().filter(r => ingMatch(r, g.k)).length;
    if (!n) return;
    html += '<button class="chip ing-chip' + (classIng === g.k ? ' chip-on' : '') + '" data-action="class-ing" data-k="' + g.k + '">' +
      esc(g.label) + ' <em>' + n + '</em></button>';
  });
  html += '</div>';

  const list = classifyList();
  const title = catObj ? catObj.label : (ingLabel ? '含' + ingLabel : '全部菜谱');
  html += '<div class="result-head"><h3>' + esc(title) +
    '<span class="muted small">' + list.length + ' 道</span></h3>' +
    ((classCat || classIng) ? '<button class="link-btn" data-action="class-clear">清除筛选</button>' : '') + '</div>';
  html += '<div class="recipe-grid">' + (list.length ? cardsHTML(list) : cardsEmptyHTML('这个组合没有菜', '换个类型或食材试试，也可以自己新增一道')) + '</div>';
  if ((db.catHidden || []).length) {
    html += '<div class="btn-row"><button class="btn ghost small" data-action="class-restore">恢复被隐藏的分类（' + db.catHidden.length + '）</button></div>';
  }
  return html;
}

/* ---------- 分类编辑弹窗 ---------- */
function openCatEditor(k) {
  const cat = allCats().filter(c => c.k === k)[0];
  if (!cat) return;
  const builtin = isBuiltinCat(k);
  const all = allRecipes();
  const html = '<div class="modal-head"><h3>编辑「' + esc(cat.label) + '」</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<div class="form-row two"><div><label>分类名字</label><input id="catEditName" value="' + esc(cat.label) + '"></div>' +
    '<div><label>图标</label><input id="catEditIcon" value="' + esc(cat.icon || '📌') + '" maxlength="2"></div></div>' +
    '<p class="muted small" style="margin:10px 2px 8px">勾上就是把这道菜放进这个分类，取消就是移出去。' + (builtin ? '内置分类也能这样调。' : '') + '</p>' +
    '<div class="pick-list cat-pick">' +
    all.map(r => '<label class="pick-row"><input type="checkbox" data-cat="' + k + '" value="' + r.id + '"' + (catMatch(r, k) ? ' checked' : '') + '>' +
      '<span class="pk-emoji">' + r.emoji + '</span><span class="pk-name">' + esc(r.name) + '</span>' +
      '<span class="pk-meta">' + num(r.kcal) + ' kcal</span></label>').join('') +
    '</div>' +
    '<div class="modal-foot">' +
    (builtin
      ? '<button class="btn ghost danger" data-action="class-hide" data-k="' + k + '">隐藏分类</button>'
      : '<button class="btn ghost danger" data-action="class-del" data-k="' + k + '">删除分类</button>') +
    '<button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="class-save" data-k="' + k + '">保存</button></div>';
  openModal(html, { cat: k });
}

function openNewCat() {
  const html = '<div class="modal-head"><h3>新建一个分类</h3><button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<div class="form">' +
    '<div class="form-row two"><div><label>分类名字</label><input id="catName" placeholder="比如 汤面 / 一人食 / 下酒菜"></div>' +
    '<div><label>图标（一个 emoji）</label><input id="catIcon" value="📌" maxlength="2"></div></div>' +
    '</div>' +
    '<p class="muted small" style="margin-top:10px">建好之后，在分类里点 ✎ 就能往里面加菜。</p>' +
    '<div class="modal-foot"><button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="class-create">创建</button></div>';
  openModal(html, {});
}

/* ---------- 午餐盲盒 ---------- */
const BLIND_MODES = [
  { k: 'balanced', label: '均衡一顿', icon: '🍱', desc: '米饭 + 一荤 + 一素' },
  { k: 'hot', label: '米线火锅', icon: '🍜', desc: '一锅吃饱，最省心' },
  { k: 'light', label: '轻食减脂', icon: '🥗', desc: '少油高蛋白，配个汤' }
];

let blindMode = 'balanced';
let blindResult = [];
let blindRolling = false;
let blindQuery = '';
let blindCount = 3;

function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function blindHay(r) {
  return r.name + ' ' + (r.tags || []).join(' ') + ' ' + (r.ing || []).map(i => i.n).join(' ') + ' ' + (r.kw || '');
}

/* 按用户写的需求（可写几样）来配一餐 */
function composeWithQuery(query, count) {
  const limit = Math.max(1, Math.min(5, count || 3));
  const kws = String(query || '').split(/[\s,，、+]+/).filter(Boolean);
  if (!kws.length) {
    return { list: composeBlind(blindMode).slice(0, limit), fallback: false };
  }
  const all = allRecipes();
  const hit = kw => all.filter(r => blindHay(r).indexOf(kw) >= 0);
  const union = all.filter(r => kws.some(kw => blindHay(r).indexOf(kw) >= 0));
  if (!union.length) {
    return { list: composeBlind(blindMode).slice(0, limit), fallback: true };
  }
  const out = [];
  kws.forEach(kw => {
    const pool = hit(kw).filter(r => !out.some(o => o.id === r.id));
    if (pool.length) out.push(pickFrom(pool));
  });
  const rest = union.filter(r => !out.some(o => o.id === r.id));
  while (out.length < limit && rest.length) {
    const idx = Math.floor(Math.random() * rest.length);
    out.push(rest.splice(idx, 1)[0]);
  }
  return { list: out, fallback: false };
}

function drawBlind() {
  if (blindRolling) return;
  blindRolling = true;
  const names = allRecipes().map(r => r.emoji + ' ' + r.name);
  const timer = setInterval(function () {
    const el = $('#blindSlot');
    if (!el) { clearInterval(timer); blindRolling = false; return; }
    el.textContent = names[Math.floor(Math.random() * names.length)];
    el.classList.add('rolling');
  }, 60);
  const btn = $('#blindBtn');
  if (btn) btn.textContent = '摇一摇…';
  setTimeout(function () {
    clearInterval(timer);
    const r = composeWithQuery(blindQuery, blindCount);
    blindResult = r.list;
    blindRolling = false;
    render();
    if (r.fallback) toast('没找到「' + blindQuery + '」，先按均衡给你配了一餐');
    else toast('抽好了，看看合不合胃口');
  }, 1200);
}

function composeBlind(mode) {
  const all = allRecipes().filter(r => r.id !== 'r36');
  const byType = t => all.filter(r => recipeType(r) === t);
  const proteins = byType('protein');
  const vegs = byType('veg');
  const soups = byType('soup');
  const hots = all.filter(r => HOT_IDS.indexOf(r.id) >= 0);
  const lightAll = all.filter(r => catMatch(r, 'light'));
  const rice = recipeById('r36');

  for (let attempt = 0; attempt < 4; attempt++) {
    let out = [];
    if (mode === 'hot') {
      out.push(pickFrom(hots.length ? hots : byType('staple')));
      if (Math.random() < 0.35 && vegs.length) out.push(pickFrom(vegs));
    } else if (mode === 'light') {
      const lp = lightAll.filter(r => recipeType(r) === 'protein');
      const lv = lightAll.filter(r => recipeType(r) === 'veg');
      const ls = lightAll.filter(r => recipeType(r) === 'soup');
      if (lp.length) out.push(pickFrom(lp));
      if (lv.length) out.push(pickFrom(lv));
      if (Math.random() < 0.5 && ls.length) out.push(pickFrom(ls));
      if (!out.length && lightAll.length) out.push(pickFrom(lightAll));
    } else {
      if (rice) out.push(rice);
      if (proteins.length) out.push(pickFrom(proteins));
      if (vegs.length) out.push(pickFrom(vegs));
      if (Math.random() < 0.5 && soups.length) out.push(pickFrom(soups));
    }
    const seen = {};
    out = out.filter(r => r && !seen[r.id] && (seen[r.id] = true));
    if (!out.length) continue;
    const sameAsLast = blindResult.length && out.length === blindResult.length &&
      out.every((r, i) => r.id === blindResult[i].id);
    if (!sameAsLast) return out;
  }
  return blindResult.slice();
}

function blindTotals(list) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, price: 0 };
  list.forEach(r => {
    t.kcal += num(r.kcal);
    t.p += num(r.p);
    t.c += num(r.c);
    t.f += num(r.f);
    t.price += (r.ing || []).reduce((s, i) => s + Number(i.p || 0), 0);
  });
  t.price = Math.round(t.price * 10) / 10;
  return t;
}

function viewBlind() {
  const d = new Date();
  const dateOpts = [0, 1, 2].map(off => {
    const x = addDays(d, off);
    const key = ymd(x);
    const label = off === 0 ? '今天' : (off === 1 ? '明天' : '后天');
    return '<option value="' + key + '">' + label + '</option>';
  }).join('');

  let html = '<div class="page-head"><div><h2>午餐盲盒</h2><p class="muted">不知道吃什么，就让它替你决定</p></div></div>';

  html += '<div class="card blind-wish">' +
    '<label class="bw-label">今天想吃什么？可以写几样</label>' +
    '<div class="voice-row"><input id="blindQuery" class="search bw-input" placeholder="比如：火锅 / 牛肉 青菜 / 番茄 鸡蛋" autocomplete="off" value="' + esc(blindQuery) + '">' +
    '<button class="mic-btn" data-action="voice" data-target="blindQuery" title="用语音说想吃什么">🎤</button></div>' +
    '<div class="chips bw-kw">' + ['火锅', '米线', '牛肉', '鸡肉', '虾', '青菜', '番茄', '土豆', '鸡蛋', '减脂'].map(k =>
      '<button class="chip" data-action="blind-kw" data-k="' + k + '">＋' + k + '</button>').join('') + '</div>' +
    '<div class="bw-count"><span class="muted small">想要几道</span>' +
    '<span class="stepper"><button data-action="blind-count-dec">−</button><b>' + blindCount + '</b><button data-action="blind-count-inc">＋</button></span>' +
    '</div></div>';

  html += '<div class="chips filter-row">' + BLIND_MODES.map(m =>
    '<button class="chip' + (blindMode === m.k ? ' chip-on' : '') + '" data-action="blind-mode" data-k="' + m.k + '">' + m.icon + ' ' + m.label + '</button>'
  ).join('') + '</div>';

  const shelfEmoji = ['🥩', '🥬', '🍚', '🍜', '🥚'];
  let shelfHTML = '<div class="blind-shelf">';
  for (let i = 0; i < blindCount; i++) {
    const rr = blindResult[i];
    const rimg = rr ? recipePhoto(rr) : '';
    shelfHTML += '<div class="bslot" style="--d:' + (i * 0.3) + 's">' +
      (rr ? (rimg ? '<img class="bslot-photo" src="' + rimg + '" alt="">' : recipeEmoji(rr)) : shelfEmoji[i % shelfEmoji.length]) + '</div>';
  }
  shelfHTML += '</div>';

  html += '<div class="card blind-stage">' +
    '<div class="blind-ribbon">' + (blindQuery ? '按你写的「' + esc(blindQuery) + '」来抽' : (BLIND_MODES.filter(m => m.k === blindMode)[0] || {}).desc) + '</div>' +
    shelfHTML +
    '<div class="blind-slot" id="blindSlot">' + (blindResult.length ? '开饭啦！' : '今天中午吃什么？') + '</div>' +
    '<div class="blind-sub muted small">' + (blindQuery ? '会优先找符合你要求的菜，不够再用相近的补齐' : '按一下，随机配一份营养均衡的午饭') + '</div>' +
    '<button class="btn blind-btn" id="blindBtn" data-action="blind-draw">' + (blindResult.length ? '再抽一次' : '🎲 抽一餐') + '</button>' +
    '</div>';

  if (blindResult.length) {
    const t = blindTotals(blindResult);
    html += '<div class="card blind-result">' +
      '<div class="br-head"><span class="br-title">抽到了这些</span><span class="br-kcal">' + t.kcal + ' kcal</span></div>';
    blindResult.forEach(r => {
      const img = recipePhoto(r);
      html += '<div class="br-row" data-action="open-recipe" data-id="' + r.id + '">' +
        '<div class="br-emoji' + (img ? ' has-photo' : '') + '"' + (img ? ' style="background-image:url(' + img + ')"' : '') + '>' + (img ? '' : recipeEmoji(r)) + '</div>' +
        '<div class="br-main"><div class="br-name">' + esc(r.name) + '</div>' +
        '<div class="br-meta">' + num(r.time) + ' 分钟 · 蛋白 ' + esc(r.p) + 'g</div></div>' +
        '<div class="br-kcal">' + num(r.kcal) + '</div></div>';
    });
    html += '<div class="br-nutri">' +
      '<div><b>' + t.p + 'g</b><span>蛋白</span></div>' +
      '<div><b>' + t.c + 'g</b><span>碳水</span></div>' +
      '<div><b>' + t.f + 'g</b><span>脂肪</span></div>' +
      '<div><b>¥' + money(t.price) + '</b><span>估算成本</span></div>' +
      '</div>';
    html += '<div class="br-foot">' +
      '<select id="blindDate" class="date-select">' + dateOpts + '</select>' +
      '<button class="btn" data-action="blind-add">加入这天</button>' +
      '</div>';
    html += '<p class="muted small br-tip">点任意一道菜可以看完整做法；抽到不想要的菜可以「再抽一次」。</p>';
    html += '</div>';
  }
  return html;
}

/* ---------- 安排弹窗（选菜 + 选运动） ---------- */
function openPicker(date, extraIds) {
  const plan = readPlan(date);
  const dishSet = {};
  (plan.dishes || []).forEach(id => { dishSet[id] = true; });
  const exSet = {};
  (plan.exercises || []).forEach(id => { exSet[id] = true; });
  (extraIds || []).forEach(id => { exSet[id] = true; });

  let html = '<div class="modal-head"><h3>安排 ' + fmtDate(date) + '</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>';

  html += '<div class="pick-section"><h4>这天的菜</h4><div class="pick-list">';
  allRecipes().forEach(r => {
    const img = recipePhoto(r);
    html += '<label class="pick-row"><input type="checkbox" data-kind="dish" value="' + r.id + '"' + (dishSet[r.id] ? ' checked' : '') + '>' +
      '<span class="pk-emoji' + (img ? ' has-photo' : '') + '"' + (img ? ' style="background-image:url(' + img + ')"' : '') + '>' + (img ? '' : recipeEmoji(r)) + '</span>' +
      '<span class="pk-name">' + esc(r.name) + '</span>' +
      '<span class="pk-meta">' + num(r.kcal) + ' kcal</span></label>';
  });
  html += '</div></div>';

  html += '<div class="pick-section"><h4>这天的运动</h4><div class="pick-list">';
  allExercises().forEach(x => {
    html += '<label class="pick-row"><input type="checkbox" data-kind="ex" value="' + x.id + '"' + (exSet[x.id] ? ' checked' : '') + '>' +
      '<span class="pk-emoji">' + (x.emoji || '🏃') + '</span><span class="pk-name">' + esc(x.name) + '</span>' +
      '<span class="pk-meta">' + num(x.dur) + ' 分钟 / ' + num(x.kcal) + ' kcal</span></label>';
  });
  html += '</div>';
  html += '<div class="pick-add">' +
    '<input id="exName" placeholder="自定义运动"><input id="exMin" type="number" placeholder="分钟">' +
    '<input id="exKcal" type="number" placeholder="千卡"><button class="btn small" data-action="add-custom-ex">加</button>' +
    '</div></div>';

  html += '<div class="modal-foot"><button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="picker-save">保存安排</button></div>';

  openModal(html, { date: date });
}

/* ---------- 菜谱详情 ---------- */
const RECIPE_ART_EMOJIS = ['🍳', '🥘', '🍲', '🍜', '🥗', '🍚', '🍛', '🥟', '🍞', '🥩', '🐟', '🥬', '🍅', '🥚', '🌽', '🍄', '🥔', '🍆'];

function openRecipeArt(id) {
  const r = recipeById(id);
  if (!r) return;
  const cur = (db.recipeIcons || {})[id] || '';
  let html = '<div class="modal-head"><h3>给「' + esc(r.name) + '」换个图案</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<p class="muted small">图案会出现在菜谱卡、今天页、一周和盲盒里。想用自己做的菜当图案，就在详情里「上传成品照片」。</p>' +
    '<div class="art-grid">' + RECIPE_ART_EMOJIS.map(function (e) {
      return '<button class="art-tile' + (cur === e ? ' on' : '') + '" data-action="recipe-art-set" data-id="' + id + '" data-e="' + e + '">' + e + '</button>';
    }).join('') + '</div>' +
    '<div class="modal-foot"><button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn ghost" data-action="recipe-art-reset" data-id="' + id + '">用默认图案</button></div>';
  openModal(html);
}

function openRecipe(id) {
  const r = recipeById(id);
  if (!r) return;
  const photo = photoOf(id);
  const img = recipePhoto(r);
  const customIcon = (db.recipeIcons || {})[id] || '';
  const custom = db.links[id] || '';
  const links = searchLinks(r.kw || r.name);
  const ingTotal = (r.ing || []).reduce((s, i) => s + Number(i.p || 0), 0);
  const d = new Date();
  const dateOpts = [-1, 0, 1, 2, 3, 4, 5, 6].map(off => {
    const x = addDays(d, off);
    const key = ymd(x);
    const label = off === 0 ? '今天' : (off === 1 ? '明天' : (off === -1 ? '昨天' : (x.getMonth() + 1) + '月' + x.getDate() + '日 周' + WEEK[x.getDay()]));
    return '<option value="' + key + '"' + (off === 0 ? ' selected' : '') + '>' + label + '</option>';
  }).join('');

  let html = '<div class="modal-head"><h3>' + (img ? '' : recipeEmoji(r) + ' ') + esc(r.name) + '</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>';

  /* 成品照 */
  html += '<div class="photo-box">' +
    (photo ? '<div class="recipe-photo" style="background-image:url(' + photo + ')"></div>'
      : '<div class="photo-empty"><span class="pe-emoji">' + recipeEmoji(r) + '</span><span class="muted small">还没有成品照片，拍一张自己做的传上来</span></div>') +
    '<div class="photo-ops">' +
    '<label class="btn small ghost" for="photoInput">' + (photo ? '换一张照片' : '上传成品照片') + '</label>' +
    '<input id="photoInput" class="file-hidden" type="file" accept="image/*">' +
    (photo ? '<button class="btn small ghost danger" data-action="del-photo" data-id="' + id + '">删除照片</button>' : '') +
    '</div></div>';

  html += '<div class="rc-art-bar">' +
    '<span class="muted small">菜谱图案：' + (customIcon ? customIcon + ' 自定义' : (photo ? '用你做的菜照片' : '默认 ' + recipeEmoji(r))) + '</span>' +
    '<button class="chip" data-action="recipe-art-pick" data-id="' + id + '">换个图案</button>' +
    (customIcon ? '<button class="chip" data-action="recipe-art-reset" data-id="' + id + '">恢复默认</button>' : '') +
    '</div>';

  html += '<div class="detail-tags">' + (r.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') +
    '<span class="tag tag-time">' + num(r.time) + ' 分钟</span></div>';

  html += '<div class="nutri-grid">' +
    '<div><b>' + num(r.kcal) + '</b><span>千卡</span></div>' +
    '<div><b>' + esc(r.p) + 'g</b><span>蛋白</span></div>' +
    '<div><b>' + esc(r.c) + 'g</b><span>碳水</span></div>' +
    '<div><b>' + esc(r.f) + 'g</b><span>脂肪</span></div>' +
    '</div>';

  html += '<h4>食材 · 估算 ' + money(ingTotal) + ' 元</h4><table class="ing-table"><tbody>';
  (r.ing || []).forEach(i => {
    html += '<tr><td>' + esc(i.n) + '</td><td class="ing-q">' + esc(i.q) + '</td><td class="ing-p">¥' + money(i.p) + '</td></tr>';
  });
  html += '</tbody></table>';

  html += '<h4>做法</h4><ol class="steps">' + (r.steps || []).map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>';

  html += '<h4>看视频学做法</h4><div class="link-row">' +
    '<a class="btn small ghost" target="_blank" rel="noopener" href="' + esc(links.bili) + '">B站</a>' +
    '<a class="btn small ghost" target="_blank" rel="noopener" href="' + esc(links.douyin) + '">抖音</a>' +
    '<a class="btn small ghost" target="_blank" rel="noopener" href="' + esc(links.xhs) + '">小红书</a>' +
    '</div>';

  html += '<div class="link-custom"><input id="linkInput" placeholder="也可以粘贴你收藏的链接" value="' + esc(custom) + '">' +
    '<button class="btn small" data-action="save-link" data-id="' + id + '">保存</button></div>';
  if (custom) {
    html += '<div class="link-row"><a class="btn small ghost" target="_blank" rel="noopener" href="' + esc(custom) + '">打开我保存的链接 →</a></div>';
  }

  html += '<div class="modal-foot">' +
    '<select id="addDate" class="date-select">' + dateOpts + '</select>' +
    '<button class="btn" data-action="detail-add" data-id="' + id + '">加入这天</button></div>';

  html += '<div class="modal-foot"><button class="btn ghost" data-action="edit-recipe" data-id="' + id + '">✎ 编辑这道菜（食材 · 热量 · 做法）</button></div>';

  if (db.customRecipes.some(c => c.id === id)) {
    html += '<div class="modal-foot"><button class="btn ghost danger" data-action="delete-recipe" data-id="' + id + '">删除这道自定义菜</button></div>';
  }

  openModal(html, { id: id });
}

/* ---------- 菜谱表单：图标点选食材 + 自动算营养 ---------- */
const ING_CATS = ['all', '蔬菜', '肉禽', '水产', '蛋奶', '豆制品', '主食', '调料', '其他'];

let formIngs = [];
let formIngCat = 'all';
let formIngQuery = '';

function buildFormIng(ing) {
  const di = findIng(ing.n);
  return {
    name: ing.n,
    emoji: di ? di.e : '🍽️',
    unit: di ? di.u : '',
    mult: 1,
    kcal: di ? di.kcal : 0,
    p: di ? di.p : 0,
    c: di ? di.c : 0,
    f: di ? di.f : 0,
    price: Number(ing.p) || (di ? di.price : 0),
    cat: ing.cat || (di ? di.cat : '其他'),
    qText: ing.q || (di ? di.u : '适量'),
    known: !!di
  };
}

function ingTotal() {
  const t = { kcal: 0, p: 0, c: 0, f: 0, price: 0 };
  formIngs.forEach(x => {
    t.kcal += x.kcal * x.mult;
    t.p += x.p * x.mult;
    t.c += x.c * x.mult;
    t.f += x.f * x.mult;
    t.price += x.price * x.mult;
  });
  t.kcal = Math.round(t.kcal); t.p = Math.round(t.p); t.c = Math.round(t.c); t.f = Math.round(t.f);
  t.price = Math.round(t.price * 10) / 10;
  return t;
}

function ingGridHTML() {
  const q = formIngQuery.trim();
  let list = ING_DB.slice();
  if (formIngCat !== 'all') list = list.filter(x => x.cat === formIngCat);
  if (q) list = list.filter(x => x.n.indexOf(q) >= 0);
  if (!list.length) return '<p class="muted small pad">没找到这个食材，可以在下面手动加一个</p>';
  return list.map(x =>
    '<button class="ing-tile" data-action="ing-add" data-k="' + esc(x.n) + '">' +
    '<span class="it-ico">' + x.e + '</span><span class="it-n">' + esc(x.n) + '</span>' +
    '<span class="it-k">' + x.kcal + ' kcal</span></button>'
  ).join('');
}

function ingSelectedHTML() {
  if (!formIngs.length) return '<p class="muted small pad">还没选食材，点上面的图标就加进来了</p>';
  return formIngs.map((x, i) => {
    const qText = x.known ? (x.mult > 1 ? x.mult + ' ' + x.unit : (x.unit || '适量')) : (x.qText || '适量');
    return '<div class="sel-row">' +
      '<span class="sel-emoji">' + x.emoji + '</span>' +
      '<span class="sel-name">' + esc(x.name) + (x.known ? '' : ' <em class="muted">未识别</em>') + '</span>' +
      '<span class="sel-q">' + esc(qText) + '</span>' +
      '<span class="sel-k">' + Math.round(x.kcal * x.mult) + ' kcal</span>' +
      '<span class="stepper">' +
      '<button data-action="ing-dec" data-idx="' + i + '">−</button>' +
      '<button data-action="ing-inc" data-idx="' + i + '">＋</button>' +
      '<button class="sel-x" data-action="ing-del" data-idx="' + i + '">✕</button></span></div>';
  }).join('');
}

function autoSumText() {
  const t = ingTotal();
  return '已选 ' + formIngs.length + ' 样 · 食材成本约 ¥' + money(t.price) + ' · 营养按食材库自动估算，可手动改';
}

function nutriFieldsHTML(v) {
  return '<div class="form-row four">' +
    '<div><label>千卡</label><input id="rcKcal" type="number" value="' + num(v.kcal) + '"></div>' +
    '<div><label>蛋白g</label><input id="rcP" type="number" value="' + num(v.p) + '"></div>' +
    '<div><label>碳水g</label><input id="rcC" type="number" value="' + num(v.c) + '"></div>' +
    '<div><label>脂肪g</label><input id="rcF" type="number" value="' + num(v.f) + '"></div></div>';
}

function updateIngUI() {
  const grid = $('#ingGrid'); if (grid) grid.innerHTML = ingGridHTML();
  const sel = $('#ingSelected'); if (sel) sel.innerHTML = ingSelectedHTML();
  const t = ingTotal();
  const setV = (id, val) => { const el = $('#' + id); if (el) el.value = val; };
  setV('rcKcal', t.kcal); setV('rcP', t.p); setV('rcC', t.c); setV('rcF', t.f);
  const sum = $('#autoSum'); if (sum) sum.textContent = autoSumText();
}

function openRecipeForm(mode, id) {
  const r = mode === 'edit' ? recipeById(id) : null;
  if (mode === 'edit' && !r) return;
  formIngs = ((r && r.ing) || []).map(buildFormIng);
  formIngCat = 'all';
  formIngQuery = '';
  pendingPhoto = null;
  const v = r || {};
  const t = ingTotal();
  const kcalVal = r ? num(r.kcal) : t.kcal;

  const html = '<div class="modal-head"><h3>' + (mode === 'edit' ? '编辑菜谱' : '新增一道菜') + '</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<div class="form">' +
    '<div class="form-row"><label>菜名</label><input id="rcName" value="' + esc(v.name || '') + '" placeholder="比如 蒜蓉粉丝娃娃菜"></div>' +
    '<div class="form-row two"><div><label>图标</label><input id="rcEmoji" value="' + esc(v.emoji || '🍲') + '" maxlength="2"></div>' +
    '<div><label>用时（分钟）</label><input id="rcTime" type="number" value="' + num(v.time || 15) + '"></div></div>' +
    (mode === 'new'
      ? '<div class="form-row"><label>成品照片（可选，拍好后的实拍）</label>' +
        '<input id="rcPhoto" class="file-input" type="file" accept="image/*"><div id="rcPhotoPrev" class="photo-preview"></div></div>'
      : '') +
    '<div class="form-row"><label>标签（逗号分隔，写「减脂」就会出现在减脂分类）</label><input id="rcTags" value="' + esc((v.tags || []).join(',')) + '" placeholder="家常,快手"></div>' +
    '<div class="form-row"><label>搜索关键词（找视频用，可留空）</label><input id="rcKw" value="' + esc(v.kw || '') + '" placeholder="留空就用菜名"></div>' +
    '</div>' +

    '<div class="section-mini"><h4>食材 · 点图标就加进去</h4>' +
    '<input id="ingSearch" class="search small-search" placeholder="搜食材，比如 土豆 / 番茄" autocomplete="off" value="' + esc(formIngQuery) + '">' +
    '<div class="chips ing-cat-row">' + ING_CATS.map(c =>
      '<button class="chip' + (formIngCat === c ? ' chip-on' : '') + '" data-action="ing-cat" data-k="' + c + '">' + (c === 'all' ? '全部' : c) + '</button>'
    ).join('') + '</div>' +
    '<div class="ing-grid" id="ingGrid">' + ingGridHTML() + '</div>' +
    '<h4>已选的食材</h4><div class="ing-selected" id="ingSelected">' + ingSelectedHTML() + '</div>' +
    '<div class="ing-custom"><input id="ingCustomName" placeholder="库里没有的食材，自己加一个"><button class="btn small ghost" data-action="ing-custom-add">加入</button></div>' +
    '</div>' +

    '<div class="card auto-nutri">' +
    '<div class="an-head"><b>营养估算</b><button class="link-btn" data-action="ing-recalc">按食材重算</button></div>' +
    nutriFieldsHTML({ kcal: kcalVal, p: r ? num(r.p) : t.p, c: r ? num(r.c) : t.c, f: r ? num(r.f) : t.f }) +
    '<div class="an-sum muted small" id="autoSum">' + autoSumText() + '</div>' +
    '</div>' +

    '<h4>做法 · 每行一步</h4>' +
    '<textarea id="rcSteps" rows="5" class="full-textarea" placeholder="番茄切块\n热锅倒油，鸡蛋炒散">' + esc((v.steps || []).join('\n')) + '</textarea>' +

    '<div class="modal-foot">' +
    (mode === 'edit' && db.recipeEdits[id] ? '<button class="btn ghost" data-action="edit-recipe-reset" data-id="' + id + '">恢复默认</button>' : '') +
    '<button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="' + (mode === 'edit' ? 'edit-recipe-save' : 'save-recipe') + '" data-id="' + (id || '') + '">保存菜谱</button>' +
    '</div>';

  openModal(html, { id: id || null, mode: mode });
}

function openNewRecipe() { openRecipeForm('new', null); }
function openRecipeEdit(id) { openRecipeForm('edit', id); }

function readRecipeForm() {
  const name = ($('#rcName') || {}).value.trim();
  if (!name) { toast('先填菜名'); return null; }
  if (!formIngs.length) { toast('先点几个食材加进去'); return null; }
  const steps = (($('#rcSteps') || {}).value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const tags = (($('#rcTags') || {}).value || '').split(/[,，、\s]+/).filter(Boolean);
  return {
    name: name,
    emoji: (($('#rcEmoji') || {}).value || '🍲').trim() || '🍲',
    kcal: num(($('#rcKcal') || {}).value),
    p: num(($('#rcP') || {}).value),
    c: num(($('#rcC') || {}).value),
    f: num(($('#rcF') || {}).value),
    time: num(($('#rcTime') || {}).value) || 15,
    tags: tags.length ? tags : ['自定义'],
    ing: formIngs.map(x => ({
      n: x.name,
      q: x.known ? (x.mult > 1 ? x.mult + ' × ' + x.unit : (x.unit || '适量')) : (x.qText || '适量'),
      p: Math.round(x.price * x.mult * 10) / 10,
      cat: x.cat || '其他'
    })),
    steps: steps.length ? steps : ['按自己的习惯做吧。'],
    kw: (($('#rcKw') || {}).value || '').trim() || name
  };
}
