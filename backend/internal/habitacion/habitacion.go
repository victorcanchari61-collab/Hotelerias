// Package habitacion es el inventario de habitaciones físicas de cada hotel: la
// 101, la 102… con su tipo, su piso y su estado del día.
//
// Hasta ahora el hotel solo sabía "hay 12 Deluxe". Con habitaciones reales se
// puede asignar una a cada huésped (check-in), saber cuál está sucia o en
// mantenimiento y programar la limpieza. La disponibilidad de la web sigue
// leyendo `tipo_habitacion.cantidad`, que ahora sale de aquí: es cuántas
// habitaciones ACTIVAS tiene el tipo (la mantiene un disparador de la base).
//
// Estado activo y estado operativo son cosas distintas:
//   - activa: forma parte del inventario que se vende. Desactivar una la quita de
//     la venta y exige que no deje a una reserva sin habitación.
//   - estado: limpia / sucia / mantenimiento (y ocupada, que pondrá el check-in).
//     Es transitorio: una habitación sucia hoy se vende mañana, así que NO
//     reduce lo que se puede reservar para fechas futuras.
package habitacion

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

var (
	ErrNoEncontrada = errors.New("habitación: no encontrada")
	// ErrNumeroRepetido: ya hay una habitación con ese número en el hotel.
	ErrNumeroRepetido = errors.New("habitación: número repetido")
)

// ErrCupoComprometido es lo que pasa al quitar una habitación del inventario
// cuando hay reservas que ya la necesitan: quedarían más reservas simultáneas
// que habitaciones.
type ErrCupoComprometido struct {
	Reservas int // máximo de reservas simultáneas del tipo desde hoy
	Quedan   int // habitaciones activas que quedarían
}

func (e ErrCupoComprometido) Error() string {
	return fmt.Sprintf("habitación: %d reservas simultáneas para %d habitaciones", e.Reservas, e.Quedan)
}

// ErrNumerosRepetidos lista los que ya existían al crear un lote.
type ErrNumerosRepetidos struct{ Numeros []string }

func (e ErrNumerosRepetidos) Error() string {
	return "habitación: números repetidos: " + strings.Join(e.Numeros, ", ")
}

type Estado string

const (
	Limpia        Estado = "limpia"
	Sucia         Estado = "sucia"
	Ocupada       Estado = "ocupada"
	Mantenimiento Estado = "mantenimiento"
)

// asignables son los estados que el personal puede poner a mano. 'ocupada' la
// pone el check-in y la quita el check-out.
var asignables = []Estado{Limpia, Sucia, Mantenimiento}

func (e Estado) asignable() bool {
	for _, a := range asignables {
		if a == e {
			return true
		}
	}
	return false
}

// MaxLote es cuántas habitaciones se pueden crear de una vez.
const MaxLote = 100

type Habitacion struct {
	ID               int64     `json:"id"`
	SedeID           int64     `json:"sedeId"`
	SedeNombre       string    `json:"sedeNombre"`
	TipoHabitacionID int64     `json:"tipoHabitacionId"`
	TipoNombre       string    `json:"tipoNombre"`
	Numero           string    `json:"numero"`
	Piso             int       `json:"piso"`
	Estado           Estado    `json:"estado"`
	Notas            string    `json:"notas"`
	Activa           bool      `json:"activa"`
	ActualizadoEn    time.Time `json:"actualizadoEn"`
}

// Input es lo que se envía al crear o editar. La sede sale del tipo: no se
// pide aparte para que no puedan contradecirse.
type Input struct {
	TipoHabitacionID int64  `json:"tipoHabitacionId"`
	Numero           string `json:"numero"`
	Piso             int    `json:"piso"`
	Notas            string `json:"notas"`
	Activa           bool   `json:"activa"`
}

// Lote crea varias habitaciones numeradas de corrido: del 101 al 110.
type Lote struct {
	TipoHabitacionID int64 `json:"tipoHabitacionId"`
	Piso             int   `json:"piso"`
	Desde            int   `json:"desde"`
	Hasta            int   `json:"hasta"`
}

// TipoRef es lo que se necesita saber de un tipo para colgarle habitaciones.
type TipoRef struct {
	ID         int64  `json:"id"`
	SedeID     int64  `json:"sedeId"`
	Nombre     string `json:"nombre"`
	SedeNombre string `json:"sedeNombre"`
	Activo     bool   `json:"activo"`
}

type SedeRef struct {
	ID     int64  `json:"id"`
	Nombre string `json:"nombre"`
}

// Opciones son las listas que arman los formularios.
type Opciones struct {
	Sedes []SedeRef `json:"sedes"`
	Tipos []TipoRef `json:"tipos"`
}

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	// Listar: sedeIDs nil = de todas las sedes; una lista (aunque vacía) limita a esas.
	Listar(ctx context.Context, sedeIDs []int64) ([]Habitacion, error)
	PorID(ctx context.Context, id int64) (Habitacion, error)
	Opciones(ctx context.Context, sedeIDs []int64) (Opciones, error)
	Tipo(ctx context.Context, id int64) (TipoRef, error)
	// Crear devuelve ErrNumeroRepetido si el número ya existe en el hotel.
	Crear(ctx context.Context, sedeID int64, in Input) (int64, error)
	// CrearLote crea todas o ninguna; ErrNumerosRepetidos si alguna ya existía.
	CrearLote(ctx context.Context, sedeID, tipoID int64, piso int, numeros []string) error
	// Actualizar guarda los datos y, EN LA MISMA TRANSACCIÓN, con el tipo
	// bloqueado, comprueba que las reservas vigentes sigan teniendo habitación
	// (ErrCupoComprometido). `desde` es hoy en el hotel.
	Actualizar(ctx context.Context, id int64, in Input, desde fecha.Fecha) error
	// CambiarEstado solo cambia si sigue en `desde`; false si ya cambió.
	CambiarEstado(ctx context.Context, id int64, desde, hacia Estado) (bool, error)
}

type Servicio struct {
	repo      Repositorio
	hoy       func() fecha.Fecha
	auditoria auditoria.Registrador
}

func NewServicio(repo Repositorio, hoy func() fecha.Fecha, aud auditoria.Registrador) *Servicio {
	return &Servicio{repo: repo, hoy: hoy, auditoria: aud}
}

// enAlcance dice si una sede está dentro de lo que la persona alcanza a ver (nil = todas).
func enAlcance(sedeIDs []int64, sedeID int64) bool {
	if sedeIDs == nil {
		return true
	}
	for _, id := range sedeIDs {
		if id == sedeID {
			return true
		}
	}
	return false
}

func (s *Servicio) Listar(ctx context.Context, sedeIDs []int64) ([]Habitacion, error) {
	return s.repo.Listar(ctx, sedeIDs)
}

func (s *Servicio) Opciones(ctx context.Context, sedeIDs []int64) (Opciones, error) {
	return s.repo.Opciones(ctx, sedeIDs)
}

var reNumero = regexp.MustCompile(`^[A-Z0-9][A-Z0-9 .\-]{0,9}$`)

func normalizar(in *Input) error {
	in.Numero = strings.ToUpper(strings.TrimSpace(in.Numero))
	in.Notas = strings.TrimSpace(in.Notas)
	switch {
	case in.TipoHabitacionID <= 0:
		return httpx.Validacion("Elige el tipo de habitación")
	case in.Numero == "":
		return httpx.Validacion("Indica el número de la habitación")
	case !reNumero.MatchString(in.Numero):
		return httpx.Validacion("El número solo puede llevar letras, dígitos, guion o punto (hasta 10 caracteres)")
	case in.Piso < -5 || in.Piso > 100:
		return httpx.Validacion("El piso debe estar entre -5 y 100")
	case len([]rune(in.Notas)) > 300:
		return httpx.Validacion("Las notas no pueden pasar de 300 caracteres")
	}
	return nil
}

// tipoDe carga el tipo y comprueba que se pueda usar y que la persona lo alcance.
func (s *Servicio) tipoDe(ctx context.Context, tipoID int64, sedeIDs []int64) (TipoRef, error) {
	t, err := s.repo.Tipo(ctx, tipoID)
	if err != nil {
		if errors.Is(err, ErrNoEncontrada) {
			return TipoRef{}, httpx.Validacion("Ese tipo de habitación no existe")
		}
		return TipoRef{}, err
	}
	// Un tipo de otro hotel responde como inexistente: no se revela que existe.
	if !enAlcance(sedeIDs, t.SedeID) {
		return TipoRef{}, httpx.Validacion("Ese tipo de habitación no existe")
	}
	return t, nil
}

func campos(h Habitacion) map[string]any {
	return map[string]any{
		"hotel": h.SedeNombre, "número": h.Numero, "tipo": h.TipoNombre, "piso": h.Piso,
		"estado": string(h.Estado), "notas": h.Notas, "activa": h.Activa,
	}
}

func (s *Servicio) Crear(ctx context.Context, in Input, actor int64, sedeIDs []int64) (Habitacion, error) {
	if err := normalizar(&in); err != nil {
		return Habitacion{}, err
	}
	tipo, err := s.tipoDe(ctx, in.TipoHabitacionID, sedeIDs)
	if err != nil {
		return Habitacion{}, err
	}
	if !tipo.Activo {
		return Habitacion{}, httpx.Validacion("Ese tipo de habitación está desactivado")
	}

	id, err := s.repo.Crear(ctx, tipo.SedeID, in)
	if errors.Is(err, ErrNumeroRepetido) {
		return Habitacion{}, httpx.Conflicto(fmt.Sprintf("Ya existe la habitación %s en %s", in.Numero, tipo.SedeNombre))
	}
	if err != nil {
		return Habitacion{}, err
	}
	creada, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Habitacion{}, err
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Habitacion", EntidadID: fmt.Sprint(id), Accion: auditoria.Creado,
		Despues: campos(creada),
	})
	return creada, nil
}

// CrearLote crea las habitaciones desde-hasta (por ejemplo 101 a 110) de un tipo.
func (s *Servicio) CrearLote(ctx context.Context, l Lote, actor int64, sedeIDs []int64) (int, error) {
	switch {
	case l.TipoHabitacionID <= 0:
		return 0, httpx.Validacion("Elige el tipo de habitación")
	case l.Desde < 1 || l.Hasta < 1 || l.Hasta > 9999:
		return 0, httpx.Validacion("El rango de números debe estar entre 1 y 9999")
	case l.Hasta < l.Desde:
		return 0, httpx.Validacion("«Hasta» no puede ser menor que «Desde»")
	case l.Hasta-l.Desde+1 > MaxLote:
		return 0, httpx.Validacion(fmt.Sprintf("Se pueden crear hasta %d habitaciones de una vez", MaxLote))
	case l.Piso < -5 || l.Piso > 100:
		return 0, httpx.Validacion("El piso debe estar entre -5 y 100")
	}
	tipo, err := s.tipoDe(ctx, l.TipoHabitacionID, sedeIDs)
	if err != nil {
		return 0, err
	}
	if !tipo.Activo {
		return 0, httpx.Validacion("Ese tipo de habitación está desactivado")
	}

	numeros := make([]string, 0, l.Hasta-l.Desde+1)
	for n := l.Desde; n <= l.Hasta; n++ {
		numeros = append(numeros, strconv.Itoa(n))
	}
	err = s.repo.CrearLote(ctx, tipo.SedeID, tipo.ID, l.Piso, numeros)
	var rep ErrNumerosRepetidos
	if errors.As(err, &rep) {
		return 0, httpx.Conflicto(fmt.Sprintf("Ya existen en %s: %s. No se creó ninguna",
			tipo.SedeNombre, strings.Join(rep.Numeros, ", ")))
	}
	if errors.Is(err, ErrNumeroRepetido) {
		return 0, httpx.Conflicto("Alguien creó una de esas habitaciones al mismo tiempo. Inténtalo de nuevo")
	}
	if err != nil {
		return 0, err
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Habitacion", EntidadID: "lote", Accion: auditoria.Creado,
		Despues: map[string]any{
			"hotel": tipo.SedeNombre, "tipo": tipo.Nombre, "piso": l.Piso,
			"desde": l.Desde, "hasta": l.Hasta, "cantidad": len(numeros),
		},
	})
	return len(numeros), nil
}

func (s *Servicio) Actualizar(ctx context.Context, id int64, in Input, actor int64, sedeIDs []int64) (Habitacion, error) {
	if err := normalizar(&in); err != nil {
		return Habitacion{}, err
	}
	actual, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Habitacion{}, err
	}
	// Una habitación de otro hotel responde como inexistente.
	if !enAlcance(sedeIDs, actual.SedeID) {
		return Habitacion{}, ErrNoEncontrada
	}
	tipo, err := s.tipoDe(ctx, in.TipoHabitacionID, sedeIDs)
	if err != nil {
		return Habitacion{}, err
	}
	if tipo.SedeID != actual.SedeID {
		return Habitacion{}, httpx.Validacion("Una habitación no puede pasar a otro hotel")
	}
	if !tipo.Activo && tipo.ID != actual.TipoHabitacionID {
		return Habitacion{}, httpx.Validacion("Ese tipo de habitación está desactivado")
	}
	if actual.Estado == Ocupada && (!in.Activa || tipo.ID != actual.TipoHabitacionID) {
		return Habitacion{}, httpx.Conflicto("La habitación está ocupada: no se puede desactivar ni cambiar de tipo hasta el check-out")
	}

	err = s.repo.Actualizar(ctx, id, in, s.hoy())
	var cupo ErrCupoComprometido
	switch {
	case errors.Is(err, ErrNumeroRepetido):
		return Habitacion{}, httpx.Conflicto(fmt.Sprintf("Ya existe la habitación %s en %s", in.Numero, actual.SedeNombre))
	case errors.As(err, &cupo):
		return Habitacion{}, httpx.Conflicto(fmt.Sprintf(
			"Hay hasta %d reservas simultáneas de «%s» y quedarían %d habitaciones. Cancela o reubica reservas antes",
			cupo.Reservas, actual.TipoNombre, cupo.Quedan))
	case err != nil:
		return Habitacion{}, err
	}

	nueva, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Habitacion{}, err
	}
	antes, despues := auditoria.Diferencia(campos(actual), campos(nueva))
	if len(despues) > 0 {
		s.auditoria.Registrar(ctx, auditoria.Evento{
			UsuarioID: actor, Entidad: "Habitacion", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
			Antes: antes, Despues: despues,
		})
	}
	return nueva, nil
}

// CambiarEstado es el cambio rápido de estado (limpia / sucia / mantenimiento).
func (s *Servicio) CambiarEstado(ctx context.Context, id int64, estado Estado, actor int64, sedeIDs []int64) (Habitacion, error) {
	if !estado.asignable() {
		if estado == Ocupada {
			return Habitacion{}, httpx.Validacion("«Ocupada» la pone el check-in; no se asigna a mano")
		}
		return Habitacion{}, httpx.Validacion("Estado no válido")
	}
	actual, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Habitacion{}, err
	}
	if !enAlcance(sedeIDs, actual.SedeID) {
		return Habitacion{}, ErrNoEncontrada
	}
	switch {
	case actual.Estado == Ocupada:
		return Habitacion{}, httpx.Conflicto("La habitación está ocupada: se libera con el check-out")
	case !actual.Activa:
		return Habitacion{}, httpx.Conflicto("La habitación está desactivada. Actívala primero")
	case actual.Estado == estado:
		return actual, nil
	}

	ok, err := s.repo.CambiarEstado(ctx, id, actual.Estado, estado)
	if err != nil {
		return Habitacion{}, err
	}
	if !ok {
		return Habitacion{}, httpx.Conflicto("El estado de la habitación cambió mientras tanto. Recarga e inténtalo de nuevo")
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Habitacion", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
		Antes:   map[string]any{"estado": string(actual.Estado)},
		Despues: map[string]any{"estado": string(estado)},
	})
	actual.Estado = estado
	return s.repo.PorID(ctx, id)
}
