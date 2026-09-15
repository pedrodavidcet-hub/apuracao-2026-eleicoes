# Painel Eleitoral Brasil — V3

Painel web responsivo para acompanhar as Eleições Gerais de 2026 com dados oficiais do TSE e consultar os resultados históricos de 2022. A V3 foi redesenhada para ficar visualmente próxima do mockup `REFERENCIA_VISUAL.png`, com fonte Inter, fotos dos candidatos, mapa grande, cards de apuração e módulo de probabilidades.

## Principais recursos

- visual dark semelhante ao mockup, com fonte **Inter**;
- mapa do Brasil por estado e detalhamento por município;
- **Presidente, Governador, Senador, Deputado Federal e Deputado Estadual/Distrital**;
- fotos dos candidatos usando o `sqcand` fornecido pelo TSE;
- resultados de **2026 ao vivo** e **2022 histórico**;
- 1º e 2º turnos onde o cargo permite;
- camada do mapa por candidato mais votado ou percentual totalizado;
- votos válidos, brancos, nulos e seções totalizadas;
- indicação de candidatos eleitos quando o arquivo do TSE informa essa condição;
- vagas por partido/federação quando o EA20 disponibiliza `vag` para cargos proporcionais;
- projeção probabilística para Presidente, Governador e Senador;
- projeção limitada ao intervalo configurado de início até **60% da apuração**;
- atualização automática de 60, 90 ou 120 segundos;
- tentativa de consulta direta à CDN do TSE e fallback por Cloudflare Pages Function;
- cache prolongado para arquivos históricos de 2022.

## Como a V3 trata cada cargo

### Presidente e Governador
No 1º turno o painel estima:
- chance de vitória no 1º turno;
- chance de haver 2º turno;
- chance de cada candidatura chegar ao 2º turno;
- faixa projetada do percentual final.

No 2º turno, estima a chance de vitória de cada candidatura.

### Senador
O painel calcula a probabilidade de a candidatura terminar dentro do número de vagas em disputa:
- 2022: 1 vaga por UF;
- 2026: 2 vagas por UF.

### Deputado Federal e Estadual/Distrital
A eleição é proporcional. Por isso a V3 não exibe uma falsa “chance de vitória” individual simplificada. Ela apresenta:
- ranking nominal;
- votos e percentuais;
- situação de eleito, quando disponível;
- vagas de partido/federação, quando o arquivo do TSE informa `vag`.

No Distrito Federal, a opção “Deputado Estadual / Distrital” usa automaticamente o código de cargo de Deputado Distrital.

## Dados de 2022

A V3 usa os arquivos de resultados simplificados ainda disponíveis na CDN oficial do TSE.

Códigos conhecidos das Eleições Gerais de 2022:
- 544 — Eleição Federal, 1º turno;
- 545 — Eleição Federal, 2º turno;
- 546 — Eleição Estadual, 1º turno;
- 547 — Eleição Estadual, 2º turno.

Os resultados de 2022 são tratados como históricos e não ficam em atualização automática.

## Dados de 2026

A aplicação consulta o arquivo de configuração de eleições e procura automaticamente a eleição de 2026 correspondente ao turno e ao tipo de eleição. Assim, os códigos não precisam ser gravados manualmente quando forem publicados/alterados pelo TSE.

A V3 usa, quando disponíveis:
- EA11 — configuração da eleição;
- EA12 — municípios e códigos TSE/IBGE;
- EA15 — acompanhamento por UF/município;
- EA20 — resultado unificado.

## Fotos dos candidatos

Quando o resultado contém `sqcand`, a aplicação monta a URL oficial no padrão:

```text
<host>/<ambiente>/<ciclo>/<eleicao>/fotos/<br|uf>/<sqcand>.jpeg
```

Se uma foto não estiver disponível, o layout usa automaticamente um avatar com as iniciais da candidatura.

## Projeção até 60%

O modelo é uma simulação de Monte Carlo independente. Ele utiliza:
- votos já apurados;
- percentual totalizado;
- eleitorado ainda não totalizado quando disponível;
- desempenho observado nas unidades geográficas carregadas;
- maior incerteza nas regiões menos apuradas.

A projeção:
- começa em 5%, 10% ou 20%, conforme o filtro;
- **é encerrada quando a apuração ultrapassa 60%**;
- nunca substitui os dados oficiais do TSE;
- não é uma declaração, certificação ou previsão oficial da Justiça Eleitoral.

## Publicação gratuita — Cloudflare Pages

Use **Cloudflare Pages**, não o fluxo de Workers Builds.

Configuração correta:

- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: deixe em branco

A pasta `functions/api/tse.js` é reconhecida automaticamente como Pages Function.

### GitHub + Cloudflare Pages

1. Descompacte o projeto.
2. Envie **o conteúdo da pasta** para a raiz de um repositório GitHub.
3. Na Cloudflare, abra **Workers & Pages**.
4. Escolha criar um projeto **Pages** e conectar o repositório Git.
5. Preencha os parâmetros acima.
6. Faça o deploy.
7. O endereço ficará semelhante a `https://nome-do-projeto.pages.dev`.

## Teste local

Com Node.js instalado:

```bash
npx wrangler pages dev .
```

## Estrutura

```text
index.html
assets/
  app.js
  projection.js
  styles.css
functions/
  api/
    tse.js
README.md
GUIA_PUBLICACAO.md
REFERENCIA_VISUAL.png
```

## Aviso

Este projeto é um visualizador independente. O TSE é a fonte dos dados eleitorais; o painel, o layout e os cálculos probabilísticos não são produtos oficiais da Justiça Eleitoral.
