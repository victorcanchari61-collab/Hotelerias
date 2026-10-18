-- Parámetros del sistema: solo los valores que se CAMBIARON.
--
-- Qué parámetros existen, sus límites y su valor por defecto viven en el código
-- (internal/parametro): una base vacía funciona con los valores por defecto, y
-- un parámetro nuevo no necesita migración. Los valores van como texto y el
-- servicio los valida contra su definición antes de guardarlos y al leerlos.

CREATE TABLE parametro (
    clave           TEXT        PRIMARY KEY,
    valor           TEXT        NOT NULL,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_por BIGINT      REFERENCES usuario (id) ON DELETE SET NULL
);
