# Piphin Jogos

Todos os jogos instalados no PC num só lugar, com tempo de jogo, estatísticas e um sorteio para quando você não sabe o que jogar. Módulo do [Piphin Hub](https://github.com/Ruiso-Outside/Piphin-Hub) (cerca de 110 KB).

- **Encontra sozinho** os jogos de:
  - Steam (todas as bibliotecas)
  - Epic Games
  - Riot (VALORANT, League of Legends...)
  - GOG
  - Ubisoft
  - EA
  - Battle.net
  - Rockstar
  - Xbox / Game Pass

  Qualquer outro jogo pode ser adicionado pelo programa (.exe).
- **Biblioteca** com as capas oficiais, mais:
  - "Continuar jogando"
  - filtros por loja e favoritos
  - busca e ordenação

  Jogos sem arte ganham uma capa desenhada com o ícone deles.
- **Página do jogo**: tempo total, última vez, sessões, maior sessão, espaço no disco e um gráfico dos últimos 30 dias. Também traz a descrição, os gêneros, a nota do Metacritic, as capturas de tela e os requisitos (da loja Steam).
- **Tempo de jogo de qualquer loja**: enquanto o Hub está aberto, o Piphin Jogos vê quais jogos estão rodando e conta as partidas. Também pode:
  - continuar contando com a janela fechada (opcional)
  - avisar o tempo da partida ao terminar

  Para jogos da Steam, usa também o tempo total que a Steam guarda.
- **Estatísticas**:
  - horas totais
  - esta semana x semana passada
  - dias seguidos jogando
  - calendário dos últimos 6 meses
  - mais jogados
  - a que horas e em que dias você joga
  - tempo por loja
  - recordes
  - **perfil de jogador** com 9 conquistas (Coruja da madrugada, Maratonista, Em chamas...)
- **O que jogar?**: uma roleta que sorteia entre os seus jogos, com mais chance para os que você não abre há tempo
- **Espaço**: quanto cada jogo ocupa e quais estão parados há meses (desinstalar pela própria Steam)
- **Desempenho nas partidas** (com o [InfoHardware](https://github.com/Ruiso-Outside/InfoHardware)): FPS médio, 1% low, temperaturas e o que está segurando o FPS em cada partida, na página do jogo. O InfoHardware usa o Piphin Jogos para ligar o overlay de FPS sozinho quando um jogo abre.
- **IA**: com o Piphin LLM, a IA vê seus jogos, estatísticas e o que está sendo jogado agora, e abre um jogo (com a sua confirmação)

Tudo é só leitura: o Piphin Jogos não muda nada nas lojas nem nos jogos.

## Mídia do Hub
Com o Piphin Hub 1.7.0 ou mais novo, a página de cada jogo mostra os **prints e gravações** feitos nele com o Piphin Captura (pela Mídia do Hub), com o botão **Editar** que abre no Piphin Foto ou no Piphin Vídeo.

## Estrutura

`module/`:

| Arquivo | O que faz |
|---|---|
| `launchers.js` | encontra os jogos de cada loja |
| `tracker.js` | conta o tempo de jogo |
| `stats.js` | calcula as estatísticas |
| `store.js` | traz as informações da loja Steam |
| `backend.js` | junta tudo |
| `sys.js` | lê o registro, roda o PowerShell e mede as pastas |

`web/` é a tela.

```
npm run icons    # ícones (Lucide) em web/icons.css
npm run icon     # icons/jogos.png
npm run module   # dist/piphin-module-jogos-<versão>.zip
```
