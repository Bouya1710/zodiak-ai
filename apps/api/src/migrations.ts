// Migrations SQL (SQLite). Ajouter à la fin ; ne jamais modifier une migration déjà publiée.
export const migrations: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'init',
    sql: `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      credits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      mime TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      thumb_key TEXT,
      width INTEGER, height INTEGER, duration REAL,
      title TEXT, prompt TEXT,
      job_id TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL DEFAULT 'generated',
      fingerprint TEXT,
      sha256 TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX assets_user_created ON assets(user_id, created_at DESC);
    CREATE INDEX assets_fingerprint ON assets(fingerprint);
    CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      reference_asset_id TEXT,
      lora_name TEXT,
      seed INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      prompt TEXT, negative_prompt TEXT,
      params TEXT NOT NULL DEFAULT '{}',
      preset_id TEXT, template_id TEXT, character_id TEXT,
      input_asset_id TEXT, audio_asset_id TEXT,
      result_asset_ids TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      backend TEXT NOT NULL,
      cost INTEGER NOT NULL DEFAULT 0,
      cache_hit INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      started_at TEXT, finished_at TEXT
    );
    CREATE INDEX jobs_user_created ON jobs(user_id, created_at DESC);
    CREATE INDEX jobs_status ON jobs(status, created_at);
    CREATE TABLE credit_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      job_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      event TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    `,
  },
];
