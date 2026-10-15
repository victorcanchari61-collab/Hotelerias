package services

import (
	"context"

	"hotelerias/backend/internal/models"
)

// Catalogo devuelve el catálogo de permisos con sus acciones.
func (s *Service) Catalogo() []models.SubmoduloCatalogo {
	return models.CatalogoConAcciones()
}

// PermisosDeUsuario devuelve las claves "submodulo:accion" del rol del usuario.
func (s *Service) PermisosDeUsuario(ctx context.Context, usuarioID int64) ([]string, error) {
	rows, err := s.Postgres().Pool.Query(ctx,
		`SELECT rp.submodulo || ':' || rp.accion
		 FROM rol_permisos rp
		 JOIN usuarios u ON u.rol_id = rp.rol_id
		 WHERE u.id = $1 AND u.activo
		 ORDER BY rp.submodulo, rp.accion`,
		usuarioID,
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

// Puede indica si un usuario tiene una acción sobre un submódulo.
func (s *Service) Puede(ctx context.Context, usuarioID int64, submodulo, accion string) (bool, error) {
	var existe bool
	err := s.Postgres().Pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM rol_permisos rp
		   JOIN usuarios u ON u.rol_id = rp.rol_id
		   WHERE u.id = $1 AND u.activo AND rp.submodulo = $2 AND rp.accion = $3
		 )`,
		usuarioID, submodulo, accion,
	).Scan(&existe)
	return existe, err
}
