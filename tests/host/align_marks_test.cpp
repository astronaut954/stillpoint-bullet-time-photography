// Alinhamento com a haste de três marcas (etapa 21), conferido direto, sem a janela.
//   build/host-test/AlignMarksTest   (o run_tests.py roda e mostra as linhas)
// Cenas de mentira: uma haste em pé com três marcas de espaçamento igual, vista por câmeras num arco, em alturas,
// distâncias, miras e inclinações diferentes, com luz diferente em cada uma e uma mancha da cor de uma marca ao lado. Como a cena é inventada, a resposta certa é conhecida.
#include "align_marks.h"
#include "fake_scene.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace
{
    int failed = 0;
    void Check(const std::string& name, bool ok, const std::string& details = "")
    {
        std::printf("%s  %s%s\n", ok ? "PASS" : "FAIL", name.c_str(), details.empty() ? "" : ("   [" + details + "]").c_str());
        if (!ok) ++failed;
    }
    std::string Num(double v) { char b[64]; std::snprintf(b, sizeof b, "%.3f", v); return b; }

    using namespace FakeScene;

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
        // Cliques na primeira foto, fora do centro de cada marca (até 15 px para os lados, como um clique apressado)
        AlignMarks::Pt truth[3], clicks[3];
        const double offs[3][2] = { { 6, -5 }, { -15, 8 }, { 12, 10 } };
        for (int k = 0; k < 3; ++k) { cams[0].Project(kMarks[k], truth[k].x, truth[k].y); clicks[k] = { truth[k].x + offs[k][0], truth[k].y + offs[k][1] }; }
        AlignMarks::Pt marks[3];
        bool wide = false;
        AlignMarks::SnapClicks(photos[0], clicks, marks, wide);
        Check(kind + ": the mark width is recognized (" + (balls ? "wider than" : "as wide as") + " the pole)", wide == balls);
        double snapErr = 0;
        for (int k = 0; k < 3; ++k) snapErr = std::max(snapErr, std::hypot(marks[k].x - truth[k].x, marks[k].y - truth[k].y));
        Check(kind + ": a click up to 15 px off goes to the center of the mark (within 2 px)", snapErr < 2.0, Num(snapErr));
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

    // O rig de mentira das câmeras simuladas (STILLPOINT_FAKE_PHOTOS=pole): 9 câmeras, todas acham as marcas
    void TestRig()
    {
        const int n = 9, w = 1800, h = 1200;
        std::vector<Cam> cams;
        std::vector<RgbFrame> photos;
        for (int i = 1; i <= n; ++i) { cams.push_back(RigCamera(i, n, w, h)); photos.push_back(Render(cams.back(), true)); }
        int inside = 0;
        for (const auto& c : cams)
        {
            bool ok = true;
            for (int k = 0; k < 3; ++k) { double u, v; ok = ok && c.Project(kMarks[k], u, v) && u > 50 && v > 50 && u < w - 50 && v < h - 50; }
            inside += ok;
        }
        Check("fake rig: the three marks are inside the photo of each of the 9 cameras", inside == n, std::to_string(inside));
        AlignMarks::Pt marks[3];
        for (int k = 0; k < 3; ++k) cams[0].Project(kMarks[k], marks[k].x, marks[k].y);
        double worst = 0;
        int found = 0;
        for (int i = 1; i < n; ++i)
        {
            const auto r = AlignMarks::Find(photos[0], marks, photos[i], true);
            if (!r.ok) continue;
            ++found;
            for (int k = 0; k < 3; ++k) { double u, v; cams[i].Project(kMarks[k], u, v); worst = std::max(worst, std::hypot(r.p[k].x - u, r.p[k].y - v)); }
        }
        Check("fake rig: the marks of camera 1 are found in the other 8 (within 3 px)", found == n - 1 && worst < 3, std::to_string(found) + " found, worst " + Num(worst));
    }
}

int main()
{
    TestRig();
    TestSolve();
    TestFind(true);
    TestFind(false);
    std::printf("%s\n", failed ? "SOME FAILED" : "ALL PASSED");
    return failed ? 1 : 0;
}
