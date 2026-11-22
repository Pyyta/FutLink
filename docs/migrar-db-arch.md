# Migrar FutLink a Arch Linux

Esta guía mueve **la base PostgreSQL completa** (esquema, tablas, datos, secuencias, índices y extensión PostGIS) del computador actual a Arch Linux. No reconstruye la base desde migraciones ni desde seeds: restaura un respaldo íntegro. La API y PostgreSQL deben quedar en el mismo computador Arch; por eso la API usa `DB_HOST=localhost` y el puerto 5432 no se expone a la Wi-Fi.

## Estado del origen detectado

En el computador Windows de origen están instalados PostgreSQL 18.6 y PostGIS 3.6; la base `Futlink` ocupa aproximadamente 18 MB. El respaldo se genera con `pg_dump` en formato custom comprimido. Arch publica PostgreSQL y PostGIS en sus repositorios oficiales; usa la misma versión mayor de PostgreSQL (18) o una superior compatible al restaurar.

## 1. Preparar una copia de seguridad en Windows

1. Deja listo el computador Arch y conecta ambos equipos por una red segura o usa una memoria USB confiable.
2. Elige una ventana de mantenimiento. **Detén la API de FutLink en Windows** para que no entren cambios durante el respaldo final. No detengas PostgreSQL.
3. Abre PowerShell en la carpeta raíz del repositorio y ejecuta:

   ```powershell
   .\scripts\backup-db-windows.ps1
   ```

   El script lee los parámetros `DB_*` de `backend/.env`, usa la instalación local de PostgreSQL, crea el archivo por defecto dentro de `Documents\FutLink-db-migration`, comprueba que `pg_restore` lo pueda listar y calcula SHA-256. No escribe contraseñas en la línea de comandos, el respaldo ni el registro.

4. Guarda juntos el `.dump`, su `.sha256` y el `.list.txt`. El `.dump` tiene todos los registros de la base e incluye datos sensibles (perfiles y hashes de contraseña): **no lo subas al repositorio ni lo envíes por un canal público**.
5. Copia los tres archivos al computador Arch, por ejemplo a `~/FutLink-db-migration/`, mediante USB confiable o SSH. En Arch verifica el archivo (ajusta el nombre):

   ```bash
   cd ~/FutLink-db-migration
   sha256sum -c Futlink-AAAAmmdd-HHMMSS.dump.sha256
   ```

   Debe informar `OK`.

## 2. Instalar e iniciar PostgreSQL/PostGIS en Arch

En una terminal de Arch:

```bash
sudo pacman -Syu
sudo pacman -S postgresql postgis
```

Solo si PostgreSQL **nunca se había inicializado** en este Arch, crea el clúster por defecto una sola vez:

```bash
sudo -iu postgres initdb -D /var/lib/postgres/data
```

Si `/var/lib/postgres/data/PG_VERSION` ya existe, no ejecutes `initdb`: podría inicializarse otro clúster sobre un equipo que ya tiene datos. En ese caso conserva el clúster y continúa.

Inicia PostgreSQL y habilítalo al arrancar:

```bash
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

Arch usa `initdb` para crear el clúster y el servicio `postgresql.service` para iniciarlo. PostGIS se instala en el sistema y se activa como extensión en cada base que lo necesita ([ArchWiki PostgreSQL](https://wiki.archlinux.org/title/PostgreSQL), [ArchWiki PostGIS](https://wiki.archlinux.org/title/PostGIS)).

## 3. Restaurar en una base nueva

Desde la raíz del repositorio FutLink en Arch (o copia `scripts/restore-db-arch.sh` al equipo), ejecuta:

```bash
bash scripts/restore-db-arch.sh ~/FutLink-db-migration/Futlink-AAAAmmdd-HHMMSS.dump Futlink futlink_app
```

El restaurador valida el archivo y exige que no exista ya la base `Futlink` ni el rol `futlink_app`. **No borra ni reemplaza bases existentes.** Crea un rol con privilegio temporal de superusuario porque la restauración completa necesita crear PostGIS, carga el respaldo en una transacción y lo degrada a `NOSUPERUSER` al terminar. Te pedirá dos veces una contraseña nueva para `futlink_app`; guárdala para el paso siguiente. Si una restauración falla, el script elimina la base y el rol que él mismo creó.

Al terminar, comprueba que aparezcan la versión PostGIS, los conteos de usuarios/partidos y las migraciones aplicadas. La extensión PostGIS está dentro del respaldo; el paquete instalado en Arch aporta sus archivos binarios.

## 4. Configurar FutLink en Arch

1. Copia el repositorio al computador Arch y prepara Node.js y npm con la versión que requiere el proyecto (`Node.js 24 o superior`). Instala dependencias desde la raíz:

   ```bash
   npm ci
   ```

2. Copia de forma privada la configuración actual `backend/.env` al Arch y edita solo las variables de conexión. Conserva `JWT_ACCESS_SECRET` y `RESET_CODE_PEPPER` si quieres mantener sesiones/tokens existentes y códigos de recuperación vigentes; nunca subas el archivo `.env` al repositorio.

   ```dotenv
   HOST=0.0.0.0
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=futlink_app
   DB_PASSWORD=LA_CONTRASEÑA_QUE_DEFINISTE
   DB_NAME=Futlink
   SERVE_WEB=true
   ```

   Si `NODE_ENV=production`, configura también SMTP para recuperación de contraseña. Mantén PostgreSQL escuchando solo localmente; **no abras el puerto 5432 en el firewall ni en el router**.

3. Desde la raíz, valida el estado migrado. Este comando solo informa el estado; no aplica cambios:

   ```bash
   npm run db:migrate:status
   ```

   Todas las migraciones existentes deben figurar como aplicadas. No ejecutes `npm run db:seed`: el respaldo ya incluye el contenido y los seeds no participan en la migración.

4. Compila y arranca la API:

   ```bash
   npm run bundle
   npm start
   ```

5. Desde el propio Arch, verifica la salud:

   ```bash
   curl --fail http://localhost:3000/api/health
   ```

   La respuesta debe indicar que API, base de datos y PostGIS están disponibles. Permite TCP 3000 solo en la interfaz/subred privada necesaria para los teléfonos y deja 5432 cerrado a la red.

## 5. Conectar los teléfonos y cerrar la migración

1. Conecta teléfono y Arch a la misma Wi-Fi privada.
2. En el navegador del computador abre la pantalla del servidor, por ejemplo `http://192.168.1.20:3000/servidor`; ahí aparece el QR. La ruta `/api/health` solo muestra el JSON de salud y no incluye el QR.
3. En el ejecutable móvil, escanea el QR. Para escribirlo manualmente, usa `http://192.168.1.20:3000/api`.
4. Prueba inicio de sesión, lista de partidos, perfil, ubicación y creación de un partido.
5. Mantén PostgreSQL y la API antiguos detenidos, pero **conserva el origen y el `.dump` sin cambios** hasta terminar la validación y tener otro respaldo del Arch.
6. Una vez aceptado el cambio, define una copia periódica de la base Arch y cifra/limita el acceso a los respaldos.

Si una interrupción eléctrica o cierre forzado corta el restaurador antes de que pueda ejecutar su limpieza, revoca a mano el privilegio temporal después de reiniciar PostgreSQL:

```bash
sudo -u postgres psql -d postgres -c 'ALTER ROLE futlink_app NOSUPERUSER;'
```

## Si algo falla

- `pg_restore: unsupported version`: usa `pg_restore` de PostgreSQL 18 o posterior en Arch; el origen detectado es 18.6.
- Falta `postgis.control` o no se encuentra la extensión: comprueba `pacman -Q postgis` e instala el paquete antes de repetir la restauración.
- El script dice que la base ya existe: detente y revisa qué datos hay en ella. El script se niega a sobrescribirla; no la borres sin respaldarla y confirmar que es el destino correcto.
- Falló la restauración: el script quita la base creada durante ese intento; revisa el mensaje. El respaldo de origen no se modifica y puede usarse para repetir el proceso.
- API no conecta: revisa `DB_HOST=localhost`, usuario/contraseña, `sudo systemctl status postgresql` y `journalctl -u postgresql`.
- El teléfono no llega: revisa `HOST=0.0.0.0`, la regla del firewall para TCP 3000 y que el Wi-Fi no aísle los clientes.
