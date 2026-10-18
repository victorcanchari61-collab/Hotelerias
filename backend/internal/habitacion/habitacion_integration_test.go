package habitacion_test

// Habitaciones contra un PostgreSQL real: el disparador que mantiene la
// cantidad de cada tipo, el candado que protege a las reservas, el lote y el
// alcance por hotel. Se salta sola si no hay base:
//
//	TEST_DATABASE_URL="host=localhost port=5432 dbname=postgres user=postgres password=..." go test ./internal/habitacion/
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
	"hotelerias/backend/internal/habitacion"
	habitacionpg "hotelerias/backend/internal/habitacion/postgres"
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
	schema := fmt.Sprintf("test_habitacion_%d", time.Now().UnixNano())
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

// alcanceDe da a cada usuario los hoteles que se le asignen en la prueba.
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
	admin   string // token de quien lo ve todo
	sedes   []int64
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
	svc := habitacion.NewServicio(habitacionpg.NewStore(pool), hotel.Hoy, auditoria.Nop{})
	router := httpx.NewRouter(nil)
	routes.Register(router, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Modules:      []routes.Module{habitacion.NewHandler(svc, httpx.Guardas{}, alcance)},
	})

	e := &entorno{router: router, pool: pool, tokens: tokens, alcance: alcance}
	e.admin = e.usuario(t, "Admin")

	rows, err := pool.Query(ctx, `SELECT id FROM sede ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		e.sedes = append(e.sedes, id)
	}
	return e
}

// usuario crea una cuenta de personal y devuelve su token.
func (e *entorno) usuario(t *testing.T, nombre string) string {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(context.Background(), `INSERT INTO usuario (nombre) VALUES ($1) RETURNING id`, nombre).Scan(&id); err != nil {
		t.Fatal(err)
	}
	tok, _ := e.tokens.Emitir(id)
	return tok
}

func (e *entorno) idDe(t *testing.T, tok string) int64 {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(context.Background(), `SELECT max(id) FROM usuario`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
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

// cantidad es lo que la web usa para vender el tipo.
func (e *entorno) cantidad(t *testing.T, tipoID int64) int {
	t.Helper()
	var n int
	if err := e.pool.QueryRow(context.Background(), `SELECT cantidad FROM tipo_habitacion WHERE id = $1`, tipoID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (e *entorno) tipo(t *testing.T, sedeID int64, nombre string) int64 {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(context.Background(),
		`SELECT id FROM tipo_habitacion WHERE sede_id = $1 AND nombre = $2`, sedeID, nombre).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (e *entorno) habitaciones(t *testing.T, tok string) []habitacion.Habitacion {
	t.Helper()
	code, body := e.do(t, "GET", "/api/habitacion", nil, tok)
	if code != 200 {
		t.Fatalf("listar: %d %s", code, body)
	}
	return decode[[]habitacion.Habitacion](t, body)
}

func porNumero(hs []habitacion.Habitacion, sedeID int64, numero string) (habitacion.Habitacion, bool) {
	for _, h := range hs {
		if h.SedeID == sedeID && h.Numero == numero {
			return h, true
		}
	}
	return habitacion.Habitacion{}, false
}

// reservar inserta `n` reservas confirmadas del tipo para unas fechas futuras (directo en la base).
func (e *entorno) reservar(t *testing.T, sedeID, tipoID int64, n int) {
	t.Helper()
	ctx := context.Background()
	var cliente int64
	if err := e.pool.QueryRow(ctx, `
		INSERT INTO cliente (nombre, email, password_hash) VALUES ('Ana', $1, 'x') RETURNING id`,
		fmt.Sprintf("ana%d@correo.pe", time.Now().UnixNano())).Scan(&cliente); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < n; i++ {
		if _, err := e.pool.Exec(ctx, `
			INSERT INTO reserva (codigo, cliente_id, sede_id, tipo_habitacion_id, check_in, check_out, huespedes, noches,
			                     precio_noche_cent, subtotal_cent, descuento_cent, total_cent, total_pen_cent)
			VALUES ($1,$2,$3,$4, current_date + 30, current_date + 33, 2, 3, 10000, 30000, 0, 30000, 30000)`,
			fmt.Sprintf("HV-INT-%d-%d", time.Now().UnixNano(), i), cliente, sedeID, tipoID); err != nil {
			t.Fatal(err)
		}
	}
}

func TestLaSiembraYLaCantidadDelTipoCuadran(t *testing.T) {
	e := armar(t)
	hs := e.habitaciones(t, e.admin)
	if len(hs) == 0 {
		t.Fatal("la siembra debía crear habitaciones físicas")
	}

	// Por cada tipo, su `cantidad` (lo que vende la web) es exactamente cuántas habitaciones activas tiene.
	rows, err := e.pool.Query(context.Background(), `
		SELECT t.nombre, t.cantidad, (SELECT count(*) FROM habitacion h WHERE h.tipo_habitacion_id = t.id AND h.activa)
		FROM tipo_habitacion t`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var nombre string
		var cantidad, reales int
		if err := rows.Scan(&nombre, &cantidad, &reales); err != nil {
			t.Fatal(err)
		}
		if cantidad != reales || cantidad == 0 {
			t.Errorf("%s: cantidad %d, habitaciones activas %d", nombre, cantidad, reales)
		}
	}
	if h, ok := porNumero(hs, e.sedes[0], "101"); !ok || h.Piso != 1 || h.Estado != habitacion.Limpia {
		t.Fatalf("la 101 debía existir limpia en el piso 1: %+v", h)
	}
}

func TestCrearYDesactivarMueveLaCantidadDelTipo(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	suite := e.tipo(t, sede, "Suite Presidencial")
	antes := e.cantidad(t, suite)

	code, body := e.do(t, "POST", "/api/habitacion", map[string]any{
		"tipoHabitacionId": suite, "numero": "ph-9", "piso": 9, "notas": "vista al mar", "activa": true,
	}, e.admin)
	if code != http.StatusCreated {
		t.Fatalf("crear: %d %s", code, body)
	}
	h := decode[habitacion.Habitacion](t, body)
	if h.Numero != "PH-9" || h.SedeID != sede || h.Estado != habitacion.Limpia {
		t.Fatalf("%+v", h)
	}
	if got := e.cantidad(t, suite); got != antes+1 {
		t.Fatalf("cantidad tras crear = %d; quiero %d", got, antes+1)
	}

	// Repetir el número en el mismo hotel es un conflicto; en otro hotel, no.
	if code, _ := e.do(t, "POST", "/api/habitacion", map[string]any{"tipoHabitacionId": suite, "numero": "PH-9", "piso": 9, "activa": true}, e.admin); code != http.StatusConflict {
		t.Fatalf("número repetido: %d", code)
	}
	otraSuite := e.tipo(t, e.sedes[1], "Suite Presidencial")
	if code, body := e.do(t, "POST", "/api/habitacion", map[string]any{"tipoHabitacionId": otraSuite, "numero": "PH-9", "piso": 9, "activa": true}, e.admin); code != http.StatusCreated {
		t.Fatalf("mismo número en otro hotel: %d %s", code, body)
	}

	// Desactivarla la saca de la venta.
	code, body = e.do(t, "PUT", fmt.Sprintf("/api/habitacion/%d", h.ID), map[string]any{
		"tipoHabitacionId": suite, "numero": "PH-9", "piso": 9, "activa": false,
	}, e.admin)
	if code != 200 {
		t.Fatalf("desactivar: %d %s", code, body)
	}
	if got := e.cantidad(t, suite); got != antes {
		t.Fatalf("cantidad tras desactivar = %d; quiero %d", got, antes)
	}
}

func TestNoSePuedeQuitarUnaHabitacionQueUnaReservaNecesita(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	suite := e.tipo(t, sede, "Suite Presidencial") // la demo trae 2
	if got := e.cantidad(t, suite); got != 2 {
		t.Fatalf("la demo debía traer 2 presidenciales: %d", got)
	}
	e.reservar(t, sede, suite, 2) // las dos ocupadas el mismo día

	hs := e.habitaciones(t, e.admin)
	var propias []habitacion.Habitacion
	for _, h := range hs {
		if h.TipoHabitacionID == suite {
			propias = append(propias, h)
		}
	}
	quitar := func(h habitacion.Habitacion) int {
		code, _ := e.do(t, "PUT", fmt.Sprintf("/api/habitacion/%d", h.ID), map[string]any{
			"tipoHabitacionId": suite, "numero": h.Numero, "piso": h.Piso, "activa": false,
		}, e.admin)
		return code
	}
	if code := quitar(propias[0]); code != http.StatusConflict {
		t.Fatalf("con 2 reservas simultáneas y 2 habitaciones, quitar una: %d, esperaba 409", code)
	}
	if got := e.cantidad(t, suite); got != 2 {
		t.Fatalf("el rechazo debía revertir todo; cantidad = %d", got)
	}

	// Agrego una tercera y ahora sí se puede quitar una.
	if code, _ := e.do(t, "POST", "/api/habitacion", map[string]any{"tipoHabitacionId": suite, "numero": "PH-3", "piso": 9, "activa": true}, e.admin); code != http.StatusCreated {
		t.Fatal(code)
	}
	if code := quitar(propias[0]); code != 200 {
		t.Fatalf("con 3 habitaciones y 2 reservas, quitar una: %d", code)
	}
	if got := e.cantidad(t, suite); got != 2 {
		t.Fatalf("cantidad = %d; quiero 2", got)
	}
}

func TestDosPersonasQuitandoALaVezNoDejanReservasSinHabitacion(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	ejecutiva := e.tipo(t, sede, "Suite Ejecutiva") // la demo trae 6
	e.reservar(t, sede, ejecutiva, 4)               // 4 simultáneas: se pueden quitar a lo más 2

	var propias []habitacion.Habitacion
	for _, h := range e.habitaciones(t, e.admin) {
		if h.TipoHabitacionID == ejecutiva {
			propias = append(propias, h)
		}
	}

	// Seis personas intentan desactivar una cada una al mismo tiempo.
	var wg sync.WaitGroup
	codigos := make([]int, len(propias))
	for i, h := range propias {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codigos[i], _ = e.do(t, "PUT", fmt.Sprintf("/api/habitacion/%d", h.ID), map[string]any{
				"tipoHabitacionId": ejecutiva, "numero": h.Numero, "piso": h.Piso, "activa": false,
			}, e.admin)
		}()
	}
	wg.Wait()

	if got := e.cantidad(t, ejecutiva); got < 4 {
		t.Fatalf("quedaron %d habitaciones para 4 reservas simultáneas (códigos %v)", got, codigos)
	}
	var activas int
	_ = e.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM habitacion WHERE tipo_habitacion_id = $1 AND activa`, ejecutiva).Scan(&activas)
	if activas != e.cantidad(t, ejecutiva) {
		t.Fatalf("activas %d ≠ cantidad %d", activas, e.cantidad(t, ejecutiva))
	}
}

func TestLote(t *testing.T) {
	e := armar(t)
	sede := e.sedes[0]
	deluxe := e.tipo(t, sede, "Habitación Deluxe")
	antes := e.cantidad(t, deluxe)

	code, body := e.do(t, "POST", "/api/habitacion/lote", map[string]any{"tipoHabitacionId": deluxe, "piso": 5, "desde": 501, "hasta": 510}, e.admin)
	if code != http.StatusCreated {
		t.Fatalf("lote: %d %s", code, body)
	}
	if got := decode[struct{ Creadas int }](t, body).Creadas; got != 10 {
		t.Fatalf("creadas = %d", got)
	}
	if got := e.cantidad(t, deluxe); got != antes+10 {
		t.Fatalf("cantidad = %d; quiero %d", got, antes+10)
	}

	// Un lote que pisa números existentes no crea NINGUNA.
	code, body = e.do(t, "POST", "/api/habitacion/lote", map[string]any{"tipoHabitacionId": deluxe, "piso": 5, "desde": 505, "hasta": 515}, e.admin)
	if code != http.StatusConflict {
		t.Fatalf("lote repetido: %d %s", code, body)
	}
	var n int
	_ = e.pool.QueryRow(context.Background(), `SELECT count(*) FROM habitacion WHERE sede_id = $1 AND numero IN ('511','512','513','514','515')`, sede).Scan(&n)
	if n != 0 {
		t.Fatalf("el lote rechazado dejó %d habitaciones a medias", n)
	}
	if code, _ := e.do(t, "POST", "/api/habitacion/lote", map[string]any{"tipoHabitacionId": deluxe, "piso": 5, "desde": 1, "hasta": 500}, e.admin); code != http.StatusBadRequest {
		t.Fatalf("lote enorme: %d", code)
	}
}

func TestEstadoDeLaHabitacion(t *testing.T) {
	e := armar(t)
	h, _ := porNumero(e.habitaciones(t, e.admin), e.sedes[0], "101")

	cambiar := func(estado string) int {
		code, _ := e.do(t, "PATCH", fmt.Sprintf("/api/habitacion/%d/estado", h.ID), map[string]string{"estado": estado}, e.admin)
		return code
	}
	if code := cambiar("sucia"); code != 200 {
		t.Fatalf("sucia: %d", code)
	}
	if got, _ := porNumero(e.habitaciones(t, e.admin), e.sedes[0], "101"); got.Estado != habitacion.Sucia {
		t.Fatalf("estado = %s", got.Estado)
	}
	if code := cambiar("mantenimiento"); code != 200 {
		t.Fatalf("mantenimiento: %d", code)
	}
	if code := cambiar("ocupada"); code != http.StatusBadRequest {
		t.Fatalf("ocupada a mano: %d", code)
	}
	// El estado operativo NO reduce lo que se vende.
	deluxe := e.tipo(t, e.sedes[0], "Habitación Deluxe")
	if got := e.cantidad(t, deluxe); got != 12 {
		t.Fatalf("una en mantenimiento no debe bajar la cantidad vendible: %d", got)
	}
	// Una ocupada (la pondrá el check-in) no se toca a mano.
	if _, err := e.pool.Exec(context.Background(), `UPDATE habitacion SET estado = 'ocupada' WHERE id = $1`, h.ID); err != nil {
		t.Fatal(err)
	}
	if code := cambiar("limpia"); code != http.StatusConflict {
		t.Fatalf("tocar una ocupada: %d", code)
	}
}

func TestAlcancePorHotel(t *testing.T) {
	e := armar(t)
	soloPrimero := e.usuario(t, "Gerente de sede")
	e.alcance.porUser[e.idDe(t, soloPrimero)] = []int64{e.sedes[0]}
	sinHoteles := e.usuario(t, "Sin sede")
	e.alcance.porUser[e.idDe(t, sinHoteles)] = []int64{}

	for _, h := range e.habitaciones(t, soloPrimero) {
		if h.SedeID != e.sedes[0] {
			t.Fatalf("vio una habitación de otro hotel: %+v", h)
		}
	}
	if got := e.habitaciones(t, sinHoteles); len(got) != 0 {
		t.Fatalf("sin hoteles asignados no debe ver nada: %d", len(got))
	}

	todas := e.habitaciones(t, e.admin)
	ajena, _ := porNumero(todas, e.sedes[1], "101")
	// Editar o cambiar el estado de una ajena responde como si no existiera.
	if code, _ := e.do(t, "PATCH", fmt.Sprintf("/api/habitacion/%d/estado", ajena.ID), map[string]string{"estado": "sucia"}, soloPrimero); code != http.StatusNotFound {
		t.Fatalf("estado de una ajena: %d", code)
	}
	if code, _ := e.do(t, "PUT", fmt.Sprintf("/api/habitacion/%d", ajena.ID), map[string]any{
		"tipoHabitacionId": ajena.TipoHabitacionID, "numero": "999", "piso": 1, "activa": true,
	}, soloPrimero); code != http.StatusNotFound {
		t.Fatalf("editar una ajena: %d", code)
	}
	// Y no puede crear en un tipo ajeno.
	if code, _ := e.do(t, "POST", "/api/habitacion", map[string]any{"tipoHabitacionId": ajena.TipoHabitacionID, "numero": "888", "piso": 1, "activa": true}, soloPrimero); code != http.StatusBadRequest {
		t.Fatalf("crear en un tipo ajeno: %d", code)
	}

	// Las opciones del formulario también se acotan.
	code, body := e.do(t, "GET", "/api/habitacion/opciones", nil, soloPrimero)
	if code != 200 {
		t.Fatal(code)
	}
	op := decode[habitacion.Opciones](t, body)
	if len(op.Sedes) != 1 || op.Sedes[0].ID != e.sedes[0] {
		t.Fatalf("sedes: %+v", op.Sedes)
	}
	for _, tp := range op.Tipos {
		if tp.SedeID != e.sedes[0] {
			t.Fatalf("tipo de otro hotel: %+v", tp)
		}
	}
}

func TestExigeSesionDePersonal(t *testing.T) {
	e := armar(t)
	if code, _ := e.do(t, "GET", "/api/habitacion", nil, ""); code != http.StatusUnauthorized {
		t.Fatalf("sin sesión: %d", code)
	}
	if code, _ := e.do(t, "POST", "/api/habitacion/lote", map[string]any{}, ""); code != http.StatusUnauthorized {
		t.Fatalf("lote sin sesión: %d", code)
	}
}
