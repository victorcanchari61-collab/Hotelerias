package postgres_test

// Prueba de integración contra un Postgres real. Se salta sola si no hay uno:
//
//	TEST_DATABASE_URL="host=localhost port=5432 dbname=postgres user=postgres password=" go test ./internal/usuario/postgres/
//
// Trabaja en un schema temporal que borra al terminar: no toca tus datos.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"hotelerias/backend/config"
	"hotelerias/backend/internal/auditoria"
	auditoriapg "hotelerias/backend/internal/auditoria/postgres"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/cliente"
	"hotelerias/backend/internal/empresa"
	empresapg "hotelerias/backend/internal/empresa/postgres"
	"hotelerias/backend/internal/hotel"
	hotelpg "hotelerias/backend/internal/hotel/postgres"
	"hotelerias/backend/internal/permiso"
	permisopg "hotelerias/backend/internal/permiso/postgres"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/platform/migrate"
	"hotelerias/backend/internal/reserva"
	reservapg "hotelerias/backend/internal/reserva/postgres"
	"hotelerias/backend/internal/rol"
	rolpg "hotelerias/backend/internal/rol/postgres"
	"hotelerias/backend/internal/routes"
	"hotelerias/backend/internal/usuario"
	"hotelerias/backend/internal/usuario/postgres"
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
	schema := fmt.Sprintf("test_usuario_%d", time.Now().UnixNano())
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

// hasher barato para que las pruebas no tarden segundos.
var barato = auth.Bcrypt{Cost: bcrypt.MinCost}

func TestCrearAdministradorYBuscarlo(t *testing.T) {
	pool := nuevoPool(t)
	s := postgres.NewStore(pool)
	ctx := context.Background()

	hash, _ := barato.Hash("clave-larga-123")
	if err := s.CrearAdministrador(ctx, usuario.NuevaCuenta{Nombre: "Super Admin", Email: "Admin@Hotel.pe", PasswordHash: hash}); err != nil {
		t.Fatal(err)
	}

	// Búsqueda sin distinguir mayúsculas.
	c, err := s.PorEmail(ctx, "admin@HOTEL.pe")
	if err != nil {
		t.Fatal(err)
	}
	if c.Nombre != "Super Admin" || !c.Activo || c.PasswordHash != hash {
		t.Fatalf("cuenta: %+v", c)
	}
	// Quedó con el rol de acceso total.
	if c.RolNombre != "Administrador" || c.RolID == nil {
		t.Fatalf("rol: %v %q", c.RolID, c.RolNombre)
	}
	// Y la clave en la base es un hash, no la clave.
	if strings.Contains(c.PasswordHash, "clave-larga-123") {
		t.Fatal("se guardó la clave en claro")
	}

	if porID, err := s.PorID(ctx, c.ID); err != nil || porID.Email != c.Email {
		t.Fatalf("PorID: %+v %v", porID, err)
	}
	if _, err := s.PorEmail(ctx, "nadie@hotel.pe"); err != usuario.ErrNoEncontrada {
		t.Fatalf("inexistente: %v", err)
	}
	if _, err := s.PorID(ctx, 99999); err != usuario.ErrNoEncontrada {
		t.Fatalf("id inexistente: %v", err)
	}
}

func TestCorreoDuplicadoSeRechazaSinDejarFilasHuerfanas(t *testing.T) {
	pool := nuevoPool(t)
	s := postgres.NewStore(pool)
	ctx := context.Background()

	if err := s.CrearAdministrador(ctx, usuario.NuevaCuenta{Nombre: "A", Email: "x@hotel.pe", PasswordHash: "h"}); err != nil {
		t.Fatal(err)
	}
	// Mismo correo con otras mayúsculas: es la misma cuenta.
	if err := s.CrearAdministrador(ctx, usuario.NuevaCuenta{Nombre: "B", Email: "X@HOTEL.PE", PasswordHash: "h"}); err == nil {
		t.Fatal("el correo duplicado debía rechazarse")
	}

	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM usuario`).Scan(&n)
	if n != 1 {
		t.Fatalf("quedaron %d usuarios; la transacción debía deshacerse", n)
	}
}

func TestListarNoDuplicaAQuienTieneVariosRoles(t *testing.T) {
	pool := nuevoPool(t)
	s := postgres.NewStore(pool)
	ctx := context.Background()

	var id int64
	if err := pool.QueryRow(ctx, `INSERT INTO usuario (nombre, email, password_hash) VALUES ('Mixto','m@hotel.pe','h') RETURNING id`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	// Tres roles, uno de ellos de acceso total.
	_, err := pool.Exec(ctx, `INSERT INTO usuario_rol SELECT $1, id FROM rol WHERE nombre IN ('Recepcionista','Almacenero','Administrador')`, id)
	if err != nil {
		t.Fatal(err)
	}

	lista, err := s.Listar(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(lista) != 1 {
		t.Fatalf("aparece %d veces: %+v", len(lista), lista)
	}
	if lista[0].RolNombre != "Administrador" {
		t.Fatalf("el rol principal debía ser el de acceso total, fue %q", lista[0].RolNombre)
	}
}

func TestAsegurarAdministradorContraLaBaseEsIdempotente(t *testing.T) {
	pool := nuevoPool(t)
	s := postgres.NewStore(pool)
	ctx := context.Background()
	ini := usuario.Inicial{Email: "admin@hotelerias.test", Nombre: "Super Admin", Password: "clave-inicial-larga"}

	creado, err := usuario.AsegurarAdministrador(ctx, s, barato, ini)
	if err != nil || !creado {
		t.Fatalf("primera: creado=%v err=%v", creado, err)
	}

	// Otra clave en el entorno NO pisa la cuenta ya creada.
	ini.Password = "otra-clave-mas-larga"
	creado, err = usuario.AsegurarAdministrador(ctx, s, barato, ini)
	if err != nil || creado {
		t.Fatalf("segunda: creado=%v err=%v", creado, err)
	}

	c, _ := s.PorEmail(ctx, ini.Email)
	if barato.Comparar(c.PasswordHash, "clave-inicial-larga") != nil {
		t.Fatal("la clave original debía seguir vigente")
	}
	if barato.Comparar(c.PasswordHash, "otra-clave-mas-larga") == nil {
		t.Fatal("la segunda corrida no debía cambiar la clave")
	}
}

// --- de punta a punta: base real + router real + JWT real ---

func montarAPI(t *testing.T, pool *pgxpool.Pool) (*httptest.Server, *auth.Tokens) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	tokens, err := auth.NewTokens(config.JwtSettings{
		SecretKey: "clave-de-integracion-de-al-menos-32-bytes!!", Issuer: "i", Audience: "a", ExpirationHours: 1,
	})
	if err != nil {
		t.Fatal(err)
	}

	cuentas := postgres.NewStore(pool)
	pstore := permisopg.NewStore(pool)
	permisos := permiso.NewService(permiso.Permisos, pstore, pstore, pstore)
	guard := permiso.NewGuard(permiso.Permisos, permisos, permisos)
	bitacora := auditoria.NewServicio(auditoriapg.NewStore(pool))
	gestionPermisos := permiso.NewGestion(pstore, permiso.Permisos, pstore, bitacora)

	svc, err := auth.NewServicio(cuentas, barato, tokens, auth.NuevoLimitador(5, 15*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	h := auth.NewHandler(svc)

	// Igual que main: solo se arma el guard de lo que el submódulo admite; lo
	// demás queda cerrado.
	cerrado := func(c *gin.Context) { httpx.Abort(c, http.StatusForbidden, "cerrado") }
	guardas := func(sub string) httpx.Guardas {
		s, _ := permiso.Permisos.Submodulo(sub)
		para := func(a permiso.Accion) gin.HandlerFunc {
			if !s.Admite(a) {
				return cerrado
			}
			return guard.Require(sub, a)
		}
		return httpx.Guardas{
			Ver: para(permiso.Ver), Crear: para(permiso.Crear), Editar: para(permiso.Editar),
			Eliminar: para(permiso.Eliminar), Anular: para(permiso.Anular),
		}
	}

	hoy := func() fecha.Fecha { return fecha.Hoy(time.UTC) }
	rolSvc := rol.NewServicio(rolpg.NewStore(pool), permiso.Permisos, nil, bitacora)
	usuariosSvc := usuario.NewGestion(cuentas, barato, bitacora)
	empresaSvc := empresa.NewServicio(empresapg.NewStore(pool), bitacora)
	sedesSvc := hotel.NewAdmin(hotelpg.NewStore(pool), hoy, bitacora)
	reservasSvc := reserva.NewServicio(reservapg.NewStore(pool), nil, nil, sinHuespedes{}, hoy)
	alcance := alcanceDe{g: gestionPermisos, sub: "reservas.reservas"}

	r := httpx.NewRouter(nil)
	routes.Register(r, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Public:       []routes.Module{h.Publico()},
		Modules: []routes.Module{
			h.Privado(),
			permiso.NewHandler(permiso.Permisos, permisos),
			permiso.NewGestionHandler(gestionPermisos, guardas("config.accesos")),
			usuario.NewHandler(usuariosSvc, guardas("config.usuarios"), auth.UsuarioID),
			rol.NewHandler(rolSvc, guardas("config.roles"), guardas("config.accesos")),
			empresa.NewHandler(empresaSvc, guardas("config.empresa")),
			hotel.NewAdminHandler(sedesSvc, guardas("config.sedes")),
			auditoria.NewHandler(bitacora, guardas("config.auditoria"), auth.UsuarioID),
			reserva.NewAdminHandler(reservasSvc, guardas("reservas.reservas"), alcance, bitacora),
		},
	})
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, tokens
}

func llamar(t *testing.T, srv *httptest.Server, metodo, ruta, cuerpo, token string) (int, []byte) {
	t.Helper()
	req, _ := http.NewRequest(metodo, srv.URL+ruta, strings.NewReader(cuerpo))
	req.Header.Set("Content-Type", "application/json")
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

func TestSuperAdminDePuntaAPunta(t *testing.T) {
	pool := nuevoPool(t)
	ctx := context.Background()
	srv, _ := montarAPI(t, pool)

	// 1) El administrador se siembra con la config (como hace main).
	creado, err := usuario.AsegurarAdministrador(ctx, postgres.NewStore(pool), barato, usuario.Inicial{
		Email: "admin@hotelerias.test", Nombre: "Super Admin", Password: "clave-inicial-larga",
	})
	if err != nil || !creado {
		t.Fatalf("siembra: %v %v", creado, err)
	}

	// 2) Inicia sesión por HTTP.
	code, body := llamar(t, srv, "POST", "/api/auth/login", `{"email":"admin@hotelerias.test","password":"clave-inicial-larga"}`, "")
	if code != 200 {
		t.Fatalf("login: %d %s", code, body)
	}
	var sesion struct {
		Token   string
		Usuario map[string]any
	}
	_ = json.Unmarshal(body, &sesion)
	if sesion.Token == "" || sesion.Usuario["nombre"] != "Super Admin" || sesion.Usuario["rolNombre"] != "Administrador" {
		t.Fatalf("sesión: %+v", sesion)
	}

	// 3) Tiene acceso a TODO el catálogo (es lo que pidió el usuario: super admin).
	code, body = llamar(t, srv, "GET", "/api/permiso/mios", "", sesion.Token)
	var mios []string
	_ = json.Unmarshal(body, &mios)
	if code != 200 || len(mios) != len(permiso.Permisos.Claves()) {
		t.Fatalf("permisos: code=%d %d de %d", code, len(mios), len(permiso.Permisos.Claves()))
	}

	// 4) /auth/me y el listado de usuarios funcionan, sin el hash.
	if code, body := llamar(t, srv, "GET", "/api/auth/me", "", sesion.Token); code != 200 || !strings.Contains(string(body), "admin@hotelerias.test") {
		t.Fatalf("me: %d %s", code, body)
	}
	code, body = llamar(t, srv, "GET", "/api/usuario", "", sesion.Token)
	if code != 200 || !strings.Contains(string(body), "Super Admin") || strings.Contains(strings.ToLower(string(body)), "hash") {
		t.Fatalf("listado: %d %s", code, body)
	}

	// 5) Una clave mala no entra.
	if code, _ := llamar(t, srv, "POST", "/api/auth/login", `{"email":"admin@hotelerias.test","password":"mala"}`, ""); code != 401 {
		t.Fatalf("clave mala: %d", code)
	}
}

func TestUnUsuarioSinPermisoNoPuedeListarUsuarios(t *testing.T) {
	pool := nuevoPool(t)
	ctx := context.Background()
	srv, tokens := montarAPI(t, pool)

	// Un recepcionista sin ningún permiso asignado a su rol.
	hash, _ := barato.Hash("clave-recepcion-1")
	var id int64
	_ = pool.QueryRow(ctx, `INSERT INTO usuario (nombre, email, password_hash) VALUES ('Recepcion','v@hotel.pe',$1) RETURNING id`, hash).Scan(&id)
	_, _ = pool.Exec(ctx, `INSERT INTO usuario_rol SELECT $1, id FROM rol WHERE nombre='Recepcionista'`, id)

	tok, _ := tokens.Emitir(id)
	code, body := llamar(t, srv, "GET", "/api/usuario", "", tok)
	if code != 403 {
		t.Fatalf("debía ser 403: %d %s", code, body)
	}
	// El 403 dice QUÉ faltaba (de ahí abre el front el modal de pedir acceso).
	if !strings.Contains(string(body), `"submodulo":"config.usuarios"`) || !strings.Contains(string(body), `"accion":"ver"`) {
		t.Fatalf("el 403 no dice qué permiso faltaba: %s", body)
	}

	// Y sin token ni siquiera llega al guard.
	if code, _ := llamar(t, srv, "GET", "/api/usuario", "", ""); code != 401 {
		t.Fatalf("sin token: %d", code)
	}
}

func TestUnaCuentaDesactivadaNoEntraNiConTokenVigente(t *testing.T) {
	pool := nuevoPool(t)
	ctx := context.Background()
	srv, tokens := montarAPI(t, pool)

	hash, _ := barato.Hash("clave-baja-1234")
	var id int64
	_ = pool.QueryRow(ctx, `INSERT INTO usuario (nombre, email, password_hash, activo) VALUES ('Baja','baja@hotel.pe',$1,false) RETURNING id`, hash).Scan(&id)

	if code, _ := llamar(t, srv, "POST", "/api/auth/login", `{"email":"baja@hotel.pe","password":"clave-baja-1234"}`, ""); code != 403 {
		t.Fatalf("login de cuenta desactivada: %d", code)
	}

	tok, _ := tokens.Emitir(id)
	if code, _ := llamar(t, srv, "GET", "/api/auth/me", "", tok); code != 401 {
		t.Fatalf("me con token vigente de cuenta desactivada: %d", code)
	}
}

var _ = httpx.Problem{} // el paquete se usa vía httpx.NewRouter

// sinHuespedes satisface lo que reserva pide del huésped: aquí no se usa.
type sinHuespedes struct{}

func (sinHuespedes) Perfil(context.Context, int64) (cliente.Cliente, error) {
	return cliente.Cliente{}, nil
}
func (sinHuespedes) Reclasificar(context.Context, int64) error { return nil }

// alcanceDe adapta la gestión de permisos al Alcance de reservas (como en main).
type alcanceDe struct {
	g   *permiso.Gestion
	sub string
}

func (a alcanceDe) SedesVisibles(ctx context.Context, id int64) ([]int64, error) {
	f, err := a.g.Sedes(ctx, id, a.sub)
	if err != nil || f.Todas {
		return nil, err
	}
	if f.SedeIDs == nil {
		return []int64{}, nil
	}
	return f.SedeIDs, nil
}
