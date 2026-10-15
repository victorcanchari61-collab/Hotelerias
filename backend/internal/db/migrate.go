package db

import (
	"context"
	"fmt"
	"log"

	"hotelerias/backend/internal/models"
	"hotelerias/backend/pkg/utils"
)

// Migrar crea las tablas del sistema si no existen. Es idempotente: se puede
// llamar en cada arranque sin romper datos.
func Migrar(ctx context.Context, pool *PostgresDB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS empresa (
			id                BIGSERIAL PRIMARY KEY,
			ruc               VARCHAR(11) NOT NULL DEFAULT '',
			razon_social      VARCHAR(255) NOT NULL DEFAULT '',
			nombre_comercial  VARCHAR(255) NOT NULL DEFAULT '',
			direccion         TEXT NOT NULL DEFAULT '',
			departamento      VARCHAR(100) NOT NULL DEFAULT '',
			provincia         VARCHAR(100) NOT NULL DEFAULT '',
			distrito          VARCHAR(100) NOT NULL DEFAULT '',
			telefono          VARCHAR(30) NOT NULL DEFAULT '',
			email             VARCHAR(255) NOT NULL DEFAULT '',
			web               VARCHAR(255) NOT NULL DEFAULT '',
			logo              TEXT NOT NULL DEFAULT '',
			updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS roles (
			id          BIGSERIAL PRIMARY KEY,
			nombre      VARCHAR(100) NOT NULL UNIQUE,
			descripcion TEXT NOT NULL DEFAULT '',
			es_sistema  BOOLEAN NOT NULL DEFAULT FALSE,
			creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS usuarios (
			id            BIGSERIAL PRIMARY KEY,
			rol_id        BIGINT REFERENCES roles(id) ON DELETE SET NULL,
			nombre        VARCHAR(100) NOT NULL,
			apellido      VARCHAR(100) NOT NULL,
			email         VARCHAR(255) NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			telefono      VARCHAR(30) NOT NULL DEFAULT '',
			foto          TEXT NOT NULL DEFAULT '',
			activo        BOOLEAN NOT NULL DEFAULT TRUE,
			creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
			actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS rol_permisos (
			rol_id    BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
			submodulo VARCHAR(100) NOT NULL,
			accion    VARCHAR(30) NOT NULL,
			PRIMARY KEY (rol_id, submodulo, accion)
		)`,
	}

	for _, s := range stmts {
		if _, err := pool.Pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("migración fallida: %w", err)
		}
	}

	return Sembrar(ctx, pool)
}

// Sembrar garantiza que exista la fila de empresa, el rol Administrador con
// acceso total y un usuario administrador inicial.
func Sembrar(ctx context.Context, pool *PostgresDB) error {
	// Empresa: exactamente una fila (id = 1).
	if _, err := pool.Pool.Exec(ctx,
		`INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
	); err != nil {
		return fmt.Errorf("sembrar empresa: %w", err)
	}

	// Rol Administrador (de sistema, no se puede eliminar).
	var rolID int64
	err := pool.Pool.QueryRow(ctx,
		`INSERT INTO roles (nombre, descripcion, es_sistema)
		 VALUES ('Administrador', 'Acceso total al sistema', TRUE)
		 ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
		 RETURNING id`,
	).Scan(&rolID)
	if err != nil {
		return fmt.Errorf("sembrar rol administrador: %w", err)
	}

	// Todos los permisos para el Administrador.
	for _, clave := range models.TodasLasClaves() {
		submodulo, accion := partirClave(clave)
		if _, err := pool.Pool.Exec(ctx,
			`INSERT INTO rol_permisos (rol_id, submodulo, accion)
			 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			rolID, submodulo, accion,
		); err != nil {
			return fmt.Errorf("sembrar permisos del administrador: %w", err)
		}
	}

	// Usuario administrador inicial. Solo se crea si no existe ningún usuario.
	var cuenta int
	if err := pool.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM usuarios`).Scan(&cuenta); err != nil {
		return fmt.Errorf("contar usuarios: %w", err)
	}
	if cuenta == 0 {
		hash, err := utils.HashPassword("Admin123!")
		if err != nil {
			return fmt.Errorf("hash de contraseña inicial: %w", err)
		}
		if _, err := pool.Pool.Exec(ctx,
			`INSERT INTO usuarios (rol_id, nombre, apellido, email, password_hash)
			 VALUES ($1, 'Administrador', 'Sistema', 'admin@velothr.com', $2)`,
			rolID, hash,
		); err != nil {
			return fmt.Errorf("sembrar usuario administrador: %w", err)
		}
		log.Println("Usuario administrador inicial creado: admin@velothr.com / Admin123!")
	}

	return nil
}

func partirClave(clave string) (submodulo, accion string) {
	for i := len(clave) - 1; i >= 0; i-- {
		if clave[i] == ':' {
			return clave[:i], clave[i+1:]
		}
	}
	return clave, ""
}
