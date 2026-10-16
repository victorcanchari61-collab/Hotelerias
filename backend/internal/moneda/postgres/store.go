// Package postgres implementa moneda.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/moneda"
	"hotelerias/backend/internal/platform/fecha"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func (s *Store) Monedas(ctx context.Context) ([]moneda.Moneda, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT codigo, nombre, simbolo, decimales, es_base, activa
		FROM moneda ORDER BY es_base DESC, codigo`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []moneda.Moneda{}
	for rows.Next() {
		var m moneda.Moneda
		var dec int16
		if err := rows.Scan(&m.Codigo, &m.Nombre, &m.Simbolo, &dec, &m.Base, &m.Activa); err != nil {
			return nil, err
		}
		m.Decimales = int(dec)
		out = append(out, m)
	}
	return out, rows.Err()
}

const seleccion = `
	SELECT t.id, t.fecha, t.moneda, t.compra_micro, t.venta_micro, t.fuente,
	       btrim(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')), t.actualizado_en
	FROM tipo_cambio t LEFT JOIN usuario u ON u.id = t.registrado_por`

func escanear(row pgx.Row) (moneda.TipoCambio, error) {
	var t moneda.TipoCambio
	var dia time.Time
	err := row.Scan(&t.ID, &dia, &t.Moneda, &t.CompraMicro, &t.VentaMicro, &t.Fuente,
		&t.RegistradoPor, &t.ActualizadoEn)
	t.Fecha = fecha.DeTiempo(dia)
	return t, err
}

func (s *Store) UltimoHasta(ctx context.Context, cod string, desde, hasta fecha.Fecha) (moneda.TipoCambio, error) {
	t, err := escanear(s.pool.QueryRow(ctx, seleccion+`
		WHERE t.moneda = $1 AND t.fecha BETWEEN $2 AND $3
		ORDER BY t.fecha DESC LIMIT 1`, cod, desde.Time(), hasta.Time()))
	if errors.Is(err, pgx.ErrNoRows) {
		return moneda.TipoCambio{}, moneda.ErrSinTipoCambio
	}
	return t, err
}

func (s *Store) Historial(ctx context.Context, cod string, limite int) ([]moneda.TipoCambio, error) {
	rows, err := s.pool.Query(ctx, seleccion+`
		WHERE ($1 = '' OR t.moneda = $1)
		ORDER BY t.fecha DESC, t.moneda LIMIT $2`, cod, limite)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []moneda.TipoCambio{}
	for rows.Next() {
		t, err := escanear(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) Guardar(ctx context.Context, t moneda.TipoCambio, actor int64) (moneda.TipoCambio, error) {
	var quien *int64
	if actor != 0 {
		quien = &actor
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO tipo_cambio (fecha, moneda, compra_micro, venta_micro, fuente, registrado_por)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (fecha, moneda) DO UPDATE
		   SET compra_micro = EXCLUDED.compra_micro, venta_micro = EXCLUDED.venta_micro,
		       fuente = EXCLUDED.fuente, registrado_por = EXCLUDED.registrado_por,
		       actualizado_en = now()
		RETURNING id`,
		t.Fecha.Time(), t.Moneda, t.CompraMicro, t.VentaMicro, t.Fuente, quien).Scan(&id)
	if err != nil {
		return moneda.TipoCambio{}, err
	}
	return escanear(s.pool.QueryRow(ctx, seleccion+` WHERE t.id = $1`, id))
}
