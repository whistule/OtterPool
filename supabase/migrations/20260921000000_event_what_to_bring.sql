-- ============================================================
-- OtterPool — Event "what to bring" / equipment field
-- ============================================================
-- Free-text kit list shown on the event page. One item per line;
-- the app renders it as a bulleted list. A definitional field
-- shared across a series (like description).

alter table public.events
  add column if not exists what_to_bring text;
