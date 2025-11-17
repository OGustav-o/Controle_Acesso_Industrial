# 🎨 Guia do Frontend - Controle de Acesso Industrial

## 📋 Páginas Implementadas

### 1. **Login** (`login.html`)
- Interface profissional de autenticação
- Validação de credenciais
- Exibição de credenciais padrão
- Redirecionamento automático para dashboard

**Credenciais Padrão:**
- Usuário: `admin`
- Senha: `admin123`

### 2. **Dashboard** (`dashboard.html`)
Interface principal com sidebar de navegação e 7 seções:

#### 📊 Dashboard
- Estatísticas em tempo real
- Total de usuários cadastrados
- Total de células ativas
- Total de dispositivos
- Pessoas dentro das células
- Últimos eventos de acesso

#### 👥 Usuários
- Listagem de todos os usuários
- Criar novo usuário com foto
- Editar usuários
- Deletar usuários
- Campos: usuário, email, papel, foto

#### 🏭 Células
- Listagem de células industriais
- Criar nova célula
- Configurar IP e porta do PLC
- Editar e deletar células
- Visualizar status de conexão

#### 🔑 Permissões
- Gerenciar permissões de acesso
- Associar usuários a células
- Definir períodos de acesso
- (Funcionalidade em desenvolvimento)

#### 📱 Dispositivos
- Gerenciar dispositivos Intelbras BIO-T
- Adicionar novo dispositivo
- Configurar IP, porta, usuário e senha
- Testar conexão com dispositivo
- Visualizar status online/offline

#### 📋 Eventos
- Histórico completo de eventos de acesso
- Filtrar por usuário, célula, tipo
- Visualizar status de cada evento
- Data e hora de cada acesso

#### 👤 Presença
- Visualizar quem está dentro de cada célula
- Horário de entrada
- Status em tempo real
- Atualização automática a cada 30 segundos

## 🎯 Funcionalidades Principais

### Autenticação
- Login com usuário e senha
- Armazenamento de token JWT no localStorage
- Proteção de rotas (redirecionamento automático)
- Logout com limpeza de dados

### Interface
- Sidebar com navegação
- Topbar com informações do usuário
- Modais para criar/editar registros
- Alertas de sucesso/erro
- Responsivo para mobile

### API Integration
- Requisições automáticas ao backend
- Tratamento de erros
- Atualização automática de dados
- Cache de dados em memória

## 🔧 Estrutura de Arquivos

```
public/np
├── login.html              # Página de login
├── dashboard.html          # Dashboard principal
├── index.html             # Página inicial (antiga)
├── css/
│   └── style.css          # Estilos globais
└── js/
    ├── app.js             # Funções compartilhadas
    └── dashboard.js       # Lógica do dashboard
```

## 🎨 Estilos e Temas

### Cores
- **Primária:** #667eea (roxo)
- **Secundária:** #764ba2 (roxo escuro)
- **Sucesso:** #48bb78 (verde)
- **Perigo:** #f56565 (vermelho)
- **Aviso:** #ed8936 (laranja)

### Componentes
- Botões com gradiente
- Cards com sombra
- Badges coloridas
- Tabelas responsivas
- Modais com overlay
- Alertas com animação

## 📱 Responsividade

A aplicação é totalmente responsiva:
- **Desktop:** Layout completo com sidebar
- **Tablet:** Sidebar colapsável
- **Mobile:** Menu em abas

## 🔄 Atualização de Dados

- Dashboard atualiza a cada 30 segundos
- Dados em cache para melhor performance
- Requisições automáticas ao backend
- Sincronização em tempo real

## 🚀 Como Usar

1. **Extrair o projeto**
2. **Instalar dependências:** `npm install`
3. **Iniciar servidor:** `npm start`
4. **Acessar:** http://localhost:3000/login.html
5. **Fazer login** com admin/admin123

## 📝 Próximas Melhorias

- [ ] Editar usuários
- [ ] Editar células
- [ ] Editar dispositivos
- [ ] Gerenciar permissões
- [ ] Gráficos de analytics
- [ ] Exportar relatórios
- [ ] Temas dark/light
- [ ] Notificações em tempo real

## 🐛 Troubleshooting

### Página em branco
- Verificar console (F12)
- Verificar se servidor está rodando
- Limpar cache do navegador

### Erro 404 na API
- Verificar se servidor Express está rodando
- Verificar porta (padrão 3000)
- Verificar URL da API em `js/app.js`

### Não consegue fazer login
- Verificar credenciais (admin/admin123)
- Verificar se banco de dados foi inicializado
- Verificar logs do servidor

---

**Versão:** 1.0.0  
**Data:** 17 de Novembro de 2025
