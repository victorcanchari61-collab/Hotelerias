# Frontend — Hotelerías

SPA en React 19 + TypeScript + Vite + Tailwind 4 + React Router 7.

- [Arrancar](#arrancar)
- [Arquitectura](#arquitectura)
- [Rutas](#rutas)
- [Kit de UI y tema de un solo color](#kit-de-ui-y-tema-de-un-solo-color)
- [Pruebas](#pruebas)
- [Pendiente](#pendiente)

---

## Arrancar

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxy /api y /uploads -> :5220)
npm run build
npx tsc --noEmit   # tipos
npx vitest run     # pruebas
```

El proxy de Vite manda `/api`, `/uploads` y `/hubs` al backend en `127.0.0.1:5220`
(`vite.config.js`). El código usa rutas **relativas**; nunca un host escrito.

---

## Arquitectura

Es la arquitectura por capas de `arequipagocreditos` (Clean Architecture en Flutter) llevada a
React, con una diferencia importante: la referencia **no tenía tabla de rutas** (usaba un
`switch` de estado y `Navigator.push`), así que las rutas se diseñaron como parte de la
arquitectura (ver [Rutas](#rutas)).

```
src/
├── core/            lo que todas las capas comparten (sin negocio, sin React)
│   ├── errors/        Failure (lo que sube), ApiError/AppException (lo que se lanza), toFailure
│   ├── network/       HttpClient / FileTransfer (puertos) + FetchHttpClient
│   ├── utils/         Either, Emitter, saveBlob
│   └── constants/     API_BASE_URL y ApiPaths
├── domain/          las reglas, sin saber de red, navegador ni React
│   ├── entities/      Usuario, Sesion, PermisoSet...
│   ├── repositories/  interfaces (AuthRepository, UsuarioRepository...)
│   └── usecases/      una clase por caso (LoginUseCase, CrearUsuarioUseCase...)
├── data/            implementa los contratos del dominio
│   ├── models/        DTOs (la forma del cable) y sus mapeos a entidades
│   ├── datasources/   remotos (HttpClient) y local (almacenamiento)
│   └── repositories/  *RepositoryImpl
├── di/              composition root: ÚNICO sitio donde se eligen implementaciones
│   ├── modules/       un archivo por feature (auth, permiso, usuario)
│   └── container.ts
├── presentation/    React: providers, rutas, pantallas
│   ├── providers/     DependencyProvider, AuthProvider, PermisosProvider
│   ├── routes/        access, registry, AccessGate, AppRoutes
│   ├── layout/        PrivateLayout (adaptador) y navigation.ts (el menú)
│   ├── features/      auth, home, usuarios  (cada una con su routes.ts)
│   └── pages/         404, acceso denegado, en construcción, cargando
├── shared/          kit de UI (copia del de Ecommerce): ui, layout, charts, lib
├── lib/             FACHADAS heredadas (apiClient, authStorage...) — ver abajo
├── styles/          themes.css (el color), tones.css, legacy.css
└── test/            fakes compartidos de las pruebas
```

### Regla de dependencias

Las dependencias apuntan **hacia adentro**. Está verificada por
[`src/architecture.test.ts`](src/architecture.test.ts): si alguien la rompe, la prueba falla.

| Capa | Puede importar | No puede |
|---|---|---|
| `core` | — | `domain`, `data`, `presentation`, React |
| `domain` | `core` | `data`, `presentation`, `di`, React, `window`/`fetch`/`localStorage` |
| `data` | `core`, `domain` | `presentation`, React |
| `di` | `core`, `domain`, `data` | `presentation` |
| `shared` | `core`, `lib` | `domain`, `data`, `presentation`, `di` |
| `presentation` | `core`, `domain`, `di`, `shared`, `lib` | **`data`** (solo recibe implementaciones por `di`) |

### Flujo de una acción

```
Pantalla ─► hook/Provider ─► UseCase ─► Repository (interfaz) ─► RepositoryImpl ─► DataSource ─► HttpClient
                                │
                                └─ devuelve Either<Failure, T>: el tipo OBLIGA a manejar el fallo
```

- **Un caso de uso = una clase = una cosa** (`LoginUseCase`, `CrearUsuarioUseCase`). Quien necesita
  iniciar sesión depende de eso y de nada más.
- **Nadie lanza hacia arriba.** La capa de datos lanza `ApiError`; el repositorio lo atrapa con
  `attempt()` y lo convierte en `Failure` en **un solo sitio** (`toFailure`). El texto para la persona
  sale de `describeFailure`, también uno solo.
- **Lo que no puede salir mal en un caso de uso se valida antes de ir al servidor** (correo vacío,
  contraseña corta): no se gasta una petición.

### Cómo se aplica SOLID

| Principio | Dónde |
|---|---|
| **S** | Un caso de uso por clase; `AuthProvider` solo conecta casos con estado (`authState.ts` es un reducer puro); un solo `toFailure` y un solo `describeFailure`. |
| **O** | Una feature nueva es un archivo en `di/modules/` y un `routes.ts`; el router, los guards y el menú no se tocan. Las políticas de acceso son un **mapa** (`RULES`), no un `switch`. |
| **L** | Los `Fake*Repository` de `src/test/fakes.ts` sustituyen a los reales sin tocar a quien los usa: la prueba de punta a punta monta toda la app con ellos. |
| **I** | `HttpClient` (JSON) y `FileTransfer` (archivos) separados; `SessionRepository` separado de `AuthRepository`; el kit de UI no recibe `Container` ni casos de uso. |
| **D** | `domain` define las interfaces y `data` las implementa; `presentation` no importa `data`; el único sitio que sabe de `fetch` y `localStorage` es `di/container.ts`. |

### Corregido respecto de la referencia (Flutter)

| En `arequipagocreditos` | Aquí |
|---|---|
| `AuthProvider` de 810 líneas con 10 casos de uso | Provider delgado + reducer puro + casos de uso aparte |
| DI con getters estáticos que **instancian uno nuevo en cada acceso** | Cada pieza se crea una sola vez |
| `Either.isLeft` decidido por `_left != null` (un éxito `null` parecía fallo) | El lado es una etiqueta |
| Un `try/catch` con la misma cascada de status en **cada método** de **cada repositorio** | `attempt()` + `toFailure()` |
| Datasources que leen `SharedPreferences` para sacar el id del usuario | El almacenamiento es un datasource propio; los demás no lo tocan |
| `_mapFailureToMessage` repetido en cada provider | `describeFailure` |
| `main.dart` de ~200 líneas con diálogos | `AppProviders` + `App` |

---

## Rutas

Una ruta se **declara**; nadie escribe `if (!sesion) navigate('/login')` en una pantalla.

```ts
// presentation/features/usuarios/routes.ts
export const usuariosRoutes: RouteModule = {
  name: 'usuarios',
  routes: [navRoute('config.usuarios', UsuariosPage)],   // URL y permiso salen del id del menú
}
```

`config.usuarios` → URL `/admin/config/usuarios` y exige `config.usuarios:ver`. Se derivan del id
del menú (`presentation/layout/navigation.ts`), así que **no pueden desincronizarse del sidebar**.

### Cómo se arma una pantalla de listado (regla)

Todo listado usa los componentes del kit de Ecommerce; **no se escriben `<table>` a mano**:

| Pieza | Para qué |
|---|---|
| `ListPage` | cabecera + tarjetas de indicadores + tabla, con el mismo armado en todas las pantallas |
| `DataTableColumn[]` | las columnas (`filterType: 'select' \| 'date'`, `value` para buscar/ordenar, `render`) |
| `StatCard` | los indicadores de arriba (3–4 por pantalla) |
| `FilaAcciones` + `BotonFila` | la columna Acciones (`ButtonBase` con íconos de `react-icons/fa6`: lápiz = cian, desactivar = ámbar, eliminar = rojo) |
| `Modal` + `Input`/`Select`/`Checkbox` | formularios de alta y edición |
| `SysDataTable` en **modo servidor** (`servidor={{ total, onConsulta }}`) | listados que crecen sin tope (Auditoría): el servidor recibe el mismo `ConsultaTabla` que emite la tabla |

La tabla pinta cada fila dos veces (tabla y tarjeta de móvil): en las pruebas, `findAllByText` y botones
buscados por su nombre accesible (`Editar Ana Pérez`).

### Dos mitades, dos sesiones

| | Web pública | Panel |
|---|---|---|
| URL | `/`, `/hoteles/:id`, `/ofertas`, `/ingresar`, `/registro`, `/reservar`, `/mis-reservas` | `/admin/**` |
| Quién | el huésped (tabla `cliente`) | el personal (tabla `usuario`) |
| `layout` | `portal` → `PortalLayout` + `ClienteGate` | `shell` / `bare` → `PrivateLayout` + `AccessGate` |
| Token | `hotelerias.cliente.token` | `hotelerias.token` |

Mirar hoteles y precios es público; `reservar` y `mis-reservas` son `authenticated`: sin sesión
mandan a `/ingresar` y, al entrar, **vuelven a lo que se estaba haciendo** (la reserva viaja en la
URL, no en el estado del router). Las dos sesiones no se mezclan: cada una tiene su cliente HTTP,
su almacenamiento y su aviso de "sesión vencida".

### Políticas de acceso

| `kind` | Quién entra | Usa |
|---|---|---|
| `public` | cualquiera | — |
| `guest` | solo sin sesión | el login (con sesión se manda adentro) |
| `authenticated` | cualquiera con sesión | Inicio, perfil (no exigen permiso: es donde llega quien aún no tiene ninguno) |
| `permiso` | sesión + `submodulo:accion` | toda pantalla del menú (`ver`) |
| `permisoAlguno` | sesión + cualquiera de varios | pantallas con pestañas de otros submódulos (`incluye`) |

La decisión la toma una **función pura** (`evaluateAccess`, probada sin React ni router) y
`AccessGate` solo la traduce a lo que se ve: contenido, spinner, redirección al login (recordando
a dónde iba), o "no tienes acceso" **diciendo qué pantalla** falta.

### El registro valida al arrancar

`buildRouteTable` junta las rutas de todas las features y **lanza** si hay un id o una URL repetidos,
o un id de menú que no existe (un typo falla ahí, no con una pantalla en blanco).

Además, **toda entrada visible del menú termina teniendo ruta**: las que ninguna feature construyó
reciben la pantalla "en construcción" (con su permiso) y el menú las marca con un punto tenue. El
menú nunca lleva a un 404.

### Recetas

**Activar una pantalla del menú** (ej. Roles): crear `presentation/features/roles/RolesPage.tsx` y su
`routes.ts` con `navRoute('config.roles', RolesPage)`, y sumarlo en `presentation/routes/index.ts`.
Reemplaza solo a la pantalla "en construcción"; no se toca el menú.

**Agregar una feature con datos**: entidad + interfaz de repositorio + casos de uso en `domain/`;
DTO + datasource + `*RepositoryImpl` en `data/`; un `di/modules/<feature>.module.ts` y una línea en
`di/container.ts`.

**Probar una pantalla**: `createContainer({ repositories: { usuario: new FakeUsuarioRepository() } })`
y montarla dentro de `<AppProviders container={...}>`. No hay red ni almacenamiento real.

---

## Kit de UI y tema de un solo color

`src/shared/` es una **copia de `Ecommerce/frontend/src/shared`** (`ui`, `layout`, `charts`, `lib`),
más los componentes propios de Hotelerias que ya existían (`Logo`, `AccionPdf`, `ImportarModal`...).

### Un solo color

Hotelerias usa **un único color** (`#2563eb`, el azul de la marca), no un color por módulo ni
degradados como el kit de Ecommerce. Los íconos y las letras del menú lateral son de ese mismo color.

| Dónde | Cambio respecto de Ecommerce |
|---|---|
| `styles/themes.css` | Un solo tema: `--grad-start` = `--grad-end`. Sin bloques por módulo (`data-sys`) ni `text-grad`. Nuevo token `--nav-ink` (color del menú). |
| `shared/layout/nav-styles.ts` | Filas del menú de un color; barra activa plana. |
| `shared/layout/{NavButton,NavGroupBlock,FloatingSubmenu,Sidebar}.tsx` | Letras, íconos, marca y pie con `--nav-ink`; sin `text-grad` ni degradados. |
| `shared/ui/ThemedIcon.tsx` | Pinta con `currentColor` (mismo color que la letra). |
| `shared/ui/IconGradientDefs.tsx`, `icon-gradient.ts` | **Eliminados**: ya no hay degradado de ícono. |

Para cambiar el color de la marca: **tres líneas** en `styles/themes.css` (`--grad-start`,
`--grad-end`, `--surface`). Si un módulo necesitara el suyo, basta un bloque `[data-sys='x']`.

### Re-sincronizar con Ecommerce

El kit es una copia: si Ecommerce cambia, se vuelve a copiar. Los cambios de la tabla de arriba
son los que hay que reaplicar, y [`styles/theme.contract.test.ts`](src/styles/theme.contract.test.ts)
falla si la copia trae de vuelta degradados o colores por módulo.

### Animaciones (todas CSS, copiadas del kit)

| Animación | Dónde | Detalle |
|---|---|---|
| `ui-fade-up` | cada vista (`PrivateLayout`) | 280 ms; respeta `prefers-reduced-motion` |
| `fadeIn` | menú de usuario, campana, chips de filtros | 150 ms |
| Acordeón del menú | `NavGroupBlock` | alto por `grid-template-rows` 0fr→1fr, sin medir |
| Submenú flotante | `FloatingSubmenu` | escala + desplazamiento al contraer el sider |
| Sider | `Sidebar`, `AppShell` | ancho/transform y padding del contenido, 200 ms |
| `animate-spin` / `animate-pulse` | botones cargando, esqueletos de gráficos | |

### `legacy.css`

Los componentes **propios** de Hotelerias (que venían de Distribuidor) aún leen tokens viejos
(`--sys-rgb`, `bg-brand`, `--color-navy`). `styles/legacy.css` los mapea al tema único sin tocarlos.
Cuando un componente se migre a `--accent` / `--t-*`, deja de depender de eso; cuando no quede
ninguno, el archivo se borra.

### `lib/` (fachadas)

`lib/apiClient.ts` y `lib/authStorage.ts` son **fachadas** sobre el contenedor, para los
componentes que ya las importan (`AccionPdf`, `VisorReportePdf`, `lib/realtime`). Código nuevo:
recibir el `HttpClient` del contenedor o, mejor, un caso de uso. `lib/alertasApi.ts`,
`consultaApi.ts` y `ubigeoApi.ts` siguen pegándole a la red directo: son features por migrar.

---

## Pruebas

```bash
npx vitest run
```

| Archivo | Qué cubre |
|---|---|
| `architecture.test.ts` | La regla de dependencias (y que de verdad detecta violaciones) |
| `styles/theme.contract.test.ts` | Un solo color, sin degradados en el menú, animaciones presentes |
| `core/**` | `Either`, `toFailure`, `FetchHttpClient` (token, 401 vs sesión vencida, 403 con permiso, HTML de un 502, descargas) |
| `domain/usecases` | Validaciones, restaurar sesión (qué pasa con 401/404/sin red), usuarios |
| `data/**` | Almacenamiento (corrupto, cuota llena), mapeo de DTOs, `null` del backend |
| `presentation/routes` | `evaluateAccess` (todas las combinaciones) y el registro, incluida la tabla real |
| `presentation/App.integration.test.tsx` | La app completa con repositorios falsos: login, redirecciones, permisos, menú, usuarios |

---

## Pendiente

- **Portal:** sin pasarela de pago (la reserva se confirma sin cobro), sin recuperar contraseña
  del huésped y sin administración de sedes/habitaciones desde el panel (se siembran).
- **Pantallas del menú** sin construir (salen como «en construcción»): recepción, habitaciones,
  restaurantes, inventario, facturación… y el grupo Integraciones. Ya tienen permiso en el catálogo.
- **Monedas:** el tipo de cambio es manual; el IGV a extranjeros espera al contador
  (`docs/DISENO-MONEDA-IGV.md`).
- **Alertas:** la campana está montada pero sin datos (el backend no expone alertas).
- **Tiempo real:** `lib/realtime.ts` usa SignalR; el backend en Go no lo habla.
- **Lockfiles:** conviven `package-lock.json` y `pnpm-lock.yaml`; conviene elegir uno.
- **Perfil:** `/perfil` muestra "en construcción".
