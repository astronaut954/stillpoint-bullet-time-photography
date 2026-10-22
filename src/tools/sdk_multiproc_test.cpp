// Teste de viabilidade da etapa 16 (um processo por câmera).
//
// Pergunta: o SDK da Canon aceita ser carregado por vários processos ao mesmo tempo na
// mesma máquina, cada processo com a sua câmera? Este programa de terminal abre UMA
// câmera por processo. Rode duas cópias em dois terminais, uma para cada câmera, e siga
// docs/teste-manual.md (seção 20). Não faz parte do app: só existe para esse teste.
//
// Uso:
//   SdkMultiprocTest --list                     lista as câmeras que o SDK vê e sai
//   SdkMultiprocTest --camera N [opções]        abre só a câmera N (0, 1...) e fica à espera
//   SdkMultiprocTest --model T7 [opções]        abre a primeira câmera cujo nome contém "T7"
// Opções:
//   --out <pasta>     onde salvar as fotos (padrão: ~/Desktop/sdk-multiproc-test)
//   --at HH:MM:SS     dispara sozinho nesse horário (relógio do computador) e sai 20 s depois
//   --wait S          espera até S segundos as câmeras aparecerem no SDK (padrão 90; no Mac
//                     uma câmera recém-ligada leva ~40 s para o SDK enxergar)
//   --repeat N --gap MS [--retry] [--retry-max MS] [--retry-every MS]
//                     Medição da mesma câmera repetindo (2026-10-21): dispara N fotos nesta
//                     câmera, uma a cada MS milissegundos pelo relógio. Com --retry, uma foto
//                     recusada ("busy") é pedida de novo a cada --retry-every ms (padrão 50)
//                     até a câmera aceitar ou passarem --retry-max ms (padrão 3000). No fim
//                     imprime, foto a foto: hora prevista, hora aceita, atraso, tentativas,
//                     resultado; espera 20 s pelas fotos e sai. Responde: qual o menor espaço
//                     que a câmera aceita, quanto a foto atrasa quando se insiste, e se insistir
//                     atrapalha (travar, foto não baixar).
//   --defer           (com --repeat) não baixa as fotos durante os disparos: a câmera as
//                     segura na memória interna e o programa baixa todas depois do último
//                     disparo, em ordem. Mede quantas fotos a câmera aguenta segurar (sem
//                     cartão: se a memória encher, ela recusa o disparo) e tira o download
//                     (~1 s cada) do caminho do disparo.
// Comandos (digitar e Enter) enquanto a câmera está aberta:
//   s   dispara uma foto      l   lista de novo as câmeras que o SDK vê
//   o   tenta abrir a sessão das OUTRAS câmeras (espera-se erro: estão com outro processo)
//   q   fecha e sai
// Tudo que acontece vai para a tela e para <pasta>/log-<câmera>.txt, com o horário em ms.

#if defined(_WIN32) && !defined(NOMINMAX)
#define NOMINMAX  // o EDSDK.h inclui windows.h, que define min/max e quebra std::max
#endif
#if defined(_WIN32) && !defined(_CRT_SECURE_NO_WARNINGS)
#define _CRT_SECURE_NO_WARNINGS  // sscanf (leitura do --at) é tratado como erro pelo compilador da Microsoft
#endif
#include "EDSDK.h"
#include "platform/platform.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>
#ifdef _WIN32
#include <process.h>
#else
#include <unistd.h>
#endif

namespace fs = std::filesystem;

namespace
{
    std::ofstream g_logFile;
    std::mutex g_logMutex;
    std::string g_tag = "test";
    std::atomic<int> g_downloaded{ 0 };
    fs::path g_outDir;
    bool g_defer = false;                              // --defer: guardar e baixar depois
    std::vector<EdsDirectoryItemRef> g_deferredItems;  // fotos oferecidas pela câmera, na ordem

    std::string Now()
    {
        using namespace std::chrono;
        const auto now = system_clock::now();
        const std::time_t t = system_clock::to_time_t(now);
        const int ms = static_cast<int>(duration_cast<milliseconds>(now.time_since_epoch()).count() % 1000);
        const std::tm local = Platform::LocalTime(t);
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%02d:%02d:%02d.%03d", local.tm_hour, local.tm_min, local.tm_sec, ms);
        return buf;
    }

    void Log(const std::string& msg)
    {
        std::lock_guard<std::mutex> lock(g_logMutex);
        const std::string line = Now() + " [" + g_tag + "] " + msg;
        std::cout << line << std::endl;
        if (g_logFile.is_open())
            g_logFile << line << std::endl;
    }

    std::string Err(EdsError e)
    {
        char buf[16];
        std::snprintf(buf, sizeof(buf), "0x%08X", static_cast<unsigned>(e));
        std::string s = buf;
        if (e == EDS_ERR_OK) s += " (ok)";
        else if (e == EDS_ERR_DEVICE_BUSY) s += " (DEVICE_BUSY)";
        else if (e == EDS_ERR_DEVICE_NOT_FOUND) s += " (DEVICE_NOT_FOUND)";
        else if (e == EDS_ERR_COMM_DISCONNECTED) s += " (COMM_DISCONNECTED)";
        else if (e == EDS_ERR_SESSION_NOT_OPEN) s += " (SESSION_NOT_OPEN)";
        else if (e == EDS_ERR_TAKE_PICTURE_AF_NG) s += " (AF_NG)";
        return s;
    }

    struct Found
    {
        EdsCameraRef ref = nullptr;
        std::string model;
        std::string port;
    };

    // Lista as câmeras que o SDK vê agora. Quem chama solta as referências que não usar.
    std::vector<Found> ListCameras()
    {
        std::vector<Found> out;
        Platform::ProcessEvents(1000);  // Mac: o SDK só enxerga as câmeras depois de processar eventos
        EdsCameraListRef list = nullptr;
        EdsError err = EdsGetCameraList(&list);
        if (err != EDS_ERR_OK || list == nullptr)
        {
            Log("EdsGetCameraList: " + Err(err));
            return out;
        }
        EdsUInt32 count = 0;
        EdsGetChildCount(list, &count);
        Log("EdsGetCameraList: " + std::to_string(count) + " camera(s)");
        for (EdsUInt32 i = 0; i < count; ++i)
        {
            Found f;
            if (EdsGetChildAtIndex(list, i, &f.ref) != EDS_ERR_OK || f.ref == nullptr)
                continue;
            EdsDeviceInfo info{};
            if (EdsGetDeviceInfo(f.ref, &info) == EDS_ERR_OK)
            {
                f.model = info.szDeviceDescription;
                f.port = info.szPortName;
            }
            Log("  [" + std::to_string(i) + "] " + f.model + "  port=" + f.port);
            out.push_back(f);
        }
        EdsRelease(list);
        return out;
    }

    void DownloadDeferred()
    {
        Log("downloading " + std::to_string(g_deferredItems.size()) + " deferred photo(s)");
        for (EdsDirectoryItemRef item : g_deferredItems)
        {
            EdsDirectoryItemInfo info{};
            EdsError err = EdsGetDirectoryItemInfo(item, &info);
            if (err == EDS_ERR_OK)
            {
                fs::create_directories(g_outDir);
                const fs::path path = g_outDir / (g_tag + "_" + Now().substr(0, 8) + "_" + std::string(info.szFileName));
                std::string clean = path.string();
                for (char& c : clean) if (c == ':') c = '-';
                EdsStreamRef stream = nullptr;
                err = EdsCreateFileStream(clean.c_str(), kEdsFileCreateDisposition_CreateAlways, kEdsAccess_ReadWrite, &stream);
                if (err == EDS_ERR_OK)
                {
                    err = EdsDownload(item, info.size, stream);
                    if (err == EDS_ERR_OK)
                        err = EdsDownloadComplete(item);
                    EdsRelease(stream);
                }
                Log("download " + clean + ": " + Err(err));
                if (err == EDS_ERR_OK)
                    ++g_downloaded;
            }
            else
                Log("EdsGetDirectoryItemInfo: " + Err(err));
            EdsRelease(item);
        }
        g_deferredItems.clear();
    }

    EdsError EDSCALLBACK OnObjectEvent(EdsObjectEvent event, EdsBaseRef object, EdsVoid*)
    {
        if (event == kEdsObjectEvent_DirItemRequestTransfer && object != nullptr && g_defer)
        {
            g_deferredItems.push_back(static_cast<EdsDirectoryItemRef>(object));
            Log("photo offered by the camera; kept there (deferred, " + std::to_string(g_deferredItems.size()) + " waiting)");
            return EDS_ERR_OK;
        }
        if (event == kEdsObjectEvent_DirItemRequestTransfer && object != nullptr)
        {
            EdsDirectoryItemInfo info{};
            EdsError err = EdsGetDirectoryItemInfo(static_cast<EdsDirectoryItemRef>(object), &info);
            if (err == EDS_ERR_OK)
            {
                fs::create_directories(g_outDir);
                const fs::path path = g_outDir / (g_tag + "_" + Now().substr(0, 8) + "_" + std::string(info.szFileName));
                std::string clean = path.string();
                for (char& c : clean) if (c == ':') c = '-';
                EdsStreamRef stream = nullptr;
                err = EdsCreateFileStream(clean.c_str(), kEdsFileCreateDisposition_CreateAlways, kEdsAccess_ReadWrite, &stream);
                if (err == EDS_ERR_OK)
                {
                    err = EdsDownload(static_cast<EdsDirectoryItemRef>(object), info.size, stream);
                    if (err == EDS_ERR_OK)
                        err = EdsDownloadComplete(static_cast<EdsDirectoryItemRef>(object));
                    EdsRelease(stream);
                }
                Log("download " + clean + ": " + Err(err));
                if (err == EDS_ERR_OK)
                    ++g_downloaded;
            }
            else
                Log("EdsGetDirectoryItemInfo: " + Err(err));
        }
        if (object)
            EdsRelease(object);
        return EDS_ERR_OK;
    }

    EdsError EDSCALLBACK OnStateEvent(EdsStateEvent event, EdsUInt32 param, EdsVoid*)
    {
        char buf[64];
        std::snprintf(buf, sizeof(buf), "state event 0x%08X param %u", static_cast<unsigned>(event), static_cast<unsigned>(param));
        Log(buf);
        return EDS_ERR_OK;
    }

    // Deixa o SDK entregar eventos (Mac: run loop; os dois: EdsGetEvent) por `ms`
    void Pump(int ms)
    {
        const auto end = std::chrono::steady_clock::now() + std::chrono::milliseconds(ms);
        do
        {
            Platform::ProcessEvents(0);
            EdsGetEvent();
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
        } while (std::chrono::steady_clock::now() < end);
    }

    EdsError OpenSession(EdsCameraRef cam)
    {
        // Como no app: a sessão abre numa thread auxiliar (no Mac pode levar ~40 s) e o
        // run loop continua rodando aqui.
        std::atomic<bool> done{ false };
        EdsError err = EDS_ERR_OK;
        std::thread worker([&]()
        {
            Platform::BeginSdkThread();
            err = EdsOpenSession(cam);
            Platform::EndSdkThread();
            done = true;
        });
        const auto start = std::chrono::steady_clock::now();
        int tick = 0;
        while (!done)
        {
            Platform::ProcessEvents(0);
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            if (++tick % 50 == 0)
                Log("  ... opening session (" + std::to_string(tick / 10) + " s)");
        }
        worker.join();
        const double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
        Log("EdsOpenSession: " + Err(err) + " in " + std::to_string(s).substr(0, 5) + " s");
        return err;
    }

    // Uma foto com insistência: pede, e se a câmera recusa ("busy") pede de novo a cada
    // `everyMs` até aceitar ou passar `maxMs`. Devolve o resultado, quantas vezes pediu e
    // quando (ms do relógio) a câmera aceitou.
    struct FireResult { EdsError err = EDS_ERR_OK; int attempts = 0; long long acceptedMs = 0; };
    long long WallMs() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count(); }
    FireResult FireWithRetry(EdsCameraRef cam, bool retry, int maxMs, int everyMs)
    {
        FireResult r;
        const long long start = WallMs();
        while (true)
        {
            ++r.attempts;
            r.err = EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely_NonAF);
            r.acceptedMs = WallMs();
            if (r.err == EDS_ERR_OK || !retry || r.err != EDS_ERR_DEVICE_BUSY || r.acceptedMs - start >= maxMs)
                break;
            Pump(everyMs);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
        return r;
    }

    bool Shoot(EdsCameraRef cam)
    {
        // Registra ANTES de cada chamada: se o SDK travar dentro dela, a linha "calling"
        // fica sem a resposta e mostra onde parou.
        Log("calling PressShutter DOWN");
        const EdsError down = EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely_NonAF);
        Log("PressShutter DOWN: " + Err(down));
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        Log("calling PressShutter OFF");
        const EdsError off = EdsSendCommand(cam, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
        Log("PressShutter OFF: " + Err(off));
        return down == EDS_ERR_OK;
    }

    // Lê o teclado numa thread, para o run loop continuar girando
    std::mutex g_cmdMutex;
    std::queue<std::string> g_cmds;
    void ReadCommands()
    {
        std::string line;
        while (std::getline(std::cin, line))
        {
            std::lock_guard<std::mutex> lock(g_cmdMutex);
            g_cmds.push(line);
        }
    }

    bool ParseAt(const std::string& hhmmss, std::chrono::system_clock::time_point& when)
    {
        int h = 0, m = 0, s = 0;
        if (std::sscanf(hhmmss.c_str(), "%d:%d:%d", &h, &m, &s) != 3)
            return false;
        const std::time_t now = std::time(nullptr);
        std::tm local = Platform::LocalTime(now);
        local.tm_hour = h; local.tm_min = m; local.tm_sec = s;
        const std::time_t target = std::mktime(&local);
        when = std::chrono::system_clock::from_time_t(target);
        return true;
    }
}

int main(int argc, char** argv)
{
    Platform::InitConsole();
    bool list = false;
    int cameraIndex = -1;
    std::string model;
    std::string at;
    int waitSeconds = 90;
    int repeat = 0, gapMs = 0, retryMaxMs = 3000, retryEveryMs = 50;
    bool retry = false;
    g_outDir = Platform::DownloadsFolder().parent_path() / "Desktop" / "sdk-multiproc-test";
    for (int i = 1; i < argc; ++i)
    {
        const std::string a = argv[i];
        auto next = [&](std::string& v) { if (i + 1 < argc) v = argv[++i]; };
        if (a == "--list") list = true;
        else if (a == "--camera") { std::string v; next(v); cameraIndex = std::atoi(v.c_str()); }
        else if (a == "--model") next(model);
        else if (a == "--out") { std::string v; next(v); g_outDir = v; }
        else if (a == "--at") next(at);
        else if (a == "--wait") { std::string v; next(v); waitSeconds = std::atoi(v.c_str()); }
        else if (a == "--repeat") { std::string v; next(v); repeat = std::atoi(v.c_str()); }
        else if (a == "--gap") { std::string v; next(v); gapMs = std::atoi(v.c_str()); }
        else if (a == "--retry") retry = true;
        else if (a == "--defer") g_defer = true;
        else if (a == "--retry-max") { std::string v; next(v); retryMaxMs = std::atoi(v.c_str()); }
        else if (a == "--retry-every") { std::string v; next(v); retryEveryMs = std::max(1, std::atoi(v.c_str())); }
        else { std::cerr << "Opção desconhecida: " << a << "\n"; return 2; }
    }
    if (!list && cameraIndex < 0 && model.empty())
    {
        std::cerr << "Uso: SdkMultiprocTest --list | --camera N | --model T7 [--out pasta] [--at HH:MM:SS] [--repeat N --gap MS [--retry]]\n";
        return 2;
    }
    if (repeat > 0 && gapMs <= 0)
    {
        std::cerr << "--repeat precisa de --gap MS (espaço entre as fotos, em ms)\n";
        return 2;
    }

    Log("pid " + std::to_string(static_cast<long long>(
#ifdef _WIN32
        _getpid()
#else
        getpid()
#endif
        )));
    EdsError err = EdsInitializeSDK();
    Log("EdsInitializeSDK: " + Err(err));
    if (err != EDS_ERR_OK)
        return 1;

    std::vector<Found> cams = ListCameras();
    {
        // Espera as câmeras aparecerem (lista de novo a cada 2 s)
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(waitSeconds);
        int waited = 0;
        while (cams.empty() && std::chrono::steady_clock::now() < deadline)
        {
            Pump(2000);
            waited += 2;
            if (waited % 10 == 0)
                Log("  ... no cameras yet (" + std::to_string(waited) + " s). Are they on and plugged in?");
            cams = ListCameras();
        }
    }
    if (list)
    {
        for (auto& c : cams) EdsRelease(c.ref);
        EdsTerminateSDK();
        Log("EdsTerminateSDK");
        return 0;
    }

    int chosen = -1;
    for (size_t i = 0; i < cams.size(); ++i)
    {
        if (cameraIndex >= 0 && static_cast<int>(i) == cameraIndex) chosen = static_cast<int>(i);
        if (!model.empty() && chosen < 0 && cams[i].model.find(model) != std::string::npos) chosen = static_cast<int>(i);
    }
    if (chosen < 0)
    {
        Log("camera not found");
        for (auto& c : cams) EdsRelease(c.ref);
        EdsTerminateSDK();
        return 1;
    }
    for (size_t i = 0; i < cams.size(); ++i)
        if (static_cast<int>(i) != chosen) EdsRelease(cams[i].ref);
    EdsCameraRef cam = cams[chosen].ref;
    g_tag = cams[chosen].model;
    for (char& c : g_tag) if (c == ' ' || c == '/') c = '_';
    fs::create_directories(g_outDir);
    g_logFile.open((g_outDir / ("log-" + g_tag + ".txt")).string(), std::ios::app);
    Log("---- chosen [" + std::to_string(chosen) + "] " + cams[chosen].model + " port=" + cams[chosen].port);

    EdsSetObjectEventHandler(cam, kEdsObjectEvent_All, OnObjectEvent, nullptr);
    EdsSetCameraStateEventHandler(cam, kEdsStateEvent_All, OnStateEvent, nullptr);

    if (OpenSession(cam) != EDS_ERR_OK)
    {
        EdsRelease(cam);
        EdsTerminateSDK();
        return 1;
    }
    EdsUInt32 saveTo = kEdsSaveTo_Host;
    Log("SaveTo_Host: " + Err(EdsSetPropertyData(cam, kEdsPropID_SaveTo, 0, sizeof(saveTo), &saveTo)));
    EdsCapacity capacity{};
    capacity.numberOfFreeClusters = 0x7FFFFFFF;
    capacity.bytesPerSector = 512;
    capacity.reset = 1;
    Log("SetCapacity: " + Err(EdsSetCapacity(cam, capacity)));

    if (repeat > 0)
    {
        // Medição: N fotos nesta câmera, uma a cada gapMs pelo relógio, a partir de daqui a 2 s
        Pump(2000);
        Log("repeat test: " + std::to_string(repeat) + " shots, gap " + std::to_string(gapMs) + " ms, retry " +
            (retry ? "on (every " + std::to_string(retryEveryMs) + " ms, up to " + std::to_string(retryMaxMs) + " ms)" : "off") +
            (g_defer ? ", downloads deferred until after the last shot" : ""));
        struct Row { long long planned, accepted; int attempts; EdsError err; };
        std::vector<Row> rows;
        const long long t0 = WallMs() + 1000;
        for (int i = 0; i < repeat; ++i)
        {
            const long long planned = t0 + static_cast<long long>(i) * gapMs;
            while (WallMs() < planned)
            {
                Platform::ProcessEvents(0);
                EdsGetEvent();
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
            Log("shot " + std::to_string(i + 1) + ": calling PressShutter DOWN");
            const FireResult r = FireWithRetry(cam, retry, retryMaxMs, retryEveryMs);
            Log("shot " + std::to_string(i + 1) + ": " + Err(r.err) + " after " + std::to_string(r.attempts) + " attempt(s), " +
                std::to_string(r.acceptedMs - planned) + " ms late");
            rows.push_back({ planned, r.acceptedMs, r.attempts, r.err });
        }
        if (g_defer)
        {
            Pump(1500);  // deixa a câmera oferecer a última foto
            const long long before = WallMs();
            DownloadDeferred();
            Log("deferred downloads took " + std::to_string(WallMs() - before) + " ms");
        }
        Log("waiting 20 s for the photos");
        Pump(20000);
        if (g_defer && !g_deferredItems.empty())
            DownloadDeferred();  // alguma foto só foi oferecida agora
        Log("---- repeat test summary (gap " + std::to_string(gapMs) + " ms, retry " + (retry ? "on" : "off") + (g_defer ? ", deferred" : "") + ")");
        Log("shot | planned +ms | accepted +ms | late ms | attempts | result");
        int ok = 0;
        for (size_t i = 0; i < rows.size(); ++i)
        {
            const Row& w = rows[i];
            if (w.err == EDS_ERR_OK) ++ok;
            Log(std::to_string(i + 1) + " | " + std::to_string(w.planned - t0) + " | " + std::to_string(w.accepted - t0) + " | " +
                std::to_string(w.accepted - w.planned) + " | " + std::to_string(w.attempts) + " | " + Err(w.err));
        }
        Log("accepted " + std::to_string(ok) + "/" + std::to_string(rows.size()) + "; photos downloaded: " + std::to_string(g_downloaded.load()));
        Log("EdsCloseSession: " + Err(EdsCloseSession(cam)));
        EdsRelease(cam);
        EdsTerminateSDK();
        return 0;
    }

    std::chrono::system_clock::time_point shootAt;
    bool scheduled = false;
    if (!at.empty())
    {
        if (!ParseAt(at, shootAt)) { Log("--at: use HH:MM:SS"); }
        else { scheduled = true; Log("will shoot at " + at); }
    }
    else
        Log("ready. commands: s = shoot, l = list, o = open others, q = quit");

    std::thread reader(ReadCommands);
    reader.detach();

    bool shotDone = false;
    std::chrono::steady_clock::time_point quitAt{};
    // Vigia: se o laço principal ficar mais de 5 s sem girar (SDK travado), avisa na tela
    std::atomic<long long> lastLoopMs{ 0 };
    auto nowMs = []() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); };
    lastLoopMs = nowMs();
    std::thread([&]()
    {
        while (true)
        {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            const long long idle = nowMs() - lastLoopMs.load();
            if (idle > 5000 && idle % 5000 < 1000)
                Log("!! main loop stuck for " + std::to_string(idle / 1000) + " s (SDK call not returning)");
        }
    }).detach();
    int heartbeat = 0;
    while (true)
    {
        Pump(50);
        lastLoopMs = nowMs();
        if (scheduled && !shotDone && ++heartbeat % 600 == 0)
            Log("  ... waiting for " + at);
        if (scheduled && !shotDone && std::chrono::system_clock::now() >= shootAt)
        {
            Shoot(cam);
            shotDone = true;
            quitAt = std::chrono::steady_clock::now() + std::chrono::seconds(20);
        }
        if (shotDone && std::chrono::steady_clock::now() >= quitAt)
        {
            Log("downloaded " + std::to_string(g_downloaded.load()) + " photo(s); quitting");
            break;
        }
        std::string cmd;
        {
            std::lock_guard<std::mutex> lock(g_cmdMutex);
            if (!g_cmds.empty()) { cmd = g_cmds.front(); g_cmds.pop(); }
        }
        if (cmd.empty())
            continue;
        if (cmd == "s")
            Shoot(cam);
        else if (cmd == "l")
        {
            std::vector<Found> again = ListCameras();
            for (auto& c : again) EdsRelease(c.ref);
        }
        else if (cmd == "o")
        {
            std::vector<Found> again = ListCameras();
            for (auto& c : again)
            {
                if (c.port == cams[chosen].port) { EdsRelease(c.ref); continue; }
                Log("trying EdsOpenSession on " + c.model + " (other process's camera)");
                const EdsError e = EdsOpenSession(c.ref);
                Log("  result: " + Err(e));
                if (e == EDS_ERR_OK)
                {
                    Log("  !! opened — closing again: " + Err(EdsCloseSession(c.ref)));
                }
                EdsRelease(c.ref);
            }
        }
        else if (cmd == "q")
            break;
        else
            Log("unknown command: " + cmd);
    }

    Log("EdsCloseSession: " + Err(EdsCloseSession(cam)));
    EdsRelease(cam);
    EdsTerminateSDK();
    Log("EdsTerminateSDK; photos downloaded: " + std::to_string(g_downloaded.load()));
    return 0;
}
