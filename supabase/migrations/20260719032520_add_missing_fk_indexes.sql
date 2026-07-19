create index company_founders_source_idx
  on public.company_founders (source_id)
  where source_id is not null;

create index evidence_source_idx
  on public.evidence (source_id)
  where source_id is not null;

create index founder_identities_founder_idx
  on public.founder_identities (founder_id);
