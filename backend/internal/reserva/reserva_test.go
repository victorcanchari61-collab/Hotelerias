package reserva

import (
	"context"
	"errors"
	"testing"

	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/cliente"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/moneda"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/promocion"
)

func f(s string) fecha.Fecha {
	v, err := fecha.Parse(s)
	if err != nil {
		panic(err)
	}
	return v
}

func ptr[T any](v T) *T { return &v }

// --- dobles ---

type repoFalso struct {
	creadas   []Nueva
	porCodigo map[string]Reserva
	cancelado []int64
	// duplicados: cuántas veces responder ErrCodigoDuplicado antes de aceptar.
	duplicados int
}

func (r *repoFalso) Crear(_ context.Context, n Nueva) (Reserva, error) {
	if r.duplicados > 0 {
		r.duplicados--
		return Reserva{}, ErrCodigoDuplicado
	}
	r.creadas = append(r.creadas, n)
	return Reserva{ID: int64(len(r.creadas)), Codigo: n.Codigo, TotalCent: n.TotalCent, Estado: Confirmada}, nil
}
func (r *repoFalso) PorCodigo(_ context.Context, c string) (Reserva, error) {
	if x, ok := r.porCodigo[c]; ok {
		return x, nil
	}
	return Reserva{}, ErrNoEncontrada
}
func (r *repoFalso) PorID(_ context.Context, id int64) (Reserva, error) {
	for _, x := range r.porCodigo {
		if x.ID == id {
			return x, nil
		}
	}
	return Reserva{}, ErrNoEncontrada
}
func (r *repoFalso) DeCliente(context.Context, int64) ([]Reserva, error)        { return nil, nil }
func (r *repoFalso) Listar(context.Context, Estado, []int64) ([]Reserva, error) { return nil, nil }
func (r *repoFalso) Cancelar(_ context.Context, id int64) (bool, error) {
	r.cancelado = append(r.cancelado, id)
	return true, nil
}

type catalogoFalso struct {
	tipo     hotel.TipoHabitacion
	ocupadas int
}

func (c catalogoFalso) Sede(_ context.Context, id int64) (hotel.Sede, error) {
	return hotel.Sede{ID: id, Nombre: "Velothr Lima", Activo: true}, nil
}
func (c catalogoFalso) Tipo(_ context.Context, id int64) (hotel.TipoHabitacion, error) {
	if id != c.tipo.ID {
		return hotel.TipoHabitacion{}, hotel.ErrNoEncontrada
	}
	return c.tipo, nil
}
func (c catalogoFalso) Ocupadas(context.Context, int64, fecha.Fecha, fecha.Fecha) (int, error) {
	return c.ocupadas, nil
}

// cambiosFalsos: solo dólares, con la venta indicada (0 = sin tipo de cambio).
type cambiosFalsos struct{ venta int64 }

func (c cambiosFalsos) Vigente(_ context.Context, cod string) (moneda.TipoCambio, error) {
	if cod != "USD" {
		return moneda.TipoCambio{}, moneda.ErrNoSoportada
	}
	if c.venta == 0 {
		return moneda.TipoCambio{}, moneda.ErrSinTipoCambio
	}
	return moneda.TipoCambio{Moneda: cod, CompraMicro: c.venta - 7_000, VentaMicro: c.venta}, nil
}

type ofertasFalsas []promocion.Promocion

func (o ofertasFalsas) Vigentes(context.Context) ([]promocion.Promocion, error) { return o, nil }

type huespedFalso struct {
	c             cliente.Cliente
	reclasificado int
}

func (h *huespedFalso) Perfil(context.Context, int64) (cliente.Cliente, error) { return h.c, nil }
func (h *huespedFalso) Reclasificar(context.Context, int64) error {
	h.reclasificado++
	return nil
}

// Hoy es 2026-11-01. Habitación a S/ 400 la noche, 2 en total, caben 2 personas.
func armar(t *testing.T) (*Servicio, *repoFalso, *huespedFalso) {
	t.Helper()
	repo := &repoFalso{porCodigo: map[string]Reserva{}}
	cat := catalogoFalso{tipo: hotel.TipoHabitacion{
		ID: 10, SedeID: 1, Nombre: "Deluxe", Capacidad: 2, PrecioNocheCent: 40000, Cantidad: 2, Activo: true,
	}}
	h := &huespedFalso{c: cliente.Cliente{ID: 7, Nombre: "Ana", Activo: true, TipoClienteID: ptr(int64(1)), TipoCliente: "Regular"}}
	s := NewServicio(repo, cat, ofertasFalsas{}, h, cambiosFalsos{venta: 3_752_000}, func() fecha.Fecha { return f("2026-11-01") })
	s.codigo = func() string { return "HV-TEST-0001" }
	return s, repo, h
}

func solicitud() Solicitud {
	return Solicitud{TipoHabitacionID: 10, CheckIn: f("2026-11-10"), CheckOut: f("2026-11-13"), Huespedes: 2}
}

// --- pruebas ---

func TestCotizarVisitanteVePrecioDeLista(t *testing.T) {
	s, _, _ := armar(t)
	q, err := s.Cotizar(context.Background(), 0, solicitud())
	if err != nil {
		t.Fatal(err)
	}
	if q.Noches != 3 || q.SubtotalCent != 120000 || q.TotalCent != 120000 || q.Descuento.TotalCent != 0 {
		t.Fatalf("%+v", q)
	}
	if q.TipoCliente != "" || q.Disponibles != 2 {
		t.Fatalf("tipo=%q disponibles=%d", q.TipoCliente, q.Disponibles)
	}
}

func TestCotizarAplicaElBeneficioDelTipoDeCliente(t *testing.T) {
	s, _, h := armar(t)
	h.c.TipoCliente, h.c.DescuentoPct = "VIP", 10

	q, err := s.Cotizar(context.Background(), 7, solicitud())
	if err != nil {
		t.Fatal(err)
	}
	if q.Descuento.Origen != promocion.DeTipo || q.Descuento.TotalCent != 12000 || q.TotalCent != 108000 {
		t.Fatalf("%+v", q)
	}
	if q.TipoCliente != "VIP" {
		t.Fatalf("tipo=%q", q.TipoCliente)
	}
}

func TestCotizarOfertaMayorQueElBeneficioGanaYNoSeSuman(t *testing.T) {
	s, _, h := armar(t)
	h.c.TipoCliente, h.c.DescuentoPct = "VIP", 10
	s.ofertas = ofertasFalsas{{
		ID: 1, Nombre: "Larga", Tipo: promocion.Porcentaje, Porcentaje: ptr(15), MinNoches: 1, Activo: true,
		Desde: f("2026-01-01"), Hasta: f("2026-12-31"),
	}}

	q, _ := s.Cotizar(context.Background(), 7, solicitud())
	if q.Descuento.Origen != promocion.DePromocion || q.Descuento.TotalCent != 18000 { // 15%, no 25%
		t.Fatalf("%+v", q.Descuento)
	}
}

func TestCotizarCodigoValidoEInvalido(t *testing.T) {
	s, _, _ := armar(t)
	s.ofertas = ofertasFalsas{{
		ID: 1, Nombre: "Bienvenida", Tipo: promocion.Porcentaje, Porcentaje: ptr(10), Codigo: ptr("BIENVENIDO10"),
		MinNoches: 1, Activo: true, Desde: f("2026-01-01"), Hasta: f("2026-12-31"),
	}}

	sol := solicitud()
	sol.Codigo = "bienvenido10"
	q, _ := s.Cotizar(context.Background(), 0, sol)
	if !q.CodigoValido || q.Descuento.TotalCent != 12000 {
		t.Fatalf("%+v", q)
	}

	sol.Codigo = "NOEXISTE"
	q, _ = s.Cotizar(context.Background(), 0, sol)
	if q.CodigoValido || q.Descuento.TotalCent != 0 {
		t.Fatalf("un código que no existe no debe descontar: %+v", q)
	}
}

func TestCotizarRechazaFechasYCapacidad(t *testing.T) {
	s, _, _ := armar(t)
	ctx := context.Background()

	malas := map[string]func(*Solicitud){
		"entrada en el pasado": func(x *Solicitud) { x.CheckIn = f("2026-10-01") },
		"salida antes":         func(x *Solicitud) { x.CheckOut = f("2026-11-09") },
		"misma fecha":          func(x *Solicitud) { x.CheckOut = x.CheckIn },
		"demasiado larga":      func(x *Solicitud) { x.CheckOut = x.CheckIn.Mas(60) },
		"sin huéspedes":        func(x *Solicitud) { x.Huespedes = 0 },
		"no caben":             func(x *Solicitud) { x.Huespedes = 3 },
	}
	for nombre, muta := range malas {
		sol := solicitud()
		muta(&sol)
		_, err := s.Cotizar(ctx, 0, sol)
		var v httpx.Validacion
		if !errors.As(err, &v) {
			t.Errorf("%s: esperaba un error de validación, llegó %v", nombre, err)
		}
	}
}

func TestReservarExigeSesion(t *testing.T) {
	s, repo, _ := armar(t)
	_, err := s.Reservar(context.Background(), 0, solicitud())
	if !errors.Is(err, auth.ErrSesionInvalida) {
		t.Fatalf("err=%v", err)
	}
	if len(repo.creadas) != 0 {
		t.Fatal("no debe guardar nada sin sesión")
	}
}

func TestReservarGuardaLosImportesQueCalculaElServidor(t *testing.T) {
	s, repo, h := armar(t)
	h.c.TipoCliente, h.c.DescuentoPct = "VIP", 10

	r, err := s.Reservar(context.Background(), 7, solicitud())
	if err != nil {
		t.Fatal(err)
	}
	if len(repo.creadas) != 1 {
		t.Fatalf("creadas=%d", len(repo.creadas))
	}
	n := repo.creadas[0]
	if n.PrecioNocheCent != 40000 || n.SubtotalCent != 120000 || n.DescuentoCent != 12000 || n.TotalCent != 108000 {
		t.Fatalf("%+v", n)
	}
	if n.DescuentoOrigen != "tipo_cliente" || n.Noches != 3 || n.ClienteID != 7 {
		t.Fatalf("%+v", n)
	}
	if r.Codigo != "HV-TEST-0001" {
		t.Fatalf("codigo=%s", r.Codigo)
	}
	if h.reclasificado != 1 {
		t.Fatalf("reclasificado=%d, esperaba 1 tras reservar", h.reclasificado)
	}
}

func TestReservarSinDisponibilidad(t *testing.T) {
	s, repo, _ := armar(t)
	s.catalogo = catalogoFalso{tipo: s.catalogo.(catalogoFalso).tipo, ocupadas: 2}

	_, err := s.Reservar(context.Background(), 7, solicitud())
	if !errors.Is(err, ErrSinDisponibilidad) {
		t.Fatalf("err=%v", err)
	}
	if len(repo.creadas) != 0 {
		t.Fatal("no debe guardar")
	}
}

func TestReservarReintentaSiElCodigoSeRepite(t *testing.T) {
	s, repo, _ := armar(t)
	repo.duplicados = 2
	if _, err := s.Reservar(context.Background(), 7, solicitud()); err != nil {
		t.Fatal(err)
	}
	if len(repo.creadas) != 1 {
		t.Fatalf("creadas=%d", len(repo.creadas))
	}
}

func TestReservarRechazaCuentaDesactivada(t *testing.T) {
	s, _, h := armar(t)
	h.c.Activo = false
	_, err := s.Reservar(context.Background(), 7, solicitud())
	if !errors.Is(err, auth.ErrCuentaInactiva) {
		t.Fatalf("err=%v", err)
	}
}

func TestReservarLimitaLasNotas(t *testing.T) {
	s, _, _ := armar(t)
	sol := solicitud()
	for i := 0; i < maxNotas+1; i++ {
		sol.Notas += "x"
	}
	_, err := s.Reservar(context.Background(), 7, sol)
	var v httpx.Validacion
	if !errors.As(err, &v) {
		t.Fatalf("err=%v", err)
	}
}

func TestCancelar(t *testing.T) {
	ctx := context.Background()
	base := Reserva{ID: 5, Codigo: "HV-AAAA-BBBB", ClienteID: 7, Estado: Confirmada, CheckIn: f("2026-11-10")}

	t.Run("la propia, con tiempo", func(t *testing.T) {
		s, repo, h := armar(t)
		repo.porCodigo[base.Codigo] = base
		r, err := s.Cancelar(ctx, 7, "hv-aaaa-bbbb")
		if err != nil || r.Estado != Cancelada {
			t.Fatalf("r=%+v err=%v", r, err)
		}
		if len(repo.cancelado) != 1 || h.reclasificado != 1 {
			t.Fatalf("cancelado=%v reclasificado=%d", repo.cancelado, h.reclasificado)
		}
	})

	t.Run("una ajena responde como inexistente", func(t *testing.T) {
		s, repo, _ := armar(t)
		repo.porCodigo[base.Codigo] = base
		if _, err := s.Cancelar(ctx, 99, base.Codigo); !errors.Is(err, ErrNoEncontrada) {
			t.Fatalf("err=%v", err)
		}
		if len(repo.cancelado) != 0 {
			t.Fatal("no debe cancelar la reserva de otro")
		}
	})

	t.Run("el día de la entrada ya no", func(t *testing.T) {
		s, repo, _ := armar(t)
		r := base
		r.CheckIn = f("2026-11-01") // hoy
		repo.porCodigo[r.Codigo] = r
		if _, err := s.Cancelar(ctx, 7, r.Codigo); !errors.Is(err, ErrNoCancelable) {
			t.Fatalf("err=%v", err)
		}
	})

	t.Run("una ya cancelada", func(t *testing.T) {
		s, repo, _ := armar(t)
		r := base
		r.Estado = Cancelada
		repo.porCodigo[r.Codigo] = r
		if _, err := s.Cancelar(ctx, 7, r.Codigo); !errors.Is(err, ErrNoCancelable) {
			t.Fatalf("err=%v", err)
		}
	})
}

func TestCancelarPorPersonalIgnoraLaFecha(t *testing.T) {
	s, repo, _ := armar(t)
	r := Reserva{ID: 5, Codigo: "HV-AAAA-BBBB", ClienteID: 7, Estado: Confirmada, CheckIn: f("2026-10-30")} // ya empezó
	repo.porCodigo[r.Codigo] = r

	out, err := s.CancelarPorPersonal(context.Background(), 5, nil)
	if err != nil || out.Estado != Cancelada {
		t.Fatalf("out=%+v err=%v", out, err)
	}
}

func TestNuevoCodigo(t *testing.T) {
	vistos := map[string]bool{}
	for i := 0; i < 500; i++ {
		c := NuevoCodigo()
		if len(c) != len("HV-XXXX-XXXX") || c[:3] != "HV-" || c[7] != '-' {
			t.Fatalf("formato: %q", c)
		}
		for _, ch := range c[3:7] + c[8:] {
			if ch == '0' || ch == 'O' || ch == '1' || ch == 'I' || ch == 'L' {
				t.Fatalf("carácter ambiguo %q en %q", ch, c)
			}
		}
		if vistos[c] {
			t.Fatalf("repetido: %s", c)
		}
		vistos[c] = true
	}
}

// --- dos monedas ---

func solicitudUSD() Solicitud {
	sol := solicitud()
	sol.Moneda = "USD"
	return sol
}

func TestCotizarEnSolesPorDefectoNoLlevaTipoDeCambio(t *testing.T) {
	s, _, _ := armar(t)
	for _, m := range []string{"", "pen", " PEN "} {
		sol := solicitud()
		sol.Moneda = m
		q, err := s.Cotizar(context.Background(), 0, sol)
		if err != nil {
			t.Fatalf("moneda %q: %v", m, err)
		}
		if q.Moneda != "PEN" || q.TipoCambioMicro != nil || q.TotalCent != 120000 || q.TotalPenCent != 120000 {
			t.Fatalf("moneda %q: %+v", m, q)
		}
	}
}

func TestCotizarEnDolaresConvierteConLaVentaYLasLineasSuman(t *testing.T) {
	s, _, h := armar(t)
	h.c.TipoCliente, h.c.DescuentoPct = "VIP", 10

	q, err := s.Cotizar(context.Background(), 7, solicitudUSD())
	if err != nil {
		t.Fatal(err)
	}
	// S/ 400 / 3.752 = US$ 106.61 por noche; ×3 = 319.83; 10% (S/ 120) = US$ 31.98.
	if q.Moneda != "USD" || q.TipoCambioMicro == nil || *q.TipoCambioMicro != 3_752_000 {
		t.Fatalf("%+v", q)
	}
	if q.PrecioNocheCent != 10661 || q.SubtotalCent != 31983 || q.Descuento.TotalCent != 3198 || q.TotalCent != 28785 {
		t.Fatalf("%+v", q)
	}
	if q.SubtotalCent-q.Descuento.TotalCent != q.TotalCent {
		t.Fatalf("las líneas no suman: %+v", q)
	}
	// El equivalente en soles vuelve a casi S/ 1,080 (el redondeo de dos conversiones, ≤ 2 céntimos).
	if d := q.TotalPenCent - 108000; d < -2 || d > 2 {
		t.Fatalf("totalPen = %d", q.TotalPenCent)
	}
	if q.Descuento.Nombre != "Beneficio VIP" {
		t.Fatalf("el descuento se decidió en soles y se conserva: %+v", q.Descuento)
	}
}

func TestCotizarEnDolaresSinTipoDeCambioNoInventaUno(t *testing.T) {
	s, _, _ := armar(t)
	s.cambios = cambiosFalsos{}
	_, err := s.Cotizar(context.Background(), 0, solicitudUSD())
	var v httpx.Validacion
	if !errors.As(err, &v) {
		t.Fatalf("err = %v; quiero una validación", err)
	}
	// En soles sigue funcionando.
	if _, err := s.Cotizar(context.Background(), 0, solicitud()); err != nil {
		t.Fatal(err)
	}
}

func TestCotizarMonedaNoDisponible(t *testing.T) {
	s, _, _ := armar(t)
	for _, m := range []string{"EUR", "US", "USD1", "U$D", "'; --"} {
		sol := solicitud()
		sol.Moneda = m
		_, err := s.Cotizar(context.Background(), 0, sol)
		var v httpx.Validacion
		if !errors.As(err, &v) {
			t.Errorf("moneda %q: err = %v; quiero una validación", m, err)
		}
	}
}

func TestReservarEnDolaresCopiaElTipoDeCambio(t *testing.T) {
	s, repo, h := armar(t)
	h.c.TipoCliente, h.c.DescuentoPct = "VIP", 10

	if _, err := s.Reservar(context.Background(), 7, solicitudUSD()); err != nil {
		t.Fatal(err)
	}
	n := repo.creadas[0]
	if n.Moneda != "USD" || n.TipoCambioMicro == nil || *n.TipoCambioMicro != 3_752_000 {
		t.Fatalf("%+v", n)
	}
	if n.TotalCent != 28785 || n.TotalPenCent < 107998 || n.TotalPenCent > 108002 {
		t.Fatalf("%+v", n)
	}
	// La verificación de precio vigente va contra la lista en SOLES, no la moneda del huésped.
	if n.PrecioListaPenCent != 40000 {
		t.Fatalf("precio de lista = %d", n.PrecioListaPenCent)
	}
}

func TestReservarEnSolesNoGuardaTipoDeCambio(t *testing.T) {
	s, repo, _ := armar(t)
	if _, err := s.Reservar(context.Background(), 7, solicitud()); err != nil {
		t.Fatal(err)
	}
	n := repo.creadas[0]
	if n.Moneda != "PEN" || n.TipoCambioMicro != nil || n.TotalPenCent != n.TotalCent {
		t.Fatalf("%+v", n)
	}
}
