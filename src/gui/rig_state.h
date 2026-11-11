#pragma once

// O estado do rig guardado por Project (pedido do dono, 2026-11-11): o painel Bullet time, a ordem das câmeras e as
// configurações de cada câmera. Fica em <Project>/stillpoint-rig.json (um arquivo só dele, para não disputar o índice
// do Project com a thread da janela).
//
// Decisões do dono (2026-11-11):
//  - entra tudo: painel, ordem e configurações das câmeras;
//  - ao abrir um Project com câmeras diferentes do que ele guardou, o Stillpoint lê as câmeras e PERGUNTA antes de
//    aplicar; sem diferença, não pergunta;
//  - câmera do Project que não está ligada, ou ligada que o Project não conhece: avisa, sem bloquear (a nova fica
//    como está);
//  - com o Project aberto, cada mudança vai para ele na hora, item por item;
//  - "Keep the cameras as they are": o Project não muda; só o que for alterado depois é gravado;
//  - sem Project: padrão de fábrica, nada é guardado, e fechar um Project não mexe nas câmeras;
//  - ordem: as câmeras conhecidas na ordem guardada, sem buraco; as novas no fim; a que falta volta ao lugar dela
//    quando for ligada.

#include <filesystem>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

struct CameraSettings;

namespace Rig
{
    struct Value
    {
        long long value = 0;
        std::string label;       // como a pessoa vê ("1/200", "Daylight")
        bool settable = true;    // dá para mudar agora pelo app (só vale na leitura; não é guardado)
    };
    // Uma câmera, pelo número de série
    struct Camera
    {
        std::string serial, name, model;      // name: como aparece no app (SL3_1)
        int order = 0;                         // a posição dela (na leitura: a de agora; no guardado: a do Project)
        std::map<std::string, Value> settings; // "iso", "tv", ... (as chaves de CameraSetting, mais kelvin, shiftab...)
    };
    struct State
    {
        std::string panel;                 // JSON da página: Countdown, Sessions, Download wait e Timing
        std::vector<std::string> order;    // números de série, na ordem do Project (inclui as que não estão ligadas)
        std::map<std::string, Camera> cameras;
    };
    State Load(const std::filesystem::path& file);
    bool Save(const std::filesystem::path& file, const State& state);
    std::filesystem::path FileIn(const std::filesystem::path& projectRoot);

    // A leitura de uma câmera ligada, no formato daqui
    Camera Read(const CameraSettings& settings, const std::string& serial, int order);
    // As chaves, na ordem em que são aplicadas (o balanço de branco antes da temperatura; o Picture Style antes dos
    // ajustes dele)
    const std::vector<std::string>& Keys();
    std::string KeyName(const std::string& key);  // "White balance", como na tela Camera settings

    // O que já foi resolvido desde que o Project foi aberto
    struct Memory
    {
        std::set<std::string> seen;                                        // câmeras já conferidas
        std::map<std::pair<std::string, std::string>, long long> kept;     // (série, chave) → o valor que ficou na câmera
        std::string reported;                                              // o último recado "o rig não é o mesmo"
        void Clear() { seen.clear(); kept.clear(); reported.clear(); }
    };
    struct Diff
    {
        std::string serial, name, model, key;
        int order = 0;
        Value now, want;   // na câmera agora / no Project
    };
    struct Check
    {
        std::vector<Diff> diffs;       // só de câmeras ainda não conferidas
        std::vector<Camera> missing;   // no Project, não ligadas
        std::vector<Camera> fresh;     // ligadas, o Project não conhece
        int differing = 0;             // câmeras com alguma diferença
        int connected = 0;
    };
    Check Compare(const State& state, const std::vector<Camera>& now, const Memory& memory);
    // "Keep the cameras as they are": as diferenças ficam (o Project não muda) e as câmeras passam a conferidas
    void Keep(Memory& memory, const Check& check, const std::vector<Camera>& now);
    // Depois de uma leitura: grava no Project o que mudou nas câmeras já conferidas e, com addNew, as câmeras que ele
    // não conhecia, inteiras (só na conferência, que é quem avisa da câmera nova). true se o estado mudou.
    bool Absorb(State& state, const std::vector<Camera>& now, Memory& memory, bool addNew = true);

    // A ordem a pôr nas câmeras ligadas: as conhecidas na ordem guardada, as novas no fim (na ordem em que estão)
    std::vector<std::string> OrderFor(const State& state, const std::vector<std::string>& connectedNow);
    // A ordem a guardar: a de agora, com as câmeras do Project que não estão ligadas mantidas no lugar delas
    std::vector<std::string> MergeOrder(const std::vector<std::string>& saved, const std::vector<std::string>& connectedNow);
}
