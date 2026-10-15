# Registro de cambios

Qué cambió, por qué, y qué quedó pendiente. Lo más reciente primero.
Cómo usar lo que se describe aquí: [`backend/README.md`](../backend/README.md).

---

## 2026-10-15 — Sistema de permisos, plataforma y limpieza de merges

### Resumen

1. Se implementó el **sistema de permisos** del backend (roles + excepciones individuales), portando la lógica de `distributor` a Go.
2. Se reorganizó la base del backend en una **arquitectura por módulos** (composition root, interfaces pequeñas, plataforma transversal).
3. Se resolvieron los **conflictos del merge** de la rama `b68c3e6`.
4. Se sacaron de git la **configuración local y los binarios**, con ejemplos versionados.

### 1. Sistema de permisos

**Qué se agregó**

| Pieza | Ubicación |
|---|---|
| Catálogo de 56 submódulos (port 1:1 de `distributor`, verificado por comparación de claves) | `internal/permiso/catalogo.go` |
| Reglas puras: `Acceso.Resolver` y `Acceso.Claves` | `internal/permiso/acceso.go` |
| Servicio, caché de rol y guard (`Require`, `RequireAny`) | `internal/permiso/{service,cache,guard}.go` |
| Acceso a datos | `internal/permiso/postgres/store.go` |
| `GET /api/permiso/catalogo` y `GET /api/permiso/mios` | `internal/permiso/handler.go` |
| Auth mínima: emisión/validación de JWT y middleware | `internal/auth/` |
| Esquema (`rol`, `usuario`, `usuario_rol`, `rol_permiso`, `usuario_permiso`) | `migrations/0001_permisos.sql` |

**Lógica conservada de `distributor`**

- Un usuario hereda la **unión** de los permisos de todos sus roles.
- Excepciones individuales que **solo suman**: `una_vez`, `temporal`, `permanente`.
- El rol se evalúa **primero**, para no gastar una excepción de un solo uso por algo que ya podía hacer; entre excepciones, vale la duradera.
- Se resuelve contra la base y no contra el token; solo se cachea el rol (30 s).
- El 403 trae `{submodulo, accion}` para el modal de "pedir acceso" del frontend.

**Decisiones propias** (diferencias respecto a la implementación en C#)

| # | Decisión | Por qué |
|---|---|---|
| 1 | El permiso de un solo uso se **reserva antes** y se **suelta si falla**, en vez de gastarse al final | En C#, dos peticiones en paralelo con el mismo permiso pasaban las dos. Verificado con 25 goroutines y 20 peticiones HTTP simultáneas: exactamente 1 éxito |
| 2 | `ver` es **implícito** para quien tiene una excepción sobre el submódulo | Si no, conceder `anular` dejaba un permiso inalcanzable (no se podía abrir la pantalla). Es consistente con la matriz del rol, que ya agrega `ver` al guardar |
| 3 | El administrador es `rol.acceso_total`, **no** `Rol.Nombre == "Administrador"` ni `RolId == 1` | Renombrar el rol no debe quitarle el acceso, y se pueden tener varios |
| 4 | `usuario_rol` única, sin "rol principal" aparte | El `RolId` + `RolesAdicionales` de C# era herencia del sistema anterior |
| 5 | Si la base falla durante la autorización → **500**, nunca se deja pasar | Fail-closed |
| 6 | Una ruta con un permiso inexistente hace **pánico al registrarse** | Descubrirlo en el arranque, no como un 403 sin solución en producción |
| 7 | Una vigencia desconocida **no concede** nada | Ante la duda, se niega |

**Pendiente de este sistema**: conceder/revocar excepciones, solicitudes de permiso, alcance de datos y el CRUD de roles (ver [pendientes](#pendiente)).

### 2. Arquitectura del backend

Cambios sobre la base que existía (`config`, `db`, `routes`, `main`):

| Antes | Ahora | Principio |
|---|---|---|
| `NewDatabases` tragaba los errores y devolvía `nil`: el servidor arrancaba y hacía *panic* en el primer request | PostgreSQL **obligatorio y fail-fast**; Mongo y Redis opcionales y explícitos | Falla visible |
| `SetupRoutes(r, databases, cfg)`: cada handler dependía de las tres bases y de toda la config | `routes.Register(r, Deps{Authenticate, Modules})`: cada módulo recibe solo lo que usa | ISP / DIP |
| Wrappers `PostgresDB{Pool}`, `RedisDB{Client}` que no abstraían nada | Se usa el cliente directamente; el wrapper solo sobrevive como adaptador del código heredado | DIP |
| Rutas cableadas en un solo archivo | Cada módulo implementa `Register(gin.IRouter)`; agregar uno es sumarlo a una lista en `main.go` | OCP |
| Errores armados a mano en cada handler | `httpx.ErrorMiddleware` traduce `c.Error(err)` a `{statusCode, message, errors}` | SRP / DRY |
| CORS fijo en `*`, ignorando `AllowedOrigins` | CORS por lista de orígenes del config | Seguridad |
| Config con campos de .NET sin uso y sin validación | Validación al cargar (clave JWT ≥ 32 bytes, DSN obligatorio, puerto) | Falla visible |
| `context.Background()` en los constructores | Reciben `ctx` | Cancelación |
| `log.Fatalf` saltándose los `defer` | `run() error` con apagado ordenado | Cierre limpio |

### 3. Conflictos del merge (`b68c3e6`)

| Archivo | Resolución |
|---|---|
| `go.sum`, `go.mod` | jwt v5.2.2; `go mod tidy` |
| `internal/db/redis.go` | Se fusionaron ambas: `ctx` y esquema automático (`localhost:6379` → `redis://...`) más el silenciador de logs de go-redis, adaptado a la API de v9.23 |
| `main.go`, `internal/routes/routes.go` | Gana el composition root con el módulo `permiso` |
| `config/config.go` | Se agregó `Server.UploadsDir`; el puerto acepta `5220` o `":5220"` |

> **La rama `b68c3e6` es una implementación paralela, no solo un conflicto de texto.** Sus
> `handlers/`, `services/`, `middleware/`, `models/`, `pkg/` e `internal/db/migrate.go`
> **siguen en el árbol y compilan, pero no están cableados.** Motivos: usa un solo rol por
> usuario y sin excepciones (contradice la lógica de permisos), duplica el catálogo, y siembra
> un admin con contraseña fija que escribe en el log. Se conservan para **portarlos** sobre
> `permiso`. Consecuencia actual: **`/api/auth/login`, `/usuario`, `/rol` y `/empresa` no
> existen todavía.**

### 4. Qué se versiona y qué no

**Dejaron de versionarse**: `backend/config.yaml` y `backend/backend.exe` (32–55 MB por commit).

**Ignorados**: `config.yaml`, `.env`, `.env.*`, `*.exe`, `uploads/`.

**Se versionan los ejemplos**: `backend/config.example.yaml` y `backend/.env.example`.

**Siguen versionados a propósito**: `go.mod`, `go.sum`, `package.json`, `package-lock.json`.
Dan builds reproducibles; los conflictos en ellos se resuelven con `go mod tidy` /
`npm install`, no ignorándolos.

**Configuración**: el entorno real pisa al `.env`, y este al `config.yaml`.
Detalle y tabla de variables en [`backend/README.md`](../backend/README.md#configuración-y-secretos).

### Verificación

- `go build ./...`, `go vet ./...` y `go test ./...` en verde.
- Pruebas de integración ejecutadas contra PostgreSQL y Redis reales (schema temporal).
- Servidor real arrancado con el `config.yaml` del repositorio (`Port: ":5220"`) contra una base descartable: migra, responde `/api/health` y devuelve 401 sin token.

### Pendiente

**Backend** (por orden de dependencia)

1. Login y usuarios sobre `permiso` — **bloquea el frontend**, hoy `/api/auth/login` no existe.
2. Roles: CRUD y matriz.
3. Excepciones (conceder/revocar) y solicitudes con aprobación transaccional.
4. Alcance de datos (`todos | misclientes | propios`).
5. Empresa (datos y logo).
6. Tiempo real: el frontend usa SignalR y Go no lo habla; se recomienda SSE (el cambio en el front está aislado en `lib/realtime.ts`).
7. Administrador inicial desde configuración, sin contraseña fija ni log de credenciales.

**Seguridad y repositorio**

- **Rotar** el token de ApisPeru y la clave JWT: estuvieron commiteados y siguen en el historial de git.
- Elegir **un** gestor de paquetes en el frontend: conviven `package-lock.json` y `pnpm-lock.yaml`, fuente segura de conflictos.
- La base `Company_Multi` de la config heredada **no existe** y el nombre viene de una plantilla; definir el nombre definitivo.

**Frontend** (no se modificó código en esta tanda)

Quedó analizada una arquitectura por capas tomada de `arequipagocreditos` (Flutter, Clean
Architecture). Resumen de lo decidido, para no perderlo:

- Capas `core / domain / data / presentation / di`, con la regla de dependencias hacia adentro y una prueba automática que la verifica.
- **La referencia no tiene tabla de rutas** (usa un `switch` de estado y `Navigator.push`), así que las rutas se **diseñan**: definiciones declarativas por módulo, política de acceso (`public | guest | authenticated | permiso | permisoAlguno`) evaluada por una función pura, y un registro que valida duplicados e ids del menú al arrancar.
- Se corrige lo que la referencia hace mal respecto a SOLID: providers de ~800 líneas, DI que instancia en cada acceso, datasources que leen el almacenamiento directamente.
- Las pantallas existentes de `lib/` (`apiClient`, `authStorage`, `permisos`) se mantienen como **fachadas** para no romper los componentes UI que ya las importan.
- Prerrequisitos: `tsconfig.json`, alias `@/`, y un runner de pruebas (`vitest`); hoy no hay ninguno de los tres.
