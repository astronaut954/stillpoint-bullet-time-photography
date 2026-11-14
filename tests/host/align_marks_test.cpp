// Alinhamento com a haste de três marcas (etapa 21), conferido direto, sem a janela.
//   build/host-test/AlignMarksTest   (o run_tests.py roda e mostra as linhas)
// Cenas de mentira: uma haste em pé com três marcas de espaçamento igual, vista por câmeras num arco, em alturas,
// distâncias, miras e inclinações diferentes, com luz diferente em cada uma e uma mancha da cor de uma marca ao lado. Como a cena é inventada, a resposta certa é conhecida.
#include "align_marks.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace
{
    constexpr double kPi = 3.14159265358979323846;
    int failed = 0;
    void Check(const std::string& name, bool ok, const std::string& details = "")
    {
        std::printf("%s  %s%s\n", ok ? "PASS" : "FAIL", name.c_str(), details.empty() ? "" : ("   [" + details + "]").c_str());
        if (!ok) ++failed;
    }
    std::string Num(double v) { char b[64]; std::snprintf(b, sizeof b, "%.3f", v); return b; }

    struct V3 { double x, y, z; };
    V3 Sub(V3 a, V3 b) { return { a.x - b.x, a.y - b.y, a.z - b.z }; }
    double Dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    V3 Cross(V3 a, V3 b) { return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; }
    V3 Norm(V3 a) { const double n = std::sqrt(Dot(a, a)); return { a.x / n, a.y / n, a.z / n }; }

    // Câmera de mentira. Mundo: z para cima (metros); a haste em pé na origem, marcas em z = 0.6, 1.0, 1.4.
    struct Cam
    {
        V3 pos, right, down, fwd;
        double f; int w, h;
        bool Project(V3 P, double& u, double& v) const
        {
            const V3 d = Sub(P, pos);
            const double z = Dot(d, fwd);
            if (z <= 0.01) return false;
            u = w / 2.0 + f * Dot(d, right) / z;
            v = h / 2.0 + f * Dot(d, down) / z;
            return true;
        }
    };
    // azimute (graus), distância no chão, altura da câmera, erro de mira (graus), giro da câmera (graus)
    Cam MakeCam(double az, double dist, double height, double panErr, double tiltErr, double roll, double f, int w = 1500, int h = 1000)
    {
        Cam c;
        const double a = az * kPi / 180;
        c.pos = { dist * std::cos(a), dist * std::sin(a), height };
        V3 fwd = Norm(Sub({ 0, 0, 1.0 }, c.pos));
        // erro de mira: virar e inclinar um pouco
        const double p = panErr * kPi / 180, t = tiltErr * kPi / 180;
        V3 side = Norm(Cross(fwd, { 0, 0, 1 }));
        V3 up = Cross(side, fwd);
        fwd = Norm({ fwd.x + side.x * std::tan(p) + up.x * std::tan(t), fwd.y + side.y * std::tan(p) + up.y * std::tan(t), fwd.z + side.z * std::tan(p) + up.z * std::tan(t) });
        side = Norm(Cross(fwd, { 0, 0, 1 }));
        up = Cross(side, fwd);
        const double r = roll * kPi / 180;
        c.right = { side.x * std::cos(r) + up.x * std::sin(r), side.y * std::cos(r) + up.y * std::sin(r), side.z * std::cos(r) + up.z * std::sin(r) };
        const V3 upR = Cross(c.right, fwd);
        c.down = { -upR.x, -upR.y, -upR.z };
        c.fwd = fwd;
        c.f = f; c.w = w; c.h = h;
        return c;
    }

    const V3 kMarks[3] = { { 0, 0, 1.4 }, { 0, 0, 1.0 }, { 0, 0, 0.6 } };

    // A foto: fundo com textura (parede e chão), a haste cinza e as três marcas (bolas coloridas ou faixas).
    RgbFrame Render(const Cam& c, bool balls)
    {
        RgbFrame f; f.width = c.w; f.height = c.h; f.pixels.assign(size_t(c.w) * c.h * 3, 0);
        double hu = 0, hv = 0;
        c.Project({ 100 * c.fwd.x + c.pos.x, 100 * c.fwd.y + c.pos.y, c.pos.z }, hu, hv);  // altura do horizonte
        for (int y = 0; y < c.h; ++y)
            for (int x = 0; x < c.w; ++x)
            {
                unsigned char* p = &f.pixels[(size_t(y) * c.w + x) * 3];
                const unsigned n = (unsigned(x) * 73856093u) ^ (unsigned(y) * 19349663u);
                const int noise = int((n >> 7) % 9) - 4;
                const bool floor = y > hv + 60;
                const int base = floor ? 120 : 200;
                p[0] = (unsigned char)std::clamp(base + noise + (floor ? 10 : 0), 0, 255);
                p[1] = (unsigned char)std::clamp(base + noise - 4, 0, 255);
                p[2] = (unsigned char)std::clamp(base + noise - (floor ? 20 : 10), 0, 255);
            }
        // Haste: de z = 0.2 a z = 1.6, raio 1 cm
        const int steps = 400;
        for (int s = 0; s <= steps; ++s)
        {
            const double z = 0.2 + 1.4 * s / steps;
            double u, v, u2, v2;
            if (!c.Project({ 0, 0, z }, u, v) || !c.Project({ 0.01 * c.right.x, 0.01 * c.right.y, z + 0.01 * c.right.z }, u2, v2)) continue;
            const double r = std::max(1.5, std::hypot(u2 - u, v2 - v));
            for (int y = int(v - r - 1); y <= int(v + r + 1); ++y)
                for (int x = int(u - r - 1); x <= int(u + r + 1); ++x)
                    if (x >= 0 && y >= 0 && x < c.w && y < c.h && std::hypot(x - u, y - v) <= r)
                    {
                        unsigned char* p = &f.pixels[(size_t(y) * c.w + x) * 3];
                        p[0] = 70; p[1] = 70; p[2] = 75;
                    }
        }
        // Marcas: bola de raio 4 cm (balls) ou faixa colorida na haste de 3 cm de altura
        const unsigned char colors[3][3] = { { 220, 40, 40 }, { 40, 170, 60 }, { 40, 70, 220 } };
        for (int k = 0; k < 3; ++k)
        {
            double u, v, u2, v2;
            if (!c.Project(kMarks[k], u, v)) continue;
            if (balls)
            {
                c.Project({ kMarks[k].x + 0.04 * c.right.x, kMarks[k].y + 0.04 * c.right.y, kMarks[k].z + 0.04 * c.right.z }, u2, v2);
                const double r = std::hypot(u2 - u, v2 - v);
                for (int y = int(v - r - 1); y <= int(v + r + 1); ++y)
                    for (int x = int(u - r - 1); x <= int(u + r + 1); ++x)
                        if (x >= 0 && y >= 0 && x < c.w && y < c.h && std::hypot(x - u, y - v) <= r)
                        {
                            unsigned char* p = &f.pixels[(size_t(y) * c.w + x) * 3];
                            const double shade = 1.0 - 0.25 * std::hypot(x - u, y - v) / r;
                            for (int ch = 0; ch < 3; ++ch) p[ch] = (unsigned char)(colors[k][ch] * shade);
                        }
            }
            else
            {
                for (int s = -30; s <= 30; ++s)
                {
                    const double z = kMarks[k].z + 0.015 * s / 30;
                    double a, b, a2, b2;
                    if (!c.Project({ 0, 0, z }, a, b) || !c.Project({ 0.012 * c.right.x, 0.012 * c.right.y, z + 0.012 * c.right.z }, a2, b2)) continue;
                    const double r = std::max(1.5, std::hypot(a2 - a, b2 - b));
                    for (int y = int(b - r - 1); y <= int(b + r + 1); ++y)
                        for (int x = int(a - r - 1); x <= int(a + r + 1); ++x)
                            if (x >= 0 && y >= 0 && x < c.w && y < c.h && std::hypot(x - a, y - b) <= r)
                            {
                                unsigned char* p = &f.pixels[(size_t(y) * c.w + x) * 3];
                                for (int ch = 0; ch < 3; ++ch) p[ch] = colors[k][ch];
                            }
                }
            }
        }
        return f;
    }

    // A conta da distância verdadeira e da altura, com as marcas exatas (sem foto)
    void TestSolve()
    {
        std::vector<Cam> cams;
        const double heights[] = { 1.0, 1.0, 1.5, 0.5, 1.25, 0.75, 1.0 };
        const double dists[] = { 2.0, 2.2, 1.9, 2.0, 2.4, 2.0, 1.8 };
        for (int i = 0; i < 7; ++i)
            cams.push_back(MakeCam(-45 + 15 * i, dists[i], heights[i], (i % 3 - 1) * 2.0, (i % 2 ? 1.5 : -1.0), (i % 4 - 1.5) * 1.2, 1800));
        std::vector<AlignMarks::Camera> in;
        for (const auto& c : cams)
        {
            AlignMarks::Camera a; a.width = c.w; a.height = c.h; a.focalPx = c.f;
            for (int k = 0; k < 3; ++k) c.Project(kMarks[k], a.p[k].x, a.p[k].y);
            in.push_back(a);
        }
        std::vector<AlignMarks::Recipe> rec;
        std::vector<AlignMarks::Aim> aim;
        AlignMarks::Solve(in, rec, aim);
        double worstD = 0, worstH = 0, worstMid = 0, worstScale = 0;
        std::vector<double> trueDist;
        for (const auto& c : cams) trueDist.push_back(std::sqrt(Dot(Sub(kMarks[1], c.pos), Sub(kMarks[1], c.pos))) / 0.4);
        std::vector<double> sorted = trueDist; std::sort(sorted.begin(), sorted.end());
        const double medDist = sorted[sorted.size() / 2];
        std::vector<double> hs; for (double h : heights) hs.push_back(h); std::sort(hs.begin(), hs.end());
        const double medH = hs[hs.size() / 2];
        for (size_t i = 0; i < cams.size(); ++i)
        {
            worstD = std::max(worstD, std::abs(rec[i].distance - trueDist[i]) / trueDist[i]);
            worstH = std::max(worstH, std::abs(aim[i].height - (heights[i] - medH) / 0.4));
            worstScale = std::max(worstScale, std::abs(rec[i].scale - trueDist[i] / medDist) / (trueDist[i] / medDist));
            // a receita leva a marca do meio para o centro
            worstMid = std::max(worstMid, std::hypot(in[i].p[1].x + rec[i].dx - in[i].width / 2.0, in[i].p[1].y + rec[i].dy - in[i].height / 2.0));
        }
        Check("three marks: true distance of each camera (within 0.5%)", worstD < 0.005, Num(worstD));
        Check("three marks: camera height against the others (within 0.02 mark spacing)", worstH < 0.02, Num(worstH));
        Check("three marks: size correction follows the true distance (within 0.5%)", worstScale < 0.005, Num(worstScale));
        Check("recipe takes the middle mark to the center of the photo", worstMid < 1e-6, Num(worstMid));

        // Inclinação da foto: câmera girada 3 graus -> a haste aparece tombada e a receita desfaz
        Cam tilted = MakeCam(0, 2.0, 1.0, 0, 0, 3.0, 1800);
        AlignMarks::Camera a; a.width = tilted.w; a.height = tilted.h; a.focalPx = tilted.f;
        for (int k = 0; k < 3; ++k) tilted.Project(kMarks[k], a.p[k].x, a.p[k].y);
        AlignMarks::Solve({ a }, rec, aim);
        Check("camera turned 3 degrees: the roll comes out as 3 degrees", std::abs(std::abs(aim[0].roll) - 3.0) < 0.05, Num(aim[0].roll));
        Check("... and the recipe turns the photo back the same amount", std::abs(rec[0].rot + aim[0].roll) < 1e-9, Num(rec[0].rot));
        // Mira: câmera virada 4 graus para um lado
        Cam panned = MakeCam(0, 2.0, 1.0, 4.0, 0, 0, 1800);
        for (int k = 0; k < 3; ++k) panned.Project(kMarks[k], a.p[k].x, a.p[k].y);
        AlignMarks::Solve({ a }, rec, aim);
        Check("camera aimed 4 degrees off: the turn to fix it comes out as 4 degrees", std::abs(std::abs(aim[0].pan) - 4.0) < 0.15, Num(aim[0].pan));
        // Sem distância focal: ainda dá a receita (estimativa); nada infinito
        a.focalPx = 0;
        AlignMarks::Solve({ a }, rec, aim);
        Check("without the focal length: the recipe still comes out (finite)", std::isfinite(rec[0].scale) && std::isfinite(rec[0].distance) && rec[0].scale > 0, Num(rec[0].scale));
        // Marcas fora de ordem (cliques errados): não quebra
        std::swap(a.p[0], a.p[1]);
        AlignMarks::Solve({ a }, rec, aim);
        Check("marks in the wrong order: no crash, finite numbers", std::isfinite(rec[0].scale) && std::isfinite(aim[0].height), Num(rec[0].scale));
    }

    // Achar as marcas nas fotos a partir de três cliques numa delas
    void TestFind(bool balls)
    {
        const std::string kind = balls ? "balls" : "bands";
        std::vector<Cam> cams;
        const double heights[] = { 1.0, 1.3, 0.7, 1.0, 1.5, 0.6 };
        const double dists[] = { 2.0, 2.2, 1.8, 2.5, 2.0, 1.9 };
        for (int i = 0; i < 6; ++i)
            cams.push_back(MakeCam(-50 + 20 * i, dists[i], heights[i], (i % 3 - 1) * 3.0, (i % 2 ? 2.0 : -1.5), (i % 4 - 1.5) * 1.5, 1700));
        std::vector<RgbFrame> photos;
        // Luz diferente em cada câmera (mais clara, mais escura) e uma mancha da cor da marca de cima na parede, ao lado
        const double light[] = { 1.0, 0.8, 1.12, 0.7, 0.92, 1.05 };
        for (size_t i = 0; i < cams.size(); ++i)
        {
            RgbFrame f = Render(cams[i], balls);
            double u, v, u2, v2;
            cams[i].Project(kMarks[0], u, v);
            cams[i].Project(kMarks[2], u2, v2);
            const double len = std::hypot(u2 - u, v2 - v);
            for (int y = int(v + len * 0.2); y < int(v + len * 0.28); ++y)
                for (int x = int(u + len * 0.3); x < int(u + len * 0.36); ++x)
                    if (x >= 0 && y >= 0 && x < f.width && y < f.height)
                    {
                        unsigned char* p = &f.pixels[(size_t(y) * f.width + x) * 3];
                        p[0] = 215; p[1] = 45; p[2] = 45;
                    }
            for (auto& px : f.pixels) px = (unsigned char)std::min(255.0, px * light[i]);
            photos.push_back(std::move(f));
        }
        // Cliques na primeira foto, 6 pixels fora do centro de cada marca
        AlignMarks::Pt truth[3], clicks[3];
        for (int k = 0; k < 3; ++k) { cams[0].Project(kMarks[k], truth[k].x, truth[k].y); clicks[k] = { truth[k].x + 6, truth[k].y - 5 }; }
        const double d = std::hypot(clicks[0].x - clicks[2].x, clicks[0].y - clicks[2].y);
        const bool wide = AlignMarks::IsWide(photos[0], clicks[0], d, clicks[2]);
        Check(kind + ": the mark width is recognized (" + (balls ? "wider than" : "as wide as") + " the pole)", wide == balls);
        AlignMarks::Pt marks[3];
        double snapErr = 0;
        for (int k = 0; k < 3; ++k)
        {
            marks[k] = AlignMarks::Snap(photos[0], clicks[k], d, clicks[k == 0 ? 2 : 0], wide);
            snapErr = std::max(snapErr, std::hypot(marks[k].x - truth[k].x, marks[k].y - truth[k].y));
        }
        Check(kind + ": a click a few pixels off goes to the center of the mark (within 2 px)", snapErr < 2.0, Num(snapErr));
        double worst = 0, sum = 0, minConf = 1;
        int found = 0, n = 0;
        std::vector<AlignMarks::Camera> in;
        for (size_t i = 1; i < cams.size(); ++i)
        {
            const AlignMarks::Found r = AlignMarks::Find(photos[0], marks, photos[i], wide);
            if (!r.ok) continue;
            ++found;
            minConf = std::min(minConf, r.confidence);
            for (int k = 0; k < 3; ++k)
            {
                double u, v; cams[i].Project(kMarks[k], u, v);
                const double e = std::hypot(r.p[k].x - u, r.p[k].y - v);
                worst = std::max(worst, e); sum += e; ++n;
            }
        }
        Check(kind + ": the three marks are found in every other photo", found == int(cams.size()) - 1, std::to_string(found));
        Check(kind + ": found marks within 3 px of the true center (worst)", n > 0 && worst < 3.0, Num(worst));
        Check(kind + ": found marks within 1.5 px on average", n > 0 && sum / n < 1.5, Num(n ? sum / n : -1));
        Check(kind + ": confidence is high when the marks are clear (above 0.5)", minConf > 0.5, Num(minConf));
        // Uma foto sem a haste: não pode "achar" com confiança alta
        Cam empty = cams[1];
        RgbFrame blank = Render(MakeCam(170, 2.0, 1.0, 40, 0, 0, 1700), balls);  // virada para longe da haste
        const AlignMarks::Found r = AlignMarks::Find(photos[0], marks, blank, wide);
        Check(kind + ": a photo without the pole is not found with high confidence", !r.ok || r.confidence < 0.5, Num(r.confidence));
        (void)empty;
    }
}

int main()
{
    TestSolve();
    TestFind(true);
    TestFind(false);
    std::printf("%s\n", failed ? "SOME FAILED" : "ALL PASSED");
    return failed ? 1 : 0;
}
