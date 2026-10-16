// Package postgres implementa empresa.Repositorio sobre pgx.
package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/empresa"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func (s *Store) Obtener(ctx context.Context) (empresa.Empresa, error) {
	var e empresa.Empresa
	err := s.pool.QueryRow(ctx, `
		SELECT razon_social, nombre_comercial, ruc, direccion, departamento, provincia, distrito,
		       telefono, email, sitio_web, representante_legal, actualizado_en
		FROM empresa WHERE id = 1`).
		Scan(&e.RazonSocial, &e.NombreComercial, &e.Ruc, &e.Direccion, &e.Departamento, &e.Provincia,
			&e.Distrito, &e.Telefono, &e.Email, &e.SitioWeb, &e.RepresentanteLegal, &e.ActualizadoEn)
	return e, err
}

func (s *Store) Guardar(ctx context.Context, e empresa.Empresa) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE empresa SET razon_social = $1, nombre_comercial = $2, ruc = $3, direccion = $4,
		       departamento = $5, provincia = $6, distrito = $7, telefono = $8, email = $9,
		       sitio_web = $10, representante_legal = $11, actualizado_en = now()
		WHERE id = 1`,
		e.RazonSocial, e.NombreComercial, e.Ruc, e.Direccion, e.Departamento, e.Provincia, e.Distrito,
		e.Telefono, e.Email, e.SitioWeb, e.RepresentanteLegal)
	return err
}
