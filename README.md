# Hotelerías — Hotel Velothr

Sistema integral de gestión para **Hotel Velothr**, una **cadena hotelera con presencia en todo el Perú** (varias sedes en cada ciudad). Combina, en una sola plataforma, dos frentes complementarios:

1. **Portal público de reservas** de habitaciones (orientado al huésped).
2. **ERP administrativo / back-office** para la operación interna de cada hotel y de la corporación.

Además de habitaciones, la empresa comercializa **servicios** (restaurante, eventos, spa, lavandería, etc.) y **productos** (tienda, minibar, amenidades), por lo que el sistema debe gestionarlos como una oferta unificada dentro de la misma operación.

---

## Objetivo del proyecto

Construir una plataforma única que permita a **Hotel Velothr**:

- **Vender en línea**: que cualquier persona pueda buscar disponibilidad por ciudad, comparar tarifas y reservar una habitación (o un paquete de habitación + servicios) desde la web.
- **Operar cada sede**: gestionar el día a día de cada hotel (recepción, limpieza, mantenimiento, consumos, caja) en cada ciudad del país.
- **Administrar la corporación**: consolidar información de todas las sedes para dirección, finanzas, inventario, RR. HH. y reportes, con un modelo **una sola empresa y múltiples sedes** (un único RUC, con sucursales en cada ciudad).
- **Facturar y cumplir la normativa local** (comprobantes electrónicos, validación de DNI/RUC).
- **Trazar y auditar** la actividad del sistema (logs centralizados y control de accesos por rol).

---

## Alcance funcional

### A. Portal público de reservas (B2C)

- Catálogo de hoteles y sedes con información, fotos y ubicación por ciudad.
- Motor de **disponibilidad y tarifas** por tipo de habitación y por fecha, en cada sede.
- Búsqueda, comparación y **reserva en línea** con confirmación.
- Paquetes y promociones (habitación + restaurante, spa, eventos, etc.).
- Pasarela de pagos y gestión de **"Mi reserva"** (consulta, modificación, cancelación).
- Venta de **servicios y productos** adicionales durante la reserva o la estadía.

### B. ERP administrativo / back-office (B2B interno)

| Módulo | Descripción |
| --- | --- |
| **PMS / Front Desk** | Check-in / check-out, estado de habitaciones, housekeeping (limpieza), huéspedes. |
| **Reservas** | Reservas de todos los canales (web, teléfono, recepción, OTAs). |
| **Tarifas** | Listas de precios, temporadas, revenue y descuentos. |
| **POS** | Punto de venta para restaurante, bar, tienda y consumos cargados a la habitación. |
| **Facturación** | Comprobantes electrónicos, notas de crédito/débito, series y parámetros. |
| **Inventario** | Almacenes, stock, kardex, lotes, amenidades e insumos. |
| **Compras** | Órdenes, compras y recepciones a proveedores. |
| **Finanzas** | Cajas, bancos, cuentas por cobrar/pagar, costos y estado de resultados. |
| **RR. HH.** | Empleados, asistencia, planilla y adelantos. |
| **Mantenimiento** | Órdenes de trabajo de habitaciones e instalaciones. |
| **Dashboard / Reportes** | Indicadores por sede y consolidados a nivel nacional. |
| **Configuración** | Empresas/sedes, usuarios, roles, permisos y auditoría. |

> El menú ERP actual del frontend (Maestros, Compras, Inventario, Facturación, Finanzas, TMS, DMS, RR. HH., Configuración) proviene de un proyecto de distribución y es una **plantilla de referencia**. Debe adaptarse a los módulos hoteleros listados arriba, conservando los conceptos transversales: una sola empresa, múltiples sedes, permisos por submodulo, auditoría y reportes.

---

## Arquitectura (estado actual)

```
Hotelerias/
├── backend/     # API en Go (Gin) — ver backend/README.md
│   ├── config/          # Carga y validación: config.yaml + .env + entorno
│   ├── migrations/      # SQL numerado, embebido en el binario
│   ├── internal/
│   │   ├── platform/    # httpx (errores, CORS), cache, migrate
│   │   ├── db/          # Conexiones PostgreSQL, MongoDB, Redis
│   │   ├── auth/        # JWT + middleware de sesión
│   │   ├── permiso/     # Catálogo, reglas, guard y endpoints de permisos
│   │   └── routes/      # Arma /api y cuelga los módulos
│   └── main.go          # Composition root
├── docs/        # Registro de cambios y decisiones
└── frontend/    # SPA en React + Vite + TypeScript + Tailwind — ver frontend/README.md
    └── src/
        ├── core/ domain/ data/ di/   # arquitectura por capas (la regla la verifica una prueba)
        ├── presentation/             # providers, rutas, layout y pantallas por feature
        ├── shared/                   # kit de UI (copia del de Ecommerce), un solo color
        └── lib/                      # fachadas heredadas (apiClient, authStorage, realtime)
```

> `backend/internal/{handlers,services,middleware,models}` y `backend/pkg` son una
> implementación paralela traída por la rama `b68c3e6`: compila pero **no está cableada**
> y debe portarse sobre `permiso`. Detalle en [`backend/README.md`](backend/README.md#código-heredado-sin-integrar).

### Stack tecnológico

- **Backend**: Go, Gin, PostgreSQL (datos transaccionales), MongoDB (logs/auditoría), Redis (cache/sesiones), JWT, validación DNI/RUC vía ApisPeru.
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, react-router-dom, SignalR (realtime), exportación Excel/PDF.
- **Modelo**: **una sola empresa, múltiples sedes** (un único RUC con sucursales en cada ciudad). Los nombres `Company_Multi` / `company_multi_logs` de la configuración actual son heredados de una plantilla y deberán renombrarse para reflejar este esquema.

---

## Estado actual

El repositorio es un **esqueleto funcional**:

- ✅ Backend con conexiones a las tres bases de datos (solo PostgreSQL es obligatoria), migraciones y endpoint de salud.
- ✅ **Sistema de permisos**: roles con herencia por unión, excepciones individuales (`una_vez`, `temporal`, `permanente`) y guard por ruta. Ver [`backend/README.md`](backend/README.md#sistema-de-permisos).
- ✅ Validación de JWT y configuración por `config.yaml` / `.env` / entorno, sin secretos versionados.
- ✅ Frontend con arquitectura por capas, rutas con políticas de acceso, kit de UI de un solo color y pantallas de login, inicio y usuarios (verificado contra un backend simulado).
- ⬜ **Login y usuarios** en el backend (hoy `/api/auth/login` no existe: bloquea el frontend).
- ⬜ CRUD de roles, concesión de excepciones, solicitudes de permiso y alcance de datos.
- ⬜ Endpoints de negocio (reservas, PMS, facturación, inventario, etc.).
- ⬜ Portal público de reservas.
- ⬜ Adaptación del menú ERP a los módulos hoteleros.

---

## Próximos pasos sugeridos

1. Implementar **login y usuarios** sobre el módulo `permiso` (desbloquea el frontend).
2. Definir el **modelo de datos** de hotelería (sedes, habitaciones, tipos, tarifas, reservas, huéspedes, consumos).
3. Desarrollar el **portal de reservas** (búsqueda de disponibilidad + reserva).
4. Desarrollar el **PMS / Front Desk** (recepción, housekeeping, check-in/out).
5. Adaptar e implementar el resto de módulos del ERP (facturación, inventario, finanzas, RR. HH.).

---

## Documentación

| Documento | Contenido |
| --- | --- |
| [`backend/README.md`](backend/README.md) | Cómo arrancar, configuración y secretos, arquitectura, sistema de permisos, endpoints, migraciones y pruebas |
| [`frontend/README.md`](frontend/README.md) | Arquitectura por capas, rutas y políticas de acceso, kit de UI de un solo color, pruebas |
| [`docs/CAMBIOS.md`](docs/CAMBIOS.md) | Registro de cambios con sus decisiones y los pendientes |
