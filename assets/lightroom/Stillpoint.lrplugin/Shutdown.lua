-- Lightroom fechando (ou o plugin sendo desligado): a espera dos pedidos para e o sinal de vida some
_G.StillpointGeneration = (_G.StillpointGeneration or 0) + 1
local ok, Bridge = pcall(require, 'Bridge')
if ok and Bridge and Bridge.goodbye then pcall(Bridge.goodbye) end
