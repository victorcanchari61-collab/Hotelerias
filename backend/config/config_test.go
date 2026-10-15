package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const yamlBase = `
ConnectionStrings:
  PostgreSQL: "host=localhost dbname=x user=postgres"
  Redis: "localhost:6379"
JwtSettings:
  SecretKey: "una-clave-de-prueba-de-al-menos-32-bytes!!"
  Issuer: "i"
  Audience: "a"
AllowedOrigins:
  - "http://localhost:5173"
`

func escribir(t *testing.T, contenido string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(p, []byte(contenido), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLoadConfigAplicaDefaults(t *testing.T) {
	cfg, err := LoadConfig(escribir(t, yamlBase))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.Port != 8080 || cfg.JwtSettings.ExpirationHours != 8 {
		t.Fatalf("defaults: port=%d horas=%d", cfg.Server.Port, cfg.JwtSettings.ExpirationHours)
	}
	if len(cfg.AllowedOrigins) != 1 {
		t.Fatalf("origins=%v", cfg.AllowedOrigins)
	}
}

// Los secretos no tienen por qué vivir en el archivo.
func TestLoadConfigEntornoPisaElArchivo(t *testing.T) {
	t.Setenv("JWTSETTINGS_SECRETKEY", "otra-clave-que-viene-del-entorno-con-32-bytes+")
	t.Setenv("SERVER_PORT", "9999")
	t.Setenv("CONNECTIONSTRINGS_POSTGRESQL", "host=db dbname=prod")

	cfg, err := LoadConfig(escribir(t, yamlBase))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(cfg.JwtSettings.SecretKey, "otra-clave") {
		t.Errorf("SecretKey no vino del entorno: %q", cfg.JwtSettings.SecretKey)
	}
	if cfg.Server.Port != 9999 {
		t.Errorf("port=%d", cfg.Server.Port)
	}
	if cfg.ConnectionStrings.PostgreSQL != "host=db dbname=prod" {
		t.Errorf("dsn=%q", cfg.ConnectionStrings.PostgreSQL)
	}
}

func TestLoadConfigFallaRapidoSiEstaIncompleta(t *testing.T) {
	casos := map[string]string{
		"clave corta":  strings.Replace(yamlBase, "una-clave-de-prueba-de-al-menos-32-bytes!!", "corta", 1),
		"sin postgres": strings.Replace(yamlBase, `"host=localhost dbname=x user=postgres"`, `""`, 1),
	}
	for nombre, y := range casos {
		t.Run(nombre, func(t *testing.T) {
			if _, err := LoadConfig(escribir(t, y)); err == nil {
				t.Fatal("debía rechazar la config")
			}
		})
	}
}
