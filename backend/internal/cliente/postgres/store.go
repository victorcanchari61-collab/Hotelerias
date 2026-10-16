// Package postgres implementa cliente.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/cliente"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// seleccion trae al huésped con su tipo y cuántas reservas valen para la
// clasificación. El descuento es 0 si el tipo fue desactivado: un tipo apagado
// no debe seguir regalando descuento.
const seleccion = `
	SELECT c.id, c.nombre, c.apellido, c.email, c.password_hash, c.telefono, c.pais,
	       c.tipo_cliente_id, COALESCE(t.nombre, ''),
	       CASE WHEN t.activo THEN t.descuento_pct ELSE 0 END,
	       c.tipo_manual, c.activo, c.creado_en,
	       (SELECT count(*) FROM reserva r
	         WHERE r.cliente_id = c.id AND r.estado IN ('confirmada', 'completada'))
	FROM cliente c
	LEFT JOIN tipo_cliente t ON t.id = c.tipo_cliente_id`

func escanear(row pgx.Row) (cliente.Cliente, error) {
	var c cliente.Cliente
	err := row.Scan(&c.ID, &c.Nombre, &c.Apellido, &c.Email, &c.PasswordHash, &c.Telefono, &c.Pais,
		&c.TipoClienteID, &c.TipoCliente, &c.DescuentoPct, &c.TipoManual, &c.Activo, &c.CreadoEn, &c.Reservas)
	return c, err
}

func uno(c cliente.Cliente, err error) (cliente.Cliente, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return cliente.Cliente{}, cliente.ErrNoEncontrado
	}
	return c, err
}

// PorEmail busca sin distinguir mayúsculas (coincide con el índice único).
func (s *Store) PorEmail(ctx context.Context, email string) (cliente.Cliente, error) {
	return uno(escanear(s.pool.QueryRow(ctx, seleccion+` WHERE lower(c.email) = lower($1)`, email)))
}

func (s *Store) PorID(ctx context.Context, id int64) (cliente.Cliente, error) {
	return uno(escanear(s.pool.QueryRow(ctx, seleccion+` WHERE c.id = $1`, id)))
}

func (s *Store) Crear(ctx context.Context, c cliente.Cliente) (cliente.Cliente, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO cliente (nombre, apellido, email, password_hash, telefono, pais, tipo_cliente_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		c.Nombre, c.Apellido, c.Email, c.PasswordHash, c.Telefono, c.Pais, c.TipoClienteID).Scan(&id)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return cliente.Cliente{}, cliente.ErrEmailUsado
	}
	if err != nil {
		return cliente.Cliente{}, err
	}
	return s.PorID(ctx, id)
}

func (s *Store) Listar(ctx context.Context) ([]cliente.Cliente, error) {
	rows, err := s.pool.Query(ctx, seleccion+` ORDER BY c.creado_en DESC, c.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []cliente.Cliente{}
	for rows.Next() {
		c, err := escanear(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) FijarTipo(ctx context.Context, id int64, tipoID *int64, manual bool) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE cliente SET tipo_cliente_id = $2, tipo_manual = $3 WHERE id = $1`, id, tipoID, manual)
	return err
}

func (s *Store) Reservas(ctx context.Context, id int64) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM reserva
		WHERE cliente_id = $1 AND estado IN ('confirmada', 'completada')`, id).Scan(&n)
	return n, err
}

const colsTipo = `id, nombre, descripcion, descuento_pct, reservas_minimas, orden, activo`

func escanearTipo(row pgx.Row) (cliente.Tipo, error) {
	var t cliente.Tipo
	err := row.Scan(&t.ID, &t.Nombre, &t.Descripcion, &t.DescuentoPct, &t.ReservasMinimas, &t.Orden, &t.Activo)
	return t, err
}

func (s *Store) Tipos(ctx context.Context) ([]cliente.Tipo, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+colsTipo+` FROM tipo_cliente ORDER BY orden, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []cliente.Tipo{}
	for rows.Next() {
		t, err := escanearTipo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) CrearTipo(ctx context.Context, t cliente.Tipo) (cliente.Tipo, error) {
	out, err := escanearTipo(s.pool.QueryRow(ctx, `
		INSERT INTO tipo_cliente (nombre, descripcion, descuento_pct, reservas_minimas, orden, activo)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING `+colsTipo,
		t.Nombre, t.Descripcion, t.DescuentoPct, t.ReservasMinimas, t.Orden, t.Activo))
	return out, traducirTipo(err)
}

func (s *Store) ActualizarTipo(ctx context.Context, t cliente.Tipo) (cliente.Tipo, error) {
	out, err := escanearTipo(s.pool.QueryRow(ctx, `
		UPDATE tipo_cliente SET nombre=$2, descripcion=$3, descuento_pct=$4, reservas_minimas=$5,
		       orden=$6, activo=$7
		WHERE id = $1 RETURNING `+colsTipo,
		t.ID, t.Nombre, t.Descripcion, t.DescuentoPct, t.ReservasMinimas, t.Orden, t.Activo))
	if errors.Is(err, pgx.ErrNoRows) {
		return cliente.Tipo{}, cliente.ErrTipoInvalido
	}
	return out, traducirTipo(err)
}

func traducirTipo(err error) error {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return cliente.ErrTipoUsado
	}
	return err
}
