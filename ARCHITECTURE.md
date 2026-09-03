# Arquitectura de MonaWorld

Arquitectura hexagonal (puertos y adaptadores) con el dominio en el centro.

## Por qué esta arquitectura y no otra

No se eligió por moda. Este proyecto tiene tres rasgos que la piden:

1. **Cuatro adaptadores para la misma cosa.** Twitch, Kick, YouTube y TikTok
   entran por mecanismos completamente distintos —webhook firmado, streaming
   HTTP, protocolo interno— y todos producen el mismo evento. Es el caso de
   libro de puertos y adaptadores.
2. **Dos runtimes compartiendo lógica.** El Worker de Cloudflare y el agente
   Node ejecutan los mismos normalizadores y las mismas reglas. Sin un núcleo
   compartido, se desincronizan en cuestión de semanas.
3. **Lógica que merece probarse sola.** Cooldowns, cola de alertas y aritmética
   de contadores son decisiones sutiles. Como funciones puras se prueban en
   milisegundos; enterradas en un Durable Object, no se prueban nunca.

Lo que **no** se ha aplicado, por no pagar ceremonia sin retorno: CQRS, event
sourcing, entidades que envuelven primitivas sin añadir invariantes, ni puertos
para cosas con una sola implementación y sin necesidad de sustitución.

## Las capas

```
┌──────────────────────────────────────────────────────────────┐
│  apps/          adaptadores externos                         │
│  worker · agent · panel · overlay                            │
└───────────────────────────┬──────────────────────────────────┘
                            │ implementan puertos
┌───────────────────────────▼──────────────────────────────────┐
│  packages/application     casos de uso + puertos             │
│  orquesta; no sabe de HTTP, SQL ni WebSocket                 │
└───────────────────────────┬──────────────────────────────────┘
                            │ usa
┌───────────────────────────▼──────────────────────────────────┐
│  packages/domain          tipos + lógica pura                │
│  CERO dependencias de runtime, ni siquiera Zod               │
└──────────────────────────────────────────────────────────────┘

  packages/contracts    validación de frontera (Zod) — depende de domain
  packages/connectors   normalizadores por plataforma — depende de domain
  packages/db           esquema Drizzle — infraestructura compartida
```

**La regla que lo sostiene:** las dependencias apuntan siempre hacia dentro.
`domain` no importa nada. `application` importa `domain`. Los adaptadores
importan hacia dentro y nunca al revés.

### `packages/domain`

Tipos y funciones puras. Sin `fetch`, sin base de datos, sin `Date.now()`
directo — el reloj entra por parámetro (`Clock`) para que los cooldowns se
prueben avanzando el tiempo en vez de esperándolo.

No depende ni de Zod. Zod es validación de entrada, y el dominio no valida
entradas: asume que ya llegan bien formadas.

| Módulo | Qué contiene |
| --- | --- |
| `events/` | `StreamEvent`, el contrato común de las cuatro plataformas |
| `rules/` | Condiciones, acciones, emparejador y planificador |
| `alerts/` | Cola serial como máquina de estados pura, y plantillas |
| `economy/` | Contadores, con la regla de que nunca bajan de cero |
| `overlays/` | Layouts declarativos (JSON tipado, nunca HTML) |
| `shared/` | `Result`, errores de dominio, `Clock`, `IdGenerator` |

### `packages/contracts`

Los esquemas Zod, anotados con el tipo de dominio que deben producir:

```ts
export const actorSchema: z.ZodType<Actor> = z.object({ … });
```

Esa anotación es la parte importante: si alguien cambia el dominio y olvida el
esquema —o al revés— el compilador lo para. El esquema y el tipo no pueden
desincronizarse en silencio.

### `packages/application`

Casos de uso y puertos. Un caso de uso orquesta: valida, llama a los puertos en
un orden concreto y devuelve un `Result`. No sabe si detrás hay D1 o un fichero.

El orden de `ingestStreamEvent` es la decisión de diseño más cargada del
proyecto y está documentada en su propio fichero: validar → deduplicar →
aplicar reglas → anotar premios. Invertir los pasos 2 y 3 haría que un reintento
de webhook disparase la alerta dos veces.

### `apps/worker`

El adaptador más externo. `src/index.ts` monta rutas y no contiene lógica de
negocio: si algo ahí empieza a decidir reglas, está en el sitio equivocado.

- `http/container.ts` — **raíz de composición**: el único sitio donde se decide
  qué implementación concreta cumple cada puerto.
- `http/routes/` — una ruta traduce HTTP a un caso de uso y de vuelta.
- `persistence/` — todo el SQL vive aquí.
- `realtime/` — el Durable Object; persiste estado y habla WebSocket, pero la
  política la toma el dominio.

## Convenciones

### Idioma

**Identificadores en inglés, comentarios y textos en español.** El código
convive con librerías en inglés (`crypto.subtle`, `onConflictDoUpdate`) y
mezclar idiomas dentro de una expresión se lee mal. Los comentarios explican el
*porqué* y ahí el español es más preciso para quien mantiene esto.

### Ficheros y carpetas

| Elemento | Convención | Ejemplo |
| --- | --- | --- |
| Ficheros | `kebab-case` | `alert-queue.ts`, `d1-repositories.ts` |
| Tests | junto al código, sufijo `.test.ts` | `alert-queue.test.ts` |
| Carpetas de dominio | sustantivo plural del concepto | `events/`, `rules/` |
| Adaptadores | prefijo de la tecnología | `d1-repositories.ts`, `durable-room.ts` |
| Rutas HTTP | sufijo `-routes.ts` | `webhook-routes.ts` |

Nada de `index.ts` con lógica dentro: solo reexportan.

### Código

| Elemento | Convención | Ejemplo |
| --- | --- | --- |
| Tipos e interfaces | `PascalCase` | `StreamEvent`, `RealtimeRoom` |
| Funciones y variables | `camelCase` | `planActions`, `dedupeKey` |
| Constantes de módulo | `SCREAMING_SNAKE` | `ALERT_GRACE_MS`, `MAX_PENDING` |
| Uniones cerradas | array `as const` + tipo derivado | `PLATFORMS` → `Platform` |
| Booleanos | prefijo `is` / `has` | `isMod`, `hasAwards` |
| Puertos | sustantivo de rol, sin sufijo `I` | `EventRepository` |

Las uniones se declaran como array `as const` y no como `type X = 'a' \| 'b'`
porque así el valor sirve para iterar y para construir el esquema Zod, sin
repetir la lista en tres sitios.

### Comentarios

Explican **por qué**, nunca **qué**. `// incrementa el contador` sobra; «la
cola vive en el Durable Object y no en el navegador para que el orden sobreviva
a que OBS recargue la fuente» es información que no está en el código.

## Decisiones con nombre propio

**La clase del Durable Object se llama `OverlayRoom` y no se renombra.**
`ChannelHub` describiría mejor lo que hace —también sirve al panel— pero
`OverlayRoom` es el `class_name` que la migración `v1` ya aplicó en el Worker
desplegado. Renombrarlo exige una migración `renamed_classes` y un despliegue
con riesgo a cambio de nada funcional. Es un caso donde la mejora de nombre no
paga su coste.

**Los cooldowns viven en la sala, no en el caso de uso.** El Durable Object es
el único punto que serializa por canal, así que es donde «esta regla ya disparó
hace dos segundos» tiene una respuesta única. Por eso `dispatch` recibe las
reglas y calcula el plan dentro, en vez de recibir un plan ya hecho.

**El valor de los eventos se guarda en unidades nativas.** Un gift de TikTok
son «5 rosas», no «0,60 €». La conversión es una regla del streamer, no un
hecho de la plataforma, y hacerla en la ingesta destruiría información.

**Los layouts de overlay son JSON tipado, nunca HTML.** El prototipo
serializaba `innerHTML` en `localStorage` y lo reinyectaba; con nombres de
espectadores llegando de cuatro plataformas, eso es inyección en pantalla
durante el directo.

## Cómo añadir una plataforma

1. `packages/connectors/src/<plataforma>/` con un `PlatformNormalizer`.
2. Un test con payloads reales como fixtures.
3. Decidir el transporte: si entrega por webhook va al Worker
   (`http/routes/webhook-routes.ts`); si necesita conexión larga o IP
   residencial, va al agente (`apps/agent/src/connectors/`).
4. Añadirla a `PLATFORMS` en el dominio.

Nada más. El motor de reglas, la cola, los contadores y el overlay no se tocan.

## Una trampa que costó un fallo real

En `D1EventRepository` la firma del método se escribió como
`Parameters<EventRepository['save']>[0]`, creando una referencia circular entre
la clase y la interfaz que implementa. TypeScript abandona la comprobación de
`implements` en silencio ante esa circularidad: el `typecheck` pasaba con un
método del puerto sin implementar, y el fallo apareció en ejecución.

**Regla:** en un adaptador, escribe los tipos concretos importados del puerto.
Nunca derives la firma del propio puerto que estás implementando.
