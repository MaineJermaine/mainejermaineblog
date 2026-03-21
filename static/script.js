let isOwner = false;
let currentFolder = '';
let currentPosts = [];   // all posts loaded so far
let currentPage  = 1;
let isLoadingPosts = false;
let hasMorePosts   = true;
let selectedMediaFiles = [];
let currentCollections = ['Main'];  // populated from profile on load

document.addEventListener('DOMContentLoaded', () => {
    checkStatus().then(() => {
        loadObsessions();
        loadReadingList();
        loadSongOfWeek();
    });
    loadPosts('');
    
    // Load notify preference
    const notifyPref = localStorage.getItem('notify_followers_pref');
    if (notifyPref !== null) {
        document.getElementById('notify-followers').checked = (notifyPref === 'true');
    }
    
    // Auto-resize textareas so you can view long text in its entirety
    document.body.addEventListener('input', function(e) {
        if (e.target.tagName.toLowerCase() === 'textarea') {
            e.target.style.height = 'auto'; // Reset first
            e.target.style.height = (e.target.scrollHeight) + 'px'; // Expand to scroll max
        }
    });
});

function handleMediaSelect(e) {
    for (let i = 0; i < e.target.files.length; i++) {
        selectedMediaFiles.push(e.target.files[i]);
    }
    e.target.value = '';
    renderMediaPreview();
}

function removeMedia(index) {
    selectedMediaFiles.splice(index, 1);
    renderMediaPreview();
}

function renderMediaPreview() {
    const previewContainer = document.getElementById('media-preview-container');
    previewContainer.innerHTML = '';
    
    if (selectedMediaFiles.length > 0) {
        previewContainer.classList.remove('hidden');
        selectedMediaFiles.forEach((file, index) => {
            const url = URL.createObjectURL(file);
            let mediaEl = '';
            if (file.type.startsWith('image/')) {
                mediaEl = `<img src="${url}" class="media-preview-item">`;
            } else if (file.type.startsWith('video/')) {
                mediaEl = `<video src="${url}" class="media-preview-item" controls></video>`;
            } else if (file.type.startsWith('audio/')) {
                mediaEl = `<audio src="${url}" controls style="width:100%"></audio>`;
            }
            previewContainer.innerHTML += `
                <div style="position:relative">
                    ${mediaEl}
                    <button type="button" onclick="removeMedia(${index})" style="position:absolute;top:5px;right:5px;background:#ff4444;color:white;border:none;border-radius:50%;width:25px;height:25px;cursor:pointer;font-weight:bold;z-index:10;">X</button>
                </div>
            `;
        });
    } else {
        previewContainer.classList.add('hidden');
    }
}

// Auth Status
async function checkStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        isOwner = data.is_owner;
        
        // Update Sidebar
        document.getElementById('side-username').innerText = data.username;
        document.getElementById('side-profile-pic').src = data.profile_pic;
        
        // Update Favicon to Custom One
        const favicon = document.getElementById('dynamic-favicon');
        if (favicon && data.favicon_url) favicon.href = data.favicon_url;

        document.getElementById('side-bio').innerText = data.bio || '';
        
        const linksContainer = document.getElementById('side-links');
        linksContainer.innerHTML = '';
        if (data.links && Array.isArray(data.links)) {
            data.links.forEach(link => {
                const a = document.createElement('a');
                a.href = link.url;
                a.innerText = link.platform;
                a.target = '_blank';
                linksContainer.appendChild(a);
            });
        }
        
        // Pre-fill edit inputs
        document.getElementById('edit-profile-username').value = data.username;
        document.getElementById('edit-profile-bio').value = data.bio || '';
        document.getElementById('edit-profile-collections').value = (data.collections || []).join(', ');
        
        let bgType = data.bg_type || 'preset';
        document.getElementById('edit-profile-bg-type').value = bgType;
        if (bgType === 'color') document.getElementById('edit-profile-bg-color').value = data.bg_val;
        updateBgMode();
        
        // Store collections for use in modals
        currentCollections = data.collections && data.collections.length > 0
            ? data.collections
            : ['Main'];

        applyBg(data.bg_type, data.bg_val);
        updateCollectionsUI(data.collections || []);
        renderEditLinks(data.links || []);

        // Spotify Widget
        if (data.spotify_url) {
            const iframe = document.getElementById('spotify-iframe');
            if (iframe) iframe.src = data.spotify_url;
            const spotifyInput = document.getElementById('edit-profile-spotify-url');
            if (spotifyInput) spotifyInput.value = data.spotify_url;
        }

        // Posts Count
        const postsCountEl = document.getElementById('posts-count');
        if (postsCountEl) postsCountEl.innerText = data.posts_count || 0;
        
        updateUI();
        // Reload sidebars now that isOwner is known
        loadObsessions();
        loadReadingList();
    } catch (e) {
        console.error(e);
    }
}

function updateUI() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const createSection = document.getElementById('create-post-section');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const followBtn = document.getElementById('follow-btn');
    
    if (isOwner) {
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        createSection.classList.remove('hidden');
        if(editProfileBtn) editProfileBtn.classList.remove('hidden');
        if(followBtn) followBtn.classList.remove('hidden');
        document.querySelectorAll('.owner-only').forEach(el => el.classList.remove('hidden'));
    } else {
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        createSection.classList.add('hidden');
        if(editProfileBtn) editProfileBtn.classList.add('hidden');
        if(followBtn) followBtn.classList.remove('hidden');
        document.querySelectorAll('.owner-only').forEach(el => el.classList.add('hidden'));
    }
    // Re-render feed to show/hide edit/delete buttons
    renderFeed();
}

function saveNotifyPreference() {
    const val = document.getElementById('notify-followers').checked;
    localStorage.setItem('notify_followers_pref', val);
}

// Login/Logout functionality
function toggleLogin() {
    const modal = document.getElementById('login-modal');
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        document.getElementById('login-password').focus();
    } else {
        modal.classList.add('hidden');
    }
}

async function login() {
    const pwdInput = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({password: pwdInput})
        });
        const data = await res.json();
        
        if (data.success) {
            isOwner = true;
            toggleLogin();
            updateUI();
            document.getElementById('login-password').value = '';
            errorMsg.innerText = '';
        } else {
            errorMsg.innerText = 'ACCESS DENIED';
        }
    } catch (e) {
        errorMsg.innerText = 'Network Error';
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    isOwner = false;
    updateUI();
}

// Follow Functions
function openFollowModal() {
    document.getElementById('follow-modal').classList.remove('hidden');
    document.getElementById('follow-msg').innerText = '';
    document.getElementById('follow-email').value = '';
}

function closeFollowModal() {
    document.getElementById('follow-modal').classList.add('hidden');
}

async function submitFollow() {
    const email = document.getElementById('follow-email').value;
    const msgEl = document.getElementById('follow-msg');
    const btn = document.querySelector('#follow-modal .submit-btn');
    
    if(!email) {
        msgEl.innerText = "Please enter an email.";
        return;
    }
    
    btn.disabled = true;
    btn.innerText = "Subscribing...";
    
    try {
        const res = await fetch('/api/follow', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email})
        });
        const data = await res.json();
        if(data.success) {
            closeFollowModal();
            alert("Thanks for following! We'll email you about new posts.");
        } else {
            msgEl.innerText = data.error || data.message || "Error following.";
        }
    } catch(e) {
        msgEl.innerText = "Network Error";
    } finally {
        btn.disabled = false;
        btn.innerText = "Follow";
    }
}

// Profile Editing
function openEditProfileModal() {
    document.getElementById('edit-profile-modal').classList.remove('hidden');
}

function closeEditProfileModal() {
    document.getElementById('edit-profile-modal').classList.add('hidden');
}

function previewEditPic(e) {
    const preview = document.getElementById('edit-pic-preview');
    if (e.target.files.length > 0) {
        preview.src = URL.createObjectURL(e.target.files[0]);
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
    }
}

function previewFavicon(e) {
    const preview = document.getElementById('edit-fav-preview');
    const favicon = document.getElementById('dynamic-favicon');
    if (e.target.files.length > 0) {
        const url = URL.createObjectURL(e.target.files[0]);
        preview.src = url;
        preview.classList.remove('hidden');
        if (favicon) favicon.href = url;
    } else {
        preview.classList.add('hidden');
    }
}

function updateBgMode() {
    const bgType = document.getElementById('edit-profile-bg-type').value;
    const colorInput = document.getElementById('edit-profile-bg-color');
    const mediaInput = document.getElementById('edit-profile-bg-media');
    
    colorInput.classList.add('hidden');
    mediaInput.classList.add('hidden');
    
    if (bgType === 'color') {
        colorInput.classList.remove('hidden');
    } else if (bgType === 'media') {
        mediaInput.classList.remove('hidden');
    }
}

function previewBgMedia(e) {
    const preview = document.getElementById('bg-media-preview');
    preview.innerHTML = '';
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const url = URL.createObjectURL(file);
        preview.classList.remove('hidden');
        if (file.type.startsWith('image/')) {
            preview.innerHTML = `<img src="${url}" class="media-preview-item">`;
        } else if (file.type.startsWith('video/')) {
            preview.innerHTML = `<video src="${url}" class="media-preview-item" controls></video>`;
        }
    } else {
        preview.classList.add('hidden');
    }
}

function renderEditLinks(links) {
    const container = document.getElementById('edit-links-container');
    container.innerHTML = '';
    links.forEach((link, i) => {
        container.insertAdjacentHTML('beforeend', `
            <div class="form-row" style="margin-bottom:5px" id="edit-link-row-${i}">
                <input type="text" placeholder="Name (e.g. Twitter)" value="${link.platform}" class="edit-link-name" style="margin-bottom:0">
                <input type="text" placeholder="https://" value="${link.url}" class="edit-link-url" style="margin-bottom:0">
                <button type="button" onclick="this.parentElement.remove()" style="background:#ff4444;border:none;border-radius:5px;color:white;padding:0 10px;cursor:pointer">X</button>
            </div>
        `);
    });
}

function addEditLink() {
    const i = Date.now();
    const container = document.getElementById('edit-links-container');
    container.insertAdjacentHTML('beforeend', `
        <div class="form-row" style="margin-bottom:5px" id="edit-link-row-${i}">
            <input type="text" placeholder="Name (e.g. Twitter)" class="edit-link-name" style="margin-bottom:0">
            <input type="text" placeholder="https://" class="edit-link-url" style="margin-bottom:0">
            <button type="button" onclick="this.parentElement.remove()" style="background:#ff4444;border:none;border-radius:5px;color:white;padding:0 10px;cursor:pointer">X</button>
        </div>
    `);
}

function applyBg(type, val) {
    const bgLayer = document.getElementById('bg-layer');
    if (!bgLayer) return;

    if (type === 'color') {
        bgLayer.style.background = val;
    } else if (type === 'media') {
        bgLayer.style.background = `url(${val}) no-repeat center center`;
        bgLayer.style.backgroundSize = 'cover';
    } else {
        bgLayer.style.background = ''; // revert to css preset
    }
}

function updateCollectionsUI(collections) {
    const filterContainer = document.getElementById('folder-filters');
    if (filterContainer) {
        filterContainer.innerHTML = `<button class="filter-btn active" onclick="loadPosts('')">All</button>`;
        collections.forEach(col => {
            filterContainer.innerHTML += `<button class="filter-btn" onclick="loadPosts('${col}')">${col}</button>`;
        });
        // Always keep the Forum button at the end
        filterContainer.innerHTML += `<button class="filter-btn forum-filter-btn" onclick="showForum()">📡 FORUM</button>`;
    }
    
    const postFolder = document.getElementById('post-folder');
    if (postFolder) {
        postFolder.innerHTML = '';
        collections.forEach(col => {
            postFolder.innerHTML += `<option value="${col}">${col}</option>`;
        });
    }
    
    const editPostFolder = document.getElementById('edit-post-folder');
    if (editPostFolder) {
        editPostFolder.innerHTML = '';
        collections.forEach(col => {
            editPostFolder.innerHTML += `<option value="${col}">${col}</option>`;
        });
    }
}

async function saveProfile() {
    const btn = document.querySelector('#edit-profile-modal .submit-btn');
    btn.innerText = 'SAVING...';
    btn.disabled = true;
    
    const formData = new FormData();
    formData.append('username', document.getElementById('edit-profile-username').value);
    formData.append('bio', document.getElementById('edit-profile-bio').value);
    
    // Process Collections
    let rawCols = document.getElementById('edit-profile-collections').value;
    let colArr = rawCols.split(',').map(c => c.trim()).filter(c => c);
    formData.append('collections', JSON.stringify(colArr));

    // Process Links
    const linkNames = document.querySelectorAll('.edit-link-name');
    const linkUrls = document.querySelectorAll('.edit-link-url');
    let linksArr = [];
    for(let i = 0; i < linkNames.length; i++) {
        const n = linkNames[i].value.trim();
        const u = linkUrls[i].value.trim();
        if(n && u) linksArr.push({platform: n, url: u});
    }
    formData.append('links', JSON.stringify(linksArr));
    formData.append('spotify_url', document.getElementById('edit-profile-spotify-url').value);

    // Process Background
    const bgType = document.getElementById('edit-profile-bg-type').value;
    formData.append('bg_type', bgType);
    if (bgType === 'color') {
        formData.append('bg_val', document.getElementById('edit-profile-bg-color').value);
    } else if (bgType === 'media') {
        const bgFile = document.getElementById('edit-profile-bg-media');
        if (bgFile.files.length > 0) {
            formData.append('bg_file', bgFile.files[0]);
        }
    } else {
        formData.append('bg_val', 'preset');
    }
    
    // Process Profile Pic File
    const fileInput = document.getElementById('edit-profile-pic-input');
    if (fileInput && fileInput.files.length > 0) {
        formData.append('profile_pic', fileInput.files[0]);
    }

    // Process Favicon File
    const favInput = document.getElementById('edit-favicon-input');
    if (favInput && favInput.files.length > 0) {
        formData.append('favicon', favInput.files[0]);
    }
    
    try {
        const res = await fetch('/api/profile', {
            method: 'PUT',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            closeEditProfileModal();
            checkStatus();
            loadPosts(currentFolder); // reload posts to update pics globally
        } else {
            document.getElementById('profile-error').innerText = 'Error saving profile';
        }
    } catch (e) {
        document.getElementById('profile-error').innerText = 'Network Error';
    } finally {
        btn.innerText = 'Save Profile';
        btn.disabled = false;
    }
}

// Load and Render Posts (infinite scroll)
async function loadPosts(folder = '', reset = true) {
    if (isLoadingPosts) return;
    currentFolder = folder;

    if (reset) {
        currentPage  = 1;
        currentPosts = [];
        hasMorePosts = true;
        document.getElementById('feed').innerHTML = '';
        removeScrollSentinel();
    }

    if (!hasMorePosts) return;

    isLoadingPosts = true;
    showScrollLoader(true);

    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((folder === '' && btn.innerText === 'All') ||
            btn.innerText.toLowerCase().includes(folder.toLowerCase()) && folder !== '') {
            btn.classList.add('active');
        }
    });

    try {
        const url = `/api/posts?page=${currentPage}&per_page=5${folder ? '&folder=' + folder : ''}`;
        const res  = await fetch(url);
        const data = await res.json();

        currentPosts = currentPosts.concat(data.posts);
        hasMorePosts  = data.has_more;
        currentPage++;

        appendPostsToFeed(data.posts);

        if (!hasMorePosts) {
            removeScrollSentinel();
            const btnCont = document.getElementById('load-more-container');
            if (btnCont) btnCont.classList.add('hidden');

            const feed = document.getElementById('feed');
            if (currentPosts.length > 0) {
                const endEl = document.createElement('div');
                endEl.id = 'feed-end-msg';
                endEl.style.cssText = 'text-align:center;color:var(--text-dim);padding:20px;font-size:0.85rem;';
                endEl.innerText = '— end of feed —';
                feed.appendChild(endEl);
            }
        } else if (window.innerWidth <= 768) {
            // Mobile: Show button
            const btnCont = document.getElementById('load-more-container');
            if (btnCont) btnCont.classList.remove('hidden');
        }
        if (currentPosts.length === 0 && !data.has_more) {
            document.getElementById('feed').innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:20px;">[ NO_DATA_FOUND ]</div>`;
        }
    } catch (e) {
        console.error(e);
    } finally {
        isLoadingPosts = false;
        showScrollLoader(false);
        // PC Auto-load: Attaching ONLY after isLoadingPosts is cleared 
        // ensures the observer doesn't skip the first intersection check.
        if (hasMorePosts && window.innerWidth > 768) {
            attachScrollSentinel();
        }
    }
}

function loadMorePosts() {
    const btnCont = document.getElementById('load-more-container');
    if (btnCont) btnCont.classList.add('hidden');
    loadPosts(currentFolder, false);
}

function showScrollLoader(show) {
    let el = document.getElementById('scroll-loader');
    if (!el) {
        el = document.createElement('div');
        el.id = 'scroll-loader';
        el.style.cssText = 'text-align:center;padding:15px;color:var(--accent-secondary);font-size:0.85rem;letter-spacing:2px;';
        el.innerText = 'loading...';
        document.getElementById('feed').after(el);
    }
    el.style.display = show ? 'block' : 'none';
}

let scrollSentinel = null;
function attachScrollSentinel() {
    removeScrollSentinel();
    scrollSentinel = document.createElement('div');
    scrollSentinel.id = 'scroll-sentinel';
    scrollSentinel.style.height = '10px';
    document.getElementById('feed').appendChild(scrollSentinel);

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoadingPosts && hasMorePosts) {
            loadPosts(currentFolder, false);
        }
    }, { rootMargin: '200px' });
    observer.observe(scrollSentinel);
    scrollSentinel._observer = observer;
}

function removeScrollSentinel() {
    if (scrollSentinel) {
        if (scrollSentinel._observer) scrollSentinel._observer.disconnect();
        scrollSentinel.remove();
        scrollSentinel = null;
    }
    const endMsg = document.getElementById('feed-end-msg');
    if (endMsg) endMsg.remove();
}

function appendPostsToFeed(posts) {
    const feed = document.getElementById('feed');

    posts.forEach(post => {
        const postEl = document.createElement('div');
        postEl.className = 'post';
        // Add fade-in animation
        postEl.style.cssText = 'opacity:0; transform:translateY(10px); transition: opacity 0.4s ease, transform 0.4s ease;';
        setTimeout(() => { postEl.style.opacity = '1'; postEl.style.transform = 'translateY(0)'; }, 50);
        
        // Media generation
        let mediaHtml = '';
        if (post.media && post.media.length > 0) {
            mediaHtml = `<div class="post-media-grid">`;
            post.media.forEach(m => {
                if (m.type === 'image') {
                    mediaHtml += `<img src="${m.url}" alt="Img" loading="lazy">`;
                } else if (m.type === 'video') {
                    mediaHtml += `<video controls src="${m.url}"></video>`;
                } else if (m.type === 'audio') {
                    mediaHtml += `<audio controls src="${m.url}"></audio>`;
                }
            });
            mediaHtml += `</div>`;
        }
        // Render Links & Embeds
        let embedHtml = '';
        if (post.links && Array.isArray(post.links)) {
            post.links.forEach(url => {
                // YouTube
                const ytMatch = url.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
                if (ytMatch && ytMatch[2].length === 11) {
                    const ytId = ytMatch[2];
                    embedHtml += `<div class="post-embed" style="margin-bottom:10px;"><iframe width="100%" height="315" src="https://www.youtube.com/embed/${ytId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius:5px;"></iframe></div>`;
                    return;
                }
                // Spotify — tracks, albums, playlists, artists, episodes
                // e.g. https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=...
                const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/);
                if (spotifyMatch) {
                    const spType = spotifyMatch[1];
                    const spId   = spotifyMatch[2];
                    // Tracks/episodes use compact height (152px); albums/playlists use taller (352px)
                    const spHeight = (spType === 'track' || spType === 'episode') ? '152' : '352';
                    embedHtml += `
                        <div class="post-embed" style="margin-bottom:10px;">
                            <iframe style="border-radius:12px;"
                                src="https://open.spotify.com/embed/${spType}/${spId}?utm_source=generator&theme=0"
                                width="100%" height="${spHeight}" frameborder="0"
                                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                loading="lazy"></iframe>
                        </div>`;
                    return;
                }
                // Generic link fallback
                embedHtml += `<div class="post-link" style="margin-bottom:10px;"><a href="${url}" target="_blank" style="color:var(--accent-secondary); text-decoration:underline; font-size:0.9rem;">🔗 ${url}</a></div>`;
            });
        }
        
        
        // Format for Singapore timezone
        const dateObj = new Date(post.created_at + 'Z');
        const dateStr = dateObj.toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
        
        let newTagHtml = '';
        const now = new Date();
        const diffDays = (now - dateObj) / (1000 * 60 * 60 * 24);
        
        let lastSeenId = parseInt(localStorage.getItem('viewerLastSeenPostId') || '0');
        const isNewest = currentPosts.length > 0 && post.id === currentPosts[0].id;
        
        if (isNewest && diffDays <= 1.0 && post.id > lastSeenId) {
            newTagHtml = `<span class="badge new-badge" data-post-id="${post.id}" style="background:var(--accent-primary); color:white; margin-left:10px; font-weight:bold; font-size:0.7rem; padding:2px 6px; border-radius:10px; display:inline-block; transition:opacity 1s; vertical-align:middle;">NEW</span>`;
        }
        
        // Private indicator (only visible to owner)
        const privateTag = post.is_private && isOwner
            ? `<span class="badge" style="background:#333; color:#ff8c00; border:1px solid #ff8c00;">🔒 PRIVATE</span>`
            : '';
        
        let tagsHtml = '';
        if (post.tags) {
            post.tags.split(',').forEach(t => {
                if(t.trim()) tagsHtml += `<span class="badge tag-badge">#${t.trim()}</span>`;
            });
        }
        
        const ownerActions = isOwner ? `
            <div class="owner-actions">
                <button class="owner-btn" onclick="openEditModal(${post.id})">[Edit]</button>
                <button class="owner-btn" style="color:#ff4444" onclick="deletePost(${post.id})">[Delete]</button>
            </div>
        ` : '';

        // Comments HTML
        const commentsCount = post.comments ? post.comments.length : 0;
        let commentsListHtml = '';
        if (post.comments) {
            post.comments.forEach(c => {
                // Ensure date formatting respects the backend string directly
                const cDate = new Date(c.created_at + 'Z').toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
                const delBtn = isOwner ? `<button class="comment-delete" onclick="deleteComment(${post.id}, ${c.id})">X</button>` : '';
                commentsListHtml += `
                    <div class="comment">
                        <div class="comment-author">${c.author}</div>
                        <div class="comment-content">${c.content}</div>
                        <div class="comment-time">${cDate}</div>
                        ${delBtn}
                    </div>
                `;
            });
        }

        postEl.innerHTML = `
            <div class="post-badges">
                <span class="badge">${post.folder.toUpperCase()}</span>
                ${privateTag}
                ${tagsHtml}
            </div>
            
            <div class="post-header">
                <img src="${post.profile_pic}" alt="DP" class="profile-pic">
                <div class="post-meta">
                    <div class="username">${post.username} <span class="verified-badge">✓</span></div>
                    <div class="time" style="display:flex; align-items:center;">${dateStr} ${newTagHtml}</div>
                </div>
            </div>
            
            ${post.title ? `<div class="post-title">${post.title}</div>` : ''}
            <div class="post-content">${post.content}</div>
            
            ${mediaHtml}
            ${embedHtml}
            
            <div class="post-actions">
                <button class="action-btn ${hasLiked(post.id) ? 'liked' : ''}" onclick="likePost(${post.id})">
                    ♥ <span id="likes-${post.id}">${post.likes}</span>
                </button>
                <button class="action-btn" onclick="toggleComments(${post.id})">
                    💬 <span id="comments-count-${post.id}">${commentsCount}</span>
                </button>
                ${ownerActions}
            </div>

            <div id="comments-section-${post.id}" class="comments-section">
                <div id="comments-list-${post.id}">
                    ${commentsListHtml}
                </div>
                <div class="add-comment-form">
                    <input type="text" id="comment-input-${post.id}" placeholder="Write a comment..." onkeydown="if(event.key==='Enter') prepareComment(${post.id})">
                    <button class="add-comment-btn" onclick="prepareComment(${post.id})">POST</button>
                </div>
            </div>
        `;
        
        feed.appendChild(postEl);
    });
    
    // Setup observer for new badges
    const newBadges = document.querySelectorAll('.new-badge');
    if (newBadges.length > 0 && typeof IntersectionObserver !== 'undefined') {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const badge = entry.target;
                    const pid = parseInt(badge.getAttribute('data-post-id'));
                    let lastSeen = parseInt(localStorage.getItem('viewerLastSeenPostId') || '0');
                    if (pid > lastSeen) localStorage.setItem('viewerLastSeenPostId', pid);
                    setTimeout(() => { badge.style.opacity = '0'; setTimeout(() => badge.remove(), 1000); }, 3000);
                    observer.unobserve(badge);
                }
            });
        }, { threshold: 0.1 });
        newBadges.forEach(b => observer.observe(b));
    }
}

// Keep old renderFeed as an alias so other callers don't break
function renderFeed() {
    document.getElementById('feed').innerHTML = '';
    appendPostsToFeed(currentPosts);
}

// Create Post
async function submitPost() {
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    const folder = document.getElementById('post-folder').value;
    const tags = document.getElementById('post-tags').value;
    const isPrivate = document.getElementById('post-visibility').value === 'private';
    const fileInput = document.getElementById('post-media');
    
    if (!content.trim() && selectedMediaFiles.length === 0) {
        showToast("Content or media is required.");
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('folder', folder);
    formData.append('tags', tags);
    formData.append('links', JSON.stringify(postLinks));
    formData.append('is_private', isPrivate.toString());
    formData.append('notify_followers', document.getElementById('notify-followers').checked);
    
    for (let i = 0; i < selectedMediaFiles.length; i++) {
        formData.append('media', selectedMediaFiles[i]);
    }

    const btn = document.querySelector('.create-card .submit-btn');
    btn.innerText = 'U P L O A D I N G . . .';
    btn.disabled = true;

    try {
        const res = await fetch('/api/posts', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(">>> ENTRY BROADCASTED SUCCESSFULLY <<<");
            // reset form
            document.getElementById('post-title').value = '';
            document.getElementById('post-content').value = '';
            document.getElementById('post-tags').value = '';
            fileInput.value = '';
            selectedMediaFiles = [];
            let fileCountEl = document.getElementById('file-count');
            if(fileCountEl) fileCountEl.innerText = '0 files selected';
            document.getElementById('media-preview-container').innerHTML = '';
            document.getElementById('media-preview-container').classList.add('hidden');
            
            postLinks = [];
            renderPostLinks();
            
            loadPosts(currentFolder);
        } else {
            showToast("ERR: " + data.error);
        }
    } catch (e) {
        console.error(e);
        showToast("ERR: BROADCAST FAILED");
    } finally {
        btn.innerText = '>> B O A R D C A S T <<';
        btn.disabled = false;
    }
}

// Edit / Delete post
function deletePost(id) {
    if (confirm("Initiate deletion protocol?")) {
        fetch(`/api/posts/${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                if(data.success) loadPosts(currentFolder);
            });
    }
}

function openEditModal(id) {
    const post = currentPosts.find(p => p.id === id);
    if (!post) return;
    
    document.getElementById('edit-post-id').value = id;
    document.getElementById('edit-post-title').value = post.title || '';
    document.getElementById('edit-post-content').value = post.content || '';
    document.getElementById('edit-post-folder').value = post.folder || 'main';
    document.getElementById('edit-post-tags').value = post.tags || '';
    
    document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

async function saveEdit() {
    const id = document.getElementById('edit-post-id').value;
    const data = {
        title: document.getElementById('edit-post-title').value,
        content: document.getElementById('edit-post-content').value,
        folder: document.getElementById('edit-post-folder').value,
        tags: document.getElementById('edit-post-tags').value
    };
    
    try {
        const res = await fetch(`/api/posts/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            closeEditModal();
            loadPosts(currentFolder);
        }
    } catch (e) {
        console.error(e);
    }
}

// Like functionality
function likePost(id) {
    fetch(`/api/posts/${id}/like`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                document.getElementById(`likes-${id}`).innerText = data.likes;
                const p = currentPosts.find(x => x.id === id);
                if (p) p.likes = data.likes;
            }
        });
}

// Comments functionality
function toggleComments(id) {
    const section = document.getElementById(`comments-section-${id}`);
    if (section.classList.contains('active')) {
        section.classList.remove('active');
    } else {
        section.classList.add('active');
    }
}

// Viewer Name Modal logic
let pendingCommentData = null;

function prepareComment(postId) {
    const inputEl = document.getElementById(`comment-input-${postId}`);
    const content = inputEl.value.trim();
    if (!content) return;
    
    if (isOwner) {
        // Owner doesn't need to specify name
        submitComment(postId, content, 'Owner');
        inputEl.value = '';
        return;
    }
    
    let savedName = localStorage.getItem('viewer_name');
    if (savedName) {
        submitComment(postId, content, savedName);
        inputEl.value = '';
    } else {
        // Request viewer name
        pendingCommentData = { postId, content, inputEl };
        document.getElementById('viewer-name-modal').classList.remove('hidden');
        document.getElementById('viewer-name-input').focus();
    }
}

function closeViewerNameModal() {
    document.getElementById('viewer-name-modal').classList.add('hidden');
    pendingCommentData = null;
}

function saveViewerNameAndComment() {
    const name = document.getElementById('viewer-name-input').value.trim();
    if (!name) {
        alert("Name is required to comment.");
        return;
    }
    localStorage.setItem('viewer_name', name);
    closeViewerNameModal();
    
    if (pendingCommentData) {
        submitComment(pendingCommentData.postId, pendingCommentData.content, name);
        pendingCommentData.inputEl.value = '';
        pendingCommentData = null;
    }
}

async function submitComment(postId, content, author) {
    try {
        const res = await fetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ author, content })
        });
        const data = await res.json();
        
        if (data.success) {
            const listEl = document.getElementById(`comments-list-${postId}`);
            const delBtn = isOwner ? `<button class="comment-delete" onclick="deleteComment(${postId}, ${data.comment_id})">X</button>` : '';
            const newCommentHtml = `
                <div class="comment">
                    <div class="comment-author">${data.author}</div>
                    <div class="comment-content">${data.content}</div>
                    <div class="comment-time">${new Date(data.created_at).toLocaleString()}</div>
                    ${delBtn}
                </div>
            `;
            listEl.insertAdjacentHTML('beforeend', newCommentHtml);
            
            // update count
            const p = currentPosts.find(x => x.id === postId);
            if (p) {
                if(!p.comments) p.comments = [];
                p.comments.push(data);
                document.getElementById(`comments-count-${postId}`).innerText = p.comments.length;
            }
        }
    } catch(e) {
        console.error(e);
    }
}

function deleteComment(postId, commentId) {
    if(!confirm("Erase this comment?")) return;
    
        fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // simple refresh
                loadPosts(currentFolder);
            }
        });
}

// Right Sidebar Logic (Obsessions & Reading)
async function loadObsessions() {
    try {
        const res = await fetch('/api/obsessions');
        const data = await res.json();
        const list = document.getElementById('obsessions-list');
        list.innerHTML = '';
        if (data.length === 0) {
            list.innerHTML = '<div style="color:var(--text-dim); font-size:0.8rem;">Nothing yet!</div>';
            return;
        }
        data.forEach(item => {
            const ownerBtns = isOwner ? `
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <button class="sidebar-del-btn" onclick="openEditObsession(${item.id}, '${item.category.replace(/'/g,"\\'")}',' ${item.content.replace(/'/g,"\\'")}')">✏</button>
                    <button class="sidebar-del-btn" style="color:#ff4444;" onclick="deleteObsession(${item.id})">✕</button>
                </div>` : '';
            const imgHtml = item.image_url ? `<img src="${item.image_url}" alt="Obsession" style="width:100%; margin-top:5px; border-radius:5px; display:block;">` : '';
            list.innerHTML += `
                <div class="obs-item">
                    ${ownerBtns}
                    <div class="obs-category">${item.category}:</div>
                    <div>${item.content}</div>
                    ${imgHtml}
                </div>
            `;
        });
    } catch(e) { console.error("OBS LOAD ERR:", e); }
}

async function loadReadingList() {
    try {
        const res = await fetch('/api/reading');
        const data = await res.json();
        const list = document.getElementById('reading-list');
        list.innerHTML = '';
        if (data.length === 0) {
            list.innerHTML = '<div style="color:var(--text-dim); font-size:0.8rem;">Nothing yet!</div>';
            return;
        }
        data.forEach(item => {
            const ownerBtns = isOwner ? `
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <button class="sidebar-del-btn" onclick="openEditReading(${item.id},'${item.title.replace(/'/g,"\\'")}','${(item.description||'').replace(/'/g,"\\'")}','${(item.app_used||'').replace(/'/g,"\\'")}','${(item.link||'').replace(/'/g,"\\'")}')">✏</button>
                    <button class="sidebar-del-btn" style="color:#ff4444;" onclick="deleteReading(${item.id})">✕</button>
                </div>` : '';
            const imgHtml = item.cover_image ? `<img src="${item.cover_image}" class="read-cover">` : '';
            const linkHtml = item.link ? `<a href="${item.link}" target="_blank" style="color:var(--accent-secondary);font-size:0.8rem;">[Read Here]</a>` : '';
            list.innerHTML += `
                <div class="read-item">
                    ${ownerBtns}
                    ${imgHtml}
                    <div class="read-title">${item.title}</div>
                    <div style="font-size:0.8rem; margin-bottom:5px; color:var(--text-dim);">${item.description}</div>
                    <div style="font-size:0.8rem; color:var(--accent-primary);">App: ${item.app_used} ${linkHtml}</div>
                </div>
            `;
        });
    } catch(e) { console.error("READ LOAD ERR:", e); }
}

async function submitObsession() {
    const category = document.getElementById('obs-category').value;
    const content = document.getElementById('obs-content').value;
    const imgInput = document.getElementById('obs-image');
    if(!category || !content) {
        showToast("Category and content are required.");
        return;
    }
    const fd = new FormData();
    fd.append('category', category);
    fd.append('content', content);
    if(imgInput.files[0]) fd.append('image', imgInput.files[0]);

    try {
        await fetch('/api/obsessions', {
            method: 'POST',
            body: fd
        });
        closeModal('add-obsession-modal');
        document.getElementById('obs-category').value = '';
        document.getElementById('obs-content').value = '';
        imgInput.value = '';
        showToast("Obsession Captured.");
        loadObsessions();
    } catch(e) {}
}

async function deleteObsession(id) {
    showConfirm('Delete this obsession?', async () => {
        await fetch('/api/obsessions/' + id, {method: 'DELETE'});
        showToast("Deleted.");
        loadObsessions();
    });
}

function openEditObsession(id, category, content) {
    document.getElementById('edit-obs-id').value = id;
    document.getElementById('edit-obs-category').value = category.trim();
    document.getElementById('edit-obs-content').value = content.trim();
    document.getElementById('edit-obs-image').value = '';
    openModal('edit-obsession-modal');
}

async function saveEditedObsession() {
    const id = document.getElementById('edit-obs-id').value;
    const fd = new FormData();
    fd.append('category', document.getElementById('edit-obs-category').value);
    fd.append('content', document.getElementById('edit-obs-content').value);
    const imgFile = document.getElementById('edit-obs-image').files[0];
    if(imgFile) fd.append('image', imgFile);
    try {
        const res = await fetch('/api/obsessions/' + id, {method: 'PUT', body: fd});
        const data = await res.json();
        if(data.success) {
            showToast("Obsession updated!");
            closeModal('edit-obsession-modal');
            loadObsessions();
        }
    } catch(e) { showToast("Update failed."); }
}

function openEditReading(id, title, description, app_used, link) {
    document.getElementById('edit-read-id').value = id;
    document.getElementById('edit-read-title').value = title;
    document.getElementById('edit-read-desc').value = description;
    document.getElementById('edit-read-app').value = app_used;
    document.getElementById('edit-read-link').value = link;
    document.getElementById('edit-read-cover').value = '';
    openModal('edit-reading-modal');
}

async function saveEditedReading() {
    const id = document.getElementById('edit-read-id').value;
    const fd = new FormData();
    fd.append('title', document.getElementById('edit-read-title').value);
    fd.append('description', document.getElementById('edit-read-desc').value);
    fd.append('app_used', document.getElementById('edit-read-app').value);
    fd.append('link', document.getElementById('edit-read-link').value);
    const coverFile = document.getElementById('edit-read-cover').files[0];
    if(coverFile) fd.append('cover_image', coverFile);
    try {
        const res = await fetch('/api/reading/' + id, {method: 'PUT', body: fd});
        const data = await res.json();
        if(data.success) {
            showToast("Reading item updated!");
            closeModal('edit-reading-modal');
            loadReadingList();
        }
    } catch(e) { showToast("Update failed."); }
}

async function deleteReading(id) {
    showConfirm('Delete this reading item?', async () => {
        await fetch('/api/reading/' + id, {method: 'DELETE'});
        showToast("Deleted.");
        loadReadingList();
    });
}

async function submitReading() {
    const title = document.getElementById('read-title').value;
    const desc = document.getElementById('read-desc').value;
    const app_used = document.getElementById('read-app').value;
    const link = document.getElementById('read-link').value;
    const fileInput = document.getElementById('read-cover');
    
    if(!title) { showToast("Title is required."); return; }
    const fd = new FormData();
    fd.append('title', title);
    fd.append('description', desc);
    fd.append('app_used', app_used);
    fd.append('link', link);
    if(fileInput.files[0]) fd.append('cover_image', fileInput.files[0]);
    
    try {
        await fetch('/api/reading', {method: 'POST', body: fd});
        closeModal('add-reading-modal');
        document.getElementById('read-title').value = '';
        document.getElementById('read-desc').value = '';
        document.getElementById('read-app').value = '';
        document.getElementById('read-link').value = '';
        document.getElementById('read-cover').value = '';
        showToast("Reading item added!");
        loadReadingList();
    } catch(e) { showToast("Failed to save."); }
}


// Song of the Week Logic

async function loadSongOfWeek() {
    try {
        const res = await fetch('/api/song-of-week');
        const song = await res.json();
        const section = document.getElementById('song-of-week-section');
        const container = document.getElementById('song-of-week-container');
        
        if (!song) {
            section.classList.add('hidden');
            return;
        }
        
        section.classList.remove('hidden');
        
        // Spotify detection
        const url = song.spotify_url;
        const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/);
        let spotifyEmbed = '';
        if (spotifyMatch) {
            const spType = spotifyMatch[1];
            const spId   = spotifyMatch[2];
            spotifyEmbed = `
                <iframe style="border-radius:12px;" 
                    src="https://open.spotify.com/embed/${spType}/${spId}?utm_source=generator&theme=0" 
                    width="100%" height="152" frameborder="0" 
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                    loading="lazy"></iframe>`;
        } else {
            spotifyEmbed = `<div style="padding:10px; background:rgba(255,255,255,0.05); border-radius:5px; font-size:0.8rem;">[ Invalid Spotify URL ]</div>`;
        }
        
        const ownerBtns = isOwner ? `
            <div style="display:flex; gap:5px; margin-bottom:10px;">
                <button class="sidebar-del-btn" onclick="openEditSong(${song.id}, '${song.spotify_url.replace(/'/g,"\\'")}',' ${ (song.description||'').replace(/'/g,"\\'") }')">✏</button>
                <button class="sidebar-del-btn" style="color:#ff4444;" onclick="deleteSong(${song.id})">✕</button>
            </div>` : '';
            
        container.innerHTML = `
            ${ownerBtns}
            ${spotifyEmbed}
            ${song.description ? `<div style="font-size:0.8rem; margin-top:10px; color:var(--text-dim); line-height:1.4;">${song.description}</div>` : ''}
        `;
    } catch(e) { console.error("SONG LOAD ERR:", e); }
}

async function submitSongOfWeek() {
    const spotify_url = document.getElementById('song-spotify-url').value;
    const description = document.getElementById('song-description').value;
    if(!spotify_url) { showToast("Spotify URL is required."); return; }
    
    try {
        await fetch('/api/song-of-week', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ spotify_url, description })
        });
        closeModal('add-song-modal');
        document.getElementById('song-spotify-url').value = '';
        document.getElementById('song-description').value = '';
        showToast("Song of the Week Updated.");
        loadSongOfWeek();
    } catch(e) { showToast("Failed to set song."); }
}

function openEditSong(id, url, desc) {
    document.getElementById('edit-song-id').value = id;
    document.getElementById('edit-song-spotify-url').value = url;
    document.getElementById('edit-song-description').value = desc.trim();
    openModal('edit-song-modal');
}

async function saveEditedSong() {
    const id = document.getElementById('edit-song-id').value;
    const spotify_url = document.getElementById('edit-song-spotify-url').value;
    const description = document.getElementById('edit-song-description').value;
    
    try {
        const res = await fetch('/api/song-of-week/' + id, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ spotify_url, description })
        });
        const data = await res.json();
        if(data.success) {
            showToast("Song updated!");
            closeModal('edit-song-modal');
            loadSongOfWeek();
        }
    } catch(e) { showToast("Update failed."); }
}

async function deleteSong(id) {
    showConfirm('Remove Song of the Week?', async () => {
        await fetch('/api/song-of-week/' + id, {method: 'DELETE'});
        showToast("Removed.");
        loadSongOfWeek();
    });
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Post Links Logic
let postLinks = [];
function addPostLink() {
    const url = prompt("Enter link URL:");
    if(url && url.trim()) {
        postLinks.push(url.trim());
        renderPostLinks();
    }
}
function removePostLink(idx) {
    postLinks.splice(idx, 1);
    renderPostLinks();
}
function renderPostLinks() {
    const container = document.getElementById('post-links-container');
    if(!container) return;
    container.innerHTML = '';
    postLinks.forEach((link, i) => {
        container.innerHTML += `
            <div style="background:rgba(0,0,0,0.5); padding:8px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border-color); border-radius:5px;">
                <a href="${link}" target="_blank" style="color:var(--accent-secondary); font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:85%;">${link}</a>
                <button type="button" onclick="removePostLink(${i})" style="background:#ff4444; color:white; border:none; border-radius:3px; cursor:pointer; padding:3px 8px;">X</button>
            </div>
        `;
    });
}

// Tag Suggestions Logic (Enhanced for multiple inputs)
function showTagSuggestions(inputId = 'post-tags', suggestionsId = 'tag-suggestions') {
    const input = document.getElementById(inputId);
    const container = document.getElementById(suggestionsId);
    if(!input || !container) return;
    
    const allTags = new Set();
    currentPosts.forEach(p => {
        if(p.tags) {
            p.tags.split(',').forEach(t => {
                const tagStr = t.trim();
                if(tagStr) allTags.add(tagStr);
            });
        }
    });
    
    const val = input.value;
    const parts = val.split(',');
    const activePart = parts[parts.length - 1].trim().toLowerCase();
    
    let suggestionsHtml = '';
    Array.from(allTags).forEach(tag => {
        if (!activePart || tag.toLowerCase().includes(activePart)) {
            suggestionsHtml += `<div class="dropdown-item" onclick="addTag('${tag}', '${inputId}', '${suggestionsId}')" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; color: var(--text-main);">#${tag}</div>`;
        }
    });
    
    if(suggestionsHtml) {
        container.innerHTML = suggestionsHtml;
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

function addTag(tag, inputId = 'post-tags', suggestionsId = 'tag-suggestions') {
    const input = document.getElementById(inputId);
    let parts = input.value.split(',');
    parts.pop(); // Remove the partial text
    if (parts.length > 0) {
        input.value = parts.join(', ') + ', ' + tag + ', ';
    } else {
        input.value = tag + ', ';
    }
    document.getElementById(suggestionsId).classList.add('hidden');
    input.focus();
}

// Global UI Interceptors
function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 1000);
    }, 4000);
}

function showConfirm(msg, onYes) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-msg').innerText = msg;
    const yesBtn = document.getElementById('confirm-yes-btn');
    
    // Clear old listeners
    const newYes = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYes, yesBtn);
    
    newYes.addEventListener('click', () => {
        onYes();
        closeModal('confirm-modal');
    });
    
    openModal('confirm-modal');
}

// Edit Modal Parity Logic
let editPostLinks = [];
let editSelectedMediaFiles = [];

function handleEditMediaSelect(e) {
    for (let i = 0; i < e.target.files.length; i++) {
        editSelectedMediaFiles.push(e.target.files[i]);
    }
    e.target.value = '';
    renderEditMediaPreview();
}

function removeEditMedia(index) {
    editSelectedMediaFiles.splice(index, 1);
    renderEditMediaPreview();
}

function renderEditMediaPreview() {
    const previewContainer = document.getElementById('edit-media-preview-container');
    const fileCountEl = document.getElementById('edit-file-count');
    if(!previewContainer || !fileCountEl) return;
    previewContainer.innerHTML = '';
    
    fileCountEl.innerText = `${editSelectedMediaFiles.length} files selected`;
    
    if (editSelectedMediaFiles.length > 0) {
        previewContainer.classList.remove('hidden');
        editSelectedMediaFiles.forEach((file, index) => {
            const url = URL.createObjectURL(file);
            let mediaEl = '';
            if (file.type.startsWith('image/')) {
                mediaEl = `<img src="${url}" class="media-preview-item">`;
            } else if (file.type.startsWith('video/')) {
                mediaEl = `<video src="${url}" class="media-preview-item" controls></video>`;
            } else if (file.type.startsWith('audio/')) {
                mediaEl = `<audio src="${url}" controls style="width:100%"></audio>`;
            }
            previewContainer.innerHTML += `
                <div style="position:relative">
                    ${mediaEl}
                    <button type="button" onclick="removeEditMedia(${index})" style="position:absolute;top:5px;right:5px;background:#ff4444;color:white;border:none;border-radius:50%;width:25px;height:25px;cursor:pointer;font-weight:bold;z-index:10;">X</button>
                </div>
            `;
        });
    } else {
        previewContainer.classList.add('hidden');
    }
}

function openEditModal(pid) {
    const post = currentPosts.find(p => p.id === pid);
    if(!post) return;
    
    document.getElementById('edit-post-id').value = pid;
    document.getElementById('edit-post-title').value = post.title || '';
    document.getElementById('edit-post-content').value = post.content || '';
    document.getElementById('edit-post-tags').value = post.tags || '';
    
    // Populate folder dropdown from live collections
    const folderSelect = document.getElementById('edit-post-folder');
    folderSelect.innerHTML = '';
    currentCollections.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = c;
        if (c.toLowerCase() === (post.folder || '').toLowerCase()) opt.selected = true;
        folderSelect.appendChild(opt);
    });
    // If current folder isn't in collections (e.g. old post), add it
    if (post.folder && !currentCollections.some(c => c.toLowerCase() === post.folder.toLowerCase())) {
        const opt = document.createElement('option');
        opt.value = post.folder;
        opt.innerText = post.folder;
        opt.selected = true;
        folderSelect.prepend(opt);
    }
    
    editPostLinks = post.links ? [...post.links] : [];
    renderEditPostLinks();
    
    // Restore visibility toggle
    const visEl = document.getElementById('edit-post-visibility');
    if (visEl) visEl.value = post.is_private ? 'private' : 'public';
    
    editSelectedMediaFiles = [];
    renderEditMediaPreview();
    
    openModal('edit-post-modal');
}

function addEditPostLink() {
    const url = prompt("Enter link (YouTube allowed):");
    if(url && url.trim()) {
        editPostLinks.push(url.trim());
        renderEditPostLinks();
    }
}

function removeEditPostLink(idx) {
    editPostLinks.splice(idx, 1);
    renderEditPostLinks();
}

function renderEditPostLinks() {
    const container = document.getElementById('edit-post-links-container');
    if(!container) return;
    container.innerHTML = '';
    editPostLinks.forEach((link, i) => {
        container.innerHTML += `
            <div style="background:rgba(0,0,0,0.5); padding:8px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border-color); border-radius:5px;">
                <span style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:85%;">${link}</span>
                <button type="button" onclick="removeEditPostLink(${i})" style="background:#ff4444; color:#fff; border:none; padding:2px 6px; border-radius:3px; cursor:pointer;">X</button>
            </div>
        `;
    });
}

async function saveEditedPost() {
    const id = document.getElementById('edit-post-id').value;
    const fd = new FormData();
    fd.append('title', document.getElementById('edit-post-title').value);
    fd.append('content', document.getElementById('edit-post-content').value);
    fd.append('folder', document.getElementById('edit-post-folder').value);
    fd.append('tags', document.getElementById('edit-post-tags').value);
    fd.append('links', JSON.stringify(editPostLinks));
    fd.append('is_private', (document.getElementById('edit-post-visibility').value === 'private').toString());
    
    editSelectedMediaFiles.forEach(file => {
        fd.append('media', file);
    });
    
    try {
        const res = await fetch(`/api/posts/${id}`, {
            method: 'PUT',
            body: fd
        });
        const data = await res.json();
        if(data.success) {
            showToast(">>> ENTRY RE-CALIBRATED <<<");
            closeModal('edit-post-modal');
            editSelectedMediaFiles = [];
            renderEditMediaPreview();
            loadPosts(currentFolder);
        } else {
            showToast("ERR: " + data.error);
        }
    } catch(e) { showToast("ERR: UPDATE FAILED"); }
}

async function deletePost(id) {
    showConfirm("ERASE THIS MEMORY?", async () => {
        await fetch(`/api/posts/${id}`, { method: 'DELETE' });
        showToast("MEMORY PURGED.");
        loadPosts(currentFolder);
    });
}

document.addEventListener('click', (e) => {
    if(!e.target.closest('#post-tags') && !e.target.closest('#tag-suggestions')) {
        const c = document.getElementById('tag-suggestions');
        if(c) c.classList.add('hidden');
    }
});

function toggleNavbar(hide) {
    const nav = document.querySelector('.navbar');
    const toggle = document.getElementById('nav-toggle');
    if (hide) {
        nav.classList.add('collapsed');
        toggle.classList.remove('hidden');
    } else {
        nav.classList.remove('collapsed');
        toggle.classList.add('hidden');
    }
}

function toggleBio() {
    const bio = document.getElementById('side-bio');
    const btn = document.getElementById('toggle-bio-btn');
    if (bio.classList.contains('expanded')) {
        bio.classList.remove('expanded');
        btn.innerText = 'Show More';
    } else {
        bio.classList.add('expanded');
        btn.innerText = 'Show Less';
    }
}

// --- FORUM LOGIC ---
let isForumMode = false;
let forumPage = 1;

function showForum() {
    isForumMode = true;
    document.getElementById('feed').innerHTML = '';
    document.getElementById('create-post-section').classList.add('hidden');
    if (isOwner) document.getElementById('forum-create-section').classList.remove('hidden');
    
    // Active style
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const forumBtn = document.querySelector('.forum-filter-btn');
    if (forumBtn) forumBtn.classList.add('active');
    
    loadForumPosts(true);
}

// Re-map loadPosts to hide forum sections if switching back
const originalLoadPosts = loadPosts;
loadPosts = function(folder, reset) {
    isForumMode = false;
    document.getElementById('forum-create-section').classList.add('hidden');
    if (isOwner) document.getElementById('create-post-section').classList.remove('hidden');
    originalLoadPosts(folder, reset);
}

async function loadForumPosts(reset = true) {
    if (reset) { forumPage = 1; document.getElementById('feed').innerHTML = ''; }
    
    try {
        const res = await fetch(`/api/forum?page=${forumPage}&per_page=10`);
        const data = await res.json();
        
        renderForumPosts(data.posts, reset);
        
        // Manage Load More visibility for forum
        const btnCont = document.getElementById('load-more-container');
        if (data.has_more) {
            btnCont.classList.remove('hidden');
            btnCont.querySelector('button').onclick = () => { forumPage++; loadForumPosts(false); };
        } else {
            btnCont.classList.add('hidden');
        }
    } catch(e) { console.error("FORUM LOAD ERR:", e); }
}

function renderForumPosts(posts, reset) {
    const feed = document.getElementById('feed');
    posts.forEach(p => {
        const postEl = document.createElement('div');
        postEl.className = 'post forum-post';
        
        let mediaHtml = '';
        if (p.media && p.media.length > 0) {
            mediaHtml = '<div class="post-media-grid">';
            p.media.forEach(m => {
                if(m.type === 'video') mediaHtml += `<video controls src="${m.url}"></video>`;
                else if(m.type === 'audio') mediaHtml += `<audio controls src="${m.url}"></audio>`;
                else mediaHtml += `<img src="${m.url}" loading="lazy">`;
            });
            mediaHtml += '</div>';
        }

        const dateStr = new Date(p.created_at + 'Z').toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
        const commentsCount = p.comments ? p.comments.length : 0;
        
        const ownerActions = isOwner ? `<button class="owner-btn" style="color:#ff4444" onclick="deleteForumPost(${p.id})">[Delete]</button>` : '';

        let commentsListHtml = '';
        if (p.comments) {
            p.comments.forEach(c => {
                const cDate = new Date(c.created_at + 'Z').toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
                commentsListHtml += `
                    <div class="comment">
                        <div class="comment-author">${c.author}</div>
                        <div class="comment-content">${c.content}</div>
                        <div class="comment-time">${cDate}</div>
                    </div>`;
            });
        }

        postEl.innerHTML = `
            <div class="post-header">
                <div class="username" style="color:var(--accent-secondary)">📡 FORUM BROADCAST <span class="verified-badge">✧</span></div>
                <div class="time">${dateStr}</div>
            </div>
            <div class="post-content" style="margin-top:10px;">${p.content}</div>
            ${mediaHtml}
            <div class="post-actions" style="margin-top:15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top:10px;">
                <button class="action-btn" onclick="likeForumPost(${p.id})">♥ <span id="forum-likes-${p.id}">${p.likes}</span></button>
                <button class="action-btn" onclick="toggleComments('forum-${p.id}')">💬 <span>${commentsCount}</span></button>
                ${ownerActions}
            </div>
            <div id="comments-section-forum-${p.id}" class="comments-section">
                <div id="forum-comments-list-${p.id}">${commentsListHtml}</div>
                <div class="add-comment-form">
                    <input type="text" id="forum-comment-input-${p.id}" placeholder="Write a comment..." onkeydown="if(event.key==='Enter') submitForumComment(${p.id})">
                    <button class="add-comment-btn" onclick="submitForumComment(${p.id})">POST</button>
                </div>
            </div>
        `;
        feed.appendChild(postEl);
    });
}

async function submitForumPost() {
    const input = document.getElementById('forum-content');
    const content = input.value;
    const files = document.getElementById('forum-media').files;
    
    if(!content && files.length === 0) return;
    
    const fd = new FormData();
    fd.append('content', content);
    for(let f of files) fd.append('media', f);
    
    const btn = document.querySelector('#forum-create-section .submit-btn');
    btn.innerText = 'BROADCASTING...';
    btn.disabled = true;

    let success = false;
    try {
        const res = await fetch('/api/forum', { method: 'POST', body: fd });
        if(res.ok) {
            success = true;
        } else {
            const err = await res.json();
            showToast("FORUM ERR: " + (err.error || "Unknown"));
        }
    } catch(e) {
        console.error('Forum post error:', e);
        showToast("FORUM ERR: Could not reach server");
    } finally {
        btn.innerText = '>> BROADCAST <<';
        btn.disabled = false;
    }

    if (success) {
        showToast("FORUM MESSAGE RECEIVED");
        input.value = '';
        const mediaInput = document.getElementById('forum-media');
        if (mediaInput) mediaInput.value = '';
        const fileCount = document.getElementById('forum-file-count');
        if (fileCount) fileCount.innerText = "0 files selected";
        const preview = document.getElementById('forum-media-preview');
        if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
        showForum();
    }
}

// --- FOLLOWER MANAGEMENT ---
async function openFollowersWindow() {
    document.getElementById('admin-followers-modal').classList.remove('hidden');
    loadFollowers();
}

async function loadFollowers() {
    const container = document.getElementById('follower-list-box');
    container.innerHTML = '<p style="color:var(--text-dim)">📡 Intercepting satellite pings...</p>';
    
    try {
        const res = await fetch('/api/followers');
        const subs = await res.json();
        
        if (!Array.isArray(subs)) {
            container.innerHTML = '<p style="color:#ffb74d">ERR: Invalid data. ' + (subs.error || JSON.stringify(subs)) + '</p>';
            return;
        }

        if (subs.length === 0) {
            container.innerHTML = '<p style="color:var(--text-dim)">Zero followers tracked in this sector.</p>';
            return;
        }

        let html = '<table style="width:100%; border-collapse:collapse; color:white; font-size:0.85rem;">';
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.1); text-align:left;">';
        html += '<th style="padding:10px;">EMAIL_ADDR</th><th style="padding:10px;">STATUS</th><th style="padding:10px;">ACTIONS</th></tr>';
        
        subs.forEach(s => {
            const status = s.is_silenced ? '<span style="color:#ffb74d">SILENCED</span>' : '<span style="color:#4caf50">ACTIVE</span>';
            const silenceLabel = s.is_silenced ? '[UNSILENCE]' : '[SILENCE]';
            
            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:10px;">${s.email}</td>
                <td style="padding:10px;">${status}</td>
                <td style="padding:10px;">
                    <button onclick="toggleSilence(${s.id})" style="background:none; border:none; color:var(--accent-secondary); cursor:pointer; margin-right:10px;">${silenceLabel}</button>
                    <button onclick="removeFollower(${s.id})" style="background:none; border:none; color:#ff4444; cursor:pointer;">[ERASE]</button>
                </td>
            </tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<p style="color:#ff4444">ERR: ' + e.message + '</p>';
    }
}

async function toggleSilence(id) {
    await fetch(`/api/followers/${id}/toggle-silence`, { method: 'POST' });
    loadFollowers();
}

async function removeFollower(id) {
    if (!confirm("Erase this record permanently?")) return;
    await fetch(`/api/followers/${id}`, { method: 'DELETE' });
    loadFollowers();
}

function hasLiked(id) {
    if (isOwner) return false; // Owner doesn't "toggle" like states, just increments
    const liked = JSON.parse(localStorage.getItem('liked_posts') || '[]');
    return liked.includes(id);
}

async function likePost(id) {
    const isLiked = hasLiked(id);
    const method = (isOwner || !isLiked) ? 'POST' : 'DELETE'; // DELETE for unliking if viewer already liked
    
    const res = await fetch(`/api/posts/${id}/like`, { method });
    const data = await res.json();
    if (data.success) {
        document.getElementById(`likes-${id}`).innerText = data.likes;
        if (!isOwner) {
            let liked = JSON.parse(localStorage.getItem('liked_posts') || '[]');
            if (isLiked) {
                liked = liked.filter(lid => lid !== id);
                document.querySelector(`.post-actions button[onclick="likePost(${id})"]`).classList.remove('liked');
            } else {
                liked.push(id);
                document.querySelector(`.post-actions button[onclick="likePost(${id})"]`).classList.add('liked');
            }
            localStorage.setItem('liked_posts', JSON.stringify(liked));
        }
    }
}
async function submitForumComment(postId) {
    const input = document.getElementById(`forum-comment-input-${postId}`);
    const content = input.value.trim();
    if(!content) return;
    
    const author = isOwner ? "Owner" : (localStorage.getItem('viewer_name') || "Anonymous");
    
    try {
        const res = await fetch(`/api/forum/${postId}/comments`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ author, content })
        });
        if(res.ok) {
            input.value = '';
            showForum(); // Refresh view
        }
    } catch(e) {}
}

async function deleteForumPost(id) {
    showConfirm("ERASE THIS BROADCAST?", async () => {
        await fetch(`/api/forum/${id}`, { method: 'DELETE' });
        showForum();
    });
}

function handleForumMediaSelect(e) {
    const count = e.target.files.length;
    document.getElementById('forum-file-count').innerText = `${count} files selected`;
}
