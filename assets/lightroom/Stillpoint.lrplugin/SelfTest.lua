-- Teste automático do plugin dentro do Lightroom Classic de verdade (pedido do dono, 2026-11-06).
-- Roda os mesmos caminhos que o Stillpoint usa (pedido de edição, Delete edits e o ⌘Z dele, tirar e pôr fotos,
-- Done editing, Export to Stillpoint, File › Export… › Stillpoint, Cancel editing) com 4 fotos pequenas, num
-- catálogo de teste, e escreve um relatório: self-test-report.txt na pasta da conversa do Stillpoint.
-- Nenhuma janela abre durante o teste (Ui.lua responde por ela) e o Stillpoint não vê nada: a conversa vai para
-- uma pasta à parte. O plugin não consegue tirar fotos do catálogo, por isso o teste só roda num catálogo cujo nome
-- tenha "Self-Test".
local LrApplication = import 'LrApplication'
local LrBinding = import 'LrBinding'
local LrDialogs = import 'LrDialogs'
local LrExportSession = import 'LrExportSession'
local LrFileUtils = import 'LrFileUtils'
local LrFunctionContext = import 'LrFunctionContext'
local LrPathUtils = import 'LrPathUtils'
local LrPrefs = import 'LrPrefs'
local LrTasks = import 'LrTasks'
local LrView = import 'LrView'

local Bridge = require 'Bridge'
local Actions = require 'Actions'
local Ui = require 'Ui'

local SelfTest = {}

local NAMES = { '01_T7_1_IMG_0001.jpg', '02_SL3_1_IMG_0002.jpg', '03_SL3_2_IMG_0003.jpg', '04_T7_2_IMG_0004.jpg' }
local PROJECT = 'SelfTest'

-- ---------------- relatório ----------------

local report, passed, failed = {}, 0, 0
local function line(text) table.insert(report, text) end
local function check(name, ok, detail)
	if ok then passed = passed + 1 else failed = failed + 1 end
	line((ok and 'PASS  ' or 'FAIL  ') .. name .. ((not ok and detail) and ('   [' .. tostring(detail) .. ']') or ''))
	return ok
end
local function info(text) line('      · ' .. text) end
local function section(name) line(''); line('== ' .. name) end

-- ---------------- arquivos ----------------

local function writeFile(path, text)
	local f = io.open(path, 'wb')
	if not f then return false end
	f:write(text)
	f:close()
	return true
end
local function readFile(path)
	local f = io.open(path, 'rb')
	if not f then return nil end
	local text = f:read('*a')
	f:close()
	return text
end
-- Um arquivo chave=valor; as chaves repetidas (file=, cleared=, photo=) viram listas em list[chave]
local function readPairs(path)
	local text = readFile(path)
	if not text then return nil end
	local t = { list = {} }
	for raw in (text .. '\n'):gmatch('([^\n]*)\n') do
		local key, value = raw:gsub('\r$', ''):match('^([^=]+)=(.*)$')
		if key then
			t[key] = value
			t.list[key] = t.list[key] or {}
			table.insert(t.list[key], value)
		end
	end
	return t
end

-- ---------------- o teste ----------------

local folder, root, sessionDir, editedDir, session, title, catalogPath
local counter = 0

local function tick(times)
	for _ = 1, times or 1 do
		local ok, problem = LrTasks.pcall(Bridge.tick)
		if not ok then info('tick problem: ' .. tostring(problem)) end
		LrTasks.sleep(0.3)
	end
end

-- Os recados que o plugin deixou para o Stillpoint (exported-, cancelled-), como o Stillpoint lê: lê e apaga
local function takeMessages(prefix)
	local list = {}
	for path in LrFileUtils.files(folder) do
		local name = LrPathUtils.leafName(path)
		if name:sub(1, #prefix + 1) == prefix .. '-' then
			local m = readPairs(path)
			if m then m.name = name; table.insert(list, m) end
			LrFileUtils.delete(path)
		end
	end
	table.sort(list, function(a, b) return a.name < b.name end)
	return list
end

local function queue(kind, photos)
	counter = counter + 1
	local text = 'session=' .. session .. '\nproject=' .. PROJECT .. '\ntitle=' .. title .. '\ncatalog=' .. catalogPath .. '\n'
	for _, p in ipairs(photos) do text = text .. 'photo=' .. p .. '\n' end
	-- O mesmo nome que o Stillpoint usa: <tipo>-<hora>-<número>.txt
	writeFile(LrPathUtils.child(folder, kind .. '-' .. os.time() .. '-' .. counter .. '.txt'), text .. 'end=1\n')
end

local function pathOf(i) return LrPathUtils.child(sessionDir, NAMES[i]) end
local function photoOf(i) return LrApplication.activeCatalog():findPhotoByPath(pathOf(i)) end
local function settingsOf(i) return photoOf(i):getDevelopSettings() end
local function editedOf(i) return LrPathUtils.child(editedDir, LrPathUtils.removeExtension(NAMES[i]) .. '.tif') end

local function findCollection()
	for _, set in ipairs(LrApplication.activeCatalog():getChildCollectionSets()) do
		if set:getName() == 'Stillpoint' then
			for _, projectSet in ipairs(set:getChildCollectionSets()) do
				if projectSet:getName() == PROJECT then
					for _, c in ipairs(projectSet:getChildCollections()) do
						if c:getName() == title then return c end
					end
				end
			end
		end
	end
	return nil
end
local function collectionNames()
	local c = findCollection()
	if not c then return nil end
	local names = {}
	for _, photo in ipairs(c:getPhotos()) do table.insert(names, LrPathUtils.leafName(photo:getRawMetadata('path'))) end
	table.sort(names)
	return names
end

local function write(label, fn)
	LrApplication.activeCatalog():withWriteAccessDo('Stillpoint self-test: ' .. label, fn, { timeout = 30 })
end
local function edit(i, exposure)
	write('edit', function() photoOf(i):applyDevelopSettings({ Exposure2012 = exposure }) end)
end
local function toBaseline(i)
	local base = Bridge.baseline(pathOf(i))
	if base then write('back to baseline', function() photoOf(i):applyDevelopSettings(base) end) end
end

-- Mostra a coleção e seleciona as 4 fotos (o painel age nas fotos escolhidas no Lightroom)
local function selectSession()
	local c = findCollection()
	if c then LrTasks.pcall(function() LrApplication.activeCatalog():setActiveSources({ c }) end) end
	LrTasks.sleep(0.5)
	local photos = {}
	for i = 1, #NAMES do local p = photoOf(i); if p then table.insert(photos, p) end end
	LrTasks.pcall(function() LrApplication.activeCatalog():setSelectedPhotos(photos[1], photos) end)
	LrTasks.sleep(0.5)
end

local function aliveText()
	Bridge.writeAlive()
	return readFile(LrPathUtils.child(folder, 'alive.txt')) or ''
end

-- O pedido "edit" do Stillpoint (Edit in Lightroom Classic), pelo request.txt
local function openSession(label, extra)
	counter = counter + 1
	local id = 'selftest-' .. os.time() .. '-' .. counter
	local text = 'id=' .. id .. '\naction=edit\nproject=' .. PROJECT .. '\ntitle=' .. title .. '\ncatalog=' .. catalogPath .. '\nfocus=' .. pathOf(1) .. '\n'
	for i = 1, #NAMES do text = text .. 'select=' .. pathOf(i) .. '\n' end
	for i = 1, #NAMES do text = text .. 'photo=' .. pathOf(i) .. '\n' end
	text = text .. (extra or '')
	writeFile(LrPathUtils.child(folder, 'request.txt'), text .. 'end=1\n')
	local state
	for _ = 1, 40 do
		tick()
		local s = readPairs(LrPathUtils.child(folder, 'status.txt'))
		if s and s.id == id and (s.state == 'done' or s.state == 'error' or s.state == 'wrong-catalog') then state = s; break end
	end
	check(label .. ': Lightroom answers "done"', state and state.state == 'done', state and (state.state .. ' ' .. tostring(state.message)) or 'no answer in 12 s')
	return state
end

local function seenText()
	local t = {}
	for _, s in ipairs(Ui.seen) do table.insert(t, s.kind .. ' "' .. s.title .. '"' .. (s.answer and (' -> ' .. s.answer) or '') .. (s.unexpected and ' (NOT EXPECTED)' or '')) end
	return table.concat(t, '; ')
end
local function dialogs(answers)
	Ui.answers = answers or {}
	Ui.seen = {}
end
local function seenTitle(kind, text)
	for _, s in ipairs(Ui.seen) do
		if s.kind == kind and (s.title:find(text, 1, true) or s.info:find(text, 1, true)) then return s end
	end
	return nil
end
local function noUnexpected(label)
	for _, s in ipairs(Ui.seen) do
		if s.unexpected then return check(label .. ': no unexpected window', false, seenText()) end
	end
	return check(label .. ': no unexpected window', true)
end
local function has(list, value)
	for _, v in ipairs(list or {}) do if v == value then return true end end
	return false
end

-- ---------------- os cenários ----------------

local function scenarioOpen()
	section('1. Edit in Lightroom Classic (request.txt)')
	dialogs()
	openSession('first time')
	local names = collectionNames()
	check('the collection Stillpoint › SelfTest › session exists', names ~= nil)
	check('it has the 4 photos', names and #names == 4, names and table.concat(names, ', '))
	local c = findCollection()
	if c then
		local order = {}
		for _, photo in ipairs(c:getPhotos()) do table.insert(order, (LrPathUtils.leafName(photo:getRawMetadata('path')):match('^(%d+)_') or '?')) end
		info('order of collection:getPhotos() (not the order shown in Lightroom): ' .. table.concat(order, ' '))
	end
	local baselines, opened = 0, 0
	for i = 1, #NAMES do
		if Bridge.baseline(pathOf(i)) then baselines = baselines + 1 end
		if Bridge.opened(pathOf(i)) then opened = opened + 1 end
	end
	check('"how it arrived" saved for the 4 photos', baselines == 4, baselines .. ' of 4')
	check('"when the session opened" saved for the 4 photos', opened == 4, opened .. ' of 4')
	local alive = aliveText()
	check('alive.txt lists the collection', alive:find('collection=' .. PROJECT .. '\t' .. title, 1, true) ~= nil)
	local members = alive:match('members=' .. PROJECT .. '\t[^\t]*\t([^\n]*)')
	check('alive.txt lists its 4 photos', members ~= nil and select(2, members:gsub('|', '')) == 3, tostring(members))
	openSession('second time (photos already in the catalog)')
	names = collectionNames()
	check('still 4 photos after opening again', names and #names == 4)
	noUnexpected('opening')
end

-- O recorte do Export no Lightroom (opção A): a foto 04 chega cortada nas laterais (de 240x160 para 192x160)
local function croppedSize(i)
	local ok, d = LrTasks.pcall(function() return photoOf(i):getRawMetadata('croppedDimensions') end)
	if ok and type(d) == 'table' then return d.width, d.height end
	return nil
end
local function scenarioCrop()
	section('1b. The Export crop goes to Lightroom (crop= lines)')
	-- Sessão nova com recorte: como o Stillpoint manda (framing= e uma linha crop= por foto)
	local extra = 'framing=3:2\ncrop=' .. pathOf(4) .. '\t0.100000\t0.000000\t0.900000\t1.000000\n'
	openSession('with a crop', extra)
	local w, h = croppedSize(4)
	check('photo 04 is cropped in Lightroom (192 x 160)', w and math.abs(w - 192) <= 2 and math.abs(h - 160) <= 2, tostring(w) .. ' x ' .. tostring(h))
	local w1, h1 = croppedSize(1)
	check('photo 01 (no crop asked) stays whole (240 x 160)', w1 == 240 and h1 == 160, tostring(w1) .. ' x ' .. tostring(h1))
	check('the crop is not an edit (it is part of how the photo arrived)', not Actions.hasOwnEdit(photoOf(4), nil),
		Actions.settingsDiff(Bridge.baseline(pathOf(4)), settingsOf(4)))
	local keys = {}
	for k, v in pairs(settingsOf(4)) do if tostring(k):find('Crop') then table.insert(keys, tostring(k) .. '=' .. tostring(v)) end end
	table.sort(keys)
	info('crop settings of photo 04: ' .. table.concat(keys, ', '))
	-- Recorte trocado depois (outra proporção): o Lightroom acompanha e continua sem contar como edição
	openSession('with another crop', 'framing=1:1\ncrop=' .. pathOf(4) .. '\t0.166667\t0.000000\t0.833333\t1.000000\n')
	w, h = croppedSize(4)
	check('crop changed: photo 04 now 160 x 160', w and math.abs(w - 160) <= 2 and math.abs(h - 160) <= 2, tostring(w) .. ' x ' .. tostring(h))
	check('... still not an edit', not Actions.hasOwnEdit(photoOf(4), nil), Actions.settingsDiff(Bridge.baseline(pathOf(4)), settingsOf(4)))
	-- Recorte com giro (foto alinhada no Stillpoint, 2026-11-10): quadrado de 120 x 120 no centro, girado 5 graus.
	-- Os dois cantos do retângulo girado, o ângulo e o tamanho da foto (240 x 160)
	openSession('with a turned crop', 'framing=1:1\ncrop=' .. pathOf(4) .. '\t0.229163\t0.159110\t0.770837\t0.840890\t5.0000\t240\t160\n')
	w, h = croppedSize(4)
	check('turned crop: photo 04 is 120 x 120', w and math.abs(w - 120) <= 2 and math.abs(h - 120) <= 2, tostring(w) .. ' x ' .. tostring(h))
	do
		local now = settingsOf(4)
		check('... Lightroom kept the angle (CropAngle -5: its sign is the opposite of Stillpoint\'s)', math.abs((tonumber(now.CropAngle) or 0) + 5) < 0.01, 'CropAngle=' .. tostring(now.CropAngle))
		check('... and the two corners as sent', math.abs((tonumber(now.CropLeft) or 0) - 0.229163) < 0.002 and math.abs((tonumber(now.CropTop) or 0) - 0.159110) < 0.002
			and math.abs((tonumber(now.CropRight) or 0) - 0.770837) < 0.002 and math.abs((tonumber(now.CropBottom) or 0) - 0.840890) < 0.002,
			'CropLeft=' .. tostring(now.CropLeft) .. ' CropTop=' .. tostring(now.CropTop) .. ' CropRight=' .. tostring(now.CropRight) .. ' CropBottom=' .. tostring(now.CropBottom))
	end
	check('... still not an edit', not Actions.hasOwnEdit(photoOf(4), nil), Actions.settingsDiff(Bridge.baseline(pathOf(4)), settingsOf(4)))
	-- Proporção do recorte (R5, decisões do dono de 2026-11-10): sem tolerância, só a folga de 1 pixel. O que o
	-- Lightroom devolve depois de gravar o recorte precisa passar na conferência
	do
		local path, sent = pathOf(4), Bridge.sentCrop(pathOf(4))
		check('the crop Stillpoint sent is kept for the shape check', sent ~= nil and sent.width == 240 and sent.height == 160 and sent.framing == '1:1',
			sent and (tostring(sent.width) .. ' x ' .. tostring(sent.height) .. ' ' .. tostring(sent.framing)) or 'nothing kept')
		local problem = Bridge.shapeProblem(path, settingsOf(4))
		check('shape check, no tolerance: the crop as sent passes (what Lightroom gives back is exact enough)', problem == nil,
			problem and ('have ' .. problem.have .. ', want ' .. problem.want) or nil)
		check('... and it does not count as adjusted', Bridge.cropChanged(path, settingsOf(4)) == nil, tostring(Bridge.cropChanged(path, settingsOf(4))))
		-- A pessoa move e encolhe o recorte, sem mudar a proporção (120 x 120 -> 96 x 96, sem giro)
		write('move crop', function() photoOf(4):applyDevelopSettings({ CropLeft = 0.2, CropTop = 0.1, CropRight = 0.6, CropBottom = 0.7, CropAngle = 0 }) end)
		problem = Bridge.shapeProblem(path, settingsOf(4))
		check('crop moved and resized, same shape: passes', problem == nil, problem and ('have ' .. problem.have .. ', want ' .. problem.want) or nil)
		local changed = Bridge.cropChanged(path, settingsOf(4))
		check('... and the new crop goes to Stillpoint (to become the alignment)', (function()
			if not changed then return false end
			local l, t, r, b, a = changed:match('^([%d%.%-]+)\t([%d%.%-]+)\t([%d%.%-]+)\t([%d%.%-]+)\t([%d%.%-]+)$')
			return l ~= nil and math.abs(tonumber(l) - 0.2) < 1e-4 and math.abs(tonumber(t) - 0.1) < 1e-4 and math.abs(tonumber(r) - 0.6) < 1e-4
				and math.abs(tonumber(b) - 0.7) < 1e-4 and math.abs(tonumber(a)) < 1e-3
		end)(), tostring(changed))
		check('... it counts as an edit', Actions.hasOwnEdit(photoOf(4), nil))
		-- A mesma coisa com giro: o recorte girado 5 graus de antes, 10% menor em volta do mesmo centro
		write('turned crop, smaller', function() photoOf(4):applyDevelopSettings({ CropLeft = 0.2562467, CropTop = 0.1932, CropRight = 0.7437533, CropBottom = 0.8068, CropAngle = -5 }) end)
		do
			local tw, th = croppedSize(4)
			check('turned crop resized: photo 04 is 108 x 108 in Lightroom', tw and math.abs(tw - 108) <= 2 and math.abs(th - 108) <= 2, tostring(tw) .. ' x ' .. tostring(th))
			local changed5 = Bridge.cropChanged(path, settingsOf(4)) or ''
			check('... and it goes to Stillpoint with the angle in Stillpoint\'s sign (5)', math.abs((tonumber(changed5:match('\t([%d%.%-]+)$')) or 0) - 5) < 0.01, changed5)
		end
		problem = Bridge.shapeProblem(path, settingsOf(4))
		check('turned crop resized, same shape: passes', problem == nil, problem and ('have ' .. problem.have .. ', want ' .. problem.want) or nil)
		-- Proporção trocada (3:2): bloqueia; "Put back the Stillpoint crop" devolve o recorte mandado
		write('3:2 crop', function() photoOf(4):applyDevelopSettings({ CropLeft = 0.25, CropTop = 0.25, CropRight = 0.75, CropBottom = 0.75, CropAngle = 0 }) end)
		problem = Bridge.shapeProblem(path, settingsOf(4))
		check('another shape (3:2 in a 1:1 session): caught', problem ~= nil and problem.have == '3:2' and problem.want == '1:1',
			problem and ('have ' .. problem.have .. ', want ' .. problem.want) or 'passed')
		dialogs({ 'other' })
		local blocked = Actions.shapeBlock({ { photo = photoOf(4), place = Actions.placeOf(photoOf(4)) } })
		check('Export to Stillpoint is blocked, with the alert', blocked == true and seenTitle('confirm', 'Export to Stillpoint blocked: 1 photo is not 1:1'), seenText())
		check('Put back the Stillpoint crop: the shape is right again', Bridge.shapeProblem(path, settingsOf(4)) == nil)
		check('... and the crop is the one Stillpoint sent', Bridge.cropChanged(path, settingsOf(4)) == nil, tostring(Bridge.cropChanged(path, settingsOf(4))))
		check('... not an edit anymore', not Actions.hasOwnEdit(photoOf(4), nil), Actions.settingsDiff(Bridge.baseline(pathOf(4)), settingsOf(4)))
		dialogs()
	end
	-- Sem recorte (Send as shot): a foto volta inteira
	openSession('as shot', 'framing=asshot\n')
	check('as shot: no shape check for the session', Bridge.sentCrop(pathOf(4)) == nil)
	w, h = croppedSize(4)
	check('as shot: photo 04 whole again (240 x 160)', w == 240 and h == 160, tostring(w) .. ' x ' .. tostring(h))
	check('... and not an edit', not Actions.hasOwnEdit(photoOf(4), nil), Actions.settingsDiff(Bridge.baseline(pathOf(4)), settingsOf(4)))
end

local function scenarioHasEdit()
	section('2. Which photos have an edit')
	for i = 1, #NAMES do check('photo 0' .. i .. ' starts without an edit', not Actions.hasOwnEdit(photoOf(i), nil)) end
	-- Cada foto aberta no Develop, como a pessoa faz (o Lightroom pode completar a edição guardada da foto ao abrir;
	-- teste do dono, 2026-11-06: 9 de 9 editadas com 2 editadas)
	selectSession()
	LrTasks.pcall(function() (import 'LrApplicationView').switchToModule('develop') end)
	for i = 1, #NAMES do
		LrTasks.pcall(function() LrApplication.activeCatalog():setSelectedPhotos(photoOf(i), {}) end)
		LrTasks.sleep(2)
	end
	LrTasks.sleep(1)
	for i = 1, #NAMES do
		local has = Actions.hasOwnEdit(photoOf(i), nil)
		check('photo 0' .. i .. ' still without an edit after being opened in Develop', not has,
			has and Actions.settingsDiff(Bridge.baseline(pathOf(i)), settingsOf(i)) or nil)
	end
	-- Um ajuste que o Lightroom acrescenta sozinho (a FilterList) não é edição
	do
		local base = Bridge.baseline(pathOf(3))
		local now = {}
		for k, v in pairs(base or {}) do now[k] = v end
		now.FilterList = { { kind = 'test' } }
		base = base or {}
		local saved = base.FilterList
		base.FilterList = nil
		check('a FilterList that Lightroom adds by itself is not an edit', Bridge.sameEdit(now, base))
		base.FilterList = saved
	end
	edit(1, 0.7); edit(2, -0.5)
	check('photo 01 with an edit', Actions.hasOwnEdit(photoOf(1), nil))
	check('photo 02 with an edit', Actions.hasOwnEdit(photoOf(2), nil))
	check('photo 03 still without', not Actions.hasOwnEdit(photoOf(3), nil))
end

local function scenarioPanelExport()
	section('3. Export to Stillpoint (panel button)')
	selectSession()
	dialogs({ 'ok' })  -- a janela Export to Stillpoint: Export
	local ok, problem = LrTasks.pcall(Actions.exportToStillpoint)
	check('the export runs', ok, problem)
	check('the Export to Stillpoint window appeared', seenTitle('modal', 'Export to Stillpoint') ~= nil, seenText())
	check('Edited/01 exists', LrFileUtils.exists(editedOf(1)) == 'file')
	check('Edited/02 exists', LrFileUtils.exists(editedOf(2)) == 'file')
	check('photos without an edit are not exported (03, 04)', LrFileUtils.exists(editedOf(3)) ~= 'file' and LrFileUtils.exists(editedOf(4)) ~= 'file')
	local m = takeMessages('exported')
	check('one message to Stillpoint', #m == 1, #m)
	if m[1] then
		check('message: count=2', m[1].count == '2', m[1].count)
		check('message: the whole session was looked at (complete=1)', m[1].complete == '1', m[1].complete)
		check('message: 2 files', #(m[1].list.file or {}) == 2, table.concat(m[1].list.file or {}, ', '))
	end
	check('"last export" saved for photo 01', Bridge.sent(pathOf(1)) ~= nil and Bridge.same(Bridge.sent(pathOf(1)), settingsOf(1)))
	noUnexpected('panel export')
end

local function scenarioCleared()
	section('4. An edit taken off in Lightroom leaves Stillpoint too')
	toBaseline(2)
	check('photo 02 back without an edit', not Actions.hasOwnEdit(photoOf(2), nil))
	selectSession()
	dialogs({ 'ok', 'ok' })  -- "already has an edited version": Replace; a janela do export: Export
	local ok, problem = LrTasks.pcall(Actions.exportToStillpoint)
	check('the export runs', ok, problem)
	local m = takeMessages('exported')
	local cleared = m[1] and m[1].list.cleared or {}
	check('message tells Stillpoint to remove the edit of 02', has(cleared, NAMES[2]), table.concat(cleared, ', '))
	check('message: 01 exported again', m[1] and has(m[1].list.file, LrPathUtils.leafName(editedOf(1))), m[1] and table.concat(m[1].list.file or {}, ', '))
	info('windows: ' .. seenText())
	-- O Stillpoint tiraria a editada da 02 (ela vai para a lixeira dele)
	LrFileUtils.delete(editedOf(2))
	noUnexpected('export with an edit taken off')
end

local function scenarioExportDialog()
	section('5. File › Export… › Export To: Stillpoint')
	edit(3, 0.4)
	-- O quadro do Stillpoint na janela Export… (preenchido aos poucos)
	selectSession()
	LrFunctionContext.callWithContext('Stillpoint self-test', function(context)
		local props = LrBinding.makePropertyTable(context)
		local service = require 'ExportService'
		local ok, sections = LrTasks.pcall(function() return service.sectionsForTopOfDialog(LrView.osFactory(), props) end)
		check('the Stillpoint box of the Export… window builds', ok and sections ~= nil, sections)
		for _ = 1, 20 do
			if props.stillpointProject and props.stillpointProject ~= '…' then break end
			LrTasks.sleep(0.2)
		end
		check('the box shows the project', props.stillpointProject == PROJECT, tostring(props.stillpointProject))
	end)
	-- O export em si, sem a janela: o mesmo caminho do botão Export
	local photos = {}
	for i = 1, #NAMES do table.insert(photos, photoOf(i)) end
	dialogs({ 'ok' })  -- "already has an edited version" (01): Replace
	local problemsBefore = readFile(LrPathUtils.child(folder, 'plugin-problems.txt')) or ''
	local ok, problem = LrTasks.pcall(function()
		local exportSession = LrExportSession {
			photosToExport = photos,
			exportSettings = {
				LR_exportServiceProvider = _PLUGIN.id,
				LR_exportServiceProviderTitle = 'Stillpoint',
				LR_format = 'TIFF',
				LR_export_bitDepth = 8,
				LR_tiff_compressionMethod = 'compressionMethod_None',
				LR_export_colorSpace = 'sRGB',
				LR_size_doConstrain = false,
				LR_collisionHandling = 'overwrite',
				stillpointReady = true,
			},
		}
		exportSession:doExportOnCurrentTask()
	end)
	check('the export runs', ok, problem)
	local problems = (readFile(LrPathUtils.child(folder, 'plugin-problems.txt')) or ''):sub(#problemsBefore + 1)
	check('no problem written by the export', problems == '', problems)
	check('Edited/03 exists', LrFileUtils.exists(editedOf(3)) == 'file')
	check('photo 04 (no edit) is not exported', LrFileUtils.exists(editedOf(4)) ~= 'file')
	local m = takeMessages('exported')
	local files = {}
	for _, msg in ipairs(m) do for _, f in ipairs(msg.list.file or {}) do table.insert(files, f) end end
	check('message to Stillpoint lists 03', has(files, LrPathUtils.leafName(editedOf(3))), table.concat(files, ', '))
	info('windows: ' .. seenText())
	noUnexpected('File › Export…')
end

local function scenarioDeleteEdits()
	section('6. Delete edit in Stillpoint and its ⌘Z / ⌘⇧Z (reset-, bringback- files)')
	dialogs()
	local edited = settingsOf(1)
	local base = Bridge.baseline(pathOf(1))
	queue('reset', { pathOf(1) }); tick(2)
	check('reset: photo 01 back to how it arrived', Bridge.same(settingsOf(1), base))
	local saved = LrPrefs.prefsForPlugin().savedEdits
	check('reset: its edit is saved for ⌘Z', saved and saved[pathOf(1)] ~= nil)
	queue('bringback', { pathOf(1) }); tick(2)
	check('⌘Z: the edit comes back', Bridge.same(settingsOf(1), edited))
	-- Os dois no mesmo segundo (⌘⇧Z e ⌘Z rápidos): têm de acontecer nessa ordem
	queue('reset', { pathOf(1) }); queue('bringback', { pathOf(1) }); tick(3)
	check('⌘⇧Z + ⌘Z quickly: ends with the edit', Bridge.same(settingsOf(1), edited))
	queue('reset', { pathOf(1) }); tick(2)
	queue('reset', { pathOf(1) }); tick(2)
	queue('bringback', { pathOf(1) }); tick(2)
	check('two resets in a row then ⌘Z: the edit is not lost', Bridge.same(settingsOf(1), edited))
	queue('bringback', { pathOf(1) }); tick(2)
	check('⌘Z twice: still the edit', Bridge.same(settingsOf(1), edited))
	noUnexpected('delete edits')
end

local function scenarioRemoveReadd()
	section('7. Delete photo / restore in Stillpoint (remove-, readd- files)')
	queue('remove', { pathOf(2) }); tick(2)
	local names = collectionNames() or {}
	check('remove: 3 photos left in the collection', #names == 3, table.concat(names, ', '))
	local members = aliveText():match('members=' .. PROJECT .. '\t[^\t]*\t([^\n]*)') or ''
	check('alive.txt already without 02', not members:find(NAMES[2], 1, true), members)
	queue('readd', { pathOf(2) }); tick(2)
	names = collectionNames() or {}
	check('restore: 4 photos again', #names == 4, table.concat(names, ', '))
	local c = findCollection()
	if c then
		local order = {}
		for _, photo in ipairs(c:getPhotos()) do table.insert(order, (LrPathUtils.leafName(photo:getRawMetadata('path')):match('^(%d+)_') or '?')) end
		info('order after restoring 02: ' .. table.concat(order, ' '))
	end
	queue('remove', { pathOf(1), pathOf(2), pathOf(3), pathOf(4) }); tick(2)
	names = collectionNames()
	check('remove all: the collection stays, empty', names ~= nil and #names == 0, names and #names)
	local alive = aliveText()
	check('alive.txt: the empty collection is listed with no photos', alive:find('members=' .. PROJECT .. '\t' .. title .. '\t\n', 1, true) ~= nil)
	queue('readd', { pathOf(1), pathOf(2), pathOf(3), pathOf(4) }); tick(2)
	names = collectionNames() or {}
	check('restore all: 4 photos again', #names == 4, #names)
end

local function scenarioDone()
	section('8. Done editing / session deleted in Stillpoint (done- file)')
	counter = counter + 1
	local done = LrPathUtils.child(folder, 'done-' .. os.time() .. '-' .. counter .. '.txt')
	writeFile(done, 'project=' .. PROJECT .. '\ntitle=' .. title .. '\ncatalog=' .. catalogPath .. '\nend=1\n')
	tick(2)
	check('the collection is gone', findCollection() == nil)
	check('the done- file is gone', LrFileUtils.exists(done) ~= 'file')
	check('alive.txt without the collection', not aliveText():find(title, 1, true))
end

local function cancel(answers)
	selectSession()
	dialogs(answers)
	local ok, problem = LrTasks.pcall(Actions.cancelEditing)
	if not ok then info('cancel editing problem: ' .. tostring(problem)) end
	return takeMessages('cancelled')
end

local function scenarioCancel()
	section('9. Cancel editing (panel button)')
	-- A: edições já mandadas (01 e 03 têm edição), nada novo
	openSession('A')
	local m = cancel({ 'cancel' })
	check('A: asks "Cancel editing?"', seenTitle('confirm', 'Cancel editing?') ~= nil, seenText())
	check('A: Keep editing keeps the collection', findCollection() ~= nil and #m == 0)
	m = cancel({ 'ok' })
	check('A: Cancel editing removes the collection', findCollection() == nil)
	check('A: Stillpoint is told (cancelled-)', #m == 1)
	-- B: mudança que o Stillpoint não tem, Keep editing
	openSession('B')
	edit(4, 0.9)
	local changed = settingsOf(4)
	m = cancel({ 'cancel' })
	local d = seenTitle('confirm', 'Discard the changes?')
	check('B: asks "Discard the changes?"', d ~= nil, seenText())
	check('B: its buttons are Discard changes / Keep editing / Close and keep changes',
		d and d.buttons[1] == 'Discard changes' and d.buttons[2] == 'Keep editing' and d.buttons[3] == 'Close and keep changes',
		d and table.concat(d.buttons, ' / '))
	check('B: Keep editing changes nothing', findCollection() ~= nil and Bridge.same(settingsOf(4), changed) and #m == 0)
	-- C: Discard changes
	m = cancel({ 'ok' })
	check('C: Discard changes: photo 04 back to how Stillpoint has it (no edit there: the original)', Bridge.sameEdit(settingsOf(4), Bridge.baseline(pathOf(4))),
		Actions.settingsDiff(Bridge.baseline(pathOf(4)), settingsOf(4)))
	check('C: the collection is gone', findCollection() == nil)
	check('C: Stillpoint is told 1 change discarded', m[1] and m[1].discarded == '1', m[1] and m[1].discarded)
	check('C: the message says "discarded"', seenTitle('bezel', 'discarded') ~= nil, seenText())
	-- D: Close and keep changes
	openSession('D')
	edit(4, 0.9)
	changed = settingsOf(4)
	m = cancel({ 'other' })
	check('D: Close and keep changes: photo 04 keeps the change', Bridge.same(settingsOf(4), changed))
	check('D: the collection is gone', findCollection() == nil)
	check('D: the message says "kept"', seenTitle('bezel', 'kept') ~= nil, seenText())
	-- E: as edições tiradas no Lightroom e mandadas ao Stillpoint (o export só avisa para tirar as editadas):
	-- nada com edição e nada por mandar, fecha sem perguntar. (Na 1ª rodada o teste não mandava antes, e o plugin
	-- perguntou com razão: o Stillpoint ainda tinha as editadas de 01 e 03.)
	openSession('E')
	for i = 1, #NAMES do toBaseline(i) end
	selectSession()
	dialogs({})
	local ok, problem = LrTasks.pcall(Actions.exportToStillpoint)
	check('E: export with every edit taken off runs', ok, problem)
	local sent = takeMessages('exported')
	local cleared = {}
	for _, msg in ipairs(sent) do for _, f in ipairs(msg.list.cleared or {}) do table.insert(cleared, f) end end
	check('E: it tells Stillpoint to remove the edits of 01 and 03', has(cleared, NAMES[1]) and has(cleared, NAMES[3]), table.concat(cleared, ', '))
	check('E: says "removed in Stillpoint"', seenTitle('bezel', 'removed in Stillpoint') ~= nil, seenText())
	for _, i in ipairs({ 1, 3 }) do LrFileUtils.delete(editedOf(i)) end  -- o Stillpoint tiraria
	m = cancel({})
	check('E: no edit at all: closes without asking', seenTitle('confirm', '') == nil, seenText())
	check('E: the collection is gone', findCollection() == nil)
	check('E: the message says "Session closed in Lightroom Classic"', seenTitle('bezel', 'Session closed in Lightroom Classic') ~= nil, seenText())
	noUnexpected('cancel editing')
end

-- O caminho inteiro do recorte ajustado no Lightroom (decisões do dono, 2026-11-10): pelo Export to Stillpoint de
-- verdade (painel e File › Export…), o recado com o recorte novo, o Apply sem recorte e o recado do arquivo recusado
local function scenarioShape()
	section('9b. Crop adjusted in Lightroom: the whole way (export, block, apply, notice)')
	-- Sessão 1:1: cada foto com o seu recorte (160 x 160 no centro) e o tamanho dela
	local extra = 'framing=1:1\n'
	for i = 1, #NAMES do extra = extra .. 'crop=' .. pathOf(i) .. '\t0.166667\t0.000000\t0.833333\t1.000000\t0.0000\t240\t160\n' end
	openSession('1:1 session', extra)
	for i = 1, #NAMES do toBaseline(i) end
	for i = 1, #NAMES do
		if LrFileUtils.exists(editedOf(i)) == 'file' then LrFileUtils.delete(editedOf(i)) end
	end
	takeMessages('exported')
	local w, h = croppedSize(2)
	check('every photo is 160 x 160 in Lightroom', w and math.abs(w - 160) <= 2 and math.abs(h - 160) <= 2, tostring(w) .. ' x ' .. tostring(h))
	-- Foto 02: uma edição e o recorte movido (mesmo tamanho). Foto 03: uma edição e o recorte em 3:2
	edit(2, 0.5)
	write('move crop of 02', function() photoOf(2):applyDevelopSettings({ CropLeft = 0.2, CropTop = 0, CropRight = 0.866667, CropBottom = 1, CropAngle = 0 }) end)
	edit(3, 0.3)
	write('3:2 crop on 03', function() photoOf(3):applyDevelopSettings({ CropLeft = 0.1, CropTop = 0.1, CropRight = 0.9, CropBottom = 0.9, CropAngle = 0 }) end)
	-- Export to Stillpoint (painel): bloqueado; OK não muda nada
	selectSession()
	dialogs({ 'ok' })
	local ok, problem = LrTasks.pcall(Actions.exportToStillpoint)
	check('panel export with a 3:2 photo: runs', ok, problem)
	check('... the alert names the photo', seenTitle('confirm', 'Export to Stillpoint blocked: 1 photo is not 1:1') ~= nil and seenTitle('confirm', 'photo 03') ~= nil, seenText())
	check('... nothing is exported (no message, no file)', #takeMessages('exported') == 0 and LrFileUtils.exists(editedOf(2)) ~= 'file' and LrFileUtils.exists(editedOf(3)) ~= 'file')
	check('... the panel says why', tostring(Actions.state.text):find('Export blocked: photo 03 is not 1:1', 1, true) ~= nil, tostring(Actions.state.text))
	do
		local selected = LrApplication.activeCatalog():getTargetPhotos() or {}
		check('... the wrong photo is selected in Lightroom', #selected == 1 and selected[1] == photoOf(3), #selected .. ' selected')
	end
	check('... OK leaves the crop of 03 as the person made it', Bridge.shapeProblem(pathOf(3), settingsOf(3)) ~= nil)
	noUnexpected('blocked export, OK')
	-- File › Export… › Stillpoint: o mesmo bloqueio
	do
		local photos = {}
		for i = 1, #NAMES do table.insert(photos, photoOf(i)) end
		dialogs({ 'ok' })
		local ran, why = LrTasks.pcall(function()
			local exportSession = LrExportSession {
				photosToExport = photos,
				exportSettings = { LR_exportServiceProvider = _PLUGIN.id, LR_exportServiceProviderTitle = 'Stillpoint', LR_format = 'TIFF', LR_export_bitDepth = 8,
					LR_tiff_compressionMethod = 'compressionMethod_None', LR_export_colorSpace = 'sRGB', LR_size_doConstrain = false,
					LR_collisionHandling = 'overwrite', stillpointReady = true },
			}
			exportSession:doExportOnCurrentTask()
		end)
		check('File › Export… with a 3:2 photo: runs', ran, why)
		check('... blocked too', seenTitle('confirm', 'Export to Stillpoint blocked') ~= nil, seenText())
		check('... nothing is exported', #takeMessages('exported') == 0 and LrFileUtils.exists(editedOf(2)) ~= 'file' and LrFileUtils.exists(editedOf(3)) ~= 'file')
		Actions.state.busy = false
	end
	-- Put back the Stillpoint crop: a 03 volta ao recorte mandado; exportar de novo funciona
	selectSession()
	dialogs({ 'other' })
	LrTasks.pcall(Actions.exportToStillpoint)
	check('Put back the Stillpoint crop: photo 03 is 1:1 again', Bridge.shapeProblem(pathOf(3), settingsOf(3)) == nil and Bridge.cropChanged(pathOf(3), settingsOf(3)) == nil)
	check('... still nothing exported (the person exports again)', #takeMessages('exported') == 0)
	selectSession()
	dialogs({ 'ok' })  -- a janela do export: Export
	ok, problem = LrTasks.pcall(Actions.exportToStillpoint)
	check('export again: runs', ok, problem)
	check('Edited/02 and Edited/03 exist', LrFileUtils.exists(editedOf(2)) == 'file' and LrFileUtils.exists(editedOf(3)) == 'file')
	do
		local m = takeMessages('exported')
		local crops = m[1] and m[1].list.crop or {}
		check('one message, with one crop line (photo 02, the one that was moved)', #m == 1 and #crops == 1 and crops[1]:sub(1, #NAMES[2] + 1) == NAMES[2] .. '\t', table.concat(crops, ' | '))
		local l, t, r, b, a = (crops[1] or ''):match('^.-\t([%d%.%-]+)\t([%d%.%-]+)\t([%d%.%-]+)\t([%d%.%-]+)\t([%d%.%-]+)$')
		check('... with the crop as the person left it', l ~= nil and math.abs(tonumber(l) - 0.2) < 1e-4 and math.abs(tonumber(t)) < 1e-4
			and math.abs(tonumber(r) - 0.866667) < 1e-4 and math.abs(tonumber(b) - 1) < 1e-4 and math.abs(tonumber(a)) < 1e-3, tostring(crops[1]))
	end
	noUnexpected('export after the put back')
	-- Apply photo edit to all: os ajustes vão, o recorte de cada foto fica
	do
		local cropOf1 = settingsOf(1).CropLeft
		LrTasks.pcall(function() LrApplication.activeCatalog():setSelectedPhotos(photoOf(2), { photoOf(1), photoOf(2), photoOf(3), photoOf(4) }) end)
		LrTasks.sleep(0.5)
		dialogs({ 'ok' })  -- "already have their own edit": Overwrite
		ok, problem = LrTasks.pcall(Actions.applyPhoto01)
		check('Apply photo 02 edit to all: runs', ok, problem)
		check('... the edit of 02 goes to 01 (exposure)', math.abs((tonumber(settingsOf(1).Exposure2012) or 0) - 0.5) < 0.01, tostring(settingsOf(1).Exposure2012))
		check('... but 01 keeps its own crop', math.abs((tonumber(settingsOf(1).CropLeft) or 0) - (tonumber(cropOf1) or 0)) < 1e-4 and Bridge.cropChanged(pathOf(1), settingsOf(1)) == nil,
			'CropLeft ' .. tostring(cropOf1) .. ' -> ' .. tostring(settingsOf(1).CropLeft))
		info('windows: ' .. seenText())
	end
	-- Recado do Stillpoint: um arquivo com outra proporção não foi usado
	do
		dialogs()
		local notice = LrPathUtils.child(folder, 'notice-' .. os.time() .. '-1.txt')
		writeFile(notice, 'session=' .. session .. '\ntitle=' .. title .. '\nnumbers=04\nhave=3:2\nwant=1:1\nphoto=' .. pathOf(4) .. '\nend=1\n')
		tick(2)
		check('notice from Stillpoint: the message appears', seenTitle('message', 'Stillpoint did not use 1 edited photo') ~= nil, seenText())
		check('... the notice file is gone', LrFileUtils.exists(notice) ~= 'file')
		local selected = LrApplication.activeCatalog():getTargetPhotos() or {}
		check('... and photo 04 is selected', #selected == 1 and selected[1] == photoOf(4), #selected .. ' selected')
	end
	-- Arruma: as fotos como chegaram, a sessão de novo sem enquadramento
	for i = 1, #NAMES do toBaseline(i) end
	openSession('as shot again', 'framing=asshot\n')
end

local function scenarioPrefs()
	section('10. What the plugin keeps (preferences)')
	local count = 0
	for i = 1, #NAMES do if Bridge.baseline(pathOf(i)) then count = count + 1 end end
	check('"how it arrived" still kept for the 4 photos after everything', count == 4, count .. ' of 4')
end

-- ---------------- começo e fim ----------------

-- options.quiet: pedido pelo terminal (tests/lightroom/run_selftest): nenhuma janela; o relatório diz tudo
function SelfTest.run(options)
	local quiet = options and options.quiet
	local catalog = LrApplication.activeCatalog()
	catalogPath = catalog:getPath()
	if not LrPathUtils.leafName(catalogPath):lower():find('self%-test') then
		if quiet then
			if Bridge.folder() then
				writeFile(LrPathUtils.child(Bridge.folder(), 'self-test-report.txt'), 'NOT RUN: Lightroom Classic is open on ' .. catalogPath
					.. '\nThe self-test only runs in a catalog with "Self-Test" in its name (File > New Catalog..., name "Stillpoint Self-Test").\n')
			end
			return
		end
		LrDialogs.message('Open the test catalog first',
			'The self-test adds 4 small photos to the catalog, and a plugin cannot take photos out of a catalog. '
			.. 'Use File › New Catalog…, name it "Stillpoint Self-Test", and choose this again there.', 'info')
		return
	end
	local realFolder = Bridge.folder()
	if not realFolder then
		LrDialogs.message('Stillpoint is not set up', 'Open Stillpoint once so it installs the plugin, then try again.', 'info')
		return
	end
	-- Onde está o catálogo de teste: o comando do terminal abre o Lightroom nele
	writeFile(LrPathUtils.child(realFolder, 'selftest-catalog.txt'), catalogPath .. '\n')
	report, passed, failed = {}, 0, 0
	session = os.date('%Y-%m-%d_%H-%M-%S')
	title = 'Self-test · ' .. session
	local base = LrPathUtils.child(LrPathUtils.getStandardFilePath('temp'), 'Stillpoint Self-Test')
	root = LrPathUtils.child(base, PROJECT)
	sessionDir = LrPathUtils.child(LrPathUtils.child(root, 'Originals'), session)
	editedDir = LrPathUtils.child(LrPathUtils.child(root, 'Edited'), session)
	folder = LrPathUtils.child(base, 'bridge-' .. session)
	LrFileUtils.createAllDirectories(sessionDir)
	LrFileUtils.createAllDirectories(folder)
	for i, name in ipairs(NAMES) do
		LrFileUtils.copy(LrPathUtils.child(LrPathUtils.child(_PLUGIN.path, 'selftest'), 'photo-' .. i .. '.jpg'), LrPathUtils.child(sessionDir, name))
	end
	line('Stillpoint plugin self-test · ' .. os.date('%Y-%m-%d %H:%M:%S') .. ' · plugin ' .. tostring(Bridge.version()))
	line('Lightroom Classic ' .. tostring(LrApplication.versionString and LrApplication.versionString() or '?') .. ' · catalog ' .. catalogPath)
	line('Session ' .. session .. ' · photos in ' .. sessionDir)

	Bridge.testFolder = folder
	local progress = (import 'LrProgressScope') { title = 'Stillpoint self-test' }
	local scenarios = { scenarioOpen, scenarioCrop, scenarioHasEdit, scenarioPanelExport, scenarioCleared, scenarioExportDialog,
		scenarioDeleteEdits, scenarioRemoveReadd, scenarioDone, scenarioCancel, scenarioShape, scenarioPrefs }
	for i, scenario in ipairs(scenarios) do
		progress:setPortionComplete(i - 1, #scenarios)
		local ok, problem = LrTasks.pcall(scenario)
		if not ok then check('scenario ' .. i .. ' ran to the end', false, problem) end
		if progress:isCanceled() then line('(stopped by the person)'); break end
	end
	progress:done()
	-- Arruma: a coleção de teste sai; a espera normal volta
	LrTasks.pcall(function() if findCollection() then Bridge.removeCollection(PROJECT, title) end end)
	Ui.answers = nil
	Ui.seen = {}
	Bridge.testFolder = nil
	line('')
	line(passed .. ' passed, ' .. failed .. ' failed')
	local log = readFile(LrPathUtils.child(folder, 'plugin-log.txt'))
	if log then line(''); line('---- plugin-log.txt of the test ----'); line(log) end
	local problems = readFile(LrPathUtils.child(folder, 'plugin-problems.txt'))
	if problems then line('---- plugin-problems.txt of the test ----'); line(problems) end
	local reportPath = LrPathUtils.child(realFolder, 'self-test-report.txt')
	writeFile(reportPath, table.concat(report, '\n') .. '\n')
	if quiet then return end
	LrDialogs.message('Stillpoint self-test: ' .. passed .. ' passed, ' .. failed .. ' failed',
		'The report is in ' .. reportPath .. '. You can open your own catalog again (File › Open Recent).', failed > 0 and 'warning' or 'info')
end

return SelfTest
