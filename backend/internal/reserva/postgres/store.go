// Package postgres implementa reserva.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/reserva"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const seleccion = `
	SELECT r.id, r.codigo, r.cliente_id,
	       btrim(c.nombre || ' ' || c.apellido), c.email,
	       r.sede_id, s.nombre, r.tipo_habitacion_id, t.nombre,
	       r.check_in, r.check_out, r.huespedes, r.noches,
	       r.precio_noche_cent, r.subtotal_cent, r.descuento_cent, r.total_cent,
	       r.descuento_origen, r.descuento_nombre, r.promocion_id,
	       r.estado, r.notas, r.creado_en
	FROM reserva r
	JOIN cliente c         ON c.id = r.cliente_id
	JOIN sede s            ON s.id = r.sede_id
	JOIN tipo_habitacion t ON t.id = r.tipo_habitacion_id`

func escanear(row pgx.Row) (reserva.Reserva, error) {
	var r reserva.Reserva
	var in, out time.Time
	var huespedes, noches int16
	var estado string
	err := row.Scan(&r.ID, &r.Codigo, &r.ClienteID, &r.ClienteNombre, &r.ClienteEmail,
		&r.SedeID, &r.SedeNombre, &r.TipoHabitacionID, &r.Habitacion,
		&in, &out, &huespedes, &noches,
		&r.PrecioNocheCent, &r.SubtotalCent, &r.DescuentoCent, &r.TotalCent,
		&r.DescuentoOrigen, &r.DescuentoNombre, &r.PromocionID,
		&estado, &r.Notas, &r.CreadoEn)
	r.CheckIn, r.CheckOut = fecha.DeTiempo(in), fecha.DeTiempo(out)
	r.Huespedes, r.Noches = int(huespedes), int(noches)
	r.Estado = reserva.Estado(estado)
	return r, err
}

func uno(r reserva.Reserva, err error) (reserva.Reserva, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return reserva.Reserva{}, reserva.ErrNoEncontrada
	}
	return r, err
}

func (s *Store) PorCodigo(ctx context.Context, codigo string) (reserva.Reserva, error) {
	return uno(escanear(s.pool.QueryRow(ctx, seleccion+` WHERE r.codigo = $1`, codigo)))
}

func (s *Store) PorID(ctx context.Context, id int64) (reserva.Reserva, error) {
	return uno(escanear(s.pool.QueryRow(ctx, seleccion+` WHERE r.id = $1`, id)))
}

func (s *Store) lista(ctx context.Context, where string, args ...any) ([]reserva.Reserva, error) {
	rows, err := s.pool.Query(ctx, seleccion+where+` ORDER BY r.creado_en DESC, r.id DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []reserva.Reserva{}
	for rows.Next() {
		r, err := escanear(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) DeCliente(ctx context.Context, clienteID int64) ([]reserva.Reserva, error) {
	return s.lista(ctx, ` WHERE r.cliente_id = $1`, clienteID)
}

func (s *Store) Listar(ctx context.Context, estado reserva.Estado) ([]reserva.Reserva, error) {
	if estado == "" {
		return s.lista(ctx, ``)
	}
	return s.lista(ctx, ` WHERE r.estado = $1`, string(estado))
}

func (s *Store) Cancelar(ctx context.Context, id int64) (bool, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE reserva SET estado = 'cancelada' WHERE id = $1 AND estado = 'confirmada'`, id)
	return tag.RowsAffected() == 1, err
}

// Crear inserta la reserva comprobando la disponibilidad en la MISMA transacción.
//
// El FOR UPDATE sobre la fila del tipo de habitación serializa las reservas de
// ese tipo: la segunda petición espera a que la primera confirme y recién ahí
// cuenta las que se cruzan. Sin el candado, dos peticiones leen "queda 1", las
// dos insertan y la última habitación se vende dos veces.
func (s *Store) Crear(ctx context.Context, n reserva.Nueva) (reserva.Reserva, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return reserva.Reserva{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op tras Commit

	var cantidad int16
	var precio int64
	var activo bool
	err = tx.QueryRow(ctx,
		`SELECT cantidad, precio_noche_cent, activo FROM tipo_habitacion WHERE id = $1 FOR UPDATE`,
		n.TipoHabitacionID).Scan(&cantidad, &precio, &activo)
	if errors.Is(err, pgx.ErrNoRows) {
		return reserva.Reserva{}, reserva.ErrSinDisponibilidad
	}
	if err != nil {
		return reserva.Reserva{}, err
	}
	if !activo {
		return reserva.Reserva{}, reserva.ErrSinDisponibilidad
	}
	if precio != n.PrecioNocheCent {
		return reserva.Reserva{}, reserva.ErrPrecioCambio
	}

	var ocupadas int
	err = tx.QueryRow(ctx, `
		SELECT count(*) FROM reserva
		WHERE tipo_habitacion_id = $1 AND estado = 'confirmada'
		  AND check_in < $3 AND check_out > $2`,
		n.TipoHabitacionID, n.CheckIn.Time(), n.CheckOut.Time()).Scan(&ocupadas)
	if err != nil {
		return reserva.Reserva{}, err
	}
	if ocupadas >= int(cantidad) {
		return reserva.Reserva{}, reserva.ErrSinDisponibilidad
	}

	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO reserva (codigo, cliente_id, sede_id, tipo_habitacion_id, check_in, check_out,
		                     huespedes, noches, precio_noche_cent, subtotal_cent, descuento_cent,
		                     total_cent, descuento_origen, descuento_nombre, promocion_id, notas)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		RETURNING id`,
		n.Codigo, n.ClienteID, n.SedeID, n.TipoHabitacionID, n.CheckIn.Time(), n.CheckOut.Time(),
		n.Huespedes, n.Noches, n.PrecioNocheCent, n.SubtotalCent, n.DescuentoCent,
		n.TotalCent, n.DescuentoOrigen, n.DescuentoNombre, n.PromocionID, n.Notas).Scan(&id)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return reserva.Reserva{}, reserva.ErrCodigoDuplicado
	}
	if err != nil {
		return reserva.Reserva{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return reserva.Reserva{}, err
	}
	return s.PorID(ctx, id)
}
