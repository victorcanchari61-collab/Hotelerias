# Preguntas sobre cómo corre el proyecto en la PC con Ubuntu

**Para quién es:** para quien abra este archivo en la PC con Ubuntu (la de `/var/www/Hotelerias`).
Hay que **responder cada pregunta en este mismo archivo**, debajo de ella, y subirlo de nuevo.

**Por qué se pregunta:** en la PC con Windows (Laragon) el backend arranca solo porque existe una tarea
programada de Windows que ejecutaba un script del repo. En Ubuntu el backend también está corriendo al
prender la PC sin que nadie ejecute `go run .`, pero **no sabemos qué lo arranca** ni cómo se sirve el
frontend. Con las respuestas se documenta un despliegue repetible, sin adivinar y sin ejecutables en el repo.

> **No pegues contraseñas, claves ni el contenido de `.env` o `config.yaml`.** Donde haga falta ver qué
> variables existen, usa los comandos de abajo, que muestran solo los *nombres*.

> **RESPUESTAS COMPLETADAS** el 17 de octubre de 2026 en la PC con Ubuntu
> (`victor-ASUS`, usuario `victor`, proyecto en `/var/www/Hotelerias`).

---

## Atajo: juntar la información de una vez

Corre este bloque en la PC con Ubuntu **desde la carpeta del proyecto** y pega el resultado en la sección
"Resultado de los comandos" al final. Solo lee, no cambia nada y no imprime secretos.

```bash
cd /var/www/Hotelerias
echo "== Versiones =="; go version; node -v; npm -v; psql --version; nginx -v 2>&1; apache2 -v 2>&1 | head -1
echo "== Servicios systemd relacionados =="; systemctl list-units --type=service --all | grep -i -E "hotel|backend|nginx|apache|postgres|redis|mongo"
echo "== Procesos en el puerto del backend (5220) y web (80/443) =="; sudo ss -ltnp | grep -E ":5220|:80 |:443 |:5173 "
echo "== Procesos relacionados =="; ps aux | grep -i -E "backend|hotelerias|go run|vite|node|pm2" | grep -v grep
echo "== pm2 =="; pm2 list 2>&1 | head -20
echo "== Docker =="; docker ps 2>&1 | head -10
echo "== crontab del usuario =="; crontab -l 2>&1
echo "== Sitios de nginx habilitados =="; ls /etc/nginx/sites-enabled/ 2>&1
echo "== Sitios de apache habilitados =="; ls /etc/apache2/sites-enabled/ 2>&1
echo "== Archivos del backend (sin contenido) =="; ls -la backend | head -30
echo "== Variables definidas en backend/.env (solo nombres) =="; grep -o '^[A-Za-z_]*=' backend/.env 2>&1
echo "== Carpeta dist del frontend =="; ls -la frontend/dist 2>&1 | head -8
echo "== Git =="; git remote -v; git log --oneline -3
```

---

## 1. Backend (el servidor en Go)

1. **¿Qué lo arranca al prender la PC?** Marca una y completa:
   - [ ] Servicio de `systemd` (nombre: ______)
   - [ ] `pm2`
   - [ ] Docker / docker compose
   - [ ] `crontab` con `@reboot`
   - [ ] Un script en `/etc/rc.local` o en "Aplicaciones al inicio"
   - [x] Otro: **arranque MANUAL con `nohup`/`setsid` (NO es automático). No hay ningún mecanismo de arranque al prender la PC.**
   - [ ] No sé
2. **¿Cuál es el comando exacto que ejecuta?** (por ejemplo `/var/www/Hotelerias/backend/backend` o `go run .`)

   > `cd /var/www/Hotelerias/backend && setsid nohup go run main.go > /tmp/hotelerias.log 2>&1 &`

3. **¿Corre un binario ya compilado o compila al vuelo?** Si es un binario, ¿dónde está el archivo y quién lo compila?

   > Compila **al vuelo** con `go run main.go`. **No hay binario compilado** en el repo (se eliminó
   > `backend.exe~`). Se compila cada vez que se levanta.

4. **¿Desde qué carpeta y con qué usuario corre?**

   > Desde `/var/www/Hotelerias/backend`, con el usuario del sistema **`victor`**.

5. **¿En qué puerto escucha?** ¿Es el 5220 o cambiaste `SERVER_PORT`?

   > Puerto **5220** (`SERVER_PORT=5220` en `.env` y `Server.Port: 5220` en `config.yaml`; no se cambió).

6. **¿Cómo se reinicia?** (el comando que usas cuando cambias código)

   > ```
   > pkill -f "go run main.go"
   > cd /var/www/Hotelerias/backend && setsid nohup go run main.go > /tmp/hotelerias.log 2>&1 &
   > ```

7. **¿Qué pasa si se cae?** ¿Se vuelve a levantar solo?

   > **No se vuelve a levantar solo.** Si el proceso muere, hay que lanzarlo de nuevo a mano.

8. **¿Dónde ves sus mensajes (logs)?** (`journalctl -u ...`, un archivo, `pm2 logs`, etc.)

   > En el archivo **`/tmp/hotelerias.log`** (con `cat /tmp/hotelerias.log`). No usa journald ni pm2.

**Respuestas:**

```
1. NADA lo arranca automáticamente al prender la PC. Se levantó a mano con nohup/setsid.
   (No hay servicio systemd, ni pm2, ni Docker, ni crontab, ni rc.local para el backend.)
2. Comando: cd /var/www/Hotelerias/backend && setsid nohup go run main.go > /tmp/hotelerias.log 2>&1 &
3. Compila al vuelo con "go run" (no hay binario compilado).
4. Desde /var/www/Hotelerias/backend, usuario victor.
5. Puerto 5220 (no se cambió).
6. Reinicio: matar el proceso (pkill -f "go run main.go") y volver a lanzarlo.
7. Si se cae NO se levanta solo. Hay que lanzarlo a mano.
8. Logs en /tmp/hotelerias.log.
```

---

## 2. Frontend (la web y el panel)

1. **¿Cómo se sirve?** Marca una:
   - [ ] Servidor de desarrollo (`npm run dev`, puerto 5173)
   - [x] La carpeta compilada `frontend/dist` servida por **Nginx**
   - [ ] La carpeta compilada `frontend/dist` servida por **Apache**
   - [ ] Otro: ______
2. **¿Quién arranca eso al prender la PC?** (si es `npm run dev`, ¿con qué?)

   > Lo sirve **Nginx**, que sí es un servicio de `systemd` habilitado (`nginx.service`) y
   > **arranca solo** al prender la PC. No hay `npm run dev`.

3. **Si es Nginx o Apache:** ¿en qué archivo está la configuración del sitio y qué dominio o IP responde?
   (pega ese archivo, no tiene secretos)

   > Archivo: **`/etc/nginx/sites-available/hotelerias`** (enlazado en `sites-enabled/`).
   > Dominio: **`hotelerias.test`** (resuelto en `/etc/hosts` → `127.0.0.1`).

   ```nginx
   server {
       listen 80;
       server_name hotelerias.test;
       root /var/www/Hotelerias/frontend/dist;
       index index.html;

       location / { try_files $uri $uri/ /index.html; }

       location /api {
           proxy_pass http://127.0.0.1:5220;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location /uploads {
           proxy_pass http://127.0.0.1:5220;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       location /hubs {
           proxy_pass http://127.0.0.1:5220;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       error_page 404 /index.html;
       location ~ /\.(?!well-known).* { deny all; }
   }
   ```

4. **¿Cómo llega `/api/...` al backend?** (proxy a `127.0.0.1:5220`, ¿o de otra forma?)

   > Por **proxy de Nginx** (`proxy_pass http://127.0.0.1:5220`). Igual para `/uploads` y `/hubs`
   > (WebSocket con cabeceras de upgrade).

5. **¿Cómo actualizas el frontend después de un `git pull`?** (`npm run build`, ¿se copia a algún lado?)

   > Con `npm run build` en `/var/www/Hotelerias/frontend`. Genera la carpeta `dist/`, que Nginx
   > sirve **directamente** (no se copia a ningún otro lado).

6. **¿Con qué dirección entras desde el navegador?** (`http://localhost`, una IP, un dominio…)

   > `http://hotelerias.test`

**Respuestas:**

```
1. Nginx sirviendo la carpeta compilada frontend/dist.
2. Nginx (servicio systemd, habilitado, arranca solo al prender la PC).
3. Config en /etc/nginx/sites-available/hotelerias ; dominio hotelerias.test (en /etc/hosts -> 127.0.0.1). (archivo pegado arriba)
4. /api llega por proxy de Nginx a http://127.0.0.1:5220 (igual /uploads y /hubs).
5. Se actualiza con npm run build; Nginx sirve dist/ directo (no se copia a ningún lado).
6. Se entra por http://hotelerias.test
```

---

## 3. Base de datos

1. **¿PostgreSQL corre en esa misma PC?** ¿Qué versión?

   > Sí, **PostgreSQL 18.6** en la misma PC (servicio `postgresql@18-main`, arranca solo).
2. **¿Cómo se llama la base y qué usuario la usa?** (sin contraseña)

   > Base: **`hoteleria`**. Usuario: **`postgres`**.
3. **¿Usas Redis o MongoDB?** (son opcionales; el proyecto funciona sin ellos)

   > Redis: **sí está instalado y corriendo** (`redis-server`, puerto 6379), sin contraseña.
   > MongoDB: **instalado pero NO funciona** en este kernel (7.0); el backend avisa
   > "MongoDB no disponible" pero **sigue funcionando** (solo lo usa para logs).
4. **¿Hay datos reales o es solo de prueba?** ¿Tiene `DEMO_DATOS=true`?

   > Datos de **prueba** (seed de demo). `DEMO_DATOS=false`.

**Respuestas:**

```
1. Sí, PostgreSQL 18.6 en la misma PC.
2. Base "hoteleria", usuario "postgres".
3. Redis: sí (opcional, corriendo). MongoDB: instalado pero no funciona en este kernel (no crítico).
4. Datos de prueba; DEMO_DATOS=false.
```

---

## 4. Configuración y secretos

1. **¿Dónde están `.env` y `config.yaml`?** (la ruta; nunca el contenido)

   > `/var/www/Hotelerias/backend/.env` y `/var/www/Hotelerias/backend/config.yaml`.
2. **¿Quién los creó y están respaldados en otro lado?** No viajan por git, así que si se pierde la PC se pierden.

   > Se crearon **al levantar el proyecto en Ubuntu** (a partir de `.env.example` y
   > `config.example.yaml`). **No están respaldados** en otro lado.
3. **¿Cambiaste la contraseña del administrador inicial** respecto a la de ejemplo?

   > Sí, se cambió respecto a la de ejemplo (ya no es `CAMBIAR_MINIMO_10_CARACTERES`).
   > Está también en `/var/www/documentacion-entorno.txt` de esta PC (no en git).

**Respuestas:**

```
1. /var/www/Hotelerias/backend/.env y /var/www/Hotelerias/backend/config.yaml
2. Creados al levantar el proyecto en Ubuntu; NO están respaldados en otro lado.
3. Sí, se cambió respecto a la de ejemplo.
```

---

## 5. Cómo se actualiza hoy

Describe, paso a paso, qué haces cuando subes cambios desde otra PC y quieres verlos en esta:

1. `cd /var/www/Hotelerias && git pull`
2. `cd frontend && npm run build` (solo si hubo cambios en el frontend)
3. Reiniciar el backend: `pkill -f "go run main.go"` y volver a lanzarlo

¿Hay algún script que lo haga? ¿Cuál?

> **No hay ningún script.** Son pasos manuales.

**Respuestas:**

```
1. git pull en /var/www/Hotelerias
2. npm run build en frontend (si cambió el frontend)
3. Reiniciar el backend (pkill + go run main.go)
No hay script; se hace a mano.
```

---

## 6. Para qué es esa PC

1. **¿Es solo otra PC de desarrollo o es el servidor real** al que entra más gente?

   > PC de **desarrollo local**. No es un servidor de producción.
2. **¿Se entra desde otras computadoras o solo desde esa?**

   > Solo desde **esa** PC. El dominio `hotelerias.test` se resuelve localmente en `/etc/hosts`.
3. **¿Tiene HTTPS (candadito)?** ¿Con qué certificado?

   > **No tiene HTTPS.** Solo HTTP local (`http://hotelerias.test`). Sin certificado.
4. **¿Quieres que se deje documentado un despliegue** para esa PC, con un servicio `systemd` para el backend
   y la configuración de Nginx lista, en una carpeta `deploy/` del repo? (solo texto y configuración,
   **ningún ejecutable**)

   > **Sí**, conviene dejar en `deploy/` el servicio `systemd` del backend y la config de Nginx,
   > solo texto (sin ejecutables).

**Respuestas:**

```
1. PC de desarrollo local (no es servidor real de producción).
2. Solo desde esa PC (el dominio .test se resuelve en /etc/hosts local).
3. No tiene HTTPS; solo HTTP local.
4. Sí, conviene documentar el despliegue en deploy/ (systemd + nginx, solo texto).
```

---

## Resultado de los comandos del atajo

```
== Versiones ==
go version go1.27.2 linux/amd64
v20.20.2
10.8.2
psql (PostgreSQL) 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
nginx version: nginx/1.28.3 (Ubuntu)
apache2: orden no encontrada (Apache NO está instalado)

== Servicios systemd relacionados ==
● mongod.service          loaded    failed   failed   MongoDB Database Server
  nginx.service           loaded    active   running  A high performance web server and a reverse proxy server
  postgresql.service      loaded    active   exited   PostgreSQL RDBMS
  postgresql@18-main.service loaded active  running  PostgreSQL Cluster 18-main
  redis-server.service    loaded    active   running  Advanced key-value store

== Procesos en el puerto del backend (5220) y web (80/443) ==
LISTEN 0 511 0.0.0.0:80 0.0.0.0:*     (Nginx)
(No aparecía nada en el 5220 al momento de correr el atajo: el backend estaba caído; se reinició después)

== Procesos relacionados ==
(No aparecía ningún proceso "go run"/"backend"/"hotelerias"/vite.
 ps aux solo mostró Android Studio, VS Code y Brave del usuario victor.)

== pm2 ==
pm2: orden no encontrada  (pm2 NO está instalado)

== Docker ==
docker: orden no encontrada  (Docker NO está instalado)

== crontab del usuario ==
no crontab for victor

== Sitios de nginx habilitados ==
api-sunat
hotelerias
pagina_credigo

== Sitios de apache habilitados ==
/etc/apache2/sites-enabled/: No existe el archivo o directorio  (Apache NO está instalado)

== Archivos del backend (sin contenido) ==
.env  .env.example  .gitignore  README.md
config/  config.example.yaml  config.yaml  go.mod  go.sum  internal/  main.go  migrations/  pkg/

== Variables definidas en backend/.env (solo nombres) ==
CONNECTIONSTRINGS_POSTGRESQL
CONNECTIONSTRINGS_REDIS
CONNECTIONSTRINGS_MONGODB
MONGODBSETTINGS_DATABASENAME
JWTSETTINGS_SECRETKEY
JWTSETTINGS_ISSUER
JWTSETTINGS_AUDIENCE
JWTSETTINGS_EXPIRATIONHOURS
ADMININICIAL_EMAIL
ADMININICIAL_PASSWORD
DEMO_DATOS
APISPERU_TOKEN
SERVER_PORT
SERVER_UPLOADSDIR

== Carpeta dist del frontend ==
assets/  favicon.svg  icons.svg  index.html

== Git ==
origin  git@github.com:victorcanchari61-collab/Hotelerias.git (fetch)
origin  git@github.com:victorcanchari61-collab/Hotelerias.git (push)
e607760 docs: preguntas para documentar cómo corre el proyecto en la PC con Ubuntu
b0da0f9 feat: add guide for uploading changes to the repository with Git
f4854d6 feat: agregar patrón para ignorar archivos binarios temporales (*.exe~) en .gitignore
```
