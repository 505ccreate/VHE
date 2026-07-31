-- Migration 0001 — VHE-2 §2 Database Schema (single source of truth).
-- Body copied from VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx (word/document.xml)
-- with ONLY the mechanical de-autocorrect mapping documented in VHE-ISSUE-LOG-0012
-- (U+2018/U+2019 -> ' · U+201C/U+201D -> " · U+2013 en-dash -> --); the .docx stores
-- Word smart-quote artifacts inside its code blocks. No statement was otherwise changed.

CREATE TABLE media_assets (
id TEXT PRIMARY KEY, -- ulid
owner_id TEXT NOT NULL,
kind TEXT NOT NULL CHECK (kind IN ('image','video','audio')),
status TEXT NOT NULL DEFAULT 'processing'
            CHECK (status IN ('uploading','processing','ready','failed')),
storage_key TEXT NOT NULL,
mime TEXT NOT NULL,
width INT,
height INT,
duration_ms INT,
fps_num INT, -- exact rational fps
fps_den INT,
frame_count INT,
codec TEXT,
pix_fmt TEXT,
size_bytes BIGINT,
sha256 TEXT NOT NULL,
origin TEXT NOT NULL DEFAULT 'upload'
            CHECK (origin IN ('upload','generated','derived','export')),
meta JSONB NOT NULL DEFAULT '{}',
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON media_assets (owner_id, kind, created_at DESC);
CREATE TABLE projects (
id TEXT PRIMARY KEY,
owner_id TEXT NOT NULL,
title TEXT NOT NULL DEFAULT 'Untitled',
root_asset_id TEXT REFERENCES media_assets(id),
edit_graph JSONB NOT NULL DEFAULT '{"nodes":[],"head":null}', -- §11
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE masks (
id TEXT PRIMARY KEY,
asset_id TEXT NOT NULL REFERENCES media_assets(id), -- masks always bind to an asset
project_id TEXT REFERENCES projects(id), -- nullable: library-level masks allowed
payload JSONB NOT NULL, -- §5 MaskObject
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON masks (asset_id);
CREATE TABLE jobs (
id TEXT PRIMARY KEY,
owner_id TEXT NOT NULL,
project_id TEXT REFERENCES projects(id),
type TEXT NOT NULL, -- 'ingest.probe'|'generate.image'|'inpaint.image'|'track.mask'
                                -- |'repair.range'|'generate.segment'|'stitch'|'export'
status TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','awaiting_approval',                                 'succeeded','failed','canceled')),
progress REAL NOT NULL DEFAULT 0,
input JSONB NOT NULL,
output JSONB,
error_code TEXT, -- machine-readable, from §4 taxonomy
error_detail TEXT,
provider_id TEXT,
cost_cents INT NOT NULL DEFAULT 0,
attempt INT NOT NULL DEFAULT 0,
idempotency_key TEXT UNIQUE,
parent_job_id TEXT REFERENCES jobs(id),
heartbeat_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON jobs (owner_id, status, created_at DESC);
CREATE INDEX ON jobs (project_id, created_at DESC);
CREATE TABLE lineage_edges (
id TEXT PRIMARY KEY,
child_asset_id TEXT NOT NULL REFERENCES media_assets(id),
parent_asset_id TEXT REFERENCES media_assets(id), -- NULL for prompt-only roots
relation TEXT NOT NULL, -- 'generated_from_prompt'|'inpainted_from'|'segment_of'
                               -- |'stitched_from'|'exported_from'|'frame_of'
job_id TEXT REFERENCES jobs(id),
mask_id TEXT REFERENCES masks(id),
meta JSONB NOT NULL DEFAULT '{}',
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lineage_dedupe
ON lineage_edges (child_asset_id, relation, COALESCE(parent_asset_id, ''));
CREATE INDEX ON lineage_edges (child_asset_id);
CREATE INDEX ON lineage_edges (parent_asset_id);
CREATE TABLE provider_connections (
id TEXT PRIMARY KEY,
owner_id TEXT NOT NULL,
provider_slug TEXT NOT NULL,
label TEXT,
key_ciphertext BYTEA NOT NULL, -- AES-256-GCM
key_nonce BYTEA NOT NULL, -- 12-byte per-row nonce, never reused
kek_version INT NOT NULL, -- which key-encryption-key encrypted this row
capabilities JSONB NOT NULL, -- §7 manifest, refreshed on connect
is_default_for TEXT[] NOT NULL DEFAULT '{}',
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE budgets (
owner_id TEXT PRIMARY KEY,
cap_cents INT NOT NULL DEFAULT 0, -- 0 = no cap
period_start DATE NOT NULL DEFAULT date_trunc('month', now())::date
);
-- spend is computed live: SUM(jobs.cost_cents) WHERE owner_id=? AND created_at >= period_start
