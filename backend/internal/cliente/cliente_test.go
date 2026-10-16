package cliente

import "testing"

func ptr[T any](v T) *T { return &v }

func tipos() []Tipo {
	return []Tipo{
		{ID: 1, Nombre: "Regular", Orden: 0, Activo: true},
		{ID: 2, Nombre: "Frecuente", Orden: 1, DescuentoPct: 5, ReservasMinimas: ptr(3), Activo: true},
		{ID: 3, Nombre: "VIP", Orden: 2, DescuentoPct: 10, ReservasMinimas: ptr(6), Activo: true},
		{ID: 4, Nombre: "Corporativo", Orden: 3, DescuentoPct: 15, Activo: true}, // solo manual
	}
}

func TestClasificar(t *testing.T) {
	casos := []struct {
		reservas int
		quiere   string
	}{
		{0, "Regular"}, {2, "Regular"}, {3, "Frecuente"}, {5, "Frecuente"}, {6, "VIP"}, {40, "VIP"},
	}
	for _, tc := range casos {
		got := Clasificar(tipos(), tc.reservas)
		if got == nil || got.Nombre != tc.quiere {
			t.Errorf("con %d reservas: %+v, esperaba %s", tc.reservas, got, tc.quiere)
		}
	}
}

func TestClasificarNuncaDaUnTipoSoloManual(t *testing.T) {
	// Corporativo no tiene regla: por muchas reservas que haya, no se asigna solo.
	if got := Clasificar(tipos(), 1000); got.Nombre == "Corporativo" {
		t.Fatal("un tipo sin regla automática no puede asignarse solo")
	}
}

func TestClasificarIgnoraTiposDesactivados(t *testing.T) {
	ts := tipos()
	ts[2].Activo = false // VIP desactivado
	if got := Clasificar(ts, 10); got.Nombre != "Frecuente" {
		t.Fatalf("got %+v, esperaba Frecuente", got)
	}
	ts[0].Activo = false // y Regular también: el de entrada pasa a ser el siguiente
	if got := Clasificar(ts, 0); got.Nombre != "Frecuente" {
		t.Fatalf("entrada: got %+v", got)
	}
}

func TestClasificarSinTipos(t *testing.T) {
	if got := Clasificar(nil, 5); got != nil {
		t.Fatalf("got %+v", got)
	}
	if got := Clasificar([]Tipo{{ID: 1, Activo: false}}, 5); got != nil {
		t.Fatalf("got %+v", got)
	}
}

func TestClasificarEmpateEsDeterminista(t *testing.T) {
	a := []Tipo{
		{ID: 9, Nombre: "B", DescuentoPct: 5, ReservasMinimas: ptr(3), Activo: true},
		{ID: 2, Nombre: "A", DescuentoPct: 5, ReservasMinimas: ptr(3), Activo: true},
	}
	b := []Tipo{a[1], a[0]}
	if x, y := Clasificar(a, 3), Clasificar(b, 3); x.ID != 2 || y.ID != 2 {
		t.Fatalf("depende del orden: %d / %d", x.ID, y.ID)
	}
}

func TestClasificarNoMutaLaEntrada(t *testing.T) {
	ts := tipos()
	Clasificar(ts, 0)
	if ts[0].ID != 1 || ts[3].ID != 4 {
		t.Fatal("Clasificar reordenó o modificó la lista que recibió")
	}
}
