create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (char_length(query) between 1 and 2000),
  thesis jsonb not null check (jsonb_typeof(thesis) = 'object'),
  created_at timestamptz not null default now()
);

create index search_runs_user_created_idx
  on public.search_runs (user_id, created_at desc);

create table public.search_results (
  search_id uuid not null references public.search_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  rank integer not null check (rank > 0),
  score numeric(9, 6) not null check (score between 0 and 100),
  confidence_adjusted_fit numeric(9, 6) not null check (confidence_adjusted_fit between 0 and 100),
  tier text not null check (tier in ('strong_match', 'promising', 'needs_evidence', 'excluded')),
  signals jsonb not null check (jsonb_typeof(signals) = 'object'),
  evaluation jsonb not null check (jsonb_typeof(evaluation) = 'object'),
  created_at timestamptz not null default now(),
  primary key (search_id, company_id),
  unique (search_id, rank)
);

create index search_results_company_idx
  on public.search_results (company_id, created_at desc);

create table public.watchlist_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'watching'
    check (status in ('watching', 'contacted', 'passed')),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

create index watchlist_entries_company_idx
  on public.watchlist_entries (company_id, updated_at desc);

create table public.company_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  founder_id uuid references public.founders(id) on delete cascade,
  role text not null check (role in ('founder', 'admin')),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id, role),
  check ((role = 'founder' and founder_id is not null) or role = 'admin')
);

create index company_memberships_company_idx
  on public.company_memberships (company_id, status);
create index company_memberships_founder_idx
  on public.company_memberships (founder_id)
  where founder_id is not null;

alter table public.evidence
  add column submitted_by uuid references auth.users(id) on delete set null;

create index evidence_submitted_by_idx
  on public.evidence (submitted_by, created_at desc)
  where submitted_by is not null;

alter table public.search_runs enable row level security;
alter table public.search_results enable row level security;
alter table public.watchlist_entries enable row level security;
alter table public.company_memberships enable row level security;

revoke all on table public.search_runs from anon, authenticated;
revoke all on table public.search_results from anon, authenticated;
revoke all on table public.watchlist_entries from anon, authenticated;
revoke all on table public.company_memberships from anon, authenticated;

comment on table public.search_runs is
  'Authenticated server-side fund searches. Direct Data API access is intentionally disabled.';
comment on table public.search_results is
  'Immutable ranking snapshots used to open a brief in its original search context.';
comment on table public.watchlist_entries is
  'Private investor follow-up state owned by an authenticated user.';
comment on table public.company_memberships is
  'Server-managed company authorization. Founder evidence requires a verified membership.';
comment on column public.evidence.submitted_by is
  'Authenticated account that registered this evidence. Verification remains a separate process.';
