# Registro de cambios

Qué cambió, por qué, y qué quedó pendiente. Lo más reciente primero.
Cómo usar lo que se describe aquí: [`backend/README.md`](../backend/README.md).

---

## 2026-10-15 — Portal de reservas (demo): web pública, promociones y tipos de cliente

Antes el sitio era solo el panel. Ahora hay una **web pública** donde el huésped mira los hoteles
y reserva, y el panel pasó a vivir bajo `/admin`.

### Lo que se pidió → cómo quedó

| Pedido | Resultado |
|---|---|
| Página donde el cliente entra y reserva, como demo | Portada con búsqueda, página de cada hotel con habitaciones y precio, confirmación y "Mis reservas". `Demo.Datos` siembra 4 sedes, 12 habitaciones, 4 tipos de cliente y 6 ofertas. |
| El cliente **sí o sí** se loguea para reservar | Mirar y cotizar es público; **reservar exige sesión de huésped**. Quien llega sin ella va a `/ingresar` y, al entrar, **vuelve a la reserva a medias**. Se exige en el servidor (`401`), no solo en la pantalla. |
| Los hoteles crean promociones y ofertas | CRUD en el panel (*Paquetes y promociones*): porcentaje o monto fijo por noche, por hotel o todos, por tipo de huésped, con vigencia, mínimo de noches y código opcional. Se desactivan, no se borran. |
| Califican tipos de clientes | *Fidelización y VIP*: tipos con descuento y regla automática por reservas (Regular 0 % → Frecuente 5 % ≥3 → VIP 10 % ≥6; Corporativo, solo a mano). *Huéspedes*: fijar el tipo a mano o devolverlo a automático. |

### Decisiones que conviene conocer

- **Dos sesiones, dos tokens.** Huésped y personal son tablas distintas y sus ids pueden coincidir:
  el JWT lleva `typ` (`staff` | `cliente`) y cada middleware exige el suyo. Un token de huésped no
  abre el panel ni al revés (probado). Un token anterior sin `typ` vale solo como personal.
- **El servidor calcula el precio.** El navegador solo manda habitación, fechas y huéspedes; los
  importes que mande se ignoran. Dinero en **céntimos enteros**, nunca decimales.
- **Los descuentos NO se acumulan**: gana el mayor entre las ofertas aplicables y el beneficio del
  tipo del huésped (empate: gana la oferta). Acumular es una decisión de negocio, no un detalle:
  un VIP con 10 % más una oferta de 20 % pagaría 30 % menos sin que nadie lo decidiera.
- **No se vende la misma habitación dos veces.** Reservar bloquea el tipo de habitación
  (`SELECT … FOR UPDATE`) y cuenta las reservas que se cruzan **dentro de la misma transacción**.
  Probado con 8 peticiones simultáneas por 2 habitaciones: 2 entran, 6 reciben `409`. El día de
  salida de una estadía y el de entrada de otra **no** se cruzan.
- **La reserva copia lo aplicado** (nombre y monto del descuento): si la oferta cambia o se apaga,
  la reserva ya hecha conserva lo que se le ofreció.
- **"Hoy" es el del hotel (Lima)**, no el del servidor ni el del dispositivo.
- **Los códigos promocionales nunca salen** hacia el visitante: la web lista solo ofertas sin
  código. Cancelar exige ser el dueño y, por la web, hasta el día anterior a la entrada.
- **El tipo de cliente sube al reservar** (y baja si cancela), salvo que el personal lo haya fijado
  a mano.
- **Registro**: tope por IP (10/hora) porque cada alta cuesta un bcrypt; el login comparte el
  `Verificador` del personal (mismos tiempos, mismo límite de intentos), con ámbito propio.

### Backend

`internal/{hotel,promocion,cliente,reserva,portal,demo}`, `platform/fecha` (fecha sin zona
horaria) y la migración `0004_portal_reservas.sql`. `routes.Deps` suma `Cliente` y
`ClienteModules` (rutas detrás de la sesión del huésped). Endpoints en
[`backend/README.md`](../backend/README.md#endpoints).

### Frontend

- El panel se movió a **`/admin`** (`/admin/login`, `/admin/config/usuarios`…). La web pública
  vive en la raíz. Un huésped abre `/admin` y cae en el login del personal.
- Mismas capas: entidades, repositorios y casos de uso en `domain/`; datasources, DTO y repos
  en `data/`; un **segundo cliente HTTP** con el token del huésped en `di/`. La búsqueda
  (`BuscarEstadia`) junta disponibilidad y cotización en un solo caso de uso.
- Rutas con `layout: 'portal'` y `ClienteGate`: la **misma** política de acceso
  (`evaluateAccess`) sobre la sesión del huésped.
- Las "fotos" de la demo son composiciones de la escala del color de marca (`Visual.tsx`); cuando
  haya fotos reales ese es el único componente que cambia.

### Verificación

- Backend: `go vet` y `go test ./...` en verde, incluida la prueba de punta a punta contra
  PostgreSQL real (sobreventa, tokens cruzados, cancelación, subida de tipo, precios del servidor).
- Frontend: `tsc` sin errores, **259 pruebas** (incluye el flujo "reservar sin sesión → ingresar →
  volver → confirmar") y build de producción.
- Probado a mano contra el backend real: portada, hotel con la oferta de Cusco aplicada
  (S/ 880 − S/ 160 = S/ 720), registro, vuelta a la reserva y confirmación. Los datos de esa
  prueba se borraron.

### Pendiente

- Pago: la reserva se confirma sin cobro (es una demo). Falta pasarela y estados de pago.
- Administración de sedes y habitaciones desde el panel (hoy se siembran).
- Recuperar contraseña del huésped y verificación del correo.
- Las pantallas nuevas del panel se otorgan con la matriz de permisos existente
  (`reservas.paquetes`, `crm.fidelizacion`, `crm.huespedes`, `reservas.reservas`).

---

## 2026-10-15 — Módulos de una cadena hotelera (corrección)

**El error.** Al portar los permisos de `distributor` copié también su **catálogo de módulos** (56 submódulos de una
distribuidora: facturación de pedidos, TMS, DMS, maestros…) y lo presenté como "port 1:1". Lo que se pidió portar fue
la *lógica* (roles + excepciones individuales); qué módulos existen es **dominio**, y este sistema es una cadena
hotelera con restaurantes, servicios exclusivos, productos, CRM y ERP. Debí advertirlo o preguntarlo, no copiarlo.

**Qué cambió**

| | Antes (distribución) | Ahora (hotel) |
|---|---|---|
| Módulos | dashboard, maestros, compras, inv, fact, finanzas, tms, dms, rrhh, config | dashboard, **recepcion, reservas, habitaciones, crm, restaurantes, servicios, productos**, inventario, compras, facturacion, finanzas, rrhh, config |
| Submódulos | 56 | **59** |
| Roles sembrados | Vendedor, Almacenero | **Recepcionista** (renombrado, conserva id y permisos), Almacenero, Gerente de sede, Housekeeping, Restaurante |

- **Catálogo del backend** (`internal/permiso/catalogo.go`) y **menú del frontend** (`presentation/layout/navigation.ts`) reescritos. Cada submódulo declara solo las acciones que le tienen sentido (p. ej. `recepcion.estancias`: check-in/out = *confirmar*, depósito = *cobrar*; `habitaciones.*` solo se desactiva, no se borra).
- **Migración `0003`**: roles de hotel. No toca matrices de permisos.
- **Contrato menú ↔ catálogo**: una prueba (`navigation.contract.test.ts`) lee el catálogo real del backend y exige que coincida con el menú, en ambos sentidos y en orden. Se comprobó que falla si se renombra un id en solo uno de los dos lados.
- Se quitó del repositorio lo que quedaba de ese dominio en pruebas y comentarios (`fact.*`, `inv.*`, `tms.*`).

**Verificación**: backend completo (unitarias + 7 de integración contra PostgreSQL), frontend 177 + 6 pruebas, `tsc` y `build`. En vivo: 14 módulos y 59 submódulos por la API, y el super admin con los 240 permisos del catálogo nuevo.

**Importante**

- La lista de módulos es una **primera propuesta** a partir de lo que se describió (recepción, restaurantes, servicios exclusivos, productos, CRM, ERP). Es fácil de ajustar: son dos archivos y la prueba avisa si quedan distintos.
- Los permisos ya guardados con ids viejos **no migran**: no había ninguno (las matrices de los roles estaban vacías).
- Las pantallas de cada módulo aún no existen (solo Usuarios, Login e Inicio); el menú las muestra como "pendientes".

---

## 2026-10-15 — Login y super administrador

**Qué cambió**

- **`POST /api/auth/login`, `GET /api/auth/me` y `GET /api/usuario`** en el backend (módulos `auth` y `usuario`). Es el contrato que el frontend ya esperaba.
- **Migración `0002`**: `usuario` gana correo (único sin distinguir mayúsculas), apellido, teléfono, foto y `password_hash`.
- **Super administrador inicial**, sembrado al arrancar desde la config: `admin@hotelerias.test`, rol de acceso total (199 de 199 permisos).
- **Contraseña solo en `.env`** (`ADMININICIAL_PASSWORD`, ignorado por git). No hay contraseña por defecto en el código ni se registra en el log. Se crea una sola vez.
- **Clave JWT propia** en `.env` (`JWTSETTINGS_SECRETKEY`): la del `config.yaml` era el texto de ejemplo, público y presente en el historial de git, con el que cualquiera habría podido fabricar un token de super admin.
- **Rutas públicas** en `routes.Deps.Public`: solo el login queda fuera de la sesión.

**Seguridad del login**

| | |
|---|---|
| Claves | bcrypt costo 12; el perfil que sale no tiene el hash |
| Enumeración | Mismo mensaje **y mismo tiempo** para "no existe" y "clave mala" (compara contra un hash de relleno) |
| Fuerza bruta | 5 fallos seguidos por origen + correo → `429` 15 min, incluso con la clave correcta |
| Cuenta desactivada | Solo se revela con la clave correcta; su token vigente deja de servir |
| Límites | Más de 72 bytes se rechaza (bcrypt trunca en silencio) |

**Verificación**

- Pruebas unitarias del servicio, limitador, handler, siembra y config; **7 de integración contra PostgreSQL real**, incluida una de punta a punta (sembrar → login → token → los 199 permisos → listar usuarios; sin permiso → `403` que dice qué faltaba).
- En el entorno real, por `http://hotelerias.test/api/...`: login `200` con rol Administrador y sin hash en la respuesta, `/auth/me` y `/usuario` `200`, clave mala `401`, sin token `401`, y 199 permisos.
- **No verificado**: el flujo en la interfaz con el backend real (la contraseña no se tecleó en un navegador desde aquí).

**Pendiente**

- Crear, editar, activar/desactivar y eliminar usuarios: la pantalla de usuarios muestra esos botones al super admin, pero sus endpoints **aún no existen** (darán 404).
- El limitador de intentos es en memoria (se pierde al reiniciar, no se comparte entre instancias).
- Cerrar sesión no invalida el token en el servidor (vence a las 8 h).

---

## 2026-10-15 — Abrir el proyecto en Laragon (`hotelerias.test`)

- Nuevo vhost `00-hotelerias.test.conf` (versionado en `deploy/laragon/` e instalado en `C:\laragon\etc\apache2\sites-enabled\`), con el mismo patrón que `Ecommerce.test` y `Minimarket.test`: sirve `frontend/dist` con fallback de la SPA y manda `/api` y `/uploads` al backend en el puerto **5220**.
- Probado en una instancia de Apache descartable antes de instalarlo, y la config real de Laragon valida con `httpd -t`. No se reinició tu Apache.
- `frontend/index.html`: título "Hotel Velothr" (decía "frontend") e idioma `es`.
- **Hallazgo**: en esta máquina Apache corre como **servicio de Windows** (`Apache2.4`), no bajo Laragon; los botones Stop/Start/Reload de Laragon no lo reinician. Hace falta `Restart-Service Apache2.4` como administrador, y la línea del `hosts` se agrega a mano.
- **Backend en segundo plano**: nuevo `deploy/laragon/backend-ctl.ps1` (`install | status | restart | stop | start | logs | uninstall`). Registra la tarea `Hotelerias-Backend` (al iniciar sesión, usuario actual, sin administrador) que corre un vigilante oculto sobre `backend.exe`; log en `backend/logs/backend.log`.
- **Corregido durante la prueba**: la primera versión confiaba en la opción "reiniciar si falla" del Programador de tareas y **no funcionaba** (el backend quedó apagado 4 minutos tras morir con código 1). La vigilancia ahora la hace el propio script, con pausas crecientes (2…60 s) y sin reiniciar un cierre ordenado. También se corrigió que Windows PowerShell 5.1 mataba el backend en su primer mensaje de log (stderr convertido en excepción).
- **Verificado**: arranque como tarea, respuesta por `hotelerias.test/api/health`, `restart`, y el vigilante con un ejecutable de mentira que se cae siempre / que termina bien. **No verificado**: arranque tras cerrar e iniciar sesión, y matar el backend real a la fuerza.
- Pasos y diagnóstico en [`deploy/laragon/README.md`](../deploy/laragon/README.md).

---

## 2026-10-15 — Frontend: arquitectura por capas, rutas y kit de Ecommerce

### Resumen

1. Se llevó a React la **arquitectura por capas** de `arequipagocreditos` (`core / domain / data / di / presentation`), corrigiendo lo que ahí viola SOLID.
2. Se diseñaron las **rutas como parte de la arquitectura** (la referencia no tenía tabla de rutas).
3. Se copió el **kit de UI de Ecommerce** (`shared/`) con sus animaciones, en **un solo color**, con los íconos y las letras del menú lateral de ese único color.

Cómo se usa y cómo está armado: [`frontend/README.md`](../frontend/README.md).

### 1. Arquitectura por capas

| Capa | Contenido |
|---|---|
| `core` | `Either`, `Failure`/`toFailure`, `HttpClient`/`FileTransfer` + `FetchHttpClient`, `Emitter` |
| `domain` | Entidades, interfaces de repositorio, casos de uso (una clase por caso) |
| `data` | DTOs y mapeos, datasources, `*RepositoryImpl` |
| `di` | Contenedor y un módulo de registro por feature |
| `presentation` | Providers, rutas, layout, pantallas |

Features construidas contra el contrato real del backend: **auth** (login, restaurar sesión,
logout), **permiso** (`/permiso/mios`, `/permiso/catalogo`) y **usuario** (listar, crear,
actualizar, cambiar estado, eliminar), con la pantalla de usuarios.

**La regla de dependencias está verificada por una prueba** (`architecture.test.ts`), y se
comprobó que de verdad falla: se inyectaron a propósito tres violaciones (dominio importando
`data`, dominio importando React, presentación importando `data`) y la prueba las detectó.

**Corregido respecto de la referencia**

| En `arequipagocreditos` | Ahora |
|---|---|
| `AuthProvider` de 810 líneas | Provider delgado + reducer puro + casos de uso |
| DI que instancia uno nuevo en cada acceso | Cada pieza se crea una sola vez |
| `Either.isLeft` por `_left != null` (un éxito `null` parecía fallo) | El lado es una etiqueta |
| Cascada de `catch` por status repetida en cada método | `attempt()` + un solo `toFailure()` |
| Datasources que leen `SharedPreferences` | El almacenamiento es un datasource propio |
| Mensaje de error repetido en cada provider | Un solo `describeFailure` |

### 2. Rutas

- Cada feature **declara** sus rutas (`routes.ts`); el registro las junta y **valida al arrancar** (id/URL repetidos, id de menú inexistente).
- La URL y el permiso de una pantalla del menú **salen del id del menú**: no pueden desincronizarse del sidebar.
- Cinco políticas de acceso (`public`, `guest`, `authenticated`, `permiso`, `permisoAlguno`), decididas por una **función pura** y agregables sin tocar las existentes.
- **El menú nunca lleva a un 404**: toda entrada visible sin pantalla recibe "en construcción", con su permiso, y se marca como pendiente.
- Una ruta protegida sin sesión manda al login y **vuelve a donde iba**; con sesión, el login manda adentro.

### 3. Kit de Ecommerce, un solo color

- `src/shared/{ui,layout,charts,lib}` es copia de `Ecommerce/frontend/src/shared`; componentes propios conservados: `Logo`, `AccionPdf`, `ImportarModal`, `VisorReportePdf`, etc.
- **Un solo color** (`#2563eb`): `styles/themes.css` tiene un único tema con `--grad-end` = `--grad-start`, sin bloques por módulo.
- **Menú lateral**: íconos, letras, marca y pie leen un único token (`--nav-ink`). Verificado en el navegador: las 16 filas del menú tienen exactamente el mismo color en texto, letra e ícono, y hay 0 degradados SVG.
- **Eliminados** `IconGradientDefs` e `icon-gradient.ts`; `ThemedIcon` pinta con `currentColor`.
- **Animaciones copiadas**: `ui-fade-up` (entrada de cada vista, respeta `prefers-reduced-motion`), `fadeIn` (menús), acordeón del menú, submenú flotante, transiciones del sider, `animate-spin`/`animate-pulse`.
- `styles/legacy.css` mapea los tokens viejos de Distribuidor (`--sys-rgb`, `bg-brand`, navy/gold) al tema único, para que los componentes propios sigan viéndose bien sin tocarlos.
- Una prueba (`theme.contract.test.ts`) fija el requisito: una próxima re-copia del kit **no** puede traer de vuelta los degradados sin que falle.

### Cambios fuera de lo pedido

| Cambio | Motivo |
|---|---|
| `HistorialCambios.tsx` importaba un tipo de `features/config`, que no existe | Rompía `tsc` y era un componente de UI acoplado a una feature. Ahora define la forma mínima que necesita. Con esto `tsc` quedó en **0 errores** y sirve de red de seguridad |
| `lib/utils.ts#urlImagen` tenía escrito `http://127.0.0.1:5220/` | Contradecía el comentario de `const_glob` ("ruta relativa siempre") y rompía las fotos fuera de local. Ahora es relativa (el proxy de Vite la resuelve) |
| `Checkbox` y `DocumentoInput` de Ecommerce usan `bg-brand`, que ese proyecto **no define** | En Ecommerce no se pintaban. `legacy.css` define `--color-brand*` como alias del acento |
| `App.jsx` (demo con `toast.success`, `PageSection`...) | Estaba roto contra los componentes reales; lo reemplaza la app ruteada |
| `lib/permisos.tsx` | Reemplazado por `presentation/providers/PermisosProvider` |
| Se agregó `tsconfig.json`, alias `@/`, `vitest`, `jsdom` y `@testing-library/react` | No había tipos, ni alias, ni runner de pruebas |

### Verificación

- `tsc --noEmit`: 0 errores. `vite build`: OK, con code-splitting por pantalla.
- `vitest`: **177 pruebas** en 12 archivos, incluida la app completa montada con repositorios falsos.
- En el navegador (contra un backend simulado): login con redirección de vuelta, menú filtrado por permisos, acordeón, modo contraído con submenú flotante y menú de usuario.
- **No** verificado contra el backend real: `/api/auth/login` y `/usuario` aún no existen ahí.

### Pendiente (frontend)

- Backend: `/api/auth/login`, `/auth/me` y `/usuario` (ver el pendiente del backend, más abajo).
- Pantallas de Roles, Empresa y el formulario de crear/editar usuario (los casos de uso ya existen y están probados).
- Campana de notificaciones sin datos (el backend no expone alertas) y tiempo real (SignalR vs. Go).
- Elegir `package-lock.json` **o** `pnpm-lock.yaml`.
- `lib/alertasApi.ts`, `consultaApi.ts`, `ubigeoApi.ts` siguen pegándole a la red directo: features por migrar a las capas.

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

**Frontend**: implementado después; ver la sección de arriba.
