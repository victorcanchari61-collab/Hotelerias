package auditoria

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

func TestDiferenciaDejaSoloLoQueCambio(t *testing.T) {
	antes := map[string]any{"nombre": "Ana", "activo": true, "telefono": "1"}
	despues := map[string]any{"nombre": "Ana", "activo": false, "telefono": "1", "email": "a@x.pe"}

	a, d := Diferencia(antes, despues)

	if !reflect.DeepEqual(a, map[string]any{"activo": true}) {
		t.Fatalf("antes=%v", a)
	}
	if !reflect.DeepEqual(d, map[string]any{"activo": false, "email": "a@x.pe"}) {
		t.Fatalf("despues=%v", d)
	}
}

func TestDiferenciaSinCambiosNoDejaNada(t *testing.T) {
	m := map[string]any{"a": 1, "b": []string{"x"}}
	a, d := Diferencia(m, map[string]any{"a": 1, "b": []string{"x"}})
	if len(a) != 0 || len(d) != 0 {
		t.Fatalf("a=%v d=%v", a, d)
	}
}

// --- servicio con un repositorio en memoria ---

type repoFalso struct {
	insertados []Evento
	borrado    time.Time
	n          int64
	falla      error
}

func (r *repoFalso) Insertar(_ context.Context, e Evento) error {
	if r.falla != nil {
		return r.falla
	}
	r.insertados = append(r.insertados, e)
	return nil
}
func (r *repoFalso) Listar(_ context.Context, _ Filtro, pagina, porPagina int) ([]Fila, int, error) {
	return nil, 0, nil
}
func (r *repoFalso) PorID(context.Context, int64) (Detalle, error) { return Detalle{}, ErrNoEncontrado }
func (r *repoFalso) Resumen(context.Context) (Resumen, error)      { return Resumen{}, nil }
func (r *repoFalso) Entidades(context.Context) ([]string, error)   { return nil, nil }
func (r *repoFalso) EliminarAnteriores(_ context.Context, antes time.Time) (int64, error) {
	r.borrado = antes
	return r.n, nil
}

func f(s string) fecha.Fecha {
	v, err := fecha.Parse(s)
	if err != nil {
		panic(err)
	}
	return v
}

func servicio(r *repoFalso) *Servicio {
	s := NewServicio(r)
	s.now = func() time.Time { return time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC) }
	return s
}

func TestRegistrarNoTumbaLaOperacionSiFalla(t *testing.T) {
	r := &repoFalso{falla: errors.New("base caída")}
	// No debe entrar en pánico ni devolver nada: solo se loguea.
	servicio(r).Registrar(context.Background(), Evento{Entidad: "Rol", EntidadID: "1", Accion: Creado})
}

func TestDepurarExigeFechaYRespetaLaRetencion(t *testing.T) {
	r := &repoFalso{n: 10}
	s := servicio(r)
	ctx := context.Background()

	var v httpx.Validacion
	if _, err := s.Depurar(ctx, fecha.Fecha{}, 1); !errors.As(err, &v) {
		t.Fatalf("sin fecha: %v", err)
	}
	// Hoy es 2026-11-01: lo de los últimos 30 días no se toca.
	if _, err := s.Depurar(ctx, f("2026-10-15"), 1); !errors.As(err, &v) {
		t.Fatalf("dentro de la retención: %v", err)
	}
	if len(r.insertados) != 0 || !r.borrado.IsZero() {
		t.Fatal("no debe haber borrado ni registrado nada")
	}

	n, err := s.Depurar(ctx, f("2026-09-30"), 7)
	if err != nil || n != 10 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	// Queda UN registro que dice qué se depuró, a nombre de quien lo hizo.
	if len(r.insertados) != 1 || r.insertados[0].UsuarioID != 7 || r.insertados[0].Accion != Eliminado {
		t.Fatalf("%+v", r.insertados)
	}
}

func TestDepurarSinNadaQueBorrarNoDejaRegistro(t *testing.T) {
	r := &repoFalso{n: 0}
	if _, err := servicio(r).Depurar(context.Background(), f("2026-09-01"), 1); err != nil {
		t.Fatal(err)
	}
	if len(r.insertados) != 0 {
		t.Fatalf("%+v", r.insertados)
	}
}

func TestListarAcotaLaPagina(t *testing.T) {
	var pedido [2]int
	r := &repoFalso{}
	s := servicio(r)
	p, err := s.Listar(context.Background(), Filtro{}, 0, 100000)
	if err != nil {
		t.Fatal(err)
	}
	_ = pedido
	if p.Pagina != 1 || p.PorPagina != PorPaginaMax || p.Items == nil {
		t.Fatalf("%+v", p)
	}
}
