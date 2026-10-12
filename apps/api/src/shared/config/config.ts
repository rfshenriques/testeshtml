import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));
const num = (d: number) => z.coerce.number().default(d);
const str = (d = '') => z.string().default(d);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: num(3000),
  LOG_LEVEL: str('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: str('redis://localhost:6379'),
  APP_BASE_URL: str('http://localhost:3000'),
  ADMIN_API_TOKEN: z.string().min(8),

  GOOGLE_MAPS_API_KEY: str(''),
  GOOGLE_PLACES_DAILY_REQUEST_CAP: num(5000),

  ANTHROPIC_API_KEY: str(''),
  LLM_MODEL: str('claude-sonnet-5-5'),
  LLM_DAILY_USD_CAP: num(25),
  LLM_INPUT_USD_PER_MTOK: num(3),
  LLM_OUTPUT_USD_PER_MTOK: num(15),
  LLM_PROVIDER: z.enum(['anthropic', 'fake']).default('anthropic'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: str('.work/storage'),
  TEMPLATES_DIR: str(''),
  BUILD_WORK_DIR: str('.work/builds'),
  S3_ENDPOINT: str(''),
  S3_REGION: str('us-east-1'),
  S3_URL_STYLE: z.enum(['path', 'virtual-host']).default('path'),
  S3_BUCKET_PREVIEWS: str('sitewright-previews'),
  S3_ACCESS_KEY_ID: str(''),
  S3_SECRET_ACCESS_KEY: str(''),
  PREVIEW_HOST: str('http://localhost:3000/p'),
  QUOTE_HOST: str('http://localhost:3000/q'),
  TRACKING_HOST: str('http://localhost:3000/t'),
  PREVIEW_TTL_DAYS: num(30),

  EMAIL_PROVIDER: z.enum(['ses', 'smartlead', 'fake']).default('fake'),
  AWS_SES_REGION: str('eu-west-1'),
  AWS_ACCESS_KEY_ID: str(''),
  AWS_SECRET_ACCESS_KEY: str(''),
  SMARTLEAD_API_KEY: str(''),
  IMAP_HOST: str(''),
  IMAP_USER: str(''),
  IMAP_PASS: str(''),

  COMPANIES_HOUSE_API_KEY: str(''),
  EMAIL_VERIFY_PROVIDER: z.enum(['local', 'zerobounce', 'neverbounce', 'fake']).default('local'),
  EMAIL_VERIFY_API_KEY: str(''),
  SOCIAL_PROFILE_ADAPTER_ENABLED: bool.default(false),
  DATA_PROVIDER: z.enum(['none', 'hunter', 'apollo']).default('none'),
  DATA_PROVIDER_API_KEY: str(''),
  ENRICHMENT_DAILY_LOOKUP_CAP: num(2000),
  EMAIL_VERIFY_DAILY_CAP: num(2000),

  STRIPE_SECRET_KEY: str(''),
  STRIPE_WEBHOOK_SECRET: str(''),
  BOOKING_LINK_URL: str('https://example.com/book'),

  UNSPLASH_ACCESS_KEY: str(''),

  LEGAL_ENTITY_NAME: z.string().min(1),
  LEGAL_ENTITY_REG_NO: z.string().min(1),
  LEGAL_ENTITY_ADDRESS: z.string().min(1),
  PRIVACY_POLICY_URL: z.string().url(),
  DPO_EMAIL: z.string().email(),
  AGENCY_NAME: z.string().min(1),
  AGENCY_URL: z.string().url(),

  KILL_SWITCH: bool.default(false),
  MAX_SENDS_PER_DAY_GLOBAL: num(600),
  INCLUDE_HTTP_ONLY_SITES: bool.default(false),
  ALERT_WEBHOOK_URL: str(''),
  ALERT_EMAIL: str(''),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment:\n  ${issues}`);
  }
  return parsed.data;
}
