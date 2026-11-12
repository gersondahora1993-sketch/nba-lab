# NBA LAB — Dashboard de estatísticas

Dashboard local para analisar os **últimos jogos da NBA** com gráficos: produção dos times, desempenho dos jogadores e combos (PRA, PR, PA, RA, PTS+3PM, STL+BLK) contra linhas de over/under.

Os dados vêm da **API pública da ESPN** (boxscores, calendário e escalações), sem precisar de chave de API.

---

## Como abrir

1. Tenha o **Node.js 18 ou superior** instalado.
2. Dê **duplo clique em `iniciar.bat`**.

Ou pelo terminal:

```bash
cd nba-dashboard
npm start
```

Depois acesse **http://localhost:3000**.

> Na primeira consulta de cada time/jogador, o app baixa os boxscores e guarda em cache. As próximas cargas são quase instantâneas.

---

## O que tem no dashboard

### Visão geral
- Jogos do dia com **spread, total e moneyline** (quando disponíveis).
- Atalhos para as análises.

### Times
- Seletor dos 30 times e **comparação com adversário**.
- KPIs: pontos, pontos sofridos, margem, FG%, 3P%, rebotes, assistências, roubos+tocos.
- Gráficos:
  - pontos marcados × sofridos × margem;
  - composição dos pontos (cestas de 2, de 3 e lances livres);
  - rebotes, assistências, roubos, tocos, turnovers, cestas de 3 e pontos no garrafão;
  - radar do confronto (time × adversário).
- Tabela jogo a jogo com placar, aproveitamento e estatísticas.
- Destaques individuais por PRA — clique no jogador para abrir a análise dele.

### Jogadores
- Busca por qualquer jogador da liga.
- KPIs: PTS, REB, AST, PRA, cestas de 3 e True Shooting.
- Gráficos de pontos/rebotes/assistências, PRA, composição dos pontos e eficiência (TS% e eFG%).
- Tabela completa jogo a jogo.

### Combos (over/under)
- Escolha o jogador, o combo e digite a linha.
- Calcula **média, mediana, desvio padrão, tendência e aproveitamento** contra a linha nos últimos 10 e nos últimos 5 jogos.
- Gráfico com a linha, média móvel de 5 jogos e barras verdes/vermelhas.
- Distribuição dos valores e tabela com over/under e margem de cada jogo.

Combos disponíveis: **PRA**, PTS+REB, PTS+AST, REB+AST, pontos, rebotes, assistências, PTS+3PM, STL+BLK e PRA+3PM.

### Comparador
- Dois jogadores lado a lado: radar de perfil, PRA jogo a jogo e tabela de médias com o melhor valor destacado.

---

## Fonte dos dados e cache

- `https://site.api.espn.com` — jogos, boxscores, calendário, escalações e odds.
- `https://site.web.api.espn.com` — log de partidas dos jogadores.
- `https://sports.core.api.espn.com` — dados do atleta e do time.

O servidor guarda cache em memória e na pasta `cache/`:

| Dado | Validade |
|---|---|
| Times e escalações | 12 horas |
| Boxscores de jogos finalizados | 24 horas |
| Log do jogador | 15 minutos |
| Placar/odds do dia | 90 segundos |

Para forçar uma atualização completa, feche o servidor e apague a pasta `cache/`.

---

## Estrutura

```
nba-dashboard/
├── iniciar.bat
├── package.json
├── server.js          # servidor HTTP + normalização dos dados da ESPN
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js         # lógica do dashboard e gráficos
│   └── vendor/chart.umd.min.js
└── cache/             # criado automaticamente
```

Não há dependências externas: só o Node.js nativo (fetch, http, fs).

---

## Avisos importantes

- Este painel **não faz previsões** e não recomenda apostas. Ele organiza estatísticas para apoiar a sua própria análise.
- Amostra de 10 jogos é pequena: considere adversário, ritmo, minutagem, lesões e contexto.
- Odds exibidas são apenas informativas e podem mudar.
- Aposte com responsabilidade. **+18**.
