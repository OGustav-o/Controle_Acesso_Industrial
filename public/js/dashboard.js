// Verificar autenticação
checkAuth();

// Página atual
let currentPage = 'dashboard';

// Dados em cache
let usersCache = [];
let cellsCache = [];
let devicesCache = [];

// Inicializar dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    setInterval(loadDashboardData, 30000); // Atualizar a cada 30 segundos
});

// Carregar dados do dashboard
async function loadDashboardData() {
    try {
        // Carregar usuários
        const users = await ApiClient.get('/users');
        usersCache = users;
        document.getElementById('totalUsers').textContent = users.length;

        // Carregar células
        const cells = await ApiClient.get('/cells');
        cellsCache = cells;
        document.getElementById('totalCells').textContent = cells.length;

        // Carregar eventos recentes
        const events = await ApiClient.get('/access-events');
        updateRecentEvents(events.slice(0, 5));

        // Carregar presença
        const presence = await ApiClient.get('/cell-presence');
        document.getElementById('peopleInside').textContent = presence.length;

        // Atualizar tabela de presença
        if (currentPage === 'presence') {
            updatePresenceTable(presence);
        }

        // Atualizar tabela de eventos
        if (currentPage === 'events') {
            updateEventsTable(events);
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    }
}

// Atualizar tabela de eventos recentes
function updateRecentEvents(events) {
    const tbody = document.querySelector('#recentEvents tbody');
    if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">Nenhum evento</td></tr>';
        return;
    }

    tbody.innerHTML = events.map(event => `
        <tr>
            <td>${event.username || '-'}</td>
            <td>${event.cell_name || '-'}</td>
            <td>
                <span class="badge ${event.event_type === 'entry' ? 'badge-success' : 'badge-warning'}">
                    ${event.event_type === 'entry' ? '🚪 Entrada' : '🚪 Saída'}
                </span>
            </td>
            <td>${formatTime(event.timestamp)}</td>
        </tr>
    `).join('');
}

// Atualizar tabela de eventos completa
function updateEventsTable(events) {
    const tbody = document.querySelector('#eventsTable tbody');
    if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">Nenhum evento</td></tr>';
        return;
    }

    tbody.innerHTML = events.map(event => `
        <tr>
            <td>${event.username || '-'}</td>
            <td>${event.cell_name || '-'}</td>
            <td>${event.event_type === 'entry' ? '🚪 Entrada' : '🚪 Saída'}</td>
            <td>
                <span class="badge ${event.status === 'success' ? 'badge-success' : 'badge-danger'}">
                    ${event.status === 'success' ? '✅ Sucesso' : '❌ Falha'}
                </span>
            </td>
            <td>${formatDate(event.timestamp)}</td>
        </tr>
    `).join('');
}

// Atualizar tabela de presença
function updatePresenceTable(presence) {
    const tbody = document.querySelector('#presenceTable tbody');
    if (!presence || presence.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">Nenhuma pessoa dentro</td></tr>';
        return;
    }

    tbody.innerHTML = presence.map(p => `
        <tr>
            <td>${p.username || '-'}</td>
            <td>${p.cell_name || '-'}</td>
            <td>${formatDate(p.entry_time)}</td>
            <td>
                <span class="badge badge-success">🟢 Dentro</span>
            </td>
        </tr>
    `).join('');
}

// Atualizar tabela de usuários
async function updateUsersTable() {
    const tbody = document.querySelector('#usersTable tbody');
    if (!usersCache || usersCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">Nenhum usuário</td></tr>';
        return;
    }

    tbody.innerHTML = usersCache.map(user => `
        <tr>
            <td>${user.username}</td>
            <td>${user.email || '-'}</td>
            <td>
                <span class="badge badge-primary">${user.role}</span>
            </td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="editUser(${user.id})">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Deletar</button>
            </td>
        </tr>
    `).join('');
}

// Atualizar grid de células
async function updateCellsGrid() {
    const container = document.getElementById('cellsContainer');
    if (!cellsCache || cellsCache.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">Nenhuma célula cadastrada</p>';
        return;
    }

    container.innerHTML = cellsCache.map(cell => `
        <div class="card">
            <div class="card-header">
                <h3>${cell.name}</h3>
            </div>
            <div class="card-body">
                <p>${cell.description || 'Sem descrição'}</p>
                <p style="font-size: 0.85rem; color: var(--text-light); margin-top: 1rem;">
                    <strong>PLC:</strong> ${cell.plc_address || '-'}:${cell.plc_port || '-'}<br>
                    <strong>Status:</strong> <span class="badge ${cell.status === 'online' ? 'badge-success' : 'badge-danger'}">${cell.status}</span>
                </p>
            </div>
            <div class="card-footer" style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-secondary" onclick="editCell(${cell.id})">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCell(${cell.id})">Deletar</button>
            </div>
        </div>
    `).join('');
}

// Atualizar grid de dispositivos
async function updateDevicesGrid() {
    const container = document.getElementById('devicesContainer');
    try {
        const devices = await ApiClient.get('/intelbras-devices');
        if (!devices || devices.length === 0) {
            container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">Nenhum dispositivo cadastrado</p>';
            return;
        }

        container.innerHTML = devices.map(device => `
            <div class="card">
                <div class="card-header">
                    <h3>${device.name}</h3>
                </div>
                <div class="card-body">
                    <p style="font-size: 0.85rem; color: var(--text-light);">
                        <strong>IP:</strong> ${device.ip_address}<br>
                        <strong>Porta:</strong> ${device.port}<br>
                        <strong>Status:</strong> <span class="badge ${device.status === 'online' ? 'badge-success' : 'badge-danger'}">${device.status}</span>
                    </p>
                </div>
                <div class="card-footer" style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="testDevice(${device.id})">Testar</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteDevice(${device.id})">Deletar</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<p style="color: var(--danger); text-align: center; padding: 2rem;">Erro ao carregar dispositivos</p>';
    }
}

// Trocar página
function switchPage(page, event) {
    if (event) {
        event.preventDefault();
    }

    // Remover página ativa
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

    // Ativar nova página
    document.getElementById(page).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    // Atualizar título
    const titles = {
        'dashboard': '📊 Dashboard',
        'users': '👥 Usuários',
        'cells': '🏭 Células',
        'permissions': '🔑 Permissões',
        'devices': '📱 Dispositivos',
        'events': '📋 Eventos',
        'presence': '👤 Presença'
    };
    document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

    currentPage = page;

    // Carregar dados específicos da página
    if (page === 'users') {
        updateUsersTable();
    } else if (page === 'cells') {
        updateCellsGrid();
    } else if (page === 'devices') {
        updateDevicesGrid();
    } else if (page === 'events') {
        loadDashboardData();
    } else if (page === 'presence') {
        loadDashboardData();
    }
}

// Adicionar novo usuário
async function handleAddUser(event) {
    event.preventDefault();

    const username = document.getElementById('userUsername').value;
    const email = document.getElementById('userEmail').value;
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const photoFile = document.getElementById('userPhoto').files[0];

    try {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('email', email);
        formData.append('password', password);
        formData.append('role', role);
        if (photoFile) {
            formData.append('photo', photoFile);
        }

        const result = await ApiClient.postFormData('/users', formData);

        showAlert('✅ Usuário criado com sucesso!', 'success');
        hideModal('userModal');
        document.getElementById('userForm').reset();
        loadDashboardData();
    } catch (error) {
        showAlert('❌ ' + error.message, 'danger');
    }
}

// --- LÓGICA DE CADASTRO DE USUÁRIO COM FACE ---

// Abre o modal e busca os dados necessários (Células e Dispositivos Intelbras)
async function openUserModal() {
    try {
        // Captura todos os IDs de dispositivos selecionados num Array
        const selectElement = document.getElementById('targetDevices');
        const selectedDevices = Array.from(selectElement.selectedOptions).map(option => option.value);

        if (selectedDevices.length === 0) {
            showAlert('Selecione pelo menos um dispositivo!', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('name', name);
        // Enviamos o Array transformado em String (JSON)
        formData.append('devices', JSON.stringify(selectedDevices)); 
        formData.append('photo', photoFile);
    } catch (error) {
        showAlert('Erro ao carregar dados para o cadastro', 'danger');
    }
}

function closeUserModal() {
    document.getElementById('userModal').style.display = 'none';
    document.getElementById('userRegistrationForm').reset();
    document.getElementById('photoPreview').style.display = 'none';
}

// Intercepta o envio do formulário
document.getElementById('userRegistrationForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('userName').value;
    const cell_id = document.getElementById('userCell').value;
    const intelbras_device_id = document.getElementById('targetDevice').value;
    const photoFile = document.getElementById('userPhoto').files[0];

    if (!photoFile) {
        showAlert('A foto do rosto é obrigatória para biometria!', 'warning');
        return;
    }

    // Usamos FormData para enviar a imagem binária
    const formData = new FormData();
    formData.append('name', name);
    formData.append('cell_id', cell_id);
    formData.append('intelbras_device_id', intelbras_device_id);
    formData.append('photo', photoFile);

    try {
        showAlert('⏳ Cadastrando e enviando biometria para o dispositivo...', 'info');

        const response = await fetch('/api/users/register', {
            method: 'POST',
            body: formData,
            // Importante: Não definir Content-Type manualmente aqui, 
            // o navegador fará isso automaticamente para FormData
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}` // Se usar JWT
            }
        });

        const result = await response.json();

        if (response.ok) {
            showAlert('✅ Usuário cadastrado e sincronizado com sucesso!', 'success');
            closeUserModal();
            loadDashboardData(); // Função que atualiza sua tabela de usuários
        } else {
            showAlert('❌ Erro: ' + result.error, 'danger');
        }
    } catch (error) {
        console.error(error);
        showAlert('❌ Erro na comunicação com o servidor.', 'danger');
    }
});

// Preview da imagem selecionada
document.getElementById('userPhoto').addEventListener('change', function() {
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('photoPreview');
        preview.src = e.target.result;
        preview.style.display = 'block';
    }
    reader.readAsDataURL(this.files[0]);
});

// Adicionar nova célula
async function handleAddCell(event) {
    event.preventDefault();

    const name = document.getElementById('cellName').value;
    const description = document.getElementById('cellDescription').value;
    const plc_address = document.getElementById('cellPlcAddress').value;
    
    // Novos campos do CLP
    const plc_port = parseInt(document.getElementById('cellPlcPort').value) || 102;
    const plc_rack = parseInt(document.getElementById('cellPlcRack').value) || 0;
    const plc_slot = parseInt(document.getElementById('cellPlcSlot').value) || 1;
    const plc_database = parseInt(document.getElementById('cellPlcDb').value);
    const plc_start_byte = parseInt(document.getElementById('cellPlcStart').value) || 0;

    try {
        await ApiClient.post('/cells', {
            name, description, plc_address, plc_port, 
            plc_rack, plc_slot, plc_database, plc_start_byte
        });

        showAlert('✅ Célula e CLP configurados!', 'success');
        hideModal('cellModal');
        document.getElementById('cellForm').reset();
        loadDashboardData();
    } catch (error) {
        showAlert('❌ ' + error.message, 'danger');
    }
}

// Adicionar novo dispositivo
async function handleAddDevice(event) {
    event.preventDefault();

    const name = document.getElementById('deviceName').value;
    const ipAddress = document.getElementById('deviceIp').value;
    const port = parseInt(document.getElementById('devicePort').value) || 80;
    const username = document.getElementById('deviceUsername').value;
    const password = document.getElementById('devicePassword').value;
    
    // Pega a célula selecionada
    const cell_id = document.getElementById('deviceCellId').value;

    try {
        await ApiClient.post('/intelbras-devices', {
            name, ipAddress, port, username, password, cell_id
        });

        showAlert('✅ Dispositivo adicionado e vinculado à Célula!', 'success');
        hideModal('deviceModal');
        document.getElementById('deviceForm').reset();
        updateDevicesGrid();
    } catch (error) {
        showAlert('❌ ' + error.message, 'danger');
    }
}

// Deletar usuário
async function deleteUser(userId) {
    if (!confirm('Tem certeza que deseja deletar este usuário?')) return;

    try {
        await ApiClient.delete(`/users/${userId}`);
        showAlert('✅ Usuário deletado com sucesso!', 'success');
        loadDashboardData();
    } catch (error) {
        showAlert('❌ ' + error.message, 'danger');
    }
}

// Deletar célula
async function deleteCell(cellId) {
    if (!confirm('Tem certeza que deseja deletar esta célula?')) return;

    try {
        await ApiClient.delete(`/cells/${cellId}`);
        showAlert('✅ Célula deletada com sucesso!', 'success');
        loadDashboardData();
    } catch (error) {
        showAlert('❌ ' + error.message, 'danger');
    }
}

// Deletar dispositivo
async function deleteDevice(deviceId) {
    if (!confirm('Tem certeza que deseja deletar este dispositivo?')) return;

    try {
        await ApiClient.delete(`/intelbras-devices/${deviceId}`);
        showAlert('✅ Dispositivo deletado com sucesso!', 'success');
        updateDevicesGrid();
    } catch (error) {
        showAlert('❌ ' + error.message, 'danger');
    }
}

// Testar dispositivo
async function testDevice(id) {
    try {
        showAlert('⏳ Testando conexão com o dispositivo...', 'info');
        
        // Dispara o teste no backend
        const response = await ApiClient.post(`/intelbras-devices/${id}/test`);
        showAlert('✅ ' + response.message, 'success');
        
        // Solução: Garante que os dados sejam buscados novamente do servidor
        if (typeof loadDashboardData === 'function') {
            await loadDashboardData(); // Refaz o GET no servidor
        } else {
            // Fallback: Recarrega a página suavemente após 1 segundo se a função acima tiver outro nome
            setTimeout(() => { window.location.reload(); }, 1000);
        }

    } catch (error) {
        showAlert('❌ Erro na conexão: ' + error.message, 'danger');
        
        if (typeof loadDashboardData === 'function') {
            await loadDashboardData();
        } else {
            setTimeout(() => { window.location.reload(); }, 1000);
        }
    }
}
// Função para popular o select de células no modal de dispositivos
function populateCellSelect() {
    const select = document.getElementById('deviceCellId');
    if (!select) return;

    // Limpa as opções atuais e deixa apenas a padrão
    select.innerHTML = '<option value="">Selecione uma célula...</option>';

    // Verifica se existem células carregadas no cache
    if (cellsCache.length === 0) {
        select.innerHTML = '<option value="">Nenhuma célula encontrada</option>';
        return;
    }

    // Adiciona cada célula como uma opção
    cellsCache.forEach(cell => {
        const option = document.createElement('option');
        option.value = cell.id;
        option.textContent = `${cell.name} (IP: ${cell.plc_address})`;
        select.appendChild(option);
    });
}

// Exemplo de como abrir o modal carregando os dados
function openAddDeviceModal() {
    populateCellSelect(); // Carrega as células disponíveis antes de mostrar o modal
    showModal('deviceModal');
}

// Funções placeholder para edição
function editUser(userId) {
    showAlert('Funcionalidade em desenvolvimento...', 'info');
}

function editCell(cellId) {
    showAlert('Funcionalidade em desenvolvimento...', 'info');
}
