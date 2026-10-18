package moneda

import (
	"context"
	"errors"
	"testing"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

func TestParseTasa(t *testing.T) {
	ok := map[string]int64{
		"3.752":    3_752_000,
		"3,752":    3_752_000,
		" 3.7 ":    3_700_000,
		"4":        4_000_000,
		"3.123456": 3_123_456,
		"0.5":      500_000,
	}
	for in, quiero := range ok {
		got, err := ParseTasa(in)
		if err != nil || got != quiero {
			t.Errorf("ParseTasa(%q) = %d, %v; quiero %d", in, got, err, quiero)
		}
	}
	for _, in := range []string{"", "abc", "-3.7", "3.1234567", "1e3", "3.7.1", ".", "0", "0.000000", "1,234.5", "+3.7"} {
		if got, err := ParseTasa(in); err == nil {
			t.Errorf("ParseTasa(%q) = %d; debió fallar", in, got)
		}
	}
}

func TestFormatoTasa(t *testing.T) {
	for micro, quiero := range map[int64]string{
		3_752_000: "3.752", 3_700_000: "3.700", 4_000_000: "4.000", 3_123_456: "3.123456", 500_000: "0.500",
	} {
		if got := FormatoTasa(micro); got != quiero {
			t.Errorf("FormatoTasa(%d) = %q; quiero %q", micro, got, quiero)
		}
	}
}

func TestConversion(t *testing.T) {
	venta := int64(3_752_000)
	// S/ 450.00 → US$ 119.94 (450 / 3.752 = 119.936...)
	if got := DePenA(45_000, venta); got != 11_994 {
		t.Errorf("DePenA = %d; quiero 11994", got)
	}
	// de vuelta: US$ 119.94 → S/ 450.0 (119.94 * 3.752 = 450.0 (449.99...))
	if got := APen(11_994, venta); got != 45_001 && got != 45_000 {
		t.Errorf("APen = %d; fuera de rango", got)
	}
	// Mitad hacia arriba: 1 céntimo de sol a tasa 2.000 es 0.5 → 1 centavo.
	if got := DePenA(1, 2_000_000); got != 1 {
		t.Errorf("DePenA(1, 2.0) = %d; quiero 1 (mitad hacia arriba)", got)
	}
	if got := DePenA(0, venta); got != 0 {
		t.Errorf("DePenA(0) = %d", got)
	}
	// Sin tasa válida no se inventa un importe.
	if got := DePenA(45_000, 0); got != 0 {
		t.Errorf("DePenA con tasa 0 = %d; quiero 0", got)
	}
}

// ---- servicio ----

type repoFalso struct {
	monedas []Moneda
	cambios []TipoCambio
}

func (r *repoFalso) Monedas(context.Context) ([]Moneda, error) { return r.monedas, nil }

func (r *repoFalso) UltimoHasta(_ context.Context, cod string, desde, hasta fecha.Fecha) (TipoCambio, error) {
	var mejor *TipoCambio
	for i, c := range r.cambios {
		if c.Moneda != cod || c.Fecha.Antes(desde) || c.Fecha.Despues(hasta) {
			continue
		}
		if mejor == nil || c.Fecha.Despues(mejor.Fecha) {
			mejor = &r.cambios[i]
		}
	}
	if mejor == nil {
		return TipoCambio{}, ErrSinTipoCambio
	}
	return *mejor, nil
}

func (r *repoFalso) Historial(context.Context, string, int) ([]TipoCambio, error) {
	return r.cambios, nil
}

func (r *repoFalso) Guardar(_ context.Context, t TipoCambio, _ int64) (TipoCambio, error) {
	r.cambios = append(r.cambios, t)
	return t, nil
}

func nuevoServicio() (*Servicio, *repoFalso, fecha.Fecha) {
	hoy := fecha.Nueva(2026, 10, 14) // miércoles
	repo := &repoFalso{monedas: []Moneda{
		{Codigo: "PEN", Nombre: "Soles", Simbolo: "S/", Decimales: 2, Base: true, Activa: true},
		{Codigo: "USD", Nombre: "Dólares", Simbolo: "US$", Decimales: 2, Activa: true},
	}}
	return NewServicio(repo, func() fecha.Fecha { return hoy }, auditoria.Nop{}), repo, hoy
}

func TestVigente(t *testing.T) {
	s, repo, hoy := nuevoServicio()
	ctx := context.Background()

	if _, err := s.Vigente(ctx, "USD"); !errors.Is(err, ErrSinTipoCambio) {
		t.Fatalf("sin tipo de cambio: err = %v", err)
	}
	if _, err := s.Vigente(ctx, "PEN"); err == nil {
		t.Fatal("la base no tiene tipo de cambio")
	}
	if _, err := s.Vigente(ctx, "EUR"); !errors.Is(err, ErrNoSoportada) {
		t.Fatalf("moneda desconocida: err = %v", err)
	}

	// El del viernes sirve el fin de semana y el lunes… hasta una semana.
	repo.cambios = []TipoCambio{{Fecha: hoy.Mas(-3), Moneda: "USD", CompraMicro: 3_740_000, VentaMicro: 3_750_000}}
	got, err := s.Vigente(ctx, "usd")
	if err != nil || got.VentaMicro != 3_750_000 {
		t.Fatalf("Vigente = %+v, %v", got, err)
	}
	// Uno más reciente gana.
	repo.cambios = append(repo.cambios, TipoCambio{Fecha: hoy, Moneda: "USD", CompraMicro: 3_745_000, VentaMicro: 3_752_000})
	if got, _ := s.Vigente(ctx, "USD"); got.VentaMicro != 3_752_000 {
		t.Fatalf("debió tomar el de hoy, tomó %+v", got)
	}
	// Uno demasiado viejo no sirve.
	repo.cambios = []TipoCambio{{Fecha: hoy.Mas(-8), Moneda: "USD", CompraMicro: 3_740_000, VentaMicro: 3_750_000}}
	if _, err := s.Vigente(ctx, "USD"); !errors.Is(err, ErrSinTipoCambio) {
		t.Fatalf("uno de hace 8 días no debe servir: err = %v", err)
	}
}

func TestGuardarValida(t *testing.T) {
	s, repo, hoy := nuevoServicio()
	ctx := context.Background()

	malos := map[string]Entrada{
		"base":            {Fecha: hoy, Moneda: "PEN", Compra: "1", Venta: "1"},
		"vacía":           {Fecha: hoy, Moneda: "", Compra: "3.7", Venta: "3.8"},
		"desconocida":     {Fecha: hoy, Moneda: "EUR", Compra: "3.7", Venta: "3.8"},
		"sin fecha":       {Moneda: "USD", Compra: "3.7", Venta: "3.8"},
		"futura":          {Fecha: hoy.Mas(1), Moneda: "USD", Compra: "3.7", Venta: "3.8"},
		"muy antigua":     {Fecha: hoy.Mas(-400), Moneda: "USD", Compra: "3.7", Venta: "3.8"},
		"compra inválida": {Fecha: hoy, Moneda: "USD", Compra: "tres", Venta: "3.8"},
		"venta inválida":  {Fecha: hoy, Moneda: "USD", Compra: "3.7", Venta: "-3.8"},
		"venta < compra":  {Fecha: hoy, Moneda: "USD", Compra: "3.9", Venta: "3.8"},
		"cero de más":     {Fecha: hoy, Moneda: "USD", Compra: "37", Venta: "38"},
	}
	for nombre, e := range malos {
		_, err := s.Guardar(ctx, e, 1)
		var v httpx.Validacion
		if !errors.As(err, &v) {
			t.Errorf("%s: err = %v; quiero una validación", nombre, err)
		}
	}
	if len(repo.cambios) != 0 {
		t.Fatalf("no debió guardar nada, guardó %d", len(repo.cambios))
	}

	got, err := s.Guardar(ctx, Entrada{Fecha: hoy, Moneda: " usd ", Compra: "3.745", Venta: "3,752"}, 7)
	if err != nil {
		t.Fatal(err)
	}
	if got.Moneda != "USD" || got.CompraMicro != 3_745_000 || got.VentaMicro != 3_752_000 || got.Fuente != "manual" {
		t.Fatalf("guardó %+v", got)
	}
}

func TestPublicoSoloOfreceLoQueSePuedeCotizar(t *testing.T) {
	s, repo, hoy := nuevoServicio()
	ctx := context.Background()

	p, err := s.Publico(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Monedas) != 2 || len(p.TipoCambio) != 0 {
		t.Fatalf("sin tipo de cambio: %+v", p)
	}

	repo.cambios = []TipoCambio{{Fecha: hoy, Moneda: "USD", CompraMicro: 3_745_000, VentaMicro: 3_752_000}}
	p, _ = s.Publico(ctx)
	if p.TipoCambio["USD"].VentaMicro != 3_752_000 {
		t.Fatalf("con tipo de cambio: %+v", p)
	}
	// Lo público NO lleva la compra, solo la venta con que se cotiza.
	if _, ok := p.TipoCambio["PEN"]; ok {
		t.Fatal("la base no lleva tipo de cambio")
	}
}

type parametrosFalsos map[string]int

func (p parametrosFalsos) Entero(_ context.Context, clave string) int { return p[clave] }

func TestLaAntiguedadAceptadaSaleDeLosParametros(t *testing.T) {
	s, repo, hoy := nuevoServicio()
	repo.cambios = []TipoCambio{{Fecha: hoy.Mas(-5), Moneda: "USD", CompraMicro: 3_740_000, VentaMicro: 3_750_000}}
	ctx := context.Background()

	s.ConParametros(parametrosFalsos{"finanzas.cambio_dias_atras": 3})
	if _, err := s.Vigente(ctx, "USD"); !errors.Is(err, ErrSinTipoCambio) {
		t.Fatalf("con tope de 3 días, uno de hace 5 no sirve: err = %v", err)
	}
	s.ConParametros(parametrosFalsos{"finanzas.cambio_dias_atras": 10})
	if _, err := s.Vigente(ctx, "USD"); err != nil {
		t.Fatalf("con tope de 10 días sí: %v", err)
	}
}
