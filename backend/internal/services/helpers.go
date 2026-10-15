package services

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// esViolacionUnica detecta una violación de restricción UNIQUE (SQLSTATE 23505).
func esViolacionUnica(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
