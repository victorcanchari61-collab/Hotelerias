package promocion

import (
	"testing"

	"hotelerias/backend/internal/platform/fecha"
)

func f(s string) fecha.Fecha {
	v, err := fecha.Parse(s)
	if err != nil {
		panic(err)
	}
	return v
}

func ptr[T any](v T) *T { return &v }

// Una estadía de 3 noches (10, 11 y 12 de noviembre) a S/ 400 la noche.
func estadia() Estadia {
	return Estadia{SedeID: 1, CheckIn: f("2026-11-10"), CheckOut: f("2026-11-13"), PrecioNocheCent: 40000}
}

func promoPct(id int64, pct int) Promocion {
	return Promocion{
		ID: id, Nombre: "Oferta", Tipo: Porcentaje, Porcentaje: ptr(pct), MinNoches: 1, Activo: true,
		Desde: f("2026-01-01"), Hasta: f("2026-12-31"),
	}
}

func TestSubtotalYNoches(t *testing.T) {
	e := estadia()
	if e.Noches() != 3 || e.SubtotalCent() != 120000 {
		t.Fatalf("noches=%d subtotal=%d", e.Noches(), e.SubtotalCent())
	}
}

func TestAplica(t *testing.T) {
	casos := []struct {
		nombre string
		muta   func(p *Promocion, e *Estadia)
		aplica bool
	}{
		{"la básica aplica", func(*Promocion, *Estadia) {}, true},
		{"desactivada", func(p *Promocion, _ *Estadia) { p.Activo = false }, false},

		{"de otra sede", func(p *Promocion, _ *Estadia) { p.SedeID = ptr(int64(2)) }, false},
		{"de esta sede", func(p *Promocion, _ *Estadia) { p.SedeID = ptr(int64(1)) }, true},

		{"solo VIP y es visitante", func(p *Promocion, _ *Estadia) { p.TipoClienteID = ptr(int64(7)) }, false},
		{"solo VIP y es otro tipo", func(p *Promocion, e *Estadia) {
			p.TipoClienteID = ptr(int64(7))
			e.TipoClienteID = ptr(int64(3))
		}, false},
		{"solo VIP y es VIP", func(p *Promocion, e *Estadia) {
			p.TipoClienteID = ptr(int64(7))
			e.TipoClienteID = ptr(int64(7))
		}, true},

		{"pide 5 noches y son 3", func(p *Promocion, _ *Estadia) { p.MinNoches = 5 }, false},
		{"pide 3 noches y son 3", func(p *Promocion, _ *Estadia) { p.MinNoches = 3 }, true},

		// La última noche es la víspera del check-out: hasta el 12 alcanza.
		{"termina justo en la última noche", func(p *Promocion, _ *Estadia) { p.Hasta = f("2026-11-12") }, true},
		{"se pasa un día de la ventana", func(p *Promocion, _ *Estadia) { p.Hasta = f("2026-11-11") }, false},
		{"empieza justo en el check-in", func(p *Promocion, _ *Estadia) { p.Desde = f("2026-11-10") }, true},
		{"empieza un día después del check-in", func(p *Promocion, _ *Estadia) { p.Desde = f("2026-11-11") }, false},

		{"con código y no lo escribió", func(p *Promocion, _ *Estadia) { p.Codigo = ptr("BIENVENIDO") }, false},
		{"con código y lo escribió", func(p *Promocion, e *Estadia) {
			p.Codigo = ptr("BIENVENIDO")
			e.Codigo = "BIENVENIDO"
		}, true},
		{"código en minúsculas y con espacios", func(p *Promocion, e *Estadia) {
			p.Codigo = ptr("BIENVENIDO")
			e.Codigo = "  bienvenido "
		}, true},
		{"código equivocado", func(p *Promocion, e *Estadia) {
			p.Codigo = ptr("BIENVENIDO")
			e.Codigo = "OTRO"
		}, false},
		{"sin código y escribió uno: no importa", func(_ *Promocion, e *Estadia) { e.Codigo = "LOQUESEA" }, true},

		{"estadía de cero noches", func(_ *Promocion, e *Estadia) { e.CheckOut = e.CheckIn }, false},
		{"check-out antes del check-in", func(_ *Promocion, e *Estadia) { e.CheckOut = e.CheckIn.Mas(-1) }, false},
	}

	for _, tc := range casos {
		t.Run(tc.nombre, func(t *testing.T) {
			p, e := promoPct(1, 10), estadia()
			tc.muta(&p, &e)
			if got := p.Aplica(e); got != tc.aplica {
				t.Fatalf("Aplica = %v, esperaba %v", got, tc.aplica)
			}
		})
	}
}

func TestCalcular(t *testing.T) {
	e := estadia() // subtotal 120000

	t.Run("porcentaje", func(t *testing.T) {
		if d := promoPct(1, 15).Calcular(e); d != 18000 {
			t.Fatalf("15%% de 1200.00 = %d", d)
		}
	})

	t.Run("monto por noche", func(t *testing.T) {
		p := Promocion{Tipo: MontoNoche, MontoNocheCent: ptr(int64(10000)), Activo: true}
		if d := p.Calcular(e); d != 30000 { // S/ 100 × 3 noches
			t.Fatalf("d=%d", d)
		}
	})

	t.Run("nunca más que el subtotal", func(t *testing.T) {
		p := Promocion{Tipo: MontoNoche, MontoNocheCent: ptr(int64(99999999)), Activo: true}
		if d := p.Calcular(e); d != e.SubtotalCent() {
			t.Fatalf("d=%d, esperaba el subtotal %d", d, e.SubtotalCent())
		}
	})

	t.Run("100% deja la estadía gratis, no en negativo", func(t *testing.T) {
		if d := promoPct(1, 100).Calcular(e); d != e.SubtotalCent() {
			t.Fatalf("d=%d", d)
		}
	})

	t.Run("redondea al céntimo más cercano, sin float", func(t *testing.T) {
		// 7% de 0.33 = 0.0231 → 2 céntimos. 7% de 0.50 = 0.035 → 4 (mitad hacia arriba).
		cortito := Estadia{CheckIn: f("2026-11-10"), CheckOut: f("2026-11-11"), PrecioNocheCent: 33}
		if d := promoPct(1, 7).Calcular(cortito); d != 2 {
			t.Fatalf("7%% de 33 = %d", d)
		}
		medio := Estadia{CheckIn: f("2026-11-10"), CheckOut: f("2026-11-11"), PrecioNocheCent: 50}
		if d := promoPct(1, 7).Calcular(medio); d != 4 {
			t.Fatalf("7%% de 50 = %d (mitad hacia arriba)", d)
		}
	})

	t.Run("un porcentaje sin valor no descuenta (dato corrupto)", func(t *testing.T) {
		p := Promocion{Tipo: Porcentaje, Activo: true}
		if d := p.Calcular(e); d != 0 {
			t.Fatalf("d=%d", d)
		}
	})
}

func TestMejor(t *testing.T) {
	e := estadia() // subtotal 120000

	t.Run("sin nada, sin descuento", func(t *testing.T) {
		d := Mejor(nil, e, nil)
		if d.Origen != SinDescuento || d.TotalCent != 0 {
			t.Fatalf("%+v", d)
		}
	})

	t.Run("elige la promoción que más descuenta", func(t *testing.T) {
		d := Mejor([]Promocion{promoPct(1, 10), promoPct(2, 25), promoPct(3, 15)}, e, nil)
		if d.Origen != DePromocion || *d.PromocionID != 2 || d.TotalCent != 30000 {
			t.Fatalf("%+v", d)
		}
	})

	t.Run("NO se acumulan: gana el mayor, no la suma", func(t *testing.T) {
		d := Mejor([]Promocion{promoPct(1, 20)}, e, &Beneficio{Nombre: "VIP", Pct: 10})
		if d.TotalCent != 24000 { // 20% = 24000, no 20%+10% = 36000
			t.Fatalf("d=%d", d.TotalCent)
		}
		if d.Origen != DePromocion {
			t.Fatalf("origen=%s", d.Origen)
		}
	})

	t.Run("el beneficio del tipo gana cuando es mayor", func(t *testing.T) {
		d := Mejor([]Promocion{promoPct(1, 5)}, e, &Beneficio{Nombre: "VIP", Pct: 12})
		if d.Origen != DeTipo || d.TotalCent != 14400 || d.PromocionID != nil {
			t.Fatalf("%+v", d)
		}
		if d.Nombre != "Beneficio VIP" {
			t.Fatalf("nombre=%q", d.Nombre)
		}
	})

	t.Run("en empate gana la promoción", func(t *testing.T) {
		d := Mejor([]Promocion{promoPct(9, 10)}, e, &Beneficio{Nombre: "VIP", Pct: 10})
		if d.Origen != DePromocion {
			t.Fatalf("origen=%s", d.Origen)
		}
	})

	t.Run("en empate entre promociones gana la de menor id (determinista)", func(t *testing.T) {
		a := Mejor([]Promocion{promoPct(5, 10), promoPct(2, 10), promoPct(8, 10)}, e, nil)
		b := Mejor([]Promocion{promoPct(8, 10), promoPct(2, 10), promoPct(5, 10)}, e, nil)
		if *a.PromocionID != 2 || *b.PromocionID != 2 {
			t.Fatalf("a=%d b=%d (no debe depender del orden)", *a.PromocionID, *b.PromocionID)
		}
	})

	t.Run("ignora las que no aplican", func(t *testing.T) {
		fuera := promoPct(1, 90)
		fuera.SedeID = ptr(int64(99))
		inactiva := promoPct(2, 80)
		inactiva.Activo = false
		d := Mejor([]Promocion{fuera, inactiva, promoPct(3, 5)}, e, nil)
		if *d.PromocionID != 3 {
			t.Fatalf("%+v", d)
		}
	})

	t.Run("beneficio de 0% no cuenta", func(t *testing.T) {
		if d := Mejor(nil, e, &Beneficio{Nombre: "Regular", Pct: 0}); d.Origen != SinDescuento {
			t.Fatalf("%+v", d)
		}
	})

	t.Run("una promoción con código solo entra si se escribió", func(t *testing.T) {
		p := promoPct(1, 30)
		p.Codigo = ptr("VERANO")
		if d := Mejor([]Promocion{p}, e, nil); d.Origen != SinDescuento {
			t.Fatalf("sin código: %+v", d)
		}
		e2 := e
		e2.Codigo = "verano"
		if d := Mejor([]Promocion{p}, e2, nil); d.TotalCent != 36000 {
			t.Fatalf("con código: %+v", d)
		}
	})
}
