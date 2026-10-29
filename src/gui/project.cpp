#include "project.h"
#include "json_lite.h"

#include <chrono>
#include <ctime>
#include <fstream>
#include <iterator>
#include <system_error>

namespace fs = std::filesystem;

const char* const Project::kIndexFile = "stillpoint-project.json";

namespace
{
    std::string NowIso()
    {
        const std::time_t t = std::time(nullptr);
        std::tm local{};
#ifdef _WIN32
        localtime_s(&local, &t);
#else
        localtime_r(&t, &local);
#endif
        char buf[40];
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S%z", &local);
        return buf;
    }

    JsonLite::Value ReadJson(const fs::path& file, bool& ok)
    {
        std::ifstream in(file, std::ios::binary);
        if (!in) { ok = false; return JsonLite::Value(); }
        const std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
        return JsonLite::Parse(text, &ok);
    }
}

bool Project::IsProject(const fs::path& folder)
{
    std::error_code ec;
    return fs::is_regular_file(folder / kIndexFile, ec);
}

bool Project::Create(const fs::path& folder, const std::string& name, std::string& error)
{
    std::error_code ec;
    fs::create_directories(folder, ec);
    if (ec)
    {
        error = "Could not create the folder: " + ec.message();
        return false;
    }
    if (IsProject(folder))
    {
        error = "This folder is already a project.";
        return false;
    }
    JsonLite::Value index = JsonLite::Value::NewObject();
    index.set("stillpoint", "project");
    index.set("version", 1);
    index.set("name", name.empty() ? folder.filename().string() : name);
    index.set("created", NowIso());
    index.set("sessions", JsonLite::Value::NewArray());
    std::ofstream out(folder / kIndexFile, std::ios::binary | std::ios::trunc);
    out << JsonLite::Stringify(index);
    if (!out)
    {
        error = "Could not write " + std::string(kIndexFile) + " in that folder.";
        return false;
    }
    fs::create_directories(folder / "Originals", ec);
    fs::create_directories(folder / "Edited", ec);
    fs::create_directories(folder / "Exports", ec);
    return true;
}

bool Project::Open(const fs::path& folder, std::string& error)
{
    if (!IsProject(folder))
    {
        error = "This folder is not a Stillpoint project (no " + std::string(kIndexFile) + ").";
        return false;
    }
    bool ok = false;
    const JsonLite::Value index = ReadJson(folder / kIndexFile, ok);
    if (!ok || !index.isObject() || index.get("stillpoint").asString() != "project")
    {
        error = std::string(kIndexFile) + " could not be read.";
        return false;
    }
    root = folder;
    name = index.get("name").asString(folder.filename().string());
    created = index.get("created").asString();
    sessions.clear();
    for (const auto& item : index.get("sessions").items())
        if (item.isObject() && !item.get("folder").asString().empty())
            sessions.emplace_back(item.get("folder").asString(), item.get("added").asString());
    exportDefaults = index.has("export") ? JsonLite::Stringify(index.get("export"), 0) : std::string();
    std::error_code ec;
    fs::create_directories(Originals(), ec);
    fs::create_directories(Edited(), ec);
    return true;
}

bool Project::Rename(const std::string& newName, std::string& error)
{
    if (!IsOpen())
    {
        error = "No project is open.";
        return false;
    }
    if (newName.empty() || newName.find_first_of("/\\:*?\"<>|") != std::string::npos
        || newName.front() == '.' || newName.back() == ' ')
    {
        error = "That name cannot be used for a folder (no / \\ : * ? \" < > | and it cannot start with a dot).";
        return false;
    }
    const fs::path target = root.parent_path() / fs::path(newName);
    std::error_code ec;
    if (fs::equivalent(root, target, ec))
    {
        // Só muda maiúsculas/minúsculas (mesma pasta no Mac e no Windows): renomeia mesmo assim
        ec.clear();
    }
    else if (fs::exists(target, ec))
    {
        error = "There is already a folder named \"" + newName + "\" next to the project.";
        return false;
    }
    fs::rename(root, target, ec);
    if (ec)
    {
        error = "Could not rename the folder (" + ec.message() + "). Another program may be using it "
                "(Finder/Explorer, Lightroom, a sync app): close it there and try again.";
        return false;
    }
    root = target;
    name = newName;
    if (!Save())
    {
        error = "The folder was renamed, but " + std::string(kIndexFile) + " could not be updated.";
        return false;
    }
    return true;
}

void Project::Close()
{
    root.clear();
    name.clear();
    created.clear();
    sessions.clear();
    exportDefaults.clear();
}

bool Project::Available() const
{
    return IsOpen() && IsProject(root);
}

void Project::SyncIndex(const std::vector<std::string>& folders)
{
    if (!IsOpen())
        return;
    std::vector<std::pair<std::string, std::string>> fresh;
    bool changed = false;
    for (const auto& folder : folders)
    {
        bool found = false;
        for (const auto& [known, added] : sessions)
            if (known == folder) { fresh.emplace_back(known, added); found = true; break; }
        if (!found) { fresh.emplace_back(folder, NowIso()); changed = true; }
    }
    if (fresh.size() != sessions.size())
        changed = true;
    sessions = fresh;
    if (changed)
        Save();
}

void Project::SetExportDefaults(const std::string& json)
{
    bool ok = false;
    JsonLite::Parse(json, &ok);
    if (!ok)
        return;
    exportDefaults = json;
    Save();
}

bool Project::Save() const
{
    if (!IsOpen())
        return false;
    JsonLite::Value index = JsonLite::Value::NewObject();
    index.set("stillpoint", "project");
    index.set("version", 1);
    index.set("name", name);
    index.set("created", created.empty() ? NowIso() : created);
    JsonLite::Value list = JsonLite::Value::NewArray();
    for (const auto& [folder, added] : sessions)
    {
        JsonLite::Value item = JsonLite::Value::NewObject();
        item.set("folder", folder);
        item.set("added", added);
        list.push(item);
    }
    index.set("sessions", list);
    if (!exportDefaults.empty())
    {
        bool ok = false;
        JsonLite::Value e = JsonLite::Parse(exportDefaults, &ok);
        if (ok) index.set("export", e);
    }
    std::ofstream out(root / kIndexFile, std::ios::binary | std::ios::trunc);
    out << JsonLite::Stringify(index);
    return static_cast<bool>(out);
}

long long Project::SizeBytes() const
{
    if (!IsOpen())
        return -1;
    long long total = 0;
    std::error_code ec;
    for (const fs::path& dir : { Originals(), Edited(), Exports() })
    {
        if (!fs::is_directory(dir, ec))
            continue;
        for (const auto& entry : fs::recursive_directory_iterator(dir, ec))
            if (entry.is_regular_file(ec))
                total += static_cast<long long>(entry.file_size(ec));
    }
    return total;
}
