// MonaWorld OBS plugin source skeleton.
// The production build should link against the OBS Studio plugin SDK and
// register a dock/controls that communicate with MonaWorld over HTTPS/WebSocket.
#include <string>

extern "C" {
// These symbols are intentionally placeholders until the OBS SDK is configured.
const char* monaworld_plugin_name() { return "MonaWorld OBS Plugin"; }
const char* monaworld_plugin_version() { return "0.1.0-prototype"; }
}
