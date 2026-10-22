#include "camera_fleet.h"

#include <fstream>

#include "audio_player.h"
#include "camera_settings_text.h"
#include "logger.h"
#include "path_utils.h"
#include "sdk_diagnostics.h"
#include "worker_protocol.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <iomanip>
#include <random>
#include <sstream>
#include <thread>

namespace fs = std::filesystem;
using Clock = std::chrono::steady_clock;

namespace
{
    constexpr int kClaimWaitSeconds = 60;      // quanto um trabalhador procura uma câmera livre
    constexpr int kOpenTimeoutSeconds = 100;   // abrindo a sessão (T7 recém-ligada: ~40 s)
    constexpr int kReplyTimeoutMs = 20000;     // configurações, identificação
    constexpr int kPingAfterMs = 5000;         // parado há tanto tempo: pergunta se está vivo
    constexpr int kPongTimeoutMs = 15000;      // sem resposta: travou

    long long NowEpochMs()
    {
        return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
    }

    int SecondsSince(Clock::time_point t)
    {
        return static_cast<int>(std::chrono::duration_cast<std::chrono::seconds>(Clock::now() - t).count());
    }

    std::string BaseShortName(const std::string& model)
    {
        // "Canon EOS Rebel T7" -> "T7", "Canon EOS REBEL T5" -> "T5", "Canon EOS 850D" -> "850D"
        std::string m = model;
        for (auto& c : m) c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
        const std::string rebel = "REBEL ";
        const auto r = m.find(rebel);
        std::string tail = r != std::string::npos ? model.substr(r + rebel.size()) : "";
        if (tail.empty())
        {
            const std::string eos = "EOS ";
            const auto e = m.find(eos);
            if (e != std::string::npos)
                tail = model.substr(e + eos.size());
        }
        std::string base;
        for (char c : tail)
        {
            if (c == ' ') break;
            if (isalnum(static_cast<unsigned char>(c)))
                base += static_cast<char>(toupper(static_cast<unsigned char>(c)));
        }
        return base.empty() ? "CAM" : base;
    }

    std::string Prefix2(int value)
    {
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%02d", value);
        return buf;
    }
}

CameraFleet::CameraFleet(BulletTimeListener& listener) : listener(listener) {}

CameraFleet::~CameraFleet()
{
    Stop();
}

// Fotos recusadas pela câmera nesta sessão: ".missing" na pasta da sessão (uma linha por foto:
// "<nº> <câmera> <erro>"), para a lista de sessões mostrar a etiqueta mesmo depois de reabrir
void CameraFleet::WriteMissingMark()
{
    if (refusedShots.empty() || sessionDir.empty())
        return;
    std::ofstream out((sessionDir / ".missing").string(), std::ios::trunc);
    for (const auto& line : refusedShots)
        out << line << "\n";
}

bool CameraFleet::Start()
{
    const fs::path dir = Platform::ExecutableDirectory();
#ifdef _WIN32
    workerExe = dir / "StillpointWorker.exe";
#else
    workerExe = dir / "StillpointWorker";
#endif
    logDir = Platform::AppDataFolder() / "Logs";
    std::error_code ec;
    started = fs::exists(workerExe, ec);
    if (!started)
        Log("Camera worker program not found: " + workerExe.string());
    nextClaim = Clock::now();
    return started;
}

void CameraFleet::Stop()
{
    CloseSessions();
    started = false;
}

void CameraFleet::CloseSessions()
{
    for (auto& w : workers)
    {
        if (w->process && w->process->Running())
        {
            w->process->WriteLine("quit");
            w->quitting = true;
        }
    }
    // Até 3 s para fecharem a sessão direito; o resto é encerrado à força
    const auto deadline = Clock::now() + std::chrono::seconds(3);
    while (Clock::now() < deadline)
    {
        bool anyRunning = false;
        for (auto& w : workers)
            if (w->process && w->process->Running())
                anyRunning = true;
        if (!anyRunning)
            break;
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    workers.clear();  // o destrutor encerra os que ficaram
    for (auto& cam : cameras)
    {
        if (!cam.fake)
        {
            cam.sessionOpen = false;
            cam.connectionLost = true;
        }
    }
}

void CameraFleet::ResetConnectionHistory()
{
    avoidIndexes.clear();
    claimFailures = 0;
    lostAt.clear();
    nextClaim = Clock::now();
}

void CameraFleet::WaitPendingConnections()
{
    // Trabalhadores ainda procurando câmera: não vale esperar (até 60 s); são encerrados
    for (auto it = workers.begin(); it != workers.end();)
    {
        if (!(*it)->claimed) it = workers.erase(it);
        else ++it;
    }
}

CameraFleet::Worker* CameraFleet::WorkerFor(const std::string& shortName)
{
    for (auto& w : workers)
        if (w->claimed && w->shortName == shortName && w->process && w->process->Running())
            return w.get();
    return nullptr;
}

const CameraFleet::Worker* CameraFleet::WorkerFor(const std::string& shortName) const
{
    for (const auto& w : workers)
        if (w->claimed && w->shortName == shortName && w->process)
            return w.get();
    return nullptr;
}

CameraContext* CameraFleet::CameraNamed(const std::string& shortName)
{
    for (auto& cam : cameras)
        if (cam.shortName == shortName)
            return &cam;
    return nullptr;
}

void CameraFleet::SpawnClaimer()
{
    std::vector<std::string> args{ workerExe.string(), "--wait", std::to_string(kClaimWaitSeconds), "--log", logDir.string() };
    if (!avoidIndexes.empty())
    {
        std::string list;
        for (int i : avoidIndexes)
            list += (list.empty() ? "" : ",") + std::to_string(i);
        args.push_back("--avoid");
        args.push_back(list);
    }
    auto w = std::make_unique<Worker>();
    w->process = Platform::ChildProcess::Spawn(args);
    w->started = w->lastSeen = Clock::now();
    if (!w->process)
    {
        Log("Could not start the camera worker program.");
        nextClaim = Clock::now() + std::chrono::seconds(10);
        return;
    }
    workers.push_back(std::move(w));
}

bool CameraFleet::MonitorTick(ConnectionObserver* observer)
{
    if (!started)
        return false;
    bool changed = false;
    PumpWorkers(observer, changed);

    // Câmeras Canon no USB (sem o SDK): quantas deveriam estar conectadas
    const auto now = Clock::now();
    if (now - lastUsbCheck > std::chrono::milliseconds(1000))
    {
        lastUsbCheck = now;
        int totalUsb = -1;
        const auto devices = Platform::CanonUsbDevices(totalUsb);
        int count = totalUsb < 0 ? -1 : static_cast<int>(devices.size());
        std::map<std::string, Clock::time_point> seen;
        for (const auto& d : devices)
        {
            const auto it = usbFirstSeen.find(d.location);
            seen[d.location] = it != usbFirstSeen.end() ? it->second : now;
        }
        if (seen.size() != usbFirstSeen.size())
            avoidIndexes.clear();  // a lista do SDK mudou de forma: os índices também
        usbFirstSeen = seen;
        if (count != usbCameras)
        {
            usbCameras = count;
            claimFailures = 0;
            nextClaim = now;
            changed = true;
        }
    }

    int claimed = 0, claiming = 0;
    for (auto& w : workers)
    {
        if (!w->process || !w->process->Running() || w->quitting)
            continue;
        if (w->claimed) ++claimed; else ++claiming;
    }
    // Sem leitura do USB: um trabalhador de cada vez procurando, sempre
    const int wanted = usbCameras < 0 ? claimed + 1 : usbCameras;
    if (claimed + claiming < wanted && claiming == 0 && now >= nextClaim)
        SpawnClaimer();
    // Com alguém conectando, a página redesenha a cada volta (os segundos andam)
    if (claiming > 0 || !GetStartingCameras().empty())
        changed = true;
    return changed;
}

void CameraFleet::PumpWorkers(ConnectionObserver* observer, bool& changed)
{
    const auto now = Clock::now();
    for (size_t i = 0; i < workers.size(); ++i)
    {
        Worker& w = *workers[i];
        if (!w.process)
            continue;
        std::string line;
        while (w.process->ReadLine(line))
        {
            w.lastSeen = now;
            HandleLine(w, WorkerProtocol::Split(line), observer, changed);
        }
        if (!w.process->Running())
        {
            if (w.quitting)
                continue;
            DropWorker(w, w.claimed ? "the camera process ended" : "", changed);
            continue;
        }
        // Vigia: abrindo há tempo demais / parado sem responder
        if (!w.claimed)
        {
            if (w.tryingIndex >= 0 && now - w.lastSeen > std::chrono::seconds(kOpenTimeoutSeconds))
            {
                avoidIndexes.insert(w.tryingIndex);
                Log("Opening camera " + w.model + " did not finish in " + std::to_string(kOpenTimeoutSeconds) + " s; that USB entry is skipped for now.");
                w.process->Kill();
                DropWorker(w, "", changed);
            }
            else if (now - w.started > std::chrono::seconds(kClaimWaitSeconds + 30))
            {
                w.process->Kill();
                DropWorker(w, "", changed);
            }
        }
        else if (now - w.lastSeen > std::chrono::milliseconds(kPingAfterMs + kPongTimeoutMs))
        {
            Log("[" + w.shortName + "] not responding; restarting its process.");
            w.process->Kill();
            DropWorker(w, "camera process stopped responding", changed);
        }
        else if (now - w.lastSeen > std::chrono::milliseconds(kPingAfterMs) && !w.pinged)
        {
            w.pinged = true;
            w.process->WriteLine("ping");
        }
    }
    // Tira os encerrados
    workers.erase(std::remove_if(workers.begin(), workers.end(),
        [](const std::unique_ptr<Worker>& w) { return !w->process || !w->process->Running(); }), workers.end());
}

void CameraFleet::DropWorker(Worker& w, const std::string& reason, bool& changed)
{
    if (w.claimed)
    {
        if (CameraContext* cam = CameraNamed(w.shortName))
        {
            cam->sessionOpen = false;
            cam->connectionLost = true;
            lostAt[w.serial] = Clock::now();
            if (!reason.empty())
                Log("[" + w.shortName + "] disconnected: " + reason);
        }
        changed = true;
        nextClaim = Clock::now() + std::chrono::seconds(2);
    }
    else
    {
        ++claimFailures;
        nextClaim = Clock::now() + std::chrono::seconds(std::min(15, 2 + 3 * claimFailures));
    }
    w.claimed = false;
    w.quitting = true;  // some da lista no fim do PumpWorkers
}

void CameraFleet::HandleLine(Worker& w, const std::vector<std::string>& f, ConnectionObserver* observer, bool& changed)
{
    if (f.empty())
        return;
    const std::string& kind = f[0];
    if (kind == "pong")
        w.pinged = false;
    else if (kind == "log" && f.size() >= 2)
        Log((w.shortName.empty() ? std::string("[camera] ") : "[" + w.shortName + "] ") + f[1]);
    else if (kind == "trying" && f.size() >= 3)
    {
        w.tryingIndex = std::atoi(f[1].c_str());
        w.model = f[2];
        changed = true;
    }
    else if (kind == "openfail")
    {
        w.tryingIndex = -1;
        if (f.size() >= 4 && f[3] != "0x000000C0")  // 0xC0 = outra cópia já tem essa câmera: normal
            Log("Could not open " + (f.size() >= 3 ? f[2] : std::string("camera")) + ": " + f[3]);
    }
    else if (kind == "claimed" && f.size() >= 5)
    {
        w.tryingIndex = -1;
        claimFailures = 0;
        AdoptCamera(w, f[1], f[2], std::atof(f[4].c_str()), observer);
        changed = true;
    }
    else if (kind == "none")
    {
        w.quitting = true;
        ++claimFailures;
        nextClaim = Clock::now() + std::chrono::seconds(std::min(15, 2 + 3 * claimFailures));
    }
    else if (kind == "lost")
    {
        w.process->WriteLine("quit");
        DropWorker(w, f.size() >= 2 ? f[1] : "", changed);
    }
    else if (kind == "bye")
        w.quitting = true;
    else if (kind == "hello")
        ;  // nada a fazer
    else
        w.inbox.push_back(f);  // fired/photo/settings/...: quem pediu consome
}

void CameraFleet::AdoptCamera(Worker& w, const std::string& model, const std::string& serial, double seconds, ConnectionObserver* observer)
{
    w.claimed = true;
    w.model = model;
    w.serial = serial;
    CameraContext* cam = nullptr;
    for (auto& c : cameras)
        if (!c.fake && c.portName == serial)
            cam = &c;
    if (cam == nullptr)
    {
        CameraContext fresh;
        fresh.modelName = model;
        fresh.portName = serial;  // identidade estável: número de série
        fresh.baseShortName = BaseShortName(model);
        fresh.onCompatibilityList = IsOnCompatibilityList(model);
        int index = 1;
        auto taken = [&](int i) { return std::any_of(cameras.begin(), cameras.end(), [&](const CameraContext& c) { return c.baseShortName == fresh.baseShortName && c.modelIndex == i; }); };
        while (taken(index)) ++index;
        fresh.modelIndex = index;
        fresh.shortName = fresh.baseShortName + "_" + std::to_string(index);
        int maxOrder = 0;
        for (const auto& c : cameras) maxOrder = std::max(maxOrder, c.orderPrefix);
        fresh.orderPrefix = maxOrder + 1;
        cameras.push_back(fresh);
        cam = &cameras.back();
    }
    cam->sessionOpen = true;
    cam->connectionLost = false;
    cam->lastError = 0;
    cam->lastShotError = 0;
    w.shortName = cam->shortName;
    w.process->WriteLine(WorkerProtocol::Join({ "name", cam->shortName, std::to_string(cam->orderPrefix) }));
    lostAt.erase(serial);
    if (observer)
        observer->OnConnected(*cam, seconds);
    Log("Camera connected: " + model + " [" + cam->shortName + "] in " + std::to_string(seconds).substr(0, 4) + " s (process " + std::to_string(w.process->Pid()) + ")");
}

std::vector<PendingConnectionInfo> CameraFleet::GetPendingConnections() const
{
    std::vector<PendingConnectionInfo> out;
    // Câmeras que caíram e ainda não voltaram: aparecem como "reconectando" enquanto há
    // um trabalhador procurando
    std::vector<const CameraContext*> lost;
    for (const auto& cam : cameras)
        if (!cam.fake && !cam.sessionOpen)
            lost.push_back(&cam);
    size_t nextLost = 0;
    for (const auto& w : workers)
    {
        if (w->claimed || w->quitting || !w->process)
            continue;
        PendingConnectionInfo p;
        p.seconds = SecondsSince(w->started);
        if (nextLost < lost.size())
        {
            const CameraContext* cam = lost[nextLost++];
            p.name = cam->shortName;
            p.model = cam->modelName;
            p.order = cam->orderPrefix;
            p.reconnecting = true;
        }
        else
        {
            p.model = w->model.empty() ? "Canon camera" : w->model;
            p.name = "";
        }
        out.push_back(p);
    }
    return out;
}

bool CameraFleet::HasPendingConnections() const
{
    // Para a janela: "conectando" só bloqueia os comandos enquanto o SDK estava num
    // processo só. Com um processo por câmera, os comandos para as conectadas seguem.
    return false;
}

std::vector<StartingCameraInfo> CameraFleet::GetStartingCameras() const
{
    // Câmeras no USB a mais do que trabalhadores (conectados ou procurando): ligando
    std::vector<StartingCameraInfo> out;
    if (usbCameras < 0)
        return out;
    int busy = 0;
    for (const auto& w : workers)
        if (w->process && !w->quitting)
            ++busy;
    std::vector<Clock::time_point> firsts;
    for (const auto& [location, first] : usbFirstSeen)
        firsts.push_back(first);
    std::sort(firsts.begin(), firsts.end(), std::greater<>());  // as mais recentes primeiro
    for (int i = 0; i < usbCameras - busy && i < static_cast<int>(firsts.size()); ++i)
    {
        StartingCameraInfo s;
        s.seconds = SecondsSince(firsts[i]);
        out.push_back(s);
    }
    return out;
}

bool CameraFleet::WaitReply(Worker& w, const std::string& name, std::vector<std::string>& reply, int timeoutMs)
{
    const auto deadline = Clock::now() + std::chrono::milliseconds(timeoutMs);
    while (true)
    {
        for (auto it = w.inbox.begin(); it != w.inbox.end(); ++it)
        {
            if (!it->empty() && (*it)[0] == name)
            {
                reply = *it;
                w.inbox.erase(it);
                return true;
            }
        }
        if (!w.process || !w.process->Running())
            return false;
        if (Clock::now() >= deadline)
            return false;
        std::string line;
        bool got = false;
        while (w.process->ReadLine(line))
        {
            got = true;
            w.lastSeen = Clock::now();
            bool changed = false;
            HandleLine(w, WorkerProtocol::Split(line), nullptr, changed);
        }
        if (!got)
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
}

CameraSettings CameraFleet::ReadSettings(const CameraContext& camera)
{
    if (camera.fake)
        return CameraSettingsCanon::Read(camera);
    CameraSettings s;
    s.camera = camera.shortName;
    s.model = camera.modelName;
    Worker* w = WorkerFor(camera.shortName);
    if (!w)
    {
        s.reason = "Camera is not connected.";
        return s;
    }
    w->process->WriteLine("settings");
    std::vector<std::string> reply;
    if (!WaitReply(*w, "settings", reply, kReplyTimeoutMs) || reply.size() < 2)
    {
        bool changed = false;
        Log("[" + camera.shortName + "] did not answer the settings request; restarting its process.");
        w->process->Kill();
        DropWorker(*w, "stopped responding", changed);
        s.reason = "Camera is not responding; reconnecting.";
        return s;
    }
    s = CameraSettingsText::Decode(reply[1]);
    s.camera = camera.shortName;
    return s;
}

bool CameraFleet::WriteSetting(const CameraContext& camera, const std::string& key, long long value, std::string& error)
{
    if (camera.fake)
        return CameraSettingsCanon::Write(camera, key, value, error);
    Worker* w = WorkerFor(camera.shortName);
    if (!w)
    {
        error = "camera is not connected";
        return false;
    }
    w->process->WriteLine(WorkerProtocol::Join({ "set", key, std::to_string(value) }));
    std::vector<std::string> reply;
    if (!WaitReply(*w, "setresult", reply, kReplyTimeoutMs) || reply.size() < 2)
    {
        bool changed = false;
        w->process->Kill();
        DropWorker(*w, "stopped responding", changed);
        error = "camera is not responding";
        return false;
    }
    if (reply[1] == "ok")
        return true;
    error = reply.size() >= 3 ? reply[2] : "could not change the setting";
    return false;
}

bool CameraFleet::TestCamera(const CameraContext& camera)
{
    if (camera.fake)
        return true;
    Worker* w = WorkerFor(camera.shortName);
    if (!w)
        return false;
    w->process->WriteLine("identify");
    std::vector<std::string> reply;
    return WaitReply(*w, "identified", reply, 10000);
}

bool CameraFleet::PrepareSessionFolder(int sessionIndex, int totalSessions, const std::string& shotId)
{
    try
    {
        const std::time_t t = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
        const std::tm local = Platform::LocalTime(t);
        std::ostringstream name;
        name << std::put_time(&local, "%Y-%m-%d_%H-%M-%S");
        if (totalSessions > 1)
            name << "_" << shotId << "_session_" << std::setw(2) << std::setfill('0') << sessionIndex;
        sessionDir = baseOutputDir / name.str();
        fs::create_directories(sessionDir);
        for (auto& cam : cameras)
            cam.currentShotDir = sessionDir;
        Log("\n📁 Session folder: " + sessionDir.string());
        return true;
    }
    catch (const std::exception& e)
    {
        Log(std::string("\n⚠️  Failed to create session folder: ") + e.what());
        return false;
    }
}

bool CameraFleet::SetCameraPrefix(const std::string& shortName, int newPrefix)
{
    if (newPrefix <= 0)
        return false;
    CameraContext* target = nullptr;
    CameraContext* existing = nullptr;
    for (auto& cam : cameras)
    {
        if (cam.shortName == shortName) target = &cam;
        if (cam.orderPrefix == newPrefix) existing = &cam;
    }
    if (!target)
        return false;
    if (target->orderPrefix == newPrefix)
        return true;
    const int old = target->orderPrefix;
    if (existing && existing != target)
        existing->orderPrefix = old;
    target->orderPrefix = newPrefix;
    Log("Prefix updated: " + shortName + " -> " + Prefix2(newPrefix));
    RenumberCameras();
    return true;
}

void CameraFleet::SetCameraOrder(const std::vector<std::string>& shortNames)
{
    std::vector<CameraContext*> ordered;
    for (const auto& name : shortNames)
        for (auto& cam : cameras)
            if (cam.shortName == name && std::find(ordered.begin(), ordered.end(), &cam) == ordered.end())
                ordered.push_back(&cam);
    std::vector<CameraContext*> rest;
    for (auto& cam : cameras)
        if (std::find(ordered.begin(), ordered.end(), &cam) == ordered.end())
            rest.push_back(&cam);
    std::sort(rest.begin(), rest.end(), [](const CameraContext* a, const CameraContext* b) { return a->orderPrefix < b->orderPrefix; });
    ordered.insert(ordered.end(), rest.begin(), rest.end());
    for (size_t i = 0; i < ordered.size(); ++i)
        ordered[i]->orderPrefix = static_cast<int>(i) + 1;
    Log("Camera order updated.");
    RenumberCameras();
}

void CameraFleet::RenumberCameras()
{
    // Os trabalhadores precisam saber a posição nova (nome dos arquivos)
    for (auto& cam : cameras)
        if (Worker* w = WorkerFor(cam.shortName))
            w->process->WriteLine(WorkerProtocol::Join({ "name", cam.shortName, std::to_string(cam.orderPrefix) }));
}

void CameraFleet::Pump(int ms)
{
    const auto end = Clock::now() + std::chrono::milliseconds(ms);
    do
    {
        bool changed = false;
        PumpWorkers(nullptr, changed);
        Platform::ProcessEvents(0);
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    } while (Clock::now() < end);
}

std::string CameraFleet::GenerateShotId()
{
    static const char charset[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, sizeof(charset) - 2);
    std::string id;
    for (int i = 0; i < 4; ++i)
        id += charset[dist(gen)];
    return id;
}

bool CameraFleet::RunCountdown(int seconds, bool playSounds)
{
    // Igual ao núcleo (BulletTime::RunCountdown) com sons sobrepostos, como a janela usa
    const auto countdownAudio = GetAssetAudioPath("countdown.wav");
    const auto bulletTimeAudio = GetAssetAudioPath("itsbullettime.wav");
    if (seconds > 0)
    {
        listener.OnCountdownStarted(seconds);
        for (int i = seconds; i >= 1; --i)
        {
            listener.OnCountdownTick(i);
            if (playSounds)
                AudioPlayer::PlayWavMixed(countdownAudio.string());
            for (int step = 0; step < 10; ++step)
            {
                if (cancelRequested)
                    return false;
                Pump(100);
            }
        }
    }
    if (cancelRequested)
        return false;
    listener.OnTrigger();
    if (playSounds)
    {
        AudioPlayer::PlayWavMixed(countdownAudio.string());
        AudioPlayer::PlayWavMixed(bulletTimeAudio.string(), true);
    }
    return true;
}

bool CameraFleet::RunSequence(const SequenceSettings& settings)
{
    bool sequenceAborted = false;
    bool cancelled = false;
    cancelRequested = false;
    std::string shotId;
    if (settings.sessionCount > 1)
        shotId = GenerateShotId();

    const auto groupAudio = GetAssetAudioPath("group.wav");
    const auto countdownAudio = GetAssetAudioPath("countdown.wav");

    for (int sessionIndex = 1; sessionIndex <= settings.sessionCount; ++sessionIndex)
    {
        if (cancelRequested) { cancelled = true; break; }
        listener.OnSessionStarted(sessionIndex, settings.sessionCount);
        if (!PrepareSessionFolder(sessionIndex, settings.sessionCount, shotId))
        {
            listener.OnSessionFolderFailed();
            sequenceAborted = true;
            break;
        }
        if (!RunCountdown(settings.countdownSeconds, settings.playSounds))
        {
            std::error_code ec;
            fs::remove(sessionDir, ec);  // só apaga se estiver vazia
            cancelled = true;
            break;
        }
        Pump(150);

        // Plano: um item por foto. Todas juntas = cada câmera conectada no 0, com a sua
        // posição como número do arquivo; com plano, o número é a posição do item (1..n).
        struct Item { std::string camera; int prefix; int atMs; };
        std::vector<Item> plan;
        const bool scheduled = !settings.schedule.empty();
        if (!scheduled)
        {
            for (const auto& cam : cameras)
                if (cam.sessionOpen)
                    plan.push_back({ cam.shortName, cam.orderPrefix, 0 });
        }
        else
            for (size_t i = 0; i < settings.schedule.size(); ++i)
                plan.push_back({ settings.schedule[i].shortName, static_cast<int>(i) + 1, settings.schedule[i].atMs });

        // Cada trabalhador recebe só os itens da sua câmera; o instante zero é o mesmo
        // para todos (relógio do computador), um pouco à frente para a ordem chegar
        const long long t0 = NowEpochMs() + 250;
        expectedDownloads = 0;
        completedDownloads = 0;
        refusedShots.clear();
        std::map<std::string, std::string> perCamera;
        for (const auto& item : plan)
        {
            if (!WorkerFor(item.camera))
                continue;
            std::string& list = perCamera[item.camera];
            list += (list.empty() ? "" : ",") + std::to_string(item.prefix) + ":" + std::to_string(item.atMs);
            ++expectedDownloads;
        }
        for (const auto& [camera, items] : perCamera)
        {
            Worker* w = WorkerFor(camera);
            w->inbox.clear();
            w->process->WriteLine(WorkerProtocol::Join({ "shoot", std::to_string(t0), sessionDir.string(), camera, items }));
        }
        Log("Waiting for downloads from " + std::to_string(expectedDownloads) + " camera shot(s)");

        // Sons durante o plano (como no núcleo): som do grupo quando ele sai, metrônomo
        // entre grupos; e os avisos de disparo conforme os trabalhadores respondem
        const bool sounds = settings.groupSounds && settings.playSounds && scheduled;
        std::vector<int> times;
        for (const auto& item : plan) times.push_back(item.atMs);
        int tickedSecond = 0;
        size_t nextSound = 0;
        auto fireMomentSounds = [&]()
        {
            const long long elapsed = NowEpochMs() - t0;
            while (nextSound < plan.size() && elapsed >= plan[nextSound].atMs)
            {
                const size_t index = nextSound + 1;  // 1..n
                const int gapBefore = index > 1 ? plan[index - 1].atMs - plan[index - 2].atMs : 0;
                if (sounds && index > 1 && gapBefore >= 500)
                {
                    AudioPlayer::PlayWavMixed(groupAudio.string(), true);
                    const int at = plan[index - 1].atMs;
                    const bool last = !std::any_of(plan.begin() + index, plan.end(), [at](const Item& s) { return s.atMs > at; });
                    if (gapBefore > 1500 && !last && std::abs(at - static_cast<int>((at + 500) / 1000) * 1000) <= 300)
                        AudioPlayer::PlayWavMixed(countdownAudio.string());
                }
                ++nextSound;
            }
            if (sounds && nextSound < plan.size())
            {
                const size_t next = nextSound + 1;
                const int gap = next >= 2 ? plan[next - 1].atMs - plan[next - 2].atMs : 0;
                if (gap > 1500)
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
                            AudioPlayer::PlayWavMixed(countdownAudio.string());
                    }
                }
            }
        };

        // Lê os avisos dos trabalhadores: disparos (OnShotFired), fotos (progresso), falhas
        std::set<std::string> shootDone;
        auto consume = [&]()
        {
            for (auto& w : workers)
            {
                if (!w->claimed || !w->process)
                    continue;
                while (!w->inbox.empty())
                {
                    const auto f = w->inbox.front();
                    w->inbox.pop_front();
                    if (f[0] == "fired" && f.size() >= 5)
                    {
                        const int prefix = std::atoi(f[1].c_str());
                        const bool ok = f[2] == "ok";
                        CameraContext* cam = CameraNamed(w->shortName);
                        if (!ok)
                        {
                            --expectedDownloads;
                            refusedShots.push_back(std::to_string(prefix) + " " + w->shortName + " " + f[3]);
                            if (cam)
                            {
                                cam->lastShotError = static_cast<long>(std::strtoul(f[3].c_str(), nullptr, 16));
                                listener.OnShotFailed(*cam, cam->lastShotError);
                            }
                        }
                        if (scheduled && cam)
                        {
                            int index = 0;
                            for (size_t i = 0; i < plan.size(); ++i)
                                if (plan[i].camera == w->shortName && plan[i].prefix == prefix)
                                    index = static_cast<int>(i) + 1;
                            listener.OnShotFired(*cam, index, static_cast<int>(plan.size()), ok);
                        }
                    }
                    else if (f[0] == "photo")
                    {
                        ++completedDownloads;
                        if (f.size() >= 3)
                            Log("[" + w->shortName + "] Downloaded: " + f[2]);
                    }
                    else if (f[0] == "photofail")
                        Log("[" + w->shortName + "] Download failed" + (f.size() >= 3 ? " (" + f[2] + ")" : ""));
                    else if (f[0] == "shootdone")
                        shootDone.insert(w->shortName);
                }
            }
        };

        // Espera todos os disparos saírem (mantendo os sons no tempo certo)
        int lastAt = 0;
        for (int t : times) lastAt = std::max(lastAt, t);
        bool allFired = false;
        while (!allFired)
        {
            Pump(5);
            consume();
            fireMomentSounds();
            if (cancelRequested)
            {
                for (auto& [camera, items] : perCamera)
                    if (Worker* w = WorkerFor(camera))
                        w->process->WriteLine("cancel");
                break;
            }
            allFired = NowEpochMs() - t0 > lastAt + 300;
            for (const auto& [camera, items] : perCamera)
                if (WorkerFor(camera) && !shootDone.count(camera))
                    allFired = false;
            if (NowEpochMs() - t0 > lastAt + 5000)  // trabalhador que não respondeu ao plano
                allFired = true;
        }
        consume();

        listener.OnWaitingForDownloads();
        const int maxWaitMs = settings.downloadWaitSeconds * 1000;
        const auto waitStart = Clock::now();
        bool sessionFailed = false;
        while (true)
        {
            Pump(50);
            consume();
            listener.OnDownloadProgress(completedDownloads, expectedDownloads);
            if (completedDownloads >= expectedDownloads && expectedDownloads > 0)
                break;
            if (expectedDownloads <= 0)
                break;
            if (cancelRequested) { cancelled = true; break; }
            if (Clock::now() - waitStart > std::chrono::milliseconds(maxWaitMs))
            {
                // Quem não respondeu a um ping em 2 s é dado como caído
                for (auto& w : workers)
                    if (w->claimed && w->process && w->process->Running())
                    {
                        w->pinged = true;
                        w->process->WriteLine("ping");
                    }
                Pump(2000);
                std::vector<const CameraContext*> lost;
                for (auto& w : workers)
                {
                    if (!w->claimed)
                        continue;
                    if (!w->process || !w->process->Running() || w->pinged)
                    {
                        if (const CameraContext* cam = CameraNamed(w->shortName))
                            lost.push_back(cam);
                        if (w->process && w->process->Running())
                        {
                            w->process->Kill();
                            bool changed = false;
                            DropWorker(*w, "stopped responding during the download", changed);
                        }
                    }
                }
                listener.OnDownloadTimeout(lost);
                sessionFailed = true;
                sequenceAborted = true;
                break;
            }
        }
        WriteMissingMark();
        if (sessionFailed)
        {
            listener.OnSessionInterrupted();
            break;
        }
        if (cancelled)
            break;
        listener.OnSessionCompleted();
    }

    if (cancelled)
        listener.OnSequenceCancelled();
    listener.OnSequenceFinished(!sequenceAborted && !cancelled);
    return !sequenceAborted && !cancelled;
}
