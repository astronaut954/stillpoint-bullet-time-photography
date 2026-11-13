// Ferramenta de estudo (etapa 21, alinhamento por objeto de referência): roda o Chart::Find do app numa foto e
// imprime as 4 marcas (0 a 1). Usada pelos scripts de docs/estudos/alinhamento; não entra no app.
#include "chart.h"

#include <cstdio>

int main(int argc, char** argv)
{
    for (int i = 1; i < argc; ++i)
    {
        const Chart::Quad q = Chart::Find(argv[i]);
        std::printf("%s %d", argv[i], q.found ? 1 : 0);
        for (int k = 0; k < 4; ++k) std::printf(" %.6f %.6f", q.x[k], q.y[k]);
        std::printf("\n");
    }
    return 0;
}
