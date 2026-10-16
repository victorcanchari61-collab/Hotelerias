# Abrir Hotelerias en Laragon: `http://hotelerias.test/`

Mismo patrón que `Ecommerce.test` y `Minimarket.test`: Apache sirve el frontend compilado
(`frontend/dist`) y manda `/api` al backend en Go.

```
navegador ──► http://hotelerias.test ──► Apache (Laragon)
                                          ├─ /            → frontend/dist (SPA, con fallback a index.html)
                                          ├─ /api/…       → http://127.0.0.1:5220/api/…   (backend Go)
                                          └─ /uploads/…   → http://127.0.0.1:5220/uploads/…
```

## Puesta en marcha

1. **El vhost** ya está en `C:\laragon\etc\apache2\sites-enabled\00-hotelerias.test.conf`
   (copia versionada en [`00-hotelerias.test.conf`](00-hotelerias.test.conf)).
   Si lo pierdes, vuelve a copiarlo ahí.

2. **Reiniciar Apache**. En esta máquina Apache corre como **servicio de Windows**
   (`Apache2.4`), por lo que los botones Stop/Start/Reload de Laragon **no lo reinician**.
   En PowerShell **como administrador**:

   ```powershell
   Restart-Service Apache2.4
   ```

   Y agrega el nombre al archivo `hosts` (también como administrador; Laragon lo hace solo
   únicamente cuando es él quien maneja Apache):

   ```powershell
   Add-Content C:\Windows\System32\drivers\etc\hosts "127.0.0.1      Hotelerias.test"
   ```

3. **Compilar el frontend** (Apache sirve `dist/`, no el código fuente):

   ```bash
   cd frontend
   npm run build            # o:  npx vite build --watch   para recompilar al guardar
   ```

4. **Levantar el backend** en el puerto 5220. Dos formas:

   **a) En segundo plano, que arranca solo** (recomendada para uso diario). Una sola vez:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\laragon\backend-ctl.ps1 install
   ```

   Ver [Backend en segundo plano](#backend-en-segundo-plano).

   **b) A mano, en una terminal** (útil mientras desarrollas el backend):

   ```bash
   cd backend
   cp config.example.yaml config.yaml   # si no existe; ajusta la cadena de PostgreSQL
   go run .
   ```

   En ambos casos la base de la cadena de conexión **tiene que existir** y el `config.yaml`
   debe apuntar a ella (aquí: `dbname=hoteleria`). Si no existe, el backend se detiene al arrancar.

5. Abrir **http://hotelerias.test/**.

## Backend en segundo plano

Apache (igual que Nginx en un VPS) **solo hace de proxy**: no puede lanzar el binario de Go.
En el VPS lo mantiene vivo systemd, pm2 o Docker; en Windows hace falta algo equivalente.
[`backend-ctl.ps1`](backend-ctl.ps1) es ese equivalente, sin instalar nada ni pedir administrador:

```
Programador de tareas ──► backend-ctl.ps1 run (vigilante, oculto) ──► backend.exe
   al iniciar sesión          relanza si muere con error                :5220
```

| Comando (`backend-ctl.ps1 <acción>`) | Qué hace |
|---|---|
| `install` | Compila, registra la tarea `Hotelerias-Backend` (al iniciar sesión) y lo inicia |
| `status` | Si corre, su PID, `/api/health` y las últimas líneas del log |
| `restart` | Compila de nuevo y reinicia — **tras cambiar código Go** |
| `stop` / `start` | Detiene / inicia |
| `logs` | Sigue el log en vivo (`backend/logs/backend.log`) |
| `uninstall` | Quita el autoarranque y lo detiene |

- **Si el backend se cae**, el vigilante lo relanza con pausas crecientes (2, 4, 6… hasta 60 s;
  si falla al instante porque PostgreSQL está apagado, no gira en vacío). Un cierre ordenado
  (código 0) **no** se reinicia.
- El log está en `backend/logs/backend.log` y se rota solo al pasar de 5 MB.
- No lo ejecutes además con `go run .` a la vez: ambos pelean por el puerto 5220.

**Qué está verificado y qué no**

| | |
|---|---|
| ✅ | Arranca como tarea oculta, responde en `:5220` y por `http://hotelerias.test/api/health` |
| ✅ | El vigilante relanza un ejecutable que siempre se cae (con un ejecutable de mentira) y no reinicia uno que termina bien |
| ✅ | `restart` recompila y reinicia |
| ⚠️ | **No probado:** que arranque tras cerrar e iniciar sesión en Windows |
| ⚠️ | **No probado con el backend real:** matarlo a la fuerza (`taskkill /F /IM backend.exe`) y ver que vuelve |

> Una primera versión confiaba en la opción "reiniciar si falla" del Programador de tareas y
> **no funcionaba**: un proceso que termina con código distinto de cero no la dispara (el backend
> quedó apagado cuatro minutos). Por eso la vigilancia la hace el propio script.

## Qué esperar hoy

- La página abre (pantalla de login) aunque el backend esté apagado: Apache sirve el frontend solo.
- Con el backend apagado, `/api/...` responde **503**; la app lo muestra como "No pudimos conectar con el servidor".
- **El login funciona** con el super administrador sembrado: correo `admin@hotelerias.test`, contraseña
  en `backend\.env` (`ADMININICIAL_PASSWORD`). Si el backend arranca sin esa variable, no se crea ningún usuario.
- Crear, editar y eliminar usuarios todavía no existe en el backend (ver `docs/CAMBIOS.md`).

## Verificado

El vhost se probó en una instancia de Apache descartable (puerto 8099) antes de instalarlo:

| Petición | Resultado |
|---|---|
| `/`, `/login`, `/config/usuarios` | 200 → `index.html` (el fallback de la SPA funciona al refrescar o abrir directo) |
| `/assets/*.js` | 200, `text/javascript` |
| `/api/...` sin backend | 503 |
| `/api/...` con un backend simulado | llega al backend (el `POST /api/auth/login` devolvió 200) |

## Si algo no abre

| Síntoma | Causa probable |
|---|---|
| "No se puede acceder a este sitio" | Falta la línea del `hosts` (paso 2) |
| Abre la página de **Laragon** (o la de otro proyecto) | Apache no leyó el vhost. Si corre como servicio: `Restart-Service Apache2.4` como administrador. Comprobar: `Get-Service Apache2.4` y si el proceso `httpd.exe` arrancó antes de que instalaras el vhost |
| El backend "no corre" tras reiniciar Windows | `backend-ctl.ps1 status`; si la tarea no está, `install` de nuevo |
| Pantalla en blanco | `frontend/dist` no existe o está vacío: falta el paso 3 |
| `/api` da 503 | El backend no está corriendo en el 5220 (paso 4) |
| Los cambios del código no se ven | Hay que volver a compilar (paso 3); Apache sirve `dist/` |
