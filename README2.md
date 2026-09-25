# CPOR — Controle da portaria

Front-end em HTML, CSS e JavaScript puro. Três arquivos de código e este README.

## Abrir no VS Code

1. Extraia o ZIP.
2. Abra a pasta cpor-portaria no VS Code.
3. Abra index.html no navegador. Também funciona com Live Server.
4. Salve as alterações e atualize a página.

Sem instalação de dependências, Node.js ou banco de dados.

## Arquivos

- index.html: telas, formulários e janelas de confirmação.
- style.css: aparência e responsividade.
- app.js: dados em memória, validações, regras e eventos da interface.

## Cadastro e ficha são independentes

cadastros guarda as pessoas e viaturas. movimentacoes guarda as fichas de situações
anotadas pela portaria. Um cadastro pode não ter nenhuma ficha, ou ter várias no histórico.
Use Salvar somente cadastro para cadastrar sem registrar entrada ou saída.
Use Registrar fluxo para seguir à página de movimentação, com data, horário,
objetivo e destino. A movimentação só é criada ao confirmar essa página.

## Regras operacionais

- O expediente normal de militares não é registrado.
- Civis: objetivo digitado livremente e encerramento com saída real.
- Militares do CPOR e de outra OM: registrar saída/retorno real OU finalizar ficha.
- Finalizar ficha exige um motivo e encerra apenas a anotação. Não cria saída ou retorno.
  Exemplo: pernoite seguido de permanência para o expediente.
- Viaturas: saída e retorno, sem finalização administrativa.
- Cada cadastro tem no máximo uma ficha em aberto; fichas encerradas permanecem no histórico.
- O início mostra as cinco fichas mais recentes, com ações e acesso ao histórico completo.
- Fichas em aberto não representam o total de pessoas presentes no quartel.

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

## Edição de cadastros

Em Cadastros, use Editar para corrigir nome, documento, posto, seção, telefone e demais
campos da categoria. A categoria é mantida. Cancelar edição não altera o objeto.
Salvar alterações atualiza o mesmo cadastro sem abrir uma ficha nova.
Não permite identidade, placa ou combinação posto/nome de guerra já ocupada por outro
cadastro da categoria. Nomes iguais e telefones compartilhados não são chaves únicas.

Cada cadastro tem um id interno estável para vincular as fichas, mesmo quando sua
identificação é corrigida. As fichas antigas preservam cópia dos dados de sua ocasião;
fichas novas usam os dados atualizados. As fichas abertas continuam vinculadas e não
podem ser duplicadas depois de uma edição.
Durante a edição, sugestões apontam outros cadastros para conferência e não substituem
nem salvam o rascunho de edição automaticamente.

## Estrutura dos dados

Chaves internas, sem coluna de chave técnica na interface:
- Civil: identidade.
- Militar de outra OM: identidade.
- Militar do CPOR: posto/graduação + nome de guerra.
- Viatura: placa (escolha inicial).

A unicidade é dentro da categoria. As chaves são normalizadas para comparação.
Cada ficha contém id sequencial, cadastroId estável, tipo/chave da ocasião e cópia dos dados.

inicio: data e hora da movimentação inicial, com direção Entrada ou Saída.
fim: data e hora da saída/retorno real, ou null se não registrado.
encerramento: null enquanto aberta, ou objeto { tipo, em, motivo }.
Tipos de encerramento: saida, retorno, finalizacao.
Na finalizacao, fim permanece null e em indica quando a anotação foi encerrada.
Datas editáveis seguem Brasília (UTC-03:00). Não permitem horário futuro ou encerramento
anterior ao início da ficha.

## Persistência e futura integração

Tudo fica exclusivamente em arrays na memória da aba. Fechar ou atualizar apaga os dados.
Não há localStorage, sessionStorage, cookies de aplicação ou banco.
As funções saveProfile, addMovement e closeMovement concentram as regras de escrita.
Na integração com API/BD, mantenha as regras também no servidor e a unicidade no banco.
O protótipo não possui autenticação local e não compartilha dados entre abas ou computadores.
