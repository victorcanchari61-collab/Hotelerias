// Package auditoria es la bitácora: quién cambió qué y cuándo.
//
// Los demás módulos la usan a través de Registrador (una interfaz de una sola
// operación); este paquete además sirve la pantalla de consulta.
package auditoria

import (
	"context"
	"errors"
	"log"
	"reflect"
	"time"

	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

type Accion string

const (
	Creado      Accion = "CREADO"
	Actualizado Accion = "ACTUALIZADO"
	Eliminado   Accion = "ELIMINADO"
)

// Evento es un cambio a registrar. Antes y Despues los arma quien registra, a
// mano y campo por campo: así NUNCA viaja una clave ni un hash por descuido.
type Evento struct {
	// UsuarioID es quién lo hizo; 0 si no fue una persona (arranque, siembra).
	UsuarioID int64
	Entidad   string
	EntidadID string
	Accion    Accion
	Antes     map[string]any
	Despues   map[string]any
}

// Registrador es lo único que los otros módulos necesitan de la bitácora.
//
// No devuelve error a propósito: una bitácora que falla no debe tumbar la
// operación que ya se hizo (no se puede deshacer desde aquí). El fallo se
// registra en el log del servidor, que es donde alguien lo va a mirar.
type Registrador interface {
	Registrar(ctx context.Context, e Evento)
}

// Nop descarta los eventos: para pruebas y para módulos sin bitácora.
type Nop struct{}

func (Nop) Registrar(context.Context, Evento) {}

// Diferencia deja en cada mapa solo las claves que cambiaron: en una edición se
// muestra lo que se tocó, no el registro entero repetido.
func Diferencia(antes, despues map[string]any) (map[string]any, map[string]any) {
	a, d := map[string]any{}, map[string]any{}
	for k, nuevo := range despues {
		previo, existia := antes[k]
		if existia && reflect.DeepEqual(previo, nuevo) {
			continue
		}
		d[k] = nuevo
		if existia {
			a[k] = previo
		}
	}
	return a, d
}

// Fila es una línea del listado.
type Fila struct {
	ID        int64     `json:"id"`
	Fecha     time.Time `json:"fecha"`
	UsuarioID *int64    `json:"usuarioId"`
	Usuario   string    `json:"usuario"`
	Entidad   string    `json:"entidad"`
	EntidadID string    `json:"entidadId"`
	Accion    Accion    `json:"accion"`
}

// Detalle es un registro con sus valores: lo que muestra "Ver cambios".
type Detalle struct {
	Fila
	ValoresAnteriores map[string]any `json:"valoresAnteriores"`
	ValoresNuevos     map[string]any `json:"valoresNuevos"`
}

// Filtro es lo que se puede pedir al listado.
type Filtro struct {
	Entidad   string
	Accion    Accion
	UsuarioID int64
	Desde     fecha.Fecha // inclusive
	Hasta     fecha.Fecha // inclusive
	Buscar    string
}

const (
	PorPaginaDefecto = 25
	PorPaginaMax     = 100
)

// Pagina es una página del listado.
type Pagina struct {
	Items     []Fila `json:"items"`
	Total     int    `json:"total"`
	Pagina    int    `json:"pagina"`
	PorPagina int    `json:"porPagina"`
}

type Resumen struct {
	Total       int        `json:"total"`
	Creados     int        `json:"creados"`
	Actualizado int        `json:"actualizados"`
	Eliminados  int        `json:"eliminados"`
	Ultimo      *time.Time `json:"ultimo"`
}

var ErrNoEncontrado = errors.New("auditoria: registro no encontrado")

// RetencionMinima es lo más reciente que NO se puede depurar. Una bitácora que
// se vacía justo después de un incidente no sirve.
const RetencionMinima = 30 * 24 * time.Hour

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	Insertar(ctx context.Context, e Evento) error
	Listar(ctx context.Context, f Filtro, pagina, porPagina int) ([]Fila, int, error)
	PorID(ctx context.Context, id int64) (Detalle, error)
	Resumen(ctx context.Context) (Resumen, error)
	Entidades(ctx context.Context) ([]string, error)
	// EliminarAnteriores borra lo anterior a `antes` y devuelve cuántos.
	EliminarAnteriores(ctx context.Context, antes time.Time) (int64, error)
}

// Servicio es la bitácora: escribe y consulta.
type Servicio struct {
	repo Repositorio
	now  func() time.Time
}

func NewServicio(repo Repositorio) *Servicio { return &Servicio{repo: repo, now: time.Now} }

// Registrar implementa Registrador.
func (s *Servicio) Registrar(ctx context.Context, e Evento) {
	// Contexto propio: si la petición ya se cerró, el registro igual se escribe.
	ctx = context.WithoutCancel(ctx)
	if err := s.repo.Insertar(ctx, e); err != nil {
		log.Printf("auditoria: no se pudo registrar %s %s/%s: %v", e.Accion, e.Entidad, e.EntidadID, err)
	}
}

func (s *Servicio) Listar(ctx context.Context, f Filtro, pagina, porPagina int) (Pagina, error) {
	if pagina < 1 {
		pagina = 1
	}
	if porPagina < 1 {
		porPagina = PorPaginaDefecto
	}
	if porPagina > PorPaginaMax {
		porPagina = PorPaginaMax
	}
	items, total, err := s.repo.Listar(ctx, f, pagina, porPagina)
	if err != nil {
		return Pagina{}, err
	}
	if items == nil {
		items = []Fila{}
	}
	return Pagina{Items: items, Total: total, Pagina: pagina, PorPagina: porPagina}, nil
}

func (s *Servicio) PorID(ctx context.Context, id int64) (Detalle, error) {
	return s.repo.PorID(ctx, id)
}
func (s *Servicio) Resumen(ctx context.Context) (Resumen, error) { return s.repo.Resumen(ctx) }
func (s *Servicio) Entidades(ctx context.Context) ([]string, error) {
	out, err := s.repo.Entidades(ctx)
	if out == nil {
		out = []string{}
	}
	return out, err
}

// Depurar borra lo anterior al día `hasta` (exclusive) y deja UN registro que
// dice qué se depuró. El registro va DESPUÉS del borrado: si fuera antes, el
// propio borrado se lo llevaría.
func (s *Servicio) Depurar(ctx context.Context, hasta fecha.Fecha, actor int64) (int64, error) {
	if hasta.IsZero() {
		return 0, httpx.Validacion("Indica hasta qué fecha se depura")
	}
	limite := s.now().Add(-RetencionMinima)
	if hasta.Time().After(limite) {
		return 0, httpx.Validacion("No se depura lo de los últimos 30 días")
	}

	n, err := s.repo.EliminarAnteriores(ctx, hasta.Time())
	if err != nil {
		return 0, err
	}
	if n > 0 {
		s.Registrar(ctx, Evento{
			UsuarioID: actor,
			Entidad:   "Auditoria",
			EntidadID: "depuración",
			Accion:    Eliminado,
			Antes: map[string]any{
				"Registros eliminados": n,
				"Anteriores a":         hasta.String(),
			},
		})
	}
	return n, nil
}
