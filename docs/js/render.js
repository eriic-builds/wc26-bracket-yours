// render.js — the wc26-bracket render engine, ported from Python (build_dashboard.py)
// to run 100% client-side. Pure function of (picks, live, topology): given a parsed
// bracket + live results + the fixed topology, it returns the dashboard HTML string.
// Kept faithful to the Python so the golden test (tests/) can prove parity.

const DASH = "\u2013";

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const codeNum = (c) => parseInt(c.slice(1), 10);
const byCode = (a, b) => codeNum(a) - codeNum(b);

// ── country nickname / flag helpers (mirror the Python) ───────────────────────
const STORY_NICK = {
  "England":"\u{1F981}","France":"\u{1F413}","Netherlands":"\u{1F7E0}","Belgium":"\u{1F608}",
  "Germany":"\u{1F985}","Spain":"\u{1F402}","Australia":"\u{1F998}","Canada":"\u{1F341}",
  "Ivory Coast":"\u{1F418}","DR Congo":"\u{1F406}","Japan":"\u2694\uFE0F","Mexico":"\u{1F335}",
  "United States":"\u{1F5FD}","Algeria":"\u{1F98A}","Colombia":"\u2615","Cape Verde":"\u{1F988}",
  "Bosnia & Herz.":"\u{1F409}","Ghana":"\u2B50","Brazil":"\u{1F49B}","Argentina":"\u{1F499}",
  "Egypt":"\u{1F3FA}",
};
const STORY_ISO2 = {
  "Argentina":"AR","Australia":"AU","Austria":"AT","Belgium":"BE","Bosnia & Herz.":"BA","Brazil":"BR",
  "Canada":"CA","Cape Verde":"CV","Colombia":"CO","Croatia":"HR","DR Congo":"CD","Ecuador":"EC",
  "Egypt":"EG","France":"FR","Germany":"DE","Ghana":"GH","Ivory Coast":"CI","Japan":"JP","Mexico":"MX",
  "Morocco":"MA","Netherlands":"NL","Norway":"NO","Paraguay":"PY","Portugal":"PT","Senegal":"SN",
  "South Africa":"ZA","Spain":"ES","Sweden":"SE","Switzerland":"CH","United States":"US","Algeria":"DZ",
};
function storyFlag(iso2) {
  if (!iso2 || iso2.length !== 2 || !/^[A-Za-z]+$/.test(iso2)) return "";
  return [...iso2.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
}
function teamEmoji(name) {
  return STORY_NICK[name] || storyFlag(STORY_ISO2[name] || "") || "\u26BD";
}

const WC_HISTORY = {
  "Brazil":[5,"Champions \u00d75 (last 2002)"],"Germany":[4,"Champions \u00d74 (last 2014)"],
  "Argentina":[3,"Champions \u00d73 (2022)"],"France":[2,"Champions \u00d72 (2018)"],
  "Spain":[1,"Champions (2010)"],"England":[1,"Champions (1966)"],
  "Netherlands":[0,"Runners-up \u00d73"],"Croatia":[0,"Runners-up (2018)"],"Sweden":[0,"Runners-up (1958)"],
  "Portugal":[0,"Third place (1966)"],"United States":[0,"Third place (1930)"],"Belgium":[0,"Third place (2018)"],
  "Austria":[0,"Third place (1954)"],"Morocco":[0,"Fourth place (2022)"],"Mexico":[0,"Quarterfinals (1970, 1986)"],
  "Switzerland":[0,"Quarterfinals"],"Colombia":[0,"Quarterfinals (2014)"],"Ghana":[0,"Quarterfinals (2010)"],
  "Japan":[0,"Round of 16 \u00d74"],"Senegal":[0,"Quarterfinals (2002)"],"Australia":[0,"Round of 16 (2006, 2022)"],
  "Ecuador":[0,"Round of 16 (2006)"],"Norway":[0,"Round of 16 (1998)"],"Ivory Coast":[0,"Group stage \u00d73"],
  "Paraguay":[0,"Quarterfinals (2010)"],"Egypt":[0,"Group stage"],"Canada":[0,"First finals since 1986"],
  "DR Congo":[0,"Debut era"],"Cape Verde":[0,"World Cup debut"],"Bosnia & Herz.":[0,"Group stage (2014)"],
  "Algeria":[0,"Round of 16 (2014)"],"South Africa":[0,"Hosts 2010"],
};

// ── derive all state from (picks, live, topology) — mirrors the Python globals ──
export function computeState(picks, live, topology) {
  const D = {};
  D.ENTRANT = picks.entrant; D.TIEBREAKER = picks.tiebreaker; D.FREEBIE_MATCH = picks.freebie_match;
  D.SEED = topology.seed || picks.seed || {};
  D.R32 = picks.r32.map(r => r.slice(0, 5));         // [code,date,a,b,pick]
  D.R16_WIN = picks.r16_win; D.QF_WIN = picks.qf_win; D.SF_WIN = picks.sf_win;
  D.CHAMP = picks.champ; D.RUNNER = picks.runner;
  D.REFRESHED = live.refreshed; D.CREDIT = "Built With Cowork \u2014 Imagined by Eric Lam";
  D.SYNC_URL = topology.sync_url || "";
  D.RES = {}; for (const k in live.res) D.RES[k] = live.res[k];
  D.KO_FIX = {}; for (const k in (live.ko_fix || {})) D.KO_FIX[k] = live.ko_fix[k];
  D.AUTO_HL = (live.auto_hl || []).map(e => e.slice());
  D.KO_FEED = {}; for (const k in topology.ko_feed) D.KO_FEED[k] = topology.ko_feed[k];
  D.KO_DATES = topology.ko_dates;
  D.R32_TIMES = topology.r32_times || {};
  D.R16_FIX = (topology.r16_fix || []).map(r => r.slice());
  D.POINTS_MAX = 80;
  D.KO_ROUND_ORDER = [
    ["Round of 16", "r16", [89,90,91,92,93,94,95,96].map(n => "M" + n)],
    ["Quarterfinals", "qf", [97,98,99,100].map(n => "M" + n)],
    ["Semifinals", "sf", ["M101", "M102"]],
    ["Final", "final", ["M104"]],
  ];

  // topology: feeder -> code
  const feedToCode = {};
  for (const k in D.KO_FEED) feedToCode[D.KO_FEED[k].join(",")] = k;
  const codeFor = (fa, fb) => feedToCode[fa + "," + fb] || feedToCode[fb + "," + fa];
  D.PICK_BY_CODE = {}; D.KO_ROUND = {};
  const deriveRound = (prev, wins, short) => {
    const codes = [];
    wins.forEach((w, j) => {
      const c = codeFor(prev[2 * j], prev[2 * j + 1]);
      D.PICK_BY_CODE[c] = w; D.KO_ROUND[c] = short; codes.push(c);
    });
    return codes;
  };
  D._r32codes = D.R32.map(m => m[0]);
  D._r16codes = deriveRound(D._r32codes, D.R16_WIN, "r16");
  D._qfcodes = deriveRound(D._r16codes, D.QF_WIN, "qf");
  D._sfcodes = deriveRound(D._qfcodes, D.SF_WIN, "sf");
  D._finalcodes = deriveRound(D._sfcodes, [D.CHAMP], "final");
  D.R16_PICK = {}; D._r16codes.forEach(c => { D.R16_PICK[c] = D.PICK_BY_CODE[c]; });
  D.CODE_OF_PICK = {};
  for (const c in D.PICK_BY_CODE) D.CODE_OF_PICK[D.KO_ROUND[c] + "|" + D.PICK_BY_CODE[c]] = c;

  const pairs = (s) => { const o = []; for (let i = 0; i < s.length; i += 2) o.push([s[i], s[i + 1]]); return o; };
  const r32_win = D.R32.map(m => m[4]);
  D.rounds = [["Round of 32", "r32", 1, D.R32.map(m => [m[2], m[3], m[4]])]];
  const build = (field, w, label, short, pts) =>
    [label, short, pts, pairs(field).map(([a, b], i) => [a, b, w[i]])];
  D.rounds.push(build(r32_win, D.R16_WIN, "Round of 16", "r16", 2));
  D.rounds.push(build(D.R16_WIN, D.QF_WIN, "Quarterfinals", "qf", 4));
  D.rounds.push(build(D.QF_WIN, D.SF_WIN, "Semifinals", "sf", 8));
  D.rounds.push(build(D.SF_WIN, [D.CHAMP], "Final", "final", 16));

  // eliminations: R32 losers + later-round losers
  D.ELIM = new Set();
  for (const [mc, dt, a, b, pk] of D.R32) {
    if (has(D.RES, mc)) { const w = D.RES[mc][2]; D.ELIM.add(w === b ? a : b); }
  }
  D.R32_ACTUAL_WINNERS = new Set(Object.keys(D.RES).map(mc => D.RES[mc][2]));
  D.r32_pick_actual = {};
  for (const m of D.R32) if (has(D.RES, m[0])) D.r32_pick_actual[m[4]] = D.RES[m[0]][2];
  for (const mc in D.KO_FEED) {
    if (has(D.RES, mc)) {
      const [fa, fb] = D.KO_FEED[mc];
      const wa = has(D.RES, fa) ? D.RES[fa][2] : null;
      const wb = has(D.RES, fb) ? D.RES[fb][2] : null;
      const w = D.RES[mc][2];
      const loser = w === wb ? wa : (w === wa ? wb : null);
      if (loser) D.ELIM.add(loser);
    }
  }
  D.KO_WINNERS_BY_ROUND = {};
  for (const mc in D.KO_FEED) {
    if (has(D.RES, mc)) {
      const r = D.KO_ROUND[mc];
      (D.KO_WINNERS_BY_ROUND[r] = D.KO_WINNERS_BY_ROUND[r] || new Set()).add(D.RES[mc][2]);
    }
  }

  // scoring helpers (bound to D)
  const PREV_ROUND = { r16: "r32", qf: "r16", sf: "qf", final: "sf" };
  const PREV_OF = { r16: "r32", qf: "r16", sf: "qf", final: "sf", champion: "final" };
  const NEXT_OF = { r32: "r16", r16: "qf", qf: "sf", sf: "final", final: "champion" };
  D.actual_advancer = (short, team) => {
    const prev = PREV_ROUND[short]; if (!prev) return null;
    if (prev === "r32") return D.r32_pick_actual[team] || null;
    const code = D.CODE_OF_PICK[prev + "|" + team];
    if (code && has(D.RES, code)) return D.RES[code][2];
    return null;
  };
  D.won_into = (team, short) => {
    const prev = PREV_OF[short];
    if (prev === "r32") return D.R32_ACTUAL_WINNERS.has(team);
    if (prev) return (D.KO_WINNERS_BY_ROUND[prev] || new Set()).has(team);
    return false;
  };
  D.reach_status = (team, short) => {
    if (D.won_into(team, short)) return "won";
    if (D.ELIM.has(team)) return "lost";
    return "pending";
  };
  D.out_at_round = (team, short) => {
    if (!D.ELIM.has(team)) return false;
    if (!D.won_into(team, short)) return false;
    const nxt = NEXT_OF[short];
    if (nxt && D.won_into(team, nxt)) return false;
    return true;
  };
  D.pick_status = (short, team, mc = null) => {
    if (short === "r32") {
      if (mc && has(D.RES, mc)) return team === D.RES[mc][2] ? "won" : "lost";
      return "pending";
    }
    const code = D.CODE_OF_PICK[short + "|" + team];
    if (code && has(D.RES, code)) return team === D.RES[code][2] ? "won" : "lost";
    return D.ELIM.has(team) ? "lost" : "pending";
  };

  // totals
  let CONF = 0, OUT = 0, LIVE = 0, r32_decided = 0, r32_correct = 0;
  for (const [mc, dt, a, b, pk] of D.R32) {
    const st = D.pick_status("r32", pk, mc);
    if (st === "won") { CONF += 1; r32_decided += 1; r32_correct += 1; }
    else if (st === "lost") { OUT += 1; r32_decided += 1; }
    else LIVE += 1;
  }
  for (const [label, short, pts, ms] of D.rounds.slice(1)) {
    for (const [a, b, w] of ms) {
      const st = D.pick_status(short, w);
      if (st === "won") CONF += pts; else if (st === "lost") OUT += pts; else LIVE += pts;
    }
  }
  D.CONF = CONF; D.OUT = OUT; D.LIVE = LIVE; D.ATTAIN = CONF + LIVE; D.DECIDED = CONF + OUT;
  D.r32_decided = r32_decided; D.r32_correct = r32_correct;
  D.N_R32 = D.R32.length; D.R32_DONE = D.R32.filter(m => has(D.RES, m[0])).length;
  D.CHAMP_ALIVE = !D.ELIM.has(D.CHAMP);
  D.CHAMP_STATUS = D.CHAMP_ALIVE ? "still alive" : "out";
  D.BUSTED = D.R32.filter(m => has(D.RES, m[0]) && D.RES[m[0]][2] !== m[4]).map(m => m[4]);
  for (const code in D.KO_FEED) {
    if (has(D.RES, code)) {
      const [fa, fb] = D.KO_FEED[code];
      const pk = D.PICK_BY_CODE[code];
      const wa = has(D.RES, fa) ? D.RES[fa][2] : null;
      const wb = has(D.RES, fb) ? D.RES[fb][2] : null;
      if (pk && (pk === wa || pk === wb) && pk !== D.RES[code][2]) D.BUSTED.push(pk);
    }
  }
  D.BUSTED_NOTE = D.BUSTED.length ? (D.BUSTED.join(" & ") + " branch" + (D.BUSTED.length > 1 ? "es" : "")) : "none yet";
  if (D.ELIM.has(D.CHAMP)) D.CHAMP_NOTE = `${D.CHAMP} is out`;
  else if (D.R32_ACTUAL_WINNERS.has(D.CHAMP)) D.CHAMP_NOTE = `Alive \u2014 ${D.CHAMP} has advanced so far`;
  else D.CHAMP_NOTE = "Your champion pick";
  D.FF_ALIVE = D.QF_WIN.filter(t => !D.ELIM.has(t)).length;

  // current-round + stage tracking
  D.ROUND_TAGS = { r32: "R32", r16: "R16", qf: "QF", sf: "SF", final: "Final" };
  D.ROUND_FULL = { r32: "Round of 32", r16: "Round of 16", qf: "Quarterfinals", sf: "Semifinals", final: "Final" };
  D.ROUND_SEQ = ["r32", "r16", "qf", "sf", "final"];
  D.ROUND_PICKS = { r16: D.R16_WIN, qf: D.QF_WIN, sf: D.SF_WIN, final: [D.CHAMP] };
  D.STAGE_ROUNDS = [["Round of 32", "r32", "Jun 28\u2013Jul 3", D.R32_DONE, D.N_R32]];
  const koDates = { r16: "Jul 4\u20137", qf: "Jul 9\u201311", sf: "Jul 14\u201315", final: "Sun Jul 19 \u00b7 MetLife" };
  for (const [label, short, codes] of D.KO_ROUND_ORDER) {
    D.STAGE_ROUNDS.push([label, short, koDates[short], codes.filter(mc => has(D.RES, mc)).length, codes.length]);
  }
  D.CURRENT_ROUND = (() => {
    for (const [l, short, dates, done, total] of D.STAGE_ROUNDS) if (total === 0 || done < total) return short;
    return D.STAGE_ROUNDS[D.STAGE_ROUNDS.length - 1][1];
  })();
  const cur = D.STAGE_ROUNDS.find(r => r[1] === D.CURRENT_ROUND) || D.STAGE_ROUNDS[0];
  D.CUR_LABEL = cur[0]; D.CUR_DONE = cur[3]; D.CUR_TOTAL = cur[4]; D.CUR_REMAIN = D.CUR_TOTAL - D.CUR_DONE;
  D.round_tally = (short) => {
    let seq;
    if (short === "r32") seq = D.R32.map(([mc, dt, a, b, pk]) => D.pick_status("r32", pk, mc));
    else seq = (D.ROUND_PICKS[short] || []).map(w => D.pick_status(short, w));
    const corr = seq.filter(s => s === "won").length;
    const dec = seq.filter(s => s !== "pending").length;
    return [corr, dec, seq.length - dec];
  };
  [D.CUR_CORR, D.CUR_DEC, D.CUR_LIVE] = D.round_tally(D.CURRENT_ROUND);
  const ci = D.ROUND_SEQ.indexOf(D.CURRENT_ROUND);
  D.NEXT_ROUND = ci >= 0 && ci < D.ROUND_SEQ.length - 1 ? D.ROUND_SEQ[ci + 1] : null;
  D.NEXT_LABEL = D.NEXT_ROUND ? D.ROUND_FULL[D.NEXT_ROUND] : "";
  D.CUR_SUBTITLE = (() => {
    const tag = D.ROUND_TAGS[D.CURRENT_ROUND] || D.CUR_LABEL;
    if (D.CUR_TOTAL && D.CUR_DONE >= D.CUR_TOTAL) return `All ${D.CUR_TOTAL} ${tag} final`;
    if (D.CUR_DONE === 0) return `${tag} up next \u00b7 ${D.CUR_TOTAL} to play`;
    return `${D.CUR_DONE} of ${D.CUR_TOTAL} ${tag} final \u00b7 ${D.CUR_REMAIN} to play`;
  })();
  D.LIVE_STATUS = (() => {
    const full = D.ROUND_FULL[D.CURRENT_ROUND] || D.CUR_LABEL;
    if (D.CUR_TOTAL && D.CUR_DONE >= D.CUR_TOTAL) return `The ${full} is complete.` + (D.NEXT_LABEL ? ` The ${D.NEXT_LABEL} is up next.` : "");
    if (D.CUR_DONE === 0) return `The ${full} is up next \u2014 ${D.CUR_TOTAL} games to play.`;
    const nxt = D.NEXT_LABEL ? `, then the ${D.NEXT_LABEL}` : "";
    return `The ${full} is underway \u2014 ${D.CUR_DONE} of ${D.CUR_TOTAL} final, ${D.CUR_REMAIN} to go${nxt}.`;
  })();
  D.STAGES = (() => {
    const stages = [["Group stage", "Ended Jun 27", "done"]];
    let activeTaken = false;
    for (const [label, short, dates, done, total] of D.STAGE_ROUNDS) {
      if (total > 0 && done === total) stages.push([label, `${dates} \u00b7 ${done}/${total}`, "done"]);
      else if (!activeTaken) { stages.push([label, total ? `${dates} \u00b7 ${done}/${total}` : dates, "active"]); activeTaken = true; }
      else stages.push([label, dates, "up"]);
    }
    return stages;
  })();

  // WCSTATS for hover cards (results-derived "y" + topology seed/history)
  D.team_2026 = (t) => D.ELIM.has(t) ? "Out \u2014 Round of 32" : (D.R32_ACTUAL_WINNERS.has(t) ? "Into the Round of 16" : "Round of 32 \u2014 to play");
  D.WCSTATS = {};
  for (const t in D.SEED) {
    const h = WC_HISTORY[t] || [0, "\u2014"];
    D.WCSTATS[t] = { t: h[0], b: h[1], y: D.team_2026(t), s: D.SEED[t] || "" };
  }
  return D;
}

const seedOf = (D, t) => D.SEED[t] || "";

// ── bracket ───────────────────────────────────────────────────────────────────
function r32_cell(D, team, picked, decided, real_winner, freebie) {
  const cls = ["team"]; let badge = "";
  if (decided) {
    if (picked && real_winner) { cls.push("adv"); badge = '<span class="rb ok">\u2713</span>'; }
    else if (picked && !real_winner) { cls.push("busted"); badge = '<span class="rb no">\u2715</span>'; }
    else if (!picked && real_winner) { cls.push("realadv"); badge = '<span class="rb up">\u25B2</span>'; }
    else cls.push("out");
  } else cls.push(picked ? "adv" : "out");
  const sd = seedOf(D, team), sh = sd ? `<span class="seed">${esc(sd)}</span>` : "";
  const ftag = freebie ? '<span class="tt" title="Freebie \u2014 Canada 1\u20130 South Africa, auto-credited">\u{1F381}</span>' : "";
  return `<div class="${cls.join(" ")}" data-team="${esc(team)}" data-round="r32" tabindex="0">` +
    `<span class="fav-bar"></span>${sh}<span class="tname">${esc(team)}</span>${ftag}${badge}</div>`;
}
function pickBox(D, team, picked, short, champ, st) {
  const cls = ["team", "st-" + st];
  if (champ) cls.push("champ");
  if (picked && !champ) cls.push("advancer");
  const gone = (st === "won" && D.out_at_round(team, short));
  if (gone) cls.push("gone");
  const badge = st === "won" ? (gone ? "" : '<span class="rb ok">\u2713</span>') : (st === "lost" ? '<span class="rb no">\u2715</span>' : "");
  const tag = champ ? '<span class="tt">\u{1F3C6}</span>' : "";
  const chev = (picked && !champ) ? '<span class="adv-arrow" title="you have this team advancing">\u203A</span>' : "";
  const sd = seedOf(D, team), sh = sd ? `<span class="seed">${esc(sd)}</span>` : "";
  return `<div class="${cls.join(" ")}" data-team="${esc(team)}" data-round="${short}" tabindex="0">` +
    `<span class="fav-bar"></span>${sh}<span class="tname">${esc(team)}</span>${tag}${badge}${chev}</div>`;
}
function laterCell(D, team, picked, short, champ = false, actual = null, mode = "actual") {
  if (mode === "picked") return pickBox(D, team, picked, short, champ, D.reach_status(team, short));
  const st = D.reach_status(team, short);
  if (st !== "won" && D.ELIM.has(team)) {
    if (actual) {
      const sd = seedOf(D, actual), sh = sd ? `<span class="seed">${esc(sd)}</span>` : "";
      const gone = D.ELIM.has(actual);
      const cls = "team st-actual" + (gone ? " gone" : "");
      const rnd = { r16: "Round of 16", qf: "Quarterfinal", sf: "Semifinal", final: "Final" }[short] || "this round";
      let tip;
      if (actual === team) tip = `${actual} reached the ${rnd}` + (gone ? ", but is now out" : "");
      else if (gone) tip = `${actual} advanced in your ${team} pick's place, but is now out`;
      else tip = `actually advanced \u2014 you picked ${team}`;
      return `<div class="${cls}" data-team="${esc(actual)}" data-round="${short}" tabindex="0">` +
        `<span class="fav-bar"></span>${sh}<span class="tname">${esc(actual)}</span>` +
        `<span class="rb up" title="${esc(tip)}">\u25B2</span></div>`;
    }
    return '<div class="team blank"><span class="tname">&nbsp;</span></div>';
  }
  return pickBox(D, team, picked, short, champ, st);
}
export function buildBracket(D, mode = "actual") {
  const cols = [];
  const cells = [];
  for (const [mc, dt, a, b, pk] of D.R32) {
    const dec = has(D.RES, mc), rw = dec ? D.RES[mc][2] : null;
    let cap;
    if (dec) {
      const [gA, gB, w, note] = D.RES[mc];
      cap = `<div class="mscore">${esc(a)} ${gA}${DASH}${gB} ${esc(b)}${note ? " \u00b7 " + note : ""}</div>`;
    } else cap = `<div class="mscore up">kick-off ${esc(dt)}</div>`;
    const fb = (mc === D.FREEBIE_MATCH);
    cells.push('<div class="match" data-status="' + D.pick_status("r32", pk, mc) + '"><div class="mlabel">' + esc(mc) + ' \u00b7 ' + esc(dt) + '</div>' + cap +
      r32_cell(D, a, pk === a, dec, rw === a, fb && pk === a) +
      r32_cell(D, b, pk === b, dec, rw === b, fb && pk === b) + '</div>');
  }
  cols.push('<div class="round"><div class="rhead">Round of 32<span>' + `${D.R32_DONE} of ${D.N_R32} final` + '</span></div><div class="matches">' + cells.join("") + '</div></div>');
  const meta = [["Round of 16", "r16", "Jul 4\u20137", D.rounds[1][3]], ["Quarterfinals", "qf", "Jul 9\u201311", D.rounds[2][3]],
    ["Semifinals", "sf", "Jul 14\u201315", D.rounds[3][3]], ["Final", "final", "Jul 19", D.rounds[4][3]]];
  const roundCodes = { r16: D._r16codes, qf: D._qfcodes, sf: D._sfcodes, final: D._finalcodes };
  const r16day = {}; for (const [mc, day] of D.R16_FIX) r16day[mc] = day;
  for (const [label, short, sub, ms] of meta) {
    const cc = [];
    const codes = roundCodes[short] || [];
    ms.forEach(([a, b, w], j) => {
      const isf = (label === "Final");
      const aa = D.actual_advancer(short, a), ab = D.actual_advancer(short, b);
      const code = j < codes.length ? codes[j] : "";
      const when = r16day[code] || "";
      const lab = code ? (esc(code) + (when ? " \u00b7 " + esc(when) : "")) : "";
      const mlab = lab ? `<div class="mlabel up">${lab}</div>` : "";
      cc.push('<div class="match">' + mlab + laterCell(D, a, w === a, short, isf && w === a, aa, mode) + laterCell(D, b, w === b, short, isf && w === b, ab, mode) + '</div>');
    });
    cols.push(`<div class="round"><div class="rhead">${esc(label)}<span>${esc(sub)}</span></div><div class="matches">` + cc.join("") + '</div></div>');
  }
  cols.push('<div class="round champcol"><div class="rhead">Champion<span>your pick</span></div><div class="matches">' +
    '<div class="match">' + laterCell(D, D.CHAMP, true, "champion", true, null, mode) +
    '<div class="champ-note">' + esc(D.CHAMP_NOTE) + '</div></div></div></div>');
  return `<div class="bracket mode-${mode}"><svg class="bksvg" aria-hidden="true"></svg>` + cols.join("") + '</div>';
}

// ── scorecard ───────────────────────────────────────────────────────────────
function scrow(pid, short, pts, pick, detail, def, a, b) {
  return `<div class="scrow" data-pick="${pid}" data-round="${short}" data-pts="${pts}" ` +
    `data-default="${def}" data-team="${esc(a)}|${esc(b)}">` +
    `<div class="tc"><span class="rpill r-${short}">${esc(short.toUpperCase())}</span></div>` +
    `<div class="tc match-cell"><span class="win">${esc(pick)}</span>` +
    `<span class="det">${detail}</span></div>` +
    `<div class="tc pts-cell">${pts}<span class="ptsu">pt${pts > 1 ? "s" : ""}</span></div>` +
    `<div class="tc seg-cell"><div class="seg" role="group">` +
    `<button data-set="won" title="Correct">\u2713</button>` +
    `<button data-set="pending" title="Not decided">\u2013</button>` +
    `<button data-set="lost" title="Wrong / out">\u2715</button></div></div></div>`;
}
export function buildScorecard(D) {
  const rows = [];
  for (const [mc, dt, a, b, pk] of D.R32) {
    const st = D.pick_status("r32", pk, mc), pid = "r32-" + mc;
    let detail;
    if (has(D.RES, mc)) {
      const [gA, gB, w, note] = D.RES[mc], loser = w === b ? a : b;
      if (st === "won") detail = `beat ${esc(loser)} ${a === w ? gA : gB}${DASH}${a === w ? gB : gA}${note ? " (" + note + ")" : ""}`;
      else detail = `lost to ${esc(w)} ${gA}${DASH}${gB}${note ? " (" + note + ")" : ""}`;
    } else detail = `vs ${esc(pk === a ? b : a)} \u00b7 ${esc(dt)}`;
    rows.push(scrow(pid, "r32", 1, pk, detail, st, a, b));
  }
  const intoNext = { r16: "into the quarterfinals", qf: "into the semifinals", sf: "into the Final", final: "champions \u{1F3C6}" };
  const throughNext = { r16: "through to the quarterfinals", qf: "through to the semifinals", sf: "through to the Final", final: "lifted the trophy \u{1F3C6}" };
  const toReach = { r16: "to reach the quarterfinals", qf: "to reach the semifinals", sf: "to reach the Final", final: "to lift the trophy" };
  for (const [label, short, pts, ms] of D.rounds.slice(1)) {
    ms.forEach(([a, b, w], i) => {
      const st = D.pick_status(short, w), pid = `${short}-${i}`, code = D.CODE_OF_PICK[short + "|" + w];
      let detail;
      if (st === "won") {
        if (code && has(D.RES, code)) { const [gA, gB, ww, note] = D.RES[code]; detail = `won ${gA}${DASH}${gB}${note ? " (" + note + ")" : ""} \u2014 ${intoNext[short]}`; }
        else detail = throughNext[short];
      } else if (st === "lost") {
        const parts = new Set();
        if (code) for (const f of D.KO_FEED[code]) if (has(D.RES, f)) parts.add(D.RES[f][2]);
        if (code && has(D.RES, code) && parts.has(w)) { const [gA, gB, ww, note] = D.RES[code]; detail = `lost to ${esc(ww)} ${gA}${DASH}${gB}${note ? " (" + note + ")" : ""}`; }
        else detail = "out \u2014 pick eliminated earlier";
      } else detail = toReach[short];
      rows.push(scrow(pid, short, pts, w, detail, st, a, b));
    });
  }
  const head = '<div class="scrow schead"><div class="tc">Round</div><div class="tc">Your pick &amp; result</div>' +
    '<div class="tc">Value</div><div class="tc">Status</div></div>';
  return '<div class="scard" id="scard">' + head + rows.join("") + '</div>';
}
export function buildScorebar(D) {
  return '<div class="scorebar glass" id="scorebar"><div class="sb-main">' +
    `<div class="sb-big"><span id="scConfirmed">${D.CONF}</span><span class="sb-slash">/ ${D.POINTS_MAX}</span></div>` +
    '<div class="sb-cap" title="Settled = points you\u2019ve already won or lost. Still-live points aren\u2019t counted here yet, so this total grows \u2014 and can differ between brackets \u2014 as your picks get decided.">points confirmed \u00b7 <b id="scSoFar">' + `${D.CONF}/${D.DECIDED}` + '</b> settled</div>' +
    `<div class="sb-track"><i id="scBar" style="width:${Math.trunc(D.CONF / D.POINTS_MAX * 100)}%"></i></div></div>` +
    '<div class="sb-stats">' +
    `<div class="sb-stat s-win"><b id="scConfirmed2">${D.CONF}</b><span>confirmed</span></div>` +
    `<div class="sb-stat s-live"><b id="scLive">${D.LIVE}</b><span>still live</span></div>` +
    `<div class="sb-stat s-out"><b id="scOut">${D.OUT}</b><span>eliminated</span></div>` +
    `<div class="sb-stat s-max"><b id="scMax" data-max="${D.POINTS_MAX}">${D.ATTAIN}</b><span>still attainable</span></div>` +
    '</div></div>';
}
export function buildKpis(D) {
  const rnd_full = D.ROUND_FULL[D.CURRENT_ROUND] || D.CUR_LABEL;
  let rnd_note;
  if (D.CUR_REMAIN) rnd_note = `${D.CUR_REMAIN} game${D.CUR_REMAIN !== 1 ? "s" : ""} left`;
  else if (D.NEXT_LABEL) rnd_note = `${D.NEXT_LABEL} next`;
  else rnd_note = "round complete";
  const kpis = [
    ["Confirmed points", `<span id='kpiConfirmed'>${D.CONF}</span><span class='kunit'>/ ${D.POINTS_MAX}</span>`, "\u2705", "teal", `${D.r32_correct} of ${D.r32_decided} R32 picks right`],
    [rnd_full, `${D.CUR_CORR}<span class='kunit'>/ ${D.CUR_DEC}</span>`, "\u26BD", "blue", rnd_note],
    ["Still live", `<span id='kpiLive'>${D.LIVE}</span>`, "\u26A1", "blue", "across your open picks"],
    ["Max attainable", `${D.ATTAIN}`, "\u{1F3AF}", "green", "if your path holds"],
    ["Champion pick", D.CHAMP, "\u{1F3C6}", "gold", D.CHAMP_STATUS],
    ["Points lost", `${D.OUT}`, "\u{1F6AB}", "red", D.BUSTED_NOTE],
  ];
  return kpis.map(([l, v, ic, t, n]) => `<div class="glass kpi t-${t}"><div class="kpi-ic">${ic}</div>` +
    `<div class="kpi-l">${esc(l)}</div><div class="kpi-v">${v}</div><div class="kpi-n">${esc(n)}</div></div>`).join("");
}
export function buildFinalfour(D) {
  const out = [];
  for (const tm of D.QF_WIN) {
    const role = tm === D.CHAMP ? "Champion" : (tm === D.RUNNER ? "Runner-up" : "Semifinalist");
    const alive = !D.ELIM.has(tm);
    const cls = tm === D.CHAMP ? "ff-champ" : (tm === D.RUNNER ? "ff-run" : "");
    const dot = alive ? '<span class="ff-live">\u25CF alive</span>' : '<span class="ff-dead">\u2715 out</span>';
    out.push(`<div class="ff ${cls}" data-team="${esc(tm)}"><span class="ff-seed">${esc(seedOf(D, tm))}</span>` +
      `<span class="ff-name">${esc(tm)}</span><span class="ff-role">${role} \u00b7 ${dot}</span></div>`);
  }
  return out.join("");
}

// ── "How it played out" story ─────────────────────────────────────────────────
const STORY_ROUND_NAME = { 0: "Round of 32", 1: "Round of 16", 2: "Quarterfinal", 3: "Semifinal", 4: "Final" };
const STORY_LEVEL_PTS = [1, 2, 4, 8, 16];
const STORY_KO_LEVEL = { r16: 1, qf: 2, sf: 3, final: 4 };
function levelsPicked(D, team) {
  const lv = [0];
  if (D.R16_WIN.includes(team)) lv.push(1);
  if (D.QF_WIN.includes(team)) lv.push(2);
  if (D.SF_WIN.includes(team)) lv.push(3);
  if (team === D.CHAMP) lv.push(4);
  return lv;
}
function forfeited(D, team, elimLevel) {
  return levelsPicked(D, team).filter(l => l >= elimLevel).reduce((s, l) => s + STORY_LEVEL_PTS[l], 0);
}
function collectBusts(D) {
  const busts = [];
  for (const [mc, dt, a, b, pk] of D.R32) {
    if (has(D.RES, mc)) { const [gA, gB, w, note] = D.RES[mc]; if (pk !== w) busts.push([0, codeNum(mc), pk, w, a, b, gA, gB, note]); }
  }
  for (const code in D.KO_FEED) {
    if (has(D.RES, code)) {
      const [fa, fb] = D.KO_FEED[code];
      const wa = has(D.RES, fa) ? D.RES[fa][2] : null, wb = has(D.RES, fb) ? D.RES[fb][2] : null;
      const pk = D.PICK_BY_CODE[code]; const [gA, gB, w, note] = D.RES[code];
      if (pk && (pk === wa || pk === wb) && pk !== w) busts.push([STORY_KO_LEVEL[D.KO_ROUND[code]], codeNum(code), pk, w, wa, wb, gA, gB, note]);
    }
  }
  return busts;
}
export function storyCards(D) {
  const cards = [];
  const played = D.ROUND_SEQ.map(s => [s, D.round_tally(s)]);
  const bits = played.filter(([s, [c, d, l]]) => d).map(([s, [c, d, l]]) => `${c} of ${d} in the ${D.ROUND_FULL[s]}`);
  const tot_c = played.reduce((a, [s, [c]]) => a + c, 0);
  const tot_d = played.reduce((a, [s, [c, d]]) => a + d, 0);
  if (!bits.length) cards.push(["\u26BD", "The story so far", "Kicking off", "No games are final yet \u2014 your first results will land here as they finish."]);
  else {
    const head = tot_c === tot_d ? "Perfect run" : (tot_c * 2 >= tot_d ? "Holding strong" : "Bumpy road");
    const body = bits.join(" \u00b7 ") + `. ${D.CONF} points banked, ${D.LIVE} still live.`;
    cards.push([tot_c === tot_d ? "\u2705" : "\u{1F4CA}", `${tot_c} of ${tot_d} picks right so far`, head, body]);
  }
  const busts = collectBusts(D);
  if (busts.length) {
    busts.sort((x, y) => (forfeited(D, y[2], y[0]) - forfeited(D, x[2], x[0])) || (y[0] - x[0]) || (x[1] - y[1]));
    const [lvl, _n, pk, w, a, b, gA, gB, note] = busts[0];
    const sc = `${a} ${gA}${DASH}${gB} ${b}` + (note ? ` (${note})` : "");
    const forfeit = forfeited(D, pk, lvl), n = busts.length;
    const lead = lvl === 0 ? `${w} knocked out your ${pk} pick \u2014 ${sc}.` : `${w} ended your ${pk} run in the ${STORY_ROUND_NAME[lvl]} \u2014 ${sc}.`;
    const tail = n > 1 ? ` It's the costliest of ${n} branches that have busted, ${D.OUT} points gone in all.` : ` That's ${forfeit} point${forfeit !== 1 ? "s" : ""} off your board.`;
    cards.push([teamEmoji(w), "Biggest swing", `${w} over ${pk}`, lead + tail]);
  } else cards.push(["\u{1F3AF}", "Clean sheet", "No busted branches yet", "Every team you've backed so far is still standing \u2014 nothing off your board."]);
  const ce = teamEmoji(D.CHAMP);
  if (D.ELIM.has(D.CHAMP)) cards.push([ce, "What's at stake", `${D.CHAMP} is out`, `Your title pick is gone, so the Champion\u2019s 16 points are off the board \u2014 ${D.ATTAIN} still attainable.`]);
  else {
    const ff = D.QF_WIN.filter(t => !D.ELIM.has(t)).join(", ") || "\u2014";
    const nxt = D.NEXT_LABEL ? ` Up next: the ${D.NEXT_LABEL}.` : "";
    cards.push([ce, "What's at stake", `${D.CHAMP} still standing`, `${D.CHAMP} is alive, with ${D.FF_ALIVE} of your final four (${ff}) still in it.${nxt}`]);
  }
  return cards.slice(0, 3);
}
export function buildStory(D) {
  return storyCards(D).map(([ic, tag, ti, bd]) => `<div class="glass story"><div class="story-ic">${ic}</div>` +
    `<div class="story-tag">${esc(tag)}</div><div class="story-title">${esc(ti)}</div>` +
    `<div class="story-body">${esc(bd)}</div></div>`).join("");
}
export function buildStages(D) {
  const dot = { done: "\u25CF", active: "\u25C9", up: "\u25CB" };
  return D.STAGES.map(([n, d, st]) => `<div class="stage s-${st}"><span class="sdot">${dot[st]}</span>` +
    `<div><div class="sname">${esc(n)}</div><div class="sdate">${esc(d)}</div></div></div>`).join("");
}
export function buildResultsPanel(D) {
  const rows = [];
  for (const [mc, dt, a, b, pk] of D.R32) {
    if (has(D.RES, mc)) {
      const [gA, gB, w, note] = D.RES[mc], ok = (w === pk);
      const badge = ok ? '<span class="res-ok">\u2713 you</span>' : '<span class="res-no">\u2715 you</span>';
      rows.push(`<div class="rr"><div class="rr-m">${esc(mc)}</div>` +
        `<div class="rr-s"><b class="${w === a ? "w" : "l"}">${esc(a)}</b> ${gA}${DASH}${gB} <b class="${w === b ? "w" : "l"}">${esc(b)}</b>` +
        `${note ? " <i>" + note + "</i>" : ""}</div><div class="rr-p">${badge}</div></div>`);
    }
  }
  const up = [];
  for (const [mc, dt, a, b, pk] of D.R32) {
    if (!has(D.RES, mc)) {
      const [d, et, ct, ptz] = D.R32_TIMES[mc] || [dt, "", "", ""];
      up.push(`<div class="rr up"><div class="rr-m">${esc(mc)}</div>` +
        `<div class="rr-s">${esc(a)} vs ${esc(b)}<span class="rr-t">${d} \u00b7 ${ptz} PT \u00b7 ${ct} CT \u00b7 ${et} ET</span></div>` +
        `<div class="rr-p"><span class="res-soon">your pick: ${esc(pk)}</span></div></div>`);
    }
  }
  return '<div class="glass rrbox res-panel" data-round="r32"><div class="rr-h">Round of 32 results \u00b7 your pick ' +
    `<b>${D.r32_correct}/${D.r32_decided}</b></div>` + rows.join("") +
    '<div class="rr-h" style="margin-top:12px">Still to play</div>' + up.join("") + '</div>';
}
export function buildRoundResultsPanel(D, label, short, codes) {
  const r16day = {}; for (const [mc, day, a, b, et, ct, ptz] of D.R16_FIX) r16day[mc] = [day, et, ct, ptz];
  const rows = []; let done = 0, dec = 0, corr = 0;
  for (const mc of codes) {
    const [fa, fb] = D.KO_FEED[mc];
    const a = has(D.RES, fa) ? D.RES[fa][2] : null, b = has(D.RES, fb) ? D.RES[fb][2] : null;
    const pk = D.PICK_BY_CODE[mc];
    if (has(D.RES, mc)) {
      done++; dec++;
      const [gA, gB, w, note] = D.RES[mc]; const an = a || "?", bn = b || "?";
      let badge;
      if (pk === w) { badge = '<span class="res-ok">\u2713 you</span>'; corr++; }
      else if (D.ELIM.has(pk)) badge = '<span class="res-no">\u2715 pick out</span>';
      else badge = '<span class="res-no">\u2715 you</span>';
      const sc = `<b class="${w === an ? "w" : "l"}">${esc(an)}</b> ${gA}${DASH}${gB} ` +
        `<b class="${w === bn ? "w" : "l"}">${esc(bn)}</b>` + (note ? ' <i>' + esc(note) + '</i>' : '');
      rows.push(`<div class="rr"><div class="rr-m">${esc(mc)}</div><div class="rr-s">${sc}</div><div class="rr-p">${badge}</div></div>`);
    } else {
      let when;
      if (has(D.KO_FIX, mc)) { const [day, et, ct, ptz] = D.KO_FIX[mc]; when = `${day} \u00b7 ${ptz} PT \u00b7 ${ct} CT \u00b7 ${et} ET`; }
      else if (short === "r16" && r16day[mc]) { const [day, et, ct, ptz] = r16day[mc]; when = `${day} \u00b7 ${ptz} PT \u00b7 ${ct} CT \u00b7 ${et} ET`; }
      else when = D.KO_DATES[short];
      const ta = a || ("Winner " + fa), tb = b || ("Winner " + fb);
      let pkt;
      if (pk && D.ELIM.has(pk)) pkt = `<span class="res-no">pick ${esc(pk)} out</span>`;
      else if (pk) pkt = `<span class="res-soon">your pick: ${esc(pk)}</span>`;
      else pkt = "";
      rows.push(`<div class="rr up"><div class="rr-m">${esc(mc)}</div>` +
        `<div class="rr-s">${esc(ta)} vs ${esc(tb)}<span class="rr-t">${when}</span></div>` +
        `<div class="rr-p">${pkt}</div></div>`);
    }
  }
  const acc = dec ? `${corr}/${dec}` : "\u2014";
  return `<div class="glass rrbox res-panel" data-round="${short}">` +
    `<div class="rr-h">${esc(label)} results \u00b7 your pick <b>${acc}</b> \u00b7 ${done}/${codes.length} final</div>` +
    rows.join("") + '</div>';
}
export function buildHighlights(D) {
  const HL = [...(D.AUTO_HL)];  // FEATURED is empty
  return HL.map(([ic, tag, ti, wh, bd]) => `<div class="glass story"><div class="story-ic">${ic}</div>` +
    `<div class="story-tag">${esc(tag)}</div><div class="story-title">${esc(ti)}</div>` +
    `<div class="story-when">\u{1F4C5} ${esc(wh)}</div>` +
    `<div class="story-body">${esc(bd)}</div></div>`).join("");
}
export function buildLegend() {
  const items = [
    ['<span class="lg-box lg-won">\u2713</span>', "Your pick \u2014 won / through"],
    ['<span class="lg-box lg-lost">\u2715</span>', "Your pick \u2014 out"],
    ['<span class="lg-line lg-line-won"></span>', "Your path so far (correct)"],
    ['<span class="lg-line lg-line-pend"></span>', "Your pick \u2014 still to play"],
    ['<span class="lg-box lg-actual">\u25B2</span>', "Who actually advanced (you had the other team)"],
    ['<span class="lg-line lg-line-actual"></span>', "Actual path"],
    ['<span class="lg-chev">\u203A</span>', "You have this team advancing"],
    ['<span class="lg-box lg-champ">\u{1F3C6}</span>', "Your champion pick"],
  ];
  return '<div class="legend glass"><span class="lg-cap">How to read this bracket</span>' +
    items.map(([sw, t]) => `<div class="lg-item">${sw}<span>${esc(t)}</span></div>`).join("") + '</div>';
}
function chip(D, t) {
  const el = D.ELIM.has(t) ? " eliminated" : "";
  return `<button class="chip${el}" data-team="${esc(t)}"><span class="star" data-star="${esc(t)}" role="button" aria-label="favorite" tabindex="0">\u2606</span>` +
    `<span class="cseed">${esc(seedOf(D, t))}</span><span class="ctxt">${esc(t)}</span></button>`;
}
function shead(sid, icon, title, cap) {
  return `<div class="shead" id="${sid}">` +
    `<button class="sec-toggle" type="button" aria-expanded="true" aria-controls="${sid}-body" aria-label="Collapse section">\u25BE</button>` +
    `<span class="tile">${icon}</span><h2>${title}</h2>` +
    `<span class="cap">${cap}</span></div>` +
    `<div class="sec-body" id="${sid}-body">`;
}

// ── the full dashboard (inner HTML of div.wrap) ───────────────────────────────
export function renderDashboard(picks, live, topology) {
  const D = computeState(picks, live, topology);
  if (typeof window !== "undefined") window.WCSTATS = D.WCSTATS;  // hover-card stats
  const r32_win = D.R32.map(m => m[4]);
  const syncBtn = D.SYNC_URL ? `<a class="synbtn glass" id="syncBtn" href="${esc(D.SYNC_URL)}" target="_blank" rel="noopener" title="Pull the latest results"><span class="syn-ic">\u{1F504}</span><span class="syn-tx">Sync now</span></a>` : "";
  return '<div class="topbar"><div class="brand"><span class="orb"></span><div>2026 FIFA World Cup - Bracket Dashboard - MSFT SLED<small>Live results vs your picks</small></div></div>' +
    '<div class="upd-group">' +
    `<div class="refreshed glass" id="topRefreshed" title="Results auto-sync from FIFA\u2019s live feed a few times a day \u2014 no manual refresh needed"><span class="rf-dot"></span>Live \u00b7 updated ${D.REFRESHED}</div>` +
    syncBtn + '</div>' +
    '<div class="modes glass">' +
    '<div class="theme-toggle" role="group" aria-label="Light or dark theme">' +
    '<button data-mode="light" class="tg-ic" title="Light">\u2600\uFE0F</button>' +
    '<button data-mode="dark" class="tg-ic on" title="Dark">\u{1F319}</button>' +
    '</div>' +
    '<button data-mode="easy" class="mode-lbl" title="Easy reading mode \u2014 larger, higher-contrast text"><span class="mi">\u{1F453}</span> Easy</button>' +
    '<div class="fun-wrap" id="funWrap"><button class="fun-btn" id="funBtn" aria-haspopup="true" aria-expanded="false" title="Fun themes"><span class="mi">\u{1F3A8}</span> Fun <span class="fun-car">\u25BE</span></button>' +
    '<div class="fun-menu glass" id="funMenu" role="menu">' +
    '<button data-mode="geocities" role="menuitem"><span class="fm-em">\u{1F310}</span> GeoCities</button>' +
    '<button data-mode="minecraft" role="menuitem"><span class="fm-em">\u26CF\uFE0F</span> Minecraft</button>' +
    '<button data-mode="winxp" role="menuitem"><span class="fm-em">\u{1FA9F}</span> Windows XP</button>' +
    '<button data-mode="doodle" role="menuitem"><span class="fm-em">\u270F\uFE0F</span> Doodle</button>' +
    '</div></div></div></div>' +
    '<div class="shell"><nav class="rail glass" id="rail">' +
    '<button class="navtoggle" id="navToggle" aria-expanded="false" aria-controls="railLinks">\u{1F4D1} Contents \u2630</button>' +
    '<div class="links" id="railLinks"><div class="rt">On this page</div>' +
    '<a href="#intro"><span class="ic">\u{1F50E}</span> Overview</a>' +
    '<a href="#sec-standing"><span class="ic">\u{1F4CA}</span> Live standing</a>' +
    '<a href="#sec-scorecard"><span class="ic">\u{1F9EE}</span> Scorecard</a>' +
    '<a href="#sec-r32"><span class="ic">\u26BD</span> Round-by-round results</a>' +
    '<a href="#sec-news"><span class="ic">\u{1F4F0}</span> Game facts</a>' +
    '<a href="#sec-bracket"><span class="ic">\u{1F5FA}\uFE0F</span> Bracket map</a>' +
    '<a href="#sec-finalfour"><span class="ic">\u{1F3C5}</span> Final four</a>' +
    '<a href="#sec-story"><span class="ic">\u2728</span> How it played out</a>' +
    '<a href="#sec-scoring"><span class="ic">\u{1F3AF}</span> Scoring &amp; schedule</a>' +
    '</div></nav><div class="content">' +
    `<section class="hero glass" id="intro"><div class="eyebrow">${esc(D.ENTRANT)} \u00b7 live results vs your picks</div>` +
    `<h1>Backing <span class="g">${esc(D.CHAMP)}</span> ${D.CHAMP_ALIVE ? "\u2014 and still in it" : "\u2014 but knocked out"}</h1>` +
    `<p class="sub">The <b>${esc(D.CUR_LABEL)}</b> is <b>${D.CUR_DONE} of ${D.CUR_TOTAL} final</b> \u2014 you're <b>${D.CUR_CORR} of ${D.CUR_DEC} right</b> this round, ` +
    `with <b>${D.CONF} points</b> banked and <b>${D.LIVE}</b> still live. Your champion ${esc(D.CHAMP)} is <b>${D.CHAMP_STATUS}</b>.` +
    (D.NEXT_LABEL ? ` The ${esc(D.NEXT_LABEL)} is up next.` : "") + '</p>' +
    '<div class="badges">' +
    `<span class="pill live"><span class="dot"></span>${D.CONF} pts confirmed</span>` +
    `<span class="pill"><span class="dot"></span>${esc(D.ROUND_TAGS[D.CURRENT_ROUND] || D.CUR_LABEL)} ${D.CUR_CORR}/${D.CUR_DEC}</span>` +
    `<span class="pill"><span class="dot"></span>Max attainable ${D.ATTAIN}</span>` +
    `<span class="pill"><span class="dot"></span>${esc(D.CHAMP)} ${D.CHAMP_ALIVE ? "alive" : "out"}</span></div>` +
    '<div class="composer"><span class="corb"></span><span class="plus">+</span>' +
    '<input id="search" type="text" placeholder="Track a team through the bracket \u2014 try England, Morocco, Paraguay\u2026" autocomplete="off">' +
    '<span class="mic">\u{1F3A4}</span><button class="clr" id="clear">Clear</button></div></section>' +
    '<div class="filterbar glass"><div class="chips">' + r32_win.map(t => chip(D, t)).join("") +
    '</div><label class="toggle"><input type="checkbox" id="favonly"><span class="tsw"></span>Favorites only</label><span class="count" id="count"></span></div>' +
    shead("sec-standing", "\u{1F4CA}", "Your live standing", "6 signals") +
    `<div class="kpigrid">${buildKpis(D)}</div>` + '</div>' +
    shead("sec-scorecard", "\u{1F9EE}", "Scorecard \u2014 your path, scored live", `${D.CONF} confirmed \u00b7 ${D.LIVE} live`) +
    '<div class="note"><b>How this is scored.</b> Results are pulled from live web coverage (ESPN, CBS Sports, FIFA) and matched to your Excel picks. ' +
    'A background job <b>auto-syncs the live feed a few times a day</b>, so scores update on their own \u2014 no refresh needed. ' +
    `The <b>${esc(D.CUR_LABEL)}</b> stands at <b>${D.CUR_DONE} of ${D.CUR_TOTAL}</b> \u2014 you sit on <b>${D.CONF} points</b> (${D.CUR_CORR}/${D.CUR_DEC} right this round). ` +
    `${esc(D.LIVE_STATUS)} Later rounds stay <b>pending</b> until they\u2019re played. ` +
    'Flip any row yourself as games finish \u2014 totals recompute and save on this device.</div>' +
    buildScorebar(D) + `<div class="glass">${buildScorecard(D)}</div>` +
    '<div style="text-align:right;margin-top:10px"><button class="chip" id="scReset" style="cursor:pointer">\u21BA Reset to live results</button></div>' + '</div>' +
    shead("sec-r32", "\u26BD", "Round-by-round results", D.CUR_SUBTITLE) +
    '<div class="res-toggle">' +
    `<button data-view="r32" class="${D.CURRENT_ROUND === "r32" ? "on" : ""}">Round of 32</button>` +
    D.KO_ROUND_ORDER.map(([label, short, codes]) => `<button data-view="${short}" class="${short === D.CURRENT_ROUND ? "on" : ""}">${esc(label)}</button>`).join("") +
    '</div>' +
    `<div class="res-wrap" data-view="${D.CURRENT_ROUND}">${buildResultsPanel(D)}` +
    D.KO_ROUND_ORDER.map(([label, short, codes]) => buildRoundResultsPanel(D, label, short, codes)).join("") +
    '</div>' + '</div>' +
    shead("sec-news", "\u{1F4F0}", "Game facts \u2014 recent games", "newest first") +
    `<div class="g3">${buildHighlights(D)}</div>` + '</div>' +
    shead("sec-bracket", "\u{1F5FA}\uFE0F", "Your bracket, marked up", "\u2713 hit \u00b7 \u2715 miss \u00b7 \u25B2 who went through") +
    buildLegend() +
    '<div class="brk-toggle"><button data-view="actual" class="on">Actual path</button><button data-view="picked">My picks</button></div>' +
    `<div class="glass brk-wrap" data-view="actual">${buildBracket(D, "actual")}${buildBracket(D, "picked")}</div>` + '</div>' +
    shead("sec-finalfour", "\u{1F3C5}", "Your final four", `${D.FF_ALIVE}/${D.QF_WIN.length} still alive`) +
    `<div class="ffgrid">${buildFinalfour(D)}</div>` + '</div>' +
    shead("sec-story", "\u2728", "How it played out", "so far") +
    `<div class="g3">${buildStory(D)}</div>` + '</div>' +
    shead("sec-scoring", "\u{1F3AF}", "Scoring &amp; schedule", "80 max") +
    '<div class="g2"><div class="glass" style="padding:20px"><div style="font-weight:700;margin-bottom:12px">Points double every round</div>' +
    '<div class="scard" style="padding:0">' +
    '<div class="scrow schead" style="grid-template-columns:1fr 70px 70px 70px"><div class="tc">Round</div><div class="tc">Games</div><div class="tc">Pts/pick</div><div class="tc">Max</div></div>' +
    '<div class="scrow" style="grid-template-columns:1fr 70px 70px 70px"><div class="tc">Round of 32</div><div class="tc">16</div><div class="tc">1</div><div class="tc">16</div></div>' +
    '<div class="scrow" style="grid-template-columns:1fr 70px 70px 70px"><div class="tc">Round of 16</div><div class="tc">8</div><div class="tc">2</div><div class="tc">16</div></div>' +
    '<div class="scrow" style="grid-template-columns:1fr 70px 70px 70px"><div class="tc">Quarterfinals</div><div class="tc">4</div><div class="tc">4</div><div class="tc">16</div></div>' +
    '<div class="scrow" style="grid-template-columns:1fr 70px 70px 70px"><div class="tc">Semifinals</div><div class="tc">2</div><div class="tc">8</div><div class="tc">16</div></div>' +
    '<div class="scrow" style="grid-template-columns:1fr 70px 70px 70px"><div class="tc"><b>Final (Champion)</b></div><div class="tc">1</div><div class="tc">16</div><div class="tc">16</div></div>' +
    '<div class="scrow" style="grid-template-columns:1fr 70px 70px 70px;border-top:1px solid var(--border)"><div class="tc"><b>Total</b></div><div class="tc">31</div><div class="tc"></div><div class="tc"><b>80</b></div></div>' +
    '</div><div style="font-size:.8rem;color:var(--muted);margin-top:12px;line-height:1.5">Each pick scored on its own; Champion is worth a full 16. ' +
    `Tiebreaker: total goals in the Final at the end of extra time \u2014 penalties don\u2019t count. Your tiebreaker: <b>${esc(D.TIEBREAKER)}</b>.</div></div>` +
    '<div class="glass" style="padding:20px"><div style="font-weight:700;margin-bottom:4px">Where the tournament stands</div>' +
    `<div style="font-size:.8rem;color:var(--muted);margin-bottom:8px">Live results as of ${D.REFRESHED} \u00b7 auto-syncs a few times a day</div>` +
    `<div class="stages" style="grid-template-columns:1fr;padding:0;gap:8px">${buildStages(D)}</div></div></div>` + '</div>' +
    '<div class="glass foot"><b>Sources.</b> Your picks, scoring, tiebreaker and any host bonus rule from your <b>SLED World Cup 2026 bracket workbook</b> and the challenge instructions. ' +
    'Match results, scores and kickoff times from <b>FIFA official match records</b> (fifa.com), corroborated by NBC Sports, CBS Sports, ESPN and Sporting News, for the 2026 FIFA World Cup. Kickoff times anchored to ET, converted to CT/PT. Hover-card country pedigree (titles, best finish) from public FIFA World Cup historical records.' +
    `<div class="src"><b>Status.</b> ${esc(D.LIVE_STATUS)} ` +
    `You have <b>${D.CONF} points</b> confirmed, <b>${D.LIVE}</b> live, max attainable <b>${D.ATTAIN}</b>. ` +
    `This is your personal, <b>unofficial</b> tally for Rob to review \u2014 his scoring is authoritative. Champion ${esc(D.CHAMP)} \u00b7 runner-up ${esc(D.RUNNER)}.</div>` +
    `<div class="src">Live results as of <b>${D.REFRESHED}</b> \u00b7 reading mode, favorites and any manual score edits are saved on this device.</div>` +
    '<div class="src">\u{1F3C6} Thank you to <b>Rob Brautigam</b> for hosting the 2026 FIFA World Cup bracket challenge for SLED.</div>' +
    (D.CREDIT ? `<div class="src credit">${esc(D.CREDIT)}</div>` : "") + '</div>' +
    '</div></div>';   // close .content, .shell
}
