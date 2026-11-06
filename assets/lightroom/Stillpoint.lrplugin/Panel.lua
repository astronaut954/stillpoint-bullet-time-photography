-- Etapa 20, pedaço 2: o painel do Stillpoint no Lightroom Classic (janela flutuante, fica aberta enquanto você edita).
-- Mostra o projeto e a sessão das fotos escolhidas, o que está acontecendo e os botões Export to Stillpoint e
-- Apply photo 01 edit to all. Abre sozinho quando o Stillpoint manda uma sessão; File › Plug-in Extras ›
-- Show Stillpoint panel abre de novo.
local LrBinding = import 'LrBinding'
local LrColor = import 'LrColor'
local LrDialogs = import 'LrDialogs'
local LrFunctionContext = import 'LrFunctionContext'
local LrPathUtils = import 'LrPathUtils'
local LrTasks = import 'LrTasks'
local LrView = import 'LrView'

local Bridge = require 'Bridge'
local Actions = require 'Actions'

local Panel = {}
local handle = nil      -- a janela aberta (toFront, close), nil se fechada
local opening = false

local function image(name) return LrPathUtils.child(_PLUGIN.path, name) end

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
	props.dot = image(props.canExport and 'dot-green.png' or (importing or Actions.state.busy) and 'dot-amber.png' or 'dot-gray.png')
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

-- O desenho do painel: margens, a marca do Stillpoint (o quadrado verde e o nome), rótulos pequenos em cinza,
-- valores em destaque, o estado numa caixa com a bolinha (verde pronto, âmbar trabalhando, cinza sem sessão),
-- os botões e a nota embaixo. O Lightroom desenha os botões e o fundo no estilo dele: as cores do Stillpoint
-- ficam na marca, nos rótulos e na bolinha.
local GREEN = LrColor(0.04, 0.55, 0.20)
local DIM = LrColor(0.50, 0.50, 0.50)
local WIDTH = 320

local function mono(size, bold)
	return { name = WIN_ENV and (bold and 'Consolas Bold' or 'Consolas') or (bold and 'Menlo-Bold' or 'Menlo-Regular'), size = size }
end

local function label(f, text)
	return f:static_text { title = text, font = mono(10, false), text_color = DIM }
end

function Panel.layout(f, props)
	local version = tostring(Bridge.version()):match('^[^+]+') or tostring(Bridge.version())
	return f:column {
		bind_to_object = props,
		margin = 18,
		spacing = 14,
		width = WIDTH + 36,
		f:row {
			spacing = 8,
			f:picture { value = image('mark.png') },
			f:static_text { title = 'STILLPOINT', font = mono(13, true), text_color = GREEN, fill_horizontal = 1 },
			f:static_text { title = 'Plugin ' .. version, font = mono(10, false), text_color = DIM },
		},
		f:separator { fill_horizontal = 1 },
		f:column {
			spacing = 3,
			label(f, 'PROJECT'),
			f:static_text { title = LrView.bind('project'), font = '<system/bold>', width = WIDTH, truncation = 'middle' },
		},
		f:column {
			spacing = 3,
			label(f, 'SESSION'),
			f:static_text { title = LrView.bind('session'), font = '<system/bold>', width = WIDTH, truncation = 'middle' },
		},
		f:group_box {
			title = '',
			fill_horizontal = 1,
			f:row {
				spacing = 8,
				f:picture { value = LrView.bind('dot') },
				f:static_text { title = LrView.bind('status'), width = WIDTH - 40, height_in_lines = 2 },
			},
		},
		f:column {
			spacing = 8,
			fill_horizontal = 1,
			f:push_button { title = 'Export to Stillpoint', fill_horizontal = 1, enabled = LrView.bind('canExport'),
				action = function() run(Actions.exportToStillpoint) end },
			f:push_button { title = LrView.bind('applyTitle'), fill_horizontal = 1, enabled = LrView.bind('canApply'),
				action = function() run(Actions.applyPhoto01) end },
			f:push_button { title = 'Go to session in Stillpoint', fill_horizontal = 1, visible = LrView.bind('showGoto'),
				action = function() run(Actions.goToSession) end },
		},
		f:static_text { title = 'Edited photos go to the project\'s Edited folder as 16-bit TIFF. Stillpoint picks them up by itself.',
			width = WIDTH, height_in_lines = 2, text_color = DIM, font = '<system/small>' },
	}
end

-- Sem enfeites (se o Lightroom recusar algum detalhe do desenho acima)
function Panel.plainLayout(f, props)
	return f:column {
		bind_to_object = props,
		spacing = f:control_spacing(),
		f:static_text { title = 'STILLPOINT', font = '<system/bold>' },
		f:static_text { title = LrView.bind('project'), width_in_chars = 40 },
		f:static_text { title = LrView.bind('session'), width_in_chars = 40 },
		f:static_text { title = LrView.bind('status'), width_in_chars = 40, height_in_lines = 2 },
		f:push_button { title = 'Export to Stillpoint', enabled = LrView.bind('canExport'), action = function() run(Actions.exportToStillpoint) end },
		f:push_button { title = LrView.bind('applyTitle'), enabled = LrView.bind('canApply'), action = function() run(Actions.applyPhoto01) end },
		f:push_button { title = 'Go to session in Stillpoint', visible = LrView.bind('showGoto'), action = function() run(Actions.goToSession) end },
	}
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
			local contents
			local built, problem = LrTasks.pcall(function() contents = Panel.layout(f, props) end)
			if not built then
				-- Algum detalhe do desenho que esta versão do Lightroom não aceita: o painel simples, sem enfeites
				Bridge.problem('panel layout: ' .. tostring(problem))
				contents = Panel.plainLayout(f, props)
			end
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
