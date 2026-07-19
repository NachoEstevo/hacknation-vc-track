# Rely simulated verification handoff

This is a hackathon-safe simulation of the future Stripe and GitHub connection flow. It uses no OAuth credentials, customer records, private source code, API keys, or live provider calls.

## Frontend inputs

- `data/enriched/rely-demo-profile.json` is the canonical Rely profile for the demo.
- `data/enriched/rely-demo-verification.json` is the complete connection timeline and the final provider snapshots.
- `packages/data-core/src/rely-demo-profile.ts` builds the typed profile.
- `packages/data-core/src/demo-verification.ts` builds the typed provider results.

The frontend may import the JSON files directly or serve them from a static API route. No backend or environment variables are required for this demo flow.

## Required labels

Always show one of these near a simulated result:

- `Demo verified`
- `Simulated connection`
- `Demo data — no provider account connected`

Do not show `Verified by Stripe`, `Verified by GitHub`, or a normal production verification badge without the demo qualifier.

## Suggested 8-second interaction

1. Initial card shows `55 unique paying customers · Founder stated` and `Private GitHub org · Founder stated`.
2. Founder presses `Connect GitHub`.
3. Animate the four timeline events from `rely-demo-verification.json` over roughly two seconds.
4. Show the GitHub snapshot with a `Demo verified` badge and its disclaimer in the evidence drawer.
5. Repeat for Stripe and refresh the brief.
6. Final brief says `55 unique paying customers · Demo verification` and `No subscriptions / MRR not applicable`.

## What the fixtures mean

- The 55 unique paying customers, April 2026 launch, founder roles and public profile URLs were supplied by the founder.
- The GitHub values `6 private repositories` and `284 commits in 90 days` are simulated presentation data, not observed facts.
- The GitHub result models administrative repository access. It explicitly does not prove legal ownership of code or IP.
- Stripe models a one-time-payment business. It intentionally returns `subscriptionMrr: null` and never creates an MRR claim.

## Production replacement seam

Keep the frontend bound to the connector result shape rather than provider SDKs. A future backend can replace the fixture functions with live adapters while preserving:

- `provider`, `status`, `badge`, `verifiedAt` and `metrics`;
- explicit provenance and disclaimer;
- no raw customer data or private code in the VC-facing response;
- a distinct production state that can promote a claim only after a real provider response.

The simulated connector sets `mode: "simulation"` and `canPromoteToVerified: false`. The UI must respect both fields.
