package services

import (
	"context"

	"hotelerias/backend/internal/models"
)

// ObtenerEmpresa devuelve la fila única de la empresa.
func (s *Service) ObtenerEmpresa(ctx context.Context) (models.Empresa, error) {
	var e models.Empresa
	err := s.Postgres().Pool.QueryRow(ctx,
		`SELECT id, ruc, razon_social, nombre_comercial, direccion, departamento,
		        provincia, distrito, telefono, email, web, logo, updated_at
		 FROM empresa WHERE id = 1`,
	).Scan(&e.ID, &e.RUC, &e.RazonSocial, &e.NombreComercial, &e.Direccion, &e.Departamento,
		&e.Provincia, &e.Distrito, &e.Telefono, &e.Email, &e.Web, &e.Logo, &e.UpdatedAt)
	return e, err
}

// ActualizarEmpresa guarda los datos de la empresa y devuelve la fila resultante.
func (s *Service) ActualizarEmpresa(ctx context.Context, e models.Empresa) (models.Empresa, error) {
	var out models.Empresa
	err := s.Postgres().Pool.QueryRow(ctx,
		`UPDATE empresa SET ruc = $1, razon_social = $2, nombre_comercial = $3,
		        direccion = $4, departamento = $5, provincia = $6, distrito = $7,
		        telefono = $8, email = $9, web = $10, logo = $11, updated_at = now()
		 WHERE id = 1
		 RETURNING id, ruc, razon_social, nombre_comercial, direccion, departamento,
		           provincia, distrito, telefono, email, web, logo, updated_at`,
		e.RUC, e.RazonSocial, e.NombreComercial, e.Direccion, e.Departamento,
		e.Provincia, e.Distrito, e.Telefono, e.Email, e.Web, e.Logo,
	).Scan(&out.ID, &out.RUC, &out.RazonSocial, &out.NombreComercial, &out.Direccion,
		&out.Departamento, &out.Provincia, &out.Distrito, &out.Telefono, &out.Email,
		&out.Web, &out.Logo, &out.UpdatedAt)
	return out, err
}

// ActualizarLogoEmpresa guarda solo la ruta del logo.
func (s *Service) ActualizarLogoEmpresa(ctx context.Context, ruta string) error {
	_, err := s.Postgres().Pool.Exec(ctx,
		`UPDATE empresa SET logo = $1, updated_at = now() WHERE id = 1`,
		ruta,
	)
	return err
}
