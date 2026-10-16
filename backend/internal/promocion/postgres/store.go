// Package postgres implementa promocion.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/promocion"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const cols = `id, nombre, descripcion, tipo, porcentaje, monto_noche_cent, codigo,
	sede_id, tipo_cliente_id, desde, hasta, min_noches, activo`

func escanear(row pgx.Row) (promocion.Promocion, error) {
	var p promocion.Promocion
	var tipo string
	var desde, hasta time.Time
	var minNoches int16
	err := row.Scan(&p.ID, &p.Nombre, &p.Descripcion, &tipo, &p.Porcentaje, &p.MontoNocheCent, &p.Codigo,
		&p.SedeID, &p.TipoClienteID, &desde, &hasta, &minNoches, &p.Activo)
	p.Tipo = promocion.Tipo(tipo)
	p.Desde, p.Hasta = fecha.DeTiempo(desde), fecha.DeTiempo(hasta)
	p.MinNoches = int(minNoches)
	return p, err
}

func (s *Store) Listar(ctx context.Context) ([]promocion.Promocion, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+cols+` FROM promocion ORDER BY activo DESC, hasta DESC, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []promocion.Promocion{}
	for rows.Next() {
		p, err := escanear(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) Obtener(ctx context.Context, id int64) (promocion.Promocion, error) {
	p, err := escanear(s.pool.QueryRow(ctx, `SELECT `+cols+` FROM promocion WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return promocion.Promocion{}, promocion.ErrNoEncontrada
	}
	return p, err
}

func (s *Store) Crear(ctx context.Context, p promocion.Promocion) (promocion.Promocion, error) {
	out, err := escanear(s.pool.QueryRow(ctx, `
		INSERT INTO promocion (nombre, descripcion, tipo, porcentaje, monto_noche_cent, codigo,
		                       sede_id, tipo_cliente_id, desde, hasta, min_noches, activo)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING `+cols,
		p.Nombre, p.Descripcion, string(p.Tipo), p.Porcentaje, p.MontoNocheCent, p.Codigo,
		p.SedeID, p.TipoClienteID, p.Desde.Time(), p.Hasta.Time(), p.MinNoches, p.Activo))
	return out, traducir(err)
}

func (s *Store) Actualizar(ctx context.Context, p promocion.Promocion) (promocion.Promocion, error) {
	out, err := escanear(s.pool.QueryRow(ctx, `
		UPDATE promocion SET nombre=$2, descripcion=$3, tipo=$4, porcentaje=$5, monto_noche_cent=$6,
		       codigo=$7, sede_id=$8, tipo_cliente_id=$9, desde=$10, hasta=$11, min_noches=$12, activo=$13
		WHERE id = $1
		RETURNING `+cols,
		p.ID, p.Nombre, p.Descripcion, string(p.Tipo), p.Porcentaje, p.MontoNocheCent, p.Codigo,
		p.SedeID, p.TipoClienteID, p.Desde.Time(), p.Hasta.Time(), p.MinNoches, p.Activo))
	if errors.Is(err, pgx.ErrNoRows) {
		return promocion.Promocion{}, promocion.ErrNoEncontrada
	}
	return out, traducir(err)
}

// traducir pasa las violaciones de restricción a errores del dominio.
func traducir(err error) error {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Code {
		case "23505": // unique_violation: promocion_codigo_unico
			return promocion.ErrCodigoUsado
		case "23503": // foreign_key_violation: sede o tipo de cliente
			return promocion.ErrReferencia
		}
	}
	return err
}
