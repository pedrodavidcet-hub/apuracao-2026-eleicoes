# Guia rápido para colocar a V3 no ar

## 1. Descompacte o ZIP

Dentro da pasta devem aparecer `index.html`, `assets`, `functions`, `README.md` e `REFERENCIA_VISUAL.png`.

**Importante:** no GitHub, o arquivo `index.html` precisa ficar na raiz do repositório, e não dentro de uma segunda pasta aninhada.

## 2. Envie para o GitHub

Crie um repositório, por exemplo `apuracao-eleicoes-2026`, e envie todo o conteúdo da pasta V3 para a branch `main`.

## 3. Abra a Cloudflare

Entre em **Workers & Pages** e escolha criar uma aplicação do tipo **Pages** conectada ao GitHub.

Se a tela mostrar um campo `Deploy command` com `npx wrangler deploy`, você entrou no fluxo de Workers. Volte e escolha **Pages**.

## 4. Configuração de build

Use exatamente:

```text
Production branch: main
Framework preset: None
Build command: exit 0
Build output directory: .
Root directory: [deixe em branco]
```

Nunca coloque `/` em `Build command`: isso faz o Linux tentar executar a pasta raiz e gera o erro `Permission denied`.

## 5. Faça o deploy

Após a publicação, a Cloudflare fornecerá um endereço semelhante a:

```text
https://apuracao-eleicoes-2026.pages.dev
```

## 6. Teste primeiro em 2022

Como 2022 é histórico e os códigos são conhecidos, ele é ótimo para validar o painel:

1. abra o site;
2. selecione `Ano: 2022 — histórico`;
3. mantenha `Presidente` e `1º turno`;
4. confira a lista de candidatos, fotos e mapa por UF;
5. selecione um estado;
6. teste Governador, Senador, Deputado Federal e Deputado Estadual/Distrital.

## 7. Teste 2026

Volte para `2026 — ao vivo`.

- `Oficial` procura a configuração oficial de 2026;
- `Simulado` usa o host de simulação;
- se o TSE ainda não tiver publicado a eleição nesse ambiente, o painel mostrará que a fonte está indisponível sem quebrar a interface.

## 8. Projeção

A projeção pode começar com 5%, 10% ou 20% da apuração. O padrão é 10%.

Ela é exibida somente até 60%. Ao passar de 60%, o painel mostra que a projeção foi encerrada e passa a priorizar o resultado observado.

## 9. Até 200 usuários

A configuração padrão é 90 segundos. Para um grupo de até aproximadamente 200 pessoas, mantenha 90 ou 120 segundos durante os testes. O navegador tenta acessar o TSE diretamente; a Function da Cloudflare é usada como contingência.

Os municípios são carregados de forma gradual e com concorrência limitada. Para cargos proporcionais, o mapa municipal não varre automaticamente todos os resultados; ele consulta os municípios conforme a navegação do usuário.

## 10. Atualizações futuras

Como o Pages está conectado ao GitHub, qualquer atualização enviada à branch `main` gera um novo deploy automaticamente.
