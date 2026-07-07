// Scoring test: proves the point engine is accurate. An independent scorer built
// from first principles (R32=1, R16=2, QF=4, SF=8, Champion=16; a pick is won if the
// team actually won that match, lost if the team is out or the match went the other
// way, else still live) is compared against the engine's rendered scorecard across the
// demo bracket + thousands of random valid brackets. Also asserts the invariant that
// every bracket's points fully account to 80 (CONF + OUT + LIVE == POINTS_MAX).
// Run: node tests/scoring.mjs
import fs from "fs";
import { deriveStructure, teamsFor, buildPicks } from "../docs/js/builder.js";
import { renderDashboard } from "../docs/js/render.js";

const D = new URL("../docs/data/", import.meta.url);
const load = (n) => JSON.parse(fs.readFileSync(new URL(n, D)));
const topology = load("topology.json"), live = load("results.json"), demo = load("demo-picks.json");
const S = deriveStructure(topology);
const RES = live.res;
const aw = (c) => (RES[c] ? RES[c][2] : null);   // actual winner of a match code

// Independent elimination set: any team that lost a match that has been played.
const ELIM = new Set();
for (const m of S.r32) { const w = aw(m.code); if (w) ELIM.add(w === m.a ? m.b : m.a); }
for (const c of [...S.r16codes, ...S.qfcodes, ...S.sfcodes, S.finalcode]) {
  const w = aw(c); if (!w) continue;
  const [fa, fb] = S.koFeed[c];
  const ta = aw(fa), tb = aw(fb);
  if (ta && ta !== w) ELIM.add(ta);
  if (tb && tb !== w) ELIM.add(tb);
}

const PTS = [["r32", S.r32codes, 1], ["r16", S.r16codes, 2], ["qf", S.qfcodes, 4], ["sf", S.sfcodes, 8], ["final", [S.finalcode], 16]];
function refScore(sel) {
  let CONF = 0, OUT = 0, LIVE = 0;
  for (const [, codes, pts] of PTS) for (const c of codes) {
    const w = aw(c), pk = sel[c];
    if (w != null) { if (pk === w) CONF += pts; else OUT += pts; }
    else { if (ELIM.has(pk)) OUT += pts; else LIVE += pts; }
  }
  return { CONF, OUT, LIVE, DECIDED: CONF + OUT, ATTAIN: CONF + LIVE };
}
function engScore(sel) {
  const html = renderDashboard(buildPicks(topology, sel, "Test", 3), live, topology);
  return {
    CONF: +/<span id="scConfirmed">(\d+)<\/span>/.exec(html)[1],
    DECIDED: +/<b id="scSoFar">\d+\/(\d+)<\/b>/.exec(html)[1],
    ATTAIN: +/<b id="scMax"[^>]*>(\d+)<\/b>/.exec(html)[1],
  };
}
function demoSel() {
  const sel = {};
  demo.r32.forEach(m => sel[m[0]] = m[4]);
  S.r16codes.forEach((c, j) => sel[c] = demo.r16_win[j]);
  S.qfcodes.forEach((c, j) => sel[c] = demo.qf_win[j]);
  S.sfcodes.forEach((c, j) => sel[c] = demo.sf_win[j]);
  sel[S.finalcode] = demo.champ;
  return sel;
}
function randSel() {
  const sel = {};
  for (const round of S.rounds) for (const c of round.codes) {
    const [a, b] = teamsFor(S, c, sel); sel[c] = Math.random() < 0.5 ? a : b;
  }
  return sel;
}

let fails = 0, n = 0;
function check(name, sel) {
  n++;
  const ref = refScore(sel), eng = engScore(sel);
  if (ref.CONF + ref.OUT + ref.LIVE !== 80) { fails++; console.log(`  DIFF ${name}: invariant CONF+OUT+LIVE=${ref.CONF + ref.OUT + ref.LIVE} != 80`); return; }
  if (eng.CONF !== ref.CONF || eng.DECIDED !== ref.DECIDED || eng.ATTAIN !== ref.ATTAIN) {
    fails++; console.log(`  DIFF ${name}: ref=${JSON.stringify(ref)} eng=${JSON.stringify(eng)}`); return;
  }
  if (name === "demo") console.log(`  ok   demo: "${eng.CONF}/${eng.DECIDED} settled" · confirmed ${eng.CONF}/80 · attainable ${eng.ATTAIN}`);
}

check("demo", demoSel());
for (let i = 0; i < 3000; i++) check("rand#" + i, randSel());
console.log(fails ? `\nFAILED: ${fails}/${n}` : `\nSCORING OK: engine matches an independent scorer on all ${n} brackets; CONF+OUT+LIVE==80 always.`);
process.exit(fails ? 1 : 0);
