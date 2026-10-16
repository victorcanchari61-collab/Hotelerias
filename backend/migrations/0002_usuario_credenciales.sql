-- Credenciales y perfil del usuario: lo necesario para poder iniciar sesión.
--
-- 0001 dejó "usuario" mínima (id, nombre, activo) a propósito: este es el módulo
-- que la completa. Las filas que ya existan quedan con password_hash = '' y por
-- tanto NO pueden entrar (un hash vacío nunca coincide con ninguna clave).

ALTER TABLE usuario
    ADD COLUMN apellido      TEXT NOT NULL DEFAULT '',
    ADD COLUMN email         TEXT,
    ADD COLUMN telefono      TEXT NOT NULL DEFAULT '',
    ADD COLUMN foto          TEXT NOT NULL DEFAULT '',
    -- bcrypt. Nunca la clave: si la base se filtra, no se filtran las claves.
    ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';

-- El correo es único sin importar mayúsculas: "Ana@x.pe" y "ana@x.pe" son la
-- misma cuenta. Parcial porque el correo es opcional en filas antiguas.
CREATE UNIQUE INDEX usuario_email_unico ON usuario (lower(email)) WHERE email IS NOT NULL;
