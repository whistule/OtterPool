# Deleting a member's data

What an admin does when someone asks for their data to be deleted, and the
yearly sweep that keeps us to the retention periods in the privacy notice
(About screen, `apps/mobile/app/about.tsx`). Both are done by hand in the
Supabase dashboard for the prod project.

## On request

1. **Check it's them.** Reply to the email address on their account, not a
   different one they've written from.
2. **Find their user id.** Dashboard → Authentication → Users, search by
   email, copy the UID.
3. **Reassign any events they led.** `events.leader_id` can't be empty, so
   their events have to move to another leader before the account can go.
   In the SQL editor:

   ```sql
   select id, title, starts_at from public.events where leader_id = '<uid>';
   update public.events set leader_id = '<new leader uid>' where leader_id = '<uid>';
   ```

4. **Delete their avatar.** Dashboard → Storage → `avatars`, delete the
   folder named after their UID. Storage files don't go with the account.
5. **Delete the user.** Dashboard → Authentication → Users → the user's menu
   → Delete user. That removes their profile, personal details, sign-ups,
   approvals and push tokens with it. Where they assisted on an event,
   reviewed a sign-up or set an approval, that reference is cleared.
6. **Tell them it's done.**

What's left afterwards, on purpose:

- Payment records in Stripe, kept six years for the club's accounts.
- Their row in the MemberMojo import (`verified_members`), which is the
  club's own membership list and is replaced on the next import. Delete it
  from MemberMojo if they're leaving the club too.
- The admin audit log, which holds only ids, never names or details.

## Yearly sweep

The notice says lapsed members are deleted two years after their membership
ends, and people who never joined a year after they last used the app. Once a
year, list the candidates and delete each one as above:

```sql
select u.id, u.email, vm.expires_on, u.last_sign_in_at
from auth.users u
join public.profiles p on p.id = u.id
left join public.verified_members vm on vm.email_norm = lower(trim(u.email))
where p.status_override is null
  and (
    vm.expires_on < now() - interval '2 years'
    or (vm.email_norm is null and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '1 year')
  );
```

Members whose status an admin set by hand (`status_override`) are left out;
check those individually.
