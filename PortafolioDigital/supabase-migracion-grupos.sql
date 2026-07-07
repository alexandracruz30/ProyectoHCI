-- =========================================================
--  MIGRACIÓN: permitir varios integrantes por trabajo (grupos)
--  Ejecuta esto UNA VEZ en Supabase -> SQL Editor -> Run
--  (solo si ya habías corrido supabase-setup.sql con la columna member_id).
-- =========================================================

-- 1. Agrega la nueva columna de lista de integrantes.
alter table entries
  add column if not exists member_ids jsonb default '[]'::jsonb;

-- 2. Pasa el dato viejo (un integrante) a la lista nueva.
--    Si member_id era null -> lista vacía; si tenía valor -> lista con ese id.
update entries
  set member_ids = case
    when member_id is null then '[]'::jsonb
    else jsonb_build_array(member_id)
  end;

-- 3. Elimina la columna vieja.
alter table entries drop column if exists member_id;
