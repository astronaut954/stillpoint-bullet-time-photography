# Roadmap — Stillpoint (antes Canon Bullet Time)

Plano de desenvolvimento para levar o app de "Windows + terminal" para
"Windows + Mac", e depois para interface gráfica.

## Decisões fixas

| Tema | Decisão |
| --- | --- |
| Sistemas | Windows **x64** e macOS **arm64** (Apple Silicon). Sem Windows 32-bit, sem Mac Intel. |
| SDK Canon | **EDSDK 13.20.10** nos dois sistemas (a de Mac é universal, com `arm64` nativo). |
| Receita de build | **CMake**. O `.sln`/`.vcxproj` são apagados quando o CMake estiver validado. |
| Branches | `main` sempre funcionando. Um branch curto por etapa (`etapa-N-nome`). Nada de branch fixo por sistema. |
| Interface gráfica | Só depois do Mac funcionando (etapa 5). |
| Outras marcas (Sony, Nikon) | Depois. O código é organizado para aceitar outras marcas, mas nada é implementado sem câmera para testar. |

## O que falta fazer (lista completa; pedida pelo dono em 2026-11-11)

Tudo o que ainda não existe no Stillpoint, num lugar só. O detalhe de cada item está mais abaixo, no lugar indicado.
Manter esta lista em dia sempre que algo entrar, sair ou for publicado.

**Features novas, na ordem (seção "Próximas etapas")**

| Etapa | Feature | Situação |
| --- | --- | --- |
| 21 | Alinhamento automático das fotos | em andamento desde 2026-11-13: haste com duas marcas + marcação na tela agora; pela cena depois |
| 22 | Outras marcas de câmera (Sony, Nikon; pesquisar a libgphoto2) | não começada; precisa de câmera para testar |
| 23 | Histórico de edição permanente, por projeto | não começada; decisões do dono pendentes |
| 24 | Bullet time com celulares (Android e iPhone) | estudada em 2026-11-13 e adiada pelo dono (muito custosa); decisões pendentes |
| 25 | Modo caixa de disparo (sempre a última) | não começada; depende do protótipo de hardware |
| depois | Rig distribuído por rede | só com o projeto maduro |

**Pedidos novos, ainda sem lugar na ordem (o dono decide onde entram)**

- **Cena 3D entre as câmeras (Gaussian splat), como complemento** (pedido do dono, 2026-11-13; "bem importante"): além
  dos quadros de cada câmera, uma cena 3D de verdade, que pode ser vista de ângulos entre as câmeras. Não substitui
  o bullet time por quadros. Referência: a aba Splat do Xangle Camera Server (painéis Presets, Playback, Global
  offsets, Keyframes, Anchors, Crop, Layers, Constellation, Effects, Render e o botão Train splat). O dono quer
  explorar esses controles para separar o que é interessante, o que é viável e o que é descartável. Depende do mesmo
  cálculo da etapa 21 (a posição de cada câmera no espaço).
- **Interpolação entre câmeras (quadros intermediários entre uma câmera e a seguinte)** (registrado a pedido do
  dono, 2026-11-13): o Xangle usa o Topaz Video AI, pago à parte. Explorar, no lugar dele: (1) um modelo aberto
  rodando no computador (por exemplo os de interpolação de quadros publicados no Hugging Face); (2) uma integração
  por API em que o custo fica inteiro com o usuário (ele põe a própria chave). A estudar: qualidade com câmeras
  afastadas, licença de cada modelo, tamanho, necessidade de placa de vídeo e tempo por sessão.
- **Agrupar câmeras por modelo e/ou marca na janela Camera settings** (pedido do dono, 2026-11-14): explorar junto com
  o dono quais são os ganhos (por exemplo, mudar uma configuração para todas do mesmo modelo de uma vez, ver as
  diferenças entre modelos, a calibração por modelo da cartela). Ainda sem desenho.
- **Ease in e ease out na sequência, com grupos como keyframes** (pedido do dono, 2026-11-14): efeitos de aceleração e
  desaceleração no vídeo, editados por uma curva (gráfico) ou por linhas simples. Como as fotos podem ser tiradas em
  grupos, os grupos serviriam de keyframes. Ainda sem desenho.
- **Análise dos vídeos do Xangle** (pedido do dono, 2026-11-14): o dono baixou vídeos que mostram as features do Xangle
  em `/Users/ramoses/Downloads/Xangle` (no Mac dele). Depois: identificar as features do programa, quais o Stillpoint
  já tem, quais não tem, e decidir o que faz sentido trazer. Para o assistente ver, os vídeos precisam ser anexados
  à conversa ou a pasta liberada pelo computador ligado.
- **Calibração de cor: neutralidade e uma versão mais moderna** (anotado a pedido do dono, 2026-11-14): (1) dúvida
  dele: o Match automatically deixa as cores neutras (por exemplo, para a foto não ficar verde)? Resposta registrada:
  só com o cartão cinza (Use gray card), em que o alvo é o cinza neutro; sem cartão, o alvo é a média das câmeras,
  então se todas puxarem para o verde, o resultado continua verde (iguais entre si, não neutras). A cartela (Calibrate
  with chart) mede a diferença entre modelos, não a neutralidade. (2) Pedido de estudo: deixar a calibração mais
  inteligente, moderna e sensível. A definir com o dono o que isso significa (neutro sem cartão, pele, cenas mistas,
  luz desigual, menos fotos de teste).
- **Vista 3D simples do rig (em linhas)** (pedido do dono, 2026-11-13, a investigar): como no Xangle, um desenho 3D
  em linhas, sem renderização completa, com a posição das câmeras, dos objetos e do cenário. Depende do cálculo da
  etapa 21, que já devolve a posição de cada câmera e uma nuvem de pontos da cena.
- **A investigar no Xangle (pergunta do dono, 2026-11-13):** por que a atualização de 8 de novembro de 2026 precisou
  acrescentar suporte à Canon EOS R8 Mark II e à Sony Alpha 7R VI (ILCE-7RM6): se o SDK dessas câmeras é tão
  diferente, ou se toda câmera nova pede atualização. Importa para a etapa 22 (outras marcas) e para a lista de
  modelos compatíveis do Stillpoint.
- **Estudo do Xangle Camera Server como referência (benchmark)** (pedido do dono, 2026-11-13):
  https://xangleapps.com/cameraserver e https://www.youtube.com/watch?v=HzYZqFZ5kDk (vídeo não assistido pelo
  assistente: sem acesso). Conferido nas páginas deles em 2026-11-13: o alinhamento deles produz deslocar X/Y, girar
  e zoom (os mesmos quatro valores do Align photos); calibração por uma foto com uma haste no centro, que vira uma
  "receita" reutilizável; interpolação entre câmeras no bullet time pelo Topaz Video AI (programa pago à parte);
  splats numa produção de 48 câmeras num arco de ~120°, treinados com RealityScan + Postshot e, desde novembro de
  2026, com o Spirula (aberto); limites que eles relatam: fundo escuro gera sujeira, superfície reflexiva fica
  translúcida, ângulos fora do arco se desfazem, e uma fileira só limita os pontos de vista. Outras features deles
  para avaliar: marca d'água e vinheta automáticas, LUT, chromakey, estação de compartilhamento, zonas de câmeras.

**Features menores, sem número (seção "Futuro")**

- Filtro na janela Project.
- Photoshop (etapa 20): feito e publicado na 2.21.0. Falta só o teste no Windows e a janela do RAW com câmera de verdade.
- Ajustar as fotos em vez da câmera (corrigir cor e brilho nas fotos salvas; aviso do RAW sem correção).

**Decidido, sem implementar**

- Licença dupla no lugar da MIT (seção "Futuro"); falta o dono definir o corte de "empresa grande" e as versões já publicadas.

**Testes que faltam (seção "Pendências conhecidas" e `docs/teste-manual.md`)**

- Windows: nenhum teste de uso desde a 2.18.0.
- Câmeras reais: tudo desde a 2.18.0; cartão cinza e Calibrate with chart, nunca testados com câmeras de verdade.

## Etapas

Status: `feito` · `em andamento` · `próximo` · `depois`

| # | Etapa | Resultado esperado | Status |
| --- | --- | --- | --- |
| 0 | Arrumação | Este roadmap, `AGENTS.md`, checklist de teste, README corrigido | feito |
| 1 | CMake + SDK 13.20.10 no Windows | Mesmo `.exe` de hoje, compilado pelo CMake, usando o SDK novo. Checklist passa com câmeras. | feito |
| 2 | Isolar código de Windows | Áudio, caminhos, console e funções da Microsoft atrás de interfaces de plataforma. Windows funciona igual. | feito |
| 3 | Versão Mac | SDK de Mac integrado, áudio e caminhos de Mac, checklist passa no Mac. Primeiro `.zip` para Mac (sem assinatura Apple por enquanto). | feito |
| 4 | Separar terminal da lógica | `main.cpp` vira só o menu; a lógica de câmera fica chamável por outra interface, com espaço para outras marcas. | feito |
| 4.1 | Diagnóstico para o usuário | Aviso de modelo fora da lista de compatibilidade (com nomes regionais), guia quando nenhuma câmera é encontrada, explicação dos erros mais comuns de conexão e disparo. | feito |
| 5 | Interface gráfica | Janela nativa com a interface em HTML/CSS (WebView2 no Windows, WebKit no Mac), usando o mesmo núcleo do terminal. Visual em `assets/ui/themes/nocturne-neo.css`. App de Mac (`.app`) e versão de janela nos pacotes. Checklist passou no Mac e no Windows (2026-10-14). | feito |
| 6 | Ícone e nome | Ícone do app no Windows e no Mac (câmera com o projétil no vidro da lente, cores da interface). Nome novo: Stillpoint — Bullet Time Photography (o app não ficará restrito à Canon). Funcionando no Mac e no Windows (2026-10-14). | feito |
| 7 | Instaladores | `.dmg` no Mac (arrastar para Aplicativos, fundo com chuva de código, Read Me em inglês sem Terminal) e instalador de Windows (Inno Setup, mesmo visual, versão de terminal opcional e desmarcada). Os zips continuam na versão. Testado no Mac e no Windows (2026-10-14). | feito |
| 8 | Atualização pelo app | Ao abrir, o app consulta a última versão no GitHub; botão "Update" no topo, janela com as novidades, download com andamento, conferência (tamanho e SHA-256) e instalação com reabertura. Não atualiza durante disparo ou conexão. Testado no Mac e no Windows (2026-10-14). | feito |
| 9 | Abertura | Tela de entrada com chuva de código verde aparecendo aos poucos e o logo com fade in; toda vez que o app abre; clique ou tecla pula. Testado no Mac e no Windows (2026-10-14). | feito |
| 10 | Exportação e tela cheia | "Save sessions" como **Photos** (original, ou convertidas para JPG, PNG, WEBP, TIFF, HEIC) ou **Sequence** (MP4, MOV, GIF, WEBP, AVIF; velocidade, loops, reverse loop, tamanho), configuração por sessão e "Apply to all"; abre a pasta no fim. Na tela cheia: Reverse loop e velocidade. Qualidade Standard / High / Maximum. Testado no Mac e no Windows (2026-10-15). Versão 2.5.0. | feito |
| 11 | Menu do app e Settings | Mac: menu na barra de cima (Stillpoint, Edit, View, Window, Help), com ⌘C/⌘V/⌘A nos campos de texto e ⌘Q. Windows: botão de menu no canto do app. About, Check for updates, Settings (tema e idioma), links de ajuda. Também: cancelar o bullet time e campos só com números inteiros. Testado no Mac e no Windows (2026-10-15). Versão 2.6.0. | feito |
| 12 | Configurações das câmeras pelo app | Canon: ver e igualar ISO, velocidade, abertura, compensação, balanço de branco (K), Picture Style e qualidade de todas as câmeras pelo app; o app pergunta a cada câmera o que ela aceita e mostra quais não dá para ajustar (e por quê). Preparado para outras marcas. Também: Test shot, Match automatically (com calibração por modelo e Cancel), arrastar para reordenar. Testado no Mac com SL3 + T7 (2026-10-15); no Windows, compilado. Versão 2.7.0. | feito |
| 13 | Match colors | Picture Style pelo app (botão "±": contraste, saturação, tom de cor) e igualado pelo Match; brilho medido como o olho vê; "Use gray card" (acha o cartão, a pessoa confere, cinza neutro); "Calibrate with chart" (cartela impressa, diferença por modelo); modo debug; perguntar se descarta as sessões depois de salvar. Testado no Mac com SL3 + T7 até o cartão cinza (2026-10-16); a cartela ainda não foi testada com câmeras. Versão 2.8.0. | feito |
| 14 | Disparo com intervalos (Timing) | Campo Timing no painel Bullet time (botão Advanced): todas juntas, uma depois da outra (intervalo, direção 1→N / N→1 / ida e volta, loops), grupos, ímpar/par e custom (passos: câmeras + tempo). Linha do tempo. Disparo com plano no núcleo (uma foto por item; o número da foto é a posição no plano). Câmeras simuladas para testar sem câmeras (STILLPOINT_FAKE_CAMERAS). Testado no Mac com câmeras simuladas (2026-10-16); com câmeras de verdade, ainda não. Versão 2.9.0. | feito |
| 15 | Janela Live | Palco em tela cheia para um segundo monitor (ou janela flutuante): contagem inicial (a da janela principal continua), câmeras na ordem do rig disparando (branca → verde, próxima tracejada), contagem entre grupos, fotos chegando e a sequência em loop no fim. Modos Operator e Audience; layout arco (padrão), círculo ou linha; bip por grupo (opcional, ligado). Janela separada (até duas), tela cheia por monitor, sons sobrepostos com ducking, modo Sweep no Timing. Testado no Mac com câmeras simuladas (2026-10-17); Windows e câmeras de verdade ainda não. Versão 2.10.0. | feito |
| 16 | Um processo por câmera + Sweep | Cada câmera num processo próprio (`StillpointWorker`), coordenados pelo `CameraFleet`: conexão em paralelo, disparo por relógio, vigia e religação, log por câmera. Junto: Sweep único com Direction em todos os modos, aviso e tratamento de foto recusada (câmera precisa de ~1,2 s entre fotos suas), download adiado até o fim do plano. Testado no Mac com SL3 + T7 + T5 (2026-10-21/22); Windows compilado e testado com simuladas. Versão 2.11.0. | feito |

### Etapa 5: mudanças pedidas para a interface (registradas em 2026-10-10)

Feitas em 2026-10-11 (aguardando teste no Mac), junto com a limpeza dos textos
(sem emojis e sem cara de terminal; o terminal continua igual):

1. **Nome da câmera:** o modelo (ex.: "Canon EOS Rebel T7") em destaque e o
   apelido (`T7_1`) em segundo plano — o inverso de hoje.
2. **Reordenar por foto:** botão junto aos controles de ordem. Tira uma foto de
   cada câmera e mostra um carrossel de miniaturas no alto, cada uma com o nome
   da câmera e o número na ordem; arrastar as miniaturas muda a ordem. A foto
   selecionada fica destacada e aparece maior logo abaixo do carrossel.
3. **Sessões na tela principal:** sem aba separada. Acima de "Cameras" e
   "Bullet time", a navegação por pastas fica à esquerda (cada pasta
   identificada pela sessão) e as fotos aparecem no mesmo modelo do "Reordenar
   por foto" (carrossel no alto, foto selecionada maior abaixo).

Design system [Neo Terminal UI](https://github.com/Dyltom/neo-terminal-ui) aplicado em
2026-10-11 (aguardando teste no Mac): a biblioteca é React + Tailwind, então os tokens
(cores, fonte Share Tech Mono, brilho, cantos retos) e os estilos dos componentes foram
passados para CSS simples (em `assets/ui/themes/neo-terminal.css`, que saiu em 2026-10-13), sem mudar o funcionamento da página.
O "flicker" e a vinheta do efeito CRT ficaram de fora para não atrapalhar a conferência
das fotos.

Em 2026-10-12 entraram, para comparação, [Nocturne](https://github.com/starside-io/nocturne)
e [CYBERCORE CSS](https://github.com/sebyx07/cybercore-css). Em 2026-10-13 o dono do
projeto escolheu a estrutura do Nocturne com as cores do Neo Terminal. Os três temas
originais saíram do app e ficaram duas variações dessa mistura em `assets/ui/themes/`:
"Mix 1" (fontes do Nocturne) e "Mix 2" (fonte e efeitos do Neo Terminal). No mesmo
dia ele escolheu o Mix 1, sem os cantos cortados do Nocturne (cantos retos). Ficou um
único visual, `assets/ui/themes/nocturne-neo.css`, e o seletor de temas saiu do app.

Aplicativo de Mac (2026-10-14): `scripts/build_release.py` monta o `.app` (na época `Canon Bullet Time.app`, hoje `Stillpoint.app`)
(programa de janela em Contents/MacOS, SDK em Contents/Frameworks, assets em
Contents/Resources, Info.plist, assinatura local). O programa acha os assets por
Platform::ResourcesDirectory e o SDK por @executable_path/../Frameworks. Testado no
Mac em 2026-10-14 (abre com dois cliques; a versão de terminal fica em "Terminal
version/"). Próxima versão: v2.0.0.

### Etapa 6: ícone e nome (iniciada em 2026-10-14)

- **Ícone:** escolhido o conceito "E" (câmera vista de perto, lente ocupando o ícone,
  projétil reto dentro do vidro com as ondas de ar e a chuva de código). Gerado por
  `scripts/make_icon.py` em `resources/icon/`; tamanhos pequenos (até 48 px no Windows,
  32 px no Mac) usam uma versão simplificada. Windows: embutido nos dois `.exe`
  (`resources/windows/app.rc.in`, ID 32512, que a janela também usa). Mac: `AppIcon.icns`
  no `.app` (`scripts/build_release.py`). Funcionando nos dois sistemas (2026-10-14).
- **Nome:** **Stillpoint**, com o complemento "Bullet Time Photography" em lugares
  estratégicos (repositório `stillpoint-bullet-time-photography`, descrição do GitHub,
  título do README) para facilitar a busca. Decidido em 2026-10-14.
  Programas: `Stillpoint` (janela) e `Stillpoint Terminal App` (terminal); no Mac,
  `Stillpoint.app` (identificador `io.github.astronaut954.stillpoint`); pacotes
  `stillpoint-vX.Y.Z-<sistema>.zip`. A pasta de dados passa a ser `Stillpoint`; a antiga
  (`Canon Bullet Time`) é renomeada na primeira abertura. Nomes internos do código
  também mudaram (`cbt_core` → `stillpoint_core`, variáveis `CBT_*` → `STILLPOINT_*`,
  ex.: `STILLPOINT_TEST_RESTART`). Funcionando nos dois sistemas (2026-10-14).

### Etapa 7: instaladores (iniciada em 2026-10-14)

Visual aprovado em 2026-10-14 (fundo do `.dmg`, imagens do instalador de Windows e Read Me).
- **Mac:** `scripts/build_release.py` cria `stillpoint-vX.Y.Z-macos-arm64.dmg` com o
  dmgbuild (instalado sozinho em `build/release-tools` na primeira vez): Stillpoint.app,
  atalho para Aplicativos e `Read Me.pdf`, fundo em `resources/installer/`. Primeira
  abertura sem Terminal: Ajustes do Sistema → Privacidade e Segurança → "Abrir Mesmo Assim".
- **Windows:** `resources/installer/stillpoint.iss` (Inno Setup 6.5.2 ou mais novo) gera
  `stillpoint-vX.Y.Z-windows-x64-setup.exe`: instala em Arquivos de Programas, atalho no menu
  Iniciar, atalho na área de trabalho e versão de terminal opcionais (desmarcados), desinstala
  por Configurações → Aplicativos sem apagar as fotos guardadas.
- `scripts/publish_release.py` envia o zip e o instalador de cada sistema.
- 1º teste no Mac (macOS 26): o `.dmg` abriu com os ícones nas posições certas, mas sem o
  fundo. Causa conhecida: o Finder do macOS 26.2+ ignora o fundo quando o `.DS_Store` tem o
  registro "pBBk", que o dmgbuild grava até a 1.6.6 (a 1.6.7 corrige, mas exige Python 3.10+;
  o do Mac é 3.9). Corrigido no script: o registro é desligado e o `.dmg` pronto é conferido
  (falha se o fundo não estiver certo). Nomes sem extensão (".app", ".pdf") na janela.
- 2º teste no Mac: fundo aparecendo. A janela ficou baixa: a altura do `.dmg` inclui a
  barra de título (~32 pt) e a barra de caminho do Finder (~28 pt), que cortavam o nome do
  Read Me. Janela e fundo passaram de 500 para 560 pt de altura.
- 3º teste no Mac (placas centralizadas) e teste no Windows (instalador): aprovados em 2026-10-14.

### Etapa 8: atualização pelo app (iniciada em 2026-10-14)

Telas aprovadas em 2026-10-14 (aviso no topo, janela com novidades, andamento, espera
durante disparo/conexão, aviso "Updated to ..." ao reabrir).
- **Versão:** arquivo `VERSION` (lido pelo CMake e gravado no app). `build_release.py`
  confere que a tag é igual a ele e que o app em `build/` foi compilado com ele.
- **Consulta:** curl do próprio sistema (`api.github.com/.../releases/latest`); a página
  compara as versões e escolhe o arquivo (`-setup.exe` ou `.dmg`).
- **Download:** só de `github.com/astronaut954/stillpoint-bullet-time-photography/releases/download/`,
  para a pasta temporária; confere tamanho e SHA-256 (o GitHub informa o "digest" de cada arquivo).
- **Instalação:** Windows: instalador em modo silencioso (pede permissão de administrador);
  um PowerShell escondido espera o instalador terminar e abre o app de novo (não depende
  do instalador baixado). Mac: script espera o app fechar, troca o `.app`
  pelo do `.dmg` (com volta atrás se falhar) e abre de novo. Só quando dá: Windows instalado
  pelo instalador; Mac em `.app` numa pasta com escrita. Senão, abre a página de download.
- **Novidades:** `docs/release-notes/vX.Y.Z.md` (obrigatório para publicar), mostradas na janela.
- **Teste sem versão nova:** `STILLPOINT_TEST_VERSION=2.1.0` faz o app se apresentar como
  antigo e oferecer a versão publicada. `STILLPOINT_NO_UPDATE_CHECK=1` desliga a consulta.
- 1º teste no Windows (2026-10-14): instalou, mas não reabriu. Causa: a reabertura estava
  no instalador novo, e o teste instala a v2.2.0 (instalador antigo). Corrigido como acima.
- Verificado aqui: fluxo da página (aviso, janela, andamento, cancelar, falha, instalar,
  modo sem atualização automática, espera com câmera conectando) num navegador; código de
  Windows compila (MinGW); script do Mac testado com ferramentas simuladas.
- Atualização simulada (STILLPOINT_TEST_VERSION) aprovada no Windows e no Mac pelo dono do
  projeto em 2026-10-14. Junto: sombra da contagem em verde escuro e correção da linha de
  status abaixo de "It's bullet time".
- Primeira atualização real (2.3.0 → 2.4.0, publicada em 2026-10-14) funcionou no Mac e no
  Windows, segundo o dono do projeto.

### Etapa 9: abertura (iniciada em 2026-10-14)

Prévia aprovada em 2026-10-14; aparece toda vez que o app abre. Chuva desenhada num canvas
(`app.js`, início), logo e título por cima (`index.html` e `nocturne-neo.css`). O ícone da
página fica em `assets/ui/images/` e é embutido ao abrir (`__IMAGE:arquivo__`, como as fontes).
As câmeras começam a conectar enquanto a abertura roda. Versão 2.4.0.
Testada e aprovada no Mac e no Windows em 2026-10-14.

### Critério para fechar uma etapa

1. Compila nos sistemas que a etapa toca.
2. `docs/teste-manual.md` passa com câmeras reais no(s) sistema(s) afetado(s).
3. Branch volta para `main`; se fizer sentido, sai uma versão (`vX.Y.Z`).

### Etapa 10: exportação (iniciada em 2026-10-14, fechada em 2026-10-15)

Telas aprovadas em 2026-10-14. Decisões do dono do projeto: na sequência, as fotos originais
vão junto por padrão; GIF, WEBP e AVIF repetem sem parar (os loops ficam dentro do MP4/MOV);
sai junto com o Reverse loop, a velocidade e o "abrir a pasta" (v2.5.0).
- Código comum em `src/gui/exporter.cpp` (GIF próprio com paleta única e pontilhado; WEBP com
  libwebp; AVIF com libavif + libaom; MP4/MOV com minimp4). Bibliotecas em `cmake/export.cmake`.
- Por sistema (`include/platform/media.h`): H.264 pelo VideoToolbox (Mac) e Media Foundation
  (Windows); HEIC pelo ImageIO (Mac) e WIC (Windows, só com as extensões HEIF e HEVC).
- Tamanhos: 720p, 1080p, 4K (cabem em 1280×720, 1920×1080, 3840×2160); GIF/WEBP/AVIF até 1080p.
- Nomes (decididos em 2026-10-14): pasta e arquivos com Date + time ("2026-10-14 16.31.00",
  padrão), Number (01, 02... continuando os da pasta) ou Custom (data opcional, depois do nome por
  padrão; nome repetido sem data ganha numeração). Fotos salvas sem o número do cartão
  ("01_SL3_1.JPG"). Subpastas Photos/ e Sequence/ só com fotos e sequência juntas. A janela de salvar só fecha
  depois de salvar. "Same settings for all sessions" ligado por padrão;
  desligado, as sessões diferentes da aberta ganham "Different". Aviso de pasta já existente e
  ao fechar o app com a janela de salvar aberta ou durante o salvamento. Replace apaga o que
  havia na pasta antiga e deixa só o novo salvamento.
- Qualidade (decidida em 2026-10-14): Standard / High (padrão) / Maximum, por sessão, nas fotos
  convertidas com perda (JPG 85/95/100, WEBP 80/92/sem perda, HEIC 0.75/0.9/1.0) e na sequência
  (MP4/MOV por taxa de bits, `Export::VideoBitrate`; WEBP 75/90/sem perda; AVIF 60/75/90, este
  com cor 4:4:4). PNG e TIFF são sempre sem perda; GIF sempre 256 cores (sem mudança, decisão do
  dono). RAW convertido continua usando a imagem grande guardada dentro do RAW (sem revelação, para
  não pesar); a qualidade total do RAW fica no "Original".
- Teste no Linux sem câmeras: `tests/export` (gera todos os formatos da sessão de teste).
- Verificado aqui: todos os formatos comuns gerados e conferidos (ffprobe/Pillow); telas testadas
  num navegador; código de Windows compila (MinGW). Testado pelo dono do projeto no Mac e no
  Windows (2026-10-15), com a sessão de teste.
- Pendente (decidido em 2026-10-14): conferir a qualidade com uma sequência real em RAW de várias
  câmeras (Standard / High / Maximum), quando houver uma sessão assim. Não bloqueia a v2.5.0.

### Etapa 11: menu do app e Settings (iniciada e fechada em 2026-10-15)

Decisões do dono do projeto (2026-10-15): itens do menu do Mac aprovados, com Settings; no
Windows, botão de menu só no Windows (no Mac fica a barra de cima); a versão no título saiu antes,
sozinha, na v2.5.1. Motivo extra: sem menu, o Mac não aceitava ⌘C, ⌘V e ⌘Q (confirmado pelo dono).
- Mac: `NativeWindow::InstallAppMenu` (`src/gui/native_window_mac.cpp`). Quit passa pela mesma
  pergunta do botão de fechar. Itens do app viram o evento "menu" para a página.
- Windows: botão no canto da barra (`#menuBtn` em `assets/ui/index.html`), mesmos itens; Ctrl+,
  abre o Settings.
- Settings: tema (cada arquivo de `assets/ui/themes/`; hoje só o Nocturne Neo) e idioma (hoje só
  English). Gravados em `<dados do app>/settings.txt`; valem ao abrir o app de novo ("Restart
  now"). A tradução para português é uma etapa à parte.
- Corrigido (2026-10-15): a lista de temas mostrava temas de teste antigos que ficaram na pasta
  de build do Mac (Mix, Nocturne original...); escolher um deles deixava a tela toda errada. Agora
  só aparece o arquivo que começa com `/* stillpoint-theme: ... */`, um tema inválido volta ao
  padrão sozinho, e cada compilação recopia `assets/ui` do zero. Os pacotes publicados não tinham
  esses arquivos (o `build_release.py` copia do projeto).
- Junto (pedido em 2026-10-15): Countdown, Sessions e Download wait só aceitam números inteiros
  (o Mac deixava digitar letras), até 999.
- Junto (aprovado em 2026-10-15): cancelar o bullet time. Na contagem (botão Cancel e Esc; nada
  dispara e a pasta vazia sai), entre sessões e esperando as fotos (o botão de disparo vira
  "Cancel bullet time"; as fotos que chegaram ficam). Núcleo: `BulletTime::RequestCancel()` e o
  aviso `OnSequenceCancelled`; a contagem passou a esperar em passos de 0,1 s. O terminal não
  chama o cancelamento, então a saída dele não muda.
- Verificado aqui: código de Mac e de Windows compila (Mac com cabeçalhos simulados, Windows com
  MinGW); telas testadas num navegador. Testado pelo dono do projeto no Mac e no Windows
  (2026-10-15), com câmeras, incluindo o cancelamento.

### Correção 2.6.1: câmeras que não reconectavam (2026-10-15)

Dado do dono do projeto (Mac): câmeras desligadas e religadas não voltavam, nem com "Restart
camera connections"; só reiniciando o app. No código: uma câmera que cai (ou falha 3 vezes) fica
"posta de lado" até o SDK avisar que uma câmera foi conectada; se o aviso não chega, ela fica de
lado para sempre, e o botão não limpava essa lista. Correção: o botão limpa a lista, e uma câmera
Canon que aparece de novo no USB conta como esse aviso. Só o app de janela usa essa parte. Testado no Mac e no
Windows pelo dono do projeto (2026-10-15).

### Etapa 12: configurações das câmeras pelo app (2026-10-15, versão 2.7.0)

Decisões do dono do projeto (2026-10-15): começar pela Canon, preparado para outras marcas;
o app precisa indicar quais câmeras não dá para ajustar. Dado verificado na documentação do
EDSDK 13.20.10: ISO, Av, Tv, compensação de exposição, balanço de branco, temperatura de cor
(2800–10000 K), ajuste fino do balanço, Picture Style e qualidade são de leitura e escrita, sem
restrição por modelo; cada câmera informa os valores aceitos (EdsGetPropertyDesc). O modo (M,
Av...) não muda pelo SDK em câmeras com disco de modos; nos modos automáticos as configurações
de disparo não podem ser mudadas. EOS M, M2, M3, M5, M6, M10 e M100 não aceitam disparo remoto.
Modo de foco: só leitura (MF vem da chave da lente; mudar o modo AF só foi testado pela Canon na
EOS R5). Compensação de exposição não vale no modo M (fica sem opções).

Tela aprovada em 2026-10-15: botão "Camera settings" no painel Cameras; tabela com uma linha por
câmera e a linha "All cameras" (balanço de branco nela: os predefinidos que todas aceitam e, se
todas aceitarem, os valores em Kelvin; a SL3 e a T7 não oferecem Kelvin); colunas ISO, Shutter, Aperture,
Exp. comp., White balance, WB fine-tune, Picture Style, Quality e Focus (só leitura, âmbar
com AF ligado); Drive saiu da tabela (decisão de 2026-10-15): o app põe toda câmera em disparo único
sozinho (único silencioso também vale) e, se a câmera não aceitar, avisa ("Not on single shot"); mudanças vão para a câmera na hora; legenda num ícone (?); "Copy from camera";
avisos no painel ("Settings differ", "Settings on the camera only"). No painel Cameras: cabeçalho
fixo, só a lista rola, e arrastar para reordenar.
- Teste rápido (pedido em 2026-10-15): botão "Test shot" no Camera settings dispara todas as
  câmeras uma vez e mostra as fotos lado a lado (← → para comparar). São fotos temporárias, as
  mesmas do "Reorder by photo": apagadas ao fechar a janela ou no próximo teste.
- Ajuste automático (decidido em 2026-10-15: igualar à média de todas, cor e brilho; refeito no
  mesmo dia: é o próprio Test shot que ajusta, e mexe em tudo que faz as câmeras ficarem
  parecidas). Caixa "Match automatically" ao lado do Test shot (ligada por padrão; não há mais
  botão "Auto match"). Com ela, o Test shot (`src/gui/auto_match.cpp`):
  1. sem foto, põe a mesma velocidade, abertura, ISO e compensação em todas (o valor mais perto
     da média que todas aceitam) e o mesmo Picture Style (o mais comum; nunca Auto, que muda a
     cada cena; só Auto vira Standard);
  2. foto 1, como estão: a média da cor e do brilho de todas é o alvo;
  3. se o balanço de branco está em Auto ou diferente entre elas: todas em Daylight sem ajuste
     fino, foto 2, e daí um balanço comum que deixa a cor perto do alvo (Kelvin se todas
     aceitarem; senão o predefinido mais perto: Daylight 5200 K, Shade 7000, Cloudy 6000,
     Tungsten 3200, Fluorescent 4000; troca de predefinido uma vez, se a foto seguinte mostrar
     que outro fica mais perto);
  4. cor pelo ajuste fino do balanço (Canon: 1 passo azul/âmbar ≈ 5 mireds; no SDK, AB −
     azul/+ âmbar; GM: a documentação diz − verde/+ magenta, mas na T7 +5 aparece como G5 no
     menu da câmera — conferido em 2026-10-15 na T7 e na SL3, então o app usa − magenta/+ verde). O ajuste
     automático não depende disso: confere pela foto o sentido de cada câmera e, se a cor andou
     para o lado contrário, inverte (enquanto não confere, anda no máximo 3 passos; uma foto a
     mais quando inverte). Simulação com 30% das câmeras invertidas: resultado igual ao normal.
  - Calibração por modelo (ideia do dono do projeto, 2026-10-15): na primeira vez de um modelo,
    com o balanço de branco fixo, o app tira 2 fotos a mais com o ajuste fino no extremo de
    cada eixo (A9, depois G9) e mede o sentido e a força dele naquela câmera. Fica guardado em
    `camera-calibration.txt` na pasta de dados do app; nas próximas vezes pula essas fotos. Se
    uma foto contradisser o guardado, o app apaga e calibra de novo. Modelo medido invertido:
    a tabela troca os rótulos (A/B, G/M) só para ele. No máximo 6 fotos (7 se inverter).
  - Decidido em 2026-10-15: não calibrar ISO, abertura nem balanço de branco (efeito já
    conhecido ou que muda com a lente e a luz). Com ISO em Auto, o app avisa antes de começar
    (Cancel / Continue anyway). Durante o Test shot o botão vira "Cancel": para entre as fotos
    ou esperando as fotos e, com ajuste, volta as câmeras como estavam. e brilho pelo ISO (em M) ou pela compensação (outros
     modos); foto de novo e corrige pelo quanto a câmera respondeu. No máximo 5 fotos.
  Mostra as últimas fotos e um resumo do que mudou em cada câmera. Medida conferida aqui com
  cópias tingidas de uma foto (âmbar +0,100 esperado, +0,107 medido; +1/3 de stop esperado, +0,35
  medido). Simulação aqui com câmeras falsas (300 cenários sorteados: sensores, luz de 2900 a
  7000 K, balanço em Auto ou Daylight): diferença típica entre câmeras caiu de ~6 para ~0,8
  passo em azul/âmbar e de ~1 para ~0,2 stop no brilho. Isso é a conta, não câmera de verdade.
  Limite: ISO anda de 1/3 de stop, então sobra até ~1/6 de stop de diferença.
  No primeiro teste com câmeras de verdade (Mac, SL3 + T7) o resultado piorou: o sentido
  verde/magenta estava invertido (corrigido) e as câmeras viam cenas diferentes. Depois da
  calibração por modelo, o dono do projeto achou que funciona (2026-10-15).
- Layout do Test shot (decidido em 2026-10-15, opção A entre três comparadas): sem a prévia
  grande; só a fileira de miniaturas, maiores e com a foto inteira. Clicar numa miniatura abre a
  foto grande por cima da janela (← → passam de câmera, Esc ou Close fecham). "Hide photos"
  recolhe a fileira; um novo Test shot abre de novo.
- Núcleo: `include/camera_settings.h` (dados iguais para qualquer marca) e
  `src/core/camera_settings_canon.cpp` (Canon). Com a janela aberta, a página lê as câmeras de
  novo a cada 3 s (mudanças feitas na própria câmera aparecem sozinhas). O aviso do SDK de
  "configuração mudada" foi tirado: no Mac, o app fechou ao desligar as câmeras com ele ligado
  (falha dentro do EdsGetEvent; a causa é suspeita, não confirmada). O app confere o disparo
  único antes de cada bullet time e de cada Test shot.
- Verificado aqui: código compila (cabeçalhos simulados do SDK); telas testadas num navegador com
  dados simulados (5 e 16 câmeras). Testado com câmeras de verdade no Mac (SL3 + T7). Falta:
  teste com câmeras no Windows. Desligar as câmeras com o app aberto: testado pelo dono do
  projeto em 2026-10-15, o app não fecha mais.

### Etapa 13: Match colors (iniciada em 2026-10-15, concluída em 2026-10-16, versão 2.8.0)

Decisões do dono do projeto (2026-10-15): primeiro o Picture Style, depois o cartão cinza; os
ajustes do Picture Style ficam dentro da coluna Picture Style (botão "±"); o cartão cinza é
achado sozinho pelo app e a pessoa pode corrigir clicando. Ajustar as fotos (em vez da câmera)
saiu da etapa: fica como ideia futura (serviria para câmeras que não aceitam mudanças pelo
computador e para outras marcas).

- Picture Style: dado verificado na documentação do EDSDK 13.20.10 (5.2.40): os ajustes do estilo
  atual (contraste, saturação, tom de cor: −4 a +4) são de leitura e escrita, sem restrição por
  modelo. Na SL3 e na T7: falta conferir.
- Tabela: botão "±" ao lado do Picture Style abre contraste, saturação e tom de cor da câmera (ou
  de todas, na linha All cameras).
- Match automatically: deixa Contrast, Saturation e Color tone iguais em todas (o valor mais comum),
  sem medir pela foto. A primeira versão igualava contraste e saturação medidos na foto, mas no teste
  real (SL3 + T7) a medida dependia do que cada câmera via e andou ao contrário do ajuste (SL3 em +4
  mediu menos contraste; T7 em −4 mediu mais), o que também bagunçou o ISO. Decisão (2026-10-15):
  mesma curva em todas; a diferença de cada modelo fica para a medição com alvo (cartão cinza).
- "±" do Picture Style em âmbar tracejado quando só algumas opções (contraste, saturação, tom)
  diferem entre as câmeras; âmbar cheio quando as três diferem. Na caixa do "±" de uma câmera, a
  opção diferente fica âmbar. Nova linha na legenda do "?" (pedido do dono do projeto, 2026-10-16).
- O ajuste fino do balanço de branco deixou de contar como "configuração diferente" (âmbar e
  "Settings differ"): depois do ajuste automático ele é diferente de propósito em cada câmera.
- ISO errado no teste de 2026-10-15 (Mac, SL3 + T7, mesmo ISO no início): terminou em ISO 800 na
  SL3 e 100 na T7, com as fotos mais diferentes que antes. Causa não confirmada (o app não guardava
  as medidas). O dono do projeto quer o brilho igualado "de olho" mesmo com cenas diferentes, sem
  limites fixos. Feito:
  - **Modo debug** (Settings → Debug): cada Test shot guarda em `<dados do app>/Debug/<data-hora>`
    as prévias medidas, `report.csv` (configurações e medidas por foto e câmera) e `trace.txt` (o
    que o ajuste decidiu e por quê); o resumo ganha "Open debug folder". Para não ocupar disco sem a pessoa perceber: desliga
    sozinho ao fechar o app, guarda no máximo as 20 mais recentes e 300 MB no total (apaga as mais
    antigas), e Settings mostra o espaço ocupado com o botão "Delete debug data".
  - **Brilho medido como o olho vê:** claridade média (L*) da foto inteira, com o centro valendo o
    dobro, no lugar da mediana do centro (que pulava entre o tom claro e o escuro em fotos meio a
    meio). Conferido em cópias: +1/3, +1 e −1 stop medidos como +0,33, +0,99 e −1,00; numa imagem
    meio clara, meio escura, −1 stop = −1,00 e +1 stop = +0,60 (a parte clara estoura), sem pulos.
  - **Foto quase toda preta (≥ 70%) ou estourada (≥ 50%):** o app não usa para brilho
    daquela câmera e avisa.

- **Cartão cinza** ("Use gray card", ao lado de Match automatically; 2026-10-16): a pessoa põe
  um cartão cinza onde todas as câmeras veem. Depois da primeira foto o app acha o cartão em cada
  foto (maior área lisa, de tom médio e cor quase neutra, de preferência perto do centro) e mostra
  as fotos com o cartão marcado; a pessoa confere, clica no cartão (o app acha a área em volta) ou arrasta para desenhar a área, e continua
  (Continue precisa de pelo menos 2 câmeras com o cartão). Daí em diante o app mede só o cartão
  (a mesma área em todas as fotos; as câmeras não se mexem). Muda o alvo da cor: o cartão deve
  sair cinza neutro (balanço de branco certo), e não a média das câmeras; o brilho continua na
  média. O fundo de cada câmera não engana mais a cor nem o brilho. Ajusta as mesmas configurações
  do Match sem cartão (balanço de branco, ajuste fino, ISO/compensação). Conferido: em 5 fotos de
  teste com um cartão desenhado (tinta, degradê e ruído), achou o cartão nas 5; sem cartão, marca
  outra área lisa (por isso a conferência). Simulação (300 cenas): o cinza termina a ~0,6 passo do
  neutro (sem cartão: ~4,8), câmeras tão parecidas quanto antes, ~6,4 fotos em média.

- **Calibrate with chart** (2026-10-16, pedido do dono do projeto): cartela impressa
  (`assets/chart/stillpoint-chart.pdf`, gerada por `scripts/make_chart.py`, A4 deitado, vetorial):
  11 tons de cinza (contraste), cinza médio (cor), 16 cores com 2 tons de pele (saturação e tom de
  cor) e 4 marcas nos cantos com uma bolinha de orientação. Botão em Camera settings → instruções
  → "Open chart" (abre o PDF para imprimir) → Start. O app acha as 4 marcas (padrão 1:1:2:1:1 na
  horizontal e na vertical, depois a volta certa pela bolinha e pelo cinza do claro ao escuro) e
  corrige o ângulo; a pessoa confere os 4 cantos (arrasta ou clica) e continua. 4 fotos: como estão
  (mesmo Picture Style, ajustes em 0, mesmo balanço fixo, sem ajuste fino), Contrast +2,
  Saturation +2, Color tone +2; depois tudo volta como estava. Por modelo: quanto cada ajuste mexe
  em cada medida (3×3, então um ajuste que também mexe em outra medida entra na conta) e a
  diferença para o modelo mais comum, em passos; guardado em `chart-calibration.txt` (dados do
  app) por modelo e Picture Style. Um modelo já calibrado antes mantém o valor (dá para calibrar
  SL3+T7 hoje e T7+R50 depois). O Match automatically usa: o modelo mais comum fica com o valor
  comum e os outros andam a diferença arredondada; a tabela não marca essa diferença como
  "diferente" e o "±" mostra no texto de ajuda. Precisa de 2 modelos diferentes. Instruções no
  README ("Calibrate with chart"). Conferido: em 25 fotos montadas (de frente, inclinada, de
  cabeça para baixo, pequena, com luz desigual) achou a cartela em todas, com os cantos a ~0,1% do
  lugar certo; +2 de contraste/saturação/tom mediu +9,7 / +0,14 / +11° em todas as posições (luz
  desigual muda o contraste medido em ~1 passo: por isso "luz por igual" nas instruções).
  Simulação: diferença escondida de −0,7 / −1,3 / +1,0 passo medida como −0,68 / −1,34 / +0,99; o
  Match deixou a T7 com −1 / −1 / +1 em relação às SL3. Picture Style vale para JPEG e para a
  prévia do RAW (o que o Stillpoint mostra e exporta); Lightroom e afins ignoram.

- **Depois de salvar** (pedido do dono do projeto, 2026-10-16): as sessões salvas não saem mais do
  app sozinhas; o app pergunta "Discard from app" (botão em destaque) ou "Keep until I close".
  Salvando para fechar o app (ou "Close when done"), não pergunta e as salvas saem. Depois da 2.8.0:
  a sessão mantida fica marcada (arquivo `.saved` na pasta dela; etiqueta verde "✓ Saved" na lista
  de sessões e na janela Save sessions), não conta como "não salva" nos avisos de fechar e de abrir,
  e sai do app ao fechar (e ao abrir, se o app fechou de repente). "Delete and close" apaga só as
  não salvas; "Save and close" já vem só com as não salvas marcadas.

- **Versão 2.8.1** (2026-10-16): sessões salvas e mantidas no app (etiqueta "✓ Saved", saem ao
  fechar). Testado no Mac com sessões simuladas (sem câmeras).

- **Versão 2.8.2 (2026-10-16): aviso de formatos misturados.** no Save sessions como Original,
  quando umas câmeras mandaram RAW e outras só JPEG, o app avisa com as câmeras de cada lado e
  deixa salvar mesmo assim ou voltar. É a parte da "opção B" que já faz sentido sem a correção pelo
  programa: nunca misturar formatos sem a pessoa saber.
### Etapa 14: Disparo com intervalos / Timing (iniciada e concluída em 2026-10-16, versão 2.9.0)

Decisões do dono do projeto (2026-10-16): interface na proposta B (linha de resumo "Timing: …" com o
botão Advanced; a seção abre dentro do painel e, fechada com um modo escolhido, mostra o resumo em
destaque e uma linha do tempo pequena). Modos: All at once; One after another (intervalo, direção
1→N, N→1 ou ida e volta 1→N→1, loops); Groups (n grupos em ordem, intervalo entre eles); Odd/even
(ímpares juntas, pares X s depois); Custom (passos: cada passo tem as câmeras, escolhidas por
chips, e o tempo depois do passo anterior; câmera fora de todos os passos não dispara, com aviso).
Loops repete o padrão (na ida e volta, 1→N→2 repetido e o 1 no fim, para não disparar duas vezes
seguidas a mesma câmera). O plano fica salvo em settings.txt (`timing=`).

- Núcleo: `SequenceSettings::schedule` (câmera + instante em ms). Vazio = `ShootAll` como sempre
  (a versão de terminal não muda). Com plano, `CanonController::ShootScheduled` dispara cada item
  na hora, uma câmera por vez, e o número da foto na sessão é a posição do item (uma câmera pode
  fotografar mais de uma vez na mesma sessão; `pendingPrefixes` na `CameraContext`). O Download
  wait conta a partir do último disparo. Cancelar no meio: os itens que faltam não disparam.
- A página manda `shoot(contagem, sessões, espera, plano)`, com o plano como "câmera:ms,…" (vazio =
  todas juntas).
- Câmeras simuladas: `STILLPOINT_FAKE_CAMERAS=9` antes de abrir o app (Mac:
  `STILLPOINT_FAKE_CAMERAS=9 ./build/macos-arm64/Stillpoint`). Sem SDK; 9 câmeras "conectadas"
  (SL3 e T7 alternadas); o disparo (e o Test shot) grava fotos de teste (900×600, o número da câmera
  em destaque e "#n" = número da foto na sessão) seguindo o plano e os tempos. Camera settings mostra
  as câmeras como não ajustáveis.
- Conferido: interface no navegador e no app (Mac) com 9 câmeras simuladas: 33 fotos na ordem
  certa com ida e volta ×2, custom por passos, cancelar, layout sem rolagem, Timeline fixa. Falta:
  disparo com plano em câmeras de verdade (ShootScheduled) e o teste no Windows.

### Etapa 15: Janela Live (iniciada em 2026-10-16, concluída em 2026-10-17, versão 2.10.0)

Pedido do dono do projeto (2026-10-16): com o Timing, as câmeras podem disparar de jeitos
diferentes; precisa de um retorno visual numa outra janela (tela cheia num segundo monitor ou
flutuando) com quantas câmeras disparam, os grupos, quando, a contagem inicial (mantendo a da
janela principal) e as contagens entre câmeras/grupos. Decisões (2026-10-16, sobre o protótipo
`scratchpad/stage/stage.png`): modos Operator e Audience desde o início; layout das câmeras em
arco (padrão), círculo ou linha; som por grupo opcional, ligado por padrão; começa pela página
(testável com câmeras simuladas) e depois a janela nativa no Mac e no Windows.

Parte 1 (página, feita em 2026-10-17):
- Núcleo: `BulletTimeListener::OnShotFired(câmera, índice, total, ok)` a cada disparo do plano
  (`ShootScheduled` ganhou um callback; o terminal não muda). `SequenceSettings::groupSounds`
  toca `assets/audio/group.wav` (bip curto, gerado no projeto) quando começa um grupo novo (instante
  diferente do item anterior); só com plano e só pela interface gráfica.
- App: evento `livePlan` antes de cada disparo (plano com câmera, número e instante; `all` = todas
  juntas), `shoot` com 5º argumento (sons por grupo), `saveLive` (settings.txt `live=`: modo,
  layout, sons), `uiReady.live`. `LoadUi` embute `assets/ui/live.css` e `live.js`.
- Página: `assets/ui/live.js` (objeto `Live`: init, setCameras, open, close, handle, playback) e
  `live.css`; botão "Live view" na barra de cima; a página principal repassa os avisos do núcleo
  (`onCoreEvent`) e as fotos da sessão nova. Regras: contagem em números entre grupos só com
  intervalo maior que 1,5 s (senão barra + "Next: camera n in 0,x s"); câmera disparando fica
  branca 0,3 s; falha de disparo e foto que não chegou em vermelho (Operator); Audience mostra só
  a contagem, "Hold still", a contagem entre grupos longos e a sequência no fim. Esc cancela o
  disparo ou fecha; Space dispara de novo. O relógio da página se acerta pelo `shotFired` que chega.
- Botão grande Sound on / Sound off na Live view (pedido de 2026-10-16): liga e desliga todos os
  sons do disparo (contagem, "it's bullet time", bip dos grupos); `shoot` recebe "som,grupos".
  Câmeras simuladas na tela Camera settings: `CameraContext::fake` e `CameraSettingsCanon::Read/Write`
  com valores em memória (cada câmera começa um pouco diferente, para o Match ter o que igualar).
- Conferido no navegador (Playwright, 9 câmeras simuladas, 1280×720 e 900×560): ida e volta 17
  fotos, grupos com contagem, falha, layouts, Audience. Falta: teste no app (Mac) com
  `STILLPOINT_FAKE_CAMERAS=9` e o som por grupo.

Decisões de 2026-10-16 (noite): a Live view é uma **janela separada** (a principal continua à
vista: operador vê as duas, o modelo vê a Live); A agora (janela nativa) e C depois (página servida
na rede para TV/tablet/navegador); o uso previsto é uma TV por HDMI; precisa dar para ter Operator e
Audience ao mesmo tempo (duas janelas Live); botão grande de som também fora da Live view.

Parte 2 (janela nativa separada, feita em 2026-10-17, sem compilar aqui — falta o teste no Mac e no
Windows):
- `assets/ui/live.html`: a mesma página Live (live.js/live.css) numa janela própria; a cola com o
  app fica nela (liveReady, liveShoot, liveCancel, saveLiveWindow, liveDisplay, liveSetSound,
  liveClose, liveAnother, getPhoto). A janela principal perdeu a Live por cima: `Live view` chama
  `openLive(1)`; dentro da Live, "Another window" abre a 2 (até duas).
- `main_gui.cpp`: segunda instância da biblioteca webview (a 0.12 aceita mais de uma janela: só
  encerra o app quando a última fecha); `GuiListener` manda cada aviso para todas as janelas e
  guarda a última lista de câmeras; `LoadPage(arquivo, tema)` serve as duas páginas. As janelas
  Live nunca são destruídas enquanto o app roda: o botão de fechar só esconde (close guard).
  Disparo e cancelamento pedidos pela Live passam pela página principal (`liveShootRequest`),
  porque o plano do Timing é dela. Som: `live={"sound":…,"sounds":…}` no settings.txt, mudado por
  `liveSetSound` em qualquer janela, aviso `soundChanged` para todas. Opções por janela em
  `live1=` / `live2=` (modo, layout, display, monitor, sempre à frente).
- `native_window.h`: `Screens()`, `Show`, `Hide`, `SetFullScreen(janela, monitor)` (Mac: barra de
  título transparente sem botões, por cima da barra de menus, cobrindo o monitor; Windows: janela
  WS_POPUP sobre o retângulo do monitor, topmost), `SetWindowed(janela, sempre à frente)`;
  `InstallCloseGuard` passou a valer por janela (Mac: mapa por NSWindow; Windows: subclass com o
  callback). Monitores pelo nome (Mac: `localizedName`; Windows: "Display N (main)").
- Teclas na Live: Esc cancela / sai da tela cheia / esconde; Space dispara; F tela cheia.
- Ajustes de 2026-10-16 (teste no Mac): tela cheia com barra de título era encolhida pelo
  sistema abaixo da barra de menus → sem borda a janela perdia teclado e respostas (e trocar a classe do
  objeto quebrou os observadores do WebKit: exceção em `setStyleMask:`) → tela cheia do próprio
  sistema (`toggleFullScreen:`) no monitor escolhido, que só muda aquele monitor com "Displays
  have separate Spaces" (padrão); Full screen pergunta o monitor (com mais de um); botão de som só na
  janela principal; Speed (0,25x–5x, também no play da principal) e Reverse loop na Live (caixa
  própria no alto, à direita). Contagem entre grupos: o relógio da página só anda para a frente
  com um disparo atrasado (não volta); timer fixo em vez de requestAnimationFrame; nas câmeras
  simuladas o "download" acontece depois dos disparos, para não atrasar o plano.
- Ajustes de 2026-10-17 (madrugada): número grande sempre do mesmo tamanho e o rig fixo abaixo
  dele (sem pulo de um grupo para outro); Speed/Reverse na linha de cima; linha do tempo com um
  traço por rodada e as câmeras dela embaixo ("1–3", "4–6"), traço da próxima em âmbar; contagem
  com som a 3, 2 e 1 s de cada grupo (intervalo > 1,5 s; `WaitCallback` no `ShootScheduled` e
  nas simuladas) e `group.wav` mais alto (duas notas); imagem da foto grande posicionada de
  forma absoluta (`.stage img`), para não deslocar ao entrar em tela cheia na sessão.
- Som (decisão de 2026-10-17: opção 3): `AudioPlayer::PlayWavMixed` toca sons sobrepostos, com o
  arquivo na memória (Mac: AVAudioPlayer pelo runtime do Objective-C, um tocador por som em
  curso; Windows: uma voz waveOut por som). `SequenceSettings::mixedAudio` (a interface liga; o
  terminal segue com `PlayWavAsync`, um som por vez). Som de grupo só com intervalo ≥ 0,5 s.
  Ducking tipo sidechain (pedido de 2026-10-17): `include/audio_sidechain.h` calcula o envelope
  (RMS a cada 40 ms) de cada WAV ao carregar; enquanto um som dominante toca (som do grupo, "it's
  bullet time": `PlayWavMixed(arquivo, true)`), uma thread ajusta a cada 40 ms o volume dos
  outros (toques da contagem) pelo nível do dominante naquele instante — attack imediato,
  release 0,35 s, até 45 % no pico (Mac: `setVolume:`; Windows: `waveOutSetVolume` por voz). Toques a cada segundo do
  intervalo, desde logo depois do grupo. Live (Operator): legenda e linha do tempo somem com a sequência tocando; Audience: "Firing!" nos
  disparos, "Next pose" na contagem, "Got it!" centralizado.
- Modo "Sweep" no Timing (aprovado em 2026-10-17): varredura rápida, uma câmera depois da outra
  sem pausa — a Sequence com intervalo por atalhos (0,1 / 0,15 / 0,2 / 0,3 s; `timing.sweep`),
  direção própria (`timing.sweepDirection`) e loops. Aviso na Timeline: o menor intervalo por USB
  ainda vai ser medido; abaixo dele, caixa de disparo. `group.wav` trocado pelo som enviado pelo
  dono do projeto (Fire.mp3 → WAV 44,1 kHz estéreo 16 bits, 4,3 s).
- Conferido no navegador (live.html com funções simuladas): opções, display, som, sequência.
  Não compilado: risco maior na parte nativa (Mac e Windows).

Fechada em 2026-10-17 como 2.10.0 **sem** teste no Windows (primeira compilação da janela Live,
tela cheia e waveOut lá) e **sem** câmeras de verdade — decisão do dono do projeto; conferir na
primeira oportunidade (ver Pendências conhecidas).

Ajustes de 2026-10-28 (branch `fix-live-fullscreen-hide`, depois dos vídeos do dono do projeto):
no Mac, esconder a Live em tela cheia deixava a tela preta por segundos (agora sai da tela cheia
antes de esconder, no `windowDidExitFullScreen:`); Close/Esc em tela cheia só saem da tela cheia
e a Live continua em destaque; a opção "Full screen" não fica marcada numa janela comum. Escolha
do monitor como nos programas de photo booth / OBS (decisão do dono do projeto, 2026-10-28): monitor
lembrado por janela (não pergunta de novo enquanto ele estiver ligado), "Identify displays" (número
grande em cada monitor por 3 s; `NativeWindow::IdentifyScreens`, Mac e Windows), "Change display"
em tela cheia, e um vigia de monitores a cada 2 s (evento `screens`): monitor que some → tela cheia
no principal. Nada de escolher "mesa"/Space: nenhum programa faz isso; o sistema decide.
**Testado no Mac com um monitor (2026-10-28):** tela preta ao fechar, Close/Esc em tela cheia e a
opção "Full screen" marcada — ok. **Pendente:** a parte com dois monitores (pergunta com números,
Identify displays, Change display, monitor que some) e tudo no Windows (inclusive compilar o
Identify em GDI).

Parte 3 (futuro, "C"): servir a Live na rede local (TV com navegador, tablet), reaproveitando a
mesma página.

## Próximas etapas (decididas em 2026-10-18: estabilidade e sincronia do rig)

Objetivo: profissionalizar o equipamento — menos travamentos, gargalos e quedas. Ordem:

1. **Etapa 16 — um processo por câmera.** Hoje tudo roda num processo só e o SDK da Canon atende
   uma câmera por vez; se uma câmera trava o SDK, o app inteiro trava. Cada câmera passa a ter um
   processo "trabalhador" (o próprio Stillpoint num modo sem janela) e o app principal vira o
   coordenador: disparo e download em paralelo de verdade, vigia com timeout por comando,
   religar a câmera sozinho, log por câmera. Custo estimado: CPU desprezível (os trabalhadores
   ficam esperando), RAM ~20–60 MB por câmera. **Primeiro passo (com 2 câmeras):** confirmar que
   o SDK aceita ser carregado por vários processos na mesma máquina, cada um com a sua câmera.
   Substitui o item "Ordens de disparo em paralelo" abaixo. Terminal não muda.
   **Em andamento (branch `etapa-16-processo-por-camera`, 2026-10-21):** programa de teste
   `SdkMultiprocTest` (`src/tools/sdk_multiproc_test.cpp`) e roteiro em `docs/teste-manual.md`,
   seção 20. **Resultado no Mac (2026-10-21, SL3 + T7 + T5): aprovado.** Três processos, cada um
   com a sua câmera, abrem em ~0,5 s; o SDK recusa abrir a câmera de outro processo
   (0xC0, porta em uso), então a exclusividade vem do próprio SDK; disparo simultâneo pelo
   relógio do computador com 26 ms entre o primeiro e o terceiro processo. Numa rodada a T7
   travou dentro do comando de disparo e só o processo dela parou — os outros dois dispararam,
   baixaram e fecharam normalmente: é exatamente o isolamento que a etapa quer.
   **Implementação (2026-10-21, mesmo branch):** `StillpointWorker` (`src/worker/`), um
   processo por câmera que obedece ordens por texto (`include/worker_protocol.h`); coordenador
   `CameraFleet` (`src/gui/camera_fleet.*`) no lugar do CanonController + BulletTime na
   janela: conexão em paralelo (um trabalhador por câmera vista no USB), disparo por horário
   do relógio do computador (plano do Timing/Sweep mandado a cada processo), vigia com tempo
   limite (processo que não responde é encerrado e reaberto; a câmera volta com o mesmo nome),
   log por câmera em `Logs/worker-<série>.txt`. Camera settings, Test shot e Match passam pelos
   processos (`CameraFleet::ReadSettings/WriteSetting`). Decidido: sem chave para o modo
   antigo. Terminal e câmeras simuladas não mudam. Teste: `docs/teste-manual.md`, seção 21.
   **Testado no Mac em 2026-10-21 (SL3 + T7 + T5): conexão em paralelo, disparo At once e
   com plano, queda e volta da T5 com o mesmo nome, Restart camera connections — tudo ok.**
   Camera settings, Test shot, Match, fechar o app e processo encerrado à força: testados e
   aprovados no Mac em 2026-10-21. **O branch `sweep-limite` (Sweep único, aviso de repetição,
   download adiado, foto recusada visível, Direction em todos os modos; ver "Medir o menor
   intervalo do Sweep" abaixo) foi mesclado aqui em 2026-10-22 (decisão do dono do projeto):
   vai junto na 2.11.0.** Pendente: Windows (compilar, roteiro 21 e 18; a camada de processos
   do Windows nunca compilou) e o resumo de foto recusada com câmeras de verdade.
**Fila decidida em 2026-10-28** (regra do dono do projeto: a caixa de disparo fica sempre por
último; o que entrar de novo vai na frente dela):

2. **Etapa 17 — Project.** Uma pasta escolhida pela pessoa (`Originals/`, `Edited/`,
   `project.json`) guarda sessões para exportar depois, de novo, com outras configurações.
   "Add to project" no painel Sessions (a sessão fica no disco como originais, em vez de sair do
   app ao salvar); janela Project: sessões com estado (originals / n de m edited), seleção,
   Export Photos/Sequence "edited when available"; faixa de Projeto no painel Sessions; guarda
   também os XMP que o Lightroom gravar ao lado dos RAW (edição não destrutiva preservada).
   Protótipo visual de 2026-10-22 (canvas "Stillpoint — Projects & Edit round trip"). Nome
   decidido: **Project** (não "sessão master"). Primeiro passo: desenho da pasta e do
   `project.json`, aprovado antes de codar.
   **Feita em 2026-10-29 (branch `etapa-17-project`, versão 2.12.0).** Desenho em
   `docs/project.md`; teste em `docs/teste-manual.md`, seção 23. Decisões do dono do projeto
   pelo caminho: projeto como botão na barra de cima (opção C de 4 protótipos) + grupo "Not in
   project" recolhido; sessão nova entra direto no projeto; Remove volta para o app; reordenar
   também no projeto; rótulo por sessão com sugestões; menu do botão direito na sessão;
   segurar e arrastar para dentro/fora; renomear o projeto (menu e campo da janela Project,
   caracteres proibidos barrados); desfazer/refazer geral (inclui apagar, com lixeira do app
   `.trash` na pasta de dados, esvaziada ao abrir o app — decisão confirmada em 2026-10-29:
   fechar o app torna as exclusões definitivas); botão de projeto na barra discreto (verde
   médio, neon só no hover/arrastar) e sem Undo passo a passo dentro do Reorder by photo (Save
   vira um item do histórico; fechar descarta) — ambos confirmados em 2026-10-29; aviso do rodapé no layout "etiqueta mono" (de 6 protótipos) e tudo
   registrado na Activity; Enter/Esc e clicar fora nas janelas; trilho neon igual nos três
   painéis. Testado no Mac com câmeras simuladas. **Pendente:** câmeras reais (session.json,
   .xmp, undo de configurações — inclusive rápido, com a trava "cameras still applying" —,
   lixeira com RAW/HD externo, ordem das câmeras) e Windows (compila; sem teste de uso).
3. **Etapa 18 — Metering mode nas Camera settings** (ver "Futuro"; pequeno).
   **Feita em 2026-10-30 (branch `etapa-18-metering`, versão 2.13.0).** Coluna "Metering" na tabela
   e em All cameras (`kEdsPropID_MeteringMode` = 0x0403: 1 Spot, 3 Evaluative, 4 Partial,
   5 Center-weighted; valores aceitos lidos de cada câmera); Copy from camera copia; Undo como as
   outras. Match automatically não muda o Metering; com modos diferentes avisa antes e oferece pôr
   todas no modo mais comum ou seguir (decisão do dono, 2026-10-30). Largura (decisão do dono,
   2026-10-30, opções A+B): Quality saiu da tabela para o popover ± do Picture Style, Focus virou
   etiqueta ao lado do nome, ISO sem prefixo, Metering "Center-wtd", nome mais estreito e
   espaçamentos menores — a tabela cabe sem rolagem lateral a partir de ~920 px de janela
   (medido no navegador: 849 px em 920; 926 em 1000). Conferido no navegador com câmera
   simulada; **pendente** o teste com SL3/T7/T5 (teste-manual 16).
4. **Etapa 19 — Exportação para impressão lenticular** (ver "Futuro"; precisa do Project).
   **Entrega 1 feita em 2026-10-30 (branch `etapa-19-lenticular`, versão 2.14.0).** Janela de salvar
   reorganizada (decisão do dono, opção A de 3 protótipos — fila de renderização e receitas ficaram
   de fora): Photos, Sequence e Lenticular são **saídas combináveis** (seções com caixa de marcar,
   recolhidas quando desmarcadas), um só Save grava tudo numa pasta por sessão com `Photos/`,
   `Sequence/` e `Lenticular/` quando há mais de uma; a escolha de modo ao abrir saiu; o antigo "Also
   save the photos" da sequência virou a seção Photos. Lenticular: lâmina (40/50/60/75/100 LPI; 3D 20/30/40; "Other"),
   pitch medido (opcional), impressora (600/720/1200/1440 dpi; "Other" — o app não depende de
   impressora: é só um número de dpi), tamanho em cm/pol com presets, efeito Animation (lentes
   deitadas, faixas em linhas) ou 3D (lentes em pé, faixas em colunas), ordem invertida; leitura
   "colunas por lente / pontos por foto" com avisos (< 1 ponto por foto = não separa; < 2 =
   transição desigual); prévia por arrasto. Saída: TIFF sem compressão com o dpi gravado, em
   `Exports/` (nome com lpi/dpi/efeito). `Export::WriteLenticular` (fração contínua de lente por
   linha/coluna — o pitch medido entra direto; cada foto redimensionada para cobrir o tamanho).
   Verificado no Linux com fotos de cor sólida (padrão `RRGGGBBYYY` a 10 px por lente e 4 fotos;
   dpi no TIFF; reverse; eixo 3D). **Não validado no papel:** o dono não tem impressora nem lâmina;
   registrar o resultado da primeira impressão (gráfica + kit de lâminas) antes de dar por
   concluída. **Entrega 2 (2026-10-30, mesmo branch e versão; decisões do dono no mesmo dia):**
   folha de pitch test — 21 faixas preto/branco de 0,05 em 0,05 ao redor do LPI (ou do pitch já
   medido), cobrindo ±0,5 numa folha só (opção A, decisão do dono em 2026-10-31, pensando em quem
   imprime em gráfica: cada rodada de teste é uma ida); papel mínimo A4; aviso quando a impressão é
   mais comprida que as faixas (o erro se acumula ao longo dela); "Finer steps" mantido (decisão do
   dono, 2026-10-31): passos 0,04 / 0,03 / 0,025 / 0,02 / 0,01, cada um com um "?" de quando usar, em volta do pitch medido (ou do LPI da embalagem, sem ele); números impressos com uma fonte de bloco
   própria; papel com as mesmas opções de tamanho da exportação (começa em A4/Letter); TIFF em tons de
   cinza gravado linha a linha (`Export::WritePitchTest`), salvo na pasta padrão do Save e mostrado
   no Finder; abre pelo "Print pitch test…" da seção Lenticular e por um ícone na tela principal.
   Marcas: corte e alinhamento ligados e sangria de 3 mm por padrão (podem desligar); margem branca de
   0,4 pol em volta; as lentes contam a partir da linha de corte. O pitch medido fica guardado com as
   últimas configurações de exportação (não por combinação lâmina + impressora).
   Decisões do dono (2026-10-30): listas de fábrica acima; cm como padrão; prévia na tela; aba
   dentro do Export.
   **Lixeira do app (entre a 19 e a 20; branch `lixeira-do-app`, versão 2.15.0, iniciada em 2026-11-01).**
   Sessões e fotos apagadas ficam **15 dias** na lixeira e depois saem de vez (ao abrir o app, ao abrir
   um projeto e ao abrir a janela Trash). Cada exclusão é um item próprio (`.trashinfo`: sessão, inteira
   ou só fotos, origem, quando). Sessões do Project vão para a lixeira **dentro da pasta do projeto**
   (`<Projeto>/.stillpoint-trash`, mesmo disco, sem copiar para o computador) e só aparecem com o
   projeto aberto (decisão do dono: opção B). Botão com o ícone da lixeira e o número de itens **ao lado
   do menu do projeto** (espaço ocupado no aviso do botão e na janela); o nome do projeto na barra tem
   limite de 24 caracteres (o nome inteiro ao parar o mouse). Janela Trash: itens agrupados (app /
   projeto), data, fotos, tamanho, há quanto tempo e quantos dias faltam; Restore, Delete now e Empty
   trash. O Desfazer de apagar continua (traz o item mais recente da sessão). Sessões já salvas que o
   app apaga ao fechar, e as descartadas no fechamento, saem de vez (não ocupam a lixeira), como antes.
   **Proporção da foto (entre a lixeira e a 20; branch `proporcao`, versão 2.16.0, iniciada em
   2026-11-01; no main em 2026-11-04, testada com câmeras simuladas no Mac; câmeras reais e Windows pendentes).** Decisões do dono: (a) Camera settings lê e muda a proporção da câmera (3:2, 4:3,
   16:9, 1:1) dentro do painel do botão de estilo, renomeado "Style, Quality & Ratio", logo abaixo de
   Quality; entra na comparação entre câmeras e no "Settings differ"; câmeras que não aceitam pelo USB
   mostram a linha desabilitada com a explicação. (b) A sessão avisa quando as fotos têm tamanhos ou
   proporções diferentes. (c) Export sessions ganha a linha "Aspect ratio" (As shot, 3:2, 4:3, 16:9,
   1:1) para Photos e Sequence, recorte centralizado com prévia; "As shot" com proporções misturadas
   na sessão avisa. Lenticular não usa a linha: o tamanho do papel já define a proporção e o app
   recorta para preencher. (d) O app lê a marca de recorte que a câmera grava no RAW quando a
   proporção não é 3:2, para mostrar e exportar o mesmo quadro que o Lightroom. Depois dela vem a 20
   (Lightroom Classic), como 2.17.0.
   Desenho fechado com o dono em 2026-11-01 (protótipo "Match automatically — protótipos"):
   - **Match automatically vira uma janela em três passos** (um botão só): 1 Choose (o que igualar:
     shutter/aperture/exp. comp., ISO, brightness, white balance, color, Picture Style, Quality,
     Aspect ratio, gray card; lembrado), 2 Test shot (até 5 fotos; nada muda nas câmeras),
     3 Review (tabela por câmera com antes riscado → depois em verde e caixa para aceitar cada câmera,
     ao lado a comparação de fotos: Split/Side by side/Flip, play com velocidade e Reverse loop,
     fileiras de miniaturas antes/depois). Só o "Apply to n cameras" mexe nas câmeras; um ⌘Z desfaz tudo.
     Para o "depois" existir, o Match tira uma foto extra no fim, já com as mudanças.
   - **Valores do passo 1 (decisão do dono, 2026-11-02):** cada item de "Set the same value on every
     camera" já mostra o valor calculado que o app poria em todas, com o porquê, numa lista para trocar.
     Regra (a mesma do núcleo): shutter/aperture/exp. comp./ISO, o valor mais perto da média em stops que
     todas aceitam; Picture Style, o mais comum (nunca Auto); Format e Ratio, o das câmeras que não aceitam
     mudar, senão o mais comum; White balance, "Let the test shot choose" (Daylight e a foto escolhe o
     predefinido comum mais perto) ou um predefinido/Kelvin fixo, que a foto não troca (só ajuste fino).
     O valor trocado pela pessoa vai ao núcleo (`autoMatch`, 4.º argumento "tv=93 kelvin=5200") e vale
     para todas as câmeras que o aceitam. As trocas não ficam guardadas: cada abertura recalcula.
   - **Cartela no Match (decisão do dono, 2026-11-02, opção A):** o Calibrate with chart continua um preparo
     separado (uma vez por modelo; botão do rodapé fica), mas o passo 1 do Match tem o bloco "Camera models":
     sem calibração, aviso âmbar com "Calibrate with chart"; calibrados, uma linha com "Recalibrate".
   - **Passo 1 sem rolagem (decisão do dono, 2026-11-02, protótipo G):** uma linha por item, título e
     explicação à esquerda e a lista de valor à direita (exposição: três listas lado a lado); o texto sobre a
     foto de teste foi para o subtítulo. "Use the gray card" começa desligado a cada abertura; na
     conferência do cartão há "Skip the gray card" (segue medindo a foto inteira).
   - **Aspect ratio no Match:** iguala as que aceitam mudar às que não aceitam ("fixed"); o Test shot mede
     a proporção real de cada foto e marca em amarelo a que saiu diferente do informado. **Feito em
     2026-11-02:** o Match mede largura/altura da primeira foto de cada câmera (`Result.ratios`), o passo 3
     mostra "Shot 16:9 · camera reports 3:2" e a célula Ratio do Camera settings fica tracejada âmbar; as
     câmeras simuladas entregam a foto na proporção marcada e a 02 entrega sempre 16:9 para testar.
   - **Aviso na sessão (primeiro disparo):** etiqueta "Mixed ratios" e aviso uma vez por sessão,
     "Cameras 02 and 04 shot 16:9; the others 3:2", com "Open Camera settings" e "Crop on export to
     16:9 (keeps 94%)": a sugestão é a proporção presente que perde menos pixels; as outras (3:2, 4:3,
     16:9, 1:1) ao lado, cada uma com quanto mantém. Miniaturas com proporção diferente ganham marca
     amarela. Nas sessões seguintes só a etiqueta. **Decisões do dono (2026-11-02, protótipo J):** o
     aviso é uma janela por cima da tela (como as confirmações do app); a sugestão é a proporção que
     perde menos pixels e o número entre parênteses é a média por foto; a marca vai nas fotos que
     diferem da proporção mais comum e, em empate, nas da proporção de menor área (ex.: 3 em 3:2 e 3
     em 16:9 → marca as 16:9); o aviso volta ao reabrir o app e quando a combinação de câmeras/
     proporções muda; só a proporção conta (tamanho de sensor não). Em aberto: o botão "Crop on
     export" antes da linha "Aspect ratio" do Export existir, o texto com três proporções e o botão
     "Keep as shot" — resolvidos em 2026-11-03: botões ficam e guardam a escolha por sessão (hoje na
     memória do app, `localStorage`; passa para a sessão quando o Export a usar), texto com três
     proporções aprovado, "Keep as shot" fica. **Feito em 2026-11-03** (`docs/teste-manual.md`, seção 35):
     o app mede a proporção na prévia de cada foto da sessão (como o Test shot simples). Toda sessão com aviso âmbar (fotos que faltaram, proporções misturadas) deixa o
     ícone dela âmbar na barra só de ícones da tela cheia (feito para "n missing" em 2026-11-02).
   - **Export sessions:** linha "Aspect ratio" (As shot, 3:2, 4:3, 16:9, 1:1) para Photos e Sequence;
     "As shot" com proporções misturadas avisa. Recorte único por sessão (a sequência não pode pular),
     prévia arrastável no Fill, nove posições rápidas. Photos: opção "Same size for all photos"
     (desligada por padrão) para igualar ao tamanho da menor quando os sensores diferem.
   - **Lenticular:** "Placement" Fill (cobre e corta; arrastar para escolher a parte) ou Fit (foto
     inteira, faixa preta ou branca); nove posições; sem zoom intermediário; prévia com sangria e marcas
     de corte; um enquadramento por sessão.
   - **Decisões do dono (2026-11-03, protótipos P–S):** a linha "Aspect ratio" vem por último, depois de
     Quality (opção Q); "Placement" Fill/Fit é por sessão e a cor da faixa é um ajuste geral do app, em
     Settings › Lenticular (opção S); linha "Crop" separada, com a prévia e as nove posições. **Feito em
     2026-11-03** (`docs/teste-manual.md`, seção 36): o programa recorta Converted e Sequence
     (`Export::Framing`), "Same size" reduz ao tamanho da menor câmera, Lenticular Fill com posição e Fit
     com faixa; a escolha (proporção e posição) fica em `session.json` (`crop`), também fora do Project,
     e a janela "Mixed ratios" grava nela. Testado só com câmeras simuladas; RAW e lenticular real
     continuam adiados.
   - **Framing (decisão do dono, 2026-11-03, protótipos T/U/V → W1/W2):** o alinhamento das fotos e a
     proporção são interdependentes, então ficam juntos numa aba **"Framing"** do Export sessions (antes de
     Photos/Sequence/Lenticular; uma porta só, sem botão ao lado de "Reorder"), com a prévia em cima e as
     linhas embaixo, como nas outras abas (decisão de 2026-11-03, commit `fefd1b0`; o desenho inicial era uma
     coluna à direita) e **sem modo teatro** (decisão do dono, 2026-11-03): o ⤢ do canto da prévia só amplia a prévia e deixa as
     linhas do Framing à vista (a fileira, Aspect ratio, Same size, Position); o teatro "< >" que esconde tudo é só
     do Lenticular, que não mudou. **Pedaço 2 feito em 2026-11-03** (`docs/teste-manual.md`, seção 37; protótipo X2):
     o botão do canto da prévia virou "Align photos" (texto + ícone de dois quadros) e abre a tela de alinhamento no
     lugar das abas: prévia grande com as referências tingidas por baixo da foto atual (Previous azul, Next laranja;
     a referência "Photo 01" foi retirada em 2026-11-03), cada camada com a sua opacidade (a barra da Current photo
     move as três; guardadas na memória do app), quadro comum aceso, quadro da proporção âmbar, fileira de miniaturas com
     o ponto da referência; coluna com References, This photo (Move X/Y, Size, Rotate, Reset photo/Reset all), Common
     frame e Aspect ratio/Position; gestos como decidido. `session.json` ganha "align" (arquivo:dx,dy,scale,rot); o
     programa (`Export::Align`, `ComputeCommonFrame`, `ApplyAlign`) transforma cada foto e corta ao quadro comum antes
     da proporção, em Converted, Sequence e Lenticular (Fill e Fit); sem foto alinhada nada muda. Resolvido em 2026-11-04
     (o que estava "em aberto" aqui): com uma proporção escolhida, toda sessão, alinhada ou não, sai no canvas (a parte
     comum às fotos), com todas as fotos no mesmo tamanho; em "As shot", cada foto sai inteira. **Decisões do dono (2026-11-03, noite):** a caixa "Same size for all photos" saiu: o recorte é
     um só para a sessão e todas as fotos convertidas saem no mesmo tamanho (sempre); na tela de alinhamento o recorte
     da proporção não se move (a posição do recorte é só da aba Framing) e "Position" posiciona a foto atual na folga
     que ela tem sobre a área útil; o quadro comum é a interseção das fotos no tamanho escolhido, sem giro (girar só
     faz a foto crescer para seguir cobrindo a área, com conferência exata pelos cantos); quadro da proporção neon
     sólido, o original tracejado. **Canvas (decisões do dono, 2026-11-03, noite):** o canvas é a interseção das fotos como saíram
     e, com proporção escolhida, o maior retângulo nessa proporção que cabe nela; nenhuma foto é ampliada sozinha
     (chegou-se a fazer as 16:9 crescerem para a altura das 3:2 e voltou-se atrás: ampliar muda o tamanho do objeto
     fotografado entre as câmeras). Um quadro só na tela (o canvas, neon). As fotos convertidas saem no tamanho do
     canvas. "As shot" sem foto ajustada continua saindo cada foto como é.
   - **Export em três passos (decisão do dono, 2026-11-04, protótipo "Export em três passos" aprovado):** 1 Sessions
     (escolher as sessões e o Framing de cada uma, com selo por sessão e "Use this framing on all ticked sessions",
     que copia proporção e posição mas não o alinhamento), 2 Outputs (Photos · Sequence · Lenticular, "Same settings for
     all sessions"; "Print pitch test" dentro da aba Lenticular), 3 Review (tabela por sessão com "Edit", "Name" valendo
     para todas as marcadas e "Export to"). Passos no cabeçalho (para trás sempre, para a frente só com o atual pronto);
     o passo onde a pessoa parou fica guardado ao sair. **Alinhar exige proporção (2026-11-04, opção B):**
     "As shot" é sempre como saiu (a exportação ignora o alinhamento guardado); "Align photos" em "As shot" pede antes
     uma proporção ("Choose a ratio first") e abre com ela; dentro da tela, "As shot" fica desativado. **Lenticular × Framing (2026-11-04, opção A):** em Fill o papel
     manda (o canvas é cortado de novo para a forma do papel), com aviso âmbar quando as formas diferem; Fit põe o
     Framing inteiro no papel com faixa. Modo teatro também em Photos (com as miniaturas) e Sequence; reabrir o Export
     nunca volta em teatro. "Use the default folder" sempre à vista no Review.
     **Revisão da opção B (2026-11-04, tarde):** só a sessão com mixed ratios precisa de uma proporção para alinhar; numa
     sessão toda na mesma forma, "As shot" alinha e exporta pelo canvas (a parte comum). O Export reabre sempre no passo 1.
     Settings e About abrem por cima de qualquer janela. ⌘Z não age com uma confirmação aberta; a cor da faixa do
     Lenticular entra no desfazer. A escolha da janela "Mixed ratios" vale para todas as sessões do disparo; mudar o
     Camera settings faz o aviso voltar.
     **2026-11-04 (noite):** a escolha da janela "Mixed ratios" vale também para os disparos seguintes com a mesma
     combinação (até mudar o Camera settings). Etiqueta "n deleted" (fotos da sessão na lixeira), no desenho do "n
     missing". Na janela Project os avisos ficam na coluna Session. Dentro de "Align photos" o rodapé tem só "Done
     aligning" (caminho A). Em "Choose a ratio first" a sugerida é o botão verde ao lado do Cancel.
     **⌘Z e passos (2026-11-04, decisão do dono):** desfazer e refazer levam até onde a mudança aconteceu (passo, sessão,
     aba, foto, Align photos) e o aviso diz onde; navegar não é um passo. Passos do cabeçalho: voltam livres, para a frente
     só pelo botão verde (caminho B). Esc dentro do Align photos volta ao Framing. Cursor de girar no "Align photos": seta em arco preta com
     contorno branco (opção B). `docs/teste-manual.md`, seção 38.
5. **Etapa 20 — Edit in Lightroom Classic / Photoshop.** Ida e volta: o app abre os originais
   do Project no Lightroom Classic (o dono do projeto usa o Classic); um plugin do Stillpoint
   (SDK Lua do Classic) agrupa cada sessão como coleção e tem "Export to Stillpoint", que
   renderiza com o motor da Adobe para `Edited/` com os nomes certos; o app vigia `Edited/` e
   casa os arquivos com as sessões pelo nome; os XMP ficam no Project. O app **não** aplica as
   edições do XMP por conta própria (o motor do Camera Raw é fechado; uma prévia "parecida" seria
   pior que nenhuma). Photoshop / Camera Raw: abre os frames; aviso de que o resultado sai num
   formato não RAW (TIFF/JPEG) em `Edited/`. Lightroom "normal" (nuvem): sem SDK nem XMP — só o
   caminho manual (exportar para `Edited/`).
   Decisão do dono (2026-11-01): plugin para o Lightroom Classic primeiro (ele usa o Classic), depois
   o Photoshop. O app confere se o plugin está instalado e atualizado e instala sozinho; um comando
   só ("Edit in Lightroom Classic"), feedback por avisos, Activity e a etiqueta "Edited n / m".
   Protótipo das telas no Lightroom aprovado em conceito; decisões de formato, sync e prévia pendentes.
   Decisões do dono registradas nas conversas de 2026-11-01 (passadas para cá em 2026-11-05; conferir antes de
   começar): editadas voltam em TIFF 16 bits, resolução cheia, Adobe RGB, com pergunta na exportação sobre manter
   Adobe RGB ou converter; no Stillpoint a editada aparece por padrão, com botão para alternar Original / Edited;
   sessão já importada só vai para a coleção que já existe; a seção do Settings se chama "Lightroom & Photoshop";
   cor: sRGB por padrão em JPG/PNG/WEBP/HEIC/Sequence, Adobe RGB em TIFF/Lenticular, com opção de trocar; o
   plugin precisa funcionar no Mac e no Windows (Lightroom Classic 15.6 e Photoshop 27.11 na máquina do dono).
   **Andamento (branch `etapa-20-lightroom`):** protótipo "Stillpoint e Adobe" aprovado em 2026-11-05 (15 telas; conflito
   de Desfazer: opção A, janela de escolha obrigatória). Pedaços: 1) Settings com abas, plugin (instalar/atualizar),
   "Edit in Lightroom Classic" (sessão e foto), coleção "Stillpoint › projeto › sessão", etiqueta "In Lightroom" e "LR"
   nas miniaturas, "Done editing", janelas de "não instalado / antigo / não respondeu", catálogo por projeto;
   2) "Export to Stillpoint" no Lightroom (⌥⇧E), "Edited n / m", aplicar a foto 01 em todas; 3) alternar Original /
   Edited; 4) Photoshop (uma foto por vez, aviso "no longer RAW", conflito de Desfazer). **Pedaço 1 feito, para testar
   (`docs/teste-manual.md`, seção 40).** Plugin em `assets/lightroom/Stillpoint.lrplugin` (Lua), conversa por arquivos em
   `<pasta de dados>/lightroom` (`src/gui/adobe.h`). Pedaço 1 aprovado no Mac em 2026-11-05 (falta catálogo por
   projeto e Windows). Decisões do dono (2026-11-05): versão mínima do Lightroom Classic 11.0; "Done editing" deve
   tirar a coleção do Lightroom, só na sessão (não por foto); as fotos e as edições ficam no catálogo; "Just this
   photo" manda só a foto; várias fotos selecionadas podem ir juntas; bolinha da etiqueta pulsa só com o Lightroom
   aberto (opção A). Para o pedaço 2: exportar de novo uma foto que já tem editada no Stillpoint pergunta antes de
   trocar; "Apply photo 01 to all" pergunta se sobrescreve as fotos que já têm edição ou aplica só nas sem edição.
   Catálogo: um por projeto é o padrão, "The open catalog" continua como opção (2026-11-05). Criação do catálogo do
   projeto: opção A (modelo vazio criado uma vez pela pessoa, copiado pelo Stillpoint para cada projeto), com slides
   animados passo a passo dentro da janela "Create the project's catalog first" (protótipo antes); o app detecta quando
   refazer o modelo (Lightroom atualizado, catálogo convertido, modelo sumido) e oferece "Use the open catalog instead".
   Catálogo vazio "Template" com slides aprovado no Mac em 2026-11-06. **Pedaço 2 feito, para testar (`docs/teste-manual.md`,
   seção 41):** painel flutuante e menu File › Plug-in Extras no Lightroom, Export to Stillpoint (TIFF 16 bits, tamanho cheio,
   Adobe RGB ou sRGB, pergunta antes de trocar editadas), Apply photo 01 edit (pergunta antes de sobrescrever edições),
   Go to session in Stillpoint; o app lê os TIFF (sem compressão, LZW ou ZIP; Adobe RGB vira sRGB) e avisa "Edited n / m". Decisões do dono (2026-11-06): quando todas as fotos da sessão têm editada, a etiqueta "In Lightroom" sai e a coleção
   sai do Lightroom (como no Done editing); "Only the new ones" fica; Apply photo 01 copia tudo o que foi mudado no Lightroom;
   sem atalho de teclado; "Stillpoint" como destino na janela File › Export… (feito). As prévias do app mostram a editada
   quando existe (a alternância Original / Edited é o pedaço 3). Depois (2026-11-06): a etiqueta "Edited n / m" é a alternância (prévias e Export), "Use edited photos" foi da Review para Outputs, "Delete edits" na sessão e nas fotos, e o Apply usa a foto ativa no Lightroom.
   Decisões do dono (2026-11-06, noite): **⌘Z regra X** (restaurar pela lixeira não entra no ⌘Z; o "apagar" daquele item sai da pilha);
   **lixeira D** para testar primeiro (linha baixa, árvore com ligações, miniaturas com selo LR, Restore e menu ···; ele tende para a A
   depois de testar); painel do Lightroom com abas "Not in Lightroom / In Lightroom" com prévias, 12 por página, fechado de começo
   (Add selected, Add all, Remove from Lightroom só tira da coleção) — a fazer; exportar de novo troca a editada nos dois programas
   (B), com pergunta pendente sobre como voltar atrás; coleções identificadas pelo número interno do Lightroom (não pelo nome) — a fazer.
   Depois (2026-11-06, noite): lixeira D mantida; para voltar atrás uma editada trocada, vale o histórico do Lightroom
   (regra B, escolhida por mim a pedido do dono: o Lightroom é onde a edição mora e o Stillpoint segue). Cancel editing no
   painel (pergunta se descarta mudanças que o Stillpoint não tem); Export to Stillpoint traz o Stillpoint para a frente
   com a sessão; sessão apagada no Stillpoint enquanto estava no Lightroom só volta com "In Lightroom" por uma ação de
   dentro do Lightroom (o ⌘Z dele a tira da lixeira); restaurar a editada pela lixeira traz a edição de volta no Lightroom.
   **Anotado para o fim da etapa 20 (pedido do dono, 2026-11-06; não fazer antes de tudo estar polido):** repensar o botão
   "Edit in Lightroom Classic…" da prévia grande e as opções do botão direito das fotos e da sessão, para uma experiência
   melhor. Também para depois (mesmo dia): fotos com proporções diferentes cortadas para 3:2 (na janela do bullet time ou no
   Export) ficam com a vinheta e outros efeitos de borda do Lightroom no lugar errado depois do corte; soluções propostas
   (mandar já com o corte aplicado no Lightroom, aviso no painel, cópias já cortadas, efeitos no Stillpoint) — decisão do dono.
   Painel do plugin atrás do Lightroom: opções levadas ao dono (atalho de teclado do Mac para "Show Stillpoint panel",
   botões do painel também no Stillpoint, informação no painel Metadata do Lightroom) — decisão do dono.
   Vinheta com corte: decisão do dono (2026-11-06) = opção A (o recorte do Export vai para o recorte do Lightroom,
   a pessoa edita o quadro final). Feito: o recorte (proporção e posição) vai junto no Edit in Lightroom Classic e não
   conta como edição; sessão com proporções misturadas e sem recorte (Keep as shot / Esc) pergunta "Crop before
   Lightroom Classic?" (Send as shot / Crop to …). Pendente: o alinhamento (Framing, Align photos do Export) e o que
   acontece quando o recorte ou o alinhamento mudam depois de editar.
   **Edição dentro do Export (decisões do dono, 2026-11-07, protótipo "Editar dentro do Export"):** opção A = o Export
   tem 4 passos (1 Sessions — 2 Edit — 3 Outputs — 4 Review); M1 = a janela principal só mostra (etiquetas In Lightroom e
   Edited n / m, bolinhas LR; clicar numa etiqueta abre o Export › Edit da sessão); reabrir o Export com uma sessão marcada
   no Lightroom vai direto ao Edit nela; o botão manda só a sessão aberta; "só esta foto" e "Delete edit…" no botão direito
   da miniatura do Edit; selo ED nas miniaturas e Original / Edited em cima (sem a etiqueta "Not edited" na lista);
   "Crop before Lightroom Classic?" continua quando as fotos não têm todas a mesma proporção; a prévia do Edit abre tocando
   (play e Reverse loop ligados) com play/pause e modo teatro; no teatro, ‹ ▶ › Speed − + e Reverse loop como na tela cheia
   da janela principal. Feito em 2026-11-07. "Use edited photos" saiu do Outputs e foi para o bloco Lightroom Classic do Edit.
   Depois (2026-11-07): o Edit bloqueia o avanço enquanto uma sessão marcada está no Lightroom; lixeira do Export acima da
   lista (passos 1 a 3) para arrastar fotos e sessões, com as animações da janela principal; foto com editada solta numa
   lixeira (Export ou janela principal) pergunta se vai só a editada ou a foto; Delete photo… no botão direito do Edit;
   Delete edits… faz as miniaturas com ED voarem até a lixeira; miniaturas do Export com o recorte, inteiras na caixa 3:2.
   Depois (2026-11-10, protótipo "Recorte travado no Export" aprovado): o Framing da sessão (proporção, posição e
   alinhamento) fica travado no passo 1 enquanto ela tem foto editada ou está no Lightroom; destrava com Revert to
   original de todas as editadas. A lixeira do Export saiu (o Export não apaga fotos nem sessões); "Delete edits" virou
   "Revert to original" no Export. O passo 1 e o Align photos usam sempre as originais. O alinhamento vai para o
   Lightroom como recorte por foto (com ângulo) e as editadas voltam alinhadas; no Export elas só são redimensionadas.
   Inferência ainda sem teste no Lightroom real: o sentido do ângulo do recorte (CropAngle).
   Depois (2026-11-10, protótipo "Ajuste de recorte no Lightroom (R5)" e decisões do dono): o recorte ajustado no
   Lightroom com a mesma proporção (movido, redimensionado, girado) vira o alinhamento da foto no Stillpoint
   ("alignLr" em session.json: vale enquanto a foto tem editada; Revert to original e ⌘Z voltam ao de antes).
   Proporção trocada bloqueia o Export to Stillpoint (painel e File › Export) com um alerta e os botões OK e
   Put back the Stillpoint crop; sem tolerância, só a folga de 1 pixel do arredondamento. Editada que chega na
   pasta Edited com outra proporção (salva por fora do plugin) fica na pasta e não é usada, com aviso, triângulo na
   miniatura, linha no bloco Lightroom Classic e recado ao Lightroom (notice-*.txt). "As shot" sem alinhamento
   não é conferida. Apply photo edit to all não copia mais o recorte. O Stillpoint olha as pastas de Edited a
   cada 2 s para notar arquivos salvos por fora. Não coberto: foto girada 90° dentro do Lightroom.
   Inferências sem teste no Lightroom real: a leitura do recorte com precisão para conferir sem tolerância (o
   autoteste do plugin tem os casos), a seleção das fotos erradas e a janela do alerta desenhada pelo plugin.
   Autoteste do plugin ampliado (seção 9b: o caminho inteiro do recorte ajustado) e pedido pelo terminal
   (tests/lightroom/run_selftest.sh e .ps1: o arquivo selftest-request.txt na pasta da conversa dispara o teste).
   Autoteste no Lightroom de verdade (Mac, 2026-11-10, 141 de 142): a conferência de proporção sem tolerância
   funciona; o sinal do ângulo do recorte do Lightroom é o contrário do do Stillpoint (corrigido no plugin).
   Teste que junta o Stillpoint e o Lightroom de verdade (tests/e2e; decisões do dono de 2026-11-10): com
   STILLPOINT_E2E no ambiente, o app abre o projeto de teste só nessa rodada (settings.txt não muda), roda o roteiro
   tests/e2e/e2e.js dentro da página e manda comandos de teste ao plugin (TestCmd.lua, só em catálogo "Self-Test").
   O roteiro é conferido no Linux contra o Lightroom de mentira (tests/e2e/check_linux.py, 30 de 30).
   Rodou no Mac do dono com o Lightroom Classic 15.6 de verdade em 2026-11-10: 30 de 30.
   O alinhamento vindo do Lightroom fica enquanto a foto tem editada (não sai mais numa exportação sem recorte
   ajustado); sai quando a foto vai de novo ao Lightroom sem editada.
   Feito em 2026-11-06: bolinha âmbar pulsando nas miniaturas e na prévia grande das fotos que estão no Lightroom;
   a coleção do Lightroom refeita na ordem do Stillpoint quando uma foto volta; Delete edits e o ⌘Z dele em fila, na ordem.
6. **Etapa 21 — Alinhamento automático das fotos** (ordem do dono em 2026-11-13: 21 alinhamento, 22 outras marcas, 23 histórico, 24 celulares, 25 caixa; iniciada nesse dia. Posta como etapa pelo dono em 2026-11-11: é etapa do roadmap, não
   pedido solto; a estudar). Referência do dono: o Xangle Camera Server
   ("Easy camera alignment for bullet-time photography - no calibration bar required!",
   https://www.youtube.com/watch?v=eYGbaLTg2-8). O que o vídeo e a descrição dizem: 8 Canon SL1; uma primeira foto é
   mandada para a nuvem ("registration", ~25 s), que devolve arquivos de texto com a posição de cada câmera no espaço
   3D; depois o "alignment" corrige as imagens de qualquer disparo seguinte usando essas posições (registra uma vez,
   reaplica em todas as sessões enquanto o rig não muda). Como eles calculam por dentro não está dito no vídeo. O
   caminho conhecido para isso (inferência, não confirmado para o Xangle): achar pontos em comum entre as fotos e
   resolver a posição das câmeras (structure from motion; há bibliotecas abertas, como COLMAP e OpenCV), escolher um
   ponto central no sujeito e calcular, para cada câmera, o deslocamento, o tamanho e o giro que põem esse ponto no
   mesmo lugar. No Stillpoint o resultado caberia nos controles que o Align photos já tem (Move X, Move Y, Size,
   Rotate). Decisões pendentes do dono antes de qualquer desenho: rodar no computador ou em servidor; o que fazer em
   cena sem textura (fundo liso), onde esse cálculo falha; e se vale começar por uma versão mais simples (a pessoa
   marca o mesmo ponto em cada foto).
   **Decisões e contexto do dono (2026-11-13):** explorar primeiro o caminho do Xangle (pela cena), sem abrir mão da
   calibração por objeto de referência (os dois juntos; ele vê reaproveitamento da janela Camera settings). O rig é
   portátil e muda a cada montagem (cenário, altura), então a calibração é refeita sempre e tem de ser rápida. Ele
   está sem espaço e sem tempo para montar o rig e só tem 3 câmeras: os testes começam por cena virtual; depois, fotos
   de verdade com uma câmera só andando em arco em volta de um objeto parado.
   **Primeiro experimento (2026-11-13, `docs/estudos/alinhamento/`), cena virtual + COLMAP (aberto, BSD):** achou
   todas as câmeras e deu os quatro valores com erro abaixo de 1 px e 0,3° com 15° a 30° entre câmeras (3 a 18
   câmeras, arcos de 60° a 180°, também com fundo liso e só o sujeito com detalhe), em 4 a 25 s só com processador.
   Falhou com 3 câmeras a 60° uma da outra. Limite: a cena virtual é o melhor caso possível; falta foto de verdade.
   **Segunda rodada (2026-11-13), cena mais dura:** aguentou distorção de lente, ruído, pouca luz, desfoque, exposição e
   cor diferentes e erros de montagem 3x maiores (erro abaixo de 1 px). Piorou com lentes de zoom diferente entre
   câmeras (4 a 6 px; a distância focal gravada nas fotos de verdade deve ajudar, não testado) e com sujeito liso
   (até 11 px). **Falhou em estúdio com fundo e sujeito lisos** e com câmeras a 40° ou mais uma da outra. Conclusão
   provisória: o caminho pela cena é viável onde o lugar tem detalhe; o objeto de referência é necessário para
   estúdio. Biblioteca: COLMAP (BSD), pronto sem placa de vídeo para Mac Apple Silicon (21 MB compactado) e Windows
   x64 (24 MB); os instaladores do Stillpoint têm ~9 MB. A decidir: embutir, baixar no primeiro uso, ou escrever uma
   versão própria e menor; e a tela.
   **Objeto de referência (decisão do dono, 2026-11-13):** começar pela cartela que já existe (Calibrate with chart:
   4 marcas de posição conhecida, que o app já acha), **com alternativa para rig em 360° ou que pegue a parte de
   trás** (haste com marcas, cartela dobrada ou cubo: a definir). Terceira rodada do estudo, com o `Chart::Find` do
   app: quando acha as marcas, erro abaixo de 0,6 px e 0,3°, também em estúdio liso e com lentes diferentes. O
   detector de hoje, feito para a cartela grande na foto, perde câmeras de lado e erra a 5 m ou com desfoque; com as
   marcas 3x maiores na foto (procurar na foto inteira, ou imprimir maior) achou todas até 60° de lado. A fazer:
   detector para cartela pequena e de lado, e recusar marcas erradas em vez de devolver valores absurdos.
   **Decisão do dono (2026-11-13, depois do comparativo e da simulação da haste):** (1) agora: **haste com duas
   marcas** (referência vertical no centro; o alto e o baixo dão mover, girar e tamanho; serve para arco, 360° e
   parte de trás) **mais marcação na tela** (dois cliques por foto, em qualquer objeto reto; garantia e correção da
   detecção automática); (2) depois: **pela cena, sem objeto** (alinhamento sem objeto e base da vista 3D, da cena 3D
   e da interpolação; falta foto de verdade e decidir como a biblioteca entra); (3) fora: cartela plana para
   alinhamento (continua só para cor; o trabalho no detector dela fica cancelado) e cartela dobrada ou cubo (reavaliar
   se aparecer a necessidade de posição das câmeras em estúdio liso). Nota: "caminho do Xangle" foi um nome ruim do
   assistente; o Xangle usa a haste para mirar as câmeras e não diz como calcula. O cálculo pela cena roda no
   computador (medido), sem nuvem.
   **Marcas da haste (ideia do dono, 2026-11-13):** em vez de exigir uma marca, o app traz uma lista de objetos
   recomendados e ilustra como usar cada um. Para a detecção servir a todos: a pessoa clica nas duas marcas numa
   foto e o app procura nas outras; ela confere e corrige. Medido na cena virtual (quarta rodada do estudo): achou
   todas as câmeras com fita e bolas de cor viva (estúdio, lugar com detalhe, ruído, 5 m, 360°); a faixa impressa
   perdeu câmeras muito giradas, com confiança baixa (dá para recusar); fita de pouco contraste falhou em lugar com
   detalhe sem dar sinal. Quinta rodada, com o ponto levado ao centro da marca: fita, faixa impressa e bolas de cor
   viva com erro médio de 0,5 a 1,4 px e máximo de 0,9 a 2,7 px em fotos de 2400 px, em todos os cenários testados
   (mesma faixa da cartela e do cálculo pela cena). Fita de pouco contraste continua ruim.
   **Alturas diferentes (dono, 2026-11-14: é o mais comum no rig dele, por limitações técnicas):** com duas marcas,
   a câmera de cima ou de baixo vê a haste encurtada e o sujeito sai maior nela (até 42 px e 4,7% com ±50 cm a 3 m;
   perceptível a partir de ~±25 cm). Com **três marcas de espaçamento igual**, a perspectiva dá a distância
   verdadeira: 8 a 9 px e 0,6% a 0,8% nos mesmos casos. A 5 m a terceira marca quase não ajuda (o erro já é menor).
   **Decisão do dono (2026-11-14): sempre três marcas**, igualmente espaçadas. Falta: fotos de verdade. Protótipo da
   tela (2026-11-14, aguardando o dono): https://claude.ai/artifact/CK3EyFTDBzsPwDykXrt7tU (botão Align cameras na
   Camera settings; janela em três passos Prepare, Mark, Check, no formato do Match automatically). Depois: onde a
   receita é usada, quando pedir para alinhar de novo, receita do projeto ou do rig.
   **Decisões e observações do dono (2026-11-14), sobre o protótipo de alternativas
   (https://claude.ai/artifact/EoVDprHQcHHC7ZNZrbvjrr):**
   - Marcar em dois passos (jeito B: Prepare; Mark and check, com todas as fotos juntas).
   - O lugar que faz mais sentido para ele: dentro da tela do **Test shot**, com as instruções, repensando como
     essa tela funciona (a desenhar).
   - O lugar 2 (Align photos) não é "Align with a stick": é o programa tentar alinhar uma sessão já fotografada,
     como recurso extra para quem esqueceu de alinhar antes (cabe o cálculo pela cena, que já estava para depois).
   - Alinhamento não destrutivo: ao abrir o Align photos, os ajustes do alinhamento automático já estão nas fotos e a
     pessoa faz ajustes finos por cima; o app guarda o alinhamento original para desfazer os ajustes finos, e há
     outro botão para tirar todo o alinhamento.
   - Ele separou alinhamento físico (mexer na câmera: zoom, altura, inclinação) de alinhamento digital (os mesmos
     ajustes feitos na foto) e pediu a opinião do assistente sobre o app ajudar nos dois.
   - **Decisões do dono (2026-11-14, depois):** o app ajuda também no alinhamento físico (ciclo de mirar e disparar de
     novo pelo Test shot, com instruções por câmera: mira, giro, altura, distância ou zoom; só informa, não trava),
     e depois faz o alinhamento digital. Não destrutivo confirmado: as fotos originais ficam sempre preservadas e a
     pessoa pode ver as fotos sem os ajustes automáticos. Dado do dono: a SL3 e a T7 aceitam imagem ao vivo (e, pelo
     palpite dele, a maioria das Canon recentes), mas o recorte da imagem ao vivo muda em relação à foto: a mira ao
     vivo precisaria levar isso em conta (ideia para depois).
   - Protótipo do alinhamento dentro do Test shot (2026-11-14, aguardando o dono):
     https://claude.ai/artifact/F9c8TfFYXtYTnWSnDePKfx (Prepare; Mark and aim em três formas: V1 grade, V2 grade e
     lista, V3 uma câmera por vez; Save; Align photos com Back to automatic, Remove alignment e Show without alignment).
   - Pedidos do dono sobre o protótipo (2026-11-14): forma V2 (grade e lista) com tela cheia por câmera como a V3;
     botão para entrar no alinhamento assistido com imagem ao vivo nas câmeras que aceitam; o passo Save tem de
     aparecer de fato; o bloco do Align photos muito grande: compacto ou escondido num menu. Versão 2 do protótipo
     publicada no mesmo endereço (Live aim, tela cheia, passo Save com as fotos alinhadas e os valores, menu
     "Alignment · automatic" no Align photos).
   - Opção B do dono sobre a versão 2 (2026-11-14): o layout do Align photos ficou ruim, e ele deve ter dois cenários:
     usar o alinhamento já feito para aquele rig, ou correção automática com base na cena da própria sessão; a tela
     Mark and aim não é a melhor experiência, principalmente com tela cheia e Live aim; **Live aim só numa câmera por
     vez**. Versão 3 (alternativas visuais): https://claude.ai/artifact/MkM9L7Cv3xEKqqdTSRaVEN (Mark and aim A lista e vista grande, B fileira e vista grande, C guiado; Align photos A
     três opções no painel, B na barra da foto, C escolha ao entrar).
   - Decisões do dono sobre a versão 3 (2026-11-14): **Align photos, opção B** (seletor Alignment na barra em cima da
     foto: Rig, From this scene, None; Back to automatic ao lado). Mark and aim "está tudo certo", mas o guiado é que
     deve ser a tela cheia, com nome melhor, e ter um botão de tela cheia com escolha do monitor como o Live view.
     Protótipo: https://claude.ai/artifact/RxbBbJMeXj351jyao6KVxo ("Guided aim": janela própria, barra de opções do
     Live view com Window, Full screen, Always on top, Change display, e a escolha do monitor). Decisões do dono no
     mesmo dia: **Mark and aim na forma A** (lista à esquerda, câmera escolhida à direita), com a foto da câmera
     escolhida maior; **Live aim só dentro do Guided aim**. Versão 2 do protótipo publicada no mesmo endereço.
   - **Desenho da etapa 21 aprovado pelo dono (2026-11-14)**: Test shot (Align cameras: Prepare; Mark and aim forma A;
     Save), Guided aim em janela própria com Live aim, Align photos opção B.
   - **Receita guardada com o projeto** (decisão do dono, 2026-11-14, opção A), junto do estado do rig
     (`stillpoint-rig.json`); cada sessão guarda a receita que valia quando foi fotografada (refazer o alinhamento
     não muda as sessões antigas).
   - **Quando pedir para alinhar de novo** (decisão do dono, 2026-11-14, opção A): só quando o app perceber uma
     mudança (câmera entrou, saiu ou foi trocada; ordem mudou; zoom mudou). Aviso âmbar no Test shot com Align again;
     as câmeras que não mudaram continuam alinhadas, a que mudou fica sem alinhamento automático até refazer.
     Esbarrão no tripé não é detectado (conferência visual no Align photos).
   - **Ordem de implementação** (decisão do dono, 2026-11-14, opção A; branch `etapa-21-alinhamento`): 1 a conta
     dentro do app; 2 câmeras de mentira entregando fotos de uma pasta; 3 alinhamento no Test shot e receita
     guardada; 4 Align photos opção B; 5 aviso de alinhar de novo; 6 Guided aim e Live aim; 7 From this scene.
   - **Parte 1 feita (2026-11-14):** `src/gui/align_marks.h`/`.cpp` (achar as três marcas a partir dos cliques e
     calcular a receita e as instruções de cada câmera), teste automático `tests/host/align_marks_test.cpp`
     (cenário 20 do `run_tests.py`). Sem tela nova; nada para o dono testar. Detalhes em
     `docs/estudos/alinhamento/README.md`, seção "No app".
   - **Parte 2 feita (2026-11-14):** `STILLPOINT_FAKE_PHOTOS=<pasta>` junto de `STILLPOINT_FAKE_CAMERAS`: cada câmera
     simulada entrega uma foto de verdade da pasta (em ordem de nome; RAW e JPEG de mesmo nome juntos; a foto segue a
     câmera, não a posição). Vale para o disparo, o Test shot e o Match. Roteiro: `docs/teste-manual.md`, seção 46.
     Com `STILLPOINT_FAKE_PHOTOS=pole` (decisão do dono, 2026-11-14, opção A), as câmeras simuladas fotografam uma
     cena de mentira com a haste de três marcas (bolas vermelha, verde e azul), cada uma de um lugar do arco, em
     alturas, distâncias, miras e giros diferentes (`src/gui/fake_scene.*`): assim o fluxo do alinhamento é testado
     sem câmeras e sem fotos. **Regra do dono (2026-11-14):** todos os testes com objetos reais (câmeras, haste, fotos
     do rig) ficam pendentes até ele avisar que tem o material.
   - **Parte 3 feita (2026-11-15):** Test shot › **Align cameras** (Prepare; Mark and aim forma A; Save), como no
     protótipo aprovado. A conta é a da parte 1 (`alignMark`, `alignFind`, `alignSolve`, `alignSave` em `main_gui.cpp`;
     a página em `app.js`, seção "Alinhamento das câmeras"). O alinhamento fica em `stillpoint-rig.json`
     (`alignment`: data, e por câmera o número de série, as marcas e a receita em frações da foto); sem Project, só
     até fechar o app (a regra do estado do rig). Cada sessão nova do Project guarda no `session.json` o alinhamento
     que valia. Fora desta parte: **Guided aim** (parte 6) e o uso do alinhamento no Export (parte 4). Roteiro:
     `docs/teste-manual.md`, seção 47.
     Ajustes pedidos pelo dono em 2026-11-16: o cabeçalho "Camera settings" some durante o alinhamento; etiquetas de
     situação na lista; botão **Review alignment** no passo 2; cursor de link, ordem das marcas à direita da foto,
     cliques numerados e Ctrl/Cmd+Z; no passo 1, **Use the Test shot photos** para não fotografar duas vezes (opção
     C; alternativas em https://claude.ai/artifact/7kebj8FrYForRwNwbVCcFZ).
     Altura da câmera: sem centímetros, só "Higher/Lower than the others" (decisão do dono, 2026-11-16, opção C; o
     app não pede o espaço real entre as marcas). Zoom na foto grande do passo 2 (pedido do dono, 2026-11-16): roda
     aproxima em volta do mouse, espaço + arrastar desloca, como no Align photos do Export.
   - **Parte 4 feita (2026-11-16):** o Export usa o alinhamento da sessão. `session.json` ganha `alignMode` ("rig" ou
     "none"); a página (`app.js`, seção "Alinhamento automático no Export") transforma a receita de cada câmera nos
     quatro valores do Align photos e grava no `align` de sempre (o exportador, as prévias e o Lightroom não mudaram).
     Todas as fotos recebem o mesmo fator a mais de tamanho, o menor com que todas cobrem o canvas (assim nenhuma é
     ampliada sozinha). Align photos, opção B: seletor **Alignment** (Rig · data / None) e **Back to automatic**;
     **From this scene** entra na parte 7. Sessão com proporções misturadas em "As shot": o alinhamento só vale depois
     de escolher uma proporção (regra que já existia). Limite medido na cena de mentira: a marca do meio coincide
     (< 2 px); as de cima e de baixo ficam a até ~15 px entre câmeras em alturas diferentes (a haste aparece
     encurtada para quem olha de cima ou de baixo; mover, girar e mudar o tamanho não desfaz isso). Roteiro:
     `docs/teste-manual.md`, seção 48.
     Align photos › References (pedido do dono, 2026-11-16; revê a decisão de 2026-11-03): cada barra de opacidade
     mexe só na sua foto (a da Current photo não move mais as três) e as camadas seguem a ordem da lista (Previous
     photo por cima, a atual no meio, Next photo embaixo). Em aberto: o layout do bloco References, o nome "Rig" no
     seletor Alignment e o quanto o alinhamento automático corta das fotos.
     Corte do alinhamento (decisão do dono, 2026-11-16, opção B): o passo 3 Save do Align cameras e o Align photos
     dizem quanto das fotos sobra ("keeps N%"), com aviso em âmbar abaixo de 80%. Layout do References: alternativas
     em https://claude.ai/artifact/K4FPakGj6sZ3QJZcakjmmz; o dono preferiu manter o layout como estava (2026-11-17).
     Nome no seletor Alignment: fica "Rig · data" (decisão do dono, 2026-11-17, opção D).
     Fotos alinhadas: ficam ampliadas pelo fator comum, com o arquivo no tamanho de sempre (decisão do dono,
     2026-11-17, opção A). **Rever depois dos testes com o rig:** se houver perda de nitidez visível, encolher o
     canvas em vez de ampliar (mexe no exportador, nas prévias e no recorte que vai para o Lightroom).
     Printed bands (decisão do dono, 2026-11-17, opção C; protótipo https://claude.ai/artifact/SwAzzeseyCJTPtYMjg3aoL):
     o cartão ganha **Save bands (PDF)**; `src/gui/bands_pdf.*` grava a folha A4 (três faixas laranja de 4 x 18 cm e
     régua de 18 cm) na pasta escolhida. Pendente com objetos reais: conferir a medida impressa e se o app acha bem a
     cor impressa.
     Passo Prepare em dois grupos (decisão do dono, 2026-11-17, opção A; alternativas em
     https://claude.ai/artifact/Cc3RNVoQTJ6TNQKHsqu4dz): "1 · Something upright" (Stick or pole, Light stand) e
     "2 · Three marks on it" (Tape, Printed bands com o botão do PDF, Balls).
     Trocado no mesmo dia pelo layout B da mesma página: três objetos (Stick or pole, Light stand, Three balls) e,
     embaixo, a linha "No tape or balls? …" com **Save bands (PDF)**. Alinhamento sem haste (barra sem marcas, pessoa):
     fica para a parte 7, From this scene (decisão do dono, 2026-11-17).
   - **Parte 5 feita (2026-11-17):** o aviso de alinhar de novo. O programa compara o alinhamento guardado com as
     câmeras de agora (`alignCurrent` em `main_gui.cpp`): a mesma câmera (número de série), na mesma posição e com o
     mesmo zoom. O zoom vem da distância focal gravada nas fotos (EXIF do JPEG, `ReadPhotoFocal`), lida a cada Test
     shot e a cada sessão; só é comparado quando o alinhamento e a foto nova dizem a distância focal (sessão só em RAW
     ou lente manual: sem conferência de zoom). No Test shot, aviso âmbar "Align again · …" (zoom changed, moved, not
     connected, N new cameras). A sessão nova guarda só o alinhamento das câmeras que não mudaram. Para testar sem
     câmeras: `STILLPOINT_FAKE_FOCAL`. Roteiro: `docs/teste-manual.md`, seção 49. **Só com câmeras reais:** conferir
     que a distância focal das fotos muda mesmo ao girar o zoom e fica igual quando não se mexe.
   - **Parte 6a feita (2026-11-22), falta o ok do dono:** **Guided aim** numa janela própria, como no protótipo
     aprovado (`assets/ui/aim.html`, `aim.js`, `aim.css`; no `main_gui.cpp`, o bloco "Guided aim"). O botão fica
     embaixo da foto grande do passo Mark and aim. A janela mostra uma câmera por vez (nome, "Camera n of N", barra de
     progresso, imagem com as marcas e as setas, instruções em letra grande), tem a barra de opções da janela Live
     (**Display**: **Window** ou **Full screen**, **Always on top**, **Change display**, **Close**; escolha do monitor
     e **Identify displays**) e guarda a escolha em `settings.txt` (`aim=`). O estado é da página principal: ela
     manda o que a janela mostra (`aimPush`) e recebe o que a pessoa faz lá (`aimAction`).
     **Live aim** (uma câmera por vez, a da vez): o programa manda quadros (aviso `aimFrame`) com as marcas achadas
     pela mesma conta das fotos; as instruções mudam enquanto a câmera é mexida e a janela passa sozinha para a
     próxima câmera que precisa de ajuste quando a da vez fica boa por 1,2 s. **Nesta parte só as câmeras simuladas
     têm imagem ao vivo** (`STILLPOINT_FAKE_PHOTOS=pole`: a câmera simulada "vai sendo acertada" sozinha, e as fotos
     seguintes saem com o mesmo acerto; `STILLPOINT_FAKE_LIVE_STEP` muda a velocidade). Câmera sem imagem ao vivo: o
     botão mostra "No live image" e a janela usa a última foto (a pessoa mexe e usa **Fire again**).
     Escolhas feitas na implementação, **a confirmar com o dono**: (1) **Next camera** vai para a próxima que precisa
     de ajuste e a atual volta depois, se ainda precisar; **Skip this camera** faz o mesmo e a câmera não volta mais
     nessa rodada; (2) quando não sobra câmera para ajustar, a janela fica na última, com **Next camera** e **Skip
     this camera** apagados (sem tela de "terminou"); (3) depois de mexer numa câmera com o Live aim, **Review
     alignment** fica apagado até um **Fire again** (o alinhamento é guardado a partir das fotos, não da imagem ao
     vivo); (4) sem Live aim a janela não troca de câmera sozinha. Roteiro: `docs/teste-manual.md`, seção 51.
     Teste automático: cenário 23 do `run_tests.py` (o `webview.h` de teste passou a servir as janelas extras em
     `/w/<n>/`).
     Primeiro teste do dono no Mac (2026-11-22): abrir e a troca sozinha de câmera, ok. **Close e Esc não fecharam
     a janela Guided aim no Mac** (no teste automático fecham; causa ainda não achada). Enviado: o app esconde a janela
     sem depender do que ele achava do estado dela e escreve "Guided aim: window closed" no Activity, para saber se o
     pedido de fechar chega ao programa. Perguntas do dono, a decidir com protótipo: a cor do trecho da câmera da vez
     quando ela já está boa (hoje âmbar = a câmera na tela) e poder passar pelas câmeras depois que todas ficaram
     boas (hoje Next camera e Skip this camera ficam apagados).
     Segundo teste do dono no Mac (2026-11-22): **Close fecha a janela** (ok do dono). A causa era a condição "só
     esconde se estiver à mostra"; agora esconde sempre (a linha de conferência no Activity saiu). Pedido do dono: o
     botão **Guided aim** estava desalinhado (passava da borda da foto); a linha de baixo passou a ter a largura da
     foto e o botão termina na borda direita dela, como no protótipo.
     Para a parte 6b, dúvida do dono a conferir com as câmeras dele: se a imagem ao vivo só existe no modo de vídeo
     (com corte maior). Pelo que o agente sabe, o SDK entrega a imagem ao vivo no modo de foto, sem tirar fotos e sem
     o corte do vídeo; não verificado na SL3 nem na T7.
     Terceiro teste do dono no Mac (2026-11-22): o botão **Guided aim** alinhado à borda da foto, ok. A imagem ao
     vivo das Canon (modo de foto ou só modo de vídeo) fica pendente para testar com as câmeras (decisão do dono).
     Protótipo da barra de progresso e do fim da rodada, três formas (A como está; B a cor diz o estado, moldura na
     câmera da tela, Previous camera / Next camera; C abas com o número de cada câmera):
     https://claude.ai/artifact/QxY5PWtwBw19qaw49j3M7k. **Decisão do dono (2026-11-22): forma C com os botões da B.**
     Feito: uma aba por câmera com o número e o estado ("01 · READY", "02 · CHANGE"; verde, âmbar ou escura; a da tela
     cheia), um clique na aba leva à câmera; **← Previous camera** e **Next camera →** passam por todas, na ordem,
     dando a volta, sempre acesos; **Skip this camera** saiu; com todas boas, "All N cameras ready" no lugar de
     "Camera n of N". A janela só passa sozinha de uma câmera que precisava de ajuste e ficou boa (não tira a pessoa
     de uma câmera boa que ela veio conferir). Com isso caem as escolhas provisórias (1) e (2) da parte 6a; continuam
     a confirmar a (3) (Review alignment pede Fire again) e a (4) (sem Live aim não troca sozinha).
     Muitas câmeras (pedido do dono, 2026-11-22, para ver um caso extremo sem esperar): `STILLPOINT_FAKE_FIXED=odd`
     (ou `all`) faz essas câmeras simuladas começarem já acertadas e `STILLPOINT_FAKE_LIVE_STEP=1` acerta cada câmera
     no primeiro quadro. Quando o texto não cabe nas abas, fica só o número (a cor diz o estado; o texto aparece ao
     parar o mouse) e, se nem assim couber, as abas quebram em mais linhas: **escolha do agente, a confirmar com o
     dono**. Conferido com 24 e 64 câmeras simuladas. Correção junto: a câmera conta como mexida quando as marcas da
     imagem ao vivo saem de onde estão na foto (antes: de onde estavam no primeiro quadro, o que falhava quando o
     primeiro quadro já vinha diferente da foto).
     Pedido do dono (2026-11-22): a janela precisa servir a 100 câmeras ou mais, com navegação na linha das abas.
     Protótipo com três formas (A faixa que desliza com setas e "Next to change"; B páginas de 20; C mapa de todas as
     câmeras em cima da faixa): https://claude.ai/artifact/1fiehsxVk1ETk4J3oNTVWi. **Decisão do dono (2026-11-22):
     forma A quando as abas não cabem numa linha e forma C a partir de 50 câmeras.** Feito (`aim.js`, `fitTabs`): as
     abas cabem com o texto, como antes; não cabem, só o número; nem assim cabem, a faixa que desliza com **‹**, **›**
     e **Next to change · N left** (pula para a próxima câmera que precisa de ajuste); com 50 câmeras ou mais, a faixa
     e, em cima, o mapa de todas (um traço por câmera, clique leva à câmera, o trecho à mostra na faixa fica mais
     claro) e **Next to change** sem o número, como no protótipo. As abas em mais de uma linha saíram.
     `STILLPOINT_FAKE_CAMERAS` passou a aceitar até 200. Conferido pelo agente com 30 e 120 câmeras simuladas (setas,
     Next to change e clique no mapa); sem cenário no teste automático ainda.
     Teste do dono com 200 câmeras simuladas (2026-11-22): (1) o aviso "The cameras are not as this project left
     them" passava da janela com uma linha por câmera: a lista agora rola dentro da janela, com o título e os botões
     à vista (agrupar as linhas, por exemplo "196 new cameras", fica como opção para o dono); (2) o limite das câmeras
     simuladas subiu para 1000; (3) o app travava. Medido pelo agente no Linux de teste, com 200: **Use the Test shot
     photos** deixava a janela parada por até 12 s e a procura das marcas por até 10 s. Causa: a lista do Mark and
     aim usava a foto grande em todas as linhas e era redesenhada a cada foto que chegava. Corrigido: foto pequena na
     lista (a grande só na câmera escolhida) e um redesenho para as fotos que chegam juntas; as duas paradas caíram
     para 0,1 s. Esperas que continuam (a janela responde, mas demora): Test shot 41 s (nas simuladas é o tempo de
     desenhar as fotos de mentira) e a procura das marcas 23 s. Outros pontos de travamento no Mac do dono ainda não
     identificados. Em aberto, para o dono decidir: como mostrar o andamento nas esperas longas.
     (4) Pedido do dono: o mapa responder ao mouse. Protótipo com três formas (A lupa; B espiar o trecho; C grupos de
     10 com contagem): https://claude.ai/artifact/AeTytu59H6yshNcrWXDbmj. **Decisão do dono (2026-11-22): forma A,
     a lupa.** Feito: os traços perto do mouse crescem e a etiqueta diz a câmera ("Camera 142 · change"); o clique
     leva à câmera embaixo do ponteiro. Ajustes pedidos pelo dono no teste (2026-11-22): a lupa ficava deslocada do
     mouse (os traços cresciam e empurravam os outros); passou a ser uma lente em volta do ponteiro, em que o ponto
     embaixo dele não sai do lugar; ela abre e fecha com uma animação curta; clicar, segurar e arrastar no mapa vai
     passando pelas câmeras (no máximo uma troca a cada 150 ms).
     Mais dois ajustes do dono (2026-11-22): a lente segue o ponteiro com um pequeno atraso (movimento suave; a
     etiqueta e o clique continuam valendo para a câmera embaixo do ponteiro) e a curva ficou mais acentuada (pico
     mais alto e mais largo, e o resto do mapa apagado enquanto a lupa está aberta).
     Teste do dono (2026-11-22): a animação dos traços tremia. Causas prováveis (inferência): traços apertados a
     menos de 1 px na borda da lente e o brilho mudando em degrau. Refeito: a lente não aperta nenhum traço a menos da
     metade da largura, o brilho muda aos poucos, e cada traço é posto no lugar pelo `aim.js` (posição exata, sem a
     soma de arredondamentos da linha flexível). Falta o dono ver se parou de tremer.
     Pedido do dono: a marca do trecho à mostra no mapa não está boa. Protótipo com quatro formas (A moldura; B o
     resto apagado; C barra embaixo; D funil até as abas), todas com um traço branco na câmera da tela:
     https://claude.ai/artifact/Lh5LyHcYAyUrwd4F3cLR2L. **Decisão do dono (2026-11-22): A misturado com B.** Feito:
     moldura em volta do trecho à mostra, o resto do mapa apagado e o traço branco, mais alto, na câmera da tela.
     Gravação do dono (2026-11-22): a lupa ainda tremia. Causa vista na gravação: com a lente presa ao ponteiro, os
     traços ampliados corriam embaixo dele a cada pixel de movimento. Agora o centro da lente fica no meio do traço
     que está embaixo do ponteiro: parado ou dentro de um traço, nada se mexe; ao passar para o vizinho, um passo
     suave. Conferido pelo agente: ponteiro andando de meio em meio pixel, os traços só mudam na troca de traço.
     **Decisões do dono (2026-11-22):** mostrar o andamento nas esperas longas (a fazer, com protótipo antes); não
     juntar as linhas do aviso do rig; confirmadas as três escolhas provisórias do Guided aim: Review alignment
     apagado até um Fire again depois de mexer com o Live aim, a janela não troca de câmera sozinha com o Live aim
     desligado, e só sai sozinha de uma câmera que precisava de ajuste.
     Andamento nas esperas longas (decisão do dono de mostrar; pedido de protótipo em 2026-11-22, depois de notar
     que, após os três cliques, os botões ficam apagados sem nada indicando trabalho): três formas (A andamento
     embaixo da foto e a lista se preenchendo; B tela de espera por cima; C andamento no rodapé e a lista se
     preenchendo): https://claude.ai/artifact/74AVjy988SPv8aUfbEPuin. **Decisão do dono (2026-11-22): forma B.**
     Feito na procura das marcas: a tela de espera cobre o passo com "Finding the marks", a barra, "n of N photos" e
     o tempo estimado (`alignFind` manda o aviso `alignProgress` a cada foto). A fazer: a mesma tela nas outras
     esperas longas (Test shot / Fire again), que hoje não informam o andamento foto a foto.
     Visto pelo agente ao testar: com os três cliques fora das marcas, a procura cai no modo lento (a foto inteira)
     e, com 119 fotos, passou de 60 s; não há como cancelar. Em aberto.
     Teste do dono (2026-11-22): clicar na bola logo ao abrir o passo 2 não marcava. Causa: a tela era redesenhada a
     cada foto que chegava e o clique dado nesse meio tempo se perdia. Agora só a linha da câmera é atualizada.
     Lupa ainda tremendo (terceira tentativa): bordas e alturas dos traços em pixels inteiros da tela (os vãos
     escuros não mudam mais de brilho), curva de altura com o topo achatado (o traço do meio varia 1 px ao passar de
     um traço a outro, antes uns 6), a lente de volta a seguir o ponteiro de forma contínua (presa ao traço dava
     anda-e-para), ampliação na largura menor (2,9x) e etiqueta de largura fixa. Falta o dono ver.
     Segunda gravação do dono (2026-11-22, arrastando no mapa): ainda sem fluidez. Visto quadro a quadro e medido
     pelo agente: (1) com a largura ampliada, os traços corriam para trás embaixo da lente enquanto ela andava; (2) a
     moldura do trecho dava passos para a frente e para trás, porque saía dos traços deslocados pela lente; (3) a
     marca branca da câmera e a faixa de abas só andavam quando a página principal respondia (a cada 150 ms), aos
     pulos; (4) o traço branco somava altura ao pico. Refeito: os traços não mudam mais de largura nem de lugar (só
     crescem e acendem em volta do ponteiro); a moldura sai direto da posição da faixa de abas; arrastando, a marca
     branca, a faixa e a moldura acompanham o ponteiro na hora, e o pedido de troca de câmera segue atrás; trocar de
     câmera não refaz mais as abas nem o mapa. Medido num arrasto simulado: a moldura e a marca só andam para a
     frente, em passos iguais. Falta o dono ver. A lupa deixou de alargar os traços (era o desenho do protótipo A):
     se o dono quiser a largura de volta, o preço é o movimento dos traços embaixo da lente.
     O dono testou de novo (2026-11-22): ainda tremendo (sem gravação desta vez). Hipótese do agente, pelas duas
     gravações (quadros repetidos a cada poucos quadros): a janela não dava conta de refazer tudo a cada quadro. A
     cada movimento do mouse o `aim.js` media a tela e reposicionava os 200 traços, e a cada movimento da faixa lia a
     posição das 200 abas. Refeito: as medidas são tiradas uma vez (`mapMeasure`); mexer o mouse muda só a altura (por
     escala) e o brilho dos traços perto da lupa (uns 25), e mexer a faixa só faz contas com as medidas guardadas.
     Não confirmado: se era essa a causa. Se continuar, pedir gravação.
     **Causa do tremor achada (2026-11-22):** o dono disse que só os traços altos tremiam ao se mover. Medindo a
     altura de cada traço quadro a quadro, todos os traços altos alternavam entre dois valores (40 e 36,7 px) a cada
     quadro: um erro na conta da animação de abrir a lupa (com ela toda aberta, fechava um pouco e abria de novo a
     cada quadro). O erro existia desde a primeira versão com animação; as tentativas anteriores mexeram em outras
     coisas. Corrigido; medido depois: cada traço sobe e desce uma vez só, e parado não varia. Junto: a altura deixou
     de ser arredondada para pixels inteiros e o alvo da lupa ganhou folga de 2 px (o tremor da mão não mexe a lupa).
     **Testes do dono no Mac (2026-11-22), ok:** arrastar no mapa; clicar nas bolas logo ao abrir o passo 2; a tela
     de espera "Finding the marks"; o aviso do rig com muitas câmeras; a faixa de abas sem o mapa; Live aim off e
     Fire again com Review alignment; tela cheia, Esc, reabrir e Cancel. Defeito achado por ele: com menos de 50
     câmeras (faixa sem o mapa) as setas ‹ › ficavam apagadas, porque as medidas da faixa só eram tiradas com o mapa
     à mostra. Corrigido.
     Tela de espera (forma B) também nas fotos: no **Test shot** simples e no **Fire** / **Fire again** do Align
     cameras, "Taking a photo with each camera" e depois "Receiving photos" com a barra, "n of N photos" e o tempo
     que falta (avisos `waitingDownloads` e `downloadProgress`, que já existiam). O Match automatically continua com
     as mensagens dele.
     **Ok do dono (2026-11-22): a lupa parou de tremer.** A largura ampliada (protótipo A) saiu numa das tentativas;
     pode voltar se o dono quiser (decisão em aberto).
     **Ok do dono (2026-11-23):** a tela de espera no Test shot e no Fire, e as setas ‹ › da faixa.
     **Câmera desconectada no meio do uso** (pergunta do dono, 2026-11-23). Conferido pelo agente com câmeras
     simuladas (novo `fakeUnplug`, só para teste; com câmeras de verdade não foi conferido):
     Camera settings: a linha da câmera some da tabela, o Activity avisa "… turned off or disconnected. Turn it on to
     reconnect.", o Test shot dispara as que sobraram; ao religar, a linha volta.
     Align cameras (passo 2): a tela não muda nem avisa; a câmera continua na lista com a foto antiga. No Fire again
     ela some da lista, aparece o aviso "The rig is not the one of this project · X not connected", e dá para rever e
     guardar o alinhamento só com as que sobraram, sem nenhum aviso de que falta uma. Em aberto para o dono.
     Match automatically (passo 1): a tela não muda; o mesmo aviso do rig; "Take the test shot" continua aceso.
     Não conferido: desconectar durante as fotos ou durante o Match em andamento; o Guided aim aberto.
     Protótipos pedidos pelo dono (2026-11-23) para as duas decisões em aberto:
     largura da lupa, para experimentar com o mouse (A só altura, como está; B o dobro; C quase quatro vezes):
     https://claude.ai/artifact/Q58PvpBQb6cGLZr472Pz4h; procura das marcas demorada (A cancelar; B conferir os
     cliques antes; C aviso quando passa do tempo): https://claude.ai/artifact/UrVgmhWvSS5zbjkxAoV7AR.
     **Decisões do dono (2026-11-23): lupa B; procura demorada B e C.** Feito:
     Lupa: os traços do meio com o dobro da largura (em volta apertam até uns 0,7; fora da lente nada sai do lugar).
     Conferir antes (B): o `alignMark` devolve "distinct" (as marcas de cima e de baixo têm cor própria na foto,
     `AlignMarks::Distinct`); se não têm, o passo 2 mostra embaixo da foto "These do not look like the three marks",
     com **Click again** e **Search anyway**, e a procura não começa.
     Aviso de demora (C): na tela de espera, depois de 6 s andando a menos de 2 fotos por segundo, aparece "This is
     taking longer than usual…" com **Click the marks again** (para a procura, novo `alignStop`, e desfaz as marcas)
     e **Keep waiting**. Conferido pelo agente com 40 câmeras simuladas: cliques na parede dão o aviso B; Search
     anyway chega ao aviso C; Click the marks again volta aos três cliques; cliques nas bolas não dão aviso nenhum.
     A conferir com material de verdade: marcas brancas ou cinza caem no aviso B mesmo estando certas.
     Teste do dono (2026-11-23): não conseguiu fazer o aviso de demora aparecer. Causa provável: no Mac dele a
     procura lenta anda a mais de 2 fotos por segundo (ou termina antes dos 6 s), e a regra dependia da velocidade do
     computador. Regra nova: depois de Search anyway (procura lenta sabida) o aviso aparece aos 3 s, em qualquer
     computador; na procura normal continua a regra dos 6 s a menos de 2 fotos por segundo.
     **Ok do dono (2026-11-23):** o aviso de demora aparece e Click the marks again volta aos três cliques.
     Pergunta do dono: com 200 fotos reais e as marcas clicadas errado, demora muito? Medido pelo agente (uma foto
     de mentira de 24 MP, neste computador, sem contar abrir o JPEG): 0,7 s por foto com os cliques certos e 1,3 s
     com os cliques na parede; em 4 fotos de cada vez, 200 fotos dariam cerca de 35 s e 65 s, mais o tempo de abrir
     cada arquivo. Com fotos reais não foi medido. Visto na medição: com os cliques numa parede lisa a procura
     "acha" as marcas com nota alta em qualquer lugar parecido (o aviso de conferência é o que segura esse caso).
     Janela Live com 200 câmeras (pedido do dono, 2026-11-23): os pontos se sobrepõem. Protótipo com quatro formas
     (A pontos pequenos; B várias fileiras; C grupos de 10; D traços), todas com o arco usando a largura da janela:
     https://claude.ai/artifact/4sKverwaWBpEuz5hkf1Dtf. Fora do escopo da etapa 21 (é da janela Live); entra aqui
     porque veio do teste com muitas câmeras.
     **Decisão do dono (2026-11-23): forma A.** Feito em `assets/ui/live.js` (`layoutRig`, `rigPoints`) e
     `live.css`: enquanto as bolinhas de 30 px cabem sem encostar, nada muda; quando não cabem, o desenho (Arc,
     Circle ou Line) passa a usar a largura da janela, com as câmeras a distâncias iguais; se ainda assim não cabem
     com número, viram pontos encolhidos até caberem, com os números por fora (a primeira e as de 10 em 10), e só
     a câmera que dispara cresce (28 px) e mostra o número. Escolhas do agente dentro da forma A, a confirmar no
     teste: no meio do caminho (por exemplo 24 câmeras) as bolinhas continuam com número, só que no desenho largo;
     nos pontos, a próxima câmera a disparar fica com a borda âmbar contínua (o tracejado não se vê num ponto); no
     Circle, o número da última câmera não aparece quando cairia em cima do "1".
     **Outros pontos do teste com 200 câmeras (dono, 2026-11-23):**
     (1) Timing › Custom: clicar, segurar e arrastar por cima dos números marca (ou desmarca) todas as câmeras do
     caminho, conforme o primeiro número ficou. Feito em `assets/ui/app.js` (`chipPaint*`); um clique sozinho e o
     teclado continuam valendo. Teste automático: cenário 25.
     (2) Três telas que não aguentavam muitas câmeras, com protótipos A/B/C em
     https://claude.ai/artifact/RyoUatEdQ53ATz6Rd253W8. **Decisões do dono (2026-11-23)**, feitas:
     janela Live tocando a sequência, **forma B**: quando as miniaturas não cabem a pelo menos 40 px cada, aparecem
     só as vizinhas da foto atual (até quatro de cada lado, 84 px), com o número embaixo e "1 ‹" / "› n" nas pontas
     (`live.js` `renderPlayback`, classes `win` e `film-win`);
     barra de baixo da janela Live durante o disparo, **forma A**: com as rodadas a menos de 30 px, traços e números
     só na primeira câmera e de 10 em 10 (de 20, 50... se nem assim cabem), mais o traço âmbar da próxima
     (`renderBar`, classe `main`);
     Timeline do Bullet time, **forma A**: quando as etiquetas se sobrepõem mesmo em duas alturas, viram uma faixa
     do primeiro ao último disparo com um traço fino por disparo e os números em cima onde cabem, também na linha
     pequena com o Advanced fechado (`app.js` `renderTimeline`, classe `band`).
     Com poucas câmeras as três telas não mudam. Testes automáticos: cenário 24.
     (3) Timing › Custom, arrastar um passo com muitas câmeras (gravação do dono, 2026-11-23): cada passo ficava
     mais alto que o painel e não dava para chegar no outro. Feito (escolha do agente, a confirmar no teste):
     enquanto um passo é arrastado, todos encolhem para uma linha com o resumo ("44 cameras · 1–44"), e a lista
     rola sozinha perto das bordas; ao soltar, os números voltam (`stepPointerMove`, `stepAutoScroll`, classe
     `reordering`). Linha pequena da Timeline em faixa: mais folga em cima e embaixo (pedido do dono).
     (4) Timing › Custom com muitas câmeras, pedido do dono (2026-11-23): com mais de 44 câmeras, os números de
     cada passo começam recolhidos em duas fileiras, com o botão "··· Show all N" (vira "Show less") e o resumo do
     passo ao lado; a troca é animada, e ao arrastar um passo todos recolhem com animação em vez de sumir de uma
     vez. Escolhas do agente a confirmar: o limite de 44, as duas fileiras, o botão por passo (não um para todos)
     e os passos abertos valerem só até fechar o app.
     O dono não gostou desse layout do passo (2026-11-23). Protótipos de quatro layouts (A só o resumo, B campo
     para digitar, C etiquetas por faixa, D barra do rig) em https://claude.ai/artifact/KGyGwghckyJ4u1dD6bNVrx,
     **decisão do dono (2026-11-23): forma D**, feita. Com mais de 44 câmeras, cada passo é uma barra que representa
     o rig inteiro (o trecho do passo aceso, o que já está em outro passo mais claro), com números de referência
     embaixo, quantas câmeras ao lado e o botão "▾ Grid" / "▴ Hide grid", que abre ou fecha a grade dos números com
     animação; a grade começa fechada. O "··· Show all" saiu. Ao arrastar um passo, as grades abertas fecham com
     animação e a barra continua à vista. Corrigido junto: o resumo de câmeras não seguidas dizia "12 cams" e
     agora diz quais ("150, 160–170"; aparece ao parar o mouse na barra). A barra só mostra; não é clicável.
     Teste 23 (forma D no Mac, câmeras simuladas): ok do dono em 2026-11-23. Falta o Windows.
     **Ok do dono em 2026-11-23 (Mac, câmeras simuladas):** teste 19 (janela Live em pontos), teste 20 (miniaturas
     vizinhas, barra do disparo de 10 em 10, Timeline em faixa), teste 21 (arrastar passo e folga da régua
     pequena), arraste por cima dos números no Custom, e os restos do teste 17 (aviso "These do not look like the
     three marks" e lupa com o dobro da largura). Falta tudo isso no Windows.
     **Câmera do rig não conectada no Align cameras (decisão do dono, 2026-11-23): avisar, sem bloquear.**
     Protótipo aprovado ("Prossiga") e implementado: https://claude.ai/artifact/6X6iFqbvU3bE9LSMc8Uimp (no passo 2 a câmera continua na
     lista com "Not connected"; no passo 3 ela aparece na grade como "No alignment", com aviso âmbar e o botão
     "Save without it"). Verificado no código: `alignSave` grava só as câmeras com foto e substitui o alinhamento
     inteiro, então o alinhamento anterior da câmera que falta é apagado.
     Como ficou (`app.js`, `al.gone`): contam como "não conectadas" as câmeras que tiraram foto nesta janela e
     sumiram no "Fire again" (as do alinhamento guardado saíram disso em 2026-11-23, ver o segundo teste real); a que
     volta e tira foto sai da lista. O rodapé do passo 2 soma "· 1 not connected", o item não pode ser escolhido,
     e a Activity registra em âmbar qual ficou sem alinhamento. `alignCurrent` passou a devolver a posição
     ("order") da câmera em "changes". Não coberto: câmera desligada com a tela do passo 2 aberta, antes do
     "Fire again", continua na lista como estava (ela ainda tem foto e marcas daquela rodada). Não verificado: o que
     acontece quando a câmera que cai é a da foto onde as marcas foram clicadas. Teste automático:
     cenário 26. Teste do dono pendente.
   - **Parte 6b, feita no código em 2026-11-23, sem nenhum teste com câmera** (só o dono consegue testar; o
     processo da câmera, `src/worker`, nem compila no ambiente do agente: só a sintaxe foi conferida com um
     cabeçalho de mentira). Como ficou:
     protocolo (`include/worker_protocol.h`): ordens `live on <arquivo>` e `live off`, resposta `liveresult`, aviso
     `livefail`. O processo da câmera liga o visor para o computador (`kEdsPropID_Evf_OutputDevice`, e antes o
     `Evf_Mode` se o Live View estiver desligado no menu), pede um quadro a cada ~150 ms (`EdsDownloadEvfImage`) e
     grava o JPEG num arquivo (escrito ao lado e trocado de uma vez); desliga sozinho antes de qualquer `shoot`
     (espera 0,4 s para o espelho descer), ao sair, e se os quadros param de vir (20 falhas seguidas).
     Coordenador (`CameraFleet::SetLive`) e app (`main_gui.cpp`, `aimRealJob`): o `aimLive` de uma câmera de
     verdade responde `{ ok, starting }` e o resultado vem no aviso `aimLiveResult`; o app lê o arquivo quando ele
     muda, procura as marcas e manda o mesmo `aimFrame` das simuladas. Sem quadro em 12 s, avisa e desliga. Na
     janela, o botão diz "Starting live image…" enquanto liga (texto novo, escolha do agente). Depois do "Fire
     again", o Live aim volta sozinho. O Activity registra o tamanho do primeiro quadro e qualquer erro, com o
     código do SDK.
     **A descobrir no primeiro teste real:** se liga no modo de foto (dúvida do dono: só no de vídeo, com corte);
     o tamanho e a proporção do quadro; se as marcas são achadas no quadro (ele é bem menor que a foto); se a
     diferença entre quadro e foto faz a câmera contar como "mexida" sem ter sido (limite de 0,006 em `gaFrame`).
     **Primeiro teste real do dono (Mac, 2026-11-23, SL3 + T5 + T7): o Live aim funcionou** ("da forma como você
     pediu"). Do Activity dele: a imagem ao vivo ligou nas três câmeras, com o primeiro quadro em 0,8 s (SL3), 1,3 s
     (T5) e 1,4 s (T7); quadros de 960 x 640 (SL3) e 1056 x 704 (T5 e T7), 3:2 como a foto. A dúvida "só no modo
     de vídeo?" fica respondida pelo fato de ter ligado no fluxo normal do Test shot (o dono não disse em que modo
     as câmeras estavam; a confirmar). No mesmo log: "marks not found in the photo of T5_1 (no match)" na procura
     das marcas nas fotos; não se sabe ainda se as marcas foram achadas na imagem ao vivo nem se alguma câmera
     contou como "mexida" sem ter sido. Falta o Windows.
     Aviso "The rig is not the one of this project" (pedido do dono no mesmo teste: com o projeto de 200 câmeras
     simuladas e 3 reais ligadas, a lista de 200 nomes cobria a tela): até três câmeras continuam uma a uma; mais
     que isso vira a contagem e as três primeiras ("200 cameras not connected (SL3_1, T7_1, SL3_2 and 197 more)"),
     no aviso e no Activity. Visto no log e não mexido: a linha desse aviso sai duas vezes seguidas no Activity.
     **Segundo teste real do dono (Mac, 2026-11-23, gravações e capturas), com um brinquedo de três cores no lugar
     da haste e as câmeras em ângulos bem diferentes:**
     (a) **o Live aim, como está, não serve** (palavras do dono: erra muito a posição mesmo com tudo parado). Visto
     na gravação: na T5 as marcas caem perto do brinquedo mas tremem (os números das instruções mudam a cada
     quadro); na SL3 as marcas foram postas no rádio e no cartaz ao fundo, longe do brinquedo, com confiança
     suficiente para passar. Na captura do passo 2 a procura nas FOTOS também pôs as marcas da Camera 02 no rádio
     e no cartaz, e numa câmera deu "Marks not found". Ou seja: a procura (`AlignMarks::Find`), ajustada só com as
     fotos simuladas da haste, erra em cena de verdade. **Em aberto; próximo passo: estudar com as fotos e os
     quadros reais** (`STILLPOINT_KEEP_LIVE=1` guarda quadros em "<pasta de dados>/Live debug", com o que a procura
     achou no nome; o Activity agora diz onde as marcas foram clicadas).
     **Procura nova, "cores em fila" (2026-11-23), feita com 82 quadros ao vivo reais que o dono mandou** (T5, SL3
     e T7; um suporte com três panos: vermelho, amarelo e branco, diante de um cartaz vermelho, tijolos cinza e um
     rádio). `AlignMarks::FindByColorLine`: acha as manchas da cor de duas marcas que têm cor própria e, para cada
     par possível, compara a fila de cores ao longo da reta entre elas (marca, haste, marca, e um pouco além) com a
     da foto de referência; ganha o par de fila mais parecida. A terceira marca vem do mesmo lugar da fila (se não
     tem cor própria, procurada em volta pelo trecho haste + marca). Vale quando pelo menos duas das três marcas
     são coloridas; senão continua a procura antiga. Medido nos 82 quadros (referência: um quadro da T5): antes,
     confiança 0,19 a 0,46 e marcas no cartaz, no rádio e na borda da imagem; agora, confiança 0,80 a 0,95, as
     três marcas sobre o suporte nas três câmeras, variando 1 a 4 px de um quadro para outro, em ~50 ms por quadro
     (antes ~300 ms). A marca branca fica 20 px de lado na T7 (parede clara atrás). Junto: marca sem cor própria
     fica onde a pessoa clicou (levá-la "ao centro" tirava o ponto do lugar); o aviso "These do not look like the
     three marks" não aparece mais quando duas das três são coloridas; na imagem ao vivo, as marcas são a média
     com os quadros anteriores enquanto o ponto não sai do lugar (`gaFrame`). Os testes da haste simulada
     continuam passando (26). As imagens do dono não estão no repositório (são da casa dele). **Não testado ainda
     com as câmeras, nem com fotos inteiras reais (só quadros ao vivo).** Limites conhecidos: o suporte dele não
     tem as marcas a distâncias iguais, e a conta de distância e altura (`Solve`) supõe distâncias iguais; marca
     branca ou cinza é a mais fraca das três.
     **Terceiro retorno do dono (2026-11-24):** a procura nova "funcionou direitinho"; o suporte era um improviso
     (pedestal de microfone, dois panos e uma meia) e o objetivo é o alinhamento valer com fundos e contrastes
     variados. O "Review alignment" não abria: com câmera de verdade, as marcas da imagem ao vivo nunca coincidem
     com as da foto no limite de 0,6% da largura, então toda câmera contava como "mexida" para sempre, mesmo depois
     do "Fire again". Corrigido em `gaFrame`: com câmera de verdade a imagem ao vivo é comparada com ela mesma (o
     terceiro quadro depois da foto vira o ponto de partida; mexida = sair dali mais de 0,8% da largura, ou o
     ponto de partida já estar a mais de 3% da foto). Com câmeras simuladas a regra antiga continua. Sem teste com
     câmera ainda. Pergunta do dono em aberto: deixar a pessoa mudar o limite de confiança da procura (opinião do
     agente: não; decisão dele).
     **Quarto retorno do dono (2026-11-24, gravação do Export):** as fotos alinhadas pelo rig ficaram piores que
     sem alinhamento. Visto na gravação: a marca do meio no mesmo lugar e a haste em pé nas três fotos, mas o
     TAMANHO diferente em cada uma (a haste com cerca de 150, 112 e 160 px na prévia). Causa conferida com as
     marcas dos quadros dele: `Solve` tira o tamanho da distância verdadeira, calculada pela perspectiva supondo as
     três marcas a distâncias iguais; no suporte improvisado a do meio está a 43% do caminho, e a conta dava uma
     câmera 21% maior quando o comprimento visto difere só 8%. Corrigido: `EvenlySpaced` (a marca do meio a menos
     de 6% do meio em todas as câmeras); se não, o tamanho de todas vem do comprimento com que cada câmera vê a
     haste, e a altura não é estimada. Com haste de marcas iguais nada muda (testes da haste simulada passam, mais
     4 novos). Sem aviso na tela de que as marcas são desiguais (pendência para o dono). Rolagem de lado na coluna
     de sessões do Align photos do Export: corrigida (CSS).
     **Pedido do dono (2026-11-24): o botão do Test shot é sempre "Align cameras"** (antes virava "Align again"
     com alinhamento guardado). Com alinhamento já guardado no projeto, uma janela avisa antes de abrir: "This
     project already has an alignment", com a data, o que mudou nas câmeras desde então (se mudou) e "Cancel" /
     "Align cameras" (`alAskOpen`). A nota ao lado do botão ("Cameras aligned · data" ou "Align again · o que
     mudou") não foi mexida. Teste automático no cenário do Align cameras.
     Aviso de marcas a distâncias desiguais: protótipo (formas A e B) em
     https://claude.ai/artifact/NGyWUTCHV74amd7xaeZFHG, aguardando a escolha.
     **Ideias do dono (2026-11-24), em aberto:** (i) no passo 3 do Align cameras, tocar a sequência já alinhada e
     ajustar cada foto na mão como no Align photos do Export: protótipos (formas A e B) em
     https://claude.ai/artifact/DFQfxaDaE4zkSAd3dxcM6S, aguardando a escolha; (ii) guardar um rig (alinhamento)
     para reutilizar em vários projetos, hoje não existe (o alinhamento fica no projeto e cada sessão guarda a
     cópia do que valia quando foi fotografada); (iii) o aviso de marcas desiguais: o dono quer saber quanto isso
     prejudica antes de decidir se é faixa ou janela. Os testes automáticos continuam sendo relatados sempre.
     **Decisões do dono (2026-11-24, segunda leva):**
     passo 3 do Align cameras, **forma B** (vira a tela do Align photos, com "Play the sequence"), ainda não
     implementada; antes, o dono pediu mais na tela do Align photos (aqui e no Export): o "+" no meio do canvas
     ligado de início, poder escondê-lo, esconder os cabos e o que está fora do canvas, e uma barra de ferramentas à
     esquerda (Pointer como hoje, Move the photo, Rotate, Scale, Move the view). Protótipo (guias na barra, forma
     A, ou num bloco View, forma B) em https://claude.ai/artifact/2LGwvBxnrqEi5NncN8NeuN, aguardando a escolha;
     aviso de marcas desiguais: **faixa, forma A**, feita (`alUneven`, `alUnevenNote`; passos 2 e 3; teste
     automático no cenário 27);
     ordem: **parte 7 (From this scene) antes do rig reutilizável**.
     **Proporções misturadas (ideia do dono, 2026-11-24, em aberto):** deixar de permitir fotos em proporções
     diferentes na interface; a pessoa escolhe uma proporção e o app mostra sempre as fotos nela, com as originais
     guardadas como já se faz na pasta Originals. Levantamento de onde isso mexe: ver a resposta do agente dessa
     data (lista de sessões, fileira de fotos, aviso depois do disparo, Export em cinco pontos, Lightroom, Align
     cameras, Test shot, session.json). Nada decidido nem feito.
     **Decisões do dono (2026-11-24, terceira leva):**
     tela do Align photos: as guias ficam na barra (forma A do protótipo anterior), mas a barra tem de ficar DENTRO
     da foto grande e se esconder como o Activity na tela cheia (some e volta quando o mouse chega perto), com uma
     indicação de que está ali, e as guias têm de se distinguir das ferramentas. Protótipos (guias A/B/C; barra
     escondida D/E) em https://claude.ai/artifact/EQZuntMLJS7WH3vQwrjB3W, aguardando a escolha.
     Resposta do dono: guias na mesma barra (forma C), mas não gostou do desenho; barra escondida, não gostou de
     nenhuma. Variações (guias C1 a C4; escondida H1 a H4) em https://claude.ai/artifact/31cTyv5ew52R1pwdgYV941,
     aguardando a escolha.
     Proporções misturadas, respostas do dono: a proporção é escolhida uma vez (ele acha que talvez não seja "por
     projeto", porque depende das câmeras e das configurações delas); o app pergunta na primeira vez que as
     câmeras fotografam em proporções diferentes; tem de dar para mudar depois em algum lugar (a definir) e
     continua dando para mudar na exportação; as sessões já feitas não mudam; a opção "As shot" some. Ainda é uma
     etapa futura, não começada.
     Escolha do dono: guias na forma C3 (faixa à esquerda do botão) e barra escondida na forma H4, com uma seta
     apontando para a direita no lugar dos três pontos. **Feito (primeira parte, só no Align photos da
     exportação):** barra dentro da foto grande, à esquerda, com cinco ferramentas (seta, que é o padrão e age como
     antes; mover a foto; girar; mudar o tamanho; mover a vista) e duas guias (cruz do centro; moldura e alças).
     Os botões só têm ícone, com o texto ao parar o mouse; a barra aparece quando o
     mouse chega à borda esquerda da foto e some 0,7 s depois de sair; escondida, sobra uma aba com a seta. A
     ferramenta e as guias ficam guardadas entre fotos e sessões do app. Sem a guia da moldura, somem a
     moldura, as alças e o que sobra da foto fora do canvas. Girar com a ferramenta de girar pode aumentar o Size
     (regra que já existia: a foto girada cresce para continuar cobrindo o canvas). Teste automático: cenário 28.
     Retorno do dono (2026-11-24) e ajustes feitos: a barra começa a sumir assim que o mouse sai da área dela
     (sem espera) e some mais devagar (0,5 s); aparece com o mouse na borda esquerda da foto ou na área dela; a
     aba da seta ganhou um brilho verde; linhas dos ícones mais finas; ícones das guias centrados no espaço à
     direita da faixa; a ferramenta de girar usa o mesmo cursor da alça de girar; movendo a foto o cursor é o de
     quatro setas (não a mão); com a seta, em cima da foto aparece o cursor de mover e fora dela o da mão.
     Consequência do último pedido, para o cursor não mentir: com a seta, arrastar FORA da foto agora desloca a
     vista (antes movia a foto de qualquer lugar). O dono foi avisado; se não quiser, volta.
     Segundo retorno do dono (2026-11-24, duas gravações) e o que foi feito: (1) diminuir a foto travava antes do
     limite (um passo que passasse do limite era recusado inteiro): agora vai até o menor tamanho que ainda cobre
     o canvas; (2) o cursor mudava durante o redimensionar com a seta: fica o de redimensionar enquanto o botão
     está apertado; (3) atalhos das ferramentas: V seta, M mover a foto, R girar, S tamanho, H mover a vista, Z
     zoom (letras escolhidas por mim, as do Photoshop onde há igual; o dono pode trocar); (4) ferramenta de zoom
     nova: clique aproxima 1,5× em volta do ponto, Alt + clique afasta; (5) Ctrl (ou ⌘) + roda move a foto para
     cima e para baixo; com Alt junto, para os lados. ABERTO: com o espaço segurado, o cursor pisca durante o
     arrasto (gravação 1). Hipótese não confirmada: no Mac, cada repetição da tecla esconde o cursor até o mouse
     se mexer; se for isso, o conserto é na parte nativa do Mac.
     Terceiro retorno do dono (2026-11-24) e o que foi feito: (1) caixas de número do This photo: só entram
     algarismos, uma vírgula ou ponto e o menos no começo (o menos fica porque Move X/Y e Rotate têm valores
     negativos); caixa vazia confirmada = 0 (Size: 100, ou o menor que ainda cobre o canvas); clicar seleciona o
     número inteiro; Esc desiste; (2) espaço segurado: a mão fecha ao arrastar; para o pisca, tentativa na parte
     nativa do Mac (NativeWindow::QuietSpaceRepeat: as repetições do espaço não chegam à página enquanto ele
     está segurado), ESCRITA SEM COMPILAR NO MAC e com a causa ainda como hipótese; (3) zoom: segurar e
     arrastar (direita aproxima, esquerda afasta) com a lupa sem sinal; Alt troca o cursor na hora; (4) a pinça
     do trackpad chegava como roda + Ctrl e movia a foto: agora só move com a tecla Ctrl de verdade apertada, e
     a pinça dá zoom; (5) com o botão apertado, o cursor do gesto vale na tela toda.
     Quarto retorno do dono (2026-11-24) e o que foi feito: (1) Ctrl ou ⌘ + roda desloca a VISTA (para cima e
     para baixo; com Alt, para os lados), não a foto (eu tinha entendido errado o pedido anterior); (2) ao
     apertar um atalho o cursor sumia até mexer o mouse: confirma que o Mac esconde o cursor a cada tecla; o
     programa agora pede o cursor de volta nos atalhos desta tela (NativeWindow::ShowCursor, não compilado aqui);
     (3) ferramenta nova, atalho A: como a seta, mas só as alças funcionam (cantos = tamanho, alça de cima =
     giro); arrastar em outro lugar não faz nada. Nome provisório "Handles only"; o dono pediu sugestões de
     nome para ela e para a "Pointer" (decisão pendente); (4) a barra fica centrada na altura, à esquerda.
     Decisão do dono (2026-11-24): os nomes são "Select" (V) e "Direct select" (A), com o mesmo ícone de seta,
     cheia numa e vazada na outra. O cursor continuava sumindo ao apertar um atalho (gravação): o pedido de
     mostrar o cursor chegava antes de o sistema escondê-lo; passou a ser repetido 30, 90 e 200 ms depois.
     Decisão do dono (2026-11-24): a ferramenta que vem escolhida é sempre a Direct select, e volta a ela toda
     vez que se entra no Align photos (a ferramenta deixou de ser guardada; as guias continuam guardadas). A seta
     cheia do Select ficou sem contorno e um pouco menor, para parecer do mesmo tamanho da vazada.
     Falta: o passo 3 do Align cameras virar este editor (forma B), com Play the sequence.
     **Testes com câmeras de verdade (2026-11-24, Mac, SL3 + T7 + T5), feitos pelo dono:** roteiro 1 (janela "This
     project already has an alignment" e botão sempre Align cameras): ok. Roteiro 2 (câmera faltando: Not
     connected, Save without it, volta ao normal): ok. Correções do cursor no Mac (pisca com o espaço e sumiço
     nos atalhos): ok. Faltam os roteiros 3 (Review alignment depois do Fire again), 4 (marcas desiguais) e 5
     (resumo do aviso do rig, com câmeras simuladas), e tudo no Windows.
     Roteiro 3 (Review alignment bloqueia com a câmera mexida e libera depois do Fire again; o Live aim volta
     sozinho): ok. Dois pedidos do dono nesse roteiro, feitos: a bolinha do "● Live aim on" é vermelha; a lista
     de câmeras do passo 2 fica sempre na ordem do rig (antes vinham primeiro as com mais ajustes, e com o Live
     aim a lista se reordenava enquanto ele mexia na câmera).
     Roteiro 4 (suporte de marcas desiguais, capturas do dono): faixa âmbar com "42% of the way"; nenhuma
     instrução de altura; Review alignment e Save funcionaram; no Align photos com o alinhamento do rig o Size
     ficou 132,5 (T5, 5184 px), 127,1 e 125,6 (as de 6000 px) e o suporte coincide nas três fotos (leitura minha
     das capturas; o dono não soube confirmar sozinho). "Keeps 50% of the photos": as câmeras estavam fora da
     mira (Move Y até 777 px, instruções "Turn 2° right, 5° up" não seguidas), e o corte compensa isso.
     **Dúvida do dono, decisão pendente:** com Alignment "None", fotos de câmeras com resoluções diferentes
     (5184×3456 e 6000×4000, a mesma proporção) não ficam do tamanho do canvas: o canvas é a área comum em
     pixels do original, então a foto de 6000 px a 100% sobra e é cortada no centro (mostra 86% do que a de
     5184 px mostra). Proposta a decidir: igualar pelo tamanho (a foto maior reduzida para caber no canvas).
     Roteiro 5 (resumo do aviso do rig, 12 câmeras simuladas e depois 4): "8 cameras not connected (SL3_3, T7_3,
     SL3_4 and 5 more)": ok. A linha saía duas vezes no Activity, uma em vermelho (o aviso registrava por conta
     própria e o programa registrava de novo): corrigido, fica uma linha só, âmbar.
     **Feito (2026-11-24): arrastar os pontos achados (ajuste fino), item (i) abaixo.** No passo 2, na foto grande,
     cada um dos três pontos pode ser arrastado; fica exatamente onde é solto (sem encaixe automático) e só a
     conta daquela câmera muda. Para não entrar em conflito com a busca automática: a foto de referência da
     busca e as outras fotos não são tocadas; os pontos achados pelo programa ficam guardados, e "Back to
     automatic" (ao lado da foto, com a etiqueta "Adjusted by hand") devolve os três; Ctrl+Z desfaz o último
     arrasto; uma busca nova (Fire again, ou marcar as três de novo) substitui o ajuste. Um clique parado em
     cima de um ponto não começa uma marcação; fora dos pontos, o clique continua começando. Escolhas minhas,
     que o dono pode mudar: os textos ("Fine-tune", "Adjusted by hand", "Back to automatic"), a distância de
     14 px para pegar um ponto, e o ajuste se perder no Fire again. Teste automático: cenário 29.
     Retorno do dono sobre o ajuste fino (2026-11-24): não gostou do desenho da coluna à direita nem das
     instruções do Guided aim ("muito amador"): protótipos F1 a F4 e G1 a G4 em
     https://claude.ai/artifact/Ny8SkEjc9hJqxN4JCfoRS1, aguardando a escolha. Feitos na hora: Ctrl+Shift+Z refaz
     o arrasto; o espaço segurado no passo 2 recebeu o mesmo conserto do cursor do Align photos (Mac). EM
     ABERTO: na gravação do passo Edit do Export, a foto 03 (T5) aparece mais ampliada; medida minha na
     gravação: o suporte tem 225, 210 e 255 px de comprimento nas fotos 01, 02 e 03. Causa não determinada
     (falta saber qual Alignment estava escolhido e os Size de cada foto).
     Escolhas do dono (2026-11-24): ajuste fino na forma F3 (painel dos pontos), FEITO: uma linha por ponto com
     o estado e a volta de cada um (↺), "Back to automatic" para os três, ponto à mão em âmbar na foto. Guided
     aim na forma G2 (instrumentos), mas quer variações e saber se é responsivo; e pediu para melhorar também as
     instruções embaixo da foto do passo 2. Protótipos G2a a G2d, janela estreita e larga, e U1 a U3 em
     https://claude.ai/artifact/SNMLhTGQy9K9qhBWxHu5kz, aguardando a escolha.
     Escolhas do dono (2026-11-24): G2a no Guided aim, com Previous camera / Next camera embaixo da imagem; U2
     embaixo da foto do passo 2, com o botão Guided aim mais bem colocado. FEITO: instrumentos (Aim, Level, Size,
     Height), o mesmo desenho nas duas telas, que se mexem com a câmera ao vivo (o texto antigo continua na
     página, fora da vista, para leitores de tela e para os testes); Previous / Next embaixo da imagem, da
     largura dela; no passo 2, o nome da câmera e o Guided aim na mesma linha e os instrumentos em duas colunas
     na largura da foto (escolha minha para o lugar do botão; o dono só disse que estava mal colocado). Pedido
     novo, FEITO: com o Live aim desligado, ou numa câmera sem imagem ao vivo, a janela Guided aim mostra "Fire
     again", que tira uma foto nova com TODAS as câmeras (não existe disparo de uma câmera só no Align cameras)
     e atualiza os instrumentos. Height: passou a aparecer sempre (igual, mais alta/baixa, ou "Not estimated"
     quando as marcas não têm distâncias iguais); antes só aparecia quando havia diferença.
     Correção pedida pelo dono (2026-11-24): o "Fire again" da janela Guided aim dispara SÓ a câmera que está na
     tela. Feito com um disparo com plano de uma câmera (takeOrderPhotoOf): a foto nova entra na sessão do Test
     shot no lugar da antiga daquela câmera, as fotos e as marcas das outras ficam como estão, e as marcas são
     procuradas de novo só nela. O "Fire again" da janela principal continua disparando todas. Não testado com
     câmeras de verdade (só simuladas).
     Teste do dono com câmeras (2026-11-24): o Fire again de uma câmera só funciona. Pedido dele, feito: o
     clarão do disparo aparece na janela Guided aim (em cima da imagem), não na principal; e a janela principal
     deixa de mostrar o andamento desse disparo ("Bullet time complete" no Activity).
     Decisão do dono (2026-11-24): as setas laranjas em cima da foto (passo 2 do Align cameras e janela Guided
     aim) saíram: atrapalhavam, e os instrumentos já dizem para que lado. O clarão na janela Guided aim: ok.
     Investigação da foto 03 mais ampliada (2026-11-24): (a) no roteiro 4 (pontos automáticos, as mesmas três
     câmeras) medi nas capturas do dono a haste igual nas três fotos, dentro de 2%; (b) li o caminho todo do
     tamanho (conta das marcas, receita do rig, Align photos, prévia do Edit, exportação): tudo em pixels do
     original de cada foto, sem diferença entre as telas; (c) a sessão com o defeito (24 Nov 20:43:24, fotos RAW
     .CR3/.CR2) foi feita depois de o dono ajustar pontos à mão. Hipótese mais provável, NÃO confirmada: os
     pontos de cima e de baixo ficaram em lugares diferentes da haste em cada foto (é a distância entre eles que
     decide o tamanho). Para confirmar, o Align photos passou a registrar nos detalhes técnicos do Activity uma
     "Rig alignment check": por câmera, a foto em que foi alinhada, a foto da sessão, as três marcas, a haste e a
     "aligned pole" (haste × tamanho), que tem de ser igual em todas. Aguardando a captura do dono.
     CAUSA ACHADA (2026-11-25, números do "Rig alignment check" do dono): depois do ajuste à mão a marca do meio
     ficou a 46,3%, 45,6% e 47,2% do caminho nas três câmeras, ou seja, dentro dos 6% que o programa aceita como
     "distâncias iguais". Ele então usou a conta completa (a de marcas iguais), que lê o desvio do meio como
     perspectiva, e deu tamanhos 1,0000 / 0,9535 / 1,1787: haste alinhada de 1520, 1447 e 1701 px (12% e 18% de
     diferença, o que bate com o medido na gravação). Com os pontos automáticos o meio dava 42 a 43%, caía na
     conta pelo comprimento, e saía certo (roteiro 4). Não é resolução (alinhada e fotografada no mesmo tamanho)
     nem erro de tela. O limite de 6% não separa um suporte de marcas desiguais de um efeito de perspectiva.
     Decisão do dono (2026-11-25): opção 1, o programa pergunta à pessoa se as marcas estão a distâncias iguais
     (deixa de adivinhar pelo limite de 6%). Protótipos de onde a pergunta fica (M1 cartões no passo 1, M2
     seletor no rodapé do passo 1, M3 pergunta no passo 2 com o valor medido) em
     https://claude.ai/artifact/VEcsBntJrQNU4c72JAhJ6a, aguardando a escolha.
     Escolha do dono (2026-11-25): M1. FEITO: no passo 1, "Your marks" com dois cartões (Equal distances, o que vale
     sem resposta; Not equal), guardado com o projeto (campo alignMarks do arquivo do rig). A conta obedece à
     resposta (AlignMarks::Solve com spacing); o limite de 6% só vale quando ninguém disse. Com "Equal distances"
     e fotos que mostram a marca do meio a mais de 6% do meio, uma faixa âmbar avisa que a resposta não combina
     com as fotos e manda voltar ao passo 1; o programa não troca a conta sozinho. Com "Not equal", a faixa
     lembra o que muda e o Height diz "Not estimated".
     Folha das faixas (PDF), retorno do dono: a instrução mandava medir "entre os centros das faixas", que não
     têm marca de centro. Agora a régua é o espaço vazio entre uma faixa e a seguinte, de borda a borda, com um
     desenho no pé da folha; e ao salvar o PDF ele abre (antes só mostrava a pasta).
     Teste do dono com câmeras (2026-11-25, Mac): Your marks com "Not equal", tamanhos iguais no Align photos e o
     PDF abrindo ao salvar: "tudo certo".
     Item (ii), lugar do botão Align cameras: protótipos P1 (botão no rodapé do Camera settings), P2 (texto no
     rodapé, junto de Calibrate with chart) e P3 (painel Cameras da janela principal) em
     https://claude.ai/artifact/5J28vhRwouPL4dv3BTycfc, aguardando a escolha.
     Escolha do dono (2026-11-25): P3. FEITO: botão "Align cameras" no painel Cameras da janela principal, depois
     de "Reorder by photo"; abre a janela do alinhamento direto no passo 1, sem Test shot (o "Use the Test shot
     photos" só aparece quando há fotos de teste); Cancel ou Save alignment voltam para a janela principal. O
     botão do alto do Test shot continua existindo (pendente: o dono decidir se fica ou sai). Cenário 30.
     Decisão do dono (2026-11-25): um caminho só para o Align cameras. FEITO: saiu o botão do alto do Test shot e,
     com ele, o "Use the Test shot photos" do passo 1 (não há mais como chegar ao alinhamento com fotos de teste
     na tela; o Fire da janela faz as fotos). No Test shot ficou só o estado do alinhamento ("Cameras aligned ·
     data" ou "Align again · …"). Os testes automáticos passaram a abrir o alinhamento pela janela principal.
     Pedidos novos do dono, com protótipos em https://claude.ai/artifact/KN4Eg5XTWwuNZBhF1ptwxT aguardando a escolha: (a) na
     menor largura da janela os três botões do painel Cameras não cabem (C1 só ícones, C2 nomes curtos, C3
     segunda linha, C4 um botão e um menu); (b) o Download wait é um recurso antigo e chama atenção demais no
     Bullet time (D1 dentro do Advanced, D2 linha discreta embaixo do botão, D3 nas preferências do programa).
     Escolhas do dono (2026-11-25): painel Cameras na forma C1 (só ícones), em qualquer largura; faltam os ícones
     de Reorder e Align (opções R1 a R4 e A1 a A4 em https://claude.ai/artifact/Y74xpH5CLxiiefX6QE597c, aguardando). Download wait
     na forma D3, FEITO: saiu do painel Bullet time (ficam Countdown e Sessions) e está em Settings › Advanced, com
     a explicação; continua guardado com o projeto. Retorno do dono, FEITO: a janela "This project already has
     an alignment" aparecia com o Camera settings por trás; agora aparece em cima da janela principal e o Camera
     settings só abre, por baixo do alinhamento, quando a pessoa confirma. Testes do dono (Mac): Align cameras
     pela janela principal ok.
     Escolha do dono (2026-11-25): ícones R1 (duas setas) e A3 (cantos de visor com cruz). FEITO: os três botões do
     painel Cameras são só ícone, em qualquer largura, com o nome ao parar o mouse (e para leitores de tela).
     Texto do Download wait corrigido depois da dúvida do dono: no código a espera é o TOTAL da sessão (do fim dos
     disparos até a última foto chegar), não por câmera; como as câmeras baixam ao mesmo tempo, mais câmeras não
     pedem mais tempo. As câmeras simuladas não usam essa espera (por isso 300 simuladas não falharam).
     Escolha do dono (2026-11-25, "1 + 3"), FEITO no código, AGUARDANDO TESTE COM CÂMERAS: (1) o Download wait
     passa a ser o tempo máximo SEM CHEGAR NADA; enquanto as fotos continuam vindo, o app continua esperando. Para
     isso o processo de cada câmera avisa quando uma foto começa a vir ("photostart") e, no máximo duas vezes por
     segundo, que ela continua vindo ("photopart", pelo acompanhamento de download do SDK da Canon); o
     coordenador zera o relógio a cada aviso desses, a cada disparo e a cada foto pronta. Só na janela: a versão
     de terminal não mudou. (3) Quando o tempo acaba mesmo assim, faixa âmbar "Some photos did not arrive in time.
     Nothing arrived for N sec." com o botão "Change Download wait", que abre Settings › Advanced com o campo
     pronto para digitar; com câmera caída, a faixa diz qual foi e não oferece o ajuste. NÃO VERIFICADO pelo
     agente: a parte do processo da câmera não compila no ambiente do agente (só conferência de escrita com um
     SDK de mentira) e as câmeras simuladas não usam essa espera; depende do teste do dono no Mac e no Windows.
     Retorno do dono (2026-11-25, Mac, câmeras reais): (a) o texto "Cameras aligned · data" ao lado de Hide photos
     no Test shot não faz mais sentido, já que o Align cameras saiu dessa janela. FEITO: o texto saiu; o aviso
     âmbar "Align again · ..." (câmeras mudaram desde o alinhamento) continua ali, PENDENTE de decisão do dono.
     (b) Com Download wait em 1 ou 2 s e 3 sessões o programa se comportou de forma estranha (miniaturas que
     pareciam corrompidas, etiqueta "missing"). EM INVESTIGAÇÃO, aguardando os registros do dono. Hipótese (não
     verificada): entre o disparo e a câmera oferecer a foto não chega nada, e esse intervalo pode passar de 1 a
     2 s; a sessão para e as fotos chegam depois, com a sessão já fechada.
     CAUSA ACHADA nos registros do dono (2026-11-25): não era o Download wait. Em RAW + JPEG cada disparo manda
     dois arquivos, mas o programa contava um por disparo: a sessão "terminava" com os JPEG, a sessão seguinte
     disparava com os RAW ainda vindo (os RAW contavam como fotos dela), e a terceira encontrava as câmeras
     ocupadas ("Camera is busy", etiqueta missing). Defeito antigo, de qualquer valor de Download wait, que só
     aparece com RAW + JPEG e mais de uma sessão (ou plano com mais de um disparo por câmera). CORRIGIDO no código,
     AGUARDANDO TESTE: o processo da câmera lê a qualidade antes do plano e avisa quantos arquivos cada disparo
     manda; o coordenador espera todos. Os registros também confirmaram que os avisos novos de foto chegando
     ("photostart"/"photopart") funcionam com as câmeras reais no Mac.
     Testes do dono (Mac, câmeras reais, 2026-11-25): RAW + JPEG em 3 sessões e a espera nova com Download wait
     em 1 e 2 s: ok. Decisão do dono: o aviso âmbar "Align again · ..." do Test shot FICA. Pedido: um caminho dali
     para realinhar; protótipos N1 a N4 em https://claude.ai/artifact/91Kz6vJUt5bRsTp87RpNfi. Escolha do dono: N4. FEITO, AGUARDANDO
     TESTE: faixa âmbar acima das fotos do Test shot (etiqueta Align again, a explicação inteira e o botão Align
     cameras, que faz a mesma pergunta do botão da janela principal e, ao sair, volta para o Camera settings).
     Teste do dono (Mac): faixa Align again ok. Teste automático completo: 538 de 538.
     Câmeras desconectadas no meio do Align cameras, conferido pelo agente com câmeras simuladas (2026-11-25):
     quando caem, a janela não muda (passo 1 continua "4 cameras" e Fire aceso; no passo 2 a lista continua
     igual); com todas caídas, Fire e Fire again não fazem nada e não avisam; a câmera só aparece como Not
     connected depois de um Fire again; o aviso do rig fica em cima da borda do rodapé da janela. Protótipos em
     três partes (D1/D2 uma câmera cai; E1/E2 todas caem; T1/T2 o aviso do rig):
     https://claude.ai/artifact/X9w1VSLjnvcszJuEezPZ4W. Escolha do dono: D2, E2 e T2. FEITO, AGUARDANDO TESTE
     (conferido só com câmeras simuladas): a câmera que cai fica apagada na lista na hora (Not connected · Turn it
     on to reconnect) e uma faixa âmbar no alto diz qual foi; ao religar volta sozinha, com as fotos e marcas que
     tinha. Enquanto está desligada fica fora da contagem, do Review e do Save (como a que some num Fire again).
     Sem nenhuma ligada: faixa e rodapé "No camera connected", Fire / Fire again apagados. O aviso do rig não
     aparece com o Align cameras aberto (a linha continua indo para a Activity). Acrescentado pelo agente, A
     CONFIRMAR com o dono: a câmera que sumiu num Fire again e depois foi religada aparece como "No new photo ·
     Connected again: fire again to include it" (antes continuava dizendo Not connected mesmo ligada).
     Pergunta do dono: alinhar sem as marcas, por um objeto ou pessoa da cena. É a parte 7 (From this scene), já
     prevista, a fazer antes do rig reutilizável.
     **Decisões do dono no meio dos testes (2026-11-24), a fazer DEPOIS dos roteiros:** (i) arrastar os pontos
     que o programa achou, de um jeito que não entre em conflito com a busca automática e que deixe refazer a
     busca; (ii) o botão Align cameras não deve depender do Test shot: protótipos com as posições no Camera
     settings; (iii) câmeras desligadas no meio do Align cameras (gravação: passo 2 abre vazio, sem explicação,
     por "Use the Test shot photos" sem câmera ligada; o aviso do rig cobre os botões de baixo): protótipos.
     Depois disso volta-se ao passo 3 do Align cameras como editor.
     (b) Os botões da janela Guided aim subiam e desciam quando o número de instruções mudava: o espaço das
     instruções passou a ser fixo (seis linhas).
     (c) "Camera 03 / Camera 04 · Not connected" apareciam sem nunca terem sido ligadas: vinham do alinhamento
     guardado (de outro rig). Agora só conta como não conectada a câmera que tirou foto nesta janela e sumiu.
     (d) Depois do "Fire again" a foto grande ficava preta até clicar numa miniatura: a foto chegava para uma
     moldura que já tinha sido redesenhada; agora vai para a que está na tela.
     Teste automático: o cenário do Guided aim falha de vez em quando na rodada completa, cada vez numa
     verificação diferente, e passa sozinho (visto antes e depois da parte 6b); é corrida de tempo do próprio
     teste, ainda não corrigida.
     Não feito: desligar a imagem ao vivo sozinha depois de um tempo (ela esquenta o sensor e gasta bateria);
     hoje ela desliga ao fechar a janela, ao trocar de câmera, ao desligar o Live aim e antes de disparar.
   - **Modo de teste das etiquetas (pedido do dono, 2026-11-17):** `STILLPOINT_FAKE_TAGS=1` põe etiquetas de mentira
     ao lado do nome das câmeras simuladas no Camera settings (a 1ª sem nenhuma, a 2ª com uma, a 3ª com duas...),
     para ver a tela com muitos avisos. Não muda nada com câmeras reais.
     Muitos avisos numa câmera (decisão do dono, 2026-11-17, opção B; alternativas em
     https://claude.ai/artifact/XDVoFje2iTamQK3kD6NwCR): ao lado do nome ficam as etiquetas normais (MF) e o primeiro
     aviso; os outros vão para um contador âmbar ("+3") que abre a lista inteira com o mouse em cima, um clique ou o
     foco do teclado (`csNameTags` em `app.js`).
     Revisto em 2026-11-22 (opção C de https://claude.ai/artifact/7zL3tujfWfq5k4K12ZXQcf): nenhuma etiqueta de aviso
     fica à vista; a câmera com um ou mais avisos mostra um único alerta (triângulo âmbar) que abre a lista. O "MF"
     continua ao lado do nome (não é aviso); o "AF" âmbar e o "always 16:9" das simuladas vão para a lista.
7. **Etapa 22 — Outras marcas de câmera (Sony, Nikon).** Posta como etapa pelo dono em 2026-11-11 (antes estava em
   "Futuro"). Viável marca a marca, com câmera para testar. Sony (site oficial, conferido em 2026-10-15): SDK
   gratuito, Windows 11 x64 e macOS 14.1+, cerca de 35 modelos recentes (α1, α9 II/III, α7 IV/V, α7R IV/V, α7S III,
   α7C/C II/CR, α6700, FX3/FX30/FX2, ZV-E1, ZV-E10 II...); modelos antigos comuns (a6000 a a6600, α7 III) ficam de
   fora; exige o firmware mais recente. A lista exata de configurações por modelo está no manual do SDK (não lido).
   Nikon (site oficial, conferido em 2026-10-15): um SDK por modelo (D300 a D850, Df, Z5, Z6/6 II, Z7/7 II, Z8, Z9;
   Z6 III e Z50 II não aparecem). **O SDK de controle remoto só controla uma câmera por vez** — bloqueia o bullet
   time com várias Nikon. No Mac com Apple Silicon, os módulos rodam pelo Rosetta 2 (o Stillpoint é só Apple
   Silicon: precisaria de um programa auxiliar). Junto: **Pesquisar a libgphoto2** (biblioteca aberta, várias
   marcas via PTP/USB) como alternativa a um SDK por marca. Pontos a verificar: suporte no Windows e precisão do
   disparo sincronizado.
8. **Etapa 23 — Histórico de edição permanente.** Pedido do dono (2026-11-01): um histórico no estilo
   do painel History do Lightroom Classic, **vinculado ao projeto** (o projeto faz o papel do catálogo
   do Classic: o histórico mora na pasta dele, vai junto se a pasta for movida e só existe com um
   projeto aberto; sessões fora de projeto ficam só com o Desfazer de hoje), organizado por sessão e
   sobrevivendo ao fechar o app: cada ação (entrar/sair do projeto, ordem das fotos, apagar/restaurar, rótulo, exportação) vira
   um passo com data; dá para voltar a qualquer passo, não só ao último (o Desfazer de hoje vive só
   na memória da sessão aberta). Decisões pendentes do dono: onde aparece (janela Project, botão
   direito da sessão, painel próprio), se voltar a um passo cria um passo novo (como no Lightroom) ou
   apaga os seguintes, e o que fica fora (ex.: mudanças de câmera).
9. **Etapa 24 — Bullet time com celulares (Android e iPhone).** (Adiada pelo dono em 2026-11-13, depois do estudo: muito custosa; fica antes do modo caixa.) Pedido do dono (2026-11-01): usar
   celulares como câmeras do rig, junto ou no lugar das Canon. Um app companheiro no celular (ou a
   página Live servida na rede local, se a câmera do navegador bastar) recebe o plano de disparo do
   Stillpoint pelo Wi-Fi, dispara no instante combinado e manda a foto de volta; o Stillpoint trata o
   celular como mais uma câmera (ordem, Identify, sessão, exportação). Decisões pendentes do dono:
   app nativo ou navegador; sincronia de relógio aceitável entre os aparelhos; se a foto volta em
   JPEG/HEIC ou também em RAW (DNG) nos aparelhos que permitem; mistura com as Canon na mesma sessão.
   Depende de medir a precisão de disparo pela rede antes de desenhar a interface.
   **Objetivo dito pelo dono (2026-11-13):** bullet time acessível, com os celulares que a pessoa já tem, porque várias
   câmeras profissionais custam caro. Ideia dele: o Stillpoint cria um servidor na rede local e os celulares entram
   por um endereço (QR Code na tela, com o endereço embaixo), sem loja de aplicativos. Em estudo: limites, bônus e
   ônus desse caminho e dos outros (app nativo, vídeo sincronizado, cabo), antes de qualquer decisão. Conferido em
   2026-11-13: a câmera pelo navegador só funciona em página segura (HTTPS ou localhost), não em http://192.168...;
   o programa de desenvolvedor da Apple custa US$ 99 por ano e sem ele não há App Store nem TestFlight.
   **Estudo de 2026-11-13 (resumo):** caminhos: página no navegador (sem loja; exige HTTPS; menos qualidade e
   controle), app nativo (qualidade e sincronia melhores; iPhone previsível, Android por lista de compatibilidade,
   porque o fabricante expõe só parte da câmera aos apps), vídeo sincronizado por um sinal comum, Android por cabo
   (descartado). Estimativa, não medida: 3 a 5 semanas de conversa para a página completa, 2 a 3 meses para os dois
   apps. Recomendação registrada: medir primeiro com uma página de teste (resolução, controles, diferença de tempo).
10. **Etapa 25 — modo caixa de disparo (sempre a última).** O app usa a caixa (ESP32 + um canal
   por câmera, já desenhada em `docs/hardware/caixa-de-disparo.pdf` e `hardware/trigger-box/`)
   para disparar: o plano do Timing/Sweep vai para a caixa (PLAN/GO), que dispara com precisão
   de milissegundos; o USB fica só para configurações e fotos. Depende do protótipo de 2 canais
   testado em hardware.
11. **Etapa futura (muito depois, só com o projeto maduro) — distribuído por rede.** Vários
   computadores pequenos, cada um com 3–4 câmeras, ligados por Ethernet a um "chefe" que coordena
   e junta as fotos (modo "trabalhador" e modo "chefe" no Stillpoint). É o desenho dos rigs de
   20–100 câmeras.

Junto com essas etapas (sem etapa própria):
- **Live, parte 3:** a página Live servida na rede local (TV com navegador, tablet).
- **Medir o menor intervalo do Sweep por USB** — **medido em 2026-10-21** (SL3 + T7 + T5, um
  processo por câmera): o limite não é o USB, é a câmera: ela recusa ("busy") uma nova foto
  0,9 s depois da anterior e aceita a 1,8 s. Entre câmeras diferentes, 0,3 s funcionou; 0,1 e
  0,15 s ainda não foram testados com 9 câmeras. **Resolvido em 2026-10-22 (ver as decisões logo abaixo; não há
  pendência aqui):** aviso na Timeline, **não insistir** no "busy", Sweep e One after another num modo só, download
  adiado. Reconfirmado pelo dono em 2026-11-11, depois de ver o protótipo de insistir: fica como está. Com a caixa de disparo (hoje etapa 25) o
  limite entre câmeras deixa de existir; o da mesma câmera, não.
  **Decisões de 2026-10-21 (noite), branch `sweep-limite`:** (C) "One after another" e "Sweep"
  viraram um modo só, **Sweep** — intervalo livre a partir de 0,05 s, atalhos 0,1 / 0,2 / 0,3 /
  0,4 s, direção e loops; `settings.txt` antigo (`seq`, ou `sweep` com `sweep`/`sweepDirection`)
  é convertido ao abrir. (A) Aviso na Timeline, em qualquer modo, quando uma câmera repetiria a
  menos de 1,8 s da própria foto anterior ("Camera 8 would shoot again 0.6 s…"); só interface,
  conferido aqui com 9 câmeras simuladas (plano e aviso; ver teste-manual seção 18). (B)
  "Insistir no busy" fica para depois da medição: `SdkMultiprocTest --repeat N --gap MS [--retry]`
  mede o limite real da câmera e o atraso de insistir (teste-manual seção 22). Dado do teste de
  2026-10-21: o "problema" sentido no Sweep com 3 câmeras era este limite (Sweep 0,3 s × 3
  câmeras = a mesma câmera de novo a 0,9 s).
  **Medição de 2026-10-22 (T7, RAW, teste-manual seção 22):** o limite da câmera é **~0,95 s**
  (aceitou a 2ª foto 929 ms depois da 1ª); o "1,8 s" de antes vinha do download (~1 s por CR2)
  travando o laço do processo e atrasando o pedido seguinte. Insistir no "busy" funciona (5/5)
  mas atrasa 0,8–2,9 s por foto, acumulando. **Decisões do dono do projeto (2026-10-22):**
  (1) aviso na Timeline a **1,0 s**; (2) **não insistir** — foto fora do tempo vale o mesmo que
  foto faltando; (3) **download adiado**: enquanto o plano tem disparos por fazer, o processo da
  câmera guarda as fotos oferecidas (a câmera as segura na memória interna) e baixa tudo em
  ordem depois do último disparo (`StillpointWorker`, `g.deferred`; At once e Test shot não
  mudam; cancelar e sair baixam o que ficou). Limite sem cartão: a memória da câmera (a medir,
  seção 22 E). **Mais medição (2026-10-22, teste-manual 22 D/E):** o download adiado funciona (a T7
  segurou 6 RAW com e sem cartão e baixou todas depois); com 1,0 s no plano a T7 recusou um
  disparo sim, outro não — a ordem leva ~0,1–0,23 s para "contar" na câmera, então o aviso
  passou para **1,2 s**. No app (SL3 + T7 + T5, Sweep 1,2 s 1 → 3 → 1 ×2): 9 fotos, nenhuma
  recusa, download depois do último disparo. **Decisões (2026-10-22):** Direction também em
  Groups (sobre os grupos), Odd / even (ímpares → pares, pares → ímpares, ida e volta) e Custom
  (sobre os passos; o "after" vale entre os mesmos passos nos dois sentidos); janela
  abre com 880 px de altura (a linha do tempo pequena em duas alturas cabe sem rolar); **foto
  recusada sem passar despercebida:** confirmação antes de disparar um plano que repete cedo
  demais ("n photos will be missing" — Fix timing / Shoot anyway), linha de andamento âmbar no
  momento ("Shot 10 of 17 · 8 refused"), no fim "Done with n photos missing: … — asked 0,6 s after
  their previous shot." em âmbar com uma linha só na Activity e a dica, e etiqueta âmbar
  "n missing" na sessão (arquivo `.missing` na pasta, escrito pelo CameraFleet; some ao salvar e
  descartar como qualquer sessão). As câmeras simuladas passaram a recusar como a T7 (foto a
  menos de ~1 s da anterior aceita), para testar tudo isso sem câmera.
  **Medição das três (2026-10-22, todas a 1/5 s, RAW):** limite da própria câmera SL3 ~1,0 s,
  T7 ~0,93 s, T5 ~1,07 s (o 1/5 s entra nesse tempo; mais rápido, o limite cai ~0,2 s); plano a
  1,2 s aceito nas três. Memória interna com download adiado: T7 e SL3 seguraram 6 RAW (máximo
  não medido); **a T5 segura só 3–4 e recusa as seguintes**. Com cartão ruim a T5 travou o SDK
  por 2 min por foto e caiu (cartão trocado, não voltou). **Decisão (2026-10-22): sem teto de
  fotos seguradas (opção B)** — melhor para o rig de T7; a T5 perde fotos em planos com 4+ fotos
  por câmera. Se uma câmera "pequena" entrar no rig: teto por modelo (opção C).
- **Guia de montagem do rig** (documento, não código) — **feito em 2026-10-18**:
  `docs/hardware/montagem-do-rig.md` (MacBook, 9–12 T7, dois hubs alimentados, fontes dummy,
  nobreak, lista de compras com preços no Brasil, roteiro de teste e orçamento de aluguel).
  Decidido: padronizar em **Canon T7**. Falta a variante desktop com placa PCIe (quando houver).
- **Testes pendentes da 2.10.0** com câmeras de verdade e no Windows (ver Pendências conhecidas).

## Futuro (não planejado ainda)

**Pedidos em aberto, na ordem em que foram anotados (lista pedida pelo dono em 2026-11-11; o detalhe de cada um está
mais abaixo ou na etapa indicada). O alinhamento automático das fotos não é pedido solto: é a etapa 21, em "Próximas
etapas".**

1. **Filtro na janela Project** (pedido em 2026-11-10). Não começado.
2. **Photoshop, a parte que falta da etapa 20** (pedaço 4 da etapa: abrir uma foto por vez no Photoshop, aviso "no
   longer RAW", conflito de Desfazer). Não começado; o Lightroom Classic da mesma etapa está publicado desde a 2.18.0.
   **Em andamento desde 2026-11-11 (decisões do dono, uma por vez):** o protótipo de 2026-11-05 é anterior à edição
   dentro do Export, à trava do Framing e à conferência de proporção: refazer em cima da tela real antes de implementar.
   (1) Como a foto volta do Photoshop: **cópia de trabalho e ⌘S** (o Stillpoint põe uma cópia TIFF em `Edited/` e abre
   essa cópia; salvar no Photoshop traz a editada; nada é instalado no Photoshop). Limite conhecido: o Stillpoint não
   revela RAW (só lê a prévia embutida), então original RAW sem editada do Lightroom não tem cópia de qualidade.
   (2) Original RAW sem editada do Lightroom: o Edit in Photoshop **não abre e explica**, numa janela que tem o botão
   **Edit in Lightroom Classic** (a foto passa pelo Lightroom, volta com Export to Stillpoint e aí o Photoshop abre).
   (3) A cópia de trabalho vai **já com o Framing da sessão aplicado** (recortada e alinhada; o Framing trava, como com
   o Lightroom; uma regra só para todas as editadas). As shot sem alinhamento vai inteira; foto com Flip vai sem
   espelhar e é espelhada de volta no Stillpoint, como no Lightroom.
   Protótipo "Photoshop no Export" (em cima do passo 2 Edit real) mandado ao dono em 2026-11-11, aguardando avaliação:
   https://claude.ai/artifact/XrNxANQbNuiNfnMgheHbsc. Bloco Photoshop embaixo do Lightroom Classic (botão "Edit photo
   0n in Photoshop", da foto selecionada), o mesmo comando no botão direito da miniatura, marca PS enquanto aberta,
   ED depois do ⌘S, janela da foto RAW, janela da foto que está no Lightroom. Pedido do dono (2026-11-11): tirar a legenda de baixo dos blocos Lightroom Classic e Photoshop e pôr num "?" ao lado do título (o aviso âmbar fica, e a linha "The framing of this session stays locked…" também continua à vista: decisão do dono); protótipo refeito assim. Blocos compactos aprovados em uso (ajustes pedidos e feitos). (4) Foto aberta e ainda não salva: **marca PS na miniatura e estado de espera no bloco, com Open photo 0n again e Cancel** (o Cancel tira a marca e apaga a cópia de trabalho). (5) Cópia de trabalho de original JPEG: **TIFF de 16 bits** (como as editadas do Lightroom; o Stillpoint hoje só grava TIFF de 8 bits: falta o gravador de 16). A conferir antes de
   implementar: se o leitor de TIFF do Stillpoint lê TIFF com camadas do Photoshop. **Protótipo aprovado pelo dono em 2026-11-12; primeira parte implementada na branch no mesmo dia, sem teste do
   dono** (roteiro: `docs/teste-manual.md`, seção 45): blocos compactos com "?", Edit photo 0n in Photoshop (bloco e
   botão direito), cópia de trabalho em TIFF de 16 bits com perfil sRGB e o Framing aplicado (`Export::WorkingCopy`),
   marca PS e Cancel, a foto virando editada a cada ⌘S (o app vigia a pasta Edited; `psPending` / `psEdited` em
   session.json), janelas da foto RAW, da foto no Lightroom e do Photoshop não instalado. Conferido só pelo teste
   automático (cenário 19 de `tests/host/run_tests.py`), com um Photoshop de mentira: nenhum arquivo salvo por um
   Photoshop de verdade foi lido ainda (camadas, perfil de cor). Contexto dado pelo dono (2026-11-12): o Photoshop é
   o acabamento final, depois dos ajustes não destrutivos do Lightroom (remover objetos, acrescentar elementos,
   corrigir defeitos); isso pesa no segundo protótipo: proteger o acabamento de um Export to Stillpoint posterior no
   Lightroom, e voltar do Photoshop para o Lightroom vira exceção. No Mac, com o Photoshop 2027, o dono aprovou em 2026-11-12 o salvamento e um TIFF com camadas (o resto da seção 45
   segue pendente). Pendência anotada: o aviso do canto de baixo cobre o botão do bloco Photoshop enquanto aparece. Pedidos do dono em 2026-11-12, depois de testar a sessão 1:1 (aprovada): (a) textos que só citavam o Lightroom
   passam a valer para os dois programas: feito na branch (subtítulo do passo 2 Edit, motivos do Framing travado, nota
   da trava no passo 1 com o caso "open in Photoshop", aviso Delete the edit or the photo?, linha da editada recusada);
   a lixeira dizia "Lightroom Classic" nas editadas (selo "Lr"): feito na branch em 2026-11-12 (selo "Ps" nas que vieram do Photoshop, "Ed" no item com as duas origens), sem teste do dono; (b) a marca PS some depois do primeiro
   salvamento e isso o confundiu: decisão do dono (2026-11-12): marca pulsando = pendente (PS enquanto a cópia foi mandada e não voltou; o
   texto do bloco diz "sent to Photoshop · save there (⌘S) to bring it back", sem "open"); marca parada = resultado
   (ED e, ao lado, PS parado enquanto a editada for do Photoshop; um Export to Stillpoint posterior do Lightroom tira
   o PS). Feito na branch e aprovado pelo dono no Mac em 2026-11-12. Em aberto: a marca voltar a pulsar ao reabrir no Photoshop. Pedido do dono (2026-11-12): Revert to original… também para a editada recusada (um corte salvo no Photoshop
   não se desfaz depois de fechar o documento): feito na branch, no bloco Lightroom Classic e no botão direito da
   miniatura; sem teste do dono. Observação do dono (2026-11-12): o estado das editadas, o Revert to original… e os avisos aparecem dentro do
   bloco Lightroom Classic, mas não são só dele. Decisão dele: uma faixa neutra acima dos dois programas. Protótipo
   "Faixa Edited photos" mandado em 2026-11-12, aguardando avaliação: https://claude.ai/artifact/YCJeshpxTwmcSjBZiP1xUm
   (faixa com título, estado e Revert to original… à direita, avisos embaixo só quando existem; some sem editadas; os
   blocos Lightroom Classic e Photoshop lado a lado, para caber em 1440 × 900 sem rolar). **Aprovado pelo dono em 2026-11-12** (nome Edited photos; textos dos avisos reduzidos; lado a lado, com o
   Photoshop descendo quando a janela fica estreita) e implementado na branch no mesmo dia; aprovado pelo dono no Mac em 2026-11-12, junto com o Revert to original… da recusada.
   **Photoshop primeiro, Lightroom depois (observação do dono, 2026-11-12):** o Lightroom recebia a original e um
   Export to Stillpoint trocava a editada do Photoshop. Decisão do dono (caminho A): a foto com acabamento do Photoshop
   fica fora do Lightroom; para editar lá de novo, Revert to original… nela. Protótipo aprovado em 2026-11-12
   (https://claude.ai/artifact/1bFGsrsRDTk586Sd3bnjYF) e implementado na branch no mesmo dia, sem teste do dono: linha
   "Photo 0n stays out: edited in Photoshop." no bloco Lightroom Classic, janela "Photo 0n was edited in Photoshop" ao
   pedir o Lightroom nela, e a foto que está no Lightroom sai de lá (etiqueta e coleção) quando é salva no Photoshop.
   O envio da sessão inteira com foto protegida foi aprovado pelo dono no Mac. Pedidos dele no mesmo dia, feitos na
   branch, sem teste do dono: aviso também ao enviar a sessão (opção C: janela na primeira vez de cada sessão, aviso
   âmbar nas seguintes); bolinha do estado In Lightroom Classic apagada como nas miniaturas; a miniatura não mostrar a
   imagem antiga por um instante depois do ⌘S (causa provável corrigida, não confirmada).
   O caminho A inteiro foi aprovado pelo dono no Mac em 2026-11-12 (com a janela única do Revert, o aviso ao enviar a
   sessão e o selo Ps da lixeira). Etiquetas saindo da miniatura: protótipo https://claude.ai/artifact/R5J6LWvpTzKJ7GNyGrww1c,
   opção A aprovada em 2026-11-12 (uma linha, sem bolinha; pendente âmbar pulsando, resultado verde) e feita na branch
   só na fileira do passo 2 Edit, sem teste do dono; as miniaturas da tela principal continuam com a bolinha (em aberto).
   Observações do dono ao testar (2026-11-12): o ED é redundante e não diz que o Lightroom editou; não faz sentido
   indicar "aberto no Photoshop" (ponto encerrado: a etiqueta não volta a pulsar ao reabrir). Protótipo
   https://claude.ai/artifact/Go5goUNgj2ykDPWGZFUFs2, forma Y aprovada: etiqueta por programa, verde = editada lá (LR,
   PS ou os dois; `psLr` em session.json), âmbar = está lá agora; no Lightroom, só o LR âmbar. Feito na branch e
   aprovado pelo dono no Mac em 2026-11-12. Decisão do mesmo dia: as miniaturas da tela principal usam a mesma etiqueta
   âmbar sem bolinha (feito na branch, sem teste do dono).
   **Ideia do dono (2026-11-12), em estudo, sem decisão:** levar todas as fotos da sessão para o Photoshop num arquivo
   só, para editar e ver a sequência lá dentro (ajustes, elementos acrescentados) antes de voltar ao Stillpoint.
   Caminhos conversados: (a) camadas, uma por foto, com a animação da Timeline do Photoshop, e um comando do Stillpoint
   dentro do Photoshop para devolver cada quadro; (b) folha com as fotos lado a lado num arquivo plano, que o
   Stillpoint recorta de volta a cada ⌘S, sem instalar nada; (c) continuar foto a foto, com a prévia do Stillpoint
   tocando ao lado. Pesquisa de 2026-11-12 (documentação e fóruns da Adobe; nada testado na máquina do dono): o Photoshop aceita
   comandos de fora por três vias: abrir um arquivo de script .jsx com ele (mostra um aviso de segurança; o
   desligamento do aviso por arquivo de configuração é relatado como falho em versões recentes), AppleScript no Mac e
   COM no Windows (vias oficiais, com relatos de falha no Photoshop 2025 sem resposta da Adobe), e um plugin UXP
   instalado no Photoshop (a via moderna; sem interface oficial para a Timeline). A Adobe diz não ter planos de tirar
   os scripts .jsx (página de 2021). Criar a animação por script: "makeFrameAnimation" é confirmado em fórum; "Make
   Frames From Layers" por script não foi confirmado. Um relato de bug diz que abrir um script .psjs de fora não roda
   no Photoshop 27.10 no Windows. Conclusão: viável em princípio, mas só um experimento no Photoshop do dono confirma.
   **Decisão do dono (2026-11-12): arquivada como ideia anotada.** Ficaria menos amigável que o fluxo do Lightroom
   (aviso de segurança ou instalação manual, comando para lembrar na volta, documento que quebra se as camadas forem
   mexidas, arquivo de mais de 1 GB). O fluxo de uma foto por vez com ⌘S continua, com a prévia do Stillpoint tocando
   ao lado. Melhorias possíveis desse fluxo, a avaliar depois: abrir várias fotos de uma vez no Photoshop (cada uma
   no seu documento) e a prévia atualizar mais rápido depois do ⌘S.
   Segundo protótipo, depois: foto
   editada no Photoshop indo para o Lightroom ("no longer RAW") e o conflito de Desfazer.

- **Orientação do Aspect ratio: horizontal ou vertical (pedido em 2026-11-10; feito em 2026-11-11 na branch
  etapa-20-lightroom).** No passo 1 do Export, dois botões com ícone ao lado das proporções (protótipo "Orientação do
  Aspect ratio" aprovado): Horizontal e Vertical. Começa conforme as fotos da sessão (como sempre foi: foto em pé fica em
  pé); em Vertical a lista vira As shot, 2:3, 3:4, 9:16 e 1:1 e o recorte fica em pé dentro da foto deitada (e o
  contrário). Apagados em As shot e 1:1 e com o Framing travado. Same framing copia a orientação junto. Guardada junto
  da proporção ("3:2/v|x|y" em session.json; sem "/h" ou "/v" acompanha as fotos). Vai para o Lightroom no recorte de
  cada foto. A tela Align photos tem os mesmos dois botões e nomeia o canvas na orientação que vale. Não mexido: os
  avisos de proporção da janela principal ("Crop on export to 3:2") continuam sem orientação.
- **Espelhar a foto no Align photos (pedido em 2026-11-11; feito no mesmo dia na branch `etapa-20-lightroom`,
  protótipo aprovado: linha Flip com dois ícones, Apply to all e a marca na miniatura; sem giro de 90°, que já se faz
  digitando 90 no Rotate; para o Lightroom a foto vai sem espelhar e o Stillpoint espelha na volta; o Lightroom
  Classic 15.6 não deixa o plugin espelhar, conferido no autoteste, e o dono decidiu deixar assim em vez de mandar
  cópia espelhada; a marca na miniatura é um ícone só).** Texto do pedido: Controles de flip horizontal e flip vertical no Align
  photos (hoje só existem Move X, Move Y, Size e Rotate; espelhar só pelo Lightroom, e a foto volta espelhada como
  editada). Mexe no Align photos, nas prévias, no exportador e no recorte que vai para o Lightroom. Decisões pendentes
  do dono antes de desenhar: por foto ou da sessão inteira; se entra também o giro de 90°; como aparece na miniatura.
- **[Publicado na 2.20.0; aprovado pelo dono no Mac com câmeras simuladas em 2026-11-11] O projeto guarda o estado do rig.** Decisões do dono
  (2026-11-11): entra tudo (painel Bullet time, ordem das câmeras, configurações das câmeras); ao abrir um projeto o
  Stillpoint lê as câmeras e, havendo diferença, pergunta antes de aplicar (aviso "The cameras are not as this project
  left them", protótipo aprovado); câmera faltando ou nova só avisa (aviso âmbar), sem bloquear; com o projeto aberto
  cada mudança vai para ele na hora; "Keep the cameras as they are" não muda o projeto; sem projeto vale o padrão de
  fábrica e nada é guardado (o Timing deixou de ser lembrado pelo aplicativo); ordem sem buraco, câmeras novas no fim.
  Arquivo `stillpoint-rig.json` na pasta do projeto; lógica em `src/gui/rig_state.*`. Conferido só pelo teste
  automático (cenário 18 de `tests/host/run_tests.py` e `ExporterMathTest`), com câmeras de mentira que têm ISO,
  Shutter, Aperture e White balance. ⌘Z do aviso (decisão do dono, 2026-11-11): depois de Apply, as câmeras voltam ao que tinham e o projeto não muda (⇧⌘Z aplica de novo); depois de Keep, o aviso volta. ⌘Z aprovado pelo dono no Mac em 2026-11-11. **Pendente:** Windows, câmeras reais
  (em especial: temperatura de cor, ajuste fino do balanço de branco e Picture Style, que as câmeras de mentira do
  teste não têm). Texto original do pedido:
  **O projeto guarda o estado do rig (pedido em 2026-11-11).** Cada projeto guardar e trazer de volta, ao ser aberto: as
  últimas configurações de todas as câmeras (Camera settings), as configurações e a última seleção do painel Bullet time
  (Countdown, Sessions, Download wait, Timing), a ordem das câmeras, "e dentre outros". Hoje isso é do aplicativo, não
  do projeto. Decisões pendentes do dono antes de desenhar: a lista exata do que entra; o que fazer quando as câmeras
  ligadas não são as mesmas do projeto (outra quantidade, outros modelos); se abrir o projeto aplica as configurações
  nas câmeras sozinho ou pergunta antes; e o que vale fora de projeto.
- **[Publicado na 2.20.0; aprovado pelo dono no Mac em 2026-11-11] Activity à vista com as janelas abertas.** Decisão do dono
  (2026-11-11): a barra Activity aparece por cima das janelas (Export sessions, Camera settings, Project, Settings,
  About e as outras) e clicar nela abre a lista por cima da janela. Os avisos de pergunta, a janela de digitar um nome,
  a contagem, o progresso e a tela cheia continuam cobrindo tudo. Só CSS (`nocturne-neo.css`, fim do arquivo); as
  janelas ficam acima da barra. Roteiro: seção 44. Aprovado pelo dono no Mac em 2026-11-11 (Export sessions, Camera settings, Project). Depois, a pedido dele: a janela Trash também, e na tela cheia da sessão a barra fica escondida e sobe quando o mouse chega na borda de baixo. **Decisão do dono (2026-11-11): sem Activity na janela Live view.** Trash e tela cheia aprovadas pelo dono no Mac em 2026-11-11. Janela pequena aprovada no Mac em 2026-11-11. **Pendente:** Windows.
- **Filtro na janela Project (pedido em 2026-11-10).** Um botão de filtro na Project window para filtrar as sessões
  por data, hora, minuto, número de fotos, etiqueta (o nome dado à sessão) e outros atributos que se mostrarem úteis
  (a pensar: editadas, no Lightroom, salvas, proporção, fotos faltando). Pensar junto a experiência das ações em
  cima do filtro: apagar sessões com facilidade e, por exemplo, desmarcar as que não estão no filtro. Antes de
  implementar: lista de atributos, desenho do filtro e das ações (protótipo).
- **Metering mode nas Camera settings (pedido em 2026-10-23; etapa 18).** Mostrar e mudar o modo de medição
  de cada câmera (matricial/evaluative, parcial, pontual, ponderada ao centro) na tabela do Camera
  settings e na linha All cameras, como ISO e os outros. No EDSDK é a propriedade MeteringMode
  (leitura e escrita; os valores aceitos vêm de cada câmera, como as demais) — conferir na
  documentação do SDK e na SL3/T7/T5 antes de implementar. Feita na etapa 18 (2.13.0); no Match
  automatically só avisa e oferece igualar (decisão de 2026-10-30).
- **Exportação para impressão lenticular (pedido em 2026-10-23; etapa 19).** Uma sessão de bullet time vira
  uma imagem entrelaçada para lente lenticular: escolher a lente (LPI) e a impressora (DPI),
  calcular quantos frames cabem por lentícula (DPI ÷ LPI) e avisar quando a sessão tem frames
  demais ou de menos; entrelaçar as fotos em tiras na ordem certa (com inversão opcional e sentido
  horizontal/vertical conforme o efeito: animação/flip ou profundidade 3D); calcular o tamanho da
  folha de impressão a partir do tamanho da lente e do pitch; gerar uma **folha de calibragem**
  (pitch test: várias faixas com LPI ligeiramente diferentes para medir o pitch real da combinação
  lente + impressora) e aceitar o valor medido de volta; alinhamento, sangria e marcas de corte;
  saída em TIFF/PNG sem perda na resolução nativa da impressora. Pré-requisito: o Project (as
  sessões precisam ficar guardadas para reimprimir). Decisões pendentes: quais lentes/impressoras
  cadastrar de fábrica, e se a prévia do efeito aparece no app.
- **Licença (decidido em 2026-10-22, implementação pendente).** Hoje é MIT (qualquer um, inclusive
  empresa grande, usa de graça). Decisão do dono do projeto: trocar, numa versão futura, para o
  modelo de **licença dupla**: grátis para pessoas e empresas pequenas (quem está começando na
  área), licença paga para empresas acima de um corte (funcionários ou faturamento, a definir) —
  textos prontos a avaliar: PolyForm Small Business, Fair Core License, BSL. Pontos em aberto antes
  de fazer: (a) o corte de "empresa grande"; (b) as versões já publicadas sob MIT continuam MIT
  para quem as baixou — decidir como tratar (a mudança vale a partir de uma versão X); (c) conferir
  os termos do SDK da Canon quanto a distribuição comercial; (d) revisar o texto com advogado. As
  bibliotecas usadas (MIT/BSD/Apache/OFL; LibRaw em LGPL, separada) permitem a troca. Quando fizer:
  `LICENSE`, README, notas da versão e o About do app.

- **Disparo com intervalos (PRIORIDADE, pedido do dono do projeto em 2026-10-16; etapa 14).**
  Campo "Timing" no painel Bullet time, com uma linha do tempo que mostra quando cada câmera
  dispara. Modos: All at once (padrão); One after another (intervalo em s, direção 1→N, N→1 ou
  ida e volta 1→N→1, em que as câmeras do meio fotografam duas vezes na mesma sessão); Groups
  (n grupos, intervalo entre eles); Odd/even (ímpares juntas, pares X s depois); Custom (atraso
  por câmera, numa coluna em Camera settings). Download wait conta a partir do último disparo;
  cancelar no meio deixa as fotos já tiradas. Pelo USB a precisão é de dezenas de ms, boa para
  intervalos de 0,2 s para cima; com a caixa de disparo o intervalo fica exato.
- **Ordens de disparo em paralelo (substituído pela etapa 16, um processo por câmera).** Hoje o app manda
  "apertar" para uma câmera por vez, em fila; a última recebe a ordem depois de todas as outras.
  Testar uma thread por câmera, todas soltas no mesmo instante (o SDK pode não aceitar). Medir
  com todas as câmeras fotografando um cronômetro de milésimos na tela de um celular: a diferença
  entre os números é a diferença real de disparo. A medição serve para validar o paralelo, não
  para catalogar modelos.
- **Caixa de disparo por cabo (decidido em 2026-10-16: primeiro o hardware, depois o software).**
  Controlador (ESP32) + um canal por câmera com optoacoplador fechando o contato de disparo da
  entrada de controle remoto (2,5 mm, padrão RS-60E3: ponta = disparo, anel = foco, corpo =
  comum); 16 canais por placa de expansão (MCP23017 via I2C), expansível além de 12. O app fala
  com a caixa pela porta USB serial ("dispara canais X em Y ms"). USB continua cuidando das
  configurações e das fotos. Antes de montar 12 canais, um protótipo de 2 canais confirma: a
  câmera dispara pelo cabo com a sessão USB aberta e a foto chega ao computador.
  Feito em 2026-10-16: guia de montagem em `docs/hardware/caixa-de-disparo.pdf` (2 fases, lista
  de compras com preços conferidos, esquemas) e o programa do ESP32 em
  `hardware/trigger-box/firmware/` (protocolo serial PING/FIRE/PLAN/GO; não testado em hardware).
- **Ajustar as fotos em vez da câmera: correções pelo programa e RAW (decidido em 2026-10-16,
  opção B).** Quando houver câmera corrigida pelo programa e o formato for Original, o Save
  sessions avisa que o RAW dessas câmeras não inclui a correção, e a pessoa escolhe (RAW sem
  correção em todas, ou converter). O app nunca mistura RAW de umas e JPEG de outras sem avisar.
- **Ajustar as fotos em vez da câmera (registrado em 2026-10-15).** Corrigir cor e brilho nas fotos
  salvas, sem mexer nos originais. Útil para câmeras que não deixam mudar as configurações pelo
  computador e para outras marcas. Em RAW não tem efeito.

- **Vários SDKs da Canon ao mesmo tempo:** descartado. Os SDKs antigos não rodam em
  64 bits / Apple Silicon e versões diferentes não convivem no mesmo programa.

## O que funciona em cada sistema

| Função | Windows | Mac |
| --- | --- | --- |
| Detectar / listar câmeras | sim | sim |
| Disparo sincronizado (BULLET TIME) | sim | sim |
| Download e organização das fotos | sim | sim |
| Reordenar câmeras / prefixos | sim | sim |
| Pasta de saída configurável | sim | sim |
| Áudio de contagem | sim | sim |
| Pacote de distribuição (`.zip`) | sim | sim (sem assinatura Apple) |

Atualizar esta tabela sempre que uma função mudar de status.

## Pendências conhecidas

- **2.18.0 (etapa 20 — Edit in Lightroom Classic, orientação do Aspect ratio, seleção do Export guardada) publicada em
  2026-11-11, Mac e Windows.** Testada pelo dono no Mac com câmeras simuladas e o Lightroom Classic de verdade (seção 42
  do roteiro). **Pendente:** no Windows compilou mas nada desta etapa foi testado; câmeras reais; o recado do arquivo
  recusado não se repetir depois de abrir outro projeto (só o uso confirma); a parte do Photoshop da etapa 20 não foi feita.
  **2.21.0 publicada em 2026-11-13, Mac e Windows** (Edit in Photoshop: cópia de trabalho e ⌘S, faixa Edited photos, foto com acabamento do Photoshop fora do Lightroom, etiquetas por programa, origem das editadas na lixeira). Aprovada pelo dono no Mac com câmeras simuladas, Photoshop 2027 e Lightroom Classic 16. No Windows compilou na publicação; nada testado lá; janelas RAW e Photoshop não instalado só no teste automático. Câmeras reais sem teste.
  **2.20.0 publicada em 2026-11-11, Mac e Windows** (o projeto guarda o estado do rig, ⌘Z do aviso do rig, Activity à vista com as janelas). Aprovada pelo dono no Mac com câmeras simuladas. No Windows compilou; nada testado lá. Câmeras reais sem teste.
  **2.19.0 publicada em 2026-11-11, Mac e Windows** (Flip no Align photos). No Windows compilou; nada testado lá.
  **2.18.1 publicada em 2026-11-11, Mac e Windows** (etiquetas alinhadas na janela Project, aviso Mixed ratios com a
  orientação, ⌘Z na caixa do número do Align photos, giro de 90° no Lightroom, recado do arquivo recusado mostrando a
  foto). No Windows compilou; nada testado lá.
  **Depois da 2.18.0 (2026-11-11):** foto girada 90° no Lightroom (Photo › Rotate) bloqueia o Export to
  Stillpoint como proporção trocada, e Put back the Stillpoint crop gira de volta (`photo:rotateLeft`; o
  `applyDevelopSettings` não aceita orientação). **Decisão do dono (2026-11-11):** foto espelhada no Lightroom (Flip
  Horizontal / Flip Vertical) é aceita como está, sem aviso: é uma edição como outra qualquer.
- **[Resolvido na 2.17.0, publicada em 2026-11-05] Live view com várias sessões num disparo (anotado pelo dono em 2026-11-02):** quando "Sessions"
  é maior que 1, o Live view (modo operador e modo audiência) só mostra uma sessão; não dá para
  navegar entre as sessões do mesmo bullet time. **Decidido em 2026-11-05 (protótipo "Live view: várias sessões"):**
  caminho B com as setas da A: no fim, as sessões tocam uma volta inteira cada, em sequência ("Playing all"); no
  Operator, "‹ Session 2 of 3 ›" (ou ← →) para numa sessão ("Pinned"), "Play all" (tecla A) volta, e volta sozinho
  depois de 15 s parado; o Audience mostra "Session 2 of 3" e acompanha (aviso `livePick` do app para as janelas Live).
  Testado e aprovado pelo dono em 2026-11-05 (seção 39 do roteiro); versão 2.17.0. Junto: botão Reset, sessões
  apagadas saem da Live, duas caixas no canto de cima, e com duas janelas Live a segunda abre no modo contrário e o
  modo fica preso até fechar uma.

- **Testes com câmeras reais ainda não feitos (anotado pelo dono em 2026-11-02):** o **cartão
  cinza** ("Use the gray card" no Match automatically: achar o cartão na foto, a conferência com
  clique/arrastar, "Skip the gray card", o alvo cinza neutro) e o **Calibrate with chart** (impressão
  da cartela, achar as 4 marcas, arrastar os cantos, as 4 fotos, o resultado por modelo e o uso
  dele pelo Match) nunca foram testados com câmeras de verdade: só com simuladas, que entregam fotos
  de cor lisa (sem cartão nem marcas). Roteiro: `docs/teste-manual.md`, seções 34 (cartão) e a da
  cartela. Precisa de SL3 + T7 (dois modelos), o cartão cinza e a cartela impressa a 100%.

- **2.12.0 (etapa 17 — Project) publicada em 2026-10-29; no mesmo dia testada no Mac com
  câmeras reais (T7 + SL3 + T5): tudo aprovado** — `session.json`, `.xmp` renomeado junto,
  undo/redo das Camera settings e do Copy from camera, apagar + Ctrl+Z com RAW (também em HD
  externo), ordem das câmeras, foto recusada do Sweep (pendência da 2.11.0 fechada). Achados,
  corrigidos na **2.12.1** (branch `etapa-17-ajustes`): (1) bug — HD ejetado com o app fechado →
  ao abrir ficava "No project" em vez de âmbar "not reachable"; agora o projeto fica lembrado em
  âmbar, as sessões novas vão para o app, e ele religa sozinho quando a pasta volta (ao abrir o
  menu do botão, no ↻ ao lado do "not reachable" ou ao voltar ao app); (2) pedido — reler o projeto
  ao abrir o menu e o ícone ↻; (3) `session.json` sem os campos `"type"`; (4) Activity e Undo das
  Camera settings com os valores da tela ("ISO → 400") e o código só no detalhe técnico.
  A 2.12.1 foi testada no Mac (HD externo em âmbar + ↻, textos, session.json) e publicada em
  2026-10-30. **2.12.2** (branch `etapa-17-pasta-padrao`, decisão do dono em 2026-10-30): pasta
  padrão para projetos novos — `~/Pictures/Stillpoint` (Mac) / `Pictures\Stillpoint` (Windows),
  criada ao usar; "New project…" pede só o nome e cria `<padrão>/<nome>` (nome já existente → aviso na
  caixa, nada é criado), com "Choose another folder…" para uma vez; Settings → New projects → Change… troca o padrão (`projectsFolder=`);
  "Open project…" começa na pasta padrão. **2.12.3** (branch `etapa-17-menu-lento`): o menu do botão
  de projeto às vezes travava a janela por segundos — a cada releitura do projeto o app somava o
  tamanho de todos os arquivos das pastas (lento com RAW / HD externo) e a lista de recentes lia o
  índice de cada pasta; agora o tamanho só é medido ao abrir a janela Project, os recentes só
  conferem se a pasta existe e o menu abre antes de reler. **2.12.4** (branch `etapa-17-uso-sistema`,
  decisão do dono em 2026-10-30): rodapé do Activity com o uso do computador — Stillpoint (CPU %,
  memória, 1 + n processos de câmera; threads só em technical details) e computador (CPU %, memória
  livre/total, espaço livre no disco do projeto); medido só com o Activity aberto, a cada 2 s
  (`systemStats` → evento `stats`, contadores do sistema via `Platform::QueryProcessUsage/
  QuerySystemUsage`; nada percorre pastas); entra no "Copy log". Sem GPU/temperatura/rede (não há
  leitura barata e confiável). **2.12.5** (branch `etapa-17-recentes`): "Clear recent" no menu do
  projeto, com Desfazer (`projectRecentSet`). **Ainda pendente no Windows:** todo
  o roteiro 23 (botão direito, arrastar, Rename com a pasta aberta no Explorer, apagar + Ctrl+Z,
  Save sessions) e as câmeras reais.

- **2.11.1 (2026-10-22):** a janela de atualização crescia com o texto das notas e, com as da
  2.11.0, o botão Update saía da tela. Corrigido (lista rola; botões sempre à vista; conferido
  aqui num navegador). Quem está na 2.10.0/2.11.0 ainda vê a janela antiga uma vez (as notas da
  2.11.1 são curtas); daí em diante está resolvido. As notas não foram encurtadas de propósito.

- **2.11.0 (etapa 16 + Sweep) publicada em 2026-10-22 com o Windows testado só com câmeras
  simuladas** (decisão do dono do projeto): a janela Live e as câmeras de verdade no Windows
  continuam sem teste (ver 2.10.0 abaixo); o resumo de foto recusada com câmeras de verdade
  (teste-manual 21) foi aprovado no Mac em 2026-10-29.

- **2.10.0 (etapa 15) publicada sem teste no Windows nem com câmeras de verdade (2026-10-17).**
  No Windows nunca compilou: janela Live (segunda instância webview/WebView2), tela cheia por
  monitor (WS_POPUP), tocador waveOut e ducking. Com câmeras: `ShootScheduled` (Timing/Sweep),
  disparo com plano e a Live com fotos reais. Também falta medir o menor intervalo do Sweep por
  USB (aviso na Timeline).

- **EDSDK fora do repositório:** decidido manter o SDK da Canon só dentro do
  `.zip` das versões (o que os termos da Canon permitem). Os arquivos do SDK
  saíram do repositório; cópias antigas continuam no histórico do Git.

- **Windows: conexão em paralelo não funcionava (testado em 2026-10-14).** A sessão
  aberta numa thread auxiliar abria, mas os comandos seguintes davam erro 2 e a câmera
  "parava de responder". Corrigido: no Windows a sessão abre na própria thread das
  câmeras (Platform::SdkSessionsInWorkerThreads). Testado em 2026-10-14 com SL3 e
  T7: conexão, disparo, sessões, USB, fechar e "Restart app" funcionando; versão de
  terminal também testada e funcionando. "Restart app" também testado no Mac, dentro
  do `.app` (STILLPOINT_TEST_RESTART=1 mostra o botão sem câmera presa). Texto antigo:
  **Windows: conexão em paralelo não testada com câmeras.** Desde a branch
  `fix-feedback-conexao`, a sessão de cada câmera é aberta numa thread auxiliar
  (com COM inicializado, como pede o manual da Canon). Compila, mas ainda não
  foi testado com câmeras no Windows. Testar antes da próxima versão publicada.

- **T7 às vezes conecta sem aparecer "Connecting" (Mac, registrado em 2026-10-13).**
  A T7 leva cerca de 42 s para conectar. Na maioria das vezes a janela mostra
  "Connecting" durante esse tempo, mas às vezes não mostra nada e, depois dos
  42 s, ela aparece conectada. Ainda não investigado. Hipóteses (não confirmadas):
  1. a demora acontece antes de o app saber que existe uma câmera: a listagem do
     SDK (`EdsGetCameraList` / `EdsGetDeviceInfo`) trava enquanto a T7 liga, e só
     a abertura da sessão (`EdsOpenSession`) é mostrada como "Connecting";
  2. a conexão vem por um caminho que não usa a lista de conexões pendentes (a
     primeira conexão ao abrir o app ou "Restart camera connections"), e a tela
     não recebe atualização enquanto ela dura;
  3. a T7 está na fila atrás de outra câmera e aparece como "Waiting for another
     camera" em vez de "Connecting".
  Dado de 2026-10-13 (T7 e SL3 ligadas antes de abrir o app): a SL3 conectou em
  1 s; nada no log por 40 s; depois a T7 apareceu e conectou em 1 s. Ou seja, a
  espera acontece antes da abertura da sessão (hipóteses 1 ou 2 abaixo, não a 3).
  Para separar: o app agora registra nos detalhes técnicos a lista de câmeras que
  o SDK devolve (quando muda), procuras e leituras de câmera que demoram 1 s ou
  mais, e os avisos do sistema de "câmera conectada". Guardar o log de uma vez em
  que acontecer.
  **Resultado (log de 2026-10-13, 21:22):** a lista do SDK teve só a SL3 de 21:22:12
  a 21:22:53; nenhuma procura nem leitura demorou. Às 21:22:53 o macOS avisou "câmera
  conectada", a T7 entrou na lista e conectou em 1 s. Confirmada a hipótese 1: nesses
  ~40 s a T7 ainda não existe para o SDK (nem para o macOS), então o app não tem como
  mostrá-la pelo SDK. Possível solução, ainda não decidida: olhar a lista de aparelhos
  USB do sistema (IOKit no Mac, SetupAPI no Windows) e mostrar "uma câmera Canon está
  ligando" quando há um aparelho Canon no USB que o SDK ainda não lista. Teste
  antes de implementar: o app agora registra "USB Canon devices" (só no Mac; IOKit)
  nos detalhes técnicos, para comparar com "SDK camera list".

- **T7 não reconecta depois de desconectar (Mac, registrado em 2026-10-13).** Depois
  que a T7 se desconecta, às vezes ela só volta reiniciando o app (ou o Mac).
  Dado do log de 21:44: religada, a T7 voltou com a mesma "porta" da SL3 conectada
  (`SL3@2:connected T7@2:connected`) e o app a tratou como já conectada. Corrigido
  em 2026-10-13: cada entrada é identificada por modelo + porta. Também: uma
  tentativa que falha rápido (a T7 deu 8195, "sessão não aberta") volta às tentativas
  normais em vez de esperar outro aviso de conexão. Testado no Mac (2026-10-14).
  Às vezes só voltava reiniciando o Mac (sem explicação); segundo o dono do projeto, não
  aconteceu mais até 2026-10-14 (depois das correções de reconexão e da detecção por USB).
  Se voltar: pedir o log de Activity com "Show technical details" ligado.
  Teste do USB (1º log): "USB Canon devices: 0" o tempo todo, mesmo com as duas
  câmeras conectadas; a busca foi refeita (todos os aparelhos USB, filtrando a Canon,
  e com o total de aparelhos no log). 2º log (22:00): agora as câmeras aparecem no
  USB ("Canon Digital Camera"), sempre no mesmo segundo que no SDK quando o SDK está
  livre; o endereço USB é fixo por entrada física (T7 0x120000, SL3 0x110000 nas
  duas vezes). Às 22:01 a SL3 foi desligada enquanto a T7 conectava (43 s) e o app
  só soube no fim (erro 97 ao configurar). A leitura do USB passou a rodar também
  enquanto uma câmera conecta, para medir quanto antes o USB mostra a mudança.
  3º log (22:08): às 22:08:29 o USB já mostrava as duas câmeras e o SDK só a SL3; a
  T7 entrou no SDK às 22:09:11 (42 s depois). Implementado em 2026-10-13: câmeras
  que o USB mostra e o SDK ainda não aparecem como "Connecting" (no lugar de uma
  câmera que caiu, ou como "Canon camera" nova) e não bloqueiam o disparo das outras.
  Mac: IOKit. Windows (2026-10-13): SetupAPI, mesmos critérios (Canon VID_04A9 com
  interface de classe 06); compila (verificado com MinGW); testado com câmeras no Windows (2026-10-14).
  Depois: mostra o tempo de espera e o modelo. O nome no USB é igual para todas
  ("Canon Digital Camera"), mas o código do produto USB muda por modelo; o app
  aprende qual código é qual modelo (quando sobra um de cada ao comparar USB e SDK)
  e guarda em `usb-models.txt`, na pasta de dados do app.

- **Conexão que nunca termina (registrado em 2026-10-13).** O SDK da Canon não deixa
  cancelar uma conexão em andamento e bloqueia tudo enquanto ela dura; se ela nunca
  terminar, o disparo nunca libera. Feito: "Restart camera connections" desativado
  durante uma conexão; depois de 60 s, aviso com o botão "Restart app" (abre o app de
  novo e fecha este; fotos não salvas ficam no disco). Testado no Mac (2026-10-13): desligar a T7
  no meio da conexão faz a conexão falhar e libera o disparo; o aviso diz isso. Se travamentos acontecerem de
  verdade com frequência: passar a comunicação com as câmeras para um programa
  auxiliar, que o app pode encerrar e abrir de novo sozinho, sem fechar a janela.

## Histórico de versões do SDK

| Onde | Versão em uso |
| --- | --- |
| Windows (máquina de build) | 13.20.10.6402 (desde a etapa 1) |
| GitHub | nenhum (SDK fica só na máquina de cada um) |
| Mac (máquina de build) | 13.20.10.0 (desde a etapa 3) |
