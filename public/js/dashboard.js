// ==========================================
// INICIALIZAÇÃO E ESTADO GLOBAL
// ==========================================
if (typeof checkAuth === 'function') checkAuth();

let currentPage = 'dashboard';
let usersCache = [];
let cellsCache = [];
let devicesCache = [];

let editingCellId = null;
let editingDeviceId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    setInterval(loadDashboardData, 30000);
});

// ==========================================
// NAVEGAÇÃO ENTRE PÁGINAS
// ==========================================
function switchPage(page, event) {
    if (event) event.preventDefault();

    // Remove a classe active de todas as secções e links
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

    // Adiciona a classe active na página escolhida
    const targetPage = document.getElementById(page);
    if (targetPage) targetPage.classList.add('active');
    
    const navLink = document.querySelector(`[data-page="${page}"]`);
    if (navLink) navLink.classList.add('active');

    // Atualiza o título
    const titles = {
        'dashboard': '📊 Dashboard', 'users': '👥 Usuários', 'cells': '🏭 Células',
        'permissions': '🔑 Permissões', 'devices': '📱 Dispositivos', 'events': '📋 Eventos', 'presence': '👤 Presença'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[page] || 'Dashboard';
    
    currentPage = page;

    // Carrega dados específicos da aba aberta
    if (page === 'users') updateUsersTable();
    else if (page === 'cells') updateCellsGrid();
    else if (page === 'devices') updateDevicesGrid();
    else if (page === 'events' || page === 'presence') loadDashboardData();
    else if (page === 'permissions') updatePermissionsTab();
}

// ==========================================
// CARREGAMENTO DE DADOS (READ)
// ==========================================
async function loadDashboardData() {
    try {
        const users = await ApiClient.get('/users');
        usersCache = users;
        const totalUsersEl = document.getElementById('totalUsers');
        if (totalUsersEl) totalUsersEl.textContent = users.length;

        const cells = await ApiClient.get('/cells');
        cellsCache = cells;
        const totalCellsEl = document.getElementById('totalCells');
        if(totalCellsEl) totalCellsEl.textContent = cells.length;

        const events = await ApiClient.get('/access-events');
        updateRecentEvents(events.slice(0, 5));

        const presence = await ApiClient.get('/cell-presence');
        const peopleInsideEl = document.getElementById('peopleInside');
        if(peopleInsideEl) peopleInsideEl.textContent = presence.length;

        if (currentPage === 'presence') updatePresenceTable(presence);
        if (currentPage === 'events') updateEventsTable(events);
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    }
}

function updateRecentEvents(events) {
    const tbody = document.querySelector('#recentEvents tbody');
    if (!tbody) return;
    if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum evento</td></tr>';
        return;
    }
    tbody.innerHTML = events.map(event => `
        <tr>
            <td>${event.username || '-'}</td>
            <td>${event.cell_name || '-'}</td>
            <td><span class="badge ${event.event_type === 'entry' ? 'badge-success' : 'badge-warning'}">${event.event_type === 'entry' ? '🚪 Entrada' : '🚪 Saída'}</span></td>
            <td>${new Date(event.timestamp).toLocaleTimeString()}</td>
        </tr>
    `).join('');
}

function updateEventsTable(events) {
    const tbody = document.querySelector('#eventsTable tbody');
    if (!tbody) return;
    if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum evento</td></tr>';
        return;
    }
    tbody.innerHTML = events.map(event => `
        <tr>
            <td>${event.username || '-'}</td>
            <td>${event.cell_name || '-'}</td>
            <td>${event.event_type === 'entry' ? '🚪 Entrada' : '🚪 Saída'}</td>
            <td><span class="badge ${event.status === 'success' ? 'badge-success' : 'badge-danger'}">${event.status === 'success' ? '✅ Sucesso' : '❌ Falha'}</span></td>
            <td>${new Date(event.timestamp).toLocaleString()}</td>
        </tr>
    `).join('');
}

function updatePresenceTable(presence) {
    const tbody = document.querySelector('#presenceTable tbody');
    if (!tbody) return;
    if (!presence || presence.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhuma pessoa dentro</td></tr>';
        return;
    }
    tbody.innerHTML = presence.map(p => `
        <tr>
            <td>${p.username || '-'}</td>
            <td>${p.cell_name || '-'}</td>
            <td>${new Date(p.entry_time).toLocaleString()}</td>
            <td><span class="badge badge-success">🟢 Dentro</span></td>
        </tr>
    `).join('');
}

async function updateUsersTable() {
    const tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;
    if (!usersCache || usersCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum usuário</td></tr>';
        return;
    }
    tbody.innerHTML = usersCache.map(user => `
        <tr>
            <td>${user.username}</td>
            <td>${user.email || '-'}</td>
            <td><span class="badge badge-primary">${user.role}</span></td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editUser(${user.id})">✏️ Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">🗑️ Deletar</button>
            </td>
        </tr>
    `).join('');
}

async function updateCellsGrid() {
    const container = document.getElementById('cellsContainer');
    if (!container) return;
    if (!cellsCache || cellsCache.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">Nenhuma célula cadastrada</p>';
        return;
    }
    container.innerHTML = cellsCache.map(cell => `
        <div class="card">
            <div class="card-header"><h3>${cell.name}</h3></div>
            <div class="card-body">
                <p>${cell.description || 'Sem descrição'}</p>
                <p style="font-size: 0.85rem; color: var(--text-light);">
                    <strong>PLC:</strong> ${cell.plc_address || '-'}<br>
                    <strong>Status:</strong> <span class="badge ${cell.status === 'online' ? 'badge-success' : 'badge-danger'}">${cell.status || 'offline'}</span>
                </p>
            </div>
            <div class="card-footer" style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-warning" onclick="editCell(${cell.id})">✏️ Editar</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCell(${cell.id})">🗑️ Deletar</button>
            </div>
        </div>
    `).join('');
}

async function updateDevicesGrid() {
    const container = document.getElementById('devicesContainer');
    if (!container) return;
    try {
        const devices = await ApiClient.get('/intelbras-devices');
        devicesCache = devices;
        if (!devices || devices.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 2rem;">Nenhum dispositivo cadastrado</p>';
            return;
        }
        container.innerHTML = devices.map(device => `
            <div class="card">
                <div class="card-header"><h3>${device.name}</h3></div>
                <div class="card-body">
                    <p style="font-size: 0.85rem; color: var(--text-light);">
                        <strong>IP:</strong> ${device.ip_address}<br>
                        <strong>Status:</strong> <span class="badge ${device.status === 'online' ? 'badge-success' : 'badge-danger'}">${device.status || 'offline'}</span>
                    </p>
                </div>
                <div class="card-footer" style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="testDevice(${device.id})">🔌 Testar</button>
                    <button class="btn btn-sm btn-warning" onclick="editDevice(${device.id})">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteDevice(${device.id})">🗑️ Deletar</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<p style="color: var(--danger); text-align: center;">Erro ao carregar dispositivos</p>';
    }
}

// ==========================================
// CRIAÇÃO E EDIÇÃO (MODAIS E FORMS)
// ==========================================
function populateCellSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Se o cache estiver vazio, tenta carregar do servidor antes
    if (cellsCache.length === 0) {
        ApiClient.get('/cells').then(cells => {
            cellsCache = cells;
            renderCellOptions(select);
        });
    } else {
        renderCellOptions(select);
    }
}

function renderCellOptions(select) {
    select.innerHTML = cellsCache.map(c => 
        `<option value="${c.id}">${c.name} (PLC: ${c.plc_address || 'N/A'})</option>`
    ).join('');
}

function openModalById(id) {
    if (typeof showModal === 'function') showModal(id);
    else document.getElementById(id).style.display = 'block';
}

function closeModalById(id) {
    if (typeof hideModal === 'function') hideModal(id);
    else document.getElementById(id).style.display = 'none';
}

function openAddDeviceModal() {
    editingDeviceId = null;
    document.getElementById('deviceForm').reset();
    document.querySelector('#deviceModal .modal-header h2').textContent = 'Novo Dispositivo Intelbras';
    populateCellSelect(); 
    openModalById('deviceModal');
}

function openAddCellModal() {
    editingCellId = null;
    document.getElementById('cellForm').reset();
    document.querySelector('#cellModal .modal-header h2').textContent = 'Nova Célula';
    openModalById('cellModal');
}

async function handleAddCell(event) {
    event.preventDefault();
    const payload = {
        name: document.getElementById('cellName').value,
        description: document.getElementById('cellDescription').value,
        plc_address: document.getElementById('cellPlcAddress').value,
        plc_port: parseInt(document.getElementById('cellPlcPort').value) || 102,
        plc_rack: parseInt(document.getElementById('cellPlcRack').value) || 0,
        plc_slot: parseInt(document.getElementById('cellPlcSlot').value) || 1,
        plc_database: parseInt(document.getElementById('cellPlcDb').value),
        plc_start_byte: parseInt(document.getElementById('cellPlcStart').value) || 0
    };
    try {
        if (editingCellId) {
            await ApiClient.put(`/cells/${editingCellId}`, payload);
            showAlert('✅ Célula atualizada!', 'success');
        } else {
            await ApiClient.post('/cells', payload);
            showAlert('✅ Célula configurada!', 'success');
        }
        closeModalById('cellModal');
        document.getElementById('cellForm').reset();
        loadDashboardData();
        updateCellsGrid();
    } catch (error) {
        showAlert('❌ ' + error.message, 'danger');
    }
}

async function handleAddDevice(event) {
    event.preventDefault();
    const payload = {
        name: document.getElementById('deviceName').value,
        ipAddress: document.getElementById('deviceIp').value,
        port: parseInt(document.getElementById('devicePort').value) || 80,
        username: document.getElementById('deviceUsername').value,
        password: document.getElementById('devicePassword').value,
        cell_id: document.getElementById('deviceCellId').value
    };
    try {
        if (editingDeviceId) {
            await ApiClient.put(`/intelbras-devices/${editingDeviceId}`, payload);
            showAlert('✅ Dispositivo atualizado!', 'success');
        } else {
            await ApiClient.post('/intelbras-devices', payload);
            showAlert('✅ Dispositivo adicionado!', 'success');
        }
        closeModalById('deviceModal');
        document.getElementById('deviceForm').reset();
        updateDevicesGrid();
    } catch (error) {
        showAlert('❌ ' + error.message, 'danger');
    }
}

// ==========================================
// FUNÇÕES DE EDIÇÃO E EXCLUSÃO
// ==========================================
function editUser(id) {
    const user = usersCache.find(u => u.id === id);
    if (!user) return;
    const novoNome = prompt("Editar Nome do Usuário:", user.username);
    if (novoNome && novoNome !== user.username) {
        ApiClient.put(`/users/${id}`, { username: novoNome })
            .then(() => { showAlert('✅ Usuário atualizado!', 'success'); loadDashboardData(); updateUsersTable(); })
            .catch(err => showAlert('❌ ' + err.message, 'danger'));
    }
}

function editCell(id) {
    const cell = cellsCache.find(c => c.id === id);
    if (!cell) return;
    editingCellId = id;
    
    document.getElementById('cellName').value = cell.name;
    document.getElementById('cellDescription').value = cell.description || '';
    document.getElementById('cellPlcAddress').value = cell.plc_address || '';
    document.getElementById('cellPlcPort').value = cell.plc_port || 102;
    document.getElementById('cellPlcRack').value = cell.plc_rack || 0;
    document.getElementById('cellPlcSlot').value = cell.plc_slot || 1;
    document.getElementById('cellPlcDb').value = cell.plc_database || '';
    document.getElementById('cellPlcStart').value = cell.plc_start_byte || 0;

    document.querySelector('#cellModal .modal-header h2').textContent = '✏️ Editar Célula';
    openModalById('cellModal');
}

function editDevice(id) {
    const device = devicesCache.find(d => d.id === id);
    if (!device) return;
    editingDeviceId = id;
    populateCellSelect();
    
    setTimeout(() => {
        document.getElementById('deviceName').value = device.name;
        document.getElementById('deviceIp').value = device.ip_address;
        document.getElementById('devicePort').value = device.port || 80;
        document.getElementById('deviceUsername').value = device.username;
        document.getElementById('devicePassword').value = device.password;
        document.getElementById('deviceCellId').value = device.cell_id;
    }, 100);

    document.querySelector('#deviceModal .modal-header h2').textContent = '✏️ Editar Dispositivo';
    openModalById('deviceModal');
}

async function deleteUser(id) { if (confirm('Deletar usuário?')) { await ApiClient.delete(`/users/${id}`); loadDashboardData(); updateUsersTable(); } }
async function deleteCell(id) { if (confirm('Deletar célula?')) { await ApiClient.delete(`/cells/${id}`); loadDashboardData(); updateCellsGrid(); } }
async function deleteDevice(id) { if (confirm('Deletar dispositivo?')) { await ApiClient.delete(`/intelbras-devices/${id}`); updateDevicesGrid(); } }

async function testDevice(id) {
    try {
        showAlert('⏳ Testando conexão...', 'info');
        const res = await ApiClient.post(`/intelbras-devices/${id}/test`);
        showAlert('✅ ' + res.message, 'success');
        updateDevicesGrid();
    } catch (error) {
        showAlert('❌ Erro: ' + error.message, 'danger');
        updateDevicesGrid();
    }
}

// ==========================================
// CADASTRO DE UTILIZADOR (BIOMETRIA FACIAL)
// ==========================================
async function openUserModal() {
    try {
        // Carrega dados frescos para garantir que as listas estão atualizadas
        const [cells, devices] = await Promise.all([ 
            ApiClient.get('/cells'), 
            ApiClient.get('/intelbras-devices') 
        ]);
        
        cellsCache = cells;
        devicesCache = devices;

        // 1. PREENCHE AS CÉLULAS (O que estava a faltar)
        const userCellSelect = document.getElementById('userCell');
        if (userCellSelect) {
            userCellSelect.innerHTML = cells.map(c => 
                `<option value="${c.id}">${c.name}</option>`
            ).join('');
        }

        // 2. PREENCHE OS DISPOSITIVOS
        const targetDevicesSelect = document.getElementById('targetDevices');
        if (targetDevicesSelect) {
            targetDevicesSelect.innerHTML = devices.map(d => 
                `<option value="${d.id}">${d.name} (${d.ip_address})</option>`
            ).join('');
        }

        openModalById('userModal');
    } catch (error) {
        console.error("Erro ao abrir modal de usuário:", error);
        showAlert('Erro ao carregar dados de células ou dispositivos', 'danger');
    }
}

// ==========================================
// DISPOSITIVOS (ATUALIZADO)
// ==========================================
function openAddDeviceModal() {
    editingDeviceId = null;
    const form = document.getElementById('deviceForm');
    if (form) form.reset();
    
    document.querySelector('#deviceModal .modal-header h2').textContent = 'Novo Dispositivo Intelbras';
    
    // Preenche o select de células no modal de dispositivos
    populateCellSelect('deviceCellId'); 
    
    openModalById('deviceModal');
}
function closeUserModal() {
    closeModalById('userModal');
    const form = document.getElementById('userRegistrationForm');
    if (form) form.reset();
    const preview = document.getElementById('photoPreview');
    if (preview) preview.style.display = 'none';
}

const userForm = document.getElementById('userRegistrationForm');
if (userForm) {
    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameEl = document.getElementById('newUserName') || document.getElementById('userName');
        const name = nameEl ? nameEl.value : '';
        const photoFile = document.getElementById('userPhoto').files[0];
        
        const selectElement = document.getElementById('targetDevices');
        const selectedDevices = selectElement ? Array.from(selectElement.selectedOptions).map(option => option.value) : [];

        if (selectedDevices.length === 0) return showAlert('Selecione pelo menos um dispositivo!', 'warning');
        if (!photoFile) return showAlert('A foto é obrigatória!', 'warning');

        const formData = new FormData();
        formData.append('name', name);
        formData.append('devices', JSON.stringify(selectedDevices)); 
        formData.append('photo', photoFile);

        try {
            showAlert(`⏳ Enviando biometria para ${selectedDevices.length} dispositivo(s)...`, 'info');
            const response = await fetch('/api/users/register', {
                method: 'POST',
                body: formData,
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const result = await response.json();
            if (response.ok) {
                showAlert('✅ ' + result.message, 'success');
                closeUserModal();
                loadDashboardData();
                updateUsersTable(); 
            } else {
                showAlert('❌ Erro: ' + result.error, 'danger');
            }
        } catch (error) {
            showAlert('❌ Erro na comunicação com o servidor.', 'danger');
        }
    });
}

const userPhotoInput = document.getElementById('userPhoto');
if (userPhotoInput) {
    userPhotoInput.addEventListener('change', function() {
        if (!this.files || !this.files[0]) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('photoPreview');
            if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        }
        reader.readAsDataURL(this.files[0]);
    });
}
// ==========================================
// ABA DE PERMISSÕES DINÂMICAS
// ==========================================

async function updatePermissionsTab() {
    try {
        // Busca os dados simultaneamente
        const [permissions, users, cells] = await Promise.all([
            ApiClient.get('/permissions'),
            ApiClient.get('/users'),
            ApiClient.get('/cells')
        ]);

        // Atualiza os selects do formulário
        const userSelect = document.getElementById('permUserId');
        const cellSelect = document.getElementById('permCellId');
        
        if (userSelect && cellSelect) {
            userSelect.innerHTML = '<option value="">Selecione um Usuário...</option>' + 
                users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
                
            cellSelect.innerHTML = '<option value="">Selecione uma Célula...</option>' + 
                cells.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        // Atualiza a tabela
        const tbody = document.querySelector('#permissionsTable tbody');
        if (tbody) {
            if (permissions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Nenhuma permissão cadastrada</td></tr>';
                return;
            }

            tbody.innerHTML = permissions.map(p => `
                <tr>
                    <td><strong>${p.username}</strong></td>
                    <td><span class="badge badge-primary">${p.cell_name}</span></td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="revokePermission(${p.user_id}, ${p.cell_id})">
                            ❌ Revogar
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error("Erro ao carregar permissões:", error);
    }
}

// Evento para conceder permissão
const permForm = document.getElementById('grantPermissionForm');
if (permForm) {
    permForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user_id = document.getElementById('permUserId').value;
        const cell_id = document.getElementById('permCellId').value;

        try {
            await ApiClient.post('/permissions', { user_id, cell_id });
            showAlert('✅ Permissão concedida!', 'success');
            updatePermissionsTab(); // Atualiza a tabela imediatamente
        } catch (error) {
            showAlert('❌ ' + error.message, 'danger');
        }
    });
}

// Função para revogar permissão
async function revokePermission(userId, cellId) {
    if (confirm('Tem certeza que deseja revogar o acesso deste usuário a esta célula?')) {
        try {
            await ApiClient.delete(`/permissions/${userId}/${cellId}`);
            showAlert('✅ Permissão revogada!', 'success');
            updatePermissionsTab(); // Atualiza a tabela
        } catch (error) {
            showAlert('❌ ' + error.message, 'danger');
        }
    }
}