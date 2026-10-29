#pragma once

// Project (etapa 17): uma pasta escolhida pela pessoa que guarda sessões sem sair do app.
//   <pasta>/stillpoint-project.json  — identifica a pasta; nome, sessões (índice), padrões de export
//   <pasta>/Originals/<sessão>/      — fotos como a câmera mandou + session.json (+ .xmp do Lightroom)
//   <pasta>/Edited/<sessão>/         — versões editadas (o app só lê)
//   <pasta>/Exports/                 — o que o Stillpoint exporta (padrão)
// Desenho em docs/project.md.

#include <filesystem>
#include <string>
#include <vector>

class Project
{
public:
    static const char* const kIndexFile;  // "stillpoint-project.json"

    // A pasta é um Project? (tem o arquivo de índice)
    static bool IsProject(const std::filesystem::path& folder);

    // Cria o índice numa pasta (nova ou vazia de Project); o nome é o da pasta se vazio
    static bool Create(const std::filesystem::path& folder, const std::string& name, std::string& error);

    // Abre (lê o índice); false com a mensagem se a pasta não for um Project
    bool Open(const std::filesystem::path& folder, std::string& error);
    void Close();
    // Renomeia a pasta do Project (e o nome no índice). false com a mensagem se a pasta estiver
    // em uso por outro programa, já existir uma com esse nome etc.
    bool Rename(const std::string& newName, std::string& error);
    bool IsOpen() const { return !root.empty(); }

    const std::filesystem::path& Root() const { return root; }
    std::filesystem::path Originals() const { return root / "Originals"; }
    std::filesystem::path Edited() const { return root / "Edited"; }
    std::filesystem::path Exports() const { return root / "Exports"; }
    const std::string& Name() const { return name; }

    // Índice de sessões: refeito a partir das pastas em Originals/ (as pastas mandam)
    void SyncIndex(const std::vector<std::string>& sessionFolders);

    // Últimas configurações de export usadas no Project (JSON livre da página)
    std::string ExportDefaults() const { return exportDefaults; }
    void SetExportDefaults(const std::string& json);

    // A pasta ainda está acessível (HD externo ligado)?
    bool Available() const;

    // Tamanho ocupado (Originals + Edited + Exports), em bytes; -1 se não der
    long long SizeBytes() const;

private:
    bool Save() const;

    std::filesystem::path root;
    std::string name;
    std::string created;
    std::vector<std::pair<std::string, std::string>> sessions;  // pasta, quando entrou
    std::string exportDefaults;  // texto JSON (ou vazio)
};
