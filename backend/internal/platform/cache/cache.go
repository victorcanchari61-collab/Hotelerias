// Package cache ofrece caché de bytes con TTL. Los módulos declaran su propia
// interfaz (la que necesitan) y estos tipos la satisfacen sin conocerla.
package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// Redis cachea en Redis. Un fallo de lectura se trata como "no está": la caché
// es una optimización, nunca la fuente de verdad, y que Redis se caiga no debe
// tumbar las peticiones.
type Redis struct{ client *redis.Client }

func NewRedis(client *redis.Client) *Redis { return &Redis{client: client} }

func (r *Redis) Get(ctx context.Context, key string) ([]byte, bool) {
	b, err := r.client.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	return b, true
}

func (r *Redis) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return r.client.Set(ctx, key, value, ttl).Err()
}

func (r *Redis) Delete(ctx context.Context, key string) error {
	return r.client.Del(ctx, key).Err()
}

// Nop es la caché que no guarda nada: lo que se usa cuando no hay Redis.
type Nop struct{}

func (Nop) Get(context.Context, string) ([]byte, bool)               { return nil, false }
func (Nop) Set(context.Context, string, []byte, time.Duration) error { return nil }
func (Nop) Delete(context.Context, string) error                     { return nil }
