-- Lightroom fechando (ou o plugin sendo desligado): a espera dos pedidos para e o sinal de vida some
_G.StillpointGeneration = (_G.StillpointGeneration or 0) + 1
local ok, Bridge = pcall(require, 'Bridge')
if ok and Bridge then
	if Bridge.note then pcall(Bridge.note, 'Lightroom closing or plugin turned off (Shutdown.lua)') end
	if Bridge.goodbye then pcall(Bridge.goodbye) end
end
