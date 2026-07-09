// share.js — put a whole bracket into a link so friends can see whose is whose.
//
// The bracket is encoded into the URL *fragment* (the part after #). A fragment is
// never sent to any server, and nothing is stored: the URL itself carries the data.
// Opening such a link renders that person's bracket in a read-only "viewing" mode.
// A bare URL with no fragment behaves exactly as before, so old links keep working.
//
// Format:  #e=<display name, uri-encoded>&b=<payload>
//   payload = url-safe base64 of JSON [VER, entrant, tiebreaker, freebie, r32[16],
//   r16[8], qf[4], sf[2], champ]. Winners are stored as indices into the canonical
//   32-team list derived from topology, so only real teams can ever round-trip.

import { validateAgainstTopology } from "./parse-excel.js";

const VER = 1;

// Canonical team order: 16 r32 matches x [A, B] = 32 teams, in topology order.
function teamList(topology) {
  const out = [];
  for (const m of topology.r32) { out.push(m[2], m[3]); }
  return out;
}

// Unicode-safe URL-safe base64 (works in browsers and Node 18+).
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// picks -> compact payload string (no leading #). Throws if a pick isn't a real team.
export function encodeBracket(picks, topology) {
  const teams = teamList(topology);
  const idx = new Map(teams.map((t, i) => [t, i]));
  const toIdx = (name) => {
    const i = idx.get(name);
    if (i == null) throw new Error("team not in topology: " + name);
    return i;
  };
  // Map r32 winners by match code so encoding never depends on array order
  // (the decoder rebuilds r32 in topology order).
  const pickByCode = {};
  for (const m of picks.r32) pickByCode[m[0]] = m[4];
  const payload = [
    VER,
    String(picks.entrant || ""),
    picks.tiebreaker | 0,
    String(picks.freebie_match || ""),
    topology.r32.map((m) => toIdx(pickByCode[m[0]])),
    picks.r16_win.map(toIdx),
    picks.qf_win.map(toIdx),
    picks.sf_win.map(toIdx),
    toIdx(picks.champ),
  ];
  return b64urlEncode(JSON.stringify(payload));
}

// payload string -> validated picks object, or null if anything is off.
export function decodeBracket(str, topology) {
  try {
    const teams = teamList(topology);
    const N = teams.length;
    const arr = JSON.parse(b64urlDecode(str));
    if (!Array.isArray(arr) || arr[0] !== VER) return null;
    const [, entrantRaw, tb, freebie, r32i, r16i, qfi, sfi, champi] = arr;
    const okIdx = (v) => Number.isInteger(v) && v >= 0 && v < N;
    if (!Array.isArray(r32i) || r32i.length !== 16) return null;
    if (!Array.isArray(r16i) || r16i.length !== 8) return null;
    if (!Array.isArray(qfi) || qfi.length !== 4) return null;
    if (!Array.isArray(sfi) || sfi.length !== 2) return null;
    if (![...r32i, ...r16i, ...qfi, ...sfi, champi].every(okIdx)) return null;

    const name = (v) => teams[v];
    const r32 = topology.r32.map((m, i) => {
      const [code, date, a, b] = m;
      const pick = name(r32i[i]);
      if (pick !== a && pick !== b) throw new Error("r32 winner not in match");
      return [code, date, a, b, pick];
    });
    const r16_win = r16i.map(name);
    const qf_win = qfi.map(name);
    const sf_win = sfi.map(name);
    const champ = name(champi);
    const runner = sf_win.find((t) => t && t !== champ) || "";

    const seed = {};
    const tseed = topology.seed || {};
    for (const m of topology.r32) { seed[m[2]] = tseed[m[2]]; seed[m[3]] = tseed[m[3]]; }

    const entrant = String(entrantRaw || "").slice(0, 60);
    const tiebreaker = Number.isFinite(tb) ? (tb | 0) : 0;
    const freebie_match = /^M\d{1,3}$/.test(String(freebie)) ? String(freebie) : "M73";

    const picks = { entrant, tiebreaker, freebie_match, r32, r16_win, qf_win, sf_win, champ, runner, seed };
    return validateAgainstTopology(picks, topology); // throws on any inconsistency
  } catch (e) {
    return null;
  }
}

// Build a shareable absolute URL for the given picks (browser only).
export function buildShareUrl(picks, topology) {
  const base = location.origin + location.pathname;
  const nm = encodeURIComponent(String(picks.entrant || "").slice(0, 60));
  return `${base}#e=${nm}&b=${encodeBracket(picks, topology)}`;
}

// Read a shared bracket from the current URL fragment. Returns { picks, name } or null.
export function readShareFromUrl(topology, hash) {
  const h = (hash != null ? hash : (typeof location !== "undefined" ? location.hash : "")) || "";
  const frag = h.replace(/^#/, "");
  if (!frag) return null;
  const params = new URLSearchParams(frag);
  const b = params.get("b");
  if (!b) return null;
  const picks = decodeBracket(b, topology);
  if (!picks) return null;
  let name = params.get("e");
  try { name = name ? decodeURIComponent(name) : ""; } catch (e) { name = ""; }
  return { picks, name: (name || picks.entrant || "").slice(0, 60) };
}
