# Founder-first demo profiles

The frontend can consume `data/enriched/demo-founder-profiles.json` directly. It contains three intentionally different states:

- **Icon — public golden profile.** The official company site explicitly names Kennan Frost, links his public profiles, publishes his story and prior-company claims, and exposes product, pricing, customer and investor signals. The founder relationship was manually reviewed; commercial and track-record figures remain first-party claims until corroborated.
- **Rely — founder-submitted golden profile.** Ignacio Estevo and Franco Ferreira are founder-confirmed with public profile links. The live site supports the product and customer-reference story. The 55 unique paying-customer figure remains visibly founder-stated until a read-only Stripe aggregate is connected.
- **Career Principles — review queue.** Its official site and Companies House support Kenji Farre's executive/director relationship and government identity-verification status, but they do not establish the founder title. The UI should show the missing confirmation instead of silently upgrading him.

## Demo use

For the one-minute demo, start from a VC query, reveal Icon as a high-signal early company, and open the founder view. Show the founder story, public profiles, prior execution and evidence badges. Then switch briefly to Rely to show the stronger founder-submitted path: two founder-confirmed profiles plus a traction card labeled `Founder stated — connect Stripe to verify`.

The contrast is the product: discovery does not flatten all sources into a fake certainty score. It turns sparse evidence into a useful brief while preserving what is public, founder-asserted, integration-verified or still unknown.

## Frontend contract

The profile object includes:

- `demoRole` to select golden or review-queue presentation;
- `founders[]` with role, relationship state, confidence, social URLs, biography and track-record signals;
- `companySignals[]` for product, traction, customer and funding evidence;
- `evidence[]` as the source drawer behind every displayed signal;
- `openQuestions[]` as the next diligence actions.

`validateDemoFounderProfiles` checks uniqueness, confidence bounds and every evidence reference. It deliberately does not validate truth from prose; truth state remains explicit in each evidence record.
