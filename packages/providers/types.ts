/**
 * VHE-2 §7 — Provider Adapters & Capability Routing (BYOK, zero lock-in).
 *
 * The type block below is transcribed verbatim (in substance) from
 * VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx `word/document.xml`, NOT the lossy
 * `_BLUEPRINTS-TEXT/` mirror. Field names and types are exactly as written; only
 * whitespace was expanded from the docx's crammed one-line-per-many-fields layout.
 *
 * 🔧 BUILDER — two compile-required generics were DROPPED by the .docx itself (the
 * same defect class as VHE-ISSUE-LOG-0016: the source document lost tokens from its
 * own code). Restored here, flagged inline:
 *   - `describeCapabilities(key): Promise;`  →  `Promise<CapabilityManifest>`
 *   - `cancel?(key, providerJobId): Promise;` →  `Promise<void>`
 * Both restorations are unambiguous from the surrounding contract (describe returns a
 * manifest; cancel returns nothing). See VHE-ISSUE-LOG-0018.
 */

import type { ProviderExecutionContext, ProviderNativeResult } from './execution-context.ts';

export type Capability =
  | 'image.t2i' | 'image.i2i' | 'image.inpaint' | 'image.inpaint.identity_ref'
  | 'image.upscale'
  | 'video.t2v' | 'video.i2v' | 'video.inpaint' | 'video.extend';

export interface CapabilityManifest {
  providerSlug: string;
  capabilities: Partial<Record<Capability, {
    maxWidth: number;
    maxHeight: number;
    fps?: number[];
    minDurationSec?: number;
    maxDurationSec?: number;
    supportsSeed: boolean;
    supportsNegativePrompt: boolean;
    supportsMask: boolean;
    supportsReferenceImages: number;
    costHintCentsPerOp?: number;
  }>>;
}

export interface GenRequest {
  capability: Capability;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  width: number;
  height: number;
  sourceImageKey?: string;
  maskKey?: string;
  referenceImageKeys?: string[];
  durationSec?: number;
  fps?: number;
  initFrameKey?: string;
  extra?: Record<string, unknown>;
}

export interface GenResult {
  assetKeys: string[];
  seedUsed?: number;
  providerJobId?: string;
  costCents?: number;
  raw?: unknown;
}

/**
 * An adapter's success payload. Either the legacy normalized `GenResult` (assetKeys already
 * resolved — the mock adapters and the §7 exit gate use this) OR the new provider-native
 * `ProviderNativeResult` (raw bytes/URLs the registry converts to assetKeys).
 *
 * OWNER-AUTHORIZED §7 CHANGE (Eli Q2a, 2026-07-21): `submit`/`poll` now accept an optional,
 * versioned `ProviderExecutionContext`, and may return `ProviderNativeResult`. Both additions
 * are additive — a 2-arg mock returning a legacy `GenResult` still satisfies this interface
 * (fewer params + a narrower return are assignable). The registry (`registry.ts`) normalizes
 * a native result into a `GenResult` via `normalizeToAssetKeys`. This replaces the `0022`
 * storage factory-closure workaround. See execution-context.ts.
 */
export type AdapterSuccess = GenResult | ProviderNativeResult;

export interface ProviderAdapter {
  slug: string;
  describeCapabilities(key: string): Promise<CapabilityManifest>; // 🔧 BUILDER: generic restored (0016 class)
  submit(
    key: string,
    req: GenRequest,
    ctx?: ProviderExecutionContext,
  ): Promise<{ providerJobId: string } | { immediate: AdapterSuccess }>;
  poll(key: string, providerJobId: string, ctx?: ProviderExecutionContext):
    Promise<{ status: 'running'; progress?: number }
      | { status: 'succeeded'; result: AdapterSuccess }
      | { status: 'failed'; error: string }>;
  cancel?(key: string, providerJobId: string): Promise<void>; // 🔧 BUILDER: generic restored (0016 class)
}
