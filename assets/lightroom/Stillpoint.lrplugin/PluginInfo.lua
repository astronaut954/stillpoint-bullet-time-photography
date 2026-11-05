-- Plug-in Manager: o que o plugin faz e onde ele conversa com o Stillpoint
local LrView = import 'LrView'
local Bridge = require 'Bridge'

return {
	sectionsForTopOfDialog = function(f)
		return {
			{
				title = 'Stillpoint',
				f:row { f:static_text { title = 'Receives sessions from Stillpoint (Edit in Lightroom Classic) and puts them in the Stillpoint collection set.', width_in_chars = 60, height_in_lines = 2 } },
				f:row { f:static_text { title = 'Stillpoint plugin ' .. (Bridge.version() or '?'), width_in_chars = 60 } },
				f:row { f:static_text { title = 'Bridge folder: ' .. (Bridge.folder() or 'not found (reinstall the plugin from Stillpoint › Settings)'), width_in_chars = 60, height_in_lines = 2 } },
			},
		}
	end,
}
