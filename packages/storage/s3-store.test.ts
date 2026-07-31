/**
 * VHE-2 §7/§9 — S3-backed AssetStore + SigV4 presign, exercised WITHOUT network.
 *
 * The crypto core (`sigv4Signature`) is validated against AWS's PUBLISHED `get-vanilla` vector from
 * the official SigV4 test suite — a true known-answer test, so the signing-key derivation, canonical
 * hashing, and final HMAC are proven correct independently of this codebase, not circularly. The
 * presign wrapper + store are then checked for structure, determinism, and that the SECRET key never
 * leaks into a URL. No network, no credentials.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  awsUriEncode,
  deriveSigningKey,
  makeS3AssetStore,
  presignS3Url,
  sigv4Signature,
  toAmzDate,
} from './s3-store.ts';

describe('SigV4 core — AWS published get-vanilla known-answer', () => {
  // From the official aws-sig-v4-test-suite `get-vanilla` case (region us-east-1, service "service",
  // key AKIDEXAMPLE / wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, 20150830T123600Z). The canonical
  // request text and the resulting signature are both AWS-published values.
  const canonicalRequest = [
    'GET',
    '/',
    '',
    'host:example.amazonaws.com',
    'x-amz-date:20150830T123600Z',
    '',
    'host;x-amz-date',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // sha256("")
  ].join('\n');

  it('reproduces the documented signature', () => {
    const sig = sigv4Signature({
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      dateStamp: '20150830',
      region: 'us-east-1',
      service: 'service',
      amzDate: '20150830T123600Z',
      canonicalRequest,
    });
    expect(sig).toBe('5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });

  it('derives a 32-byte signing key', () => {
    const k = deriveSigningKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20150830', 'us-east-1', 'service');
    expect(k).toHaveLength(32);
  });
});

describe('awsUriEncode', () => {
  it('leaves unreserved chars, encodes reserved, and honors encodeSlash', () => {
    expect(awsUriEncode('abcABC123-_.~')).toBe('abcABC123-_.~');
    expect(awsUriEncode('a b/c', true)).toBe('a%20b%2Fc');
    expect(awsUriEncode('a b/c', false)).toBe('a%20b/c');
    expect(awsUriEncode('key/with/slash', false)).toBe('key/with/slash');
  });
});

describe('toAmzDate', () => {
  it('formats to YYYYMMDDTHHMMSSZ', () => {
    expect(toAmzDate(new Date('2026-07-23T06:07:08.123Z'))).toBe('20260723T060708Z');
  });
});

describe('presignS3Url', () => {
  const base = {
    endpoint: 'https://proj.storage.supabase.co/storage/v1/s3',
    region: 'us-east-1',
    bucket: 'vhe',
    accessKeyId: 'AKID-PUBLIC',
    secretAccessKey: 'super-secret-value-never-in-url',
    expiresSec: 300,
    now: new Date('2026-07-23T06:00:00.000Z'),
  };

  it('matches AWS published S3 query-presign example exactly', () => {
    const url = presignS3Url({
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-east-1',
      bucket: 'examplebucket',
      key: 'test.txt',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresSec: 86400,
      forcePathStyle: false,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt?' +
        'X-Amz-Algorithm=AWS4-HMAC-SHA256&' +
        'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&' +
        'X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&' +
        'X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('produces a path-style URL with all required X-Amz query params', () => {
    const url = presignS3Url({ ...base, key: 'inp/crop.png' });
    const u = new URL(url);
    expect(u.host).toBe('proj.storage.supabase.co');
    expect(u.pathname).toBe('/storage/v1/s3/vhe/inp/crop.png'); // path-style, slashes preserved
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Credential')).toBe('AKID-PUBLIC/20260723/us-east-1/s3/aws4_request');
    expect(u.searchParams.get('X-Amz-Date')).toBe('20260723T060000Z');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('NEVER leaks the secret access key into the URL', () => {
    const url = presignS3Url({ ...base, key: 'inp/mask.png' });
    expect(url).not.toContain('super-secret-value-never-in-url');
    expect(url).toContain('AKID-PUBLIC'); // the (non-secret) key id is expected in X-Amz-Credential
  });

  it('is deterministic for a fixed clock and sensitive to every input', () => {
    const a = presignS3Url({ ...base, key: 'k.png' });
    const b = presignS3Url({ ...base, key: 'k.png' });
    expect(a).toBe(b); // same inputs → same signature
    const sig = (x: string) => new URL(x).searchParams.get('X-Amz-Signature');
    expect(sig(presignS3Url({ ...base, key: 'other.png' }))).not.toBe(sig(a));
    expect(sig(presignS3Url({ ...base, key: 'k.png', expiresSec: 60 }))).not.toBe(sig(a));
    expect(sig(presignS3Url({ ...base, key: 'k.png', secretAccessKey: 'different' }))).not.toBe(sig(a));
    expect(sig(presignS3Url({ ...base, key: 'k.png', now: new Date('2026-07-24T06:00:00Z') }))).not.toBe(sig(a));
  });

  it('supports virtual-hosted style when forcePathStyle is false', () => {
    const u = new URL(presignS3Url({ ...base, key: 'k.png', endpoint: 'https://s3.example.com', forcePathStyle: false }));
    expect(u.host).toBe('vhe.s3.example.com');
    expect(u.pathname).toBe('/k.png');
  });

  it('rejects invalid expiry and a non-concrete region before signing', () => {
    expect(() => presignS3Url({ ...base, key: 'k', expiresSec: 0 })).toThrow(/\[1\.\.604800\]/);
    expect(() => presignS3Url({ ...base, key: 'k', expiresSec: 604801 })).toThrow(/\[1\.\.604800\]/);
    expect(() => presignS3Url({ ...base, key: 'k', region: 'auto' })).toThrow(/concrete S3 region/);
  });
});

describe('makeS3AssetStore', () => {
  const cfg = {
    endpoint: 'https://proj.storage.supabase.co/storage/v1/s3',
    region: 'us-east-1',
    bucket: 'vhe',
    accessKeyId: 'AKID-PUBLIC',
    secretAccessKey: 'shhh',
    prefix: 'vhe-validation',
    now: () => new Date('2026-07-23T06:00:00.000Z'),
  };

  it('signUrl presigns one of our keys (publicly fetchable)', async () => {
    const store = makeS3AssetStore(cfg);
    const url = await store.signUrl('inp/crop.png', 120);
    const u = new URL(url);
    expect(u.pathname).toBe('/storage/v1/s3/vhe/inp/crop.png');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('120');
  });

  it('store PUTs content-addressed bytes and returns the key; idempotent for identical bytes', async () => {
    const puts: { key: string; ct: string; len: number }[] = [];
    const putObject = vi.fn(async (key: string, bytes: Buffer, ct: string) => {
      puts.push({ key, ct, len: bytes.length });
    });
    const store = makeS3AssetStore({ ...cfg, putObject });

    const bytes = Buffer.from('PNGDATA');
    const k1 = await store.store(bytes, 'fal-output.png');
    const k2 = await store.store(bytes, 'fal-output.png');
    expect(k1).toMatch(/^vhe-validation\/fal-output\.png-[0-9a-f]{16}$/);
    expect(k2).toBe(k1); // same bytes → same content-addressed key
    expect(puts[0]!.ct).toBe('image/png');
    // different bytes → different key
    const k3 = await store.store(Buffer.from('OTHER'), 'fal-output.png');
    expect(k3).not.toBe(k1);
  });

  it('load presigns then downloads our key; fetchUrl downloads an external url', async () => {
    const fetchImpl = vi.fn(async (url: any) => new Response(Buffer.from(`bytes-for:${String(url)}`), { status: 200 })) as unknown as typeof fetch;
    const store = makeS3AssetStore({ ...cfg, fetchImpl });

    const loaded = await store.load('inp/crop.png');
    expect(loaded.toString()).toContain('/storage/v1/s3/vhe/inp/crop.png'); // it fetched a presigned URL of our key
    const ext = await store.fetchUrl('https://cdn.fal/out.png');
    expect(ext.toString()).toBe('bytes-for:https://cdn.fal/out.png');
  });

  it('load passes through an http(s) key without presigning', async () => {
    const fetchImpl = vi.fn(async (url: any) => new Response(Buffer.from(String(url)), { status: 200 })) as unknown as typeof fetch;
    const store = makeS3AssetStore({ ...cfg, fetchImpl });
    const out = await store.load('https://external/thing.png');
    expect(out.toString()).toBe('https://external/thing.png');
  });

  it('propagates a non-2xx download as an error', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    const store = makeS3AssetStore({ ...cfg, fetchImpl });
    await expect(store.fetchUrl('https://cdn.fal/x')).rejects.toThrow(/403/);
  });
});
