// Package migrate aplica migraciones SQL numeradas (0001_x.sql, 0002_y.sql...)
// una sola vez y en orden. Sin dependencias externas: son pocas y planas.
package migrate

import (
	"context"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// lockKey es el advisory lock que impide que dos instancias migren a la vez.
const lockKey int64 = 7263541001

// Up aplica las migraciones pendientes y devuelve las que aplicó.
// Cada archivo corre en su propia transacción: o entra completo o no entra.
func Up(ctx context.Context, pool *pgxpool.Pool, files fs.FS) ([]string, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("migrate: conexión: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", lockKey); err != nil {
		return nil, fmt.Errorf("migrate: lock: %w", err)
	}
	defer func() { _, _ = conn.Exec(context.Background(), "SELECT pg_advisory_unlock($1)", lockKey) }()

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    TEXT PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return nil, fmt.Errorf("migrate: schema_migrations: %w", err)
	}

	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		return nil, err
	}
	sort.Strings(names)

	var applied []string
	for _, name := range names {
		version := strings.TrimSuffix(name, ".sql")

		var done bool
		if err := conn.QueryRow(ctx,
			"SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", version,
		).Scan(&done); err != nil {
			return applied, fmt.Errorf("migrate: %s: %w", version, err)
		}
		if done {
			continue
		}

		body, err := fs.ReadFile(files, name)
		if err != nil {
			return applied, err
		}

		if err := apply(ctx, conn, version, string(body)); err != nil {
			return applied, fmt.Errorf("migrate: %s: %w", version, err)
		}
		applied = append(applied, version)
	}
	return applied, nil
}

func apply(ctx context.Context, conn *pgxpool.Conn, version, sql string) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Sin argumentos pgx usa el protocolo simple, que admite varias sentencias.
	if _, err := tx.Exec(ctx, sql); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
