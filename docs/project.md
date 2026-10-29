# Project — desenho da pasta e do `project.json` (etapa 17)

Proposta para aprovação do dono do projeto antes de qualquer código (2026-10-29).
O que está marcado **[decisão]** precisa de resposta dele.

## O que é um Project

Uma pasta escolhida pela pessoa que guarda sessões de bullet time **sem sair do app**: as
sessões ficam no disco, aparecem no Stillpoint quando o Project está aberto, e podem ser
exportadas quantas vezes quiser, com outras configurações, hoje ou meses depois. É o lugar
que o Lightroom Classic e o Photoshop vão ler (etapa 20) e de onde sai a impressão
lenticular (etapa 19).

Hoje (2.11.x) uma sessão vive na pasta de dados do app (escondida) e sai dele ao ser salva.
Isso continua existindo para quem não usa Project.

## A pasta

```
Lúcia - Studio A/                 ← a pasta do Project (o nome dela é o nome do Project)
  stillpoint-project.json         ← identifica a pasta como Project; nome, data, lista de sessões, padrões
  Originals/
    2026-10-22 14.30.05/          ← uma pasta por sessão; o mesmo nome que o app já usa
      01_SL3_1_IMG_4821.CR3       ← os arquivos como a câmera mandou (nunca alterados)
      01_SL3_1_IMG_4821.xmp       ← gravado pelo Lightroom Classic (etapa 20); o app só preserva
      02_T7_1_IMG_0102.CR2
      …
      session.json                ← dados da sessão (abaixo)
  Edited/
    2026-10-22 14.30.05/          ← versões editadas, exportadas pelo Lightroom/Photoshop
      01_SL3_1_IMG_4821.jpg       ← mesmo nome-base do original; extensão livre (jpg, tif, png)
      …
  Exports/                        ← o que o Stillpoint exporta (Photos/ e Sequence/), como hoje
    2026-10-22 14.30.05/
      Photos/ …
      Sequence/ …
```

Regras:

- **Originals/ é intocável pelo app** depois de gravado: nenhuma conversão, renomeação ou
  limpeza automática. Reordenar fotos de uma sessão (função que já existe) renomeia os
  arquivos — **[decisão]** permitir reordenar dentro do Project (renomeia originais, XMP e
  editadas juntos) ou só antes de adicionar?
- **Edited/ é da pessoa** (ou do Lightroom): o app só lê. Uma foto conta como editada quando
  existe em `Edited/<sessão>/` um arquivo com o mesmo nome-base do original (`01_SL3_1_IMG_4821`)
  com extensão jpg/jpeg/png/tif/tiff; com mais de um, vale o mais recente. Tamanho diferente
  do original (ex.: 1620×1080 contra 6000×4000) gera aviso, não bloqueio.
- **Exports/** é o padrão de destino ao exportar de um Project; a pessoa pode escolher outra
  pasta na hora (como hoje).
- Nomes de sessão: os de hoje (`AAAA-MM-DD HH.MM.SS`), estáveis; o **rótulo** (ex.: "Pose 7")
  é um texto opcional no `session.json`, editável na janela Project, e aparece nas listas ao
  lado da hora. **[decisão]** quer o rótulo nesta etapa?

## `stillpoint-project.json`

```json
{
  "stillpoint": "project",
  "version": 1,
  "name": "Lúcia - Studio A",
  "created": "2026-10-22T14:03:10-03:00",
  "sessions": [
    { "folder": "2026-10-22 14.30.05", "added": "2026-10-22T14:30:21-03:00" }
  ],
  "export": { "mode": "sequence", "formats": ["mp4"], "fps": 6, "loops": 3, "reverse": true,
              "height": 1080, "quality": "high", "useEdited": "when-available" }
}
```

- `sessions` é um índice (ordem de inclusão). A verdade sobre cada sessão está na pasta dela
  (`session.json`); se o índice e as pastas discordarem, as pastas mandam e o índice é
  refeito (uma pasta copiada à mão para `Originals/` aparece; uma apagada some).
- `export` guarda as últimas configurações usadas no Project (pré-preenchem a janela).

## `session.json` (dentro de `Originals/<sessão>/`)

```json
{
  "shotAt": "2026-10-22T14:30:05-03:00",
  "label": "Pose 7",
  "cameras": [ { "order": 1, "name": "SL3_1", "model": "Canon EOS Rebel SL3" }, … ],
  "timing": "Sweep · 0.2 s · 1 → 9",
  "plan": "SL3_1:0,T7_1:200,…",
  "missing": [ { "shot": 10, "camera": "T7_2", "error": "0x00000081" } ]
}
```

Substitui os arquivos `.saved` e `.missing` de hoje dentro do Project (fora dele, continuam).

## Como o app se comporta

| Situação | Hoje | Com Project |
| --- | --- | --- |
| Abrir o app | sessões da pasta de dados | as mesmas **+** as do Project aberto (lembrado em `settings.txt`, `project=`) |
| Disparar | sessão vai para a pasta de dados | **[decisão]** com um Project aberto, a sessão nova entra direto nele (opção "Add new sessions to the project", ligada por padrão) — ou sempre pede "Add to project"? |
| "Add to project" | — | **move** a pasta da sessão para `Originals/` (mesmo disco: instantâneo; outro disco: copia com andamento e apaga). A sessão continua na lista, com a etiqueta "In project" |
| "Remove from project" | — | **[decisão]** volta para a pasta de dados (como não salva) ou só "Delete" (apaga)? |
| Save sessions (sessão fora do Project) | exporta e a sessão sai do app | igual |
| Export (sessão no Project) | — | exporta para `Exports/` (ou outra pasta) e a sessão **fica** |
| Fechar o app com sessões não salvas | pergunta | sessões no Project **não contam** como não salvas |
| Preview/cache | na pasta de dados | igual (cache fora do Project; o Project só tem originais, editadas e exports) |

Janelas: o projeto aberto é um **botão na barra de cima**, ao lado do logo (nome · sessões ·
fotos · editadas ▾), com menu: projeto atual (caminho, "Project window…", "Open folder"),
recentes, "Switch project…", "New project…", "Close project" (decisão de 2026-10-29, depois de
comparar quatro opções em protótipo — https://claude.ai/artifact/Wh9kwPwy1Wq4EKWYsgeLeP). Na
lista de sessões, as do projeto ficam em cima e as que estão só no app embaixo do divisor **"Not
in project · n"** (com "Add to project ↑"); arrastar uma sessão até o botão da barra adiciona,
até o divisor remove. Janela **Project** (lista com estado originals / n de m edited, seleção,
rótulo, Export com "Use edited when available"; "Open folder", "Switch", "Close project").
Os botões "Open in Lightroom / Photoshop" ficam para a etapa 20; nesta etapa a pasta
`Edited/` já é reconhecida (quem exportar do Lightroom à mão já vê "edited").

## Trocar e abrir Projects

- **New project…**: escolhe (ou cria) uma pasta vazia; o app grava o `stillpoint-project.json`.
- **Open project…**: escolhe uma pasta; sem o json, o app pergunta se quer criar um Project
  ali. Lista de recentes em `settings.txt` (`recentProjects=`), até 10.
- Project cuja pasta sumiu (HD externo desligado): aviso e a lista mostra só as sessões da
  pasta de dados; volta quando a pasta aparecer.

## O que fica de fora desta etapa

- Lightroom / Photoshop (etapa 20) — só a pasta `Edited/` entra agora.
- Lenticular (etapa 19).
- Mover um Project inteiro de lugar pelo app (é só mover a pasta; o app reabre por "Open
  project").

## Decisões (2026-10-29, dono do projeto)

1. Sessão nova **entra direto** no Project aberto.
2. "Remove from project" **volta para o app** (como não salva).
3. Reordenar fotos **também dentro do Project**.
4. Rótulo por sessão **nesta etapa**.
5. `stillpoint-project.json` — ok.

## Ajustes feitos na implementação

- `.missing` e `.previews` continuam dentro da pasta da sessão (arquivos escondidos), também
  no Project; `session.json` guarda `shotAt`, `label`, `timing`, `plan`, `cameras`.
- `session.json`, `.xmp`, `.json` e `.txt` nunca contam como foto.
- A opção "Add new sessions to the project" não existe como chave: com Project aberto, entra
  sempre (decisão 1); para não entrar, fecha-se o Project.
- Export de sessão do Project: `exportSessions("project", "edited", …)` grava em `Exports/`
  sem perguntar a pasta e nunca apaga nem marca a sessão; o "Save sessions" comum continua
  igual (pergunta a pasta; sessão do Project é copiada e fica).
