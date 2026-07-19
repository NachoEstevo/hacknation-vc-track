alter table public.hack_nation_startup_candidates
  add column source_record_id text unique,
  add column priority_tier text,
  add column outreach_score smallint check (outreach_score between 0 and 100),
  add column confidence text check (confidence in ('Alto', 'Medio', 'Bajo')),
  add column evidence_status text,
  add column sector text,
  add column investment_thesis text,
  add column research_risks text,
  add column next_step text,
  add column source_urls text[] not null default '{}';

create index hack_nation_startup_candidates_priority_idx
  on public.hack_nation_startup_candidates (priority_tier, outreach_score desc nulls last);

create view public.hack_nation_search_candidates
with (security_invoker = true) as
select
  candidate.id as candidate_id,
  candidate.source_record_id,
  candidate.priority_tier,
  candidate.outreach_score,
  candidate.confidence,
  candidate.evidence_status,
  candidate.sector,
  candidate.investment_thesis,
  candidate.research_risks,
  candidate.next_step,
  candidate.source_urls,
  candidate.research_status,
  candidate.company_name,
  candidate.company_url,
  participant.full_name,
  participant.public_profile_url,
  participant.github_url,
  participant.linkedin_url,
  participant.country,
  participant.city,
  participant.professional_situation,
  participant.tagline
from public.hack_nation_startup_candidates candidate
join public.hack_nation_participants participant on participant.id = candidate.participant_id;

comment on view public.hack_nation_search_candidates is
  'Read model for the Hack-Nation search filter. It does not include canonical companies unless a reviewed import explicitly creates one.';
