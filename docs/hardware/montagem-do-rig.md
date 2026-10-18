# Montagem do rig (9 a 12 câmeras num MacBook)

Guia de montagem e lista de compras para um rig de bullet time estável, com o Stillpoint
num MacBook (sem placa PCIe), câmeras **Canon EOS Rebel T7** padronizadas e cabos de até
~4 m até o computador. Decisões e preços de 2026-10-18; os preços são de anúncios
conferidos naquele dia (variam) e estão marcados com a loja.

Objetivo: tirar as três causas mais comuns de câmera "sumindo" ou travando o app —
**bateria acabando**, **USB mal alimentado/encadeado** e **cabo ruim** — antes de
mexer em software (etapa 16, um processo por câmera) e no disparo por cabo (etapa 17).

## 1. Topologia: como ligar tudo

```
  câmeras 1–6  ──cabos mini-USB 2–5 m──►  HUB A (7 portas, fonte própria)
                                               │ cabo USB 3–4 m
  câmeras 7–12 ──cabos mini-USB 2–5 m──►  HUB B (7 portas, fonte própria)
                                               │ cabo USB 3–4 m
                                        MacBook: um hub em cada porta USB-C
                                        (adaptador USB-C → USB-A em cada uma)
  cada câmera: fonte "dummy" ACK-E10 na tomada (sem bateria)
  tudo (MacBook, hubs, fontes): numa régua ligada ao nobreak
```

Regras:
- **Um hub por porta USB-C do MacBook**, nunca hub ligado em hub. Cada hub recebe no máximo
  6 câmeras (a 7ª porta fica livre para a caixa de disparo ou para uma câmera de reserva).
- **Hubs com fonte própria** (12 V, 3–4 A). Os hubs de R$ 30 sem marca não servem: caem com
  carga e reiniciam as câmeras.
- Os hubs ficam **no meio do arco de câmeras**, não ao lado do computador: assim os cabos
  câmera→hub são curtos (2 m) e só o cabo hub→MacBook é longo (3–4 m).
- **Cabos mini-USB de marca** (Vention, UGREEN) ou os "blindados para câmera Canon"; os de
  5 m são o limite do USB 2.0 sem repetidor — acima disso, extensor ativo.
- **Nenhuma câmera na bateria.** Fonte dummy em todas; bateria só como reserva.
- MacBook **na tomada** (a porta USB alimentada pela bateria do notebook cai de tensão com 2
  hubs cheios).

Inferência a confirmar no seu MacBook: nos Macs com chip Apple, cada porta USB-C costuma ter
o seu controlador USB; ligar um hub em cada porta separa o tráfego das duas metades do rig.
Se as duas portas forem do mesmo lado do notebook e compartilharem o controlador, funciona
do mesmo jeito, só sem o ganho de paralelismo.

## 2. Lista de compras (por câmera e por rig)

### Por câmera (×9 ou ×12)

| Item | Para quê | Preço conferido (2026-10-18) |
| --- | --- | --- |
| Canon EOS Rebel T7 usada, com lente kit 18-55 | a câmera do rig (todas iguais) | R$ 2.400–2.800 com lente kit e acessórios — OLX, 286 anúncios no Brasil (`olx.com.br/anuncios/canon-t7`) |
| Fonte dummy ACK-E10 (DR-E10 + adaptador bivolt) | câmera na tomada, sem bateria | R$ 156 (Soleste, bivolt 7,4 V 2 A) a R$ 177 (Andoer) — Magazine Luiza, busca "fonte acke10" |
| Cabo USB-A → mini-USB 2 m (Vention) | câmera → hub | R$ 38,39 (Pix) — Magazine Luiza |
| ou cabo mini-USB 5 m blindado "para câmera Canon" | câmeras mais longe do hub | R$ 64,08 (Pix) — Magazine Luiza |
| Tripé ou suporte com rosca 1/4" | fixar a câmera no arco | não conferido (R$ 80–150 cada, usados/simples) |

### Por rig (uma vez)

| Item | Qtd | Preço conferido (2026-10-18) |
| --- | --- | --- |
| Hub USB 3.0 de 7 portas com fonte própria — Orico H7013-U3-AD (fonte inclusa) | 2 | R$ 194,04 cada (Pix) — Magazine Luiza. Alternativa: TP-Link UH720 (fonte 12 V 4 A), esgotado na KaBuM na data |
| Cabo de extensão USB 3.0 (A fêmea → A macho) 3 m, para o hub chegar ao MacBook | 2 | não conferido (R$ 40–70) |
| Adaptador USB-C → USB-A | 2 | não conferido (R$ 20–50; qualquer de marca serve) |
| Nobreak 1200 VA (MacBook + 2 hubs + 12 fontes dummy: ~150 W) — Intelbras XNB 1200 VA | 1 | R$ 643–694 (Pix) — Magazine Luiza; ATTIV 1500 VA com 8 tomadas R$ 935 |
| Régua de tomadas com 12+ saídas (ou duas) | 1–2 | não conferido |
| Caixa de disparo (etapa 17): ESP32, MCP23017, PC817, jacks 2,5 mm, cabos | 1 | ver `caixa-de-disparo.pdf` (lista com preços conferidos em 2026-10-16) |

## 3. Orçamento (R$, aproximado)

Você já tem 1 T7 e 1 SL3. Nos dois cenários abaixo a SL3 fica de fora do rig (modelo
diferente) e as câmeras compradas são T7 usadas com lente kit a ~R$ 2.500.

| | 9 câmeras (comprar 8) | 12 câmeras (comprar 11) |
| --- | --- | --- |
| Câmeras T7 usadas com lente | 20.000 | 27.500 |
| Fontes dummy (R$ 160 × todas as T7) | 1.440 | 1.920 |
| Cabos mini-USB 2 m (R$ 38; 1/3 de 5 m a R$ 64) | ~420 | ~560 |
| 2 hubs Orico com fonte | 390 | 390 |
| Extensões USB 3 m + adaptadores USB-C | ~200 | ~200 |
| Nobreak 1200 VA | 700 | 700 |
| Tripés/suportes (R$ 120 × câmeras) | ~1.100 | ~1.450 |
| **Total** | **~24.300** | **~32.700** |
| Total sem as câmeras (só infraestrutura) | ~4.300 | ~5.200 |

Em T6 (corpo R$ 1.000–1.500 na OLX + lente usada): tira uns R$ 8–10 mil dos totais, mas aí
vale padronizar as suas duas também.

## 4. Ordem de montagem e teste (com o Stillpoint)

1. Fontes dummy em todas as câmeras; conferir que ligam sem bateria.
2. Hub A com 3 câmeras, cabos de 2 m, hub na porta USB-C esquerda do MacBook. Abrir o
   Stillpoint: as 3 conectam? `Identify` em cada uma.
3. Hub B com as outras, porta direita. Todas conectam? Se alguma ficar "connecting", trocar o
   cabo dela antes de qualquer outra coisa.
4. `It's bullet time` (At once, Download wait 10 s) três vezes seguidas: todas as fotos chegam
   nas três? Anotar no log quem atrasa.
5. Camera settings → Match automatically com Test shot: as T7 iguais devem ficar quase idênticas
   sem a cartela.
6. Timing → Sweep 0,2 s e depois 0,1 s: ver no log em que intervalo as fotos começam a faltar
   ou atrasar (é a medição do limite por USB que falta no aviso da Timeline).
7. Deixar tudo ligado 1 hora e disparar de novo: câmera que caiu nesse tempo = cabo ou fonte
   dummy daquela câmera.

## 5. Alugar para testar antes de comprar (7 T7)

Conferido em 2026-10-18:
- Locadoras de Porto Alegre encontradas (Backup Locadora, Rabbits, Konvictus) trabalham com
  linha profissional (EOS R, C70…) e **não listam T7/T6i** nos sites; preço e disponibilidade
  só por contato (Backup: (51) 99925-7665; Rabbits: (51) 98300-7439; Konvictus: (51) 98195-3441).
- **LocNow Audiovisual (Belo Horizonte)**: Canon EOS Rebel T7 corpo a **R$ 180/dia**, retirada
  em BH, sem lente (`locnowaudiovisual.com.br`). Entrega para outras cidades não informada.
- Estimativa para 7 T7 por 3 dias (sem lente, sem frete): 7 × R$ 180 × 3 = **R$ 3.780**; se a
  locadora cobrar fim de semana como 1 diária, **R$ 1.260–2.520**. Lentes 18-55: usar as suas
  duas + alugar/pedir emprestadas (não conferido).
- Alternativa que costuma sair mais barata: **comprar 7 T7 usadas (~R$ 17.500) e revender as
  que não quiser** depois do teste — a T7 segura preço (anúncios entre R$ 2.400 e 2.800); a
  diferença de revenda de uns R$ 200–300 por câmera fica na faixa do aluguel, e as que ficarem
  já são o rig.

## 6. Fontes

- OLX, "canon t7": https://www.olx.com.br/anuncios/canon-t7 (286 anúncios, R$ 2.400–2.800 com lente)
- OLX, "camera canon t6 corpo": https://www.olx.com.br/anuncios/camera-canon-t6-corpo (R$ 1.000–1.950)
- Magazine Luiza, fontes ACK-E10: https://m.magazineluiza.com.br/busca/fonte+acke10/
- Magazine Luiza, hubs com fonte: https://m.magazineluiza.com.br/busca/hub+usb+com+fonte/
- Magazine Luiza, cabos mini-USB Canon: https://www.magazineluiza.com.br/busca/cabo+usb+para+canon/
- Magazine Luiza, nobreaks Intelbras: https://m.magazineluiza.com.br/busca/nobreak+intelbras
- KaBuM, TP-Link UH720: https://www.kabum.com.br/produto/290918/hub-tp-link-7-portas-usb-3-0-uh720-preto (esgotado)
- LocNow (BH), T7 corpo R$ 180/dia: https://locnowaudiovisual.com.br/equipamentos/cameras/01-corpo-de-camera/canon-01-corpo-de-camera/camera-canon-eos-rebel-t7/
- Backup Locadora (POA): https://backuplocadora.com.br/categoria/cameras · Rabbits (POA): https://www.rabbitslocadora.com.br/ · Konvictus (POA): https://locadora.konvictus.com.br/
