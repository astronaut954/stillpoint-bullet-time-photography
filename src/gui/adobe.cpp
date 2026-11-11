#if defined(_WIN32) && !defined(_CRT_SECURE_NO_WARNINGS)
#define _CRT_SECURE_NO_WARNINGS  // getenv: com /sdl, o aviso do Visual Studio vira erro
#endif
#include "adobe.h"

#include "platform/platform.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
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

    std::string BundledPluginVersion(const fs::path& source, const std::string& appVersion)
    {
        // FNV-1a dos nomes e do conteúdo dos .lua e das imagens (.png), em ordem de nome
        std::vector<fs::path> files;
        std::error_code ec;
        for (fs::directory_iterator it(source, ec), end; !ec && it != end; it.increment(ec))
            if (it->path().extension() == ".lua" || it->path().extension() == ".png")
                files.push_back(it->path());
        std::sort(files.begin(), files.end());
        unsigned long long hash = 1469598103934665603ull;
        auto mix = [&](const std::string& text) { for (const unsigned char c : text) { hash ^= c; hash *= 1099511628211ull; } };
        for (const auto& f : files)
        {
            mix(Utf8(f.filename()));
            std::ifstream in(f, std::ios::binary);
            std::ostringstream text;
            text << in.rdbuf();
            mix(text.str());
        }
        char code[24];
        std::snprintf(code, sizeof(code), "%08llx", hash & 0xffffffffull);
        return appVersion + "+" + code;
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
        // Escreve por cima, sem apagar a pasta antes: com o Lightroom aberto, a pasta do plugin sumindo por um
        // instante fazia o Lightroom dar o plugin como perdido (suspeita do teste de 2026-11-05)
        fs::create_directories(target, ec);
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
        if (!request.framing.empty())
            text << "framing=" << OneLine(request.framing) << "\n";
        for (const auto& c : request.crops)
        {
            char box[160];
            // Com o tamanho da foto conhecido: mais três campos (ângulo, largura e altura da foto), para o plugin
            // conferir a proporção do recorte no Export to Stillpoint. Sem ele, a linha de sempre.
            if (c.width > 0 && c.height > 0)
                std::snprintf(box, sizeof(box), "%.6f\t%.6f\t%.6f\t%.6f\t%.4f\t%d\t%d", c.left, c.top, c.right, c.bottom, c.angle, c.width, c.height);
            else
                std::snprintf(box, sizeof(box), "%.6f\t%.6f\t%.6f\t%.6f", c.left, c.top, c.right, c.bottom);
            text << "crop=" << Utf8(c.photo) << "\t" << box << "\n";
        }
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

    namespace
    {
        struct Where { std::string project, title, catalog; };
        std::map<std::string, Where> LoadCollections()
        {
            std::map<std::string, Where> out;
            std::ifstream in(BridgeFolder() / "collections.txt", std::ios::binary);
            for (std::string line; std::getline(in, line);)
            {
                if (!line.empty() && line.back() == '\r')
                    line.pop_back();
                std::vector<std::string> parts;
                std::stringstream cells(line);
                for (std::string cell; std::getline(cells, cell, '\t');)
                    parts.push_back(cell);
                if (parts.size() >= 3)
                    out[parts[0]] = { parts[1], parts[2], parts.size() > 3 ? parts[3] : std::string() };
            }
            return out;
        }
        void SaveCollections(const std::map<std::string, Where>& map)
        {
            std::ostringstream text;
            for (const auto& [session, where] : map)
                text << session << '\t' << OneLine(where.project) << '\t' << OneLine(where.title) << '\t' << OneLine(where.catalog) << '\n';
            WriteWhole(BridgeFolder() / "collections.txt", text.str());
        }
    }

    namespace
    {
        fs::path TemplateFolder() { return BridgeFolder() / "template"; }
        fs::path TemplateCatalog() { return TemplateFolder() / "Stillpoint Template.lrcat"; }
        int Major(const std::string& version)
        {
            try { return std::stoi(version); } catch (...) { return -1; }
        }
        // Copia o .lrcat e, se existir, o -wal ao lado (o Lightroom pode ainda não ter passado tudo para o .lrcat)
        bool CopyCatalog(const fs::path& from, const fs::path& to, std::string& error)
        {
            std::error_code ec;
            fs::create_directories(to.parent_path(), ec);
            fs::copy_file(from, to, fs::copy_options::overwrite_existing, ec);
            if (ec)
            {
                error = "Could not copy " + Utf8(from) + " (" + ec.message() + ").";
                return false;
            }
            const fs::path wal = from.parent_path() / (from.filename().string() + "-wal");
            const fs::path walTo = to.parent_path() / (to.filename().string() + "-wal");
            if (Exists(wal))
                fs::copy_file(wal, walTo, fs::copy_options::overwrite_existing, ec);
            else
                fs::remove(walTo, ec);
            return true;
        }
    }

    TemplateInfo Template()
    {
        TemplateInfo info;
        info.has = Exists(TemplateCatalog());
        std::ifstream in(TemplateFolder() / "version.txt");
        std::getline(in, info.version);
        if (!info.version.empty() && info.version.back() == '\r')
            info.version.pop_back();
        return info;
    }

    bool TemplateOutdated(const TemplateInfo& info, const std::string& lightroomVersion)
    {
        if (!info.has)
            return false;
        const int a = Major(info.version), b = Major(lightroomVersion);
        return a >= 0 && b >= 0 && a != b;
    }

    fs::path DesktopTemplate(const fs::path& desktop)
    {
        // "Template" (ou "template", "TEMPLATE"; e "Stillpoint Template", o nome de antes): o New Catalog cria uma
        // pasta com o nome e o .lrcat com o mesmo nome dentro dela (decisão do dono, 2026-11-06)
        std::error_code ec;
        for (fs::directory_iterator it(desktop, ec), end; !ec && it != end; it.increment(ec))
        {
            if (!it->is_directory(ec))
                continue;
            const std::string name = Lower(Utf8(it->path().filename()));
            if (name != "template" && name != "stillpoint template")
                continue;
            std::error_code ec2;
            for (fs::directory_iterator f(it->path(), ec2), fend; !ec2 && f != fend; f.increment(ec2))
                if (Lower(Utf8(f->path().extension())) == ".lrcat" && Lower(Utf8(f->path().stem())) == name)
                    return f->path();
        }
        return {};
    }

    bool SaveTemplate(const fs::path& catalog, const std::string& lightroomVersion, std::string& error)
    {
        if (!CopyCatalog(catalog, TemplateCatalog(), error))
            return false;
        if (!WriteWhole(TemplateFolder() / "version.txt", lightroomVersion + "\n"))
        {
            error = "Could not write inside " + Utf8(TemplateFolder()) + ".";
            return false;
        }
        return true;
    }

    bool MakeCatalogFromTemplate(const fs::path& target, std::string& error)
    {
        if (!Exists(TemplateCatalog()))
        {
            error = "There is no empty catalog to copy yet.";
            return false;
        }
        if (Exists(target))
            return true;
        return CopyCatalog(TemplateCatalog(), target, error);
    }

    std::map<std::string, std::string> CollectionCatalogs()
    {
        std::map<std::string, std::string> out;
        for (const auto& [session, where] : LoadCollections())
            out[session] = where.catalog;
        return out;
    }

    bool SameCatalog(const std::string& a, const std::string& b)
    {
#ifdef _WIN32
        auto norm = [](std::string t) { std::replace(t.begin(), t.end(), '/', '\\'); return Lower(t); };
        return norm(a) == norm(b);
#else
        return a == b;
#endif
    }

    void RememberCollection(const std::string& session, const std::string& project, const std::string& title, const std::string& catalog)
    {
        auto map = LoadCollections();
        map[session] = { project, title, catalog };
        SaveCollections(map);
    }

    bool QueueRemoveCollection(const std::string& session, const std::string& fallbackProject, const std::string& fallbackTitle,
                               const std::string& fallbackCatalog)
    {
        auto map = LoadCollections();
        if (map.find(session) == map.end())
        {
            if (fallbackTitle.empty())
                return false;
            map[session] = { fallbackProject, fallbackTitle, fallbackCatalog };
        }
        const auto it = map.find(session);
        // Um arquivo por pedido: o plugin pega todos os done-*.txt quando estiver aberto
        static int counter = 0;
        const std::string name = "done-" + std::to_string(std::time(nullptr)) + "-" + std::to_string(++counter) + ".txt";
        // O registro fica (não é apagado): se o ⌘Z do Lightroom trouxer a coleção de volta, o Stillpoint reconhece
        // (SessionsBackInCatalog); o Delete edits também usa o catálogo dele
        const bool ok = WriteWhole(BridgeFolder() / name, "project=" + OneLine(it->second.project) + "\ntitle=" + OneLine(it->second.title) + "\ncatalog=" + OneLine(it->second.catalog) + "\nend=1\n");
        SaveCollections(map);
        return ok;
    }

    bool QueueNotice(const std::string& session, const std::string& title, const std::vector<fs::path>& photos,
                     const std::string& numbers, const std::string& have, const std::string& want)
    {
        if (photos.empty())
            return false;
        static int counter = 0;
        const std::string name = "notice-" + std::to_string(std::time(nullptr)) + "-" + std::to_string(++counter) + ".txt";
        std::string text = "session=" + OneLine(session) + "\ntitle=" + OneLine(title) + "\nnumbers=" + OneLine(numbers)
            + "\nhave=" + OneLine(have) + "\nwant=" + OneLine(want) + "\n";
        for (const auto& p : photos)
            text += "photo=" + Utf8(p) + "\n";
        return WriteWhole(BridgeFolder() / name, text + "end=1\n");
    }

    bool QueuePhotos(const std::string& kind, const std::string& session, const std::vector<fs::path>& photos)
    {
        if (photos.empty())
            return false;
        const auto map = LoadCollections();
        const auto it = map.find(session);
        if (it == map.end())
            return false;  // nunca foi para o Lightroom
        static int counter = 0;
        const std::string name = kind + "-" + std::to_string(std::time(nullptr)) + "-" + std::to_string(++counter) + ".txt";
        std::string text = "session=" + OneLine(session) + "\nproject=" + OneLine(it->second.project) + "\ntitle=" + OneLine(it->second.title)
            + "\ncatalog=" + OneLine(it->second.catalog) + "\n";
        for (const auto& p : photos)
            text += "photo=" + OneLine(Utf8(p)) + "\n";
        return WriteWhole(BridgeFolder() / name, text + "end=1\n");
    }

    bool QueueReset(const std::string& session, const std::vector<fs::path>& photos)
    {
        // Um "pôr a edição de volta" ainda na fila para essas fotos (⌘Z e ⌘⇧Z seguidos): o Lightroom ainda está com
        // elas no original, então basta tirar as fotos daquele pedido (fazer os dois desencontrava o Lightroom do
        // Stillpoint; teste do dono, 2026-11-06)
        std::vector<fs::path> rest = photos;
        bool known = false;
        {
            const auto map = LoadCollections();
            known = map.find(session) != map.end();
        }
        if (!known)
            return false;
        std::error_code ec;
        for (fs::directory_iterator it(BridgeFolder(), ec), end; !ec && it != end; it.increment(ec))
        {
            const std::string name = Utf8(it->path().filename());
            if (name.rfind("bringback-", 0) != 0)
                continue;
            const auto pairs = ReadPairs(it->path());
            if (Value(pairs, "session") != session || Value(pairs, "end") != "1")
                continue;
            std::string text;
            int left = 0;
            for (const auto& [key, value] : pairs)
            {
                if (key == "end")
                    continue;
                if (key == "photo")
                {
                    const auto found = std::find_if(rest.begin(), rest.end(), [&](const fs::path& p) { return Utf8(p) == value; });
                    if (found != rest.end()) { rest.erase(found); continue; }
                    ++left;
                }
                text += key + "=" + value + "\n";
            }
            std::error_code rec;
            if (left == 0) fs::remove(it->path(), rec);
            else WriteWhole(it->path(), text + "end=1\n");
        }
        if (rest.empty())
            return true;  // nada a fazer no Lightroom: as fotos já estão no original lá
        return QueuePhotos("reset", session, rest);
    }

    bool CancelQueued(const std::string& kind, const std::string& session)
    {
        bool removed = false;
        std::error_code ec;
        for (fs::directory_iterator it(BridgeFolder(), ec), end; !ec && it != end; it.increment(ec))
        {
            const std::string name = Utf8(it->path().filename());
            if (name.rfind(kind + "-", 0) != 0)
                continue;
            if (Value(ReadPairs(it->path()), "session") == session)
            {
                std::error_code rec;
                removed = fs::remove(it->path(), rec) || removed;
            }
        }
        return removed;
    }

    bool CancelReset(const std::string& session)
    {
        return CancelQueued("reset", session);
    }

    Alive ReadAlive()
    {
        Alive alive;
        const auto pairs = ReadPairs(BridgeFolder() / "alive.txt");
        if (Value(pairs, "end") != "1")
            return alive;  // sendo escrito agora (o plugin grava direto no arquivo)
        long long at = 0;
        try { at = std::stoll(Value(pairs, "time")); } catch (...) {}
        const long long now = static_cast<long long>(std::time(nullptr));
        alive.fresh = at > 0 && now - at < 5 && at - now < 5;
        alive.time = at;
        alive.catalog = Value(pairs, "catalog");
        alive.version = Value(pairs, "version");
        alive.listsCollections = Value(pairs, "collections") == "1";
        const auto range = pairs.equal_range("collection");
        for (auto it = range.first; it != range.second; ++it)
        {
            const auto tab = it->second.find('\t');
            if (tab != std::string::npos)
                alive.collections.emplace_back(it->second.substr(0, tab), it->second.substr(tab + 1));
        }
        const auto mrange = pairs.equal_range("members");
        for (auto it = mrange.first; it != mrange.second; ++it)
        {
            const auto t1 = it->second.find('\t');
            const auto t2 = t1 == std::string::npos ? t1 : it->second.find('\t', t1 + 1);
            if (t2 == std::string::npos)
                continue;
            std::vector<std::string> files;
            std::stringstream list(it->second.substr(t2 + 1));
            for (std::string f; std::getline(list, f, '|');)
                if (!f.empty()) files.push_back(f);
            alive.members[it->second.substr(0, t2)] = files;
        }
        return alive;
    }

    CollectionNow CollectionState(const Alive& alive, const std::string& session)
    {
        CollectionNow now;
        const auto map = LoadCollections();
        const auto it = map.find(session);
        if (it == map.end())
            return now;
        now.known = true;
        if (!alive.fresh || !alive.listsCollections || (!it->second.catalog.empty() && !SameCatalog(it->second.catalog, alive.catalog)))
            return now;
        now.inCatalog = true;
        const std::string project = it->second.project.empty() ? "No project" : it->second.project;
        const std::pair<std::string, std::string> key(project, it->second.title);
        now.present = std::find(alive.collections.begin(), alive.collections.end(), key) != alive.collections.end();
        const auto m = alive.members.find(project + "\t" + it->second.title);
        if (m != alive.members.end())
        {
            now.files = m->second;
            now.membersKnown = true;  // a lista veio (pode estar vazia: a coleção ficou sem fotos)
        }
        std::error_code ec;
        for (fs::directory_iterator d(BridgeFolder(), ec), end; !ec && d != end; d.increment(ec))
        {
            const std::string name = Utf8(d->path().filename());
            if (name.rfind("done-", 0) == 0 && Value(ReadPairs(d->path()), "title") == it->second.title)
                now.removalWaiting = true;
        }
        return now;
    }

    std::vector<std::string> SessionsBackInCatalog(const Alive& alive, const std::vector<std::string>& editing)
    {
        std::vector<std::string> back;
        if (!alive.fresh || !alive.listsCollections)
            return back;
        // Retiradas ainda na fila: a coleção continua lá até o plugin tirar
        std::vector<std::pair<std::string, std::string>> pending;
        std::error_code ec;
        for (fs::directory_iterator it(BridgeFolder(), ec), end; !ec && it != end; it.increment(ec))
        {
            const std::string name = Utf8(it->path().filename());
            if (name.rfind("done-", 0) != 0)
                continue;
            const auto pairs = ReadPairs(it->path());
            pending.emplace_back(Value(pairs, "project"), Value(pairs, "title"));
        }
        for (const auto& [session, where] : LoadCollections())
        {
            if (std::find(editing.begin(), editing.end(), session) != editing.end())
                continue;
            if (!where.catalog.empty() && !SameCatalog(where.catalog, alive.catalog))
                continue;
            const std::string project = where.project.empty() ? "No project" : where.project;
            const std::pair<std::string, std::string> key(project, where.title);
            const bool present = std::find(alive.collections.begin(), alive.collections.end(), key) != alive.collections.end();
            const bool waiting = std::find_if(pending.begin(), pending.end(), [&](const auto& p) { return p.second == where.title; }) != pending.end();
            if (present && !waiting)
                back.push_back(session);
        }
        return back;
    }

    std::vector<std::multimap<std::string, std::string>> TakeMessages(const std::string& prefix)
    {
        std::vector<std::pair<std::string, std::multimap<std::string, std::string>>> found;
        std::error_code ec;
        for (fs::directory_iterator it(BridgeFolder(), ec), end; !ec && it != end; it.increment(ec))
        {
            const std::string name = Utf8(it->path().filename());
            if (name.rfind(prefix + "-", 0) != 0 || name.size() < 4 || name.substr(name.size() - 4) != ".txt")
                continue;
            auto pairs = ReadPairs(it->path());
            if (Value(pairs, "end") != "1")
                continue;  // o plugin ainda está escrevendo
            std::error_code ec2;
            fs::remove(it->path(), ec2);
            found.emplace_back(name, std::move(pairs));
        }
        // Na ordem em que chegaram (o nome começa pela hora)
        std::sort(found.begin(), found.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
        std::vector<std::multimap<std::string, std::string>> out;
        for (auto& f : found)
            out.push_back(std::move(f.second));
        return out;
    }

    std::string MessageValue(const std::multimap<std::string, std::string>& message, const std::string& key)
    {
        return Value(message, key);
    }
}
