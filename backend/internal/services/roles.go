package services

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"hotelerias/backend/internal/models"
)

// ErrNombreRolDuplicado se devuelve cuando el nombre del rol ya existe.
var ErrNombreRolDuplicado = errors.New("ya existe un rol con ese nombre")

// ListarRoles devuelve los roles con sus permisos.
func (s *Service) ListarRoles(ctx context.Context) ([]models.Rol, error) {
	rows, err := s.Postgres().Pool.Query(ctx,
		`SELECT id, nombre, descripcion, es_sistema, creado_en FROM roles ORDER BY nombre`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []models.Rol
	for rows.Next() {
		var r models.Rol
		if err := rows.Scan(&r.ID, &r.Nombre, &r.Descripcion, &r.EsSistema, &r.CreadoEn); err != nil {
			return nil, err
		}
		roles = append(roles, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range roles {
		roles[i].Permisos, err = s.PermisosDeRol(ctx, roles[i].ID)
		if err != nil {
			return nil, err
		}
	}
	return roles, nil
}

// PermisosDeRol devuelve las claves "submodulo:accion" de un rol.
func (s *Service) PermisosDeRol(ctx context.Context, rolID int64) ([]string, error) {
	rows, err := s.Postgres().Pool.Query(ctx,
		`SELECT submodulo || ':' || accion FROM rol_permisos WHERE rol_id = $1 ORDER BY submodulo, accion`,
		rolID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var claves []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		claves = append(claves, c)
	}
	return claves, rows.Err()
}

// CrearRol crea un rol y le asigna sus permisos.
func (s *Service) CrearRol(ctx context.Context, input RolInput) (models.Rol, error) {
	if input.Nombre == "" {
		return models.Rol{}, errors.New("el nombre del rol es obligatorio")
	}

	tx, err := s.Postgres().Pool.Begin(ctx)
	if err != nil {
		return models.Rol{}, err
	}
	defer tx.Rollback(ctx)

	var r models.Rol
	err = tx.QueryRow(ctx,
		`INSERT INTO roles (nombre, descripcion) VALUES ($1, $2)
		 RETURNING id, nombre, descripcion, es_sistema, creado_en`,
		input.Nombre, input.Descripcion,
	).Scan(&r.ID, &r.Nombre, &r.Descripcion, &r.EsSistema, &r.CreadoEn)
	if err != nil {
		if esViolacionUnica(err) {
			return models.Rol{}, ErrNombreRolDuplicado
		}
		return models.Rol{}, err
	}

	if err := reemplazarPermisos(ctx, tx, r.ID, input.Permisos); err != nil {
		return models.Rol{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return models.Rol{}, err
	}
	r.Permisos = input.Permisos
	return r, nil
}

// ActualizarRol modifica nombre, descripción y permisos de un rol.
func (s *Service) ActualizarRol(ctx context.Context, id int64, input RolInput) (models.Rol, error) {
	if input.Nombre == "" {
		return models.Rol{}, errors.New("el nombre del rol es obligatorio")
	}

	tx, err := s.Postgres().Pool.Begin(ctx)
	if err != nil {
		return models.Rol{}, err
	}
	defer tx.Rollback(ctx)

	var r models.Rol
	err = tx.QueryRow(ctx,
		`UPDATE roles SET nombre = $1, descripcion = $2 WHERE id = $3
		 RETURNING id, nombre, descripcion, es_sistema, creado_en`,
		input.Nombre, input.Descripcion, id,
	).Scan(&r.ID, &r.Nombre, &r.Descripcion, &r.EsSistema, &r.CreadoEn)
	if err != nil {
		if esViolacionUnica(err) {
			return models.Rol{}, ErrNombreRolDuplicado
		}
		return models.Rol{}, err
	}

	if err := reemplazarPermisos(ctx, tx, id, input.Permisos); err != nil {
		return models.Rol{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return models.Rol{}, err
	}
	r.Permisos = input.Permisos
	return r, nil
}

// EliminarRol borra un rol. Los roles de sistema no se pueden borrar.
func (s *Service) EliminarRol(ctx context.Context, id int64) error {
	var esSistema bool
	err := s.Postgres().Pool.QueryRow(ctx, `SELECT es_sistema FROM roles WHERE id = $1`, id).Scan(&esSistema)
	if err != nil {
		return err
	}
	if esSistema {
		return errors.New("los roles del sistema no se pueden eliminar")
	}
	_, err = s.Postgres().Pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, id)
	return err
}

// reemplazarPermisos borra y vuelve a insertar las claves del rol.
func reemplazarPermisos(ctx context.Context, tx pgx.Tx, rolID int64, claves []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM rol_permisos WHERE rol_id = $1`, rolID); err != nil {
		return err
	}
	for _, clave := range claves {
		submodulo, accion := partirClaveRol(clave)
		if submodulo == "" || accion == "" {
			continue
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO rol_permisos (rol_id, submodulo, accion) VALUES ($1, $2, $3)`,
			rolID, submodulo, accion,
		); err != nil {
			return err
		}
	}
	return nil
}

func partirClaveRol(clave string) (submodulo, accion string) {
	for i := len(clave) - 1; i >= 0; i-- {
		if clave[i] == ':' {
			return clave[:i], clave[i+1:]
		}
	}
	return "", ""
}

// RolInput es lo que llega del formulario de roles.
type RolInput struct {
	Nombre      string   `json:"nombre"`
	Descripcion string   `json:"descripcion"`
	Permisos    []string `json:"permisos"`
}
