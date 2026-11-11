#include "rig_state.h"

#include "camera_settings.h"
#include "json_lite.h"

#include <algorithm>
#include <fstream>
#include <sstream>

namespace Rig
{
    namespace
    {
        constexpr long long kWhiteBalanceKelvin = 9;  // kEdsWhiteBalance_ColorTemp

        std::string Signed(int v) { return v > 0 ? "+" + std::to_string(v) : std::to_string(v); }
        bool Has(const std::vector<std::string>& list, const std::string& item) { return std::find(list.begin(), list.end(), item) != list.end(); }
    }

    std::filesystem::path FileIn(const std::filesystem::path& projectRoot) { return projectRoot / "stillpoint-rig.json"; }

    const std::vector<std::string>& Keys()
    {
        static const std::vector<std::string> keys = { "quality", "aspect", "iso", "tv", "av", "expcomp", "metering",
            "wb", "kelvin", "shiftab", "shiftgm", "style", "contrast", "saturation", "colortone" };
        return keys;
    }
    std::string KeyName(const std::string& key)
    {
        static const std::map<std::string, std::string> names = {
            { "iso", "ISO" }, { "tv", "Shutter" }, { "av", "Aperture" }, { "expcomp", "Exp. comp." }, { "metering", "Metering" },
            { "quality", "Format" }, { "aspect", "Aspect ratio" }, { "wb", "White balance" }, { "kelvin", "Color temperature" },
            { "shiftab", "WB fine-tune A/B" }, { "shiftgm", "WB fine-tune G/M" }, { "style", "Picture Style" },
            { "contrast", "Contrast" }, { "saturation", "Saturation" }, { "colortone", "Color tone" } };
        const auto it = names.find(key);
        return it == names.end() ? key : it->second;
    }

    Camera Read(const CameraSettings& s, const std::string& serial, int order)
    {
        Camera c;
        c.serial = serial; c.name = s.camera; c.model = s.model; c.order = order;
        long long wb = -1;
        for (const CameraSetting& one : s.settings)
        {
            if (!one.available || !Has(Keys(), one.key)) continue;  // (drive: o app põe sozinho; focus: só leitura)
            Value v; v.value = one.value; v.label = one.label; v.settable = !one.choices.empty();
            c.settings[one.key] = v;
            if (one.key == "wb") wb = one.value;
        }
        if (s.kelvinAvailable && wb == kWhiteBalanceKelvin)
            c.settings["kelvin"] = { s.kelvin, std::to_string(s.kelvin) + " K", s.adjustable };
        if (s.shiftAvailable)
        {
            c.settings["shiftab"] = { s.shiftAB, Signed(s.shiftAB), s.adjustable };
            c.settings["shiftgm"] = { s.shiftGM, Signed(s.shiftGM), s.adjustable };
        }
        if (s.styleDetailAvailable)
        {
            c.settings["contrast"] = { s.contrast, Signed(s.contrast), s.adjustable };
            c.settings["saturation"] = { s.saturation, Signed(s.saturation), s.adjustable };
            c.settings["colortone"] = { s.colorTone, Signed(s.colorTone), s.adjustable };
        }
        return c;
    }

    State Load(const std::filesystem::path& file)
    {
        State state;
        std::ifstream in(file, std::ios::binary);
        if (!in) return state;
        std::stringstream text; text << in.rdbuf();
        bool ok = false;
        const JsonLite::Value root = JsonLite::Parse(text.str(), &ok);
        if (!ok || !root.isObject() || root.get("stillpoint").asString() != "rig") return state;
        if (root.has("panel")) state.panel = JsonLite::Stringify(root.get("panel"), 0);
        for (const auto& item : root.get("order").items())
            if (!item.asString().empty() && !Has(state.order, item.asString())) state.order.push_back(item.asString());
        for (const auto& item : root.get("cameras").items())
        {
            Camera c;
            c.serial = item.get("serial").asString();
            if (c.serial.empty()) continue;
            c.name = item.get("name").asString(); c.model = item.get("model").asString();
            if (item.get("settings").isObject())
                for (const auto& [key, v] : *item.get("settings").obj)
                {
                    Value value;
                    value.value = static_cast<long long>(v.get("value").asNumber());
                    value.label = v.get("label").asString();
                    c.settings[key] = value;
                }
            state.cameras[c.serial] = c;
        }
        for (size_t i = 0; i < state.order.size(); ++i)
            if (auto it = state.cameras.find(state.order[i]); it != state.cameras.end()) it->second.order = static_cast<int>(i) + 1;
        return state;
    }

    bool Save(const std::filesystem::path& file, const State& state)
    {
        JsonLite::Value root = JsonLite::Value::NewObject();
        root.set("stillpoint", "rig");
        root.set("version", 1);
        if (!state.panel.empty())
        {
            bool ok = false;
            const JsonLite::Value panel = JsonLite::Parse(state.panel, &ok);
            if (ok) root.set("panel", panel);
        }
        JsonLite::Value order = JsonLite::Value::NewArray();
        for (const auto& serial : state.order) order.push(JsonLite::Value(serial));
        root.set("order", order);
        JsonLite::Value cameras = JsonLite::Value::NewArray();
        for (const auto& [serial, c] : state.cameras)
        {
            JsonLite::Value item = JsonLite::Value::NewObject();
            item.set("serial", serial); item.set("name", c.name); item.set("model", c.model);
            JsonLite::Value settings = JsonLite::Value::NewObject();
            for (const auto& [key, v] : c.settings)
            {
                JsonLite::Value one = JsonLite::Value::NewObject();
                one.set("value", static_cast<double>(v.value)); one.set("label", v.label);
                settings.set(key, one);
            }
            item.set("settings", settings);
            cameras.push(item);
        }
        root.set("cameras", cameras);
        // Escreve num arquivo ao lado e troca: um corte de energia no meio não deixa o arquivo pela metade
        std::error_code ec;
        const std::filesystem::path temp = file.parent_path() / (file.filename().string() + ".tmp");
        {
            std::ofstream out(temp, std::ios::binary | std::ios::trunc);
            if (!out) return false;
            out << JsonLite::Stringify(root, 2);
            if (!out.good()) return false;
        }
        std::filesystem::rename(temp, file, ec);
        if (ec) { std::filesystem::remove(file, ec); std::filesystem::rename(temp, file, ec); }
        return !ec;
    }

    Check Compare(const State& state, const std::vector<Camera>& now, const Memory& memory)
    {
        Check check;
        check.connected = static_cast<int>(now.size());
        std::set<std::string> connected;
        for (const Camera& cam : now)
        {
            connected.insert(cam.serial);
            const auto saved = state.cameras.find(cam.serial);
            if (saved == state.cameras.end()) { check.fresh.push_back(cam); continue; }
            if (memory.seen.count(cam.serial)) continue;  // já conferida desde que o Project abriu
            bool differs = false;
            for (const std::string& key : Keys())
            {
                const auto want = saved->second.settings.find(key);
                const auto have = cam.settings.find(key);
                if (want == saved->second.settings.end() || have == cam.settings.end()) continue;
                if (want->second.value == have->second.value || !have->second.settable) continue;
                Diff d;
                d.serial = cam.serial; d.name = cam.name; d.model = cam.model; d.order = cam.order; d.key = key;
                d.now = have->second; d.want = want->second;
                check.diffs.push_back(d);
                differs = true;
            }
            if (differs) ++check.differing;
        }
        for (const auto& [serial, cam] : state.cameras)
            if (!connected.count(serial)) check.missing.push_back(cam);
        std::sort(check.missing.begin(), check.missing.end(), [](const Camera& a, const Camera& b) { return a.order < b.order; });
        return check;
    }

    void Keep(Memory& memory, const Check& check, const std::vector<Camera>& now)
    {
        for (const Diff& d : check.diffs) memory.kept[{ d.serial, d.key }] = d.now.value;
        for (const Camera& cam : now) memory.seen.insert(cam.serial);
    }

    bool Absorb(State& state, const std::vector<Camera>& now, Memory& memory, bool addNew)
    {
        bool changed = false;
        for (const Camera& cam : now)
        {
            auto saved = state.cameras.find(cam.serial);
            if (saved == state.cameras.end())
            {
                if (!addNew) continue;
                // Câmera que o Project não conhecia: entra como está
                Camera fresh = cam;
                for (auto& [key, v] : fresh.settings) v.settable = true;
                state.cameras[cam.serial] = fresh;
                memory.seen.insert(cam.serial);
                changed = true;
                continue;
            }
            if (saved->second.name != cam.name || saved->second.model != cam.model)
            {
                saved->second.name = cam.name; saved->second.model = cam.model;
                changed = true;
            }
            if (!memory.seen.count(cam.serial)) continue;  // ainda não conferida: as diferenças dela esperam a resposta
            for (const auto& [key, have] : cam.settings)
            {
                auto want = saved->second.settings.find(key);
                const auto kept = memory.kept.find({ cam.serial, key });
                if (want != saved->second.settings.end() && want->second.value == have.value)
                {
                    if (kept != memory.kept.end()) memory.kept.erase(kept);
                    if (want->second.label != have.label) { want->second.label = have.label; changed = true; }
                    continue;
                }
                // Diferença que a pessoa mandou deixar ("Keep the cameras as they are"): o Project fica com o que tinha,
                // enquanto a câmera continuar no valor daquela hora
                if (kept != memory.kept.end() && kept->second == have.value) continue;
                if (kept != memory.kept.end()) memory.kept.erase(kept);
                Value v = have; v.settable = true;
                saved->second.settings[key] = v;
                changed = true;
            }
        }
        return changed;
    }

    std::vector<std::string> OrderFor(const State& state, const std::vector<std::string>& connectedNow)
    {
        std::vector<std::string> out;
        for (const auto& serial : state.order)
            if (Has(connectedNow, serial) && !Has(out, serial)) out.push_back(serial);
        for (const auto& serial : connectedNow)
            if (!Has(out, serial)) out.push_back(serial);
        return out;
    }

    std::vector<std::string> MergeOrder(const std::vector<std::string>& saved, const std::vector<std::string>& connectedNow)
    {
        // A ordem de agora manda; cada câmera do Project que não está ligada volta para logo depois da que vinha antes
        // dela na ordem guardada (ou para o começo, se era a primeira)
        std::vector<std::string> out;
        for (const auto& serial : connectedNow)
            if (!Has(out, serial)) out.push_back(serial);
        for (size_t i = 0; i < saved.size(); ++i)
        {
            if (Has(out, saved[i])) continue;
            size_t at = 0;
            for (size_t j = i; j-- > 0;)
            {
                const auto before = std::find(out.begin(), out.end(), saved[j]);
                if (before != out.end()) { at = static_cast<size_t>(before - out.begin()) + 1; break; }
            }
            out.insert(out.begin() + static_cast<std::ptrdiff_t>(at), saved[i]);
        }
        return out;
    }
}
