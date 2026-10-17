CREATE TABLE IF NOT EXISTS sign_events (
  ts            timestamptz NOT NULL,
  session_id    text        NOT NULL,
  gloss         text        NOT NULL,
  confidence    real        NOT NULL,
  accepted      boolean     NOT NULL,
  alt1          text,
  alt1_p        real,
  classify_ms   real        NOT NULL,
  model_version text        NOT NULL
) WITH (tsdb.hypertable, tsdb.partition_column = 'ts');

CREATE TABLE IF NOT EXISTS utterance_events (
  ts            timestamptz NOT NULL,
  session_id    text        NOT NULL,
  n_signs       int         NOT NULL,
  gloss_seq     text        NOT NULL,
  english       text        NOT NULL,
  sentence_type text        NOT NULL,
  source        text        NOT NULL,      -- 'gemini' | 'rules'
  edited        boolean     NOT NULL,      -- signer fixed a chip before speaking
  gloss_ms      real        NOT NULL,
  tts_ttfb_ms   real,
  end_to_end_ms real                       -- last sign end -> voice starts, minus human confirm time
) WITH (tsdb.hypertable, tsdb.partition_column = 'ts');

CREATE MATERIALIZED VIEW IF NOT EXISTS latency_1m
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', ts) AS bucket,
       count(*)                   AS utterances,
       avg(end_to_end_ms)         AS avg_e2e_ms,
       max(end_to_end_ms)         AS max_e2e_ms,
       avg(gloss_ms)              AS avg_gloss_ms,
       avg(tts_ttfb_ms)           AS avg_tts_ms
FROM utterance_events
GROUP BY bucket
WITH NO DATA;

-- include not-yet-materialized rows so the live dashboard is current
ALTER MATERIALIZED VIEW latency_1m SET (timescaledb.materialized_only = false);

SELECT add_continuous_aggregate_policy('latency_1m',
  start_offset => INTERVAL '2 hours', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');
