// Package postgres implementa rol.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/permiso"
	"hotelerias/backend/internal/rol"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// seleccion trae el rol con su cantidad de personas y su matriz en una consulta:
// la pantalla de Roles lista todos a la vez y no debe hacer N+1.
const seleccion = `
	SELECT r.id, r.nombre, COALESCE(r.descripcion, ''), r.activo, r.del_sistema, r.acceso_total,
	       r.fecha_creacion,
	       (SELECT count(*) FROM usuario_rol ur WHERE ur.rol_id = r.id),
	       COALESCE(ARRAY(SELECT p.submodulo || ':' || p.accion
	                      FROM rol_permiso p WHERE p.rol_id = r.id
	                      ORDER BY p.submodulo, p.accion), '{}')
	FROM rol r`

func escanear(row pgx.Row) (rol.Rol, error) {
	var r rol.Rol
	err := row.Scan(&r.ID, &r.Nombre, &r.Descripcion, &r.Activo, &r.DelSistema, &r.AccesoTotal,
		&r.Creado, &r.Usuarios, &r.Permisos)
	if r.Permisos == nil {
		r.Permisos = []string{}
	}
	return r, err
}

func (s *Store) Listar(ctx context.Context) ([]rol.Rol, error) {
	rows, err := s.pool.Query(ctx, seleccion+` ORDER BY r.acceso_total DESC, r.del_sistema DESC, r.nombre`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []rol.Rol{}
	for rows.Next() {
		r, err := escanear(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) PorID(ctx context.Context, id int64) (rol.Rol, error) {
	r, err := escanear(s.pool.QueryRow(ctx, seleccion+` WHERE r.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return rol.Rol{}, rol.ErrNoEncontrado
	}
	return r, err
}

func (s *Store) Crear(ctx context.Context, r rol.Rol) (rol.Rol, error) {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO rol (nombre, descripcion, activo) VALUES ($1, $2, $3) RETURNING id`,
		r.Nombre, r.Descripcion, r.Activo).Scan(&id)
	if err != nil {
		return rol.Rol{}, err
	}
	return s.PorID(ctx, id)
}

func (s *Store) Actualizar(ctx context.Context, r rol.Rol) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE rol SET nombre = $2, descripcion = $3, activo = $4 WHERE id = $1`,
		r.ID, r.Nombre, r.Descripcion, r.Activo)
	if err == nil && tag.RowsAffected() == 0 {
		return rol.ErrNoEncontrado
	}
	return err
}

func (s *Store) Eliminar(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM rol WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return rol.ErrNoEncontrado
	}
	return err
}

// ReemplazarPermisos cambia la matriz completa en una transacción: nunca se ve
// una matriz a medias.
func (s *Store) ReemplazarPermisos(ctx context.Context, id int64, claves []permiso.Clave) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM rol_permiso WHERE rol_id = $1`, id); err != nil {
		return err
	}
	for _, cl := range claves {
		if _, err := tx.Exec(ctx,
			`INSERT INTO rol_permiso (rol_id, submodulo, accion) VALUES ($1, $2, $3)`,
			id, cl.Submodulo, string(cl.Accion)); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) NombreEnUso(ctx context.Context, nombre string, exceptoID int64) (bool, error) {
	var existe bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM rol WHERE lower(nombre) = lower($1) AND id <> $2)`,
		nombre, exceptoID).Scan(&existe)
	return existe, err
}
