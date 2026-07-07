// main.js — glue: load topology + live results, handle upload/demo/import, render, and
// run the interaction layer after injection. All bracket parsing stays in the browser.
import { renderDashboard } from "./render.js";
import { initInteractions } from "./interact.js";
import { savePicks, loadPicks, clearPicks, exportPicks, resetWhatIfsIfChanged } from "./storage.js";
import { parseWorkbook, validateAgainstTopology, ValidationError } from "./parse-excel.js";
import { openBuilder } from "./builder.js";

const $ = (s) => document.querySelector(s);
let TOPO = null, LIVE = null;

async function loadData() {
  const [t, l] = await Promise.all([
    fetch("data/topology.json").then(r => r.json()),
    fetch("data/results.json", { cache: "no-cache" }).then(r => r.json()),
  ]);
  TOPO = t; LIVE = l;
}

function showDashboard(picks, isDemo = false) {
  resetWhatIfsIfChanged(picks);
  const app = $("#app");
  app.innerHTML = renderDashboard(picks, LIVE, TOPO);
  $("#landing").hidden = true;
  app.hidden = false;
  $("#viewerbar").hidden = false;
  $("#dab").hidden = false;
  $("#vb-name").textContent = (picks.entrant || "your bracket") + (isDemo ? " (demo)" : "");
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
    showDashboard(picks, true);   // preview only — the demo is not saved as "your" bracket
  } catch (e) { showError(["Couldn\u2019t load the demo bracket."]); }
}

function toLanding() {
  clearPicks();
  const app = $("#app"); app.hidden = true; app.innerHTML = "";
  $("#viewerbar").hidden = true; $("#dab").hidden = true;
  $("#errbox").hidden = true;
  $("#landing").hidden = false;
  window.scrollTo(0, 0);
}

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
  $("#vb-replace").onclick = toLanding;
  $("#vb-clear").onclick = toLanding;
  $("#vb-export").onclick = () => { const p = loadPicks(); if (p) exportPicks(p); };
  const dab = $("#dab"); if (dab) dab.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
}

(async function () {
  try { const th = localStorage.getItem("wcb.theme"); if (th) document.documentElement.setAttribute("data-theme", th); } catch (e) {}
  wire();
  try { await loadData(); } catch (e) { console.warn("data load failed", e); }
  const saved = loadPicks();
  if (saved) { try { showDashboard(saved); } catch (e) { console.warn(e); } }
})();
