-- Comandos de teste vindos do Stillpoint (testcmd-*.txt na pasta da conversa): o teste que junta o Stillpoint e o
-- Lightroom de verdade (tests/e2e; decisões do dono, 2026-11-10). O Stillpoint só manda isso no modo de teste (o
-- comando do terminal), e o plugin só obedece num catálogo com "Self-Test" no nome. Cada comando faz o que a pessoa
-- faria à mão no Lightroom (mexer num ajuste ou no recorte, clicar em Export to Stillpoint) e responde em
-- testresult-<número>.txt.
local LrApplication = import 'LrApplication'
local LrFileUtils = import 'LrFileUtils'
local LrPathUtils = import 'LrPathUtils'
local LrTasks = import 'LrTasks'

local Bridge = require 'Bridge'
local Actions = require 'Actions'
local Ui = require 'Ui'

local TestCmd = {}

local function readAll(path)
	local file = io.open(path, 'rb')
	if not file then return nil end
	local text = file:read('*a')
	file:close()
	return text
end

local function parse(text)
	local request = { photos = {}, sets = {} }
	for raw in (text .. '\n'):gmatch('([^\n]*)\n') do
		local line = raw:gsub('\r$', '')
		local key, value = line:match('^([^=]+)=(.*)$')
		if key == 'photo' then table.insert(request.photos, value)
		elseif key == 'set' then
			local k, v = value:match('^([^=]+)=(.*)$')
			if k then request.sets[k] = tonumber(v) or v end
		elseif key then request[key] = value end
	end
	return request
end

local function seenText()
	local t = {}
	for _, s in ipairs(Ui.seen or {}) do
		table.insert(t, s.kind .. ' "' .. s.title .. '"' .. (s.answer and (' -> ' .. s.answer) or '') .. (s.unexpected and ' (NOT EXPECTED)' or ''))
	end
	return table.concat(t, ' | ')
end

local function oneLine(text) return (tostring(text or ''):gsub('[\r\n]+', ' ')) end

local function run(request)
	local catalog = LrApplication.activeCatalog()
	local out = {}
	local function photoOf(path) return path and catalog:findPhotoByPath(path) or nil end
	local cmd = request.cmd
	if cmd == 'ping' then
		out.catalog = catalog:getPath()
		out.version = tostring(Bridge.version())
	elseif cmd == 'record' then
		-- Daqui em diante nenhuma janela do plugin abre: fica anotada (como no autoteste). off=1 volta ao normal
		if request.off == '1' then Ui.answers = nil else Ui.answers = {} end
		Ui.seen = {}
	elseif cmd == 'seen' then
		out.seen = seenText()
		Ui.seen = {}
	elseif cmd == 'settings' then
		local photo = photoOf(request.photos[1])
		if not photo then error('photo not in this catalog: ' .. tostring(request.photos[1])) end
		local now = photo:getDevelopSettings()
		for _, k in ipairs({ 'CropLeft', 'CropTop', 'CropRight', 'CropBottom', 'CropAngle', 'Exposure2012' }) do out[k] = tostring(now[k]) end
		local ok, d = LrTasks.pcall(function() return photo:getRawMetadata('croppedDimensions') end)
		if ok and type(d) == 'table' then out.width = tostring(d.width); out.height = tostring(d.height) end
		out.edit = Actions.hasOwnEdit(photo, nil) and '1' or '0'
		-- O recorte de agora no jeito do Stillpoint (cantos e ângulo), como iria no recado da exportação
		local changed = Bridge.cropChanged(request.photos[1], now)
		out.changed = changed and (changed:gsub('\t', ' ')) or ''
	elseif cmd == 'develop' then
		local photo = photoOf(request.photos[1])
		if not photo then error('photo not in this catalog: ' .. tostring(request.photos[1])) end
		catalog:withWriteAccessDo('Stillpoint test: develop', function() photo:applyDevelopSettings(request.sets) end, { timeout = 30 })
	elseif cmd == 'export' then
		-- Export to Stillpoint do painel, com a sessão escolhida; answers: as respostas das janelas, na ordem
		local photos = {}
		for _, p in ipairs(request.photos) do local photo = photoOf(p); if photo then table.insert(photos, photo) end end
		if #photos == 0 then error('no photo of the session in this catalog') end
		catalog:setSelectedPhotos(photos[1], photos)
		LrTasks.sleep(0.5)
		local answers = {}
		for a in tostring(request.answers or ''):gmatch('[^,]+') do table.insert(answers, a) end
		Ui.answers = answers
		Ui.seen = {}
		local ok, problem = LrTasks.pcall(Actions.exportToStillpoint)
		out.seen = seenText()
		out.state = oneLine(Actions.state.text)
		Ui.answers = {}
		Ui.seen = {}
		if not ok then error(problem) end
	else
		error('unknown test command: ' .. tostring(cmd))
	end
	return out
end

-- Chamado pela espera do plugin (Bridge.start): atende os testcmd-*.txt que houver. Devolve true se atendeu algum
function TestCmd.handle()
	local folder = Bridge.folder()
	if not folder then return false end
	local found = {}
	for path in LrFileUtils.files(folder) do
		local name = LrPathUtils.leafName(path)
		if name:match('^testcmd%-.*%.txt$') then table.insert(found, path) end
	end
	if #found == 0 then return false end
	table.sort(found)
	for _, path in ipairs(found) do
		local text = readAll(path)
		if text and text:find('\nend=1') then
			LrFileUtils.delete(path)
			local request = parse(text)
			local lines = {}
			local catalogPath = LrApplication.activeCatalog():getPath()
			if not LrPathUtils.leafName(catalogPath):lower():find('self%-test') then
				lines = { 'ok=0', 'error=not a Self-Test catalog: ' .. oneLine(catalogPath) }
			else
				local ok, result = LrTasks.pcall(run, request)
				if ok then
					table.insert(lines, 'ok=1')
					for k, v in pairs(result) do table.insert(lines, k .. '=' .. oneLine(v)) end
				else
					lines = { 'ok=0', 'error=' .. oneLine(result) }
				end
			end
			Bridge.note('test command ' .. tostring(request.cmd) .. ': ' .. lines[1] .. (lines[2] and lines[1] == 'ok=0' and (' ' .. lines[2]) or ''))
			local file = io.open(LrPathUtils.child(folder, 'testresult-' .. tostring(request.id) .. '.txt'), 'wb')
			if file then
				file:write(table.concat(lines, '\n') .. '\nend=1\n')
				file:close()
			end
		end
	end
	return true
end

return TestCmd
