// Package postgres implementa estancia.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/estancia"
	"hotelerias/backend/internal/platform/fecha"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func restriccion(err error) string {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return pg.ConstraintName
	}
	return ""
}

// Panel junta las llegadas por atender (reservas confirmadas dentro de su estadía, sin
// check-in) y los huéspedes en casa.
func (s *Store) Panel(ctx context.Context, sedeIDs []int64, hoy fecha.Fecha) ([]estancia.Movimiento, error) {
	// Cada consulta numera sus propios parámetros: la de los huéspedes en casa no usa la fecha.
	filtroCasa, argsCasa, filtroLlegadas, argsLlegadas := "", []any{}, "", []any{hoy.Time()}
	if sedeIDs != nil {
		filtroCasa, argsCasa = " AND r.sede_id = ANY($1)", []any{sedeIDs}
		filtroLlegadas, argsLlegadas = " AND r.sede_id = ANY($2)", append(argsLlegadas, sedeIDs)
	}

	out := []estancia.Movimiento{}
	leer := func(rows pgx.Rows, fase estancia.Fase) error {
		defer rows.Close()
		for rows.Next() {
			var m estancia.Movimiento
			var in, sal time.Time
			var huespedes int16
			if err := rows.Scan(&m.EstanciaID, &m.ReservaID, &m.Codigo, &m.Huesped, &m.SedeID, &m.SedeNombre,
				&m.TipoHabitacionID, &m.TipoNombre, &m.HabitacionID, &m.HabitacionNumero,
				&in, &sal, &huespedes, &m.Notas); err != nil {
				return err
			}
			m.Fase, m.Huespedes = fase, int(huespedes)
			m.CheckIn, m.CheckOut = fecha.DeTiempo(in), fecha.DeTiempo(sal)
			out = append(out, m)
		}
		return rows.Err()
	}

	// Los huéspedes en casa primero.
	rows, err := s.pool.Query(ctx, `
		SELECT e.id, r.id, r.codigo, e.nombre_completo, r.sede_id, s.nombre, r.tipo_habitacion_id, t.nombre,
		       h.id, h.numero, r.check_in, r.check_out, r.huespedes, r.notas
		FROM estancia e
		JOIN reserva r         ON r.id = e.reserva_id
		JOIN sede s            ON s.id = r.sede_id
		JOIN tipo_habitacion t ON t.id = r.tipo_habitacion_id
		JOIN habitacion h      ON h.id = e.habitacion_id
		WHERE e.estado = 'en_casa'`+filtroCasa+`
		ORDER BY r.check_out, h.numero`, argsCasa...)
	if err != nil {
		return nil, err
	}
	if err := leer(rows, estancia.EnCasa); err != nil {
		return nil, err
	}

	rows, err = s.pool.Query(ctx, `
		SELECT NULL::bigint, r.id, r.codigo, btrim(c.nombre || ' ' || c.apellido), r.sede_id, s.nombre,
		       r.tipo_habitacion_id, t.nombre, NULL::bigint, '', r.check_in, r.check_out, r.huespedes, r.notas
		FROM reserva r
		JOIN cliente c         ON c.id = r.cliente_id
		JOIN sede s            ON s.id = r.sede_id
		JOIN tipo_habitacion t ON t.id = r.tipo_habitacion_id
		WHERE r.estado = 'confirmada' AND r.check_in <= $1 AND r.check_out > $1`+filtroLlegadas+`
		  AND NOT EXISTS (SELECT 1 FROM estancia e WHERE e.reserva_id = r.id)
		ORDER BY r.check_in, r.id`, argsLlegadas...)
	if err != nil {
		return nil, err
	}
	if err := leer(rows, estancia.Llegada); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) SedeDeReserva(ctx context.Context, reservaID int64) (int64, error) {
	var sede int64
	err := s.pool.QueryRow(ctx, `SELECT sede_id FROM reserva WHERE id = $1`, reservaID).Scan(&sede)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, estancia.ErrNoEncontrada
	}
	return sede, err
}

func (s *Store) Libres(ctx context.Context, reservaID int64) ([]estancia.HabitacionLibre, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT h.id, h.numero, h.piso
		FROM habitacion h
		JOIN reserva r ON r.id = $1 AND r.sede_id = h.sede_id AND r.tipo_habitacion_id = h.tipo_habitacion_id
		WHERE h.activa AND h.estado = 'limpia'
		  AND NOT EXISTS (SELECT 1 FROM estancia e WHERE e.habitacion_id = h.id AND e.estado = 'en_casa')
		ORDER BY h.piso, length(h.numero), h.numero`, reservaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []estancia.HabitacionLibre{}
	for rows.Next() {
		var h estancia.HabitacionLibre
		var piso int16
		if err := rows.Scan(&h.ID, &h.Numero, &piso); err != nil {
			return nil, err
		}
		h.Piso = int(piso)
		out = append(out, h)
	}
	return out, rows.Err()
}

var textoEstado = map[string]string{
	"ocupada": "ocupada", "sucia": "sucia (debe limpiarse primero)", "mantenimiento": "en mantenimiento",
}

// CheckIn registra la llegada. Bloquea la reserva y después la habitación, siempre en ese orden.
func (s *Store) CheckIn(ctx context.Context, in estancia.CheckIn, actor int64, hoy fecha.Fecha) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op tras Commit

	var estadoReserva string
	var sedeRes, tipoRes int64
	var entrada, salida time.Time
	err = tx.QueryRow(ctx, `
		SELECT estado, sede_id, tipo_habitacion_id, check_in, check_out
		FROM reserva WHERE id = $1 FOR UPDATE`, in.ReservaID).Scan(&estadoReserva, &sedeRes, &tipoRes, &entrada, &salida)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, estancia.ErrNoEncontrada
	}
	if err != nil {
		return 0, err
	}
	if estadoReserva != "confirmada" {
		return 0, estancia.ErrReservaNoConfirmada
	}

	var ya bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM estancia WHERE reserva_id = $1)`, in.ReservaID).Scan(&ya); err != nil {
		return 0, err
	}
	if ya {
		return 0, estancia.ErrYaRegistrada
	}

	ent, sal := fecha.DeTiempo(entrada), fecha.DeTiempo(salida)
	if hoy.Antes(ent) || !hoy.Antes(sal) {
		return 0, estancia.ErrFueraDeFechas{Entrada: ent, Salida: sal}
	}

	var sedeHab, tipoHab int64
	var activa bool
	var estadoHab, numero string
	err = tx.QueryRow(ctx, `
		SELECT sede_id, tipo_habitacion_id, activa, estado, numero
		FROM habitacion WHERE id = $1 FOR UPDATE`, in.HabitacionID).Scan(&sedeHab, &tipoHab, &activa, &estadoHab, &numero)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, estancia.ErrHabitacionNoApta{Motivo: "la habitación no existe"}
	}
	if err != nil {
		return 0, err
	}
	switch {
	case sedeHab != sedeRes:
		return 0, estancia.ErrHabitacionNoApta{Motivo: "la " + numero + " es de otro hotel"}
	case tipoHab != tipoRes:
		return 0, estancia.ErrHabitacionNoApta{Motivo: "la " + numero + " es de otro tipo que el reservado"}
	case !activa:
		return 0, estancia.ErrHabitacionNoApta{Motivo: "la " + numero + " está desactivada"}
	case estadoHab != "limpia":
		motivo := textoEstado[estadoHab]
		if motivo == "" {
			motivo = estadoHab
		}
		return 0, estancia.ErrHabitacionNoApta{Motivo: fmt.Sprintf("la %s está %s", numero, motivo)}
	}

	var quien *int64
	if actor != 0 {
		quien = &actor
	}
	f := in.Ficha
	var ingreso *time.Time
	if f.FechaIngresoPais != nil {
		t := f.FechaIngresoPais.Time()
		ingreso = &t
	}
	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO estancia (reserva_id, sede_id, habitacion_id, documento_tipo, documento_numero, nombre_completo,
		                      nacionalidad, domiciliado, fecha_ingreso_pais, telefono, registrado_por)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
		in.ReservaID, sedeRes, in.HabitacionID, string(f.DocumentoTipo), f.DocumentoNumero, f.NombreCompleto,
		f.Nacionalidad, f.Domiciliado, ingreso, f.Telefono, quien).Scan(&id)
	switch restriccion(err) {
	case "":
		if err != nil {
			return 0, err
		}
	case "estancia_habitacion_abierta":
		return 0, estancia.ErrHabitacionNoApta{Motivo: "la " + numero + " ya está ocupada"}
	default:
		return 0, estancia.ErrYaRegistrada
	}

	if _, err := tx.Exec(ctx, `UPDATE habitacion SET estado = 'ocupada', actualizado_en = now() WHERE id = $1`, in.HabitacionID); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return id, nil
}

// CheckOut cierra la estancia. Bloquea estancia → reserva → habitación (nunca al revés).
func (s *Store) CheckOut(ctx context.Context, id int64, actor int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op tras Commit

	var estado string
	var reservaID, habitacionID int64
	err = tx.QueryRow(ctx, `SELECT estado, reserva_id, habitacion_id FROM estancia WHERE id = $1 FOR UPDATE`, id).
		Scan(&estado, &reservaID, &habitacionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return estancia.ErrNoEncontrada
	}
	if err != nil {
		return err
	}
	if estado != "en_casa" {
		return estancia.ErrYaFinalizada
	}

	var quien *int64
	if actor != 0 {
		quien = &actor
	}
	if _, err := tx.Exec(ctx, `
		UPDATE estancia SET estado = 'finalizada', check_out_en = now(), cerrado_por = $2 WHERE id = $1`, id, quien); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE reserva SET estado = 'completada' WHERE id = $1 AND estado = 'confirmada'`, reservaID); err != nil {
		return err
	}
	// Queda SUCIA: la limpieza la libera.
	if _, err := tx.Exec(ctx, `
		UPDATE habitacion SET estado = 'sucia', actualizado_en = now() WHERE id = $1 AND estado = 'ocupada'`, habitacionID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) PorID(ctx context.Context, id int64) (estancia.Estancia, error) {
	var e estancia.Estancia
	var in, sal time.Time
	var doc, estado string
	var ingreso *time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT e.id, e.reserva_id, r.codigo, e.sede_id, e.habitacion_id, h.numero, e.estado, e.check_in_en, e.check_out_en,
		       r.check_in, r.check_out,
		       e.documento_tipo, e.documento_numero, e.nombre_completo, e.nacionalidad, e.domiciliado,
		       e.fecha_ingreso_pais, e.telefono
		FROM estancia e
		JOIN reserva r    ON r.id = e.reserva_id
		JOIN habitacion h ON h.id = e.habitacion_id
		WHERE e.id = $1`, id).
		Scan(&e.ID, &e.ReservaID, &e.Codigo, &e.SedeID, &e.HabitacionID, &e.HabitacionNumero, &estado, &e.CheckInEn, &e.CheckOutEn,
			&in, &sal,
			&doc, &e.Ficha.DocumentoNumero, &e.Ficha.NombreCompleto, &e.Ficha.Nacionalidad, &e.Ficha.Domiciliado,
			&ingreso, &e.Ficha.Telefono)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, estancia.ErrNoEncontrada
	}
	if err != nil {
		return e, err
	}
	e.Estado = estado
	e.CheckIn, e.CheckOut = fecha.DeTiempo(in), fecha.DeTiempo(sal)
	e.Ficha.DocumentoTipo = estancia.DocumentoTipo(doc)
	if ingreso != nil {
		f := fecha.DeTiempo(*ingreso)
		e.Ficha.FechaIngresoPais = &f
	}
	return e, nil
}
