// Package postgres implementa limpieza.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/limpieza"
	"hotelerias/backend/internal/platform/fecha"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// Tablero lista las habitaciones sucias. Urgente = hay más llegadas por atender hoy de ese
// tipo que habitaciones limpias del tipo. Primero lo urgente y, entre iguales, lo más antiguo.
func (s *Store) Tablero(ctx context.Context, sedeIDs []int64, hoy fecha.Fecha) ([]limpieza.Tarea, error) {
	filtro, args := "", []any{hoy.Time()}
	if sedeIDs != nil {
		filtro, args = " AND h.sede_id = ANY($2)", append(args, sedeIDs)
	}
	rows, err := s.pool.Query(ctx, `
		WITH llegadas AS (
			SELECT r.tipo_habitacion_id, count(*) AS n
			FROM reserva r
			WHERE r.estado = 'confirmada' AND r.check_in <= $1 AND r.check_out > $1
			  AND NOT EXISTS (SELECT 1 FROM estancia e WHERE e.reserva_id = r.id)
			GROUP BY r.tipo_habitacion_id
		), limpias AS (
			SELECT tipo_habitacion_id, count(*) AS n
			FROM habitacion WHERE activa AND estado = 'limpia' GROUP BY tipo_habitacion_id
		)
		SELECT h.id, h.sede_id, s.nombre, h.numero, h.piso, t.nombre, h.actualizado_en,
		       COALESCE(l.estado, 'pendiente'), l.asignada_a,
		       btrim(COALESCE(u.nombre, '') || ' ' || COALESCE(u.apellido, '')), l.iniciada_en,
		       COALESCE(ll.n, 0) > COALESCE(li.n, 0) AS urgente
		FROM habitacion h
		JOIN sede s            ON s.id = h.sede_id
		JOIN tipo_habitacion t ON t.id = h.tipo_habitacion_id
		LEFT JOIN limpieza l   ON l.habitacion_id = h.id AND l.estado <> 'terminada'
		LEFT JOIN usuario u    ON u.id = l.asignada_a
		LEFT JOIN llegadas ll  ON ll.tipo_habitacion_id = h.tipo_habitacion_id
		LEFT JOIN limpias li   ON li.tipo_habitacion_id = h.tipo_habitacion_id
		WHERE h.activa AND h.estado = 'sucia'`+filtro+`
		ORDER BY urgente DESC, h.actualizado_en, s.nombre, length(h.numero), h.numero`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []limpieza.Tarea{}
	for rows.Next() {
		var t limpieza.Tarea
		var piso int16
		var estado string
		if err := rows.Scan(&t.HabitacionID, &t.SedeID, &t.SedeNombre, &t.Numero, &piso, &t.TipoNombre, &t.SuciaDesde,
			&estado, &t.AsignadaA, &t.AsignadaANombre, &t.IniciadaEn, &t.Urgente); err != nil {
			return nil, err
		}
		t.Piso, t.Estado = int(piso), limpieza.Estado(estado)
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) Historial(ctx context.Context, sedeIDs []int64, limite int) ([]limpieza.Terminada, error) {
	filtro, args := "", []any{limite}
	if sedeIDs != nil {
		filtro, args = " AND l.sede_id = ANY($2)", append(args, sedeIDs)
	}
	rows, err := s.pool.Query(ctx, `
		SELECT l.id, s.nombre, h.numero, t.nombre,
		       btrim(COALESCE(ua.nombre, '') || ' ' || COALESCE(ua.apellido, '')),
		       btrim(COALESCE(ut.nombre, '') || ' ' || COALESCE(ut.apellido, '')),
		       l.iniciada_en, l.terminada_en,
		       CASE WHEN l.iniciada_en IS NULL THEN NULL
		            ELSE round(extract(epoch FROM (l.terminada_en - l.iniciada_en)) / 60)::int END,
		       l.observaciones
		FROM limpieza l
		JOIN habitacion h      ON h.id = l.habitacion_id
		JOIN sede s            ON s.id = l.sede_id
		JOIN tipo_habitacion t ON t.id = h.tipo_habitacion_id
		LEFT JOIN usuario ua   ON ua.id = l.asignada_a
		LEFT JOIN usuario ut   ON ut.id = l.terminada_por
		WHERE l.estado = 'terminada'`+filtro+`
		ORDER BY l.terminada_en DESC, l.id DESC LIMIT $1`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []limpieza.Terminada{}
	for rows.Next() {
		var t limpieza.Terminada
		if err := rows.Scan(&t.ID, &t.SedeNombre, &t.Numero, &t.TipoNombre, &t.AsignadaANombre, &t.TerminadaPor,
			&t.IniciadaEn, &t.TerminadaEn, &t.Minutos, &t.Observaciones); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) Personal(ctx context.Context) ([]limpieza.Persona, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, btrim(nombre || ' ' || apellido) FROM usuario WHERE activo ORDER BY nombre, apellido, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []limpieza.Persona{}
	for rows.Next() {
		var p limpieza.Persona
		if err := rows.Scan(&p.ID, &p.Nombre); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) SedeDeHabitacion(ctx context.Context, id int64) (int64, error) {
	var sede int64
	err := s.pool.QueryRow(ctx, `SELECT sede_id FROM habitacion WHERE id = $1`, id).Scan(&sede)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, limpieza.ErrNoEncontrada
	}
	return sede, err
}

func (s *Store) Etiqueta(ctx context.Context, id int64) (string, error) {
	var e string
	err := s.pool.QueryRow(ctx, `SELECT s.nombre || ' · ' || h.numero FROM habitacion h JOIN sede s ON s.id = h.sede_id WHERE h.id = $1`, id).Scan(&e)
	return e, err
}

// sucia bloquea la habitación y comprueba que siga sucia y activa. Devuelve su hotel.
func sucia(ctx context.Context, tx pgx.Tx, id int64) (int64, error) {
	var sede int64
	var estado string
	var activa bool
	err := tx.QueryRow(ctx, `SELECT sede_id, estado, activa FROM habitacion WHERE id = $1 FOR UPDATE`, id).Scan(&sede, &estado, &activa)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, limpieza.ErrNoEncontrada
	}
	if err != nil {
		return 0, err
	}
	if !activa {
		return 0, limpieza.ErrNoEstaSucia{Estado: "desactivada"}
	}
	if estado != "sucia" {
		return 0, limpieza.ErrNoEstaSucia{Estado: estado}
	}
	return sede, nil
}

func (s *Store) conTx(ctx context.Context, f func(tx pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op tras Commit
	if err := f(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// abierta lee (y bloquea) la limpieza abierta de la habitación; "" si no hay.
func abierta(ctx context.Context, tx pgx.Tx, habitacionID int64) (string, error) {
	var estado string
	err := tx.QueryRow(ctx, `SELECT estado FROM limpieza WHERE habitacion_id = $1 AND estado <> 'terminada' FOR UPDATE`, habitacionID).Scan(&estado)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return estado, err
}

func (s *Store) Asignar(ctx context.Context, habitacionID int64, quien *int64, actor int64) error {
	return s.conTx(ctx, func(tx pgx.Tx) error {
		sede, err := sucia(ctx, tx, habitacionID)
		if err != nil {
			return err
		}
		actual, err := abierta(ctx, tx, habitacionID)
		if err != nil {
			return err
		}

		if quien == nil { // quitar al responsable
			switch actual {
			case "en_curso":
				return limpieza.ErrYaEnCurso
			case "asignada":
				_, err = tx.Exec(ctx, `DELETE FROM limpieza WHERE habitacion_id = $1 AND estado = 'asignada'`, habitacionID)
				return err
			}
			return nil
		}

		var existe bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM usuario WHERE id = $1 AND activo)`, *quien).Scan(&existe); err != nil {
			return err
		}
		if !existe {
			return limpieza.ErrPersonalInvalido
		}
		if actual != "" { // cambiar de responsable, sin perder si ya estaba en curso
			_, err = tx.Exec(ctx, `
				UPDATE limpieza SET asignada_a = $2, asignada_en = now()
				WHERE habitacion_id = $1 AND estado <> 'terminada'`, habitacionID, *quien)
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO limpieza (habitacion_id, sede_id, estado, asignada_a, asignada_en)
			VALUES ($1, $2, 'asignada', $3, now())`, habitacionID, sede, *quien)
		return err
	})
}

func (s *Store) Iniciar(ctx context.Context, habitacionID int64, actor int64) error {
	return s.conTx(ctx, func(tx pgx.Tx) error {
		sede, err := sucia(ctx, tx, habitacionID)
		if err != nil {
			return err
		}
		actual, err := abierta(ctx, tx, habitacionID)
		if err != nil {
			return err
		}
		switch actual {
		case "en_curso":
			return limpieza.ErrYaEnCurso
		case "asignada":
			_, err = tx.Exec(ctx, `
				UPDATE limpieza SET estado = 'en_curso', iniciada_en = now()
				WHERE habitacion_id = $1 AND estado = 'asignada'`, habitacionID)
			return err
		}
		// Nadie la había asignado: quien la empieza queda como responsable.
		_, err = tx.Exec(ctx, `
			INSERT INTO limpieza (habitacion_id, sede_id, estado, asignada_a, asignada_en, iniciada_en)
			VALUES ($1, $2, 'en_curso', $3, now(), now())`, habitacionID, sede, nullable(actor))
		return err
	})
}

func (s *Store) Terminar(ctx context.Context, habitacionID int64, actor int64, observaciones string) error {
	return s.conTx(ctx, func(tx pgx.Tx) error {
		sede, err := sucia(ctx, tx, habitacionID)
		if err != nil {
			return err
		}
		actual, err := abierta(ctx, tx, habitacionID)
		if err != nil {
			return err
		}
		// Primero se cierra la limpieza y DESPUÉS se cambia la habitación: el disparador que
		// descarta las abiertas cuando una habitación deja de estar sucia no encuentra nada.
		if actual != "" {
			_, err = tx.Exec(ctx, `
				UPDATE limpieza SET estado = 'terminada', terminada_en = now(), terminada_por = $2, observaciones = $3
				WHERE habitacion_id = $1 AND estado <> 'terminada'`, habitacionID, nullable(actor), observaciones)
		} else { // se limpió sin que nadie la hubiera asignado ni iniciado
			_, err = tx.Exec(ctx, `
				INSERT INTO limpieza (habitacion_id, sede_id, estado, terminada_en, terminada_por, observaciones)
				VALUES ($1, $2, 'terminada', now(), $3, $4)`, habitacionID, sede, nullable(actor), observaciones)
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE habitacion SET estado = 'limpia', actualizado_en = now() WHERE id = $1`, habitacionID)
		return err
	})
}

func nullable(id int64) *int64 {
	if id == 0 {
		return nil
	}
	return &id
}
