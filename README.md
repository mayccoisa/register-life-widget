# Register Life Widget

Widget desktop para Windows que se conecta ao Register Life para listar tarefas e cronometrar tempo gasto.

## Status atual: Fase 1 — Esqueleto

- [x] Janela sempre no topo, sem moldura, ~340×480px
- [x] Ícone na bandeja (system tray) com menu
- [x] Atalho global `Ctrl+Shift+T` (mostra/oculta janela)
- [x] Botões fechar/minimizar
- [x] Tema escuro
- [ ] **Fase 2**: Login + storage seguro do token (depende da API)
- [ ] **Fase 3**: Lista de tarefas + mudar status
- [ ] **Fase 4**: Timer (start/stop/pause) sincronizado
- [ ] **Fase 5**: Auto-start no boot do Windows
- [ ] **Fase 6**: Empacotar como `.exe` instalável

## Como rodar localmente

```bash
npm install
npm start
```

## Como gerar o `.exe` (Fase 6)

```bash
npm run build:win
```

O instalador sairá em `dist/`.

## Estrutura

```
src/
├── main.js          # processo principal (janela, tray, atalhos)
├── preload.js       # ponte segura main↔renderer
└── renderer/
    ├── index.html   # UI
    ├── styles.css
    └── app.js       # lógica da UI
```

## API necessária no Register Life

Ver documento de especificação enviado ao time backend. Endpoints mínimos:

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /tasks`, `PATCH /tasks/{id}/status`
- `POST /tasks/{id}/timer/start|stop|pause|resume`
- `GET /tasks/{id}/timer/active`
