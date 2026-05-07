-- ============================================================
-- OtterPool — Unify split categories, lift grade to its own field
-- ============================================================
-- Replaces "Sea Kayak - A/B/C Trip" with one "Sea Kayak" category
-- and "Pinkston - 1/2/3 Pumps" with one "Pinkston" category.
-- The trip grade (Sea A/B/C, P1/P2/P3) moves to events.grade_advertised
-- so it isn't duplicated in the category name.

-- ---------- Backfill grade_advertised from current category ----------

-- Pinkston
update public.events e
   set grade_advertised = coalesce(e.grade_advertised, 'P1')
  from public.event_categories c
 where c.id = e.category_id and c.name = 'Pinkston - 1 Pump';

update public.events e
   set grade_advertised = coalesce(e.grade_advertised, 'P2')
  from public.event_categories c
 where c.id = e.category_id and c.name = 'Pinkston - 2 Pumps';

update public.events e
   set grade_advertised = coalesce(e.grade_advertised, 'P3')
  from public.event_categories c
 where c.id = e.category_id and c.name = 'Pinkston - 3 Pumps';

-- Sea Kayak
update public.events e
   set grade_advertised = coalesce(e.grade_advertised, 'Sea A')
  from public.event_categories c
 where c.id = e.category_id and c.name = 'Sea Kayak - A Trip';

update public.events e
   set grade_advertised = coalesce(e.grade_advertised, 'Sea B')
  from public.event_categories c
 where c.id = e.category_id and c.name = 'Sea Kayak - B Trip';

update public.events e
   set grade_advertised = coalesce(e.grade_advertised, 'Sea C')
  from public.event_categories c
 where c.id = e.category_id and c.name = 'Sea Kayak - C Trip';

-- ---------- Rename the canonical row, repoint events ----------

-- Pinkston: keep id of "1 Pump" row, rename it, repoint 2/3 Pumps to it.
update public.event_categories
   set name = 'Pinkston',
       notes = 'Pre-filled location: Pinkston Watersports Centre'
 where name = 'Pinkston - 1 Pump';

update public.events
   set category_id = (select id from public.event_categories where name = 'Pinkston')
 where category_id in (
   select id from public.event_categories
    where name in ('Pinkston - 2 Pumps', 'Pinkston - 3 Pumps')
 );

delete from public.event_categories
 where name in ('Pinkston - 2 Pumps', 'Pinkston - 3 Pumps');

-- Sea Kayak: keep id of "A Trip" row, rename it, repoint B/C to it.
update public.event_categories
   set name = 'Sea Kayak',
       notes = null
 where name = 'Sea Kayak - A Trip';

update public.events
   set category_id = (select id from public.event_categories where name = 'Sea Kayak')
 where category_id in (
   select id from public.event_categories
    where name in ('Sea Kayak - B Trip', 'Sea Kayak - C Trip')
 );

delete from public.event_categories
 where name in ('Sea Kayak - B Trip', 'Sea Kayak - C Trip');
