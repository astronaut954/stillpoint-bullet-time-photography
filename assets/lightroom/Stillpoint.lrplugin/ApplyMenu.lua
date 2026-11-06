-- File › Plug-in Extras › "Apply the selected photo's edit to the session"
local LrTasks = import 'LrTasks'
local LrDialogs = import 'LrDialogs'
local Bridge = require 'Bridge'
LrTasks.startAsyncTask(function()
	local ok, problem = LrTasks.pcall(function() require('Actions').applyPhoto01() end)
	if not ok then
		Bridge.problem('Apply photo 01 edit to the session: ' .. tostring(problem))
		LrDialogs.message('Stillpoint', tostring(problem), 'critical')
	end
end, 'Stillpoint: Apply photo 01 edit to the session')
