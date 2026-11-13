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
