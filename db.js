import { 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    deleteDoc, 
    doc,
    updateDoc,
    serverTimestamp,
    enableIndexedDbPersistence,
    limit
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";
import { showToast } from "./toast.js";

// Enable Offline Persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore Persistence failed: Browser not supported');
    }
});

export function subscribeToTransactions(onDataChanged, onError) {
    const user = getCurrentUser();
    if (!user) return;

    const q = query(
        collection(db, "transactions"), 
        where("uid", "==", user.uid),
        orderBy("date", "desc"),
        limit(50)
    );

    return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        try {
            const transactions = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Ensure amount is a number if it exists
                if (data.amount !== undefined) data.amount = Number(data.amount);
                transactions.push({ id: doc.id, ...data });
            });
            
            const isFromCache = snapshot.metadata.fromCache;
            const hasPendingWrites = snapshot.metadata.hasPendingWrites;
            
            onDataChanged(transactions, { isFromCache, hasPendingWrites });
        } catch (err) {
            console.error("Error processing snapshot:", err);
            onError(err);
        }
    }, (error) => {
        console.error("Error fetching transactions: ", error);
        onError(error);
        if (error.message.includes('index')) {
            showToast("Database index required. Check console.", "warning");
        } else {
            showToast("Error loading data", "error");
        }
    });
}

export async function addTransaction(transactionData) {
    console.log("DB: Attempting to add transaction...", transactionData);
    try {
        const user = getCurrentUser();
        if (!user) {
            console.error("DB Error: No active user session");
            showToast("Session expired. Please log in again.", "error");
            return false;
        }
        transactionData.uid = user.uid;
        transactionData.createdAt = serverTimestamp();
        await addDoc(collection(db, "transactions"), transactionData);
        console.log("DB: Transaction added successfully");
        return true;
    } catch (error) {
        console.error("DB Add Error:", error);
        showToast(`Database Error: ${error.message}`, "error");
        return false;
    }
}

export async function updateTransaction(id, transactionData) {
    try {
        await updateDoc(doc(db, "transactions", id), transactionData);
        return true;
    } catch (error) {
        console.error("DB Update Error:", error);
        return false;
    }
}

export async function deleteTransactionRecord(id) {
    try {
        await deleteDoc(doc(db, "transactions", id));
        showToast("Transaction deleted", "info");
        return true;
    } catch (error) {
        console.error(error);
        showToast("Failed to delete transaction", "error");
        return false;
    }
}

// Budget specific logic
export function subscribeToBudget(onBudgetLoaded) {
    const user = getCurrentUser();
    if (!user) return;

    const q = query(
        collection(db, "budgets"),
        where("uid", "==", user.uid)
    );

    return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const budgetDoc = snapshot.docs[0];
            onBudgetLoaded({ id: budgetDoc.id, ...budgetDoc.data() });
        } else {
            onBudgetLoaded(null);
        }
    });
}

export async function setBudget(amount, currentBudgetId = null) {
    const user = getCurrentUser();
    if (!user) return false;

    try {
        if (currentBudgetId) {
            await updateDoc(doc(db, "budgets", currentBudgetId), { amount });
            showToast("Budget updated", "success");
        } else {
            await addDoc(collection(db, "budgets"), {
                uid: user.uid,
                amount
            });
            showToast("Budget set", "success");
        }
        return true;
    } catch (error) {
        console.error(error);
        showToast("Failed to save budget", "error");
        return false;
    }
}
