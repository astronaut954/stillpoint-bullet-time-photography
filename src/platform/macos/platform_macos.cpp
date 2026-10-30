#include "platform/platform.h"

#include <CommonCrypto/CommonDigest.h>
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <mach-o/dyld.h>
#include <libproc.h>
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <sys/sysctl.h>
#include <signal.h>
#include <fcntl.h>
#include <poll.h>
#include <spawn.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#include <cerrno>
#include <chrono>
#include <climits>
#include <cstdio>
#include <clocale>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <string>
#include <thread>
#include <vector>

extern char** environ;

namespace fs = std::filesystem;

namespace Platform
{
    void InitConsole()
    {
        // O Terminal do macOS já usa UTF-8; só alinhamos a localidade do programa.
        setlocale(LC_ALL, "");
    }

    fs::path ExecutableDirectory()
    {
        uint32_t size = 0;
        _NSGetExecutablePath(nullptr, &size);

        std::vector<char> buffer(size + 1, '\0');
        if (_NSGetExecutablePath(buffer.data(), &size) != 0)
        {
            return fs::current_path();
        }

        char resolved[PATH_MAX];
        if (realpath(buffer.data(), resolved) == nullptr)
        {
            return fs::path(buffer.data()).parent_path();
        }

        return fs::path(resolved).parent_path();
    }

    fs::path ResourcesDirectory()
    {
        // Dentro do aplicativo: .../Stillpoint.app/Contents/MacOS/<programa>
        const fs::path exe = ExecutableDirectory();
        if (exe.filename() == "MacOS" && exe.parent_path().filename() == "Contents")
        {
            std::error_code ec;
            const fs::path resources = exe.parent_path() / "Resources";
            if (fs::is_directory(resources / "assets", ec))
                return resources;
        }
        return exe;
    }

    fs::path DownloadsFolder()
    {
        const char* home = std::getenv("HOME");
        if (home != nullptr && *home != '\0')
        {
            return fs::path(home) / "Downloads";
        }

        return fs::current_path();
    }

    ProcessUsage QueryProcessUsage(long long pid)
    {
        ProcessUsage out;
        proc_taskinfo info{};
        const int got = proc_pidinfo(pid > 0 ? static_cast<int>(pid) : getpid(), PROC_PIDTASKINFO, 0, &info, sizeof info);
        if (got != static_cast<int>(sizeof info))
            return out;
        // pti_total_user/system vêm em unidades do relógio do Mach (no Apple Silicon não são ns)
        static mach_timebase_info_data_t tb = [] { mach_timebase_info_data_t t{}; mach_timebase_info(&t); return t; }();
        const double ns = static_cast<double>(info.pti_total_user + info.pti_total_system) * tb.numer / (tb.denom ? tb.denom : 1);
        out.cpuSeconds = ns / 1e9;
        out.residentBytes = static_cast<long long>(info.pti_resident_size);
        out.threads = info.pti_threadnum;
        out.ok = true;
        return out;
    }

    SystemUsage QuerySystemUsage()
    {
        SystemUsage out;
        host_cpu_load_info_data_t cpu{};
        mach_msg_type_number_t count = HOST_CPU_LOAD_INFO_COUNT;
        if (host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, reinterpret_cast<host_info_t>(&cpu), &count) != KERN_SUCCESS)
            return out;
        const double tick = static_cast<double>(sysconf(_SC_CLK_TCK));
        const double busy = static_cast<double>(cpu.cpu_ticks[CPU_STATE_USER] + cpu.cpu_ticks[CPU_STATE_SYSTEM] + cpu.cpu_ticks[CPU_STATE_NICE]);
        out.cpuBusySeconds = busy / tick;
        out.cpuTotalSeconds = (busy + static_cast<double>(cpu.cpu_ticks[CPU_STATE_IDLE])) / tick;
        out.cpuCount = static_cast<int>(sysconf(_SC_NPROCESSORS_ONLN));
        if (out.cpuCount < 1) out.cpuCount = 1;
        long long memsize = 0;
        size_t len = sizeof memsize;
        if (sysctlbyname("hw.memsize", &memsize, &len, nullptr, 0) == 0)
            out.memoryTotalBytes = memsize;
        vm_statistics64_data_t vm{};
        mach_msg_type_number_t vmCount = HOST_VM_INFO64_COUNT;
        vm_size_t page = 0;
        host_page_size(mach_host_self(), &page);
        if (host_statistics64(mach_host_self(), HOST_VM_INFO64, reinterpret_cast<host_info64_t>(&vm), &vmCount) == KERN_SUCCESS)
            out.memoryAvailableBytes = static_cast<long long>(vm.free_count + vm.inactive_count) * static_cast<long long>(page);
        out.ok = true;
        return out;
    }

    fs::path PicturesFolder()
    {
        const char* home = std::getenv("HOME");
        if (home != nullptr && *home != '\0')
            return fs::path(home) / "Pictures";
        return DownloadsFolder();
    }

    std::tm LocalTime(std::time_t t)
    {
        std::tm result{};
        localtime_r(&t, &result);
        return result;
    }

    void ProcessEvents(int milliseconds)
    {
        const CFTimeInterval seconds = milliseconds > 0 ? milliseconds / 1000.0 : 0.0;
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, seconds, false);
    }

    void BeginSdkThread() {}
    void EndSdkThread() {}
    bool SdkSessionsInWorkerThreads() { return true; }

    void DiscardPendingInput()
    {
        tcflush(STDIN_FILENO, TCIFLUSH);
    }

    namespace
    {
        // O app se chamava "Canon Bullet Time": se só a pasta antiga existe, ela é
        // renomeada para a nova (fotos guardadas e modelos aprendidos vão junto).
        fs::path MigrateDataFolder(const fs::path& base)
        {
            const fs::path current = base / "Stillpoint";
            const fs::path old = base / "Canon Bullet Time";
            std::error_code ec;
            if (!fs::exists(current, ec) && fs::is_directory(old, ec))
            {
                fs::rename(old, current, ec);
                if (ec)
                    return old;
            }
            return current;
        }
    }

    fs::path AppDataFolder()
    {
        const char* home = std::getenv("HOME");
        if (home != nullptr && *home != '\0')
            return MigrateDataFolder(fs::path(home) / "Library" / "Application Support");

        return MigrateDataFolder(fs::current_path());
    }

    namespace
    {
        // Câmera no USB = aparelho com uma interface de "imagem estática" (classe 6,
        // a usada pelas câmeras para fotos). Impressoras (7), scanners e outros
        // aparelhos da Canon não têm: não são contados como câmera.
        bool IsStillImageDevice(io_service_t device)
        {
            io_iterator_t children = 0;
            if (IORegistryEntryCreateIterator(device, kIOServicePlane, kIORegistryIterateRecursively, &children) != KERN_SUCCESS)
                return false;
            bool found = false;
            for (io_object_t child = IOIteratorNext(children); child != 0; child = IOIteratorNext(children))
            {
                if (!found)
                {
                    if (CFTypeRef value = IORegistryEntryCreateCFProperty(child, CFSTR("bInterfaceClass"), kCFAllocatorDefault, 0))
                    {
                        SInt32 interfaceClass = 0;
                        if (CFGetTypeID(value) == CFNumberGetTypeID()
                            && CFNumberGetValue(static_cast<CFNumberRef>(value), kCFNumberSInt32Type, &interfaceClass))
                            found = interfaceClass == 6;
                        CFRelease(value);
                    }
                }
                IOObjectRelease(child);
            }
            IOObjectRelease(children);
            return found;
        }
    }

    std::vector<UsbDevice> CanonUsbDevices(int& totalUsb)
    {
        std::vector<UsbDevice> devices;
        totalUsb = -1;

        // Todos os aparelhos USB; depois fica só com os da Canon (fabricante 0x04A9)
        CFMutableDictionaryRef matching = IOServiceMatching("IOUSBHostDevice");
        if (matching == nullptr)
            return devices;

        io_iterator_t iterator = 0;
        // IOServiceGetMatchingServices fica com "matching" (não liberar aqui)
        if (IOServiceGetMatchingServices(MACH_PORT_NULL, matching, &iterator) != KERN_SUCCESS)
            return devices;

        int total = 0;
        for (io_service_t service = IOIteratorNext(iterator); service != 0; service = IOIteratorNext(iterator))
        {
            ++total;
            SInt32 vendor = 0;
            if (CFTypeRef value = IORegistryEntryCreateCFProperty(service, CFSTR("idVendor"), kCFAllocatorDefault, 0))
            {
                if (CFGetTypeID(value) == CFNumberGetTypeID())
                    CFNumberGetValue(static_cast<CFNumberRef>(value), kCFNumberSInt32Type, &vendor);
                CFRelease(value);
            }
            if (vendor != 0x04A9 || !IsStillImageDevice(service))
            {
                IOObjectRelease(service);
                continue;
            }

            std::string name = "Canon USB device";
            if (CFTypeRef value = IORegistryEntryCreateCFProperty(service, CFSTR("USB Product Name"), kCFAllocatorDefault, 0))
            {
                if (CFGetTypeID(value) == CFStringGetTypeID())
                {
                    char buffer[256] = {};
                    if (CFStringGetCString(static_cast<CFStringRef>(value), buffer, sizeof(buffer), kCFStringEncodingUTF8))
                        name = buffer;
                }
                CFRelease(value);
            }

            std::string location = "?";
            if (CFTypeRef value = IORegistryEntryCreateCFProperty(service, CFSTR("locationID"), kCFAllocatorDefault, 0))
            {
                SInt64 id = 0;
                if (CFGetTypeID(value) == CFNumberGetTypeID() && CFNumberGetValue(static_cast<CFNumberRef>(value), kCFNumberSInt64Type, &id))
                {
                    char buffer[32] = {};
                    std::snprintf(buffer, sizeof(buffer), "0x%llx", static_cast<unsigned long long>(id));
                    location = buffer;
                }
                CFRelease(value);
            }

            SInt32 product = 0;
            if (CFTypeRef value = IORegistryEntryCreateCFProperty(service, CFSTR("idProduct"), kCFAllocatorDefault, 0))
            {
                if (CFGetTypeID(value) == CFNumberGetTypeID())
                    CFNumberGetValue(static_cast<CFNumberRef>(value), kCFNumberSInt32Type, &product);
                CFRelease(value);
            }

            devices.push_back(UsbDevice{ name, location, static_cast<int>(product) });
            IOObjectRelease(service);
        }
        IOObjectRelease(iterator);
        totalUsb = total;
        return devices;
    }

    bool RelaunchAfterExit()
    {
        uint32_t size = 0;
        _NSGetExecutablePath(nullptr, &size);
        std::vector<char> path(size + 1, '\0');
        if (_NSGetExecutablePath(path.data(), &size) != 0)
            return false;

        // A nova cópia recebe o número deste processo e espera ele terminar
        setenv("STILLPOINT_WAIT_PID", std::to_string(getpid()).c_str(), 1);
        pid_t child = 0;
        char* argv[] = { path.data(), nullptr };
        const int result = posix_spawn(&child, path.data(), nullptr, nullptr, argv, environ);
        unsetenv("STILLPOINT_WAIT_PID");
        return result == 0;
    }

    void WaitForPreviousInstance()
    {
        const char* value = std::getenv("STILLPOINT_WAIT_PID");
        if (value == nullptr)
            return;
        const pid_t previous = static_cast<pid_t>(std::atoi(value));
        unsetenv("STILLPOINT_WAIT_PID");
        // No máximo 20 s: a cópia anterior fecha em poucos segundos
        for (int i = 0; i < 200 && previous > 0 && kill(previous, 0) == 0; ++i)
            usleep(100000);
    }

    // ---------------------------------------------------------------------
    // Atualização do app
    // ---------------------------------------------------------------------
    namespace
    {
        // Pasta do .app em que este programa roda (vazia se não estiver num .app)
        fs::path AppBundle()
        {
            const fs::path exe = ExecutableDirectory();  // .../Stillpoint.app/Contents/MacOS
            if (exe.filename() != "MacOS" || exe.parent_path().filename() != "Contents")
                return {};
            const fs::path bundle = exe.parent_path().parent_path();
            return bundle.extension() == ".app" ? bundle : fs::path();
        }

        pid_t Spawn(const std::vector<std::string>& args)
        {
            std::vector<char*> argv;
            for (const auto& a : args)
                argv.push_back(const_cast<char*>(a.c_str()));
            argv.push_back(nullptr);
            pid_t child = 0;
            return posix_spawn(&child, argv[0], nullptr, nullptr, argv.data(), environ) == 0 ? child : -1;
        }

        // Espera o app fechar, troca o .app pelo do .dmg (com volta atrás se algo
        // falhar) e abre o app de novo. Argumentos: PID, .dmg, .app atual.
        const char* kUpdateScript = R"sh(#!/bin/sh
PID="$1"; DMG="$2"; APP="$3"
i=0
while kill -0 "$PID" 2>/dev/null && [ $i -lt 300 ]; do sleep 0.2; i=$((i+1)); done
MNT=$(mktemp -d "${TMPDIR:-/tmp}/stillpoint-update.XXXXXX") || { open "$APP"; exit 1; }
if hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$MNT" "$DMG" >/dev/null 2>&1; then
  DIR=$(dirname "$APP")
  NEW="$DIR/.Stillpoint-update-$$.app"
  OLD="$DIR/.Stillpoint-old-$$.app"
  rm -rf "$NEW"
  if ditto "$MNT/Stillpoint.app" "$NEW"; then
    if mv "$APP" "$OLD"; then
      if mv "$NEW" "$APP"; then rm -rf "$OLD"; else mv "$OLD" "$APP"; rm -rf "$NEW"; fi
    else
      rm -rf "$NEW"
    fi
  fi
  hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -force -quiet
fi
rmdir "$MNT" 2>/dev/null
rm -f "$DMG"
open "$APP"
)sh";
    }

    fs::path CurlExecutable()
    {
        return "/usr/bin/curl";
    }

    int RunProcess(const std::vector<std::string>& args, int timeoutSeconds, const std::atomic<bool>* cancel)
    {
        if (args.empty())
            return -1;
        const pid_t child = Spawn(args);
        if (child <= 0)
            return -1;
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(timeoutSeconds);
        for (;;)
        {
            int status = 0;
            const pid_t done = waitpid(child, &status, WNOHANG);
            if (done == child)
                return WIFEXITED(status) ? WEXITSTATUS(status) : -1;
            if (done < 0)
                return -1;
            if ((cancel && cancel->load()) || std::chrono::steady_clock::now() > deadline)
            {
                kill(child, SIGTERM);
                waitpid(child, &status, 0);
                return -1;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
    }

    // ---- Processo auxiliar (trabalhadores de câmera) ----

    std::unique_ptr<ChildProcess> ChildProcess::Spawn(const std::vector<std::string>& args)
    {
        if (args.empty())
            return nullptr;
        // Escrever num filho que já saiu não pode derrubar o app
        static const bool ignorePipe = (signal(SIGPIPE, SIG_IGN), true);
        (void)ignorePipe;
        int toChild[2] = { -1, -1 }, fromChild[2] = { -1, -1 };
        if (pipe(toChild) != 0)
            return nullptr;
        if (pipe(fromChild) != 0)
        {
            close(toChild[0]); close(toChild[1]);
            return nullptr;
        }
        posix_spawn_file_actions_t actions;
        posix_spawn_file_actions_init(&actions);
        posix_spawn_file_actions_adddup2(&actions, toChild[0], STDIN_FILENO);
        posix_spawn_file_actions_adddup2(&actions, fromChild[1], STDOUT_FILENO);
        posix_spawn_file_actions_addclose(&actions, toChild[0]);
        posix_spawn_file_actions_addclose(&actions, toChild[1]);
        posix_spawn_file_actions_addclose(&actions, fromChild[0]);
        posix_spawn_file_actions_addclose(&actions, fromChild[1]);
        std::vector<char*> argv;
        for (const auto& a : args)
            argv.push_back(const_cast<char*>(a.c_str()));
        argv.push_back(nullptr);
        pid_t child = 0;
        const int rc = posix_spawn(&child, argv[0], &actions, nullptr, argv.data(), environ);
        posix_spawn_file_actions_destroy(&actions);
        close(toChild[0]);
        close(fromChild[1]);
        if (rc != 0)
        {
            close(toChild[1]); close(fromChild[0]);
            return nullptr;
        }
        fcntl(fromChild[0], F_SETFL, fcntl(fromChild[0], F_GETFL) | O_NONBLOCK);
        // Os canais não passam para outros filhos (cada trabalhador tem o seu)
        fcntl(toChild[1], F_SETFD, FD_CLOEXEC);
        fcntl(fromChild[0], F_SETFD, FD_CLOEXEC);
        std::unique_ptr<ChildProcess> p(new ChildProcess());
        p->pid = child;
        p->writeFd = toChild[1];
        p->readFd = fromChild[0];
        return p;
    }

    ChildProcess::~ChildProcess()
    {
        if (Running())
            Kill();
        if (writeFd >= 0) close(writeFd);
        if (readFd >= 0) close(readFd);
    }

    bool ChildProcess::WriteLine(const std::string& line)
    {
        if (writeFd < 0)
            return false;
        const std::string data = line + "\n";
        size_t done = 0;
        while (done < data.size())
        {
            const ssize_t n = write(writeFd, data.data() + done, data.size() - done);
            if (n < 0)
            {
                if (errno == EINTR) continue;
                return false;  // EPIPE: o filho fechou (SIGPIPE é ignorado pelo app)
            }
            done += static_cast<size_t>(n);
        }
        return true;
    }

    bool ChildProcess::ReadLine(std::string& line)
    {
        if (readFd >= 0)
        {
            char chunk[4096];
            for (;;)
            {
                const ssize_t n = read(readFd, chunk, sizeof(chunk));
                if (n > 0) { buffer.append(chunk, static_cast<size_t>(n)); continue; }
                if (n < 0 && errno == EINTR) continue;
                break;  // nada mais agora (EAGAIN) ou canal fechado
            }
        }
        const size_t nl = buffer.find('\n');
        if (nl == std::string::npos)
            return false;
        line = buffer.substr(0, nl);
        if (!line.empty() && line.back() == '\r')
            line.pop_back();
        buffer.erase(0, nl + 1);
        return true;
    }

    bool ChildProcess::Running()
    {
        if (exited || pid <= 0)
            return false;
        int status = 0;
        const pid_t done = waitpid(static_cast<pid_t>(pid), &status, WNOHANG);
        if (done == static_cast<pid_t>(pid) || done < 0)
            exited = true;
        return !exited;
    }

    void ChildProcess::Kill()
    {
        if (exited || pid <= 0)
            return;
        kill(static_cast<pid_t>(pid), SIGKILL);
        int status = 0;
        waitpid(static_cast<pid_t>(pid), &status, 0);
        exited = true;
    }

    std::string Sha256OfFile(const fs::path& file)
    {
        std::ifstream in(file, std::ios::binary);
        if (!in)
            return "";
        CC_SHA256_CTX context;
        CC_SHA256_Init(&context);
        std::vector<char> buffer(1 << 16);
        while (in)
        {
            in.read(buffer.data(), static_cast<std::streamsize>(buffer.size()));
            const auto got = in.gcount();
            if (got > 0)
                CC_SHA256_Update(&context, buffer.data(), static_cast<CC_LONG>(got));
        }
        unsigned char digest[CC_SHA256_DIGEST_LENGTH] = {};
        CC_SHA256_Final(digest, &context);
        static const char* digits = "0123456789abcdef";
        std::string hex;
        for (unsigned char b : digest)
        {
            hex += digits[b >> 4];
            hex += digits[b & 15];
        }
        return hex;
    }

    bool CanSelfUpdate(std::string& reason)
    {
        const fs::path bundle = AppBundle();
        if (bundle.empty())
        {
            reason = "Stillpoint is not running from Stillpoint.app.";
            return false;
        }
        // Dentro do .dmg, ou "isolado" pelo macOS (aberto direto de Downloads), a pasta
        // não aceita escrita: precisa estar em Aplicativos
        if (access(bundle.parent_path().c_str(), W_OK) != 0)
        {
            reason = "Move Stillpoint to the Applications folder to update it from the app.";
            return false;
        }
        return true;
    }

    bool StartUpdateInstall(const fs::path& installer, std::string& error)
    {
        const fs::path bundle = AppBundle();
        if (bundle.empty())
        {
            error = "Stillpoint is not running from Stillpoint.app.";
            return false;
        }
        const fs::path script = fs::temp_directory_path() / "stillpoint-update.sh";
        {
            std::ofstream out(script, std::ios::binary | std::ios::trunc);
            out << kUpdateScript;
            if (!out)
            {
                error = "Could not prepare the update.";
                return false;
            }
        }
        if (Spawn({ "/bin/sh", script.string(), std::to_string(getpid()), installer.string(), bundle.string() }) <= 0)
        {
            error = "Could not start the update.";
            return false;
        }
        return true;
    }

    void OpenUrl(const std::string& url)
    {
        Spawn({ "/usr/bin/open", url });
    }

    void OpenInFileManager(const fs::path& folder)
    {
        Spawn({ "/usr/bin/open", folder.string() });
    }

    void RevealInFileManager(const fs::path& file)
    {
        Spawn({ "/usr/bin/open", "-R", file.string() });
    }

    void OpenWithDefaultApp(const fs::path& file)
    {
        Spawn({ "/usr/bin/open", file.string() });
    }
}
