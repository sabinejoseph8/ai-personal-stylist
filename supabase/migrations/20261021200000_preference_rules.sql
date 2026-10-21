-- 4a: each Must have and Never preference keeps its rule (the saved_preferences.rule column from the
-- start), made by the rule maker and read back to the shopper in setup. Saving still replaces the whole
-- list in one step, now with the rules. A rule's shape is checked by the app before it's saved.
create or replace function public.replace_saved_preferences(items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 30 then
    raise exception 'replace_saved_preferences: bad request';
  end if;
  delete from public.saved_preferences where user_id = auth.uid();
  insert into public.saved_preferences (user_id, kind, words, rule, created_at)
  select auth.uid(), e.item ->> 'kind', e.item ->> 'words', nullif(e.item -> 'rule', 'null'::jsonb), now() + e.n * interval '1 millisecond'
  from jsonb_array_elements(items) with ordinality as e(item, n);
end;
$$;
