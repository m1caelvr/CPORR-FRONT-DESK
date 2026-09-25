'use strict';

// Dois conjuntos independentes em memória. Nenhuma gravação em storage ou servidor.
const cadastros = []; // PK lógica: tipo + chave normalizada.
const movimentacoes = []; // PK: id; referência ao cadastro: tipo + chave.
const types = { civil: 'Visitante civil', external: 'Militar de outra OM', internal: 'Militar do CPOR', vehicle: 'Viatura da OM' };
const ranks = ['Soldado', 'Cabo', '3º Sargento', '2º Sargento', '1º Sargento', 'Subtenente', 'Aspirante a Oficial', '2º Tenente', '1º Tenente', 'Capitão', 'Major', 'Tenente-Coronel', 'Coronel', 'General de Brigada', 'General de Divisão', 'General de Exército', 'Aluno', 'Cadete'];
const profileNames = { civil: ['name', 'phone'], external: ['rank', 'warName', 'name', 'om'], internal: ['section'], vehicle: ['model', 'om'] };
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const docNorm = s => norm(s).replace(/[^A-Z0-9]/g, '');
const trim = s => String(s || '').trim();
const keyFor = (t, d) => t === 'internal' ? JSON.stringify([norm(d.rank), norm(d.warName)]) : docNorm(t === 'vehicle' ? d.plate : d.identity);
const keyNames = t => t === 'internal' ? ['rank', 'warName'] : t === 'vehicle' ? ['plate'] : ['identity'];
const isMilitary = t => t === 'internal' || t === 'external';
const isOpen = m => !m.encerramento;
let seq = 0, cadastroSeq = 0;

function keyReady(t, d) {
  return !!types[t] && (t === 'internal' ? !!(d.rank && norm(d.warName)) : !!keyFor(t, d));
}
function findExisting(t, d) {
  return keyReady(t, d) ? cadastros.find(c => c.tipo === t && c.chave === keyFor(t, d)) || null : null;
}
function findOpen(c) {
  return movimentacoes.find(m => m.cadastroId === c.id && isOpen(m));
}
function saveProfile(d, existing = null) {
  const tipo = d.type;
  if (!keyReady(tipo, d)) throw Error('Informe uma identificação válida.');
  if (existing && (!cadastros.includes(existing) || existing.tipo !== tipo)) throw Error('Cadastro inválido para edição.');
  const duplicate = findExisting(tipo, d);
  if (duplicate && duplicate !== existing) throw Error('Esta identificação já pertence a outro cadastro. Confira os dados.');
  const dados = {};
  for (const name of [...keyNames(tipo), ...profileNames[tipo]]) {
    dados[name] = trim(d[name]);
    if (name !== 'phone' && !dados[name]) throw Error('Preencha todos os campos obrigatórios do cadastro.');
  }
  if (existing) {
    existing.chave = keyFor(tipo, dados);
    existing.dados = dados;
    existing.atualizadoEm = new Date().toISOString();
    return existing; // O id estável mantém vínculos e as fichas preservam seus dados originais.
  }
  const c = { id: ++cadastroSeq, tipo, chave: keyFor(tipo, dados), dados, criadoEm: new Date().toISOString() };
  cadastros.push(c);
  return c; // Cadastrar não cria uma movimentação.
}
// Sugestões não definem identidade: o operador sempre escolhe o cadastro.
const phoneNorm = value => String(value || '').replace(/\D/g, '');
function suggestProfiles(tipo, fieldName, value, exclude = null) {
  const query = ['name', 'warName'].includes(fieldName) ? norm(value) : fieldName === 'phone' ? phoneNorm(value) : docNorm(value);
  if (!query || (['name', 'warName'].includes(fieldName) && query.length < 2)) return [];
  return cadastros.filter(c => {
    if (c.tipo !== tipo || c === exclude) return false;
    if (fieldName === 'phone') return !!phoneNorm(c.dados.phone) && phoneNorm(c.dados.phone) === query;
    if (fieldName === 'identity' || fieldName === 'plate') return docNorm(c.dados[fieldName]) === query;
    if (fieldName === 'name' || fieldName === 'warName') return norm(c.dados[fieldName]).includes(query);
    return false;
  }).sort((a, b) => {
    const av = norm(a.dados[fieldName]), bv = norm(b.dados[fieldName]);
    return Number(bv.startsWith(query)) - Number(av.startsWith(query)) || av.localeCompare(bv, 'pt-BR');
  });
}
function parseMoment(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !/^\d{2}:\d{2}$/.test(time || '')) throw Error('Informe data e horário válidos.');
  const timestamp = new Date(`${day}T${time}:00-03:00`);
  if (!Number.isFinite(timestamp.getTime())) throw Error('Informe data e horário válidos.');
  const local = new Date(timestamp.getTime() - 3 * 3600000).toISOString().slice(0, 16);
  if (local !== `${day}T${time}`) throw Error('Informe uma data válida.');
  if (timestamp.getTime() > Date.now()) throw Error('A data e o horário não podem estar no futuro.');
  return timestamp.toISOString();
}
function addMovement(c, d) {
  if (!cadastros.includes(c)) throw Error('Selecione um cadastro existente.');
  if (findOpen(c)) throw Error('Já existe uma ficha em aberto. Encerre essa ficha antes de abrir outra para este cadastro.');
  if (!trim(d.purpose) || !trim(d.destination)) throw Error('Informe objetivo e destino.');
  if (c.tipo === 'vehicle' && !trim(d.driver)) throw Error('Informe o motorista.');
  if (c.tipo === 'internal' && !['Entrada no CPOR', 'Saída do CPOR'].includes(d.direction)) throw Error('Selecione a movimentação.');
  const inicio = parseMoment(d.visitDate, d.visitTime);
  const direction = c.tipo === 'vehicle' || (c.tipo === 'internal' && d.direction === 'Saída do CPOR') ? 'Saída' : 'Entrada';
  const m = {
    id: ++seq, cadastroId: c.id, tipo: c.tipo, chave: c.chave, dados: { ...c.dados },
    inicio, direction, purpose: trim(d.purpose), destination: trim(d.destination),
    contact: trim(d.contact), driver: trim(d.driver), passengers: trim(d.passengers), notes: trim(d.notes),
    fim: null, // Horário de saída/retorno real. Fica nulo na finalização administrativa.
    encerramento: null // { tipo: 'saida' | 'retorno' | 'finalizacao', em, motivo }
  };
  movimentacoes.push(m);
  return m;
}
function closeMovement(id, mode, day, time, reason = '') {
  const m = movimentacoes.find(r => r.id === id);
  if (!m || !isOpen(m)) throw Error('Esta ficha já foi encerrada ou não foi encontrada.');
  if (!['movement', 'finalize'].includes(mode)) throw Error('Ação inválida.');
  if (mode === 'finalize' && !isMilitary(m.tipo)) throw Error('Esta categoria exige o registro de saída ou retorno.');
  if (mode === 'finalize' && !trim(reason)) throw Error('Informe o motivo da finalização.');
  const em = parseMoment(day, time);
  if (new Date(em) < new Date(m.inicio)) throw Error('O encerramento não pode ocorrer antes do início da ficha.');
  const tipo = mode === 'finalize' ? 'finalizacao' : m.direction === 'Saída' ? 'retorno' : 'saida';
  m.encerramento = { tipo, em, motivo: mode === 'finalize' ? trim(reason) : '' };
  m.fim = mode === 'finalize' ? null : em;
  return m;
}

// Interface. As funções acima podem ser substituídas por chamadas a uma API.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let page = 'home', stage = 'profile', selected = null, editing = null, matchAnchor = null, matchCandidates = [], closing = null, toastTimer;
const form = $('form');
const normalSections = [...document.querySelectorAll('main > .heading, main > .metrics, main > .panel, main > .footnote')];
function label(t, d) {
  return t === 'vehicle' ? d.plate : isMilitary(t) ? `${d.rank} ${d.warName}` : d.name;
}
function date(s) {
  return new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function nowFields() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = t => parts.find(x => x.type === t).value;
  return { day: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour')}:${v('minute')}` };
}
function field(name, title, options = null, required = true, type = 'text', value = '') {
  const control = options
    ? `<select name="${name}" ${required ? 'required' : ''}><option value="">Selecione</option>${options.map(x => `<option${x === value ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`
    : `<input type="${type}" name="${name}" value="${esc(value)}" maxlength="150" ${required ? 'required' : ''} autocomplete="off">`;
  return `<label>${title}${required ? ' *' : ' <span class="optional">(opcional)</span>'}${control}</label>`;
}
function notify(msg) {
  $('toast').textContent = msg; $('toast').style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').style.display = 'none'; }, 4000);
}
function setSection(id, active) {
  $(id).hidden = !active;
  $(id).querySelectorAll('input,select,textarea').forEach(el => { el.disabled = !active; });
}
function setupProfile() {
  const t = $('type').value;
  $('keyHint').textContent = t === 'internal' ? 'Informe posto/graduação e nome de guerra para verificar se já há cadastro.' : t === 'vehicle' ? 'Informe a placa para verificar se já há cadastro.' : 'Informe a identidade para verificar se já há cadastro.';
  $('keyFields').innerHTML = t === 'internal' ? field('rank', 'Posto / graduação', ranks) + field('warName', 'Nome de guerra') : t === 'vehicle' ? field('plate', 'Placa') : field('identity', 'Identidade');
  $('profileFields').innerHTML = t === 'civil' ? field('name', 'Nome completo') + field('phone', 'Telefone', null, false, 'tel') : t === 'external' ? field('rank', 'Posto / graduação', ranks) + field('warName', 'Nome de guerra') + field('name', 'Nome completo') + field('om', 'OM de origem') : t === 'internal' ? field('section', 'Seção / subunidade') : field('model', 'Modelo / tipo de viatura') + field('om', 'OM responsável');
  $('profileSection').querySelectorAll('input').forEach(el => {
    if (['name', 'warName', 'identity', 'plate', 'phone'].includes(el.name)) {
      el.setAttribute('aria-haspopup', 'dialog'); el.setAttribute('aria-controls', 'matchPanel'); el.setAttribute('aria-expanded', 'false');
    }
  });
  $('error').textContent = '';
}
function clearMatch() {
  if (matchAnchor) matchAnchor.setAttribute('aria-expanded', 'false');
  $('matchPanel').hidden = true; matchCandidates = []; matchAnchor = null;
}
function positionMatch() {
  if (!matchAnchor || $('matchPanel').hidden) return;
  const box = matchAnchor.getBoundingClientRect(), popup = $('matchPanel');
  const viewport = window.visualViewport;
  const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
  const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
  if (box.bottom < topEdge || box.top > topEdge + height) { clearMatch(); return; }
  const panelWidth = Math.min(390, width - 24);
  popup.style.width = `${panelWidth}px`;
  const left = Math.max(leftEdge + 12, Math.min(box.left, leftEdge + width - panelWidth - 12));
  const above = box.top - topEdge - 22, below = topEdge + height - box.bottom - 22;
  const useAbove = above >= 180 || above >= below;
  popup.dataset.side = useAbove ? 'above' : 'below';
  popup.style.maxHeight = `${Math.max(90, Math.min(330, (useAbove ? above : below)))}px`;
  popup.style.left = `${left}px`;
  popup.style.top = `${useAbove ? Math.max(topEdge + 10, box.top - popup.offsetHeight - 10) : box.bottom + 10}px`;
  popup.style.setProperty('--pointer-x', `${Math.max(18, Math.min(panelWidth - 18, box.left + Math.min(box.width / 2, 45) - left))}px`);
}
function lookup(eventOrInput) {
  if (!['profile', 'edit'].includes(stage) || page !== 'profile') return [];
  let input = eventOrInput?.target || eventOrInput;
  if (input?.name === 'rank') input = form.elements.warName;
  if (!input || !['name', 'warName', 'identity', 'plate', 'phone'].includes(input.name)) { clearMatch(); return []; }
  const candidates = suggestProfiles(editing?.tipo || $('type').value, input.name, input.value, editing);
  clearMatch();
  if (!candidates.length) return [];
  matchAnchor = input; matchCandidates = candidates; input.setAttribute('aria-expanded', 'true');
  const vehicle = (editing?.tipo || $('type').value) === 'vehicle';
  $('matchTitle').textContent = vehicle ? 'É esta viatura?' : 'É esta pessoa?';
  $('matchCount').textContent = `${candidates.length} ${candidates.length === 1 ? 'cadastro encontrado' : 'cadastros encontrados'}`;
  $('matchHelp').textContent = stage === 'edit' ? 'Outra pessoa já cadastrada. Confira a identificação antes de salvar.' : 'Selecione para preencher os dados.';
  $('matchList').innerHTML = candidates.map((c, i) => {
    const details = [c.dados.identity ? `Identidade: ${c.dados.identity}` : '', c.dados.phone ? `Telefone: ${c.dados.phone}` : '', c.dados.om || c.dados.section || c.dados.model || ''].filter(Boolean).join(' · ');
    return `<button type="button" class="match-choice" data-candidate="${i}"><strong>${esc(label(c.tipo, c.dados))}</strong>${c.dados.name && c.dados.name !== label(c.tipo, c.dados) ? `<span>${esc(c.dados.name)}</span>` : ''}<small>${esc(details)}</small><span class="match-pick">${stage === 'edit' ? 'Conferir este cadastro' : 'Sim, é este cadastro'} →</span></button>`;
  }).join('');
  $('matchPanel').hidden = false; positionMatch();
  return candidates;
}
function confirmMatch(index) {
  const c = matchCandidates[index], anchor = matchAnchor;
  if (!c || !anchor || !suggestProfiles(editing?.tipo || $('type').value, anchor.name, anchor.value, editing).includes(c)) { clearMatch(); return; }
  if (stage === 'edit') {
    // Durante edição, não troca o objeto nem descarta o rascunho ao conferir uma sugestão.
    clearMatch(); $('error').textContent = `Confira os dados: ${label(c.tipo, c.dados)} já está cadastrado. Suas alterações ainda não foram salvas.`; anchor.focus(); return;
  }
  clearMatch(); openForm(c);
}
function dismissMatch() {
  const anchor = matchAnchor; clearMatch(); anchor?.focus();
}
function setupEntry() {
  const t = selected.tipo, now = nowFields();
  let fields = field('visitDate', 'Data da movimentação', null, true, 'date', now.day) + field('visitTime', 'Horário', null, true, 'time', now.time);
  if (t === 'internal') fields += field('direction', 'Movimentação', ['Entrada no CPOR', 'Saída do CPOR'], true, 'text', 'Entrada no CPOR');
  if (t === 'vehicle') fields += field('driver', 'Motorista (posto e nome)');
  // Objetivo livre para todas as categorias, inclusive civis.
  fields += field('purpose', t === 'vehicle' ? 'Finalidade da missão' : 'Objetivo / motivo') + field('destination', 'Destino / seção');
  if (t === 'vehicle') fields += field('passengers', 'Passageiros', null, false);
  if (t === 'civil' || t === 'external') fields += field('contact', 'Pessoa procurada', null, false);
  $('visitFields').innerHTML = fields;
  const existing = findOpen(selected);
  $('selectedSummary').innerHTML = `<span class="eyebrow">CADASTRO SELECIONADO</span><h2>${esc(label(t, selected.dados))}</h2><p>${types[t]}</p>${existing ? `<div class="open-warning"><strong>Já existe uma ficha em aberto desde ${date(existing.inicio)}.</strong><p>Encerre essa anotação antes de abrir outra.</p>${rowActions(existing)}</div>` : ''}`;
  $('entryHint').textContent = isMilitary(t) ? 'O expediente normal não exige anotação. Em casos como pernoite seguido de expediente, a ficha pode ser finalizada sem registrar uma saída.' : t === 'civil' ? 'A ficha de visita deverá ser encerrada com o registro da saída.' : 'Registre a saída da viatura e, depois, seu retorno.';
  updateEntryButton();
  if (form.elements.direction) form.elements.direction.onchange = updateEntryButton;
}
function updateEntryButton() {
  $('submit').textContent = 'Registrar fluxo';
  $('submit').disabled = !!findOpen(selected);
}
function openForm(record = null) {
  clearMatch(); editing = null; selected = record; stage = record ? 'entry' : 'profile';
  form.reset(); $('error').textContent = ''; $('submit').disabled = false;
  $('profileSection').hidden = !!record; $('entrySection').hidden = !record;
  if (record) setupEntry(); else { $('type').value = 'civil'; setupProfile(); }
  setSection('profileSection', !record); setSection('entrySection', !!record);
  $('saveOnly').hidden = !!record;
  $('formTitle').textContent = record ? 'Nova ficha' : 'Novo cadastro';
  if (!record) $('submit').textContent = 'Registrar fluxo';
  $('cancel').textContent = record ? 'Voltar à consulta' : 'Voltar ao início';
  route(record ? 'entry' : 'profile');
}
function openEdit(c) {
  clearMatch(); editing = c; selected = null; stage = 'edit';
  form.reset(); $('type').value = c.tipo; setupProfile();
  setSection('profileSection', true); setSection('entrySection', false);
  $('type').disabled = true;
  for (const [name, value] of Object.entries(c.dados)) if (form.elements[name]) form.elements[name].value = value;
  $('saveOnly').hidden = true; $('submit').disabled = false;
  $('submit').textContent = 'Salvar alterações'; $('formTitle').textContent = 'Editar cadastro';
  $('cancel').textContent = 'Cancelar edição';
  $('keyHint').textContent = 'Atualize os dados e salve. As fichas anteriores mantêm as informações da ocasião.';
  route('profile');
}
function statusLabel(m) {
  if (isOpen(m)) return 'Em aberto';
  if (m.encerramento.tipo === 'finalizacao') return 'Finalizada sem saída / retorno';
  return m.encerramento.tipo === 'saida' ? 'Saída registrada' : 'Retorno registrado';
}
function rowActions(m) {
  if (!isOpen(m)) return '<span class="muted">—</span>';
  return `<div class="row-actions"><button class="row-action" data-finish="${m.id}">${m.direction === 'Saída' ? 'Registrar retorno' : 'Registrar saída'}</button>${isMilitary(m.tipo) ? `<button class="row-action finalize-action" data-finalize="${m.id}">Finalizar ficha</button>` : ''}</div>`;
}
function statusHtml(m) {
  return `<span class="pill ${isOpen(m) ? '' : m.encerramento.tipo === 'finalizacao' ? 'finalized' : 'closed'}">${statusLabel(m)}</span>`;
}
function endHtml(m) {
  if (isOpen(m)) return '—';
  const e = m.encerramento;
  return `${date(e.em)}<small>${e.tipo === 'finalizacao' ? 'Finalização da anotação' : e.tipo === 'saida' ? 'Saída' : 'Retorno'}</small>${e.motivo ? `<small class="wrap-note">${esc(e.motivo)}</small>` : ''}`;
}
function renderRecent() {
  const recent = movimentacoes.slice().sort((a, b) => new Date(b.inicio) - new Date(a.inicio) || b.id - a.id).slice(0, 5);
  $('recentBody').innerHTML = recent.map(m => `<tr><td><strong>${esc(label(m.tipo, m.dados))}</strong><small>${types[m.tipo]}</small></td><td>${date(m.inicio)}<small>${m.direction}</small></td><td class="wrap-note">${esc(m.purpose)}<small>${esc(m.destination)}</small></td><td>${statusHtml(m)}</td><td>${rowActions(m)}</td></tr>`).join('');
  $('recentEmpty').hidden = recent.length > 0;
}
function render() {
  $('inside').textContent = movimentacoes.filter(m => m.tipo !== 'vehicle' && isOpen(m)).length;
  $('vehicles').textContent = movimentacoes.filter(m => m.tipo === 'vehicle' && isOpen(m)).length;
  $('total').textContent = movimentacoes.length; $('registered').textContent = cadastros.length;
  renderRecent();
  const isReg = page === 'registry', q = norm($('search').value), t = $('categoryFilter').value, status = $('statusFilter').value;
  const rows = (isReg ? cadastros : movimentacoes).filter(r => {
    const matches = !q || norm(Object.values(r.dados).join(' ') + ' ' + (r.purpose || '') + ' ' + (r.destination || '')).includes(q) || (docNorm(q) && docNorm(r.chave).includes(docNorm(q)));
    return (!t || r.tipo === t) && matches && (isReg || !status || (status === 'open' ? isOpen(r) : status === 'finalized' ? r.encerramento?.tipo === 'finalizacao' : !isOpen(r)));
  }).slice().reverse();
  $('pageTitle').textContent = isReg ? 'Cadastros' : 'Movimentações';
  $('pageDesc').textContent = isReg ? 'Cadastros independentes, disponíveis para uma nova ficha quando necessário.' : 'Acompanhe as fichas e seus encerramentos.';
  $('newBtn').textContent = '＋ Novo cadastro';
  $('tableTitle').textContent = isReg ? 'Pessoas e viaturas cadastradas' : 'Livro de movimentações';
  $('tableSubtitle').textContent = isReg ? 'Salvar um cadastro não abre uma ficha.' : 'Finalizar uma anotação não significa registrar uma saída.';
  $('statusFilter').hidden = isReg;
  $('thead').innerHTML = `<tr>${(isReg ? ['Identificação', 'Categoria', 'Fichas', 'Ação'] : ['Identificação', 'Objetivo / destino', 'Início', 'Encerramento', 'Situação', 'Ações']).map(x => `<th>${x}</th>`).join('')}</tr>`;
  $('tbody').innerHTML = rows.map(r => isReg ? `<tr><td><strong>${esc(label(r.tipo, r.dados))}</strong><small>${esc(r.dados.om || r.dados.section || '')}</small></td><td>${types[r.tipo]}</td><td>${findOpen(r) ? 'Ficha em aberto' : 'Sem ficha em aberto'}</td><td><div class="registry-actions"><button class="row-action" data-reuse="${cadastros.indexOf(r)}">${findOpen(r) ? 'Ver ficha' : 'Registrar fluxo'}</button><button class="row-action" data-edit="${cadastros.indexOf(r)}">Editar</button></div></td></tr>` : `<tr><td><strong>${esc(label(r.tipo, r.dados))}</strong><small>${types[r.tipo]} · #${String(r.id).padStart(3, '0')}</small></td><td class="wrap-note">${esc(r.purpose)}<small>${esc(r.destination)}</small>${r.driver ? `<small>Motorista: ${esc(r.driver)}</small>` : ''}${r.notes ? `<small>${esc(r.notes)}</small>` : ''}</td><td>${date(r.inicio)}<small>${r.direction}</small></td><td>${endHtml(r)}</td><td>${statusHtml(r)}</td><td>${rowActions(r)}</td></tr>`).join('');
  $('count').textContent = `${rows.length} registros`; $('footerCount').textContent = `${rows.length} ${isReg ? 'cadastros' : 'fichas'} exibidos`;
  $('empty').hidden = rows.length > 0;
  $('empty').querySelector('h3').textContent = q || t || status ? 'Nenhum resultado encontrado' : isReg ? 'Nenhum cadastro nesta sessão' : 'Nenhuma ficha nesta sessão';
  $('empty').querySelector('p').textContent = q || t || status ? 'Ajuste a busca ou os filtros para tentar novamente.' : 'Cadastre uma pessoa ou viatura. A abertura de ficha é opcional.';
}
function showPage(next) {
  if (next !== 'profile') clearMatch();
  page = next;
  $('home').hidden = page !== 'home'; $('dialog').hidden = !['profile', 'entry'].includes(page);
  normalSections.forEach(el => { el.hidden = !['registry', 'movement'].includes(page); });
  document.querySelectorAll('.nav').forEach(el => el.classList.toggle('active', el.dataset.view === page));
  render(); window.scrollTo(0, 0);
}
function route(next) { location.hash = next; showPage(next); }
function resetFilters() { for (const id of ['search', 'categoryFilter', 'statusFilter']) $(id).value = ''; }
function openFinish(id, mode) {
  const m = movimentacoes.find(r => r.id === id);
  if (!m || !isOpen(m)) { notify('A ficha já foi encerrada.'); return; }
  if (mode === 'finalize' && !isMilitary(m.tipo)) return;
  closing = { id, mode }; const f = $('finishForm'), now = nowFields(), finalize = mode === 'finalize';
  f.reset(); f.elements.endDate.value = now.day; f.elements.endTime.value = now.time;
  $('finishTitle').textContent = finalize ? 'Finalizar ficha sem saída / retorno' : m.direction === 'Saída' ? 'Registrar retorno' : 'Registrar saída';
  $('finishName').textContent = label(m.tipo, m.dados);
  $('finishHelp').textContent = finalize ? 'Encerra somente a anotação. Nenhum horário de saída ou retorno será registrado. Informe o motivo.' : 'Informe a data e o horário em que a movimentação realmente ocorreu.';
  $('reasonLabel').hidden = !finalize; f.elements.endReason.disabled = !finalize; f.elements.endReason.required = finalize;
  $('finishError').textContent = ''; $('finishDialog').showModal();
}
function handleRowClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.edit !== undefined) { openEdit(cadastros[Number(b.dataset.edit)]); return; }
  if (b.dataset.finish) openFinish(Number(b.dataset.finish), 'movement');
  if (b.dataset.finalize) openFinish(Number(b.dataset.finalize), 'finalize');
  if (b.dataset.reuse !== undefined) {
    const c = cadastros[Number(b.dataset.reuse)];
    const existing = findOpen(c);
    if (existing) { resetFilters(); $('search').value = label(existing.tipo, existing.dados); $('categoryFilter').value = c.tipo; $('statusFilter').value = 'open'; route('movement'); }
    else openForm(c);
  }
}

// Eventos da interface.
$('startNew').onclick = $('newBtn').onclick = $('emptyNew').onclick = () => openForm();
$('startSearch').onclick = () => { resetFilters(); route('registry'); $('search').focus(); };
$('viewAll').onclick = () => { resetFilters(); route('movement'); };
$('close').onclick = $('cancel').onclick = () => route(stage === 'entry' || stage === 'edit' ? 'registry' : 'home');
$('type').onchange = () => { clearMatch(); setupProfile(); };
$('profileSection').addEventListener('input', lookup);
$('profileSection').addEventListener('change', e => { if (e.target.name === 'rank') lookup(e); });
$('matchList').onclick = e => { const b = e.target.closest('[data-candidate]'); if (b) confirmMatch(Number(b.dataset.candidate)); };
$('dismissMatch').onclick = dismissMatch;
$('profileSection').addEventListener('keydown', e => {
  if (!$('matchPanel').hidden && e.target === matchAnchor && e.key === 'ArrowDown') {
    e.preventDefault(); $('matchList').querySelector('button')?.focus();
  }
  if (e.key === 'Escape' && !$('matchPanel').hidden) { e.preventDefault(); dismissMatch(); }
});
$('matchPanel').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); dismissMatch(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const buttons = [...$('matchList').querySelectorAll('button')];
    const current = buttons.indexOf(document.activeElement);
    if (buttons.length) { e.preventDefault(); buttons[(current + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus(); }
  }
});
window.addEventListener('resize', positionMatch);
window.addEventListener('scroll', positionMatch, true);
window.visualViewport?.addEventListener('resize', positionMatch);
$('cancelFinish').onclick = () => $('finishDialog').close();
for (const id of ['tbody', 'recentBody', 'selectedSummary']) $(id).onclick = handleRowClick;
for (const id of ['search', 'categoryFilter', 'statusFilter']) $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
document.querySelectorAll('.nav').forEach(b => { b.onclick = () => { resetFilters(); route(b.dataset.view); }; });
form.onsubmit = e => {
  e.preventDefault();
  try {
    const d = Object.fromEntries(new FormData(form));
    if (stage === 'edit') {
      saveProfile({ ...d, type: editing.tipo }, editing); clearMatch(); resetFilters(); route('registry'); notify('Cadastro atualizado.');
    } else if (stage === 'profile') {
      if (findExisting(d.type, d)) {
        lookup(form.elements[d.type === 'internal' ? 'warName' : d.type === 'vehicle' ? 'plate' : 'identity']);
        $('error').textContent = 'Esta identificação já está cadastrada. Selecione a pessoa no balão ou corrija a identificação.'; return;
      }
      const c = saveProfile(d);
      if (e.submitter?.value === 'only') { resetFilters(); route('registry'); notify('Cadastro salvo. Nenhuma ficha foi aberta.'); }
      else { openForm(c); notify('Cadastro salvo. Preencha a ficha quando houver uma movimentação.'); }
    } else {
      const m = addMovement(selected, d); resetFilters(); route('movement');
      notify(m.direction === 'Saída' ? 'Saída registrada. A ficha aguarda retorno.' : 'Entrada registrada. Ficha em aberto.');
    }
  } catch (err) { $('error').textContent = err.message; }
};
$('finishForm').onsubmit = e => {
  e.preventDefault();
  try {
    const f = $('finishForm').elements;
    const m = closeMovement(closing.id, closing.mode, f.endDate.value, f.endTime.value, f.endReason.value);
    $('finishDialog').close(); render();
    if (page === 'entry') setupEntry();
    notify(m.encerramento.tipo === 'finalizacao' ? 'Ficha finalizada sem registrar saída ou retorno.' : m.encerramento.tipo === 'saida' ? 'Saída registrada.' : 'Retorno registrado.');
  } catch (err) { $('finishError').textContent = err.message; }
};
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (next === 'entry' && !selected) { route('home'); return; }
  if (next === 'profile' && !['profile', 'edit'].includes(stage)) { openForm(); return; }
  showPage(['home', 'registry', 'movement', 'entry', 'profile'].includes(next) ? next : 'home');
});
function clock() { $('clock').textContent = date(new Date().toISOString()); }
clock(); setInterval(clock, 30000); route('home');

// Consulta opcional para navegadores com WebMCP; não altera dados.
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'search_session_records', title: 'Consultar movimentações',
      description: 'Consulta as fichas desta sessão, incluindo encerramentos administrativos.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input.query !== 'string') throw Error('query deve ser texto');
        return movimentacoes.filter(m => norm(label(m.tipo, m.dados) + ' ' + m.chave).includes(norm(input.query))).map(m => ({ id: m.id, nome: label(m.tipo, m.dados), categoria: types[m.tipo], inicio: m.inicio, fim: m.fim, encerramento: m.encerramento, situacao: statusLabel(m) }));
      }
    })).catch(() => {});
  } catch { /* A interface funciona normalmente sem essa API opcional. */ }
}
