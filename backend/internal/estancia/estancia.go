// Package estancia es el check-in y el check-out: la reserva ya cumplida, con una
// habitación física asignada y la ficha de registro del huésped.
//
// Flujo:
//
//	reserva confirmada ──check-in──► estancia "en casa" (habitación → ocupada)
//	                    ◄─check-out─ estancia "finalizada" (habitación → sucia, reserva → completada)
//
// El check-out deja la habitación SUCIA, no limpia: housekeeping la libera.
package estancia

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

var (
	ErrNoEncontrada = errors.New("estancia: no encontrada")
	// ErrReservaNoConfirmada: la reserva está cancelada o ya completada.
	ErrReservaNoConfirmada = errors.New("estancia: la reserva no está confirmada")
	ErrYaRegistrada        = errors.New("estancia: la reserva ya tiene check-in")
	ErrYaFinalizada        = errors.New("estancia: ya se hizo el check-out")
)

// ErrFueraDeFechas: hoy no está dentro de la estadía reservada.
type ErrFueraDeFechas struct{ Entrada, Salida fecha.Fecha }

func (e ErrFueraDeFechas) Error() string { return "estancia: hoy fuera de la estadía" }

// ErrHabitacionNoApta explica por qué una habitación no se puede asignar.
type ErrHabitacionNoApta struct{ Motivo string }

func (e ErrHabitacionNoApta) Error() string { return "estancia: habitación no apta: " + e.Motivo }

type Fase string

const (
	Llegada Fase = "llegada" // reserva confirmada que todavía no hizo check-in
	EnCasa  Fase = "en_casa"
)

// Movimiento es una fila del panel de recepción: una llegada por atender o un huésped en casa.
type Movimiento struct {
	Fase             Fase        `json:"fase"`
	EstanciaID       *int64      `json:"estanciaId"`
	ReservaID        int64       `json:"reservaId"`
	Codigo           string      `json:"codigo"`
	Huesped          string      `json:"huesped"`
	SedeID           int64       `json:"sedeId"`
	SedeNombre       string      `json:"sedeNombre"`
	TipoHabitacionID int64       `json:"tipoHabitacionId"`
	TipoNombre       string      `json:"tipoNombre"`
	HabitacionID     *int64      `json:"habitacionId"`
	HabitacionNumero string      `json:"habitacionNumero"`
	CheckIn          fecha.Fecha `json:"checkIn"`
	CheckOut         fecha.Fecha `json:"checkOut"`
	Huespedes        int         `json:"huespedes"`
	Notas            string      `json:"notas"`
}

// HabitacionLibre es una habitación que se puede asignar a una reserva.
type HabitacionLibre struct {
	ID     int64  `json:"id"`
	Numero string `json:"numero"`
	Piso   int    `json:"piso"`
}

type DocumentoTipo string

const (
	DNI       DocumentoTipo = "dni"
	CE        DocumentoTipo = "ce"
	Pasaporte DocumentoTipo = "pasaporte"
	Otro      DocumentoTipo = "otro"
)

// Ficha es el registro del huésped titular.
type Ficha struct {
	DocumentoTipo    DocumentoTipo `json:"documentoTipo"`
	DocumentoNumero  string        `json:"documentoNumero"`
	NombreCompleto   string        `json:"nombreCompleto"`
	Nacionalidad     string        `json:"nacionalidad"`
	Domiciliado      bool          `json:"domiciliado"`
	FechaIngresoPais *fecha.Fecha  `json:"fechaIngresoPais"`
	Telefono         string        `json:"telefono"`
}

// CheckIn es lo que se envía al recibir al huésped.
type CheckIn struct {
	ReservaID    int64 `json:"reservaId"`
	HabitacionID int64 `json:"habitacionId"`
	Ficha        Ficha `json:"ficha"`
}

// Estancia es la estancia ya registrada.
type Estancia struct {
	ID               int64       `json:"id"`
	ReservaID        int64       `json:"reservaId"`
	Codigo           string      `json:"codigo"`
	SedeID           int64       `json:"sedeId"`
	HabitacionID     int64       `json:"habitacionId"`
	HabitacionNumero string      `json:"habitacionNumero"`
	Estado           string      `json:"estado"`
	CheckInEn        time.Time   `json:"checkInEn"`
	CheckOutEn       *time.Time  `json:"checkOutEn"`
	Ficha            Ficha       `json:"-"`
	CheckIn          fecha.Fecha `json:"checkIn"`
	CheckOut         fecha.Fecha `json:"checkOut"`
}

// Repositorio es lo que este paquete necesita de la base. Las operaciones que
// cambian estado van cada una en UNA transacción con las filas bloqueadas.
type Repositorio interface {
	// Panel: sedeIDs nil = todos los hoteles; una lista (aunque vacía) limita a esos.
	Panel(ctx context.Context, sedeIDs []int64, hoy fecha.Fecha) ([]Movimiento, error)
	// SedeDeReserva devuelve el hotel de la reserva (ErrNoEncontrada si no existe).
	SedeDeReserva(ctx context.Context, reservaID int64) (int64, error)
	// Libres: habitaciones activas y limpias del tipo de la reserva, sin estancia abierta.
	Libres(ctx context.Context, reservaID int64) ([]HabitacionLibre, error)
	// CheckIn bloquea la reserva y la habitación, comprueba que todo siga en regla, registra
	// la estancia y deja la habitación ocupada. Devuelve ErrNoEncontrada, ErrReservaNoConfirmada,
	// ErrYaRegistrada, ErrFueraDeFechas o ErrHabitacionNoApta.
	CheckIn(ctx context.Context, in CheckIn, actor int64, hoy fecha.Fecha) (int64, error)
	// CheckOut cierra la estancia, deja la habitación sucia y completa la reserva.
	// Devuelve ErrNoEncontrada o ErrYaFinalizada.
	CheckOut(ctx context.Context, id int64, actor int64) error
	PorID(ctx context.Context, id int64) (Estancia, error)
}

type Servicio struct {
	repo      Repositorio
	hoy       func() fecha.Fecha
	auditoria auditoria.Registrador
}

func NewServicio(repo Repositorio, hoy func() fecha.Fecha, aud auditoria.Registrador) *Servicio {
	return &Servicio{repo: repo, hoy: hoy, auditoria: aud}
}

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

func (s *Servicio) Panel(ctx context.Context, sedeIDs []int64) ([]Movimiento, error) {
	return s.repo.Panel(ctx, sedeIDs, s.hoy())
}

// HabitacionesLibres lista a qué habitaciones se puede alojar esta reserva.
func (s *Servicio) HabitacionesLibres(ctx context.Context, reservaID int64, sedeIDs []int64) ([]HabitacionLibre, error) {
	sede, err := s.repo.SedeDeReserva(ctx, reservaID)
	if err != nil {
		return nil, err
	}
	if !enAlcance(sedeIDs, sede) {
		return nil, ErrNoEncontrada
	}
	return s.repo.Libres(ctx, reservaID)
}

var (
	reDNI       = regexp.MustCompile(`^\d{8}$`)
	reCE        = regexp.MustCompile(`^[A-Z0-9]{9,12}$`)
	rePasaporte = regexp.MustCompile(`^[A-Z0-9]{6,12}$`)
	reOtro      = regexp.MustCompile(`^[A-Z0-9.\-]{4,20}$`)
)

// normalizarFicha limpia y valida la ficha. `hoy` es la fecha del HOTEL.
func normalizarFicha(f *Ficha, hoy fecha.Fecha) error {
	f.DocumentoNumero = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(f.DocumentoNumero), " ", ""))
	f.NombreCompleto = strings.Join(strings.Fields(f.NombreCompleto), " ")
	f.Nacionalidad = strings.Join(strings.Fields(f.Nacionalidad), " ")
	f.Telefono = strings.TrimSpace(f.Telefono)

	var re *regexp.Regexp
	var formato string
	switch f.DocumentoTipo {
	case DNI:
		re, formato = reDNI, "El DNI tiene 8 dígitos"
	case CE:
		re, formato = reCE, "El carné de extranjería tiene de 9 a 12 letras o dígitos"
	case Pasaporte:
		re, formato = rePasaporte, "El pasaporte tiene de 6 a 12 letras o dígitos"
	case Otro:
		re, formato = reOtro, "El documento debe tener de 4 a 20 caracteres (letras, dígitos, punto o guion)"
	default:
		return httpx.Validacion("Elige el tipo de documento")
	}
	switch {
	case !re.MatchString(f.DocumentoNumero):
		return httpx.Validacion(formato)
	case f.NombreCompleto == "":
		return httpx.Validacion("Indica el nombre completo del huésped")
	case len([]rune(f.NombreCompleto)) > 120:
		return httpx.Validacion("El nombre no puede pasar de 120 caracteres")
	case f.Nacionalidad == "":
		return httpx.Validacion("Indica la nacionalidad")
	case len([]rune(f.Nacionalidad)) > 40:
		return httpx.Validacion("La nacionalidad no puede pasar de 40 caracteres")
	case len([]rune(f.Telefono)) > 30:
		return httpx.Validacion("El teléfono no puede pasar de 30 caracteres")
	}

	if f.Domiciliado {
		// Un domiciliado no tiene fecha de ingreso al país: si llegó una, se descarta.
		f.FechaIngresoPais = nil
		return nil
	}
	switch {
	case f.FechaIngresoPais == nil || f.FechaIngresoPais.IsZero():
		return httpx.Validacion("Un huésped no domiciliado debe indicar la fecha en que ingresó al país")
	case f.FechaIngresoPais.Despues(hoy):
		return httpx.Validacion("La fecha de ingreso al país no puede ser futura")
	}
	return nil
}

// enmascarar deja visible solo el final del documento: la bitácora no guarda el número completo.
func enmascarar(n string) string {
	r := []rune(n)
	if len(r) <= 3 {
		return strings.Repeat("*", len(r))
	}
	return strings.Repeat("*", len(r)-3) + string(r[len(r)-3:])
}

func (s *Servicio) CheckIn(ctx context.Context, in CheckIn, actor int64, sedeIDs []int64) (Estancia, error) {
	if in.ReservaID <= 0 {
		return Estancia{}, httpx.Validacion("Elige la reserva")
	}
	if in.HabitacionID <= 0 {
		return Estancia{}, httpx.Validacion("Elige la habitación")
	}
	if err := normalizarFicha(&in.Ficha, s.hoy()); err != nil {
		return Estancia{}, err
	}

	sede, err := s.repo.SedeDeReserva(ctx, in.ReservaID)
	if err != nil {
		return Estancia{}, err
	}
	// Una reserva de otro hotel responde como inexistente.
	if !enAlcance(sedeIDs, sede) {
		return Estancia{}, ErrNoEncontrada
	}

	id, err := s.repo.CheckIn(ctx, in, actor, s.hoy())
	var fuera ErrFueraDeFechas
	var noApta ErrHabitacionNoApta
	switch {
	case errors.Is(err, ErrReservaNoConfirmada):
		return Estancia{}, httpx.Conflicto("La reserva no está confirmada (está cancelada o ya terminó)")
	case errors.Is(err, ErrYaRegistrada):
		return Estancia{}, httpx.Conflicto("Esa reserva ya tiene check-in")
	case errors.As(err, &fuera):
		if s.hoy().Antes(fuera.Entrada) {
			return Estancia{}, httpx.Conflicto(fmt.Sprintf("Todavía no es la fecha de entrada (%s)", fuera.Entrada))
		}
		return Estancia{}, httpx.Conflicto(fmt.Sprintf("La estadía reservada terminó el %s", fuera.Salida))
	case errors.As(err, &noApta):
		return Estancia{}, httpx.Conflicto("No se puede asignar esa habitación: " + noApta.Motivo)
	case err != nil:
		return Estancia{}, err
	}

	e, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Estancia{}, err
	}
	despues := map[string]any{
		"reserva": e.Codigo, "habitación": e.HabitacionNumero,
		"documento":   string(in.Ficha.DocumentoTipo) + " " + enmascarar(in.Ficha.DocumentoNumero),
		"domiciliado": in.Ficha.Domiciliado, "nacionalidad": in.Ficha.Nacionalidad,
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Estancia", EntidadID: fmt.Sprint(id), Accion: auditoria.Creado,
		Despues: despues,
	})
	return e, nil
}

func (s *Servicio) CheckOut(ctx context.Context, id int64, actor int64, sedeIDs []int64) (Estancia, error) {
	actual, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Estancia{}, err
	}
	if !enAlcance(sedeIDs, actual.SedeID) {
		return Estancia{}, ErrNoEncontrada
	}

	err = s.repo.CheckOut(ctx, id, actor)
	if errors.Is(err, ErrYaFinalizada) {
		return Estancia{}, httpx.Conflicto("Ya se hizo el check-out de esta estancia")
	}
	if err != nil {
		return Estancia{}, err
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Estancia", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
		Antes:   map[string]any{"estado": "en_casa"},
		Despues: map[string]any{"estado": "finalizada", "reserva": actual.Codigo, "habitación": actual.HabitacionNumero},
	})
	return s.repo.PorID(ctx, id)
}

// Ficha devuelve la ficha de registro de una estancia (datos personales: va con su propio permiso).
func (s *Servicio) Ficha(ctx context.Context, id int64, sedeIDs []int64) (Ficha, error) {
	e, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Ficha{}, err
	}
	if !enAlcance(sedeIDs, e.SedeID) {
		return Ficha{}, ErrNoEncontrada
	}
	return e.Ficha, nil
}
