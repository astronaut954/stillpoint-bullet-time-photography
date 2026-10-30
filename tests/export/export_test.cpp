// Teste da exportação: stillpoint_export_test <pasta da sessão> <pasta de saída> [standard|high|maximum] [altura]
// Lenticular (etapa 19): stillpoint_export_test lenticular <pasta da sessão> <saída sem extensão> <lpi> <dpi> <larg pol> <alt pol> [3d] [reverse] [marks] [bleed]
// Folha de teste: stillpoint_export_test pitch <arquivo.tiff> <centro> <passo> <dpi> <larg pol> <alt pol> [3d]
#include "exporter.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>

namespace fs = std::filesystem;

int main(int argc, char** argv)
{
    if (argc >= 8 && std::strcmp(argv[1], "pitch") == 0)
    {
        Export::PitchTestOptions o;
        o.center = std::atof(argv[3]);
        o.step = std::atof(argv[4]);
        o.dpi = std::atoi(argv[5]);
        o.widthInches = std::atof(argv[6]);
        o.heightInches = std::atof(argv[7]);
        o.horizontalLenses = !(argc > 8 && std::strcmp(argv[8], "3d") == 0);
        std::string error;
        const bool ok = Export::WritePitchTest(o, argv[2], error);
        std::printf("pitch: %s %s\n", ok ? "ok" : "FAILED", error.c_str());
        return ok ? 0 : 1;
    }
    if (argc >= 8 && std::strcmp(argv[1], "lenticular") == 0)
    {
        std::vector<fs::path> photos;
        for (const auto& e : fs::directory_iterator(argv[2]))
            if (e.is_regular_file())
                photos.push_back(e.path());
        std::sort(photos.begin(), photos.end());
        Export::LenticularOptions o;
        o.lpi = std::atof(argv[4]);
        o.dpi = std::atoi(argv[5]);
        o.widthInches = std::atof(argv[6]);
        o.heightInches = std::atof(argv[7]);
        for (int i = 8; i < argc; ++i)
        {
            if (std::strcmp(argv[i], "3d") == 0) o.horizontalLenses = false;
            if (std::strcmp(argv[i], "reverse") == 0) o.reverse = true;
            if (std::strcmp(argv[i], "marks") == 0) { o.cropMarks = true; o.alignMarks = true; }
            if (std::strcmp(argv[i], "bleed") == 0) o.bleedInches = 3 / 25.4;
        }
        const Export::LenticularInfo info = Export::LenticularPlan(o, static_cast<int>(photos.size()));
        std::printf("plan: %dx%d px (file %dx%d, bleed %d, margin %d), %.3f columns per lens, %.3f px per photo, %d lenses\n", info.width, info.height,
                    info.fileWidth, info.fileHeight, info.bleed, info.margin, info.columnsPerLens, info.pixelsPerPhoto, info.lenses);
        std::string error;
        const bool ok = Export::WriteLenticular(photos, argv[3], o,
            [](double f, const std::string& step) { std::printf("\r%-16s %3d%%", step.c_str(), static_cast<int>(f * 100)); std::fflush(stdout); },
            nullptr, error);
        std::printf("\nlenticular: %s %s\n", ok ? "ok" : "FAILED", error.c_str());
        return ok ? 0 : 1;
    }
    if (argc < 3)
    {
        std::printf("usage: stillpoint_export_test <session folder> <output folder>\n");
        return 2;
    }
    std::vector<fs::path> photos;
    for (const auto& e : fs::directory_iterator(argv[1]))
        if (e.is_regular_file())
            photos.push_back(e.path());
    std::sort(photos.begin(), photos.end());
    fs::create_directories(argv[2]);

    Export::SequenceOptions options;
    options.formats = { "mp4", "mov", "gif", "webp", "avif" };
    options.fps = 6;
    options.loops = 3;
    const Export::Quality quality = Export::ParseQuality(argc > 3 ? argv[3] : "high");
    options.quality = quality;
    if (argc > 4)
        options.height = std::atoi(argv[4]);
    std::string error;
    const bool ok = Export::WriteSequence(photos, fs::path(argv[2]) / "sequence", options,
        [](double f, const std::string& step) { std::printf("\r%-6s %3d%%", step.c_str(), static_cast<int>(f * 100)); std::fflush(stdout); },
        nullptr, error);
    std::printf("\nsequence: %s %s\n", ok ? "ok" : "FAILED", error.c_str());
    int failures = ok ? 0 : 1;
    for (const char* format : { "jpg", "png", "webp", "tiff" })
    {
        error.clear();
        const bool converted = Export::ConvertPhoto(photos[0], fs::path(argv[2]) / photos[0].stem(), format, quality, error);
        std::printf("photo %s: %s %s\n", format, converted ? "ok" : "FAILED", error.c_str());
        failures += converted ? 0 : 1;
    }
    return failures;
}
