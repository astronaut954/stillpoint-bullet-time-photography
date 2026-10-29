#pragma once

// Fotos guardadas pelo app até a pessoa salvar (pasta de dados do app).
// Cada sessão de disparo é uma pasta; cada foto começa com a ordem e o nome
// da câmera, ex.: "02_T7_1_IMG_0001.JPG".

#include <filesystem>
#include <string>
#include <vector>

struct StoredPhoto
{
    std::string file;    // nome do arquivo
    int order = 0;       // posição da câmera na sequência (01, 02...)
    std::string camera;  // nome da câmera (T7_1...)
    bool previewable = true; // JPEG ou RAW (prévia embutida no arquivo)
};

struct StoredSession
{
    std::string name;    // nome da pasta (data/hora da sessão)
    std::vector<StoredPhoto> photos; // em ordem de câmera
    bool saved = false;  // já foi salva e a pessoa escolheu mantê-la no app
    int missing = 0;     // fotos que a câmera recusou no disparo (arquivo ".missing")
    // Project (etapa 17): sessão guardada em <Project>/Originals/ em vez da pasta de dados
    bool inProject = false;
    std::string label;   // rótulo opcional ("Pose 7"), em session.json
    int edited = 0;      // fotos com versão editada em <Project>/Edited/<sessão>/
    std::string timing;  // resumo do Timing usado ("Sweep · 0.2 s · 1 → 9"), em session.json
};

// Imagem RGB (3 bytes por pixel), já na orientação certa
struct RgbFrame
{
    std::vector<unsigned char> pixels;
    int width = 0;
    int height = 0;
};

// Decodifica uma foto (JPEG, ou RAW pela prévia JPEG que a câmera embute nele).
// jpegBytes (opcional) recebe esse JPEG de origem, com os dados EXIF da câmera.
bool LoadPhotoRgb(const std::filesystem::path& file, RgbFrame& out, std::string* jpegBytes = nullptr);

// Foto de teste (câmeras simuladas, STILLPOINT_FAKE_CAMERAS): JPEG com o número da
// câmera em destaque e o número da foto na sessão, numa cor por câmera.
bool WriteTestPhoto(const std::filesystem::path& file, int cameraNumber, int shotNumber);
bool IsRawPhoto(const std::string& file);
bool IsJpegPhoto(const std::string& file);

class PhotoStore
{
public:
    explicit PhotoStore(std::filesystem::path root);

    const std::filesystem::path& Root() const { return root; }

    // Project aberto: as sessões de <originals> também aparecem (inProject); <edited> é a
    // pasta das versões editadas. Caminhos vazios = sem Project.
    void SetProject(const std::filesystem::path& originals, const std::filesystem::path& edited);
    const std::filesystem::path& ProjectOriginals() const { return projectRoot; }
    const std::filesystem::path& ProjectEdited() const { return projectEdited; }
    // Pasta de uma sessão (na pasta de dados ou no Project); vazio se não existir
    std::filesystem::path SessionDir(const std::string& session) const;
    // Move uma sessão para dentro (toProject=true) ou para fora do Project. Mesmo disco:
    // renomeia; outro disco: copia e apaga. Retorna false com a mensagem de erro.
    bool MoveSession(const std::string& session, bool toProject, std::string& errorMessage) const;
    // session.json: rótulo e resumo do Timing (só para sessões no Project)
    bool SetLabel(const std::string& session, const std::string& label) const;
    bool WriteSessionInfo(const std::string& session, const std::string& jsonText) const;
    // Arquivo editado de uma foto (em Edited/<sessão>/, mesmo nome-base, o mais recente); vazio se não houver
    std::filesystem::path EditedFile(const std::string& session, const std::string& file) const;

    std::vector<StoredSession> ListSessions() const;
    int CountSessions() const;
    // Sessões ainda não salvas (as salvas e mantidas no app não contam)
    int CountUnsaved() const;
    // Marca a sessão como salva (arquivo ".saved" dentro da pasta dela)
    void MarkSaved(const std::string& session) const;

    // JPEG reduzido (lado maior = maxSize), com cache em disco. "" se não der.
    std::string Preview(const std::string& session, const std::string& file, int maxSize) const;

    // Move as sessões para a pasta escolhida: só as de "names" ou, se vazio, todas.
    // Retorna quantas foram movidas; em caso de erro, preenche errorMessage.
    int SaveSessions(const std::filesystem::path& destination, const std::vector<std::string>& names,
                     std::string& errorMessage,
                     std::vector<std::filesystem::path>* savedTo = nullptr) const;  // onde cada uma ficou

    bool DeleteSession(const std::string& session) const;

    // Apaga fotos de uma sessão. Cada item é um grupo "ordem_câmera" (ex.: "02_T7_1",
    // apaga o RAW e o JPEG dessa câmera) ou o nome de um arquivo. Se a sessão ficar
    // vazia, a pasta é apagada.
    // Lixeira do app (<dados>/.trash): apagar sessão ou fotos move para lá, para o Desfazer;
    // Restore(sessão) traz de volta (a pasta inteira, ou só as fotos se a sessão ainda existe).
    // EmptyTrash() apaga de vez (chamado ao abrir o app: o desfazer vale só na mesma abertura).
    bool Restore(const std::string& session, std::string& errorMessage) const;
    void EmptyTrash() const;
    bool DeletePhotos(const std::string& session, const std::vector<std::string>& groups,
                      std::string& errorMessage) const;

    // Nova ordem das fotos de uma sessão: lista de "ordem_câmera" na ordem desejada
    // (ex.: {"02_T7_1", "01_SL3_1"}). Renomeia os arquivos (02_T7_1_IMG.JPG ->
    // 01_T7_1_IMG.JPG), levando juntos o RAW e o JPEG da mesma câmera.
    bool ReorderSession(const std::string& session, const std::vector<std::string>& groups,
                        std::string& errorMessage) const;
    void DeleteAll() const;
    // Apaga só as sessões ainda não salvas
    void DeleteUnsaved() const;
    // Apaga as sessões já salvas que ficaram no app (ao fechar e ao abrir)
    void DeleteSaved() const;

private:
    std::filesystem::path SessionPath(const std::string& session) const;
    void ReadSessions(const std::filesystem::path& base, bool inProject, std::vector<StoredSession>& out) const;

    std::filesystem::path root;
    std::filesystem::path projectRoot;    // <Project>/Originals (vazio = sem Project)
    std::filesystem::path projectEdited;  // <Project>/Edited
};

std::string Base64Encode(const std::string& data);
