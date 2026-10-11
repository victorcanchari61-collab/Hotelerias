package config

import (
	"github.com/spf13/viper"
)

type Config struct {
	Logging        LoggingConfig        `mapstructure:"Logging"`
	AllowedHosts   string               `mapstructure:"AllowedHosts"`
	AllowedOrigins []string             `mapstructure:"AllowedOrigins"`
	ConnectionStrings ConnectionStrings `mapstructure:"ConnectionStrings"`
	MongoDBSettings MongoDBSettings     `mapstructure:"MongoDBSettings"`
	JwtSettings    JwtSettings          `mapstructure:"JwtSettings"`
	ApisPeru       ApisPeru             `mapstructure:"ApisPeru"`
}

type LoggingConfig struct {
	LogLevel LogLevelConfig `mapstructure:"LogLevel"`
}

type LogLevelConfig struct {
	Default           string `mapstructure:"Default"`
	MicrosoftAspNetCore string `mapstructure:"Microsoft.AspNetCore"`
}

type ConnectionStrings struct {
	PostgreSQL string `mapstructure:"PostgreSQL"`
	Redis      string `mapstructure:"Redis"`
	MongoDB    string `mapstructure:"MongoDB"`
}

type MongoDBSettings struct {
	DatabaseName string `mapstructure:"DatabaseName"`
}

type JwtSettings struct {
	SecretKey      string `mapstructure:"SecretKey"`
	Issuer         string `mapstructure:"Issuer"`
	Audience       string `mapstructure:"Audience"`
	ExpirationHours int    `mapstructure:"ExpirationHours"`
}

type ApisPeru struct {
	Url   string `mapstructure:"Url"`
	Token string `mapstructure:"Token"`
}

func LoadConfig(path string) (*Config, error) {
	viper.SetConfigFile(path)
	viper.SetConfigType("yaml")
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}