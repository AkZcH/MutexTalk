const API_BASE_URL = '/api';

class ApiClient {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Auth methods
  async signup(username: string, password: string, role: string = 'reader') {
    return this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
  }

  async login(username: string, password: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    if (response.token) {
      localStorage.setItem('token', response.token);
      localStorage.setItem('username', response.user.username);
      localStorage.setItem('role', response.user.role);
    }
    
    return response;
  }

  async logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    return this.request('/auth/logout', { method: 'POST' });
  }

  // Message methods
  async getMessages(page: number = 1, limit: number = 50) {
    return this.request(`/messages?page=${page}&limit=${limit}`);
  }

  async createMessage(message: string) {
    return this.request('/messages', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  }

  async updateMessage(id: number, message: string) {
    return this.request(`/messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ message })
    });
  }

  async deleteMessage(id: number) {
    return this.request(`/messages/${id}`, {
      method: 'DELETE'
    });
  }

  // Writer semaphore methods
  async acquireWriterAccess() {
    return this.request('/writer/request', {
      method: 'POST'
    });
  }

  async releaseWriterAccess() {
    return this.request('/writer/release', {
      method: 'POST'
    });
  }

  // System status methods
  async getStatus() {
    return this.request('/status');
  }

  // Admin methods
  async getLogs(page: number = 1, limit: number = 50) {
    return this.request(`/admin/logs?page=${page}&limit=${limit}`);
  }

  async toggleWriter() {
    return this.request('/admin/toggle-writer', {
      method: 'POST'
    });
  }

  // Utility methods
  getCurrentUser() {
    return localStorage.getItem('username');
  }

  getCurrentRole() {
    return localStorage.getItem('role');
  }

  isAuthenticated() {
    return !!localStorage.getItem('token');
  }

  // WebSocket connection for real-time updates
  connectWebSocket(onMessage: (data: any) => void) {
    const token = localStorage.getItem('token');
    if (!token) return null;

    // Connect to the backend WebSocket server, not the Vite dev server
    const ws = new WebSocket(`ws://localhost:3000/ws/status?token=${encodeURIComponent(token)}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected to backend');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        onMessage(data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
    
    return ws;
  }
}

export const api = new ApiClient();