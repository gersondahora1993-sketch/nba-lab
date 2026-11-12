# NBA LAB — Dashboard de estatísticas

Dashboard para analisar os **últimos 10 jogos da NBA** com gráficos: produção dos times, desempenho dos jogadores e combos (PRA, PR, PA, RA, PTS+3PM, STL+BLK) contra linhas de over/under.

Os dados vêm da **API pública da ESPN** (boxscores, calendário e escalações), sem precisar de chave de API. O app roda 100% no navegador e pode ser instalado no Windows e no Android.

## Link do app

**https://gersondahora1993-sketch.github.io/nba-lab/**

![QR code do app](assets/qr-code.png)

---

## Instalar no Windows

O instalador cria dois atalhos: um na **Área de Trabalho** e outro na pasta **Inicialização** (abre junto com o Windows).

1. Dê **duplo clique em `instalar_windows.bat`**.
2. Abra pelo atalho **NBA Lab** na Área de Trabalho.

O atalho abre o app em uma janela própria do Edge, sem barra de endereço, já em tela cheia de trabalho.

Para **desativar a abertura automática**, dê duplo clique em `remover_autostart.bat`. O atalho da Área de Trabalho continua funcionando.

> Se o Edge não estiver instalado, o app também abre normalmente em qualquer navegador pelo link acima. No Edge/Chrome do PC, use o ícone de instalação na barra de endereço para instalar como aplicativo.

---

## Instalar no Android

1. Abra o link do app no **Chrome** do celular (ou escaneie o QR code acima).
2. Toque no menu **⋮** e escolha **Instalar app** / **Adicionar à tela inicial**.
3. Confirme. O ícone do **NBA Lab** aparece na tela inicial e abre em tela cheia, como um app.

Requisitos: Chrome atualizado e conexão com a internet. O app funciona em HTTPS (GitHub Pages) e guarda os dados já consultados para abrir mais rápido.

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

- `https://site.web.api.espn.com` — jogos, boxscores, calendário, escalações e log dos jogadores.
- `https://sports.core.api.espn.com` — dados do atleta e do time.
- `https://a.espncdn.com` — logos e fotos.

O app guarda os dados normalizados no **localStorage** do navegador:

| Dado | Validade |
|---|---|
| Times e escalações | 12 horas |
| Boxscores de jogos finalizados | 24 horas |
| Log do jogador | 15 minutos |
| Placar/odds do dia | 90 segundos |

As respostas brutas da ESPN ficam só na memória da aba. Para forçar atualização, limpe os dados do site no navegador (ou use `localStorage.clear()` no console).

---

## Rodar localmente (opcional)

O dashboard publicado não precisa de servidor. Para desenvolver:

```bash
cd nba-dashboard
npm start
```

Acesse **http://localhost:3000**.

Para gerar a pasta publicada no GitHub Pages:

```bash
npm run build
```

O comando copia `public/` para `docs/`. Depois faça commit e push; o Pages atualiza sozinho.

---

## Estrutura

```
nba-dashboard/
├── instalar_windows.bat   # cria atalhos no Windows (Área de Trabalho + Inicialização)
├── remover_autostart.bat  # remove o atalho da pasta Inicialização
├── iniciar.bat            # abre a versão local (requer Node.js)
├── package.json
├── build.js               # copia public/ para docs/
├── server.js              # servidor local de desenvolvimento
├── assets/                # ícone .ico e QR code
├── public/                # código-fonte do app
│   ├── index.html
│   ├── styles.css
│   ├── app.js             # lógica do dashboard e gráficos
│   ├── api-client.js      # dados da ESPN direto no navegador
│   ├── sw.js              # service worker (shell offline)
│   ├── manifest.webmanifest
│   ├── icons/
│   └── vendor/chart.umd.min.js
├── docs/                  # build publicado no GitHub Pages
└── cache/                 # cache do servidor local (não versionado)
```

---

## Avisos importantes

- Este painel **não faz previsões** e não recomenda apostas. Ele organiza estatísticas para apoiar a sua própria análise.
- Amostra de 10 jogos é pequena: considere adversário, ritmo, minutagem, lesões e contexto.
- Odds exibidas são apenas informativas e podem mudar.
- Aposte com responsabilidade. **+18**.
