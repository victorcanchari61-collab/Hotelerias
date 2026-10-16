-- Dos monedas: soles (la base, en la que se lleva la contabilidad) y dólares.
--
-- Los importes siguen siendo enteros en la unidad menor de SU moneda (céntimos
-- de sol, centavos de dólar): nunca decimales. Lo nuevo es DECIR en qué moneda
-- está cada importe y, cuando no son soles, con qué tipo de cambio se
-- convirtió: sin ese dato una reserva en dólares no se puede auditar ni facturar.

CREATE TABLE moneda (
    codigo    CHAR(3)  PRIMARY KEY,           -- ISO 4217
    nombre    TEXT     NOT NULL,
    simbolo   TEXT     NOT NULL,
    decimales SMALLINT NOT NULL DEFAULT 2 CHECK (decimales BETWEEN 0 AND 4),
    es_base   BOOLEAN  NOT NULL DEFAULT FALSE,
    activa    BOOLEAN  NOT NULL DEFAULT TRUE
);
-- Una sola moneda base: en ella está la contabilidad y la lista de precios.
CREATE UNIQUE INDEX moneda_base_unica ON moneda (es_base) WHERE es_base;

INSERT INTO moneda (codigo, nombre, simbolo, decimales, es_base) VALUES
    ('PEN', 'Soles',                    'S/',  2, TRUE),
    ('USD', 'Dólares estadounidenses',  'US$', 2, FALSE);

-- El tipo de cambio de cada día, por moneda. Se guarda como entero ×1.000.000
-- ("micro"): 3.752 es 3752000. Un decimal binario de coma flotante no representa
-- 3.752 exacto, y un error de céntimo en miles de comprobantes es un descuadre.
--   compra: lo que paga el mercado por un dólar.   venta: lo que cuesta un dólar.
-- Al convertir un precio en soles a dólares para el huésped se usa la VENTA.
CREATE TABLE tipo_cambio (
    id             BIGSERIAL   PRIMARY KEY,
    fecha          DATE        NOT NULL,
    moneda         CHAR(3)     NOT NULL REFERENCES moneda (codigo),
    compra_micro   BIGINT      NOT NULL CHECK (compra_micro > 0),
    venta_micro    BIGINT      NOT NULL CHECK (venta_micro > 0),
    -- 'manual' hoy; 'sunat'/'sbs' si algún día se importa.
    fuente         TEXT        NOT NULL DEFAULT 'manual',
    registrado_por BIGINT      REFERENCES usuario (id) ON DELETE SET NULL,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tipo_cambio_venta_mayor CHECK (venta_micro >= compra_micro),
    -- Un solo tipo de cambio por día y moneda: corregirlo es actualizar ese.
    CONSTRAINT tipo_cambio_unico UNIQUE (fecha, moneda)
);
CREATE INDEX tipo_cambio_reciente_idx ON tipo_cambio (moneda, fecha DESC);

-- La reserva guarda sus importes en la moneda en que se cotizó y COPIA el tipo
-- de cambio usado: si mañana cambia, lo ya reservado conserva lo que se le ofreció.
--   total_pen_cent = el equivalente en soles, para la contabilidad.
ALTER TABLE reserva
    ADD COLUMN moneda             CHAR(3) NOT NULL DEFAULT 'PEN' REFERENCES moneda (codigo),
    ADD COLUMN tipo_cambio_micro  BIGINT  CHECK (tipo_cambio_micro IS NULL OR tipo_cambio_micro > 0),
    ADD COLUMN total_pen_cent     BIGINT;

UPDATE reserva SET total_pen_cent = total_cent;
ALTER TABLE reserva ALTER COLUMN total_pen_cent SET NOT NULL;

-- En soles no hay conversión; en otra moneda siempre la hay.
ALTER TABLE reserva ADD CONSTRAINT reserva_moneda_cambio CHECK (
    (moneda = 'PEN' AND tipo_cambio_micro IS NULL AND total_pen_cent = total_cent) OR
    (moneda <> 'PEN' AND tipo_cambio_micro IS NOT NULL));
