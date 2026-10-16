// Package auditoria es la bitácora: quién cambió qué y cuándo.
//
// Los demás módulos la usan a través de Registrador (una interfaz de una sola
// operación); este paquete además sirve la pantalla de consulta.
package auditoria

import (
	"context"
	"errors"
	"fmt"
	"log"
	"reflect"
	"strings"
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
	// Campos es cuántos datos guardó el registro (las claves de sus valores).
	Campos int `json:"campos"`
}

// Detalle es un registro con sus valores: lo que muestra "Ver cambios".
type Detalle struct {
	Fila
	ValoresAnteriores map[string]any `json:"valoresAnteriores"`
	ValoresNuevos     map[string]any `json:"valoresNuevos"`
}

// Filtro es lo que se puede pedir al listado.
type Filtro struct {
	Entidad  string
	Accion   Accion
	Usuario  string      // contiene, sobre nombre y apellido
	Registro string      // contiene, sobre el id del registro
	Desde    fecha.Fecha // inclusive
	Hasta    fecha.Fecha // inclusive
	Buscar   string
}

// FiltroTabla es un filtro de columna tal como lo manda la tabla del frontend.
type FiltroTabla struct {
	Columna    string `json:"columna"`
	Operador   string `json:"operador"`
	Valor      string `json:"valor"`
	ValorHasta string `json:"valorHasta"`
}

// Consulta es lo que la tabla (SysDataTable en modo servidor) pide: el espejo de
// su estado. Se acota aquí y no se confía en lo que llegue: columnas y orden
// salen de una lista cerrada, así nada del cliente llega a la consulta SQL.
type Consulta struct {
	Pagina    int           `json:"pagina"`
	PorPagina int           `json:"porPagina"`
	Buscar    string        `json:"buscar"`
	Orden     string        `json:"orden"`
	Sentido   string        `json:"sentido"`
	Filtros   []FiltroTabla `json:"filtros"`
}

// Orden es por qué columna y en qué sentido se ordena. Por defecto, lo más
// nuevo primero: así se lee una bitácora.
type Orden struct {
	Columna string // fecha | usuario | entidad | entidadId | accion
	Desc    bool
}

var columnasOrden = map[string]bool{"fecha": true, "usuario": true, "entidad": true, "entidadId": true, "accion": true}

func (c Consulta) orden() Orden {
	col := c.Orden
	if !columnasOrden[col] {
		col = "fecha"
	}
	return Orden{Columna: col, Desc: !strings.EqualFold(c.Sentido, "asc")}
}

// valor devuelve el valor del primer filtro de esa columna (o "").
func (c Consulta) valor(columna string) (FiltroTabla, bool) {
	for _, f := range c.Filtros {
		if f.Columna == columna && strings.TrimSpace(f.Valor) != "" {
			return f, true
		}
	}
	return FiltroTabla{}, false
}

// AFiltro traduce los filtros de la tabla a los de la bitácora. Una columna que
// no existe se ignora (no es un error: la tabla puede tener columnas que la
// bitácora no filtra); una fecha mal escrita sí lo es.
func (c Consulta) AFiltro() (Filtro, error) {
	f := Filtro{Buscar: c.Buscar}

	if x, ok := c.valor("entidad"); ok {
		f.Entidad = strings.TrimSpace(x.Valor)
	}
	if x, ok := c.valor("accion"); ok {
		f.Accion = Accion(strings.ToUpper(strings.TrimSpace(x.Valor)))
	}
	if x, ok := c.valor("usuario"); ok {
		f.Usuario = strings.TrimSpace(x.Valor)
	}
	if x, ok := c.valor("entidadId"); ok {
		f.Registro = strings.TrimSpace(x.Valor)
	}
	if x, ok := c.valor("fecha"); ok {
		desde, err := fecha.Parse(strings.TrimSpace(x.Valor))
		if err != nil {
			return Filtro{}, httpx.Validacion("La fecha del filtro no es válida")
		}
		f.Desde, f.Hasta = desde, desde
		if h := strings.TrimSpace(x.ValorHasta); h != "" {
			hasta, err := fecha.Parse(h)
			if err != nil {
				return Filtro{}, httpx.Validacion("La fecha del filtro no es válida")
			}
			f.Hasta = hasta
		}
	}
	return f, nil
}

const (
	PorPaginaDefecto = 25
	PorPaginaMax     = 200
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
	Listar(ctx context.Context, f Filtro, o Orden, pagina, porPagina int) ([]Fila, int, error)
	PorID(ctx context.Context, id int64) (Detalle, error)
	Resumen(ctx context.Context) (Resumen, error)
	Entidades(ctx context.Context) ([]string, error)
	// Eliminar borra lo que casa con el filtro Y es anterior a `antes`, y devuelve cuántos.
	Eliminar(ctx context.Context, f Filtro, antes time.Time) (int64, error)
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

// Listar devuelve la página que pide la tabla.
func (s *Servicio) Listar(ctx context.Context, c Consulta) (Pagina, error) {
	f, err := c.AFiltro()
	if err != nil {
		return Pagina{}, err
	}
	pagina, porPagina := c.Pagina, c.PorPagina
	if pagina < 1 {
		pagina = 1
	}
	if porPagina < 1 {
		porPagina = PorPaginaDefecto
	}
	if porPagina > PorPaginaMax {
		porPagina = PorPaginaMax
	}

	items, total, err := s.repo.Listar(ctx, f, c.orden(), pagina, porPagina)
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

// Depurar borra lo que la tabla tiene a la vista (el buscador y los filtros de
// la consulta): borra EXACTAMENTE lo que la persona estaba viendo. Nunca toca
// lo de los últimos 30 días, aunque esté a la vista: una bitácora que se vacía
// justo después de un incidente no sirve.
//
// Deja UN registro que dice qué se depuró. Va DESPUÉS del borrado: si fuera
// antes, el propio borrado se lo llevaría.
func (s *Servicio) Depurar(ctx context.Context, c Consulta, actor int64) (int64, error) {
	f, err := c.AFiltro()
	if err != nil {
		return 0, err
	}

	n, err := s.repo.Eliminar(ctx, f, s.now().Add(-RetencionMinima))
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
				"Búsqueda":             strings.TrimSpace(c.Buscar),
				"Filtros":              describirFiltros(c),
			},
		})
	}
	return n, nil
}

// describirFiltros deja los filtros puestos en una línea legible.
func describirFiltros(c Consulta) string {
	var partes []string
	for _, f := range c.Filtros {
		if strings.TrimSpace(f.Valor) == "" {
			continue
		}
		if h := strings.TrimSpace(f.ValorHasta); h != "" {
			partes = append(partes, fmt.Sprintf("%s: %s → %s", f.Columna, f.Valor, h))
		} else {
			partes = append(partes, fmt.Sprintf("%s: %s", f.Columna, f.Valor))
		}
	}
	if len(partes) == 0 {
		return "Ninguno"
	}
	return strings.Join(partes, " · ")
}
