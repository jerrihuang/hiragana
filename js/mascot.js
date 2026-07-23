// 菜鳥小雞吉祥物：10 段變身
// 依「已學會的字數（花丸總數）」決定目前型態。
// 座標系 0..100（寬）x 0..120（高）。所有顏色為固定色（實體角色，不隨深色模式反轉）。
const MASCOT = (function () {
  const OUT = '#E4A72C', BODY = '#F7C948', BELLY = '#FCE7A0', BEAK = '#F0923E',
        EYE = '#3a3330', CHEEK = '#F49A93', SHELL = '#FBF7EC', SHE = '#E0D6BC',
        RED = '#E0685A', REDK = '#C8503F', INDIGO = '#6C79C0', NINJA = '#4A5B84',
        GOLD = '#E6BC5A', PINK = '#F3A8B0';

  const heart = (x, y, s, c) => `<path d="M${x},${y + s * .85} C${x - s * 1.3},${y - s * .35} ${x - s * .75},${y - s * 1.25} ${x},${y - s * .35} C${x + s * .75},${y - s * 1.25} ${x + s * 1.3},${y - s * .35} ${x},${y + s * .85} Z" fill="${c}"/>`;
  const star = (x, y, s, c) => `<path d="M${x},${y - s} L${x + s * .3},${y - s * .3} L${x + s},${y} L${x + s * .3},${y + s * .3} L${x},${y + s} L${x - s * .3},${y + s * .3} L${x - s},${y} L${x - s * .3},${y - s * .3} Z" fill="${c || GOLD}"/>`;
  const feet = () => `<path d="M43,94 l-5,7 M43,94 l0,8 M43,94 l5,7" stroke="${BEAK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M57,94 l-5,7 M57,94 l0,8 M57,94 l5,7" stroke="${BEAK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const wings = () => `<ellipse cx="19" cy="63" rx="8" ry="13" fill="${BODY}" stroke="${OUT}" stroke-width="1.6"/><ellipse cx="81" cy="63" rx="8" ry="13" fill="${BODY}" stroke="${OUT}" stroke-width="1.6"/>`;
  const body = () => `<ellipse cx="50" cy="60" rx="31" ry="33" fill="${BODY}" stroke="${OUT}" stroke-width="2"/><ellipse cx="50" cy="68" rx="18" ry="19" fill="${BELLY}"/><ellipse cx="37" cy="45" rx="7" ry="4.5" fill="#fff" opacity="0.4"/>`;
  const cheeks = () => `<circle cx="27" cy="67" r="5.2" fill="${CHEEK}" opacity="0.6"/><circle cx="73" cy="67" r="5.2" fill="${CHEEK}" opacity="0.6"/>`;
  const beak = () => `<path d="M44,56 Q50,55 56,56 Q50,66 44,56 Z" fill="${BEAK}"/>`;
  const chick = () => feet() + wings() + body() + cheeks() + beak();
  const eyes = () => `<circle cx="40.5" cy="51" r="4.7" fill="${EYE}"/><circle cx="59.5" cy="51" r="4.7" fill="${EYE}"/><circle cx="42.2" cy="49" r="1.7" fill="#fff"/><circle cx="61.2" cy="49" r="1.7" fill="#fff"/>`;
  const brows = () => `<path d="M34,44 Q39,42 45,45 M66,44 Q61,42 55,45" stroke="${EYE}" stroke-width="2" stroke-linecap="round" fill="none"/>`;

  const STAGES = [
    { name: '迷糊蛋', threshold: 0, art: () => feet() + `<ellipse cx="50" cy="58" rx="30" ry="35" fill="${SHELL}" stroke="${SHE}" stroke-width="2"/><ellipse cx="40" cy="44" rx="6" ry="4" fill="#fff" opacity="0.5"/><circle cx="60" cy="66" r="2.2" fill="${SHE}"/><circle cx="44" cy="70" r="1.6" fill="${SHE}"/><circle cx="30" cy="62" r="4.6" fill="${CHEEK}" opacity="0.55"/><circle cx="70" cy="62" r="4.6" fill="${CHEEK}" opacity="0.55"/><path d="M35,52 Q39,55 43,52 M57,52 Q61,55 65,52" stroke="${EYE}" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="76" cy="46" r="4" fill="#cfe3ef" opacity="0.85"/><text x="70" y="26" font-size="12" fill="${INDIGO}">Zzz</text>` },
    { name: '破殼菜鳥', threshold: 1, art: () => chick() + eyes() + `<path d="M22,40 Q26,30 31,38 Q37,28 43,37 Q50,27 57,37 Q63,28 69,38 Q74,30 78,40 Q50,45 22,40 Z" fill="${SHELL}" stroke="${SHE}" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="35" cy="34" rx="4" ry="2.4" fill="#fff" opacity="0.6"/><path d="M14,90 Q24,84 34,90 Q24,95 14,90 Z" fill="${SHELL}" stroke="${SHE}" stroke-width="1"/>` },
    { name: '元氣小雞', threshold: 5, art: () => chick() + eyes() + `<path d="M45,58 Q50,63 55,58" stroke="${EYE}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` + star(14, 30, 4.5) + star(87, 40, 3.4) + star(80, 19, 2.6) + heart(24, 20, 2.4, PINK) },
    { name: '拼命頭帶雞', threshold: 10, art: () => chick() + eyes() + brows() + `<path d="M17,42 Q50,37 83,42 L83,47 Q50,42 17,47 Z" fill="${RED}"/>` + heart(50, 43.5, 3.1, '#fff') + `<circle cx="82" cy="44" r="3.4" fill="${RED}"/><path d="M84,43 q10,-4 12,-1 M84,46 q10,1 12,5" stroke="${RED}" stroke-width="3" stroke-linecap="round" fill="none"/>` },
    { name: '好學眼鏡雞', threshold: 23, art: () => chick() + eyes() + `<circle cx="40.5" cy="51" r="8.2" fill="#bfe0e2" fill-opacity="0.28" stroke="#5aa6a0" stroke-width="2"/><circle cx="59.5" cy="51" r="8.2" fill="#bfe0e2" fill-opacity="0.28" stroke="#5aa6a0" stroke-width="2"/><path d="M48.7,50 q1.3,-1 2.6,0" stroke="#5aa6a0" stroke-width="2" fill="none"/><path d="M32.3,49 q-5,-1.5 -7,-0.5 M67.7,49 q5,-1.5 7,-0.5" stroke="#5aa6a0" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M36,46 q3,-2 6,-1" stroke="#fff" stroke-width="1.4" fill="none" opacity="0.8"/>` },
    { name: '平假名達人雞', threshold: 46, art: () => `<path d="M32,47 Q50,55 68,47 L80,92 Q73,88 66,92 Q59,88 52,92 Q45,88 38,92 Q31,88 20,92 Z" fill="${RED}" stroke="${REDK}" stroke-width="1.2"/>` + chick() + eyes() + `<circle cx="50" cy="46" r="4.5" fill="${GOLD}"/>` + star(50, 46, 3, '#fff') },
    { name: '平片雙修雞', threshold: 92, art: () => chick() + eyes() + `<g transform="rotate(-20 15 60)"><rect x="11" y="44" width="7" height="27" rx="3" fill="#F6C96B" stroke="#d9a63f" stroke-width=".7"/><rect x="11" y="44" width="7" height="6" rx="3" fill="${PINK}"/><polygon points="11,71 18,71 14.5,78" fill="#EBB98A"/><polygon points="12.6,74.5 16.4,74.5 14.5,78" fill="${EYE}"/></g><g transform="rotate(20 85 60)"><rect x="82" y="44" width="7" height="27" rx="3" fill="#F6C96B" stroke="#d9a63f" stroke-width=".7"/><rect x="82" y="44" width="7" height="6" rx="3" fill="${PINK}"/><polygon points="82,71 89,71 85.5,78" fill="#EBB98A"/><polygon points="83.6,74.5 87.4,74.5 85.5,78" fill="${EYE}"/></g>` + star(50, 20, 2.6, GOLD) },
    // Lv.7~9 對應「數字／星期月份／全部完成」。門檻設在所有假名（含濁音半濁音，142 字）之上，
    // 之後做出數字等內容、字數超過才會觸發；屆時再依實際內容量校準。
    { name: '數字忍者雞', threshold: 230, art: () => chick() + `<path d="M12,47 Q50,43 88,47 L88,55 Q50,51 12,55 Z" fill="${NINJA}"/><path d="M12,51 q-9,-2 -11,2 q9,0 11,3 Z" fill="${NINJA}"/>` + star(50, 50.5, 3, '#fff') + `<ellipse cx="40.5" cy="51" rx="4.8" ry="3" fill="#fff"/><ellipse cx="59.5" cy="51" rx="4.8" ry="3" fill="#fff"/><circle cx="40.5" cy="51" r="1.9" fill="${EYE}"/><circle cx="59.5" cy="51" r="1.9" fill="${EYE}"/>` },
    { name: '日曆賢者雞', threshold: 270, art: () => chick() + `<path d="M41,66 Q50,80 59,66 Q55,72 50,70 Q45,72 41,66 Z" fill="#fff" stroke="#e9e9e9" stroke-width=".6"/>` + eyes() + `<ellipse cx="50" cy="34" rx="26" ry="5.5" fill="${INDIGO}"/><path d="M28,34 Q40,6 56,7 Q52,16 60,14 Q56,24 70,34 Q50,39 28,34 Z" fill="${INDIGO}"/><circle cx="60" cy="10" r="3" fill="${GOLD}"/>` + star(45, 20, 2.4, '#fff') + star(57, 26, 1.8, '#fff') + `<g><rect x="71" y="60" width="18" height="18" rx="4" fill="#fff" stroke="#c9c2ad"/><rect x="71" y="60" width="18" height="5" rx="2" fill="${RED}"/>` + heart(80, 72, 3, RED) + `</g>` },
    { name: '菜鳥村長・鳳凰雞', threshold: 310, art: () => `<path d="M30,72 Q6,62 6,40 Q16,52 30,54 Q22,64 30,72 Z" fill="${PINK}"/><path d="M28,70 Q10,60 10,42 Q20,53 33,57 Z" fill="${RED}"/><path d="M70,72 Q94,62 94,40 Q84,52 70,54 Q78,64 70,72 Z" fill="${GOLD}"/><path d="M72,70 Q90,60 90,42 Q80,53 67,57 Z" fill="#F0D083"/>` + chick() + eyes() + `<path d="M24,41 Q50,20 76,41 Q64,34 50,34 Q36,34 24,41 Z" fill="#565c6b"/><path d="M43,39 Q34,22 24,18 Q34,26 40,30 Q37,36 48,38 Z" fill="${GOLD}"/><path d="M57,39 Q66,22 76,18 Q66,26 60,30 Q63,36 52,38 Z" fill="${GOLD}"/>` + star(50, 34, 4.6, GOLD) + star(50, 34, 2.4, '#fff') + star(13, 25, 3) + star(88, 29, 3) },
  ];

  function stageFor(count) {
    let s = 0;
    for (let i = 0; i < STAGES.length; i++) if (count >= STAGES[i].threshold) s = i;
    return s;
  }
  function inner(stage) { return STAGES[stage].art(); }
  function svg(stage, cls) {
    return `<svg class="${cls || ''}" viewBox="0 0 100 120" role="img" aria-label="${STAGES[stage].name}">${STAGES[stage].art()}</svg>`;
  }

  return { STAGES, stageFor, inner, svg };
})();
