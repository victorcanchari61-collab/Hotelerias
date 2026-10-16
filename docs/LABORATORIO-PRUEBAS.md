# Laboratorio de pruebas de software (Testing Lab)

Un laboratorio de pruebas es un entorno especializado —físico, virtual o en la nube— con la
infraestructura, el hardware, el software y las herramientas necesarias para evaluar de forma
sistemática la **calidad, el rendimiento, la seguridad y la compatibilidad** de un sistema antes de
que llegue a producción.

A diferencia del entorno de desarrollo local de un programador, un laboratorio simula las
condiciones reales del usuario final o escenarios extremos de estrés, para garantizar que la
aplicación funcione bajo cualquier circunstancia.

## Tipos de laboratorio

Según los objetivos del proyecto, los laboratorios se especializan en distintas áreas.

| Tipo | Propósito | Infraestructura |
|---|---|---|
| **Dispositivos y compatibilidad** (Device Labs) | Verificar que las aplicaciones web y móviles funcionen en múltiples combinaciones de sistemas operativos (iOS, Android, Windows, Linux), navegadores y resoluciones de pantalla. | Suelen ser híbridos: dispositivos físicos reales en racks más plataformas en la nube (BrowserStack, Sauce Labs, AWS Device Farm) para pruebas automatizadas. |
| **Rendimiento y estrés** (Performance & Load) | Medir estabilidad, velocidad y capacidad de respuesta bajo cargas masivas de usuarios concurrentes. | Servidores dedicados o clústeres en la nube que ejecutan simuladores de tráfico (Apache JMeter, k6, Gatling) para identificar cuellos de botella y límites de infraestructura. |
| **Seguridad** (Security & Penetration Testing) | Detectar vulnerabilidades, brechas de datos y fallos de autenticación mediante análisis estático (SAST) y dinámico (DAST). | Entornos aislados (sandboxes) con herramientas de auditoría y escaneo de vulnerabilidades. |
| **Automatización e integración continua** (CI/CD) | Ejecutar suites de pruebas unitarias, de integración y de extremo a extremo (End-to-End) de forma automática cada vez que se integra código nuevo. | Servidores de integración continua (Jenkins, GitLab CI, GitHub Actions) vinculados a contenedores Docker. |

## Beneficios clave

- **Mitigación de riesgos:** detecta fallos críticos antes de que afecten a usuarios reales en
  producción, evitando pérdidas económicas y de reputación.
- **Ahorro a largo plazo:** corregir un error durante las pruebas es mucho más barato y rápido que
  hacerlo en un entorno de producción activo.
- **Consistencia y control:** un entorno aislado y controlado permite repetir las pruebas bajo
  exactamente las mismas condiciones para validar correcciones (reproducibilidad).
- **Experiencia de usuario optimizada:** garantiza que la aplicación sea rápida, accesible y
  compatible sin importar el dispositivo o la ubicación del usuario.
