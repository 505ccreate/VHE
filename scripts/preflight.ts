/**
 * VHE-2 §1 — Pre-Flight verification script.
 *
 * Exit gate for Phase 0 pre-flight: this script must print all-green.
 *
 * Design rule from VHE-ISSUE-LOG-0005 §7: assert IDENTITY, not presence.
 * A presence-only check passes on this machine while three of the four version
 * pins are wrong (system FFmpeg 8.1.2, system Node 24, bare `python` = 3.13/3.15).
 *
 * §6-wrapper note: VHE-2 §0 requires every FFmpeg invocation in the product to go
 * through the §6 wrapper. This script predates §6 and is explicitly prescribed by §1
 * to call ffprobe directly for verification. It is verification tooling, not product
 * code. No FFmpeg command is composed here beyond `-version` and a plain probe.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------------------
// Pins — these are the versions this project is contracted to. Changing a value
// here is an architectural change and must be logged.
// ---------------------------------------------------------------------------
const PIN = {
  ffmpegMajorMinorPatch: '7.1.1',
  nodeMajor: 22,
  pythonMajorMinor: '3.11',
  // Owner ruling 2026-07-19 (VHE-ISSUE-LOG-0012): VHE-2 §17 Q1's Postgres 16 pin is
  // amended to 17 — Supabase free tier provisions 17.6 with no version picker.
  postgresMajor: 17,
} as const;

// Owner ruling 2026-07-19 (VHE-ISSUE-LOG-0010 §4 item 1): vendored binaries stay
// out of git and are verified by pinned SHA-256 against the library staged copy
// (library/tools/binary-ffmpeg/, provenance: library/receipts/binary-ffmpeg.json).
// BUILDER: these hashes are for the win64 gyan.dev 7.1.1-essentials build only.
const BINARY_SHA256: Record<string, string> = {
  'ffmpeg.exe': 'b90225987bdd042cca09a1efb5e34e9848f2d1dbf5fbcd388753a44145522997',
  'ffprobe.exe': '05e8fa639450f8191635192871ae37a3ec3e4638fa12f3b7d49c6522ba16a8ed',
};

// BUILDER: Windows uses .exe; adapt for POSIX hosts.
const FFPROBE = join(REPO_ROOT, 'vendor', 'ffmpeg', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
const FFMPEG = join(REPO_ROOT, 'vendor', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

// VHE-2 §1 fixture list. NOTE: this is EIGHT fixtures, not seven —
// bad_hand_6s.mp4 was added by the 7-17 patch for §9.4. See VHE-ISSUE-LOG-0008.
const FIXTURES = [
  'bad_hand.png',
  'melted_face_15s.mp4',
  'ntsc_2997.mp4',
  'vfr_phone.mp4',
  'no_audio.mp4',
  'long_gop.mp4',
  'garbled_text.png',
  'bad_hand_6s.mp4',
] as const;

type Status = 'PASS' | 'FAIL' | 'SKIP';
const results: { name: string; status: Status; detail: string }[] = [];

function record(name: string, status: Status, detail: string) {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`  ${icon} ${status.padEnd(4)} ${name} — ${detail}`);
}

// ---------------------------------------------------------------------------
// (a) FFmpeg / ffprobe identity — the pinned build at the vendored path
// ---------------------------------------------------------------------------
async function checkFfmpegIdentity() {
  console.log('\n[a] Vendored FFmpeg identity');

  for (const [label, bin] of [['ffprobe', FFPROBE], ['ffmpeg', FFMPEG]] as const) {
    if (!existsSync(bin)) {
      record(`${label} present at vendored path`, 'FAIL', `not found: ${bin}`);
      continue;
    }
    try {
      const { stdout } = await execFileAsync(bin, ['-version']);
      const firstLine = stdout.split('\n')[0]!.trim();
      // e.g. "ffprobe version 7.1.1-essentials_build-www.gyan.dev Copyright ..."
      const m = firstLine.match(/version\s+(\d+\.\d+(?:\.\d+)?)/);
      const found = m?.[1];
      if (found === PIN.ffmpegMajorMinorPatch) {
        record(`${label} is pinned ${PIN.ffmpegMajorMinorPatch}`, 'PASS', firstLine);
      } else {
        record(
          `${label} is pinned ${PIN.ffmpegMajorMinorPatch}`,
          'FAIL',
          `found ${found ?? 'unparseable'} — refusing to run. Got: ${firstLine}`,
        );
      }
    } catch (err) {
      record(`${label} responds to -version`, 'FAIL', String(err));
      continue;
    }

    // Identity by hash, not just version string (owner ruling — checksum-pull route).
    const expected = BINARY_SHA256[`${label}.exe`];
    if (expected) {
      const actual = createHash('sha256').update(readFileSync(bin)).digest('hex');
      if (actual === expected) {
        record(`${label} sha256 matches library pin`, 'PASS', `${actual.slice(0, 16)}…`);
      } else {
        record(
          `${label} sha256 matches library pin`,
          'FAIL',
          `expected ${expected.slice(0, 16)}… got ${actual.slice(0, 16)}… — re-stage from library/tools/binary-ffmpeg/`,
        );
      }
    }
  }

  // Guard against the VHE-ISSUE-LOG-0005 §4.3 hazard: a system FFmpeg on PATH.
  // Its presence is not itself a failure — silently USING it would be. We warn so
  // the builder knows the trap is armed on this machine.
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version']);
    const sysVersion = stdout.split('\n')[0]!.trim();
    if (!sysVersion.includes(PIN.ffmpegMajorMinorPatch)) {
      console.log(
        `  ⚠ WARN  A different FFmpeg is on PATH: ${sysVersion}\n` +
          '           Never invoke bare `ffmpeg`. Use the vendored path only (VHE-2 §0, §6).',
      );
    }
  } catch {
    // No system ffmpeg on PATH — the safest possible state. Nothing to warn about.
  }
}

// ---------------------------------------------------------------------------
// Toolchain identity — Node major, Python 3.11, pnpm
// ---------------------------------------------------------------------------
async function checkToolchainIdentity() {
  console.log('\n[a2] Toolchain identity (VHE-ISSUE-LOG-0005 §7)');

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor === PIN.nodeMajor) {
    record(`Node major is ${PIN.nodeMajor}`, 'PASS', `v${process.versions.node}`);
  } else {
    record(
      `Node major is ${PIN.nodeMajor}`,
      'FAIL',
      `running v${process.versions.node}. This project pins Node ${PIN.nodeMajor} via fnm ` +
        `(.node-version). Run \`fnm use\` in this directory.`,
    );
  }

  // Python: must be the 3.11 launcher, never bare `python` (3.13/3.15 on this machine).
  try {
    const { stdout, stderr } = await execFileAsync('py', ['-3.11', '--version']);
    const out = (stdout + stderr).trim();
    if (out.includes(`Python ${PIN.pythonMajorMinor}`)) {
      record(`py -${PIN.pythonMajorMinor} resolves`, 'PASS', out);
    } else {
      record(`py -${PIN.pythonMajorMinor} resolves`, 'FAIL', `got: ${out}`);
    }
  } catch (err) {
    record(`py -${PIN.pythonMajorMinor} resolves`, 'FAIL', String(err));
  }
}

// ---------------------------------------------------------------------------
// (b) Services reachable — Postgres / Redis / S3
// ---------------------------------------------------------------------------
async function checkServices() {
  console.log(`\n[b] Services (Postgres ${PIN.postgresMajor} / Redis 7 / S3)`);

  // Route decided under owner delegation 2026-07-19 (VHE-ISSUE-LOG-0011): hosted
  // free-tier services for dev, per the owner's standing hosting direction (0007) —
  // the library service bundles are source tarballs unusable on Windows (0005) and
  // account provisioning is owner-only. Until the owner supplies credentials via
  // .env / environment, each unset service reports SKIP; set ones are actually probed.
  if (existsSync(join(REPO_ROOT, '.env'))) {
    try {
      process.loadEnvFile(join(REPO_ROOT, '.env'));
    } catch {
      // unreadable .env — fall through to plain environment
    }
  }

  const dbUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  const s3Endpoint = process.env.S3_ENDPOINT;

  if (!dbUrl) {
    record('Postgres reachable', 'SKIP', 'DATABASE_URL not set — owner provisioning pending (VHE-ISSUE-LOG-0011).');
  } else {
    try {
      const { default: pg } = await import('pg');
      const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 10_000 });
      await client.connect();
      const { rows } = await client.query('SELECT version()');
      await client.end();
      const version = String(rows[0]?.version ?? '');
      const major = version.match(/PostgreSQL\s+(\d+)/)?.[1];
      if (Number(major) === PIN.postgresMajor) {
        record('Postgres reachable', 'PASS', version.split(' on ')[0]!);
      } else {
        record('Postgres reachable', 'FAIL', `connected, but not Postgres ${PIN.postgresMajor}: ${version.slice(0, 80)}`);
      }
    } catch (err) {
      record('Postgres reachable', 'FAIL', `DATABASE_URL set but connection failed: ${String(err).slice(0, 160)}`);
    }
  }

  if (!redisUrl) {
    record('Redis reachable', 'SKIP', 'REDIS_URL not set — owner provisioning pending (VHE-ISSUE-LOG-0011).');
  } else {
    const { default: Redis } = await import('ioredis');
    // One-shot check: never auto-retry (retryStrategy → null) and swallow 'error'
    // events, or a bad host makes ioredis retry-loop forever and hang the process
    // past exit. disconnect() in finally guarantees the event loop is released.
    const redis = new Redis(redisUrl, {
      connectTimeout: 8_000,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      const info = await redis.info('server');
      const version = info.match(/(?:redis|valkey)_version:(\S+)/)?.[1] ?? 'unknown';
      const major = Number(version.split('.')[0]);
      // Redis 7 per the stack pin; Valkey ≥ 7-compatible also satisfies BullMQ.
      if (major >= 7) {
        record('Redis reachable', 'PASS', `server version ${version}`);
      } else {
        record('Redis reachable', 'FAIL', `connected, but version ${version} < 7 (BullMQ needs >= 6.2; stack pins 7)`);
      }
    } catch (err) {
      record('Redis reachable', 'FAIL', `REDIS_URL set but connection failed: ${String(err).slice(0, 160)}`);
    } finally {
      redis.disconnect();
    }
  }

  if (!s3Endpoint) {
    record('S3 reachable', 'SKIP', 'S3_ENDPOINT not set — owner provisioning pending (VHE-ISSUE-LOG-0011).');
  } else {
    try {
      const { S3Client, ListBucketsCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        endpoint: s3Endpoint,
        region: process.env.S3_REGION ?? 'auto',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        },
      });
      const bucket = process.env.S3_BUCKET;
      if (bucket) {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
        record('S3 reachable', 'PASS', `HeadBucket ok on ${bucket} @ ${s3Endpoint}`);
      } else {
        await s3.send(new ListBucketsCommand({}));
        record('S3 reachable', 'PASS', `ListBuckets ok @ ${s3Endpoint} (set S3_BUCKET for a bucket-level check)`);
      }
    } catch (err) {
      record('S3 reachable', 'FAIL', `S3_ENDPOINT set but request failed: ${String(err).slice(0, 160)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// (c) Every fixture probes successfully
// ---------------------------------------------------------------------------
async function checkFixtures() {
  console.log(`\n[c] Test fixtures (${FIXTURES.length} required by VHE-2 §1)`);

  for (const fixture of FIXTURES) {
    const path = join(REPO_ROOT, 'fixtures', fixture);
    if (!existsSync(path)) {
      record(fixture, 'FAIL', 'not built yet — see VHE-ISSUE-LOG-0009');
      continue;
    }
    try {
      const { stdout } = await execFileAsync(FFPROBE, [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        path,
      ]);
      const probe = JSON.parse(stdout);
      const streams: unknown[] = probe.streams ?? [];
      if (streams.length === 0) {
        record(fixture, 'FAIL', 'ffprobe returned no streams');
        continue;
      }

      // §0: fps must be rational. Assert r_frame_rate is num/den and never collapsed
      // to a float — this is the check that catches the 29.97 class of bug at the gate.
      const video = (streams as any[]).find((s) => s.codec_type === 'video');
      let detail = `${streams.length} stream(s)`;
      if (video?.r_frame_rate) {
        const [num, den] = String(video.r_frame_rate).split('/');
        if (!num || !den) {
          record(fixture, 'FAIL', `r_frame_rate not rational: ${video.r_frame_rate}`);
          continue;
        }
        detail += `, fps ${num}/${den}`;
      }
      record(fixture, 'PASS', detail);
    } catch (err) {
      record(fixture, 'FAIL', `ffprobe failed: ${String(err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// (d) Local GPU checks — API-only launch, so these do not apply here
// ---------------------------------------------------------------------------
function checkLocalGpu() {
  console.log('\n[d] Local GPU model checks');
  if (process.env.LOCAL_GPU === 'true') {
    record(
      'SAM2 / RIFE / ProPainter load',
      'FAIL',
      'LOCAL_GPU=true but no local model checks are implemented. VHE-2 §17 Q3 was answered ' +
        'API-ONLY and this machine has no CUDA GPU (VHE-ISSUE-LOG-0005). If local GPU is now ' +
        'in scope, that is a blueprint-level change — log it before setting this flag.',
    );
    return;
  }
  record(
    'SAM2 / RIFE / ProPainter load',
    'SKIP',
    'LOCAL_GPU is not true — API-only launch per VHE-2 §17 Q3 (VHE-ISSUE-LOG-0003).',
  );
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Correction Studio — VHE-2 §1 Pre-Flight verification');
  console.log(`Repo: ${REPO_ROOT}`);

  await checkFfmpegIdentity();
  await checkToolchainIdentity();
  await checkServices();
  await checkFixtures();
  checkLocalGpu();

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;

  console.log(`\n${'-'.repeat(70)}`);
  console.log(`PASS ${pass}   FAIL ${fail}   SKIP ${skip}`);

  if (fail > 0) {
    console.log('\nPRE-FLIGHT NOT GREEN. Phase 0 exit gate is CLOSED.');
    process.exitCode = 1;
    return;
  }
  if (skip > 0) {
    console.log('\nNo failures, but skipped checks remain. Phase 0 exit gate is CLOSED');
    console.log('until every SKIP above becomes a PASS. Do not start §2 migrations.');
    process.exitCode = 2;
    return;
  }
  console.log('\nALL GREEN. Phase 0 pre-flight exit gate is satisfied.');
}

main().catch((err) => {
  console.error('preflight crashed:', err);
  process.exitCode = 1;
});
