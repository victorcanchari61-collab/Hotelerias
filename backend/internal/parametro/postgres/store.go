// Package postgres implementa parametro.Repositorio sobre pgx.
package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/parametro"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func (s *Store) Todos(ctx context.Context) (map[string]parametro.Guardado, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.clave, p.valor, p.actualizado_en,
		       btrim(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,''))
		FROM parametro p LEFT JOIN usuario u ON u.id = p.actualizado_por`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]parametro.Guardado{}
	for rows.Next() {
		var clave string
		var g parametro.Guardado
		if err := rows.Scan(&clave, &g.Valor, &g.ActualizadoEn, &g.ActualizadoPor); err != nil {
			return nil, err
		}
		out[clave] = g
	}
	return out, rows.Err()
}

func (s *Store) GuardarVarios(ctx context.Context, valores map[string]string, actor int64) error {
	var quien *int64
	if actor != 0 {
		quien = &actor
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op tras Commit

	for clave, valor := range valores {
		if _, err := tx.Exec(ctx, `
			INSERT INTO parametro (clave, valor, actualizado_por) VALUES ($1, $2, $3)
			ON CONFLICT (clave) DO UPDATE
			   SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`,
			clave, valor, quien); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
