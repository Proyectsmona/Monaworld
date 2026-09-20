# Arquitectura MonaWorld v8

## Principio central

Todo está acotado por `user_id`/`owner_user_id`. Un usuario de MonaWorld puede conectar sus cuatro plataformas y tiene su propia configuración, economía, viewers, comandos y URLs de OBS sin compartir datos con otro streamer.

## Flujo de eventos

```
Twitch EventSub ─┐
Kick Webhook ────┤
YouTube Agent ───┼─> evento normalizado -> D1 -> Points/Coins -> Commands/Alerts -> Durable Object -> OBS
TikTok Agent ────┘
```

## Recursos configurables

`user_resources` permite evolucionar el producto sin crear una tabla distinta para cada pequeño widget. Cada recurso tiene `kind`, `name`, `enabled` y `data_json`, siempre asociado a un usuario.

Kinds principales: command, timer, counter, spam-filter, banned-word, bot-setting, overlay, sticker, sound, alert, media-request, loyalty-setting y coin-setting.

## Tiempo real

Cada streamer tiene un Durable Object nombrado `user:<id>`. Sus Browser Sources se conectan con un token de overlay propio. Los eventos, alertas y canjes se difunden únicamente a esa room.

## Media

Los uploads viven en R2 (`monaworld-media`) y D1 conserva la metadata/ownership. Los archivos se sirven desde `/media/:id`.

## Compatibilidad con v7

Se mantienen los nombres de Worker, D1 y `OverlayRoom` para no romper los bindings/migraciones existentes. `0002_monaworld_multiuser.sql` amplía el esquema sin borrar tablas previas.
