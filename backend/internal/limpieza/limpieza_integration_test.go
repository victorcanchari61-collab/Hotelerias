package limpieza_test

// Limpieza contra un PostgreSQL real: el ciclo check-out → sucia → limpia, el historial, el
// disparador que descarta limpiezas abiertas y la carrera de dos personas terminando la misma
// habitación. Se salta sola si no hay base:
//
//	TEST_DATABASE_URL="host=localhost port=5432 dbname=postgres user=postgres password=..." go test ./internal/limpieza/
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
	"hotelerias/backend/internal/habitacion"
	habitacionpg "hotelerias/backend/internal/habitacion/postgres"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/limpieza"
	limpiezapg "hotelerias/backend/internal/limpieza/postgres"
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
	schema := fmt.Sprintf("test_limpieza_%d", time.Now().UnixNano())
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
	return a.porUser[id], nil
}

type entorno struct {
	router   http.Handler
	pool     *pgxpool.Pool
	tokens   *auth.Tokens
	alcance  *alcanceDe
	estancia *estancia.Servicio
	admin    string
	adminID  int64
	sedes    []int64
	cliente  int64
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
	limpiezaSvc := limpieza.NewServicio(limpiezapg.NewStore(pool), hotel.Hoy, auditoria.Nop{})
	habitacionSvc := habitacion.NewServicio(habitacionpg.NewStore(pool), hotel.Hoy, auditoria.Nop{})
	router := httpx.NewRouter(nil)
	routes.Register(router, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Modules: []routes.Module{
			limpieza.NewHandler(limpiezaSvc, httpx.Guardas{}, alcance),
			habitacion.NewHandler(habitacionSvc, httpx.Guardas{}, habitacion.SinRestriccion{}),
		},
	})

	e := &entorno{
		router: router, pool: pool, tokens: tokens, alcance: alcance,
		estancia: estancia.NewServicio(estanciapg.NewStore(pool), hotel.Hoy, auditoria.Nop{}),
	}
	e.admin, e.adminID = e.usuario(t, "Admin", true)

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

func (e *entorno) usuario(t *testing.T, nombre string, activo bool) (string, int64) {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(context.Background(), `INSERT INTO usuario (nombre, activo) VALUES ($1, $2) RETURNING id`, nombre, activo).Scan(&id); err != nil {
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

func (e *entorno) habitacion(t *testing.T, sede int64, numero string) int64 {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(context.Background(), `SELECT id FROM habitacion WHERE sede_id = $1 AND numero = $2`, sede, numero).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (e *entorno) estado(t *testing.T, hab int64) string {
	t.Helper()
	var s string
	if err := e.pool.QueryRow(context.Background(), `SELECT estado FROM habitacion WHERE id = $1`, hab).Scan(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func (e *entorno) sql(t *testing.T, q string, args ...any) {
	t.Helper()
	if _, err := e.pool.Exec(context.Background(), q, args...); err != nil {
		t.Fatal(err)
	}
}

func (e *entorno) contar(t *testing.T, q string, args ...any) int {
	t.Helper()
	var n int
	if err := e.pool.QueryRow(context.Background(), q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (e *entorno) tablero(t *testing.T, tok string) []limpieza.Tarea {
	t.Helper()
	code, body := e.do(t, "GET", "/api/limpieza", nil, tok)
	if code != 200 {
		t.Fatalf("tablero: %d %s", code, body)
	}
	return decode[[]limpieza.Tarea](t, body)
}

func (e *entorno) tarea(t *testing.T, tok string, hab int64) (limpieza.Tarea, bool) {
	t.Helper()
	for _, x := range e.tablero(t, tok) {
		if x.HabitacionID == hab {
			return x, true
		}
	}
	return limpieza.Tarea{}, false
}

func (e *entorno) reserva(t *testing.T, sede int64, tipoNombre string, desdeHoy, noches int) int64 {
	t.Helper()
	var tipo, id int64
	if err := e.pool.QueryRow(context.Background(), `SELECT id FROM tipo_habitacion WHERE sede_id = $1 AND nombre = $2`, sede, tipoNombre).Scan(&tipo); err != nil {
		t.Fatal(err)
	}
	err := e.pool.QueryRow(context.Background(), `
		INSERT INTO reserva (codigo, cliente_id, sede_id, tipo_habitacion_id, check_in, check_out, huespedes, noches,
		                     precio_noche_cent, subtotal_cent, descuento_cent, total_cent, total_pen_cent)
		VALUES ($1,$2,$3,$4,$5,$6,2,$7,10000,$8,0,$8,$8) RETURNING id`,
		fmt.Sprintf("HV-LIM-%d", time.Now().UnixNano()), e.cliente, sede, tipo,
		hotel.Hoy().Mas(desdeHoy).Time(), hotel.Hoy().Mas(desdeHoy+noches).Time(), noches, 10000*noches).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func ruta(hab int64, accion string) string { return fmt.Sprintf("/api/limpieza/%d/%s", hab, accion) }

func TestElCicloCompletoCheckoutSuciaLimpia(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	h101 := e.habitacion(t, sede, "101")
	camarera, camareraID := e.usuario(t, "Rosa Camarera", true)
	_ = camarera

	// 1. Un huésped hace check-in y check-out de la 101: queda SUCIA.
	res := e.reserva(t, sede, "Habitación Deluxe", 0, 2)
	est, err := e.estancia.CheckIn(context.Background(), estancia.CheckIn{
		ReservaID: res, HabitacionID: h101,
		Ficha: estancia.Ficha{DocumentoTipo: estancia.DNI, DocumentoNumero: "12345678", NombreCompleto: "Lucía Vega", Nacionalidad: "Peruana", Domiciliado: true},
	}, e.adminID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.estancia.CheckOut(context.Background(), est.ID, e.adminID, nil); err != nil {
		t.Fatal(err)
	}
	if got := e.estado(t, h101); got != "sucia" {
		t.Fatalf("tras el check-out debía quedar sucia: %s", got)
	}

	// 2. Aparece en el tablero, sin asignar.
	tarea, ok := e.tarea(t, e.admin, h101)
	if !ok || tarea.Estado != limpieza.Pendiente || tarea.AsignadaA != nil || tarea.Numero != "101" {
		t.Fatalf("tarea: %+v ok=%v", tarea, ok)
	}

	// 3. Se asigna a Rosa.
	code, body := e.do(t, "PUT", ruta(h101, "asignacion"), map[string]any{"usuarioId": camareraID}, e.admin)
	if code != http.StatusNoContent {
		t.Fatalf("asignar: %d %s", code, body)
	}
	if tarea, _ = e.tarea(t, e.admin, h101); tarea.Estado != limpieza.Asignada || tarea.AsignadaANombre != "Rosa Camarera" {
		t.Fatalf("%+v", tarea)
	}

	// 4. Ella la empieza.
	if code, body := e.do(t, "POST", ruta(h101, "iniciar"), nil, e.admin); code != http.StatusNoContent {
		t.Fatalf("iniciar: %d %s", code, body)
	}
	if tarea, _ = e.tarea(t, e.admin, h101); tarea.Estado != limpieza.EnCurso || tarea.IniciadaEn == nil {
		t.Fatalf("%+v", tarea)
	}
	if code, _ := e.do(t, "POST", ruta(h101, "iniciar"), nil, e.admin); code != http.StatusConflict {
		t.Fatalf("iniciar dos veces: %d", code)
	}
	// Una en curso no se desasigna.
	if code, _ := e.do(t, "PUT", ruta(h101, "asignacion"), map[string]any{"usuarioId": nil}, e.admin); code != http.StatusConflict {
		t.Fatalf("quitar al responsable de una en curso: %d", code)
	}

	// 5. La termina: la habitación queda LIMPIA, sale del tablero y entra al historial.
	if code, body := e.do(t, "POST", ruta(h101, "terminar"), map[string]any{"observaciones": "  cambié sábanas  "}, e.admin); code != http.StatusNoContent {
		t.Fatalf("terminar: %d %s", code, body)
	}
	if got := e.estado(t, h101); got != "limpia" {
		t.Fatalf("estado = %s", got)
	}
	if _, ok := e.tarea(t, e.admin, h101); ok {
		t.Fatal("ya no debe estar en el tablero")
	}
	if n := e.contar(t, `SELECT count(*) FROM limpieza WHERE habitacion_id = $1 AND estado <> 'terminada'`, h101); n != 0 {
		t.Fatalf("quedaron %d limpiezas abiertas", n)
	}

	code, body = e.do(t, "GET", "/api/limpieza/historial", nil, e.admin)
	if code != 200 {
		t.Fatalf("historial: %d", code)
	}
	hist := decode[[]limpieza.Terminada](t, body)
	if len(hist) != 1 || hist[0].Numero != "101" || hist[0].AsignadaANombre != "Rosa Camarera" || hist[0].Observaciones != "cambié sábanas" || hist[0].Minutos == nil {
		t.Fatalf("historial: %+v", hist)
	}

	// 6. Ya se puede volver a asignar a un huésped (es lo que cerraba el ciclo).
	res2 := e.reserva(t, sede, "Habitación Deluxe", 0, 1)
	if _, err := e.estancia.CheckIn(context.Background(), estancia.CheckIn{
		ReservaID: res2, HabitacionID: h101,
		Ficha: estancia.Ficha{DocumentoTipo: estancia.DNI, DocumentoNumero: "87654321", NombreCompleto: "Otro Huésped", Nacionalidad: "Peruana", Domiciliado: true},
	}, e.adminID, nil); err != nil {
		t.Fatalf("la 101 limpia debía poder asignarse: %v", err)
	}
}

func TestLimpiarSinHaberAsignadoNiIniciadoTambienQuedaRegistrado(t *testing.T) {
	e := armar(t)
	h := e.habitacion(t, e.sedes[0], "102")
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = $1`, h)

	if code, body := e.do(t, "POST", ruta(h, "terminar"), nil, e.admin); code != http.StatusNoContent {
		t.Fatalf("%d %s", code, body)
	}
	if got := e.estado(t, h); got != "limpia" {
		t.Fatalf("estado = %s", got)
	}
	_, body := e.do(t, "GET", "/api/limpieza/historial", nil, e.admin)
	hist := decode[[]limpieza.Terminada](t, body)
	if len(hist) != 1 || hist[0].TerminadaPor != "Admin" || hist[0].Minutos != nil {
		t.Fatalf("%+v", hist)
	}
}

func TestSoloSeTrabajaSobreHabitacionesSucias(t *testing.T) {
	e := armar(t)
	h := e.habitacion(t, e.sedes[0], "101") // limpia
	for _, accion := range []string{"iniciar", "terminar"} {
		if code, _ := e.do(t, "POST", ruta(h, accion), nil, e.admin); code != http.StatusConflict {
			t.Errorf("%s en una limpia: %d", accion, code)
		}
	}
	if code, _ := e.do(t, "PUT", ruta(h, "asignacion"), map[string]any{"usuarioId": e.adminID}, e.admin); code != http.StatusConflict {
		t.Errorf("asignar una limpia: %d", code)
	}
	if code, _ := e.do(t, "POST", ruta(999999, "terminar"), nil, e.admin); code != http.StatusNotFound {
		t.Errorf("inexistente: %d", code)
	}
	if n := e.contar(t, `SELECT count(*) FROM limpieza`); n != 0 {
		t.Fatalf("no debió registrar nada: %d", n)
	}
}

func TestAsignarSoloAPersonalActivo(t *testing.T) {
	e := armar(t)
	h := e.habitacion(t, e.sedes[0], "101")
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = $1`, h)
	_, inactivo := e.usuario(t, "Ex empleado", false)

	for nombre, id := range map[string]int64{"desactivado": inactivo, "inexistente": 999999} {
		if code, _ := e.do(t, "PUT", ruta(h, "asignacion"), map[string]any{"usuarioId": id}, e.admin); code != http.StatusBadRequest {
			t.Errorf("%s: %d", nombre, code)
		}
	}
	// El personal que se ofrece no incluye a los desactivados.
	_, body := e.do(t, "GET", "/api/limpieza/personal", nil, e.admin)
	for _, p := range decode[[]limpieza.Persona](t, body) {
		if p.ID == inactivo {
			t.Fatal("se ofreció a una persona desactivada")
		}
	}

	// Asignar y volver a quitar al responsable.
	_, activa := e.usuario(t, "Rosa", true)
	if code, _ := e.do(t, "PUT", ruta(h, "asignacion"), map[string]any{"usuarioId": activa}, e.admin); code != http.StatusNoContent {
		t.Fatal(code)
	}
	if code, _ := e.do(t, "PUT", ruta(h, "asignacion"), map[string]any{"usuarioId": nil}, e.admin); code != http.StatusNoContent {
		t.Fatal(code)
	}
	if n := e.contar(t, `SELECT count(*) FROM limpieza WHERE habitacion_id = $1`, h); n != 0 {
		t.Fatalf("quitar al responsable de una asignada debía borrar la fila: %d", n)
	}
}

func TestSiLaHabitacionDejaDeEstarSuciaSeDescartaLaLimpiezaAbierta(t *testing.T) {
	e := armar(t)
	h := e.habitacion(t, e.sedes[0], "101")
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = $1`, h)
	_, rosa := e.usuario(t, "Rosa", true)
	if code, _ := e.do(t, "PUT", ruta(h, "asignacion"), map[string]any{"usuarioId": rosa}, e.admin); code != http.StatusNoContent {
		t.Fatal(code)
	}

	// Pasa a mantenimiento por otro camino.
	e.sql(t, `UPDATE habitacion SET estado = 'mantenimiento' WHERE id = $1`, h)
	if n := e.contar(t, `SELECT count(*) FROM limpieza WHERE habitacion_id = $1 AND estado <> 'terminada'`, h); n != 0 {
		t.Fatalf("la limpieza abierta debía descartarse: %d", n)
	}
	// Cuando vuelva a ensuciarse, no reaparece la asignación vieja.
	e.sql(t, `UPDATE habitacion SET estado = 'limpia' WHERE id = $1`, h)
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = $1`, h)
	if tarea, ok := e.tarea(t, e.admin, h); !ok || tarea.Estado != limpieza.Pendiente || tarea.AsignadaA != nil {
		t.Fatalf("%+v ok=%v", tarea, ok)
	}
}

func TestLaPrioridadSaleDeLasLlegadasQueFaltanPorHabitacionLimpia(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	// La sede tiene 2 Suites Presidenciales: las dos sucias y una llegada hoy → urgentes.
	var presidenciales []int64
	rows, err := e.pool.Query(context.Background(), `
		SELECT h.id FROM habitacion h JOIN tipo_habitacion t ON t.id = h.tipo_habitacion_id
		WHERE h.sede_id = $1 AND t.nombre = 'Suite Presidencial'`, sede)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id int64
		_ = rows.Scan(&id)
		presidenciales = append(presidenciales, id)
	}
	rows.Close()
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = ANY($1)`, presidenciales)
	e.reserva(t, sede, "Suite Presidencial", 0, 2)

	// Una Deluxe también sucia, pero hay 11 limpias y ninguna llegada de ese tipo: no es urgente.
	deluxe := e.habitacion(t, sede, "101")
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = $1`, deluxe)

	tablero := e.tablero(t, e.admin)
	if len(tablero) != 3 {
		t.Fatalf("tablero: %d filas", len(tablero))
	}
	for i, tarea := range tablero {
		urgente := tarea.HabitacionID != deluxe
		if tarea.Urgente != urgente {
			t.Errorf("fila %d (%s): urgente = %v; quiero %v", i, tarea.Numero, tarea.Urgente, urgente)
		}
	}
	// Las urgentes van primero.
	if !tablero[0].Urgente || !tablero[1].Urgente || tablero[2].Urgente {
		t.Fatalf("las urgentes debían ir primero: %+v", tablero)
	}

	// Al limpiar una presidencial ya hay 1 limpia para 1 llegada: la otra deja de ser urgente.
	if code, _ := e.do(t, "POST", ruta(presidenciales[0], "terminar"), nil, e.admin); code != http.StatusNoContent {
		t.Fatal(code)
	}
	if tarea, ok := e.tarea(t, e.admin, presidenciales[1]); !ok || tarea.Urgente {
		t.Fatalf("%+v ok=%v", tarea, ok)
	}
}

func TestDosPersonasTerminandoLaMismaHabitacion(t *testing.T) {
	e := armar(t)
	h := e.habitacion(t, e.sedes[0], "101")
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = $1`, h)

	const n = 6
	var wg sync.WaitGroup
	codigos := make([]int, n)
	for i := range codigos {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codigos[i], _ = e.do(t, "POST", ruta(h, "terminar"), nil, e.admin)
		}()
	}
	wg.Wait()

	ok := 0
	for _, c := range codigos {
		switch c {
		case http.StatusNoContent:
			ok++
		case http.StatusConflict:
		default:
			t.Fatalf("códigos inesperados: %v", codigos)
		}
	}
	if ok != 1 {
		t.Fatalf("%d terminaron la misma limpieza (códigos %v); debía ser exactamente 1", ok, codigos)
	}
	if n := e.contar(t, `SELECT count(*) FROM limpieza WHERE habitacion_id = $1 AND estado = 'terminada'`, h); n != 1 {
		t.Fatalf("el historial tiene %d filas para una sola limpieza", n)
	}
}

func TestUnaSuciaSeLiberaDesdeLimpiezaNoDesdeHabitaciones(t *testing.T) {
	e := armar(t)
	h := e.habitacion(t, e.sedes[0], "101")
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = $1`, h)

	patch := func(estado string) int {
		code, _ := e.do(t, "PATCH", fmt.Sprintf("/api/habitacion/%d/estado", h), map[string]string{"estado": estado}, e.admin)
		return code
	}
	if code := patch("limpia"); code != http.StatusConflict {
		t.Fatalf("sucia → limpia por Habitaciones: %d, esperaba 409", code)
	}
	if got := e.estado(t, h); got != "sucia" {
		t.Fatalf("no debió cambiar: %s", got)
	}
	// Lo demás sigue como antes: a mantenimiento, y de mantenimiento a limpia (arreglada).
	if code := patch("mantenimiento"); code != 200 {
		t.Fatalf("a mantenimiento: %d", code)
	}
	if code := patch("limpia"); code != 200 {
		t.Fatalf("mantenimiento → limpia: %d", code)
	}
}

func TestAlcancePorHotelYSesion(t *testing.T) {
	e := armar(t)
	primero, segundo := e.sedes[0], e.sedes[1]
	h1, h2 := e.habitacion(t, primero, "101"), e.habitacion(t, segundo, "101")
	e.sql(t, `UPDATE habitacion SET estado = 'sucia' WHERE id = ANY($1)`, []int64{h1, h2})

	gerente, id := e.usuario(t, "Gerente del segundo", true)
	e.alcance.porUser[id] = []int64{segundo}
	ninguno, id2 := e.usuario(t, "Sin hotel", true)
	e.alcance.porUser[id2] = []int64{}

	if _, ok := e.tarea(t, gerente, h1); ok {
		t.Fatal("vio una habitación de otro hotel")
	}
	if _, ok := e.tarea(t, gerente, h2); !ok {
		t.Fatal("no vio la de su hotel")
	}
	if got := e.tablero(t, ninguno); len(got) != 0 {
		t.Fatalf("sin hoteles asignados no debe ver nada: %d", len(got))
	}
	for _, accion := range []string{"iniciar", "terminar"} {
		if code, _ := e.do(t, "POST", ruta(h1, accion), nil, gerente); code != http.StatusNotFound {
			t.Errorf("%s en otro hotel: %d", accion, code)
		}
	}
	if code, _ := e.do(t, "PUT", ruta(h1, "asignacion"), map[string]any{"usuarioId": id}, gerente); code != http.StatusNotFound {
		t.Errorf("asignar en otro hotel: %d", code)
	}
	if got := e.estado(t, h1); got != "sucia" {
		t.Fatalf("la de otro hotel no debía cambiar: %s", got)
	}

	for _, c := range []struct{ metodo, ruta string }{
		{"GET", "/api/limpieza"}, {"GET", "/api/limpieza/historial"}, {"GET", "/api/limpieza/personal"},
		{"POST", ruta(h1, "terminar")}, {"POST", ruta(h1, "iniciar")}, {"PUT", ruta(h1, "asignacion")},
	} {
		if code, _ := e.do(t, c.metodo, c.ruta, map[string]any{}, ""); code != http.StatusUnauthorized {
			t.Errorf("%s %s sin sesión: %d", c.metodo, c.ruta, code)
		}
	}
}
