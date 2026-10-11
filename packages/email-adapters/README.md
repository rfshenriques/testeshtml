# @sitewright/email-adapters

Outbound provider adapters, inbound mail sources and reply parsing for Stage 7 outreach (spec §11). The provider is a config choice behind the `EmailProvider` interface (spec §11.4 DECISION: SES for v1, Smartlead as the managed alternative).

## Providers

- `SesProvider` — Amazon SES v2 `SendEmailCommand` with Simple content and custom `Headers` (List-Unsubscribe etc.). Inject `client` in tests. `parseWebhook` handles SNS envelopes carrying SES notifications (`notificationType`) or event-publishing records (`eventType`): Bounce (Permanent → `hard: true`), Complaint, Delivery; `SubscriptionConfirmation` yields `[]` (confirm out-of-band).
- `SmartleadProvider` — best-effort adapter: `POST {baseUrl}/email-accounts/{account}/send?api_key=…`; `parseWebhook` maps `EMAIL_BOUNCE` / `EMAIL_REPLY` / `EMAIL_SENT`. **Endpoint and payload shapes must be verified against Smartlead's current docs before production.**
- `FakeProvider` — records sends (`sent`, ids `fake-<n>`), `failNext`, and `simulateBounce(recipient, hard)`, `simulateComplaint`, `simulateDelivery`, `simulateReply(recipient, text, inReplyTo?)` helpers returning `ProviderEvent[]`.

## Inbound (spec §11.7)

- `ImapSource` — imapflow + mailparser; `poll(sinceUid)` fetches UIDs above the cursor from the mailbox and returns parsed `InboundMessage`s plus the new `lastUid`. Never flags or deletes.
- `FakeInboundSource` — in-memory queue for tests.
- `parseRawEmail(raw)` — RFC 822 → `InboundMessage` (From/To, Message-ID, In-Reply-To, References, text/html, date).
- `extractReplyText(text)` — removes quoted lines (`>`), "On … wrote:", Outlook original-message/header blocks, "Sent from my …" and `-- ` signatures.
- `buildMessageId(domain)` — `<nanoid@domain>` (node:crypto) for thread matching via In-Reply-To / References.

Guardrails these adapters do not enforce (the API's compliance gate does): verified recipients only, suppression, per-mailbox caps, max 4 touches, never auto-reply (spec §20).
