/**
 * VHE-2 §7 — versioned per-provider / per-model PRICING CATALOG + cost records.
 *
 * OWNER RULING 2026-07-21 (Eli Q2c, recorded in VHE-ISSUE-LOG-0022 append + 0024): providers
 * return no authoritative per-call cost (only token usage — VHE-ISSUE-LOG-0022 finding #3). So:
 *   • a VERSIONED catalog holds per-(provider, model) pricing WITH PROVENANCE (where the numbers
 *     came from + as-of date), so a stale rate is auditable and a rate change bumps the version;
 *   • every provider call yields a `CostRecord` carrying RAW USAGE, the ESTIMATED cost, the
 *     REPORTED cost (only when the provider actually returns an exact figure), and the pricing
 *     provenance;
 *   • when the provider returns no exact cost, DASHBOARD RECONCILIATION is authoritative — the
 *     estimate is explicitly marked `authoritative: 'dashboard'`, never treated as truth.
 *
 * Like cost-defaults.ts this is a DATA + pure-function module (the §2 schema is frozen and has no
 * config table — same "config as data, not buried in logic" stance, VHE-ISSUE-LOG-0018). This is
 * the SINGLE SOURCE OF TRUTH for token→cents math; the adapters no longer hold their own rates.
 */

import type { ProviderUsage } from './execution-context.ts';

/** Bump on ANY change to a rate or estimation formula below. */
export const PRICING_CATALOG_VERSION = 1 as const;

export interface PricingProvenance {
  /** Where the rate came from (dashboard page, pricing doc, etc.). */
  source: string;
  /** ISO date the rate was captured/confirmed. */
  asOf: string;
  note?: string;
}

export interface PricingEntry {
  providerSlug: string;
  model: string;
  /** Human-readable rate summary, for audit/provenance (units documented per entry). */
  rates: Record<string, number>;
  provenance: PricingProvenance;
  /** Estimate cents from THIS model's raw usage shape. Missing/unknown usage → 0. */
  estimateCents(usage: ProviderUsage | undefined): number;
}

// ── Pricing entries (rates as of the provenance date; USD per 1M tokens unless noted) ──────────

/** gpt-image-1: text-input / image-input / image-output token rates (VHE-ISSUE-LOG-0022). */
const OPENAI_GPT_IMAGE_1: PricingEntry = {
  providerSlug: 'openai',
  model: 'gpt-image-1',
  rates: { textInputPerMTok: 5, imageInputPerMTok: 10, imageOutputPerMTok: 40 },
  provenance: {
    source: 'OpenAI API pricing (Images / gpt-image-1 token pricing) — captured during 0022 validation',
    asOf: '2026-07-21',
    note: 'OpenAI returns no per-call cost; dashboard is authoritative. Rates transcribed from openai-image.ts (0022).',
  },
  estimateCents(usage) {
    const u = usage as
      | { output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } }
      | undefined;
    if (!u) return 0;
    const textIn = u.input_tokens_details?.text_tokens ?? 0;
    const imgIn = u.input_tokens_details?.image_tokens ?? 0;
    const out = u.output_tokens ?? 0;
    const usd =
      (textIn * this.rates.textInputPerMTok +
        imgIn * this.rates.imageInputPerMTok +
        out * this.rates.imageOutputPerMTok) /
      1_000_000;
    return Math.round(usd * 100);
  },
};

/** gemini-2.5-flash-image ("nano-banana"): output-token rate (VHE-ISSUE-LOG-0022). */
const GOOGLE_GEMINI_25_FLASH_IMAGE: PricingEntry = {
  providerSlug: 'google',
  model: 'gemini-2.5-flash-image',
  rates: { outputPerMTok: 30 },
  provenance: {
    source: 'Google Gemini 2.5 Flash Image pricing — captured during 0022 validation',
    asOf: '2026-07-21',
    note: 'Gemini returns no per-call cost; dashboard is authoritative. Rate transcribed from gemini-image.ts (0022).',
  },
  estimateCents(usage) {
    const out = (usage as { candidatesTokenCount?: number } | undefined)?.candidatesTokenCount ?? 0;
    return Math.round((out * this.rates.outputPerMTok / 1_000_000) * 100);
  },
};

/** The catalog, keyed by `${providerSlug}:${model}`. */
const CATALOG = new Map<string, PricingEntry>(
  [OPENAI_GPT_IMAGE_1, GOOGLE_GEMINI_25_FLASH_IMAGE].map((e) => [`${e.providerSlug}:${e.model}`, e]),
);

/** Look up a pricing entry, or undefined when the (provider, model) pair is not catalogued. */
export function lookupPricing(providerSlug: string, model: string | undefined): PricingEntry | undefined {
  if (!model) return undefined;
  return CATALOG.get(`${providerSlug}:${model}`);
}

/** All catalogued entries (for surfacing the catalog in a UI / audit). */
export function allPricingEntries(): PricingEntry[] {
  return [...CATALOG.values()];
}

// ── Cost record ────────────────────────────────────────────────────────────────────────────

/** Provenance stamp used when NO catalog entry matched (estimate is 0, purely dashboard-driven). */
export interface NoPricingProvenance {
  source: 'none';
  asOf: string;
  note: string;
}

export interface CostRecord {
  catalogVersion: typeof PRICING_CATALOG_VERSION;
  providerSlug: string;
  model: string | null;
  /** Exactly what the provider reported (tokens/pixels/seconds). Null when the provider gave none. */
  rawUsage: ProviderUsage | null;
  /** Best-effort estimate from the catalog. 0 when uncatalogued or usage absent. */
  estimatedCents: number;
  /** The provider's exact per-call cost, ONLY when it actually returned one; else null. */
  reportedCents: number | null;
  provenance: PricingProvenance | NoPricingProvenance;
  /** Which figure bills: the provider's exact cost, else dashboard reconciliation of the estimate. */
  authoritative: 'reported' | 'dashboard';
}

/**
 * Build the cost record for one provider call. When the provider returned an exact cost, that is
 * authoritative; otherwise the estimate stands in and the record is explicitly marked
 * `authoritative: 'dashboard'` (owner ruling Q2c).
 */
export function buildCostRecord(input: {
  providerSlug: string;
  model?: string;
  usage?: ProviderUsage;
  reportedCents?: number;
}): CostRecord {
  const entry = lookupPricing(input.providerSlug, input.model);
  const estimatedCents = entry ? entry.estimateCents(input.usage) : 0;
  const hasReported = typeof input.reportedCents === 'number' && Number.isFinite(input.reportedCents);
  return {
    catalogVersion: PRICING_CATALOG_VERSION,
    providerSlug: input.providerSlug,
    model: input.model ?? null,
    rawUsage: input.usage ?? null,
    estimatedCents,
    reportedCents: hasReported ? (input.reportedCents as number) : null,
    provenance:
      entry?.provenance ?? {
        source: 'none',
        asOf: new Date().toISOString().slice(0, 10),
        note: `no pricing entry for ${input.providerSlug}:${input.model ?? '(no model)'} — dashboard reconciliation only`,
      },
    authoritative: hasReported ? 'reported' : 'dashboard',
  };
}

/** The single cents figure to bill/persist: the exact reported cost if any, else the estimate. */
export function costCentsOf(record: CostRecord): number {
  return record.reportedCents ?? record.estimatedCents;
}
