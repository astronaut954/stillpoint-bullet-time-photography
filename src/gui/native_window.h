#pragma once

// Recursos da janela que dependem do sistema (Windows / Mac).

#include <functional>
#include <string>
#include <vector>

namespace NativeWindow
{
    // Abre o seletor de pastas do sistema, começando em startFolder (se existir).
    // Retorna "" se a pessoa cancelar. Chamar na thread da janela.
    std::string ChooseFolder(const std::string& prompt, const std::string& startFolder = "");
    // Escolher um programa (etapa 20, "Locate…" do Lightroom/Photoshop): um .app no Mac, um .exe no Windows.
    // Devolve o caminho, ou vazio se a pessoa cancelou.
    std::string ChooseApplication(const std::string& prompt, const std::string& startFolder = "");
    // Pasta da Mesa (Desktop) da pessoa (no Windows, a de verdade, mesmo se o OneDrive a mudou de lugar)
    std::string DesktopFolder();
    // Manda um arquivo ou pasta para o Lixo do sistema (Mac) / Lixeira (Windows). true = foi.
    bool MoveToSystemTrash(const std::string& path);
    // Traz para a frente um programa que já está aberto (Mac: o .app; o Stillpoint cede a vez para ele). false = não
    // estava aberto ou o sistema não deixou. Windows: não faz nada (o Windows já traz o programa aberto pelo arquivo).
    bool ActivateApplication(const std::string& appPath);

    // Antes de a janela fechar, pergunta a canClose(): se devolver false, a janela
    // continua aberta (a página mostra a confirmação e encerra depois). Vale por
    // janela: pode ser instalado na principal e nas janelas Live.
    void InstallCloseGuard(void* nativeWindow, std::function<bool()> canClose);

    // Mac: menu do app na barra de cima (Stillpoint, Edit, View, Window, Help).
    // Os itens do próprio app chamam onItem com "about", "updates", "settings", "help",
    // "cameras", "whatsnew" ou "report"; Quit passa pelo mesmo aviso do botão de fechar.
    // Windows: não faz nada (o menu fica num botão dentro da página).
    void InstallAppMenu(void* nativeWindow, std::function<void(const std::string&)> onItem);

    // ---- Janelas Live (segunda janela: tela cheia num monitor ou flutuante) ----

    struct Screen
    {
        std::string name;   // nome para mostrar ("Built-in Display", "LG TV", "Display 2")
        bool primary = false;
    };
    // Monitores ligados agora, na ordem do sistema (o principal costuma ser o primeiro).
    std::vector<Screen> Screens();

    // Mostra de novo uma janela escondida (e traz para a frente) / esconde sem fechar.
    void Show(void* nativeWindow);
    void Hide(void* nativeWindow);

    // Tela cheia no monitor com esse nome (sem borda, cobrindo o monitor inteiro, por cima
    // da barra de menus e da barra de tarefas). Nome desconhecido: usa o monitor em que a
    // janela está. Retorna false se não deu.
    bool SetFullScreen(void* nativeWindow, const std::string& screenName);

    // Volta a ser uma janela normal (borda, botões, tamanho livre), sempre à frente ou não.
    void SetWindowed(void* nativeWindow, bool alwaysOnTop);

    // "Identify": um número grande (1, 2, …, na ordem de Screens()) em cada monitor por
    // alguns segundos, como nas configurações de vídeo do sistema.
    void IdentifyScreens(int seconds);

    // Cmd+` (Mac): passa para a próxima janela visível do app (principal, Live, Live 2),
    // inclusive as que estão em tela cheia; backwards = na ordem contrária (Cmd+Shift+`).
    // Windows: não faz nada.
    void CycleWindows(bool backwards);

    // Põe a janela um pouco para a direita e para baixo de outra (dx, dy em pontos), para ficar
    // claro que é uma janela nova ("Another window" da Live). Não faz nada se a outra estiver em
    // tela cheia.
    void PlaceNear(void* nativeWindow, void* reference, int dx, int dy);
}
