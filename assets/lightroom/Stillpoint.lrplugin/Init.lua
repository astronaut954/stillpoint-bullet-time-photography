-- Fica esperando os pedidos do Stillpoint enquanto o Lightroom Classic está aberto.
local LrTasks = import 'LrTasks'
local Bridge = require 'Bridge'

-- Cada carga do plugin tem um número: ao recarregar (Plug-in Manager › Reload) ou ao desligar (Shutdown.lua
-- soma 1), a volta antiga para sozinha
_G.StillpointGeneration = (_G.StillpointGeneration or 0) + 1
local generation = _G.StillpointGeneration

LrTasks.startAsyncTask(function()
	Bridge.note('Stillpoint plugin ' .. tostring(Bridge.version()) .. ' started (bridge folder: ' .. tostring(Bridge.folder()) .. ')')
	while _G.StillpointGeneration == generation do
		local ok, problem = LrTasks.pcall(Bridge.tick)
		if not ok then Bridge.problem(problem) end
		LrTasks.sleep(0.5)
	end
	Bridge.note('Stillpoint plugin stopped')
end, 'Stillpoint bridge')
