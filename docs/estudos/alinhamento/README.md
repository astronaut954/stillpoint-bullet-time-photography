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
