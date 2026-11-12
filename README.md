# Captura e Resumos Pro

Extensão Chrome (Manifest V3) para capturar transcrições e questões de **qualquer página**, organizar o conteúdo por curso, praticar com quiz e gerar resumos com o Gemini.

> Versão atual: **2.15.0**

## Recursos

- **Captura manual em qualquer página**
  - Selecione um texto e use o menu de contexto ou `Alt + S`.
  - Capture uma região da tela com `Alt + R` e extraia o texto visível.
  - O curso padrão é o título da página, editável no painel.
- **OCR com Gemini Vision**
  - Botão **📷 OCR da região** no painel de captura.
  - Cole um print diretamente no painel com `Ctrl + V`.
  - Texto transcrito cai em um campo editável para revisão.
  - Modelo de OCR configurável separadamente do modelo de resumo.
- **Questões**
  - Aceita alternativas com ou sem rótulos: `A)`, `A.`, `(A)`, `1)`, `I)`, `[IV]`.
  - Linhas sem rótulo também viram alternativas.
  - Marque a correta com `*`, `[x]`, `(x)` ou informe a letra.
  - Botão **✂️ Separar alternativas** divide enunciado e opções automaticamente.
- **Organização por curso**
  - Renomeie, una cursos duplicados e normalize nomes como `Course: ...`, `... | Udemy` ou `README.md at main · usuario/repo`.
  - Aulas, questões e resumos são movidos juntos ao renomear ou unir cursos.
- **Estudo**
  - Modo quiz com pontuação e explicação após a resposta.
  - Exportação para Anki (`.csv`) e guia de estudo (`.md`).
- **Resumos com Gemini**
  - Cache por hash, retry/backoff em erros temporários e estimativa de tokens.
  - Resumo do conteúdo completo ou apenas do curso selecionado.
- **Documento consolidado**
  - Gera um `.md` por curso com sumário, transcrições, questões, respostas e resumos.
- **Backup e armazenamento**
  - Exportação/importação de backup em `.json`.
  - Compressão com LZString e migração automática para IndexedDB acima de 2 MB.
- **Recomeçar do zero**
  - Botão que apaga transcrições, cursos, questões, resumos e caches, mantendo preferências, chave de API e modelos.

## Instalação

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione esta pasta.
4. Recarregue as abas abertas (`Ctrl + Shift + R`) para reinjetar os scripts.
5. Abra a página de opções da extensão para configurar a chave do Gemini.

## Como usar

### Atalhos

| Atalho | Ação |
| --- | --- |
| `Alt + C` | Copiar e acumular a transcrição da aula atual |
| `Alt + Q` | Copiar e acumular a questão atual |
| `Alt + S` | Salvar a seleção atual como transcrição ou questão |
| `Alt + R` | Capturar uma região da página e extrair o texto |

Os atalhos podem ser alterados em `chrome://extensions/shortcuts`.

### Captura por seleção

1. Selecione o texto na página.
2. Pressione `Alt + S` ou use o botão direito → **Salvar seleção como transcrição** / **Salvar seleção como questão**.
3. Revise o texto, o curso e o título no painel.
4. Clique em **Salvar**.

### Captura por região e OCR

1. Pressione `Alt + R` e arraste sobre a área desejada.
2. Se a região tiver texto selecionável, ele é extraído do DOM.
3. Se for uma imagem, abra o painel e use **📷 OCR da região**.
4. Também é possível colar um print com `Ctrl + V` no painel.

O OCR exige uma chave de API do Gemini configurada nas opções.

### Questões

No painel de questão, informe o enunciado e as alternativas uma por linha. Exemplos aceitos:

```text
A) Primeira opção
B) Segunda opção *
C) Terceira opção
```

```text
Primeira opção
Segunda opção
Terceira opção [x]
```

A alternativa marcada é tratada como correta. Se preferir, informe a letra no campo **Correta**.

### Quiz e exportações

- As questões filtradas por busca/curso alimentam o quiz.
- A resposta e a explicação só aparecem depois da escolha.
- É possível exportar questões em `.txt`, `.md`, Anki `.csv` e gerar um guia de estudo.

### Resumos com Gemini

1. Abra **Configurações** na página de opções.
2. Informe a chave do [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Escolha o modelo de texto e, se quiser, um modelo separado para OCR.
4. Gere o resumo na aba **✨ Resumos & IA**.

## Página de opções

A página é dividida em abas:

- **📚 Conteúdo** — transcrições, filtros, downloads e gerenciamento de cursos.
- **❓ Questões** — questões capturadas, filtros, exportações e modo quiz.
- **✨ Resumos & IA** — chave, modelos, prompt, diagnóstico de OCR e histórico de resumos.
- **⚙️ Configurações** — preferências, backup/importação e a zona de perigo para recomeçar do zero.

A última aba aberta é lembrada no navegador.

## Privacidade e dados

- Todo o conteúdo é armazenado localmente em `chrome.storage.local` e, para volumes grandes, em IndexedDB.
- A chave de API fica apenas no armazenamento local da extensão.
- As chamadas ao Gemini são feitas diretamente do navegador para a API do Google.
- O projeto não inclui servidor próprio, telemetria ou analytics.
- Nenhuma chave de API real é armazenada no repositório.

## Estrutura do projeto

```text
.
├── manifest.json          # Configuração da extensão MV3
├── background.js          # Service worker: capturas, OCR, cursos, downloads e backup
├── content.js             # Extratores e captura automática opcional em páginas compatíveis
├── manual-capture.js      # Painel de captura manual e parser de questões
├── region-capture.js      # Seletor de região para texto ou OCR
├── options.html           # Interface da página de opções (abas)
├── options.js             # Lógica das opções, filtros, quiz e gerenciamento de cursos
├── gemini-client.js       # Cliente Gemini para texto e imagens
├── storage-utils.js       # Compressão, hidratação e migração para IndexedDB
├── lz-string.min.js       # Biblioteca de compressão
├── icons/                 # Ícones da extensão
├── tests/                 # Testes automatizados
├── package.json           # Scripts e dependências de desenvolvimento
├── package-lock.json      # Lockfile do npm
├── README.md
└── .gitignore
```

## Testes

```bash
npm install
npm test
```

Os testes usam `jsdom` para validar o extrator de questões, o painel manual, o seletor de região, o OCR, a gestão de cursos, as abas das opções e a camada de armazenamento/compressão.

## Publicação no GitHub

Podem ser enviados para o repositório:

- Todo o código da extensão: `manifest.json`, `background.js`, `content.js`, `manual-capture.js`, `region-capture.js`, `options.html`, `options.js`, `gemini-client.js`, `storage-utils.js` e `lz-string.min.js`.
- A pasta `icons/`.
- A pasta `tests/`.
- `package.json`, `package-lock.json`, `README.md` e `.gitignore`.

**Não envie:**

- `node_modules/` (já está no `.gitignore`).
- Arquivos de backup `.json` gerados pela extensão.
- Arquivos baixados com transcrições, questões ou resumos.
- Qualquer chave de API real ou arquivo `.env`.

## Limitações

- Requer Chrome ou Chromium com suporte a Manifest V3.
- O OCR depende da API do Gemini e de uma chave válida.
- Páginas com conteúdo em canvas, vídeo ou imagens sem texto selecionável precisam de OCR.
- A captura automática é opcional e desativada por padrão para não interferir nos cliques da página.
