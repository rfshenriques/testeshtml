import * as fs from 'node:fs';
import * as path from 'node:path';

// Load ../../.env (not committed) so integration tests can reach local Postgres/Redis, then
// force test-only overrides so no test can ever reach a real external service.
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/sitewright_test?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.EMAIL_PROVIDER = 'fake';
process.env.EMAIL_VERIFY_PROVIDER = 'fake';
process.env.LLM_PROVIDER = 'fake';
process.env.DATA_PROVIDER = 'none';
process.env.GOOGLE_MAPS_API_KEY = 'test-key';
process.env.ANTHROPIC_API_KEY = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.ADMIN_API_TOKEN = 'test-admin-token';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.PREVIEW_HOST = 'http://localhost:3000/p';
process.env.QUOTE_HOST = 'http://localhost:3000/q';
process.env.TRACKING_HOST = 'http://localhost:3000/t';
process.env.LEGAL_ENTITY_NAME = 'Test Studio Ltd';
process.env.LEGAL_ENTITY_REG_NO = 'C12345';
process.env.LEGAL_ENTITY_ADDRESS = '1 Test Street, Valletta, Malta';
process.env.PRIVACY_POLICY_URL = 'https://example.test/privacy';
process.env.DPO_EMAIL = 'privacy@example.test';
process.env.AGENCY_NAME = 'Test Studio';
process.env.AGENCY_URL = 'https://example.test';
process.env.KILL_SWITCH = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.WORKERS = process.env.WORKERS ?? 'off';
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR ?? `/tmp/sitewright-test-${process.pid}/storage`;
process.env.BUILD_WORK_DIR = process.env.BUILD_WORK_DIR ?? `/tmp/sitewright-test-${process.pid}/builds`;
process.env.PREVIEW_TTL_DAYS = '30';
