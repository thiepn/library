---
id: why-ai-can-sound-certain-and-be-wrong
order: 2020
title: "Why AI Can Sound Certain and Be Wrong"
part: understanding-and-discerning-ai
status: published
description: "Chapter 9: Why AI Can Sound Certain and Be Wrong."
estimatedMinutes: 7
---
Human beings use fluency as evidence. We trust the person who explains something clearly, remembers details, uses the right vocabulary, and answers without hesitation. In ordinary conversation, these cues often correlate with competence.

Generative AI breaks that correlation. A language model can produce an answer whose tone, grammar, structure, and confidence are nearly perfect even when the underlying claim is false. NIST uses the term *confabulation* for confidently generated erroneous or fabricated content, including invented sources and citations. The failure is not a strange exception to language generation. It follows from the fact that the system is optimized to generate an appropriate continuation, not to maintain an internal moral commitment to truth.[^1]

This does not mean models are unreliable in every domain. Many tasks are highly reliable. Summarizing a supplied paragraph, reformatting a table, generating alternative wording, or extracting obvious entities may work extremely well. Reliability should be judged according to task and consequence rather than by one global opinion of “AI accuracy.”

Confabulation becomes dangerous when users mistake presentation quality for evidentiary quality. A model may invent a scholarly article with a plausible title, journal, volume, pages, and DOI-like string. To a reader unfamiliar with the field, the citation looks exactly like scholarship. The problem is not merely factual error. It is counterfeit verification.

Christian ministries should take this especially seriously because religious communication often trades on trust. A fabricated quotation attributed to a theologian, missionary, church father, or persecuted believer can travel rapidly because audiences assume ministries have verified what they publish.

Verification should therefore depend on consequence. Low-consequence ideation does not require the same process as public theological teaching. If a volunteer asks AI for ten possible names for a youth event, extensive verification is pointless. If a pastor asks for the exact wording and source of a historical quotation, the quotation must be checked against the original or a reliable edition.

This principle prevents two opposite errors. One is naïve trust: accepting fluent output because the model is usually good. The other is verification theater: requiring burdensome review for trivial tasks until staff quietly bypass the policy.

The most common reliability mistake is asking the system to do several epistemic jobs at once. A user says, “Research this topic, decide which sources are credible, synthesize them, and tell me the answer.” The result collapses discovery, evaluation, interpretation, and judgment into one polished paragraph. A stronger workflow separates them.

First discover possible sources. Then locate the actual sources. Then inspect what they say. Then synthesize. Finally decide what the evidence supports.

AI can participate in every stage. It should not hide the stages. Retrieval helps because the model can ground its answer in supplied documents. But grounding is not the same as truth. Imagine a church assistant retrieves a doctrinal statement correctly and then answers a question using language the statement never supports. The source is real. The inference is wrong.

The same problem occurs in mission research. A system can retrieve accurate population estimates and produce an unjustified ranking of missionary priorities. The input data may be legitimate; the decision rule may not be.

Verification therefore asks two questions: Is the evidence real? Does the evidence support the claim?

Statistics deserve special caution. AI systems are excellent at presenting numbers with precision. A figure like 0.37 percent appears authoritative. Mission datasets often contain estimates derived from incomplete reports, different counting systems, or old data. The model can preserve the decimal while losing the uncertainty.

The correct response is not to abandon statistics. It is to carry methodology with the number. “Joshua Project's August 2026 by-country dataset classified…” is more truthful than “There are exactly…” because it tells the reader what kind of claim is being made.[^2]

Legal and policy questions require another kind of verification. A model may summarize a law accurately but use an outdated version. It may generalize U.S. copyright doctrine globally. It may confuse organizational policy with legal obligation. Current law, regulation, and security guidance should be checked against current authoritative sources.

Bible and theology questions introduce additional complexity. A model can quote Scripture accurately and still present one contested interpretation as obvious. It can combine elements of several traditions into a synthetic answer that belongs fully to none. It can produce a sermon that sounds orthodox while introducing a subtle exegetical mistake.

This is why theological fluency should not be equated with theological reliability. The relevant reviewer is not merely someone who can tell whether the prose sounds Christian. It is someone competent enough to judge the underlying interpretation.

Language work provides a parallel example. A missionary may receive a translation that is semantically understandable but socially wrong: too formal, too intimate, regionally marked, or subtly insulting. The model's fluency can conceal the need for a target-language reviewer.

Reliability also changes over time. A system that fails today may improve next year. A benchmark result from early 2025 may become a poor guide to late-2026 agents. This volatility is one reason the book avoids turning current product performance into theological principle.

A mature verification system should therefore preserve both confidence and humility. Christians should use AI for tasks where it is extremely effective. They should not allow good performance in one domain to become generalized trust in another.

The verification levels used later in this book formalize the idea: V0 for low-consequence ideation where ordinary judgment is sufficient. V1 for surface review. V2 for explicit factual checking. V3 for qualified domain review. V4 for independent or dual review in high-consequence contexts. V5 for formal approval processes such as final Scripture translation, official doctrine, or safeguarding decisions.

The levels are not a universal law. They make one principle operational: required verification should rise with consequence.

Users can also improve reliability by changing the task. Ask the model to state uncertainty. Require it to quote the supplied source rather than rely on memory. Ask for competing interpretations. Separate factual claims from recommendations. Use deterministic tools for arithmetic. Build retrieval over approved materials. Restrict the domain.

These techniques are useful, but none eliminates responsibility. A well-engineered system lowers the burden of verification; it does not make consequential truth self-authenticating.

This is where Christian ethics enters more directly. Chapter 9 is about the technical fact that AI can be wrong while sounding right. The deeper question is what Christians owe others when they communicate in that environment.

## Why Plausible Language Can Be False {#why-plausible-language-can-be-false}

Not all AI error is confabulation. A system can fail because it misunderstood the instruction, retrieved the wrong source, applied a rule inconsistently, lacked necessary context, used outdated information, performed a calculation incorrectly, or generated a fabricated claim.

The distinction matters because remedies differ. If the model lacks current information, retrieval may help. If it ignores policy, stronger system instructions or workflow constraints may help. If the task requires deterministic arithmetic, use a calculator tool. If the problem is missing local knowledge, no amount of prompt refinement can substitute for asking local people. Treating every failure as “hallucination” produces vague governance.

## The Special Problem of Sources {#the-special-problem-of-sources}

Invented citations deserve special attention because they mimic the infrastructure of verification. A false factual sentence may trigger skepticism. A false factual sentence followed by a plausible journal citation can suppress skepticism.

This is particularly dangerous in theology and mission research, where many readers cannot instantly recognize whether an obscure article or historical source exists.

The safest workflow is to treat model-generated citations as search leads until the source is located independently. A citation that cannot be found does not become more credible because the title sounds right.

## Confidence Is Not Calibration {#confidence-is-not-calibration}

Language models often fail to calibrate linguistic confidence with factual confidence. They may use the same tone for a well-established fact and a speculative reconstruction.

Users should therefore ask systems to expose uncertainty structurally: separate known facts from assumptions, list source support, identify missing information, or offer alternative interpretations.

These techniques help but should not be mistaken for internal honesty. The model is generating an uncertainty representation because the workflow requests one. The human remains responsible for deciding whether that representation is credible.

## Designing for Verification {#designing-for-verification}

If verifying an AI-generated artifact takes longer than creating the artifact manually, automation may not be useful.

This is one reason current productivity evidence varies. The cost of generation can fall while review cost rises.

Organizations should measure end-to-end time rather than generation time alone. For high-consequence tasks, the value may not be speed. AI may improve breadth, consistency checking, or alternative generation while leaving final review time unchanged.

Humility can be operationalized. Date volatile statistics. Attribute organizational claims. Mark hypotheses. Preserve dissenting interpretations. Record source status. Encourage staff to say “I don't know.”

These practices counter the confident surface of generative systems. A ministry that normalizes uncertainty language becomes harder to manipulate by synthetic certainty.

[^1]: Autio et al., *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*
[^2]: The example is intentionally methodological: live mission datasets change and should be cited by date and counting system; see Joshua Project, “People Groups: Counts.”
