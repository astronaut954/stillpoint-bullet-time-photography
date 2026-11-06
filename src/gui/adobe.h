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
    // <Mesa>/Stillpoint Template/Stillpoint Template.lrcat (o New Catalog cria a pasta com o nome)
    std::filesystem::path DesktopTemplate(const std::filesystem::path& desktop);
    bool SaveTemplate(const std::filesystem::path& catalog, const std::string& lightroomVersion, std::string& error);
    // Cria o catálogo do projeto a partir do modelo (não sobrescreve um que já exista)
    bool MakeCatalogFromTemplate(const std::filesystem::path& target, std::string& error);

    // Sessão -> catálogo onde a coleção dela está ("" = não anotado)
    std::map<std::string, std::string> CollectionCatalogs();
    // Mesmo catálogo? (no Windows, sem diferença de maiúsculas e barras)
    bool SameCatalog(const std::string& a, const std::string& b);

    struct Alive
    {
        bool fresh = false;    // o plugin escreveu há menos de 5 s
        std::string catalog;   // catálogo aberto
        std::string version;   // versão do plugin que está rodando
    };
    Alive ReadAlive();
}
