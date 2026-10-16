// Package postgres implementa los puertos de usuario sobre pgx.
package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/usuario"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// seleccion trae la cuenta con su rol principal en una sola consulta: el de
// acceso total si lo tiene, y si no el de menor id. LATERAL + LIMIT 1 evita que
// una persona con dos roles aparezca duplicada en el listado.
const seleccion = `
	SELECT u.id, u.nombre, u.apellido, COALESCE(u.email, ''), u.telefono, u.foto,
	       u.activo, u.fecha_creacion, u.password_hash, r.id, COALESCE(r.nombre, ''),
	       COALESCE(ARRAY(SELECT ur.rol_id FROM usuario_rol ur WHERE ur.usuario_id = u.id ORDER BY ur.rol_id), '{}'),
	       COALESCE(ARRAY(SELECT us.sede_id FROM usuario_sede us WHERE us.usuario_id = u.id ORDER BY us.sede_id), '{}')
	FROM usuario u
	LEFT JOIN LATERAL (
		SELECT ro.id, ro.nombre
		FROM usuario_rol ur JOIN rol ro ON ro.id = ur.rol_id
		WHERE ur.usuario_id = u.id
		ORDER BY ro.acceso_total DESC, ro.id
		LIMIT 1
	) r ON TRUE`

func escanear(row pgx.Row) (usuario.Cuenta, error) {
	var c usuario.Cuenta
	err := row.Scan(&c.ID, &c.Nombre, &c.Apellido, &c.Email, &c.Telefono, &c.Foto,
		&c.Activo, &c.CreadoEn, &c.PasswordHash, &c.RolID, &c.RolNombre, &c.RolIDs, &c.SedeIDs)
	return c, err
}

// PorEmail busca sin distinguir mayúsculas (coincide con el índice único).
func (s *Store) PorEmail(ctx context.Context, email string) (usuario.Cuenta, error) {
	c, err := escanear(s.pool.QueryRow(ctx, seleccion+` WHERE lower(u.email) = lower($1)`, email))
	return resultado(c, err)
}

func (s *Store) PorID(ctx context.Context, id int64) (usuario.Cuenta, error) {
	c, err := escanear(s.pool.QueryRow(ctx, seleccion+` WHERE u.id = $1`, id))
	return resultado(c, err)
}

func resultado(c usuario.Cuenta, err error) (usuario.Cuenta, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return usuario.Cuenta{}, usuario.ErrNoEncontrada
	}
	return c, err
}

func (s *Store) Listar(ctx context.Context) ([]usuario.Cuenta, error) {
	rows, err := s.pool.Query(ctx, seleccion+` ORDER BY u.nombre, u.apellido, u.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []usuario.Cuenta
	for rows.Next() {
		c, err := escanear(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) ExisteEmail(ctx context.Context, email string) (bool, error) {
	var existe bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM usuario WHERE lower(email) = lower($1))`, email).Scan(&existe)
	return existe, err
}

// CrearAdministrador inserta la cuenta y la liga al rol de acceso total, en una
// transacción: o entra completa o no entra.
func (s *Store) CrearAdministrador(ctx context.Context, c usuario.NuevaCuenta) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var rolID int64
	err = tx.QueryRow(ctx, `SELECT id FROM rol WHERE acceso_total ORDER BY id LIMIT 1`).Scan(&rolID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("no existe ningún rol de acceso total (¿corrieron las migraciones?)")
	}
	if err != nil {
		return err
	}

	var id int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO usuario (nombre, apellido, email, password_hash, activo)
		VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
		c.Nombre, c.Apellido, c.Email, c.PasswordHash).Scan(&id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2)`, id, rolID); err != nil {
		return fmt.Errorf("asignando rol: %w", err)
	}
	return tx.Commit(ctx)
}
