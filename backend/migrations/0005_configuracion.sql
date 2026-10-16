-- Configuración: empresa, solicitudes de permiso, alcance de datos y auditoría.
--
-- Completa el sistema de permisos de 0001 (roles + excepciones por persona) con
-- lo que falta para operarlo desde pantallas: pedir y aprobar permisos, limitar
-- QUÉ FILAS ve cada persona (sus sedes) y una bitácora de quién cambió qué.

-- Una sola empresa con varias sedes: la tabla guarda exactamente una fila
-- (el CHECK lo impide de otro modo). Se edita, no se crean más.
CREATE TABLE empresa (
    id                   SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    razon_social         TEXT        NOT NULL DEFAULT '',
    nombre_comercial     TEXT        NOT NULL DEFAULT '',
    ruc                  TEXT        NOT NULL DEFAULT '',
    direccion            TEXT        NOT NULL DEFAULT '',
    departamento         TEXT        NOT NULL DEFAULT '',
    provincia            TEXT        NOT NULL DEFAULT '',
    distrito             TEXT        NOT NULL DEFAULT '',
    telefono             TEXT        NOT NULL DEFAULT '',
    email                TEXT        NOT NULL DEFAULT '',
    sitio_web            TEXT        NOT NULL DEFAULT '',
    representante_legal  TEXT        NOT NULL DEFAULT '',
    actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO empresa (id, nombre_comercial) VALUES (1, 'Hotel Velothr');

-- Alguien se topó con una acción que no tiene y la pide. El admin la aprueba
-- (y se crea la excepción en usuario_permiso) o la rechaza.
CREATE TABLE solicitud_permiso (
    id               BIGSERIAL PRIMARY KEY,
    usuario_id       BIGINT      NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    submodulo        TEXT        NOT NULL,
    accion           TEXT        NOT NULL,
    motivo           TEXT        NOT NULL DEFAULT '',
    -- Sobre qué documento era ("Reserva HV-AB12-CD34"): para que el admin sepa.
    referencia       TEXT        NOT NULL DEFAULT '',
    estado           TEXT        NOT NULL DEFAULT 'pendiente'
                                 CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    fecha_solicitud  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resuelta_por     BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    fecha_resolucion TIMESTAMPTZ,
    respuesta        TEXT        NOT NULL DEFAULT '',
    -- La excepción que se creó al aprobar.
    permiso_id       BIGINT      REFERENCES usuario_permiso (id) ON DELETE SET NULL
);
CREATE INDEX solicitud_permiso_estado_idx ON solicitud_permiso (estado, fecha_solicitud DESC);
-- Pulsar dos veces "pedir" no llena la bandeja: una sola abierta por persona y permiso.
CREATE UNIQUE INDEX solicitud_permiso_abierta_unica
    ON solicitud_permiso (usuario_id, submodulo, accion) WHERE estado = 'pendiente';

-- Qué sedes atiende cada persona. Es lo que limita el alcance "mis sedes".
CREATE TABLE usuario_sede (
    usuario_id BIGINT NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    sede_id    BIGINT NOT NULL REFERENCES sede (id)    ON DELETE CASCADE,
    PRIMARY KEY (usuario_id, sede_id)
);
CREATE INDEX usuario_sede_sede_idx ON usuario_sede (sede_id);

-- El alcance no dice QUÉ puede hacer sino sobre QUÉ FILAS: 'todas' las sedes o
-- solo 'mis_sedes'. "todas" es la ausencia de restricción y no se guarda en el
-- rol; en la persona sí, porque ahí es una excepción que ensancha.
CREATE TABLE rol_alcance (
    rol_id    BIGINT NOT NULL REFERENCES rol (id) ON DELETE CASCADE,
    submodulo TEXT   NOT NULL,
    alcance   TEXT   NOT NULL CHECK (alcance IN ('todas', 'mis_sedes')),
    PRIMARY KEY (rol_id, submodulo)
);

CREATE TABLE usuario_alcance (
    usuario_id    BIGINT NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    submodulo     TEXT   NOT NULL,
    alcance       TEXT   NOT NULL CHECK (alcance IN ('todas', 'mis_sedes')),
    concedido_por BIGINT REFERENCES usuario (id) ON DELETE SET NULL,
    PRIMARY KEY (usuario_id, submodulo)
);

-- Bitácora: quién cambió qué y cuándo. Los valores van como JSON (los que
-- cambiaron en una edición, o el registro entero en un alta o una baja).
-- NUNCA contienen claves ni hashes: quien registra arma el mapa a mano.
CREATE TABLE auditoria (
    id                 BIGSERIAL PRIMARY KEY,
    fecha              TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL si el cambio no vino de una persona (arranque, siembra).
    usuario_id         BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    entidad            TEXT        NOT NULL,
    entidad_id         TEXT        NOT NULL,
    accion             TEXT        NOT NULL CHECK (accion IN ('CREADO', 'ACTUALIZADO', 'ELIMINADO')),
    valores_anteriores JSONB,
    valores_nuevos     JSONB
);
CREATE INDEX auditoria_fecha_idx   ON auditoria (fecha DESC, id DESC);
CREATE INDEX auditoria_entidad_idx ON auditoria (entidad, entidad_id);
CREATE INDEX auditoria_usuario_idx ON auditoria (usuario_id) WHERE usuario_id IS NOT NULL;
