// Package postgres implementa habitacion.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"
	"sort"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/habitacion"
	"hotelerias/backend/internal/platform/fecha"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

const seleccion = `
	SELECT h.id, h.sede_id, s.nombre, h.tipo_habitacion_id, t.nombre, h.numero, h.piso,
	       h.estado, h.notas, h.activa, h.actualizado_en
	FROM habitacion h
	JOIN sede s            ON s.id = h.sede_id
	JOIN tipo_habitacion t ON t.id = h.tipo_habitacion_id`

func escanear(row pgx.Row) (habitacion.Habitacion, error) {
	var h habitacion.Habitacion
	var piso int16
	var estado string
	err := row.Scan(&h.ID, &h.SedeID, &h.SedeNombre, &h.TipoHabitacionID, &h.TipoNombre, &h.Numero,
		&piso, &estado, &h.Notas, &h.Activa, &h.ActualizadoEn)
	h.Piso, h.Estado = int(piso), habitacion.Estado(estado)
	return h, err
}

func esUnica(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

func (s *Store) Listar(ctx context.Context, sedeIDs []int64) ([]habitacion.Habitacion, error) {
	q, args := seleccion, []any{}
	if sedeIDs != nil {
		q += ` WHERE h.sede_id = ANY($1)`
		args = append(args, sedeIDs)
	}
	// Por hotel, piso y número (los números con menos dígitos primero: 9 antes que 10).
	q += ` ORDER BY s.nombre, h.piso, length(h.numero), h.numero`

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []habitacion.Habitacion{}
	for rows.Next() {
		h, err := escanear(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (s *Store) PorID(ctx context.Context, id int64) (habitacion.Habitacion, error) {
	h, err := escanear(s.pool.QueryRow(ctx, seleccion+` WHERE h.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return habitacion.Habitacion{}, habitacion.ErrNoEncontrada
	}
	return h, err
}

func (s *Store) Opciones(ctx context.Context, sedeIDs []int64) (habitacion.Opciones, error) {
	filtroSede, filtroTipo, args := "", "", []any{}
	if sedeIDs != nil {
		filtroSede, filtroTipo = ` AND id = ANY($1)`, ` WHERE t.sede_id = ANY($1)`
		args = append(args, sedeIDs)
	}

	out := habitacion.Opciones{Sedes: []habitacion.SedeRef{}, Tipos: []habitacion.TipoRef{}}
	rows, err := s.pool.Query(ctx, `SELECT id, nombre FROM sede WHERE activo`+filtroSede+` ORDER BY nombre`, args...)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var r habitacion.SedeRef
		if err := rows.Scan(&r.ID, &r.Nombre); err != nil {
			rows.Close()
			return out, err
		}
		out.Sedes = append(out.Sedes, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	rows, err = s.pool.Query(ctx, `
		SELECT t.id, t.sede_id, t.nombre, s.nombre, t.activo
		FROM tipo_habitacion t JOIN sede s ON s.id = t.sede_id`+filtroTipo+`
		ORDER BY s.nombre, t.id`, args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var r habitacion.TipoRef
		if err := rows.Scan(&r.ID, &r.SedeID, &r.Nombre, &r.SedeNombre, &r.Activo); err != nil {
			return out, err
		}
		out.Tipos = append(out.Tipos, r)
	}
	return out, rows.Err()
}

func (s *Store) Tipo(ctx context.Context, id int64) (habitacion.TipoRef, error) {
	var t habitacion.TipoRef
	err := s.pool.QueryRow(ctx, `
		SELECT t.id, t.sede_id, t.nombre, s.nombre, t.activo
		FROM tipo_habitacion t JOIN sede s ON s.id = t.sede_id WHERE t.id = $1`, id).
		Scan(&t.ID, &t.SedeID, &t.Nombre, &t.SedeNombre, &t.Activo)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, habitacion.ErrNoEncontrada
	}
	return t, err
}

func (s *Store) Crear(ctx context.Context, sedeID int64, in habitacion.Input) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO habitacion (sede_id, tipo_habitacion_id, numero, piso, notas, activa)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		sedeID, in.TipoHabitacionID, in.Numero, in.Piso, in.Notas, in.Activa).Scan(&id)
	if esUnica(err) {
		return 0, habitacion.ErrNumeroRepetido
	}
	return id, err
}

func (s *Store) CrearLote(ctx context.Context, sedeID, tipoID int64, piso int, numeros []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op tras Commit

	rows, err := tx.Query(ctx, `SELECT numero FROM habitacion WHERE sede_id = $1 AND numero = ANY($2)`, sedeID, numeros)
	if err != nil {
		return err
	}
	var repetidos []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return err
		}
		repetidos = append(repetidos, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(repetidos) > 0 {
		sort.Slice(repetidos, func(i, j int) bool {
			a, _ := strconv.Atoi(repetidos[i])
			b, _ := strconv.Atoi(repetidos[j])
			return a < b
		})
		return habitacion.ErrNumerosRepetidos{Numeros: repetidos}
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO habitacion (sede_id, tipo_habitacion_id, numero, piso)
		SELECT $1, $2, n, $3 FROM unnest($4::text[]) AS n`, sedeID, tipoID, piso, numeros)
	if esUnica(err) {
		return habitacion.ErrNumeroRepetido
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// maxSimultaneas es el mayor número de reservas confirmadas del tipo que
// coinciden en un mismo día desde `desde`. El máximo de un conjunto de
// intervalos siempre ocurre en el día de hoy o en una fecha de entrada, así que
// basta contar en esos puntos.
const maxSimultaneas = `
	SELECT COALESCE(max(c), 0) FROM (
		SELECT (SELECT count(*) FROM reserva r2
		         WHERE r2.tipo_habitacion_id = $1 AND r2.estado = 'confirmada'
		           AND r2.check_in <= GREATEST(r.check_in, $2) AND r2.check_out > GREATEST(r.check_in, $2)) AS c
		FROM reserva r
		WHERE r.tipo_habitacion_id = $1 AND r.estado = 'confirmada' AND r.check_out > $2
	) x`

func (s *Store) Actualizar(ctx context.Context, id int64, in habitacion.Input, desde fecha.Fecha) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op tras Commit

	var tipoAnterior int64
	err = tx.QueryRow(ctx, `SELECT tipo_habitacion_id FROM habitacion WHERE id = $1`, id).Scan(&tipoAnterior)
	if errors.Is(err, pgx.ErrNoRows) {
		return habitacion.ErrNoEncontrada
	}
	if err != nil {
		return err
	}

	// Se bloquean los tipos (en orden, para que dos cambios cruzados no se esperen
	// mutuamente): el crear-reserva también bloquea su tipo, así que mientras esto
	// corre nadie reserva "la última" habitación que estamos por quitar.
	if _, err := tx.Exec(ctx,
		`SELECT id FROM tipo_habitacion WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
		[]int64{tipoAnterior, in.TipoHabitacionID}); err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE habitacion SET tipo_habitacion_id = $2, numero = $3, piso = $4, notas = $5,
		                      activa = $6, actualizado_en = now()
		WHERE id = $1`, id, in.TipoHabitacionID, in.Numero, in.Piso, in.Notas, in.Activa)
	if esUnica(err) {
		return habitacion.ErrNumeroRepetido
	}
	if err != nil {
		return err
	}

	// El disparador ya recalculó `cantidad`. Si el tipo que perdió la habitación
	// (porque se desactivó o se cambió de tipo) ya no alcanza para sus reservas, se revierte.
	var quedan, simultaneas int
	if err := tx.QueryRow(ctx, `SELECT cantidad FROM tipo_habitacion WHERE id = $1`, tipoAnterior).Scan(&quedan); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, maxSimultaneas, tipoAnterior, desde.Time()).Scan(&simultaneas); err != nil {
		return err
	}
	if simultaneas > quedan {
		return habitacion.ErrCupoComprometido{Reservas: simultaneas, Quedan: quedan}
	}
	return tx.Commit(ctx)
}

func (s *Store) CambiarEstado(ctx context.Context, id int64, desde, hacia habitacion.Estado) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE habitacion SET estado = $3, actualizado_en = now()
		WHERE id = $1 AND estado = $2`, id, string(desde), string(hacia))
	return tag.RowsAffected() == 1, err
}
