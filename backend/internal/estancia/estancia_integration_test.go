package estancia_test

// Recepción contra un PostgreSQL real: check-in y check-out, las reglas de la habitación, el
// candado cuando dos recepcionistas asignan la misma habitación y el alcance por hotel.
// Se salta sola si no hay base:
//
//	TEST_DATABASE_URL="host=localhost port=5432 dbname=postgres user=postgres password=..." go test ./internal/estancia/
//
// IMPORTANTE: sin TEST_DATABASE_URL estas pruebas se SALTAN y `go test` igual sale en verde.
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
	"hotelerias/backend/config"
	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/demo"
	"hotelerias/backend/internal/estancia"
	estanciapg "hotelerias/backend/internal/estancia/postgres"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/platform/migrate"
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
	schema := fmt.Sprintf("test_estancia_%d", time.Now().UnixNano())
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

type alcanceDe struct {
	mu      sync.Mutex
	porUser map[int64][]int64
}

func (a *alcanceDe) SedesVisibles(_ context.Context, id int64) ([]int64, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.porUser[id], nil // ausente = nil = todos
}

type entorno struct {
	router  http.Handler
	pool    *pgxpool.Pool
	tokens  *auth.Tokens
	alcance *alcanceDe
	admin   string
	adminID int64
	sedes   []int64
	cliente int64
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

	alcance := &alcanceDe{porUser: map[int64][]int64{}}
	svc := estancia.NewServicio(estanciapg.NewStore(pool), hotel.Hoy, auditoria.Nop{})
	router := httpx.NewRouter(nil)
	routes.Register(router, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Modules:      []routes.Module{estancia.NewHandler(svc, httpx.Guardas{}, httpx.Guardas{}, alcance)},
	})

	e := &entorno{router: router, pool: pool, tokens: tokens, alcance: alcance}
	e.admin, e.adminID = e.usuario(t, "Admin")

	rows, err := pool.Query(ctx, `SELECT id FROM sede ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		e.sedes = append(e.sedes, id)
	}
	rows.Close()

	if err := pool.QueryRow(ctx, `INSERT INTO cliente (nombre, apellido, email, password_hash)
		VALUES ('Lucía', 'Vega', 'lucia@correo.pe', 'x') RETURNING id`).Scan(&e.cliente); err != nil {
		t.Fatal(err)
	}
	return e
}

func (e *entorno) usuario(t *testing.T, nombre string) (string, int64) {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(context.Background(), `INSERT INTO usuario (nombre) VALUES ($1) RETURNING id`, nombre).Scan(&id); err != nil {
		t.Fatal(err)
	}
	tok, _ := e.tokens.Emitir(id)
	return tok, id
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

func (e *entorno) tipo(t *testing.T, sede int64, nombre string) int64 {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(context.Background(),
		`SELECT id FROM tipo_habitacion WHERE sede_id = $1 AND nombre = $2`, sede, nombre).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// reserva inserta una reserva del hotel/tipo que empieza en `desdeHoy` (puede ser negativo) y dura `noches`.
func (e *entorno) reserva(t *testing.T, sede, tipo int64, desdeHoy, noches int, estado string) int64 {
	t.Helper()
	var id int64
	err := e.pool.QueryRow(context.Background(), `
		INSERT INTO reserva (codigo, cliente_id, sede_id, tipo_habitacion_id, check_in, check_out, huespedes, noches,
		                     precio_noche_cent, subtotal_cent, descuento_cent, total_cent, total_pen_cent, estado)
		VALUES ($1,$2,$3,$4,$5,$6,2,$7,10000,$8,0,$8,$8,$9) RETURNING id`,
		fmt.Sprintf("HV-REC-%d", time.Now().UnixNano()), e.cliente, sede, tipo,
		hotel.Hoy().Mas(desdeHoy).Time(), hotel.Hoy().Mas(desdeHoy+noches).Time(), noches, 10000*noches, estado).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

// habitacion devuelve el id de la habitación `numero` del hotel.
func (e *entorno) habitacion(t *testing.T, sede int64, numero string) int64 {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(context.Background(),
		`SELECT id FROM habitacion WHERE sede_id = $1 AND numero = $2`, sede, numero).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (e *entorno) estadoHab(t *testing.T, id int64) string {
	t.Helper()
	var s string
	if err := e.pool.QueryRow(context.Background(), `SELECT estado FROM habitacion WHERE id = $1`, id).Scan(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func (e *entorno) estadoReserva(t *testing.T, id int64) string {
	t.Helper()
	var s string
	if err := e.pool.QueryRow(context.Background(), `SELECT estado FROM reserva WHERE id = $1`, id).Scan(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func ficha() map[string]any {
	return map[string]any{
		"documentoTipo": "dni", "documentoNumero": "12345678", "nombreCompleto": "Lucía Vega",
		"nacionalidad": "Peruana", "domiciliado": true, "fechaIngresoPais": nil, "telefono": "999111222",
	}
}

func (e *entorno) checkIn(t *testing.T, reserva, hab int64, f map[string]any, tok string) (int, []byte) {
	t.Helper()
	return e.do(t, "POST", "/api/estancia", map[string]any{"reservaId": reserva, "habitacionId": hab, "ficha": f}, tok)
}

func (e *entorno) panel(t *testing.T, tok string) []estancia.Movimiento {
	t.Helper()
	code, body := e.do(t, "GET", "/api/estancia", nil, tok)
	if code != 200 {
		t.Fatalf("panel: %d %s", code, body)
	}
	return decode[[]estancia.Movimiento](t, body)
}

func hallar(ms []estancia.Movimiento, reserva int64) (estancia.Movimiento, bool) {
	for _, m := range ms {
		if m.ReservaID == reserva {
			return m, true
		}
	}
	return estancia.Movimiento{}, false
}

func TestElFlujoCompletoDeUnaEstadia(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	deluxe := e.tipo(t, sede, "Habitación Deluxe")
	res := e.reserva(t, sede, deluxe, 0, 2, "confirmada")
	h101 := e.habitacion(t, sede, "101")

	// 1. Aparece como llegada de hoy.
	if m, ok := hallar(e.panel(t, e.admin), res); !ok || m.Fase != estancia.Llegada || m.Huesped != "Lucía Vega" || m.EstanciaID != nil {
		t.Fatalf("llegada: %+v ok=%v", m, ok)
	}

	// 2. Las habitaciones que se le pueden dar: las limpias de su tipo.
	code, body := e.do(t, "GET", fmt.Sprintf("/api/estancia/habitaciones?reservaId=%d", res), nil, e.admin)
	if code != 200 {
		t.Fatalf("libres: %d %s", code, body)
	}
	libres := decode[[]estancia.HabitacionLibre](t, body)
	if len(libres) != 12 || libres[0].Numero != "101" {
		t.Fatalf("libres = %+v", libres)
	}

	// 3. Check-in.
	code, body = e.checkIn(t, res, h101, ficha(), e.admin)
	if code != http.StatusCreated {
		t.Fatalf("check-in: %d %s", code, body)
	}
	est := decode[estancia.Estancia](t, body)
	if est.Estado != "en_casa" || est.HabitacionNumero != "101" || est.ReservaID != res {
		t.Fatalf("%+v", est)
	}
	if got := e.estadoHab(t, h101); got != "ocupada" {
		t.Fatalf("habitación = %s", got)
	}
	if got := e.estadoReserva(t, res); got != "confirmada" {
		t.Fatalf("la reserva sigue confirmada mientras el huésped está en casa: %s", got)
	}
	m, ok := hallar(e.panel(t, e.admin), res)
	if !ok || m.Fase != estancia.EnCasa || m.HabitacionNumero != "101" || m.Huesped != "Lucía Vega" || m.EstanciaID == nil {
		t.Fatalf("en casa: %+v", m)
	}
	// La 101 ya no se ofrece.
	_, body = e.do(t, "GET", fmt.Sprintf("/api/estancia/habitaciones?reservaId=%d", res), nil, e.admin)
	if l := decode[[]estancia.HabitacionLibre](t, body); len(l) != 11 || l[0].Numero == "101" {
		t.Fatalf("libres tras el check-in: %+v", l)
	}

	// 4. La ficha se puede leer.
	code, body = e.do(t, "GET", fmt.Sprintf("/api/ficha-registro/%d", est.ID), nil, e.admin)
	if code != 200 {
		t.Fatalf("ficha: %d %s", code, body)
	}
	if f := decode[estancia.Ficha](t, body); f.DocumentoNumero != "12345678" || f.NombreCompleto != "Lucía Vega" || !f.Domiciliado {
		t.Fatalf("%+v", f)
	}

	// 5. Check-out: la habitación queda SUCIA y la reserva completada.
	code, body = e.do(t, "POST", fmt.Sprintf("/api/estancia/%d/check-out", est.ID), nil, e.admin)
	if code != 200 {
		t.Fatalf("check-out: %d %s", code, body)
	}
	if out := decode[estancia.Estancia](t, body); out.Estado != "finalizada" || out.CheckOutEn == nil {
		t.Fatalf("%+v", out)
	}
	if got := e.estadoHab(t, h101); got != "sucia" {
		t.Fatalf("tras el check-out la habitación debe quedar sucia, está %s", got)
	}
	if got := e.estadoReserva(t, res); got != "completada" {
		t.Fatalf("reserva = %s", got)
	}
	if _, ok := hallar(e.panel(t, e.admin), res); ok {
		t.Fatal("ya no debe salir en el panel")
	}
	// No se repite.
	if code, _ := e.do(t, "POST", fmt.Sprintf("/api/estancia/%d/check-out", est.ID), nil, e.admin); code != http.StatusConflict {
		t.Fatalf("segundo check-out: %d", code)
	}
}

func TestLaHabitacionDebeSerApta(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	deluxe := e.tipo(t, sede, "Habitación Deluxe")
	res := e.reserva(t, sede, deluxe, 0, 2, "confirmada")
	h101 := e.habitacion(t, sede, "101")

	poner := func(id int64, sql string) {
		t.Helper()
		if _, err := e.pool.Exec(context.Background(), sql, id); err != nil {
			t.Fatal(err)
		}
	}
	rechaza := func(nombre string, hab int64) {
		t.Helper()
		code, body := e.checkIn(t, res, hab, ficha(), e.admin)
		if code != http.StatusConflict {
			t.Fatalf("%s: %d %s, esperaba 409", nombre, code, body)
		}
		var n int
		_ = e.pool.QueryRow(context.Background(), `SELECT count(*) FROM estancia`).Scan(&n)
		if n != 0 {
			t.Fatalf("%s: dejó %d estancias", nombre, n)
		}
	}

	poner(h101, `UPDATE habitacion SET estado = 'sucia' WHERE id = $1`)
	rechaza("sucia", h101)
	poner(h101, `UPDATE habitacion SET estado = 'mantenimiento' WHERE id = $1`)
	rechaza("en mantenimiento", h101)
	poner(h101, `UPDATE habitacion SET estado = 'ocupada' WHERE id = $1`)
	rechaza("ocupada", h101)
	poner(h101, `UPDATE habitacion SET estado = 'limpia', activa = false WHERE id = $1`)
	rechaza("desactivada", h101)

	// De otro tipo (una suite) y de otro hotel.
	suite := e.habitacion(t, sede, "201")
	rechaza("otro tipo", suite)
	rechaza("otro hotel", e.habitacion(t, e.sedes[1], "101"))
	rechaza("inexistente", 999999)
}

func TestLaReservaDebeEstarVigenteYEnFechas(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	deluxe := e.tipo(t, sede, "Habitación Deluxe")
	h := e.habitacion(t, sede, "101")

	futura := e.reserva(t, sede, deluxe, 2, 2, "confirmada")
	if code, body := e.checkIn(t, futura, h, ficha(), e.admin); code != http.StatusConflict {
		t.Fatalf("antes de la fecha de entrada: %d %s", code, body)
	}
	vencida := e.reserva(t, sede, deluxe, -5, 2, "confirmada")
	if code, body := e.checkIn(t, vencida, h, ficha(), e.admin); code != http.StatusConflict {
		t.Fatalf("estadía ya terminada: %d %s", code, body)
	}
	cancelada := e.reserva(t, sede, deluxe, 0, 2, "cancelada")
	if code, body := e.checkIn(t, cancelada, h, ficha(), e.admin); code != http.StatusConflict {
		t.Fatalf("cancelada: %d %s", code, body)
	}
	if code, _ := e.checkIn(t, 999999, h, ficha(), e.admin); code != http.StatusNotFound {
		t.Fatalf("reserva inexistente: %d", code)
	}

	// Una llegada tardía (la reserva empezó ayer y sigue vigente) sí se puede recibir.
	tardia := e.reserva(t, sede, deluxe, -1, 3, "confirmada")
	if code, body := e.checkIn(t, tardia, h, ficha(), e.admin); code != http.StatusCreated {
		t.Fatalf("llegada tardía: %d %s", code, body)
	}
	// Y no se registra dos veces.
	if code, _ := e.checkIn(t, tardia, e.habitacion(t, sede, "102"), ficha(), e.admin); code != http.StatusConflict {
		t.Fatalf("segundo check-in de la misma reserva: %d", code)
	}
}

func TestLaFichaSeValidaYLaDeUnExtranjeroLlevaSuFechaDeIngreso(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	deluxe := e.tipo(t, sede, "Habitación Deluxe")
	res := e.reserva(t, sede, deluxe, 0, 2, "confirmada")
	h := e.habitacion(t, sede, "101")

	mala := ficha()
	mala["documentoNumero"] = "123"
	if code, _ := e.checkIn(t, res, h, mala, e.admin); code != http.StatusBadRequest {
		t.Fatalf("DNI corto: %d", code)
	}

	extranjero := ficha()
	extranjero["documentoTipo"], extranjero["documentoNumero"] = "pasaporte", "x1234567"
	extranjero["nacionalidad"], extranjero["domiciliado"] = "Estadounidense", false
	if code, _ := e.checkIn(t, res, h, extranjero, e.admin); code != http.StatusBadRequest {
		t.Fatalf("no domiciliado sin fecha de ingreso: %d", code)
	}
	extranjero["fechaIngresoPais"] = hotel.Hoy().Mas(1).String()
	if code, _ := e.checkIn(t, res, h, extranjero, e.admin); code != http.StatusBadRequest {
		t.Fatalf("fecha de ingreso futura: %d", code)
	}
	extranjero["fechaIngresoPais"] = hotel.Hoy().Mas(-4).String()
	code, body := e.checkIn(t, res, h, extranjero, e.admin)
	if code != http.StatusCreated {
		t.Fatalf("extranjero: %d %s", code, body)
	}

	_, fb := e.do(t, "GET", fmt.Sprintf("/api/ficha-registro/%d", decode[estancia.Estancia](t, body).ID), nil, e.admin)
	f := decode[estancia.Ficha](t, fb)
	if f.DocumentoNumero != "X1234567" || f.Domiciliado || f.FechaIngresoPais == nil || f.FechaIngresoPais.String() != hotel.Hoy().Mas(-4).String() {
		t.Fatalf("%+v", f)
	}
}

func TestDosRecepcionistasNoAsignanLaMismaHabitacion(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	deluxe := e.tipo(t, sede, "Habitación Deluxe")
	h := e.habitacion(t, sede, "101")

	const n = 6
	reservas := make([]int64, n)
	for i := range reservas {
		reservas[i] = e.reserva(t, sede, deluxe, 0, 2, "confirmada")
	}
	var wg sync.WaitGroup
	codigos := make([]int, n)
	for i := range reservas {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codigos[i], _ = e.checkIn(t, reservas[i], h, ficha(), e.admin)
		}()
	}
	wg.Wait()

	creadas := 0
	for _, c := range codigos {
		if c == http.StatusCreated {
			creadas++
		} else if c != http.StatusConflict {
			t.Fatalf("códigos inesperados: %v", codigos)
		}
	}
	if creadas != 1 {
		t.Fatalf("%d check-ins aceptados para la misma habitación (códigos %v); debía ser exactamente 1", creadas, codigos)
	}
	var abiertas int
	_ = e.pool.QueryRow(context.Background(), `SELECT count(*) FROM estancia WHERE habitacion_id = $1 AND estado = 'en_casa'`, h).Scan(&abiertas)
	if abiertas != 1 {
		t.Fatalf("estancias abiertas en la habitación: %d", abiertas)
	}
}

func TestElAlcancePorHotel(t *testing.T) {
	e := armar(t)
	primero, segundo := e.sedes[0], e.sedes[1]
	tipo1 := e.tipo(t, primero, "Habitación Deluxe")
	tipo2 := e.tipo(t, segundo, "Habitación Deluxe")
	r1 := e.reserva(t, primero, tipo1, 0, 2, "confirmada")
	r2 := e.reserva(t, segundo, tipo2, 0, 2, "confirmada")

	gerente, id := e.usuario(t, "Gerente del segundo")
	e.alcance.porUser[id] = []int64{segundo}
	ninguno, id2 := e.usuario(t, "Sin hotel")
	e.alcance.porUser[id2] = []int64{}

	panel := e.panel(t, gerente)
	if _, ok := hallar(panel, r1); ok {
		t.Fatal("vio una llegada de otro hotel")
	}
	if _, ok := hallar(panel, r2); !ok {
		t.Fatal("no vio la de su hotel")
	}
	if got := e.panel(t, ninguno); len(got) != 0 {
		t.Fatalf("sin hoteles asignados no debe ver nada: %d", len(got))
	}

	// La reserva ajena responde como inexistente, y la propia sí se atiende.
	if code, _ := e.checkIn(t, r1, e.habitacion(t, primero, "101"), ficha(), gerente); code != http.StatusNotFound {
		t.Fatalf("check-in en otro hotel: %d", code)
	}
	if code, _ := e.do(t, "GET", fmt.Sprintf("/api/estancia/habitaciones?reservaId=%d", r1), nil, gerente); code != http.StatusNotFound {
		t.Fatalf("habitaciones de una reserva ajena: %d", code)
	}
	code, body := e.checkIn(t, r2, e.habitacion(t, segundo, "101"), ficha(), gerente)
	if code != http.StatusCreated {
		t.Fatalf("check-in en su hotel: %d %s", code, body)
	}
	estId := decode[estancia.Estancia](t, body).ID

	// La estancia de otro hotel: ni check-out ni ficha.
	otro, _ := e.checkIn(t, r1, e.habitacion(t, primero, "101"), ficha(), e.admin)
	if otro != http.StatusCreated {
		t.Fatalf("admin: %d", otro)
	}
	var ajena int64
	_ = e.pool.QueryRow(context.Background(), `SELECT id FROM estancia WHERE reserva_id = $1`, r1).Scan(&ajena)
	if code, _ := e.do(t, "POST", fmt.Sprintf("/api/estancia/%d/check-out", ajena), nil, gerente); code != http.StatusNotFound {
		t.Fatalf("check-out ajeno: %d", code)
	}
	if code, _ := e.do(t, "GET", fmt.Sprintf("/api/ficha-registro/%d", ajena), nil, gerente); code != http.StatusNotFound {
		t.Fatalf("ficha ajena: %d", code)
	}
	if code, _ := e.do(t, "GET", fmt.Sprintf("/api/ficha-registro/%d", estId), nil, gerente); code != 200 {
		t.Fatalf("ficha propia: %d", code)
	}
}

func TestExigeSesionDePersonal(t *testing.T) {
	e := armar(t)
	for _, c := range []struct{ metodo, ruta string }{
		{"GET", "/api/estancia"}, {"POST", "/api/estancia"}, {"POST", "/api/estancia/1/check-out"}, {"GET", "/api/ficha-registro/1"},
	} {
		if code, _ := e.do(t, c.metodo, c.ruta, map[string]any{}, ""); code != http.StatusUnauthorized {
			t.Errorf("%s %s sin sesión: %d", c.metodo, c.ruta, code)
		}
	}
}
