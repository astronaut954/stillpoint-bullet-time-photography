-- File › Plug-in Extras › "Stillpoint: run self-test" (ver SelfTest.lua)
local LrTasks = import 'LrTasks'
local LrDialogs = import 'LrDialogs'
local Bridge = require 'Bridge'
LrTasks.startAsyncTask(function()
	local ok, problem = LrTasks.pcall(function() require('SelfTest').run() end)
	if not ok then
		Bridge.testFolder = nil
		require('Ui').answers = nil
		Bridge.problem('self-test: ' .. tostring(problem))
		LrDialogs.message('Stillpoint self-test stopped', tostring(problem), 'critical')
	end
end, 'Stillpoint: self-test')
