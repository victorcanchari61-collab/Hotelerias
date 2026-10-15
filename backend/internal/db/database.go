package db

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
	"hotelerias/backend/config"
)

// Databases agrupa las conexiones abiertas. Solo la usa el composition root
// (main): cada módulo recibe únicamente el cliente que necesita, nunca esta
// estructura entera.
type Databases struct {
	// Postgres siempre existe: sin él el sistema no puede autorizar a nadie.
	Postgres *pgxpool.Pool

	// MongoDB y Redis son opcionales y pueden ser nil. Quien los use debe
	// degradar (Redis: sin caché) en vez de asumir que están.
	MongoClient *mongo.Client
	MongoDB     *mongo.Database
	Redis       *redis.Client
}

// Connect abre las bases. Postgres es obligatorio y falla rápido; Mongo y
// Redis solo avisan, porque el sistema funciona sin ellos.
func Connect(ctx context.Context, cfg *config.Config) (*Databases, error) {
	pool, err := NewPostgresPool(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("postgres: %w", err)
	}
	dbs := &Databases{Postgres: pool}

	if client, err := NewMongoClient(ctx, cfg); err != nil {
		log.Printf("warning: MongoDB no disponible: %v", err)
	} else {
		dbs.MongoClient = client
		dbs.MongoDB = client.Database(cfg.MongoDBSettings.DatabaseName)
	}

	if client, err := NewRedisClient(ctx, cfg); err != nil {
		log.Printf("warning: Redis no disponible, se trabaja sin caché: %v", err)
	} else {
		dbs.Redis = client
	}

	return dbs, nil
}

func (d *Databases) Close() {
	if d.Postgres != nil {
		d.Postgres.Close()
	}
	if d.MongoClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = d.MongoClient.Disconnect(ctx)
	}
	if d.Redis != nil {
		_ = d.Redis.Close()
	}
}
