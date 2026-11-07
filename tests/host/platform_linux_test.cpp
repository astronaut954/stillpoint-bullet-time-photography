// Só para o teste automático do Stillpoint no Linux (tests/host): as funções do sistema, simples.
// Nada daqui entra no app de verdade (Mac e Windows têm as suas em src/platform).
#include "platform/platform.h"

#include <chrono>
#include <csignal>
#include <cstdlib>
#include <fcntl.h>
#include <fstream>
#include <spawn.h>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>

extern char** environ;
namespace fs = std::filesystem;

namespace Platform
{
    namespace
    {
        fs::path Env(const char* name, const fs::path& fallback)
        {
            const char* v = std::getenv(name);
            return v && *v ? fs::path(v) : fallback;
        }
        fs::path Home() { return Env("HOME", "/tmp"); }
        // O que o app pediu para abrir (o teste confere): uma linha por pedido
        void Note(const std::string& what)
        {
            std::ofstream out(AppDataFolder() / "test-opened.txt", std::ios::app);
            out << what << "\n";
        }
        pid_t SpawnRaw(const std::vector<std::string>& args)
        {
            std::vector<char*> argv;
            for (const auto& a : args) argv.push_back(const_cast<char*>(a.c_str()));
            argv.push_back(nullptr);
            pid_t child = 0;
            return posix_spawnp(&child, argv[0], nullptr, nullptr, argv.data(), environ) == 0 ? child : -1;
        }
    }

    void InitConsole() {}
    fs::path ExecutableDirectory()
    {
        std::error_code ec;
        return fs::read_symlink("/proc/self/exe", ec).parent_path();
    }
    fs::path ResourcesDirectory() { return Env("STILLPOINT_RESOURCES", ExecutableDirectory()); }
    fs::path DownloadsFolder() { return Home() / "Downloads"; }
    fs::path PicturesFolder() { return Home() / "Pictures"; }
    fs::path AppDataFolder() { return Env("STILLPOINT_DATA", Home() / ".stillpoint-test"); }
    std::tm LocalTime(std::time_t t) { std::tm out{}; localtime_r(&t, &out); return out; }
    ProcessUsage QueryProcessUsage(long long) { return {}; }
    SystemUsage QuerySystemUsage() { return {}; }
    void ProcessEvents(int milliseconds) { if (milliseconds > 0) std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds)); }
    void DiscardPendingInput() {}
    void BeginSdkThread() {}
    void EndSdkThread() {}
    bool SdkSessionsInWorkerThreads() { return true; }
    std::vector<UsbDevice> CanonUsbDevices(int& totalUsb) { totalUsb = 0; return {}; }
    bool RelaunchAfterExit() { return false; }
    void WaitForPreviousInstance() {}
    fs::path CurlExecutable() { return "curl"; }
    int RunProcess(const std::vector<std::string>& args, int timeoutSeconds, const std::atomic<bool>* cancel)
    {
        if (args.empty()) return -1;
        const pid_t child = SpawnRaw(args);
        if (child <= 0) return -1;
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(timeoutSeconds);
        for (;;)
        {
            int status = 0;
            const pid_t done = waitpid(child, &status, WNOHANG);
            if (done == child) return WIFEXITED(status) ? WEXITSTATUS(status) : -1;
            if (done < 0) return -1;
            if ((cancel && cancel->load()) || std::chrono::steady_clock::now() > deadline)
            {
                kill(child, SIGTERM);
                waitpid(child, &status, 0);
                return -1;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }

    // Processo auxiliar: não há câmeras no teste
    std::unique_ptr<ChildProcess> ChildProcess::Spawn(const std::vector<std::string>&) { return nullptr; }
    ChildProcess::~ChildProcess() {}
    bool ChildProcess::WriteLine(const std::string&) { return false; }
    bool ChildProcess::ReadLine(std::string&) { return false; }
    bool ChildProcess::Running() { return false; }
    void ChildProcess::Kill() {}

    std::string Sha256OfFile(const fs::path&) { return ""; }
    bool CanSelfUpdate(std::string& reason) { reason = "test"; return false; }
    bool StartUpdateInstall(const fs::path&, std::string& error) { error = "test"; return false; }
    void OpenUrl(const std::string& url) { Note("url " + url); }
    void OpenInFileManager(const fs::path& folder) { Note("folder " + folder.string()); }
    void RevealInFileManager(const fs::path& file) { Note("reveal " + file.string()); }
    void OpenWithDefaultApp(const fs::path& file) { Note("open " + file.string()); }
    bool OpenWithApplication(const fs::path& app, const std::vector<fs::path>& files)
    {
        std::string text = "app " + app.string();
        for (const auto& f : files) text += " | " + f.string();
        Note(text);
        return true;
    }
    std::string ApplicationVersion(const fs::path&) { return "15.6"; }
    bool ApplicationRunning(const fs::path&) { return std::getenv("STILLPOINT_TEST_LR_RUNNING") != nullptr; }
}
