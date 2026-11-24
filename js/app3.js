/* 玉米的App — 第三部分：买菜清单、数据页、事件处理、启动 */

const CAT_ORDER = ['蔬菜', '肉禽', '水产', '蛋奶', '豆制品', '主食', '调料', '其他'];

/* ---------- 买菜清单（按日期记，不自动从菜单导入） ---------- */
let shopDate = todayStr();
let shopPicks = [];

function shopList(date) {
  return (db.shopDays[date] || []).slice();
}
function shopWeekItems(week) {
  const monday = parseYmd(week);
  const map = {};
  for (let i = 0; i < 7; i++) {
    const key = ymd(addDays(monday, i));
    shopList(key).forEach(it => {
      if (!map[it.n]) map[it.n] = { n: it.n, cat: it.cat || '其他', e: it.e, u: it.u, q: [], price: 0, days: [] };
      if (map[it.n].q.indexOf(it.q) < 0) map[it.n].q.push(it.q);
      map[it.n].price += Number(it.price || 0);
      if (map[it.n].days.indexOf(key) < 0) map[it.n].days.push(key);
    });
  }
  return Object.keys(map).map(k => map[k]);
}
function shopIco(it) {
  const ing = findIng(it.n);
  return (ing && ing.e) || it.e || '🥡';
}
function shopAddItem(date, name, q, price, cat) {
  const arr = db.shopDays[date] = db.shopDays[date] || [];
  const ing = findIng(name);
  const exist = arr.filter(x => x.n === name)[0];
  if (exist) {
    if (q) exist.q = q;
    if (price !== '' && price !== undefined && price !== null) exist.price = Number(price) || 0;
    if (cat) exist.cat = cat;
  } else {
    arr.push({ n: name, q: q || '1份', price: Number(price) || (ing && ing.price ? ing.price : 0), cat: cat || (ing ? ing.cat : '其他'), e: ing ? ing.e : '🥡', u: ing ? ing.u : '份' });
  }
}
function openShopForm(date, name) {
  const it = shopList(date).filter(x => x.n === name)[0] || {};
  const html = '<div class="modal-head"><h3>' + (name ? '改这样要买的' : '加一样要买的') + '</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<div class="form-row"><div><label>买什么</label><div class="voice-row"><input id="shopName" value="' + esc(name || '') + '" placeholder="比如 西兰花"><button class="mic-btn" data-action="voice" data-target="shopName" title="用语音说菜名">🎤</button></div></div></div>' +
    '<div class="form-inline"><div><label>数量</label><input id="shopQ" value="' + esc(it.q || '') + '" placeholder="1颗 / 2把"></div>' +
    '<div><label>大概多少钱</label><input id="shopPrice" type="number" step="0.1" value="' + (it.price || '') + '"></div></div>' +
    '<div class="form-row"><div><label>归类</label><select id="shopCat">' +
    CAT_ORDER.map(c => '<option' + ((it.cat || '蔬菜') === c ? ' selected' : '') + '>' + c + '</option>').join('') +
    '</select></div></div>' +
    '<div class="modal-foot"><button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="shop-save">保存</button></div>';
  openModal(html, { date: date, name: name || '' });
}
function openShopImport(date) {
  const monday = mondayStr(parseYmd(date));
  const dishes = [];
  for (let i = 0; i < 7; i++) {
    const key = ymd(addDays(parseYmd(monday), i));
    (readPlan(key).dishes || []).forEach(id => {
      const r = recipeById(id);
      if (r) dishes.push({ key: key, r: r });
    });
  }
  let html = '<div class="modal-head"><h3>从菜单挑要买的</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<p class="muted small">勾上这道菜，才会把它要用的菜加进清单——不勾就什么都不加。菜单本身不会自动导进来。</p>';
  if (!dishes.length) {
    html += '<div class="fr-week-empty">这周还没排菜，先去「一周」排几道</div>';
  } else {
    html += '<div class="imp-list">';
    dishes.forEach(d => {
      const on = shopPicks.indexOf(d.r.id) >= 0;
      html += '<label class="imp-row' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" data-action="shop-import-toggle" data-id="' + d.r.id + '"' + (on ? ' checked' : '') + '>' +
        '<span class="imp-ico">' + d.r.emoji + '</span>' +
        '<span class="imp-main"><span class="imp-name">' + esc(d.r.name) + '</span>' +
        '<span class="imp-meta">' + (parseYmd(d.key).getMonth() + 1) + '月' + parseYmd(d.key).getDate() + '日 · ' + (d.r.ing || []).length + ' 样食材</span></span>' +
        '</label>';
    });
    html += '</div>';
  }
  html += '<div class="modal-foot"><button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="shop-import-confirm">导入所选（' + shopPicks.length + '）</button></div>';
  openModal(html, { date: date });
}
/* ---------- 识图导入买菜清单 ---------- */
let ocrStage = 'pick';
let ocrImg = '';
let ocrRows = [];
let ocrBusy = false;
let ocrError = '';

function openShopOcr() {
  if (!ocrSupported()) {
    toast('识别引擎没加载，检查一下 vendor/tesseract 文件夹还在不在');
    return;
  }
  ocrBusy = false;
  ocrError = '';
  ocrStage = 'pick';
  ocrImg = '';
  ocrRows = [];
  renderShopOcr();
}

function renderShopOcr() {
  let html = '<div class="modal-head"><h3>拍张清单，自动认菜名</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>';

  if (ocrStage === 'pick') {
    html += '<div class="ocr-photo">' + (ocrImg
      ? '<img src="' + ocrImg + '" alt="清单照片">'
      : '<span class="ocr-ph">📷</span><span class="muted small">拍超市小票、手写清单、购物车截图都行<br>字清楚、尽量正着拍，认得更准</span>') + '</div>' +
      '<div class="btn-row"><label class="btn ghost ocr-file-btn">' + (ocrImg ? '重拍 / 换一张' : '拍照 / 选图片') +
      '<input type="file" id="shopOcrInput" accept="image/*" capture="environment" hidden></label></div>' +
      '<p class="muted small">识别是在这台设备本地算的（引擎和字库都在 app 里），照片不会上传。认出来后会先列出来给你核对，不会直接塞进清单。</p>' +
      '<div class="modal-foot"><button class="btn ghost" data-action="close-modal">取消</button>' +
      '<button class="btn" data-action="shop-ocr-start"' + (ocrImg ? '' : ' disabled') + '>开始识别</button></div>';
  } else if (ocrStage === 'run') {
    html += '<div class="ocr-run"><div class="ocr-spin">🔍</div>' +
      '<div class="ocr-bar"><i id="ocrBar"></i></div><span id="ocrPct" class="muted small">正在准备识别引擎…</span></div>' +
      '<p class="muted small">第一次用要加载中文模型，会慢一点；之后再认会快很多。</p>';
  } else if (ocrStage === 'done') {
    if (!ocrRows.length) {
      html += '<p class="muted">这张图里没认出菜名。换一张清楚点的，或直接用「＋ 自己加」。</p>' +
        '<div class="modal-foot"><button class="btn ghost" data-action="shop-ocr-again">重新拍</button>' +
        '<button class="btn" data-action="close-modal">知道了</button></div>';
      openModal(html);
      return;
    }
    html += '<p class="muted small">认出 ' + ocrRows.length + ' 样，核对一下：不要的取消勾选，数量不对等会儿在清单里点「改」。</p>' +
      '<div class="ocr-list">' + ocrRows.map(function (r, i) {
        return '<label class="ocr-row' + (r.on ? ' on' : '') + '">' +
          '<input type="checkbox" data-ocr-i="' + i + '"' + (r.on ? ' checked' : '') + '>' +
          '<span class="ocr-ico">' + r.ico + '</span>' +
          '<span class="ocr-name">' + esc(r.n) + '</span>' +
          '<span class="ocr-q">' + esc(r.q) + '</span></label>';
      }).join('') + '</div>' +
      '<div class="modal-foot"><button class="btn ghost" data-action="shop-ocr-again">重拍</button>' +
      '<button class="btn" data-action="shop-ocr-confirm">加入清单（' + ocrRows.filter(function (r) { return r.on; }).length + '）</button></div>';
  }
  openModal(html);
}

async function pickShopOcrPhoto(file) {
  toast('正在处理照片…');
  try {
    ocrImg = await compressImage(file, 1100, 0.82);
  } catch (e) { toast('这张图读不出来，换一张'); return; }
  ocrRows = [];
  ocrStage = 'pick';
  renderShopOcr();
}

async function runShopOcr() {
  if (!ocrImg || ocrBusy) return;
  ocrBusy = true;
  ocrError = '';
  ocrStage = 'run';
  renderShopOcr();
  try {
    const text = await ocrImage(ocrImg, function (m) {
      const pct = Math.max(0, Math.min(100, Math.round((m.progress || 0) * 100)));
      const p = $('#ocrPct');
      if (p) p.textContent = (m.status === 'recognizing text' ? '正在认字 ' : '准备模型 ') + pct + '%';
      const bar = $('#ocrBar');
      if (bar) bar.style.width = pct + '%';
    });
    ocrRows = ocrParseShopping(text);
    ocrStage = 'done';
  } catch (e) {
    ocrError = String(e && e.message || e);
    ocrStage = 'done';
    ocrRows = [];
    toast('识别没成功，再试一次');
  }
  ocrBusy = false;
  renderShopOcr();
}

/* ---------- 冰箱照片识别名字 ---------- */
let fridgeOcrBusy = false;
async function runFridgeOcr() {
  if (!fridgePhoto) { toast('先拍一张照片'); return; }
  if (!ocrSupported()) { toast('识别引擎没加载'); return; }
  if (fridgeOcrBusy) return;
  fridgeOcrBusy = true;
  openFridgeAdd();
  try {
    const text = await ocrImage(fridgePhoto, function (m) {
      const pct = Math.round((m.progress || 0) * 100);
      const el = $('#frOcrPct');
      if (el) el.textContent = (m.status === 'recognizing text' ? '认字 ' : '准备 ') + pct + '%';
    });
    const name = ocrParseName(text);
    if (name) {
      fridgeCustomName = name;
      const ing = findIng(name);
      if (ing) fridgePickCat = fridgeCatKey(ing.cat);
      toast('认到「' + name + '」，不对就改一下');
    } else {
      toast('照片里没认出字，直接写名字或用图标选');
    }
  } catch (e) {
    toast('识别没成功，直接写名字吧');
  }
  fridgeOcrBusy = false;
  openFridgeAdd();
}

function viewShopping() {
  const date = shopDate;
  const d = parseYmd(date);
  const list = shopList(date);
  const checked = db.shopChecked[date] || {};
  const total = list.reduce((s, it) => s + Number(it.price || 0), 0);
  const bought = list.filter(it => checked[it.n]).length;
  const dd = new Date();
  const rel = date === todayStr() ? '今天' : (date === ymd(addDays(dd, -1)) ? '昨天' : (date === ymd(addDays(dd, 1)) ? '明天' : ''));
  const label = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];

  let html = '<div class="page-head"><div><h2>买菜清单</h2><p class="muted">按日期记你实际买了什么，菜单不会自己跑进来</p></div>' +
    '<div class="head-btns"><button class="btn small ghost" data-action="shop-ocr-open">📷 识图</button>' +
    '<button class="btn small ghost" data-action="shop-import-open">从菜单挑</button>' +
    '<button class="btn small" data-action="shop-add">＋ 自己加</button></div></div>';

  html += '<div class="shop-datebar">' +
    '<button class="date-arrow" data-action="shop-day-prev">‹</button>' +
    '<div class="shop-date"><span class="sd-rel">' + (rel || label) + '</span>' +
    '<span class="sd-date">' + (rel ? label : '点箭头换一天') + '</span></div>' +
    '<button class="date-arrow" data-action="shop-day-next">›</button>' +
    (rel && rel !== '今天' ? '<button class="chip" data-action="shop-day-today">回到今天</button>' : '') +
    '</div>';

  if (!list.length) {
    html += '<div class="card shop-empty">' +
      '<div class="se-ico">🛒</div>' +
      '<div class="se-title">' + (rel || '这天') + '还没记买了什么</div>' +
      '<p class="muted small">自己买的外卖、零食、菜，都可以随手加进来</p>' +
      '<div class="btn-row"><button class="btn ghost" data-action="shop-ocr-open">📷 拍清单识别</button>' +
      '<button class="btn ghost" data-action="shop-import-open">从菜单挑</button>' +
      '<button class="btn" data-action="shop-add">＋ 加一样</button></div>' +
      '</div>';
    return html;
  }

  html += '<div class="card shop-sum"><div><span class="muted">共 ' + list.length + ' 样，已买 ' + bought + ' 样</span>' +
    '<div class="shop-total">¥' + money(total) + '<span class="muted small"> 估算</span></div></div>' +
    '<button class="btn small ghost" data-action="shop-copy">复制清单</button></div>';

  const cats = Array.from(new Set(list.map(it => it.cat || '其他')));
  cats.forEach(cat => {
    const items = list.filter(it => (it.cat || '其他') === cat);
    if (!items.length) return;
    html += '<div class="section-head"><h3>' + cat + '</h3><span class="muted">¥' + money(items.reduce((s, i) => s + Number(i.price || 0), 0)) + '</span></div>';
    html += '<div class="card list-card shop-card">';
    items.forEach(it => {
      const on = !!checked[it.n];
      html += '<div class="shop-row' + (on ? ' is-checked' : '') + '">' +
        '<input type="checkbox" data-action="shop-toggle" data-key="' + esc(it.n) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="shop-ico">' + shopIco(it) + '</span>' +
        '<span class="shop-name">' + esc(it.n) + '</span>' +
        '<span class="shop-q">' + esc(it.q || '') + '</span>' +
        '<span class="shop-p">¥' + money(it.price) + '</span>' +
        '<span class="shop-ops">' +
        '<button class="shop-op" data-action="shop-to-fridge" data-key="' + esc(it.n) + '" title="放进冰箱">🧊</button>' +
        '<button class="shop-op" data-action="shop-edit" data-key="' + esc(it.n) + '" title="改数量/价格">改</button>' +
        '<button class="shop-op shop-op-x" data-action="shop-del" data-key="' + esc(it.n) + '" title="删掉">✕</button>' +
        '</span></div>';
    });
    html += '</div>';
  });

  html += '<div class="btn-row"><button class="btn ghost" data-action="shop-clear">清空勾选</button></div>';
  html += '<p class="muted small fr-tip">🧊 点一下就把这样菜记进冰箱（数量按 1 份），冰箱那边还能改数量、补购买日期和保质期。</p>';
  return html;
}

/* ---------- 冰箱（实际库存，和菜单分开） ---------- */
let fridgeSource = 'lib';
let fridgeCat = '全部';
let fridgeQuery = '';
let fridgePick = '';
let fridgePickQty = 1;
let fridgeBuyDate = '';
let fridgeExpireDate = '';
let fridgePhoto = '';
let fridgeCatFilter = '全部';
let fridgePickCat = '';
let fridgeCustomName = '';

const FRIDGE_WARN_DAYS = 2;
const FRIDGE_CATS = ['肉类', '蔬菜类', '酱料类', '其他类'];
/* 把食材库里的细分类并成冰箱自己的四类 */
function fridgeCatKey(raw) {
  const c = String(raw || '');
  if (c === '肉类' || c === '肉禽' || c === '水产') return '肉类';
  if (c === '蔬菜类' || c === '蔬菜') return '蔬菜类';
  if (c === '酱料类' || c === '调料' || c === '酱料') return '酱料类';
  return '其他类';
}
function fridgeCatOf(it) {
  return fridgeCatKey(it.fcat || it.cat);
}

function fridgeDays(it) {
  const base = it.buyDate || (it.ts ? ymd(new Date(it.ts)) : '');
  if (!base) return 0;
  return Math.max(0, Math.floor((parseYmd(todayStr()) - parseYmd(base)) / 86400000));
}
function fridgeLeft(it) {
  if (!it.expireDate) return null;
  return Math.floor((parseYmd(it.expireDate) - parseYmd(todayStr())) / 86400000);
}
function fridgeBadge(it) {
  const left = fridgeLeft(it);
  if (left !== null) {
    if (left < 0) return '<span class="fr-age fr-age-bad">过期' + (-left) + '天</span>';
    if (left <= 2) return '<span class="fr-age fr-age-warn">剩' + left + '天</span>';
    return '<span class="fr-age fr-age-ok">剩' + left + '天</span>';
  }
  const days = fridgeDays(it);
  return days >= 3 ? '<span class="fr-age">放' + days + '天</span>' : '';
}
/* 保质期提醒：剩 2 天及以内（含过期）算「要到期」；忽略只针对当前这个保质期日期 */
function fridgeNearing(it) {
  const left = fridgeLeft(it);
  return left !== null && left <= FRIDGE_WARN_DAYS;
}
function fridgeMuted(it) {
  return !!(it.muteExp && it.expireDate && it.muteExp === it.expireDate);
}
function fridgeNeedWarn(it) {
  return fridgeNearing(it) && !fridgeMuted(it);
}
function fridgeWarnItems() {
  return db.fridge.filter(fridgeNeedWarn);
}
function fridgeUnit(it) {
  return it.u || '份';
}
function fridgeTotal() {
  return db.fridge.reduce((s, it) => s + num(it.qty), 0);
}
function fridgeGridHTML() {
  const q = fridgeQuery.trim();
  let list = ING_DB.filter(x => !q || x.n.indexOf(q) >= 0 || x.cat.indexOf(q) >= 0);
  if (fridgeCat !== '全部') list = list.filter(x => x.cat === fridgeCat);
  if (!list.length) return '<p class="muted small" style="padding:10px 4px">库里没有，下面手动输入名字也行</p>';
  return list.map(x =>
    '<button class="ing-tile' + (fridgePick === x.n ? ' on' : '') + '" data-action="fridge-pick" data-n="' + esc(x.n) + '">' +
    '<span class="it-ico">' + x.e + '</span><span class="it-n">' + esc(x.n) + '</span><span class="it-k">' + x.cat + '</span></button>'
  ).join('');
}
function fridgeItemCard(it) {
  const warn = fridgeNeedWarn(it);
  return '<div class="fr-item' + (warn ? ' fr-item-warn' : '') + '" data-action="fridge-item" data-id="' + it.id + '">' +
    (warn ? '<span class="fr-dot" title="快到期了，点开可以忽略提醒"></span>' : '') +
    '<span class="fr-eat" data-action="fridge-eat" data-id="' + it.id + '" title="吃掉一份">✓</span>' +
    fridgeBadge(it) +
    (it.photo
      ? '<span class="fr-emoji fr-photo"><img src="' + it.photo + '" alt="' + esc(it.n) + '"></span>'
      : '<span class="fr-emoji">' + (it.e || '🥡') + '</span>') +
    '<span class="fr-name">' + esc(it.n) + '</span>' +
    '<span class="fr-qty">' + num(it.qty) + fridgeUnit(it) + '</span>' +
    '</div>';
}
function viewFridge() {
  const all = db.fridge.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const items = fridgeCatFilter === '全部' ? all : all.filter(it => fridgeCatOf(it) === fridgeCatFilter);
  const catCount = {};
  FRIDGE_CATS.forEach(c => { catCount[c] = all.filter(it => fridgeCatOf(it) === c).length; });
  const kindTxt = FRIDGE_CATS.filter(c => catCount[c]).map(c => c + ' ' + catCount[c]).join(' · ');
  const soon = fridgeWarnItems();
  const muted = all.filter(it => fridgeNearing(it) && fridgeMuted(it));

  let html = '<div class="page-head"><div><h2>我的冰箱</h2><p class="muted">只记冰箱里实际还有的，和一周菜单分开算</p></div>' +
    '<button class="btn small" data-action="fridge-add-open">＋ 放进去</button></div>';

  html += '<div class="card fr-sum">' +
    '<div class="fr-sum-num"><b>' + all.length + '</b><span>样东西</span></div>' +
    '<div class="fr-sum-mid"><span class="muted small">' + (all.length ? kindTxt : '冰箱现在是空的') + '</span>' +
    '<span class="muted small">' + (soon.length ? '⏰ ' + soon.length + ' 样设置过保质期、快到期了' + (muted.length ? '（另有 ' + muted.length + ' 样已忽略提醒）' : '') : '菜单是「准备做什么」，冰箱是「手头有什么」') + '</span></div>' +
    '<div class="fr-sum-ico">🧊</div></div>';

  html += '<div class="chips fr-filter"><span class="muted small">只看</span>' +
    ['全部'].concat(FRIDGE_CATS).map(c => {
      const n = c === '全部' ? all.length : catCount[c];
      return '<button class="chip' + (fridgeCatFilter === c ? ' chip-on' : '') + '" data-action="fr-filter" data-k="' + c + '">' +
        c + '<em>' + n + '</em></button>';
    }).join('') + '</div>';

  if (soon.length) {
    html += '<div class="fr-alert">' +
      '<span class="fa-ico">🔔</span>' +
      '<div class="fa-main"><b>' + soon.length + ' 样快到期了</b><span class="muted small">点名字看剩几天；不点的小红点会一直亮着</span>' +
      '<div class="chips fr-alert-list">' +
      soon.map(it => {
        const left = fridgeLeft(it);
        return '<button class="chip fr-alert-chip" data-action="fridge-item" data-id="' + it.id + '">' +
          (it.e || '🥡') + ' ' + esc(it.n) + '<em>' + (left < 0 ? '过期' + (-left) + '天' : '剩' + left + '天') + '</em></button>';
      }).join('') +
      '</div></div></div>';
  }

  const per = items.length ? Math.ceil(items.length / 3) : 0;
  if (all.length && !items.length) {
    html += '<div class="fr-filter-empty">「' + fridgeCatFilter + '」里还没有东西，点上面的「全部」看看</div>';
  }
  const shelves = [items.slice(0, per), items.slice(per, per * 2), items.slice(per * 2)];
  const shelfName = ['上层 · 常吃的', '中层 · 今天想吃的', '下层 · 慢慢吃'];

  html += '<div class="fridge">' +
    '<div class="fridge-top">' +
      '<span class="fr-badge">今日份</span>' +
      '<span class="fr-magnets">' + (items.length ? '🍅 📝' : '✨') + '</span>' +
    '</div>' +
    '<div class="fridge-body">' +
      '<div class="fr-freezer"><span class="fz-ico">❄</span><span class="fz-label">冷冻室</span><span class="fz-temp">−18°C</span></div>' +
      '<div class="fr-door">' +
        '<div class="fr-door-bar"><span class="fh-brand">冷藏 4°C</span><span class="fh-hint">' + items.length + ' 样</span></div>';
  shelves.forEach((arr, i) => {
    html += '<div class="fr-shelf"><span class="fs-tag">' + shelfName[i] + '</span><div class="fr-row">' +
      (arr.length ? arr.map(fridgeItemCard).join('') : (i === 0 ? '<button class="fr-slot-add" data-action="fridge-add-open">＋ 放点东西</button>' : '<span class="fr-slot-empty">空着</span>')) +
      '</div><div class="fr-board"></div></div>';
  });
  html += '<div class="fr-door-note">' + (items.length ? '点一下看详情，点 ✓ 吃掉一份' : '买回来的菜，随手放进来') + '</div>' +
      '<div class="fr-handle"></div>' +
      '<div class="fr-vent"><i></i><i></i><i></i><i></i></div>' +
      '</div>' +
    '</div>' +
    '<div class="fr-feet"><i></i><i></i></div>' +
    '</div>';

  if (items.length) {
    html += '<div class="btn-row"><button class="btn ghost" data-action="fridge-add-open">＋ 再放点东西</button>' +
      '<button class="btn ghost" data-action="fridge-tidy">整理一下</button></div>';
  }
  html += '<p class="muted small fr-tip">冰箱和菜单互不同步：菜单里排的菜不会自动进冰箱，冰箱里的东西也不会自己排进菜单。想从菜单或买菜清单挑，点「＋ 放进去」里选。</p>';
  return html;
}
function openFridgeAdd() {
  let html = '<div class="modal-head"><h3>放点东西进冰箱</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>';

  html += '<div class="fr-tabs">' +
    '<button class="seg-btn' + (fridgeSource === 'lib' ? ' seg-on' : '') + '" data-action="fridge-source" data-k="lib">常备食材</button>' +
    '<button class="seg-btn' + (fridgeSource === 'week' ? ' seg-on' : '') + '" data-action="fridge-source" data-k="week">本周清单里挑</button>' +
    '</div>';

  if (fridgeSource === 'lib') {
    const cats = Array.from(new Set(ING_DB.map(x => x.cat)));
    html += '<input id="fridgeSearch" class="search small-search" placeholder="搜食材，比如 番茄 / 鸡蛋" autocomplete="off" value="' + esc(fridgeQuery) + '">' +
      '<div class="chips ing-cat-row">' +
      '<button class="chip' + (fridgeCat === '全部' ? ' chip-on' : '') + '" data-action="fridge-cat" data-k="全部">全部</button>' +
      cats.map(c => '<button class="chip' + (fridgeCat === c ? ' chip-on' : '') + '" data-action="fridge-cat" data-k="' + c + '">' + c + '</button>').join('') +
      '</div>' +
      '<div class="ing-grid" id="fridgeGrid">' + fridgeGridHTML() + '</div>';
  } else {
    const list = shopWeekItems(activeMondayStr);
    html += '<p class="muted small">这一周清单要买的东西，挑你<strong>已经买了</strong>的放进去，不会自动同步。</p>';
    if (!list.length) {
      html += '<div class="fr-week-empty">这周清单还是空的，先去「买菜」添几样</div>';
    } else {
      html += '<div class="chips fr-src-wrap">' + list.map(it => {
        const ing = findIng(it.n);
        return '<button class="chip fr-src" data-action="fridge-pick" data-n="' + esc(it.n) + '">' +
          (ing ? ing.e : '🥡') + ' ' + esc(it.n) + ' <em>' + esc(it.q.join(' / ')) + '</em></button>';
      }).join('') + '</div>';
    }
  }

  const pickCat = fridgePickCat || (fridgePick ? fridgeCatKey((findIng(fridgePick) || {}).cat) : '');
  html += '<div class="fr-picked">' +
    (fridgePick
      ? '<span class="fp-ico">' + (findIng(fridgePick) ? findIng(fridgePick).e : '🥡') + '</span>' +
        '<span class="fp-name">' + esc(fridgePick) + '</span>' +
        '<span class="stepper"><button data-action="fridge-qty-dec">−</button><b>' + fridgePickQty + '</b><button data-action="fridge-qty-inc">＋</button></span>'
      : '<span class="muted small">还没选，下面点一个食材</span>') +
    '</div>' +
    '<div class="fr-cat-pick"><span class="muted small">归到哪一类（冰箱里不显示，只是方便筛）</span>' +
    '<div class="chips">' + FRIDGE_CATS.map(c =>
      '<button class="chip' + (pickCat === c ? ' chip-on' : '') + '" data-action="fridge-fcat" data-k="' + c + '">' + c + '</button>'
    ).join('') + '</div></div>';

  html += '<div class="fr-photo-box">' +
    '<div class="fr-photo-prev">' + (fridgePhoto
      ? '<img src="' + fridgePhoto + '" alt="刚拍的照片"><span class="muted small">就用这张</span>'
      : '<span class="fr-photo-empty">📷</span><span class="muted small">拍一张，冰箱里就显示它的样子；不拍就用图标</span>') + '</div>' +
    '<div class="fr-photo-btns">' +
    '<label class="btn small ghost fr-photo-btn">📷 拍一张 / 选照片<input type="file" id="fridgePhotoInput" accept="image/*" capture="environment" hidden></label>' +
    (fridgePhoto ? '<button class="chip" data-action="fridge-ocr">🔍 识别照片里的名字</button>' : '') +
    (fridgePhoto ? '<span id="frOcrPct" class="muted small">' + (fridgeOcrBusy ? '识别中…' : '包装上有字就能认，散装菜认不出') + '</span>' : '') +
    (fridgePhoto ? '<button class="chip" data-action="fridge-photo-clear">去掉照片</button>' : '') +
    '</div></div>';

  html += '<div class="ing-custom"><input id="fridgeCustom" placeholder="库里没有？写个名字，或按🎤说" autocomplete="off" value="' + esc(fridgeCustomName) + '">' +
    '<button class="mic-btn" data-action="voice" data-target="fridgeCustom" title="用语音说名字">🎤</button>' +
    '<button class="btn small ghost" data-action="fridge-custom">加这个</button></div>';

  html += '<div class="fr-date-box">' +
    '<label class="fr-d-label">购买日期<input type="date" id="fridgeBuyDate" value="' + (fridgeBuyDate || todayStr()) + '"></label>' +
    '<label class="fr-d-label">保质期到<span class="muted" style="font-weight:400">（可以不填）</span><input type="date" id="fridgeExpire" value="' + (fridgeExpireDate || '') + '"></label>' +
    '</div>' +
    '<div class="chips fr-quick"><span class="muted small">保质期快捷：</span>' +
    [3, 7, 30].map(d => '<button class="chip" data-action="fridge-exp-quick" data-d="' + d + '">+' + d + '天</button>').join('') +
    '<button class="chip" data-action="fridge-exp-clear">不填</button></div>';

  html += '<div class="modal-foot">' +
    '<button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="fridge-confirm"' + (fridgePick ? '' : ' disabled') + '>放进冰箱</button>' +
    '</div>';
  openModal(html);
}
function openFridgeItem(id) {
  const it = db.fridge.filter(x => x.id === id)[0];
  if (!it) return;
  const days = fridgeDays(it);
  const buy = it.buyDate || (it.ts ? ymd(new Date(it.ts)) : '');
  const left = fridgeLeft(it);
  let leftTxt = '';
  if (it.expireDate) {
    if (left < 0) leftTxt = '<span style="color:#D9644A">已过期 ' + (-left) + ' 天</span>';
    else if (left <= 2) leftTxt = '<span style="color:#C9871F">还剩 ' + left + ' 天，快吃</span>';
    else leftTxt = '还剩 ' + left + ' 天';
  } else {
    leftTxt = '<span class="muted">没填，不提醒</span>';
  }
  const muted = fridgeNearing(it) && fridgeMuted(it);
  let html = '<div class="modal-head"><h3>' + (it.e || '🥡') + ' ' + esc(it.n) + '</h3>' +
    '<button class="icon-btn tiny" data-action="close-modal">✕</button></div>';
  if (it.photo) html += '<div class="fr-detail-photo"><img src="' + it.photo + '" alt="' + esc(it.n) + '"></div>';
  html += '<div class="card fr-detail">' +
    '<div class="fr-d-row"><span class="muted">现在还剩</span><span><b>' + num(it.qty) + fridgeUnit(it) + '</b></span></div>' +
    '<div class="fr-d-row"><span class="muted">冰箱分类</span><span>' + fridgeCatOf(it) + '</span></div>' +
    '<div class="fr-d-row"><span class="muted">购买日期</span><span>' + (buy ? esc(buy) : '没填') + '</span></div>' +
    '<div class="fr-d-row"><span class="muted">保质期到</span><span>' + (it.expireDate ? esc(it.expireDate) : '没填') + '</span></div>' +
    '<div class="fr-d-row"><span class="muted">保鲜情况</span><span>' + leftTxt + '</span></div>' +
    '<div class="fr-d-row"><span class="muted">到期提醒</span><span>' +
      (!it.expireDate ? '<span class="muted">没填保质期，不提醒</span>'
        : (muted ? '<span class="muted">已忽略这次提醒</span>'
          : (fridgeNearing(it) ? '<span class="fr-red-txt">🔔 亮着红点</span>' : '还早，先不提醒'))) +
      '</span></div>' +
    '<div class="fr-d-row"><span class="muted">放进冰箱</span><span>' + (days <= 0 ? '今天' : days + ' 天前') + '</span></div>' +
    (it.note ? '<div class="fr-d-row"><span class="muted">清单上的量</span><span>' + esc(it.note) + '</span></div>' : '') +
    '</div>';

  const uses = allRecipes().filter(r => (r.ing || []).some(g => g.n.indexOf(it.n) >= 0 || it.n.indexOf(g.n) >= 0)).slice(0, 6);
  if (uses.length) {
    html += '<div class="fr-use"><div class="fr-use-t">用它做菜</div><div class="chips">' +
      uses.map(r => '<button class="chip" data-action="open-recipe" data-id="' + r.id + '">' + r.emoji + ' ' + esc(r.name) + '</button>').join('') +
      '</div></div>';
  }

  html += '<div class="fr-date-box">' +
    '<label class="fr-d-label">改正购买日期<input type="date" id="fridgeEditBuy" value="' + esc(buy) + '"></label>' +
    '<label class="fr-d-label">改保质期<input type="date" id="fridgeEditExp" value="' + esc(it.expireDate || '') + '"></label>' +
    '</div>' +
    '<div class="btn-row"><button class="btn ghost small" data-action="fridge-save-dates" data-id="' + id + '">保存这两个日期</button></div>' +
    '<div class="fr-cat-edit"><span class="muted small">改分类</span><div class="chips">' +
    FRIDGE_CATS.map(c => '<button class="chip' + (fridgeCatOf(it) === c ? ' chip-on' : '') + '" data-action="fridge-set-cat" data-id="' + id + '" data-k="' + c + '">' + c + '</button>').join('') +
    '</div></div>' +
    '<div class="chips fr-d-tools">' +
    (it.expireDate && fridgeNearing(it)
      ? (muted
        ? '<button class="chip" data-action="fridge-unmute" data-id="' + id + '">恢复提醒</button>'
        : '<button class="chip fr-chip-warn" data-action="fridge-mute" data-id="' + id + '">忽略这次提醒</button>')
      : '') +
    '<label class="chip fr-photo-btn">📷 换张照片<input type="file" id="fridgeEditPhoto" accept="image/*" capture="environment" hidden></label>' +
    (it.photo ? '<button class="chip" data-action="fridge-photo-del" data-id="' + id + '">删掉照片</button>' : '') +
    '</div>' +
    '<div class="btn-row"><button class="btn ghost" data-action="fridge-dec" data-id="' + id + '">− 一份</button>' +
    '<button class="btn ghost" data-action="fridge-inc" data-id="' + id + '">＋ 一份</button></div>' +
    '<div class="btn-row"><button class="btn" data-action="fridge-eat" data-id="' + id + '">吃掉一份</button>' +
    '<button class="btn ghost danger" data-action="fridge-remove" data-id="' + id + '">全吃完了，拿走</button></div>';
  openModal(html);
}
function putInFridge(name, qty, note, buyDate, expireDate, photo, fcat) {
  name = String(name || '').trim();
  if (!name) { toast('先写个名字'); return; }
  qty = Math.max(1, num(qty) || 1);
  const ing = findIng(name);
  const cat = fridgeCatKey(fcat || (ing ? ing.cat : ''));
  const buy = buyDate || todayStr();
  const exp = expireDate || '';
  const exist = db.fridge.filter(x => x.n === name)[0];
  if (exist) {
    exist.qty = num(exist.qty) + qty;
    exist.ts = Date.now();
    exist.buyDate = buy;
    exist.fcat = cat;
    if (exp) { exist.expireDate = exp; exist.muteExp = ''; }
    if (photo) exist.photo = photo;
  } else {
    db.fridge.push({
      id: 'f' + Date.now() + Math.floor(Math.random() * 90),
      n: name, e: ing ? ing.e : '🥡', cat: ing ? ing.cat : '其他', fcat: cat,
      u: ing ? ing.u : '份', qty, ts: fridgeTs(buy), note: note || '',
      buyDate: buy, expireDate: exp, photo: photo || ''
    });
  }
  save(); closeModal(); render();
  toast('放进冰箱了：' + name + ' ×' + qty + '（' + cat + '）' + (exp ? '，' + exp + ' 到期' : ''));
}
function fridgeTs(str) {
  const d = parseYmd(str);
  return d ? d.getTime() : Date.now();
}
function expedDate(days) {
  const base = (($('#fridgeBuyDate') || {}).value) || fridgeBuyDate || todayStr();
  const d = addDays(parseYmd(base), Number(days));
  return ymd(d);
}
function eatFridge(id) {
  const it = db.fridge.filter(x => x.id === id)[0];
  if (!it) return;
  it.qty = num(it.qty) - 1;
  if (it.qty <= 0) {
    db.fridge = db.fridge.filter(x => x.id !== id);
    toast(it.n + ' 吃完了，从冰箱拿走');
  } else {
    toast(it.n + ' 还剩 ' + it.qty + fridgeUnit(it));
  }
  save(); closeModal(); render();
}

/* ---------- 备份 / 换设备导入 ---------- */
let pendingImport = null;

function backupSummary(o) {
  const n = k => (Array.isArray(o[k]) ? o[k].length : 0);
  const c = k => (o[k] && typeof o[k] === 'object' ? Object.keys(o[k]).length : 0);
  return [
    '菜谱 ' + n('customRecipes') + ' 道',
    '体重 ' + n('weights') + ' 条',
    '花费 ' + n('expenses') + ' 笔',
    '冰箱 ' + n('fridge') + ' 样',
    '买菜 ' + c('shopDays') + ' 天',
    '照片 ' + c('photos') + ' 张'
  ].join(' · ');
}
function exportBackup() {
  const payload = Object.assign({}, db, { _app: '今日份', _at: new Date().toISOString() });
  const text = JSON.stringify(payload);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '今日份备份-' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  db.lastBackup = todayStr();
  save();
  toast('备份已导出，文件在下载里');
  render();
}
function pickBackupFile() {
  const old = document.getElementById('bkFile');
  if (old) old.remove();
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'bkFile';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', function () {
    const f = input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      let obj = null;
      try { obj = JSON.parse(String(reader.result)); } catch (e) { obj = null; }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { toast('这个文件不像是备份文件'); return; }
      const keys = ['customRecipes', 'weights', 'expenses', 'fridge', 'shopDays', 'photos', 'plan', 'recipeEdits'];
      if (!keys.some(k => obj[k] !== undefined)) { toast('文件里没找到「今日份」的数据'); return; }
      pendingImport = obj;
      openImportPreview(obj, f.name);
    };
    reader.onerror = function () { toast('读不了这个文件，换一个试试'); };
    reader.readAsText(f, 'utf-8');
    input.value = '';
  });
  input.click();
}
function openImportPreview(o, fileName) {
  const html = '<div class="modal-head"><h3>要恢复这份备份吗</h3><button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<div class="form">' +
    '<p class="muted small">' + esc(fileName || '备份文件') + '</p>' +
    '<div class="bk-preview">' + backupSummary(o) + '</div>' +
    '<p class="muted small">「合并」：把文件里多的并进来，本机已有的保留不动，适合从电脑搬到手机。<br>「覆盖」：清空本机，完全变成文件里的样子，本机现有记录会消失。</p>' +
    '</div><div class="modal-foot bk-foot">' +
    '<button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn ghost" data-action="import-cover">覆盖导入</button>' +
    '<button class="btn" data-action="import-merge">合并导入</button>' +
    '</div>';
  openModal(html, {});
}
function mergeInto(local, remote) {
  if (remote === undefined) return local;
  if (local === undefined || local === null) return remote;
  if (Array.isArray(remote)) {
    if (!Array.isArray(local)) return remote.slice();
    const seen = {};
    local.forEach(x => { seen[JSON.stringify(x)] = 1; });
    remote.forEach(x => {
      const sig = JSON.stringify(x);
      if (!seen[sig]) { seen[sig] = 1; local.push(x); }
    });
    return local;
  }
  if (typeof remote === 'object') {
    const out = (local && typeof local === 'object' && !Array.isArray(local)) ? local : {};
    Object.keys(remote).forEach(k => { out[k] = mergeInto(out[k], remote[k]); });
    return out;
  }
  if (typeof local === 'boolean' && typeof remote === 'boolean') return local || remote;
  return local;
}
function doImport(mode) {
  const src = pendingImport;
  if (!src) { toast('还没选文件'); return; }
  if (mode === 'cover') {
    const clean = Object.assign({}, src);
    delete clean._app; delete clean._at;
    initDB(clean);
  } else {
    const merged = mergeInto(JSON.parse(JSON.stringify(db)), src);
    delete merged._app; delete merged._at;
    initDB(merged);
  }
  const ok = save();
  pendingImport = null;
  closeModal();
  currentTab = 'stats';
  location.hash = 'stats';
  render();
  toast(ok ? (mode === 'cover' ? '已用备份覆盖' : '已合并导入，原来的记录都还在') : '空间不够，先删几张照片再导入');
}

/* ---------- 数据页 ---------- */
function viewStats() {
  const today = todayStr();
  const sortedW = db.weights.slice().sort((a, b) => b.date.localeCompare(a.date));
  const monthPrefix = today.slice(0, 7);
  const weekStart = mondayStr(new Date());
  const weekEnd = ymd(addDays(parseYmd(weekStart), 6));

  const rangeList = db.expenses.filter(e => spendRange === 'week'
    ? (e.date >= weekStart && e.date <= weekEnd)
    : e.date.slice(0, 7) === monthPrefix).slice().sort((a, b) => b.date.localeCompare(a.date));
  const rangeTotal = rangeList.reduce((s, e) => s + Number(e.amount || 0), 0);

  let html = '<div class="page-head"><div><h2>体重 & 花费</h2><p class="muted">曲线和账本都在这里</p></div></div>';

  html += '<div class="section-head"><h3>体重曲线</h3></div>';
  html += '<div class="card chart-card"><div id="weightChart"></div></div>';
  html += '<div class="card form-inline"><input id="wDate" type="date" value="' + today + '">' +
    '<input id="wKg" type="number" step="0.1" placeholder="体重 kg">' +
    '<button class="btn small" data-action="add-weight">记录</button></div>';

  if (sortedW.length) {
    html += '<div class="card list-card">';
    sortedW.slice(0, 8).forEach(w => {
      html += '<div class="row"><span class="row-cat">' + fmtDate(w.date) + '</span>' +
        '<span class="row-name">' + w.kg + ' kg</span>' +
        '<button class="icon-btn tiny" data-action="del-weight" data-date="' + w.date + '">✕</button></div>';
    });
    html += '</div>';
  }

  html += '<div class="section-head"><h3>花费</h3></div>';
  html += '<div class="seg"><button class="seg-btn' + (spendRange === 'week' ? ' seg-on' : '') + '" data-action="spend-range" data-k="week">本周</button>' +
    '<button class="seg-btn' + (spendRange === 'month' ? ' seg-on' : '') + '" data-action="spend-range" data-k="month">本月</button></div>';
  html += '<div class="card shop-sum"><div><span class="muted">' + (spendRange === 'week' ? '本周合计' : '本月合计') + '</span>' +
    '<div class="shop-total">¥' + money(rangeTotal) + '</div></div>' +
    '<span class="muted small">' + rangeList.length + ' 笔</span></div>';

  html += '<div class="card form-inline"><input id="expDate" type="date" value="' + today + '">' +
    '<input id="expAmt" type="number" step="0.1" placeholder="金额">' +
    '<input id="expName" placeholder="买了什么">' +
    '<select id="expCat"><option>买菜</option><option>外卖</option><option>运动</option><option>生活</option><option>其他</option></select>' +
    '<button class="btn small" data-action="add-expense">记一笔</button></div>';

  if (rangeList.length) {
    html += '<div class="card list-card">';
    rangeList.forEach(e => {
      const idx = db.expenses.indexOf(e);
      html += '<div class="row"><span class="row-cat">' + e.date.slice(5) + '</span>' +
        '<span class="row-name">' + esc(e.name) + ' <em class="muted small">' + esc(e.cat || '') + '</em></span>' +
        '<span class="row-amt">¥' + money(e.amount) + '</span>' +
        '<button class="icon-btn tiny" data-action="del-exp" data-idx="' + idx + '">✕</button></div>';
    });
    html += '</div>';
  } else {
    html += '<p class="muted pad">这一' + (spendRange === 'week' ? '周' : '个月') + '还没有记录。</p>';
  }

  html += '<div class="section-head"><h3>备份与转移</h3></div>';
  html += '<div class="card backup-card">' +
    '<p class="muted small">数据只存在当前这台设备的浏览器里，手机是另一份存储，不会自动同步。换设备前先导出备份，到新设备上导入就行；导入默认"合并"，不会盖掉新设备上已有的东西。</p>' +
    '<div class="form-inline bk-actions">' +
    '<button class="btn small" data-action="export-data">⬇️ 导出备份文件</button>' +
    '<button class="btn ghost small" data-action="import-data">⬆️ 从备份恢复</button>' +
    '</div>' +
    '<p class="muted small bk-last">' + (db.lastBackup ? '上次导出：' + fmtDate(db.lastBackup) : '还没导出过备份') + '</p>' +
    '</div>';

  html += '<div class="card tip-card"><b>小提示</b><p class="muted">数据（含你上传的菜品照片）只存在这台电脑的浏览器里。照片多、存不下时会有提示，删掉几张旧照片就行。</p></div>';
  return html;
}

function drawWeightChart() {
  const host = $('#weightChart');
  if (!host) return;
  const pts = db.weights.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  if (pts.length < 2) {
    host.innerHTML = '<p class="muted pad">记两条以上体重，曲线就出来了</p>';
    return;
  }
  const W = 640, H = 240, pl = 52, pr = 26, pt = 20, pb = 36;
  const vals = pts.map(p => Number(p.kg));
  let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (max - min < 1) { const mid = (max + min) / 2; min = mid - 0.5; max = mid + 0.5; }
  const x = i => pl + (W - pl - pr) * (i / (pts.length - 1));
  const y = v => pt + (H - pt - pb) * (1 - (v - min) / (max - min));

  let g = '';
  for (let k = 0; k <= 3; k++) {
    const v = min + (max - min) * k / 3;
    const yy = y(v);
    g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" class="grid"/>' +
      '<text x="' + (pl - 8) + '" y="' + (yy + 4).toFixed(1) + '" class="axis" text-anchor="end">' + (Math.round(v * 10) / 10) + '</text>';
  }
  let path = '';
  let dots = '';
  pts.forEach((p, i) => {
    const px = x(i), py = y(Number(p.kg));
    path += (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
    dots += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4" class="dot"/>';
  });
  const first = pts[0], last = pts[pts.length - 1];
  dots += '<text x="' + (x(pts.length - 1)) + '" y="' + (y(Number(last.kg)) - 10) + '" class="axis strong" text-anchor="end">' + last.kg + 'kg</text>';
  const xl = '<text x="' + pl + '" y="' + (H - 10) + '" class="axis">' + first.date.slice(5) + '</text>' +
    '<text x="' + (W - pr) + '" y="' + (H - 10) + '" class="axis" text-anchor="end">' + last.date.slice(5) + '</text>';

  host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
    g + '<path d="' + path + '" class="line"/>' + dots + xl + '</svg>';
}

/* ---------- 弹窗：记一笔 / 记体重 ---------- */
function openExpense(date) {
  const html = '<div class="modal-head"><h3>记一笔</h3><button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<div class="form">' +
    '<div class="form-row"><label>日期</label><input id="mExpDate" type="date" value="' + date + '"></div>' +
    '<div class="form-row"><label>金额</label><input id="mExpAmt" type="number" step="0.1" placeholder="0.00"></div>' +
    '<div class="form-row"><label>买了什么</label><input id="mExpName" placeholder="比如 菜市场买菜"></div>' +
    '<div class="form-row"><label>分类</label><select id="mExpCat"><option>买菜</option><option>外卖</option><option>运动</option><option>生活</option><option>其他</option></select></div>' +
    '</div><div class="modal-foot"><button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="save-expense">记下</button></div>';
  openModal(html, { date: date });
}

function openWeight() {
  const html = '<div class="modal-head"><h3>记录体重</h3><button class="icon-btn tiny" data-action="close-modal">✕</button></div>' +
    '<div class="form"><div class="form-row"><label>日期</label><input id="mWDate" type="date" value="' + todayStr() + '"></div>' +
    '<div class="form-row"><label>体重（kg）</label><input id="mWKg" type="number" step="0.1" placeholder="比如 52.6"></div></div>' +
    '<div class="modal-foot"><button class="btn ghost" data-action="close-modal">取消</button>' +
    '<button class="btn" data-action="save-weight">记下</button></div>';
  openModal(html, {});
}

/* ---------- 渲染 ---------- */
let voiceRec = null;
function startVoice(inputId) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('这个浏览器还不支持语音输入，换 Chrome / Edge 试试'); return; }
  const input = document.getElementById(inputId);
  if (!input) { toast('找不到要填的输入框'); return; }
  if (voiceRec) { try { voiceRec.abort(); } catch (e) {} voiceRec = null; }
  const btn = document.querySelector('[data-action="voice"][data-target="' + inputId + '"]');
  const rec = new SR();
  voiceRec = rec;
  rec.lang = 'zh-CN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onstart = function () { if (btn) btn.classList.add('mic-on'); toast('听着呢，说名字就行'); };
  rec.onresult = function (e) {
    const t = String(e.results[0][0].transcript || '').replace(/[。，,.]$/, '').trim();
    if (t) {
      input.value = t;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      toast('听到了：' + t);
    }
  };
  rec.onerror = function (ev) {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('麦克风没权限，允许一下再用');
    else if (ev.error === 'no-speech') toast('没听到，再说一次');
    else toast('语音没成功，直接打字也行');
  };
  rec.onend = function () {
    if (btn) btn.classList.remove('mic-on');
    if (voiceRec === rec) voiceRec = null;
  };
  try { rec.start(); } catch (e) { toast('语音起不来，直接打字吧'); }
}

function render() {
  $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
  const fdot = document.querySelector('[data-tab="fridge"] .rail-dot');
  if (fdot) {
    const n = fridgeWarnItems().length;
    fdot.hidden = !n;
    fdot.textContent = n > 9 ? '9+' : String(n);
    fdot.title = n ? n + ' 样快到期' : '';
  }
  const map = {
    today: viewToday, week: viewWeek, blind: viewBlind, classify: viewClassify,
    recipes: viewRecipes, shopping: viewShopping, fridge: viewFridge, stats: viewStats
  };
  $('#view').innerHTML = (map[currentTab] || viewToday)();
  window.scrollTo(0, 0);
  if (currentTab === 'stats') drawWeightChart();
}

/* ---------- 事件 ---------- */
document.addEventListener('click', function (e) {
  if (e.target.classList && e.target.classList.contains('modal-mask')) { closeModal(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const ds = el.dataset;

  switch (a) {
    case 'close-modal': closeModal(); return;
    case 'voice': startVoice(ds.target); return;
    case 'add-dish': case 'add-ex':
      openPicker(ds.date || viewDate); return;
    case 'open-picker': openPicker(ds.date); return;
    case 'open-recipe': openRecipe(ds.id); return;

    /* 日期 */
    case 'day-prev':
      viewDate = ymd(addDays(parseYmd(viewDate), -1));
      activeMondayStr = mondayStr(parseYmd(viewDate));
      render(); return;
    case 'day-next':
      viewDate = ymd(addDays(parseYmd(viewDate), 1));
      activeMondayStr = mondayStr(parseYmd(viewDate));
      render(); return;
    case 'back-today':
      viewDate = todayStr();
      activeMondayStr = mondayStr(new Date());
      closeModal(); render(); return;
    case 'open-calendar': openCalendar(); return;
    case 'cal-prev': case 'cal-next': {
      const parts = calYM.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1 + (a === 'cal-next' ? 1 : -1), 1);
      calYM = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      renderCalendar(); return;
    }
    case 'cal-pick': {
      viewDate = ds.date;
      activeMondayStr = mondayStr(parseYmd(ds.date));
      closeModal(); render(); return;
    }

    case 'toggle-done': {
      const p = getPlan(ds.date);
      p.done[ds.id] = !p.done[ds.id];
      save(); render(); return;
    }
    case 'remove-dish': {
      const p = getPlan(ds.date);
      p.dishes = p.dishes.filter(x => x !== ds.id);
      save(); render(); return;
    }
    case 'remove-ex': {
      const p = getPlan(ds.date);
      p.exercises = p.exercises.filter(x => x !== ds.id);
      save(); render(); return;
    }

    case 'add-exp': openExpense(ds.date || viewDate); return;
    case 'add-weight-quick': openWeight(); return;

    case 'add-custom-ex': {
      const name = ($('#exName') || {}).value;
      const dur = ($('#exMin') || {}).value;
      const kcal = ($('#exKcal') || {}).value;
      if (!name) { toast('先填运动名字'); return; }
      const ex = { id: 'ex' + Date.now(), name: name.trim(), dur: num(dur) || 30, kcal: num(kcal) || 100, emoji: '⭐' };
      db.customExercises.push(ex);
      save();
      pickerExtra = [ex.id];
      openPicker(modalCtx.date, pickerExtra);
      pickerExtra = [];
      return;
    }

    case 'picker-save': {
      const date = modalCtx.date;
      const p = getPlan(date);
      p.dishes = $$('input[data-kind="dish"]:checked').map(i => i.value);
      p.exercises = $$('input[data-kind="ex"]:checked').map(i => i.value);
      save(); closeModal(); render(); toast('安排好了'); return;
    }

    case 'save-link': {
      const input = $('#linkInput');
      const url = input ? input.value.trim() : '';
      if (url) db.links[ds.id] = url; else delete db.links[ds.id];
      save(); toast(url ? '链接已保存' : '链接已清空'); return;
    }

    case 'del-photo': {
      delete db.photos[ds.id];
      save(); openRecipe(ds.id); toast('照片已删除'); return;
    }
    case 'recipe-art-pick':
      openRecipeArt(ds.id); return;
    case 'recipe-art-set':
      db.recipeIcons[ds.id] = ds.e;
      save(); openRecipe(ds.id); render(); toast('图案换好了'); return;
    case 'recipe-art-reset':
      delete db.recipeIcons[ds.id];
      save(); openRecipe(ds.id); render(); toast('用回默认图案了'); return;

    case 'detail-add': {
      const sel = $('#addDate');
      const date = sel ? sel.value : todayStr();
      const p = getPlan(date);
      if (p.dishes.indexOf(ds.id) < 0) p.dishes.push(ds.id);
      save(); closeModal(); render(); toast('已加入 ' + fmtDate(date)); return;
    }

    case 'delete-recipe': {
      db.customRecipes = db.customRecipes.filter(r => r.id !== ds.id);
      delete db.photos[ds.id];
      Object.keys(db.plan).forEach(k => {
        db.plan[k].dishes = (db.plan[k].dishes || []).filter(id => id !== ds.id);
      });
      save(); closeModal(); render(); toast('已删除'); return;
    }

    case 'new-recipe': openNewRecipe(); return;

    case 'save-recipe': {
      const data = readRecipeForm();
      if (!data) return;
      const r = Object.assign({ id: 'c' + Date.now() }, data);
      db.customRecipes.push(r);
      if (pendingPhoto) { db.photos[r.id] = pendingPhoto; pendingPhoto = null; }
      const ok = save();
      closeModal();
      currentTab = 'recipes'; render();
      toast(ok ? '菜谱已添加，热量是按食材自动算的' : '菜谱已添加，但照片没存下');
      return;
    }

    case 'edit-recipe': openRecipeEdit(ds.id); return;

    case 'edit-recipe-save': {
      const data = readRecipeForm();
      if (!data) return;
      db.recipeEdits[ds.id] = data;
      const ok = save();
      closeModal();
      render();
      toast(ok ? '改好了' : '没存下，空间可能不够');
      return;
    }

    case 'edit-recipe-reset': {
      delete db.recipeEdits[ds.id];
      save();
      openRecipeForm('edit', ds.id);
      toast('已恢复成原来的内容');
      return;
    }

    /* 食材点选 */
    case 'ing-add': {
      const name = ds.k;
      const exists = formIngs.filter(x => x.name === name)[0];
      if (exists) exists.mult += 1;
      else formIngs.push(buildFormIng({ n: name }));
      updateIngUI();
      return;
    }
    case 'ing-inc': {
      const i = Number(ds.idx);
      if (formIngs[i]) { formIngs[i].mult += 1; updateIngUI(); }
      return;
    }
    case 'ing-dec': {
      const i = Number(ds.idx);
      if (formIngs[i]) {
        formIngs[i].mult -= 1;
        if (formIngs[i].mult < 1) formIngs.splice(i, 1);
        updateIngUI();
      }
      return;
    }
    case 'ing-del': {
      formIngs.splice(Number(ds.idx), 1);
      updateIngUI();
      return;
    }
    case 'ing-cat': {
      formIngCat = ds.k;
      $$('.ing-cat-row .chip').forEach(c => c.classList.toggle('chip-on', c.dataset.k === formIngCat));
      const grid = $('#ingGrid'); if (grid) grid.innerHTML = ingGridHTML();
      return;
    }
    case 'ing-recalc': {
      formIngs.forEach(x => {
        const di = findIng(x.name);
        if (!di) return;
        x.know = true; x.known = true;
        x.emoji = di.e; x.unit = di.u; x.kcal = di.kcal; x.p = di.p; x.c = di.c; x.f = di.f;
        x.price = di.price; x.cat = di.cat;
      });
      updateIngUI();
      toast('已按食材库重算');
      return;
    }
    case 'ing-custom-add': {
      const el = $('#ingCustomName');
      const name = (el ? el.value : '').trim();
      if (!name) { toast('先写食材名字'); return; }
      if (formIngs.some(x => x.name === name)) { toast('已经加过了'); return; }
      formIngs.push(buildFormIng({ n: name }));
      if (el) el.value = '';
      updateIngUI();
      return;
    }

    case 'filter': recipeFilter = ds.k; render(); return;

    /* 盲盒 */
    case 'goto-blind':
      currentTab = 'blind'; render();
      if (!blindResult.length) drawBlind();
      return;
    case 'blind-draw': drawBlind(); return;
    case 'blind-mode':
      blindMode = ds.k;
      blindResult = [];
      render(); return;
    case 'blind-kw': {
      const kw = ds.k;
      const cur = blindQuery.trim();
      if (cur.split(/[\s,，、+]+/).filter(Boolean).indexOf(kw) >= 0) return;
      blindQuery = (cur ? cur + ' ' : '') + kw;
      render();
      const box = $('#blindQuery');
      if (box) { box.focus(); }
      return;
    }
    case 'blind-count-inc':
      blindCount = Math.min(5, blindCount + 1); render(); return;
    case 'blind-count-dec':
      blindCount = Math.max(1, blindCount - 1); render(); return;
    case 'blind-add': {
      const sel = $('#blindDate');
      const date = sel ? sel.value : todayStr();
      const p = getPlan(date);
      blindResult.forEach(r => { if (p.dishes.indexOf(r.id) < 0) p.dishes.push(r.id); });
      save(); render(); toast('已加入 ' + fmtDate(date) + '，共 ' + blindResult.length + ' 道');
      return;
    }

    /* 分类 */
    case 'class-cat':
      classCat = (classCat === ds.k) ? '' : ds.k;
      render(); return;
    case 'class-ing':
      classIng = (classIng === ds.k) ? '' : ds.k;
      render(); return;
    case 'class-clear':
      classCat = ''; classIng = ''; render(); return;
    case 'class-edit': openCatEditor(ds.k); return;
    case 'class-new': openNewCat(); return;
    case 'class-save': {
      const k = ds.k;
      const nameEl = $('#catEditName');
      const iconEl = $('#catEditIcon');
      const label = (nameEl ? nameEl.value : '').trim();
      const icon = (iconEl ? iconEl.value : '').trim() || '📌';
      if (label) {
        db.catOverride[k] = { label: label, icon: icon };
      }
      const checked = {};
      $$('input[data-cat="' + k + '"]').forEach(i => { if (i.checked) checked[i.value] = true; });
      const adj = { add: [], remove: [] };
      allRecipes().forEach(r => {
        const on = !!checked[r.id];
        const base = catBase(r, k);
        if (on && !base) adj.add.push(r.id);
        if (!on && base) adj.remove.push(r.id);
      });
      db.catAdj[k] = adj;
      save(); closeModal(); render(); toast('分类已更新');
      return;
    }
    case 'class-hide': {
      db.catHidden = db.catHidden || [];
      if (db.catHidden.indexOf(ds.k) < 0) db.catHidden.push(ds.k);
      if (classCat === ds.k) classCat = '';
      save(); closeModal(); render(); toast('分类已隐藏，可在下面恢复');
      return;
    }
    case 'class-restore': {
      db.catHidden = [];
      save(); render(); toast('已恢复所有分类');
      return;
    }
    case 'class-create': {
      const name = ($('#catName') || {}).value.trim();
      const icon = (($('#catIcon') || {}).value || '📌').trim() || '📌';
      if (!name) { toast('先填分类名字'); return; }
      if (allCats().some(c => c.label === name)) { toast('这个分类已经有啦'); return; }
      db.cats.push({ k: 'cat' + Date.now(), label: name, icon: icon });
      save(); closeModal(); currentTab = 'classify'; render(); toast('分类已创建，点 ✎ 加菜进去');
      return;
    }
    case 'class-del': {
      const k = ds.k;
      db.cats = db.cats.filter(c => c.k !== k);
      delete db.catAdj[k];
      if (classCat === k) classCat = '';
      save(); closeModal(); render(); toast('分类已删除');
      return;
    }

    case 'week-prev': activeMondayStr = ymd(addDays(parseYmd(activeMondayStr), -7)); viewDate = activeMondayStr; render(); return;
    case 'week-next': activeMondayStr = ymd(addDays(parseYmd(activeMondayStr), 7)); viewDate = activeMondayStr; render(); return;
    case 'week-now': activeMondayStr = mondayStr(new Date()); viewDate = todayStr(); render(); return;
    case 'goto-shopping': currentTab = 'shopping'; render(); return;

    case 'shop-day-prev':
      shopDate = ymd(addDays(parseYmd(shopDate), -1)); render(); return;
    case 'shop-day-next':
      shopDate = ymd(addDays(parseYmd(shopDate), 1)); render(); return;
    case 'shop-day-today':
      shopDate = todayStr(); render(); return;
    case 'shop-toggle': {
      db.shopChecked[shopDate] = db.shopChecked[shopDate] || {};
      db.shopChecked[shopDate][ds.key] = !db.shopChecked[shopDate][ds.key];
      save(); render(); return;
    }
    case 'shop-clear':
      db.shopChecked[shopDate] = {};
      save(); render(); return;
    case 'shop-add':
      openShopForm(shopDate, ''); return;
    case 'shop-ocr-open':
      openShopOcr(); return;
    case 'shop-ocr-start':
      runShopOcr(); return;
    case 'shop-ocr-again':
      ocrImg = ''; ocrRows = []; ocrStage = 'pick'; renderShopOcr(); return;
    case 'shop-ocr-confirm': {
      const picks = ocrRows.filter(function (r) { return r.on; });
      if (!picks.length) { toast('至少勾一样'); return; }
      picks.forEach(function (r) { shopAddItem(shopDate, r.n, r.q, null, null); });
      save(); closeModal(); render();
      toast('识别结果加进 ' + shopDate + ' 的清单了：' + picks.length + ' 样');
      return;
    }
    case 'fridge-ocr':
      runFridgeOcr(); return;
    case 'shop-edit':
      openShopForm(shopDate, ds.key); return;
    case 'shop-save': {
      const date = modalCtx.date || shopDate;
      const old = modalCtx.name || '';
      const name = (($('#shopName') || {}).value || '').trim();
      const q = (($('#shopQ') || {}).value || '').trim() || '1份';
      const rawPrice = (($('#shopPrice') || {}).value);
      const cat = (($('#shopCat') || {}).value) || '其他';
      if (!name) { toast('写个名字'); return; }
      if (old) {
        const arr = db.shopDays[date] || [];
        const it = arr.filter(x => x.n === old)[0];
        if (it) {
          it.n = name;
          it.q = q;
          it.price = Number(rawPrice || 0);
          it.cat = cat;
        }
      } else {
        shopAddItem(date, name, q, rawPrice, cat);
      }
      save(); closeModal(); render(); toast('记到 ' + ((parseYmd(date).getMonth() + 1) + '月' + parseYmd(date).getDate() + '日') + ' 了'); return;
    }
    case 'shop-del': {
      db.shopDays[shopDate] = shopList(shopDate).filter(x => x.n !== ds.key);
      if (db.shopChecked[shopDate]) delete db.shopChecked[shopDate][ds.key];
      save(); render(); toast('删掉了'); return;
    }
    case 'shop-to-fridge': {
      const it = shopList(shopDate).filter(x => x.n === ds.key)[0];
      putInFridge(ds.key, 1, it ? (it.q || '') : '');
      return;
    }
    case 'shop-copy': {
      const list = shopList(shopDate);
      const d = parseYmd(shopDate);
      let txt = '买菜清单 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日\n';
      CAT_ORDER.forEach(cat => {
        const items = list.filter(it => (it.cat || '其他') === cat);
        if (!items.length) return;
        txt += '\n【' + cat + '】\n';
        items.forEach(it => { txt += '- ' + it.n + ' ' + (it.q || '') + '  ¥' + money(it.price) + '\n'; });
      });
      txt += '\n合计约 ¥' + money(list.reduce((s, i) => s + Number(i.price || 0), 0));
      copyText(txt);
      return;
    }
    case 'shop-import-open':
      shopPicks = []; openShopImport(shopDate); return;
    case 'shop-import-toggle': {
      const id = ds.id;
      const i = shopPicks.indexOf(id);
      if (i >= 0) shopPicks.splice(i, 1); else shopPicks.push(id);
      openShopImport(shopDate); return;
    }
    case 'shop-import-confirm': {
      const picks = shopPicks.slice();
      if (!picks.length) { toast('先勾几道菜'); return; }
      picks.forEach(id => {
        const r = recipeById(id);
        if (!r) return;
        (r.ing || []).forEach(g => shopAddItem(shopDate, g.n, g.q, g.p, g.cat));
      });
      save(); shopPicks = []; closeModal(); render();
      toast('从菜单挑了 ' + picks.length + ' 道菜的食材'); return;
    }
    /* 冰箱 */
    case 'fridge-add-open':
      fridgePick = ''; fridgePickQty = 1; fridgeQuery = ''; fridgeCat = '全部';
      fridgeBuyDate = todayStr(); fridgeExpireDate = ''; fridgePhoto = '';
      fridgePickCat = ''; fridgeCustomName = '';
      openFridgeAdd(); return;
    case 'fridge-source':
      fridgeSource = ds.k; openFridgeAdd(); return;
    case 'fridge-cat':
      fridgeCat = ds.k; openFridgeAdd(); return;
    case 'fridge-pick': {
      fridgePick = ds.n;
      fridgePickQty = fridgePickQty || 1;
      const ing = findIng(ds.n);
      fridgePickCat = fridgeCatKey(ing ? ing.cat : '');
      openFridgeAdd(); return;
    }
    case 'fridge-fcat':
      fridgePickCat = ds.k; openFridgeAdd(); return;
    case 'fr-filter':
      fridgeCatFilter = ds.k; render(); return;
    case 'fridge-set-cat': {
      const it = db.fridge.filter(x => x.id === ds.id)[0];
      if (it) { it.fcat = fridgeCatKey(ds.k); save(); openFridgeItem(ds.id); render(); toast('归到' + it.fcat + '了'); }
      return;
    }
    case 'fridge-qty-inc':
      fridgePickQty = Math.min(99, fridgePickQty + 1); openFridgeAdd(); return;
    case 'fridge-qty-dec':
      fridgePickQty = Math.max(1, fridgePickQty - 1); openFridgeAdd(); return;
    case 'fridge-exp-quick':
      fridgeExpireDate = expedDate(ds.d);
      openFridgeAdd(); return;
    case 'fridge-exp-clear':
      fridgeExpireDate = '';
      openFridgeAdd(); return;
    case 'fridge-custom': {
      const v = (($('#fridgeCustom') || {}).value || '').trim();
      if (!v) { toast('先写个食材名字'); return; }
      const b = ($('#fridgeBuyDate') || {}).value || fridgeBuyDate || todayStr();
      const e = ($('#fridgeExpire') || {}).value || fridgeExpireDate || '';
      putInFridge(v, fridgePickQty, '', b, e, fridgePhoto, fridgePickCat || '其他类'); return;
    }
    case 'fridge-confirm': {
      if (!fridgePick) { toast('先选一样食材'); return; }
      let note = '';
      if (fridgeSource === 'week') {
        const it = collectIngredients(activeMondayStr).filter(x => x.n === fridgePick)[0];
        if (it) note = it.q.join(' / ');
      }
      const b = ($('#fridgeBuyDate') || {}).value || fridgeBuyDate || todayStr();
      const e = ($('#fridgeExpire') || {}).value || fridgeExpireDate || '';
      putInFridge(fridgePick, fridgePickQty, note, b, e, fridgePhoto, fridgePickCat); return;
    }
    case 'fridge-save-dates': {
      const it = db.fridge.filter(x => x.id === ds.id)[0];
      if (!it) { closeModal(); return; }
      it.buyDate = ($('#fridgeEditBuy') || {}).value || it.buyDate || todayStr();
      const nextExp = ($('#fridgeEditExp') || {}).value || '';
      if (nextExp !== (it.expireDate || '')) it.muteExp = '';
      it.expireDate = nextExp;
      save(); openFridgeItem(ds.id); render();
      toast('日期改好了'); return;
    }
    case 'fridge-mute': {
      const it = db.fridge.filter(x => x.id === ds.id)[0];
      if (it) { it.muteExp = it.expireDate; save(); openFridgeItem(ds.id); render(); toast('这次不提醒了，改保质期会重新提醒'); }
      return;
    }
    case 'fridge-unmute': {
      const it = db.fridge.filter(x => x.id === ds.id)[0];
      if (it) { it.muteExp = ''; save(); openFridgeItem(ds.id); render(); toast('又开始提醒了'); }
      return;
    }
    case 'fridge-photo-clear':
      fridgePhoto = ''; openFridgeAdd(); return;
    case 'fridge-photo-del': {
      const it = db.fridge.filter(x => x.id === ds.id)[0];
      if (it) { it.photo = ''; save(); openFridgeItem(ds.id); render(); toast('照片删掉了'); }
      return;
    }
    case 'fridge-item': openFridgeItem(ds.id); return;
    case 'fridge-eat': eatFridge(ds.id); return;
    case 'fridge-inc': {
      const it = db.fridge.filter(x => x.id === ds.id)[0];
      if (it) { it.qty = num(it.qty) + 1; save(); openFridgeItem(ds.id); render(); }
      return;
    }
    case 'fridge-dec': {
      const it = db.fridge.filter(x => x.id === ds.id)[0];
      if (it) { it.qty = Math.max(1, num(it.qty) - 1); save(); openFridgeItem(ds.id); render(); }
      return;
    }
    case 'fridge-remove': {
      const it = db.fridge.filter(x => x.id === ds.id)[0];
      db.fridge = db.fridge.filter(x => x.id !== ds.id);
      save(); closeModal(); render();
      if (it) toast(it.n + ' 从冰箱拿走了');
      return;
    }
    case 'fridge-tidy': {
      fridgeSource = 'week'; fridgePick = ''; fridgePickQty = 1;
      openFridgeAdd(); return;
    }

    case 'spend-range': spendRange = ds.k; render(); return;
    case 'export-data': exportBackup(); return;
    case 'import-data': pickBackupFile(); return;
    case 'import-merge': doImport('merge'); return;
    case 'import-cover': doImport('cover'); return;

    case 'add-expense': {
      const date = ($('#expDate') || {}).value || todayStr();
      const amt = Number(($('#expAmt') || {}).value);
      const name = (($('#expName') || {}).value || '').trim() || '未命名';
      const cat = ($('#expCat') || {}).value || '其他';
      if (!amt) { toast('金额填一下'); return; }
      db.expenses.push({ date: date, amount: amt, name: name, cat: cat });
      save(); render(); toast('已记录 ¥' + money(amt)); return;
    }

    case 'save-expense': {
      const date = ($('#mExpDate') || {}).value || todayStr();
      const amt = Number(($('#mExpAmt') || {}).value);
      const name = (($('#mExpName') || {}).value || '').trim() || '未命名';
      const cat = ($('#mExpCat') || {}).value || '其他';
      if (!amt) { toast('金额填一下'); return; }
      db.expenses.push({ date: date, amount: amt, name: name, cat: cat });
      save(); closeModal(); render(); toast('已记一笔'); return;
    }

    case 'del-exp':
      db.expenses.splice(Number(ds.idx), 1);
      save(); render(); return;
    case 'del-weight':
      db.weights = db.weights.filter(w => w.date !== ds.date);
      save(); render(); return;
    case 'add-weight': {
      const date = ($('#wDate') || {}).value || todayStr();
      const kg = Number(($('#wKg') || {}).value);
      if (!kg) { toast('体重填一下'); return; }
      db.weights = db.weights.filter(w => w.date !== date);
      db.weights.push({ date: date, kg: Math.round(kg * 10) / 10 });
      save(); render(); toast('已记录 ' + kg + ' kg'); return;
    }
    case 'save-weight': {
      const date = ($('#mWDate') || {}).value || todayStr();
      const kg = Number(($('#mWKg') || {}).value);
      if (!kg) { toast('体重填一下'); return; }
      db.weights = db.weights.filter(w => w.date !== date);
      db.weights.push({ date: date, kg: Math.round(kg * 10) / 10 });
      save(); closeModal(); render(); toast('已记录 ' + kg + ' kg'); return;
    }
  }
});

/* 搜索框：中文输入法打字时不要中途重绘，否则拼音会被截成英文 */
let recipeComposing = false;
document.addEventListener('compositionstart', function (e) {
  if (e.target && ['recipeSearch', 'ingSearch', 'blindQuery'].indexOf(e.target.id) >= 0) recipeComposing = true;
});
document.addEventListener('compositionend', function (e) {
  if (e.target && ['recipeSearch', 'ingSearch', 'blindQuery'].indexOf(e.target.id) >= 0) {
    recipeComposing = false;
    if (e.target.id === 'recipeSearch') { recipeQuery = e.target.value; updateRecipeGrid(); }
    if (e.target.id === 'ingSearch') {
      formIngQuery = e.target.value;
      const grid = $('#ingGrid');
      if (grid) grid.innerHTML = ingGridHTML();
    }
    if (e.target.id === 'blindQuery') blindQuery = e.target.value;
  }
});
document.addEventListener('input', function (e) {
  if (e.target.id === 'recipeSearch') {
    if (recipeComposing || e.isComposing) return;
    recipeQuery = e.target.value;
    updateRecipeGrid();
  }
  if (e.target.id === 'ingSearch') {
    if (recipeComposing || e.isComposing) return;
    formIngQuery = e.target.value;
    const grid = $('#ingGrid');
    if (grid) grid.innerHTML = ingGridHTML();
  }
  if (e.target.id === 'fridgeSearch') {
    if (recipeComposing || e.isComposing) return;
    fridgeQuery = e.target.value;
    const fg = $('#fridgeGrid');
    if (fg) fg.innerHTML = fridgeGridHTML();
  }
  if (e.target.id === 'blindQuery') {
    blindQuery = e.target.value;
  }
  if (e.target.id === 'fridgeCustom') {
    fridgeCustomName = e.target.value;
  }
});

/* 照片选择 */
document.addEventListener('change', function (e) {
  const el = e.target;
  if (el.id === 'fridgeBuyDate') fridgeBuyDate = el.value;
  if (el.id === 'fridgeExpire') fridgeExpireDate = el.value;
  if (el.id === 'fridgePhotoInput' && el.files && el.files[0]) addFridgePhoto(el.files[0]);
  if (el.id === 'shopOcrInput' && el.files && el.files[0]) pickShopOcrPhoto(el.files[0]);
  if (el.id === 'fridgeEditPhoto' && el.files && el.files[0]) setFridgePhoto(modalCtx.id, el.files[0]);
  if (el.id === 'photoInput' && el.files && el.files[0]) {
    attachRecipePhoto(el.files[0]);
  }
  if (el.id === 'rcPhoto' && el.files && el.files[0]) {
    previewNewRecipePhoto(el.files[0]);
  }
  if (el.dataset && el.dataset.ocrI !== undefined) {
    const i = Number(el.dataset.ocrI);
    if (ocrRows[i]) ocrRows[i].on = !!el.checked;
    const row = el.closest('.ocr-row');
    if (row) row.classList.toggle('on', !!el.checked);
    const btn = document.querySelector('[data-action="shop-ocr-confirm"]');
    if (btn) btn.textContent = '加入清单（' + ocrRows.filter(function (r) { return r.on; }).length + '）';
  }
});

async function addFridgePhoto(file) {
  toast('正在处理照片…');
  let data;
  try { data = await compressImage(file, 560, 0.62); }
  catch (e) { toast('这张照片读不出来，换一张试试'); return; }
  fridgePhoto = data;
  openFridgeAdd();
  toast('照片选好了，写个名字就能放进去');
}
async function setFridgePhoto(id, file) {
  const it = db.fridge.filter(x => x.id === id)[0];
  if (!it) return;
  toast('正在处理照片…');
  let data;
  try { data = await compressImage(file, 560, 0.62); }
  catch (e) { toast('这张照片读不出来'); return; }
  it.photo = data;
  if (!save()) return;
  openFridgeItem(id); render();
  toast('照片换好了');
}

async function attachRecipePhoto(file) {
  const id = modalCtx.id;
  if (!id) return;
  toast('正在处理照片…');
  let data;
  try { data = await compressImage(file, 820, 0.72); }
  catch (err) { toast('这张照片读不出来，换一张试试'); return; }
  const prev = db.photos[id];
  db.photos[id] = data;
  if (!save()) {
    if (prev) db.photos[id] = prev; else delete db.photos[id];
    return;
  }
  openRecipe(id);
  toast('照片已保存');
}

async function previewNewRecipePhoto(file) {
  try {
    const data = await compressImage(file, 820, 0.72);
    pendingPhoto = data;
    const box = $('#rcPhotoPrev');
    if (box) box.innerHTML = '<img src="' + data + '" alt=""><span class="muted small">已选好，保存菜谱时会一起存下</span>';
    toast('照片已就绪');
  } catch (e) { toast('这张照片读不出来'); }
}

function copyText(txt) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => toast('已复制到剪贴板'), () => fallbackCopy(txt));
  } else fallbackCopy(txt);
}
function fallbackCopy(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('已复制到剪贴板'); } catch (e) { toast('复制失败，请手动复制'); }
  document.body.removeChild(ta);
}

/* ---------- 启动 ---------- */
document.addEventListener('click', function (e) {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  currentTab = b.dataset.tab;
  render();
});

initDB();

/* 支持用地址栏 #today / #week / #recipes / #shopping / #stats 直接打开某个页面 */
(function () {
  const h = (location.hash || '').replace('#', '');
  if (['today', 'week', 'blind', 'classify', 'recipes', 'shopping', 'fridge', 'stats'].indexOf(h) >= 0) currentTab = h;
})();

render();

/* 放到 https 上时注册离线缓存，装到手机后没网也能打开 */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  });
}


