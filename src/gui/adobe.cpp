#include "adobe.h"

#include "platform/platform.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <map>
#include <sstream>

namespace fs = std::filesystem;

namespace Adobe
{
    // Pendência do dono: confirmar a versão mínima com o Lightroom Classic de verdade (o plugin usa só
    // funções antigas do SDK; 11.0 é de 2021).
    const char* const kMinimumLightroom = "11.0";

    namespace
    {
        // Texto UTF-8 <-> caminho (no Windows, path::string() usa a página de código do sistema e estraga acentos)
        std::string Utf8(const fs::path& path)
        {
            const std::u8string text = path.u8string();
            return std::string(text.begin(), text.end());
        }
        fs::path FromUtf8(const std::string& text)
        {
            return fs::path(std::u8string(text.begin(), text.end()));
        }

        std::string Lower(std::string text)
        {
            std::transform(text.begin(), text.end(), text.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
            return text;
        }

        bool Exists(const fs::path& path)
        {
            std::error_code ec;
            return !path.empty() && fs::exists(path, ec);
        }

        std::string Env(const char* name)
        {
            const char* value = std::getenv(name);
            return value ? value : "";
        }

        // Pastas "Adobe Photoshop 2025", "Adobe Photoshop 2026"...: fica com a de número maior
        fs::path NewestPhotoshop(const fs::path& parent, const std::string& inside)
        {
            fs::path best;
            std::string bestName;
            std::error_code ec;
            for (fs::directory_iterator it(parent, ec), end; !ec && it != end; it.increment(ec))
            {
                const std::string name = Utf8(it->path().filename());
                if (name.rfind("Adobe Photoshop", 0) != 0 || !it->is_directory(ec))
                    continue;
                const fs::path candidate = inside.empty() ? it->path() / (name + ".app") : it->path() / inside;
                if (Exists(candidate) && (bestName.empty() || name > bestName))
                {
                    best = candidate;
                    bestName = name;
                }
            }
            return best;
        }

        // Linhas "nome=valor" de um arquivo pequeno
        std::multimap<std::string, std::string> ReadPairs(const fs::path& file)
        {
            std::multimap<std::string, std::string> pairs;
            std::ifstream in(file, std::ios::binary);
            for (std::string line; std::getline(in, line);)
            {
                if (!line.empty() && line.back() == '\r')
                    line.pop_back();
                const auto eq = line.find('=');
                if (eq != std::string::npos)
                    pairs.emplace(line.substr(0, eq), line.substr(eq + 1));
            }
            return pairs;
        }
        std::string Value(const std::multimap<std::string, std::string>& pairs, const std::string& key)
        {
            const auto it = pairs.find(key);
            return it == pairs.end() ? std::string() : it->second;
        }

        // Grava inteiro num arquivo temporário e troca de nome: quem lê nunca vê um arquivo pela metade
        bool WriteWhole(const fs::path& file, const std::string& text)
        {
            std::error_code ec;
            fs::create_directories(file.parent_path(), ec);
            const fs::path temp = file.parent_path() / (file.filename().string() + ".tmp");
            {
                std::ofstream out(temp, std::ios::binary | std::ios::trunc);
                out << text;
                if (!out)
                    return false;
            }
            fs::rename(temp, file, ec);
            if (ec)
            {
                // Windows: trocar de nome por cima de um arquivo aberto pode falhar; tenta apagar e trocar de novo
                fs::remove(file, ec);
                ec.clear();
                fs::rename(temp, file, ec);
            }
            return !ec;
        }

        // Uma linha por valor: sem quebras de linha dentro do valor
        std::string OneLine(std::string text)
        {
            std::replace(text.begin(), text.end(), '\n', ' ');
            std::replace(text.begin(), text.end(), '\r', ' ');
            return text;
        }
    }

    Found Find(Program program, const std::string& customPath)
    {
        Found result;
        fs::path path;
        if (!customPath.empty() && Exists(FromUtf8(customPath)))
        {
            path = FromUtf8(customPath);
            result.custom = true;
        }
#ifdef _WIN32
        if (path.empty())
        {
            for (const char* var : { "ProgramFiles", "ProgramW6432" })
            {
                const std::string base = Env(var);
                if (base.empty())
                    continue;
                const fs::path adobe = fs::path(base) / "Adobe";
                const fs::path candidate = program == Program::Lightroom
                    ? adobe / "Adobe Lightroom Classic" / "Lightroom.exe"
                    : NewestPhotoshop(adobe, "Photoshop.exe");
                if (Exists(candidate)) { path = candidate; break; }
            }
        }
#elif defined(__APPLE__)
        if (path.empty())
        {
            if (program == Program::Lightroom)
            {
                const fs::path candidate = "/Applications/Adobe Lightroom Classic/Adobe Lightroom Classic.app";
                if (Exists(candidate))
                    path = candidate;
            }
            else
                path = NewestPhotoshop("/Applications", "");
        }
#endif
        if (path.empty())
            return result;
        result.found = true;
        result.path = path;
        result.version = Platform::ApplicationVersion(path);
        return result;
    }

    bool LooksLike(Program program, const fs::path& path)
    {
        const std::string name = Lower(Utf8(path.filename()));
        return program == Program::Lightroom ? name.find("lightroom") != std::string::npos
                                             : name.find("photoshop") != std::string::npos;
    }

    int CompareVersions(const std::string& a, const std::string& b)
    {
        auto parts = [](const std::string& text)
        {
            std::vector<int> out;
            int value = 0;
            bool any = false;
            for (const char c : text)
            {
                if (c >= '0' && c <= '9') { value = value * 10 + (c - '0'); any = true; }
                else if (c == '.') { out.push_back(value); value = 0; any = false; }
                else break;  // "15.6 [20250101]": o resto não conta
            }
            if (any || !out.empty())
                out.push_back(value);
            return out;
        };
        const auto pa = parts(a), pb = parts(b);
        for (size_t i = 0; i < std::max(pa.size(), pb.size()); ++i)
        {
            const int x = i < pa.size() ? pa[i] : 0, y = i < pb.size() ? pb[i] : 0;
            if (x != y)
                return x < y ? -1 : 1;
        }
        return 0;
    }

    fs::path ModulesFolder()
    {
#ifdef _WIN32
        const std::string appData = Env("APPDATA");
        if (appData.empty())
            return {};
        return fs::path(appData) / "Adobe" / "Lightroom" / "Modules";
#else
        const std::string home = Env("HOME");
        if (home.empty())
            return {};
        return fs::path(home) / "Library" / "Application Support" / "Adobe" / "Lightroom" / "Modules";
#endif
    }

    fs::path InstalledPlugin()
    {
        const fs::path modules = ModulesFolder();
        return modules.empty() ? fs::path() : modules / "Stillpoint.lrplugin";
    }

    std::string InstalledPluginVersion()
    {
        const fs::path plugin = InstalledPlugin();
        if (!Exists(plugin / "Info.lua"))
            return "";
        std::ifstream in(plugin / "version.txt");
        std::string version;
        std::getline(in, version);
        if (!version.empty() && version.back() == '\r')
            version.pop_back();
        return version.empty() ? "unknown" : version;
    }

    bool InstallPlugin(const fs::path& source, const std::string& version, std::string& error)
    {
        std::error_code ec;
        if (!Exists(source / "Info.lua"))
        {
            error = "The Lightroom plugin is missing from the app folder. Build the app again.";
            return false;
        }
        const fs::path target = InstalledPlugin();
        if (target.empty())
        {
            error = "Could not find the Lightroom plugin folder on this computer.";
            return false;
        }
        fs::create_directories(target.parent_path(), ec);
        fs::remove_all(target, ec);
        ec.clear();
        fs::copy(source, target, fs::copy_options::recursive | fs::copy_options::overwrite_existing, ec);
        if (ec)
        {
            error = "Could not copy the plugin to " + Utf8(target.parent_path()) + " (" + ec.message() + ").";
            return false;
        }
        const bool ok = WriteWhole(target / "version.txt", version + "\n")
                     && WriteWhole(target / "bridge-path.txt", Utf8(BridgeFolder()) + "\n");
        if (!ok)
            error = "Could not write inside " + Utf8(target) + ".";
        fs::create_directories(BridgeFolder(), ec);
        return ok;
    }

    fs::path BridgeFolder() { return Platform::AppDataFolder() / "lightroom"; }

    bool WriteRequest(const Request& request, std::string& error)
    {
        std::ostringstream text;
        text << "id=" << request.id << "\n"
             << "action=" << request.action << "\n"
             << "project=" << OneLine(request.project) << "\n"
             << "title=" << OneLine(request.title) << "\n"
             << "catalog=" << OneLine(request.catalog) << "\n"
             << "focus=" << Utf8(request.focus) << "\n";
        for (const auto& p : request.select)
            text << "select=" << Utf8(p) << "\n";
        for (const auto& p : request.photos)
            text << "photo=" << Utf8(p) << "\n";
        text << "end=1\n";  // o plugin só aceita o pedido inteiro
        std::error_code ec;
        fs::remove(BridgeFolder() / "status.txt", ec);
        if (!WriteWhole(BridgeFolder() / "request.txt", text.str()))
        {
            error = "Could not write to " + Utf8(BridgeFolder()) + ".";
            return false;
        }
        return true;
    }

    void CancelRequest(const std::string& id)
    {
        const fs::path file = BridgeFolder() / "request.txt";
        if (Value(ReadPairs(file), "id") == id)
        {
            std::error_code ec;
            fs::remove(file, ec);
        }
    }

    Status ReadStatus(const std::string& id)
    {
        Status status;
        const auto pairs = ReadPairs(BridgeFolder() / "status.txt");
        status.id = Value(pairs, "id");
        if (status.id != id || Value(pairs, "end") != "1")
            return status;  // de outro pedido, ou ainda sendo escrito
        status.state = Value(pairs, "state");
        status.message = Value(pairs, "message");
        status.catalog = Value(pairs, "catalog");
        try { status.added = std::stoi(Value(pairs, "added")); } catch (...) {}
        return status;
    }

    Alive ReadAlive()
    {
        Alive alive;
        const auto pairs = ReadPairs(BridgeFolder() / "alive.txt");
        long long at = 0;
        try { at = std::stoll(Value(pairs, "time")); } catch (...) {}
        const long long now = static_cast<long long>(std::time(nullptr));
        alive.fresh = at > 0 && now - at < 5 && at - now < 5;
        alive.catalog = Value(pairs, "catalog");
        alive.version = Value(pairs, "version");
        return alive;
    }
}
