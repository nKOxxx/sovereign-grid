PRODUCT BLUEPRINT
Sovereign Grid Product Specification
Global marketplace and transaction layer for verified compute
## Executive decision
Sovereign Grid will be an open, two-sided and accelerator-neutral compute marketplace. Buyers can publish demand and sellers can list capacity or bid into requests across NVIDIA and AMD GPUs, custom ASICs and regional accelerators. Sovereign Grid adds the transaction infrastructure around that connection: workload sizing, technical portability analysis, comparable pricing, route-specific eligibility screening, verified capacity evidence, configurable fees, contracting support, financing access, delivery verification and market intelligence. Chinese capacity is included in the initial marketplace as eligible supply, subject to transaction-specific trade-control, sanctions, end-use, data, access and jurisdiction review.
The initial business will be broker-assisted and focused on high-value transactions. Automation will reduce the manual work progressively. The platform will not begin as a retail GPU cloud, a proprietary derivatives exchange or a replacement for provider infrastructure.
# 1 Product definition
## 1.1 Product thesis
Sovereign Grid is the global transaction layer for compute. It helps a buyer determine what capacity is required, compares technically compatible accelerator and system alternatives, identifies suitable sellers, verifies that the capacity is deliverable and eligible for the specific transaction route, structures the commercial transaction and records the outcome as market intelligence.
## 1.2 Market problem
Compute inventory is fragmented across hyperscalers, neoclouds, brokers, data centres, private clusters and future projects.
Public hourly prices are difficult to compare because networking, storage, support, minimum commitments, interruption risk and utilization differ.
A listed accelerator is not necessarily available, financed, powered, legally eligible, software-compatible or operationally capable of running the buyer workload.
Large transactions require repeated emails, spreadsheets, legal checks, evidence requests and manual coordination across several organizations.
Buyers cannot easily benchmark negotiated pricing, while sellers struggle to convert future capacity into financeable offtake.
## 1.3 Product promise
One request should produce a qualified market: verified offers, comparable economics, clear conditions, controlled buyer-seller connection and a transaction record that can be settled, renewed, financed or resold.
## 1.4 Product principles
# 2 Market position and wedge
## 2.1 Category position
## 2.2 Initial commercial wedge
The MVP targets transactions that are too large or complex for a simple self-service price comparison and too small or fragmented for bespoke hyperscaler procurement.
32 GPUs or accelerator-equivalents or more, or total contract value above USD 100,000.
Term from one month to five years.
Training, inference, rendering, agent runtime and regulated workloads.
UAE, GCC, Europe, United States, China and selected Asian supply corridors.
Buyers that require procurement support, jurisdiction controls, resilience or financing.
## 2.3 Expansion sequence
1. Broker-assisted RFQs and verified capacity listings.
2. Repeatable transaction workflows with automated quoting and CRM execution.
3. Secondary capacity trading and controlled subleasing.
4. Transaction-derived indices, forward curves and underwriting data.
5. Partner-distributed financing, insurance and regulated hedging products.
# 3 Users roles and permissions
## 3.1 Marketplace visibility
Public listing: visible specification and indicative price; seller identity may be disclosed.
Anonymous listing: capacity is discoverable but the seller remains hidden until connection approval.
Private listing: visible only to invited or matched buyers.
Public RFQ: qualified sellers may submit offers.
Private RFQ: only invited sellers may participate.
Operator-created opportunity: Sovereign Grid represents demand or supply received outside the platform.
## 3.2 Connection policy
The product must allow direct buyer-seller communication while preserving the platform transaction. Contact details can be released after both parties accept the marketplace terms and the fee attribution is recorded. Early-stage users communicate through masked messaging and a controlled deal room.
## 3.3 Anti-circumvention controls
Marketplace terms attach the Sovereign Grid fee to introduced counterparties and renewals for a defined protection period.
Listings may hide seller identity, facility coordinates and direct contact details before connection approval.
Every introduction creates a timestamped attribution record.
Quotes, documents, messages and meeting history remain attached to the deal.
Operator may waive, reduce or reallocate fees with a recorded reason and approval.
# 4 Core transaction journey
## 4.1 Buyer-led journey
1. Buyer creates an account and verifies the contracting entity.
2. Buyer posts a compute request using hardware requirements or workload objectives.
3. The platform identifies missing information and produces a preliminary workload recommendation.
4. Eligibility and jurisdiction rules remove clearly unsuitable routes and flag conditional routes.
5. The matching engine selects listed capacity and invites additional qualified sellers.
6. Sellers submit structured offers with commercial terms and evidence.
7. Sovereign Grid normalizes the offers and applies the configured fee policy.
8. Buyer compares complete costs, risk, performance, sovereignty and delivery confidence.
9. Buyer requests connection with one or more sellers and enters controlled negotiation.
10. The selected offer moves through evidence, contracting, financing and deposit milestones.
11. Capacity delivery and acceptance are recorded against measurable criteria.
12. The transaction contributes anonymized market data, renewal triggers and resale rights.
## 4.2 Seller-led journey
1. Seller verifies its entity and declares ownership or contractual control of capacity.
2. Seller lists current, future or interruptible inventory.
3. Seller completes the Capacity Passport and submits required evidence.
4. Sovereign Grid validates the listing and assigns verification, power and resilience statuses.
5. Seller receives compatible demand alerts and may bid into buyer RFQs.
6. Seller sees the net payout and relevant fee structure before submitting an offer.
7. Seller connects with approved buyers and negotiates within the deal room.
8. Seller delivers capacity, maintains evidence and reports availability or interruptions.
9. Seller can release unused contracted capacity into the secondary market when permitted.
## 4.3 Marketplace state machine
Draft -> Submitted -> Screening -> Market open -> Offers received -> Shortlisted -> Connected -> Negotiating -> Conditional award -> Contracted -> Provisioning -> Live -> Completed, renewed, resold, cancelled or disputed.
# 5 Buyer request specification
## 5.1 Required request fields
## 5.2 Workload sizing result
The system may return a recommended configuration, alternative configurations and a confidence level. Recommendations must show assumptions and may not be presented as guaranteed performance without benchmark evidence.
Recommended accelerator or system family, vendor alternatives and memory class.
Estimated accelerators, nodes, runtime and utilization.
Network and storage requirements.
Firm versus interruptible suitability.
Cost range and sensitivity to term or utilization.
Missing evidence or engineering review requirements.
## 5.3 Request privacy
The buyer controls whether company identity, workload name, model name, budget and sensitive requirements are disclosed to sellers. The default seller view contains enough information to prepare a credible offer without exposing proprietary data.
# 6 Seller capacity specification
## 6.1 Capacity listing fields
## 6.2 Verification statuses
## 6.3 Evidence freshness
Each evidence item stores issuer, date, reviewer, expiry, scope and source. Expired evidence reduces the listing confidence and may block new transactions until refreshed.
# 7 Matching and ranking engine
## 7.1 Hard filters
The engine first eliminates offers that fail non-negotiable requirements: date, minimum capacity, accelerator and software compatibility, portability threshold, jurisdiction, access model, data residency, sanctions status, export or trade-control route, buyer or seller restrictions and mandatory certifications. Chinese capacity is evaluated through the same transaction-specific gates and is not excluded by a blanket geography rule.
## 7.2 Ranked score
Remaining offers receive a 0 to 100 Match Score. The default weighting is configurable by buyer profile and transaction type.
## 7.3 Ranking controls
Sponsored or preferred-provider status may not silently override buyer requirements.
Any commercial promotion must be labelled and separated from the suitability score.
Operator can adjust a match with a recorded reason, author and timestamp.
The buyer can change weighting for price, sovereignty, performance, resilience or start date.
The platform shows why an offer ranked and which assumptions could change the result.
## 7.4 Outcome learning
Award, rejection, delivery, utilization and renewal outcomes update future matching. Sensitive transaction data remains permissioned and externally published benchmarks use aggregation and minimum-observation rules.
# 8 Quote normalization and calculator
## 8.1 Complete cost model
Each offer is converted into a comparable total cost and effective unit cost. No price is labelled live unless it comes from a current provider feed, seller submission or completed transaction with a timestamp.
Accelerator, system or node rental.
Minimum usage and reservation commitment.
Storage, snapshots, data ingress and egress.
Networking, interconnect and private connectivity.
Software, orchestration, support and managed services.
Setup, migration, engineering and decommissioning.
Taxes, currency conversion and payment timing.
Expected idle capacity and utilization loss.
Interruption, failover and delivery-risk adjustments.
Financing, insurance and Sovereign Grid fees.
## 8.2 Calculator outputs
## 8.3 Scenario comparison
A buyer can compare one month, one year, three years and five years, and can change accelerator count, utilization, start date, price, financing and resale assumptions. Illustrative values must be visibly labelled and separated from submitted or transacted data.
# 9 Fee and revenue engine
## 9.1 Fee configuration
## 9.2 Price construction
Buyer price equals seller base price plus pass-through costs plus Sovereign Grid fee plus applicable taxes. Seller payout equals seller base price less any seller-paid fee. The platform stores both views separately and reveals them only according to role permissions.
## 9.3 Operator controls
Preview buyer price, seller payout and platform gross revenue before publishing a quote.
Prevent a quote if it falls below the minimum margin unless an authorized operator approves the exception.
Record the original fee rule, overrides, approver and reason.
Calculate fees for renewals, expansions, replacements and secondary-market transactions.
Track expected, contracted, invoiced, collected and partner-payable revenue separately.
## 9.4 Initial revenue model
The default demo fee is configurable and must not imply a final commercial policy. The MVP should support a platform commission, an optional buyer advisory fee and partner referral splits. Financing and insurance referral revenue are recorded when those services are introduced.
# 10 Eligibility and policy engine
## 10.1 Purpose
The Eligibility Engine determines whether a specific buyer, seller, workload, accelerator and software stack, access structure, support route and physical location may proceed to the next transaction stage. It produces a structured pre-screening result, not legal advice or an automatic legal approval. Chinese capacity is eligible to enter the market, but every transaction requires a route-specific decision based on the exact parties, hardware, end use, end user, location, ownership, remote access, support and applicable controls.
## 10.2 Inputs
Buyer and seller legal entities, aliases and ownership.
Physical hardware location, operator location and contracting jurisdiction.
Accelerator and system family, vendor, architecture, country of origin, software stack, ownership or leasing chain and cross-border service route.
End use, end user, workload type and restricted-sector exposure.
Remote access, administrative access, software, technology and support arrangements.
Sanctions, export-control, trade-control and internal policy sources.
Evidence, source dates, reviewer decisions and transaction-specific licenses.
## 10.3 Outcomes
## 10.4 Screening events
Screening runs at onboarding, connection approval, quote issuance, contract execution, provisioning and material change. Source updates or evidence expiry may trigger re-screening and pause a transaction.
## 10.5 Existing rulebase
The supplied pre-screening dataset provides an initial structure across 54 counterparties, 8 physical-location assumptions, 10 hardware families and 4,320 scenario combinations. It is a baseline rather than a closed universe. The initial marketplace includes Chinese facilities, operators and accelerator families when sufficient evidence is available. Every result remains dated, evidence-specific and incomplete until the actual transaction parties, hardware, software, support route, end use and operating structure are known.
# 11 Capacity Passport
## 11.1 Passport components
## 11.2 Scores
Scores summarize reviewed evidence but never replace the underlying record. Each score shows methodology version, evidence coverage and confidence.
Delivery Confidence Score
Power Certainty Score
Power Flexibility classification
Resilience Score
Accelerator Portability profile
Sovereign Eligibility profile
Evidence Confidence Score
## 11.3 Continuous verification
The long-term design supports provider APIs, infrastructure telemetry and digital-twin evidence. The MVP accepts structured uploads and operator review, while keeping the schema ready for automated evidence refresh.
# 12 Deal room and transaction execution
## 12.1 Deal room contents
Participants and permissions.
Buyer request, selected offer and quote versions.
Structured message thread and meeting record.
Evidence checklist and document requests.
Eligibility conditions and reviewer decisions.
Commercial negotiation and approved deviations.
Term sheet, contract and signature status.
Deposit, invoice, financing and insurance milestones.
Provisioning plan, acceptance test and delivery record.
Renewal, expansion, sublease and dispute actions.
## 12.2 Transaction milestones
## 12.3 Payments
The MVP records invoices, deposits and payment status but does not custody funds. Escrow, payment processing or banking integrations are introduced through regulated partners after the transaction workflow is validated.
# 13 CRM and autonomous operations
## 13.1 CRM strategy
Sovereign Grid will integrate with an established CRM during the MVP rather than rebuilding generic contact and pipeline functionality. Sovereign Grid owns the compute-specific opportunity, matching, evidence and transaction objects.
## 13.2 Automated workflows
## 13.3 Communication channels
The automation layer supports email first, followed by calendar, approved messaging channels and CRM tasks. Every automated communication records template, source data, recipient, status and responsible human. Sensitive or binding communication requires an explicit approval rule.
## 13.4 Operator inbox
The operator receives one prioritized queue covering revenue opportunities, stalled deals, expiring evidence, screening holds, margin exceptions, upcoming renewals and delivery risks.
# 14 Market intelligence indices and financial products
## 14.1 Data hierarchy
## 14.2 Initial benchmark families
Global spot and committed price series by accelerator and system family.
China and regional-accelerator capacity series, segmented by route eligibility and software portability.
Accelerator portability, migration-cost and switching-risk series.
UAE and GCC sovereign-qualified compute series.
Firm and interruptible capacity series.
Verified physical-delivery series.
Sovereignty and resilience premiums.
Residual-value and secondary-capacity series.
## 14.3 Publication controls
An index requires documented inclusion rules, quality filters, observation minimums, outlier policy, conflicts controls, revision policy and independent governance. Until those conditions exist, the demo labels outputs as indicative analytics and never as a live Sovereign Grid index.
## 14.4 Futures and hedging
Sovereign Grid will not initially operate a regulated derivatives market. The strategic role is to produce qualified transaction data, verified settlement inputs and physical capacity that regulated exchanges, brokers or financial institutions can reference.
# 15 Core data model
## 15.1 Data provenance
Every price, status, score and decision stores source, collection time, validity period, transformation history and responsible actor. Manual edits never overwrite the original observation.
## 15.2 Sensitive data
Buyer identity, seller base pricing, margins, documents, screening results and private messages are role-restricted. Published analytics are aggregated and reviewed for confidentiality and manipulation risk.
# 16 Demo specification
## 16.1 Demo objective
Prove that Sovereign Grid can create a functioning two-sided market while adding a differentiated qualification and transaction layer. The user should understand the product within two minutes and complete the core scenario within eight minutes.
## 16.2 Killer scenario
Project Falcon is a European AI company seeking 256 H200 GPUs for 24 months. It requires EU-compliant processing, a primary European deployment, UAE failover, zero-data retention, firm capacity for production and a controlled option to release unused capacity.
## 16.3 Required demo screens
1. Marketplace home showing live-style supply listings and open buyer requests.
2. Post Demand flow with accelerator, acceptable alternatives, node, workload, location, term, portability and policy controls.
3. List Capacity flow with accelerator and system inventory, software compatibility, location, price, evidence and availability inputs.
4. Match Results comparing at least three sellers across price, performance, sovereignty, power and resilience.
5. Five Year Calculator with editable count, price, utilization, term, financing and resale assumptions.
6. Eligibility result showing passed checks, open conditions, evidence and human approval gate.
7. Capacity Passport showing verification status and underlying evidence categories.
8. Connection request and Deal Room with messages, documents, tasks and negotiation state.
9. Operator Fee Engine showing seller price, buyer price, platform revenue and partner split.
10. CRM Automation view showing generated outreach, follow-ups, approvals and renewal triggers.
11. Market Intelligence view showing clearly labelled indicative prices, quoted observations and forward scenarios.
## 16.4 Demo marketplace behavior
Buyer can switch between browsing supply and posting an RFQ.
Seller can switch between browsing demand and listing capacity.
Connection buttons open a meaningful approval and deal-room flow.
Changing the Sovereign Grid fee updates buyer price and platform revenue immediately.
Changing accelerator count, utilization or term updates the financial outputs immediately.
Eligibility conditions affect which offers are bookable.
Every illustrative number is labelled as demo data.
# 17 Demo acceptance criteria
## Additional locked acceptance criteria
D15  Initial marketplace inventory includes Chinese capacity and applies route-specific eligibility, evidence and disclosure controls rather than a blanket geography exclusion.
D16  Capacity Passport and Match Results display accelerator compatibility, framework and compiler support, benchmark provenance, portability, migration effort and trade-control eligibility.
## 17.1 Demo data
The demo uses realistic but explicitly illustrative sellers, offers, scores, prices and market observations. Where a public figure is used, it must carry source, date and scope. Confidential pipeline information must not appear in a shareable demo unless anonymized and approved.
## 17.2 Narrative sequence
1. Show fragmented supply and demand inside one market.
2. Post Project Falcon demand.
3. Reveal normalized matches and disqualify one otherwise attractive offer through policy conditions.
4. Open the calculator and compare commercial structures.
5. Change the platform fee and show the marketplace economics.
6. Connect buyer and seller inside the Deal Room.
7. Show how delivery produces a verified market observation and future index input.
# 18 MVP scope
## 18.1 MVP included
Buyer, seller and operator accounts.
Structured buyer requests and seller listings.
Broker-assisted matching and offer collection.
Quote normalization and five-year calculator.
Configurable fee policies and partner attribution.
Capacity Passport with manual evidence review.
Eligibility cases with rules, evidence and human approvals.
Connection approval and Deal Room.
CRM synchronization and email automation.
Contract, invoice and delivery milestone tracking.
Internal transaction analytics and controlled exports.
## 18.2 MVP excluded
Custody of buyer or seller funds.
Operating a regulated futures or derivatives exchange.
Automated legal approval or replacement of qualified counsel.
Direct orchestration across every provider infrastructure API.
Guaranteed benchmark performance without testing evidence.
Fully autonomous negotiation of binding commercial terms.
Retail-scale marketplace support for every individual GPU rental.
## 18.3 Suggested delivery phases
# 19 Nonfunctional requirements
## 19.1 Trust requirements
Never display a seller-provided claim as verified without evidence and reviewer status.
Never label illustrative prices as live.
Never convert a negative name search into a legal clearance statement.
Never expose seller base pricing, buyer budget or platform margin outside authorized roles.
Never allow an automated message to create a binding obligation without the configured approval.
# 20 Metrics and operating dashboard
## 20.1 Marketplace liquidity
Qualified demand value and qualified supply value.
Requests receiving at least three qualified offers.
Median time to first qualified offer.
Match-to-connection and connection-to-contract conversion.
Buyer and seller repeat rate.
## 20.2 Commercial performance
Gross transaction value.
Contracted platform revenue and realized revenue.
Average fee percentage and margin after partner splits.
Sales cycle, pipeline velocity and renewal value.
Financing, insurance and resale attachment rates.
## 20.3 Delivery quality
Contracted capacity delivered on time.
Buyer acceptance success and time to resolution.
Observed utilization and idle-capacity release.
Provider SLA performance and incident rate.
Evidence freshness and unresolved eligibility conditions.
## 20.4 North star metric
Verified compute value successfully delivered through Sovereign Grid. This metric requires a contracted transaction, buyer acceptance and recorded platform attribution. Listings, page views and unverified pipeline do not count.
# 21 Risks and controls
## 21.1 Stage gates
The product advances only when real transactions validate the workflow. Each expansion must either improve fill rate, reduce transaction time, increase verified delivery, raise gross margin or create defensible transaction data.
# 22 Decisions locked for the demo
## 22.1 Remaining decisions before MVP engineering
Formal legal-review process, accountable policy owners and source update cadence for each initial jurisdiction, including China.
Default fee range and counterparty protection period.
CRM, email, e-signature and identity providers.
Payment, escrow, financing and insurance partners.
Capacity Passport evidence standard and reviewer authority.
Provider API priority and inventory update obligations.
Benchmark governance and minimum transaction thresholds.
## 22.2 Immediate next step
Build the interactive demo directly against Sections 16 and 17. No feature enters the demo unless it advances the Project Falcon transaction or proves the two-sided marketplace, fee engine, qualification layer or transaction-data flywheel.
# 23 Research basis
The specification incorporates the supplied US and EU GPU compute pre-screening, AI compute prospect universe, GPU index and broker contact dataset, and internal data-centre pipeline materials. It also uses the following public product references reviewed in September 2026. Public claims remain attributable to their publishers and do not constitute independently audited facts.
[TABLE]
Field | Definition
Version | 0.4
Owner | Nikola Stojanow
Date | 23 September 2026
Primary market | UAE and GCC anchored global market including China and selected Asian supply corridors
Product stage | Demo specification leading to broker-assisted MVP
Purpose | Blueprint for product design, engineering, commercial operations and partner discussions
[TABLE]
Principle | Required behavior
Open connection | Buyers and sellers may discover and connect through the marketplace.
Evidence before confidence | Every important claim displays its evidence, freshness and verification status.
Workload before hardware | The buyer may request an outcome without knowing the correct accelerator, system or software configuration.
Accelerator neutrality | Matching is based on workload fit, complete economics, portability and eligibility rather than a preferred chip vendor.
Transparent comparison | Quotes are normalized to a complete commercial and operational basis.
Controlled transaction | Sovereign Grid protects its role, fee and audit trail through the deal lifecycle.
Human approval for high risk | Legal, sanctions, export-control and credit decisions retain explicit human gates.
Transaction data compounds | Completed deals improve matching, pricing, underwriting and future benchmarks.
[TABLE]
Category | Representative products | Sovereign Grid response
Price discovery | GetDeploying, gpu.info, Era | Use public pricing as an input, then normalize complete transaction economics.
Capacity marketplaces | SF Compute, Compute Exchange, Vast.ai | Combine connection with sovereign eligibility, evidence and deal execution.
Market intelligence | Silicon Data, Ornn | Build transaction-derived intelligence and policy-adjusted benchmarks.
Financial markets | Liquid Compute, CME, ICE | Provide verified physical capacity, settlement evidence and qualified data.
Financing and insurance | American Compute, GPU Lenders | Route financeable transactions directly into underwriting partners.
Optimization | Expanse | Size workloads before sourcing and measure utilization after delivery.
Sovereign infrastructure | Core42, e&, regional telcos | Aggregate eligible capacity without requiring buyers to remain inside one provider.
[TABLE]
Role | Primary objective | Core permissions
Buyer | Secure suitable compute at a defensible total cost. | Post demand, invite sellers, compare offers, connect, negotiate, contract and track delivery.
Seller | Monetize current or future capacity. | List inventory, bid on RFQs, submit evidence, negotiate, contract and release unused capacity.
Broker or partner | Originate and support transactions. | Create opportunities, invite participants, view assigned deals and receive defined splits.
Financier or insurer | Underwrite eligible infrastructure and offtake. | Review permissioned deal evidence, submit terms and monitor covenants.
Reviewer | Resolve compliance, technical or credit conditions. | Review evidence, request documents and approve, condition or halt a transaction.
Operator | Run the market and commercial engine. | Manage listings, fees, users, workflows, matching, exceptions, data quality and reporting.
[TABLE]
Group | Fields
Commercial | Start date, duration, budget, billing currency, deposit tolerance, renewal option and procurement deadline.
Capacity | Accelerator vendor, model or acceptable alternatives; accelerator count, node count, hours, concurrency and scaling range.
Workload | Training, fine-tuning, inference, rendering, simulation or agent runtime; model, framework, compiler, precision and expected utilization.
Performance | Memory capacity and bandwidth, interconnect, storage throughput, network bandwidth, latency, benchmark provenance and availability target.
Location | Preferred, permitted and prohibited countries including China policy; latency regions; data residency, operator-location and support-access constraints.
Control | Bare metal, virtual machine, Kubernetes, Slurm, managed inference, managed training or API access.
Security | Encryption, tenant isolation, zero-data retention, telemetry, operator access and certifications.
Resilience | Single site, availability zone, cross-site failover, recovery capacity and maximum tolerable outage.
Flexibility | Firm, interruptible, schedulable, curtailment tolerance and migration tolerance.
[TABLE]
Group | Required data
Identity | Contracting entity, operator, facility owner, beneficial ownership and authorized representative.
Control | Owned, leased, financed, reserved, brokered or future capacity; supporting rights and resale restrictions.
Hardware | Accelerator vendor, model, architecture, quantity, node design, CPU, memory, interconnect, storage, network, framework support, compiler stack, precision modes and software environment.
Portability | Supported models and frameworks, container and image compatibility, migration tooling, expected conversion work, performance variance and switching cost.
Availability | Start date, end date, continuous or scheduled blocks, maintenance windows and minimum term.
Commercial | Seller price, currency, billing unit, minimum spend, deposit, cancellation and renewal terms.
Facility | Country, region, exact physical location, power status, cooling, certifications, physical security, connectivity and cross-border service route.
Operations | Provisioning lead time, support, monitoring, incident history, SLA and customer acceptance process.
Sovereignty | Data residency, personnel access, telemetry, subprocessors, governing law and audit rights.
Evidence | Invoices, serials, contracts, benchmark reports, compiler and framework compatibility evidence, power documents, insurance, licenses and trade-control documentation.
[TABLE]
Status | Meaning
Unverified | Seller-provided information with no completed evidence review.
Identity verified | Contracting entity and authorized representative verified.
Capacity evidenced | Control of the listed capacity supported by reviewed evidence.
Operationally verified | Configuration and performance supported by benchmark or telemetry evidence.
Sovereign qualified | Specified jurisdiction and workload controls satisfy the defined policy profile.
Delivery verified | Provisioning and buyer acceptance recorded for a completed transaction.
[TABLE]
Dimension | Default weight | Examples
Workload performance | 25 | Benchmark fit, memory, network topology, framework and compiler compatibility, portability and expected completion time.
Complete economics | 20 | Landed cost, utilization, support, financing, migration and switching cost.
Availability and delivery | 15 | Start date, lead time, evidence and provisioning history.
Sovereign eligibility | 15 | Jurisdiction, trade-control route, data, operator, personnel, support access and policy fit.
Reliability and resilience | 10 | SLA, failover, concentration and recovery capacity.
Commercial flexibility | 10 | Term, scale range, cancellation, resale and payment structure.
Evidence confidence | 5 | Freshness, source quality and verification coverage.
[TABLE]
Output | Definition
Monthly run rate | Expected recurring monthly cost under the selected utilization assumption.
Total contract value | All committed payments over the selected term up to five years.
Effective accelerator hour | Complete contract cost divided by usable accelerator hours.
Cost per workload | Estimated complete cost for a defined training, inference or execution objective.
Spot exposure | Estimated cost sensitivity if uncommitted pricing changes.
Commitment value | Difference between selected committed terms and comparable on-demand exposure.
Break-even utilization | Utilization at which the committed option becomes preferable.
Resilience premium | Incremental cost of failover, hardening or multi-site delivery.
Sovereignty premium | Observed or quoted difference for the required policy profile.
[TABLE]
Rule | Supported configuration
Fee basis | Fixed fee, percentage of contract value, percentage of seller price, per accelerator hour or blended.
Fee payer | Buyer, seller or split.
Scope | Global, provider, buyer, partner, region, accelerator or system family, term or individual deal.
Minimums | Minimum gross margin, minimum absolute fee and minimum effective percentage.
Discounts | Volume, term, strategic account, launch, renewal or operator-approved.
Partner split | Percentage or fixed allocation to originator, broker or channel partner.
Additional revenue | Financing, insurance, implementation, managed service, data and resale commissions.
[TABLE]
Outcome | Platform action
Pre-screened | No identified match under the configured checks; transaction-specific review may still be required.
Needs evidence | Request missing identity, ownership, end-use, operator or license evidence.
Conditional | Permit progression only after defined conditions and approval are satisfied.
Manual review | Route to a qualified reviewer before connection, quotation or provisioning.
Hold | Block progression pending resolution of a potential list match or material policy issue.
Approved by reviewer | Record named reviewer, scope, conditions, timestamp and expiry.
[TABLE]
Component | Evidence or metric
Identity | Entity verification, ownership, representatives and contracting authority.
Capacity control | Ownership, lease, reservation, financing, serials and resale rights.
Technical | Hardware, topology, benchmarks, software, storage, network and provisioning.
Accelerator compatibility | Vendor and architecture, memory and interconnect, frameworks, compilers, precision modes, benchmark provenance, model portability, migration effort and switching cost.
Power certainty | Interconnection, committed MW, power source, curtailment and approval evidence.
Power flexibility | Dispatchable load, response time, minimum operating level and recovery behavior.
Resilience | Concentration, hardening, failover, recovery capacity and maximum outage.
Sovereignty | Data, model, telemetry, personnel, operator, subprocessors and governing law.
Trade-control route | Hardware origin, destination, end user, end use, ownership, remote administration, support access, licenses, restrictions and reviewer decision.
Operations | SLA, uptime, support, incident history, security and insurance.
Commercial | Availability, term, price, minimums, cancellation, renewal and sublease rights.
[TABLE]
Milestone | Minimum completion evidence
Connection accepted | Mutual acceptance of introduction and marketplace terms.
Commercially agreed | Selected configuration, price, term, fee attribution and material conditions.
Conditionally awarded | Buyer selection subject to defined evidence, financing or contract conditions.
Contracted | Executed agreement and required approvals.
Provisioning ready | Capacity, access, network, security and schedule confirmed.
Accepted | Buyer acceptance test and issue record completed.
Settled | Required payment and fee events recorded.
Completed or renewed | Final performance, renewal, release or resale status recorded.
[TABLE]
Trigger | Automated action | Approval rule
New buyer request | Create account and opportunity, validate fields, request missing information and propose matches. | Operator reviews high-value or low-confidence requests.
Compatible capacity | Notify eligible sellers and create bid tasks. | Buyer identity disclosure follows request privacy.
Offer received | Normalize price, calculate margin, update comparison and notify buyer. | Below-margin offers require operator approval.
Evidence missing | Send evidence request, reminders and escalation. | Reviewer determines sufficiency.
No seller response | Follow up, expand seller pool and alert operator. | Operator may add off-platform suppliers.
Connection requested | Collect marketplace acceptance and open deal room. | Eligibility gates must pass.
Contract nearing expiry | Model renewal, alternatives and secondary release. | Buyer or seller approves outreach.
Material market move | Flag affected open quotes and contract exposures. | No automatic repricing after contractual lock.
[TABLE]
Level | Data type | Permitted use
Indicative | Public or advertised provider pricing. | Discovery, comparison context and trend monitoring.
Quoted | Structured seller offer with validity and conditions. | Buyer comparison and quote analytics.
Negotiated | Latest agreed commercial terms before execution. | Private deal management and internal analytics.
Transacted | Executed and attributable transaction. | Benchmarks subject to aggregation and methodology.
Delivered | Accepted capacity with performance evidence. | Settlement, quality adjustment and underwriting.
[TABLE]
Object | Purpose | Key relationships
Organization | Legal and commercial party. | Users, identities, ownership, policies and transactions.
User | Human or agent identity. | Organization, role, permissions and actions.
Buyer Request | Structured demand. | Buyer, workload, policy profile, matches and offers.
Capacity Listing | Structured supply. | Seller, facility, hardware, availability and Passport.
Accelerator Profile | Normalized technical and portability profile. | Vendor, architecture, system, software stack, benchmarks, migration requirements and policy attributes.
Workload Profile | Technical and operational requirements. | Request, sizing result, benchmarks and acceptance criteria.
Match | Compatibility result. | Request, listing, filters, score and explanation.
Offer | Seller commercial response. | Match, quote versions, validity, evidence and conditions.
Fee Policy | Sovereign Grid revenue rules. | Offer, account, provider, partner and override.
Eligibility Case | Policy decision record. | Parties, location, hardware, workload, sources and reviewer.
Capacity Passport | Evidence-backed asset profile. | Listing, facility, evidence, scores and expiry.
Deal | Controlled buyer-seller transaction. | Participants, offer, fee, room, documents and milestones.
Contract | Executed commercial arrangement. | Deal, term, obligations, renewal and sublease rights.
Delivery Record | Provisioning and performance outcome. | Contract, acceptance, incidents, utilization and settlement.
Market Observation | Price or performance data point. | Source level, accelerator or system family, region, route eligibility, term, timestamp and quality.
CRM Activity | Outreach and workflow event. | Account, opportunity, template, owner and outcome.
[TABLE]
ID | Acceptance criterion
D01 | A buyer can enter accelerator or node quantity, desired hardware or acceptable alternatives, region, start date and term up to five years.
D02 | A seller can create a capacity listing and see its expected net payout.
D03 | Marketplace includes buyer demand and seller supply views with working filters.
D04 | At least three offers, including one non-NVIDIA or custom-accelerator offer, are normalized into a comparable results view.
D05 | A buyer can request direct connection and enter a populated Deal Room.
D06 | Operator can change the platform fee and see buyer, seller and Sovereign Grid economics update.
D07 | Calculator reacts to count, price, utilization, financing and term changes.
D08 | Eligibility Engine displays pre-screened, conditional, review and hold states.
D09 | Capacity Passport displays evidence coverage, freshness and verification status.
D10 | CRM view demonstrates an automated email sequence and approval gate.
D11 | Index view separates indicative, quoted and transacted data.
D12 | The complete Project Falcon path can be demonstrated without a dead button or unexplained screen.
D13 | Desktop and mobile layouts remain usable with no horizontal clipping.
D14 | No illustrative figure is represented as live market data.
[TABLE]
Phase | Target | Product result
Demo | 2 to 3 weeks | Interactive two-sided marketplace proving the complete Project Falcon transaction.
Concierge pilot | 0 to 90 days | Run real RFQs manually through structured product workflows.
MVP | 3 to 6 months | Persistent marketplace, deal rooms, fee engine, CRM and evidence workflows.
Market network | 6 to 12 months | Provider feeds, repeat buyers, secondary capacity and financing integrations.
Intelligence layer | 12 months and beyond | Transaction-derived benchmarks, underwriting products and settlement partnerships.
[TABLE]
Area | Requirement
Security | Encryption in transit and at rest, least privilege, MFA for privileged roles and immutable activity history.
Auditability | Every change to price, evidence, eligibility, fee or milestone is attributable and timestamped.
Availability | Core marketplace and deal records remain accessible during provider or integration outages.
Privacy | Role-based disclosure, request privacy controls, data minimization and configurable retention.
Performance | Marketplace search and recalculation feel immediate under normal demo and MVP data volumes.
Interoperability | API-first objects and exportable structured records for CRM, provider, finance and reporting partners.
Accessibility | Keyboard operation, readable contrast, clear status language and responsive layouts.
Localization | Architecture supports currencies, units, time zones and regional policy profiles.
Data integrity | Source provenance, freshness, versioning and separation of indicative and transactional data.
[TABLE]
Risk | Control
Marketplace bypass | Controlled identity release, attribution records, transaction protection terms and value delivered after introduction.
Fake or double-sold capacity | Capacity evidence, control rights, availability checks, buyer acceptance and provider performance history.
Incorrect compliance conclusion | Pre-screening language, source versioning, manual approvals and qualified external review.
Price manipulation | Source hierarchy, outlier controls, observation minimums and separation of advertised and transacted prices.
Delivery failure | Milestones, deposits, evidence, acceptance criteria, backup capacity and dispute records.
Data leakage | Role-based disclosure, masked listings, permissioned deal rooms and export controls.
Concentration | Provider, geography, power, buyer and accelerator-generation concentration reporting.
Regulatory overreach | Partner with regulated entities for custody, lending, insurance and derivatives.
Overbuilt product | Broker-assisted MVP, measurable stage gates and integrations for commodity functions.
[TABLE]
Decision | Demo default
Marketplace model | Open two-sided marketplace with controlled connection and optional anonymity.
Hardware architecture | Accelerator-neutral across NVIDIA, AMD, custom ASICs and regional accelerators.
Chinese capacity | Included in the initial marketplace as eligible supply with transaction-specific trade-control, end-use, data, access and jurisdiction screening.
Primary scenario | Project Falcon: 256 H200 GPUs, 24 months, Europe primary and UAE failover.
Maximum term | Five years.
Commercial model | Configurable buyer, seller or split fee with partner allocation.
Workflow | Broker-assisted with visible automation and human approval gates.
Compliance language | Pre-screening and evidence workflow, never automatic legal clearance.
Market data | Indicative, quoted and transacted categories displayed separately.
CRM | Integrated workflow concept rather than a proprietary generic CRM.
Payments | Milestone and invoice tracking without custody.
Derivatives | Partner and data strategy, not an owned regulated exchange in the MVP.
[TABLE]
Reference | URL
GetDeploying GPU pricing | https://getdeploying.com/gpus
SF Compute | https://sfcompute.com
Compute Exchange | https://compute.exchange
Liquid Compute | https://liquidcompute.com
Silicon Data | https://www.silicondata.com
Ornn | https://ornn.com
American Compute | https://www.amcompute.com
GPU Lenders | https://gpulenders.com
Expanse | https://expanse.sh
Daytona | https://www.daytona.io
AWS EC2 Capacity Blocks for ML | https://aws.amazon.com/ec2/capacityblocks
IEA Energy and AI | https://www.iea.org/reports/energy-and-ai
NVIDIA Sovereign AI | https://www.nvidia.com/en-eu/lp/industries/global-public-sector/sovereign-ai-whitepaper/
Alibaba accelerator and data-centre expansion announcement coverage | https://apnews.com/article/b29908e516faff9f5a82b201ba954aab