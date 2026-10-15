package cache

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func TestNopNoGuardaNada(t *testing.T) {
	var c Nop
	ctx := context.Background()
	if err := c.Set(ctx, "k", []byte("v"), time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, ok := c.Get(ctx, "k"); ok {
		t.Fatal("Nop no debe recordar")
	}
	if err := c.Delete(ctx, "k"); err != nil {
		t.Fatal(err)
	}
}

// Contra un Redis real. Se salta si no se indica:
//
//	TEST_REDIS_ADDR=localhost:6379 go test ./internal/platform/cache/
func TestRedis(t *testing.T) {
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("TEST_REDIS_ADDR no definida")
	}
	client := redis.NewClient(&redis.Options{Addr: addr})
	t.Cleanup(func() { _ = client.Close() })
	c := NewRedis(client)
	ctx := context.Background()
	key := "test:cache:" + t.Name()
	t.Cleanup(func() { client.Del(context.Background(), key) })

	if _, ok := c.Get(ctx, key); ok {
		t.Fatal("no debía existir")
	}
	if err := c.Set(ctx, key, []byte("hola"), time.Minute); err != nil {
		t.Fatal(err)
	}
	if v, ok := c.Get(ctx, key); !ok || string(v) != "hola" {
		t.Fatalf("v=%q ok=%v", v, ok)
	}
	if ttl := client.TTL(ctx, key).Val(); ttl <= 0 || ttl > time.Minute {
		t.Fatalf("ttl=%v", ttl)
	}
	if err := c.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if _, ok := c.Get(ctx, key); ok {
		t.Fatal("debía haberse borrado")
	}
}

// Redis caído no es un error para quien lee: es "no está", y se va a la base.
func TestRedisCaidoSeTrataComoAusente(t *testing.T) {
	client := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", DialTimeout: 100 * time.Millisecond, MaxRetries: -1})
	t.Cleanup(func() { _ = client.Close() })
	c := NewRedis(client)

	if _, ok := c.Get(context.Background(), "k"); ok {
		t.Fatal("con Redis caído no debe haber aciertos")
	}
}
