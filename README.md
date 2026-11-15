# GS Stats PRO

**GS Stats PRO** é um dashboard para analisar props da NBA e probabilidades de apostas, com gráficos jogo a jogo, aproveitamento L5/L10/L20 e odds reais da casa **99play** — tudo gratuito, sem assinatura e sem paywall.

- Link do app: **https://gersondahora1993-sketch.github.io/nba-lab/**
- Dados de estatísticas: **API pública da ESPN** (boxscores, calendário, play-by-play)
- Odds: **99play** (widget Altenar)

---

## O que o app faz

### Análise por jogador (estilo Gameread)

Gráfico de barras por jogo com **verde quando o jogador supera a linha e vermelho quando fica abaixo**, com a linha marcada no gráfico, média, mediana e aproveitamento por janela:

- **L5, L10, L20 e temporada** em porcentagem + acertos (ex.: 7/10)
- Linha ajustável manualmente (− / +) ou automática na linha da casa de apostas
- Odd da 99play para o mercado selecionado

Mercados disponíveis (20):

| Mercado | Mercado | Mercado |
|---|---|---|
| Pontos | PRA | Cestas de 3 |
| Rebotes | PTS + REB | Tentativas de 3 |
| Assistências | PTS + AST | Cestas de 2 |
| Pontos 1ºQ | REB + AST | Tentativas de 2 |
| Rebotes 1ºQ* | Duplo-duplo | Roubos |
| Triplo-duplo | Roubos + Tocos | Tocos |
| Turnovers | Faltas | |

\* A ESPN não fornece rebotes por quarto, então o mercado aparece sinalizado como indisponível para análise automática.

### Props do dia

Lista automática das **melhores props do dia** ordenadas pela maior probabilidade, com:

- jogador, mercado e linha real da casa
- aproveitamento (ex.: 8/10 acima da linha)
- mini gráfico de barras dos últimos 10 jogos
- **odd da 99play** para a linha ofertada

O app atualiza sozinho: o calendário é buscado a cada 5 minutos e ao voltar para a aba, e as odds são atualizadas a cada poucos minutos.

### Times, combos e comparador

- Produção ofensiva/defensiva dos times, confrontos e líderes
- Combos com linha de over/under ajustável
- Comparação lado a lado de dois jogadores

---

## Como usar

### No celular

Abra o link, use o menu **Adicionar à tela inicial** e o app abre em tela cheia (PWA), com funcionamento offline da interface.

### No Windows

1. Duplo clique em `instalar_windows.bat` — cria atalhos na Área de Trabalho e na Inicialização.
2. Abra pelo atalho **GS Stats PRO**.
3. Para desativar a abertura automática: `remover_autostart.bat`.

### Rodando localmente

```bash
npm start
```

Abre em `http://localhost:3000`.

Para publicar a versão do GitHub Pages:

```bash
npm run build
```

O build copia `public/` para `docs/`.

---

## Estrutura

```
public/
  index.html            # telas e navegação
  styles.css            # tema preto e vermelho
  app.js                # análise de mercados, gráficos, props do dia
  api-client.js         # ESPN + odds (99play/Altenar) + cache
  sw.js                 # service worker (rede primeiro, cache offline)
  manifest.webmanifest  # PWA
docs/                   # build publicado no GitHub Pages
server.js               # servidor estático local
build.js                # gera docs/ a partir de public/
```

## Observações técnicas

- As odds vêm do widget Altenar da 99play. Como a API bloqueia chamadas diretas de outras origens, o app usa um relay com CORS liberado e faz fallback para a chamada direta.
- As estatísticas de **1º quarto (pontos e assistências)** são derivadas do play-by-play da ESPN (período 1, cestas convertidas e assistências citadas no texto da jogada).
- Nenhum dado é enviado para servidores próprios: tudo roda no navegador.

## Aviso

Ferramenta de análise estatística para uso pessoal. Não é garantia de resultado. Aposte com responsabilidade · +18.
