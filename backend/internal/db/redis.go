package db

import (
	"context"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"hotelerias/backend/config"
)

func NewRedisClient(cfg *config.Config) (*redis.Client, error) {
	// Redis es opcional: si no hay servidor, el backend sigue arrancando. Se
	// silencia el logger para que los reintentos del pool no llenen la consola.
	redis.SetLogger(log.New(io.Discard, "", 0))

	opts, err := redis.ParseURL("redis://" + cfg.ConnectionStrings.Redis)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis url: %w", err)
	}

	opts.PoolSize = 20
	opts.MinIdleConns = 5
	opts.ConnMaxIdleTime = 30 * time.Minute

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping redis: %w", err)
	}

	return client, nil
}