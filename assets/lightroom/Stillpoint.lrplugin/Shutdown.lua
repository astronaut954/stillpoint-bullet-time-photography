-- Plugin desligado no Plug-in Manager ou recarregado. Não para a espera aqui: desligado, ela fica quieta e volta a
-- responder ao ligar (ver Bridge.start); recarregado, o Init.lua começa uma volta nova e a antiga para sozinha.
local ok, Bridge = pcall(require, 'Bridge')
if ok and Bridge and Bridge.note then pcall(Bridge.note, 'Shutdown.lua (plugin turned off or reloaded)') end
