-- Fica esperando os pedidos do Stillpoint enquanto o Lightroom Classic está aberto.
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
Bridge.start('Lightroom opened')
