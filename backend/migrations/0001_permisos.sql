-- Roles, usuarios mínimos y el sistema de permisos (rol + excepciones por usuario).
--
-- "usuario" nace con lo justo para colgar permisos de él; el módulo de
-- usuarios la ampliará (email, dni, password_hash...) con sus propias
-- migraciones.

CREATE TABLE rol (
    id             BIGSERIAL PRIMARY KEY,
    nombre         TEXT        NOT NULL UNIQUE,
    descripcion    TEXT,
    activo         BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Roles base: no se eliminan, hay cosas que dependen de ellos.
    del_sistema    BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Puede todo y su matriz no se configura. Es un dato, no el nombre del
    -- rol: así "Administrador" se puede renombrar y se pueden tener varios.
    acceso_total   BOOLEAN     NOT NULL DEFAULT FALSE,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO rol (nombre, descripcion, del_sistema, acceso_total) VALUES
    ('Administrador', 'Acceso total. No se configura.',        TRUE, TRUE),
    ('Vendedor',      'Toma pedidos y emite notas de venta.',  TRUE, FALSE),
    ('Almacenero',    'Maneja el almacén y el inventario.',    TRUE, FALSE);

CREATE TABLE usuario (
    id             BIGSERIAL PRIMARY KEY,
    nombre         TEXT        NOT NULL,
    activo         BOOLEAN     NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Todos los roles de la persona en una sola tabla (sin "rol principal" aparte).
-- Sus permisos son la UNIÓN de los de todos: tener más roles nunca quita nada.
CREATE TABLE usuario_rol (
    usuario_id BIGINT NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    rol_id     BIGINT NOT NULL REFERENCES rol (id)     ON DELETE RESTRICT,
    PRIMARY KEY (usuario_id, rol_id)
);
CREATE INDEX usuario_rol_rol_idx ON usuario_rol (rol_id);

-- Lo que un rol puede hacer: una acción sobre un submódulo. El módulo no se
-- guarda, sale del prefijo del submódulo ("fact.pedidos" es de "fact").
CREATE TABLE rol_permiso (
    rol_id    BIGINT NOT NULL REFERENCES rol (id) ON DELETE CASCADE,
    submodulo TEXT   NOT NULL,
    accion    TEXT   NOT NULL,
    PRIMARY KEY (rol_id, submodulo, accion)
);

-- Excepciones por persona: SOLO suman, no existe la que quita algo.
-- La fila no se borra nunca (se revoca o se gasta): queda quién tuvo qué.
CREATE TABLE usuario_permiso (
    id             BIGSERIAL PRIMARY KEY,
    usuario_id     BIGINT      NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    submodulo      TEXT        NOT NULL,
    accion         TEXT        NOT NULL,
    -- una_vez: se gasta al usarla. temporal: vale hasta expira_en. permanente: no vence.
    vigencia       TEXT        NOT NULL CHECK (vigencia IN ('una_vez', 'temporal', 'permanente')),
    expira_en      TIMESTAMPTZ,
    usos           INTEGER     NOT NULL DEFAULT 0,
    revocado       BOOLEAN     NOT NULL DEFAULT FALSE,
    motivo         TEXT,
    otorgado_por   BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    fecha_otorgado TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT temporal_con_vencimiento CHECK (vigencia <> 'temporal' OR expira_en IS NOT NULL)
);
-- La consulta caliente: lo vigente de una persona.
CREATE INDEX usuario_permiso_vigentes_idx ON usuario_permiso (usuario_id) WHERE NOT revocado;
