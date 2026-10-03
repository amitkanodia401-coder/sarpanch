/**
 * मेरा गाँव - ग्राम पंचायत पोर्टल (Public Frontend Scripts)
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initCandidateFilters();
  initWorksFilters();
  initPledgeVote();
  initComplaintForm();
  initTabPanes();
  initSingleVoteTracking();
  startRealtimeVotesPolling();
});

// Toast notification helper
function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>${type === 'success' ? '✅' : 'ℹ️'}</span> <span>${message}</span>`;
  toast.style.display = 'flex';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

// 1. Candidate List Filtering & Live Search
function initCandidateFilters() {
  const searchInput = document.getElementById('candidateSearchInput');
  const wardSelect = document.getElementById('candidateWardSelect');
  const partyChips = document.querySelectorAll('.party-filter-chip');
  const candidateCards = document.querySelectorAll('.candidate-list-item');

  if (!candidateCards.length) return;

  let activeParty = 'all';

  function filterCards() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedWard = wardSelect ? wardSelect.value : 'all';

    candidateCards.forEach(card => {
      const name = (card.getAttribute('data-name') || '').toLowerCase();
      const party = card.getAttribute('data-party') || '';
      const ward = card.getAttribute('data-ward') || '';

      const matchesSearch = !query || name.includes(query);
      const matchesParty = activeParty === 'all' || party === activeParty;
      const matchesWard = selectedWard === 'all' || ward === selectedWard;

      if (matchesSearch && matchesParty && matchesWard) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterCards);
  }

  if (wardSelect) {
    wardSelect.addEventListener('change', filterCards);
  }

  partyChips.forEach(chip => {
    chip.addEventListener('click', () => {
      partyChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeParty = chip.getAttribute('data-party');
      filterCards();
    });
  });
}

// 2. Development Works Filter (All, Completed, In Progress, Upcoming)
function initWorksFilters() {
  const filterTabs = document.querySelectorAll('.work-filter-tab');
  const workCards = document.querySelectorAll('.work-list-item');

  if (!filterTabs.length || !workCards.length) return;

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const status = tab.getAttribute('data-status');

      workCards.forEach(card => {
        const cardStatus = card.getAttribute('data-status');
        if (status === 'all' || cardStatus === status) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

// ----------------------------------------------------
// 3. Support / Vote Pledge with Strict Single-Vote Lock & Live Real-Time Sync
// ----------------------------------------------------
const VOTED_KEY = 'sarpanch_voted_candidate';

// Retrieve candidate ID that visitor supported (from localStorage or cookie)
function getVotedCandidate() {
  try {
    const localVal = localStorage.getItem(VOTED_KEY);
    if (localVal) return localVal;
  } catch (e) {}
  const match = document.cookie.match(/(?:^|;\s*)sarpanch_voted=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

// Store candidate ID when voted
function setVotedCandidate(candidateId) {
  try {
    localStorage.setItem(VOTED_KEY, candidateId);
  } catch (e) {}
  document.cookie = 'sarpanch_voted=' + encodeURIComponent(candidateId) + '; path=/; max-age=31536000; SameSite=Lax';
}

// Update all vote counter numbers and trigger pulse animation if changed
function updateSingleVoteCounter(candidateId, newVotes) {
  document.querySelectorAll('.vote-num-' + candidateId).forEach(el => {
    if (el.textContent !== String(newVotes)) {
      el.textContent = newVotes;
      el.classList.remove('vote-num-pulse');
      void el.offsetWidth; // trigger reflow
      el.classList.add('vote-num-pulse');
    }
  });
  const countSpan = document.getElementById('voteCountSpan');
  if (countSpan && countSpan.classList.contains('vote-num-' + candidateId)) {
    if (countSpan.textContent !== String(newVotes)) {
      countSpan.textContent = newVotes;
      countSpan.classList.remove('vote-num-pulse');
      void countSpan.offsetWidth;
      countSpan.classList.add('vote-num-pulse');
    }
  }
}

// Lock all support buttons and highlight the voted candidate
function applyVotedButtonStates(votedCandidateId) {
  if (!votedCandidateId) return;

  // 1. Candidate cards on Home page & Candidate list page
  document.querySelectorAll('.candidate-pledge-btn').forEach(btn => {
    const candId = btn.getAttribute('data-candidate-id');
    const isThisCandidate = (candId === votedCandidateId);
    const numEl = btn.querySelector('.vote-num-' + candId);
    const votes = numEl ? numEl.textContent : '';

    if (isThisCandidate) {
      btn.classList.add('voted-this');
      btn.classList.remove('voted-other', 'btn-outline', 'btn-primary');
      btn.disabled = true;
      btn.title = 'आपने इस उम्मीदवार को समर्थन दिया है';
      btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span class="btn-text vote-btn-text">समर्थन दिया</span> (<span class="vote-num-' + candId + '">' + votes + '</span>)';
    } else {
      btn.classList.add('voted-other');
      btn.classList.remove('voted-this', 'btn-primary');
      btn.disabled = true;
      btn.title = 'आप पहले ही समर्थन दे चुके हैं (एक नागरिक केवल एक समर्थन दे सकता है)';
      btn.innerHTML = '<i class="fa-solid fa-lock" style="font-size: 11px;"></i> <span class="btn-text vote-btn-text">समर्थन दिया</span> (<span class="vote-num-' + candId + '">' + votes + '</span>)';
      btn.onclick = function(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        showToast('आप पहले ही समर्थन दे चुके हैं! एक नागरिक केवल एक बार समर्थन दे सकता है।', 'info');
      };
    }
  });

  // 2. Candidate detail profile page action button
  const detailBtn = document.getElementById('pledgeVoteBtn');
  if (detailBtn) {
    const candId = detailBtn.getAttribute('data-candidate-id');
    if (candId === votedCandidateId) {
      detailBtn.classList.add('voted-this');
      detailBtn.classList.remove('voted-other', 'btn-primary');
      detailBtn.disabled = true;
      detailBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>आपका समर्थन दर्ज है</span>';
    } else {
      detailBtn.classList.add('voted-other');
      detailBtn.classList.remove('voted-this', 'btn-primary');
      detailBtn.disabled = true;
      detailBtn.innerHTML = '<i class="fa-solid fa-lock"></i> <span>समर्थन दिया जा चुका है</span>';
      detailBtn.onclick = function(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        showToast('आप पहले ही समर्थन दे चुके हैं! एक नागरिक केवल एक बार समर्थन दे सकता है।', 'info');
      };
    }
  }
}

function initSingleVoteTracking() {
  const votedId = getVotedCandidate();
  if (votedId) {
    applyVotedButtonStates(votedId);
  }
}

// 3. Support / Vote Pledge with Strict One-Vote Enforcement & Live Sync
window.pledgeSupport = async function(event, candidateId, btn) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!candidateId) return;

  // Strict check: if already supported, do not proceed and warn user
  const alreadyVoted = getVotedCandidate();
  if (alreadyVoted) {
    applyVotedButtonStates(alreadyVoted);
    showToast('आप पहले ही अपना समर्थन दर्ज कर चुके हैं! एक नागरिक केवल एक बार समर्थन दे सकता है।', 'info');
    return;
  }

  // Prevent multiple fast clicks
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }

  try {
    const res = await fetch('/api/vote/' + candidateId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();

    if (data.success) {
      // 1. Permanently record vote in local storage & cookie
      setVotedCandidate(candidateId);

      // 2. Animate and update counters on page
      updateSingleVoteCounter(candidateId, data.votes);

      // 3. Immediately lock all other buttons across the page
      applyVotedButtonStates(candidateId);

      showToast('धन्यवाद! आपका समर्थन सफलतापूर्वक दर्ज कर लिया गया है।');
    } else {
      if (data.alreadyVoted) {
        const savedId = data.votedCandidate || candidateId;
        setVotedCandidate(savedId);
        applyVotedButtonStates(savedId);
      } else if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
      showToast(data.message || 'आप पहले ही समर्थन दे चुके हैं।', 'info');
    }
  } catch (e) {
    console.error(e);
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
    showToast('समर्थन दर्ज नहीं हो सका। कृपया पुनः प्रयास करें।', 'error');
  }
};

function initPledgeVote() {
  const voteBtn = document.getElementById('pledgeVoteBtn');
  if (!voteBtn) return;

  voteBtn.addEventListener('click', (e) => {
    const candidateId = voteBtn.getAttribute('data-candidate-id');
    window.pledgeSupport(e, candidateId, voteBtn);
  });
}

// Real-Time Live Votes Polling (Updates all support counters across users every 3 seconds)
function startRealtimeVotesPolling() {
  let isPolling = false;

  async function poll() {
    if (document.hidden || isPolling) return;
    isPolling = true;
    try {
      const res = await fetch('/api/votes?_=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.votes) {
          for (const [candId, votes] of Object.entries(data.votes)) {
            updateSingleVoteCounter(candId, votes);
          }
        }
      }
    } catch (err) {
      // Silent catch for network hiccups
    } finally {
      isPolling = false;
    }
  }

  // Check every 3 seconds for real-time live support numbers
  setInterval(poll, 3000);
}

// 4. Citizen Complaint / Grievance Submission
function initComplaintForm() {
  const form = document.getElementById('citizenComplaintForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'शिकायत दर्ज हो रही है...';

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch('/api/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        form.reset();
        const successBox = document.getElementById('complaintSuccessBox');
        if (successBox) {
          successBox.style.display = 'block';
          successBox.innerHTML = `
            <div style="background: #dcfce7; color: #15803d; padding: 18px; border-radius: 8px; border: 1px solid #86efac; margin-bottom: 20px;">
              <h4 style="font-size: 16px; margin-bottom: 6px;">शिकायत सफलतापूर्वक दर्ज!</h4>
              <p style="font-size: 14px;">आपकी शिकायत संदर्भ संख्या <strong>#${data.complaint.id}</strong> के साथ पंजीकृत कर ली गई है। ग्राम पंचायत द्वारा जल्द से जल्द निवारण किया जाएगा।</p>
            </div>
          `;
        }
      } else {
        showToast(data.message || 'त्रुटि हुई', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('सर्वर से कनेक्ट करने में असमर्थ।', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

// 5. Tab Pane Switcher (Candidate Profile & Work Details)
function initTabPanes() {
  const tabLinks = document.querySelectorAll('.tab-link');
  if (!tabLinks.length) return;

  tabLinks.forEach(link => {
    link.addEventListener('click', () => {
      const targetId = link.getAttribute('data-target');
      const container = link.closest('.tabs-container') || document;

      container.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
      container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      link.classList.add('active');
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });
}

// Modal helper
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// 6. Image Lightbox for Works & Documents (Click to view full image)
let isLightboxZoomed = false;

window.openImageLightbox = function(src, title, meta) {
  if (!src) return;
  const modal = document.getElementById('imageLightboxModal');
  const img = document.getElementById('imageLightboxImg');
  const titleEl = document.getElementById('imageLightboxTitle');
  const metaEl = document.getElementById('imageLightboxMeta');
  const dlLink = document.getElementById('imageLightboxDownload');

  if (!modal || !img) return;

  img.src = src;
  if (titleEl) titleEl.textContent = title || 'फोटो / सरकारी दस्तावेज';
  if (metaEl) {
    if (meta) {
      metaEl.textContent = meta;
      metaEl.style.display = 'block';
    } else {
      metaEl.style.display = 'none';
    }
  }
  if (dlLink) {
    dlLink.href = src;
    dlLink.setAttribute('download', (title ? title.replace(/\s+/g, '_') : 'image') + '.png');
  }

  // Reset zoom
  isLightboxZoomed = false;
  img.style.transform = 'scale(1)';
  img.style.cursor = 'zoom-in';
  const zoomIcon = document.getElementById('lightboxZoomIcon');
  if (zoomIcon) zoomIcon.className = 'fa-solid fa-magnifying-glass-plus';

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeImageLightbox = function() {
  const modal = document.getElementById('imageLightboxModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

window.toggleLightboxZoom = function(e) {
  if (e) e.stopPropagation();
  const img = document.getElementById('imageLightboxImg');
  const zoomIcon = document.getElementById('lightboxZoomIcon');
  if (!img) return;

  isLightboxZoomed = !isLightboxZoomed;
  if (isLightboxZoomed) {
    img.style.transform = 'scale(1.85)';
    img.style.cursor = 'zoom-out';
    if (zoomIcon) zoomIcon.className = 'fa-solid fa-magnifying-glass-minus';
  } else {
    img.style.transform = 'scale(1)';
    img.style.cursor = 'zoom-in';
    if (zoomIcon) zoomIcon.className = 'fa-solid fa-magnifying-glass-plus';
  }
};

window.handleLightboxBackdropClick = function(e) {
  if (e.target.id === 'imageLightboxModal') {
    closeImageLightbox();
  }
};

// Global escape key listener to close modal, lightbox, or mobile menu
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeImageLightbox();
    closeMobileMenu();
  }
});

// Mobile Navigation Drawer Controller
function openMobileMenu() {
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileNavBackdrop');
  if (drawer && backdrop) {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeMobileMenu() {
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileNavBackdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function initMobileMenu() {
  const toggleBtn = document.getElementById('mobileMenuToggle');
  const closeBtn = document.getElementById('mobileMenuClose');
  const backdrop = document.getElementById('mobileNavBackdrop');
  const navLinks = document.querySelectorAll('.mobile-nav-links a');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openMobileMenu();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileMenu();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeMobileMenu);
  }

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeMobileMenu();
    });
  });
}

