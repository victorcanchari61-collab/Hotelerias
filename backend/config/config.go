package config

import (
	"errors"
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server            ServerConfig      `mapstructure:"Server"`
	AllowedOrigins    []string          `mapstructure:"AllowedOrigins"`
	ConnectionStrings ConnectionStrings `mapstructure:"ConnectionStrings"`
	MongoDBSettings   MongoDBSettings   `mapstructure:"MongoDBSettings"`
	JwtSettings       JwtSettings       `mapstructure:"JwtSettings"`
	ApisPeru          ApisPeru          `mapstructure:"ApisPeru"`
}

type ServerConfig struct {
	Port int `mapstructure:"Port"`
}

type ConnectionStrings struct {
	// PostgreSQL acepta una URL (postgres://...) o pares "host=... port=...".
	// El formato "Host=...;Port=..." de Npgsql NO sirve con pgx.
	PostgreSQL string `mapstructure:"PostgreSQL"`
	Redis      string `mapstructure:"Redis"`
	MongoDB    string `mapstructure:"MongoDB"`
}

type MongoDBSettings struct {
	DatabaseName string `mapstructure:"DatabaseName"`
}

type JwtSettings struct {
	SecretKey       string `mapstructure:"SecretKey"`
	Issuer          string `mapstructure:"Issuer"`
	Audience        string `mapstructure:"Audience"`
	ExpirationHours int    `mapstructure:"ExpirationHours"`
}

type ApisPeru struct {
	Url   string `mapstructure:"Url"`
	Token string `mapstructure:"Token"`
}

// minSecretBytes es el mínimo para HS256: una clave más corta que el hash se
// fuerza por diccionario sin mucho esfuerzo.
const minSecretBytes = 32

// LoadConfig lee el YAML y deja que las variables de entorno lo pisen:
// JWTSETTINGS_SECRETKEY, CONNECTIONSTRINGS_POSTGRESQL, SERVER_PORT...
// Así los secretos no tienen que vivir en el archivo.
func LoadConfig(path string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType("yaml")
	v.SetDefault("Server.Port", 8080)
	v.SetDefault("JwtSettings.ExpirationHours", 8)
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if err := v.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, err
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// Validate falla al arrancar, no en el primer request: una config incompleta
// no debe dejar subir el servidor.
func (c *Config) Validate() error {
	var errs []error
	if c.ConnectionStrings.PostgreSQL == "" {
		errs = append(errs, errors.New("ConnectionStrings.PostgreSQL es obligatorio"))
	}
	if len(c.JwtSettings.SecretKey) < minSecretBytes {
		errs = append(errs, fmt.Errorf("JwtSettings.SecretKey necesita al menos %d bytes", minSecretBytes))
	}
	if c.JwtSettings.ExpirationHours <= 0 {
		errs = append(errs, errors.New("JwtSettings.ExpirationHours debe ser mayor que 0"))
	}
	if c.Server.Port <= 0 {
		errs = append(errs, errors.New("Server.Port debe ser mayor que 0"))
	}
	return errors.Join(errs...)
}
