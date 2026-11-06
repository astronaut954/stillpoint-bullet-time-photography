-- Etapa 20, pedaço 2: o que o plugin faz no Lightroom Classic a pedido da pessoa (menus e painel):
--   Export to Stillpoint             as fotos selecionadas viram TIFF de 16 bits, tamanho cheio, em <Projeto>/Edited/<sessão>/,
--                                    com o nome dos originais; o Stillpoint fica sabendo pelo arquivo exported-*.txt
--   Apply photo 01 edit to the session   a edição da foto 01 vai para as outras fotos da sessão
--   Go to session in Stillpoint      o Stillpoint mostra a sessão (arquivo goto-*.txt)
-- Uma foto é de um projeto do Stillpoint quando está em <Projeto>/Originals/<sessão>/.
local LrApplication = import 'LrApplication'
local LrBinding = import 'LrBinding'
local LrColor = import 'LrColor'
local LrDialogs = import 'LrDialogs'
local LrExportSession = import 'LrExportSession'
local LrFileUtils = import 'LrFileUtils'
local LrFunctionContext = import 'LrFunctionContext'
local LrPathUtils = import 'LrPathUtils'
local LrPrefs = import 'LrPrefs'
local LrProgressScope = import 'LrProgressScope'
local LrTasks = import 'LrTasks'
local LrView = import 'LrView'

local Bridge = require 'Bridge'

local Actions = {}
local EDITED_EXTENSIONS = { 'tif', 'tiff', 'jpg', 'jpeg', 'png', 'TIF', 'TIFF', 'JPG', 'JPEG', 'PNG' }

-- O que o painel mostra enquanto exporta ("Exporting 4 of 9 · 16-bit TIFF") e depois ("9 edited photos sent…")
Actions.state = { busy = false, text = nil, lastSession = nil }

local function plural(n, one, many)
	return tostring(n) .. ' ' .. (n == 1 and one or many)
end

-- Onde a foto está no projeto do Stillpoint (nil se não for de um projeto)
function Actions.placeOf(photo)
	local path = photo:getRawMetadata('path')
	if not path then return nil end
	local sessionDir = LrPathUtils.parent(path)
	local originals = sessionDir and LrPathUtils.parent(sessionDir)
	if not originals or LrPathUtils.leafName(originals) ~= 'Originals' then return nil end
	local root = LrPathUtils.parent(originals)
	local session = LrPathUtils.leafName(sessionDir)
	return {
		path = path,
		file = LrPathUtils.leafName(path),
		session = session,
		root = root,
		project = LrPathUtils.leafName(root),
		edited = LrPathUtils.child(LrPathUtils.child(root, 'Edited'), session),
	}
end

-- A coleção do Stillpoint em que a foto está (Stillpoint › projeto › sessão), se houver
local function stillpointCollection(photo)
	-- pcall que serve dentro e fora de uma tarefa (a janela Export… chama fora)
	local call = (LrTasks.canYield and LrTasks.canYield()) and LrTasks.pcall or pcall
	local ok, list = call(function() return photo:getContainedCollections() end)
	if not ok then return nil end
	for _, collection in ipairs(list or {}) do
		local parent = collection:getParent()
		local top = parent and parent:getParent()
		if top and top:getName() == 'Stillpoint' then return collection end
	end
	return nil
end

-- Editadas que já existem para essa foto (mesmo nome, qualquer formato que o Stillpoint lê)
function Actions.editedFiles(place)
	local base = LrPathUtils.removeExtension(place.file)
	local found = {}
	for _, ext in ipairs(EDITED_EXTENSIONS) do
		local candidate = LrPathUtils.child(place.edited, base .. '.' .. ext)
		if LrFileUtils.exists(candidate) == 'file' then
			local seen = false
			for _, f in ipairs(found) do if f:lower() == candidate:lower() then seen = true end end
			if not seen then table.insert(found, candidate) end
		end
	end
	return found
end

-- As fotos escolhidas no Lightroom (as selecionadas; sem seleção, as da tira de baixo), separadas por sessão
function Actions.target()
	local catalog = LrApplication.activeCatalog()
	local photos = catalog:getTargetPhotos() or {}
	local bySession, order, outside = {}, {}, 0
	for _, photo in ipairs(photos) do
		local place = Actions.placeOf(photo)
		if place then
			local key = place.root .. '|' .. place.session
			if not bySession[key] then
				bySession[key] = { session = place.session, root = place.root, project = place.project, edited = place.edited, items = {} }
				table.insert(order, bySession[key])
			end
			table.insert(bySession[key].items, { photo = photo, place = place })
		else
			outside = outside + 1
		end
	end
	for _, group in ipairs(order) do
		local collection = stillpointCollection(group.items[1].photo)
		group.title = collection and collection:getName() or group.session
		group.collection = collection
	end
	return order, outside, #photos
end

-- Número da foto na sessão ("01_SL3_1_IMG_4821.CR3" -> 1)
local function orderOf(file)
	return tonumber((file or ''):match('^(%d+)_')) or 9999
end

function Actions.writeMessage(prefix, lines)
	local folder = Bridge.folder()
	if not folder then return false end
	Actions.counter = (Actions.counter or 0) + 1
	local name = string.format('%s-%d-%04d.txt', prefix, os.time(), Actions.counter)
	local file = io.open(LrPathUtils.child(folder, name), 'wb')
	if not file then return false end
	file:write(table.concat(lines, '\n') .. '\nend=1\n')
	file:close()
	return true
end

-- ---------------- Export to Stillpoint ----------------

local function exportGroup(group, items, colorSpace, progress, doneBefore, total)
	LrFileUtils.createAllDirectories(group.edited)
	local photos = {}
	for _, item in ipairs(items) do table.insert(photos, item.photo) end
	local settings = {
		LR_export_destinationType = 'specificFolder',
		LR_export_destinationPathPrefix = group.edited,
		LR_export_useSubfolder = false,
		LR_collisionHandling = 'overwrite',
		LR_renamingTokensOn = false,          -- o nome do original, com .tif
		LR_extensionCase = 'lowercase',
		LR_format = 'TIFF',
		LR_export_bitDepth = 16,
		LR_tiff_compressionMethod = 'compressionMethod_ZIP',
		LR_export_colorSpace = colorSpace,
		LR_size_doConstrain = false,          -- tamanho cheio
		LR_outputSharpeningOn = false,
		LR_useWatermark = false,
		LR_embeddedMetadataOption = 'all',
		LR_removeLocationMetadata = false,
		LR_reimportExportedPhoto = false,
		LR_export_postProcessing = 'doNothing',
		LR_includeVideoFiles = false,
	}
	local session = LrExportSession { photosToExport = photos, exportSettings = settings }
	local done, failed, files = 0, 0, {}
	for _, rendition in session:renditions { progressScope = progress, renderProgressPortion = 1, stopIfCanceled = true } do
		local ok, pathOrMessage = rendition:waitForRender()
		if ok then
			done = done + 1
			table.insert(files, LrPathUtils.leafName(pathOrMessage))
		else
			failed = failed + 1
			Bridge.problem('export to Stillpoint: ' .. tostring(pathOrMessage))
		end
		Actions.state.text = 'Exporting ' .. (doneBefore + done + failed) .. ' of ' .. total .. ' · 16-bit TIFF'
	end
	return done, failed, files
end

-- Pergunta e exporta. Roda dentro de uma tarefa do Lightroom (LrTasks).
function Actions.exportToStillpoint()
	if Actions.state.busy then
		LrDialogs.message('Stillpoint is already exporting', 'Wait for the export that is running to finish.', 'info')
		return
	end
	local groups, outside, total = Actions.target()
	-- A sessão inteira que está aberta no Lightroom, não só as fotos selecionadas (decisão do dono, 2026-11-06)
	-- Só as fotos com edição no Lightroom: uma foto sem edição não vira "editada" no Stillpoint (decisão do dono,
	-- 2026-11-06). complete = a sessão inteira foi olhada (o Stillpoint tira o "In Lightroom" se nada falhar)
	local unedited = 0
	for _, group in ipairs(groups) do
		local all = Actions.sessionItems(group)
		if #all > 0 then group.items = all end
		group.complete = #all > 0
		local kept = {}
		for _, item in ipairs(group.items) do
			if Actions.hasOwnEdit(item.photo, nil) then table.insert(kept, item) else unedited = unedited + 1 end
		end
		group.items = kept
	end
	local withEdits = {}
	for _, group in ipairs(groups) do if #group.items > 0 then table.insert(withEdits, group) end end
	if #withEdits == 0 then
		LrDialogs.message('Nothing to export yet', 'None of these photos has an edit in Lightroom Classic. Edit a photo and choose Export to Stillpoint again.', 'info')
		return
	end
	groups = withEdits
	if #groups == 0 then
		LrDialogs.message('Select photos of a Stillpoint project',
			'Export to Stillpoint works with photos that Stillpoint sent from a project (they are in the project\'s Originals folder). '
			.. (total > 0 and (plural(outside, 'selected photo is', 'selected photos are') .. ' from somewhere else.') or 'No photo is selected.'), 'info')
		return
	end
	-- Fotos que já têm editada no Stillpoint: pergunta antes de trocar (decisão do dono, 2026-11-05)
	local already, count = 0, 0
	for _, group in ipairs(groups) do
		for _, item in ipairs(group.items) do
			count = count + 1
			item.existing = Actions.editedFiles(item.place)
			if #item.existing > 0 then already = already + 1 end
		end
	end
	local skipExisting = false
	if already > 0 then
		local answer = LrDialogs.confirm(
			(already == count and (count == 1 and 'This photo already has' or 'These ' .. count .. ' photos already have') or (already .. ' of these ' .. count .. ' photos already ' .. (already == 1 and 'has' or 'have')))
				.. ' an edited version in Stillpoint',
			'Replace the edited version' .. (already == 1 and '' or 's') .. ' with this export?'
				.. (already < count and ' Or export only the photos that do not have one yet.' or ''),
			'Replace', 'Cancel', already < count and 'Only the new ones' or nil)
		if answer == 'cancel' then return end
		skipExisting = answer == 'other'
	end
	local work = {}
	local n = 0
	for _, group in ipairs(groups) do
		local items = {}
		for _, item in ipairs(group.items) do
			if not (skipExisting and #item.existing > 0) then table.insert(items, item) end
		end
		if #items > 0 then
			table.insert(work, { group = group, items = items })
			n = n + #items
		end
	end
	if n == 0 then return end

	-- A janela da exportação: para onde vai e o espaço de cor (Adobe RGB ou converter para sRGB)
	local prefs = LrPrefs.prefsForPlugin()
	local colorSpace
	local go = LrFunctionContext.callWithContext('Stillpoint export', function(context)
		local props = LrBinding.makePropertyTable(context)
		props.colorSpace = prefs.colorSpace or 'AdobeRGB'
		local f = LrView.osFactory()
		local first = work[1].group
		local sessionText = #work == 1 and (first.title .. (first.title ~= first.session and '  (' .. first.session .. ')' or '')) or (#work .. ' sessions')
		local goesTo = #work == 1 and (LrPathUtils.child(LrPathUtils.child(first.project, 'Edited'), first.session) .. '/') or (first.project .. '/Edited/<each session>/')
		local function line(label, value)
			return f:row { f:static_text { title = label, width = LrView.share('label'), alignment = 'right', text_color = LrColor(0.55, 0.55, 0.55) },
				f:static_text { title = value, width_in_chars = 46 } }
		end
		local contents = f:column {
			bind_to_object = props,
			spacing = f:control_spacing(),
			f:static_text { title = 'STILLPOINT · Edited photos for a Stillpoint project', font = '<system/bold>' },
			line('Project', first.project),
			line('Session', sessionText),
			line('Photos', plural(n, 'photo', 'photos') .. ' · 16-bit TIFF · full size' .. (unedited > 0 and (' (' .. plural(unedited, 'photo without an edit stays', 'photos without an edit stay') .. ' out)') or '')),
			line('Goes to', '…/' .. goesTo),
			line('File names', 'the same as the originals (' .. LrPathUtils.removeExtension(work[1].items[1].place.file) .. '.tif …)'),
			f:row {
				f:static_text { title = 'Color', width = LrView.share('label'), alignment = 'right' },
				f:popup_menu { value = LrView.bind('colorSpace'), items = {
					{ title = 'Adobe RGB (1998)', value = 'AdobeRGB' },
					{ title = 'Convert to sRGB', value = 'sRGB' },
				} },
			},
			f:static_text { title = 'Folder and names are set by Stillpoint. Stillpoint picks the photos up by itself.', text_color = LrColor(0.55, 0.55, 0.55) },
		}
		local result = LrDialogs.presentModalDialog { title = 'Export to Stillpoint', contents = contents, actionVerb = 'Export' }
		colorSpace = props.colorSpace
		return result == 'ok'
	end)
	if not go then return end
	prefs.colorSpace = colorSpace

	Actions.state.busy = true
	Actions.state.text = 'Exporting 0 of ' .. n .. ' · 16-bit TIFF'
	local progress = LrProgressScope { title = 'Export to Stillpoint: ' .. plural(n, 'photo', 'photos') }
	local doneAll, failedAll = 0, 0
	local ok, problem = LrTasks.pcall(function()
		for _, job in ipairs(work) do
			-- Ao trocar: a editada antiga de outro formato (.jpg, .png) vai para o Lixo, para ficar uma por foto
			for _, item in ipairs(job.items) do
				for _, old in ipairs(item.existing or {}) do
					if LrPathUtils.extension(old):lower() ~= 'tif' then
						local moved = LrTasks.pcall(function() return LrFileUtils.moveToTrash(old) end)
						if not moved then LrFileUtils.delete(old) end
					end
				end
			end
			local done, failed, files = exportGroup(job.group, job.items, colorSpace, progress, doneAll + failedAll, n)
			-- Como cada foto foi mandada (o Cancel editing compara com isso)
			local sentNames = {}
			for _, name in ipairs(files) do sentNames[LrPathUtils.removeExtension(name):lower()] = true end
			for _, item in ipairs(job.items) do
				if sentNames[LrPathUtils.removeExtension(item.place.file):lower()] then
					LrTasks.pcall(function() Bridge.setSent(item.place.path, item.photo:getDevelopSettings()) end)
				end
			end
			doneAll, failedAll = doneAll + done, failedAll + failed
			local lines = { 'session=' .. job.group.session, 'project=' .. job.group.root, 'count=' .. done, 'failed=' .. failed, 'color=' .. colorSpace,
				'complete=' .. ((job.group.complete and not skipExisting) and '1' or '0') }
			for _, name in ipairs(files) do table.insert(lines, 'file=' .. name) end
			if done > 0 or failed > 0 then Actions.writeMessage('exported', lines) end
			Bridge.note('export to Stillpoint: ' .. job.group.session .. ', ' .. done .. ' exported, ' .. failed .. ' failed, ' .. colorSpace)
			Actions.state.lastSession = job.group.session
			if progress:isCanceled() then break end
		end
	end)
	progress:done()
	Actions.state.busy = false
	if not ok then
		Bridge.problem('export to Stillpoint: ' .. tostring(problem))
		Actions.state.text = nil
		LrDialogs.message('Export to Stillpoint stopped', tostring(problem), 'critical')
		return
	end
	Actions.state.text = plural(doneAll, 'edited photo', 'edited photos') .. ' sent to Stillpoint ✓'
		.. (failedAll > 0 and (' · ' .. failedAll .. ' failed') or '')
	if failedAll > 0 then
		LrDialogs.message(plural(failedAll, 'photo', 'photos') .. ' could not be exported',
			plural(doneAll, 'photo went', 'photos went') .. ' to Stillpoint. The others are listed in plugin-problems.txt, in Stillpoint\'s lightroom folder.', 'warning')
	else
		LrDialogs.showBezel(plural(doneAll, 'edited photo', 'edited photos') .. ' sent to Stillpoint')
	end
end

-- ---------------- Apply photo 01 edit to the session ----------------

-- A foto já tem edição própria no Lightroom? (o SDK nem sempre diz: nesse caso conta a editada no Stillpoint)
local function sameSettings(a, b)
	if type(a) ~= type(b) then return false end
	if type(a) == 'number' then return math.abs(a - b) < 1e-6 end
	if type(a) ~= 'table' then return a == b end
	for k, v in pairs(a) do if not sameSettings(v, b[k]) then return false end end
	for k, _ in pairs(b) do if a[k] == nil then return false end end
	return true
end

local function hasOwnEdit(photo, place)
	-- Com a edição de quando a foto chegou guardada: tem edição = está diferente dela
	local path = photo:getRawMetadata('path')
	local base = path and Bridge.baseline(path)
	if base then
		local ok, now = LrTasks.pcall(function() return photo:getDevelopSettings() end)
		if ok and now then return not sameSettings(now, base) end
	end
	for _, key in ipairs({ 'hasAdjustments', 'editCount' }) do
		local ok, value = LrTasks.pcall(function() return photo:getRawMetadata(key) end)
		if ok and value ~= nil then
			if Actions.editSignal ~= key then Actions.editSignal = key; Bridge.note('own edits read from "' .. key .. '"') end
			if type(value) == 'number' then return value > 0 end
			return value == true
		end
	end
	if Actions.editSignal ~= 'edited-folder' then Actions.editSignal = 'edited-folder'; Bridge.note('own edits read from the Edited folder') end
	return place ~= nil and #Actions.editedFiles(place) > 0
end

-- As fotos da sessão no catálogo: as da coleção do Stillpoint; sem coleção, as escolhidas
local function sessionPhotos(group)
	local list = {}
	local source = group.collection and group.collection:getPhotos() or nil
	if source then
		for _, photo in ipairs(source) do
			local place = Actions.placeOf(photo)
			if place and place.session == group.session then table.insert(list, { photo = photo, place = place }) end
		end
	end
	if #list == 0 then list = group.items end
	table.sort(list, function(a, b) return orderOf(a.place.file) < orderOf(b.place.file) end)
	return list
end

-- A foto de onde a edição sai: a que está ativa no Lightroom (a selecionada, a do Develop), se for da sessão;
-- senão a foto 01
Actions.sessionItems = sessionPhotos
Actions.hasOwnEdit = hasOwnEdit

function Actions.sourceOf(list)
	local ok, active = LrTasks.pcall(function() return LrApplication.activeCatalog():getTargetPhoto() end)
	if ok and active then
		for _, item in ipairs(list) do
			if item.photo == active then return item end
		end
	end
	return list[1]
end

-- "Apply photo 02 edit to all 9" (o número da foto ativa e o total da sessão), para o painel
function Actions.applyLabel(group)
	local list = sessionPhotos(group)
	local source = Actions.sourceOf(list)
	if not source or #list < 2 then return nil, #list end
	return string.format('%02d', orderOf(source.place.file)), #list
end

function Actions.applyPhoto01()
	local groups = Actions.target()
	if #groups == 0 then
		LrDialogs.message('Select photos of a Stillpoint session', 'Select a photo of the session (any of them) and choose this again.', 'info')
		return
	end
	if #groups > 1 then
		LrDialogs.message('Photos of more than one session are selected', 'Select photos of one session only.', 'info')
		return
	end
	local group = groups[1]
	local list = sessionPhotos(group)
	local first = Actions.sourceOf(list)
	if not first or #list < 2 then
		LrDialogs.message('Nothing to apply to', 'This session has only one photo in Lightroom Classic.', 'info')
		return
	end
	local label = string.format('%02d', orderOf(first.place.file))
	local others, edited = {}, 0
	for _, item in ipairs(list) do
		if item ~= first then
			table.insert(others, item)
			if hasOwnEdit(item.photo, item.place) then edited = edited + 1 end
		end
	end
	-- Fotos que já têm edição: sobrescrever ou aplicar só nas sem edição (decisão do dono, 2026-11-05)
	local targets = others
	if edited > 0 then
		local answer = LrDialogs.confirm(
			(edited == #others and (#others == 1 and 'The other photo already has its own edit' or ('All ' .. #others .. ' other photos already have their own edit'))
				or (edited .. ' of the ' .. #others .. ' other photos already ' .. (edited == 1 and 'has its own edit' or 'have their own edit'))),
			'Overwrite ' .. (edited == 1 and 'its' or 'their') .. ' edit with the edit of photo ' .. label .. '?' .. (edited < #others and ' Or apply it only to the photos without an edit.' or ''),
			'Overwrite', 'Cancel', edited < #others and 'Only the unedited ones' or nil)
		if answer == 'cancel' then return end
		if answer == 'other' then
			targets = {}
			for _, item in ipairs(others) do
				if not hasOwnEdit(item.photo, item.place) then table.insert(targets, item) end
			end
		end
	end
	if #targets == 0 then return end
	local settings = first.photo:getDevelopSettings()
	local catalog = LrApplication.activeCatalog()
	catalog:withWriteAccessDo('Stillpoint: apply photo ' .. label .. ' edit', function()
		for _, item in ipairs(targets) do item.photo:applyDevelopSettings(settings) end
	end, { timeout = 60 })
	Bridge.note('apply photo ' .. label .. ' edit: ' .. #targets .. ' photos of ' .. group.session)
	LrDialogs.showBezel('Photo ' .. label .. ' edit applied to ' .. plural(#targets, 'photo', 'photos'))
end

-- ---------------- Cancel editing ----------------

-- Para de editar a sessão no Lightroom (pedido do dono, 2026-11-06): se alguma foto mudou desde a última vez que foi
-- mandada ao Stillpoint (ou desde que chegou, se nunca foi), pergunta se descarta as mudanças. Depois tira a coleção
-- (como o Done editing) e avisa o Stillpoint (arquivo cancelled-*.txt), que tira o "In Lightroom" da sessão.
function Actions.cancelEditing()
	if Actions.state.busy then
		LrDialogs.message('Stillpoint is exporting', 'Wait for the export that is running to finish.', 'info')
		return
	end
	local groups = Actions.target()
	if #groups == 0 then
		LrDialogs.message('Select a photo of a Stillpoint session', 'Cancel editing works on the session of the selected photo.', 'info')
		return
	end
	if #groups > 1 then
		LrDialogs.message('Photos of more than one session are selected', 'Select photos of one session only.', 'info')
		return
	end
	local group = groups[1]
	local list = sessionPhotos(group)
	local changed = {}
	for _, item in ipairs(list) do
		local reference = Bridge.sent(item.place.path) or Bridge.baseline(item.place.path)
		if reference then
			local ok, now = LrTasks.pcall(function() return item.photo:getDevelopSettings() end)
			if ok and now and not sameSettings(now, reference) then table.insert(changed, { photo = item.photo, settings = reference }) end
		end
	end
	local discard = false
	if #changed > 0 then
		local answer = LrDialogs.confirm(
			'Discard the changes?',
			(#changed == 1 and '1 photo of this session was' or (#changed .. ' photos of this session were')) .. ' changed in Lightroom Classic and '
				.. (#changed == 1 and 'is' or 'are') .. ' not in Stillpoint yet. Discard brings '
				.. (#changed == 1 and 'it' or 'them') .. ' back to how '
				.. (#changed == 1 and 'it was' or 'they were') .. ' last sent to Stillpoint (or to how '
				.. (#changed == 1 and 'it' or 'they') .. ' arrived). Keep leaves the changes in Lightroom Classic only.',
			'Discard changes', 'Cancel', 'Keep changes')
		if answer == 'cancel' then return end
		discard = answer == 'ok'
	end
	local catalog = LrApplication.activeCatalog()
	if discard then
		catalog:withWriteAccessDo('Stillpoint: discard the changes (' .. tostring(group.title) .. ')', function()
			for _, item in ipairs(changed) do item.photo:applyDevelopSettings(item.settings) end
		end, { timeout = 60 })
	end
	local projectName = group.collection and group.collection:getParent() and group.collection:getParent():getName() or group.project
	LrTasks.pcall(Bridge.removeCollection, projectName, group.title)
	Actions.writeMessage('cancelled', { 'session=' .. group.session, 'project=' .. group.root, 'discarded=' .. (discard and #changed or 0), 'time=' .. os.time() })
	Bridge.note('cancel editing: ' .. group.session .. (discard and (', ' .. #changed .. ' photos back to how Stillpoint has them') or (#changed > 0 and ', changes kept' or '')))
	Actions.state.text = 'Editing cancelled' .. (discard and (' · ' .. plural(#changed, 'change', 'changes') .. ' discarded') or '')
	Actions.state.lastSession = group.session
	LrDialogs.showBezel('Editing cancelled' .. (discard and (' · ' .. plural(#changed, 'photo', 'photos') .. ' back') or ''))
end

-- ---------------- Go to session in Stillpoint ----------------

function Actions.goToSession()
	local groups = Actions.target()
	local session = groups[1] and groups[1].session or Actions.state.lastSession
	if not session then
		LrDialogs.message('Select a photo of a Stillpoint session', 'Stillpoint opens the session of the selected photo.', 'info')
		return
	end
	-- O Stillpoint lê em até 3 s; um pedido com mais de 20 s (Stillpoint fechado) é ignorado quando ele abrir
	Actions.writeMessage('goto', { 'session=' .. session, 'time=' .. os.time() })
	LrDialogs.showBezel('Showing the session in Stillpoint')
end

return Actions
