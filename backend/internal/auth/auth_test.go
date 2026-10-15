package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"hotelerias/backend/config"
)

func init() { gin.SetMode(gin.TestMode) }

const clave = "una-clave-de-prueba-de-al-menos-32-bytes!!"

func nuevo(t *testing.T) *Tokens {
	t.Helper()
	tk, err := NewTokens(config.JwtSettings{
		SecretKey: clave, Issuer: "emisor", Audience: "audiencia", ExpirationHours: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	return tk
}

func TestEmitirYValidar(t *testing.T) {
	tk := nuevo(t)
	raw, err := tk.Emitir(42)
	if err != nil {
		t.Fatal(err)
	}
	id, err := tk.Validar(raw)
	if err != nil || id != 42 {
		t.Fatalf("id=%d err=%v", id, err)
	}
}

func TestValidarRechaza(t *testing.T) {
	tk := nuevo(t)
	firmar := func(m jwt.SigningMethod, key any, c jwt.RegisteredClaims) string {
		s, err := jwt.NewWithClaims(m, c).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	base := jwt.RegisteredClaims{
		Subject: "42", Issuer: "emisor", Audience: jwt.ClaimStrings{"audiencia"},
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
	con := func(f func(c *jwt.RegisteredClaims)) jwt.RegisteredClaims { c := base; f(&c); return c }

	casos := map[string]string{
		"vacío":           "",
		"basura":          "no.es.un.jwt",
		"firma distinta":  firmar(jwt.SigningMethodHS256, []byte("otra-clave-distinta-de-32-bytes-o-mas!!"), base),
		"alg none":        firmar(jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, base),
		"otro algoritmo":  firmar(jwt.SigningMethodHS512, []byte(clave), base),
		"vencido":         firmar(jwt.SigningMethodHS256, []byte(clave), con(func(c *jwt.RegisteredClaims) { c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute)) })),
		"sin vencimiento": firmar(jwt.SigningMethodHS256, []byte(clave), con(func(c *jwt.RegisteredClaims) { c.ExpiresAt = nil })),
		"otro emisor":     firmar(jwt.SigningMethodHS256, []byte(clave), con(func(c *jwt.RegisteredClaims) { c.Issuer = "otro" })),
		"otra audiencia":  firmar(jwt.SigningMethodHS256, []byte(clave), con(func(c *jwt.RegisteredClaims) { c.Audience = jwt.ClaimStrings{"otra"} })),
		"sub no numérico": firmar(jwt.SigningMethodHS256, []byte(clave), con(func(c *jwt.RegisteredClaims) { c.Subject = "abc" })),
		"sub cero":        firmar(jwt.SigningMethodHS256, []byte(clave), con(func(c *jwt.RegisteredClaims) { c.Subject = "0" })),
		"sub vacío":       firmar(jwt.SigningMethodHS256, []byte(clave), con(func(c *jwt.RegisteredClaims) { c.Subject = "" })),
	}
	for nombre, raw := range casos {
		t.Run(nombre, func(t *testing.T) {
			if id, err := tk.Validar(raw); err == nil {
				t.Fatalf("debía rechazarse, devolvió id=%d", id)
			}
		})
	}
}

func TestNewTokensExigeClaveLarga(t *testing.T) {
	if _, err := NewTokens(config.JwtSettings{SecretKey: "corta", ExpirationHours: 1}); err == nil {
		t.Fatal("una clave corta debía rechazarse")
	}
}

func TestAuthenticate(t *testing.T) {
	tk := nuevo(t)
	valido, _ := tk.Emitir(7)

	r := gin.New()
	var visto int64
	r.GET("/x", Authenticate(tk), func(c *gin.Context) { visto = UsuarioID(c); c.Status(http.StatusNoContent) })

	casos := []struct {
		nombre, header string
		code           int
		id             int64
	}{
		{"sin cabecera", "", 401, 0},
		{"esquema equivocado", "Basic " + valido, 401, 0},
		{"bearer vacío", "Bearer ", 401, 0},
		{"token malo", "Bearer xxx", 401, 0},
		{"válido", "Bearer " + valido, 204, 7},
		{"válido con espacios", "Bearer " + valido + " ", 204, 7},
	}
	for _, tc := range casos {
		t.Run(tc.nombre, func(t *testing.T) {
			visto = 0
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/x", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			r.ServeHTTP(w, req)

			if w.Code != tc.code || visto != tc.id {
				t.Fatalf("code=%d id=%d, esperaba %d/%d", w.Code, visto, tc.code, tc.id)
			}
			if tc.code == 401 && !strings.Contains(w.Body.String(), `"statusCode":401`) {
				t.Fatalf("el 401 debe tener la forma Problem: %s", w.Body.String())
			}
		})
	}
}

func TestUsuarioIDSinAuthenticateEsCero(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	if UsuarioID(c) != 0 {
		t.Fatal("sin Authenticate debe ser 0 (nadie)")
	}
}
