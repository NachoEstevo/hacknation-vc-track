create table public.hack_nation_participants (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null unique,
  full_name text not null,
  display_name text,
  public_profile_url text not null unique,
  university text,
  field_of_study text,
  academic_degree text,
  professional_situation text,
  tagline text,
  city text,
  country text,
  github_url text,
  linkedin_url text,
  source_payload jsonb not null,
  source_captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hack_nation_startup_candidates (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.hack_nation_participants(id) on delete cascade,
  startup_signals text[] not null check (cardinality(startup_signals) > 0),
  profile_completeness smallint not null check (profile_completeness between 0 and 7),
  company_name text,
  company_url text,
  research_status text not null default 'queued'
    check (research_status in ('queued', 'researching', 'resolved', 'ambiguous', 'not_found', 'rejected')),
  research_result jsonb,
  researched_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id)
);

create index hack_nation_startup_candidates_status_idx
  on public.hack_nation_startup_candidates (research_status, profile_completeness desc);

alter table public.hack_nation_participants enable row level security;
alter table public.hack_nation_startup_candidates enable row level security;

comment on table public.hack_nation_participants is
  'Public Hack-Nation directory snapshots kept outside the canonical company and founder entities.';
comment on table public.hack_nation_startup_candidates is
  'Unverified company-discovery queue. A resolved record must be reviewed before any canonical-company import.';
