# Preguntas sobre cómo corre el proyecto en la PC con Ubuntu

**Para quién es:** para quien abra este archivo en la PC con Ubuntu (la de `/var/www/Hotelerias`).
Hay que **responder cada pregunta en este mismo archivo**, debajo de ella, y subirlo de nuevo.

**Por qué se pregunta:** en la PC con Windows (Laragon) el backend arranca solo porque existe una tarea
programada de Windows que ejecutaba un script del repo. En Ubuntu el backend también está corriendo al
prender la PC sin que nadie ejecute `go run .`, pero **no sabemos qué lo arranca** ni cómo se sirve el
frontend. Con las respuestas se documenta un despliegue repetible, sin adivinar y sin ejecutables en el repo.

> **No pegues contraseñas, claves ni el contenido de `.env` o `config.yaml`.** Donde haga falta ver qué
> variables existen, usa los comandos de abajo, que muestran solo los *nombres*.

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
   - [ ] Otro: ______
   - [ ] No sé
2. **¿Cuál es el comando exacto que ejecuta?** (por ejemplo `/var/www/Hotelerias/backend/backend` o `go run .`)
3. **¿Corre un binario ya compilado o compila al vuelo?** Si es un binario, ¿dónde está el archivo y quién lo compila?
4. **¿Desde qué carpeta y con qué usuario corre?**
5. **¿En qué puerto escucha?** ¿Es el 5220 o cambiaste `SERVER_PORT`?
6. **¿Cómo se reinicia?** (el comando que usas cuando cambias código)
7. **¿Qué pasa si se cae?** ¿Se vuelve a levantar solo?
8. **¿Dónde ves sus mensajes (logs)?** (`journalctl -u ...`, un archivo, `pm2 logs`, etc.)

**Respuestas:**

```
(escribe aquí)
```

---

## 2. Frontend (la web y el panel)

1. **¿Cómo se sirve?** Marca una:
   - [ ] Servidor de desarrollo (`npm run dev`, puerto 5173)
   - [ ] La carpeta compilada `frontend/dist` servida por **Nginx**
   - [ ] La carpeta compilada `frontend/dist` servida por **Apache**
   - [ ] Otro: ______
2. **¿Quién arranca eso al prender la PC?** (si es `npm run dev`, ¿con qué?)
3. **Si es Nginx o Apache:** ¿en qué archivo está la configuración del sitio y qué dominio o IP responde?
   (pega ese archivo, no tiene secretos)
4. **¿Cómo llega `/api/...` al backend?** (proxy a `127.0.0.1:5220`, ¿o de otra forma?)
5. **¿Cómo actualizas el frontend después de un `git pull`?** (`npm run build`, ¿se copia a algún lado?)
6. **¿Con qué dirección entras desde el navegador?** (`http://localhost`, una IP, un dominio…)

**Respuestas:**

```
(escribe aquí)
```

---

## 3. Base de datos

1. **¿PostgreSQL corre en esa misma PC?** ¿Qué versión?
2. **¿Cómo se llama la base y qué usuario la usa?** (sin contraseña)
3. **¿Usas Redis o MongoDB?** (son opcionales; el proyecto funciona sin ellos)
4. **¿Hay datos reales o es solo de prueba?** ¿Tiene `DEMO_DATOS=true`?

**Respuestas:**

```
(escribe aquí)
```

---

## 4. Configuración y secretos

1. **¿Dónde están `.env` y `config.yaml`?** (la ruta; nunca el contenido)
2. **¿Quién los creó y están respaldados en otro lado?** No viajan por git, así que si se pierde la PC se pierden.
3. **¿Cambiaste la contraseña del administrador inicial** respecto a la de ejemplo?

**Respuestas:**

```
(escribe aquí)
```

---

## 5. Cómo se actualiza hoy

Describe, paso a paso, qué haces cuando subes cambios desde otra PC y quieres verlos en esta:

1. ______
2. ______
3. ______

¿Hay algún script que lo haga? ¿Cuál?

**Respuestas:**

```
(escribe aquí)
```

---

## 6. Para qué es esa PC

1. **¿Es solo otra PC de desarrollo o es el servidor real** al que entra más gente?
2. **¿Se entra desde otras computadoras o solo desde esa?**
3. **¿Tiene HTTPS (candadito)?** ¿Con qué certificado?
4. **¿Quieres que se deje documentado un despliegue** para esa PC, con un servicio `systemd` para el backend
   y la configuración de Nginx lista, en una carpeta `deploy/` del repo? (solo texto y configuración,
   **ningún ejecutable**)

**Respuestas:**

```
(escribe aquí)
```

---

## Resultado de los comandos del atajo

```
(pega aquí la salida del bloque "Atajo")
```
