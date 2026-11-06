-- As janelas que o plugin abre (perguntas, avisos, recados), num lugar só. No teste automático (SelfTest.lua) nenhuma
-- janela abre: as respostas vêm de uma lista e cada janela fica anotada, para o teste conferir.
local LrDialogs = import 'LrDialogs'
local LrTasks = import 'LrTasks'

local Ui = {
	answers = nil,   -- no teste: respostas na ordem ('ok', 'cancel', 'other'); nil = janelas de verdade
	seen = {},       -- no teste: { kind = 'confirm' | 'message' | 'bezel' | 'modal', title = ..., buttons = ... }
}

local function scripted(kind, title, info, buttons)
	table.insert(Ui.seen, { kind = kind, title = tostring(title or ''), info = tostring(info or ''), buttons = buttons or {} })
	if kind == 'message' or kind == 'bezel' then return nil end
	local answer = table.remove(Ui.answers, 1)
	if not answer then
		Ui.seen[#Ui.seen].unexpected = true
		return 'cancel'
	end
	Ui.seen[#Ui.seen].answer = answer
	return answer
end

function Ui.confirm(title, info, action, cancel, other)
	if Ui.answers then return scripted('confirm', title, info, { action, cancel or 'Cancel', other }) end
	return LrDialogs.confirm(title, info, action, cancel, other)
end

function Ui.message(title, info, kind)
	if Ui.answers then return scripted('message', title, info) end
	return LrDialogs.message(title, info, kind)
end

function Ui.bezel(text, seconds)
	if Ui.answers then return scripted('bezel', text) end
	return LrDialogs.showBezel(text, seconds)
end

-- Janela com campos (a do Export to Stillpoint): no teste, fica com os valores que já estão nela
function Ui.modal(args)
	if Ui.answers then return scripted('modal', args and args.title, nil, { args and args.actionVerb }) end
	return LrDialogs.presentModalDialog(args)
end

function Ui.showPanel()
	if Ui.answers then return end
	LrTasks.pcall(function() require('Panel').show() end)
end

return Ui
