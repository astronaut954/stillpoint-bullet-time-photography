-- Etapa 20, pedaço 2: o painel do Stillpoint no Lightroom Classic (janela flutuante, fica aberta enquanto você edita).
-- Mostra o projeto e a sessão das fotos escolhidas, o que está acontecendo e os botões Export to Stillpoint e
-- Apply photo 01 edit to all. Abre sozinho quando o Stillpoint manda uma sessão; File › Plug-in Extras ›
-- Show Stillpoint panel abre de novo.
local LrBinding = import 'LrBinding'
local LrColor = import 'LrColor'
local LrDialogs = import 'LrDialogs'
local LrFunctionContext = import 'LrFunctionContext'
local LrTasks = import 'LrTasks'
local LrView = import 'LrView'

local Bridge = require 'Bridge'
local Actions = require 'Actions'

local Panel = {}
local handle = nil      -- a janela aberta (toFront, close), nil se fechada
local opening = false

local function plural(n, one, many)
	return tostring(n) .. ' ' .. (n == 1 and one or many)
end

-- O que o painel mostra agora (lido a cada meio segundo enquanto ele está aberto)
local function refresh(props)
	local ok, groups = LrTasks.pcall(function() return (Actions.target()) end)
	groups = ok and groups or {}
	local group = groups[1]
	local count = 0
	for _, g in ipairs(groups) do count = count + #g.items end
	props.project = group and group.project or '—'
	props.session = group and (#groups > 1 and (#groups .. ' sessions') or (group.title .. ' · ' .. plural(#group.items, 'photo', 'photos'))) or '—'
	local importing = Bridge.importing()
	if importing then
		props.status = 'Importing ' .. plural(importing, 'photo', 'photos') .. '…'
		props.canExport = false
	elseif Actions.state.busy then
		props.status = Actions.state.text or 'Exporting…'
		props.canExport = false
	elseif Actions.state.text and group and group.session == Actions.state.lastSession then
		props.status = Actions.state.text
		props.canExport = true
	elseif group then
		props.status = 'Ready to edit. Export when you are done.'
		props.canExport = true
	else
		props.status = 'Select photos of a Stillpoint session.'
		props.canExport = false
	end
	props.showGoto = group ~= nil and group.session == Actions.state.lastSession and not Actions.state.busy
	local others = 0
	if group then
		-- "Apply photo 01 edit to all 9": as fotos da sessão inteira (as escolhidas, se a coleção não existir)
		local photos = group.collection and group.collection:getPhotos() or group.items
		others = #photos
	end
	props.applyTitle = others > 1 and ('Apply photo 01 edit to all ' .. others) or 'Apply photo 01 edit to the session'
	props.canApply = props.canExport and others > 1
end

local function run(what)
	LrTasks.startAsyncTask(function()
		local ok, problem = LrTasks.pcall(what)
		if not ok then
			Bridge.problem('panel: ' .. tostring(problem))
			LrDialogs.message('Stillpoint', tostring(problem), 'critical')
		end
	end, 'Stillpoint panel action')
end

function Panel.show()
	if handle then
		LrTasks.pcall(function() handle.toFront() end)
		return
	end
	if opening then return end
	opening = true
	LrTasks.startAsyncTask(function()
		LrFunctionContext.callWithContext('Stillpoint panel', function(context)
			local props = LrBinding.makePropertyTable(context)
			refresh(props)
			local f = LrView.osFactory()
			local dim = LrColor(0.55, 0.55, 0.55)
			local contents = f:column {
				bind_to_object = props,
				spacing = f:control_spacing(),
				width = 330,
				f:row {
					f:static_text { title = 'STILLPOINT', font = '<system/bold>', fill_horizontal = 1 },
					f:static_text { title = 'Plugin ' .. tostring(Bridge.version()), text_color = dim },
				},
				f:static_text { title = 'PROJECT', font = '<system/small>', text_color = dim },
				f:static_text { title = LrView.bind('project'), width_in_chars = 40 },
				f:static_text { title = 'SESSION', font = '<system/small>', text_color = dim },
				f:static_text { title = LrView.bind('session'), width_in_chars = 40 },
				f:separator { fill_horizontal = 1 },
				f:static_text { title = LrView.bind('status'), width_in_chars = 40, height_in_lines = 2 },
				f:push_button { title = 'Export to Stillpoint', fill_horizontal = 1, enabled = LrView.bind('canExport'),
					action = function() run(Actions.exportToStillpoint) end },
				f:push_button { title = LrView.bind('applyTitle'), fill_horizontal = 1, enabled = LrView.bind('canApply'),
					action = function() run(Actions.applyPhoto01) end },
				f:push_button { title = 'Go to session in Stillpoint', fill_horizontal = 1, visible = LrView.bind('showGoto'),
					action = function() run(Actions.goToSession) end },
				f:static_text { title = 'Edited photos go to the project\'s Edited folder as 16-bit TIFF. Stillpoint picks them up by itself.',
					width_in_chars = 40, height_in_lines = 2, text_color = dim, font = '<system/small>' },
			}
			-- Atualiza enquanto a janela está aberta
			LrTasks.startAsyncTask(function()
				while opening or handle do
					LrTasks.sleep(0.5)
					if handle then LrTasks.pcall(refresh, props) end
				end
			end, 'Stillpoint panel refresh')
			local ok, problem = LrTasks.pcall(function()
				LrDialogs.presentFloatingDialog(_PLUGIN, {
					title = 'Stillpoint',
					contents = contents,
					blockTask = true,
					onShow = function(t) handle = t; opening = false end,
					windowWillClose = function() handle = nil; opening = false end,
				})
			end)
			handle = nil
			opening = false
			if not ok then Bridge.problem('panel: ' .. tostring(problem)) end
		end)
	end, 'Stillpoint panel')
end

return Panel
