-- Library › Plug-in Extras › "Stillpoint: listen again": volta a esperar os pedidos do Stillpoint sem fechar o
-- Lightroom (para quando o Stillpoint diz que o plugin não respondeu)
local LrDialogs = import 'LrDialogs'
local Bridge = require 'Bridge'
Bridge.start('started again from the menu')
LrDialogs.showBezel('Stillpoint: listening again')
