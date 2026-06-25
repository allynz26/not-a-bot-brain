-- ============================================================
-- Not a Bot Brain — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- (Or let Claude run it for you via the Supabase connector.)
-- ============================================================

-- 1) Who is allowed in. Add Greg's email below (uncomment + edit).
create table if not exists allowed_emails (
  email text primary key
);

insert into allowed_emails (email) values
  ('zane.allyn@gmail.com')
  -- , ('greg@example.com')   -- <-- add Greg here
  on conflict (email) do nothing;

-- Helper: is the currently logged-in user on the allowlist?
create or replace function is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 2) Data tables. IDs are app-generated strings so existing data imports cleanly.
create table if not exists backlog (
  id         text primary key,
  title      text not null default '',
  cat        text not null default 'other',   -- prod | biz | cult | other
  status     text not null default 'idea',     -- idea | queued | recorded
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists episodes (
  id         text primary key,
  title      text not null default '',
  ep_date    text not null default '',
  topics     jsonb not null default '[]'::jsonb,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists voice (
  id         text primary key,
  kind       text not null default 'take',     -- take | belief | question | story | line
  body       text not null default '',
  ctx        text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Single-row table holding the current week's talking points (the "roundup").
create table if not exists roundup (
  id         int  primary key default 1,
  week_of    text not null default '',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint roundup_singleton check (id = 1)
);

-- 3) Row-Level Security: only allow-listed, logged-in users can touch anything.
alter table backlog  enable row level security;
alter table episodes enable row level security;
alter table voice    enable row level security;
alter table roundup  enable row level security;

create policy "allowed_all_backlog"  on backlog  for all using (is_allowed()) with check (is_allowed());
create policy "allowed_all_episodes" on episodes for all using (is_allowed()) with check (is_allowed());
create policy "allowed_all_voice"    on voice    for all using (is_allowed()) with check (is_allowed());
create policy "allowed_all_roundup"  on roundup  for all using (is_allowed()) with check (is_allowed());

-- 4) Realtime: so you and Greg see each other's edits live.
alter publication supabase_realtime add table backlog;
alter publication supabase_realtime add table episodes;
alter publication supabase_realtime add table voice;
alter publication supabase_realtime add table roundup;

-- 5) Seed the current week's talking points + the recurring "My Voice" frames
--    and the first episode, so the app isn't empty on first load.
insert into roundup (id, week_of, data) values (1, '2026-06-25', '{
  "prod": {"title":"Products & Tools","cls":"c-prod","items":[
    {"t":"Apple ships a fully redesigned, AI-native Siri","d":"Positioned to bring AI to people who have never opened ChatGPT.","angle":"🟢 Build: AI finally goes mainstream via the phone in everyone''s pocket. 🔴 Skeptic: Apple is years late and Siri has overpromised before.","url":"https://openai.com/news/product-releases/"},
    {"t":"OpenAI moves Realtime audio API to GA","d":"Real-time voice + live translation as a building block.","angle":"🟢 Build: real-time translation in your ear is travel magic. 🔴 Skeptic: do we lose something when nobody learns languages?","url":"https://openai.com/news/product-releases/"},
    {"t":"Microsoft Build: Windows Agent Framework + Copilot agents","d":"Agentic control moving into the OS itself.","angle":"🟢 Build: agents in the OS = superpowers for everyone. 🔴 Skeptic: if the computer does the work, which skills atrophy?","url":"https://www.aiapps.com/blog/ai-news-breakthroughs-launches-trends-must-read/"}
  ]},
  "biz": {"title":"Business & Policy","cls":"c-biz","items":[
    {"t":"OpenAI closes ~$122B round at ~$852B valuation","d":"Reportedly prepping a near-$1T IPO for Q4 2026.","angle":"🟢 Build: this scale is what makes the magic possible. 🔴 Skeptic: an $852B company nobody voted for — company or infrastructure?","url":"https://www.crescendo.ai/news/latest-vc-investment-deals-in-ai-startups"},
    {"t":"White House EO on AI Innovation and Security","d":"Voluntary frontier-model review + AI cybersecurity clearinghouse.","angle":"🟢 Build: light-touch rules keep the US ahead. 🔴 Skeptic: voluntary safety = grading your own homework.","url":"https://www.whitehouse.gov/presidential-actions/2026/06/promoting-advanced-artificial-intelligence-innovation-and-security/"},
    {"t":"EU AI Act fully applicable Aug 2, 2026","d":"Core obligations kick in next month.","angle":"🌐 The big bet: US move-fast vs EU regulate-first. Which playbook ages better?","url":"https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai"}
  ]},
  "cult": {"title":"Culture & Impact","cls":"c-cult","items":[
    {"t":"PwC 2026 AI Jobs Barometer: a two-track labor market","d":"AI-exposed firms raising wages and headcount faster.","angle":"🟢 Build: AI is raising wages for the adaptable. 🌐 Ethics: who owns the gap for everyone it leaves behind?","url":"https://www.pwc.com/gx/en/services/ai/ai-jobs-barometer.html"},
    {"t":"Carnegie: Three views on the future of work","d":"A clean framework for the labor debate.","angle":"🎙️ Pick a lane live: AI as tool, as replacement, or as something genuinely new.","url":"https://carnegieendowment.org/research/2026/04/the-ai-labor-debate-three-views-on-the-future-of-work"},
    {"t":"Creativity summit: democratize vs undermine artists","d":"Authenticity, consent, fair pay for creators.","angle":"🟢 Build: AI hands creative tools to everyone. 🌐 Ethics: can it democratize art while taking work from the artists it trained on?","url":"https://www.outlookindia.com/national/ai-impact-summit-2026-can-artificial-intelligence-democratise-creativity-without-undermining-artists"}
  ]}
}'::jsonb)
on conflict (id) do update set week_of = excluded.week_of, data = excluded.data, updated_at = now();

insert into voice (id, kind, body, ctx) values
  ('sv1','line','Technology and life at the human/machine boundary.','Show tagline — your north star'),
  ('sv2','belief','The "why" matters more than the "what" — capability without intent is the real story.','Recurring lens'),
  ('sv3','belief','Context always matters.','Recurring lens'),
  ('sv4','take','AI is a duality — it does exactly what we ask, and that''s exactly what''s terrifying.','From the Glasswing episode')
  on conflict (id) do nothing;

insert into episodes (id, title, topics, notes) values
  ('ep_glasswing','Mythos / Project Glasswing + AI self-preservation (live, secret location)',
   '["Mythos / Project Glasswing","DevSecOps & practical AI","dual-use / skeleton-key risk","existential risk","AI consciousness experiments","the why vs the what","travel burnout","context matters"]'::jsonb,
   'Deep dive on Anthropic''s Mythos announcement (Project Glasswing) — AI that auto-discovers software vulnerabilities. The duality of AI doing exactly what we ask, and how flawed we are as builders/deployers. Detour into reverse-engineering a model on AI existence/self-preservation. Then the human side: constant tech travel, hotel-platinum burnout, surprise on-location guest.')
  on conflict (id) do nothing;

-- Done. Next: add Greg's email above, deploy the app, log in with magic link.
