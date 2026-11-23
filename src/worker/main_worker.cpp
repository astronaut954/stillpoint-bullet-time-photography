// StillpointWorker: processo trabalhador de UMA câmera (etapa 16).
//
// O app de janela abre um destes por câmera. Este processo carrega o SDK da Canon,
// pega a primeira câmera livre (o SDK recusa a câmera que já está com outro processo:
// erro 0xC0), e obedece ordens lidas do stdin, respondendo pelo stdout
// (include/worker_protocol.h). Se o SDK travar aqui, só esta câmera para: o app
// encerra este processo e abre outro. Sem janela, sem teclado.

#include "EDSDK.h"
#include "camera_context.h"
#include "camera_settings.h"
#include "camera_settings_text.h"
#include "logger.h"
#include "platform/platform.h"
#include "worker_protocol.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>
#ifdef _WIN32
#include <process.h>
#define WORKER_GETPID _getpid
#else
#include <unistd.h>
#define WORKER_GETPID getpid
#endif

namespace fs = std::filesystem;
using WorkerProtocol::Join;
using WorkerProtocol::Split;

namespace
{
    std::mutex g_outMutex;
    std::ofstream g_logFile;

    long long NowMs()
    {
        return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
    }

    // Uma linha para o app (stdout), sempre com flush: o app lê linha a linha
    void Send(const std::vector<std::string>& fields)
    {
        std::lock_guard<std::mutex> lock(g_outMutex);
        const std::string line = Join(fields);
        std::fputs((line + "\n").c_str(), stdout);
        std::fflush(stdout);
        if (g_logFile.is_open())
            g_logFile << NowMs() << " > " << line << std::endl;
    }

    void Note(const std::string& text)
    {
        Send({ "log", text });
    }

    std::string Hex(EdsError e)
    {
        char buf[16];
        std::snprintf(buf, sizeof(buf), "0x%08X", static_cast<unsigned>(e));
        return buf;
    }

    // Lê o teclado (stdin) numa thread: o laço principal continua girando o SDK
    std::mutex g_cmdMutex;
    std::deque<std::string> g_cmds;
    std::atomic<bool> g_stdinClosed{ false };
    void ReadOrders()
    {
        std::string line;
        while (std::getline(std::cin, line))
        {
            std::lock_guard<std::mutex> lock(g_cmdMutex);
            g_cmds.push_back(line);
        }
        g_stdinClosed = true;  // o app fechou (ou morreu): este processo sai também
    }
    bool NextOrder(std::string& line)
    {
        std::lock_guard<std::mutex> lock(g_cmdMutex);
        if (g_cmds.empty())
            return false;
        line = g_cmds.front();
        g_cmds.pop_front();
        return true;
    }

    // Deixa o SDK entregar eventos (Mac: run loop; os dois: EdsGetEvent) por `ms`
    void Pump(int ms)
    {
        const auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(ms);
        do
        {
            Platform::ProcessEvents(0);
            EdsGetEvent();
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        } while (std::chrono::steady_clock::now() < end);
    }

    // ---- A câmera deste processo ----
    struct Worker
    {
        CameraContext cam;          // camera, shortName, orderPrefix, modelName, sessionOpen
        std::string serial;
        std::atomic<bool> lost{ false };
        std::string lostReason;

        // Plano de disparo em andamento
        struct Item { int prefix = 0; long long atMs = 0; bool fired = false; };
        std::vector<Item> plan;
        long long t0 = 0;
        fs::path dir;
        bool planActive = false;
        std::deque<int> pendingPrefixes;  // fotos que ainda vão chegar, na ordem
        // Download adiado (decisão de 2026-10-22): enquanto um plano ainda tem disparos por
        // fazer, as fotos que a câmera oferece ficam na fila (a câmera as segura na memória
        // interna) e só são baixadas depois do último disparo, em ordem. Um download leva ~1 s
        // (CR2 pelo USB) e trava este laço; baixar no meio do plano atrasava o disparo
        // seguinte desta câmera (medido no SdkMultiprocTest --repeat).
        struct Deferred { EdsDirectoryItemRef item = nullptr; int prefix = 0; };
        std::deque<Deferred> deferred;

        // Imagem ao vivo (etapa 21, parte 6b): ligada, um quadro vai para liveFile a cada ~150 ms
        bool live = false;
        fs::path liveFile;
        EdsUInt32 liveDeviceBefore = 0;      // para onde o visor ia antes (volta ao desligar)
        EdsUInt32 liveModeBefore = 1;        // "Live View shooting" da câmera antes (0 = desligado no menu)
        bool liveModeChanged = false;
        long long liveNextMs = 0;
        long long liveSinceMs = 0;           // quando ligou (os primeiros quadros demoram: a câmera sobe o espelho)
        int liveFailures = 0;                // quadros seguidos que não vieram
        bool liveGotFrame = false;
    } g;

    std::string SafeName(std::string name)
    {
        if (name.empty())
            name = "file.bin";
        for (char& c : name)
            if (c == '/' || c == '\\' || c == ':')
                c = '_';
        return name;
    }

    std::string Prefix(int value)
    {
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%02d", value);
        return buf;
    }

    // Mesmo nome que o app sempre usou: <nº>_<câmera>_<nome original>, com _2, _3 se repetir
    fs::path UniquePath(const fs::path& dir, int prefix, const std::string& cameraName, const std::string& original)
    {
        const std::string safe = SafeName(original);
        fs::path candidate = dir / (Prefix(prefix) + "_" + cameraName + "_" + safe);
        if (!fs::exists(candidate))
            return candidate;
        const fs::path o(safe);
        for (int n = 2;; ++n)
        {
            fs::path next = dir / (Prefix(prefix) + "_" + cameraName + "_" + o.stem().string() + "_" + std::to_string(n) + o.extension().string());
            if (!fs::exists(next))
                return next;
        }
    }

    // Baixa uma foto que a câmera ofereceu e avisa o app. Não solta o item: quem chama solta.
    void DownloadItem(EdsDirectoryItemRef item, int prefix)
    {
        EdsDirectoryItemInfo info{};
        EdsError err = EdsGetDirectoryItemInfo(item, &info);
        if (err == EDS_ERR_OK)
        {
            std::error_code ec;
            fs::create_directories(g.dir, ec);
            const fs::path path = UniquePath(g.dir, prefix, g.cam.shortName, std::string(info.szFileName));
            EdsStreamRef stream = nullptr;
            err = EdsCreateFileStream(path.string().c_str(), kEdsFileCreateDisposition_CreateAlways, kEdsAccess_ReadWrite, &stream);
            if (err == EDS_ERR_OK)
            {
                err = EdsDownload(item, info.size, stream);
                if (err == EDS_ERR_OK)
                    err = EdsDownloadComplete(item);
                EdsRelease(stream);
            }
            if (err == EDS_ERR_OK)
                Send({ "photo", std::to_string(prefix), path.string() });
            else
                Send({ "photofail", std::to_string(prefix), Hex(err) });
        }
        else
            Send({ "photofail", std::to_string(prefix), Hex(err) });
    }

    bool PlanHasShotsLeft()
    {
        if (!g.planActive)
            return false;
        for (const auto& item : g.plan)
            if (!item.fired)
                return true;
        return false;
    }

    // Baixa, em ordem, as fotos que ficaram na fila durante o plano
    void DrainDeferred()
    {
        while (!g.deferred.empty())
        {
            const auto d = g.deferred.front();
            g.deferred.pop_front();
            DownloadItem(d.item, d.prefix);
            EdsRelease(d.item);
        }
    }

    EdsError EDSCALLBACK OnObjectEvent(EdsObjectEvent event, EdsBaseRef object, EdsVoid*)
    {
        if (event == kEdsObjectEvent_DirItemRequestTransfer && object != nullptr)
        {
            int prefix = g.cam.orderPrefix;
            if (!g.pendingPrefixes.empty())
            {
                prefix = g.pendingPrefixes.front();
                g.pendingPrefixes.pop_front();
            }
            if (PlanHasShotsLeft())
            {
                // Ainda há disparos marcados: guarda o item (sem soltar) e baixa depois do plano
                g.deferred.push_back({ static_cast<EdsDirectoryItemRef>(object), prefix });
                Send({ "log", "Photo " + std::to_string(prefix) + " kept on the camera until the plan ends" });
                return EDS_ERR_OK;
            }
            DownloadItem(static_cast<EdsDirectoryItemRef>(object), prefix);
        }
        if (object)
            EdsRelease(object);
        return EDS_ERR_OK;
    }

    EdsError EDSCALLBACK OnStateEvent(EdsStateEvent event, EdsUInt32 param, EdsVoid*)
    {
        if (event == kEdsStateEvent_Shutdown)
        {
            g.lost = true;
            g.lostReason = "camera turned off or unplugged";
        }
        else if (event == kEdsStateEvent_InternalError)
        {
            g.lost = true;
            g.lostReason = "internal error reported by the camera";
        }
        else if (event == kEdsStateEvent_WillSoonShutDown)
        {
            // Auto power off chegando: pede para a câmera continuar acordada
            EdsSendCommand(g.cam.camera, kEdsCameraCommand_ExtendShutDownTimer, 0);
        }
        (void)param;
        return EDS_ERR_OK;
    }

    // Conecta: abre a primeira câmera livre, lendo a lista do SDK de novo a cada 2 s
    bool Claim(int waitSeconds, const std::set<int>& avoid)
    {
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(waitSeconds);
        bool first = true;
        while (first || std::chrono::steady_clock::now() < deadline)
        {
            if (!first)
                Pump(2000);
            first = false;
            Platform::ProcessEvents(1000);  // Mac: a lista só enche depois de processar eventos
            EdsCameraListRef list = nullptr;
            if (EdsGetCameraList(&list) != EDS_ERR_OK || list == nullptr)
                continue;
            EdsUInt32 count = 0;
            EdsGetChildCount(list, &count);
            for (EdsUInt32 i = 0; i < count; ++i)
            {
                if (avoid.count(static_cast<int>(i)))
                    continue;
                EdsCameraRef ref = nullptr;
                if (EdsGetChildAtIndex(list, i, &ref) != EDS_ERR_OK || ref == nullptr)
                    continue;
                EdsDeviceInfo info{};
                std::string model = "Canon camera", port;
                if (EdsGetDeviceInfo(ref, &info) == EDS_ERR_OK)
                {
                    model = info.szDeviceDescription;
                    port = info.szPortName;
                }
                Send({ "trying", std::to_string(i), model });
                const auto start = std::chrono::steady_clock::now();
                const EdsError err = EdsOpenSession(ref);
                const double seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
                if (err != EDS_ERR_OK)
                {
                    Send({ "openfail", std::to_string(i), model, Hex(err) });
                    EdsRelease(ref);
                    continue;
                }
                g.cam.camera = ref;
                g.cam.modelName = model;
                g.cam.portName = port;
                g.cam.sessionOpen = true;
                // Número de série: identidade estável da câmera (a porta muda de número no Mac)
                char body[64] = {};
                if (EdsGetPropertyData(ref, kEdsPropID_BodyIDEx, 0, sizeof(body), body) == EDS_ERR_OK)
                    g.serial = body;
                if (g.serial.empty())
                    g.serial = model + "@" + port;
                EdsSetObjectEventHandler(ref, kEdsObjectEvent_All, OnObjectEvent, nullptr);
                EdsSetCameraStateEventHandler(ref, kEdsStateEvent_All, OnStateEvent, nullptr);
                EdsUInt32 saveTo = kEdsSaveTo_Host;
                const EdsError errSave = EdsSetPropertyData(ref, kEdsPropID_SaveTo, 0, sizeof(saveTo), &saveTo);
                EdsCapacity capacity{};
                capacity.numberOfFreeClusters = 0x7FFFFFFF;
                capacity.bytesPerSector = 512;
                capacity.reset = 1;
                const EdsError errCap = EdsSetCapacity(ref, capacity);
                if (errSave != EDS_ERR_OK || errCap != EDS_ERR_OK)
                    Note("SaveTo/Capacity: " + Hex(errSave) + " " + Hex(errCap));
                EdsRelease(list);
                char secs[16];
                std::snprintf(secs, sizeof(secs), "%.1f", seconds);
                Send({ "claimed", model, g.serial, port, secs });
                return true;
            }
            EdsRelease(list);
        }
        return false;
    }

    // ---- Imagem ao vivo ----
    // Liga: o visor da câmera passa a ir também para o computador. Nas DSLR o espelho sobe (como apertar o botão
    // de Live View na câmera). Devolve o erro do SDK e, em `what`, qual passo falhou.
    EdsError LiveOn(const fs::path& file, std::string& what)
    {
        if (g.live)
        {
            g.liveFile = file;
            return EDS_ERR_OK;
        }
        // Algumas câmeras têm o Live View desligado no menu: liga (e devolve ao desligar)
        EdsUInt32 mode = 1;
        g.liveModeChanged = false;
        if (EdsGetPropertyData(g.cam.camera, kEdsPropID_Evf_Mode, 0, sizeof(mode), &mode) == EDS_ERR_OK && mode == 0)
        {
            EdsUInt32 on = 1;
            const EdsError errMode = EdsSetPropertyData(g.cam.camera, kEdsPropID_Evf_Mode, 0, sizeof(on), &on);
            if (errMode != EDS_ERR_OK)
            {
                what = "turning Live View on in the camera";
                return errMode;
            }
            g.liveModeBefore = 0;
            g.liveModeChanged = true;
            Pump(200);
        }
        EdsUInt32 device = 0;
        EdsError err = EdsGetPropertyData(g.cam.camera, kEdsPropID_Evf_OutputDevice, 0, sizeof(device), &device);
        if (err != EDS_ERR_OK)
        {
            what = "reading where the viewfinder image goes";
            return err;
        }
        g.liveDeviceBefore = device;
        EdsUInt32 want = device | kEdsEvfOutputDevice_PC;
        err = EdsSetPropertyData(g.cam.camera, kEdsPropID_Evf_OutputDevice, 0, sizeof(want), &want);
        if (err != EDS_ERR_OK)
        {
            what = "sending the viewfinder image to the computer";
            return err;
        }
        g.live = true;
        g.liveFile = file;
        g.liveSinceMs = NowMs();
        g.liveNextMs = g.liveSinceMs + 300;
        g.liveFailures = 0;
        g.liveGotFrame = false;
        return EDS_ERR_OK;
    }

    void LiveOff()
    {
        if (!g.live)
            return;
        g.live = false;
        EdsUInt32 device = g.liveDeviceBefore & ~static_cast<EdsUInt32>(kEdsEvfOutputDevice_PC);
        const EdsError err = EdsSetPropertyData(g.cam.camera, kEdsPropID_Evf_OutputDevice, 0, sizeof(device), &device);
        if (err != EDS_ERR_OK)
            Note("Live image: could not turn it off (" + Hex(err) + ")");
        if (g.liveModeChanged)
        {
            EdsUInt32 off = g.liveModeBefore;
            EdsSetPropertyData(g.cam.camera, kEdsPropID_Evf_Mode, 0, sizeof(off), &off);
            g.liveModeChanged = false;
        }
        std::error_code ec;
        fs::remove(g.liveFile, ec);
    }

    // Um quadro: pede à câmera, grava ao lado e troca o arquivo de uma vez
    void LiveFrame()
    {
        g.liveNextMs = NowMs() + 150;
        EdsStreamRef stream = nullptr;
        EdsEvfImageRef image = nullptr;
        EdsError err = EdsCreateMemoryStream(0, &stream);
        if (err == EDS_ERR_OK)
            err = EdsCreateEvfImageRef(stream, &image);
        if (err == EDS_ERR_OK)
            err = EdsDownloadEvfImage(g.cam.camera, image);
        if (err == EDS_ERR_OK)
        {
            EdsVoid* data = nullptr;
            EdsUInt64 length = 0;
            EdsGetPointer(stream, &data);
            EdsGetLength(stream, &length);
            if (data != nullptr && length > 0)
            {
                fs::path part = g.liveFile;
                part += ".part";
                {
                    std::ofstream out(part, std::ios::binary | std::ios::trunc);
                    out.write(static_cast<const char*>(data), static_cast<std::streamsize>(length));
                }
                std::error_code ec;
                fs::rename(part, g.liveFile, ec);
                if (ec)
                {
                    // Windows não troca um arquivo que o app está lendo neste instante: o próximo quadro tenta de novo
                    fs::remove(part, ec);
                }
                if (!g.liveGotFrame)
                {
                    g.liveGotFrame = true;
                    Note("Live image: first frame after " + std::to_string(NowMs() - g.liveSinceMs) + " ms, " + std::to_string(static_cast<long long>(length)) + " bytes");
                }
                g.liveFailures = 0;
            }
        }
        else
        {
            // "Ainda não está pronta" é normal logo depois de ligar (o espelho sobe); o resto conta como falha
            ++g.liveFailures;
            const bool starting = !g.liveGotFrame && NowMs() - g.liveSinceMs < 6000;
            if (!starting && g.liveFailures >= 20)
            {
                Note("Live image: stopped coming (" + Hex(err) + ")");
                Send({ "livefail", Hex(err) });
                LiveOff();
            }
            else if (!g.liveGotFrame && g.liveFailures == 1)
                Note("Live image: waiting for the first frame (" + Hex(err) + ")");
        }
        if (image)
            EdsRelease(image);
        if (stream)
            EdsRelease(stream);
    }

    void Fire(Worker::Item& item)
    {
        item.fired = true;
        const EdsError down = EdsSendCommand(g.cam.camera, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely_NonAF);
        const long long at = NowMs();
        if (down == EDS_ERR_OK)
            g.pendingPrefixes.push_back(item.prefix);
        Send({ "fired", std::to_string(item.prefix), down == EDS_ERR_OK ? "ok" : "err", Hex(down), std::to_string(at) });
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        EdsSendCommand(g.cam.camera, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
        if (down == EDS_ERR_COMM_DISCONNECTED || down == EDS_ERR_DEVICE_NOT_FOUND)
        {
            g.lost = true;
            g.lostReason = "camera stopped answering (" + Hex(down) + ")";
        }
    }

    void HandleOrder(const std::string& line, bool& quit)
    {
        const auto f = Split(line);
        if (f.empty() || f[0].empty())
            return;
        const std::string& cmd = f[0];
        if (cmd == "ping")
            Send({ "pong" });
        else if (cmd == "name" && f.size() >= 3)
        {
            g.cam.shortName = f[1];
            g.cam.baseShortName = f[1].substr(0, f[1].rfind('_'));
            g.cam.orderPrefix = std::atoi(f[2].c_str());
        }
        else if (cmd == "settings")
            Send({ "settings", CameraSettingsText::Encode(CameraSettingsCanon::Read(g.cam)) });
        else if (cmd == "set" && f.size() >= 3)
        {
            std::string error;
            long long value = 0;
            try { value = std::stoll(f[2]); } catch (...) {}
            if (CameraSettingsCanon::Write(g.cam, f[1], value, error))
                Send({ "setresult", "ok" });
            else
                Send({ "setresult", "err", error });
        }
        else if (cmd == "identify")
        {
            EdsSendCommand(g.cam.camera, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Halfway);
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            EdsSendCommand(g.cam.camera, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
            Send({ "identified" });
        }
        else if (cmd == "live" && f.size() >= 2)
        {
            if (f[1] == "on" && f.size() >= 3)
            {
                std::string what;
                const EdsError err = g.planActive ? EDS_ERR_DEVICE_BUSY : LiveOn(fs::path(f[2]), what);
                if (err == EDS_ERR_OK)
                    Send({ "liveresult", "ok" });
                else
                    Send({ "liveresult", "err", Hex(err), g.planActive ? "the camera is shooting" : what });
            }
            else
            {
                LiveOff();
                Send({ "liveresult", "ok" });
            }
        }
        else if (cmd == "shoot" && f.size() >= 5)
        {
            // A imagem ao vivo desliga antes de qualquer disparo: com o espelho em cima o tempo do disparo é outro
            if (g.live)
            {
                LiveOff();
                Pump(400);
            }
            g.t0 = std::atoll(f[1].c_str());
            g.dir = fs::path(f[2]);
            g.cam.shortName = f[3];
            g.plan.clear();
            for (const auto& part : CameraSettingsText::SplitOn(f[4], ','))
            {
                const auto colon = part.find(':');
                if (colon == std::string::npos)
                    continue;
                Worker::Item item;
                item.prefix = std::atoi(part.substr(0, colon).c_str());
                item.atMs = std::atoll(part.substr(colon + 1).c_str());
                g.plan.push_back(item);
            }
            std::sort(g.plan.begin(), g.plan.end(), [](const auto& a, const auto& b) { return a.atMs < b.atMs; });
            g.planActive = !g.plan.empty();
            if (!g.planActive)
                Send({ "shootdone" });
        }
        else if (cmd == "cancel")
        {
            if (g.planActive)
            {
                g.plan.erase(std::remove_if(g.plan.begin(), g.plan.end(), [](const auto& i) { return !i.fired; }), g.plan.end());
                g.planActive = false;
                Send({ "shootdone" });
                DrainDeferred();
            }
        }
        else if (cmd == "quit")
            quit = true;
    }
}

int main(int argc, char** argv)
{
    int waitSeconds = 60;
    std::set<int> avoid;
    fs::path logDir;
    for (int i = 1; i < argc; ++i)
    {
        const std::string a = argv[i];
        const std::string v = i + 1 < argc ? argv[i + 1] : "";
        if (a == "--wait") { waitSeconds = std::atoi(v.c_str()); ++i; }
        else if (a == "--avoid") { for (const auto& p : CameraSettingsText::SplitOn(v, ',')) if (!p.empty()) avoid.insert(std::atoi(p.c_str())); ++i; }
        else if (a == "--log") { logDir = v; ++i; }
    }
    // Mensagens do núcleo (CameraSettingsCanon etc.) vão para o app
    SetLogSink([](const std::string& m) { Note(m); });

    Send({ "hello", std::to_string(static_cast<long long>(WORKER_GETPID())) });
    std::thread(ReadOrders).detach();
    Platform::BeginSdkThread();  // Windows: o SDK exige COM na thread que o usa

    const EdsError init = EdsInitializeSDK();
    if (init != EDS_ERR_OK)
    {
        Send({ "lost", "SDK did not start (" + Hex(init) + ")" });
        return 1;
    }
    if (!Claim(waitSeconds, avoid))
    {
        Send({ "none" });
        EdsTerminateSDK();
        return 0;
    }
    if (!logDir.empty())
    {
        std::error_code ec;
        fs::create_directories(logDir, ec);
        std::string name = g.serial;
        for (char& c : name) if (!isalnum(static_cast<unsigned char>(c))) c = '_';
        g_logFile.open((logDir / ("worker-" + name + ".txt")).string(), std::ios::app);
    }

    bool quit = false;
    while (!quit && !g_stdinClosed)
    {
        Pump(g.planActive ? 1 : 20);
        if (g.planActive)
        {
            const long long now = NowMs();
            bool allFired = true;
            for (auto& item : g.plan)
            {
                if (item.fired)
                    continue;
                if (now >= g.t0 + item.atMs)
                    Fire(item);
                else
                    allFired = false;
                if (g.lost)
                    break;
            }
            if (allFired || g.lost)
            {
                g.planActive = false;
                Send({ "shootdone" });
                DrainDeferred();
            }
        }
        if (g.live && !g.planActive && !g.lost && NowMs() >= g.liveNextMs)
            LiveFrame();
        if (g.lost)
        {
            Send({ "lost", g.lostReason });
            break;
        }
        std::string line;
        while (NextOrder(line))
        {
            HandleOrder(line, quit);
            if (quit)
                break;
        }
    }

    if (g.cam.camera != nullptr)
    {
        if (!g.lost)
        {
            LiveOff();        // o visor volta para onde estava
            DrainDeferred();  // nada fica preso na câmera ao sair
            EdsCloseSession(g.cam.camera);
        }
        EdsRelease(g.cam.camera);
    }
    EdsTerminateSDK();
    Platform::EndSdkThread();
    Send({ "bye" });
    return 0;
}
