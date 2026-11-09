# App móvil y servidor en la red local

FutLink entrega la misma interfaz web como PWA y como app nativa para Android e iOS. La app nativa se instala desde un APK/IPA y guarda la dirección del servidor en el teléfono. La base de datos permanece en el computador servidor: el móvil nunca se conecta a PostgreSQL.

```text
App FutLink (iOS/Android) ── Wi-Fi, HTTP local o HTTPS ──► API Node.js :3000 ──► PostgreSQL/PostGIS localhost:5432
```

La API escucha en `0.0.0.0:3000` para aceptar conexiones de la red local. PostgreSQL usa `DB_HOST=localhost`; no abras ni reenvíes el puerto `5432`.

## Requisitos

### Computador servidor

- Windows o Linux conectado a la misma red privada Wi-Fi que los teléfonos.
- Node.js 24 o superior.
- PostgreSQL con PostGIS, con la base `Futlink` creada y escuchando localmente.
- Puerto TCP `3000` permitido en el firewall del computador para el perfil de red privada.

### Para generar los ejecutables

- Android: Android Studio y Android SDK. El escáner QR usa Android SDK 26 como mínimo (Android 8+).
- iOS: macOS con Xcode 26 o superior. Capacitor 8 requiere macOS/Xcode para compilar y firmar iOS; desde Windows o Linux no se genera un `.ipa` instalable. [Requisitos de entorno de Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup).

## 1. Preparar el computador servidor (Windows o Linux)

Configura `backend/.env`. Para PostgreSQL instalado en ese mismo computador, conserva la conexión local:

```dotenv
HOST=0.0.0.0
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Futlink
DB_USER=tu_usuario
DB_PASSWORD=tu_clave
SERVE_WEB=true
```

Completa también `JWT_ACCESS_SECRET`, `RESET_CODE_PEPPER` y, en producción, las variables `SMTP_*` para recuperación de contraseña. No configures `DB_HOST` con la IP Wi-Fi del computador: la API y PostgreSQL están en la misma máquina.

Desde la raíz del repositorio:

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run bundle
npm start
```

En Linux, los mismos comandos funcionan desde Bash. Al arrancar, la API imprime las direcciones IPv4 de las interfaces de red. Usa la dirección de la interfaz Wi-Fi, por ejemplo `192.168.1.10`.

### Permitir conexiones de teléfonos

En Windows, abre PowerShell como administrador una sola vez:

```powershell
New-NetFirewallRule -DisplayName "FutLink API Wi-Fi" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

En Linux con UFW, limita el acceso al rango de tu red Wi-Fi. Ajusta el rango si tu router usa otra subred:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
```

No abras el puerto `5432` en el firewall. Si el Wi-Fi es una red de invitados o tiene “client/AP isolation”, los teléfonos no podrán llegar al computador; conecta ambos a la red privada normal. Para que la IP no cambie, reserva la dirección del computador en el router.

Comprueba en el propio computador:

- App web: `http://localhost:3000`
- Salud API + conexión de base: `http://localhost:3000/api/health`
- Prueba desde otro equipo de la red: `http://192.168.1.10:3000/api/health`

La respuesta de salud debe informar que la API, la base de datos y PostGIS están disponibles.

## 2. Generar e instalar Android

En el computador de desarrollo con Android Studio instalado:

```powershell
npm install
npm run mobile:sync
npx cap open android
```

En Android Studio, conecta un teléfono por USB o selecciona un emulador y pulsa **Run** para probar. Para crear un APK de instalación, selecciona **Build → Build Bundle(s) / APK(s) → Build APK(s)**. Android Studio muestra dónde guardó el APK; el artefacto de depuración suele quedar en `android/app/build/outputs/apk/debug/app-debug.apk`.

Para distribuir a usuarios, crea un APK/AAB de release firmado desde **Build → Generate Signed Bundle / APK**. No compartas un APK de debug como distribución de producción.

## 3. Generar e instalar iOS

En un Mac con Xcode 26 o superior:

```bash
npm install
npm run mobile:sync
npx cap open ios
```

En Xcode, selecciona el equipo de destino y configura el equipo de firma. Para probar en un iPhone, pulsa **Run**. Para distribuir, crea un archive firmado con la cuenta y el perfil de aprovisionamiento correspondientes. La firma, instalación fuera del App Store y distribución requieren la configuración de Apple correspondiente.

## 4. Conectar el móvil al servidor por QR

1. Verifica que el teléfono y el computador servidor estén en la misma Wi-Fi privada.
2. En el computador, abre la URL LAN que imprimió FutLink, por ejemplo `http://192.168.1.10:3000/servidor`. No uses `localhost` en esta página.
3. La pantalla **Servidor** muestra un QR con la dirección de la API del computador.
4. Abre FutLink en el teléfono. En el primer inicio se abre la pantalla **Servidor**. Pulsa **Escanear QR del servidor** y apunta al QR del computador.
5. Pulsa **Probar conexión** y luego **Guardar servidor**. Inicia sesión.

Si prefieres, escribe la URL manualmente: `http://192.168.1.10:3000/api`. Cambia `192.168.1.10` por la IP Wi-Fi real del servidor.

La app comprueba `/api/health` antes de guardar y verifica que la base responda. En iOS aparecerá una solicitud del sistema para permitir el acceso a la red local y, al escanear, a la cámara. Autoriza ambas funciones para completar la conexión.

La app permite HTTP sin cifrar solo hacia direcciones privadas/locales. Usa esta opción únicamente en una Wi-Fi de confianza: otros dispositivos con acceso a esa red podrían observar el tráfico. Para conectarte desde fuera de la red, usa HTTPS; no expongas PostgreSQL ni el puerto 5432 a Internet.

## 5. PWA y acceso por HTTPS

La PWA sigue disponible en el navegador. Para instalarla como acceso directo, abre el servidor mediante HTTPS. En una demostración se puede usar un túnel, pero su URL temporal cambia y depende del servicio de túnel. Para una instalación nativa en Android/iOS dentro de la misma Wi-Fi, usa el APK/IPA y la conexión LAN por QR descrita arriba.

## 6. PostgreSQL en otro computador (opcional)

Solo cambia esto si PostgreSQL no está junto a la API. Configura PostgreSQL para aceptar conexiones desde la subred privada, permite ese origen en `pg_hba.conf` y establece `DB_HOST` con la IP del equipo de base. Mantén el puerto 5432 restringido a esa LAN y no lo reenvíes al router. El caso recomendado y más simple es API y PostgreSQL en el mismo computador, con `DB_HOST=localhost`.

## Solución de problemas

| Síntoma | Comprobación o solución |
| --- | --- |
| El móvil no abre la IP | Usa la IPv4 de Wi-Fi del servidor, confirma que los equipos no están en una red de invitados y permite TCP 3000 en firewall privado. |
| `/api/health` no responde | Comprueba `npm start`, `HOST=0.0.0.0`, el firewall y que el puerto 3000 no esté ocupado. |
| La API abre pero indica que la base está caída | Revisa PostgreSQL, PostGIS, `DB_HOST=localhost`, puerto, base, usuario y contraseña en `backend/.env`. |
| El lector QR no abre cámara | Autoriza cámara para FutLink en Ajustes del teléfono; Android requiere SDK mínimo 26 para el plugin. |
| iOS no puede conectar a la LAN | Acepta el permiso de red local, asegúrate de usar una IP privada y vuelve a probar. |
| Después de cambiar el servidor no conecta | Abre **Servidor**, escanea el QR actualizado y prueba la conexión. Una IP DHCP puede cambiar; reserva la IP en el router. |
| “No seguro” o contenido HTTP bloqueado en un navegador | Es normal en una PWA servida por HTTP. Usa el ejecutable nativo para LAN o sirve la PWA bajo HTTPS. |
| Se necesita otro puerto | Cambia `PORT` en `backend/.env`, reinicia la API y actualiza la regla del firewall y la URL/QR. |
