# Verificação da entrega

- Build de produção: TypeScript e Vite aprovados.
- API: 39 testes de integração aprovados, com banco temporário isolado.
- Front-end: 8 testes aprovados, incluindo centavos residuais, unidades, multiplicações grandes e origem das metas.
- Navegador: painel carregado com dados da API; layout observado na largura de celular e desktop.
- Navegador: o editor de distribuição exibiu 60% atribuídos, 40% disponíveis e botão de salvar desabilitado.
- Navegador: formulário dos 12 meses exibiu os valores e a revisão de abril.
- Navegador: sazonalidade incompleta exibiu 90,60% e manteve a aplicação bloqueada.
- Navegador: ao sair da sazonalidade com ajustes não salvos, o sistema solicitou confirmação para descartar.
- Nenhum valor de teste foi salvo no banco da aplicação durante a verificação visual.
- Matrizes: filtros de agência e produto, agrupamento dos produtos e opção Mostrar % verificados no navegador.
- Carteiras: o clique na célula abre a distribuição do mês e posiciona a edição na carteira selecionada.
- Edição de um mês: os testes confirmam que os demais meses permanecem intactos.
- Migração: teste com estrutura anterior confirmou preservação dos valores, criação de backup e execução idempotente.

Os testes automatizados verificam gravação, concorrência, ausência de rascunho e publicação, migração do banco antigo e propagação dos cadastros. A inspeção visual não substitui uma validação do gestor para os dados de abril.
