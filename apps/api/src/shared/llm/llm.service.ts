import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ENV, Env } from '../config/config.module';
import { CostLedgerService } from '../../modules/ops/cost-ledger.service';
import { QuotaService } from '../../modules/ops/quota.service';
import { QuotaExceededError } from '../errors/errors';

export interface LlmRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  purpose: 'classify' | 'copy' | 'reply_intent' | 'reply_draft' | 'opener';
  leadId?: string | null;
  campaignId?: string | null;
}
export interface LlmResponse { text: string; inputTokens: number; outputTokens: number; model: string }
export interface LlmClient { complete(req: LlmRequest, model: string): Promise<LlmResponse> }

/** Test double: `respond` decides what the model says. */
export class FakeLlmClient implements LlmClient {
  calls: LlmRequest[] = [];
  respond: (req: LlmRequest) => string | Promise<string> = () => '{}';
  async complete(req: LlmRequest, model: string): Promise<LlmResponse> {
    this.calls.push(req);
    const text = await this.respond(req);
    return { text, inputTokens: Math.ceil((req.system.length + req.user.length) / 4), outputTokens: Math.ceil(text.length / 4), model };
  }
}

class AnthropicClient implements LlmClient {
  private sdk: any;
  constructor(private readonly apiKey: string) {}
  async complete(req: LlmRequest, model: string): Promise<LlmResponse> {
    if (!this.sdk) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { default: Anthropic } = require('@anthropic-ai/sdk');
      this.sdk = new Anthropic({ apiKey: this.apiKey });
    }
    const res = await this.sdk.messages.create({
      model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    const text = (res.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    return { text, inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, model: res.model ?? model };
  }
}

/**
 * Single LLM entry point (classification, copywriting, reply intent). Every call writes a CostEvent
 * and is subject to the daily USD cap enforced before the call (spec §14 hard quota guards).
 */
@Injectable()
export class LlmService {
  private readonly log = new Logger(LlmService.name);
  private client: LlmClient;
  readonly model: string;

  constructor(@Inject(ENV) private readonly env: Env, private readonly costs: CostLedgerService, private readonly quotas: QuotaService) {
    this.model = env.LLM_MODEL;
    this.client = env.LLM_PROVIDER === 'fake' || !env.ANTHROPIC_API_KEY ? new FakeLlmClient() : new AnthropicClient(env.ANTHROPIC_API_KEY);
    if (env.LLM_PROVIDER !== 'fake' && !env.ANTHROPIC_API_KEY) this.log.warn('ANTHROPIC_API_KEY missing: LLM calls use the fake client');
  }

  /** Test seam. */
  setClient(c: LlmClient) {
    this.client = c;
  }
  getClient(): LlmClient {
    return this.client;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const spentToday = await this.costs.spendSince('llm', new Date(new Date().toISOString().slice(0, 10)));
    if (spentToday >= this.env.LLM_DAILY_USD_CAP) throw new QuotaExceededError(`LLM daily USD cap reached ($${this.env.LLM_DAILY_USD_CAP})`, { spentToday });
    const res = await this.client.complete(req, this.model);
    const usd = (res.inputTokens * this.env.LLM_INPUT_USD_PER_MTOK + res.outputTokens * this.env.LLM_OUTPUT_USD_PER_MTOK) / 1_000_000;
    await this.costs.record({ category: 'llm', units: res.inputTokens + res.outputTokens, usd, provider: res.model, leadId: req.leadId ?? null, campaignId: req.campaignId ?? null, meta: { purpose: req.purpose, inputTokens: res.inputTokens, outputTokens: res.outputTokens } });
    return res;
  }

  /** Complete and parse JSON (tolerates code fences / leading prose), validated by a zod schema. One retry on invalid JSON. */
  async completeJson<T>(req: LlmRequest, schema: z.ZodType<T>): Promise<{ value: T; raw: string; attempts: number }> {
    let last = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await this.complete(attempt === 1 ? req : { ...req, user: `${req.user}\n\nYour previous answer was not valid JSON matching the required shape. Respond with JSON only.` });
      last = res.text;
      const parsed = extractJson(res.text);
      if (parsed !== undefined) {
        const v = schema.safeParse(parsed);
        if (v.success) return { value: v.data, raw: res.text, attempts: attempt };
        this.log.warn({ purpose: req.purpose, issues: v.error.issues.slice(0, 3) }, 'LLM JSON failed schema');
      }
    }
    throw new Error(`LLM returned invalid JSON for ${req.purpose}: ${last.slice(0, 200)}`);
  }
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
