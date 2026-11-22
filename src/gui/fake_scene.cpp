#include "fake_scene.h"

#include <algorithm>
#include <vector>
#include <cmath>

namespace FakeScene
{
    constexpr double kPi = 3.14159265358979323846;

    V3 Sub(V3 a, V3 b) { return { a.x - b.x, a.y - b.y, a.z - b.z }; }
    double Dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    namespace { V3 Cross(V3 a, V3 b) { return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; }
    V3 Norm(V3 a) { const double n = std::sqrt(Dot(a, a)); return { a.x / n, a.y / n, a.z / n }; } }

    bool Cam::Project(V3 P, double& u, double& v) const
    {
        const V3 d = Sub(P, pos);
        const double z = Dot(d, fwd);
        if (z <= 0.01) return false;
        u = w / 2.0 + f * Dot(d, right) / z;
        v = h / 2.0 + f * Dot(d, down) / z;
        return true;
    }

    // azimute (graus), distância no chão, altura da câmera, erro de mira (graus), giro da câmera (graus)
    Cam MakeCam(double az, double dist, double height, double panErr, double tiltErr, double roll, double f, int w, int h)
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

    Cam RigCamera(int n, int count, int w, int h, double fixed)
    {
        count = std::max(1, count);
        n = std::clamp(n, 1, count);
        const int i = n - 1;
        // espaçamento de 15 graus, até um arco de 150 graus
        const double step = count > 1 ? std::min(15.0, 150.0 / (count - 1)) : 0;
        const double az = (i - (count - 1) / 2.0) * step;
        static const double kHeight[] = { 0.0, 0.25, -0.2, 0.1, -0.3, 0.35, -0.1, 0.2, -0.25 };
        static const double kDist[] = { 0.0, 0.2, -0.15, 0.3, -0.1, 0.1, -0.25, 0.15, 0.05 };
        const double height = 1.0 + kHeight[i % 9];
        const double left = 1.0 - std::clamp(fixed, 0.0, 1.0);
        // Acertada, a câmera vai para a distância do meio do rig (a mediana, a mesma que o alinhamento usa para comparar)
        std::vector<double> all;
        for (int k = 0; k < count; ++k) all.push_back(kDist[k % 9]);
        std::sort(all.begin(), all.end());
        const double mid = all[all.size() / 2];
        const double dist = 2.2 + mid + (kDist[i % 9] - mid) * left;
        const double pan = ((i * 7) % 5 - 2) * 1.2 * left, tilt = ((i * 3) % 5 - 2) * 0.9 * left, roll = ((i * 4) % 5 - 2) * 0.8 * left;
        return MakeCam(az, dist, height, pan, tilt, roll, 1.2 * w, w, h);
    }
}
