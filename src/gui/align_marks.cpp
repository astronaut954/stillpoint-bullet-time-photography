#include "align_marks.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <thread>

// Mesma conta dos scripts de estudo (docs/estudos/alinhamento/find_marks.py e heights.py), sem o OpenCV:
//   - Snap: histograma de cor (Lab em caixas) dentro e em volta do ponto; os pixels da cor "de dentro" formam pedaços;
//     fica o pedaço perto do ponto e, se a marca for da largura da haste, só a faixa da largura da haste.
//   - Find: procura por semelhança (correlação normalizada, em cor) numa versão pequena da foto, em alguns tamanhos e
//     giros; escolhe o par alto/baixo que faz sentido junto; refina numa versão média; leva cada ponto ao centro da
//     marca na foto inteira; a marca do meio vem do mesmo lugar relativo e é levada ao centro.
//   - Solve: com três marcas de espaçamento igual, a perspectiva entre elas dá a distância verdadeira de cada câmera.

namespace AlignMarks
{
    namespace
    {
        constexpr double kPi = 3.14159265358979323846;

        // ---- Imagem pequena em float (3 canais), para a procura ----
        struct Img
        {
            int w = 0, h = 0;
            std::vector<float> px;  // RGB, 0 a 255
            float at(int x, int y, int c) const { return px[(size_t(y) * w + x) * 3 + c]; }
        };

        // Reduz (média de caixa) uma RgbFrame para a largura dada
        Img Shrink(const RgbFrame& f, int width)
        {
            Img out;
            const double k = double(f.width) / width;
            out.w = width;
            out.h = std::max(1, int(std::lround(f.height / k)));
            out.px.assign(size_t(out.w) * out.h * 3, 0.f);
            for (int y = 0; y < out.h; ++y)
            {
                const int y0 = std::min(f.height - 1, int(y * k)), y1 = std::max(y0 + 1, std::min(f.height, int((y + 1) * k)));
                for (int x = 0; x < out.w; ++x)
                {
                    const int x0 = std::min(f.width - 1, int(x * k)), x1 = std::max(x0 + 1, std::min(f.width, int((x + 1) * k)));
                    double s[3] = { 0, 0, 0 };
                    for (int yy = y0; yy < y1; ++yy)
                    {
                        const unsigned char* row = &f.pixels[(size_t(yy) * f.width + x0) * 3];
                        for (int xx = x0; xx < x1; ++xx, row += 3)
                        {
                            s[0] += row[0]; s[1] += row[1]; s[2] += row[2];
                        }
                    }
                    const double n = double(y1 - y0) * (x1 - x0);
                    for (int c = 0; c < 3; ++c)
                        out.px[(size_t(y) * out.w + x) * 3 + c] = float(s[c] / n);
                }
            }
            return out;
        }

        // Amostra com interpolação, repetindo a borda
        float Sample(const Img& im, double x, double y, int c)
        {
            x = std::clamp(x, 0.0, double(im.w - 1));
            y = std::clamp(y, 0.0, double(im.h - 1));
            const int x0 = int(x), y0 = int(y), x1 = std::min(x0 + 1, im.w - 1), y1 = std::min(y0 + 1, im.h - 1);
            const double fx = x - x0, fy = y - y0;
            return float((im.at(x0, y0, c) * (1 - fx) + im.at(x1, y0, c) * fx) * (1 - fy) + (im.at(x0, y1, c) * (1 - fx) + im.at(x1, y1, c) * fx) * fy);
        }

        // Recorte (2hw+1) x (2hh+1) em volta de p, mudado de tamanho (s) e girado (a, graus) em volta do centro
        bool Template(const Img& im, double px, double py, int hw, int hh, double s, double a, Img& out)
        {
            if (px < 0 || py < 0 || px >= im.w || py >= im.h)
                return false;  // perto da borda vale (a borda se repete); fora da foto, não
            out.w = std::max(3, int(std::lround((2 * hw + 1) * s)));
            out.h = std::max(3, int(std::lround((2 * hh + 1) * s)));
            out.px.assign(size_t(out.w) * out.h * 3, 0.f);
            const double ca = std::cos(a * kPi / 180), sa = std::sin(a * kPi / 180);
            const double cx = (out.w - 1) / 2.0, cy = (out.h - 1) / 2.0;
            for (int y = 0; y < out.h; ++y)
                for (int x = 0; x < out.w; ++x)
                {
                    // ponto do recorte -> foto (desfaz o giro e o tamanho)
                    const double u = (x - cx), v = (y - cy);
                    const double ru = (ca * u + sa * v) / s, rv = (-sa * u + ca * v) / s;
                    for (int c = 0; c < 3; ++c)
                        out.px[(size_t(y) * out.w + x) * 3 + c] = Sample(im, px + ru, py + rv, c);
                }
            return true;
        }

        // Correlação normalizada (como TM_CCOEFF_NORMED do OpenCV, nos 3 canais juntos) do recorte t na região
        // [x0, x1) x [y0, y1) das posições (canto de cima à esquerda) de im. Chama f(x, y, valor) para cada posição.
        template <typename F>
        void Match(const Img& im, const Img& t, int x0, int y0, int x1, int y1, F f)
        {
            const int n = t.w * t.h * 3;
            double tm = 0;
            for (float v : t.px) tm += v;
            tm /= n;
            std::vector<float> tz(t.px.size());
            double tn = 0;
            for (size_t i = 0; i < tz.size(); ++i) { tz[i] = float(t.px[i] - tm); tn += double(tz[i]) * tz[i]; }
            if (tn < 1e-6) return;
            x0 = std::max(0, x0); y0 = std::max(0, y0);
            x1 = std::min(x1, im.w - t.w + 1); y1 = std::min(y1, im.h - t.h + 1);
            const int rowLen = t.w * 3;
            for (int y = y0; y < y1; ++y)
                for (int x = x0; x < x1; ++x)
                {
                    double num = 0, s = 0, s2 = 0;
                    for (int ty = 0; ty < t.h; ++ty)
                    {
                        const float* ip = &im.px[(size_t(y + ty) * im.w + x) * 3];
                        const float* tp = &tz[size_t(ty) * rowLen];
                        for (int i = 0; i < rowLen; ++i)
                        {
                            const double v = ip[i];
                            num += tp[i] * v; s += v; s2 += v * v;
                        }
                    }
                    const double var = s2 - s * s / n;
                    f(x, y, var > 1e-6 ? num / std::sqrt(tn * var) : 0.0);
                }
        }

        struct Cand { double v, x, y, s, a; };

        // As melhores posições do recorte (centro), em vários tamanhos e giros, sem repetir o mesmo lugar
        std::vector<Cand> Candidates(const Img& im, const Img& ref, double px, double py, int hw, int hh, size_t keep)
        {
            static const double kScales[] = { 0.85, 1.0, 1.18 };
            static const double kAngles[] = { -6, 0, 6 };
            std::vector<Cand> all;
            for (double s : kScales)
                for (double a : kAngles)
                {
                    Img t;
                    if (!Template(ref, px, py, hw, hh, s, a, t)) continue;
                    if (t.w >= im.w || t.h >= im.h) continue;
                    const int mw = im.w - t.w + 1, mh = im.h - t.h + 1;
                    std::vector<float> map(size_t(mw) * mh, -1.f);
                    Match(im, t, 0, 0, mw, mh, [&](int x, int y, double v) { map[size_t(y) * mw + x] = float(v); });
                    const int sup = std::max(4, t.h / 2);
                    for (int k = 0; k < 4; ++k)
                    {
                        size_t best = 0;
                        for (size_t i = 1; i < map.size(); ++i) if (map[i] > map[best]) best = i;
                        const int bx = int(best % mw), by = int(best / mw);
                        all.push_back({ map[best], bx + t.w / 2.0, by + t.h / 2.0, s, a });
                        for (int y = std::max(0, by - sup); y <= std::min(mh - 1, by + sup); ++y)
                            for (int x = std::max(0, bx - sup); x <= std::min(mw - 1, bx + sup); ++x)
                                if ((x - bx) * (x - bx) + (y - by) * (y - by) <= sup * sup) map[size_t(y) * mw + x] = -1.f;
                    }
                }
            std::sort(all.begin(), all.end(), [](const Cand& a, const Cand& b) { return a.v > b.v; });
            std::vector<Cand> pick;
            for (const auto& c : all)
            {
                bool far = true;
                for (const auto& p : pick) if ((c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y) <= 36 * 0.25) { far = false; break; }
                if (far) pick.push_back(c);
                if (pick.size() >= keep) break;
            }
            return pick;
        }

        // ---- Cor em caixas (Lab), para o Snap ----
        double Lin(double v) { v /= 255.0; return v <= 0.04045 ? v / 12.92 : std::pow((v + 0.055) / 1.055, 2.4); }
        const std::array<double, 256>& LinTable()
        {
            static const std::array<double, 256> t = [] { std::array<double, 256> a{}; for (int i = 0; i < 256; ++i) a[i] = Lin(i); return a; }();
            return t;
        }
        std::array<double, 3> ToLab(const unsigned char* p)
        {
            const auto& L = LinTable();
            const double r = L[p[0]], g = L[p[1]], b = L[p[2]];
            const double X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
            auto f = [](double t) { return t > 0.008856 ? std::cbrt(t) : 7.787 * t + 16.0 / 116; };
            const double fx = f(X), fy = f(Y), fz = f(Z);
            return { 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz) };
        }
        int ColorBin(const unsigned char* p)
        {
            const auto lab = ToLab(p);
            const double Ls = lab[0], as = lab[1], bs = lab[2];
            const int li = std::clamp(int(Ls * 2.55 / 16), 0, 15);
            const int ai = std::clamp(int((as + 128) / 12), 0, 21);
            const int bi = std::clamp(int((bs + 128) / 12), 0, 21);
            return li * 484 + ai * 22 + bi;
        }
        constexpr int kBins = 16 * 484;

        // Os pixels "da cor da marca" na janela em volta de p; devolve false se o ponto está fora da foto
        struct Window
        {
            int x0 = 0, y0 = 0, w = 0, h = 0;
            std::vector<unsigned char> like;
        };
        bool LikeMask(const RgbFrame& img, Pt p, double rin, Window& win, const Pt* other = nullptr)
        {
            const double rout = std::max(12.0, rin / 0.05 * 0.16);
            // perto da borda, a janela é cortada (só sai fora se o ponto estiver fora da foto)
            if (p.x < 0 || p.y < 0 || p.x >= img.width || p.y >= img.height) return false;
            win.x0 = std::max(0, int(p.x - rout)); win.y0 = std::max(0, int(p.y - rout));
            const int x1 = std::min(img.width, int(p.x + rout) + 1), y1 = std::min(img.height, int(p.y + rout) + 1);
            if (x1 - win.x0 < 8 || y1 - win.y0 < 8) return false;
            win.w = x1 - win.x0; win.h = y1 - win.y0;
            std::vector<int> q(size_t(win.w) * win.h);
            std::vector<double> hin(kBins, 0), hout(kBins, 0);
            double nin = 0, nout = 0;
            for (int y = 0; y < win.h; ++y)
                for (int x = 0; x < win.w; ++x)
                {
                    const int b = ColorBin(&img.pixels[(size_t(win.y0 + y) * img.width + win.x0 + x) * 3]);
                    q[size_t(y) * win.w + x] = b;
                    const double r = std::hypot(win.x0 + x - p.x, win.y0 + y - p.y);
                    if (r <= rin) { hin[b] += 1; nin += 1; }
                    if (r >= rin * 2.2) { hout[b] += 1; nout += 1; }
                }
            // A cor da haste, um pouco acima e abaixo do ponto: não é marca (sem isso, a haste sob o ponto entra junto
            // e segura o ponto onde está)
            std::vector<double> hpole;
            double npole = 0;
            if (other)
            {
                double ax = other->x - p.x, ay = other->y - p.y;
                const double n = std::hypot(ax, ay);
                if (n > 1)
                {
                    ax /= n; ay /= n;
                    hpole.assign(kBins, 0);
                    const double sideMax = std::max(1.5, rin * 0.35);
                    for (int sgn = -1; sgn <= 1; sgn += 2)
                        for (double along = rin * 2.4; along <= rin * 4.0; along += 1.0)
                            for (double side = -sideMax; side <= sideMax; side += 1.0)
                            {
                                const int x = int(std::lround(p.x + sgn * along * ax + side * ay)), y = int(std::lround(p.y + sgn * along * ay - side * ax));
                                if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
                                hpole[ColorBin(&img.pixels[(size_t(y) * img.width + x) * 3])] += 1;
                                npole += 1;
                            }
                }
            }
            win.like.assign(q.size(), 0);
            for (int y = 0; y < win.h; ++y)
                for (int x = 0; x < win.w; ++x)
                {
                    const int b = q[size_t(y) * win.w + x];
                    const double fi = hin[b] / std::max(1.0, nin), fo = hout[b] / std::max(1.0, nout);
                    const double r = std::hypot(win.x0 + x - p.x, win.y0 + y - p.y);
                    const bool pole = npole > 0 && hpole[b] / npole > 0.08;
                    win.like[size_t(y) * win.w + x] = (fi > 0.02 && fi > 3 * fo && r <= rin * 2.2 && !pole) ? 1 : 0;
                }
            return true;
        }

        // Pedaços ligados (8 vizinhos) da máscara
        struct Blob { std::vector<int> idx; double cx = 0, cy = 0; };
        std::vector<Blob> Blobs(const Window& win)
        {
            std::vector<int> lab(win.like.size(), -1);
            std::vector<Blob> out;
            std::vector<int> stack;
            for (int start = 0; start < int(win.like.size()); ++start)
            {
                if (!win.like[start] || lab[start] >= 0) continue;
                Blob b;
                const int id = int(out.size());
                stack.assign(1, start); lab[start] = id;
                while (!stack.empty())
                {
                    const int i = stack.back(); stack.pop_back();
                    b.idx.push_back(i);
                    const int x = i % win.w, y = i / win.w;
                    for (int dy = -1; dy <= 1; ++dy)
                        for (int dx = -1; dx <= 1; ++dx)
                        {
                            const int nx = x + dx, ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= win.w || ny >= win.h) continue;
                            const int j = ny * win.w + nx;
                            if (win.like[j] && lab[j] < 0) { lab[j] = id; stack.push_back(j); }
                        }
                }
                for (int i : b.idx) { b.cx += win.x0 + i % win.w; b.cy += win.y0 + i / win.w; }
                b.cx /= b.idx.size(); b.cy /= b.idx.size();
                out.push_back(std::move(b));
            }
            return out;
        }

        double Percentile(std::vector<double> v, double q)
        {
            if (v.empty()) return 0;
            std::sort(v.begin(), v.end());
            const double pos = q * (v.size() - 1);
            const size_t i = size_t(pos);
            return i + 1 < v.size() ? v[i] + (v[i + 1] - v[i]) * (pos - i) : v[i];
        }

        double Median(std::vector<double> v) { return Percentile(std::move(v), 0.5); }
    }

    bool IsWide(const RgbFrame& img, Pt p, double d, Pt other)
    {
        const double rin = std::max(5.0, d * 0.05);
        Window win;
        if (!LikeMask(img, p, rin, win, &other)) return false;
        auto blobs = Blobs(win);
        if (blobs.empty()) return false;
        const Blob* near = &blobs[0];
        for (const auto& b : blobs) if (std::hypot(b.cx - p.x, b.cy - p.y) < std::hypot(near->cx - p.x, near->cy - p.y)) near = &b;
        double ax = other.x - p.x, ay = other.y - p.y;
        const double n = std::hypot(ax, ay);
        if (n < 1) return false;
        ax /= n; ay /= n;
        std::vector<double> side;
        for (int i : near->idx) side.push_back((win.x0 + i % win.w - p.x) * ay - (win.y0 + i / win.w - p.y) * ax);
        const double markW = Percentile(side, 0.9) - Percentile(side, 0.1);
        // A largura da haste, logo acima e abaixo da marca: a cor que domina no meio da faixa, medida de lado a lado
        std::vector<int> bins(kBins, 0);
        struct S { int bin; double side; };
        std::vector<S> strip;
        for (int sgn = -1; sgn <= 1; sgn += 2)
            for (double along = rin * 2.4; along <= rin * 4.0; along += 1.0)
                for (double sd = -rin; sd <= rin; sd += 0.5)
                {
                    const int x = int(std::lround(p.x + sgn * along * ax + sd * ay)), y = int(std::lround(p.y + sgn * along * ay - sd * ax));
                    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
                    const int b = ColorBin(&img.pixels[(size_t(y) * img.width + x) * 3]);
                    strip.push_back({ b, sd });
                    if (std::abs(sd) <= std::max(1.5, rin * 0.15)) ++bins[b];
                }
        const int poleBin = int(std::max_element(bins.begin(), bins.end()) - bins.begin());
        std::vector<double> poleSide;
        for (const auto& e : strip) if (e.bin == poleBin) poleSide.push_back(e.side);
        // a cor do meio também aparece nos lados: é o fundo, não uma haste
        const double count = double(bins[poleBin]);
        const bool poleFound = count > 0 && poleSide.size() < count * (rin / std::max(1.5, rin * 0.15)) * 0.6;
        if (poleFound && poleSide.size() >= 8)
        {
            const double poleW = Percentile(poleSide, 0.95) - Percentile(poleSide, 0.05);
            return markW > 1.6 * std::max(1.0, poleW);
        }
        return markW > 2.4 * std::max(4.0, d * 0.035);
    }

    Pt Snap(const RgbFrame& img, Pt p, double d, Pt other, bool wide)
    {
        double ax = other.x - p.x, ay = other.y - p.y;
        const double n = std::hypot(ax, ay);
        const bool axis = n > 1;
        if (axis) { ax /= n; ay /= n; }
        const double rin = std::max(5.0, d * 0.05);
        for (int round = 0; round < 3; ++round)
        {
            Window win;
            if (!LikeMask(img, p, rin, win, axis ? &other : nullptr)) return p;
            int count = 0;
            for (auto v : win.like) count += v;
            if (count < 12) return p;
            std::vector<int> keep;
            for (const auto& b : Blobs(win))
            {
                if (b.idx.size() < 6 || std::hypot(b.cx - p.x, b.cy - p.y) > rin * 1.6) continue;
                if (axis && std::abs((b.cx - p.x) * ay - (b.cy - p.y) * ax) > std::max(6.0, d * 0.07)) continue;
                keep.insert(keep.end(), b.idx.begin(), b.idx.end());
            }
            if (keep.size() < 12) return p;
            double sx = 0, sy = 0, cnt = 0;
            const double band = std::max(4.0, d * 0.035);
            for (int i : keep)
            {
                const double x = win.x0 + i % win.w, y = win.y0 + i / win.w;
                if (axis && !wide && std::abs((x - p.x) * ay - (y - p.y) * ax) > band) continue;
                sx += x; sy += y; cnt += 1;
            }
            if (cnt < 6) return p;
            const Pt np{ sx / cnt, sy / cnt };
            if (std::hypot(np.x - p.x, np.y - p.y) < 0.3) return np;
            p = np;
        }
        return p;
    }

    namespace
    {
        // Cor média (Lab) da marca sob o ponto, na foto de referência
        bool MarkColor(const RgbFrame& img, Pt p, double d, Pt other, std::array<double, 3>& lab)
        {
            const double rin = std::max(5.0, d * 0.05);
            Window win;
            if (!LikeMask(img, p, rin, win, &other)) return false;
            double s[3] = { 0, 0, 0 }, n = 0;
            for (int y = 0; y < win.h; ++y)
                for (int x = 0; x < win.w; ++x)
                    if (win.like[size_t(y) * win.w + x] && std::hypot(win.x0 + x - p.x, win.y0 + y - p.y) <= rin * 1.2)
                    {
                        const auto c = ToLab(&img.pixels[(size_t(win.y0 + y) * img.width + win.x0 + x) * 3]);
                        s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n += 1;
                    }
            if (n < 6) return false;
            lab = { s[0] / n, s[1] / n, s[2] / n };
            return true;
        }

        // Onde aparece a cor da marca (pedaços de pixels parecidos); devolve os centros dos maiores pedaços
        std::vector<Pt> ColorSpots(const Img& im, const std::array<double, 3>& lab, double maxArea, size_t keep)
        {
            std::vector<unsigned char> m(size_t(im.w) * im.h, 0);
            for (int y = 0; y < im.h; ++y)
                for (int x = 0; x < im.w; ++x)
                {
                    unsigned char px[3];
                    for (int c = 0; c < 3; ++c) px[c] = (unsigned char)std::clamp(int(im.at(x, y, c) + 0.5f), 0, 255);
                    const auto c = ToLab(px);
                    // claro/escuro pesa menos: a luz muda de uma câmera para outra
                    const double dl = (c[0] - lab[0]) * 0.5, da = c[1] - lab[1], db = c[2] - lab[2];
                    m[size_t(y) * im.w + x] = dl * dl + da * da + db * db < 22.0 * 22.0 ? 1 : 0;
                }
            Window win; win.w = im.w; win.h = im.h; win.like = std::move(m);
            std::vector<Blob> blobs = Blobs(win);
            std::sort(blobs.begin(), blobs.end(), [](const Blob& a, const Blob& b) { return a.idx.size() > b.idx.size(); });
            std::vector<Pt> out;
            for (const auto& b : blobs)
            {
                if (b.idx.size() < 3) break;
                if (double(b.idx.size()) > maxArea) continue;  // uma parede inteira da mesma cor não é marca
                out.push_back({ b.cx, b.cy });
                if (out.size() >= keep) break;
            }
            return out;
        }

        // Nota de semelhança do recorte de ref (em p) em volta de q na outra foto: o melhor entre tamanhos e giros
        Cand Score(const Img& ref, Pt p, int hw, int hh, const Img& im, Pt q, int reach)
        {
            static const double kScales[] = { 0.8, 0.9, 1.0, 1.1, 1.25 };
            static const double kAngles[] = { -8, -4, 0, 4, 8 };
            Cand best{ -2, q.x, q.y, 1, 0 };
            for (double s : kScales)
                for (double a : kAngles)
                {
                    Img t;
                    if (!Template(ref, p.x, p.y, hw, hh, s, a, t)) continue;
                    const int x0 = int(std::lround(q.x - (t.w - 1) / 2.0)) - reach, y0 = int(std::lround(q.y - (t.h - 1) / 2.0)) - reach;
                    Match(im, t, x0, y0, x0 + 2 * reach + 1, y0 + 2 * reach + 1, [&](int x, int y, double v) {
                        if (v > best.v) best = { v, x + (t.w - 1) / 2.0, y + (t.h - 1) / 2.0, s, a };
                    });
                }
            return best;
        }
    }

    Found Find(const RgbFrame& refFull, const Pt marks[3], const RgbFrame& imgFull, bool wide)
    {
        Found out;
        if (refFull.width < 16 || imgFull.width < 16) return out;
        const Pt a = marks[0], m = marks[1], b = marks[2];
        const double dFull = std::hypot(a.x - b.x, a.y - b.y);
        if (dFull < 8) return out;
        // A cor de cada marca, na foto de referência
        std::array<double, 3> colA{}, colM{}, colB{};
        const bool hasA = MarkColor(refFull, a, dFull, b, colA), hasM = MarkColor(refFull, m, dFull, a, colM), hasB = MarkColor(refFull, b, dFull, a, colB);
        // 1) Versões de 800 px: onde a cor de cada marca aparece, e a nota de semelhança em cada lugar
        const int work = 800;
        const int rw = std::min(work, refFull.width), iw = std::min(work, imgFull.width);
        const Img R = Shrink(refFull, rw), I = Shrink(imgFull, iw);
        const double kr = double(rw) / refFull.width, ki = double(iw) / imgFull.width;
        const double d = dFull * kr * iw / rw;  // distância entre as marcas, nas medidas da outra foto (se o tamanho fosse igual)
        const int hw = std::max(3, int(std::lround(dFull * kr * 0.045))), hh = std::max(6, int(std::lround(dFull * kr * 0.14)));
        const double maxArea = (0.25 * d) * (0.25 * d) * 1.6 * 1.6;
        auto cands = [&](Pt click, bool has, const std::array<double, 3>& col) {
            std::vector<Cand> out;
            if (has)
                for (const Pt& q : ColorSpots(I, col, maxArea, 16))
                    out.push_back(Score(R, { click.x * kr, click.y * kr }, hw, hh, I, q, 4));
            if (out.empty())  // cor que não se destaca (marca branca ou cinza): procura na foto toda, numa versão pequena
            {
                const int smallW = 320;
                const Img Rs = Shrink(refFull, std::min(smallW, refFull.width)), Is = Shrink(imgFull, std::min(smallW, imgFull.width));
                const double ks = double(Rs.w) / refFull.width, kis = double(Is.w) / imgFull.width;
                const int shw = std::max(3, int(std::lround(dFull * ks * 0.045))), shh = std::max(5, int(std::lround(dFull * ks * 0.14)));
                for (const Cand& c : Candidates(Is, Rs, click.x * ks, click.y * ks, shw, shh, 12))
                    out.push_back(Score(R, { click.x * kr, click.y * kr }, hw, hh, I, { c.x / kis * ki, c.y / kis * ki }, 6));
            }
            return out;
        };
        const std::vector<Cand> ca = cands(a, hasA, colA), cb = cands(b, hasB, colB);
        // 2) O par alto/baixo que faz sentido junto: distância, direção e tamanho combinando
        const double refAng = std::atan2(a.x - b.x, -(a.y - b.y));
        double best = -1;
        Cand ba{}, bb{};
        for (const auto& A : ca)
            for (const auto& B : cb)
            {
                const double dd = std::hypot(A.x - B.x, A.y - B.y);
                if (dd < 0.6 * d || dd > 1.6 * d || B.y <= A.y) continue;
                const double ang = std::atan2(A.x - B.x, -(A.y - B.y));
                if (std::abs((ang - refAng) * 180 / kPi) > 20) continue;
                const double cons = 1.0 - std::min(0.5, std::abs(dd / d - (A.s + B.s) / 2));
                const double score = (A.v + B.v) / 2 * cons;
                if (score > best) { best = score; ba = A; bb = B; }
            }
        if (best < 0) return out;
        // 3) Centro de cada marca, na foto inteira
        Pt pa{ ba.x / ki, ba.y / ki }, pb{ bb.x / ki, bb.y / ki };
        const double d1 = std::hypot(pa.x - pb.x, pa.y - pb.y);
        const Pt sa = Snap(imgFull, pa, d1, pb, wide), sb = Snap(imgFull, pb, d1, pa, wide);
        // A do meio: perto do mesmo lugar relativo da foto de referência (muda um pouco com a altura da câmera);
        // a mancha da cor dela mais perto da linha entre as outras duas
        const double t = ((m.x - a.x) * (b.x - a.x) + (m.y - a.y) * (b.y - a.y)) / (dFull * dFull);
        Pt guess{ sa.x + (sb.x - sa.x) * t, sa.y + (sb.y - sa.y) * t };
        const double d2 = std::hypot(sa.x - sb.x, sa.y - sb.y);
        if (hasM)
        {
            double bestD = 1e18;
            const Pt gi{ guess.x * ki, guess.y * ki };
            for (const Pt& q : ColorSpots(I, colM, maxArea, 16))
            {
                // entre as outras duas, e perto da linha da haste
                const double ux = (sb.x - sa.x) * ki, uy = (sb.y - sa.y) * ki, len = std::hypot(ux, uy);
                const double along = ((q.x - sa.x * ki) * ux + (q.y - sa.y * ki) * uy) / (len * len);
                const double side = std::abs((q.x - sa.x * ki) * uy - (q.y - sa.y * ki) * ux) / len;
                if (along < 0.15 || along > 0.85 || side > 0.06 * len) continue;
                const double dist = std::hypot(q.x - gi.x, q.y - gi.y);
                if (dist < bestD) { bestD = dist; guess = { q.x / ki, q.y / ki }; }
            }
        }
        const Pt sm = Snap(imgFull, guess, d2, sa, wide);
        out.ok = true;
        out.p[0] = sa; out.p[1] = sm; out.p[2] = sb;
        out.confidence = std::clamp(best, 0.0, 1.0);
        return out;
    }

    void Solve(const std::vector<Camera>& cams, std::vector<Recipe>& recipes, std::vector<Aim>& aims)
    {
        recipes.assign(cams.size(), {});
        aims.assign(cams.size(), {});
        std::vector<double> apparent(cams.size(), 0), heights(cams.size(), 0);
        for (size_t i = 0; i < cams.size(); ++i)
        {
            const Camera& c = cams[i];
            const double f = c.focalPx > 0 ? c.focalPx : c.width * 1.2;  // sem a distância focal: uma lente normal
            const double cx = c.width / 2.0, cy = c.height / 2.0;
            std::array<std::array<double, 3>, 3> r{};
            for (int k = 0; k < 3; ++k) r[k] = { (c.p[k].x - cx) / f, (c.p[k].y - cy) / f, 1.0 };
            // s1 r1 / 2 - s2 r2 + s3 r3 / 2 = 0: a do meio está no meio das outras duas (espaçamento igual)
            double A[3][3];
            for (int row = 0; row < 3; ++row) { A[row][0] = r[0][row] / 2; A[row][1] = -r[1][row]; A[row][2] = r[2][row] / 2; }
            auto cross = [](const double* u, const double* v, double* w) { w[0] = u[1] * v[2] - u[2] * v[1]; w[1] = u[2] * v[0] - u[0] * v[2]; w[2] = u[0] * v[1] - u[1] * v[0]; };
            double s[3] = { 0, 1, 0 }, bestN = -1;
            for (int p = 0; p < 3; ++p)
            {
                double w[3];
                cross(A[p], A[(p + 1) % 3], w);
                const double n = std::hypot(w[0], std::hypot(w[1], w[2]));
                if (n > bestN && std::abs(w[1]) > 1e-12) { bestN = n; s[0] = w[0] / w[1]; s[1] = 1; s[2] = w[2] / w[1]; }
            }
            if (s[0] <= 0 || s[2] <= 0) { s[0] = s[2] = 1; }  // conta sem sentido (marcas erradas): sem correção de perspectiva
            double X1[3], X2[3], X3[3];
            for (int k = 0; k < 3; ++k) { X1[k] = s[0] * r[0][k]; X2[k] = r[1][k]; X3[k] = s[2] * r[2][k]; }
            const double L = std::hypot(X1[0] - X3[0], std::hypot(X1[1] - X3[1], X1[2] - X3[2]));
            const double spacing = L / 2;
            const double dist = std::hypot(X2[0], std::hypot(X2[1], X2[2])) / spacing;
            double up[3] = { (X1[0] - X3[0]) / L, (X1[1] - X3[1]) / L, (X1[2] - X3[2]) / L };
            heights[i] = -(X2[0] * up[0] + X2[1] * up[1] + X2[2] * up[2]) / spacing;
            apparent[i] = f / dist;  // tamanho com que esta câmera vê a haste (pixels por espaço)

            Recipe& rc = recipes[i];
            rc.distance = dist;
            rc.dx = cx - c.p[1].x;
            rc.dy = cy - c.p[1].y;
            const double lean = std::atan2(c.p[0].x - c.p[2].x, c.p[2].y - c.p[0].y) * 180 / kPi;  // positivo = tombada para a direita
            rc.rot = -lean;
            Aim& am = aims[i];
            am.pan = std::atan((c.p[1].x - cx) / f) * 180 / kPi;
            am.tilt = std::atan((cy - c.p[1].y) / f) * 180 / kPi;
            am.roll = lean;
        }
        const double medA = Median(apparent), medH = Median(heights);
        for (size_t i = 0; i < cams.size(); ++i)
        {
            recipes[i].scale = apparent[i] > 0 ? medA / apparent[i] : 1;
            aims[i].sizePct = medA > 0 ? (apparent[i] / medA - 1) * 100 : 0;
            aims[i].height = heights[i] - medH;
        }
    }
}
