**EXAAI**

**PRODUCT REQUIREMENTS DOCUMENT — VERSION B**

Enterprise-Level Product \+ Developer Specification

| PurposeThis document expands Version A into a detailed, technology-agnostic specification intended to reduce ambiguity between product design, engineering, AI/content design and future operations. It does not select a technical stack and does not invent unresolved business decisions. |
| :---- |

| Core product ideaExaai helps Algerian teachers carry part of the repetitive responsibility of exam creation. The AI generates and proposes; the teacher reviews, edits, replaces and approves. |
| :---- |

*Status: Draft for architecture and implementation planning*

# **1\. Document Control and Reading Guide**

| Field | Value |
| :---- | :---- |
| Product | Exaai |
| Document | PRD Version B — Enterprise-Level Developer Specification |
| Audience | Founder, product designer, developer/engineering team, AI/content engineer |
| Market | Algeria initially |
| Primary users | English teachers |
| Initial levels | Middle school \+ secondary school |
| Initial language | English exam generation |
| UI languages | English \+ French |
| Commercial model | TBD: freemium / monthly / annual |
| Technical stack | Intentionally technology-agnostic |
| Primary objective | Productivity \+ teacher control |

## **1.1 How to use this document**

* Sections 1–8 define product intent, scope and user experience.  
* Sections 9–18 define functional behavior and data concepts.  
* Sections 19–27 define AI/content architecture, reliability, security and operational expectations without choosing specific technologies.  
* Sections 28–35 define testing, acceptance, analytics, rollout and future expansion.  
* The Open Decisions section must be resolved before engineering estimates are considered final.  
* The official ministry/exam guides remain a required external source of truth; this PRD does not substitute for them.

## **1.2 Normative language**

| Term | Meaning |
| :---- | :---- |
| MUST | Required for the stated release/scope. |
| SHOULD | Strongly preferred; may be deferred for justified effort. |
| MAY | Optional/future capability. |
| TBD | Founder/product decision is not yet resolved. |
| Source of truth | The authoritative document/data that should govern behavior. |

# **2\. Executive Product Definition**

## **2.1 Product statement**

Exaai is a teacher-facing SaaS application that uses AI to help Algerian teachers design structured language exams through a guided workflow. The teacher selects constraints, generates a text, generates exam tasks, replaces weak alternatives, edits content and exports the finished exam.

## **2.2 Problem**

* Exam creation is repetitive and time-consuming.  
* Teachers must repeatedly construct texts, questions, language tasks and writing prompts while respecting a prescribed exam structure.  
* AI can reduce workload but uncontrolled generation can create unsuitable tasks, wrong marks, inappropriate difficulty or poor alignment with the lesson.  
* Many target users may not understand or want to manage AI APIs, model choices or usage credits.

## **2.3 Solution**

* A constrained generation workflow rather than a generic chatbot.  
* Official-guide-aware generation rules.  
* Independent replacement of tasks and topics.  
* Manual editing at every meaningful stage.  
* Saved drafts and exam library.  
* Simple one-click AI usage.  
* Source attribution for authentic/adapted reading texts.

## **2.4 Product promise**

| PositioningExaai should feel like an assistant carrying part of the teacher's workload—not a machine taking ownership of the teacher's exam. |
| :---- |

# **3\. Strategic Product Principles**

| Principle | Implication |
| :---- | :---- |
| Teacher agency | The teacher has final control over every generated component. |
| Structured generation | AI operates within explicit parameters and exam rules. |
| Local relevance | Content should reflect Algerian curriculum/exam expectations. |
| Progressive complexity | The teacher sees only the controls needed for the current step. |
| Recoverability | Generating an alternative must not destroy approved work. |
| Transparency | Sources, marks and generation state should be understandable. |
| Economic sustainability | AI usage must be controlled behind the scenes. |
| Extensibility | Language/exam-specific rules should be configurable. |
| Simplicity | The target user should not need technical AI knowledge. |

## **3.1 Strategic constraint**

| ImportantPricing is not determined. The system should therefore be designed so usage limits, entitlements and AI budgets can be configured without hard-coding a specific subscription model. |
| :---- |

# **4\. User Personas**

| Persona | Needs | Risks/friction | Product response |
| :---- | :---- | :---- | :---- |
| Primary teacher | Create good exams quickly; retain control. | Time pressure; weak AI/technical familiarity. | One-click generation, editable document, alternatives. |
| Power user teacher | Reuse successful tasks and customize heavily. | Repeated manual work. | Favourites, custom tasks, library, versioning. |
| New/less technical teacher | Guidance and simplicity. | Confusion about AI controls. | Constrained dropdowns, progressive workflow, no API keys. |
| Future language teacher | Same productivity model for another foreign language. | Different rules/resources. | Configurable exam schemas and content rules. |

## **4.1 Explicitly out of primary persona scope**

* Students as direct users  
* School administrators  
* Institutional procurement teams  
* Parents  
* Teacher-to-teacher collaboration in V1

# **5\. Core User Journeys**

## **5.1 First-time teacher**

1. Landing page → understand value → register → dashboard.  
2. Dashboard → New Exam.  
3. Select level → grade → stream → length → unit → topic.  
4. Generate Text → review/edit/alternate.  
5. Generate Part One → review/change tasks.  
6. Generate Part Two → review/change tasks.  
7. Generate Written Expression → review/change topics.  
8. Preview → export → save.

## **5.2 Returning teacher**

9. Login → dashboard.  
10. Continue Last Exam or open library.  
11. Resume from the last safe state.  
12. Edit/generate remaining sections.  
13. Export and save.

## **5.3 Replacing a task**

14. Teacher presses Change beside one task.  
15. System opens a replacement panel.  
16. System shows suitable alternatives.  
17. Teacher may later browse Favourites or Custom Tasks.  
18. Teacher chooses one alternative.  
19. Only that task is replaced.  
20. Previous task remains recoverable if version history is enabled.

# **6\. Information Architecture**

| Area | Primary content | Priority |
| :---- | :---- | :---- |
| Public | Landing page; registration; login; password recovery | P0 |
| Dashboard | Library; favourites; Continue Last Exam; New Exam | P0 |
| Exam Builder | Parameters; text; Part One; Part Two; writing | P0 |
| Replacement Panel | AI alternatives; future favourites/custom tasks | P0/P1 |
| Exam Library | Saved drafts/exams; metadata; archive | P0/P1 |
| Profile/Settings | Account and future preferences | P1 |
| Billing | Subscription/entitlement UI | TBD after pricing |
| Admin | Content rules, guides, monitoring, users | Operational requirement |

## **6.1 Navigation principle**

The Exam Builder should be a focused workspace. The teacher should not have to leave the builder to perform ordinary generation, replacement or editing.

# **7\. Screen-by-Screen Specification**

## **7.1 Landing page**

| Element | Requirement | Priority |
| :---- | :---- | :---- |
| Brand | Exaai | Must |
| Hero | Simple, futuristic, Algerian-inspired visual language | Must |
| Core message | Reduce teacher burden while preserving control | Must |
| CTA | Start/Create account | Must |
| Secondary action | Login | Must |
| Language | English initially on current landing-page concept | Must |
| Visual | Green gradient / restrained Algerian influence | Must |

## **7.2 Dashboard**

* Primary action: New Exam.  
* Prominent Continue Last Exam card/action.  
* Recent exam library.  
* Favourites entry point.  
* Draft status should be visually distinguishable from completed exports.  
* Do not overload dashboard with statistics in MVP.

## **7.3 Parameter screen**

| Control | Behavior |
| :---- | :---- |
| Level | Middle / secondary. |
| Grade | Filtered by level. |
| Stream | Filtered by grade/level where applicable. |
| Length | 150 / 250 words according to configured rules. |
| Unit | Configured unit list. |
| Topic | Filtered by unit; custom topic available. |
| Generate Text | Disabled until required parameters are valid. |

# **8\. Exam Builder — Text Stage**

## **8.1 Layout**

* Parameters remain accessible but should not dominate the document workspace.  
* Generated exam content occupies the primary central area.  
* Text is presented as an editable document-like surface.  
* Alternative navigation appears beside the text on desktop and as swipe/arrow navigation on mobile.  
* Source appears at the bottom-right of the text area in the intended exam style.  
* Generate button for Part One is centered below the text.

## **8.2 Text state model**

| State | Meaning | Allowed actions |
| :---- | :---- | :---- |
| Generating | AI request in progress | Cancel if supported; no destructive edits |
| Generated | Candidate text exists | Edit; alternate; accept; regenerate |
| Edited | Teacher modified text | Edit; generate next section |
| Approved | Teacher proceeds using current text | Generate next section; reopen/edit |
| Error | Generation failed | Retry; preserve previous text |

# **9\. Exam Builder — Part One**

## **9.1 Requirements**

* Generating Part One must append/reveal questions below the existing text.  
* The text must remain editable.  
* Each task has marks and a change control.  
* Changing a task must not regenerate other tasks.  
* Alternative tasks must respect the selected exam configuration and official guide.  
* The replacement panel is dismissible.  
* Teacher may manually modify the selected task after replacement.

## **9.2 Replacement panel**

| Panel area | Behavior |
| :---- | :---- |
| Header | Identify the task being replaced. |
| Alternatives | List compatible generated alternatives. |
| Marks | Each candidate displays its mark allocation. |
| Favourites | Dedicated tab/filter when feature is enabled. |
| Custom Tasks | Dedicated tab/filter when feature is enabled. |
| Select | Replace current task only. |
| Dismiss | Close without changing task. |

# **10\. Exam Builder — Part Two: Text Exploration**

## **10.1 Exact product requirement**

| HeadingThe section should display 'B\\ Text exploration' in black, slightly bolded, left-aligned. It should show 08 pts. The initial exam headings must not be repeated. |
| :---- |

## **10.2 Skill categories**

| Skill | Illustrative task families | Rule source |
| :---- | :---- | :---- |
| Vocabulary | Closest meaning; opposite meaning; contextual vocabulary | Official guide/configuration |
| Morphology | Noun/verb/adjective transformations | Official guide/configuration |
| Phonology | Final \-s/-es; final \-ed; other approved sound classification | Official guide/configuration |
| Grammar | Sentence rewriting preserving meaning; other approved grammar tasks | Official guide/configuration |
| Discourse | Gap filling; ordering; cohesion tasks | Official guide/configuration |

## **10.3 Content source**

Tasks may use the unit's general theme and do not need to copy sentences from the reading text. The system should still respect level, curriculum scope and lesson content.

# **11\. Exam Builder — Written Expression**

## **11.1 Two-topic structure**

| Topic | Requirement |
| :---- | :---- |
| Topic 1 — Guided | Same broad theme as exam text; situation \+ writing instruction \+ slash-separated key words. |
| Topic 2 — Free | Different situation/topic as appropriate; no keyword help; writing form determined by guide. |

## **11.2 UI**

* Each topic has Change Topic on its right.  
* Change Topic opens the alternative panel.  
* Alternative topics must remain suitable for the configured exam.  
* Teacher can manually edit both topics.  
* Final workflow exposes Preview and export actions.

# **12\. Design System Requirements**

## **12.1 Visual language**

| Dimension | Direction |
| :---- | :---- |
| Color | Green/white foundation; soft gradients. |
| Mood | Futuristic, calm, capable, premium. |
| Cultural reference | Subtle Algerian geometry/architecture; avoid visual clutter. |
| Typography | Highly legible; document content prioritized. |
| Controls | Rounded but restrained; clear states. |
| Spacing | Generous whitespace. |
| Motion | Subtle transitions; never decorative at the expense of speed. |

## **12.2 Responsive behavior**

* Desktop: multi-column builder where appropriate.  
* Tablet: collapse side controls.  
* Mobile: parameter controls become stacked; alternative text navigation can use arrows/swipe.  
* Replacement panel can become a bottom sheet/full-screen overlay on small screens.  
* Text editing must remain usable without horizontal scrolling.

# **13\. Conceptual Content Model**

The following is a product/data model, not a database technology prescription.

| Entity | Purpose | Key relationships |
| :---- | :---- | :---- |
| User | Teacher account and preferences | Owns exams, favourites, custom tasks |
| Exam | Container for a generated exam | Has configuration, sections and versions |
| ExamConfiguration | Stores selected parameters | Belongs to Exam |
| ExamSection | Text, Part One, Text Exploration, Writing | Belongs to Exam |
| Task | Question/activity | Belongs to section |
| Topic | Writing-expression prompt | Belongs to writing section |
| Generation | Record of an AI operation | Belongs to user/exam/section/item |
| Source | Citation metadata | Associated with generated text |
| FavouriteTask | Reusable saved task | Owned by user |
| CustomTask | Teacher-created reusable task | Owned by user |
| GuideVersion | Versioned exam-rule source | Used by generation configuration |
| Draft | Persistence state | Represents recoverable exam state |

# **14\. Data Model — Conceptual Fields**

## **14.1 User**

| Field | Purpose |
| :---- | :---- |
| User ID | Stable internal identifier. |
| Email | Authentication/contact. |
| Password credential | Managed by secure authentication subsystem; never stored as plaintext. |
| Display name | Optional teacher-facing name. |
| Preferred interface language | English/French. |
| Created/updated timestamps | Audit/lifecycle. |
| Subscription entitlement | Abstract entitlement reference; pricing TBD. |

## **14.2 Exam**

| Field | Purpose |
| :---- | :---- |
| Exam ID | Stable identifier. |
| Owner ID | Private ownership. |
| Title/label | Library display. |
| Status | Draft / active / archived / exported. |
| Configuration | Selected exam parameters. |
| Current revision | Current safe state. |
| Last opened | Continue Last Exam. |
| Created/updated | Library sorting. |

## **14.3 Task**

| Field | Purpose |
| :---- | :---- |
| Task ID | Stable identifier. |
| Section | Part One / Text Exploration. |
| Skill category | Vocabulary, Morphology, etc. |
| Prompt | Question text. |
| Expected answer/configuration | Optional depending on task type. |
| Marks | Point allocation. |
| Source generation ID | Traceability. |
| Manual edit flag | Distinguish AI-generated vs teacher-edited. |

# **15\. State and Revision Model**

## **15.1 Exam lifecycle**

| State | Entry | Exit |
| :---- | :---- | :---- |
| New | Exam created | Parameters saved |
| Draft | Any saved work | Continue/edit/export/archive |
| Active | Teacher currently editing | Save/export/archive |
| Exported | A document has been exported | Reopen/edit/re-export |
| Archived | Teacher removes from active library | Restore if supported |

## **15.2 Item revision principle**

| Safety ruleA new AI generation must be treated as a candidate revision until accepted. It must never silently overwrite the teacher's currently accepted version. |
| :---- |

## **15.3 Alternative generation**

21. Generate candidate alternatives independently.  
22. Display candidates without replacing accepted content.  
23. Teacher selects one.  
24. Selected candidate becomes current revision.  
25. Previous revision remains recoverable if version history is enabled.

# **16\. AI Generation Architecture — Conceptual**

## **16.1 Principle**

The product should not treat AI as one unconstrained prompt. Generation should be orchestrated through configuration, rules, retrieval/source context, generation, validation and teacher approval.

| Stage | Responsibility |
| :---- | :---- |
| Input normalization | Validate teacher parameters. |
| Rule resolution | Resolve applicable exam/grade/unit rules. |
| Context assembly | Prepare curriculum/topic/source context. |
| Generation | Produce candidate content. |
| Validation | Check structure, length, marks, skill and prohibited conditions. |
| Presentation | Show candidate to teacher. |
| Approval | Teacher accepts/edits/replaces. |
| Persistence | Save accepted state and generation metadata. |

## **16.2 Generation types**

| Generation | Inputs | Outputs |
| :---- | :---- | :---- |
| Text | Parameters \+ unit \+ topic \+ source strategy | Passage \+ citation metadata |
| Part One | Approved text \+ exam rules | Tasks \+ marks |
| Text Exploration | Unit \+ lesson scope \+ rules | Skill tasks \+ marks |
| Written Expression | Exam theme \+ writing rules | Guided topic \+ free topic |
| Alternative task | Current task context \+ rules | Replacement candidate |
| Alternative topic | Current topic context \+ rules | Replacement topic |

# **17\. AI Output Validation**

## **17.1 Validation layers**

| Layer | Examples | Failure behavior |
| :---- | :---- | :---- |
| Structural | Required sections, task counts, heading presence | Reject/regenerate candidate. |
| Numeric | Word length, total marks, section marks | Reject/warn before presentation. |
| Curriculum | Level, unit, skill alignment | Reject or flag for teacher review. |
| Language | Grammar/readability appropriate to target | Regenerate or flag. |
| Source | Citation exists and corresponds to retrieved source | Do not fabricate; flag. |
| Safety | No inappropriate content | Reject. |

## **17.2 Validation philosophy**

* Validation should reduce obvious errors before the teacher sees them.  
* Validation should not create a false guarantee of official compliance.  
* Teacher review remains mandatory.  
* When uncertain, the system should surface uncertainty rather than silently inventing a value.

# **18\. Authentic Source and Retrieval Strategy**

## **18.1 Product preference**

The preferred text mode is authentic/adapted source material. Original-only generation may be offered later if source repetition/scarcity becomes a practical issue.

## **18.2 Source metadata**

| Metadata | Purpose |
| :---- | :---- |
| Title | Human-readable source. |
| Author/organization | Attribution. |
| Publication/site | Source identity. |
| URL | Traceability where available. |
| Access/retrieval date | Provenance. |
| Adaptation note | Indicate that the exam text was adapted. |

## **18.3 Mixed sources**

* If a passage combines sources, the system should preserve all underlying source records.  
* Later UI may let the teacher choose which source citation appears at the end of the text.  
* The system should never represent a composite passage as if it came entirely from one source unless that is true.

| Open issueThe exact approved source-retrieval approach, licensing/copyright policy and source allowlist are not yet defined and must be resolved before production source retrieval is finalized. |
| :---- |

# **19\. Exam Rule / Guide Engine**

## **19.1 Why a rule layer is needed**

Because Exaai is intended to support multiple grades, streams and eventually languages, exam rules should not be hard-coded inside individual AI prompts.

## **19.2 Rule categories**

| Rule | Examples |
| :---- | :---- |
| Eligibility | Which grades/streams use a configuration. |
| Length | 150 vs 250 words. |
| Section structure | Required sections and order. |
| Task families | Allowed task types by section. |
| Marks | Required totals and task allocations. |
| Language skills | Which skill categories must appear. |
| Writing formats | Essay, speech, article, etc. |
| Difficulty | Target level constraints. |
| Topic scope | Unit/theme compatibility. |
| Heading templates | Official-style headings/subheadings. |

## **19.3 Versioning**

* Every official guide configuration should have a version.  
* Existing saved exams should retain the guide version used to generate them.  
* Future guide updates should not silently rewrite old exams.  
* Administrators should be able to activate/deactivate guide versions.

# **20\. User Stories — Core**

| ID | Story |
| :---- | :---- |
| US-001 | As a teacher, I want to create an account so I can save my exams. |
| US-002 | As a teacher, I want to start a new exam from my dashboard. |
| US-003 | As a teacher, I want dependent dropdowns so I only see relevant choices. |
| US-004 | As a teacher, I want to suggest my own topic. |
| US-005 | As a teacher, I want to generate a reading text with one click. |
| US-006 | As a teacher, I want to edit the generated text. |
| US-007 | As a teacher, I want alternative texts so I can choose the best one. |
| US-008 | As a teacher, I want the source cited automatically. |
| US-009 | As a teacher, I want to generate Part One without losing my text. |
| US-010 | As a teacher, I want to replace one question without regenerating the others. |
| US-011 | As a teacher, I want to see marks beside each task. |
| US-012 | As a teacher, I want Text Exploration tasks across the required language skills. |
| US-013 | As a teacher, I want replacement tasks aligned with the unit. |
| US-014 | As a teacher, I want two writing topics with different guidance levels. |
| US-015 | As a teacher, I want to replace one writing topic independently. |
| US-016 | As a teacher, I want to save a draft and continue later. |
| US-017 | As a teacher, I want an exam library. |
| US-018 | As a teacher, I want to export my exam to PDF. |
| US-019 | As a teacher, I want Word export so I can manually format further. |

# **21\. User Stories — Advanced / Future**

| ID | Story |
| :---- | :---- |
| US-020 | As a teacher, I want to save a good task as a favourite. |
| US-021 | As a teacher, I want to save my own custom task. |
| US-022 | As a teacher, I want to browse favourites when replacing a task. |
| US-023 | As a teacher, I want AI to simplify or make a passage harder. |
| US-024 | As a teacher, I want to restore an earlier version. |
| US-025 | As a teacher, I want to filter my exam library. |
| US-026 | As a teacher, I want to archive old exams. |
| US-027 | As a teacher, I want to select the displayed citation when a passage uses mixed sources. |
| US-028 | As a teacher, I want to use another foreign language if its exam rules are supported. |
| US-029 | As an administrator, I want to update an exam guide without redeploying the whole product. |
| US-030 | As an operator, I want to monitor AI cost and generation failures. |

# **22\. Acceptance Criteria — Core Features**

## **22.1 Parameters**

* Required fields cannot be submitted empty.  
* Grade choices depend on level.  
* Stream choices depend on the applicable grade/level.  
* Length choices are governed by configured rules.  
* Topic list changes when unit changes.  
* Custom topic can be entered.  
* Invalid combinations are blocked or clearly explained.

## **22.2 Text**

* Generate Text creates a candidate without deleting existing approved text.  
* Text can be edited.  
* Alternative text navigation changes candidate text only.  
* Source metadata is stored with the text.  
* Failure preserves the last accepted text.

## **22.3 Questions**

* Every task has a stable identity.  
* Changing one task does not alter other tasks.  
* Marks are visible.  
* Alternative candidates respect task type and guide rules.  
* Teacher can edit selected task.

# **23\. Edge Cases and Failure Handling**

| Case | Expected behavior |
| :---- | :---- |
| AI timeout | Show retry; preserve current content. |
| AI provider failure | Show user-friendly error; do not expose technical secrets. |
| No suitable source | Do not fabricate citation; offer allowed fallback mode if configured. |
| Source unavailable | Mark source as unavailable and avoid false attribution. |
| Duplicate text | Regenerate or flag similarity if detection is available. |
| Wrong length | Validation rejects or requests correction before approval. |
| Marks exceed total | Warn/block according to configured rules. |
| Teacher closes page | Autosave last safe state if supported. |
| Two tabs edit same exam | Prevent silent overwrite; use revision/conflict handling. |
| Expired entitlement | Preserve existing drafts; restrict new generation according to billing policy. |
| Network loss | Keep local unsaved input where technically practical; show offline state. |
| Custom topic conflicts with unit | Allow if product decision permits, but clearly distinguish teacher topic from system topic constraints. |

# **24\. Security and Privacy Requirements**

* Passwords must be handled by a secure authentication mechanism; never store plaintext passwords.  
* Each teacher must only access their own exams, drafts, favourites and custom tasks.  
* Generation requests must not expose another teacher's private content.  
* Secrets/API credentials must remain server-side or within the chosen secure secret-management approach.  
* Exports must be generated with appropriate access controls.  
* Administrative access must be separated from teacher access.  
* Sensitive operational logs must not contain unnecessary user content.  
* Account deletion should eventually include a defined data-deletion policy.  
* The product should define how AI providers receive teacher/exam content and whether that content is retained.

| Privacy decision requiredThe final privacy policy and AI-provider data-processing terms must be determined before public launch. |
| :---- |

# **25\. Roles and Permissions**

| Role | Capabilities |
| :---- | :---- |
| Teacher | Create/edit/save/export own exams; manage favourites/custom tasks; account settings. |
| Admin | Manage guides, configurations, users and operational content; access must be restricted. |
| Support/operations | Potential limited support role; TBD. |

## **25.1 Ownership**

All teacher-created content is private by default. Sharing/collaboration is a future capability and must not be implied by the MVP.

# **26\. Billing and Entitlement Architecture**

| Business decision pendingThe commercial model is intentionally unresolved. Candidate models are freemium, monthly subscription and annual subscription. The product should be architected around configurable entitlements rather than a hard-coded plan. |
| :---- |

## **26.1 Entitlement concepts**

| Concept | Purpose |
| :---- | :---- |
| Plan | Commercial definition. |
| Entitlement | What a user may do. |
| Generation allowance | AI usage limit. |
| Export allowance | Optional limit. |
| Period | Monthly/annual/etc. |
| Status | Active, trial, expired, cancelled. |

## **26.2 Required future flexibility**

* Change plan limits without code changes where practical.  
* Introduce trials without redesigning the builder.  
* Limit expensive AI operations independently from low-cost actions.  
* Preserve access to previously created exams after a plan changes, subject to final policy.

# **27\. AI Cost Control and Economics**

## **27.1 Product requirement**

The target user should not manage API credits, but the platform must manage them internally.

## **27.2 Controls**

* Track generation cost by operation type.  
* Track retries and failed generations.  
* Avoid regenerating the entire exam when only one task needs replacement.  
* Cache/reuse safe context where technically appropriate.  
* Apply configurable usage limits.  
* Prefer lower-cost model/processing strategies for simple operations if quality remains acceptable.  
* Monitor unusually high usage.

## **27.3 Key metrics**

| Metric | Why |
| :---- | :---- |
| AI cost/user | Unit economics. |
| Cost/exam | Commercial viability. |
| Cost/generation type | Identify expensive workflows. |
| Retry rate | Quality/technical health. |
| Generation success rate | Reliability. |
| Export rate | Value realization. |

# **28\. Product Analytics**

## **28.1 Core events**

| Event | Purpose |
| :---- | :---- |
| signup\_completed | Activation. |
| exam\_created | Workflow entry. |
| parameters\_completed | Funnel. |
| text\_generated | AI usage. |
| text\_alternative\_selected | Alternative usefulness. |
| part\_one\_generated | Progress. |
| task\_replaced | Identify weak generation areas. |
| part\_two\_generated | Progress. |
| writing\_generated | Completion. |
| exam\_saved | Retention/value. |
| exam\_exported\_pdf | Outcome. |
| exam\_exported\_docx | Outcome. |
| generation\_failed | Reliability. |

## **28.2 Product funnel**

Landing → signup → new exam → parameters → text → Part One → Part Two → writing → save/export. The team should measure where teachers abandon the workflow.

# **29\. Operational Monitoring**

| Area | Monitor |
| :---- | :---- |
| Availability | Application errors, downtime. |
| AI | Latency, error rate, retries, cost. |
| Sources | Retrieval failures and unavailable citations. |
| Exports | PDF/DOCX generation failures. |
| Persistence | Save/autosave failures. |
| Authentication | Login failures and suspicious patterns. |
| Billing | Entitlement synchronization failures when billing exists. |

## **29.1 Alerting principle**

Alerts should focus on user-impacting failures and cost anomalies rather than generating excessive operational noise.

# **30\. Content and Guide Administration**

## **30.1 Admin capabilities**

* Create/update exam guide configurations.  
* Version guide configurations.  
* Define grade/stream/length relationships.  
* Define section structures.  
* Define allowed task families.  
* Define mark allocations.  
* Define writing formats.  
* Define topic/unit metadata.  
* Activate/deactivate configurations.

## **30.2 Governance**

| Source of truthGuide configurations must be linked to the official document/version from which they were derived. A product administrator should be able to identify which rules govern a generated exam. |
| :---- |

# **31\. Content Taxonomy**

| Dimension | Examples |
| :---- | :---- |
| Language | English; future French/Spanish. |
| Level | Middle; secondary. |
| Grade | Configured grade values. |
| Stream | Configured stream values. |
| Unit | Curriculum unit. |
| Theme | Broader topic/theme. |
| Skill | Vocabulary; Morphology; Phonology; Grammar; Discourse; Reading; Writing. |
| Task type | Guide-approved task family. |
| Difficulty | Configured target level. |
| Source type | Authentic/adapted; original; mixed if enabled. |

## **31.1 Why taxonomy matters**

A strong taxonomy makes future search, favourites, custom tasks, analytics, generation constraints and language expansion possible without redesigning the product.

# **32\. Testing Strategy**

## **32.1 Test layers**

| Layer | Purpose |
| :---- | :---- |
| Unit tests | Validate isolated business rules. |
| Integration tests | Validate generation orchestration, persistence and export. |
| UI tests | Validate critical teacher workflows. |
| AI evaluation | Measure content quality against a curated test set. |
| Regression tests | Prevent guide/rule updates from breaking previous configurations. |
| Security tests | Authentication, authorization and data isolation. |
| Performance tests | Generation/export/load behavior. |

## **32.2 AI evaluation set**

* Maintain a curated set of representative exam configurations.  
* Include weak/edge configurations.  
* Evaluate structure, marks, level, unit alignment and language quality.  
* Test source attribution separately.  
* Test replacement generation separately from first generation.  
* Re-run evaluation whenever generation rules/models change.

# **33\. QA Checklist — Critical Workflow**

* New user can register.  
* User can log in again.  
* New Exam opens.  
* Level choices are correct.  
* Grade choices respond to level.  
* Stream choices respond to configuration.  
* Length follows configured rule.  
* Unit selection changes topic list.  
* Custom topic works.  
* Generate Text works.  
* Text remains editable.  
* Alternative text navigation works.  
* Source citation is visible and accurate.  
* Generate Part One preserves text.  
* Each task has marks.  
* Change task replaces only that task.  
* Replacement panel dismisses correctly.  
* Part Two uses 08 pts.  
* Part Two does not repeat initial headings.  
* Part Two includes configured skill categories.  
* Written Expression generates two topics.  
* Guided topic uses slash-separated keywords.  
* Free topic has no keyword help.  
* Change Topic replaces only selected topic.  
* Preview works.  
* PDF export works.  
* Word export works if enabled.  
* Draft saves.  
* Continue Last Exam resumes correctly.  
* Library displays saved exams.

# **34\. Accessibility and Usability**

* Use readable contrast for text and controls.  
* Do not communicate important state using color alone.  
* Interactive controls should have clear labels.  
* Keyboard navigation should be considered for desktop.  
* Touch targets should be sufficiently large on mobile.  
* Editing surfaces should support predictable cursor/selection behavior.  
* Loading states should communicate that generation is in progress.  
* Errors should explain what the teacher can do next.  
* The design should avoid excessive motion.

# **35\. Performance Requirements**

## **35.1 Product expectations**

* Navigation between non-AI screens should feel immediate.  
* AI operations must show progress state.  
* Long generation should not freeze the editor.  
* Exports should show progress when they take noticeable time.  
* Autosave should not block editing.  
* Large exams should remain editable without severe UI degradation.

## **35.2 Exact targets**

Exact latency, throughput and availability targets are TBD after the technical architecture and expected user volume are known. The developer should propose measurable targets rather than inventing them.

# **36\. Error and Empty States**

| Situation | User-facing behavior |
| :---- | :---- |
| No exams yet | Explain library is empty \+ New Exam CTA. |
| No favourites | Explain how to save one; do not show a dead panel. |
| Generation loading | Clear progress state \+ preserve editor. |
| Generation failed | Explain that generation failed \+ Retry. |
| Source unavailable | State source cannot currently be verified; do not fabricate. |
| No alternatives | Explain no suitable alternative was found \+ Retry/Edit manually. |
| Export failed | Preserve exam \+ Retry export. |
| Session expired | Save state where possible and request login. |
| Entitlement limit | Explain limit and available next action once pricing is defined. |

# **37\. Mobile-Specific Behavior**

* Parameter dropdowns become stacked controls.  
* Generated text uses the full available width.  
* Alternative texts can be navigated with arrows or swipe.  
* Replacement panel becomes a bottom sheet or full-screen modal.  
* Question Change controls remain close to the relevant task.  
* Editing must not require desktop-only interactions.  
* The final export action remains accessible without excessive scrolling.

# **38\. Expansion Architecture**

## **38.1 Languages**

Potential future languages include French and Spanish, with other languages considered where sufficient resources and replicable exam structures exist.

## **38.2 Subjects**

Additional subjects should only be added where the assessment structure can be modeled reliably and sufficient authoritative resources exist.

## **38.3 Extensibility requirement**

* Language-specific content rules should be configurable.  
* Exam-section definitions should be configurable.  
* Task families should be configurable.  
* Marking structures should be configurable.  
* Source policies should be configurable.  
* Prompt/generation templates should be versioned independently from UI.

# **39\. Future Feature Roadmap — Relative Priority**

| Priority | Feature family | Rationale |
| :---- | :---- | :---- |
| High | Favourites/custom tasks | Reduces repeated teacher work. |
| High | AI rewrite tools | Makes teacher refinement faster. |
| High | Improved library/filtering | Supports repeated use. |
| Medium | Version history | Protects iterative work. |
| Medium | Source selection | Improves citation control. |
| Medium | Additional languages | Expands market if rules/resources permit. |
| Medium | Collaboration | Useful but not required for core value. |
| Lower | Institutional workspaces | Requires larger product model. |
| Lower | Direct printing | Teacher can already print exported files. |
| Expansion | Lesson plans, worksheets, homework, speaking, correction, student portal | Broader education platform after core exam workflow proves value. |

# **40\. Pricing and Algerian Market Research Workstream**

| Not decidedThe founder has explicitly requested that pricing be discussed further rather than assumed. |
| :---- |

## **40.1 Questions to answer**

* What would an Algerian teacher realistically pay monthly?  
* Would teachers prefer a low monthly price or discounted annual plan?  
* Would a free tier be necessary to establish trust?  
* What generation allowance can each plan economically support?  
* Would a paid annual plan reduce payment friction?  
* What payment methods are practical for the target market?  
* What price point balances affordability with AI costs?  
* Should free users have access to the full workflow with limited generations, or a reduced feature set?

## **40.2 Product architecture implication**

Billing should be implemented only after the commercial model is chosen, but the product should expose an entitlement abstraction from the beginning.

# **41\. Recommended Development Phases**

| Phase | Scope | Exit condition |
| :---- | :---- | :---- |
| 0 — Discovery | Validate official guides, exact exam variants, source strategy and technical feasibility. | Rules and content sources identified. |
| 1 — Foundation | Auth, dashboard shell, exam data model, parameter configuration. | User can create/save an empty exam. |
| 2 — Text | Text generation, editing, alternatives, source metadata. | Teacher can produce and approve text. |
| 3 — Part One | Question generation, marks, replacement panel. | Teacher can complete Part One. |
| 4 — Text Exploration | Five skill categories \+ replacement. | Teacher can complete Part Two. |
| 5 — Writing | Two topics \+ replacement. | Complete exam can be assembled. |
| 6 — Persistence | Drafts, Continue Last Exam, library. | Teacher can return to work. |
| 7 — Export | PDF/DOCX depending on chosen implementation. | Teacher can take exam out of Exaai. |
| 8 — Hardening | QA, AI evaluation, security, performance, monitoring. | Launch candidate. |

# **42\. Definition of Done — MVP**

* Critical workflow works end-to-end for supported configurations.  
* No critical data-loss path is known.  
* AI failure does not destroy accepted work.  
* Guide rules are traceable to validated sources.  
* Task marks and section totals are validated.  
* Teacher can manually edit content.  
* Teacher can independently replace tasks/topics.  
* Drafts persist.  
* Library works.  
* PDF export works.  
* DOCX export works if included in the agreed MVP.  
* Critical security/access-control tests pass.  
* Representative AI evaluation set meets agreed quality thresholds.  
* Operational logging/monitoring is available.  
* Open P0 product decisions are resolved.

# **43\. Pre-Launch Checklist**

| Area | Checklist |
| :---- | :---- |
| Product | P0 requirements complete. |
| Content | Official guides validated. |
| AI | Generation and validation evaluated. |
| Sources | Source policy and attribution verified. |
| Security | Authentication/authorization tested. |
| Persistence | Draft recovery tested. |
| Export | PDF and agreed Word behavior tested. |
| UX | Desktop and mobile critical paths tested. |
| Analytics | Core funnel events available. |
| Operations | Monitoring and failure alerts available. |
| Business | Pricing/entitlements decided before billing is enabled. |
| Support | Basic error/help language prepared. |
| Legal | Terms/privacy/source policy reviewed before public launch. |

# **44\. Open Decisions — Must Resolve Before Final Engineering Lock**

| ID | Decision |
| :---- | :---- |
| OD-01 | Exact official guides and exam structures for every launch configuration. |
| OD-02 | Exact middle-school and secondary-school exam variants supported. |
| OD-03 | Whether the latest written-expression CTA wording remains 'Generate Part Two: Written Expression' or is renamed for structural clarity. |
| OD-04 | Exact source retrieval/allowlist/licensing policy. |
| OD-05 | Pricing model: freemium, monthly, annual or combination. |
| OD-06 | AI usage allowances by plan. |
| OD-07 | Google login in V1. |
| OD-08 | DOCX export in V1. |
| OD-09 | Exact mobile editing expectations. |
| OD-10 | Mark-edit behavior and validation. |
| OD-11 | Version-history depth and retention. |
| OD-12 | Account/data deletion policy. |
| OD-13 | AI provider data retention/processing policy. |
| OD-14 | Whether source mode selection is MVP or later. |

# **45\. Technical Architecture Questions for Developer**

* What architecture best supports a responsive teacher-facing SaaS with AI generation?  
* How should generation jobs be handled so the UI remains responsive?  
* How should revisions be represented to avoid accidental overwrites?  
* What is the safest authentication approach?  
* How should private teacher data be isolated?  
* How should AI provider abstraction be implemented?  
* How should guide/rule configurations be stored and versioned?  
* How should source retrieval and citation metadata be persisted?  
* What is the most reliable PDF/DOCX generation strategy?  
* What is the minimum infrastructure needed for an economical MVP?  
* How can the system scale without premature complexity?

| Developer instructionThese are questions to answer during architecture planning, not assumptions embedded in the PRD. |
| :---- |

# **46\. Service / API Boundary Concepts**

Names are conceptual. The developer may implement them differently.

| Boundary | Responsibilities |
| :---- | :---- |
| Authentication | Registration, login, password recovery, sessions. |
| Exam service | Exam lifecycle, configuration, sections, revisions. |
| Generation service | AI requests, prompts/rules, validation, candidates. |
| Content/rules service | Guide versions, units, task families, metadata. |
| Source service | Source retrieval/metadata/citations. |
| Library service | Saved exams, drafts, favourites, custom tasks. |
| Export service | PDF/DOCX generation. |
| Entitlement service | Plan/usage checks once pricing exists. |
| Analytics/telemetry | Product and operational events. |

# **47\. Prompt and Generation Configuration Versioning**

* Generation templates should be versioned.  
* Exam guide versions should be versioned.  
* Validation rules should be versioned.  
* A saved exam should retain enough metadata to identify which configuration produced it.  
* Changing a prompt should not silently change existing exams.  
* AI evaluation should be rerun when material generation logic changes.

# **48\. Data Retention and Lifecycle**

| Data | Default direction | Final decision |
| :---- | :---- | :---- |
| Draft exams | Retain until teacher deletes/archives or policy limit | TBD |
| Completed exams | Retain in library | TBD |
| Archived exams | Retain separately | TBD |
| Generation metadata | Retain enough for troubleshooting/analytics | TBD |
| AI request content | Minimize retention where possible | TBD |
| Source metadata | Retain with exam for citation integrity | Recommended |

## **48.1 Principle**

Retention should support teacher continuity without creating unnecessary storage or privacy exposure.

# **49\. Support and User Education**

* The product should explain generation actions in plain language.  
* Errors should tell teachers what to do next.  
* A lightweight help area may explain how the workflow works.  
* Technical concepts such as API keys should not be part of teacher-facing documentation.  
* Support should be able to identify an exam/generation failure without exposing unnecessary private content.

# **50\. Product Risk Register**

| Risk | Impact | Mitigation |
| :---- | :---- | :---- |
| AI produces poor exam tasks | High | Guide-aware generation \+ validation \+ teacher replacement. |
| Source scarcity/repetition | High | Authentic/adapted source strategy \+ later source modes. |
| AI operating cost too high | High | Usage controls, cost monitoring, plan limits. |
| Teachers distrust AI | Medium/High | Teacher control, editable output, transparent sourcing. |
| Official rules change | High | Versioned rule engine. |
| Wrong marks/structure | High | Validation against guide configuration. |
| Technical complexity grows too early | Medium | MVP focus; technology-agnostic architecture. |
| Mobile editing is difficult | Medium | Responsive design and mobile-specific interaction. |
| Pricing mismatch | High | Market research before billing lock. |

# **51\. Success Metrics**

## **51.1 Primary**

* Time from New Exam to saved/exported exam.  
* Percentage of started exams reaching completion.  
* Percentage of users returning to Continue Last Exam.  
* Average number of manual replacements per exam.  
* Exam export rate.

## **51.2 Quality**

* Teacher acceptance rate of generated text.  
* Teacher acceptance rate of first-generation tasks.  
* Replacement rate by task category.  
* Source citation correction rate.  
* AI generation failure rate.

## **51.3 Business**

* Activation rate.  
* Free-to-paid conversion once billing exists.  
* AI cost per active user.  
* Revenue per active paid user.  
* Retention.

# **52\. Product Experiments — Later**

* Test guided onboarding versus direct New Exam.  
* Test different hero messages.  
* Test freemium limits.  
* Test whether teachers prefer more AI alternatives or fewer high-quality alternatives.  
* Test whether favourites are used enough to justify a dedicated prominent dashboard area.  
* Test source mode selection.  
* Test mobile-first versus desktop-first builder refinements.

# **53\. Final Product Blueprint**

The intended V1 experience can be summarized as follows:

26. Teacher arrives at Exaai and immediately understands that the product is designed to reduce exam-preparation burden.  
27. Teacher registers/logs in without dealing with AI technicalities.  
28. Dashboard shows saved work and Continue Last Exam.  
29. Teacher starts a New Exam and chooses constrained parameters.  
30. Exaai generates an editable, source-attributed text.  
31. Teacher can switch between suitable alternatives.  
32. Teacher generates Part One and replaces individual tasks where needed.  
33. Teacher generates B\\ Text exploration (08 pts), covering the configured language skills.  
34. Teacher replaces weak tasks using unit-aware alternatives.  
35. Teacher generates two written-expression topics: guided with slash-separated keywords and free without help.  
36. Teacher changes topics individually if needed.  
37. Teacher reviews the complete exam.  
38. Teacher previews and exports the document.  
39. Exam is saved for future access.

| Core experienceThe product succeeds when a teacher feels: 'I did not have to do everything myself, but I still feel that this is my exam.' |
| :---- |

# **54\. Implementation Handoff Summary**

| Workstream | First deliverable |
| :---- | :---- |
| Product | Resolve open P0 decisions. |
| Content | Collect and validate official guides. |
| Design | Finalize responsive screen specifications. |
| Engineering | Propose architecture and data model. |
| AI | Design generation \+ validation pipeline. |
| Sources | Define source retrieval/attribution policy. |
| QA | Build representative exam test set. |
| Operations | Define logging, monitoring and cost tracking. |
| Business | Research Algerian pricing and payment expectations. |

## **54.1 Immediate next step**

Before coding the full system, the highest-value activity is to lock the exam rules and source-of-truth materials. The developer can then map the rule model to the screen flow and generation pipeline.

# **Appendix A — Current Screen Sequence Reference**

| Screen | Stage | Required visible behavior |
| :---- | :---- | :---- |
| 1 | Parameters | Dropdowns for level, grade, stream, length, unit and topic/custom topic. Generate Text. |
| 2 | Text | Official-style exam headings; editable text; alternate text navigation; source citation; Generate Part One. |
| 3 | Part One | Tasks \+ marks \+ Change. Alternative panel. Generate Part Two. |
| 4 | Text Exploration | B\\ Text exploration; 08 pts; five configured skill areas; Change; Generate Part Two: Written Expression. |
| 5 | Written Expression | Guided topic \+ slash-separated keywords; free topic; Change Topic on both; Preview/export. |

# **Appendix B — Current Terminology**

| Term | Definition |
| :---- | :---- |
| Exaai | Product/brand. |
| Teacher | Primary user. |
| Exam | Complete generated/edited document. |
| Text | Reading passage. |
| Task | Individual exam activity/question. |
| Alternative | Candidate replacement. |
| Text Exploration | Part Two of the exam. |
| Written Expression | Final writing section. |
| Guide | Official/ministry exam structure/rules. |
| Source | External origin of adapted/authentic text. |
| Draft | Saved incomplete exam. |
| Favourite | Teacher-saved reusable task. |
| Custom Task | Teacher-created reusable task. |

# **Appendix C — Product Decisions Already Made**

* Product name: Exaai.  
* Primary users: English teachers.  
* Market: Algeria initially.  
* Interface languages: English and French.  
* Initial learner levels: middle and secondary school.  
* English first; French, Spanish and other languages later if feasible.  
* Other subjects only if their structure/resources make the model sufficiently replicable.  
* One-click Exaai AI; no teacher API-key workflow.  
* Prefer authentic adapted sources.  
* Automatic source citation.  
* Teacher can edit text, questions, marks and other generated content where practical.  
* Favourites and custom tasks are desired.  
* Draft saving, archiving and library are desired; advanced organization can wait.  
* PDF and Word export are desired.  
* Direct in-app printing is removed from initial scope.  
* AI rewrite capabilities are desired.  
* Version history is desired if not demanding.  
* Collaboration is a later idea.  
* Dashboard must include Continue Last Exam.  
* Landing page should be simple, English, futuristic, Algerian-inspired and gradient-based.

# **Appendix D — Product Decisions Intentionally NOT Made**

* Pricing model.  
* Exact subscription prices.  
* Payment provider.  
* Exact AI provider/model.  
* Technology stack.  
* Exact official guide documents and versions.  
* Exact source retrieval mechanism.  
* Exact launch exam variants.  
* Exact Word export implementation.  
* Exact retention periods.  
* Exact AI usage limits.  
* Exact mobile launch scope.  
* Exact legal/copyright policy.

| RuleDevelopers should ask rather than infer when an unresolved decision materially affects architecture, cost, user experience or compliance. |
| :---- |

# **Appendix E — Final Acceptance Matrix**

| Feature | Acceptance statement | Priority |
| :---- | :---- | :---- |
| Authentication | Teacher can create and access account. | P0 |
| Dashboard | Teacher sees library and Continue Last Exam. | P0 |
| Parameters | All required dependent dropdowns work. | P0 |
| Text | Generated text is editable and source-attributed. | P0 |
| Alternatives | Teacher can switch text candidate. | P0 |
| Part One | Guide-governed tasks \+ marks. | P0 |
| Task replacement | One task changes independently. | P0 |
| Text Exploration | Five skill categories \+ 08 pts. | P0 |
| Writing | Guided \+ free topics. | P0 |
| Topic replacement | One topic changes independently. | P0 |
| Drafts | Teacher can save/resume. | P0 |
| Library | Saved exams accessible. | P0 |
| PDF | Export works. | P0 |
| Word | Export works if included in MVP. | P0/P1 |
| Security | Private user data isolated. | P0 |
| AI validation | Basic structure/marks/source checks. | P0 |
| Analytics | Critical workflow events recorded. | P1 |
| Monitoring | Operational failures visible. | P1 |

