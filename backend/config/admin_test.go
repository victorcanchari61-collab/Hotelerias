package config

import "testing"

func TestAdminInicialDefaultsYEntorno(t *testing.T) {
	// Sin nada: no hay administrador que crear, y no es un error de config.
	cfg, err := LoadConfig(escribir(t, yamlBase))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AdminInicial.Email != "" || cfg.AdminInicial.Password != "" || cfg.AdminInicial.Nombre != "Super Admin" {
		t.Fatalf("defaults: %+v", cfg.AdminInicial)
	}

	// La contraseña llega SOLO por el entorno (viper ignora las claves que no
	// conoce: por eso AdminInicial.* tiene default aunque el YAML no las traiga).
	t.Setenv("ADMININICIAL_EMAIL", "admin@hotelerias.test")
	t.Setenv("ADMININICIAL_PASSWORD", "una-clave-larga-del-entorno")
	cfg, err = LoadConfig(escribir(t, yamlBase))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AdminInicial.Email != "admin@hotelerias.test" || cfg.AdminInicial.Password != "una-clave-larga-del-entorno" {
		t.Fatalf("entorno: %+v", cfg.AdminInicial)
	}
}

func TestAdminInicialValidacion(t *testing.T) {
	t.Setenv("ADMININICIAL_EMAIL", "admin@hotelerias.test")
	t.Setenv("ADMININICIAL_PASSWORD", "corta")
	if _, err := LoadConfig(escribir(t, yamlBase)); err == nil {
		t.Fatal("una clave de administrador corta debía rechazarse al arrancar")
	}

	t.Setenv("ADMININICIAL_EMAIL", "")
	t.Setenv("ADMININICIAL_PASSWORD", "una-clave-suficientemente-larga")
	if _, err := LoadConfig(escribir(t, yamlBase)); err == nil {
		t.Fatal("una clave sin correo debía rechazarse")
	}
}
