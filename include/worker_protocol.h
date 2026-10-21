#pragma once

// Conversa entre o app de janela (coordenador) e os processos trabalhadores
// (StillpointWorker, um por câmera; etapa 16). Linhas de texto pelos canais padrão do
// processo (o app escreve no stdin do trabalhador e lê o stdout dele). Cada linha é
// uma ordem ou um aviso: campos separados por TAB, sem quebras de linha dentro.
//
// Ordens (app -> trabalhador)
//   ping                                  responde "pong" (vigia)
//   name\t<nome>\t<posição>               nome da câmera no app (T7_1) e posição (01, 02...);
//                                         usados nas configurações e nos nomes dos arquivos
//   settings                              lê tudo -> "settings\t<texto de CameraSettingsText>"
//   set\t<chave>\t<valor>                 muda uma configuração -> "setresult\tok" ou "setresult\terr\t<motivo>"
//   identify                              aperta o obturador até a metade -> "identified"
//   shoot\t<t0 ms>\t<pasta>\t<nome>\t<nº:ms,nº:ms...>
//        dispara uma foto por item, em t0 (relógio do computador, ms desde 1970) + ms;
//        cada foto é gravada em <pasta>/<nº>_<nome>_<nome original>; responde, por item,
//        "fired\t<nº>\t<ok|err>\t<código>\t<instante ms>" e depois "photo\t<nº>\t<caminho>"
//        (ou "photofail\t<nº>\t<código>"); no fim, "shootdone"
//   cancel                                itens do plano que ainda não dispararam não disparam
//   quit                                  fecha a sessão e sai -> "bye"
//
// Avisos (trabalhador -> app)
//   hello\t<pid>                          o processo começou
//   trying\t<índice>\t<modelo>            vai tentar abrir essa câmera da lista do SDK
//   openfail\t<índice>\t<modelo>\t<código>   não abriu (0xC0 = já está com outro processo)
//   claimed\t<modelo>\t<série>\t<porta>\t<segundos>   abriu a sessão: é a câmera deste processo
//   none                                  nenhuma câmera livre no tempo pedido; o processo sai
//   lost\t<motivo>                        a câmera caiu (o processo sai em seguida)
//   log\t<texto>                          mensagem para o log do app
//   pong, settings, setresult, identified, fired, photo, photofail, shootdone, bye
//
// Parâmetros do trabalhador: StillpointWorker --wait <s> [--avoid <índices>] [--log <pasta>]
//   --wait: quantos segundos procurar uma câmera livre antes de responder "none"
//   --avoid: índices da lista do SDK que não deve tentar (ex.: "0,2"; entradas que travaram)
//   --log: pasta do log por câmera (worker-<série>.txt)

#include <string>
#include <vector>

namespace WorkerProtocol
{
    constexpr char kSeparator = '\t';

    inline std::vector<std::string> Split(const std::string& line)
    {
        std::vector<std::string> fields;
        std::string current;
        for (char c : line)
        {
            if (c == kSeparator) { fields.push_back(current); current.clear(); }
            else if (c != '\r' && c != '\n') current += c;
        }
        fields.push_back(current);
        return fields;
    }

    inline std::string Join(const std::vector<std::string>& fields)
    {
        std::string line;
        for (size_t i = 0; i < fields.size(); ++i)
        {
            if (i) line += kSeparator;
            for (char c : fields[i])
                line += (c == '\t' || c == '\n' || c == '\r') ? ' ' : c;
        }
        return line;
    }
}
