// Package postgres implementa los puertos de permiso sobre pgx. Es el único
// sitio del módulo que conoce SQL.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/permiso"
)

// Store implementa UsuarioRoles, PermisosDeRol y ExcepcionStore.
type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// RolesDe devuelve los roles de un usuario ACTIVO. Si no existe o está
// inactivo devuelve el valor cero (sin acceso): quien no entra, no puede.
//
// Una sola consulta trae los roles y si alguno es de acceso total.
func (s *Store) RolesDe(ctx context.Context, usuarioID int64) (permiso.RolesDeUsuario, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.acceso_total
		FROM usuario u
		JOIN usuario_rol ur ON ur.usuario_id = u.id
		JOIN rol r          ON r.id = ur.rol_id
		WHERE u.id = $1 AND u.activo`, usuarioID)
	if err != nil {
		return permiso.RolesDeUsuario{}, err
	}
	defer rows.Close()

	var out permiso.RolesDeUsuario
	for rows.Next() {
		var id int64
		var total bool
		if err := rows.Scan(&id, &total); err != nil {
			return permiso.RolesDeUsuario{}, err
		}
		out.RolIDs = append(out.RolIDs, id)
		// Con varios roles basta con que uno sea de acceso total.
		out.AccesoTotal = out.AccesoTotal || total
	}
	return out, rows.Err()
}

// PermisosDeRol devuelve la matriz de un rol.
func (s *Store) PermisosDeRol(ctx context.Context, rolID int64) ([]permiso.Clave, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT submodulo, accion FROM rol_permiso WHERE rol_id = $1`, rolID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []permiso.Clave
	for rows.Next() {
		var sub, acc string
		if err := rows.Scan(&sub, &acc); err != nil {
			return nil, err
		}
		out = append(out, permiso.Clave{Submodulo: sub, Accion: permiso.Accion(acc)})
	}
	return out, rows.Err()
}

// VigentesDe trae lo que todavía puede servir. El grueso se descarta en SQL;
// el detalle de qué cuenta como vigente vive en Excepcion.Vigente.
func (s *Store) VigentesDe(ctx context.Context, usuarioID int64, ahora time.Time) ([]permiso.Excepcion, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, submodulo, accion, vigencia, expira_en, usos, revocado
		FROM usuario_permiso
		WHERE usuario_id = $1
		  AND NOT revocado
		  AND (expira_en IS NULL OR expira_en > $2)
		  AND (vigencia <> 'una_vez' OR usos = 0)
		ORDER BY id`, usuarioID, ahora)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []permiso.Excepcion
	for rows.Next() {
		var e permiso.Excepcion
		var sub, acc, vig string
		if err := rows.Scan(&e.ID, &sub, &acc, &vig, &e.ExpiraEn, &e.Usos, &e.Revocado); err != nil {
			return nil, err
		}
		e.Clave = permiso.Clave{Submodulo: sub, Accion: permiso.Accion(acc)}
		e.Vigencia = permiso.Vigencia(vig)
		out = append(out, e)
	}
	return out, rows.Err()
}

// Reservar gasta una excepción de un solo uso. La condición va en el WHERE y
// no solo el id: dos peticiones en paralelo con el mismo permiso entrarían las
// dos, y así la segunda actualiza cero filas y pierde.
func (s *Store) Reservar(ctx context.Context, id int64) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE usuario_permiso SET usos = usos + 1
		WHERE id = $1 AND vigencia = 'una_vez' AND usos = 0 AND NOT revocado`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// Liberar devuelve una reservada. No toca una ya revocada ni una que no se
// había gastado.
func (s *Store) Liberar(ctx context.Context, id int64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE usuario_permiso SET usos = 0
		WHERE id = $1 AND vigencia = 'una_vez' AND usos = 1`, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}
