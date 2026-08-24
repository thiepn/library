---
id: what-ai-actually-does
order: 2010
title: "What AI Actually Does"
part: understanding-and-discerning-ai
status: published
description: "Chapter 8: What AI Actually Does."
estimatedMinutes: 9
---
Artificial intelligence is easier to use than to describe. A person opens a chat window, asks a question, and receives something that looks like an answer. The conversational surface makes a complicated technical system feel like a single intelligent partner.

For Christian discernment, that surface is not enough. Users do not need to become machine-learning engineers, but they do need a mental model accurate enough to predict common strengths and failures.

Modern generative language systems are built from models trained to learn statistical patterns in large collections of language. Transformer architectures made it possible to model relationships across sequences with unusual effectiveness, and subsequent scaling, instruction tuning, reinforcement methods, retrieval systems, and tool integration produced systems that can perform many tasks through ordinary language.[^1]

At the user level, the most important fact is simple: a language model generates likely continuations conditioned on the information available to it. It does not retrieve a fully formed answer from an internal encyclopedia. Nor does every sentence correspond to a stored sentence in training data. The model constructs an output from learned patterns.

This helps explain both capability and failure. Language contains enormous amounts of encoded human knowledge. A model that becomes good at predicting language can also become useful at summarizing, explaining, translating, classifying, drafting, coding, and reasoning through many structured problems. But the same generative process can produce plausible statements for which no real evidence exists.

The model itself is only one component of many contemporary AI systems. Retrieval systems add external information. Instead of relying entirely on patterns learned during training, the system searches a specified collection, fetches relevant material, and supplies it to the model. This can dramatically improve usefulness for church policies, theological libraries, organizational documentation, or current information.

Retrieval does not guarantee truth. The wrong document can be retrieved. A passage can be interpreted badly. A correct quotation can be connected to an unsupported conclusion. Users should therefore distinguish retrieval from verification.

Tools add another layer. A model may be connected to a calculator, code interpreter, search engine, database, email system, calendar, or file store. Tool use allows the system to perform operations it would otherwise approximate in language.

This distinction matters practically. Asking a model, “What is 7,834 multiplied by 6,219?” and asking a system that invokes a calculator are not identical workflows. One relies on the model's generated answer. The other can execute a deterministic operation. The interface may look the same.

Agents combine models with goals, tools, memory or state, and repeated decision loops. Instead of responding once, an agent may plan several steps, call tools, inspect the result, revise the plan, and take another action. The relevant governance question then shifts from answer quality toward authority and permissions.[^2]

Multimodal systems extend these capabilities beyond text. They can process images, audio, speech, and video; generate media; transcribe recordings; describe scenes; and combine modalities in a single workflow. For mission, this is especially important because many communities are more oral than text-centered and because accessibility cannot be reduced to written translation.

Users should also distinguish training knowledge from current information. A model trained on past data does not automatically know what happened yesterday. Current information may be supplied through search, retrieval, connected systems, or later training. This is why a fluent answer about a current law, mission statistic, product capability, or political event requires current verification even when the system sounds certain.

Context is another practical concept. A system answers using the information made available in the current interaction: system instructions, user messages, uploaded documents, retrieved text, tool outputs, and possibly stored memory. The model does not possess unlimited access to everything a user has ever said or every file the organization owns unless the surrounding system provides that access.

This is good news for governance. AI capability is partly architectural. A church does not need to ask only, “How smart is the model?” It can ask, “What documents can this system retrieve? What tools can it call? What data can it see? What actions can it take?” Those are often more actionable questions.

The distinction between model and system also prevents anthropomorphic confusion. A model can be improved without changing the application around it. The same model can be placed inside a tightly constrained Bible-study assistant, an open-ended companion app, an internal translation tool, or an agent with permission to send email. The risks differ radically because the system differs.

Another important concept is probabilistic output. Generative systems can produce different responses to similar prompts. Variation is useful for brainstorming, drafting, and creative work. It complicates auditing and reproducibility. A ministry relying on consistent classification or high-stakes decision support should test behavior across many representative cases rather than assuming one successful demonstration establishes reliability.

AI systems also reflect the data and evaluation environments from which they are built. High-resource languages tend to receive more training data, better benchmarks, more user feedback, and stronger commercial attention. The result is uneven capability. A system described as multilingual may perform extremely well in English, adequately in a major regional language, and poorly in a low-resource language or dialect.

This is why benchmark headlines need context. A score on a general English reasoning test tells a missionary little about theological translation into a minority language. A coding benchmark tells little about maintaining a sensitive offline ministry application. Performance is task-specific.

The same applies to intelligence language. A model may exceed most humans at a narrow benchmark while lacking stable competence in a related real-world workflow. It may produce an excellent explanation and then fabricate a citation. It may reason through a difficult abstract problem and mishandle a simple instruction because the context changed.

Christians therefore do not need either mystical or dismissive language. AI is not “just autocomplete” if that phrase is used to deny the substantial capabilities emerging from learned language patterns, tools, and planning. Nor is it a digital mind whose every fluent statement should be treated as testimony from an informed person.

A useful mental model is layered. At the base is the model: pattern-based generation and prediction. Around it may sit retrieval: external information. Then tools: deterministic or connected operations. Then orchestration: instructions, policies, memory, and workflow. Then permissions: what the system may access and do. Finally there is the human and organizational environment: who uses it, who reviews it, what consequences matter, and who bears responsibility.

Most ministry failures will not be explained by one layer alone. A fabricated statistic may be a model problem, a missing-retrieval problem, or a verification problem. A data exposure may involve permissions, architecture, or user behavior. An unhealthy pastoral interaction may involve the model's language, the product's relational design, the absence of handoff, and a vulnerable user's circumstances.

This layered understanding is enough for ordinary Christian AI literacy. Users do not need to know how to train a transformer from scratch. They do need to know that generation is not verification, retrieval is not authority, tool use changes reliability, agentic permissions change consequence, and capability varies sharply by task and language.

Once those distinctions are clear, the next problem becomes easier to name. A system can produce language that is fluent, relevant, and wrong.

## From Models to Systems {#from-models-to-systems}

Large language models do not simply store more phrases as they grow. Training at scale can produce capacities not easily predicted from small examples: stronger in-context learning, code generation, cross-lingual transfer, planning behavior, and structured reasoning under certain prompts.

Users do not need a technical theory of emergence to draw a practical conclusion. Capability profiles can change discontinuously enough that old assumptions become stale quickly.

A ministry that evaluated AI in 2023 and concluded it was useless for translation or coding should not assume that judgment remains current. A ministry that found a model reliable in 2026 should not assume future versions will preserve the same behavior either.

Governance should be stable at the level of principles and flexible at the level of capability assumptions.

**Table 8.1.** *What Different AI Components Actually Do*

| **Component** | **Primary function**                         | **Human responsibility**            |
|---------------|----------------------------------------------|-------------------------------------|
| Model         | Generates or predicts from learned patterns  | Define purpose; evaluate output     |
| Retrieval     | Fetches external information for context     | Choose sources; verify relevance    |
| Tools         | Connects the system to external functions    | Limit permissions; review actions   |
| Agent         | Pursues multi-step goals through tools       | Set boundaries, approvals, logs     |
| Human role    | Provides judgment, authority, accountability | Retain consequential responsibility |

## Generation, Retrieval, and Tools {#generation-retrieval-and-tools}

Retrieval-augmented systems are particularly attractive for churches because they offer a way to constrain answers toward reviewed materials.

A church can index its doctrinal statement, sermon archive, membership information, policies, and public resources. A theological school can index assigned readings. A mission organization can index operational documentation.

The advantages are significant: traceable source material, current organizational information, and reduced dependence on the model's generalized training knowledge.

The limitations are equally important. Retrieval quality depends on document preparation, chunking, search, permissions, and query interpretation. A relevant paragraph can be missed. An irrelevant one can be ranked first. A model can overstate what a retrieved source implies.

Retrieval is an epistemic aid, not a transfer of authority. Users often treat every customization method as “training the AI.” The distinctions matter.

Prompting changes current instructions and context. Retrieval supplies external information. Fine-tuning adjusts model behavior through additional training examples. Tool integration gives the system external capabilities. These mechanisms have different governance implications. A ministry can update a retrieval library quickly when policy changes. A fine-tuned model may require a new training cycle. Tool permissions create action risks no prompt alone creates. Clear vocabulary helps leaders ask the right questions without becoming engineers.

## Context, Memory, and Multimodality {#context-memory-and-multimodality}

Multimodal systems are especially relevant to mission because many ministries work with photographs, scanned documents, speech, video, and handwritten or low-quality source material.

Vision can assist OCR, image description, and document analysis. Speech systems can support transcription and translation. Video generation can reduce production cost.

Each modality also introduces distinct error and consent issues. A speech transcript can mishear names. OCR can corrupt Scripture text. Image analysis can infer sensitive location or identity information. Synthetic video can blur documentary expectations. “AI” is therefore not one risk category. The workflow matters.

## Evaluation in a Moving Field {#evaluation-in-a-moving-field}

Organizations deploying recurring AI workflows should build small representative test sets. A translation team can collect difficult sentences. A church chatbot can collect common doctrinal questions and high-risk edge cases. An agent can be tested against hostile or ambiguous inputs.

Evaluation sets make reliability concrete. They also allow teams to compare model or provider changes without relying on impressions.

A church does not need a research laboratory to practice disciplined evaluation. Twenty well-chosen cases can be more useful than one dazzling demo.

Recurring ministry workflows should be tested on representative cases rather than judged by one successful demonstration. The long-term test is what grows around the tool. The ministry may gain speed while losing understanding, or it may use speed to create margin for better judgment and relationship. Success should therefore be evaluated over time through competence, accountability, resilience, and service rather than through the first impressive demonstration.

[^1]: Vaswani et al., “Attention Is All You Need.”; Autio et al., *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*
[^2]: National Institute of Standards and Technology, “Announcing the ‘AI Agent Standards Initiative’ for Interoperable and Secure Innovation.”
