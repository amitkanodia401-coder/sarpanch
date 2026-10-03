/**
 * मेरा गाँव - एडमिन पोर्टल (Admin Portal Client Scripts)
 */

document.addEventListener('DOMContentLoaded', () => {
  initAdminMobileSidebar();
  initAdminWorksFilter();
  initAdminSearch();
  initWorkBudgetCalculation();
});

// Admin Works Table Filter
function initAdminWorksFilter() {
  const filterTabs = document.querySelectorAll('.admin-filter-tab');
  const rows = document.querySelectorAll('.work-table-row');

  if (!filterTabs.length || !rows.length) return;

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const status = tab.getAttribute('data-status');

      rows.forEach(row => {
        const rowStatus = row.getAttribute('data-status');
        if (status === 'all' || rowStatus === status) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  });
}

// Table Search Filter
function initAdminSearch() {
  const searchInput = document.getElementById('adminTableSearch');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('.searchable-row');

    rows.forEach(row => {
      const text = row.innerText.toLowerCase();
      if (!term || text.includes(term)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  });
}

// Auto calculate balance in Work modal
function initWorkBudgetCalculation() {
  const budgetInput = document.getElementById('workBudgetInput');
  const spentInput = document.getElementById('workSpentInput');
  const balanceDisplay = document.getElementById('workBalanceDisplay');

  if (!budgetInput || !spentInput || !balanceDisplay) return;

  function calc() {
    const b = Number(budgetInput.value) || 0;
    const s = Number(spentInput.value) || 0;
    const bal = b - s;
    balanceDisplay.textContent = '₹' + bal.toLocaleString('en-IN');
  }

  budgetInput.addEventListener('input', calc);
  spentInput.addEventListener('input', calc);
}

// Modal open/close
function openAdminModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeAdminModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// Edit Work prefiller
function editWork(workJson) {
  const work = typeof workJson === 'string' ? JSON.parse(workJson) : workJson;
  const form = document.getElementById('editWorkForm');
  if (!form) return;

  form.action = `/api/works/${work.id}/edit`;
  document.getElementById('editWorkTitle').value = work.title || '';
  document.getElementById('editWorkScheme').value = work.scheme || '';
  document.getElementById('editWorkBudget').value = work.budget || 0;
  document.getElementById('editWorkSpent').value = work.spent || 0;
  document.getElementById('editWorkStatus').value = work.status || 'चालू';
  document.getElementById('editWorkProgress').value = work.progress || 0;
  document.getElementById('editWorkContractor').value = work.contractor || '';
  document.getElementById('editWorkLength').value = work.length || '';
  document.getElementById('editWorkCategory').value = work.category || 'विकास कार्य';
  document.getElementById('editWorkDescription').value = work.description || '';
  const imgInput = document.getElementById('editWorkImage');
  if (imgInput) imgInput.value = work.image || '';

  openAdminModal('editWorkModal');
}

// Delete confirmation
function confirmDelete(title, actionUrl) {
  if (confirm(`क्या आप वाकई "${title}" को हटाना चाहते हैं? यह क्रिया पूर्ववत नहीं की जा सकती।`)) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = actionUrl;
    document.body.appendChild(form);
    form.submit();
  }
}

// Edit Candidate prefiller
function editCandidate(candJson) {
  const cand = typeof candJson === 'string' ? JSON.parse(candJson) : candJson;
  const form = document.getElementById('editCandidateForm');
  if (!form) return;

  form.action = `/api/candidates/${cand.id}/edit`;
  document.getElementById('editCandName').value = cand.name || '';
  document.getElementById('editCandParty').value = cand.party || '';
  document.getElementById('editCandPartyBadge').value = cand.partyBadge || '';
  document.getElementById('editCandSlogan').value = cand.slogan || '';
  document.getElementById('editCandAge').value = cand.age || '';
  document.getElementById('editCandWard').value = cand.ward || '';
  document.getElementById('editCandVillage').value = cand.village || '';
  document.getElementById('editCandPhone').value = cand.phone || '';
  document.getElementById('editCandEducation').value = cand.education || '';
  document.getElementById('editCandBio').value = cand.bio || '';
  document.getElementById('editCandPhoto').value = cand.photo || '';
  document.getElementById('editCandAchievements').value = Array.isArray(cand.achievements) ? cand.achievements.join('\n') : (cand.achievements || '');
  document.getElementById('editCandPromises').value = Array.isArray(cand.promises) ? cand.promises.join('\n') : (cand.promises || '');
  
  const votesEl = document.getElementById('editCandVotes');
  if (votesEl) votesEl.value = cand.votes !== undefined ? cand.votes : 0;

  openAdminModal('editCandidateModal');
}

// Print / Export trigger
function printReport() {
  window.print();
}

// Mobile sidebar toggle for admin
function initAdminMobileSidebar() {
  const toggleBtn = document.getElementById('adminSidebarToggle');
  const closeBtn = document.getElementById('adminSidebarClose');
  const backdrop = document.getElementById('adminSidebarBackdrop');
  const sidebar = document.getElementById('adminSidebar');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('open');
      document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
    });
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // Close on nav link click in mobile view
  document.querySelectorAll('.admin-sidebar-menu a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  });
}
