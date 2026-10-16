// Package postgres implementa hotel.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/platform/fecha"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const colsSede = `id, nombre, ciudad, direccion, descripcion, estrellas, imagen, servicios, activo`

func escanearSede(row pgx.Row) (hotel.Sede, error) {
	var s hotel.Sede
	var estrellas int16
	err := row.Scan(&s.ID, &s.Nombre, &s.Ciudad, &s.Direccion, &s.Descripcion, &estrellas, &s.Imagen, &s.Servicios, &s.Activo)
	s.Estrellas = int(estrellas)
	if s.Servicios == nil {
		s.Servicios = []string{}
	}
	return s, err
}

// Sedes devuelve solo las activas.
func (s *Store) Sedes(ctx context.Context) ([]hotel.Sede, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+colsSede+` FROM sede WHERE activo ORDER BY ciudad, nombre`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []hotel.Sede{}
	for rows.Next() {
		sede, err := escanearSede(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sede)
	}
	return out, rows.Err()
}

func (s *Store) Sede(ctx context.Context, id int64) (hotel.Sede, error) {
	sede, err := escanearSede(s.pool.QueryRow(ctx, `SELECT `+colsSede+` FROM sede WHERE id = $1 AND activo`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return hotel.Sede{}, hotel.ErrNoEncontrada
	}
	return sede, err
}

const colsTipo = `id, sede_id, nombre, descripcion, capacidad, camas, area_m2, precio_noche_cent, cantidad, amenidades, imagen, activo`

func escanearTipo(row pgx.Row) (hotel.TipoHabitacion, error) {
	var t hotel.TipoHabitacion
	var capacidad, area, cantidad int16
	err := row.Scan(&t.ID, &t.SedeID, &t.Nombre, &t.Descripcion, &capacidad, &t.Camas, &area,
		&t.PrecioNocheCent, &cantidad, &t.Amenidades, &t.Imagen, &t.Activo)
	t.Capacidad, t.AreaM2, t.Cantidad = int(capacidad), int(area), int(cantidad)
	if t.Amenidades == nil {
		t.Amenidades = []string{}
	}
	return t, err
}

func (s *Store) Tipos(ctx context.Context, sedeID int64) ([]hotel.TipoHabitacion, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+colsTipo+` FROM tipo_habitacion WHERE sede_id = $1 AND activo ORDER BY precio_noche_cent`, sedeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []hotel.TipoHabitacion{}
	for rows.Next() {
		t, err := escanearTipo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Tipo busca un tipo activo de una sede activa.
func (s *Store) Tipo(ctx context.Context, id int64) (hotel.TipoHabitacion, error) {
	t, err := escanearTipo(s.pool.QueryRow(ctx, `
		SELECT `+colsTipo+` FROM tipo_habitacion
		WHERE id = $1 AND activo AND sede_id IN (SELECT id FROM sede WHERE activo)`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return hotel.TipoHabitacion{}, hotel.ErrNoEncontrada
	}
	return t, err
}

// Ocupadas cuenta las reservas confirmadas que se cruzan con [desde, hasta).
// Dos estadías se cruzan si cada una empieza antes de que termine la otra; el
// día de salida de una y el de entrada de la siguiente NO se cruzan.
func (s *Store) Ocupadas(ctx context.Context, tipoID int64, desde, hasta fecha.Fecha) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM reserva
		WHERE tipo_habitacion_id = $1 AND estado = 'confirmada'
		  AND check_in < $3 AND check_out > $2`,
		tipoID, desde.Time(), hasta.Time()).Scan(&n)
	return n, err
}
