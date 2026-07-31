/**
 * VHE-2 §1 — Structural fixture builder.
 *
 * Authority: owner ruling 2026-07-19 (VHE-ISSUE-LOG-0009 appended correction).
 * VHE-2 §0's "never invent an FFmpeg command" governs product code; fixture
 * authoring is exempt ON THE CONDITION that every generation command lives in
 * this one committed, auditable script — never typed ad hoc. Do not compose
 * fixture-generation FFmpeg commands anywhere else in the repository.
 *
 * Scope: ONLY the 4 structurally-defined fixtures. The 4 AI-content fixtures
 * (bad_hand.png, garbled_text.png, melted_face_15s.mp4, bad_hand_6s.mp4) are
 * supplied by the owner as frozen files and must NEVER be generated or
 * overwritten by this script (VHE-ISSUE-LOG-0009 Blocker A ruling).
 *
 * Existing fixture files are never overwritten unless --force is passed —
 * regenerating a fixture invalidates any golden test built against it, so
 * --force is a deliberate, logged act, not a convenience.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(import.meta.dirname, '..');
const FIXTURES_DIR = join(REPO_ROOT, 'fixtures');
const CHECKSUMS_FILE = join(FIXTURES_DIR, 'CHECKSUMS.sha256');

// BUILDER: Windows uses .exe; adapt for POSIX hosts.
const FFMPEG = join(REPO_ROOT, 'vendor', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

const FORCE = process.argv.includes('--force');

// Common output flags: bitexact zeroes creation_time / encoder tags in the mux
// so rebuilding on this machine yields stable bytes; faststart per §6 convention.
const OUT_COMMON = ['-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', '-movflags', '+faststart'];
const V_H264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p'];
const A_AAC = ['-c:a', 'aac', '-b:a', '128k'];

interface FixtureSpec {
  name: string;
  spec: string; // the VHE-2 §1 line this implements
  args: string[]; // full ffmpeg argv (without the binary), output path appended last
}

// 330 frames at 30000/1001 fps = 330*1001/30000 = 11.011 s
const NTSC_DUR = '11.011';

const STRUCTURAL_FIXTURES: FixtureSpec[] = [
  {
    name: 'ntsc_2997.mp4',
    spec: '29.97fps (30000/1001) clip, >= 300 frames — kills float-fps bugs',
    args: [
      '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=30000/1001:duration=${NTSC_DUR}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${NTSC_DUR}`,
      '-frames:v', '330',
      ...V_H264, ...A_AAC, ...OUT_COMMON,
    ],
  },
  {
    name: 'vfr_phone.mp4',
    spec: 'variable-frame-rate phone capture (synthesized per owner ruling; a real capture may replace it later)',
    // Deterministic timestamp jitter: every 3rd frame is shifted +12 ms, so frame
    // deltas cycle ~45.3/21.3/33.3 ms — irregular and monotonic, like phone capture.
    // -fps_mode vfr preserves the jittered timestamps instead of re-quantizing them.
    args: [
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=10',
      '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=10',
      '-vf', "setpts='PTS+eq(mod(N,3),0)*0.012/TB'",
      '-fps_mode', 'vfr',
      ...V_H264, ...A_AAC, ...OUT_COMMON,
    ],
  },
  {
    name: 'no_audio.mp4',
    spec: 'silent video',
    args: [
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=5',
      '-an',
      ...V_H264, ...OUT_COMMON,
    ],
  },
  {
    name: 'long_gop.mp4',
    spec: 'clip encoded with keyint=250 — kills seek-accuracy bugs (§6.3 golden test extracts [137..180] from this file)',
    // 300 frames at 25 fps; keyint=250 with scenecut disabled forces keyframes at
    // exactly 0 and 250, so [137..180] sits mid-GOP where naive seeking goes wrong.
    args: [
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=12',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=12',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-x264-params', 'keyint=250:min-keyint=250:scenecut=0',
      ...A_AAC, ...OUT_COMMON,
    ],
  },
];

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function updateChecksums(entries: Map<string, string>) {
  // Preserve existing lines (owner-supplied frozen fixtures), replace rebuilt ones.
  const existing = new Map<string, string>();
  if (existsSync(CHECKSUMS_FILE)) {
    for (const line of readFileSync(CHECKSUMS_FILE, 'utf8').split('\n')) {
      const m = line.trim().match(/^([0-9a-f]{64}) [ *](.+)$/);
      if (m) existing.set(m[2]!, m[1]!);
    }
  }
  for (const [name, hash] of entries) existing.set(name, hash);
  const lines = [...existing.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, hash]) => `${hash} *${name}`);
  writeFileSync(CHECKSUMS_FILE, lines.join('\n') + '\n');
}

async function main() {
  console.log('Correction Studio — structural fixture builder (VHE-2 §1, owner ruling 2026-07-19)');

  if (!existsSync(FFMPEG)) {
    console.error(`Vendored ffmpeg not found: ${FFMPEG} — stage it from library/ first (VHE-ISSUE-LOG-0010).`);
    process.exitCode = 1;
    return;
  }
  const { stdout } = await execFileAsync(FFMPEG, ['-version']);
  const firstLine = stdout.split('\n')[0]!.trim();
  if (!/version\s+7\.1\.1/.test(firstLine)) {
    console.error(`Refusing to run: vendored ffmpeg is not 7.1.1. Got: ${firstLine}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Using: ${firstLine}`);

  mkdirSync(FIXTURES_DIR, { recursive: true });

  const built = new Map<string, string>();
  let failed = 0;

  for (const fixture of STRUCTURAL_FIXTURES) {
    const outPath = join(FIXTURES_DIR, fixture.name);
    if (existsSync(outPath) && !FORCE) {
      console.log(`  ○ SKIP ${fixture.name} — already exists (pass --force to rebuild; that invalidates golden tests)`);
      continue;
    }
    try {
      await execFileAsync(FFMPEG, ['-y', ...fixture.args, outPath]);
      const hash = sha256(outPath);
      built.set(fixture.name, hash);
      console.log(`  ✓ BUILT ${fixture.name}\n          ${fixture.spec}\n          sha256 ${hash}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ FAIL ${fixture.name} — ${String(err)}`);
    }
  }

  if (built.size > 0) {
    updateChecksums(built);
    console.log(`\nChecksums recorded in ${CHECKSUMS_FILE}`);
  }
  console.log(`\nBuilt ${built.size} / skipped ${STRUCTURAL_FIXTURES.length - built.size - failed} / failed ${failed}`);
  console.log('The 4 AI-content fixtures are owner-supplied frozen files — this script never touches them.');
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('build-fixtures crashed:', err);
  process.exitCode = 1;
});
