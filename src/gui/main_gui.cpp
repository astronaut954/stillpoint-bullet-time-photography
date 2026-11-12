// Interface gráfica do Stillpoint.
//
// A janela é uma página HTML/CSS/JS (assets/ui/) exibida pelo navegador do
// próprio sistema (WebView2 no Windows, WebKit no Mac) dentro de uma janela
// nativa. O trabalho com as câmeras roda numa thread própria ("thread das
// câmeras") pelo coordenador CameraFleet (camera_fleet.cpp): cada câmera fica num
// processo trabalhador próprio (StillpointWorker), e este app não carrega o SDK da
// Canon. A conexão é automática: sem pedidos, essa thread acompanha as câmeras a
// cada ~0,4 s (CameraFleet::MonitorTick), e cada câmera conecta em paralelo.
//
// Comunicação:
//   página -> C++ : funções JavaScript ligadas com webview::bind (shoot, identify...)
//   C++ -> página : window.onCoreEvent({ type: "...", ... }) via webview::dispatch
//
// As fotos ficam na pasta de dados do app (PhotoStore) até a pessoa escolher onde
// salvar. Ao fechar a janela com fotos não salvas, a página pergunta o que fazer;
// se o app fechar de forma inesperada, as fotos continuam lá e são oferecidas na
// próxima abertura.

#if defined(_WIN32) && !defined(NOMINMAX)
#define NOMINMAX  // windows.h (via SDK e webview) define min/max, que quebram std::min/std::max
#endif
#if defined(_WIN32) && !defined(_CRT_SECURE_NO_WARNINGS)
#define _CRT_SECURE_NO_WARNINGS  // getenv: com /sdl, o aviso do Visual Studio vira erro
#endif
#include "audio_player.h"
#include "bullet_time.h"
#include "path_utils.h"
#include "camera_fleet.h"
#include "logger.h"
#include "path_utils.h"
#include "platform/platform.h"
#include "sdk_diagnostics.h"

#include "native_window.h"
#include "photo_store.h"
#include "project.h"
#include "rig_state.h"
#include "exporter.h"
#include "camera_settings.h"
#include "auto_match.h"
#include "match_debug.h"
#include "color_match.h"
#include "platform/media.h"
#include "adobe.h"

#include "webview/webview.h"

#include <algorithm>
#include <optional>
#include <atomic>
#include <chrono>
#include <cmath>
#include <ctime>
#include <condition_variable>
#include <cstdlib>
#include <map>
#include <memory>
#include <deque>
#include <fstream>
#include <set>
#include <functional>
#include <mutex>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace
{
    // ---------------------------------------------------------------------
    // Versão e atualização (versão vem do arquivo VERSION, pelo CMake)
    // ---------------------------------------------------------------------
#ifndef STILLPOINT_VERSION
#define STILLPOINT_VERSION "0.0.0"
#endif
    const char* const kRepo = "astronaut954/stillpoint-bullet-time-photography";
    const std::string kReleaseDownloads = std::string("https://github.com/") + kRepo + "/releases/download/";
    const std::string kRepoPages = std::string("https://github.com/") + kRepo;

    // STILLPOINT_TEST_VERSION=2.1.0: o app se apresenta como uma versão antiga, para
    // testar a atualização com a versão publicada no GitHub
    std::string AppVersion()
    {
        const char* test = std::getenv("STILLPOINT_TEST_VERSION");
        return test && *test ? test : STILLPOINT_VERSION;
    }

    // Versão da última vez que o app abriu (para avisar "Updated to ..."); grava a atual
    std::string SwapLastVersion(const std::string& current)
    {
        const auto file = Platform::AppDataFolder() / "last-version.txt";
        std::string previous;
        {
            std::ifstream in(file);
            std::getline(in, previous);
        }
        std::error_code ec;
        std::filesystem::create_directories(file.parent_path(), ec);
        std::ofstream(file, std::ios::trunc) << current;
        return previous;
    }

    std::string ReadTextFile(const std::filesystem::path& file)
    {
        std::ifstream in(file, std::ios::binary);
        std::stringstream content;
        content << in.rdbuf();
        return content.str();
    }

    struct UpdateState
    {
        std::mutex mutex;
        std::atomic<bool> downloading{ false };
        std::atomic<bool> cancel{ false };
        std::filesystem::path ready;  // instalador baixado e conferido
    };

    // ---------------------------------------------------------------------
    // JSON mínimo (só o necessário para conversar com a página)
    // ---------------------------------------------------------------------
    std::string JsonString(const std::string& text)
    {
        std::string out = "\"";
        for (unsigned char c : text)
        {
            switch (c)
            {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20)
                {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                }
                else
                {
                    out += static_cast<char>(c);
                }
            }
        }
        return out + "\"";
    }

    const int kTrashDays = 15;  // dias na lixeira antes de sair de vez (decisão do dono, 2026-11-01)

    class Json
    {
    public:
        explicit Json(const std::string& type) : type(type) { Add("type", type); }
        Json() = default;  // objeto sem o campo "type" (arquivos como o session.json do Project)
        const std::string& Type() const { return type; }

        Json& Add(const std::string& key, const std::string& value) { return Raw(key, JsonString(value)); }
        Json& Add(const std::string& key, const char* value) { return Raw(key, JsonString(value)); }
        Json& Add(const std::string& key, int value) { return Raw(key, std::to_string(value)); }
        Json& Add(const std::string& key, long value) { return Raw(key, std::to_string(value)); }
        Json& Add(const std::string& key, double value)
        {
            std::ostringstream text;
            text.precision(1);
            text << std::fixed << value;
            return Raw(key, text.str());
        }
        Json& Add(const std::string& key, bool value) { return Raw(key, value ? "true" : "false"); }
        Json& Add(const std::string& key, const std::vector<std::string>& values)
        {
            std::string list = "[";
            for (size_t i = 0; i < values.size(); ++i)
                list += (i ? "," : "") + JsonString(values[i]);
            return Raw(key, list + "]");
        }
        Json& Raw(const std::string& key, const std::string& rawJson)
        {
            body += (body.empty() ? "" : ",") + JsonString(key) + ":" + rawJson;
            return *this;
        }

        std::string Str() const { return "{" + body + "}"; }

    private:
        std::string type;
        std::string body;
    };

    // Argumentos chegam como um array JSON: ["T7_1"], [2, 1, 10], [true]
    std::vector<std::string> ParseStringArgs(const std::string& request)
    {
        std::vector<std::string> args;
        static const std::regex stringPattern(R"re("((?:[^"\\]|\\.)*)")re");
        for (std::sregex_iterator it(request.begin(), request.end(), stringPattern), end; it != end; ++it)
        {
            std::string value;
            const std::string raw = (*it)[1].str();
            for (size_t i = 0; i < raw.size(); ++i)
            {
                if (raw[i] == '\\' && i + 1 < raw.size())
                {
                    const char next = raw[++i];
                    value += next == 'n' ? '\n' : next == 't' ? '\t' : next;
                }
                else
                {
                    value += raw[i];
                }
            }
            args.push_back(value);
        }
        return args;
    }

    std::vector<int> ParseIntArgs(const std::string& request)
    {
        std::vector<int> args;
        static const std::regex numberPattern(R"(-?\d+)");
        for (std::sregex_iterator it(request.begin(), request.end(), numberPattern), end; it != end; ++it)
            args.push_back(std::stoi(it->str()));
        return args;
    }

    // ---------------------------------------------------------------------
    // Thread das câmeras: executa um pedido por vez, na ordem em que chegam
    // ---------------------------------------------------------------------
    class CameraThread
    {
    public:
        // onIdle: chamado a cada ~0,4 s sem pedidos (acompanhamento das câmeras)
        explicit CameraThread(std::function<void()> onIdle)
            : onIdle(std::move(onIdle)), worker([this] { Loop(); })
        {
        }

        ~CameraThread()
        {
            {
                std::lock_guard<std::mutex> lock(mutex);
                stopping = true;
            }
            ready.notify_one();
            worker.join();
        }

        void Post(std::function<void()> task)
        {
            {
                std::lock_guard<std::mutex> lock(mutex);
                tasks.push_back(std::move(task));
            }
            ready.notify_one();
        }

    private:
        void Loop()
        {
            Platform::BeginSdkThread();
            while (true)
            {
                std::function<void()> task;
                {
                    std::unique_lock<std::mutex> lock(mutex);
                    ready.wait_for(lock, std::chrono::milliseconds(400), [this] { return stopping || !tasks.empty(); });
                    if (!tasks.empty())
                    {
                        task = std::move(tasks.front());
                        tasks.pop_front();
                    }
                    else if (stopping)
                    {
                        break;
                    }
                }

                if (task)
                    task();
                else if (onIdle)
                    onIdle();
            }
            Platform::EndSdkThread();
        }

        std::function<void()> onIdle;
        std::mutex mutex;
        std::condition_variable ready;
        std::deque<std::function<void()>> tasks;
        bool stopping = false;
        std::thread worker;
    };

    // Gera prévias de fotos fora da thread da janela (uma de cada vez)
    class PreviewThread
    {
    public:
        PreviewThread() : worker([this] { Loop(); }) {}
        ~PreviewThread()
        {
            {
                std::lock_guard<std::mutex> lock(mutex);
                stopping = true;
            }
            ready.notify_one();
            worker.join();
        }
        void Post(std::function<void()> task)
        {
            {
                std::lock_guard<std::mutex> lock(mutex);
                tasks.push_back(std::move(task));
            }
            ready.notify_one();
        }

    private:
        void Loop()
        {
            while (true)
            {
                std::function<void()> task;
                {
                    std::unique_lock<std::mutex> lock(mutex);
                    ready.wait(lock, [this] { return stopping || !tasks.empty(); });
                    if (stopping)
                        break;
                    task = std::move(tasks.front());
                    tasks.pop_front();
                }
                task();
            }
        }

        std::mutex mutex;
        std::condition_variable ready;
        std::deque<std::function<void()>> tasks;
        bool stopping = false;
        std::thread worker;
    };

    // ---------------------------------------------------------------------
    // Avisos do núcleo -> eventos para a página
    // ---------------------------------------------------------------------
    class GuiListener : public BulletTimeListener
    {
    public:
        explicit GuiListener(webview::webview& window) : window(window) {}

        // Cada aviso vai para a janela principal e para as janelas Live abertas
        void Emit(const Json& event)
        {
            if (closed)
                return;
            const std::string json = event.Str();
            if (event.Type() == "cameras")
            {
                std::lock_guard<std::mutex> lock(mutex);
                lastCameras = json;
            }
            const std::string script = "window.onCoreEvent && window.onCoreEvent(" + json + ")";
            window.dispatch([this, script] { window.eval(script); });
            std::lock_guard<std::mutex> lock(mutex);
            for (webview::webview* extra : extras)
                extra->dispatch([extra, script] { extra->eval(script); });
        }

        void AddWindow(webview::webview* extra)
        {
            std::lock_guard<std::mutex> lock(mutex);
            extras.push_back(extra);
        }
        // Última lista de câmeras mandada (para uma janela Live que acabou de abrir)
        std::string LastCameras()
        {
            std::lock_guard<std::mutex> lock(mutex);
            return lastCameras;
        }

        void Close() { closed = true; }

        // --- Conexão ---
        void OnConnecting(const CameraContext& camera) override
        {
            Emit(Json("connecting").Add("camera", camera.shortName).Add("model", camera.modelName));
        }
        void OnConnectingProgress(const CameraContext& camera, int seconds, int) override
        {
            Emit(Json("connectingProgress").Add("camera", camera.shortName).Add("seconds", seconds));
        }
        void OnConnected(const CameraContext& camera, double seconds) override
        {
            Emit(Json("connected").Add("camera", camera.shortName).Add("model", camera.modelName)
                .Add("seconds", seconds).Add("compatible", camera.onCompatibilityList));
        }
        void OnConnectFailed(const CameraContext& camera, long error, double seconds) override
        {
            Emit(Json("connectFailed").Add("camera", camera.shortName).Add("error", error)
                .Add("seconds", seconds).Add("hint", DescribeConnectionError(error)));
        }

        // --- Sequência ---
        void OnSessionStarted(int index, int total) override
        {
            Emit(Json("sessionStarted").Add("index", index).Add("total", total));
        }
        void OnSessionFolderFailed() override { Emit(Json("sessionFolderFailed")); }
        void OnCountdownStarted(int seconds) override { Emit(Json("countdownStarted").Add("seconds", seconds)); }
        void OnCountdownTick(int secondsLeft) override { Emit(Json("countdownTick").Add("seconds", secondsLeft)); }
        void OnTrigger() override { Emit(Json("trigger")); }
        void OnShotFired(const CameraContext& camera, int index, int total, bool ok) override
        {
            Emit(Json("shotFired").Add("camera", camera.shortName).Add("index", index).Add("total", total).Add("ok", ok));
        }
        void OnShotFailed(const CameraContext& camera, long error) override
        {
            Emit(Json("shotFailed").Add("camera", camera.shortName).Add("error", error)
                .Add("hint", DescribeShotError(error)));
        }
        void OnWaitingForDownloads() override { Emit(Json("waitingDownloads")); }
        void OnDownloadProgress(int done, int total) override
        {
            // Evita inundar a página: só manda quando muda
            if (done == lastDone && total == lastTotal)
                return;
            lastDone = done;
            lastTotal = total;
            Emit(Json("downloadProgress").Add("done", done).Add("total", total));
        }
        void OnDownloadTimeout(const std::vector<const CameraContext*>& lostCameras) override
        {
            std::vector<std::string> names;
            for (const auto* cam : lostCameras)
                names.push_back(cam->shortName);
            Emit(Json("downloadTimeout").Add("lost", names));
        }
        void OnSessionInterrupted() override { Emit(Json("sessionInterrupted")); }
        void OnSessionCompleted() override
        {
            lastDone = lastTotal = -1;
            Emit(Json("sessionCompleted"));
        }
        void OnSequenceCancelled() override { Emit(Json("sequenceCancelled")); }
        void OnSequenceFinished(bool completed) override
        {
            lastDone = lastTotal = -1;
            Emit(Json("sequenceFinished").Add("completed", completed));
        }

    private:
        webview::webview& window;
        std::atomic<bool> closed{ false };
        std::mutex mutex;
        std::vector<webview::webview*> extras;
        std::string lastCameras;

        int lastDone = -1;
        int lastTotal = -1;
    };

    // Estado atual das câmeras para a página redesenhar: conectadas, desconectadas
    // e as que estão conectando agora (com os segundos de espera)
    // Bullet time precisa de UMA foto por câmera: o modo de disparo ("drive") fica em
    // disparo único. Câmera em contínuo ou timer é posta em único pelo app; se ela não
    // aceitar, o aviso aparece no painel (a página lê "drive" nas configurações).
    // Disparo único silencioso também vale (uma foto).
    bool IsSingleShot(long long drive) { return drive == 0x00 || drive == 0x06 || drive == 0x13; }

    // Configurações de todas as câmeras conectadas, na ordem do app
    std::vector<CameraSettings> ReadAllSettings(CameraFleet& controller)
    {
        std::vector<const CameraContext*> ordered;
        for (const auto& cam : controller.GetCameras())
            if (cam.sessionOpen)
                ordered.push_back(&cam);
        std::sort(ordered.begin(), ordered.end(),
            [](const CameraContext* a, const CameraContext* b) { return a->orderPrefix < b->orderPrefix; });
        std::vector<CameraSettings> all;
        for (const CameraContext* cam : ordered)
            all.push_back(controller.ReadSettings(*cam));
        return all;
    }

    // Põe em disparo único as câmeras que não estão (all: leitura atual, atualizada
    // nas que mudaram). Avisa uma vez por câmera se não der.
    void EnsureSingleShot(CameraFleet& controller, std::vector<CameraSettings>& all, std::map<std::string, bool>& warned)
    {
        for (auto& s : all)
        {
            const auto drive = std::find_if(s.settings.begin(), s.settings.end(), [](const CameraSetting& c) { return c.key == "drive"; });
            if (drive == s.settings.end() || !drive->available || IsSingleShot(drive->value))
            {
                warned.erase(s.camera);
                continue;
            }
            const auto cam = std::find_if(controller.GetCameras().begin(), controller.GetCameras().end(),
                [&](const CameraContext& c) { return c.shortName == s.camera && c.sessionOpen; });
            if (cam == controller.GetCameras().end())
                continue;
            std::string error;
            if (controller.WriteSetting(*cam, "drive", 0x00, error))
            {
                Log(s.camera + " was set to single shooting (it was on " + drive->label + ")");
                warned.erase(s.camera);
                s = controller.ReadSettings(*cam);
            }
            else if (!warned[s.camera])
            {
                warned[s.camera] = true;
                Log(s.camera + " is on " + drive->label + " and could not be set to single shooting: " + error);
            }
        }
    }

    void EnsureSingleShot(CameraFleet& controller, std::map<std::string, bool>& warned)
    {
        auto all = ReadAllSettings(controller);
        EnsureSingleShot(controller, all, warned);
    }

    // Modo debug (Settings): pasta com as fotos e as medidas de cada Test shot
    std::filesystem::path DebugRoot() { return Platform::AppDataFolder() / "Debug"; }

    // Texto UTF-8 -> caminho (o u8path do C++17 é marcado como antigo no C++20, e no Visual Studio o aviso vira erro)
    std::filesystem::path Utf8ToPath(const std::string& text)
    {
        return std::filesystem::path(std::u8string(text.begin(), text.end()));
    }
    // Caminho como texto UTF-8 (para mandar à página)
    std::string PathToUtf8(const std::filesystem::path& path)
    {
        const std::u8string text = path.u8string();
        return std::string(reinterpret_cast<const char*>(text.data()), text.size());
    }

    // As fotos de uma sessão do Test shot, uma por câmera, com as configurações atuais
    // (as que a câmera usou nessa foto) e a medida, para o MatchDebug
    std::vector<MatchDebug::Photo> DebugPhotos(CameraFleet& controller, PhotoStore& store, const StoredSession& session,
                                               const std::map<std::string, ColorMatch::Stats>* measured)
    {
        std::map<std::string, const StoredPhoto*> picks;
        for (const auto& p : session.photos)
            if (!picks.count(p.camera) || IsJpegPhoto(p.file))
                picks[p.camera] = &p;
        std::vector<MatchDebug::Photo> photos;
        for (const auto& cam : controller.GetCameras())
        {
            if (!cam.sessionOpen)
                continue;
            MatchDebug::Photo photo;
            photo.camera = cam.shortName;
            photo.settings = controller.ReadSettings(cam);
            const auto pick = picks.find(cam.shortName);
            if (pick != picks.end())
            {
                photo.file = store.Root() / session.name / pick->second->file;
                const auto m = measured ? measured->find(cam.shortName) : std::map<std::string, ColorMatch::Stats>::const_iterator{};
                if (measured && m != measured->end())
                    photo.measured = m->second;
                else if (pick->second->previewable)
                    photo.measured = ColorMatch::Measure(photo.file);
            }
            photos.push_back(photo);
        }
        return photos;
    }

    // Calibração do ajuste fino por modelo (feita pelo "Match automatically")
    std::filesystem::path CalibrationFile() { return Platform::AppDataFolder() / "camera-calibration.txt"; }
    std::filesystem::path ChartCalibrationFile() { return Platform::AppDataFolder() / "chart-calibration.txt"; }

    // Configurações para a tela Camera settings (JSON)
    std::string CameraSettingsJson(CameraFleet& controller, const std::vector<CameraSettings>& all)
    {
        const auto calibrations = AutoMatch::LoadCalibration(CalibrationFile());
        const auto charts = AutoMatch::LoadChartCalibration(ChartCalibrationFile());
        std::string list = "[";
        for (size_t i = 0; i < all.size(); ++i)
        {
            const CameraSettings& s = all[i];
            int order = 0;
            std::string quirk;  // câmera simulada com comportamento de propósito (a página mostra ao lado do nome)
            for (const auto& cam : controller.GetCameras())
                if (cam.shortName == s.camera)
                {
                    order = cam.orderPrefix;
                    if (cam.fake && order == 2)
                        quirk = "Simulated camera: always shoots 16:9, whatever Ratio says (to test the aspect ratio warning).";
                }
            std::string settings = "{";
            for (size_t k = 0; k < s.settings.size(); ++k)
            {
                const CameraSetting& c = s.settings[k];
                std::string choices = "[";
                for (size_t j = 0; j < c.choices.size(); ++j)
                    choices += (j ? "," : "") + std::string("[") + std::to_string(c.choices[j].value) + ","
                               + JsonString(c.choices[j].label) + "]";
                choices += "]";
                settings += (k ? "," : "") + JsonString(c.key) + ":"
                            + Json("setting").Add("available", c.available).Raw("value", std::to_string(c.value))
                                  .Add("label", c.label).Raw("choices", choices).Str();
            }
            settings += "}";
            // Modelo medido com o ajuste fino invertido: a página troca os rótulos (A/B, G/M)
            const auto cal = calibrations.find(s.model);
            const bool abFlip = cal != calibrations.end() && cal->second.abSign < 0;
            const bool gmFlip = cal != calibrations.end() && cal->second.gmSign < 0;
            // Diferença do modelo medida com a cartela (para o Picture Style atual), ou null
            std::string chart = "null";
            for (const auto& c : s.settings)
                if (c.key == "style")
                    if (const auto it = charts.find(AutoMatch::ChartKey(s.model, c.value)); it != charts.end())
                        chart = Json("chart").Add("contrast", it->second.contrast).Add("saturation", it->second.saturation)
                                    .Add("colorTone", it->second.colorTone).Str();
            list += (i ? "," : "") + Json("camera").Add("camera", s.camera).Add("model", s.model)
                .Add("abFlip", abFlip).Add("gmFlip", gmFlip)
                .Add("order", order).Add("adjustable", s.adjustable).Add("reason", s.reason).Add("quirk", quirk)
                .Add("mode", s.mode).Add("manual", s.manualMode).Add("kelvin", s.kelvin)
                .Add("kelvinAvailable", s.kelvinAvailable).Add("shiftAvailable", s.shiftAvailable)
                .Add("shiftAB", s.shiftAB).Add("shiftGM", s.shiftGM).Add("focusManual", s.focusManual)
                .Add("styleDetail", s.styleDetailAvailable).Add("contrast", s.contrast)
                .Add("saturation", s.saturation).Add("colorTone", s.colorTone).Raw("chart", chart)
                .Raw("settings", settings).Str();
        }
        return list + "]";
    }

    // Chamado a cada leitura das configurações (na thread das câmeras): o estado do rig do Project acompanha o que
    // muda nas câmeras (rig_state.h)
    std::function<void(const std::vector<CameraSettings>&)> g_onSettingsRead;

    // Lê tudo uma vez, confere o disparo único e manda para a página
    void EmitCameraSettings(CameraFleet& controller, GuiListener& listener, std::map<std::string, bool>& warned)
    {
        auto all = ReadAllSettings(controller);
        EnsureSingleShot(controller, all, warned);
        if (g_onSettingsRead) g_onSettingsRead(all);
        listener.Emit(Json("cameraSettings").Raw("cameras", CameraSettingsJson(controller, all)));
    }

    Json CamerasSnapshot(CameraFleet& controller)
    {
        const auto pending = controller.GetPendingConnections();

        std::vector<const CameraContext*> ordered;
        for (const auto& cam : controller.GetCameras())
            ordered.push_back(&cam);
        std::sort(ordered.begin(), ordered.end(),
            [](const CameraContext* a, const CameraContext* b) { return a->orderPrefix < b->orderPrefix; });

        std::string list = "[";
        bool first = true;
        auto addItem = [&](const Json& item)
        {
            list += (first ? "" : ",") + item.Str();
            first = false;
        };

        // Câmeras que já aparecem no USB mas que o SDK ainda não lista (a T7 leva ~40 s):
        // aparecem como "conectando", com o tempo desde que apareceram no USB. Com o
        // modelo conhecido, no lugar de uma câmera desse modelo que caiu; senão, como
        // câmera nova ("Canon camera" enquanto o modelo não é conhecido).
        auto starting = controller.GetStartingCameras();
        auto takeStarting = [&](const std::string& model) -> std::optional<StartingCameraInfo>
        {
            auto it = std::find_if(starting.begin(), starting.end(),
                [&](const StartingCameraInfo& s) { return !s.model.empty() && s.model == model; });
            if (it == starting.end())
                return std::nullopt;
            StartingCameraInfo info = *it;
            starting.erase(it);
            return info;
        };

        for (const auto* cam : ordered)
        {
            const bool connected = cam->sessionOpen && !cam->connectionLost;
            auto reconnect = std::find_if(pending.begin(), pending.end(),
                [&](const PendingConnectionInfo& p) { return p.reconnecting && !p.retrying && p.name == cam->shortName; });
            std::optional<StartingCameraInfo> startingInfo;
            if (!connected && reconnect == pending.end())
                startingInfo = takeStarting(cam->modelName);
            const bool startingHere = startingInfo.has_value();
            const bool connecting = !connected && (reconnect != pending.end() || startingHere);
            const bool waiting = connecting && !startingHere && reconnect->queued;

            Json item("camera");
            item.Add("order", cam->orderPrefix)
                .Add("name", cam->shortName)
                .Add("model", cam->modelName)
                .Add("connected", connected)
                .Add("state", connected ? "connected" : connecting ? "connecting" : "disconnected")
                .Add("seconds", startingHere ? startingInfo->seconds : connecting ? reconnect->seconds : 0)
                .Add("waiting", waiting)
                .Add("starting", startingHere)
                .Add("compatible", cam->onCompatibilityList);
            addItem(item);
        }

        // Câmeras novas que ainda estão conectando (sem posição na ordem). Novas
        // tentativas numa conexão que já falhou (ex.: entrada "fantasma" do SDK do
        // Mac) não aparecem, para a lista não piscar.
        for (const auto& p : pending)
        {
            if (p.reconnecting || p.retrying)
                continue;
            Json item("camera");
            item.Add("order", 0)
                .Add("name", p.name)
                .Add("model", p.model)
                .Add("connected", false)
                .Add("state", "connecting")
                .Add("seconds", p.seconds)
                .Add("waiting", p.queued)
                .Add("starting", false)
                .Add("compatible", IsOnCompatibilityList(p.model));
            addItem(item);
        }
        for (const auto& s : starting)
        {
            Json item("camera");
            item.Add("order", 0)
                .Add("name", "")
                .Add("model", s.model.empty() ? std::string("Canon camera") : s.model)
                .Add("connected", false)
                .Add("state", "connecting")
                .Add("seconds", s.seconds)
                .Add("waiting", false)
                .Add("starting", true)
                .Add("compatible", s.model.empty() || IsOnCompatibilityList(s.model));
            addItem(item);
        }
        list += "]";

        Json event("cameras");
        event.Raw("cameras", list);
        return event;
    }

    // ---- Etapa 20: Lightroom Classic e Photoshop ----
    // Fotos que estão sendo editadas fora do app: sessão -> (grupo "02_T7_1" -> "lr" | "ps"). Fica em
    // <pasta de dados>/lightroom/editing.txt (uma linha por sessão: sessão, tab, programa:grupo,programa:grupo...),
    // para valer também em sessões fora de projeto. Some com "Done editing" (e, no pedaço 2, quando a foto
    // editada chega).
    using EditingMap = std::map<std::string, std::map<std::string, std::string>>;
    std::filesystem::path EditingFile() { return Adobe::BridgeFolder() / "editing.txt"; }
    EditingMap LoadEditing()
    {
        EditingMap map;
        std::ifstream in(EditingFile(), std::ios::binary);
        for (std::string line; std::getline(in, line);)
        {
            if (!line.empty() && line.back() == '\r')
                line.pop_back();
            const auto tab = line.find('\t');
            if (tab == std::string::npos)
                continue;
            std::stringstream rest(line.substr(tab + 1));
            for (std::string pair; std::getline(rest, pair, ',');)
            {
                const auto colon = pair.find(':');
                if (colon != std::string::npos && colon + 1 < pair.size())
                    map[line.substr(0, tab)][pair.substr(colon + 1)] = pair.substr(0, colon);
            }
        }
        return map;
    }
    bool SaveEditing(const EditingMap& map)
    {
        std::error_code ec;
        std::filesystem::create_directories(EditingFile().parent_path(), ec);
        std::ofstream out(EditingFile(), std::ios::binary | std::ios::trunc);
        for (const auto& [session, groups] : map)
        {
            if (groups.empty())
                continue;
            out << session << '\t';
            bool first = true;
            for (const auto& [group, program] : groups)
            {
                out << (first ? "" : ",") << program << ':' << group;
                first = false;
            }
            out << '\n';
        }
        return static_cast<bool>(out);
    }
    std::string EditingJson(const EditingMap& map)
    {
        std::string out = "{";
        bool firstSession = true;
        for (const auto& [session, groups] : map)
        {
            if (groups.empty())
                continue;
            Json item;
            for (const auto& [group, program] : groups)
                item.Add(group, program);
            out += (firstSession ? "" : ",") + JsonString(session) + ":" + item.Str();
            firstSession = false;
        }
        return out + "}";
    }
    // Grupo de uma foto (o mesmo da página): "02_T7_1" (ordem e câmera), ou o nome do arquivo
    std::string PhotoGroup(const StoredPhoto& photo)
    {
        if (photo.camera.empty())
            return photo.file;
        char order[8];
        std::snprintf(order, sizeof(order), "%02d", photo.order);
        return std::string(order) + "_" + photo.camera;
    }
    // Uma foto por câmera para o Lightroom: o RAW quando existe (é ele que se edita), senão o JPEG
    std::vector<std::pair<std::string, std::string>> PhotosForEditing(const StoredSession& session)
    {
        std::vector<std::pair<std::string, std::string>> out;  // (grupo, arquivo)
        for (const auto& photo : session.photos)
        {
            const std::string group = PhotoGroup(photo);
            auto it = std::find_if(out.begin(), out.end(), [&](const auto& x) { return x.first == group; });
            if (it == out.end())
                out.emplace_back(group, photo.file);
            else if (IsRawPhoto(photo.file) && !IsRawPhoto(it->second))
                it->second = photo.file;
        }
        return out;
    }

    std::string SessionsJson(const PhotoStore& store)
    {
        std::string list = "[";
        bool firstSession = true;
        // A marca da pasta de editadas de cada sessão: a página esquece as prévias guardadas quando ela muda, antes de
        // desenhar (sem isso a miniatura mostrava por um instante a imagem antiga depois de um ⌘S no Photoshop)
        std::map<std::string, std::string> editedStamps;
        {
            std::stringstream parts(store.EditedStamp());
            for (std::string item; std::getline(parts, item, ';');)
            {
                const size_t colon = item.find(':');
                if (colon != std::string::npos) editedStamps[item.substr(0, colon)] = item.substr(colon + 1);
            }
        }
        for (const auto& session : store.ListSessions())
        {
            std::string photos = "[";
            for (size_t i = 0; i < session.photos.size(); ++i)
            {
                const auto& photo = session.photos[i];
                Json item("photo");
                item.Add("file", photo.file).Add("order", photo.order)
                    .Add("camera", photo.camera).Add("previewable", photo.previewable).Add("edited", photo.edited).Add("psOpen", photo.psOpen).Add("psEdited", photo.psEdited);
                if (!photo.refused.empty())
                    item.Add("refused", photo.refused).Add("refusedWant", photo.refusedWant);
                photos += (i ? "," : "") + item.Str();
            }
            photos += "]";

            Json item("session");
            item.Add("name", session.name).Add("saved", session.saved).Add("missing", session.missing)
                .Add("inProject", session.inProject).Add("label", session.label).Add("edited", session.edited)
                .Add("showEdited", session.showEdited).Add("editedStamp", editedStamps.count(session.name) ? editedStamps[session.name] : std::string()).Add("timing", session.timing).Add("crop", session.crop).Add("align", session.align).Raw("photos", photos);
            list += (firstSession ? "" : ",") + item.Str();
            firstSession = false;
        }
        return list + "]";
    }

    // ---------------------------------------------------------------------
    // Settings: tema e idioma, em <dados do app>/settings.txt ("chave=valor" por
    // linha). Valem ao abrir o app de novo.
    // ---------------------------------------------------------------------

    // Temas: arquivos assets/ui/themes/<nome>.css que começam com
    //   /* stillpoint-theme: Nome do tema */
    // O padrão é o Nocturne com as cores do Neo Terminal. Arquivos sem essa linha (ex.:
    // temas de teste antigos que ficaram numa pasta de build) não aparecem nem carregam.
    const char* const kDefaultTheme = "nocturne-neo";
    // Idiomas da interface (código, nome). Por enquanto só inglês.
    const std::vector<std::pair<std::string, std::string>> kLanguages = { { "en", "English" } };

    std::filesystem::path SettingsFile() { return Platform::AppDataFolder() / "settings.txt"; }

    std::map<std::string, std::string> LoadSettings()
    {
        std::map<std::string, std::string> settings;
        std::ifstream in(SettingsFile());
        for (std::string line; std::getline(in, line);)
        {
            if (!line.empty() && line.back() == '\r')
                line.pop_back();
            const auto eq = line.find('=');
            if (eq != std::string::npos)
                settings[line.substr(0, eq)] = line.substr(eq + 1);
        }
        return settings;
    }

    bool SaveSettings(const std::map<std::string, std::string>& settings)
    {
        std::error_code ec;
        std::filesystem::create_directories(SettingsFile().parent_path(), ec);
        std::ofstream out(SettingsFile(), std::ios::trunc);
        for (const auto& [key, value] : settings)
            out << key << "=" << value << "\n";
        return static_cast<bool>(out);
    }

    // Nome declarado na primeira linha do tema ("" se o arquivo não for um tema do app)
    std::string DeclaredThemeName(const std::filesystem::path& file)
    {
        std::ifstream in(file);
        std::string first;
        std::getline(in, first);
        static const std::regex marker(R"(^\s*/\*\s*stillpoint-theme:\s*(.*?)\s*\*/)");
        std::smatch m;
        return std::regex_search(first, m, marker) ? m[1].str() : std::string();
    }

    // Temas instalados (o padrão primeiro, depois em ordem alfabética)
    std::vector<std::string> AvailableThemes()
    {
        std::vector<std::string> themes;
        std::error_code ec;
        for (const auto& entry : std::filesystem::directory_iterator(
                 Platform::ResourcesDirectory() / "assets" / "ui" / "themes", ec))
            if (entry.path().extension() == ".css" && !DeclaredThemeName(entry.path()).empty())
                themes.push_back(entry.path().stem().string());
        std::sort(themes.begin(), themes.end(), [](const std::string& a, const std::string& b)
        {
            if ((a == kDefaultTheme) != (b == kDefaultTheme))
                return a == kDefaultTheme;
            return a < b;
        });
        if (themes.empty())
            themes.push_back(kDefaultTheme);
        return themes;
    }

    // Nome para mostrar: o declarado no arquivo; se faltar, "nocturne-neo" -> "Nocturne Neo"
    std::string ThemeName(const std::string& id)
    {
        const std::string declared =
            DeclaredThemeName(Platform::ResourcesDirectory() / "assets" / "ui" / "themes" / (id + ".css"));
        if (!declared.empty())
            return declared;
        std::string name;
        bool upper = true;
        for (char c : id)
        {
            if (c == '-' || c == '_') { name += ' '; upper = true; continue; }
            name += upper ? static_cast<char>(std::toupper(static_cast<unsigned char>(c))) : c;
            upper = false;
        }
        return name;
    }

    std::string ChosenTheme(const std::map<std::string, std::string>& settings)
    {
        const auto it = settings.find("theme");
        const auto themes = AvailableThemes();
        if (it != settings.end() && std::find(themes.begin(), themes.end(), it->second) != themes.end())
            return it->second;
        return kDefaultTheme;
    }

    std::string ChosenLanguage(const std::map<std::string, std::string>& settings)
    {
        const auto it = settings.find("language");
        for (const auto& [code, name] : kLanguages)
            if (it != settings.end() && it->second == code)
                return code;
        return kLanguages.front().first;
    }

    // Lista para a página: [{"id":"nocturne-neo","name":"Nocturne Neo"}, ...]
    std::string ChoicesJson(const std::vector<std::pair<std::string, std::string>>& choices)
    {
        std::string list = "[";
        for (size_t i = 0; i < choices.size(); ++i)
            list += (i ? "," : "") + std::string("{\"id\":") + JsonString(choices[i].first) + ",\"name\":"
                    + JsonString(choices[i].second) + "}";
        return list + "]";
    }

    // Lê assets/ui/index.html e embute o tema (CSS), as fontes e app.js (o WebKit
    // do Mac não carrega arquivos locais separados de uma página montada em memória).
    // Página da interface (index.html ou live.html) com o tema, as fontes, as imagens e os
    // scripts embutidos (uma string só para a janela)
    std::string LoadPage(const std::string& file, const std::string& theme)
    {
        const auto dir = Platform::ResourcesDirectory() / "assets" / "ui";
        auto read = [](const std::filesystem::path& path)
        {
            std::ifstream file(path, std::ios::binary);
            std::stringstream content;
            content << file.rdbuf();
            return content.str();
        };

        std::string html = read(dir / file);
        if (html.empty())
            return "<h1>Stillpoint</h1><p>UI files not found: " + dir.string() + "</p>";

        auto replace = [&html](const std::string& marker, const std::string& content)
        {
            const auto pos = html.find(marker);
            if (pos != std::string::npos)
                html.replace(pos, marker.size(), content);
        };

        // Fontes: url("__FONT:arquivo.ttf__") vira o próprio arquivo embutido
        auto embedFonts = [&](std::string css)
        {
            static const std::regex fontMarker(R"(__FONT:([A-Za-z0-9_.\-]+)__)");
            std::string out;
            auto begin = css.cbegin();
            for (std::sregex_iterator it(css.begin(), css.end(), fontMarker), end; it != end; ++it)
            {
                out.append(begin, css.cbegin() + it->position());
                const std::string font = read(dir / "fonts" / (*it)[1].str());
                out += font.empty() ? std::string() : "data:font/ttf;base64," + Base64Encode(font);
                begin = css.cbegin() + it->position() + it->length();
            }
            out.append(begin, css.cend());
            return out;
        };

        // Imagens: src="__IMAGE:arquivo.png__" vira o próprio arquivo embutido (assets/ui/images)
        auto embedImages = [&](std::string text)
        {
            static const std::regex imageMarker(R"(__IMAGE:([A-Za-z0-9_.\-]+)__)");
            std::string out;
            auto begin = text.cbegin();
            for (std::sregex_iterator it(text.begin(), text.end(), imageMarker), end; it != end; ++it)
            {
                out.append(begin, text.cbegin() + it->position());
                const std::string name = (*it)[1].str();
                const std::string data = read(dir / "images" / name);
                const bool svg = name.size() > 4 && name.compare(name.size() - 4, 4, ".svg") == 0;
                const bool jpg = name.size() > 4 && (name.compare(name.size() - 4, 4, ".jpg") == 0);
                const std::string mime = svg ? "image/svg+xml" : jpg ? "image/jpeg" : "image/png";
                out += data.empty() ? std::string() : "data:" + mime + ";base64," + Base64Encode(data);
                begin = text.cbegin() + it->position() + it->length();
            }
            out.append(begin, text.cend());
            return out;
        };
        html = embedImages(html);

        std::string css = read(dir / "themes" / (theme + ".css"));
        if (css.empty())
            css = read(dir / "themes" / (std::string(kDefaultTheme) + ".css"));
        replace("/*__THEME__*/", embedFonts(css));
        replace("/*__LIVE_CSS__*/", read(dir / "live.css"));
        replace("/*__SCRIPT__*/", read(dir / "app.js"));
        replace("/*__LIVE_SCRIPT__*/", read(dir / "live.js"));
        return html;
    }

    int RunApp()
    {
        Platform::InitConsole();
        Platform::WaitForPreviousInstance();   // aberto pelo "Restart app": espera a cópia anterior fechar

        webview::webview window(false, nullptr);
        window.set_title("Stillpoint");
        // Largura de abertura em que os modos do Timing (At once … Custom) cabem numa linha
        // só (496 px no painel Bullet time); não é um mínimo, a janela pode ficar menor.
        // Altura: o painel Bullet time com a linha do tempo pequena em duas alturas (44 px)
        // cabe sem rolar (2026-10-22).
        window.set_size(1300, 880, WEBVIEW_HINT_NONE);
        window.set_size(960, 680, WEBVIEW_HINT_MIN);

        GuiListener listener(window);
        CameraFleet controller(listener);
        PhotoStore store(Platform::AppDataFolder() / "Photos");
        // Sessões salvas e mantidas no app ficam só até fechar: se o app fechou de
        // repente, saem agora
        store.DeleteSaved();
        // Project (etapa 17): pasta da pessoa com as sessões guardadas; lembrado em
        // settings.txt (project=). Com um Project aberto, as sessões novas vão direto para
        // <Project>/Originals (decisão do dono do projeto, 2026-10-29).
        Project project;
        {
            auto settings = LoadSettings();
            std::string error;
            // Teste do Stillpoint com o Lightroom de verdade (tests/e2e; decisões do dono, 2026-11-10): só nesta rodada
            // o app abre o projeto de teste. settings.txt não muda: na próxima vez abre o projeto da pessoa.
            if (const char* e2eProject = std::getenv("STILLPOINT_E2E_PROJECT"); std::getenv("STILLPOINT_E2E") && e2eProject && *e2eProject)
            {
                const std::filesystem::path folder = Utf8ToPath(e2eProject);
                std::error_code ec;
                std::filesystem::create_directories(folder, ec);
                std::string made;
                if (!Project::IsProject(folder))
                    Project::Create(folder, "", made);
                settings["project"] = e2eProject;
                Log("Test run (STILLPOINT_E2E): project " + std::string(e2eProject) + (made.empty() ? "" : " (" + made + ")"));
            }
            if (settings.count("project") && !settings.at("project").empty())
                if (!project.Open(std::filesystem::path(settings.at("project")), error))
                {
                    // Pasta fora do ar (HD desligado) ou sem o índice: o Project fica lembrado e
                    // aparece em âmbar ("not reachable") até a pasta voltar (2.12.1)
                    project.Remember(std::filesystem::path(settings.at("project")));
                    Log("Project not reachable: " + settings.at("project") + " (" + error + ")");
                }
            if (project.Available())
                store.SetProject(project.Originals(), project.Edited());
        }
        // withSize: soma o tamanho das pastas do Project (percorre todos os arquivos — lento com muitos
        // RAW ou HD externo), só quando a janela Project pede; a barra e a lista não precisam
        std::function<std::string()> rigPanelText;  // definido adiante (estado do rig do Project)
        auto projectJson = [&](bool withSize = false)
        {
            Json info("project");
            if (!project.IsOpen())
                return info.Add("open", false).Str();
            // O painel Bullet time guardado neste Project (a página aplica quando o Project muda)
            info.Add("rigPanel", rigPanelText ? rigPanelText() : std::string());
            int sessions = 0, edited = 0, photos = 0;
            std::vector<std::string> folders;
            for (const auto& session : store.ListSessions())
                if (session.inProject)
                {
                    ++sessions;
                    photos += static_cast<int>(session.photos.size());
                    if (session.edited > 0 && session.edited >= static_cast<int>(session.photos.size()))
                        ++edited;
                    folders.push_back(session.name);
                }
            project.SyncIndex(folders);
            info.Add("open", true).Add("name", project.Name()).Add("folder", project.Root().string())
                .Add("available", project.Available()).Add("sessions", sessions).Add("photos", photos)
                .Add("edited", edited);
            if (withSize)
                info.Add("bytes", static_cast<double>(project.SizeBytes()));
            return info.Raw("exportDefaults", project.ExportDefaults().empty() ? "null" : project.ExportDefaults()).Str();
        };
        // Pasta onde "New project…" cria os projetos (2.12.2): settings.txt projectsFolder=, ou
        // <Imagens>/Stillpoint (criada quando for usada; decisão do dono do projeto, 2026-10-30)
        auto projectsFolder = [&]() -> std::filesystem::path
        {
            const auto settings = LoadSettings();
            if (settings.count("projectsFolder") && !settings.at("projectsFolder").empty())
                return std::filesystem::path(settings.at("projectsFolder"));
            return Platform::PicturesFolder() / "Stillpoint";
        };
        // Para onde a janela de salvar manda (2.14, decisão do dono em 2026-10-30): com Project
        // aberto, <Project>/Exports; sem, <pasta do Stillpoint>/Exports (a mesma base dos projetos
        // novos: <Imagens>/Stillpoint, ou a que a pessoa escolheu em Settings)
        auto defaultExportFolder = [&]() -> std::filesystem::path
        {
            if (project.Available())
                return project.Exports();
            return projectsFolder() / "Exports";
        };
        // Pastas recentes de Project (settings.txt, recentProjects=, separadas por "|")
        auto recentProjects = [&]() -> std::vector<std::string>
        {
            std::vector<std::string> out;
            const auto settings = LoadSettings();
            if (!settings.count("recentProjects"))
                return out;
            std::stringstream text(settings.at("recentProjects"));
            for (std::string part; std::getline(text, part, '|');)
                if (!part.empty())
                    out.push_back(part);
            return out;
        };
        auto rememberProject = [&](const std::string& folder)
        {
            auto settings = LoadSettings();
            settings["project"] = folder;
            if (!folder.empty())
            {
                std::vector<std::string> recent = recentProjects();
                recent.erase(std::remove(recent.begin(), recent.end(), folder), recent.end());
                recent.insert(recent.begin(), folder);
                if (recent.size() > 10)
                    recent.resize(10);
                std::string joined;
                for (const auto& r : recent)
                    joined += (joined.empty() ? "" : "|") + r;
                settings["recentProjects"] = joined;
            }
            SaveSettings(settings);
        };
        // Fotos de teste do "Reorder by photo": só servem para ordenar, são apagadas depois
        PhotoStore orderStore(Platform::AppDataFolder() / "Order photos");
        orderStore.DeleteAll();
        // Lixeira (etapa 20): o que foi apagado fica 15 dias; ao abrir, sai o que passou do prazo
        store.PurgeTrash(kTrashDays);
        PreviewThread previews;

        bool sdkReady = false;
        std::atomic<bool> busy{ false };
        // STILLPOINT_FAKE_CAMERAS=9: câmeras simuladas (sem SDK) para testar a interface
        // sem câmeras. Disparos geram fotos de teste com o número da câmera.
        int fakeCount = 0;
        if (const char* fake = std::getenv("STILLPOINT_FAKE_CAMERAS"))
            try { fakeCount = std::clamp(std::stoi(fake), 1, 64); } catch (...) { fakeCount = 0; }
        std::atomic<bool> fakeCancel{ false };
        std::atomic<bool> allowClose{ false };
        std::atomic<bool> shuttingDown{ false };

        // Tempo real: sem pedidos pendentes, acompanha as câmeras a cada ~0,4 s.
        // Cada câmera conecta em paralelo; a página recebe a lista sempre que algo
        // muda e, enquanto alguma conecta, a cada volta (para mostrar os segundos).
        std::string settingsCameras;  // câmeras da última leitura das configurações
        std::map<std::string, bool> singleShotWarned;  // câmeras que não aceitaram disparo único (já avisadas)
        CameraThread cameras([&]
        {
            if (!sdkReady || busy || shuttingDown)
                return;
            if (!fakeCount)  // câmeras simuladas: sem SDK, só a leitura das configurações abaixo
            {
                // Redesenha quando algo mudou, e a cada volta enquanto há câmera conectando
                // ou ligando (para o tempo de espera andar)
                if (controller.MonitorTick(&listener) || controller.HasPendingConnections()
                    || !controller.GetStartingCameras().empty())
                    listener.Emit(CamerasSnapshot(controller));
            }

            // Configurações (avisos no painel e tela Camera settings): lidas de novo quando
            // as câmeras conectadas mudam (com a janela aberta, a página pede a cada 3 s).
            // Out/2026, Mac: com o aviso de "configuração mudada" do SDK ligado, o app fechou ao
            // desligar as câmeras (falha dentro do EdsGetEvent). Suspeita: esse aviso; saiu.
            if (controller.HasPendingConnections())
                return;
            std::string connected;
            for (const auto& cam : controller.GetCameras())
                if (cam.sessionOpen)
                    connected += cam.shortName + "@" + cam.portName + ";";
            if (connected != settingsCameras)
            {
                settingsCameras = connected;
                EmitCameraSettings(controller, listener, singleShotWarned);
            }
        });

        // Mensagens de texto do núcleo vão para o log da página
        SetLogSink([&listener](const std::string& message) { listener.Emit(Json("log").Add("text", message)); });

        // Enquanto uma câmera conecta, o SDK não aceita outros comandos: disparar
        // ou identificar teria de esperar a conexão terminar (até dezenas de segundos)
        auto cameraConnecting = [&]
        {
            if (!controller.HasPendingConnections())
                return false;
            listener.Emit(Json("waitConnecting"));
            return true;
        };

        // Lixeira: quantos itens e quanto ocupa (para o botão da barra de cima)
        auto emitTrash = [&]
        {
            const auto items = store.ListTrash();
            unsigned long long bytes = 0;
            int count = 0;
            std::set<std::string> restoredIds;
            for (const auto& item : items)
                if (item.restored)
                    restoredIds.insert(item.id);
            for (const auto& item : items)
                // o de dentro de um projeto apagado já conta no projeto (até o projeto ser restaurado)
                if (!item.restored && (item.parent.empty() || restoredIds.count(item.parent)))
                {
                    bytes += item.bytes;
                    ++count;
                }
            listener.Emit(Json("trash").Add("count", count).Raw("bytes", std::to_string(bytes)).Add("days", kTrashDays));
        };
        auto emitSessions = [&]
        {
            listener.Emit(Json("sessions").Raw("sessions", SessionsJson(store)).Raw("project", projectJson()));
            emitTrash();
        };

        // =================== O estado do rig por Project (rig_state.h; pedido do dono, 2026-11-11) ===================
        // O arquivo e a memória são mexidos pela thread das câmeras (leituras, ordem) e pela da janela (o painel,
        // abrir e fechar o Project): tudo sob rigMutex.
        std::mutex rigMutex;
        std::filesystem::path rigFolder;       // a pasta do Project aberto (vazia = sem Project)
        Rig::State rigState;
        Rig::Memory rigMemory;
        bool rigOrderApplied = false;          // a ordem guardada já foi posta nas câmeras desde que o Project abriu
        bool rigHadCameras = false;            // o Project já tinha câmeras guardadas ao abrir (senão, nada a avisar)
        Rig::Check rigAsked;                   // as diferenças perguntadas, esperando a resposta
        std::map<int, Rig::Check> rigHistory;  // as perguntas já feitas neste Project, pelo número (para o ⌘Z da resposta)
        int rigAskId = 0;
        std::vector<std::string> rigConnectOrder;  // números de série na ordem em que as câmeras apareceram (sem Project)
        std::function<void()> rigAfterTask;
        auto rigSave = [&] { if (!rigFolder.empty()) Rig::Save(Rig::FileIn(rigFolder), rigState); };
        // As câmeras ligadas, na ordem do app: (número de série, nome)
        auto rigConnected = [&]
        {
            std::vector<const CameraContext*> ordered;
            for (const auto& cam : controller.GetCameras())
                if (cam.sessionOpen) ordered.push_back(&cam);
            std::sort(ordered.begin(), ordered.end(), [](const CameraContext* a, const CameraContext* b) { return a->orderPrefix < b->orderPrefix; });
            std::vector<std::pair<std::string, std::string>> out;
            for (const CameraContext* cam : ordered) out.push_back({ cam->portName, cam->shortName });
            return out;
        };
        auto rigSerials = [&]
        {
            std::vector<std::string> out;
            for (const auto& [serial, name] : rigConnected()) out.push_back(serial);
            return out;
        };
        // Uma leitura das câmeras no formato do rig
        auto rigReading = [&](const std::vector<CameraSettings>& all)
        {
            std::vector<Rig::Camera> now;
            for (const CameraSettings& s : all)
                for (const auto& cam : controller.GetCameras())
                    if (cam.shortName == s.camera && cam.sessionOpen && s.reason.find("not connected") == std::string::npos
                        && s.reason.find("not responding") == std::string::npos)
                        now.push_back(Rig::Read(s, cam.portName, cam.orderPrefix));
            return now;
        };
        // A ordem de agora vai para o Project (as câmeras dele que não estão ligadas ficam no lugar delas)
        auto rigNoteOrder = [&]
        {
            if (rigFolder.empty() || !rigOrderApplied) return;
            const auto merged = Rig::MergeOrder(rigState.order, rigSerials());
            if (merged == rigState.order) return;
            rigState.order = merged;
            rigSave();
        };
        rigAfterTask = [&] { std::lock_guard<std::mutex> lock(rigMutex); rigNoteOrder(); };
        g_onSettingsRead = [&](const std::vector<CameraSettings>& all)
        {
            std::lock_guard<std::mutex> lock(rigMutex);
            if (rigFolder.empty()) return;
            // (a câmera que o Project não conhece só entra na conferência, rigCheck, que é quem avisa dela)
            if (Rig::Absorb(rigState, rigReading(all), rigMemory, false)) rigSave();
        };
        rigPanelText = [&] { std::lock_guard<std::mutex> lock(rigMutex); return rigState.panel; };
        // Abrir, trocar ou fechar o Project (thread da janela): carrega o estado dele e esquece o que estava resolvido
        auto rigProjectChanged = [&](const std::filesystem::path& folder)
        {
            bool closed = false;
            {
                std::lock_guard<std::mutex> lock(rigMutex);
                if (folder == rigFolder) return;
                closed = folder.empty();
                rigFolder = folder;
                rigState = folder.empty() ? Rig::State() : Rig::Load(Rig::FileIn(folder));
                rigHadCameras = !rigState.cameras.empty();
                rigMemory.Clear();
                rigAsked = Rig::Check();
                rigHistory.clear();
                rigOrderApplied = false;
            }
            // Sem Project: as câmeras voltam à ordem em que conectaram (decisão do dono); as configurações delas ficam
            if (closed)
                cameras.Post([&]
                {
                    if (busy) return;
                    std::vector<std::string> names;
                    {
                        std::lock_guard<std::mutex> lock(rigMutex);
                        const auto connected = rigConnected();
                        for (const auto& serial : rigConnectOrder)
                            for (const auto& [s, name] : connected)
                                if (s == serial) names.push_back(name);
                        std::vector<std::string> current;
                        for (const auto& [s, name] : connected) current.push_back(name);
                        if (names.size() != current.size() || names == current) names.clear();
                    }
                    if (names.empty()) return;
                    controller.SetCameraOrder(names);
                    listener.Emit(CamerasSnapshot(controller));
                });
        };
        // O Project que já veio aberto das preferências (aberto lá em cima, antes disto existir)
        if (project.Available()) rigProjectChanged(project.Root());

        // Executa um pedido na thread das câmeras, avisando a página de "ocupado"
        auto run = [&](const std::string& action, std::function<void()> task)
        {
            if (busy.exchange(true))
                return;
            listener.Emit(Json("busy").Add("busy", true).Add("action", action));
            cameras.Post([&, task]
            {
                task();
                if (rigAfterTask) rigAfterTask();  // a ordem das câmeras, se mudou, vai para o Project
                listener.Emit(CamerasSnapshot(controller));
                busy = false;
                listener.Emit(Json("busy").Add("busy", false));
            });
        };

        // Fecha o app de fato (depois que a página já resolveu as fotos).
        //
        // Dado observado no Mac: ao encerrar as câmeras, o SDK da Canon precisa que
        // a thread da janela continue funcionando. Se a janela fechar primeiro e
        // ficar esperando as câmeras, os dois esperam um pelo outro e o app trava.
        // Por isso: a janela continua aberta, a thread das câmeras encerra tudo e
        // só então manda a janela fechar. Se demorar demais, o programa sai mesmo assim.
        std::atomic<bool> camerasClosed{ false };
        auto closeNow = [&]
        {
            if (shuttingDown.exchange(true))
                return;
            store.DeleteSaved();  // as salvas mantidas no app saem ao fechar (a cópia salva fica)
            SetLogSink([](const std::string&) {});
            listener.Emit(Json("closing"));

            // Segurança: se as câmeras não encerrarem (o SDK da Canon travado), o
            // programa sai mesmo assim. As fotos já estão gravadas em disco.
            std::thread([] {
                std::this_thread::sleep_for(std::chrono::seconds(12));
                std::_Exit(0);
            }).detach();

            cameras.Post([&]
            {
                std::thread([] {
                    std::this_thread::sleep_for(std::chrono::seconds(8));
                    std::_Exit(0);  // o SDK não respondeu ao encerrar
                }).detach();

                // Uma câmera no meio da conexão segura o SDK: não dá para encerrar
                // direito. As fotos já estão gravadas em disco.
                if (controller.HasPendingConnections())
                    std::_Exit(0);
                controller.CloseSessions();
                // No Mac, encerrar o SDK aqui (fora da thread principal) às vezes
                // derruba o app: o ImageCaptureCore da Apple lança uma exceção ao
                // parar a busca de câmeras. As sessões já foram fechadas e o app vai
                // sair em seguida, então o sistema libera o resto.
#ifndef __APPLE__
                if (sdkReady)
                    controller.Stop();
#else
                (void)sdkReady;
#endif
                camerasClosed = true;
                window.dispatch([&]
                {
                    allowClose = true;
                    window.terminate();
                });
            });
        };

        // --- Câmeras e disparo ---

        auto startSdk = [&]
        {
            if (fakeCount)
            {
                // Câmeras simuladas: SL3 e T7 alternadas, todas "conectadas", sem SDK
                auto& list = controller.GetCameras();
                if (list.empty())
                    for (int i = 0; i < fakeCount; ++i)
                    {
                        CameraContext cam;
                        const bool sl3 = i % 2 == 0;
                        cam.modelName = sl3 ? "Canon EOS Rebel SL3" : "Canon EOS Rebel T7";
                        cam.shortName = (sl3 ? "SL3_" : "T7_") + std::to_string(i / 2 + 1);
                        cam.baseShortName = cam.shortName;
                        cam.portName = "fake" + std::to_string(i + 1);
                        cam.orderPrefix = i + 1;
                        cam.sessionOpen = true;
                        cam.fake = true;
                        list.push_back(cam);
                    }
                controller.SetOutputFolder(project.Available() ? project.Originals().string() : store.Root().string());
                sdkReady = true;
                Log("Fake cameras: " + std::to_string(fakeCount) + " (STILLPOINT_FAKE_CAMERAS)");
                return;
            }
            sdkReady = controller.Start();
            if (!sdkReady)
            {
                listener.Emit(Json("sdkFailed"));
                return;
            }
            controller.SetOutputFolder(project.Available() ? project.Originals().string() : store.Root().string());
        };

        const std::string version = AppVersion();
        const std::string previousVersion = SwapLastVersion(STILLPOINT_VERSION);
        UpdateState update;

        // Tema e idioma escolhidos no Settings (valem a partir desta abertura)
        const auto settings = LoadSettings();
        const std::string theme = ChosenTheme(settings);
        const std::string language = ChosenLanguage(settings);
        // Modo debug: vale na hora e desliga sozinho ao fechar o app (não fica esquecido ligado)
        std::atomic<bool> debugMode{ false };
        std::mutex debugFolderMutex;
        std::filesystem::path lastDebugFolder;
        auto rememberDebugFolder = [&](const std::filesystem::path& folder)
        {
            std::lock_guard<std::mutex> lock(debugFolderMutex);
            lastDebugFolder = folder;
        };

        window.bind("uiReady", [&](const std::string&) -> std::string
        {
            // Só liga o SDK: a procura e a conexão das câmeras são automáticas
            cameras.Post([&]
            {
                if (!sdkReady)
                    startSdk();
                listener.Emit(CamerasSnapshot(controller));
            });
            // STILLPOINT_TEST_RESTART=1: mostra o botão "Restart app" o tempo todo, para testar
            // o reinício sem precisar de uma câmera presa conectando
            std::string selfUpdateReason;
            const bool canSelfUpdate = Platform::CanSelfUpdate(selfUpdateReason);
            return Json("startup").Add("unsavedSessions", store.CountUnsaved())
                .Add("testRestart", std::getenv("STILLPOINT_TEST_RESTART") != nullptr)
                .Add("version", version)
                .Add("previousVersion", previousVersion)
#ifdef _WIN32
                .Add("os", "windows")
#else
                .Add("os", "macos")
#endif
                .Add("canSelfUpdate", canSelfUpdate)
                .Add("selfUpdateReason", selfUpdateReason)
                .Add("checkUpdates", std::getenv("STILLPOINT_NO_UPDATE_CHECK") == nullptr)
                .Raw("themes", [&]
                {
                    std::vector<std::pair<std::string, std::string>> themes;
                    for (const auto& id : AvailableThemes())
                        themes.emplace_back(id, ThemeName(id));
                    return ChoicesJson(themes);
                }())
                .Add("theme", theme)
                .Raw("languages", ChoicesJson(kLanguages))
                .Add("language", language)
                .Add("debug", debugMode.load())
                .Add("timing", settings.count("timing") ? settings.at("timing") : std::string())
                .Add("live", settings.count("live") ? settings.at("live") : std::string())
                .Raw("project", projectJson())
                .Add("projectsFolder", projectsFolder().string())
                .Raw("prefs", [&]
                {
                    // Preferências da página (savePref): chaves "pref.<nome>" do settings.txt
                    Json prefs("prefs");
                    for (const auto& [key, value] : settings)
                        if (key.rfind("pref.", 0) == 0)
                            prefs.Add(key.substr(5), value);
                    return prefs.Str();
                }())
                .Add("fakeCameras", fakeCount).Str();
        });

        // setDebugMode(true/false): liga ou desliga o modo debug (Settings). Não é gravado:
        // ao abrir o app, começa desligado.
        window.bind("setDebugMode", [&](const std::string& request) -> std::string
        {
            debugMode = request.find("true") != std::string::npos;
            return Json("settings").Add("ok", true).Add("debug", debugMode.load())
                .Add("bytes", static_cast<double>(MatchDebug::FolderSize(DebugRoot()))).Str();
        });

        // debugInfo(): espaço ocupado pelos dados de debug (Settings)
        window.bind("debugInfo", [&](const std::string&) -> std::string
        {
            return Json("debugInfo").Add("bytes", static_cast<double>(MatchDebug::FolderSize(DebugRoot()))).Str();
        });

        // deleteDebugData(): apaga todas as pastas de debug
        window.bind("deleteDebugData", [&](const std::string&) -> std::string
        {
            std::error_code ec;
            for (const auto& entry : std::filesystem::directory_iterator(DebugRoot(), ec))
                std::filesystem::remove_all(entry.path(), ec);
            {
                std::lock_guard<std::mutex> lock(debugFolderMutex);
                lastDebugFolder.clear();
            }
            return Json("debugInfo").Add("bytes", static_cast<double>(MatchDebug::FolderSize(DebugRoot()))).Str();
        });

        // openDebugFolder(): abre a pasta do último Test shot com debug (ou a pasta Debug)
        window.bind("openDebugFolder", [&](const std::string&) -> std::string
        {
            std::filesystem::path folder;
            {
                std::lock_guard<std::mutex> lock(debugFolderMutex);
                folder = lastDebugFolder;
            }
            std::error_code ec;
            if (folder.empty() || !std::filesystem::exists(folder, ec))
            {
                folder = DebugRoot();
                std::filesystem::create_directories(folder, ec);
            }
            Platform::OpenInFileManager(folder);
            return "null";
        });

        // saveSettings(tema, idioma): grava no settings.txt. restart: true quando o que
        // foi escolhido é diferente do que está em uso (vale ao abrir de novo).
        // saveTiming(texto): como as câmeras disparam (Timing do painel Bullet time), guardado
        // como a página mandou (JSON numa linha)
        window.bind("saveTiming", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty() || args[0].find('\n') != std::string::npos)
                return Json("settings").Add("ok", false).Str();
            auto current = LoadSettings();
            current["timing"] = args[0];
            return Json("settings").Add("ok", SaveSettings(current)).Str();
        });

        // savePref(nome, valor): preferência da página (ex.: últimas configurações de export),
        // guardada em settings.txt como "pref.<nome>=" e devolvida no uiReady (prefs)
        window.bind("savePref", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 2 || args[0].empty() || args[0].find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_") != std::string::npos
                || args[1].find('\n') != std::string::npos)
                return Json("settings").Add("ok", false).Str();
            auto current = LoadSettings();
            current["pref." + args[0]] = args[1];
            return Json("settings").Add("ok", SaveSettings(current)).Str();
        });

        window.bind("saveSettings", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 2)
                return Json("settings").Add("ok", false).Str();
            const auto themes = AvailableThemes();
            const bool themeOk = std::find(themes.begin(), themes.end(), args[0]) != themes.end();
            const bool languageOk = std::any_of(kLanguages.begin(), kLanguages.end(),
                                                [&](const auto& l) { return l.first == args[1]; });
            if (!themeOk || !languageOk)
                return Json("settings").Add("ok", false).Str();
            auto current = LoadSettings();
            current["theme"] = args[0];
            current["language"] = args[1];
            const bool ok = SaveSettings(current);
            return Json("settings").Add("ok", ok).Add("restart", ok && (args[0] != theme || args[1] != language)).Str();
        });

        // Solução de problemas: fecha a conexão com todas as câmeras e deixa a
        // procura automática conectar de novo (o SDK continua ligado: desligar e
        // religar o SDK no Mac fazia as câmeras não voltarem)
        window.bind("restartConnections", [&](const std::string&) -> std::string
        {
            run("restart", [&]
            {
                controller.WaitPendingConnections();
                controller.CloseSessions();
                controller.ResetConnectionHistory();
                if (!sdkReady)
                    startSdk();
            });
            return "null";
        });

        // Câmeras simuladas: faz o que RunSequence faz (mesmos avisos para a página),
        // mas em vez de disparar, grava uma foto de teste por item do plano
        auto fakeRun = [&](const SequenceSettings& settings)
        {
            fakeCancel = false;
            bool completed = true;
            for (int sessionIndex = 1; sessionIndex <= settings.sessionCount && completed; ++sessionIndex)
            {
                listener.OnSessionStarted(sessionIndex, settings.sessionCount);
                if (!controller.PrepareSessionFolder(sessionIndex, settings.sessionCount, "FAKE"))
                {
                    listener.OnSessionFolderFailed();
                    return;
                }
                const std::filesystem::path dir = controller.GetCameras().front().currentShotDir;
                std::error_code ec;
                listener.OnCountdownStarted(settings.countdownSeconds);
                for (int s = settings.countdownSeconds; s >= 1 && completed; --s)
                {
                    listener.OnCountdownTick(s);
                    if (settings.playSounds)
                        AudioPlayer::PlayWavMixed(GetAssetAudioPath("countdown.wav").string());
                    for (int step = 0; step < 10 && completed; ++step)
                    {
                        std::this_thread::sleep_for(std::chrono::milliseconds(100));
                        if (fakeCancel)
                            completed = false;
                    }
                }
                if (!completed)
                {
                    std::filesystem::remove(dir, ec);
                    break;
                }
                listener.OnTrigger();
                if (settings.playSounds)
                {
                    AudioPlayer::PlayWavMixed(GetAssetAudioPath("countdown.wav").string());  // o toque do "0", junto
                    AudioPlayer::PlayWavMixed(GetAssetAudioPath("itsbullettime.wav").string(), true);
                }
                // Plano: vazio = todas ao mesmo tempo, uma foto por câmera
                std::vector<CanonController::ScheduledShot> plan = settings.schedule;
                if (plan.empty())
                    for (const auto& cam : controller.GetCameras())
                        plan.push_back({ cam.shortName, 0 });
                listener.OnWaitingForDownloads();
                const auto start = std::chrono::steady_clock::now();
                int done = 0;
                const bool groupSounds = settings.groupSounds && settings.playSounds;
                int tickedSecond = 0;
                std::vector<bool> fakeRefused(plan.size(), false);  // disparos "busy" das simuladas
                std::vector<std::string> refusedLines;
                for (size_t i = 0; i < plan.size(); ++i)
                {
                    const bool scheduled = !settings.schedule.empty();
                    while (true)
                    {
                        if (fakeCancel) { completed = false; break; }
                        const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
                        if (elapsed >= plan[i].atMs)
                            break;
                        // Metrônomo entre grupos (intervalo maior que 1,5 s): um toque a cada segundo
                        // contado do primeiro disparo, menos no segundo em que um grupo sai; como no núcleo
                        const int gap = i > 0 ? plan[i].atMs - plan[i - 1].atMs : 0;
                        if (groupSounds && scheduled && gap > 1500)
                        {
                            const int second = static_cast<int>(elapsed / 1000);
                            if (second >= 1 && second != tickedSecond)
                            {
                                tickedSecond = second;
                                bool groupHere = false;
                                for (const auto& item : plan)
                                    if (std::abs(item.atMs - second * 1000) <= 300)
                                        groupHere = true;
                                if (!groupHere)
                                    AudioPlayer::PlayWavMixed(GetAssetAudioPath("countdown.wav").string());
                            }
                        }
                        std::this_thread::sleep_for(std::chrono::milliseconds(std::min<long long>(20, plan[i].atMs - elapsed)));
                    }
                    if (!completed)
                        break;
                    int number = 0;
                    // Como a T7 de verdade (medido em 2026-10-22): a câmera recusa ("busy") uma foto
                    // pedida a menos de ~0,93 s da própria anterior aceita (+ ~0,1 s da ordem chegar)
                    bool refused = false;
                    if (scheduled)
                    {
                        for (int j = static_cast<int>(i) - 1; j >= 0; --j)
                            if (plan[j].shortName == plan[i].shortName && !fakeRefused[j])
                            {
                                // Conta a partir da última foto ACEITA desta câmera
                                refused = plan[i].atMs - plan[j].atMs < 1030;
                                break;
                            }
                        fakeRefused[i] = refused;
                    }
                    for (const auto& cam : controller.GetCameras())
                        if (cam.shortName == plan[i].shortName)
                        {
                            number = cam.orderPrefix;
                            if (scheduled)
                            {
                                const int gapBefore = i > 0 ? plan[i].atMs - plan[i - 1].atMs : 0;
                                if (groupSounds && i > 0 && gapBefore >= 500)
                                {
                                    AudioPlayer::PlayWavMixed(GetAssetAudioPath("group.wav").string(), true);
                                    // Toque do metrônomo junto com o som do grupo, menos no último grupo
                                    const int at = plan[i].atMs;
                                    const bool last = !std::any_of(plan.begin() + i, plan.end(), [at](const auto& s) { return s.atMs > at; });
                                    if (gapBefore > 1500 && !last && std::abs(at - static_cast<int>((at + 500) / 1000) * 1000) <= 300)
                                        AudioPlayer::PlayWavMixed(GetAssetAudioPath("countdown.wav").string());
                                }
                                listener.OnShotFired(cam, static_cast<int>(i) + 1, static_cast<int>(plan.size()), !refused);
                                if (refused)
                                {
                                    listener.OnShotFailed(cam, EDS_ERR_DEVICE_BUSY);
                                    refusedLines.push_back(std::to_string(i + 1) + " " + cam.shortName + " 0x00000081");
                                }
                            }
                        }
                    if (refused)
                        continue;
                    char prefix[8];
                    std::snprintf(prefix, sizeof(prefix), "%02d", static_cast<int>(i) + 1);
                    // A foto simulada sai na proporção que a câmera simulada informa (Ratio); a câmera 02
                    // entrega sempre 16:9, o que for que esteja marcado, para testar o aviso de proporção
                    double ratio = 1.5;
                    for (const auto& cam : controller.GetCameras())
                        if (cam.shortName == plan[i].shortName)
                        {
                            const CameraSettings s = controller.ReadSettings(cam);
                            for (const auto& st : s.settings)
                                if (st.key == "aspect" && st.available)
                                    ratio = st.value == 1 ? 4.0 / 3.0 : st.value == 2 ? 16.0 / 9.0 : st.value == 7 ? 1.0 : 1.5;
                            if (cam.orderPrefix == 2)
                                ratio = 16.0 / 9.0;
                        }
                    WriteTestPhoto(dir / (std::string(prefix) + "_" + plan[i].shortName + "_IMG_" + std::to_string(1000 + i) + ".jpg"), number, static_cast<int>(i) + 1, ratio);
                    ++done;
                }
                if (!refusedLines.empty())
                {
                    // Mesmo arquivo que o CameraFleet escreve: etiqueta "n missing" na lista
                    std::ofstream out((dir / ".missing").string(), std::ios::trunc);
                    for (const auto& line : refusedLines)
                        out << line << "\n";
                }
                // "Download": depois dos disparos, para não atrasar os tempos do plano
                for (int i = 0; i < done; ++i)
                {
                    std::this_thread::sleep_for(std::chrono::milliseconds(120));
                    listener.OnDownloadProgress(i + 1, static_cast<int>(plan.size()));
                }
                if (completed)
                    listener.OnSessionCompleted();
                if (completed && sessionIndex < settings.sessionCount)
                    std::this_thread::sleep_for(std::chrono::milliseconds(600));
            }
            if (!completed)
                listener.OnSequenceCancelled();
            listener.OnSequenceFinished(completed);
        };

        // Plano do disparo com intervalos: "câmera:ms,câmera:ms,..." em ordem de tempo
        auto parseSchedule = [](const std::string& text)
        {
            std::vector<CanonController::ScheduledShot> plan;
            std::stringstream ss(text);
            std::string part;
            while (std::getline(ss, part, ','))
            {
                const auto colon = part.rfind(':');
                if (colon == std::string::npos || colon == 0)
                    continue;
                try { plan.push_back({ part.substr(0, colon), std::max(0, std::stoi(part.substr(colon + 1))) }); }
                catch (...) {}
            }
            std::stable_sort(plan.begin(), plan.end(), [](const auto& a, const auto& b) { return a.atMs < b.atMs; });
            return plan;
        };

        // shoot(contagem, sessões, espera, plano): plano vazio = todas ao mesmo tempo
        window.bind("shoot", [&](const std::string& request) -> std::string
        {
            // A página manda os quatro como texto: "3", "1", "10", "SL3_1:0,T7_1:500"
            const auto args = ParseStringArgs(request);
            SequenceSettings settings;
            settings.mixedAudio = true;  // sons sobrepostos na interface gráfica
            auto number = [&](size_t i, int fallback) { try { return std::stoi(args.at(i)); } catch (...) { return fallback; } };
            if (args.size() >= 3)
            {
                settings.countdownSeconds = std::max(0, number(0, 0));
                settings.sessionCount = std::max(1, number(1, 1));
                settings.downloadWaitSeconds = std::max(1, number(2, 10));
            }
            if (args.size() > 3)
                settings.schedule = parseSchedule(args[3]);
            if (args.size() > 4)
            {
                // "som do disparo,som dos grupos" (1/0); só o segundo = compatível com "1"
                const std::string flags = args[4];
                const auto comma = flags.find(',');
                if (comma == std::string::npos)
                    settings.groupSounds = flags == "1";
                else
                {
                    settings.playSounds = flags.substr(0, comma) == "1";
                    settings.groupSounds = flags.substr(comma + 1) == "1";
                }
            }
            // A janela Live recebe o plano inteiro antes de começar: cada item com a
            // câmera (nome e número) e o instante em ms. Plano vazio = todas juntas no 0.
            {
                std::string items;
                auto addItem = [&](const std::string& shortName, int atMs)
                {
                    int number = 0;
                    for (const auto& cam : controller.GetCameras())
                        if (cam.shortName == shortName)
                            number = cam.orderPrefix;
                    items += std::string(items.empty() ? "" : ",") + "{\"cam\":" + JsonString(shortName)
                        + ",\"number\":" + std::to_string(number) + ",\"t\":" + std::to_string(atMs) + "}";
                };
                if (settings.schedule.empty())
                {
                    for (const auto& cam : controller.GetCameras())
                        if (cam.sessionOpen)
                            addItem(cam.shortName, 0);
                }
                else
                    for (const auto& item : settings.schedule)
                        addItem(item.shortName, item.atMs);
                listener.Emit(Json("livePlan").Add("countdown", settings.countdownSeconds).Add("sessions", settings.sessionCount)
                    .Add("all", settings.schedule.empty()).Raw("shots", "[" + items + "]"));
            }
            // Resumo do Timing (texto da página, 6º argumento) para o session.json do Project
            const std::string timingText = args.size() > 5 ? args[5] : std::string();
            const std::string planText = args.size() > 3 ? args[3] : std::string();
            auto writeSessionInfo = [&, timingText, planText]
            {
                if (!project.Available())
                    return;
                // Sessões do Project ainda sem session.json: acabaram de ser disparadas
                for (const auto& session : store.ListSessions())
                {
                    if (!session.inProject)
                        continue;
                    std::error_code ec;
                    if (std::filesystem::exists(store.SessionDir(session.name) / "session.json", ec))
                        continue;
                    std::string cams = "[";
                    for (const auto& cam : controller.GetCameras())
                        if (cam.sessionOpen || cam.fake)
                            cams += std::string(cams.size() > 1 ? "," : "") + Json().Add("order", cam.orderPrefix)
                                .Add("name", cam.shortName).Add("model", cam.modelName).Str();
                    cams += "]";
                    std::string shotAt = session.name;  // "2026-10-22_14-30-05" -> "2026-10-22T14:30:05"
                    if (shotAt.size() >= 19) { shotAt[10] = 'T'; shotAt[13] = ':'; shotAt[16] = ':'; }
                    store.WriteSessionInfo(session.name, Json().Add("shotAt", shotAt).Add("timing", timingText)
                        .Add("plan", planText).Raw("cameras", cams).Str());
                }
            };
            run("shoot", [&, settings, writeSessionInfo]
            {
                if (fakeCount) { fakeRun(settings); writeSessionInfo(); emitSessions(); return; }
                if (cameraConnecting())
                    return;
                EnsureSingleShot(controller, singleShotWarned);  // uma foto por câmera
                controller.RunSequence(settings);
                writeSessionInfo();
                emitSessions();
            });
            return "null";
        });

        // =================== Project (etapa 17) ===================
        // Com a pasta do Project fora do ar (Available() false), as sessões novas vão para a
        // pasta do app, como sem Project; quando a pasta volta, reloadProjectIfBack() religa.
        auto applyProject = [&]
        {
            if (project.Available())
                store.SetProject(project.Originals(), project.Edited());
            else
                store.SetProject({}, {});
            rigProjectChanged(project.Available() ? project.Root() : std::filesystem::path());
            store.PurgeTrash(kTrashDays);  // a lixeira do Project também perde o que passou do prazo
            if (sdkReady)
                controller.SetOutputFolder(project.Available() ? project.Originals().string() : store.Root().string());
            emitSessions();
        };
        auto reloadProjectIfBack = [&]
        {
            if (!project.ReloadIfBack())
                return;
            Log("Project reachable again: " + project.Name() + " (" + project.Root().string() + ")");
            applyProject();
        };
        auto openProjectAt = [&](const std::string& folder) -> std::string
        {
            std::string error;
            Project fresh;
            if (!fresh.Open(std::filesystem::path(folder), error))
                return error;
            project = fresh;
            rememberProject(folder);
            applyProject();
            Log("Project opened: " + project.Name() + " (" + folder + ")");
            return "";
        };
        // Cria (ou abre, se já for um) o Project na pasta dada
        auto createOrOpenProject = [&](const std::string& folder) -> std::string
        {
            std::string error;
            if (Project::IsProject(std::filesystem::path(folder)))
                return openProjectAt(folder);  // já é um Project: só abre
            if (Project::Create(std::filesystem::path(folder), "", error))
                return openProjectAt(folder);
            return error;
        };
        // projectNew(nome): cria <pasta padrão>/<nome> direto (2.12.2). Sem nome (ou nome vazio):
        // pergunta a pasta no seletor do sistema, começando na pasta padrão ("Choose another folder…")
        window.bind("projectNew", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const std::string name = !args.empty() ? args[0] : std::string();
            std::string folder;
            if (!name.empty())
            {
                if (name.find_first_of("/\\:*?\"<>|") != std::string::npos || name.front() == '.' || name.back() == ' ')
                    return Json("project").Add("error", "That name cannot be used for a folder (no / \\ : * ? \" < > | and it cannot start with a dot).").Str();
                // args[1]: outra pasta escolhida na caixa New project (só para este projeto)
                const std::filesystem::path base = args.size() > 1 && !args[1].empty() ? std::filesystem::path(args[1]) : projectsFolder();
                std::error_code ec;
                std::filesystem::create_directories(base, ec);
                if (!std::filesystem::is_directory(base, ec))
                    return Json("project").Add("error", "Could not create the projects folder " + base.string() + " (" + ec.message() + ").").Str();
                const std::filesystem::path target = base / name;
                if (std::filesystem::exists(target, ec))  // nome já usado: a página avisa antes; aqui é a trava
                    return Json("project").Add("error", (Project::IsProject(target) ? "There is already a project named \"" : "There is already a folder named \"")
                        + name + "\" in " + base.string() + ".").Str();
                folder = target.string();
                Log("New project: " + folder);
            }
            else
            {
                Log("New project: choosing the folder");
                folder = NativeWindow::ChooseFolder("Choose or create the folder for the new project", projectsFolder().string());
                if (folder.empty())
                {
                    Log("New project: no folder chosen");
                    return Json("project").Add("cancelled", true).Str();
                }
            }
            const std::string error = createOrOpenProject(folder);
            return Json("project").Add("error", error).Raw("project", projectJson()).Str();
        });
        // projectNameFree(nome): o nome ainda não existe na pasta padrão? (aviso na caixa New project)
        window.bind("projectNameFree", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const std::string name = !args.empty() ? args[0] : std::string();
            const std::filesystem::path base = args.size() > 1 && !args[1].empty() ? std::filesystem::path(args[1]) : projectsFolder();
            std::error_code ec;
            const std::filesystem::path target = base / name;
            const bool exists = !name.empty() && std::filesystem::exists(target, ec);
            return Json("name").Add("free", !exists).Add("project", exists && Project::IsProject(target))
                .Add("folder", base.string()).Str();
        });
        // projectChooseParent(começo): a caixa New project continua aberta; escolhe onde criar
        // ("" = cancelou) e a pessoa dá o nome depois
        window.bind("projectChooseParent", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const std::string start = !args.empty() && !args[0].empty() ? args[0] : projectsFolder().string();
            const std::string folder = NativeWindow::ChooseFolder("Choose where to create the new project", start);
            return Json("folder").Add("folder", folder).Str();
        });
        // =================== Uso do computador (rodapé do Activity, 2.12.4) ===================
        // systemStats(): a página chama a cada 2 s só com o Activity aberto. Lê os contadores na
        // thread das câmeras (é ela que conhece os processos de câmera) e responde pelo evento
        // "stats". A % de CPU vem da diferença entre esta amostra e a anterior; a primeira só
        // guarda a base. Nada aqui percorre pastas.
        struct StatsSample { double wall = 0; double appCpu = 0; double sysBusy = 0; double sysTotal = 0; };
        auto statsPrev = std::make_shared<StatsSample>();
        window.bind("systemStats", [&, statsPrev](const std::string&) -> std::string
        {
            // Espaço livre no disco do projeto (ou da pasta do app): barato, pode ser aqui mesmo
            std::error_code ec;
            const std::filesystem::path diskPath = project.Available() ? project.Root() : store.Root();
            const auto space = std::filesystem::space(diskPath, ec);
            const long long diskFree = ec ? -1 : static_cast<long long>(space.available);
            const std::string diskLabel = project.Available() ? "Project disk" : "App disk";
            cameras.Post([&, statsPrev, diskFree, diskLabel]
            {
                const double now = std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
                Platform::ProcessUsage self = Platform::QueryProcessUsage(0);
                double appCpu = self.cpuSeconds;
                long long appMem = self.residentBytes;
                int threads = self.threads;
                int processes = 1;
                for (const long long pid : controller.WorkerPids())
                {
                    const Platform::ProcessUsage w = Platform::QueryProcessUsage(pid);
                    if (!w.ok) continue;
                    appCpu += w.cpuSeconds; appMem += w.residentBytes; threads += w.threads; ++processes;
                }
                const Platform::SystemUsage sys = Platform::QuerySystemUsage();
                Json out("stats");
                out.Add("ok", self.ok && sys.ok).Add("processes", processes).Add("threads", threads)
                   .Add("appMemory", static_cast<double>(appMem))
                   .Add("memoryTotal", static_cast<double>(sys.memoryTotalBytes)).Add("memoryAvailable", static_cast<double>(sys.memoryAvailableBytes))
                   .Add("cpuCount", sys.cpuCount).Add("diskFree", static_cast<double>(diskFree)).Add("diskLabel", diskLabel);
                const double dt = now - statsPrev->wall;
                if (statsPrev->wall > 0 && dt > 0.2)
                {
                    // % do computador inteiro (todos os núcleos), como o Gerenciador de Tarefas
                    out.Add("appCpu", std::max(0.0, (appCpu - statsPrev->appCpu) / dt / sys.cpuCount * 100.0));
                    const double sysDt = sys.cpuTotalSeconds - statsPrev->sysTotal;
                    out.Add("systemCpu", sysDt > 0 ? std::max(0.0, (sys.cpuBusySeconds - statsPrev->sysBusy) / sysDt * 100.0) : 0.0);
                }
                *statsPrev = { now, appCpu, sys.cpuBusySeconds, sys.cpuTotalSeconds };
                listener.Emit(out);
            });
            return "null";
        });
        // projectsFolderInfo() / projectsFolderChange(): a pasta onde os projetos novos são criados
        // (settings.txt, projectsFolder=; padrão <Imagens>/Stillpoint). Change abre o seletor.
        // custom: a pessoa escolheu outra (senão é a padrão <Imagens>/Stillpoint)
        auto projectsFolderCustom = [&]()
        {
            const auto settings = LoadSettings();
            return settings.count("projectsFolder") && !settings.at("projectsFolder").empty();
        };
        window.bind("projectsFolderInfo", [&](const std::string&) -> std::string
        {
            return Json("projectsFolder").Add("folder", projectsFolder().string()).Add("custom", projectsFolderCustom()).Str();
        });
        // projectsFolderChange("reset"): volta para a padrão; sem argumento abre o seletor
        window.bind("projectsFolderChange", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (!args.empty() && args[0] == "reset")
            {
                auto settings = LoadSettings();
                settings.erase("projectsFolder");
                SaveSettings(settings);
                Log("New projects folder back to the default: " + projectsFolder().string());
                return Json("projectsFolder").Add("folder", projectsFolder().string()).Add("custom", false).Add("cancelled", false).Str();
            }
            const std::string folder = NativeWindow::ChooseFolder("Choose the folder where new projects are created", projectsFolder().string());
            if (!folder.empty())
            {
                auto settings = LoadSettings();
                settings["projectsFolder"] = folder;
                SaveSettings(settings);
                Log("New projects folder: " + folder);
            }
            return Json("projectsFolder").Add("folder", projectsFolder().string()).Add("custom", projectsFolderCustom()).Add("cancelled", folder.empty()).Str();
        });
        // projectOpen(pasta opcional): abre um Project (pergunta a pasta se não vier)
        window.bind("projectOpen", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            std::string folder = !args.empty() ? args[0] : std::string();
            if (folder.empty())
                folder = NativeWindow::ChooseFolder("Choose the project folder", projectsFolder().string());
            if (folder.empty())
                return Json("project").Add("cancelled", true).Str();
            if (!Project::IsProject(std::filesystem::path(folder)))
                return Json("project").Add("notProject", true).Add("folder", folder).Str();  // a página pergunta se cria
            const std::string error = openProjectAt(folder);
            return Json("project").Add("error", error).Raw("project", projectJson()).Str();
        });
        // projectCreateAt(pasta): cria o Project numa pasta que a pessoa já escolheu
        window.bind("projectCreateAt", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const std::string error = args.empty() ? std::string("No folder.") : createOrOpenProject(args[0]);
            return Json("project").Add("error", error).Raw("project", projectJson()).Str();
        });
        // projectDiscardNew(pasta): Desfazer do "New project…" — apaga a pasta do projeto recém-criado
        // só se ela ainda estiver como foi criada (o índice e Originals/, Edited/, Exports/ vazias;
        // arquivos do sistema como .DS_Store não contam) e não for o projeto aberto. Sai dos recentes.
        // Devolve {ok:true} ou {ok:false, reason:"notEmpty"|"open"|"missing"}.
        window.bind("projectDiscardNew", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty() || args[0].empty())
                return Json("discard").Add("ok", false).Add("reason", "missing").Str();
            const std::filesystem::path folder(args[0]);
            std::error_code ec;
            if (!Project::IsProject(folder))
                return Json("discard").Add("ok", false).Add("reason", "missing").Str();
            if (project.IsOpen() && std::filesystem::equivalent(project.Root(), folder, ec))
                return Json("discard").Add("ok", false).Add("reason", "open").Str();
            auto systemFile = [](const std::string& n) { return n == ".DS_Store" || n == "Thumbs.db" || n == "desktop.ini" || n.rfind("._", 0) == 0; };
            bool clean = true;
            for (const auto& entry : std::filesystem::directory_iterator(folder, ec))
            {
                const std::string n = entry.path().filename().string();
                if (systemFile(n) || n == Project::kIndexFile)
                    continue;
                if ((n == "Originals" || n == "Edited" || n == "Exports") && entry.is_directory(ec))
                {
                    for (const auto& inner : std::filesystem::recursive_directory_iterator(entry.path(), ec))
                        if (!systemFile(inner.path().filename().string()) && !inner.is_directory(ec))
                        {
                            clean = false;
                            break;
                        }
                    if (!clean)
                        break;
                    continue;
                }
                clean = false;
                break;
            }
            if (ec || !clean)
                return Json("discard").Add("ok", false).Add("reason", "notEmpty").Str();
            std::filesystem::remove_all(folder, ec);
            if (ec)
                return Json("discard").Add("ok", false).Add("reason", "notEmpty").Str();
            auto settings = LoadSettings();
            std::vector<std::string> recent = recentProjects();
            recent.erase(std::remove(recent.begin(), recent.end(), folder.string()), recent.end());
            std::string joined;
            for (const auto& r : recent)
                joined += (joined.empty() ? "" : "|") + r;
            settings["recentProjects"] = joined;
            SaveSettings(settings);
            Log("New project undone: " + folder.string() + " removed");
            return Json("discard").Add("ok", true).Str();
        });
        // Recentes: tira ou põe uma pasta (apagar / restaurar um projeto pela lixeira)
        auto setRecent = [&](const std::string& folder, bool add)
        {
            auto settings = LoadSettings();
            std::vector<std::string> recent = recentProjects();
            recent.erase(std::remove(recent.begin(), recent.end(), folder), recent.end());
            if (add)
                recent.insert(recent.begin(), folder);
            if (recent.size() > 10)
                recent.resize(10);
            std::string joined;
            for (const auto& r : recent)
                joined += (joined.empty() ? "" : "|") + r;
            settings["recentProjects"] = joined;
            SaveSettings(settings);
        };
        // projectDelete(): fecha o projeto aberto e manda a pasta inteira para a lixeira (fica no mesmo
        // disco, 15 dias). Devolve {ok, id, folder, name} ou {ok:false, error}.
        window.bind("projectDelete", [&](const std::string& request) -> std::string
        {
            // projectDelete("pasta"): um projeto fechado (o Desfazer do Restore pela lixeira)
            const auto args = ParseStringArgs(request);
            std::error_code fec;
            if (!args.empty() && !args[0].empty() && !(project.IsOpen() && std::filesystem::equivalent(project.Root(), args[0], fec)))
            {
                const std::filesystem::path folder(args[0]);
                if (!Project::IsProject(folder))
                    return Json("delete").Add("ok", false).Add("error", "This folder is not a project.").Str();
                int sessions = 0;
                for (const auto& d : std::filesystem::directory_iterator(folder / "Originals", fec))
                    sessions += d.is_directory(fec) && d.path().filename().string().rfind('.', 0) != 0 ? 1 : 0;
                std::string error;
                const std::string id = store.TrashProject(folder, folder.filename().string(), sessions, error);
                if (id.empty())
                    return Json("delete").Add("ok", false).Add("error", error).Str();
                setRecent(folder.string(), false);
                emitSessions();
                return Json("delete").Add("ok", true).Add("id", id).Add("folder", folder.string()).Add("name", folder.filename().string()).Str();
            }
            if (!project.IsOpen())
                return Json("delete").Add("ok", false).Add("error", "No project is open.").Str();
            const std::filesystem::path folder = project.Root();
            const std::string name = project.Name();
            int sessions = 0;
            for (const auto& s : store.ListSessions())
                sessions += s.inProject ? 1 : 0;
            project.Close();
            rememberProject("");
            applyProject();
            std::string error;
            const std::string id = store.TrashProject(folder, name, sessions, error);
            if (id.empty())
            {
                emitSessions();
                return Json("delete").Add("ok", false).Add("error", error).Add("folder", folder.string()).Str();
            }
            setRecent(folder.string(), false);
            Log("Project moved to the trash: " + folder.string());
            emitSessions();
            return Json("delete").Add("ok", true).Add("id", id).Add("folder", folder.string()).Add("name", name)
                .Raw("project", projectJson()).Str();
        });
        // projectClose(): fecha o Project (as sessões dele saem da lista; nada é apagado)
        window.bind("projectClose", [&](const std::string&) -> std::string
        {
            project.Close();
            rememberProject("");
            applyProject();
            return Json("project").Raw("project", projectJson()).Str();
        });
        // projectRecent(): pastas recentes com nome e se estão acessíveis
        window.bind("projectRecent", [&](const std::string&) -> std::string
        {
            std::string list = "[";
            for (const auto& folder : recentProjects())
            {
                // Só confere se a pasta existe e tem o índice (barato); o nome do projeto é o da pasta
                const bool ok = Project::IsProject(std::filesystem::path(folder));
                list += std::string(list.size() > 1 ? "," : "") + Json("recent").Add("folder", folder)
                    .Add("name", std::filesystem::path(folder).filename().string()).Add("available", ok).Str();
            }
            return Json("recent").Raw("projects", list + "]").Str();
        });
        // projectRecentSet(pastas…): substitui a lista de recentes ("Clear recent" e o seu Desfazer)
        window.bind("projectRecentSet", [&](const std::string& request) -> std::string
        {
            const auto folders = ParseStringArgs(request);
            auto settings = LoadSettings();
            std::string joined;
            for (const auto& f : folders)
                if (!f.empty())
                    joined += (joined.empty() ? "" : "|") + f;
            settings["recentProjects"] = joined;
            SaveSettings(settings);
            return Json("recent").Add("count", static_cast<int>(folders.size())).Str();
        });
        // projectInfo(): estado atual (para abrir a janela Project)
        window.bind("projectInfo", [&](const std::string& request) -> std::string
        {
            reloadProjectIfBack();  // a página chama ao voltar ao primeiro plano, ao abrir o menu e no ↻
            const auto args = ParseStringArgs(request);
            const bool withSize = !args.empty() && args[0] == "size";  // só a janela Project pede o tamanho
            return Json("project").Raw("project", projectJson(withSize)).Str();
        });
        // projectRename(nome): renomeia a pasta do Project (o nome do projeto é o da pasta)
        window.bind("projectRename", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            std::string error;
            if (args.empty())
                error = "Type a name for the project.";
            else if (!project.IsOpen())
                error = "No project is open.";
            else if (!project.Available())
                error = "The project folder is not reachable right now.";
            else
            {
                const std::string before = project.Root().string();
                if (project.Rename(args[0], error))
                {
                    // Recentes e settings.txt apontam para a pasta nova
                    auto settings = LoadSettings();
                    std::vector<std::string> recent = recentProjects();
                    recent.erase(std::remove(recent.begin(), recent.end(), before), recent.end());
                    std::string joined;
                    for (const auto& r : recent)
                        joined += (joined.empty() ? "" : "|") + r;
                    settings["recentProjects"] = joined;
                    SaveSettings(settings);
                    rememberProject(project.Root().string());
                    applyProject();
                    Log("Project renamed: " + project.Name() + " (" + project.Root().string() + ")");
                }
                else
                    Log("Project rename failed: " + error);
            }
            return Json("project").Add("error", error).Raw("project", projectJson()).Str();
        });
        // restoreSession(sessão): traz de volta da lixeira do app (Desfazer de apagar sessão/fotos)
        // Fotos que voltaram da lixeira voltam também para a coleção da sessão no Lightroom (sessão inteira: todas;
        // a coleção é criada de novo se tinha saído). Só para sessões que já foram para o Lightroom.
        auto adobeReadd = [&](const std::string& session, const std::vector<std::string>& files)
        {
            // Só fotos que voltaram (nunca "todas": uma editada que voltava não trazia nomes e a sessão inteira ia de
            // novo para o Lightroom), e só para uma sessão que está no Lightroom agora (uma sessão fechada lá não é
            // reaberta por um Restore aqui; teste do dono, 2026-11-06)
            if (files.empty())
                return;
            {
                const auto map = LoadEditing();
                const auto it = map.find(session);
                if (it == map.end() || it->second.empty())
                    return;
            }
            std::vector<std::filesystem::path> paths;
            const auto dir = store.SessionDir(session);
            for (const auto& f : files) paths.push_back(dir / f);
            Adobe::QueuePhotos("readd", session, paths);
        };
        // trashOrder(): a ordem do item mais recente da lixeira (0 = vazia), lida antes de apagar algo que se desfaz
        window.bind("trashOrder", [&](const std::string&) -> std::string
        {
            long long top = 0;
            for (const auto& item : store.ListTrash())
                top = std::max(top, item.order);
            return "\"" + std::to_string(top) + "\"";  // (como texto: é um número grande demais para a página)
        });
        window.bind("restoreSession", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            std::string error;
            std::vector<std::string> restoredFiles;
            std::error_code dirEc;
            // A sessão inteira volta (a pasta dela não existia): não volta para o Lightroom. Uma sessão apagada enquanto
            // estava no Lightroom só fica "In Lightroom" de novo por uma ação de dentro do Lightroom, como o ⌘Z dele
            // (decisão do dono, 2026-11-06)
            const bool wholeSession = !args.empty() && !std::filesystem::is_directory(store.SessionDir(args[0]), dirEc);
            // restoreSession(sessão, ordem): o Desfazer de uma ação traz só o que ela apagou, que é o primeiro item da
            // sessão depois dessa ordem (trashOrder() lido antes de apagar; decisão do dono, 2026-11-10). Sem a ordem:
            // o item mais recente da sessão.
            long long after = -1;
            if (args.size() > 1)
                try { after = std::stoll(args[1]); } catch (...) { after = -1; }
            // O item que o Desfazer vai trazer: editadas não mexem na coleção
            bool editsOnly = false;
            {
                long long best = -1;
                if (!args.empty())
                    for (const auto& item : store.ListTrash())
                        if (item.session == args[0] && !item.restored
                            && (after >= 0 ? (item.order > after && (best < 0 || item.order < best)) : item.order > best))
                        { best = item.order; editsOnly = item.editsOnly; }
            }
            const bool ok = !args.empty() && store.Restore(args[0], error, &restoredFiles, after);
            if (!ok)
                Log("Restore failed: " + error);
            // Fotos que voltaram para uma sessão que está aqui: voltam também para a coleção dela no Lightroom
            if (ok && !wholeSession && !editsOnly)
                adobeReadd(args[0], restoredFiles);
            emitSessions();
            return Json("restore").Add("ok", ok).Add("error", error).Str();
        });
        // openEditedFolder(sessão): mostra <Project>/Edited/<sessão> no Finder/Explorer (cria se não existir)
        window.bind("openEditedFolder", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty() || !project.Available() || args[0].find_first_of("/\\") != std::string::npos)
                return Json("folder").Add("ok", false).Str();
            std::error_code ec;
            const auto dir = project.Edited() / args[0];
            std::filesystem::create_directories(dir, ec);
            Platform::OpenInFileManager(dir);
            return Json("folder").Add("ok", !ec).Str();
        });
        // openSessionFolder(sessão): mostra a pasta da sessão (no app ou no Project) no Finder/Explorer
        window.bind("openSessionFolder", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (!args.empty())
            {
                const auto dir = store.SessionDir(args[0]);
                if (!dir.empty())
                    Platform::OpenInFileManager(dir);
            }
            return "null";
        });
        // exportDestination(): a pasta padrão da janela de salvar (para mostrar)
        window.bind("exportDestination", [&](const std::string&) -> std::string
        {
            return Json("exportDestination").Add("folder", defaultExportFolder().string()).Add("project", project.Available()).Str();
        });
        // chooseExportFolder(começo): outra pasta, só para este salvamento ("" = cancelou)
        window.bind("chooseExportFolder", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const std::string start = args.empty() ? std::string() : args[0];
            const std::string folder = NativeWindow::ChooseFolder("Choose where to export your bullet time sessions", start);
            return Json("exportFolder").Add("folder", folder).Str();
        });
        // lenticularPitchTest(dpi, largura pol, altura pol, "flip"|"3d", centro, passo, pasta):
        // grava a folha de teste de pitch (na pasta dada ou na padrão de salvar) e mostra no Finder
        window.bind("lenticularPitchTest", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 6)
                return Json("pitchTest").Add("ok", false).Add("error", "Missing values.").Str();
            Export::PitchTestOptions o;
            try
            {
                o.dpi = std::stoi(args[0]);
                o.widthInches = std::stod(args[1]);
                o.heightInches = std::stod(args[2]);
                o.horizontalLenses = args[3] != "3d";
                o.center = std::stod(args[4]);
                o.step = std::stod(args[5]);
                if (args.size() > 7 && !args[7].empty()) o.count = std::max(3, std::min(41, std::stoi(args[7])));
            }
            catch (...) { return Json("pitchTest").Add("ok", false).Add("error", "Check the lens, printer and size values.").Str(); }
            namespace fs = std::filesystem;
            std::error_code ec;
            const fs::path folder = args.size() > 6 && !args[6].empty() ? fs::path(args[6]) : defaultExportFolder();
            fs::create_directories(folder, ec);
            char name[160];
            const int decimals = std::fabs(o.step * 100 - std::round(o.step * 100)) > 1e-6 ? 3 : o.step < 0.0999 ? 2 : 1;
            const double half = o.step * (o.count - 1) / 2.0;
            std::snprintf(name, sizeof(name), "Pitch test %.*f-%.*f LPI %ddpi %s", decimals, o.center - half, decimals, o.center + half,
                          o.dpi, o.horizontalLenses ? "animation" : "3d");
            fs::path file = folder / (std::string(name) + ".tiff");
            for (int n = 2; fs::exists(file, ec); ++n)
                file = folder / (std::string(name) + " (" + std::to_string(n) + ").tiff");
            // Em segundo plano (a folha pode ter centenas de megapixels); avisa no fim
            previews.Post([&, o, file]
            {
                std::string error;
                const bool ok = Export::WritePitchTest(o, file, error);
                if (ok)
                {
                    Log("Pitch test saved: " + file.string());
                    Platform::RevealInFileManager(file);
                }
                listener.Emit(Json("pitchTestDone").Add("ok", ok).Add("file", file.string()).Add("error", error));
            });
            return Json("pitchTest").Add("ok", true).Add("file", file.string()).Str();
        });
        // ---- Etapa 20, pedaço 1: Edit in Lightroom Classic ----
        // Pedidos mandados ao plugin e ainda sem resposta: id -> (sessão, grupos que ficam "In Lightroom")
        std::map<std::string, std::pair<std::string, std::vector<std::string>>> adobePending;
        std::map<std::string, std::pair<std::string, std::string>> adobeSent;  // id -> (projeto, coleção) do pedido
        int adobeNextId = 0;
        auto adobeFind = [&](Adobe::Program program)
        {
            const auto settings = LoadSettings();
            const auto it = settings.find(program == Adobe::Program::Lightroom ? "lightroomPath" : "photoshopPath");
            return Adobe::Find(program, it == settings.end() ? std::string() : it->second);
        };
        auto adobeCatalogMode = [&]
        {
            const auto settings = LoadSettings();
            const auto it = settings.find("lightroomCatalog");
            // Padrão: um catálogo por projeto (decisão do dono, 2026-11-05); "open" só se a pessoa escolher
            return it != settings.end() && it->second == "open" ? std::string("open") : std::string("project");
        };
        auto adobeProgramJson = [&](const Adobe::Found& f, bool lightroom)
        {
            Json j;
            j.Add("found", f.found).Add("path", PathToUtf8(f.path)).Add("version", f.version).Add("custom", f.custom);
            if (lightroom)
                j.Add("tooOld", f.found && !f.version.empty() && Adobe::CompareVersions(f.version, Adobe::kMinimumLightroom) < 0)
                 .Add("minimum", Adobe::kMinimumLightroom);
            return j.Str();
        };
        auto adobeInfoJson = [&]
        {
            const auto lr = adobeFind(Adobe::Program::Lightroom);
            const auto ps = adobeFind(Adobe::Program::Photoshop);
            const std::string installed = Adobe::InstalledPluginVersion();
            const auto alive = Adobe::ReadAlive();
            Json plugin;
            const std::string bundled = Adobe::BundledPluginVersion(Platform::ResourcesDirectory() / "assets" / "lightroom" / "Stillpoint.lrplugin", AppVersion());
            plugin.Add("installed", !installed.empty()).Add("version", installed).Add("current", bundled)
                  .Add("upToDate", installed == bundled).Add("running", alive.fresh).Add("runningVersion", alive.version);
            return Json("adobeInfo").Raw("lightroom", adobeProgramJson(lr, true)).Raw("photoshop", adobeProgramJson(ps, false))
                .Raw("plugin", plugin.Str()).Add("catalog", adobeCatalogMode()).Add("project", project.Available()).Str();
        };
        auto emitEditing = [&] { listener.Emit(Json("adobeEditing").Raw("sessions", EditingJson(LoadEditing()))); };

        // adobeInfo(): os dois programas (achados? versão?) e o plugin (Settings › Lightroom & Photoshop)
        window.bind("adobeInfo", [&](const std::string&) -> std::string { return adobeInfoJson(); });
        // adobeLive(): as sessões "In Lightroom" cuja coleção está no catálogo aberto agora no Lightroom (com o plugin
        // respondendo). A bolinha da etiqueta só pulsa nelas (decisão do dono, 2026-11-06).
        // Etiqueta "Edited n / m": liga e desliga as editadas da sessão (prévias e Export)
        window.bind("setShowEdited", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 2 || !store.SetShowEdited(args[0], args[1] == "1"))
                return "false";
            emitSessions();
            return "true";
        });
        // Delete edits: as editadas das fotos (sessão inteira: sem arquivos) vão para a lixeira do Stillpoint, num item
        // só delas (Restore e o Desfazer trazem de volta)
        window.bind("deleteEdits", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty())
                return "0";
            const std::string session = args[0];
            std::vector<std::string> files(args.begin() + 1, args.end());
            if (files.empty())
                for (const auto& s : store.ListSessions())
                    if (s.name == session)
                        for (const auto& p : s.photos)
                            if (p.edited) files.push_back(p.file);
            // As fotos que tinham editada voltam ao original também no Lightroom (decisão do dono, 2026-11-06)
            std::vector<std::filesystem::path> originals;
            const auto dir = store.SessionDir(session);
            for (const auto& file : files)
                if (!store.EditedFiles(session, file).empty())
                    originals.push_back(dir / file);
            std::string error;
            const int removed = store.TrashEdits(session, files, error);
            if (!error.empty())
                Log("Delete edits: " + error);
            bool reset = false;
            if (removed > 0 && Adobe::QueueReset(session, originals))
            {
                reset = true;
                Log("Delete edits: " + std::to_string(originals.size()) + " photo(s) of " + session + " will be reset in Lightroom Classic");
            }
            emitSessions();
            std::string resetFiles = "[";
            for (size_t i = 0; i < originals.size(); ++i) resetFiles += (i ? "," : "") + JsonString(PathToUtf8(originals[i].filename()));
            return Json().Add("removed", removed).Add("reset", reset).Raw("files", resetFiles + "]").Str();
        });
        // ⌘Z do Delete edits: tira o pedido de voltar ao original no Lightroom, se ele ainda não foi feito; se já foi,
        // pede ao plugin para pôr de volta a edição que ele guardou antes do Reset (args: sessão, arquivos)
        window.bind("adobeCancelReset", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty())
                return "\"none\"";
            if (Adobe::CancelReset(args[0]))
                return "\"cancelled\"";
            std::vector<std::filesystem::path> paths;
            const auto dir = store.SessionDir(args[0]);
            for (size_t i = 1; i < args.size(); ++i) paths.push_back(dir / args[i]);
            return Adobe::QueuePhotos("bringback", args[0], paths) ? "\"bringback\"" : "\"none\"";
        });

        // ---- Teste com o Lightroom de verdade (tests/e2e/run_e2e.sh; decisões do dono, 2026-11-10) ----
        // Só existem com STILLPOINT_E2E=<arquivo do relatório> no ambiente (o comando do terminal): o roteiro
        // (STILLPOINT_E2E_SCRIPT) roda dentro da página e usa estas funções para escrever o relatório, mandar comandos
        // de teste ao plugin (testcmd-*.txt; o plugin só obedece num catálogo com "Self-Test" no nome) e pôr um
        // arquivo na pasta Edited como se tivesse sido salvo por fora.
        if (const char* e2eReport = std::getenv("STILLPOINT_E2E"); e2eReport && *e2eReport)
        {
            const std::filesystem::path reportFile = Utf8ToPath(e2eReport);
            window.bind("e2eInfo", [&](const std::string&) -> std::string
            {
                return Json("e2e").Add("originals", PathToUtf8(store.ProjectOriginals())).Add("edited", PathToUtf8(store.ProjectEdited()))
                    .Add("project", project.IsOpen() ? project.Name() : std::string()).Add("bridge", PathToUtf8(Adobe::BridgeFolder())).Str();
            });
            window.bind("e2eReport", [reportFile](const std::string& request) -> std::string
            {
                const auto args = ParseStringArgs(request);
                std::ofstream out(reportFile, std::ios::binary | std::ios::app);
                if (!args.empty()) out << args[0] << "\n";
                return "true";
            });
            // e2eLrSend(texto): um comando para o plugin; devolve o número dele. e2eLrResult(número): a resposta ("" = ainda não)
            window.bind("e2eLrSend", [&](const std::string& request) -> std::string
            {
                static int counter = 0;
                const auto args = ParseStringArgs(request);
                const std::string id = std::to_string(std::time(nullptr)) + "-" + std::to_string(++counter);
                std::error_code ec;
                std::filesystem::create_directories(Adobe::BridgeFolder(), ec);
                const auto file = Adobe::BridgeFolder() / ("testcmd-" + id + ".txt");
                const auto temp = Adobe::BridgeFolder() / ("testcmd-" + id + ".tmp");
                {
                    std::ofstream out(temp, std::ios::binary);
                    out << "id=" << id << "\n" << (args.empty() ? std::string() : args[0]) << "\nend=1\n";
                }
                std::filesystem::rename(temp, file, ec);
                return "\"" + id + "\"";
            });
            window.bind("e2eLrResult", [&](const std::string& request) -> std::string
            {
                const auto args = ParseStringArgs(request);
                if (args.empty()) return "\"\"";
                const auto file = Adobe::BridgeFolder() / ("testresult-" + args[0] + ".txt");
                std::ifstream in(file, std::ios::binary);
                std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
                if (text.find("\nend=1") == std::string::npos) return "\"\"";
                in.close();
                std::error_code ec;
                std::filesystem::remove(file, ec);
                return Json("e2eLr").Add("text", text).Str();
            });
            // e2eImage(sessão, arquivo original, proporção): uma "editada" salva por fora, com essa proporção; proporção 0 apaga
            window.bind("e2eImage", [&](const std::string& request) -> std::string
            {
                const auto args = ParseStringArgs(request);
                if (args.size() < 3 || store.ProjectEdited().empty()) return "false";
                const auto file = store.ProjectEdited() / args[0] / (args[1].substr(0, args[1].rfind('.')) + ".jpg");
                std::error_code ec;
                double ratio = 0;
                try { ratio = std::stod(args[2]); } catch (...) {}
                if (ratio <= 0) { std::filesystem::remove(file, ec); return "true"; }
                std::filesystem::create_directories(file.parent_path(), ec);
                return WriteTestPhoto(file, 1, 1, ratio) ? "true" : "false";
            });
        }

        // adobeOpenCatalog(sessão): abre no Lightroom Classic o catálogo onde está a coleção da sessão (o link "open the
        // catalog … to see them" do Export › Edit; pedido do dono, 2026-11-10). O Lightroom pergunta se troca (Relaunch).
        window.bind("adobeOpenCatalog", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const auto catalogs = Adobe::CollectionCatalogs();
            const auto it = args.empty() ? catalogs.end() : catalogs.find(args[0]);
            const auto lr = adobeFind(Adobe::Program::Lightroom);
            std::error_code ec;
            if (it == catalogs.end() || it->second.empty() || !lr.found)
                return Json("adobeOpenCatalog").Add("ok", false).Add("error", lr.found ? "The catalog of this session is not known." : "Lightroom Classic was not found.").Str();
            const std::filesystem::path catalog = Utf8ToPath(it->second);
            if (!std::filesystem::exists(catalog, ec))
                return Json("adobeOpenCatalog").Add("ok", false).Add("error", "The catalog is not there anymore: " + it->second).Str();
            const bool ok = Platform::OpenWithApplication(lr.path, { catalog });
            Log("Lightroom Classic: opening the catalog " + it->second);
            return Json("adobeOpenCatalog").Add("ok", ok).Add("error", ok ? "" : "Could not open Lightroom Classic.").Str();
        });

        std::set<std::string> lrSeen;  // sessões cuja coleção o Stillpoint já viu no catálogo (para notar quando ela some)
        // Cancel editing no painel do Lightroom: a hora do recado, por sessão. Enquanto o alive.txt for de antes dela, a
        // coleção que ainda aparece nele não conta como "voltou"
        std::map<std::string, long long> lrCancelledAt;
        std::string editedStamp;         // pastas de Edited/ da última olhada
        bool editedStampKnown = false;
        std::chrono::steady_clock::time_point editedChecked{};
        window.bind("adobeLive", [&](const std::string&) -> std::string
        {
            const auto alive = Adobe::ReadAlive();
            // Cancel editing no painel do Lightroom (pedido do dono, 2026-11-06): a sessão sai do "In Lightroom" aqui
            std::string cancelledList = "[", cancelledGoTo;
            {
                const auto messages = Adobe::TakeMessages("cancelled");
                if (!messages.empty())
                {
                    auto map = LoadEditing();
                    for (const auto& message : messages)
                    {
                        const std::string session = Adobe::MessageValue(message, "session");
                        if (session.empty())
                            continue;
                        long long at = 0;
                        try { at = std::stoll(Adobe::MessageValue(message, "time")); } catch (...) {}
                        lrCancelledAt[session] = at > 0 ? at : static_cast<long long>(std::time(nullptr));
                        map.erase(session);
                        lrSeen.erase(session);
                        const std::string discarded = Adobe::MessageValue(message, "discarded");
                        Log("Lightroom Classic: editing of " + session + " cancelled in the Stillpoint panel"
                            + (!discarded.empty() && discarded != "0" ? " (" + discarded + " photo(s) back to how Stillpoint has them)" : ""));
                        cancelledGoTo = session;
                        cancelledList += std::string(cancelledList.size() > 1 ? "," : "")
                            + Json().Add("session", session).Add("discarded", discarded.empty() ? 0 : std::atoi(discarded.c_str())).Str();
                    }
                    SaveEditing(map);
                    emitEditing();
                }
                for (auto it = lrCancelledAt.begin(); it != lrCancelledAt.end();)
                    if (alive.fresh && alive.time > it->second) it = lrCancelledAt.erase(it); else ++it;
            }
            std::string list = "[";
            // Sessões In Lightroom cuja coleção está noutro catálogo que não o aberto agora (o bloco do Export › Edit
            // diz qual catálogo abrir; decisão do dono, 2026-11-10)
            std::string elsewhere = "[";
            bool first = true, firstElsewhere = true;
            if (alive.fresh)
            {
                const auto catalogs = Adobe::CollectionCatalogs();
                for (const auto& [session, groups] : LoadEditing())
                {
                    if (groups.empty())
                        continue;
                    const auto it = catalogs.find(session);
                    const bool here = it == catalogs.end() || it->second.empty() || Adobe::SameCatalog(it->second, alive.catalog);
                    if (!here)
                    {
                        elsewhere += (firstElsewhere ? "" : ",") + Json().Add("session", session)
                            .Add("catalog", PathToUtf8(Utf8ToPath(it->second).stem())).Str();
                        firstElsewhere = false;
                        continue;
                    }
                    list += (first ? "" : ",") + JsonString(session);
                    first = false;
                }
            }
            // ⌘Z no Lightroom trouxe de volta a coleção de uma sessão que já tinha saído: ela volta a ficar
            // "In Lightroom" aqui também (decisão do dono, 2026-11-06)
            std::string backList = "[", restoredBackList = "[";
            {
                auto map = LoadEditing();
                std::vector<std::string> editing;
                for (const auto& [session, groups] : map)
                    if (!groups.empty()) editing.push_back(session);
                auto back = Adobe::SessionsBackInCatalog(alive, editing);
                back.erase(std::remove_if(back.begin(), back.end(), [&](const std::string& x) { return lrCancelledAt.count(x) > 0; }), back.end());
                if (!back.empty())
                {
                    auto stored = store.ListSessions();
                    for (const auto& session : back)
                    {
                        const auto st = Adobe::CollectionState(alive, session);
                        if (st.membersKnown && st.files.empty())
                            continue;  // a coleção está lá, mas sem fotos
                        auto s = std::find_if(stored.begin(), stored.end(), [&](const StoredSession& x) { return x.name == session; });
                        if (s == stored.end())
                        {
                            // A sessão foi apagada aqui enquanto estava no Lightroom, e o ⌘Z do Lightroom trouxe a coleção
                            // de volta: ela sai da lixeira e fica "In Lightroom" (decisão do dono, 2026-11-06)
                            std::string trashId;
                            for (const auto& item : store.ListTrash())
                                if (item.session == session && item.wholeSession && !item.isProject && !item.editsOnly && !item.restored && item.parent.empty())
                                    trashId = item.id;
                            std::string error;
                            if (trashId.empty() || !store.RestoreTrashItem(trashId, error))
                                continue;
                            Log("Lightroom Classic: " + session + " came back from the trash (undo in Lightroom)");
                            restoredBackList += std::string(restoredBackList.size() > 1 ? "," : "") + JsonString(session);
                            emitSessions();
                            stored = store.ListSessions();
                            s = std::find_if(stored.begin(), stored.end(), [&](const StoredSession& x) { return x.name == session; });
                            if (s == stored.end())
                                continue;
                        }
                        // Só as fotos que estão na coleção (a lista do plugin); sem lista, todas
                        for (const auto& photo : s->photos)
                        {
                            if (st.membersKnown && std::find(st.files.begin(), st.files.end(), photo.file) == st.files.end())
                                continue;
                            char group[64];
                            std::snprintf(group, sizeof(group), "%02d_", photo.order);
                            map[session][group + photo.camera] = "lr";
                        }
                        if (map[session].empty()) { map.erase(session); continue; }
                        lrSeen.insert(session);
                        backList += std::string(backList.size() > 1 ? "," : "") + JsonString(session);
                        Log("Lightroom Classic: the collection of " + session + " is back in the catalog (undo in Lightroom): In Lightroom again");
                    }
                    SaveEditing(map);
                    emitEditing();
                }
            }
            // O que mudou no Lightroom pelas mãos da pessoa (pedido do dono, 2026-11-06): foto tirada ou posta na
            // coleção muda o selo LR dela; a coleção que sumiu (⌘⇧Z, apagada no Lightroom) tira a sessão do
            // "In Lightroom". Só com o Lightroom no catálogo da sessão, sem pedido do Stillpoint esperando.
            std::string goneList = "[";
            {
                auto map = LoadEditing();
                bool changed = false;
                const auto stored = store.ListSessions();
                for (auto it = map.begin(); it != map.end();)
                {
                    const std::string session = it->first;
                    bool waiting = false;
                    for (const auto& [id, pending] : adobePending)
                        if (pending.first == session) waiting = true;
                    const auto st = Adobe::CollectionState(alive, session);
                    if (waiting || !st.inCatalog || it->second.empty()) { ++it; continue; }
                    if (st.present)
                    {
                        lrSeen.insert(session);
                        const auto s = std::find_if(stored.begin(), stored.end(), [&](const StoredSession& x) { return x.name == session; });
                        if (s != stored.end() && st.membersKnown)
                        {
                            std::set<std::string> in;
                            for (const auto& photo : s->photos)
                                if (std::find(st.files.begin(), st.files.end(), photo.file) != st.files.end())
                                {
                                    char group[64];
                                    std::snprintf(group, sizeof(group), "%02d_", photo.order);
                                    in.insert(group + photo.camera);
                                }
                            for (auto g = it->second.begin(); g != it->second.end();)
                                if (g->second == "lr" && !in.count(g->first)) { g = it->second.erase(g); changed = true; } else ++g;
                            for (const auto& g : in)
                                if (!it->second.count(g)) { it->second[g] = "lr"; changed = true; }
                        }
                        // Nenhuma foto sobrou na coleção (todas tiradas pelo Lightroom): sai do "In Lightroom"; pôr uma
                        // foto de volta (ou o ⌘Z do Lightroom) traz de volta
                        if (it->second.empty())
                        {
                            Log("Lightroom Classic: no photos of " + session + " are left in its collection: not In Lightroom anymore");
                            goneList += std::string(goneList.size() > 1 ? "," : "") + JsonString(session);
                            it = map.erase(it);
                            changed = true;
                            continue;
                        }
                        ++it;
                    }
                    else if (lrSeen.count(session) && !st.removalWaiting)
                    {
                        Log("Lightroom Classic: the collection of " + session + " is gone from the catalog: not In Lightroom anymore");
                        goneList += std::string(goneList.size() > 1 ? "," : "") + JsonString(session);
                        lrSeen.erase(session);
                        it = map.erase(it);
                        changed = true;
                    }
                    else ++it;
                }
                if (changed) { SaveEditing(map); emitEditing(); }
                // Para diagnóstico (o dono manda quando algo não sincroniza): o que o Stillpoint vê de cada sessão
                static std::string lastSync;
                std::string sync;
                for (const auto& [session, catalogPath] : Adobe::CollectionCatalogs())
                {
                    const auto st = Adobe::CollectionState(alive, session);
                    sync += session + " editing=" + (map.count(session) ? "1" : "0") + " inCatalog=" + (st.inCatalog ? "1" : "0")
                        + " present=" + (st.present ? "1" : "0") + " photos=" + std::to_string(st.files.size())
                        + " removalWaiting=" + (st.removalWaiting ? "1" : "0") + " seen=" + (lrSeen.count(session) ? "1" : "0") + "\n";
                }
                if (sync != lastSync)
                {
                    lastSync = sync;
                    std::ofstream(Adobe::BridgeFolder() / "app-sync.txt", std::ios::binary) << sync;
                }
            }
            // Recados do plugin: editadas que chegaram (Export to Stillpoint) e "Go to session in Stillpoint"
            std::string exported = "[";
            bool firstExport = true;
            const auto exports = Adobe::TakeMessages("exported");
            if (!exports.empty())
            {
                for (const auto& message : exports)
                {
                    const std::string session = Adobe::MessageValue(message, "session");
                    // Fotos cuja edição foi tirada no Lightroom e que foram exportadas assim: a editada sai do Stillpoint
                    // (vai para a lixeira, como o Delete edits; teste do dono, 2026-11-06)
                    std::vector<std::string> cleared;
                    for (auto [it, end] = message.equal_range("cleared"); it != end; ++it)
                        if (!it->second.empty()) cleared.push_back(it->second);
                    int clearedCount = 0;
                    if (!cleared.empty())
                    {
                        std::string error;
                        clearedCount = store.TrashEdits(session, cleared, error);
                        Log("Lightroom Classic: " + std::to_string(clearedCount) + " photo(s) of " + session
                            + " have no edit in Lightroom anymore: their edited files went to the trash" + (error.empty() ? "" : " (" + error + ")"));
                    }
                    std::string alignedList = "[";
                    {
                        // O recorte que a pessoa ajustou no Lightroom (mesma proporção: movido, redimensionado ou girado)
                        // vira o alinhamento da foto (decisão do dono, 2026-11-10). Fica em "alignLr" e vale enquanto a
                        // foto tiver editada.
                        const auto stem = [](const std::string& name)
                        {
                            std::string s = name.substr(0, name.rfind('.'));
                            for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
                            return s;
                        };
                        std::map<std::string, std::string> cropBy;  // nome-base -> "esq<TAB>topo<TAB>dir<TAB>base<TAB>ângulo"
                        for (auto [it, end] = message.equal_range("crop"); it != end; ++it)
                        {
                            const size_t tab = it->second.find('\t');
                            if (tab != std::string::npos && tab > 0) cropBy[stem(it->second.substr(0, tab))] = it->second.substr(tab + 1);
                        }
                        std::set<std::string> arrived;
                        for (auto [it, end] = message.equal_range("file"); it != end; ++it)
                            if (!it->second.empty())
                            {
                                arrived.insert(stem(it->second));
                                // (a editada que o Lightroom acabou de mandar troca a do Photoshop, se havia)
                                const std::string leaf = it->second.substr(it->second.find_last_of("/\\") + 1);
                                store.SetPsEdited(session, leaf.substr(0, leaf.rfind('.')), false);
                                store.PsClear(session, leaf);
                            }
                        const auto before = store.ListSessions();
                        const auto cur = std::find_if(before.begin(), before.end(), [&](const StoredSession& x) { return x.name == session; });
                        if (cur != before.end() && (!cropBy.empty() || !arrived.empty()))
                        {
                            std::map<std::string, std::string> items;
                            {
                                std::stringstream parts(store.AlignLr(session));
                                for (std::string item; std::getline(parts, item, ';');)
                                {
                                    const size_t colon = item.rfind(':');
                                    if (colon != std::string::npos && colon > 0) items[item.substr(0, colon)] = item.substr(colon + 1);
                                }
                            }
                            const std::string was = store.AlignLr(session);
                            // (a foto que chega sem linha de recorte está como o Stillpoint mandou, e o que ele mandou já
                            // contava com o alinhamento vindo do Lightroom: ele fica. O que não vale mais sai no próximo
                            // Edit in Lightroom Classic)
                            if (!cropBy.empty())
                            {
                                // O canvas da sessão, como no Edit in Lightroom Classic e na exportação
                                const auto dir = store.SessionDir(session);
                                std::string ratio = "asshot";
                                double posX = 0.5, posY = 0.5;
                                {
                                    std::stringstream parts(cur->crop);
                                    std::string a, b, c;
                                    std::getline(parts, a, '|'); std::getline(parts, b, '|'); std::getline(parts, c, '|');
                                    if (!a.empty()) ratio = a;
                                    try { if (!b.empty()) posX = std::stod(b); if (!c.empty()) posY = std::stod(c); } catch (...) {}
                                }
                                Export::Framing framing;
                                framing.ratio = Export::RatioValue(ratio) > 0 ? ratio : std::string();
                                framing.posX = posX; framing.posY = posY;
                                std::map<std::string, std::string> perGroup;
                                for (const auto& photo : cur->photos)
                                {
                                    if (!photo.previewable) continue;
                                    const std::string group = PhotoGroup(photo);
                                    if (!perGroup.count(group) || IsJpegPhoto(photo.file)) perGroup[group] = photo.file;
                                }
                                const auto aligns = Export::ParseAlign(cur->align);
                                std::vector<std::pair<int, int>> sizes;
                                std::vector<std::string> files;
                                bool allSizes = !perGroup.empty();
                                for (const auto& [group, file] : perGroup)
                                {
                                    auto it = aligns.find(file);
                                    framing.align.push_back(it == aligns.end() ? Export::Align() : it->second);
                                    int w = 0, h = 0;
                                    if (!Export::PhotoSize(dir / file, w, h)) { w = 0; h = 0; allSizes = false; }
                                    sizes.push_back({ w, h });
                                    files.push_back(file);
                                }
                                if (allSizes && Export::ComputeCommonFrame(framing, sizes))
                                {
                                    bool firstAligned = true;
                                    for (size_t k = 0; k < files.size(); ++k)
                                    {
                                        const auto at = cropBy.find(stem(files[k]));
                                        if (at == cropBy.end()) continue;
                                        double v[5] = { 0, 0, 1, 1, 0 };
                                        {
                                            std::stringstream nums(at->second);
                                            size_t i = 0;
                                            for (std::string n; i < 5 && std::getline(nums, n, '\t'); ++i)
                                                try { v[i] = std::stod(n); } catch (...) {}
                                        }
                                        Export::Align a;
                                        if (!Export::AlignFromCrop(framing, sizes[k].first, sizes[k].second, v[0], v[1], v[2], v[3], v[4], a,
                                                framing.align[k].flipH, framing.align[k].flipV)) continue;
                                        char text[160];
                                        if (std::abs(a.dx) < 0.005) a.dx = 0;  // (sem "-0.00")
                                        if (std::abs(a.dy) < 0.005) a.dy = 0;
                                        if (std::abs(a.rot) < 0.0005) a.rot = 0;
                                        std::snprintf(text, sizeof(text), "%.2f,%.2f,%.5f,%.3f,%.5f", a.dx, a.dy, a.scale, a.rot,
                                            framing.align[k].base > 0 ? framing.align[k].base : 1.0);
                                        // (a foto espelhada no Stillpoint continua espelhada: o Lightroom a recebeu sem espelhar)
                                        items[files[k]] = std::string(text) + (a.Flipped() ? "," + std::to_string((a.flipH ? 1 : 0) + (a.flipV ? 2 : 0)) : std::string());
                                        const auto ph = std::find_if(cur->photos.begin(), cur->photos.end(), [&](const StoredPhoto& p) { return p.file == files[k]; });
                                        alignedList += (firstAligned ? "" : ",") + std::to_string(ph != cur->photos.end() ? ph->order : static_cast<int>(k) + 1);
                                        firstAligned = false;
                                    }
                                }
                            }
                            std::string text;
                            for (const auto& [file, values] : items) text += (text.empty() ? "" : ";") + file + ":" + values;
                            if (text != was)
                            {
                                store.SetAlignLr(session, text);
                                Log("Lightroom Classic: the crop adjusted there is now the alignment of " + session);
                            }
                        }
                    }
                    alignedList += "]";
                    const auto sessions = store.ListSessions();
                    int count = 0, failed = 0;
                    try { count = std::stoi(Adobe::MessageValue(message, "count")); } catch (...) {}
                    try { failed = std::stoi(Adobe::MessageValue(message, "failed")); } catch (...) {}
                    const auto s = std::find_if(sessions.begin(), sessions.end(), [&](const StoredSession& x) { return x.name == session; });
                    const int edited = s != sessions.end() ? s->edited : 0;
                    const int total = s != sessions.end() ? static_cast<int>(s->photos.size()) : 0;
                    Log("Lightroom Classic: " + std::to_string(count) + " edited photo" + (count == 1 ? "" : "s") + " of " + session
                        + " arrived in the project's Edited folder (Edited " + std::to_string(edited) + " / " + std::to_string(total) + ")"
                        + (failed > 0 ? "; " + std::to_string(failed) + " could not be exported" : ""));
                    // Todas as fotos da sessão com editada: sai do "In Lightroom" e a coleção sai do Lightroom, como no
                    // Done editing (decisão do dono, 2026-11-06)
                    bool finished = false;
                    // O plugin olhou a sessão inteira e nada falhou (as fotos sem edição no Lightroom não vêm), ou
                    // todas as fotos já têm editada
                    const bool complete = Adobe::MessageValue(message, "complete") == "1" && failed == 0 && count > 0;
                    if (total > 0 && (edited >= total || complete))
                    {
                        auto map = LoadEditing();
                        if (map.erase(session))
                        {
                            SaveEditing(map);
                            finished = true;
                            if (Adobe::QueueRemoveCollection(session, s->inProject && project.IsOpen() ? project.Name() : std::string(), "", ""))
                                Log("All photos of " + session + " are edited: the Lightroom Classic collection will be removed");
                        }
                    }
                    exported += (firstExport ? "" : ",") + Json().Add("finished", finished).Add("session", session).Add("count", count).Add("failed", failed).Add("cleared", clearedCount)
                        .Add("edited", edited).Add("total", total).Add("found", s != sessions.end()).Raw("aligned", alignedList).Str();
                    firstExport = false;
                }
                emitSessions();
                emitEditing();
            }
            // Editadas que apareceram (ou saíram) na pasta Edited por fora do plugin: a lista de sessões se atualiza. E
            // as que chegaram com outra proporção não são usadas: avisa aqui (uma vez por arquivo) e manda o recado ao
            // Lightroom (decisão do dono, 2026-11-10)
            std::string refusedList = "[";
            std::string psSavedList = "[";
            std::string editedTouched = "[";
            if (project.IsOpen() && std::chrono::steady_clock::now() - editedChecked >= std::chrono::seconds(2))
            {
                editedChecked = std::chrono::steady_clock::now();
                const std::string stamp = store.EditedStamp();
                const bool changed = stamp != editedStamp;
                // Edit in Photoshop: a cópia de trabalho que mudou foi salva (a foto passa a editada); a que sumiu deixa
                // de estar anotada
                if (changed || !editedStampKnown)
                    for (const auto& s : store.ListSessions())
                    {
                        if (!s.inProject) continue;
                        for (const auto& [name, entry] : store.PsPending(s.name))
                        {
                            if (entry.unchanged) continue;
                            std::error_code ec;
                            const bool there = std::filesystem::exists(store.ProjectEdited() / s.name / name, ec);
                            store.PsClear(s.name, name);
                            if (!there) continue;
                            store.SetPsEdited(s.name, name.substr(0, name.rfind('.')), true);
                            std::string number;
                            for (const auto& p : s.photos)
                                if (p.file.substr(0, p.file.rfind('.')) == name.substr(0, name.rfind('.')))
                                {
                                    char text[16];
                                    std::snprintf(text, sizeof(text), "%02d", p.order);
                                    number = text;
                                }
                            Log("Edit in Photoshop: photo " + number + " of " + s.name + " saved (" + name + ")");
                            // A foto que estava no Lightroom sai de lá: a versão do Photoshop é a que fica (caminho A)
                            {
                                auto map = LoadEditing();
                                const auto in = map.find(s.name);
                                if (in != map.end())
                                {
                                    std::vector<std::filesystem::path> paths;
                                    const auto dir = store.SessionDir(s.name);
                                    for (const auto& [group, file] : PhotosForEditing(s))
                                    {
                                        const bool same = std::any_of(s.photos.begin(), s.photos.end(), [&](const StoredPhoto& p)
                                            { return PhotoGroup(p) == group && p.file.substr(0, p.file.rfind('.')) == name.substr(0, name.rfind('.')); });
                                        if (!same || !in->second.count(group)) continue;
                                        in->second.erase(group);
                                        paths.push_back(dir / file);
                                    }
                                    if (!paths.empty())
                                    {
                                        if (in->second.empty()) map.erase(in);
                                        SaveEditing(map);
                                        if (Adobe::QueuePhotos("remove", s.name, paths))
                                            Log("Edit in Photoshop: photo " + number + " of " + s.name + " leaves the Lightroom Classic collection");
                                        emitEditing();
                                    }
                                }
                            }
                            psSavedList += std::string(psSavedList.size() > 1 ? "," : "") + Json().Add("session", s.name).Add("number", number).Str();
                        }
                    }
                // As sessões cuja pasta de editadas mudou: a página esquece as prévias delas (um ⌘S no Photoshop troca a
                // editada no mesmo arquivo)
                if (changed && editedStampKnown)
                {
                    const auto bySession = [](const std::string& text)
                    {
                        std::map<std::string, std::string> out;
                        std::stringstream parts(text);
                        for (std::string item; std::getline(parts, item, ';');)
                        {
                            const size_t colon = item.find(':');
                            if (colon != std::string::npos) out[item.substr(0, colon)] = item.substr(colon + 1);
                        }
                        return out;
                    };
                    const auto was = bySession(editedStamp), now = bySession(stamp);
                    for (const auto& [session, value] : now)
                    {
                        const auto it = was.find(session);
                        if (it == was.end() || it->second != value)
                            editedTouched += std::string(editedTouched.size() > 1 ? "," : "") + JsonString(session);
                    }
                }
                if (changed && editedStampKnown && exports.empty())
                    emitSessions();
                if (changed || !editedStampKnown)
                {
                    editedStamp = stamp;
                    editedStampKnown = true;
                    const fs::path seenFile = Adobe::BridgeFolder() / "refused-seen.txt";
                    std::set<std::string> seen, now;
                    {
                        std::ifstream in(seenFile);
                        for (std::string line; std::getline(in, line);)
                            if (!line.empty()) seen.insert(line);
                    }
                    bool firstRefused = true;
                    std::set<std::string> listed;  // as sessões do projeto aberto agora
                    for (const auto& s : store.ListSessions())
                    {
                        if (!s.inProject) continue;
                        listed.insert(s.name);
                        std::vector<std::filesystem::path> fresh;
                        std::string numbers, have, want;
                        for (const auto& p : s.photos)
                        {
                            if (p.refused.empty()) continue;
                            const std::string key = s.name + "|" + p.file + "|" + p.refused;
                            now.insert(key);
                            if (seen.count(key)) continue;
                            fresh.push_back(store.SessionDir(s.name) / p.file);
                            char number[16];
                            std::snprintf(number, sizeof(number), "%02d", p.order);
                            numbers += (numbers.empty() ? "" : ", ") + std::string(number);
                            have = p.refused; want = p.refusedWant;
                        }
                        if (fresh.empty()) continue;
                        Log("Edited file not used: photo " + numbers + " of " + s.name + " is " + have + " and the session is " + want);
                        Adobe::QueueNotice(s.name, s.label.empty() ? s.name : s.label, fresh, numbers, have, want);
                        refusedList += (firstRefused ? "" : ",") + Json().Add("session", s.name).Add("numbers", numbers)
                            .Add("count", static_cast<int>(fresh.size())).Add("have", have).Add("want", want).Str();
                        firstRefused = false;
                    }
                    // Os avisos já dados de sessões de outros projetos ficam guardados: com outro projeto aberto (ou o de
                    // teste) elas não estão na lista, e sem isso o recado voltava a aparecer ao reabrir o projeto delas
                    // (teste do dono, 2026-11-10)
                    for (const auto& key : seen)
                        if (!listed.count(key.substr(0, key.find('|')))) now.insert(key);
                    if (now != seen)
                    {
                        std::ofstream out(seenFile, std::ios::binary | std::ios::trunc);
                        for (const auto& key : now) out << key << "\n";
                    }
                }
            }
            refusedList += "]";
            std::string goTo;
            // Editadas que chegaram do Lightroom: o Stillpoint vem para a frente com a sessão aberta (pedido do dono, 2026-11-06)
            if (!exports.empty())
            {
                const std::string last = Adobe::MessageValue(exports.back(), "session");
                const auto sessions = store.ListSessions();
                if (std::any_of(sessions.begin(), sessions.end(), [&](const StoredSession& x) { return x.name == last; }))
                    goTo = last;
            }
            // Cancel editing no painel do Lightroom: o Stillpoint também vem para a frente com a sessão (pedido do
            // dono, 2026-11-06)
            if (goTo.empty() && !cancelledGoTo.empty())
            {
                const auto sessions = store.ListSessions();
                if (std::any_of(sessions.begin(), sessions.end(), [&](const StoredSession& x) { return x.name == cancelledGoTo; }))
                    goTo = cancelledGoTo;
            }
            for (const auto& message : Adobe::TakeMessages("goto"))
            {
                // Pedido velho (o Stillpoint estava fechado quando a pessoa pediu): não abre a sessão do nada
                long long at = 0;
                try { at = std::stoll(Adobe::MessageValue(message, "time")); } catch (...) {}
                if (at > 0 && static_cast<long long>(std::time(nullptr)) - at <= 20)
                    goTo = Adobe::MessageValue(message, "session");
            }
            if (!goTo.empty())
                if (auto native = window.window(); native.ok())
                    NativeWindow::Show(native.value());
            return Json("adobeLive").Add("running", alive.fresh).Raw("sessions", list + "]").Raw("elsewhere", elsewhere + "]").Raw("exported", exported + "]").Raw("refused", refusedList).Raw("psSaved", psSavedList + "]").Raw("editedTouched", editedTouched + "]").Add("goto", goTo).Raw("back", backList + "]").Raw("gone", goneList + "]")
                .Raw("restoredBack", restoredBackList + "]").Raw("cancelled", cancelledList + "]").Str();
        });
        // adobeEditing(): as fotos que estão no Lightroom/Photoshop, por sessão
        window.bind("adobeEditing", [&](const std::string&) -> std::string
        {
            return Json("adobeEditing").Raw("sessions", EditingJson(LoadEditing())).Str();
        });
        // adobeLocate("lightroom" | "photoshop"): a pessoa escolhe o programa (Locate…)
        window.bind("adobeLocate", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const bool lightroom = args.empty() || args[0] != "photoshop";
            const auto program = lightroom ? Adobe::Program::Lightroom : Adobe::Program::Photoshop;
#ifdef _WIN32
            const std::string start = std::getenv("ProgramFiles") ? std::string(std::getenv("ProgramFiles")) + "\\Adobe" : std::string();
#else
            const std::string start = "/Applications";
#endif
            const std::string chosen = NativeWindow::ChooseApplication(
                lightroom ? "Choose Adobe Lightroom Classic" : "Choose Adobe Photoshop", start);
            if (chosen.empty())
                return Json("adobeLocate").Add("ok", false).Add("cancelled", true).Raw("info", adobeInfoJson()).Str();
            if (!Adobe::LooksLike(program, std::filesystem::path(std::u8string(chosen.begin(), chosen.end()))))
                return Json("adobeLocate").Add("ok", false)
                    .Add("error", std::string("That is not ") + (lightroom ? "Lightroom Classic." : "Photoshop.")).Raw("info", adobeInfoJson()).Str();
            auto settings = LoadSettings();
            settings[lightroom ? "lightroomPath" : "photoshopPath"] = chosen;
            SaveSettings(settings);
            Log(std::string(lightroom ? "Lightroom Classic" : "Photoshop") + " located: " + chosen);
            return Json("adobeLocate").Add("ok", true).Raw("info", adobeInfoJson()).Str();
        });
        // adobeForget("lightroom" | "photoshop"): volta a procurar no lugar de sempre
        window.bind("adobeForget", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            auto settings = LoadSettings();
            settings.erase(!args.empty() && args[0] == "photoshop" ? "photoshopPath" : "lightroomPath");
            SaveSettings(settings);
            return adobeInfoJson();
        });
        // adobeInstallPlugin(): instala (ou reinstala) o plugin na pasta de plugins do Lightroom Classic
        window.bind("adobeInstallPlugin", [&](const std::string&) -> std::string
        {
            std::string error;
            const auto source = Platform::ResourcesDirectory() / "assets" / "lightroom" / "Stillpoint.lrplugin";
            const bool ok = Adobe::InstallPlugin(source, Adobe::BundledPluginVersion(source, AppVersion()), error);
            Log(ok ? "Lightroom plugin installed in " + PathToUtf8(Adobe::InstalledPlugin()) : "Lightroom plugin install failed: " + error);
            return Json("adobeInstall").Add("ok", ok).Add("error", error).Add("folder", PathToUtf8(Adobe::InstalledPlugin()))
                .Raw("info", adobeInfoJson()).Str();
        });
        // adobeSetCatalog("open" | "project")
        window.bind("adobeSetCatalog", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            auto settings = LoadSettings();
            settings["lightroomCatalog"] = !args.empty() && args[0] == "project" ? "project" : "open";
            SaveSettings(settings);
            return adobeInfoJson();
        });
        // adobeGetApp("lightroom" | "photoshop"): a página da Adobe para baixar o programa
        window.bind("adobeGetApp", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            Platform::OpenUrl(!args.empty() && args[0] == "photoshop" ? "https://www.adobe.com/products/photoshop.html"
                                                                       : "https://www.adobe.com/products/photoshop-lightroom-classic.html");
            return "null";
        });
        // Catálogo do projeto (Settings › Catalog: One catalog per project): <Projeto>/Lightroom/<nome>.lrcat
        auto projectCatalog = [&]() -> std::filesystem::path
        {
            if (!project.Available())
                return {};
            // O "File › New Catalog…" do Lightroom cria uma pasta com o nome do catálogo e o .lrcat dentro dela
            // (<Projeto>/Lightroom/<nome>/<nome>.lrcat, teste de 2026-11-05). Aceita também o .lrcat direto na pasta
            // e, se o nome for outro, o primeiro .lrcat que achar até dois níveis abaixo.
            const auto folder = project.Root() / "Lightroom";
            const auto direct = folder / (project.Name() + ".lrcat");
            const auto nested = folder / project.Name() / (project.Name() + ".lrcat");
            std::error_code ec;
            if (std::filesystem::exists(nested, ec)) return nested;
            if (std::filesystem::exists(direct, ec)) return direct;
            std::vector<std::filesystem::path> found;
            for (std::filesystem::recursive_directory_iterator it(folder, ec), end; !ec && it != end; it.increment(ec))
            {
                if (it.depth() > 1) { it.disable_recursion_pending(); continue; }
                if (it->path().extension() == ".lrcat" && it->is_regular_file(ec))
                    found.push_back(it->path());
            }
            std::sort(found.begin(), found.end());
            return found.empty() ? direct : found.front();
        };
        // Pasta "Stillpoint Template" da Mesa, que vai para o Lixo quando o Lightroom já tiver saído dela
        std::filesystem::path adobeTrashLater;
        // adobeTemplateWatch(): procura o catálogo vazio na Mesa (a janela dos slides pergunta a cada segundo).
        // Achou: guarda uma cópia, cria o catálogo do projeto aberto e marca a pasta da Mesa para o Lixo.
        window.bind("adobeTemplateWatch", [&](const std::string&) -> std::string
        {
            const std::string desktop = NativeWindow::DesktopFolder();
            if (desktop.empty())
                return Json("adobeTemplate").Add("found", false).Str();
            const auto file = Adobe::DesktopTemplate(std::filesystem::path(std::u8string(desktop.begin(), desktop.end())));
            if (file.empty())
                return Json("adobeTemplate").Add("found", false).Str();
            const auto lr = adobeFind(Adobe::Program::Lightroom);
            std::string error;
            if (!Adobe::SaveTemplate(file, lr.version, error))
            {
                Log("Lightroom empty catalog: " + error);
                return Json("adobeTemplate").Add("found", false).Add("error", error).Str();
            }
            Log("Lightroom empty catalog kept (Lightroom Classic " + lr.version + ")");
            bool made = false;
            if (project.Available())
            {
                const auto target = project.Root() / "Lightroom" / project.Name() / (project.Name() + ".lrcat");
                made = Adobe::MakeCatalogFromTemplate(target, error);
                Log(made ? "Lightroom catalog for " + project.Name() + " made from the empty catalog: " + PathToUtf8(target)
                         : "Lightroom catalog for " + project.Name() + ": " + error);
            }
            adobeTrashLater = file.parent_path();
            return Json("adobeTemplate").Add("found", true).Add("made", made).Str();
        });
        // adobeShowCatalogFolder(): cria <Projeto>/Lightroom e mostra no Finder/Explorer
        window.bind("adobeShowCatalogFolder", [&](const std::string&) -> std::string
        {
            const auto catalog = projectCatalog();
            if (!catalog.empty())
            {
                std::error_code ec;
                std::filesystem::create_directories(catalog.parent_path(), ec);
                Platform::OpenInFileManager(catalog.parent_path());
            }
            return "null";
        });
        // adobeEditInLightroom(sessão, título, grupo da foto ativa, "session" | "photo"): manda a sessão para o
        // Lightroom Classic. Devolve problem = missing | old | install | catalog quando não dá; senão o id do
        // pedido (a página pergunta por adobeStatus até o plugin responder).
        window.bind("adobeEditInLightroom", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 4)
                return Json("adobeEdit").Add("ok", false).Add("problem", "error").Add("error", "Missing values.").Str();
            const auto lr = adobeFind(Adobe::Program::Lightroom);
            if (!lr.found)
                return Json("adobeEdit").Add("ok", false).Add("problem", "missing").Str();
            if (!lr.version.empty() && Adobe::CompareVersions(lr.version, Adobe::kMinimumLightroom) < 0)
                return Json("adobeEdit").Add("ok", false).Add("problem", "old").Add("version", lr.version).Add("minimum", Adobe::kMinimumLightroom).Str();
            const auto sessions = store.ListSessions();
            const auto session = std::find_if(sessions.begin(), sessions.end(), [&](const StoredSession& x) { return x.name == args[0]; });
            const auto dir = store.SessionDir(args[0]);
            if (session == sessions.end() || dir.empty())
                return Json("adobeEdit").Add("ok", false).Add("problem", "error").Add("error", "The session is no longer there.").Str();
            // Plugin: instala na primeira vez e quando o app muda de versão
            bool justInstalled = false;
            const auto pluginSource = Platform::ResourcesDirectory() / "assets" / "lightroom" / "Stillpoint.lrplugin";
            const std::string bundledPlugin = Adobe::BundledPluginVersion(pluginSource, AppVersion());
            const std::string installedPlugin = Adobe::InstalledPluginVersion();
            // Plugin antigo com o Lightroom aberto: não troca agora (o Lightroom só lê o plugin novo ao abrir, e
            // trocar os arquivos com ele aberto atrapalhava); troca na próxima vez com o Lightroom fechado
            const bool lrOpenNow = Adobe::ReadAlive().fresh || Platform::ApplicationRunning(lr.path);
            if (!installedPlugin.empty() && installedPlugin != bundledPlugin && lrOpenNow)
                Log("Lightroom plugin " + installedPlugin + " is older than " + bundledPlugin + ": it updates the next time Lightroom Classic is closed");
            else if (installedPlugin != bundledPlugin)
            {
                std::string error;
                if (!Adobe::InstallPlugin(pluginSource, bundledPlugin, error))
                {
                    Log("Lightroom plugin install failed: " + error);
                    return Json("adobeEdit").Add("ok", false).Add("problem", "install").Add("error", error).Str();
                }
                Log("Lightroom plugin installed in " + PathToUtf8(Adobe::InstalledPlugin()));
                justInstalled = true;
            }
            // Catálogo: o aberto, ou o do projeto (só para sessões do projeto)
            std::filesystem::path catalog;
            if (adobeCatalogMode() == "project" && session->inProject)
            {
                catalog = projectCatalog();
                std::error_code ec;
                if (catalog.empty() || !std::filesystem::exists(catalog, ec))
                {
                    // Sem catálogo no projeto: copia o catálogo vazio guardado; sem ele (ou de outra versão do
                    // Lightroom), a página abre a janela com os slides para a pessoa criar um
                    const auto tpl = Adobe::Template();
                    const auto target = project.Root() / "Lightroom" / project.Name() / (project.Name() + ".lrcat");
                    std::string error;
                    if (!tpl.has || Adobe::TemplateOutdated(tpl, lr.version) || !Adobe::MakeCatalogFromTemplate(target, error))
                    {
                        if (!error.empty())
                            Log("Lightroom catalog for " + project.Name() + ": " + error);
                        return Json("adobeEdit").Add("ok", false).Add("problem", "catalog")
                            .Add("template", tpl.has ? (Adobe::TemplateOutdated(tpl, lr.version) ? "outdated" : "error") : "missing")
                            .Add("templateVersion", tpl.version).Add("lrVersion", lr.version)
                            .Add("folder", PathToUtf8(target.parent_path())).Add("name", project.Name()).Str();
                    }
                    Log("Lightroom catalog for " + project.Name() + " made from the empty catalog: " + PathToUtf8(target));
                    catalog = target;
                }
            }
            Adobe::Request r;
            r.id = std::to_string(std::time(nullptr)) + "-" + std::to_string(++adobeNextId);
            r.project = session->inProject && project.IsOpen() ? project.Name() : std::string();
            r.title = args[1];
            r.catalog = catalog.empty() ? std::string() : PathToUtf8(catalog);
            // "session": todas as fotos; senão só as escolhidas (args[4...], ou a foto ativa): decisão do dono em
            // 2026-11-05, "Just this photo" manda só aquela foto (antes ia a sessão inteira para a coleção)
            std::vector<std::string> chosen(args.begin() + 4, args.end());
            if (chosen.empty())
                chosen.push_back(args[2]);
            std::vector<std::string> marked;
            // A foto com acabamento do Photoshop fica fora (decisão do dono, 2026-11-12, caminho A): o Lightroom
            // trabalharia na original e o Export to Stillpoint trocaria a editada do Photoshop. Para ir de novo, Revert
            // to original… nela.
            std::set<std::string> keptOut;
            for (const auto& photo : session->photos)
                if (photo.psEdited && photo.edited)
                    keptOut.insert(PhotoGroup(photo));
            std::string keptNumber;
            for (const auto& [group, file] : PhotosForEditing(*session))
            {
                const auto path = dir / file;
                const bool take = args[3] == "session" || std::find(chosen.begin(), chosen.end(), group) != chosen.end();
                if (!take)
                    continue;
                if (keptOut.count(group))
                {
                    if (keptNumber.empty()) keptNumber = group.substr(0, 2);
                    continue;
                }
                r.photos.push_back(path);
                r.select.push_back(path);
                marked.push_back(group);
                if (group == args[2])
                    r.focus = path;
            }
            if (r.photos.empty() && !keptNumber.empty())
                return Json("adobeEdit").Add("ok", false).Add("problem", "ps").Add("number", keptNumber).Str();
            if (r.photos.empty())
                return Json("adobeEdit").Add("ok", false).Add("problem", "error").Add("error", "The session has no photos.").Str();
            if (r.focus.empty())
                r.focus = r.photos.front();
            if (marked.empty())
                marked.push_back(PhotosForEditing(*session).front().first);
            // O recorte do Export vai junto (opção A, decisão do dono, 2026-11-06): o mesmo retângulo que o Export
            // corta de cada foto (Export::ApplyFraming), em frações da foto
            {
                std::string ratio = "asshot";
                double posX = 0.5, posY = 0.5;
                {
                    std::stringstream parts(session->crop);
                    std::string a, b, c;
                    std::getline(parts, a, '|'); std::getline(parts, b, '|'); std::getline(parts, c, '|');
                    if (!a.empty()) ratio = a;
                    try { if (!b.empty()) posX = std::stod(b); if (!c.empty()) posY = std::stod(c); } catch (...) {}
                }
                r.framing = ratio.substr(0, ratio.find('/'));  // (sem a orientação; com o canvas calculado vira o nome que a pessoa vê)
                {
                    // O alinhamento que veio do Lightroom só vale para a foto que está com editada. A foto que vai agora
                    // sem editada (Revert to original) vai com o alinhamento da sessão: o que ela tinha do Lightroom sai
                    std::map<std::string, std::string> items;
                    const std::string was = store.AlignLr(args[0]);
                    std::stringstream parts(was);
                    for (std::string item; std::getline(parts, item, ';');)
                    {
                        const size_t colon = item.rfind(':');
                        if (colon == std::string::npos || colon == 0) continue;
                        const std::string file = item.substr(0, colon);
                        const std::string base = file.substr(0, file.rfind('.'));
                        const bool edited = std::any_of(session->photos.begin(), session->photos.end(),
                            [&](const StoredPhoto& p) { return p.edited && p.file.substr(0, p.file.rfind('.')) == base; });
                        if (edited) items[file] = item.substr(colon + 1);
                    }
                    std::string text;
                    for (const auto& [file, values] : items) text += (text.empty() ? "" : ";") + file + ":" + values;
                    if (text != was) store.SetAlignLr(args[0], text);
                }
                const double target = Export::RatioValue(ratio);
                // O mesmo canvas da exportação (proporção, posição e o alinhamento de cada foto): cada foto vai com o
                // retângulo (e o giro) que o Export tiraria dela (decisão do dono, 2026-11-10: o alinhamento vai junto)
                bool byCanvas = false;
                {
                    Export::Framing framing;
                    framing.ratio = target > 0 ? ratio : std::string();
                    framing.posX = posX; framing.posY = posY;
                    // Uma foto por câmera, como na exportação (RAW + JPEG: o JPEG; é dele o alinhamento guardado)
                    std::map<std::string, std::string> perGroup;
                    for (const auto& photo : session->photos)
                    {
                        if (!photo.previewable) continue;
                        const std::string group = PhotoGroup(photo);
                        if (!perGroup.count(group) || IsJpegPhoto(photo.file)) perGroup[group] = photo.file;
                    }
                    const auto aligns = Export::ParseAlign(session->align);
                    std::vector<std::pair<int, int>> sizes;
                    std::vector<std::string> groups;
                    bool allSizes = !perGroup.empty();
                    for (const auto& [group, file] : perGroup)
                    {
                        auto it = aligns.find(file);
                        framing.align.push_back(it == aligns.end() ? Export::Align() : it->second);
                        int w = 0, h = 0;
                        if (!Export::PhotoSize(dir / file, w, h)) { w = 0; h = 0; allSizes = false; }
                        sizes.push_back({ w, h });
                        groups.push_back(group);
                    }
                    bool sameShape = allSizes && !sizes.empty() && sizes[0].second > 0;
                    for (const auto& sz : sizes)
                        if (!sameShape || sz.second <= 0 ||
                            std::abs(static_cast<double>(sz.first) / sz.second - static_cast<double>(sizes[0].first) / sizes[0].second) > 0.02)
                            sameShape = false;
                    const bool wanted = target > 0 || (sameShape && framing.Aligned());
                    if (wanted && allSizes && Export::ComputeCommonFrame(framing, sizes))
                    {
                        byCanvas = true;
                        // (o nome que a pessoa vê: "2:3" quando o recorte é em pé)
                        r.framing = target > 0 ? Export::RatioLabel(ratio, framing.commonW, framing.commonH) : std::string("aligned");
                        {
                            // O canvas com que a sessão vai: a conferência das editadas que chegarem usa a forma dele
                            char canvas[96];
                            std::snprintf(canvas, sizeof(canvas), "%.3f,%.3f|", framing.commonW, framing.commonH);
                            store.SetLrCanvas(args[0], canvas + ratio);
                        }
                        for (const auto& [group, file] : PhotosForEditing(*session))
                        {
                            const auto path = dir / file;
                            if (std::find(r.photos.begin(), r.photos.end(), path) == r.photos.end()) continue;
                            const auto at = std::find(groups.begin(), groups.end(), group);
                            if (at == groups.end()) continue;
                            const size_t k = static_cast<size_t>(at - groups.begin());
                            Export::CropBox box;
                            if (!Export::CanvasCrop(framing, k, sizes[k].first, sizes[k].second, box)) continue;
                            Adobe::Request::Crop crop;
                            crop.photo = path;
                            crop.left = box.left; crop.top = box.top; crop.right = box.right; crop.bottom = box.bottom;
                            crop.angle = box.angle; crop.width = sizes[k].first; crop.height = sizes[k].second;
                            r.crops.push_back(crop);
                        }
                    }
                }
                if (!byCanvas)
                    store.SetLrCanvas(args[0], "");
                if (target > 0 && !byCanvas)
                    for (const auto& path : r.photos)
                    {
                        int w = 0, h = 0;
                        if (!Export::PhotoSize(path, w, h) || w <= 0 || h <= 0)
                            continue;
                        const double want = Export::RatioTarget(ratio, w, h);
                        const double have = static_cast<double>(w) / h;
                        Adobe::Request::Crop crop;
                        crop.photo = path;
                        crop.width = w; crop.height = h;
                        if (std::abs(have - want) >= 0.005)
                        {
                            int nw = w, nh = h;
                            if (have > want) nw = std::max(1, static_cast<int>(std::lround(h * want)));
                            else nh = std::max(1, static_cast<int>(std::lround(w / want)));
                            const int x0 = std::clamp(static_cast<int>(std::lround((w - nw) * std::clamp(posX, 0.0, 1.0))), 0, w - nw);
                            const int y0 = std::clamp(static_cast<int>(std::lround((h - nh) * std::clamp(posY, 0.0, 1.0))), 0, h - nh);
                            crop.left = static_cast<double>(x0) / w;
                            crop.top = static_cast<double>(y0) / h;
                            crop.right = static_cast<double>(x0 + nw) / w;
                            crop.bottom = static_cast<double>(y0 + nh) / h;
                        }
                        r.crops.push_back(crop);
                    }
            }
            std::string error;
            if (!Adobe::WriteRequest(r, error))
                return Json("adobeEdit").Add("ok", false).Add("problem", "error").Add("error", error).Str();
            adobePending[r.id] = { args[0], marked };
            adobeSent[r.id] = { r.project, r.title };
            const auto alive = Adobe::ReadAlive();
            const bool running = alive.fresh || Platform::ApplicationRunning(lr.path);
            // Abre o Lightroom (ou traz para a frente). Com outro catálogo aberto, abrir o .lrcat faz o Lightroom trocar
            const bool switchCatalog = !r.catalog.empty() && alive.catalog != r.catalog;
            std::vector<std::filesystem::path> files;
            if (switchCatalog)
                files.push_back(catalog);
            const bool opened = Platform::OpenWithApplication(lr.path, files);
            // Já aberto: vem para a frente (o "open" sozinho não trazia; pedido do dono, 2026-11-06). O plugin mostra o
            // painel com "Preparing photos…"
            if (running)
                NativeWindow::ActivateApplication(PathToUtf8(lr.path));
            Log(std::string("Lightroom Classic: ") + (opened ? "asked to open " : "could not open ") + PathToUtf8(lr.path) + " (open now: " + (running ? "yes" : "no") +
                ", plugin answering: " + (alive.fresh ? "yes" : "no") + ", plugin installed: " + Adobe::InstalledPluginVersion() + ")");
            Log("Edit in Lightroom Classic: " + args[0] + " (" + std::to_string(r.photos.size()) + " photos" +
                (args[3] == "photo" ? ", just " + args[2] : "") + (switchCatalog ? ", switching to the project catalog" : "") + ")");
            return Json("adobeEdit").Add("ok", true).Add("id", r.id).Add("running", running).Add("alive", alive.fresh)
                .Add("justInstalled", justInstalled).Add("switchCatalog", switchCatalog).Str();
        });
        // adobeStatus(id): a resposta do plugin a esse pedido. done marca as fotos como "In Lightroom".
        // ---- Edit in Photoshop (decisões do dono, 2026-11-11/12) ----
        // Uma foto por vez. A foto volta por cópia de trabalho e ⌘S: o Stillpoint põe um TIFF de 16 bits em
        // Edited/<sessão>/ com o nome da foto, já com o enquadramento da sessão, e abre esse arquivo no Photoshop; salvar
        // lá traz a editada (o app vigia a pasta Edited). Foto que já tem editada: abre a própria editada. Original RAW
        // sem editada: não abre (o Stillpoint não revela RAW); a página explica e oferece o Lightroom.
        // adobeEditInPhotoshop(sessão, grupo, "force" para abrir mesmo com a foto no Lightroom):
        //   ok, opened (nome do arquivo aberto), again (já era editada), number; ou problem = missing | raw | inlr | error
        window.bind("adobeEditInPhotoshop", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            auto fail = [](const std::string& problem, const std::string& error = std::string())
            { return Json("adobePhotoshop").Add("ok", false).Add("problem", problem).Add("error", error).Str(); };
            if (args.size() < 2) return fail("error", "Missing values.");
            const auto ps = adobeFind(Adobe::Program::Photoshop);
            if (!ps.found) return fail("missing");
            const auto sessions = store.ListSessions();
            const auto session = std::find_if(sessions.begin(), sessions.end(), [&](const StoredSession& x) { return x.name == args[0]; });
            const auto dir = store.SessionDir(args[0]);
            if (session == sessions.end() || dir.empty()) return fail("error", "The session is no longer there.");
            if (!session->inProject || store.ProjectEdited().empty())
                return fail("error", "This session is not in a project. Add it to the project first: the edited photo is kept in the project's Edited folder.");
            // A foto do grupo: o JPEG quando existe (é dele que a exportação parte); o RAW só quando não há JPEG
            std::string file, rawFile;
            int number = 0;
            for (const auto& photo : session->photos)
            {
                if (PhotoGroup(photo) != args[1]) continue;
                number = photo.order;
                if (IsRawPhoto(photo.file)) rawFile = photo.file;
                else if (file.empty() || IsJpegPhoto(photo.file)) file = photo.file;
            }
            if (file.empty() && rawFile.empty()) return fail("error", "The photo is no longer there.");
            char numberText[16];
            std::snprintf(numberText, sizeof(numberText), "%02d", number);
            // Já tem editada (do Lightroom, ou de uma vez anterior no Photoshop): abre a própria editada
            std::filesystem::path edited = store.EditedFile(args[0], !rawFile.empty() ? rawFile : file);
            if (edited.empty() && !file.empty() && !rawFile.empty()) edited = store.EditedFile(args[0], file);
            const bool force = args.size() > 2 && args[2] == "force";
            if (!force)
            {
                const auto editing = LoadEditing();
                const auto it = editing.find(args[0]);
                if (it != editing.end())
                {
                    const auto g = it->second.find(args[1]);
                    if (g != it->second.end() && g->second == "lr")
                        return Json("adobePhotoshop").Add("ok", false).Add("problem", "inlr").Add("number", numberText).Str();
                }
            }
            if (!edited.empty())
            {
                if (!Platform::OpenWithApplication(ps.path, { edited })) return fail("error", "Could not open Photoshop.");
                store.PsMark(args[0], edited, true);  // (vigiada: quando o Photoshop salvar, a foto passa a "edited in Photoshop")
                Log("Edit in Photoshop: photo " + std::string(numberText) + " of " + args[0] + " (" + PathToUtf8(edited.filename()) + ", already edited)");
                return Json("adobePhotoshop").Add("ok", true).Add("again", true).Add("number", numberText).Add("opened", PathToUtf8(edited.filename())).Str();
            }
            // Uma cópia de trabalho que já existe e ainda não foi salva: abre a mesma
            {
                const std::string base = (file.empty() ? rawFile : file).substr(0, (file.empty() ? rawFile : file).rfind('.'));
                for (const auto& [name, entry] : store.PsPending(args[0]))
                    if (!entry.watch && entry.unchanged && name.substr(0, name.rfind('.')) == base)
                    {
                        const auto copy = store.ProjectEdited() / args[0] / name;
                        if (!Platform::OpenWithApplication(ps.path, { copy })) return fail("error", "Could not open Photoshop.");
                        return Json("adobePhotoshop").Add("ok", true).Add("again", false).Add("number", numberText).Add("opened", name).Str();
                    }
            }
            // Original RAW sem JPEG ao lado: o Stillpoint não tem como fazer a cópia (decisão do dono: explica e oferece
            // o Lightroom)
            if (file.empty() || IsRawPhoto(file))
                return Json("adobePhotoshop").Add("ok", false).Add("problem", "raw").Add("number", numberText).Str();
            if (!rawFile.empty())
                return Json("adobePhotoshop").Add("ok", false).Add("problem", "raw").Add("number", numberText).Str();
            // O enquadramento da sessão, como na exportação: proporção, posição e o alinhamento de cada foto
            Export::Framing framing;
            size_t k = 0;
            std::string ratio = "asshot";
            {
                double posX = 0.5, posY = 0.5;
                std::stringstream parts(session->crop);
                std::string a, b, c;
                std::getline(parts, a, '|'); std::getline(parts, b, '|'); std::getline(parts, c, '|');
                if (!a.empty()) ratio = a;
                try { if (!b.empty()) posX = std::stod(b); if (!c.empty()) posY = std::stod(c); } catch (...) {}
                const double target = Export::RatioValue(ratio);
                framing.ratio = target > 0 ? ratio : std::string();
                framing.posX = posX; framing.posY = posY;
                std::map<std::string, std::string> perGroup;  // uma foto por câmera (RAW + JPEG: o JPEG)
                for (const auto& photo : session->photos)
                {
                    if (!photo.previewable) continue;
                    const std::string group = std::to_string(1000 + photo.order) + photo.camera;
                    if (!perGroup.count(group) || IsJpegPhoto(photo.file)) perGroup[group] = photo.file;
                }
                const auto aligns = Export::ParseAlign(session->align);
                std::vector<std::pair<int, int>> sizes;
                bool allSizes = !perGroup.empty();
                size_t at = 0;
                for (const auto& [group, f] : perGroup)
                {
                    auto it = aligns.find(f);
                    framing.align.push_back(it == aligns.end() ? Export::Align() : it->second);
                    int w = 0, h = 0;
                    if (!Export::PhotoSize(dir / f, w, h)) { w = 0; h = 0; allSizes = false; }
                    sizes.push_back({ w, h });
                    if (f == file) k = at;
                    ++at;
                }
                bool sameShape = allSizes && !sizes.empty() && sizes[0].second > 0;
                for (const auto& sz : sizes)
                    if (!sameShape || sz.second <= 0 ||
                        std::abs(static_cast<double>(sz.first) / sz.second - static_cast<double>(sizes[0].first) / sizes[0].second) > 0.02)
                        sameShape = false;
                if (!framing.Active() && (!sameShape || !framing.Aligned()))
                    framing.align.clear();
                else if (!allSizes || !Export::ComputeCommonFrame(framing, sizes))
                    framing.align.clear();
                if (framing.Canvas())
                {
                    // O canvas com que a foto vai: a conferência da editada que voltar usa a forma dele (como no Lightroom)
                    char canvas[96];
                    std::snprintf(canvas, sizeof(canvas), "%.3f,%.3f|", framing.commonW, framing.commonH);
                    store.SetLrCanvas(args[0], canvas + ratio);
                }
            }
            std::error_code ec;
            const auto folder = store.ProjectEdited() / args[0];
            std::filesystem::create_directories(folder, ec);
            const auto copy = folder / (file.substr(0, file.rfind('.')) + ".tif");
            std::string error;
            if (!Export::WorkingCopy(dir / file, copy, framing, k, error))
            {
                Log("Edit in Photoshop: " + error);
                return fail("error", error);
            }
            store.PsMark(args[0], copy);
            if (!Platform::OpenWithApplication(ps.path, { copy }))
            {
                store.PsClear(args[0], PathToUtf8(copy.filename()));
                std::filesystem::remove(copy, ec);
                return fail("error", "Could not open Photoshop.");
            }
            Log("Edit in Photoshop: photo " + std::string(numberText) + " of " + args[0] + " (working copy " + PathToUtf8(copy.filename()) + ")");
            emitSessions();
            return Json("adobePhotoshop").Add("ok", true).Add("again", false).Add("number", numberText).Add("opened", PathToUtf8(copy.filename())).Str();
        });
        // adobePhotoshopCancel(sessão, grupo): a foto aberta no Photoshop e ainda não salva deixa de estar marcada e a
        // cópia de trabalho é apagada (só se continua como o Stillpoint a criou)
        window.bind("adobePhotoshopCancel", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 2) return Json("adobePhotoshop").Add("ok", false).Str();
            const auto sessions = store.ListSessions();
            const auto session = std::find_if(sessions.begin(), sessions.end(), [&](const StoredSession& x) { return x.name == args[0]; });
            if (session == sessions.end()) return Json("adobePhotoshop").Add("ok", false).Str();
            int removed = 0;
            for (const auto& photo : session->photos)
            {
                if (PhotoGroup(photo) != args[1]) continue;
                const std::string base = photo.file.substr(0, photo.file.rfind('.'));
                for (const auto& [name, entry] : store.PsPending(args[0]))
                {
                    if (entry.watch || name.substr(0, name.rfind('.')) != base) continue;
                    if (entry.unchanged)
                    {
                        std::error_code ec;
                        std::filesystem::remove(store.ProjectEdited() / args[0] / name, ec);
                        ++removed;
                    }
                    store.PsClear(args[0], name);
                }
            }
            if (removed) Log("Edit in Photoshop cancelled: the working copy of " + args[1] + " (" + args[0] + ") was removed");
            emitSessions();
            return Json("adobePhotoshop").Add("ok", true).Add("removed", removed).Str();
        });

        window.bind("adobeStatus", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const std::string id = args.empty() ? std::string() : args[0];
            const auto status = Adobe::ReadStatus(id);
            const auto alive = Adobe::ReadAlive();
            // O Lightroom já saiu do catálogo vazio da Mesa: a pasta vai para o Lixo (decisão do dono, 2026-11-06)
            if (!adobeTrashLater.empty() && alive.fresh && !alive.catalog.empty()
                && alive.catalog.rfind(PathToUtf8(adobeTrashLater), 0) != 0)
            {
                const std::string folder = PathToUtf8(adobeTrashLater);
                Log(NativeWindow::MoveToSystemTrash(folder) ? "Moved to the Trash: " + folder : "Could not move to the Trash: " + folder);
                adobeTrashLater.clear();
            }
            bool running = alive.fresh;
            if (!running)
            {
                const auto lr = adobeFind(Adobe::Program::Lightroom);
                running = lr.found && Platform::ApplicationRunning(lr.path);
            }
            if (status.state == "done" || status.state == "error" || status.state == "wrong-catalog")
            {
                const auto it = adobePending.find(id);
                if (it != adobePending.end())
                {
                    if (status.state == "done")
                    {
                        auto map = LoadEditing();
                        for (const auto& group : it->second.second)
                            map[it->second.first][group] = "lr";
                        SaveEditing(map);
                        // Onde a sessão ficou no Lightroom (para o Done editing tirar a coleção certa, mesmo se o rótulo mudar)
                        const auto sent = adobeSent.find(id);
                        if (sent != adobeSent.end())
                            Adobe::RememberCollection(it->second.first, sent->second.first, sent->second.second, status.catalog);
                        emitEditing();
                        Log("Lightroom Classic: " + it->second.first + " is in the collection (" + std::to_string(status.added) + " new in the catalog)");
                    }
                    else
                        Log("Lightroom Classic: " + status.state + " " + status.message);
                    adobePending.erase(it);
                }
            }
            return Json("adobeStatus").Add("state", status.state).Add("message", status.message).Add("catalog", status.catalog)
                .Add("added", status.added).Add("alive", alive.fresh).Add("running", running).Str();
        });
        // adobeCancel(id): desiste do pedido (o plugin não pega mais)
        window.bind("adobeCancel", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (!args.empty())
            {
                Adobe::CancelRequest(args[0]);
                adobePending.erase(args[0]);
            }
            return "null";
        });
        // adobeDoneEditing(sessão, grupo, ...): as fotos saem do "In Lightroom" (nenhum grupo = a sessão inteira)
        window.bind("adobeDoneEditing", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty())
                return "null";
            auto map = LoadEditing();
            if (args.size() == 1)
            {
                // A sessão inteira: a coleção dela sai do Lightroom (as fotos e as edições ficam no catálogo). Com o
                // Lightroom fechado, o plugin tira quando ele abrir.
                map.erase(args[0]);
                if (Adobe::QueueRemoveCollection(args[0], "", "", ""))
                    Log("Done editing: the Lightroom Classic collection of " + args[0] + " will be removed");
            }
            else
                for (size_t i = 1; i < args.size(); ++i)
                    map[args[0]].erase(args[i]);
            SaveEditing(map);
            emitEditing();
            return Json("adobeEditing").Raw("sessions", EditingJson(LoadEditing())).Str();
        });
        // adobeDoneSession(sessão, nome da coleção): Done editing da sessão inteira. Tira a etiqueta e pede ao plugin
        // para tirar a coleção do Lightroom (as fotos e as edições ficam no catálogo).
        window.bind("adobeDoneSession", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty())
                return "null";
            const auto sessions = store.ListSessions();
            const auto s = std::find_if(sessions.begin(), sessions.end(), [&](const StoredSession& x) { return x.name == args[0]; });
            const std::string projectName = s != sessions.end() && s->inProject && project.IsOpen() ? project.Name() : std::string();
            auto map = LoadEditing();
            map.erase(args[0]);
            SaveEditing(map);
            std::string catalogNow;
            if (adobeCatalogMode() == "project" && s != sessions.end() && s->inProject)
            {
                const auto c = projectCatalog();
                std::error_code ec;
                if (!c.empty() && std::filesystem::exists(c, ec))
                    catalogNow = PathToUtf8(c);
            }
            if (Adobe::QueueRemoveCollection(args[0], projectName, args.size() > 1 ? args[1] : std::string(), catalogNow))
                Log("Done editing: the Lightroom Classic collection of " + args[0] + " will be removed");
            emitEditing();
            return Json("adobeEditing").Raw("sessions", EditingJson(LoadEditing())).Str();
        });
        // photoFile(sessão, arquivo, "reveal" | "open"): mostra a foto selecionada no Finder/Explorer
        // ou abre no programa padrão (botão direito numa foto)
        window.bind("photoFile", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 3 || args[1].empty() || args[1].find_first_of("/\\") != std::string::npos || args[1].find("..") != std::string::npos)
                return Json("photoFile").Add("ok", false).Str();
            const auto dir = store.SessionDir(args[0]);
            std::error_code ec;
            const auto file = dir / args[1];
            if (dir.empty() || !std::filesystem::exists(file, ec))
                return Json("photoFile").Add("ok", false).Add("error", "The file is no longer there.").Str();
            if (args[2] == "open")
                Platform::OpenWithDefaultApp(file);
            else
                Platform::RevealInFileManager(file);
            return Json("photoFile").Add("ok", true).Str();
        });
        // projectOpenFolder(): mostra a pasta do Project no Finder/Explorer
        window.bind("projectOpenFolder", [&](const std::string&) -> std::string
        {
            if (project.Available())
                Platform::OpenInFileManager(project.Root());
            return "null";
        });
        // addToProject(sessão, ...) / removeFromProject(sessão, ...): move as pastas
        auto moveSessions = [&](const std::string& request, bool toProject) -> std::string
        {
            const auto args = ParseStringArgs(request);
            std::string error;
            int moved = 0;
            for (const auto& name : args)
            {
                if (store.MoveSession(name, toProject, error))
                    ++moved;
                else
                    break;
            }
            emitSessions();
            return Json("moved").Add("count", moved).Add("error", error).Str();
        };
        window.bind("addToProject", [&](const std::string& request) -> std::string { return moveSessions(request, true); });
        window.bind("removeFromProject", [&](const std::string& request) -> std::string { return moveSessions(request, false); });
        // setSessionLabel(sessão, rótulo)
        window.bind("setSessionLabel", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const bool ok = args.size() >= 2 && store.SetLabel(args[0], args[1]);
            emitSessions();
            return Json("label").Add("ok", ok).Str();
        });
        // setSessionCrop(sessão, "3:2|0.5|0.5"): o recorte escolhido para o Export fica na sessão (Project)
        window.bind("setSessionCrop", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const bool ok = args.size() >= 2 && store.SetCrop(args[0], args[1]);
            return Json("crop").Add("ok", ok).Str();
        });
        // setSessionAlign(sessão, "arquivo:dx,dy,scale,rot;..."): o alinhamento das fotos (tela "Align photos" do
        // Export) fica na sessão; os originais não mudam (pedaço 2 do Framing)
        window.bind("setSessionAlign", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const bool ok = args.size() >= 2 && store.SetAlign(args[0], args[1]);
            return Json("align").Add("ok", ok).Str();
        });
        // photoSize(sessão, arquivo): largura e altura da foto em pixels (a tela de alinhamento trabalha em
        // pixels do original). Decodifica na fila de prévias; o resultado fica guardado por arquivo.
        {
            static std::map<std::string, std::pair<int, int>> sizeCache;
            static std::mutex sizeMutex;
            window.bind("photoSize", [&](const std::string& id, const std::string& request, void*)
            {
                const auto args = ParseStringArgs(request);
                const std::string session = args.size() > 0 ? args[0] : "";
                const std::string file = args.size() > 1 ? args[1] : "";
                previews.Post([&, id, session, file]
                {
                    const std::string key = session + "/" + file;
                    int w = 0, h = 0;
                    {
                        std::lock_guard<std::mutex> lock(sizeMutex);
                        auto it = sizeCache.find(key);
                        if (it != sizeCache.end()) { w = it->second.first; h = it->second.second; }
                    }
                    if (w <= 0)
                    {
                        const std::filesystem::path dir = store.SessionDir(session);
                        if (!dir.empty() && Export::PhotoSize(dir / file, w, h))
                        {
                            std::lock_guard<std::mutex> lock(sizeMutex);
                            sizeCache[key] = { w, h };
                        }
                    }
                    window.resolve(id, 0, Json("size").Add("width", w).Add("height", h).Str());
                });
            }, nullptr);
        }
        // projectExportDefaults(json): guarda as últimas configurações de export do Project
        window.bind("projectExportDefaults", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (!args.empty() && project.Available())
                project.SetExportDefaults(args[0]);
            return "null";
        });

        // cancelShoot(): para o bullet time em andamento (contagem, entre sessões ou
        // esperando as fotos). Só avisa o núcleo; ele para no próximo décimo de segundo.
        window.bind("cancelShoot", [&](const std::string&) -> std::string
        {
            fakeCancel = true;
            controller.RequestCancel();
            return "null";
        });

        // readCameraSettings(): lê de novo as configurações de todas as câmeras
        window.bind("readCameraSettings", [&](const std::string&) -> std::string
        {
            cameras.Post([&]
            {
                if (busy || controller.HasPendingConnections())
                    return;
                EmitCameraSettings(controller, listener, singleShotWarned);
            });
            return "null";
        });

        // ---- O estado do rig do Project ----
        // rigPanelSave(json): o painel Bullet time (Countdown, Sessions, Download wait, Timing) vai para o Project aberto
        window.bind("rigPanelSave", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty()) return "null";
            std::lock_guard<std::mutex> lock(rigMutex);
            if (rigFolder.empty() || rigState.panel == args[0]) return "null";
            rigState.panel = args[0];
            rigSave();
            return "null";
        });
        // rigCheck(): a página chama quando o Project muda e quando as câmeras ficam prontas. Põe a ordem guardada,
        // lê as câmeras e compara com o Project. Com diferença, manda "rigAsk" (a página pergunta); só com o rig
        // diferente (câmera faltando ou nova), "rigNotice"; ocupado, "rigBusy" (a página tenta de novo).
        window.bind("rigCheck", [&](const std::string&) -> std::string
        {
            cameras.Post([&]
            {
                if (busy || controller.HasPendingConnections()) { listener.Emit(Json("rigBusy")); return; }
                const auto camerasJson = [](const std::vector<Rig::Camera>& list)
                {
                    std::string out = "[";
                    for (size_t i = 0; i < list.size(); ++i)
                        out += (i ? "," : "") + Json("camera").Add("name", list[i].name).Add("model", list[i].model).Add("order", list[i].order).Str();
                    return out + "]";
                };
                std::vector<std::string> names;
                {
                    std::lock_guard<std::mutex> lock(rigMutex);
                    const auto connected = rigConnected();
                    for (const auto& [serial, name] : connected)
                        if (std::find(rigConnectOrder.begin(), rigConnectOrder.end(), serial) == rigConnectOrder.end())
                            rigConnectOrder.push_back(serial);
                    if (rigFolder.empty() || connected.empty()) return;
                    // A ordem do Project: as conhecidas na ordem guardada, as novas no fim
                    std::vector<std::string> current, serials;
                    for (const auto& [serial, name] : connected) { serials.push_back(serial); current.push_back(name); }
                    for (const auto& serial : Rig::OrderFor(rigState, serials))
                        for (const auto& [s, name] : connected)
                            if (s == serial) names.push_back(name);
                    if (names == current) names.clear();
                }
                if (!names.empty())
                {
                    controller.SetCameraOrder(names);
                    listener.Emit(CamerasSnapshot(controller));
                }
                auto all = ReadAllSettings(controller);
                std::lock_guard<std::mutex> lock(rigMutex);
                if (rigFolder.empty()) return;
                rigOrderApplied = true;
                rigNoteOrder();
                const auto now = rigReading(all);
                const Rig::Check check = Rig::Compare(rigState, now, rigMemory);
                // O que há de diferente no rig (câmera faltando ou nova); só o que ainda não foi dito vira recado
                std::string signature;
                bool news = false;
                for (const auto& c : check.missing) { const std::string one = "-" + c.serial + ";"; signature += one; news = news || rigMemory.reported.find(one) == std::string::npos; }
                for (const auto& c : check.fresh) { const std::string one = "+" + c.serial + ";"; signature += one; news = news || rigMemory.reported.find(one) == std::string::npos; }
                if (!check.diffs.empty())
                {
                    rigAsked = check;
                    rigHistory[++rigAskId] = check;
                    rigMemory.reported = signature;  // (o aviso já mostra as duas linhas do rig)
                    std::string rows = "[";
                    for (size_t i = 0; i < check.diffs.size(); ++i)
                    {
                        const Rig::Diff& d = check.diffs[i];
                        rows += (i ? "," : "") + Json("diff").Add("camera", d.name).Add("model", d.model).Add("order", d.order)
                            .Add("key", d.key).Add("setting", Rig::KeyName(d.key)).Add("now", d.now.label).Add("want", d.want.label).Str();
                    }
                    listener.Emit(Json("rigAsk").Add("id", rigAskId).Add("project", project.Name()).Add("differing", check.differing).Add("connected", check.connected)
                        .Raw("diffs", rows + "]").Raw("missing", camerasJson(check.missing)).Raw("fresh", camerasJson(check.fresh)));
                    return;
                }
                // Nada a perguntar: as câmeras passam a conferidas e o Project acompanha o que mudar nelas
                Rig::Keep(rigMemory, check, now);
                const bool hadCameras = rigHadCameras;
                if (Rig::Absorb(rigState, now, rigMemory)) rigSave();
                rigHadCameras = true;
                if (hadCameras && news)
                    listener.Emit(Json("rigNotice").Raw("missing", camerasJson(check.missing)).Raw("fresh", camerasJson(check.fresh)));
                rigMemory.reported = signature;
            });
            return "null";
        });
        // rigAnswer(modo, número da pergunta): a resposta ao aviso e o ⌘Z dela (pedido do dono, 2026-11-11).
        //  apply: as câmeras recebem o que o Project guardou; keep: nada muda nas câmeras e o Project continua com o que
        //  tinha; revert (⌘Z do apply): as câmeras voltam ao que tinham, o Project não muda; reapply (⇧⌘Z): aplica de
        //  novo; reask (⌘Z do keep): a pergunta volta a valer (a página mostra o aviso de novo).
        window.bind("rigAnswer", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const std::string mode = !args.empty() ? args[0] : std::string("keep");
            int id = 0;
            if (args.size() > 1) try { id = std::stoi(args[1]); } catch (...) { id = 0; }
            if (mode == "reask")
            {
                std::lock_guard<std::mutex> lock(rigMutex);
                if (const auto it = rigHistory.find(id); it != rigHistory.end()) rigAsked = it->second;
                return "null";
            }
            const bool write = mode == "apply" || mode == "revert" || mode == "reapply";
            auto answer = [&, mode, id, write]
            {
                Rig::Check asked;
                {
                    std::lock_guard<std::mutex> lock(rigMutex);
                    const auto it = rigHistory.find(id);
                    asked = it != rigHistory.end() ? it->second : rigAsked;
                    rigAsked = Rig::Check();
                    // Desfazer o Apply é ficar como no Keep: a diferença fica na câmera e o Project não muda
                    if (mode == "revert")
                        for (const Rig::Diff& d : asked.diffs) rigMemory.kept[{ d.serial, d.key }] = d.now.value;
                }
                std::vector<std::string> errors;
                std::set<std::string> touched;
                if (write)
                    for (const std::string& key : Rig::Keys())  // na ordem certa (balanço de branco antes da temperatura...)
                        for (const Rig::Diff& d : asked.diffs)
                        {
                            if (d.key != key) continue;
                            for (const auto& cam : controller.GetCameras())
                            {
                                if (!cam.sessionOpen || cam.portName != d.serial) continue;
                                std::string error;
                                if (controller.WriteSetting(cam, key, mode == "revert" ? d.now.value : d.want.value, error)) touched.insert(d.serial);
                                else errors.push_back(cam.shortName + " · " + Rig::KeyName(key) + ": " + error);
                            }
                        }
                auto all = ReadAllSettings(controller);
                EnsureSingleShot(controller, all, singleShotWarned);
                {
                    std::lock_guard<std::mutex> lock(rigMutex);
                    if (!rigFolder.empty())
                    {
                        // O que continuou diferente (não foi aplicado, ou a câmera recusou) fica como está na câmera, sem
                        // mexer no Project; daqui em diante o Project acompanha o que mudar
                        const auto now = rigReading(all);
                        Rig::Keep(rigMemory, Rig::Compare(rigState, now, rigMemory), now);
                        if (Rig::Absorb(rigState, now, rigMemory)) rigSave();
                        rigHadCameras = true;
                    }
                }
                std::string text;
                for (const auto& e : errors) text += (text.empty() ? "" : " ") + e;
                listener.Emit(Json("rigAnswered").Add("mode", mode).Add("id", id).Add("applied", mode == "apply").Add("cameras", static_cast<int>(touched.size()))
                    .Add("failed", static_cast<int>(errors.size())).Add("error", text));
                listener.Emit(Json("cameraSettings").Raw("cameras", CameraSettingsJson(controller, all)));
            };
            if (write) run("rig", answer);
            else cameras.Post(answer);
            return "null";
        });

        // setCameraSetting(câmera ou "*", chave, valor): muda na hora; "*" = todas as
        // câmeras que dá para ajustar. Responde com cameraSettingResult e a leitura nova.
        window.bind("setCameraSetting", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 3)
                return "null";
            const std::string target = args[0], key = args[1];
            long long value = 0;
            try { value = std::stoll(args[2]); } catch (...) { return "null"; }
            cameras.Post([&, target, key, value]
            {
                auto result = Json("cameraSettingResult").Add("camera", target).Add("key", key);
                if (busy || controller.HasPendingConnections())
                {
                    listener.Emit(result.Add("ok", false).Add("error", busy ? "Stillpoint is busy. Try again when it finishes."
                                                                             : "A camera is connecting. Try again when it is ready."));
                    return;
                }
                std::vector<std::string> errors;
                for (const auto& cam : controller.GetCameras())
                {
                    if (!cam.sessionOpen || (target != "*" && cam.shortName != target))
                        continue;
                    if (target == "*" && !controller.ReadSettings(cam).adjustable)
                        continue;
                    std::string error;
                    if (!controller.WriteSetting(cam, key, value, error))
                        errors.push_back(cam.shortName + ": " + error);
                }
                std::string text;
                for (const auto& e : errors)
                    text += (text.empty() ? "" : " ") + e;
                listener.Emit(result.Add("ok", errors.empty()).Add("error", text));
                EmitCameraSettings(controller, listener, singleShotWarned);
            });
            return "null";
        });

        window.bind("identify", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.empty())
                return "null";
            const std::string name = args[0];
            run("identify", [&, name]
            {
                if (cameraConnecting())
                    return;
                for (const auto& cam : controller.GetCameras())
                {
                    if (cam.shortName == name)
                        controller.TestCamera(cam);
                }
            });
            return "null";
        });

        window.bind("setPrefix", [&](const std::string& request) -> std::string
        {
            const auto names = ParseStringArgs(request);
            const auto numbers = ParseIntArgs(request);
            if (names.empty() || numbers.empty())
                return "null";
            const std::string name = names[0];
            const int prefix = numbers.back();
            run("reorder", [&, name, prefix] { controller.SetCameraPrefix(name, prefix); });
            return "null";
        });

        // --- Sessões e fotos ---

        window.bind("listSessions", [&](const std::string&) -> std::string
        {
            return SessionsJson(store);
        });

        // getPhoto(sessão, arquivo, tamanho) -> "data:image/jpeg;base64,..." (ou null)
        auto bindPhotos = [&](webview::webview& target, const std::string& name, PhotoStore& source)
        {
            PhotoStore* from = &source;
            webview::webview* to = &target;
            target.bind(name, [&, from, to](const std::string& id, const std::string& request, void*)
            {
                const auto args = ParseStringArgs(request);
                const auto numbers = ParseIntArgs(request);
                const std::string session = args.size() > 0 ? args[0] : "";
                const std::string file = args.size() > 1 ? args[1] : "";
                const int size = numbers.empty() ? 1600 : std::clamp(numbers.back(), 64, 4000);
                const bool original = args.size() > 2 && args[2] == "original";  // getPhoto(sessão, arquivo, tamanho, "original")

                // from e to por cópia: a biblioteca chama esta função numa cópia temporária
                // do fecho, então uma referência a eles ficaria pendurada quando a thread
                // das prévias rodasse (foi um travamento no Mac em 2026-10-16)
                previews.Post([&, from, to, id, session, file, size, original]
                {
                    const std::string jpeg = from->Preview(session, file, size, original);
                    to->resolve(id, 0, jpeg.empty() ? "null" : JsonString("data:image/jpeg;base64," + Base64Encode(jpeg)));
                });
            }, nullptr);
        };
        bindPhotos(window, "getPhoto", store);
        bindPhotos(window, "getOrderPhoto", orderStore);

        // ---------------------------------------------------------------
        // Janelas Live (assets/ui/live.html): palco do disparo numa janela separada,
        // tela cheia num monitor/TV ou flutuante. Até duas (ex.: Operator no monitor,
        // Audience na TV). Criadas na thread da janela e nunca destruídas enquanto o
        // app roda: fechar só esconde; Live view traz de volta. Recebem os mesmos
        // avisos do núcleo que a página principal (GuiListener::AddWindow).
        // Opções por janela em settings.txt (live1=, live2=); o som é do app (live=).
        // ---------------------------------------------------------------
        struct LiveWindow
        {
            int index = 0;
            bool shown = false;  // à mostra (fechar só esconde)
            long openedAt = 0;   // ordem em que foi aberta (a primeira à mostra se chama "Live", a outra "Live 2")
            std::unique_ptr<webview::webview> view;
        };
        std::vector<std::unique_ptr<LiveWindow>> lives;
        long liveOpenCounter = 0;
        // Quantas Live estão abertas: as páginas desligam "Another window" com duas
        auto livesOpen = [&]
        {
            int n = 0;
            for (const auto& live : lives)
                n += live->shown ? 1 : 0;
            return n;
        };
        // Posição de uma janela entre as abertas (1 = a mais antiga, "Live"; 2 = "Live 2"); 0 = fechada
        auto liveRank = [&](const LiveWindow& w)
        {
            if (!w.shown)
                return 0;
            int rank = 1;
            for (const auto& other : lives)
                if (other.get() != &w && other->shown && other->openedAt < w.openedAt)
                    ++rank;
            return rank;
        };
        // Avisa as páginas (quantas abertas e o número de cada uma) e acerta o título das janelas
        auto emitLives = [&]
        {
            std::string ranks = "{";
            for (const auto& live : lives)
            {
                const int rank = liveRank(*live);
                ranks += (ranks.size() > 1 ? "," : "") + std::string("\"") + std::to_string(live->index) + "\":" + std::to_string(rank);
                if (rank > 0)
                    live->view->set_title(rank == 1 ? "Stillpoint · Live" : "Stillpoint · Live " + std::to_string(rank));
            }
            listener.Emit(Json("liveWindows").Add("open", livesOpen()).Raw("ranks", ranks + "}"));
        };

        // Som do disparo: {"sound":…,"sounds":…} guardado em settings.txt (live=)
        auto soundSettings = [&]
        {
            const auto current = LoadSettings();
            const std::string text = current.count("live") ? current.at("live") : "";
            return std::make_pair(text.find("\"sound\":false") == std::string::npos,
                                  text.find("\"sounds\":false") == std::string::npos);
        };
        auto soundEvent = [&]
        {
            const auto [sound, sounds] = soundSettings();
            return Json("soundChanged").Add("sound", sound).Add("sounds", sounds);
        };
        // liveSetSound(som, grupos): "1"/"0"; avisa todas as janelas
        auto bindSetSound = [&](webview::webview& target)
        {
            target.bind("liveSetSound", [&](const std::string& request) -> std::string
            {
                const auto args = ParseStringArgs(request);
                if (args.size() < 2)
                    return "null";
                auto current = LoadSettings();
                current["live"] = std::string("{\"sound\":") + (args[0] == "1" ? "true" : "false")
                    + ",\"sounds\":" + (args[1] == "1" ? "true" : "false") + "}";
                SaveSettings(current);
                listener.Emit(soundEvent());
                return "null";
            });
        };
        bindSetSound(window);
        // cycleWindows("1" = ao contrário): Cmd+` / Cmd+Shift+` vindo das páginas (tecla física,
        // vale em qualquer teclado); passa entre a janela principal e as Live
        auto bindCycle = [&](webview::webview& target)
        {
            target.bind("cycleWindows", [](const std::string& request) -> std::string
            {
                const auto args = ParseStringArgs(request);
                NativeWindow::CycleWindows(!args.empty() && args[0] == "1");
                return "null";
            });
        };
        bindCycle(window);

        auto screensJson = []
        {
            std::string list = "[";
            bool first = true;
            for (const auto& screen : NativeWindow::Screens())
            {
                list += (first ? "" : ",") + Json("screen").Add("name", screen.name).Add("primary", screen.primary).Str();
                first = false;
            }
            return list + "]";
        };

        std::function<void(int)> openLive = [&](int index)
        {
            for (auto& live : lives)
                if (live->index == index)
                {
                    if (auto native = live->view->window(); native.ok())
                        NativeWindow::Show(native.value());
                    if (!live->shown)
                        live->openedAt = ++liveOpenCounter;
                    live->shown = true;
                    emitLives();
                    return;
                }
            auto live = std::make_unique<LiveWindow>();
            live->index = index;
            live->view = std::make_unique<webview::webview>(false, nullptr);
            webview::webview& v = *live->view;
            const std::string key = "live" + std::to_string(index);
            v.set_title(livesOpen() == 0 ? "Stillpoint · Live" : "Stillpoint · Live 2");
            v.set_size(960, 560, WEBVIEW_HINT_NONE);
            v.set_size(480, 300, WEBVIEW_HINT_MIN);

            // liveReady(): opções desta janela, som, monitores e a última lista de câmeras
            v.bind("liveReady", [&, index, key](const std::string&) -> std::string
            {
                const auto current = LoadSettings();
                const auto [sound, sounds] = soundSettings();
                const std::string cameras = listener.LastCameras();
                return Json("liveReady").Add("index", index)
                    .Add("opts", current.count(key) ? current.at(key) : std::string())
                    .Raw("sound", Json("sound").Add("sound", sound).Add("sounds", sounds).Str())
                    .Raw("screens", screensJson())
                    .Add("lives", livesOpen())
                    .Add("rank", [&] { for (const auto& l : lives) if (l->index == index) return liveRank(*l); return livesOpen() + 1; }())
                    .Raw("cameraEvent", cameras.empty() ? "null" : cameras).Str();
            });
            // O disparo e o cancelamento passam pela página principal (o plano do Timing é dela)
            v.bind("liveShoot", [&](const std::string&) -> std::string
            {
                window.dispatch([&] { window.eval("window.liveShootRequest && window.liveShootRequest()"); });
                return "null";
            });
            v.bind("liveCancel", [&](const std::string&) -> std::string
            {
                window.dispatch([&] { window.eval("window.liveCancelRequest && window.liveCancelRequest()"); });
                return "null";
            });
            // saveLiveWindow(índice, JSON): modo, layout, display, monitor, sempre à frente
            v.bind("saveLiveWindow", [&, key](const std::string& request) -> std::string
            {
                const auto args = ParseStringArgs(request);
                if (args.size() < 2 || args[1].find('\n') != std::string::npos)
                    return "null";
                auto current = LoadSettings();
                current[key] = args[1];
                SaveSettings(current);
                return "null";
            });
            // liveDisplay(índice, "window"|"full", monitor, sempre à frente "1"/"0")
            webview::webview* self = &v;
            v.bind("liveDisplay", [self](const std::string& request) -> std::string
            {
                const auto args = ParseStringArgs(request);
                if (args.size() < 4)
                    return "null";
                auto native = self->window();
                if (!native.ok())
                    return "null";
                if (args[1] == "full")
                    NativeWindow::SetFullScreen(native.value(), args[2]);
                else
                    NativeWindow::SetWindowed(native.value(), args[3] == "1");
                return "null";
            });
            LiveWindow* me = live.get();
            v.bind("liveClose", [&, self, me](const std::string&) -> std::string
            {
                if (auto native = self->window(); native.ok())
                    NativeWindow::Hide(native.value());
                me->shown = false;
                emitLives();
                return "null";
            });
            // "Another window" (nas duas): abre (ou traz de volta) a outra janela Live um pouco à
            // direita e abaixo desta, para ficar claro que é outra janela
            v.bind("liveAnother", [&, self, index](const std::string& request) -> std::string
            {
                const int other = index == 1 ? 2 : 1;
                // A outra janela abre no modo contrário ao desta (decisão do dono, 2026-11-05): Operator aqui, Audience
                // lá, ou o inverso. Grava nas opções dela (live1/live2) e avisa, caso ela já exista (escondida)
                const auto args = ParseStringArgs(request);
                if (!args.empty() && (args[0] == "operator" || args[0] == "audience"))
                {
                    const std::string mode = args[0] == "operator" ? "audience" : "operator";
                    auto current = LoadSettings();
                    const std::string otherKey = "live" + std::to_string(other);
                    std::string opts = current.count(otherKey) ? current.at(otherKey) : std::string();
                    static const std::regex modeField("\"mode\"\\s*:\\s*\"[a-z]*\"");
                    if (std::regex_search(opts, modeField))
                        opts = std::regex_replace(opts, modeField, "\"mode\":\"" + mode + "\"");
                    else if (opts.size() > 1 && opts.front() == '{' && opts.find(':') != std::string::npos)
                        opts = "{\"mode\":\"" + mode + "\"," + opts.substr(1);
                    else
                        opts = "{\"mode\":\"" + mode + "\"}";
                    current[otherKey] = opts;
                    SaveSettings(current);
                    listener.Emit(Json("liveMode").Add("index", other).Add("mode", mode));
                }
                openLive(other);
                for (auto& w : lives)
                    if (w->index == other)
                        if (auto a = w->view->window(), b = self->window(); a.ok() && b.ok())
                            NativeWindow::PlaceNear(a.value(), b.value(), 40, 40);
                return "null";
            });
            // livePick(sessão, parada "1"/"0"): no fim de um disparo com várias sessões, a janela Operator
            // avisa todas as janelas Live qual sessão está tocando (o Audience acompanha)
            v.bind("livePick", [&](const std::string& request) -> std::string
            {
                const auto args = ParseStringArgs(request);
                if (args.size() < 2)
                    return "null";
                int session = 0;
                try { session = std::stoi(args[0]); } catch (...) { return "null"; }
                listener.Emit(Json("livePick").Add("session", session).Add("pinned", args[1] == "1"));
                return "null";
            });
            // "Identify displays": número grande em cada monitor por 3 s
            v.bind("liveIdentify", [](const std::string&) -> std::string
            {
                NativeWindow::IdentifyScreens(3);
                return "null";
            });
            bindSetSound(v);
            bindCycle(v);
            bindPhotos(v, "getPhoto", store);

            // O botão de fechar só esconde a janela (ela volta com Live view)
            if (auto native = v.window(); native.ok())
            {
                void* handle = native.value();
                NativeWindow::InstallCloseGuard(handle, [&, handle, me]
                {
                    NativeWindow::Hide(handle);
                    me->shown = false;
                    emitLives();
                    return false;
                });
            }
            v.set_html(LoadPage("live.html", theme));
            listener.AddWindow(&v);
            live->shown = true;
            live->openedAt = ++liveOpenCounter;
            lives.push_back(std::move(live));
            emitLives();
        };
        // openLive(índice): abre (ou traz de volta) a janela Live 1 ou 2
        window.bind("openLive", [&](const std::string& request) -> std::string
        {
            const auto numbers = ParseIntArgs(request);
            const auto args = ParseStringArgs(request);
            int index = !numbers.empty() ? numbers[0] : (!args.empty() ? std::atoi(args[0].c_str()) : 1);
            // Já tem uma aberta (ex.: só a que nasceu do "Another window"): traz a mais antiga
            for (const auto& live : lives)
                if (live->shown && liveRank(*live) == 1)
                    index = live->index;
            openLive(std::clamp(index, 1, 2));
            return "null";
        });

        // --- Reordenar por foto ---

        // takeOrderPhotos(espera de download): uma foto de cada câmera, sem som,
        // guardada à parte (não vira sessão)
        window.bind("takeOrderPhotos", [&](const std::string& request) -> std::string
        {
            const auto values = ParseIntArgs(request);
            SequenceSettings settings;
            settings.countdownSeconds = 0;
            settings.sessionCount = 1;
            settings.downloadWaitSeconds = values.empty() ? 10 : std::max(1, values[0]);
            settings.playSounds = false;
            run("orderPhotos", [&, settings]
            {
                if (cameraConnecting())
                    return;
                orderStore.DeleteAll();
                EnsureSingleShot(controller, singleShotWarned);  // uma foto por câmera
                const std::string previous = controller.GetOutputFolder();
                controller.SetOutputFolder(orderStore.Root().string());
                if (fakeCount)
                    fakeRun(settings);
                else
                    controller.RunSequence(settings);
                controller.SetOutputFolder(previous);
                if (debugMode)
                {
                    const auto sessions = orderStore.ListSessions();
                    MatchDebug debug;
                    if (!sessions.empty() && debug.Begin(DebugRoot(), "test"))
                    {
                        debug.Shot(1, "Test shot", DebugPhotos(controller, orderStore, sessions.back(), nullptr));
                        rememberDebugFolder(debug.Folder());
                        listener.Emit(Json("debugSaved").Add("folder", PathToUtf8(debug.Folder())));
                    }
                }
                listener.Emit(Json("orderPhotos").Raw("sessions", SessionsJson(orderStore)));
            });
            return "null";
        });

        // cancelTest(): para o Test shot (com ou sem ajuste) entre uma foto e outra ou
        // esperando as fotos; com ajuste, as câmeras voltam como estavam.
        std::atomic<bool> testCancel{ false };
        // Cartão cinza: depois da primeira foto, o Match espera a pessoa conferir (ou
        // corrigir com um clique) onde está o cartão em cada foto
        struct CardPick
        {
            std::mutex mutex;
            std::condition_variable wake;
            bool confirmed = false;
            std::atomic<bool> skipped{ false };                      // "Skip the gray card": segue medindo a foto inteira
            std::map<std::string, ColorMatch::Region> regions;      // por câmera
            std::map<std::string, std::filesystem::path> files;     // a foto 1 de cada câmera
            std::map<std::string, Chart::Quad> quads;               // cartela: cantos por câmera
        } cardPick;
        auto quadJson = [](const std::string& camera, const Chart::Quad& q)
        {
            std::string xs = "[", ys = "[";
            for (int k = 0; k < 4; ++k)
            {
                xs += (k ? "," : "") + std::to_string(q.x[k]);
                ys += (k ? "," : "") + std::to_string(q.y[k]);
            }
            return Json("quad").Add("camera", camera).Add("found", q.found).Raw("x", xs + "]").Raw("y", ys + "]").Str();
        };
        auto regionJson = [](const std::string& camera, const ColorMatch::Region& r)
        {
            return Json("region").Add("camera", camera).Add("found", r.found)
                .Add("x0", r.x0).Add("y0", r.y0).Add("x1", r.x1).Add("y1", r.y1).Str();
        };
        window.bind("cancelTest", [&](const std::string&) -> std::string
        {
            testCancel = true;
            fakeCancel = true;  // câmeras simuladas: para o fakeRun também
            controller.RequestCancel();
            cardPick.wake.notify_all();
            return "null";
        });

        // autoMatch(espera): "Test shot" do Camera settings com "Match automatically".
        // Tira as fotos de teste (as mesmas temporárias do "Reorder by photo") e deixa as
        // câmeras o mais parecidas possível (auto_match.h). Avisa o andamento
        // (autoMatchProgress), mostra as últimas fotos (orderPhotos) e o resumo do que
        // mudou (autoMatchResult).
        // grayCardFind("câmera", "x", "y"): a pessoa clicou no cartão (x, y de 0 a 1000)
        window.bind("grayCardFind", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 3)
                return "null";
            std::filesystem::path file;
            {
                std::lock_guard<std::mutex> lock(cardPick.mutex);
                const auto it = cardPick.files.find(args[0]);
                if (it == cardPick.files.end())
                    return "null";
                file = it->second;
            }
            int x = 500, y = 500;
            try { x = std::stoi(args[1]); y = std::stoi(args[2]); } catch (...) {}
            const ColorMatch::Region region = ColorMatch::GrayCardAt(file, x / 1000.0, y / 1000.0);
            std::lock_guard<std::mutex> lock(cardPick.mutex);
            cardPick.regions[args[0]] = region;
            return regionJson(args[0], region);
        });

        // grayCardSet("câmera", "x0", "y0", "x1", "y1"): a pessoa desenhou a área do cartão
        // (de 0 a 1000)
        window.bind("grayCardSet", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 5)
                return "null";
            double v[4] = { 0, 0, 1000, 1000 };
            try { for (int i = 0; i < 4; ++i) v[i] = std::clamp(std::stod(args[i + 1]), 0.0, 1000.0) / 1000.0; }
            catch (...) { return "null"; }
            ColorMatch::Region region;
            region.found = v[2] > v[0] && v[3] > v[1];
            region.x0 = v[0]; region.y0 = v[1]; region.x1 = v[2]; region.y1 = v[3];
            std::lock_guard<std::mutex> lock(cardPick.mutex);
            if (!cardPick.files.count(args[0]) || !region.found)
                return "null";
            cardPick.regions[args[0]] = region;
            return regionJson(args[0], region);
        });

        // grayCardConfirm(skip): o cartão está certo em todas; o Match continua. Com skip = 1, a pessoa
        // desistiu do cartão: o Match segue medindo a foto inteira (como sem o cartão)
        window.bind("grayCardConfirm", [&](const std::string& request) -> std::string
        {
            const auto values = ParseIntArgs(request);
            {
                std::lock_guard<std::mutex> lock(cardPick.mutex);
                cardPick.confirmed = true;
                if (!values.empty() && values[0] != 0)
                    cardPick.skipped = true;
            }
            cardPick.wake.notify_all();
            return "null";
        });

        window.bind("autoMatch", [&](const std::string& request) -> std::string
        {
            const auto values = ParseIntArgs(request);
            const bool grayCard = values.size() > 1 && values[1] != 0;
            // Terceiro valor: o que igualar e o modo revisão, em bits (ver a janela Match automatically no app):
            // 1 exposição (tv/av/exp. comp.), 2 ISO, 4 brilho, 8 balanço de branco, 16 cor, 32 Picture Style,
            // 64 formato, 128 proporção, 256 revisão (as câmeras voltam ao "antes"; o app aplica depois)
            const int flags = values.size() > 2 ? values[2] : 0xFF;
            // Quarto valor (texto): os valores escolhidos no passo 1, "tv=93 av=40 kelvin=5200" (ver csMatchTargets no app)
            std::map<std::string, long long> targets;
            {
                const auto strings = ParseStringArgs(request);
                if (!strings.empty())
                {
                    std::istringstream in(strings[0]);
                    std::string pair;
                    while (in >> pair)
                    {
                        const size_t eq = pair.find('=');
                        if (eq == std::string::npos)
                            continue;
                        try { targets[pair.substr(0, eq)] = std::stoll(pair.substr(eq + 1)); } catch (...) {}
                    }
                }
            }
            SequenceSettings settings;
            settings.countdownSeconds = 0;
            settings.sessionCount = 1;
            settings.downloadWaitSeconds = values.empty() ? 10 : std::max(1, values[0]);
            settings.playSounds = false;
            run("orderPhotos", [&, settings, grayCard, flags, targets]
            {
                if (cameraConnecting())
                    return;
                testCancel = false;
                {
                    std::lock_guard<std::mutex> lock(cardPick.mutex);
                    cardPick.confirmed = false;
                    cardPick.skipped = false;
                    cardPick.regions.clear();
                    cardPick.files.clear();
                }
                MatchDebug debug;
                if (debugMode)
                    debug.Begin(DebugRoot(), grayCard ? "match-graycard" : "match");
                auto shoot = [&](int shot, int shots, const std::string& stage,
                                 std::map<std::string, ColorMatch::Stats>& measured) -> bool
                {
                    if (testCancel)
                        return false;
                    listener.Emit(Json("autoMatchProgress").Add("shot", shot).Add("shots", shots).Add("stage", stage));
                    // Revisão: a primeira foto fica guardada (é o "antes"); as do meio vão embora.
                    // Na primeira foto, tudo o que havia de testes anteriores sai.
                    if ((flags & 256) && shot > 1)
                    {
                        auto old = orderStore.ListSessions();
                        std::sort(old.begin(), old.end(), [](const StoredSession& a, const StoredSession& b) { return a.name < b.name; });
                        for (size_t i = 1; i < old.size(); ++i)
                            orderStore.DeleteSessionNow(old[i].name);
                    }
                    else
                        orderStore.DeleteAll();
                    EnsureSingleShot(controller, singleShotWarned);
                    const std::string previous = controller.GetOutputFolder();
                    controller.SetOutputFolder(orderStore.Root().string());
                    if (fakeCount)
                        fakeRun(settings);  // câmeras simuladas: grava uma foto de teste por câmera (como o Test shot)
                    else
                        controller.RunSequence(settings);
                    controller.SetOutputFolder(previous);
                    const auto sessions = orderStore.ListSessions();
                    if (sessions.empty() || testCancel)
                        return false;
                    // Uma foto por câmera (JPEG quando houver RAW + JPEG); a sessão nova é a mais recente
                    // (a lista vem da mais nova para a mais antiga; no modo revisão a primeira foto fica guardada)
                    const StoredSession& session = sessions.front();
                    std::map<std::string, const StoredPhoto*> picks;
                    for (const auto& p : session.photos)
                        if (!picks.count(p.camera) || IsJpegPhoto(p.file))
                            picks[p.camera] = &p;
                    if (grayCard && shot == 1)
                    {
                        // Acha o cartão em cada foto e espera a pessoa conferir
                        std::string regions = "[";
                        {
                            std::lock_guard<std::mutex> lock(cardPick.mutex);
                            for (const auto& [camera, photo] : picks)
                                if (photo->previewable)
                                {
                                    const auto file = orderStore.Root() / session.name / photo->file;
                                    cardPick.files[camera] = file;
                                    cardPick.regions[camera] = ColorMatch::FindGrayCard(file);
                                    regions += (regions.size() > 1 ? "," : "") + regionJson(camera, cardPick.regions[camera]);
                                }
                        }
                        listener.Emit(Json("grayCardPick").Raw("sessions", SessionsJson(orderStore)).Raw("regions", regions + "]"));
                        std::unique_lock<std::mutex> lock(cardPick.mutex);
                        while (!cardPick.confirmed && !testCancel)
                        {
                            cardPick.wake.wait_for(lock, std::chrono::milliseconds(200));
                        }
                        if (testCancel)
                            return false;
                        for (const auto& [camera, r] : cardPick.regions)
                            debug.Line("Gray card " + camera + ": " + (r.found ? std::to_string(r.x0).substr(0, 5) + "," + std::to_string(r.y0).substr(0, 5)
                                                                        + " to " + std::to_string(r.x1).substr(0, 5) + "," + std::to_string(r.y1).substr(0, 5)
                                                                      : std::string("not marked")));
                    }
                    for (const auto& [camera, photo] : picks)
                        if (photo->previewable)
                        {
                            const auto file = orderStore.Root() / session.name / photo->file;
                            if (!grayCard || cardPick.skipped)
                                measured[camera] = ColorMatch::Measure(file);
                            else
                            {
                                std::lock_guard<std::mutex> lock(cardPick.mutex);
                                const auto it = cardPick.regions.find(camera);
                                if (it != cardPick.regions.end())
                                    measured[camera] = ColorMatch::Measure(file, &it->second);
                            }
                        }
                    if (debug.Active())
                        debug.Shot(shot, stage, DebugPhotos(controller, orderStore, session, &measured));
                    return true;
                };
                auto trace = [&](const std::string& line)
                {
                    debug.Line(line);
                    Log("[match] " + line);
                };
                AutoMatch::Options options;
                options.grayCard = grayCard;
                options.chartFile = ChartCalibrationFile();
                options.exposure = flags & 1;
                options.iso = flags & 2;
                options.brightness = flags & 4;
                options.whiteBalance = flags & 8;
                options.color = flags & 16;
                options.style = flags & 32;
                options.format = flags & 64;
                options.aspect = flags & 128;
                options.review = flags & 256;
                options.targets = targets;
                options.grayCardSkipped = &cardPick.skipped;
                const AutoMatch::Result result = AutoMatch::Run(controller, shoot, CalibrationFile(), [&] { return testCancel.load(); }, options,
                                                                debug.Active() ? std::function<void(const std::string&)>(trace) : nullptr);
                if (debug.Active())
                {
                    debug.Line(result.cancelled ? "Result: cancelled" : result.ok ? "Result: done" : "Result: " + result.error);
                    for (const auto& change : result.changes)
                        for (const auto& item : change.items)
                            debug.Line("  " + change.camera + ": " + item[0] + " " + item[1] + " -> " + item[2]);
                    for (const auto& note : result.notes)
                        debug.Line("  note: " + note);
                    rememberDebugFolder(debug.Folder());
                }

                std::string changes = "[";
                for (size_t i = 0; i < result.changes.size(); ++i)
                {
                    std::string items = "[";
                    for (size_t j = 0; j < result.changes[i].items.size(); ++j)
                    {
                        const auto& item = result.changes[i].items[j];
                        items += (j ? "," : "") + std::string("[") + JsonString(item[0]) + "," + JsonString(item[1]) + ","
                                 + JsonString(item[2]) + "]";
                    }
                    std::string apply = "[";
                    for (size_t j = 0; j < result.changes[i].apply.size(); ++j)
                        apply += (j ? "," : "") + std::string("[") + JsonString(result.changes[i].apply[j].first) + "," + std::to_string(result.changes[i].apply[j].second) + "]";
                    changes += (i ? "," : "") + Json("change").Add("camera", result.changes[i].camera).Raw("items", items + "]").Raw("apply", apply + "]").Str();
                }
                changes += "]";
                std::string notes = "[";
                for (size_t i = 0; i < result.notes.size(); ++i)
                    notes += (i ? "," : "") + JsonString(result.notes[i]);
                notes += "]";
                // Proporção real de cada foto contra a informada pela câmera
                std::string ratios = "[";
                for (size_t i = 0; i < result.ratios.size(); ++i)
                    ratios += (i ? "," : "") + Json("ratio").Add("camera", result.ratios[i].camera).Add("shot", result.ratios[i].shot)
                                                  .Add("reported", result.ratios[i].reported).Add("differs", result.ratios[i].differs).Str();
                ratios += "]";

                listener.Emit(Json("orderPhotos").Raw("sessions", SessionsJson(orderStore)));
                listener.Emit(Json("autoMatchResult").Add("ok", result.ok).Add("matched", result.matched)
                                  .Add("cancelled", result.cancelled).Add("review", (flags & 256) != 0)
                                  .Add("debugFolder", debug.Active() ? PathToUtf8(debug.Folder()) : std::string())
                                  .Add("error", result.error).Raw("changes", changes).Raw("notes", notes).Raw("ratios", ratios));
                EmitCameraSettings(controller, listener, singleShotWarned);
            });
            return "null";
        });

        // openChart(): abre a cartela (PDF) no programa padrão, para imprimir
        window.bind("openChart", [&](const std::string&) -> std::string
        {
            const auto file = Platform::ResourcesDirectory() / "assets" / "chart" / "stillpoint-chart.pdf";
            std::error_code ec;
            const bool ok = std::filesystem::exists(file, ec);
            if (ok)
                Platform::OpenInFileManager(file);
            return Json("chart").Add("ok", ok).Str();
        });

        // chartSetQuad("câmera", x0, y0, x1, y1, x2, y2, x3, y3): a pessoa arrastou os cantos
        // (centros das marcas, de 0 a 1000, na ordem da cartela)
        window.bind("chartSetQuad", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (args.size() < 9)
                return "null";
            Chart::Quad q;
            try
            {
                for (int k = 0; k < 4; ++k)
                {
                    q.x[k] = std::clamp(std::stod(args[1 + 2 * k]), 0.0, 1000.0) / 1000.0;
                    q.y[k] = std::clamp(std::stod(args[2 + 2 * k]), 0.0, 1000.0) / 1000.0;
                }
            }
            catch (...) { return "null"; }
            q.found = true;
            std::lock_guard<std::mutex> lock(cardPick.mutex);
            if (!cardPick.files.count(args[0]))
                return "null";
            cardPick.quads[args[0]] = q;
            return quadJson(args[0], q);
        });

        // chartCalibrate(espera): calibra os modelos com a cartela (auto_match.h,
        // CalibrateChart). Depois da 1ª foto, a pessoa confere os cantos (chartPick).
        // Avisa o andamento (chartProgress) e o resultado (chartResult).
        window.bind("chartCalibrate", [&](const std::string& request) -> std::string
        {
            const auto values = ParseIntArgs(request);
            SequenceSettings settings;
            settings.countdownSeconds = 0;
            settings.sessionCount = 1;
            settings.downloadWaitSeconds = values.empty() ? 10 : std::max(1, values[0]);
            settings.playSounds = false;
            run("orderPhotos", [&, settings]
            {
                if (cameraConnecting())
                    return;
                testCancel = false;
                {
                    std::lock_guard<std::mutex> lock(cardPick.mutex);
                    cardPick.confirmed = false;
                    cardPick.quads.clear();
                    cardPick.files.clear();
                }
                MatchDebug debug;
                if (debugMode)
                    debug.Begin(DebugRoot(), "chart");
                auto shoot = [&](int shot, int shots, const std::string& stage,
                                 std::map<std::string, Chart::Reading>& measured) -> bool
                {
                    if (testCancel)
                        return false;
                    listener.Emit(Json("chartProgress").Add("shot", shot).Add("shots", shots).Add("stage", stage));
                    orderStore.DeleteAll();
                    EnsureSingleShot(controller, singleShotWarned);
                    const std::string previous = controller.GetOutputFolder();
                    controller.SetOutputFolder(orderStore.Root().string());
                    if (fakeCount)
                        fakeRun(settings);  // câmeras simuladas: grava uma foto de teste por câmera (como o Test shot)
                    else
                        controller.RunSequence(settings);
                    controller.SetOutputFolder(previous);
                    const auto sessions = orderStore.ListSessions();
                    if (sessions.empty() || testCancel)
                        return false;
                    const StoredSession& session = sessions.back();
                    std::map<std::string, const StoredPhoto*> picks;
                    for (const auto& p : session.photos)
                        if (!picks.count(p.camera) || IsJpegPhoto(p.file))
                            picks[p.camera] = &p;
                    if (shot == 1)
                    {
                        // Acha a cartela em cada foto e espera a pessoa conferir os cantos
                        std::string quads = "[";
                        {
                            std::lock_guard<std::mutex> lock(cardPick.mutex);
                            for (const auto& [camera, photo] : picks)
                                if (photo->previewable)
                                {
                                    const auto file = orderStore.Root() / session.name / photo->file;
                                    cardPick.files[camera] = file;
                                    cardPick.quads[camera] = Chart::Find(file);
                                    quads += (quads.size() > 1 ? "," : "") + quadJson(camera, cardPick.quads[camera]);
                                }
                        }
                        listener.Emit(Json("chartPick").Raw("sessions", SessionsJson(orderStore)).Raw("quads", quads + "]"));
                        std::unique_lock<std::mutex> lock(cardPick.mutex);
                        while (!cardPick.confirmed && !testCancel)
                        {
                            cardPick.wake.wait_for(lock, std::chrono::milliseconds(200));
                        }
                        if (testCancel)
                            return false;
                    }
                    for (const auto& [camera, photo] : picks)
                        if (photo->previewable)
                        {
                            std::lock_guard<std::mutex> lock(cardPick.mutex);
                            const auto it = cardPick.quads.find(camera);
                            if (it == cardPick.quads.end() || !it->second.found)
                            {
                                Chart::Reading none;
                                none.problem = "the chart corners were not marked";
                                measured[camera] = none;
                            }
                            else
                                measured[camera] = Chart::Measure(orderStore.Root() / session.name / photo->file, it->second);
                        }
                    if (debug.Active())
                        debug.Shot(shot, stage, DebugPhotos(controller, orderStore, session, nullptr));
                    return true;
                };
                auto trace = [&](const std::string& line)
                {
                    debug.Line(line);
                    Log("[chart] " + line);
                };
                const AutoMatch::ChartResult result = AutoMatch::CalibrateChart(
                    controller, shoot, ChartCalibrationFile(), [&] { return testCancel.load(); },
                    debug.Active() ? std::function<void(const std::string&)>(trace) : nullptr);
                if (debug.Active())
                {
                    debug.Line(result.cancelled ? "Result: cancelled" : result.ok ? "Result: done" : "Result: " + result.error);
                    for (const auto& line : result.models)
                        debug.Line("  " + line);
                    for (const auto& note : result.notes)
                        debug.Line("  note: " + note);
                    rememberDebugFolder(debug.Folder());
                }
                auto list = [](const std::vector<std::string>& items)
                {
                    std::string out = "[";
                    for (size_t i = 0; i < items.size(); ++i)
                        out += (i ? "," : "") + JsonString(items[i]);
                    return out + "]";
                };
                listener.Emit(Json("orderPhotos").Raw("sessions", SessionsJson(orderStore)));
                listener.Emit(Json("chartResult").Add("ok", result.ok).Add("cancelled", result.cancelled)
                                  .Add("debugFolder", debug.Active() ? PathToUtf8(debug.Folder()) : std::string())
                                  .Add("error", result.error).Raw("models", list(result.models)).Raw("notes", list(result.notes)));
                EmitCameraSettings(controller, listener, singleShotWarned);
            });
            return "null";
        });

        // setOrder(["SL3_1", "T7_1", ...]): nova ordem completa
        window.bind("setOrder", [&](const std::string& request) -> std::string
        {
            const auto names = ParseStringArgs(request);
            run("reorder", [&, names] { controller.SetCameraOrder(names); });
            return "null";
        });

        window.bind("discardOrderPhotos", [&](const std::string&) -> std::string
        {
            previews.Post([&] { orderStore.DeleteAll(); });
            return "null";
        });

        // saveSessions(exitAfter): escolhe a pasta e move todas as sessões para lá
        // saveSessions("exit" ou "", "delete" ou "", sessão, sessão...): salva as sessões
        // escolhidas (nenhuma = todas). "exit" fecha o app depois; "delete" apaga as
        // sessões que não foram escolhidas, só se o salvamento deu certo.
        window.bind("saveSessions", [&](const std::string& request) -> std::string
        {
            auto args = ParseStringArgs(request);
            const bool exitAfter = !args.empty() && args[0] == "exit";
            const bool deleteRest = args.size() > 1 && args[1] == "delete";
            const std::vector<std::string> names(args.begin() + std::min<size_t>(args.size(), 2), args.end());
            const std::string folder = NativeWindow::ChooseFolder("Choose where to export your bullet time sessions");
            if (folder.empty())
            {
                listener.Emit(Json("saveCancelled"));
                return "null";
            }

            listener.Emit(Json("saving").Add("folder", folder));
            previews.Post([&, folder, exitAfter, deleteRest, names]
            {
                std::string error;
                std::vector<std::filesystem::path> savedTo;
                const int moved = store.SaveSessions(folder, names, error, &savedTo);
                // Mostra o resultado: uma sessão -> a pasta dela; várias -> a pasta escolhida
                if (moved > 0)
                    Platform::OpenInFileManager(moved == 1 && savedTo.size() == 1 ? savedTo.front()
                                                                                   : std::filesystem::path(folder));
                if (error.empty() && deleteRest && !names.empty())
                    for (const auto& session : store.ListSessions())
                        if (std::find(names.begin(), names.end(), session.name) == names.end())
                            store.DeleteSessionNow(session.name);
                listener.Emit(Json("saved").Add("count", moved).Add("folder", folder).Add("error", error));
                emitSessions();
                if (exitAfter && error.empty())
                    window.dispatch([&] { closeNow(); });
            });
            return "null";
        });

        // --- Exportação: fotos convertidas ou sequência ---
        // exportFormats() -> formatos de foto que este computador não grava, com o motivo
        window.bind("exportFormats", [&](const std::string&) -> std::string
        {
            std::string reason;
            const bool heic = Export::FormatAvailable("heic", reason);
            return Json("formats").Add("heic", heic).Add("heicReason", reason).Str();
        });

        std::atomic<bool> exportCancel{ false };
        window.bind("cancelExport", [&](const std::string&) -> std::string
        {
            exportCancel = true;
            return "null";
        });

        // Uma sessão a salvar: nome final da pasta + o que salvar
        struct ExportJob
        {
            std::string session;              // pasta da sessão dentro do app
            std::string folderName;           // nome final (data, número ou nome dado)
            bool useEdited = false;           // Project: usar a versão editada quando houver
            bool sequence = false;
            bool lenticular = false;          // etapa 19: imagem entrelaçada para lâmina lenticular (TIFF)
            Export::LenticularOptions lent;
            double lentNominal = 0;           // LPI da embalagem (lent.lpi é o usado: o medido, se houver)
            std::string photoFormat;          // "original", "jpg"... ("" = não salvar fotos)
            Export::Quality photoQuality = Export::Quality::High;
            Export::SequenceOptions options;
            // Parte 4 da Proporção: recorte da sessão (Converted e Sequence; os originais não mudam) e
            // "Same size for all photos" (Converted reduzidas ao tamanho da menor câmera)
            Export::Framing framing;
            bool sameSize = false;
        };

        // Salvamento de fato (na fila de prévias). replace: apaga o que havia dentro da
        // pasta que já existe com o mesmo nome e grava só o desta exportação.
        std::function<void(bool)> pendingExport;
        auto startExport = [&](const std::string& folder, bool exitAfter, bool deleteRest, std::vector<ExportJob> jobs, bool replace)
        {
            exportCancel = false;
            listener.Emit(Json("saving").Add("folder", folder));
            previews.Post([&, folder, exitAfter, deleteRest, jobs, replace]
            {
                namespace fs = std::filesystem;
                std::string error;
                std::vector<fs::path> savedTo;
                std::vector<std::string> names, savedNames;
                const auto stored = store.ListSessions();
                int done = 0;
                static const std::regex shortName(R"(^(\d+_[^_]+_\d+)_.+$)");
                for (size_t index = 0; index < jobs.size() && error.empty(); ++index)
                {
                    const ExportJob& job = jobs[index];
                    names.push_back(job.session);
                    auto session = std::find_if(stored.begin(), stored.end(), [&](const StoredSession& s) { return s.name == job.session; });
                    if (session == stored.end())
                        continue;
                    auto report = [&](double fraction, const std::string& step)
                    {
                        listener.Emit(Json("exportProgress").Add("session", job.session).Add("index", static_cast<int>(index))
                                          .Add("total", static_cast<int>(jobs.size())).Add("step", step).Add("fraction", fraction));
                    };
                    const fs::path source = store.SessionDir(job.session);
                    if (source.empty())
                        continue;
                    // Project: a foto editada (Edited/<sessão>/) no lugar do original, quando pedido
                    auto photoPath = [&](const std::string& file) -> fs::path
                    {
                        // Segue a etiqueta "Edited n / m" da sessão (ligada: as editadas; desligada: os originais)
                        if (session->showEdited && session->inProject)
                        {
                            const fs::path edited = store.EditedFile(job.session, file);
                            if (!edited.empty())
                                return edited;
                        }
                        return source / file;
                    };
                    if (session->inProject && session->edited > 0)
                        Log("Export " + job.session + ": " + (session->showEdited ? std::to_string(session->edited) + " edited photo" + (session->edited == 1 ? "" : "s") + " used (from the project's Edited folder)"
                                                                                  : std::string("edited photos off (Edited tag), originals used")));
                    std::error_code ec;
                    fs::path target = fs::path(folder) / job.folderName;
                    for (int n = 2; !replace && fs::exists(target, ec); ++n)
                        target = fs::path(folder) / (job.folderName + " (" + std::to_string(n) + ")");
                    if (replace && fs::exists(target, ec))
                    {
                        // Nunca apaga a pasta de dados do app (onde as fotos da sessão estão)
                        const fs::path root = fs::weakly_canonical(store.Root(), ec);
                        const fs::path old = fs::weakly_canonical(target, ec);
                        const auto inside = [](const fs::path& child, const fs::path& parent)
                        {
                            auto c = child.begin();
                            for (auto p = parent.begin(); p != parent.end(); ++p, ++c)
                                if (c == child.end() || *c != *p)
                                    return false;
                            return true;
                        };
                        if (inside(root, old) || inside(old, root))
                        {
                            error = "Could not replace " + target.filename().string() + ": it is the app's own photo folder.";
                            break;
                        }
                        if (!fs::is_directory(target, ec))
                            fs::remove(target, ec);
                        else
                            for (const auto& entry : fs::directory_iterator(target, ec))
                            {
                                std::error_code removeError;
                                fs::remove_all(entry.path(), removeError);
                                if (removeError && error.empty())
                                    error = "Could not delete " + entry.path().filename().string() + " in "
                                            + target.filename().string() + " (it may be open in another app).";
                            }
                        if (!error.empty())
                            break;
                    }
                    fs::create_directories(target, ec);

                    // Uma foto por câmera para converter e para a sequência (RAW + JPG: o JPG)
                    std::map<std::string, std::string> byCamera;
                    for (const auto& photo : session->photos)
                    {
                        if (!photo.previewable)
                            continue;
                        const std::string group = std::to_string(1000 + photo.order) + photo.camera;
                        if (!byCamera.count(group) || IsJpegPhoto(photo.file))
                            byCamera[group] = photo.file;
                    }
                    std::vector<std::string> perCamera;
                    for (const auto& [group, file] : byCamera)
                        perCamera.push_back(file);
                    // Canvas e alinhamento (pedaço 2 do Framing): uma transformação por foto, na ordem de perCamera (as que a
                    // pessoa não mexeu ficam centradas, no menor tamanho que cobre o canvas), e o canvas calculado a partir
                    // do tamanho real de cada foto. Sem tamanho de alguma foto, cai no recorte simples de cada foto.
                    Export::Framing framing = job.framing;
                    if (!perCamera.empty())
                    {
                        const auto aligns = Export::ParseAlign(session->align);
                        std::vector<std::pair<int, int>> sizes;
                        bool allSizes = true;
                        for (const auto& f : perCamera)
                        {
                            auto it = aligns.find(f);
                            framing.align.push_back(it == aligns.end() ? Export::Align() : it->second);
                            int w = 0, h = 0;
                            if (exportCancel) break;
                            // O canvas sai das originais. A editada (do Lightroom) já vem com o recorte e o alinhamento
                            // que foram junto no "Edit in Lightroom Classic": não é transformada de novo.
                            if (!Export::PhotoSize(source / f, w, h)) { w = 0; h = 0; allSizes = false; }
                            if (photoPath(f) != source / f) framing.align.back().framed = true;
                            sizes.push_back({ w, h });
                        }
                        // "As shot" (decisão do dono, 2026-11-04, revista no mesmo dia): numa sessão com proporções
                        // misturadas cada foto sai como é, mesmo com alinhamento guardado (alinhar exige uma proporção);
                        // numa sessão toda na mesma forma, o alinhamento vale e o canvas é a parte comum às fotos.
                        bool sameShape = allSizes && !sizes.empty() && sizes[0].second > 0;
                        for (const auto& sz : sizes)
                            if (!sameShape || sz.second <= 0 ||
                                std::abs(static_cast<double>(sz.first) / sz.second - static_cast<double>(sizes[0].first) / sizes[0].second) > 0.02)
                                sameShape = false;
                        if (!framing.Active() && (!sameShape || !framing.Aligned()))
                            framing.align.clear();
                        else if (!allSizes || !Export::ComputeCommonFrame(framing, sizes))
                            framing.align.clear();
                    }
                    // Subpastas quando há mais de uma saída: Photos/, Sequence/ e Lenticular/
                    const bool savePhotos = !job.photoFormat.empty();
                    const bool saveSequence = job.sequence && !job.options.formats.empty();
                    const bool split = (savePhotos ? 1 : 0) + (saveSequence ? 1 : 0) + (job.lenticular ? 1 : 0) > 1;
                    const fs::path photosDir = split ? target / "Photos" : target;

                    if (saveSequence)
                    {
                        std::vector<fs::path> photos;
                        for (const auto& f : perCamera)
                            photos.push_back(photoPath(f));
                        for (const auto& format : job.options.formats)
                        {
                            Export::SequenceOptions one = job.options;
                            one.formats = { format };
                            one.framing = framing;
                            const fs::path dir = split ? target / "Sequence" : target;
                            fs::create_directories(dir, ec);
                            if (!Export::WriteSequence(photos, dir / job.folderName, one, report, &exportCancel, error))
                                break;
                        }
                        if (!error.empty())
                            break;
                    }

                    if (job.lenticular)
                    {
                        std::vector<fs::path> photos;
                        for (const auto& f : perCamera)
                            photos.push_back(photoPath(f));
                        // Nome com os parâmetros, para saber que lâmina/impressora o arquivo serve
                        char tag[96];
                        std::snprintf(tag, sizeof(tag), " lenticular %.4glpi %ddpi %s", job.lent.lpi, job.lent.dpi, job.lent.horizontalLenses ? "flip" : "3d");
                        const fs::path lentDir = split ? target / "Lenticular" : target;
                        fs::create_directories(lentDir, ec);
                        // Configurações em texto (dentro do TIFF e num .txt ao lado): para reimprimir
                        // ou conferir depois, mesmo sem o app
                        Export::LenticularOptions lent = job.lent;
                        lent.framing = framing;
                        {
                            const Export::LenticularInfo info = Export::LenticularPlan(lent, static_cast<int>(photos.size()));
                            const double nominal = job.lentNominal > 0 ? job.lentNominal : lent.lpi;
                            const bool measured = std::fabs(nominal - lent.lpi) > 1e-6;
                            const std::time_t now = std::time(nullptr);
                            char when[32];
                            std::strftime(when, sizeof(when), "%Y-%m-%d %H:%M", std::localtime(&now));
                            char line[512];
                            std::string t = "Stillpoint lenticular print\n";
                            t += "Session: " + job.folderName + " (" + job.session + ")\n";
                            t += std::string("Saved: ") + when + " with Stillpoint " + AppVersion() + "\n\n";
                            std::snprintf(line, sizeof(line), "Lens sheet: %.4g LPI on the package%s\n", nominal,
                                          measured ? "" : " (no measured pitch: the package value was used)");
                            t += line;
                            if (measured) { std::snprintf(line, sizeof(line), "Measured pitch (used): %.4g LPI\n", lent.lpi); t += line; }
                            std::snprintf(line, sizeof(line), "Printer: %d dpi\n", lent.dpi); t += line;
                            std::snprintf(line, sizeof(line), "Print size: %.4g x %.4g cm (%.3g x %.3g in), %d x %d px\n",
                                          lent.widthInches * 2.54, lent.heightInches * 2.54, lent.widthInches, lent.heightInches, info.width, info.height);
                            t += line;
                            t += std::string("Effect: ") + (lent.horizontalLenses ? "Animation (tilt up and down; lens strips horizontal)" : "3D (left and right; lens strips vertical)") + "\n";
                            std::snprintf(line, sizeof(line), "Photos: %d, %s order\n", static_cast<int>(photos.size()), lent.reverse ? "reversed" : "normal");
                            t += line;
                            for (size_t i = 0; i < photos.size(); ++i)
                                t += "  " + std::to_string(i + 1) + ". " + photos[i].filename().string() + "\n";
                            std::snprintf(line, sizeof(line), "Columns per lens: %.3f; printer dots per photo: %.2f\n", info.columnsPerLens, info.pixelsPerPhoto);
                            t += line;
                            std::string marks;
                            if (lent.cropMarks) marks += "crop marks";
                            if (lent.alignMarks) marks += std::string(marks.empty() ? "" : ", ") + "alignment marks";
                            std::snprintf(line, sizeof(line), "Marks: %s; bleed %.3g mm; file %d x %d px\n", marks.empty() ? "none" : marks.c_str(),
                                          lent.bleedInches * 25.4, info.fileWidth, info.fileHeight);
                            t += line;
                            if (lent.fit) t += std::string("Placement: Fit (whole photo, ") + (lent.whiteBand ? "white" : "black") + " band)\n";
                            else { std::snprintf(line, sizeof(line), "Placement: Fill (crop at %.0f%% across, %.0f%% down)\n", lent.posX * 100, lent.posY * 100); t += line; }
                            if (framing.Aligned())
                            {
                                std::snprintf(line, sizeof(line), "Alignment: photos aligned in Stillpoint (canvas %d x %d px)\n",
                                              static_cast<int>(std::lround(framing.commonW)), static_cast<int>(std::lround(framing.commonH)));
                                t += line;
                            }
                            t += "\nPrint at 100% (actual size), never \"fit to page\": the file already has the right size and dpi.\n";
                            lent.description = t;
                        }
                        if (!Export::WriteLenticular(photos, lentDir / (job.folderName + tag), lent, report, &exportCancel, error))
                            break;
                    }

                    if (savePhotos)
                    {
                        // photoFormat pode ser uma lista (2.14): "original", "jpg" ou "original,jpg" —
                        // os originais e/ou uma cópia convertida; com os dois, cada um na sua subpasta
                        // (Photos/Originals/ e Photos/JPG/)
                        std::vector<std::string> photoFormats;
                        std::stringstream formatList(job.photoFormat);
                        for (std::string x; std::getline(formatList, x, ',');)
                            if (!x.empty()) photoFormats.push_back(x);
                        for (const std::string& photoFormat : photoFormats)
                        {
                        const bool original = photoFormat == "original";
                        std::string upper = photoFormat;
                        for (char& c : upper) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
                        const fs::path formatDir = photoFormats.size() > 1 ? photosDir / (original ? std::string("Originals") : upper) : photosDir;
                        fs::create_directories(formatDir, ec);
                        // Nome curto: "01_SL3_1_IMG_4821.JPG" -> "01_SL3_1.JPG" (repetido: "-2")
                        std::map<std::string, int> used;
                        auto shortStem = [&](const std::string& file, const std::string& ext)
                        {
                            std::smatch m;
                            const std::string stem = fs::path(file).stem().string();
                            std::string base = std::regex_match(file, m, shortName) ? m[1].str() : stem;
                            std::string key = base + ext;
                            for (char& c : key) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
                            const int n = ++used[key];
                            return n == 1 ? base : base + "-" + std::to_string(n);
                        };
                        std::set<std::string> copiedEdits;  // RAW e JPG da mesma câmera têm uma editada só
                        std::vector<std::string> files;
                        if (original)
                        {
                            for (const auto& photo : session->photos)
                                files.push_back(photo.file);
                        }
                        else
                            files = perCamera;
                        // Same size: o tamanho da menor foto depois do recorte (todas na mesma proporção)
                        int targetW = 0, targetH = 0;
                        if (!original && job.sameSize)
                        {
                            long long bestArea = -1;
                            for (const auto& f : files)
                            {
                                if (exportCancel) break;
                                int w = 0, h = 0;
                                if (framing.Canvas()) { w = static_cast<int>(std::lround(framing.commonW)); h = static_cast<int>(std::lround(framing.commonH)); }
                                else if (!Export::PhotoSize(photoPath(f), w, h)) continue;
                                // O recorte dessa foto na proporção e na orientação escolhidas; depois, deitado (como sempre)
                                const double t = Export::RatioTarget(job.framing.ratio, w, h);
                                int cw = w, ch = h;
                                if (t > 0 && cw > 0 && ch > 0)
                                {
                                    if (static_cast<double>(cw) / ch > t) cw = static_cast<int>(std::lround(ch * t));
                                    else ch = static_cast<int>(std::lround(cw / t));
                                }
                                if (cw < ch) std::swap(cw, ch);
                                const long long area = static_cast<long long>(cw) * ch;
                                if (bestArea < 0 || area < bestArea) { bestArea = area; targetW = cw; targetH = ch; }
                            }
                        }
                        for (size_t i = 0; i < files.size() && error.empty(); ++i)
                        {
                            if (exportCancel) { error = "cancelled"; break; }
                            report(static_cast<double>(i) / files.size(), original ? "photos-save" : photoFormat);
                            // "Keep the originals": sempre o arquivo que a câmera mandou, nunca a editada
                            const fs::path from = original ? source / files[i] : photoPath(files[i]);
                            if (original)
                            {
                                const std::string ext = from.extension().string();
                                const fs::path to = formatDir / (shortStem(files[i], ext) + ext);
                                std::error_code moveError;
                                fs::remove(to, moveError);
                                moveError.clear();
                                fs::copy_file(from, to, fs::copy_options::overwrite_existing, moveError);
                                if (moveError)
                                    error = "Could not save " + to.filename().string() + ": " + moveError.message();
                                // Só os originais (sem Converted) e a sessão com editadas ligadas: as editadas vão
                                // numa subpasta Edited/ ao lado dos originais (decisão do dono, 2026-11-06)
                                const fs::path edited = photoFormats.size() == 1 && session->inProject && session->showEdited
                                    ? store.EditedFile(job.session, files[i]) : fs::path();
                                if (error.empty() && !edited.empty() && !copiedEdits.count(edited.string()))
                                {
                                    copiedEdits.insert(edited.string());
                                    std::smatch m;
                                    const std::string stem = fs::path(files[i]).stem().string();
                                    const std::string base = std::regex_match(files[i], m, shortName) ? m[1].str() : stem;
                                    const fs::path editedDir = formatDir / "Edited";
                                    fs::create_directories(editedDir, moveError);
                                    const fs::path editedTo = editedDir / (base + edited.extension().string());
                                    moveError.clear();
                                    fs::copy_file(edited, editedTo, fs::copy_options::overwrite_existing, moveError);
                                    if (moveError)
                                        error = "Could not save " + editedTo.filename().string() + ": " + moveError.message();
                                }
                            }
                            else
                                Export::ConvertPhoto(from, formatDir / shortStem(files[i], "." + photoFormat), photoFormat,
                                                     job.photoQuality, error, framing, targetW, targetH, i);
                        }
                        if (!error.empty())
                            break;
                        }
                        if (!error.empty())
                            break;
                    }
                    // Tudo salvo. Sessão do Project: fica onde está (exportar não a tira de lá).
                    // Fora do Project: fechando o app, a sessão sai; senão a pessoa escolhe
                    // depois se descarta ou mantém (pergunta na tela)
                    if (session->inProject)
                        ;
                    else if (exitAfter)
                        store.DeleteSessionNow(job.session);  // já salva em outro lugar: não ocupa a lixeira
                    else
                    {
                        store.MarkSaved(job.session);  // mantida: não conta como "não salva"
                        savedNames.push_back(job.session);
                    }
                    savedTo.push_back(target);
                    ++done;
                    report(1.0, "done");
                }
                if (error == "cancelled")
                    error = "The export was cancelled. The sessions that were not exported are still in the app.";
                if (done > 0)
                    Platform::OpenInFileManager(done == 1 ? savedTo.front() : std::filesystem::path(folder));
                if (error.empty() && deleteRest)
                    for (const auto& session : store.ListSessions())
                        if (!session.inProject && std::find(names.begin(), names.end(), session.name) == names.end())
                            store.DeleteSessionNow(session.name);
                if (!error.empty())
                    Log("Save sessions: " + error);
                std::string saved = "[";
                for (const auto& name : savedNames)
                    saved += (saved.size() > 1 ? "," : "") + JsonString(name);
                listener.Emit(Json("saved").Add("count", done).Add("folder", folder).Add("error", error).Raw("sessions", saved + "]"));
                emitSessions();
                if (exitAfter && error.empty())
                    window.dispatch([&] { closeNow(); });
            });
        };

        // resolveExportConflict("both" | "replace" | "cancel")
        window.bind("resolveExportConflict", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            auto run = pendingExport;
            pendingExport = nullptr;
            if (!run || args.empty() || args[0] == "cancel")
                listener.Emit(Json("saveCancelled"));
            else
                run(args[0] == "replace");
            return "null";
        });

        // exportSessions("exit" ou "", "delete" ou "", especificação, ...). Cada sessão:
        //   "sessão|nome|texto|data 0/1|before ou after|photos|formato"
        //   "sessão|nome|texto|data 0/1|before ou after|sequence|mp4,gif|fps|loops|reverse 0/1|altura|fotos 0/1"
        // nome: "date" (data e hora), "number" (01, 02... continuando os da pasta) ou "custom"
        window.bind("exportSessions", [&](const std::string& request) -> std::string
        {
            namespace fs = std::filesystem;
            auto args = ParseStringArgs(request);
            const bool exitAfter = !args.empty() && args[0] == "exit";
            // args[0] "project": sessões do Project, direto para <Project>/Exports (sem perguntar a pasta)
            const bool toProjectExports = !args.empty() && args[0] == "project" && project.Available();
            // args[1]: "delete" (apaga as sessões não salvas que ficaram) e/ou "edited" (usar as editadas)
            const bool deleteRest = args.size() > 1 && args[1].find("delete") != std::string::npos;
            const bool useEdited = args.size() > 1 && args[1].find("edited") != std::string::npos;
            // "dest" (2.14): args[2] é a pasta escolhida ("" = a padrão) e as sessões vêm depois
            const bool withDest = args.size() > 1 && args[1].find("dest") != std::string::npos;
            const std::string destArg = withDest && args.size() > 2 ? args[2] : std::string();
            struct Naming { std::string kind, text; bool date = true; bool before = false; };
            std::vector<ExportJob> jobs;
            std::vector<Naming> namings;
            for (size_t i = withDest ? 3 : 2; i < args.size(); ++i)
            {
                std::vector<std::string> f;
                std::stringstream text(args[i]);
                for (std::string field; std::getline(text, field, '|');)
                    f.push_back(field);
                if (f.size() < 7)
                    continue;
                ExportJob job;
                job.session = f[0];
                Naming naming{ f[1], f[2], f[3] == "1", f[4] == "before" };
                job.sequence = f[5] == "sequence";
                job.lenticular = f[5] == "lenticular";
                if (f[5] == "outputs")
                {
                    // 2.14 (opção A): as três saídas numa linha —
                    // 6 fotos formato ("" = não) | 7 qualidade | 8 formatos da sequência ("" = não) |
                    // 9 fps | 10 loops | 11 reverse | 12 altura | 13 qualidade | 14 lenticular 1/0 |
                    // 15 lpi | 16 dpi | 17 largura pol | 18 altura pol | 19 flip/3d | 20 reverse
                    auto at = [&](size_t k) { return k < f.size() ? f[k] : std::string(); };
                    job.photoFormat = at(6);
                    job.photoQuality = Export::ParseQuality(at(7));
                    std::stringstream formats(at(8));
                    for (std::string x; std::getline(formats, x, ',');)
                        if (!x.empty()) job.options.formats.push_back(x);
                    job.sequence = !job.options.formats.empty();
                    try
                    {
                        if (!at(9).empty()) job.options.fps = std::stod(at(9));
                        if (!at(10).empty()) job.options.loops = std::stoi(at(10));
                        if (!at(12).empty()) job.options.height = std::stoi(at(12));
                        if (!at(15).empty()) job.lent.lpi = std::stod(at(15));
                        if (!at(16).empty()) job.lent.dpi = std::stoi(at(16));
                        if (!at(17).empty()) job.lent.widthInches = std::stod(at(17));
                        if (!at(18).empty()) job.lent.heightInches = std::stod(at(18));
                    }
                    catch (...) {}
                    job.options.reverse = at(11) != "0";
                    job.options.quality = Export::ParseQuality(at(13));
                    job.lenticular = at(14) == "1";
                    job.lent.horizontalLenses = at(19) != "3d";
                    job.lent.reverse = at(20) == "1";
                    // Entrega 2: 21 marcas de corte 1/0 | 22 marcas de alinhamento 1/0 | 23 sangria em mm
                    job.lentNominal = at(24).empty() ? 0 : std::atof(at(24).c_str());
                    job.lent.cropMarks = at(21) == "1";
                    job.lent.alignMarks = at(22) == "1";
                    try { if (!at(23).empty()) job.lent.bleedInches = std::max(0.0, std::stod(at(23))) / 25.4; } catch (...) {}
                    // Parte 4 da Proporção: 25 proporção (asshot|3:2|4:3|16:9|1:1) | 26 posição x | 27 posição y |
                    // 28 same size 1/0 | 29 placement fill|fit | 30 faixa black|white
                    job.framing.ratio = at(25);
                    try
                    {
                        if (!at(26).empty()) job.framing.posX = std::clamp(std::stod(at(26)), 0.0, 1.0);
                        if (!at(27).empty()) job.framing.posY = std::clamp(std::stod(at(27)), 0.0, 1.0);
                    }
                    catch (...) {}
                    job.sameSize = at(28) == "1";
                    job.options.framing = job.framing;
                    job.lent.fit = at(29) == "fit";
                    job.lent.whiteBand = at(30) == "white";
                    job.lent.posX = job.framing.posX;
                    job.lent.posY = job.framing.posY;
                }
                else if (job.lenticular)
                {
                    // lpi | dpi | largura pol | altura pol | flip|3d | reverse
                    try
                    {
                        job.lent.lpi = std::stod(f[6]);
                        job.lent.dpi = f.size() > 7 ? std::stoi(f[7]) : 720;
                        job.lent.widthInches = f.size() > 8 ? std::stod(f[8]) : 6;
                        job.lent.heightInches = f.size() > 9 ? std::stod(f[9]) : 4;
                    }
                    catch (...) {}
                    job.lent.horizontalLenses = !(f.size() > 10 && f[10] == "3d");
                    job.lent.reverse = f.size() > 11 && f[11] == "1";
                }
                else if (job.sequence)
                {
                    std::stringstream formats(f[6]);
                    for (std::string x; std::getline(formats, x, ',');)
                        if (!x.empty()) job.options.formats.push_back(x);
                    try
                    {
                        job.options.fps = f.size() > 7 ? std::stod(f[7]) : 6;
                        job.options.loops = f.size() > 8 ? std::stoi(f[8]) : 3;
                        job.options.height = f.size() > 10 ? std::stoi(f[10]) : 1080;
                    }
                    catch (...) {}
                    job.options.reverse = f.size() <= 9 || f[9] == "1";
                    job.photoFormat = (f.size() > 11 && f[11] == "1") ? "original" : "";
                    job.options.quality = Export::ParseQuality(f.size() > 12 ? f[12] : "");
                }
                else
                {
                    job.photoFormat = f[6];
                    job.photoQuality = Export::ParseQuality(f.size() > 7 ? f[7] : "");
                }
                job.useEdited = useEdited;
                jobs.push_back(job);
                namings.push_back(naming);
            }
            if (jobs.empty())
                return "null";
            std::string folder;
            if (withDest)
            {
                // Sem perguntar: a pasta escolhida na janela ou a padrão (criada se preciso)
                std::error_code ec;
                const fs::path target = destArg.empty() ? defaultExportFolder() : fs::path(destArg);
                fs::create_directories(target, ec);
                if (fs::is_directory(target, ec))
                    folder = target.string();
                else
                {
                    listener.Emit(Json("exportFolderError").Add("error", "Could not use the folder " + target.string() + ". Choose another folder."));
                    listener.Emit(Json("saveCancelled"));
                    return "null";
                }
            }
            else if (toProjectExports)
            {
                std::error_code ec;
                fs::create_directories(project.Exports(), ec);
                folder = project.Exports().string();
            }
            else
                folder = NativeWindow::ChooseFolder("Choose where to export your bullet time sessions");
            if (folder.empty())
            {
                listener.Emit(Json("saveCancelled"));
                return "null";
            }

            // Nomes finais. Data: "2026-10-14 16.31.00". Sem caracteres que o sistema não aceita.
            auto clean = [](std::string s)
            {
                for (char& c : s)
                    if (std::string("/\\:*?\"<>|").find(c) != std::string::npos || static_cast<unsigned char>(c) < 32)
                        c = '-';
                while (!s.empty() && (s.back() == ' ' || s.back() == '.')) s.pop_back();
                while (!s.empty() && s.front() == ' ') s.erase(s.begin());
                return s;
            };
            auto dateOf = [](const std::string& session)
            {
                static const std::regex pattern(R"(^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2}))");
                std::smatch m;
                return std::regex_search(session, m, pattern) ? m[1].str() + " " + m[2].str() + "." + m[3].str() + "." + m[4].str() : session;
            };
            // Próximo número livre para "base NN" (ou só "NN") na pasta escolhida
            std::map<std::string, int> nextNumber;
            auto numberFor = [&](const std::string& base)
            {
                if (!nextNumber.count(base))
                {
                    int highest = 0;
                    const std::regex pattern("^" + std::regex_replace(base, std::regex(R"([.^$|()\[\]{}*+?\\])"), R"(\$&)")
                                             + (base.empty() ? "" : " ") + R"((\d+)$)");
                    std::error_code ec;
                    for (const auto& entry : fs::directory_iterator(folder, ec))
                    {
                        std::smatch m;
                        const std::string existingName = entry.path().filename().string();
                        if (std::regex_match(existingName, m, pattern))
                            highest = std::max(highest, std::atoi(m[1].str().c_str()));
                    }
                    nextNumber[base] = highest + 1;
                }
                char digits[16];
                std::snprintf(digits, sizeof(digits), "%02d", nextNumber[base]++);
                return base.empty() ? std::string(digits) : base + " " + digits;
            };
            std::map<std::string, int> sameText;
            for (const auto& n : namings)
                if (n.kind == "custom" && !n.date)
                    ++sameText[clean(n.text)];
            for (size_t i = 0; i < jobs.size(); ++i)
            {
                const Naming& n = namings[i];
                const std::string text = clean(n.text);
                const std::string date = dateOf(jobs[i].session);
                if (n.kind == "number")
                    jobs[i].folderName = numberFor("");
                else if (n.kind == "custom" && !text.empty())
                {
                    if (n.date)
                        jobs[i].folderName = n.before ? date + " " + text : text + " " + date;
                    else
                        jobs[i].folderName = sameText[text] > 1 ? numberFor(text) : text;
                }
                else
                    jobs[i].folderName = date;
            }

            std::vector<std::string> existing;
            std::error_code existsError;
            for (const auto& job : jobs)
                if (fs::exists(fs::path(folder) / job.folderName, existsError))
                    existing.push_back(job.folderName);
            pendingExport = [&, folder, exitAfter, deleteRest, jobs](bool replace) { startExport(folder, exitAfter, deleteRest, jobs, replace); };
            if (!existing.empty())
            {
                // Já existe pasta com esse nome: a página pergunta o que fazer
                listener.Emit(Json("exportConflict").Add("folder", folder).Add("names", existing));
                return "null";
            }
            auto run = pendingExport;
            pendingExport = nullptr;
            run(false);
            return "null";
        });

        // reorderSession(sessão, "02_T7_1", "01_SL3_1", ...): muda a ordem das fotos
        // de uma sessão já feita (renomeia os arquivos)
        window.bind("reorderSession", [&](const std::string& request) -> std::string
        {
            auto args = ParseStringArgs(request);
            if (args.size() < 2)
                return "null";
            const std::string session = args.front();
            args.erase(args.begin());
            previews.Post([&, session, args]
            {
                std::string error;
                if (!store.ReorderSession(session, args, error))
                    listener.Emit(Json("reorderFailed").Add("error", error));
                emitSessions();
            });
            return "null";
        });

        // deletePhotos(sessão, "02_T7_1", ...): apaga fotos de uma sessão
        window.bind("deletePhotos", [&](const std::string& request) -> std::string
        {
            auto args = ParseStringArgs(request);
            if (args.size() < 2)
                return "null";
            const std::string session = args.front();
            args.erase(args.begin());
            previews.Post([&, session, args]
            {
                // Os arquivos dessas fotos (antes de sair), para tirá-las da coleção da sessão no Lightroom
                std::vector<std::filesystem::path> paths;
                const auto dir = store.SessionDir(session);
                for (const auto& s : store.ListSessions())
                    if (s.name == session)
                        for (const auto& p : s.photos)
                        {
                            char group[64];
                            std::snprintf(group, sizeof(group), "%02d_", p.order);
                            const std::string key = group + p.camera;
                            if (std::find(args.begin(), args.end(), key) != args.end() || std::find(args.begin(), args.end(), p.file) != args.end())
                                paths.push_back(dir / p.file);
                        }
                std::string error;
                if (!store.DeletePhotos(session, args, error))
                    listener.Emit(Json("deleteFailed").Add("error", error));
                else if (!paths.empty() && Adobe::QueuePhotos("remove", session, paths))
                    Log("Delete photos: " + std::to_string(paths.size()) + " file(s) of " + session + " leave the Lightroom Classic collection");
                emitSessions();
            });
            return "null";
        });

        window.bind("deleteSession", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (!args.empty())
            {
                store.DeleteSession(args[0]);
                // A coleção sai do Lightroom, como no Done editing (decisão do dono, 2026-11-06); o Restore traz de volta
                auto map = LoadEditing();
                const bool wasEditing = map.erase(args[0]) > 0;
                if (wasEditing) { SaveEditing(map); emitEditing(); }
                if (Adobe::QueueRemoveCollection(args[0], "", "", ""))
                    Log("Session deleted: its Lightroom Classic collection will be removed");
            }
            emitSessions();
            return "null";
        });

        // ---- Lixeira (etapa 20) ----
        // trashList(): os itens (sessões inteiras ou fotos), do mais recente ao mais antigo
        window.bind("trashList", [&](const std::string&) -> std::string
        {
            store.PurgeTrash(kTrashDays);
            std::string list = "[";
            for (const auto& item : store.ListTrash())
                list += std::string(list.size() > 1 ? "," : "") + Json("item").Add("id", item.id).Add("session", item.session)
                    .Add("whole", item.wholeSession).Add("photos", item.photos).Raw("bytes", std::to_string(item.bytes))
                    .Raw("deletedAt", std::to_string(item.deletedAt)).Add("order", std::to_string(item.order))
                    .Add("inProject", item.inProject).Add("isProject", item.isProject).Add("reachable", item.reachable)
                    .Add("sessions", item.sessions).Add("parent", item.parent).Add("restored", item.restored)
                    .Add("edits", item.edits).Add("editsOnly", item.editsOnly).Raw("bases", [&] {
                        std::string b = "[";
                        for (size_t i = 0; i < item.bases.size(); ++i) b += (i ? "," : "") + JsonString(item.bases[i]);
                        return b + "]";
                    }()).Raw("editBases", [&] {
                        std::string b = "[";
                        for (size_t i = 0; i < item.editBases.size(); ++i) b += (i ? "," : "") + JsonString(item.editBases[i]);
                        return b + "]";
                    }()).Str();
            return Json("trash").Raw("items", list + "]").Add("days", kTrashDays)
                .Add("project", project.IsOpen() ? project.Name() : std::string()).Str();
        });
        // trashThumb(id, nome-base, "edited" ou "") -> "data:image/jpeg;base64,..." (ou null): as miniaturas da lixeira.
        // Ficam guardadas enquanto o app está aberto (um RAW leva um tempo para abrir)
        window.bind("trashThumb", [&](const std::string& id, const std::string& request, void*)
        {
            const auto args = ParseStringArgs(request);
            const std::string item = args.size() > 0 ? args[0] : "", base = args.size() > 1 ? args[1] : "";
            const bool edited = args.size() > 2 && args[2] == "edited";
            previews.Post([&, id, item, base, edited]
            {
                static std::mutex lock;
                static std::map<std::string, std::string> cache;
                const std::string key = item + "|" + base + "|" + (edited ? "e" : "o");
                std::string jpeg;
                {
                    std::lock_guard<std::mutex> g(lock);
                    auto it = cache.find(key);
                    if (it != cache.end()) jpeg = it->second;
                }
                if (jpeg.empty())
                {
                    jpeg = store.TrashThumb(item, base, edited, 120);
                    if (!jpeg.empty()) { std::lock_guard<std::mutex> g(lock); if (cache.size() > 400) cache.clear(); cache[key] = jpeg; }
                }
                window.resolve(id, 0, jpeg.empty() ? "null" : JsonString("data:image/jpeg;base64," + Base64Encode(jpeg)));
            });
        }, nullptr);
        // trashRestore(id): volta para onde estava (ou para o app, se a pasta de lá sumiu)
        window.bind("trashRestore", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            std::string error;
            std::vector<std::string> files;
            // Um projeto que volta da lixeira volta também para os recentes
            std::string projectFolder;
            if (!args.empty() && args[0].rfind("app/project-", 0) == 0)
            {
                // a origem fica no .trashinfo; ListTrash não a expõe: lê direto
                std::ifstream in(store.Root() / ".trash" / args[0].substr(4) / ".trashinfo");
                std::string line;
                while (std::getline(in, line))
                    if (line.rfind("origin=", 0) == 0)
                        projectFolder = line.substr(7);
            }
            // O item como estava antes de voltar (depois ele pode sair da lista; foi por isso que a foto restaurada
            // não voltava para a coleção, teste do dono de 2026-11-06)
            TrashItem before;
            bool known = false;
            if (!args.empty())
                for (const auto& item : store.ListTrash())
                    if (item.id == args[0]) { before = item; known = true; }
            const bool ok = !args.empty() && store.RestoreTrashItem(args[0], error, &files);
            if (ok && known && !before.isProject && !before.session.empty())
            {
                if (before.editsOnly)
                {
                    // Editadas que voltam: a edição volta também no Lightroom (o Delete edits tinha voltado as fotos ao
                    // original lá). Se a volta ao original ainda não foi feita, ela é cancelada.
                    if (!Adobe::CancelReset(before.session))
                    {
                        std::vector<std::filesystem::path> originals;
                        const auto dir = store.SessionDir(before.session);
                        for (const auto& s : store.ListSessions())
                            if (s.name == before.session)
                                for (const auto& p : s.photos)
                                    if (std::find(before.bases.begin(), before.bases.end(), std::filesystem::path(p.file).stem().string()) != before.bases.end())
                                        originals.push_back(dir / p.file);
                        if (Adobe::QueuePhotos("bringback", before.session, originals))
                            Log("Restore: the edit of " + std::to_string(originals.size()) + " photo(s) of " + before.session + " comes back in Lightroom Classic too");
                    }
                }
                // Fotos que voltaram para uma sessão que está aqui: voltam também para a coleção dela no Lightroom.
                // A sessão inteira não (só uma ação de dentro do Lightroom a põe de volta lá; decisão do dono, 2026-11-06)
                else if (!before.wholeSession)
                    adobeReadd(before.session, files);
            }
            if (ok && !projectFolder.empty())
                setRecent(projectFolder, true);
            if (ok && !projectFolder.empty())
                return Json("restore").Add("ok", true).Add("error", "").Add("folder", projectFolder).Str();
            if (!ok && error.empty())
                error = "Could not restore this item.";
            emitSessions();
            return Json("restore").Add("ok", ok).Add("error", error).Add("files", files).Str();
        });
        // trashDelete(id) / trashEmpty(): apaga de vez
        window.bind("trashDelete", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const bool ok = !args.empty() && store.DeleteTrashItem(args[0]);
            emitTrash();
            return Json("delete").Add("ok", ok).Str();
        });
        window.bind("trashEmpty", [&](const std::string&) -> std::string
        {
            store.EmptyTrash();
            emitTrash();
            return Json("empty").Add("ok", true).Str();
        });

        window.bind("deleteAllSessions", [&](const std::string&) -> std::string
        {
            store.DeleteAll();
            emitSessions();
            return "null";
        });

        // --- Atualização (GitHub) ---

        // checkForUpdate() -> texto JSON da última versão publicada no GitHub, ou null.
        // A página compara as versões e escolhe o arquivo do sistema.
        window.bind("checkForUpdate", [&](const std::string& id, const std::string&, void*)
        {
            std::thread([&, id]
            {
                const auto file = std::filesystem::temp_directory_path() / "stillpoint-latest-release.json";
                std::error_code ec;
                std::filesystem::remove(file, ec);
                const int code = Platform::RunProcess({
                    Platform::CurlExecutable().string(), "-fsSL", "--max-time", "15",
                    "-H", "Accept: application/vnd.github+json",
                    "-H", "User-Agent: Stillpoint/" + version,
                    "-o", file.string(),
                    std::string("https://api.github.com/repos/") + kRepo + "/releases/latest" }, 20);
                const std::string text = code == 0 ? ReadTextFile(file) : std::string();
                std::filesystem::remove(file, ec);
                Log(code == 0 ? "Update check: release information received"
                              : "Update check failed (curl exit code " + std::to_string(code) + ")");
                window.dispatch([&, id, text] { window.resolve(id, 0, text.empty() ? "null" : JsonString(text)); });
            }).detach();
        }, nullptr);

        // downloadUpdate(endereço, "sha256:...", nome, "tamanho"): baixa o instalador para
        // a pasta temporária, com avisos de andamento, e confere tamanho e SHA-256
        window.bind("downloadUpdate", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            const std::string url = args.size() > 0 ? args[0] : "";
            const std::string digest = args.size() > 1 ? args[1] : "";
            const std::string name = args.size() > 2 ? args[2] : "";
            long long size = 0;
            try { size = args.size() > 3 ? std::stoll(args[3]) : 0; } catch (...) { size = 0; }
            // Só arquivos das versões publicadas deste projeto
            if (url.rfind(kReleaseDownloads, 0) != 0 || name.empty() || name.find_first_of("/\\") != std::string::npos)
                return Json("download").Add("ok", false).Str();
            if (update.downloading.exchange(true))
                return Json("download").Add("ok", false).Str();
            update.cancel = false;

            std::thread([&, url, digest, name, size]
            {
                const auto file = std::filesystem::temp_directory_path() / name;
                std::error_code ec;
                std::filesystem::remove(file, ec);

                std::atomic<bool> finished{ false };
                std::thread progress([&, file, size]
                {
                    while (!finished)
                    {
                        std::error_code sizeError;
                        const auto done = std::filesystem::file_size(file, sizeError);
                        listener.Emit(Json("updateProgress").Add("done", static_cast<double>(sizeError ? 0 : done))
                                                            .Add("total", static_cast<double>(size)));
                        std::this_thread::sleep_for(std::chrono::milliseconds(250));
                    }
                });
                const int code = Platform::RunProcess({
                    Platform::CurlExecutable().string(), "-fsSL", "--retry", "2", "--max-time", "900",
                    "-H", "User-Agent: Stillpoint/" + version, "-o", file.string(), url }, 960, &update.cancel);
                finished = true;
                progress.join();

                std::string error;
                if (update.cancel)
                    error = "cancelled";
                else if (code != 0)
                    error = "The download failed. Check the internet connection and try again.";
                else if (size > 0 && static_cast<long long>(std::filesystem::file_size(file, ec)) != size)
                    error = "The downloaded file is incomplete. Try again.";
                else if (digest.rfind("sha256:", 0) == 0 && Platform::Sha256OfFile(file) != digest.substr(7))
                    error = "The downloaded file did not pass the safety check. Try again.";

                if (!error.empty())
                {
                    std::filesystem::remove(file, ec);
                    Log("Update download: " + error);
                    listener.Emit(Json("updateFailed").Add("error", error).Add("cancelled", error == "cancelled"));
                }
                else
                {
                    {
                        std::lock_guard<std::mutex> lock(update.mutex);
                        update.ready = file;
                    }
                    Log("Update downloaded and verified: " + file.string());
                    listener.Emit(Json("updateReady"));
                }
                update.downloading = false;
            }).detach();
            return Json("download").Add("ok", true).Str();
        });

        window.bind("cancelUpdate", [&](const std::string&) -> std::string
        {
            update.cancel = true;
            return "null";
        });

        // installUpdate(): começa a instalação da versão baixada e fecha o app (as
        // sessões não salvas ficam no disco e aparecem ao abrir de novo)
        window.bind("installUpdate", [&](const std::string&) -> std::string
        {
            std::filesystem::path installer;
            {
                std::lock_guard<std::mutex> lock(update.mutex);
                installer = update.ready;
            }
            std::string error = "The update was not downloaded.";
            if (installer.empty() || !Platform::StartUpdateInstall(installer, error))
                return Json("install").Add("ok", false).Add("error", error).Str();
            Log("Installing the update; closing the app");
            window.dispatch([&] { closeNow(); });
            return Json("install").Add("ok", true).Str();
        });

        // openUrl(endereço): só páginas deste projeto no GitHub
        window.bind("openUrl", [&](const std::string& request) -> std::string
        {
            const auto args = ParseStringArgs(request);
            if (!args.empty() && args[0].rfind(kRepoPages, 0) == 0)
                Platform::OpenUrl(args[0]);
            return "null";
        });

        // --- Saída ---

        // restartApp(): abre o app de novo e fecha este. Para quando uma câmera fica
        // presa conectando (o SDK não deixa cancelar). As fotos não salvas ficam no
        // disco e aparecem ao abrir de novo.
        window.bind("restartApp", [&](const std::string&) -> std::string
        {
            if (!Platform::RelaunchAfterExit())
                return Json("restart").Add("ok", false).Str();
            window.dispatch([&] { closeNow(); });
            return Json("restart").Add("ok", true).Str();
        });

        window.bind("exitApp", [&](const std::string& request) -> std::string
        {
            // exitApp(true) apaga as fotos não salvas antes de fechar (as salvas e
            // mantidas no app ficam)
            if (request.find("true") != std::string::npos)
                store.DeleteUnsaved();
            window.dispatch([&] { closeNow(); });
            return "null";
        });

        // Ao fechar a janela com fotos não salvas, a página pergunta o que fazer
        if (auto native = window.window(); native.ok())
        {
            NativeWindow::InstallCloseGuard(native.value(), [&]
            {
                if (allowClose)
                    return true;
                const int unsaved = store.CountUnsaved();
                if (unsaved == 0)
                    closeNow();  // encerra as câmeras antes de fechar a janela
                else
                    listener.Emit(Json("confirmExit").Add("unsavedSessions", unsaved));
                return false;
            });
            // Mac: menu na barra de cima; os itens do app viram eventos para a página
            NativeWindow::InstallAppMenu(native.value(), [&](const std::string& item)
            {
                listener.Emit(Json("menu").Add("item", item));
            });
        }

        // Plugin do Lightroom já instalado e mais velho que o deste app, com o Lightroom fechado: troca agora, ao abrir
        // o app (antes só trocava no Edit in Lightroom Classic ou no Reinstall plugin, e o teste do plugin rodava o
        // velho; 2026-11-06)
        {
            const std::string installed = Adobe::InstalledPluginVersion();
            const auto source = Platform::ResourcesDirectory() / "assets" / "lightroom" / "Stillpoint.lrplugin";
            const std::string bundled = Adobe::BundledPluginVersion(source, AppVersion());
            const auto lr = adobeFind(Adobe::Program::Lightroom);
            const bool lrOpen = Adobe::ReadAlive().fresh || (lr.found && Platform::ApplicationRunning(lr.path));
            if (!installed.empty() && installed != bundled && !lrOpen)
            {
                std::string error;
                if (Adobe::InstallPlugin(source, bundled, error))
                    Log("Lightroom plugin updated to " + bundled + " (was " + installed + ")");
                else
                    Log("Lightroom plugin update failed: " + error);
            }
            else if (!installed.empty() && installed != bundled)
                Log("Lightroom plugin " + installed + " is older than " + bundled + ": it updates the next time Stillpoint opens with Lightroom Classic closed");
        }

        {
            // Abertura desligada em Settings (pref.splash=off): a página já vem sem ela
            std::string page = LoadPage("index.html", theme);
            const auto opening = LoadSettings();
            if (opening.count("pref.splash") && opening.at("pref.splash") == "off")
            {
                const std::string marker = "id=\"splash\"";
                const auto pos = page.find(marker);
                if (pos != std::string::npos)
                    page.insert(pos + marker.size(), " data-off=\"1\"");
            }
            // Teste com o Lightroom de verdade: o roteiro roda dentro da página
            if (const char* e2eScript = std::getenv("STILLPOINT_E2E_SCRIPT"); std::getenv("STILLPOINT_E2E") && e2eScript && *e2eScript)
            {
                std::ifstream in(Utf8ToPath(e2eScript), std::ios::binary);
                const std::string script((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
                const auto pos = page.rfind("</body>");
                if (!script.empty() && pos != std::string::npos)
                    page.insert(pos, "<script>\n" + script + "\n</script>\n");
            }
            window.set_html(page);
        }

        // Vigia de monitores: a cada 2 s, se a lista mudou (TV ligada/desligada), avisa as
        // janelas Live (evento "screens"); a página em tela cheia num monitor que sumiu
        // passa para o principal (decisão de 2026-10-28).
        std::atomic<bool> watchingScreens{ true };
        std::thread screenWatcher([&]
        {
            std::string last;
            while (watchingScreens)
            {
                std::this_thread::sleep_for(std::chrono::seconds(2));
                if (!watchingScreens)
                    break;
                window.dispatch([&]
                {
                    const std::string now = screensJson();
                    if (now == last)
                        return;
                    const bool first = last.empty();
                    last = now;
                    if (!first)
                        listener.Emit(Json("screens").Raw("screens", now));
                });
            }
        });
        window.run();
        watchingScreens = false;
        screenWatcher.detach();

        // Janela fechada. Se as câmeras não foram encerradas pelo caminho normal
        // (ex.: o sistema fechou o app), não esperar por elas: esperar pode travar.
        SetLogSink([](const std::string&) {});
        listener.Close();
        shuttingDown = true;
        if (!camerasClosed)
            std::_Exit(0);
        return 0;
    }
}

#ifdef _WIN32
int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int)
#else
int main()
#endif
{
    try
    {
        return RunApp();
    }
    catch (const webview::exception& e)
    {
        Log(std::string("Window error: ") + e.what());
        return 1;
    }
}
