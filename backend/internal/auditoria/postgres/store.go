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

// donde arma el WHERE del filtro con parámetros numerados.
func donde(f auditoria.Filtro) (string, []any) {
	var cond []string
	var args []any
	add := func(sql string, v any) {
		args = append(args, v)
		cond = append(cond, strings.ReplaceAll(sql, "?", fmt.Sprintf("$%d", len(args))))
	}

	if f.Entidad != "" {
		add("a.entidad = ?", f.Entidad)
	}
	if f.Accion != "" {
		add("a.accion = ?", string(f.Accion))
	}
	if f.UsuarioID != 0 {
		add("a.usuario_id = ?", f.UsuarioID)
	}
	if !f.Desde.IsZero() {
		add("a.fecha >= ?", f.Desde.Time())
	}
	if !f.Hasta.IsZero() {
		// Inclusive: hasta el final de ese día.
		add("a.fecha < ?", f.Hasta.Mas(1).Time())
	}
	if b := strings.TrimSpace(f.Buscar); b != "" {
		// Un solo patrón que sirve para las cuatro columnas.
		args = append(args, "%"+escaparLike(b)+"%")
		n := len(args)
		cond = append(cond, fmt.Sprintf(
			"(a.entidad ILIKE $%d OR a.entidad_id ILIKE $%d OR u.nombre ILIKE $%d OR u.apellido ILIKE $%d)", n, n, n, n))
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

func (s *Store) Listar(ctx context.Context, f auditoria.Filtro, pagina, porPagina int) ([]auditoria.Fila, int, error) {
	where, args := donde(f)
	const desde = ` FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id`

	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*)`+desde+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, porPagina, (pagina-1)*porPagina)
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT a.id, a.fecha, a.usuario_id, btrim(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')),
		       a.entidad, a.entidad_id, a.accion`+desde+where+`
		ORDER BY a.fecha DESC, a.id DESC
		LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []auditoria.Fila
	for rows.Next() {
		var f auditoria.Fila
		var accion string
		if err := rows.Scan(&f.ID, &f.Fecha, &f.UsuarioID, &f.Usuario, &f.Entidad, &f.EntidadID, &accion); err != nil {
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

func (s *Store) EliminarAnteriores(ctx context.Context, antes time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM auditoria WHERE fecha < $1`, antes)
	return tag.RowsAffected(), err
}
