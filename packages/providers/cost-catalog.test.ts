/**
 * VHE-2 §7 — versioned pricing catalog + cost records (Eli Q2c).
 *
 * Verifies: catalogued estimates from raw usage, provenance is always attached, an exact
 * provider cost is authoritative over the estimate, and an uncatalogued (provider, model)
 * degrades to a dashboard-authoritative zero estimate — never a silent guess-as-truth.
 */

import { describe, expect, it } from 'vitest';
import {
  PRICING_CATALOG_VERSION,
  allPricingEntries,
  buildCostRecord,
  costCentsOf,
  lookupPricing,
} from './cost-catalog.ts';

describe('§7 pricing catalog — lookup + provenance', () => {
  it('is versioned and every entry carries dated provenance', () => {
    expect(PRICING_CATALOG_VERSION).toBe(1);
    const entries = allPricingEntries();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const e of entries) {
      expect(e.provenance.source).toBeTruthy();
      expect(e.provenance.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('resolves catalogued models and misses uncatalogued ones', () => {
    expect(lookupPricing('openai', 'gpt-image-1')).toBeDefined();
    expect(lookupPricing('google', 'gemini-2.5-flash-image')).toBeDefined();
    expect(lookupPricing('openai', 'no-such-model')).toBeUndefined();
    expect(lookupPricing('openai', undefined)).toBeUndefined();
  });
});

describe('§7 buildCostRecord — estimate vs reported authority', () => {
  it('estimates OpenAI cost from usage and marks it dashboard-authoritative', () => {
    const rec = buildCostRecord({
      providerSlug: 'openai',
      model: 'gpt-image-1',
      usage: { output_tokens: 1000, input_tokens_details: { text_tokens: 20, image_tokens: 80 } },
    });
    expect(rec.estimatedCents).toBeGreaterThan(0);
    expect(rec.reportedCents).toBeNull();
    expect(rec.authoritative).toBe('dashboard');
    expect(rec.rawUsage).toMatchObject({ output_tokens: 1000 });
    expect(rec.provenance.source).toContain('OpenAI');
    expect(rec.catalogVersion).toBe(PRICING_CATALOG_VERSION);
    expect(costCentsOf(rec)).toBe(rec.estimatedCents);
  });

  it('estimates Gemini cost from candidatesTokenCount', () => {
    const rec = buildCostRecord({ providerSlug: 'google', model: 'gemini-2.5-flash-image', usage: { candidatesTokenCount: 2580 } });
    expect(rec.estimatedCents).toBeGreaterThan(0);
    expect(rec.authoritative).toBe('dashboard');
  });

  it('treats an exact provider cost as authoritative over any estimate', () => {
    const rec = buildCostRecord({ providerSlug: 'openai', model: 'gpt-image-1', usage: { output_tokens: 1000 }, reportedCents: 42 });
    expect(rec.reportedCents).toBe(42);
    expect(rec.authoritative).toBe('reported');
    expect(costCentsOf(rec)).toBe(42); // reported wins
  });

  it('degrades an uncatalogued model to a zero, dashboard-only estimate with a "none" provenance', () => {
    const rec = buildCostRecord({ providerSlug: 'mystery', model: 'x', usage: { foo: 1 } });
    expect(rec.estimatedCents).toBe(0);
    expect(rec.authoritative).toBe('dashboard');
    expect(rec.provenance.source).toBe('none');
    expect(rec.model).toBe('x');
    expect(rec.rawUsage).toEqual({ foo: 1 });
  });
});
