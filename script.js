const firebaseConfig = {
    apiKey: "AIzaSyBGkC7-jcAg5eG2RnLZcpRsGUeCE1Ae0aM",
    authDomain: "institut-coran.firebaseapp.com",
    projectId: "institut-coran",
    storageBucket: "institut-coran.firebasestorage.app",
    messagingSenderId: "339991503694",
    appId: "1:339991503694:web:2550a858d55d75822a741f",
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
    expenses: [],
    teacherPayments: [],
    monthlyData: {}
};

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

// Constantes pour les tarifs
const PRICING = {
    groupe_2h: { price: 4, hours: 2 },
    groupe_1h: { price: 4, hours: 1 },
    duo: 7,
    individuel: 10,
    inscription: 5
};

// Constantes pour les salaires des professeurs
const TEACHER_RATES = {
    groupe_2h: 5,
    groupe_1h: 5,
    duo: 5,
    individuel: 6
};

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Application chargée');

    updateSyncStatus('Initialisation...');

    await loadStoredData();
    updateCurrentMonthDisplay();
    setDefaultDate();
    refreshAllDisplays();
    setupEventListeners();

    // Synchronisation automatique
    startAutoSync();

    console.log('Application initialisée');
});

// Synchronisation forcée
async function forceSyncNow() {
    updateSyncStatus('Synchronisation...');
    await saveData();
    showNotification('Synchronisation forcée !');
}

// Configuration des événements
function setupEventListeners() {
    const forms = [
        { id: 'studentForm', handler: addNewStudent },
        { id: 'teacherForm', handler: addNewTeacher },
        { id: 'productForm', handler: addNewProduct },
        { id: 'saleForm', handler: sellProductToStudent },
        { id: 'expenseForm', handler: addNewExpense }
    ];

    forms.forEach(form => {
        const element = document.getElementById(form.id);
        if (element) element.addEventListener('submit', form.handler);
    });

    // Calculs en temps réel pour les élèves
    const studentCalculationElements = [
        'studentFormula', 'studentHours', 'studentReduction',
        'inscriptionType', 'registrationDate'
    ];

    studentCalculationElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener('change', calculateStudentPrice);
    });

    // Calcul total vente
    const saleElements = ['saleProductSelect', 'saleQuantity'];
    saleElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener('change', updateSaleTotal);
    });
}

// Démarrage de la synchronisation automatique
function startAutoSync() {
    setInterval(async () => {
        await saveData();
    }, 10000); // Toutes les 10 secondes
}

// Navigation entre sections
function switchToSection(sectionId, buttonElement) {
    console.log('Changement vers section:', sectionId);

    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
    });

    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.remove('active');
    });

    buttonElement.classList.add('active');
    document.getElementById(sectionId).classList.add('active');

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

// Calcul des prix - CORRIGÉ
function calculateStudentPrice() {
    const formula = document.getElementById('studentFormula').value;
    const hours = parseFloat(document.getElementById('studentHours').value) || 1;
    const registrationDate = document.getElementById('registrationDate').value;
    const selectedDays = getSelectedCourseDays();
    const reduction = parseFloat(document.getElementById('studentReduction').value) || 0;
    const inscriptionType = document.getElementById('inscriptionType').value;

    if (!formula || selectedDays.length === 0) {
        document.getElementById('fullMonthlyPrice').value = '';
        document.getElementById('prorataPrice').value = '';
        document.getElementById('calculationDetails').value = '';
        return;
    }

    // Calcul correct du prix mensuel
    let fullMonthlyPrice = 0;

    if (formula === 'groupe_2h' || formula === 'groupe_1h') {
        // Pour les groupes : nombre de jours × 4 semaines × tarif par cours
        fullMonthlyPrice = selectedDays.length * 4 * PRICING[formula].price;
    } else if (formula === 'duo') {
        // Pour duo : heures par cours × nombre de jours × 4 semaines × tarif
        fullMonthlyPrice = hours * selectedDays.length * 4 * PRICING.duo;
    } else if (formula === 'individuel') {
        // Pour individuel : heures par cours × nombre de jours × 4 semaines × tarif
        fullMonthlyPrice = hours * selectedDays.length * 4 * PRICING.individuel;
    }

    const finalMonthlyPrice = Math.max(0, fullMonthlyPrice - reduction);

    let priceText = `${finalMonthlyPrice}€`;
    if (reduction > 0) {
        priceText += ` (prix initial: ${fullMonthlyPrice}€ - réduction: ${reduction}€)`;
    }
    document.getElementById('fullMonthlyPrice').value = priceText;

    // Calcul du prorata
    if (registrationDate && finalMonthlyPrice > 0) {
        const prorataData = calculateProrata(registrationDate, selectedDays, finalMonthlyPrice, formula, hours);

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
            details += ` + ${PRICING.inscription}€ frais d'inscription`;
        } else {
            details += ` (renouvellement - pas de frais d'inscription)`;
        }

        document.getElementById('calculationDetails').value = details;
    } else {
        document.getElementById('prorataPrice').value = '';
        document.getElementById('calculationDetails').value = '';
    }
}

// Calcul du prorata - CORRIGÉ
function calculateProrata(registrationDate, courseDays, monthlyPrice, formula, hours) {
    const regDate = new Date(registrationDate);
    const year = regDate.getFullYear();
    const month = regDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let remainingCourseDays = 0;

    // Compter les jours de cours restants dans le mois
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

    let prorataAmount = 0;
    let details = '';

    if (formula === 'groupe_2h' || formula === 'groupe_1h') {
        prorataAmount = remainingCourseDays * PRICING[formula].price;
        details = `${remainingCourseDays} cours × ${PRICING[formula].price}€ = ${prorataAmount}€`;
    } else if (formula === 'duo') {
        const totalHours = remainingCourseDays * hours;
        prorataAmount = totalHours * PRICING.duo;
        details = `${totalHours}h (${remainingCourseDays} cours × ${hours}h) × ${PRICING.duo}€/h = ${prorataAmount}€`;
    } else if (formula === 'individuel') {
        const totalHours = remainingCourseDays * hours;
        prorataAmount = totalHours * PRICING.individuel;
        details = `${totalHours}h (${remainingCourseDays} cours × ${hours}h) × ${PRICING.individuel}€/h = ${prorataAmount}€`;
    }

    return { amount: prorataAmount, details: details };
}

// Ajout d'un élève - OPTIMISÉ
function addNewStudent(event) {
    event.preventDefault();
    console.log("Ajout d'un élève - début");

    const formData = getStudentFormData();

    if (!validateStudentForm(formData)) {
        return;
    }

    const student = createStudentObject(formData);
    appData.students.push(student);

    createStudentPayments(student, formData);

    saveData();
    refreshAllDisplays();
    resetStudentForm();

    showNotification('Élève ajouté avec succès !');
    console.log("Ajout d'un élève - terminé");
}

// Récupération des données du formulaire élève
function getStudentFormData() {
    return {
        firstName: document.getElementById('studentFirstName').value.trim(),
        lastName: document.getElementById('studentLastName').value.trim(),
        phone: document.getElementById('studentPhone').value.trim(),
        formula: document.getElementById('studentFormula').value,
        hours: parseFloat(document.getElementById('studentHours').value) || 1,
        registrationDate: document.getElementById('registrationDate').value,
        assignedTeacher: document.getElementById('assignedTeacher').value,
        selectedDays: getSelectedCourseDays(),
        reduction: parseFloat(document.getElementById('studentReduction').value) || 0,
        inscriptionType: document.getElementById('inscriptionType').value
    };
}

// Validation du formulaire élève
function validateStudentForm(formData) {
    if (!formData.firstName || !formData.lastName || !formData.formula) {
        alert('Veuillez remplir tous les champs obligatoires.');
        return false;
    }

    if (formData.selectedDays.length === 0) {
        alert('Veuillez sélectionner au moins un jour de cours.');
        return false;
    }

    return true;
}

// Création de l'objet élève
function createStudentObject(formData) {
    let fullMonthlyPrice = 0;

    if (formData.formula === 'groupe_2h' || formData.formula === 'groupe_1h') {
        fullMonthlyPrice = formData.selectedDays.length * 4 * PRICING[formData.formula].price;
    } else if (formData.formula === 'duo') {
        fullMonthlyPrice = formData.hours * formData.selectedDays.length * 4 * PRICING.duo;
    } else if (formData.formula === 'individuel') {
        fullMonthlyPrice = formData.hours * formData.selectedDays.length * 4 * PRICING.individuel;
    }

    const finalMonthlyPrice = Math.max(0, fullMonthlyPrice - formData.reduction);
    const prorataData = calculateProrata(formData.registrationDate, formData.selectedDays, finalMonthlyPrice, formData.formula, formData.hours);

    return {
        id: Date.now(),
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        formula: formData.formula,
        hours: formData.hours,
        courseDays: formData.selectedDays,
        registrationDate: formData.registrationDate,
        assignedTeacher: formData.assignedTeacher,
        monthlyPrice: finalMonthlyPrice,
        originalPrice: fullMonthlyPrice,
        reduction: formData.reduction,
        inscriptionType: formData.inscriptionType,
        prorataAmount: prorataData.amount,
        status: 'active'
    };
}

// Création des paiements pour un élève
function createStudentPayments(student, formData) {
    const registrationMonth = new Date(formData.registrationDate);
    const baseId = Date.now();

    // Frais d'inscription pour les nouveaux élèves
    if (formData.inscriptionType === 'new') {
        appData.payments.push({
            id: baseId + 1,
            studentId: student.id,
            studentName: `${formData.firstName} ${formData.lastName}`,
            type: 'inscription',
            amount: PRICING.inscription,
            month: registrationMonth.getMonth(),
            year: registrationMonth.getFullYear(),
            status: 'unpaid',
            dueDate: formData.registrationDate
        });
    }

    // Paiement prorata si montant > 0
    if (student.prorataAmount > 0) {
        appData.payments.push({
            id: baseId + 2,
            studentId: student.id,
            studentName: `${formData.firstName} ${formData.lastName}`,
            type: 'monthly',
            amount: student.prorataAmount,
            month: registrationMonth.getMonth(),
            year: registrationMonth.getFullYear(),
            status: 'unpaid',
            dueDate: formData.registrationDate
        });
    }
}

// Réinitialisation du formulaire élève
function resetStudentForm() {
    document.getElementById('studentForm').reset();
    resetDaySelection();
    setDefaultDate();
    document.getElementById('fullMonthlyPrice').value = '';
    document.getElementById('prorataPrice').value = '';
    document.getElementById('calculationDetails').value = '';
}

// Ajout d'un professeur
function addNewTeacher(event) {
    event.preventDefault();
    console.log('Ajout d\'un professeur');

    const firstName = document.getElementById('teacherFirstName').value.trim();
    const lastName = document.getElementById('teacherLastName').value.trim();
    const specialty = document.getElementById('teacherSpecialty').value;

    if (!firstName || !lastName || !specialty) {
        alert('Veuillez remplir tous les champs.');
        return;
    }

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
    showNotification('Professeur ajouté avec succès !');
}

// Ajout d'un produit
function addNewProduct(event) {
    event.preventDefault();
    console.log('Ajout d\'un produit');

    const name = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const description = document.getElementById('productDescription').value.trim();

    if (!name || isNaN(price) || price <= 0) {
        alert('Veuillez remplir correctement le nom et le prix.');
        return;
    }

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
    showNotification('Produit ajouté avec succès !');
}

// Vente d'un produit - OPTIMISÉ
function sellProductToStudent(event) {
    event.preventDefault();
    console.log('Vente d\'un produit');

    const studentId = parseInt(document.getElementById('saleStudentSelect').value);
    const productId = parseInt(document.getElementById('saleProductSelect').value);
    const quantity = parseInt(document.getElementById('saleQuantity').value);

    if (!studentId || !productId || !quantity || quantity <= 0) {
        alert('Veuillez remplir tous les champs correctement.');
        return;
    }

    const student = appData.students.find(s => s.id === studentId);
    const product = appData.products.find(p => p.id === productId);

    if (!student || !product) {
        alert('Erreur: élève ou produit introuvable');
        return;
    }

    const totalAmount = product.price * quantity;
    const currentDate = new Date();

    // Enregistrement de la vente
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

    // Création du paiement associé
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

    showNotification('Vente enregistrée avec succès !');
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

// Suppression d'éléments - SÉCURISÉ
function deleteStudent(studentId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet élève ? Cette action supprimera également tous ses paiements et ventes.')) {
        return;
    }

    appData.students = appData.students.filter(s => s.id !== studentId);
    appData.payments = appData.payments.filter(p => p.studentId !== studentId);
    appData.sales = appData.sales.filter(s => s.studentId !== studentId);

    saveData();
    refreshAllDisplays();
    showNotification('Élève supprimé');
}

function deleteTeacher(teacherId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce professeur ?')) {
        return;
    }

    appData.teachers = appData.teachers.filter(t => t.id !== teacherId);
    saveData();
    refreshAllDisplays();
    showNotification('Professeur supprimé');
}

function deleteProduct(productId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
        return;
    }

    appData.products = appData.products.filter(p => p.id !== productId);
    saveData();
    refreshAllDisplays();
    showNotification('Produit supprimé');
}

// Ajout d'une dépense
function addNewExpense(event) {
    event.preventDefault();
    console.log('Ajout d\'une dépense');

    const description = document.getElementById('expenseDescription').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value;

    if (!description || isNaN(amount) || amount <= 0 || !date) {
        alert('Veuillez remplir tous les champs correctement.');
        return;
    }

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

    showNotification('Dépense ajoutée avec succès !');
}

function deleteExpense(expenseId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) {
        return;
    }

    appData.expenses = appData.expenses.filter(e => e.id !== expenseId);
    saveData();
    refreshAllDisplays();
    showNotification('Dépense supprimée');
}

// Changer de mois dans la comptabilité
function changeMonth() {
    currentMonth = parseInt(document.getElementById('monthSelector').value);
    currentYear = parseInt(document.getElementById('yearSelector').value);
    updateAccountingDisplays();
}

// Calcul des salaires des professeurs - CORRIGÉ
function calculateTeacherSalaries(month, year) {
    let totalSalaries = 0;

    const paidPayments = appData.payments.filter(p =>
        p.month === month &&
        p.year === year &&
        p.status === 'paid' &&
        p.type === 'monthly' // Seulement les mensualités, pas les inscriptions ni les produits
    );

    paidPayments.forEach(payment => {
        const student = appData.students.find(s => s.id === payment.studentId);
        if (student && student.assignedTeacher) {
            const teacherRate = TEACHER_RATES[student.formula] || 0;

            // Calcul basé sur le nombre d'heures réelles enseignées
            let hoursPerWeek = 0;
            if (student.formula === 'groupe_2h') {
                hoursPerWeek = student.courseDays.length * PRICING.groupe_2h.hours;
            } else if (student.formula === 'groupe_1h') {
                hoursPerWeek = student.courseDays.length * PRICING.groupe_1h.hours;
            } else {
                hoursPerWeek = student.courseDays.length * student.hours;
            }

            // 4 semaines par mois
            const monthlyHours = hoursPerWeek * 4;
            const teacherPayment = monthlyHours * teacherRate;

            totalSalaries += teacherPayment;
        }
    });

    return Math.round(totalSalaries * 100) / 100;
}

// Synchronisation avec le serveur
async function saveData() {
    try {
        const docRef = db.collection('institut_data').doc('main_data');
        await docRef.set({
            ...appData,
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });

        updateSyncStatus('Synchronisé ✅', '#28a745');
        console.log('Données sauvegardées dans Firebase');
    } catch (error) {
        console.error('Erreur de sauvegarde Firebase:', error);
        updateSyncStatus('Erreur sync ❌', '#dc3545');
        showNotification('Erreur de synchronisation');
    }
}

// Chargement des données stockées
async function loadStoredData() {
    try {
        updateSyncStatus('Chargement...');

        const docRef = db.collection('institut_data').doc('main_data');
        const doc = await docRef.get();

        if (doc.exists) {
            const data = doc.data();
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
            updateSyncStatus('Synchronisé ✅', '#28a745');
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
            console.log('Nouveau document Firebase - données initialisées');
            updateSyncStatus('Nouveau ✨', '#007bff');
        }
    } catch (error) {
        console.error('Erreur de chargement Firebase:', error);
        updateSyncStatus('Hors-ligne ⚠️', '#ffa500');

        // Initialiser avec des données vides en cas d'erreur
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

        showNotification('Mode hors-ligne - vérifiez votre connexion');
    }
}

// Configuration de l'écoute en temps réel (optionnel)
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

        showNotification('Sauvegarde du mois téléchargée !');
    } catch (error) {
        console.error('Erreur export:', error);
        showNotification('Erreur lors de l\'export');
    }
}

// Basculer le statut de paiement
function togglePaymentStatus(paymentId) {
    const payment = appData.payments.find(p => p.id === paymentId);
    if (payment) {
        payment.status = payment.status === 'paid' ? 'unpaid' : 'paid';

        // Synchroniser avec les ventes si c'est un produit
        const sale = appData.sales.find(s => s.studentId === payment.studentId && s.productName === payment.productName);
        if (sale) {
            sale.status = payment.status;
        }

        saveData();
        refreshAllDisplays();
        showNotification(`Paiement ${payment.status === 'paid' ? 'marqué comme payé' : 'marqué comme non payé'}`);
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
    const monthSelector = document.getElementById('monthSelector');
    const yearSelector = document.getElementById('yearSelector');

    if (monthSelector) monthSelector.value = currentMonth;
    if (yearSelector) yearSelector.value = currentYear;

    const monthPayments = appData.payments.filter(p =>
        p.month === currentMonth && p.year === currentYear && p.status === 'paid'
    );
    const totalIncome = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    const monthExpenses = appData.expenses.filter(e =>
        e.month === currentMonth && e.year === currentYear
    );
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

    const teacherSalaries = calculateTeacherSalaries(currentMonth, currentYear);
    const netProfit = totalIncome - totalExpenses - teacherSalaries;

    // Mise à jour sécurisée des éléments DOM
    updateElementText('totalIncome', `${totalIncome}€`);
    updateElementText('totalExpenses', `${totalExpenses}€`);
    updateElementText('totalTeacherSalaries', `${teacherSalaries}€`);

    const netProfitElement = document.getElementById('netProfit');
    if (netProfitElement) {
        netProfitElement.textContent = `${netProfit}€`;
        netProfitElement.style.color = netProfit >= 0 ? '#28a745' : '#dc3545';
    }

    updateExpensesList();
}

// Mise à jour de la liste des dépenses
function updateExpensesList() {
    const container = document.getElementById('expensesListContainer');
    const countElement = document.getElementById('expensesCount');

    const monthExpenses = appData.expenses.filter(e =>
        e.month === currentMonth && e.year === currentYear
    );

    if (countElement) countElement.textContent = monthExpenses.length;

    if (!container) return;

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
                <strong>${escapeHtml(expense.description)}</strong><br>
                <small>💰 ${expense.amount}€ | 📅 ${formatDate(expense.date)}</small>
            </div>
            <div class="row-actions">
                <button class="btn btn-danger" onclick="deleteExpense(${expense.id})">🗑️</button>
            </div>
        </div>
    `).join('');
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

    updateElementText('totalStudents', appData.students.length);
    updateElementText('totalTeachers', appData.teachers.length);
    updateElementText('monthlyRevenue', `${monthlyRevenue}€`);
    updateElementText('pendingPayments', `${pendingPayments}€`);
}

// Mise à jour de la liste des élèves
function updateStudentsList() {
    const container = document.getElementById('studentsListContainer');
    const countElement = document.getElementById('studentsCount');

    if (countElement) countElement.textContent = appData.students.length;
    if (!container) return;

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
        const courseDaysText = student.courseDays ? student.courseDays.map(d => d.text).join(', ') : '';

        return `
            <div class="table-row">
                <div class="row-content">
                    <strong>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</strong> ${inscriptionInfo}<br>
                    <small>📞 ${escapeHtml(student.phone || 'Non renseigné')}</small><br>
                    <small>📚 ${getFormulaText(student.formula)} | 👨‍🏫 ${escapeHtml(teacherName)}</small><br>
                    <small>📅 ${courseDaysText} | 💰 ${priceInfo}</small>
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

    if (countElement) countElement.textContent = appData.teachers.length;
    if (!container) return;

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
                <strong>${escapeHtml(teacher.firstName)} ${escapeHtml(teacher.lastName)}</strong><br>
                <small>📚 Spécialité: ${escapeHtml(teacher.specialty)}</small>
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

    if (countElement) countElement.textContent = appData.products.length;
    if (!container) return;

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
                <strong>${escapeHtml(product.name)}</strong><br>
                <small>💰 ${product.price}€</small><br>
                ${product.description ? `<small>📋 ${escapeHtml(product.description)}</small>` : ''}
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

    if (countElement) countElement.textContent = appData.sales.length;
    if (!container) return;

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
                <strong>${escapeHtml(sale.studentName)}</strong><br>
                <small>📦 ${escapeHtml(sale.productName)} x${sale.quantity} | 💰 ${sale.totalAmount}€</small><br>
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
    if (!container) return;

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const currentMonthPayments = appData.payments.filter(p =>
        p.month === currentMonth && p.year === currentYear
    );

    const totalExpected = currentMonthPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalReceived = currentMonthPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    const totalPending = currentMonthPayments.filter(p => p.status === 'unpaid').reduce((sum, p) => sum + p.amount, 0);
    const totalInscription = currentMonthPayments.filter(p => p.type === 'inscription' && p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

    updateElementText('totalExpectedAmount', `${totalExpected}€`);
    updateElementText('totalReceivedAmount', `${totalReceived}€`);
    updateElementText('totalPendingAmount', `${totalPending}€`);
    updateElementText('totalInscriptionAmount', `${totalInscription}€`);

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
            paymentTypeText = `📦 ${escapeHtml(payment.productName || '')}`;
        }

        return `
            <div class="table-row">
                <div class="row-content">
                    <strong>${escapeHtml(payment.studentName)}</strong><br>
                    <small>${paymentTypeText} | 💰 ${payment.amount}€</small><br>
                    <small>📅 Échéance: ${formatDate(payment.dueDate)}</small>
                </div>
                <div class="row-actions">
                    <span class="status-${payment.status}" onclick="togglePaymentStatus(${payment.id})" style="cursor: pointer;">
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
    if (!select) return;

    const currentValue = select.value;

    select.innerHTML = '<option value="">-- Sélectionnez un professeur --</option>' +
        appData.teachers.map(teacher =>
            `<option value="${teacher.id}">${escapeHtml(teacher.firstName)} ${escapeHtml(teacher.lastName)}</option>`
        ).join('');

    select.value = currentValue;
}

function updateStudentsDropdown() {
    const select = document.getElementById('saleStudentSelect');
    if (!select) return;

    const currentValue = select.value;

    select.innerHTML = '<option value="">-- Sélectionnez un élève --</option>' +
        appData.students.map(student =>
            `<option value="${student.id}">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</option>`
        ).join('');

    select.value = currentValue;
}

function updateProductsDropdown() {
    const select = document.getElementById('saleProductSelect');
    if (!select) return;

    const currentValue = select.value;

    select.innerHTML = '<option value="">-- Sélectionnez un produit --</option>' +
        appData.products.map(product =>
            `<option value="${product.id}">${escapeHtml(product.name)} - ${product.price}€</option>`
        ).join('');

    select.value = currentValue;
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
    if (!dateString) return '';
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

// Fonction utilitaire pour la mise à jour sécurisée des éléments DOM
function updateElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    }
}

// Fonction utilitaire pour échapper le HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Fonction utilitaire pour la mise à jour du statut de synchronisation
function updateSyncStatus(message, color = null) {
    const statusElement = document.getElementById('syncStatus');
    if (statusElement) {
        statusElement.textContent = message;
        if (color) {
            statusElement.style.color = color;
        }
    }
}