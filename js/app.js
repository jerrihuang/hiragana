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
  let state = { mastered: [] };
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && Array.isArray(s.mastered)) state = s;
    } catch (e) { /* 忽略 */ }
  }
  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }
  const isMastered = (c) => state.mastered.includes(c);
  function markMastered(c) {
    if (!isMastered(c)) { state.mastered.push(c); saveState(); }
  }

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
  function say(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }

  // ---------- 視圖切換 ----------
  function show(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    $('view-' + view).classList.add('active');
    window.scrollTo(0, 0);
  }

  // ---------- 首頁：五十音表 ＋ 集章卡 ----------
  function renderHome() {
    const gojuon = $('gojuon');
    gojuon.innerHTML = '';
    GOJUON.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row' + (row.unlocked ? '' : ' locked');
      const label = document.createElement('div');
      label.className = 'row-label';
      label.textContent = row.label;
      rowEl.appendChild(label);
      row.cells.forEach((ch) => {
        const cell = document.createElement('div');
        if (ch === '') {
          cell.className = 'cell empty';
        } else if (row.unlocked && KANA[ch]) {
          cell.className = 'cell playable' + (isMastered(ch) ? ' done' : '');
          cell.innerHTML = `<span class="k">${ch}</span><span class="r">${KANA[ch].romaji}</span>`;
          cell.addEventListener('click', () => openLearn(ch));
        } else {
          cell.className = 'cell locked';
          cell.innerHTML = `<span class="k">${ch}</span>`;
        }
        rowEl.appendChild(cell);
      });
      gojuon.appendChild(rowEl);
    });

    // 集章卡
    const grid = $('stampGrid');
    grid.innerHTML = '';
    KANA_ORDER.forEach((ch) => {
      const slot = document.createElement('div');
      const filled = isMastered(ch);
      slot.className = 'slot' + (filled ? ' filled' : '');
      slot.innerHTML = filled
        ? `<span style="color:var(--shu)">${ch}</span>`
        : `<span style="opacity:.4">${ch}</span>`;
      grid.appendChild(slot);
    });

    $('stampNum').textContent = state.mastered.filter((c) => KANA_ORDER.includes(c)).length;
  }

  // ---------- 認識這個字 ----------
  let currentChar = 'あ';
  function openLearn(char) {
    currentChar = char;
    const data = KANA[char];
    $('learnRomaji').textContent = data.romaji;
    $('learnZhuyin').textContent = '注音提示：' + data.zhuyin;
    $('learnTip').textContent = data.tip;
    $('wordK').textContent = data.word.k;
    $('wordR').textContent = data.word.r;
    $('wordZ').textContent = data.word.zh;
    show('learn');
    requestAnimationFrame(() => {
      const ctx = fitCanvas($('learnCanvas'));
      if (ctx) drawModel(ctx, char, true);
    });
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
  };

  function startTrace(char) {
    prac.char = char;
    prac.strokes = strokesOf(char);
    prac.accepted = 0;
    prac.userDone = [];
    prac.cur = [];
    prac.drawing = false;
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
        setHint(RETRY_MSG[res.reason] || '再試一次～', 'retry');
        drawPractice();
      }
    }
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', () => { prac.drawing = false; prac.cur = []; drawPractice(); });
  }

  function onComplete() {
    markMastered(prac.char);
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
    const data = KANA[prac.char];
    $('celebrateTitle').textContent = 'はなまる！';
    $('celebrateSub').textContent = `「${prac.char}」寫好了！筆順完全正確 🌸`;
    buildHanamaru();
    // 是否還有下一個字
    const idx = KANA_ORDER.indexOf(prac.char);
    $('btnNext').style.display = idx < KANA_ORDER.length - 1 ? '' : 'none';
    $('celebrate').classList.add('show');
    say(data.word ? prac.char : prac.char);
  }
  function hideCelebrate() { $('celebrate').classList.remove('show'); }

  // ---------- 小測驗 ----------
  const quiz = { list: [], i: 0, score: 0, locked: false };
  function startQuiz() {
    const pool = KANA_ORDER.filter((c) => isMastered(c));
    if (pool.length < 4) {
      alert('先描熟至少 4 個字，就能來玩小測驗囉！');
      return;
    }
    // 隨機出 5 題（或池子大小）
    const n = Math.min(5, pool.length);
    const shuffled = pool.slice().sort(() => Math.random() - 0.5).slice(0, n);
    quiz.list = shuffled.map((target) => {
      const distractors = KANA_ORDER.filter((c) => c !== target)
        .sort(() => Math.random() - 0.5).slice(0, 3);
      const options = distractors.concat(target).sort(() => Math.random() - 0.5);
      return { target, options };
    });
    quiz.i = 0; quiz.score = 0; quiz.locked = false;
    show('quiz');
    renderQuiz();
  }
  function renderQuiz() {
    const q = quiz.list[quiz.i];
    quiz.locked = false;
    $('quizProgress').textContent = `第 ${quiz.i + 1} / ${quiz.list.length} 題`;
    $('quizPrompt').textContent = '這個字的羅馬拼音是？';
    $('quizKana').textContent = q.target;
    $('quizKana').style.fontFamily = 'var(--font-kana)';
    say(q.target);
    const box = $('quizOptions');
    box.innerHTML = '';
    q.options.forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'quiz-opt';
      b.textContent = KANA[opt].romaji;
      b.addEventListener('click', () => answerQuiz(b, opt, q.target));
      box.appendChild(b);
    });
  }
  function answerQuiz(btn, opt, target) {
    if (quiz.locked) return;
    quiz.locked = true;
    const buttons = Array.from($('quizOptions').children);
    if (opt === target) {
      btn.classList.add('correct');
      quiz.score++;
    } else {
      btn.classList.add('wrong');
      buttons.forEach((b) => { if (KANA[target].romaji === b.textContent) b.classList.add('correct'); });
    }
    setTimeout(() => {
      quiz.i++;
      if (quiz.i >= quiz.list.length) showQuizResult();
      else renderQuiz();
    }, 900);
  }
  function showQuizResult() {
    $('quizProgress').textContent = '測驗結果';
    $('quizPrompt').textContent = quiz.score === quiz.list.length ? '全對！太厲害了 🌸' : '完成囉，繼續加油！';
    $('quizKana').textContent = `${quiz.score} / ${quiz.list.length}`;
    $('quizKana').style.fontFamily = 'var(--font-ui)';
    const box = $('quizOptions');
    box.innerHTML = '';
    const again = document.createElement('button');
    again.className = 'btn btn-primary'; again.textContent = '再玩一次';
    again.style.gridColumn = '1 / -1';
    again.addEventListener('click', startQuiz);
    const home = document.createElement('button');
    home.className = 'btn btn-secondary'; home.textContent = '回五十音表';
    home.style.gridColumn = '1 / -1';
    home.addEventListener('click', () => show('home'));
    box.appendChild(again);
    box.appendChild(home);
  }

  // ---------- 事件綁定 ----------
  function bindEvents() {
    document.querySelectorAll('[data-back]').forEach((b) =>
      b.addEventListener('click', () => show(b.getAttribute('data-back'))));

    $('btnSay').addEventListener('click', () => say(currentChar));
    $('btnWordSay').addEventListener('click', () => say(KANA[currentChar].word.k));
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
      const idx = KANA_ORDER.indexOf(prac.char);
      if (idx < KANA_ORDER.length - 1) openLearn(KANA_ORDER[idx + 1]);
      else show('home');
    });
    $('btnAgain').addEventListener('click', () => { hideCelebrate(); startTrace(prac.char); });
    $('btnToHome').addEventListener('click', () => { hideCelebrate(); show('home'); });
    $('celebrate').addEventListener('click', (e) => { if (e.target === $('celebrate')) hideCelebrate(); });

    $('btnQuiz').addEventListener('click', startQuiz);

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
    bindEvents();
    bindCanvasTracing();
    // PWA service worker（只有透過 http(s) 開啟時才註冊）
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
