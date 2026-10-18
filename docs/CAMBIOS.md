# Registro de cambios

Qué cambió, por qué, y qué quedó pendiente. Lo más reciente primero.
Cómo usar lo que se describe aquí: [`backend/README.md`](../backend/README.md).

---

## 2026-10-17 — Recepción: check-in y check-out con la ficha de registro

La reserva deja de ser solo «un tipo de habitación entre dos fechas»: al llegar el huésped se le asigna una
**habitación física** (la 101) y se registra su **ficha**; al irse, se hace el check-out.
Migración `0009_estancia.sql`; pantalla `/admin/recepcion/estancias` (`recepcion.estancias`).

### Flujo

```
reserva confirmada ──check-in──► estancia «en casa»   (habitación → ocupada)
                    ◄─check-out─ estancia «finalizada» (habitación → SUCIA, reserva → completada)
```

El check-out deja la habitación **sucia**, no limpia: limpieza (housekeeping) la libera. Hasta entonces no se
puede asignar a nadie.

### Reglas (todas hechas cumplir en la base, no solo en pantalla)

- **Solo en fechas:** se recibe desde el día de entrada hasta antes de la salida (una llegada tardía de una
  reserva que ya empezó, sí). Antes de la fecha o con la estadía terminada se rechaza.
- **La habitación debe ser apta:** del mismo hotel y del **mismo tipo** reservado, activa, y **limpia**. Sucia, en
  mantenimiento u ocupada se rechazan con el motivo («la 101 está sucia (debe limpiarse primero)»).
- **Una reserva, una estancia; una habitación, una estancia abierta.** Lo garantizan un índice único parcial y un
  `UNIQUE`: dos recepcionistas asignando la misma habitación a la vez dan exactamente un check-in (hay una prueba
  de concurrencia con 6 simultáneos).
- **Todo en una transacción**, con la reserva y la habitación bloqueadas en orden fijo (reserva → habitación; en
  el check-out estancia → reserva → habitación) para que no haya bloqueos mutuos.
- **Ficha de registro**: tipo y número de documento (DNI 8 dígitos, carné de extranjería, pasaporte, otro, cada uno
  con su formato), nombre, nacionalidad, teléfono y **domiciliado sí/no**. Un **no domiciliado debe traer su
  fecha de ingreso al país** (no futura): la base lo exige con un `CHECK`. **Solo se guarda el dato**; cómo se
  usa para el IGV sigue pendiente del contador (ver `DISENO-MONEDA-IGV.md`).
- **Privacidad:** la ficha es un dato personal. Se lee con su **propio permiso** (`recepcion.fichas`), y la
  bitácora guarda el documento **enmascarado** (`dni *****678`), nunca completo.
- **Alcance por hotel:** `recepcion.estancias` se suma a los submódulos que se acotan en Accesos. Una reserva o
  estancia de otro hotel responde como inexistente.
- **Permiso:** ver el panel = `ver`; hacer check-in y check-out = `confirmar` (para eso `httpx.Guardas` ganó `Confirmar`).

### Corrección a lo anterior (habitaciones)

El disparador que mantiene `tipo_habitacion.cantidad` se disparaba en **cualquier** `UPDATE` de una habitación.
El check-in solo cambia el estado de la habitación, pero ese disparador habría bloqueado además la fila del tipo,
y la edición de habitaciones bloquea tipo → habitación: dos candados en orden contrario = riesgo de **deadlock**.
Ahora se dispara solo al cambiar `tipo_habitacion_id` o `activa` (en la `0009`, sin editar la `0008`).

### Rutas nuevas

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/estancia` | `recepcion.estancias:ver` — llegadas por atender + huéspedes en casa (acotado por hotel) |
| GET | `/api/estancia/habitaciones?reservaId=` | `…:ver` — habitaciones limpias del tipo reservado |
| POST | `/api/estancia` | `…:confirmar` — check-in `{reservaId, habitacionId, ficha}` |
| POST | `/api/estancia/:id/check-out` | `…:confirmar` |
| GET | `/api/ficha-registro/:id` | `recepcion.fichas:ver` |

### Pantalla

Listado de llegadas (por atender) y huéspedes en casa con indicadores (llegadas, en casa, salen hoy). Check-in:
elige la habitación (ya viene la primera libre), documento, nombre, nacionalidad, y «domiciliado» (si no, pide la fecha
de ingreso al país). Check-out: pide confirmar, avisa que la habitación queda sucia y si es una **salida anticipada**.
Si no hay habitaciones limpias del tipo, lo explica y no deja continuar.

### También: un fallo de pantalla encontrado y corregido

Una prueba de **Parámetros** falló una vez en una de varias corridas. La causa era real: la pantalla copiaba los datos
del servidor a su estado con un efecto, y esa copia podía **pisar lo que la persona estaba escribiendo** si los datos
llegaban justo después. Ahora la pantalla guarda solo las ediciones y el resto sale del servidor. (`EmpresaPage` tiene el
mismo patrón de copia al cargar; no se tocó.)

### Verificación

- Backend, **con la base real**: unitarias (ficha, enmascarado, traducción de reglas, alcance, auditoría) + 8 de
  integración (flujo completo, habitación apta, reserva vigente y fechas, ficha de extranjero, **concurrencia**,
  alcance por hotel, sesión).
- Frontend: 412 pruebas (24 nuevas), tres corridas completas verdes.
- En vivo por Apache: panel, errores 400/404/401 y alcances. **No se hizo un check-in real** sobre tus datos para
  no dejarte una estancia de prueba; el flujo completo está cubierto por las pruebas de integración.

### Pendiente

- **Panel de habitaciones** (vista de plano con el ocupante), **Cargos a la habitación** y la pantalla de **Fichas**
  (hoy solo se ve la ficha de cada huésped en casa).
- **Housekeeping**: hoy se marca limpia desde Habitaciones; falta la pantalla de limpieza con responsables y turnos.
- Cambiar de habitación durante la estancia; upgrade a otro tipo; acompañantes (hoy solo el titular).
- Cobro al hacer el check-out: depende de Cargos y Facturación.

---

## 2026-10-17 — Habitaciones: el inventario de habitaciones físicas

Hasta ahora el hotel solo sabía «hay 12 Deluxe». Ahora existen la 101, la 102… cada una con su tipo, piso
y estado del día. Es la base de Recepción (check-in/out), Housekeeping y Mantenimiento.
Migración `0008_habitacion.sql`; pantalla `/admin/habitaciones/habitaciones` (`habitaciones.habitaciones`).

### Reglas

- **`tipo_habitacion.cantidad` ahora es derivada**: es cuántas habitaciones **activas** tiene el tipo, y la
  mantiene un **disparador de la base**, así que no puede contradecir al inventario ni por la API ni por
  cualquier otro camino. La disponibilidad de la web sigue leyendo `cantidad` (no se tocó).
- **Activa ≠ estado.** *Activa* es parte del inventario que se vende; desactivar una la quita de la venta.
  *Estado* (limpia / sucia / mantenimiento / ocupada) es del día y **no** reduce lo que se puede reservar a
  futuro: una habitación sucia hoy se vende mañana.
- **No se puede quitar una habitación que una reserva necesita.** Desactivar una (o pasarla a otro tipo) se
  rechaza con un 409 si dejaría más reservas simultáneas que habitaciones. La comprobación va en la **misma
  transacción** y con el tipo bloqueado (el mismo candado que usa crear-reserva): dos personas quitando a la
  vez, o quitando mientras alguien reserva, no pueden dejar una reserva sin habitación. Hay una prueba de
  concurrencia que lo verifica.
- **«Ocupada» no se asigna a mano**: la pone el check-in y la quita el check-out. Una ocupada no se desactiva,
  no cambia de tipo ni de estado; una desactivada tampoco cambia de estado.
- **Número único por hotel** (la 101 puede existir en todos los hoteles). Una habitación no cambia de hotel.
- **Crear varias**: del 101 al 110 de una vez (hasta 100); **todas o ninguna** (si alguna ya existe, no se
  crea ninguna y el mensaje dice cuáles).
- **Alcance por hotel**: `habitaciones.habitaciones` se suma a los submódulos que se pueden acotar en
  Accesos («mis sedes»). Lo de otro hotel responde como inexistente.
- **Datos existentes**: la migración creó 80 habitaciones a partir de la cantidad de cada tipo (101… por hotel,
  un piso por tipo) y las cantidades siguen cuadrando. La siembra de demostración también las crea.

### Rutas nuevas

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/habitacion` · `/habitacion/opciones` | `habitaciones.habitaciones:ver` (acotado por hotel) |
| POST | `/api/habitacion` · `/habitacion/lote` | `…:crear` |
| PUT | `/api/habitacion/:id` | `…:editar` (datos, activar/desactivar) |
| PATCH | `/api/habitacion/:id/estado` | `…:editar` (limpia · sucia · mantenimiento) |

### Pantalla

Listado con indicadores (habitaciones, limpias, sucias, en mantenimiento), filtros por hotel, tipo y estado, y
por fila: marcar limpia / sucia / en mantenimiento con un clic, y editar. «Nueva habitación» y «Crear varias».

### Verificación

- Backend, **con la base real**: unitarias del servicio (reglas, alcance, errores) + 8 de integración
  (la siembra y la cantidad cuadran, crear/desactivar mueve la cantidad, no se quita lo que una reserva necesita,
  concurrencia, lote todo-o-nada, estados, alcance por hotel, sesión).
- Frontend: 388 pruebas (33 nuevas): validaciones, casos de uso, y la pantalla (indicadores, solo lectura sin
  permisos, estado con un clic, ocupada/desactivada bloqueadas, errores del servidor dentro del formulario, lote).
- En vivo por Apache: lista de 80, cambio de estado, «ocupada» rechazada, opciones, 401 sin sesión.

### Pendiente

- **Recepción**: check-in/out asignando una habitación física a cada reserva (hoy la reserva sigue siendo por
  tipo). Ahí se activa «ocupada».
- Housekeeping y Mantenimiento (órdenes, responsables, historial) sobre este inventario.
- Pantalla de **Tipos de habitación** (hoy se siembran): su `cantidad` será solo de lectura.

---

## 2026-10-17 — Configuración → Parámetros

La pantalla `/admin/config/parametros` existía solo en el menú y en el catálogo de permisos
(`config.parametros`: ver · editar); ahora está construida. Migración `0007_parametro.sql`.

### Cómo funciona

- **Las definiciones viven en código** (`backend/internal/parametro`), igual que el catálogo de permisos:
  clave, grupo, tipo, límites, valor por defecto y si la web puede mostrarlo. La base guarda **solo lo que
  se cambió**. Una base vacía funciona con los valores por defecto y un parámetro nuevo no necesita migración.
- **La pantalla se arma sola** con lo que el servidor lista: un parámetro nuevo aparece sin tocar el frontend.
- **Los valores son texto** (`"45"`, `"14:00"`) y se validan contra su definición al guardar y al leer.
  Guardar es **todo o nada**; solo se escribe lo que cambió y queda en Auditoría (antes → después).
- **Si la base no se puede leer, rigen los valores por defecto**: un fallo al leer un ajuste no impide reservar.
- Caché de 30 s por instancia, que se limpia al instante al guardar.

### Los cinco parámetros (todos con efecto real)

| Parámetro | Defecto | Qué cambia |
|---|---|---|
| Máximo de noches por reserva | 30 (1–365) | Cotizar, reservar y consultar disponibilidad por la web |
| Cancelación por la web | 1 día antes (0–30) | Hasta cuándo el huésped puede cancelar: 0 = hasta el mismo día |
| Hora de check-in | 14:00 | Se muestra en la página del hotel |
| Hora de check-out | 12:00 | Se muestra en la página del hotel |
| Antigüedad máxima del tipo de cambio | 7 días (0–30) | Hasta cuántos días atrás se acepta un tipo de cambio para cotizar en dólares |

Los datos de contacto (teléfono, correo, sitio web) **no** son parámetros: ya están en Empresa.

### Rutas nuevas

| Método | Ruta | Acceso |
|---|---|---|
| GET · PUT | `/api/parametro` | `config.parametros` ver · editar (el PUT recibe `{"valores": {"clave": "texto"}}`) |
| GET | `/api/portal/parametros` | Público: solo los marcados como públicos (los horarios) |

### Se corrigió de pasada: pruebas de integración que no se estaban corriendo

Al hacer `go test` **sin** `TEST_DATABASE_URL`, las pruebas contra PostgreSQL se **saltan** sin avisar y el
resultado sale en verde. En la entrega anterior (moneda) las corrí así y reporté verde. Corridas con la base
real destaparon tres fallos que ya estaban desde antes:

- `permiso/postgres`: esperaba 59 submódulos y el catálogo tiene 71.
- `usuario/postgres` (2 pruebas): insertaban reservas sin `total_pen_cent`, columna obligatoria desde `0006`.

Eran de las pruebas, no del sistema; ya están corregidas y el backend completo pasa **con** la base real.

### Verificación

- Backend: unitarias de `parametro` (defaults, validación, todo-o-nada, caché, valor corrupto, base caída)
  y del efecto en `reserva` y `moneda`; 4 de integración (permisos, el máximo de noches se nota en la
  cotización y la disponibilidad, valores inválidos no cambian nada, la web solo ve los públicos).
- Frontend: 355 pruebas (21 nuevas): validación, "solo lo que cambió", restablecer, solo lectura sin
  permiso de editar, horarios en la página del hotel.
- En vivo por Apache: lista, cambia a 45, rechaza 0, vuelve a 30.

### Pendiente

- Más parámetros según se necesiten (cada uno es una línea en `Definiciones` y un lugar donde se lea).
- El IGV como parámetro espera la respuesta del contador (ver `DISENO-MONEDA-IGV.md`).

---

## 2026-10-15 — Dos monedas (PEN y USD) y módulos faltantes del menú

Se completó el menú con los módulos que faltaban para un hotel de lujo (el grupo **Integraciones** y
nueve submódulos) y se agregó **moneda** al dinero antes de que existan facturas. La exoneración del IGV
a extranjeros **no se programó**: queda como diseño para confirmar con el contador.
Diseño y preguntas abiertas: [`DISENO-MONEDA-IGV.md`](DISENO-MONEDA-IGV.md). Migración `0006_moneda.sql`.

### Menú y permisos: 59 → 71 submódulos

| Módulo | Nuevo | Permiso |
|---|---|---|
| Recepción | Fichas de registro (documento, nacionalidad, fecha de ingreso) | `recepcion.fichas` |
| Habitaciones | Objetos olvidados · Lencería y lavandería | `habitaciones.objetos` · `habitaciones.lenceria` |
| CRM | Puntos y membresías | `crm.lealtad` (con *confirmar* = canjear/ajustar) |
| Restaurantes | Recetas y escandallo | `restaurantes.recetas` |
| Servicios exclusivos | Mayordomía y concierge · Mascotas · Salones y banquetes | `servicios.mayordomia` · `servicios.mascotas` · `servicios.salones` |
| Finanzas | **Tipo de cambio** (construido) | `finanzas.tipocambio` |
| **Integraciones** (grupo nuevo) | Channel manager · Pasarelas de pago · Telefonía y cerraduras | `integraciones.channel` · `.pagos` · `.dispositivos` |

Excepto *Tipo de cambio*, estas pantallas salen como **«en construcción»** (el registro de rutas las
crea solas desde el menú) pero ya tienen su permiso, así que se pueden asignar a roles desde hoy.

### Dos monedas

- **Tablas**: `moneda` (PEN base, USD) y `tipo_cambio` (uno por día y moneda; compra y venta). La
  reserva guarda `moneda`, el `tipo_cambio_micro` con que se convirtió y `total_pen_cent`. Un `CHECK`
  garantiza que en soles no hay tipo de cambio y en otra moneda siempre.
- **Enteros siempre**: importes en la unidad menor; la tasa ×1.000.000 y entrando como **texto**
  (`"3.752"`) para no pasar por coma flotante. Redondeo mitad hacia arriba, idéntico en Go y TypeScript.
- **Cotizar y reservar en dólares**: el motor de promociones decide en soles y lo decidido se convierte;
  las líneas suman exacto. La reserva **copia** el tipo de cambio: corregir un día no mueve lo reservado.
- **Sin tipo de cambio reciente no se cotiza en dólares** (se admite hasta 7 días atrás por fines de
  semana y feriados); la web simplemente no ofrece la opción.
- **Web**: selector S/ · US$ en la cabecera (la preferencia se recuerda en el navegador y la pantalla
  funciona aunque el almacenamiento falle). El desglose muestra el tipo de cambio y el equivalente en soles.
- **Panel**: *Finanzas → Tipo de cambio* (registrar y corregir) y *Reservas* muestra cada reserva en su
  moneda; el «importe confirmado» suma el equivalente en soles.

### Rutas nuevas

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/portal/monedas` | Público: monedas y venta de hoy (solo las que se pueden cotizar) |
| GET · POST | `/api/tipo-cambio` | `finanzas.tipocambio` ver · crear (el POST registra o corrige el día) |
| POST | `/api/portal/cotizar` · `/portal/reservas` | aceptan `"moneda": "USD"` |

### Verificación

- Backend: unitarias de `moneda` (conversión, tasas, vigencia, validaciones) y de `reserva` (soles por
  defecto, dólares con descuento, sin tasa, moneda inválida) + 4 de integración contra PostgreSQL
  (monedas públicas, cotizar y reservar en dólares con la tasa copiada, reserva en soles, permisos y validación).
- Frontend: 334 pruebas (37 nuevas): conversión idéntica al servidor, casos de uso, selector de moneda,
  almacenamiento roto, «mis reservas» en dólares y la pantalla de tipo de cambio.
- En vivo contra la API: cotiza en PEN y USD, rechaza EUR y una tasa enviada como número JSON.

### Pendiente

- **IGV a extranjeros (DL 919)**: ver las 9 preguntas para el contador en el documento de diseño.
- Tipo de cambio automático (SUNAT/SBS); hoy es manual.
- Cobro y pasarela de pago; recotizar si el tipo de cambio cambió entre cotizar y reservar.

---

## 2026-10-15 — Configuración completa: Empresa, Sedes, Usuarios, Roles, Accesos y Auditoría

Se terminó el grupo **Configuración** del menú, portando la **lógica** del proyecto `distributor`
(no su dominio): roles con matriz, excepciones por persona, solicitudes de permiso, alcance de datos
y bitácora. Migración `0005_configuracion.sql`.

### Qué hay en cada pantalla

| Pantalla | Qué hace | Permiso |
|---|---|---|
| **Empresa** | Los datos de la empresa (una sola, con varias sedes): razón social, RUC (11 dígitos), contacto | `config.empresa` |
| **Sedes** | Alta y edición de hoteles; se desactivan, no se borran | `config.sedes` |
| **Usuarios** | Alta/edición/baja con **varios roles** y **sedes que atiende**; antes los botones daban 404 | `config.usuarios` |
| **Roles** | Crear y nombrar roles; el de acceso total está protegido | `config.roles` |
| **Accesos** | *Por rol*: matriz completa + alcance por sede · *Por persona*: excepciones (una vez / hasta fecha / permanente) y alcance propio · *Solicitudes*: bandeja del administrador | `config.accesos` |
| **Auditoría** | Quién cambió qué y cuándo, con filtros, "Ver cambios" (antes → después) y depuración | `config.auditoria` |

Además, cuando el servidor niega algo que la persona pulsó (403), aparece **«Pedir acceso»**: la
solicitud lleva exactamente qué permiso faltaba y llega a la bandeja de Accesos.

### Reglas portadas (y por qué)

- **Roles y matriz separados a propósito**: crear/nombrar roles exige `config.roles`; decidir qué puede
  cada rol exige `config.accesos`. Con "editar roles" solo nadie puede autoconcederse permisos.
- **Cualquier acción implica "ver"**, y quitar "ver" quita lo demás de esa pantalla (la pantalla lo
  refleja igual que el servidor: sin esto el permiso quedaría concedido pero inalcanzable).
- **El rol de acceso total no se configura, desactiva ni elimina**; un rol con personas no se elimina;
  los roles del sistema tampoco.
- **Nadie deja el sistema sin administrador**: no se puede desactivar, eliminar ni quitar el acceso
  total al último administrador activo; y nadie desactiva ni elimina su propia cuenta.
- **Las excepciones solo suman** y su fila no se borra nunca (se revoca o se gasta): queda quién tuvo qué.
- **Aprobar una solicitud es una transacción** (bloquea la fila): dos administradores con la bandeja
  abierta no conceden dos veces; el segundo recibe un conflicto. Pedir dos veces lo mismo devuelve la
  solicitud ya abierta.
- **Alcance por sede**: `todas` o `mis_sedes`. Lo de la persona manda sobre lo del rol; con varios roles
  gana el más amplio; sin fila no restringe. Con `mis_sedes` y **ninguna sede asignada no ve nada**
  (nunca "todas" por descuido). Hoy aplica a **Reservas** del panel (listar y cancelar); solo se
  ofrece en la configuración lo que el backend de verdad aplica.
- **Auditoría sin secretos**: quien registra arma el mapa a mano (jamás un hash ni una clave; al
  cambiar una contraseña solo queda "cambiada"); en una edición se guarda **solo lo que cambió**. No
  se depura lo de los últimos 30 días, y la depuración deja un registro de qué se borró (escrito
  después del borrado, para que no se lo lleve).

### Corrección de diseño: los listados usan el kit de referencia

La primera versión de estas pantallas (y de las del portal en el panel) tenía `<table>` escritas a
mano. Se rehicieron con **`ListPage` + `StatCard` + `SysDataTable` + botonera `ButtonBase`** (íconos de
`react-icons/fa6`), igual que `UsersPage`/`RolesPage` del proyecto de referencia: buscador, filtros por
columna, columnas visibles, paginación y tarjetas en móvil salen del kit. Alcanza a Usuarios, Roles,
Sedes, Paquetes y promociones, Fidelización, Huéspedes, Reservas, Auditoría y las tablas de Accesos
(excepciones y solicitudes). La matriz de accesos sigue el estilo de la referencia (una sección por
módulo, una fila por pantalla, casillas del kit). Empresa usa `PageSection`.

- Nueva dependencia: **`react-icons`** (la que usa la referencia). Se instaló con `npm`; el
  `pnpm-lock.yaml` quedó sin actualizar (conviven dos lockfiles: conviene elegir uno).
- **Auditoría en modo servidor**: `POST /api/auditoria/listar` recibe la misma consulta que emite la
  tabla (`pagina, porPagina, buscar, orden, sentido, filtros[]`), con columnas y orden de **lista
  cerrada** (nada del cliente llega al SQL como texto). `POST /api/auditoria/depurar` recibe esa misma
  consulta y borra **exactamente lo que se está viendo** (como en `distributor`), pero nunca lo de los
  últimos 30 días.

### Un error encontrado y corregido

Una excepción de **un solo uso sobre "ver"** nunca se gastaba: el "ver implícito" que otorga cualquier
excepción del submódulo la tapaba y valía para siempre. Ahora la excepción sobre el propio "ver" no
cuenta como implícita (test de regresión en `permiso/acceso_test.go`).

### Otros cambios

- `config.auditoria` ahora admite **Eliminar** (depurar) en el catálogo.
- Los guards del panel se arman solo con las acciones que el submódulo admite; las demás quedan
  **cerradas** (403), nunca "sin filtro": una ruta que pida una acción inexistente niega en vez de
  dejar pasar.
- `httpx.Validacion` y `httpx.Conflicto` + `httpx.Traducir`: los módulos de negocio no conocen códigos HTTP.
- Perfil de usuario: `rolIds` y `sedeIds`.
- `usuario` y `auditoria` reciben quién actúa como función (no importan `auth`: evita un ciclo).

### Verificación

- Backend: `go vet` y `go test ./...` en verde, con pruebas de punta a punta contra PostgreSQL real
  (roles y matriz con efecto inmediato, protecciones, último administrador, excepciones de un solo uso,
  solicitudes y doble resolución, alcance por sede, empresa/sedes, auditoría sin secretos).
- Frontend: `tsc` sin errores y **296 pruebas**; build de producción.
- Probado a mano contra el backend real con una cuenta de prueba (ya borrada junto con lo que creó):
  matriz de accesos, guardado con "ver" implícito, auditoría y alta de usuario con roles y sedes.

### Pendiente

- Foto y logo de la empresa; perfil de usuario (`/admin/perfil` sigue "en construcción").
- Notificar en vivo (hoy se refresca al volver a consultar); el aviso de solicitud resuelta al solicitante.
- Auditoría de ofertas, tipos de cliente y huéspedes (hoy registran: roles, usuarios, accesos, empresa,
  sedes y cancelaciones del personal).
- Alcance por sede en más pantallas, a medida que existan.

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
