-- File › Plug-in Extras › "Cancel editing" (o mesmo do botão do painel; decisão do dono, 2026-11-10: os botões do
-- painel também no menu, para não depender do painel quando ele fica atrás da janela do Lightroom)
local LrTasks = import 'LrTasks'
local LrDialogs = import 'LrDialogs'
local Bridge = require 'Bridge'
LrTasks.startAsyncTask(function()
	local ok, problem = LrTasks.pcall(function() require('Actions').cancelEditing() end)
	if not ok then
		Bridge.problem('Cancel editing: ' .. tostring(problem))
		LrDialogs.message('Stillpoint', tostring(problem), 'critical')
	end
end, 'Stillpoint: Cancel editing')
