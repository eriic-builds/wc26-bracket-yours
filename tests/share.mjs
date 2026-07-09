// Share-link test: a bracket survives encode -> URL payload -> decode unchanged,
// and malformed payloads are rejected. Pure (no SheetJS needed).
// Run: node tests/share.mjs
import fs from "fs";
import { encodeBracket, decodeBracket, readShareFromUrl, buildShareUrl } from "../docs/js/share.js";

const topo = JSON.parse(fs.readFileSync(new URL("../docs/data/topology.json", import.meta.url)));
const demo = JSON.parse(fs.readFileSync(new URL("../docs/data/demo-picks.json", import.meta.url)));

let fails = 0;
function ok(name, cond) {
  console.log((cond ? "  ok   " : "  FAIL ") + name);
  if (!cond) fails++;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Round-trip the real demo bracket.
const payload = encodeBracket(demo, topo);
ok("payload is url-safe (no +/=/# )", /^[A-Za-z0-9_-]+$/.test(payload));
const dec = decodeBracket(payload, topo);
ok("decodes to an object", !!dec);

ok("entrant matches", dec.entrant === demo.entrant);
ok("tiebreaker matches", dec.tiebreaker === demo.tiebreaker);
ok("freebie_match matches", dec.freebie_match === demo.freebie_match);
ok("champ matches", dec.champ === demo.champ);
ok("runner matches", dec.runner === demo.runner);
ok("r16_win matches", eq(dec.r16_win, demo.r16_win));
ok("qf_win matches", eq(dec.qf_win, demo.qf_win));
ok("sf_win matches", eq(dec.sf_win, demo.sf_win));
ok("r32 winners match", eq(dec.r32.map((m) => m[4]), demo.r32.map((m) => m[4])));
ok("r32 code/date/teams match topology-consistent", dec.r32.every((m, i) => m[0] && m[2] && m[3]));

// A tricky entrant name (unicode + symbols) survives.
const spicy = { ...demo, entrant: "José <O'Brien> 🇺🇸 & Co" };
const dec2 = decodeBracket(encodeBracket(spicy, topo), topo);
ok("unicode/symbol entrant round-trips", dec2 && dec2.entrant === spicy.entrant);

// Bad payloads must be rejected, never throw.
ok("garbage -> null", decodeBracket("!!!not-base64!!!", topo) === null);
ok("empty -> null", decodeBracket("", topo) === null);
ok("valid base64 wrong shape -> null", decodeBracket(Buffer.from("[9,1,2]").toString("base64url"), topo) === null);
// Out-of-range team index must be rejected.
const tampered = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
tampered[8] = 999; // champ index out of range
const badIdx = Buffer.from(JSON.stringify(tampered)).toString("base64url");
ok("out-of-range index -> null", decodeBracket(badIdx, topo) === null);

// readShareFromUrl parses a fragment.
const share = readShareFromUrl(topo, "#e=" + encodeURIComponent("Eric") + "&b=" + payload);
ok("readShareFromUrl returns picks", share && share.picks && share.picks.champ === demo.champ);
ok("readShareFromUrl reads name", share && share.name === "Eric");
ok("readShareFromUrl null on empty hash", readShareFromUrl(topo, "") === null);
ok("readShareFromUrl null when no b= ", readShareFromUrl(topo, "#e=Eric") === null);

// buildShareUrl works with a stubbed location.
globalThis.location = { origin: "https://example.com", pathname: "/my-wc26-bracket/", hash: "" };
const url = buildShareUrl(demo, topo);
ok("buildShareUrl shape", url.startsWith("https://example.com/my-wc26-bracket/#e=") && url.includes("&b="));
const back = readShareFromUrl(topo, "#" + url.split("#")[1]);
ok("buildShareUrl round-trips via readShareFromUrl", back && back.picks.champ === demo.champ);

if (fails) { console.error(`\nFAILED: ${fails} check(s)`); process.exit(1); }
console.log("\nshare.mjs: all checks passed");
