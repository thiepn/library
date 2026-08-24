---
id: what-should-we-delegate-to-ai
order: 6010
title: "What Should We Delegate to AI?"
part: governing-ai-faithfully
status: published
description: "Chapter 31: What Should We Delegate to AI?."
estimatedMinutes: 4
---
> • The same AI system can occupy radically different roles.
>
> • It can suggest an email.
>
> • Write the email.
>
> • Choose the recipient.
>
> • Send it.
>
> • Monitor the response.
>
> • The underlying model may barely change. The delegated authority changes completely.
>
> • Governance should therefore begin with delegation rather than brand name.

## Delegation Changes the Governance Problem {#delegation-changes-the-governance-problem}

Delegation does not require the human to touch every output. Organizations already delegate to software constantly: spam filters classify mail, accounting systems calculate, schedulers send reminders. AI adds uncertainty and broader action, but the governance problem remains one of authorized responsibility.

The relevant question is whether the organization has designed supervision appropriate to consequence. L3 workflow automation can be entirely responsible when tasks are bounded, monitored, and reversible.

> • Three operating modes keep governance proportionate.
>
> • Quick: ordinary low-risk individual use.
>
> • Managed: recurring or public workflows with named review.
>
> • Formal: high-consequence, sensitive, agentic, or protected uses.

Most daily AI work should remain Quick. Governance succeeds when staff recognize the minority of cases that need escalation.

## The Delegation Ladder[^1] {#the-delegation-ladder}

L0 — No AI. The task remains intentionally human because AI adds insufficient value, creates unacceptable risk, or interferes with protected responsibility or formation.

L1 — Assistance. AI suggests ideas, questions, critique, or information. The human performs the consequential work.

L2 — Acceleration. AI performs a substantial bounded task—translation draft, research synthesis, report draft, code draft—and a person reviews before consequential use.

L3 — Workflow Automation. AI performs a repeated bounded process without approval of every individual output. Humans supervise the system and handle exceptions.

L4 — Delegated Agency. AI receives authority to act externally—send, publish, modify, schedule, purchase, or invoke tools—without individual approval for every action.

The default principle is to use the lowest level that captures most of the legitimate benefit.

**Figure 31.1.** *AI Delegation Ladder*

| L0  | No AI               |
|-----|---------------------|
| L1  | Assistance          |
| L2  | Acceleration        |
| L3  | Workflow automation |
| L4  | Delegated agency    |

> Use the lowest delegation level that captures most legitimate benefit. More authority requires more explicit governance.

## Risk, Overrides, and Protected Responsibilities {#risk-overrides-and-protected-responsibilities}

> • Delegation level is not the whole risk.
>
> • Evaluate consequence, autonomy, reversibility, vulnerability, data sensitivity, and theological or relational significance.
>
> • Then place the workflow in an operational category:
>
> • Low.
>
> • Managed.
>
> • High.
>
> • Critical.
>
> • The category is a judgment, not a calculation.
>
> • Some conditions should escalate a workflow regardless of otherwise low risk:
>
> • Safeguarding
>
> • D5 high-risk data
>
> • Severe pastoral crisis
>
> • Final Scripture approval
>
> • Official doctrinal authorization
>
> • Irreversible high-consequence autonomous action.
>
> • This prevents risk averaging.
>
> • AI may inform responsibility without inheriting responsibility.
>
> • Official doctrine remains owned by accountable Christian bodies.
>
> • Final Scripture approval remains inside the authorized translation process.
>
> • Safeguarding and church discipline do not become autonomous AI functions.
>
> • Sensitive pastoral authority and missionary calling remain strongly human-owned.
>
> • The same workflow can move categories when context changes.

Automatic translation of a public event notice may be Low. Automatic translation of a public theological statement may be Managed or High. Automatic translation of a sensitive testimony from a persecuted believer may become Critical because of data, even if the language task is simple.

This is why task and data must be evaluated separately. Protected responsibility does not necessarily mean L0 No AI. A safeguarding leader may use AI to organize public policy information. A doctrinal committee may use it to compare texts. A translation consultant may use it to find consistency problems. The protected boundary concerns final accountable authority.

**Figure 31.2.** *Mission AI Risk Matrix*

| RISK FACTOR                           | LOW | MANAGED | HIGH | CRITICAL |
|---------------------------------------|-----|---------|------|----------|
| Consequence                           |     |         |      |          |
| Autonomy                              |     |         |      |          |
| Reversibility                         |     |         |      |          |
| Vulnerability                         |     |         |      |          |
| Data sensitivity                      |     |         |      |          |
| Theological / relational significance |     |         |      |          |

> Assess the whole workflow. A critical override can govern the result regardless of the other factors.

**Table 31.1.** *Mission Data Classification: D1-D5*

| **Class** | **Meaning**                           | **Default AI posture**                                                            |
|-----------|---------------------------------------|-----------------------------------------------------------------------------------|
| D1        | Public                                | Ordinary approved use                                                             |
| D2        | Internal                              | Use with organizational controls                                                  |
| D3        | Confidential                          | Approved provider + minimization                                                  |
| D4        | Sensitive ministry                    | High caution; strong controls                                                     |
| D5        | High-risk identity / persecution data | No ordinary third-party upload; secure local only after threat model and approval |

**Table 31.2.** *Verification Levels: V0-V5*

| **Level** | **Review requirement**                    |
|-----------|-------------------------------------------|
| V0        | Ordinary judgment for low-consequence use |
| V1        | Surface review                            |
| V2        | Factual verification                      |
| V3        | Qualified domain review                   |
| V4        | Dual or independent review                |
| V5        | Formal authorized approval                |

**Table 31.3.** *Protected Responsibilities and Permitted AI Roles*

| **Responsibility**           | **AI may assist with**                  | **AI may not inherit**                   |
|------------------------------|-----------------------------------------|------------------------------------------|
| Doctrine                     | Research, comparison, drafting          | Final doctrinal authority                |
| Scripture approval           | Terminology, checking, drafting support | Final translation approval               |
| Safeguarding                 | Triage support, documentation           | Final safeguarding decisions             |
| Church discipline            | Research, records, preparation          | Ecclesial judgment                       |
| Sensitive pastoral authority | Information, preparation, escalation    | Pastoral office / final crisis authority |
| Missionary calling           | Reflection, planning                    | Divine or ecclesial authorization        |

## Ceilings, Handoffs, and Reversibility {#ceilings-handoffs-and-reversibility}

A user should not supervise a consequential AI task they fundamentally cannot evaluate.

A non-programmer can prototype software. Security-sensitive deployment may still require an engineer. A missionary can generate a translation. Public theological material may still require qualified language and theological review.

Organizations should not automate beyond their governance capacity. A ministry with no data classification, incident process, staff training, or clear ownership should not begin by granting agents broad external permissions.

Systems interacting with people should define when automation stops. Handoff is not evidence that AI failed. It is part of good architecture.

Early automation should favor tasks where mistakes can be undone. Misclassifying a public document is different from exposing a persecuted believer's identity. The Delegation Ladder and qualitative risk matrix together provide a practical governance hinge for the rest of the book.

Reversibility is often neglected because teams focus on probability of error. A rare irreversible error can deserve stronger controls than a frequent trivial one.

Publishing a typo is easy to correct. Sending sensitive data to the wrong recipient may not be. Design automation around the cost of undoing mistakes.

[^1]: The delegation ladder, qualitative risk matrix, D1–D5 data classes, and V0–V5 verification levels are author-created normative tools. They are not presented as experimentally validated scoring instruments; compare Tabassi, *Artificial Intelligence Risk Management Framework (AI RMF 1.0).*; Autio et al., *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*
