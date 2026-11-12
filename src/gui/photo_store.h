#pragma once

// Fotos guardadas pelo app até a pessoa salvar (pasta de dados do app).
// Cada sessão de disparo é uma pasta; cada foto começa com a ordem e o nome
// da câmera, ex.: "02_T7_1_IMG_0001.JPG".

#include <filesystem>
#include <map>
#include <string>
#include <vector>

struct StoredPhoto
{
    std::string file;    // nome do arquivo
    int order = 0;       // posição da câmera na sequência (01, 02...)
    std::string camera;  // nome da câmera (T7_1...)
    bool previewable = true; // JPEG ou RAW (prévia embutida no arquivo)
    bool edited = false;     // tem versão editada em <Project>/Edited/<sessão>/
    // Há um arquivo na pasta Edited com outra proporção (ex.: "3:2"): não é usado (decisão do dono, 2026-11-10);
    // refusedWant = a proporção da sessão (ex.: "1:1")
    std::string refused, refusedWant;
    // Aberta no Photoshop e ainda não salva (Edit in Photoshop, 2026-11-12): a cópia de trabalho está na pasta Edited,
    // mas só conta como editada depois do primeiro salvamento
    bool psOpen = false;
    // A editada foi salva pelo Photoshop (para o bloco Photoshop do Export dizer "edited in Photoshop")
    bool psEdited = false;
    bool psLr = false;      // editada do Photoshop feita em cima de uma editada do Lightroom
};

// Item da lixeira (etapa 20): uma sessão inteira ou fotos de uma sessão, guardadas por 15 dias.
// A lixeira do app fica na pasta de dados; a do Project, dentro da pasta do Project
// (<Project>/.stillpoint-trash), no mesmo disco das fotos.
struct TrashItem
{
    std::string id;          // "app/<pasta>" ou "project/<pasta>"
    std::string session;     // nome da sessão (data/hora)
    bool wholeSession = true; // a sessão inteira, ou só algumas fotos dela
    int photos = 0;          // fotos (RAW + JPG da mesma câmera contam como uma)
    unsigned long long bytes = 0;
    long long deletedAt = 0; // segundos desde 1970
    long long order = 0;     // ordem exata em que foi apagado (mais recente = maior)
    bool inProject = false;
    // Um projeto inteiro (a pasta foi para "<pasta de cima>/.stillpoint-trash", no mesmo disco; a lixeira
    // do app guarda só onde ela está). reachable = o disco está ligado (dá para restaurar ou apagar)
    bool isProject = false;
    bool reachable = true;
    int sessions = 0;
    // Item da lixeira de dentro de um projeto apagado: o id do projeto (vazio nos outros). Volta junto
    // com o projeto; o tamanho já conta no do projeto.
    std::string parent;
    // Já restaurado, mas fica na lista (sem botões) enquanto houver itens apagados antes que dependem dele
    // (fotos de uma sessão; o que estava na lixeira de um projeto). Sai sozinho quando eles acabam.
    bool restored = false;
    // Editadas (etapa 20): quantas foram junto (subpasta .edited); editsOnly = item do Delete edits (só editadas)
    int edits = 0;
    bool editsOnly = false;
    std::vector<std::string> psBases;  // editadas do item que vieram do Photoshop (nomes sem extensão)
    // Nomes-base das fotos do item (das editadas, no item do Delete edits): a lixeira põe a editada embaixo da foto
    std::vector<std::string> bases;
    // Nomes-base que têm editada no item (a lixeira mostra o selo LR na miniatura)
    std::vector<std::string> editBases;
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
    std::string crop;    // recorte escolhido para o Export ("3:2|0.5|0.5": proporção|posição x|posição y), em session.json
    std::string align;   // alinhamento das fotos para o Export ("arquivo:dx,dy,scale,rot;..."), em session.json (pedaço 2 do Framing)
    int edited = 0;      // fotos com versão editada em <Project>/Edited/<sessão>/
    bool showEdited = true; // usar as editadas nas prévias e no Export (a etiqueta "Edited n / m" liga e desliga), em session.json
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
// ratio: largura/altura da foto simulada (1.5 = 3:2, como as câmeras entregam por padrão)
bool WriteTestPhoto(const std::filesystem::path& file, int cameraNumber, int shotNumber, double ratio = 1.5);
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
    bool SetCrop(const std::string& session, const std::string& crop) const;  // Parte 4 da Proporção
    bool SetAlign(const std::string& session, const std::string& align) const;  // pedaço 2 do Framing
    // Alinhamento que veio do Lightroom Classic (o recorte ajustado lá; decisão do dono, 2026-11-10), no mesmo texto
    // do "align", em session.json ("alignLr"). Vale só para as fotos que têm editada: ListSessions já devolve o
    // "align" com ele por cima; sem a editada (Revert to original, ⌘Z) volta a valer o que era antes de a foto ir.
    std::string AlignLr(const std::string& session) const;
    bool SetAlignLr(const std::string& session, const std::string& align) const;
    // O canvas com que a sessão foi para o Lightroom ("largura,altura|proporção"): a conferência das editadas usa
    bool SetLrCanvas(const std::string& session, const std::string& canvas) const;
    // Muda quando entra ou sai arquivo de alguma pasta de Edited/ (para notar editadas salvas por fora do plugin)
    std::string EditedStamp() const;
    // Edit in Photoshop (decisão do dono, 2026-11-11): a cópia de trabalho de uma foto fica em Edited/<sessão>/ com o
    // nome final, e não conta como editada enquanto estiver como o Stillpoint a criou (mesma hora e tamanho). A lista
    // dessas cópias fica em session.json ("psPending": "arquivo|hora|tamanho[|w];...").
    // PsMark: anota o arquivo que acabou de ser aberto no Photoshop. watch = já era uma editada (abrir de novo): só é
    // vigiada, para saber quando o Photoshop a salvar. PsClear: tira a anotação (foi salva, sumiu, ou a pessoa cancelou).
    // PsPending: os arquivos anotados e como estão agora.
    struct PsEntry { bool watch = false; bool unchanged = true; };
    bool PsMark(const std::string& session, const std::filesystem::path& copy, bool watch = false) const;
    bool PsClear(const std::string& session, const std::string& copyName) const;
    std::map<std::string, PsEntry> PsPending(const std::string& session) const;
    // Fotos (nome-base) cuja editada foi salva pelo Photoshop ("psEdited" em session.json). on = false: deixa de ser
    // (a editada foi trocada pelo Lightroom, ou saiu).
    // fromLightroom: o Photoshop salvou por cima de uma editada que veio do Lightroom ("psLr").
    bool SetPsEdited(const std::string& session, const std::string& base, bool on, bool fromLightroom = false) const;
    bool WriteSessionInfo(const std::string& session, const std::string& jsonText) const;
    // Arquivo editado de uma foto (em Edited/<sessão>/, mesmo nome-base, o mais recente); vazio se não houver
    std::filesystem::path EditedFile(const std::string& session, const std::string& file) const;
    // Todas as editadas de uma foto (todos os formatos), para apagar
    std::vector<std::filesystem::path> EditedFiles(const std::string& session, const std::string& file) const;
    // Etiqueta "Edited n / m" ligada (prévias e Export usam as editadas) ou desligada (os originais); em session.json
    bool ShowEdited(const std::string& session) const;
    bool SetShowEdited(const std::string& session, bool show) const;

    std::vector<StoredSession> ListSessions() const;
    int CountSessions() const;
    // Sessões ainda não salvas (as salvas e mantidas no app não contam)
    int CountUnsaved() const;
    // Marca a sessão como salva (arquivo ".saved" dentro da pasta dela)
    void MarkSaved(const std::string& session) const;

    // JPEG reduzido (lado maior = maxSize), com cache em disco. "" se não der.
    // original: sempre a foto original, mesmo com as editadas ligadas (o Framing e o alinhamento do Export são
    // escolhidos em cima da original)
    std::string Preview(const std::string& session, const std::string& file, int maxSize, bool original = false) const;

    // Move as sessões para a pasta escolhida: só as de "names" ou, se vazio, todas.
    // Retorna quantas foram movidas; em caso de erro, preenche errorMessage.
    int SaveSessions(const std::filesystem::path& destination, const std::vector<std::string>& names,
                     std::string& errorMessage,
                     std::vector<std::filesystem::path>* savedTo = nullptr) const;  // onde cada uma ficou

    bool DeleteSession(const std::string& session) const;

    // Apaga fotos de uma sessão. Cada item é um grupo "ordem_câmera" (ex.: "02_T7_1",
    // apaga o RAW e o JPEG dessa câmera) ou o nome de um arquivo. Se a sessão ficar
    // vazia, a pasta é apagada.
    // Lixeira (etapa 20): apagar sessão ou fotos move para lá (a do app ou a do Project, conforme
    // onde a sessão estava), cada vez num item próprio. Restore(sessão) traz de volta o item mais
    // recente dessa sessão (o Desfazer); RestoreTrashItem/DeleteTrashItem agem num item da janela
    // Trash. PurgeTrash(dias) apaga de vez o que passou do prazo; EmptyTrash() apaga tudo (a do
    // app e a do Project aberto).
    // after >= 0 (o Desfazer de uma ação; decisão do dono, 2026-11-10): o primeiro item dessa sessão apagado depois
    // dessa ordem, que é o que aquela ação criou, e não o mais recente da sessão
    bool Restore(const std::string& session, std::string& errorMessage, std::vector<std::string>* restored = nullptr,
                 long long after = -1) const;
    void EmptyTrash() const;
    void PurgeTrash(int days) const;
    std::vector<TrashItem> ListTrash() const;
    // restored (opcional): os arquivos de foto que voltaram (para o Desfazer apagar de novo)
    bool RestoreTrashItem(const std::string& id, std::string& errorMessage,
                          std::vector<std::string>* restored = nullptr) const;
    bool DeleteTrashItem(const std::string& id) const;
    // Miniatura (JPEG) de uma foto de um item da lixeira, pelo nome-base; edited = a editada do Lightroom (.edited)
    std::string TrashThumb(const std::string& id, const std::string& base, bool edited, int maxSize) const;
    // Manda um projeto inteiro para a lixeira (a pasta é movida no mesmo disco). Devolve o id do item
    // ("" se não deu, com a mensagem em errorMessage). O projeto já deve estar fechado.
    std::string TrashProject(const std::filesystem::path& folder, const std::string& name, int sessions,
                             std::string& errorMessage) const;
    // Apaga uma sessão de vez, sem passar pela lixeira (ex.: já salva em outro lugar ao fechar)
    bool DeleteSessionNow(const std::string& session) const;
    bool DeletePhotos(const std::string& session, const std::vector<std::string>& groups,
                      std::string& errorMessage) const;
    // Delete edits: as editadas dessas fotos (nomes de arquivo) vão para a lixeira, num item só delas.
    // Devolve quantos arquivos foram.
    int TrashEdits(const std::string& session, const std::vector<std::string>& files, std::string& errorMessage) const;

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
    // Lixeira de quem é a pasta (a do Project, se a pasta estiver no Project; senão a do app)
    std::filesystem::path TrashRootFor(const std::filesystem::path& dir) const;
    std::filesystem::path NewTrashEntry(const std::filesystem::path& dir, const std::string& session,
                                        bool wholeSession) const;
    bool RestoreEntry(const std::filesystem::path& entry, std::string& errorMessage,
                      std::vector<std::string>* restored = nullptr) const;
    void ReadSessions(const std::filesystem::path& base, bool inProject, std::vector<StoredSession>& out) const;

    std::filesystem::path root;
    std::filesystem::path EditedFilePick(const std::string& session, const std::string& file) const;
    std::string RefusedLabel(const std::string& session, const std::filesystem::path& edited, std::string* want) const;
    std::filesystem::path projectRoot;    // <Project>/Originals (vazio = sem Project)
    std::filesystem::path projectEdited;  // <Project>/Edited
};

std::string Base64Encode(const std::string& data);
