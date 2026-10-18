-- Limpieza (housekeeping): quién limpió cada habitación y cuándo.
--
-- Cierra el ciclo:  check-out → habitación SUCIA → alguien la limpia → LIMPIA → se puede asignar.
--
-- Una habitación sucia ES una limpieza pendiente (se deriva de su estado; no hay una fila por cada
-- check-out). La tabla guarda solo lo que aporta información:
--   * una limpieza ABIERTA (asignada a alguien, o en curso), a lo más UNA por habitación;
--   * el HISTORIAL: las terminadas, con quién las hizo, cuándo y cuánto tardó.

CREATE TABLE limpieza (
    id            BIGSERIAL   PRIMARY KEY,
    habitacion_id BIGINT      NOT NULL REFERENCES habitacion (id),
    sede_id       BIGINT      NOT NULL REFERENCES sede (id),
    estado        TEXT        NOT NULL CHECK (estado IN ('asignada', 'en_curso', 'terminada')),
    asignada_a    BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    asignada_en   TIMESTAMPTZ,
    iniciada_en   TIMESTAMPTZ,
    terminada_en  TIMESTAMPTZ,
    terminada_por BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    observaciones TEXT        NOT NULL DEFAULT '',
    creada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT limpieza_terminada CHECK ((estado = 'terminada') = (terminada_en IS NOT NULL)),
    -- (Si una persona se borra, sus limpiezas quedan sin responsable en vez de impedir el borrado.)
    CONSTRAINT limpieza_en_curso  CHECK (estado <> 'en_curso' OR iniciada_en IS NOT NULL)
);

-- Una habitación, una sola limpieza abierta.
CREATE UNIQUE INDEX limpieza_abierta ON limpieza (habitacion_id) WHERE estado <> 'terminada';
-- El historial, lo más reciente primero, por hotel.
CREATE INDEX limpieza_historial_idx ON limpieza (sede_id, terminada_en DESC) WHERE estado = 'terminada';

-- Si una habitación deja de estar sucia por otro camino (pasa a mantenimiento, por ejemplo), la
-- limpieza abierta ya no tiene sentido: se descarta, para que no reaparezca vieja la próxima vez
-- que se ensucie. Lo hace la base, así vale sea cual sea el camino que cambió el estado.
CREATE FUNCTION limpieza_descartar_abierta() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM limpieza WHERE habitacion_id = NEW.id AND estado <> 'terminada';
    RETURN NULL;
END;
$$;

CREATE TRIGGER habitacion_deja_de_estar_sucia
    AFTER UPDATE OF estado ON habitacion
    FOR EACH ROW WHEN (OLD.estado = 'sucia' AND NEW.estado <> 'sucia')
    EXECUTE FUNCTION limpieza_descartar_abierta();
