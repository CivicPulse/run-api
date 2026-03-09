# Feature Research

**Domain:** Nonpartisan campaign management API -- field operations focus
**Researched:** 2026-03-09
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features campaign staff and volunteers assume exist. Missing these means the product cannot replace NGPVAN/MiniVAN or NationBuilder for field operations.

#### Voter File / CRM

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-source voter file import (CSV, L2, state SOS) | Every campaign starts by loading voter data; NGPVAN, NationBuilder, Ecanvasser all support this | HIGH | Need configurable field mapping per source format. L2 alone has 50+ fields. State formats vary wildly across 50 states. Start with L2 + generic CSV, add state-specific mappers iteratively |
| Automatic field mapping suggestions | Solidarity Tech and others auto-suggest CSV-to-field matches; manual mapping for 50+ columns is unusable | MEDIUM | Match on column name similarity, remember mappings per source type |
| Voter deduplication on import | Importing overlapping files (L2 + state SOS) creates duplicates that corrupt walk lists and contact counts | HIGH | Match on name + address + DOB composite key; voter file ID (state registration number) as primary match when available |
| Canonical voter model | Campaigns use different data vendors with different schemas; need one unified record per voter | MEDIUM | Core fields: name, address, phone, email, party, voting history, demographics, lat/long, household ID. Extension fields for vendor-specific data |
| Voter search and filtering | Building target universes (e.g., "Democrats who voted in 2022 but not 2024 in precinct 5") is the core CRM operation | MEDIUM | PostGIS spatial queries + voting history filters + demographic filters. Must be fast on 100K+ records |
| Interaction history per voter | Every door knock, phone call, and survey response must attach to the voter record | MEDIUM | Append-only event log per voter. Critical for "don't re-contact" logic and supporter ID tracking |
| Voter tagging and list management | Campaigns segment voters into lists (supporters, undecided, volunteer prospects) for targeted outreach | LOW | Tags + saved filter queries. Lists can be static (snapshot) or dynamic (saved query) |
| Contact information management | Phone, email, address with primary/secondary designation | LOW | Multiple phones/emails per voter, mark preferred contact method |

#### Canvassing / Door Knocking

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Turf cutting (geographic territory definition) | Every canvassing platform offers this (MiniVAN, Ecanvasser, NationBuilder). Campaigns divide territory into walkable zones | HIGH | Draw polygons on map, assign to turfs. PostGIS polygon intersection with voter addresses. Must handle overlapping boundaries gracefully |
| Walk list generation from turfs | Given a turf + target criteria, produce an ordered list of doors to knock | MEDIUM | Filter voters in turf polygon by target universe, cluster by household, order by geographic proximity (nearest-neighbor routing) |
| Household clustering | Multiple voters at same address should be one stop, not separate entries | MEDIUM | Group by address/household ID from voter file. Present household as single door with multiple voter records |
| Door-knock outcome recording | Log what happened at each door: not home, refused, supporter, undecided, opposed, moved, deceased | LOW | Enum of standard outcomes (NGPVAN uses ~10 standard result codes). Must be recordable in <5 seconds per door |
| Branched survey scripts | Conversations adapt based on voter responses. "If supporter, ask about yard sign. If undecided, ask about issues." | HIGH | Tree-structured script with conditional branching. Campaign admin creates scripts; volunteers follow them on mobile. NGPVAN's branched scripts are the gold standard |
| Survey response capture | Record answers to each survey question per voter | MEDIUM | Store question ID + answer value per interaction. Support multiple choice, scale (1-5), and free text response types |
| Canvasser assignment to turfs | Assign volunteers to specific turfs so work doesn't overlap | LOW | Simple assignment table. One turf = one canvasser at a time. Show unassigned turfs |
| Attempt tracking (contact attempts per voter) | Campaigns need to know how many times they've tried to reach a voter and when | LOW | Counter + timestamp per voter. Standard practice: 3 attempts before marking unreachable |

#### Phone Banking

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Call list generation from voter universe | Same targeting logic as walk lists but for phone outreach | MEDIUM | Filter by target criteria + has valid phone number + not on do-not-call list + hasn't been contacted recently |
| Call scripts (linear and branched) | Phone bankers need guided scripts just like canvassers | MEDIUM | Reuse same script engine as canvassing. Linear scripts are simpler; branched scripts for experienced callers |
| Call outcome recording | Answered, no answer, busy, wrong number, voicemail, refused, deceased | LOW | Standard outcome codes. Must sync to voter interaction history |
| Call disposition and survey capture | Record voter responses during phone conversations | LOW | Same survey response model as canvassing -- reuse the data model |

#### Volunteer Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Volunteer registration and profiles | Campaigns need to track who their volunteers are, contact info, skills, availability | LOW | Name, contact, skills/interests, availability preferences |
| Volunteer assignment to activities | Assign volunteers to canvassing turfs, phone bank shifts, or other tasks | LOW | Assignment records linking volunteer to activity + time slot |
| Shift scheduling | Create canvassing or phone bank shifts that volunteers can sign up for | MEDIUM | Define shifts with date/time/location/capacity. Self-signup with capacity limits. Waitlists |
| Volunteer hours tracking | Track time contributed for recognition and reporting | LOW | Check-in/check-out timestamps per shift. Auto-calculate from canvassing session start/end |
| Basic volunteer communication | Notify volunteers about their assignments and schedule changes | LOW | API endpoints that clients can use to trigger notifications. Not building email/SMS delivery -- that's out of scope for v1 |

#### Multi-Tenant Campaign Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Campaign CRUD with owner assignment | Create, configure, and manage campaign instances | LOW | Campaign name, type (federal/state/local), jurisdiction, election date, owner user |
| Strict data isolation between campaigns | A city council campaign must never see a senate campaign's voter data | HIGH | Row-level security via campaign_id on every table. PostgreSQL RLS policies. Every query must include campaign context. Defense-in-depth: application-level + database-level enforcement |
| Role-based access within campaigns | Campaign manager, field director, volunteer coordinator, data entry, read-only | MEDIUM | ZITADEL provides auth; application maps ZITADEL roles to campaign-scoped permissions. Roles: owner, admin, manager, volunteer, viewer |
| User invitation and onboarding | Campaign admins invite staff and volunteers to the platform | LOW | Generate invite links scoped to a campaign + role. ZITADEL handles user creation |
| Campaign settings and configuration | Election date, candidate info, jurisdiction boundaries, default survey scripts | LOW | Key-value config per campaign with typed fields |

#### Dashboards and Monitoring

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time canvassing progress dashboard | Field directors need to see how many doors knocked, conversations had, supporters identified -- today, right now | MEDIUM | Aggregate canvassing outcomes by turf, by canvasser, by time window. MiniVAN Manager shows per-canvasser stats in real time |
| Phone bank progress tracking | Same as canvassing dashboard but for phone banking sessions | LOW | Calls made, contacts reached, outcomes by type |
| Volunteer activity summary | Who's active, who's scheduled, total hours this week | LOW | Aggregate volunteer hours and assignments |

### Differentiators (Competitive Advantage)

Features that set CivicPulse apart from NGPVAN, NationBuilder, and GoodParty.org. These align with the core value: any candidate, regardless of party or budget, gets professional-grade field operations.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Truly nonpartisan access | NGPVAN is Dem-only, GoodParty is independent-only. CivicPulse serves every candidate. This is the #1 differentiator from every competitor | LOW (technical) | No party-based access restrictions. The technical implementation is trivial; the market positioning is the differentiator |
| API-first design with full REST API | NationBuilder locks API to Enterprise tier. GoodParty has no public API. NGPVAN's API exists but is gatekept by state parties. Every feature accessible via documented REST endpoints | MEDIUM | OpenAPI spec for every endpoint. Enables any client (web, mobile, CLI, third-party integrations) |
| Open-source and self-hostable | Only GoodParty publishes source code. No competitor offers self-hosting. Campaigns own their data completely | LOW (incremental) | GPL or similar license. Docker/K8s deployment. This is architectural, not a feature to build |
| GPS-optimized canvassing routes | MiniVAN has basic "next nearest door" routing. Full route optimization (traveling salesman approximation) across a walk list saves volunteers 20-30% walking time | HIGH | PostGIS nearest-neighbor with road-network awareness. Can start with straight-line optimization and improve. Third-party routing APIs (OSRM, GraphHopper) for road-aware routing |
| Flexible voter data source mapping system | Competitors are either locked to one voter file vendor (NGPVAN = DNC file) or offer basic CSV import. A pluggable mapping system that handles any vendor format is a significant advantage for nonpartisan access | HIGH | Config-driven field mapping with source-specific plugins. L2, state SOS, generic CSV. Mapping configs are shareable/reusable across campaigns using same vendor |
| Offline-ready API design | Ecanvasser works offline; MiniVAN works offline. But since CivicPulse is API-only, the API must support sync patterns that enable offline mobile clients | MEDIUM | Provide sync endpoints: GET changes since timestamp, POST batch updates with conflict resolution. API design pattern, not a mobile app feature. Timestamp-based sync with last-write-wins or manual conflict resolution |
| Multi-campaign analytics (org-level) | Party orgs and consulting firms managing 10+ campaigns need cross-campaign views. No competitor does this well for nonpartisan orgs | MEDIUM | Organization-level aggregation across campaigns. Opt-in data sharing between campaigns under same org. Useful for party committees and political consultancies |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but should be deliberately excluded from v1 (and possibly forever).

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Built-in predictive dialer | Phone banking platforms like CallHub offer predictive dialing; campaigns want high call volume | Predictive dialers require Twilio/telephony integration, TCPA compliance, FCC regulations, and significant infrastructure. Massive scope increase for a backend API | Provide call list generation and outcome tracking API. Let campaigns use dedicated dialer services (CallHub, ThruTalk, LiveVox) and sync results back via API |
| Email/SMS delivery engine | Campaigns want to blast emails and texts to voter lists | Building deliverability infrastructure (SPF, DKIM, bounce handling, carrier compliance for SMS) is a product unto itself. Spoke exists for texting | Provide contact list export endpoints. Integrate with SendGrid/Mailgun/Twilio via webhooks for campaigns that need it. Defer to v2 |
| Donation processing / fundraising | Every campaign needs money. ActBlue/WinRed prove demand | FEC compliance for contributions is extremely complex (employer/occupation tracking, aggregate limits, PAC rules). ActBlue charges 3.95% and employs hundreds. This alone is a multi-year project | Explicitly out of scope for v1 per PROJECT.md. Provide donor CRM fields so campaigns can track donations made through external platforms |
| FEC/state campaign finance compliance | Filing reports is painful and campaigns want automation | 80+ report types at federal level, 50 different state systems. NGPVAN employs a dedicated compliance team. Insane complexity | Out of scope for v1 per PROJECT.md. Consider compliance API partnerships later |
| Website builder / CMS | NationBuilder's website builder is a key feature. Campaigns want a web presence | This is a frontend product, not a backend API. CivicPulse is API-only. Adding CMS doubles the product scope | Campaigns use Squarespace, WordPress, or dedicated campaign site tools. API data can feed campaign websites via integration |
| Real-time everything via WebSockets | Live updating dashboards, real-time canvasser tracking | WebSocket infrastructure adds significant complexity to a REST API. Most campaign dashboards tolerate 30-60 second staleness | Polling-based updates for dashboards. HTTP long-polling if sub-minute updates needed. WebSockets only if specific client demand emerges |
| AI-generated campaign content | GoodParty uses AI for scripts, press releases, emails. Trendy feature | AI content generation is a frontend/UX concern, not a backend API feature. Quality varies. Campaigns need human voice | Provide well-structured script templates via API. AI generation is a client-side concern -- mobile/web apps can use LLM APIs directly |
| Voter score prediction / modeling | Predictive models for voter persuadability, turnout likelihood | Requires data science expertise, training data, model maintenance. L2 already provides likelihood scores | Import and expose vendor-provided scores (L2 turnout score, persuasion score). Don't build custom models in v1 |

## Feature Dependencies

```
[Multi-tenant campaign management]
    |
    |-- required by --> [All other features]
    |                    (every feature is campaign-scoped)
    |
[Voter file import + canonical model]
    |
    |-- required by --> [Voter search and filtering]
    |                       |
    |                       |-- required by --> [Walk list generation]
    |                       |-- required by --> [Call list generation]
    |                       |-- required by --> [Voter tagging and lists]
    |
    |-- required by --> [Interaction history]
    |                       |
    |                       |-- required by --> [Door-knock outcome recording]
    |                       |-- required by --> [Call outcome recording]
    |                       |-- required by --> [Survey response capture]
    |
[Turf cutting (PostGIS)]
    |
    |-- required by --> [Walk list generation]
    |-- required by --> [Canvasser assignment to turfs]
    |-- enhanced by --> [GPS route optimization]
    |
[Survey script engine (branched)]
    |
    |-- required by --> [Canvassing survey scripts]
    |-- required by --> [Phone banking call scripts]
    |                    (shared engine, different context)
    |
[Volunteer management]
    |
    |-- enhanced by --> [Shift scheduling]
    |-- enhanced by --> [Canvasser assignment to turfs]
    |-- enhanced by --> [Phone bank assignment]
    |
[Role-based access control]
    |
    |-- requires --> [ZITADEL auth integration]
    |-- required by --> [Campaign settings]
    |-- required by --> [User invitation]
```

### Dependency Notes

- **Multi-tenant campaign management is the foundation:** Every other feature requires campaign-scoped data isolation. This must be built first and tested thoroughly before anything else.
- **Voter file import unlocks everything:** Canvassing, phone banking, and CRM features are all useless without voter data. Import must support at minimum L2 format and generic CSV before canvassing features make sense.
- **Survey script engine is shared:** The branched script logic for canvassing and phone banking is the same engine with different delivery contexts. Build once, use in both workflows.
- **Turf cutting requires PostGIS:** Geographic features (turf cutting, walk list generation, route optimization) all depend on PostGIS being properly configured with voter geocoded addresses.
- **Volunteer management is semi-independent:** Can be built in parallel with canvassing/phone banking, then linked via assignment features.
- **ZITADEL auth is a prerequisite for RBAC:** Auth integration must be working before role-based permissions can be implemented within campaigns.

## MVP Definition

### Launch With (v1)

Minimum viable product -- enough to run a small local campaign's field operations.

- [ ] Multi-tenant campaign CRUD with data isolation (RLS) -- foundation for everything
- [ ] ZITADEL auth integration with campaign-scoped RBAC -- security from day one
- [ ] Voter file import from CSV with configurable field mapping -- campaigns need data
- [ ] L2-specific import adapter with pre-configured mapping -- the most common vendor
- [ ] Canonical voter model with search and filtering -- build target universes
- [ ] Voter tagging and static/dynamic list management -- segment voters
- [ ] Turf cutting via PostGIS polygon definition -- geographic territory management
- [ ] Walk list generation from turf + target criteria -- generate door-knock lists
- [ ] Household clustering on walk lists -- group voters at same address
- [ ] Door-knock outcome recording with standard result codes -- track canvassing results
- [ ] Linear survey scripts with response capture -- guided conversations at the door
- [ ] Interaction history per voter -- append-only log of all contacts
- [ ] Volunteer registration and profile management -- track who's helping
- [ ] Basic canvassing progress dashboard endpoints -- doors knocked, contacts made

### Add After Validation (v1.x)

Features to add once core canvassing workflow is proven.

- [ ] Branched survey scripts -- when linear scripts prove insufficient for complex campaigns
- [ ] Phone banking call list generation and call outcome tracking -- second major field ops channel
- [ ] GPS-optimized canvassing route suggestions -- when campaigns request routing help
- [ ] Shift scheduling with self-signup -- when volunteer coordination becomes a bottleneck
- [ ] Volunteer assignment to turfs and phone banks -- link volunteers to activities
- [ ] Real-time canvassing monitoring endpoints -- when field directors need live visibility
- [ ] Voter deduplication across multiple import sources -- when campaigns use >1 data vendor
- [ ] Offline sync API pattern (changes-since + batch upload) -- when mobile client development begins
- [ ] State-specific voter file import adapters (top 10 states) -- expand beyond L2

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Multi-campaign organization-level analytics -- defer until multiple campaigns are on platform
- [ ] Campaign finance / donation tracking CRM fields -- defer per PROJECT.md
- [ ] Event management -- defer per PROJECT.md
- [ ] Email/SMS integration endpoints (webhook-based) -- defer per PROJECT.md
- [ ] OSDI-compliant API endpoints for interoperability -- defer until ecosystem demand
- [ ] Plugin/extension system for community modules -- defer until core is stable

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Multi-tenant campaign management | HIGH | MEDIUM | P1 |
| ZITADEL auth + RBAC | HIGH | MEDIUM | P1 |
| Voter file import (CSV + L2) | HIGH | HIGH | P1 |
| Canonical voter model + search | HIGH | MEDIUM | P1 |
| Voter tagging and list management | HIGH | LOW | P1 |
| Turf cutting (PostGIS) | HIGH | HIGH | P1 |
| Walk list generation | HIGH | MEDIUM | P1 |
| Household clustering | MEDIUM | MEDIUM | P1 |
| Door-knock outcome recording | HIGH | LOW | P1 |
| Linear survey scripts + response capture | HIGH | MEDIUM | P1 |
| Interaction history | HIGH | LOW | P1 |
| Volunteer registration | MEDIUM | LOW | P1 |
| Canvassing dashboard endpoints | MEDIUM | LOW | P1 |
| Branched survey scripts | HIGH | HIGH | P2 |
| Phone banking (lists + outcomes + scripts) | HIGH | MEDIUM | P2 |
| GPS route optimization | MEDIUM | HIGH | P2 |
| Shift scheduling | MEDIUM | MEDIUM | P2 |
| Volunteer assignment | MEDIUM | LOW | P2 |
| Real-time canvassing monitoring | MEDIUM | MEDIUM | P2 |
| Voter deduplication | MEDIUM | HIGH | P2 |
| Offline sync API | HIGH | HIGH | P2 |
| State-specific import adapters | MEDIUM | HIGH | P2 |
| Org-level multi-campaign analytics | LOW | MEDIUM | P3 |
| Donation CRM fields | LOW | LOW | P3 |
| Event management | LOW | MEDIUM | P3 |
| OSDI compliance | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- a local campaign cannot run field ops without these
- P2: Should have, add after core validation -- unlocks scale and second channel (phone)
- P3: Nice to have, future consideration -- ecosystem and v2 features

## Competitor Feature Analysis

| Feature | NGPVAN/MiniVAN | NationBuilder | Ecanvasser | GoodParty | CivicPulse Approach |
|---------|---------------|---------------|------------|-----------|---------------------|
| Voter file access | DNC national file (Dem only) | Free 190M US voter file | Import your own | L2 via Pro tier | Multi-source import with field mapping; BYO voter data from any vendor |
| Turf cutting | VoteBuilder map-based | Map-based polygon tool | Map + shapefile import | Via Ecanvasser partnership | PostGIS polygon API with spatial queries |
| Walk lists | Auto-generated, optimized | Printable walk sheets | Digital + printable | Via Ecanvasser | API-generated, household-clustered, optionally route-optimized |
| Mobile canvassing | MiniVAN native app (92% market) | No native app | Native app + offline | Via Ecanvasser | API-only; enables any mobile client. Offline sync endpoints |
| Survey scripts | Branched scripts in VAN | Basic scripts | Custom surveys | AI-generated scripts | Branched script engine shared across canvassing + phone banking |
| Phone banking | OpenVPB, VPB Connect, predictive | Call View (basic) | Not core | Basic | Call list generation + outcome tracking API. No dialer -- integrate with dedicated services |
| Volunteer mgmt | Integrated with Mobilize | Basic CRM-based | Team management | Community features | Registration, assignment, scheduling, hours tracking |
| Data isolation | Party-controlled access | Per-account | Per-account | Per-account | Row-level security with campaign_id. PostgreSQL RLS policies |
| API access | REST API (party-gatekept) | Enterprise tier only ($$$) | Limited API | No public API | Full REST API for every feature. OpenAPI documented. Core differentiator |
| Pricing | $45-$3,500+/mo | $34-$179+/mo | Quote-based | $0-$10/mo | Open source. Self-host free. Hosted SaaS TBD |
| Nonpartisan | No (Dem only) | Yes | Yes | Independents only | Yes -- no party restrictions |

## Sources

- [NGPVAN MiniVAN canvassing guide](https://www.ngpvan.com/blog/canvassing-with-minivan/)
- [NGPVAN canvassing script examples](https://www.ngpvan.com/blog/canvassing-script-example/)
- [NGPVAN MiniVAN Manager](https://www.ngpvan.com/solutions/minivan-manager/)
- [NationBuilder turf cutting HOWTOs](https://support.nationbuilder.com/en/articles/2363270-campaign-cut-turf-and-print-walk-sheets)
- [Ecanvasser product features](https://www.ecanvasser.com/features)
- [Ecanvasser full product ecosystem](https://www.ecanvasser.com/product)
- [GoodParty turf cutting guide](https://goodparty.org/blog/article/turf-cutting)
- [GoodParty political campaign software comparison](https://goodparty.org/blog/article/political-campaign-management-software)
- [Solidarity Tech data organization and field mapping](https://www.solidarity.tech/solutions/data-organization-software)
- [Qomon political campaign CRM](https://qomon.com/case-study/political-crm)
- [CallHub canvassing guide](https://callhub.io/blog/canvassing/canvassing/)
- [CallHub predictive dialer](https://callhub.io/platform/predictive-dialer/)
- [Knockbase canvassing software overview](https://www.knockbase.com/blog/what-is-canvassing-software-why-it-matters-in-2026)
- [Qomon canvassing apps guide 2025](https://qomon.com/blog/understanding-canvassing-apps)
- [Grassroots Unwired canvassing software](https://www.grassrootsunwired.com/canvassing-software/)
- Existing competitive research: `docs/campaign_platforms_research.md`

---
*Feature research for: Nonpartisan campaign management API -- field operations*
*Researched: 2026-03-09*
