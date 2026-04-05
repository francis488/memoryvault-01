let db;
let allMemories = []; 
let currentCategory = 'All';

const request = indexedDB.open("VaultProDB", 12);

request.onupgradeneeded = (e) => {
    let dbUpdate = e.target.result;
    if (!dbUpdate.objectStoreNames.contains("memories")) {
        const store = dbUpdate.createObjectStore("memories", { keyPath: "id", autoIncrement: true });
        store.createIndex("userEmail", "userEmail", { unique: false });
    }
};

request.onsuccess = (e) => {
    db = e.target.result;
    requestPersistentStorage();
    renderGallery();
    updateStorageUI();
};

const getCurrentUser = () => JSON.parse(localStorage.getItem('currentUser'));

async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) { await navigator.storage.persist(); }
}

// NAVIGATION LOGIC UPDATED FOR DASHBOARD.HTML
document.addEventListener("DOMContentLoaded", () => {
    const user = getCurrentUser();
    if (user) {
        if(document.getElementById('welcomeMsg')) {
            document.getElementById('welcomeMsg').innerText = `Welcome, ${user.name}`;
        }
        if(document.getElementById('accountDisplay')) {
            document.getElementById('accountDisplay').innerText = user.email;
        }
    } else if (window.location.pathname.includes('dashboard.html')) {
        // If not logged in and trying to access dashboard, go to gateway (index.html)
        window.location.href = 'index.html';
    }
});

function logout() {
    localStorage.removeItem('currentUser');
    location.href = 'index.html'; // Redirect to gateway
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

function dataURLtoFile(dataurl, filename) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, {type:mime});
}

async function exportVault() {
    const user = getCurrentUser();
    const tx = db.transaction("memories", "readonly");
    const store = tx.objectStore("memories");
    const allRecords = [];
    store.openCursor().onsuccess = async (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const item = cursor.value;
            const processedItem = {...item};
            processedItem.images = await Promise.all(item.images.map(f => fileToBase64(f)));
            processedItem.videos = await Promise.all(item.videos.map(f => fileToBase64(f)));
            processedItem.audios = await Promise.all(item.audios.map(f => fileToBase64(f)));
            allRecords.push(processedItem);
            cursor.continue();
        } else {
            const blob = new Blob([JSON.stringify(allRecords)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `VaultBackup_${user.name}.json`;
            link.click();
        }
    };
}

async function importVault(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = JSON.parse(e.target.result);
        const tx = db.transaction("memories", "readwrite");
        const store = tx.objectStore("memories");
        for (let item of data) {
            item.images = item.images.map((s, i) => dataURLtoFile(s, `img_${i}`));
            item.videos = item.videos.map((s, i) => dataURLtoFile(s, `vid_${i}`));
            item.audios = item.audios.map((s, i) => dataURLtoFile(s, `aud_${i}`));
            delete item.id;
            store.add(item);
        }
        tx.oncomplete = () => location.reload();
    };
    reader.readAsText(file);
}

async function saveEntry() {
    const user = getCurrentUser();
    const title = document.getElementById('title').value;
    const desc = document.getElementById('desc').value;
    const category = document.getElementById('categorySelect').value;
    if (!title) return alert("Please enter a title!");
    const entry = {
        userEmail: user.email,
        title, desc, category,
        images: Array.from(document.getElementById('imageInput').files),
        videos: Array.from(document.getElementById('videoInput').files),
        audios: Array.from(document.getElementById('audioInput').files),
        timestamp: new Date().toLocaleString()
    };
    const tx = db.transaction("memories", "readwrite");
    tx.objectStore("memories").add(entry);
    tx.oncomplete = () => location.reload();
}

function renderGallery() {
    const user = getCurrentUser();
    if (!user || !db) return;
    allMemories = []; 
    const index = db.transaction("memories", "readonly").objectStore("memories").index("userEmail");
    index.openCursor(IDBKeyRange.only(user.email)).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { allMemories.push(cursor.value); cursor.continue(); }
        else { applyFilters(); }
    };
}

function applyFilters() {
    const query = document.getElementById('searchInput')?.value.toLowerCase() || "";
    const filtered = allMemories.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query);
        const matchesCat = (currentCategory === 'All') || (item.category === currentCategory);
        return matchesSearch && matchesCat;
    });
    displayItems(filtered);
}

function displayItems(items) {
    const gallery = document.getElementById('gallery');
    if (!gallery) return;
    gallery.innerHTML = '';
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        const visuals = [...item.images.map(f => ({file: f, type: 'img'})), ...item.videos.map(f => ({file: f, type: 'vid'}))];
        let html = `<div class="media-grid">`;
        visuals.slice(0, 2).forEach((media, idx) => {
            const url = URL.createObjectURL(media.file);
            const isMore = idx === 1 && visuals.length > 2;
            html += `<div class="media-box" onclick="openFullAlbum(${item.id})">
                ${media.type === 'img' ? `<img src="${url}">` : `<video src="${url}"></video>`}
                ${isMore ? `<div class="more-overlay">+${visuals.length - 2}</div>` : ''}
            </div>`;
        });
        if (visuals.length === 0) html += `<div style="grid-column: span 2; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:0.8rem;">No Visuals</div>`;
        html += `</div><div style="padding:20px;">
            <span class="category-badge">${item.category}</span>
            <h3 style="margin:8px 0; font-weight:900;">${item.title}</h3>
            <p style="color:#64748b; font-size:0.85rem; margin-bottom:15px;">${item.desc}</p>`;
        if (item.audios?.length > 0) html += `<div class="audio-track-item" onclick="openFullAlbum(${item.id})">🎵 ${item.audios.length} Audio Files</div>`;
        html += `<button onclick="deleteEntry(${item.id})" class="delete-link">Delete</button></div>`;
        card.innerHTML = html;
        gallery.prepend(card);
    });
}

function openFullAlbum(id) {
    const item = allMemories.find(m => m.id === id);
    const inner = document.getElementById('modalInner');
    inner.innerHTML = `<h2 style="color:white; margin-bottom:25px; font-weight:900;">${item.title}</h2>`;
    item.images.forEach(f => inner.innerHTML += `<img src="${URL.createObjectURL(f)}" class="modal-media-item">`);
    item.videos.forEach(f => inner.innerHTML += `<video src="${URL.createObjectURL(f)}" controls class="modal-media-item"></video>`);
    item.audios.forEach(f => inner.innerHTML += `<div class="audio-card"><audio src="${URL.createObjectURL(f)}" controls style="width:100%"></audio></div>`);
    document.getElementById('mediaModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('mediaModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function setFilter(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
}

function handleSearch() { applyFilters(); }

function deleteEntry(id) {
    if (confirm("Delete permanently?")) {
        const tx = db.transaction("memories", "readwrite");
        tx.objectStore("memories").delete(id);
        tx.oncomplete = () => { renderGallery(); updateStorageUI(); };
    }
}

async function updateStorageUI() {
    if (navigator.storage && navigator.storage.estimate) {
        const {usage, quota} = await navigator.storage.estimate();
        const percent = ((usage / quota) * 100).toFixed(1);
        const text = document.getElementById('storageText');
        const bar = document.getElementById('storageBar');
        if (text) text.innerText = `Used: ${(usage/1024/1024).toFixed(1)}MB / Total: ${(quota/1024/1024).toFixed(0)}MB (${percent}%)`;
        if (bar) bar.style.width = percent + "%";
    }
}

function togglePass(id, btn) {
    const el = document.getElementById(id);
    el.type = el.type === "password" ? "text" : "password";
    btn.innerText = el.type === "password" ? "👁️" : "🙈";
}