-- Plugin do Stillpoint para o Lightroom Classic (etapa 20).
-- O Stillpoint copia esta pasta para a pasta de plugins do Lightroom Classic
-- (Mac: ~/Library/Application Support/Adobe/Lightroom/Modules; Windows: %APPDATA%\Adobe\Lightroom\Modules),
-- que o Lightroom carrega sozinho ao abrir. A conversa com o Stillpoint é por arquivos (ver Bridge.lua).
return {
	LrSdkVersion = 11.0,
	LrSdkMinimumVersion = 6.0,
	LrToolkitIdentifier = 'com.astronaut954.stillpoint',
	LrPluginName = 'Stillpoint',
	LrPluginInfoUrl = 'https://github.com/astronaut954/stillpoint-bullet-time-photography',
	-- Carrega ao abrir o Lightroom (não só quando um menu do plugin é usado): é o que fica esperando os pedidos
	LrForceInitPlugin = true,
	LrInitPlugin = 'Init.lua',
	LrShutdownPlugin = 'Shutdown.lua',
	LrPluginInfoProvider = 'PluginInfo.lua',
	-- File › Plug-in Extras (LrExportMenuItems) e Library › Plug-in Extras (LrLibraryMenuItems)
	LrExportMenuItems = {
		{ title = 'Export to Stillpoint', file = 'ExportMenu.lua' },
		{ title = 'Apply photo 01 edit to the session', file = 'ApplyMenu.lua' },
		{ title = 'Show Stillpoint panel', file = 'PanelMenu.lua' },
		{ title = 'Go to session in Stillpoint', file = 'GotoMenu.lua' },
		{ title = 'About the Stillpoint plugin…', file = 'AboutMenu.lua' },
		{ title = 'Stillpoint: listen again', file = 'Restart.lua' },
	},
	LrLibraryMenuItems = {
		{ title = 'Export to Stillpoint', file = 'ExportMenu.lua' },
		{ title = 'Apply photo 01 edit to the session', file = 'ApplyMenu.lua' },
		{ title = 'Show Stillpoint panel', file = 'PanelMenu.lua' },
		{ title = 'Go to session in Stillpoint', file = 'GotoMenu.lua' },
		{ title = 'About the Stillpoint plugin…', file = 'AboutMenu.lua' },
		{ title = 'Stillpoint: listen again', file = 'Restart.lua' },
	},
	VERSION = { major = 1, minor = 0, revision = 0, build = 0 },
}
