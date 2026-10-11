package db

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/mongo"
	"github.com/redis/go-redis/v9"
	"hotelerias/backend/config"
)

type Databases struct {
	Postgres *PostgresDB
	MongoDB  *MongoDB
	Redis    *RedisDB
}

type PostgresDB struct {
	Pool *pgxpool.Pool
}

type MongoDB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

type RedisDB struct {
	Client *redis.Client
}

func NewDatabases(cfg *config.Config) (*Databases, error) {
	dbs := &Databases{}

	postgresPool, err := NewPostgresPool(cfg)
	if err != nil {
		log.Printf("Warning: PostgreSQL connection failed: %v", err)
	} else {
		dbs.Postgres = &PostgresDB{Pool: postgresPool}
	}

	mongoClient, err := NewMongoClient(cfg)
	if err != nil {
		log.Printf("Warning: MongoDB connection failed: %v", err)
	} else {
		mongoDB := GetMongoDatabase(mongoClient, cfg)
		dbs.MongoDB = &MongoDB{Client: mongoClient, Database: mongoDB}
	}

	redisClient, err := NewRedisClient(cfg)
	if err != nil {
		log.Printf("Warning: Redis connection failed: %v", err)
	} else {
		dbs.Redis = &RedisDB{Client: redisClient}
	}

	return dbs, nil
}

func (d *Databases) Close() {
	if d.Postgres != nil && d.Postgres.Pool != nil {
		d.Postgres.Pool.Close()
	}
	if d.MongoDB != nil && d.MongoDB.Client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		d.MongoDB.Client.Disconnect(ctx)
	}
	if d.Redis != nil && d.Redis.Client != nil {
		d.Redis.Client.Close()
	}
}