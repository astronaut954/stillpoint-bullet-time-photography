-- Conversa com o Stillpoint por arquivos numa pasta do app (o caminho está em bridge-path.txt, gravado pelo
-- Stillpoint ao instalar o plugin):
--   request.txt  pedido (linhas "nome=valor"; "photo=" e "select=" se repetem; termina com "end=1")
--   status.txt   resposta a um pedido (id, state = working | done | error | wrong-catalog; termina com "end=1")
--   alive.txt    hora e catálogo aberto, a cada segundo (o Stillpoint sabe que o plugin está ligado)
local LrApplication = import 'LrApplication'
local LrApplicationView = import 'LrApplicationView'
local LrFileUtils = import 'LrFileUtils'
local LrPathUtils = import 'LrPathUtils'

local Bridge = {}
local folderPath = nil
local pluginVersion = nil
local lastAlive = 0
local lastId = nil
-- Quando o plugin começou. Logo depois de abrir, o Lightroom ainda volta para a coleção e o módulo da última
-- vez: um pedido que chega nesse começo espera um pouco e a coleção é mostrada de novo depois (teste de 2026-11-05:
-- o Lightroom aberto pelo Stillpoint mostrava a sessão anterior).
local startedAt = os.time()
local STARTUP_WAIT = 8

local function trim(text)
	return (text or ''):gsub('^%s+', ''):gsub('%s+$', '')
end

-- O Lua do Lightroom não tem os.remove nem os.rename: apagar e trocar de nome pelo LrFileUtils
local function removeFile(path)
	if LrFileUtils.exists(path) then LrFileUtils.delete(path) end
end

local function readAll(path)
	local file = io.open(path, 'rb')
	if not file then return nil end
	local text = file:read('*a')
	file:close()
	return text
end

-- Grava o arquivo inteiro de uma vez. O Stillpoint só aceita o arquivo quando a última linha ("end=1") já
-- está lá, então não precisa de arquivo temporário nem de trocar de nome.
local function writeWhole(path, text)
	local file, problem = io.open(path, 'wb')
	if not file then
		Bridge.problem('could not write ' .. tostring(path) .. ': ' .. tostring(problem))
		return false
	end
	file:write(text)
	file:close()
	return true
end

function Bridge.folder()
	if not folderPath then
		local text = readAll(LrPathUtils.child(_PLUGIN.path, 'bridge-path.txt'))
		if text and trim(text) ~= '' then folderPath = trim(text) end
	end
	return folderPath
end

function Bridge.version()
	if not pluginVersion then
		pluginVersion = trim(readAll(LrPathUtils.child(_PLUGIN.path, 'version.txt')) or '')
		if pluginVersion == '' then pluginVersion = 'unknown' end
	end
	return pluginVersion
end

local function bridgeFile(name)
	return LrPathUtils.child(Bridge.folder(), name)
end

local function parse(text)
	local request = { photos = {}, select = {} }
	for raw in (text .. '\n'):gmatch('([^\n]*)\n') do
		local line = raw:gsub('\r$', '')
		local key, value = line:match('^([^=]+)=(.*)$')
		if key == 'photo' then table.insert(request.photos, value)
		elseif key == 'select' then table.insert(request.select, value)
		elseif key then request[key] = value end
	end
	return request
end

local function oneLine(text)
	return tostring(text or ''):gsub('[\r\n]+', ' ')
end

local function writeStatus(id, state, extra)
	local lines = { 'id=' .. id, 'state=' .. state }
	for key, value in pairs(extra or {}) do table.insert(lines, key .. '=' .. oneLine(value)) end
	table.insert(lines, 'end=1')
	writeWhole(bridgeFile('status.txt'), table.concat(lines, '\n') .. '\n')
end

-- Mesmo arquivo? No Windows as letras maiúsculas e as barras não contam
local function samePath(a, b)
	a, b = a or '', b or ''
	if WIN_ENV then
		a = a:gsub('/', '\\'):lower()
		b = b:gsub('/', '\\'):lower()
	end
	return a == b
end

local function writeAlive()
	local catalog = LrApplication.activeCatalog()
	local text = 'time=' .. os.time() .. '\ncatalog=' .. oneLine(catalog and catalog:getPath() or '') .. '\nversion=' .. Bridge.version() .. '\nend=1\n'
	writeWhole(bridgeFile('alive.txt'), text)
end

-- Coleção "Stillpoint › <projeto> › <sessão>" (cria o que faltar; devolve a que já existe)
local function collectionFor(catalog, request)
	local top = catalog:createCollectionSet('Stillpoint', nil, true)
	local projectName = request.project ~= nil and request.project ~= '' and request.project or 'No project'
	local projectSet = catalog:createCollectionSet(projectName, top, true)
	return catalog:createCollection(request.title ~= '' and request.title or 'Session', projectSet, true)
end

local function handle(request)
	local catalog = LrApplication.activeCatalog()
	if request.catalog and request.catalog ~= '' and not samePath(catalog:getPath(), request.catalog) then
		writeStatus(request.id, 'wrong-catalog', { catalog = catalog:getPath() })
		return
	end
	local added = 0
	local missing = 0
	-- 1ª escrita: as fotos entram no catálogo no lugar onde estão (sem copiar) e a coleção é criada.
	-- Objetos criados numa escrita só podem ser usados depois dela: as fotos entram na coleção na 2ª.
	catalog:withWriteAccessDo('Stillpoint: add session', function()
		for _, path in ipairs(request.photos) do
			if not catalog:findPhotoByPath(path) then
				if LrFileUtils.exists(path) then
					catalog:addPhoto(path)
					added = added + 1
				else
					missing = missing + 1
				end
			end
		end
		collectionFor(catalog, request)
	end, { timeout = 60 })
	local photos, selected, focus = {}, {}, nil
	for _, path in ipairs(request.photos) do
		local photo = catalog:findPhotoByPath(path)
		if photo then
			table.insert(photos, photo)
			if samePath(path, request.focus) then focus = photo end
			for _, wanted in ipairs(request.select) do
				if samePath(path, wanted) then table.insert(selected, photo) end
			end
		end
	end
	if #photos == 0 then
		Bridge.note('request ' .. request.id .. ': no photos could be added')
		writeStatus(request.id, 'error', { message = 'Lightroom Classic could not add the photos of this session.' })
		return
	end
	local collection
	catalog:withWriteAccessDo('Stillpoint: fill the collection', function()
		collection = collectionFor(catalog, request)
		collection:addPhotos(photos)
	end, { timeout = 60 })
	-- Mostra a coleção, seleciona as fotos (a ativa primeiro) e abre o Develop
	-- (cada passo à parte: se um não der, os outros ainda acontecem e as fotos já estão na coleção)
	local LrTasks = import 'LrTasks'
	focus = focus or selected[1] or photos[1]
	local others = {}
	for _, photo in ipairs(selected) do
		if photo ~= focus then table.insert(others, photo) end
	end
	local function show()
		if collection then LrTasks.pcall(function() catalog:setActiveSources({ collection }) end) end
		LrTasks.pcall(function() catalog:setSelectedPhotos(focus, others) end)
		LrTasks.pcall(function() LrApplicationView.switchToModule('develop') end)
	end
	show()
	-- Lightroom recém-aberto: mostra de novo depois de alguns segundos, por cima do que ele restaurou
	if os.time() - startedAt < 60 then
		LrTasks.sleep(3)
		show()
	end
	Bridge.note('request ' .. request.id .. ': done, ' .. added .. ' new in the catalog, ' .. missing .. ' missing')
	writeStatus(request.id, 'done', { added = added, missing = missing, catalog = catalog:getPath() })
end

-- Uma volta da espera (a cada meio segundo)
function Bridge.tick()
	if not Bridge.folder() then return end
	if os.time() - lastAlive >= 1 then
		lastAlive = os.time()
		writeAlive()
	end
	if os.time() - startedAt < STARTUP_WAIT then return end  -- Lightroom acabando de abrir
	local requestFile = bridgeFile('request.txt')
	local text = readAll(requestFile)
	if not text then return end
	if not text:find('\nend=1') then Bridge.noteOnce('request file without end (still being written?)') return end
	local request = parse(text)
	if not request.id then Bridge.noteOnce('request file without id') return end
	if request.id == lastId then Bridge.noteOnce('request ' .. request.id .. ' seen again, ignored') return end
	lastId = request.id
	removeFile(requestFile)
	Bridge.note('request ' .. request.id .. ': ' .. tostring(request.action) .. ', ' .. #request.photos .. ' photos')
	writeStatus(request.id, 'working')
	if request.action == 'edit' then
		local LrTasks = import 'LrTasks'
		local ok, problem = LrTasks.pcall(handle, request)
		if not ok then writeStatus(request.id, 'error', { message = tostring(problem) }) end
	else
		writeStatus(request.id, 'error', { message = 'This plugin does not know "' .. tostring(request.action) .. '". Reinstall it from Stillpoint › Settings.' })
	end
end

-- Uma linha no registro do plugin (plugin-log.txt, na pasta da conversa): para saber se ele começou e o que fez
function Bridge.note(text)
	if not Bridge.folder() then return end
	local file = io.open(bridgeFile('plugin-log.txt'), 'ab')
	if file then
		file:write(os.date('%Y-%m-%d %H:%M:%S') .. ' ' .. tostring(text) .. '\n')
		file:close()
	end
end

-- A mesma linha só uma vez seguida (a espera roda duas vezes por segundo)
local lastNote = nil
function Bridge.noteOnce(text)
	if text ~= lastNote then
		lastNote = text
		Bridge.note(text)
	end
end

function Bridge.problem(problem)
	-- Fica no arquivo de problemas do plugin, na pasta da conversa (para mandar ao desenvolvedor)
	if not Bridge.folder() then return end
	local file = io.open(bridgeFile('plugin-problems.txt'), 'ab')
	if file then
		file:write(os.date('%Y-%m-%d %H:%M:%S') .. ' ' .. tostring(problem) .. '\n')
		file:close()
	end
end

function Bridge.goodbye()
	if Bridge.folder() then removeFile(bridgeFile('alive.txt')) end
end

-- Começa (ou recomeça) a esperar os pedidos. Cada começo tem um número: o anterior para sozinho.
-- Desligado no Plug-in Manager (Disable): a volta continua, mas não responde nem dá sinal de vida; ligado de novo
-- (Enable), volta a responder. (O Lightroom não roda o Init.lua de novo ao ligar: parar a volta deixava o plugin
-- mudo até fechar o Lightroom, teste de 2026-11-05.)
function Bridge.start(why)
	local LrTasks = import 'LrTasks'
	_G.StillpointGeneration = (_G.StillpointGeneration or 0) + 1
	local generation = _G.StillpointGeneration
	LrTasks.startAsyncTask(function()
		Bridge.note('Stillpoint plugin ' .. tostring(Bridge.version()) .. ' listening (' .. tostring(why) .. ', bridge folder: ' .. tostring(Bridge.folder()) .. ')')
		local wasOff = false
		while _G.StillpointGeneration == generation do
			local off = _PLUGIN.enabled == false
			if off ~= wasOff then
				wasOff = off
				Bridge.note(off and 'turned off in the Plug-in Manager: not answering' or 'turned on again: answering')
				if off then Bridge.goodbye() end
			end
			if not off then
				local ok, problem = LrTasks.pcall(Bridge.tick)
				if not ok then Bridge.problem(problem) end
			end
			LrTasks.sleep(0.5)
		end
		Bridge.note('Stillpoint plugin stopped listening (' .. tostring(why) .. ')')
	end, 'Stillpoint bridge')
end

return Bridge
