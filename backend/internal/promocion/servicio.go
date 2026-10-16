package promocion

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

var (
	ErrNoEncontrada = errors.New("promocion: no encontrada")
	ErrCodigoUsado  = errors.New("promocion: ya existe una oferta con ese código")
	// ErrReferencia es una sede o un tipo de cliente que no existe.
	ErrReferencia = errors.New("promocion: la sede o el tipo de cliente no existe")
)

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	Listar(ctx context.Context) ([]Promocion, error)
	Obtener(ctx context.Context, id int64) (Promocion, error)
	Crear(ctx context.Context, p Promocion) (Promocion, error)
	Actualizar(ctx context.Context, p Promocion) (Promocion, error)
}

// Validar comprueba una promoción antes de guardarla y la normaliza. Los CHECK
// de la base son la red de seguridad; esto da el mensaje que el personal lee.
func Validar(p *Promocion) error {
	p.Nombre = strings.TrimSpace(p.Nombre)
	p.Descripcion = strings.TrimSpace(p.Descripcion)
	if p.Codigo != nil {
		c := strings.ToUpper(strings.TrimSpace(*p.Codigo))
		if c == "" {
			p.Codigo = nil // "" = sin código, no un código vacío que nadie puede escribir
		} else {
			p.Codigo = &c
		}
	}

	switch {
	case p.Nombre == "":
		return httpx.Validacion("Ponle un nombre a la oferta")
	case p.Desde.IsZero() || p.Hasta.IsZero():
		return httpx.Validacion("Indica desde y hasta qué fechas de estadía vale")
	case p.Hasta.Antes(p.Desde):
		return httpx.Validacion("La fecha final no puede ser anterior a la inicial")
	case p.MinNoches < 1:
		return httpx.Validacion("El mínimo de noches es 1")
	}

	switch p.Tipo {
	case Porcentaje:
		if p.Porcentaje == nil || *p.Porcentaje < 1 || *p.Porcentaje > 100 {
			return httpx.Validacion("El porcentaje debe estar entre 1 y 100")
		}
		p.MontoNocheCent = nil
	case MontoNoche:
		if p.MontoNocheCent == nil || *p.MontoNocheCent <= 0 {
			return httpx.Validacion("El monto por noche debe ser mayor que cero")
		}
		p.Porcentaje = nil
	default:
		return httpx.Validacion(fmt.Sprintf("Tipo de oferta %q no válido (porcentaje o monto_noche)", p.Tipo))
	}
	return nil
}

// Servicio es el CRUD que usa el personal más lo que ve el huésped.
type Servicio struct {
	repo Repositorio
	hoy  func() fecha.Fecha
}

func NewServicio(repo Repositorio, hoy func() fecha.Fecha) *Servicio {
	return &Servicio{repo: repo, hoy: hoy}
}

func (s *Servicio) Listar(ctx context.Context) ([]Promocion, error) { return s.repo.Listar(ctx) }

func (s *Servicio) Crear(ctx context.Context, p Promocion) (Promocion, error) {
	if err := Validar(&p); err != nil {
		return Promocion{}, err
	}
	return s.repo.Crear(ctx, p)
}

func (s *Servicio) Actualizar(ctx context.Context, p Promocion) (Promocion, error) {
	if err := Validar(&p); err != nil {
		return Promocion{}, err
	}
	return s.repo.Actualizar(ctx, p)
}

// Vigentes son las ofertas que el motor debe considerar para una estadía: las
// activas cuya ventana no terminó. No filtra por sede/tipo/código: eso es de
// Aplica, que es la regla.
func (s *Servicio) Vigentes(ctx context.Context) ([]Promocion, error) {
	todas, err := s.repo.Listar(ctx)
	if err != nil {
		return nil, err
	}
	hoy := s.hoy()
	out := make([]Promocion, 0, len(todas))
	for _, p := range todas {
		if p.Activo && !p.Hasta.Antes(hoy) {
			out = append(out, p)
		}
	}
	return out, nil
}

// Publicas son las que se muestran en la web: vigentes, SIN código (un código es
// un secreto que se reparte aparte) y abiertas a todos o al tipo del huésped.
func (s *Servicio) Publicas(ctx context.Context, tipoClienteID *int64) ([]Promocion, error) {
	vigentes, err := s.Vigentes(ctx)
	if err != nil {
		return nil, err
	}
	out := []Promocion{}
	for _, p := range vigentes {
		if p.Codigo != nil {
			continue
		}
		if p.TipoClienteID != nil && (tipoClienteID == nil || *p.TipoClienteID != *tipoClienteID) {
			continue
		}
		out = append(out, p)
	}
	return out, nil
}
