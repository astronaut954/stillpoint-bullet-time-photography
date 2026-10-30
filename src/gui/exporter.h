#pragma once

// Exportação das sessões: fotos convertidas (JPG, PNG, WEBP, TIFF, HEIC) e
// sequências (MP4, MOV, GIF, WEBP, AVIF). Usado pelo "Save sessions".

#include <atomic>
#include <filesystem>
#include <functional>
#include <string>
#include <vector>

namespace Export
{
    // Qualidade escolhida na janela de salvar. High é o padrão.
    //   Standard: arquivos menores. High: muito perto das fotos.
    //   Maximum: o mais perto das fotos que cada formato permite (arquivos grandes).
    // PNG e TIFF são sempre sem perda; GIF é sempre 256 cores.
    enum class Quality { Standard, High, Maximum };
    Quality ParseQuality(const std::string& text);  // "standard" | "high" | "maximum"

    // Bits por segundo do MP4/MOV (H.264) para o tamanho, a velocidade e a qualidade
    int VideoBitrate(int width, int height, int fps, Quality quality);

    struct SequenceOptions
    {
        std::vector<std::string> formats;  // "mp4", "mov", "gif", "webp", "avif"
        double fps = 6.0;                  // fotos por segundo
        int loops = 3;                     // repetições dentro do MP4/MOV
        bool reverse = true;               // vai e volta: 1, 2, 3, 2, 1...
        int height = 1080;                 // 720, 1080 ou 2160 (4K: só MP4/MOV)
        Quality quality = Quality::High;
    };

    // Ordem dos quadros de UMA volta: 0..n-1 e, com reverse, volta até 1 (sem repetir as pontas)
    std::vector<int> CycleOrder(int photos, bool reverse);

    // Andamento: fração de 0 a 1 e o que está sendo feito ("GIF", "MP4"...)
    using Progress = std::function<void(double fraction, const std::string& step)>;

    // Cria os arquivos <base>.<formato> a partir das fotos (uma por câmera, em ordem).
    // GIF, WEBP e AVIF guardam uma volta e repetem sem parar; MP4 e MOV têm as voltas
    // dentro do vídeo. Devolve false e preenche error se algo falhar.
    bool WriteSequence(const std::vector<std::filesystem::path>& photos, const std::filesystem::path& base,
                       const SequenceOptions& options, const Progress& progress,
                       const std::atomic<bool>* cancel, std::string& error);

    // Converte uma foto para "jpg", "png", "webp", "tiff" ou "heic". dest sem extensão.
    bool ConvertPhoto(const std::filesystem::path& photo, const std::filesystem::path& destWithoutExtension,
                      const std::string& format, Quality quality, std::string& error);

    // Formatos que este computador consegue gerar (HEIC no Windows depende de extensões)
    bool FormatAvailable(const std::string& format, std::string& reason);

    // ---- Impressão lenticular (etapa 19) ----
    // Uma lâmina lenticular tem `lpi` lentes cilíndricas por polegada; a impressora põe `dpi`
    // pontos por polegada. Debaixo de cada lente cabem dpi ÷ lpi colunas de pixel, preenchidas
    // em ordem com uma faixa de cada foto: ao inclinar a lâmina vê-se uma foto de cada vez.
    struct LenticularOptions
    {
        double lpi = 60;             // pitch usado no cálculo (o medido na folha de teste, se houver)
        int dpi = 720;               // resolução nativa da impressora / gráfica
        double widthInches = 5.9;    // tamanho da impressão
        double heightInches = 3.9;
        bool horizontalLenses = true;  // animação (inclinar para cima/baixo): lentes deitadas, faixas em linhas;
                                       // 3D (olhos esquerdo/direito): lentes em pé, faixas em colunas
        bool reverse = false;        // ordem das fotos dentro de cada lente ao contrário
    };
    struct LenticularInfo
    {
        int width = 0, height = 0;         // pixels da imagem final
        double columnsPerLens = 0;         // dpi ÷ lpi
        double pixelsPerPhoto = 0;         // columnsPerLens ÷ fotos
        int lenses = 0;                    // quantas lentes a imagem cobre
    };
    LenticularInfo LenticularPlan(const LenticularOptions& options, int photos);

    // Entrelaça as fotos (uma por câmera, em ordem) numa imagem TIFF sem perda em `dest` (sem
    // extensão), com o DPI gravado no arquivo para a impressão sair no tamanho exato.
    bool WriteLenticular(const std::vector<std::filesystem::path>& photos, const std::filesystem::path& destWithoutExtension,
                         const LenticularOptions& options, const Progress& progress,
                         const std::atomic<bool>* cancel, std::string& error);
}
