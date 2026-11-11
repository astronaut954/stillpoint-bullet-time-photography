// Contas do exportador conferidas direto, sem a janela: o espelhamento da foto (Align photos › Flip, 2026-11-11).
//   build/host-test/ExporterMathTest   (o run_tests.py roda e mostra as linhas)
#include "exporter.h"
#include "photo_store.h"
#include "rig_state.h"
#include "camera_settings.h"

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

    // ---- O estado do rig por Project (rig_state.h, 2026-11-11) ----
    {
        using Rig::Camera; using Rig::State; using Rig::Memory; using Rig::Compare; using Rig::Keep; using Rig::Absorb;
        using Rig::MergeOrder; using Rig::OrderFor; using Rig::Save; using Rig::Load; using Rig::Read;
        auto cam = [](const std::string& serial, const std::string& name, int order, long long iso, long long tv)
        {
            Camera c; c.serial = serial; c.name = name; c.model = "Canon"; c.order = order;
            c.settings["iso"] = { iso, "ISO " + std::to_string(iso), true };
            c.settings["tv"] = { tv, "1/" + std::to_string(tv), true };
            return c;
        };
        State state; Memory memory;
        // Um Project novo: as câmeras entram como estão, sem pergunta
        std::vector<Camera> now = { cam("A", "SL3_1", 1, 400, 125), cam("B", "T7_1", 2, 400, 125), cam("C", "SL3_2", 3, 400, 125) };
        Rig::Check check = Compare(state, now, memory);
        Check("rig: a new project asks nothing", check.diffs.empty() && check.fresh.size() == 3 && check.missing.empty());
        Keep(memory, check, now);
        Check("rig: ... and takes the cameras as they are", Absorb(state, now, memory) && state.cameras.size() == 3 && state.cameras["A"].settings["iso"].value == 400);
        state.order = MergeOrder(state.order, { "A", "B", "C" });
        // Com o Project aberto, o que muda numa câmera vai para ele
        now[0].settings["iso"] = { 100, "ISO 100", true };
        Check("rig: a change on a camera goes to the project", Absorb(state, now, memory) && state.cameras["A"].settings["iso"].value == 100);
        Check("rig: ... and nothing more is written when nothing changes", !Absorb(state, now, memory));

        // O arquivo: gravar e ler dá o mesmo
        const std::filesystem::path file = std::filesystem::temp_directory_path() / "stillpoint-rig-test.json";
        state.panel = "{\"countdown\":3,\"sessions\":2,\"downloadWait\":12,\"timing\":{\"mode\":\"sweep\"}}";
        const bool saved = Save(file, state);
        const State back = Load(file);
        std::error_code ec; std::filesystem::remove(file, ec);
        Check("rig: the file keeps the panel, the order and the camera settings", saved && back.order == state.order && back.cameras.size() == 3 &&
            back.cameras.at("A").settings.at("iso").value == 100 && back.cameras.at("A").settings.at("iso").label == "ISO 100" &&
            back.cameras.at("B").order == 2 && back.panel.find("\"countdown\":3") != std::string::npos && back.panel.find("sweep") != std::string::npos, back.panel);

        // Abrir o Project de novo com as câmeras diferentes: pergunta, só do que difere
        memory.Clear();
        now = { cam("A", "SL3_1", 1, 400, 125), cam("B", "T7_1", 2, 400, 200), cam("C", "SL3_2", 3, 400, 125) };
        check = Compare(back, now, memory);
        Check("rig: opening with other settings asks, listing only what differs", check.diffs.size() == 2 && check.differing == 2 &&
            check.diffs[0].serial == "A" && check.diffs[0].key == "iso" && check.diffs[0].now.value == 400 && check.diffs[0].want.value == 100 &&
            check.diffs[1].serial == "B" && check.diffs[1].key == "tv", std::to_string(check.diffs.size()));
        State kept = back;
        Check("rig: before the answer, a reading does not change the project", !Absorb(kept, now, memory) && kept.cameras["A"].settings["iso"].value == 100);
        // Keep the cameras as they are: o Project não muda; só o que for alterado depois é gravado
        Keep(memory, check, now);
        Check("rig: Keep the cameras: the project stays as it was", !Absorb(kept, now, memory) && kept.cameras["A"].settings["iso"].value == 100 && kept.cameras["B"].settings["tv"].value == 125);
        Check("rig: ... and it does not ask again while the project is open", Compare(kept, now, memory).diffs.empty());
        now[0].settings["tv"] = { 250, "1/250", true };   // outra coisa muda na câmera A
        Check("rig: ... a later change is written, the kept difference is not", Absorb(kept, now, memory) && kept.cameras["A"].settings["tv"].value == 250 && kept.cameras["A"].settings["iso"].value == 100);
        now[0].settings["iso"] = { 800, "ISO 800", true }; // e agora a própria diferença que ficou é mexida
        Check("rig: ... and a kept setting changed afterwards is written too", Absorb(kept, now, memory) && kept.cameras["A"].settings["iso"].value == 800);
        memory.Clear();
        Check("rig: next time the project opens, what still differs is asked again", Compare(kept, now, memory).diffs.size() == 1 && Compare(kept, now, memory).diffs[0].serial == "B");

        // Câmera faltando e câmera nova: avisa; a nova fica como está
        memory.Clear();
        now = { cam("A", "SL3_1", 1, 100, 125), cam("C", "SL3_2", 2, 400, 125), cam("X", "T7_9", 3, 800, 250) };
        check = Compare(back, now, memory);
        Check("rig: a camera of the project not connected and a new one are reported, nothing to ask", check.diffs.empty() && check.missing.size() == 1 &&
            check.missing[0].serial == "B" && check.missing[0].order == 2 && check.fresh.size() == 1 && check.fresh[0].serial == "X");
        State known = back;
        Keep(memory, check, now);
        Check("rig: a reading outside the check does not take a new camera in (the check is what reports it)", !Absorb(known, now, memory, false) && !known.cameras.count("X"));
        Check("rig: ... the check does", Absorb(known, now, memory) && known.cameras.count("X") && known.cameras["X"].settings["iso"].value == 800);
        // Um ajuste que a câmera não deixa mudar agora não é perguntado
        memory.Clear();
        now = { cam("A", "SL3_1", 1, 400, 125) }; now[0].settings["iso"].settable = false;
        Check("rig: a setting the camera does not let change now is not asked", Compare(back, now, memory).diffs.empty());

        // Ordem (decisão do dono: sem buraco, as novas no fim, a que falta volta ao lugar dela)
        State ordered; ordered.order = { "A", "B", "C", "D" };
        Check("rig order: known cameras in the saved order, new ones at the end", OrderFor(ordered, { "X", "D", "A", "C" }) == std::vector<std::string>({ "A", "C", "D", "X" }));
        Check("rig order: saving keeps the missing camera in its place", MergeOrder(ordered.order, { "A", "C", "D", "X" }) == std::vector<std::string>({ "A", "B", "C", "D", "X" }));
        Check("rig order: ... also when the person reorders", MergeOrder(ordered.order, { "D", "X", "A", "C" }) == std::vector<std::string>({ "D", "X", "A", "B", "C" }));
        Check("rig order: ... and when the first one is the missing one", MergeOrder(ordered.order, { "C", "B", "D" }) == std::vector<std::string>({ "A", "C", "B", "D" }));
        ordered.order = MergeOrder(ordered.order, { "A", "C", "D", "X" });
        Check("rig order: the missing camera goes back to its place when it is connected", OrderFor(ordered, { "A", "C", "D", "X", "B" }) == std::vector<std::string>({ "A", "B", "C", "D", "X" }));

        // A leitura de uma câmera (CameraSettings → o formato do rig)
        CameraSettings s; s.camera = "SL3_1"; s.model = "Canon EOS Rebel SL3"; s.adjustable = true;
        CameraSetting iso; iso.key = "iso"; iso.available = true; iso.value = 400; iso.label = "ISO 400"; iso.choices = { { 100, "ISO 100" }, { 400, "ISO 400" } };
        CameraSetting wb; wb.key = "wb"; wb.available = true; wb.value = 9; wb.label = "Color temp."; wb.choices = { { 0, "Auto" }, { 9, "Color temp." } };
        CameraSetting drive; drive.key = "drive"; drive.available = true; drive.value = 0;
        CameraSetting tv; tv.key = "tv"; tv.available = true; tv.value = 125; tv.label = "1/125";  // sem escolhas: a câmera não deixa mudar agora
        s.settings = { iso, wb, drive, tv }; s.kelvinAvailable = true; s.kelvin = 5200; s.shiftAvailable = true; s.shiftAB = 3; s.shiftGM = -2;
        const Camera read = Read(s, "SER1", 4);
        Check("rig reading: the settings of the Camera settings window, without drive", read.serial == "SER1" && read.order == 4 && read.settings.count("iso") && !read.settings.count("drive") &&
            read.settings.at("iso").settable && !read.settings.at("tv").settable);
        Check("rig reading: color temperature only with the white balance in Kelvin; fine-tune as signed numbers", read.settings.count("kelvin") && read.settings.at("kelvin").label == "5200 K" &&
            read.settings.at("shiftab").label == "+3" && read.settings.at("shiftgm").label == "-2");
    }
    std::printf("%d failed\n", failed);
    return failed ? 1 : 0;
}
