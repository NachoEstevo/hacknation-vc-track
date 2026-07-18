create extension if not exists pgcrypto;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  name text not null,
  description text,
  primary_industry text,
  size_band text,
  organization_type text,
  location text,
  country_code text check (country_code in ('US', 'GB') or country_code is null),
  normalized_domain text,
  linkedin_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index companies_normalized_domain_unique
  on public.companies (normalized_domain)
  where normalized_domain is not null;
create index companies_linkedin_url_idx on public.companies (linkedin_url);

create table public.company_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type text not null,
  external_id text,
  source_url text,
  raw_payload jsonb not null,
  verification_state text not null default 'unverified'
    check (verification_state in ('unverified', 'candidate_only', 'verified', 'conflicted', 'stale')),
  captured_at timestamptz not null,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (company_id, source_type, external_id, content_hash)
);

create index company_sources_company_idx on public.company_sources (company_id, captured_at desc);
create index company_sources_type_idx on public.company_sources (source_type);

create table public.founders (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.founder_identities (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid not null references public.founders(id) on delete cascade,
  provider text not null,
  external_id text,
  profile_url text,
  username text,
  verification_state text not null default 'candidate_only'
    check (verification_state in ('candidate_only', 'user_connected', 'verified', 'rejected')),
  captured_at timestamptz not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  check (external_id is not null or profile_url is not null)
);

create unique index founder_identities_provider_external_unique
  on public.founder_identities (provider, external_id)
  where external_id is not null;
create unique index founder_identities_profile_url_unique
  on public.founder_identities (profile_url)
  where profile_url is not null;

create table public.company_founders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  founder_id uuid not null references public.founders(id) on delete cascade,
  current_title text,
  relationship_state text not null
    check (relationship_state in ('candidate', 'needs_review', 'founder_confirmed', 'admin_confirmed', 'rejected')),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  resolution_reason text not null,
  source_id uuid references public.company_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, founder_id)
);

create index company_founders_company_idx on public.company_founders (company_id, relationship_state);
create index company_founders_founder_idx on public.company_founders (founder_id);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  founder_id uuid references public.founders(id) on delete set null,
  source_id uuid references public.company_sources(id) on delete set null,
  evidence_type text not null,
  source_url text,
  private_object_path text,
  excerpt text,
  structured_payload jsonb,
  visibility text not null default 'public'
    check (visibility in ('public', 'founder_private', 'investor_private')),
  verification_state text not null default 'unverified'
    check (verification_state in ('unverified', 'candidate_only', 'verified', 'conflicted', 'stale')),
  captured_at timestamptz not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  check (source_url is not null or private_object_path is not null or structured_payload is not null),
  unique (company_id, evidence_type, content_hash)
);

create index evidence_company_idx on public.evidence (company_id, captured_at desc);
create index evidence_founder_idx on public.evidence (founder_id) where founder_id is not null;

create table public.enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  connector text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  requested_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  result_summary jsonb,
  created_at timestamptz not null default now()
);

create index enrichment_runs_company_idx on public.enrichment_runs (company_id, created_at desc);

alter table public.companies enable row level security;
alter table public.company_sources enable row level security;
alter table public.founders enable row level security;
alter table public.founder_identities enable row level security;
alter table public.company_founders enable row level security;
alter table public.evidence enable row level security;
alter table public.enrichment_runs enable row level security;

comment on table public.company_sources is
  'Immutable source snapshots. Imported values remain unverified until corroborated.';
comment on column public.company_founders.relationship_state is
  'A candidate relationship is not a verified founder relationship.';
comment on table public.evidence is
  'Provenance-bearing evidence; visibility controls are enforced by later role policies.';

