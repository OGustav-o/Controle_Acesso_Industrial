// Configuração da API
const API_URL = 'http://localhost:3000/api';

// Classe para gerenciar autenticação
class Auth {
    static getToken() {
        return localStorage.getItem('token');
    }

    static setToken(token) {
        localStorage.setItem('token', token);
    }

    static getUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    }

    static setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    }

    static isAuthenticated() {
        return !!this.getToken();
    }

    static logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }

    static getHeaders() {
        const token = this.getToken();
        return {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        };
    }
}

// Classe para fazer requisições à API
class ApiClient {
    static async request(endpoint, options = {}) {
        const url = `${API_URL}${endpoint}`;
        const headers = Auth.getHeaders();

        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...headers, ...options.headers }
            });

            if (response.status === 401) {
                Auth.logout();
                window.location.href = '/login.html';
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro na requisição');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    static get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    static post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    static put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    static delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    static postFormData(endpoint, formData) {
        const headers = Auth.getHeaders();
        delete headers['Content-Type'];

        return fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { ...headers },
            body: formData
        }).then(response => {
            if (response.status === 401) {
                Auth.logout();
                window.location.href = '/login.html';
            }
            return response.json();
        });
    }
}

// Funções de UI
function showAlert(message, type = 'info') {
    const alertId = `alert-${Date.now()}`;
    const alertHtml = `
        <div id="${alertId}" class="alert alert-${type}">
            <span>${message}</span>
        </div>
    `;

    const alertContainer = document.getElementById('alertContainer');
    if (alertContainer) {
        alertContainer.insertAdjacentHTML('beforeend', alertHtml);
        setTimeout(() => {
            const alert = document.getElementById(alertId);
            if (alert) alert.remove();
        }, 5000);
    }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

function toggleLoading(button, isLoading = true) {
    if (!button) return;

    if (isLoading) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> Carregando...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || 'Enviar';
    }
}

function formatDate(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function formatTime(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}

// Verificar autenticação ao carregar página
function checkAuth() {
    if (!Auth.isAuthenticated()) {
        window.location.href = '/login.html';
    }
}

// Logout
function logout() {
    Auth.logout();
    window.location.href = '/login.html';
}

// Inicializar página
document.addEventListener('DOMContentLoaded', () => {
    // Fechar modais ao clicar no botão de fechar
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Fechar modais ao clicar fora
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Atualizar informações do usuário no header
    const user = Auth.getUser();
    if (user) {
        const userNameElement = document.getElementById('userName');
        const userRoleElement = document.getElementById('userRole');
        if (userNameElement) userNameElement.textContent = user.username;
        if (userRoleElement) userRoleElement.textContent = user.role;
    }
});
