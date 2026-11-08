# Uso desde Android e iOS

FutLink se entrega como **PWA instalable**: no requiere APK ni `.ipa` y funciona en Android e iOS desde el navegador.

> El teléfono **no se conecta a PostgreSQL**. La app habla con la API (Node/Express), y la API habla con la base de datos. Por eso "servidor" significa la API + PostgreSQL corriendo en tu PC o en otra máquina.

```
Celular  ──HTTPS──►  API (tu PC)  ──►  PostgreSQL + PostGIS (tu PC)
   PWA                 :3000                 :5432
```

## Requisitos

- Node.js 24 o superior y PostgreSQL con PostGIS ya configurados (ver README).
- El celular y la PC en la misma red WiFi (para el modo local).
- Para instalar la PWA hace falta **HTTPS**; el túnel del paso 3 lo proporciona.

## 1. Compilar y arrancar

Desde la raíz del repositorio, en PowerShell:

```powershell
npm install
npm run bundle
npm start
```

`npm run bundle` compila el backend y el frontend. `npm start` levanta la API y, además, sirve la PWA compilada en el mismo puerto (`http://localhost:3000`).

En la consola verás algo así:

```
FutLink API escuchando en el puerto 3000
La PWA compilada se sirve desde la misma API
Acceso desde la red local: http://192.168.1.10:3000
```

Verifica en la PC que `http://localhost:3000` abre la app y que `http://localhost:3000/api/health` responde JSON. Si no existe `frontend/dist`, el backend solo expone la API y avisa en el log.

## 2. Opción A: red local (HTTP)

Abre en el navegador del celular `http://<IP-de-tu-PC>:3000`, por ejemplo `http://192.168.1.10:3000`.

- Funciona para probar la app, pero **no se puede instalar como PWA** ni usar el service worker: los navegadores exigen HTTPS (salvo `localhost`).
- Windows puede bloquear el puerto. Abre PowerShell **como administrador** una vez:

```powershell
New-NetFirewallRule -DisplayName "FutLink API" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

Si cambias de red, la IP puede cambiar: vuelve a revisarla con `ipconfig`.

## 3. Opción B: túnel HTTPS (recomendado para instalar la PWA)

Instala Cloudflare Tunnel (una vez):

```powershell
winget install --id Cloudflare.cloudflared -e
```

Con `npm start` corriendo en otra terminal, crea el túnel:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Cloudflared imprime una URL pública temporal, por ejemplo:

```
https://palabras-aleatorias.trycloudflare.com
```

Abre esa URL en el celular. La PWA y la API comparten origen, así que no hay que configurar CORS ni la URL de la API.

### Instalar en Android (Chrome)

1. Abre la URL del túnel.
2. Menú ⋮ → **Instalar aplicación** (o **Agregar a pantalla principal**).
3. Queda como app independiente, con su icono y sin barra del navegador.

### Instalar en iOS (Safari)

1. Abre la URL del túnel **en Safari**.
2. Botón **Compartir** → **Añadir a pantalla de inicio**.
3. Confirma el nombre y abre FutLink desde el icono.

Limitaciones del túnel rápido:

- La URL cambia cada vez que reinicias `cloudflared`.
- No es un servicio con disponibilidad garantizada; sirve para demostraciones y pruebas.
- Cualquiera con la URL puede abrir la pantalla de login. Los datos siguen protegidos por autenticación y roles.
- Para una URL fija haría falta un túnel con nombre y un dominio en Cloudflare (fuera del alcance del MVP).

## 4. Cambiar de servidor desde la app

La app resuelve la API así:

1. Si guardaste una URL manual, usa esa.
2. Si corre compilada y servida por el backend, usa el mismo origen (`/api`). Esto cubre tanto la IP local como el túnel.
3. En desarrollo usa `VITE_API_URL`.

Para apuntar la app a **otra** máquina o a otro túnel:

1. Entra a **Servidor** (enlace al pie de las pantallas de acceso o en tu perfil), o abre `/servidor`.
2. Escribe la URL, por ejemplo `https://mi-servidor.com/api`. Si omites la ruta se usa `/api`.
3. Pulsa **Probar conexión**: consulta `/health` y confirma que la base de datos responde.
4. Pulsa **Guardar servidor**. Se cierra la sesión actual porque los tokens pertenecen al servidor anterior.

La elección se guarda en `localStorage['futlink.api-url']` del dispositivo. **Restaurar predeterminado** la borra.

Si la API vive en otro origen distinto al de la PWA, agrega ese origen a `CORS_ORIGIN` en `backend/.env` y reinicia la API.

## 5. Usar otro computador como servidor

1. Instala Node.js, PostgreSQL y PostGIS en esa máquina.
2. Copia el repositorio y crea `backend/.env` con sus propios `DB_*`, `JWT_ACCESS_SECRET` y `RESET_CODE_PEPPER`.
3. Ejecuta `npm install`, `npm run db:migrate`, `npm run db:seed` y `npm run bundle`.
4. Arranca con `npm start` y comprueba `/api/health`.
5. Desde el celular, usa la IP o el túnel de ese computador y configura la URL en **Servidor** si es distinta a la de la PWA.

Si compartes la misma base de datos entre máquinas, usa los **mismos** secretos JWT para que las sesiones emitidas por una API sean válidas en la otra.

## 6. PostgreSQL en una máquina distinta a la API

Solo si la base de datos no vive junto a la API. En el servidor de PostgreSQL:

1. En `postgresql.conf`, define `listen_addresses = '*'`.
2. En `pg_hba.conf`, permite tu red local (ejemplo para `192.168.1.0/24`):

```
host    all    all    192.168.1.0/24    scram-sha-256
```

3. Reinicia el servicio de PostgreSQL.
4. En `backend/.env` de la API, apunta `DB_HOST` a la IP de esa máquina.

**No expongas el puerto 5432 a Internet ni lo reenvíes en el router.** Para acceso remoto usa VPN o el túnel, nunca PostgreSQL abierto.

## 7. Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| El celular no abre la app | Firewall o IP incorrecta | Revisa `ipconfig`, abre el puerto 3000 y usa la misma WiFi |
| "No se pudo conectar" en la app | URL de API incorrecta o túnel cerrado | Usa **Servidor → Probar conexión** y revisa la terminal de `cloudflared` |
| No aparece "Instalar aplicación" | La página se abrió por HTTP | Usa la URL HTTPS del túnel |
| Error de CORS | PWA y API en orígenes distintos | Agrega el origen de la PWA a `CORS_ORIGIN` |
| No conecta con una URL `http://` | La app está abierta por HTTPS | El navegador bloquea contenido mixto: usa una API `https://` o abre la app por HTTP en la red local |
| `SERVE_WEB` avisa que falta `frontend/dist` | No compilaste el frontend | Ejecuta `npm run build:web` |
| La app muestra una versión vieja | Service worker con caché | Cierra y reabre la app; si persiste, borra los datos del sitio |
