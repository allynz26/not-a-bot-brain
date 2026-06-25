import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.BRAIN_CONFIG || {};
if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
  document.getElementById("loginMsg").textContent = "Set your keys in config.js first (see README).";
}
const sb = createClient(cfg.SUPABASE_URL || "https://placeholder.supabase.co", cfg.SUPABASE_ANON_KEY || "placeholder");

// ---------- State ----------
let backlog = [], episodes = [], voice = [], roundup = {}, weekOf = "";
let filter = "all", vfilter = "all";

const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = (s) => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Auth ----------
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  applySession(session);
  sb.auth.onAuthStateChange((_evt, s) => applySession(s));
}
let booted = false;
function applySession(session) {
  if (session && session.user) {
    $("gate").classList.add("hide");
    $("app").classList.remove("hide");
    $("who").textContent = session.user.email || "you";
    if (!booted) { booted = true; bootData(); }
  } else {
    $("app").classList.add("hide");
    $("gate").classList.remove("hide");
  }
}
$("loginBtn").onclick = async () => {
  const email = $("loginEmail").value.trim();
  if (!email) return;
  $("loginMsg").textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
  $("loginMsg").textContent = error ? ("Error: " + error.message) : "Check your email for the login link ✉️";
};
$("loginEmail").addEventListener("keydown", e => { if (e.key === "Enter") $("loginBtn").click(); });
$("signOut").onclick = async () => { await sb.auth.signOut(); booted = false; location.reload(); };

// ---------- Initial load + realtime ----------
async function bootData() {
  await loadAll();
  subscribe();
}
async function loadAll() {
  const [b, e, v, r] = await Promise.all([
    sb.from("backlog").select("*"),
    sb.from("episodes").select("*"),
    sb.from("voice").select("*"),
    sb.from("roundup").select("*").eq("id", 1).maybeSingle()
  ]);
  backlog = (b.data || []).sort(byNewest);
  episodes = (e.data || []).sort(byNewest);
  voice = (v.data || []).sort(byNewest);
  if (r.data) { roundup = r.data.data || {}; weekOf = r.data.week_of || ""; }
  renderRoundup(); render(); renderE(); renderV(); setWeek();
}
function byNewest(a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); }

function subscribe() {
  sb.channel("brain-all")
    .on("postgres_changes", { event: "*", schema: "public", table: "backlog" }, p => applyChange("backlog", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "episodes" }, p => applyChange("episodes", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "voice" }, p => applyChange("voice", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "roundup" }, p => { roundup = (p.new && p.new.data) || roundup; weekOf = (p.new && p.new.week_of) || weekOf; renderRoundup(); setWeek(); })
    .subscribe();
}
function applyChange(table, p) {
  const arrMap = { backlog, episodes, voice };
  let arr = arrMap[table];
  if (p.eventType === "DELETE") { arr = arr.filter(x => x.id !== p.old.id); }
  else { arr = arr.filter(x => x.id !== p.new.id); arr.unshift(p.new); arr.sort(byNewest); }
  if (table === "backlog") { backlog = arr; render(); }
  else if (table === "episodes") { episodes = arr; renderE(); }
  else if (table === "voice") { voice = arr; renderV(); }
}

// ---------- Roundup (weekly talking points) ----------
const catTag = { prod: "prod", biz: "biz", cult: "cult", other: "other" };
function setWeek() {
  let label = "Week of —";
  if (weekOf) { try { label = "Week of " + new Date(weekOf + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); } catch (e) { label = "Week of " + weekOf; } }
  $("weekLabel").textContent = label;
}
function renderRoundup() {
  const host = $("roundup"); host.innerHTML = "";
  for (const key of ["prod", "biz", "cult"]) {
    const c = roundup[key]; if (!c) continue;
    const col = document.createElement("div");
    col.className = "col " + (c.cls || "");
    col.innerHTML = `<h3><span class="dot"></span>${esc(c.title || key)}</h3><div class="coltag">tap to send to backlog or save a take</div>`;
    (c.items || []).forEach((it, i) => {
      const el = document.createElement("div");
      el.className = "item"; el.dataset.cat = key; el.dataset.i = i;
      el.innerHTML = `
        <div class="t">${esc(it.t)}</div>
        <div class="d">${esc(it.d)}</div>
        <div class="angle"><b>Debate:</b> ${esc(it.angle)}</div>
        <div class="src"><a href="${it.url}" target="_blank" rel="noopener">source ↗</a>
          &nbsp;·&nbsp; <button class="seedbtn" data-act="idea" data-cat="${key}" data-i="${i}">＋ use as idea</button>
          &nbsp;·&nbsp; <button class="seedbtn" data-act="take" data-cat="${key}" data-i="${i}">＋ my take</button></div>`;
      col.appendChild(el);
    });
    host.appendChild(col);
  }
  host.querySelectorAll(".seedbtn").forEach(b => {
    b.onclick = async () => {
      const it = roundup[b.dataset.cat].items[+b.dataset.i];
      if (b.dataset.act === "idea") { await addIdea(it.angle, catTag[b.dataset.cat], "From: " + it.t); b.textContent = "✓ added"; }
      else { const t = prompt('Your take on "' + it.t + '":', ""); if (t && t.trim()) { await addThought(t.trim(), "take", "Re: " + it.t); b.textContent = "✓ saved"; } }
      b.disabled = true;
    };
  });
  annotateCoverage();
}

// ---------- Backlog ----------
const STATUS_CYCLE = { idea: "setlist", setlist: "covered", covered: "idea", queued: "setlist", recorded: "covered" };
const STATUS_LABEL = { idea: "💡 idea", setlist: "🎙️ set list", covered: "✅ covered", queued: "🎙️ set list", recorded: "✅ covered" };
const CAT_LABEL = { prod: "Products", biz: "Business", cult: "Culture", other: "Other" };

async function addIdea(title, cat, note) {
  if (!title || !title.trim()) return;
  const row = { id: uid(), title: title.trim(), cat: cat || "other", status: "idea", note: note || "" };
  backlog.unshift({ ...row, created_at: new Date().toISOString() }); render();
  await sb.from("backlog").insert(row);
}
async function updateIdea(x, patch) { Object.assign(x, patch); render(); await sb.from("backlog").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", x.id); }
async function deleteRow(table, id, localArr, rerender) {
  const idx = localArr.findIndex(i => i.id === id); if (idx > -1) localArr.splice(idx, 1); rerender();
  await sb.from(table).delete().eq("id", id);
}
function normStatus(s) { return s === "queued" ? "setlist" : s === "recorded" ? "covered" : (s || "idea"); }
async function moveToSetList(x) {
  const maxPos = backlog.filter(i => normStatus(i.status) === "setlist").reduce((m, i) => Math.max(m, i.position || 0), 0);
  await updateIdea(x, { status: "setlist", position: maxPos + 1 });
}

function render() {
  const list = $("list"); list.innerHTML = "";
  const shown = backlog.filter(x => filter === "all" || normStatus(x.status) === filter);
  if (!shown.length) { list.innerHTML = `<div class="empty">No ideas yet${filter !== "all" ? " in this view" : ""}. Add one above, or pull from this week's angles ↑</div>`; renderSetList(); return; }
  shown.forEach(x => {
    const st = normStatus(x.status);
    const row = document.createElement("div"); row.className = "idea";
    const quick = st === "idea"
      ? `<button class="btn ghost" data-act="toset" style="padding:5px 10px;font-size:12px;">🎙️ Set list</button>`
      : st === "setlist"
      ? `<button class="btn ghost" data-act="covered" style="padding:5px 10px;font-size:12px;">✅ Covered</button>`
      : `<button class="btn ghost" data-act="toidea" style="padding:5px 10px;font-size:12px;">↩ Idea</button>`;
    row.innerHTML = `
      <div class="body">
        <div class="titlerow">
          <span class="tag ${x.cat}">${CAT_LABEL[x.cat] || "Other"}</span>
          <span class="status ${st}" data-act="status">${STATUS_LABEL[st]}</span>
          <span class="ttl">${esc(x.title)}</span>
        </div>
        ${x.note ? `<div class="note">${esc(x.note)}</div>` : ``}
      </div>
      ${quick}
      <button class="iconbtn" data-act="edit" title="Edit">✎</button>
      <button class="iconbtn" data-act="del" title="Delete">✕</button>`;
    row.querySelector('[data-act="status"]').onclick = () => updateIdea(x, { status: STATUS_CYCLE[st] });
    const qt = row.querySelector('[data-act="toset"]'); if (qt) qt.onclick = () => moveToSetList(x);
    const qc = row.querySelector('[data-act="covered"]'); if (qc) qc.onclick = () => updateIdea(x, { status: "covered" });
    const qi = row.querySelector('[data-act="toidea"]'); if (qi) qi.onclick = () => updateIdea(x, { status: "idea" });
    row.querySelector('[data-act="del"]').onclick = () => { if (confirm("Delete this idea?")) deleteRow("backlog", x.id, backlog, render); };
    row.querySelector('[data-act="edit"]').onclick = () => {
      const body = row.querySelector(".body");
      body.innerHTML = `<input class="edit" value="${esc(x.title)}" /><textarea rows="3" placeholder="Notes / angle…">${esc(x.note)}</textarea>
        <div style="margin-top:8px;display:flex;gap:8px;"><button class="btn" data-s="save">Save</button><button class="btn ghost" data-s="cancel">Cancel</button></div>`;
      body.querySelector('[data-s="save"]').onclick = () => updateIdea(x, { title: body.querySelector("input.edit").value.trim() || x.title, note: body.querySelector("textarea").value });
      body.querySelector('[data-s="cancel"]').onclick = render;
    };
    list.appendChild(row);
  });
  renderSetList();
}

// ---------- Next Episode set list ----------
function setListItems() {
  return backlog.filter(x => normStatus(x.status) === "setlist")
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}
async function reorderSetList(x, dir) {
  const items = setListItems();
  const i = items.findIndex(it => it.id === x.id);
  const j = i + dir;
  if (j < 0 || j >= items.length) return;
  const a = items[i], b = items[j];
  const ap = a.position || 0, bp = b.position || 0;
  a.position = bp; b.position = ap;
  renderSetList();
  await sb.from("backlog").update({ position: a.position, updated_at: new Date().toISOString() }).eq("id", a.id);
  await sb.from("backlog").update({ position: b.position, updated_at: new Date().toISOString() }).eq("id", b.id);
}
function renderSetList() {
  const host = $("setList"); if (!host) return;
  const items = setListItems();
  $("setCount").textContent = items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : "";
  if (!items.length) { host.innerHTML = `<div class="empty">Set list is empty. Tap "🎙️ Set list" on an idea above to add it here.</div>`; return; }
  host.innerHTML = "";
  items.forEach((x, idx) => {
    const row = document.createElement("div"); row.className = "idea";
    row.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:2px;margin-right:4px;">
        <button class="iconbtn" data-act="up" title="Move up" ${idx === 0 ? "disabled" : ""}>▲</button>
        <button class="iconbtn" data-act="down" title="Move down" ${idx === items.length - 1 ? "disabled" : ""}>▼</button>
      </div>
      <div class="body">
        <div class="titlerow">
          <span class="tag ${x.cat}">${CAT_LABEL[x.cat] || "Other"}</span>
          <span class="ttl">${esc(x.title)}</span>
        </div>
        ${x.note ? `<div class="note">${esc(x.note)}</div>` : ``}
      </div>
      <button class="btn ghost" data-act="covered" style="padding:5px 10px;font-size:12px;">✅ Covered</button>
      <button class="iconbtn" data-act="toidea" title="Back to ideas">↩</button>`;
    row.querySelector('[data-act="up"]').onclick = () => reorderSetList(x, -1);
    row.querySelector('[data-act="down"]').onclick = () => reorderSetList(x, 1);
    row.querySelector('[data-act="covered"]').onclick = () => updateIdea(x, { status: "covered" });
    row.querySelector('[data-act="toidea"]').onclick = () => updateIdea(x, { status: "idea" });
    host.appendChild(row);
  });
}
async function wrapEpisode() {
  const items = setListItems();
  if (!items.length) { alert("Your set list is empty — add some ideas first."); return; }
  const title = prompt("Episode title for the archive:", "");
  if (title === null) return;
  const topics = items.map(i => i.title);
  const notes = "Set list: " + items.map(i => i.title).join(" · ");
  const ep = { id: uid(), title: title.trim() || "Untitled episode", topics, notes, ep_date: "" };
  episodes.unshift({ ...ep, created_at: new Date().toISOString() }); renderE();
  await sb.from("episodes").insert(ep);
  for (const x of items) { x.status = "covered"; }
  renderSetList(); render();
  await sb.from("backlog").update({ status: "covered", updated_at: new Date().toISOString() }).in("id", items.map(i => i.id));
  alert(`Wrapped "${ep.title}" → added to your Episode archive with ${items.length} topic${items.length > 1 ? "s" : ""}.`);
}
$("addBtn").onclick = () => { addIdea($("newTitle").value, $("newCat").value, ""); $("newTitle").value = ""; };
$("newTitle").addEventListener("keydown", e => { if (e.key === "Enter") $("addBtn").click(); });
document.querySelectorAll("#filters .chip").forEach(c => c.onclick = () => { document.querySelectorAll("#filters .chip").forEach(z => z.classList.remove("on")); c.classList.add("on"); filter = c.dataset.f; render(); });
$("wrapBtn").onclick = wrapEpisode;

// ---------- Voice ----------
const VKIND = { take: { label: "🔥 Hot take", cls: "cult" }, belief: { label: "🧭 Core belief", cls: "biz" }, question: { label: "❓ Open question", cls: "prod" }, story: { label: "📖 Story", cls: "other" }, line: { label: "🎤 One-liner", cls: "cult" } };
async function addThought(text, kind, ctx) {
  if (!text || !text.trim()) return;
  const row = { id: uid(), kind: kind || "take", body: text.trim(), ctx: ctx || "" };
  voice.unshift({ ...row, created_at: new Date().toISOString() }); renderV();
  await sb.from("voice").insert(row);
}
async function updateThought(t, patch) { Object.assign(t, patch); renderV(); await sb.from("voice").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", t.id); }
function renderV() {
  const host = $("voiceList"); host.innerHTML = "";
  const shown = voice.filter(t => vfilter === "all" || t.kind === vfilter);
  if (!shown.length) { host.innerHTML = `<div class="empty">Nothing here yet. Jot a take above, or hit "＋ my take" on any news item ↑</div>`; return; }
  shown.forEach(t => {
    const k = VKIND[t.kind] || VKIND.take;
    const row = document.createElement("div"); row.className = "idea";
    row.innerHTML = `
      <div class="body">
        <div class="titlerow"><span class="tag ${k.cls}">${k.label}</span><span class="ttl">${esc(t.body)}</span></div>
        ${t.ctx ? `<div class="note">${esc(t.ctx)}</div>` : ``}
      </div>
      <button class="iconbtn" data-act="edit" title="Edit">✎</button>
      <button class="iconbtn" data-act="del" title="Delete">✕</button>`;
    row.querySelector('[data-act="del"]').onclick = () => { if (confirm("Delete this thought?")) deleteRow("voice", t.id, voice, renderV); };
    row.querySelector('[data-act="edit"]').onclick = () => {
      const body = row.querySelector(".body");
      body.innerHTML = `<textarea rows="3">${esc(t.body)}</textarea><input class="edit" style="margin-top:6px" placeholder="Context (optional)" value="${esc(t.ctx)}" />
        <div style="margin-top:8px;display:flex;gap:8px;"><button class="btn" data-s="save">Save</button><button class="btn ghost" data-s="cancel">Cancel</button></div>`;
      body.querySelector('[data-s="save"]').onclick = () => updateThought(t, { body: body.querySelector("textarea").value.trim() || t.body, ctx: body.querySelector("input.edit").value });
      body.querySelector('[data-s="cancel"]').onclick = renderV;
    };
    host.appendChild(row);
  });
}
$("thoughtAdd").onclick = () => { addThought($("thoughtInput").value, $("thoughtKind").value, ""); $("thoughtInput").value = ""; };
$("thoughtInput").addEventListener("keydown", e => { if (e.key === "Enter") $("thoughtAdd").click(); });
document.querySelectorAll("#voiceFilters .chip").forEach(c => c.onclick = () => { document.querySelectorAll("#voiceFilters .chip").forEach(z => z.classList.remove("on")); c.classList.add("on"); vfilter = c.dataset.vf; renderV(); });

// ---------- Episode archive ----------
async function addEpisode(title, topics, notes) {
  const row = { id: uid(), title: title || "", topics: topics || [], notes: notes || "", ep_date: "" };
  episodes.unshift({ ...row, created_at: new Date().toISOString() }); renderE();
  await sb.from("episodes").insert(row);
}
async function updateEpisode(e, patch) { Object.assign(e, patch); renderE(); await sb.from("episodes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", e.id); }
function renderE() {
  const host = $("epList"); host.innerHTML = "";
  if (!episodes.length) { host.innerHTML = `<div class="empty">No episodes logged yet. Add one above — even just a title + topics helps.</div>`; annotateCoverage(); return; }
  episodes.forEach(e => {
    const topics = Array.isArray(e.topics) ? e.topics : [];
    const chips = topics.map(t => `<span class="tag other" style="margin:2px 4px 2px 0;">${esc(t)}</span>`).join("");
    const row = document.createElement("div"); row.className = "idea";
    row.innerHTML = `
      <div class="body">
        <div class="titlerow"><span class="ttl">${esc(e.title || "Untitled episode")}</span></div>
        ${chips ? `<div style="margin:6px 0 2px;">${chips}</div>` : ``}
        ${e.notes ? `<div class="note">${esc(e.notes)}</div>` : ``}
      </div>
      <button class="iconbtn" data-act="edit" title="Edit">✎</button>
      <button class="iconbtn" data-act="del" title="Delete">✕</button>`;
    row.querySelector('[data-act="del"]').onclick = () => { if (confirm("Remove this episode?")) deleteRow("episodes", e.id, episodes, renderE); };
    row.querySelector('[data-act="edit"]').onclick = () => {
      const body = row.querySelector(".body");
      body.innerHTML = `<input class="edit" value="${esc(e.title)}" placeholder="Title" />
        <input class="edit" style="margin-top:6px" value="${esc(topics.join(', '))}" placeholder="Topics (comma-separated)" />
        <textarea rows="4" style="margin-top:6px">${esc(e.notes)}</textarea>
        <div style="margin-top:8px;display:flex;gap:8px;"><button class="btn" data-s="save">Save</button><button class="btn ghost" data-s="cancel">Cancel</button></div>`;
      const ins = body.querySelectorAll("input.edit");
      body.querySelector('[data-s="save"]').onclick = () => updateEpisode(e, { title: ins[0].value.trim() || e.title, topics: ins[1].value.split(",").map(s => s.trim()).filter(Boolean), notes: body.querySelector("textarea").value });
      body.querySelector('[data-s="cancel"]').onclick = renderE;
    };
    host.appendChild(row);
  });
  annotateCoverage();
}
$("epAdd").onclick = () => {
  const title = $("epTitle").value.trim();
  const topics = $("epTopics").value.split(",").map(s => s.trim()).filter(Boolean);
  const notes = $("epNotes").value;
  if (!title && !topics.length && !notes.trim()) return;
  addEpisode(title, topics, notes);
  $("epTitle").value = ""; $("epTopics").value = ""; $("epNotes").value = "";
};

// ---------- Coverage overlap check ----------
const STOP = new Set("that this with from what when your into over more most than then also just make made does done real like time news show plus goes deep about very where here they them will have been were onto amid near next year week much many some such both each only ever gets".split(" "));
function tokenize(s) { return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w)); }
function annotateCoverage() {
  document.querySelectorAll("#roundup .covered").forEach(n => n.remove());
  if (!episodes.length) return;
  document.querySelectorAll("#roundup .item").forEach(el => {
    const c = roundup[el.dataset.cat]; const it = c && c.items[+el.dataset.i]; if (!it) return;
    const itTokens = new Set(tokenize(it.t));
    let best = null, bestShared = [];
    episodes.forEach(ep => {
      const epTokens = new Set(tokenize((ep.title || "") + " " + (Array.isArray(ep.topics) ? ep.topics.join(" ") : "")));
      const shared = [...itTokens].filter(w => epTokens.has(w));
      if (shared.length > bestShared.length) { best = ep; bestShared = shared; }
    });
    if (best && bestShared.length >= 1) {
      const tag = document.createElement("div"); tag.className = "covered";
      tag.innerHTML = `🎙️ <b>Possibly covered</b> in "${esc(best.title || "a past episode")}" — overlaps on: ${esc(bestShared.join(", "))}. Fresh take, or skip?`;
      el.appendChild(tag);
    }
  });
}

// ---------- One-time importer (paste your old JSON snapshot) ----------
$("importBtn").onclick = async () => {
  const raw = prompt("Paste your exported JSON (the Drive snapshot: { backlog, episodes, voice }):", "");
  if (!raw) return;
  let obj; try { obj = JSON.parse(raw); } catch (e) { alert("That wasn't valid JSON."); return; }
  const b = (obj.backlog || []).map(x => ({ id: x.id || uid(), title: x.title || "", cat: x.cat || "other", status: x.status || "idea", note: x.note || "" }));
  const e = (obj.episodes || []).map(x => ({ id: x.id || uid(), title: x.title || "", topics: Array.isArray(x.topics) ? x.topics : [], notes: x.notes || "", ep_date: x.date || "" }));
  const v = (obj.voice || []).map(x => ({ id: x.id || uid(), kind: x.kind || "take", body: x.text || x.body || "", ctx: x.ctx || "" }));
  if (b.length) await sb.from("backlog").upsert(b);
  if (e.length) await sb.from("episodes").upsert(e);
  if (v.length) await sb.from("voice").upsert(v);
  await loadAll();
  alert(`Imported ${b.length} ideas, ${e.length} episodes, ${v.length} thoughts.`);
};

// ---------- Go ----------
initAuth();
