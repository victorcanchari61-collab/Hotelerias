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

2. **Recargar Apache desde Laragon**: *Menú → Apache → Reload* (o *Start All*).
   Laragon agrega solo `127.0.0.1 Hotelerias.test` al archivo `hosts`.
   Si no lo hace (necesita permisos de administrador), agrégalo a mano como administrador:

   ```
   127.0.0.1      Hotelerias.test
   ```

3. **Compilar el frontend** (Apache sirve `dist/`, no el código fuente):

   ```bash
   cd frontend
   npm run build            # o:  npx vite build --watch   para recompilar al guardar
   ```

4. **Levantar el backend** en el puerto 5220:

   ```bash
   cd backend
   cp config.example.yaml config.yaml   # si no existe; ajusta la cadena de PostgreSQL
   go run .
   ```

   La base de la cadena de conexión **tiene que existir**: el `config.yaml` actual apunta a
   `Company_Multi`, que no existe en tu PostgreSQL. O la creas, o cambias `dbname`.

5. Abrir **http://hotelerias.test/**.

## Qué esperar hoy

- La página abre (pantalla de login) aunque el backend esté apagado: Apache sirve el frontend solo.
- Con el backend apagado, `/api/...` responde **503**; la app lo muestra como "No pudimos conectar con el servidor".
- **El login todavía no funciona con el backend real**: `/api/auth/login`, `/auth/me` y `/usuario`
  aún no existen en el backend en Go (ver `docs/CAMBIOS.md`).

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
| "No se puede acceder a este sitio" | Falta la línea del `hosts` (paso 2) o no se recargó Apache |
| Abre otra página (la de otro proyecto) | No se recargó Apache: aún no lee `00-hotelerias.test.conf` |
| Pantalla en blanco | `frontend/dist` no existe o está vacío: falta el paso 3 |
| `/api` da 503 | El backend no está corriendo en el 5220 (paso 4) |
| Los cambios del código no se ven | Hay que volver a compilar (paso 3); Apache sirve `dist/` |
