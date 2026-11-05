-- Lightroom fechando (ou o plugin sendo desligado): para de esperar pedidos e avisa que saiu
_G.StillpointStop = true
local ok, Bridge = pcall(require, 'Bridge')
if ok and Bridge and Bridge.goodbye then pcall(Bridge.goodbye) end
