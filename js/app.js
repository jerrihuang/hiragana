/* ===== 平假名描紅練習 · 主程式 ===== */
(function () {
  'use strict';

  // ---------- 小工具 ----------
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const measure = $('measure');
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const dist = (a, b) => Math.sqrt(dist2(a, b));

  // 描紅判定容忍度（座標系 109 x 109，數字越大越寬鬆）
  const START_TOL = 27;   // 起筆可以離 ① 多遠
  const COVER_TOL = 21;   // 判定「有描到」的距離
  const COVER_MIN = 0.58; // 至少要覆蓋筆畫的比例
  const END_TOL = 30;     // 收筆可以離終點多遠

  // ---------- 進度儲存 ----------
  const SAVE_KEY = 'hiragana_trace_v1';
  // script：五十音表當前顯示的是平／片假名。gameScript：遊戲選單當前練習的分類，
  // 兩者分開存，因為遊戲可以選「數字」「時間星期」，但五十音表沒有這兩個分頁。
  let state = { mastered: [], script: 'hira', gameScript: 'hira' };
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && Array.isArray(s.mastered)) state = s;
    } catch (e) { /* 忽略 */ }
    if (state.script !== 'kata') state.script = 'hira';
    if (!KANA_ORDER[state.gameScript]) state.gameScript = 'hira';
  }
  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }
  const isMastered = (c) => state.mastered.includes(c);
  function markMastered(c) {
    if (!isMastered(c)) { state.mastered.push(c); saveState(); }
  }
  // 目前選的字母表與其順序（五十音表用，僅平／片假名）
  const curOrder = () => KANA_ORDER[state.script];
  // 一個字屬於哪個分類（hira/kata/numbers/time）；用來決定「下一個字」清單、
  // 完成後要回哪個列表頁。比 scriptOf 更廣，涵蓋假名以外的數字／時間星期。
  function categoryOf(ch) {
    const keys = Object.keys(KANA_ORDER);
    for (let i = 0; i < keys.length; i++) {
      if (KANA_ORDER[keys[i]].indexOf(ch) >= 0) return keys[i];
    }
    return 'hira';
  }
  // 目前內容總字數（平＋片假名＋數字＋時間星期＋月份＋日期）；用來判斷分身是否已達現階段上限
  const TOTAL_NOW = KANA_ORDER.hira.length + KANA_ORDER.kata.length +
    KANA_ORDER.numbers.length + KANA_ORDER.time.length +
    KANA_ORDER.months.length + KANA_ORDER.dates.length;
  let pendingEvolve = null; // 這次完成是否讓菜鳥升級
  // 目前要慶祝（花丸彈窗）的字：描紅完成時＝那個假名；數字/時間星期按「我學會了」時＝那個漢字
  let celebrateChar = null;

  // ---------- 路徑取樣（用隱藏 SVG 算座標） ----------
  const sampleCache = {};
  function samplePath(d) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    measure.appendChild(p);
    const len = p.getTotalLength();
    const n = Math.max(10, Math.round(len / 1.4));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const pt = p.getPointAtLength((len * i) / n);
      pts.push([pt.x, pt.y]);
    }
    measure.removeChild(p);
    return { pts, len };
  }
  function strokesOf(char) {
    if (sampleCache[char]) return sampleCache[char];
    const s = KANA[char].strokes.map((d) => Object.assign({ d }, samplePath(d)));
    sampleCache[char] = s;
    return s;
  }

  // ---------- 畫布 ----------
  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const size = Math.round(rect.width);
    if (size === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    const s = (size * dpr) / 109;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    return ctx;
  }
  function clearCtx(ctx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 99999, 99999);
    ctx.restore();
  }
  function strokePath(ctx, d, color, width) {
    const path = new Path2D(d);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }
  function polyline(ctx, pts, color, width, alpha) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 在筆畫起點畫上編號 ①②③
  function drawNumber(ctx, stroke, n, color) {
    const p0 = stroke.pts[0];
    const p1 = stroke.pts[Math.min(3, stroke.pts.length - 1)];
    let dx = p0[0] - p1[0], dy = p0[1] - p1[1];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    let bx = p0[0] + dx * 8, by = p0[1] + dy * 8;
    bx = Math.max(6, Math.min(103, bx));
    by = Math.max(6, Math.min(103, by));
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 6.4px "Zen Maru Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), bx, by + 0.3);
    ctx.restore();
  }
  // 目前這一畫的起筆提示點
  function drawStartDot(ctx, stroke, color) {
    const p = stroke.pts[0];
    ctx.save();
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4.2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p[0], p[1], 7.5, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 發音（Web Speech API） ----------
  let jaVoice = null;
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const v = speechSynthesis.getVoices();
    jaVoice = v.find((x) => /ja[-_]?JP/i.test(x.lang)) ||
              v.find((x) => x.lang && x.lang.toLowerCase().startsWith('ja')) || null;
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  const AUDIO_BASE = 'audio/';
  // 把羅馬拼音轉成乾淨的 ASCII 檔名（去掉長音符號，如 kēki → keki）
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  let sayTimer = null;
  let curAudio = null;

  // 系統內建語音（沒有音檔時的備援）
  function ttsSpeak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }

  // 優先播放預先準備好的音檔；找不到（或播放失敗）才退回系統語音。前面停 0.5 秒。
  function playSound(file, fallbackText) {
    clearTimeout(sayTimer);
    if (curAudio) { try { curAudio.pause(); } catch (e) { /* 忽略 */ } curAudio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    sayTimer = setTimeout(() => {
      let handled = false;
      const fallback = () => { if (!handled) { handled = true; ttsSpeak(fallbackText); } };
      const a = new Audio(file);
      curAudio = a;
      a.addEventListener('error', fallback);
      const p = a.play();
      if (p && p.catch) p.catch(fallback);
    }, 500);
  }

  // 假名發音：あ/ア 等同音共用一個檔（依羅馬拼音）；找不到就用系統語音唸該字
  const speakKana = (ch) => playSound(AUDIO_BASE + 'kana/' + KANA[ch].romaji + '.mp3', ch);
  // 單字發音
  const speakWord = (ch) => {
    const w = KANA[ch].word;
    if (w) playSound(AUDIO_BASE + 'word/' + slug(w.r) + '.mp3', w.k);
  };

  // ---------- 視圖切換 ----------
  function show(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $('view-' + view).classList.add('active');
    window.scrollTo(0, 0);
  }

  // ---------- 首頁：畫一張假名表 ----------
  function renderKanaTable(el, rows) {
    el.innerHTML = '';
    rows.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      const label = document.createElement('div');
      label.className = 'row-label';
      label.textContent = row.label;
      rowEl.appendChild(label);
      row.cells.forEach((ch) => {
        const cell = document.createElement('div');
        if (ch === '' || !KANA[ch]) {
          cell.className = 'cell empty';
        } else {
          cell.className = 'cell playable' + (isMastered(ch) ? ' done' : '');
          cell.innerHTML = `<span class="k">${ch}</span><span class="r">${KANA[ch].romaji}</span>`;
          cell.addEventListener('click', () => openLearn(ch));
        }
        rowEl.appendChild(cell);
      });
      el.appendChild(rowEl);
    });
  }

  // ---------- 首頁門戶：菜鳥村長 ----------
  function renderLanding() {
    $('landingMascot').innerHTML = MASCOT.inner(MASCOT.stageFor(state.mastered.length));
  }

  // ---------- 菜鳥分身（首頁／數字熟練區／日曆小站共用） ----------
  function renderMascot(elId) {
    const total = state.mastered.length;
    const stage = MASCOT.stageFor(total);
    const st = MASCOT.STAGES[stage];
    const next = MASCOT.STAGES[stage + 1];
    let hint, barPct = 100;
    if (!next) {
      hint = '已經是村長，最高級啦！🎉';
    } else if (next.threshold > TOTAL_NOW) {
      // 下一次變身要靠尚未推出的內容（數字等）；先鼓勵把現有的字學完
      const remain = TOTAL_NOW - total;
      if (remain > 0) {
        hint = `再 ${remain} 個字就把目前所有假名學完！`;
        barPct = Math.round((total / TOTAL_NOW) * 100);
      } else {
        hint = '目前的字全部學完了，太強了！新關卡即將登場 🎉';
      }
    } else {
      hint = `再 ${next.threshold - total} 個花丸就變身！`;
      barPct = Math.round(((total - st.threshold) / (next.threshold - st.threshold)) * 100);
    }
    $(elId || 'mascotCard').innerHTML =
      `<div class="m-art">${MASCOT.svg(stage)}</div>` +
      `<div class="m-info">` +
        `<div class="m-lv">Lv.${stage} · 我的分身</div>` +
        `<div class="m-name">${st.name}</div>` +
        `<div class="m-bar"><span style="width:${barPct}%"></span></div>` +
        `<div class="m-hint">${hint}</div>` +
      `</div>`;
  }

  // ---------- 首頁：五十音表 ＋ 集章卡 ----------
  function renderHome() {
    renderMascot();
    // 平／片假名切換鈕的選取狀態
    document.querySelectorAll('.script-toggle button').forEach((b) =>
      b.classList.toggle('active', b.dataset.script === state.script));

    renderKanaTable($('gojuon'), GOJUON[state.script]);
    renderKanaTable($('gojuonDaku'), GOJUON[state.script === 'hira' ? 'hiraDaku' : 'kataDaku']);
    renderKanaTable($('gojuonYoon'), GOJUON[state.script === 'hira' ? 'hiraYoon' : 'kataYoon']);

    // 集章卡（目前這套字母表的所有字）
    const order = curOrder();
    const grid = $('stampGrid');
    grid.innerHTML = '';
    order.forEach((ch) => {
      const slot = document.createElement('div');
      const filled = isMastered(ch);
      slot.className = 'slot' + (filled ? ' filled' : '');
      slot.innerHTML = filled
        ? `<span style="color:var(--shu)">${ch}</span>`
        : `<span style="opacity:.4">${ch}</span>`;
      grid.appendChild(slot);
    });

    const done = order.filter((c) => isMastered(c)).length;
    $('stampNum').textContent = done;
    $('stampTotal').textContent = order.length;
    $('stampSummary').textContent = done + ' / ' + order.length;
  }

  // ---------- 數字熟練區／日曆小站：共用的「單一字表＋集章卡」渲染 ----------
  // 數字、時間與星期不屬於平／片假名的二分法，各自是獨立分類，
  // 不需要 GOJUON 那種多列表格，直接把 KANA_ORDER[cat] 攤平成一個字格即可。
  function renderCategoryView(cat, gridId, stampGridId, stampSummaryId, mascotId) {
    renderMascot(mascotId);
    const order = KANA_ORDER[cat];

    const grid = $(gridId);
    grid.innerHTML = '';
    order.forEach((ch) => {
      const cell = document.createElement('div');
      cell.className = 'cell playable' + (isMastered(ch) ? ' done' : '');
      cell.innerHTML = `<span class="k">${ch}</span><span class="r">${KANA[ch].romaji}</span>`;
      cell.addEventListener('click', () => openLearn(ch));
      grid.appendChild(cell);
    });

    const sGrid = $(stampGridId);
    sGrid.innerHTML = '';
    order.forEach((ch) => {
      const slot = document.createElement('div');
      const filled = isMastered(ch);
      slot.className = 'slot' + (filled ? ' filled' : '');
      slot.innerHTML = filled
        ? `<span style="color:var(--shu)">${ch}</span>`
        : `<span style="opacity:.4">${ch}</span>`;
      sGrid.appendChild(slot);
    });

    const done = order.filter((c) => isMastered(c)).length;
    $(stampSummaryId).textContent = done + ' / ' + order.length;
    return { done, total: order.length };
  }
  function renderNumbers() {
    const { done, total } = renderCategoryView('numbers', 'numbersGrid', 'numbersStampGrid', 'numbersStampSummary', 'mascotCardNumbers');
    $('stampNum').textContent = done;
    $('stampTotal').textContent = total;
  }
  // 日曆小站同時放「時間與星期／月份／日期」三組獨立分類，
  // 頁首的花丸總數要三組加總，不能只取最後一組（否則只會顯示日期的進度）。
  function renderCalendar() {
    const t = renderCategoryView('time', 'timeGrid', 'timeStampGrid', 'timeStampSummary', 'mascotCardCalendar');
    const mo = renderCategoryView('months', 'monthsGrid', 'monthsStampGrid', 'monthsStampSummary', 'mascotCardCalendar');
    const d = renderCategoryView('dates', 'datesGrid', 'datesStampGrid', 'datesStampSummary', 'mascotCardCalendar');
    $('stampNum').textContent = t.done + mo.done + d.done;
    $('stampTotal').textContent = t.total + mo.total + d.total;
  }

  // ---------- 情境對話 ----------
  // 兩層：先選「情境包」(SCENARIO_ORDER，例如「直播金句」)，再看包裡的分類(A-H)。
  // 現在只有一個情境包，但這層 hub 是為了以後加第二個情境包(例如日常會話)時
  // 不用重排首頁磚——首頁磚永遠是「情境對話」，新情境包只是 hub 裡多一張卡。
  function renderScenarioHub() {
    const grid = $('scenarioHub');
    grid.innerHTML = '';
    SCENARIO_ORDER.forEach((key) => {
      const sc = SCENARIOS[key];
      const tile = document.createElement('button');
      tile.className = 'feature-tile';
      tile.innerHTML =
        `<span class="ft-name">${sc.label}</span>` +
        `<span class="ft-desc">${sc.desc}</span>`;
      tile.addEventListener('click', () => openScenarioPack(key));
      grid.appendChild(tile);
    });
  }

  // 分類名稱(A-H)先放，句子內容(phrases)還沒填，所以每張分類磚都先顯示「即將開放」。
  // 之後把句子填進 SCENARIOS[key].categories[].phrases，這裡再改成可點擊、接情境挑戰／情境選句。
  function openScenarioPack(key) {
    const sc = SCENARIOS[key];
    $('scenarioCatTitle').textContent = sc.label;
    const grid = $('scenarioCategories');
    grid.innerHTML = '';
    sc.categories.forEach((cat) => {
      const tile = document.createElement('div');
      tile.className = 'feature-tile locked';
      tile.setAttribute('aria-disabled', 'true');
      tile.innerHTML =
        `<span class="ft-name">${cat.key}. ${cat.label}</span>` +
        `<span class="ft-badge">即將開放</span>`;
      grid.appendChild(tile);
    });
    show('scenario-categories');
  }

  // ---------- 認識這個字 ----------
  // 假名（hira/kata）＝描紅練習；數字／時間星期＝台灣學生本來就會寫這些漢字，
  // 只需要「看字＋讀音＋例字」，不做描紅，所以同一個 view-learn 依分類切換要顯示的區塊。
  let currentChar = 'あ';
  function openLearn(char) {
    currentChar = char;
    const cat = categoryOf(char);
    const isKana = cat === 'hira' || cat === 'kata';
    if (isKana) state.script = cat; // 讓返回五十音表時顯示對應的字母表
    const info = CATEGORY_INFO[cat];
    $('learnBackBtn').setAttribute('data-back', info.view);
    $('learnBackBtn').textContent = '‹ 回' + info.listLabel;

    $('learnGenko').hidden = !isKana;
    $('btnStartTrace').hidden = !isKana;
    $('btnStrokeDemo').hidden = !isKana;
    $('learnBigChar').hidden = isKana;
    $('btnMarkLearned').hidden = isKana;
    if (!isKana) {
      $('learnBigChar').textContent = char;
      $('btnMarkLearned').textContent = isMastered(char) ? '✅ 已經學會了，再複習一次' : '✅ 我學會了';
    }

    const data = KANA[char];
    $('learnRomaji').textContent = data.romaji;
    $('learnZhuyin').textContent = '注音提示：' + data.zhuyin;
    $('learnTip').textContent = data.tip;
    if (data.word) {
      $('wordSection').style.display = '';
      $('wordK').textContent = data.word.k;
      $('wordR').textContent = data.word.r;
      $('wordZ').textContent = data.word.zh;
    } else {
      $('wordSection').style.display = 'none';
    }
    show('learn');
    if (isKana) {
      requestAnimationFrame(() => {
        const ctx = fitCanvas($('learnCanvas'));
        if (ctx) drawModel(ctx, char, true);
      });
    }
  }
  // 數字／時間星期：按「我學會了」直接記一個花丸，不需要描紅通關
  function markCharLearned(char) {
    const before = MASCOT.stageFor(state.mastered.length);
    markMastered(char);
    const after = MASCOT.stageFor(state.mastered.length);
    pendingEvolve = after > before ? after : null;
    celebrateChar = char;
    $('btnMarkLearned').textContent = '✅ 已經學會了，再複習一次';
    const info = CATEGORY_INFO[categoryOf(char)];
    if (info.view === 'numbers') renderNumbers();
    if (info.view === 'calendar') renderCalendar();
    showCelebrate();
  }
  // 畫出「印刷體」示範字（含編號）
  function drawModel(ctx, char, withNumbers) {
    clearCtx(ctx);
    const strokes = strokesOf(char);
    const ink = cssVar('--sumi');
    strokes.forEach((s) => strokePath(ctx, s.d, ink, 7));
    if (withNumbers) {
      const shu = cssVar('--shu');
      strokes.forEach((s, i) => drawNumber(ctx, s, i + 1, shu));
    }
  }

  // ---------- 筆順動畫 ----------
  let animRAF = null;
  function animateStrokes(ctx, char, onDone) {
    if (animRAF) cancelAnimationFrame(animRAF);
    const strokes = strokesOf(char);
    const ink = cssVar('--sumi');
    const guide = cssVar('--guide');
    let idx = 0, prog = 0;
    const SPEED = 1.9; // 每幀前進的長度（109 座標單位）
    function frame() {
      clearCtx(ctx);
      // 尚未寫到的筆畫：淡色底
      strokes.forEach((s, i) => { if (i > idx) strokePath(ctx, s.d, guide, 7); });
      // 已完成的筆畫：墨色
      for (let i = 0; i < idx; i++) strokePath(ctx, strokes[i].d, ink, 7);
      // 目前這一畫：逐步畫出
      const cur = strokes[idx];
      const nPts = Math.max(2, Math.round((prog / cur.len) * cur.pts.length));
      polyline(ctx, cur.pts.slice(0, nPts), ink, 7);
      prog += SPEED;
      if (prog >= cur.len) {
        idx++; prog = 0;
        if (idx >= strokes.length) {
          drawModel(ctx, char, true);
          animRAF = null;
          if (onDone) onDone();
          return;
        }
      }
      animRAF = requestAnimationFrame(frame);
    }
    frame();
  }

  // ---------- 描紅練習 ----------
  const prac = {
    char: 'あ',
    strokes: [],
    accepted: 0,     // 已完成幾畫
    userDone: [],    // 已完成的筆畫（存 guide d，畫成漂亮墨色）
    cur: [],         // 目前正在描的點
    drawing: false,
    ctx: null,
    failStreak: 0,   // 連續同一畫失敗次數（用來偵測「可能被App內建瀏覽器的手勢干擾」）
  };

  function startTrace(char) {
    prac.char = char;
    prac.strokes = strokesOf(char);
    prac.accepted = 0;
    prac.userDone = [];
    prac.cur = [];
    prac.drawing = false;
    prac.failStreak = 0;
    $('inappTip').hidden = true;
    $('pracKana').textContent = char;
    renderPips();
    setHint('照著淡淡的筆畫，從 ① 開始慢慢描～', '');
    show('practice');
    requestAnimationFrame(() => {
      prac.ctx = fitCanvas($('pracCanvas'));
      drawPractice();
    });
  }

  function renderPips() {
    const box = $('strokePips');
    box.innerHTML = '';
    prac.strokes.forEach((_, i) => {
      const pip = document.createElement('div');
      let cls = 'pip';
      if (i < prac.accepted) cls += ' ok';
      else if (i === prac.accepted) cls += ' now';
      pip.className = cls;
      pip.textContent = i < prac.accepted ? '✓' : (i + 1);
      box.appendChild(pip);
    });
  }

  function setHint(text, kind) {
    const el = $('hint');
    el.textContent = text;
    el.className = 'hint-line' + (kind ? ' ' + kind : '');
  }

  function drawPractice() {
    const ctx = prac.ctx;
    if (!ctx) return;
    clearCtx(ctx);
    const ink = cssVar('--sumi');
    const guide = cssVar('--guide');
    const guideNow = cssVar('--guide-now');
    const shu = cssVar('--shu');
    // 尚未描的筆畫（含目前這一畫）畫成淡底
    prac.strokes.forEach((s, i) => {
      if (i > prac.accepted) strokePath(ctx, s.d, guide, 8);
      else if (i === prac.accepted) strokePath(ctx, s.d, guideNow, 8);
    });
    // 已完成的筆畫 → 乾淨的墨色（把歪歪的字自動變漂亮）
    for (let i = 0; i < prac.accepted; i++) strokePath(ctx, prac.strokes[i].d, ink, 7);
    // 目前正在描的線
    if (prac.cur.length) polyline(ctx, prac.cur, ink, 7, 0.75);
    // 起筆提示（① 位置）
    if (prac.accepted < prac.strokes.length) {
      drawStartDot(ctx, prac.strokes[prac.accepted], shu);
      drawNumber(ctx, prac.strokes[prac.accepted], prac.accepted + 1, shu);
    }
  }

  // 判定一筆是否描對
  function evalStroke(userPts, guide) {
    const g = guide.pts;
    if (userPts.length < 2) return { ok: false, reason: 'short' };
    const start = userPts[0];
    const end = userPts[userPts.length - 1];
    const gStart = g[0], gEnd = g[g.length - 1];
    const dStart = dist(start, gStart);
    const dEnd = dist(end, gEnd);
    // 方向相反：起筆比較靠近「終點」
    if (dist(start, gEnd) + 4 < dStart && dist(end, gStart) < dEnd) {
      return { ok: false, reason: 'reverse' };
    }
    if (dStart > START_TOL) return { ok: false, reason: 'start' };
    // 覆蓋率
    let covered = 0;
    const tol2 = COVER_TOL * COVER_TOL;
    for (const gp of g) {
      let m = Infinity;
      for (const up of userPts) { const dd = dist2(gp, up); if (dd < m) m = dd; }
      if (m < tol2) covered++;
    }
    const cover = covered / g.length;
    if (cover < COVER_MIN) return { ok: false, reason: 'cover' };
    if (dEnd > END_TOL && cover < 0.85) return { ok: false, reason: 'end' };
    return { ok: true, cover };
  }

  const RETRY_MSG = {
    short: '線太短囉，慢慢從 ① 描到底～',
    reverse: '筆順方向反了，要從 ① 的位置開始喔！',
    start: '起筆要靠近 ① 的紅點，再試一次～',
    cover: '差一點點～盡量貼著淡淡的筆畫描',
    end: '快到終點了，再描完整一點就對了！',
  };
  const GOOD_MSG = ['這一畫很漂亮！', '筆順正確 ✨', '寫得真好！', '就是這樣，繼續～'];

  function pointerLocal(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 109, ((e.clientY - r.top) / r.height) * 109];
  }

  function bindCanvasTracing() {
    const canvas = $('pracCanvas');
    canvas.addEventListener('pointerdown', (e) => {
      if (prac.accepted >= prac.strokes.length) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      prac.drawing = true;
      prac.cur = [pointerLocal(canvas, e)];
      drawPractice();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!prac.drawing) return;
      e.preventDefault();
      prac.cur.push(pointerLocal(canvas, e));
      drawPractice();
    });
    function finish(e) {
      if (!prac.drawing) return;
      prac.drawing = false;
      const guide = prac.strokes[prac.accepted];
      const res = evalStroke(prac.cur, guide);
      if (res.ok) {
        prac.failStreak = 0;
        $('inappTip').hidden = true;
        prac.accepted++;
        prac.cur = [];
        renderPips();
        if (prac.accepted >= prac.strokes.length) {
          drawPractice();
          onComplete();
        } else {
          setHint(GOOD_MSG[(prac.accepted - 1) % GOOD_MSG.length] + ' 換下一畫 →', 'good');
          drawPractice();
        }
      } else {
        prac.cur = [];
        prac.failStreak++;
        // 連續失敗好幾次，很可能不是使用者寫不好，而是在App內建瀏覽器裡，
        // 滑動手勢被App自己的下拉關閉/回彈效果搶走，導致筆畫一直斷掉。
        if (prac.failStreak >= 4) $('inappTip').hidden = false;
        setHint(RETRY_MSG[res.reason] || '再試一次～', 'retry');
        drawPractice();
      }
    }
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', () => { prac.drawing = false; prac.cur = []; drawPractice(); });
  }

  function onComplete() {
    // 描紅練習只給假名用（數字／時間星期不描紅，見 openLearn/markCharLearned）
    const before = MASCOT.stageFor(state.mastered.length);
    markMastered(prac.char);
    const after = MASCOT.stageFor(state.mastered.length);
    pendingEvolve = after > before ? after : null;
    celebrateChar = prac.char;
    renderHome();
    setHint('全部完成！', 'good');
    setTimeout(showCelebrate, 350);
  }

  // ---------- 花丸慶祝 ----------
  function buildHanamaru() {
    const svg = $('hanamaruSvg');
    // 五瓣小花 + 兩圈手繪紅圈
    let petals = '';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(a) * 30;
      const y = 50 + Math.sin(a) * 30;
      petals += `<circle class="petal" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"
                  style="fill:var(--shu);stroke:none;transform-origin:${x.toFixed(1)}px ${y.toFixed(1)}px;
                  animation:petal-pop .4s ${(0.5 + i * 0.08).toFixed(2)}s both"/>`;
    }
    svg.innerHTML =
      petals +
      `<ellipse class="draw" pathLength="100" cx="50" cy="51" rx="33" ry="32" stroke-width="5"/>` +
      `<ellipse class="draw" pathLength="100" cx="50" cy="50" rx="25" ry="25" stroke-width="3.5" style="animation-delay:.18s"/>`;
  }
  function showCelebrate() {
    const cat = categoryOf(celebrateChar);
    const isKana = cat === 'hira' || cat === 'kata';
    $('celebrateTitle').textContent = 'はなまる！';
    $('celebrateSub').textContent = isKana
      ? `「${celebrateChar}」寫好了！筆順完全正確 🌸`
      : `「${celebrateChar}」記起來了！🌸`;
    buildHanamaru();
    // 升級橫幅（只有這次完成讓菜鳥升級才顯示）
    const eb = $('evolveBanner');
    if (pendingEvolve != null) {
      const s = MASCOT.STAGES[pendingEvolve];
      eb.hidden = false;
      eb.innerHTML = `<div class="eb-art">${MASCOT.svg(pendingEvolve)}</div>` +
        `<div class="eb-text">菜鳥升級！<b>Lv.${pendingEvolve} ${s.name}</b></div>`;
    } else {
      eb.hidden = true;
      eb.innerHTML = '';
    }
    // 是否還有下一個字（依這個字所屬的分類：假名／數字／時間星期）
    const ord = KANA_ORDER[cat];
    const idx = ord.indexOf(celebrateChar);
    $('btnNext').style.display = idx < ord.length - 1 ? '' : 'none';
    $('btnToHome').textContent = '回' + CATEGORY_INFO[cat].listLabel;
    // 「再寫一次」只對假名描紅有意義；數字/時間星期沒有描紅可以重寫
    $('btnAgain').style.display = isKana ? '' : 'none';
    $('celebrate').classList.add('show');
    speakKana(celebrateChar);
  }
  function hideCelebrate() { $('celebrate').classList.remove('show'); }

  // ---------- 遊戲 ----------
  let gameGroup = 'seion'; // seion | daku | yoon | all
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);

  function gamePool() {
    const s = state.gameScript;
    // 數字／時間星期／月份／日期沒有清音・濁音・拗音的細分，範圍選單對它們沒作用，直接給全部
    if (s === 'numbers' || s === 'time' || s === 'months' || s === 'dates') return KANA_ORDER[s].slice();
    const flat = (rows) => rows.flatMap((r) => r.cells).filter((c) => c && KANA[c]);
    if (gameGroup === 'daku') return flat(GOJUON[s === 'hira' ? 'hiraDaku' : 'kataDaku']);
    if (gameGroup === 'yoon') return flat(GOJUON[s === 'hira' ? 'hiraYoon' : 'kataYoon']);
    if (gameGroup === 'all') return KANA_ORDER[s].slice();
    return flat(GOJUON[s]); // seion
  }
  // 去掉同音重複，避免遊戲出現看起來一樣的選項
  function distinctByRomaji(list) {
    const seen = new Set(); const out = [];
    for (const c of list) { const r = KANA[c].romaji; if (!seen.has(r)) { seen.add(r); out.push(c); } }
    return out;
  }

  function renderGameMenu() {
    document.querySelectorAll('#gameScript button').forEach((b) =>
      b.classList.toggle('active', b.dataset.script === state.gameScript));
    document.querySelectorAll('#gameGroup button').forEach((b) =>
      b.classList.toggle('active', b.dataset.group === gameGroup));
    // 數字／時間星期／月份／日期沒有清音・濁音・拗音的細分，範圍選單就藏起來
    const noSubgroup = ['numbers', 'time', 'months', 'dates'].includes(state.gameScript);
    $('gameGroupBlock').hidden = noSubgroup;
  }

  function showGameResult(title, sub, again) {
    $('grArt').innerHTML = MASCOT.inner(MASCOT.stageFor(state.mastered.length));
    $('grTitle').textContent = title;
    $('grSub').textContent = sub;
    $('grAgain').onclick = () => { $('gameResult').classList.remove('show'); again(); };
    $('grMenu').onclick = () => { $('gameResult').classList.remove('show'); show('games'); renderGameMenu(); };
    $('gameResult').classList.add('show');
  }

  // 羅馬拼音長度差異很大（1字的 a 到16字的 nijuushichinichi 都有），依長度分級縮小字體避免爆版
  function romajiSizeClass(len) {
    if (len <= 4) return '';
    if (len <= 6) return ' rlen-md';
    if (len <= 9) return ' rlen-lg';
    if (len <= 12) return ' rlen-xl';
    return ' rlen-xxl';
  }

  // ----- 遊戲一：翻牌配對 -----
  const match = { first: null, lock: false, matched: 0, total: 0, moves: 0 };
  function startMatch() {
    const pool = distinctByRomaji(gamePool());
    if (pool.length < 4) { alert('這個範圍的字太少，換個範圍再玩吧～'); return; }
    const N = Math.min(6, pool.length);
    const picks = shuffle(pool).slice(0, N);
    let cards = [];
    picks.forEach((ch, i) => {
      cards.push({ id: i, kind: 'kana', face: ch });
      cards.push({ id: i, kind: 'romaji', face: KANA[ch].romaji });
    });
    cards = shuffle(cards);
    match.first = null; match.lock = false; match.matched = 0; match.total = N; match.moves = 0;
    show('match');
    $('matchInfo').textContent = `配對 0 / ${N}`;
    const grid = $('matchGrid');
    grid.innerHTML = '';
    cards.forEach((card) => {
      const el = document.createElement('button');
      el.className = 'mcard';
      const sizeMod = card.kind === 'kana'
        ? (card.face.length > 1 ? ' long' : '')
        : romajiSizeClass(card.face.length);
      el.innerHTML = `<span class="mc-back">🌸</span><span class="mc-face ${card.kind}${sizeMod}">${card.face}</span>`;
      el.addEventListener('click', () => flipCard(el, card));
      grid.appendChild(el);
    });
  }
  function flipCard(el, card) {
    if (match.lock || el.classList.contains('open') || el.classList.contains('done')) return;
    el.classList.add('open');
    if (!match.first) { match.first = { el, card }; return; }
    if (match.first.el === el) return;
    match.moves++;
    const a = match.first; match.first = null;
    if (a.card.id === card.id) {
      match.lock = true;
      setTimeout(() => {
        a.el.classList.add('done'); el.classList.add('done');
        match.matched++;
        $('matchInfo').textContent = `配對 ${match.matched} / ${match.total}`;
        match.lock = false;
        if (match.matched >= match.total) {
          setTimeout(() => showGameResult('全部配對完成！🎉', `用了 ${match.moves} 次翻牌`, startMatch), 450);
        }
      }, 260);
    } else {
      match.lock = true;
      setTimeout(() => { a.el.classList.remove('open'); el.classList.remove('open'); match.lock = false; }, 780);
    }
  }

  // ----- 遊戲二：快問快答計分賽 -----
  const gq = { list: [], i: 0, score: 0, streak: 0, best: 0, correct: 0, lock: false, timer: null, qStart: 0 };
  const QN = 10, QTIME = 8;
  function clearTimer() { if (gq.timer) { clearTimeout(gq.timer); gq.timer = null; } }
  function startQuizGame() {
    const pool = distinctByRomaji(gamePool());
    if (pool.length < 4) { alert('這個範圍的字太少，換個範圍再玩吧～'); return; }
    gq.list = shuffle(pool).slice(0, Math.min(QN, pool.length)).map((target) => {
      const type = Math.random() < 0.5 ? 'k2r' : 'r2k';
      const distract = shuffle(pool.filter((c) => KANA[c].romaji !== KANA[target].romaji)).slice(0, 3);
      return { target, type, opts: shuffle(distract.concat(target)) };
    });
    gq.i = 0; gq.score = 0; gq.streak = 0; gq.best = 0; gq.correct = 0;
    show('quiz');
    renderGQ();
  }
  function renderGQ() {
    clearTimer();
    const q = gq.list[gq.i];
    gq.lock = false;
    $('gqProgress').textContent = `第 ${gq.i + 1} / ${gq.list.length} 題`;
    $('gqScore').textContent = gq.score;
    $('gqStreak').textContent = gq.streak >= 2 ? `🔥 ${gq.streak} 連擊` : '';
    if (q.type === 'k2r') {
      $('gqPrompt').textContent = '這個字唸什麼？';
      $('gqKana').textContent = q.target;
      $('gqKana').style.fontFamily = 'var(--font-kana)';
    } else {
      $('gqPrompt').textContent = '哪一個是這個音？';
      $('gqKana').textContent = KANA[q.target].romaji;
      $('gqKana').style.fontFamily = 'var(--font-ui)';
    }
    const box = $('gqOptions');
    box.innerHTML = '';
    q.opts.forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'quiz-opt';
      b.textContent = q.type === 'k2r' ? KANA[opt].romaji : opt;
      if (q.type === 'r2k') b.style.fontFamily = 'var(--font-kana)';
      b.dataset.correct = KANA[opt].romaji === KANA[q.target].romaji ? '1' : '';
      b.addEventListener('click', () => answerGQ(b));
      box.appendChild(b);
    });
    // 計時條
    const bar = $('gqTimer');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    requestAnimationFrame(() => {
      bar.style.transition = `width ${QTIME}s linear`;
      bar.style.width = '0%';
    });
    gq.qStart = performance.now();
    gq.timer = setTimeout(() => { if (!gq.lock) { gq.lock = true; gq.streak = 0; revealGQ(null); } }, QTIME * 1000);
  }
  function answerGQ(btn) {
    if (gq.lock) return;
    gq.lock = true;
    clearTimer();
    if (btn.dataset.correct === '1') {
      const timeLeft = Math.max(0, QTIME - (performance.now() - gq.qStart) / 1000);
      gq.streak++; gq.correct++;
      gq.best = Math.max(gq.best, gq.streak);
      gq.score += 100 + Math.round(timeLeft * 10) + (gq.streak >= 2 ? gq.streak * 20 : 0);
    } else {
      gq.streak = 0;
    }
    $('gqScore').textContent = gq.score;
    revealGQ(btn);
  }
  function revealGQ(chosen) {
    const box = $('gqOptions');
    [...box.children].forEach((b) => {
      if (b.dataset.correct === '1') b.classList.add('correct');
    });
    if (chosen && chosen.dataset.correct !== '1') chosen.classList.add('wrong');
    setTimeout(() => {
      gq.i++;
      if (gq.i >= gq.list.length) {
        const allRight = gq.correct === gq.list.length;
        showGameResult(
          allRight ? '全對！太厲害了 🌸' : '完成囉，繼續加油！',
          `得分 ${gq.score}　・　答對 ${gq.correct}/${gq.list.length}　・　最高 ${gq.best} 連擊`,
          startQuizGame
        );
      } else {
        renderGQ();
      }
    }, 900);
  }

  // ---------- 數字報價挑戰（隨機出題，練習把任意數字唸成日文） ----------
  // 音變對照表（DIGIT_KANJI／HYAKU_ROMAJI／SEN_ROMAJI 等）定義在 data.js。
  // 這裡的羅馬拼音統一用雙母音拼法（kyuu、juu），不用長音記號，方便用 /^[aiueoy]/ 這種
  // 簡單正則判斷該不該插入撇號（'）分隔，例如「三千一」sanzen'ichi、「千円」sen'en。
  function joinRomaji(parts) {
    let out = '';
    parts.forEach((p) => {
      if (!p) return;
      out += (out && /n$/.test(out) && /^[aiueoy]/.test(p)) ? "'" + p : p;
    });
    return out;
  }
  function fourDigitParts(n) {
    const thousands = Math.floor(n / 1000);
    const hundreds = Math.floor((n % 1000) / 100);
    const tens = Math.floor((n % 100) / 10);
    const ones = n % 10;
    const kanji = [];
    const romaji = [];
    if (thousands) { kanji.push(SEN_KANJI[thousands]); romaji.push(SEN_ROMAJI[thousands]); }
    if (hundreds) { kanji.push(HYAKU_KANJI[hundreds]); romaji.push(HYAKU_ROMAJI[hundreds]); }
    if (tens === 1) { kanji.push('十'); romaji.push('juu'); }
    else if (tens > 1) { kanji.push(DIGIT_KANJI[tens] + '十'); romaji.push(DIGIT_ROMAJI[tens] + 'juu'); }
    if (ones) { kanji.push(DIGIT_KANJI[ones]); romaji.push(DIGIT_ROMAJI[ones]); }
    return { kanji, romaji };
  }
  // n：1～999999。回傳 {kanji, romaji}（不含「円」，顯示時再接上）。
  function numberToReading(n) {
    const man = Math.floor(n / 10000);
    const rest = n % 10000;
    const kanji = [];
    const romaji = [];
    if (man) {
      const mp = fourDigitParts(man);
      kanji.push(...mp.kanji, '万');
      romaji.push(...mp.romaji, 'man');
    }
    if (rest || !man) {
      const rp = fourDigitParts(rest);
      kanji.push(...rp.kanji);
      romaji.push(...rp.romaji);
    }
    return { kanji: kanji.join(''), romaji: joinRomaji(romaji) };
  }

  const NC_LEVELS = {
    easy: { label: '簡單（百）', min: 100, max: 999 },
    mid: { label: '中等（千）', min: 1000, max: 9999 },
    hard: { label: '進階（万）', min: 10000, max: 999999 },
  };
  const nc = { level: 'easy', correct: 0, total: 0, current: 0, revealed: false };
  function ncNext() {
    const { min, max } = NC_LEVELS[nc.level];
    nc.current = min + Math.floor(Math.random() * (max - min + 1));
    nc.revealed = false;
    renderNumChallenge();
  }
  function renderNumChallenge() {
    document.querySelectorAll('#ncLevel button').forEach((b) => b.classList.toggle('active', b.dataset.level === nc.level));
    $('ncPrice').textContent = '¥' + nc.current.toLocaleString('ja-JP');
    $('ncScore').textContent = `答對 ${nc.correct} / ${nc.total}`;
    const reading = numberToReading(nc.current);
    $('ncAnswerKanji').textContent = reading.kanji + '円';
    $('ncAnswerRomaji').textContent = joinRomaji([reading.romaji, 'en']);
    $('ncAnswer').hidden = !nc.revealed;
    $('ncRevealBtn').hidden = nc.revealed;
    $('ncJudgeRow').hidden = !nc.revealed;
  }
  function ncJudge(correct) {
    nc.total++;
    if (correct) nc.correct++;
    ncNext();
  }

  // ---------- 事件綁定 ----------
  function bindEvents() {
    document.querySelectorAll('[data-back]').forEach((b) =>
      b.addEventListener('click', () => {
        clearTimer();
        const t = b.getAttribute('data-back');
        if (t === 'landing') renderLanding();
        if (t === 'home') renderHome();
        if (t === 'numbers') renderNumbers();
        if (t === 'calendar') renderCalendar();
        if (t === 'scenario') renderScenarioHub();
        show(t);
      }));

    // 頁首標題 → 回首頁門戶
    const goHome = () => { clearTimer(); renderLanding(); show('landing'); };
    $('brandHome').addEventListener('click', goHome);
    $('brandHome').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } });

    $('btnSay').addEventListener('click', () => speakKana(currentChar));
    $('btnWordSay').addEventListener('click', () => speakWord(currentChar));
    $('btnStrokeDemo').addEventListener('click', () => {
      const ctx = fitCanvas($('learnCanvas'));
      if (ctx) animateStrokes(ctx, currentChar);
    });
    $('btnStartTrace').addEventListener('click', () => startTrace(currentChar));

    $('btnDemo2').addEventListener('click', () => {
      // 在描紅畫布上放示範，結束後回到練習畫面
      animateStrokes(prac.ctx, prac.char, () => drawPractice());
    });
    $('btnClear').addEventListener('click', () => {
      prac.accepted = 0; prac.userDone = []; prac.cur = [];
      renderPips();
      setHint('清乾淨了，從 ① 重新開始～', '');
      drawPractice();
    });

    $('btnNext').addEventListener('click', () => {
      hideCelebrate();
      const cat = categoryOf(celebrateChar);
      const ord = KANA_ORDER[cat];
      const idx = ord.indexOf(celebrateChar);
      if (idx < ord.length - 1) { openLearn(ord[idx + 1]); return; }
      const info = CATEGORY_INFO[cat];
      if (info.view === 'home') renderHome();
      if (info.view === 'numbers') renderNumbers();
      if (info.view === 'calendar') renderCalendar();
      show(info.view);
    });

    // 平／片假名切換
    document.querySelectorAll('.script-toggle button').forEach((b) =>
      b.addEventListener('click', () => {
        state.script = b.dataset.script;
        saveState();
        renderHome();
      }));
    // 「再寫一次」只在假名描紅完成時會顯示（見 showCelebrate），這裡沿用 prac.char 沒問題
    $('btnAgain').addEventListener('click', () => { hideCelebrate(); startTrace(prac.char); });
    $('btnMarkLearned').addEventListener('click', () => markCharLearned(currentChar));
    $('btnToHome').addEventListener('click', () => {
      hideCelebrate();
      const info = CATEGORY_INFO[categoryOf(celebrateChar)];
      if (info.view === 'home') renderHome();
      if (info.view === 'numbers') renderNumbers();
      if (info.view === 'calendar') renderCalendar();
      show(info.view);
    });
    $('celebrate').addEventListener('click', (e) => { if (e.target === $('celebrate')) hideCelebrate(); });

    // 首頁功能磚
    document.querySelectorAll('.feature-tile[data-go]').forEach((t) =>
      t.addEventListener('click', () => {
        const go = t.dataset.go;
        if (go === 'home') renderHome();
        if (go === 'games') renderGameMenu();
        if (go === 'numbers') renderNumbers();
        if (go === 'calendar') renderCalendar();
        if (go === 'scenario') renderScenarioHub();
        show(go);
      }));
    // 遊戲選單
    document.querySelectorAll('#gameScript button').forEach((b) =>
      b.addEventListener('click', () => { state.gameScript = b.dataset.script; saveState(); renderGameMenu(); }));
    document.querySelectorAll('#gameGroup button').forEach((b) =>
      b.addEventListener('click', () => { gameGroup = b.dataset.group; renderGameMenu(); }));
    $('cardMatch').addEventListener('click', startMatch);
    $('cardQuiz').addEventListener('click', startQuizGame);

    // 數字報價挑戰
    $('cardNumChallenge').addEventListener('click', () => { ncNext(); show('numchallenge'); });
    document.querySelectorAll('#ncLevel button').forEach((b) =>
      b.addEventListener('click', () => { nc.level = b.dataset.level; nc.correct = 0; nc.total = 0; ncNext(); }));
    $('ncRevealBtn').addEventListener('click', () => { nc.revealed = true; renderNumChallenge(); });
    document.querySelectorAll('#ncJudgeRow button').forEach((b) =>
      b.addEventListener('click', () => ncJudge(b.dataset.judge === 'right')));

    // 視窗尺寸變動時重新配置畫布
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if ($('view-learn').classList.contains('active')) {
          const ctx = fitCanvas($('learnCanvas')); if (ctx) drawModel(ctx, currentChar, true);
        }
        if ($('view-practice').classList.contains('active')) {
          prac.ctx = fitCanvas($('pracCanvas')); drawPractice();
        }
      }, 180);
    });
  }

  // ---------- 啟動 ----------
  function init() {
    loadState();
    renderHome();
    renderLanding();
    bindEvents();
    bindCanvasTracing();
    // PWA service worker（只有透過 http(s) 開啟時才註冊）
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
