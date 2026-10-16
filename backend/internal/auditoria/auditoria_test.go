package auditoria

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
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
	filtro     Filtro
	orden      Orden
}

func (r *repoFalso) Insertar(_ context.Context, e Evento) error {
	if r.falla != nil {
		return r.falla
	}
	r.insertados = append(r.insertados, e)
	return nil
}
func (r *repoFalso) Listar(_ context.Context, f Filtro, o Orden, _, _ int) ([]Fila, int, error) {
	r.filtro, r.orden = f, o
	return nil, 0, nil
}
func (r *repoFalso) PorID(context.Context, int64) (Detalle, error) { return Detalle{}, ErrNoEncontrado }
func (r *repoFalso) Resumen(context.Context) (Resumen, error)      { return Resumen{}, nil }
func (r *repoFalso) Entidades(context.Context) ([]string, error)   { return nil, nil }
func (r *repoFalso) Eliminar(_ context.Context, f Filtro, antes time.Time) (int64, error) {
	r.filtro, r.borrado = f, antes
	return r.n, nil
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

func TestDepurarBorraLoQueSeVeYNuncaLoReciente(t *testing.T) {
	r := &repoFalso{n: 10}
	s := servicio(r) // hoy: 2026-11-01

	n, err := s.Depurar(context.Background(), Consulta{
		Buscar:  " rol ",
		Filtros: []FiltroTabla{{Columna: "entidad", Operador: "equals", Valor: "Rol"}},
	}, 7)
	if err != nil || n != 10 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	// Lo que se borra es lo filtrado, y NUNCA lo de los últimos 30 días.
	if r.filtro.Entidad != "Rol" || r.filtro.Buscar != " rol " {
		t.Fatalf("filtro: %+v", r.filtro)
	}
	if limite := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC).Add(-RetencionMinima); !r.borrado.Equal(limite) {
		t.Fatalf("retención: %v, esperaba %v", r.borrado, limite)
	}
	// Queda UN registro que dice qué se depuró, a nombre de quien lo hizo.
	if len(r.insertados) != 1 || r.insertados[0].UsuarioID != 7 || r.insertados[0].Accion != Eliminado {
		t.Fatalf("%+v", r.insertados)
	}
	if got := r.insertados[0].Antes["Filtros"]; got != "entidad: Rol" {
		t.Fatalf("filtros descritos: %v", got)
	}
}

func TestDepurarSinNadaQueBorrarNoDejaRegistro(t *testing.T) {
	r := &repoFalso{n: 0}
	if _, err := servicio(r).Depurar(context.Background(), Consulta{}, 1); err != nil {
		t.Fatal(err)
	}
	if len(r.insertados) != 0 {
		t.Fatalf("%+v", r.insertados)
	}
}

func TestConsultaAFiltro(t *testing.T) {
	c := Consulta{Filtros: []FiltroTabla{
		{Columna: "entidad", Operador: "equals", Valor: "Usuario"},
		{Columna: "accion", Operador: "equals", Valor: "creado"},
		{Columna: "usuario", Operador: "contains", Valor: " Ana "},
		{Columna: "fecha", Operador: "between", Valor: "2026-10-01", ValorHasta: "2026-10-31"},
		{Columna: "inventada", Operador: "equals", Valor: "x"},    // se ignora
		{Columna: "entidadId", Operador: "contains", Valor: "  "}, // vacío: no filtra
	}}
	f, err := c.AFiltro()
	if err != nil {
		t.Fatal(err)
	}
	if f.Entidad != "Usuario" || f.Accion != Creado || f.Usuario != "Ana" || f.Registro != "" {
		t.Fatalf("%+v", f)
	}
	if f.Desde.String() != "2026-10-01" || f.Hasta.String() != "2026-10-31" {
		t.Fatalf("fechas: %v %v", f.Desde, f.Hasta)
	}

	// Un solo día: desde y hasta son el mismo.
	d, _ := Consulta{Filtros: []FiltroTabla{{Columna: "fecha", Valor: "2026-10-05"}}}.AFiltro()
	if d.Desde.String() != "2026-10-05" || d.Hasta.String() != "2026-10-05" {
		t.Fatalf("un día: %v %v", d.Desde, d.Hasta)
	}

	// Una fecha mal escrita es un error del usuario, no un 500.
	if _, err := (Consulta{Filtros: []FiltroTabla{{Columna: "fecha", Valor: "ayer"}}}).AFiltro(); err == nil {
		t.Fatal("debía rechazar la fecha")
	}
}

func TestOrdenSoloAceptaColumnasConocidas(t *testing.T) {
	for _, c := range []struct {
		in   Consulta
		want Orden
	}{
		{Consulta{}, Orden{"fecha", true}},
		{Consulta{Orden: "usuario", Sentido: "asc"}, Orden{"usuario", false}},
		{Consulta{Orden: "fecha; DROP TABLE auditoria", Sentido: "asc"}, Orden{"fecha", false}},
		{Consulta{Orden: "accion", Sentido: "cualquier cosa"}, Orden{"accion", true}},
	} {
		if got := c.in.orden(); got != c.want {
			t.Errorf("%+v → %+v, esperaba %+v", c.in, got, c.want)
		}
	}
}

func TestListarAcotaLaPagina(t *testing.T) {
	r := &repoFalso{}
	p, err := servicio(r).Listar(context.Background(), Consulta{Pagina: 0, PorPagina: 100000})
	if err != nil {
		t.Fatal(err)
	}
	if p.Pagina != 1 || p.PorPagina != PorPaginaMax || p.Items == nil {
		t.Fatalf("%+v", p)
	}
}
