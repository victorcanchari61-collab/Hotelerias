package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"hotelerias/backend/internal/permiso"
)

// --- Excepciones ------------------------------------------------------------

const selExcepcion = `
	SELECT p.id, p.usuario_id, p.submodulo, p.accion, p.vigencia, p.expira_en, p.usos, p.revocado,
	       COALESCE(p.motivo, ''), btrim(COALESCE(o.nombre, '') || ' ' || COALESCE(o.apellido, '')),
	       p.fecha_otorgado
	FROM usuario_permiso p
	LEFT JOIN usuario o ON o.id = p.otorgado_por`

func escanearExcepcion(row pgx.Row, ahora time.Time) (permiso.ExcepcionDetalle, error) {
	var e permiso.ExcepcionDetalle
	var vig string
	err := row.Scan(&e.ID, &e.UsuarioID, &e.Submodulo, &e.Accion, &vig, &e.ExpiraEn, &e.Usos, &e.Revocado,
		&e.Motivo, &e.OtorgadoPor, &e.Fecha)
	e.Vigencia = permiso.Vigencia(vig)
	// La regla de qué cuenta como vigente vive en un solo sitio: Excepcion.Vigente.
	e.Vigente = permiso.Excepcion{Vigencia: e.Vigencia, ExpiraEn: e.ExpiraEn, Usos: e.Usos, Revocado: e.Revocado}.Vigente(ahora)
	return e, err
}

func (s *Store) Excepciones(ctx context.Context, usuarioID int64) ([]permiso.ExcepcionDetalle, error) {
	rows, err := s.pool.Query(ctx, selExcepcion+` WHERE p.usuario_id = $1 ORDER BY p.fecha_otorgado DESC, p.id DESC`, usuarioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ahora := time.Now()
	out := []permiso.ExcepcionDetalle{}
	for rows.Next() {
		e, err := escanearExcepcion(rows, ahora)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) CrearExcepcion(ctx context.Context, n permiso.ExcepcionNueva) (permiso.ExcepcionDetalle, error) {
	var otorgante *int64
	if n.OtorgadoPor != 0 {
		otorgante = &n.OtorgadoPor
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO usuario_permiso (usuario_id, submodulo, accion, vigencia, expira_en, motivo, otorgado_por)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		n.UsuarioID, n.Clave.Submodulo, string(n.Clave.Accion), string(n.Vigencia), n.ExpiraEn, n.Motivo, otorgante).Scan(&id)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23503" { // foreign_key_violation: la persona no existe
		return permiso.ExcepcionDetalle{}, permiso.ErrUsuarioNoEncontrado
	}
	if err != nil {
		return permiso.ExcepcionDetalle{}, err
	}
	return escanearExcepcion(s.pool.QueryRow(ctx, selExcepcion+` WHERE p.id = $1`, id), time.Now())
}

func (s *Store) Revocar(ctx context.Context, id int64) (bool, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE usuario_permiso SET revocado = TRUE WHERE id = $1`, id)
	return tag.RowsAffected() == 1, err
}

// --- Solicitudes ------------------------------------------------------------

const selSolicitud = `
	SELECT s.id, s.usuario_id, btrim(COALESCE(u.nombre, '') || ' ' || COALESCE(u.apellido, '')),
	       s.submodulo, s.accion, s.motivo, s.referencia, s.estado, s.fecha_solicitud,
	       s.fecha_resolucion, s.respuesta
	FROM solicitud_permiso s
	JOIN usuario u ON u.id = s.usuario_id`

func escanearSolicitud(row pgx.Row) (permiso.Solicitud, error) {
	var x permiso.Solicitud
	var estado string
	err := row.Scan(&x.ID, &x.UsuarioID, &x.Usuario, &x.Submodulo, &x.Accion, &x.Motivo, &x.Referencia,
		&estado, &x.FechaSolicitud, &x.FechaResolucion, &x.Respuesta)
	x.Estado = permiso.EstadoSolicitud(estado)
	return x, err
}

func (s *Store) solicitudes(ctx context.Context, sql string, args ...any) ([]permiso.Solicitud, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []permiso.Solicitud{}
	for rows.Next() {
		x, err := escanearSolicitud(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *Store) CrearSolicitud(ctx context.Context, n permiso.SolicitudNueva) (permiso.Solicitud, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO solicitud_permiso (usuario_id, submodulo, accion, motivo, referencia)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (usuario_id, submodulo, accion) WHERE estado = 'pendiente' DO NOTHING
		RETURNING id`,
		n.UsuarioID, n.Clave.Submodulo, string(n.Clave.Accion), n.Motivo, n.Referencia).Scan(&id)

	if errors.Is(err, pgx.ErrNoRows) {
		// Ya había una abierta: se devuelve esa (pulsar dos veces no llena la bandeja).
		err = s.pool.QueryRow(ctx, `
			SELECT id FROM solicitud_permiso
			WHERE usuario_id = $1 AND submodulo = $2 AND accion = $3 AND estado = 'pendiente'`,
			n.UsuarioID, n.Clave.Submodulo, string(n.Clave.Accion)).Scan(&id)
	}
	if err != nil {
		return permiso.Solicitud{}, err
	}
	return escanearSolicitud(s.pool.QueryRow(ctx, selSolicitud+` WHERE s.id = $1`, id))
}

func (s *Store) SolicitudesDe(ctx context.Context, usuarioID int64) ([]permiso.Solicitud, error) {
	return s.solicitudes(ctx, selSolicitud+` WHERE s.usuario_id = $1 ORDER BY s.fecha_solicitud DESC LIMIT 50`, usuarioID)
}

func (s *Store) Bandeja(ctx context.Context, soloPendientes bool) ([]permiso.Solicitud, error) {
	donde := ""
	if soloPendientes {
		donde = ` WHERE s.estado = 'pendiente'`
	}
	// Lo pendiente arriba aunque sea lo más viejo: es lo único sobre lo que hay algo que hacer.
	return s.solicitudes(ctx, selSolicitud+donde+`
		ORDER BY (s.estado = 'pendiente') DESC, s.fecha_solicitud DESC LIMIT 200`)
}

// bloquear toma la solicitud con FOR UPDATE y comprueba que siga pendiente.
func bloquear(ctx context.Context, tx pgx.Tx, id int64) (usuarioID int64, sub, acc, motivo string, err error) {
	var estado string
	err = tx.QueryRow(ctx, `
		SELECT usuario_id, submodulo, accion, motivo, estado
		FROM solicitud_permiso WHERE id = $1 FOR UPDATE`, id).Scan(&usuarioID, &sub, &acc, &motivo, &estado)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", "", "", permiso.ErrSolicitudNoEncontrada
	}
	if err != nil {
		return 0, "", "", "", err
	}
	// Dos admins pueden tener la bandeja abierta a la vez: el segundo se topa con esto.
	if estado != string(permiso.Pendiente) {
		return 0, "", "", "", permiso.ErrYaResuelta
	}
	return usuarioID, sub, acc, motivo, nil
}

func (s *Store) Aprobar(ctx context.Context, id, adminID int64, v permiso.Vigencia, expira *time.Time, respuesta string) (permiso.Solicitud, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return permiso.Solicitud{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	usuarioID, sub, acc, motivo, err := bloquear(ctx, tx, id)
	if err != nil {
		return permiso.Solicitud{}, err
	}

	var permisoID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO usuario_permiso (usuario_id, submodulo, accion, vigencia, expira_en, motivo, otorgado_por)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		usuarioID, sub, acc, string(v), expira, motivo, adminID).Scan(&permisoID)
	if err != nil {
		return permiso.Solicitud{}, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE solicitud_permiso
		SET estado = 'aprobada', resuelta_por = $2, fecha_resolucion = now(), respuesta = $3, permiso_id = $4
		WHERE id = $1`, id, adminID, respuesta, permisoID); err != nil {
		return permiso.Solicitud{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return permiso.Solicitud{}, err
	}
	return escanearSolicitud(s.pool.QueryRow(ctx, selSolicitud+` WHERE s.id = $1`, id))
}

func (s *Store) Rechazar(ctx context.Context, id, adminID int64, respuesta string) (permiso.Solicitud, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return permiso.Solicitud{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, _, _, _, err := bloquear(ctx, tx, id); err != nil {
		return permiso.Solicitud{}, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE solicitud_permiso
		SET estado = 'rechazada', resuelta_por = $2, fecha_resolucion = now(), respuesta = $3
		WHERE id = $1`, id, adminID, respuesta); err != nil {
		return permiso.Solicitud{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return permiso.Solicitud{}, err
	}
	return escanearSolicitud(s.pool.QueryRow(ctx, selSolicitud+` WHERE s.id = $1`, id))
}

// --- Alcances ---------------------------------------------------------------

func (s *Store) leerAlcances(ctx context.Context, sql string, arg any) (map[string]permiso.Alcance, error) {
	rows, err := s.pool.Query(ctx, sql, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]permiso.Alcance{}
	for rows.Next() {
		var sub, nivel string
		if err := rows.Scan(&sub, &nivel); err != nil {
			return nil, err
		}
		out[sub] = permiso.Alcance(nivel)
	}
	return out, rows.Err()
}

func (s *Store) AlcancesDeRol(ctx context.Context, rolID int64) (map[string]permiso.Alcance, error) {
	return s.leerAlcances(ctx, `SELECT submodulo, alcance FROM rol_alcance WHERE rol_id = $1`, rolID)
}

func (s *Store) AlcancesDeUsuario(ctx context.Context, usuarioID int64) (map[string]permiso.Alcance, error) {
	return s.leerAlcances(ctx, `SELECT submodulo, alcance FROM usuario_alcance WHERE usuario_id = $1`, usuarioID)
}

func (s *Store) GuardarAlcancesRol(ctx context.Context, rolID int64, a map[string]permiso.Alcance) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM rol_alcance WHERE rol_id = $1`, rolID); err != nil {
		return err
	}
	for sub, nivel := range a {
		if _, err := tx.Exec(ctx,
			`INSERT INTO rol_alcance (rol_id, submodulo, alcance) VALUES ($1, $2, $3)`,
			rolID, sub, string(nivel)); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) GuardarAlcancesUsuario(ctx context.Context, usuarioID int64, a map[string]permiso.Alcance, concedidoPor int64) error {
	var por *int64
	if concedidoPor != 0 {
		por = &concedidoPor
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM usuario_alcance WHERE usuario_id = $1`, usuarioID); err != nil {
		return err
	}
	for sub, nivel := range a {
		if _, err := tx.Exec(ctx,
			`INSERT INTO usuario_alcance (usuario_id, submodulo, alcance, concedido_por) VALUES ($1, $2, $3, $4)`,
			usuarioID, sub, string(nivel), por); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) AlcancesDeRoles(ctx context.Context, rolIDs []int64, submodulo string) (map[int64]permiso.Alcance, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT rol_id, alcance FROM rol_alcance WHERE rol_id = ANY($1) AND submodulo = $2`, rolIDs, submodulo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int64]permiso.Alcance{}
	for rows.Next() {
		var id int64
		var nivel string
		if err := rows.Scan(&id, &nivel); err != nil {
			return nil, err
		}
		out[id] = permiso.Alcance(nivel)
	}
	return out, rows.Err()
}

func (s *Store) SedesDe(ctx context.Context, usuarioID int64) ([]int64, error) {
	rows, err := s.pool.Query(ctx, `SELECT sede_id FROM usuario_sede WHERE usuario_id = $1 ORDER BY sede_id`, usuarioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
