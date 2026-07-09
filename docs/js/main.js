// main.js — glue: load topology + live results, handle upload/demo/import, render, and
// run the interaction layer after injection. All bracket parsing stays in the browser.
import { renderDashboard } from "./render.js";
import { initInteractions } from "./interact.js";
import { savePicks, loadPicks, clearPicks, exportPicks, resetWhatIfsIfChanged } from "./storage.js";
import { parseWorkbook, validateAgainstTopology, ValidationError } from "./parse-excel.js";
import { openBuilder } from "./builder.js";
import { buildShareUrl, readShareFromUrl } from "./share.js";

const $ = (s) => document.querySelector(s);
let TOPO = null, LIVE = null;
let CURRENT = null, IS_SHARED = false;
const DEFAULT_TITLE = document.title;

async function loadData() {
  const [t, l] = await Promise.all([
    fetch("data/topology.json").then(r => r.json()),
    fetch("data/results.json", { cache: "no-cache" }).then(r => r.json()),
  ]);
  TOPO = t; LIVE = l;
}

function showDashboard(picks, opts = {}) {
  const shared = opts.shared || null;   // { name } when viewing someone else's shared link
  const isDemo = !!opts.demo;
  CURRENT = picks;
  IS_SHARED = !!shared;
  if (!shared) resetWhatIfsIfChanged(picks);   // don't touch a visitor's own scratch when just viewing a link
  const app = $("#app");
  app.innerHTML = renderDashboard(picks, LIVE, TOPO);
  $("#landing").hidden = true;
  app.hidden = false;
  $("#viewerbar").hidden = false;
  $("#dab").hidden = false;

  const who = (shared && (shared.name || picks.entrant)) || "a friend";
  const poss = who + (/s$/i.test(who) ? "\u2019" : "\u2019s");      // Eric -> Eric's, James -> James'
  $("#vb-name").textContent = shared ? `${poss} bracket`
                                     : (picks.entrant || "your bracket") + (isDemo ? " (demo)" : "");
  const saved = $("#viewerbar .vb-saved"); if (saved) saved.hidden = !!shared || isDemo;
  const shHint = $("#viewerbar .vb-shared"); if (shHint) shHint.hidden = !shared;
  const clr = $("#vb-clear"); if (clr) clr.hidden = !!shared;      // nothing of theirs to clear in shared view
  const rep = $("#vb-replace"); if (rep) rep.textContent = shared ? "Make your own" : "New bracket";
  document.title = shared ? `${poss} bracket \u2014 World Cup 2026` : DEFAULT_TITLE;

  initInteractions();                                  // run the verbatim interaction layer
  if (window.__drawConn) setTimeout(window.__drawConn, 90);  // initial connector draw
  window.scrollTo(0, 0);
}

function accept(picks) { savePicks(picks); showDashboard(picks); }   // real bracket -> persist

function showError(problems) {
  const box = $("#errbox");
  box.innerHTML = '<div class="err-h">\u26A0\uFE0F That didn\u2019t look like a valid bracket</div><ul>' +
    problems.map(p => `<li>${String(p).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`).join("") +
    '</ul><div class="err-f">Fix the sheet and try again, or <button id="err-demo" class="linkbtn">view the demo bracket</button>.</div>';
  box.hidden = false;
  $("#err-demo").onclick = onDemo;
}

async function handleFile(file) {
  $("#errbox").hidden = true;
  try {
    const buf = await file.arrayBuffer();
    const picks = validateAgainstTopology(parseWorkbook(buf), TOPO);
    accept(picks);
  } catch (e) {
    showError(e instanceof ValidationError ? e.problems : ["Couldn\u2019t read that file: " + (e.message || e)]);
  }
}

async function onDemo() {
  try {
    const picks = await fetch("data/demo-picks.json").then(r => r.json());
    showDashboard(picks, { demo: true });   // preview only — the demo is not saved as "your" bracket
  } catch (e) { showError(["Couldn\u2019t load the demo bracket."]); }
}

// Small transient message (used by the share action).
let toastTimer = null;
function toast(msg) {
  const el = $("#toast"); if (!el) return;
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// Build a link that carries the currently-shown bracket and share/copy it.
async function shareCurrent() {
  if (!CURRENT || !TOPO) return;
  let url;
  try { url = buildShareUrl(CURRENT, TOPO); }
  catch (e) { toast("Couldn\u2019t build a link for this bracket."); return; }
  const who = CURRENT.entrant ? `${CURRENT.entrant}\u2019s` : "My";
  if (navigator.share) {
    try { await navigator.share({ title: `${who} World Cup 2026 bracket`, url }); return; }
    catch (e) { if (e && e.name === "AbortError") return; /* else fall back to copy */ }
  }
  try { await navigator.clipboard.writeText(url); toast("Share link copied \u2014 paste it to a friend"); }
  catch (e) { window.prompt("Copy this share link:", url); }
}

// Leave a shared-link view without erasing the visitor's own saved bracket.
function leaveShared() {
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}  // drop the #fragment
  const saved = loadPicks();
  if (saved) showDashboard(saved);   // restore their own bracket if they have one
  else showLanding();                // otherwise go build/upload — nothing of theirs is cleared
}

function showLanding() {
  CURRENT = null; IS_SHARED = false; document.title = DEFAULT_TITLE;
  const app = $("#app"); app.hidden = true; app.innerHTML = "";
  $("#viewerbar").hidden = true; $("#dab").hidden = true;
  $("#errbox").hidden = true;
  $("#landing").hidden = false;
  window.scrollTo(0, 0);
}

function toLanding() { clearPicks(); showLanding(); }   // "New bracket" / "Clear" — forget the saved bracket

function wire() {
  const fileInput = $("#file");
  $("#build").onclick = () => { if (TOPO) openBuilder(TOPO, accept, () => {}); };  // build -> save+show
  $("#pick").onclick = () => fileInput.click();
  fileInput.onchange = () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); };
  const dz = $("#drop");
  dz.addEventListener("click", () => fileInput.click());
  ["dragover", "dragenter"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });
  $("#demo").onclick = onDemo;
  $("#import").onclick = () => $("#importfile").click();
  $("#importfile").onchange = async () => {
    const f = $("#importfile").files[0]; if (!f) return;
    try { accept(validateAgainstTopology(JSON.parse(await f.text()), TOPO)); }
    catch (e) { showError(e instanceof ValidationError ? e.problems : ["That JSON wasn\u2019t a valid bracket: " + (e.message || e)]); }
  };
  $("#vb-replace").onclick = () => (IS_SHARED ? leaveShared() : toLanding());
  $("#vb-clear").onclick = toLanding;
  $("#vb-export").onclick = () => { const p = CURRENT || loadPicks(); if (p) exportPicks(p); };
  const shareBtn = $("#vb-share"); if (shareBtn) shareBtn.onclick = shareCurrent;
  const dab = $("#dab"); if (dab) dab.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
}

(async function () {
  try { const th = localStorage.getItem("wcb.theme"); if (th) document.documentElement.setAttribute("data-theme", th); } catch (e) {}
  wire();
  try { await loadData(); } catch (e) { console.warn("data load failed", e); }
  let shared = null;
  try { shared = TOPO ? readShareFromUrl(TOPO) : null; } catch (e) { shared = null; }
  if (shared) {
    try { showDashboard(shared.picks, { shared: { name: shared.name } }); return; } catch (e) { console.warn(e); }
  }
  const saved = loadPicks();
  if (saved) { try { showDashboard(saved); } catch (e) { console.warn(e); } }
})();
