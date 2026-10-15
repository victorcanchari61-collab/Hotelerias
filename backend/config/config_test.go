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

func TestLoadConfigLeeDotEnvSinPisarElEntorno(t *testing.T) {
	dir := t.TempDir()
	yaml := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(yaml, []byte(yamlBase), 0o600); err != nil {
		t.Fatal(err)
	}
	env := "# comentario\n\nexport SERVER_PORT=7000\nCONNECTIONSTRINGS_POSTGRESQL=\"host=envfile dbname=x\"\nJWTSETTINGS_SECRETKEY='una-clave-que-viene-del-dotenv-de-32-bytes!!'\n"
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(env), 0o600); err != nil {
		t.Fatal(err)
	}
	// La del entorno real gana sobre el .env.
	t.Setenv("SERVER_PORT", "9100")
	// Y las que SOLO están en el .env se limpian al terminar el test.
	t.Cleanup(func() {
		os.Unsetenv("CONNECTIONSTRINGS_POSTGRESQL")
		os.Unsetenv("JWTSETTINGS_SECRETKEY")
	})

	cfg, err := LoadConfig(yaml)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.Port != 9100 {
		t.Errorf("el entorno real debía ganar al .env: port=%d", cfg.Server.Port)
	}
	if cfg.ConnectionStrings.PostgreSQL != "host=envfile dbname=x" {
		t.Errorf("dsn=%q (comillas dobles sin quitar?)", cfg.ConnectionStrings.PostgreSQL)
	}
	if !strings.HasPrefix(cfg.JwtSettings.SecretKey, "una-clave-que-viene-del-dotenv") {
		t.Errorf("secret=%q", cfg.JwtSettings.SecretKey)
	}
}

func TestDotEnvMalFormadoFalla(t *testing.T) {
	dir := t.TempDir()
	yaml := filepath.Join(dir, "config.yaml")
	_ = os.WriteFile(yaml, []byte(yamlBase), 0o600)
	_ = os.WriteFile(filepath.Join(dir, ".env"), []byte("ESTO NO ES VALIDO\n"), 0o600)
	if _, err := LoadConfig(yaml); err == nil {
		t.Fatal("un .env roto debía fallar, no ignorarse en silencio")
	}
}

func TestSinDotEnvNoEsError(t *testing.T) {
	if _, err := LoadConfig(escribir(t, yamlBase)); err != nil {
		t.Fatal(err)
	}
}

func TestPuertoAceptaDosPuntos(t *testing.T) {
	for _, escrito := range []string{`":5220"`, `5220`, `"5220"`} {
		y := strings.Replace(yamlBase, "ConnectionStrings:", "Server:\n  Port: "+escrito+"\nConnectionStrings:", 1)
		cfg, err := LoadConfig(escribir(t, y))
		if err != nil {
			t.Fatalf("Port: %s -> %v", escrito, err)
		}
		if cfg.Server.Port != 5220 {
			t.Errorf("Port: %s -> %d", escrito, cfg.Server.Port)
		}
	}
}
