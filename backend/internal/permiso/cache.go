package permiso

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// Cache es lo que este módulo necesita de una caché. La satisface
// platform/cache (Redis, o Nop cuando no hay Redis) sin que este paquete
// sepa de ellos.
type Cache interface {
	Get(ctx context.Context, key string) ([]byte, bool)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	Delete(ctx context.Context, key string) error
}

// vigenciaRol es corta a propósito. La caché es para no repetir la misma
// consulta en ráfagas de requests, no para vivir de ella: si algo se escapa a
// Olvidar, se corrige solo en menos de un minuto.
const vigenciaRol = 30 * time.Second

// CachedRoles es un PermisosDeRol que recuerda lo que ya preguntó. Envuelve a
// otro PermisosDeRol (decorador): el Service no sabe si hay caché o no.
type CachedRoles struct {
	origen PermisosDeRol
	cache  Cache
}

func NewCachedRoles(origen PermisosDeRol, cache Cache) *CachedRoles {
	return &CachedRoles{origen: origen, cache: cache}
}

func llaveRol(rolID int64) string { return fmt.Sprintf("permisos:rol:%d", rolID) }

func (c *CachedRoles) PermisosDeRol(ctx context.Context, rolID int64) ([]Clave, error) {
	if raw, ok := c.cache.Get(ctx, llaveRol(rolID)); ok {
		var textos []string
		if err := json.Unmarshal(raw, &textos); err == nil {
			claves := make([]Clave, 0, len(textos))
			valido := true
			for _, t := range textos {
				cl, err := ParseClave(t)
				if err != nil {
					valido = false
					break
				}
				claves = append(claves, cl)
			}
			if valido {
				return claves, nil
			}
		}
		// Una entrada ilegible se trata como ausente y se reescribe abajo.
	}

	claves, err := c.origen.PermisosDeRol(ctx, rolID)
	if err != nil {
		return nil, err
	}

	textos := make([]string, len(claves))
	for i, cl := range claves {
		textos[i] = cl.String()
	}
	if raw, err := json.Marshal(textos); err == nil {
		if err := c.cache.Set(ctx, llaveRol(rolID), raw, vigenciaRol); err != nil {
			log.Printf("permiso: no se pudo cachear el rol %d: %v", rolID, err)
		}
	}
	return claves, nil
}

// Olvidar descarta lo recordado de un rol. Se llama al cambiar su matriz: sin
// esto el cambio no se notaría hasta que venza la caché.
func (c *CachedRoles) Olvidar(ctx context.Context, rolID int64) error {
	return c.cache.Delete(ctx, llaveRol(rolID))
}
