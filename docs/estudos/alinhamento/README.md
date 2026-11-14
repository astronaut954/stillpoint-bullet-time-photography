# Estudo: alinhamento automático pela cena (etapa 21)

Experimento de 2026-11-13, fora do app. Serve para saber se o caminho do Xangle (achar a posição das câmeras pela
própria cena) dá os quatro valores do Align photos com precisão suficiente.

- `scene.py`: gera uma cena virtual (sala com textura, um "sujeito" no centro) vista por N câmeras num arco, com
  erros de mira, altura, distância e giro. Guarda a resposta certa em `truth.json`.
- `solve.py`: acha as câmeras com o COLMAP (`pip install pycolmap`) e calcula, por câmera, mover X/Y, giro e tamanho.
  Compara com a resposta certa.
- `matrix.py`: roda os casos; o resultado está em `matrix.json`.
- `demo.py`: aplica a receita e monta o GIF antes/depois.

Rodar: `pip install pycolmap opencv-python-headless numpy pillow`, depois `python3 matrix.py` nesta pasta.

Resultado (cena virtual, 1500×1000 px, só processador): acertou em todos os casos com 15° a 30° entre câmeras, com
erro abaixo de 1 pixel e de 0,3°, em 4 a 25 segundos. Falhou com 3 câmeras a 60° uma da outra. Limite do estudo: a
cena virtual é o melhor caso possível (muita textura, sem reflexo, sem distorção de lente, sem ruído de verdade).
Falta repetir com fotos de verdade.

## Segunda rodada (2026-11-13): cena mais dura e como a biblioteca entraria no app

`matrix2.py` / `matrix2.json`, sempre 9 câmeras em 120° salvo indicação:

- Aguentou sem perder precisão (erro abaixo de 1 px e 0,1°): distorção forte de lente, ruído alto, pouca luz,
  desfoque, exposição e cor diferentes entre câmeras, erros de montagem três vezes maiores.
- Piorou: lentes com zoom diferente entre câmeras (erro de 4 a 6 px e até 2,8% no tamanho; a cena virtual não tem a
  distância focal gravada no arquivo, que as fotos de verdade têm e que deve ajudar: não testado); sujeito liso com
  cenário detalhado (até 11 px e 0,8°).
- Falhou: estúdio com fundo liso e sujeito liso (não achou nenhuma câmera); 9 câmeras em volta inteira, a 40° uma
  da outra (achou 3 de 9). Com 18 em volta inteira (20°), achou todas.

Biblioteca: o COLMAP tem licença BSD. Existe pronto, sem placa de vídeo, para Mac com Apple Silicon (21 MB compactado)
e Windows x64 (24 MB), medido pelos pacotes `pycolmap` 4.2.1. Os instaladores do Stillpoint têm cerca de 9 MB hoje.

## Terceira rodada (2026-11-13): objeto de referência, a cartela do Stillpoint

Decisão do dono: começar pela cartela que já existe (`assets/chart/stillpoint-chart.pdf`), com alternativa para 360°
ou para pegar a parte de trás a definir depois. `solve_chart.py` usa o `Chart::Find` do próprio app (pela ferramenta
`ChartFindTool`, do build de teste) para achar as 4 marcas e tira mover, giro e tamanho de cada câmera.
`matrix3.py` / `matrix3.json` e `matrix4.py` / `matrix4.json`:

- Quando as 4 marcas são achadas certo, o erro fica abaixo de 0,6 px, 0,3° e 0,3% no tamanho, inclusive em estúdio
  liso, com a distância focal conhecida com 5% de erro e com lentes de zoom diferente (onde o caminho pela cena piorou).
- O detector de hoje foi feito para a cartela ocupando a foto. Com a cartela A4 a 3 m (pequena na foto), ele perde
  câmeras a 60° de lado e às vezes a 30° ou 45°; a 5 m, ou com ruído e desfoque, erra as marcas (valores absurdos).
- Com as marcas três vezes maiores na foto (o que o detector veria se procurasse na foto inteira de 6000 px em vez de
  reduzi-la para 2000 px, ou com a cartela impressa maior), achou todas as câmeras até 60° de lado, a 3 m e a 5 m,
  também com ruído e desfoque. A 80° de lado não acha: é o limite de um objeto plano.

## Quarta rodada (2026-11-13): haste com duas marcas, clicar numa foto e achar nas outras

Decisão do dono: haste com duas marcas mais marcação na tela; o app mostra uma lista de objetos recomendados em vez
de exigir uma marca só. `pole_demo.py` gera a simulação visual da haste. `find_marks.py` procura, nas outras fotos,
as duas marcas que a pessoa clicou numa foto (semelhança em cor, vários tamanhos e giros, par coerente, ajuste fino).
`matrix5.py` / `matrix5.json`, fotos de 2400 px de largura, clique com alguns pixels de erro:

- Achou todas as câmeras com fita laranja e com bolas laranja, em estúdio liso e em lugar com muito detalhe, com
  ruído, desfoque e cor diferente entre câmeras, a 5 m e com 18 câmeras em volta inteira.
- Faixa impressa de anéis: achou 7 de 8 e 8 de 8; com erros de montagem grandes (câmeras muito giradas), 6 de 8. As
  erradas saíram com confiança baixa (0,44 contra 0,69 ou mais das certas): dá para recusar.
- Fita cinza-clara, de pouco contraste: 7 de 8 em estúdio liso e só 2 de 8 em lugar com detalhe, e as erradas saíram
  com confiança igual à das certas: não dá para recusar sozinho.
- Precisão: erro médio de 4 a 8 px e máximo perto de 10 px (0,2% a 0,4% da largura da foto). Com as marcas a 0,6 m
  uma da outra, 8 px equivalem a cerca de 0,8° de giro e 1,4% de tamanho. É pior que a cartela e que o cálculo pela
  cena (abaixo de 1 px). Falta um passo que centralize o ponto na marca; não feito.

## Quinta rodada (2026-11-13): levar o ponto ao centro da marca

`find_marks.snap` leva o clique (e cada ponto achado) ao centro da marca: a cor que é comum sob o ponto e rara em
volta. Com as duas marcas conhecidas, a marca da largura da haste (fita, faixa) usa só uma faixa estreita em volta do
ponto, para uma mancha da mesma cor ao lado não puxar; a marca mais larga que a haste (bola) usa a marca inteira. O
tipo é medido na foto clicada (`is_wide`). A referência certa passou a ser a superfície da haste virada para a câmera
(a fita) e o centro da bola. `matrix5.json`, clique com 5 px de erro, fotos de 2400 px:

- Fita laranja, faixa impressa e bolas: erro médio de 0,5 a 1,4 px e máximo de 0,9 a 2,7 px, em estúdio liso, lugar
  com muito detalhe, ruído e desfoque, 5 m e 18 câmeras em volta inteira. Mesma faixa da cartela e do cálculo pela cena.
- Faixa impressa com câmeras muito giradas: perde 2 de 8, com confiança baixa (dá para recusar e pedir o clique).
- Fita de pouco contraste: continua ruim (3 a 5 de 8 e até 30 px). A lista de recomendações deve pedir cor viva.
