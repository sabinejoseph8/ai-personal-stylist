-- Phase 4 code review (4e, Sabine's answer to Q1): Behind the scenes is made from the records the app
-- already keeps (her answer to Q1 in 4d), so the event_log table planned for it was never used.
drop table public.event_log;
