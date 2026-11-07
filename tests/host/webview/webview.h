// Só para o teste automático do Stillpoint no Linux (tests/host): faz o papel da biblioteca webview, mas em vez de
// abrir uma janela serve a página por HTTP (127.0.0.1, porta STILLPOINT_TEST_PORT, padrão 8765). O teste abre a
// página num Chromium sem tela (Playwright); cada função que o app expõe para a página (bind) vira um endereço
// /call/<nome>, e o que o app manda para a página (eval) a página busca em /events.
#pragma once

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <deque>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#define WEBVIEW_HINT_NONE 0
#define WEBVIEW_HINT_MIN 1
#define WEBVIEW_HINT_MAX 2
#define WEBVIEW_HINT_FIXED 3

namespace webview
{
    struct exception
    {
        const char* what() const { return "test host"; }
    };
    struct result_t
    {
        bool ok() const { return false; }
        void* value() const { return nullptr; }
    };
    struct noresult
    {
        bool ok() const { return true; }
    };
    using binding_t = std::function<void(std::string, std::string, void*)>;

    class webview
    {
    public:
        webview(bool, void*) {}
        // Janelas extras (Live) também são criadas; só a primeira serve a página
        noresult set_title(const std::string&) { return {}; }
        noresult set_size(int, int, int) { return {}; }
        noresult navigate(const std::string&) { return {}; }
        noresult init(const std::string&) { return {}; }
        noresult set_html(const std::string& html)
        {
            std::lock_guard<std::mutex> g(lock);
            page = html;
            return {};
        }
        result_t window() { return {}; }

        noresult bind(const std::string& name, std::function<std::string(const std::string&)> fn)
        {
            std::lock_guard<std::mutex> g(lock);
            sync[name] = std::move(fn);
            return {};
        }
        noresult bind(const std::string& name, std::function<void(const std::string&, const std::string&, void*)> fn, void* arg)
        {
            std::lock_guard<std::mutex> g(lock);
            async[name] = { std::move(fn), arg };
            return {};
        }
        noresult unbind(const std::string& name)
        {
            std::lock_guard<std::mutex> g(lock);
            sync.erase(name);
            async.erase(name);
            return {};
        }
        noresult resolve(const std::string& id, int status, const std::string& result)
        {
            std::lock_guard<std::mutex> g(lock);
            answers[id] = { status, result };
            changed.notify_all();
            return {};
        }
        noresult eval(const std::string& js)
        {
            std::lock_guard<std::mutex> g(lock);
            events.push_back(js);
            return {};
        }
        noresult dispatch(std::function<void()> fn)
        {
            std::lock_guard<std::mutex> g(lock);
            tasks.push_back(std::move(fn));
            changed.notify_all();
            return {};
        }
        noresult terminate()
        {
            running = false;
            std::lock_guard<std::mutex> g(lock);
            changed.notify_all();
            return {};
        }

        // A volta principal: as funções do app rodam aqui (como na janela de verdade, na linha principal)
        noresult run()
        {
            if (!servingStarted.exchange(true))
            {
                serving = this;
                std::thread([this] { Serve(); }).detach();
            }
            if (serving != this)
                return {};  // janela Live: não serve nada
            running = true;
            while (running)
            {
                std::function<void()> task;
                {
                    std::unique_lock<std::mutex> g(lock);
                    changed.wait_for(g, std::chrono::milliseconds(50), [&] { return !tasks.empty() || !running; });
                    if (!tasks.empty()) { task = std::move(tasks.front()); tasks.pop_front(); }
                }
                if (task) task();
            }
            return {};
        }

    private:
        struct Async { std::function<void(const std::string&, const std::string&, void*)> fn; void* arg = nullptr; };
        std::mutex lock;
        std::condition_variable changed;
        std::deque<std::function<void()>> tasks;
        std::deque<std::string> events;
        std::map<std::string, std::function<std::string(const std::string&)>> sync;
        std::map<std::string, Async> async;
        std::map<std::string, std::pair<int, std::string>> answers;
        std::string page;
        std::atomic<bool> running{ false };
        long long nextId = 0;
        static inline std::atomic<bool> servingStarted{ false };
        static inline webview* serving = nullptr;

        // Chama uma função do app na linha principal e espera a resposta: (status, texto JSON)
        std::pair<int, std::string> Call(const std::string& name, const std::string& args)
        {
            std::string id;
            {
                std::lock_guard<std::mutex> g(lock);
                id = "t" + std::to_string(++nextId);
                if (sync.count(name))
                {
                    auto fn = sync[name];
                    tasks.push_back([this, fn, args, id] { const std::string r = fn(args); resolve(id, 0, r); });
                }
                else if (async.count(name))
                {
                    auto a = async[name];
                    tasks.push_back([a, args, id] { a.fn(id, args, a.arg); });
                }
                else
                    return { 1, "\"no binding " + name + "\"" };
                changed.notify_all();
            }
            std::unique_lock<std::mutex> g(lock);
            changed.wait_for(g, std::chrono::seconds(60), [&] { return answers.count(id) > 0; });
            if (!answers.count(id)) return { 1, "\"timeout\"" };
            auto r = answers[id];
            answers.erase(id);
            return r;
        }

        // A página com a ponte: cada função vira um fetch para /call/<nome>; os eventos chegam por /events
        std::string Page()
        {
            std::string names = "[";
            {
                std::lock_guard<std::mutex> g(lock);
                for (const auto& [n, _] : sync) names += (names.size() > 1 ? ",\"" : "\"") + n + "\"";
                for (const auto& [n, _] : async) names += (names.size() > 1 ? ",\"" : "\"") + n + "\"";
            }
            names += "]";
            const std::string bridge = "<script>(function(){var names=" + names + ";"
                "names.forEach(function(n){window[n]=function(){var args=Array.prototype.slice.call(arguments);"
                "return fetch('/call/'+n,{method:'POST',body:JSON.stringify(args)}).then(function(r){return r.text().then(function(t){"
                "var v=t===''?undefined:JSON.parse(t);if(r.status!==200)throw v;return v;});});};});"
                "function poll(){fetch('/events').then(function(r){return r.json();}).then(function(list){"
                "list.forEach(function(js){try{(0,eval)(js);}catch(e){console.error('event',e);}});setTimeout(poll,list.length?0:60);})"
                ".catch(function(){setTimeout(poll,500);});}window.addEventListener('load',function(){setTimeout(poll,0);});"
                "})();</script>";
            std::string html;
            {
                std::lock_guard<std::mutex> g(lock);
                html = page;
            }
            const auto head = html.find("<head>");
            if (head != std::string::npos) html.insert(head + 6, bridge);
            else html = bridge + html;
            return html;
        }

        std::string Events()
        {
            std::deque<std::string> list;
            {
                std::lock_guard<std::mutex> g(lock);
                list.swap(events);
            }
            std::string out = "[";
            for (const auto& js : list)
            {
                std::string q = "\"";
                for (const char c : js)
                {
                    switch (c)
                    {
                    case '"': q += "\\\""; break;
                    case '\\': q += "\\\\"; break;
                    case '\n': q += "\\n"; break;
                    case '\r': q += "\\r"; break;
                    case '\t': q += "\\t"; break;
                    default:
                        if (static_cast<unsigned char>(c) < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); q += b; }
                        else q += c;
                    }
                }
                out += (out.size() > 1 ? "," : "") + q + "\"";
            }
            return out + "]";
        }

        static void Send(int fd, int code, const std::string& type, const std::string& body)
        {
            std::ostringstream h;
            h << "HTTP/1.1 " << code << (code == 200 ? " OK" : " Error") << "\r\nContent-Type: " << type
              << "\r\nContent-Length: " << body.size() << "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
            const std::string head = h.str();
            ::send(fd, head.data(), head.size(), MSG_NOSIGNAL);
            size_t done = 0;
            while (done < body.size())
            {
                const ssize_t n = ::send(fd, body.data() + done, body.size() - done, MSG_NOSIGNAL);
                if (n <= 0) break;
                done += static_cast<size_t>(n);
            }
        }

        void Handle(int fd)
        {
            std::string data;
            char buf[65536];
            size_t need = std::string::npos;
            for (;;)
            {
                const ssize_t n = ::recv(fd, buf, sizeof buf, 0);
                if (n <= 0) break;
                data.append(buf, static_cast<size_t>(n));
                const auto end = data.find("\r\n\r\n");
                if (end != std::string::npos && need == std::string::npos)
                {
                    size_t length = 0;
                    const auto cl = data.find("Content-Length:");
                    if (cl != std::string::npos && cl < end) length = std::stoul(data.substr(cl + 15));
                    need = end + 4 + length;
                }
                if (need != std::string::npos && data.size() >= need) break;
            }
            const auto lineEnd = data.find("\r\n");
            const std::string first = data.substr(0, lineEnd);
            const auto sp1 = first.find(' '), sp2 = first.find(' ', sp1 + 1);
            const std::string method = first.substr(0, sp1), path = first.substr(sp1 + 1, sp2 - sp1 - 1);
            const auto bodyStart = data.find("\r\n\r\n");
            const std::string body = bodyStart == std::string::npos ? "" : data.substr(bodyStart + 4);
            if (path == "/" || path == "/index.html")
                Send(fd, 200, "text/html; charset=utf-8", Page());
            else if (path == "/events")
                Send(fd, 200, "application/json", Events());
            else if (path.rfind("/call/", 0) == 0)
            {
                const auto r = Call(path.substr(6), body.empty() ? "[]" : body);
                Send(fd, r.first == 0 ? 200 : 500, "application/json", r.second);
            }
            else
                Send(fd, 404, "text/plain", "not found");
            ::close(fd);
        }

        void Serve()
        {
            const char* p = std::getenv("STILLPOINT_TEST_PORT");
            const int port = p ? std::atoi(p) : 8765;
            const int server = ::socket(AF_INET, SOCK_STREAM, 0);
            int yes = 1;
            ::setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof yes);
            sockaddr_in addr{};
            addr.sin_family = AF_INET;
            addr.sin_port = htons(static_cast<uint16_t>(port));
            addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
            if (::bind(server, reinterpret_cast<sockaddr*>(&addr), sizeof addr) != 0 || ::listen(server, 64) != 0)
            {
                std::fprintf(stderr, "test host: cannot listen on %d\n", port);
                std::exit(3);
            }
            std::fprintf(stderr, "test host: listening on http://127.0.0.1:%d/\n", port);
            for (;;)
            {
                const int fd = ::accept(server, nullptr, nullptr);
                if (fd < 0) continue;
                std::thread([this, fd] { Handle(fd); }).detach();
            }
        }
    };
}
