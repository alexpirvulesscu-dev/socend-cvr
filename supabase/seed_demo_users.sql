-- Utilizatori demo CVR (rulat o dată prin MCP, 2026-07-06).
-- NU e migrare: schema auth aparține Supabase, nu acestui proiect.
-- Parola demo: CvrDemo!2026 — de schimbat înainte de folosire reală.
-- Ștergere: delete from auth.users where email like '%@cvr.demo';
do $$
declare
  uid uuid;
  rec record;
begin
  for rec in select * from (values
    ('admin@cvr.demo', 'admin'),
    ('finance@cvr.demo', 'finance'),
    ('site@cvr.demo', 'site')
  ) as t(email, role)
  loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', rec.email,
      extensions.crypt('CvrDemo!2026', extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'role',rec.role),
      jsonb_build_object('role',rec.role),
      now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid::text, uid,
      jsonb_build_object('sub', uid::text, 'email', rec.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now());
  end loop;
end $$;
