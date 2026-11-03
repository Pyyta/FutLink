# FutLink

**Fútbol amateur en Bogotá, a un toque.**

FutLink es una PWA mobile-first en español (es-CO) para organizar y unirse a partidos de fútbol amateur en Bogotá D.C. Los jugadores completan su perfil, publican partidos, buscan jugadores cercanos y gestionan solicitudes de cupo o de vinculación. Un panel administrativo permite moderar usuarios y contenidos, generar reportes y ajustar la configuración global de la plataforma.

El proyecto cubre los requisitos funcionales **RF-01 a RF-14** del documento de ingeniería y se desarrolló en 16 fases sobre un monorepo con backend y frontend separados.

---

## Estado del proyecto

- **Backend:** API REST completa con autenticación, perfiles, partidos, solicitudes, notificaciones, calificaciones y administración.
- **Frontend:** PWA React con las pantallas de producto y el panel de administración en cuatro pestañas.
- **Base de datos:** migrada hasta `0010_administracion`; seeds idempotentes de posiciones y localidades.
- **Calidad:** 180 pruebas de backend, 106 de frontend, typecheck estricto y build de producción en verde al cierre de la Fase 16.
- **Migraciones:** cambios de esquema solo mediante archivos `up/down` numerados en `database/migrations/`.

---

## Funcionalidades

| Requisito | Implementación |
| --- | --- |
| **RF-01** | Registro con correo y contraseña, inicio de sesión, refresco de sesión y recuperación de contraseña por código. |
| **RF-02** | Perfil obligatorio con nombre, teléfono, localidad y al menos una posición antes de usar el producto. |
| **RF-03** | Edición del perfil propio: nombre, teléfono, localidad y posiciones. La foto se muestra si existe en la cuenta. |
| **RF-04** | Publicación de partidos con fecha futura, localidad, modalidad, descripción, cupos por posición y coordenadas opcionales. |
| **RF-05** | Búsqueda de jugadores activos por nombre, localidad y posición, con promedio de calificación. |
| **RF-06** | Solicitudes de cupo en un partido y solicitudes directas a jugadores; aceptar o rechazar solo el destinatario. |
| **RF-07** | Cancelación de solicitudes por el emisor y cancelación de partidos por el organizador. |
| **RF-08** | Notificaciones persistentes de aceptación, cancelación, moderación y eliminación de contenido. |
| **RF-09** | Perfil público con teléfono visible solo para el propio usuario o tras una solicitud aceptada. |
| **RF-10** | Calificación de 1 a 5 estrellas, una por par autor→jugador, comentario opcional y promedio calculado. |
| **RF-11** | Administración de usuarios: buscar, crear, editar, suspender, reactivar y eliminar con anonimización. |
| **RF-12** | Moderación de partidos y comentarios: editar, ocultar, restaurar o eliminar. |
| **RF-13** | Reportes por tipo y periodo, histórico y exportación CSV. |
| **RF-14** | Configuración global: escala de calificación, notificaciones y catálogos de posiciones y localidades. |

Además:

- Interfaz en **es-CO** con overrides parciales para es-AR y es-MX.
- Diseño mobile-first con marco de 430 px, navegación inferior y componentes accesibles.
- PWA instalable con manifest, iconos y precache del shell.
- Panel administrativo accesible desde `/admin` solo para usuarios con rol `admin`.

---

## Stack tecnológico

### Backend

- Node.js **>= 24**
- TypeScript estricto (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)
- Express 5
- PostgreSQL con PostGIS
- `pg` con consultas parametrizadas y transacciones
- `zod` para validación de entrada
- JWT para access tokens y refresh tokens opacos rotativos
- `bcrypt` para contraseñas
- `helmet`, CORS restringido y `express-rate-limit`
- `pino` / `pino-http` para logging
- Vitest + Supertest

### Frontend

- React 18 + TypeScript
- Vite 8
- React Router 7
- TanStack Query 5
- React Hook Form + Zod
- i18next / react-i18next
- Tailwind CSS 3
- `vite-plugin-pwa` + Workbox
- Vitest + Testing Library + jsdom

### Base de datos

- PostgreSQL 18.6 y PostGIS 3.6 en el entorno de desarrollo del equipo.
- Migrador SQL propio con checksums y bloqueo asesor de PostgreSQL.
- Seeds idempotentes.

---

## Estructura del repositorio

```text
futlink/
├─ backend/
│  ├─ src/
│  │  ├─ config/          # entorno, pool de PostgreSQL, logger
│  │  ├─ middleware/      # autenticación, autorización, errores, rate limit
│  │  ├─ modules/         # auth, users, matches, requests, notifications,
│  │  │                   # catalog, admin, health
│  │  ├─ scripts/         # migrador, seeds y provisión de administrador
│  │  ├─ shared/          # errores, moderación y utilidades SQL
│  │  ├─ app.ts           # composición de Express
│  │  └─ index.ts         # arranque y apagado ordenado
│  ├─ tests/              # pruebas de integración con Supertest
│  ├─ .env.example
│  └─ package.json
├─ database/
│  ├─ migrations/         # NNNN_nombre.up.sql / .down.sql
│  └─ seeds/              # posiciones y localidades
├─ docs/                  # colecciones HTTP de ejemplo por módulo
├─ frontend/
│  ├─ public/             # logo, marca e iconos PWA
│  ├─ src/
│  │  ├─ app/             # rutas, guards, providers y QueryClient
│  │  ├─ components/      # UI, layout, perfil y administración
│  │  ├─ i18n/            # es-CO, es-AR y es-MX
│  │  ├─ lib/             # cliente HTTP, sesión, tipos y utilidades
│  │  ├─ pages/           # pantallas de producto y admin
│  │  ├─ styles/
│  │  └─ test/            # render con providers y fixtures
│  ├─ vite.config.ts
│  └─ package.json
├─ package.json           # workspaces y scripts raíz
└─ tsconfig.base.json
```

---

## Requisitos previos

1. **Node.js 24 o superior** y npm.
2. **PostgreSQL** con la extensión **PostGIS** disponible.
3. Una base de datos vacía (por defecto `Futlink`).
4. Permisos para crear la extensión `postgis` o, si el usuario de la aplicación no es superusuario, crearla antes con un usuario administrador.

Verifica las versiones:

```powershell
node --version
npm --version
psql --version
```

---

## Puesta en marcha

### 1. Instalar dependencias

Desde la raíz del monorepo:

```powershell
npm install
```

### 2. Crear la base de datos

Conéctate a PostgreSQL como administrador y crea la base:

```sql
CREATE DATABASE "Futlink";
```

La migración `0001_linea_base` ejecuta `CREATE EXTENSION IF NOT EXISTS postgis;`. Si tu usuario no puede crearla, hazlo antes con un superusuario:

```sql
\c "Futlink"
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 3. Configurar variables de entorno

Copia los archivos de ejemplo:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Edita `backend/.env` con las credenciales locales. No versiones `.env` ni compartas sus secretos.

Genera secretos aleatorios para `JWT_ACCESS_SECRET` y `RESET_CODE_PEPPER`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Ejecuta el comando dos veces y usa un valor distinto en cada variable.

### 4. Aplicar migraciones y seeds

```powershell
npm run db:migrate
npm run db:migrate:status
npm run db:seed
```

`db:migrate` aplica las migraciones pendientes en orden. `db:migrate:status` muestra cuáles están aplicadas. `db:seed` carga 4 posiciones y 20 localidades de Bogotá de forma idempotente.

### 5. Provisionar el primer administrador

El script `admin:create` crea el administrador si no existe o actualiza su contraseña, rol y estado si ya existe.

En PowerShell:

```powershell
$env:ADMIN_EMAIL="admin@tudominio.com"
$env:ADMIN_PASSWORD="UnaClaveSegura123"
npm run admin:create
Remove-Item Env:ADMIN_EMAIL
Remove-Item Env:ADMIN_PASSWORD
```

En Bash:

```bash
ADMIN_EMAIL="admin@tudominio.com" \
ADMIN_PASSWORD="UnaClaveSegura123" \
npm run admin:create
```

La contraseña no se imprime ni se registra en logs. En el primer inicio de sesión, el frontend pedirá completar el perfil del administrador antes de acceder al panel.

### 6. Iniciar desarrollo

En dos terminales:

```powershell
# Terminal 1: API en http://localhost:3000
npm run dev
```

```powershell
# Terminal 2: frontend en http://localhost:5173
npm run dev:web
```

Abre `http://localhost:5173`.

### 7. Build de producción

```powershell
npm run build
npm run build:web
```

- Backend compilado en `backend/dist/`; se inicia con `npm start`.
- Frontend compilado en `frontend/dist/`; se puede previsualizar con `npm run preview -w frontend` en `http://localhost:4173`.

`VITE_API_URL` se incorpora en tiempo de build. Si el frontend y la API quedan en dominios distintos, configura esa variable antes de compilar y agrega el origen del frontend a `CORS_ORIGIN`.

---

## Scripts disponibles

Todos se ejecutan desde la raíz del monorepo.

| Script | Descripción |
| --- | --- |
| `npm run dev` | API en modo desarrollo con recarga (`tsx watch`). |
| `npm run dev:web` | Frontend con Vite en el puerto 5173. |
| `npm run build` | Compila el backend con TypeScript. |
| `npm run build:web` | Typecheck y build de producción del frontend. |
| `npm start` | Ejecuta el backend compilado. |
| `npm test` | Pruebas de backend con Vitest. |
| `npm run test:web` | Pruebas de frontend con Vitest. |
| `npm run test:watch` | Pruebas de backend en modo watch. |
| `npm run typecheck` | Typecheck del backend (incluye pruebas). |
| `npm run typecheck:web` | Typecheck del frontend. |
| `npm run db:migrate` | Aplica migraciones pendientes. |
| `npm run db:migrate:down` | Revierte la última migración aplicada. |
| `npm run db:migrate:status` | Lista migraciones aplicadas y pendientes. |
| `npm run db:seed` | Ejecuta los seeds idempotentes. |
| `npm run admin:create` | Crea o actualiza un administrador. |

---

## Configuración

### Backend (`backend/.env`)

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test` o `production`. Por defecto `development`. |
| `PORT` | No | Puerto HTTP. Por defecto `3000`. |
| `CORS_ORIGIN` | No | Orígenes permitidos separados por coma. Por defecto `http://localhost:5173`. |
| `LOG_LEVEL` | No | Nivel de pino. Por defecto `info`. |
| `BODY_LIMIT` | No | Límite del cuerpo, por ejemplo `1mb`. |
| `DB_HOST` | Sí | Host de PostgreSQL. |
| `DB_PORT` | No | Puerto de PostgreSQL. Por defecto `5432`. |
| `DB_USER` | Sí | Usuario de la base. |
| `DB_PASSWORD` | Sí | Contraseña de la base. |
| `DB_NAME` | Sí | Nombre de la base. |
| `JWT_ACCESS_SECRET` | Sí | Secreto de al menos 32 caracteres para access tokens. |
| `JWT_ACCESS_TTL_SECONDS` | No | Vida del access token. Por defecto `900` (15 minutos). |
| `REFRESH_TOKEN_TTL_DAYS` | No | Vida del refresh token. Por defecto `30`. |
| `BCRYPT_COST` | No | Costo de bcrypt entre 10 y 15. Por defecto `12`. |
| `RESET_CODE_PEPPER` | Sí | Secreto de al menos 32 caracteres para códigos de recuperación. |
| `PASSWORD_RESET_TTL_MINUTES` | No | Vigencia del código. Por defecto `15`. |
| `PASSWORD_RESET_MAX_ATTEMPTS` | No | Intentos permitidos. Por defecto `5`. |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` | No | Ventana de rate limit. Por defecto `15`. |
| `AUTH_RATE_LIMIT_MAX` | No | Intentos de auth por ventana. Por defecto `20`. |
| `PASSWORD_RESET_RATE_LIMIT_MAX` | No | Intentos de recuperación por ventana. Por defecto `5`. |
| `ADMIN_EMAIL` | Solo para `admin:create` | Correo del administrador a provisionar. |
| `ADMIN_PASSWORD` | Solo para `admin:create` | Contraseña temporal entre 8 y 72 caracteres. |

### Frontend (`frontend/.env`)

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `VITE_API_URL` | No | URL base de la API sin barra final. Por defecto `http://localhost:3000/api`. |

---

## API REST

- **Base URL local:** `http://localhost:3000/api`
- **Autenticación:** `Authorization: Bearer <accessToken>` en las rutas protegidas.
- **Formato de error:**

```json
{
  "error": {
    "code": "CODE",
    "message": "Mensaje legible",
    "details": {}
  }
}
```

`details` solo aparece cuando aporta información adicional, por ejemplo en `VALIDATION_ERROR`.

### Endpoints públicos

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del servicio, PostgreSQL y PostGIS. |
| `GET` | `/api/catalog` | Posiciones y localidades para registro y perfil. |
| `POST` | `/api/auth/register` | Registro con correo y contraseña. |
| `POST` | `/api/auth/login` | Inicio de sesión. |
| `POST` | `/api/auth/refresh` | Rotación del refresh token. |
| `POST` | `/api/auth/logout` | Revocación idempotente del refresh token. |
| `POST` | `/api/auth/forgot-password` | Solicitud genérica de código de recuperación. |
| `POST` | `/api/auth/reset-password` | Cambio de contraseña con código. |

### Rutas autenticadas

| Método | Ruta | Perfil completo | Descripción |
| --- | --- | --- | --- |
| `GET` | `/api/me` | No | Datos de la sesión actual. |
| `PUT` | `/api/me/profile` | No | Completa o actualiza el perfil propio. |
| `GET` | `/api/users` | Sí | Busca jugadores con filtros y paginación. |
| `GET` | `/api/users/:id` | Sí | Perfil público con visibilidad de teléfono. |
| `PUT` | `/api/users/:id/rating` | Sí | Crea o actualiza la calificación propia. |
| `GET` | `/api/matches` | Sí | Busca partidos disponibles con filtros. |
| `POST` | `/api/matches` | Sí | Publica un partido. |
| `GET` | `/api/matches/:id` | Sí | Detalle del partido y sus vacantes. |
| `PATCH` | `/api/matches/:id/cancel` | Sí | Cancela un partido propio. |
| `POST` | `/api/requests` | Sí | Crea una solicitud de partido o de jugador. |
| `GET` | `/api/requests` | Sí | Lista solicitudes enviadas o recibidas. |
| `PATCH` | `/api/requests/:id/accept` | Sí | Acepta una solicitud recibida. |
| `PATCH` | `/api/requests/:id/reject` | Sí | Rechaza una solicitud recibida. |
| `PATCH` | `/api/requests/:id/cancel` | Sí | Cancela una solicitud propia. |
| `GET` | `/api/notifications` | Sí | Lista notificaciones y contador de no leídas. |
| `PATCH` | `/api/notifications/:id/read` | Sí | Marca una notificación como leída. |

### Administración

Todas las rutas requieren autenticación y rol `admin`. Además responden con `Cache-Control: no-store`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/admin/users` | Lista y busca usuarios. |
| `GET` | `/api/admin/users/:id` | Detalle administrativo de un usuario. |
| `POST` | `/api/admin/users` | Crea un usuario con perfil completo. |
| `PATCH` | `/api/admin/users/:id` | Edita, suspende o reactiva un usuario. |
| `DELETE` | `/api/admin/users/:id` | Elimina lógicamente y anonimiza la cuenta. |
| `GET` | `/api/admin/contents` | Lista partidos y comentarios con filtros. |
| `PATCH` | `/api/admin/contents/matches/:id` | Edita o modera un partido. |
| `PATCH` | `/api/admin/contents/comments/:id` | Edita o modera un comentario. |
| `GET` | `/api/admin/reports` | Histórico de reportes. |
| `POST` | `/api/admin/reports` | Genera un reporte. |
| `GET` | `/api/admin/reports/:id/export` | Descarga el CSV del reporte. |
| `GET` | `/api/admin/config` | Configuración global y catálogos. |
| `PUT` | `/api/admin/config/ratings` | Escala de calificación y regla de solicitud aceptada. |
| `PUT` | `/api/admin/config/notifications` | Activa o desactiva notificaciones. |
| `POST` | `/api/admin/config/positions` | Crea una posición. |
| `PATCH` | `/api/admin/config/positions/:id` | Renombra una posición. |
| `DELETE` | `/api/admin/config/positions/:id` | Elimina una posición no usada. |
| `POST` | `/api/admin/config/localities` | Crea una localidad. |
| `PATCH` | `/api/admin/config/localities/:id` | Renombra una localidad. |
| `DELETE` | `/api/admin/config/localities/:id` | Elimina una localidad no usada. |

Los ejemplos de peticiones están en `docs/*.http` y se pueden abrir con la extensión REST Client de VS Code o con el cliente HTTP de JetBrains.

---

## Base de datos

### Tablas principales

- `users`: cuentas, credenciales, rol, estado, perfil y fecha de registro.
- `positions` y `userspositions`: catálogo y relación N:N con usuarios.
- `localities`: catálogo de localidades de Bogotá.
- `matchs` y `matchvacants`: partidos y cupos por posición.
- `requests`: solicitudes de partido y de jugador con discriminador `type`.
- `notifications`: avisos persistentes por usuario.
- `usersratings`: calificaciones autor→jugador y comentarios.
- `refresh_tokens` y `password_reset_codes`: seguridad de sesión y recuperación.
- `reports`: reportes de usuarios definidos en el esquema base; la API actual no los consume.
- `generatedreports`: reportes administrativos y su CSV histórico.
- `systemsettings`: escala de calificación y configuración global.
- `schema_migrations`: control de migraciones aplicadas.
- `spatial_ref_sys`: tabla de referencia de PostGIS.

### Reglas de integridad y negocio

- Los correos se comparan sin distinguir mayúsculas.
- Las contraseñas se almacenan con bcrypt (costo mínimo 10).
- El borrado de usuarios es **lógico y anonimizante**; conserva el historial y cancela partidos y solicitudes activas.
- Las solicitudes aceptadas ocupan la vacante en una transacción con bloqueo `FOR UPDATE`.
- La moderación `hidden` excluye el contenido de búsquedas, perfiles y promedios; `deleted` además cancela partidos.
- El teléfono solo se expone al propio usuario o a quien tenga una solicitud aceptada con él.
- Las posiciones y localidades en uso no se pueden eliminar; sus renombres propagan el texto denormalizado.
- Los reportes usan el periodo `[from, to)` y admiten como máximo 366 días.
- El CSV se genera con BOM, CRLF y neutralización de fórmulas para evitar inyección en hojas de cálculo.

---

## Migraciones y seeds

### Reglas

- Cada cambio de esquema es un archivo numerado en `database/migrations/` con extensión `.up.sql` y `.down.sql`.
- Una migración aplicada **no se edita**: el migrador guarda un checksum y rechaza cambios posteriores. Para corregir algo, se crea una migración nueva.
- `db:migrate:down` revierte **solo la última migración aplicada**.
- Los seeds son idempotentes y se pueden ejecutar varias veces.
- Los `down` que pueden perder datos están documentados en el propio archivo SQL.

### Comandos

```powershell
npm run db:migrate
npm run db:migrate:status
npm run db:migrate:down
npm run db:seed
```

---

## Pruebas y calidad

```powershell
# Backend
npm test
npm run typecheck

# Frontend
npm run test:web
npm run typecheck:web

# Builds
npm run build
npm run build:web
```

Las pruebas de backend son de integración y usan la base configurada en `backend/.env`. Se ejecutan en serie (`fileParallelism: false`) porque comparten configuración global. **Usa una base de pruebas, no una base con datos reales.**

Las pruebas de frontend usan Vitest, Testing Library y jsdom, con un helper `renderWithProviders` que monta Router, React Query, i18n, Toast y sesión.

---

## PWA y diseño

- Manifest en español con `display: standalone`, orientación vertical e iconos 192, 512 y maskable.
- Workbox precachea el shell (HTML, JS, CSS, imágenes y fuentes) y **nunca cachea `/api/`**: las peticiones a la API usan `NetworkOnly`.
- El service worker se genera en el build; en desarrollo está desactivado. Para probar la instalación usa `npm run build:web` y `npm run preview -w frontend`.
- Interfaz mobile-first con marco de 430 px, tarjetas claras, primario esmeralda y navegación inferior.
- Referencia visual del prototipo: [Figma de FutLink](https://www.figma.com/design/ZTqUwCqTg6V8s6xGhbzCKa/Futlink?node-id=0-1&p=f) (solo lectura).

### Rutas del frontend

```text
/login                Inicio de sesión
/registro             Registro
/recuperar            Recuperación de contraseña
/perfil/completar     Perfil inicial obligatorio
/                     Inicio
/buscar               Búsqueda de partidos y jugadores
/partidos/:id         Detalle de partido y solicitud de cupo
/jugadores/:id        Perfil público y solicitud/calificación
/solicitudes          Solicitudes enviadas y recibidas
/notificaciones       Notificaciones
/perfil               Perfil propio
/perfil/editar        Edición de perfil
/admin                Panel de administración
/sin-acceso           Acceso denegado
*                     404
```

---

## Seguridad y privacidad

- Consultas SQL siempre parametrizadas; nunca se concatena entrada del usuario.
- Validación de toda entrada con Zod en el borde y salida sin campos sensibles.
- Contraseñas con bcrypt (costo 10–15; por defecto 12); nunca se registran contraseñas, códigos ni tokens.
- Access token JWT de vida corta y refresh token opaco, hasheado, rotativo y con detección de reuso.
- Recuperación con código HMAC de 6 dígitos, vigencia limitada, intentos máximos y un solo uso.
- Rate limiting en registro, login, refresco y recuperación.
- `helmet`, CORS restringido por origen y límite de tamaño del cuerpo.
- `authenticate` revalida el estado de la cuenta en cada petición: una suspensión o eliminación surte efecto de inmediato.
- Autorización por recurso además de autenticación: solo el destinatario acepta o rechaza; solo el emisor cancela; solo el organizador cancela su partido.
- El administrador no puede suspenderse, degradarse ni eliminarse a sí mismo.
- La API administrativa responde con `Cache-Control: no-store`.
- En desarrollo, los correos se escriben en `backend/.mail-outbox/` y **no** en los logs. Ese directorio está ignorado por Git.
- La sesión del frontend se guarda en `localStorage`; es un supuesto con tradeoff entre robustez y exposición a XSS, revisable a cookies `httpOnly` si se requiere.

---

## Decisiones y limitaciones conocidas

- **Recuperación de contraseña:** `forgot-password` responde siempre con un mensaje genérico, exista o no la cuenta, para evitar enumeración de correos. Esto difiere de una excepción del RF-01 y se eligió la opción más segura; queda pendiente validarlo con el docente.
- **Escala de calificación:** el backend admite una escala configurable de 1 a 10 y expone la configuración al panel admin, pero la UI pública de calificación usa 5 estrellas porque RF-10 lo fija así. Si se exige reflejar la escala configurada en el perfil público, falta exponerla en un endpoint público.
- **Administrador y perfil:** el backend no exige perfil completo para las rutas admin, pero el guard global del frontend sí. Un administrador recién provisionado debe completar su perfil antes de usar `/admin`.
- **Notificaciones:** no hay WebSockets; el frontend consulta al enfocar o navegar y hace un polling ligero cada 15 segundos.
- **Geolocalización:** el orden por cercanía solo se aplica si el partido tiene coordenadas. No se solicita la ubicación del navegador.
- **Foto de perfil:** el esquema y los DTO admiten `profilePic` y la interfaz la muestra cuando existe, pero no hay carga de archivos en el frontend.
- **Correo:** en desarrollo solo existe el buzón simulado. No se incluye un proveedor real de correo.
- **Sesión:** se guarda en `localStorage` y el cliente distingue entre refresh inválido (limpia la sesión) y fallo de red (la conserva).
- **Build:** el bundle principal supera los 500 kB y Vite emite una advertencia no bloqueante. Si se requiere optimizar, se puede aplicar code splitting por rutas.
- **Pruebas de backend:** usan la base configurada y comparten configuración global; deben ejecutarse sobre una base de pruebas.

---

## Solución de problemas

### La API no arranca y muestra “Configuración inválida”

Revisa `backend/.env`: faltan variables obligatorias o los secretos tienen menos de 32 caracteres. Usa `backend/.env.example` como base.

### Error al conectar con PostgreSQL

- Verifica `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.
- Confirma que PostgreSQL esté iniciado y que la base exista.
- Comprueba que PostGIS esté instalado: `SELECT postgis_version();`.

### “No existe la tabla schema_migrations” al ejecutar seeds

Ejecuta primero:

```powershell
npm run db:migrate
```

### “La migración cambió después de aplicarse”

No edites migraciones ya aplicadas. Crea una migración nueva con el cambio correctivo.

### `403 PROFILE_INCOMPLETE`

El usuario debe completar nombre, teléfono, localidad y al menos una posición en `/perfil/completar`.

### El administrador entra pero no ve `/admin`

- Confirma que el usuario tenga rol `admin`.
- Completa su perfil si es la primera sesión.
- Si el rol cambió, cierra sesión y vuelve a entrar para refrescar la sesión.

### Errores de CORS

Agrega el origen exacto del frontend a `CORS_ORIGIN`. Puedes separar varios orígenes con coma. No incluyas una barra final.

### El CSV o la PWA no se actualizan

- El service worker solo se genera en el build. Recompila con `npm run build:web`.
- Para probar la PWA usa `npm run preview -w frontend`.
- Si un service worker antiguo queda activo, recarga forzada o borra los datos del sitio en el navegador.

### `429 RATE_LIMITED`

Espera la ventana configurada o ajusta `AUTH_RATE_LIMIT_MAX` / `PASSWORD_RESET_RATE_LIMIT_MAX` en desarrollo.

---

## Documentación adicional

- `docs/auth.http`: registro, login, refresco, logout y recuperación.
- `docs/profile.http`: perfil propio y perfil público.
- `docs/players.http`: búsqueda de jugadores y calificaciones.
- `docs/matches.http`: publicación, búsqueda, detalle y cancelación.
- `docs/requests.http`: solicitudes y respuestas.
- `docs/notifications.http`: listado y marcado de notificaciones.
- `docs/ratings.http`: calificaciones y perfiles.
- `docs/admin.http`: usuarios, contenidos, reportes y configuración.
- `docs/api.http`: salud y catálogo.

---

## Equipo y uso

Proyecto académico desarrollado por un equipo de 3 estudiantes para el curso de Ingeniería de Software. El repositorio no define una licencia de distribución; su uso está previsto para la entrega y evaluación del proyecto.
