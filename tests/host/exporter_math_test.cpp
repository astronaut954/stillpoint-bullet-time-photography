// Contas do exportador conferidas direto, sem a janela: o espelhamento da foto (Align photos › Flip, 2026-11-11).
//   build/host-test/ExporterMathTest   (o run_tests.py roda e mostra as linhas)
#include "exporter.h"
#include "photo_store.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace
{
    int failed = 0;
    void Check(const std::string& name, bool ok, const std::string& details = "")
    {
        std::printf("%s  %s%s\n", ok ? "PASS" : "FAIL", name.c_str(), ok || details.empty() ? "" : ("   [" + details + "]").c_str());
        if (!ok) ++failed;
    }
    // Uma foto em que cada ponto tem uma cor só dele (suave, para a amostragem entre pontos não atrapalhar)
    RgbFrame Photo(int w, int h)
    {
        RgbFrame f; f.width = w; f.height = h; f.pixels.resize(static_cast<size_t>(w) * h * 3);
        for (int y = 0; y < h; ++y)
            for (int x = 0; x < w; ++x)
            {
                unsigned char* p = &f.pixels[(static_cast<size_t>(y) * w + x) * 3];
                p[0] = static_cast<unsigned char>(40 + 200 * x / (w - 1));
                p[1] = static_cast<unsigned char>(40 + 200 * y / (h - 1));
                p[2] = static_cast<unsigned char>((x * 7 + y * 13) % 200 + 20);
            }
        return f;
    }
    RgbFrame Flip(const RgbFrame& f, bool h, bool v)
    {
        RgbFrame o = f;
        for (int y = 0; y < f.height; ++y)
            for (int x = 0; x < f.width; ++x)
                for (int c = 0; c < 3; ++c)
                    o.pixels[(static_cast<size_t>(y) * f.width + x) * 3 + c] =
                        f.pixels[(static_cast<size_t>(v ? f.height - 1 - y : y) * f.width + (h ? f.width - 1 - x : x)) * 3 + c];
        return o;
    }
    int MaxDiff(const RgbFrame& a, const RgbFrame& b)
    {
        if (a.width != b.width || a.height != b.height) return 999;
        int m = 0;
        for (size_t i = 0; i < a.pixels.size(); ++i) m = std::max(m, std::abs(static_cast<int>(a.pixels[i]) - static_cast<int>(b.pixels[i])));
        return m;
    }
    Export::Framing One(const Export::Align& a, int w, int h, const std::string& ratio = "")
    {
        Export::Framing f; f.ratio = ratio; f.align.push_back(a);
        Export::ComputeCommonFrame(f, { { w, h } });
        return f;
    }
}

int main()
{
    const int W = 240, H = 160;
    const RgbFrame photo = Photo(W, H);
    const char* names[4] = { "", "left to right", "top to bottom", "both ways" };

    // 1. O texto guardado
    {
        const auto m = Export::ParseAlign("a.jpg:0.00,0.00,1.00000,0.000,1.00000,1;b.jpg:3.00,-2.00,1.10000,4.000,1.10000,2;c.jpg:3.00,-2.00,1.10000,4.000,1.10000;d.jpg:0,0,1,0,1,3");
        Check("text: a photo only flipped is read as flipped and not moved", m.count("a.jpg") && m.at("a.jpg").flipH && !m.at("a.jpg").flipV && !m.at("a.jpg").touched);
        Check("text: moved and flipped top to bottom", m.count("b.jpg") && m.at("b.jpg").flipV && !m.at("b.jpg").flipH && m.at("b.jpg").touched);
        Check("text: the old form (no flip) still reads, not flipped", m.count("c.jpg") && !m.at("c.jpg").Flipped() && m.at("c.jpg").touched);
        Check("text: both ways", m.count("d.jpg") && m.at("d.jpg").flipH && m.at("d.jpg").flipV);
        Export::Framing f; f.align.push_back(m.at("a.jpg"));
        Check("a session with only a flip counts as aligned (so the export applies it)", f.Aligned());
    }

    for (int flip = 1; flip <= 3; ++flip)
    {
        const bool h = (flip & 1) != 0, v = (flip & 2) != 0;
        const std::string n = names[flip];

        // 2. Só espelhada: sai a foto espelhada, ponto por ponto
        {
            Export::Align a; a.flipH = h; a.flipV = v; a.touched = false;
            Export::Framing f = One(a, W, H);
            RgbFrame out = photo;
            Export::ApplyAlign(out, f, 0);
            Check("flipped " + n + " only: the export is the photo mirrored, pixel for pixel", MaxDiff(out, Flip(photo, h, v)) == 0, std::to_string(MaxDiff(out, Flip(photo, h, v))));
        }
        // 3. Espelhada + movida, redimensionada e girada = a mesma conta numa foto que já chegou espelhada
        {
            Export::Align a; a.dx = 6; a.dy = -4; a.scale = 1.6; a.base = 1.6; a.rot = 7; a.touched = true; a.flipH = h; a.flipV = v;
            Export::Framing f = One(a, W, H, "1:1");
            RgbFrame out = photo;
            Export::ApplyAlign(out, f, 0);
            Export::Framing g = f; g.align[0].flipH = false; g.align[0].flipV = false;
            RgbFrame expected = Flip(photo, h, v);
            Export::ApplyAlign(expected, g, 0);
            Check("flipped " + n + " and moved, resized, rotated: same as aligning a photo mirrored beforehand", MaxDiff(out, expected) <= 1, std::to_string(MaxDiff(out, expected)));

            // 4. Lightroom (decisão do dono: a foto vai sem espelhar e o Stillpoint espelha na volta)
            Export::CropBox box;
            const bool gotBox = Export::CanvasCrop(f, 0, W, H, box);
            // O que o Lightroom devolve: o recorte "box" da foto SEM espelhar (aqui feito pela mesma conta, com o
            // alinhamento que esse recorte representa)
            Export::Align back;
            const bool gotBack = gotBox && Export::AlignFromCrop(f, W, H, box.left, box.top, box.right, box.bottom, box.angle, back, h, v);
            Check("flipped " + n + ": the crop sent to Lightroom comes back as the same alignment, still flipped",
                gotBack && std::abs(back.dx - f.align[0].dx) < 0.01 && std::abs(back.dy - f.align[0].dy) < 0.01 &&
                std::abs(back.scale - f.align[0].scale) < 1e-4 && std::abs(back.rot - f.align[0].rot) < 1e-6 && back.flipH == h && back.flipV == v,
                gotBack ? std::to_string(back.dx) + "," + std::to_string(back.dy) + "," + std::to_string(back.scale) + "," + std::to_string(back.rot) : "no crop");
            Export::Framing lr = f; lr.align[0] = Export::Mirrored(f.align[0], h, v); lr.align[0].flipH = false; lr.align[0].flipV = false;
            RgbFrame edited = photo;  // a "editada": a foto sem espelhar, cortada no recorte que foi para o Lightroom
            Export::ApplyAlign(edited, lr, 0);
            Export::Framing framed = f; framed.align[0].framed = true;
            Export::ApplyAlign(edited, framed, 0);  // de volta ao Stillpoint: já enquadrada, só falta espelhar
            Check("flipped " + n + ": the photo edited in Lightroom (not mirrored there) ends as the Stillpoint export", MaxDiff(edited, out) <= 1, std::to_string(MaxDiff(edited, out)));
        }
    }
    std::printf("%d failed\n", failed);
    return failed ? 1 : 0;
}
