package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
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
	AdminInicial      AdminInicial      `mapstructure:"AdminInicial"`
}

// AdminInicial es la cuenta de super administrador que se crea al arrancar si
// todavía no existe. El correo y el nombre pueden vivir en config.yaml; la
// CONTRASEÑA va solo en el entorno o en .env (ADMININICIAL_PASSWORD), nunca en
// un archivo versionado ni escrita en el código.
//
// Se crea una sola vez: si la cuenta ya existe no se toca, así que cambiar la
// contraseña aquí después NO la cambia (ni pisa la que alguien eligió).
type AdminInicial struct {
	Email    string `mapstructure:"Email"`
	Nombre   string `mapstructure:"Nombre"`
	Password string `mapstructure:"Password"`
}

type ServerConfig struct {
	// Port es el puerto TCP, sin los dos puntos (5220, no ":5220").
	Port int `mapstructure:"Port"`
	// UploadsDir es la carpeta de archivos subidos (logo, fotos). Se sirve en /uploads.
	UploadsDir string `mapstructure:"UploadsDir"`
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

// MinAdminPassword es el largo mínimo de la contraseña del administrador inicial.
const MinAdminPassword = 10

// LoadConfig lee el YAML y deja que las variables de entorno lo pisen:
// JWTSETTINGS_SECRETKEY, CONNECTIONSTRINGS_POSTGRESQL, SERVER_PORT...
// Así los secretos no tienen que vivir en el archivo.
//
// Si existe un archivo .env junto al YAML, sus variables se cargan antes; las
// que ya estén definidas en el entorno real ganan sobre el .env.
func LoadConfig(path string) (*Config, error) {
	if err := loadDotEnv(filepath.Join(filepath.Dir(path), ".env")); err != nil {
		return nil, err
	}

	v := viper.New()
	v.SetConfigFile(path)
	v.SetConfigType("yaml")
	v.SetDefault("Server.Port", 8080)
	v.SetDefault("Server.UploadsDir", "uploads")
	v.SetDefault("JwtSettings.ExpirationHours", 8)
	// Sin default, viper ignora ADMININICIAL_* si la clave no está en el YAML.
	v.SetDefault("AdminInicial.Email", "")
	v.SetDefault("AdminInicial.Nombre", "Super Admin")
	v.SetDefault("AdminInicial.Password", "")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if err := v.ReadInConfig(); err != nil {
		return nil, err
	}

	// ":5220" y "5220" significan lo mismo; el primero es lo que se escribe en
	// Go para escuchar (":5220") y es fácil copiarlo al YAML tal cual.
	v.Set("Server.Port", strings.TrimPrefix(strings.TrimSpace(v.GetString("Server.Port")), ":"))

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
	// Una contraseña corta para el administrador se rechaza al arrancar, no
	// después de haberla guardado. (Vacía es válido: simplemente no se crea.)
	if p := c.AdminInicial.Password; p != "" && len(p) < MinAdminPassword {
		errs = append(errs, fmt.Errorf("AdminInicial.Password necesita al menos %d caracteres", MinAdminPassword))
	}
	if c.AdminInicial.Password != "" && c.AdminInicial.Email == "" {
		errs = append(errs, errors.New("AdminInicial.Email es obligatorio si hay AdminInicial.Password"))
	}
	return errors.Join(errs...)
}

// loadDotEnv carga un archivo .env (CLAVE=valor, una por línea) al entorno del
// proceso SIN pisar lo que ya esté definido. Que no exista no es un error: en
// producción las variables vienen del entorno y no hay archivo.
//
// Formato soportado, a propósito mínimo: líneas "CLAVE=valor", comentarios con
// "#", líneas vacías, y valores opcionalmente entre comillas simples o dobles.
func loadDotEnv(path string) error {
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("leyendo %s: %w", path, err)
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for n := 1; sc.Scan(); n++ {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, val, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return fmt.Errorf("%s:%d: se esperaba CLAVE=valor", path, n)
		}
		val = strings.TrimSpace(val)
		if len(val) >= 2 && (val[0] == '"' || val[0] == '\'') && val[len(val)-1] == val[0] {
			val = val[1 : len(val)-1]
		}
		if _, definida := os.LookupEnv(key); !definida {
			if err := os.Setenv(key, val); err != nil {
				return err
			}
		}
	}
	return sc.Err()
}
