# Campaign technology platforms: a comprehensive analysis and open-source roadmap

**The campaign technology market is dominated by partisan gatekeepers and private equity interests, leaving independent candidates and under-resourced campaigns without adequate tools.** Four major platforms — NGPVAN, ActBlue, NationBuilder, and GoodParty.org — each address different slices of the campaign technology stack, but none offers a complete, affordable, nonpartisan, and open solution. NGPVAN controls Democratic field operations as a near-monopoly now degrading under private equity ownership. ActBlue dominates progressive fundraising but offers zero campaign management features. NationBuilder provides a nonpartisan all-in-one platform but at growing cost and with "jack-of-all-trades" limitations. GoodParty.org is the scrappy newcomer democratizing access for independents but remains immature. Meanwhile, the open-source ecosystem contains promising fragments — Spoke for texting, CiviCRM for donor management, and the stalled National Voter File project — but no integrated platform. This creates a significant opportunity for an open-source, self-hosted campaign platform that breaks down partisan barriers, ensures data ownership, and makes professional campaign tools accessible to every candidate regardless of party or budget.

---

## NGPVAN: the crumbling monopoly at the heart of Democratic politics

### What it is and how it got here

NGPVAN emerged from the 2010 merger of two complementary companies: **NGP Software** (founded 1997 by Nathaniel Pearlman for fundraising and FEC compliance) and the **Voter Activation Network** (founded 2001 by Mark Sullivan for voter file management and canvassing). The combined entity became the backbone of Democratic campaign infrastructure, maintaining the DNC's national voter file since 2004 and serving every major Democratic presidential campaign from Obama 2008 through Harris 2024.

The ownership chain tells a story of progressive tech falling into financial hands. VC firm Insight Partners acquired a controlling stake in 2018. In August 2021, London-based private equity firm **Apax Partners** purchased the company for approximately **$2 billion**, merging it with Social Solutions, CyberGrants, and Network for Good under the new parent brand **Bonterra**. Notably, Apax partner Jason Wright gave near-maximum contributions to Republican candidates Perdue and Loeffler, raising uncomfortable questions about who ultimately controls the Democratic Party's most critical technology infrastructure.

### Core capabilities

NGPVAN's feature set is genuinely comprehensive and explains its dominance. **VoteBuilder** provides access to the DNC's national voter database with registered voter data including contact info, demographics, voting history, and party affiliation. The **MiniVAN** mobile app — used for **92% of Democratic doors knocked in 2023** — enables GPS-guided canvassing with branched scripts and real-time data sync. Phone banking tools include OpenVPB (shareable via hyperlink), VPB Connect (click-to-dial), and predictive dialers. The NGP 8 compliance database handles **80+ FEC and state filing reports** with built-in audit trails and error flags. Additional tools include **Mobilize** for event organizing (4+ million users in 2020), **ActionKit** for email marketing (acquired from Blue State Digital), and donation processing at 3.25% fees.

The platform tracks an impressive scale: **$10 billion+ raised** and **1.4 billion voter contact attempts** logged in the 2022 cycle alone. Its API sustained approximately 7,000 calls per second during the 2024 presidential election.

### The access problem

VoteBuilder access is controlled by state Democratic parties, not by NGP VAN directly. Campaigns must request access through their state party, sign a user agreement, and pay a leasing fee that varies by district size. This creates three serious problems. First, **independents and third-party candidates are categorically excluded** — NGP VAN states it will "never provide our platform to Republicans, any organizations that work against the values that progressives share." Second, even within the Democratic Party, state parties can deny access to primary challengers — documented cases include Rachel Ventura in IL-11 being blocked for "challenging an incumbent." Third, pricing is opaque and quote-based, with estimates ranging from $45/month to $3,500/month depending on district size and user count.

### The decline under private equity

The most alarming story about NGPVAN is its deterioration under Bonterra/Apax ownership. In January 2023, Bonterra laid off approximately **140 employees (10% of staff)**, including about 40 NGP VAN workers and half the ActionKit engineering team. Mid-2023 brought another **200 layoffs (20% of remaining staff)**. An internal DNC memo described NGP VAN as **"inflexible, slow and unreliable, particularly during periods of peak use."**

The consequences became acute during the 2024 election. NGP VAN **warned the Harris campaign** that its canvassing software was "not prepared to meet the campaign's needs." The Harris campaign and DNC had to send full-time engineering staff to NGP VAN for months to keep the system operational. In October 2024, NGP VAN asked the Empower Project to **cut back on information flowing through the system** — an extraordinary request during a presidential election's final weeks.

User reviews consistently cite an **outdated interface**, steep learning curve, unhelpful customer support (one reviewer: "We simply stopped using the non-helpful Help Desk"), and session timeouts. Glassdoor rates the company **3.6/5 stars** with employees noting "a lot of internal knowledge is gone" due to layoffs and turnover. The Movement Cooperative began soliciting proposals for a replacement voter database system in February 2025, and Progressive Turnout Project invested in TouchStone as a MiniVAN alternative.

---

## ActBlue: the $16 billion fundraising engine with no campaign tools

### Structure and scale

ActBlue, founded in June 2004 by Benjamin Rahn and Matt DeBergalis, operates as a **political action committee functioning as a conduit** — donations pass through to campaigns rather than being considered PAC contributions. It has processed over **$16 billion** for Democratic candidates and progressive causes since founding, including **$3.8 billion in the 2024 cycle alone**. Over **28 million Americans** have donated through the platform, with **14 million Express users** who can contribute with a single click.

The platform's network effects are staggering. When Kamala Harris launched her presidential campaign, ActBlue processed **$81 million in 24 hours** from **1.1 million donors**. It has been the highest-fundraising PAC in every election cycle since 2014. The average donation is approximately $40.

### What it does (and doesn't do)

ActBlue is laser-focused on donation processing: one-time and recurring contributions, customizable fundraising forms, A/B testing, Express Lane one-click donations, tandem fundraising, merchandise sales, and event ticketing. It charges a flat **3.95% processing fee** with no setup costs, monthly fees, or subscriptions. A newer "Raise by ActBlue" tier for state/local campaigns charges 3.5%.

Critically, **ActBlue is not a CRM and offers zero campaign management features**. No voter file, no canvassing tools, no phone banking, no volunteer management, no compliance filing, no email platform, no website builder. It integrates with these tools (NGPVAN, ActionKit, Salesforce, Action Network) via webhooks and CSV exports, but campaigns must assemble and pay for an entirely separate technology stack for everything beyond fundraising.

### Significant controversies

ActBlue faces complaints on multiple fronts. Donor-side frustrations center on **recurring donation confusion** — PissedConsumer rates it **1.8/5 stars** from 241 reviews, with the top complaint being "changed 1-time donation into recurring donation." The most universal complaint is **spam after donating**: ActBlue itself doesn't sell data, but campaigns that receive donations own that data and frequently sell or share it. In December 2024, 142 Democratic consultants signed a letter saying ActBlue needed to do a "better job" protecting donors from being "exploited."

On the political front, Republican officials in multiple states launched fraud investigations in 2024-2025, and Trump issued a presidential memorandum directing DOJ/Treasury to investigate. A House Oversight Committee report alleged ActBlue processed $1B+ in potentially compromised card donations. ActBlue calls these "unsubstantiated partisan attacks."

Internally, ActBlue is in crisis. Seven senior officials resigned in February/March 2025. Employee unions wrote to the board about an "alarming pattern" of departures and "volatility and toxicity stemming from current leadership." Glassdoor rates the organization **2.5/5 stars**. CEO Regina Wallace-Jones took over in January 2023, and approximately 17% of staff were laid off for "restructuring" that year.

Like NGPVAN, ActBlue is **exclusively available to Democratic and progressive campaigns**. The Republican equivalent, WinRed (founded 2019), processed $1.8 billion in 2024 — less than half of ActBlue's volume.

---

## NationBuilder: the nonpartisan all-in-one that struggles to excel

### The only major nonpartisan option

Founded in 2009 by Jim Gilliam (who passed away in 2018), NationBuilder is the only major campaign platform that serves **all political parties and ideologies worldwide**. It has operated in **112 countries**, served over **100,000 customers**, and helped campaigns raise over **$1.2 billion** cumulatively. In 2016, four of five U.S. presidential candidates used it (Trump, Stein, Johnson, McMullin). Both sides of Brexit used it. Emmanuel Macron's La République En Marche used it. Revenue reached **$17.8 million in 2024**, a 76% year-over-year increase.

CEO Lea Endres has led since 2017, with Hilary Doe serving as President since 2021. The company has approximately 102 employees, with offices in Los Angeles and internationally. It raised over $14 million in early funding from Andreessen Horowitz and Omidyar Network.

### A true all-in-one platform

NationBuilder's distinguishing feature is breadth. Its CRM tracks supporter profiles with automatic social media syncing, geographic mapping, and unlimited control panel users. The **Liquid-templated website builder** (same language as Shopify) offers 30+ pre-built page templates for signups, petitions, donations, events, and blogs. Fundraising pages include personal fundraising and peer-to-peer with leaderboards. Email blasting supports A/B testing and drip automations (Pro plan). The **Social Capital** gamification system — a virtual currency where supporters earn points for actions — drives engagement, with users reporting **25x more signups** when using social engagement tools.

For field operations, NationBuilder provides **turf cutting** (define geographic boundaries on a map, save people within turf to lists), multiple walk sheet templates (including scannable sheets), and built-in **Call View** phone banking. The platform includes a **free U.S. voter file** covering 190+ million voters with party affiliation, voting history, and district data. An L2 integration provides enhanced voter data with geo-spatial visualization.

Newer features include **ActionButton** with AI-powered opinion summaries (January 2025) and upgraded Zapier integration (December 2024).

### Pricing and accessibility challenges

NationBuilder pricing starts at **$34/month** (Starter, annual billing) scaling up to **$179/month** (Pro) and custom Enterprise pricing. Database size drives cost — Starter covers up to 5K contacts, Pro up to 15K. The API is restricted to Enterprise plans, and third-party payment processor integration requires at minimum the Pro plan. Users increasingly complain about "features that were free being locked behind paywalls" and forced use of NationBuilder's own payment processor on the Starter plan. There is no free tier.

### The "jack of all trades" problem

NationBuilder's greatest strength — doing everything — is also its primary weakness. Reviewers consistently note that each individual feature is **less powerful than specialized alternatives**: its email tools are "elementary" compared to Mailchimp, its CRM less robust than Salesforce, its website builder less flexible than WordPress, its canvassing tools less refined than MiniVAN. There is **no native mobile canvassing app** — campaigns must integrate third-party tools like Ecanvasser. Social media profile matching creates "a massive mess in the database with thousands of duplicate contacts." One 2025 reviewer summarized the trend bluntly: "It used to be good, but the enshittification is strong with this company."

Capterra rates it **3.8/5** from 43 reviews. BBB complaints cite difficulty canceling accounts and unauthorized billing. Training staff is described as "hard — there's a big learning curve."

---

## GoodParty.org: the insurgent democratizing campaign tech for independents

### Origin and mission

GoodParty.org was founded in 2019 by **Farhad Mohit**, a serial entrepreneur with over $1 billion in exits (BizRate, Shopzilla sold for $565M, Flipagram acquired by ByteDance to become TikTok). Structured as a **Public Benefit Corporation**, it receives seed funding from Mohit personally and states it is "neither affiliated with nor funded by any outside political party, special interest group, Super PAC, non-profit, NGO, or advocacy group." Mohit describes himself as "founder and full-time volunteer."

The platform evolved significantly from its original "crowd-voting" concept (~2019-2022) to a comprehensive **AI-powered campaign management platform** by 2023. Growth has been explosive: from **11 wins in 2023** to **3,444 wins across 48 states in 2024**, with a 54.5% general election win rate. Over 6,317 candidates used the platform in 2024.

### Filling the independent candidate gap

GoodParty.org is the **only major platform specifically serving independent, nonpartisan, and third-party candidates** — the segment locked out of both NGPVAN (Democratic-only) and WinRed/i360 (Republican-only). To use the platform, candidates must pledge to be independent (not running as Democrat or Republican), people-powered (majority individual funding), anti-corruption, and civil in their campaign.

Partnerships span the political spectrum: Forward Party, Alliance Party, Libertarian Party, Green Party, Reform Party, and Working Families Party are all "included in our movement."

### Features and pricing

The **free tier** includes AI-generated campaign content (press releases, canvassing scripts, email blasts, speeches, social posts), an AI campaign assistant, an 8-week campaign plan, a Path to Victory report with win number calculations, one-on-one consultations with campaign experts, and access to the GoodParty Academy and Community.

The **Pro tier at $10/month** adds unlimited voter file access with custom list creation, managed peer-to-peer texting campaigns (3.7 million texts sent in October 2024 alone), robocalls, dedicated expert support, door-knocking tools via eCanvasser partnership, and 30 free yard signs.

This pricing is disruptive: GoodParty.org provides voter data and campaign tools for **$0-$10/month** versus NGPVAN's $45-$3,500+/month or NationBuilder's $34-$179/month.

### Limitations and caveats

The platform is still maturing. SMS campaigns are **not self-service** — candidates must coordinate with staff and plan 3+ days ahead. The website builder is described as "somewhat difficult to navigate." There is **no public API**, limiting integration with other tools. Canvassing features rely on a third-party partnership (eCanvasser) rather than native functionality. Fundraising, FEC compliance, and advanced analytics are weak or absent compared to established platforms.

The **3,444 wins claim** deserves scrutiny: many were in uncontested local races (70% of local elections are uncontested by their own statistics), and 1,404 winners were incumbents. Many reviews carry an "incentivized review" disclaimer. Independent news coverage from major tech outlets is minimal.

Notably, GoodParty.org **publishes its code on GitHub** under GPL-3.0, with 16 public repositories including a JavaScript web app, TypeScript NestJS API backend, and Python data platform — making it the most transparent of the four platforms studied.

---

## Head-to-head comparison across critical dimensions

| Dimension | NGPVAN | ActBlue | NationBuilder | GoodParty.org |
|---|---|---|---|---|
| **Founded** | 1997/2001 (merged 2010) | 2004 | 2009 | 2019 |
| **Owner** | Apax Partners (PE) via Bonterra | Nonprofit (independent) | Private (VC-backed) | PBC (founder-funded) |
| **Pricing** | $45-$3,500+/mo (quote-based) | 3.95% per transaction | $34-$179+/mo | Free / $10/mo |
| **Political alignment** | Democratic only | Democratic/progressive only | Nonpartisan (all parties) | Independent/third-party only |
| **Voter file/CRM** | ★★★★★ (DNC voter file) | ✗ None | ★★★☆☆ (free US file) | ★★★☆☆ (Pro tier) |
| **Canvassing** | ★★★★★ (MiniVAN) | ✗ None | ★★★☆☆ (walk sheets, no native app) | ★★☆☆☆ (via eCanvasser) |
| **Phone banking** | ★★★★☆ | ✗ None | ★★★☆☆ (Call View) | ★★☆☆☆ |
| **Fundraising** | ★★★★☆ (NGP 8) | ★★★★★ (core function) | ★★★☆☆ | ★☆☆☆☆ |
| **FEC compliance** | ★★★★★ (80+ reports) | ★★★☆☆ (reporting only) | ★★☆☆☆ | ✗ None |
| **Email/SMS** | ★★★★☆ (via ActionKit) | ✗ None (fundraising only) | ★★★☆☆ | ★★★☆☆ (managed texting) |
| **Website builder** | ★★★☆☆ | ✗ None | ★★★★☆ (Liquid templates) | ★★☆☆☆ |
| **AI features** | ✗ None publicly announced | ✗ None | ★★☆☆☆ (ActionButton) | ★★★★☆ (core differentiator) |
| **API/integrations** | ★★★★☆ (REST API, growing) | ★★★☆☆ (webhooks, CSV) | ★★★★☆ (REST API, Zapier) | ✗ No public API |
| **Data portability** | ★★☆☆☆ (party controls exports) | ★★★☆☆ (CSV/webhook exports) | ★★★★☆ ("you own your data") | ★★☆☆☆ (limited info) |
| **Open source** | ✗ Proprietary | ✗ Proprietary | ✗ Proprietary (API clients on GH) | ★★★★☆ (GPL-3.0 on GitHub) |
| **Ease of use** | ★★☆☆☆ (steep learning curve) | ★★★★★ (minutes to setup) | ★★★☆☆ (moderate learning curve) | ★★★★☆ (15-min setup) |

### Key gap analysis

No single platform offers the combination of features that under-resourced, nonpartisan campaigns need. NGPVAN has the deepest features but excludes everyone outside the Democratic Party and is degrading under PE ownership. ActBlue excels at fundraising but offers nothing else. NationBuilder is the closest to complete but increasingly expensive and mediocre at each individual capability. GoodParty.org is the most accessible and aligned with grassroots needs but lacks depth, self-service tools, APIs, and compliance features.

**The critical gaps across all four that an open-source alternative could fill include**: truly nonpartisan access without ideological restrictions, self-hosted data ownership and portability, integrated FEC/state compliance reporting, affordable professional-grade canvassing with offline mobile capability, self-service peer-to-peer texting and phone banking, modular architecture allowing campaigns to use only what they need, transparent pricing, and API-first design enabling ecosystem growth.

---

## The open-source campaign tech landscape: fragments without a framework

### What exists today

The most mature open-source campaign tool is **Spoke**, a peer-to-peer texting platform created by developers from the Bernie Sanders 2016 campaign, later maintained by MoveOn, and now stewarded by State Voices National. Built on React, GraphQL, Node.js, and PostgreSQL with Twilio for SMS delivery, Spoke has been forked and deployed at massive scale — Elizabeth Warren's 2020 campaign sent millions of texts daily using a Spoke fork. Hosting costs approximately $75/month on Heroku plus ~$0.0075 per text via Twilio.

**CiviCRM** is the most mature open-source CRM for nonprofits and civic organizations, with extensions for campaign functionality: CiviCampaign for voter canvassing and surveys, CiviEngage for walk lists and phone bank lists, and an OSDI API implementation enabling data sync with NGP VAN and other tools. It integrates with WordPress, Drupal, and Joomla, but requires significant technical expertise to deploy.

The **National Voter File project** represents the most ambitious attempt at open-source voter data infrastructure — "the first free and open source non-partisan national voter file" built on PostgreSQL, PostGIS, and Python. It stalled after processing approximately 9 states, demonstrating both the potential and difficulty of standardizing voter data across 50 different state formats.

**Houdini Project** offers open-source fundraising infrastructure (Ruby/PostgreSQL/React) with donation processing, recurring donations, CRM, and event management — the closest thing to an open-source ActBlue, though lacking political campaign compliance features.

Other fragments include **TurboVPB** (browser extension accelerating phone banking), **Tijuana/The Purpose Platform** (global campaigning tools used by GetUp and UN Human Rights), **DemocracyOS** and **Decidim** (democratic deliberation platforms), and **Democracy Earth** (blockchain-based governance).

### The OSDI standard and interoperability challenge

The **Open Supporter Data Interface (OSDI)** was created to solve the interoperability crisis — a community-governed specification defining common API formats for progressive tech tools. Launched around 2015 with commitments from NGP VAN, Action Network, CiviCRM, Catalist, and others, it uses RESTful practices and JSON+HAL to standardize data for people, donations, events, tags, and lists. However, adoption has been uneven and activity on the GitHub repository has slowed significantly. The standard remains conceptually sound but has not achieved the universal adoption needed to truly enable an interoperable ecosystem.

### Why open-source campaign tools struggle to sustain

Several structural challenges explain why the open-source campaign tech landscape remains fragmented. **Voter file access** varies wildly by state — some limit data to registered candidates and parties, costs range from free to thousands of dollars, and formats are inconsistent. **FEC compliance** is "nuanced, incredibly difficult, and varies from state to state," with no open-source tool adequately handling multi-jurisdictional campaign finance requirements. **Cyclical demand** creates volunteer developer surges before elections followed by valleys between cycles, leading to maintainer burnout. And the **network effects** of incumbents are formidable: millions of Democratic volunteers know VAN's interface, and ActBlue's 28 million Express users create enormous switching costs.

The most successful models in adjacent spaces share common traits: an **anchoring institution** providing sustained funding (like OSET Institute, whose open-source voter registration technology processes **92% of U.S. online voter registrations**), professional core maintainers supplemented by community contributions, modular architecture, and standards-based interoperability.

---

## Building an open-source alternative: priorities and architecture

### The five most critical features to build first

Based on this research, an open-source campaign platform should prioritize features in this order, driven by the largest unmet needs and the greatest impact for under-resourced campaigns:

1. **Nonpartisan voter CRM with voter file integration** — The ability to import, normalize, and query voter data from any state is the foundation of all campaign operations. Build on the National Voter File project's data model with PostGIS for geographic queries. Support CSV import from all 50 states with automated field mapping. Include turf cutting, walk list generation, and household clustering. This is the single feature most locked behind partisan walls today.

2. **Mobile-first canvassing app with offline capability** — MiniVAN's dominance (92% of Democratic doors knocked) proves canvassing apps are essential. Build a progressive web app or React Native application that syncs voter data, supports branched survey scripts, provides GPS routing, and works reliably offline in areas with poor cell coverage. Real-time sync when connectivity returns.

3. **Integrated peer-to-peer texting** — Spoke proves this is technically achievable as open source. Integrate it directly into the CRM rather than running it as a separate tool, so texting results automatically update voter records. Self-service campaign creation is essential — GoodParty.org's managed-only model is a significant friction point.

4. **Campaign finance compliance engine** — This is the largest gap in the entire open-source ecosystem. Build a modular compliance system that generates FEC reports and supports pluggable state-specific modules. Track donor names, addresses, employers, occupations, aggregate limits, and filing deadlines. Generate reports in required formats. Start with federal FEC compliance and the 10 largest states.

5. **Donation processing with compliance tracking** — Integrate Stripe for payment processing with automatic compliance data capture. Every donation should immediately flow into the compliance engine. Support recurring donations, donor lookup, and contribution limits enforcement. This eliminates the need for both a separate fundraising platform and a separate compliance tool.

### Architecture recommendations

The platform should be **modular and API-first**, built as microservices that campaigns can deploy individually or together. Use the OSDI standard for all internal APIs to ensure interoperability with existing tools. Key architectural decisions:

- **Self-hosted with managed option**: Docker/Kubernetes deployment for technical campaigns; offer a hosted SaaS option (like GitLab's model) for campaigns without DevOps capacity
- **PostgreSQL + PostGIS** as the primary database for voter data with geographic queries
- **Event-driven architecture** so modules communicate asynchronously — canvassing results trigger CRM updates, donations trigger compliance checks, volunteer signups trigger assignment workflows
- **Offline-first mobile design** using service workers and local storage for canvassing in low-connectivity areas
- **Plugin/extension system** (inspired by CiviCRM) allowing community-built modules for state-specific compliance, custom integrations, and specialized features
- **Data portability by default**: CSV and JSON export of all data at any time, with OSDI-compliant APIs for programmatic access

### Sustainability model

Learning from the failures (National Voter File stalled, OSDI adoption slowed) and successes (OSET Institute at 92% market share, CiviCRM sustained for 20 years) of open-source civic tech:

- Establish a **nonprofit foundation** as the anchoring institution with dedicated funding — not dependent on volunteer cycles
- Hire **3-5 professional core maintainers** funded by foundation grants, supplemented by community contributions
- Generate revenue through a **hosted SaaS offering** (open core model) while keeping all code open-source
- Build a **commercial ecosystem** of implementation partners, training providers, and custom development shops
- Time development sprints to the **election cycle** — major releases 12 months before general elections, stability freeze 3 months before
- Partner with **state parties, civic organizations, and universities** for voter data pipeline maintenance

### The biggest unmet need

The single biggest unmet need in the campaign technology market is not a specific feature — it is **nonpartisan access to integrated, professional-grade campaign tools at near-zero cost**. Today, a first-time independent candidate for city council faces a choice between expensive proprietary platforms that may refuse to serve them, a patchwork of disconnected free tools requiring technical expertise to integrate, or running their campaign with spreadsheets and personal phones. An estimated **49% of Americans** identify with neither major party, yet the entire campaign technology infrastructure is built to serve the two-party system. An open-source platform that solves this problem — making it as easy to run for local office as it is to create a website on WordPress — would serve both a massive market need and a democratic imperative.

---

## Conclusion: from partisan infrastructure to democratic commons

The campaign technology landscape in 2026 is defined by a paradox: the tools that make modern democracy function are controlled by private equity firms, partisan gatekeepers, and organizations in internal crisis. NGPVAN's degradation under Apax Partners ownership — requiring the Harris campaign to send its own engineers to keep the system running — illustrates the fragility of depending on proprietary infrastructure for democratic participation. ActBlue's internal turmoil and NationBuilder's creeping "enshittification" suggest these are not isolated incidents but structural consequences of the current model.

The open-source alternative is not merely a technical project but a governance one. The OSET Institute's success processing 92% of U.S. voter registrations proves that open-source civic technology can achieve dominant market share when properly resourced and governed. The path forward requires building not just software but an institution: a nonpartisan foundation with professional maintainers, sustainable funding, and a community of campaigns, civic organizations, and developers committed to treating campaign technology as **democratic infrastructure rather than partisan advantage**. The fragments exist — Spoke's texting, CiviCRM's donor management, the National Voter File's data model, GoodParty.org's open-source codebase. What's missing is the integration, the institution, and the commitment to finish what these projects started.