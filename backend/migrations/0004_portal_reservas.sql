-- Portal de reservas: lo que el huésped ve y reserva por la web.
--
-- Convenciones:
--  * Dinero en CÉNTIMOS enteros (BIGINT, sufijo _cent): nunca float. S/ 380.00
--    es 38000. Redondear es decisión del código, no de un tipo de dato.
--  * Una sola empresa con varias sedes: "sede" es cada hotel de la cadena.

CREATE TABLE sede (
    id          BIGSERIAL PRIMARY KEY,
    nombre      TEXT        NOT NULL,
    ciudad      TEXT        NOT NULL,
    direccion   TEXT        NOT NULL DEFAULT '',
    descripcion TEXT        NOT NULL DEFAULT '',
    estrellas   SMALLINT    NOT NULL DEFAULT 5 CHECK (estrellas BETWEEN 1 AND 5),
    imagen      TEXT        NOT NULL DEFAULT '',
    servicios   TEXT[]      NOT NULL DEFAULT '{}',
    activo      BOOLEAN     NOT NULL DEFAULT TRUE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una categoría de habitación de una sede ("Suite Ejecutiva") y CUÁNTAS hay.
-- La disponibilidad se calcula contra las reservas que se cruzan con las fechas.
CREATE TABLE tipo_habitacion (
    id               BIGSERIAL PRIMARY KEY,
    sede_id          BIGINT   NOT NULL REFERENCES sede (id) ON DELETE CASCADE,
    nombre           TEXT     NOT NULL,
    descripcion      TEXT     NOT NULL DEFAULT '',
    capacidad        SMALLINT NOT NULL CHECK (capacidad > 0),
    camas            TEXT     NOT NULL DEFAULT '',
    area_m2          SMALLINT NOT NULL DEFAULT 0 CHECK (area_m2 >= 0),
    precio_noche_cent BIGINT  NOT NULL CHECK (precio_noche_cent >= 0),
    cantidad         SMALLINT NOT NULL CHECK (cantidad >= 0),
    amenidades       TEXT[]   NOT NULL DEFAULT '{}',
    imagen           TEXT     NOT NULL DEFAULT '',
    activo           BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE INDEX tipo_habitacion_sede_idx ON tipo_habitacion (sede_id);

-- Cómo se clasifica a un huésped: Regular, Frecuente, VIP, Corporativo...
-- El hotel crea los suyos. `reservas_minimas` es la regla automática: al llegar a
-- ese número de reservas el huésped sube de tipo solo (NULL = solo manual).
CREATE TABLE tipo_cliente (
    id               BIGSERIAL PRIMARY KEY,
    nombre           TEXT    NOT NULL UNIQUE,
    descripcion      TEXT    NOT NULL DEFAULT '',
    descuento_pct    INTEGER NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
    reservas_minimas INTEGER CHECK (reservas_minimas IS NULL OR reservas_minimas > 0),
    orden            INTEGER NOT NULL DEFAULT 0,
    activo           BOOLEAN NOT NULL DEFAULT TRUE
);

-- El huésped que reserva por la web. Cuenta APARTE del personal (tabla usuario):
-- no comparten login ni token, y un huésped no tiene ningún acceso al panel.
CREATE TABLE cliente (
    id              BIGSERIAL PRIMARY KEY,
    nombre          TEXT        NOT NULL,
    apellido        TEXT        NOT NULL DEFAULT '',
    email           TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL,
    telefono        TEXT        NOT NULL DEFAULT '',
    pais            TEXT        NOT NULL DEFAULT '',
    tipo_cliente_id BIGINT      REFERENCES tipo_cliente (id) ON DELETE SET NULL,
    -- true: el personal fijó el tipo a mano y la regla automática no lo mueve.
    tipo_manual     BOOLEAN     NOT NULL DEFAULT FALSE,
    activo          BOOLEAN     NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cliente_email_unico ON cliente (lower(email));

-- Ofertas y promociones que crea el hotel.
--   tipo 'porcentaje'   → porcentaje (1..100) sobre el total de la estadía
--   tipo 'monto_noche'  → monto_noche_cent menos POR NOCHE
-- sede_id NULL = todas las sedes. tipo_cliente_id NULL = todos los huéspedes.
-- codigo NULL = se aplica sola; con código, solo si el huésped lo escribe.
-- desde/hasta: las fechas de ESTADÍA para las que vale (toda la estadía adentro).
CREATE TABLE promocion (
    id              BIGSERIAL PRIMARY KEY,
    nombre          TEXT     NOT NULL,
    descripcion     TEXT     NOT NULL DEFAULT '',
    tipo            TEXT     NOT NULL CHECK (tipo IN ('porcentaje', 'monto_noche')),
    porcentaje      INTEGER  CHECK (porcentaje BETWEEN 1 AND 100),
    monto_noche_cent BIGINT  CHECK (monto_noche_cent > 0),
    codigo          TEXT,
    sede_id         BIGINT   REFERENCES sede (id) ON DELETE CASCADE,
    -- Si se borra el tipo de cliente, la promo que era SOLO para él se va con él:
    -- dejarla abierta a todos regalaría un descuento que nadie decidió dar.
    tipo_cliente_id BIGINT   REFERENCES tipo_cliente (id) ON DELETE CASCADE,
    desde           DATE     NOT NULL,
    hasta           DATE     NOT NULL,
    min_noches      SMALLINT NOT NULL DEFAULT 1 CHECK (min_noches >= 1),
    activo          BOOLEAN  NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT promocion_fechas CHECK (hasta >= desde),
    CONSTRAINT promocion_valor CHECK (
        (tipo = 'porcentaje'  AND porcentaje IS NOT NULL AND monto_noche_cent IS NULL) OR
        (tipo = 'monto_noche' AND monto_noche_cent IS NOT NULL AND porcentaje IS NULL))
);
CREATE UNIQUE INDEX promocion_codigo_unico ON promocion (upper(codigo)) WHERE codigo IS NOT NULL;

CREATE TABLE reserva (
    id                  BIGSERIAL PRIMARY KEY,
    codigo              TEXT        NOT NULL UNIQUE,
    cliente_id          BIGINT      NOT NULL REFERENCES cliente (id),
    sede_id             BIGINT      NOT NULL REFERENCES sede (id),
    tipo_habitacion_id  BIGINT      NOT NULL REFERENCES tipo_habitacion (id),
    check_in            DATE        NOT NULL,
    check_out           DATE        NOT NULL,
    huespedes           SMALLINT    NOT NULL CHECK (huespedes > 0),
    noches              SMALLINT    NOT NULL CHECK (noches > 0),
    precio_noche_cent   BIGINT      NOT NULL,
    subtotal_cent       BIGINT      NOT NULL,
    descuento_cent      BIGINT      NOT NULL DEFAULT 0 CHECK (descuento_cent >= 0),
    total_cent          BIGINT      NOT NULL,
    -- Lo aplicado, COPIADO: si la promo cambia o se desactiva, la reserva ya
    -- hecha conserva lo que se le ofreció.
    descuento_origen    TEXT        NOT NULL DEFAULT '',
    descuento_nombre    TEXT        NOT NULL DEFAULT '',
    promocion_id        BIGINT      REFERENCES promocion (id) ON DELETE SET NULL,
    estado              TEXT        NOT NULL DEFAULT 'confirmada'
                                    CHECK (estado IN ('confirmada', 'cancelada', 'completada')),
    notas               TEXT        NOT NULL DEFAULT '',
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reserva_fechas CHECK (check_out > check_in),
    CONSTRAINT reserva_total CHECK (total_cent = subtotal_cent - descuento_cent AND total_cent >= 0)
);
-- La consulta caliente: cuántas reservas se cruzan con unas fechas.
CREATE INDEX reserva_disponibilidad_idx ON reserva (tipo_habitacion_id, check_in, check_out)
    WHERE estado = 'confirmada';
CREATE INDEX reserva_cliente_idx ON reserva (cliente_id, creado_en DESC);
