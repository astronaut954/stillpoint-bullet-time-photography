# Checklist de teste manual

Rodar com **pelo menos 2 câmeras** conectadas por USB, ligadas, com cartão.
Anotar o sistema (Windows/Mac), a versão/branch testada e os modelos de câmera.

## 1. Abertura
- [ ] O app abre sem erro de SDK ("Failed to initialize SDK" **não** aparece).
- [ ] Mostra a pasta de saída padrão (Downloads do usuário).
- [ ] As câmeras conectadas são detectadas automaticamente.

## 2. Câmeras (opções 1, 2 e 5)
- [ ] **1 – List Cameras** mostra todas as câmeras com nome e prefixo.
- [ ] **2 – Detect Cameras**: desconectar uma câmera, rodar de novo, ela some;
      reconectar, rodar de novo, ela volta.
- [ ] **5 – Reorder Cameras**: `test` dispara só a câmera atual.
- [ ] **5 – Reorder Cameras**: mudar o prefixo de uma câmera e confirmar a nova
      ordem na opção 1.

## 3. Pasta de saída (opção 4)
- [ ] Trocar para outra pasta; a nova pasta é usada no disparo seguinte.
- [ ] Enter sem digitar mantém a pasta atual.

## 4. BULLET TIME (opção 3)
- [ ] Timer de contagem com áudio (contagem + "it's bullet time").
- [ ] Todas as câmeras disparam juntas.
- [ ] Contador de download chega a `[N/N]` sem "Timeout reached".
- [ ] Na pasta de saída: uma pasta com data/hora, com **uma foto por câmera**,
      nomes começando pelo prefixo de ordem de cada câmera.
- [ ] Com **2 ou mais sessões** (`c` para configurar): uma pasta por sessão
      (`..._session_01`, `..._session_02`), todas completas.

## 5. Falha controlada
- [ ] Desconectar uma câmera e disparar: o app avisa a câmera perdida e não trava.

## 6. Saída
- [ ] **0 – Exit** fecha o app normalmente.

## 7. App com janela (Stillpoint)
- [ ] Abrir o app **com as câmeras já ligadas**: as câmeras conectam uma de cada
      vez; a que está esperando aparece como "Waiting for another camera", a que
      conecta mostra os segundos. O modelo aparece em destaque e o apelido (T7_1) embaixo.
- [ ] Enquanto uma câmera conecta, o disparo fica indisponível com o aviso
      "Available when … finishes connecting".
- [ ] Fechar o app enquanto uma câmera conecta: fecha na hora, sem travar.
- [ ] Abrir o app e **depois** ligar as câmeras: elas aparecem sozinhas.
- [ ] Sem nenhuma câmera: depois de alguns segundos aparece o guia "No cameras found".
- [ ] Desligar uma câmera: ela fica "Disconnected"; religar: volta conectada no
      mesmo lugar (mesmo nome e ordem), sem clicar em nada.
- [ ] Disparar depois de religar uma câmera: a foto dela também chega.
- [ ] **Restart camera connections** (no painel Activity, no rodapé): todas reconectam.
- [ ] **Reorder by photo**: tira uma foto de cada câmera (sem som e sem criar
      sessão); arrastar as miniaturas (ou "Move earlier/later") e **Save order**
      muda a ordem; o próximo disparo usa a nova ordem nos nomes dos arquivos.
- [ ] Sessões na tela principal: pastas à esquerda, a mais recente selecionada;
      carrossel no alto e a foto selecionada grande embaixo; setas ← → e espaço (play).
- [ ] **Reorder** numa sessão (na tela cheia): arrastar as miniaturas (ou usar as setas) e **Save
      order** renomeia as fotos da sessão na nova ordem (RAW e JPEG juntos).
- [ ] Fora da tela cheia, a sessão mostra só as fotos e, ao lado das miniaturas,
      "Delete session" e o botão de tela cheia (sem título nem quantidade de fotos).
- [ ] Sessão em **tela cheia** (botão sobre a foto ou tecla F; Esc sai): data da sessão,
      play/pausa, setas, **Reorder**, apagar uma foto (lixeira ou tecla Delete) e apagar a sessão.
- [ ] Rodapé (Activity): enquanto algo acontece (conectando, disparando, recebendo
      fotos, salvando), o texto aparece com reticências animadas.
- [ ] Desligar a T7 e depois desligar/religar a SL3: a SL3 volta sozinha e o app
      continua fechando normalmente; religar a T7: ela volta no mesmo lugar.
- [ ] Fotos em **RAW** (e RAW+JPEG): aparecem nas sessões.
- [ ] Fechar com sessões não salvas: pergunta se quer salvar ou apagar.
- [ ] Textos sem emojis em toda a janela (o terminal continua igual).
- [ ] Visual: estrutura do Nocturne (trilho verde à esquerda dos painéis, fontes
      Rajdhani e JetBrains Mono) com as cores do Neo Terminal (preto, verde, âmbar em
      andamento, vermelho para apagar). Sem seletor de temas no topo.
- [ ] Cantos retos em painéis, janelas, botões e etiquetas (nenhum canto cortado).
- [ ] "Save sessions" com mais de uma sessão: abre a lista com todas marcadas;
      "Select all" e "Unselect all" funcionam; sem nenhuma marcada não dá para salvar.
- [ ] Salvar só algumas: pergunta se quer apagar as não marcadas. "Delete them" apaga
      só depois de salvar as escolhidas; "Keep them" deixa as outras no app.
- [ ] Com uma sessão só: "Save sessions" vai direto para a escolha da pasta.
- [ ] Foto grande: abaixo do nome da câmera aparece o nome do arquivo com a extensão
      (com RAW+JPEG, os dois nomes).
- [ ] Mac: fechar o app várias vezes (com câmeras ligadas) sem aparecer relatório de erro.
- [ ] Câmera conectando há mais de 60 s: aparece o aviso com "Restart app"; o botão
      fecha e abre o app de novo, e as sessões não salvas continuam lá.
      Para testar o botão sem câmera presa: abrir o app com a variável STILLPOINT_TEST_RESTART=1
      (Windows/PowerShell: `$env:STILLPOINT_TEST_RESTART=1` antes de abrir; Mac: `STILLPOINT_TEST_RESTART=1 "./..."`).
- [ ] Enquanto uma câmera conecta, "Restart camera connections" fica desativado.
- [ ] Ícone (câmera com o projétil na lente): Windows — nos dois `.exe` no Explorer, na
      barra de título e na barra de tarefas do app de janela. Mac — no `.app` no Finder e
      no Dock com o app aberto (se o Finder mostrar o ícone antigo, mover o `.app` para
      outra pasta e de volta).
- [ ] Nome novo: janela, barra de tarefas/Dock e programas como "Stillpoint"; terminal
      mostra "😎 STILLPOINT"; pacote `stillpoint-vX.Y.Z-<sistema>.zip`.
- [ ] Sessões não salvas da versão antiga aparecem ao abrir o Stillpoint (a pasta
      "Canon Bullet Time" vira "Stillpoint").
- [ ] A versão (ex.: `v2.5.1`) aparece pequena ao lado de STILLPOINT, no topo.

## 8. Instaladores
- [ ] Mac: abrir o `.dmg`: janela com o fundo de chuva, Stillpoint à esquerda, Aplicativos
      à direita, Read Me embaixo; os nomes ficam sobre as placas verdes (modo claro e escuro).
- [ ] Mac: arrastar para Aplicativos e abrir; seguir o Read Me (Ajustes do Sistema →
      Privacidade e Segurança → "Abrir Mesmo Assim"); os nomes dos botões batem com o texto.
- [ ] Windows: abrir o `-setup.exe`: telas com as imagens de chuva; opções "atalho na área de
      trabalho" e "versão de terminal" desmarcadas; instala em Arquivos de Programas.
- [ ] Windows: Stillpoint no menu Iniciar abre e conecta as câmeras; com a opção marcada,
      "Stillpoint Terminal App" também aparece e funciona.
- [ ] Windows: desinstalar por Configurações → Aplicativos; as sessões guardadas continuam
      em `%LOCALAPPDATA%\Stillpoint`.

## 9. Atualização pelo app
- [ ] Abrir o app instalado (Windows: pelo instalador; Mac: em Aplicativos) com
      `STILLPOINT_TEST_VERSION=2.1.0`: aparece "UPDATE x.y.z" no topo (versão publicada).
- [ ] Clicar: janela com "You have 2.1.0 → new x.y.z", novidades (se houver) e "Update now".
- [ ] Com uma câmera conectando, "Update now" fica desativado com o aviso; libera ao conectar.
- [ ] "Update now": barra de andamento; "Cancel" volta para a janela anterior.
- [ ] "Update now" até o fim: o app fecha, instala (Windows pede permissão) e abre de novo
      na versão publicada; sessões não salvas continuam lá.
- [ ] Sem internet: o app abre normalmente, sem aviso.
- [ ] Cópia fora do lugar (Windows: zip; Mac: fora de Aplicativos): a janela oferece
      "Open download page".

## 10. Abertura
- [ ] Ao abrir o app: chuva de código verde aparecendo aos poucos, logo e título com fade in
      e, em ~5 s, o app; caracteres japoneses aparecem (não quadrados).
- [ ] Clique ou tecla durante a abertura: ela some na hora.
- [ ] As câmeras conectam normalmente durante a abertura.

## 11. Play na tela cheia
- [ ] "Reverse loop" marcado (padrão): o play vai e volta (1, 2, 3, 2, 1...).
- [ ] Desmarcado: o play recomeça do início (1, 2, 3, 1, 2, 3...).
- [ ] Botões − e + mudam a velocidade (0.5x a 2x), também com o play rodando; nos limites
      o botão fica desativado.

## 12. Abrir a pasta depois de salvar
- [ ] "Save sessions" com uma sessão: no fim abre a pasta dessa sessão (Finder/Explorador).
- [ ] Com várias sessões salvas de uma vez: abre a pasta escolhida, com todas dentro.

## 13. Salvar como fotos ou sequência

Sem câmeras, copie a sessão de teste (`docs/test-session`) para a pasta de fotos do app com
o app fechado:
- Mac: `mkdir -p ~/Library/Application\ Support/Stillpoint/Photos && cp -R docs/test-session/* ~/Library/Application\ Support/Stillpoint/Photos/`
- Windows (PowerShell): `New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\Stillpoint\Photos" | Out-Null; Copy-Item -Recurse -Force docs\test-session\* "$env:LOCALAPPDATA\Stillpoint\Photos\"`

Depois de salvar, o app pergunta se descarta as sessões salvas (Discard from app) ou mantém até fechar (Keep until I close); nos dois casos elas saem do app, então copie de novo para testar outra vez.

- [ ] Sessão com RAW numa câmera e só JPEG noutra (Quality diferente), Photos → Original → Save:
      aviso "Not every camera sent RAW" com as câmeras de cada lado; "Save as is" salva mesmo assim;
      "Back" volta. Com todas iguais (ou formato convertido), não avisa.
- [ ] "Save sessions" pergunta Photos ou Sequence.
- [ ] Photos: Original move as fotos como antes; PNG, JPG, WEBP, TIFF e HEIC criam os arquivos
      convertidos (Windows: HEIC desativado se faltar a extensão, com o motivo).
- [ ] Sequence: prévia toca na velocidade escolhida; o total muda com Speed, Loops e Reverse loop.
- [ ] MP4, MOV, GIF, WEBP e AVIF abrem e tocam (GIF/WEBP/AVIF repetem sem parar; MP4/MOV com o
      número de loops escolhido). 4K só no MP4/MOV.
- [ ] "Also save the photos" marcado: fotos e vídeos na mesma pasta; desmarcado: só os vídeos.
- [ ] "Same settings for all sessions" (ligado por padrão): mudar uma sessão muda todas. Desligado:
      cada sessão com a sua, "Different" em âmbar nas diferentes da aberta, "Apply to all sessions"
      copia; ligar de novo copia a configuração da sessão aberta para todas.
- [ ] Andamento aparece; "Cancel" para e as sessões não salvas continuam no app.
- [ ] No fim abre a pasta (uma sessão: a dela; várias: a escolhida).
- [ ] Name: Date + time ("2026-10-14 16.31.00"), Number (01, 02… continuando os que já existem na
      pasta) e Custom (com ou sem data, antes ou depois; nome repetido sem data ganha 01, 02…).
- [ ] Fotos salvas com nome curto ("01_SL3_1.JPG"); subpastas Photos/ e Sequence/ só quando há
      fotos e sequência juntas.
- [ ] Pasta com o mesmo nome já existe: aviso com Keep both / Replace / Cancel.
- [ ] Replace: salve uma sessão como MP4 + GIF; depois salve de novo com o mesmo nome só como WEBP e escolha Replace. A pasta deve ficar só com o WEBP (o MP4 e o GIF antigos somem).
- [ ] Quality (Standard / High / Maximum): aparece na sequência e nas fotos em JPG, WEBP e HEIC
      (não em Original, PNG e TIFF). Salve a mesma sessão em Standard e em Maximum e compare:
      Maximum gera arquivos maiores e o WEBP em Maximum é sem perda.
- [ ] Com RAW: Original salva os arquivos RAW intactos; JPG converte a partir da imagem grande do RAW.
- [ ] Fechar o app com a janela de salvar aberta: aviso com Delete and close / Continue saving.
- [ ] Fechar o app durante o salvamento: Stop and close / Close when done.

## 14. Menu do app e Settings
- [ ] Mac: barra de cima com Stillpoint, Edit, View, Window e Help.
- [ ] Mac: ⌘C, ⌘V e ⌘A funcionam no campo de nome *Custom* da janela de salvar.
- [ ] Mac: ⌘Q fecha o app; com sessões não salvas, aparece o mesmo aviso do botão de fechar.
- [ ] Mac: ⌘H esconde; ⌘M minimiza; ⌃⌘F tela cheia da janela.
- [ ] Windows: botão de menu (≡) no canto direito da barra; no Mac ele não aparece.
- [ ] About: nome, versão, licença; Licenses e GitHub abrem as páginas.
- [ ] Check for updates: sem versão nova, "Stillpoint is up to date"; sem internet, aviso de erro.
- [ ] Settings (⌘, no Mac, Ctrl+, no Windows): tema Nocturne Neo e idioma English marcados; Done fecha.
- [ ] Help, Compatible cameras, What's new e Report a problem abrem as páginas do GitHub.
- [ ] Esc fecha o menu, o About e o Settings.
- [ ] Countdown, Sessions e Download wait: só aceitam números inteiros (letras, ponto e sinal
      não entram); no máximo 3 dígitos; vazio ou abaixo do mínimo volta ao padrão ao sair do
      campo; setas ↑ ↓ somam ou tiram 1.
- [ ] Cancelar o bullet time (com câmeras): Countdown 10 e Sessions 3.
  - [ ] Na contagem: botão Cancel (ou Esc) para na hora; nada é disparado e não aparece sessão vazia.
  - [ ] Entre sessões: "Cancel bullet time" (o botão de disparo) depois da 1ª sessão; a 2ª não
        começa e a 1ª fica no app.
  - [ ] Esperando as fotos: "Cancel bullet time"; as fotos que chegaram ficam na sessão.
  - [ ] Atividade mostra "Bullet time cancelled"; o botão volta a "It's bullet time".
  - [ ] Terminal app: sem mudança (não tem cancelamento).

## 15. Reconexão (2.6.1)
- [ ] Com as câmeras conectadas, desligue e religue uma delas: ela volta sozinha (Activity com
      "Show technical details" mostra "USB: Canon camera plugged in or turned on").
- [ ] Repita com a outra câmera e depois com as duas ao mesmo tempo.
- [ ] Desligue uma câmera, espere ela aparecer como desconectada, clique em "Restart camera
      connections" e religue: ela volta.
- [ ] Disparo normal depois de reconectar: fotos chegam das duas câmeras.

## 16. Camera settings (etapa 12)
- [ ] Painel Cameras: número de câmeras ao lado do título; com várias câmeras só a lista rola e o
      cabeçalho fica fixo.
- [ ] Arrastar uma câmera para outra posição muda a ordem (01, 02...), igual às setas.
- [ ] "Camera settings" abre a tabela com os valores reais de cada câmera (confira na própria câmera).
- [ ] Mudar ISO, velocidade, abertura, Picture Style e qualidade de uma câmera: a câmera muda
      na hora (confira no visor/tela dela).
- [ ] Ponha uma câmera em disparo contínuo (ou timer) na própria câmera: o app volta ela para
      disparo único sozinho (Activity: "... was set to single shooting"). Se não conseguir, o
      painel mostra "Not on single shot".
- [ ] "All cameras": mudar um valor muda em todas. White balance: lista os predefinidos que todas
      aceitam (Daylight, Cloudy...); os valores em Kelvin só aparecem se todas aceitarem Kelvin
      (a SL3 e a T7 não aceitam).
- [ ] **Tabela sem rolagem lateral** (etapa 18): com a coluna nova, Quality saiu da tabela e está no
      popover "±" do Picture Style (linha "Quality", com as opções comuns em All cameras; o ± fica
      âmbar tracejado se a Quality difere), e o Focus virou etiqueta ao lado do nome ("MF" normal,
      "ONE-SHOT"/"AI SERVO" âmbar; em All cameras "AF ON n" quando alguma está em AF). ISO mostra
      "400" (sem o "ISO"). Numa janela de 1000 px de largura, nada rola de lado (medido: tabela de
      926 px em 958 disponíveis; em 920 px ainda cabe).
- [ ] **Metering** (etapa 18, 2.13.0): coluna entre Exp. comp. e White balance com o modo de medição
      lido da câmera (Evaluative / Partial / Spot / Center-wtd; confira no menu da própria
      câmera); mudar numa câmera muda nela na hora; em All cameras muda em todas; Cmd/Ctrl+Z volta;
      "Copy from camera" copia também; Activity "Metering → Spot on T7_1". Câmera em modo que não
      deixa mudar (ex.: cena automática) → célula com "—". Com modos diferentes entre câmeras, a
      lista das câmeras marca "Settings differ". **Match automatically** com modos diferentes: antes de
      disparar, caixa "Metering modes differ" (quem está em quê) com "Keep as they are" (segue
      assim) e "Set all to <modo mais comum>" (muda todas, espera aplicar e segue); com todas iguais
      a caixa não aparece (decisão do dono, 2026-10-30).
- [ ] WB fine-tune (B/A e M/G) muda na câmera.
- [ ] Copy from camera: todas ficam iguais à escolhida.
- [ ] Câmera com o disco fora do M (ex.: Auto): linha com o aviso para girar para M; no painel,
      "Settings on the camera only". Girando para M, a linha volta a ter as opções sozinha.
- [ ] Câmera com valor diferente: âmbar na tabela e "Settings differ" no painel.
- [ ] Lente em AF: Focus em âmbar; em MF: "MF".
- [ ] Mudar algo direto na câmera com a janela aberta: a tabela atualiza sozinha em até ~3 s
      (ou com "Read again").
- [ ] Test shot com "Match automatically" desligado: dispara todas as câmeras (sem contagem e sem
      som) e mostra uma fileira de miniaturas, uma por câmera, na ordem; a tabela fica bloqueada
      enquanto fotografa. As fotos do teste não viram sessão e somem ao fechar a janela.
- [ ] Clicar numa miniatura abre a foto grande por cima da janela; ← → passam de câmera; Esc (ou
      Close, ou clicar fora da foto) fecha só a foto grande; Esc de novo fecha a janela.
- [ ] "Hide photos" recolhe a fileira e vira "Show photos"; um novo Test shot mostra a fileira aberta.
- [ ] Test shot com "Match automatically" ligado (padrão), câmeras com balanço de branco em Auto e
      valores diferentes (ex.: velocidade 1/200 numa e 1/250 na outra): tira até 5 fotos sozinho
      ("Photo 2 of up to 5 · Finding a common white balance"...), e no fim mostra as fotos e o
      resumo do que mudou em cada câmera (velocidade, ISO, White balance, WB fine-tune, Picture
      Style). Confira na tela de cada câmera que os valores mudaram. As fotos finais devem
      parecer mais iguais entre si do que antes (cor e brilho).
- [ ] Rodar o Test shot de novo logo depois: muda pouco ou nada ("Nothing to change").
- [ ] Primeira vez com um modelo: aparecem as fotos "Calibrating the cameras (blue/amber)" e
      "(green/magenta)"; no fim, o ajuste fino das câmeras não ficou no extremo (A9/G9). Na
      vez seguinte essas duas fotos não aparecem. (Para calibrar de novo: apagar
      camera-calibration.txt na pasta de dados do app.)
- [ ] Câmera com o disco fora do M durante o ajuste: ela aparece no resumo como não ajustada.
- [ ] Com ISO em Auto e "Match automatically" ligado: antes de começar aparece "ISO is on Auto"
      com Cancel e Continue anyway.
- [ ] Durante o Test shot o botão vira "Cancel". Cancelar no meio (inclusive nas fotos de
      calibração): para, mostra "Test shot cancelled" e as configurações das câmeras voltam
      como estavam antes (conferir na tabela e na câmera). Sem ajuste: só para.
- [ ] WB fine-tune: "G" (verde) e "M" (magenta) batem com o que a câmera mostra no menu.
      Conferido (2026-10-15): T7 e SL3 (G5 no app = G5 no menu WB Shift/BKT).
- [ ] Câmera de modelo ainda não conferido: pôr só G5 pelo app (lista da direita do WB
      fine-tune) e ver no menu WB Shift/BKT da câmera se aparece G5. Anotar o modelo e o
      resultado em "Observações" abaixo; se aparecer M5, o modelo é invertido.
- [ ] O (?) mostra a legenda ao passar o mouse; Esc fecha a janela.

## 17. Match colors (etapa 13)
- [ ] Picture Style: o botão "±" abre Contrast, Saturation e Color tone da câmera. Mudar um valor
      muda na câmera (conferir no menu Picture Style da câmera, botão INFO). Conferir na SL3 e na T7.
- [ ] "±" da linha All cameras: muda em todas; valor diferente entre câmeras aparece como "—".
- [ ] Esc ou clicar fora fecha a caixa do "±" (sem fechar a janela).
- [ ] Match automatically com contraste +3 numa câmera e 0 nas outras (ou Saturation/Color tone
      diferentes): todas terminam com o mesmo valor (o mais comum; empate: o da primeira câmera),
      o resumo mostra a mudança e o "±" deixa de ficar âmbar. Cancel volta os valores de antes.
- [ ] Ajuste fino diferente entre câmeras não deixa mais a célula âmbar nem "Settings differ".
- [ ] Copy from camera: copia também Contrast, Saturation e Color tone do "±" (depois do Picture
      Style). Com a calibração da cartela, cada modelo recebe o valor com a diferença do modelo.
- [ ] "±" do Picture Style: só uma ou duas opções (Contrast, Saturation, Color tone) diferentes →
      âmbar tracejado (na câmera diferente e em All cameras), e na caixa do "±" a opção diferente
      fica âmbar; as três diferentes → âmbar cheio; todas iguais → normal. A legenda do "?" mostra
      o tracejado âmbar.
- [ ] Settings → Debug → On. Test shot (com e sem Match automatically): no fim, "Open debug folder"
      (no resumo ou no Settings) abre uma pasta com as fotos, report.csv e trace.txt.
- [ ] Debug ligado, fechar e abrir o app: volta desligado. Desligado: Test shot não cria pasta.
- [ ] Settings mostra "Debug data: N MB" (ou "No debug data saved."). "Delete debug data" → confirmar:
  a pasta Debug fica vazia, aparece "No debug data saved." e o botão some. Pastas de sessão intactas.
- [ ] (Opcional) Com mais de 300 MB ou mais de 20 pastas em Debug, um novo Test shot apaga as mais antigas.
- [ ] Match automatically com cenas bem diferentes (uma câmera vendo parede clara, outra canto
      escuro), mesmo ISO no início: o brilho das fotos finais fica mais parecido que antes, sem
      um ISO ir para um extremo e o outro para o outro.
- [ ] "Use gray card" só pode ser marcado com Match automatically ligado.
- [ ] Cartão cinza (ou papel cinza fosco) onde todas as câmeras veem, "Use gray card" marcado,
      Test shot: depois da primeira foto aparece a tela Gray card com cada foto e o cartão marcado.
      Clicar no cartão numa foto move a marcação; segurar e arrastar desenha a área (a foto não
      é arrastada). Sem cartão marcado em 2 câmeras, Continue fica
      desligado. Continue: o Match termina; nas fotos finais o cartão sai cinza (sem puxar para
      cor nenhuma) e com brilho parecido em todas.
- [ ] Na tela Gray card: Cancel, Esc ou Done cancelam o Test shot e as câmeras voltam como estavam.
- [ ] Com Debug ligado e cartão cinza: a pasta termina em "_match-graycard" e o trace.txt tem a
      área do cartão de cada câmera.
- [ ] Calibrate with chart com câmeras do mesmo modelo: avisa que precisa de 2 modelos diferentes.
- [ ] Calibrate with chart (SL3 + T7): "Open chart" abre o PDF; impresso em 100%, as medidas
      batem (as marcas dos cantos têm 22 mm).
- [ ] Cartela onde todas veem, Start: depois da 1ª foto, a tela Chart mostra os 4 pontos nos
      centros das marcas (ponto 1 na marca da bolinha). Arrastar um ponto move; clicar na foto
      leva o ponto mais perto até ali. Continue precisa de 2 câmeras marcadas.
- [ ] No fim: 4 fotos tiradas, todas as configurações de volta como estavam (Picture Style,
      Contrast, Saturation, Color tone, balanço de branco, ajuste fino). O resumo mostra cada
      modelo com a diferença medida e o que vai usar.
- [ ] Depois: Match automatically deixa a T7 com a diferença medida (ex.: Saturation −1) e o "±"
      não fica âmbar por isso; o texto de ajuda do "±" mostra "calibrated with the chart".
- [ ] Cancel, Esc ou Done na tela Chart: cancela e as câmeras voltam como estavam.
- [ ] Com Debug: pasta "_chart" com as fotos e o trace.txt (medidas de cada foto).
- [ ] Salvar 1 ou mais sessões (sem fechar o app): no fim aparece "Discard the saved session(s)?"
      com "Discard from app" em destaque. Discard: as sessões salvas somem do app (a pasta salva
      fica intacta). "Keep until I close": continuam no app até fechar. Com erro no meio, pergunta
      só pelas que salvou.
- [ ] Fechar o app durante o salvamento ("Close when done") e salvar ao fechar: não pergunta; as
      salvas saem do app.
- [ ] "Keep until I close": a sessão aparece com a etiqueta verde "✓ Saved" na lista de sessões e
      na janela Save sessions. Só com sessões salvas no app, fechar não pergunta nada; ao abrir de
      novo elas não estão mais no app (a pasta salva continua intacta) e não aparece "Sessions
      from last time". Com uma salva e uma não salva: o aviso fala de 1 sessão; "Delete and close"
      apaga a não salva; "Save and close" vem só com a não salva marcada.
- [ ] Disparo normal depois de mudar as configurações; terminal app sem mudança.
- [ ] Com o app aberto (com e sem a janela Camera settings aberta), desligar as câmeras: o app
      não fecha sozinho; elas aparecem como desconectadas e voltam ao religar.

## 18. Disparo com intervalos / Timing (etapa 14)

Sem câmeras: feche o app e abra com câmeras simuladas (Mac: `STILLPOINT_FAKE_CAMERAS=9
./build/macos-arm64/Stillpoint`; Windows, PowerShell: `$env:STILLPOINT_FAKE_CAMERAS=9;
.\build\windows-x64\Release\Stillpoint.exe`). O painel Cameras mostra 9 câmeras; os disparos
geram fotos de teste com o número da câmera e "#n" (número da foto na sessão).

- [ ] Painel Bullet time: linha "Timing: All at once" com o botão Advanced. Advanced abre os modos
      (At once, Sweep, Groups, Odd / even, Custom), os campos do modo e a linha do tempo; o painel
      cresce enquanto está aberto. Hide fecha. (Desde o branch `sweep-limite`, "One after another"
      e "Sweep" são um modo só, "Sweep": intervalo livre a partir de 0,05 s e atalhos 0,1 / 0,2 /
      0,3 / 0,4 s.)
- [ ] Sweep 0,5 s (digitado), 1 → 9 → 1: resumo "17 shots over 8 s"; a linha do tempo mostra 1…9 e
      depois 8…1 (bolinhas vazadas = segunda foto da câmera). Direction 9 → 1 inverte. Loops 2 dobra.
- [ ] Groups 3 × 1 s: "1–3", "4–6", "7–9" em 0, 1 e 2 s. Odd / even: "odd (5)" em 0 e "even (4)" em 1 s.
- [ ] Sweep: atalhos de intervalo (0,1 / 0,2 / 0,3 / 0,4 s) preenchem o campo Interval; resumo
      "Sweep · 0.2 s · 1 → 9 · 9 shots over 1.6 s"; disparo com as 9 fotos em sequência (na Live:
      "Fire!", sem contagem nem som de grupo).
- [ ] **Aviso de câmera repetindo cedo demais** (medido em 2026-10-22 na T7: a câmera recusa uma
      nova foto até ~0,93 s da anterior aceita, mais ~0,1–0,23 s da ordem chegar; com 1,0 s no plano ela
      recusou um sim, outro não; limite do aviso: 1,2 s). Sweep 0,3 s, 1 → 9,
      Loops 1: sem aviso. Loops 2: sem aviso (cada câmera repete a 2,7 s). Sweep 0,1 s, Loops 2:
      aviso "Camera 1 would shoot again 0.9 s after its previous shot (9 cameras repeat too soon).
      A camera needs at least 1.2 s between its own shots; that photo will be missing.". Sweep 0,3 s,
      1 → 9 → 1: aviso "Camera 8 would shoot again 0.6 s…" sem parêntese (a 7 repete a 1,2 s, acima
      do limite). Sweep 0,4 s, 1 → 9 → 1: "Camera 8 … 0.8 s". Groups 3 × 0,3 s, Loops 2: aviso
      "Camera 1 … 0.9 s … (9 cameras repeat too soon)". Custom com a mesma câmera em dois passos a
      0,5 s: aviso. O aviso de "not in any step" continua aparecendo junto, quando houver.
- [ ] **Direction em Groups e Odd / even** (pedido de 2026-10-22): Groups 3 × 1 s, Direction
      "3 → 1": "7–9" em 0, "4–6" em 1 s, "1–3" em 2 s; "1 → 3 → 1": 1–3, 4–6, 7–9, 4–6, 1–3 (5 grupos,
      4 s); com Loops 2: 9 grupos, "×2" no resumo. Odd / even, Gap 1 s, Direction "even → odd": pares
      em 0, ímpares em 1 s; "odd → even → odd": ímpares, pares, ímpares (3 slots, 2 s). Resumo:
      "Groups · 3 groups · 1 s · 1 → 3 → 1" e "Odd / even · odd → even → odd · 1 s". Custom (passos
      1,2,3 em 0; 4,5,6 após 1 s; 7,8,9 após 2 s), Direction "3 → 1": 7–9 em 0, 4–6 em 2 s, 1–3 em 3 s;
      "1 → 3 → 1": 1–3, 4–6 (1 s), 7–9 (3 s), 4–6 (5 s), 1–3 (6 s); com Loops 2 em "1 → 3": a volta
      recomeça 1 s depois do último passo (o "after" do passo 2), como antes.
- [ ] **Confirmação antes de disparar** (aprovada em 2026-10-22): com um plano que repete cedo demais
      (Sweep 0,3 s, 1 → 9 → 1), "It's bullet time" abre "1 photo will be missing" com "Fix timing"
      (não dispara) e "Shoot anyway" (dispara). Sem repetição cedo demais, dispara direto.
- [ ] **Fotos recusadas, com câmeras simuladas** (elas recusam como a T7: foto pedida a menos de
      ~1 s da anterior aceita). Sweep 0,3 s, 1 → 9 → 1, "Shoot anyway": durante o disparo a linha
      de andamento mostra "Shot 10 of 17 · 8 refused" em âmbar; a Live marca a recusada em
      vermelho; no fim, em vez de "Done", a linha âmbar "Done with 1 photo missing: 8 (shot 10) —
      asked 0.6 s after their previous shot." e uma linha só na Activity com a dica "Give each
      camera at least 1.2 s between its own shots in Timing."; a sessão tem 16 fotos e a etiqueta
      âmbar "1 MISSING" na lista de sessões e na janela Save sessions (também depois de fechar e
      abrir o app: arquivo `.missing` na pasta da sessão). Sweep 0,1 s, Loops 2 (9 repetem a 0,9 s):
      "9 photos will be missing" → "Shoot anyway" → "Done with 9 photos missing: …", 9 fotos,
      "9 MISSING". Sweep 1,5 s, 1 → 9 → 1: nada disso, "Done" normal, 17 fotos.
- [ ] Um `settings.txt` antigo com `timing={"mode":"seq","interval":0.5,…}` abre como Sweep 0,5 s;
      um com `"mode":"sweep","sweep":0.15,"sweepDirection":"back"` abre como Sweep 0,15 s, 9 → 1.
- [ ] Custom: passos com chips; clicar num chip move a câmera para aquele passo; "Add step" cria um
      passo; segurar e arrastar um passo muda a ordem (como nas câmeras: linha verde no destino, o
      passo arrastado meio transparente; cada passo leva o seu "after"); o X à direita remove
      (apagado com um passo só). Arrastar uma câmera: também meio transparente.
      Câmera fora dos passos: aviso "Camera 9 is not in any step…".
- [ ] Advanced fechado com um modo escolhido: etiqueta âmbar "Timing", resumo e linha do tempo
      pequena com os números (33 fotos ainda legíveis; apertando mais, alterna em duas alturas).
      Em All at once nada disso aparece. O painel não rola: o botão e o "Done…" ficam à vista.
- [ ] Advanced aberto: a caixa Timeline fica sempre no mesmo lugar (logo abaixo dos modos) ao trocar
      de modo; as opções do modo têm caixas do mesmo tamanho e alinhadas.
- [ ] Fechar e abrir o app: o Timing escolhido continua.
- [ ] It's bullet time com Sweep 0,5 s 1 → 9 → 1: a sessão fica com 17 fotos, na ordem 1…9, 8…1
      (olhar o número grande de cada foto e o "#n"); o download conta até 17. Sequence export toca
      nessa ordem.
- [ ] Custom (1,2,3 em 0; 4 em 2 s; 5,6,7 em 1 s depois): 7 fotos, tempos certos (ver o log).
- [ ] Cancelar no meio de uma sequência longa: para de disparar; as fotos já tiradas ficam.
- [ ] All at once: igual a antes (9 fotos, uma por câmera, prefixo = ordem da câmera).
- [ ] Com câmeras de verdade (quando houver): Sweep 1 s com 2 câmeras: fotos chegam e a sessão
      tem a ordem certa; terminal app sem mudança.

## 19. Janela Live (etapa 15)

Sem câmeras: abra com câmeras simuladas (como na seção 18). O botão **Live view** fica na barra
de cima, ao lado de Save sessions, e abre uma **janela separada** (a principal continua à vista).
Esc cancela o disparo (se estiver no meio), sai da tela cheia ou esconde a janela; Space dispara
de novo; F alterna a tela cheia. O botão de som da barra de cima da janela principal liga e
desliga todos os sons do disparo (contagem, "it's bullet time" e o bip dos grupos). Mexendo o
mouse na Live aparecem as opções embaixo: Mode (Operator / Audience), Layout (Arc / Circle /
Line), Group sounds, Speed (0,25x a 5x) e Reverse loop (da sequência no fim), Display (Window /
Full screen — com mais de um monitor, pergunta qual), Always on top, Another window e Close.

- [ ] Live view abre a janela "Stillpoint · Live" com as 9 câmeras em arco (número de cada uma),
      "Ready · 9 cameras" e as teclas embaixo. A janela principal continua funcionando. Fechar a
      janela Live (botão do sistema, Close ou Esc) só a esconde; Live view traz de volta como estava.
- [ ] Countdown 3 e Sequence 1 s 1 → 9 → 1; na janela Live apertar Space: a contagem 3, 2, 1 aparece
      grande com "Ready", "Aim", "Fire!" (na janela principal também); depois cada câmera fica branca na hora do
      disparo e verde logo depois, a próxima fica tracejada (âmbar), "7 / 17" em cima (fotos
      disparadas de 17), "Next: camera n in 0,x s" embaixo à esquerda e a barra do plano avança.
      No fim: "17 / 17 received" e a sequência toca em loop (tira de fotos em cima, foto grande
      embaixo). Space dispara de novo.
- [ ] Groups 3 × 2 s: entre os grupos aparece a contagem em números ("1.4 s", "Next group: cameras
      4, 5, 6") e as três câmeras do próximo grupo tracejadas; o número e as câmeras não mudam de
      lugar de um grupo para outro. Na linha do tempo embaixo, um traço por rodada com as câmeras
      ("1–3", "4–6", "7–9"); o próximo em âmbar, os passados em verde. Com Group sounds ligado e
      Groups 3 × 4 s: toques a 3, 2 e 1 s de cada grupo e o som de duas notas quando o grupo sai;
      desligado, só o som do disparo.
- [ ] Som desligado na barra de cima: o disparo seguinte sai sem nenhum som (nem contagem); ligado
      volta tudo. Group sounds na Live muda só o bip. Depois de clicar num botão, Space ainda dispara.
- [ ] Speed e Reverse loop na Live mudam a sequência tocando na hora (0,25x a 5x; vai e volta ou
      recomeça). Na janela principal o play também vai de 0,25x a 5x.
- [ ] Display Full screen: com dois monitores aparece a pergunta "Full screen on which display?";
      a janela cobre o monitor escolhido inteiro (sem borda, por cima da barra de menus / barra de
      tarefas) e o teclado continua funcionando (Esc, Space, F). Esc ou Window volta a ser janela
      normal no monitor principal. Always on top: a janela fica à frente da principal.
- [ ] Fechar e abrir o app: Live view volta com o mesmo modo, layout, display e monitor; o som também.
- [ ] Another window: abre "Stillpoint · Live 2" (ex.: Operator na janela 1, Audience em tela cheia
      na 2). As duas recebem o disparo ao mesmo tempo.
- [ ] Layout Circle e Line mudam a disposição das câmeras na hora.
- [ ] Mode Audience: só a contagem grande, "Hold still" (com a contagem em números entre grupos
      longos), e a foto grande tocando em loop no fim; sem câmeras, sem números de fotos, sem plano.
- [ ] All at once: na hora do disparo todas as câmeras piscam brancas e ficam verdes; "k / 9" das
      fotos chegando; sequência no fim.
- [ ] Cancelar (Esc na janela Live, ou o botão da principal) no meio: "Cancelled" nas duas.
- [ ] Sessions 2: "Session 1 of 2"; a segunda sessão começa sozinha e a sequência da primeira para.
- [ ] Camera settings com câmeras simuladas: as 9 aparecem ajustáveis (modo M), com ISO, Tv, Av,
      exp. comp., WB (com Kelvin e ajuste fino), Picture Style (com contraste/saturação/tom), Drive e
      foco MF; algumas começam diferentes (ISO, Tv, WB, Picture Style, ajuste fino). Mudar um valor
      numa câmera ou em todas muda na hora; Copy from camera e Match automatically funcionam com as
      fotos de teste. Os valores voltam ao início ao abrir o app de novo.
- [ ] Windows: tudo acima, e a janela Live em tela cheia e de volta a janela.
- [ ] **Escolha do monitor (2026-10-28), com um segundo monitor/TV ligado:** Live view → Full
      screen pela primeira vez: pergunta o monitor, cada opção com um número; "Identify displays"
      mostra o número grande no meio de cada monitor por 3 s (por cima de tudo); escolher a TV.
      Close/Esc e Full screen de novo: **vai direto para a TV, sem perguntar**. Em tela cheia aparece
      "Change display" nas ferramentas: troca para o outro monitor sem sair da tela cheia (Mac:
      sai e entra de novo com a animação). **Desligar a TV** (ou puxar o HDMI) com a Live em tela
      cheia nela: em até ~2 s a Live passa para o monitor principal, em tela cheia. Religar a TV:
      não volta sozinha (Change display). Windows: o mesmo, com "Display N (main)".
- [ ] **Live em tela cheia (Mac, 2026-10-28):** Live view → Full screen → **Close ou Esc**: só sai
      da tela cheia; a Live volta a janela, com "Window" marcado, **e continua em destaque** (o foco
      não vai para a janela principal). Close de novo (em janela): fecha. **Botão vermelho de
      fechar** em tela cheia: sai da tela cheia com a animação do sistema e some, **sem a tela
      preta de vários segundos**; Live view abre de novo em janela, com "Window" marcado.

## 20. Teste de viabilidade da etapa 16 (um processo por câmera)

Pergunta a responder: o SDK da Canon aceita ser carregado por **dois processos ao mesmo tempo**
na mesma máquina, cada um com a sua câmera? Sem isso, a etapa 16 não existe.
Programa: `SdkMultiprocTest` (gerado junto com o resto; `src/tools/sdk_multiproc_test.cpp`).
Duas ou três câmeras ligadas (SL3 + T7 + T5), em entradas USB diferentes. Um terminal por
câmera, abertos na pasta do projeto (com 3 câmeras, repetir os passos B–F com o terminal 3:
`--model T5`; o passo F com `--at` igual nos três). Tudo fica em `~/Desktop/sdk-multiproc-test/` (fotos e `log-<câmera>.txt`).

Compilar (Mac):
```
cd ~/Developer/stillpoint
cmake --build --preset macos-arm64-release --target SdkMultiprocTest
```
O programa fica em `build/macos-arm64/SdkMultiprocTest`.

- [ ] **A. Lista.** Num terminal: `./build/macos-arm64/SdkMultiprocTest --list` → mostra as 2
      câmeras com índice, modelo e porta; termina sozinho.
- [ ] **B. Dois processos, uma câmera cada.** Terminal 1:
      `./build/macos-arm64/SdkMultiprocTest --model SL3`. Esperar `EdsOpenSession: 0x00000000 (ok)`
      e `ready`. Terminal 2: `./build/macos-arm64/SdkMultiprocTest --model T7`. Esperar o mesmo.
      Anotar: a segunda abriu? Em quantos segundos? (a T7 recém-ligada pode levar ~40 s)
- [ ] **C. Lista com a outra ocupada.** No terminal 2, digitar `l` e Enter: o SDK deste processo
      ainda vê as 2 câmeras (ou só a dele)? Anotar.
- [ ] **D. Abrir a câmera do outro.** No terminal 2, `o` e Enter: tenta abrir a SL3 (que está
      com o terminal 1). Esperado: erro (DEVICE_BUSY ou parecido). Se abrir (`!! opened`), anotar
      — significa que o SDK não protege e o app terá de garantir isso sozinho. Depois, no
      terminal 1, `s` e Enter: a SL3 ainda dispara e baixa a foto?
- [ ] **E. Disparo alternado.** `s` no terminal 1, depois `s` no terminal 2: cada uma dispara e
      a foto aparece em `~/Desktop/sdk-multiproc-test/` com o nome da câmera (`download ... (ok)`).
- [ ] **F. Disparo simultâneo.** Fechar os dois com `q`. Olhar o relógio do Mac e escolher um
      horário 2 minutos à frente (ex.: 15:42:00). Terminal 1:
      `./build/macos-arm64/SdkMultiprocTest --model SL3 --at 15:42:00`; terminal 2:
      `./build/macos-arm64/SdkMultiprocTest --model T7 --at 15:42:00`. As duas disparam sozinhas
      nesse horário e fecham 20 s depois. Nos dois logs, comparar o horário (ms) da linha
      `PressShutter DOWN`: a diferença é o quanto o relógio do computador sincroniza dois
      processos (esperado: poucos ms). As duas fotos chegaram?
- [ ] **G. Queda de uma.** Repetir B. Desligar a T7 no botão. O terminal 2 mostra evento/erro
      e o terminal 1 continua normal (`s` na SL3 ainda funciona)? Religar a T7: `q` no terminal 2
      e abrir de novo com `--model T7`: conecta de novo com o terminal 1 ainda aberto?
- [ ] **H. Terminal.** O app de terminal (`Stillpoint Terminal App`) continua igual (este teste
      não mexe no app).

Anotar os resultados na tabela abaixo e no ROADMAP (etapa 16, "primeiro passo"). Com B, D e F
ok, a etapa 16 segue para a implementação; se B ou D falharem, a etapa muda de desenho (um
processo só, com vigia por thread) antes de qualquer código.

## 21. Um processo por câmera (etapa 16)

O app de janela não carrega mais o SDK da Canon: cada câmera fica num processo
`StillpointWorker` (ao lado do app; no .app, dentro de `Contents/MacOS`). Se uma câmera trava
o SDK, só o processo dela para; o app o encerra e abre outro. Log por câmera em
`~/Library/Application Support/Stillpoint/Logs/worker-<série>.txt` (Windows:
`%LOCALAPPDATA%\Stillpoint\Logs`). O terminal não muda.

Compilar (Mac):
```
cd ~/Developer/stillpoint
cmake --preset macos-arm64
cmake --build --preset macos-arm64-release
./build/macos-arm64/Stillpoint
```

Compilar (Windows, PowerShell; primeira compilação da camada de processos de Windows):
```
cd C:\Users\ra-mo\source\repos\canon-bullet-time
git fetch origin; git checkout etapa-16-processo-por-camera; git pull
$vs = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property installationPath
& "$vs\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
cmake --preset windows-x64
cmake --build --preset windows-x64-release
.\build\windows-x64\Release\Stillpoint.exe
```
No Windows, `StillpointWorker.exe` fica ao lado do `Stillpoint.exe`; os processos aparecem no
Gerenciador de Tarefas; log em `%LOCALAPPDATA%\Stillpoint\Logs\worker-<série>.txt`. Primeiro
sem câmera (`$env:STILLPOINT_FAKE_CAMERAS=9; .\build\windows-x64\Release\Stillpoint.exe`,
seção 18 inteira, inclusive foto recusada e Live), depois com as câmeras, os itens abaixo.

- [ ] **Conexão.** Com as 3 câmeras ligadas, abrir o app: as três aparecem como "connecting"
      e depois "connected", em paralelo (não uma depois da outra). No Monitor de Atividade há
      três processos `StillpointWorker`. Nomes e ordem como antes (SL3_1, T7_1, T5_1).
- [ ] **Identify** em cada uma: o obturador até a metade responde na câmera certa.
- [ ] **It's bullet time, At once**, Download wait 10 s: as três fotos chegam; nomes dos
      arquivos como sempre (`01_SL3_1_IMG_xxxx.CR3`). Repetir 3 vezes.
- [ ] **Fotos recusadas, com câmeras de verdade (branch `sweep-limite`):** Sweep 0,3 s, 1 → 3 → 1 com
      3 câmeras, "Shoot anyway": a câmera 2 é recusada na volta; no fim, "Done with 1 photo missing:
      <câmera 2> (shot 4) — asked 0.6 s after their previous shot." em âmbar, uma linha na Activity,
      etiqueta "1 MISSING" na sessão (que tem 4 fotos). Fechar e abrir o app: a etiqueta continua.
- [ ] **Download adiado (branch `sweep-limite`):** Sweep 1,2 s, 1 → 3 → 1, Loops 2 com 3 câmeras
      (cada câmera repete a ≥ 2,4 s): durante o plano, o log de cada processo (`Logs/worker-*.txt`)
      mostra "Photo n kept on the camera until the plan ends"; as fotos chegam depois do último
      disparo, em ordem; a sessão fica completa (9 fotos) e nenhum disparo é recusado. Cancelar no
      meio: as fotos já tiradas chegam mesmo assim.
- [ ] **Timing: Sweep 0,5 s; Groups; Sweep 0,2 s** com a Live aberta: sons de grupo e
      metrônomo nos tempos certos; a Live mostra cada disparo; as fotos chegam numeradas pelo item.
- [ ] **Cancelar** na contagem e esperando as fotos: para como antes.
- [ ] **Camera settings**: a tela mostra as três; mudar ISO numa e em All cameras; Test shot; Match
      automatically: tudo como na 2.10.0. (Cada leitura passa pelo processo da câmera.)
- [ ] **Queda.** Desligar a T5 no botão: em até ~15 s ela aparece "disconnected"; as outras duas
      seguem disparando. Religar: volta sozinha com o mesmo nome e posição.
- [ ] **Travamento simulado.** No Monitor de Atividade, "Forçar encerrar" um `StillpointWorker`:
      a câmera dele aparece como caída e volta sozinha em alguns segundos; o app não trava.
- [ ] **Restart camera connections** (menu): as três caem e voltam.
- [ ] **Fechar o app**: os três processos somem (Monitor de Atividade).
- [ ] **Câmeras simuladas** (`STILLPOINT_FAKE_CAMERAS=9 ./build/macos-arm64/Stillpoint`): tudo como
      antes, sem processos trabalhadores.
- [ ] **Terminal**: `./build/macos-arm64/"Stillpoint Terminal App"` igual à 2.10.0.
- [ ] **Windows**: compila (`StillpointWorker.exe` ao lado de `Stillpoint.exe`); conexão, disparo e
      Camera settings com as câmeras.

## 22. Medição: a mesma câmera repetindo (branch `sweep-limite`)

Pergunta: qual o menor espaço que uma câmera aceita entre duas fotos suas, quanto a foto atrasa
se o programa insiste no "busy", e se insistir atrapalha. Programa: `SdkMultiprocTest` com
`--repeat`. Uma câmera só (T7), no cabo e na porta de sempre; cartão com espaço; modo M.

Compilar (Mac):
```
cd ~/Developer/stillpoint
cmake --build --preset macos-arm64-release --target SdkMultiprocTest
```

- [ ] **A. Sem insistir, por espaço.** Rodar uma vez para cada espaço (900, 1200, 1500, 1800 ms):
      ```
      ./build/macos-arm64/SdkMultiprocTest --model T7 --repeat 5 --gap 900
      ./build/macos-arm64/SdkMultiprocTest --model T7 --repeat 5 --gap 1200
      ./build/macos-arm64/SdkMultiprocTest --model T7 --repeat 5 --gap 1500
      ./build/macos-arm64/SdkMultiprocTest --model T7 --repeat 5 --gap 1800
      ```
      No fim de cada rodada o programa imprime a tabela `shot | planned | accepted | late | attempts
      | result` e `accepted n/5; photos downloaded: n`. Anotar, por espaço, quantas das 5 foram
      aceitas. O menor espaço com 5/5 é o limite real da câmera.
- [ ] **B. Insistindo, por espaço.** As mesmas rodadas com `--retry` (ex.:
      `./build/macos-arm64/SdkMultiprocTest --model T7 --repeat 5 --gap 900 --retry`). Anotar: todas
      aceitas? Quantas tentativas e quantos ms de atraso (`late ms`) nas fotos que precisaram
      insistir? As 5 fotos baixaram? A câmera continuou normal depois (`s` numa rodada comum)?
- [ ] **C. Rápido com insistência.** `--repeat 5 --gap 300 --retry`: mostra o pior caso (o app
      pedindo muito antes do que a câmera aceita). Anotar o atraso de cada foto.
- [ ] Os logs ficam em `~/Desktop/sdk-multiproc-test/log-<câmera>.txt`; mandar as tabelas.

**Resultado (2026-10-22, T7, RAW):** 0,9 s → 3/5; 1,2 s → 4/5; 1,5 s → 4/5; 1,8 s → 5/5. Com
`--retry`, 5/5 nas duas rodadas, mas atrasos de 0,8 a 2,9 s por foto, acumulando. Na rodada de
0,3 s com insistência a câmera aceitou a 2ª foto **929 ms** depois da 1ª: o limite da T7 é ~0,95 s.
As recusas a 1,2 e 1,5 s vieram do download (~1 s por CR2) travando o laço e atrasando o pedido
seguinte. Decisões (2026-10-22): não insistir; aviso na Timeline a 1,0 s; download adiado até o fim
do plano (abaixo).

- [ ] **D. Download adiado.** `./build/macos-arm64/SdkMultiprocTest --model T7 --repeat 5 --gap 1000 --defer`:
      durante os disparos aparece "photo offered by the camera; kept there (deferred, n waiting)" e
      nenhuma linha `download`; depois do 5º disparo, "downloading 5 deferred photo(s)" e as 5
      linhas `download … (ok)`. Esperado: 5/5 aceitas (o download não atrasa mais o pedido).
- [ ] **Resultado D/E (2026-10-22):** T7 e SL3 seguraram 6 RAW e baixaram depois; T5 segura 3–4 e
      recusa as seguintes (decisão: sem teto; ver ROADMAP). SL3 limite ~1,0 s, T5 ~1,07 s (as três
      a 1/5 s). T5 com cartão ruim: SDK travado 2 min por foto, erro 0x02, câmera caiu.
- [ ] **E. Quantas a câmera segura (sem cartão).** Tire o cartão e rode
      `./build/macos-arm64/SdkMultiprocTest --model T7 --repeat 12 --gap 1000 --defer`. Anotar em
      qual foto a câmera começa a recusar (memória interna cheia) e se as fotos anteriores baixam
      depois. Repetir com o cartão dentro.

## 23. Project (etapa 17)

Sem câmeras (`STILLPOINT_FAKE_CAMERAS=9`) e depois com câmeras. Desenho em `docs/project.md`.

- [ ] **Sem Project:** na barra de cima, ao lado do logo, o botão "No project ▾"; o menu traz os
      recentes (se houver), "Open project…" e "New project…". Disparar cria a sessão na pasta de
      dados, como sempre; a lista não tem divisor nem etiqueta nova.
- [ ] **New project…** (2.12.2): abre a caixa do app pedindo só o nome ("A folder with this name
      will be created in ~/Pictures/Stillpoint."); caracteres proibidos nem entram; Enter/Create
      cria `~/Pictures/Stillpoint/<nome>` (a pasta `Stillpoint` é criada na primeira vez) e abre o
      projeto. O botão da barra passa a mostrar o nome e "0 · 0"; aviso "Project: Teste" na
      Activity. Na pasta: `stillpoint-project.json`, `Originals/`, `Edited/`, `Exports/`. Nome já
      usado na pasta padrão (projeto ou pasta qualquer) → aviso âmbar na própria caixa ("There is
      already a project named…"), a caixa fica aberta e nada é criado nem aberto. "Choose
      another folder…" (à esquerda, na mesma caixa) abre o seletor do sistema já na pasta padrão,
      como antes. O menu do botão agora tem o projeto atual (nome, caminho, "Project window…",
      "Open folder"), os recentes, "Switch project…", "New project…" e "Close project".
- [ ] **Settings → New projects** (2.12.2): mostra a pasta padrão (`~/Pictures/Stillpoint` no Mac,
      `C:\Users\<você>\Pictures\Stillpoint` no Windows); "Change…" abre o seletor e a escolha fica
      no `settings.txt` (`projectsFolder=`), valendo para os próximos "New project…" e como pasta
      inicial do "Open project…". Fechar e abrir o app: continua a escolhida.
- [ ] **Disparar com Project aberto:** a sessão nova vai direto para `Originals/<sessão>/`
      (com `session.json`: shotAt, timing, plan, cameras) e aparece no alto da lista (parte do
      projeto); o botão da barra conta 1 sessão. Fechar o app: **não** pergunta por sessão não salva.
- [ ] **Grupo "Not in project":** com projeto aberto, as sessões do projeto ficam em cima; as que
      estão só no app ficam no grupo "› Not in project · n", **recolhido por padrão**; clicar abre
      e fecha; cada sessão tem "Add to project ↑". Abre sozinho quando uma sessão sai do projeto e
      quando a sessão aberta está nele. Sem sessões fora do projeto, o grupo não aparece.
- [ ] **Segurar e arrastar:** segurar uma sessão (fora dos botões) e arrastar: uma cópia segue o
      ponteiro; soltar sobre a área do projeto na lista (contorno tracejado "Drop to add to
      project") ou sobre o botão do projeto (barra de cima) = Add to project; uma sessão do projeto
      solta sobre "Not in project" (mesmo recolhido, e mesmo com 0 sessões fora — a linha fica
      sempre visível com projeto aberto) = Remove from project. O alvo sob o ponteiro acende; nada
      de texto fica selecionado pelo caminho.
- [ ] **Teclado nas confirmações:** Enter = botão verde (ex.: "Shoot anyway"), Esc = sair ("Cancel"
      ou, sem ele, o outro botão, ex. "Fix timing"); Esc também fecha Save, Project, recentes,
      Reorder by photo (como Cancel) e Camera settings. Clicar fora fecha também Reorder by photo,
      Camera settings e About.
- [ ] **Botão da janela Project** (ícone com moldura à direita de "Sessions", só com projeto
      aberto) abre a janela Project. "Delete session" na galeria virou o ícone de lixeira com moldura.
- [ ] **Nome na janela Project:** o nome no topo é um campo; clicar, mudar e Enter (ou sair do
      campo) renomeia como o "Rename project…"; nome inválido fica âmbar com aviso; Esc desfaz a
      edição; Cmd+Z desfaz o rename.
- [ ] **Rename project…** (menu da barra): pergunta o nome, valida (sem / \ : * ? " < > |, não
      começa com ponto), renomeia a **pasta** e o projeto; a barra, o `settings.txt` e os recentes
      passam a apontar para a pasta nova. Com a pasta aberta no Finder/Explorer ou por outro
      programa (ex.: um arquivo dela aberto no Preview, no Windows), aparece a caixa "Could not
      rename the project" com o motivo e nada muda.
- [ ] **Add / Remove (botão):** com uma sessão da pasta de dados aberta, o botão "Add to project"
      no cabeçalho da galeria (ou o "Add to project ↑" da lista) move a pasta para `Originals/` e a
      sessão sobe para cima do divisor; "Remove from project" move de volta (volta a contar como
      não salva). Nada é apagado nos dois sentidos.
- [ ] **Janela Project ("Project window…" no menu da barra):** lista com caixinha, miniatura, rótulo
      editável (clicar, digitar "Pose 7", Enter → aparece na lista de sessões como "Pose 7 · Oct 22,
      14:30"), data e Timing, nº de fotos, etiqueta "originals" / "Edited n / m"; "Show" abre a
      sessão; "Edited only" marca as que têm alguma foto editada (desde 2026-11-10; antes só as completas); "Remove from project" com confirmação; "Open
      folder" abre a pasta; "Close project" (confirmação) tira as sessões da lista sem apagar.
- [ ] **Edited/:** copiar à mão 3 fotos de uma sessão de 9 para `Edited/<sessão>/` com o mesmo
      nome (pode ser o próprio JPG renomeado para .jpg) e voltar ao app (clicar nele): a etiqueta
      vira "Edited 3 / 9" (âmbar) na lista e na janela, sem reabrir; com as 9, "Edited 9 / 9"
      (verde) e o botão da barra mostra "1 edited".
- [ ] **Export… (janela Project):** abre a janela de salvar só com as sessões do Project
      selecionadas; no rodapé, "Use edited photos when available" (ligado); com uma sessão 3/9
      marcada, aviso âmbar "… has only some photos edited"; o botão diz "Export n sessions"; não
      pergunta a pasta: grava em `Exports/<nome>/`; **a sessão continua no app e no Project** (sem
      a pergunta "Discard from app"); Sequence usa as fotos de `Edited/` onde existem.
- [ ] **Save sessions (botão de cima) com Project aberto:** continua como antes (pergunta a
      pasta); uma sessão do Project selecionada é copiada e **fica**; as da pasta de dados seguem a
      regra antiga (Discard / Keep).
- [ ] **Switch project… / Open project…:** no menu da barra, os recentes (nome; "not reachable"
      apagado); "Switch/Open project…" abre o seletor de pasta; uma pasta sem o json pergunta
      "Create project here". O botão "Switch…" da janela Project abre a lista de recentes.
- [ ] **Project em HD desligado:** fechar o app, desconectar (ou renomear a pasta), abrir: botão da
      barra âmbar "not reachable" (2.12.1; na 2.12.0 ficava "No project"), lista só com as sessões
      da pasta de dados; disparar agora cria a sessão no app, não no projeto. Voltar a pasta e
      abrir o menu do botão (ou clicar no ícone ↻ ao lado do "not reachable", ou trocar de janela
      e voltar) → as sessões do projeto voltam sozinhas, sem reabrir pelos recentes.
- [ ] **Reordenar fotos / apagar foto** numa sessão do Project: funciona como fora dele (renomeia
      dentro de `Originals/`).
- [ ] **Abrir um projeto com sessões** (Open/Switch): a primeira sessão dele fica selecionada e o
      grupo "Not in project" recolhido.
- [ ] **Clicar fora de uma janela** (Rename, janela Project, "Save sessions" (Photos/Sequence),
      Save as photos/sequence, Settings, lista de recentes e confirmações que têm "Cancel") = Cancel.
      Começar o clique dentro e soltar fora não fecha.
- [ ] **Seleções lembradas:** desmarcar uma sessão na janela Project, fechar e abrir de novo →
      continua desmarcada; na janela de salvar, formato/nome/velocidade/"Same settings" escolhidos
      voltam iguais na próxima vez, inclusive depois de fechar e abrir o app (`settings.txt`,
      `pref.export=`); a seleção de sessões da janela de salvar volta igual dentro da mesma abertura
      do app.
- [ ] **Desfazer / refazer** (Ctrl+Z e Ctrl+Shift+Z; no Mac também Cmd): renomear projeto, Add /
      Remove from project (botão, arrasto, janela Project), rótulo de sessão, "Copy from camera" e
      **cada mudança** no Camera settings, ordem das câmeras (^ v, arrasto, Reorder by photo),
      ordem das fotos de uma sessão, **apagar foto** e **apagar sessão** (lixeira do app em
      `<dados>/Photos/.trash` — no Mac, `~/Library/Application Support/Stillpoint/Photos/.trash` —,
      esvaziada ao abrir o app: o desfazer de apagar vale só na mesma abertura; a sessão volta
      para onde estava — projeto ou app). Apagar uma foto **não** renumera as outras: o número é a
      posição da câmera, e o buraco fica. O aviso do rodapé mostra ↶ "Undo: …" ou
      ↷ "Redo: …". Sem nada a desfazer: "Nothing to undo". Dentro de um campo de texto, Ctrl+Z é
      o desfazer do texto.
- [ ] **Botão direito → pastas:** "Open originals folder" (ou "Open folder" fora do projeto) e
      "Open edited folder" (apagado com "none yet" sem fotos editadas; a contagem é relida ao abrir
      o menu, então fotos novas em `Edited/` aparecem sem reabrir nada). "Edited n / m" aparece
      também nas sessões da janela Save sessions.
- [ ] **Save sessions:** mudar uma configuração com a coluna rolada mantém a rolagem.
- [ ] **Aviso do rodapé:** verde neon, fica 2,5 s e some devagar; com o ponteiro em cima não some
      (sai e a contagem recomeça); o X fecha na hora.
- [ ] **Esc em Camera settings** com a caixa "Calibrate with chart" aberta: fecha só a caixa; o
      segundo Esc fecha o Camera settings.
- [ ] **Botão direito numa sessão:** menu à direita do ponteiro com "Add label…" (ou "Rename
      label…" / "Remove label"), "Show session", "Add/Remove from project" (com projeto aberto) e
      "Delete session…" (vermelho, com confirmação). O cabeçalho da galeria só tem "Add to project"
      (para sessão fora do projeto); tirar do projeto é pelo menu ou arrastando.
- [ ] **Arrastar do projeto para fora:** a área "Not in project" inteira (do divisor até o fim da
      coluna) recebe, com contorno tracejado "Drop to remove from project" — não só o texto.
- [ ] **Rótulos sugeridos:** ao digitar um rótulo (menu do botão direito ou janela Project), os
      rótulos já usados em outras sessões aparecem como sugestão (lista do sistema ao digitar).
- [ ] **Arrastar de "Not in project":** a área tracejada do projeto fica dentro da coluna (corta
      nos limites dela e fica atrás da barra de rolagem). "Add to project ↑" mostra a caixinha no
      hover também na sessão selecionada.
- [ ] Fechar e abrir o app: o Project continua aberto (`settings.txt`, `project=`).
- [ ] **Clear recent** (2.12.5): no menu do botão de projeto, texto discreto à direita do título "Recent" (acende no hover); limpa a lista
      (o projeto aberto continua lembrado), aviso "Recent projects cleared"; Cmd/Ctrl+Z devolve a
      lista inteira; fechar e abrir o app mantém o estado (`settings.txt`, `recentProjects=`).
- [ ] **Uso do computador no Activity** (2.12.4): abrir o Activity → no rodapé, "Stillpoint — CPU ·
      410 MB · 1 + 3 camera processes | Computer — CPU · 9,1 GB of 16 GB free · Project disk 212 GB
      free"; ~2 s depois as % de CPU aparecem e atualizam a cada 2 s. "Show technical details" acrescenta
      os threads. Fechar o Activity: para de medir (Monitor de Atividade/Gerenciador de Tarefas: o
      app volta ao consumo de antes). "Copy log" inclui a linha "Usage: …". Disparar com o Activity
      aberto: a CPU sobe durante o download e volta. Sem projeto: "App disk".

## 24. Lenticular (etapa 19, entrega 1)

Sem câmeras (`STILLPOINT_FAKE_CAMERAS=9`) serve para tudo, menos para a impressão.

- [ ] **Save sessions** abre direto a janela (sem a escolha Photos/Sequence de antes) com três seções:
      **Photos**, **Sequence** e **Lenticular**, cada uma com uma caixa de marcar. Marcada = abre as
      configurações; desmarcada = só o cabeçalho, "Off". Clicar no cabeçalho de uma desmarcada liga e
      leva a prévia para ela; numa marcada, só leva a prévia (a seção em foco tem borda verde; as outras
      marcadas mostram "PREVIEW"). Nenhuma marcada: "Tick at least one output…" e o Save fica apagado.
      Quem usava Sequence com "Also save the photos" abre com Photos (Original) + Sequence marcadas.
- [ ] **Recolher:** cada seção marcada tem um botão de seta à direita do cabeçalho; ele esconde só as
      configurações (a saída continua marcada, o resumo continua no cabeçalho). Fechar e reabrir a
      janela (ou o app) mantém recolhida.
- [ ] **Photos — Originals e Converted:** duas caixas independentes. Só Originals = os arquivos como a
      câmera salvou; só Converted = um arquivo por câmera no formato escolhido (clicar num formato já
      marca Converted); as duas = pastas `Originals/` e `JPG/` (ou o formato escolhido) — dentro de
      `Photos/` se houver outra saída marcada. Nenhuma das duas: "Photos: choose the originals, a format,
      or both" e o Save fica apagado. Quem salvou PNG na versão anterior abre com só Converted + PNG.
- [ ] **Teatro:** ícone de entrar = duas pontas de seta para fora; de sair = para dentro, sem traço
      horizontal e bem separadas (não pode parecer um X).
- [ ] **Cabeçalho das seções:** desligada, o cabeçalho inteiro é um alvo só: o mouse em qualquer parte
      acende caixa, nome e "Off" juntos, e o clique liga. Ligada, cada parte acende sozinha: a caixa
      (desliga), o nome e o "PREVIEW" (levam a prévia) e a seta de recolher. Ligada, desligada ou
      recolhida, o cabeçalho tem sempre a mesma altura.
- [ ] **Animações:** marcar/desmarcar Photos (ou trocar a prévia para outra saída e voltar) faz a
      fileira de miniaturas abrir e fechar deslizando, sem a fileira se reajustar no fim; desmarcar
      todas as saídas fecha a prévia grande deslizando, e marcar uma abre. Na lista de câmeras, ^ e v
      fazem as duas linhas trocarem de lugar deslizando.
- [ ] **Caixas de marcar:** o sinal ✓ centralizado em todas (sessões, seções, Originals/Converted).
- [ ] **Espaços estáveis:** o espaço entre a fileira de miniaturas e a seção Photos é sempre o mesmo
      (abrir/recolher, trocar de prévia, com ou sem a barra de rolagem da fileira). Quando as seções
      precisam rolar, a barra fica afastada das caixas, e as caixas não estreitam quando ela aparece.
- [ ] **Nome da seção ligada:** clicar no nome ou na descrição não faz nada (só "PREVIEW" leva a prévia).
- [ ] **Teatro:** entrar e sair do modo teatro faz a prévia crescer e encolher deslizando.
- [ ] **Bullet time (animações):** Advanced e Hide deslizam a altura do painel; trocar o modo
      (At once, Sweep…), Add step e o X de um passo deslizam em vez de pular.
- [ ] **Listas de opções:** em Camera settings (e no Direction do Bullet time), abrir qualquer lista
      mostra a lista com a cara do app (fundo escuro, verde na opção atual), não a do sistema. ↑ ↓ e
      Enter escolhem; Esc fecha só a lista (a janela continua aberta); clicar de novo na caixa fecha.
- [ ] **Camera settings:** Hide photos e Show photos recolhem e abrem a fileira deslizando.
- [ ] **Lupa (Interlaced):** fora do teatro a lupa é menor e fica sempre dentro da prévia, com a
      etiqueta "2× …" dentro dela; no teatro, maior.
- [ ] **Tilt:** com Animation, arrastar para cima e para baixo troca a foto ("drag up and down",
      cursor ↕); com 3D, para os lados.
- [ ] **PREVIEW:** fica visível em todas as seções ligadas; na que está na prévia, aceso (verde).
- [ ] **Alinhamento:** a borda direita das caixas Photos/Sequence/Lenticular alinha com a da prévia,
      com e sem rolagem.
- [ ] **Copy from camera (Camera settings):** a lista "Choose…" abre com a cara do app.
- [ ] **Botão direito numa foto:** "Show in Finder" abre o Finder com a foto selecionada (no Windows,
      "Show in Explorer"); "Open in default app" abre a foto no programa padrão (Pré-visualização,
      Fotos…). Câmera que não mandou foto: as duas opções ficam apagadas.
- [ ] **Apagar foto:** botão direito numa miniatura ou na foto grande (tela principal e tela cheia) →
      "Delete photo 03…" → confirmar: a miniatura encolhe e some, a foto grande se apaga. Cmd+Z volta.
- [ ] **Apagar sessão:** pela lixeira, pelo botão direito ou "Delete session": a linha da sessão voa
      até o botão da lixeira (encolhendo), a lixeira dá um pulo e a linha fecha. Cmd+Z volta.
- [ ] **Arrasto da prévia lenticular:** segurando e saindo da prévia, a seta (↕ ou ↔) continua até
      soltar o botão.
- [ ] **Tela cheia:** só o ícone da lixeira (sem "Delete session"); ele apaga a sessão, e a foto grande
      voa até ele. Uma foto: botão direito nela, ou a tecla Delete.
- [ ] **Câmeras reais:** os itens que precisam delas estão juntos na seção 25.
- [ ] **Várias saídas:** Photos + Sequence + Lenticular marcadas → Save: na pasta da sessão, `Photos/`,
      `Sequence/` e `Lenticular/`; só uma marcada → os arquivos direto na pasta da sessão. Na lista à
      esquerda: "→ Originals + MP4 + Lenticular 60/720". Export… da janela Project faz o mesmo em
      `Exports/`.
- [ ] **Prévia:** arrastar para a esquerda/direita na foto grande troca a foto ("Tilt preview · photo n
      of 9"); "Reverse order" inverte o sentido. Botão **Interlaced** (canto da prévia): mostra um
      recorte 1:1 do centro do arquivo final, com as faixas no tamanho real em pixels ("12 px per
      lens · strips horizontal"); em 3D as faixas ficam verticais; mudar LPI/dpi/tamanho redesenha.
- [ ] **Leitura:** com 9 fotos, 60 LPI e 720 dpi: "12 columns per lens", "1.33 printer dots per photo"
      em âmbar (menos de 2); 1440 dpi: 2.67, verde; 75 LPI a 600 dpi: 8 colunas, "Less than one printer
      dot" em vermelho e o botão Save continua ativo (é aviso, não trava). "Other" no LPI e no dpi
      abre um campo numérico (vírgula aceita; inválido fica âmbar e não grava).
- [ ] **Tamanho:** 15 × 10 cm a 720 dpi = 4252 × 2835 px; trocar para "in" mostra 5.91 × 3.94; o botão ⇄
      inverte; presets 10 × 15 / A4 etc.
- [ ] **3D:** a lista de lâminas passa a 20/30/40 LPI; o texto explica que as faixas ficam em pé.
- [ ] **Save:** em `Exports/<data>/` (projeto) ou na pasta escolhida: `<data> lenticular 60lpi 720dpi
      flip.tiff`. Abrir no Preview/Visualizador: Inspector mostra 720 × 720 dpi e o tamanho em
      polegadas igual ao pedido. Ampliando muito, faixas horizontais finas alternando as fotos
      (Animation) ou verticais (3D).
- [ ] **Resumo na lista:** "TIFF · 60 LPI · 720 dpi · 15 × 10 cm · Animation" (⚠ quando há aviso); a
      configuração volta igual na próxima abertura (`pref.export`).
- [ ] **Impressão (quando houver lâmina e impressora/gráfica):** imprimir a 100%, encostar a lâmina com
      as lentes no sentido certo (deitadas para Animation) e inclinar: as fotos devem trocar. Anotar
      aqui o resultado e a combinação usada.

### 24b. Lenticular, entrega 2 (folha de teste e marcas) — câmeras simuladas

- [ ] Ícone da lâmina na barra de cima (ao lado do som): abre **Pitch test** com Effect, Lens sheet,
      Printer e Paper size (as mesmas opções da exportação; começa em A4).
- [ ] Save pitch test: aviso "Making the pitch test sheet…", depois "Pitch test saved" e o Finder abre
      com o arquivo selecionado em `Imagens/Stillpoint/Exports` (ou `<Projeto>/Exports`). Abrir o TIFF:
      11 faixas listradas com o número em cima de cada uma (3D: faixas uma embaixo da outra, número à
      esquerda). Esc fecha só a janela do teste.
- [ ] Mudar qualquer opção da janela do teste: a janela não pisca. "21 strips · 59.50 to 60.50 LPI,
      every 0.05". "Finer steps" mostra a linha "FINER" com every 0.04 / 0.03 / 0.025 / 0.02 / 0.01, cada
      um com o seu "?" (quanto cobre e até que tamanho de impressão serve), em volta do "Measured pitch"
      ou do LPI da embalagem sem ele; 0.025 mostra 3 casas (59.750 to 60.250). "Normal steps" volta.
      Na lupa da prévia os números aparecem; a roda do mouse afasta até 0,5×. No arquivo: 21 faixas, números em pé em cima de cada uma
      (Animation) ou à esquerda (3D).
- [ ] Papel menor que A4 (ex.: 10 × 15): aviso amarelo e "Save pitch test" apagado. Com a impressão
      de 20 × 30 e o teste em A4: aviso amarelo de que as faixas (25,9 cm) são mais curtas que a
      impressão (30 cm); com 30 × 40 o aviso some.
- [ ] Janela de salvar, linha de cima, à direita: "HIDE PREVIEW" esconde a foto grande e as miniaturas
      (deslizando) e vira "SHOW PREVIEW"; a escolha fica para a próxima vez.
- [ ] Combinação que a impressora não separa bem (ex.: 100 LPI a 720 dpi): no resumo da sessão (lista à
      esquerda) e no cabeçalho do Lenticular aparece um triângulo amarelo de alerta.
- [ ] Janela de salvar: os textos explicativos viraram "?" ao lado do nome de cada opção (Effect, Lens
      sheet, Printer, Print size, Marks, Originals, Converted, Quality, Size, Speed, Name). Passar o
      mouse mostra a explicação por cima, sem ser cortada.
- [ ] A prévia da folha fica sempre à direita (sem botão), sem rolagem lateral, deitada ou em pé.
      Com o mouse em cima, a lupa mostra as listras no tamanho real; a roda do mouse aproxima e afasta
      (1× a 8×, a etiqueta mostra o zoom). O mesmo na lupa da prévia Interlaced do Lenticular.
- [ ] Prévia Interlaced do Lenticular mostra a margem branca, as marcas de corte e as cruzes; desmarcar
      "Crop marks" / "Alignment marks" ou mudar Bleed redesenha sem elas. A seção Lenticular não tem
      mais o "Print pitch test…" (fica no rodapé e no ícone da tela principal).
- [ ] Salvar o Lenticular: ao lado do TIFF, "… settings.txt" com lâmina (embalagem e medido), impressora,
      tamanho, efeito, ordem e lista das fotos, marcas, sangria e "print at 100%". O mesmo texto vai
      dentro do TIFF (Finder → Obter Informações, ou Photoshop → Arquivo → Informações do arquivo).
- [ ] Lista de câmeras com rolagem: um respiro entre a barra e as câmeras.
- [ ] Settings → New projects: depois de "Change…" para outra pasta, aparece "RESET TO DEFAULT"; ele volta
      para `Imagens/Stillpoint` e some. A linha "Save to" da janela de salvar (sem projeto) acompanha
      (`…/Stillpoint/Exports`). Na janela de salvar, depois de "Choose another folder…", "RESET TO DEFAULT"
      volta para a pasta padrão.
- [ ] **Teclado (Tab):** na tela principal o Tab passa pelos botões e campos (topo, câmeras, Bullet
      time) e por uma sessão só (não passa pelas miniaturas das fotos), com contorno verde. Com uma janela
      aberta (Camera settings, Save sessions, avisos), o Tab fica só dentro dela. Shift+Tab volta.
- [ ] Camera settings pelo teclado: o Tab passa só pela linha "All cameras" (listas e "±") e depois
      pelos botões de baixo (Test shot, Match automatically, Use gray card, Read again, Calibrate with
      chart, Copy from camera, Done). Numa lista, ↑ ↓ vão para a mesma coluna da câmera de cima/de baixo
      (a lista não abre). Enter ou Espaço abre a lista escura do app; com ela aberta, ↑ ↓ andam pelas
      opções, Enter escolhe, Esc fecha. Depois de escolher, o foco continua na mesma caixa.
- [ ] Caixa do "±" (PICTURE STYLE & QUALITY): Enter no "±" abre a caixa com o foco na primeira lista;
      ↑ ↓ andam entre as listas dela; Enter abre a lista e ↑ ↓ passam a andar pelas opções. Depois de
      escolher, a caixa continua aberta e o foco fica na mesma lista. Tab sai da caixa (ela fecha) e segue
      para o próximo item depois do "±". Esc fecha e o foco volta para o "±".
- [ ] Caixa do "±": depois de escolher um valor com o teclado, o valor novo aparece assim que a câmera
      confirma (não volta para o anterior) e o foco continua na mesma lista.
- [ ] Caixas de marcar do Save sessions e da janela Project: com o Tab, o quadrado ganha o contorno verde.
- [ ] Ctrl/Cmd+Z depois de "Close project" abre o projeto de novo (refazer fecha). Depois de "New project…",
      desfazer volta ao projeto de antes (ou a nenhum) e apaga a pasta criada, se ainda estiver vazia (com
      fotos ou outros arquivos, ela fica e aparece um aviso); refazer cria o projeto de novo.
- [ ] Menu do projeto (botão do projeto, no alto à esquerda): aberto com Enter, ↑ ↓ andam pelas opções,
      Enter escolhe, Esc fecha e volta ao botão; o Tab fecha o menu e vai para o próximo botão.
- [ ] Lista de câmeras: o Tab passa só pelos botões de uma câmera (Identify, setas de mover); ↑ ↓ vão para
      o mesmo botão na câmera de cima/de baixo. Depois de mover uma câmera com Enter, o foco acompanha a câmera.
- [ ] Bullet time: trocar o modo de disparo (At once, Sweep, Groups…) com Tab + Enter mantém o contorno no modo
      escolhido; o próximo Tab segue dali.
- [ ] Janela Project: o Tab passa só pelos controles de uma sessão (caixa de marcar, Label, Show); ↑ ↓ vão
      para o mesmo controle na sessão de cima/de baixo.
- [ ] Switch… (Open a project): o Tab para num projeto só; ↑ ↓ andam pelos projetos da lista (sem rolar a
      janela); Enter abre.
- [ ] Mac: Cmd+` passa da janela principal para a Live (e para a Live 2), inclusive em tela cheia; Cmd+Shift+`
      volta na ordem contrária. Também no menu Window → Cycle Through Windows.
- [ ] Janela Live: o Tab passa pelas opções (Speed, Reverse loop, Mode, Layout, Group sounds, Display, Always on
      top, Close…) com contorno verde; as opções ficam à mostra enquanto o foco estiver nelas; Enter aperta o
      botão / marca a caixa e o foco continua nele.
- [ ] Save sessions: o Tab para numa sessão só da lista; ↑ ↓ trocam de sessão (mostrando as opções dela).
      Enter em qualquer opção (formatos, Preview, Unselect all…) mantém o foco nela ou no lugar dela.
- [ ] Save sessions: Cmd+Z desfaz cada mudança (formatos, saídas, nome, sessões marcadas); Cmd+Shift+Z refaz.
      Ao fechar a janela, essas mudanças saem do desfazer.
- [ ] Save sessions: ← → trocam a foto da prévia em Photos e a foto do Tilt em Lenticular.
- [ ] Lenticular: o botão do modo teatro (à esquerda, em cima da prévia) vem antes de Tilt / Interlaced no Tab.
- [ ] Live: "Another window" abre a Live 2 um pouco à direita e abaixo da primeira (fora de tela cheia).
- [ ] Live: as duas janelas têm "Another window"; com as duas abertas, fica desligado nas duas. Fechando a
      original, a outra passa a se chamar "Live" (título da janela e do alto) e o botão volta a funcionar; ele
      abre a outra de novo, como "Live 2", deslocada. "Live view" na janela principal traz a Live que está aberta.
- [ ] Activity: ligar/desligar "Show technical details" não faz a lista pular — a linha que estava no alto
      continua no mesmo lugar (no fim da lista, continua no fim); as linhas técnicas aparecem devagar.
- [ ] Confirmações (ex.: "Calibrate with chart"): Enter aperta o botão que está com o contorno verde
      (Cancel, Open chart ou Start), não sempre o principal.
- [ ] Pitch test: Enter numa opção muda a opção e o foco continua nela; o próximo Tab segue dali.
- [ ] Pitch test: mudar qualquer opção (Lens sheet, Paper size, Finer steps, o passo) e apertar Ctrl+Z
      (Cmd+Z no Mac) volta a opção anterior; Ctrl+Shift+Z refaz. Ao fechar a janela, essas mudanças saem do
      desfazer.
- [ ] Camera settings: apertar Esc (ou Done) no meio do Test shot, do Match automatically ou do Calibrate
      with chart cancela o que estava em andamento; o Activity não fica preso em "Receiving photos" e as
      câmeras voltam como estavam.
- [ ] Enter marca/desmarca caixas de marcar (ex.: "Match automatically"), como o Espaço.
- [ ] Activity aberto: o Tab circula só dentro dele (Show technical details, Copy log, botões); fechado,
      volta ao normal.
- [ ] Sessões pelo teclado: o Tab para só na sessão aberta (ou na primeira); ↑ ↓ trocam de sessão;
      ← → trocam de foto.
- [ ] "?" com o Tab: a explicação aparece enquanto o "?" tem o foco e some no próximo Tab, sem precisar
      mexer o mouse.
- [ ] Lupas: segurando o botão esquerdo somem a mira "+" e a legenda do zoom; ao soltar, voltam. A instrução aparece
      embaixo da prévia da folha de teste e na legenda da vista Interlaced.
- [ ] New project → "CHOOSE ANOTHER FOLDER…": a caixa continua aberta; escolhida a pasta, o texto muda
      para "…will be created in <pasta escolhida>"; digitar o nome e "CREATE" cria o projeto lá. Nome já
      usado nessa pasta: aviso na caixa. Depois de escolher outra pasta aparece "RESET TO DEFAULT", que volta
      o texto para a pasta padrão e some.
- [ ] Rodapé da janela de salvar: **Print pitch test** entre Cancel e Save, apagado sem Lenticular e
      ativo com ele. Salvar com Lenticular sem "Measured pitch": pergunta "Print a pitch test first?"
      (Print pitch test / Save anyway / Don't ask again). Com "Measured pitch" preenchido, não pergunta.
- [ ] Settings → **Opening** Off → fechar e abrir o app: abre direto na tela principal, sem o logo e a
      chuva de código. On volta.
- [ ] Save sessions → Lenticular → Lens sheet: "Print pitch test…" abre a mesma janela com a lâmina e a
      impressora escolhidas ali. Com "Measured pitch" preenchido (ex.: 59.8), as faixas ficam em volta
      dele (59.3 to 60.3).
- [ ] Marks: "Crop marks" e "Alignment marks" marcadas e Bleed "3 mm" por padrão; a leitura mostra
      "file … px with 3 mm bleed and marks". Salvar: o TIFF tem margem branca, risquinhos nos 4 cantos
      e uma cruz com círculo no meio de cada lado. Desmarcar tudo e Bleed "None": o TIFF volta a ter só a
      imagem, no tamanho exato.

## 25. Rodada única com câmeras reais (2.14.0)

Tudo o que só dá para conferir com as câmeras de verdade, numa vez só. Abrir **sem** as câmeras
simuladas (Mac):

```
cd ~/Developer/stillpoint
unset STILLPOINT_FAKE_CAMERAS
./build/macos-arm64/Stillpoint
```

Câmeras ligadas e conectadas antes de abrir. Uma das câmeras com Quality em RAW + JPG (as outras
podem ficar só em JPG).

**A. Camera settings**
- [ ] Abrir Camera settings: todas as listas (ISO, Shutter, Aperture, Exp. comp., Metering, White
      balance, Picture Style, os ajustes do ±) abrem com a cara do app, não a do Mac. ↑ ↓ e Enter
      escolhem; Esc fecha só a lista; clicar de novo na caixa fecha. O valor escolhido chega à câmera
      (conferir no LCD).
- [ ] **Copy from camera → "Choose…"**: a lista também com a cara do app; escolher uma câmera copia
      as configurações dela para as outras; Cmd+Z volta.
- [ ] **Metering + Desfazer:** mudar o Metering de uma câmera → Cmd+Z volta (conferir no LCD) →
      Cmd+Shift+Z refaz. Mudar o Metering em All cameras → Cmd+Z volta todas.
- [ ] **Metering diferente antes do Match:** deixar uma câmera com outro Metering, marcar Match
      automatically e clicar Test shot: aparece "Metering modes differ". "Set all to …" iguala e segue;
      "Keep as they are" segue sem mudar.
- [ ] **Match automatically + Desfazer:** mudar o ISO em All cameras; rodar Test shot com Match
      automatically até ele mudar alguma câmera. Cmd+Z → "Undo: Match automatically (n cameras)": as
      câmeras voltam ao que eram antes do Match (o ISO novo fica). Cmd+Z de novo → só o ISO volta.
      Cmd+Shift+Z duas vezes → ISO e Match de volta.
- [ ] **Hide photos / Show photos** (depois de um Test shot): a fileira de fotos recolhe e abre
      deslizando.

**B. Ordem das câmeras**
- [ ] ^ e v numa câmera: as duas linhas trocam de lugar deslizando; a Activity mostra "Move … up/down".
- [ ] Arrastar uma câmera: Activity "Camera order (dragged)". Reorder by photo → Save order:
      Activity "Camera order from photos". Em Show technical details, a ordem completa.

**C. Fotos de verdade (disparar 1 sessão)**
- [ ] Botão direito numa foto (miniatura e foto grande; também na tela cheia): **Show in Finder**
      abre o Finder com o arquivo selecionado; **Open in default app** abre a foto (a da câmera RAW +
      JPG abre o JPG).
- [ ] **Delete photo…** pelo botão direito na foto da câmera RAW + JPG: animação, os dois arquivos
      saem; Cmd+Z traz os dois de volta.
- [ ] Apagar a sessão (lixeira, fora e dentro da tela cheia): a animação até a lixeira; Cmd+Z volta.

**D. Save sessions com a sessão real**
- [ ] Sem projeto aberto: a linha **Save to** mostra `Imagens/Stillpoint/Exports` (ou a pasta de
      projetos escolhida em Settings + `/Exports`); Save grava lá sem abrir a janela do Mac.
- [ ] Com projeto aberto: **Save to** mostra `<Projeto>/Exports`. "Choose another folder…" troca só
      para este salvamento (ao reabrir a janela, volta ao padrão); "Reset to default" volta ao padrão.
- [ ] Photos com **Originals + JPG**: pastas `Originals/` (com o RAW e o JPG da câmera RAW + JPG) e
      `JPG/` (um JPG por câmera). Com Sequence também marcada, as duas dentro de `Photos/`.
- [ ] Lenticular com a sessão real: prévia Tilt (arrastar ↕) e Interlaced com a lupa; o TIFF sai com
      o tamanho certo (abrir no Pré-visualização → Ferramentas → Mostrar Inspetor: dpi e tamanho).

## 26. Lixeira do app (2.15.0)

Pode ser com câmeras simuladas (`STILLPOINT_FAKE_CAMERAS=9`), mas o item do HD externo precisa de um
projeto num HD externo.

- [ ] Barra de cima: ao lado do botão do projeto, o botão da lixeira (ícone) com o número de itens e o espaço em GB ("3 · 1.6 GB"); parando
      o mouse, "Trash: n items · tamanho · kept 15 days" (vazia: "Trash: empty…").
- [ ] Nome de projeto comprido: aparece cortado com "…" (até 24 caracteres); parando o mouse, o nome inteiro.
- [ ] Apagar uma sessão (fora de projeto): o aviso diz que vai para a Trash por 15 dias; o número do botão sobe.
      Abrir a Trash: a sessão aparece em "In the app" com fotos, tamanho, "deleted just now" e "deleted for
      good in 15 days".
- [ ] Apagar uma foto (botão direito → Delete photo…): aparece como "1 photo from this session".
- [ ] Restore numa linha: a sessão (ou a foto) volta para a lista; a linha sai da Trash.
- [ ] Cmd+Z depois do Restore: a sessão (ou a foto) volta para a Trash; Cmd+Shift+Z restaura de novo.
- [ ] Cada linha tem um ícone: pasta = sessão inteira; imagem = fotos de uma sessão.
- [ ] Delete permanently: pergunta "Delete permanently?"; apaga só aquele item.
- [ ] Apagar uma foto e depois a sessão inteira dela: a linha da foto fica logo abaixo da sessão, apagada, com
      Restore desligado e o aviso "The whole session was deleted after this photo. Restore the session first…".
      Restaurar a sessão: a linha da foto volta a funcionar. Delete permanently na sessão: o aviso diz que leva
      junto a foto apagada antes, e as duas linhas saem.
- [ ] Restore everything: tudo volta (as sessões inteiras primeiro; fotos apagadas antes da sessão voltam para
      dentro dela); Cmd+Z manda tudo de volta para a Trash; Cmd+Shift+Z restaura de novo.
- [ ] Empty trash: pergunta; apaga tudo; a janela mostra "The trash is empty." e o número some do botão.
- [ ] Cmd+Z depois de apagar uma sessão continua trazendo de volta (e ela sai da Trash).
- [ ] Fechar e abrir o app: os itens continuam na Trash (antes eram apagados ao abrir).
- [ ] Projeto aberto: apagar uma sessão do projeto → aparece em "In the project <nome>"; no Finder, a pasta
      `<Projeto>/.stillpoint-trash` (pasta escondida: Cmd+Shift+. mostra) tem a sessão. Fechando o projeto,
      esses itens somem da Trash; abrindo de novo, voltam.
- [ ] Projeto em HD externo: apagar uma sessão é instantâneo (não copia para o computador).
- [ ] Teclado: Tab chega no botão da lixeira; Enter abre; o Tab para numa linha só e ↑ ↓ trocam de linha
      (Restore / Delete now); Esc fecha e volta ao botão.

## 28. Apagar um projeto (2.15.0)

- [ ] Menu do projeto → "Delete project…" (e "Delete project…" na janela Project, ao lado de Close project): o aviso
      diz quantas sessões e o tamanho; Delete project fecha o projeto e a barra mostra "No project".
- [ ] No Finder (Cmd+Shift+. mostra pastas escondidas): a pasta do projeto saiu do lugar e está em
      `<pasta de cima>/.stillpoint-trash/`, no mesmo disco (num HD externo, instantâneo).
- [ ] O projeto sai dos recentes; na Trash aparece com o ícone de pasta, "Project · n sessions · tamanho".
- [ ] Cmd+Z logo depois de apagar: o projeto volta e abre.
- [ ] Restore na Trash (ou Restore everything): a pasta volta para o lugar e para os recentes; sem projeto aberto, ele já abre. Cmd+Z manda de novo para a Trash (e fecha); Cmd+Shift+Z restaura e abre de novo.
- [ ] Projeto num HD desligado: na Trash aparece apagado, com "The disk with this project is not connected…", e
      Restore / Delete permanently desligados. Empty trash não mexe nele (fica até o disco voltar).
- [ ] Sessão apagada de um projeto e depois o projeto inteiro: na Trash, a sessão aparece logo abaixo do projeto,
      apagada, com "follows the project", Restore desligado e o aviso "This session was in the trash of the project
      …, which was deleted after. Restore the project first." Restaurando o projeto (e abrindo-o), ela volta para
      "In the project <nome>".
- [ ] Delete permanently num projeto: o aviso diz que leva junto os itens da lixeira dele; apaga a pasta escondida de vez.

## 30. Várias fotos e o Delete (2.15.0)

- [ ] Com uma sessão aberta, ← → trocam a foto; Shift+← → marcam várias (borda azul); Shift+clique numa miniatura
      também marca o intervalo; um clique simples desmarca.
- [ ] Depois de usar ← → (ou clicar numa miniatura), a tecla Delete apaga a(s) foto(s): "Delete 3 photos?"; um
      Cmd+Z traz todas de volta. Voltando às sessões (↑ ↓ ou clique numa sessão), o Delete volta a apagar a sessão.
- [ ] Botão direito numa das fotos marcadas: "n photos selected" e "Delete n photos…".
- [ ] Tela cheia da sessão: o Tab circula só pelos botões da tela cheia (não vai para a tela de trás).
- [ ] Apagar uma sessão (fora ou dentro da tela cheia) ou fotos: as cópias voam até o ícone da lixeira da barra de
      cima, que aumenta e volta ao tamanho no fim.
- [ ] Apagar a sessão na tela cheia e Cmd+Z: a sessão volta aberta, na tela cheia.
- [ ] Tela cheia: à direita do nome da sessão, o mesmo botão da lixeira da barra de cima (ícone, número e GB); abre a
      Trash por cima da tela cheia. Apagar a sessão ou fotos na tela cheia: a animação vai até esse botão.
- [ ] Trash: a etiqueta "✓ Restored" aparece inteira (sem a linha de cima cortada).

## 29. Lixeira em árvore e "Restored" (2.15.0)

- [ ] Projeto apagado com sessões/fotos na lixeira dele, e sessão apagada depois de fotos dela: na Trash fica em
      árvore (projeto → sessões → fotos), recuado, com linhas-guia.
- [ ] Restore na sessão que tem fotos apagadas antes: a sessão volta para a lista, mas a linha dela fica na Trash
      apagada, com "✓ Restored" e "Restored. It stays here until the photos deleted before it below are restored or
      deleted."; o Restore das fotos abaixo fica liberado. Restaurando (ou apagando) as fotos, a linha da sessão some.
- [ ] O mesmo com o projeto: Restore no projeto → linha com "✓ Restored"; as sessões e fotos da lixeira dele ficam
      liberadas; quando acabarem, a linha do projeto some.
- [ ] Restore everything traz tudo, em rodadas (primeiro projetos/sessões, depois o que dependia deles).

## 27. Apagar várias sessões e o nome Export sessions (2.15.0)

- [ ] O botão do rodapé e a janela se chamam "Export sessions"; o botão de confirmar diz "Export n sessions";
      o andamento, "Exporting n sessions"; a etiqueta das sessões já exportadas, "✓ Exported"; o aviso ao
      fechar, "Export your sessions before closing?" com "Export and close".
- [ ] Export sessions, Name = "Custom": o campo do nome, "Add date + time" e Before/After ficam numa linha embaixo
      dos botões Date + time / Number / Custom, começando no mesmo ponto que eles.

- [ ] Cmd+clique (Ctrl no Windows) numa sessão: ela e a aberta ficam marcadas (borda azul).
- [ ] Shift+clique marca o intervalo; Shift+↑ ↓ com o contorno numa sessão faz o mesmo pelo teclado.
- [ ] Botão direito numa sessão marcada: "n sessions selected", Add n to project, Remove n from project,
      Delete n sessions….
- [ ] Delete n sessions…: o aviso diz quantas fotos e de quais sessões (e quantas são do projeto); as linhas voam
      para a lixeira; aparecem na Trash; Cmd+Z traz todas de volta (um passo só).
- [ ] Tecla Delete (ou Backspace) com o contorno na lista: apaga a seleção (ou só a sessão do contorno).
- [ ] Esc desfaz a seleção; um clique simples numa sessão também (e abre a sessão).
- [ ] Cmd+clique seguido em várias sessões, desmarcando algumas: nunca aparece marcada uma sessão que não foi
      clicada; desmarcar a aberta abre outra das marcadas; sobrando uma só, ela fica aberta e sem marca.
- [ ] Apertar o botão do mouse com Cmd e soltar o Cmd antes de soltar o botão: conta como Cmd+clique.
- [ ] Shift+clique nas miniaturas: os números não ficam marcados como texto.
- [ ] Barra de cima: diminuir a janela aos poucos; nenhum texto quebra linha e, conforme falta espaço, somem nesta
      ordem: o tamanho da lixeira, os números do projeto, a versão do app, o texto do "Update" (fica o quadrado
      verde) e, por último, "30 cameras ready" vira só "30" (o texto inteiro na legenda). Números grandes aparecem curtos ("1.3k", "38.5k", "1.3 TB"); o número inteiro fica na legenda do
      botão do projeto.
- [ ] Timing fora de "At once": a etiqueta "TIMING" fica verde; amarela só quando o plano tem um problema (ex.: no
      Custom, uma câmera fora de todos os passos).
- [ ] Mac: apertar F para entrar e sair da tela cheia não faz o som de erro do sistema; letras soltas fora de um
      campo de texto também não.
- [ ] Activity aberto (barra de baixo): Esc fecha. Com uma janela aberta por cima (ex.: Export sessions), o
      primeiro Esc fecha a janela e o segundo, o Activity.
- [ ] Janela Project: marcar sessões e clicar em "Delete n sessions…" (ao lado de Remove from project): o mesmo
      aviso; vão para a lixeira do projeto.
- [ ] Arrastar várias: marcar duas sessões de "Not in project", segurar uma delas e arrastar até o botão do projeto
      (barra de cima): o fantasma mostra "2 sessions", a zona tracejada diz "Drop to add 2 sessions to project";
      soltar coloca as duas no projeto; Cmd+Z tira as duas (um passo só).
- [ ] O mesmo com duas do projeto arrastadas para "Not in project": "Drop to remove 2 sessions from project".
- [ ] Seleção misturada (do projeto e de fora): vão só as do mesmo lado da sessão segurada.
- [ ] Clicar sem arrastar numa das marcadas desfaz a seleção e abre essa sessão.
- [ ] Cmd+clique (ou Shift+clique) em cima de "Add to project ↑": só marca a sessão; ela não entra no projeto.
- [ ] Tirar uma sessão de RAW do projeto logo depois de abri-la e pôr de volta: entra sem o aviso
      "A session with this name already exists there".

## 31. Arrastar para a lixeira, mudar a ordem arrastando e a barra da tela cheia (2.15.0)

- [ ] Segurar Cmd (Ctrl no Windows) e passar o ponteiro em "Add to project ↑": o botão não muda de aparência.
- [ ] Arrastar uma miniatura de foto para o lado e soltar entre outras duas: a ordem muda na hora (sem o botão
      "Reorder"), os números se refazem; Cmd+Z volta a ordem anterior.
- [ ] Arrastar uma miniatura até o botão da lixeira (barra de cima, ao lado do projeto): ao chegar, o botão fica
      vermelho; soltar apaga a foto sem perguntar; Cmd+Z traz de volta.
- [ ] Marcar várias fotos (Shift+clique, ou Cmd/Ctrl+clique em fotos soltas) e arrastar uma delas: a cópia
      mostra "3 photos"; soltar entre outras duas leva todas juntas para lá (na ordem em que estavam); soltar na
      lixeira apaga todas. Cmd+Z volta.
- [ ] O mesmo no modo "Reorder" (tela cheia) e na janela "Reorder by photo": marcar várias e arrastar juntas; as
      setas "Move earlier" / "Move later" levam o grupo marcado uma casa.
- [ ] "Reorder by photo": cada mudança de ordem (arrastar ou setas) volta com Cmd+Z antes de clicar em Save, com
      as fotos deslizando; Cmd+Shift+Z refaz. Depois de fechar a janela, esses passos não ficam no Desfazer.
- [ ] Tela principal e tela cheia: depois de mudar fotos de lugar arrastando (uma ou várias), as miniaturas não
      piscam nem recarregam; Cmd+Z volta a ordem com as fotos deslizando até o lugar antigo.
- [ ] Arrastar uma sessão da lista até o botão da lixeira: apaga sem perguntar; Cmd+Z traz de volta. Funciona
      também sem projeto aberto e com várias sessões marcadas.
- [ ] Ao soltar uma miniatura em outro lugar, as outras deslizam até a posição nova (como nas câmeras).
- [ ] Tela cheia: a barra das sessões fica sempre à esquerda, só com ícones, todos no mesmo eixo; o divisor
      "Not in project" é uma linha curta com a seta embaixo.
- [ ] Na barra só de ícones, passar o ponteiro num ícone mostra na hora uma legenda no visual do app (nome da
      sessão; "Not in project · n" no divisor; "Show the session names" no botão de cima). Fora dela, as legendas
      continuam as do sistema.
- [ ] O botão de cima da barra ("Show the session names") abre a barra larga, com os nomes, "Sessions" e o botão
      da janela Project; ela fica aberta até clicar no mesmo botão ("Hide the session names").
- [ ] O título da sessão na tela cheia mostra a hora uma vez só (ex.: "Oct 31, 23:53:22").
- [ ] Na barra: clicar numa sessão abre essa sessão na tela cheia; Cmd+clique, Shift+clique, botão direito e
      arrastar funcionam como na lista normal.
- [ ] Tela cheia: arrastar uma sessão da barra, ou uma miniatura, até o botão da lixeira à direita do nome da
      sessão: apaga; Cmd+Z traz de volta.
- [ ] Tela cheia: Tab chega na barra e segue para os botões da tela cheia.
- [ ] Arrastando uma sessão de "Not in project": os pontilhados do botão do projeto e da lixeira ficam colados em
      cada botão, sem encostar um no outro.

## 32. Tela cheia toca sozinha (2.15.1)

- [ ] Entrar na tela cheia (F, ou o botão ao lado de "Delete session"): a sessão começa a tocar.
- [ ] Tocando, clicar em outra sessão na barra da esquerda: a nova sessão já entra tocando.
- [ ] Pausar (espaço ou o botão de pausa) e clicar em outra sessão: a nova fica parada.
- [ ] Sair da tela cheia: para de tocar.

## 33. Camera settings reorganizado: Format, Ratio e o painel Color (2.16.0)

- [ ] Colunas da tabela: ISO, Shutter, Aperture, Exp. comp., Metering, Format (antes "Quality", no ±), Ratio
      (nova: 3:2, 4:3, 16:9, 1:1) e Color (o botão ± à esquerda e, ao lado, duas linhas: "· balanço de branco"
      e "· estilo", na altura do botão). A tabela cabe sem
      rolagem lateral.
- [ ] Botão "±" abre o painel "Color": White balance (com Kelvin quando a câmera tem), WB fine-tune A/B e
      G/M, Picture Style, Contrast, Saturation e Color tone. Nas câmeras do fim da lista, o painel abre para cima.
- [ ] Com câmeras simuladas (`STILLPOINT_FAKE_CAMERAS=9`): as câmeras 2 e 4 vêm em 16:9 e as outras em 3:2;
      a célula Ratio delas fica âmbar e a lista de câmeras mostra "Settings differ".
- [ ] Câmera 6 simulada: Ratio aparece dentro do tracejado (fixa); ao parar o ponteiro, a explicação diz que a
      câmera não aceita mudar pelo USB. Format aparece fixo em todas as simuladas, com a mesma explicação.
- [ ] Linha "All cameras", Ratio: mostra "Different"; escolher 3:2 muda só as câmeras que aceitam (a 6 fica);
      o aviso some das câmeras 2 e 4; Cmd+Z volta uma a uma. Ao parar o ponteiro na lista, a explicação diz
      quais câmeras ficam de fora.
- [ ] Coluna Color: o resumo e o ± ficam âmbar quando algo de cor difere (balanço de branco, fine-tune, estilo
      ou os ajustes dele); em "All cameras", "Different" no que difere.
- [ ] "Copy from camera" leva Format e Ratio da câmera escolhida às outras que aceitam.
- [ ] Câmeras de verdade: anotar para cada modelo se Ratio vem com opções ou fixa (a SL3 e a T7 precisam ser
      conferidas; a Canon não garante essa propriedade em todos os modelos).

## 34. Match automatically em três passos (2.16.0)

- [ ] Camera settings: a caixa "Match automatically" e "Use gray card" saíram do rodapé; o botão
      "Match automatically" (verde, ao lado de "Test shot") abre uma janela por cima da tabela.
- [ ] Passo 1, "Choose": duas colunas. "Set the same value on every camera": Shutter/aperture/exposure comp.,
      ISO, White balance, Picture Style, Format, Aspect ratio. "Measure in the test shot…": Brightness, Color,
      Use the gray card. Desmarcar um item muda "n of 8 settings selected"; as escolhas ficam guardadas para a
      próxima vez. "Take the test shot →" segue; "Cancel" fecha.
- [ ] Passo 1, valores: cada item de "Set the same value…" é uma linha só, sem rolagem: título e explicação à
      esquerda, a lista com o valor que o app poria em todas à direita (na linha Shutter/aperture/exp. comp.,
      três listas lado a lado) e o porquê no texto cinza
      ("Closest to the average of the cameras", "The most common style; Auto is never used", "The value of 1 camera
      that cannot change it (…)", "Already the same on every camera"). White balance começa em "Let the test shot
      choose". Trocar um valor na lista: a borda fica verde e o texto diz "Shutter: your choice"; clicar na lista
      não desmarca o item; desmarcar o item apaga a lista. No passo 3, o "depois" das câmeras é o valor escolhido.
      Fechar e abrir a janela volta aos valores calculados.
- [ ] Passo 2, "Test shot": barra de progresso e "Photo n of up to m" com a etapa; o botão vira "Cancel the test
      shot". (Os avisos de ISO Auto e Metering differ aparecem por cima, como antes.) Com o cartão cinza, a
      conferência do cartão aparece por cima da janela.
- [ ] Passo 3, "Review": à esquerda, uma linha por câmera com a caixa, as mudanças (antes riscado → depois em
      verde) e a miniatura do depois; à direita, a câmera da linha clicada em Split (divisor arrastável; arrastar
      não seleciona texto), Side by side ou Flip (clique troca). Os controles ‹ ▶ ›, Speed − + e Reverse loop
      ficam dentro da prévia, no canto de cima à direita: aparecem (fade) quando o mouse se mexe sobre a prévia
      ou ao chegar neles pelo Tab; somem 2 s depois que o mouse para (mexer de novo traz de volta) ou quando
      ele sai da prévia; em cima dos controles não somem. Embaixo, uma fileira só de miniaturas: cada foto cortada ao
      meio, a metade esquerda do antes e a direita do depois (linha verde fina no meio), sem rótulo. O texto de cima diz "n cameras would
      change · nothing has been changed on the cameras yet". O botão do passo 1 é "Take the test shot" (sem seta).
- [ ] Caixas do passo 3: desmarcar uma linha deixa a caixa de cima com um traço (algumas) e muda "Apply to n
      cameras"; a caixa de cima marca ou desmarca todas as que mudariam. Clicar na caixa não troca a câmera
      mostrada; clicar no resto da linha troca. Câmera desmarcada (ou sem mudança): a miniatura de baixo mostra
      só a foto de antes, inteira; marcada: cortada ao meio (antes | depois).
- [ ] Teclado nas caixas: no passo 1, Tab até uma caixa e Enter (ou Espaço) marca/desmarca; no passo 3, Enter
      ou Espaço na linha da câmera marca/desmarca, e Enter na caixa de cima também.
- [ ] Desfazer dentro da janela: nos passos 1 e 3, Cmd+Z (Ctrl+Z no Windows) desfaz a última mudança feita na
      janela (caixa marcada/desmarcada, valor trocado numa lista, câmera marcada/desmarcada, a caixa de cima);
      Cmd+Shift+Z refaz; a Activity mostra "Undo: ISO off", "Undo: Shutter → 1/250" etc. Esse desfazer não
      mexe nas câmeras nem no histórico geral do app; fechar a janela zera a lista.
- [ ] Sair no meio: no passo 2 ou 3, Esc, clicar fora da janela ou "Done" perguntam antes ("Leave Match
      automatically?" com "Keep matching" / "Leave and cancel"; "Leave without applying?" com "Stay" / "Leave
      without applying"). No passo 1, Esc fecha direto.
- [ ] Passo 1 com modelos misturados (ex.: SL3 + T7): bloco "Camera models" na coluna da direita, abaixo de
      "Use the gray card". Sem calibração da cartela: caixa âmbar "EOS Rebel SL3 and EOS Rebel T7 have not been
      calibrated with the chart…" com o botão "Calibrate with chart", que abre a explicação da calibração por
      cima da janela Match (ela continua no fundo); "Cancel" só fecha a explicação. "Start" guarda a janela
      Match durante a calibração e, no fim (OK em "Cameras calibrated", ou cancelar no meio), ela volta no
      passo 1. Já calibrados: linha "… are calibrated with the chart: Match automatically uses
      it…" com o botão "Recalibrate". Com um modelo só, o bloco não aparece. O botão "Calibrate with chart" do
      rodapé do Camera settings continua.
- [ ] Passo 3, Split: dois cliques na prévia devolvem a cortina ao centro.
- [ ] "Use the gray card" começa desmarcado toda vez que a janela abre (as outras escolhas ficam lembradas).
- [ ] Com o cartão: na conferência do cartão há "Skip the gray card" ao lado de "Continue"; ele segue o Match
      medindo a foto inteira (Activity: "Gray card skipped: matching with the whole photo"). Na conferência da
      cartela (Calibrate with chart) o botão não aparece.
- [ ] Passo 3, linha atual: com o foco na linha (Tab ou clique), passar o mouse na linha de baixo escurece só
      ela, sem cobrir o contorno verde da linha atual.
- [ ] Tab: nos passos 1 e 3 o Tab anda só pelos controles da janela Match (não chega na tabela do Camera
      settings atrás). No passo 3 a lista de câmeras é um ponto só do Tab (a linha atual) e as miniaturas
      ficam fora dele; na linha, ↑ ↓ trocam de câmera e Espaço marca/desmarca; ← → trocam de câmera em
      qualquer lugar da janela.
- [ ] Depois de "Discard changes" ou "Apply", a fileira "Test shot · matched" no Camera settings rola
      dentro da janela (com 9 câmeras não vaza pela direita) e mostra "Hide photos".
- [ ] Na tabela do Camera settings atrás da janela, nada mudou (as câmeras voltaram ao "antes").
- [ ] Desmarcar uma câmera muda "Apply to n cameras"; "Apply" muda só as marcadas; a janela fecha; um Cmd+Z
      volta todas; Cmd+Shift+Z refaz. "Discard changes" fecha sem mudar nada. "← Back" volta ao passo 1.
- [ ] Com câmeras simuladas (`STILLPOINT_FAKE_CAMERAS=9`): as câmeras 2 e 4 (16:9) aparecem com "16:9 → 3:2"
      e a 6 (fixa) não muda de proporção.
- [ ] Proporção real da foto (Parte 2): as fotos simuladas saem na proporção que a câmera informa (no Test
      shot, as miniaturas 02 e 04 são mais largas, 16:9). A fileira do Test shot não marca proporção (só o número
      nas etiquetas; decisão do dono, 2026-11-02). A câmera simulada 02 entrega sempre 16:9, o que for que esteja
      marcado, de propósito (etiqueta âmbar "always 16:9" ao lado do nome dela na tabela, com a explicação
      ao passar o mouse): no passo 3 do Match, a linha 02 ganha a etiqueta amarela tracejada "Shot 16:9 ·
      camera reports 3:2", a miniatura da linha e a da fileira de baixo ficam com borda âmbar tracejada (não
      verde, mesmo com mudanças), e ao chegar na 02 com ← → o contorno de seleção da miniatura de baixo fica
      âmbar (cheio, não tracejado); o Activity diz "Aspect ratio: T7_1 shot 16:9 but reports 3:2". Depois de Apply (ou
      Discard), na tabela do Camera settings a célula Ratio da 02 fica tracejada âmbar com "16:9" e um ícone
      de alerta (triângulo) ao lado: passar o mouse no ícone abre na hora uma caixa âmbar com a explicação
      (sem a espera da legenda do sistema; Tab até o ícone também abre). Na fileira do Test shot (em cima),
      a miniatura da 02 tem a borda âmbar tracejada e o mesmo ícone de alerta no canto de cima à direita (mouse
      em cima abre a mesma caixa); selecionada (clique ou ← →), a etiqueta "02" fica âmbar. A etiqueta continua
      só com o número. As outras câmeras não ganham marca.
- [ ] "Test shot" simples (botão do rodapé, sem Match): o app mede a proporção de cada foto na prévia e compara
      com a coluna Ratio. Com a simulada 02 (sempre 16:9) em "3:2": a célula Ratio dela fica tracejada âmbar com
      "16:9" e o ícone de alerta, a seleção dela na fileira fica âmbar tracejada e o Activity diz "Aspect ratio:
      T7_1 shot 16:9 but reports 3:2". Mudar a 02 para 16:9 na lista e repetir o Test shot: a marca some.
- [ ] Caixa de explicação do alerta (miniatura do Test shot e célula Ratio): enquanto ela está aberta, a
      legenda do sistema (nome da câmera) não aparece por cima dela.
- [ ] Tela cheia com a barra só de ícones: uma sessão com "n missing" tem o ícone âmbar na barra (as outras,
      verde); passar o mouse mostra a data e "· n missing".
- [ ] Passo 3 com muitas câmeras (`STILLPOINT_FAKE_CAMERAS=18`): a janela não cresce; a lista de câmeras rola
      dentro da tabela (o texto "Click a row…" fica fixo embaixo); a prévia à direita respeita a altura da janela; a
      fileira de miniaturas mantém o tamanho de cada uma e rola para o lado; o play só anda a marca, sem rolar.
- [ ] Esc fecha a janela (no passo 2, cancela o teste antes).

- [ ] Play na sessão (janela principal e tela cheia): a fileira de miniaturas não rola sozinha; só a marca da foto
      atual anda. Clicar numa miniatura ou usar ← → continua rolando até ela.
- [ ] Tela cheia: ‹ ▶ › , "Speed − 1.0x +" e "Reverse loop" ficam sobre a foto grande, no canto de cima à direita,
      como no passo 3 do Match: aparecem quando o mouse se mexe sobre a foto, somem 2 s depois de parado (ou ao
      sair da foto), em cima deles não somem; Tab chega neles (depois das miniaturas) e eles ficam visíveis
      enquanto têm o foco. Clicar neles não entra nem sai da tela cheia. Na barra de cima ficam só a data, as
      etiquetas, a lixeira, "Reorder", "Delete session" e o botão de sair.
- [ ] Tela cheia, janela estreita: quando "Reorder"/"Delete session"/sair encostam no botão da lixeira, eles descem
      para uma linha abaixo da data (a barra cresce com uma animação curta, sem pulo); alargando, voltam.
      Estreitando mais, some o tamanho da lixeira, depois "Reorder" e "Delete session" viram só ícone (setas
      trocadas e lixeira), depois o subtítulo ("2 shot 16:9"), e por fim a data fica menor. Nada se sobrepõe.
- [ ] Camera settings, rolando a tabela (com e sem fotos do Test shot): a linha "All cameras" fica presa logo abaixo
      do cabeçalho, sem fresta acima do cabeçalho nem entre ele e a linha.
- [ ] Tela cheia: ao entrar, os controles sobre a foto já estão visíveis e só começam a sumir uns 4 s depois; no
      passo 3 do Match, o mesmo ao chegar no passo. Tab até o botão de sair da tela cheia: o contorno aparece
      inteiro, com a linha da direita.
- [ ] Trocar de sessão (janela principal e tela cheia) depois de rolar a fileira de miniaturas para o lado: a
      fileira da sessão nova começa do início.
- [ ] Fileira de miniaturas (sessão, tela cheia e passo 3): o trilho da rolagem está sempre lá, com ou sem
      miniaturas sobrando; o espaço até a foto grande nunca muda.
- [ ] Fileira de miniaturas (sessão e passo 3 do Match): o espaço até a foto grande não muda quando a barra de
      rolagem aparece ou some (o lugar dela fica reservado).
- [ ] Match, passo 3: ‹ › e ← → rolam a fileira de miniaturas até a câmera atual; o play não rola.
- [ ] Match, passo 3, tocando: − + mudam a velocidade na hora (o play continua, no ritmo novo) e os controles não
      piscam nem mudam de altura; ‹ › e ← → param o play e andam uma câmera; a fileira de miniaturas mostra as
      fotos inteiras (sem cortar o topo).

## 35. Aviso "Mixed ratios" na sessão (2.16.0, Parte 3 da Proporção)

Com `STILLPOINT_FAKE_CAMERAS=9` as câmeras 02 e 04 estão em 16:9 e as outras em 3:2, então todo disparo sai misturado.

- [ ] Disparar "It's bullet time". Quando a sessão nova aparece, abre uma janela "Mixed ratios" por cima da tela
      (mais larga que as outras, opção N): texto "Cameras 02 and 04 shot 16:9; the others 3:2." e a explicação;
      embaixo, "Other ratios on export" com os botões "4:3 · keeps 86%", "16:9 · keeps 88%", "1:1 · keeps 64%" (os
      três que não são a sugestão); no rodapé, numa linha só, à esquerda o link "Keep as shot", à direita "Open
      Camera settings" e o verde "Crop on export to 3:2 (keeps 97%)". Esc ou clicar fora = "Keep as shot".
- [ ] Marcas na sessão (ficam para sempre): na lista Sessions, etiqueta tracejada âmbar "Mixed ratios" abaixo de
      "9 photos"; no cabeçalho, a mesma etiqueta ao lado da data e o subtítulo "2 shot 16:9"; as miniaturas 02 e 04
      com borda âmbar tracejada e "16:9" no canto de baixo à direita; selecionada, a etiqueta do número fica âmbar.
      Passar o mouse na etiqueta "Mixed ratios" abre na hora a caixa com o texto completo.
- [ ] Linha embaixo do botão de disparo: "Done. The new session is shown above · Mixed ratios" em âmbar. Activity:
      "Mixed ratios: cameras 02 and 04 shot 16:9; the others 3:2." em âmbar.
- [ ] "Crop on export to 3:2 (keeps 97%)" (ou um dos botões menores): a janela fecha, o Activity diz "Crop on
      export: 3:2 for …" e a caixa da etiqueta "Mixed ratios" passa a terminar com "Crop on export: 3:2 (keeps
      97%)." A escolha fica guardada por sessão para o Export (a linha "Aspect ratio" do Export é a Parte 4).
- [ ] "Open Camera settings": a janela fecha e o Camera settings abre.
- [ ] Disparar de novo sem mudar nada: a sessão nova ganha as marcas, mas a janela não abre. Mudar a 04 para 3:2
      no Camera settings e disparar: só a 02 fica diferente, a janela abre de novo ("Camera 02 shot 16:9; the
      others 3:2."). Fechar e abrir o app e disparar: a janela abre de novo.
- [ ] Tela cheia com a barra só de ícones: o ícone da sessão misturada fica âmbar; a legenda ao passar o mouse
      mostra a data e "· Mixed ratios" em âmbar (com fotos que faltaram, "· 5 missing · Mixed ratios").
- [ ] Sessões antigas misturadas (já existentes ao abrir o app): ganham as marcas conforme o app mede as fotos
      (lista, cabeçalho, miniaturas), sem janela.
- [ ] Sessão sem mistura: com a 04 em 3:2, apagar a foto 02 de uma sessão (Delete) → as marcas e a etiqueta somem
      (a simulada 02 sempre sai 16:9, então é o único jeito de ter uma sessão toda igual).

## 36. Export: seção Framing (proporção e posição) e Placement do Lenticular (2.16.0, Parte 4)

Com `STILLPOINT_FAKE_CAMERAS=9` (02 e 04 em 16:9). Abrir "Export sessions" com uma sessão misturada marcada.
(Decisão do dono, 2026-11-03: a proporção e o alinhamento ficam juntos na seção "Framing"; este pedaço é só a
proporção. O alinhamento — referências, Move/Size/Rotate — vem no pedaço 2.)

- [ ] (A partir da seção 38, o Framing é o passo 1 e as abas são só Photos · Sequence · Lenticular, no passo 2.)
      A coluna da direita tem abas no topo, acima da prévia: Framing · Photos · Sequence · Lenticular (chips; a
      atual em verde). Photos, Sequence e Lenticular têm a caixa de marcar do app dentro da aba (liga/desliga a
      saída; aba desligada fica tracejada); Framing não tem (vale para todas). Com "Same settings for all
      sessions" desligado, a aba ganha um ponto âmbar quando esta sessão difere das outras nessa saída (mouse
      em cima explica). ← → trocam de aba pelo teclado. Abaixo da prévia, o conteúdo da aba atual, começando pelo
      resumo ("Originals + JPG · High" ou "Off · tick the box in the tab to export it").
- [ ] Ao abrir o Export a prévia está sempre visível (mesmo que da última vez tenha ficado escondida); "Hide
      preview" esconde e assim fica ao trocar de seção, até fechar e abrir a janela de novo.
- [ ] Aba Framing: em cima, a prévia (200 px, a mesma altura das outras abas) com o recorte sobre a foto (com "As shot" a etiqueta diz "As shot:
      nothing is cut · choose a ratio below"); embaixo, a fileira de miniaturas (clique ou ← → trocam a foto da
      prévia); embaixo dela, as linhas "Aspect ratio" (As shot · 3:2 · 4:3 · 16:9 · 1:1, "keeps n%"; sem a caixa "Same size":
      todas as fotos convertidas saem sempre no mesmo tamanho, decisão do dono de 2026-11-03), a nota âmbar de mistura
      e "Position" (nove pontos). Mesma estrutura das outras abas.
- [ ] Aba Framing: no canto superior esquerdo da prévia, o botão "Align photos" (ícone de dois quadros sobrepostos
      e o texto; dica "Align photos: move, resize and rotate each photo over the others"). Não há modo teatro nesta
      aba (o botão "< >" é só do Lenticular, que não mudou). Com alguma foto alinhada, uma etiqueta "Aligned" no
      canto superior direito da prévia. A tela que o botão abre é a seção 37.
- [ ] Escolher 3:2: na prévia, o quadro aceso e o resto escuro; na foto 02 o quadro é mais estreito e arrasta
      para os lados (etiqueta "Drag the frame to choose the part that stays · ← → other photos"); nas 3:2 não há quadro
      ("Nothing to cut"). "Position": clicar num ponto move o quadro; o ponto aceso
      acompanha o arraste. Uma posição para a sessão inteira.
- [ ] Exportar (Photos convertidas em JPG + Sequence MP4) com 3:2: no Finder, as fotos 02 e 04 convertidas saem
      3:2 (cortadas nas laterais), as outras inteiras; os Originals continuam 16:9; o MP4 não pula; todas as convertidas saem com o mesmo tamanho em pixels (o da
      menor câmera, sempre). Com "As shot": nada é cortado.
- [ ] Fechar e abrir o Export (e o app): a proporção e a posição voltam para essa sessão (session.json). A caixa
      da etiqueta "Mixed ratios" (mouse em cima) mostra a escolha.
- [ ] Lenticular: ao entrar na aba, a prévia abre em "Interlaced" (o seletor é Interlaced · Tilt, nessa ordem).
- [ ] Lenticular: linha "Placement" (Fill · Fit) depois do tamanho. Fill: as prévias Tilt e Interlaced mostram a
      parte escolhida na seção Framing (Position). Fit: nota "Band: black · change it in Settings › Lenticular";
      prévias com a foto inteira e a faixa.
- [ ] Settings (menu, ou Ctrl+,): linha "Lenticular" com Black / White; mudar para White e voltar ao Export: a nota
      e as prévias ficam brancas. Exportar um lenticular em Fit: o TIFF tem a faixa da cor escolhida, e o
      "settings.txt" ao lado diz "Placement: Fit (whole photo, white band)"; em Fill diz a posição do recorte.

## 36 B. Sair do Export sessions (2.16.0)

- [ ] "Cancel" (rodapé), Esc ou clique fora da janela: abre a confirmação "Leave Export sessions?" ("Nothing is
      exported. Your choices are kept: …") com "Stay" e "Leave". "Stay" (ou Esc, ou clique fora) volta ao Export como
      estava; "Leave" fecha. Abrir de novo: as saídas, o Framing e o alinhamento continuam como deixados. Depois de
      exportar, a janela fecha sem perguntar.

## 37. Export: tela "Align photos" (2.16.0, pedaço 2 do Framing)

Com `STILLPOINT_FAKE_CAMERAS=9`. Abrir "Export sessions", aba Framing, botão "Align photos" (canto superior esquerdo da
prévia). Protótipo X2 (2026-11-03): prévia grande à esquerda com a fileira de miniaturas embaixo; coluna de controles à
direita; a lista de sessões continua à esquerda da janela.

- [ ] Ao abrir: no topo, o botão "Back to Framing" e "Photo 01 of 09 · ← → other photos". Na prévia, "Measuring the
      photos…" por um instante, depois a foto 01 nítida; por baixo dela, tingida de laranja e transparente, a foto 02
      (Next photo). Um quadro só, neon sólido verde: o canvas ("Canvas · 900 × 506 px · 16:9" no canto); fora dele a
      prévia escurece. Embaixo, a instrução "01 · Drag to move · scroll to zoom · hold space and drag to pan · ⌥ scroll
      to rotate · ⌘ arrows 1 px (⇧ 10)".
- [ ] O canvas (decisão do dono, 2026-11-03): em "As shot", o que todas as fotos cobrem como saíram (900 × 506); com
      3:2 escolhido, o maior 3:2 que cabe nisso (759 × 506); com 16:9, 900 × 506. Nenhuma foto cresce sozinha (as
      16:9 continuam em Size 100): ampliar mudaria o tamanho do objeto fotografado entre as câmeras. Só as fotos se
      mexem por trás do canvas.
- [ ] Fileira de miniaturas: a 01 marcada; a 02 com um ponto laranja no canto da miniatura (é a Next photo) — o ponto
      fica dentro da miniatura, nunca solto na tela. As miniaturas 02 e 04 (16:9) com a borda tracejada âmbar e "16:9"
      no canto, como na tela principal. Clicar na 04 (ou → três vezes):
      "Photo 04 of 09", a 03 com ponto azul (Previous photo), a 05 com ponto laranja; na prévia a 04 nítida sobre a 03
      azulada e a 05 alaranjada.
- [ ] Coluna "References", nesta ordem: "Previous photo" (azul, "03"), "Current photo" (sem caixa, "04", a própria
      foto) e "Next photo" (laranja, "05"). Na foto 01, "Previous photo" fica desativada ("none"); na 09, "Next photo".
      Na prévia, a foto atual fica por cima, nítida, e as referências por baixo, tingidas. Com todas as barras em 100%
      vê-se só a atual. Cada linha tem a sua barra de opacidade: a da "Current photo" move as três juntas (baixar para
      60%: a atual fica transparente e as referências aparecem através dela); mexer na barra de uma referência muda só
      ela, até a próxima vez que a da "Current photo" for usada. Desligar "Next photo": a 05 some. As escolhas ficam
      para as próximas aberturas (memória do app).
- [ ] "This photo 04": "Move X", "Move Y" (px; − + andam 1, com ⇧ 10), "Size" (%; 0,1, ⇧ 1), "Rotate" (°; 0,05, ⇧ 0,5;
      sem limite). Sem legenda ao lado dos campos; − e + à mesma distância do campo. Digitar um valor e Enter aplica;
      ↑ ↓ no campo também andam. A foto 04 se mexe na prévia na hora por trás dos quadros; o canvas e o recorte não se
      movem nem mudam de tamanho (a linha "Canvas … px (16:9) · this photo 900 × 600 px (3:2)" no fim do bloco não muda; "~" antes da
      proporção quando o tamanho não bate exatamente com ela).
- [ ] Gestos na prévia: arrastar move a 04 (os campos Move X/Y acompanham, arredondados ao pixel ao soltar); ⌥ + roda
      muda o Rotate; ⌘ + ← → ↑ ↓ movem 1 px (⇧ 10); ← → sozinhas trocam de foto.
- [ ] Zoom e deslocamento da vista (não mexem na foto, nem no Size): a roda aproxima e afasta em volta do ponto sob o
      mouse, de 30% a 800% ("zoom 250%" aparece na instrução embaixo). Segurar a barra de espaço: o cursor vira uma mão;
      arrastar desloca a vista; ao soltar o espaço volta ao normal. O deslocamento para quando sobram 80 px do canvas
      à vista (nunca some). Entrar de novo em "Align photos" começa em 100%.
- [ ] Etiquetas da prévia ("Canvas · …" no canto e a instrução embaixo): somem num fade ao mexer o mouse sobre a prévia,
      ao rolar ou com o espaço seguro, e voltam num fade 2 s depois de parar.
- [ ] ⌘0 (Ctrl+0 no Windows): a vista volta ao centro e a 100% (a foto não muda).
- [ ] Cursor da alça redonda (girar): uma seta em arco verde; o mesmo cursor durante o giro.
- [ ] Desfazer/refazer (⌘Z / ⇧⌘Z) dentro de "Align photos": cada gesto terminado (arrastar, alça, − +, campo, Position,
      Fit to canvas, Reset photo, Reset all, uma sequência de ⌥ + roda) é um passo; abrir a tela, trocar de foto ou dar
      zoom não criam passos. Desfazer volta a foto na prévia e grava em session.json (fechar e abrir o Export mostra o
      estado desfeito).
- [ ] Caixa de transformação sobre a foto atual (contorno fino, quatro alças quadradas nos cantos e uma alça redonda
      acima do meio): arrastar um canto muda o Size em volta do centro; arrastar a alça redonda gira (⇧ trava em
      passos de 15°); a caixa gira junto com a foto e as alças ficam do mesmo tamanho em qualquer zoom.
- [ ] Trava da área útil (como no Lightroom): com "Aspect ratio" em 16:9, tentar mover ou encolher a 04 até descobrir
      parte do quadro âmbar: o movimento para no limite (num eixo só, quando dá) e o quadro âmbar pisca; o campo
      digitado volta ao valor que havia. Girar é diferente: quando o giro descobriria um canto, a foto cresce o mínimo
      necessário (o "Size" sobe sozinho) para continuar cobrindo a área, e ao desfazer o giro ela volta a encolher até
      o tamanho que você tinha escolhido (girar 5° e voltar a 0° termina no Size de antes). Nenhum gesto muda os
      quadros (tracejado e neon): só a foto. Conferir com giros grandes (15°, 25°): o crescimento continua
      suave, sem salto. Em "As shot" a área útil é o quadro comum.
- [ ] Os botões − e + de cada campo ficam à mesma distância do campo, dos dois lados.
- [ ] Segurar o − ou o + de qualquer campo: repete o passo (começa depois de 0,4 s); com ⇧ segurado, o passo grande.
- [ ] A lista de sessões, à esquerda, mostra só as miniaturas (sessão desmarcada apagada); passar o mouse numa
      miniatura mostra na hora, ao lado, a legenda no visual do app (data, fotos, aviso âmbar se houver), como na barra
      da tela cheia. "Back to Framing" traz a lista completa de volta. As barras de opacidade têm o visual do app
      (trilho fino, cursor quadrado verde). A coluna de controles não rola para o lado.
- [ ] Rolar a coluna de controles até "Aspect ratio" e clicar em 3:2: a coluna fica onde estava, sem subir. O mesmo na
      aba Framing normal, com as linhas roladas.
- [ ] Aba Lenticular, "Interlaced": a legenda de baixo é uma linha curta ("Interlaced 18500 × 12831 px · 30 × 20 cm ▸");
      clicar nela abre o resto (px por lente, faixas, instruções) e clicar de novo recolhe. "Hide preview" e "Show
      preview" com o Interlaced: volta na hora, sem travar (a imagem entrelaçada fica guardada enquanto nada muda).
- [ ] "Fit to canvas", "Reset photo" e "Reset all" cabem na coluna (quebram linha se faltar largura). "Fit to canvas": com a 04 em Size 130% e movida, o botão centra a foto e leva o Size ao
      menor valor que ainda cobre a área útil (100% numa foto sem giro; mais, se estiver girada — o giro fica).
- [ ] Coluna da direita › "This photo" › campo "Move X": digitar 7000 e Enter. A foto não sai da área útil: vai só até
      encostar na borda do canvas (a borda pisca laranja) e o campo mostra o valor máximo possível. "Reset photo" volta a
      foto a zero; "Reset all" zera todas. (O aviso antigo "The photos do not overlap" não existe mais: a trava impede.)
- [ ] Último bloco da coluna (sem título repetido): "Aspect ratio" (As shot · 3:2 · 4:3 · 16:9 · 1:1) é a mesma escolha
      da aba Framing e vale para a sessão inteira; o quadro neon fica onde a aba Framing o deixou (a posição do recorte
      só muda lá). "Position" (nove pontos, sem texto) move a foto atual dentro da
      folga que ela tem atrás do quadro: com a 04 em Size 120%, o ponto da esquerda cola o lado esquerdo da foto no do
      quadro, o do meio centra; o ponto aceso mostra onde a foto está (sem folga, o do meio); arrastar também move só
      a foto e o ponto acompanha. Ao voltar ("Back to Framing") a prévia do Framing ganha a etiqueta "Aligned".
- [ ] Tab: na aba Framing, o Tab passa por todas as abas (Framing · Photos · Sequence · Lenticular) e pelas caixas delas,
      pelo botão "Align photos", pelas proporções e pelos pontos de "Position". Em "Align photos", a lista de sessões é uma parada
      só do Tab (a sessão aberta); ↑ ↓ trocam de sessão (em qualquer lugar da tela, fora de um campo de texto).
- [ ] Entrar em "Align photos" e voltar: a lista de sessões estreita/alarga com transição e a coluna surge num fade
      curto.
- [ ] Fechar e abrir o Export, e fechar e abrir o app: o alinhamento volta (session.json tem "align").
- [ ] Exportar (Photos convertidas em JPG + Sequence MP4 + Lenticular Fill) uma sessão com 3:2 e a 04 movida 100 px e
      girada 2°: no Finder, todas as JPG convertidas têm o tamanho do canvas (759 × 506 nas simuladas), nenhuma
      ampliada, a 04 deslocada e girada; o MP4 e o lenticular usam as mesmas
      fotos; os Originals continuam intactos; o settings.txt do lenticular tem a linha "Alignment: photos aligned in
      Stillpoint (canvas … px)". Sessão em "As shot" sem nenhuma foto ajustada: cada foto sai como é (seção 36); em
      "As shot" com alguma foto ajustada, todas saem no canvas (a interseção).

## 38. Export sessions em três passos (2.16.0; protótipo "Export em três passos" aprovado em 2026-11-04)

Com `STILLPOINT_FAKE_CAMERAS=9` e algumas sessões. Abrir "Export sessions".

- [ ] Cabeçalho: à direita, "1 Sessions — 2 Outputs — 3 Review" (o passo atual em verde; os anteriores com "✓"). O
      subtítulo muda a cada passo. Clicar num passo anterior volta a ele; um passo seguinte só abre se o atual estiver
      pronto (sem sessão marcada, "2 Outputs" fica apagado e a dica diz "Tick at least one session").
- [ ] Passo 1 · Sessions: à esquerda a lista com as caixas, "Select all" e "Unselect all"; cada sessão com um selo do
      Framing ("As shot", "3:2", "3:2 · aligned"; "As shot · mixed ratios" tracejado âmbar). À direita, "Framing · <data>"
      e "Hide preview" no topo; a prévia com "Align photos"; a fileira; "Aspect ratio", a nota de mistura e "Position";
      e, na última linha, a caixa "Same framing for all ticked sessions" (ligada por padrão). Comportamento da caixa
      (o mesmo no passo 2): marcada = todas iguais e ligadas (mudar a proporção ou a posição de uma muda as outras; o
      alinhamento fica em cada sessão); clicar nela desliga (cada sessão pode mudar sozinha). Com alguma sessão
      diferente, a caixa mostra o traço e, ao lado, em âmbar, "1 session is different · tick to give all of them these
      settings"; clicar iguala todas à sessão aberta (aviso "… · ⌘Z undoes"; ⌘Z volta). As sessões que fogem da
      configuração mais comum ganham a etiqueta "Different" na lista; a etiqueta fica nas mesmas sessões seja qual for
      a sessão aberta. Abrindo com Framings já diferentes, a caixa vem com o traço e nada é igualado sozinho. Não há abas
      nem "Name". Rodapé: "3 of 5 sessions · 1 with mixed ratios on As shot", "Cancel"
      e o verde "Outputs →" (apagado sem sessão marcada).
- [ ] Passo 2 · Outputs: a lista mostra só as sessões marcadas, sem caixas, com o resumo do que sai de cada uma (o Tab
      para na lista e ↑ ↓ trocam de sessão). Sem barra no topo: as abas Photos · Sequence · Lenticular (sem
      Framing) e, na mesma linha, encostado à direita, "Hide preview". Cada aba tem a sua caixa "Same settings for all
      sessions" na última linha da aba, com o mesmo comportamento da caixa do passo 1 ("Apply to all sessions" saiu); a
      etiqueta "Different" na lista e o ponto âmbar na aba seguem a configuração mais comum (não mudam de sessão ao
      clicar). A prévia (Photos, Sequence e o Tilt do Lenticular) já aparece com o Framing do passo 1: com 16:9, a foto
      cortada em 16:9; com fotos alinhadas, deslocadas e giradas como no "Align photos". Tab até a caixa de uma aba
      (inclusive a aba acesa, verde): um anel de foco bem visível em volta da caixa.
- [ ] Passo 3 · Review: sem a lista de sessões; uma tabela com uma linha por sessão marcada (miniatura, data e fotos,
      Framing com a posição e "n photos aligned", as saídas, o nome final da pasta). Em "As shot" com mistura, o aviso âmbar com o ícone de alerta "As
      shot · mixed ratios: the sequence will jump and the lenticular subject changes size", com o "Edit" dentro do
      aviso, em âmbar e negrito. "Edit" no Framing leva ao passo 1 com aquela sessão aberta; "Edit"
      nas saídas leva ao passo 2 na aba certa. Só a tabela rola (o cabeçalho dela fica preso
      no topo); embaixo, presas e sempre à vista, a caixa "Name" (Date + time · Number · Custom; o nome vale para
      todas as marcadas e a coluna "Folder" acompanha enquanto se digita) e a caixa "Export to" (caminho, "Choose
      another folder…", "Reset to default" depois de trocar). Rodapé: "← Outputs", "Cancel" e "Export n sessions". No
      Project, "Use edited photos when available" aparece só neste passo.
- [ ] Com uma proporção escolhida, o retângulo de borda verde neon sobre a prévia grande do passo 1 (a área que vai
      ser exportada) fica parado e do mesmo tamanho ao trocar de foto (← → ou
      clique nas miniaturas), inclusive entre fotos 3:2 e 16:9: é a foto que muda atrás dele. Arrastar a prévia move a
      foto ("Drag the photo to choose the part that stays"); o ponto de "Position" acompanha. Foto com alinhamento
      próprio: a instrução diz "This photo is aligned: move it in Align photos" e o arraste não age nela.
- [ ] O recorte do passo 1 é o mesmo do passo 2 e do arquivo: numa sessão com 02 e 04 em 16:9 e as outras em 3:2,
      escolher 3:2 e olhar a foto 01 (3:2) no passo 1: o quadro neon não cobre a foto inteira (o canvas é o 3:2 que
      cabe na parte comum às 16:9, 759 × 506 nas simuladas), e o passo 2 mostra exatamente essa parte. Trocar 3:2 · 4:3 ·
      16:9 · 1:1 e "Position" e comparar foto a foto nos dois passos (inclusive as 16:9). Com fotos alinhadas, o quadro
      do passo 1 aparece deslocado (e girado) sobre a foto como ela vai sair.
- [ ] Lenticular (passo 2), vista "Interlaced": as faixas de cada foto já com o Framing do passo 1 (com 3:2 numa sessão
      misturada, sem as bordas que o canvas corta; com fotos alinhadas, deslocadas e giradas). Trocar a proporção no
      passo 1 e voltar: o Interlaced é montado de novo.
- [ ] Modo teatro em Photos e Sequence (passo 2): o botão "< >" no canto superior esquerdo da prévia, como no Lenticular.
      Em Photos, no teatro, a prévia cresce e as miniaturas continuam embaixo; em Sequence, só a prévia (o play/pause
      continua). Trocar de aba desliga o teatro. Sair do Export (Cancel → Leave) com o teatro ligado e abrir de novo:
      abre sem teatro.
- [ ] Lenticular em Fill com o Framing numa forma diferente do papel (ex.: 16:9 no passo 1 e papel 15 × 10 cm): aviso âmbar
      com o ícone de alerta "Framing 16:9 · paper 15 × 10 cm (3:2): in Fill the paper shape wins, so the sides of the
      framing are cut. Choose Fit to keep the whole framing, with a band." Em Fit o aviso some e o TIFF sai com o
      Framing inteiro e a faixa.
- [ ] Review › "Export to": o botão "Use the default folder" sempre à vista, apagado na pasta padrão; depois de "Choose
      another folder…", ativo e volta para a pasta padrão.
- [ ] Passo 1 sem "Hide preview" (a prévia fica sempre à vista; no passo 2 continua na linha das abas).
- [ ] Alinhar exige uma proporção só na sessão com mixed ratios (decisão do dono, 2026-11-04, revista): numa sessão
      sem mistura em "As shot", "Align photos" abre direto (o canvas é a própria foto) e o alinhamento sai na exportação.
      Numa sessão misturada em "As shot", "Align photos" continua ativo; clicar abre a janela "Choose a ratio first" com os botões 3:2 · 4:3 · 16:9 · 1:1 ("keeps n%"; o que perde
      menos pixels em verde) e "Cancel". Escolher um: a sessão passa a essa proporção e a tela "Align photos" abre com
      ela. Dentro de "Align photos", "As shot" fica desativado (dica: escolher As shot na aba Framing; o alinhamento
      fica guardado). Voltando para "As shot" no passo 1: o selo da sessão diz só "As shot", o Review não conta fotos
      alinhadas, e a exportação sai como as fotos foram feitas (o alinhamento só volta a valer com uma proporção).
- [ ] Passo 1, sessão em "As shot" com proporções misturadas: a nota de mistura vira um aviso âmbar tracejado com o ícone
      de alerta: "… "As shot" keeps each photo as it is: the sequence will jump (black bands come and go), and in the
      lenticular print the subject changes size between photos. Choose a ratio to give every photo the same frame."
      Escolhendo uma proporção (ou alinhando uma foto), vira uma nota comum: "… Every photo goes through the same frame,
      so nothing jumps."
- [ ] Anel de foco (Tab): inteiro em volta da caixa "Same framing for all ticked sessions" (não cortado à esquerda) e
      dentro de cada botão de "Aspect ratio" e dos outros grupos de botões (não comido em cima). No passo 2, o Tab para
      na lista de sessões (anel em volta da linha) e ↑ ↓ trocam de sessão.
- [ ] Fechar ("Cancel" → "Leave") e abrir de novo: abre sempre no passo 1 · Sessions (decisão do dono, 2026-11-04), com
      as escolhas como estavam. Desfazer (⌘Z) vale nos três passos.

## 38 B. Ajustes depois do teste de 2026-11-04 (2.16.0)

Com `STILLPOINT_FAKE_CAMERAS=9`.

- [ ] Tela principal, painel "Bullet time": "Sessions" em 3 e "It's bullet time". A janela "Mixed ratios" abre uma vez e
      diz "The photos in the 3 sessions of this shoot…"; "Crop on export to 3:2 (keeps 97%)" (ou um dos botões menores)
      vale para as três sessões (Activity: uma linha "Crop on export: 3:2 for …" por sessão; o mouse sobre a etiqueta
      "Mixed ratios" de cada uma mostra a escolha).
- [ ] Tela principal: disparar, fechar a janela "Mixed ratios" com "Keep as shot" (ou Esc, ou clique fora), mudar qualquer
      coisa no "Camera settings" (painel "Cameras") e disparar de novo: a janela abre de novo.
- [ ] Export, passo 1, prévia com uma proporção: segurar o botão do mouse e arrastar para fora da prévia (com e sem a
      barra de espaço em "Align photos"): a mão fechada continua em toda a janela e a foto segue o mouse até o limite.
- [ ] Export, passo 2, aba Lenticular, "Placement" em Fit: na nota "Band: black · change it in Settings › Lenticular",
      "Settings › Lenticular" é um link sublinhado; clicar abre o Settings por cima do Export, na linha "Lenticular".
- [ ] Settings › "Lenticular": trocar Black → White e dar ⌘Z: volta a Black (aviso "Undo: Lenticular band: black"); ⇧⌘Z
      volta a White. A nota e as prévias do Export acompanham.
- [ ] Settings por cima de qualquer janela: com o Export aberto no passo 2, abrir "Settings" pelo menu (ou ⌘, / Ctrl+,):
      aparece por cima; "Done", Esc ou clique fora fecham só o Settings e o Export continua no passo 2, como estava.
      O mesmo com o Camera settings e a janela Project abertos.
- [ ] ⌘Z / ⇧⌘Z com uma confirmação ou aviso aberto (ex.: "Leave Export sessions?", "Choose a ratio first", "Mixed
      ratios"): nada acontece. Depois de fechar a janela, ⌘Z desfaz normalmente e não faz a janela voltar.
- [ ] Export, passo 1, sessão misturada em "As shot": "Align photos" → "Choose a ratio first" → 3:2: abre "Align photos".
      ⌘Z: volta para a tela do Framing em "As shot" ("Undo: Ratio 3:2 for Align photos"). ⇧⌘Z: abre "Align photos"
      de novo em 3:2.
- [ ] Dentro de "Align photos" numa sessão sem mistura, clicar (ou ↑ ↓) numa sessão misturada em "As shot" (com "Same
      framing for all ticked sessions" desligado): abre "Choose a ratio first". "Cancel", Esc ou clique fora: continua em
      "Align photos" na sessão de antes. Escolher uma proporção: "Align photos" passa para a sessão misturada.
- [ ] Janela Project (botão ao lado do título "Sessions", com um projeto aberto): as sessões misturadas têm a etiqueta
      "Mixed ratios" (mouse em cima mostra o texto), como na lista Sessions.

## 38 C. Ajustes depois do teste de 2026-11-04 (noite)

Com `STILLPOINT_FAKE_CAMERAS=9`.

- [ ] Tela principal: disparar, escolher 3:2 na janela "Mixed ratios" e disparar de novo (sem mexer no Camera settings):
      a janela não abre e a sessão nova já vem com 3:2 (Activity: "Crop on export: 3:2 for …"). Com "Keep as shot", a
      sessão nova fica em As shot.
- [ ] Tela principal, logo depois de um disparo (com "Sessions" em 2): clicar em outras sessões da lista, devagar e rápido:
      cada clique abre a sessão clicada, sem marcar várias (a moldura de seleção múltipla só com ⌘ ou ⇧).
- [ ] Align photos: arrastar a foto rápido contra a borda: ela encosta na borda (não para antes) e o outro eixo continua
      livre; o movimento acompanha o mouse sem engasgos. O mesmo no passo 1, arrastando a prévia.
- [ ] Align photos: o rodapé mostra só o botão verde "Done aligning" ("Cancel" e "Outputs →" somem); clicar volta à
      tela do Framing, com o rodapé normal.
- [ ] Align photos, com o foco na lista de sessões (Tab): ← → trocam de foto e o anel de foco da sessão fica parado.
- [ ] Align photos, com o foco na lista (Tab), ↑ ↓ até uma sessão misturada ainda em "As shot" (com "Same framing for
      all ticked sessions" desligado): abre "Choose a ratio first" antes de trocar; "Cancel" fica na sessão de antes.
- [ ] "Choose a ratio first": o botão verde "Use 3:2 · keeps 97%" fica à direita do "Cancel"; as outras proporções
      ficam em "Other ratios", acima.
- [ ] Etiqueta de fotos apagadas: numa sessão, apagar 2 fotos (miniatura e Delete). Aparece "2 deleted" (mesmo desenho
      do "n missing") na lista Sessions, no cabeçalho da sessão, na lista do Export e na janela Project; o mouse em cima
      mostra "2 photos of this session are in the Trash (top bar). Restore brings them back." Restaurar as fotos na
      lixeira: a etiqueta some. ⌘Z do apagar: também some.
- [ ] Janela Project: "Mixed ratios", "n missing" e "n deleted" ficam na coluna Session, embaixo da data; a coluna
      Edited fica só com "Originals" / "Edited n / m".
- [ ] Janela de digitar um nome aberta (ex.: renomear): ⌘Z fora do campo não desfaz nada do app.
- [ ] Export, passo 2, aba Photos: as miniaturas embaixo da prévia já mostram o recorte do Framing (proporção, posição e
      alinhamento), iguais à prévia grande. A caixa de cada miniatura tem a forma do recorte (16:9 mais larga, 1:1
      quadrada, mesma altura) e a imagem a enche sem cortar nem faixa. Em "As shot" sem alinhamento: como antes.
- [ ] Align photos: a barra de cima não tem mais o botão "Back to Framing" (ficava repetido); começa direto em "Photo 01
      of 09 · ← → other photos". Sair: "Done aligning" (rodapé) ou Esc.
- [ ] Align photos: Esc volta à tela do Framing (como "Done aligning"); o Export continua aberto. Fora do Align photos, o
      Esc segue perguntando "Leave Export sessions?".
- [ ] Passos do cabeçalho (caminho B): os de trás ("1 Sessions ✓") voltam com um clique; os da frente não reagem ao
      clique (mouse em cima: "Continue with the green button below"). Avançar só pelo botão verde do rodapé.
- [ ] Regra do ⌘Z: mudar a proporção no passo 1 (sessão A), ir ao passo 2 › aba Sequence e mudar o fps, ir ao passo 3.
      ⌘Z: a janela vai para o passo 2 › Sequence e desfaz o fps (aviso "Undo: Outputs › Sequence · <data de A>"). ⌘Z de
      novo: vai ao passo 1, sessão A, e desfaz a proporção ("Undo: Framing · <data>"). ⇧⌘Z refaz indo aos mesmos
      lugares. Mudança feita no "Align photos": desfazer abre o "Align photos" na foto em que foi feita. Trocar de
      passo, aba, sessão ou foto não entra no desfazer.

## 39. Live view com várias sessões num disparo (2.17.0 em diante)

Com `STILLPOINT_FAKE_CAMERAS=9`. Na tela principal, painel "Bullet time", campo "Sessions" em 3. Abra o "Live view"
(barra de cima); dentro dela, mova o mouse e clique em "Another window"; na segunda janela, em "Mode", escolha
"Audience". Deixe as duas à vista e dispare com "It's bullet time" (ou Space numa das Live).

- [ ] Durante o disparo: igual a antes (contagem, câmeras; "Session 2 of 3" no canto do Operator).
- [ ] No fim, Operator: no canto de cima, à direita, "‹ Session 1 of 3 ›" e "· Playing all"; embaixo, "Playing all
      sessions" e a linha de teclas começa com "← → · other sessions". Cada sessão toca uma volta inteira (com "Reverse
      loop" ligado, 1 → 9 → 1) e passa para a seguinte; depois da 3, volta para a 1. A tira de fotos muda junto.
- [ ] Audience: "Session 1 of 3" no canto de cima, e a mesma sessão que o Operator mostra, trocando junto.
- [ ] Operator: clicar "›" (ou →): vai para a sessão seguinte e fica nela ("· Pinned" em âmbar, "Playing session 2"),
      aparece o botão "Play all" (com a tecla A) e a linha de teclas ganha "A · play all". O Audience vai junto.
- [ ] "Play all" (ou A): volta a "· Playing all", continuando da sessão em que estava; o Audience acompanha.
- [ ] Parado numa sessão sem mexer: depois de 15 s, volta sozinho a "· Playing all".
- [ ] Space dispara de novo: o disparo novo começa em "Playing all", só com as sessões dele.
- [ ] "Sessions" em 1: nada disso aparece (igual a antes).
- [ ] Canto de cima, à direita (aparece com o mouse e some sozinho): duas caixas separadas, uma com "Speed" e "Reverse
      loop", outra com "‹ Session 1 of 2 › Pinned  Play all" e "Reset" (sem o "·" antes de Pinned / Playing all, com o mesmo espaço entre todos). Com a janela estreita, a segunda caixa desce
      para baixo da primeira; o resumo ("9 cameras · all at once") encurta com "…".
- [ ] "Reset" (na segunda caixa, só com a sequência tocando): para a sequência e volta para a tela de pronto ("Ready · …").
- [ ] Modo com duas janelas: com uma Live só, "Mode" troca entre Operator e Audience. "Another window" abre a segunda no
      modo contrário ao da primeira (Operator → a nova é Audience, e o inverso). Com as duas abertas, "Mode" fica preso
      nas duas (só o modo da janela aceso; mouse em cima: "Two Live windows are open…"). Fechando uma ("Close"), a outra
      volta a poder trocar.
- [ ] Disparar, fechar a Live, apagar as sessões na tela principal e abrir a Live de novo: não fica tocando nada (volta
      para a tela de pronto). Apagando só uma das sessões do disparo, a Live continua só com as que sobraram.

## 40. Edit in Lightroom Classic, pedaço 1 (etapa 20; protótipo "Stillpoint e Adobe" aprovado em 2026-11-05)

Precisa do Adobe Lightroom Classic instalado. Pode ser com câmeras simuladas (`STILLPOINT_FAKE_CAMERAS=9`): as fotos de
teste são JPEG e entram no Lightroom do mesmo jeito. Antes, faça um ou dois disparos (de preferência com um projeto aberto,
com rótulo em uma sessão, ex.: "Pose 7").

**Settings com abas**
- [ ] Menu › "Settings…" abre na aba "General" (Theme, Language, Opening). As abas "General", "Projects", "Export",
      "Lightroom & Photoshop" e "Advanced" ficam em cima, no desenho das abas do Export; a janela é mais larga (600 px).
- [ ] "Projects": "New projects". "Export": "Lenticular". "Advanced": "Debug". Tudo funciona como antes.
- [ ] "Lightroom & Photoshop": linha "Lightroom Classic" com "● Found: Lightroom Classic <versão>" e, ao lado, o estado do
      plugin ("not installed yet…" na primeira vez). Botões "Install plugin" (ou "Reinstall plugin") e "Locate…".
      Linha "Catalog" com "The open catalog" (aceso) e "One catalog per project". Linha "Photoshop" com "● Found…" ou
      "● Not found" em âmbar, "Locate…" e, sem o Photoshop, "Get Photoshop".
- [ ] "Install plugin": aviso "Stillpoint plugin installed…"; a linha passa a dizer "Stillpoint plugin <versão>, up to date"
      e o botão vira "Reinstall plugin". No Finder: `~/Library/Application Support/Adobe/Lightroom/Modules/Stillpoint.lrplugin`
      (Windows: `%APPDATA%\Adobe\Lightroom\Modules\Stillpoint.lrplugin`).
- [ ] Na janela Export, uma sessão em "Lenticular" com "Placement: Fit": o link "Settings › Export" abre o Settings já na aba
      "Export".

**Primeira vez com o Lightroom aberto**
- [ ] Com o Lightroom Classic aberto desde antes de instalar o plugin: botão direito numa sessão (lista "Sessions") ›
      "Edit in Lightroom Classic". Depois de uns 20 s aparece "Restart Lightroom Classic" (o Lightroom só carrega plugins
      novos ao abrir). Feche o Lightroom, abra de novo e clique "Try again".

**Mandar a sessão inteira**
- [ ] Botão direito numa sessão › "Edit in Lightroom Classic" (fica logo abaixo de "Show session"). Aparece embaixo
      "Opening <sessão> in Lightroom Classic… waiting for Lightroom" com "Cancel". O Lightroom vem para a frente (ou abre),
      cria a coleção **Stillpoint › <nome do projeto> › <rótulo · data · Session n>** (sessão fora de projeto:
      "No project"), mostra só essa coleção, seleciona todas as fotos e abre o Develop.
- [ ] No Lightroom, as fotos estão no lugar delas (Library › botão direito numa foto › "Show in Finder" aponta para a pasta
      da sessão no projeto ou no app); nada foi copiado.
- [ ] No Stillpoint: aviso "<sessão> is in Lightroom Classic: Stillpoint › …"; a sessão ganha a etiqueta "In Lightroom"
      (lista "Sessions" e janela "Project") e cada miniatura ganha "LR" no canto de baixo à direita.
- [ ] Mandar a mesma sessão de novo: não duplica fotos nem a coleção no Lightroom.
- [ ] Fechar e abrir o Stillpoint: a etiqueta e os "LR" continuam.

**Uma foto**
- [ ] Mouse em cima da foto grande: aparece "Edit in Lightroom Classic…" logo abaixo dos controles do play (canto de cima à
      direita). Também no botão direito numa foto: "Edit in Lightroom Classic…" e "Done editing" (apagado), antes de
      "Show in Finder".
- [ ] Clicar: janela "Edit the whole session?" com "Cancel", "Just this photo" e "Edit the whole session".
      "Just this photo": no Lightroom a coleção tem todas as fotos, mas só essa fica selecionada; no Stillpoint só ela
      ganha "LR". "Edit the whole session": todas selecionadas, com a foto escolhida ativa no Develop.
- [ ] Botão direito numa foto com "LR" › "Done editing": o "LR" some dela. Quando nenhuma foto da sessão tiver "LR", a
      etiqueta "In Lightroom" some.

**Quando não dá**
- [ ] Cancel: feche o Lightroom, clique "Edit in Lightroom Classic" e logo em seguida "Cancel" no aviso de baixo: aviso
      "Edit in Lightroom Classic cancelled"; o Lightroom pode abrir, mas não recebe a sessão.
- [ ] Plugin desligado: no Lightroom, File › Plug-in Manager… › Stillpoint › "Disable". No Stillpoint, "Edit in Lightroom
      Classic": depois de 20 s, "The Stillpoint plugin did not answer" com os 3 passos e "Cancel", "Reinstall the plugin",
      "Try again". Ligar de novo ("Enable") e "Try again": funciona.
- [ ] Settings › "Lightroom & Photoshop" › "Locate…": abre a janela de escolher programa em Aplicativos; escolher outro
      programa (ex.: Calculadora): aviso "That is not Lightroom Classic." Escolher o Lightroom: volta "● Found".
- [ ] (Se tiver como testar) sem o Lightroom no lugar de sempre: "Lightroom Classic is not installed" com "Cancel",
      "Get Lightroom Classic" (abre a página da Adobe) e "Locate…".

**Um catálogo por projeto (para testar a opção B)**
- [ ] Settings › "Lightroom & Photoshop" › Catalog › "One catalog per project". Com um projeto aberto, "Edit in Lightroom
      Classic" numa sessão do projeto: "Create the project's catalog first", com os passos, "Show folder" (abre
      `<projeto>/Lightroom` sem fechar a janela) e "Try again".
- [ ] No Lightroom: File › New Catalog…, na pasta `<projeto>/Lightroom`, nome igual ao do projeto, Create (o Lightroom
      reinicia com ele). "Try again": a sessão entra nesse catálogo.
- [ ] Com o catálogo principal aberto de novo no Lightroom: "Edit in Lightroom Classic" faz o Lightroom trocar para o
      catálogo do projeto (ele pergunta e reinicia); a sessão entra depois que ele abrir.
- [ ] Voltar para "The open catalog".

**Rótulo em várias sessões**
- [ ] Na lista "Sessions", clique numa sessão e ⌘-clique (Windows: Ctrl-clique) em outra. Botão direito numa delas:
      "Add label to 2 sessions…" e, se alguma tiver rótulo, "Remove n labels". "Add label to 2 sessions…" abre "Add label"
      (o campo vem preenchido só se as duas tiverem o mesmo rótulo; com rótulo antigo, o texto avisa que ele é trocado).
      "Add": as duas ganham o rótulo. ⌘Z (Ctrl+Z): as duas voltam ao que eram, num passo só. ⇧⌘Z (Ctrl+Shift+Z): refaz.
- [ ] "Remove n labels": tira o rótulo de todas as selecionadas; ⌘Z devolve.

**Windows**
- [ ] O mesmo roteiro (Settings › "Lightroom & Photoshop", sessão inteira, uma foto, Done editing). "Locate…" abre a
      janela de escolher programa em `C:\Program Files\Adobe`.

## 41. Export to Stillpoint, pedaço 2 (etapa 20; protótipo "Stillpoint no Lightroom Classic")

**Teste automático do plugin (Lightroom de verdade)**
- [ ] Uma vez: no Lightroom, File › New Catalog…, nome "Stillpoint Self-Test".
- [ ] Nesse catálogo: File › Plug-in Extras › Stillpoint: run self-test. No fim aparece "n passed, n failed".
- [ ] Mandar o relatório: `cat ~/Library/Application\ Support/Stillpoint/lightroom/self-test-report.txt`
- [ ] Pelo terminal, sem clicar no menu (2026-11-10): `bash tests/lightroom/run_selftest.sh` (Mac) ou
      `powershell -ExecutionPolicy Bypass -File tests\lightroom\run_selftest.ps1` (Windows). Abre o Lightroom no catálogo de
      teste (o último em que o autoteste rodou), pede o autoteste ao plugin e mostra o relatório. Precisa do plugin novo:
      abrir o Stillpoint uma vez antes.
- [ ] **Teste que junta o Stillpoint e o Lightroom de verdade (2026-11-10):** com o Stillpoint e o Lightroom fechados,
      `bash tests/e2e/run_e2e.sh` (Mac) ou `powershell -ExecutionPolicy Bypass -File tests\e2e\run_e2e.ps1` (Windows). O
      Stillpoint abre no projeto de teste (`build/self-test-project`, só nessa rodada), abre o Lightroom no catálogo dele e
      roda sozinho: sessão nova em 1:1, recorte movido virando alinhamento, Edit again, bloqueio da proporção e Put back,
      Revert to original e o ⌘Z, arquivo recusado. Não clicar em nada durante o teste. No fim: "n passed, 0 failed".
- [ ] O relatório tem a seção **9b. Crop adjusted in Lightroom: the whole way** (bloqueio pelo painel e pelo File › Export…,
      Put back the Stillpoint crop, recorte ajustado no recado, Apply sem recorte, recado do arquivo recusado) sem FAIL.


Precisa do Lightroom Classic e de um projeto aberto com uma sessão já mandada ao Lightroom (seção 40). Feche o Lightroom
antes de começar: o Stillpoint troca o plugin pelo novo no próximo "Edit in Lightroom Classic".

**Painel e menu**
- [ ] "Edit in Lightroom Classic" numa sessão do projeto abre o Lightroom e a janela flutuante "Stillpoint" (o painel):
      PROJECT, SESSION, "Importing n photos…" e depois "Ready to edit. Export when you are done.", botões
      "Export to Stillpoint" e "Apply photo 01 edit to all n".
- [ ] File › Plug-in Extras: "Export to Stillpoint", "Apply photo 01 edit to the session", "Show Stillpoint panel",
      "Go to session in Stillpoint", "Cancel editing" (desde 2026-11-10; faz o mesmo do botão do painel), "About the Stillpoint plugin…", "Stillpoint: listen again". Fechar o painel e usar
      "Show Stillpoint panel" abre de novo.

**Export to Stillpoint**
- [ ] Com fotos da sessão selecionadas: janela "Export to Stillpoint" com Project, Session, Photos (16-bit TIFF, full size),
      Goes to (…/Edited/<sessão>/), File names e "Color" (Adobe RGB (1998) ou Convert to sRGB). "Export" exporta.
- [ ] Os TIFF aparecem em <Projeto>/Edited/<sessão>/ com o nome dos originais; em até 3 s o Stillpoint mostra
      "Edited n / m · <sessão>" e a etiqueta da sessão muda. O painel diz "n edited photos sent to Stillpoint ✓".
- [ ] Exportar de novo fotos que já têm editada pergunta antes: "Replace", "Cancel" e, se só parte tem editada,
      "Only the new ones".
- [ ] Export do Stillpoint com "Use edited photos when available" usa os TIFF (cores certas também em Adobe RGB).

**Apply photo 01 edit**
- [ ] Editar a foto 01 e usar "Apply photo 01 edit to all n": a edição vai para as outras. Se alguma já tem edição
      própria, pergunta "Overwrite", "Cancel" ou "Only the unedited ones".

**Export… do Lightroom**
- [ ] File › Export…, "Export To:" "Stillpoint": seção "Stillpoint" em cima (Project, Session, Goes to, File names); sem
      "Export Location" e "File Naming"; começa em TIFF 16 bits, Adobe RGB, tamanho cheio. "Export" manda para Edited/.

**Prévias**
- [ ] Depois de exportar, as prévias da sessão no Stillpoint (miniaturas e foto grande) mostram a editada.
- [ ] Com todas as fotos da sessão editadas, a etiqueta "In Lightroom" sai e a coleção sai do Lightroom.

**Etiqueta Edited n / m e Delete edits**
- [ ] Clicar na etiqueta "Edited n / m" desliga as editadas (etiqueta riscada e tracejada): prévias e Export voltam aos
      originais; clicar de novo liga. Em Export › Outputs, "Use edited photos" (ao lado de "Same settings for all
      sessions") é a mesma chave.
- [ ] Botão direito na sessão › "Delete edits…"; na foto › "Delete edit…"; com várias fotos selecionadas › "Delete n
      edits…": as editadas vão para a lixeira do Stillpoint (item com o ícone "Lr") e as prévias voltam aos originais;
      ⌘Z e o Restore da lixeira trazem de volta. Apagar a foto (ou a sessão) leva a editada junto, numa linha "Lr"
      embaixo do item, e o Restore traz as duas.
- [ ] Export › Photos › Originals: "Keep the originals, exactly as each camera sent them (RAW and non-RAW)" vem
      marcada ao abrir e copia os originais (nunca as editadas).

**⌘Z (decisões do dono, 2026-11-06)**
- [ ] Clicar na etiqueta Edited é um passo do ⌘Z do Stillpoint.
- [ ] No Lightroom, Edit › Undo mostra o nome do passo do plugin ("Stillpoint: remove collection …", "Stillpoint: apply
      photo 02 edit"). Desfazer a retirada de uma coleção faz a sessão voltar a "In Lightroom" no Stillpoint, com o aviso
      "Back in Lightroom Classic".
- [ ] Export to Stillpoint exporta a sessão inteira aberta no Lightroom, não só as fotos selecionadas, e só as fotos
      com edição no Lightroom (as sem edição ficam de fora e não viram "editadas").
- [ ] Export com só os originais (sem Converted) e a sessão com editadas ligadas: Photos/Edited/ ao lado dos originais.
- [ ] Lixeira: editada apagada antes da foto fica embaixo da foto (recuada); Restore só depois da foto.
      Também dentro de um projeto apagado (a sessão, a foto e a editada, cada uma embaixo da outra).
- [ ] Delete edits volta as fotos ao original no Lightroom (na hora, ou quando o Lightroom abrir o catálogo da sessão);
      ⌘Z no Stillpoint antes disso cancela; depois, o aviso manda usar Edit › Undo no Lightroom.

**Go to session in Stillpoint**
- [ ] Depois de exportar, "Go to session in Stillpoint" (painel ou menu) traz o Stillpoint para a frente com a sessão aberta.

**Lixeira D e ⌘Z (regra X)**
- [ ] A lixeira mostra uma linha baixa por item, com linhas de ligação para o que foi apagado antes, miniaturas reais no fim
      da linha (número da foto; selo LR quando a editada foi junto; listrada quando é só a editada) e, à direita, Restore e ···.
- [ ] ··· tem "Delete permanently" e, numa foto com a editada apagada antes, "Restore the edit of photo NN" e
      "Delete the edit of photo NN permanently".
- [ ] Restaurar pela lixeira não entra no ⌘Z: depois de um Restore, ⌘Z não apaga de novo nem desfaz o "apagar" daquele item.

**Sincronia com o Lightroom (alive.txt com a lista de coleções)**
- [ ] `alive.txt` tem as linhas `collections=1`, `collection=` e `members=` com o Lightroom aberto.
- [ ] Apagar a sessão, Edit › Undo no Lightroom: a etiqueta "In Lightroom" volta no Stillpoint em poucos segundos.
- [ ] Remove from Collection no Lightroom: o selo LR some da foto no Stillpoint; Edit › Undo: volta.
- [ ] Apagar a foto no Stillpoint e restaurar pela lixeira: a foto volta para a coleção no Lightroom.
- [ ] Remove from Collection em todas as fotos da coleção: a sessão sai do "In Lightroom"; Edit › Undo: volta.
- [ ] Sessão apagada no Stillpoint enquanto estava no Lightroom: restaurada pelo Stillpoint (Restore ou ⌘Z) volta sem
      "In Lightroom"; restaurada pelo Edit › Undo do Lightroom sai da lixeira e volta com "In Lightroom".
- [ ] Delete edit, depois Restore da editada pela lixeira: a edição volta também no Lightroom (histórico com um passo
      "Stillpoint: bring back the edit").
- [ ] Export to Stillpoint traz a janela do Stillpoint para a frente com a sessão aberta.

- [ ] Foto apagada e restaurada: a ordem das fotos na coleção do Lightroom continua 01, 02, 03 (igual ao Stillpoint).
- [ ] Delete edit, ⌘Z e ⌘⇧Z várias vezes seguidas numa foto editada: no fim, o Lightroom e o Stillpoint mostram a mesma coisa.
- [ ] Miniaturas e prévia grande das fotos que estão no Lightroom: bolinha âmbar, pulsando só com o Lightroom aberto.

- [ ] Edit in Lightroom Classic com o Lightroom já aberto: o Lightroom vem para a frente com o painel mostrando
      "Preparing n photos to edit…".
- [ ] Export to Stillpoint (painel, menu ou File › Export… › Export To: Stillpoint): o painel vem para a frente.
- [ ] File › Export… › Export To: Stillpoint com fotos editadas e não editadas: sem erro; só as editadas chegam.
- [ ] Delete edit numa sessão que já saiu do Lightroom, ⌘Z e ⌘⇧Z rápidos: a sessão não volta para o Lightroom.

**Cancel editing (painel do Lightroom)**
- [ ] Sem edição nenhuma: Cancel editing tira a coleção sem perguntar; com edições já mandadas, pergunta
      "Cancel editing?" (Cancel editing / Keep editing). Nos dois casos o Stillpoint avisa
      "Editing cancelled in Lightroom Classic" e tira o "In Lightroom".
- [ ] Com mudanças: pergunta "Discard the changes?" com Discard changes, Keep changes e Cancel; Discard volta as fotos ao
      último envio (ou a como chegaram); Keep deixa as mudanças só no Lightroom; Cancel não faz nada.

## 42. Edição dentro do Export (etapa 20; protótipo "Editar dentro do Export", opção A e M1, aprovado em 2026-11-07)

Com câmeras simuladas e o Lightroom Classic com o catálogo do projeto. A janela Export abre pelo botão **Export sessions**
(barra de cima, à direita).

**Janela principal (só mostra)**
- [ ] Botão direito numa sessão: não há mais **Edit in Lightroom Classic**, **Done editing** nem **Delete edits…**.
- [ ] Botão direito numa foto (miniatura ou foto grande): não há mais **Edit in Lightroom Classic…** nem **Delete edit…**;
      sobre a foto grande não aparece mais o botão **Edit in Lightroom Classic…**.
- [ ] Clicar na etiqueta **In Lightroom** ou **Edited n / m** de uma sessão (lista da esquerda ou janela Project) abre o
      Export direto no passo **2 Edit**, nessa sessão.

**Export › 2 Edit**
- [ ] Em cima, os passos **1 Sessions — 2 Edit — 3 Outputs — 4 Review**; no passo 1 o botão verde é **Edit →**; no Edit,
      **← Sessions** e **Outputs →**.
- [ ] A prévia grande abre tocando, indo e voltando (1, 2, 3, 4, 3, 2…), com o botão de play/pause (canto de baixo à
      direita) e o de modo teatro (canto de cima à esquerda). A barra de espaço pausa e volta a tocar.
- [ ] Modo teatro: a prévia cresce, o bloco do Lightroom some e, com o mouse sobre a foto, aparecem no canto de cima à
      direita ‹, play, ›, **Speed** com − e + e **Reverse loop**, com o mesmo comportamento da tela cheia da janela principal.
      O botão de modo teatro de novo volta ao normal.
- [ ] Sessão sem edição: o bloco **Lightroom Classic** tem só **Edit in Lightroom Classic** (sem o texto **Not edited**, que saiu em 2026-11-10). Clicar manda a
      sessão; com proporções misturadas e **As shot**, pergunta **Crop before Lightroom Classic?** como antes; escolhendo
      **Crop to 3:2**, o Framing da sessão no passo 1 passa a 3:2.
- [x] **Orientação do Aspect ratio (2026-11-11):** no passo **1 Sessions**, ao lado das proporções, dois botões com ícone (retângulo
      deitado e retângulo em pé; a dica diz **Horizontal** / **Vertical**). Sessão com fotos deitadas e **3:2**: o deitado está
      aceso. Clicar no em pé: a lista vira **As shot, 2:3, 3:4, 9:16, 1:1**, o quadro da prévia fica em pé dentro da foto, as
      miniaturas, o selo da sessão na lista (**2:3**) e **keeps n%** acompanham. Em **As shot** e **1:1** os dois ficam apagados.
- [x] **Align photos** tem os mesmos dois botões ao lado das proporções; em pé, o canvas aparece como **2:3** (etiqueta do quadro
      e a linha **Canvas … px (2:3)**).
- [x] Com **Same framing for all ticked sessions** marcado, a orientação vai junto para as outras sessões marcadas (menos as travadas).
- [x] **Seleção das sessões guardada (2026-11-11):** em **Export sessions**, desmarque algumas sessões, saia do Stillpoint e abra de novo: as mesmas continuam desmarcadas. Uma sessão fotografada depois entra marcada. Vale por projeto.
- [x] **Flip no Align photos (2026-11-11):** em **Align photos**, painel **This photo**, a linha **Flip** tem dois botões de ícone da largura do **− número +** e, embaixo, **Apply to all**. O primeiro espelha a foto aberta da esquerda para a direita, o segundo de cima para baixo; cada um liga e desliga. A miniatura fica espelhada e ganha a marca no canto de baixo, à esquerda.
- [x] **Apply to all** dá a todas as fotos o espelhamento da foto aberta (aviso "Flip of photo NN on the N photos · ⌘Z undoes"); ⌘Z desfaz de uma vez. **Reset photo** e **Reset all** tiram o espelhamento.
- [x] A foto espelhada aparece espelhada nas prévias dos passos 1, 2 e 3 e sai espelhada nos arquivos convertidos (**Photos › Converted**, **Sequence**, **Lenticular**); a pasta **Originals** continua como a câmera mandou.
- [x] **Edit in Lightroom Classic** com foto espelhada: no Lightroom a foto aparece sem espelhar, com o recorte no trecho certo; de volta ao Stillpoint a editada aparece e sai espelhada.
- [x] Sessão em **2:3** › **Edit in Lightroom Classic**: no Lightroom cada foto abre com o recorte em pé; a editada volta em pé e é
      usada. Com foto editada, os dois botões ficam travados junto com o resto do Framing.
- [ ] Exportar essa sessão (Photos convertidas, Sequence): os arquivos saem em pé, 2:3.
- [ ] **⌘Z desfaz só aquela ação (2026-11-10):** numa sessão com uma foto editada, apagar a foto 03 na janela principal
      (botão direito › **Delete photo 03…** › **Delete**); depois, no **Export › 2 Edit**, **Revert to original…** da editada;
      fechar o Export e desfazer as duas com ⌘Z, uma por vez: cada ⌘Z traz só o que aquela ação apagou.
- [ ] Sessão no Lightroom, com o Lightroom aberto em **outro** catálogo (File › Open Recent): o bloco diz **In Lightroom Classic ·
      n photos** e, ao lado, o link **open the catalog <nome> to see them**; clicar no link manda o Lightroom abrir esse catálogo
      (o Lightroom pergunta **Relaunch**); de volta ao catálogo da sessão, o link some (em alguns segundos).
- [ ] Sessão no Lightroom: o bloco diz **In Lightroom Classic · n photos** (bolinha pulsando com o Lightroom aberto) e tem
      **Done editing**; na fileira, **LR** em cada foto.
- [ ] Depois de **Export to Stillpoint** no Lightroom: o bloco diz **n of m photos edited** e tem **Edit again in Lightroom
      Classic** e **Revert to original…** (vermelho), sem a caixa **Use edited photos** (saiu em 2026-11-10); na fileira, **ED** nas fotos editadas; **Original / Edited**
      (em cima, à direita) troca a foto mostrada e é a mesma chave da etiqueta **Edited n / m**.
- [ ] Botão direito numa miniatura da fileira: **Edit just this photo in Lightroom Classic** manda só essa foto; nas
      editadas, também **Revert to original…** (pergunta **Revert 1 photo to the original?**; **Revert to original** manda a
      editada para a lixeira e a foto volta ao original, também no Lightroom; ⌘Z desfaz). Não há **Delete photo** aqui.
- [ ] Fechar o Export (**Cancel** › **Leave**) com uma sessão no Lightroom e abrir de novo: abre no passo **2 Edit**,
      nessa sessão.
- [ ] O passo **3 Outputs** não tem mais **Use edited photos**.
- [ ] Com uma sessão marcada no Lightroom (**In Lightroom**), **Outputs →** fica apagado e o rodapé explica por quê; depois de
      **Export to Stillpoint**, **Cancel editing** ou **Done editing**, volta a funcionar.
- [ ] **Sem lixeira no Export** (decisão de 2026-11-10): não há lixeira acima da lista de sessões em nenhum passo, e não
      dá para arrastar fotos nem sessões para apagar dentro do Export. O passo 1 continua com **Select all** / **Unselect all**.
- [ ] **Framing travado:** sessão com alguma foto editada, passo **1 Sessions**: **Aspect ratio**, os pontos de **Position**,
      **Align photos** e **Same framing for all ticked sessions** ficam apagados e não respondem; arrastar a foto na prévia não
      move; a etiqueta da prévia diz **original · the framing is locked**; aparece a caixa **Framing locked.** com o botão
      **Go to 2 Edit** (leva ao passo 2); o selo da sessão na lista ganha um cadeado.
- [ ] Sessão no Lightroom (**In Lightroom**): o mesmo, com o texto **Framing locked while this session is in Lightroom Classic**.
- [ ] **Revert to original…** de todas as editadas (bloco Lightroom Classic do **2 Edit**): de volta ao passo 1, o Framing
      destrava. ⌘Z do Revert: trava de novo.
- [ ] Sessão sem edição, com **Same framing for all ticked sessions** e outra sessão marcada que está travada: aparece a linha
      **n ticked session(s) keep(s) … framing**, e mudar a proporção não muda a da sessão travada.
- [ ] Passo 1 e **Align photos** mostram sempre as fotos originais (inteiras, sem o recorte nem os ajustes do Lightroom), mesmo
      com **Edited** ligado; nenhuma foto aparece esticada.
- [ ] **Alinhamento no Lightroom:** sessão com fotos alinhadas no **Align photos** (com giro em pelo menos uma), **Edit in
      Lightroom Classic**: no Lightroom, cada foto abre com o recorte dela (a ferramenta Crop mostra o quadro deslocado e, na
      foto girada, o ângulo); passando pelas fotos, o assunto fica no mesmo lugar. Depois de **Export to Stillpoint**, as
      editadas voltam já alinhadas e do mesmo tamanho.
- [ ] No catálogo **Self-Test**, **Stillpoint: run self-test**: o relatório tem a linha do recorte girado ("with a turned crop") sem FAIL.
- [ ] **Recorte ajustado no Lightroom (decisões de 2026-11-10):** sessão em 1:1 no Lightroom; na ferramenta Crop, mover,
      redimensionar ou girar o recorte de uma foto **sem mudar a proporção** e fazer algum ajuste; **Export to Stillpoint**: a
      foto chega, o aviso diz **photo 0n aligned from Lightroom** (acima do rodapé do Export, sem cobrir os botões), e o passo **1 Sessions** mostra a foto
      original na posição nova (selo **1:1 · aligned**). Trocar **Original / Edited** no **2 Edit** não faz a foto pular.
- [ ] **Revert to original** dessa foto: o alinhamento volta ao que era antes de ela ir. ⌘Z: volta o do Lightroom.
- [ ] **Edit again in Lightroom Classic**: no Lightroom a foto abre com o recorte que a pessoa tinha deixado lá.
- [ ] Recorte mexido e **Done editing** ou **Cancel editing** sem exportar: nada muda no Stillpoint.
- [ ] **Proporção trocada bloqueia:** no Lightroom, mudar a proporção do recorte de uma ou duas fotos (por exemplo, de 1 x 1
      para 3 x 2) e clicar em **Export to Stillpoint** (painel do Stillpoint): aparece a janela **Export to Stillpoint blocked:
      n photo(s) … not 1:1**, com a lista das fotos, **now 3:2** e como corrigir; nada é exportado; as fotos erradas ficam
      selecionadas; a caixa de estado do painel diz **Export blocked: …**. Botões: **Put back the Stillpoint crop** e **OK**.
- [ ] **OK**, corrigir a proporção à mão (Crop, Aspect 1 x 1) e exportar de novo: funciona.
- [ ] **Put back the Stillpoint crop**: as fotos da lista voltam ao recorte que o Stillpoint mandou; exportar de novo funciona.
- [ ] O mesmo bloqueio em **File › Export…** com **Export To: Stillpoint**.
- [ ] **Apply photo 0n edit to all n** (painel): copia os ajustes, mas o recorte de cada foto fica como estava.
- [ ] **Arquivo com outra proporção salvo à mão:** exportar do Lightroom para disco (File › Export…, Hard Drive) uma foto da sessão
      com outra proporção, com o mesmo nome do original, para dentro de `<projeto>/Edited/<sessão>/`. Em até alguns segundos
      o Stillpoint mostra o aviso âmbar **Photo 0n · edited file not used: it is 3:2 and the session is 1:1**; no **2 Edit**, a
      miniatura da foto continua com a original e ganha um triângulo âmbar, o bloco **Lightroom Classic** diz **… · 1 not used**
      e tem a linha **Photo 0n: the edited file is 3:2, but the session is 1:1…**; o arquivo continua na pasta.
- [ ] No Lightroom (aberto, no catálogo da sessão) aparece **Stillpoint did not use 1 edited photo**, com a foto selecionada.
- [ ] Trocar o arquivo por um com a proporção certa: o triângulo e a linha somem e a foto passa a contar como editada.
- [ ] Sessão **As shot** sem alinhamento: nenhuma conferência de proporção, nem no Lightroom nem no Stillpoint.
- [ ] **Stillpoint: run self-test** (catálogo **Self-Test**): as linhas da seção 1b sobre a proporção ("shape check, no tolerance",
      "crop moved and resized", "another shape", "Put back the Stillpoint crop") sem FAIL. É o teste que diz se conferir sem
      tolerância é viável no Lightroom de verdade.
- [ ] Janela principal: soltar na lixeira da barra de cima uma foto que tem editada também pergunta **Delete the edit or the photo?**.
- [ ] Passo **1 Sessions**: a fileira de miniaturas mostra o recorte escolhido (muda ao trocar o **Aspect ratio**).
- [ ] Com **1:1** (ou outra proporção) no passo 1: as miniaturas da lista de sessões (esquerda), da fileira do **2 Edit**,
      da fileira de **3 Outputs › Photos** e da tabela do **4 Review** mostram a foto recortada, inteira, dentro da caixa de
      sempre (3:2), com faixas pretas; as caixas não mudam de forma. A prévia grande do **2 Edit** (tocando e no modo teatro)
      também mostra a foto recortada.

## 43. O projeto guarda o estado do rig (protótipo "Estado do rig" aprovado em 2026-11-11)

Decisões do dono (2026-11-11): entra tudo (painel **Bullet time**, ordem das câmeras, configurações das câmeras); ao
abrir um projeto com câmeras diferentes, o Stillpoint lê as câmeras e pergunta antes de aplicar; câmera faltando ou
nova só avisa; com o projeto aberto, cada mudança vai para ele na hora; **Keep the cameras as they are** não muda o
projeto; sem projeto, padrão de fábrica e nada é guardado. O estado fica no arquivo `stillpoint-rig.json`, na pasta do
projeto. As câmeras simuladas voltam ao padrão cada vez que o Stillpoint abre (é o que permite ver o aviso sem câmeras
de verdade).

- [ ] Com um projeto aberto, mudar **Countdown**, **Sessions**, **Download wait** e o **Timing** (painel **Bullet time**,
      embaixo à direita); fechar o Stillpoint (⌘Q) e abrir de novo: os quatro voltam como ficaram.
- [ ] Mudar a ordem das câmeras (setas da lista **Cameras**, embaixo à esquerda); fechar e abrir: a ordem volta.
- [ ] Em **Camera settings** (botão acima da lista **Cameras**), mudar o **ISO** de uma câmera; fechar e abrir: aparece o
      aviso **The cameras are not as this project left them**, com uma linha na tabela (a câmera, **ISO**, o valor da
      câmera agora e o valor do projeto) e os botões **Keep the cameras as they are** e **Apply the project settings**.
- [ ] **Keep the cameras as they are**: nada muda nas câmeras; o aviso não volta enquanto o projeto estiver aberto;
      fechar e abrir o Stillpoint: o aviso aparece de novo, com a mesma linha.
- [ ] **Apply the project settings**: aviso **Project settings applied to 1 camera** (canto de baixo); em **Camera settings** a
      câmera está com o valor do projeto.
- [ ] ⌘Z depois de **Keep the cameras as they are**: o aviso volta, com as mesmas linhas, para escolher de novo
      (decisão do dono, 2026-11-11).
- [ ] ⌘Z depois de **Apply the project settings**: aviso **Undo** com **Apply the project settings (1 camera)**; a câmera
      volta ao valor que tinha e o projeto não muda. ⇧⌘Z aplica de novo.
- [ ] Trocar de projeto (seletor de projeto, barra de cima): o painel **Bullet time** e a ordem das câmeras passam a ser
      os do outro projeto; voltar ao primeiro: voltam os dele.
- [ ] Fechar o projeto (seletor de projeto › **Close project**): **Countdown 0**, **Sessions 1**, **Download wait 10**,
      **All at once**, câmeras na ordem em que conectaram; nenhuma pergunta; mudanças feitas sem projeto não vão para
      projeto nenhum.
- [ ] Abrir o Stillpoint com menos câmeras do que o projeto tem (`STILLPOINT_FAKE_CAMERAS=8`), sem diferença de
      configuração: só o aviso âmbar **The rig is not the one of this project · … not connected**; as outras fecham o
      buraco na lista; abrir de novo com as 9: a câmera volta ao lugar dela.
- [ ] Abrir com uma câmera a mais (`STILLPOINT_FAKE_CAMERAS=10`): aviso âmbar **… is new**; ela entra no fim da lista.
- [ ] Câmeras reais: mudar uma configuração no corpo da câmera com o Stillpoint fechado e abrir o projeto: o aviso
      mostra a diferença; **Apply the project settings** põe a câmera como o projeto guardou.
- [ ] Windows: os itens acima.

## 44. Activity à vista com as janelas abertas (decisão do dono, 2026-11-11)

- [ ] Abrir **Export sessions** (barra de cima, à direita): a barra **Activity** continua acesa embaixo, com a última
      linha legível; a janela fica inteira acima dela.
- [ ] Com a janela aberta, clicar na barra **Activity**: a lista abre por cima da janela; clicar de novo fecha.
- [ ] O mesmo com **Camera settings**, a janela **Project**, **Settings** e **About**.
- [ ] Um aviso de pergunta (por exemplo **Leave Export sessions?**), a contagem do disparo e a tela cheia das fotos
      continuam cobrindo tudo, como antes.
- [ ] Janela do Stillpoint pequena: nenhum botão de baixo das janelas fica cortado ou escondido pela barra.
- [ ] Janela **Trash** (botão da lixeira, barra de cima): a barra **Activity** também fica à vista (pedido do dono, 2026-11-11).
- [ ] Tela cheia da sessão: a barra **Activity** fica escondida; levar o mouse até a borda de baixo da janela faz ela subir
      de leve; afastar o mouse faz descer. Clicar nela abre a lista, que fica aberta até ser fechada (pedido do dono, 2026-11-11).
- [ ] Windows: os itens acima.

## 45. Edit in Photoshop, primeira parte (etapa 20; protótipo "Photoshop no Export" aprovado em 2026-11-12)

Decisões do dono (2026-11-11/12): a foto volta por cópia de trabalho e ⌘S; original RAW sem editada não abre e a
janela oferece o Lightroom; a cópia vai já com o Framing da sessão; antes do primeiro ⌘S a miniatura tem a marca **PS**
e o bloco tem **Cancel**; cópia em TIFF de 16 bits. O Photoshop é o acabamento, depois do Lightroom. Blocos compactos:
a explicação fica no **?** ao lado do título; o aviso âmbar e a linha do Framing travado continuam à vista.

- [ ] **Export sessions › 2 Edit**: embaixo do bloco **Lightroom Classic** há o bloco **Photoshop**, com o botão
      **Edit photo 0n in Photoshop** (a foto selecionada na fileira; muda ao selecionar outra). Os dois blocos têm um
      **?** ao lado do título, sem legenda embaixo dos botões.
- [ ] Botão direito numa miniatura da fileira: **Edit just this photo in Photoshop**.
- [ ] **Edit photo 03 in Photoshop** (original JPEG): o Photoshop abre um TIFF de 16 bits com o nome da foto, da pasta
      **Edited** da sessão. No Stillpoint a miniatura ganha **PS** e o bloco diz **Photo 03 open in Photoshop · waiting
      for the save**, com **Open photo 03 again** e **Cancel**. A foto ainda não conta como editada.
- [ ] **Cancel**: a marca **PS** some e o arquivo sai da pasta **Edited**.
- [ ] Abrir de novo, mudar algo no Photoshop e salvar (⌘S): em alguns segundos o aviso **Photo 03 edited in
      Photoshop**, **ED** na miniatura, a prévia com a mudança, o bloco com **Photo 03 edited in Photoshop** e o botão
      **Edit photo 03 again in Photoshop**; o bloco do Lightroom conta **1 of n photos edited**.
- [ ] Salvar de novo no Photoshop, com outra mudança: a prévia e a miniatura atualizam sozinhas.
- [ ] Salvar com **camadas** no Photoshop (o padrão do TIFF): o Stillpoint lê e mostra a imagem inteira.
- [ ] Sessão com **1:1** (ou outra proporção) no passo 1: a cópia abre no Photoshop já recortada; o Framing fica travado
      no passo 1 enquanto a foto está aberta ou editada.
- [ ] Cortar a foto no Photoshop (outra proporção) e salvar: o Stillpoint recusa, como qualquer editada com outra
      proporção (aviso âmbar e triângulo na miniatura).
- [ ] Foto com **Flip** no Align photos: abre no Photoshop sem espelhar e aparece espelhada no Stillpoint depois de salva.
- [ ] Foto que já tem editada do Lightroom: **Edit photo 0n in Photoshop** abre a própria editada (sem criar outra); ao
      salvar, o bloco passa a **Photo 0n edited in Photoshop**.
- [ ] Sessão **In Lightroom**: pedir o Photoshop numa foto mostra **Photo 0n is open in Lightroom Classic**, com
      **Cancel** e **Open in Photoshop anyway**.
- [ ] Original **RAW** sem editada: **Photo 0n is a RAW file**, com **Cancel** e **Edit in Lightroom Classic**.
- [ ] Sem o Photoshop instalado (ou com outro caminho): **Photoshop is not installed**, com **Get Photoshop** e **Locate…**.
- [ ] **Revert to original…** tira também a edição do Photoshop (vai para a lixeira; ⌘Z traz de volta).
- [ ] Windows: os itens acima.

## Resultado

| Data | Sistema | Branch/versão | Câmeras | Passou? | Observações |
| --- | --- | --- | --- | --- | --- |
| 2026-10 | Windows | v1.3.0 | Canon SL3 + Canon T7 | sim | Teste de referência, antes da migração |
| 2026-11-10 | Mac (M5, macOS 26) | etapa-20-lightroom (2.17.0) | 9 simuladas | sim | Seção 42, aprovado pelo dono do projeto item a item, com o Lightroom Classic 15.6: Framing travado (controles apagados, caixa de cantos retos, Go to 2 Edit, sem lixeira no Export), Same framing com sessão travada (linha das que ficam, textos sem contar as travadas), recorte ajustado no Lightroom virando alinhamento, Revert to original devolvendo o alinhamento e o ⌘Z, alerta de bloqueio da proporção e Put back the Stillpoint crop, arquivo recusado no Export › Edit (triângulo, linha, 1 not used), nome da sessão no Export, aviso acima do rodapé do Export, Use edited photos e Not edited fora do bloco, ⌘Z de apagar fotos, Cancel editing no menu do Lightroom, nome do catálogo no bloco e o link que o abre. Automáticos no Mac: autoteste do plugin 144 de 144 e o teste que junta Stillpoint e Lightroom 30 de 30. Sem ok ainda: o recado do arquivo recusado não se repetir depois de abrir outro projeto (só o uso confirma). Pendente: Windows (tudo desta linha, junto com os outros testes do Windows) |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (2.17.0) | 9 simuladas | sim | Seção 42, aprovado pelo dono do projeto item a item: orientação do Aspect ratio no passo 1 Sessions e no Align photos (proporções dentro do painel), Same framing copiando a orientação, arquivos convertidos (JPG) em pé com Originals sem mudança, recorte em pé ao abrir no Lightroom Classic e a editada voltando em pé para o Stillpoint, seleção das sessões guardada ao fechar o Stillpoint, ⌘Z e ⇧⌘Z no Align photos. Windows pendente. |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.18.0) | 9 simuladas | sim | Aprovado pelo dono do projeto item a item: etiquetas da sessão alinhadas na janela Project; o aviso Mixed ratios da janela principal dizendo a proporção em pé (Crop on export: 2:3); ⌘Z com o cursor na caixa de um número do Align photos (Size 110, Enter, ⌘Z). Windows pendente. |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.18.0) | 9 simuladas | sim | Foto girada 90° no Lightroom Classic 15.6 (Photo › Rotate Right) numa sessão 3:2: o Export to Stillpoint é bloqueado com o alerta (now 2:3, rotated) e Put back the Stillpoint crop gira a foto de volta; aprovado pelo dono. Autoteste do plugin: 153 de 153. Fotos espelhadas (Flip Horizontal / Flip Vertical) voltam espelhadas e são aceitas (visto no teste; decisão do dono pendente). Windows pendente. |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.18.0) | — | sim | Autoteste do plugin no Lightroom Classic 15.6: 155 de 155, com o caso novo do recado do arquivo recusado (o Lightroom é levado a um lugar sem a foto; o plugin mostra a foto e a seleciona). Só pelo autoteste: sem conferência à mão do dono nesse caso. |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.18.1) | 9 simuladas | sim | Flip no Align photos, aprovado pelo dono do projeto item a item: os dois botões e Apply to all; ícones menores e a marca de um ícone só na miniatura (sem encostar no 16:9); a foto 01 espelhada sai espelhada na pasta JPG e sem espelhar em Originals; no Lightroom Classic 15.6 a foto chega sem espelhar e volta ao Stillpoint editada e espelhada (vídeo do dono). Sequence e Lenticular com foto espelhada não foram conferidos à mão. Windows pendente. |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 8, 9 e 10 simuladas | sim | Seção 43 (o projeto guarda o estado do rig), aprovado pelo dono do projeto parte por parte: painel Bullet time e ordem das câmeras voltando ao reabrir; aviso The cameras are not as this project left them com Keep the cameras as they are e com Apply the project settings; Close project (padrão de fábrica, ordem de conexão, sem pergunta) e reabrir; dois projetos (New project, Switch project); uma câmera a menos (linha Not connected) e uma a mais (linha New, no fim da lista). Não testado: o aviso âmbar sozinho (só pelo teste automático), Windows, câmeras reais. Pedido do dono depois do teste: ⌘Z para o aviso |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 9 simuladas | sim | Seção 43, ⌘Z do aviso do rig, aprovado pelo dono do projeto: depois de Keep the cameras as they are o aviso volta; depois de Apply the project settings a câmera volta ao valor que tinha (aviso Undo) e ⇧⌘Z aplica de novo. Não testado: Windows, câmeras reais |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 9 simuladas | sim | Seção 44, aprovado pelo dono do projeto: a barra Activity à vista com Export sessions, Camera settings e a janela Project abertas, e a lista abrindo por cima da janela. Não testado: Trash e tela cheia (pedidos depois), janela pequena, Windows |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 9 simuladas | sim | Seção 44: a barra Activity à vista com a janela Trash aberta, aprovado pelo dono do projeto. A tela cheia da sessão (a barra sobe com o mouse embaixo) ainda sem ok explícito |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 9 simuladas | sim | Testes acumulados, aprovado pelo dono do projeto: Sequence (GIF) com a foto 01 espelhada no Align photos (Flip) sai com a foto 01 espelhada e as outras normais |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 9 simuladas | sim | Testes acumulados, aprovado pelo dono do projeto: Lenticular (TIFF) com todas as fotos espelhadas (Flip, Apply to all) sai espelhado |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | — | parcial | Autoteste do plugin, primeira rodada no Lightroom Classic 16.0: 154 de 155. Falhou de novo "reset: photo 01 back to how it arrived", sem diferença a mostrar: a conferência do teste era exata e o plugin compara ignorando o que o Lightroom acrescenta sozinho (FilterList, listas vazias). Conferência do teste trocada para a comparação do plugin; falta rodar de novo |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | — | sim | Autoteste do plugin no Lightroom Classic 16.0, segunda rodada: 155 de 155. A linha nova confirmou a causa da falha isolada: depois do reset o Lightroom acrescenta sozinho a FilterList (que o plugin já não conta como edição) |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 9 simuladas | sim | Testes acumulados, aprovado pelo dono do projeto, com o Lightroom Classic 16.0: arquivo 3:2 posto à mão em Edited numa sessão 1:1 com o Lightroom na Quick Collection: o Stillpoint recusa (aviso âmbar), o Lightroom mostra Stillpoint did not use 1 edited photo e vai até a foto, selecionada |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 8 e 9 simuladas | sim | Seção 43, aprovado pelo dono do projeto: projeto criado com as câmeras no padrão, aberto com uma câmera a menos: só o aviso âmbar The rig is not the one of this project (sem janela de pergunta); com as 9 de novo, nenhum aviso e a câmera de volta no lugar. Visto também: a janela de pergunta com uma diferença e a linha Not connected juntas |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 9 simuladas | sim | Seção 44, aprovado pelo dono do projeto: na tela cheia da sessão a barra Activity fica escondida, sobe com o mouse na borda de baixo, desce ao afastar; clicada, a lista abre e fica até ser fechada |
| 2026-11-11 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.19.0) | 9 simuladas | sim | Seção 44, aprovado pelo dono do projeto: com a janela do Stillpoint no menor tamanho, Export sessions, Camera settings e a janela Project cabem inteiras acima da barra Activity, com os botões de baixo à vista. Testes acumulados do Mac zerados; Windows e câmeras reais seguem pendentes |
| 2026-11-12 | Mac (M5, macOS 26) | etapa-20-lightroom (depois da 2.20.0) | 9 simuladas | parcial | Seção 45, primeiro passo, com o Photoshop 2027 de verdade: o bloco Photoshop e o botão Edit photo 03 in Photoshop, a cópia abrindo no Photoshop (RGB/16, 759 × 506, sessão 3:2) e a marca PS aprovados pelo dono. O salvamento ele gravou em vídeo, sem dizer ok: na gravação, depois do ⌘S o Stillpoint mostra Photo 03 edited in Photoshop, ED, Edited 1 / 9 e a prévia com o risco; desfeito e salvo de novo no Photoshop, a prévia volta sem o risco. Falta o ok dele para esse passo e o resto da seção (camadas, Cancel, recorte, RAW, Lightroom) |
| 2026-11-05 | Mac (M5, macOS 26) | etapa-20-lightroom (2.17.0) | 9 simuladas | sim | Seção 40 (pedaço 1 do Lightroom Classic 15.6) aprovada pelo dono do projeto: Settings com abas, plugin instalado e carregado, sessão inteira com o Lightroom aberto e fechado, uma foto só, Done editing (foto e sessão), plugin desligado e ligado de novo, Cancel, rótulo em várias sessões. Corrigido no caminho: o Lua do Lightroom não tem os.remove/os.rename; trocar o plugin com o Lightroom aberto o deixava mudo; desligado ele continuava respondendo. Depois das decisões da noite: Just this photo manda só a foto, várias fotos selecionadas, Done editing só na sessão tirando a coleção (com o Lightroom aberto e fechado), bolinha pulsando só com o Lightroom aberto — aprovados. Catálogo por projeto aprovado (criar com File › New Catalog, troca com Relaunch, Done editing com outro catálogo aberto espera o certo); agora é o padrão. Em 2026-11-06: catálogo vazio Template com a janela de slides aprovado no Lightroom de verdade (slides, achar na Mesa, criar o catálogo do projeto, Relaunch, pasta da Mesa no Lixo). Pendente: Windows (junto com os outros testes do Windows) |
| 2026-11-05 | Mac (M5, macOS 26) | proporcao (2.17.0) | 9 simuladas | sim | Seção 39 (Live view com várias sessões: Playing all, Pinned, Play all, 15 s, Audience acompanhando, Reset, sessões apagadas, modo preso com duas janelas) aprovada pelo dono do projeto. Windows: compila; sem teste de uso |
| 2026-11-04 | Mac (M5, macOS 26) | proporcao (2.16.0) | 9 simuladas | sim | Seções 35, 36, 36 B, 37, 38, 38 B e 38 C aprovadas pelo dono do projeto (Mixed ratios, Framing, Align photos, Export em três passos, exportação real com 3:2 e alinhamento). Pendente: câmeras reais (cartão cinza, Calibrate with chart, RAW, impressão lenticular, Ratio na SL3 e na T7) e Windows |
| 2026-10-29 | Mac (M5, macOS 26) | etapa-17-project (2.12.0) | 9 simuladas | sim | Roteiro 23 com câmeras simuladas aprovado pelo dono do projeto (projeto, arrastar, botão direito, rótulos, rename, undo/redo, avisos, Activity). Windows: compila; sem teste de uso. Câmeras reais: pendente |
| 2026-11-01 | Mac (M5, macOS 26) | etapa-19-lenticular (2.14.0) | câmeras reais | sim | Seção 25 inteira aprovada pelo dono do projeto (Camera settings, ordem das câmeras, fotos reais, Save sessions com projeto/Exports/Originals+JPG/Lenticular TIFF) |
| 2026-10-29 | Mac (M5, macOS 26) | v2.12.0 | Canon T7 + SL3 + T5 | sim | Câmeras reais: sessão em `Originals/` com `session.json`; `.xmp` renomeado junto no Reorder + Cmd+Z; Camera settings com undo/redo (um por segundo, sem travar; valores batem com o LCD; disparo depois OK); Copy from camera + undo; apagar foto/sessão + Cmd+Z com RAW (`Photos/.trash`, vazia ao reabrir); projeto em HD externo (apagar + undo copiando entre discos; reabrir pelos recentes); ordem das câmeras (^ v e Reorder by photo) + undo; foto recusada (Sweep 0,3 s, 1→3→1: "1 MISSING" sobrevive ao reabrir). **Bug:** HD ejetado com o app fechado → ao abrir, "No project" em vez de âmbar "not reachable" (corrigido na 2.12.1). |
| 2026-10-10 | Windows | etapa-1-cmake (CMake + EDSDK 13.20.10) | Canon SL3 + Canon T7 | sim | Checklist completa |
| 2026-10-10 | Windows | etapa-2-plataforma (camada de plataforma) | Canon SL3 + Canon T7 | sim | Teste reduzido: detecção, pasta Downloads, áudio, 2 sessões, desconexão |
| 2026-10-10 | Mac (M5, macOS 26) | etapa-3-macos | Canon SL3 + Canon T7 | sim | Primeiro teste no Mac: detecção, áudio, BULLET TIME, download |
| 2026-10-10 | Windows | etapa-3-macos | Canon SL3 + Canon T7 | sim | Conferência após mudanças da etapa 3: compila e detecta as câmeras |
| 2026-10-10 | Mac (M5, macOS 26) | fix-feedback-conexao | Canon SL3 + Canon T7 | sim | Reconexão da T7: progresso na conexão, espera automática, SL3 mantida conectada |
| 2026-10-10 | Windows | fix-feedback-conexao | — | não testado | Só compilado; teste com câmeras dispensado pelo dono do projeto |
| 2026-10-10 | Mac + Windows | etapa-4-core | Canon SL3 + Canon T7 (Mac) | sim | Compila nos dois; Mac detecta as câmeras. Saída idêntica à versão anterior em teste simulado (SDK falso) |
| 2026-10-10 | Mac + Windows | etapa-diagnostico | Canon SL3 + Canon T7 (Mac) | sim | Mac: guia sem câmeras, detecção sem aviso de compatibilidade, T7 dispara sem cartão (configurada para isso). Windows: compila |
| 2026-10-14 | Mac + Windows | etapa-5-interface | Canon SL3 + Canon T7 | sim | Versão de janela e de terminal nos dois; app de Mac (.app) com dois cliques; "Restart app" testado nos dois |
| 2026-10-14 | Mac + Windows | etapa-6-icone-e-nome | — | sim | Ícone e nome Stillpoint funcionando nos dois (confirmado pelo dono do projeto) |
| 2026-10-14 | Mac + Windows | etapa-7-instaladores | — | sim | `.dmg` (fundo, posições, Read Me) e instalador de Windows aprovados pelo dono do projeto |
| 2026-10-14 | Mac + Windows | etapa-8-atualizacao | Canon T7 (Mac) | sim | Atualização simulada (2.1.0 → 2.2.0) aprovada pelo dono do projeto nos dois sistemas |
| 2026-10-14 | Mac + Windows | etapa-9-abertura | — | sim | Abertura aprovada pelo dono do projeto nos dois sistemas |
| 2026-10-14 | Mac + Windows | v2.4.0 | — | sim | Primeira atualização real pelo app (2.3.0 → 2.4.0) funcionou nos dois sistemas |
| 2026-10-15 | Mac + Windows | etapa-10-exportacao | — (sessão de teste) | sim | Exportação (fotos e sequência), Replace e qualidade aprovados pelo dono do projeto; qualidade com RAW real fica pendente |
| 2026-10-15 | Mac + Windows | etapa-11-menu | Canon SL3 + Canon T7 | sim | Menu do Mac, botão de menu do Windows, About, Settings, campos numéricos e cancelamento do bullet time aprovados pelo dono do projeto |
| 2026-10-15 | Mac + Windows | fix-reconexao (2.6.1) | Canon SL3 + Canon T7 | sim | Câmeras religadas voltam sozinhas; Restart camera connections reconecta todas; resto sem mudança (aprovado pelo dono do projeto) |
| 2026-10-15 | Mac (+ Windows compilado) | etapa-12-configuracoes (2.7.0) | Canon SL3 + Canon T7 | sim | Camera settings, All cameras, Test shot, Match automatically com calibração e Cancel aprovados pelo dono do projeto no Mac; G/M conferido na SL3 e na T7 |
| 2026-10-21 | Mac (M5, macOS 26) | etapa-16-processo-por-camera (SdkMultiprocTest) | Canon SL3 + T7 + T5 | sim | Seção 20, A–F: 3 processos abriram a sua câmera (0,4–0,6 s); cada um vê as 3; abrir a câmera do outro dá 0xC0 (COMM_PORT_IS_IN_USE); disparo simultâneo por relógio com 26 ms de diferença entre a 1ª e a 3ª chamada, 3 fotos em ~2,5 s. Numa rodada a T7 travou dentro do comando de disparo (processo dela parado, os outros 2 normais); na repetição não travou. G (queda) não feito |
| 2026-10-21 | Mac (M5, macOS 26) | etapa-16-processo-por-camera | Canon SL3 + T7 + T5 | parcial | Seção 21: conexão em paralelo (0,5 s cada), At once ×5, planos de 9 fotos, T5 desligada volta sozinha com o mesmo nome, Restart ok. Sweep 0,3 s com 3 câmeras: a mesma câmera de novo a 0,9 s é recusada ("busy") — limite da câmera, decisão pendente. Camera settings, Test shot, Match, fechar o app e processo encerrado à força: ok. Falta: Windows |
