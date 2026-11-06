-- Etapa 20, pedaço 2: "Stillpoint" como destino na janela File › Export… do Lightroom Classic (Export To: Stillpoint).
-- Faz o mesmo que o Export to Stillpoint do painel, pela janela de sempre do Lightroom: a pasta e os nomes são do
-- Stillpoint (<Projeto>/Edited/<sessão>/, nome do original); o formato (TIFF ou JPEG), o tamanho e a cor podem mudar.
-- Começa em TIFF 16 bits, tamanho cheio, Adobe RGB.
local LrApplication = import 'LrApplication'
local LrColor = import 'LrColor'
local LrDialogs = import 'LrDialogs'
local LrFileUtils = import 'LrFileUtils'
local LrPathUtils = import 'LrPathUtils'
local LrTasks = import 'LrTasks'
local LrView = import 'LrView'

local Bridge = require 'Bridge'
local Ui = require 'Ui'
local Actions = require 'Actions'

local DIM = LrColor(0.5, 0.5, 0.5)

local function plural(n, one, many)
	return tostring(n) .. ' ' .. (n == 1 and one or many)
end

local service = {}

service.hideSections = { 'exportLocation', 'fileNaming' }
service.allowFileFormats = { 'TIFF', 'JPEG' }
service.allowColorSpaces = { 'AdobeRGB', 'sRGB' }
service.hidePrintResolution = true
service.canExportVideo = false
service.exportPresetFields = { { key = 'stillpointReady', default = false } }

-- Primeira vez: TIFF 16 bits, tamanho cheio, Adobe RGB (depois vale o que a pessoa deixou)
function service.startDialog(propertyTable)
	if not propertyTable.stillpointReady then
		propertyTable.LR_format = 'TIFF'
		propertyTable.LR_export_bitDepth = 16
		propertyTable.LR_tiff_compressionMethod = 'compressionMethod_ZIP'
		propertyTable.LR_export_colorSpace = 'AdobeRGB'
		propertyTable.LR_size_doConstrain = false
		propertyTable.stillpointReady = true
	end
end

-- O que o quadro mostra: preenchido por uma tarefa à parte. A janela Export… monta o quadro fora de uma tarefa, onde o
-- catálogo não pode ser lido ("Yielding is not allowed within a C or metamethod call"; teste do dono, 2026-11-06)
local function fill(propertyTable)
	LrTasks.startAsyncTask(function()
		local ok, groups = LrTasks.pcall(function() return (Actions.target()) end)
		groups = ok and groups or {}
		local first = groups[1]
		if not first then
			propertyTable.stillpointProject = '—'
			propertyTable.stillpointSession = 'Select photos that Stillpoint sent from a project (they are in the project\'s Originals folder).'
			propertyTable.stillpointGoes = '—'
			propertyTable.stillpointNames = '—'
			return
		end
		local base = LrPathUtils.removeExtension(first.items[1].place.file)
		propertyTable.stillpointProject = first.project
		propertyTable.stillpointSession = #groups == 1 and (first.title .. (first.title ~= first.session and '  (' .. first.session .. ')' or '')) or (#groups .. ' sessions')
		propertyTable.stillpointGoes = '…/' .. first.project .. '/Edited/' .. (#groups == 1 and first.session or '<each session>') .. '/'
		propertyTable.stillpointNames = 'the same as the originals (' .. base .. '.tif …)'
	end, 'Stillpoint export dialog')
end

local function buildSection(f, propertyTable)
	propertyTable.stillpointProject = propertyTable.stillpointProject or '…'
	propertyTable.stillpointSession = propertyTable.stillpointSession or '…'
	propertyTable.stillpointGoes = propertyTable.stillpointGoes or '…'
	propertyTable.stillpointNames = propertyTable.stillpointNames or '…'
	fill(propertyTable)
	local function line(label, key)
		return f:row {
			f:static_text { title = label, width = LrView.share('stillpointLabel'), alignment = 'right', text_color = DIM },
			f:static_text { title = LrView.bind(key), width_in_chars = 50, truncation = 'middle' },
		}
	end
	return { {
		title = 'Stillpoint', synopsis = 'Edited photos for a Stillpoint project', spacing = f:control_spacing(),
		bind_to_object = propertyTable,
		line('Project', 'stillpointProject'),
		line('Session', 'stillpointSession'),
		line('Goes to', 'stillpointGoes'),
		line('File names', 'stillpointNames'),
		f:static_text { title = 'Folder and names are set by Stillpoint. Only the format, size and color below can change.', text_color = DIM },
	} }
end

function service.sectionsForTopOfDialog(f, propertyTable)
	local ok, sections = pcall(buildSection, f, propertyTable)
	if ok then return sections end
	Bridge.problem('export dialog section: ' .. tostring(sections))
	return { { title = 'Stillpoint', synopsis = 'Edited photos for a Stillpoint project',
		f:static_text { title = 'The photos go to the project\'s Edited folder, with the names of the originals.' } } }
end

function service.processRenderedPhotos(functionContext, exportContext)
	-- O painel do Stillpoint vem para a frente durante o export (pedido do dono, 2026-11-06)
	require('Ui').showPanel()
	local exportSession = exportContext.exportSession
	local settings = exportContext.propertyTable
	-- photosToExport() devolve um iterador (não uma lista)
	local photos = {}
	local listOrIterator = exportSession:photosToExport()
	if type(listOrIterator) == 'function' then
		for photo in listOrIterator do table.insert(photos, photo) end
	else
		for _, photo in ipairs(listOrIterator or {}) do table.insert(photos, photo) end
	end
	-- Onde vai cada foto, e quais já têm editada no Stillpoint
	local places, already, outside, unedited = {}, 0, 0, 0
	local clearedBy = {}
	for _, photo in ipairs(photos) do
		local place = Actions.placeOf(photo)
		-- Sem edição no Lightroom: não vai (não vira "editada" no Stillpoint). Decidido antes de começar a gerar os
		-- arquivos: pular depois disso dava "AgExportRendition:skip(): must not be called after exportSession has
		-- started rendering" (teste do dono, 2026-11-06)
		local edited = place and Actions.hasOwnEdit(photo, nil)
		if place and not edited then
			unedited = unedited + 1
			-- A edição foi tirada no Lightroom, mas o Stillpoint ainda tem a editada: ela sai de lá também
			if #Actions.editedFiles(place) > 0 then
				local key = place.root .. '|' .. place.session
				clearedBy[key] = clearedBy[key] or { place = place, files = {} }
				table.insert(clearedBy[key].files, place.file)
				LrTasks.pcall(function() Bridge.setSent(place.path, nil) end)
			end
			place = nil
		elseif place then
			place.existing = Actions.editedFiles(place)
			if #place.existing > 0 then already = already + 1 end
			places[photo] = place
		else
			outside = outside + 1
		end
	end
	local count = #photos - outside - unedited
	local skipExisting = false
	if already > 0 then
		local answer = Ui.confirm(
			(already == count and (count == 1 and 'This photo already has' or 'These ' .. count .. ' photos already have') or (already .. ' of these ' .. count .. ' photos already ' .. (already == 1 and 'has' or 'have')))
				.. ' an edited version in Stillpoint',
			'Replace the edited version' .. (already == 1 and '' or 's') .. ' with this export?'
				.. (already < count and ' Or export only the photos that do not have one yet.' or ''),
			'Replace', 'Cancel', already < count and 'Only the new ones' or nil)
		if answer == 'cancel' then
			for _, rendition in exportContext:renditions() do LrTasks.pcall(function() rendition:skipRender() end) end
			return
		end
		skipExisting = answer == 'other'
	end
	local progress = exportContext:configureProgress { title = 'Export to Stillpoint: ' .. plural(count, 'photo', 'photos') }
	Actions.state.busy = true
	local bySession, order = {}, {}
	local done, failed = 0, 0
	-- 1ª volta: pula o que não vai, antes de qualquer arquivo ser gerado (se o Lightroom já tiver começado a gerar,
	-- o arquivo é gerado e jogado fora)
	local todo = {}
	for _, rendition in exportContext:renditions { stopIfCanceled = true } do
		local place = places[rendition.photo]
		local skip = not place or (skipExisting and #place.existing > 0)
		local discard = false
		if skip then
			local ok = LrTasks.pcall(function() rendition:skipRender() end)
			if not ok then discard = true end
		end
		if not skip or discard then table.insert(todo, { rendition = rendition, place = place, discard = discard }) end
	end
	-- 2ª volta: espera cada arquivo e põe na pasta Edited
	for _, job in ipairs(todo) do
		local rendition, place = job.rendition, job.place
		local ok, pathOrMessage = rendition:waitForRender()
		if job.discard then
			if ok then LrFileUtils.delete(pathOrMessage) end
		else
			if ok then
				LrFileUtils.createAllDirectories(place.edited)
				local ext = LrPathUtils.extension(pathOrMessage):lower()
				local target = LrPathUtils.child(place.edited, LrPathUtils.removeExtension(place.file) .. '.' .. ext)
				-- Uma editada por foto: a antiga (este formato ou outro) sai antes
				for _, old in ipairs(place.existing) do
					if old:lower() ~= target:lower() then
						local moved = LrTasks.pcall(function() return LrFileUtils.moveToTrash(old) end)
						if not moved then LrFileUtils.delete(old) end
					end
				end
				if LrFileUtils.exists(target) then LrFileUtils.delete(target) end
				local moved, problem = LrFileUtils.move(pathOrMessage, target)
				if moved == false then
					failed = failed + 1
					Bridge.problem('export dialog to Stillpoint: could not move ' .. tostring(pathOrMessage) .. ' to ' .. target .. ': ' .. tostring(problem))
				else
					done = done + 1
					LrTasks.pcall(function() Bridge.setSent(place.path, rendition.photo:getDevelopSettings()) end)
					local key = place.root .. '|' .. place.session
					if not bySession[key] then bySession[key] = { place = place, files = {} }; table.insert(order, bySession[key]) end
					table.insert(bySession[key].files, LrPathUtils.leafName(target))
				end
			else
				failed = failed + 1
				rendition:uploadFailed(pathOrMessage)
				Bridge.problem('export dialog to Stillpoint: ' .. tostring(pathOrMessage))
			end
			Actions.state.text = 'Exporting ' .. (done + failed) .. ' of ' .. count
		end
	end
	-- Sessões que só tiram editadas: entram na lista também
	for key, c in pairs(clearedBy) do
		if not bySession[key] then bySession[key] = { place = c.place, files = {} }; table.insert(order, bySession[key]) end
	end
	for _, s in ipairs(order) do
		local lines = { 'session=' .. s.place.session, 'project=' .. s.place.root, 'count=' .. #s.files, 'failed=0',
			'color=' .. tostring(settings.LR_export_colorSpace), 'format=' .. tostring(settings.LR_format) }
		for _, name in ipairs(s.files) do table.insert(lines, 'file=' .. name) end
		local key = s.place.root .. '|' .. s.place.session
		for _, name in ipairs(clearedBy[key] and clearedBy[key].files or {}) do table.insert(lines, 'cleared=' .. name) end
		Actions.writeMessage('exported', lines)
		Actions.state.lastSession = s.place.session
		Bridge.note('export dialog to Stillpoint: ' .. s.place.session .. ', ' .. #s.files .. ' exported, ' .. tostring(settings.LR_format))
	end
	Actions.state.busy = false
	Actions.state.text = plural(done, 'edited photo', 'edited photos') .. ' sent to Stillpoint ✓' .. (failed > 0 and (' · ' .. failed .. ' failed') or '')
	if outside > 0 then
		Ui.message(plural(outside, 'photo was', 'photos were') .. ' not exported',
			(outside == 1 and 'It is' or 'They are') .. ' not from a Stillpoint project (not in a project\'s Originals folder).', 'info')
	end
	if progress then LrTasks.pcall(function() progress:done() end) end
end

return service
