-- Estancias: el check-in y el check-out, con la ficha de registro del huésped.
--
-- Hasta ahora una reserva era "un tipo de habitación entre dos fechas". Una estancia
-- es la reserva YA CUMPLIDA: el huésped llegó, se le asignó una habitación física
-- concreta (la 101) y firmó su ficha. Una reserva tiene a lo más UNA estancia.
--
-- Consistencia que garantiza la base, no solo el código:
--   * una habitación no puede tener dos estancias abiertas a la vez (índice parcial único);
--   * una estancia abierta no tiene hora de salida y una cerrada sí (CHECK);
--   * un huésped no domiciliado trae su fecha de ingreso al país (CHECK): es lo que más
--     adelante sustenta el tratamiento del IGV (ver docs/DISENO-MONEDA-IGV.md). Cómo se
--     usa esa fecha NO está decidido todavía: aquí solo se guarda el dato.

CREATE TABLE estancia (
    id                 BIGSERIAL PRIMARY KEY,
    reserva_id         BIGINT      NOT NULL UNIQUE REFERENCES reserva (id),
    sede_id            BIGINT      NOT NULL REFERENCES sede (id),
    habitacion_id      BIGINT      NOT NULL REFERENCES habitacion (id),
    estado             TEXT        NOT NULL DEFAULT 'en_casa' CHECK (estado IN ('en_casa', 'finalizada')),
    check_in_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    check_out_en       TIMESTAMPTZ,

    -- La ficha de registro del titular.
    documento_tipo     TEXT        NOT NULL CHECK (documento_tipo IN ('dni', 'ce', 'pasaporte', 'otro')),
    documento_numero   TEXT        NOT NULL CHECK (btrim(documento_numero) <> ''),
    nombre_completo    TEXT        NOT NULL CHECK (btrim(nombre_completo) <> ''),
    nacionalidad       TEXT        NOT NULL CHECK (btrim(nacionalidad) <> ''),
    domiciliado        BOOLEAN     NOT NULL,
    fecha_ingreso_pais DATE,
    telefono           TEXT        NOT NULL DEFAULT '',

    registrado_por     BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    cerrado_por        BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,

    CONSTRAINT estancia_salida CHECK (
        (estado = 'en_casa' AND check_out_en IS NULL) OR (estado = 'finalizada' AND check_out_en IS NOT NULL)),
    CONSTRAINT estancia_ingreso_pais CHECK (domiciliado OR fecha_ingreso_pais IS NOT NULL)
);

-- El disparador de `cantidad` (0008) se dispara solo cuando cambia lo que de verdad la afecta:
-- el tipo o si está activa. Antes se disparaba en CUALQUIER UPDATE, y el check-in (que solo cambia
-- el estado de la habitación) habría bloqueado además la fila del tipo: con otro cambio que bloquea
-- tipo y luego habitación, dos locks en orden contrario = bloqueo mutuo (deadlock).
DROP TRIGGER habitacion_cantidad ON habitacion;
CREATE TRIGGER habitacion_cantidad
    AFTER INSERT OR DELETE OR UPDATE OF tipo_habitacion_id, activa ON habitacion
    FOR EACH ROW EXECUTE FUNCTION habitacion_sincronizar_cantidad();

-- Una habitación, una sola estancia abierta.
CREATE UNIQUE INDEX estancia_habitacion_abierta ON estancia (habitacion_id) WHERE estado = 'en_casa';
-- El panel de recepción: lo que está en casa, por hotel.
CREATE INDEX estancia_abiertas_idx ON estancia (sede_id) WHERE estado = 'en_casa';
