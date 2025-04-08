// Initialize IndexedDB
let db;
const dbName = "BloodBankDB";
const dbVersion = 1;

const request = indexedDB.open(dbName, dbVersion);

request.onerror = (event) => {
    console.error("Database error: " + event.target.error);
};

request.onsuccess = (event) => {
    db = event.target.result;
    console.log("Database opened successfully");
    checkAuth();
};

// Authentication
function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    // Simple authentication for demo
    if (username === 'admin' && password === 'admin123') {
        localStorage.setItem('adminAuth', 'true');
        showSection('dashboard');
        loadDashboard();
        document.getElementById('admin-name').textContent = username;
    } else {
        showNotification('Invalid credentials', 'error');
    }
}

function checkAuth() {
    const isAuth = localStorage.getItem('adminAuth') === 'true';
    if (!isAuth) {
        showSection('login');
    } else {
        showSection('dashboard');
        loadDashboard();
    }
}

function logout() {
    localStorage.removeItem('adminAuth');
    showSection('login');
}

// Navigation
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const section = this.getAttribute('href').substring(1);
            showSection(section);
            loadSectionData(section);
        });
    });

    // Logout
    document.getElementById('logout-button').addEventListener('click', logout);

    // Search functionality
    const donorSearch = document.getElementById('donor-search');
    if (donorSearch) {
        donorSearch.addEventListener('input', debounce((e) => {
            searchDonors(e.target.value);
        }, 300));
    }

    const requestSearch = document.getElementById('request-search');
    if (requestSearch) {
        requestSearch.addEventListener('input', debounce((e) => {
            searchRequests(e.target.value);
        }, 300));
    }
}

function showSection(sectionId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
    }
}

function loadSectionData(section) {
    switch (section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'donors':
            loadDonors();
            break;
        case 'requests':
            loadRequests();
            break;
        case 'inventory':
            loadInventory();
            break;
        case 'reports':
            loadReports();
            break;
    }
}

// Dashboard
async function loadDashboard() {
    updateDashboardStats();
    updateRecentActivity();
    updateBloodStock();
}

async function updateDashboardStats() {
    const transaction = db.transaction(['donors', 'requests', 'inventory'], 'readonly');
    const donorsStore = transaction.objectStore('donors');
    const requestsStore = transaction.objectStore('requests');
    const inventoryStore = transaction.objectStore('inventory');

    // Count total donors
    const donorCount = await new Promise((resolve) => {
        const request = donorsStore.count();
        request.onsuccess = () => resolve(request.result);
    });

    // Count pending requests
    const pendingRequests = await new Promise((resolve) => {
        const index = requestsStore.index('status');
        const request = index.count('pending');
        request.onsuccess = () => resolve(request.result);
    });

    // Calculate total blood units
    const bloodUnits = await new Promise((resolve) => {
        const request = inventoryStore.getAll();
        request.onsuccess = () => {
            const total = request.result.reduce((sum, item) => sum + item.units, 0);
            resolve(total);
        };
    });

    // Count today's donations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDonations = await new Promise((resolve) => {
        const request = donorsStore.getAll();
        request.onsuccess = () => {
            const count = request.result.filter(donor => {
                const donationDate = new Date(donor.lastDonation);
                return donationDate >= today;
            }).length;
            resolve(count);
        };
    });

    // Update UI
    document.getElementById('dashboard-donors').textContent = donorCount;
    document.getElementById('dashboard-units').textContent = bloodUnits;
    document.getElementById('dashboard-requests').textContent = pendingRequests;
    document.getElementById('dashboard-today').textContent = todayDonations;
}

async function updateRecentActivity() {
    const activityList = document.getElementById('activity-list');
    if (!activityList) return;

    const transaction = db.transaction(['donors', 'requests'], 'readonly');
    const donorsStore = transaction.objectStore('donors');
    const requestsStore = transaction.objectStore('requests');

    const [donors, requests] = await Promise.all([
        new Promise((resolve) => {
            const request = donorsStore.getAll();
            request.onsuccess = () => resolve(request.result);
        }),
        new Promise((resolve) => {
            const request = requestsStore.getAll();
            request.onsuccess = () => resolve(request.result);
        })
    ]);

    const activities = [
        ...donors.map(donor => ({
            type: 'donation',
            time: new Date(donor.registrationDate),
            text: `${donor.name} registered as a donor`
        })),
        ...requests.map(request => ({
            type: 'request',
            time: new Date(request.requestDate),
            text: `Blood request from ${request.patientName}`
        }))
    ];

    activities.sort((a, b) => b.time - a.time);

    activityList.innerHTML = activities.slice(0, 10).map(activity => `
        <li>
            <i class="material-icons activity-icon">
                ${activity.type === 'donation' ? 'favorite' : 'assignment'}
            </i>
            <span>${activity.text}</span>
            <span class="activity-time">${formatDate(activity.time)}</span>
        </li>
    `).join('');
}

// Donors Management
async function loadDonors() {
    const tbody = document.getElementById('donors-table');
    if (!tbody) return;

    const transaction = db.transaction(['donors'], 'readonly');
    const store = transaction.objectStore('donors');
    const request = store.getAll();

    request.onsuccess = () => {
        const donors = request.result;
        renderDonorsTable(donors);
    };
}

function renderDonorsTable(donors) {
    const tbody = document.getElementById('donors-table');
    tbody.innerHTML = donors.map(donor => `
        <tr>
            <td class="mdl-data-table__cell--non-numeric">${donor.name}</td>
            <td class="mdl-data-table__cell--non-numeric">${donor.bloodGroup}</td>
            <td class="mdl-data-table__cell--non-numeric">${donor.phone}<br>${donor.email}</td>
            <td class="mdl-data-table__cell--non-numeric">${formatDate(donor.lastDonation)}</td>
            <td class="mdl-data-table__cell--non-numeric">
                <span class="status-badge status-${donor.status.toLowerCase()}">${donor.status}</span>
            </td>
            <td class="mdl-data-table__cell--non-numeric">
                <button class="mdl-button mdl-js-button mdl-button--icon" onclick="editDonor(${donor.id})">
                    <i class="material-icons">edit</i>
                </button>
                <button class="mdl-button mdl-js-button mdl-button--icon" onclick="deleteDonor(${donor.id})">
                    <i class="material-icons">delete</i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function searchDonors(searchTerm) {
    const transaction = db.transaction(['donors'], 'readonly');
    const store = transaction.objectStore('donors');
    const request = store.getAll();

    request.onsuccess = () => {
        const donors = request.result;
        const filtered = donors.filter(donor => 
            donor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            donor.bloodGroup.toLowerCase().includes(searchTerm.toLowerCase()) ||
            donor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            donor.phone.includes(searchTerm)
        );
        renderDonorsTable(filtered);
    };
}

// Blood Requests Management
async function loadRequests() {
    const tbody = document.getElementById('requests-table');
    if (!tbody) return;

    const transaction = db.transaction(['requests'], 'readonly');
    const store = transaction.objectStore('requests');
    const request = store.getAll();

    request.onsuccess = () => {
        const requests = request.result;
        renderRequestsTable(requests);
    };
}

function renderRequestsTable(requests) {
    const tbody = document.getElementById('requests-table');
    tbody.innerHTML = requests.map(request => `
        <tr>
            <td class="mdl-data-table__cell--non-numeric">${request.patientName}</td>
            <td class="mdl-data-table__cell--non-numeric">${request.bloodGroup}</td>
            <td class="mdl-data-table__cell--non-numeric">${request.units}</td>
            <td class="mdl-data-table__cell--non-numeric">${request.hospital}</td>
            <td class="mdl-data-table__cell--non-numeric">
                <span class="status-badge status-${request.urgency}">${request.urgency}</span>
            </td>
            <td class="mdl-data-table__cell--non-numeric">
                <span class="status-badge status-${request.status.toLowerCase()}">${request.status}</span>
            </td>
            <td class="mdl-data-table__cell--non-numeric">
                <button class="mdl-button mdl-js-button mdl-button--icon" onclick="approveRequest(${request.id})">
                    <i class="material-icons">check</i>
                </button>
                <button class="mdl-button mdl-js-button mdl-button--icon" onclick="rejectRequest(${request.id})">
                    <i class="material-icons">close</i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function searchRequests(searchTerm) {
    const transaction = db.transaction(['requests'], 'readonly');
    const store = transaction.objectStore('requests');
    const request = store.getAll();

    request.onsuccess = () => {
        const requests = request.result;
        const filtered = requests.filter(request => 
            request.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            request.bloodGroup.toLowerCase().includes(searchTerm.toLowerCase()) ||
            request.hospital.toLowerCase().includes(searchTerm.toLowerCase())
        );
        renderRequestsTable(filtered);
    };
}

// Inventory Management
async function loadInventory() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;

    const transaction = db.transaction(['inventory'], 'readonly');
    const store = transaction.objectStore('inventory');
    const request = store.getAll();

    request.onsuccess = () => {
        const inventory = request.result;
        grid.innerHTML = '';

        const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
        bloodGroups.forEach(group => {
            const item = inventory.find(i => i.bloodGroup === group) || { units: 0 };
            const card = document.createElement('div');
            card.className = 'inventory-card';
            card.innerHTML = `
                <h3>${group}</h3>
                <div class="units">${item.units} units</div>
            `;
            grid.appendChild(card);
        });
    };
}

// Reports
async function loadReports() {
    const [donationData, distributionData] = await Promise.all([
        getDonationData(),
        getBloodDistributionData()
    ]);

    createDonationsChart(donationData);
    createDistributionChart(distributionData);
}

async function getDonationData() {
    const transaction = db.transaction(['donors'], 'readonly');
    const store = transaction.objectStore('donors');
    
    return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const donors = request.result;
            const last6Months = Array.from({length: 6}, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                return date.toLocaleString('default', { month: 'short' });
            }).reverse();

            const data = last6Months.map(month => {
                const count = donors.filter(donor => {
                    const donationDate = new Date(donor.lastDonation);
                    return donationDate.toLocaleString('default', { month: 'short' }) === month;
                }).length;
                return count;
            });

            resolve({
                labels: last6Months,
                data: data
            });
        };
    });
}

async function getBloodDistributionData() {
    const transaction = db.transaction(['inventory'], 'readonly');
    const store = transaction.objectStore('inventory');
    
    return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const inventory = request.result;
            const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
            const data = bloodGroups.map(group => {
                const item = inventory.find(i => i.bloodGroup === group);
                return item ? item.units : 0;
            });

            resolve({
                labels: bloodGroups,
                data: data
            });
        };
    });
}

function createDonationsChart(data) {
    const ctx = document.getElementById('donations-chart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Monthly Donations',
                data: data.data,
                borderColor: '#e53935',
                backgroundColor: 'rgba(229, 57, 53, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function createDistributionChart(data) {
    const ctx = document.getElementById('blood-distribution-chart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.labels,
            datasets: [{
                data: data.data,
                backgroundColor: [
                    '#e53935', '#d32f2f', '#c62828', '#b71c1c',
                    '#ef5350', '#e57373', '#ef9a9a', '#ffcdd2'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Utility Functions
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export Functions
function exportDonors() {
    const transaction = db.transaction(['donors'], 'readonly');
    const store = transaction.objectStore('donors');
    const request = store.getAll();

    request.onsuccess = () => {
        const donors = request.result;
        const csv = convertToCSV(donors);
        downloadCSV(csv, 'donors_data.csv');
    };
}

function convertToCSV(data) {
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(header => obj[header]));
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}