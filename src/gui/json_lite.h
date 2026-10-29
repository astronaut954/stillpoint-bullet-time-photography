#pragma once

// JSON pequeno para os arquivos do Project (stillpoint-project.json, session.json):
// lê e escreve objetos, listas, textos, números, true/false/null. Sem dependências.
// Não é para dados grandes nem para validar JSON alheio com rigor.

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace JsonLite
{
    struct Value;
    using Object = std::vector<std::pair<std::string, Value>>;  // mantém a ordem das chaves
    using Array = std::vector<Value>;

    struct Value
    {
        enum class Kind { Null, Bool, Number, String, Array, Object };
        Kind kind = Kind::Null;
        bool b = false;
        double num = 0;
        std::string str;
        std::shared_ptr<Array> arr;
        std::shared_ptr<Object> obj;

        Value() = default;
        Value(bool v) : kind(Kind::Bool), b(v) {}
        Value(int v) : kind(Kind::Number), num(v) {}
        Value(double v) : kind(Kind::Number), num(v) {}
        Value(const char* v) : kind(Kind::String), str(v) {}
        Value(const std::string& v) : kind(Kind::String), str(v) {}
        static Value NewArray() { Value v; v.kind = Kind::Array; v.arr = std::make_shared<Array>(); return v; }
        static Value NewObject() { Value v; v.kind = Kind::Object; v.obj = std::make_shared<Object>(); return v; }

        bool isNull() const { return kind == Kind::Null; }
        bool isObject() const { return kind == Kind::Object && obj; }
        bool isArray() const { return kind == Kind::Array && arr; }

        // Objeto: ler (Value nulo se não houver) e escrever (substitui ou acrescenta)
        const Value& get(const std::string& key) const
        {
            static const Value none;
            if (!isObject()) return none;
            for (const auto& [k, v] : *obj) if (k == key) return v;
            return none;
        }
        Value& set(const std::string& key, Value value)
        {
            if (!isObject()) { kind = Kind::Object; obj = std::make_shared<Object>(); }
            for (auto& [k, v] : *obj) if (k == key) { v = std::move(value); return v; }
            obj->emplace_back(key, std::move(value));
            return obj->back().second;
        }
        bool has(const std::string& key) const { return isObject() && !get(key).isNull(); }
        std::string asString(const std::string& fallback = "") const { return kind == Kind::String ? str : fallback; }
        double asNumber(double fallback = 0) const { return kind == Kind::Number ? num : fallback; }
        int asInt(int fallback = 0) const { return kind == Kind::Number ? static_cast<int>(num) : fallback; }
        bool asBool(bool fallback = false) const { return kind == Kind::Bool ? b : fallback; }
        const Array& items() const { static const Array none; return isArray() ? *arr : none; }
        Value& push(Value value) { if (!isArray()) { kind = Kind::Array; arr = std::make_shared<Array>(); } arr->push_back(std::move(value)); return arr->back(); }
    };

    // ---- escrever ----
    inline void Escape(const std::string& s, std::string& out)
    {
        out += '"';
        for (unsigned char c : s)
        {
            switch (c)
            {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof(buf), "\\u%04x", c); out += buf; }
                else out += static_cast<char>(c);
            }
        }
        out += '"';
    }

    inline void Write(const Value& v, std::string& out, int indent, int depth)
    {
        const std::string pad(static_cast<size_t>(indent * depth), ' ');
        const std::string padIn(static_cast<size_t>(indent * (depth + 1)), ' ');
        const char* nl = indent ? "\n" : "";
        switch (v.kind)
        {
        case Value::Kind::Null: out += "null"; break;
        case Value::Kind::Bool: out += v.b ? "true" : "false"; break;
        case Value::Kind::Number:
        {
            char buf[32];
            if (v.num == static_cast<long long>(v.num)) std::snprintf(buf, sizeof(buf), "%lld", static_cast<long long>(v.num));
            else std::snprintf(buf, sizeof(buf), "%.6g", v.num);
            out += buf;
            break;
        }
        case Value::Kind::String: Escape(v.str, out); break;
        case Value::Kind::Array:
        {
            const auto& a = v.items();
            if (a.empty()) { out += "[]"; break; }
            out += "["; out += nl;
            for (size_t i = 0; i < a.size(); ++i)
            {
                out += padIn; Write(a[i], out, indent, depth + 1);
                if (i + 1 < a.size()) out += ",";
                out += nl;
            }
            out += pad; out += "]";
            break;
        }
        case Value::Kind::Object:
        {
            if (!v.obj || v.obj->empty()) { out += "{}"; break; }
            out += "{"; out += nl;
            for (size_t i = 0; i < v.obj->size(); ++i)
            {
                out += padIn; Escape((*v.obj)[i].first, out); out += indent ? ": " : ":";
                Write((*v.obj)[i].second, out, indent, depth + 1);
                if (i + 1 < v.obj->size()) out += ",";
                out += nl;
            }
            out += pad; out += "}";
            break;
        }
        }
    }
    inline std::string Stringify(const Value& v, int indent = 2) { std::string out; Write(v, out, indent, 0); if (indent) out += "\n"; return out; }

    // ---- ler ----
    struct Parser
    {
        const std::string& s; size_t i = 0; bool ok = true;
        explicit Parser(const std::string& text) : s(text) {}
        void ws() { while (i < s.size() && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) ++i; }
        bool eat(char c) { ws(); if (i < s.size() && s[i] == c) { ++i; return true; } return false; }
        Value fail() { ok = false; return Value(); }
        Value parse()
        {
            ws();
            if (i >= s.size()) return fail();
            const char c = s[i];
            if (c == '{')
            {
                ++i; Value v = Value::NewObject();
                if (eat('}')) return v;
                while (ok)
                {
                    ws(); if (i >= s.size() || s[i] != '"') return fail();
                    const std::string key = parseString();
                    if (!eat(':')) return fail();
                    v.set(key, parse());
                    if (eat(',')) continue;
                    if (eat('}')) return v;
                    return fail();
                }
                return v;
            }
            if (c == '[')
            {
                ++i; Value v = Value::NewArray();
                if (eat(']')) return v;
                while (ok)
                {
                    v.push(parse());
                    if (eat(',')) continue;
                    if (eat(']')) return v;
                    return fail();
                }
                return v;
            }
            if (c == '"') return Value(parseString());
            if (s.compare(i, 4, "true") == 0) { i += 4; return Value(true); }
            if (s.compare(i, 5, "false") == 0) { i += 5; return Value(false); }
            if (s.compare(i, 4, "null") == 0) { i += 4; return Value(); }
            // número
            const size_t start = i;
            if (s[i] == '-' || s[i] == '+') ++i;
            while (i < s.size() && (std::isdigit(static_cast<unsigned char>(s[i])) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '-' || s[i] == '+')) ++i;
            if (i == start) return fail();
            try { return Value(std::stod(s.substr(start, i - start))); } catch (...) { return fail(); }
        }
        std::string parseString()
        {
            std::string out;
            ++i;  // abre aspas
            while (i < s.size() && s[i] != '"')
            {
                if (s[i] == '\\' && i + 1 < s.size())
                {
                    ++i;
                    switch (s[i])
                    {
                    case 'n': out += '\n'; break;
                    case 'r': out += '\r'; break;
                    case 't': out += '\t'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'u':
                    {
                        if (i + 4 >= s.size()) { ok = false; return out; }
                        unsigned code = static_cast<unsigned>(std::stoul(s.substr(i + 1, 4), nullptr, 16));
                        i += 4;
                        // UTF-8 (sem pares substitutos: os arquivos do app não os usam)
                        if (code < 0x80) out += static_cast<char>(code);
                        else if (code < 0x800) { out += static_cast<char>(0xC0 | (code >> 6)); out += static_cast<char>(0x80 | (code & 0x3F)); }
                        else { out += static_cast<char>(0xE0 | (code >> 12)); out += static_cast<char>(0x80 | ((code >> 6) & 0x3F)); out += static_cast<char>(0x80 | (code & 0x3F)); }
                        break;
                    }
                    default: out += s[i];
                    }
                }
                else out += s[i];
                ++i;
            }
            if (i >= s.size()) { ok = false; return out; }
            ++i;  // fecha aspas
            return out;
        }
    };
    // Devolve um Value nulo (e ok=false) se o texto não for JSON válido
    inline Value Parse(const std::string& text, bool* ok = nullptr)
    {
        Parser p(text);
        Value v = p.parse();
        p.ws();
        const bool good = p.ok && p.i == text.size();
        if (ok) *ok = good;
        return good ? v : Value();
    }
}
