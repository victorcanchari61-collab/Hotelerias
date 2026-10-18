// Package parametro son los ajustes del sistema que el administrador cambia sin
// tocar código: cuántas noches se pueden reservar por la web, hasta cuándo se
// puede cancelar, a qué hora es el check-in…
//
// Las DEFINICIONES (qué parámetros existen, su tipo, sus límites y su valor por
// defecto) viven en código, como el catálogo de permisos: un parámetro nuevo es
// una línea aquí y alguien que lo lea. La base guarda solo los valores que se
// cambiaron; el resto usa el valor por defecto. Así una base vacía funciona y
// un valor borrado vuelve a un valor seguro.
package parametro

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/httpx"
)

// Las claves de los parámetros que otros módulos leen.
const (
	MaxNoches       = "reservas.max_noches"
	CancelacionDias = "reservas.cancelacion_dias"
	CheckinHora     = "hotel.checkin_hora"
	CheckoutHora    = "hotel.checkout_hora"
	CambioDiasAtras = "finanzas.cambio_dias_atras"
)

type Tipo string

const (
	Entero Tipo = "entero"
	Hora   Tipo = "hora"
)

// Definicion describe un parámetro. El valor siempre viaja y se guarda como TEXTO.
type Definicion struct {
	Clave       string `json:"clave"`
	Grupo       string `json:"grupo"`
	Etiqueta    string `json:"etiqueta"`
	Descripcion string `json:"descripcion"`
	Tipo        Tipo   `json:"tipo"`
	Defecto     string `json:"defecto"`
	// Min y Max solo cuentan para los enteros.
	Min    int    `json:"min"`
	Max    int    `json:"max"`
	Unidad string `json:"unidad"`
	// Publico: la web lo puede mostrar (un horario sí; un límite interno no).
	Publico bool `json:"publico"`
}

// Definiciones, en el orden en que se muestran.
var Definiciones = []Definicion{
	{
		Clave: MaxNoches, Grupo: "Reservas", Etiqueta: "Máximo de noches por reserva",
		Descripcion: "Largo máximo de una estadía reservada por la web. Más allá es un trato directo con el hotel.",
		Tipo:        Entero, Defecto: "30", Min: 1, Max: 365, Unidad: "noches",
	},
	{
		Clave: CancelacionDias, Grupo: "Reservas", Etiqueta: "Cancelación por la web",
		Descripcion: "Con cuántos días de anticipación a la entrada el huésped puede cancelar por la web. 0 = hasta el mismo día de la entrada.",
		Tipo:        Entero, Defecto: "1", Min: 0, Max: 30, Unidad: "días antes",
	},
	{
		Clave: CheckinHora, Grupo: "Horarios", Etiqueta: "Hora de check-in",
		Descripcion: "Desde cuándo se puede ingresar a la habitación. Se muestra en la web.",
		Tipo:        Hora, Defecto: "14:00", Publico: true,
	},
	{
		Clave: CheckoutHora, Grupo: "Horarios", Etiqueta: "Hora de check-out",
		Descripcion: "Hasta cuándo se debe dejar la habitación. Se muestra en la web.",
		Tipo:        Hora, Defecto: "12:00", Publico: true,
	},
	{
		Clave: CambioDiasAtras, Grupo: "Moneda", Etiqueta: "Antigüedad máxima del tipo de cambio",
		Descripcion: "Cuántos días atrás se acepta un tipo de cambio cuando hoy no hay uno (fines de semana y feriados). Pasado eso no se cotiza en dólares.",
		Tipo:        Entero, Defecto: "7", Min: 0, Max: 30, Unidad: "días",
	},
}

func definicion(clave string) (Definicion, bool) {
	for _, d := range Definiciones {
		if d.Clave == clave {
			return d, true
		}
	}
	return Definicion{}, false
}

var reHora = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// Validar comprueba un valor contra su definición y lo deja normalizado.
func (d Definicion) Validar(valor string) (string, error) {
	v := strings.TrimSpace(valor)
	switch d.Tipo {
	case Entero:
		// Solo dígitos: sin signo, sin decimales, sin espacios ni notación científica.
		n, err := strconv.Atoi(v)
		if err != nil || v == "" || strings.Trim(v, "0123456789") != "" {
			return "", httpx.Validacion(fmt.Sprintf("«%s» debe ser un número entero", d.Etiqueta))
		}
		if n < d.Min || n > d.Max {
			return "", httpx.Validacion(fmt.Sprintf("«%s» debe estar entre %d y %d", d.Etiqueta, d.Min, d.Max))
		}
		return strconv.Itoa(n), nil
	case Hora:
		if !reHora.MatchString(v) {
			return "", httpx.Validacion(fmt.Sprintf("«%s» debe ser una hora como 14:00", d.Etiqueta))
		}
		return v, nil
	}
	return "", httpx.Validacion("Tipo de parámetro desconocido")
}

// Guardado es un valor cambiado respecto del defecto.
type Guardado struct {
	Valor          string
	ActualizadoEn  time.Time
	ActualizadoPor string
}

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	Todos(ctx context.Context) (map[string]Guardado, error)
	// GuardarVarios guarda todos los valores o ninguno.
	GuardarVarios(ctx context.Context, valores map[string]string, actor int64) error
}

// Parametro es un parámetro con su valor vigente, listo para la pantalla.
type Parametro struct {
	Definicion
	Valor          string    `json:"valor"`
	Modificado     bool      `json:"modificado"`
	ActualizadoEn  time.Time `json:"actualizadoEn"`
	ActualizadoPor string    `json:"actualizadoPor"`
}

// ttl: cuánto vale lo leído de la base. Cambiar un parámetro limpia el caché de
// esta instancia al instante; el tiempo cubre el caso de otra instancia.
const ttl = 30 * time.Second

type Servicio struct {
	repo      Repositorio
	auditoria auditoria.Registrador
	ahora     func() time.Time

	mu      sync.RWMutex
	cache   map[string]Guardado
	cargado time.Time
}

func NewServicio(repo Repositorio, aud auditoria.Registrador) *Servicio {
	return &Servicio{repo: repo, auditoria: aud, ahora: time.Now}
}

func (s *Servicio) guardados(ctx context.Context) (map[string]Guardado, error) {
	s.mu.RLock()
	if s.cache != nil && s.ahora().Sub(s.cargado) < ttl {
		c := s.cache
		s.mu.RUnlock()
		return c, nil
	}
	s.mu.RUnlock()

	todos, err := s.repo.Todos(ctx)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.cache, s.cargado = todos, s.ahora()
	s.mu.Unlock()
	return todos, nil
}

func (s *Servicio) olvidar() {
	s.mu.Lock()
	s.cache = nil
	s.mu.Unlock()
}

// Listar devuelve todos los parámetros con su valor vigente.
func (s *Servicio) Listar(ctx context.Context) ([]Parametro, error) {
	guardados, err := s.guardados(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Parametro, 0, len(Definiciones))
	for _, d := range Definiciones {
		p := Parametro{Definicion: d, Valor: d.Defecto}
		if g, ok := guardados[d.Clave]; ok {
			p.Valor, p.Modificado = g.Valor, g.Valor != d.Defecto
			p.ActualizadoEn, p.ActualizadoPor = g.ActualizadoEn, g.ActualizadoPor
		}
		out = append(out, p)
	}
	return out, nil
}

// Valor es el valor vigente de un parámetro. Si no se puede leer la base o el
// valor guardado ya no es válido, devuelve el defecto: un fallo al leer un
// ajuste no debe impedir reservar.
func (s *Servicio) Valor(ctx context.Context, clave string) string {
	d, ok := definicion(clave)
	if !ok {
		panic("parametro: clave desconocida: " + clave)
	}
	guardados, err := s.guardados(ctx)
	if err != nil {
		return d.Defecto
	}
	if g, ok := guardados[clave]; ok {
		if v, err := d.Validar(g.Valor); err == nil {
			return v
		}
	}
	return d.Defecto
}

// Entero es el valor vigente de un parámetro entero.
func (s *Servicio) Entero(ctx context.Context, clave string) int {
	n, err := strconv.Atoi(s.Valor(ctx, clave))
	if err != nil {
		d, _ := definicion(clave)
		n, _ = strconv.Atoi(d.Defecto)
	}
	return n
}

// Publicos son los parámetros que la web puede mostrar, clave → valor.
func (s *Servicio) Publicos(ctx context.Context) map[string]string {
	out := map[string]string{}
	for _, d := range Definiciones {
		if d.Publico {
			out[d.Clave] = s.Valor(ctx, d.Clave)
		}
	}
	return out
}

// Guardar valida TODOS los valores y los guarda juntos o no guarda ninguno.
// Solo se escribe lo que cambió respecto de lo vigente.
func (s *Servicio) Guardar(ctx context.Context, entrada map[string]string, actor int64) ([]Parametro, error) {
	actuales, err := s.Listar(ctx)
	if err != nil {
		return nil, err
	}
	vigente := map[string]string{}
	for _, p := range actuales {
		vigente[p.Clave] = p.Valor
	}

	cambios := map[string]string{}
	antes, despues := map[string]any{}, map[string]any{}
	claves := make([]string, 0, len(entrada))
	for k := range entrada {
		claves = append(claves, k)
	}
	sort.Strings(claves)

	for _, clave := range claves {
		d, ok := definicion(clave)
		if !ok {
			return nil, httpx.Validacion("Ese parámetro no existe")
		}
		v, err := d.Validar(entrada[clave])
		if err != nil {
			return nil, err
		}
		if v == vigente[clave] {
			continue
		}
		cambios[clave] = v
		antes[d.Etiqueta], despues[d.Etiqueta] = vigente[clave], v
	}

	if len(cambios) == 0 {
		return actuales, nil
	}
	if err := s.repo.GuardarVarios(ctx, cambios, actor); err != nil {
		return nil, err
	}
	s.olvidar()

	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Parametro", EntidadID: "general", Accion: auditoria.Actualizado,
		Antes: antes, Despues: despues,
	})
	return s.Listar(ctx)
}
