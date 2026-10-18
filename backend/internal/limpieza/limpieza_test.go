package limpieza

import (
	"context"
	"errors"
	"strings"
	"testing"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

type repoFalso struct {
	sede     int64
	errSede  error
	errOp    error
	llamadas []string
}

func (r *repoFalso) Tablero(context.Context, []int64, fecha.Fecha) ([]Tarea, error) { return nil, nil }
func (r *repoFalso) Historial(_ context.Context, _ []int64, limite int) ([]Terminada, error) {
	r.llamadas = append(r.llamadas, "historial")
	if limite != 50 {
		return nil, errors.New("el límite por defecto debía ser 50")
	}
	return nil, nil
}
func (r *repoFalso) Personal(context.Context) ([]Persona, error)            { return nil, nil }
func (r *repoFalso) SedeDeHabitacion(context.Context, int64) (int64, error) { return r.sede, r.errSede }
func (r *repoFalso) Asignar(context.Context, int64, *int64, int64) error {
	r.llamadas = append(r.llamadas, "asignar")
	return r.errOp
}
func (r *repoFalso) Iniciar(context.Context, int64, int64) error {
	r.llamadas = append(r.llamadas, "iniciar")
	return r.errOp
}
func (r *repoFalso) Terminar(context.Context, int64, int64, string) error {
	r.llamadas = append(r.llamadas, "terminar")
	return r.errOp
}
func (r *repoFalso) Etiqueta(context.Context, int64) (string, error) { return "Velothr · 101", nil }

type bitacoraFalsa struct{ eventos []auditoria.Evento }

func (b *bitacoraFalsa) Registrar(_ context.Context, e auditoria.Evento) {
	b.eventos = append(b.eventos, e)
}

func armar() (*Servicio, *repoFalso, *bitacoraFalsa) {
	repo, bit := &repoFalso{sede: 1}, &bitacoraFalsa{}
	return NewServicio(repo, func() fecha.Fecha { return fecha.Nueva(2026, 11, 1) }, bit), repo, bit
}

var ctx = context.Background()

func validacion(err error) bool {
	var v httpx.Validacion
	return errors.As(err, &v)
}

func conflicto(err error) bool {
	var c httpx.Conflicto
	return errors.As(err, &c)
}

func ptr[T any](v T) *T { return &v }

func TestUnaHabitacionDeOtroHotelRespondeComoInexistente(t *testing.T) {
	s, repo, bit := armar()
	repo.sede = 2
	for nombre, f := range map[string]func() error{
		"asignar":  func() error { return s.Asignar(ctx, 5, ptr(int64(9)), 1, []int64{1}) },
		"iniciar":  func() error { return s.Iniciar(ctx, 5, 1, []int64{1}) },
		"terminar": func() error { return s.Terminar(ctx, 5, "", 1, []int64{1}) },
	} {
		if err := f(); !errors.Is(err, ErrNoEncontrada) {
			t.Errorf("%s: err = %v", nombre, err)
		}
	}
	// "Mis sedes" sin ninguna asignada: no alcanza nada.
	if err := s.Iniciar(ctx, 5, 1, []int64{}); !errors.Is(err, ErrNoEncontrada) {
		t.Errorf("sin hoteles: %v", err)
	}
	if len(repo.llamadas) != 0 || len(bit.eventos) != 0 {
		t.Fatalf("no debió tocar nada: %v %v", repo.llamadas, bit.eventos)
	}
}

func TestAsignarValida(t *testing.T) {
	s, repo, _ := armar()
	if err := s.Asignar(ctx, 0, ptr(int64(1)), 1, nil); !validacion(err) {
		t.Errorf("sin habitación: %v", err)
	}
	if err := s.Asignar(ctx, 5, ptr(int64(0)), 1, nil); !validacion(err) {
		t.Errorf("persona 0: %v", err)
	}
	if len(repo.llamadas) != 0 {
		t.Fatal("no debió llegar a la base")
	}
	// nil quita al responsable y es válido.
	if err := s.Asignar(ctx, 5, nil, 1, nil); err != nil {
		t.Fatal(err)
	}
}

func TestLasReglasDeLaBaseSeTraducen(t *testing.T) {
	casos := map[string]struct {
		err    error
		chequa func(error) bool
	}{
		"ya no está sucia": {ErrNoEstaSucia{Estado: "ocupada"}, conflicto},
		"ya en curso":      {ErrYaEnCurso, conflicto},
		"persona inválida": {ErrPersonalInvalido, validacion},
	}
	for nombre, c := range casos {
		s, repo, bit := armar()
		repo.errOp = c.err
		if err := s.Asignar(ctx, 5, ptr(int64(2)), 1, nil); !c.chequa(err) {
			t.Errorf("%s: err = %v", nombre, err)
		}
		if len(bit.eventos) != 0 {
			t.Errorf("%s: lo que no se hizo no se audita", nombre)
		}
	}
}

func TestTerminarAudita(t *testing.T) {
	s, _, bit := armar()
	if err := s.Terminar(ctx, 5, "  cambié las sábanas  ", 7, nil); err != nil {
		t.Fatal(err)
	}
	if len(bit.eventos) != 1 || bit.eventos[0].UsuarioID != 7 || bit.eventos[0].Despues["estado"] != "limpia" || bit.eventos[0].Antes["estado"] != "sucia" {
		t.Fatalf("%+v", bit.eventos)
	}
}

func TestObservacionesTienenTope(t *testing.T) {
	s, repo, _ := armar()
	if err := s.Terminar(ctx, 5, strings.Repeat("x", 301), 1, nil); !validacion(err) {
		t.Fatalf("err = %v", err)
	}
	if len(repo.llamadas) != 0 {
		t.Fatal("no debió llegar a la base")
	}
	if err := s.Terminar(ctx, 5, strings.Repeat("x", 300), 1, nil); err != nil {
		t.Fatalf("300 caracteres sí: %v", err)
	}
}

func TestHistorialUsaUnLimiteRazonable(t *testing.T) {
	s, _, _ := armar()
	for _, limite := range []int{0, -3, 500} {
		if _, err := s.Historial(ctx, nil, limite); err != nil {
			t.Errorf("límite %d: %v", limite, err)
		}
	}
}
