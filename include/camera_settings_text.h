#pragma once

// CameraSettings como uma linha de texto e de volta, para passar entre o app e o
// processo trabalhador (etapa 16). Campos separados por \x1f e configurações por \x1e
// (caracteres de controle que não aparecem em nomes nem rótulos). Só cabeçalho.

#include "camera_settings.h"

#include <string>
#include <vector>

namespace CameraSettingsText
{
    constexpr char kField = '\x1f';
    constexpr char kRecord = '\x1e';

    inline std::string Encode(const CameraSettings& s)
    {
        auto f = [](const std::string& v) { std::string c; for (char ch : v) c += (ch == kField || ch == kRecord || ch == '\n' || ch == '\t') ? ' ' : ch; return c; };
        std::string out;
        out += f(s.camera) + kField + f(s.model) + kField + (s.adjustable ? "1" : "0") + kField + f(s.reason) + kField
             + f(s.mode) + kField + (s.manualMode ? "1" : "0") + kField + std::to_string(s.kelvin) + kField
             + (s.kelvinAvailable ? "1" : "0") + kField + (s.shiftAvailable ? "1" : "0") + kField
             + std::to_string(s.shiftAB) + kField + std::to_string(s.shiftGM) + kField + (s.focusManual ? "1" : "0") + kField
             + (s.styleDetailAvailable ? "1" : "0") + kField + std::to_string(s.contrast) + kField
             + std::to_string(s.saturation) + kField + std::to_string(s.colorTone);
        for (const auto& c : s.settings)
        {
            out += kRecord;
            out += f(c.key) + kField + (c.available ? "1" : "0") + kField + std::to_string(c.value) + kField + f(c.label);
            for (const auto& ch : c.choices)
                out += kField + std::to_string(ch.value) + kField + f(ch.label);
        }
        return out;
    }

    inline std::vector<std::string> SplitOn(const std::string& text, char sep)
    {
        std::vector<std::string> parts;
        std::string cur;
        for (char c : text)
        {
            if (c == sep) { parts.push_back(cur); cur.clear(); }
            else cur += c;
        }
        parts.push_back(cur);
        return parts;
    }

    inline long long ToLL(const std::string& v) { try { return std::stoll(v); } catch (...) { return 0; } }

    inline CameraSettings Decode(const std::string& text)
    {
        CameraSettings s;
        const auto records = SplitOn(text, kRecord);
        if (records.empty())
            return s;
        const auto h = SplitOn(records[0], kField);
        auto at = [&](size_t i) { return i < h.size() ? h[i] : std::string(); };
        s.camera = at(0); s.model = at(1); s.adjustable = at(2) == "1"; s.reason = at(3);
        s.mode = at(4); s.manualMode = at(5) == "1"; s.kelvin = static_cast<int>(ToLL(at(6)));
        s.kelvinAvailable = at(7) == "1"; s.shiftAvailable = at(8) == "1";
        s.shiftAB = static_cast<int>(ToLL(at(9))); s.shiftGM = static_cast<int>(ToLL(at(10))); s.focusManual = at(11) == "1";
        s.styleDetailAvailable = at(12) == "1"; s.contrast = static_cast<int>(ToLL(at(13)));
        s.saturation = static_cast<int>(ToLL(at(14))); s.colorTone = static_cast<int>(ToLL(at(15)));
        for (size_t r = 1; r < records.size(); ++r)
        {
            const auto p = SplitOn(records[r], kField);
            if (p.size() < 4)
                continue;
            CameraSetting c;
            c.key = p[0]; c.available = p[1] == "1"; c.value = ToLL(p[2]); c.label = p[3];
            for (size_t i = 4; i + 1 < p.size(); i += 2)
                c.choices.push_back({ ToLL(p[i]), p[i + 1] });
            s.settings.push_back(c);
        }
        return s;
    }
}
