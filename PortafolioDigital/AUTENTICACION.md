# Cómo activar el inicio de sesión y el control de acceso

Se agregó un sistema de cuentas para la bitácora:

- **Cualquiera** (sin cuenta) puede ver toda la bitácora, pero no puede agregar, editar ni eliminar nada.
- **Cada integrante** se registra desde el botón "🔑 Iniciar sesión" → "Crear cuenta", eligiendo cuál integrante del grupo es.
- Su cuenta queda **pendiente de aprobación**. Mientras tanto puede ver todo, pero no editar.
- El **administrador** entra a "🛡️ Solicitudes de acceso" (aparece solo para el admin) y aprueba o rechaza cada solicitud, confirmando a qué integrante corresponde.
- Una vez aprobado, ese integrante solo puede agregar/editar/eliminar **sus propias** entradas de la bitácora (donde él figura como autor). Secciones, material de clase y el listado de integrantes solo los administra el admin.

## Paso 1 — Ejecutar el SQL en Supabase

1. Entra a tu proyecto en [supabase.com](https://supabase.com) → **SQL Editor** → **New query**.
2. Pega el contenido completo de [`supabase-auth-setup.sql`](supabase-auth-setup.sql) y presiona **Run**.
   - Este script crea la tabla `profiles`, las reglas de seguridad (RLS) y dice quién puede leer/escribir cada cosa. No borra nada de lo que ya tenías.

## Paso 2 — Activar el registro por correo (si no lo está)

En Supabase: **Authentication → Providers → Email**, asegúrate de que esté habilitado. Si quieres que la gente pueda entrar de inmediato sin confirmar su correo (más simple para un proyecto de curso), desactiva "Confirm email" en **Authentication → Settings**. Si lo dejas activado, cada quien deberá confirmar su correo antes de poder iniciar sesión.

## Paso 3 — Crear el primer administrador (tú)

1. Abre la app y regístrate normalmente con tu correo real (por ejemplo `alexacruz3010@gmail.com`) desde "Crear cuenta", eligiendo tu integrante.
2. Vuelve al **SQL Editor** de Supabase y ejecuta (cambia el correo si usaste otro):
   ```sql
   update public.profiles set role = 'admin', status = 'approved'
     where email = 'alexacruz3010@gmail.com';
   ```
3. Recarga la app: ya verás el menú "🛡️ Solicitudes de acceso" para aprobar al resto del grupo.

## Cómo se reparte el control

| Acción                                   | Sin cuenta | Integrante pendiente | Integrante aprobado | Admin |
|-------------------------------------------|:---------:|:---------------------:|:--------------------:|:-----:|
| Ver toda la bitácora                      | ✅ | ✅ | ✅ | ✅ |
| Agregar/editar/eliminar **sus** entradas  | ❌ | ❌ | ✅ | ✅ |
| Editar entradas de otro integrante        | ❌ | ❌ | ❌ | ✅ |
| Agregar material de clase                 | ❌ | ❌ | ❌ | ✅ |
| Crear/eliminar secciones                  | ❌ | ❌ | ❌ | ✅ |
| Gestionar el listado de integrantes       | ❌ | ❌ | ❌ | ✅ |
| Aprobar/rechazar solicitudes de acceso    | ❌ | ❌ | ❌ | ✅ |

La seguridad real vive en las políticas de la base de datos (RLS) definidas en `supabase-auth-setup.sql`, no solo en la interfaz: aunque alguien manipule el navegador, Supabase rechaza cualquier escritura que no cumpla esas reglas.
