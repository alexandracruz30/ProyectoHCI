-- =========================================================
--  AUTENTICACIÓN Y CONTROL DE ACCESO - Portafolio Digital HCI
--  Pega TODO este archivo en: Supabase -> SQL Editor -> New query -> Run
--  (ejecútalo UNA sola vez, después de haber corrido ya
--   supabase-setup.sql y supabase-migracion-grupos.sql)
--
--  Qué agrega:
--   - Tabla "profiles": una fila por usuario registrado, con su rol
--     (admin/member), el integrante que dice ser y su estado
--     (pending/approved/rejected).
--   - Funciones auxiliares is_admin() y approved_member_id() para
--     usarlas en las políticas de acceso.
--   - Políticas nuevas: cualquiera puede LEER secciones/integrantes/
--     entradas (bitácora pública), pero solo:
--       * el admin puede crear/editar secciones, el listado de
--         integrantes y el material de clase,
--       * un integrante con cuenta APROBADA puede crear/editar/borrar
--         SOLO las entradas donde él mismo figura como autor.
-- =========================================================

-- ---------- 1. TABLA DE PERFILES ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  member_id  text references public.members(id) on delete set null,
  role       text not null default 'member' check (role in ('admin','member')),
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- Un integrante solo puede estar "reclamado" por una cuenta aprobada a la vez.
create unique index if not exists profiles_member_id_approved_uniq
  on public.profiles (member_id)
  where status = 'approved';

alter table public.profiles enable row level security;

-- ---------- 2. FUNCIONES AUXILIARES ----------
-- SECURITY DEFINER: se ejecutan con permisos de dueño, evitando que las
-- políticas de "profiles" se consulten a sí mismas en bucle infinito.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin' and status = 'approved'
  );
$$;

create or replace function public.approved_member_id(uid uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select member_id from public.profiles
  where id = uid and role = 'member' and status = 'approved';
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.approved_member_id(uuid) to anon, authenticated;

-- ---------- 3. POLÍTICAS: profiles ----------
drop policy if exists "profiles select propio o admin" on public.profiles;
drop policy if exists "profiles insert propio"         on public.profiles;
drop policy if exists "profiles update admin"          on public.profiles;
drop policy if exists "profiles delete admin"          on public.profiles;

-- Cada quien ve su propio perfil; el admin ve todos (para aprobar solicitudes).
create policy "profiles select propio o admin" on public.profiles
  for select using (id = auth.uid() or is_admin(auth.uid()));

-- Al registrarse, un usuario solo puede crear SU PROPIA fila, y siempre
-- arranca como "member" pendiente (no puede auto-asignarse admin/aprobado).
create policy "profiles insert propio" on public.profiles
  for insert with check (
    id = auth.uid() and role = 'member' and status = 'pending'
  );

-- Solo el admin aprueba/rechaza/reasigna integrante o rol.
create policy "profiles update admin" on public.profiles
  for update using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy "profiles delete admin" on public.profiles
  for delete using (is_admin(auth.uid()));

-- ---------- 4. POLÍTICAS: sections / members (solo admin edita) ----------
alter table public.sections enable row level security;
alter table public.members  enable row level security;

drop policy if exists "acceso publico sections" on public.sections;
drop policy if exists "acceso publico members"  on public.members;
drop policy if exists "sections select publica" on public.sections;
drop policy if exists "sections admin escribe"  on public.sections;
drop policy if exists "members select publica"  on public.members;
drop policy if exists "members admin escribe"   on public.members;

create policy "sections select publica" on public.sections for select using (true);
create policy "sections admin escribe" on public.sections
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy "members select publica" on public.members for select using (true);
create policy "members admin escribe" on public.members
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ---------- 5. POLÍTICAS: entries ----------
-- Lectura: la bitácora es pública para todos (con o sin cuenta).
-- Escritura: el admin puede todo; un integrante aprobado solo puede crear
-- o modificar entradas donde su propio member_id esté en member_ids
-- (así se valida que es "propietario" de esa parte de la bitácora).
alter table public.entries enable row level security;

drop policy if exists "acceso publico entries" on public.entries;
drop policy if exists "entries select publica" on public.entries;
drop policy if exists "entries insert"         on public.entries;
drop policy if exists "entries update"         on public.entries;
drop policy if exists "entries delete"         on public.entries;

create policy "entries select publica" on public.entries for select using (true);

create policy "entries insert" on public.entries
  for insert with check (
    is_admin(auth.uid())
    or (approved_member_id(auth.uid()) is not null and member_ids ? approved_member_id(auth.uid()))
  );

create policy "entries update" on public.entries
  for update using (
    is_admin(auth.uid())
    or (approved_member_id(auth.uid()) is not null and member_ids ? approved_member_id(auth.uid()))
  ) with check (
    is_admin(auth.uid())
    or (approved_member_id(auth.uid()) is not null and member_ids ? approved_member_id(auth.uid()))
  );

create policy "entries delete" on public.entries
  for delete using (
    is_admin(auth.uid())
    or (approved_member_id(auth.uid()) is not null and member_ids ? approved_member_id(auth.uid()))
  );

-- ---------- 6. ALMACENAMIENTO (subir evidencias) ----------
-- Lectura pública (para ver los archivos); subir solo con cuenta admin o
-- integrante aprobado.
drop policy if exists "evidencias lectura publica" on storage.objects;
drop policy if exists "evidencias subir"           on storage.objects;

create policy "evidencias lectura publica" on storage.objects
  for select using (bucket_id = 'evidencias');

create policy "evidencias subir" on storage.objects
  for insert with check (
    bucket_id = 'evidencias'
    and (is_admin(auth.uid()) or approved_member_id(auth.uid()) is not null)
  );

-- ---------- 7. TIEMPO REAL para profiles (solicitudes en vivo) ----------
alter publication supabase_realtime add table public.profiles;

-- =========================================================
--  8. CREAR EL PRIMER ADMINISTRADOR
--  Pasos:
--   1) Ve a la app -> "Crear cuenta" -> regístrate normalmente con tu
--      correo real (por ejemplo alexacruz3010@gmail.com).
--   2) Vuelve aquí y ejecuta SOLO la siguiente línea (quita el -- de
--      delante) reemplazando el correo si usaste otro:
-- =========================================================

-- update public.profiles set role = 'admin', status = 'approved'
--   where email = 'alexacruz3010@gmail.com';
