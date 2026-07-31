/**
 * VHE-2 §3 — Ingest & Probe (nothing works without this — build FIRST).
 *
 * The probe → media_assets-fields derivation and the VFR conform decision. This
 * is the correctness core of §3, decoupled from the DB row write and BullMQ
 * enqueue (those are the §4 job-lifecycle / API layers that call this). Every
 * frame field is rational per §0 — floating-point fps never appears.
 *
 * All FFmpeg/ffprobe access goes through the §6 wrapper (packages/media/ffmpeg.ts);
 * no command strings are composed here.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { conformArgs, probe, runFfmpeg } from './ffmpeg.ts';

export interface Rational {
  num: number;
  den: number;
}

/** Parse an ffprobe rational string ("30000/1001") as the rational it is — never a float. */
export function parseRational(s: string): Rational {
  const [numStr, denStr] = String(s).split('/');
  const num = Number(numStr);
  const den = Number(denStr);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    throw new Error(`r_frame_rate is not a valid rational: ${s}`);
  }
  return { num, den };
}

/** Probe fields written to a media_assets row (§2 columns). fps is rational (§0). */
export interface ProbeFields {
  codec: string | null;
  width: number | null;
  height: number | null;
  pix_fmt: string | null;
  fps_num: number | null;
  fps_den: number | null;
  frame_count: number | null;
  duration_ms: number | null;
  size_bytes: number | null;
  /** VFR when r_frame_rate ≠ avg_frame_rate — the source must be conformed before edit (§3). */
  isVfr: boolean;
}

function rationalValue(s: string | undefined): number | null {
  if (!s) return null;
  const { num, den } = parseRational(s);
  return den === 0 ? null : num / den;
}

/** Map a §3 ffprobe JSON payload to media_assets fields. Pure — no I/O. */
export function probeToFields(probeJson: any): ProbeFields {
  const stream = (probeJson.streams ?? [])[0] ?? {};
  const format = probeJson.format ?? {};

  const rFrameRate: string | undefined = stream.r_frame_rate;
  const avgFrameRate: string | undefined = stream.avg_frame_rate;

  let fps_num: number | null = null;
  let fps_den: number | null = null;
  if (rFrameRate && rFrameRate !== '0/0') {
    const r = parseRational(rFrameRate);
    fps_num = r.num;
    fps_den = r.den;
  }

  // §3: "If r_frame_rate != avg_frame_rate, the source is VFR." Compare as rationals
  // (values), not strings — 30/1 and 30000/1000 are equal. A missing/0 avg is treated
  // as non-VFR (nothing to conform against).
  const rVal = rationalValue(rFrameRate);
  const aVal = avgFrameRate && avgFrameRate !== '0/0' ? rationalValue(avgFrameRate) : null;
  const isVfr = rVal !== null && aVal !== null && Math.abs(rVal - aVal) > 1e-9;

  const durationS = format.duration != null ? Number(format.duration) : NaN;
  const frameCount = stream.nb_read_frames != null ? Number(stream.nb_read_frames) : NaN;

  return {
    codec: stream.codec_name ?? null,
    width: stream.width != null ? Number(stream.width) : null,
    height: stream.height != null ? Number(stream.height) : null,
    pix_fmt: stream.pix_fmt ?? null,
    fps_num,
    fps_den,
    frame_count: Number.isFinite(frameCount) ? frameCount : null,
    duration_ms: Number.isFinite(durationS) ? Math.round(durationS * 1000) : null,
    size_bytes: format.size != null ? Number(format.size) : null,
    isVfr,
  };
}

/** Streamed sha256 of a file — never buffers the whole asset in memory. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

export interface IngestResult {
  fields: ProbeFields;
  sha256: string;
  /** Set only when the source was VFR and a conformed CFR master was written. */
  conformed?: {
    path: string;
    /** Lineage edge relation for the conformed copy (§3: original kept, derived). */
    relation: 'derived';
  };
}

/**
 * Run §3 ingest on a local file: probe → fields → sha256, and — when the source is
 * VFR — conform it to CFR at its r_frame_rate via §6.7 and report the derived master.
 * The caller (§4 worker) persists the row, records lineage, and enqueues §6.6
 * proxy/filmstrip. `conformOutPath` is where the conformed master should be written
 * when needed; omit it to skip conform (probe-only).
 */
export async function ingestProbe(input: string, conformOutPath?: string): Promise<IngestResult> {
  const probeJson = await probe(input);
  const fields = probeToFields(probeJson);
  const sha = await sha256File(input);

  if (fields.isVfr && fields.fps_num && fields.fps_den && conformOutPath) {
    await runFfmpeg(conformArgs(input, fields.fps_num, fields.fps_den, conformOutPath));
    return { fields, sha256: sha, conformed: { path: conformOutPath, relation: 'derived' } };
  }

  return { fields, sha256: sha };
}
