#pragma once

// Coordenador das câmeras na interface gráfica (etapa 16): cada câmera de verdade fica
// num processo trabalhador próprio (StillpointWorker), e este objeto faz o papel que o
// CanonController + BulletTime faziam para a janela: lista de câmeras, conexão e
// reconexão, disparo (todas juntas ou com plano), fotos, configurações e identificação.
// O app de janela não carrega mais o SDK da Canon: se uma câmera trava o SDK, só o
// processo dela para — o coordenador o encerra e abre outro.
//
// Câmeras simuladas (STILLPOINT_FAKE_CAMERAS) continuam dentro do app, sem processos.
//
// Chamar só na thread das câmeras (como antes com o CanonController), exceto
// RequestCancel, que pode vir de qualquer thread.

#include "bullet_time.h"      // SequenceSettings, BulletTimeListener, CameraContext
#include "camera_settings.h"
#include "platform/platform.h"

#include <atomic>
#include <chrono>
#include <deque>
#include <filesystem>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

class CameraFleet
{
public:
    explicit CameraFleet(BulletTimeListener& listener);
    ~CameraFleet();
    CameraFleet(const CameraFleet&) = delete;
    CameraFleet& operator=(const CameraFleet&) = delete;

    // Acha o programa trabalhador. false = não existe ao lado do app (sem câmeras reais).
    bool Start();
    // Encerra todos os trabalhadores (sessões fechadas).
    void Stop();

    std::vector<CameraContext>& GetCameras() { return cameras; }
    const std::vector<CameraContext>& GetCameras() const { return cameras; }

    // Tempo real (a cada ~0,4 s): abre trabalhadores para câmeras novas no USB, lê os
    // avisos deles, marca as que caíram e as religa. Retorna true se a lista mudou.
    bool MonitorTick(ConnectionObserver* observer);
    std::vector<PendingConnectionInfo> GetPendingConnections() const;
    bool HasPendingConnections() const;
    std::vector<StartingCameraInfo> GetStartingCameras() const;
    void WaitPendingConnections();
    void ResetConnectionHistory();
    // "Restart camera connections": fecha todos os trabalhadores; o MonitorTick reabre.
    void CloseSessions();

    // --- Disparo (o que BulletTime::RunSequence fazia) ---
    bool RunSequence(const SequenceSettings& settings);
    void RequestCancel() { cancelRequested = true; }
    bool TestCamera(const CameraContext& camera);

    // --- Configurações (o que CameraSettingsCanon fazia; simuladas continuam lá) ---
    CameraSettings ReadSettings(const CameraContext& camera);
    bool WriteSetting(const CameraContext& camera, const std::string& key, long long value, std::string& error);

    // --- Pastas e ordem (como no CanonController) ---
    void SetOutputFolder(const std::string& folderPath) { baseOutputDir = folderPath; }
    std::string GetOutputFolder() const { return baseOutputDir.string(); }
    bool PrepareSessionFolder(int sessionIndex, int totalSessions, const std::string& shotId);
    bool SetCameraPrefix(const std::string& shortName, int newPrefix);
    void SetCameraOrder(const std::vector<std::string>& shortNames);

    // PIDs dos processos de câmera vivos (rodapé do Activity). Chamar na thread das câmeras.
    std::vector<long long> WorkerPids() const
    {
        std::vector<long long> out;
        for (const auto& w : workers)
            if (w && w->process && w->process->Pid() > 0)
                out.push_back(w->process->Pid());
        return out;
    }

private:
    struct Worker
    {
        std::unique_ptr<Platform::ChildProcess> process;
        std::string serial;              // "" até o "claimed"
        std::string model;
        std::string shortName;           // câmera do app que ele atende ("" até ter)
        std::chrono::steady_clock::time_point started;
        std::chrono::steady_clock::time_point lastSeen;  // último aviso recebido
        bool claimed = false;
        bool quitting = false;
        bool pinged = false;             // "ping" mandado, "pong" ainda não veio
        int tryingIndex = -1;            // entrada da lista do SDK que está abrindo
        // Avisos fora de ordem guardados para quem espera uma resposta específica
        std::deque<std::vector<std::string>> inbox;
    };

    BulletTimeListener& listener;
    std::vector<CameraContext> cameras;
    std::vector<std::unique_ptr<Worker>> workers;
    std::filesystem::path workerExe;
    std::filesystem::path logDir;
    std::filesystem::path baseOutputDir;
    std::filesystem::path sessionDir;
    std::atomic<bool> cancelRequested{ false };
    bool started = false;

    // Procura de câmeras
    std::chrono::steady_clock::time_point lastUsbCheck{};
    std::chrono::steady_clock::time_point nextClaim{};
    int usbCameras = 0;                              // câmeras Canon no USB agora
    std::map<std::string, std::chrono::steady_clock::time_point> usbFirstSeen;  // por entrada USB
    int claimFailures = 0;                           // "none" seguidos (espera cresce)
    std::set<int> avoidIndexes;                      // entradas do SDK que travaram ao abrir
    std::map<std::string, std::chrono::steady_clock::time_point> lostAt;  // série -> quando caiu

    // Disparo em andamento
    int expectedDownloads = 0;
    int completedDownloads = 0;
    // Disparos que a câmera recusou nesta sessão ("<nº da foto> <câmera> <erro>", um por
    // linha); no fim vão para o arquivo ".missing" da pasta da sessão (etiqueta na lista)
    std::vector<std::string> refusedShots;
    void WriteMissingMark();

    Worker* WorkerFor(const std::string& shortName);
    const Worker* WorkerFor(const std::string& shortName) const;
    CameraContext* CameraNamed(const std::string& shortName);
    void SpawnClaimer();
    void PumpWorkers(ConnectionObserver* observer, bool& changed);
    void HandleLine(Worker& w, const std::vector<std::string>& fields, ConnectionObserver* observer, bool& changed);
    void AdoptCamera(Worker& w, const std::string& model, const std::string& serial, double seconds, ConnectionObserver* observer);
    void DropWorker(Worker& w, const std::string& reason, bool& changed);
    // Espera uma resposta com esse nome (guardando as outras no inbox); false = tempo esgotado
    bool WaitReply(Worker& w, const std::string& name, std::vector<std::string>& reply, int timeoutMs);
    void HandleAsync(Worker& w, const std::vector<std::string>& fields);  // fired/photo/log durante o disparo
    void RenumberCameras();
    bool RunCountdown(int seconds, bool playSounds);
    static std::string GenerateShotId();
    void Pump(int ms);
};
