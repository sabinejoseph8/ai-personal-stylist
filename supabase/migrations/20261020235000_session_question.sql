-- Phase 2 review: the next question (R19) is kept with the session on the server, with the turn and
-- the words sequence it came from, instead of being sent back by the browser. A question stays until a
-- reading of a later turn replaces it, because Claude sometimes leaves it out of one reading (2c).
alter table public.sessions
  add column question jsonb,
  add column question_turn text,
  add column question_seq bigint not null default 0;
