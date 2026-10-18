// Package limpieza es el housekeeping: cuáles habitaciones hay que limpiar, a quién se
// le asignó, quién la limpió y cuándo.
//
// Cierra el ciclo de la habitación:
//
//	check-out → SUCIA → (asignar → iniciar →) terminar → LIMPIA → se puede asignar a un huésped
//
// Una habitación sucia ES una limpieza pendiente: se deriva de su estado, no hay una fila por
// cada check-out. La tabla guarda solo la limpieza abierta (asignada o en curso) y el
// historial de las terminadas.
package limpieza

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

var (
	ErrNoEncontrada = errors.New("limpieza: habitación no encontrada")
	// ErrPersonalInvalido: la persona a la que se asigna no existe o está desactivada.
	ErrPersonalInvalido = errors.New("limpieza: persona no válida")
	ErrYaEnCurso        = errors.New("limpieza: ya está en curso")
)

// ErrNoEstaSucia: la habitación ya no está sucia (alguien la ocupó, la limpió o la pasó a mantenimiento).
type ErrNoEstaSucia struct{ Estado string }

func (e ErrNoEstaSucia) Error() string { return "limpieza: la habitación está " + e.Estado }

type Estado string

const (
	Pendiente Estado = "pendiente" // sucia y sin asignar
	Asignada  Estado = "asignada"
	EnCurso   Estado = "en_curso"
)

// Tarea es una fila del tablero: una habitación sucia y lo que se sabe de su limpieza.
type Tarea struct {
	HabitacionID    int64      `json:"habitacionId"`
	SedeID          int64      `json:"sedeId"`
	SedeNombre      string     `json:"sedeNombre"`
	Numero          string     `json:"numero"`
	Piso            int        `json:"piso"`
	TipoNombre      string     `json:"tipoNombre"`
	SuciaDesde      time.Time  `json:"suciaDesde"`
	Estado          Estado     `json:"estado"`
	AsignadaA       *int64     `json:"asignadaA"`
	AsignadaANombre string     `json:"asignadaANombre"`
	IniciadaEn      *time.Time `json:"iniciadaEn"`
	// Urgente: hay más llegadas por atender hoy de este tipo que habitaciones limpias.
	Urgente bool `json:"urgente"`
}

// Terminada es una fila del historial.
type Terminada struct {
	ID              int64      `json:"id"`
	SedeNombre      string     `json:"sedeNombre"`
	Numero          string     `json:"numero"`
	TipoNombre      string     `json:"tipoNombre"`
	AsignadaANombre string     `json:"asignadaANombre"`
	TerminadaPor    string     `json:"terminadaPor"`
	IniciadaEn      *time.Time `json:"iniciadaEn"`
	TerminadaEn     time.Time  `json:"terminadaEn"`
	// Minutos entre iniciar y terminar; nil si nunca se marcó el inicio.
	Minutos       *int   `json:"minutos"`
	Observaciones string `json:"observaciones"`
}

type Persona struct {
	ID     int64  `json:"id"`
	Nombre string `json:"nombre"`
}

// Repositorio es lo que este paquete necesita de la base. Las operaciones que cambian estado
// bloquean la habitación y comprueban que siga sucia, todo en una transacción.
type Repositorio interface {
	// Tablero: sedeIDs nil = todos los hoteles; una lista (aunque vacía) limita a esos.
	Tablero(ctx context.Context, sedeIDs []int64, hoy fecha.Fecha) ([]Tarea, error)
	Historial(ctx context.Context, sedeIDs []int64, limite int) ([]Terminada, error)
	Personal(ctx context.Context) ([]Persona, error)
	// SedeDeHabitacion devuelve el hotel de la habitación (ErrNoEncontrada si no existe).
	SedeDeHabitacion(ctx context.Context, id int64) (int64, error)
	// Asignar pone (o cambia, o con quien == nil quita) el responsable de la limpieza abierta.
	// ErrNoEstaSucia, ErrPersonalInvalido; ErrYaEnCurso si se intenta quitar una en curso.
	Asignar(ctx context.Context, habitacionID int64, quien *int64, actor int64) error
	// Iniciar: ErrNoEstaSucia, ErrYaEnCurso.
	Iniciar(ctx context.Context, habitacionID int64, actor int64) error
	// Terminar deja la habitación LIMPIA y registra quién y cuándo. ErrNoEstaSucia.
	Terminar(ctx context.Context, habitacionID int64, actor int64, observaciones string) error
	// Nombre de la habitación para la bitácora.
	Etiqueta(ctx context.Context, habitacionID int64) (string, error)
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

func (s *Servicio) Tablero(ctx context.Context, sedeIDs []int64) ([]Tarea, error) {
	return s.repo.Tablero(ctx, sedeIDs, s.hoy())
}

func (s *Servicio) Historial(ctx context.Context, sedeIDs []int64, limite int) ([]Terminada, error) {
	if limite < 1 || limite > 200 {
		limite = 50
	}
	return s.repo.Historial(ctx, sedeIDs, limite)
}

func (s *Servicio) Personal(ctx context.Context) ([]Persona, error) { return s.repo.Personal(ctx) }

// alcanzar comprueba que la habitación exista y sea de un hotel que la persona alcanza.
func (s *Servicio) alcanzar(ctx context.Context, habitacionID int64, sedeIDs []int64) error {
	sede, err := s.repo.SedeDeHabitacion(ctx, habitacionID)
	if err != nil {
		return err
	}
	// Una habitación de otro hotel responde como inexistente.
	if !enAlcance(sedeIDs, sede) {
		return ErrNoEncontrada
	}
	return nil
}

// traducir pasa los errores de la base a lo que se le dice a la persona.
func traducir(err error) error {
	var sucia ErrNoEstaSucia
	switch {
	case errors.As(err, &sucia):
		return httpx.Conflicto(fmt.Sprintf("La habitación ya no está sucia (está %s). Recarga el tablero", sucia.Estado))
	case errors.Is(err, ErrPersonalInvalido):
		return httpx.Validacion("Esa persona no existe o está desactivada")
	case errors.Is(err, ErrYaEnCurso):
		return httpx.Conflicto("La limpieza ya está en curso")
	}
	return err
}

func (s *Servicio) Asignar(ctx context.Context, habitacionID int64, quien *int64, actor int64, sedeIDs []int64) error {
	if habitacionID <= 0 {
		return httpx.Validacion("Elige la habitación")
	}
	if quien != nil && *quien <= 0 {
		return httpx.Validacion("Elige a quién asignarla")
	}
	if err := s.alcanzar(ctx, habitacionID, sedeIDs); err != nil {
		return err
	}
	if err := s.repo.Asignar(ctx, habitacionID, quien, actor); err != nil {
		return traducir(err)
	}
	etq, _ := s.repo.Etiqueta(ctx, habitacionID)
	despues := map[string]any{"habitación": etq, "asignada a": "nadie"}
	if quien != nil {
		despues["asignada a"] = *quien
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Limpieza", EntidadID: fmt.Sprint(habitacionID), Accion: auditoria.Actualizado,
		Despues: despues,
	})
	return nil
}

func (s *Servicio) Iniciar(ctx context.Context, habitacionID int64, actor int64, sedeIDs []int64) error {
	if err := s.alcanzar(ctx, habitacionID, sedeIDs); err != nil {
		return err
	}
	if err := s.repo.Iniciar(ctx, habitacionID, actor); err != nil {
		return traducir(err)
	}
	etq, _ := s.repo.Etiqueta(ctx, habitacionID)
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Limpieza", EntidadID: fmt.Sprint(habitacionID), Accion: auditoria.Actualizado,
		Despues: map[string]any{"habitación": etq, "estado": "en curso"},
	})
	return nil
}

const maxObservaciones = 300

func (s *Servicio) Terminar(ctx context.Context, habitacionID int64, observaciones string, actor int64, sedeIDs []int64) error {
	observaciones = strings.TrimSpace(observaciones)
	if len([]rune(observaciones)) > maxObservaciones {
		return httpx.Validacion(fmt.Sprintf("Las observaciones no pueden pasar de %d caracteres", maxObservaciones))
	}
	if err := s.alcanzar(ctx, habitacionID, sedeIDs); err != nil {
		return err
	}
	if err := s.repo.Terminar(ctx, habitacionID, actor, observaciones); err != nil {
		return traducir(err)
	}
	etq, _ := s.repo.Etiqueta(ctx, habitacionID)
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Limpieza", EntidadID: fmt.Sprint(habitacionID), Accion: auditoria.Actualizado,
		Antes:   map[string]any{"estado": "sucia"},
		Despues: map[string]any{"habitación": etq, "estado": "limpia"},
	})
	return nil
}
