package usuario

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"hotelerias/backend/internal/platform/httpx"
)

func init() { gin.SetMode(gin.TestMode) }

// --- siembra ---

type sembradorFake struct {
	existentes map[string]bool
	creadas    []NuevaCuenta
	errExiste  error
	errCrear   error
}

func (f *sembradorFake) ExisteEmail(_ context.Context, email string) (bool, error) {
	return f.existentes[strings.ToLower(email)], f.errExiste
}

func (f *sembradorFake) CrearAdministrador(_ context.Context, c NuevaCuenta) error {
	if f.errCrear != nil {
		return f.errCrear
	}
	f.creadas = append(f.creadas, c)
	return nil
}

type hasherFake struct {
	llamadas int
	devuelve func(string) string
}

func (h *hasherFake) Hash(p string) (string, error) {
	h.llamadas++
	if h.devuelve != nil {
		return h.devuelve(p), nil
	}
	return "hash(" + p + ")", nil
}

func TestSiembraCreaElAdministrador(t *testing.T) {
	s := &sembradorFake{}
	h := &hasherFake{}

	creado, err := AsegurarAdministrador(context.Background(), s, h,
		Inicial{Email: "  admin@hotel.pe ", Nombre: "Super Admin", Password: "clave-secreta-larga"})
	if err != nil || !creado {
		t.Fatalf("creado=%v err=%v", creado, err)
	}
	if len(s.creadas) != 1 {
		t.Fatalf("creadas=%d", len(s.creadas))
	}

	c := s.creadas[0]
	if c.Email != "admin@hotel.pe" || c.Nombre != "Super Admin" {
		t.Fatalf("cuenta: %+v", c)
	}
	// Lo que se guarda es el hash, nunca la clave.
	if c.PasswordHash == "clave-secreta-larga" || c.PasswordHash == "" {
		t.Fatalf("hash inválido: %q", c.PasswordHash)
	}
}

func TestSiembraEsIdempotenteYNoPisaLaClave(t *testing.T) {
	s := &sembradorFake{existentes: map[string]bool{"admin@hotel.pe": true}}
	h := &hasherFake{}

	// El correo en otra forma sigue siendo la misma cuenta.
	creado, err := AsegurarAdministrador(context.Background(), s, h,
		Inicial{Email: "ADMIN@hotel.pe", Password: "otra-clave-distinta"})
	if err != nil || creado {
		t.Fatalf("creado=%v err=%v", creado, err)
	}
	if len(s.creadas) != 0 || h.llamadas != 0 {
		t.Fatal("si la cuenta existe no debe crearse ni siquiera hashear")
	}
}

func TestSiembraSinCorreoOSinClaveNoHaceNada(t *testing.T) {
	for nombre, ini := range map[string]Inicial{
		"sin clave":  {Email: "admin@hotel.pe"},
		"sin correo": {Password: "clave-secreta-larga"},
		"nada":       {},
	} {
		t.Run(nombre, func(t *testing.T) {
			s := &sembradorFake{}
			creado, err := AsegurarAdministrador(context.Background(), s, &hasherFake{}, ini)
			if err != nil || creado || len(s.creadas) != 0 {
				t.Fatalf("creado=%v err=%v creadas=%d", creado, err, len(s.creadas))
			}
		})
	}
}

func TestSiembraNombrePorDefecto(t *testing.T) {
	s := &sembradorFake{}
	_, _ = AsegurarAdministrador(context.Background(), s, &hasherFake{}, Inicial{Email: "a@b.pe", Password: "clave-larga-123"})
	if s.creadas[0].Nombre != "Super Admin" {
		t.Fatalf("nombre=%q", s.creadas[0].Nombre)
	}
}

func TestSiembraRechazaUnHasherQueDevuelveLaClaveEnClaro(t *testing.T) {
	s := &sembradorFake{}
	h := &hasherFake{devuelve: func(p string) string { return p }}

	if _, err := AsegurarAdministrador(context.Background(), s, h, Inicial{Email: "a@b.pe", Password: "clave-larga-123"}); err == nil {
		t.Fatal("debía rechazarse")
	}
	if len(s.creadas) != 0 {
		t.Fatal("no debe guardarse una clave en claro")
	}
}

func TestSiembraPropagaErrores(t *testing.T) {
	boom := errors.New("boom")
	ini := Inicial{Email: "a@b.pe", Password: "clave-larga-123"}

	if _, err := AsegurarAdministrador(context.Background(), &sembradorFake{errExiste: boom}, &hasherFake{}, ini); !errors.Is(err, boom) {
		t.Fatalf("existe: %v", err)
	}
	if _, err := AsegurarAdministrador(context.Background(), &sembradorFake{errCrear: boom}, &hasherFake{}, ini); !errors.Is(err, boom) {
		t.Fatalf("crear: %v", err)
	}
}

// --- Perfil ---

func TestPerfilNoTieneElHash(t *testing.T) {
	c := Cuenta{ID: 1, Nombre: "Ana", Email: "a@b.pe", PasswordHash: "$2a$12$secretísimo", Activo: true}

	raw, err := json.Marshal(c.Perfil())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "secret") || strings.Contains(strings.ToLower(string(raw)), "password") {
		t.Fatalf("el perfil expone el hash: %s", raw)
	}
}

// --- listado ---

// lectorFake implementa solo Listar; el resto de Gestor (nil) no se usa aquí.
type lectorFake struct {
	Gestor
	cuentas []Cuenta
	err     error
}

func (l lectorFake) Listar(context.Context) ([]Cuenta, error) { return l.cuentas, l.err }

func llamarListado(l lectorFake, guard gin.HandlerFunc) *httptest.ResponseRecorder {
	r := gin.New()
	NewHandler(l, httpx.Guardas{Ver: guard}, func(*gin.Context) int64 { return 1 }).Register(r)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/usuario", nil))
	return w
}

func pasa(c *gin.Context) { c.Next() }

func TestListadoVacioEsArregloNoNull(t *testing.T) {
	w := llamarListado(lectorFake{}, pasa)
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("code=%d body=%s", w.Code, w.Body)
	}
}

func TestListadoDevuelvePerfilesSinHash(t *testing.T) {
	l := lectorFake{cuentas: []Cuenta{
		{ID: 1, Nombre: "Ana", Email: "a@b.pe", Activo: true, PasswordHash: "HASH-SECRETO", CreadoEn: time.Now()},
		{ID: 2, Nombre: "Luis", Email: "l@b.pe", PasswordHash: "OTRO-HASH"},
	}}
	w := llamarListado(l, pasa)

	if w.Code != 200 {
		t.Fatalf("code=%d", w.Code)
	}
	if strings.Contains(w.Body.String(), "HASH") {
		t.Fatalf("el listado expone hashes: %s", w.Body)
	}
	var out []Perfil
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || len(out) != 2 || out[1].Nombre != "Luis" {
		t.Fatalf("%v %+v", err, out)
	}
}

func TestListadoRespetaElGuard(t *testing.T) {
	bloquea := func(c *gin.Context) { c.AbortWithStatus(http.StatusForbidden) }
	w := llamarListado(lectorFake{cuentas: []Cuenta{{ID: 1}}}, bloquea)

	if w.Code != http.StatusForbidden || w.Body.Len() != 0 {
		t.Fatalf("el guard debía cortar antes del handler: code=%d body=%s", w.Code, w.Body)
	}
}
