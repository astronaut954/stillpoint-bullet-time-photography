#pragma once

// Alinhamento das câmeras com a haste de três marcas (etapa 21; decisões do dono em 2026-11-13 e 2026-11-14).
// A pessoa clica nas três marcas (alto, meio, baixo) numa foto; o app leva cada clique ao centro da marca, procura as
// mesmas marcas nas outras fotos e, com as três marcas de cada câmera, calcula:
//   - a receita do alinhamento digital (mover, girar e tamanho de cada foto);
//   - o que mexer em cada câmera (alinhamento físico: mira, nível, distância ou zoom, altura).
// Estudo e medições: docs/estudos/alinhamento (scripts em Python com a mesma conta).

#include "photo_store.h"  // RgbFrame

#include <vector>

namespace AlignMarks
{
    struct Pt
    {
        double x = 0, y = 0;  // pixels da foto
    };

    // A marca é mais larga que a haste (uma bola)? Medido na foto clicada, pelo pedaço de cor sob o clique.
    // d: distância, em pixels, entre a marca de cima e a de baixo (dá a escala).
    bool IsWide(const RgbFrame& img, Pt p, double d, Pt other);

    // Leva o ponto ao centro da marca: a cor que é comum sob o ponto e rara em volta. other: outra marca da haste
    // (para uma mancha da mesma cor ao lado não puxar); wide: a marca é mais larga que a haste.
    Pt Snap(const RgbFrame& img, Pt p, double d, Pt other, bool wide);

    // Os três cliques da pessoa (alto, meio, baixo) levados ao centro das marcas. Decide também se as marcas são mais
    // largas que a haste (devolve em wide), medindo já no centro (medir no clique, fora do centro, errava).
    void SnapClicks(const RgbFrame& img, const Pt clicks[3], Pt marks[3], bool& wide);

    struct Found
    {
        bool ok = false;
        Pt p[3];                // alto, meio, baixo
        double confidence = 0;  // 0 a 1; abaixo de ~0.5, pedir que a pessoa confira
    };

    // Procura em img as três marcas que estão em ref nos pontos marks (já levados ao centro).
    Found Find(const RgbFrame& ref, const Pt marks[3], const RgbFrame& img, bool wide);
    // As marcas de cima e de baixo têm cor própria na foto de referência? Sem isso a procura nas outras fotos cai no
    // modo lento (a foto inteira) e pode falhar: é o caso de cliques fora das marcas (e de marcas brancas ou cinza).
    bool Distinct(const RgbFrame& ref, const Pt marks[3]);

    // Uma câmera para a conta: as três marcas na foto, o tamanho da foto e a distância focal em pixels
    // (da distância focal em mm e do tamanho do sensor; sem isso, uma estimativa).
    struct Camera
    {
        Pt p[3];
        int width = 0, height = 0;
        double focalPx = 0;
    };

    // O alinhamento digital de uma foto: levar a marca do meio ao centro (dx, dy em pixels da foto), girar (graus,
    // positivo = sentido horário na tela) e mudar o tamanho (1 = igual), para a haste ficar no mesmo lugar, em pé e do
    // mesmo tamanho em todas. O tamanho vem da distância verdadeira de cada câmera (três marcas), sem o encurtamento de
    // quem olha de cima ou de baixo.
    struct Recipe
    {
        double dx = 0, dy = 0, rot = 0, scale = 1;
        double distance = 0;  // distância até a marca do meio, em "espaços entre marcas"
    };

    // O que mexer em cada câmera (alinhamento físico). Só informa.
    struct Aim
    {
        double pan = 0;      // graus para virar (positivo = para a direita)
        double tilt = 0;     // graus para inclinar (positivo = para cima)
        double roll = 0;     // graus de inclinação lateral da foto (positivo = haste tombada para a direita)
        double sizePct = 0;  // quanto maior (positivo) ou menor esta câmera vê a haste, comparada às outras, em %
        double height = 0;   // altura da câmera em relação à mediana das outras, em "espaços entre marcas"
    };

    // Calcula a receita e as instruções de todas as câmeras juntas (o tamanho e a altura são relativos às outras).
    // As três marcas estão a distâncias iguais em todas as câmeras (a do meio a menos de 6% do meio)? Se não, Solve
    // tira o tamanho do comprimento aparente da haste e não estima a altura.
    bool EvenlySpaced(const std::vector<Camera>& cams);
    void Solve(const std::vector<Camera>& cams, std::vector<Recipe>& recipes, std::vector<Aim>& aims);
}
