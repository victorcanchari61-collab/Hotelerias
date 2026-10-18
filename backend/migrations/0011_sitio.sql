-- Sitio web: todo lo que el visitante ve en la web pública y el personal administra desde /admin.
--
-- Nada de esto vive en el código: portada con carrusel, fotos y videos, experiencias, blog
-- (historias y noticias), las páginas «Nosotros» y «Contacto», las galerías de cada hotel y
-- habitación, y los mensajes que llegan por el formulario de contacto.

-- La biblioteca de medios. El archivo vive en disco (uploads/sitio/<nombre al azar>); aquí queda
-- qué es, quién lo subió y su texto alternativo (lo que lee un lector de pantalla).
CREATE TABLE medio (
    id              BIGSERIAL   PRIMARY KEY,
    tipo            TEXT        NOT NULL CHECK (tipo IN ('imagen', 'video')),
    archivo         TEXT        NOT NULL UNIQUE,
    nombre_original TEXT        NOT NULL,
    mime            TEXT        NOT NULL,
    bytes           BIGINT      NOT NULL CHECK (bytes > 0),
    ancho           INTEGER,
    alto            INTEGER,
    descripcion     TEXT        NOT NULL DEFAULT '',
    creado_por      BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX medio_recientes_idx ON medio (creado_en DESC);

-- El carrusel de la portada. Un medio que está en uso NO se puede borrar (RESTRICT).
CREATE TABLE banner (
    id           BIGSERIAL PRIMARY KEY,
    orden        INTEGER   NOT NULL DEFAULT 0,
    titulo       TEXT      NOT NULL,
    subtitulo    TEXT      NOT NULL DEFAULT '',
    medio_id     BIGINT    REFERENCES medio (id) ON DELETE RESTRICT,
    enlace_texto TEXT      NOT NULL DEFAULT '',
    enlace_url   TEXT      NOT NULL DEFAULT '',
    activo       BOOLEAN   NOT NULL DEFAULT TRUE,
    desde        DATE,
    hasta        DATE,
    CONSTRAINT banner_fechas CHECK (desde IS NULL OR hasta IS NULL OR hasta >= desde)
);

CREATE TABLE experiencia (
    id        BIGSERIAL PRIMARY KEY,
    slug      TEXT      NOT NULL UNIQUE,
    titulo    TEXT      NOT NULL,
    resumen   TEXT      NOT NULL DEFAULT '',
    texto     TEXT      NOT NULL DEFAULT '',
    ejemplos  TEXT[]    NOT NULL DEFAULT '{}',
    medio_id  BIGINT    REFERENCES medio (id) ON DELETE RESTRICT,
    orden     INTEGER   NOT NULL DEFAULT 0,
    activo    BOOLEAN   NOT NULL DEFAULT TRUE
);

-- Blog: historias y noticias. El cuerpo es texto con formato simple (se dibuja sin HTML: ver
-- frontend), así que nada de lo que escriba el personal puede inyectar código en la web.
CREATE TABLE entrada (
    id             BIGSERIAL   PRIMARY KEY,
    slug           TEXT        NOT NULL UNIQUE,
    titulo         TEXT        NOT NULL,
    resumen        TEXT        NOT NULL DEFAULT '',
    cuerpo         TEXT        NOT NULL DEFAULT '',
    portada_id     BIGINT      REFERENCES medio (id) ON DELETE RESTRICT,
    estado         TEXT        NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'publicada')),
    publicada_en   TIMESTAMPTZ,
    autor_id       BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT entrada_publicada CHECK ((estado = 'publicada') = (publicada_en IS NOT NULL))
);
CREATE INDEX entrada_publicadas_idx ON entrada (publicada_en DESC) WHERE estado = 'publicada';

-- Páginas fijas con contenido editable.
CREATE TABLE pagina (
    clave          TEXT        PRIMARY KEY CHECK (clave IN ('nosotros', 'contacto')),
    titulo         TEXT        NOT NULL,
    cuerpo         TEXT        NOT NULL DEFAULT '',
    medio_id       BIGINT      REFERENCES medio (id) ON DELETE RESTRICT,
    actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO pagina (clave, titulo, cuerpo) VALUES
    ('nosotros', 'Nosotros', ''),
    ('contacto', 'Contacto', '');

-- Las fotos y videos de cada hotel y de cada tipo de habitación, en orden.
-- No hay clave foránea hacia sede/tipo (la entidad es texto): el servicio comprueba que existan.
CREATE TABLE galeria (
    id         BIGSERIAL PRIMARY KEY,
    entidad    TEXT      NOT NULL CHECK (entidad IN ('sede', 'tipo_habitacion')),
    entidad_id BIGINT    NOT NULL,
    medio_id   BIGINT    NOT NULL REFERENCES medio (id) ON DELETE RESTRICT,
    orden      INTEGER   NOT NULL DEFAULT 0,
    UNIQUE (entidad, entidad_id, medio_id)
);
CREATE INDEX galeria_entidad_idx ON galeria (entidad, entidad_id, orden);

-- Lo que llega por «Contacto». Lo escribe cualquiera, así que se guarda tal cual y se muestra
-- solo en el panel.
CREATE TABLE mensaje_contacto (
    id        BIGSERIAL   PRIMARY KEY,
    nombre    TEXT        NOT NULL,
    email     TEXT        NOT NULL,
    telefono  TEXT        NOT NULL DEFAULT '',
    asunto    TEXT        NOT NULL DEFAULT '',
    mensaje   TEXT        NOT NULL,
    estado    TEXT        NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'leido', 'respondido')),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mensaje_estado_idx ON mensaje_contacto (estado, creado_en DESC);
