-- File › Plug-in Extras › "Go to session in Stillpoint"
local LrTasks = import 'LrTasks'
local LrDialogs = import 'LrDialogs'
local Bridge = require 'Bridge'
LrTasks.startAsyncTask(function()
	local ok, problem = LrTasks.pcall(function() require('Actions').goToSession() end)
	if not ok then
		Bridge.problem('Go to session in Stillpoint: ' .. tostring(problem))
		LrDialogs.message('Stillpoint', tostring(problem), 'critical')
	end
end, 'Stillpoint: Go to session in Stillpoint')
