// Package postgres implementa auditoria.Repositorio sobre pgx.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/auditoria"
)

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func jsonONil(m map[string]any) ([]byte, error) {
	if m == nil {
		return nil, nil
	}
	return json.Marshal(m)
}

func (s *Store) Insertar(ctx context.Context, e auditoria.Evento) error {
	antes, err := jsonONil(e.Antes)
	if err != nil {
		return err
	}
	despues, err := jsonONil(e.Despues)
	if err != nil {
		return err
	}
	var usuario *int64
	if e.UsuarioID != 0 {
		usuario = &e.UsuarioID
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, valores_anteriores, valores_nuevos)
		VALUES ($1, $2, $3, $4, $5, $6)`,
		usuario, e.Entidad, e.EntidadID, string(e.Accion), antes, despues)
	return err
}

// donde arma el WHERE del filtro con parámetros numerados. Nada del cliente
// entra al SQL como texto: solo como parámetros.
func donde(f auditoria.Filtro) (string, []any) {
	var cond []string
	var args []any
	param := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	if f.Entidad != "" {
		cond = append(cond, "a.entidad = "+param(f.Entidad))
	}
	if f.Accion != "" {
		cond = append(cond, "a.accion = "+param(string(f.Accion)))
	}
	if f.Usuario != "" {
		p := param("%" + escaparLike(f.Usuario) + "%")
		cond = append(cond, fmt.Sprintf("(u.nombre ILIKE %s OR u.apellido ILIKE %s)", p, p))
	}
	if f.Registro != "" {
		cond = append(cond, "a.entidad_id ILIKE "+param("%"+escaparLike(f.Registro)+"%"))
	}
	if !f.Desde.IsZero() {
		cond = append(cond, "a.fecha >= "+param(f.Desde.Time()))
	}
	if !f.Hasta.IsZero() {
		// Inclusive: hasta el final de ese día.
		cond = append(cond, "a.fecha < "+param(f.Hasta.Mas(1).Time()))
	}
	if b := strings.TrimSpace(f.Buscar); b != "" {
		// Un solo patrón que sirve para las columnas de texto. Los valores
		// viejo/nuevo quedan fuera a propósito: son JSON y buscar dentro sería
		// un escaneo completo.
		p := param("%" + escaparLike(b) + "%")
		cond = append(cond, fmt.Sprintf(
			"(a.entidad ILIKE %s OR a.entidad_id ILIKE %s OR a.accion ILIKE %s OR u.nombre ILIKE %s OR u.apellido ILIKE %s)",
			p, p, p, p, p))
	}

	if len(cond) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(cond, " AND "), args
}

// escaparLike evita que % y _ del buscador actúen como comodines.
func escaparLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// ordenSQL traduce la columna (de una lista cerrada) a su expresión. El
// desempate por id es lo que hace estable la paginación.
func ordenSQL(o auditoria.Orden) string {
	col := map[string]string{
		"fecha":     "a.fecha",
		"usuario":   "btrim(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,''))",
		"entidad":   "a.entidad",
		"entidadId": "a.entidad_id",
		"accion":    "a.accion",
	}[o.Columna]
	if col == "" {
		col = "a.fecha"
	}
	sentido := "ASC"
	if o.Desc {
		sentido = "DESC"
	}
	return fmt.Sprintf(" ORDER BY %s %s, a.id %s", col, sentido, sentido)
}

func (s *Store) Listar(ctx context.Context, f auditoria.Filtro, o auditoria.Orden, pagina, porPagina int) ([]auditoria.Fila, int, error) {
	where, args := donde(f)
	const desde = ` FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id`

	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*)`+desde+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, porPagina, (pagina-1)*porPagina)
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT a.id, a.fecha, a.usuario_id, btrim(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')),
		       a.entidad, a.entidad_id, a.accion,
		       (SELECT count(*) FROM jsonb_object_keys(COALESCE(a.valores_nuevos, a.valores_anteriores, '{}'::jsonb)))`+
		desde+where+ordenSQL(o)+`
		LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []auditoria.Fila
	for rows.Next() {
		var f auditoria.Fila
		var accion string
		if err := rows.Scan(&f.ID, &f.Fecha, &f.UsuarioID, &f.Usuario, &f.Entidad, &f.EntidadID, &accion, &f.Campos); err != nil {
			return nil, 0, err
		}
		f.Accion = auditoria.Accion(accion)
		if f.Usuario == "" {
			f.Usuario = "Sistema"
		}
		out = append(out, f)
	}
	return out, total, rows.Err()
}

func (s *Store) PorID(ctx context.Context, id int64) (auditoria.Detalle, error) {
	var d auditoria.Detalle
	var accion string
	var antes, despues []byte
	err := s.pool.QueryRow(ctx, `
		SELECT a.id, a.fecha, a.usuario_id, btrim(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')),
		       a.entidad, a.entidad_id, a.accion, a.valores_anteriores, a.valores_nuevos
		FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id
		WHERE a.id = $1`, id).
		Scan(&d.ID, &d.Fecha, &d.UsuarioID, &d.Usuario, &d.Entidad, &d.EntidadID, &accion, &antes, &despues)
	if errors.Is(err, pgx.ErrNoRows) {
		return auditoria.Detalle{}, auditoria.ErrNoEncontrado
	}
	if err != nil {
		return auditoria.Detalle{}, err
	}
	d.Accion = auditoria.Accion(accion)
	if d.Usuario == "" {
		d.Usuario = "Sistema"
	}
	if len(antes) > 0 {
		_ = json.Unmarshal(antes, &d.ValoresAnteriores)
	}
	if len(despues) > 0 {
		_ = json.Unmarshal(despues, &d.ValoresNuevos)
	}
	return d, nil
}

func (s *Store) Resumen(ctx context.Context) (auditoria.Resumen, error) {
	var r auditoria.Resumen
	err := s.pool.QueryRow(ctx, `
		SELECT count(*),
		       count(*) FILTER (WHERE accion = 'CREADO'),
		       count(*) FILTER (WHERE accion = 'ACTUALIZADO'),
		       count(*) FILTER (WHERE accion = 'ELIMINADO'),
		       max(fecha)
		FROM auditoria`).Scan(&r.Total, &r.Creados, &r.Actualizado, &r.Eliminados, &r.Ultimo)
	return r, err
}

func (s *Store) Entidades(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT entidad FROM auditoria ORDER BY entidad`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var e string
		if err := rows.Scan(&e); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Eliminar borra lo que casa con el filtro y es anterior a `antes`. Es el mismo
// WHERE del listado: borra exactamente lo que se estaba viendo.
func (s *Store) Eliminar(ctx context.Context, f auditoria.Filtro, antes time.Time) (int64, error) {
	where, args := donde(f)
	args = append(args, antes)
	conector := " WHERE "
	if where != "" {
		conector = " AND "
	}
	tag, err := s.pool.Exec(ctx, fmt.Sprintf(`
		DELETE FROM auditoria WHERE id IN (
			SELECT a.id FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id%s%s a.fecha < $%d)`,
		where, conector, len(args)), args...)
	return tag.RowsAffected(), err
}
