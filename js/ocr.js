/* 本地识图：Tesseract.js 中文 OCR（引擎与字库都放在 vendor/tesseract，断网也能用） */
let ocrWorkerPromise = null;
let ocrLogger = null;

function ocrSupported() {
  return !!window.Tesseract;
}

function ocrWorker() {
  if (!ocrSupported()) return Promise.reject(new Error('引擎没加载'));
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker('chi_sim', 1, {
      workerPath: 'vendor/tesseract/worker.min.js',
      corePath: 'vendor/tesseract/',
      langPath: 'vendor/tesseract/lang',
      logger: function (m) {
        if (ocrLogger) ocrLogger(m);
      }
    }).catch(function (e) {
      ocrWorkerPromise = null;
      throw e;
    });
  }
  return ocrWorkerPromise;
}

async function ocrImage(dataUrl, onProgress) {
  const w = await ocrWorker();
  ocrLogger = onProgress || null;
  const res = await w.recognize(dataUrl);
  ocrLogger = null;
  return (res && res.data && res.data.text) || '';
}

/* ---------- 文本清洗与解析 ---------- */
const OCR_SKIP = ['合计', '总计', '小计', '金额', '应付', '实付', '优惠', '折扣', '配送', '运费', '订单',
  '日期', '时间', '电话', '地址', '谢谢', '欢迎', '小票', '购物车', '超市', '发票', '税', '会员', '积分',
  '数量', '单价', '规格', '备注', '支付', '收款', '找零', '清单'];

function ocrClean(s) {
  let t = String(s || '')
    .replace(/[\u3000]/g, ' ')
    .replace(/^[\s\-—•·*√✓☑□■○●>》]+/, '')
    .replace(/^\s*\d+\s*[.、)．]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/(¥|￥)\s*\d+(?:\.\d+)?/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*元/g, ' ')
    .replace(/[（(]\s*[)）]/g, ' ')
    .replace(/^[\s:：,，、.。-]+/, '')
    .replace(/[\s:：,，、.。-]+$/, '');
  /* OCR 常在汉字之间塞空格，去掉它们，但保留「数字 + 单位」原有的紧挨形式 */
  for (let k = 0; k < 2; k++) {
    t = t.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
  }
  t = t.replace(/\s+([\u4e00-\u9fa5])/g, '$1').replace(/([\u4e00-\u9fa5])\s+/g, '$1');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function ocrQty(s) {
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*(个|颗|斤|公斤|千克|克|g|kg|盒|袋|包|把|根|条|块|瓶|杯|份|只|升|L|ml|毫升|张|罐|捆)/i);
  if (!m) return { q: '', rest: s };
  return { q: m[1] + m[2], rest: String(s).replace(m[0], ' ') };
}

function ocrShouldSkip(line) {
  if (!line) return true;
  if (line.length > 14) return true;
  if (!/[\u4e00-\u9fa5a-zA-Z]/.test(line)) return true;
  return OCR_SKIP.some(function (k) { return line.indexOf(k) >= 0; });
}

/* 把 OCR 出来的整段文字拆成「要买的东西」 */
function ocrParseShopping(text) {
  const out = [];
  const seen = {};
  const lines = String(text || '').split(/\r?\n+/);
  lines.forEach(function (raw) {
    let line = ocrClean(raw);
    if (!line) return;
    let parts = line.split(/[、,，;；/]/).map(ocrClean).filter(Boolean);
    if (parts.length > 1) {
      // 一行里塞了好几样，且每段都短，才拆开
      if (parts.every(function (p) { return p.length <= 8; })) line = null;
      else parts = [line];
    }
    (line ? [line] : parts).forEach(function (seg) {
      let name = ocrClean(seg);
      if (ocrShouldSkip(name)) return;
      const got = ocrQty(name);
      name = ocrClean(got.rest);
      name = name.replace(/^(买|要买|还要|再来|加上)\s*/, '');
      if (!name || ocrShouldSkip(name)) return;
      if (seen[name]) {
        if (got.q) seen[name].q = got.q;
        return;
      }
      const ing = findIng(name);
      const row = { n: name, q: got.q || '1份', ico: ing ? ing.e : '🥡', cat: ing ? ing.cat : '其他', on: true };
      seen[name] = row;
      out.push(row);
    });
  });
  return out.slice(0, 40);
}

/* 冰箱照片：从文字里猜一个食材名字 */
function ocrParseName(text) {
  const lines = String(text || '').split(/\r?\n+/);
  for (let i = 0; i < lines.length; i++) {
    let s = ocrClean(lines[i]);
    if (!s || s.length > 10) continue;
    s = ocrClean(ocrQty(s).rest);
    if (!s || ocrShouldSkip(s)) continue;
    const ing = findIng(s);
    if (ing) return ing.n;
    if (/^[\u4e00-\u9fa5]{2,6}$/.test(s)) return s;
  }
  return '';
}
