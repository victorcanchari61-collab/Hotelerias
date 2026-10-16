# Backend — API Hotelerías

API en Go (Gin) con PostgreSQL, Redis (opcional) y MongoDB (opcional).

- [Arrancar](#arrancar)
- [Configuración y secretos](#configuración-y-secretos)
- [Arquitectura](#arquitectura)
- [Sistema de permisos](#sistema-de-permisos)
- [Endpoints](#endpoints)
- [Migraciones](#migraciones)
- [Pruebas](#pruebas)
- [Código heredado sin integrar](#código-heredado-sin-integrar)
- [Pendiente](#pendiente)

---

## Arrancar

Requisitos: Go 1.26+, PostgreSQL. Redis y MongoDB son opcionales.

```bash
cd backend
cp config.example.yaml config.yaml   # y ajusta la cadena de PostgreSQL y la clave JWT
go run .
```

Al arrancar, el servidor:

1. Carga la configuración y **falla si está incompleta** (no espera al primer request).
2. Conecta a PostgreSQL (**obligatorio**: sin él no hay forma de autorizar a nadie). Redis y MongoDB solo avisan si no están.
3. Aplica las migraciones pendientes.
4. Escucha en `Server.Port` (5220 por defecto en el ejemplo; es el que usa el proxy de Vite).
5. Al recibir Ctrl+C / SIGTERM, termina las peticiones en curso y cierra las conexiones.

La base de datos de la cadena de conexión **tiene que existir** (las migraciones crean tablas, no la base).

---

## Configuración y secretos

Hay tres fuentes. De mayor a menor prioridad:

| # | Fuente | Se versiona | Para qué |
|---|---|---|---|
| 1 | Variables de entorno reales | — | Producción, CI, Docker |
| 2 | `.env` (junto a `config.yaml`) | **No** | Secretos y valores locales |
| 3 | `config.yaml` | **No** | Valores base de tu máquina |

Lo que sí se versiona son los **ejemplos**: [`config.example.yaml`](config.example.yaml) y [`.env.example`](.env.example).

Cualquier clave del YAML se puede pisar con una variable de entorno: los niveles se unen con `_` y va en mayúsculas.

| YAML | Variable |
|---|---|
| `ConnectionStrings.PostgreSQL` | `CONNECTIONSTRINGS_POSTGRESQL` |
| `ConnectionStrings.Redis` | `CONNECTIONSTRINGS_REDIS` |
| `ConnectionStrings.MongoDB` | `CONNECTIONSTRINGS_MONGODB` |
| `JwtSettings.SecretKey` | `JWTSETTINGS_SECRETKEY` |
| `Server.Port` | `SERVER_PORT` |
| `Server.UploadsDir` | `SERVER_UPLOADSDIR` |

### Reglas

- **PostgreSQL**: URL (`postgres://...`) o pares `host=... port=... dbname=... user=... password=...`. El formato de .NET (`Host=...;Port=...`) **no funciona** con pgx.
- **`JwtSettings.SecretKey`**: mínimo 32 bytes. Genera una con `openssl rand -base64 48`.
- **`Server.Port`**: `5220` o `":5220"` significan lo mismo.
- **`.env`**: líneas `CLAVE=valor`, comentarios con `#`, valores opcionalmente entre comillas. Un `.env` mal formado **falla al arrancar**, no se ignora en silencio. Las variables ya definidas en el entorno real no se pisan.

### Qué NO se versiona (ver `.gitignore`)

`config.yaml`, `.env`, `*.exe`, `uploads/`. Siguen versionados `go.mod` y `go.sum`: dan builds reproducibles, y sus conflictos se resuelven con `go mod tidy`.

---

## Arquitectura

```
backend/
├── main.go                    composition root: el ÚNICO sitio que elige implementaciones
├── config/                    carga y validación de la configuración
├── migrations/                SQL numerado, embebido en el binario
└── internal/
    ├── platform/              infraestructura transversal
    │   ├── httpx/             errores (forma Problem), CORS, recover
    │   ├── cache/             Redis y Nop (sin caché)
    │   └── migrate/           aplicador de migraciones
    ├── db/                    conexiones (Postgres, Mongo, Redis)
    ├── auth/                  JWT (HS256, claim sub) + middleware Authenticate
    ├── permiso/               catálogo, reglas, servicio, guard, handler
    │   └── postgres/          único sitio del módulo con SQL
    └── routes/                arma /api y cuelga los módulos
```

### Regla de dependencias

```
main ──► routes ──► (módulos)
              permiso ──► auth, platform/httpx        (interfaces propias)
              permiso/postgres ──► permiso            (implementa sus puertos)
```

- Cada módulo declara **sus propias interfaces pequeñas** (`UsuarioRoles`, `PermisosDeRol`, `ExcepcionStore`, `Cache`, `Autorizador`...) y las implementaciones concretas las eligen en `main.go`.
- Ningún módulo recibe `Databases` ni `Config` enteros: recibe solo lo que usa.
- Agregar un módulo es sumarlo a `routes.Deps.Modules` en `main.go`; `routes` no se toca.
- Los errores no se arman a mano en los handlers: se deja `c.Error(err)` y `httpx.ErrorMiddleware` los traduce a `{statusCode, message, errors}` (la forma que lee `frontend/src/lib/apiClient.ts`).

### Política de fallos

| Situación | Comportamiento |
|---|---|
| PostgreSQL caído al arrancar | No arranca |
| Config incompleta / clave JWT corta | No arranca |
| Redis caído | Funciona sin caché (consulta siempre a la base) |
| Falla la base durante una petición protegida | **500**, nunca se deja pasar (fail-closed) |
| Ruta declarada con un permiso que no existe en el catálogo | Pánico **al registrar la ruta**, no un 403 en producción |

---

## Sistema de permisos

La **lógica** (roles con herencia más excepciones individuales) viene del proyecto `distributor`; el **catálogo de
módulos** es propio de una cadena hotelera. Un permiso es `submodulo:accion`
(por ejemplo `fact.notaventa:anular`).

### Reglas

1. **El catálogo vive en código** ([`permiso/catalogo.go`](internal/permiso/catalogo.go)): 59 submódulos en 14 módulos (recepción, reservas, habitaciones, CRM, restaurantes, servicios exclusivos, productos, inventario, compras, facturación, finanzas, RR. HH., dashboard y configuración), y cada uno declara **solo** las acciones que le tienen sentido (la auditoría no se crea, el kardex no se anula). El front dibuja su matriz con `GET /api/permiso/catalogo`.
2. **Un usuario hereda los permisos de sus roles.** Con varios roles, sus permisos son la **unión**: tener más roles nunca quita nada.
3. **Los roles con `acceso_total`** (Administrador) pueden todo y no se configuran. Es un dato del rol, no su nombre.
4. **Sobre eso, excepciones individuales que solo suman** (no existe la que quita algo):

   | Vigencia | Significado |
   |---|---|
   | `una_vez` | Se gasta al usarla. Ej.: "anular ESTA nota que emití mal" |
   | `temporal` | Vale hasta `expira_en` |
   | `permanente` | No vence |

   Nunca se borran: se revocan o se gastan, y queda quién tuvo qué.
5. **Orden de resolución** ([`permiso/acceso.go`](internal/permiso/acceso.go), función pura sin I/O):
   1. Acceso total, o el rol ya lo cubre → permitido. **No se toca ninguna excepción**, así una de un solo uso no se gasta por algo que ya podía hacer.
   2. Excepción duradera (temporal o permanente) vigente.
   3. `ver` implícito si tiene cualquier excepción vigente sobre ese submódulo.
   4. Excepción de un solo uso. Va al final: entre varias vale la que no se gasta.
6. **Se resuelve contra la base, no contra el token**: conceder o quitar un permiso surte efecto sin que la persona vuelva a entrar.
7. **Solo se cachea el rol** (30 s, Redis, invalidable con `CachedRoles.Olvidar`). Las excepciones **no** se cachean: una de un solo uso cacheada seguiría pareciendo válida después de gastarse.

### El permiso de un solo uso

Se **reserva antes** de ejecutar la operación (`UPDATE ... WHERE usos = 0`, atómico) y se **suelta** si la operación falla (status ≥ 400, error o pánico). Así:

- Dos peticiones en paralelo con el mismo permiso no entran las dos: gana una.
- Quien pidió "anular esta nota" y recibe un error de validación **no pierde** el permiso.
- Si el proceso muere a medias, el permiso queda gastado (falla del lado seguro).

### Proteger una ruta

```go
guard := permiso.NewGuard(permiso.Permisos, permisos, permisos)

g.POST("/notasventa/:id/anular", guard.Require("fact.notaventa", permiso.Anular), h.Anular)

// Cualquiera de varios (solo lecturas; no gasta excepciones de un solo uso):
g.GET("/stock", guard.RequireAny("inv.stock:ver", "fact.pedidos:ver"), h.Stock)
```

La respuesta 403 incluye qué faltaba, para que el frontend abra el modal de pedir acceso:

```json
{ "statusCode": 403, "message": "No tienes permiso para esta acción.",
  "submodulo": "fact.notaventa", "accion": "anular" }
```

### Tablas

`rol`, `usuario`, `usuario_rol`, `rol_permiso`, `usuario_permiso`
(ver [`migrations/0001_permisos.sql`](migrations/0001_permisos.sql)). `usuario` nace mínima
(`id`, `nombre`, `activo`) y el módulo de usuarios la ampliará.

---

## Endpoints

| Método | Ruta | Acceso | Respuesta |
|---|---|---|---|
| GET | `/api/health` | Público | `{status, message}` |
| POST | `/api/auth/login` | Público | `{token, usuario}` — ver [Autenticación](#autenticación-y-usuarios) |
| GET | `/api/auth/me` | Sesión | El usuario del token (`401` si la cuenta ya no existe o está desactivada) |
| GET | `/api/permiso/catalogo` | Sesión | `[{submodulo, modulo, acciones[]}]` en orden de menú |
| GET | `/api/permiso/mios` | Sesión | `["fact.pedidos:ver", ...]` (nunca `null`) |
| GET | `/api/usuario` | `config.usuarios:ver` | `[{id, rolId, rolNombre, nombre, apellido, email, telefono, foto, activo, creadoEn}]` |

Toda ruta fuera de `/api/health` y `/api/auth/login` exige `Authorization: Bearer <jwt>`. El
token solo dice **quién** es (`sub`); no lleva permisos.

---

## Autenticación y usuarios

### Super administrador inicial

Al arrancar, si el correo configurado no existe, se crea una cuenta con el rol de **acceso
total** (el rol `Administrador`, `rol.acceso_total`): puede todo y su matriz no se configura.

| Dato | Dónde | Se versiona |
|---|---|---|
| `AdminInicial.Email`, `AdminInicial.Nombre` | `config.yaml` o `ADMININICIAL_EMAIL` | No (config.yaml está ignorado) |
| **Contraseña** | **solo** `.env` → `ADMININICIAL_PASSWORD` (mínimo 10 caracteres) | **No, nunca** |

- **No hay contraseña por defecto en el código.** Sin `ADMININICIAL_PASSWORD` no se crea ningún usuario
  y el arranque lo avisa en el log.
- **Se crea una sola vez.** Si la cuenta ya existe no se toca: cambiar la variable después **no** cambia la
  contraseña (ni pisa la que alguien eligió).
- La contraseña **nunca** se registra en el log.

### Login

`POST /api/auth/login` con `{ "email", "password" }` → `{ "token", "usuario" }`.

| Situación | Respuesta |
|---|---|
| Correcto | `200` con el token (JWT HS256, `sub` = id) y el perfil |
| Correo inexistente **o** clave incorrecta | `401 "Email o contraseña incorrectos"` — **el mismo mensaje y el mismo tiempo** para no revelar qué correos existen |
| Cuenta desactivada, con la clave correcta | `403 "Tu cuenta está desactivada…"` (con la clave mala sale el `401` genérico) |
| 5 fallos seguidos del mismo origen + correo | `429` durante 15 minutos, **incluso con la clave correcta** |

Detalles de seguridad:

- Las claves se guardan con **bcrypt** (costo 12). Nunca la clave: si la base se filtra, no se filtran las claves.
- Se comparan contra un hash de relleno cuando el correo no existe, para igualar el tiempo de respuesta.
- Más de 72 bytes se rechaza (bcrypt ignora el resto en silencio).
- El perfil que sale (`Perfil`) **no tiene el hash**, y una prueba lo verifica sobre la respuesta real.
- Un token todavía vigente deja de servir si la cuenta se desactiva o se elimina (`/auth/me` y los permisos lo comprueban).
- **El limitador es en memoria**: se pierde al reiniciar y no se comparte entre instancias. Con más de una
  instancia debe moverse a Redis.
- **Rota la clave JWT**: `JwtSettings.SecretKey` del `config.yaml` de ejemplo es pública. Pon una propia en
  `.env` como `JWTSETTINGS_SECRETKEY` (el entorno pisa al YAML).

### Usuarios

`GET /api/usuario` lista las cuentas (con el rol principal: el de acceso total si lo tiene, y si no el de menor
id; la persona puede tener varios). Crear, editar, activar/desactivar y eliminar **aún no existen**.

---

## Migraciones

Archivos `migrations/NNNN_nombre.sql`, embebidos en el binario y aplicados al arrancar, en orden y una sola vez.

- Cada archivo corre en **su propia transacción**: entra completo o no entra.
- Se registran en `schema_migrations`.
- Un *advisory lock* impide que dos instancias migren a la vez.
- **Una migración aplicada no se edita**: se agrega una nueva.

---

## Pruebas

```bash
go vet ./...
go test ./...
```

Sin variables de entorno, las pruebas que necesitan infraestructura se **saltan solas**. Para
correrlas completas contra tu PostgreSQL y Redis:

```bash
# bash
TEST_DATABASE_URL="host=localhost port=5432 dbname=postgres user=postgres password=" \
TEST_REDIS_ADDR="localhost:6379" go test -count=1 ./...
```

```powershell
# PowerShell
$env:TEST_DATABASE_URL = "host=localhost port=5432 dbname=postgres user=postgres password="
$env:TEST_REDIS_ADDR = "localhost:6379"
go test -count=1 ./...
```

Las de PostgreSQL trabajan en un **schema temporal** que borran al terminar: no tocan tus datos.

| Paquete | Qué cubre |
|---|---|
| `permiso` | Reglas puras (23 casos), catálogo, guard (gasto, carrera, doble guard, fail-closed), caché |
| `permiso/postgres` | Migraciones, reserva atómica con 25 goroutines, punta a punta con JWT y router reales |
| `auth` | Emisión y validación; 12 tokens inválidos rechazados (`alg:none`, otro algoritmo, vencido, sin vencimiento, emisor/audiencia, `sub` inválido) |
| `config` | Defaults, entorno sobre archivo, `.env`, validación, puerto con `:` |
| `platform/cache` | Redis real, Redis caído, `Nop` |

---

## Código heredado sin integrar

La rama `b68c3e6` trajo una implementación paralela que **compila pero no está cableada**:
`internal/handlers`, `internal/services`, `internal/middleware`, `internal/models`, `pkg/`
e `internal/db/migrate.go`.

No está conectada a propósito, porque:

- Usa tablas propias (`usuarios`, `roles`, `rol_permisos`) con **un solo rol por usuario** y sin excepciones individuales: contradice la lógica de arriba.
- Duplica el catálogo de permisos.
- Siembra un administrador con contraseña fija (`Admin123!`) y la imprime en el log.

Se conecta a `db.Databases` mediante un adaptador (`Databases.PostgresDB()`) solo para
que el paquete compile. **Es una pieza a portar sobre `permiso`, no a cablear tal cual** (ver
[Pendiente](#pendiente)). Su contrato HTTP (`/auth/login`, `/auth/me`, `/usuario`, `/rol`,
`/empresa`) es el que ya espera el frontend.

---

## Pendiente

Por orden de dependencia:

1. **Usuarios: crear, editar, activar/desactivar y eliminar** (`POST/PUT/PATCH/DELETE /api/usuario`), con asignación
   de roles y cambio de contraseña. El login, `/auth/me` y el listado ya existen.
2. **Roles**: CRUD y matriz (invalidar con `CachedRoles.Olvidar` y agregar `ver` al guardar).
3. **Excepciones**: conceder y revocar; **solicitudes** con aprobación en una sola transacción y deduplicación con índice único parcial.
4. **Alcance de datos** (`todos | misclientes | propios`): qué filas ve, separado del permiso.
5. **Empresa** (datos y logo), reusando `Server.UploadsDir`.
6. **Tiempo real**: el frontend usa SignalR (`/hubs/cambios`) y Go no lo habla; la opción recomendada es SSE.
7. Mover el limitador de intentos de login a Redis (hoy es en memoria, por instancia).
8. Cerrar sesión que invalide el token (hoy es solo del lado del cliente; el token vence a las 8 h).
