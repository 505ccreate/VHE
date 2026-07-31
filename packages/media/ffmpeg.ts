/**
 * VHE-2 §6 — The FFmpeg Wrapper. THE ONLY PLACE FFMPEG STRINGS EXIST.
 *
 * Every recipe takes/returns typed arguments; nothing else in the codebase
 * touches ffmpeg (§0 rule 3). Code blocks and command strings are copied from
 * VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx with the VHE-ISSUE-LOG-0012
 * de-autocorrect mapping (U+2018/19 → ' · U+201C/1D → " · U+2013 → --) and,
 * where the .docx collapsed multi-line code into one paragraph, line boundaries
 * reconstructed as documented in VHE-ISSUE-LOG-0013.
 *
 * Invocation always uses the vendored FFmpeg 7.1.1 — never the system binary
 * (PATH carries a forbidden 8.1.2 on this machine; see preflight).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);

// BUILDER: vendored binary paths (same pinning as scripts/preflight.ts).
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const VENDOR = join(REPO_ROOT, 'vendor', 'ffmpeg');
export const FFMPEG_BIN = join(VENDOR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
export const FFPROBE_BIN = join(VENDOR, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

function assertVendored(bin: string): void {
  if (!existsSync(bin)) {
    throw new Error(
      `Vendored FFmpeg binary missing: ${bin}. Never fall back to system ffmpeg ` +
        `(VHE-2 §0; system PATH carries a forbidden version). Re-stage from library/tools/binary-ffmpeg/.`,
    );
  }
}

export async function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  assertVendored(FFMPEG_BIN);
  return execFileAsync(FFMPEG_BIN, args, { maxBuffer: 64 * 1024 * 1024 });
}

export async function runFfprobe(args: string[]): Promise<{ stdout: string; stderr: string }> {
  assertVendored(FFPROBE_BIN);
  return execFileAsync(FFPROBE_BIN, args, { maxBuffer: 64 * 1024 * 1024 });
}

// ---------------------------------------------------------------------------
// §6.1 Frame ↔ time math (asymmetric on purpose) — verbatim
// ---------------------------------------------------------------------------

// Frame n's presentation start, rounded to nearest ms — for display and seek targets.
export const frameToMs = (n: number, num: number, den: number) =>
  Math.round((n * 1000 * den) / num);

// "Which frame is on screen at time ms" — FLOOR with epsilon, never round.
// Round() here causes off-by-one at 29.97fps whenever ms sits past a frame's midpoint.
//
// BUILDER DEVIATION (owner-ruled 2026-07-20, VHE-ISSUE-LOG-0013): the verbatim §6.1
// `msToFrame` cannot pass §6.1's own MANDATORY golden test — frameToMs rounds to the
// nearest ms (error up to ±0.5 ms), and a bare floor of that quantized ms loses a frame
// (e.g. frame 2 @24/1 → 83 ms → floor gives 1). Adding +0.5 ms before the floor exactly
// absorbs frameToMs's rounding: the residual lands in [0,1) frame-fractions and floors
// back to n for every n at 24/1, 30000/1001, 25/1, 60000/1001. Display/seek semantics are
// unchanged at any real fps. This is the single adapted line; the rest of §6.1 is verbatim.
export const msToFrame = (ms: number, num: number, den: number) =>
  Math.floor(((ms + 0.5) * num) / (1000 * den) + 1e-6);

// ---------------------------------------------------------------------------
// §3 probe command (verbatim — §3 prescribes it, §6 owns the string)
// ---------------------------------------------------------------------------

export function probeArgs(input: string): string[] {
  return [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-count_frames',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames,time_base',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    input,
  ];
}

export async function probe(input: string): Promise<any> {
  const { stdout } = await runFfprobe(probeArgs(input));
  return JSON.parse(stdout);
}

// ---------------------------------------------------------------------------
// §6.2 True last frame
// ---------------------------------------------------------------------------

export function lastFrameFastArgs(input: string, outPng: string): string[] {
  return ['-y', '-sseof', '-1.0', '-i', input, '-map', '0:v:0', '-fps_mode', 'passthrough', '-update', '1', outPng];
}

export function countFramesArgs(input: string): string[] {
  return ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', input];
}

// Fallback decodes the whole file — acceptable, it's the correctness path (§6.2).
export function lastFrameExactArgs(input: string, nFrames: number, outPng: string): string[] {
  return ['-y', '-i', input, '-vf', `select=eq(n,${nFrames - 1})`, '-fps_mode', 'passthrough', '-frames:v', '1', outPng];
}

// ---------------------------------------------------------------------------
// §6.3 Exact frame-range extraction [A..B] inclusive — timestamp-trim method
// (verbatim; line boundaries reconstructed per VHE-ISSUE-LOG-0013)
// ---------------------------------------------------------------------------

export function extractFrameRangeArgs(input: string, A: number, B: number,
                                      num: number, den: number, outDir: string): string[] {
  const frameDurS = den / num;
  const tStart = Math.max(0, (A - 0.5) * frameDurS); // midpoint before frame A
  const tEnd = (B + 0.5) * frameDurS; // midpoint after frame B
  const seekS = Math.max(0, tStart - 2); // coarse seek 2s early (keyframe-safe)
  return [
    '-ss', seekS.toFixed(6), '-i', input,
    '-copyts', // keep original timestamps through the seek
    '-vf', `trim=start=${tStart.toFixed(6)}:end=${tEnd.toFixed(6)},setpts=PTS-STARTPTS`,
    '-fps_mode', 'passthrough',
    '-start_number', String(A),
    `${outDir}/%07d.png`,
  ];
}

// ---------------------------------------------------------------------------
// §6.4 Splice repaired frames back — keyframe-aware, honest about re-encoding
// ---------------------------------------------------------------------------

// Step 1 — find enclosing keyframes (msA/msB from §6.1).
export function keyframeTimesArgs(input: string): string[] {
  return ['-v', 'error', '-skip_frame', 'nokey', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', input];
}

// Step 2 — cut the three pieces (skip head if K1==0, skip tail if K2==EOF).
export function cutHeadArgs(input: string, k1: number, outMp4: string): string[] {
  return ['-y', '-i', input, '-to', String(k1), '-c', 'copy', '-avoid_negative_ts', 'make_zero', outMp4];
}

export function cutTailArgs(input: string, k2: number, outMp4: string): string[] {
  return ['-y', '-ss', String(k2), '-i', input, '-c', 'copy', '-avoid_negative_ts', 'make_zero', outMp4];
}

// Step 3 — encode the rebuilt middle [K1, K2) from PNG frames.
export function encodeMidArgs(framesPattern: string, firstMidFrame: number,
                              num: number, den: number, outMp4: string): string[] {
  return [
    '-y', '-framerate', `${num}/${den}`, '-start_number', String(firstMidFrame), '-i', framesPattern,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', outMp4,
  ];
}

// Step 4a — concat list content. The .docx printf line lost its newline escapes
// (paragraph collapse, VHE-ISSUE-LOG-0013); the concat demuxer requires one
// `file '<path>'` line per segment.
export function concatListContent(files: string[]): string {
  return files.map((f) => `file '${f}'`).join('\n') + '\n';
}

// Step 4b — concat video losslessly from a list file.
export function concatCopyArgs(listTxt: string, outMp4: string): string[] {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', listTxt, '-c', 'copy', outMp4];
}

// Step 4c — remap original audio untouched. -map 1:a:0? — the ? makes the audio
// map optional, so silent sources export cleanly with zero audio tracks and no
// dummy encoders.
export function remapAudioArgs(splicedVideo: string, originalInput: string, outMp4: string): string[] {
  return [
    '-y', '-i', splicedVideo, '-i', originalInput, '-map', '0:v:0', '-map', '1:a:0?',
    '-c', 'copy', '-movflags', '+faststart', outMp4,
  ];
}

// ---------------------------------------------------------------------------
// §6.5 Burst stitching (Path A / Path B)
// ---------------------------------------------------------------------------

// Path A lossless (all segments probe-identical): concat -c copy.
export function stitchConcatArgs(listTxt: string, outMp4: string): string[] {
  return concatCopyArgs(listTxt, outMp4);
}

// Path B — normalize an offending segment first.
export function normalizeSegmentArgs(segMp4: string, W: number, H: number,
                                     fps: string, outMp4: string): string[] {
  return [
    '-y', '-i', segMp4, '-vf', `scale=${W}:${H}:flags=lanczos,fps=${fps},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an', outMp4,
  ];
}

// ---------------------------------------------------------------------------
// §6.6 Proxy, filmstrip, SAM prep
// ---------------------------------------------------------------------------

export function proxyArgs(master: string, outMp4: string): string[] {
  return [
    '-y', '-i', master, '-vf', 'scale=-2:720,fps=24,format=yuv420p',
    '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-c:a', 'aac', outMp4,
  ];
}

export function filmstripArgs(proxyMp4: string, outPattern: string): string[] {
  return ['-y', '-i', proxyMp4, '-vf', 'fps=1,scale=-2:160', '-start_number', '0', '-q:v', '4', outPattern];
}

// SAM 2 input frames must be real JPEGs, quality ~95, numbered 0.jpg..N-1.jpg —
// SAM 2's loader keys off the extension; renamed PNGs break it (§6.6 note).

// ---------------------------------------------------------------------------
// §6.7 VFR conform (invoked by ingest when r_frame_rate ≠ avg_frame_rate)
// ---------------------------------------------------------------------------

// Target fps = the source's r_frame_rate rational. Record lineage; all editing
// runs on the conformed copy.
export function conformArgs(input: string, num: number, den: number, outMp4: string): string[] {
  return [
    '-y', '-i', input, '-vf', `fps=${num}/${den}`,
    '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'copy', outMp4,
  ];
}
