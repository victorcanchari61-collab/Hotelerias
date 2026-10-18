-- Habitaciones físicas: la 101, la 102… (hasta ahora el hotel solo sabía "hay 12 Deluxe").
--
-- Tres decisiones que conviene conocer:
--
-- 1. `tipo_habitacion.cantidad` pasa a ser DERIVADA: es cuántas habitaciones ACTIVAS
--    tiene el tipo, y la mantiene un disparador. La disponibilidad de la web sigue
--    leyendo `cantidad` (no se tocó), pero ya no puede contradecir al inventario real.
--    Solo `activa` cuenta: que una habitación esté sucia o en mantenimiento es
--    transitorio y NO la saca de la venta de fechas futuras.
-- 2. `estado` es el estado operativo del día (limpia, sucia, ocupada, mantenimiento).
--    'ocupada' la pondrá el check-in; a mano no se asigna.
-- 3. La habitación no se borra (tendrá estadías detrás): se desactiva.

-- Para que una habitación no pueda apuntar a un tipo de OTRA sede.
ALTER TABLE tipo_habitacion
    ADD CONSTRAINT tipo_habitacion_id_sede_unico UNIQUE (id, sede_id);

CREATE TABLE habitacion (
    id                 BIGSERIAL PRIMARY KEY,
    sede_id            BIGINT      NOT NULL REFERENCES sede (id) ON DELETE CASCADE,
    tipo_habitacion_id BIGINT      NOT NULL,
    numero             TEXT        NOT NULL CHECK (btrim(numero) <> '' AND length(numero) <= 10),
    piso               SMALLINT    NOT NULL DEFAULT 1 CHECK (piso BETWEEN -5 AND 100),
    estado             TEXT        NOT NULL DEFAULT 'limpia'
                       CHECK (estado IN ('limpia', 'sucia', 'ocupada', 'mantenimiento')),
    notas              TEXT        NOT NULL DEFAULT '',
    activa             BOOLEAN     NOT NULL DEFAULT TRUE,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- El número es único dentro del hotel.
    CONSTRAINT habitacion_numero_unico UNIQUE (sede_id, numero),
    CONSTRAINT habitacion_tipo_de_la_sede FOREIGN KEY (tipo_habitacion_id, sede_id)
        REFERENCES tipo_habitacion (id, sede_id) ON DELETE CASCADE
);
CREATE INDEX habitacion_tipo_idx ON habitacion (tipo_habitacion_id) WHERE activa;

-- Las habitaciones que ya "existían" como un número: se numeran por piso, un piso por tipo
-- (101, 102… para el primer tipo de cada hotel; 201, 202… para el segundo).
INSERT INTO habitacion (sede_id, tipo_habitacion_id, numero, piso)
SELECT t.sede_id, t.id, t.orden::text || lpad(g::text, 2, '0'), t.orden
FROM (
    SELECT id, sede_id, cantidad,
           row_number() OVER (PARTITION BY sede_id ORDER BY id) AS orden
    FROM tipo_habitacion
    WHERE cantidad > 0
) t
CROSS JOIN LATERAL generate_series(1, t.cantidad) AS g;

-- Desde aquí `cantidad` sale del inventario: este disparador la recalcula siempre que
-- cambia una habitación, sea por la API o por cualquier otro camino.
CREATE FUNCTION habitacion_sincronizar_cantidad() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE tipo_habitacion
           SET cantidad = (SELECT count(*) FROM habitacion
                            WHERE tipo_habitacion_id = OLD.tipo_habitacion_id AND activa)
         WHERE id = OLD.tipo_habitacion_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE tipo_habitacion
           SET cantidad = (SELECT count(*) FROM habitacion
                            WHERE tipo_habitacion_id = NEW.tipo_habitacion_id AND activa)
         WHERE id = NEW.tipo_habitacion_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER habitacion_cantidad
    AFTER INSERT OR UPDATE OR DELETE ON habitacion
    FOR EACH ROW EXECUTE FUNCTION habitacion_sincronizar_cantidad();
