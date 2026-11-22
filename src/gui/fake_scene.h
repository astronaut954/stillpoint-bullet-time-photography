#pragma once

// Cena de mentira com a haste de três marcas (etapa 21): serve ao teste automático do alinhamento e às câmeras
// simuladas (STILLPOINT_FAKE_PHOTOS=pole), para testar o alinhamento sem câmeras e sem fotos de verdade.
// Mundo em metros, z para cima; a haste em pé na origem, marcas em z = 1,4 (alto), 1,0 (meio) e 0,6 (baixo).

#include "photo_store.h"  // RgbFrame

namespace FakeScene
{
    struct V3 { double x, y, z; };
    V3 Sub(V3 a, V3 b);
    double Dot(V3 a, V3 b);

    struct Cam
    {
        V3 pos, right, down, fwd;
        double f; int w, h;
        bool Project(V3 P, double& u, double& v) const;
    };
    // azimute (graus), distância no chão, altura da câmera, erro de mira (graus), giro da câmera (graus), distância
    // focal em pixels, tamanho da foto
    Cam MakeCam(double az, double dist, double height, double panErr, double tiltErr, double roll, double f, int w = 1500, int h = 1000);

    extern const V3 kMarks[3];

    // A foto: fundo com textura (parede e chão), a haste cinza e as três marcas (bolas coloridas ou faixas)
    RgbFrame Render(const Cam& c, bool balls);

    // A câmera n (1, 2, ...) de um rig de mentira com count câmeras: num arco em volta da haste, cada uma numa altura,
    // distância, mira e giro um pouco diferentes (como num rig montado à mão). Distância focal = 1,2 x a largura (a
    // mesma estimativa do alinhamento quando a foto não diz a lente).
    // fixed (0 a 1): quanto a pessoa já acertou essa câmera (mira, giro e distância); 1 = só sobra a altura. Usado
    // pelo Live aim das câmeras simuladas, em que a câmera "vai sendo acertada" sozinha.
    Cam RigCamera(int n, int count, int w, int h, double fixed = 0);
}
