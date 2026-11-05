-- Fica esperando os pedidos do Stillpoint enquanto o Lightroom Classic está aberto.
local LrTasks = import 'LrTasks'
local LrPathUtils = import 'LrPathUtils'

-- Primeira coisa: uma linha em plugin-started.txt, dentro da pasta do próprio plugin. Se esse arquivo não
-- aparecer, o Lightroom não rodou este arquivo (o plugin não foi carregado).
local function startedNote(text)
	local file = io.open(LrPathUtils.child(_PLUGIN.path, 'plugin-started.txt'), 'ab')
	if file then
		file:write(os.date('%Y-%m-%d %H:%M:%S') .. ' ' .. text .. '\n')
		file:close()
	end
end
startedNote('Init.lua ran')

local ok, Bridge = pcall(require, 'Bridge')
if not ok then
	startedNote('Bridge.lua did not load: ' .. tostring(Bridge))
	return
end
startedNote('bridge folder: ' .. tostring(Bridge.folder()))

-- Cada carga do plugin tem um número: ao recarregar (Plug-in Manager › Reload) ou ao desligar (Shutdown.lua
-- soma 1), a volta antiga para sozinha
_G.StillpointGeneration = (_G.StillpointGeneration or 0) + 1
local generation = _G.StillpointGeneration

LrTasks.startAsyncTask(function()
	startedNote('waiting for requests')
	Bridge.note('Stillpoint plugin ' .. tostring(Bridge.version()) .. ' started (bridge folder: ' .. tostring(Bridge.folder()) .. ')')
	while _G.StillpointGeneration == generation do
		local ok2, problem = LrTasks.pcall(Bridge.tick)
		if not ok2 then
			Bridge.problem(problem)
			startedNote('problem: ' .. tostring(problem))
		end
		LrTasks.sleep(0.5)
	end
	startedNote('stopped')
	Bridge.note('Stillpoint plugin stopped')
end, 'Stillpoint bridge')
