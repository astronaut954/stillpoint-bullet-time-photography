#ifdef _WIN32
#define NOMINMAX  // o LibRaw inclui windows.h, que define min/max
// A biblioteca stb usa sprintf; com /sdl, o aviso do Visual Studio vira erro
#define _CRT_SECURE_NO_WARNINGS
#endif

#include "photo_store.h"
#include "json_lite.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cctype>
#include <fstream>
#include <iterator>
#include <map>
#include <memory>
#include <regex>
#include <sstream>
#include <system_error>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_JPEG
#define STBI_SUPPORT_ZLIB  // o descompactador zlib do stb, para os TIFF com compressão ZIP do Lightroom
#include "stb_image.h"
#define STB_IMAGE_RESIZE_IMPLEMENTATION
#include "stb_image_resize2.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#include "libraw/libraw.h"

namespace fs = std::filesystem;

namespace
{
    const char* const kPreviewFolder = ".previews";
    const char* const kSavedMark = ".saved";  // sessão salva e mantida no app
    const char* const kTrashFolder = ".trash";   // lixeira do app (na pasta de dados)
    const char* const kProjectTrash = ".stillpoint-trash";  // lixeira do Project (na pasta do Project)
    const char* const kTrashOrigin = ".from";    // (2.14 e antes) dentro da lixeira: de que pasta a sessão veio
    const char* const kTrashInfo = ".trashinfo"; // dentro de cada item: sessão, inteira ou não, origem, quando

    long long NowSeconds()
    {
        return std::chrono::duration_cast<std::chrono::seconds>(std::chrono::system_clock::now().time_since_epoch()).count();
    }
    // .trashinfo: linhas "chave=valor"
    std::map<std::string, std::string> ReadTrashInfo(const fs::path& entry)
    {
        std::map<std::string, std::string> info;
        std::ifstream in(entry / kTrashInfo, std::ios::binary);
        std::string line;
        while (std::getline(in, line))
        {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            const auto eq = line.find('=');
            if (eq != std::string::npos)
                info[line.substr(0, eq)] = line.substr(eq + 1);
        }
        return info;
    }
    void WriteTrashInfo(const fs::path& entry, const std::string& session, bool wholeSession,
                        const fs::path& origin, long long deletedAt)
    {
        std::ofstream out(entry / kTrashInfo, std::ios::binary | std::ios::trunc);
        out << "session=" << session << "\n" << "kind=" << (wholeSession ? "session" : "photos") << "\n"
            << "origin=" << origin.string() << "\n" << "deleted=" << deletedAt << "\n"
            // ordem exata (o Desfazer pega o item mais recente, mesmo com dois no mesmo segundo)
            << "order=" << std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::system_clock::now().time_since_epoch()).count() << "\n";
    }
    // Editadas na lixeira (etapa 20): ficam na subpasta ".edited" do item (de uma foto apagada, junto dela; do
    // Delete edits, num item só delas, kind=edits) e voltam para <Project>/Edited/<sessão>/ ao restaurar
    const char* const kTrashEdited = ".edited";
    void MarkTrashKind(const fs::path& entry, const std::string& kind)
    {
        std::ofstream out(entry / kTrashInfo, std::ios::binary | std::ios::app);
        out << "kind=" << kind << "\n";
    }
    int CountTrashEdits(const fs::path& entry)
    {
        int n = 0;
        std::error_code ec;
        for (const auto& f : fs::directory_iterator(entry / kTrashEdited, ec))
            if (f.is_regular_file(ec)) ++n;
        return n;
    }
    // Fotos num item (o RAW e o JPG da mesma câmera contam como uma)
    int CountTrashPhotos(const fs::path& entry)
    {
        static const std::regex photoName(R"(^(\d+_[^_]+_\d+)_.+$)");
        std::vector<std::string> groups;
        std::error_code ec;
        for (const auto& f : fs::directory_iterator(entry, ec))
        {
            const std::string name = f.path().filename().string();
            if (!f.is_regular_file(ec) || name.rfind('.', 0) == 0 || name == "session.json")
                continue;
            std::smatch m;
            const std::string g = std::regex_match(name, m, photoName) ? m[1].str() : name;
            if (std::find(groups.begin(), groups.end(), g) == groups.end())
                groups.push_back(g);
        }
        return static_cast<int>(groups.size());
    }
    unsigned long long FolderBytes(const fs::path& dir)
    {
        unsigned long long total = 0;
        std::error_code ec;
        for (auto it = fs::recursive_directory_iterator(dir, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec))
            if (it->is_regular_file(ec))
            {
                const auto size = it->file_size(ec);
                if (!ec) total += size;
                ec.clear();
            }
        return total;
    }

    std::string ReadFile(const fs::path& path)
    {
        std::ifstream file(path, std::ios::binary);
        std::ostringstream content;
        content << file.rdbuf();
        return content.str();
    }
    std::string ReadTextFile(const fs::path& path) { return ReadFile(path); }
    void WriteTextFile(const fs::path& path, const std::string& text)
    {
        std::ofstream out(path, std::ios::binary | std::ios::trunc);
        out << text;
    }
    // Move um arquivo; entre discos diferentes copia e apaga
    void MoveFile(const fs::path& from, const fs::path& to, std::error_code& ec)
    {
        ec.clear();
        fs::rename(from, to, ec);
        if (!ec)
            return;
        ec.clear();
        fs::copy_file(from, to, fs::copy_options::overwrite_existing, ec);
        if (!ec)
            fs::remove(from, ec);
    }

    // Orientação EXIF (1 = normal, 3 = 180°, 6 = 90° horário, 8 = 90° anti-horário)
    int ReadExifOrientation(const std::string& jpeg)
    {
        size_t pos = 2;
        while (pos + 4 < jpeg.size() && static_cast<unsigned char>(jpeg[pos]) == 0xFF)
        {
            const unsigned char marker = static_cast<unsigned char>(jpeg[pos + 1]);
            const size_t length = (static_cast<unsigned char>(jpeg[pos + 2]) << 8) | static_cast<unsigned char>(jpeg[pos + 3]);
            if (marker == 0xE1 && jpeg.compare(pos + 4, 6, std::string("Exif\0\0", 6)) == 0)
            {
                const size_t tiff = pos + 10;
                if (tiff + 8 > jpeg.size())
                    return 1;
                const bool little = jpeg[tiff] == 'I';
                auto u16 = [&](size_t at) -> unsigned
                {
                    const unsigned a = static_cast<unsigned char>(jpeg[at]), b = static_cast<unsigned char>(jpeg[at + 1]);
                    return little ? (a | (b << 8)) : ((a << 8) | b);
                };
                auto u32 = [&](size_t at) -> unsigned
                {
                    return little ? (u16(at) | (u16(at + 2) << 16)) : ((u16(at) << 16) | u16(at + 2));
                };
                const size_t ifd = tiff + u32(tiff + 4);
                if (ifd + 2 > jpeg.size())
                    return 1;
                const unsigned entries = u16(ifd);
                for (unsigned i = 0; i < entries; ++i)
                {
                    const size_t entry = ifd + 2 + i * 12;
                    if (entry + 12 > jpeg.size())
                        break;
                    if (u16(entry) == 0x0112)
                        return static_cast<int>(u16(entry + 8));
                }
                return 1;
            }
            if (marker == 0xDA)
                break;
            pos += 2 + length;
        }
        return 1;
    }

    std::string Extension(const std::string& file)
    {
        std::string ext = fs::path(file).extension().string();
        std::transform(ext.begin(), ext.end(), ext.begin(), [](unsigned char c) { return std::tolower(c); });
        return ext;
    }

    bool IsJpeg(const std::string& file)
    {
        const std::string ext = Extension(file);
        return ext == ".jpg" || ext == ".jpeg";
    }

    // Formatos RAW mais comuns (o LibRaw lê centenas de modelos desses formatos)
    bool IsRaw(const std::string& file)
    {
        static const char* const kRaw[] = {
            ".cr3", ".cr2", ".crw",          // Canon
            ".nef", ".nrw",                  // Nikon
            ".arw", ".srf", ".sr2",          // Sony
            ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw", ".x3f", ".3fr",
            ".fff", ".iiq", ".mef", ".mos", ".mrw", ".erf", ".kdc", ".dcr", ".rwl",
        };
        const std::string ext = Extension(file);
        return std::any_of(std::begin(kRaw), std::end(kRaw), [&](const char* e) { return ext == e; });
    }

    // Converte o "flip" do LibRaw para a orientação EXIF usada em Rotate()
    int OrientationFromLibRawFlip(int flip)
    {
        switch (flip)
        {
        case 3: return 3;  // 180°
        case 5: return 8;  // 90° anti-horário
        case 6: return 6;  // 90° horário
        default: return 1;
        }
    }

    // Imagem RGB (3 bytes por pixel) pronta para reduzir
    struct RgbImage
    {
        std::vector<unsigned char> pixels;
        int width = 0;
        int height = 0;
        int orientation = 1;
    };

    bool DecodeJpeg(const std::string& jpeg, RgbImage& out)
    {
        int w = 0, h = 0, channels = 0;
        unsigned char* pixels = stbi_load_from_memory(
            reinterpret_cast<const stbi_uc*>(jpeg.data()), static_cast<int>(jpeg.size()), &w, &h, &channels, 3);
        if (!pixels)
            return false;
        out.pixels.assign(pixels, pixels + static_cast<size_t>(w) * h * 3);
        out.width = w;
        out.height = h;
        stbi_image_free(pixels);
        return true;
    }

    bool IsTiff(const std::string& file)
    {
        const std::string ext = Extension(file);
        return ext == ".tif" || ext == ".tiff";
    }

    // ---- TIFF (etapa 20, pedaço 2): as editadas que o Lightroom Classic manda (Export to Stillpoint) ----
    // RGB de 8 ou 16 bits, em tiras, sem compressão, LZW ou ZIP (com ou sem "predictor"). Adobe RGB (perfil ICC
    // embutido) vira sRGB, que é o que o resto do app usa. Tiles, CMYK, cinza e camadas: não lê (devolve false).
    struct TiffReader
    {
        const std::string& d;
        bool little = true;
        explicit TiffReader(const std::string& data) : d(data) {}
        bool ok(size_t at, size_t n) const { return at <= d.size() && n <= d.size() - at; }
        unsigned u16(size_t at) const
        {
            const auto b = reinterpret_cast<const unsigned char*>(d.data()) + at;
            return little ? (b[0] | (b[1] << 8)) : ((b[0] << 8) | b[1]);
        }
        unsigned long u32(size_t at) const
        {
            const auto b = reinterpret_cast<const unsigned char*>(d.data()) + at;
            return little ? (b[0] | (b[1] << 8) | (b[2] << 16) | (static_cast<unsigned long>(b[3]) << 24))
                          : ((static_cast<unsigned long>(b[0]) << 24) | (b[1] << 16) | (b[2] << 8) | b[3]);
        }
    };

    bool LzwDecode(const unsigned char* in, size_t n, std::vector<unsigned char>& out, size_t expected)
    {
        std::vector<std::vector<unsigned char>> table;
        auto reset = [&] { table.clear(); for (int i = 0; i < 256; ++i) table.push_back({ static_cast<unsigned char>(i) }); table.push_back({}); table.push_back({}); };
        reset();
        size_t bit = 0;
        int width = 9;
        int prev = -1;
        auto next = [&]() -> int
        {
            if ((bit + width) > n * 8) return 257;
            int code = 0;
            for (int i = 0; i < width; ++i, ++bit)
                code = (code << 1) | ((in[bit >> 3] >> (7 - (bit & 7))) & 1);
            return code;
        };
        while (out.size() < expected)
        {
            const int code = next();
            if (code == 257) break;
            if (code == 256) { reset(); width = 9; prev = -1; continue; }
            std::vector<unsigned char> entry;
            if (code < static_cast<int>(table.size())) entry = table[code];
            else if (prev >= 0 && code == static_cast<int>(table.size())) { entry = table[prev]; entry.push_back(table[prev][0]); }
            else return false;
            out.insert(out.end(), entry.begin(), entry.end());
            if (prev >= 0)
            {
                std::vector<unsigned char> add = table[prev];
                add.push_back(entry[0]);
                table.push_back(std::move(add));
            }
            prev = code;
            // TIFF troca de largura um código antes (o "early change")
            if (table.size() + 1 >= (1u << width) && width < 12) ++width;
        }
        return true;
    }

    bool DecodeTiff(const std::string& data, RgbImage& out)
    {
        TiffReader r(data);
        if (data.size() < 8) return false;
        if (data[0] == 'I' && data[1] == 'I') r.little = true;
        else if (data[0] == 'M' && data[1] == 'M') r.little = false;
        else return false;
        if (r.u16(2) != 42) return false;
        const size_t ifd = r.u32(4);
        if (!r.ok(ifd, 2)) return false;
        const unsigned count = r.u16(ifd);
        if (!r.ok(ifd + 2, static_cast<size_t>(count) * 12)) return false;
        unsigned long width = 0, height = 0, bits = 8, compression = 1, photometric = 2, samples = 3, rowsPerStrip = 0, planar = 1, predictor = 1;
        std::vector<unsigned long> offsets, counts;
        size_t iccAt = 0, iccLen = 0;
        int orientation = 1;
        auto values = [&](size_t entry, std::vector<unsigned long>& list)
        {
            const unsigned type = r.u16(entry + 2);
            const unsigned long n = r.u32(entry + 4);
            const size_t size = type == 3 ? 2 : 4;
            if (n > 1000000) return;
            size_t at = n * size <= 4 ? entry + 8 : r.u32(entry + 8);
            if (!r.ok(at, n * size)) return;
            for (unsigned long i = 0; i < n; ++i)
                list.push_back(type == 3 ? r.u16(at + i * 2) : r.u32(at + i * 4));
        };
        for (unsigned i = 0; i < count; ++i)
        {
            const size_t e = ifd + 2 + static_cast<size_t>(i) * 12;
            const unsigned tag = r.u16(e);
            std::vector<unsigned long> v;
            if (tag == 34675) { iccLen = r.u32(e + 4); iccAt = r.u32(e + 8); continue; }
            values(e, v);
            if (v.empty()) continue;
            switch (tag)
            {
            case 256: width = v[0]; break;
            case 257: height = v[0]; break;
            case 258: bits = v[0]; break;
            case 259: compression = v[0]; break;
            case 262: photometric = v[0]; break;
            case 273: offsets = v; break;
            case 274: orientation = static_cast<int>(v[0]); break;
            case 277: samples = v[0]; break;
            case 278: rowsPerStrip = v[0]; break;
            case 279: counts = v; break;
            case 284: planar = v[0]; break;
            case 317: predictor = v[0]; break;
            case 322: return false;  // tiles: o Lightroom não grava assim
            default: break;
            }
        }
        if (!width || !height || width > 60000 || height > 60000 || (bits != 8 && bits != 16) || photometric != 2
            || samples < 3 || planar != 1 || offsets.empty() || offsets.size() != counts.size())
            return false;
        if (compression != 1 && compression != 5 && compression != 8 && compression != 32946) return false;
        if (!rowsPerStrip || rowsPerStrip > height) rowsPerStrip = height;
        const size_t bytesPerSample = bits / 8;
        const size_t rowBytes = static_cast<size_t>(width) * samples * bytesPerSample;
        std::vector<unsigned char> raw;
        raw.reserve(rowBytes * height);
        for (size_t s = 0; s < offsets.size() && raw.size() < rowBytes * height; ++s)
        {
            if (!r.ok(offsets[s], counts[s])) return false;
            const auto src = reinterpret_cast<const unsigned char*>(data.data()) + offsets[s];
            const size_t rows = std::min<size_t>(rowsPerStrip, height - s * rowsPerStrip);
            const size_t want = rows * rowBytes;
            std::vector<unsigned char> strip;
            if (compression == 1) strip.assign(src, src + std::min<size_t>(counts[s], want));
            else if (compression == 5) { if (!LzwDecode(src, counts[s], strip, want)) return false; }
            else
            {
                strip.resize(want);
                const int got = stbi_zlib_decode_buffer(reinterpret_cast<char*>(strip.data()), static_cast<int>(want),
                                                        reinterpret_cast<const char*>(src), static_cast<int>(counts[s]));
                if (got < 0) return false;
                strip.resize(static_cast<size_t>(got));
            }
            strip.resize(want, 0);
            if (predictor == 2)  // cada amostra guardada como diferença da do pixel à esquerda
                for (size_t y = 0; y < rows; ++y)
                {
                    unsigned char* row = strip.data() + y * rowBytes;
                    if (bits == 8)
                        for (size_t x = samples; x < rowBytes; ++x) row[x] = static_cast<unsigned char>(row[x] + row[x - samples]);
                    else
                        for (size_t x = samples; x < static_cast<size_t>(width) * samples; ++x)
                        {
                            unsigned a, b;
                            if (r.little) { a = row[x * 2] | (row[x * 2 + 1] << 8); b = row[(x - samples) * 2] | (row[(x - samples) * 2 + 1] << 8); }
                            else { a = (row[x * 2] << 8) | row[x * 2 + 1]; b = ((row[(x - samples) * 2] << 8) | row[(x - samples) * 2 + 1]); }
                            const unsigned v = (a + b) & 0xFFFF;
                            if (r.little) { row[x * 2] = v & 0xFF; row[x * 2 + 1] = static_cast<unsigned char>(v >> 8); }
                            else { row[x * 2] = static_cast<unsigned char>(v >> 8); row[x * 2 + 1] = v & 0xFF; }
                        }
                }
            raw.insert(raw.end(), strip.begin(), strip.end());
        }
        if (raw.size() < rowBytes * height) return false;
        // Adobe RGB (1998): o perfil ICC embutido diz o nome (em ASCII ou em UTF-16)
        bool adobe = false;
        if (iccLen > 0 && r.ok(iccAt, iccLen))
        {
            const std::string icc = data.substr(iccAt, iccLen);
            const std::string wide = std::string("A\0d\0o\0b\0e\0 \0R\0G\0B", 17);
            adobe = icc.find("Adobe RGB") != std::string::npos || icc.find(wide) != std::string::npos;
        }
        const size_t pixels = static_cast<size_t>(width) * height;
        out.pixels.resize(pixels * 3);
        out.width = static_cast<int>(width);
        out.height = static_cast<int>(height);
        out.orientation = orientation >= 1 && orientation <= 8 ? orientation : 1;
        auto sample = [&](size_t i) -> unsigned  // 0..65535
        {
            if (bits == 8) return raw[i] * 257u;
            return r.little ? (raw[i * 2] | (raw[i * 2 + 1] << 8)) : ((raw[i * 2] << 8) | raw[i * 2 + 1]);
        };
        if (!adobe)
        {
            for (size_t p = 0; p < pixels; ++p)
                for (int c = 0; c < 3; ++c)
                    out.pixels[p * 3 + c] = static_cast<unsigned char>((sample(p * samples + c) + 128) / 257);
            return true;
        }
        // Adobe RGB -> sRGB: tira a curva (gama 563/256), troca as cores primárias (mesmo branco D65) e põe a curva do sRGB
        static std::vector<float> linear;
        static std::vector<unsigned char> encode;
        if (linear.empty())
        {
            linear.resize(65536);
            for (int i = 0; i < 65536; ++i) linear[i] = std::pow(i / 65535.0f, 563.0f / 256.0f);
            encode.resize(4097);
            for (int i = 0; i <= 4096; ++i)
            {
                const float v = i / 4096.0f;
                const float e = v <= 0.0031308f ? v * 12.92f : 1.055f * std::pow(v, 1 / 2.4f) - 0.055f;
                encode[i] = static_cast<unsigned char>(std::lround(std::min(1.0f, std::max(0.0f, e)) * 255));
            }
        }
        auto put = [&](float v) { return encode[static_cast<size_t>(std::lround(std::min(1.0f, std::max(0.0f, v)) * 4096))]; };
        for (size_t p = 0; p < pixels; ++p)
        {
            const float R = linear[sample(p * samples)], G = linear[sample(p * samples + 1)], B = linear[sample(p * samples + 2)];
            out.pixels[p * 3] = put(1.3982832f * R - 0.3982831f * G);
            out.pixels[p * 3 + 1] = put(G);
            out.pixels[p * 3 + 2] = put(-0.0429383f * G + 1.0429383f * B);
        }
        return true;
    }

    // RAW: usa a prévia JPEG que a câmera grava dentro do arquivo (rápido e
    // com as cores da câmera), em vez de revelar o RAW inteiro
    bool DecodeRawPreview(const std::string& data, RgbImage& out)
    {
        auto raw = std::make_unique<LibRaw>();  // objeto grande: fica fora da pilha
        if (raw->open_buffer(data.data(), data.size()) != LIBRAW_SUCCESS)
            return false;
        if (raw->unpack_thumb() != LIBRAW_SUCCESS)
            return false;

        const auto& thumb = raw->imgdata.thumbnail;
        const int rawOrientation = OrientationFromLibRawFlip(raw->imgdata.sizes.flip);

        if (thumb.tformat == LIBRAW_THUMBNAIL_JPEG && thumb.thumb && thumb.tlength > 0)
        {
            const std::string jpeg(thumb.thumb, thumb.tlength);
            if (!DecodeJpeg(jpeg, out))
                return false;
            // A prévia embutida às vezes tem a própria orientação; senão vale a do RAW
            const int own = ReadExifOrientation(jpeg);
            out.orientation = own != 1 ? own : rawOrientation;
            return true;
        }

        if (thumb.tformat == LIBRAW_THUMBNAIL_BITMAP && thumb.thumb && thumb.tcolors == 3
            && thumb.tlength >= static_cast<unsigned>(thumb.twidth) * thumb.theight * 3)
        {
            const auto* bytes = reinterpret_cast<const unsigned char*>(thumb.thumb);
            out.pixels.assign(bytes, bytes + static_cast<size_t>(thumb.twidth) * thumb.theight * 3);
            out.width = thumb.twidth;
            out.height = thumb.theight;
            out.orientation = rawOrientation;
            return true;
        }
        return false;
    }

    std::vector<unsigned char> Rotate(const std::vector<unsigned char>& src, int& w, int& h, int orientation)
    {
        if (orientation != 3 && orientation != 6 && orientation != 8)
            return src;

        const int nw = (orientation == 3) ? w : h;
        const int nh = (orientation == 3) ? h : w;
        std::vector<unsigned char> dst(static_cast<size_t>(nw) * nh * 3);

        for (int y = 0; y < h; ++y)
        {
            for (int x = 0; x < w; ++x)
            {
                int nx = x, ny = y;
                if (orientation == 3) { nx = w - 1 - x; ny = h - 1 - y; }
                if (orientation == 6) { nx = h - 1 - y; ny = x; }
                if (orientation == 8) { nx = y; ny = w - 1 - x; }
                const size_t s = (static_cast<size_t>(y) * w + x) * 3;
                const size_t d = (static_cast<size_t>(ny) * nw + nx) * 3;
                dst[d] = src[s];
                dst[d + 1] = src[s + 1];
                dst[d + 2] = src[s + 2];
            }
        }
        w = nw;
        h = nh;
        return dst;
    }

    void AppendToString(void* context, void* data, int size)
    {
        static_cast<std::string*>(context)->append(static_cast<const char*>(data), static_cast<size_t>(size));
    }
}

namespace
{
    // Fonte 5×7 só com o que a foto de teste usa: dígitos e '#'
    const char* Glyph(char c)
    {
        static const char* digits[10] = {
            "01110""10001""10011""10101""11001""10001""01110",
            "00100""01100""00100""00100""00100""00100""01110",
            "01110""10001""00001""00010""00100""01000""11111",
            "11111""00010""00100""00010""00001""10001""01110",
            "00010""00110""01010""10010""11111""00010""00010",
            "11111""10000""11110""00001""00001""10001""01110",
            "00110""01000""10000""11110""10001""10001""01110",
            "11111""00001""00010""00100""01000""01000""01000",
            "01110""10001""10001""01110""10001""10001""01110",
            "01110""10001""10001""01111""00001""00010""01100",
        };
        static const char* hash = "01010""01010""11111""01010""11111""01010""01010";
        if (c >= '0' && c <= '9')
            return digits[c - '0'];
        return hash;
    }

    void DrawText(std::vector<unsigned char>& px, int w, int h, int x, int y, const std::string& text, int scale,
                  unsigned char r, unsigned char g, unsigned char b)
    {
        for (char c : text)
        {
            const char* glyph = Glyph(c);
            for (int row = 0; row < 7; ++row)
                for (int col = 0; col < 5; ++col)
                {
                    if (glyph[row * 5 + col] != '1')
                        continue;
                    for (int dy = 0; dy < scale; ++dy)
                        for (int dx = 0; dx < scale; ++dx)
                        {
                            const int X = x + col * scale + dx, Y = y + row * scale + dy;
                            if (X < 0 || Y < 0 || X >= w || Y >= h)
                                continue;
                            unsigned char* p = &px[(static_cast<size_t>(Y) * w + X) * 3];
                            p[0] = r; p[1] = g; p[2] = b;
                        }
                }
            x += 6 * scale;
        }
    }
}

bool WriteTestPhoto(const fs::path& file, int cameraNumber, int shotNumber, double ratio)
{
    const int w = 900, h = std::max(100, static_cast<int>(std::lround(900.0 / std::max(0.5, ratio))));
    std::vector<unsigned char> px(static_cast<size_t>(w) * h * 3);
    // Uma cor por câmera (tons escuros, para o número branco ler bem)
    const int hue = (cameraNumber * 47) % 360;
    auto channel = [&](int offset)
    {
        const double x = std::fmod(hue + offset, 360.0) / 60.0;
        const double v = std::clamp(2.0 - std::abs(x - 2.0) * 1.0, 0.0, 1.0);  // triângulo simples
        return static_cast<unsigned char>(40 + v * 90);
    };
    const unsigned char r = channel(0), g = channel(240), b = channel(120);
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x)
        {
            unsigned char* p = &px[(static_cast<size_t>(y) * w + x) * 3];
            const double shade = 0.75 + 0.25 * (1.0 - static_cast<double>(y) / h);
            p[0] = static_cast<unsigned char>(r * shade); p[1] = static_cast<unsigned char>(g * shade); p[2] = static_cast<unsigned char>(b * shade);
        }
    const std::string big = std::to_string(cameraNumber);
    const int scale = 40;
    DrawText(px, w, h, (w - static_cast<int>(big.size()) * 6 * scale + scale) / 2, (h - 7 * scale) / 2, big, scale, 255, 255, 255);
    DrawText(px, w, h, 30, 30, "#" + std::to_string(shotNumber), 8, 255, 255, 255);
    std::string jpeg;
    stbi_write_jpg_to_func(AppendToString, &jpeg, w, h, 3, px.data(), 88);
    std::error_code ec;
    fs::create_directories(file.parent_path(), ec);
    std::ofstream out(file, std::ios::binary);
    out << jpeg;
    return static_cast<bool>(out);
}

bool IsRawPhoto(const std::string& file) { return IsRaw(file); }
bool IsJpegPhoto(const std::string& file) { return IsJpeg(file); }

bool LoadPhotoRgb(const fs::path& file, RgbFrame& out, std::string* jpegBytes)
{
    const std::string name = file.filename().string();
    const std::string original = ReadFile(file);
    if (original.empty())
        return false;

    RgbImage decoded;
    if (IsRaw(name))
    {
        if (!DecodeRawPreview(original, decoded))
            return false;
        if (jpegBytes)
        {
            auto raw = std::make_unique<LibRaw>();
            jpegBytes->clear();
            if (raw->open_buffer(original.data(), original.size()) == LIBRAW_SUCCESS && raw->unpack_thumb() == LIBRAW_SUCCESS
                && raw->imgdata.thumbnail.tformat == LIBRAW_THUMBNAIL_JPEG)
                jpegBytes->assign(raw->imgdata.thumbnail.thumb, raw->imgdata.thumbnail.tlength);
        }
    }
    else if (IsTiff(name))
    {
        // Editada do Lightroom Classic (Edited/<sessão>/): não tem JPEG para devolver
        if (!DecodeTiff(original, decoded))
            return false;
        if (jpegBytes)
            jpegBytes->clear();
    }
    else
    {
        if (!DecodeJpeg(original, decoded))
            return false;
        decoded.orientation = ReadExifOrientation(original);
        if (jpegBytes)
            *jpegBytes = original;
    }
    int w = decoded.width, h = decoded.height;
    out.pixels = Rotate(decoded.pixels, w, h, decoded.orientation);
    out.width = w;
    out.height = h;
    return true;
}

PhotoStore::PhotoStore(fs::path root) : root(std::move(root))
{
    std::error_code ec;
    fs::create_directories(this->root, ec);
}

fs::path PhotoStore::SessionPath(const std::string& session) const
{
    // Só aceita um nome de pasta simples (sem "..", barras etc.)
    if (session.empty() || session.find_first_of("/\\") != std::string::npos || session == "." || session == "..")
        return {};
    // Na pasta de dados ou, se não estiver lá, no Project
    std::error_code ec;
    if (fs::is_directory(root / session, ec))
        return root / session;
    if (!projectRoot.empty() && fs::is_directory(projectRoot / session, ec))
        return projectRoot / session;
    return root / session;
}

fs::path PhotoStore::SessionDir(const std::string& session) const
{
    const fs::path dir = SessionPath(session);
    std::error_code ec;
    return !dir.empty() && fs::is_directory(dir, ec) ? dir : fs::path();
}

void PhotoStore::SetProject(const fs::path& originals, const fs::path& edited)
{
    projectRoot = originals;
    projectEdited = edited;
}

namespace
{
    const char* const kSessionInfo = "session.json";

    JsonLite::Value ReadSessionInfo(const fs::path& dir)
    {
        std::ifstream in(dir / kSessionInfo, std::ios::binary);
        if (!in)
            return JsonLite::Value();
        const std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
        return JsonLite::Parse(text);
    }

    bool WriteSessionInfoFile(const fs::path& dir, const JsonLite::Value& info)
    {
        std::ofstream out(dir / kSessionInfo, std::ios::binary | std::ios::trunc);
        out << JsonLite::Stringify(info);
        return static_cast<bool>(out);
    }

    std::string BaseName(const std::string& file)
    {
        const auto dot = file.rfind('.');
        return dot == std::string::npos ? file : file.substr(0, dot);
    }

    bool IsEditedExtension(const std::string& file)
    {
        std::string ext = fs::path(file).extension().string();
        for (char& c : ext) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        return ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".tif" || ext == ".tiff";
    }
}

fs::path PhotoStore::EditedFile(const std::string& session, const std::string& file) const
{
    if (projectEdited.empty() || session.find_first_of("/\\") != std::string::npos)
        return {};
    std::error_code ec;
    const fs::path dir = projectEdited / session;
    if (!fs::is_directory(dir, ec))
        return {};
    const std::string base = BaseName(file);
    fs::path best;
    fs::file_time_type bestTime{};
    for (const auto& entry : fs::directory_iterator(dir, ec))
    {
        if (!entry.is_regular_file())
            continue;
        const std::string name = entry.path().filename().string();
        if (name.rfind('.', 0) == 0 || BaseName(name) != base || !IsEditedExtension(name))
            continue;
        const auto time = entry.last_write_time(ec);
        if (best.empty() || time > bestTime)
        {
            best = entry.path();
            bestTime = time;
        }
    }
    return best;
}

bool PhotoStore::SetLabel(const std::string& session, const std::string& label) const
{
    const fs::path dir = SessionDir(session);
    if (dir.empty())
        return false;
    JsonLite::Value info = ReadSessionInfo(dir);
    if (!info.isObject())
        info = JsonLite::Value::NewObject();
    info.set("label", label);
    return WriteSessionInfoFile(dir, info);
}

bool PhotoStore::ShowEdited(const std::string& session) const
{
    const fs::path dir = SessionDir(session);
    if (dir.empty())
        return true;
    const JsonLite::Value info = ReadSessionInfo(dir);
    return !(info.isObject() && info.get("showEdited").asString() == "no");
}

bool PhotoStore::SetShowEdited(const std::string& session, bool show) const
{
    const fs::path dir = SessionDir(session);
    if (dir.empty())
        return false;
    JsonLite::Value info = ReadSessionInfo(dir);
    if (!info.isObject())
        info = JsonLite::Value::NewObject();
    info.set("showEdited", show ? "yes" : "no");
    return WriteSessionInfoFile(dir, info);
}

std::vector<fs::path> PhotoStore::EditedFiles(const std::string& session, const std::string& file) const
{
    std::vector<fs::path> list;
    if (projectEdited.empty() || session.find_first_of("/\\") != std::string::npos)
        return list;
    std::error_code ec;
    const fs::path dir = projectEdited / session;
    if (!fs::is_directory(dir, ec))
        return list;
    const std::string base = BaseName(file);
    for (const auto& entry : fs::directory_iterator(dir, ec))
    {
        const std::string name = entry.path().filename().string();
        if (entry.is_regular_file() && name.rfind('.', 0) != 0 && BaseName(name) == base && IsEditedExtension(name))
            list.push_back(entry.path());
    }
    return list;
}

bool PhotoStore::SetCrop(const std::string& session, const std::string& crop) const
{
    const fs::path dir = SessionDir(session);
    if (dir.empty())
        return false;
    JsonLite::Value info = ReadSessionInfo(dir);
    if (!info.isObject())
        info = JsonLite::Value::NewObject();
    info.set("crop", crop);
    return WriteSessionInfoFile(dir, info);
}

bool PhotoStore::SetAlign(const std::string& session, const std::string& align) const
{
    const fs::path dir = SessionDir(session);
    if (dir.empty())
        return false;
    JsonLite::Value info = ReadSessionInfo(dir);
    if (!info.isObject())
        info = JsonLite::Value::NewObject();
    info.set("align", align);
    return WriteSessionInfoFile(dir, info);
}

bool PhotoStore::WriteSessionInfo(const std::string& session, const std::string& jsonText) const
{
    const fs::path dir = SessionDir(session);
    if (dir.empty())
        return false;
    bool ok = false;
    JsonLite::Value fresh = JsonLite::Parse(jsonText, &ok);
    if (!ok || !fresh.isObject())
        return false;
    JsonLite::Value info = ReadSessionInfo(dir);
    if (!info.isObject())
        info = JsonLite::Value::NewObject();
    for (const auto& [key, value] : *fresh.obj)
        info.set(key, value);  // mantém o que já havia (ex.: o rótulo)
    return WriteSessionInfoFile(dir, info);
}

namespace
{
    // Pasta que só tem arquivos e pastas do app (começam com ".", como ".previews"): nenhuma foto
    bool OnlyAppLeftovers(const fs::path& dir)
    {
        std::error_code ec;
        if (!fs::is_directory(dir, ec))
            return false;
        for (const auto& entry : fs::directory_iterator(dir, ec))
            if (entry.path().filename().string().rfind('.', 0) != 0)
                return false;
        return !ec;
    }
}

bool PhotoStore::MoveSession(const std::string& session, bool toProject, std::string& errorMessage) const
{
    if (projectRoot.empty())
    {
        errorMessage = "No project is open.";
        return false;
    }
    const fs::path from = SessionDir(session);
    if (from.empty())
    {
        errorMessage = "Session not found: " + session;
        return false;
    }
    const fs::path destRoot = toProject ? projectRoot : root;
    std::error_code ec;
    fs::create_directories(destRoot, ec);
    fs::path to = destRoot / session;
    if (fs::equivalent(from.parent_path(), destRoot, ec))
        return true;  // já está lá
    if (fs::exists(to, ec) && OnlyAppLeftovers(to))
        fs::remove_all(to, ec);  // sobra sem fotos (ex.: só a pasta de prévias): não é uma sessão
    ec.clear();
    if (fs::exists(to, ec))
    {
        errorMessage = "A session with this name already exists there: " + session;
        return false;
    }
    fs::remove_all(from / kPreviewFolder, ec);
    ec.clear();
    fs::rename(from, to, ec);
    if (ec)
    {
        ec.clear();
        fs::copy(from, to, fs::copy_options::recursive, ec);
        if (ec)
        {
            errorMessage = "Could not move " + session + ": " + ec.message();
            fs::remove_all(to, ec);
            return false;
        }
        fs::remove_all(from, ec);
    }
    return true;
}

std::vector<StoredSession> PhotoStore::ListSessions() const
{
    std::vector<StoredSession> sessions;
    ReadSessions(root, false, sessions);
    if (!projectRoot.empty())
        ReadSessions(projectRoot, true, sessions);
    // Mais recente primeiro (nomes começam com data e hora)
    std::sort(sessions.begin(), sessions.end(),
        [](const StoredSession& a, const StoredSession& b) { return a.name > b.name; });
    return sessions;
}

void PhotoStore::ReadSessions(const fs::path& base, bool inProject, std::vector<StoredSession>& sessions) const
{
    std::error_code ec;
    if (!fs::exists(base, ec))
        return;

    static const std::regex photoName(R"(^(\d+)_([^_]+_\d+)_.+$)");

    for (const auto& dir : fs::directory_iterator(base, ec))
    {
        if (!dir.is_directory() || dir.path().filename().string().rfind('.', 0) == 0)
            continue;

        StoredSession session;
        session.name = dir.path().filename().string();
        session.inProject = inProject;
        {
            const JsonLite::Value info = ReadSessionInfo(dir.path());
            if (inProject)
            {
                session.label = info.get("label").asString();
                session.timing = info.get("timing").asString();
            }
            session.crop = info.get("crop").asString();  // (também fora do Project)
            session.showEdited = !(info.isObject() && info.get("showEdited").asString() == "no");
            session.align = info.get("align").asString();
        }

        session.saved = fs::exists(dir.path() / kSavedMark, ec);
        {
            // ".missing": uma linha por foto que a câmera recusou (escrito pelo CameraFleet)
            std::ifstream missing((dir.path() / ".missing").string());
            std::string line;
            while (std::getline(missing, line))
                if (!line.empty())
                    ++session.missing;
        }
        for (const auto& entry : fs::directory_iterator(dir.path(), ec))
        {
            // Só fotos (arquivos que começam com "." são do app, como ".saved"; session.json
            // e os .xmp do Lightroom também não são fotos)
            if (!entry.is_regular_file() || entry.path().filename().string().rfind('.', 0) == 0)
                continue;
            StoredPhoto photo;
            photo.file = entry.path().filename().string();
            if (photo.file == kSessionInfo)
                continue;
            {
                std::string ext = entry.path().extension().string();
                for (char& c : ext) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
                if (ext == ".xmp" || ext == ".json" || ext == ".txt")
                    continue;
            }
            std::smatch match;
            if (std::regex_match(photo.file, match, photoName))
            {
                photo.order = std::stoi(match[1].str());
                photo.camera = match[2].str();
            }
            photo.previewable = IsJpeg(photo.file) || IsRaw(photo.file);
            if (inProject && !EditedFile(session.name, photo.file).empty())
            {
                ++session.edited;
                photo.edited = true;
            }
            session.photos.push_back(photo);
        }

        std::sort(session.photos.begin(), session.photos.end(),
            [](const StoredPhoto& a, const StoredPhoto& b)
            { return a.order != b.order ? a.order < b.order : a.file < b.file; });

        if (!session.photos.empty())
            sessions.push_back(session);
    }
}

int PhotoStore::CountSessions() const
{
    return static_cast<int>(ListSessions().size());
}

int PhotoStore::CountUnsaved() const
{
    int count = 0;
    for (const auto& session : ListSessions())
        if (!session.saved && !session.inProject)  // no Project já está guardada
            ++count;
    return count;
}

void PhotoStore::MarkSaved(const std::string& session) const
{
    const fs::path dir = SessionPath(session);
    std::error_code ec;
    if (!dir.empty() && fs::is_directory(dir, ec))
        std::ofstream(dir / kSavedMark) << "saved\n";
}

std::string PhotoStore::Preview(const std::string& session, const std::string& file, int maxSize) const
{
    const fs::path dir = SessionPath(session);
    if (dir.empty() || file.find_first_of("/\\") != std::string::npos || !(IsJpeg(file) || IsRaw(file)))
        return "";

    std::error_code ec;
    // Project: a foto editada (Edited/<sessão>/) aparece no lugar do original (decisão do dono, 2026-11-01). A prévia
    // dela tem a hora do arquivo no nome: exportar de novo do Lightroom faz uma prévia nova.
    const fs::path edited = ShowEdited(session) ? EditedFile(session, file) : fs::path();
    std::string cacheName = std::to_string(maxSize) + "_" + file;
    if (!edited.empty())
    {
        const auto when = fs::last_write_time(edited, ec).time_since_epoch().count();
        cacheName = "edited_" + std::to_string(static_cast<long long>(when)) + "_" + cacheName;
    }
    const fs::path cache = dir / kPreviewFolder / cacheName;
    if (fs::exists(cache, ec))
        return ReadFile(cache);

    int w = 0, h = 0;
    std::vector<unsigned char> image;
    RgbFrame editedFrame;
    if (!edited.empty() && LoadPhotoRgb(edited, editedFrame))
    {
        w = editedFrame.width;
        h = editedFrame.height;
        image = std::move(editedFrame.pixels);
    }
    else
    {
        const std::string original = ReadFile(dir / file);
        if (original.empty())
            return "";

        RgbImage decoded;
        if (IsRaw(file))
        {
            if (!DecodeRawPreview(original, decoded))
                return "";
        }
        else
        {
            if (!DecodeJpeg(original, decoded))
                return "";
            decoded.orientation = ReadExifOrientation(original);
        }

        w = decoded.width;
        h = decoded.height;
        image = Rotate(decoded.pixels, w, h, decoded.orientation);
    }

    const double scale = std::min(1.0, static_cast<double>(maxSize) / std::max(w, h));
    const int tw = std::max(1, static_cast<int>(w * scale));
    const int th = std::max(1, static_cast<int>(h * scale));
    std::vector<unsigned char> resized(static_cast<size_t>(tw) * th * 3);
    stbir_resize_uint8_linear(image.data(), w, h, 0, resized.data(), tw, th, 0, STBIR_RGB);

    std::string jpeg;
    stbi_write_jpg_to_func(AppendToString, &jpeg, tw, th, 3, resized.data(), 85);

    // A sessão pode ter mudado de lugar (ou ido para a lixeira) enquanto a prévia era feita:
    // gravar no caminho antigo recriaria uma pasta vazia com o nome dela
    if (fs::exists(dir / file, ec))
    {
        fs::create_directories(cache.parent_path(), ec);
        std::ofstream(cache, std::ios::binary) << jpeg;
    }
    return jpeg;
}

int PhotoStore::SaveSessions(const fs::path& destination, const std::vector<std::string>& names,
                             std::string& errorMessage, std::vector<fs::path>* savedTo) const
{
    std::error_code ec;
    fs::create_directories(destination, ec);
    if (ec)
    {
        errorMessage = "Could not open the folder: " + ec.message();
        return 0;
    }

    int moved = 0;
    for (const auto& session : ListSessions())
    {
        if (!names.empty() && std::find(names.begin(), names.end(), session.name) == names.end())
            continue;
        const fs::path from = SessionDir(session.name);
        if (from.empty())
            continue;
        fs::remove_all(from / kPreviewFolder, ec);

        // Não sobrescreve: "nome", "nome (2)", "nome (3)"...
        fs::path to = destination / session.name;
        for (int n = 2; fs::exists(to, ec); ++n)
            to = destination / (session.name + " (" + std::to_string(n) + ")");

        fs::rename(from, to, ec);
        if (ec)
        {
            // Outro disco: copia e depois apaga
            ec.clear();
            fs::copy(from, to, fs::copy_options::recursive, ec);
            if (ec)
            {
                errorMessage = "Could not save " + session.name + ": " + ec.message();
                return moved;
            }
            fs::remove_all(from, ec);
        }
        if (savedTo)
            savedTo->push_back(to);
        ++moved;
    }
    return moved;
}

bool PhotoStore::ReorderSession(const std::string& session, const std::vector<std::string>& groups,
                                std::string& errorMessage) const
{
    const fs::path dir = SessionPath(session);
    std::error_code ec;
    if (dir.empty() || !fs::is_directory(dir, ec))
    {
        errorMessage = "Session not found.";
        return false;
    }

    // Novo número de cada grupo ("02_T7_1" -> 1, ...)
    std::map<std::string, int> newOrder;
    for (size_t i = 0; i < groups.size(); ++i)
        newOrder.emplace(groups[i], static_cast<int>(i) + 1);

    static const std::regex photoName(R"(^(\d+)_([^_]+_\d+)_.+$)");
    struct Rename { fs::path from, temp, to; };
    std::vector<Rename> renames;

    for (const auto& entry : fs::directory_iterator(dir, ec))
    {
        if (!entry.is_regular_file())
            continue;
        const std::string file = entry.path().filename().string();
        std::smatch match;
        if (!std::regex_match(file, match, photoName))
            continue;
        auto it = newOrder.find(match[1].str() + "_" + match[2].str());
        if (it == newOrder.end())
            continue;

        std::string prefix = std::to_string(it->second);
        if (prefix.size() < 2)
            prefix.insert(0, 2 - prefix.size(), '0');
        const std::string renamed = prefix + file.substr(match[1].length());
        if (renamed != file)
            renames.push_back({ entry.path(), dir / (file + ".reorder-tmp"), dir / renamed });
    }

    // Em duas etapas, para um nome novo nunca coincidir com um antigo ainda não renomeado
    for (const auto& r : renames)
    {
        fs::rename(r.from, r.temp, ec);
        if (ec)
        {
            errorMessage = "Could not rename " + r.from.filename().string() + ": " + ec.message();
            return false;
        }
    }
    for (const auto& r : renames)
    {
        fs::rename(r.temp, r.to, ec);
        if (ec)
        {
            errorMessage = "Could not rename " + r.to.filename().string() + ": " + ec.message();
            return false;
        }
    }

    // As prévias guardadas ("<tamanho>_<arquivo>") passam para os nomes novos: assim não precisam ser
    // refeitas (com RAW isso demora). Se algo falhar, apaga todas (são refeitas quando pedidas)
    std::map<std::string, std::string> oldToNew;
    for (const auto& r : renames)
        oldToNew[r.from.filename().string()] = r.to.filename().string();
    const fs::path previews = dir / kPreviewFolder;
    std::vector<Rename> previewRenames;
    if (!oldToNew.empty() && fs::is_directory(previews, ec))
    {
        for (const auto& entry : fs::directory_iterator(previews, ec))
        {
            const std::string name = entry.path().filename().string();
            const size_t cut = name.find('_');
            if (cut == std::string::npos)
                continue;
            auto it = oldToNew.find(name.substr(cut + 1));
            if (it != oldToNew.end())
                previewRenames.push_back({ entry.path(), previews / (name + ".reorder-tmp"), previews / (name.substr(0, cut + 1) + it->second) });
        }
    }
    bool previewsOk = !ec;
    for (const auto& r : previewRenames)
        if (previewsOk) { fs::rename(r.from, r.temp, ec); previewsOk = !ec; }
    for (const auto& r : previewRenames)
        if (previewsOk) { fs::rename(r.temp, r.to, ec); previewsOk = !ec; }
    if (!previewsOk)
    {
        ec.clear();
        fs::remove_all(previews, ec);
    }
    return true;
}

bool PhotoStore::DeletePhotos(const std::string& session, const std::vector<std::string>& groups,
                              std::string& errorMessage) const
{
    const fs::path dir = SessionPath(session);
    std::error_code ec;
    if (dir.empty() || !fs::is_directory(dir, ec))
    {
        errorMessage = "Session not found.";
        return false;
    }

    static const std::regex photoName(R"(^(\d+)_([^_]+_\d+)_.+$)");
    bool anyLeft = false;
    std::vector<fs::path> toDelete;
    for (const auto& entry : fs::directory_iterator(dir, ec))
    {
        if (!entry.is_regular_file() || entry.path().filename().string().rfind('.', 0) == 0)
            continue;  // só fotos (".saved" é do app)
        const std::string file = entry.path().filename().string();
        std::smatch match;
        const std::string group = std::regex_match(file, match, photoName)
            ? match[1].str() + "_" + match[2].str() : file;
        if (std::find(groups.begin(), groups.end(), group) != groups.end()
            || std::find(groups.begin(), groups.end(), file) != groups.end())
            toDelete.push_back(entry.path());
        else
            anyLeft = true;
    }

    // Para a lixeira, num item próprio, guardando de onde vieram e quando
    const fs::path trash = NewTrashEntry(dir, session, false);
    fs::create_directories(trash, ec);
    WriteTrashInfo(trash, session, false, dir, NowSeconds());
    for (const auto& path : toDelete)
    {
        // A editada da foto (Edited/<sessão>/) vai junto, na subpasta .edited do item
        for (const auto& edit : EditedFiles(session, path.filename().string()))
        {
            std::error_code eec;
            fs::create_directories(trash / kTrashEdited, eec);
            MoveFile(edit, trash / kTrashEdited / edit.filename(), eec);
        }
        MoveFile(path, trash / path.filename(), ec);
        if (ec)
        {
            errorMessage = "Could not delete " + path.filename().string() + ": " + ec.message();
            return false;
        }
    }

    if (!anyLeft)
    {
        // Sobrou só o que é do app (.missing, session.json): vai junto, para o Restore; as prévias não
        fs::remove_all(dir / kPreviewFolder, ec);
        for (const auto& entry : fs::directory_iterator(dir, ec))
            MoveFile(entry.path(), trash / entry.path().filename(), ec);
        fs::remove_all(dir, ec);
        WriteTrashInfo(trash, session, true, dir, NowSeconds());  // a sessão inteira saiu
    }
    return true;
}

int PhotoStore::TrashEdits(const std::string& session, const std::vector<std::string>& files, std::string& errorMessage) const
{
    const fs::path dir = SessionPath(session);
    std::error_code ec;
    if (dir.empty() || !fs::is_directory(dir, ec))
    {
        errorMessage = "Session not found.";
        return 0;
    }
    std::vector<fs::path> edits;
    for (const auto& file : files)
        for (const auto& e : EditedFiles(session, file))
            if (std::find(edits.begin(), edits.end(), e) == edits.end())
                edits.push_back(e);
    if (edits.empty())
        return 0;
    const fs::path trash = NewTrashEntry(dir, session, false);
    fs::create_directories(trash / kTrashEdited, ec);
    WriteTrashInfo(trash, session, false, dir, NowSeconds());
    MarkTrashKind(trash, "edits");
    int moved = 0;
    for (const auto& e : edits)
    {
        std::error_code mec;
        MoveFile(e, trash / kTrashEdited / e.filename(), mec);
        if (mec) { errorMessage = "Could not delete " + e.filename().string() + ": " + mec.message(); break; }
        ++moved;
    }
    if (moved == 0)
        fs::remove_all(trash, ec);
    fs::remove_all(dir / kPreviewFolder, ec);  // as prévias das editadas
    return moved;
}

fs::path PhotoStore::TrashRootFor(const fs::path& dir) const
{
    if (!projectRoot.empty() && dir.parent_path() == projectRoot)
        return projectRoot.parent_path() / kProjectTrash;  // no mesmo disco do Project
    return root / kTrashFolder;
}

// Um nome livre para um item novo da lixeira: "<segundos>-<sessão>" (com -2, -3... se repetir)
fs::path PhotoStore::NewTrashEntry(const fs::path& dir, const std::string& session, bool) const
{
    const fs::path base = TrashRootFor(dir);
    std::error_code ec;
    fs::create_directories(base, ec);
    const std::string stem = std::to_string(NowSeconds()) + "-" + session;
    fs::path entry = base / stem;
    for (int n = 2; fs::exists(entry, ec); ++n)
        entry = base / (stem + "-" + std::to_string(n));
    return entry;
}

bool PhotoStore::DeleteSession(const std::string& session) const
{
    const fs::path dir = SessionPath(session);
    std::error_code ec;
    if (dir.empty() || !fs::is_directory(dir, ec))
        return false;
    fs::remove_all(dir / kPreviewFolder, ec);  // as prévias são refeitas; não vale guardar
    // Um "restaurado" antigo desta sessão dá lugar ao item novo (as fotos de antes passam a depender dele)
    for (const auto& d : fs::directory_iterator(TrashRootFor(dir), ec))
    {
        auto o = ReadTrashInfo(d.path());
        if (o["restored"] == "1" && o["session"] == session && o["kind"] != "project")
            fs::remove_all(d.path(), ec);
    }
    ec.clear();
    const fs::path trash = NewTrashEntry(dir, session, true);
    ec.clear();
    fs::rename(dir, trash, ec);
    if (ec)
    {
        // Outro disco (não deveria acontecer: cada lixeira fica no disco das suas sessões)
        ec.clear();
        fs::copy(dir, trash, fs::copy_options::recursive, ec);
        if (ec) return false;
        fs::remove_all(dir, ec);
    }
    WriteTrashInfo(trash, session, true, dir, NowSeconds());
    // As editadas da sessão (Edited/<sessão>/) vão junto
    if (!projectEdited.empty())
    {
        const fs::path edited = projectEdited / session;
        if (fs::is_directory(edited, ec))
        {
            fs::rename(edited, trash / kTrashEdited, ec);
            if (ec) { ec.clear(); fs::copy(edited, trash / kTrashEdited, fs::copy_options::recursive, ec); if (!ec) fs::remove_all(edited, ec); }
        }
    }
    return true;
}

bool PhotoStore::DeleteSessionNow(const std::string& session) const
{
    const fs::path dir = SessionPath(session);
    std::error_code ec;
    if (dir.empty() || !fs::is_directory(dir, ec))
        return false;
    fs::remove_all(dir, ec);
    return !ec;
}

namespace
{
    // As lixeiras (a do app e, com Project, a dele) e os itens de cada uma
    struct TrashEntry
    {
        fs::path path;
        bool inProject = false;
        std::map<std::string, std::string> info;
        long long deletedAt = 0;
        long long order = 0;
    };
}

static std::vector<TrashEntry> TrashEntries(const fs::path& appTrash, const fs::path& projectTrash)
{
    std::vector<TrashEntry> out;
    std::error_code ec;
    for (int k = 0; k < 2; ++k)
    {
        const fs::path& base = k == 0 ? appTrash : projectTrash;
        if (base.empty() || !fs::is_directory(base, ec))
            continue;
        for (const auto& d : fs::directory_iterator(base, ec))
        {
            if (!d.is_directory(ec))
                continue;
            TrashEntry e;
            e.path = d.path();
            e.inProject = k == 1;
            e.info = ReadTrashInfo(e.path);
            if (e.info.empty())
            {
                // Item da 2.14 (pasta com o nome da sessão e ".from"): passa a ter os 15 dias a partir de agora
                std::string origin = ReadTextFile(e.path / kTrashOrigin);
                while (!origin.empty() && (origin.back() == '\n' || origin.back() == '\r')) origin.pop_back();
                const bool whole = origin.empty() || !fs::is_directory(fs::path(origin), ec);
                WriteTrashInfo(e.path, e.path.filename().string(), whole, fs::path(origin), NowSeconds());
                e.info = ReadTrashInfo(e.path);
            }
            try { e.deletedAt = std::stoll(e.info["deleted"]); } catch (...) { e.deletedAt = NowSeconds(); }
            try { e.order = std::stoll(e.info["order"]); } catch (...) { e.order = e.deletedAt * 1000000000LL; }
            out.push_back(std::move(e));
        }
    }
    return out;
}

std::vector<TrashItem> PhotoStore::ListTrash() const
{
    const fs::path projectTrash = projectRoot.empty() ? fs::path() : projectRoot.parent_path() / kProjectTrash;
    const fs::path openProject = projectRoot.empty() ? fs::path() : projectRoot.parent_path();
    std::vector<TrashItem> items;
    auto all = TrashEntries(root / kTrashFolder, projectTrash);
    std::string reparent;  // projeto restaurado e aberto: a lixeira dele aparece abaixo da linha dele
    for (auto& e : all)
    {
        const bool restored = e.info["restored"] == "1";
        TrashItem t;
        t.id = std::string(e.inProject ? "project/" : "app/") + e.path.filename().string();
        t.session = e.info["session"];
        t.wholeSession = e.info["kind"] != "photos" && e.info["kind"] != "edits";
        t.editsOnly = e.info["kind"] == "edits";
        t.restored = restored;
        std::error_code pec;
        if (e.info["kind"] == "project")
        {
            t.isProject = true;
            const fs::path location(e.info["location"]);
            t.reachable = fs::is_directory(location, pec);
            if (!restored) { try { t.bytes = std::stoull(e.info["bytes"]); } catch (...) { t.bytes = 0; } }
            try { t.sessions = std::stoi(e.info["sessions"]); } catch (...) { t.sessions = 0; }
            // O que estava na lixeira de dentro do projeto (foi junto com a pasta)
            std::vector<TrashEntry> inner;
            if (t.reachable)
                inner = TrashEntries(location / kProjectTrash, fs::path());
            bool pending = false;
            for (auto& n : inner)
                pending = pending || n.info["restored"] != "1";
            if (restored && !pending && t.reachable)
            {
                for (auto& n : inner)
                    fs::remove_all(n.path, pec);  // só "restaurados" que sobraram lá dentro
                fs::remove_all(e.path, pec);      // nada mais depende dele
                continue;
            }
            if (restored && !openProject.empty() && fs::equivalent(location, openProject, pec))
                reparent = t.id;  // os itens aparecem pela lixeira do projeto aberto, abaixo dele
            else
                for (auto& n : inner)
                {
                    TrashItem in;
                    in.id = "nested/" + e.path.filename().string() + "/" + n.path.filename().string();
                    in.session = n.info["session"];
                    in.wholeSession = n.info["kind"] != "photos";
                    in.restored = n.info["restored"] == "1";
                    in.photos = in.restored ? 0 : CountTrashPhotos(n.path);
                    in.bytes = in.restored ? 0 : FolderBytes(n.path);
                    in.deletedAt = n.deletedAt;
                    in.order = n.order;
                    in.inProject = true;
                    in.parent = t.id;
                    items.push_back(in);
                }
        }
        else if (restored)
        {
            // Sessão restaurada: fica enquanto houver fotos dela apagadas antes
            bool dependents = false;
            for (auto& o : all)
                if (o.path.parent_path() == e.path.parent_path() && o.info["session"] == t.session && (o.info["kind"] == "photos" || o.info["kind"] == "edits")
                    && o.info["restored"] != "1" && o.order < e.order)
                    dependents = true;
            if (!dependents)
            {
                fs::remove_all(e.path, pec);
                continue;
            }
        }
        else
        {
            t.photos = CountTrashPhotos(e.path);
            t.edits = CountTrashEdits(e.path);
            t.bytes = FolderBytes(e.path);
            std::error_code bec;
            for (const auto& f : fs::directory_iterator(t.editsOnly ? e.path / kTrashEdited : e.path, bec))
            {
                const std::string name = f.path().filename().string();
                if (!f.is_regular_file(bec) || name.rfind('.', 0) == 0 || name == "session.json")
                    continue;
                const std::string base = BaseName(name);
                if (std::find(t.bases.begin(), t.bases.end(), base) == t.bases.end())
                    t.bases.push_back(base);
            }
        }
        t.deletedAt = e.deletedAt;
        t.order = e.order;
        t.inProject = e.inProject;
        items.push_back(t);
    }
    if (!reparent.empty())
        for (auto& t : items)
            if (t.id.rfind("project/", 0) == 0)
                t.parent = reparent;
    std::sort(items.begin(), items.end(), [](const TrashItem& a, const TrashItem& b) { return a.order > b.order; });
    return items;
}

bool PhotoStore::RestoreEntry(const fs::path& trash, std::string& errorMessage, std::vector<std::string>* restored) const
{
    std::error_code ec;
    auto info = ReadTrashInfo(trash);
    if (info["restored"] == "1")
    {
        errorMessage = "This item was already restored.";
        return false;
    }
    // Fica como "restaurado" (só o .trashinfo) enquanto houver itens apagados antes que dependem dele
    auto keepAsRestored = [&](const fs::path& location)
    {
        for (const auto& f : fs::directory_iterator(trash, ec))
            if (f.path().filename() != kTrashInfo)
                fs::remove_all(f.path(), ec);
        std::ofstream out(trash / kTrashInfo, std::ios::binary | std::ios::app);
        out << "restored=1\n";
        if (!location.empty())
            out << "location=" << location.string() << "\n";
    };
    if (info["kind"] == "project")
    {
        // Projeto: a pasta volta para onde estava (no mesmo disco)
        const fs::path from(info["location"]), to(info["origin"]);
        if (!fs::is_directory(from, ec))
        {
            errorMessage = "The disk with this project is not connected.";
            return false;
        }
        if (fs::exists(to, ec))
        {
            errorMessage = "There is already a folder named \"" + to.filename().string() + "\" in " + to.parent_path().string() + ".";
            return false;
        }
        fs::rename(from, to, ec);
        if (ec)
        {
            errorMessage = "Could not restore the project: " + ec.message();
            return false;
        }
        fs::remove(from.parent_path(), ec);  // a lixeira daquela pasta, se ficou vazia
        // Com itens na lixeira de dentro dele: fica na lista como restaurado até eles acabarem
        bool inner = false;
        for (const auto& d : fs::directory_iterator(to / kProjectTrash, ec))
            inner = inner || d.is_directory(ec);
        if (inner)
            keepAsRestored(to);
        else
            fs::remove_all(trash, ec);
        return true;
    }
    const std::string session = info["session"].empty() ? trash.filename().string() : info["session"];
    std::string origin = info["origin"];
    if (origin.empty())
    {
        origin = ReadTextFile(trash / kTrashOrigin);
        while (!origin.empty() && (origin.back() == '\n' || origin.back() == '\r')) origin.pop_back();
    }
    fs::path target = origin.empty() ? root / session : fs::path(origin);
    // A pasta de origem sumiu (Project fechado ou HD desligado): volta para a pasta de dados do app
    if (!fs::is_directory(target.parent_path(), ec))
        target = root / session;
    fs::create_directories(target, ec);
    for (const auto& entry : fs::directory_iterator(trash, ec))
    {
        const std::string name = entry.path().filename().string();
        if (name == kTrashOrigin || name == kTrashInfo)
            continue;
        if (name == kTrashEdited)
        {
            // As editadas voltam para <Project>/Edited/<sessão>/ (sem Project aberto: ficam no item)
            if (projectEdited.empty())
            {
                errorMessage = "Open the project to restore its edited photos.";
                return false;
            }
            const fs::path editedDir = projectEdited / session;
            fs::create_directories(editedDir, ec);
            for (const auto& f : fs::directory_iterator(entry.path(), ec))
            {
                std::error_code mec;
                if (!fs::exists(editedDir / f.path().filename(), mec))
                    MoveFile(f.path(), editedDir / f.path().filename(), mec);
            }
            continue;
        }
        const fs::path to = target / entry.path().filename();
        if (fs::exists(to, ec))
            continue;  // já existe na sessão (ex.: session.json): fica o de lá
        std::error_code mec;
        if (entry.is_directory())
        {
            fs::rename(entry.path(), to, mec);
            if (mec) { mec.clear(); fs::copy(entry.path(), to, fs::copy_options::recursive, mec); }
        }
        else
            MoveFile(entry.path(), to, mec);
        if (mec)
        {
            errorMessage = "Could not restore " + name + ": " + mec.message();
            return false;
        }
        if (restored && !entry.is_directory(ec) && name.rfind('.', 0) != 0 && name != "session.json")
            restored->push_back(name);
    }
    // Sessão inteira com fotos dela apagadas antes, ainda na lixeira: fica como restaurada até elas acabarem
    bool dependents = false;
    if (info["kind"] != "photos" && info["kind"] != "edits")
    {
        long long myOrder = 0;
        try { myOrder = std::stoll(info["order"]); } catch (...) {}
        for (const auto& d : fs::directory_iterator(trash.parent_path(), ec))
        {
            if (d.path() == trash || !d.is_directory(ec))
                continue;
            auto o = ReadTrashInfo(d.path());
            long long order = 0;
            try { order = std::stoll(o["order"]); } catch (...) {}
            if (o["session"] == session && (o["kind"] == "photos" || o["kind"] == "edits") && o["restored"] != "1" && order < myOrder)
                dependents = true;
        }
    }
    if (dependents)
        keepAsRestored(fs::path());
    else
        fs::remove_all(trash, ec);
    fs::remove_all(target / kPreviewFolder, ec);  // prévias podem estar com nomes antigos
    return true;
}

bool PhotoStore::Restore(const std::string& session, std::string& errorMessage) const
{
    // O Desfazer: o item mais recente desta sessão (nas duas lixeiras)
    const fs::path projectTrash = projectRoot.empty() ? fs::path() : projectRoot.parent_path() / kProjectTrash;
    const TrashEntry* best = nullptr;
    auto all = TrashEntries(root / kTrashFolder, projectTrash);
    for (auto& e : all)
        if (e.info["session"] == session && e.info["restored"] != "1" && (!best || e.order > best->order))
            best = &e;
    if (session.empty() || !best)
    {
        errorMessage = "Nothing to restore for this session.";
        return false;
    }
    return RestoreEntry(best->path, errorMessage);
}

static fs::path TrashPathFromId(const std::string& id, const fs::path& appTrash, const fs::path& projectTrash)
{
    const auto slash = id.find('/');
    if (slash == std::string::npos)
        return {};
    const std::string where = id.substr(0, slash), name = id.substr(slash + 1);
    if (name.empty() || (where != "nested" && name.find_first_of("/\\") != std::string::npos) || name == "." || name == "..")
        return {};
    if (where == "nested")
    {
        // "nested/<item do projeto>/<item de dentro>": dentro da lixeira da pasta do projeto apagado
        const auto slash2 = name.find('/');
        if (slash2 == std::string::npos)
            return {};
        const std::string pointer = name.substr(0, slash2), inner = name.substr(slash2 + 1);
        if (pointer.empty() || inner.empty() || inner.find_first_of("/\\") != std::string::npos || pointer == ".." || inner == "..")
            return {};
        auto info = ReadTrashInfo(appTrash / pointer);
        if (info["kind"] != "project")
            return {};
        return fs::path(info["location"]) / kProjectTrash / inner;
    }
    if (where == "app")
        return appTrash / name;
    if (where == "project" && !projectTrash.empty())
        return projectTrash / name;
    return {};
}

bool PhotoStore::RestoreTrashItem(const std::string& id, std::string& errorMessage, std::vector<std::string>* restored) const
{
    if (id.rfind("nested/", 0) == 0)
    {
        const auto a = id.find('/', 7);
        const std::string pointer = a == std::string::npos ? std::string() : id.substr(7, a - 7);
        if (pointer.empty() || ReadTrashInfo(root / kTrashFolder / pointer)["restored"] != "1")
        {
            errorMessage = "This item is inside a deleted project. Restore the project first.";
            return false;
        }
    }
    const fs::path projectTrash = projectRoot.empty() ? fs::path() : projectRoot.parent_path() / kProjectTrash;
    const fs::path entry = TrashPathFromId(id, root / kTrashFolder, projectTrash);
    std::error_code ec;
    if (entry.empty() || !fs::is_directory(entry, ec))
    {
        errorMessage = "This item is no longer in the trash.";
        return false;
    }
    return RestoreEntry(entry, errorMessage, restored);
}

// Apaga de vez um item; um projeto só com o disco dele ligado (senão o item fica, para depois)
static bool RemoveTrashEntry(const fs::path& entry)
{
    std::error_code ec;
    auto info = ReadTrashInfo(entry);
    if (info["kind"] == "project" && info["restored"] != "1")  // restaurado: a pasta é o projeto de volta, nunca apagar
    {
        const fs::path location(info["location"]);
        if (!fs::is_directory(location, ec))
            return false;
        fs::remove_all(location, ec);
        if (ec)
            return false;
        fs::remove(location.parent_path(), ec);  // a lixeira daquela pasta, se ficou vazia
    }
    fs::remove_all(entry, ec);
    return !ec;
}

bool PhotoStore::DeleteTrashItem(const std::string& id) const
{
    const fs::path projectTrash = projectRoot.empty() ? fs::path() : projectRoot.parent_path() / kProjectTrash;
    const fs::path entry = TrashPathFromId(id, root / kTrashFolder, projectTrash);
    std::error_code ec;
    if (entry.empty() || !fs::is_directory(entry, ec))
        return false;
    return RemoveTrashEntry(entry);
}

std::string PhotoStore::TrashProject(const fs::path& folder, const std::string& name, int sessions,
                                     std::string& errorMessage) const
{
    std::error_code ec;
    if (!fs::is_directory(folder, ec))
    {
        errorMessage = "The project folder is not reachable.";
        return {};
    }
    const unsigned long long bytes = FolderBytes(folder);
    // Um "restaurado" antigo deste projeto dá lugar ao item novo
    for (const auto& d : fs::directory_iterator(root / kTrashFolder, ec))
    {
        auto o = ReadTrashInfo(d.path());
        if (o["restored"] == "1" && o["kind"] == "project" && fs::path(o["origin"]) == folder)
            fs::remove_all(d.path(), ec);
    }
    ec.clear();
    // Na mesma pasta de cima (mesmo disco): mover é instantâneo e não ocupa espaço no computador
    const fs::path base = folder.parent_path() / kProjectTrash;
    fs::create_directories(base, ec);
    const std::string stem = std::to_string(NowSeconds()) + "-" + folder.filename().string();
    fs::path location = base / stem;
    for (int n = 2; fs::exists(location, ec); ++n)
        location = base / (stem + "-" + std::to_string(n));
    fs::rename(folder, location, ec);
    if (ec)
    {
        errorMessage = "Could not move the project to the trash: " + ec.message();
        fs::remove(base, ec);
        return {};
    }
    // Na lixeira do app, só o lugar (para listar, restaurar e apagar depois)
    fs::create_directories(root / kTrashFolder, ec);
    fs::path pointer = root / kTrashFolder / ("project-" + stem);
    for (int n = 2; fs::exists(pointer, ec); ++n)
        pointer = root / kTrashFolder / ("project-" + stem + "-" + std::to_string(n));
    fs::create_directories(pointer, ec);
    WriteTrashInfo(pointer, name, true, folder, NowSeconds());
    {
        std::ofstream out(pointer / kTrashInfo, std::ios::binary | std::ios::app);
        out << "kind=project\n" << "location=" << location.string() << "\n" << "bytes=" << bytes << "\n" << "sessions=" << sessions << "\n";
    }
    return "app/" + pointer.filename().string();
}

void PhotoStore::PurgeTrash(int days) const
{
    const fs::path projectTrash = projectRoot.empty() ? fs::path() : projectRoot.parent_path() / kProjectTrash;
    const long long limit = NowSeconds() - static_cast<long long>(days) * 24 * 3600;
    std::error_code ec;
    for (const auto& e : TrashEntries(root / kTrashFolder, projectTrash))
        if (e.deletedAt < limit)
            RemoveTrashEntry(e.path);  // projeto com o disco desligado: fica para quando ele voltar
    (void)ec;
}

void PhotoStore::EmptyTrash() const
{
    std::error_code ec;
    for (const auto& d : fs::directory_iterator(root / kTrashFolder, ec))
        if (d.is_directory(ec))
            RemoveTrashEntry(d.path());  // projeto com o disco desligado: fica
    if (!projectRoot.empty())
        fs::remove_all(projectRoot.parent_path() / kProjectTrash, ec);
}

// As limpezas automáticas só mexem na pasta de dados; o Project é da pessoa
void PhotoStore::DeleteAll() const
{
    std::error_code ec;
    for (const auto& session : ListSessions())
        if (!session.inProject)
            fs::remove_all(root / session.name, ec);
}

void PhotoStore::DeleteSaved() const
{
    std::error_code ec;
    for (const auto& session : ListSessions())
        if (session.saved && !session.inProject)
            fs::remove_all(root / session.name, ec);
}

void PhotoStore::DeleteUnsaved() const
{
    std::error_code ec;
    for (const auto& session : ListSessions())
        if (!session.saved && !session.inProject)
            fs::remove_all(root / session.name, ec);
}

std::string Base64Encode(const std::string& data)
{
    static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve((data.size() + 2) / 3 * 4);
    size_t i = 0;
    for (; i + 2 < data.size(); i += 3)
    {
        const unsigned n = (static_cast<unsigned char>(data[i]) << 16) | (static_cast<unsigned char>(data[i + 1]) << 8) | static_cast<unsigned char>(data[i + 2]);
        out += table[(n >> 18) & 63];
        out += table[(n >> 12) & 63];
        out += table[(n >> 6) & 63];
        out += table[n & 63];
    }
    if (i < data.size())
    {
        unsigned n = static_cast<unsigned char>(data[i]) << 16;
        if (i + 1 < data.size())
            n |= static_cast<unsigned char>(data[i + 1]) << 8;
        out += table[(n >> 18) & 63];
        out += table[(n >> 12) & 63];
        out += (i + 1 < data.size()) ? table[(n >> 6) & 63] : '=';
        out += '=';
    }
    return out;
}
