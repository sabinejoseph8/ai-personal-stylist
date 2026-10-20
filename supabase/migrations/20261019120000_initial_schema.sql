-- AI Personal Stylist: initial schema (tech spec 1.3, section 3).
-- Every table holding guest data has user_id and an access rule that limits it to the
-- signed-in guest. Guests sign in anonymously, so they use the "authenticated" role.
-- Raw audio, full transcripts and camera video are never stored anywhere.

-- Guest-owned rows: the owner can read and change them, nobody else can.
create or replace function public.owner_policies(table_name text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table public.%I enable row level security', table_name);
  execute format(
    'create policy "owner can read" on public.%I for select to authenticated using (user_id = (select auth.uid()))',
    table_name);
  execute format(
    'create policy "owner can add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
    table_name);
  execute format(
    'create policy "owner can change" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
    table_name);
  execute format(
    'create policy "owner can delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
    table_name);
end;
$$;

-- profiles: one row per guest.
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  departments text[] not null default '{}',
  style_words text[] not null default '{}',
  sizes jsonb not null default '{}',
  budget_amount_cents integer check (budget_amount_cents is null or budget_amount_cents > 0),
  budget_currency text not null default 'USD',
  budget_meaning text check (budget_meaning in ('up_to', 'around', 'between')),
  budget_max_cents integer check (budget_max_cents is null or budget_max_cents > 0),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- saved_preferences: Must have, Never and Likes.
create table public.saved_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('must_have', 'never', 'likes')),
  words text not null check (length(words) between 1 and 200),
  rule jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- consents: separate permissions (R64).
create table public.consents (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  wardrobe_photos_at timestamptz,
  remember_preferences_at timestamptz,
  camera_explained_at timestamptz,
  updated_at timestamptz not null default now()
);

-- sessions: one styling conversation. Text only was removed on 19 Oct 2026.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  engine text not null default 'video' check (engine in ('video', 'voice')),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  notes_version integer not null default 0,
  feedback_version integer not null default 0,
  anchor_version integer not null default 0,
  profile_version integer not null default 0
);

-- session_notes: the stylist's jotted notes (R15 to R22). Deleted when the session ends (R63).
create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  note_text text not null check (length(note_text) between 1 and 200),
  kind text not null default 'other',
  hidden_details jsonb not null default '{}',
  status text not null default 'to_confirm' check (status in ('to_confirm', 'confirmed')),
  confidence real check (confidence is null or confidence between 0 and 1),
  source text not null default 'voice' check (source in ('voice', 'touch', 'photo', 'camera', 'profile')),
  source_turn integer,
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  removed boolean not null default false
);

-- session_feedback: likes, dislikes, requested changes and items to keep.
create table public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  look_id uuid,
  item_ref text,
  attribute text,
  feedback_kind text not null check (feedback_kind in ('like', 'dislike', 'change', 'keep')),
  scope text not null default 'item' check (scope in ('item', 'look', 'session')),
  status text not null default 'to_confirm' check (status in ('to_confirm', 'confirmed')),
  source text not null default 'voice' check (source in ('voice', 'touch')),
  version integer not null default 1,
  created_at timestamptz not null default now()
);

-- session_exceptions: "This session only" permissions.
create table public.session_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  saved_preference_id uuid not null references public.saved_preferences (id) on delete cascade,
  confirmed_at timestamptz not null default now()
);

-- session_assets: items to style around.
create table public.session_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  photo_path text not null,
  thumbnail_path text,
  source text not null check (source in ('upload', 'camera')),
  recognized_details jsonb not null default '{}',
  ownership text check (ownership in ('owned', 'inspiration')),
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

-- wardrobe_items: saved owned items.
create table public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  photo_path text,
  name text not null check (length(name) between 1 and 120),
  category text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- catalog_products: the sample catalog. Read-only for everyone, never for sale.
create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'sample' check (provider = 'sample'),
  department text not null check (department in ('womenswear', 'menswear')),
  category text not null,
  name text not null,
  colors text[] not null default '{}',
  style_tags text[] not null default '{}',
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'USD',
  sizes text[] not null default '{}',
  attributes jsonb not null default '{}',
  image_path text,
  image_source text,
  can_be_bought boolean not null default false check (can_be_bought = false),
  available_from date check (available_from is null),
  created_at timestamptz not null default now()
);

-- looks: every candidate and published look.
create table public.looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  items jsonb not null default '[]',
  total_cents integer,
  reason text,
  revision_of uuid references public.looks (id) on delete set null,
  input_versions jsonb not null default '{}',
  status text not null default 'building'
    check (status in ('building', 'checking', 'published', 'held', 'needs_check', 'saved')),
  created_at timestamptz not null default now()
);

-- check_results: preference check decisions. No transcripts, audio or photos (FR-33).
create table public.check_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  look_id uuid not null references public.looks (id) on delete cascade,
  versions_checked jsonb not null default '{}',
  verdict text not null check (verdict in ('pass', 'conflict', 'needs_clarification')),
  reasons jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- saved_looks: a copy of each look the shopper saved.
create table public.saved_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  look jsonb not null,
  saved_at timestamptz not null default now()
);

-- bag_items: the demo bag. Checkout is always disabled.
create table public.bag_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.catalog_products (id) on delete cascade,
  size text,
  check_result_id uuid references public.check_results (id) on delete set null,
  added_at timestamptz not null default now()
);

-- usage: time and spending for the budget guard, with no personal content. Server only.
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  day date not null default current_date,
  video_seconds integer not null default 0,
  voice_seconds integer not null default 0,
  ai_cost_microdollars bigint not null default 0,
  unique (user_id, day)
);

-- event_log: Behind the scenes entries, deleted with the session.
create table public.event_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  entry_type text not null,
  summary text not null check (length(summary) <= 500),
  created_at timestamptz not null default now()
);

-- Access rules.
select public.owner_policies(t) from unnest(array[
  'profiles', 'saved_preferences', 'consents', 'sessions', 'session_notes', 'session_feedback',
  'session_exceptions', 'session_assets', 'wardrobe_items', 'looks', 'check_results',
  'saved_looks', 'bag_items', 'event_log'
]) as t;

alter table public.catalog_products enable row level security;
create policy "everyone can read the sample catalog" on public.catalog_products
  for select to anon, authenticated using (true);

-- usage has access rules switched on with no policies: only the server's key can use it.
alter table public.usage enable row level security;

drop function public.owner_policies(text);

-- Indexes for lookups by owner and session.
create index on public.saved_preferences (user_id);
create index on public.sessions (user_id, status);
create index on public.session_notes (session_id) where not removed;
create index on public.session_feedback (session_id);
create index on public.session_exceptions (session_id);
create index on public.session_assets (session_id);
create index on public.wardrobe_items (user_id);
create index on public.looks (session_id, status);
create index on public.check_results (look_id);
create index on public.saved_looks (user_id);
create index on public.bag_items (user_id);
create index on public.event_log (session_id);
create index on public.catalog_products (department, category);
