// Runs against a real local server. See test/run.sh.
const crypto = require("crypto");
const API = process.env.API, SECRET = process.env.PARTNER_SYNC_SECRET;
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n + (x ? " -> " + JSON.stringify(x) : "")); } };
async function signed(method, path, body, opts = {}) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = String(opts.ts || Date.now());
  const sig = crypto.createHmac("sha256", opts.secret || SECRET).update(ts + "." + raw).digest("hex");
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", "X-Partner-Timestamp": ts, "X-Partner-Signature": opts.noSig ? "" : sig }, body: raw || undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const j = async (method, path, body, token) => {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
(async () => {
  console.log("Partner sync security");
  ok((await j("GET", "/partner-sync/subjects")).status === 401, "unsigned request refused");
  ok((await signed("GET", "/partner-sync/subjects", undefined, { secret: "x".repeat(40) })).status === 401, "wrong secret refused");
  ok((await signed("GET", "/partner-sync/subjects", undefined, { ts: Date.now() - 10 * 60 * 1000 })).status === 401, "stale timestamp refused (replay)");
  const cat = await signed("GET", "/partner-sync/subjects");
  ok(cat.status === 200 && cat.body.subjects.length > 20 && cat.body.max === 10, "signed request lists the subject catalogue", cat.status);
  const ids = cat.body.subjects.map((s) => s.id);

  console.log("Granting");
  const exp = Date.now() + 365 * 864e5;
  const email = `partner${Date.now()}@example.com`;
  let r = await signed("PUT", "/partner-sync/grants", { partnerKey: "app-1", email, subjectIds: ids.slice(0, 3), expiresAt: exp });
  ok(r.status === 200 && r.body.granted === 3 && r.body.accountExists === false, "grants stored before the partner has an account", r);
  ok((await signed("PUT", "/partner-sync/grants", { partnerKey: "app-1", email, subjectIds: ids.slice(0, 11), expiresAt: exp })).status === 400, "more than 10 subjects refused");
  ok((await signed("PUT", "/partner-sync/grants", { partnerKey: "app-1", email, subjectIds: ["nope"], expiresAt: exp })).status === 400, "unknown subject refused");
  ok((await signed("PUT", "/partner-sync/grants", { partnerKey: "app-1", email, subjectIds: ids.slice(0, 2), expiresAt: Date.now() - 1 })).status === 400, "past expiry refused");

  const reg = await j("POST", "/auth/signup", { name: "Partner Tester", email: email.toUpperCase(), password: "password123" });
  const token = reg.body && (reg.body.token || reg.body.accessToken);
  ok(reg.status === 201 || reg.status === 200, "partner registers afterwards (any email case)", reg);
  let subs = await j("GET", "/subscriptions", undefined, token);
  const act = (subs.body.subscriptions || []).filter((s) => s.status === "active");
  ok(act.length === 3 && act.every((s) => s.partnerAccess === true), "the 3 granted subjects show as active, flagged partnerAccess", subs.body);
  ok(act.every((s) => Math.abs(s.expiresAt - exp) < 1000), "they run to the contract end date");

  console.log("Changing the list");
  r = await signed("PUT", "/partner-sync/grants", { partnerKey: "app-1", email, subjectIds: [ids[1], ids[5]], expiresAt: exp });
  subs = await j("GET", "/subscriptions", undefined, token);
  const now = (subs.body.subscriptions || []).filter((s) => s.status === "active").map((s) => s.subjectId).sort();
  ok(JSON.stringify(now) === JSON.stringify([ids[1], ids[5]].sort()), "un-ticked subjects lose access, new ones gain it", now);

  console.log("Study access");
  const sub0 = await (async () => {
    const subject = (await j("GET", "/subjects")).body.subjects.find((s) => s.id === ids[1]);
    const band = subject.bands[0];
    const topic = subject.topicsByBand[band][0].id;
    return { subjectId: ids[1], topicId: topic, band, score: 3, maxScore: 5 };
  })();
  ok((await j("POST", "/assessments", sub0, token)).status < 300, "a granted subject accepts study activity");
  const other = (await j("GET", "/subjects")).body.subjects.find((s) => s.id === ids[7]);
  const ob = other.bands[0];
  ok((await j("POST", "/assessments", { subjectId: ids[7], topicId: other.topicsByBand[ob][0].id, band: ob, score: 1, maxScore: 5 }, token)).status === 403, "a subject that was not granted is still locked");

  console.log("Revoking");
  r = await signed("POST", "/partner-sync/revoke", { partnerKey: "app-1" });
  ok(r.status === 200 && r.body.removed === 2, "revoke removes everything for that partner", r);
  subs = await j("GET", "/subscriptions", undefined, token);
  ok((subs.body.subscriptions || []).filter((s) => s.status === "active").length === 0, "access is gone after revoke");
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
