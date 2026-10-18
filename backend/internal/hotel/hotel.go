// Package hotel es lo que ofrece la cadena: sus sedes, los tipos de habitación
// de cada una y qué hay disponible entre unas fechas.
package hotel

import (
	"context"
	"errors"
	"fmt"
	"time"

	"hotelerias/backend/internal/parametro"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

var ErrNoEncontrada = errors.New("hotel: no encontrado")

// Zona es la hora de la cadena. Perú no tiene horario de verano, así que una
// zona fija evita depender de la base de zonas horarias del sistema (Windows no
// la trae completa). "Hoy" para una reserva es el de aquí, no el del servidor.
var Zona = time.FixedZone("America/Lima", -5*60*60)

// Hoy es la fecha de hoy en el hotel.
func Hoy() fecha.Fecha { return fecha.Hoy(Zona) }

// MaxNoches es el largo máximo por defecto de una estadía por la web (se cambia
// en Configuración → Parámetros). Más allá es un trato directo con el hotel.
const MaxNoches = 30

// Sede es un hotel de la cadena.
type Sede struct {
	ID          int64    `json:"id"`
	Nombre      string   `json:"nombre"`
	Ciudad      string   `json:"ciudad"`
	Direccion   string   `json:"direccion"`
	Descripcion string   `json:"descripcion"`
	Estrellas   int      `json:"estrellas"`
	Imagen      string   `json:"imagen"`
	Servicios   []string `json:"servicios"`
	Activo      bool     `json:"activo"`
}

// TipoHabitacion es una categoría de habitación de una sede.
type TipoHabitacion struct {
	ID              int64    `json:"id"`
	SedeID          int64    `json:"sedeId"`
	Nombre          string   `json:"nombre"`
	Descripcion     string   `json:"descripcion"`
	Capacidad       int      `json:"capacidad"`
	Camas           string   `json:"camas"`
	AreaM2          int      `json:"areaM2"`
	PrecioNocheCent int64    `json:"precioNocheCent"`
	Cantidad        int      `json:"cantidad"`
	Amenidades      []string `json:"amenidades"`
	Imagen          string   `json:"imagen"`
	Activo          bool     `json:"activo"`
}

// Disponible es un tipo de habitación con cuántas quedan para unas fechas.
type Disponible struct {
	TipoHabitacion
	Disponibles int `json:"disponibles"`
}

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	Sedes(ctx context.Context) ([]Sede, error)
	Sede(ctx context.Context, id int64) (Sede, error)
	Tipos(ctx context.Context, sedeID int64) ([]TipoHabitacion, error)
	Tipo(ctx context.Context, id int64) (TipoHabitacion, error)
	// Ocupadas cuenta las reservas confirmadas que se cruzan con [desde, hasta).
	Ocupadas(ctx context.Context, tipoID int64, desde, hasta fecha.Fecha) (int, error)
}

// ValidarFechas comprueba que una estadía se pueda pedir: no en el pasado, con
// al menos una noche y sin pasarse de `maxNoches`. `hoy` es la fecha del HOTEL.
func ValidarFechas(hoy, entrada, salida fecha.Fecha, maxNoches int) error {
	switch {
	case entrada.IsZero() || salida.IsZero():
		return httpx.Validacion("Indica la fecha de entrada y la de salida")
	case entrada.Antes(hoy):
		return httpx.Validacion("La fecha de entrada no puede ser anterior a hoy")
	case !salida.Despues(entrada):
		return httpx.Validacion("La salida debe ser posterior a la entrada")
	case fecha.Noches(entrada, salida) > maxNoches:
		return httpx.Validacion(fmt.Sprintf("La estadía no puede pasar de %d noches", maxNoches))
	}
	return nil
}

// Parametros son los ajustes que el administrador cambia desde Configuración.
// Un servicio sin ellos (pruebas) usa los valores por defecto del código.
type Parametros interface {
	Entero(ctx context.Context, clave string) int
}

// MaxNochesDe es el máximo vigente: el parámetro, o el defecto si no hay parámetros.
func MaxNochesDe(ctx context.Context, p Parametros) int {
	if p == nil {
		return MaxNoches
	}
	return p.Entero(ctx, parametro.MaxNoches)
}

// Servicio responde lo que ve el visitante del portal.
type Servicio struct {
	repo   Repositorio
	hoy    func() fecha.Fecha
	params Parametros
}

// ConParametros hace que el máximo de noches salga de Configuración.
func (s *Servicio) ConParametros(p Parametros) *Servicio {
	s.params = p
	return s
}

func NewServicio(repo Repositorio, hoy func() fecha.Fecha) *Servicio {
	return &Servicio{repo: repo, hoy: hoy}
}

func (s *Servicio) Sedes(ctx context.Context) ([]Sede, error) { return s.repo.Sedes(ctx) }

func (s *Servicio) Sede(ctx context.Context, id int64) (Sede, []TipoHabitacion, error) {
	sede, err := s.repo.Sede(ctx, id)
	if err != nil {
		return Sede{}, nil, err
	}
	tipos, err := s.repo.Tipos(ctx, id)
	return sede, tipos, err
}

// Disponibilidad lista los tipos de habitación de una sede que caben `huespedes`
// personas, con cuántos quedan entre las fechas. Los agotados se devuelven con
// Disponibles = 0 (la web los muestra "agotado" en vez de esconderlos).
func (s *Servicio) Disponibilidad(ctx context.Context, sedeID int64, entrada, salida fecha.Fecha, huespedes int) ([]Disponible, error) {
	if err := ValidarFechas(s.hoy(), entrada, salida, MaxNochesDe(ctx, s.params)); err != nil {
		return nil, err
	}
	if huespedes < 1 {
		return nil, httpx.Validacion("Indica cuántos huéspedes son")
	}

	tipos, err := s.repo.Tipos(ctx, sedeID)
	if err != nil {
		return nil, err
	}

	out := make([]Disponible, 0, len(tipos))
	for _, t := range tipos {
		if t.Capacidad < huespedes {
			continue
		}
		ocupadas, err := s.repo.Ocupadas(ctx, t.ID, entrada, salida)
		if err != nil {
			return nil, err
		}
		libres := t.Cantidad - ocupadas
		if libres < 0 {
			libres = 0
		}
		out = append(out, Disponible{TipoHabitacion: t, Disponibles: libres})
	}
	return out, nil
}
