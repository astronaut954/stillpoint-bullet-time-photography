// Só para o teste automático no Linux (tests/host): o que o app usa do núcleo das câmeras e do som, sem câmeras e
// sem som. Nada disto entra no app de verdade.
#include "audio_player.h"
#include "camera_settings.h"
#include "sdk_diagnostics.h"

namespace AudioPlayer
{
    bool PlayWavAsync(const std::string&) { return true; }
    bool PlayWavSync(const std::string&) { return true; }
    void Stop() {}
    bool PlayWavMixed(const std::string&, bool) { return true; }
}
namespace CameraSettingsCanon
{
    CameraSettings Read(const CameraContext&) { return {}; }
    bool Write(const CameraContext&, const std::string&, long long, std::string& error) { error = "test"; return false; }
}
bool IsOnCompatibilityList(const std::string&) { return true; }
std::string DescribeConnectionError(long error) { return "error " + std::to_string(error); }
std::string DescribeShotError(long error) { return "error " + std::to_string(error); }
