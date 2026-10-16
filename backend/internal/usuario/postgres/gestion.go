package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/usuario"
)

// EmailEnUso mira sin distinguir mayúsculas (coincide con el índice único).
func (s *Store) EmailEnUso(ctx context.Context, email string, exceptoID int64) (bool, error) {
	var existe bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM usuario WHERE lower(email) = lower($1) AND id <> $2)`,
		email, exceptoID).Scan(&existe)
	return existe, err
}

func (s *Store) Roles(ctx context.Context, ids []int64) ([]usuario.RolRef, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, activo, acceso_total FROM rol WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []usuario.RolRef
	for rows.Next() {
		var r usuario.RolRef
		if err := rows.Scan(&r.ID, &r.Activo, &r.AccesoTotal); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) SedesExistentes(ctx context.Context, ids []int64) ([]int64, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx, `SELECT id FROM sede WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (s *Store) ConAccesoTotal(ctx context.Context, usuarioID int64) (bool, error) {
	var si bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
			WHERE ur.usuario_id = $1 AND r.acceso_total AND r.activo)`, usuarioID).Scan(&si)
	return si, err
}

func (s *Store) OtrosAdministradoresActivos(ctx context.Context, exceptoID int64) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT count(DISTINCT u.id)
		FROM usuario u
		JOIN usuario_rol ur ON ur.usuario_id = u.id
		JOIN rol r          ON r.id = ur.rol_id
		WHERE u.activo AND r.acceso_total AND r.activo AND u.id <> $1`, exceptoID).Scan(&n)
	return n, err
}

// traducir pasa un correo repetido (carrera entre dos altas) a un conflicto legible.
func traducir(err error) error {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return httpx.Conflicto("Ya existe una cuenta con ese correo")
	}
	return err
}

// vincular deja los roles y sedes de la persona EXACTAMENTE como se piden.
func vincular(ctx context.Context, tx pgx.Tx, id int64, e usuario.Escritura) error {
	if _, err := tx.Exec(ctx,
		`DELETE FROM usuario_rol WHERE usuario_id = $1 AND rol_id <> ALL($2)`, id, e.RolIDs); err != nil {
		return err
	}
	for _, rol := range e.RolIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, rol); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM usuario_sede WHERE usuario_id = $1 AND sede_id <> ALL($2)`, id, e.SedeIDs); err != nil {
		return err
	}
	for _, sede := range e.SedeIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO usuario_sede (usuario_id, sede_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, sede); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Crear(ctx context.Context, e usuario.Escritura) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO usuario (nombre, apellido, email, telefono, password_hash, activo)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		e.Nombre, e.Apellido, e.Email, e.Telefono, e.PasswordHash, e.Activo).Scan(&id)
	if err != nil {
		return 0, traducir(err)
	}
	if err := vincular(ctx, tx, id, e); err != nil {
		return 0, err
	}
	return id, tx.Commit(ctx)
}

func (s *Store) Actualizar(ctx context.Context, id int64, e usuario.Escritura) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		UPDATE usuario
		SET nombre = $2, apellido = $3, email = $4, telefono = $5, activo = $6,
		    password_hash = CASE WHEN $7 = '' THEN password_hash ELSE $7 END
		WHERE id = $1`,
		id, e.Nombre, e.Apellido, e.Email, e.Telefono, e.Activo, e.PasswordHash)
	if err != nil {
		return traducir(err)
	}
	if tag.RowsAffected() == 0 {
		return usuario.ErrNoEncontrada
	}
	if err := vincular(ctx, tx, id, e); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) CambiarEstado(ctx context.Context, id int64, activo bool) error {
	tag, err := s.pool.Exec(ctx, `UPDATE usuario SET activo = $2 WHERE id = $1`, id, activo)
	if err == nil && tag.RowsAffected() == 0 {
		return usuario.ErrNoEncontrada
	}
	return err
}

func (s *Store) Eliminar(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM usuario WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return usuario.ErrNoEncontrada
	}
	return err
}
