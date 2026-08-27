# MonaWorld OBS Plugin (source skeleton)

This folder is a native OBS plugin starting point for MonaWorld. It is intentionally source-only: a signed installer cannot be produced here without the OBS SDK/toolchain and platform-specific packaging.

Planned capabilities:
- MonaWorld dock inside OBS
- unified multi-chat dock
- media request queue
- event monitor
- overlay URL helper
- authenticated connection to the MonaWorld API

Immediate no-install alternative: use MonaWorld's Browser Source overlay and the web dashboard. The plugin is an enhancement, not a requirement.

Build target: OBS Studio plugin API + CMake.
