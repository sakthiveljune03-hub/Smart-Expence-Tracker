import { initAuth, logoutUser } from "./js/auth.js";
import { 
    subscribeToTransactions, 
    addTransaction, 
    updateTransaction, 
    deleteTransactionRecord,
    subscribeToBudget,
    setBudget
} from "./js/db.js";
import { showToast } from "./js/toast.js";

const isDashboardPage = document.querySelector('.dashboard-page') !== null;

// --- Global Error Handling for Debugging ---
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global Error:', msg, 'at', lineNo, ':', columnNo);
    showToast(`Error: ${msg}`, "error");
    return false;
};

window.onunhandledrejection = function(event) {
    console.error('Unhandled Promise Rejection:', event.reason);
    showToast(`Promise Error: ${event.reason}`, "error");
};

// Globals for Dashboard
let isInitialized = false;
let currentTransactions = [];
let currentBudget = null;
let expenseChartInstance = null;

// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// --- Theme Logic ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}
initTheme();

// initAuth handles the auth state changes and form listeners on index.html
initAuth((user) => {
    if (user) {
        localStorage.setItem('last_user', JSON.stringify({
            displayName: user.displayName,
            email: user.email,
            uid: user.uid
        }));
    }
    if (isDashboardPage && !isInitialized) {
        setupDashboardUI();
        isInitialized = true;
    }
});

// Fast Auth: Check for cached user to remove "Loading..." immediately
if (isDashboardPage) {
    const cachedUser = JSON.parse(localStorage.getItem('last_user'));
    if (cachedUser) {
        const greetingName = cachedUser.displayName || (cachedUser.email ? cachedUser.email.split('@')[0] : "User");
        const greetingEl = document.getElementById('user-greeting');
        if (greetingEl) greetingEl.textContent = `Hello, ${greetingName}`;
        const dashPage = document.querySelector('.dashboard-page');
        if (dashPage) dashPage.classList.remove('hidden-until-auth');
    }
}

// --- Dashboard UI Logic ---
function setupDashboardUI() {
    const logoutBtn = document.getElementById('logout-btn');
    const transactionForm = document.getElementById('transaction-form');
    const filterType = document.getElementById('filter-type');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const setBudgetBtn = document.getElementById('set-budget-btn');

    // Default date
    document.getElementById('date').valueAsDate = new Date();

    // Theme toggle icon
    if (document.documentElement.getAttribute('data-theme') === 'light') {
        themeIcon.classList.replace('fa-sun', 'fa-moon');
    }

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        if (newTheme === 'light') themeIcon.classList.replace('fa-sun', 'fa-moon');
        else themeIcon.classList.replace('fa-moon', 'fa-sun');
    });

    // Listeners
    logoutBtn.addEventListener('click', logoutUser);
    transactionForm.addEventListener('submit', handleTransactionSubmit);
    filterType.addEventListener('change', renderTransactions);
    if(exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCSV);
    if(cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEditMode);
    
    if(setBudgetBtn) {
        setBudgetBtn.addEventListener('click', () => {
            const amount = parseFloat(document.getElementById('budget-input').value);
            if(isNaN(amount) || amount <= 0) {
                showToast("Enter a valid budget amount", "warning");
                return;
            }
            setBudget(amount, currentBudget ? currentBudget.id : null);
        });
    }

    // Subscribe to DB real-time updates
    const listLoader = document.getElementById('list-loader');
    
    subscribeToTransactions((transactions, metadata) => {
        if (listLoader) listLoader.style.display = 'none';
        currentTransactions = transactions || [];
        
        if (metadata) updateSyncStatusUI(metadata);
        
        // Execute each update in isolation so one failure doesn't block others
        try { renderTransactions(); } catch (e) { console.error("Render error:", e); }
        try { updateSummary(); } catch (e) { console.error("Summary error:", e); }
        try { updateChart(); } catch (e) { console.error("Chart error:", e); }
        try { updateBudgetUI(); } catch (e) { console.error("Budget error:", e); }
    }, (error) => {
        if (listLoader) listLoader.style.display = 'none';
        console.error("Subscription error:", error);
    });

    subscribeToBudget((budget) => {
        currentBudget = budget;
        if(budget) {
            document.getElementById('budget-input').value = budget.amount;
        }
        updateBudgetUI();
    });

    // Income/Expense radio logic
    document.querySelectorAll('input[name="type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const categorySelect = document.getElementById('category');
            if (e.target.value === 'income') {
                categorySelect.innerHTML = '<option value="Income">Income</option>';
                categorySelect.disabled = true;
            } else {
                categorySelect.innerHTML = `
                    <option value="Food & Dining">Food & Dining</option>
                    <option value="Transportation">Transportation</option>
                    <option value="Housing">Housing</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Health">Health</option>
                    <option value="Others">Others</option>
                `;
                categorySelect.disabled = false;
            }
        });
    });

    // Magic Bar Listeners
    const magicInput = document.getElementById('magic-input');
    const voiceBtn = document.getElementById('voice-btn');
    
    if (magicInput) {
        magicInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                processMagicInput(e.target.value);
                e.target.value = '';
            }
        });
    }
    
    if (voiceBtn) {
        voiceBtn.addEventListener('click', startVoiceRecognition);
    }
}

async function processMagicInput(text) {
    if (!text.trim()) return;
    
    // Regex to find amount (numbers)
    const amountMatch = text.match(/(\d+(\.\d+)?)/);
    if (!amountMatch) {
        showToast("Could not find an amount in your text", "warning");
        return;
    }
    
    const amount = parseFloat(amountMatch[0]);
    let description = text.replace(amountMatch[0], '').trim();
    
    // Check for "income" keyword
    let type = 'expense';
    const lowerText = text.toLowerCase();
    if (lowerText.includes('income') || lowerText.includes('salary') || lowerText.includes('received')) {
        type = 'income';
        description = description.replace(/income|salary|received/gi, '').trim();
    }
    
    // Remove common filler words
    description = description.replace(/for|spent|on|paid/gi, '').trim();
    
    if (!description) description = "Quick Transaction";

    const transactionData = {
        type,
        description: description.charAt(0).toUpperCase() + description.slice(1),
        amount,
        category: type === 'income' ? 'Income' : 'Others',
        date: new Date().toISOString().split('T')[0]
    };

    showToast(`Magic: ${description} (₹${amount})`, "info");
    
    // Background Add
    addTransaction(transactionData);
}

function startVoiceRecognition() {
    const voiceBtn = document.getElementById('voice-btn');
    const recognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!recognitionClass) {
        showToast("Voice recognition not supported in this browser", "error");
        return;
    }
    
    const recognition = new recognitionClass();
    recognition.lang = 'en-IN'; 
    recognition.interimResults = false;
    
    recognition.onstart = () => {
        voiceBtn.classList.add('listening');
        showToast("Listening...", "info");
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const magicInput = document.getElementById('magic-input');
        if (magicInput) magicInput.value = transcript;
        processMagicInput(transcript);
    };
    
    recognition.onerror = (event) => {
        showToast("Voice Error: " + event.error, "error");
    };
    
    recognition.onend = () => {
        voiceBtn.classList.remove('listening');
    };
    
    recognition.start();
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const type = form.querySelector('input[name="type"]:checked').value;
    const description = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const category = document.getElementById('category').value;
    const date = document.getElementById('date').value;
    const editId = document.getElementById('edit-transaction-id').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (isNaN(amount) || amount <= 0) {
        showToast("Please enter a valid positive amount.", "warning");
        return;
    }

    toggleButtonLoader(submitBtn, true);

    try {
        const transactionData = {
            type,
            description: description.trim(),
            amount: Number(amount),
            category: type === 'expense' ? category : 'Income',
            date
        };

        const dbOperation = editId 
            ? updateTransaction(editId, transactionData) 
            : addTransaction(transactionData);
        
        // --- Continuous Entry Logic (Optimistic UI) ---
        if (editId) {
            cancelEditMode();
            showToast("Transaction updated", "success");
        } else {
            // Clear only description and amount for fast repeat entry
            document.getElementById('desc').value = '';
            document.getElementById('amount').value = '';
            
            // Re-focus description for immediate typing
            document.getElementById('desc').focus();
            showToast("Transaction added", "success");
        }
        
        // Handle the background result
        dbOperation.then(success => {
            if (!success) {
                console.error("DB Operation failed");
            }
        }).catch(err => {
            console.error("Background sync error:", err);
            showToast("Sync Error: Check your connection", "error");
        });

    } catch (err) {
        console.error("Submission Error:", err);
        showToast("Error processing transaction", "error");
    } finally {
        toggleButtonLoader(submitBtn, false);
    }
}

function resetFormDefaults() {
    // This is used for a fresh start or after an edit
    document.getElementById('edit-transaction-id').value = '';
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    
    const descField = document.getElementById('desc');
    if (descField) descField.focus();
}

function cancelEditMode() {
    const form = document.getElementById('transaction-form');
    if (!form) return;
    
    form.reset();
    resetFormDefaults();
    
    document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-circle-plus"></i> Add Transaction';
    document.getElementById('submit-btn-text').innerHTML = '<i class="fa-solid fa-plus"></i> Add Transaction';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

function renderTransactions() {
    const listContainer = document.getElementById('transactions-list');
    const emptyState = document.getElementById('list-empty-state');
    const filterType = document.getElementById('filter-type');
    const filter = filterType ? filterType.value : 'all';

    listContainer.innerHTML = '';

    const filtered = currentTransactions.filter(t => filter === 'all' || t.type === filter);

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        filtered.forEach(t => {
            const isIncome = t.type === 'income';
            const sign = isIncome ? '+' : '-';
            const amountClass = isIncome ? 'text-success' : 'text-danger';
            
            const amountValue = Number(t.amount) || 0;
            const item = document.createElement('div');
            item.className = `transaction-item ${isIncome ? 'income-item' : 'expense-item'}`;
            item.innerHTML = `
                <div class="t-info">
                    <span class="t-desc">${escapeHtml(t.description)}</span>
                    <div class="t-meta">
                        <span>${t.category}</span>
                        <span>${formatDate(t.date)}</span>
                    </div>
                </div>
                <div class="t-amount-actions">
                    <span class="t-amount ${amountClass}">${sign}₹${amountValue.toFixed(2)}</span>
                    <button class="btn-edit" data-id="${t.id}" title="Edit Transaction"><i class="fa-solid fa-pen" data-id="${t.id}"></i></button>
                    <button class="btn-delete" data-id="${t.id}" title="Delete Transaction"><i class="fa-solid fa-trash" data-id="${t.id}"></i></button>
                </div>
            `;
            listContainer.appendChild(item);
        });

        // Edit listeners
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('.btn-edit').getAttribute('data-id');
                const transaction = currentTransactions.find(t => t.id === id);
                if(transaction) editTransaction(transaction);
            });
        });

        // Delete listeners
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.closest('.btn-delete').getAttribute('data-id');
                if(confirm('Are you sure you want to delete this transaction?')) {
                    await deleteTransactionRecord(id);
                }
            });
        });
    }
}

function editTransaction(transaction) {
    document.getElementById('edit-transaction-id').value = transaction.id;
    document.getElementById('desc').value = transaction.description;
    document.getElementById('amount').value = transaction.amount;
    document.getElementById('date').value = transaction.date;
    
    const typeRadio = document.querySelector(`input[name="type"][value="${transaction.type}"]`);
    if(typeRadio) {
        typeRadio.checked = true;
        typeRadio.dispatchEvent(new Event('change')); 
    }
    
    if(transaction.type === 'expense') {
        document.getElementById('category').value = transaction.category;
    }
    
    document.getElementById('form-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Transaction';
    document.getElementById('submit-btn-text').innerHTML = '<i class="fa-solid fa-check"></i> Update Transaction';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
}

function updateSummary() {
    let income = 0;
    let expense = 0;

    currentTransactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') income += amt;
        else if (t.type === 'expense') expense += amt;
    });

    const balance = income - expense;

    document.getElementById('total-balance').textContent = `₹${balance.toFixed(2)}`;
    document.getElementById('total-income').textContent = `₹${income.toFixed(2)}`;
    document.getElementById('total-expense').textContent = `₹${expense.toFixed(2)}`;
}

function updateBudgetUI() {
    const spentText = document.getElementById('budget-spent-text');
    const limitText = document.getElementById('budget-limit-text');
    const progressBar = document.getElementById('budget-progress-bar');
    
    if(!spentText || !limitText || !progressBar) return;

    // Calculate this month's expenses
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let monthExpenses = 0;
    currentTransactions.forEach(t => {
        if (t.type === 'expense') {
            const tDate = new Date(t.date);
            if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
                monthExpenses += (Number(t.amount) || 0);
            }
        }
    });

    spentText.textContent = `Spent: ₹${monthExpenses.toFixed(2)}`;

    if (currentBudget && currentBudget.amount > 0) {
        limitText.textContent = `Limit: ₹${currentBudget.amount.toFixed(2)}`;
        let percentage = (monthExpenses / currentBudget.amount) * 100;
        if (percentage > 100) percentage = 100;
        
        progressBar.style.width = `${percentage}%`;
        
        // Color coding
        if (percentage < 75) {
            progressBar.style.backgroundColor = 'var(--success-color)';
        } else if (percentage < 90) {
            progressBar.style.backgroundColor = '#f59e0b'; // warning yellow
        } else {
            progressBar.style.backgroundColor = 'var(--danger-color)'; // danger red
            if (percentage >= 100) {
                showToast("Warning: You have exceeded your monthly budget!", "warning");
            }
        }
    } else {
        limitText.textContent = `Limit: Not set`;
        progressBar.style.width = `0%`;
    }
}

function updateChart() {
    const canvas = document.getElementById('expenseChart');
    if(!canvas || typeof Chart === 'undefined') {
        if(!canvas) console.warn("Canvas not found");
        if(typeof Chart === 'undefined') console.warn("Chart.js not loaded");
        return;
    }

    const emptyState = document.getElementById('chart-empty-state');
    const expenses = currentTransactions.filter(t => t.type === 'expense');
    
    if (expenses.length === 0) {
        canvas.style.display = 'none';
        emptyState.classList.remove('hidden');
        return;
    } else {
        canvas.style.display = 'block';
        emptyState.classList.add('hidden');
    }

    const categoryTotals = {};
    expenses.forEach(t => {
        const amt = Number(t.amount) || 0;
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + amt;
    });

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);
    const backgroundColors = ['#6366f1', '#34d399', '#f59e0b', '#f87171', '#8b5cf6', '#ec4899', '#14b8a6'];

    if (expenseChartInstance) {
        expenseChartInstance.destroy();
    }

    // @ts-ignore
    expenseChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors.slice(0, labels.length),
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: 'var(--text-muted)' }
                }
            },
            cutout: '75%'
        }
    });
}

function exportToCSV() {
    if(currentTransactions.length === 0) {
        showToast("No transactions to export", "info");
        return;
    }
    
    const headers = ["Date", "Type", "Description", "Category", "Amount"];
    const rows = currentTransactions.map(t => [
        t.date, t.type, `"${t.description.replace(/"/g, '""')}"`, t.category, t.amount
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "expense_tracker_export.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Export successful!", "success");
}

function toggleButtonLoader(btn, isLoading) {
    const textSpan = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.loader');
    if (isLoading) {
        btn.disabled = true;
        textSpan.classList.add('hidden');
        loader.classList.remove('hidden');
    } else {
        btn.disabled = false;
        textSpan.classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function formatDate(dateStr) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString(undefined, options);
}

function updateSyncStatusUI(metadata = {}) {
    const syncStatus = document.getElementById('sync-status');
    const syncText = document.getElementById('sync-text');
    const syncIcon = syncStatus?.querySelector('i');

    if (!syncStatus || !syncText) return;

    if (metadata.hasPendingWrites) {
        syncStatus.className = 'sync-status syncing';
        syncText.textContent = 'Syncing...';
        syncIcon.className = 'fa-solid fa-cloud-arrow-up';
    } else if (!navigator.onLine) {
        syncStatus.className = 'sync-status offline';
        syncText.textContent = 'Offline';
        syncIcon.className = 'fa-solid fa-cloud-slash';
    } else {
        syncStatus.className = 'sync-status';
        syncText.textContent = 'Synced';
        syncIcon.className = 'fa-solid fa-cloud';
    }
}

// Connectivity Listeners
window.addEventListener('online', () => updateSyncStatusUI({ hasPendingWrites: false }));
window.addEventListener('offline', () => updateSyncStatusUI({ hasPendingWrites: false }));
