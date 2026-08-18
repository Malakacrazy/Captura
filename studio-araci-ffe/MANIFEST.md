# Documentação do Manifest V3 (`manifest.json`) — Studio Araci FF&E

O arquivo [`manifest.json`](file:///c:/Users/tete_/OneDrive/Documentos/GitHub/Captura/studio-araci-ffe/manifest.json) define a configuração da extensão Chrome para o Studio Araci.

> **Nota sobre comentários em JSON:** A especificação padrão de extensões Chrome utiliza JSON estrito (onde comentários no formato `//` ou `/* */` causam erro de sintaxe ao carregar no navegador). Esta documentação detalha linha a linha todos os campos e permissões configurados no `manifest.json`.

---

## Estrutura e Explicação dos Campos

### 1. Metadados Básicos
- **`manifest_version`: `3`**
  Utiliza a especificação Manifest V3 da Chrome Extension API (obrigatória para extensões modernas no Google Chrome).
- **`name`: `"Studio Araci · Orçamento FF&E"`**
  Nome exibido no Chrome Web Store, na página `chrome://extensions` e na barra de ferramentas.
- **`version`: `"6.0"`**
  Versão atual do código da extensão.
- **`description`: `"Capture produtos de lojas online e gere orçamentos com a identidade visual do Studio Araci."`**
  Descrição resumida da funcionalidade principal.

---

### 2. Permissões (`permissions`)
As permissões solicitadas pela extensão determinam os recursos da Chrome API liberados:

- **`storage`**: Permite salvar e carregar a lista de produtos, preferências de usuário e projetos salvos no `chrome.storage.local`.
- **`unlimitedStorage`**: Eleva a cota de armazenamento local (remover o limite padrão de 5MB do `chrome.storage.local`) para suportar centenas de projetos e imagens base64/links.
- **`activeTab`**: Concede acesso temporário à aba ativa quando o usuário clica no ícone da extensão ou interage com o botão flutuante.
- **`scripting`**: Permite injeção programática de scripts e estilos nas abas (utilizado pelo `background.js` e `extractor.js`).
- **`tabs`**: Permite abrir novas abas de impressão (`print.html`), opções (`options.html`) ou biblioteca (`library.html`) via `chrome.tabs.create`.
- **`clipboardWrite`**: Permite copiar códigos de projetos e resumos JSON para a área de transferência do usuário.

---

### 3. Permissões de Host (`host_permissions`)
- **`"<all_urls>"`**:
  Permite que o content script (`content.js`) e os extratores de produtos funcionem em qualquer site de e-commerce e loja de móveis/acabamentos navegada pelo usuário.

---

### 4. Página de Opções (`options_page`)
- **`options_page`: `"options.html"`**
  Página de configurações da extensão (acessível pelo menu de opções do ícone ou dentro da biblioteca para configurar integração com API de plataforma externa).

---

### 5. Ação e Popup (`action`)
Define o ícone principal e a janela pop-up exibida ao clicar na extensão:
- **`default_popup`: `"popup.html"`**: Interface principal para gerenciar orçamento atual, itens capturados e categorias.
- **`default_title`: `"Studio Araci · Orçamento FF&E"`**: Tooltip exibido ao passar o mouse sobre o ícone da extensão.
- **`default_icon`**: Conjunto de ícones em 16x16, 48x48 e 128x128 pixels.

---

### 6. Content Scripts (`content_scripts`)
Define os scripts injetados automaticamente em todas as páginas visitadas:
- **`matches`: `["<all_urls>"]`**: Injeta em qualquer URL acessada.
- **`js`: `["content.js"]`**: Injeta o botão flutuante **"⊕ Orçamento"**, detecta dados de produtos (JSON-LD, OpenGraph, microdados) e exibe toasts na tela.
- **`css`: `["content.css"]`**: Estilização do botão flutuante e avisos na página.

---

### 7. Atalhos de Teclado (`commands`)
- **`toggle-fab`**:
  Atalho configurado para `Ctrl+Period` (`Ctrl+.`) no Windows/Linux para alternar visibilidade dos botões flutuantes na página.

---

### 8. Service Worker / Background (`background`)
- **`background.service_worker`: `"background.js"`**:
  Script em segundo plano (Manifest V3 Service Worker) que gerencia eventos de ciclo de vida da extensão, comunicação entre mensagens e abertura de abas.

---

### 9. Recursos Acessíveis pela Web (`web_accessible_resources`)
- **`resources`: `["popup.html"]`**:
  Permite carregar recursos específicos da extensão a partir de contextos web autorizados.
