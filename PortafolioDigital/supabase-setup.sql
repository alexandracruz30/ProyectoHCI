-- =========================================================
--  CONFIGURACIÓN DE SUPABASE para el Portafolio Digital HCI
--  Pega TODO este archivo en:  Supabase -> SQL Editor -> New query -> Run
--  Crea las tablas, las políticas de acceso, el almacenamiento
--  de archivos y carga los datos que ya tenían.
-- =========================================================

-- ---------- 1. TABLAS ----------
create table if not exists sections (
  id          text primary key,
  name        text not null,
  description text default '',
  color       text default '#4f6df5',
  position    int  default 0
);

create table if not exists members (
  id       text primary key,
  name     text not null,
  position int  default 0
);

create table if not exists entries (
  id          text primary key,
  section_id  text references sections(id) on delete cascade,
  member_id   text,
  title       text not null,
  type        text default 'Actividad',
  date        text,
  description text default '',
  tags        jsonb default '[]'::jsonb,
  attachment  jsonb,
  created_at  timestamptz default now()
);

-- ---------- 2. POLÍTICAS DE ACCESO (RLS) ----------
-- Proyecto de curso sin login: acceso público de lectura y escritura.
alter table sections enable row level security;
alter table members  enable row level security;
alter table entries  enable row level security;

drop policy if exists "acceso publico sections" on sections;
drop policy if exists "acceso publico members"  on members;
drop policy if exists "acceso publico entries"  on entries;

create policy "acceso publico sections" on sections for all using (true) with check (true);
create policy "acceso publico members"  on members  for all using (true) with check (true);
create policy "acceso publico entries"  on entries  for all using (true) with check (true);

-- ---------- 3. TIEMPO REAL ----------
-- Para que los cambios de un compañero les aparezcan a todos en vivo.
alter publication supabase_realtime add table sections;
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table entries;

-- ---------- 4. ALMACENAMIENTO DE ARCHIVOS ----------
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

drop policy if exists "evidencias lectura publica" on storage.objects;
drop policy if exists "evidencias subir"           on storage.objects;

create policy "evidencias lectura publica" on storage.objects
  for select using (bucket_id = 'evidencias');
create policy "evidencias subir" on storage.objects
  for insert with check (bucket_id = 'evidencias');

-- ---------- 5. DATOS INICIALES (los que ya tenían) ----------
insert into sections (id, name, description, color, position) values
  ('s1', 'Unidad 1 - Fundamentos de HCI', 'Conceptos base de interacción humano-computador.', '#4f6df5', 0),
  ('s2', 'Unidad 2 - Diseño Centrado en el Usuario', 'Investigación, personas, escenarios y necesidades del usuario.', '#ff8a3d', 1),
  ('s3', 'Unidad 3 - Prototipado y Usabilidad', 'Wireframes, prototipos y evaluación heurística.', '#2fab66', 2)
on conflict (id) do nothing;

insert into members (id, name, position) values
  ('m1', 'Mateo Arauz', 0),
  ('m2', 'Alexandra Cruz', 1),
  ('m3', 'Carlos Robles', 2),
  ('m4', 'Daniel Troetsch', 3),
  ('m5', 'Daniel Vega', 4),
  ('m_mr9zdvmorwfe3', 'Cristhian Wu', 5)
on conflict (id) do nothing;

-- Nota: la entrada e0 tenía un PDF (HCI3.pdf). Como el archivo estaba guardado
-- localmente, su adjunto queda en null; vuelve a subirlo desde la app (Editar
-- la entrada -> Archivo de evidencia) y se guardará ya en Supabase Storage.
insert into entries (id, section_id, member_id, title, type, date, description, tags, attachment) values
  ('e0', 's1', null, 'Fundamentos de HCI', 'Material de clase', '2026-04-10', 'Diapositivas y guía compartidas por el profesor para la Unidad 1.', '["material","profesor"]'::jsonb, null),
  ('e1', 's1', 'm1', 'Heurísticas de Nielsen aplicadas', 'Actividad', '2026-04-14', 'Evaluación de una interfaz utilizando las 10 heurísticas de usabilidad de Nielsen, identificando hallazgos y severidad.', '["usabilidad","heurísticas"]'::jsonb, null),
  ('eA', 's2', null, 'Material de clase - Técnicas de DCU', 'Material de clase', '2026-04-28', 'Guía del profesor sobre entrevistas, personas y escenarios.', '["material","profesor"]'::jsonb, null),
  ('e2', 's2', 'm2', 'Entrevistas a usuarios objetivo', 'Evidencia', '2026-05-02', 'Registro de entrevistas semiestructuradas para identificar necesidades y puntos de dolor del usuario.', '["dcu","entrevistas"]'::jsonb, null),
  ('e3', 's3', 'm3', 'Wireframes de baja fidelidad', 'Evidencia', '2026-05-20', 'Bocetos iniciales de pantallas principales antes de pasar a alta fidelidad.', '["wireframe","prototipo"]'::jsonb, null)
on conflict (id) do nothing;
