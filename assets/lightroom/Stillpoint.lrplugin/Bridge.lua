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
local importingCount = nil   -- fotos sendo colocadas no catálogo agora (o painel mostra "Importing n photos…")
local folderPath = nil
local pluginVersion = nil
local lastAlive = 0
local lastId = nil
local lastWaiting = nil
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

-- Uma linha só (os parênteses deixam só o texto: o gsub devolve também a contagem, e isso quebrava o
-- table.insert da lista de fotos)
local function oneLine(text)
	return (tostring(text or ''):gsub('[\r\n]+', ' '))
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

-- As coleções do Stillpoint que existem no catálogo aberto ("projeto\tcoleção"): o Stillpoint compara com o que ele
-- acha que está no Lightroom (o ⌘Z do Lightroom pode trazer de volta uma coleção que o plugin tirou)
local function stillpointCollections(catalog)
	local lines = {}
	-- LrTasks.pcall: o pcall comum não deixa o catálogo responder ("Yielding is not allowed"), e a lista não saía
	local LrTasks = import 'LrTasks'
	local ok, problem = LrTasks.pcall(function()
		for _, set in ipairs(catalog:getChildCollectionSets()) do
			if set:getName() == 'Stillpoint' then
				for _, projectSet in ipairs(set:getChildCollectionSets()) do
					for _, collection in ipairs(projectSet:getChildCollections()) do
						table.insert(lines, 'collection=' .. oneLine(projectSet:getName()) .. '\t' .. oneLine(collection:getName()))
						-- As fotos que estão nela (nomes de arquivo): tirar ou pôr uma foto na coleção pelo Lightroom
						-- muda o selo LR dela no Stillpoint
						local files = {}
						for _, photo in ipairs(collection:getPhotos()) do
							table.insert(files, oneLine(LrPathUtils.leafName(photo:getRawMetadata('path') or '')))
						end
						table.insert(lines, 'members=' .. oneLine(projectSet:getName()) .. '\t' .. oneLine(collection:getName()) .. '\t' .. table.concat(files, '|'))
					end
				end
			end
		end
	end)
	if not ok then Bridge.noteOnce('collections list: ' .. tostring(problem)) end
	return ok, lines
end

local function writeAlive()
	local catalog = LrApplication.activeCatalog()
	local text = 'time=' .. os.time() .. '\ncatalog=' .. oneLine(catalog and catalog:getPath() or '') .. '\nversion=' .. Bridge.version() .. '\n'
	local ok, lines = stillpointCollections(catalog)
	if ok then text = text .. 'collections=1\n' .. (#lines > 0 and (table.concat(lines, '\n') .. '\n') or '') end
	writeWhole(bridgeFile('alive.txt'), text .. 'end=1\n')
end

-- Coleção "Stillpoint › <projeto> › <sessão>" (cria o que faltar; devolve a que já existe)
local function collectionFor(catalog, request)
	local top = catalog:createCollectionSet('Stillpoint', nil, true)
	local projectName = request.project ~= nil and request.project ~= '' and request.project or 'No project'
	local projectSet = catalog:createCollectionSet(projectName, top, true)
	return catalog:createCollection(request.title ~= '' and request.title or 'Session', projectSet, true)
end

function Bridge.importing() return importingCount end

-- Duas edições iguais? (números com tolerância; tabelas por dentro)
function Bridge.same(a, b)
	if type(a) ~= type(b) then return false end
	if type(a) == 'number' then return math.abs(a - b) < 1e-6 end
	if type(a) ~= 'table' then return a == b end
	for k, v in pairs(a) do if not Bridge.same(v, b[k]) then return false end end
	for k, _ in pairs(b) do if a[k] == nil then return false end end
	return true
end

-- A edição de uma foto como ela chegou no catálogo (ou depois do Reset do Delete edits)
-- Guarda um valor por foto nas preferências do plugin. Sempre uma tabela nova: devolver a mesma tabela mudada às
-- preferências pode não ser gravado pelo Lightroom
local function prefsPut(key, path, value)
	local LrPrefs = import 'LrPrefs'
	local prefs = LrPrefs.prefsForPlugin()
	local all = {}
	for k, v in pairs(prefs[key] or {}) do all[k] = v end
	all[path] = value
	prefs[key] = all
end
Bridge.prefsPut = prefsPut

function Bridge.setBaseline(path, settings)
	prefsPut('baselines', path, settings)
end
function Bridge.baseline(path)
	local LrPrefs = import 'LrPrefs'
	local all = LrPrefs.prefsForPlugin().baselines
	return all and all[path]
end

-- Fotos da coleção na ordem do Stillpoint (01, 02, 03...). A ordem própria de uma coleção (Custom Order) é a ordem em
-- que as fotos entraram: uma foto que volta da lixeira entrava no fim (teste do dono, 2026-11-06). Por isso a coleção
-- é refeita na ordem certa: tira todas e põe de volta (dentro de uma escrita já aberta)
local function orderNumber(photo)
	local name = LrPathUtils.leafName(photo:getRawMetadata('path') or '') or ''
	return tonumber(name:match('^(%d+)_')) or 9999, name
end
local function putInOrder(collection, extra)
	local all, seen = {}, {}
	for _, photo in ipairs(collection:getPhotos() or {}) do
		if not seen[photo] then seen[photo] = true; table.insert(all, photo) end
	end
	for _, photo in ipairs(extra or {}) do
		if not seen[photo] then seen[photo] = true; table.insert(all, photo) end
	end
	-- As chaves são lidas antes de ordenar: ler do catálogo dentro do table.sort dava "Yielding is not allowed within a
	-- C or metamethod call" (teste do dono, 2026-11-06)
	local keys = {}
	for i, photo in ipairs(all) do
		local n, name = orderNumber(photo)
		keys[i] = { photo = photo, n = n, name = name }
	end
	table.sort(keys, function(a, b)
		if a.n ~= b.n then return a.n < b.n end
		return a.name < b.name
	end)
	all = {}
	for i, k in ipairs(keys) do all[i] = k.photo end
	local current = collection:getPhotos() or {}
	if #current > 0 then collection:removePhotos(current) end
	collection:addPhotos(all)
end

local function handle(request)
	local catalog = LrApplication.activeCatalog()
	importingCount = #request.photos
	-- O painel não mostra mais o recado da vez anterior ("Editing cancelled"…)
	pcall(function() local A = require('Actions'); A.state.text = nil end)
	-- O painel do Stillpoint abre junto (pedaço 2): mostra "Importing…" e depois os botões
	local LrTasks = import 'LrTasks'
	LrTasks.pcall(function() require('Panel').show() end)
	if request.catalog and request.catalog ~= '' and not samePath(catalog:getPath(), request.catalog) then
		writeStatus(request.id, 'wrong-catalog', { catalog = catalog:getPath() })
		return
	end
	local added = 0
	local missing = 0
	-- 1ª escrita: as fotos entram no catálogo no lugar onde estão (sem copiar) e a coleção é criada.
	-- Objetos criados numa escrita só podem ser usados depois dela: as fotos entram na coleção na 2ª.
	local newPaths = {}
	catalog:withWriteAccessDo('Stillpoint: add ' .. tostring(request.title), function()
		for _, path in ipairs(request.photos) do
			if not catalog:findPhotoByPath(path) then
				if LrFileUtils.exists(path) then
					catalog:addPhoto(path)
					added = added + 1
					table.insert(newPaths, path)
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
	catalog:withWriteAccessDo('Stillpoint: collection ' .. tostring(request.title), function()
		collection = collectionFor(catalog, request)
		putInOrder(collection, photos)
	end, { timeout = 60 })
	-- Como a foto chegou (sem edição): "tem edição" passa a ser "está diferente disso" (teste do dono, 2026-11-06:
	-- só o histórico do Lightroom contava, e uma foto sem edição, ou depois do Reset, virava "editada")
	for _, path in ipairs(newPaths) do
		local photo = catalog:findPhotoByPath(path)
		if photo then LrTasks.pcall(function() Bridge.setBaseline(path, photo:getDevelopSettings()) end) end
	end
	-- Como cada foto está agora, ao abrir a sessão (o Cancel editing compara com isso quando a foto nunca foi mandada)
	for _, photo in ipairs(photos) do
		LrTasks.pcall(function() Bridge.setOpened(photo:getRawMetadata('path'), photo:getDevelopSettings()) end)
	end
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

-- "Done editing" de uma sessão no Stillpoint: tira a coleção dela (as fotos e as edições ficam no catálogo).
-- Conjuntos que ficarem vazios (o do projeto, o Stillpoint) saem também.
local function findByName(list, name)
	for _, item in ipairs(list or {}) do
		if item:getName() == name then return item end
	end
	return nil
end

local function removeCollection(project, title)
	local catalog = LrApplication.activeCatalog()
	local top = findByName(catalog:getChildCollectionSets(), 'Stillpoint')
	local projectSet = top and findByName(top:getChildCollectionSets(), (project ~= nil and project ~= '') and project or 'No project')
	local collection = projectSet and findByName(projectSet:getChildCollections(), title)
	if not collection then
		Bridge.note('done editing: collection "' .. tostring(title) .. '" not found (already removed?)')
		return
	end
	-- Um passo só no histórico do Lightroom (um ⌘Z traz a coleção de volta): se ela é a única do projeto, sai o
	-- conjunto do projeto; se esse é o único do Stillpoint, sai o conjunto Stillpoint (cada um leva o que tem dentro)
	local onlyInProject = #projectSet:getChildCollections() == 1 and #projectSet:getChildCollectionSets() == 0
	local onlyInTop = onlyInProject and #top:getChildCollections() == 0 and #top:getChildCollectionSets() == 1
	catalog:withWriteAccessDo('Stillpoint: remove collection ' .. tostring(title), function()
		if onlyInTop then top:delete()
		elseif onlyInProject then projectSet:delete()
		else collection:delete() end
	end, { timeout = 60 })
	Bridge.note('done editing: collection "' .. tostring(title) .. '" removed')
	writeAlive()  -- a lista nova já sai (o Stillpoint não vê a coleção que acabou de sair)
end

Bridge.removeCollection = removeCollection

-- A edição de cada foto como foi mandada ao Stillpoint pela última vez (Export to Stillpoint): o "Cancel editing"
-- do painel compara com ela para saber se há mudanças que o Stillpoint não tem
function Bridge.setSent(path, settings)
	prefsPut('sentEdits', path, settings)
end
-- Como a foto estava quando a sessão foi aberta no Lightroom desta vez (o Cancel editing compara com isso quando a
-- foto nunca foi mandada ao Stillpoint)
function Bridge.setOpened(path, settings)
	prefsPut('openedEdits', path, settings)
end
function Bridge.opened(path)
	local LrPrefs = import 'LrPrefs'
	local all = LrPrefs.prefsForPlugin().openedEdits
	return all and all[path]
end
function Bridge.sent(path)
	local LrPrefs = import 'LrPrefs'
	local all = LrPrefs.prefsForPlugin().sentEdits
	return all and all[path]
end

local function handleDoneFiles()
	for path in LrFileUtils.files(Bridge.folder()) do
		local name = LrPathUtils.leafName(path)
		if name:match('^done%-.*%.txt$') then
			local text = readAll(path)
			local request = text and text:find('\nend=1') and parse(text)
			-- Coleção de outro catálogo (um por projeto): fica esperando o Lightroom abrir aquele catálogo
			local otherCatalog = request and request.catalog and request.catalog ~= ''
				and not samePath(LrApplication.activeCatalog():getPath(), request.catalog)
			if otherCatalog then
				Bridge.noteOnce('done editing for another catalog, waiting: ' .. tostring(request.title))
			elseif request then
				-- Primeiro tira a coleção e atualiza o alive.txt, só depois apaga o pedido: assim o Stillpoint nunca vê o
				-- pedido já feito com a lista velha (que ainda tem a coleção) e não acha que ela "voltou"
				local LrTasks = import 'LrTasks'
				local ok, problem = LrTasks.pcall(removeCollection, request.project, request.title)
				if not ok then Bridge.problem('done editing: ' .. tostring(problem)) end
				removeFile(path)
			end
		end
	end
end

-- Delete edits no Stillpoint (decisão do dono, 2026-11-06): as fotos voltam ao original no Lightroom (o Reset do
-- Develop, uma por vez: o SDK só faz isso na foto ativa do Develop). Pedido de outro catálogo espera esse catálogo abrir.
local function resetPhotos(request)
	local LrTasks = import 'LrTasks'
	local LrDevelopController = import 'LrDevelopController'
	local LrPrefs = import 'LrPrefs'
	local catalog = LrApplication.activeCatalog()
	local photos = {}
	for _, path in ipairs(request.photos) do
		local photo = catalog:findPhotoByPath(path)
		if photo then table.insert(photos, photo) end
	end
	if #photos == 0 then
		Bridge.note('delete edits: no photos of ' .. tostring(request.session) .. ' in this catalog to reset')
		return
	end
	-- Guarda a edição antes de voltar ao original (o ⌘Z do Stillpoint pede para pôr de volta, "bringback"). Uma foto
	-- que já está no original não troca o que foi guardado (⌘Z e ⌘⇧Z seguidos apagavam a edição guardada)
	local function save(photo)
		local path = photo:getRawMetadata('path')
		local base = Bridge.baseline(path)
		local now = photo:getDevelopSettings()
		if base and Bridge.same(now, base) then return false end
		local prefs = LrPrefs.prefsForPlugin()
		local saved = prefs.savedEdits or {}
		saved[path] = now
		prefs.savedEdits = saved
		return true
	end
	-- Com a foto como chegou guardada: volta a ela direto, sem precisar escolher a foto no Develop (escolher às vezes
	-- falhava e a foto ficava editada no Lightroom; teste do dono, 2026-11-06)
	local direct, develop = {}, {}
	for _, photo in ipairs(photos) do
		local base = Bridge.baseline(photo:getRawMetadata('path'))
		if base then table.insert(direct, { photo = photo, base = base }) else table.insert(develop, photo) end
	end
	local done, skipped = 0, 0
	if #direct > 0 then
		local changed = {}
		for _, item in ipairs(direct) do
			if save(item.photo) then table.insert(changed, item) else done = done + 1 end
		end
		if #changed > 0 then
			catalog:withWriteAccessDo('Stillpoint: delete the edit (' .. tostring(request.title) .. ')', function()
				for _, item in ipairs(changed) do item.photo:applyDevelopSettings(item.base) end
			end, { timeout = 60 })
			done = done + #changed
		end
		for _, item in ipairs(direct) do Bridge.setSent(item.photo:getRawMetadata('path'), nil) end
	end
	if #develop > 0 then
		local before = catalog:getTargetPhoto()
		local sources = catalog:getActiveSources()
		LrApplicationView.switchToModule('develop')
		for _, photo in ipairs(develop) do
			-- A foto precisa estar na vista atual para ser escolhida: mostra uma coleção (ou pasta) onde ela está
			local ok = LrTasks.pcall(function()
				local collections = photo:getContainedCollections()
				if collections and collections[1] then catalog:setActiveSources(collections)
				else catalog:setActiveSources({ catalog:getFolderByPath(LrPathUtils.parent(photo:getRawMetadata('path'))) }) end
			end)
			-- O Lightroom demora a trocar a vista: tenta escolher a foto algumas vezes
			for _ = 1, 6 do
				LrTasks.sleep(0.4)
				catalog:setSelectedPhotos(photo, {})
				LrTasks.sleep(0.3)
				if catalog:getTargetPhoto() == photo then break end
			end
			-- Só faz o Reset se a foto ativa é mesmo esta (nunca em outra foto)
			if catalog:getTargetPhoto() == photo then
				save(photo)
				LrDevelopController.resetAllDevelopAdjustments()
				LrTasks.sleep(0.4)
				LrTasks.pcall(function() Bridge.setBaseline(photo:getRawMetadata('path'), photo:getDevelopSettings()) end)
				Bridge.setSent(photo:getRawMetadata('path'), nil)  -- o Stillpoint ficou sem a editada
				done = done + 1
				LrTasks.sleep(0.2)
			else
				skipped = skipped + 1
				Bridge.problem('delete edits: could not select ' .. tostring(photo:getRawMetadata('path')) .. ' to reset it' .. (ok and '' or ' (no collection or folder)'))
			end
		end
		LrTasks.pcall(function() if sources and #sources > 0 then catalog:setActiveSources(sources) end end)
		if before then LrTasks.pcall(function() catalog:setSelectedPhotos(before, {}) end) end
	end
	Bridge.note('delete edits: ' .. done .. ' photos of ' .. tostring(request.session) .. ' back to the original' .. (skipped > 0 and (', ' .. skipped .. ' not found in the view') or ''))
end

-- ⌘Z do Delete edits no Stillpoint: a edição guardada antes do Reset volta (um passo no histórico do Lightroom)
local function bringBack(request)
	local LrPrefs = import 'LrPrefs'
	local prefs = LrPrefs.prefsForPlugin()
	local saved = prefs.savedEdits or {}
	local catalog = LrApplication.activeCatalog()
	local list = {}
	for _, path in ipairs(request.photos) do
		local photo = catalog:findPhotoByPath(path)
		if photo and saved[path] then table.insert(list, { photo = photo, settings = saved[path], path = path }) end
	end
	if #list == 0 then Bridge.note('bring back edits: nothing saved for ' .. tostring(request.session)) return end
	catalog:withWriteAccessDo('Stillpoint: bring back the edit (' .. tostring(request.title) .. ')', function()
		for _, item in ipairs(list) do item.photo:applyDevelopSettings(item.settings) end
	end, { timeout = 60 })
	-- A edição guardada fica (outro ⌘Z depois de um ⌘⇧Z ainda a encontra); o próximo Delete edits troca por outra
	for _, item in ipairs(list) do Bridge.setSent(item.path, item.settings) end
	Bridge.note('bring back edits: ' .. #list .. ' photos of ' .. tostring(request.session))
end

-- A coleção da sessão (Stillpoint › projeto › título)
local function sessionCollection(project, title)
	local catalog = LrApplication.activeCatalog()
	local top = findByName(catalog:getChildCollectionSets(), 'Stillpoint')
	local projectSet = top and findByName(top:getChildCollectionSets(), (project ~= nil and project ~= '') and project or 'No project')
	return projectSet and findByName(projectSet:getChildCollections(), title)
end

-- Fotos apagadas no Stillpoint saem da coleção ("remove"); as que voltaram da lixeira voltam ("readd").
-- Ficam no catálogo: o SDK do Lightroom não tira fotos do catálogo.
local function collectionPhotos(request, add)
	local catalog = LrApplication.activeCatalog()
	local collection = sessionCollection(request.project, request.title)
	if not collection and add then
		-- A coleção saiu (Done editing, sessão apagada): volta junto com as fotos
		catalog:withWriteAccessDo('Stillpoint: collection ' .. tostring(request.title), function()
			local top = catalog:createCollectionSet('Stillpoint', nil, true)
			local projectSet = catalog:createCollectionSet((request.project ~= nil and request.project ~= '') and request.project or 'No project', top, true)
			catalog:createCollection(request.title, projectSet, true)
		end, { timeout = 60 })
		collection = sessionCollection(request.project, request.title)
	end
	if not collection then Bridge.note((add and 'readd' or 'remove') .. ': collection "' .. tostring(request.title) .. '" not found') return end
	local photos = {}
	for _, path in ipairs(request.photos) do
		local photo = catalog:findPhotoByPath(path)
		if photo then table.insert(photos, photo) end
	end
	if #photos == 0 then return end
	catalog:withWriteAccessDo('Stillpoint: ' .. (add and 'put back ' or 'remove ') .. #photos .. ' photo' .. (#photos == 1 and '' or 's') .. (add and ' in ' or ' from ') .. tostring(request.title), function()
		if add then putInOrder(collection, photos) else collection:removePhotos(photos) end
	end, { timeout = 60 })
	Bridge.note((add and 'readd: ' or 'remove: ') .. #photos .. ' photos, collection "' .. tostring(request.title) .. '"')
	writeAlive()
end

-- Pedidos em arquivos <tipo>-*.txt: feitos quando o catálogo deles estiver aberto (senão esperam)
local QUEUED = {
	{ 'reset', resetPhotos },
	{ 'bringback', bringBack },
	{ 'remove', function(r) collectionPhotos(r, false) end },
	{ 'readd', function(r) collectionPhotos(r, true) end },
}

local function handleResetFiles()
	-- Na ordem em que o Stillpoint pediu (o nome é <tipo>-<hora>-<número>): um "pôr de volta" e um "voltar ao
	-- original" seguidos precisam acontecer nessa ordem
	local found = {}
	for path in LrFileUtils.files(Bridge.folder()) do
		local name = LrPathUtils.leafName(path)
		for _, q in ipairs(QUEUED) do
			if name:sub(1, #q[1] + 1) == q[1] .. '-' and name:match('%.txt$') then
				local time, number = name:match('^[%a]+%-(%d+)%-(%d+)%.txt$')
				table.insert(found, { path = path, q = q, time = tonumber(time) or 0, number = tonumber(number) or 0 })
			end
		end
	end
	table.sort(found, function(a, b) if a.time ~= b.time then return a.time < b.time end return a.number < b.number end)
	for _, f in ipairs(found) do
		local q, path = f.q, f.path
		local text = readAll(path)
		local request = text and text:find('\nend=1') and parse(text)
		local otherCatalog = request and request.catalog and request.catalog ~= ''
			and not samePath(LrApplication.activeCatalog():getPath(), request.catalog)
		if otherCatalog then
			Bridge.noteOnce(q[1] .. ' for another catalog, waiting: ' .. tostring(request.session))
		elseif request then
			removeFile(path)
			local LrTasks = import 'LrTasks'
			local ok, problem = LrTasks.pcall(q[2], request)
			if not ok then Bridge.problem(q[1] .. ': ' .. tostring(problem)) end
		end
	end
end

Bridge.handleQueued = handleResetFiles  -- (os testes chamam direto)

-- Uma volta da espera (a cada meio segundo)
function Bridge.tick()
	if not Bridge.folder() then return end
	if os.time() - lastAlive >= 1 then
		lastAlive = os.time()
		writeAlive()
	end
	if os.time() - startedAt < STARTUP_WAIT then return end  -- Lightroom acabando de abrir
	handleDoneFiles()
	handleResetFiles()
	local requestFile = bridgeFile('request.txt')
	local text = readAll(requestFile)
	if not text then return end
	if not text:find('\nend=1') then Bridge.noteOnce('request file without end (still being written?)') return end
	local request = parse(text)
	if not request.id then Bridge.noteOnce('request file without id') return end
	if request.id == lastId then Bridge.noteOnce('request ' .. request.id .. ' seen again, ignored') return end
	-- Pedido para outro catálogo (um catálogo por projeto): não pega. O Lightroom está perguntando se troca de
	-- catálogo ("Relaunch"); depois de trocar, o plugin do catálogo certo pega o pedido. O Stillpoint fica sabendo
	-- pelo estado "other-catalog" (teste de 2026-11-05: antes o plugin recusava na hora, com o Lightroom ainda perguntando).
	if request.catalog and request.catalog ~= '' then
		local open = LrApplication.activeCatalog():getPath()
		if not samePath(open, request.catalog) then
			if lastWaiting ~= request.id then
				lastWaiting = request.id
				Bridge.note('request ' .. request.id .. ': for another catalog, waiting for Lightroom Classic to switch')
				writeStatus(request.id, 'other-catalog', { catalog = open })
			end
			return
		end
	end
	lastId = request.id
	removeFile(requestFile)
	Bridge.note('request ' .. request.id .. ': ' .. tostring(request.action) .. ', ' .. #request.photos .. ' photos')
	writeStatus(request.id, 'working')
	if request.action == 'edit' then
		local LrTasks = import 'LrTasks'
		local ok, problem = LrTasks.pcall(handle, request)
		importingCount = nil
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
