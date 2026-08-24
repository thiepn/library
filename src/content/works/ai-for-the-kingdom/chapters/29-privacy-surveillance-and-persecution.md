---
id: privacy-surveillance-and-persecution
order: 5050
title: "Privacy, Surveillance, and Persecution"
part: when-ai-becomes-dangerous
status: published
description: "Chapter 29: Privacy, Surveillance, and Persecution."
estimatedMinutes: 4
---
This chapter distinguishes documented digital persecution from AI-specific security risk. It does not attribute a persecution event to generative AI without direct evidence.

In 2025, Chinese authorities detained leaders associated with Zion Church across multiple cities. The case involved allegations concerning illegal use of information networks. It demonstrates the potential consequences of networked religious activity in a restrictive environment. It does not demonstrate that generative AI exposed the church.[^1]

## Begin With the Person at Risk {#begin-with-the-person-at-risk}

Ordinary cybersecurity protects systems, credentials, and files. Mission security may need to begin with a name, conversion, congregation, location, travel pattern, or network of relationships.[^3]

Protecting sensitive mission data can therefore be an act of neighbor love. “Is this AI provider secure?” is too broad. Who might want the information? What could happen if they obtained it? Where does the data travel? Who can access it? What systems can act on it? Architecture follows the threat model. Pattern provides a positive mission example. Its developers designed around sensitive-context realities, including phone-to-phone transfer and deliberate restraint around tracking or communication features that could increase risk.

The lesson is not that Pattern is independently security-certified. It is that field risk can and should change product architecture. Mission security often protects identities, relationships, and locations whose exposure can create physical consequences. The long-term test is what grows around the tool. The ministry may gain speed while losing understanding, or it may use speed to create margin for better judgment and relationship. Success should therefore be evaluated over time through competence, accountability, resilience, and service rather than through the first impressive demonstration.

## Minimize Before You Secure {#minimize-before-you-secure}

D1 — Public. D2 — Internal. D3 — Confidential. D4 — Sensitive Ministry Information. D5 — High Risk: information whose exposure could plausibly contribute to persecution, physical danger, severe safeguarding harm, or compromise of highly sensitive ministry networks.

The default remains that D5 data should not enter ordinary third-party AI systems.

The strongest security control is often not transmitting the information. Omit. Generalize. Anonymize. Pseudonymize. Process locally if justified. Use identifiable data only when the ministry value requires it. Ministries often focus on document content and overlook metadata: device identifiers, timestamps, locations, account relationships, IP addresses, contact graphs.

In hostile environments, metadata can expose patterns even when message content is encrypted.

Security review should therefore consider the whole digital trace. Sensitive data can persist in backups long after users believe it was deleted.

Cloud backup, device synchronization, exported chat logs, and organizational archives should be included in data-lifecycle planning. Deletion claims should match technical reality.

## Architecture Follows the Threat Model {#architecture-follows-the-threat-model}

Cloud AI can be the best option for many low-risk tasks. Local AI can reduce certain third-party exposure paths. Local does not mean safe. Device theft, weak updates, backups, administrator compromise, and physical access remain.

Choose architecture after threat modeling. An ordinary model can produce a bad answer. An agent with tool access can send, upload, modify, or expose. Least privilege, bounded permissions, logging, reversible actions, and human approval for high-consequence steps reduce blast radius.[^2]

A missionary may use one personal account across ordinary and sensitive activities. Providers, devices, or adversaries may correlate identities through shared login, recovery email, phone number, payment method, or browser profile. High-risk contexts require professional threat modeling beyond generic privacy tips.

## Courage Does Not Excuse Negligence {#courage-does-not-excuse-negligence}

Foreign workers may control technology while local believers carry physical risk. The outsider can leave. The local Christian remains. Ask who bears the consequence if the security judgment is wrong. Christian mission cannot eliminate risk. Believers may knowingly accept personal risk in obedience to Christ.

That does not grant an organization permission to impose avoidable technological risk on others without meaningful knowledge or agency.

Security is not fear. It is stewardship of other people's vulnerability. Organizations should know what happens after suspected exposure. Who is contacted? Which accounts are disabled? Which affected people need warning? Which logs are preserved? Who decides whether public disclosure helps or harms?

Security policy without incident planning is incomplete. A book like this should avoid giving operational detail that creates a false sense of safety or reveals sensitive tactics. The chapter teaches principles and directs high-risk users toward qualified security professionals. That restraint is itself a security practice.

[^1]: This case documents consequences surrounding digital religious activity; it is not evidence that generative AI caused the exposure. See Reuters, “Christian NGO Welcomes Release of Pastor Held in Southern China.”
[^2]: For current agent-security and authorization concerns, see National Institute of Standards and Technology, “Announcing the ‘AI Agent Standards Initiative’ for Interoperable and Secure Innovation.”; National Institute of Standards and Technology, “New Concept Paper on Identity and Authority of Software Agents.”
[^3]: Pattern is used here as a mission-specific threat-modeling case reported by the ministry itself; see Hartenberg, “Patterned for Discipleship.”
