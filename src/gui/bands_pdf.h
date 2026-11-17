#pragma once

// Folha A4 com as faixas do alinhamento (etapa 21; protótipo aprovado pelo dono em 2026-11-17): três faixas laranja de
// 4 x 18 cm para recortar e enrolar na haste, e uma régua de 18 cm para deixar o mesmo espaço entre elas.
// PDF escrito à mão (retângulos, linhas e texto em Helvetica), sem biblioteca.

#include <filesystem>

namespace BandsPdf
{
    bool Write(const std::filesystem::path& file);
}
