package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/platform/fecha"
)

// selAdmin trae la sede (activa o no) con cuántas habitaciones tiene y cuántas
// reservas confirmadas le quedan por cumplirse.
const selAdmin = `
	SELECT s.id, s.nombre, s.ciudad, s.direccion, s.descripcion, s.estrellas, s.imagen, s.servicios, s.activo,
	       (SELECT count(*) FROM tipo_habitacion t WHERE t.sede_id = s.id),
	       (SELECT count(*) FROM reserva r
	         WHERE r.sede_id = s.id AND r.estado = 'confirmada' AND r.check_out > $1)
	FROM sede s`

func escanearAdmin(row pgx.Row) (hotel.SedeAdmin, error) {
	var a hotel.SedeAdmin
	var estrellas int16
	err := row.Scan(&a.ID, &a.Nombre, &a.Ciudad, &a.Direccion, &a.Descripcion, &estrellas, &a.Imagen,
		&a.Servicios, &a.Activo, &a.Habitaciones, &a.ReservasVigentes)
	a.Estrellas = int(estrellas)
	if a.Servicios == nil {
		a.Servicios = []string{}
	}
	return a, err
}

func (s *Store) TodasLasSedes(ctx context.Context, desde fecha.Fecha) ([]hotel.SedeAdmin, error) {
	rows, err := s.pool.Query(ctx, selAdmin+` ORDER BY s.activo DESC, s.ciudad, s.nombre`, desde.Time())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []hotel.SedeAdmin{}
	for rows.Next() {
		a, err := escanearAdmin(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) SedeAdmin(ctx context.Context, id int64, desde fecha.Fecha) (hotel.SedeAdmin, error) {
	a, err := escanearAdmin(s.pool.QueryRow(ctx, selAdmin+` WHERE s.id = $2`, desde.Time(), id))
	if errors.Is(err, pgx.ErrNoRows) {
		return hotel.SedeAdmin{}, hotel.ErrNoEncontrada
	}
	return a, err
}

func (s *Store) CrearSede(ctx context.Context, in hotel.SedeInput) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO sede (nombre, ciudad, direccion, descripcion, estrellas, imagen, servicios, activo)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		in.Nombre, in.Ciudad, in.Direccion, in.Descripcion, in.Estrellas, in.Imagen, in.Servicios, in.Activo).Scan(&id)
	return id, err
}

func (s *Store) ActualizarSede(ctx context.Context, id int64, in hotel.SedeInput) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE sede SET nombre = $2, ciudad = $3, direccion = $4, descripcion = $5, estrellas = $6,
		       imagen = $7, servicios = $8, activo = $9
		WHERE id = $1`,
		id, in.Nombre, in.Ciudad, in.Direccion, in.Descripcion, in.Estrellas, in.Imagen, in.Servicios, in.Activo)
	if err == nil && tag.RowsAffected() == 0 {
		return hotel.ErrNoEncontrada
	}
	return err
}

func (s *Store) ReservasVigentes(ctx context.Context, sedeID int64, desde fecha.Fecha) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM reserva
		WHERE sede_id = $1 AND estado = 'confirmada' AND check_out > $2`, sedeID, desde.Time()).Scan(&n)
	return n, err
}
