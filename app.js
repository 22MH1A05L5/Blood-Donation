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
    loadInitialData();
};

request.onupgradeneeded = (event) => {
    db = event.target.result;

    // Create object stores
    if (!db.objectStoreNames.contains('donors')) {
        const donorsStore = db.createObjectStore('donors', { keyPath: 'id', autoIncrement: true });
        donorsStore.createIndex('bloodGroup', 'bloodGroup', { unique: false });
        donorsStore.createIndex('email', 'email', { unique: true });
    }

    if (!db.objectStoreNames.contains('requests')) {
        const requestsStore = db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
        requestsStore.createIndex('bloodGroup', 'bloodGroup', { unique: false });
        requestsStore.createIndex('status', 'status', { unique: false });
    }

    if (!db.objectStoreNames.contains('inventory')) {
        db.createObjectStore('inventory', { keyPath: 'bloodGroup' });
    }

    if (!db.objectStoreNames.contains('contacts')) {
        db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
    }
};

// Load initial data
function loadInitialData() {
    updateStats();
    updateBloodStock();
    loadRecentDonors();
}

// Event Listeners
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
        });
    });

    // Search functionality
    const donorSearch = document.getElementById('donor-search');
    if (donorSearch) {
        donorSearch.addEventListener('input', debounce((e) => {
            searchDonors(e.target.value);
        }, 300));
    }
}

// Show/Hide Sections
function showSection(sectionId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
    }
}

// Handle Donor Registration
async function handleDonorForm(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const donorData = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        dob: formData.get('dob'),
        bloodGroup: formData.get('bloodGroup'),
        address: formData.get('address'),
        registrationDate: new Date().toISOString(),
        lastDonation: new Date().toISOString(),
        status: 'active'
    };

    try {
        await addDonor(donorData);
        await updateBloodInventory(donorData.bloodGroup, 1);
        showNotification('Thank you for registering as a donor!', 'success');
        event.target.reset();
        showSection('home');
        updateStats();
        updateBloodStock();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Handle Blood Request
async function handleRequestForm(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const requestData = {
        patientName: formData.get('patientName'),
        bloodGroup: formData.get('bloodGroup'),
        units: parseInt(formData.get('units')),
        hospital: formData.get('hospital'),
        urgency: formData.get('urgency'),
        reason: formData.get('reason'),
        requestDate: new Date().toISOString(),
        status: 'pending'
    };

    try {
        if (await checkBloodAvailability(requestData.bloodGroup, requestData.units)) {
            await addRequest(requestData);
            showNotification('Blood request submitted successfully!', 'success');
            event.target.reset();
            showSection('home');
        } else {
            showNotification('Required blood units not available', 'error');
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Handle Contact Form
async function handleContactForm(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const contactData = {
        name: formData.get('name'),
        email: formData.get('email'),
        message: formData.get('message'),
        date: new Date().toISOString()
    };

    try {
        await addContact(contactData);
        showNotification('Message sent successfully!', 'success');
        event.target.reset();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Database Operations
function addDonor(donorData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['donors'], 'readwrite');
        const store = transaction.objectStore('donors');

        const request = store.add(donorData);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function addRequest(requestData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['requests'], 'readwrite');
        const store = transaction.objectStore('requests');

        const request = store.add(requestData);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function addContact(contactData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['contacts'], 'readwrite');
        const store = transaction.objectStore('contacts');

        const request = store.add(contactData);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function updateBloodInventory(bloodGroup, units) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['inventory'], 'readwrite');
        const store = transaction.objectStore('inventory');

        const getRequest = store.get(bloodGroup);

        getRequest.onsuccess = () => {
            const data = getRequest.result || { bloodGroup, units: 0 };
            data.units += units;

            const putRequest = store.put(data);
            putRequest.onsuccess = () => resolve(putRequest.result);
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

function checkBloodAvailability(bloodGroup, units) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['inventory'], 'readonly');
        const store = transaction.objectStore('inventory');

        const request = store.get(bloodGroup);

        request.onsuccess = () => {
            const data = request.result;
            resolve(data && data.units >= units);
        };

        request.onerror = () => reject(request.error);
    });
}

// UI Updates
async function updateStats() {
    const transaction = db.transaction(['donors', 'inventory'], 'readonly');
    const donorsStore = transaction.objectStore('donors');
    const inventoryStore = transaction.objectStore('inventory');

    // Count total donors
    const donorCount = await new Promise((resolve) => {
        const request = donorsStore.count();
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

    // Update UI
    document.getElementById('total-donors').textContent = donorCount;
    document.getElementById('total-units').textContent = bloodUnits;
    document.getElementById('lives-saved').textContent = Math.floor(donorCount * 3);
}

async function updateBloodStock() {
    const grid = document.getElementById('blood-stock-grid');
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
            card.className = 'blood-type-card';
            card.innerHTML = `
                <h3>${group}</h3>
                <p>${item.units} units</p>
            `;
            grid.appendChild(card);
        });
    };
}

async function loadRecentDonors() {
    const tbody = document.getElementById('donors-table-body');
    if (!tbody) return;

    const transaction = db.transaction(['donors'], 'readonly');
    const store = transaction.objectStore('donors');
    const request = store.getAll();

    request.onsuccess = () => {
        const donors = request.result;
        tbody.innerHTML = '';

        donors.sort((a, b) => new Date(b.lastDonation) - new Date(a.lastDonation))
              .slice(0, 10)
              .forEach(donor => {
                  const tr = document.createElement('tr');
                  tr.innerHTML = `
                      <td class="mdl-data-table__cell--non-numeric">${donor.name}</td>
                      <td class="mdl-data-table__cell--non-numeric">${donor.bloodGroup}</td>
                      <td class="mdl-data-table__cell--non-numeric">${calculateAge(donor.dob)}</td>
                      <td class="mdl-data-table__cell--non-numeric">${donor.address}</td>
                      <td class="mdl-data-table__cell--non-numeric">${formatDate(donor.lastDonation)}</td>
                  `;
                  tbody.appendChild(tr);
              });
    };
}

async function searchDonors(searchTerm) {
    const tbody = document.getElementById('donors-table-body');
    if (!tbody) return;

    const transaction = db.transaction(['donors'], 'readonly');
    const store = transaction.objectStore('donors');
    const request = store.getAll();

    request.onsuccess = () => {
        const donors = request.result;
        const filtered = donors.filter(donor => 
            donor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            donor.bloodGroup.toLowerCase().includes(searchTerm.toLowerCase()) ||
            donor.address.toLowerCase().includes(searchTerm.toLowerCase())
        );

        tbody.innerHTML = '';
        filtered.forEach(donor => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="mdl-data-table__cell--non-numeric">${donor.name}</td>
                <td class="mdl-data-table__cell--non-numeric">${donor.bloodGroup}</td>
                <td class="mdl-data-table__cell--non-numeric">${calculateAge(donor.dob)}</td>
                <td class="mdl-data-table__cell--non-numeric">${donor.address}</td>
                <td class="mdl-data-table__cell--non-numeric">${formatDate(donor.lastDonation)}</td>
            `;
            tbody.appendChild(tr);
        });
    };
}

// Utility Functions
function calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

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