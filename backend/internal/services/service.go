package services

import (
	"hotelerias/backend/config"
	"hotelerias/backend/internal/db"
)

// Service agrupa el acceso a datos y la configuración que usan los handlers.
type Service struct {
	DB  *db.Databases
	Cfg *config.Config
}

func New(databases *db.Databases, cfg *config.Config) *Service {
	return &Service{DB: databases, Cfg: cfg}
}

// Postgres devuelve el pool de PostgreSQL. El resto de la app asume que la
// migración ya se ejecutó y que el pool existe.
func (s *Service) Postgres() *db.PostgresDB {
	return s.DB.PostgresDB()
}
