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
// Câmeras de mentira com configurações (o estado do rig do Project precisa de algo para ler e mudar): ISO, Shutter,
// Aperture e White balance, guardados na memória, voltando ao padrão a cada vez que o app abre (como as câmeras
// simuladas do app de verdade). Para o teste "mexer no corpo da câmera": STILLPOINT_TEST_CAMERAS aponta um arquivo com
// linhas "câmera chave valor"; cada leitura aplica e apaga o arquivo.
#include "camera_context.h"
#include <cstdlib>
#include <fstream>
#include <map>
#include <sstream>
namespace
{
    struct TestChoices { const char* key; std::vector<std::pair<long long, const char*>> choices; long long start; };
    const std::vector<TestChoices>& TestKeys()
    {
        static const std::vector<TestChoices> keys = {
            { "iso", { { 100, "ISO 100" }, { 200, "ISO 200" }, { 400, "ISO 400" }, { 800, "ISO 800" } }, 400 },
            { "tv", { { 125, "1/125" }, { 200, "1/200" }, { 250, "1/250" } }, 125 },
            { "av", { { 56, "f/5.6" }, { 80, "f/8" }, { 110, "f/11" } }, 80 },
            { "wb", { { 0, "Auto" }, { 1, "Daylight" }, { 2, "Cloudy" } }, 0 },
        };
        return keys;
    }
    std::map<std::string, std::map<std::string, long long>>& TestState()
    {
        static std::map<std::string, std::map<std::string, long long>> state;
        return state;
    }
    std::map<std::string, long long>& TestFor(const std::string& camera)
    {
        auto& s = TestState()[camera];
        if (s.empty()) for (const auto& k : TestKeys()) s[k.key] = k.start;
        return s;
    }
    void TestOverrides()
    {
        const char* file = std::getenv("STILLPOINT_TEST_CAMERAS");
        if (!file || !*file) return;
        std::ifstream in(file);
        if (!in) return;
        std::string camera, key; long long value = 0;
        while (in >> camera >> key >> value) TestFor(camera)[key] = value;
        in.close();
        std::remove(file);
    }
}
namespace CameraSettingsCanon
{
    CameraSettings Read(const CameraContext& cam)
    {
        TestOverrides();
        CameraSettings out;
        out.camera = cam.shortName; out.model = cam.modelName;
        out.adjustable = true; out.mode = "M"; out.manualMode = true; out.focusManual = true;
        auto& state = TestFor(cam.shortName);
        for (const auto& k : TestKeys())
        {
            CameraSetting s; s.key = k.key; s.available = true; s.value = state[k.key];
            for (const auto& [value, label] : k.choices) { s.choices.push_back({ value, label }); if (value == s.value) s.label = label; }
            out.settings.push_back(s);
        }
        return out;
    }
    bool Write(const CameraContext& cam, const std::string& key, long long value, std::string& error)
    {
        for (const auto& k : TestKeys())
            if (key == k.key)
            {
                // (a T7_2 de mentira não aceita mudar o ISO: para testar o recado de ajuste recusado)
                if (cam.shortName == "T7_2" && key == "iso") { error = "This camera does not allow this change."; return false; }
                TestFor(cam.shortName)[key] = value;
                return true;
            }
        error = "Unknown setting.";
        return false;
    }
}
bool IsOnCompatibilityList(const std::string&) { return true; }
std::string DescribeConnectionError(long error) { return "error " + std::to_string(error); }
std::string DescribeShotError(long error) { return "error " + std::to_string(error); }
