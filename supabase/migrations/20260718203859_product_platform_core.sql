-- Product-platform core for the investor and founder MVP.
--
-- Authorization is based only on auth.uid() and explicit ownership columns.
-- user_roles describes product mode; it is not a privileged authorization source.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- PostgreSQL's default trim character is only U+0020. This helper mirrors the
-- complete ECMAScript WhiteSpace + LineTerminator set used by String.trim().
create or replace function app_private.ecmascript_trim(candidate text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.btrim(
    candidate,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
  );
$$;

create or replace function app_private.is_nonblank_ecmascript_text(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    pg_catalog.length(app_private.ecmascript_trim(candidate)),
    0
  ) > 0;
$$;

-- Immutable JSON validators mirror the TypeScript runtime boundary. Keeping
-- them in app_private lets CHECK constraints reject malformed nested payloads
-- before they can reach matching or rendering code.
create or replace function app_private.is_finite_json_number(candidate jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  numeric_value numeric;
begin
  if pg_catalog.jsonb_typeof(candidate) is distinct from 'number' then
    return false;
  end if;

  begin
    numeric_value := (candidate #>> '{}')::numeric;
  exception
    when numeric_value_out_of_range or invalid_text_representation then
      return false;
  end;

  return pg_catalog.abs(numeric_value)
    <= 1.7976931348623157e308::numeric;
end;
$$;

create or replace function app_private.is_criterion_value(candidate jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  candidate_type text := pg_catalog.jsonb_typeof(candidate);
  element jsonb;
  element_type text;
  array_type text;
begin
  if candidate_type in ('boolean', 'string') then
    return true;
  end if;

  if candidate_type = 'number' then
    return app_private.is_finite_json_number(candidate);
  end if;

  if candidate_type <> 'array' or pg_catalog.jsonb_array_length(candidate) = 0 then
    return false;
  end if;

  array_type := pg_catalog.jsonb_typeof(candidate -> 0);
  if array_type not in ('string', 'number') then
    return false;
  end if;

  for element in
    select array_element.value
    from pg_catalog.jsonb_array_elements(candidate) as array_element(value)
  loop
    element_type := pg_catalog.jsonb_typeof(element);
    if element_type <> array_type then
      return false;
    end if;
    if element_type = 'number'
      and not app_private.is_finite_json_number(element) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function app_private.is_search_criterion(candidate jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  criterion_field text;
  criterion_operator text;
  criterion_value jsonb;
begin
  if pg_catalog.jsonb_typeof(candidate) is distinct from 'object'
    or pg_catalog.jsonb_typeof(candidate -> 'id') is distinct from 'string'
    or app_private.is_nonblank_ecmascript_text(candidate ->> 'id') is not true
    or pg_catalog.jsonb_typeof(candidate -> 'label') is distinct from 'string'
    or app_private.is_nonblank_ecmascript_text(candidate ->> 'label') is not true
    or pg_catalog.jsonb_typeof(candidate -> 'field') is distinct from 'string'
    or pg_catalog.jsonb_typeof(candidate -> 'operator') is distinct from 'string'
    or pg_catalog.jsonb_typeof(candidate -> 'priority') is distinct from 'string'
    or not (candidate ? 'value') then
    return false;
  end if;

  criterion_field := candidate ->> 'field';
  criterion_operator := candidate ->> 'operator';
  criterion_value := candidate -> 'value';

  if criterion_field not in (
      'sector',
      'geography',
      'stage',
      'team_size',
      'technical_founder',
      'check_size',
      'acceptable_risk',
      'team_preferences',
      'valued_signal_types',
      'institutional_funding',
      'raising',
      'working_demo',
      'hackathon_origin',
      'traction'
    )
    or criterion_operator not in (
      'equals',
      'includes_any',
      'contains_all',
      'lte',
      'gte',
      'between'
    )
    or candidate ->> 'priority' not in ('required', 'preferred', 'exclude')
    or app_private.is_criterion_value(criterion_value) is not true then
    return false;
  end if;

  if criterion_operator in ('lte', 'gte')
    and pg_catalog.jsonb_typeof(criterion_value) <> 'number' then
    return false;
  end if;

  if criterion_operator = 'between' then
    if pg_catalog.jsonb_typeof(criterion_value) <> 'array'
      or pg_catalog.jsonb_array_length(criterion_value) <> 2
      or pg_catalog.jsonb_typeof(criterion_value -> 0) <> 'number'
      or pg_catalog.jsonb_typeof(criterion_value -> 1) <> 'number'
      or (criterion_value -> 0) > (criterion_value -> 1) then
      return false;
    end if;
  end if;

  if criterion_operator in ('includes_any', 'contains_all')
    and pg_catalog.jsonb_typeof(criterion_value) <> 'array' then
    return false;
  end if;

  if not (
    (
      criterion_field in ('team_size', 'check_size')
      and criterion_operator in ('equals', 'lte', 'gte', 'between')
    )
    or (
      criterion_field in (
        'sector',
        'geography',
        'stage',
        'team_preferences',
        'valued_signal_types',
        'hackathon_origin'
      )
      and criterion_operator in ('equals', 'includes_any', 'contains_all')
    )
    or (
      criterion_field in (
        'technical_founder',
        'acceptable_risk',
        'institutional_funding',
        'raising',
        'working_demo',
        'traction'
      )
      and criterion_operator = 'equals'
    )
  ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function app_private.is_claim_value(candidate jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  candidate_type text := pg_catalog.jsonb_typeof(candidate);
  element jsonb;
begin
  if candidate_type in ('boolean', 'string') then
    return true;
  end if;

  if candidate_type = 'number' then
    return app_private.is_finite_json_number(candidate);
  end if;

  if candidate_type <> 'array' then
    return false;
  end if;

  for element in
    select array_element.value
    from pg_catalog.jsonb_array_elements(candidate) as array_element(value)
  loop
    if pg_catalog.jsonb_typeof(element) <> 'string' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function app_private.is_uuid_string_array(candidate jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  element jsonb;
  element_text text;
begin
  if pg_catalog.jsonb_typeof(candidate) is distinct from 'array' then
    return false;
  end if;

  for element in
    select array_element.value
    from pg_catalog.jsonb_array_elements(candidate) as array_element(value)
  loop
    if pg_catalog.jsonb_typeof(element) is distinct from 'string' then
      return false;
    end if;

    element_text := element #>> '{}';
    if element_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function app_private.is_criterion_evaluation(candidate jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(candidate) is distinct from 'object'
    or app_private.is_search_criterion(candidate -> 'criterion') is not true
    or pg_catalog.jsonb_typeof(candidate -> 'state') is distinct from 'string'
    or candidate ->> 'state' not in ('match', 'partial', 'missing', 'conflict')
    or pg_catalog.jsonb_typeof(candidate -> 'explanation') is distinct from 'string'
    or app_private.is_uuid_string_array(candidate -> 'evidenceIds') is not true then
    return false;
  end if;

  if candidate ? 'claimIds'
    and app_private.is_uuid_string_array(candidate -> 'claimIds') is not true then
    return false;
  end if;

  return true;
end;
$$;

create or replace function app_private.is_criterion_evaluations(candidate jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  element jsonb;
begin
  if pg_catalog.jsonb_typeof(candidate) is distinct from 'array' then
    return false;
  end if;

  for element in
    select array_element.value
    from pg_catalog.jsonb_array_elements(candidate) as array_element(value)
  loop
    if app_private.is_criterion_evaluation(element) is not true then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function
  app_private.ecmascript_trim(text),
  app_private.is_nonblank_ecmascript_text(text),
  app_private.is_finite_json_number(jsonb),
  app_private.is_criterion_value(jsonb),
  app_private.is_search_criterion(jsonb),
  app_private.is_claim_value(jsonb),
  app_private.is_uuid_string_array(jsonb),
  app_private.is_criterion_evaluation(jsonb),
  app_private.is_criterion_evaluations(jsonb)
from public, anon;

grant execute on function
  app_private.ecmascript_trim(text),
  app_private.is_nonblank_ecmascript_text(text),
  app_private.is_finite_json_number(jsonb),
  app_private.is_criterion_value(jsonb),
  app_private.is_search_criterion(jsonb),
  app_private.is_claim_value(jsonb),
  app_private.is_uuid_string_array(jsonb),
  app_private.is_criterion_evaluation(jsonb),
  app_private.is_criterion_evaluations(jsonb)
to authenticated, service_role;

alter table public.companies
  drop constraint companies_country_code_check,
  add constraint companies_country_code_format_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  headline text,
  avatar_url text,
  location text,
  bio text,
  onboarding_state text not null default 'not_started'
    check (onboarding_state in ('not_started', 'in_progress', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile keyed to auth.users. Email remains in the private auth schema.';

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('investor', 'founder')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create unique index user_roles_one_primary_idx
  on public.user_roles (user_id)
  where is_primary;

comment on table public.user_roles is
  'Self-selected product modes only. Never use these rows as an admin or privileged authorization source.';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  claimed_by_user_id uuid references public.profiles(id) on delete set null,
  name text not null check (app_private.is_nonblank_ecmascript_text(name)),
  slug text,
  tagline text,
  summary text,
  stage text,
  sector_tags text[] not null default '{}',
  team_size integer check (team_size is null or team_size >= 1),
  institutional_funding boolean,
  is_raising boolean,
  has_working_demo boolean,
  hackathon_origin text,
  traction_summary text,
  location text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  data_label text not null default 'real'
    check (data_label in ('real', 'public_import', 'synthetic_demo')),
  status text not null default 'draft'
    check (status in ('draft', 'ai_structured', 'founder_review', 'published', 'enriched', 'archived')),
  visibility text not null default 'private'
    check (visibility in ('private', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (status <> 'published' or visibility = 'published'),
  check (visibility <> 'published' or status in ('published', 'enriched')),
  check (visibility <> 'published' or published_at is not null)
);

create unique index projects_published_slug_unique_idx
  on public.projects (lower(slug))
  where slug is not null and visibility = 'published';
create index projects_created_by_idx on public.projects (created_by, updated_at desc);
create index projects_claimed_by_idx
  on public.projects (claimed_by_user_id)
  where claimed_by_user_id is not null;
create index projects_company_idx
  on public.projects (company_id)
  where company_id is not null;
create index projects_visibility_idx on public.projects (visibility, updated_at desc);

comment on column public.projects.claimed_by_user_id is
  'Authenticated founder who has claimed the project after a verified invitation flow.';
comment on column public.projects.created_by is
  'Creator provenance. Authenticated inserts require auth.uid(); the value is preserved as null if that account is deleted.';
comment on column public.projects.data_label is
  'Makes synthetic fixtures and public imports explicit in every product surface.';

create table public.project_founders (
  project_id uuid not null references public.projects(id) on delete cascade,
  founder_id uuid not null references public.founders(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  role_title text,
  is_primary boolean not null default false,
  relationship_state text not null default 'candidate'
    check (relationship_state in ('candidate', 'needs_review', 'founder_confirmed', 'admin_confirmed', 'rejected')),
  confidence numeric(4, 3) not null default 0 check (confidence between 0 and 1),
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, founder_id)
);

create unique index project_founders_one_primary_idx
  on public.project_founders (project_id)
  where is_primary and relationship_state <> 'rejected';
create index project_founders_founder_idx
  on public.project_founders (founder_id, relationship_state);

comment on table public.project_founders is
  'Project-scoped team membership, including teams whose project has no canonical company yet.';

create table public.fund_theses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (app_private.is_nonblank_ecmascript_text(name)),
  description text,
  natural_language_query text,
  source_scope text not null default 'internal_then_public'
    check (source_scope in ('internal', 'internal_then_public')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fund_theses_owner_idx on public.fund_theses (owner_user_id, updated_at desc);
create unique index fund_theses_one_active_idx
  on public.fund_theses (owner_user_id)
  where status = 'active';

create table public.thesis_criteria (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references public.fund_theses(id) on delete cascade,
  field text not null
    check (field in (
      'sector',
      'geography',
      'stage',
      'team_size',
      'technical_founder',
      'check_size',
      'acceptable_risk',
      'team_preferences',
      'valued_signal_types',
      'institutional_funding',
      'raising',
      'working_demo',
      'hackathon_origin',
      'traction'
    )),
  operator text not null
    check (operator in ('equals', 'includes_any', 'contains_all', 'lte', 'gte', 'between')),
  value jsonb not null,
  priority text not null check (priority in ('required', 'preferred', 'exclude')),
  label text not null check (app_private.is_nonblank_ecmascript_text(label)),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (app_private.is_criterion_value(value)),
  check (
    case
      when operator in ('lte', 'gte') then jsonb_typeof(value) = 'number'
      when operator = 'between' then
        case
          when jsonb_typeof(value) = 'array' then
            jsonb_array_length(value) = 2
            and jsonb_typeof(value -> 0) = 'number'
            and jsonb_typeof(value -> 1) = 'number'
            and (value -> 0) <= (value -> 1)
          else false
        end
      when operator in ('includes_any', 'contains_all') then
        case
          when jsonb_typeof(value) = 'array' then jsonb_array_length(value) > 0
          else false
        end
      else jsonb_typeof(value) in ('boolean', 'number', 'string', 'array')
    end
  ),
  check (
    (field in ('team_size', 'check_size') and operator in ('equals', 'lte', 'gte', 'between'))
    or (
      field in ('sector', 'geography', 'stage', 'team_preferences', 'valued_signal_types', 'hackathon_origin')
      and operator in ('equals', 'includes_any', 'contains_all')
    )
    or (
      field in ('technical_founder', 'acceptable_risk', 'institutional_funding', 'raising', 'working_demo', 'traction')
      and operator = 'equals'
    )
  )
);

create index thesis_criteria_thesis_idx
  on public.thesis_criteria (thesis_id, sort_order, created_at);

alter table public.evidence
  alter column company_id drop not null,
  add column project_id uuid references public.projects(id) on delete cascade,
  add column created_by uuid references public.profiles(id) on delete set null,
  add constraint evidence_has_scope_check
    check (project_id is not null or company_id is not null),
  drop constraint evidence_company_id_fkey,
  add constraint evidence_company_id_fkey
    foreign key (company_id) references public.companies(id) on delete set null,
  drop constraint evidence_company_id_evidence_type_content_hash_key;

create unique index evidence_project_content_unique_idx
  on public.evidence (project_id, evidence_type, content_hash)
  where project_id is not null;

create unique index evidence_import_content_unique_idx
  on public.evidence (company_id, evidence_type, content_hash)
  where project_id is null and created_by is null;

create index evidence_project_idx
  on public.evidence (project_id, captured_at desc)
  where project_id is not null;

create index evidence_created_by_idx
  on public.evidence (created_by, created_at desc)
  where created_by is not null;

comment on column public.evidence.created_by is
  'Owner for user-created private evidence. Imported public evidence may have no owner.';
comment on column public.evidence.project_id is
  'Project scope for user-submitted evidence, including projects without a canonical company.';

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  subject_type text not null check (subject_type in ('project', 'company', 'founder')),
  subject_id uuid not null,
  predicate text not null check (
    predicate ~ '^(project|company|founder)\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
    and split_part(predicate, '.', 1) = subject_type
  ),
  statement text not null check (app_private.is_nonblank_ecmascript_text(statement)),
  value jsonb not null
    check (app_private.is_claim_value(value)),
  state text not null default 'unverified'
    check (state in ('unverified', 'supported', 'partially_supported', 'contradicted', 'stale')),
  visibility text not null default 'private'
    check (visibility in ('private', 'published')),
  source_reliability smallint not null default 0
    check (source_reliability between 0 and 40),
  directness smallint not null default 0
    check (directness between 0 and 25),
  corroboration smallint not null default 0
    check (corroboration between 0 and 20),
  recency smallint not null default 0
    check (recency between 0 and 15),
  trust_score smallint generated always as (
    source_reliability + directness + corroboration + recency
  ) stored,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claims_project_idx on public.claims (project_id, state, updated_at desc);
create index claims_subject_idx on public.claims (subject_type, subject_id);
create index claims_created_by_idx
  on public.claims (created_by)
  where created_by is not null;

comment on table public.claims is
  'Atomic assertions. Unknown, unsupported, contradicted, and stale remain distinct states.';

create table public.claim_evidence (
  claim_id uuid not null references public.claims(id) on delete cascade,
  evidence_id uuid not null references public.evidence(id) on delete cascade,
  relation text not null check (relation in ('supports', 'contradicts', 'context')),
  note text,
  created_at timestamptz not null default now(),
  primary key (claim_id, evidence_id)
);

create index claim_evidence_evidence_idx on public.claim_evidence (evidence_id, claim_id);

create table public.searches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  thesis_id uuid references public.fund_theses(id) on delete set null,
  query text not null check (app_private.is_nonblank_ecmascript_text(query)),
  parsed_intent jsonb not null default '{}'::jsonb
    check (jsonb_typeof(parsed_intent) = 'object'),
  source_scope text not null default 'internal_then_public'
    check (source_scope in ('internal', 'internal_then_public')),
  status text not null default 'draft'
    check (status in (
      'draft',
      'searching_internal',
      'enriching_external',
      'deduplicating',
      'results_ready',
      'refined',
      'saved',
      'failed'
    )),
  result_count integer not null default 0 check (result_count >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status not in ('results_ready', 'refined', 'saved', 'failed')
    or completed_at is not null
  ),
  check (status <> 'failed' or app_private.is_nonblank_ecmascript_text(error_message))
);

create index searches_owner_idx on public.searches (owner_user_id, created_at desc);
create index searches_thesis_idx
  on public.searches (thesis_id, created_at desc)
  where thesis_id is not null;

create table public.search_results (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.searches(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  rank integer not null check (rank >= 1),
  thesis_match numeric(5, 2) not null check (thesis_match between 0 and 100),
  evidence_coverage numeric(5, 2) not null check (evidence_coverage between 0 and 100),
  criteria_evaluations jsonb not null default '[]'::jsonb
    check (app_private.is_criterion_evaluations(criteria_evaluations)),
  strongest_evidence_ids uuid[] not null default '{}',
  summary text,
  next_diligence_action text,
  created_at timestamptz not null default now(),
  unique (search_id, project_id),
  unique (search_id, rank)
);

create index search_results_project_idx on public.search_results (project_id, created_at desc);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  founder_id uuid references public.founders(id) on delete cascade,
  assessor_user_id uuid not null references public.profiles(id) on delete cascade,
  search_result_id uuid references public.search_results(id) on delete set null,
  assessment_type text not null default 'investment_review'
    check (assessment_type in ('founder_score', 'investment_review')),
  methodology_version text not null,
  status text not null default 'draft'
    check (status in ('draft', 'completed', 'stale')),
  recommendation text check (recommendation in ('watch', 'advance', 'pass')),
  summary text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or completed_at is not null),
  check (
    (assessment_type = 'founder_score' and founder_id is not null)
    or (assessment_type = 'investment_review' and founder_id is null)
  )
);

create index assessments_assessor_idx
  on public.assessments (assessor_user_id, updated_at desc);
create index assessments_project_idx
  on public.assessments (project_id, updated_at desc);
create index assessments_founder_history_idx
  on public.assessments (founder_id, created_at desc)
  where founder_id is not null;

create table public.assessment_dimensions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  dimension_key text not null check (app_private.is_nonblank_ecmascript_text(dimension_key)),
  label text not null check (app_private.is_nonblank_ecmascript_text(label)),
  score numeric(5, 2) check (score is null or score between 0 and 100),
  confidence numeric(4, 3) not null default 0 check (confidence between 0 and 1),
  state text not null default 'missing'
    check (state in ('supported', 'partial', 'missing', 'conflict')),
  rationale text,
  evidence_ids uuid[] not null default '{}',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, dimension_key),
  check (state <> 'missing' or score is null)
);

create index assessment_dimensions_assessment_idx
  on public.assessment_dimensions (assessment_id, sort_order);

comment on table public.assessment_dimensions is
  'Independent evaluation axes. No averaged score is stored at the assessment level.';

create table public.pipeline_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'discovered'
    check (status in ('discovered', 'reviewing', 'diligence', 'contacted', 'advancing', 'passed')),
  notes text,
  next_action text,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, project_id)
);

create index pipeline_items_owner_status_idx
  on public.pipeline_items (owner_user_id, status, updated_at desc);
create index pipeline_items_project_idx on public.pipeline_items (project_id);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  reason text,
  notify_on_new_evidence boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, project_id)
);

create index watchlist_items_owner_idx
  on public.watchlist_items (owner_user_id, updated_at desc);
create index watchlist_items_project_idx on public.watchlist_items (project_id);

create table public.memos (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (app_private.is_nonblank_ecmascript_text(title)),
  status text not null default 'draft'
    check (status in ('draft', 'generated', 'needs_evidence', 'reviewed', 'finalized')),
  executive_summary text,
  content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(content) = 'object'),
  model_version text,
  generated_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'finalized'
    or (
      finalized_at is not null
      and content <> '{}'::jsonb
    )
  )
);

create index memos_owner_idx on public.memos (owner_user_id, updated_at desc);
create index memos_project_idx on public.memos (project_id, updated_at desc);

create table public.memo_citations (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos(id) on delete cascade,
  section_key text not null check (app_private.is_nonblank_ecmascript_text(section_key)),
  claim_id uuid references public.claims(id) on delete set null,
  evidence_id uuid references public.evidence(id) on delete set null,
  cited_statement text not null check (app_private.is_nonblank_ecmascript_text(cited_statement)),
  note text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

comment on table public.memo_citations is
  'Cited text is retained as an immutable tombstone when its live claim or evidence target is deleted.';

create index memo_citations_memo_idx
  on public.memo_citations (memo_id, section_key, sort_order);
create index memo_citations_claim_idx
  on public.memo_citations (claim_id)
  where claim_id is not null;
create index memo_citations_evidence_idx
  on public.memo_citations (evidence_id)
  where evidence_id is not null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email text not null
    check (
      invitee_email = pg_catalog.lower(app_private.ecmascript_trim(invitee_email))
      and pg_catalog.strpos(invitee_email, '@') > 1
    ),
  invitee_user_id uuid references public.profiles(id) on delete set null,
  invitation_role text not null default 'founder'
    check (invitation_role in ('founder')),
  token_hash text not null unique check (length(token_hash) >= 32),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  ),
  check (
    status <> 'accepted'
    or accepted_at <= expires_at
  ),
  check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

create unique index invitations_one_pending_idx
  on public.invitations (project_id, invitee_email)
  where status = 'pending';
create index invitations_inviter_idx
  on public.invitations (inviter_user_id, created_at desc);
create index invitations_invitee_user_idx
  on public.invitations (invitee_user_id, created_at desc)
  where invitee_user_id is not null;

comment on column public.invitations.token_hash is
  'One-way token hash only. Raw invitation tokens must never be persisted.';

create table public.change_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  entity_type text not null check (app_private.is_nonblank_ecmascript_text(entity_type)),
  entity_id uuid not null,
  action text not null check (app_private.is_nonblank_ecmascript_text(action)),
  before_data jsonb,
  after_data jsonb,
  source text not null default 'user'
    check (source in ('user', 'system', 'enrichment', 'import')),
  created_at timestamptz not null default now()
);

create index change_events_entity_idx
  on public.change_events (entity_type, entity_id, created_at desc);
create index change_events_actor_idx
  on public.change_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

comment on table public.change_events is
  'Append-only audit events. Authenticated clients can only add and read events attributed to themselves.';

-- Ensure every auth identity has an application profile without trusting user metadata.
create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;
grant usage on schema app_private to supabase_auth_admin;
grant execute on function app_private.handle_new_auth_user() to supabase_auth_admin;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function app_private.set_updated_at() from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.set_updated_at() to authenticated;

create or replace function app_private.prepare_user_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_company_id uuid;
  target_claimed_by_user_id uuid;
begin
  if current_user_id is null then
    return new;
  end if;

  if new.project_id is null then
    raise exception 'User evidence requires a project scope' using errcode = '42501';
  end if;

  select project.company_id, project.claimed_by_user_id
  into target_company_id, target_claimed_by_user_id
  from public.projects project
  where project.id = new.project_id
    and (
      project.claimed_by_user_id = current_user_id
      or (
        project.claimed_by_user_id is null
        and project.created_by = current_user_id
      )
    );

  if not found then
    raise exception 'Evidence project is not editable by this user' using errcode = '42501';
  end if;

  new.company_id = target_company_id;
  new.founder_id = null;
  new.source_id = null;
  new.created_by = current_user_id;
  new.visibility = case
    when target_claimed_by_user_id = current_user_id
      or exists (
        select 1
        from public.user_roles product_role
        where product_role.user_id = current_user_id
          and product_role.role = 'founder'
          and product_role.is_primary
      ) then 'founder_private'
    else 'investor_private'
  end;
  new.verification_state = 'unverified';
  new.captured_at = now();
  new.created_at = now();
  new.content_hash = pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          '|',
          new.project_id::text,
          new.evidence_type,
          coalesce(new.source_url, ''),
          coalesce(new.private_object_path, ''),
          coalesce(new.excerpt, ''),
          coalesce(new.structured_payload::text, '')
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  return new;
end;
$$;

revoke all on function app_private.prepare_user_evidence() from public, anon;
grant execute on function app_private.prepare_user_evidence() to authenticated;

create or replace function app_private.enforce_claim_evidence_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_project_id uuid;
  claim_company_id uuid;
  evidence_project_id uuid;
  evidence_company_id uuid;
begin
  select claim.project_id, project.company_id
  into claim_project_id, claim_company_id
  from public.claims claim
  join public.projects project on project.id = claim.project_id
  where claim.id = new.claim_id;

  if not found then
    raise exception 'Claim does not exist';
  end if;

  select evidence_row.project_id, evidence_row.company_id
  into evidence_project_id, evidence_company_id
  from public.evidence evidence_row
  where evidence_row.id = new.evidence_id;

  if not found then
    raise exception 'Evidence does not exist';
  end if;

  if evidence_project_id is not null then
    if evidence_project_id <> claim_project_id
      or evidence_company_id is distinct from claim_company_id then
      raise exception 'Claim and evidence must share the same project and company scope';
    end if;
  elsif claim_company_id is null
    or evidence_company_id is distinct from claim_company_id then
    raise exception 'Company-only evidence must match the claim project company';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_claim_evidence_scope() from public, anon;
grant execute on function app_private.enforce_claim_evidence_scope() to authenticated;

create or replace function app_private.enforce_claim_subject_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
begin
  select project.company_id
  into target_company_id
  from public.projects project
  where project.id = new.project_id;

  if not found then
    raise exception 'Claim project does not exist';
  end if;

  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    if exists (
      select 1
      from public.claim_evidence link
      join public.evidence evidence_row on evidence_row.id = link.evidence_id
      where link.claim_id = old.id
        and (
          (
            evidence_row.project_id is not null
            and (
              evidence_row.project_id <> new.project_id
              or evidence_row.company_id is distinct from target_company_id
            )
          )
          or (
            evidence_row.project_id is null
            and (
              target_company_id is null
              or evidence_row.company_id is distinct from target_company_id
            )
          )
        )
    ) then
      raise exception 'Claim project change would invalidate evidence provenance';
    end if;

    if exists (
      select 1
      from public.memo_citations citation
      join public.memos memo on memo.id = citation.memo_id
      where citation.claim_id = old.id
        and memo.project_id <> new.project_id
    ) then
      raise exception 'Claim project change would invalidate a memo citation';
    end if;
  end if;

  if new.subject_type = 'project' then
    if new.subject_id <> new.project_id then
      raise exception 'Project claim subject must equal its project';
    end if;
  elsif new.subject_type = 'company' then
    if target_company_id is null or new.subject_id <> target_company_id then
      raise exception 'Company claim subject must equal the project company';
    end if;
  elsif new.subject_type = 'founder' then
    if not exists (
        select 1
        from public.project_founders relationship
        where relationship.project_id = new.project_id
          and relationship.founder_id = new.subject_id
          and relationship.relationship_state <> 'rejected'
      )
      and not exists (
        select 1
        from public.company_founders relationship
        where relationship.company_id = target_company_id
          and relationship.founder_id = new.subject_id
          and relationship.relationship_state <> 'rejected'
      ) then
      raise exception 'Founder claim subject is outside the project scope';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_claim_subject_scope() from public, anon;
grant execute on function app_private.enforce_claim_subject_scope() to authenticated;

create or replace function app_private.enforce_assessment_search_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_project_id uuid;
  result_owner_user_id uuid;
  target_company_id uuid;
begin
  select project.company_id
  into target_company_id
  from public.projects project
  where project.id = new.project_id;

  if not found then
    raise exception 'Assessment project does not exist';
  end if;

  if new.assessment_type = 'founder_score'
    and not exists (
      select 1
      from public.project_founders relationship
      where relationship.project_id = new.project_id
        and relationship.founder_id = new.founder_id
        and relationship.relationship_state <> 'rejected'
    )
    and not exists (
      select 1
      from public.projects project
      join public.company_founders relationship
        on relationship.company_id = project.company_id
      where project.id = new.project_id
        and relationship.founder_id = new.founder_id
        and relationship.relationship_state <> 'rejected'
    ) then
    raise exception 'Founder score must target a founder on the project team';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.project_id is distinct from old.project_id
      or new.assessor_user_id is distinct from old.assessor_user_id
    )
    and exists (
      select 1
      from public.assessment_dimensions dimension
      cross join unnest(dimension.evidence_ids) as candidate(evidence_id)
      left join public.evidence evidence_row on evidence_row.id = candidate.evidence_id
      where dimension.assessment_id = old.id
        and (
          evidence_row.id is null
          or evidence_row.company_id is distinct from target_company_id
          or (
            evidence_row.project_id is not null
            and evidence_row.project_id <> new.project_id
          )
          or (
            evidence_row.visibility <> 'public'
            and evidence_row.created_by is distinct from new.assessor_user_id
          )
        )
    ) then
    raise exception 'Assessment move would invalidate dimension evidence scope';
  end if;

  if new.search_result_id is not null then
    select result.project_id, search_row.owner_user_id
    into result_project_id, result_owner_user_id
    from public.search_results result
    join public.searches search_row on search_row.id = result.search_id
    where result.id = new.search_result_id;

    if not found
      or result_project_id <> new.project_id
      or result_owner_user_id <> new.assessor_user_id then
      raise exception 'Assessment search result must belong to the assessor and project';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_assessment_search_scope() from public, anon;
grant execute on function app_private.enforce_assessment_search_scope() to authenticated;

create or replace function app_private.sync_project_evidence_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id then
    -- A company-scoped citation no longer belongs to this project after a
    -- reassignment. Preserve its quoted text, but remove the stale live target.
    update public.memo_citations citation
    set evidence_id = null
    from public.memos memo, public.evidence evidence_row
    where citation.memo_id = memo.id
      and citation.evidence_id = evidence_row.id
      and memo.project_id = new.id
      and evidence_row.project_id is null
      and evidence_row.company_id is distinct from new.company_id;

    delete from public.claim_evidence link
    using public.claims claim, public.evidence evidence_row
    where link.claim_id = claim.id
      and link.evidence_id = evidence_row.id
      and claim.project_id = new.id
      and evidence_row.project_id is null
      and evidence_row.company_id is distinct from new.company_id;

    -- Polymorphic subjects must remain resolvable inside the new project scope.
    delete from public.claims claim
    where claim.project_id = new.id
      and claim.subject_type = 'company'
      and claim.subject_id is distinct from new.company_id;

    delete from public.claims claim
    where claim.project_id = new.id
      and claim.subject_type = 'founder'
      and not exists (
        select 1
        from public.project_founders relationship
        where relationship.project_id = new.id
          and relationship.founder_id = claim.subject_id
          and relationship.relationship_state <> 'rejected'
      )
      and not exists (
        select 1
        from public.company_founders relationship
        where relationship.company_id = new.company_id
          and relationship.founder_id = claim.subject_id
          and relationship.relationship_state <> 'rejected'
      );

    delete from public.assessments assessment
    where assessment.project_id = new.id
      and assessment.assessment_type = 'founder_score'
      and not exists (
        select 1
        from public.project_founders relationship
        where relationship.project_id = new.id
          and relationship.founder_id = assessment.founder_id
          and relationship.relationship_state <> 'rejected'
      )
      and not exists (
        select 1
        from public.company_founders relationship
        where relationship.company_id = new.company_id
          and relationship.founder_id = assessment.founder_id
          and relationship.relationship_state <> 'rejected'
      );

    update public.evidence
    set company_id = new.company_id,
        source_id = null
    where project_id = new.id
      and company_id is distinct from new.company_id;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_project_evidence_company() from public, anon;
grant execute on function app_private.sync_project_evidence_company() to authenticated;

create or replace function app_private.preserve_project_evidence_on_company_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.claims claim
  using public.projects project
  where claim.project_id = project.id
    and project.company_id = old.id
    and claim.subject_type = 'company'
    and claim.subject_id = old.id;

  delete from public.claims claim
  using public.projects project
  where claim.project_id = project.id
    and project.company_id = old.id
    and claim.subject_type = 'founder'
    and not exists (
      select 1
      from public.project_founders relationship
      where relationship.project_id = project.id
        and relationship.founder_id = claim.subject_id
        and relationship.relationship_state <> 'rejected'
    );

  delete from public.assessments assessment
  using public.projects project
  where assessment.project_id = project.id
    and project.company_id = old.id
    and assessment.assessment_type = 'founder_score'
    and not exists (
      select 1
      from public.project_founders relationship
      where relationship.project_id = project.id
        and relationship.founder_id = assessment.founder_id
        and relationship.relationship_state <> 'rejected'
    );

  delete from public.evidence
  where company_id = old.id
    and project_id is null;

  -- Resolve the project FK while the company still exists. The project trigger
  -- synchronizes project evidence and removes now-invalid polymorphic links.
  update public.projects
  set company_id = null
  where company_id = old.id;

  return old;
end;
$$;

revoke all on function app_private.preserve_project_evidence_on_company_delete() from public, anon;

create or replace function app_private.enforce_evidence_source_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_company_id uuid;
  source_company_id uuid;
begin
  if new.project_id is not null then
    select project.company_id
    into project_company_id
    from public.projects project
    where project.id = new.project_id;

    if not found or new.company_id is distinct from project_company_id then
      raise exception 'Project evidence must match its project company scope';
    end if;
  end if;

  if exists (
    select 1
    from public.claim_evidence link
    join public.claims claim on claim.id = link.claim_id
    join public.projects project on project.id = claim.project_id
    where link.evidence_id = new.id
      and (
        new.company_id is distinct from project.company_id
        or (new.project_id is not null and new.project_id <> claim.project_id)
      )
  ) then
    raise exception 'Evidence scope change would invalidate a claim provenance link';
  end if;

  if exists (
    select 1
    from public.memo_citations citation
    join public.memos memo on memo.id = citation.memo_id
    join public.projects project on project.id = memo.project_id
    where citation.evidence_id = new.id
      and (
        new.company_id is distinct from project.company_id
        or (new.project_id is not null and new.project_id <> memo.project_id)
      )
  ) then
    raise exception 'Evidence scope change would invalidate a memo citation';
  end if;

  if exists (
    select 1
    from public.search_results result
    join public.searches search on search.id = result.search_id
    join public.projects project on project.id = result.project_id
    where new.id = any(result.strongest_evidence_ids)
      and (
        new.company_id is distinct from project.company_id
        or (new.project_id is not null and new.project_id <> result.project_id)
        or (
          new.visibility <> 'public'
          and new.created_by is distinct from search.owner_user_id
        )
      )
  ) then
    raise exception 'Evidence scope change would invalidate a search result reference';
  end if;

  if exists (
    select 1
    from public.assessment_dimensions dimension
    join public.assessments assessment on assessment.id = dimension.assessment_id
    join public.projects project on project.id = assessment.project_id
    where new.id = any(dimension.evidence_ids)
      and (
        new.company_id is distinct from project.company_id
        or (new.project_id is not null and new.project_id <> assessment.project_id)
        or (
          new.visibility <> 'public'
          and new.created_by is distinct from assessment.assessor_user_id
        )
      )
  ) then
    raise exception 'Evidence scope change would invalidate an assessment reference';
  end if;

  if new.source_id is null then
    return new;
  end if;

  select source_row.company_id
  into source_company_id
  from public.company_sources source_row
  where source_row.id = new.source_id;

  if not found or source_company_id is distinct from new.company_id then
    raise exception 'Evidence source must belong to the evidence company';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_evidence_source_scope() from public, anon;
grant execute on function app_private.enforce_evidence_source_scope() to authenticated;

create or replace function app_private.enforce_company_founder_source_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_company_id uuid;
begin
  if new.source_id is null then
    return new;
  end if;

  select source_row.company_id
  into source_company_id
  from public.company_sources source_row
  where source_row.id = new.source_id;

  if not found or source_company_id <> new.company_id then
    raise exception 'Founder relationship source must belong to the same company';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_company_founder_source_scope() from public, anon;

create or replace function app_private.enforce_memo_citation_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  memo_project_id uuid;
  memo_company_id uuid;
  cited_claim_project_id uuid;
  cited_evidence_project_id uuid;
  cited_evidence_company_id uuid;
begin
  if tg_op = 'INSERT'
    and new.claim_id is null
    and new.evidence_id is null then
    raise exception 'A new memo citation requires a claim or evidence target';
  end if;

  -- FK SET NULL and provenance-link cleanup may run while the referenced parent
  -- row is already invisible to ordinary SELECTs. Removing a target cannot
  -- widen scope, so allow this one-way transition without re-resolving it.
  if tg_op = 'UPDATE'
    and new.memo_id is not distinct from old.memo_id
    and (new.claim_id is null or new.claim_id is not distinct from old.claim_id)
    and (new.evidence_id is null or new.evidence_id is not distinct from old.evidence_id)
    and (
      (old.claim_id is not null and new.claim_id is null)
      or (old.evidence_id is not null and new.evidence_id is null)
    ) then
    return new;
  end if;

  select memo.project_id, project.company_id
  into memo_project_id, memo_company_id
  from public.memos memo
  join public.projects project on project.id = memo.project_id
  where memo.id = new.memo_id;

  if not found then
    raise exception 'Memo does not exist';
  end if;

  if new.claim_id is not null then
    select claim.project_id
    into cited_claim_project_id
    from public.claims claim
    where claim.id = new.claim_id;

    if not found or cited_claim_project_id <> memo_project_id then
      raise exception 'Memo citation claim must belong to the memo project';
    end if;
  end if;

  if new.evidence_id is not null then
    select evidence_row.project_id, evidence_row.company_id
    into cited_evidence_project_id, cited_evidence_company_id
    from public.evidence evidence_row
    where evidence_row.id = new.evidence_id;

    if not found
      or (
        cited_evidence_project_id is not null
        and (
          cited_evidence_project_id <> memo_project_id
          or cited_evidence_company_id is distinct from memo_company_id
        )
      )
      or (
        cited_evidence_project_id is null
        and (
          memo_company_id is null
          or cited_evidence_company_id is distinct from memo_company_id
        )
      ) then
      raise exception 'Memo citation evidence must match the memo project scope';
    end if;
  end if;

  if new.claim_id is not null
    and new.evidence_id is not null
    and not exists (
      select 1
      from public.claim_evidence link
      where link.claim_id = new.claim_id
        and link.evidence_id = new.evidence_id
    ) then
    raise exception 'Memo claim and evidence must have a provenance link';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_memo_citation_scope() from public, anon;
grant execute on function app_private.enforce_memo_citation_scope() to authenticated;

create or replace function app_private.preserve_memo_citation_on_link_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.memo_citations
  set evidence_id = null
  where claim_id = old.claim_id
    and evidence_id = old.evidence_id;

  return old;
end;
$$;

revoke all on function app_private.preserve_memo_citation_on_link_delete() from public, anon;

create or replace function app_private.refresh_claim_after_link_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_claim_id uuid;
begin
  target_claim_id := case
    when tg_op = 'DELETE' then old.claim_id
    else new.claim_id
  end;

  update public.claims claim
  set state = 'unverified',
      visibility = 'private',
      source_reliability = 0,
      directness = 0,
      corroboration = 0,
      recency = 0
  where claim.id = target_claim_id
    and (
      not exists (
        select 1
        from public.claim_evidence remaining
        where remaining.claim_id = target_claim_id
      )
      or (
        claim.state in ('supported', 'partially_supported')
        and not exists (
          select 1
          from public.claim_evidence remaining
          where remaining.claim_id = target_claim_id
            and remaining.relation = 'supports'
        )
      )
      or (
        claim.state = 'contradicted'
        and not exists (
          select 1
          from public.claim_evidence remaining
          where remaining.claim_id = target_claim_id
            and remaining.relation = 'contradicts'
        )
      )
    );

  update public.claims claim
  set visibility = 'private'
  where claim.id = target_claim_id
    and claim.visibility = 'published'
    and not app_private.claim_has_public_evidence(target_claim_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.refresh_claim_after_link_delete() from public, anon;

create or replace function app_private.cleanup_project_founder_dependents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid := old.project_id;
  target_founder_id uuid := old.founder_id;
  target_company_id uuid;
begin
  select project.company_id
  into target_company_id
  from public.projects project
  where project.id = target_project_id;

  delete from public.claims claim
  where claim.project_id = target_project_id
    and claim.subject_type = 'founder'
    and claim.subject_id = target_founder_id
    and not exists (
      select 1
      from public.project_founders relationship
      where relationship.project_id = target_project_id
        and relationship.founder_id = target_founder_id
        and relationship.relationship_state <> 'rejected'
    )
    and not exists (
      select 1
      from public.company_founders relationship
      where relationship.company_id = target_company_id
        and relationship.founder_id = target_founder_id
        and relationship.relationship_state <> 'rejected'
    );

  delete from public.assessments assessment
  where assessment.project_id = target_project_id
    and assessment.assessment_type = 'founder_score'
    and assessment.founder_id = target_founder_id
    and not exists (
      select 1
      from public.project_founders relationship
      where relationship.project_id = target_project_id
        and relationship.founder_id = target_founder_id
        and relationship.relationship_state <> 'rejected'
    )
    and not exists (
      select 1
      from public.company_founders relationship
      where relationship.company_id = target_company_id
        and relationship.founder_id = target_founder_id
        and relationship.relationship_state <> 'rejected'
    );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.cleanup_project_founder_dependents() from public, anon;

create or replace function app_private.cleanup_company_founder_dependents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid := old.company_id;
  target_founder_id uuid := old.founder_id;
begin
  delete from public.claims claim
  using public.projects project
  where claim.project_id = project.id
    and project.company_id = target_company_id
    and claim.subject_type = 'founder'
    and claim.subject_id = target_founder_id
    and not exists (
      select 1
      from public.project_founders relationship
      where relationship.project_id = project.id
        and relationship.founder_id = target_founder_id
        and relationship.relationship_state <> 'rejected'
    )
    and not exists (
      select 1
      from public.company_founders relationship
      where relationship.company_id = target_company_id
        and relationship.founder_id = target_founder_id
        and relationship.relationship_state <> 'rejected'
    );

  delete from public.assessments assessment
  using public.projects project
  where assessment.project_id = project.id
    and project.company_id = target_company_id
    and assessment.assessment_type = 'founder_score'
    and assessment.founder_id = target_founder_id
    and not exists (
      select 1
      from public.project_founders relationship
      where relationship.project_id = project.id
        and relationship.founder_id = target_founder_id
        and relationship.relationship_state <> 'rejected'
    )
    and not exists (
      select 1
      from public.company_founders relationship
      where relationship.company_id = target_company_id
        and relationship.founder_id = target_founder_id
        and relationship.relationship_state <> 'rejected'
    );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.cleanup_company_founder_dependents() from public, anon;

create or replace function app_private.enforce_memo_project_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
begin
  if new.project_id is not distinct from old.project_id then
    return new;
  end if;

  select project.company_id
  into target_company_id
  from public.projects project
  where project.id = new.project_id;

  if not found then
    raise exception 'Memo project does not exist';
  end if;

  if exists (
    select 1
    from public.memo_citations citation
    join public.claims claim on claim.id = citation.claim_id
    where citation.memo_id = old.id
      and claim.project_id <> new.project_id
  ) then
    raise exception 'Memo project change would invalidate a claim citation';
  end if;

  if exists (
    select 1
    from public.memo_citations citation
    join public.evidence evidence_row on evidence_row.id = citation.evidence_id
    where citation.memo_id = old.id
      and (
        evidence_row.company_id is distinct from target_company_id
        or (
          evidence_row.project_id is not null
          and evidence_row.project_id <> new.project_id
        )
      )
  ) then
    raise exception 'Memo project change would invalidate an evidence citation';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_memo_project_scope() from public, anon;

create or replace function app_private.enforce_search_result_parent_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner_user_id uuid;
begin
  select search.owner_user_id
  into target_owner_user_id
  from public.searches search
  where search.id = new.search_id;

  if not found then
    raise exception 'Search result parent search does not exist';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.project_id is distinct from old.project_id
      or new.search_id is distinct from old.search_id
    )
    and exists (
      select 1
      from public.assessments assessment
      where assessment.search_result_id = old.id
        and (
          assessment.project_id <> new.project_id
          or assessment.assessor_user_id <> target_owner_user_id
        )
    ) then
    raise exception 'Search result move would invalidate a linked assessment';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_search_result_parent_scope() from public, anon;

create or replace function app_private.enforce_search_owner_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
    and exists (
      select 1
      from public.search_results result
      join public.assessments assessment
        on assessment.search_result_id = result.id
      where result.search_id = old.id
        and assessment.assessor_user_id <> new.owner_user_id
    ) then
    raise exception 'Search owner change would invalidate a linked assessment';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
    and exists (
      select 1
      from public.search_results result
      cross join unnest(result.strongest_evidence_ids) as candidate(evidence_id)
      join public.evidence evidence_row on evidence_row.id = candidate.evidence_id
      where result.search_id = old.id
        and evidence_row.visibility <> 'public'
        and evidence_row.created_by is distinct from new.owner_user_id
    ) then
    raise exception 'Search owner change would expose private evidence references';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_search_owner_scope() from public, anon;

create or replace function app_private.enforce_search_result_evidence_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  target_owner_user_id uuid;
  unique_evidence_count integer;
begin
  select project.company_id, search.owner_user_id
  into target_company_id, target_owner_user_id
  from public.projects project
  cross join public.searches search
  where project.id = new.project_id
    and search.id = new.search_id;

  if not found then
    raise exception 'Search result project and search must exist';
  end if;

  select count(distinct candidate.evidence_id)::integer
  into unique_evidence_count
  from unnest(new.strongest_evidence_ids) as candidate(evidence_id);

  if unique_evidence_count <> cardinality(new.strongest_evidence_ids) then
    raise exception 'Search result evidence references must be unique';
  end if;

  if exists (
    select 1
    from unnest(new.strongest_evidence_ids) as candidate(evidence_id)
    left join public.evidence evidence_row on evidence_row.id = candidate.evidence_id
    where evidence_row.id is null
      or evidence_row.company_id is distinct from target_company_id
      or (
        evidence_row.project_id is not null
        and evidence_row.project_id <> new.project_id
      )
      or (
        evidence_row.visibility <> 'public'
        and evidence_row.created_by is distinct from target_owner_user_id
      )
  ) then
    raise exception 'Search result evidence must be accessible in the result project scope';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_search_result_evidence_scope() from public, anon;

create or replace function app_private.enforce_dimension_evidence_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  target_company_id uuid;
  target_assessor_user_id uuid;
  unique_evidence_count integer;
begin
  select assessment.project_id, project.company_id, assessment.assessor_user_id
  into target_project_id, target_company_id, target_assessor_user_id
  from public.assessments assessment
  join public.projects project on project.id = assessment.project_id
  where assessment.id = new.assessment_id;

  if not found then
    raise exception 'Assessment dimension parent does not exist';
  end if;

  select count(distinct candidate.evidence_id)::integer
  into unique_evidence_count
  from unnest(new.evidence_ids) as candidate(evidence_id);

  if unique_evidence_count <> cardinality(new.evidence_ids) then
    raise exception 'Assessment dimension evidence references must be unique';
  end if;

  if exists (
    select 1
    from unnest(new.evidence_ids) as candidate(evidence_id)
    left join public.evidence evidence_row on evidence_row.id = candidate.evidence_id
    where evidence_row.id is null
      or evidence_row.company_id is distinct from target_company_id
      or (
        evidence_row.project_id is not null
        and evidence_row.project_id <> target_project_id
      )
      or (
        evidence_row.visibility <> 'public'
        and evidence_row.created_by is distinct from target_assessor_user_id
      )
  ) then
    raise exception 'Assessment evidence must be accessible in the assessment project scope';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_dimension_evidence_scope() from public, anon;

create or replace function app_private.remove_deleted_evidence_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.search_results
  set strongest_evidence_ids = array_remove(strongest_evidence_ids, old.id)
  where old.id = any(strongest_evidence_ids);

  update public.assessment_dimensions
  set evidence_ids = array_remove(evidence_ids, old.id)
  where old.id = any(evidence_ids);

  return old;
end;
$$;

revoke all on function app_private.remove_deleted_evidence_references() from public, anon;

create or replace function app_private.scrub_deleted_profile_private_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.claims
  where created_by = old.id
    and visibility = 'private';

  delete from public.evidence
  where created_by = old.id
    and visibility in ('founder_private', 'investor_private');

  delete from public.projects
  where visibility = 'private'
    and (
      (
        created_by = old.id
        and (claimed_by_user_id is null or claimed_by_user_id = old.id)
      )
      or (
        claimed_by_user_id = old.id
        and created_by is null
      )
    );

  return old;
end;
$$;

revoke all on function app_private.scrub_deleted_profile_private_data() from public, anon;
grant execute on function app_private.scrub_deleted_profile_private_data() to supabase_auth_admin;

create or replace function app_private.claim_has_public_evidence(target_claim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.claim_evidence link
    join public.evidence evidence_row on evidence_row.id = link.evidence_id
    where link.claim_id = target_claim_id
      and evidence_row.visibility = 'public'
  );
$$;

revoke all on function app_private.claim_has_public_evidence(uuid) from public, anon;
grant execute on function app_private.claim_has_public_evidence(uuid) to authenticated;

create or replace function app_private.apply_invitation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'Invitation is no longer pending';
  end if;

  if new.status = 'accepted' then
    if new.invitee_user_id is null or old.expires_at <= now() then
      raise exception 'Invitation is not eligible for acceptance';
    end if;

    new.accepted_at = now();
    new.revoked_at = null;

    update public.projects
    set claimed_by_user_id = new.invitee_user_id,
        status = case
          when status in ('draft', 'ai_structured') then 'founder_review'
          else status
        end
    where id = new.project_id
      and (claimed_by_user_id is null or claimed_by_user_id = new.invitee_user_id);

    if not found then
      raise exception 'Project is already claimed by another user';
    end if;
  elsif new.status = 'revoked' then
    new.revoked_at = now();
    new.accepted_at = null;
  elsif new.status = 'expired' then
    if old.expires_at > now() then
      raise exception 'Invitation has not expired';
    end if;
    new.accepted_at = null;
    new.revoked_at = null;
  else
    raise exception 'Invalid invitation status transition';
  end if;

  return new;
end;
$$;

revoke all on function app_private.apply_invitation_status() from public, anon;
grant execute on function app_private.apply_invitation_status() to authenticated;

create or replace function app_private.validate_invitation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending'
    or new.accepted_at is not null
    or new.revoked_at is not null then
    raise exception 'Invitations must begin in the pending state';
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_invitation_insert() from public, anon;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function app_private.handle_new_auth_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app_private.set_updated_at();
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function app_private.set_updated_at();
create trigger project_founders_set_updated_at
  before update on public.project_founders
  for each row execute function app_private.set_updated_at();
create trigger fund_theses_set_updated_at
  before update on public.fund_theses
  for each row execute function app_private.set_updated_at();
create trigger thesis_criteria_set_updated_at
  before update on public.thesis_criteria
  for each row execute function app_private.set_updated_at();
create trigger claims_set_updated_at
  before update on public.claims
  for each row execute function app_private.set_updated_at();
create trigger searches_set_updated_at
  before update on public.searches
  for each row execute function app_private.set_updated_at();
create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function app_private.set_updated_at();
create trigger assessment_dimensions_set_updated_at
  before update on public.assessment_dimensions
  for each row execute function app_private.set_updated_at();
create trigger pipeline_items_set_updated_at
  before update on public.pipeline_items
  for each row execute function app_private.set_updated_at();
create trigger watchlist_items_set_updated_at
  before update on public.watchlist_items
  for each row execute function app_private.set_updated_at();
create trigger memos_set_updated_at
  before update on public.memos
  for each row execute function app_private.set_updated_at();
create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function app_private.set_updated_at();
create trigger invitations_apply_status
  before update of status on public.invitations
  for each row execute function app_private.apply_invitation_status();
create trigger invitations_validate_insert
  before insert on public.invitations
  for each row execute function app_private.validate_invitation_insert();
create trigger evidence_10_prepare_user_insert
  before insert on public.evidence
  for each row execute function app_private.prepare_user_evidence();
create trigger claim_evidence_enforce_scope
  before insert or update of claim_id, evidence_id on public.claim_evidence
  for each row execute function app_private.enforce_claim_evidence_scope();
create trigger claim_evidence_10_preserve_memo_citation
  before delete on public.claim_evidence
  for each row execute function app_private.preserve_memo_citation_on_link_delete();
create trigger claim_evidence_20_refresh_claim
  after delete on public.claim_evidence
  for each row execute function app_private.refresh_claim_after_link_delete();
create trigger claim_evidence_21_refresh_claim_relation
  after update of relation on public.claim_evidence
  for each row execute function app_private.refresh_claim_after_link_delete();
create trigger claims_enforce_subject_scope
  before insert or update of project_id, subject_type, subject_id on public.claims
  for each row execute function app_private.enforce_claim_subject_scope();
create trigger assessments_enforce_search_scope
  before insert or update of
    project_id,
    founder_id,
    assessor_user_id,
    search_result_id,
    assessment_type
  on public.assessments
  for each row execute function app_private.enforce_assessment_search_scope();
create trigger search_results_enforce_parent_scope
  before update of search_id, project_id on public.search_results
  for each row execute function app_private.enforce_search_result_parent_scope();
create trigger search_results_enforce_evidence_scope
  before insert or update of search_id, project_id, strongest_evidence_ids
  on public.search_results
  for each row execute function app_private.enforce_search_result_evidence_scope();
create trigger searches_enforce_owner_scope
  before update of owner_user_id on public.searches
  for each row execute function app_private.enforce_search_owner_scope();
create trigger memos_enforce_project_scope
  before update of project_id on public.memos
  for each row execute function app_private.enforce_memo_project_scope();
create trigger assessment_dimensions_enforce_evidence_scope
  before insert or update of assessment_id, evidence_ids
  on public.assessment_dimensions
  for each row execute function app_private.enforce_dimension_evidence_scope();
create trigger projects_sync_evidence_company
  after update of company_id on public.projects
  for each row execute function app_private.sync_project_evidence_company();
create trigger companies_preserve_project_evidence
  before delete on public.companies
  for each row execute function app_private.preserve_project_evidence_on_company_delete();
create trigger evidence_20_enforce_source_scope
  before insert or update of project_id, company_id, source_id on public.evidence
  for each row execute function app_private.enforce_evidence_source_scope();
create trigger evidence_30_remove_deleted_references
  after delete on public.evidence
  for each row execute function app_private.remove_deleted_evidence_references();
create trigger company_founders_enforce_source_scope
  before insert or update of company_id, source_id on public.company_founders
  for each row execute function app_private.enforce_company_founder_source_scope();
create trigger project_founders_cleanup_dependents_after_delete
  after delete on public.project_founders
  for each row execute function app_private.cleanup_project_founder_dependents();
create trigger project_founders_cleanup_dependents_after_update
  after update of project_id, founder_id, relationship_state on public.project_founders
  for each row execute function app_private.cleanup_project_founder_dependents();
create trigger company_founders_cleanup_dependents_after_delete
  after delete on public.company_founders
  for each row execute function app_private.cleanup_company_founder_dependents();
create trigger company_founders_cleanup_dependents_after_update
  after update of company_id, founder_id, relationship_state on public.company_founders
  for each row execute function app_private.cleanup_company_founder_dependents();
create trigger memo_citations_enforce_scope
  before insert or update of memo_id, claim_id, evidence_id on public.memo_citations
  for each row execute function app_private.enforce_memo_citation_scope();
create trigger profiles_scrub_private_data
  before delete on public.profiles
  for each row execute function app_private.scrub_deleted_profile_private_data();

-- Row-level security is mandatory on every table in the exposed public schema.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.projects enable row level security;
alter table public.project_founders enable row level security;
alter table public.fund_theses enable row level security;
alter table public.thesis_criteria enable row level security;
alter table public.claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.searches enable row level security;
alter table public.search_results enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_dimensions enable row level security;
alter table public.pipeline_items enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.memos enable row level security;
alter table public.memo_citations enable row level security;
alter table public.invitations enable row level security;
alter table public.change_events enable row level security;

-- Existing data-core tables stay server-managed. Only explicitly safe reads or
-- user-owned evidence mutations are exposed to authenticated clients.
create policy companies_read_authenticated
  on public.companies for select to authenticated
  using (true);

create policy founders_read_authenticated
  on public.founders for select to authenticated
  using (true);

create policy company_founders_read_authenticated
  on public.company_founders for select to authenticated
  using (
    relationship_state in ('founder_confirmed', 'admin_confirmed')
    or exists (
      select 1
      from public.projects project
      where project.company_id = company_founders.company_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
  );

create policy evidence_read_public_or_owned
  on public.evidence for select to authenticated
  using (
    visibility = 'public'
    or created_by = (select auth.uid())
  );

create policy evidence_insert_owned
  on public.evidence for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and project_id is not null
    and founder_id is null
    and source_id is null
    and visibility in ('founder_private', 'investor_private')
    and verification_state = 'unverified'
    and exists (
      select 1
      from public.projects project
      where project.id = evidence.project_id
        and project.company_id is not distinct from evidence.company_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
  );

create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy user_roles_select_own
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_roles_insert_own
  on public.user_roles for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_roles_update_own
  on public.user_roles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_roles_delete_own
  on public.user_roles for delete to authenticated
  using (user_id = (select auth.uid()));

create policy projects_select_accessible
  on public.projects for select to authenticated
  using (
    created_by = (select auth.uid())
    or claimed_by_user_id = (select auth.uid())
    or visibility = 'published'
  );

create policy projects_insert_owned
  on public.projects for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and company_id is null
    and claimed_by_user_id is null
    and data_label = 'real'
    and status = 'draft'
    and visibility = 'private'
    and published_at is null
  );

create policy projects_update_collaborator
  on public.projects for update to authenticated
  using (
    claimed_by_user_id = (select auth.uid())
    or (
      claimed_by_user_id is null
      and created_by = (select auth.uid())
    )
  )
  with check (
    claimed_by_user_id = (select auth.uid())
    or (
      claimed_by_user_id is null
      and created_by = (select auth.uid())
    )
  );

create policy project_founders_select_accessible
  on public.project_founders for select to authenticated
  using (
    exists (
      select 1
      from public.projects project
      where project.id = project_founders.project_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
          or (
            project.visibility = 'published'
            and project_founders.relationship_state in ('founder_confirmed', 'admin_confirmed')
          )
        )
    )
  );

create policy fund_theses_select_own
  on public.fund_theses for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy fund_theses_insert_own
  on public.fund_theses for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy fund_theses_update_own
  on public.fund_theses for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy fund_theses_delete_own
  on public.fund_theses for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create policy thesis_criteria_select_own
  on public.thesis_criteria for select to authenticated
  using (
    exists (
      select 1
      from public.fund_theses thesis
      where thesis.id = thesis_criteria.thesis_id
        and thesis.owner_user_id = (select auth.uid())
    )
  );

create policy thesis_criteria_insert_own
  on public.thesis_criteria for insert to authenticated
  with check (
    exists (
      select 1
      from public.fund_theses thesis
      where thesis.id = thesis_criteria.thesis_id
        and thesis.owner_user_id = (select auth.uid())
    )
  );

create policy thesis_criteria_update_own
  on public.thesis_criteria for update to authenticated
  using (
    exists (
      select 1
      from public.fund_theses thesis
      where thesis.id = thesis_criteria.thesis_id
        and thesis.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.fund_theses thesis
      where thesis.id = thesis_criteria.thesis_id
        and thesis.owner_user_id = (select auth.uid())
    )
  );

create policy thesis_criteria_delete_own
  on public.thesis_criteria for delete to authenticated
  using (
    exists (
      select 1
      from public.fund_theses thesis
      where thesis.id = thesis_criteria.thesis_id
        and thesis.owner_user_id = (select auth.uid())
    )
  );

create policy claims_select_accessible_project
  on public.claims for select to authenticated
  using (
    exists (
      select 1
      from public.projects project
      where project.id = claims.project_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
          or (
            project.visibility = 'published'
            and claims.visibility = 'published'
            and claims.state <> 'unverified'
            and (select app_private.claim_has_public_evidence(claims.id))
          )
        )
    )
  );

create policy claims_insert_project_collaborator
  on public.claims for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and state = 'unverified'
    and visibility = 'private'
    and source_reliability = 0
    and directness = 0
    and corroboration = 0
    and recency = 0
    and exists (
      select 1
      from public.projects project
      where project.id = claims.project_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
  );

create policy claims_update_project_collaborator
  on public.claims for update to authenticated
  using (
    state = 'unverified'
    and visibility = 'private'
    and
    exists (
      select 1
      from public.projects project
      where project.id = claims.project_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
  )
  with check (
    state = 'unverified'
    and visibility = 'private'
    and
    exists (
      select 1
      from public.projects project
      where project.id = claims.project_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
  );

create policy claims_delete_project_collaborator
  on public.claims for delete to authenticated
  using (
    state = 'unverified'
    and visibility = 'private'
    and
    exists (
      select 1
      from public.projects project
      where project.id = claims.project_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
  );

create policy claim_evidence_select_accessible
  on public.claim_evidence for select to authenticated
  using (
    exists (
      select 1
      from public.claims claim
      join public.projects project on project.id = claim.project_id
      where claim.id = claim_evidence.claim_id
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
          or (
            project.visibility = 'published'
            and claim.visibility = 'published'
            and claim.state <> 'unverified'
            and (select app_private.claim_has_public_evidence(claim.id))
          )
        )
    )
    and exists (
      select 1
      from public.evidence evidence_row
      where evidence_row.id = claim_evidence.evidence_id
        and (
          evidence_row.visibility = 'public'
          or evidence_row.created_by = (select auth.uid())
        )
    )
  );

create policy claim_evidence_insert_collaborator
  on public.claim_evidence for insert to authenticated
  with check (
    exists (
      select 1
      from public.claims claim
      join public.projects project on project.id = claim.project_id
      where claim.id = claim_evidence.claim_id
        and claim.state = 'unverified'
        and claim.visibility = 'private'
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
    and exists (
      select 1
      from public.evidence evidence_row
      where evidence_row.id = claim_evidence.evidence_id
        and (
          evidence_row.visibility = 'public'
          or evidence_row.created_by = (select auth.uid())
        )
    )
  );

create policy claim_evidence_update_collaborator
  on public.claim_evidence for update to authenticated
  using (
    exists (
      select 1
      from public.claims claim
      join public.projects project on project.id = claim.project_id
      where claim.id = claim_evidence.claim_id
        and claim.state = 'unverified'
        and claim.visibility = 'private'
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.claims claim
      join public.projects project on project.id = claim.project_id
      where claim.id = claim_evidence.claim_id
        and claim.state = 'unverified'
        and claim.visibility = 'private'
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
    and exists (
      select 1
      from public.evidence evidence_row
      where evidence_row.id = claim_evidence.evidence_id
        and (
          evidence_row.visibility = 'public'
          or evidence_row.created_by = (select auth.uid())
        )
    )
  );

create policy claim_evidence_delete_collaborator
  on public.claim_evidence for delete to authenticated
  using (
    exists (
      select 1
      from public.claims claim
      join public.projects project on project.id = claim.project_id
      where claim.id = claim_evidence.claim_id
        and claim.state = 'unverified'
        and claim.visibility = 'private'
        and (
          project.claimed_by_user_id = (select auth.uid())
          or (
            project.claimed_by_user_id is null
            and project.created_by = (select auth.uid())
          )
        )
    )
  );

create policy searches_select_own
  on public.searches for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy searches_insert_own
  on public.searches for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and (
      thesis_id is null
      or exists (
        select 1
        from public.fund_theses thesis
        where thesis.id = searches.thesis_id
          and thesis.owner_user_id = (select auth.uid())
      )
    )
  );

create policy searches_update_own
  on public.searches for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (
    owner_user_id = (select auth.uid())
    and (
      thesis_id is null
      or exists (
        select 1
        from public.fund_theses thesis
        where thesis.id = searches.thesis_id
          and thesis.owner_user_id = (select auth.uid())
      )
    )
  );

create policy searches_delete_own
  on public.searches for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create policy search_results_select_own
  on public.search_results for select to authenticated
  using (
    exists (
      select 1
      from public.searches search_row
      where search_row.id = search_results.search_id
        and search_row.owner_user_id = (select auth.uid())
    )
  );

create policy search_results_insert_own
  on public.search_results for insert to authenticated
  with check (
    exists (
      select 1
      from public.searches search_row
      where search_row.id = search_results.search_id
        and search_row.owner_user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.projects project
      where project.id = search_results.project_id
        and (
          project.created_by = (select auth.uid())
          or project.claimed_by_user_id = (select auth.uid())
          or project.visibility = 'published'
        )
    )
  );

create policy search_results_update_own
  on public.search_results for update to authenticated
  using (
    exists (
      select 1
      from public.searches search_row
      where search_row.id = search_results.search_id
        and search_row.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.searches search_row
      where search_row.id = search_results.search_id
        and search_row.owner_user_id = (select auth.uid())
    )
  );

create policy search_results_delete_own
  on public.search_results for delete to authenticated
  using (
    exists (
      select 1
      from public.searches search_row
      where search_row.id = search_results.search_id
        and search_row.owner_user_id = (select auth.uid())
    )
  );

create policy assessments_select_own
  on public.assessments for select to authenticated
  using (assessor_user_id = (select auth.uid()));

create policy assessments_insert_own
  on public.assessments for insert to authenticated
  with check (
    assessor_user_id = (select auth.uid())
    and exists (
      select 1
      from public.projects project
      where project.id = assessments.project_id
        and (
          project.created_by = (select auth.uid())
          or project.claimed_by_user_id = (select auth.uid())
          or project.visibility = 'published'
        )
    )
  );

create policy assessments_update_own
  on public.assessments for update to authenticated
  using (assessor_user_id = (select auth.uid()))
  with check (assessor_user_id = (select auth.uid()));

create policy assessments_delete_own
  on public.assessments for delete to authenticated
  using (assessor_user_id = (select auth.uid()));

create policy assessment_dimensions_select_own
  on public.assessment_dimensions for select to authenticated
  using (
    exists (
      select 1
      from public.assessments assessment
      where assessment.id = assessment_dimensions.assessment_id
        and assessment.assessor_user_id = (select auth.uid())
    )
  );

create policy assessment_dimensions_insert_own
  on public.assessment_dimensions for insert to authenticated
  with check (
    exists (
      select 1
      from public.assessments assessment
      where assessment.id = assessment_dimensions.assessment_id
        and assessment.assessor_user_id = (select auth.uid())
    )
  );

create policy assessment_dimensions_update_own
  on public.assessment_dimensions for update to authenticated
  using (
    exists (
      select 1
      from public.assessments assessment
      where assessment.id = assessment_dimensions.assessment_id
        and assessment.assessor_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.assessments assessment
      where assessment.id = assessment_dimensions.assessment_id
        and assessment.assessor_user_id = (select auth.uid())
    )
  );

create policy assessment_dimensions_delete_own
  on public.assessment_dimensions for delete to authenticated
  using (
    exists (
      select 1
      from public.assessments assessment
      where assessment.id = assessment_dimensions.assessment_id
        and assessment.assessor_user_id = (select auth.uid())
    )
  );

create policy pipeline_items_select_own
  on public.pipeline_items for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy pipeline_items_insert_own
  on public.pipeline_items for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and exists (
      select 1
      from public.projects project
      where project.id = pipeline_items.project_id
        and (
          project.created_by = (select auth.uid())
          or project.claimed_by_user_id = (select auth.uid())
          or project.visibility = 'published'
        )
    )
  );

create policy pipeline_items_update_own
  on public.pipeline_items for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy pipeline_items_delete_own
  on public.pipeline_items for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create policy watchlist_items_select_own
  on public.watchlist_items for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy watchlist_items_insert_own
  on public.watchlist_items for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and exists (
      select 1
      from public.projects project
      where project.id = watchlist_items.project_id
        and (
          project.created_by = (select auth.uid())
          or project.claimed_by_user_id = (select auth.uid())
          or project.visibility = 'published'
        )
    )
  );

create policy watchlist_items_update_own
  on public.watchlist_items for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy watchlist_items_delete_own
  on public.watchlist_items for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create policy memos_select_own
  on public.memos for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy memos_insert_own
  on public.memos for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and exists (
      select 1
      from public.projects project
      where project.id = memos.project_id
        and (
          project.created_by = (select auth.uid())
          or project.claimed_by_user_id = (select auth.uid())
          or project.visibility = 'published'
        )
    )
  );

create policy memos_update_own
  on public.memos for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy memos_delete_own
  on public.memos for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create policy memo_citations_select_own
  on public.memo_citations for select to authenticated
  using (
    exists (
      select 1
      from public.memos memo
      where memo.id = memo_citations.memo_id
        and memo.owner_user_id = (select auth.uid())
    )
  );

create policy memo_citations_insert_own
  on public.memo_citations for insert to authenticated
  with check (
    exists (
      select 1
      from public.memos memo
      where memo.id = memo_citations.memo_id
        and memo.owner_user_id = (select auth.uid())
    )
    and (
      claim_id is null
      or exists (
        select 1
        from public.claims claim
        join public.projects project on project.id = claim.project_id
        where claim.id = memo_citations.claim_id
          and (
            project.created_by = (select auth.uid())
            or project.claimed_by_user_id = (select auth.uid())
            or project.visibility = 'published'
          )
      )
    )
    and (
      evidence_id is null
      or exists (
        select 1
        from public.evidence evidence_row
        where evidence_row.id = memo_citations.evidence_id
          and (
            evidence_row.visibility = 'public'
            or evidence_row.created_by = (select auth.uid())
          )
      )
    )
  );

create policy memo_citations_update_own
  on public.memo_citations for update to authenticated
  using (
    exists (
      select 1
      from public.memos memo
      where memo.id = memo_citations.memo_id
        and memo.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.memos memo
      where memo.id = memo_citations.memo_id
        and memo.owner_user_id = (select auth.uid())
    )
    and (
      claim_id is null
      or exists (
        select 1
        from public.claims claim
        join public.projects project on project.id = claim.project_id
        where claim.id = memo_citations.claim_id
          and (
            project.created_by = (select auth.uid())
            or project.claimed_by_user_id = (select auth.uid())
            or project.visibility = 'published'
          )
      )
    )
    and (
      evidence_id is null
      or exists (
        select 1
        from public.evidence evidence_row
        where evidence_row.id = memo_citations.evidence_id
          and (
            evidence_row.visibility = 'public'
            or evidence_row.created_by = (select auth.uid())
          )
      )
    )
  );

create policy memo_citations_delete_own
  on public.memo_citations for delete to authenticated
  using (
    exists (
      select 1
      from public.memos memo
      where memo.id = memo_citations.memo_id
        and memo.owner_user_id = (select auth.uid())
    )
  );

create policy invitations_select_participant
  on public.invitations for select to authenticated
  using (
    inviter_user_id = (select auth.uid())
    or invitee_user_id = (select auth.uid())
  );

create policy invitations_insert_creator
  on public.invitations for insert to authenticated
  with check (
    inviter_user_id = (select auth.uid())
    and invitee_user_id is null
    and status = 'pending'
    and accepted_at is null
    and revoked_at is null
    and exists (
      select 1
      from public.projects project
      where project.id = invitations.project_id
        and project.claimed_by_user_id is null
        and project.created_by = (select auth.uid())
    )
  );

create policy invitations_update_inviter
  on public.invitations for update to authenticated
  using (inviter_user_id = (select auth.uid()))
  with check (
    inviter_user_id = (select auth.uid())
    and status in ('pending', 'revoked', 'expired')
    and accepted_at is null
    and exists (
      select 1
      from public.projects project
      where project.id = invitations.project_id
        and project.claimed_by_user_id is null
        and project.created_by = (select auth.uid())
    )
  );

create policy invitations_accept_linked_invitee
  on public.invitations for update to authenticated
  using (
    invitee_user_id = (select auth.uid())
    and status = 'pending'
    and expires_at > now()
  )
  with check (
    invitee_user_id = (select auth.uid())
    and status = 'accepted'
    and accepted_at is not null
  );

create policy change_events_select_own
  on public.change_events for select to authenticated
  using (actor_user_id = (select auth.uid()));

create policy change_events_insert_own
  on public.change_events for insert to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and source = 'user'
  );

-- Explicit API privileges: unauthenticated access is denied, and server-managed
-- ingestion tables remain unavailable to authenticated Data API clients.
revoke all on table
  public.companies,
  public.company_sources,
  public.founders,
  public.founder_identities,
  public.company_founders,
  public.evidence,
  public.enrichment_runs,
  public.profiles,
  public.user_roles,
  public.projects,
  public.project_founders,
  public.fund_theses,
  public.thesis_criteria,
  public.claims,
  public.claim_evidence,
  public.searches,
  public.search_results,
  public.assessments,
  public.assessment_dimensions,
  public.pipeline_items,
  public.watchlist_items,
  public.memos,
  public.memo_citations,
  public.invitations,
  public.change_events
from anon, authenticated;

grant select on table
  public.companies,
  public.founders,
  public.company_founders,
  public.project_founders
to authenticated;

grant select, insert, delete on table
  public.user_roles,
  public.fund_theses,
  public.thesis_criteria,
  public.claims,
  public.searches,
  public.search_results,
  public.assessments,
  public.assessment_dimensions,
  public.pipeline_items,
  public.watchlist_items,
  public.memos
to authenticated;

grant select, insert on table public.evidence to authenticated;

grant update (is_primary) on public.user_roles to authenticated;

grant update (name, description, natural_language_query, source_scope, status)
  on public.fund_theses to authenticated;

grant update (field, operator, value, priority, label, sort_order)
  on public.thesis_criteria to authenticated;

grant update (
  subject_type,
  subject_id,
  predicate,
  statement,
  value,
  observed_at
) on public.claims to authenticated;

grant update (
  thesis_id,
  query,
  parsed_intent,
  source_scope,
  status,
  result_count,
  error_message,
  started_at,
  completed_at
) on public.searches to authenticated;

grant update (
  rank,
  thesis_match,
  evidence_coverage,
  criteria_evaluations,
  strongest_evidence_ids,
  summary,
  next_diligence_action
) on public.search_results to authenticated;

grant update (
  assessment_type,
  methodology_version,
  status,
  recommendation,
  summary,
  completed_at
) on public.assessments to authenticated;

grant update (
  dimension_key,
  label,
  score,
  confidence,
  state,
  rationale,
  evidence_ids,
  sort_order
) on public.assessment_dimensions to authenticated;

grant update (status, notes, next_action, next_action_at)
  on public.pipeline_items to authenticated;

grant update (reason, notify_on_new_evidence)
  on public.watchlist_items to authenticated;

grant update (
  title,
  status,
  executive_summary,
  content,
  model_version,
  generated_at,
  finalized_at
) on public.memos to authenticated;

grant select, insert on table public.projects to authenticated;
grant update (
  name,
  slug,
  tagline,
  summary,
  stage,
  sector_tags,
  team_size,
  institutional_funding,
  is_raising,
  has_working_demo,
  hackathon_origin,
  traction_summary,
  location,
  country_code
) on public.projects to authenticated;

grant select, insert, delete on table public.claim_evidence to authenticated;
grant update (relation, note) on public.claim_evidence to authenticated;

grant select, insert, delete on table public.memo_citations to authenticated;
grant update (section_key, note, sort_order)
  on public.memo_citations to authenticated;

grant select, insert on table public.profiles to authenticated;
grant update (display_name, headline, avatar_url, location, bio, onboarding_state)
  on public.profiles to authenticated;

grant select, insert on table public.invitations to authenticated;
grant update (status, expires_at)
  on public.invitations to authenticated;
grant select, insert on table public.change_events to authenticated;

-- The secret server role is not a client authorization mechanism, but it still
-- needs SQL privileges in deployments where public-schema defaults are closed.
grant usage on schema public, app_private to service_role;

grant select on table
  public.companies,
  public.company_sources,
  public.founders,
  public.founder_identities,
  public.company_founders,
  public.evidence,
  public.enrichment_runs,
  public.profiles,
  public.user_roles,
  public.projects,
  public.project_founders,
  public.fund_theses,
  public.thesis_criteria,
  public.claims,
  public.claim_evidence,
  public.searches,
  public.search_results,
  public.assessments,
  public.assessment_dimensions,
  public.pipeline_items,
  public.watchlist_items,
  public.memos,
  public.memo_citations,
  public.invitations,
  public.change_events
to service_role;

grant insert, update on table
  public.companies,
  public.founders,
  public.founder_identities,
  public.company_founders,
  public.evidence,
  public.enrichment_runs,
  public.projects,
  public.project_founders,
  public.claims,
  public.assessments,
  public.memos,
  public.invitations
to service_role;

grant insert on table
  public.company_sources,
  public.change_events
to service_role;

grant insert, delete on table public.claim_evidence to service_role;
grant update (relation, note) on public.claim_evidence to service_role;

grant insert, update, delete on table public.memo_citations to service_role;

grant insert, update, delete on table
  public.search_results,
  public.assessment_dimensions
to service_role;

grant update on table public.searches to service_role;

grant execute on function
  app_private.set_updated_at(),
  app_private.prepare_user_evidence(),
  app_private.enforce_claim_evidence_scope(),
  app_private.enforce_claim_subject_scope(),
  app_private.enforce_assessment_search_scope(),
  app_private.sync_project_evidence_company(),
  app_private.enforce_evidence_source_scope(),
  app_private.enforce_company_founder_source_scope(),
  app_private.enforce_memo_citation_scope(),
  app_private.preserve_memo_citation_on_link_delete(),
  app_private.refresh_claim_after_link_delete(),
  app_private.cleanup_project_founder_dependents(),
  app_private.cleanup_company_founder_dependents(),
  app_private.enforce_memo_project_scope(),
  app_private.enforce_search_result_parent_scope(),
  app_private.enforce_search_owner_scope(),
  app_private.enforce_search_result_evidence_scope(),
  app_private.enforce_dimension_evidence_scope(),
  app_private.remove_deleted_evidence_references(),
  app_private.claim_has_public_evidence(uuid),
  app_private.apply_invitation_status(),
  app_private.validate_invitation_insert()
to service_role;
