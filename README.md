# Register Life Widget

Widget desktop Windows que se conecta ao Register Life para listar tarefas, cronometrar tempo gasto e gerenciar pomodoros — tudo numa janelinha sempre visível, com atalhos globais.

## Instalação (usuário final)

1. Vá em **[Releases](https://github.com/mayccoisa/register-life-widget/releases)** e baixe o `.exe` mais recente
2. Dois cliques pra instalar
3. Faça login com sua conta do Register Life
4. A partir daí, o app **se atualiza sozinho** — toda nova versão é baixada em background e instalada no próximo restart

> **Aviso de SmartScreen**: como o instalador não está assinado digitalmente, o Windows pode mostrar "Editor desconhecido". Clique em "Mais informações" → "Executar mesmo assim". Isso só acontece na primeira instalação.

## Funcionalidades

- 🔐 Login com email/senha (token criptografado via Windows DPAPI)
- 📁 Workspaces — escolha obrigatória, lembra a última
- ✅ Tarefas — lista, detalhes, mudança de status
- ⏱️ Timer por tarefa — start/pause/resume/stop sincronizado com a API
- 🍅 Pomodoro — foco/pausa configurável, histórico, transição automática
- 🔍 Filtros (tipo, categoria) e ordenação (data, título, tempo)
- 🌗 Tema claro/escuro
- 🔔 Notificações nativas Windows
- 🎨 Ícone na bandeja com cor dinâmica conforme estado
- ⌨️ Atalho global `Ctrl+Shift+T` (mostra/oculta + pausa/retoma)
- 🔄 Auto-update via GitHub Releases

## Para desenvolvedores

```bash
git clone https://github.com/mayccoisa/register-life-widget.git
cd register-life-widget
npm install
npm start              # rodar em modo dev
npm run build:win      # gerar instalador local em dist/
```

## Como liberar uma nova versão

O processo é totalmente automatizado pelo GitHub Actions:

```bash
# 1. Bump da versão (escolha um):
npm version patch    # 0.5.0 → 0.5.1 (bug fix)
npm version minor    # 0.5.0 → 0.6.0 (nova feature)
npm version major    # 0.5.0 → 1.0.0 (breaking change)

# 2. Push das mudanças + tag
git push --follow-tags
```

Em ~5 minutos:

1. GitHub Action builda o `.exe`
2. Cria automaticamente uma release no GitHub com o instalador anexado
3. Todos os widgets instalados detectam a nova versão na próxima abertura
4. Baixam em background → mostram banner azul → usuário clica "Reiniciar agora"

## Estrutura

```
src/
├── main.js           # processo principal (janela, tray, atalhos, IPC)
├── preload.js        # ponte segura main↔renderer
├── api.js            # cliente HTTP do Register Life
├── auth.js           # login + storage seguro (safeStorage)
├── icon.js           # gera PNG/ICO em runtime (cores dinâmicas)
├── updater.js        # auto-update via electron-updater
└── renderer/
    ├── index.html    # UI
    ├── styles.css    # tema escuro/claro
    └── app.js        # lógica da UI

scripts/
└── build-icons.js    # gera build/icon.ico antes de empacotar

.github/workflows/
└── release.yml       # CI: builda e publica .exe ao push de tag v*
```

## Stack

- [Electron](https://www.electronjs.org/) 33
- [electron-builder](https://www.electron.build/) 25 (NSIS installer)
- [electron-updater](https://www.electron.build/auto-update) 6
- API: Register Life (Supabase Edge Functions)

## Licença

Privado — Weon.
