const firebaseConfig = {
    apiKey: "AIzaSyDLa4Kkq2hx_zgwLtIrPgwPAXCCK3-uB1c",
    authDomain: "taj-annour.firebaseapp.com",
    projectId: "taj-annour",
    storageBucket: "taj-annour.firebasestorage.app",
    messagingSenderId: "774256127376",
    appId: "1:774256127376:web:07eee124fbc3dc4b6b5715",
    measurementId: "G-EMMMKEGV0L"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Variables globales
let appData = {
    students: [],
    teachers: [],
    payments: [],
    products: [],
    sales: [],
    expenses: [], // Nouveau: pour les sorties d'argent
    teacherPayments: [], // Nouveau: pour les salaires des profs
    monthlyData: {} // Nouveau: données par mois
};

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let syncKey = 'institut_coran_shared_' + new Date().getFullYear(); // Clé partagée

const PRICING = {
    groupe_2h: 32,
    groupe_1h: 16,
    duo: 7,
    individuel: 10,
    inscription: 5
};

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Application chargée');

    // Afficher un indicateur de chargement
    document.getElementById('syncStatus').textContent = 'Initialisation...';

    await loadStoredData();
    updateCurrentMonthDisplay();
    setDefaultDate();
    refreshAllDisplays();
    setupEventListeners();

    // Activer l'écoute en temps réel (optionnel - commentez si vous ne voulez pas)
    // setupRealtimeListener();

    console.log('Application initialisée');
});
async function forceSyncNow() {
    document.getElementById('syncStatus').textContent = 'Synchronisation...';
    await saveData();
    showNotification('🔄 Synchronisation forcée !');
}



// Configuration des événements
function setupEventListeners() {
    // Formulaires - CORRECTION du problème de bouton
    const studentForm = document.getElementById('studentForm');
    const teacherForm = document.getElementById('teacherForm');
    const productForm = document.getElementById('productForm');
    const saleForm = document.getElementById('saleForm');

    if (studentForm) studentForm.addEventListener('submit', addNewStudent);
    if (teacherForm) teacherForm.addEventListener('submit', addNewTeacher);
    if (productForm) productForm.addEventListener('submit', addNewProduct);
    if (saleForm) saleForm.addEventListener('submit', sellProductToStudent);

    // Nouveau formulaire de dépenses
    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) expenseForm.addEventListener('submit', addNewExpense);

    // Calculs en temps réel
    const elements = [
        'studentFormula', 'studentHours', 'studentReduction',
        'inscriptionType', 'registrationDate'
    ];

    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener('change', calculateStudentPrice);
    });

    // Calcul total vente
    const saleElements = ['saleProductSelect', 'saleQuantity'];
    saleElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener('change', updateSaleTotal);
    });

    // Synchronisation automatique toutes les 10 secondes
    setInterval(syncWithServer, 10000);
}

// Navigation entre sections
function switchToSection(sectionId, buttonElement) {
    console.log('Changement vers section:', sectionId);

    // Désactiver tous les boutons
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Masquer toutes les sections
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.remove('active');
    });

    // Activer le bouton cliqué
    buttonElement.classList.add('active');

    // Afficher la section
    document.getElementById(sectionId).classList.add('active');

    // Actualiser les données
    refreshAllDisplays();
}

// Gestion des jours de cours
function toggleDaySelection(labelElement) {
    const checkbox = labelElement.querySelector('input[type="checkbox"]');

    setTimeout(() => {
        if (checkbox.checked) {
            labelElement.classList.add('selected');
        } else {
            labelElement.classList.remove('selected');
        }
        calculateStudentPrice();
    }, 10);
}

function getSelectedCourseDays() {
    const checkboxes = document.querySelectorAll('.course-days-container input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(checkbox => ({
        value: parseInt(checkbox.value),
        text: checkbox.parentElement.textContent.trim()
    }));
}

function resetDaySelection() {
    const checkboxes = document.querySelectorAll('.course-days-container input[type="checkbox"]');
    const labels = document.querySelectorAll('.day-checkbox');

    checkboxes.forEach(cb => cb.checked = false);
    labels.forEach(label => label.classList.remove('selected'));
}

// Calcul des prix
function calculateStudentPrice() {
    const formula = document.getElementById('studentFormula').value;
    const hours = parseFloat(document.getElementById('studentHours').value) || 1;
    const registrationDate = document.getElementById('registrationDate').value;
    const selectedDays = getSelectedCourseDays();
    const reduction = parseFloat(document.getElementById('studentReduction').value) || 0;
    const inscriptionType = document.getElementById('inscriptionType').value;

    let fullMonthlyPrice = 0;

    if (formula === 'groupe_2h') {
        // Tarif = nombre de jours choisis × 4 semaines × 4€/h
        fullMonthlyPrice = selectedDays.length * 4 * 4;
    } else if (formula === 'groupe_1h') {
        fullMonthlyPrice = selectedDays.length * 4 * 4;
    } else if (formula === 'duo') {
        fullMonthlyPrice = 7 * hours * 4;
    } else if (formula === 'individuel') {
        fullMonthlyPrice = 10 * hours * 4;
    }

    const finalMonthlyPrice = Math.max(0, fullMonthlyPrice - reduction);

    let priceText = `${finalMonthlyPrice}€`;
    if (reduction > 0) {
        priceText += ` (prix initial: ${fullMonthlyPrice}€ - réduction: ${reduction}€)`;
    }
    document.getElementById('fullMonthlyPrice').value = priceText;

    if (registrationDate && selectedDays.length > 0 && finalMonthlyPrice > 0) {
        const prorataData = calculateProrata(registrationDate, selectedDays, finalMonthlyPrice, formula, hours);

        // Appliquer réduction proportionnelle au prorata
        let finalProrataAmount = prorataData.amount;
        if (reduction > 0) {
            const reductionRatio = reduction / fullMonthlyPrice;
            const prorataReduction = Math.round(prorataData.amount * reductionRatio * 100) / 100;
            finalProrataAmount = Math.max(0, prorataData.amount - prorataReduction);
        }

        document.getElementById('prorataPrice').value = `${finalProrataAmount}€`;

        let details = prorataData.details;
        if (reduction > 0) details += ` - réduction proportionnelle`;
        if (inscriptionType === 'new') {
            details += ` + 5€ frais d'inscription`;
        } else {
            details += ` (renouvellement - pas de frais d'inscription)`;
        }

        document.getElementById('calculationDetails').value = details;
    } else {
        document.getElementById('prorataPrice').value = '';
        document.getElementById('calculationDetails').value = '';
    }
}

function calculateProrata(registrationDate, courseDays, monthlyPrice, formula, hours) {
    const regDate = new Date(registrationDate);
    const year = regDate.getFullYear();
    const month = regDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let remainingCourseDays = 0;

    // Compter seulement les cours restants dans le mois pour les jours choisis
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const dayOfWeek = currentDate.getDay();
        if (courseDays.some(cd => cd.value === dayOfWeek) && day >= regDate.getDate()) {
            remainingCourseDays++;
        }
    }

    if (remainingCourseDays === 0) {
        return { amount: 0, details: "Aucun cours restant ce mois-ci" };
    }

    let totalHours = 0;
    let pricePerHour = 0;

    if (formula === 'groupe_2h') {
        // Chaque jour choisi = 1h de cours
        totalHours = remainingCourseDays * 1;
        pricePerHour = 4;
    } else if (formula === 'groupe_1h') {
        totalHours = remainingCourseDays * 1;
        pricePerHour = 4;
    } else if (formula === 'duo') {
        totalHours = remainingCourseDays * hours;
        pricePerHour = 7;
    } else if (formula === 'individuel') {
        totalHours = remainingCourseDays * hours;
        pricePerHour = 10;
    }

    const prorataAmount = totalHours * pricePerHour;

    let details = `${totalHours}h × ${pricePerHour}€/h = ${prorataAmount}€`;

    return { amount: prorataAmount, details: details };
}

// Ajout d'un élève - FONCTION CORRIGÉE
function addNewStudent(event) {
    event.preventDefault();
    console.log("Ajout d'un élève - début");

    const firstName = document.getElementById('studentFirstName').value.trim();
    const lastName = document.getElementById('studentLastName').value.trim();
    const phone = document.getElementById('studentPhone').value.trim();
    const formula = document.getElementById('studentFormula').value;
    const hours = parseFloat(document.getElementById('studentHours').value) || 1;
    const registrationDate = document.getElementById('registrationDate').value;
    const assignedTeacher = document.getElementById('assignedTeacher').value;
    const selectedDays = getSelectedCourseDays();
    const reduction = parseFloat(document.getElementById('studentReduction').value) || 0;
    const inscriptionType = document.getElementById('inscriptionType').value;

    if (selectedDays.length === 0) {
        alert('Veuillez sélectionner au moins un jour de cours.');
        return;
    }

    // Calcul correct du prix mensuel selon jours choisis
    let monthlyPrice = 0;
    if (formula === 'groupe_2h') {
        monthlyPrice = selectedDays.length * 4 * 4;
    } else if (formula === 'groupe_1h') {
        monthlyPrice = selectedDays.length * 4 * 4;
    } else if (formula === 'duo') {
        monthlyPrice = 7 * hours * 4;
    } else if (formula === 'individuel') {
        monthlyPrice = 10 * hours * 4;
    }

    const finalMonthlyPrice = Math.max(0, monthlyPrice - reduction);

    // CALCUL PRORATA - BIEN DÉFINIR LA VARIABLE
    const prorataData = calculateProrata(registrationDate, selectedDays, finalMonthlyPrice, formula, hours);
    const finalProrataAmount = prorataData.amount;  // <-- Bien définir cette variable avant de l'utiliser

    const student = {
        id: Date.now(),
        firstName,
        lastName,
        phone,
        formula,
        hours,
        courseDays: selectedDays,
        registrationDate,
        assignedTeacher,
        monthlyPrice: finalMonthlyPrice,
        originalPrice: monthlyPrice,
        reduction,
        inscriptionType,
        prorataAmount: finalProrataAmount,
        status: 'active'
    };

    appData.students.push(student);

    const registrationMonth = new Date(registrationDate);

    if (inscriptionType === 'new') {
        appData.payments.push({
            id: Date.now() + 1,
            studentId: student.id,
            studentName: `${firstName} ${lastName}`,
            type: 'inscription',
            amount: PRICING.inscription,
            month: registrationMonth.getMonth(),
            year: registrationMonth.getFullYear(),
            status: 'unpaid',
            dueDate: registrationDate
        });
    }

    if (finalProrataAmount > 0) {
        appData.payments.push({
            id: Date.now() + 2,
            studentId: student.id,
            studentName: `${firstName} ${lastName}`,
            type: 'monthly',
            amount: finalProrataAmount,
            month: registrationMonth.getMonth(),
            year: registrationMonth.getFullYear(),
            status: 'unpaid',
            dueDate: registrationDate
        });
    }

    saveData();
    refreshAllDisplays();

    // Reset formulaire et état des jours sélectionnés
    document.getElementById('studentForm').reset();
    resetDaySelection();
    setDefaultDate();

    showNotification('✅ Élève ajouté avec succès !');
    console.log("Ajout d'un élève - terminé");
}

// Ajout d'un professeur
function addNewTeacher(event) {
    event.preventDefault();
    console.log('Ajout d\'un professeur');

    const firstName = document.getElementById('teacherFirstName').value.trim();
    const lastName = document.getElementById('teacherLastName').value.trim();
    const specialty = document.getElementById('teacherSpecialty').value;

    const teacher = {
        id: Date.now(),
        firstName,
        lastName,
        specialty,
        status: 'active'
    };

    appData.teachers.push(teacher);
    saveData();
    refreshAllDisplays();

    document.getElementById('teacherForm').reset();
    showNotification('✅ Professeur ajouté avec succès !');
}

// Ajout d'un produit
function addNewProduct(event) {
    event.preventDefault();
    console.log('Ajout d\'un produit');

    const name = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const description = document.getElementById('productDescription').value.trim();

    const product = {
        id: Date.now(),
        name,
        price,
        description,
        status: 'active'
    };

    appData.products.push(product);
    saveData();
    refreshAllDisplays();

    document.getElementById('productForm').reset();
    showNotification('✅ Produit ajouté avec succès !');
}

// Vente d'un produit
function sellProductToStudent(event) {
    event.preventDefault();
    console.log('Vente d\'un produit');

    const studentId = parseInt(document.getElementById('saleStudentSelect').value);
    const productId = parseInt(document.getElementById('saleProductSelect').value);
    const quantity = parseInt(document.getElementById('saleQuantity').value);

    const student = appData.students.find(s => s.id === studentId);
    const product = appData.products.find(p => p.id === productId);

    if (!student || !product) {
        alert('Erreur: élève ou produit introuvable');
        return;
    }

    const totalAmount = product.price * quantity;
    const currentDate = new Date();

    const sale = {
        id: Date.now(),
        studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        productId,
        productName: product.name,
        quantity,
        unitPrice: product.price,
        totalAmount,
        date: currentDate.toISOString().split('T')[0],
        status: 'unpaid'
    };

    appData.sales.push(sale);

    // Ajouter paiement
    appData.payments.push({
        id: Date.now() + 1,
        studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        type: 'product',
        productName: product.name,
        amount: totalAmount,
        month: currentDate.getMonth(),
        year: currentDate.getFullYear(),
        status: 'unpaid',
        dueDate: currentDate.toISOString().split('T')[0]
    });

    saveData();
    refreshAllDisplays();

    document.getElementById('saleForm').reset();
    document.getElementById('saleQuantity').value = 1;
    document.getElementById('saleTotal').value = '';

    showNotification('🛒 Vente enregistrée avec succès !');
}

// Calcul du total de vente
function updateSaleTotal() {
    const productId = parseInt(document.getElementById('saleProductSelect').value);
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 1;

    if (productId) {
        const product = appData.products.find(p => p.id === productId);
        if (product) {
            const total = product.price * quantity;
            document.getElementById('saleTotal').value = `${total}€`;
        }
    } else {
        document.getElementById('saleTotal').value = '';
    }
}

// Suppression d'éléments
function deleteStudent(studentId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet élève ?')) {
        appData.students = appData.students.filter(s => s.id !== studentId);
        appData.payments = appData.payments.filter(p => p.studentId !== studentId);
        appData.sales = appData.sales.filter(s => s.studentId !== studentId);
        saveData();
        refreshAllDisplays();
        showNotification('🗑️ Élève supprimé');
    }
}

function deleteTeacher(teacherId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce professeur ?')) {
        appData.teachers = appData.teachers.filter(t => t.id !== teacherId);
        saveData();
        refreshAllDisplays();
        showNotification('🗑️ Professeur supprimé');
    }
}

// Ajout d'une dépense
function addNewExpense(event) {
    event.preventDefault();
    console.log('Ajout d\'une dépense');

    const description = document.getElementById('expenseDescription').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value;

    const expenseDate = new Date(date);

    const expense = {
        id: Date.now(),
        description,
        amount,
        date,
        month: expenseDate.getMonth(),
        year: expenseDate.getFullYear(),
        type: 'expense'
    };

    appData.expenses.push(expense);
    saveData();
    refreshAllDisplays();

    document.getElementById('expenseForm').reset();
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];

    showNotification('💸 Dépense ajoutée avec succès !');
}

// Changer de mois dans la comptabilité
function changeMonth() {
    currentMonth = parseInt(document.getElementById('monthSelector').value);
    currentYear = parseInt(document.getElementById('yearSelector').value);
    updateAccountingDisplays();
}

// Calcul des salaires des professeurs
function calculateTeacherSalaries(month, year) {
    let totalSalaries = 0;

    // Paiements payés hors inscription
    const paidPayments = appData.payments.filter(p =>
        p.month === month &&
        p.year === year &&
        p.status === 'paid' &&
        p.type !== 'inscription'
    );

    paidPayments.forEach(payment => {
        const student = appData.students.find(s => s.id === payment.studentId);
        if (student) {
            let teacherRate = 0;

            if (student.formula === 'groupe_2h' || student.formula === 'groupe_1h' || student.formula === 'duo') {
                teacherRate = 5; // €/h groupes et duo
            } else if (student.formula === 'individuel') {
                teacherRate = 6; // €/h individuel
            }

            let hoursTeached = 0;
            if (student.formula === 'groupe_2h') {
                hoursTeached = selectedDaysCount(student) || 2; // compter jours cours ou défaut 2h
            } else if (student.formula === 'groupe_1h') {
                hoursTeached = selectedDaysCount(student) || 1;
            } else {
                hoursTeached = student.hours || 1;
            }

            const coursesInPayment = payment.amount / (teacherRate * hoursTeached);
            totalSalaries += coursesInPayment * hoursTeached * teacherRate;
        }
    });

    return Math.round(totalSalaries * 100) / 100;
}

// Helper : compter nombre jours selectionnés dans un élève
function selectedDaysCount(student) {
    return student.courseDays ? student.courseDays.length : 0;
}

// Synchronisation temps réel
async function syncWithServer() {
    await saveData();
}

function forceSyncNow() {
    syncWithServer();
    showNotification('🔄 Synchronisation forcée !');
}

function setupRealtimeListener() {
    const docRef = db.collection('institut_data').doc('main_data');

    docRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const newAppData = {
                students: data.students || [],
                teachers: data.teachers || [],
                payments: data.payments || [],
                products: data.products || [],
                sales: data.sales || [],
                expenses: data.expenses || [],
                teacherPayments: data.teacherPayments || [],
                monthlyData: data.monthlyData || {}
            };

            // Vérifier si les données ont changé pour éviter les boucles
            if (JSON.stringify(newAppData) !== JSON.stringify(appData)) {
                appData = newAppData;
                refreshAllDisplays();
                console.log('Données mises à jour en temps réel');
            }
        }
    }, (error) => {
        console.error('Erreur listener temps réel:', error);
    });
}

// Téléchargement sauvegarde mensuelle
async function downloadMonthlyBackup() {
    try {
        // Récupérer les données les plus récentes de Firebase
        const docRef = db.collection('institut_data').doc('main_data');
        const doc = await docRef.get();
        let dataToExport = appData;

        if (doc.exists) {
            dataToExport = doc.data();
        }

        const monthData = {
            month: currentMonth,
            year: currentYear,
            students: dataToExport.students || [],
            teachers: dataToExport.teachers || [],
            payments: (dataToExport.payments || []).filter(p => p.month === currentMonth && p.year === currentYear),
            products: dataToExport.products || [],
            sales: (dataToExport.sales || []).filter(s => {
                const saleDate = new Date(s.date);
                return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
            }),
            expenses: (dataToExport.expenses || []).filter(e => e.month === currentMonth && e.year === currentYear),
            exportSource: 'firebase',
            exportDate: new Date().toISOString()
        };

        const dataStr = JSON.stringify(monthData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;

        const months = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

        link.download = `institut_coran_${months[currentMonth]}_${currentYear}.json`;
        link.click();
        URL.revokeObjectURL(url);

        showNotification('📥 Sauvegarde du mois téléchargée !');
    } catch (error) {
        console.error('Erreur export:', error);
        showNotification('❌ Erreur lors de l\'export');
    }
}

// Basculer le statut de paiement
function togglePaymentStatus(paymentId) {
    const payment = appData.payments.find(p => p.id === paymentId);
    if (payment) {
        payment.status = payment.status === 'paid' ? 'unpaid' : 'paid';

        // Mettre à jour le statut de vente correspondant
        const sale = appData.sales.find(s => s.studentId === payment.studentId && s.productName === payment.productName);
        if (sale) {
            sale.status = payment.status;
        }

        saveData();
        refreshAllDisplays();
        showNotification(`💰 Paiement ${payment.status === 'paid' ? 'marqué comme payé' : 'marqué comme non payé'}`);
    }
}

function deleteProduct(productId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
        appData.products = appData.products.filter(p => p.id !== productId);
        saveData();
        refreshAllDisplays();
        showNotification('🗑️ Produit supprimé');
    }
}

// Mise à jour de tous les affichages
function refreshAllDisplays() {
    updateStats();
    updateStudentsList();
    updateTeachersList();
    updateProductsList();
    updateSalesList();
    updatePaymentsList();
    updateTeachersDropdown();
    updateStudentsDropdown();
    updateProductsDropdown();
    updateAccountingDisplays();
}

// Mise à jour des affichages comptables
function updateAccountingDisplays() {
    // Mettre à jour les sélecteurs
    document.getElementById('monthSelector').value = currentMonth;
    document.getElementById('yearSelector').value = currentYear;

    // Calculer les entrées (paiements payés)
    const monthPayments = appData.payments.filter(p =>
        p.month === currentMonth && p.year === currentYear && p.status === 'paid'
    );
    const totalIncome = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    // Calculer les sorties
    const monthExpenses = appData.expenses.filter(e =>
        e.month === currentMonth && e.year === currentYear
    );
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Calculer les salaires des profs
    const teacherSalaries = calculateTeacherSalaries(currentMonth, currentYear);

    // Calculer le bénéfice net
    const netProfit = totalIncome - totalExpenses - teacherSalaries;

    // Afficher les résultats
    document.getElementById('totalIncome').textContent = `${totalIncome}€`;
    document.getElementById('totalExpenses').textContent = `${totalExpenses}€`;
    document.getElementById('totalTeacherSalaries').textContent = `${teacherSalaries}€`;
    document.getElementById('netProfit').textContent = `${netProfit}€`;
    document.getElementById('netProfit').style.color = netProfit >= 0 ? '#28a745' : '#dc3545';

    // Mettre à jour la liste des dépenses
    updateExpensesList();
}

// Mise à jour de la liste des dépenses
function updateExpensesList() {
    const container = document.getElementById('expensesListContainer');
    const countElement = document.getElementById('expensesCount');

    const monthExpenses = appData.expenses.filter(e =>
        e.month === currentMonth && e.year === currentYear
    );

    countElement.textContent = monthExpenses.length;

    if (monthExpenses.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        Aucune sortie enregistrée pour ce mois<br>
                        <small>Ajoutez vos dépenses ci-dessus</small>
                    </div>
                `;
        return;
    }

    const sortedExpenses = [...monthExpenses].sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = sortedExpenses.map(expense => `
                <div class="table-row">
                    <div class="row-content">
                        <strong>${expense.description}</strong><br>
                        <small>💰 ${expense.amount}€ | 📅 ${formatDate(expense.date)}</small>
                    </div>
                    <div class="row-actions">
                        <button class="btn btn-danger" onclick="deleteExpense(${expense.id})">🗑️</button>
                    </div>
                </div>
            `).join('');
}

function deleteExpense(expenseId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) {
        appData.expenses = appData.expenses.filter(e => e.id !== expenseId);
        saveData();
        refreshAllDisplays();
        showNotification('🗑️ Dépense supprimée');
    }
}

// Mise à jour des statistiques
function updateStats() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const currentMonthPayments = appData.payments.filter(p =>
        p.month === currentMonth && p.year === currentYear
    );

    const monthlyRevenue = currentMonthPayments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + p.amount, 0);

    const pendingPayments = currentMonthPayments
        .filter(p => p.status === 'unpaid')
        .reduce((sum, p) => sum + p.amount, 0);

    document.getElementById('totalStudents').textContent = appData.students.length;
    document.getElementById('totalTeachers').textContent = appData.teachers.length;
    document.getElementById('monthlyRevenue').textContent = `${monthlyRevenue}€`;
    document.getElementById('pendingPayments').textContent = `${pendingPayments}€`;
}

// Mise à jour de la liste des élèves
function updateStudentsList() {
    const container = document.getElementById('studentsListContainer');
    const countElement = document.getElementById('studentsCount');

    countElement.textContent = appData.students.length;

    if (appData.students.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        Aucun élève inscrit pour le moment<br>
                        <small>Utilisez le formulaire ci-dessus pour ajouter votre premier élève</small>
                    </div>
                `;
        return;
    }

    container.innerHTML = appData.students.map(student => {
        const teacher = appData.teachers.find(t => t.id.toString() === student.assignedTeacher);
        const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Non assigné';

        let priceInfo = `${student.monthlyPrice}€/mois`;
        if (student.reduction && student.reduction > 0) {
            priceInfo = `${student.monthlyPrice}€/mois (${student.originalPrice}€ - ${student.reduction}€ réduction)`;
        }

        const inscriptionInfo = student.inscriptionType === 'renewal' ? '🔄' : '🆕';

        return `
                    <div class="table-row">
                        <div class="row-content">
                            <strong>${student.firstName} ${student.lastName}</strong> ${inscriptionInfo}<br>
                            <small>📞 ${student.phone || 'Non renseigné'}</small><br>
                            <small>📚 ${getFormulaText(student.formula)} | 👨‍🏫 ${teacherName}</small><br>
                            <small>📅 ${student.courseDays.map(d => d.text).join(', ')} | 💰 ${priceInfo}</small>
                        </div>
                        <div class="row-actions">
                            <button class="btn btn-danger" onclick="deleteStudent(${student.id})">🗑️</button>
                        </div>
                    </div>
                `;
    }).join('');
}

// Mise à jour de la liste des professeurs
function updateTeachersList() {
    const container = document.getElementById('teachersListContainer');
    const countElement = document.getElementById('teachersCount');

    countElement.textContent = appData.teachers.length;

    if (appData.teachers.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        Aucun professeur ajouté pour le moment<br>
                        <small>Utilisez le formulaire ci-dessus pour ajouter votre premier professeur</small>
                    </div>
                `;
        return;
    }

    container.innerHTML = appData.teachers.map(teacher => `
                <div class="table-row">
                    <div class="row-content">
                        <strong>${teacher.firstName} ${teacher.lastName}</strong><br>
                        <small>📚 Spécialité: ${teacher.specialty}</small>
                    </div>
                    <div class="row-actions">
                        <button class="btn btn-danger" onclick="deleteTeacher(${teacher.id})">🗑️</button>
                    </div>
                </div>
            `).join('');
}

// Mise à jour de la liste des produits
function updateProductsList() {
    const container = document.getElementById('productsListContainer');
    const countElement = document.getElementById('productsCount');

    countElement.textContent = appData.products.length;

    if (appData.products.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        Aucun produit ajouté<br>
                        <small>Ajoutez vos premiers produits ci-dessus</small>
                    </div>
                `;
        return;
    }

    container.innerHTML = appData.products.map(product => `
                <div class="table-row">
                    <div class="row-content">
                        <strong>${product.name}</strong><br>
                        <small>💰 ${product.price}€</small><br>
                        ${product.description ? `<small>📋 ${product.description}</small>` : ''}
                    </div>
                    <div class="row-actions">
                        <button class="btn btn-danger" onclick="deleteProduct(${product.id})">🗑️</button>
                    </div>
                </div>
            `).join('');
}

// Mise à jour de l'historique des ventes
function updateSalesList() {
    const container = document.getElementById('salesListContainer');
    const countElement = document.getElementById('salesCount');

    countElement.textContent = appData.sales.length;

    if (appData.sales.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        Aucune vente enregistrée<br>
                        <small>Les ventes apparaîtront ici</small>
                    </div>
                `;
        return;
    }

    const sortedSales = [...appData.sales].sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = sortedSales.map(sale => `
                <div class="table-row">
                    <div class="row-content">
                        <strong>${sale.studentName}</strong><br>
                        <small>📦 ${sale.productName} x${sale.quantity} | 💰 ${sale.totalAmount}€</small><br>
                        <small>📅 ${formatDate(sale.date)} | ${sale.unitPrice}€/unité</small>
                    </div>
                    <div class="row-actions">
                        <span class="status-${sale.status}">
                            ${sale.status === 'paid' ? '✅ Payé' : '❌ Non payé'}
                        </span>
                    </div>
                </div>
            `).join('');
}

// Mise à jour de la liste des paiements
function updatePaymentsList() {
    const container = document.getElementById('paymentsListContainer');
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const currentMonthPayments = appData.payments.filter(p =>
        p.month === currentMonth && p.year === currentYear
    );

    // Résumé financier
    const totalExpected = currentMonthPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalReceived = currentMonthPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    const totalPending = currentMonthPayments.filter(p => p.status === 'unpaid').reduce((sum, p) => sum + p.amount, 0);
    const totalInscription = currentMonthPayments.filter(p => p.type === 'inscription' && p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

    document.getElementById('totalExpectedAmount').textContent = `${totalExpected}€`;
    document.getElementById('totalReceivedAmount').textContent = `${totalReceived}€`;
    document.getElementById('totalPendingAmount').textContent = `${totalPending}€`;
    document.getElementById('totalInscriptionAmount').textContent = `${totalInscription}€`;

    if (currentMonthPayments.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        Aucun paiement à afficher<br>
                        <small>Les paiements apparaîtront quand vous ajouterez des élèves</small>
                    </div>
                `;
        return;
    }

    container.innerHTML = currentMonthPayments.map(payment => {
        let paymentTypeText = '';
        if (payment.type === 'inscription') {
            paymentTypeText = '📝 Frais d\'inscription';
        } else if (payment.type === 'monthly') {
            paymentTypeText = '📅 Mensualité';
        } else if (payment.type === 'product') {
            paymentTypeText = `📦 ${payment.productName}`;
        }

        return `
                    <div class="table-row">
                        <div class="row-content">
                            <strong>${payment.studentName}</strong><br>
                            <small>${paymentTypeText} | 💰 ${payment.amount}€</small><br>
                            <small>📅 Échéance: ${formatDate(payment.dueDate)}</small>
                        </div>
                        <div class="row-actions">
                            <span class="status-${payment.status}" onclick="togglePaymentStatus(${payment.id})">
                                ${payment.status === 'paid' ? '✅ Payé' : '❌ Non payé'}
                            </span>
                        </div>
                    </div>
                `;
    }).join('');
}

// Mise à jour des dropdowns
function updateTeachersDropdown() {
    const select = document.getElementById('assignedTeacher');
    const currentValue = select.value;

    select.innerHTML = '<option value="">-- Sélectionnez un professeur --</option>' +
        appData.teachers.map(teacher =>
            `<option value="${teacher.id}">${teacher.firstName} ${teacher.lastName}</option>`
        ).join('');

    select.value = currentValue;
}

function updateStudentsDropdown() {
    const select = document.getElementById('saleStudentSelect');
    const currentValue = select.value;

    select.innerHTML = '<option value="">-- Sélectionnez un élève --</option>' +
        appData.students.map(student =>
            `<option value="${student.id}">${student.firstName} ${student.lastName}</option>`
        ).join('');

    select.value = currentValue;
}

function updateProductsDropdown() {
    const select = document.getElementById('saleProductSelect');
    const currentValue = select.value;

    select.innerHTML = '<option value="">-- Sélectionnez un produit --</option>' +
        appData.products.map(product =>
            `<option value="${product.id}">${product.name} - ${product.price}€</option>`
        ).join('');

    select.value = currentValue;
}

// AJOUTEZ CETTE FONCTION POUR LA NAVIGATION ENTRE SECTIONS
function switchToSection(sectionId, buttonElement) {
    console.log('Changement vers section:', sectionId);

    // Désactiver tous les boutons
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Masquer toutes les sections
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.remove('active');
    });

    // Activer le bouton cliqué
    buttonElement.classList.add('active');

    // Afficher la section
    document.getElementById(sectionId).classList.add('active');

    // Actualiser les données
    refreshAllDisplays();
}

// Fonctions utilitaires
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const regDate = document.getElementById('registrationDate');
    const expDate = document.getElementById('expenseDate');

    if (regDate) regDate.value = today;
    if (expDate) expDate.value = today;
}

function updateCurrentMonthDisplay() {
    const months = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    const currentDate = new Date();
    const monthName = months[currentDate.getMonth()];
    const year = currentDate.getFullYear();

    const displayElement = document.getElementById('currentMonthDisplay');
    if (displayElement) {
        displayElement.textContent = `${monthName} ${year}`;
    }

    // Initialiser les sélecteurs
    currentMonth = currentDate.getMonth();
    currentYear = currentDate.getFullYear();
}

function getFormulaText(formula) {
    const formulaTexts = {
        'groupe_2h': 'Groupe 2h/semaine',
        'groupe_1h': 'Groupe 1h/semaine',
        'duo': 'Cours en duo',
        'individuel': 'Cours individuel'
    };
    return formulaTexts[formula] || formula;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 400);
    }, 3000);
}

async function saveData() {
    try {
        const docRef = db.collection('institut_data').doc('main_data');
        await docRef.set({
            ...appData,
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById('syncStatus').textContent = 'Synchronisé ✅';
        document.getElementById('syncStatus').style.color = '#28a745';
        console.log('Données sauvegardées dans Firebase');
    } catch (error) {
        console.error('Erreur de sauvegarde Firebase:', error);
        document.getElementById('syncStatus').textContent = 'Erreur sync ❌';
        document.getElementById('syncStatus').style.color = '#dc3545';

        // Fallback vers localStorage en cas d'erreur
        try {
            localStorage.setItem(syncKey, JSON.stringify(appData));
            console.log('Sauvegarde locale effectuée en fallback');
        } catch (localError) {
            console.error('Erreur sauvegarde locale:', localError);
        }
    }
}


async function loadStoredData() {
    try {
        document.getElementById('syncStatus').textContent = 'Chargement...';

        const docRef = db.collection('institut_data').doc('main_data');
        const doc = await docRef.get();

        if (doc.exists) {
            const data = doc.data();
            // Assurer que toutes les propriétés existent
            appData = {
                students: data.students || [],
                teachers: data.teachers || [],
                payments: data.payments || [],
                products: data.products || [],
                sales: data.sales || [],
                expenses: data.expenses || [],
                teacherPayments: data.teacherPayments || [],
                monthlyData: data.monthlyData || {}
            };
            console.log('Données chargées depuis Firebase:', appData);
            document.getElementById('syncStatus').textContent = 'Synchronisé ✅';
            document.getElementById('syncStatus').style.color = '#28a745';
        } else {
            // Essayer de charger depuis localStorage si pas de données Firebase
            await loadFromLocalStorage();
        }
    } catch (error) {
        console.error('Erreur de chargement Firebase:', error);
        document.getElementById('syncStatus').textContent = 'Mode hors-ligne';
        document.getElementById('syncStatus').style.color = '#ffa500';

        // Fallback vers localStorage
        await loadFromLocalStorage();
    }
}
// Fonction fallback pour localStorage
async function loadFromLocalStorage() {
    try {
        const stored = localStorage.getItem(syncKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            appData = {
                students: parsed.students || [],
                teachers: parsed.teachers || [],
                payments: parsed.payments || [],
                products: parsed.products || [],
                sales: parsed.sales || [],
                expenses: parsed.expenses || [],
                teacherPayments: parsed.teacherPayments || [],
                monthlyData: parsed.monthlyData || {}
            };
            console.log('Données chargées depuis localStorage');
        } else {
            // Initialiser avec des données vides
            appData = {
                students: [],
                teachers: [],
                payments: [],
                products: [],
                sales: [],
                expenses: [],
                teacherPayments: [],
                monthlyData: {}
            };
        }
    } catch (error) {
        console.error('Erreur chargement localStorage:', error);
        appData = {
            students: [],
            teachers: [],
            payments: [],
            products: [],
            sales: [],
            expenses: [],
            teacherPayments: [],
            monthlyData: {}
        };
    }
}
