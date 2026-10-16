package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"hotelerias/backend/config"
)

func tokensDePrueba(t *testing.T) *Tokens {
	t.Helper()
	tk, err := NewTokens(config.JwtSettings{
		SecretKey: "una-clave-de-prueba-de-al-menos-32-bytes!!", Issuer: "i", Audience: "a", ExpirationHours: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	return tk
}

// El huésped nº 5 y el empleado nº 5 son personas distintas con el mismo id: un
// token de uno NO puede servir como el del otro.
func TestUnTokenDeHuespedNoSirveParaElPanelNiAlReves(t *testing.T) {
	tk := tokensDePrueba(t)

	cliente, _ := tk.EmitirCliente(5)
	staff, _ := tk.Emitir(5)

	if _, err := tk.Validar(cliente); err == nil {
		t.Fatal("un token de huésped fue aceptado como de personal")
	}
	if _, err := tk.ValidarCliente(staff); err == nil {
		t.Fatal("un token de personal fue aceptado como de huésped")
	}

	if id, err := tk.ValidarCliente(cliente); err != nil || id != 5 {
		t.Fatalf("cliente: id=%d err=%v", id, err)
	}
	if id, err := tk.Validar(staff); err != nil || id != 5 {
		t.Fatalf("staff: id=%d err=%v", id, err)
	}
}

func TestUnTokenSinTipoEsDePersonalYSoloDePersonal(t *testing.T) {
	// Los emitidos antes de que existiera "typ" no deben quedar inservibles, pero
	// tampoco convertirse en tokens de huésped.
	tk := tokensDePrueba(t)
	viejo, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject: "7", Issuer: "i", Audience: jwt.ClaimStrings{"a"},
		ExpiresAt: jwt.NewNumericDate(tk.now().Add(3600e9)),
	}).SignedString(tk.secret)

	if id, err := tk.Validar(viejo); err != nil || id != 7 {
		t.Fatalf("sin tipo debía valer como personal: id=%d err=%v", id, err)
	}
	if _, err := tk.ValidarCliente(viejo); err == nil {
		t.Fatal("un token sin tipo no puede valer como de huésped")
	}
}

func TestTipoDesconocidoNoSirveEnNingunLado(t *testing.T) {
	tk := tokensDePrueba(t)
	raro, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "1", Issuer: "i", Audience: jwt.ClaimStrings{"a"},
			ExpiresAt: jwt.NewNumericDate(tk.now().Add(3600e9)),
		},
		Tipo: "superadmin",
	}).SignedString(tk.secret)

	if _, err := tk.Validar(raro); err == nil {
		t.Fatal("tipo desconocido aceptado como personal")
	}
	if _, err := tk.ValidarCliente(raro); err == nil {
		t.Fatal("tipo desconocido aceptado como huésped")
	}
}

// --- middleware ---

func rutas(tk *Tokens) *gin.Engine {
	r := gin.New()
	r.GET("/panel", Authenticate(tk), func(c *gin.Context) { c.JSON(200, gin.H{"id": UsuarioID(c)}) })
	r.GET("/reservar", AuthenticateCliente(tk), func(c *gin.Context) { c.JSON(200, gin.H{"id": ClienteID(c)}) })
	r.GET("/cotizar", ClienteOpcional(tk), func(c *gin.Context) { c.JSON(200, gin.H{"id": ClienteID(c)}) })
	return r
}

func get(r *gin.Engine, ruta, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, ruta, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestMiddlewareSeparaPanelYPortal(t *testing.T) {
	tk := tokensDePrueba(t)
	r := rutas(tk)
	staff, _ := tk.Emitir(5)
	cliente, _ := tk.EmitirCliente(5)

	casos := []struct {
		nombre, ruta, token string
		code                int
	}{
		{"panel con token de personal", "/panel", staff, 200},
		{"panel con token de huésped", "/panel", cliente, 401},
		{"reservar con token de huésped", "/reservar", cliente, 200},
		{"reservar con token de personal", "/reservar", staff, 401},
		{"reservar sin token", "/reservar", "", 401},
		{"panel sin token", "/panel", "", 401},
	}
	for _, tc := range casos {
		t.Run(tc.nombre, func(t *testing.T) {
			if w := get(r, tc.ruta, tc.token); w.Code != tc.code {
				t.Fatalf("code=%d body=%s", w.Code, w.Body)
			}
		})
	}
}

func TestClienteOpcionalNuncaFalla(t *testing.T) {
	tk := tokensDePrueba(t)
	r := rutas(tk)
	staff, _ := tk.Emitir(5)
	cliente, _ := tk.EmitirCliente(9)

	// Visitante, token basura y token de personal: todos pasan, y ninguno es un huésped.
	for nombre, tok := range map[string]string{"sin token": "", "basura": "xxx", "de personal": staff} {
		w := get(r, "/cotizar", tok)
		if w.Code != 200 || w.Body.String() != `{"id":0}` {
			t.Errorf("%s: code=%d body=%s", nombre, w.Code, w.Body)
		}
	}
	if w := get(r, "/cotizar", cliente); w.Body.String() != `{"id":9}` {
		t.Fatalf("con token de huésped debía reconocerlo: %s", w.Body)
	}
}
