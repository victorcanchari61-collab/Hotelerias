// Package postgres implementa sitio.Repositorio sobre pgx.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/sitio"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func codigo(err error) (string, string) {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		return pg.Code, pg.ConstraintName
	}
	return "", ""
}

func noHay(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return sitio.ErrNoEncontrado
	}
	return err
}

// medioRef arma la referencia a un medio desde las columnas de un LEFT JOIN (todas nulas = sin medio).
func medioRef(id *int64, tipo, archivo, desc *string, ancho, alto *int) *sitio.MedioRef {
	if id == nil || tipo == nil || archivo == nil {
		return nil
	}
	d := ""
	if desc != nil {
		d = *desc
	}
	return &sitio.MedioRef{ID: *id, Tipo: *tipo, URL: sitio.PrefijoURL + *archivo, Descripcion: d, Ancho: ancho, Alto: alto}
}

func fechaOpt(t *time.Time) *fecha.Fecha {
	if t == nil {
		return nil
	}
	f := fecha.DeTiempo(*t)
	return &f
}

func tiempoOpt(f *fecha.Fecha) *time.Time {
	if f == nil || f.IsZero() {
		return nil
	}
	t := f.Time()
	return &t
}

// ------------------------------------------------------------------ medios

func (s *Store) CrearMedio(ctx context.Context, m sitio.NuevoMedio) (int64, error) {
	var creador *int64
	if m.CreadoPor != 0 {
		creador = &m.CreadoPor
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO medio (tipo, archivo, nombre_original, mime, bytes, ancho, alto, creado_por)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
		m.Tipo, m.Archivo, m.NombreOriginal, m.Mime, m.Bytes, m.Ancho, m.Alto, creador).Scan(&id)
	return id, err
}

const selMedio = `
	SELECT m.id, m.tipo, m.archivo, m.descripcion, m.ancho, m.alto, m.nombre_original, m.mime, m.bytes, m.creado_en,
	       (SELECT count(*) FROM banner WHERE medio_id = m.id)
	     + (SELECT count(*) FROM experiencia WHERE medio_id = m.id)
	     + (SELECT count(*) FROM entrada WHERE portada_id = m.id)
	     + (SELECT count(*) FROM pagina WHERE medio_id = m.id)
	     + (SELECT count(*) FROM galeria WHERE medio_id = m.id)
	FROM medio m`

func escanearMedio(row pgx.Row) (sitio.Medio, error) {
	var m sitio.Medio
	var archivo string
	err := row.Scan(&m.ID, &m.Tipo, &archivo, &m.Descripcion, &m.Ancho, &m.Alto, &m.NombreOriginal, &m.Mime, &m.Bytes, &m.CreadoEn, &m.Usos)
	m.URL = sitio.PrefijoURL + archivo
	return m, err
}

func (s *Store) ObtenerMedio(ctx context.Context, id int64) (sitio.Medio, error) {
	m, err := escanearMedio(s.pool.QueryRow(ctx, selMedio+` WHERE m.id = $1`, id))
	return m, noHay(err)
}

func (s *Store) ListarMedios(ctx context.Context, tipo string, limite int) ([]sitio.Medio, error) {
	q, args := selMedio, []any{}
	if tipo != "" {
		q += ` WHERE m.tipo = $1`
		args = append(args, tipo)
	}
	q += ` ORDER BY m.creado_en DESC, m.id DESC LIMIT ` + itoa(limite)
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []sitio.Medio{}
	for rows.Next() {
		m, err := escanearMedio(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func itoa(n int) string {
	if n <= 0 {
		return "0"
	}
	var d []byte
	for ; n > 0; n /= 10 {
		d = append([]byte{byte('0' + n%10)}, d...)
	}
	return string(d)
}

func (s *Store) ActualizarMedio(ctx context.Context, id int64, descripcion string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE medio SET descripcion = $2 WHERE id = $1`, id, descripcion)
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

func (s *Store) UsosDeMedio(ctx context.Context, id int64) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT 'la portada «' || titulo || '»' FROM banner WHERE medio_id = $1
		UNION ALL SELECT 'la experiencia «' || titulo || '»' FROM experiencia WHERE medio_id = $1
		UNION ALL SELECT 'la historia «' || titulo || '»' FROM entrada WHERE portada_id = $1
		UNION ALL SELECT 'la página «' || titulo || '»' FROM pagina WHERE medio_id = $1
		UNION ALL
		SELECT 'la galería de ' || CASE g.entidad
		         WHEN 'sede' THEN COALESCE((SELECT 'el hotel ' || nombre FROM sede WHERE id = g.entidad_id), 'un hotel')
		         ELSE COALESCE((SELECT 'la habitación ' || t.nombre || ' (' || s.nombre || ')'
		                        FROM tipo_habitacion t JOIN sede s ON s.id = t.sede_id WHERE t.id = g.entidad_id), 'una habitación')
		       END
		FROM galeria g WHERE g.medio_id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) EliminarMedio(ctx context.Context, id int64) (string, error) {
	var archivo string
	err := s.pool.QueryRow(ctx, `DELETE FROM medio WHERE id = $1 RETURNING archivo`, id).Scan(&archivo)
	if c, _ := codigo(err); c == "23503" { // alguien lo empezó a usar justo ahora
		usos, _ := s.UsosDeMedio(ctx, id)
		return "", sitio.ErrEnUso{Usos: usos}
	}
	return archivo, noHay(err)
}

func (s *Store) ExisteMedio(ctx context.Context, id int64) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM medio WHERE id = $1)`, id).Scan(&ok)
	return ok, err
}

// ------------------------------------------------------------------ banners

const selBanner = `
	SELECT b.id, b.orden, b.titulo, b.subtitulo, b.medio_id, b.enlace_texto, b.enlace_url, b.activo, b.desde, b.hasta,
	       m.tipo, m.archivo, m.descripcion, m.ancho, m.alto
	FROM banner b LEFT JOIN medio m ON m.id = b.medio_id`

func escanearBanner(row pgx.Row) (sitio.Banner, error) {
	var b sitio.Banner
	var desde, hasta *time.Time
	var tipo, archivo, desc *string
	var ancho, alto *int
	err := row.Scan(&b.ID, &b.Orden, &b.Titulo, &b.Subtitulo, &b.MedioID, &b.EnlaceTexto, &b.EnlaceURL, &b.Activo,
		&desde, &hasta, &tipo, &archivo, &desc, &ancho, &alto)
	b.Desde, b.Hasta = fechaOpt(desde), fechaOpt(hasta)
	b.Medio = medioRef(b.MedioID, tipo, archivo, desc, ancho, alto)
	return b, err
}

func (s *Store) ListarBanners(ctx context.Context, soloVigentes bool, hoy fecha.Fecha) ([]sitio.Banner, error) {
	q, args := selBanner, []any{}
	if soloVigentes {
		q += ` WHERE b.activo AND (b.desde IS NULL OR b.desde <= $1) AND (b.hasta IS NULL OR b.hasta >= $1)`
		args = append(args, hoy.Time())
	}
	rows, err := s.pool.Query(ctx, q+` ORDER BY b.orden, b.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []sitio.Banner{}
	for rows.Next() {
		b, err := escanearBanner(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) ObtenerBanner(ctx context.Context, id int64) (sitio.Banner, error) {
	b, err := escanearBanner(s.pool.QueryRow(ctx, selBanner+` WHERE b.id = $1`, id))
	return b, noHay(err)
}

func (s *Store) CrearBanner(ctx context.Context, in sitio.BannerInput) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO banner (orden, titulo, subtitulo, medio_id, enlace_texto, enlace_url, activo, desde, hasta)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
		in.Orden, in.Titulo, in.Subtitulo, in.MedioID, in.EnlaceTexto, in.EnlaceURL, in.Activo,
		tiempoOpt(in.Desde), tiempoOpt(in.Hasta)).Scan(&id)
	return id, err
}

func (s *Store) ActualizarBanner(ctx context.Context, id int64, in sitio.BannerInput) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE banner SET orden=$2, titulo=$3, subtitulo=$4, medio_id=$5, enlace_texto=$6, enlace_url=$7,
		                  activo=$8, desde=$9, hasta=$10
		WHERE id = $1`,
		id, in.Orden, in.Titulo, in.Subtitulo, in.MedioID, in.EnlaceTexto, in.EnlaceURL, in.Activo,
		tiempoOpt(in.Desde), tiempoOpt(in.Hasta))
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

func (s *Store) EliminarBanner(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM banner WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

// ------------------------------------------------------------------ experiencias

const selExperiencia = `
	SELECT e.id, e.slug, e.titulo, e.resumen, e.texto, e.ejemplos, e.medio_id, e.orden, e.activo,
	       m.tipo, m.archivo, m.descripcion, m.ancho, m.alto
	FROM experiencia e LEFT JOIN medio m ON m.id = e.medio_id`

func escanearExperiencia(row pgx.Row) (sitio.Experiencia, error) {
	var e sitio.Experiencia
	var tipo, archivo, desc *string
	var ancho, alto *int
	err := row.Scan(&e.ID, &e.Slug, &e.Titulo, &e.Resumen, &e.Texto, &e.Ejemplos, &e.MedioID, &e.Orden, &e.Activo,
		&tipo, &archivo, &desc, &ancho, &alto)
	e.Medio = medioRef(e.MedioID, tipo, archivo, desc, ancho, alto)
	if e.Ejemplos == nil {
		e.Ejemplos = []string{}
	}
	return e, err
}

func (s *Store) ListarExperiencias(ctx context.Context, soloActivas bool) ([]sitio.Experiencia, error) {
	q := selExperiencia
	if soloActivas {
		q += ` WHERE e.activo`
	}
	rows, err := s.pool.Query(ctx, q+` ORDER BY e.orden, e.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []sitio.Experiencia{}
	for rows.Next() {
		e, err := escanearExperiencia(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) ObtenerExperiencia(ctx context.Context, id int64) (sitio.Experiencia, error) {
	e, err := escanearExperiencia(s.pool.QueryRow(ctx, selExperiencia+` WHERE e.id = $1`, id))
	return e, noHay(err)
}

func (s *Store) CrearExperiencia(ctx context.Context, slug string, in sitio.ExperienciaInput) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO experiencia (slug, titulo, resumen, texto, ejemplos, medio_id, orden, activo)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
		slug, in.Titulo, in.Resumen, in.Texto, in.Ejemplos, in.MedioID, in.Orden, in.Activo).Scan(&id)
	if c, _ := codigo(err); c == "23505" {
		return 0, sitio.ErrSlugRepetido
	}
	return id, err
}

func (s *Store) ActualizarExperiencia(ctx context.Context, id int64, slug string, in sitio.ExperienciaInput) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE experiencia SET slug=$2, titulo=$3, resumen=$4, texto=$5, ejemplos=$6, medio_id=$7, orden=$8, activo=$9
		WHERE id = $1`, id, slug, in.Titulo, in.Resumen, in.Texto, in.Ejemplos, in.MedioID, in.Orden, in.Activo)
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

func (s *Store) EliminarExperiencia(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM experiencia WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

// ------------------------------------------------------------------ blog

const selEntrada = `
	SELECT e.id, e.slug, e.titulo, e.resumen, e.cuerpo, e.portada_id, e.estado, e.publicada_en,
	       btrim(COALESCE(u.nombre, '') || ' ' || COALESCE(u.apellido, '')), e.creado_en, e.actualizado_en,
	       m.tipo, m.archivo, m.descripcion, m.ancho, m.alto
	FROM entrada e
	LEFT JOIN medio m   ON m.id = e.portada_id
	LEFT JOIN usuario u ON u.id = e.autor_id`

func escanearEntrada(row pgx.Row) (sitio.Entrada, error) {
	var e sitio.Entrada
	var estado string
	var tipo, archivo, desc *string
	var ancho, alto *int
	err := row.Scan(&e.ID, &e.Slug, &e.Titulo, &e.Resumen, &e.Cuerpo, &e.PortadaID, &estado, &e.PublicadaEn,
		&e.Autor, &e.CreadoEn, &e.ActualizadoEn, &tipo, &archivo, &desc, &ancho, &alto)
	e.Estado = sitio.Estado(estado)
	e.Portada = medioRef(e.PortadaID, tipo, archivo, desc, ancho, alto)
	return e, err
}

func (s *Store) ListarEntradas(ctx context.Context, soloPublicadas bool, limite, desplazamiento int) ([]sitio.Entrada, error) {
	q := selEntrada
	if soloPublicadas {
		q += ` WHERE e.estado = 'publicada' ORDER BY e.publicada_en DESC, e.id DESC`
	} else {
		q += ` ORDER BY e.actualizado_en DESC, e.id DESC`
	}
	rows, err := s.pool.Query(ctx, q+` LIMIT $1 OFFSET $2`, limite, desplazamiento)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []sitio.Entrada{}
	for rows.Next() {
		e, err := escanearEntrada(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) ObtenerEntrada(ctx context.Context, id int64) (sitio.Entrada, error) {
	e, err := escanearEntrada(s.pool.QueryRow(ctx, selEntrada+` WHERE e.id = $1`, id))
	return e, noHay(err)
}

func (s *Store) EntradaPorSlug(ctx context.Context, slug string, soloPublicadas bool) (sitio.Entrada, error) {
	q := selEntrada + ` WHERE e.slug = $1`
	if soloPublicadas {
		q += ` AND e.estado = 'publicada'`
	}
	e, err := escanearEntrada(s.pool.QueryRow(ctx, q, slug))
	return e, noHay(err)
}

func (s *Store) CrearEntrada(ctx context.Context, slug string, in sitio.EntradaInput, autor int64) (int64, error) {
	var a *int64
	if autor != 0 {
		a = &autor
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO entrada (slug, titulo, resumen, cuerpo, portada_id, autor_id)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, slug, in.Titulo, in.Resumen, in.Cuerpo, in.PortadaID, a).Scan(&id)
	if c, _ := codigo(err); c == "23505" {
		return 0, sitio.ErrSlugRepetido
	}
	return id, err
}

func (s *Store) ActualizarEntrada(ctx context.Context, id int64, slug string, in sitio.EntradaInput) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE entrada SET slug=$2, titulo=$3, resumen=$4, cuerpo=$5, portada_id=$6, actualizado_en=now()
		WHERE id = $1`, id, slug, in.Titulo, in.Resumen, in.Cuerpo, in.PortadaID)
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

func (s *Store) CambiarEstadoEntrada(ctx context.Context, id int64, publicar bool, ahora time.Time) error {
	var tag pgconn.CommandTag
	var err error
	if publicar {
		tag, err = s.pool.Exec(ctx, `UPDATE entrada SET estado='publicada', publicada_en=$2, actualizado_en=$2 WHERE id=$1`, id, ahora)
	} else {
		tag, err = s.pool.Exec(ctx, `UPDATE entrada SET estado='borrador', publicada_en=NULL, actualizado_en=$2 WHERE id=$1`, id, ahora)
	}
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

func (s *Store) EliminarEntrada(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM entrada WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

func (s *Store) ExisteSlug(ctx context.Context, tabla, slug string, excluirID int64) (bool, error) {
	// La tabla viene del servicio (dos valores fijos), nunca de la petición.
	if tabla != "experiencia" && tabla != "entrada" {
		return false, errors.New("sitio: tabla no válida")
	}
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+tabla+` WHERE slug = $1 AND id <> $2)`, slug, excluirID).Scan(&ok)
	return ok, err
}

// ------------------------------------------------------------------ páginas

func (s *Store) ObtenerPagina(ctx context.Context, clave string) (sitio.Pagina, error) {
	var p sitio.Pagina
	var tipo, archivo, desc *string
	var ancho, alto *int
	err := s.pool.QueryRow(ctx, `
		SELECT p.clave, p.titulo, p.cuerpo, p.medio_id, p.actualizada_en, m.tipo, m.archivo, m.descripcion, m.ancho, m.alto
		FROM pagina p LEFT JOIN medio m ON m.id = p.medio_id WHERE p.clave = $1`, clave).
		Scan(&p.Clave, &p.Titulo, &p.Cuerpo, &p.MedioID, &p.ActualizadaEn, &tipo, &archivo, &desc, &ancho, &alto)
	p.Medio = medioRef(p.MedioID, tipo, archivo, desc, ancho, alto)
	return p, noHay(err)
}

func (s *Store) GuardarPagina(ctx context.Context, clave string, in sitio.PaginaInput) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE pagina SET titulo=$2, cuerpo=$3, medio_id=$4, actualizada_en=now() WHERE clave = $1`,
		clave, in.Titulo, in.Cuerpo, in.MedioID)
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

// ------------------------------------------------------------------ galerías

func (s *Store) ObtenerGaleria(ctx context.Context, entidad string, id int64) ([]sitio.MedioRef, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT m.id, m.tipo, m.archivo, m.descripcion, m.ancho, m.alto
		FROM galeria g JOIN medio m ON m.id = g.medio_id
		WHERE g.entidad = $1 AND g.entidad_id = $2 ORDER BY g.orden, g.id`, entidad, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []sitio.MedioRef{}
	for rows.Next() {
		var m sitio.MedioRef
		var archivo string
		if err := rows.Scan(&m.ID, &m.Tipo, &archivo, &m.Descripcion, &m.Ancho, &m.Alto); err != nil {
			return nil, err
		}
		m.URL = sitio.PrefijoURL + archivo
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) GuardarGaleria(ctx context.Context, entidad string, id int64, medioIDs []int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op tras Commit

	if _, err := tx.Exec(ctx, `DELETE FROM galeria WHERE entidad = $1 AND entidad_id = $2`, entidad, id); err != nil {
		return err
	}
	if len(medioIDs) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO galeria (entidad, entidad_id, medio_id, orden)
			SELECT $1, $2, m, o FROM unnest($3::bigint[]) WITH ORDINALITY AS t(m, o)`, entidad, id, medioIDs); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) ExisteEntidad(ctx context.Context, entidad string, id int64) (bool, error) {
	tabla := "sede"
	if entidad == sitio.EntidadTipo {
		tabla = "tipo_habitacion"
	}
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+tabla+` WHERE id = $1)`, id).Scan(&ok)
	return ok, err
}

func (s *Store) Destinos(ctx context.Context) ([]sitio.Destino, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT 'sede', id, nombre, ciudad, 0, nombre FROM sede
		UNION ALL
		SELECT 'tipo_habitacion', t.id, t.nombre, s.nombre, 1, s.nombre FROM tipo_habitacion t JOIN sede s ON s.id = t.sede_id
		ORDER BY 6, 5, 3`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []sitio.Destino{}
	for rows.Next() {
		var d sitio.Destino
		var ord int
		var orden string
		if err := rows.Scan(&d.Entidad, &d.ID, &d.Nombre, &d.Detalle, &ord, &orden); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ------------------------------------------------------------------ mensajes

func (s *Store) CrearMensaje(ctx context.Context, in sitio.MensajeInput) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO mensaje_contacto (nombre, email, telefono, asunto, mensaje) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		in.Nombre, in.Email, in.Telefono, in.Asunto, in.Mensaje).Scan(&id)
	return id, err
}

func (s *Store) ListarMensajes(ctx context.Context, estado sitio.EstadoMensaje) ([]sitio.Mensaje, error) {
	q, args := `SELECT id, nombre, email, telefono, asunto, mensaje, estado, creado_en FROM mensaje_contacto`, []any{}
	if estado != "" {
		q += ` WHERE estado = $1`
		args = append(args, string(estado))
	}
	rows, err := s.pool.Query(ctx, q+` ORDER BY creado_en DESC, id DESC LIMIT 500`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []sitio.Mensaje{}
	for rows.Next() {
		var m sitio.Mensaje
		var e string
		if err := rows.Scan(&m.ID, &m.Nombre, &m.Email, &m.Telefono, &m.Asunto, &m.Mensaje, &e, &m.CreadoEn); err != nil {
			return nil, err
		}
		m.Estado = sitio.EstadoMensaje(e)
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) CambiarEstadoMensaje(ctx context.Context, id int64, estado sitio.EstadoMensaje) error {
	tag, err := s.pool.Exec(ctx, `UPDATE mensaje_contacto SET estado = $2 WHERE id = $1`, id, string(estado))
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}

func (s *Store) EliminarMensaje(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM mensaje_contacto WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return sitio.ErrNoEncontrado
	}
	return err
}
