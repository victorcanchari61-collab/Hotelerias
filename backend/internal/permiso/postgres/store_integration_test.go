package postgres_test

// Prueba de integración contra un Postgres real. Se salta sola si no hay uno:
//
//	TEST_DATABASE_URL="host=localhost port=5432 dbname=postgres user=postgres password=..." go test ./internal/permiso/postgres/
//
// Trabaja en un schema temporal que borra al terminar, así que no toca datos.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/config"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/permiso"
	"hotelerias/backend/internal/permiso/postgres"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/platform/migrate"
	"hotelerias/backend/internal/routes"
	"hotelerias/backend/migrations"
)

type fixture struct {
	pool                                          *pgxpool.Pool
	store                                         *postgres.Store
	vendedor, almacenero, admin, inactivo, sinRol int64 // usuarios
	rolVendedor, rolAlmacenero                    int64
}

func nuevoFixture(t *testing.T) *fixture {
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
	schema := fmt.Sprintf("test_permiso_%d", time.Now().UnixNano())
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
	cfg.MaxConns = 30
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	applied, err := migrate.Up(ctx, pool, migrations.FS)
	if err != nil {
		t.Fatalf("migraciones: %v", err)
	}
	if len(applied) == 0 {
		t.Fatal("no se aplicó ninguna migración")
	}
	// Idempotente: la segunda vez no hace nada.
	if again, err := migrate.Up(ctx, pool, migrations.FS); err != nil || len(again) != 0 {
		t.Fatalf("segunda corrida: %v %v", again, err)
	}

	f := &fixture{pool: pool, store: postgres.NewStore(pool)}
	f.sembrar(t)
	return f
}

func (f *fixture) sembrar(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	usuario := func(nombre string, activo bool) (id int64) {
		must(f.pool.QueryRow(ctx,
			`INSERT INTO usuario (nombre, activo) VALUES ($1, $2) RETURNING id`, nombre, activo).Scan(&id))
		return id
	}
	rolID := func(nombre string) (id int64) {
		must(f.pool.QueryRow(ctx, `SELECT id FROM rol WHERE nombre = $1`, nombre).Scan(&id))
		return id
	}
	asignar := func(u, r int64) {
		_, err := f.pool.Exec(ctx, `INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2)`, u, r)
		must(err)
	}
	permiso := func(r int64, sub, acc string) {
		_, err := f.pool.Exec(ctx,
			`INSERT INTO rol_permiso (rol_id, submodulo, accion) VALUES ($1, $2, $3)`, r, sub, acc)
		must(err)
	}

	f.rolVendedor, f.rolAlmacenero = rolID("Vendedor"), rolID("Almacenero")
	permiso(f.rolVendedor, "fact.pedidos", "ver")
	permiso(f.rolVendedor, "fact.pedidos", "crear")
	permiso(f.rolVendedor, "fact.notaventa", "ver")
	permiso(f.rolVendedor, "fact.notaventa", "crear")
	permiso(f.rolAlmacenero, "inv.stock", "ver")
	permiso(f.rolAlmacenero, "inv.almacenes", "ver")

	f.vendedor = usuario("Vendedor Uno", true)
	asignar(f.vendedor, f.rolVendedor)

	f.almacenero = usuario("Mixto", true) // vende y lleva el almacén
	asignar(f.almacenero, f.rolVendedor)
	asignar(f.almacenero, f.rolAlmacenero)

	f.admin = usuario("Admin", true)
	asignar(f.admin, rolID("Administrador"))

	f.inactivo = usuario("Inactivo", false)
	asignar(f.inactivo, f.rolVendedor)

	f.sinRol = usuario("Sin rol", true)
}

func (f *fixture) excepcion(t *testing.T, usuario int64, sub, acc, vig string, expira *time.Time, usos int, revocado bool) int64 {
	t.Helper()
	var id int64
	err := f.pool.QueryRow(context.Background(), `
		INSERT INTO usuario_permiso (usuario_id, submodulo, accion, vigencia, expira_en, usos, revocado)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		usuario, sub, acc, vig, expira, usos, revocado).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestRolesDe(t *testing.T) {
	f := nuevoFixture(t)
	ctx := context.Background()

	casos := []struct {
		nombre  string
		usuario int64
		roles   int
		total   bool
	}{
		{"un rol", f.vendedor, 1, false},
		{"varios roles", f.almacenero, 2, false},
		{"administrador", f.admin, 1, true},
		{"inactivo no tiene nada", f.inactivo, 0, false},
		{"sin rol", f.sinRol, 0, false},
		{"inexistente", 99999, 0, false},
	}
	for _, tc := range casos {
		t.Run(tc.nombre, func(t *testing.T) {
			r, err := f.store.RolesDe(ctx, tc.usuario)
			if err != nil {
				t.Fatal(err)
			}
			if len(r.RolIDs) != tc.roles || r.AccesoTotal != tc.total {
				t.Fatalf("got %+v", r)
			}
		})
	}
}

func TestPermisosDeRol(t *testing.T) {
	f := nuevoFixture(t)
	claves, err := f.store.PermisosDeRol(context.Background(), f.rolVendedor)
	if err != nil || len(claves) != 4 {
		t.Fatalf("claves=%v err=%v", claves, err)
	}
	if vacio, err := f.store.PermisosDeRol(context.Background(), 99999); err != nil || len(vacio) != 0 {
		t.Fatalf("rol inexistente: %v %v", vacio, err)
	}
}

func TestVigentesFiltraLoQueNoSirve(t *testing.T) {
	f := nuevoFixture(t)
	ctx := context.Background()
	ahora := time.Now()
	futuro, pasado := ahora.Add(time.Hour), ahora.Add(-time.Hour)

	buena := f.excepcion(t, f.vendedor, "fact.notaventa", "anular", "permanente", nil, 0, false)
	temp := f.excepcion(t, f.vendedor, "fact.notaventa", "editar", "temporal", &futuro, 0, false)
	unaVez := f.excepcion(t, f.vendedor, "fact.pedidos", "anular", "una_vez", nil, 0, false)
	f.excepcion(t, f.vendedor, "inv.ajustes", "crear", "permanente", nil, 0, true)     // revocada
	f.excepcion(t, f.vendedor, "inv.ajustes", "anular", "temporal", &pasado, 0, false) // vencida
	f.excepcion(t, f.vendedor, "inv.ajustes", "editar", "una_vez", nil, 1, false)      // gastada
	f.excepcion(t, f.almacenero, "inv.ajustes", "ver", "permanente", nil, 0, false)    // de otro

	got, err := f.store.VigentesDe(ctx, f.vendedor, ahora)
	if err != nil {
		t.Fatal(err)
	}
	ids := []int64{}
	for _, e := range got {
		ids = append(ids, e.ID)
		if !e.Vigente(ahora) {
			t.Errorf("el store devolvió una no vigente: %+v", e)
		}
	}
	if want := []int64{buena, temp, unaVez}; !slices.Equal(ids, want) {
		t.Fatalf("ids=%v esperaba %v", ids, want)
	}
}

func TestReservarEsAtomico(t *testing.T) {
	f := nuevoFixture(t)
	ctx := context.Background()
	id := f.excepcion(t, f.vendedor, "fact.notaventa", "anular", "una_vez", nil, 0, false)

	var ganadores atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 25; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, err := f.store.Reservar(ctx, id)
			if err != nil {
				t.Error(err)
			}
			if ok {
				ganadores.Add(1)
			}
		}()
	}
	wg.Wait()
	if ganadores.Load() != 1 {
		t.Fatalf("%d peticiones consiguieron un permiso de UN solo uso", ganadores.Load())
	}

	// Gastada: ya no aparece como vigente.
	got, _ := f.store.VigentesDe(ctx, f.vendedor, time.Now())
	if len(got) != 0 {
		t.Fatalf("una gastada no debe ser vigente: %+v", got)
	}

	// Soltada: vuelve a servir.
	if err := f.store.Liberar(ctx, id); err != nil {
		t.Fatal(err)
	}
	if ok, _ := f.store.Reservar(ctx, id); !ok {
		t.Fatal("tras liberar debía poder reservarse de nuevo")
	}
}

func TestReservarNoTocaPermanentesNiRevocadas(t *testing.T) {
	f := nuevoFixture(t)
	ctx := context.Background()
	perm := f.excepcion(t, f.vendedor, "fact.notaventa", "anular", "permanente", nil, 0, false)
	rev := f.excepcion(t, f.vendedor, "fact.notaventa", "editar", "una_vez", nil, 0, true)

	for _, id := range []int64{perm, rev, 99999} {
		if ok, err := f.store.Reservar(ctx, id); ok || err != nil {
			t.Errorf("Reservar(%d) = %v, %v; debía ser false", id, ok, err)
		}
	}
}

// --- de punta a punta: JWT real, router real, Postgres real ---

func (f *fixture) servidor(t *testing.T) (*httptest.Server, *auth.Tokens) {
	t.Helper()
	tokens, err := auth.NewTokens(config.JwtSettings{
		SecretKey: "clave-de-integracion-de-al-menos-32-bytes!!", Issuer: "i", Audience: "a", ExpirationHours: 1,
	})
	if err != nil {
		t.Fatal(err)
	}

	gin.SetMode(gin.TestMode)
	svc := permiso.NewService(permiso.Permisos, f.store,
		permiso.NewCachedRoles(f.store, memCache{}), f.store)
	guard := permiso.NewGuard(permiso.Permisos, svc, svc)

	r := httpx.NewRouter(nil)
	routes.Register(r, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Modules: []routes.Module{
			permiso.NewHandler(permiso.Permisos, svc),
			rutasDePrueba{guard},
		},
	})
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, tokens
}

// rutasDePrueba son dos endpoints de "negocio" protegidos por el Guard.
type rutasDePrueba struct{ g *permiso.Guard }

func (m rutasDePrueba) Register(r gin.IRouter) {
	r.POST("/notaventa/anular", m.g.Require("fact.notaventa", permiso.Anular),
		func(c *gin.Context) {
			if c.Query("falla") == "1" {
				_ = c.Error(httpx.BadRequest("la nota ya estaba anulada"))
				return
			}
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})
	r.GET("/stock", m.g.RequireAny("inv.stock:ver", "fact.pedidos:ver"),
		func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
}

type memCache struct{}

func (memCache) Get(context.Context, string) ([]byte, bool)               { return nil, false }
func (memCache) Set(context.Context, string, []byte, time.Duration) error { return nil }
func (memCache) Delete(context.Context, string) error                     { return nil }

func llamar(t *testing.T, srv *httptest.Server, token, method, path string) (int, []byte) {
	t.Helper()
	req, _ := http.NewRequest(method, srv.URL+path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var buf [1 << 16]byte
	n, _ := resp.Body.Read(buf[:])
	return resp.StatusCode, buf[:n]
}

func TestPuntaAPunta(t *testing.T) {
	f := nuevoFixture(t)
	srv, tokens := f.servidor(t)
	tok := func(id int64) string { s, _ := tokens.Emitir(id); return s }

	t.Run("sin token es 401", func(t *testing.T) {
		if code, _ := llamar(t, srv, "", "GET", "/api/permiso/mios"); code != 401 {
			t.Fatalf("code=%d", code)
		}
	})

	t.Run("health es público", func(t *testing.T) {
		if code, _ := llamar(t, srv, "", "GET", "/api/health"); code != 200 {
			t.Fatalf("code=%d", code)
		}
	})

	t.Run("mios del vendedor", func(t *testing.T) {
		code, body := llamar(t, srv, tok(f.vendedor), "GET", "/api/permiso/mios")
		var mios []string
		_ = json.Unmarshal(body, &mios)
		want := []string{"fact.notaventa:crear", "fact.notaventa:ver", "fact.pedidos:crear", "fact.pedidos:ver"}
		if code != 200 || !slices.Equal(mios, want) {
			t.Fatalf("code=%d mios=%v", code, mios)
		}
	})

	t.Run("mios de quien tiene dos roles es la unión", func(t *testing.T) {
		_, body := llamar(t, srv, tok(f.almacenero), "GET", "/api/permiso/mios")
		var mios []string
		_ = json.Unmarshal(body, &mios)
		for _, want := range []string{"fact.pedidos:ver", "inv.stock:ver", "inv.almacenes:ver"} {
			if !slices.Contains(mios, want) {
				t.Errorf("falta %s en %v", want, mios)
			}
		}
	})

	t.Run("el administrador tiene todo", func(t *testing.T) {
		_, body := llamar(t, srv, tok(f.admin), "GET", "/api/permiso/mios")
		var mios []string
		_ = json.Unmarshal(body, &mios)
		if len(mios) != len(permiso.Permisos.Claves()) {
			t.Fatalf("%d de %d", len(mios), len(permiso.Permisos.Claves()))
		}
	})

	t.Run("inactivo con token válido no tiene nada", func(t *testing.T) {
		code, body := llamar(t, srv, tok(f.inactivo), "GET", "/api/permiso/mios")
		if code != 200 || string(body) != "[]" {
			t.Fatalf("code=%d body=%s", code, body)
		}
		if code, _ := llamar(t, srv, tok(f.inactivo), "POST", "/api/notaventa/anular"); code != 403 {
			t.Fatalf("un inactivo no debe pasar el guard: %d", code)
		}
	})

	t.Run("catálogo", func(t *testing.T) {
		code, body := llamar(t, srv, tok(f.vendedor), "GET", "/api/permiso/catalogo")
		var cat []permiso.Submodulo
		if err := json.Unmarshal(body, &cat); err != nil || code != 200 || len(cat) != 56 {
			t.Fatalf("code=%d n=%d err=%v", code, len(cat), err)
		}
		if cat[0].Clave != "dashboard.ventas" || cat[0].Modulo != "dashboard" {
			t.Fatalf("debe conservar el orden del menú: %+v", cat[0])
		}
	})

	t.Run("403 trae qué faltaba", func(t *testing.T) {
		code, body := llamar(t, srv, tok(f.vendedor), "POST", "/api/notaventa/anular")
		var p struct {
			StatusCode        int
			Submodulo, Accion string
		}
		_ = json.Unmarshal(body, &p)
		if code != 403 || p.Submodulo != "fact.notaventa" || p.Accion != "anular" {
			t.Fatalf("code=%d %s", code, body)
		}
	})

	t.Run("RequireAny deja pasar con cualquiera", func(t *testing.T) {
		if code, _ := llamar(t, srv, tok(f.vendedor), "GET", "/api/stock"); code != 200 { // por pedidos:ver
			t.Fatalf("code=%d", code)
		}
		if code, _ := llamar(t, srv, tok(f.sinRol), "GET", "/api/stock"); code != 403 {
			t.Fatalf("code=%d", code)
		}
	})
}

func TestPermisoDeUnSoloUsoDePuntaAPunta(t *testing.T) {
	f := nuevoFixture(t)
	srv, tokens := f.servidor(t)
	token, _ := tokens.Emitir(f.vendedor)
	id := f.excepcion(t, f.vendedor, "fact.notaventa", "anular", "una_vez", nil, 0, false)

	usos := func() int {
		var n int
		_ = f.pool.QueryRow(context.Background(), `SELECT usos FROM usuario_permiso WHERE id=$1`, id).Scan(&n)
		return n
	}

	// El permiso aparece en /mios mientras no se gaste.
	_, body := llamar(t, srv, token, "GET", "/api/permiso/mios")
	if !slices.Contains(mustStrings(t, body), "fact.notaventa:anular") {
		t.Fatalf("la excepción vigente debe aparecer en mios: %s", body)
	}

	// Una operación que falla NO la gasta.
	if code, _ := llamar(t, srv, token, "POST", "/api/notaventa/anular?falla=1"); code != 400 {
		t.Fatalf("code=%d", code)
	}
	if usos() != 0 {
		t.Fatalf("una operación fallida gastó el permiso (usos=%d)", usos())
	}

	// Una exitosa sí.
	if code, _ := llamar(t, srv, token, "POST", "/api/notaventa/anular"); code != 200 {
		t.Fatalf("code=%d", code)
	}
	if usos() != 1 {
		t.Fatalf("usos=%d, debía quedar gastado", usos())
	}

	// La siguiente ya no puede, y el permiso desaparece de mios.
	if code, _ := llamar(t, srv, token, "POST", "/api/notaventa/anular"); code != 403 {
		t.Fatalf("code=%d", code)
	}
	_, body = llamar(t, srv, token, "GET", "/api/permiso/mios")
	if slices.Contains(mustStrings(t, body), "fact.notaventa:anular") {
		t.Fatal("un permiso gastado no debe seguir en mios")
	}
}

func TestPermisoDeUnSoloUsoEnParalelo(t *testing.T) {
	f := nuevoFixture(t)
	srv, tokens := f.servidor(t)
	token, _ := tokens.Emitir(f.vendedor)
	f.excepcion(t, f.vendedor, "fact.notaventa", "anular", "una_vez", nil, 0, false)

	var exitos atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if code, _ := llamar(t, srv, token, "POST", "/api/notaventa/anular"); code == 200 {
				exitos.Add(1)
			}
		}()
	}
	wg.Wait()
	if exitos.Load() != 1 {
		t.Fatalf("%d operaciones se ejecutaron con un permiso de UN solo uso", exitos.Load())
	}
}

func mustStrings(t *testing.T, b []byte) []string {
	t.Helper()
	var s []string
	if err := json.Unmarshal(b, &s); err != nil {
		t.Fatalf("%v: %s", err, b)
	}
	return s
}
