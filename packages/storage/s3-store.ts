/**
 * VHE-2 §7/§9 — S3-backed AssetStore with SigV4 query presigning.
 *
 * WHY THIS EXISTS (VHE-ISSUE-LOG-0027): the fal.ai adapter (0026) is URL-in/URL-out — fal's
 * servers fetch the source crop + mask by URL and return outputs by URL. The registry's
 * `AssetStore.signUrl` therefore has to hand back a short-lived, PUBLICLY reachable URL. The
 * validation harness's local-file store returns a local PATH, which fal cannot reach. This module
 * is the real S3-backed store whose `signUrl` returns an AWS SigV4 presigned GET URL.
 *
 * NO NEW DEPENDENCY: the vetted `library/` ships only `@aws-sdk/client-s3` (no
 * `@aws-sdk/s3-request-presigner`, and `@smithy/signature-v4` is not importable from the project
 * root). Per the `library/` discipline (check before downloading — CLAUDE.md), presigning is
 * implemented here with `node:crypto` only. Object PUT still uses the vetted `@aws-sdk/client-s3`.
 * The SigV4 core (`sigv4Signature`) is anchored to AWS's published `get-vanilla` known-answer
 * vector in the tests, so its correctness is not self-referential.
 *
 * SECURITY: the secret access key is used only to derive the HMAC signing key; it NEVER appears in
 * a presigned URL, a log line, or a thrown error. Only the (non-secret) access-key id appears in
 * the `X-Amz-Credential` query param, exactly as the S3 presign spec requires.
 *
 * LIVE CAVEAT: a presigned URL only validates if `region` is the storage's CONCRETE region — the
 * `.env` default `S3_REGION=auto` cannot be signed. This is not exercised this session (no live
 * call, VHE-ISSUE-LOG-0027); set a concrete region before the live fal gate.
 */

import { createHash, createHmac } from 'node:crypto';
import type { AssetStore } from '../providers/execution-context.ts';

// ── SigV4 primitives ───────────────────────────────────────────────────────────────────────────

const sha256Hex = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest();

/**
 * RFC-3986 / AWS URI encoding. Unreserved chars pass through; everything else is %XX (uppercase).
 * `encodeSlash=false` preserves '/' as a path separator (used for canonical URIs); query values
 * encode it. Operates on UTF-8 bytes so multi-byte characters encode correctly.
 */
export function awsUriEncode(str: string, encodeSlash = true): string {
  let out = '';
  for (const b of Buffer.from(str, 'utf8')) {
    const unreserved =
      (b >= 0x41 && b <= 0x5a) || // A-Z
      (b >= 0x61 && b <= 0x7a) || // a-z
      (b >= 0x30 && b <= 0x39) || // 0-9
      b === 0x2d || b === 0x5f || b === 0x2e || b === 0x7e; // - _ . ~
    if (unreserved) out += String.fromCharCode(b);
    else if (b === 0x2f /* / */) out += encodeSlash ? '%2F' : '/';
    else out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

/** AWS SigV4 signing-key derivation: kDate → kRegion → kService → kSigning. */
export function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${secretAccessKey}`, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/**
 * The SigV4 core: given a fully-formed canonical request (text) and its scope, return the hex
 * signature. Deliberately takes the canonical request as a string so the tests can feed it AWS's
 * published `get-vanilla` vector and assert the documented signature — independent of the presign
 * wrapper below.
 */
export function sigv4Signature(params: {
  secretAccessKey: string;
  dateStamp: string; // YYYYMMDD
  region: string;
  service: string;
  amzDate: string; // YYYYMMDDTHHMMSSZ
  canonicalRequest: string;
}): string {
  const scope = `${params.dateStamp}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', params.amzDate, scope, sha256Hex(params.canonicalRequest)].join('\n');
  const signingKey = deriveSigningKey(params.secretAccessKey, params.dateStamp, params.region, params.service);
  return hmac(signingKey, stringToSign).toString('hex');
}

/** Format a Date as the SigV4 `YYYYMMDDTHHMMSSZ` basic-ISO timestamp (UTC). */
export function toAmzDate(d: Date): string {
  return d.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// ── Presigned URL ────────────────────────────────────────────────────────────────────────────

export interface Sigv4PresignInput {
  /** e.g. https://proj.storage.supabase.co/storage/v1/s3 (may include a base path). */
  endpoint: string;
  region: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSec: number;
  method?: string; // default GET
  service?: string; // default 's3'
  forcePathStyle?: boolean; // default true (matches preflight); false → virtual-hosted
  now?: Date; // injectable clock for deterministic tests
}

/**
 * Build an AWS SigV4 presigned URL for an S3 object. Only `host` is a signed header and the payload
 * is `UNSIGNED-PAYLOAD` (standard S3 presign), so the returned URL is fetchable by any client with
 * no extra headers until it expires.
 */
export function presignS3Url(input: Sigv4PresignInput): string {
  if (!Number.isInteger(input.expiresSec) || input.expiresSec < 1 || input.expiresSec > 604800) {
    throw new Error('presignS3Url: expiresSec must be an integer in [1..604800]');
  }
  if (!input.region || input.region.toLowerCase() === 'auto') {
    throw new Error('presignS3Url: a concrete S3 region is required');
  }
  const method = input.method ?? 'GET';
  const service = input.service ?? 's3';
  const forcePathStyle = input.forcePathStyle ?? true;
  const amzDate = toAmzDate(input.now ?? new Date());
  const dateStamp = amzDate.slice(0, 8);

  const u = new URL(input.endpoint);
  const basePath = u.pathname.replace(/\/+$/, ''); // '/storage/v1/s3' or ''
  const host = forcePathStyle ? u.host : `${input.bucket}.${u.host}`;
  const encodedKey = awsUriEncode(input.key, false); // preserve '/' path separators
  const canonicalUri = forcePathStyle
    ? `${basePath}/${awsUriEncode(input.bucket, false)}/${encodedKey}`
    : `${basePath}/${encodedKey}`;

  const credential = `${input.accessKeyId}/${dateStamp}/${input.region}/${service}/aws4_request`;
  const canonicalQuery = ([
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.expiresSec)],
    ['X-Amz-SignedHeaders', 'host'],
  ] as [string, string][])
    .map(([k, v]) => [awsUriEncode(k, true), awsUriEncode(v, true)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`, // canonical headers (trailing newline required)
    'host', // signed headers
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const signature = sigv4Signature({
    secretAccessKey: input.secretAccessKey,
    dateStamp,
    region: input.region,
    service,
    amzDate,
    canonicalRequest,
  });

  return `${u.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ── AssetStore ─────────────────────────────────────────────────────────────────────────────────

export interface S3AssetStoreConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  /** Optional key prefix so a room's objects are namespaced, e.g. 'vhe-validation'. */
  prefix?: string;
  /** Injectable fetch (tests); defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock (tests); defaults to `() => new Date()`. */
  now?: () => Date;
  /**
   * Injectable object writer (tests). Defaults to a lazily-constructed `@aws-sdk/client-s3`
   * PutObjectCommand. Kept injectable so unit coverage never touches the network.
   */
  putObject?: (key: string, bytes: Buffer, contentType: string) => Promise<void>;
}

/** Deterministic, content-addressed object key so identical bytes re-store to the same key. */
function contentAddressedKey(prefix: string, hint: string, bytes: Buffer): string {
  const safeHint = hint.replace(/[^a-z0-9._-]/gi, '_').slice(0, 60);
  return `${prefix}${safeHint}-${sha256Hex(bytes).slice(0, 16)}`;
}

function guessContentType(hint: string): string {
  if (/\.jpe?g$/i.test(hint)) return 'image/jpeg';
  if (/\.mp4$/i.test(hint)) return 'video/mp4';
  return 'image/png';
}

/** The real PutObject path — lazily builds one `@aws-sdk/client-s3` client (vetted dependency). */
function defaultPutObject(cfg: S3AssetStoreConfig): (key: string, bytes: Buffer, contentType: string) => Promise<void> {
  let clientP: Promise<{ send: (cmd: unknown) => Promise<unknown> }> | undefined;
  return async (key, bytes, contentType) => {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    if (!clientP) {
      clientP = Promise.resolve(
        new S3Client({
          endpoint: cfg.endpoint,
          region: cfg.region,
          forcePathStyle: cfg.forcePathStyle ?? true,
          credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
        }) as unknown as { send: (cmd: unknown) => Promise<unknown> },
      );
    }
    const client = await clientP;
    await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: bytes, ContentType: contentType }));
  };
}

/**
 * Build a real S3-backed `AssetStore`:
 *   • signUrl — SigV4 presigned GET URL (short-lived, publicly reachable → fal can fetch inputs);
 *   • fetchUrl — download any http(s) URL (provider output, or a presigned input);
 *   • load — read one of OUR keys back (presign + fetch), or pass through an http(s) key;
 *   • store — content-addressed PUT via the vetted S3 client, returns the object key.
 */
export function makeS3AssetStore(cfg: S3AssetStoreConfig): AssetStore {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const clock = cfg.now ?? (() => new Date());
  const prefix = cfg.prefix ? `${cfg.prefix.replace(/\/+$/, '')}/` : '';
  const putObject = cfg.putObject ?? defaultPutObject(cfg);

  const presign = (key: string, ttlSec: number): string =>
    presignS3Url({
      endpoint: cfg.endpoint,
      region: cfg.region,
      bucket: cfg.bucket,
      key,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      expiresSec: ttlSec,
      forcePathStyle: cfg.forcePathStyle,
      now: clock(),
    });

  const download = async (url: string): Promise<Buffer> => {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`s3 store fetch -> ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };

  return {
    async signUrl(key: string, ttlSec: number): Promise<string> {
      return presign(key, ttlSec);
    },
    async fetchUrl(url: string): Promise<Buffer> {
      return download(url);
    },
    async load(key: string): Promise<Buffer> {
      if (/^https?:\/\//.test(key)) return download(key);
      return download(presign(key, 60));
    },
    async store(bytes: Buffer, hint: string): Promise<string> {
      const key = contentAddressedKey(prefix, hint, bytes);
      await putObject(key, bytes, guessContentType(hint));
      return key;
    },
  };
}

/**
 * Build the S3 store from the room's `.env` (S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET…).
 * Throws with a NON-secret message if a required var is missing. Never prints any value.
 */
export function makeS3AssetStoreFromEnv(opts: { prefix?: string; fetchImpl?: typeof fetch; now?: () => Date } = {}): AssetStore {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION;
  const missing = [
    ['S3_ENDPOINT', endpoint],
    ['S3_BUCKET', bucket],
    ['S3_REGION', region],
    ['S3_ACCESS_KEY_ID', accessKeyId],
    ['S3_SECRET_ACCESS_KEY', secretAccessKey],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`makeS3AssetStoreFromEnv: missing required env: ${missing.join(', ')}`);
  }
  if (region!.toLowerCase() === 'auto') {
    throw new Error('makeS3AssetStoreFromEnv: S3_REGION must be a concrete region, not auto');
  }
  return makeS3AssetStore({
    endpoint: endpoint!,
    region: region!,
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    prefix: opts.prefix,
    fetchImpl: opts.fetchImpl,
    now: opts.now,
  });
}
