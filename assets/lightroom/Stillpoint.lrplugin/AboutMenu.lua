-- File › Plug-in Extras › "About the Stillpoint plugin…"
local LrDialogs = import 'LrDialogs'
local Bridge = require 'Bridge'
LrDialogs.message('Stillpoint plugin ' .. tostring(Bridge.version()),
	'Receives sessions from Stillpoint (Edit in Lightroom Classic) and sends the edited photos back (Export to Stillpoint).\n\n'
	.. 'Stillpoint installs and updates this plugin by itself (Stillpoint › Settings › Lightroom & Photoshop).\n\n'
	.. 'Bridge folder: ' .. tostring(Bridge.folder() or 'not found'), 'info')
