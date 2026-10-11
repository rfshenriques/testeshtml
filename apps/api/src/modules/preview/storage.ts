import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface StoredObject { body: Buffer; contentType: string }
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  deletePrefix(prefix: string): Promise<number>;
  list(prefix: string): Promise<string[]>;
}

/** Headers applied to every preview object (spec §9.5). The serving layer re-applies them on every response. */
export const PREVIEW_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'public, max-age=300' } as const;

export function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2', '.woff': 'font/woff' } as Record<string, string>)[ext] ?? 'application/octet-stream';
}

/** Filesystem-backed storage for development and tests. */
export class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}
  private full(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root))) throw new Error('invalid key');
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.full(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
  async get(key: string) {
    try {
      return { body: await fs.readFile(this.full(key)), contentType: contentTypeFor(key) };
    } catch {
      return null;
    }
  }
  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    await fs.rm(this.full(prefix), { recursive: true, force: true });
    return keys.length;
  }
  async list(prefix: string) {
    const out: string[] = [];
    const walk = async (d: string) => {
      let entries: import('node:fs').Dirent[];
      try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else out.push(path.relative(path.resolve(this.root), p).split(path.sep).join('/'));
      }
    };
    await walk(this.full(prefix));
    return out;
  }
}

/** S3 / R2 / MinIO storage with per-object noindex + cache headers. */
export class S3Storage implements ObjectStorage {
  private client: any;
  constructor(private readonly opts: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }) {}
  private sdk() {
    if (!this.client) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Client } = require('@aws-sdk/client-s3');
      this.client = new S3Client({ region: this.opts.region, endpoint: this.opts.endpoint || undefined, forcePathStyle: !!this.opts.endpoint, credentials: { accessKeyId: this.opts.accessKeyId, secretAccessKey: this.opts.secretAccessKey } });
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { client: this.client, cmd: require('@aws-sdk/client-s3') };
  }
  async put(key: string, body: Buffer, contentType: string) {
    const { client, cmd } = this.sdk();
    await client.send(new cmd.PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: PREVIEW_HEADERS['Cache-Control'], Metadata: { 'x-robots-tag': PREVIEW_HEADERS['X-Robots-Tag'] } }));
  }
  async get(key: string) {
    const { client, cmd } = this.sdk();
    try {
      const res = await client.send(new cmd.GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      const body = Buffer.from(await res.Body.transformToByteArray());
      return { body, contentType: res.ContentType ?? contentTypeFor(key) };
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
  async list(prefix: string) {
    const { client, cmd } = this.sdk();
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(new cmd.ListObjectsV2Command({ Bucket: this.opts.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of res.Contents ?? []) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
  async deletePrefix(prefix: string) {
    const { client, cmd } = this.sdk();
    const keys = await this.list(prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      await client.send(new cmd.DeleteObjectsCommand({ Bucket: this.opts.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }));
    }
    return keys.length;
  }
}
