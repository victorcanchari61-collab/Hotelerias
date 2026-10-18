package sitio_test

// El sitio web contra un PostgreSQL real y un disco real (carpeta temporal): subir y servir
// archivos, administrar el contenido y verlo desde la web pública sin sesión.
// Se salta sola si no hay base:
//
//	TEST_DATABASE_URL="host=localhost port=5432 dbname=postgres user=postgres password=..." go test ./internal/sitio/
//
// IMPORTANTE: sin TEST_DATABASE_URL estas pruebas se SALTAN y `go test` igual sale en verde.
// Trabaja en un schema temporal que borra al terminar: no toca tus datos.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/config"
	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/demo"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/platform/migrate"
	"hotelerias/backend/internal/routes"
	"hotelerias/backend/internal/sitio"
	sitiopg "hotelerias/backend/internal/sitio/postgres"
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
	schema := fmt.Sprintf("test_sitio_%d", time.Now().UnixNano())
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

type entorno struct {
	router http.Handler
	pool   *pgxpool.Pool
	tokens *auth.Tokens
	dir    string
	admin  string
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

	dir := filepath.Join(t.TempDir(), "sitio")
	svc := sitio.NewServicio(sitiopg.NewStore(pool), sitio.Disco{Dir: dir}, hotel.Hoy, auditoria.Nop{})
	libre := httpx.Guardas{}
	router := httpx.NewRouter(nil)
	router.GET("/uploads/sitio/:archivo", sitio.Servir(dir))
	router.HEAD("/uploads/sitio/:archivo", sitio.Servir(dir))
	routes.Register(router, routes.Deps{
		Authenticate: auth.Authenticate(tokens),
		Public:       []routes.Module{sitio.NewPublico(svc)},
		Modules: []routes.Module{sitio.NewHandler(svc, sitio.Guardas{
			Portada: libre, Medios: libre, Galerias: libre, Experiencias: libre, Blog: libre, Paginas: libre, Mensajes: libre,
		})},
	})

	e := &entorno{router: router, pool: pool, tokens: tokens, dir: dir}
	var uid int64
	if err := pool.QueryRow(ctx, `INSERT INTO usuario (nombre) VALUES ('Editora') RETURNING id`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	e.admin, _ = tokens.Emitir(uid)
	return e
}

func (e *entorno) do(t *testing.T, method, path string, body any, token string) (int, []byte, http.Header) {
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
	return rec.Code, rec.Body.Bytes(), rec.Header()
}

func decode[T any](t *testing.T, b []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("respuesta ilegible: %v\n%s", err, b)
	}
	return v
}

func png2(t *testing.T, ancho, alto int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, ancho, alto))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// subir manda un archivo como lo haría el navegador (multipart) y devuelve el estado y el cuerpo.
func (e *entorno) subir(t *testing.T, nombre string, contenido []byte, token string) (int, []byte) {
	t.Helper()
	var cuerpo bytes.Buffer
	mw := multipart.NewWriter(&cuerpo)
	cab := textproto.MIMEHeader{}
	cab.Set("Content-Disposition", fmt.Sprintf(`form-data; name="archivo"; filename="%s"`, nombre))
	cab.Set("Content-Type", "image/jpeg") // la mentira habitual: el tipo lo dice el cliente
	parte, _ := mw.CreatePart(cab)
	_, _ = parte.Write(contenido)
	_ = mw.Close()

	req := httptest.NewRequest("POST", "/api/sitio/medio", &cuerpo)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec.Code, rec.Body.Bytes()
}

func (e *entorno) medio(t *testing.T) sitio.Medio {
	t.Helper()
	code, body := e.subir(t, "foto.png", png2(t, 40, 30), e.admin)
	if code != http.StatusCreated {
		t.Fatalf("subir: %d %s", code, body)
	}
	return decode[sitio.Medio](t, body)
}

func (e *entorno) archivosEnDisco(t *testing.T) int {
	t.Helper()
	ents, err := os.ReadDir(e.dir)
	if err != nil {
		return 0
	}
	return len(ents)
}

func mp4Falso(tam int) []byte {
	return append([]byte{0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0}, make([]byte, tam)...)
}

func TestSubirYServirUnaFoto(t *testing.T) {
	e := armar(t)
	m := e.medio(t)

	if m.Tipo != "imagen" || m.Ancho == nil || *m.Ancho != 40 || *m.Alto != 30 || !strings.HasPrefix(m.URL, "/uploads/sitio/") || !strings.HasSuffix(m.URL, ".png") {
		t.Fatalf("%+v", m)
	}
	if e.archivosEnDisco(t) != 1 {
		t.Fatalf("archivos en disco: %d", e.archivosEnDisco(t))
	}

	code, body, h := e.do(t, "GET", m.URL, nil, "") // sin sesión: la web pública lo pide así
	if code != 200 || !bytes.HasPrefix(body, []byte("\x89PNG")) {
		t.Fatalf("servir: %d", code)
	}
	if h.Get("Content-Type") != "image/png" || h.Get("X-Content-Type-Options") != "nosniff" ||
		!strings.Contains(h.Get("Cache-Control"), "immutable") || !strings.Contains(h.Get("Content-Security-Policy"), "default-src 'none'") {
		t.Fatalf("cabeceras: %v", h)
	}
	if code, _, _ := e.do(t, "HEAD", m.URL, nil, ""); code != 200 {
		t.Fatalf("HEAD: %d", code)
	}
}

func TestUnVideoSeSirveConRango(t *testing.T) {
	e := armar(t)
	code, body := e.subir(t, "recorrido.mp4", mp4Falso(5000), e.admin)
	if code != http.StatusCreated {
		t.Fatalf("subir: %d %s", code, body)
	}
	m := decode[sitio.Medio](t, body)
	if m.Tipo != "video" || !strings.HasSuffix(m.URL, ".mp4") {
		t.Fatalf("%+v", m)
	}

	// El navegador salta a un punto del video pidiendo un rango.
	req := httptest.NewRequest("GET", m.URL, nil)
	req.Header.Set("Range", "bytes=0-9")
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusPartialContent || rec.Body.Len() != 10 || !strings.HasPrefix(rec.Header().Get("Content-Range"), "bytes 0-9/") {
		t.Fatalf("rango: %d %q %d", rec.Code, rec.Header().Get("Content-Range"), rec.Body.Len())
	}
}

func TestSubirRechazaLoQueNoEsFotoNiVideo(t *testing.T) {
	e := armar(t)
	for nombre, contenido := range map[string][]byte{
		"svg":   []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		"html":  []byte(`<html><script>alert(1)</script></html>`),
		"exe":   append([]byte("MZ"), make([]byte, 100)...),
		"vacío": {},
	} {
		// Todos con nombre y tipo de foto: lo que manda es lo que el archivo ES.
		if code, _ := e.subir(t, "foto.jpg", contenido, e.admin); code != http.StatusBadRequest {
			t.Errorf("%s: %d, esperaba 400", nombre, code)
		}
	}
	if e.archivosEnDisco(t) != 0 {
		t.Fatalf("no debió quedar nada en el disco: %d", e.archivosEnDisco(t))
	}
	if code, _ := e.subir(t, "foto.png", png2(t, 5, 5), ""); code != http.StatusUnauthorized {
		t.Fatalf("sin sesión: %d", code)
	}

	// Una foto de más de 8 MB.
	grande := append([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0}, make([]byte, 9<<20)...)
	if code, _ := e.subir(t, "grande.jpg", grande, e.admin); code != http.StatusBadRequest {
		t.Fatalf("foto grande: %d", code)
	}
	if e.archivosEnDisco(t) != 0 {
		t.Fatalf("la foto rechazada no debe quedar a medias: %d", e.archivosEnDisco(t))
	}

	// Sin el campo «archivo».
	code, _, _ := e.do(t, "POST", "/api/sitio/medio", map[string]string{"x": "y"}, e.admin)
	if code != http.StatusBadRequest {
		t.Fatalf("JSON en vez de archivo: %d", code)
	}
}

func TestNoSeSirveNadaQueNoSeaDeLaBiblioteca(t *testing.T) {
	e := armar(t)
	_ = e.medio(t)
	for _, ruta := range []string{
		"/uploads/sitio/..%2f..%2fmain.go",
		"/uploads/sitio/%2e%2e%2fconfig.yaml",
		"/uploads/sitio/.env",
		"/uploads/sitio/foto.png",
		"/uploads/sitio/0123456789abcdef0123456789abcdef.png", // nombre válido pero que no existe
		"/uploads/sitio/0123456789abcdef0123456789abcdef.svg",
		"/uploads/sitio/0123456789ABCDEF0123456789ABCDEF.png",
	} {
		if code, _, _ := e.do(t, "GET", ruta, nil, ""); code != http.StatusNotFound {
			t.Errorf("%s: %d, esperaba 404", ruta, code)
		}
	}
}

func TestPortadaSoloMuestraLoActivoYVigente(t *testing.T) {
	e := armar(t)
	m := e.medio(t)
	hoy := hotel.Hoy()

	crear := func(titulo string, extra map[string]any) int64 {
		cuerpo := map[string]any{"titulo": titulo, "medioId": m.ID, "activo": true, "orden": 0}
		for k, v := range extra {
			cuerpo[k] = v
		}
		code, body, _ := e.do(t, "POST", "/api/sitio/banner", cuerpo, e.admin)
		if code != http.StatusCreated {
			t.Fatalf("crear %q: %d %s", titulo, code, body)
		}
		return decode[sitio.Banner](t, body).ID
	}
	crear("Segundo", map[string]any{"orden": 2})
	crear("Primero", map[string]any{"orden": 1, "enlaceTexto": "Ver ofertas", "enlaceUrl": "/ofertas"})
	crear("Apagado", map[string]any{"activo": false})
	crear("Futuro", map[string]any{"desde": hoy.Mas(5).String()})
	crear("Vencido", map[string]any{"hasta": hoy.Mas(-1).String()})
	crear("Vigente con fechas", map[string]any{"orden": 3, "desde": hoy.Mas(-2).String(), "hasta": hoy.Mas(2).String()})

	code, body, _ := e.do(t, "GET", "/api/portal/portada", nil, "") // pública
	if code != 200 {
		t.Fatalf("%d %s", code, body)
	}
	titulos := []string{}
	for _, b := range decode[[]sitio.Banner](t, body) {
		titulos = append(titulos, b.Titulo)
		if b.Medio == nil || b.Medio.URL != m.URL {
			t.Fatalf("el banner debe traer su imagen: %+v", b)
		}
	}
	if strings.Join(titulos, "|") != "Primero|Segundo|Vigente con fechas" {
		t.Fatalf("la web mostraría: %v", titulos)
	}

	// El panel los ve todos.
	_, body, _ = e.do(t, "GET", "/api/sitio/banner", nil, e.admin)
	if n := len(decode[[]sitio.Banner](t, body)); n != 6 {
		t.Fatalf("el panel ve %d banners", n)
	}
}

func TestBannerRechazaDatosPeligrososOIncoherentes(t *testing.T) {
	e := armar(t)
	for nombre, cuerpo := range map[string]map[string]any{
		"enlace javascript":        {"titulo": "x", "enlaceTexto": "Ir", "enlaceUrl": "javascript:alert(1)"},
		"enlace externo sin https": {"titulo": "x", "enlaceTexto": "Ir", "enlaceUrl": "http://otro.pe"},
		"sin título":               {"titulo": " "},
		"medio inexistente":        {"titulo": "x", "medioId": 99999},
		"fechas al revés":          {"titulo": "x", "desde": "2026-12-01", "hasta": "2026-11-01"},
	} {
		if code, _, _ := e.do(t, "POST", "/api/sitio/banner", cuerpo, e.admin); code != http.StatusBadRequest {
			t.Errorf("%s: %d, esperaba 400", nombre, code)
		}
	}
}

func TestUnMedioEnUsoNoSeBorraYDiceDondeSeUsa(t *testing.T) {
	e := armar(t)
	m := e.medio(t)
	_, body, _ := e.do(t, "POST", "/api/sitio/banner", map[string]any{"titulo": "Verano", "medioId": m.ID, "activo": true}, e.admin)
	banner := decode[sitio.Banner](t, body)

	code, body, _ := e.do(t, "DELETE", fmt.Sprintf("/api/sitio/medio/%d", m.ID), nil, e.admin)
	if code != http.StatusConflict || !strings.Contains(string(body), "Verano") {
		t.Fatalf("borrar en uso: %d %s", code, body)
	}
	if e.archivosEnDisco(t) != 1 {
		t.Fatal("el archivo en uso no debe desaparecer del disco")
	}

	// El conteo de usos de la biblioteca.
	_, body, _ = e.do(t, "GET", "/api/sitio/medio", nil, e.admin)
	if lista := decode[[]sitio.Medio](t, body); len(lista) != 1 || lista[0].Usos != 1 {
		t.Fatalf("usos: %+v", lista)
	}

	// Al liberar el banner, ya se puede borrar, y el archivo se va del disco.
	if code, _, _ := e.do(t, "DELETE", fmt.Sprintf("/api/sitio/banner/%d", banner.ID), nil, e.admin); code != http.StatusNoContent {
		t.Fatalf("borrar banner: %d", code)
	}
	if code, body, _ := e.do(t, "DELETE", fmt.Sprintf("/api/sitio/medio/%d", m.ID), nil, e.admin); code != http.StatusNoContent {
		t.Fatalf("borrar medio libre: %d %s", code, body)
	}
	if e.archivosEnDisco(t) != 0 {
		t.Fatalf("el archivo debía borrarse del disco: %d", e.archivosEnDisco(t))
	}
	if code, _, _ := e.do(t, "GET", m.URL, nil, ""); code != http.StatusNotFound {
		t.Fatalf("ya no se sirve: %d", code)
	}
}

func TestExperiencias(t *testing.T) {
	e := armar(t)
	crear := func(titulo string, activo bool) sitio.Experiencia {
		code, body, _ := e.do(t, "POST", "/api/sitio/experiencia", map[string]any{
			"titulo": titulo, "resumen": "r", "texto": "t", "ejemplos": []string{"  uno ", "", "dos"}, "activo": activo, "orden": 1,
		}, e.admin)
		if code != http.StatusCreated {
			t.Fatalf("crear: %d %s", code, body)
		}
		return decode[sitio.Experiencia](t, body)
	}
	// Un título que la migración de contenido inicial no usa, para que la dirección salga limpia.
	a := crear("Taller de cerámica", true)
	b := crear("Taller de cerámica", true) // mismo título: otra dirección
	crear("Oculta", false)

	if a.Slug != "taller-de-ceramica" || b.Slug != "taller-de-ceramica-2" {
		t.Fatalf("slugs: %q %q", a.Slug, b.Slug)
	}
	if strings.Join(a.Ejemplos, "|") != "uno|dos" {
		t.Fatalf("ejemplos: %v", a.Ejemplos)
	}

	// Editar el título no cambia la dirección.
	code, body, _ := e.do(t, "PUT", fmt.Sprintf("/api/sitio/experiencia/%d", a.ID), map[string]any{"titulo": "Otro nombre", "activo": true}, e.admin)
	if code != 200 || decode[sitio.Experiencia](t, body).Slug != "taller-de-ceramica" {
		t.Fatalf("editar: %d %s", code, body)
	}

	_, body, _ = e.do(t, "GET", "/api/portal/experiencias", nil, "")
	// Además de las dos creadas aquí, la web ve las de la migración inicial; la oculta no sale.
	vistas := map[int64]bool{}
	for _, x := range decode[[]sitio.Experiencia](t, body) {
		vistas[x.ID] = true
		if x.Titulo == "Oculta" {
			t.Fatal("la web no debe ver una experiencia oculta")
		}
	}
	if !vistas[a.ID] || !vistas[b.ID] {
		t.Fatalf("la web debía ver las dos activas: %v", vistas)
	}
	if code, _, _ := e.do(t, "DELETE", fmt.Sprintf("/api/sitio/experiencia/%d", b.ID), nil, e.admin); code != http.StatusNoContent {
		t.Fatal(code)
	}
	if code, _, _ := e.do(t, "DELETE", "/api/sitio/experiencia/99999", nil, e.admin); code != http.StatusNotFound {
		t.Fatalf("inexistente: %d", code)
	}
}

func TestElBlogSoloMuestraLoPublicado(t *testing.T) {
	e := armar(t)
	code, body, _ := e.do(t, "POST", "/api/sitio/entrada", map[string]any{"titulo": "Una noche en Cusco", "resumen": "Breve", "cuerpo": "Primer párrafo.\n\nSegundo."}, e.admin)
	if code != http.StatusCreated {
		t.Fatalf("crear: %d %s", code, body)
	}
	ent := decode[sitio.Entrada](t, body)
	if ent.Estado != sitio.Borrador || ent.Slug != "una-noche-en-cusco" || ent.Autor != "Editora" {
		t.Fatalf("%+v", ent)
	}

	// Borrador: la web no lo ve, ni por la lista ni por su dirección.
	_, body, _ = e.do(t, "GET", "/api/portal/entradas", nil, "")
	if n := len(decode[[]sitio.Entrada](t, body)); n != 0 {
		t.Fatalf("la web ve %d borradores", n)
	}
	if code, _, _ := e.do(t, "GET", "/api/portal/entradas/una-noche-en-cusco", nil, ""); code != http.StatusNotFound {
		t.Fatalf("un borrador por su dirección: %d", code)
	}

	// Publicar.
	if code, body, _ := e.do(t, "POST", fmt.Sprintf("/api/sitio/entrada/%d/publicar", ent.ID), nil, e.admin); code != 200 {
		t.Fatalf("publicar: %d %s", code, body)
	}
	_, body, _ = e.do(t, "GET", "/api/portal/entradas", nil, "")
	lista := decode[[]sitio.Entrada](t, body)
	if len(lista) != 1 || lista[0].Cuerpo != "" || lista[0].Resumen != "Breve" {
		t.Fatalf("la lista pública no lleva el cuerpo: %+v", lista)
	}
	_, body, _ = e.do(t, "GET", "/api/portal/entradas/una-noche-en-cusco", nil, "")
	if one := decode[sitio.Entrada](t, body); one.Cuerpo != "Primer párrafo.\n\nSegundo." {
		t.Fatalf("%+v", one)
	}

	// Despublicar: vuelve a no verse.
	_, _, _ = e.do(t, "POST", fmt.Sprintf("/api/sitio/entrada/%d/despublicar", ent.ID), nil, e.admin)
	if code, _, _ := e.do(t, "GET", "/api/portal/entradas/una-noche-en-cusco", nil, ""); code != http.StatusNotFound {
		t.Fatalf("despublicada: %d", code)
	}

	// Sin texto no se publica.
	_, body, _ = e.do(t, "POST", "/api/sitio/entrada", map[string]any{"titulo": "Vacía"}, e.admin)
	vacia := decode[sitio.Entrada](t, body)
	if code, _, _ := e.do(t, "POST", fmt.Sprintf("/api/sitio/entrada/%d/publicar", vacia.ID), nil, e.admin); code != http.StatusBadRequest {
		t.Fatalf("publicar sin texto: %d", code)
	}
}

func TestPaginasNosotrosYContacto(t *testing.T) {
	e := armar(t)
	code, body, _ := e.do(t, "GET", "/api/portal/paginas/nosotros", nil, "")
	// La migración inicial deja un texto de muestra: la página existe y se lee sin sesión.
	if code != 200 || decode[sitio.Pagina](t, body).Clave != "nosotros" {
		t.Fatalf("%d %s", code, body)
	}
	m := e.medio(t)
	code, body, _ = e.do(t, "PUT", "/api/sitio/pagina/nosotros", map[string]any{"titulo": "Quiénes somos", "cuerpo": "Somos una casa.", "medioId": m.ID}, e.admin)
	if code != 200 {
		t.Fatalf("guardar: %d %s", code, body)
	}
	_, body, _ = e.do(t, "GET", "/api/portal/paginas/nosotros", nil, "")
	if p := decode[sitio.Pagina](t, body); p.Titulo != "Quiénes somos" || p.Medio == nil || p.Medio.URL != m.URL {
		t.Fatalf("%+v", p)
	}
	for _, ruta := range []string{"/api/portal/paginas/otra", "/api/sitio/pagina/otra"} {
		if code, _, _ := e.do(t, "GET", ruta, nil, e.admin); code != http.StatusNotFound {
			t.Errorf("%s: %d", ruta, code)
		}
	}
	if code, _, _ := e.do(t, "PUT", "/api/sitio/pagina/nosotros", map[string]any{"titulo": " "}, e.admin); code != http.StatusBadRequest {
		t.Fatalf("sin título: %d", code)
	}
}

func TestGaleriasDeHotelesYHabitaciones(t *testing.T) {
	e := armar(t)
	a, b := e.medio(t), e.medio(t)
	var sede, tipo int64
	_ = e.pool.QueryRow(context.Background(), `SELECT id FROM sede ORDER BY id LIMIT 1`).Scan(&sede)
	_ = e.pool.QueryRow(context.Background(), `SELECT id FROM tipo_habitacion WHERE sede_id = $1 ORDER BY id LIMIT 1`, sede).Scan(&tipo)

	// Los destinos que se ofrecen en la pantalla.
	_, body, _ := e.do(t, "GET", "/api/sitio/galerias-destinos", nil, e.admin)
	destinos := decode[[]sitio.Destino](t, body)
	if len(destinos) != 4+12 {
		t.Fatalf("destinos: %d (4 hoteles y 12 tipos)", len(destinos))
	}

	// El orden elegido se conserva.
	code, body, _ := e.do(t, "PUT", fmt.Sprintf("/api/sitio/galeria/sede/%d", sede), map[string]any{"medioIds": []int64{b.ID, a.ID}}, e.admin)
	if code != 200 {
		t.Fatalf("guardar: %d %s", code, body)
	}
	_, body, _ = e.do(t, "GET", fmt.Sprintf("/api/portal/galeria/sede/%d", sede), nil, "")
	g := decode[[]sitio.MedioRef](t, body)
	if len(g) != 2 || g[0].ID != b.ID || g[1].ID != a.ID {
		t.Fatalf("orden: %+v", g)
	}

	// La misma foto en un hotel y en una habitación; y la habitación tiene la suya.
	if code, _, _ := e.do(t, "PUT", fmt.Sprintf("/api/sitio/galeria/tipo_habitacion/%d", tipo), map[string]any{"medioIds": []int64{a.ID}}, e.admin); code != 200 {
		t.Fatalf("tipo: %d", code)
	}

	for nombre, c := range map[string]struct {
		ruta   string
		ids    []int64
		quiero int
	}{
		"repetido":     {fmt.Sprintf("/api/sitio/galeria/sede/%d", sede), []int64{a.ID, a.ID}, 400},
		"medio ajeno":  {fmt.Sprintf("/api/sitio/galeria/sede/%d", sede), []int64{99999}, 400},
		"hotel ajeno":  {"/api/sitio/galeria/sede/99999", []int64{a.ID}, 404},
		"entidad rara": {fmt.Sprintf("/api/sitio/galeria/usuario/%d", sede), []int64{a.ID}, 404},
	} {
		if code, _, _ := e.do(t, "PUT", c.ruta, map[string]any{"medioIds": c.ids}, e.admin); code != c.quiero {
			t.Errorf("%s: %d, esperaba %d", nombre, code, c.quiero)
		}
	}
	// Lo que falló no tocó la galería.
	_, body, _ = e.do(t, "GET", fmt.Sprintf("/api/portal/galeria/sede/%d", sede), nil, "")
	if g := decode[[]sitio.MedioRef](t, body); len(g) != 2 {
		t.Fatalf("la galería cambió pese a los errores: %+v", g)
	}

	// Un medio en una galería no se puede borrar.
	if code, body, _ := e.do(t, "DELETE", fmt.Sprintf("/api/sitio/medio/%d", a.ID), nil, e.admin); code != http.StatusConflict || !strings.Contains(string(body), "galería") {
		t.Fatalf("borrar un medio de una galería: %d %s", code, body)
	}
}

func TestMensajesDeContacto(t *testing.T) {
	e := armar(t)
	enviar := func(cuerpo map[string]any) int {
		code, _, _ := e.do(t, "POST", "/api/portal/contacto/mensaje", cuerpo, "")
		return code
	}
	bueno := map[string]any{"nombre": "Ana", "email": "ana@correo.pe", "asunto": "Boda", "mensaje": "Quisiera cotizar una boda para 80 invitados."}

	if code := enviar(bueno); code != http.StatusNoContent {
		t.Fatalf("enviar: %d", code)
	}
	// El robot que llena el cebo recibe lo mismo, pero no se guarda.
	robot := map[string]any{"nombre": "Bot", "email": "bot@spam.pe", "mensaje": "Compra aquí tu casino online ya mismo.", "sitio": "http://spam"}
	if code := enviar(robot); code != http.StatusNoContent {
		t.Fatalf("robot: %d", code)
	}
	if code := enviar(map[string]any{"nombre": "X", "email": "malo", "mensaje": "mensaje largo suficiente"}); code != http.StatusBadRequest {
		t.Fatalf("correo malo: %d", code)
	}

	_, body, _ := e.do(t, "GET", "/api/sitio/mensaje", nil, e.admin)
	lista := decode[[]sitio.Mensaje](t, body)
	if len(lista) != 1 || lista[0].Nombre != "Ana" || lista[0].Estado != sitio.Nuevo {
		t.Fatalf("%+v", lista)
	}

	id := lista[0].ID
	if code, _, _ := e.do(t, "PATCH", fmt.Sprintf("/api/sitio/mensaje/%d/estado", id), map[string]any{"estado": "respondido"}, e.admin); code != http.StatusNoContent {
		t.Fatalf("estado: %d", code)
	}
	if code, _, _ := e.do(t, "PATCH", fmt.Sprintf("/api/sitio/mensaje/%d/estado", id), map[string]any{"estado": "raro"}, e.admin); code != http.StatusBadRequest {
		t.Fatalf("estado raro: %d", code)
	}
	_, body, _ = e.do(t, "GET", "/api/sitio/mensaje?estado=nuevo", nil, e.admin)
	if n := len(decode[[]sitio.Mensaje](t, body)); n != 0 {
		t.Fatalf("filtro por estado: %d", n)
	}
	if code, _, _ := e.do(t, "DELETE", fmt.Sprintf("/api/sitio/mensaje/%d", id), nil, e.admin); code != http.StatusNoContent {
		t.Fatalf("borrar: %d", code)
	}
}

func TestElFormularioDeContactoTieneLimite(t *testing.T) {
	e := armar(t)
	cuerpo := map[string]any{"nombre": "Ana", "email": "ana@correo.pe", "mensaje": "Un mensaje de prueba suficientemente largo."}
	var codigos []int
	for i := 0; i < 7; i++ {
		code, _, _ := e.do(t, "POST", "/api/portal/contacto/mensaje", cuerpo, "")
		codigos = append(codigos, code)
	}
	for i := 0; i < 5; i++ {
		if codigos[i] != http.StatusNoContent {
			t.Fatalf("los 5 primeros pasan: %v", codigos)
		}
	}
	if codigos[5] != http.StatusTooManyRequests || codigos[6] != http.StatusTooManyRequests {
		t.Fatalf("del sexto en adelante, 429: %v", codigos)
	}
	var n int
	_ = e.pool.QueryRow(context.Background(), `SELECT count(*) FROM mensaje_contacto`).Scan(&n)
	if n != 5 {
		t.Fatalf("se guardaron %d (debían ser 5)", n)
	}
}

func TestElPanelExigeSesionYLoPublicoNo(t *testing.T) {
	e := armar(t)
	for _, c := range []struct{ metodo, ruta string }{
		{"GET", "/api/sitio/banner"}, {"POST", "/api/sitio/banner"}, {"GET", "/api/sitio/medio"}, {"POST", "/api/sitio/medio"},
		{"DELETE", "/api/sitio/medio/1"}, {"GET", "/api/sitio/galerias-destinos"}, {"PUT", "/api/sitio/galeria/sede/1"},
		{"GET", "/api/sitio/experiencia"}, {"GET", "/api/sitio/entrada"}, {"POST", "/api/sitio/entrada/1/publicar"},
		{"PUT", "/api/sitio/pagina/nosotros"}, {"GET", "/api/sitio/mensaje"}, {"DELETE", "/api/sitio/mensaje/1"},
	} {
		if code, _, _ := e.do(t, c.metodo, c.ruta, map[string]any{}, ""); code != http.StatusUnauthorized {
			t.Errorf("%s %s sin sesión: %d", c.metodo, c.ruta, code)
		}
	}
	for _, ruta := range []string{
		"/api/portal/portada", "/api/portal/experiencias", "/api/portal/entradas", "/api/portal/paginas/nosotros", "/api/portal/paginas/contacto",
	} {
		if code, _, _ := e.do(t, "GET", ruta, nil, ""); code != 200 {
			t.Errorf("%s público: %d", ruta, code)
		}
	}
}
