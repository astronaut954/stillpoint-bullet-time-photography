#pragma once

// Etapa 20: Lightroom Classic e Photoshop.
//
// Encontrar os programas no computador, instalar o plugin do Stillpoint no Lightroom Classic e conversar com
// ele por arquivos numa pasta do app (<pasta de dados>/lightroom):
//   request.txt  pedido do Stillpoint (linhas "nome=valor"; "photo=" se repete, uma por foto)
//   status.txt   resposta do plugin ao último pedido (id, state = working | done | error | wrong-catalog)
//   alive.txt    o plugin escreve a cada segundo enquanto o Lightroom está aberto (hora, catálogo aberto)
// O plugin acha essa pasta pelo arquivo bridge-path.txt, que o Stillpoint grava dentro do plugin ao instalar.

#include <filesystem>
#include <map>
#include <string>
#include <vector>

namespace Adobe
{
    enum class Program { Lightroom, Photoshop };

    struct Found
    {
        bool found = false;
        std::filesystem::path path;   // o .app (Mac) ou o .exe (Windows)
        std::string version;          // "15.6" (vazio se não deu para ler)
        bool custom = false;          // escolhido pela pessoa em "Locate…"
    };

    // Procura nos lugares de sempre; customPath (escolhido em "Locate…") vem primeiro quando ainda existe
    Found Find(Program program, const std::string& customPath);
    // O caminho escolhido em "Locate…" é desse programa? (pelo nome do .app/.exe)
    bool LooksLike(Program program, const std::filesystem::path& path);

    // Compara "15.6" com "11.0": negativo, zero ou positivo. Partes que faltam contam como 0.
    int CompareVersions(const std::string& a, const std::string& b);
    // Versão mínima do Lightroom Classic para o plugin (pendência do dono: confirmar com o Lightroom real)
    extern const char* const kMinimumLightroom;

    // Pasta de plugins que o Lightroom Classic carrega sozinho:
    // Mac ~/Library/Application Support/Adobe/Lightroom/Modules; Windows %APPDATA%\Adobe\Lightroom\Modules
    std::filesystem::path ModulesFolder();
    std::filesystem::path InstalledPlugin();       // <Modules>/Stillpoint.lrplugin
    std::string InstalledPluginVersion();          // "" = não instalado
    // Versão do plugin que vem com o app: a do app + um código dos arquivos do plugin ("2.17.0+1a2b3c4d").
    // Muda quando um arquivo do plugin muda, mesmo sem versão nova do app: o plugin instalado é trocado.
    std::string BundledPluginVersion(const std::filesystem::path& source, const std::string& appVersion);
    // Copia o plugin (assets/lightroom/Stillpoint.lrplugin) para a pasta de plugins, com a versão e o
    // caminho da pasta da conversa. Substitui o que estiver lá.
    bool InstallPlugin(const std::filesystem::path& source, const std::string& version, std::string& error);

    std::filesystem::path BridgeFolder();          // <pasta de dados>/lightroom

    struct Request
    {
        std::string id;
        std::string action = "edit";
        std::string project;   // nome do projeto ("" = sessão fora de projeto)
        std::string title;     // nome da coleção (a sessão, como aparece no Stillpoint)
        std::string catalog;   // catálogo esperado ("" = o que estiver aberto)
        std::filesystem::path focus;                // foto que fica ativa no Develop
        std::vector<std::filesystem::path> select;  // fotos selecionadas (a sessão inteira ou só a foto)
        std::vector<std::filesystem::path> photos;  // todas as fotos da sessão (entram na coleção)
        // Recorte do Export (decisão do dono, 2026-11-06, opção A): a proporção da sessão ("3:2"; "asshot" = sem
        // recorte) e, por foto, o retângulo que fica (0..1, na foto como ela aparece: esquerda, topo, direita, base).
        // O plugin aplica no recorte do Lightroom, para a pessoa editar já o quadro final.
        std::string framing;
        // angle != 0 (foto alinhada com giro): left/top e right/bottom são os cantos do retângulo girado, e width/height
        // o tamanho da foto em pixels (o plugin precisa dele para girar em pixels)
        struct Crop { std::filesystem::path photo; double left = 0, top = 0, right = 1, bottom = 1, angle = 0; int width = 0, height = 0; };
        std::vector<Crop> crops;
    };
    bool WriteRequest(const Request& request, std::string& error);
    // Tira o pedido (Cancel), se o plugin ainda não pegou
    void CancelRequest(const std::string& id);

    struct Status
    {
        std::string id;
        std::string state;     // working | done | error | wrong-catalog ("" = sem resposta a este pedido)
        std::string message;
        std::string catalog;   // catálogo aberto no Lightroom
        int added = 0;         // fotos novas no catálogo
    };
    Status ReadStatus(const std::string& id);

    // Coleção de cada sessão no Lightroom (collections.txt: sessão, projeto, coleção). Gravada quando o plugin
    // confirma; o "Done editing" da sessão pede para o plugin tirar essa coleção (arquivo done-<n>.txt).
    // catalog: o catálogo onde a coleção está ("" = qualquer um, o que estiver aberto)
    void RememberCollection(const std::string& session, const std::string& project, const std::string& title, const std::string& catalog);
    // Sem registro da coleção (sessão mandada antes de existir o registro): usa o projeto e o nome de agora
    bool QueueRemoveCollection(const std::string& session, const std::string& fallbackProject, const std::string& fallbackTitle,
                               const std::string& fallbackCatalog);

    // ---- Catálogo vazio ("Stillpoint Template"), criado uma vez pela pessoa no Lightroom Classic ----
    // A pessoa salva com File › New Catalog… na Mesa; o Stillpoint guarda uma cópia (só o .lrcat, e o -wal se
    // houver) em <pasta de dados>/lightroom/template, com a versão do Lightroom, e copia para cada projeto.
    struct TemplateInfo
    {
        bool has = false;
        std::string version;   // versão do Lightroom quando o modelo foi guardado
    };
    TemplateInfo Template();
    // O modelo é de outra versão principal do Lightroom (15 x 16)?
    bool TemplateOutdated(const TemplateInfo& info, const std::string& lightroomVersion);
    // <Mesa>/Template/Template.lrcat, sem diferença de maiúsculas (o New Catalog cria a pasta com o nome);
    // vazio se não achou
    std::filesystem::path DesktopTemplate(const std::filesystem::path& desktop);
    bool SaveTemplate(const std::filesystem::path& catalog, const std::string& lightroomVersion, std::string& error);
    // Cria o catálogo do projeto a partir do modelo (não sobrescreve um que já exista)
    bool MakeCatalogFromTemplate(const std::filesystem::path& target, std::string& error);

    // Delete edits (decisão do dono, 2026-11-06): as fotos voltam ao original também no Lightroom (reset-*.txt; o plugin
    // faz quando o catálogo da sessão estiver aberto). CancelReset tira o pedido que ainda não foi feito (o ⌘Z).
    bool QueueReset(const std::string& session, const std::vector<std::filesystem::path>& photos);
    // Recado para o plugin mostrar no Lightroom: editadas que chegaram na pasta Edited com outra proporção e não
    // foram usadas (decisão do dono, 2026-11-10). photos: os originais; numbers: "02" ou "02, 03"
    bool QueueNotice(const std::string& session, const std::string& title, const std::vector<std::filesystem::path>& photos,
                     const std::string& numbers, const std::string& have, const std::string& want);
    bool CancelReset(const std::string& session);
    // Pedidos ao plugin sobre fotos da coleção da sessão (feitos quando o catálogo dela estiver aberto):
    //   "bringback" a edição volta no Lightroom (o ⌘Z do Delete edits; o plugin guardou a edição antes do Reset)
    //   "remove"    as fotos apagadas no Stillpoint saem da coleção (o SDK não tira fotos do catálogo)
    //   "readd"     as fotos que voltaram da lixeira voltam para a coleção
    bool QueuePhotos(const std::string& kind, const std::string& session, const std::vector<std::filesystem::path>& photos);
    bool CancelQueued(const std::string& kind, const std::string& session);

    // Sessão -> catálogo onde a coleção dela está ("" = não anotado)
    std::map<std::string, std::string> CollectionCatalogs();
    // Mesmo catálogo? (no Windows, sem diferença de maiúsculas e barras)
    bool SameCatalog(const std::string& a, const std::string& b);

    struct Alive
    {
        bool fresh = false;    // o plugin escreveu há menos de 5 s
        long long time = 0;    // quando o plugin escreveu (segundos desde 1970)
        std::string catalog;   // catálogo aberto
        std::string version;   // versão do plugin que está rodando
        // Coleções do Stillpoint no catálogo aberto ("projeto", "coleção"); listsCollections = o plugin mandou a lista
        bool listsCollections = false;
        std::vector<std::pair<std::string, std::string>> collections;
        // Fotos (nomes de arquivo) de cada coleção, pela chave "projeto\tcoleção"
        std::map<std::string, std::vector<std::string>> members;
    };
    Alive ReadAlive();
    // Sessões que não estão "In Lightroom" no Stillpoint, mas cuja coleção existe no catálogo aberto (o ⌘Z do Lightroom
    // trouxe de volta uma coleção que o plugin tirou). Ignora as que têm a retirada ainda esperando (done-*.txt).
    std::vector<std::string> SessionsBackInCatalog(const Alive& alive, const std::vector<std::string>& editing);
    // Onde a coleção da sessão está anotada (collections.txt), e se ela está no catálogo aberto agora.
    // inCatalog: o Lightroom está nesse catálogo e mandou a lista; present: a coleção existe; files: as fotos dela
    struct CollectionNow { bool known = false, inCatalog = false, present = false, removalWaiting = false, membersKnown = false; std::vector<std::string> files; };
    CollectionNow CollectionState(const Alive& alive, const std::string& session);

    // Recados do plugin (pedaço 2), um arquivo por recado, lidos e apagados aqui:
    //   exported-*.txt  "Export to Stillpoint" terminou (session, project, count, failed, color)
    //   goto-*.txt      "Go to session in Stillpoint" (session)
    // Só os completos (com "end=1"); os pela metade ficam para a próxima vez.
    std::vector<std::multimap<std::string, std::string>> TakeMessages(const std::string& prefix);
    std::string MessageValue(const std::multimap<std::string, std::string>& message, const std::string& key);
}
