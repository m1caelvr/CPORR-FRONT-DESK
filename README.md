# CPOR — Controle da portaria

HTML, CSS e JavaScript puro. Sem dependências ou banco de dados.

## Abrir no VS Code

1. Extraia o ZIP e abra a pasta cpor-portaria no VS Code.
2. Abra index.html no navegador ou use Live Server.
3. Salve alterações e atualize a página.

Arquivos: index.html (telas), style.css (aparência), app.js (lógica) e este README.

## Organização dos dados

- cadastros: objetos de pessoas/viaturas, independentes dos fluxos.
- movimentacoes: acessos que vinculam início e eventual encerramento individual.
- fluxos: eventos de entrada, saída, retorno ou finalização de anotação.
- fichas: agrupamentos diários, com uma data e os IDs de todos os fluxos daquele dia.
- auditoria: edições e exclusões com responsável, horário e retratos antes/depois.

Ficha agora significa exclusivamente o conjunto de fluxos de um dia.
Uma entrada e sua saída são dois eventos ligados ao mesmo acesso. Cada evento aparece
na ficha correspondente à data e hora informadas. Os dados ficam apenas nos arrays.

## Consulta

Cadastros mostra os objetos e permite editar ou registrar fluxo.
O menu começa recolhido com Início ›. Clique para escolher outra tela.
Histórico permite escolher Cadastros, Todos os fluxos, Por dia ou Alterações.
Por dia tem seletor de data, anterior/próximo e Hoje, além do estado da ficha.
O resumo conta todos os eventos do dia; a tabela respeita busca e filtros.
A coluna Acesso atual mostra a situação atual do acesso ao qual cada evento pertence.
A tela inicial apresenta a ficha do dia e os cinco últimos lançamentos, ordenados por registradoEm.
O histórico mostra a data de lançamento, a data da ocorrência e a ficha correspondente.
As fichas diárias são ordenadas pela data/hora da ocorrência (em).

## Virada às 00h de Brasília

Uma ficha abre às 00h de sua data e fecha às 00h do dia seguinte.
Na virada, a anterior fica fechada e uma nova ficha é aberta, mesmo sem fluxos.
Há temporizador para a meia-noite, verificação periódica e atualização ao retomar a aba.
Se a aba for suspensa por vários dias mantendo a memória, os dias intermediários são
reconciliados na retomada, sem criar fichas duplicadas.

A virada não cria saída/retorno e não encerra automaticamente um acesso individual.
Exemplo: entrada em 24/09 às 23h e saída em 25/09 às 07h aparecem nas respectivas fichas,
mas preservam o mesmo movimentoId. Pendências anteriores podem ser consultadas e encerradas.

São aceitos lançamentos retroativos pela data e hora informadas. Aparecem como Retroativo
na ficha correspondente, sem reabrir seu período. registradoEm guarda quando foram digitados.
Exemplo: uma entrada ocorrida ontem e lançada hoje fica na ficha de ontem, mas aparece
no histórico como registrada hoje. Uma edição não modifica registradoEm.

## Regras operacionais

- Salvar cadastro cria/guarda somente o objeto; Registrar fluxo cria o evento ao confirmar.
- Entradas e saídas do expediente normal de militares não são anotadas.
- Civis exigem saída real para encerrar seu acesso.
- Militares podem registrar saída/retorno ou Finalizar anotação, com motivo opcional.
  Essa finalização não inventa horário de saída; o campo fim do acesso permanece null.
- Viaturas exigem retorno.
- Não é permitido mais de um acesso pendente por cadastro.
- Objetivo / motivo é um texto opcional no lugar de Observações. Destino segue obrigatório.
- Datas futuras e encerramentos anteriores ao início são rejeitados.
- Cadastros editados mantêm seu id e o vínculo com acessos pendentes.
- Eventos e acessos anteriores preservam os dados da ocasião.

## Postos e graduações

const ranks = ['Aluno', 'Cadete', 'SD EP', 'SD EV', 'CB', '3º SGT', '2º SGT', '1º SGT', 'ST', 'ASP', '2º TEN', '1º TEN', 'CAP', 'MAJ', 'TC', 'CEL', 'GEN BDA', 'GEN DIV', 'GEN EX'];

## Sugestões junto ao campo

Um balão aparece sobre o campo digitado sem deslocar o formulário ou bloquear a página.
Se faltar espaço acima, ele aparece logo abaixo. A lista pode ser rolada.
- Nome completo e nome de guerra: busca por trecho a partir de dois caracteres,
  ignorando acentos e caixa. “An” sugere Antônio e Anildo, quando cadastrados.
- Identidade e placa: somente correspondência completa, ignorando formatação.
- Telefone: somente todos os dígitos iguais, incluindo o DDD. Pontuação é ignorada.
- A busca ocorre dentro da categoria selecionada. Nenhum cadastro é escolhido automaticamente.
- Telefones compartilhados e nomes semelhantes podem retornar várias pessoas para conferência.
- Selecione um resultado para reutilizar o cadastro no fluxo. Continuar digitando fecha o balão.
- Teclado: seta para baixo no campo entra na lista; setas percorrem as opções,
  Enter escolhe a opção em foco e Escape fecha as sugestões.

## Edição, exclusão e responsável

Em Cadastros, use Editar ou Excluir. Antes de continuar, informe obrigatoriamente o
posto/graduação e o nome de guerra do responsável. Não é necessário cadastro prévio;
o sistema não consulta a lista de militares do CPOR para aceitar essa identificação.
SD EP e SD EV são opções diferentes no cadastro e na identificação do responsável.

Nos fluxos, use Editar fluxo. Podem ser editados os fluxos cuja ocorrência ou lançamento
seja hoje (Brasília), inclusive lançamentos retroativos feitos hoje. A condição é
conferida novamente ao salvar, caso a tela fique aberta durante a virada do dia.
Na entrada/saída inicial, é possível corrigir data, horário, destino, objetivo/motivo,
contato ou motorista e passageiros/carga, conforme a categoria. Na saída/retorno final,
permite corrigir data e horário; na finalização, também o motivo opcional.
Categoria, pessoa/viatura e tipo de evento são mantidos. Para cada edição de fluxo,
a auditoria guarda os retratos do evento e do acesso vinculado antes e depois.
O início não pode ficar depois do encerramento, nem o encerramento antes do início.
Se a data mudar, o fluxo é transferido para a ficha correta sem duplicação, preservando
o horário original do lançamento. Fichas de dias passados continuam fechadas.

A identificação é exigida para cada operação. Cancelar não altera dados nem gera
um registro de sucesso. Uma edição só é gravada com responsável válido no momento
de salvar. Trocar de tela encerra a identificação daquela edição.

Alterações mostra data/hora, posto e nome de guerra do responsável, cadastro ou fluxo afetado
e diferenças dos campos. O array auditoria preserva os retratos antes e depois e o
responsável como estava na ocasião, mesmo se o próprio responsável for editado/excluído.
Os horários são capturados no salvamento, não informados manualmente pelo operador.

Excluir faz uma exclusão lógica: sai da lista, das sugestões e não pode iniciar novos
fluxos. Os acessos pendentes continuam podendo receber saída/retorno ou finalização
pelo histórico; os fluxos e registros de alterações nunca são removidos pela exclusão.
A mesma identificação pode ser recadastrada com outro id, sem misturar o histórico.

Na edição, a categoria é mantida. Os campos cadastrais podem ser corrigidos, incluindo
a chave natural, sem perder o id e o vínculo com acessos existentes. As chaves de
outros cadastros ativos continuam protegidas contra duplicação.

Este protótipo registra a identificação declarada pelo responsável; não implementa senha ou
prova de identidade. A versão com API/BD deverá validar a identidade no servidor e
persistir o histórico de auditoria. Como os outros dados, os logs estão em arrays e
são apagados ao recarregar/fechar a página.

## Identificação e vínculos

Chaves de cadastro únicas dentro da categoria:
Civil e militar de outra OM: identidade.
Militar do CPOR: posto/graduação + nome de guerra.
Viatura: placa.

Cada cadastro possui id estável auxiliar para vínculos e edição da chave natural.
Um fluxo contém id, movimentoId, cadastroId, dia, em, acao, registradoEm e dados da ocasião.
Uma ficha contém data, abertura, fechaEm, fechamento, status e fluxoIds.
O encerramento do acesso contém tipo (saida, retorno ou finalizacao), em e motivo.
fim indica apenas saída/retorno real. Encerramento administrativo não preenche fim.

## Limites e integração futura

Atualizar ou fechar a página apaga todos os arrays. Cada aba tem sua própria sessão.
A virada diária é executada no navegador e reconciliada ao retomar uma aba suspensa.
Não existe serviço em segundo plano quando o navegador está fechado. Para operação
permanente, a API/BD deverá persistir cadastros, acessos, fluxos e fichas e assumir a
regra de virada diária. Não há login local nem sincronização entre computadores.
As datas são apresentadas em America/Sao_Paulo, com limites de dia em UTC−03:00.
