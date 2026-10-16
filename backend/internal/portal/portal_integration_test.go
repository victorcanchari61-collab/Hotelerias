package portal_test

// Prueba de punta a punta del portal contra un Postgres real: sedes, cotización,
// registro, reserva con sesión, no sobreventa y clasificación automática.
// Se salta sola si no hay base:
//
//	TEST_DATABASE_URL="host=localhost port=5432 dbname=postgres user=postgres password=..." go test ./internal/portal/
//
// Trabaja en un schema temporal que borra al terminar: no toca tus datos.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"hotelerias/backend/config"
	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/cliente"
	clientepg "hotelerias/backend/internal/cliente/postgres"
	"hotelerias/backend/internal/demo"
	"hotelerias/backend/internal/hotel"
	hotelpg "hotelerias/backend/internal/hotel/postgres"
	"hotelerias/backend/internal/moneda"
	monedapg "hotelerias/backend/internal/moneda/postgres"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/platform/migrate"
	"hotelerias/backend/internal/portal"
	"hotelerias/backend/internal/promocion"
	promocionpg "hotelerias/backend/internal/promocion/postgres"
	"hotelerias/backend/internal/reserva"
	reservapg "hotelerias/backend/internal/reserva/postgres"
	"hotelerias/backend/internal/routes"
	"hotelerias/backend/migrations"
)

func nuevoPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida")
	}
	ctx := context.Background()

	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("test_portal_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		admin.Close()
	})

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	// Más conexiones que peticiones simultáneas, o la prueba de sobreventa no
	// estresaría el candado sino el pool.
	cfg.MaxConns = 16
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	if _, err := migrate.Up(ctx, pool, migrations.FS); err != nil {
		t.Fatalf("migraciones: %v", err)
	}
	return pool
}

type entorno struct {
	router http.Handler
	tokens *auth.Tokens
	pool   *pgxpool.Pool
}

func armar(t *testing.T) *entorno {
	t.Helper()
	gin.SetMode(gin.TestMode)
	pool := nuevoPool(t)
	ctx := context.Background()

	if _, err := demo.Sembrar(ctx, pool, hotel.Hoy()); err != nil {
		t.Fatal(err)
	}

	tokens, err := auth.NewTokens(config.JwtSettings{
		SecretKey: "clave-de-pruebas-de-al-menos-32-bytes!!", Issuer: "t", Audience: "t", ExpirationHours: 1,
	})
	if err != nil {
		t.Fatal(err)
	}

	hasher := auth.Bcrypt{Cost: bcrypt.MinCost}
	hoteles := hotelpg.NewStore(pool)
	promoSvc := promocion.NewServicio(promocionpg.NewStore(pool), hotel.Hoy)
	clienteSvc, err := cliente.NewServicio(clientepg.NewStore(pool), hasher, tokens, auth.NuevoLimitador(5, time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	monedaSvc := moneda.NewServicio(monedapg.NewStore(pool), hotel.Hoy, auditoria.Nop{})
	reservaSvc := reserva.NewServicio(reservapg.NewStore(pool), hoteles, promoSvc, clienteSvc, monedaSvc, hotel.Hoy)
	h := portal.NewHandler(hotel.NewServicio(hoteles, hotel.Hoy), promoSvc, clienteSvc, reservaSvc, monedaSvc, hotel.Hoy,
		auth.ClienteOpcional(tokens))

	router := httpx.NewRouter(nil)
	routes.Register(router, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Public:       []routes.Module{h.Publico()},
		Modules: []routes.Module{
			// Sin guard de permiso: aquí solo importa que exija sesión de PERSONAL.
			promocion.NewHandler(promoSvc, httpx.Guardas{}),
			moneda.NewHandler(monedaSvc, httpx.Guardas{}),
			reserva.NewAdminHandler(reservaSvc, httpx.Guardas{}, reserva.SinRestriccion{}, auditoria.Nop{}),
		},
		Cliente:        auth.AuthenticateCliente(tokens),
		ClienteModules: []routes.Module{h.ConSesion()},
	})
	return &entorno{router: router, tokens: tokens, pool: pool}
}

func (e *entorno) do(t *testing.T, method, path string, body any, token string) (int, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec.Code, rec.Body.Bytes()
}

func decode[T any](t *testing.T, b []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("respuesta ilegible: %v\n%s", err, b)
	}
	return v
}

// registrar crea un huésped y devuelve su token.
func (e *entorno) registrar(t *testing.T, email string) (token string, id int64) {
	t.Helper()
	code, body := e.do(t, "POST", "/api/portal/registro", map[string]string{
		"nombre": "Huésped", "apellido": "Prueba", "email": email, "password": "una-clave-larga-1",
	}, "")
	if code != http.StatusCreated {
		t.Fatalf("registro %s: %d %s", email, code, body)
	}
	s := decode[cliente.Sesion](t, body)
	return s.Token, s.Cliente.ID
}

type reservaReq = map[string]any

func solicitud(tipoID int64, in, out string, extra ...map[string]any) reservaReq {
	r := reservaReq{"tipoHabitacionId": tipoID, "checkIn": in, "checkOut": out, "huespedes": 2}
	for _, m := range extra {
		for k, v := range m {
			r[k] = v
		}
	}
	return r
}

// habitaciones de la primera sede por nombre.
func (e *entorno) tipos(t *testing.T) (sedeID int64, porNombre map[string]hotel.TipoHabitacion) {
	t.Helper()
	code, body := e.do(t, "GET", "/api/portal/sedes", nil, "")
	if code != 200 {
		t.Fatalf("sedes: %d %s", code, body)
	}
	sedes := decode[[]hotel.Sede](t, body)
	if len(sedes) != 4 {
		t.Fatalf("sedes=%d, esperaba 4 de la demo", len(sedes))
	}
	sedeID = sedes[0].ID

	code, body = e.do(t, "GET", fmt.Sprintf("/api/portal/sedes/%d", sedeID), nil, "")
	if code != 200 {
		t.Fatalf("sede: %d %s", code, body)
	}
	det := decode[struct {
		Habitaciones []hotel.TipoHabitacion `json:"habitaciones"`
	}](t, body)
	porNombre = map[string]hotel.TipoHabitacion{}
	for _, h := range det.Habitaciones {
		porNombre[h.Nombre] = h
	}
	return sedeID, porNombre
}

func fechas(desdeHoy, noches int) (string, string) {
	h := hotel.Hoy()
	return h.Mas(desdeHoy).String(), h.Mas(desdeHoy + noches).String()
}

func TestReservarExigeIniciarSesion(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	in, out := fechas(10, 2)
	sol := solicitud(tipos["Habitación Deluxe"].ID, in, out)

	// Sin token.
	if code, _ := e.do(t, "POST", "/api/portal/reservas", sol, ""); code != http.StatusUnauthorized {
		t.Fatalf("sin sesión: %d, esperaba 401", code)
	}

	// Con un token de PERSONAL del mismo número de id: no vale como huésped.
	staff, _ := e.tokens.Emitir(1)
	if code, _ := e.do(t, "POST", "/api/portal/reservas", sol, staff); code != http.StatusUnauthorized {
		t.Fatalf("token de personal: %d, esperaba 401", code)
	}
	if code, _ := e.do(t, "GET", "/api/portal/me", nil, staff); code != http.StatusUnauthorized {
		t.Fatalf("token de personal en /me: %d, esperaba 401", code)
	}

	// Y al revés: el token de un huésped no abre el panel.
	tok, _ := e.registrar(t, "ana@correo.pe")
	if code, _ := e.do(t, "GET", "/api/promocion", nil, tok); code != http.StatusUnauthorized {
		t.Fatalf("token de huésped en el panel: %d, esperaba 401", code)
	}
	if code, _ := e.do(t, "GET", "/api/reserva", nil, tok); code != http.StatusUnauthorized {
		t.Fatalf("token de huésped en reservas del panel: %d, esperaba 401", code)
	}

	// Con su propia sesión sí.
	if code, body := e.do(t, "POST", "/api/portal/reservas", sol, tok); code != http.StatusCreated {
		t.Fatalf("con sesión: %d %s", code, body)
	}
}

func TestVisitantePuedeCotizarPeroNoReservar(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	deluxe := tipos["Habitación Deluxe"]
	in, out := fechas(10, 2)

	code, body := e.do(t, "POST", "/api/portal/cotizar", solicitud(deluxe.ID, in, out), "")
	if code != 200 {
		t.Fatalf("cotizar: %d %s", code, body)
	}
	q := decode[reserva.Cotizacion](t, body)
	if q.TotalCent != deluxe.PrecioNocheCent*2 || q.Descuento.TotalCent != 0 || q.TipoCliente != "" {
		t.Fatalf("%+v", q)
	}

	// Con el código de bienvenida: 10% menos.
	code, body = e.do(t, "POST", "/api/portal/cotizar",
		solicitud(deluxe.ID, in, out, map[string]any{"codigo": "bienvenido10"}), "")
	if code != 200 {
		t.Fatalf("cotizar con código: %d %s", code, body)
	}
	q = decode[reserva.Cotizacion](t, body)
	if !q.CodigoValido || q.Descuento.TotalCent != deluxe.PrecioNocheCent*2/10 {
		t.Fatalf("%+v", q)
	}

	// El visitante ve en la web solo ofertas sin código y abiertas a todos.
	code, body = e.do(t, "GET", "/api/portal/promociones", nil, "")
	if code != 200 {
		t.Fatalf("promos: %d", code)
	}
	for _, p := range decode[[]promocion.Promocion](t, body) {
		if p.Codigo != nil {
			t.Fatalf("la oferta %q con código no debe listarse (ni filtrarse su código)", p.Nombre)
		}
		if p.TipoClienteID != nil {
			t.Fatalf("la oferta %q es de un tipo de cliente y la ve un visitante", p.Nombre)
		}
	}
}

func TestNoSeVendeLaMismaHabitacionDosVeces(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	suite := tipos["Suite Presidencial"] // hay 2
	if suite.Cantidad != 2 {
		t.Fatalf("cantidad=%d", suite.Cantidad)
	}
	in, out := fechas(20, 3)

	const intentos = 8
	tokens := make([]string, intentos)
	for i := range tokens {
		tokens[i], _ = e.registrar(t, fmt.Sprintf("huesped%d@correo.pe", i))
	}

	var wg sync.WaitGroup
	codes := make([]int, intentos)
	start := make(chan struct{})
	for i := 0; i < intentos; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			codes[i], _ = e.do(t, "POST", "/api/portal/reservas", solicitud(suite.ID, in, out), tokens[i])
		}()
	}
	close(start)
	wg.Wait()

	var ok, conflicto int
	for _, c := range codes {
		switch c {
		case http.StatusCreated:
			ok++
		case http.StatusConflict:
			conflicto++
		default:
			t.Fatalf("código inesperado %d en %v", c, codes)
		}
	}
	if ok != 2 || conflicto != intentos-2 {
		t.Fatalf("exitosas=%d conflictos=%d (esperaba 2 y %d): %v", ok, conflicto, intentos-2, codes)
	}

	// La base confirma: nunca más de 2 confirmadas para ese tipo y fechas.
	var n int
	if err := e.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM reserva WHERE tipo_habitacion_id = $1 AND estado = 'confirmada'`, suite.ID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("confirmadas en la base: %d", n)
	}
}

func TestDisponibilidadYSalidaMismoDiaQueEntrada(t *testing.T) {
	e := armar(t)
	sedeID, tipos := e.tipos(t)
	suite := tipos["Suite Presidencial"]
	tok, _ := e.registrar(t, "ana@correo.pe")

	in, out := fechas(30, 2)
	// Ocupa las 2 suites del 30 al 32.
	for i := 0; i < 2; i++ {
		t2, _ := e.registrar(t, fmt.Sprintf("otro%d@correo.pe", i))
		if code, body := e.do(t, "POST", "/api/portal/reservas", solicitud(suite.ID, in, out), t2); code != 201 {
			t.Fatalf("reserva %d: %d %s", i, code, body)
		}
	}

	libres := func(entrada, salida string) int {
		code, body := e.do(t, "GET",
			fmt.Sprintf("/api/portal/sedes/%d/disponibilidad?entrada=%s&salida=%s&huespedes=2", sedeID, entrada, salida), nil, "")
		if code != 200 {
			t.Fatalf("disponibilidad: %d %s", code, body)
		}
		for _, d := range decode[[]hotel.Disponible](t, body) {
			if d.ID == suite.ID {
				return d.Disponibles
			}
		}
		t.Fatal("la suite no aparece")
		return -1
	}

	if n := libres(in, out); n != 0 {
		t.Fatalf("mismas fechas: %d libres, esperaba 0", n)
	}
	// Entrar el día que otros salen no se cruza.
	in2, out2 := fechas(32, 1)
	if n := libres(in2, out2); n != 2 {
		t.Fatalf("entrada el día de salida: %d libres, esperaba 2", n)
	}
	// Un solape parcial sí se cruza.
	in3, out3 := fechas(31, 2)
	if n := libres(in3, out3); n != 0 {
		t.Fatalf("solape parcial: %d libres, esperaba 0", n)
	}

	// Reservar encima de lo ocupado: conflicto, no error del servidor.
	if code, _ := e.do(t, "POST", "/api/portal/reservas", solicitud(suite.ID, in, out), tok); code != http.StatusConflict {
		t.Fatalf("sobre lo ocupado: %d, esperaba 409", code)
	}
}

func TestCancelarLiberaLaHabitacionYSoloLaPropia(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	suite := tipos["Suite Presidencial"]
	in, out := fechas(40, 2)

	dueno, _ := e.registrar(t, "dueno@correo.pe")
	otro, _ := e.registrar(t, "otro@correo.pe")

	var codigos []string
	for i := 0; i < 2; i++ {
		tok, _ := e.registrar(t, fmt.Sprintf("x%d@correo.pe", i))
		if i == 0 {
			tok = dueno
		}
		code, body := e.do(t, "POST", "/api/portal/reservas", solicitud(suite.ID, in, out), tok)
		if code != 201 {
			t.Fatalf("%d %s", code, body)
		}
		codigos = append(codigos, decode[reserva.Reserva](t, body).Codigo)
	}

	// Otro huésped no puede cancelarla, y responde igual que si no existiera.
	code, _ := e.do(t, "POST", "/api/portal/reservas/"+codigos[0]+"/cancelar", nil, otro)
	if code != http.StatusNotFound {
		t.Fatalf("ajena: %d, esperaba 404", code)
	}

	// Llena: una tercera no cabe.
	if code, _ := e.do(t, "POST", "/api/portal/reservas", solicitud(suite.ID, in, out), otro); code != http.StatusConflict {
		t.Fatalf("llena: %d", code)
	}

	// La dueña cancela y entonces sí hay lugar.
	code, body := e.do(t, "POST", "/api/portal/reservas/"+codigos[0]+"/cancelar", nil, dueno)
	if code != 200 {
		t.Fatalf("cancelar: %d %s", code, body)
	}
	if code, body := e.do(t, "POST", "/api/portal/reservas", solicitud(suite.ID, in, out), otro); code != 201 {
		t.Fatalf("tras cancelar: %d %s", code, body)
	}

	// Cancelar dos veces no es un éxito.
	if code, _ := e.do(t, "POST", "/api/portal/reservas/"+codigos[0]+"/cancelar", nil, dueno); code != http.StatusConflict {
		t.Fatalf("doble cancelación: %d, esperaba 409", code)
	}
}

func TestElHuespedSubeDeTipoSoloAlReservar(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	deluxe := tipos["Habitación Deluxe"]
	tok, _ := e.registrar(t, "frecuente@correo.pe")

	tipoActual := func() cliente.Cliente {
		code, body := e.do(t, "GET", "/api/portal/me", nil, tok)
		if code != 200 {
			t.Fatalf("me: %d %s", code, body)
		}
		return decode[cliente.Cliente](t, body)
	}

	if c := tipoActual(); c.TipoCliente != "Regular" || c.DescuentoPct != 0 {
		t.Fatalf("al registrarse: %+v", c)
	}

	// Tres reservas separadas (sin solaparse): llega a Frecuente (≥ 3).
	for i := 0; i < 3; i++ {
		in, out := fechas(50+i*5, 1)
		if code, body := e.do(t, "POST", "/api/portal/reservas", solicitud(deluxe.ID, in, out), tok); code != 201 {
			t.Fatalf("reserva %d: %d %s", i, code, body)
		}
		want := "Regular"
		if i == 2 {
			want = "Frecuente"
		}
		if c := tipoActual(); c.TipoCliente != want {
			t.Fatalf("tras %d reservas: %q, esperaba %q", i+1, c.TipoCliente, want)
		}
	}

	// Y ahora su cotización lleva el beneficio de su tipo.
	in, out := fechas(90, 2)
	code, body := e.do(t, "POST", "/api/portal/cotizar", solicitud(deluxe.ID, in, out), tok)
	if code != 200 {
		t.Fatalf("cotizar: %d %s", code, body)
	}
	q := decode[reserva.Cotizacion](t, body)
	if q.TipoCliente != "Frecuente" || q.Descuento.TotalCent != deluxe.PrecioNocheCent*2*5/100 {
		t.Fatalf("%+v", q)
	}
}

func TestElPrecioLoCalculaElServidor(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	deluxe := tipos["Habitación Deluxe"]
	tok, _ := e.registrar(t, "listo@correo.pe")
	in, out := fechas(60, 2)

	// El navegador manda importes inventados: se ignoran.
	code, body := e.do(t, "POST", "/api/portal/reservas",
		solicitud(deluxe.ID, in, out, map[string]any{"totalCent": 1, "subtotalCent": 1, "descuentoCent": 99999, "precioNocheCent": 1}), tok)
	if code != 201 {
		t.Fatalf("%d %s", code, body)
	}
	r := decode[reserva.Reserva](t, body)
	if r.PrecioNocheCent != deluxe.PrecioNocheCent || r.TotalCent != deluxe.PrecioNocheCent*2 {
		t.Fatalf("%+v", r)
	}
}

func TestReservaConCodigoGuardaLoAplicado(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	deluxe := tipos["Habitación Deluxe"]
	tok, _ := e.registrar(t, "codigo@correo.pe")
	in, out := fechas(70, 2)

	code, body := e.do(t, "POST", "/api/portal/reservas",
		solicitud(deluxe.ID, in, out, map[string]any{"codigo": "BIENVENIDO10"}), tok)
	if code != 201 {
		t.Fatalf("%d %s", code, body)
	}
	r := decode[reserva.Reserva](t, body)
	if r.DescuentoOrigen != "promocion" || r.DescuentoNombre != "Bienvenida 10%" || r.PromocionID == nil {
		t.Fatalf("%+v", r)
	}
	if r.TotalCent != r.SubtotalCent-r.DescuentoCent || r.DescuentoCent != r.SubtotalCent/10 {
		t.Fatalf("%+v", r)
	}

	// Aparece en "mis reservas".
	code, body = e.do(t, "GET", "/api/portal/reservas", nil, tok)
	if code != 200 {
		t.Fatalf("%d", code)
	}
	mias := decode[[]reserva.Reserva](t, body)
	if len(mias) != 1 || mias[0].Codigo != r.Codigo {
		t.Fatalf("%+v", mias)
	}
}

func TestLoginDeHuesped(t *testing.T) {
	e := armar(t)
	e.registrar(t, "login@correo.pe")

	code, body := e.do(t, "POST", "/api/portal/login",
		map[string]string{"email": "LOGIN@correo.pe", "password": "una-clave-larga-1"}, "")
	if code != 200 {
		t.Fatalf("login: %d %s", code, body)
	}
	if s := decode[cliente.Sesion](t, body); s.Token == "" || s.Cliente.Email != "login@correo.pe" {
		t.Fatalf("%+v", s)
	}

	if code, _ := e.do(t, "POST", "/api/portal/login",
		map[string]string{"email": "login@correo.pe", "password": "incorrecta"}, ""); code != http.StatusUnauthorized {
		t.Fatalf("clave mala: %d", code)
	}
	// El mismo correo ya registrado.
	if code, _ := e.do(t, "POST", "/api/portal/registro", map[string]string{
		"nombre": "Otra", "email": "login@correo.pe", "password": "una-clave-larga-1",
	}, ""); code != http.StatusConflict {
		t.Fatalf("correo repetido: %d, esperaba 409", code)
	}
}

// --- dos monedas ---

// fijarTipoCambio registra el de hoy por la ruta del panel, como lo haría Finanzas.
func (e *entorno) fijarTipoCambio(t *testing.T, compra, venta string) {
	t.Helper()
	var uid int64
	if err := e.pool.QueryRow(context.Background(),
		`INSERT INTO usuario (nombre) VALUES ('Finanzas') RETURNING id`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	staff, _ := e.tokens.Emitir(uid)
	code, body := e.do(t, "POST", "/api/tipo-cambio", map[string]any{
		"fecha": hotel.Hoy().String(), "moneda": "USD", "compra": compra, "venta": venta,
	}, staff)
	if code != http.StatusOK {
		t.Fatalf("tipo de cambio: %d %s", code, body)
	}
}

func TestMonedasSoloOfreceDolaresSiHayTipoDeCambio(t *testing.T) {
	e := armar(t)

	code, body := e.do(t, "GET", "/api/portal/monedas", nil, "")
	if code != 200 {
		t.Fatalf("%d %s", code, body)
	}
	p := decode[moneda.Publico](t, body)
	if len(p.Monedas) != 2 || p.Monedas[0].Codigo != "PEN" || !p.Monedas[0].Base {
		t.Fatalf("%+v", p.Monedas)
	}
	if len(p.TipoCambio) != 0 {
		t.Fatalf("sin tipo de cambio no se ofrece dólares: %+v", p.TipoCambio)
	}

	e.fijarTipoCambio(t, "3.745", "3.752")
	_, body = e.do(t, "GET", "/api/portal/monedas", nil, "")
	p = decode[moneda.Publico](t, body)
	if p.TipoCambio["USD"].VentaMicro != 3_752_000 {
		t.Fatalf("%+v", p.TipoCambio)
	}
}

func TestCotizarYReservarEnDolares(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	deluxe := tipos["Habitación Deluxe"]
	tok, _ := e.registrar(t, "dolares@correo.pe")
	in, out := fechas(80, 2)
	usd := map[string]any{"moneda": "USD"}

	// Sin tipo de cambio no se cotiza en dólares, pero en soles sí.
	if code, body := e.do(t, "POST", "/api/portal/cotizar", solicitud(deluxe.ID, in, out, usd), ""); code != http.StatusBadRequest {
		t.Fatalf("sin tipo de cambio: %d %s, esperaba 400", code, body)
	}
	if code, _ := e.do(t, "POST", "/api/portal/cotizar", solicitud(deluxe.ID, in, out), ""); code != 200 {
		t.Fatalf("en soles: %d", code)
	}

	e.fijarTipoCambio(t, "3.745", "3.752")

	code, body := e.do(t, "POST", "/api/portal/cotizar", solicitud(deluxe.ID, in, out, usd), "")
	if code != 200 {
		t.Fatalf("%d %s", code, body)
	}
	q := decode[reserva.Cotizacion](t, body)
	noche := moneda.DePenA(deluxe.PrecioNocheCent, 3_752_000)
	if q.Moneda != "USD" || q.PrecioNocheCent != noche || q.SubtotalCent != noche*2 || q.TotalCent != noche*2 {
		t.Fatalf("%+v", q)
	}

	code, body = e.do(t, "POST", "/api/portal/reservas", solicitud(deluxe.ID, in, out, usd), tok)
	if code != http.StatusCreated {
		t.Fatalf("%d %s", code, body)
	}
	r := decode[reserva.Reserva](t, body)
	if r.Moneda != "USD" || r.TipoCambioMicro == nil || *r.TipoCambioMicro != 3_752_000 || r.TotalCent != q.TotalCent {
		t.Fatalf("%+v", r)
	}
	if r.TotalPenCent != moneda.APen(r.TotalCent, 3_752_000) {
		t.Fatalf("equivalente en soles = %d", r.TotalPenCent)
	}

	// Cambia el tipo de cambio: la reserva ya hecha conserva el suyo.
	e.fijarTipoCambio(t, "3.900", "3.910")
	_, body = e.do(t, "GET", "/api/portal/reservas", nil, tok)
	mias := decode[[]reserva.Reserva](t, body)
	if len(mias) != 1 || mias[0].TotalCent != r.TotalCent || *mias[0].TipoCambioMicro != 3_752_000 {
		t.Fatalf("la reserva debía conservar su tipo de cambio: %+v", mias)
	}

	// El panel la ve igual, con su equivalente en soles.
	staff, _ := e.tokens.Emitir(1)
	_, body = e.do(t, "GET", "/api/reserva", nil, staff)
	lista := decode[[]reserva.Reserva](t, body)
	if len(lista) != 1 || lista[0].Moneda != "USD" || lista[0].TotalPenCent != r.TotalPenCent {
		t.Fatalf("%+v", lista)
	}
}

func TestReservaEnSolesNoTieneTipoDeCambio(t *testing.T) {
	e := armar(t)
	_, tipos := e.tipos(t)
	tok, _ := e.registrar(t, "soles@correo.pe")
	in, out := fechas(90, 1)

	code, body := e.do(t, "POST", "/api/portal/reservas", solicitud(tipos["Habitación Deluxe"].ID, in, out), tok)
	if code != http.StatusCreated {
		t.Fatalf("%d %s", code, body)
	}
	r := decode[reserva.Reserva](t, body)
	if r.Moneda != "PEN" || r.TipoCambioMicro != nil || r.TotalPenCent != r.TotalCent {
		t.Fatalf("%+v", r)
	}
}

func TestTipoCambioDelPanelExigeSesionDePersonalYValida(t *testing.T) {
	e := armar(t)
	hoy := hotel.Hoy().String()
	body := map[string]any{"fecha": hoy, "moneda": "USD", "compra": "3.745", "venta": "3.752"}

	if code, _ := e.do(t, "POST", "/api/tipo-cambio", body, ""); code != http.StatusUnauthorized {
		t.Fatalf("sin sesión: %d", code)
	}
	tok, _ := e.registrar(t, "intruso@correo.pe")
	if code, _ := e.do(t, "POST", "/api/tipo-cambio", body, tok); code != http.StatusUnauthorized {
		t.Fatalf("un huésped no fija el tipo de cambio: %d", code)
	}

	var uid int64
	if err := e.pool.QueryRow(context.Background(), `INSERT INTO usuario (nombre) VALUES ('Finanzas') RETURNING id`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	staff, _ := e.tokens.Emitir(uid)
	body["venta"] = "3.700" // menor que la compra
	if code, _ := e.do(t, "POST", "/api/tipo-cambio", body, staff); code != http.StatusBadRequest {
		t.Fatalf("venta < compra: %d", code)
	}
	body["venta"] = 3.752 // un número JSON, no texto: no se acepta
	if code, _ := e.do(t, "POST", "/api/tipo-cambio", body, staff); code != http.StatusBadRequest {
		t.Fatalf("número en vez de texto: %d", code)
	}
}
