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

-- Grava num arquivo temporário e troca de nome: o Stillpoint nunca lê um arquivo pela metade
local function writeWhole(path, text)
	local temp = path .. '.tmp'
	local file = io.open(temp, 'wb')
	if not file then return false end
	file:write(text)
	file:close()
	removeFile(path)
	return LrFileUtils.move(temp, path)
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
	local text = 'time=' .. os.time() .. '\ncatalog=' .. oneLine(catalog and catalog:getPath() or '') .. '\nversion=' .. Bridge.version() .. '\n'
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
	if collection then LrTasks.pcall(function() catalog:setActiveSources({ collection }) end) end
	focus = focus or selected[1] or photos[1]
	local others = {}
	for _, photo in ipairs(selected) do
		if photo ~= focus then table.insert(others, photo) end
	end
	LrTasks.pcall(function() catalog:setSelectedPhotos(focus, others) end)
	LrTasks.pcall(function() LrApplicationView.switchToModule('develop') end)
	writeStatus(request.id, 'done', { added = added, missing = missing, catalog = catalog:getPath() })
end

-- Uma volta da espera (a cada meio segundo)
function Bridge.tick()
	if not Bridge.folder() then return end
	if os.time() - lastAlive >= 1 then
		lastAlive = os.time()
		writeAlive()
	end
	local requestFile = bridgeFile('request.txt')
	local text = readAll(requestFile)
	if not text or not text:find('\nend=1') then return end
	local request = parse(text)
	if not request.id or request.id == lastId then return end
	lastId = request.id
	removeFile(requestFile)
	writeStatus(request.id, 'working')
	if request.action == 'edit' then
		local LrTasks = import 'LrTasks'
		local ok, problem = LrTasks.pcall(handle, request)
		if not ok then writeStatus(request.id, 'error', { message = tostring(problem) }) end
	else
		writeStatus(request.id, 'error', { message = 'This plugin does not know "' .. tostring(request.action) .. '". Reinstall it from Stillpoint › Settings.' })
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

return Bridge
