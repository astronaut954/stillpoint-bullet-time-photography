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

local function buildSection(f, propertyTable)
	-- Fora de uma tarefa (a janela Export… chama assim): pcall comum
	local ok, groups = pcall(function() return (Actions.target()) end)
	if not ok then Bridge.problem('export dialog: ' .. tostring(groups)) end
	groups = ok and groups or {}
	local first = groups[1]
	local function line(label, value)
		return f:row {
			f:static_text { title = label, width = LrView.share('stillpointLabel'), alignment = 'right', text_color = DIM },
			f:static_text { title = value, width_in_chars = 50, truncation = 'middle' },
		}
	end
	local rows = { title = 'Stillpoint', synopsis = 'Edited photos for a Stillpoint project', spacing = f:control_spacing() }
	if first then
		local base = LrPathUtils.removeExtension(first.items[1].place.file)
		table.insert(rows, line('Project', first.project))
		table.insert(rows, line('Session', #groups == 1 and (first.title .. (first.title ~= first.session and '  (' .. first.session .. ')' or '')) or (#groups .. ' sessions')))
		table.insert(rows, line('Goes to', '…/' .. first.project .. '/Edited/' .. (#groups == 1 and first.session or '<each session>') .. '/'))
		table.insert(rows, line('File names', 'the same as the originals (' .. base .. '.tif …)'))
	else
		table.insert(rows, f:static_text { title = 'Select photos that Stillpoint sent from a project (they are in the project\'s Originals folder).', width_in_chars = 60, height_in_lines = 2 })
	end
	table.insert(rows, f:static_text { title = 'Folder and names are set by Stillpoint. Only the format, size and color below can change.', text_color = DIM })
	return { rows }
end

function service.sectionsForTopOfDialog(f, propertyTable)
	local ok, sections = pcall(buildSection, f, propertyTable)
	if ok then return sections end
	Bridge.problem('export dialog section: ' .. tostring(sections))
	return { { title = 'Stillpoint', synopsis = 'Edited photos for a Stillpoint project',
		f:static_text { title = 'The photos go to the project\'s Edited folder, with the names of the originals.' } } }
end

function service.processRenderedPhotos(functionContext, exportContext)
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
	local places, already, outside = {}, 0, 0
	for _, photo in ipairs(photos) do
		local place = Actions.placeOf(photo)
		if place then
			place.existing = Actions.editedFiles(place)
			if #place.existing > 0 then already = already + 1 end
			places[photo] = place
		else
			outside = outside + 1
		end
	end
	local count = #photos - outside
	local skipExisting = false
	if already > 0 then
		local answer = LrDialogs.confirm(
			(already == count and (count == 1 and 'This photo already has' or 'These ' .. count .. ' photos already have') or (already .. ' of these ' .. count .. ' photos already ' .. (already == 1 and 'has' or 'have')))
				.. ' an edited version in Stillpoint',
			'Replace the edited version' .. (already == 1 and '' or 's') .. ' with this export?'
				.. (already < count and ' Or export only the photos that do not have one yet.' or ''),
			'Replace', 'Cancel', already < count and 'Only the new ones' or nil)
		if answer == 'cancel' then
			for _, rendition in exportContext:renditions() do rendition:skipRender() end
			return
		end
		skipExisting = answer == 'other'
	end
	local progress = exportContext:configureProgress { title = 'Export to Stillpoint: ' .. plural(count, 'photo', 'photos') }
	Actions.state.busy = true
	local bySession, order = {}, {}
	local done, failed = 0, 0
	for _, rendition in exportContext:renditions { stopIfCanceled = true } do
		local place = places[rendition.photo]
		if not place or (skipExisting and #place.existing > 0) then
			rendition:skipRender()
		else
			local ok, pathOrMessage = rendition:waitForRender()
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
	for _, s in ipairs(order) do
		local lines = { 'session=' .. s.place.session, 'project=' .. s.place.root, 'count=' .. #s.files, 'failed=0',
			'color=' .. tostring(settings.LR_export_colorSpace), 'format=' .. tostring(settings.LR_format) }
		for _, name in ipairs(s.files) do table.insert(lines, 'file=' .. name) end
		Actions.writeMessage('exported', lines)
		Actions.state.lastSession = s.place.session
		Bridge.note('export dialog to Stillpoint: ' .. s.place.session .. ', ' .. #s.files .. ' exported, ' .. tostring(settings.LR_format))
	end
	Actions.state.busy = false
	Actions.state.text = plural(done, 'edited photo', 'edited photos') .. ' sent to Stillpoint ✓' .. (failed > 0 and (' · ' .. failed .. ' failed') or '')
	if outside > 0 then
		LrDialogs.message(plural(outside, 'photo was', 'photos were') .. ' not exported',
			(outside == 1 and 'It is' or 'They are') .. ' not from a Stillpoint project (not in a project\'s Originals folder).', 'info')
	end
	if progress then LrTasks.pcall(function() progress:done() end) end
end

return service
