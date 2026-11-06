-- File › Plug-in Extras › "Export to Stillpoint"
local LrTasks = import 'LrTasks'
local LrDialogs = import 'LrDialogs'
local Bridge = require 'Bridge'
LrTasks.startAsyncTask(function()
	local ok, problem = LrTasks.pcall(function() require('Actions').exportToStillpoint() end)
	if not ok then
		Bridge.problem('Export to Stillpoint: ' .. tostring(problem))
		LrDialogs.message('Stillpoint', tostring(problem), 'critical')
	end
end, 'Stillpoint: Export to Stillpoint')
