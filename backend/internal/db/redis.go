package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"hotelerias/backend/config"
)

// silenciosoRedis descarta los mensajes internos de go-redis (satisface su
// interfaz Logging, que es interna y por eso no se puede nombrar).
type silenciosoRedis struct{}

func (silenciosoRedis) Printf(context.Context, string, ...interface{}) {}

func NewRedisClient(ctx context.Context, cfg *config.Config) (*redis.Client, error) {
	// Redis es opcional: si no hay servidor, el backend sigue arrancando. Se
	// silencia el logger de la librería para que los reintentos del pool no
	// llenen la consola.
	redis.SetLogger(silenciosoRedis{})

	url := cfg.ConnectionStrings.Redis
	// "localhost:6379" a secas es lo habitual en el config; ParseURL pide esquema.
	if !strings.Contains(url, "://") {
		url = "redis://" + url
	}

	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis url: %w", err)
	}

	opts.PoolSize = 20
	opts.MinIdleConns = 5
	opts.ConnMaxIdleTime = 30 * time.Minute

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("failed to ping redis: %w", err)
	}

	return client, nil
}
