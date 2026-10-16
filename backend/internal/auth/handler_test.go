package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"hotelerias/backend/config"
	"hotelerias/backend/internal/platform/httpx"
)

// montarAPI arma el mismo router que main: login público, me protegido.
func montarAPI(t *testing.T) (*gin.Engine, *banco, *Tokens) {
	t.Helper()
	b := nuevoBanco(t)

	tokens, err := NewTokens(config.JwtSettings{
		SecretKey: "una-clave-de-prueba-de-al-menos-32-bytes!!", Issuer: "i", Audience: "a", ExpirationHours: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	// El servicio del banco usa un emisor falso; aquí se quiere el token real.
	svc, err := NewServicio(b.cuentas, Bcrypt{Cost: bcrypt.MinCost}, tokens, NuevoLimitador(5, 15*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(svc)

	r := gin.New()
	r.Use(httpx.Recovery(), httpx.ErrorMiddleware())
	api := r.Group("/api")
	h.Publico().Register(api)
	h.Privado().Register(api.Group("", Authenticate(tokens)))
	return r, b, tokens
}

func pedir(r *gin.Engine, metodo, ruta, cuerpo, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(metodo, ruta, strings.NewReader(cuerpo))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.RemoteAddr = "10.0.0.9:1234"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHandlerLoginOK(t *testing.T) {
	r, _, tokens := montarAPI(t)
	w := pedir(r, http.MethodPost, "/api/auth/login", `{"email":"ana@hotel.pe","password":"`+claveCorrecta+`"}`, "")

	if w.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", w.Code, w.Body)
	}

	var cuerpo struct {
		Token   string                 `json:"token"`
		Usuario map[string]interface{} `json:"usuario"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &cuerpo); err != nil {
		t.Fatal(err)
	}

	// El token es válido y es de esa persona.
	if id, err := tokens.Validar(cuerpo.Token); err != nil || id != 1 {
		t.Fatalf("token inválido: id=%d err=%v", id, err)
	}

	// La forma que lee frontend/src/data/models/usuario.model.ts, y NADA más.
	quiero := []string{"id", "rolId", "rolNombre", "nombre", "apellido", "email", "telefono", "foto", "activo", "creadoEn", "rolIds", "sedeIds"}
	if len(cuerpo.Usuario) != len(quiero) {
		t.Fatalf("el usuario tiene %d campos, esperaba %d: %v", len(cuerpo.Usuario), len(quiero), cuerpo.Usuario)
	}
	for _, k := range quiero {
		if _, ok := cuerpo.Usuario[k]; !ok {
			t.Errorf("falta el campo %q", k)
		}
	}
	if strings.Contains(strings.ToLower(w.Body.String()), "hash") {
		t.Fatalf("la respuesta menciona el hash: %s", w.Body)
	}
}

func TestHandlerLoginErrores(t *testing.T) {
	casos := []struct {
		nombre, cuerpo string
		code           int
		mensaje        string
	}{
		{"clave mala", `{"email":"ana@hotel.pe","password":"mala"}`, 401, "Email o contraseña incorrectos"},
		{"correo inexistente", `{"email":"x@hotel.pe","password":"mala"}`, 401, "Email o contraseña incorrectos"},
		{"cuenta desactivada", `{"email":"baja@hotel.pe","password":"` + claveCorrecta + `"}`, 403, "desactivada"},
		{"json roto", `{no es json`, 400, "Datos inválidos"},
		{"sin campos", `{}`, 401, "Email o contraseña incorrectos"},
	}
	for _, tc := range casos {
		t.Run(tc.nombre, func(t *testing.T) {
			r, _, _ := montarAPI(t)
			w := pedir(r, http.MethodPost, "/api/auth/login", tc.cuerpo, "")

			if w.Code != tc.code {
				t.Fatalf("code=%d body=%s", w.Code, w.Body)
			}
			// La forma del error que lee apiClient: { statusCode, message }.
			var p httpx.Problem
			if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
				t.Fatal(err)
			}
			if p.StatusCode != tc.code || !strings.Contains(p.Message, tc.mensaje) {
				t.Fatalf("problem=%+v", p)
			}
		})
	}
}

func TestHandlerLoginBloqueaTrasCincoFallos(t *testing.T) {
	r, _, _ := montarAPI(t)
	for i := 0; i < 5; i++ {
		pedir(r, http.MethodPost, "/api/auth/login", `{"email":"ana@hotel.pe","password":"mala"}`, "")
	}

	w := pedir(r, http.MethodPost, "/api/auth/login", `{"email":"ana@hotel.pe","password":"`+claveCorrecta+`"}`, "")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("code=%d body=%s", w.Code, w.Body)
	}
}

func TestHandlerLoginRespetaElMetodo(t *testing.T) {
	r, _, _ := montarAPI(t)
	// Un GET con la clave en la URL acabaría en logs y en el historial.
	if w := pedir(r, http.MethodGet, "/api/auth/login?email=ana@hotel.pe&password=x", "", ""); w.Code != http.StatusNotFound {
		t.Fatalf("GET /auth/login debía no existir: %d", w.Code)
	}
}

func TestHandlerMe(t *testing.T) {
	r, _, tokens := montarAPI(t)

	if w := pedir(r, http.MethodGet, "/api/auth/me", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("sin token: %d", w.Code)
	}

	tok, _ := tokens.Emitir(1)
	w := pedir(r, http.MethodGet, "/api/auth/me", "", tok)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"nombre":"Ana"`) {
		t.Fatalf("code=%d body=%s", w.Code, w.Body)
	}

	// Token válido de una cuenta que ya no existe → 401 (el front limpia la sesión).
	tokFantasma, _ := tokens.Emitir(999)
	if w := pedir(r, http.MethodGet, "/api/auth/me", "", tokFantasma); w.Code != http.StatusUnauthorized {
		t.Fatalf("cuenta inexistente: %d", w.Code)
	}

	// Y la de una cuenta dada de baja.
	tokBaja, _ := tokens.Emitir(2)
	if w := pedir(r, http.MethodGet, "/api/auth/me", "", tokBaja); w.Code != http.StatusUnauthorized {
		t.Fatalf("cuenta inactiva: %d", w.Code)
	}
}
