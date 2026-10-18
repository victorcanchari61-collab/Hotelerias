# Cómo subir cambios al repositorio (Git)

Guía para trabajar con el repositorio de **Hotelerias** y subir cambios a
GitHub. La autenticación ya está configurada con clave SSH, así que **no
pide contraseña**.

- **Repositorio:** `git@github.com:victorcanchari61-collab/Hotelerias.git`
- **Ruta local:** `/var/www/Hotelerias`
- **Clave SSH:** `~/.ssh/id_ed25519` (registrada en GitHub como "Mi-Ubuntu")

---

## 1. Ubicarte en el proyecto

```bash
cd /var/www/Hotelerias
```

---

## 2. Ver qué cambiaste

```bash
git status
```

Muestra los archivos modificados, nuevos y eliminados.

---

## 3. Ver los cambios en detalle (opcional)

```bash
git diff
```

---

## 4. Agregar los cambios al "staging"

Todos los cambios:

```bash
git add .
```

Solo un archivo específico:

```bash
git add backend/main.go
```

---

## 5. Crear el commit (guardar los cambios con un mensaje)

```bash
git commit -m "descripción breve de lo que cambiaste"
```

Ejemplos:

```bash
git commit -m "agrega endpoint de reservas"
git commit -m "corrige validación del login"
```

---

## 6. Subir los cambios a GitHub

```bash
git push
```

---

## Flujo completo (resumen)

```bash
cd /var/www/Hotelerias
git status
git add .
git commit -m "mensaje de lo que cambiaste"
git push
```

---

## Traer cambios del repositorio (antes de empezar)

Si trabajas desde otra máquina o alguien más subió cambios, primero actualiza:

```bash
git pull
```

---

## Ramas (opcional, para trabajo en equipo)

Ver en qué rama estás:

```bash
git branch
```

Crear una rama nueva:

```bash
git checkout -b mi-rama
```

Subir una rama nueva:

```bash
git push -u origin mi-rama
```

Cambiar de rama:

```bash
git checkout main
```

---

## Comandos útiles

| Comando | Para qué sirve |
|---------|----------------|
| `git status` | Ver archivos modificados |
| `git diff` | Ver los cambios línea por línea |
| `git log --oneline` | Ver historial de commits |
| `git pull` | Traer cambios del repositorio |
| `git push` | Subir tus cambios |
| `git branch` | Ver en qué rama estás |
| `git checkout -- archivo` | Descartar cambios de un archivo |

---

## IMPORTANTE: archivos que NO se deben subir

El archivo `.gitignore` ya excluye lo que no debe subir. Asegúrate de que
estos **nunca** se suban al repositorio:

- `backend/.env` (contiene contraseñas y secretos)
- `backend/config.yaml` (contiene la contraseña de la base de datos)
- `frontend/dist/` (se genera con `npm run build`)
- `frontend/node_modules/`

Si por error aparecen en `git status`, no los agregues con `git add`.

---

## Solución de problemas

### "fatal: could not read Username for 'https://github.com'"
El repositorio remoto está en HTTPS. Cámbialo a SSH:

```bash
git remote set-url origin git@github.com:victorcanchari61-collab/Hotelerias.git
```

### "Permission denied" o no autentica
Verifica la clave SSH:

```bash
ssh -T git@github.com
```

Debe responder: `Hi ...! You've successfully authenticated...`

### "Updates were rejected"
Alguien subió cambios antes que tú. Primero trae y luego sube:

```bash
git pull --rebase
git push
```

### Quiero ver qué remoto tengo configurado
```bash
git remote -v
```

---

## Autenticación (resumen)

- Nombre: `victorraulcancah`
- Correo: `vcanchari38@gmail.com`
- Método: clave SSH (ed25519), sin contraseña

Si algún día cambias de computadora, genera una nueva clave SSH y agrégala
en GitHub → Settings → SSH and GPG keys.
