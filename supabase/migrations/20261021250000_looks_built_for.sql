-- Phase 4 code review (4e): the requirements a session's last complete looks build was for. When a
-- build found no look that passes, every later note made the page ask again, and with nothing on screen
-- each request built again on the same requirements, about 25 cents each. Now a build is only repeated
-- after a change, or on Try again. Written only by the server, like the rest of the session row.

alter table public.sessions add column looks_built_for text;
