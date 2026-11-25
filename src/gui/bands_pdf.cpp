#include "bands_pdf.h"

#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace BandsPdf
{
    namespace
    {
        // (\267 e \233: o ponto do meio e o "›" na codificação WinAnsi do PDF)
        constexpr double kMm = 72.0 / 25.4;   // milímetros → pontos do PDF
        constexpr double kPageH = 297.0;      // A4, em mm (o PDF mede de baixo para cima)

        std::string N(double v) { char b[32]; std::snprintf(b, sizeof b, "%.2f", v); return b; }
        // Retângulo em mm, medido do canto de cima à esquerda da folha
        std::string Rect(double x, double y, double w, double h) { return N(x * kMm) + " " + N((kPageH - y - h) * kMm) + " " + N(w * kMm) + " " + N(h * kMm) + " re\n"; }
        std::string Line(double x1, double y1, double x2, double y2) { return N(x1 * kMm) + " " + N((kPageH - y1) * kMm) + " m " + N(x2 * kMm) + " " + N((kPageH - y2) * kMm) + " l S\n"; }
        std::string Text(double x, double y, double sizeMm, bool bold, const std::string& text)
        {
            std::string esc;
            for (char c : text) { if (c == '(' || c == ')' || c == '\\') esc += '\\'; esc += c; }
            return std::string("BT /") + (bold ? "F2" : "F1") + " " + N(sizeMm * kMm) + " Tf " + N(x * kMm) + " " + N((kPageH - y) * kMm) + " Td (" + esc + ") Tj ET\n";
        }
    }

    bool Write(const std::filesystem::path& file)
    {
        std::string c;
        c += "0 g\n" + Text(15, 20, 6, true, "Stillpoint \267 alignment bands");
        c += "0.2 g\n";
        c += Text(15, 29, 3.6, false, "1. Print at 100% (no \"fit to page\").  2. Cut the three orange bands.");
        c += Text(15, 35, 3.6, false, "3. Wrap each one around the pole and tape it.  4. Leave exactly one ruler of empty pole");
        c += Text(15, 41, 3.6, false, "    between a band and the next one, edge to edge (see the drawing at the bottom).");
        // As três faixas: laranja forte (o app acha as marcas pela cor), com a linha de corte tracejada
        for (double y : { 52.0, 100.0, 148.0 })
        {
            c += "1 0.416 0 rg\n" + Rect(15, y, 180, 40) + "f\n";
            c += "0 G 0.85 w [5.7 4.3] 0 d\n" + Rect(15, y, 180, 40) + "S\n";
        }
        // A régua de espaçamento: 18 cm, com um risco por centímetro (mais comprido a cada 5)
        c += Rect(15, 200, 180, 24) + "S\n[] 0 d\n";
        c += Line(15, 212, 195, 212);
        for (int i = 0; i <= 18; ++i)
            c += Line(15 + i * 10, 212, 15 + i * 10, i % 5 ? 218 : 221);
        c += "0 g\n" + Text(40, 208, 3.6, false, "Spacing ruler \267 18 cm \267 cut it out: it is the empty space between two bands");
        // O desenho: a haste com as três faixas e a régua nos dois espaços, de borda a borda (a instrução antiga falava
        // em "centro da faixa", que não tem marca nenhuma: retorno do dono, 2026-11-25)
        c += "0.45 G 1.4 w\n" + Line(27, 232, 27, 280);
        for (double y : { 234.0, 252.0, 270.0 })
            c += "1 0.416 0 rg\n" + Rect(23, y, 8, 7) + "f\n";
        c += "0 G 0.5 w\n";
        for (double y : { 241.0, 259.0 })
        {
            c += Rect(34, y, 3.5, 11) + "S\n";
            for (int i = 1; i < 4; ++i)
                c += Line(34, y + i * 2.75, 36, y + i * 2.75);
            c += Line(31.5, y, 39, y) + Line(31.5, y + 11, 39, y + 11);
        }
        c += "0.2 g\n" + Text(45, 244, 3.4, false, "The ruler fits exactly in the empty space between two bands:");
        c += Text(45, 250, 3.4, false, "one end at the edge of a band, the other end at the edge of the next.");
        c += Text(45, 260, 3.4, false, "Do it for both spaces, so the three bands are at the same distance.");
        c += "0.45 g\n" + Text(15, 285, 3, false, "Stillpoint \267 Camera settings \233 Test shot \233 Align cameras");

        std::vector<std::string> objs = {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + N(210 * kMm) + " " + N(297 * kMm) + "] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
            "<< /Length " + std::to_string(c.size()) + " >>\nstream\n" + c + "endstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        };
        std::string out = "%PDF-1.4\n";
        std::vector<size_t> at;
        for (size_t i = 0; i < objs.size(); ++i)
        {
            at.push_back(out.size());
            out += std::to_string(i + 1) + " 0 obj\n" + objs[i] + "\nendobj\n";
        }
        const size_t xref = out.size();
        out += "xref\n0 " + std::to_string(objs.size() + 1) + "\n0000000000 65535 f \n";
        for (size_t o : at) { char b[32]; std::snprintf(b, sizeof b, "%010zu 00000 n \n", o); out += b; }
        out += "trailer\n<< /Size " + std::to_string(objs.size() + 1) + " /Root 1 0 R >>\nstartxref\n" + std::to_string(xref) + "\n%%EOF\n";

        std::error_code ec;
        std::filesystem::create_directories(file.parent_path(), ec);
        std::ofstream f(file, std::ios::binary);
        f << out;
        return static_cast<bool>(f);
    }
}
