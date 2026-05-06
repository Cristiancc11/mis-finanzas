
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }


// ============================================================


// ============================================================
// SUPABASE AUTH & SYNC
// ============================================================
const SUPABASE_URL = 'https://safxdvagmrkpkyzpghtt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sc5mjkLrctQfU4AEz3rfAg_Q8SFLJpY';
const STORAGE_KEY_GLOBAL = 'finance-dashboard-cristian-v20';

let supabaseClient = null;
let currentUser = null;
let authMode = 'login'; // 'login' o 'signup'
let saveTimeout = null;
let isLoadingFromCloud = false;

// Inicializar Supabase
function initSupabase() {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch (e) {
    console.error('Error inicializando Supabase:', e);
    return false;
  }
}

// Verificar si hay sesión activa al cargar
async function checkAuth() {
  // TIMEOUT DE SEGURIDAD: si pasan 10s sin terminar, forzar que se oculte el loading
  const safetyTimeout = setTimeout(() => {
    console.warn('Loading screen timeout - forzando cierre');
    hideLoadingScreen();
    showAuthScreen();
  }, 10000);

  if (!initSupabase()) {
    clearTimeout(safetyTimeout);
    hideLoadingScreen();
    showAuthScreen();
    return;
  }

  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    if (session && session.user) {
      currentUser = session.user;
      await loadFromCloud();
      clearTimeout(safetyTimeout);
      hideLoadingScreen();
      hideAuthScreen();
      // Mostrar botón migrar si hay datos locales
      checkLocalData();
    } else {
      clearTimeout(safetyTimeout);
      hideLoadingScreen();
      showAuthScreen();
    }
  } catch (e) {
    console.error('Error checking auth:', e);
    clearTimeout(safetyTimeout);
    hideLoadingScreen();
    showAuthScreen();
  }
}

function showAuthScreen() {
  const el = document.getElementById('auth-screen');
  if (el) el.style.display = 'flex';
}
function hideAuthScreen() {
  const el = document.getElementById('auth-screen');
  if (el) el.style.display = 'none';
}
function hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  // Forzar oculto con todos los métodos posibles
  el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;';
  el.setAttribute('hidden', 'true');
  // Remover del DOM por si hay z-index conflict
  try {
    if (el.parentNode) el.parentNode.removeChild(el);
  } catch(e) {
    console.warn('No se pudo remover loading screen del DOM:', e);
  }
  console.log('🎯 Loading screen oculto');
}

function switchAuthTab(mode) {
  authMode = mode;
  const loginTab = document.getElementById('tab-login');
  const signupTab = document.getElementById('tab-signup');
  const submitBtn = document.getElementById('auth-submit');

  if (mode === 'login') {
    loginTab.style.background = 'var(--bg-primary)';
    loginTab.style.color = 'var(--text-primary)';
    signupTab.style.background = 'transparent';
    signupTab.style.color = 'var(--text-secondary)';
    submitBtn.textContent = 'Iniciar sesión';
  } else {
    signupTab.style.background = 'var(--bg-primary)';
    signupTab.style.color = 'var(--text-primary)';
    loginTab.style.background = 'transparent';
    loginTab.style.color = 'var(--text-secondary)';
    submitBtn.textContent = 'Crear cuenta';
  }
  showAuthMessage('', '');
}

function showAuthMessage(msg, type) {
  const errEl = document.getElementById('auth-error');
  const sucEl = document.getElementById('auth-success');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';
  if (!msg) return;
  if (type === 'error') {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  } else {
    sucEl.textContent = msg;
    sucEl.style.display = 'block';
  }
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const submitBtn = document.getElementById('auth-submit');

  if (!email || !password) {
    showAuthMessage('Completa email y contraseña', 'error');
    return;
  }
  if (password.length < 6) {
    showAuthMessage('La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('btn-loading');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Cargando...';

  try {
    let result;
    if (authMode === 'login') {
      result = await supabaseClient.auth.signInWithPassword({ email, password });
    } else {
      result = await supabaseClient.auth.signUp({ email, password });
    }

    if (result.error) throw result.error;

    if (authMode === 'signup') {
      showAuthMessage('¡Cuenta creada! Iniciando sesión...', 'success');
      // Auto-login después del signup
      setTimeout(async () => {
        const loginResult = await supabaseClient.auth.signInWithPassword({ email, password });
        if (loginResult.error) throw loginResult.error;
        currentUser = loginResult.data.user;
        hideAuthScreen();
        const ls = document.getElementById('loading-screen');
        if (ls) {
          ls.style.display = 'flex';
          ls.style.opacity = '1';
          ls.style.pointerEvents = 'auto';
        }
        await loadFromCloud();
        hideLoadingScreen();
        checkLocalData();
      }, 800);
    } else {
      currentUser = result.data.user;
      hideAuthScreen();
      const ls = document.getElementById('loading-screen');
      if (ls) {
        ls.style.display = 'flex';
        ls.style.opacity = '1';
        ls.style.pointerEvents = 'auto';
      }
      await loadFromCloud();
      hideLoadingScreen();
      checkLocalData();
    }
  } catch (e) {
    console.error('Auth error:', e);
    let msg = e.message || 'Error de autenticación';
    if (msg.includes('Invalid login')) msg = 'Email o contraseña incorrectos';
    if (msg.includes('already registered')) msg = 'Este email ya está registrado. Inicia sesión.';
    if (msg.includes('weak password')) msg = 'Contraseña débil. Usa al menos 6 caracteres.';
    showAuthMessage(msg, 'error');
    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-loading');
    submitBtn.textContent = authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
  }
}

async function handleLogout() {
  const confirmed = await showConfirm({
    title: '¿Cerrar sesión?',
    message: 'Tus datos están guardados de forma segura en la nube. Puedes volver a entrar cuando quieras.',
    confirmText: 'Sí, cerrar sesión',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: '👋'
  });
  if (!confirmed) return;
  try {
    await supabaseClient.auth.signOut();
    currentUser = null;
    location.reload();
  } catch (e) {
    console.error('Logout error:', e);
    toastError('Error al cerrar sesión', 'Intenta de nuevo');
  }
}

async function loadFromCloud() {
  if (!currentUser || !supabaseClient) return;
  isLoadingFromCloud = true;
  try {
    const { data, error } = await supabaseClient
      .from('dashboard_data')
      .select('data')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    if (data && data.data && Object.keys(data.data).length > 0 && data.data.pockets) {
      // Hay datos en la nube → cargarlos
      localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(data.data));
      console.log('✅ Datos cargados desde la nube');
      updateSyncIndicator('Sincronizado ☁️');
    } else {
      // No hay datos en la nube → arrancar con datos según el tipo de usuario
      const ownerEmails = ['cristiancamilo_cc@hotmail.com']; // emails autorizados
      const isOwner = currentUser.email && ownerEmails.includes(currentUser.email.toLowerCase());

      if (isOwner && typeof MY_STATE !== 'undefined') {
        // Si es el dueño, cargar sus datos
        console.log('👑 Cargando datos del propietario');
        localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(MY_STATE));
        // Subir inmediatamente a la nube para que queden sincronizados
        await supabaseClient.from('dashboard_data').upsert({
          user_id: currentUser.id,
          data: MY_STATE
        }, { onConflict: 'user_id' });
        updateSyncIndicator('Datos cargados ☁️');
      } else {
        // Usuario nuevo: arrancar con plantilla vacía
        console.log('🆕 Usuario nuevo - cargando plantilla vacía');
        if (typeof EMPTY_STATE !== 'undefined') {
          // Marcar como nuevo usuario para que aparezca el tutorial
          const newUserState = { ...EMPTY_STATE, isNewUser: true };
          localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(newUserState));
          await supabaseClient.from('dashboard_data').upsert({
            user_id: currentUser.id,
            data: newUserState
          }, { onConflict: 'user_id' });
        }
        updateSyncIndicator('Cuenta nueva ☁️');
        // Mostrar tutorial moderno después de un momento
        setTimeout(() => {
          if (typeof showWelcomeTutorial === 'function') {
            showWelcomeTutorial();
          }
        }, 1500);
      }
    }
  } catch (e) {
    console.error('Error loading from cloud:', e);
    updateSyncIndicator('Error al sincronizar ⚠️');
  }
  isLoadingFromCloud = false;
  
  // Forzar refresh del estado en pantalla
  console.log('🔄 Refrescando interfaz...');
  if (typeof window.loadState === 'function') {
    try {
      window.loadState();
      console.log('✅ Interfaz actualizada');
      
      // Aplicar preferencias visuales sincronizadas
      if (typeof applyVisualPreferences === 'function') {
        applyVisualPreferences();
        console.log('🎨 Preferencias visuales aplicadas');
      }
      
      hideLoadingScreen();
      sessionStorage.removeItem('reload_attempted'); // Limpiar flag al cargar OK
    } catch(e) {
      console.error('❌ Error en loadState:', e);
      hideLoadingScreen();
      // Si falla, recargar la página solo si no se ha intentado ya
      if (!sessionStorage.getItem('reload_attempted')) {
        sessionStorage.setItem('reload_attempted', '1');
        console.log('🔄 Recargando página por seguridad...');
        setTimeout(() => location.reload(), 500);
      }
    }
  } else {
    console.warn('⚠️ window.loadState no disponible');
    hideLoadingScreen();
    if (!sessionStorage.getItem('reload_attempted')) {
      sessionStorage.setItem('reload_attempted', '1');
      console.log('🔄 Recargando página por seguridad...');
      setTimeout(() => location.reload(), 500);
    }
  }
}

async function saveToCloud(data) {
  if (!currentUser || !supabaseClient || isLoadingFromCloud) return;

  // Debounce: esperar 1.5 segundos antes de guardar
  if (saveTimeout) clearTimeout(saveTimeout);
  updateSyncIndicator('Guardando...');

  saveTimeout = setTimeout(async () => {
    try {
      const { error } = await supabaseClient
        .from('dashboard_data')
        .upsert({
          user_id: currentUser.id,
          data: data
        }, { onConflict: 'user_id' });

      if (error) throw error;
      updateSyncIndicator('Sincronizado ☁️ ' + new Date().toLocaleTimeString('es-CO', {hour: '2-digit', minute: '2-digit'}));
    } catch (e) {
      console.error('Error saving to cloud:', e);
      updateSyncIndicator('Error al guardar ⚠️');
    }
  }, 1500);
}

function updateSyncIndicator(text) {
  const el = document.getElementById('sync-indicator');
  if (el) el.textContent = text;
}

function checkLocalData() {
  // Si hay datos locales y se acaba de crear cuenta nueva, mostrar botón migrar
  const local = localStorage.getItem(STORAGE_KEY_GLOBAL);
  const migrateBtn = document.getElementById('migrate-btn');
  if (local && migrateBtn) {
    try {
      const parsed = JSON.parse(local);
      if (parsed && parsed.pockets && parsed.pockets.length > 0) {
        // Hay datos locales con contenido
        migrateBtn.style.display = 'inline-flex';
      }
    } catch(e) {}
  }
}

async function migrateLocalData() {
  const local = localStorage.getItem(STORAGE_KEY_GLOBAL);
  if (!local) {
    alert('No hay datos locales para migrar');
    return;
  }
  if (!confirm('Esto subirá tus datos del navegador a la nube. ¿Continuar?')) return;

  try {
    const data = JSON.parse(local);
    const { error } = await supabaseClient
      .from('dashboard_data')
      .upsert({
        user_id: currentUser.id,
        data: data
      }, { onConflict: 'user_id' });

    if (error) throw error;
    toastSuccess('Datos sincronizados', 'Tus datos están guardados en la nube');
    document.getElementById('migrate-btn').style.display = 'none';
    updateSyncIndicator('Sincronizado ☁️');
  } catch (e) {
    console.error('Error migrando:', e);
    alert('Error al migrar: ' + e.message);
  }
}

// Hook al localStorage para sincronizar automáticamente
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
  originalSetItem(key, value);
  if (key === STORAGE_KEY_GLOBAL && currentUser && !isLoadingFromCloud) {
    try {
      const data = JSON.parse(value);
      saveToCloud(data);
    } catch(e) {
      console.error('Error parsing for sync:', e);
    }
  }
};

// Iniciar al cargar la página
window.addEventListener('load', () => {
  // Pequeño delay para que el DOM esté listo
  setTimeout(checkAuth, 100);

  // FAILSAFE: si por alguna razón el loading screen sigue visible después de 12s, ocultarlo
  setTimeout(() => {
    const ls = document.getElementById('loading-screen');
    if (ls && ls.style.display !== 'none' && ls.style.opacity !== '0') {
      console.warn('FAILSAFE: forzando cierre del loading screen');
      ls.style.display = 'none';
      // Si no hay sesión, mostrar login
      if (!currentUser) {
        const auth = document.getElementById('auth-screen');
        if (auth) auth.style.display = 'flex';
      }
    }
  }, 12000);
});

// Permitir Enter para enviar el formulario de login
document.addEventListener('DOMContentLoaded', () => {
  const passInput = document.getElementById('auth-password');
  const emailInput = document.getElementById('auth-email');
  if (passInput) {
    passInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAuth();
    });
  }
  if (emailInput) {
    emailInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAuth();
    });
  }
});

// Exponer funciones al scope global
window.handleAuth = handleAuth;
window.handleLogout = handleLogout;
window.switchAuthTab = switchAuthTab;
window.migrateLocalData = migrateLocalData;

// ============================================================
// RECUPERAR CONTRASEÑA
// ============================================================

async function handleForgotPassword() {
  // Pedir email con modal bonito
  const emailInput = document.getElementById('auth-email');
  const prefilledEmail = emailInput ? emailInput.value.trim() : '';

  const email = await showPrompt({
    title: '🔑 Recuperar contraseña',
    message: 'Te enviaremos un correo con un enlace para crear una nueva contraseña.',
    placeholder: 'tu@correo.com',
    defaultValue: prefilledEmail,
    inputType: 'email',
    confirmText: 'Enviar correo',
    icon: '📧'
  });

  if (!email) return;

  // Validar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    toastError('Correo inválido', 'Por favor ingresa un correo válido');
    return;
  }

  if (!supabaseClient) {
    toastError('Error de conexión', 'No se puede conectar al servidor');
    return;
  }

  try {
    // Mostrar feedback inmediato
    toastInfo('Enviando correo...', 'Espera un momento por favor');

    // URL de redirección: a la misma página
    const redirectTo = window.location.origin + window.location.pathname;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectTo
    });

    if (error) throw error;

    toastSuccess(
      '✉️ Correo enviado',
      'Revisa tu bandeja de entrada (y spam). Sigue el enlace del correo para cambiar tu contraseña.',
      8000
    );
  } catch (e) {
    console.error('Forgot password error:', e);
    toastError(
      'Error al enviar',
      e.message || 'No pudimos enviar el correo. Intenta de nuevo.'
    );
  }
}

window.handleForgotPassword = handleForgotPassword;

// ============================================================
// QUICK ADD GASTO (FAB - Floating Action Button)
// ============================================================
window.openQuickAddGasto = function() {
  // Cambiar a la pestaña de Presupuesto y hacer focus en el input
  const tab = document.querySelector('[data-tab="presupuesto"]');
  if (tab) tab.click();

  // Esperar un momento y hacer scroll + focus
  setTimeout(() => {
    const input = document.getElementById('tx-desc');
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => input.focus(), 400);
    }
  }, 200);
};

// Detectar si el usuario llegó de un link de recuperación
async function checkPasswordRecoveryFlow() {
  // Supabase incluye el token en el hash URL después de un reset
  const hash = window.location.hash;
  if (!hash || !hash.includes('type=recovery')) return false;

  try {
    // Esperar un poco a que Supabase procese el hash
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mostrar modal para nueva contraseña
    const newPassword = await showPrompt({
      title: '🔐 Crear nueva contraseña',
      message: 'Ingresa tu nueva contraseña (mínimo 6 caracteres)',
      placeholder: 'Nueva contraseña',
      inputType: 'password',
      confirmText: 'Cambiar contraseña',
      icon: '🔒'
    });

    if (!newPassword || newPassword.length < 6) {
      toastWarning('Contraseña muy corta', 'Debe tener al menos 6 caracteres');
      return true;
    }

    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

    if (error) throw error;

    toastSuccess('Contraseña actualizada', 'Ya puedes iniciar sesión con tu nueva contraseña');

    // Limpiar el hash para que no quede el token visible
    history.replaceState(null, '', window.location.pathname);

    return true;
  } catch (e) {
    console.error('Recovery error:', e);
    toastError('Error', e.message || 'No se pudo cambiar la contraseña');
    return true;
  }
}

// Ejecutar check al cargar
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkPasswordRecoveryFlow, 1000);
});

// ============================================================
// PERFIL Y DOCUMENTOS
// ============================================================

let userProfile = null;
let userDocuments = [];

async function loadUserProfile() {
  if (!currentUser || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    if (data) {
      userProfile = data;
    } else {
      // Crear perfil si no existe
      const { data: newProfile } = await supabaseClient
        .from('user_profiles')
        .insert({ user_id: currentUser.id, full_name: currentUser.email.split('@')[0] })
        .select()
        .single();
      userProfile = newProfile;
    }
    renderProfile();
  } catch (e) {
    console.error('Error cargando perfil:', e);
  }
}

function renderProfile() {
  if (!userProfile || !currentUser) return;

  const nameDisplay = document.getElementById('profile-name-display');
  const emailDisplay = document.getElementById('profile-email-display');
  const sinceDisplay = document.getElementById('profile-since');
  const avatarEl = document.getElementById('profile-avatar');

  if (nameDisplay) nameDisplay.textContent = userProfile.full_name || currentUser.email.split('@')[0];
  if (emailDisplay) emailDisplay.textContent = currentUser.email;
  if (sinceDisplay) {
    const since = new Date(userProfile.created_at || currentUser.created_at);
    sinceDisplay.textContent = '📅 Miembro desde: ' + since.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }

  // Avatar
  if (avatarEl) {
    if (userProfile.avatar_url) {
      avatarEl.innerHTML = `<img src="${userProfile.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" />`;
    } else {
      const initials = (userProfile.full_name || currentUser.email).substring(0, 2).toUpperCase();
      avatarEl.innerHTML = initials;
    }
  }

  // Llenar formulario
  const fullNameInput = document.getElementById('profile-full-name');
  const phoneInput = document.getElementById('profile-phone');
  const cityInput = document.getElementById('profile-city');
  const birthInput = document.getElementById('profile-birth-date');

  if (fullNameInput) fullNameInput.value = userProfile.full_name || '';
  if (phoneInput) phoneInput.value = userProfile.phone || '';
  if (cityInput) cityInput.value = userProfile.city || '';
  if (birthInput) birthInput.value = userProfile.birth_date || '';

  renderProfileStats();

  // Actualizar avatares en hero y drawer
  if (typeof updateAllAvatars === 'function') {
    updateAllAvatars();
  }
}

function renderProfileStats() {
  const container = document.getElementById('profile-stats');
  if (!container) return;

  // Cargar datos del state
  let stats = {
    patrimonio: 0,
    bolsillos: 0,
    transactions: 0,
    cashback: 0,
    score: 'N/A'
  };

  try {
    const stateRaw = localStorage.getItem(STORAGE_KEY_GLOBAL);
    if (stateRaw) {
      const s = JSON.parse(stateRaw);
      if (s.pockets) {
        stats.patrimonio = s.pockets.reduce((sum, p) => sum + (p.amount || 0), 0);
        stats.bolsillos = s.pockets.length;
      }
      if (s.transactions) {
        Object.values(s.transactions).forEach(arr => {
          if (Array.isArray(arr)) {
            stats.transactions += arr.length;
            arr.forEach(t => stats.cashback += (t.cashback || 0));
          }
        });
      }
      if (s.creditScore && s.creditScore.lastReported) {
        stats.score = s.creditScore.lastReported;
      }
    }
  } catch(e) {}

  const fmt = (n) => '$ ' + Math.round(n).toLocaleString('es-CO');

  container.innerHTML = `
    <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px;">
      <div style="font-size: 11px; color: var(--text-secondary);">💎 Patrimonio total</div>
      <div style="font-size: 18px; font-weight: 600; color: var(--success-text);">${fmt(stats.patrimonio)}</div>
    </div>
    <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px;">
      <div style="font-size: 11px; color: var(--text-secondary);">📊 Score crediticio</div>
      <div style="font-size: 18px; font-weight: 600;">${stats.score}</div>
    </div>
    <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px;">
      <div style="font-size: 11px; color: var(--text-secondary);">👛 Bolsillos activos</div>
      <div style="font-size: 18px; font-weight: 600;">${stats.bolsillos}</div>
    </div>
    <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px;">
      <div style="font-size: 11px; color: var(--text-secondary);">💰 Cashback total</div>
      <div style="font-size: 18px; font-weight: 600; color: var(--success-text);">${fmt(stats.cashback)}</div>
    </div>
    <div style="grid-column: span 2; padding: 12px; background: var(--bg-secondary); border-radius: 10px;">
      <div style="font-size: 11px; color: var(--text-secondary);">📝 Transacciones registradas</div>
      <div style="font-size: 18px; font-weight: 600;">${stats.transactions}</div>
    </div>
  `;
}

async function saveProfile() {
  if (!currentUser || !supabaseClient) return;

  const profileData = {
    full_name: document.getElementById('profile-full-name').value.trim(),
    phone: document.getElementById('profile-phone').value.trim(),
    city: document.getElementById('profile-city').value.trim(),
    birth_date: document.getElementById('profile-birth-date').value || null,
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await supabaseClient
      .from('user_profiles')
      .update(profileData)
      .eq('user_id', currentUser.id);

    if (error) throw error;
    Object.assign(userProfile, profileData);
    renderProfile();
    toastSuccess('Perfil actualizado', 'Tus cambios se guardaron correctamente');
  } catch (e) {
    console.error('Error guardando perfil:', e);
    alert('Error al guardar: ' + e.message);
  }
}

async function uploadAvatar(file) {
  if (!currentUser || !supabaseClient || !file) return;

  try {
    const ext = file.name.split('.').pop();
    const filePath = `${currentUser.id}/avatar.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('user-files')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = await supabaseClient.storage
      .from('user-files')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 año

    const avatar_url = urlData.signedUrl;

    await supabaseClient
      .from('user_profiles')
      .update({ avatar_url })
      .eq('user_id', currentUser.id);

    userProfile.avatar_url = avatar_url;
    renderProfile();
    toastSuccess('Foto actualizada', 'Tu nueva foto de perfil ya está visible');
  } catch (e) {
    console.error('Error subiendo avatar:', e);
    alert('Error al subir foto: ' + e.message);
  }
}

async function uploadCreditReport(file) {
  if (!currentUser || !supabaseClient || !file) return;

  const score = parseInt(document.getElementById('cr-score-upload').value);
  const date = document.getElementById('cr-date-upload').value;

  if (!score || score < 150 || score > 950) {
    alert('Ingresa un puntaje válido (150-950)');
    return;
  }
  if (!date) {
    alert('Selecciona la fecha del reporte');
    return;
  }

  const status = document.getElementById('cr-upload-status');
  status.innerHTML = '⏳ Subiendo...';
  status.style.color = 'var(--info-text)';

  try {
    const ext = file.name.split('.').pop();
    const fileName = `credit_report_${date}_${Date.now()}.${ext}`;
    const filePath = `${currentUser.id}/credit_reports/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('user-files')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabaseClient
      .from('user_documents')
      .insert({
        user_id: currentUser.id,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        doc_type: 'credit_report',
        description: `Reporte DataCrédito - Puntaje ${score}`,
        metadata: { score, report_date: date }
      });

    if (dbError) throw dbError;

    // También actualizar el creditScore en el state principal
    try {
      const stateRaw = localStorage.getItem(STORAGE_KEY_GLOBAL);
      if (stateRaw) {
        const s = JSON.parse(stateRaw);
        if (!s.creditScore) s.creditScore = { history: [] };
        if (!s.creditScore.history) s.creditScore.history = [];
        // Solo agregar si no existe ya esta fecha
        const exists = s.creditScore.history.some(h => h.date === date);
        if (!exists) {
          s.creditScore.history.push({ date, score, source: 'DataCrédito' });
          s.creditScore.history.sort((a, b) => a.date.localeCompare(b.date));
        }
        s.creditScore.lastReported = score;
        s.creditScore.lastReportedDate = date;
        localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(s));
      }
    } catch(e) { console.warn(e); }

    status.innerHTML = '✅ Reporte subido y registrado en tu histórico';
    status.style.color = 'var(--success-text)';

    document.getElementById('cr-score-upload').value = '';
    document.getElementById('cr-date-upload').value = '';
    document.getElementById('cr-file-input').value = '';

    await loadUserDocuments();

    setTimeout(() => { status.innerHTML = ''; }, 4000);
  } catch (e) {
    console.error('Error:', e);
    status.innerHTML = '❌ Error: ' + e.message;
    status.style.color = 'var(--danger-text)';
  }
}

async function uploadOtherDocument(file) {
  if (!currentUser || !supabaseClient || !file) return;

  const docType = document.getElementById('other-doc-type').value;
  const desc = document.getElementById('other-doc-desc').value.trim();

  if (!desc) {
    alert('Ingresa una descripción');
    return;
  }

  const status = document.getElementById('other-upload-status');
  status.innerHTML = '⏳ Subiendo...';

  try {
    const ext = file.name.split('.').pop();
    const fileName = `${docType}_${Date.now()}.${ext}`;
    const filePath = `${currentUser.id}/documents/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from('user-files')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabaseClient
      .from('user_documents')
      .insert({
        user_id: currentUser.id,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        doc_type: docType,
        description: desc
      });

    if (dbError) throw dbError;

    status.innerHTML = '✅ Documento subido';
    status.style.color = 'var(--success-text)';

    document.getElementById('other-doc-desc').value = '';
    document.getElementById('other-file-input').value = '';

    await loadUserDocuments();
    setTimeout(() => { status.innerHTML = ''; }, 3000);
  } catch (e) {
    console.error('Error:', e);
    status.innerHTML = '❌ Error: ' + e.message;
    status.style.color = 'var(--danger-text)';
  }
}

async function loadUserDocuments() {
  if (!currentUser || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('user_documents')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    userDocuments = data || [];
    renderDocuments();
  } catch (e) {
    console.error('Error cargando documentos:', e);
  }
}

async function getSignedUrl(filePath) {
  const { data, error } = await supabaseClient.storage
    .from('user-files')
    .createSignedUrl(filePath, 60 * 60); // 1 hora
  if (error) throw error;
  return data.signedUrl;
}

function renderDocuments() {
  const creditList = document.getElementById('credit-reports-list');
  const otherList = document.getElementById('other-docs-list');
  if (!creditList || !otherList) return;

  const creditReports = userDocuments.filter(d => d.doc_type === 'credit_report');
  const otherDocs = userDocuments.filter(d => d.doc_type !== 'credit_report');

  // CREDIT REPORTS con análisis automático
  if (creditReports.length === 0) {
    creditList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 13px;">Aún no has subido ningún reporte. Sube el primero arriba ☝️</div>';
  } else {
    let html = '';
    creditReports.forEach((doc, idx) => {
      const meta = doc.metadata || {};
      const score = meta.score || 'N/A';
      const reportDate = meta.report_date || doc.uploaded_at;
      let category = 'Bueno', color = '#378ADD', icon = '✓';
      if (score >= 850) { category = 'Excelente'; color = '#1D9E75'; icon = '🌟'; }
      else if (score >= 751) { category = 'Muy Bueno'; color = '#639922'; icon = '✨'; }
      else if (score >= 671) { category = 'Bueno'; color = '#378ADD'; icon = '✓'; }
      else if (score >= 580) { category = 'Regular'; color = '#BA7517'; icon = '⚠️'; }
      else { category = 'Pobre'; color = '#A32D2D'; icon = '🔴'; }

      // Comparar con anterior
      let trend = '';
      if (idx < creditReports.length - 1) {
        const prevScore = creditReports[idx + 1].metadata?.score;
        if (prevScore) {
          const diff = score - prevScore;
          const arrow = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
          const tColor = diff > 0 ? 'var(--success-text)' : (diff < 0 ? 'var(--danger-text)' : 'var(--text-secondary)');
          trend = `<span style="color: ${tColor}; font-weight: 500; font-size: 12px;">${arrow} ${Math.abs(diff)}</span>`;
        }
      }

      html += `<div style="padding: 14px; background: var(--bg-secondary); border-radius: 12px; margin-bottom: 8px; border-left: 4px solid ${color};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px;">
          <div>
            <div style="font-size: 11px; color: var(--text-secondary);">📅 ${new Date(reportDate + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
            <div style="font-size: 24px; font-weight: 600; color: ${color};">${score} ${trend}</div>
            <div style="font-size: 12px;">${icon} ${category}</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <button onclick="viewDocument('${doc.file_path}')" style="padding: 6px 12px; font-size: 11px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">👁️ Ver</button>
            <button onclick="deleteDocument('${doc.id}', '${doc.file_path}')" style="padding: 6px 12px; font-size: 11px; background: var(--danger-bg); color: var(--danger-text); border: none; border-radius: 6px; cursor: pointer;">🗑️</button>
          </div>
        </div>
      </div>`;
    });

    // Tip automático basado en última utilización
    if (creditReports.length > 0) {
      const lastScore = creditReports[0].metadata?.score || 0;
      const tip = generateCreditTip(lastScore);
      html += `<div style="margin-top: 12px; padding: 14px; background: var(--info-bg); border-radius: 12px; color: var(--info-text); font-size: 12px;">${tip}</div>`;
    }

    creditList.innerHTML = html;
  }

  // OTROS DOCUMENTOS
  if (otherDocs.length === 0) {
    otherList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 13px;">Sin documentos guardados aún.</div>';
  } else {
    const typeIcons = { contract: '📜', statement: '📊', receipt: '🧾', other: '📄' };
    let html = '';
    otherDocs.forEach(doc => {
      const sizeKB = (doc.file_size / 1024).toFixed(0);
      html += `<div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13px; font-weight: 500;">${typeIcons[doc.doc_type] || '📄'} ${escapeHTML(doc.description)}</div>
          <div style="font-size: 11px; color: var(--text-tertiary);">${escapeHTML(doc.file_name)} · ${sizeKB} KB · ${new Date(doc.uploaded_at).toLocaleDateString('es-CO')}</div>
        </div>
        <div style="display: flex; gap: 4px;">
          <button onclick="viewDocument('${doc.file_path}')" style="padding: 6px 10px; font-size: 11px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">👁️</button>
          <button onclick="deleteDocument('${doc.id}', '${doc.file_path}')" style="padding: 6px 10px; font-size: 11px; background: var(--danger-bg); color: var(--danger-text); border: none; border-radius: 6px; cursor: pointer;">🗑️</button>
        </div>
      </div>`;
    });
    otherList.innerHTML = html;
  }
}

function escapeHTML(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateCreditTip(score) {
  // Calcular utilización actual de tarjetas
  let totalDebt = 0, totalLimit = 0;
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY_GLOBAL) || '{}');
    if (s.debts) {
      s.debts.forEach(d => {
        totalDebt += d.balance || 0;
        totalLimit += d.payment || 0;
      });
    }
  } catch(e) {}

  const utilization = totalLimit > 0 ? (totalDebt / totalLimit) * 100 : 0;

  let html = '<strong>💡 Análisis automático de tu situación:</strong><br><br>';

  // Análisis utilización
  if (utilization < 10) {
    html += `✅ <strong>Utilización excelente</strong> (${utilization.toFixed(1)}%): estás en el rango óptimo. Esto suma puntos a tu score.<br><br>`;
  } else if (utilization < 30) {
    html += `🟡 <strong>Utilización buena</strong> (${utilization.toFixed(1)}%): podrías mejorar bajando al ≤10% para acelerar tu score.<br><br>`;
  } else {
    html += `⚠️ <strong>Utilización alta</strong> (${utilization.toFixed(1)}%): este es el factor #1 que más penaliza tu puntaje. Bájala urgentemente.<br><br>`;
  }

  // Tips por categoría de score
  if (score < 580) {
    html += `<strong>🚨 Categoría: Pobre.</strong> Prioridades:<br>1. Pagar al día todas las deudas<br>2. Bajar utilización debajo del 30%<br>3. No abrir nuevas tarjetas<br>4. Revisar el reporte por errores`;
  } else if (score < 670) {
    html += `<strong>⚠️ Categoría: Regular.</strong> Para subir:<br>1. Mantén utilización <10%<br>2. Paga todo a 1 cuota<br>3. Considera abrir un CDT pequeño<br>4. Tiempo: las cuentas viejas suman puntos`;
  } else if (score < 750) {
    html += `<strong>✓ Categoría: Bueno.</strong> Para llegar a Muy Bueno (751+):<br>1. Mantén tu utilización óptima<br>2. Abrir CDT a plazo fijo (+10-20 pts)<br>3. NO abrir tarjetas nuevas en 6-12 meses<br>4. Considera crédito vehículo/hipotecario`;
  } else if (score < 850) {
    html += `<strong>✨ Categoría: Muy Bueno.</strong> Para llegar a Excelente (850+):<br>1. Mantén impecable historial<br>2. Diversifica con productos de plazo fijo<br>3. Crédito hipotecario es la última pieza<br>4. Tiempo y consistencia son clave`;
  } else {
    html += `<strong>🌟 Categoría: Excelente.</strong> ¡Lo lograste! Mantén:<br>1. Misma disciplina<br>2. Diversificación de productos<br>3. Sin nuevas aperturas innecesarias<br>4. Aprovecha tu score para mejores tasas`;
  }

  return html;
}

async function viewDocument(filePath) {
  try {
    const url = await getSignedUrl(filePath);
    window.open(url, '_blank');
  } catch (e) {
    alert('Error al abrir documento: ' + e.message);
  }
}

async function deleteDocument(docId, filePath) {
  if (!confirm('¿Eliminar este documento? No se puede deshacer.')) return;
  try {
    await supabaseClient.storage.from('user-files').remove([filePath]);
    await supabaseClient.from('user_documents').delete().eq('id', docId);
    await loadUserDocuments();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

async function changePasswordPrompt() {
  const newPass = await showPrompt({
    title: '🔐 Cambiar contraseña',
    message: 'Ingresa tu nueva contraseña. Debe tener al menos 6 caracteres.',
    placeholder: 'Nueva contraseña',
    inputType: 'password',
    confirmText: 'Cambiar',
    icon: '🔒'
  });

  if (!newPass) return;

  if (newPass.length < 6) {
    toastWarning('Contraseña muy corta', 'Debe tener al menos 6 caracteres');
    return;
  }

  // Confirmar contraseña
  const confirmPass = await showPrompt({
    title: 'Confirmar contraseña',
    message: 'Ingrésala de nuevo para confirmar',
    placeholder: 'Confirmar contraseña',
    inputType: 'password',
    confirmText: 'Confirmar',
    icon: '✅'
  });

  if (!confirmPass) return;

  if (newPass !== confirmPass) {
    toastError('Las contraseñas no coinciden', 'Inténtalo de nuevo');
    return;
  }

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: newPass });
    if (error) throw error;
    toastSuccess('Contraseña actualizada', 'Tu nueva contraseña ya está activa');
  } catch (e) {
    toastError('Error', e.message);
  }
}

async function deleteAccountPrompt() {
  const confirmed = await showConfirm({
    title: '⚠️ Eliminar cuenta',
    message: 'Esto eliminará TU CUENTA y TODOS tus datos permanentemente. Esta acción NO se puede deshacer.',
    confirmText: 'Sí, eliminar todo',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: '🗑️'
  });

  if (!confirmed) return;

  const finalConfirm = await showPrompt({
    title: 'Confirmación final',
    message: 'Para confirmar, escribe ELIMINAR en el campo de abajo',
    placeholder: 'ELIMINAR',
    confirmText: 'Confirmar eliminación',
    icon: '⚠️'
  });

  if (finalConfirm !== 'ELIMINAR') {
    toastInfo('Cancelado', 'No se eliminó tu cuenta');
    return;
  }

  toastInfo('Procesando', 'Para eliminar tu cuenta completamente, contacta a soporte. Por ahora cerraremos tu sesión.', 5000);
  setTimeout(async () => {
    await supabaseClient.auth.signOut();
    location.reload();
  }, 2000);
}

// Event listeners para inputs de archivos
document.addEventListener('DOMContentLoaded', () => {
  const avatarInput = document.getElementById('avatar-input');
  const crFileInput = document.getElementById('cr-file-input');
  const otherFileInput = document.getElementById('other-file-input');

  if (avatarInput) {
    avatarInput.addEventListener('change', (e) => {
      if (e.target.files[0]) uploadAvatar(e.target.files[0]);
    });
  }
  if (crFileInput) {
    crFileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) uploadCreditReport(e.target.files[0]);
    });
  }
  if (otherFileInput) {
    otherFileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) uploadOtherDocument(e.target.files[0]);
    });
  }
});

// Cargar perfil y documentos cuando se autentique
const originalLoadFromCloud = loadFromCloud;
loadFromCloud = async function() {
  await originalLoadFromCloud.apply(this, arguments);
  if (currentUser) {
    await loadUserProfile();
    await loadUserDocuments();
  }
};

// Exponer al scope global
window.saveProfile = saveProfile;
window.viewDocument = viewDocument;
window.deleteDocument = deleteDocument;
window.changePasswordPrompt = changePasswordPrompt;
window.deleteAccountPrompt = deleteAccountPrompt;

// ============================================================
// SISTEMA DE TOASTS MODERNOS (avisos flotantes)
// ============================================================

// Crear contenedor si no existe
function ensureToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Muestra un toast moderno (notificación flotante)
 * @param {Object} opts - { type, title, message, duration }
 * type: 'success' | 'error' | 'warning' | 'info'
 * duration: ms (default 4000), 0 = no auto-cierre
 */
window.showToast = function(opts) {
  const {
    type = 'info',
    title = '',
    message = '',
    duration = 4000
  } = opts;

  const container = ensureToastContainer();

  const icons = {
    success: '✅',
    error: '⚠️',
    warning: '⚡',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      ${title ? `<p class="toast-title">${escapeHtml(title)}</p>` : ''}
      ${message ? `<p class="toast-message">${escapeHtml(message)}</p>` : ''}
    </div>
    <button class="toast-close" aria-label="Cerrar">×</button>
    ${duration > 0 ? '<div class="toast-progress"><div class="toast-progress-bar"></div></div>' : ''}
  `;

  container.appendChild(toast);

  // Función para cerrar el toast
  const close = () => {
    if (toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  };

  // Botón de cerrar
  toast.querySelector('.toast-close').addEventListener('click', close);

  // Auto-cerrar con barra de progreso
  if (duration > 0) {
    const bar = toast.querySelector('.toast-progress-bar');
    if (bar) {
      requestAnimationFrame(() => {
        bar.style.transition = `transform ${duration}ms linear`;
        bar.style.transform = 'scaleX(0)';
      });
    }
    setTimeout(close, duration);
  }

  return { close };
};

// Helper: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Atajos cómodos
window.toastSuccess = (title, message, duration) => showToast({ type: 'success', title, message, duration });
window.toastError = (title, message, duration) => showToast({ type: 'error', title, message, duration: duration || 6000 });
window.toastWarning = (title, message, duration) => showToast({ type: 'warning', title, message, duration });
window.toastInfo = (title, message, duration) => showToast({ type: 'info', title, message, duration });

// ============================================================
// ============================================================
// MENÚ LATERAL (DRAWER) - Solo móvil
// ============================================================

window.toggleSideMenu = function() {
  const menu = document.getElementById('side-menu');
  const backdrop = document.getElementById('side-menu-backdrop');
  if (!menu || !backdrop) return;

  if (menu.classList.contains('open')) {
    closeSideMenu();
  } else {
    openSideMenu();
  }
};

window.openSideMenu = function() {
  const menu = document.getElementById('side-menu');
  const backdrop = document.getElementById('side-menu-backdrop');
  if (!menu || !backdrop) return;

  // Actualizar datos del usuario antes de mostrar
  updateSideMenuUserInfo();

  menu.classList.add('open');
  backdrop.classList.add('open');
  document.body.classList.add('drawer-open');
};

// Actualizar info del usuario en el drawer
function updateSideMenuUserInfo() {
  const nameEl = document.getElementById('side-menu-user-name');
  const emailEl = document.getElementById('side-menu-user-email');
  const avatarEl = document.getElementById('side-menu-avatar');
  const initialsEl = document.getElementById('side-menu-avatar-initials');

  if (!nameEl) return;

  // Nombre
  let displayName = 'Usuario';
  if (typeof userProfile !== 'undefined' && userProfile && userProfile.full_name) {
    displayName = userProfile.full_name;
  } else if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
    displayName = currentUser.email.split('@')[0];
    // Capitalizar primera letra
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  }
  nameEl.textContent = displayName;

  // Email
  if (emailEl) {
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
      emailEl.textContent = currentUser.email;
    } else {
      emailEl.textContent = '';
    }
  }

  // Avatar (foto o iniciales)
  if (avatarEl && initialsEl) {
    if (typeof userProfile !== 'undefined' && userProfile && userProfile.avatar_url) {
      avatarEl.innerHTML = `<img src="${userProfile.avatar_url}" alt="${displayName}" />`;
    } else {
      // Calcular iniciales
      let initials = 'U';
      if (typeof userProfile !== 'undefined' && userProfile && userProfile.full_name) {
        const parts = userProfile.full_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          initials = (parts[0][0] + parts[1][0]).toUpperCase();
        } else if (parts[0]) {
          initials = parts[0].substring(0, 2).toUpperCase();
        }
      } else if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
        initials = currentUser.email.substring(0, 2).toUpperCase();
      }
      // Mantener span para que el CSS funcione
      avatarEl.innerHTML = `<span id="side-menu-avatar-initials">${initials}</span>`;
    }
  }
}

window.updateSideMenuUserInfo = updateSideMenuUserInfo;

// Función global para actualizar avatares (hero + drawer)
function updateAllAvatars() {
  // Actualizar drawer
  if (typeof updateSideMenuUserInfo === 'function') {
    updateSideMenuUserInfo();
  }

  // Actualizar hero avatar
  updateHeroAvatar();

  // Actualizar nombre del usuario en hero
  updateHeroUserName();
}

function updateHeroAvatar() {
  const heroAvatar = document.getElementById('hero-avatar');
  const heroInitials = document.getElementById('hero-avatar-initials');
  if (!heroAvatar) return;

  // Si tiene foto subida
  if (typeof userProfile !== 'undefined' && userProfile && userProfile.avatar_url) {
    heroAvatar.innerHTML = `<img src="${userProfile.avatar_url}" alt="Avatar" />`;
  } else {
    // Calcular iniciales
    let initials = 'U';
    if (typeof userProfile !== 'undefined' && userProfile && userProfile.full_name) {
      const parts = userProfile.full_name.trim().split(/\s+/);
      if (parts.length >= 2) {
        initials = (parts[0][0] + parts[1][0]).toUpperCase();
      } else if (parts[0]) {
        initials = parts[0].substring(0, 2).toUpperCase();
      }
    } else if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
      initials = currentUser.email.substring(0, 2).toUpperCase();
    }
    heroAvatar.innerHTML = `<span id="hero-avatar-initials">${initials}</span>`;
  }
}

function updateHeroUserName() {
  const heroName = document.getElementById('hero-user-name');
  if (!heroName) return;

  let displayName = 'Usuario';
  if (typeof userProfile !== 'undefined' && userProfile && userProfile.full_name) {
    // Solo el primer nombre
    displayName = userProfile.full_name.trim().split(/\s+/)[0];
  } else if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
    displayName = currentUser.email.split('@')[0];
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  }
  heroName.textContent = displayName;
}

// Función para navegar al perfil desde el avatar del hero
window.navigateToProfile = function() {
  const perfilTab = document.querySelector('.fin-tab[data-tab="perfil"]');
  if (perfilTab) perfilTab.click();
  // Sincronizar drawer
  document.querySelectorAll('.side-menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === 'perfil');
  });
  if (typeof updateMenuToggleText === 'function') updateMenuToggleText('perfil');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.updateAllAvatars = updateAllAvatars;

window.closeSideMenu = function() {
  const menu = document.getElementById('side-menu');
  const backdrop = document.getElementById('side-menu-backdrop');
  if (!menu || !backdrop) return;

  menu.classList.remove('open');
  backdrop.classList.remove('open');
  document.body.classList.remove('drawer-open');
};

window.navigateTab = function(tabName) {
  // Cerrar drawer (con pequeño delay para animación visual)
  closeSideMenu();

  // Activar tab correspondiente (dispara el listener existente)
  setTimeout(() => {
    const targetTab = document.querySelector(`.fin-tab[data-tab="${tabName}"]`);
    if (targetTab) targetTab.click();

    // Marcar como activo en el drawer también
    document.querySelectorAll('.side-menu-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // Actualizar texto del botón hamburguesa
    updateMenuToggleText(tabName);

    // Mostrar/ocultar FAB según el tab
    updateFabVisibility(tabName);

    // Scroll arriba
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 100);
};

// Mostrar el FAB solo en tabs donde tiene sentido (Resumen y Presupuesto)
function updateFabVisibility(tabName) {
  const tabsWithFab = ['resumen', 'presupuesto'];
  if (tabsWithFab.includes(tabName)) {
    document.body.classList.add('show-fab');
  } else {
    document.body.classList.remove('show-fab');
  }
}

window.updateFabVisibility = updateFabVisibility;

// ============================================================
// SUB-TABS dentro de Presupuesto
// ============================================================
window.switchSubTab = function(subtab) {
  // Activar el sub-tab clickeado
  document.querySelectorAll('.sub-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.subtab === subtab);
  });

  // Mostrar la sub-sección correspondiente
  document.querySelectorAll('.sub-section').forEach(section => {
    const id = section.id.replace('subsection-', '');
    if (id === subtab) {
      section.style.display = 'block';
      section.classList.add('active');
    } else {
      section.style.display = 'none';
      section.classList.remove('active');
    }
  });

  // Guardar preferencia
  try {
    localStorage.setItem('finanzaspro_last_subtab_presupuesto', subtab);
  } catch(e) {}
};

// Restaurar último sub-tab al cargar
document.addEventListener('DOMContentLoaded', () => {
  try {
    const lastSubtab = localStorage.getItem('finanzaspro_last_subtab_presupuesto');
    if (lastSubtab) {
      setTimeout(() => switchSubTab(lastSubtab), 500);
    }
  } catch(e) {}
});

// También sincronizar cuando se hace click directo en una tab desktop
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.fin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      if (tabName) {
        updateFabVisibility(tabName);
        if (typeof updateMenuToggleText === 'function') updateMenuToggleText(tabName);
      }
    });
  });

  // Aplicar al cargar (asume que arranca en Resumen)
  updateFabVisibility('resumen');
});

function updateMenuToggleText(tabName) {
  const menuLabel = document.getElementById('menu-current-tab');
  if (!menuLabel) return;

  const labels = {
    resumen: '🏠 Resumen',
    presupuesto: '💸 Presupuesto',
    bolsillos: '👛 Bolsillos',
    ingresos: '💰 Ingresos',
    deudas: '💳 Tarjetas',
    metas: '🎯 Metas',
    analisis: '📊 Análisis',
    documentos: '📄 Documentos',
    perfil: '👤 Mi Perfil'
  };
  menuLabel.textContent = labels[tabName] || '🏠 Resumen';
}

// Sincronizar drawer cuando cambia tab desde tabs originales
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.fin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      // Sincronizar drawer
      document.querySelectorAll('.side-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
      });
      updateMenuToggleText(tabName);
    });
  });

  // Cerrar drawer con tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const menu = document.getElementById('side-menu');
      if (menu && menu.classList.contains('open')) {
        closeSideMenu();
      }
    }
  });
});

// ============================================================
// SISTEMA DE MODALES BONITOS (reemplaza confirm/alert/prompt feos)
// ============================================================

// ===== HELPER: Bloquear/desbloquear scroll del body =====
let modalCount = 0;
let savedScrollPos = 0;

function lockBody() {
  modalCount++;
  if (modalCount === 1) {
    savedScrollPos = window.scrollY;
    document.body.style.top = `-${savedScrollPos}px`;
    document.body.classList.add('modal-open');
  }
}

function unlockBody() {
  modalCount = Math.max(0, modalCount - 1);
  if (modalCount === 0) {
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollPos);
  }
}

window.lockBody = lockBody;
window.unlockBody = unlockBody;

/**
 * Muestra un modal de confirmación bonito
 * @returns {Promise<boolean>} true si confirma, false si cancela
 */
window.showConfirm = function(opts) {
  const {
    title = '¿Confirmar?',
    message = '',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'default', // default | danger | warning | success
    icon = null
  } = opts;

  return new Promise((resolve) => {
    const id = 'confirm-modal-' + Date.now();

    const colors = {
      default: { gradient: 'linear-gradient(135deg, #7F77DD, #1D9E75)', shadow: 'rgba(127, 119, 221, 0.3)' },
      danger: { gradient: 'linear-gradient(135deg, #E24B4A, #A32D2D)', shadow: 'rgba(226, 75, 74, 0.3)' },
      warning: { gradient: 'linear-gradient(135deg, #BA7517, #E09B3D)', shadow: 'rgba(186, 117, 23, 0.3)' },
      success: { gradient: 'linear-gradient(135deg, #1D9E75, #34c89c)', shadow: 'rgba(29, 158, 117, 0.3)' }
    };
    const c = colors[type] || colors.default;

    const defaultIcons = {
      default: '❓',
      danger: '⚠️',
      warning: '⚡',
      success: '✅'
    };
    const displayIcon = icon || defaultIcons[type];

    const modal = document.createElement('div');
    modal.id = id;
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10001; padding: 20px; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;';

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 18px; max-width: 420px; width: 100%; padding: 28px 26px; box-shadow: 0 30px 60px rgba(0,0,0,0.4); animation: fadeInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
        <div style="text-align: center; margin-bottom: 18px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; background: ${c.gradient}; border-radius: 16px; margin-bottom: 14px; box-shadow: 0 8px 20px ${c.shadow};">
            <span style="font-size: 28px;">${displayIcon}</span>
          </div>
          <h2 style="margin: 0 0 6px; font-size: 19px; font-weight: 600; color: var(--text-primary);">${escapeHtml(title)}</h2>
          ${message ? `<p style="margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(message)}</p>` : ''}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button id="${id}-cancel" style="padding: 12px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 12px; font-weight: 500; font-size: 14px; cursor: pointer;">${escapeHtml(cancelText)}</button>
          <button id="${id}-confirm" style="padding: 12px; background: ${c.gradient}; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; box-shadow: 0 4px 12px ${c.shadow};">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    lockBody();

    const close = (value) => {
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.2s';
      setTimeout(() => {
        modal.remove();
        unlockBody();
      }, 200);
      resolve(value);
    };

    document.getElementById(`${id}-confirm`).addEventListener('click', () => close(true));
    document.getElementById(`${id}-cancel`).addEventListener('click', () => close(false));

    // Cerrar al hacer click en el fondo
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close(false);
    });

    // ESC para cancelar
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        close(false);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
};

/**
 * Muestra un modal de input bonito (reemplaza prompt())
 * @returns {Promise<string|null>} valor ingresado o null si cancela
 */
window.showPrompt = function(opts) {
  const {
    title = 'Ingresa un valor',
    message = '',
    placeholder = '',
    defaultValue = '',
    inputType = 'text',
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    icon = '✏️'
  } = opts;

  return new Promise((resolve) => {
    const id = 'prompt-modal-' + Date.now();

    const modal = document.createElement('div');
    modal.id = id;
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10001; padding: 20px; backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;';

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 18px; max-width: 420px; width: 100%; padding: 28px 26px; box-shadow: 0 30px 60px rgba(0,0,0,0.4); animation: fadeInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
        <div style="text-align: center; margin-bottom: 18px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; background: linear-gradient(135deg, #7F77DD, #1D9E75); border-radius: 16px; margin-bottom: 14px; box-shadow: 0 8px 20px rgba(127, 119, 221, 0.3);">
            <span style="font-size: 28px;">${icon}</span>
          </div>
          <h2 style="margin: 0 0 6px; font-size: 19px; font-weight: 600; color: var(--text-primary);">${escapeHtml(title)}</h2>
          ${message ? `<p style="margin: 0 0 14px; font-size: 13px; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(message)}</p>` : ''}
        </div>

        <input type="${inputType}" id="${id}-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" style="width: 100%; padding: 12px 14px; height: 44px; font-size: 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-secondary); color: var(--text-primary); margin-bottom: 14px;" />

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button id="${id}-cancel" style="padding: 12px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 12px; font-weight: 500; font-size: 14px; cursor: pointer;">${escapeHtml(cancelText)}</button>
          <button id="${id}-confirm" style="padding: 12px; background: linear-gradient(135deg, #7F77DD, #1D9E75); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer;">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    lockBody();
    const input = document.getElementById(`${id}-input`);
    setTimeout(() => input.focus(), 100);

    const close = (value) => {
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.2s';
      setTimeout(() => {
        modal.remove();
        unlockBody();
      }, 200);
      resolve(value);
    };

    document.getElementById(`${id}-confirm`).addEventListener('click', () => close(input.value));
    document.getElementById(`${id}-cancel`).addEventListener('click', () => close(null));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value);
      if (e.key === 'Escape') close(null);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close(null);
    });
  });
};

// ============================================================
// PERSONALIZACIÓN VISUAL (color, modo, densidad)
// ============================================================

const VISUAL_PREFS_KEY = 'finanzaspro_visual_prefs';

function loadVisualPreferences() {
  // 1. Intentar leer del state principal (sincronizado con Supabase)
  try {
    const stateRaw = localStorage.getItem(STORAGE_KEY_GLOBAL);
    if (stateRaw) {
      const state = JSON.parse(stateRaw);
      if (state && state.visualPrefs) {
        return state.visualPrefs;
      }
    }
  } catch(e) {}
  
  // 2. Fallback: leer del key viejo (compatibilidad)
  try {
    const raw = localStorage.getItem(VISUAL_PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  
  return { theme: 'default', mode: 'auto', density: 'normal' };
}

function saveVisualPreferences(prefs) {
  try {
    // Guardar en localStorage (key viejo, compatibilidad)
    localStorage.setItem(VISUAL_PREFS_KEY, JSON.stringify(prefs));
    
    // Guardar en el state principal para que se sincronice con Supabase
    const stateRaw = localStorage.getItem(STORAGE_KEY_GLOBAL);
    if (stateRaw) {
      const state = JSON.parse(stateRaw);
      state.visualPrefs = prefs;
      localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(state));
      
      // Forzar sync inmediato a Supabase
      if (typeof saveToCloud === 'function' && currentUser) {
        saveToCloud(state);
      }
    }
  } catch(e) {
    console.error('Error guardando preferencias visuales:', e);
  }
}

function applyVisualPreferences() {
  const prefs = loadVisualPreferences();
  const html = document.documentElement;

  // Limpiar clases viejas
  html.classList.forEach(cls => {
    if (cls.startsWith('color-') || cls.startsWith('density-')) {
      html.classList.remove(cls);
    }
  });

  // Aplicar tema de color
  html.classList.add('color-' + (prefs.theme || 'default'));

  // Aplicar densidad
  html.classList.add('density-' + (prefs.density || 'normal'));

  // Aplicar modo (claro/oscuro/auto)
  html.classList.remove('theme-light', 'theme-dark');
  if (prefs.mode === 'light') html.classList.add('theme-light');
  else if (prefs.mode === 'dark') html.classList.add('theme-dark');
  // 'auto' no agrega clase, deja que prefers-color-scheme actúe

  // Actualizar UI de selectores
  updateVisualSelectors(prefs);
}

function updateVisualSelectors(prefs) {
  // Color
  document.querySelectorAll('.color-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === prefs.theme);
  });

  // Modo
  document.querySelectorAll('.theme-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === prefs.mode);
  });

  // Densidad
  document.querySelectorAll('.density-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.density === prefs.density);
  });
}

window.setColorTheme = function(theme) {
  const prefs = loadVisualPreferences();
  prefs.theme = theme;
  saveVisualPreferences(prefs);
  applyVisualPreferences();
  
  // Re-render charts si existen
  if (typeof renderCharts === 'function') {
    setTimeout(renderCharts, 100);
  }
  
  toastSuccess('Tema actualizado', `Color "${getThemeName(theme)}" aplicado`);
};

window.setThemeMode = function(mode) {
  const prefs = loadVisualPreferences();
  prefs.mode = mode;
  saveVisualPreferences(prefs);
  applyVisualPreferences();
  
  // Re-render charts si existen
  if (typeof renderCharts === 'function') {
    setTimeout(renderCharts, 100);
  }
  
  const names = { light: 'Claro', dark: 'Oscuro', auto: 'Automático' };
  toastSuccess('Modo actualizado', `Modo ${names[mode]} aplicado`);
};

window.setDensity = function(density) {
  const prefs = loadVisualPreferences();
  prefs.density = density;
  saveVisualPreferences(prefs);
  applyVisualPreferences();
  
  const names = { compact: 'Compacto', normal: 'Normal', comfortable: 'Espacioso' };
  toastSuccess('Densidad actualizada', `Vista ${names[density]} aplicada`);
};

window.resetVisualPreferences = async function() {
  const confirmed = await showConfirm({
    title: '¿Restablecer personalización?',
    message: 'Volverá a los valores originales: color clásico, modo automático, densidad normal.',
    confirmText: 'Sí, restablecer',
    cancelText: 'Cancelar',
    type: 'warning',
    icon: '↺'
  });
  
  if (!confirmed) return;

  const defaultPrefs = { theme: 'default', mode: 'auto', density: 'normal' };
  saveVisualPreferences(defaultPrefs);
  applyVisualPreferences();
  
  if (typeof renderCharts === 'function') {
    setTimeout(renderCharts, 100);
  }
  
  toastSuccess('Restablecido', 'Tu dashboard volvió al diseño original');
};

function getThemeName(theme) {
  const names = {
    default: 'Clásico',
    blue: 'Océano',
    pink: 'Coral',
    orange: 'Sunset',
    green: 'Bosque',
    purple: 'Royal',
    rose: 'Lavanda',
    mono: 'Monocromo'
  };
  return names[theme] || 'Clásico';
}

// Aplicar al cargar
document.addEventListener('DOMContentLoaded', () => {
  applyVisualPreferences();
});

// También aplicar inmediatamente (antes del DOMContentLoaded)
applyVisualPreferences();

// Re-aplicar cuando cambia el tab a perfil (para sincronizar UI)
document.addEventListener('DOMContentLoaded', () => {
  const perfilTab = document.querySelector('.fin-tab[data-tab="perfil"]');
  if (perfilTab) {
    perfilTab.addEventListener('click', () => {
      setTimeout(() => {
        const prefs = loadVisualPreferences();
        updateVisualSelectors(prefs);
      }, 200);
    });
  }
});

// ============================================================
// ONBOARDING INTERACTIVO - Tutorial multi-paso
// ============================================================

const TUTORIAL_STEPS = [
  {
    icon: '👋',
    title: '¡Bienvenido a FinanzasPro!',
    subtitle: 'Tu nuevo dashboard financiero',
    content: `
      <h3>Toma el control de tus finanzas</h3>
      <p>FinanzasPro te ayuda a organizar tu dinero, gastos, tarjetas y metas. Todo en un solo lugar, completamente personalizable.</p>
      <div class="tutorial-tip-box">
        <p>💡 <strong>Te llevará 5 minutos</strong> dejar todo configurado. ¡Empecemos!</p>
      </div>
    `
  },
  {
    icon: '🔐',
    title: 'Tu privacidad es PRIORIDAD',
    subtitle: 'Tus datos están 100% seguros',
    content: `
      <h3>Tu información es completamente privada</h3>
      <p>Antes de empezar, queremos que tengas total tranquilidad sobre el manejo de tu información financiera:</p>
      <div style="display: flex; flex-direction: column; gap: 10px; margin: 14px 0;">
        <div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
          <span style="font-size: 18px;">🔒</span>
          <div>
            <strong style="color: var(--text-primary); font-size: 13px;">Solo tú ves tus datos</strong>
            <p style="margin: 2px 0 0; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">Nadie más puede acceder a tu información, ni siquiera nosotros.</p>
          </div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
          <span style="font-size: 18px;">🛡️</span>
          <div>
            <strong style="color: var(--text-primary); font-size: 13px;">Cifrado de extremo a extremo</strong>
            <p style="margin: 2px 0 0; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">Tus datos viajan y se guardan cifrados con tecnología bancaria.</p>
          </div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
          <span style="font-size: 18px;">🚫</span>
          <div>
            <strong style="color: var(--text-primary); font-size: 13px;">Cero venta de datos</strong>
            <p style="margin: 2px 0 0; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">No vendemos, compartimos ni cedemos tu info a terceros. Nunca.</p>
          </div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
          <span style="font-size: 18px;">📵</span>
          <div>
            <strong style="color: var(--text-primary); font-size: 13px;">Sin anuncios, sin spam</strong>
            <p style="margin: 2px 0 0; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">No verás publicidad ni te llegarán correos comerciales.</p>
          </div>
        </div>
      </div>
      <div class="tutorial-tip-box" style="background: var(--success-bg); border-left-color: var(--success-text);">
        <p style="color: var(--success-text);">🇨🇴 <strong>Cumplimos la Ley 1581 de 2012</strong> (Habeas Data) de protección de datos personales en Colombia.</p>
      </div>
    `
  },
  {
    icon: '🔐',
    title: 'Tu privacidad es sagrada',
    subtitle: '100% privado, 100% seguro',
    content: `
      <h3>Tus datos son TUYOS</h3>
      <p>Antes de empezar, queremos que tengas total tranquilidad sobre tu información:</p>
      <ul style="margin: 12px 0; padding: 0; list-style: none;">
        <li style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; font-size: 14px; line-height: 1.5;">
          <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; background: linear-gradient(135deg, var(--accent-from, #7F77DD), var(--accent-to, #1D9E75)); color: white; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0;">🔒</span>
          <span><strong>Cifrado de extremo a extremo:</strong> tus datos viajan y se almacenan cifrados.</span>
        </li>
        <li style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; font-size: 14px; line-height: 1.5;">
          <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; background: linear-gradient(135deg, var(--accent-from, #7F77DD), var(--accent-to, #1D9E75)); color: white; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0;">👤</span>
          <span><strong>Solo tú accedes:</strong> nadie más puede ver tu información, ni siquiera nosotros.</span>
        </li>
        <li style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; font-size: 14px; line-height: 1.5;">
          <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; background: linear-gradient(135deg, var(--accent-from, #7F77DD), var(--accent-to, #1D9E75)); color: white; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0;">🚫</span>
          <span><strong>Sin compartir con terceros:</strong> nunca vendemos ni compartimos tus datos.</span>
        </li>
        <li style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.5;">
          <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; background: linear-gradient(135deg, var(--accent-from, #7F77DD), var(--accent-to, #1D9E75)); color: white; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0;">📵</span>
          <span><strong>Sin anuncios:</strong> tu app, tu información, sin distracciones.</span>
        </li>
      </ul>
      <div class="tutorial-tip-box">
        <p>🛡️ Cumplimos con la <strong>Ley 1581 de Habeas Data</strong> de Colombia. Tus datos están protegidos legalmente.</p>
      </div>
    `
  },
  {
    icon: '👛',
    title: 'Bolsillos',
    subtitle: 'Organiza dónde tienes tu dinero',
    content: `
      <h3>¿Qué es un Bolsillo?</h3>
      <p>Un Bolsillo representa un lugar donde tienes dinero: tu cuenta de Nequi, Bancolombia, Lulo, efectivo en la billetera, etc.</p>
      <p>También puedes crear bolsillos para metas: <strong>Fondo de Emergencias</strong>, <strong>Vacaciones</strong>, <strong>Gastos del mes</strong>.</p>
      <div class="tutorial-tip-box">
        <p>💡 <strong>Tip:</strong> Empieza creando uno para cada cuenta bancaria que tengas y uno para "Efectivo".</p>
      </div>
    `
  },
  {
    icon: '💰',
    title: 'Ingresos',
    subtitle: 'Salario y otros ingresos',
    content: `
      <h3>Define tus ingresos recurrentes</h3>
      <p>Aquí registras tu salario, mesada, freelance, o cualquier ingreso que recibes regularmente. Esto nos ayuda a calcular tu margen mensual.</p>
      <p>También puedes agregar <strong>ingresos extras</strong> ocasionales: bonos, ventas, regalos, etc.</p>
      <div class="tutorial-tip-box">
        <p>💡 <strong>Tip:</strong> Si tu salario varía, pon un promedio de los últimos 3 meses.</p>
      </div>
    `
  },
  {
    icon: '💸',
    title: 'Gastos',
    subtitle: 'Registra cada gasto al momento',
    content: `
      <h3>Registra tus gastos</h3>
      <p>Cada vez que gastas algo, ve a <strong>Presupuesto</strong> y regístralo. Solo necesitas:</p>
      <ul style="margin: 8px 0 12px 20px; padding: 0; font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
        <li>Descripción (ej: "Almuerzo")</li>
        <li>Monto</li>
        <li>Categoría (te sugerimos automáticamente)</li>
        <li>Método de pago</li>
      </ul>
      <div class="tutorial-tip-box">
        <p>💡 <strong>Tip:</strong> Hazlo al momento, no al final del día. Toma 10 segundos y la información será más precisa.</p>
      </div>
    `
  },
  {
    icon: '💳',
    title: 'Tarjetas de crédito',
    subtitle: 'Optimiza tu cashback y score',
    content: `
      <h3>Maneja tus tarjetas como un pro</h3>
      <p>Registra tus tarjetas con: cupo, día de corte, tasa y cashback. Te ayudaremos a:</p>
      <ul style="margin: 8px 0 12px 20px; padding: 0; font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
        <li>Mantener tu utilización <strong>menor al 30%</strong></li>
        <li>Maximizar cashback en cada compra</li>
        <li>Recordarte fechas de corte</li>
        <li>Mejorar tu score crediticio</li>
      </ul>
      <div class="tutorial-tip-box">
        <p>💡 <strong>Tip:</strong> Tenemos plantillas pre-cargadas para 30+ tarjetas colombianas (Lulo, Davivienda, Bancolombia, etc.)</p>
      </div>
    `
  },
  {
    icon: '🎯',
    title: '¡Listo para empezar!',
    subtitle: 'Tu dashboard está esperándote',
    content: `
      <h3>Ya conoces lo básico</h3>
      <p>En el <strong>Resumen</strong> verás un checklist con los siguientes pasos. Te llevará 5 minutos completarlo y dejar todo configurado.</p>
      <p style="margin-bottom: 4px;"><strong>Recuerda:</strong></p>
      <ul style="margin: 0 0 12px 20px; padding: 0; font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
        <li>Todo se guarda automáticamente en la nube ☁️</li>
        <li>Puedes acceder desde cualquier dispositivo</li>
        <li>Puedes ver este tutorial cuando quieras desde tu Perfil</li>
      </ul>
      <div class="tutorial-tip-box">
        <p>🚀 <strong>¡Empecemos a configurarlo!</strong></p>
      </div>
    `
  }
];

let currentTutorialStep = 0;

function showWelcomeTutorial() {
  console.log('🎓 Iniciando tutorial...');
  // Verificar si es nuevo usuario
  try {
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    if (!stateRaw) {
      console.log('⚠️ No hay state, no se muestra tutorial');
      return;
    }
    const state = JSON.parse(stateRaw);
    if (!state.isNewUser) {
      console.log('⚠️ No es nuevo usuario, no se muestra tutorial');
      return;
    }

    currentTutorialStep = 0;
    renderTutorialStep();
    console.log('✅ Tutorial iniciado correctamente');
  } catch(e) {
    console.error('❌ Error mostrando tutorial:', e);
  }
}

// Exponer a window globalmente
window.showWelcomeTutorial = showWelcomeTutorial;

function renderTutorialStep() {
  // Limpiar tutorial previo
  const existing = document.getElementById('welcome-tutorial');
  if (existing) existing.remove();

  const step = TUTORIAL_STEPS[currentTutorialStep];
  const total = TUTORIAL_STEPS.length;
  const isFirst = currentTutorialStep === 0;
  const isLast = currentTutorialStep === total - 1;

  // Generar dots de progreso
  let dotsHtml = '';
  for (let i = 0; i < total; i++) {
    let dotClass = 'tutorial-step-dot';
    if (i === currentTutorialStep) dotClass += ' active';
    else if (i < currentTutorialStep) dotClass += ' completed';
    dotsHtml += `<div class="${dotClass}"></div>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'welcome-tutorial';
  overlay.className = 'tutorial-overlay';

  overlay.innerHTML = `
    <div class="tutorial-card">
      <div class="tutorial-header">
        ${!isLast ? `<button class="tutorial-skip" onclick="skipTutorial()">Saltar</button>` : ''}
        <span class="tutorial-icon-big">${step.icon}</span>
        <h2 class="tutorial-title">${step.title}</h2>
        <p class="tutorial-subtitle">${step.subtitle}</p>
        <div class="tutorial-step-dots">${dotsHtml}</div>
      </div>

      <div class="tutorial-body">
        <div class="tutorial-step-content">
          ${step.content}
        </div>
      </div>

      <div class="tutorial-footer">
        ${!isFirst ? `<button class="tutorial-btn tutorial-btn-secondary" onclick="prevTutorialStep()">‹ Atrás</button>` : ''}
        <button class="tutorial-btn tutorial-btn-primary" onclick="${isLast ? 'finishTutorial()' : 'nextTutorialStep()'}">
          ${isLast ? '¡Empecemos! 🚀' : 'Siguiente ›'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  if (isFirst) lockBody();
}

// Exponer a window globalmente
window.renderTutorialStep = renderTutorialStep;

window.nextTutorialStep = function() {
  if (currentTutorialStep < TUTORIAL_STEPS.length - 1) {
    currentTutorialStep++;
    renderTutorialStep();
  }
};

window.prevTutorialStep = function() {
  if (currentTutorialStep > 0) {
    currentTutorialStep--;
    renderTutorialStep();
  }
};

window.skipTutorial = function() {
  finishTutorial();
};

window.finishTutorial = function() {
  const modal = document.getElementById('welcome-tutorial');
  if (modal) {
    modal.remove();
    unlockBody();
  }

  // Marcar como ya visto
  try {
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    if (stateRaw) {
      const state = JSON.parse(stateRaw);
      state.isNewUser = false;
      state.onboardingDismissed = false; // Para que aparezca el checklist en el resumen
      localStorage.setItem('finance-dashboard-cristian-v20', JSON.stringify(state));
    }
  } catch(e) {}

  // Mostrar checklist en el resumen
  setTimeout(() => updateOnboardingChecklist(), 300);
};

// Mantener compatibilidad
window.dismissWelcomeTutorial = window.finishTutorial;

// ============================================================
// MODAL DE PRIVACIDAD Y SEGURIDAD
// ============================================================
window.showPrivacyInfo = function() {
  // Limpiar cualquier modal previo
  const existing = document.getElementById('privacy-info-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'privacy-info-modal';
  overlay.className = 'tutorial-overlay';

  overlay.innerHTML = `
    <div class="tutorial-card">
      <div class="tutorial-header">
        <button class="tutorial-skip" onclick="closePrivacyInfo()">Cerrar ×</button>
        <span class="tutorial-icon-big">🔐</span>
        <h2 class="tutorial-title">Tu Privacidad</h2>
        <p class="tutorial-subtitle">Cómo protegemos tu información financiera</p>
      </div>

      <div class="tutorial-body">
        <div class="tutorial-step-content">
          <h3 style="margin: 0 0 12px;">Compromiso con tu privacidad</h3>
          <p style="font-size: 13px; line-height: 1.6;">En FinanzasPro entendemos que tu información financiera es <strong>extremadamente sensible</strong>. Por eso, hemos diseñado nuestra plataforma con la privacidad como pilar fundamental.</p>

          <div style="display: flex; flex-direction: column; gap: 10px; margin: 16px 0;">
            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 18px;">🔒</span>
                <strong style="font-size: 13px; color: var(--text-primary);">Acceso exclusivo</strong>
              </div>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                Tus datos están vinculados únicamente a tu cuenta. Ni desarrolladores, ni administradores, ni nadie más puede ver tu información financiera personal.
              </p>
            </div>

            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 18px;">🛡️</span>
                <strong style="font-size: 13px; color: var(--text-primary);">Cifrado bancario</strong>
              </div>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                Toda comunicación está protegida con cifrado SSL/TLS. Tus datos se almacenan cifrados en servidores seguros con protocolo bancario.
              </p>
            </div>

            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 18px;">🚫</span>
                <strong style="font-size: 13px; color: var(--text-primary);">Cero venta de datos</strong>
              </div>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                <strong>NUNCA</strong> vendemos, compartimos, alquilamos ni cedemos tu información a terceros. Tu información es tuya y solo tuya.
              </p>
            </div>

            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 18px;">📵</span>
                <strong style="font-size: 13px; color: var(--text-primary);">Sin anuncios ni rastreo</strong>
              </div>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                No mostramos publicidad. No usamos rastreadores de terceros. No te envíamos correos comerciales sin tu permiso.
              </p>
            </div>

            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 18px;">🗑️</span>
                <strong style="font-size: 13px; color: var(--text-primary);">Tu derecho al olvido</strong>
              </div>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                Puedes eliminar tu cuenta y todos tus datos en cualquier momento desde tu perfil. Sin preguntas, sin retenciones.
              </p>
            </div>

            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--success-text);">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 18px;">📥</span>
                <strong style="font-size: 13px; color: var(--text-primary);">Exporta cuando quieras</strong>
              </div>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
                Puedes descargar todos tus datos en formato JSON desde el menú "Exportar". La información es 100% tuya y portable.
              </p>
            </div>
          </div>

          <div class="tutorial-tip-box" style="background: linear-gradient(135deg, rgba(127, 119, 221, 0.1), rgba(29, 158, 117, 0.08)); border-left-color: var(--accent-from);">
            <p style="font-size: 12px; line-height: 1.6;">
              🇨🇴 <strong>Cumplimos la ley colombiana</strong>: Operamos bajo la Ley 1581 de 2012 (Habeas Data) y el Decreto 1377 de 2013 sobre protección de datos personales.
            </p>
          </div>

          <div style="margin-top: 16px; padding: 12px; background: var(--info-bg); border-radius: 10px; border-left: 3px solid var(--info-text);">
            <p style="margin: 0; font-size: 12px; line-height: 1.6; color: var(--info-text);">
              💬 <strong>¿Dudas o preguntas?</strong> Escribe a <strong>privacidad@finanzaspro.app</strong> y respondemos en menos de 48 horas.
            </p>
          </div>
        </div>
      </div>

      <div class="tutorial-footer">
        <button class="tutorial-btn tutorial-btn-primary" onclick="closePrivacyInfo()">
          Entendido 👍
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  if (typeof lockBody === 'function') lockBody();
};

window.closePrivacyInfo = function() {
  const modal = document.getElementById('privacy-info-modal');
  if (modal) {
    modal.remove();
    if (typeof unlockBody === 'function') unlockBody();
  }
};

window.showWelcomeTutorialAgain = function() {
  console.log('🎓 Mostrando tutorial manualmente desde Perfil...');
  // Permitir mostrarlo manualmente desde Perfil (sin importar si es nuevo o no)
  try {
    // Resetear el step
    if (typeof currentTutorialStep !== 'undefined') {
      currentTutorialStep = 0;
    }

    // Marcar como nuevo usuario temporalmente
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    if (stateRaw) {
      const state = JSON.parse(stateRaw);
      state.isNewUser = true;
      localStorage.setItem('finance-dashboard-cristian-v20', JSON.stringify(state));
    }

    // Llamar a renderTutorialStep directamente
    if (typeof window.renderTutorialStep === 'function') {
      window.renderTutorialStep();
      console.log('✅ Tutorial mostrado correctamente');
    } else if (typeof renderTutorialStep === 'function') {
      renderTutorialStep();
      console.log('✅ Tutorial mostrado correctamente');
    } else {
      console.error('❌ renderTutorialStep no está disponible');
      alert('Error al cargar el tutorial. Recarga la página por favor.');
    }
  } catch(e) {
    console.error('❌ Error mostrando tutorial:', e);
  }
};

// ============================================================
// CHECKLIST DE PROGRESO en el Resumen
// ============================================================

function getOnboardingProgress() {
  try {
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    if (!stateRaw) return null;
    const state = JSON.parse(stateRaw);

    // Calcular progreso de cada paso
    const hasPockets = state.pockets && state.pockets.filter(p => p.amount > 0).length > 0;
    const hasIncomes = state.incomes && state.incomes.length > 0;
    const hasCards = state.debts && state.debts.length > 0;
    
    // Verificar si tiene transacciones en cualquier mes
    let hasTransactions = false;
    if (state.transactions) {
      for (const month in state.transactions) {
        if (state.transactions[month] && state.transactions[month].length > 0) {
          hasTransactions = true;
          break;
        }
      }
    }

    return {
      pockets: hasPockets,
      incomes: hasIncomes,
      cards: hasCards,
      transactions: hasTransactions,
      dismissed: state.onboardingDismissed === true,
      total: 4,
      completed: [hasPockets, hasIncomes, hasCards, hasTransactions].filter(Boolean).length
    };
  } catch(e) {
    return null;
  }
}

function updateOnboardingChecklist() {
  const checklist = document.getElementById('onboarding-checklist');
  if (!checklist) return;

  const progress = getOnboardingProgress();
  if (!progress) {
    checklist.style.display = 'none';
    return;
  }

  // Si el usuario lo descartó O ya completó todo, ocultar
  if (progress.dismissed) {
    checklist.style.display = 'none';
    return;
  }

  // Mostrar checklist
  checklist.style.display = 'block';

  // Actualizar progreso
  const progressText = document.getElementById('onboarding-progress-text');
  const progressFill = document.getElementById('onboarding-progress-fill');
  if (progressText) progressText.textContent = `${progress.completed} de ${progress.total}`;
  if (progressFill) progressFill.style.width = `${(progress.completed / progress.total) * 100}%`;

  // Marcar pasos completados
  const stepPockets = document.getElementById('onboarding-step-pockets');
  const stepIncomes = document.getElementById('onboarding-step-incomes');
  const stepCards = document.getElementById('onboarding-step-cards');
  const stepTx = document.getElementById('onboarding-step-tx');

  if (stepPockets) stepPockets.classList.toggle('completed', progress.pockets);
  if (stepIncomes) stepIncomes.classList.toggle('completed', progress.incomes);
  if (stepCards) stepCards.classList.toggle('completed', progress.cards);
  if (stepTx) stepTx.classList.toggle('completed', progress.transactions);

  // Mostrar celebración si completó todo
  const celebration = document.getElementById('onboarding-celebration');
  if (celebration) {
    if (progress.completed === progress.total) {
      celebration.style.display = 'block';
    } else {
      celebration.style.display = 'none';
    }
  }
}

window.dismissOnboarding = async function() {
  const confirmed = await showConfirm({
    title: '¿Descartar guía?',
    message: 'Puedes volver a ver el tutorial completo desde tu Perfil cuando quieras.',
    confirmText: 'Sí, descartar',
    cancelText: 'Cancelar',
    type: 'warning',
    icon: '👋'
  });

  if (!confirmed) return;

  try {
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    if (stateRaw) {
      const state = JSON.parse(stateRaw);
      state.onboardingDismissed = true;
      localStorage.setItem('finance-dashboard-cristian-v20', JSON.stringify(state));
    }
  } catch(e) {}

  const checklist = document.getElementById('onboarding-checklist');
  if (checklist) {
    checklist.style.opacity = '0';
    checklist.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      checklist.style.display = 'none';
    }, 300);
  }
};

// Función para resetear el onboarding (desde Perfil)
window.resetOnboarding = function() {
  try {
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    if (stateRaw) {
      const state = JSON.parse(stateRaw);
      state.onboardingDismissed = false;
      localStorage.setItem('finance-dashboard-cristian-v20', JSON.stringify(state));
    }
    updateOnboardingChecklist();
    // Navegar a resumen
    const resumenTab = document.querySelector('.fin-tab[data-tab="resumen"]');
    if (resumenTab) resumenTab.click();
    toastSuccess('Guía activada', 'Verás el checklist en tu Resumen');
  } catch(e) {}
};

// ============================================================
// NAVEGACIÓN CON HIGHLIGHT (cuando tocas un paso del checklist)
// ============================================================

window.navigateAndHighlight = function(tabName, elementId) {
  // Cerrar drawer si está abierto
  if (typeof closeSideMenu === 'function') closeSideMenu();

  // Navegar al tab
  const targetTab = document.querySelector(`.fin-tab[data-tab="${tabName}"]`);
  if (targetTab) targetTab.click();

  // Sincronizar drawer
  document.querySelectorAll('.side-menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabName);
  });
  if (typeof updateMenuToggleText === 'function') updateMenuToggleText(tabName);

  // Highlight del elemento target
  setTimeout(() => {
    const target = document.getElementById(elementId);
    if (!target) return;

    // Scroll al elemento
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight: encontrar el contenedor padre (raised-card)
    let container = target.closest('.raised-card');
    if (!container) container = target.parentElement;

    if (container) {
      container.classList.add('onboarding-highlight');
      setTimeout(() => {
        container.classList.remove('onboarding-highlight');
      }, 4000);
    }

    // Focus en el input
    if (target.focus) {
      setTimeout(() => target.focus(), 600);
    }
  }, 400);
};

// ============================================================
// INTEGRACIÓN: actualizar checklist cuando cambian datos
// ============================================================

// Hook al saveState original para refrescar el checklist
(function() {
  let lastUpdate = 0;
  const originalSaveState = window.saveState;
  // Esperar a que saveState esté disponible
  const checkInterval = setInterval(() => {
    if (typeof window.saveState === 'function') {
      clearInterval(checkInterval);
      // No reemplazar saveState directamente, solo escuchar cambios
      // a través de un MutationObserver o setInterval
      setInterval(() => {
        const now = Date.now();
        if (now - lastUpdate > 1000) {
          lastUpdate = now;
          updateOnboardingChecklist();
        }
      }, 2000);
    }
  }, 200);
})();




// Mostrar tutorial automáticamente 1.5 segundos después del login
document.addEventListener('DOMContentLoaded', () => {
  // Verificar periódicamente si el usuario ya hizo login y es nuevo
  const checkInterval = setInterval(() => {
    if (window.currentUser) {
      clearInterval(checkInterval);
      // Esperar a que las funciones estén listas y luego mostrar el tutorial
      const tryShow = () => {
        if (typeof window.showWelcomeTutorial === 'function') {
          console.log('🎓 Disparando tutorial automático para nuevo usuario...');
          window.showWelcomeTutorial();
        } else if (typeof showWelcomeTutorial === 'function') {
          console.log('🎓 Disparando tutorial automático (fallback)...');
          showWelcomeTutorial();
        } else {
          console.warn('⚠️ Tutorial no disponible aún, reintentando...');
          setTimeout(tryShow, 500);
        }
      };
      setTimeout(tryShow, 1500);
    }
  }, 500);

  // Después de 30 segundos, dejar de revisar
  setTimeout(() => clearInterval(checkInterval), 30000);
});

// ============================================================
// SEMANA 1 - MEJORAS: TEMA, NOTIFICACIONES, CATEGORIZACIÓN, BÚSQUEDA
// ============================================================

// === 1. SISTEMA DE TEMA (claro/oscuro/auto) ===
const THEME_KEY = 'dashboard-theme-preference';

function setTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('theme-light', 'theme-dark');
  if (theme === 'light' || theme === 'dark') {
    html.classList.add('theme-' + theme);
  }
  // Si es 'auto', no agregamos clase y respeta @media prefers-color-scheme
  localStorage.setItem(THEME_KEY, theme);
  updateThemeButtons(theme);
  updateThemeToggleIcon();
}

function updateThemeButtons(activeTheme) {
  ['light', 'dark', 'auto'].forEach(t => {
    const btn = document.getElementById('theme-btn-' + t);
    if (btn) {
      if (t === activeTheme) {
        btn.style.background = 'linear-gradient(135deg, #7F77DD22, #1D9E7522)';
        btn.style.border = '2px solid var(--info-text)';
      } else {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.border = '1px solid var(--border)';
      }
    }
  });
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const current = localStorage.getItem(THEME_KEY) || 'auto';
  const icons = { light: '☀️', dark: '🌙', auto: '🌗' };
  btn.textContent = icons[current];
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'auto';
  const next = current === 'light' ? 'dark' : (current === 'dark' ? 'auto' : 'light');
  setTheme(next);
}

// Aplicar tema guardado al cargar
(function applyStoredTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  setTheme(saved);
})();

// === 2. SISTEMA DE NOTIFICACIONES INTELIGENTES ===
const NOTIFICATIONS_KEY = 'dashboard-notifications-shown';

function getStateForNotifications() {
  try {
    return JSON.parse(localStorage.getItem('finance-dashboard-cristian-v20') || '{}');
  } catch(e) { return {}; }
}

function checkSmartNotifications() {
  const state = getStateForNotifications();
  if (!state.debts) return [];

  const notifications = [];
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];

  // Notificaciones ya mostradas hoy (para no spamear)
  let shownToday = {};
  try {
    shownToday = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '{}');
    if (shownToday.date !== todayKey) shownToday = { date: todayKey, ids: [] };
  } catch(e) { shownToday = { date: todayKey, ids: [] }; }

  // 1. Alertas de cortes de tarjetas
  state.debts.forEach(d => {
    if (!d.cutoffDay) return;
    let nextCutoff;
    if (today.getDate() <= d.cutoffDay) {
      nextCutoff = new Date(today.getFullYear(), today.getMonth(), d.cutoffDay);
    } else {
      nextCutoff = new Date(today.getFullYear(), today.getMonth() + 1, d.cutoffDay);
    }
    const daysLeft = Math.ceil((nextCutoff - today) / (1000 * 60 * 60 * 24));

    // Calcular utilización
    const util = d.payment > 0 ? (d.balance / d.payment) * 100 : 0;
    const targetMax = d.payment * 0.03;
    const needsPay = d.balance > targetMax;
    const payAmount = needsPay ? d.balance - targetMax : 0;

    if (daysLeft >= 1 && daysLeft <= 3 && needsPay) {
      const id = 'cutoff_' + d.id + '_' + daysLeft;
      if (!shownToday.ids.includes(id)) {
        notifications.push({
          id, type: 'warning', icon: '⚠️',
          title: `${d.name}: corte en ${daysLeft} día${daysLeft > 1 ? 's' : ''}`,
          msg: `Tu utilización es ${util.toFixed(1)}%. Para mantener score óptimo (3%), paga $${Math.round(payAmount).toLocaleString('es-CO')} antes del corte.`
        });
      }
    } else if (daysLeft === 0) {
      const id = 'cutoff_today_' + d.id;
      if (!shownToday.ids.includes(id)) {
        notifications.push({
          id, type: 'danger', icon: '🚨',
          title: `${d.name}: ¡HOY es el corte!`,
          msg: `Saldo: $${Math.round(d.balance).toLocaleString('es-CO')}. ${needsPay ? 'Paga ahora para mantener score' : 'Utilización ya está óptima.'}`
        });
      }
    }
  });

  // 2. Notificación de transacciones por método ineficiente
  const monthKey = todayKey.substring(0, 7);
  const monthTx = (state.transactions && state.transactions[monthKey]) || [];
  const llaveTx = monthTx.filter(t => t.paymentMethod === 'llave' || t.paymentMethod === 'pse');
  const totalLlave = llaveTx.reduce((s, t) => s + (t.amount || 0), 0);
  if (totalLlave > 100000) {
    const id = 'llave_warn_' + monthKey;
    if (!shownToday.ids.includes(id)) {
      const lostCashback = totalLlave * 0.01;
      notifications.push({
        id, type: 'info', icon: '💡',
        title: 'Optimización de cashback',
        msg: `Este mes pagaste $${Math.round(totalLlave).toLocaleString('es-CO')} por Llave/PSE. Si lo hubieras hecho con tarjeta de crédito, habrías ganado $${Math.round(lostCashback).toLocaleString('es-CO')} en cashback.`
      });
    }
  }

  // 3. Notificación de inactividad (no registras gastos hace mucho)
  const lastTx = monthTx.length > 0 ? new Date(monthTx[monthTx.length - 1].date) : null;
  if (lastTx) {
    const daysSinceLast = Math.floor((today - lastTx) / (1000 * 60 * 60 * 24));
    if (daysSinceLast >= 5) {
      const id = 'inactive_' + todayKey;
      if (!shownToday.ids.includes(id)) {
        notifications.push({
          id, type: 'info', icon: '📝',
          title: 'Te falta registrar gastos',
          msg: `Llevas ${daysSinceLast} días sin registrar transacciones. ¿Has tenido gastos pendientes de registrar?`
        });
      }
    }
  }

  // 4. Felicitación por buen score
  if (state.creditScore && state.creditScore.lastReported >= 670) {
    const id = 'score_good_' + (state.creditScore.lastReportedDate || '');
    if (!shownToday.ids.includes(id) && state.creditScore.history && state.creditScore.history.length >= 2) {
      const sorted = [...state.creditScore.history].sort((a, b) => a.date.localeCompare(b.date));
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      if (last.score > prev.score) {
        notifications.push({
          id, type: 'success', icon: '🎉',
          title: '¡Tu score subió!',
          msg: `De ${prev.score} a ${last.score} (+${last.score - prev.score} puntos). Sigue así.`
        });
      }
    }
  }

  return notifications;
}

function showNotificationsPanel() {
  const notifs = checkSmartNotifications();
  if (notifs.length === 0) return;

  let panel = document.getElementById('notifications-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'notifications-panel';
  panel.style.cssText = 'position: fixed; top: 80px; right: 20px; width: 340px; max-width: calc(100vw - 40px); z-index: 998; display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 100px); overflow-y: auto;';

  notifs.forEach(n => {
    const colors = {
      danger: ['var(--danger-bg)', 'var(--danger-text)', '#A32D2D'],
      warning: ['var(--warning-bg)', 'var(--warning-text)', '#854f0b'],
      info: ['var(--info-bg)', 'var(--info-text)', '#185fa5'],
      success: ['var(--success-bg)', 'var(--success-text)', '#3b6d11']
    };
    const [bg, text, border] = colors[n.type] || colors.info;

    const card = document.createElement('div');
    card.style.cssText = `padding: 14px; background: var(--bg-primary); border: 1px solid var(--border); border-left: 4px solid ${border}; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); animation: slideIn 0.3s ease;`;
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">${n.icon}</span>
          <strong style="font-size: 13px; color: var(--text-primary);">${n.title}</strong>
        </div>
        <button onclick="dismissNotification('${n.id}')" style="background: transparent; border: none; cursor: pointer; padding: 0; color: var(--text-tertiary); font-size: 16px;">×</button>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${n.msg}</div>
    `;
    panel.appendChild(card);
  });

  document.body.appendChild(panel);

  // Auto-marcar como mostradas
  const todayKey = new Date().toISOString().split('T')[0];
  const shown = { date: todayKey, ids: notifs.map(n => n.id) };
  try {
    const existing = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '{}');
    if (existing.date === todayKey) {
      shown.ids = [...new Set([...existing.ids, ...shown.ids])];
    }
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(shown));
  } catch(e) {}
}

function dismissNotification(id) {
  const panel = document.getElementById('notifications-panel');
  if (!panel) return;
  // Encontrar y eliminar la card específica
  panel.querySelectorAll('div').forEach(div => {
    if (div.innerHTML.includes(`dismissNotification('${id}')`)) {
      div.style.animation = 'slideOut 0.2s ease forwards';
      setTimeout(() => {
        div.remove();
        if (panel.children.length === 0) panel.remove();
      }, 200);
    }
  });
}

// Inyectar animaciones
const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes slideIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
  @keyframes slideOut { to { opacity: 0; transform: translateX(100%); } }
`;
document.head.appendChild(styleEl);

// === 3. CATEGORIZACIÓN AUTOMÁTICA INTELIGENTE ===
const SMART_CATEGORIES = {
  'uber': 'uber', 'didi': 'uber', 'cabify': 'uber', 'taxi': 'uber',
  'rappi': 'rappi', 'didi food': 'comida_fuera', 'mcdonalds': 'comida_fuera',
  'movistar': 'servicios_casa', 'claro': 'servicios_casa', 'tigo': 'celular',
  'wom': 'celular', 'etb': 'servicios_casa', 'codensa': 'servicios_casa',
  'enel': 'servicios_casa', 'gas natural': 'servicios_casa', 'vanti': 'servicios_casa',
  'acueducto': 'servicios_casa', 'epm': 'servicios_casa',
  'netflix': 'streaming', 'spotify': 'streaming', 'disney': 'streaming',
  'youtube': 'streaming', 'hbo': 'streaming', 'amazon prime': 'streaming',
  'gym': 'gimnasio', 'gimnasio': 'gimnasio', 'smart fit': 'gimnasio', 'bodytech': 'gimnasio',
  'terpel': 'gasolina', 'esso': 'gasolina', 'mobil': 'gasolina', 'shell': 'gasolina',
  'gasolina': 'gasolina', 'biomax': 'gasolina',
  'farmacia': 'salud', 'cruz verde': 'salud', 'colsubsidio': 'salud', 'eps': 'salud',
  'medicina': 'salud', 'doctor': 'salud', 'medicamentos': 'mascota', 'veterinari': 'mascota',
  'zlatan': 'mascota', 'mascota': 'mascota',
  'cafe': 'comida_fuera', 'restaurante': 'comida_fuera', 'almuerzo': 'comida_fuera',
  'cancha': 'salidas_milena', 'milena': 'salidas_milena', 'valentina': 'otros',
  'datacredito': 'otros', 'pago tarjeta': 'otros', 'transferencia': 'otros'
};

function suggestCategory(description) {
  if (!description || typeof description !== 'string') return null;
  const desc = description.toLowerCase().trim();
  // Buscar coincidencia exacta primero
  for (const keyword in SMART_CATEGORIES) {
    if (desc.includes(keyword)) {
      return SMART_CATEGORIES[keyword];
    }
  }
  return null;
}

function setupSmartCategorization() {
  const descInput = document.getElementById('tx-desc');
  const catSelect = document.getElementById('tx-category');
  if (!descInput || !catSelect) return;

  let suggestion = null;
  descInput.addEventListener('input', () => {
    suggestion = suggestCategory(descInput.value);
    showCategorySuggestion(suggestion, descInput, catSelect);
  });
}

function showCategorySuggestion(catId, descInput, catSelect) {
  let hint = document.getElementById('category-suggestion-hint');
  if (!catId) {
    if (hint) hint.remove();
    return;
  }

  const option = catSelect.querySelector(`option[value="${catId}"]`);
  if (!option) {
    if (hint) hint.remove();
    return;
  }

  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'category-suggestion-hint';
    hint.style.cssText = 'margin-top: 4px; padding: 6px 10px; background: var(--info-bg); color: var(--info-text); border-radius: 8px; font-size: 11px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
    descInput.parentElement.insertBefore(hint, descInput.nextSibling);
  }

  hint.innerHTML = `
    <span>💡 Sugerencia: <strong>${option.textContent}</strong></span>
    <button onclick="acceptCategorySuggestion('${catId}')" style="padding: 2px 8px; font-size: 10px; background: var(--info-text); color: white; border: none; border-radius: 4px; cursor: pointer;">Usar</button>
  `;
}

window.acceptCategorySuggestion = function(catId) {
  const catSelect = document.getElementById('tx-category');
  if (catSelect) {
    catSelect.value = catId;
    const hint = document.getElementById('category-suggestion-hint');
    if (hint) hint.remove();
  }
};

// === 4. BÚSQUEDA Y FILTROS DE TRANSACCIONES ===
let transactionFilters = {
  search: '',
  category: 'all',
  paymentMethod: 'all',
  cardId: 'all',
  startDate: null,
  endDate: null
};

function injectTransactionFilters() {
  const txList = document.getElementById('tx-list-container') || document.getElementById('transaction-list');
  if (!txList) return;

  // Solo agregar si no existen los filtros
  if (document.getElementById('tx-filters-bar')) return;

  const filtersBar = document.createElement('div');
  filtersBar.id = 'tx-filters-bar';
  filtersBar.className = 'raised-card';
  filtersBar.style.marginBottom = '12px';
  filtersBar.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer;" onclick="toggleFiltersPanel()">
      <p class="card-title" style="margin: 0;">🔍 Buscar y filtrar transacciones</p>
      <span id="filters-toggle-icon" style="font-size: 14px; color: var(--text-secondary);">▼</span>
    </div>
    <div id="tx-filters-panel" style="display: none;">
      <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 10px;">
        <input type="text" id="tx-filter-search" placeholder="🔍 Buscar por descripción..." />
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
        <select id="tx-filter-category"><option value="all">Todas las categorías</option></select>
        <select id="tx-filter-method">
          <option value="all">Todos los métodos</option>
          <option value="tarjeta">💳 Tarjeta</option>
          <option value="pse">🏦 PSE</option>
          <option value="llave">🔑 Llave/Bre-B</option>
          <option value="efectivo">💵 Efectivo</option>
          <option value="debito">💳 Débito</option>
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
        <input type="date" id="tx-filter-start" placeholder="Desde" />
        <input type="date" id="tx-filter-end" placeholder="Hasta" />
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <button onclick="clearFilters()" style="font-size: 11px; padding: 6px 12px;">🗑️ Limpiar filtros</button>
        <span id="filter-results-count" style="font-size: 12px; color: var(--text-secondary);"></span>
      </div>
    </div>
  `;
  txList.parentElement.insertBefore(filtersBar, txList);

  // Llenar opciones de categorías
  const catSelect = document.getElementById('tx-filter-category');
  if (catSelect && typeof CATEGORIES !== 'undefined') {
    // CATEGORIES está dentro del IIFE, accedemos por el select original
    const origCatSelect = document.getElementById('tx-category');
    if (origCatSelect) {
      Array.from(origCatSelect.options).forEach(opt => {
        catSelect.innerHTML += `<option value="${opt.value}">${opt.textContent}</option>`;
      });
    }
  }

  // Listeners
  ['tx-filter-search', 'tx-filter-category', 'tx-filter-method', 'tx-filter-start', 'tx-filter-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', applyTransactionFilters);
      el.addEventListener('change', applyTransactionFilters);
    }
  });
}

window.toggleFiltersPanel = function() {
  const panel = document.getElementById('tx-filters-panel');
  const icon = document.getElementById('filters-toggle-icon');
  if (panel) {
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    if (icon) icon.textContent = isHidden ? '▲' : '▼';
  }
};

window.clearFilters = function() {
  ['tx-filter-search', 'tx-filter-category', 'tx-filter-method', 'tx-filter-start', 'tx-filter-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = (el.tagName === 'SELECT' ? 'all' : '');
  });
  applyTransactionFilters();
};

window.applyTransactionFilters = function() {
  const search = (document.getElementById('tx-filter-search')?.value || '').toLowerCase().trim();
  const category = document.getElementById('tx-filter-category')?.value || 'all';
  const method = document.getElementById('tx-filter-method')?.value || 'all';
  const startDate = document.getElementById('tx-filter-start')?.value;
  const endDate = document.getElementById('tx-filter-end')?.value;

  let visibleCount = 0;
  let totalCount = 0;

  document.querySelectorAll('.tx-row, [data-tx-id]').forEach(row => {
    totalCount++;
    let show = true;

    const desc = (row.getAttribute('data-tx-desc') || row.textContent || '').toLowerCase();
    const cat = row.getAttribute('data-tx-category') || '';
    const meth = row.getAttribute('data-tx-method') || '';
    const date = row.getAttribute('data-tx-date') || '';

    if (search && !desc.includes(search)) show = false;
    if (category !== 'all' && cat !== category) show = false;
    if (method !== 'all' && meth !== method) show = false;
    if (startDate && date < startDate) show = false;
    if (endDate && date > endDate) show = false;

    row.style.display = show ? '' : 'none';
    if (show) visibleCount++;
  });

  const counter = document.getElementById('filter-results-count');
  if (counter) {
    if (search || category !== 'all' || method !== 'all' || startDate || endDate) {
      counter.textContent = `${visibleCount} de ${totalCount} transacciones`;
    } else {
      counter.textContent = '';
    }
  }
};

window.setTheme = setTheme;
window.toggleTheme = toggleTheme;
window.dismissNotification = dismissNotification;

// Activar todo cuando esté el dashboard cargado
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    setupSmartCategorization();
    injectTransactionFilters();
    // Mostrar notificaciones después de 2 segundos para no abrumar al cargar
    setTimeout(() => {
      if (currentUser) showNotificationsPanel();
    }, 2000);
  }, 1500);

  // Inicializar tema buttons cuando se entre a perfil
  setTimeout(() => {
    const saved = localStorage.getItem(THEME_KEY) || 'auto';
    updateThemeButtons(saved);
    updateThemeToggleIcon();
  }, 500);
});

// Re-aplicar filtros cada vez que se renderice
const observer = new MutationObserver(() => {
  if (document.getElementById('tx-filters-bar')) {
    applyTransactionFilters();
  } else {
    injectTransactionFilters();
  }
});
setTimeout(() => {
  const txContainer = document.getElementById('section-presupuesto');
  if (txContainer) {
    observer.observe(txContainer, { childList: true, subtree: true });
  }
}, 2000);

// ============================================================
// SEMANA 2 - IMPORTACIÓN, CALENDARIO, COMPARATIVAS, HORMIGAS
// ============================================================

let pendingImport = []; // Movimientos pendientes de confirmación

const fmtMoney = (n) => '$ ' + Math.round(n).toLocaleString('es-CO');

// === 1. IMPORTAR MOVIMIENTOS DESDE BANCO ===
function setupBankImport() {
  const fileInput = document.getElementById('bank-import-file');
  if (!fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const bank = document.getElementById('import-bank').value;
    const status = document.getElementById('import-status');
    status.innerHTML = '⏳ Procesando archivo...';
    status.style.color = 'var(--info-text)';

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let movements = [];

      if (ext === 'pdf') {
        if (!window.pdfjsLib) {
          throw new Error('PDF.js no se cargó. Refresca la página e inténtalo de nuevo.');
        }
        status.innerHTML = '⏳ Leyendo PDF...';
        const text = await extractTextFromPDF(file);
        movements = parsePDFText(text, bank);
      } else if (ext === 'csv' || ext === 'txt') {
        const text = await file.text();
        const rows = parseCSV(text);
        movements = parseMovementsByBank(rows, bank);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        movements = parseMovementsByBank(rows, bank);
      } else {
        throw new Error('Formato no soportado. Usa PDF, CSV o Excel.');
      }

      if (movements.length === 0) {
        status.innerHTML = '⚠️ No se encontraron movimientos válidos en el archivo. Verifica que sea un extracto bancario.';
        status.style.color = 'var(--warning-text)';
        return;
      }

      pendingImport = movements;
      showImportPreview(movements);
      status.innerHTML = `✅ Encontrados ${movements.length} movimientos. Revisa abajo.`;
      status.style.color = 'var(--success-text)';
    } catch (err) {
      console.error(err);
      status.innerHTML = '❌ Error: ' + err.message;
      status.style.color = 'var(--danger-text)';
    }

    fileInput.value = '';
  });
}

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruir el texto agrupando por línea (Y coordinate)
    const lines = {};
    content.items.forEach(item => {
      if (!item.str || !item.str.trim()) return;
      const y = Math.round(item.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push({ x: item.transform[4], text: item.str });
    });
    // Ordenar líneas de arriba a abajo, items por X
    const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a);
    sortedY.forEach(y => {
      const sorted = lines[y].sort((a, b) => a.x - b.x);
      fullText += sorted.map(s => s.text).join(' ') + '\n';
    });
    fullText += '\n--- PAGE ' + i + ' ---\n';
  }
  return fullText;
}

function parsePDFText(text, bank) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Si es Lulo Bank, usar parser específico
  if (bank === 'lulo') {
    return parseLuloBankPDF(lines);
  }

  // Parser genérico para otros bancos
  return parseGenericPDF(lines, bank);
}

function parseLuloBankPDF(lines) {
  const movements = [];
  const monthMap = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12'
  };

  // Patrón específico de Lulo: [ID] [fecha op] [fecha aut] [descripción] [monto]
  // Formato fecha: "01 abr. 2026"
  // Formato monto: "+6,000.00" o "-368,000.00"

  // Regex para línea típica:
  // ID(8-10 dígitos) DD MES. YYYY DD MES. YYYY DESCRIPCIÓN +/-MONTO
  const luloLineRegex = /^(\d{8,})\s+(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s+(\d{4})\s+(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s+(\d{4})\s+(.+?)\s+([+\-]\s?[\d.,]+)\s*$/i;

  // Patrones para los nombres de bolsillos (secciones que NO debemos procesar como movimientos generales)
  // El extracto de Lulo tiene: cuenta principal + "Bolsillos flex" + cada bolsillo
  // Solo queremos los de la cuenta principal (primera sección antes de "Bolsillos flex")

  let currentSection = 'main'; // 'main' o 'bolsillo:NOMBRE'
  let processingBolsillos = false;
  const bolsilloNames = ['flujo operativo', 'universidad', 'servicios', 'viajes futuros',
                          'fondo de emergencias', 'vida social', 'zlatan', 'gastos fijos del mes',
                          'efectivo', 'cashback rappicard'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase().trim();

    // Detectar inicio de "Bolsillos flex" para dejar de procesar
    if (lowerLine === 'bolsillos flex' || lowerLine.startsWith('bolsillos flex')) {
      processingBolsillos = true;
      continue;
    }

    // Si ya estamos en bolsillos, NO procesar (porque son movimientos internos, no gastos reales)
    if (processingBolsillos) continue;

    // Saltar líneas de cabeceras y resumen
    if (lowerLine.startsWith('saldo') || lowerLine.startsWith('rendimientos') ||
        lowerLine.startsWith('extracto') || lowerLine.startsWith('no. cuenta') ||
        lowerLine.startsWith('movimientos') || lowerLine.startsWith('resumen') ||
        lowerLine.startsWith('ingresos') || lowerLine.startsWith('gastos') ||
        lowerLine.startsWith('operaciones') || lowerLine.startsWith('intereses') ||
        lowerLine.startsWith('impuestos') || lowerLine.startsWith('---') ||
        lowerLine.startsWith('en lulo bank') || lowerLine.startsWith('defensor') ||
        lowerLine.startsWith('carrera') || lowerLine.startsWith('conoce')) {
      continue;
    }

    // Aplicar regex
    const m = line.match(luloLineRegex);
    if (!m) continue;

    const [_, id, day, monthStr, year, dayAuth, monthAuthStr, yearAuth, descRaw, amountRaw] = m;
    const monthNum = monthMap[monthStr.toLowerCase().substring(0, 3)];
    if (!monthNum) continue;

    const date = `${year}-${monthNum}-${day.padStart(2, '0')}`;
    const desc = descRaw.trim().replace(/\s+/g, ' ');

    // Parsear monto
    const amountStr = amountRaw.replace(/\s/g, '');
    const isNegative = amountStr.startsWith('-');
    const amountValue = parseAmount(amountStr.replace(/^[+\-]/, ''));
    if (amountValue === null || amountValue === 0) continue;

    // Filtrar movimientos internos que NO son gastos reales:
    // - "Retiro bolsillo" → es transferencia interna entre cuenta y bolsillo (NO gasto)
    // - "Transferencia bolsillo" → similar (NO gasto)
    // - "Abono intereses" → es ingreso pasivo
    // - "Retención en la Fuente" → impuesto pequeño (lo ignoramos)
    const lowerDesc = desc.toLowerCase();
    if (lowerDesc.includes('retiro bolsillo') || 
        lowerDesc.includes('transferencia bolsillo') ||
        lowerDesc.includes('recarga bolsillo') ||
        lowerDesc.includes('abono intereses') ||
        lowerDesc.includes('retención en la fuente') ||
        lowerDesc.includes('abono de cashback') ||
        lowerDesc.includes('depósito ach') ||
        lowerDesc.includes('deposito ach')) {
      continue;
    }

    // Determinar si es ingreso o gasto basado en la descripción
    let isExpense = isNegative;

    // Las "Transferencias Bre-B" pueden ser ingresos (+) o gastos (-)
    // Los "Pagos PSE" siempre son gastos
    // Los "Pagos de tarjeta de crédito" son gastos

    // Sugerir categoría con detección mejorada
    let category = suggestCategory(desc) || 'otros';
    let shouldIncludeByDefault = isExpense; // por defecto, gastos se importan

    // Mapeo específico para Lulo
    if (lowerDesc.includes('pago pse banco davivienda')) {
      category = 'otros';
      // Estos son pagos a tarjeta Davivienda (RappiCard) - son pagos internos, NO gastos reales
      shouldIncludeByDefault = false;
    } else if (lowerDesc.includes('pago pse claro')) {
      category = 'celular';
      shouldIncludeByDefault = true; // SÍ es gasto real
    } else if (lowerDesc.includes('pago pse pg colombia')) {
      category = 'streaming';
      shouldIncludeByDefault = true; // SÍ es gasto real (Spotify/streaming)
    } else if (lowerDesc.includes('pago pse experian')) {
      category = 'otros';
      shouldIncludeByDefault = true; // SÍ es gasto real (DataCrédito)
    } else if (lowerDesc.includes('pago pse gou payments')) {
      category = 'compras';
      shouldIncludeByDefault = true;
    } else if (lowerDesc.includes('pago de tarjeta de crédito') || lowerDesc.includes('pago de tarjeta de credito')) {
      category = 'otros';
      // Pago a tarjeta propia = transferencia interna, NO gasto real
      shouldIncludeByDefault = false;
    } else if (lowerDesc.includes('transferencia bre-b')) {
      // Bre-B sin contexto: marcamos como "otros" pero NO incluimos por defecto
      // El usuario decide caso por caso
      category = 'otros';
      shouldIncludeByDefault = false;
    }

    movements.push({
      date,
      desc: desc.substring(0, 80),
      amount: amountValue,
      isExpense,
      suggestedCategory: category,
      include: shouldIncludeByDefault
    });
  }

  // Eliminar duplicados
  const seen = new Set();
  return movements.filter(m => {
    const key = `${m.date}-${m.desc}-${m.amount}-${m.isExpense}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseGenericPDF(lines, bank) {
  const movements = [];

  // Patrones de fechas
  const datePatterns = [
    /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/, // DD/MM/YYYY
    /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,   // YYYY-MM-DD
    /^(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s*(\d{2,4})?/i,
    /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s+(\d{1,2})/i,
  ];

  const monthMap = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12'
  };

  let inferredYear = new Date().getFullYear();
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const m = lines[i].match(/(20\d{2})/);
    if (m) { inferredYear = parseInt(m[1]); break; }
  }

  lines.forEach(line => {
    if (line.length < 8 || line.startsWith('---')) return;

    let date = null;
    let restOfLine = line;

    for (const pattern of datePatterns) {
      const m = line.match(pattern);
      if (m) {
        if (pattern === datePatterns[0]) {
          let [_, d, mo, y] = m;
          if (y.length === 2) y = '20' + y;
          if (y.length === 4) {
            date = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
            restOfLine = line.substring(m[0].length).trim();
          }
        } else if (pattern === datePatterns[1]) {
          const [_, y, mo, d] = m;
          date = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
          restOfLine = line.substring(m[0].length).trim();
        } else if (pattern === datePatterns[2]) {
          const [_, d, monStr, y] = m;
          const mo = monthMap[monStr.toLowerCase().substring(0,3)];
          const year = y || inferredYear;
          date = `${year}-${mo}-${d.padStart(2,'0')}`;
          restOfLine = line.substring(m[0].length).trim();
        } else if (pattern === datePatterns[3]) {
          const [_, monStr, d] = m;
          const mo = monthMap[monStr.toLowerCase().substring(0,3)];
          date = `${inferredYear}-${mo}-${d.padStart(2,'0')}`;
          restOfLine = line.substring(m[0].length).trim();
        }
        break;
      }
    }

    if (!date) return;

    const amountMatches = restOfLine.match(/[\-\+]?\s?\$?\s?[\d]{1,3}(?:[\.,][\d]{3})*(?:[\.,][\d]{1,2})?(?!\d)/g) || [];
    const numbers = [];
    amountMatches.forEach(m => {
      const v = parseAmount(m);
      if (v !== null && Math.abs(v) >= 100 && Math.abs(v) < 100000000) {
        numbers.push({ value: v, raw: m, isNegative: m.includes('-') });
      }
    });

    if (numbers.length === 0) return;

    const amount = numbers[numbers.length - 1];
    let desc = restOfLine;
    amountMatches.forEach(m => { desc = desc.replace(m, ''); });
    desc = desc.replace(/\s+/g, ' ').trim();

    if (!desc || desc.length < 2) return;
    if (/^\d+$/.test(desc)) return;

    let isExpense = true;
    const lowerDesc = desc.toLowerCase();
    if (amount.isNegative) isExpense = true;
    if (lowerDesc.includes('abono') || lowerDesc.includes('consignaci') || 
        lowerDesc.includes('deposito') || lowerDesc.includes('nomina') ||
        lowerDesc.includes('rendimiento') || lowerDesc.includes('intereses ganados') ||
        lowerDesc.includes('credito a su cuenta')) {
      isExpense = false;
    }

    if (lowerDesc.includes('saldo anterior') || lowerDesc.includes('saldo final') ||
        lowerDesc.includes('total ') || lowerDesc.includes('disponible')) return;

    movements.push({
      date,
      desc: desc.substring(0, 80),
      amount: Math.abs(amount.value),
      isExpense,
      suggestedCategory: suggestCategory(desc) || 'otros',
      include: isExpense
    });
  });

  const seen = new Set();
  return movements.filter(m => {
    const key = `${m.date}-${m.desc}-${m.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200);
}

function parseCSV(text) {
  const rows = [];
  // Detectar separador: ; o ,
  const sep = (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length) ? ';' : ',';
  text.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    // Parser CSV simple (no perfecto pero funciona para extractos bancarios)
    const fields = [];
    let curr = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; continue; }
      if (c === sep && !inQuote) {
        fields.push(curr.trim());
        curr = '';
      } else {
        curr += c;
      }
    }
    fields.push(curr.trim());
    rows.push(fields);
  });
  return rows;
}

function parseMovementsByBank(rows, bank) {
  if (rows.length < 2) return [];

  // Buscar la fila de headers
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i].map(x => String(x).toLowerCase());
    if (r.some(c => c.includes('fecha') || c.includes('date'))) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx].map(h => String(h).toLowerCase().trim());
  const dataRows = rows.slice(headerRowIdx + 1);

  // Identificar columnas
  const findCol = (keywords) => {
    for (let i = 0; i < headers.length; i++) {
      if (keywords.some(k => headers[i].includes(k))) return i;
    }
    return -1;
  };

  const dateCol = findCol(['fecha', 'date']);
  const descCol = findCol(['descripci', 'detalle', 'concepto', 'description']);
  const amountCol = findCol(['monto', 'valor', 'amount', 'importe']);
  const debitCol = findCol(['débito', 'debito', 'debit', 'cargo', 'salida', 'egreso']);
  const creditCol = findCol(['crédito', 'credito', 'credit', 'abono', 'entrada', 'ingreso']);

  if (dateCol === -1 || descCol === -1) return [];

  const movements = [];
  dataRows.forEach(row => {
    if (!row || row.length === 0) return;
    const dateRaw = String(row[dateCol] || '').trim();
    const desc = String(row[descCol] || '').trim();
    if (!dateRaw || !desc) return;

    let amount = 0;
    let isExpense = true;
    if (amountCol !== -1) {
      const v = parseAmount(row[amountCol]);
      if (v !== null) {
        amount = Math.abs(v);
        isExpense = v < 0; // negativo = gasto
      }
    } else if (debitCol !== -1 && creditCol !== -1) {
      const debit = parseAmount(row[debitCol]) || 0;
      const credit = parseAmount(row[creditCol]) || 0;
      if (debit > 0) { amount = debit; isExpense = true; }
      else if (credit > 0) { amount = credit; isExpense = false; }
    }

    if (amount === 0) return;

    const date = parseDate(dateRaw);
    if (!date) return;

    // Sugerir categoría automáticamente
    const suggestedCategory = suggestCategory(desc) || 'otros';

    movements.push({
      date,
      desc: desc.substring(0, 100),
      amount,
      isExpense,
      suggestedCategory,
      include: isExpense // por defecto solo importar gastos
    });
  });

  return movements.slice(0, 200); // límite seguro
}

function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  let s = String(value).replace(/\s/g, '').replace(/\$/g, '').replace(/cop/gi, '');
  // Detectar formato: "1.234,56" (es-CO) vs "1,234.56" (en-US)
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Formato es-CO: . es miles, , es decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato en-US: , es miles, . es decimal
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Solo coma: probablemente decimal en es-CO
    const parts = s.split(',');
    if (parts[1] && parts[1].length <= 2) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseDate(raw) {
  if (!raw) return null;
  raw = String(raw).trim();
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 10);
  // Formato DD/MM/YYYY o DD-MM-YYYY
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [_, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Excel serial date number
  const num = parseFloat(raw);
  if (!isNaN(num) && num > 25000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  return null;
}

function showImportPreview(movements) {
  const card = document.getElementById('import-preview-card');
  const content = document.getElementById('import-preview-content');
  if (!card || !content) return;

  card.style.display = 'block';

  let html = `<div style="margin-bottom: 10px; padding: 10px 12px; background: var(--info-bg); border-radius: 8px; font-size: 12px; color: var(--info-text);">`;
  html += `📊 <strong>${movements.length} movimientos encontrados.</strong><br>`;
  html += `✅ Marcamos automáticamente solo los gastos identificables (PSE Claro, PSE Spotify, etc.)<br>`;
  html += `⚠️ Las "Transferencia Bre-B" y "Pago de tarjeta" están desmarcadas por defecto para evitar duplicados.`;
  html += `</div>`;

  html += `<div style="display: flex; gap: 8px; margin-bottom: 10px;">`;
  html += `<button onclick="toggleAllImport(true)" style="font-size: 11px; padding: 6px 10px;">✓ Marcar todos</button>`;
  html += `<button onclick="toggleAllImport(false)" style="font-size: 11px; padding: 6px 10px;">○ Desmarcar todos</button>`;
  html += `<button onclick="toggleAllImport('expenses')" style="font-size: 11px; padding: 6px 10px;">💸 Solo gastos</button>`;
  html += `</div>`;

  html += `<div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">`;
  html += `<table style="width: 100%; font-size: 12px; border-collapse: collapse;">`;
  html += `<thead style="position: sticky; top: 0; background: var(--bg-primary); z-index: 1;"><tr style="border-bottom: 1px solid var(--border);">`;
  html += `<th style="padding: 8px 6px; text-align: center;">✓</th>`;
  html += `<th style="padding: 8px 6px; text-align: left;">Fecha</th>`;
  html += `<th style="padding: 8px 6px; text-align: left;">Descripción</th>`;
  html += `<th style="padding: 8px 6px; text-align: right;">Monto</th>`;
  html += `<th style="padding: 8px 6px; text-align: left;">Categoría</th>`;
  html += `</tr></thead><tbody>`;

  movements.forEach((m, i) => {
    const sign = m.isExpense ? '-' : '+';
    const color = m.isExpense ? 'var(--danger-text)' : 'var(--success-text)';
    html += `<tr style="border-bottom: 0.5px solid var(--border);">`;
    html += `<td style="padding: 6px; text-align: center;"><input type="checkbox" id="imp-chk-${i}" ${m.include ? 'checked' : ''} onchange="togglePendingItem(${i}, this.checked)" /></td>`;
    html += `<td style="padding: 6px;">${m.date}</td>`;
    html += `<td style="padding: 6px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.desc}</td>`;
    html += `<td style="padding: 6px; text-align: right; color: ${color};">${sign}${fmtMoney(m.amount)}</td>`;
    html += `<td style="padding: 6px;"><select id="imp-cat-${i}" style="font-size: 11px; padding: 4px;" onchange="updatePendingCategory(${i}, this.value)">`;
    html += getCategoryOptions(m.suggestedCategory);
    html += `</select></td>`;
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  content.innerHTML = html;

  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getCategoryOptions(selected) {
  // Categorías hardcoded (las del dashboard)
  const cats = [
    ['servicios_casa', '🏠 Servicios + casa'],
    ['uber', '🚗 Uber'],
    ['celular', '📞 Celular'],
    ['gimnasio', '💪 Gimnasio'],
    ['streaming', '📺 Streaming'],
    ['comida_fuera', '🍔 Comida fuera'],
    ['rappi', '🛵 Rappi'],
    ['salidas_milena', '💕 Salidas Milena'],
    ['gasolina', '⛽ Gasolina'],
    ['mascota', '🐾 Mascota'],
    ['mascota_extra', '🩺 Mascota extra'],
    ['compras', '🛍️ Compras'],
    ['salud', '🏥 Salud'],
    ['otros', '📋 Otros']
  ];
  return cats.map(([v, l]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`).join('');
}

window.togglePendingItem = function(idx, checked) {
  if (pendingImport[idx]) pendingImport[idx].include = checked;
};
window.updatePendingCategory = function(idx, cat) {
  if (pendingImport[idx]) pendingImport[idx].suggestedCategory = cat;
};
window.toggleAllImport = function(mode) {
  pendingImport.forEach((m, i) => {
    let val = false;
    if (mode === true) val = true;
    else if (mode === false) val = false;
    else if (mode === 'expenses') val = m.isExpense;
    m.include = val;
    const chk = document.getElementById('imp-chk-' + i);
    if (chk) chk.checked = val;
  });
};

window.confirmImport = function() {
  const toImport = pendingImport.filter(m => m.include);
  if (toImport.length === 0) {
    alert('No hay movimientos seleccionados');
    return;
  }
  if (!confirm(`¿Importar ${toImport.length} movimientos al dashboard?`)) return;

  try {
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    const state = JSON.parse(stateRaw);
    if (!state.transactions) state.transactions = {};

    let imported = 0;
    toImport.forEach(m => {
      const monthKey = m.date.substring(0, 7);
      if (!state.transactions[monthKey]) state.transactions[monthKey] = [];
      state.transactions[monthKey].push({
        id: Date.now() + Math.floor(Math.random() * 10000) + imported,
        date: m.date,
        desc: m.desc,
        amount: m.amount,
        category: m.suggestedCategory,
        paymentMethod: 'debito',
        cardId: null,
        pocketId: null,
        cashback: 0
      });
      imported++;
    });

    localStorage.setItem('finance-dashboard-cristian-v20', JSON.stringify(state));
    alert(`✅ ${imported} movimientos importados correctamente.\n\nRefresca la pestaña Presupuesto para verlos.`);

    pendingImport = [];
    document.getElementById('import-preview-card').style.display = 'none';
    document.getElementById('import-status').innerHTML = '';

    // Forzar re-render
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    alert('Error al importar: ' + e.message);
  }
};

window.cancelImport = function() {
  pendingImport = [];
  document.getElementById('import-preview-card').style.display = 'none';
  document.getElementById('import-status').innerHTML = '';
};

// === 2. CALENDARIO FINANCIERO ===
function renderFinancialCalendar() {
  const container = document.getElementById('financial-calendar');
  if (!container) return;

  const state = getStateForNotifications();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = today.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7; // Lunes = 0

  // Eventos del mes
  const events = {};

  // Cortes de tarjetas
  if (state.debts) {
    state.debts.forEach(d => {
      if (d.cutoffDay && d.cutoffDay <= daysInMonth) {
        if (!events[d.cutoffDay]) events[d.cutoffDay] = [];
        events[d.cutoffDay].push({ icon: '💳', label: 'Corte ' + d.name, color: '#A32D2D', type: 'auto' });
      }
    });
  }

  // RECORDATORIOS DEL USUARIO (NUEVO)
  if (state.reminders) {
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    Object.keys(state.reminders).forEach(reminderId => {
      const reminder = state.reminders[reminderId];
      if (!reminder) return;
      
      // Determinar si aplica este mes
      const reminderDate = new Date(reminder.date);
      let day = null;
      
      if (reminder.recurring === 'monthly') {
        // Mensual - usa el día del mes
        day = parseInt(reminder.date.substring(8, 10));
      } else if (reminder.recurring === 'yearly') {
        // Anual - solo si el mes coincide
        if (reminderDate.getMonth() === month) {
          day = reminderDate.getDate();
        }
      } else {
        // Único - solo si la fecha exacta coincide
        if (reminderDate.getFullYear() === year && reminderDate.getMonth() === month) {
          day = reminderDate.getDate();
        }
      }
      
      if (day && day <= daysInMonth) {
        if (!events[day]) events[day] = [];
        events[day].push({ 
          icon: reminder.icon || '📌', 
          label: reminder.title, 
          color: '#7F77DD',
          type: 'reminder',
          reminderId: reminderId,
          amount: reminder.amount
        });
      }
    });
  }

  // Fechas que ya tienen transacciones registradas
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const txs = (state.transactions && state.transactions[monthKey]) || [];
  txs.forEach(t => {
    const day = parseInt(t.date.substring(8, 10));
    if (!events[day]) events[day] = [];
    if (!events[day].some(e => e.label === '📝 Gastos registrados')) {
      events[day].push({ icon: '📝', label: 'Gastos registrados', color: '#854f0b', subtle: true, type: 'auto' });
    }
  });

  let html = `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
    <div style="font-weight: 500; text-transform: capitalize;">${monthName}</div>
    <button onclick="openReminderModal()" style="font-size: 11px; padding: 6px 12px; background: linear-gradient(135deg, var(--accent-from, #7F77DD), var(--accent-to, #1D9E75)); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">+ Recordatorio</button>
  </div>`;
  html += `<div class="calendar-container" style="position: relative; width: 100%; max-width: 100%; overflow: hidden;">`;
  html += `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px;">`;
  ['L','M','X','J','V','S','D'].forEach(d => {
    html += `<div style="text-align: center; font-size: 11px; color: var(--text-tertiary); padding: 4px;">${d}</div>`;
  });
  html += `</div>`;

  html += `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;">`;
  for (let i = 0; i < startWeekday; i++) {
    html += `<div></div>`;
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = (day === today.getDate());
    const dayEvents = events[day] || [];
    const hasMajorEvent = dayEvents.some(e => !e.subtle);
    const hasReminder = dayEvents.some(e => e.type === 'reminder');

    let bg = 'var(--bg-secondary)';
    let border = '1px solid var(--border)';
    if (isToday) {
      bg = 'linear-gradient(135deg, var(--accent-from, #7F77DD)22, var(--accent-to, #1D9E75)22)';
      border = '2px solid var(--info-text)';
    } else if (hasReminder) {
      bg = 'rgba(127, 119, 221, 0.1)';
      border = '1px solid rgba(127, 119, 221, 0.4)';
    } else if (hasMajorEvent) {
      bg = 'var(--info-bg)';
    }

    // Cada día es clickeable
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    html += `<div onclick="openReminderModal('${dateStr}')" style="position: relative; aspect-ratio: 1; padding: 4px; background: ${bg}; border: ${border}; border-radius: 8px; display: flex; flex-direction: column; align-items: flex-start; min-width: 0; overflow: hidden; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;" onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 2px 8px rgba(127,119,221,0.2)'; this.style.zIndex='5';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'; this.style.zIndex='1';">`;
    html += `<div style="font-size: 11px; font-weight: ${isToday ? '600' : '400'}; color: ${isToday ? 'var(--info-text)' : 'var(--text-secondary)'};">${day}</div>`;
    if (dayEvents.length > 0) {
      html += `<div style="display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px; min-width: 0;">`;
      dayEvents.slice(0, 3).forEach(e => {
        html += `<span title="${e.label}" style="font-size: 10px; opacity: ${e.subtle ? '0.6' : '1'};">${e.icon}</span>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  html += `</div>`; // cierre calendar-container

  // Listado de eventos del mes (CLARAMENTE SEPARADO)
  html += `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">`;
  html += `<p style="font-size: 13px; font-weight: 500; margin: 0 0 10px;">📋 Eventos importantes del mes</p>`;
  const sortedDays = Object.keys(events).map(Number).sort((a, b) => a - b);
  sortedDays.forEach(d => {
    events[d].filter(e => !e.subtle).forEach(e => {
      const dayDiff = d - today.getDate();
      let dayLabel = '';
      if (dayDiff === 0) dayLabel = '<strong style="color: var(--info-text);">HOY</strong>';
      else if (dayDiff === 1) dayLabel = '<strong>MAÑANA</strong>';
      else if (dayDiff > 0) dayLabel = `en ${dayDiff} días`;
      else dayLabel = `hace ${Math.abs(dayDiff)} días`;

      html += `<div style="padding: 8px 10px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">`;
      html += `<span>${e.icon} ${e.label} - <strong>Día ${d}</strong></span>`;
      html += `<span style="font-size: 11px; color: var(--text-tertiary);">${dayLabel}</span>`;
      html += `</div>`;
    });
  });
  html += `</div>`;

  container.innerHTML = html;
}

// ============================================================
// RECORDATORIOS DEL CALENDARIO
// ============================================================

window.openReminderModal = function(dateStr) {
  // Si no se pasa fecha, usar hoy
  if (!dateStr) {
    const today = new Date();
    dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  // Limpiar modal previo
  const existing = document.getElementById('reminder-modal');
  if (existing) existing.remove();

  // Buscar recordatorios existentes en esta fecha
  const fullState = getStateForNotifications();
  const existingReminders = [];
  if (fullState.reminders) {
    Object.keys(fullState.reminders).forEach(id => {
      const r = fullState.reminders[id];
      if (!r) return;
      
      const rDate = new Date(r.date);
      const targetDate = new Date(dateStr);
      
      let matches = false;
      if (r.recurring === 'monthly') {
        matches = (rDate.getDate() === targetDate.getDate());
      } else if (r.recurring === 'yearly') {
        matches = (rDate.getMonth() === targetDate.getMonth() && rDate.getDate() === targetDate.getDate());
      } else {
        matches = (r.date === dateStr);
      }
      
      if (matches) {
        existingReminders.push({ id, ...r });
      }
    });
  }

  // Formatear fecha bonita
  const dateObj = new Date(dateStr);
  const niceDate = dateObj.toLocaleDateString('es-CO', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  // HTML del modal - parte recordatorios existentes
  let existingListHtml = '';
  if (existingReminders.length > 0) {
    existingListHtml = `
      <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid var(--accent-from, #7F77DD);">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">📋 RECORDATORIOS EN ESTA FECHA</div>
        ${existingReminders.map(r => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: var(--bg-primary); border-radius: 8px; margin-bottom: 6px;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 500; color: var(--text-primary);">${r.icon || '📌'} ${r.title}</div>
              ${r.amount ? `<div style="font-size: 11px; color: var(--success-text);">$${r.amount.toLocaleString('es-CO')}</div>` : ''}
              ${r.notes ? `<div style="font-size: 11px; color: var(--text-tertiary); margin-top: 2px;">${r.notes}</div>` : ''}
              <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 2px;">
                ${r.recurring === 'monthly' ? '🔁 Cada mes' : r.recurring === 'yearly' ? '🔁 Cada año' : '📅 Único'}
              </div>
            </div>
            <button onclick="deleteReminder('${r.id}')" style="background: var(--danger-bg); color: var(--danger-text); border: none; width: 28px; height: 28px; border-radius: 50%; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Eliminar">×</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  const overlay = document.createElement('div');
  overlay.id = 'reminder-modal';
  overlay.className = 'tutorial-overlay';

  overlay.innerHTML = `
    <div class="tutorial-card" style="max-width: 460px;">
      <div class="tutorial-header" style="padding: 20px;">
        <button class="tutorial-skip" onclick="closeReminderModal()">Cerrar ×</button>
        <span class="tutorial-icon-big" style="font-size: 36px;">📅</span>
        <h2 class="tutorial-title" style="font-size: 18px;">Recordatorio</h2>
        <p class="tutorial-subtitle" style="text-transform: capitalize;">${niceDate}</p>
      </div>

      <div class="tutorial-body" style="padding: 16px 20px;">
        ${existingListHtml}
        
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px;">➕ AGREGAR NUEVO RECORDATORIO</div>
        
        <div style="display: grid; gap: 10px;">
          <div>
            <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">¿Qué recordar?</label>
            <input type="text" id="reminder-title" placeholder="Ej: Pago de luz, Renta del apartamento" style="width: 100%; padding: 10px 12px; height: 42px;" />
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Icono</label>
              <select id="reminder-icon" style="width: 100%;">
                <option value="📌">📌 General</option>
                <option value="💡">💡 Servicios públicos</option>
                <option value="🏠">🏠 Arriendo / Hipoteca</option>
                <option value="📱">📱 Plan celular</option>
                <option value="📺">📺 Streaming</option>
                <option value="💳">💳 Pago de tarjeta</option>
                <option value="💰">💰 Salario / Ingreso</option>
                <option value="🚗">🚗 Pago vehículo</option>
                <option value="🎓">🎓 Universidad</option>
                <option value="🏥">🏥 Salud / Medicina</option>
                <option value="📊">📊 Impuestos</option>
                <option value="🎯">🎯 Meta personal</option>
                <option value="🎂">🎂 Cumpleaños</option>
                <option value="✈️">✈️ Viaje</option>
                <option value="📚">📚 Suscripción</option>
                <option value="⚠️">⚠️ Importante</option>
              </select>
            </div>
            <div>
              <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Monto (opcional)</label>
              <input type="number" id="reminder-amount" placeholder="0" min="0" step="1000" style="width: 100%; padding: 10px 12px; height: 42px;" />
            </div>
          </div>
          
          <div>
            <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Frecuencia</label>
            <select id="reminder-recurring" style="width: 100%;">
              <option value="monthly">🔁 Cada mes (recurrente)</option>
              <option value="yearly">🔁 Cada año</option>
              <option value="once">📅 Solo esta fecha</option>
            </select>
          </div>
          
          <div>
            <label style="font-size: 12px; color: var(--text-secondary); display: block; margin-bottom: 4px;">Notas (opcional)</label>
            <textarea id="reminder-notes" placeholder="Detalles adicionales..." rows="2" style="width: 100%; padding: 10px 12px; resize: vertical; font-family: inherit; min-height: 60px;"></textarea>
          </div>
          
          <input type="hidden" id="reminder-date" value="${dateStr}" />
        </div>
      </div>

      <div class="tutorial-footer" style="padding: 12px 20px 20px;">
        <button class="tutorial-btn tutorial-btn-secondary" onclick="closeReminderModal()">Cancelar</button>
        <button class="tutorial-btn tutorial-btn-primary" onclick="saveReminder()">💾 Guardar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  if (typeof lockBody === 'function') lockBody();
  
  // Focus en el input
  setTimeout(() => {
    const titleInput = document.getElementById('reminder-title');
    if (titleInput) titleInput.focus();
  }, 200);
};

window.closeReminderModal = function() {
  const modal = document.getElementById('reminder-modal');
  if (modal) {
    modal.remove();
    if (typeof unlockBody === 'function') unlockBody();
  }
};

window.saveReminder = function() {
  const title = document.getElementById('reminder-title').value.trim();
  const icon = document.getElementById('reminder-icon').value;
  const amount = parseFloat(document.getElementById('reminder-amount').value) || 0;
  const recurring = document.getElementById('reminder-recurring').value;
  const notes = document.getElementById('reminder-notes').value.trim();
  const date = document.getElementById('reminder-date').value;

  if (!title) {
    if (typeof toastError === 'function') {
      toastError('Falta título', 'Escribe qué quieres recordar');
    } else {
      alert('Escribe qué quieres recordar');
    }
    return;
  }

  // Cargar state actual
  try {
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    if (!stateRaw) return;
    const state = JSON.parse(stateRaw);
    
    if (!state.reminders) state.reminders = {};
    
    const id = 'rem_' + Date.now();
    state.reminders[id] = {
      id, title, icon, amount, recurring, notes, date,
      createdAt: new Date().toISOString()
    };
    
    localStorage.setItem('finance-dashboard-cristian-v20', JSON.stringify(state));
    
    // Sincronizar con la nube
    if (typeof saveToCloud === 'function' && window.currentUser) {
      saveToCloud(state);
    }
    
    // Cerrar modal y refrescar calendario
    closeReminderModal();
    
    if (typeof renderFinancialCalendar === 'function') {
      renderFinancialCalendar();
    }
    
    if (typeof toastSuccess === 'function') {
      toastSuccess('Recordatorio guardado', `"${title}" agregado al calendario`);
    }
  } catch(e) {
    console.error('Error guardando recordatorio:', e);
    if (typeof toastError === 'function') {
      toastError('Error', 'No se pudo guardar el recordatorio');
    }
  }
};

window.deleteReminder = async function(reminderId) {
  let confirmed = false;
  if (typeof showConfirm === 'function') {
    confirmed = await showConfirm({
      title: '¿Eliminar recordatorio?',
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      type: 'danger',
      icon: '🗑️'
    });
  } else {
    confirmed = confirm('¿Eliminar este recordatorio?');
  }
  
  if (!confirmed) return;

  try {
    const stateRaw = localStorage.getItem('finance-dashboard-cristian-v20');
    if (!stateRaw) return;
    const state = JSON.parse(stateRaw);
    
    if (state.reminders && state.reminders[reminderId]) {
      delete state.reminders[reminderId];
      localStorage.setItem('finance-dashboard-cristian-v20', JSON.stringify(state));
      
      // Sincronizar con la nube
      if (typeof saveToCloud === 'function' && window.currentUser) {
        saveToCloud(state);
      }
      
      // Cerrar modal y refrescar
      closeReminderModal();
      
      if (typeof renderFinancialCalendar === 'function') {
        renderFinancialCalendar();
      }
      
      if (typeof toastSuccess === 'function') {
        toastSuccess('Eliminado', 'Recordatorio eliminado');
      }
    }
  } catch(e) {
    console.error('Error eliminando recordatorio:', e);
  }
};

// === 3. COMPARATIVA MENSUAL ===
function renderMonthComparison() {
  const container = document.getElementById('month-comparison-content');
  if (!container) return;

  const state = getStateForNotifications();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const currentTx = (state.transactions && state.transactions[currentMonth]) || [];
  const prevTx = (state.transactions && state.transactions[prevMonth]) || [];

  if (currentTx.length === 0 && prevTx.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 13px;">Aún no tienes datos suficientes para comparar. Registra movimientos para ver la comparativa.</div>';
    return;
  }

  // Agrupar por categoría
  const byCategory = (txs) => {
    const map = {};
    txs.forEach(t => {
      map[t.category] = (map[t.category] || 0) + (t.amount || 0);
    });
    return map;
  };

  const currentByCat = byCategory(currentTx);
  const prevByCat = byCategory(prevTx);
  const currentTotal = currentTx.reduce((s, t) => s + t.amount, 0);
  const prevTotal = prevTx.reduce((s, t) => s + t.amount, 0);

  const allCats = new Set([...Object.keys(currentByCat), ...Object.keys(prevByCat)]);

  const catLabels = {
    servicios_casa: '🏠 Servicios + casa',
    uber: '🚗 Uber',
    celular: '📞 Celular',
    gimnasio: '💪 Gimnasio',
    streaming: '📺 Streaming',
    comida_fuera: '🍔 Comida fuera',
    rappi: '🛵 Rappi',
    salidas_milena: '💕 Salidas',
    gasolina: '⛽ Gasolina',
    mascota: '🐾 Mascota',
    mascota_extra: '🩺 Mascota extra',
    compras: '🛍️ Compras',
    salud: '🏥 Salud',
    otros: '📋 Otros'
  };

  let html = '';

  // Resumen total
  const totalDiff = currentTotal - prevTotal;
  const totalPct = prevTotal > 0 ? ((totalDiff / prevTotal) * 100) : 0;
  const totalColor = totalDiff > 0 ? 'var(--danger-text)' : 'var(--success-text)';
  const totalArrow = totalDiff > 0 ? '↑' : (totalDiff < 0 ? '↓' : '→');
  const totalSign = totalDiff > 0 ? '+' : '';

  html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">`;
  html += `<div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px;">`;
  html += `<div style="font-size: 11px; color: var(--text-secondary);">Mes anterior</div>`;
  html += `<div style="font-size: 18px; font-weight: 600;">${fmtMoney(prevTotal)}</div>`;
  html += `</div>`;
  html += `<div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; border-left: 3px solid ${totalColor};">`;
  html += `<div style="font-size: 11px; color: var(--text-secondary);">Este mes</div>`;
  html += `<div style="font-size: 18px; font-weight: 600;">${fmtMoney(currentTotal)}</div>`;
  if (prevTotal > 0) {
    html += `<div style="font-size: 11px; color: ${totalColor};">${totalArrow} ${totalSign}${totalPct.toFixed(0)}% vs anterior</div>`;
  }
  html += `</div></div>`;

  // Por categoría
  html += `<p style="font-size: 13px; font-weight: 500; margin: 0 0 8px;">📋 Por categoría</p>`;
  const sortedCats = Array.from(allCats).sort((a, b) => (currentByCat[b] || 0) - (currentByCat[a] || 0));
  sortedCats.forEach(cat => {
    const curr = currentByCat[cat] || 0;
    const prev = prevByCat[cat] || 0;
    const diff = curr - prev;
    const pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);

    let trendIcon = '→', trendColor = 'var(--text-secondary)';
    if (Math.abs(pct) > 10) {
      if (diff > 0) { trendIcon = '↑'; trendColor = 'var(--danger-text)'; }
      else { trendIcon = '↓'; trendColor = 'var(--success-text)'; }
    }

    html += `<div style="padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 4px;">`;
    html += `<div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">`;
    html += `<span>${catLabels[cat] || cat}</span>`;
    html += `<span style="color: ${trendColor};">${trendIcon} ${prev > 0 ? (diff > 0 ? '+' : '') + pct.toFixed(0) + '%' : 'nuevo'}</span>`;
    html += `</div>`;
    html += `<div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-tertiary); margin-top: 2px;">`;
    html += `<span>Antes: ${fmtMoney(prev)}</span>`;
    html += `<span>Ahora: ${fmtMoney(curr)}</span>`;
    html += `</div>`;
    html += `</div>`;
  });

  container.innerHTML = html;
}

// === 4. GASTOS HORMIGA ===
function renderAntExpenses() {
  const container = document.getElementById('ant-expenses-content');
  if (!container) return;

  const state = getStateForNotifications();
  const allTx = [];
  if (state.transactions) {
    Object.values(state.transactions).forEach(arr => {
      if (Array.isArray(arr)) allTx.push(...arr);
    });
  }

  if (allTx.length < 5) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 13px;">Necesitas registrar más transacciones para detectar patrones.</div>';
    return;
  }

  // Agrupar por palabra clave de descripción + categoría
  const groups = {};
  allTx.forEach(t => {
    if (!t.desc || t.amount > 50000) return; // solo gastos pequeños
    // Tomar las primeras 2 palabras como key
    const key = t.desc.toLowerCase().split(/\s+/).slice(0, 2).join(' ').substring(0, 30);
    if (!groups[key]) groups[key] = { count: 0, total: 0, items: [], category: t.category };
    groups[key].count++;
    groups[key].total += t.amount;
    groups[key].items.push(t);
  });

  // Filtrar solo los que se repiten 2+ veces
  const ants = Object.entries(groups)
    .filter(([k, g]) => g.count >= 2)
    .map(([k, g]) => ({ key: k, ...g, avg: g.total / g.count, projectedYear: (g.total / g.count) * 12 * (g.count > 5 ? 4 : 2) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (ants.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 13px;">✅ No detectamos patrones de gastos hormiga problemáticos.</div>';
    return;
  }

  let html = `<div style="margin-bottom: 12px; padding: 10px 12px; background: var(--warning-bg); color: var(--warning-text); border-radius: 8px; font-size: 12px;">`;
  html += `🐜 <strong>Gastos pequeños frecuentes</strong> que pueden sumar mucho al año.`;
  html += `</div>`;

  ants.forEach(a => {
    html += `<div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; margin-bottom: 6px;">`;
    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">`;
    html += `<strong style="font-size: 13px; text-transform: capitalize;">${a.key}</strong>`;
    html += `<span style="font-size: 11px; color: var(--warning-text);">${a.count}x registrado</span>`;
    html += `</div>`;
    html += `<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-size: 11px;">`;
    html += `<div><span style="color: var(--text-tertiary);">Total:</span> <strong>${fmtMoney(a.total)}</strong></div>`;
    html += `<div><span style="color: var(--text-tertiary);">Promedio:</span> ${fmtMoney(a.avg)}</div>`;
    html += `<div><span style="color: var(--text-tertiary);">Año:</span> <span style="color: var(--danger-text);">${fmtMoney(a.projectedYear)}</span></div>`;
    html += `</div>`;
    html += `</div>`;
  });

  container.innerHTML = html;
}

// === 5. TENDENCIAS ===
function renderTrends() {
  const container = document.getElementById('trends-content');
  if (!container) return;

  const state = getStateForNotifications();
  if (!state.transactions) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 13px;">Sin datos.</div>';
    return;
  }

  const months = Object.keys(state.transactions).sort().slice(-6);
  if (months.length < 2) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 13px;">Necesitas al menos 2 meses de datos.</div>';
    return;
  }

  const totals = months.map(m => {
    const txs = state.transactions[m] || [];
    return { month: m, total: txs.reduce((s, t) => s + (t.amount || 0), 0), count: txs.length };
  });

  const max = Math.max(...totals.map(t => t.total));

  let html = `<div style="display: flex; align-items: flex-end; gap: 8px; height: 150px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">`;
  totals.forEach(t => {
    const h = max > 0 ? (t.total / max) * 100 : 0;
    const monthShort = new Date(t.month + '-01').toLocaleDateString('es-CO', { month: 'short' });
    html += `<div style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end;">`;
    html += `<div style="font-size: 10px; color: var(--text-tertiary); margin-bottom: 4px;">${fmtMoney(t.total)}</div>`;
    html += `<div style="width: 100%; background: linear-gradient(180deg, #7F77DD, #1D9E75); height: ${h}%; min-height: 4px; border-radius: 6px 6px 0 0;"></div>`;
    html += `<div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; text-transform: capitalize;">${monthShort}</div>`;
    html += `</div>`;
  });
  html += `</div>`;

  // Resumen
  const avg = totals.reduce((s, t) => s + t.total, 0) / totals.length;
  html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">`;
  html += `<div style="padding: 8px; background: var(--bg-secondary); border-radius: 8px;">`;
  html += `<div style="color: var(--text-secondary); font-size: 11px;">Promedio mensual</div>`;
  html += `<div style="font-weight: 500;">${fmtMoney(avg)}</div></div>`;
  html += `<div style="padding: 8px; background: var(--bg-secondary); border-radius: 8px;">`;
  html += `<div style="color: var(--text-secondary); font-size: 11px;">Meses analizados</div>`;
  html += `<div style="font-weight: 500;">${totals.length}</div></div>`;
  html += `</div>`;

  container.innerHTML = html;
}

// Activar funciones cuando se entre a la pestaña Análisis
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-tab="analisis"]');
  if (target) {
    setTimeout(() => {
      renderFinancialCalendar();
      renderMonthComparison();
      renderAntExpenses();
      renderTrends();
      populateMonthSelector();
    }, 100);
  }
});

// Setup inicial
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(setupBankImport, 1500);
  setTimeout(populateMonthSelector, 2000);
});

// ============================================================
// REPORTES PDF MENSUALES
// ============================================================

function populateMonthSelector() {
  const select = document.getElementById('pdf-month-select');
  if (!select || select.options.length > 0) return;

  const state = getStateForNotifications();
  const months = new Set();

  if (state.transactions) {
    Object.keys(state.transactions).forEach(m => months.add(m));
  }
  if (state.budgets) {
    Object.keys(state.budgets).forEach(m => months.add(m));
  }

  // Agregar el mes actual y anterior si no están
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  months.add(currentMonth);
  months.add(prevMonth);

  const sortedMonths = Array.from(months).sort().reverse();
  select.innerHTML = sortedMonths.map(m => {
    const [y, mo] = m.split('-');
    const date = new Date(parseInt(y), parseInt(mo) - 1, 1);
    const label = date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    const labelCap = label.charAt(0).toUpperCase() + label.slice(1);
    return `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${labelCap}</option>`;
  }).join('');
}

window.generateMonthlyPDF = async function() {
  const select = document.getElementById('pdf-month-select');
  if (!select || !select.value) {
    alert('Selecciona un mes primero');
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('La librería de PDF no se ha cargado. Refresca la página.');
    return;
  }

  const monthKey = select.value;
  const state = getStateForNotifications();

  try {
    await buildMonthlyPDF(state, monthKey);
  } catch (e) {
    console.error('Error generando PDF:', e);
    alert('Error al generar PDF: ' + e.message);
  }
};

window.generateAnnualPDF = async function() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('La librería de PDF no se ha cargado. Refresca la página.');
    return;
  }

  const state = getStateForNotifications();
  const today = new Date();
  const year = today.getFullYear();

  try {
    await buildAnnualPDF(state, year);
  } catch (e) {
    console.error('Error generando PDF:', e);
    alert('Error al generar PDF: ' + e.message);
  }
};

async function buildMonthlyPDF(state, monthKey) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const [year, monthNum] = monthKey.split('-');
  const monthDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
  const monthName = monthDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Colores
  const primaryColor = [127, 119, 221]; // Morado
  const successColor = [29, 158, 117]; // Verde
  const dangerColor = [163, 45, 45];
  const textPrimary = [44, 44, 42];
  const textSecondary = [107, 107, 102];

  let y = 0;

  // ===== HEADER (banda superior) =====
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Reporte Financiero', 14, 16);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(monthNameCap, 14, 24);

  doc.setFontSize(9);
  doc.text('Generado el ' + new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }), 14, 30);

  // Logo/diamante en esquina derecha
  doc.setFontSize(20);
  doc.text('💎', 195, 22);

  y = 45;

  // ===== RESUMEN EJECUTIVO =====
  doc.setTextColor(...textPrimary);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen ejecutivo', 14, y);
  y += 8;

  // Calcular métricas
  const pockets = state.pockets || [];
  const debts = state.debts || [];
  const transactions = (state.transactions && state.transactions[monthKey]) || [];
  const extraIncomes = (state.extraIncomes && state.extraIncomes[monthKey]) || [];

  const totalPockets = pockets.reduce((s, p) => s + (p.amount || 0), 0);
  const totalDebts = debts.reduce((s, d) => s + (d.balance || 0), 0);
  const netWorth = totalPockets - totalDebts;
  const totalExpenses = transactions.reduce((s, t) => s + (t.amount || 0), 0);
  const totalCashback = transactions.reduce((s, t) => s + (t.cashback || 0), 0);
  const recurrentIncome = (state.incomes || []).reduce((s, i) => s + (i.amount || 0), 0);
  const totalExtras = extraIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalIncome = recurrentIncome + totalExtras;
  const margin = totalIncome - totalExpenses + totalCashback;

  // Tarjetas de métricas en grid 2x3
  const cards = [
    { label: 'Patrimonio total', value: fmt(netWorth), color: primaryColor, sub: `${fmt(totalPockets)} - ${fmt(totalDebts)} deudas` },
    { label: 'Ingresos del mes', value: fmt(totalIncome), color: successColor, sub: `Salario + extras` },
    { label: 'Gastos del mes', value: fmt(totalExpenses), color: dangerColor, sub: `${transactions.length} transacciones` },
    { label: 'Ahorro/Margen', value: fmt(margin), color: margin > 0 ? successColor : dangerColor, sub: totalIncome > 0 ? `${((margin/totalIncome)*100).toFixed(1)}% tasa ahorro` : '' },
    { label: 'Cashback ganado', value: fmt(totalCashback), color: successColor, sub: `+${transactions.filter(t => t.cashback > 0).length} compras` },
    { label: 'Score crediticio', value: state.creditScore?.lastReported || 'N/A', color: primaryColor, sub: state.creditScore?.lastReportedDate || 'Sin reporte' }
  ];

  cards.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 14 + col * 92;
    const cardY = y + row * 22;

    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, cardY, 88, 20, 2, 2, 'FD');

    doc.setFillColor(...c.color);
    doc.rect(x, cardY, 2, 20, 'F');

    doc.setTextColor(...textSecondary);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(c.label, x + 5, cardY + 5);

    doc.setTextColor(...c.color);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(String(c.value), x + 5, cardY + 12);

    if (c.sub) {
      doc.setTextColor(...textSecondary);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(c.sub, x + 5, cardY + 17);
    }
  });
  y += 70;

  // ===== BOLSILLOS =====
  if (y > 240) { doc.addPage(); y = 20; }
  doc.setTextColor(...textPrimary);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Distribución de bolsillos', 14, y);
  y += 4;

  const bolsillosBody = pockets
    .filter(p => p.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map(p => [
      removeEmojis(p.icon + ' ' + p.name),
      fmt(p.amount),
      ((p.amount / totalPockets) * 100).toFixed(1) + '%'
    ]);

  if (bolsillosBody.length > 0) {
    doc.autoTable({
      startY: y + 2,
      head: [['Bolsillo', 'Saldo', '% Total']],
      body: bolsillosBody,
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ===== TARJETAS =====
  if (debts.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(...textPrimary);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Tarjetas de crédito', 14, y);
    y += 4;

    const cardsBody = debts.map(d => {
      const util = d.payment > 0 ? ((d.balance / d.payment) * 100).toFixed(1) + '%' : 'N/A';
      const utilColor = util === 'N/A' ? '' : (parseFloat(util) > 30 ? '⚠️' : '✓');
      return [
        d.name,
        fmt(d.balance),
        fmt(d.payment),
        util,
        d.cutoffDay ? 'Día ' + d.cutoffDay : '-'
      ];
    });

    doc.autoTable({
      startY: y + 2,
      head: [['Tarjeta', 'Saldo actual', 'Cupo total', 'Utilización', 'Corte']],
      body: cardsBody,
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ===== GASTOS POR CATEGORÍA =====
  if (transactions.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setTextColor(...textPrimary);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Gastos por categoría', 14, y);
    y += 4;

    const catLabels = {
      servicios_casa: 'Servicios + casa', uber: 'Uber', celular: 'Celular',
      gimnasio: 'Gimnasio', streaming: 'Streaming', comida_fuera: 'Comida fuera',
      rappi: 'Rappi', salidas_milena: 'Salidas', gasolina: 'Gasolina',
      mascota: 'Mascota', mascota_extra: 'Mascota extra', compras: 'Compras',
      salud: 'Salud', otros: 'Otros'
    };

    const byCategory = {};
    transactions.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + (t.amount || 0);
    });

    const catBody = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => [
        catLabels[cat] || cat,
        fmt(amount),
        totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(1) + '%' : '0%'
      ]);

    doc.autoTable({
      startY: y + 2,
      head: [['Categoría', 'Total', '% Gastos']],
      body: catBody,
      headStyles: { fillColor: dangerColor, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ===== TRANSACCIONES =====
  if (transactions.length > 0) {
    if (y > 200) { doc.addPage(); y = 20; }
    doc.setTextColor(...textPrimary);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Transacciones del mes', 14, y);
    y += 4;

    const PAYMENT_METHODS = {
      tarjeta: 'Tarjeta', pse: 'PSE', llave: 'Llave/Bre-B',
      efectivo: 'Efectivo', debito: 'Débito'
    };

    const txBody = transactions
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(t => [
        t.date.substring(5),
        removeEmojis(t.desc).substring(0, 30),
        catLabelOf(t.category),
        PAYMENT_METHODS[t.paymentMethod] || '-',
        fmt(t.amount),
        t.cashback > 0 ? '+' + fmt(t.cashback) : '-'
      ]);

    doc.autoTable({
      startY: y + 2,
      head: [['Fecha', 'Descripción', 'Categoría', 'Método', 'Monto', 'Cashback']],
      body: txBody,
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ===== INGRESOS EXTRAS =====
  if (extraIncomes.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(...textPrimary);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Ingresos extras', 14, y);

    const extrasBody = extraIncomes.map(i => [
      i.date.substring(5),
      removeEmojis(i.desc).substring(0, 35),
      i.source || '-',
      fmt(i.amount)
    ]);

    doc.autoTable({
      startY: y + 4,
      head: [['Fecha', 'Descripción', 'Origen', 'Monto']],
      body: extrasBody,
      headStyles: { fillColor: successColor, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
      columnStyles: { 3: { halign: 'right' } }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ===== RECOMENDACIONES =====
  if (y > 230) { doc.addPage(); y = 20; }
  doc.setTextColor(...textPrimary);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Recomendaciones', 14, y);
  y += 8;

  const recs = generateRecommendations(state, monthKey, {
    totalExpenses, totalIncome, margin, totalCashback, transactions, debts
  });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  recs.forEach(r => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.setTextColor(...primaryColor);
    doc.setFont('helvetica', 'bold');
    doc.text(r.icon + ' ' + r.title, 14, y);
    y += 5;
    doc.setTextColor(...textPrimary);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(r.text, 180);
    lines.forEach(line => {
      if (y > 285) { doc.addPage(); y = 20; }
      doc.text(line, 14, y);
      y += 5;
    });
    y += 3;
  });

  // ===== FOOTER en cada página =====
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...textSecondary);
    doc.text('FinanzasPro - Reporte ' + monthNameCap, 14, 290);
    doc.text('Página ' + p + ' de ' + totalPages, 195, 290, { align: 'right' });
  }

  // Descargar
  doc.save(`Reporte_Financiero_${monthKey}.pdf`);
}

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '$ 0';
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

function removeEmojis(str) {
  if (!str) return '';
  // Eliminar emojis comunes para evitar problemas de encoding en jsPDF
  return str.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
}

function catLabelOf(catId) {
  const labels = {
    servicios_casa: 'Servicios', uber: 'Uber', celular: 'Celular',
    gimnasio: 'Gym', streaming: 'Streaming', comida_fuera: 'Comida',
    rappi: 'Rappi', salidas_milena: 'Salidas', gasolina: 'Gasolina',
    mascota: 'Mascota', mascota_extra: 'Mascota+', compras: 'Compras',
    salud: 'Salud', otros: 'Otros'
  };
  return labels[catId] || catId;
}

function generateRecommendations(state, monthKey, metrics) {
  const recs = [];
  const { totalExpenses, totalIncome, margin, totalCashback, transactions, debts } = metrics;

  // Tasa de ahorro
  const savingRate = totalIncome > 0 ? (margin / totalIncome) * 100 : 0;
  if (savingRate >= 30) {
    recs.push({
      icon: '*',
      title: 'Excelente tasa de ahorro',
      text: `Lograste ahorrar el ${savingRate.toFixed(1)}% de tus ingresos este mes. Estás muy por encima del promedio recomendado del 20%. Sigue así.`
    });
  } else if (savingRate >= 15) {
    recs.push({
      icon: '+',
      title: 'Buena tasa de ahorro',
      text: `Ahorraste ${savingRate.toFixed(1)}% este mes. Estás bien encaminado. La meta es llegar al 30%+ para acelerar el crecimiento de tu patrimonio.`
    });
  } else if (savingRate > 0) {
    recs.push({
      icon: '!',
      title: 'Tasa de ahorro baja',
      text: `Solo ahorraste ${savingRate.toFixed(1)}% este mes. Revisa tus gastos en las categorías más altas y busca oportunidades para reducir.`
    });
  } else {
    recs.push({
      icon: '!',
      title: 'Gastos mayores a ingresos',
      text: `Este mes gastaste más de lo que ingresaste. Revisa urgentemente tu presupuesto.`
    });
  }

  // Cashback
  if (totalCashback > 0) {
    const lostCashback = transactions
      .filter(t => t.paymentMethod === 'llave' || t.paymentMethod === 'pse' || t.paymentMethod === 'efectivo')
      .reduce((s, t) => s + (t.amount * 0.01), 0);

    if (lostCashback > totalCashback * 0.5) {
      recs.push({
        icon: '$',
        title: 'Optimización de cashback',
        text: `Ganaste ${fmt(totalCashback)} en cashback este mes. Sin embargo, perdiste aproximadamente ${fmt(lostCashback)} pagando por Llave/PSE/efectivo. Si pagaras todo eso con tarjeta de crédito, ganarías ${fmt(totalCashback + lostCashback)} mensuales.`
      });
    } else {
      recs.push({
        icon: '$',
        title: 'Buen aprovechamiento de cashback',
        text: `Ganaste ${fmt(totalCashback)} en cashback. Proyección anual: ${fmt(totalCashback * 12)}. Sigue usando la tarjeta para gastos optimizables.`
      });
    }
  }

  // Utilización de tarjetas
  if (debts.length > 0) {
    const totalLimit = debts.reduce((s, d) => s + (d.payment || 0), 0);
    const totalBalance = debts.reduce((s, d) => s + (d.balance || 0), 0);
    const util = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;

    if (util < 10) {
      recs.push({
        icon: '+',
        title: 'Utilización óptima de tarjetas',
        text: `Tu utilización es ${util.toFixed(1)}% (debajo del 10% ideal). Esto suma puntos a tu score crediticio. Mantén este nivel.`
      });
    } else if (util < 30) {
      recs.push({
        icon: '~',
        title: 'Utilización aceptable',
        text: `Tu utilización es ${util.toFixed(1)}%. Para subir tu score, intenta bajar al 10% o menos antes del corte.`
      });
    } else {
      recs.push({
        icon: '!',
        title: 'Utilización alta',
        text: `Tu utilización es ${util.toFixed(1)}%, que penaliza tu score crediticio. Paga antes del corte para bajarla al 10% o menos.`
      });
    }
  }

  // Score crediticio
  if (state.creditScore && state.creditScore.lastReported) {
    const score = state.creditScore.lastReported;
    if (score >= 750) {
      recs.push({
        icon: '*',
        title: 'Score crediticio "Muy Bueno"',
        text: `Score de ${score}. Estás en una excelente categoría. Para llegar a Excelente (850+), considera diversificar con un crédito hipotecario o vehicular cuando sea oportuno.`
      });
    } else if (score >= 670) {
      recs.push({
        icon: '+',
        title: 'Score crediticio "Bueno"',
        text: `Score de ${score}. Para subir a Muy Bueno (751+), considera abrir un CDT pequeño ($1-2M), no abrir nuevas tarjetas en 6-12 meses, y mantener utilización debajo del 10%.`
      });
    } else {
      recs.push({
        icon: '~',
        title: 'Score crediticio en construcción',
        text: `Score de ${score}. Enfócate en pagar a tiempo, mantener utilización baja, y no cerrar cuentas viejas.`
      });
    }
  }

  return recs;
}

async function buildAnnualPDF(state, year) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const primaryColor = [127, 119, 221];
  const successColor = [29, 158, 117];
  const dangerColor = [163, 45, 45];
  const textPrimary = [44, 44, 42];
  const textSecondary = [107, 107, 102];

  // ===== HEADER =====
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Reporte Anual', 14, 16);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(String(year), 14, 24);
  doc.setFontSize(9);
  doc.text('Generado el ' + new Date().toLocaleDateString('es-CO'), 14, 30);
  doc.setFontSize(20);
  doc.text('💎', 195, 22);

  let y = 45;

  // Filtrar transacciones del año
  const monthsOfYear = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    if (state.transactions && state.transactions[key]) {
      monthsOfYear.push({ key, txs: state.transactions[key], extras: (state.extraIncomes && state.extraIncomes[key]) || [] });
    }
  }

  if (monthsOfYear.length === 0) {
    doc.setTextColor(...textPrimary);
    doc.setFontSize(12);
    doc.text('Aún no hay transacciones registradas en ' + year, 14, y);
    doc.save(`Reporte_Anual_${year}.pdf`);
    return;
  }

  // Resumen anual
  let totalAnnualExpense = 0;
  let totalAnnualCashback = 0;
  let totalAnnualExtras = 0;
  monthsOfYear.forEach(m => {
    m.txs.forEach(t => {
      totalAnnualExpense += t.amount || 0;
      totalAnnualCashback += t.cashback || 0;
    });
    m.extras.forEach(e => totalAnnualExtras += e.amount || 0);
  });

  const recurrentMonthly = (state.incomes || []).reduce((s, i) => s + (i.amount || 0), 0);
  const totalAnnualIncome = recurrentMonthly * monthsOfYear.length + totalAnnualExtras + totalAnnualCashback;

  doc.setTextColor(...textPrimary);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen anual', 14, y);
  y += 8;

  const annualCards = [
    { label: 'Ingresos del año', value: fmt(totalAnnualIncome), color: successColor },
    { label: 'Gastos del año', value: fmt(totalAnnualExpense), color: dangerColor },
    { label: 'Ahorro del año', value: fmt(totalAnnualIncome - totalAnnualExpense), color: primaryColor },
    { label: 'Cashback ganado', value: fmt(totalAnnualCashback), color: successColor }
  ];

  annualCards.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 14 + col * 92;
    const cardY = y + row * 22;

    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, cardY, 88, 20, 2, 2, 'FD');
    doc.setFillColor(...c.color);
    doc.rect(x, cardY, 2, 20, 'F');

    doc.setTextColor(...textSecondary);
    doc.setFontSize(8);
    doc.text(c.label, x + 5, cardY + 6);

    doc.setTextColor(...c.color);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(String(c.value), x + 5, cardY + 14);
  });
  y += 50;

  // Tabla por mes
  doc.setTextColor(...textPrimary);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Desglose por mes', 14, y);

  const monthBody = monthsOfYear.map(m => {
    const monthName = new Date(m.key + '-01').toLocaleDateString('es-CO', { month: 'long' });
    const expenses = m.txs.reduce((s, t) => s + (t.amount || 0), 0);
    const cashback = m.txs.reduce((s, t) => s + (t.cashback || 0), 0);
    const extras = m.extras.reduce((s, e) => s + (e.amount || 0), 0);
    return [
      monthName.charAt(0).toUpperCase() + monthName.slice(1),
      m.txs.length,
      fmt(expenses),
      fmt(cashback),
      fmt(extras)
    ];
  });

  doc.autoTable({
    startY: y + 4,
    head: [['Mes', 'Trans.', 'Gastos', 'Cashback', 'Ingresos extras']],
    body: monthBody,
    headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
  });

  // Score crediticio histórico
  if (state.creditScore && state.creditScore.history && state.creditScore.history.length > 0) {
    let yScore = doc.lastAutoTable.finalY + 12;
    if (yScore > 240) { doc.addPage(); yScore = 20; }

    doc.setTextColor(...textPrimary);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Histórico Score Crediticio', 14, yScore);

    const scoreBody = state.creditScore.history
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(h => [h.date, h.score, h.source || 'DataCrédito']);

    doc.autoTable({
      startY: yScore + 4,
      head: [['Fecha', 'Puntaje', 'Fuente']],
      body: scoreBody,
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
      columnStyles: { 1: { halign: 'right' } }
    });
  }

  // Footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...textSecondary);
    doc.text(`FinanzasPro - Reporte Anual ${year}`, 14, 290);
    doc.text('Página ' + p + ' de ' + totalPages, 195, 290, { align: 'right' });
  }

  doc.save(`Reporte_Anual_${year}.pdf`);
}


// ============================================================


(function() {
  const STORAGE_KEY = 'finance-dashboard-cristian-v20';

  // Categorías de gastos: por defecto + personalizadas del usuario
  const DEFAULT_CATEGORIES = [
    // GASTOS FIJOS
    { id: 'servicios_casa', label: 'Servicios + casa', icon: '🏠', tipo: 'fijo', isDefault: true },
    { id: 'celular', label: 'Plan celular', icon: '📞', tipo: 'fijo', isDefault: true },
    { id: 'gimnasio', label: 'Gimnasio', icon: '💪', tipo: 'fijo', isDefault: true },
    { id: 'streaming', label: 'Streaming', icon: '📺', tipo: 'fijo', isDefault: true },
    // TRANSPORTE
    { id: 'uber', label: 'Uber / Transporte', icon: '🚗', tipo: 'estilo', isDefault: true },
    { id: 'gasolina', label: 'Gasolina', icon: '⛽', tipo: 'estilo', isDefault: true },
    // ALIMENTACIÓN
    { id: 'comida_fuera', label: 'Comida fuera', icon: '🍔', tipo: 'variable', isDefault: true },
    { id: 'rappi', label: 'Domicilios', icon: '🛵', tipo: 'variable', isDefault: true },
    { id: 'mercado', label: 'Mercado / Supermercado', icon: '🛒', tipo: 'variable', isDefault: true },
    // OCIO
    { id: 'salidas', label: 'Salidas / Entretenimiento', icon: '🎭', tipo: 'variable', isDefault: true },
    // OTROS COMUNES
    { id: 'salud', label: 'Salud / Medicina', icon: '💊', tipo: 'variable', isDefault: true },
    { id: 'compras', label: 'Compras varias', icon: '🛍️', tipo: 'variable', isDefault: true },
    { id: 'mascota', label: 'Mascota', icon: '🐾', tipo: 'variable', isDefault: true },
    { id: 'otros', label: 'Otros', icon: '📋', tipo: 'variable', isDefault: true }
  ];

  // Categorías DINÁMICAS: combina las default con las custom del state
  function getAllCategories() {
    const customs = (state && state.customCategories) ? state.customCategories : [];
    return [...DEFAULT_CATEGORIES, ...customs];
  }

  // Proxy para que el resto del código siga usando "CATEGORIES" pero leyendo dinámico
  const CATEGORIES_PROXY = new Proxy([], {
    get(target, prop) {
      const arr = getAllCategories();
      if (prop === 'forEach' || prop === 'map' || prop === 'filter' || prop === 'find' || prop === 'length' || prop === 'slice' || prop === 'sort' || prop === 'reduce' || prop === 'some' || prop === 'every' || prop === 'indexOf' || prop === 'includes') {
        return arr[prop].bind(arr);
      }
      if (prop === Symbol.iterator) return arr[Symbol.iterator].bind(arr);
      return arr[prop];
    }
  });
  const CATEGORIES = CATEGORIES_PROXY;

  function getCurrentMonthKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function getMonthLabel(k) {
    const [y, m] = k.split('-').map(Number);
    const ms = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return ms[m-1] + ' ' + y;
  }

  const DEFAULT_BUDGETS = {
    // Por defecto todos en 0 - el usuario decide qué controlar
    servicios_casa: 0,
    uber: 0,
    celular: 0,
    gimnasio: 0,
    streaming: 0,
    comida_fuera: 0,
    rappi: 0,
    salidas_milena: 0,
    gasolina: 0,
    mascota: 0,
    mascota_extra: 0,
    compras: 0,
    salud: 0,
    otros: 0
  };

  const initialMonth = getCurrentMonthKey();

  // EMPTY_STATE: estructura genérica para nuevos usuarios
  const EMPTY_STATE = {
    currency: 'COP', interestRate: 0,
    interestBank: 'Sin configurar',
    pockets: [
      { id: 1, name: 'Fondo de Emergencias', amount: 0, icon: '🛟' },
      { id: 2, name: 'Flujo Operativo', amount: 0, icon: '💰' },
      { id: 3, name: 'Ahorro Personal', amount: 0, icon: '🎯' },
      { id: 4, name: 'Gastos Fijos', amount: 0, icon: '🏠' },
      { id: 5, name: 'Vida Social', amount: 0, icon: '🍻' },
      { id: 9, name: 'Efectivo', amount: 0, icon: '💵', isCash: true }
    ],
    incomes: [
      { id: 101, name: 'Salario', amount: 0, frequency: 'monthly' }
    ],
    debts: [],
    goals: [],
    budgets: { [initialMonth]: { ...DEFAULT_BUDGETS } },
    transactions: {},
    extraIncomes: {},
    creditScore: {
      lastReported: null,
      lastReportedDate: null,
      history: [],
      reportData: null
    },
    // Marca para mostrar tutorial de bienvenida
    isNewUser: true
  };

  // MY_STATE: datos personales del dueño (Cristian) - solo se cargan si es el email autorizado
  const MY_STATE = {
    currency: 'COP', interestRate: 7.87,
    interestBank: 'Lulo Bank Pro (tasa efectiva real)',
    pockets: [
      { id: 1, name: 'Fondo de Emergencias', amount: 7611643.18, icon: '🛟' },
      { id: 2, name: 'Flujo Operativo', amount: 3242994.40, icon: '💰' },
      { id: 4, name: 'Universidad', amount: 755955.95, icon: '🎓' },
      { id: 5, name: 'Servicios', amount: 507933.58, icon: '⚡' },
      { id: 6, name: 'Vida Social', amount: 400389.24, icon: '🍻' },
      { id: 7, name: 'Gastos Fijos del mes', amount: 384843.09, icon: '🏠' },
      { id: 8, name: 'Zlatan', amount: 478941.24, icon: '❤️' },
      { id: 1777485097200, name: 'Efectivo', amount: 270000, icon: '💵', isCash: true },
      { id: 1777485984540, name: 'Cashback RappiCard', amount: 302777.15, icon: '💳', bank: 'rappi', rate: 9 }
    ],
    incomes: [
      { id: 101, name: 'Salario', amount: 2000000, frequency: 'monthly' },
      { id: 102, name: 'Rendimientos Lulo Bank (neto)', amount: 75000, frequency: 'monthly' }
    ],
    debts: [
      { id: 301, name: 'RappiCard', balance: 62775.88, rate: 0, payment: 4800000, cutoffDay: 28, brand: 'visa', bank: 'davivienda', lastDigits: '3101' },
      { id: 302, name: 'Lulo Bank', balance: 681075, rate: 0, payment: 12200000, cutoffDay: 5, brand: 'mastercard', bank: 'lulo', lastDigits: '7310' }
    ],
    goals: [
      { id: 401, name: 'Viajes Futuros', target: 1500000, current: 825643.17 }
    ],
    budgets: {
      '2026-04': {
        servicios_casa: 0, uber: 0, celular: 0, gimnasio: 0,
        streaming: 0, comida_fuera: 0, rappi: 0, salidas_milena: 0,
        gasolina: 0, mascota: 0, mascota_extra: 0, compras: 0, salud: 0, otros: 0
      },
      '2026-05': {
        servicios_casa: 0, uber: 0, celular: 0, gimnasio: 0,
        streaming: 0, comida_fuera: 0, rappi: 0, salidas_milena: 0,
        gasolina: 0, mascota: 0, mascota_extra: 0, compras: 0, salud: 0, otros: 0
      }
    },
    transactions: {
      '2026-04': [
        { id: 1777482517123, date: '2026-04-28', desc: 'UBER VALENTINA', amount: 9033, category: 'uber', paymentMethod: 'tarjeta', cardId: 301, cashback: 90.33 },
        { id: 1777482742296, date: '2026-04-29', desc: 'PAGO CANCHA DE FUTBOL', amount: 12000, category: 'comida_fuera', paymentMethod: 'llave', cardId: null, cashback: 0 },
        { id: 1777483324893, date: '2026-04-29', desc: 'PAGO MOSVISTAR', amount: 204387, category: 'servicios_casa', paymentMethod: 'llave', cardId: null, cashback: 0 },
        { id: 1777485429051, date: '2026-04-29', desc: 'PAGO GAS MILENA', amount: 9630, category: 'salidas_milena', paymentMethod: 'tarjeta', cardId: 301, pocketId: null, cashback: 96.3 },
        { id: 1777498594504, date: '2026-04-29', desc: 'PAGO DATACREDITO', amount: 14000, category: 'otros', paymentMethod: 'debito', cardId: null, pocketId: 2, cashback: 0 },
        { id: 1777514521403, date: '2026-04-29', desc: 'PAGO UBER IDA GIMNACIO', amount: 6802, category: 'uber', paymentMethod: 'tarjeta', cardId: 301, pocketId: null, cashback: 68.02 },
        { id: 1777514550835, date: '2026-04-29', desc: 'PAGO UBER VUELTA GIMNACIO', amount: 10167, category: 'uber', paymentMethod: 'tarjeta', cardId: 301, pocketId: null, cashback: 101.67 },
        { id: 1777563261875, date: '2026-04-30', desc: 'PAGO MEDICAMENTOS ZLATAN', amount: 316000, category: 'mascota', paymentMethod: 'tarjeta', cardId: 302, pocketId: null, cashback: 3160 },
        { id: 1777563698890, date: '2026-04-30', desc: 'PAGO TARJETA RAPPICARD ABRIL', amount: 180436.16, category: 'otros', paymentMethod: 'debito', cardId: null, pocketId: 2, cashback: 0 },
        { id: 1777564443688, date: '2026-04-30', desc: 'PAGOS GAS ABRIL', amount: 38330, category: 'servicios_casa', paymentMethod: 'tarjeta', cardId: 301, pocketId: null, cashback: 383.3 }
      ]
    },
    extraIncomes: {
      '2026-04': [
        { id: 1777484464331, date: '2026-04-29', desc: 'REGALO CUMPLEAÑOS', amount: 276000, source: 'regalo', pocketId: 1777485097200 },
        { id: 1777562631004, date: '2026-04-30', desc: 'PAGO VALENTINA DEUDA', amount: 248300, source: 'prestamo', pocketId: null }
      ]
    },
    creditScore: {
      lastReported: 691,
      lastReportedDate: '2026-04-29',
      history: [
        { date: '2026-02-09', score: 678, source: 'DataCrédito' },
        { date: '2026-04-29', score: 691, source: 'DataCrédito' }
      ],
      reportData: {
        utilization: 4.2,
        pendingPercent: 0.04,
        cardsBehavior: 'estable',
        hasFixedLoan: false,
        hasMortgage: false,
        mora30: 0,
        mora60: 0,
        currentMora: 0,
        experienceYears: 6,
        openProducts: 6,
        newLoans: 0,
        monthsSinceLastOpen: 10
      }
    }
  };

  // Email del dueño - solo este recibe MY_STATE como datos por defecto
  const OWNER_EMAILS = ['cristiancamilo_cc@hotmail.com']; // ← agrega aquí los emails autorizados

  // DEFAULT_STATE inicial es vacío. Se decidirá en runtime cuál cargar
  const DEFAULT_STATE = EMPTY_STATE;

  let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  let chartPockets = null, chartComparison = null;
  let currentMonth = initialMonth;
  const FREQ = { monthly: 1, biweekly: 2, weekly: 4.33, yearly: 1/12, once: 0 };

  function fmt(n) {
    if (isNaN(n) || n === null) return '—';
    return '$ ' + Math.round(n).toLocaleString('es-CO');
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const loaded = JSON.parse(raw);
        state = { ...DEFAULT_STATE, ...loaded };
        if (!state.budgets) state.budgets = { [currentMonth]: { ...DEFAULT_BUDGETS } };
        if (!state.transactions) state.transactions = {};
        if (!state.extraIncomes) state.extraIncomes = {};
        // NO agregar bolsillos automáticamente - cada usuario crea los suyos
      }
    } catch(e) { console.error(e); }
    populateCategories();
    populateMonths();
    setDefaultDate();
    renderAll();
  }
  
  // Exponer al scope global para que loadFromCloud pueda llamarla
  window.loadState = loadState;

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
  }

  function setDefaultDate() {
    const d = new Date().toISOString().split('T')[0];
    const el = document.getElementById('tx-date');
    if (el && !el.value) el.value = d;
    const el2 = document.getElementById('extra-date');
    if (el2 && !el2.value) el2.value = d;
  }

  function populateCategories() {
    const sel = document.getElementById('tx-category');
    if (sel) sel.innerHTML = CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('');
    populateCards();
    populatePocketsSelector();
    setupPaymentMethodListener();
  }

  function populateCards() {
    const sel = document.getElementById('tx-card');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecciona tarjeta</option>' +
      state.debts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  }

  function populatePocketsSelector() {
    const sel = document.getElementById('tx-pocket');
    if (sel) {
      sel.innerHTML = '<option value="">No descontar de bolsillo</option>' +
        state.pockets.map(p => `<option value="${p.id}">${p.icon} ${p.name} (${fmt(p.amount)})</option>`).join('');
    }
    const extraSel = document.getElementById('extra-pocket');
    if (extraSel) {
      extraSel.innerHTML = '<option value="">No agregar a bolsillo</option>' +
        state.pockets.map(p => `<option value="${p.id}">${p.icon} ${p.name} (${fmt(p.amount)})</option>`).join('');
    }
  }

  function setupPaymentMethodListener() {
    const methodSel = document.getElementById('tx-payment-method');
    const cardSel = document.getElementById('tx-card');
    const cashbackInfo = document.getElementById('tx-cashback-info');
    const amountInput = document.getElementById('tx-amount');
    const pocketRow = document.getElementById('tx-pocket-row');
    const pocketSel = document.getElementById('tx-pocket');
    if (!methodSel || !cardSel) return;

    function updateUI() {
      const isCard = methodSel.value === 'tarjeta';
      const isCash = methodSel.value === 'efectivo';
      cardSel.style.display = isCard ? 'block' : 'none';
      if (pocketRow) pocketRow.style.display = isCard ? 'none' : 'block';

      if (isCash && pocketSel) {
        const cashPocket = state.pockets.find(p => p.isCash);
        if (cashPocket && !pocketSel.value) {
          pocketSel.value = cashPocket.id;
        }
      }
      updateCashbackPreview();
    }

    function getRecommendedCard(amount) {
      if (!state.debts || state.debts.length === 0) return null;
      const today = new Date();
      const currentDay = today.getDate();
      const tasaDiaria = (state.interestRate || 7.87) / 100 / 365;

      const candidates = state.debts.map(d => {
        if (!d.cutoffDay) return null;
        let nextCutoff;
        if (currentDay <= d.cutoffDay) {
          nextCutoff = new Date(today.getFullYear(), today.getMonth(), d.cutoffDay);
        } else {
          nextCutoff = new Date(today.getFullYear(), today.getMonth() + 1, d.cutoffDay);
        }
        const daysUntilCutoff = Math.ceil((nextCutoff - today) / (1000 * 60 * 60 * 24));
        // Float total = días entre compra y pago (aprox 5 días después del corte)
        const floatDays = Math.max(1, daysUntilCutoff + 5);
        const floatGain = amount * tasaDiaria * floatDays;
        const cashback = amount * 0.01;

        // Verificar si esta compra excedería el 3% utilización
        const newBalance = d.balance + amount;
        const newUtilization = d.payment > 0 ? (newBalance / d.payment) * 100 : 0;
        const exceeds3pct = newUtilization > 3;
        const exceeds10pct = newUtilization > 10;

        return {
          card: d,
          floatDays,
          floatGain,
          cashback,
          totalBenefit: floatGain + cashback,
          newUtilization,
          exceeds3pct,
          exceeds10pct
        };
      }).filter(c => c !== null);

      if (candidates.length === 0) return null;

      // Ordenar por mayor beneficio, penalizando si excede 10%
      candidates.sort((a, b) => {
        if (a.exceeds10pct && !b.exceeds10pct) return 1;
        if (!a.exceeds10pct && b.exceeds10pct) return -1;
        return b.totalBenefit - a.totalBenefit;
      });

      return candidates;
    }

    function updateCashbackPreview() {
      const isCard = methodSel.value === 'tarjeta';
      const amount = parseFloat(amountInput.value) || 0;

      if (isCard && amount > 0) {
        const recommendations = getRecommendedCard(amount);
        if (recommendations && recommendations.length > 0) {
          const best = recommendations[0];
          let html = `💰 <strong>Cashback estimado:</strong> ${fmt(best.cashback)} (1%)`;

          // Mostrar recomendación de tarjeta óptima
          html += `<div style="margin-top: 8px; padding: 8px 10px; background: var(--info-bg); border-radius: var(--radius-md); color: var(--info-text);">`;
          html += `<strong>🎯 Recomendación: usa la ${esc(best.card.name)}</strong><br>`;
          html += `<span style="font-size: 11px;">${best.floatDays} días de float al ${(state.interestRate || 7.87)}% E.A. = +${fmt(best.floatGain)} extra</span><br>`;
          html += `<span style="font-size: 11px;">Beneficio total: <strong>+${fmt(best.totalBenefit)}</strong></span>`;
          if (best.exceeds3pct) {
            html += `<br><span style="font-size: 11px; color: var(--warning-text);">⚠️ Esta compra subirá tu utilización a ${best.newUtilization.toFixed(1)}% (sobre el 3% objetivo)</span>`;
          }
          html += `</div>`;

          // Si hay segunda opción, mostrar comparativa
          if (recommendations.length > 1) {
            const second = recommendations[1];
            const diff = best.totalBenefit - second.totalBenefit;
            html += `<div style="margin-top: 6px; font-size: 11px; color: var(--text-secondary);">vs ${esc(second.card.name)}: ${fmt(second.totalBenefit)} (diferencia: ${fmt(diff)})</div>`;
          }

          cashbackInfo.style.display = 'block';
          cashbackInfo.innerHTML = html;

          // Auto-seleccionar la tarjeta óptima si no hay ninguna seleccionada
          if (!cardSel.value) {
            cardSel.value = best.card.id;
          }
        } else {
          cashbackInfo.style.display = 'block';
          cashbackInfo.innerHTML = `💰 Cashback estimado: <strong>${fmt(amount * 0.01)}</strong> (1% del gasto)`;
        }
      } else {
        cashbackInfo.style.display = 'none';
      }
    }

    methodSel.addEventListener('change', updateUI);
    amountInput.addEventListener('input', updateCashbackPreview);
    updateUI();
  }

  function populateMonths() {
    const sel = document.getElementById('month-select');
    if (!sel) return;
    const all = new Set([currentMonth, ...Object.keys(state.budgets || {}), ...Object.keys(state.transactions || {})]);
    const sorted = Array.from(all).sort().reverse();
    sel.innerHTML = sorted.map(m => `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${getMonthLabel(m)}</option>`).join('');
    sel.onchange = (e) => {
      currentMonth = e.target.value;
      if (!state.budgets[currentMonth]) {
        state.budgets[currentMonth] = { ...DEFAULT_BUDGETS };
        saveState();
      }
      renderBudget(); renderTransactions();
    };
  }

  const totalPockets = () => state.pockets.reduce((s, p) => s + p.amount, 0);
  const totalIncome = () => state.incomes.reduce((s, i) => s + i.amount * (FREQ[i.frequency] || 0), 0);
  const totalMonthCashback = () => {
    const txs = state.transactions[currentMonth] || [];
    return txs.reduce((s, t) => s + (parseFloat(t.cashback) || 0), 0);
  };
  const totalMonthExtraIncome = (month) => {
    const m = month || currentMonth;
    const extras = (state.extraIncomes && state.extraIncomes[m]) || [];
    return extras.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  };
  const totalIncomeWithCashback = () => totalIncome() + totalMonthCashback() + totalMonthExtraIncome();
  const totalDebt = () => state.debts.reduce((s, d) => s + d.balance, 0);
  const totalLimit = () => state.debts.reduce((s, d) => s + d.payment, 0);
  function totalBudget() { const b = state.budgets[currentMonth] || {}; return Object.values(b).reduce((s, v) => s + (parseFloat(v) || 0), 0); }
  function totalSpent() { const t = state.transactions[currentMonth] || []; return t.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0); }
  function spentByCategory(id) { const t = state.transactions[currentMonth] || []; return t.filter(x => x.category === id).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0); }

  document.querySelectorAll('.fin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.fin-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('section-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'resumen') setTimeout(renderCharts, 50);
      if (btn.dataset.tab === 'presupuesto') { renderBudget(); renderTransactions(); }
    });
  });

  setTimeout(() => {
    const r = document.getElementById('interest-rate');
    if (r) {
      r.value = state.interestRate || 0;
      r.addEventListener('change', e => { state.interestRate = parseFloat(e.target.value) || 0; saveState(); renderAll(); });
    }
  }, 100);

  window.exportData = function() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mis-finanzas-' + new Date().toISOString().split('T')[0] + '.json';
    a.click(); URL.revokeObjectURL(url);
  };
  window.importData = function() { document.getElementById('import-file').click(); };
  document.getElementById('import-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const i = JSON.parse(ev.target.result);
        if (confirm('¿Reemplazar tus datos?')) {
          state = { ...DEFAULT_STATE, ...i };
          saveState(); populateMonths(); renderAll(); alert('Importado');
        }
      } catch(err) { alert('Archivo inválido'); }
    };
    r.readAsText(f); e.target.value = '';
  });

  window.addPocket = function() {
    const n = document.getElementById('pocket-name').value.trim();
    const a = parseFloat(document.getElementById('pocket-amount').value);
    const i = document.getElementById('pocket-icon').value;
    const bankEl = document.getElementById('pocket-bank');
    const rateEl = document.getElementById('pocket-rate');
    const bank = bankEl ? bankEl.value : 'generic';
    const rate = rateEl ? (parseFloat(rateEl.value) || 0) : 0;
    
    if (!n || isNaN(a) || a < 0) return alert('Completa nombre y monto');
    
    const pocket = { 
      id: Date.now(), 
      name: n, 
      amount: a, 
      icon: i,
      bank: bank,
      rate: rate,
      isCash: bank === 'cash'
    };
    
    state.pockets.push(pocket);
    
    // Limpiar formulario
    document.getElementById('pocket-name').value = '';
    document.getElementById('pocket-amount').value = '';
    if (bankEl) bankEl.value = 'generic';
    if (rateEl) rateEl.value = '0';
    
    saveState(); 
    renderAll();
    
    // Toast de éxito si está disponible
    if (typeof toastSuccess === 'function') {
      toastSuccess('Bolsillo creado', `"${n}" agregado correctamente`);
    }
  };
  window.removePocket = function(id) {
    if (!confirm('¿Eliminar?')) return;
    state.pockets = state.pockets.filter(p => p.id !== id); saveState(); renderAll();
  };
  window.updatePocket = function(id, a) {
    const p = state.pockets.find(x => x.id === id);
    if (p) { p.amount = parseFloat(a) || 0; saveState(); renderResumen(); renderPockets(); }
  };

  window.addIncome = function() {
    const n = document.getElementById('income-name').value.trim();
    const a = parseFloat(document.getElementById('income-amount').value);
    const f = document.getElementById('income-frequency').value;
    if (!n || !a || a <= 0) return alert('Completa todo');
    state.incomes.push({ id: Date.now(), name: n, amount: a, frequency: f });
    document.getElementById('income-name').value = '';
    document.getElementById('income-amount').value = '';
    saveState(); renderAll();
  };
  window.removeIncome = function(id) { state.incomes = state.incomes.filter(i => i.id !== id); saveState(); renderAll(); };

  // ============================================
  // TIPOS DE INGRESOS EXTRAS (PERSONALIZABLES)
  // ============================================
  const DEFAULT_INCOME_TYPES = [
    { id: 'bono', icon: '🎁', label: 'Bono / Bonificación', isDefault: true },
    { id: 'devolucion', icon: '↩️', label: 'Devolución', isDefault: true },
    { id: 'regalo', icon: '🎉', label: 'Regalo', isDefault: true },
    { id: 'venta', icon: '🛒', label: 'Venta', isDefault: true },
    { id: 'freelance', icon: '💼', label: 'Freelance / Trabajo extra', isDefault: true },
    { id: 'prestamo', icon: '💵', label: 'Devolución de préstamo', isDefault: true },
    { id: 'reembolso', icon: '📋', label: 'Reembolso', isDefault: true },
    { id: 'otro', icon: '📌', label: 'Otro', isDefault: true }
  ];

  function getAllIncomeTypes() {
    // Combina los default con los personalizados del usuario
    const userTypes = state.extraIncomeTypes || [];
    return [...DEFAULT_INCOME_TYPES, ...userTypes];
  }

  function getIncomeTypesAsMap() {
    const map = {};
    getAllIncomeTypes().forEach(t => {
      map[t.id] = { icon: t.icon, label: t.label };
    });
    return map;
  }

  function renderIncomeTypesSelect() {
    const select = document.getElementById('extra-source');
    if (!select) return;
    const currentValue = select.value;
    const types = getAllIncomeTypes();
    select.innerHTML = types.map(t =>
      `<option value="${t.id}">${t.icon} ${t.label}</option>`
    ).join('');
    if (currentValue) select.value = currentValue;
  }

  window.openIncomeTypesManager = function() {
    let modal = document.getElementById('income-types-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'income-types-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px; backdrop-filter: blur(4px);';

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 16px; max-width: 500px; width: 100%; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="font-size: 18px; font-weight: 600; margin: 0;">⚙️ Gestionar tipos de ingreso</h2>
          <button onclick="closeIncomeTypesManager()" style="background: transparent; border: none; cursor: pointer; font-size: 22px; color: var(--text-secondary); padding: 0 4px;">×</button>
        </div>

        <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 16px;">Crea tus propios tipos de ingreso extra para personalizar el dashboard a tu estilo.</p>

        <div style="background: var(--bg-secondary); padding: 14px; border-radius: 12px; margin-bottom: 16px;">
          <p style="font-size: 13px; font-weight: 500; margin: 0 0 10px;">➕ Crear nuevo tipo</p>
          <div style="display: grid; grid-template-columns: 60px 1fr; gap: 8px; margin-bottom: 8px;">
            <input type="text" id="new-type-icon" placeholder="🎯" maxlength="2" style="text-align: center; font-size: 18px;" />
            <input type="text" id="new-type-label" placeholder="Nombre (ej: Comisión por ventas)" maxlength="50" />
          </div>
          <button onclick="addCustomIncomeType()" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #7F77DD, #1D9E75); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 13px;">+ Crear tipo</button>
          <p style="font-size: 11px; color: var(--text-tertiary); margin: 6px 0 0;">💡 Tip: usa emojis para identificarlo visualmente</p>
        </div>

        <div>
          <p style="font-size: 13px; font-weight: 500; margin: 0 0 10px;">📋 Tipos disponibles</p>
          <div id="income-types-list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    lockBody();
    renderIncomeTypesList();
  };

  function renderIncomeTypesList() {
    const container = document.getElementById('income-types-list');
    if (!container) return;

    const types = getAllIncomeTypes();
    container.innerHTML = types.map(t => {
      const isDefault = t.isDefault;
      return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 6px; border: 0.5px solid var(--border);">
        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
          <span style="font-size: 20px;">${t.icon}</span>
          <div style="flex: 1;">
            <div style="font-size: 13px; font-weight: 500;">${t.label}</div>
            ${isDefault ? '<div style="font-size: 11px; color: var(--text-tertiary);">Tipo por defecto</div>' : '<div style="font-size: 11px; color: var(--info-text);">✨ Personalizado</div>'}
          </div>
        </div>
        ${!isDefault ? `
          <div style="display: flex; gap: 4px;">
            <button onclick="editCustomIncomeType('${t.id}')" style="font-size: 11px; padding: 4px 8px; background: transparent; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">✏️</button>
            <button onclick="deleteCustomIncomeType('${t.id}')" style="font-size: 11px; padding: 4px 8px; background: var(--danger-bg); color: var(--danger-text); border: 1px solid var(--danger-text); border-radius: 6px; cursor: pointer;">🗑️</button>
          </div>
        ` : ''}
      </div>`;
    }).join('');
  }

  window.closeIncomeTypesManager = function() {
    const modal = document.getElementById('income-types-modal');
    if (modal) {
      modal.remove();
      unlockBody();
    }
  };

  window.addCustomIncomeType = function() {
    const icon = document.getElementById('new-type-icon').value.trim() || '📌';
    const label = document.getElementById('new-type-label').value.trim();
    if (!label) {
      alert('Ingresa un nombre para el tipo');
      return;
    }

    if (!state.extraIncomeTypes) state.extraIncomeTypes = [];

    // Verificar que no exista uno con el mismo nombre
    const allTypes = getAllIncomeTypes();
    if (allTypes.some(t => t.label.toLowerCase() === label.toLowerCase())) {
      alert('Ya existe un tipo con ese nombre');
      return;
    }

    // Crear ID único basado en timestamp
    const id = 'custom_' + Date.now();
    state.extraIncomeTypes.push({ id, icon, label, isDefault: false });

    document.getElementById('new-type-icon').value = '';
    document.getElementById('new-type-label').value = '';

    saveState();
    renderIncomeTypesList();
    renderIncomeTypesSelect();
  };

  window.editCustomIncomeType = function(id) {
    if (!state.extraIncomeTypes) return;
    const type = state.extraIncomeTypes.find(t => t.id === id);
    if (!type) return;

    const newLabel = prompt('Nuevo nombre:', type.label);
    if (newLabel === null) return;
    if (!newLabel.trim()) return alert('El nombre no puede estar vacío');

    const newIcon = prompt('Nuevo emoji/ícono (opcional):', type.icon);
    if (newIcon === null) return;

    type.label = newLabel.trim();
    type.icon = newIcon.trim() || '📌';

    saveState();
    renderIncomeTypesList();
    renderIncomeTypesSelect();
    renderExtraIncomes();
  };

  window.deleteCustomIncomeType = function(id) {
    if (!state.extraIncomeTypes) return;
    const type = state.extraIncomeTypes.find(t => t.id === id);
    if (!type) return;

    // Verificar si está en uso
    let inUse = 0;
    Object.values(state.extraIncomes || {}).forEach(monthExtras => {
      monthExtras.forEach(e => {
        if (e.source === id) inUse++;
      });
    });

    let confirmMsg = `¿Eliminar el tipo "${type.label}"?`;
    if (inUse > 0) {
      confirmMsg += `\n\n⚠️ Tienes ${inUse} ingreso(s) registrados con este tipo. Si lo eliminas, se mostrarán como "Otro".`;
    }

    if (!confirm(confirmMsg)) return;

    state.extraIncomeTypes = state.extraIncomeTypes.filter(t => t.id !== id);

    // Migrar los registros que usaban ese tipo a "otro"
    Object.values(state.extraIncomes || {}).forEach(monthExtras => {
      monthExtras.forEach(e => {
        if (e.source === id) e.source = 'otro';
      });
    });

    saveState();
    renderIncomeTypesList();
    renderIncomeTypesSelect();
    renderExtraIncomes();
  };

  // ============================================
  // CATEGORÍAS DE GASTOS PERSONALIZABLES
  // ============================================
  function renderCategoriesSelect() {
    // Actualizar el select de tx-category
    const select = document.getElementById('tx-category');
    if (!select) return;
    const currentValue = select.value;
    const cats = getAllCategories();
    select.innerHTML = cats.map(c =>
      `<option value="${c.id}">${c.icon} ${c.label}</option>`
    ).join('');
    if (currentValue) select.value = currentValue;

    // También actualizar el filtro de categorías si existe
    const filterSel = document.getElementById('tx-filter-category');
    if (filterSel) {
      const filterCurrent = filterSel.value;
      filterSel.innerHTML = '<option value="all">Todas las categorías</option>' +
        cats.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('');
      if (filterCurrent) filterSel.value = filterCurrent;
    }
  }

  window.openCategoriesManager = function() {
    let modal = document.getElementById('categories-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'categories-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px; backdrop-filter: blur(4px);';

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 16px; max-width: 500px; width: 100%; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="font-size: 18px; font-weight: 600; margin: 0;">⚙️ Gestionar categorías</h2>
          <button onclick="closeCategoriesManager()" style="background: transparent; border: none; cursor: pointer; font-size: 22px; color: var(--text-secondary); padding: 0 4px;">×</button>
        </div>

        <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 16px;">Crea tus propias categorías de gastos para personalizar tu dashboard.</p>

        <div style="background: var(--bg-secondary); padding: 14px; border-radius: 12px; margin-bottom: 16px;">
          <p style="font-size: 13px; font-weight: 500; margin: 0 0 10px;">➕ Crear nueva categoría</p>
          <div style="display: grid; grid-template-columns: 60px 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <input type="text" id="new-cat-icon" placeholder="🎯" maxlength="2" style="text-align: center; font-size: 18px;" />
            <input type="text" id="new-cat-label" placeholder="Nombre (ej: Educación)" maxlength="40" />
            <select id="new-cat-tipo">
              <option value="fijo">Fijo</option>
              <option value="estilo">Estilo</option>
              <option value="variable" selected>Variable</option>
            </select>
          </div>
          <button onclick="addCustomCategory()" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #7F77DD, #1D9E75); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 13px;">+ Crear categoría</button>
          <div style="margin-top: 8px; padding: 8px 10px; background: var(--bg-primary); border-radius: 6px; font-size: 11px; color: var(--text-secondary); line-height: 1.5;">
            <strong>Tipos:</strong><br>
            • <strong>Fijo</strong>: pagos siempre iguales (alquiler, servicios)<br>
            • <strong>Estilo</strong>: gastos recurrentes con poca variación (gym, transporte)<br>
            • <strong>Variable</strong>: gastos donde tienes control (comida fuera, compras)
          </div>
        </div>

        <div>
          <p style="font-size: 13px; font-weight: 500; margin: 0 0 10px;">📋 Categorías disponibles</p>
          <div id="categories-list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    lockBody();
    renderCategoriesList();
  };

  function renderCategoriesList() {
    const container = document.getElementById('categories-list');
    if (!container) return;
    const cats = getAllCategories();

    container.innerHTML = cats.map(c => {
      const isDefault = c.isDefault;
      const tipoLabel = { fijo: 'Fijo', estilo: 'Estilo', variable: 'Variable' }[c.tipo] || c.tipo;
      return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 6px; border: 0.5px solid var(--border);">
        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
          <span style="font-size: 20px;">${c.icon}</span>
          <div style="flex: 1;">
            <div style="font-size: 13px; font-weight: 500;">${c.label}</div>
            <div style="font-size: 11px; color: var(--text-tertiary);">${isDefault ? 'Por defecto' : '✨ Personalizada'} · ${tipoLabel}</div>
          </div>
        </div>
        ${!isDefault ? `
          <div style="display: flex; gap: 4px;">
            <button onclick="editCustomCategory('${c.id}')" style="font-size: 11px; padding: 4px 8px; background: transparent; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">✏️</button>
            <button onclick="deleteCustomCategory('${c.id}')" style="font-size: 11px; padding: 4px 8px; background: var(--danger-bg); color: var(--danger-text); border: 1px solid var(--danger-text); border-radius: 6px; cursor: pointer;">🗑️</button>
          </div>
        ` : ''}
      </div>`;
    }).join('');
  }

  window.closeCategoriesManager = function() {
    const modal = document.getElementById('categories-modal');
    if (modal) {
      modal.remove();
      unlockBody();
    }
  };

  window.addCustomCategory = function() {
    const icon = document.getElementById('new-cat-icon').value.trim() || '📌';
    const label = document.getElementById('new-cat-label').value.trim();
    const tipo = document.getElementById('new-cat-tipo').value || 'variable';
    if (!label) return alert('Ingresa un nombre');

    const allCats = getAllCategories();
    if (allCats.some(c => c.label.toLowerCase() === label.toLowerCase())) {
      alert('Ya existe una categoría con ese nombre');
      return;
    }

    if (!state.customCategories) state.customCategories = [];
    const id = 'custom_cat_' + Date.now();
    state.customCategories.push({ id, icon, label, tipo, isDefault: false });

    document.getElementById('new-cat-icon').value = '';
    document.getElementById('new-cat-label').value = '';

    saveState();
    renderCategoriesList();
    renderCategoriesSelect();
    renderAll();
  };

  window.editCustomCategory = function(id) {
    if (!state.customCategories) return;
    const cat = state.customCategories.find(c => c.id === id);
    if (!cat) return;

    const newLabel = prompt('Nuevo nombre:', cat.label);
    if (newLabel === null) return;
    if (!newLabel.trim()) return alert('El nombre no puede estar vacío');

    const newIcon = prompt('Nuevo emoji (opcional):', cat.icon);
    if (newIcon === null) return;

    cat.label = newLabel.trim();
    cat.icon = newIcon.trim() || '📌';

    saveState();
    renderCategoriesList();
    renderCategoriesSelect();
    renderAll();
  };

  window.deleteCustomCategory = function(id) {
    if (!state.customCategories) return;
    const cat = state.customCategories.find(c => c.id === id);
    if (!cat) return;

    let inUse = 0;
    Object.values(state.transactions || {}).forEach(monthTxs => {
      monthTxs.forEach(t => { if (t.category === id) inUse++; });
    });

    let msg = `¿Eliminar la categoría "${cat.label}"?`;
    if (inUse > 0) msg += `\n\n⚠️ Tienes ${inUse} transacción(es) en esta categoría. Se moverán a "Otros".`;
    if (!confirm(msg)) return;

    state.customCategories = state.customCategories.filter(c => c.id !== id);

    Object.values(state.transactions || {}).forEach(monthTxs => {
      monthTxs.forEach(t => { if (t.category === id) t.category = 'otros'; });
    });

    // También eliminar de presupuestos
    Object.values(state.budgets || {}).forEach(monthBudget => {
      delete monthBudget[id];
    });

    saveState();
    renderCategoriesList();
    renderCategoriesSelect();
    renderAll();
  };

  // ============================================
  // MÉTODOS DE PAGO PERSONALIZABLES
  // ============================================
  const DEFAULT_PAYMENT_METHODS = [
    { id: 'tarjeta', icon: '💳', label: 'Tarjeta de crédito', isDefault: true },
    { id: 'pse', icon: '🏦', label: 'PSE', isDefault: true },
    { id: 'llave', icon: '🔑', label: 'Llave / Bre-B', isDefault: true },
    { id: 'efectivo', icon: '💵', label: 'Efectivo', isDefault: true },
    { id: 'debito', icon: '🏧', label: 'Débito', isDefault: true },
    { id: 'nequi', icon: '📱', label: 'Nequi', isDefault: true },
    { id: 'daviplata', icon: '📲', label: 'Daviplata', isDefault: true },
    { id: 'transferencia', icon: '↔️', label: 'Transferencia', isDefault: true }
  ];

  function getAllPaymentMethods() {
    const customs = (state && state.customPaymentMethods) ? state.customPaymentMethods : [];
    return [...DEFAULT_PAYMENT_METHODS, ...customs];
  }

  function getPaymentMethodsAsMap() {
    const map = {};
    getAllPaymentMethods().forEach(m => {
      map[m.id] = { icon: m.icon, label: m.label };
    });
    return map;
  }

  function renderPaymentMethodsSelect() {
    const select = document.getElementById('tx-payment-method');
    if (!select) return;
    const currentValue = select.value;
    const methods = getAllPaymentMethods();
    select.innerHTML = methods.map(m =>
      `<option value="${m.id}">${m.icon} ${m.label}</option>`
    ).join('');
    if (currentValue) select.value = currentValue;

    // Filtro
    const filterSel = document.getElementById('tx-filter-method');
    if (filterSel) {
      const filterCurrent = filterSel.value;
      filterSel.innerHTML = '<option value="all">Todos los métodos</option>' +
        methods.map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('');
      if (filterCurrent) filterSel.value = filterCurrent;
    }
  }

  window.openPaymentMethodsManager = function() {
    let modal = document.getElementById('payment-methods-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'payment-methods-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px; backdrop-filter: blur(4px);';

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 16px; max-width: 500px; width: 100%; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="font-size: 18px; font-weight: 600; margin: 0;">⚙️ Gestionar métodos de pago</h2>
          <button onclick="closePaymentMethodsManager()" style="background: transparent; border: none; cursor: pointer; font-size: 22px; color: var(--text-secondary); padding: 0 4px;">×</button>
        </div>

        <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 16px;">Agrega métodos de pago personalizados (Movii, Bold, Yape, etc.)</p>

        <div style="background: var(--bg-secondary); padding: 14px; border-radius: 12px; margin-bottom: 16px;">
          <p style="font-size: 13px; font-weight: 500; margin: 0 0 10px;">➕ Crear nuevo método</p>
          <div style="display: grid; grid-template-columns: 60px 1fr; gap: 8px; margin-bottom: 8px;">
            <input type="text" id="new-method-icon" placeholder="💎" maxlength="2" style="text-align: center; font-size: 18px;" />
            <input type="text" id="new-method-label" placeholder="Nombre (ej: Movii, Yape, Bold)" maxlength="40" />
          </div>
          <button onclick="addCustomPaymentMethod()" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #7F77DD, #1D9E75); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 13px;">+ Crear método</button>
        </div>

        <div>
          <p style="font-size: 13px; font-weight: 500; margin: 0 0 10px;">📋 Métodos disponibles</p>
          <div id="payment-methods-list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    lockBody();
    renderPaymentMethodsList();
  };

  function renderPaymentMethodsList() {
    const container = document.getElementById('payment-methods-list');
    if (!container) return;
    const methods = getAllPaymentMethods();

    container.innerHTML = methods.map(m => {
      const isDefault = m.isDefault;
      return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 6px; border: 0.5px solid var(--border);">
        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
          <span style="font-size: 20px;">${m.icon}</span>
          <div style="flex: 1;">
            <div style="font-size: 13px; font-weight: 500;">${m.label}</div>
            <div style="font-size: 11px; color: var(--text-tertiary);">${isDefault ? 'Por defecto' : '✨ Personalizado'}</div>
          </div>
        </div>
        ${!isDefault ? `
          <div style="display: flex; gap: 4px;">
            <button onclick="editCustomPaymentMethod('${m.id}')" style="font-size: 11px; padding: 4px 8px; background: transparent; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">✏️</button>
            <button onclick="deleteCustomPaymentMethod('${m.id}')" style="font-size: 11px; padding: 4px 8px; background: var(--danger-bg); color: var(--danger-text); border: 1px solid var(--danger-text); border-radius: 6px; cursor: pointer;">🗑️</button>
          </div>
        ` : ''}
      </div>`;
    }).join('');
  }

  window.closePaymentMethodsManager = function() {
    const modal = document.getElementById('payment-methods-modal');
    if (modal) {
      modal.remove();
      unlockBody();
    }
  };

  window.addCustomPaymentMethod = function() {
    const icon = document.getElementById('new-method-icon').value.trim() || '💳';
    const label = document.getElementById('new-method-label').value.trim();
    if (!label) return alert('Ingresa un nombre');

    const all = getAllPaymentMethods();
    if (all.some(m => m.label.toLowerCase() === label.toLowerCase())) {
      alert('Ya existe un método con ese nombre');
      return;
    }

    if (!state.customPaymentMethods) state.customPaymentMethods = [];
    const id = 'custom_pm_' + Date.now();
    state.customPaymentMethods.push({ id, icon, label, isDefault: false });

    document.getElementById('new-method-icon').value = '';
    document.getElementById('new-method-label').value = '';

    saveState();
    renderPaymentMethodsList();
    renderPaymentMethodsSelect();
  };

  window.editCustomPaymentMethod = function(id) {
    if (!state.customPaymentMethods) return;
    const m = state.customPaymentMethods.find(x => x.id === id);
    if (!m) return;

    const newLabel = prompt('Nuevo nombre:', m.label);
    if (newLabel === null) return;
    if (!newLabel.trim()) return alert('El nombre no puede estar vacío');

    const newIcon = prompt('Nuevo emoji:', m.icon);
    if (newIcon === null) return;

    m.label = newLabel.trim();
    m.icon = newIcon.trim() || '💳';

    saveState();
    renderPaymentMethodsList();
    renderPaymentMethodsSelect();
    renderTransactions();
  };

  window.deleteCustomPaymentMethod = function(id) {
    if (!state.customPaymentMethods) return;
    const m = state.customPaymentMethods.find(x => x.id === id);
    if (!m) return;

    let inUse = 0;
    Object.values(state.transactions || {}).forEach(arr => {
      arr.forEach(t => { if (t.paymentMethod === id) inUse++; });
    });

    let msg = `¿Eliminar el método "${m.label}"?`;
    if (inUse > 0) msg += `\n\n⚠️ Tienes ${inUse} transacción(es) con este método. Se moverán a "Efectivo".`;
    if (!confirm(msg)) return;

    state.customPaymentMethods = state.customPaymentMethods.filter(x => x.id !== id);
    Object.values(state.transactions || {}).forEach(arr => {
      arr.forEach(t => { if (t.paymentMethod === id) t.paymentMethod = 'efectivo'; });
    });

    saveState();
    renderPaymentMethodsList();
    renderPaymentMethodsSelect();
    renderTransactions();
  };

  // INGRESOS EXTRAS (no recurrentes)
  window.addExtraIncome = function() {
    const desc = document.getElementById('extra-desc').value.trim();
    const amount = parseFloat(document.getElementById('extra-amount').value);
    const source = document.getElementById('extra-source').value;
    const date = document.getElementById('extra-date').value || new Date().toISOString().split('T')[0];
    const pocketId = document.getElementById('extra-pocket') ? document.getElementById('extra-pocket').value : '';
    if (!desc || !amount || amount <= 0) return alert('Completa descripción y monto');

    const month = date.substring(0, 7);
    if (!state.extraIncomes) state.extraIncomes = {};
    if (!state.extraIncomes[month]) state.extraIncomes[month] = [];

    let pocketIdNum = null;
    if (pocketId) {
      pocketIdNum = parseInt(pocketId);
      const pocket = state.pockets.find(x => x.id === pocketIdNum);
      if (pocket) {
        pocket.amount = pocket.amount + amount;
      }
    }

    state.extraIncomes[month].push({
      id: Date.now(), date, desc, amount, source, pocketId: pocketIdNum
    });

    document.getElementById('extra-desc').value = '';
    document.getElementById('extra-amount').value = '';
    if (document.getElementById('extra-pocket')) document.getElementById('extra-pocket').value = '';
    saveState();
    populateExtraMonths();
    populatePocketsSelector();
    renderExtraIncomes();
    renderResumen();
    renderPockets();
  };

  window.removeExtraIncome = function(month, id) {
    if (state.extraIncomes && state.extraIncomes[month]) {
      const extra = state.extraIncomes[month].find(e => e.id === id);
      if (extra && extra.pocketId) {
        const pocket = state.pockets.find(x => x.id === extra.pocketId);
        if (pocket) {
          pocket.amount = Math.max(0, pocket.amount - extra.amount);
        }
      }
      state.extraIncomes[month] = state.extraIncomes[month].filter(e => e.id !== id);
      saveState();
      populatePocketsSelector();
      renderExtraIncomes();
      renderResumen();
      renderPockets();
    }
  };

  let currentExtraMonth = currentMonth;

  function populateExtraMonths() {
    const sel = document.getElementById('extra-month-select');
    if (!sel) return;
    const all = new Set([currentMonth, currentExtraMonth, ...Object.keys(state.extraIncomes || {})]);
    const sorted = Array.from(all).filter(Boolean).sort().reverse();
    sel.innerHTML = sorted.map(m => `<option value="${m}" ${m === currentExtraMonth ? 'selected' : ''}>${getMonthLabel(m)}</option>`).join('');
    sel.onchange = (e) => {
      currentExtraMonth = e.target.value;
      renderExtraIncomes();
    };
  }

  function renderExtraIncomes() {
    const list = document.getElementById('extra-list');
    if (!list) return;

    // Combinar tipos por defecto + tipos personalizados del usuario
    const SOURCE_INFO = getIncomeTypesAsMap();

    const extras = ((state.extraIncomes || {})[currentExtraMonth] || []).slice().sort((a, b) => b.date.localeCompare(a.date));

    if (extras.length === 0) {
      list.innerHTML = `
        <div class="empty-state-fancy">
          <div class="empty-state-icon">💸</div>
          <h3 class="empty-state-title">Sin ingresos extras en ${getMonthLabel(currentExtraMonth)}</h3>
          <p class="empty-state-message">
            Cuando recibas un bono, regalo, devolución o pago freelance, regístralo aquí
            para que tu margen sea más preciso.
          </p>
        </div>
      `;
    } else {
      list.innerHTML = extras.map(e => {
        const src = SOURCE_INFO[e.source] || { icon: '📌', label: 'Otro' };
        const d = new Date(e.date + 'T00:00:00');
        const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
        const pocket = e.pocketId ? state.pockets.find(p => p.id === e.pocketId) : null;
        const pocketStr = pocket ? ` → ${pocket.icon} ${esc(pocket.name)}` : '';
        return `<div class="tx-row">
          <div class="tx-date">${ds}</div>
          <div>${esc(e.desc)}<br><span style="font-size: 11px; color: var(--text-tertiary);">${src.icon} ${src.label}${pocketStr}</span></div>
          <div style="color: var(--success-text); font-weight: 500;">+${fmt(e.amount)}</div>
          <button class="delete-btn" onclick="removeExtraIncome('${currentExtraMonth}', ${e.id})">×</button>
        </div>`;
      }).join('');
    }

    const extraTotal = totalMonthExtraIncome(currentExtraMonth);
    document.getElementById('extra-total').textContent = extraTotal > 0 ? '+' + fmt(extraTotal) : '—';

    // Total grand: ingresos recurrentes + extras + cashback
    const recurrent = totalIncome();
    const cashback = currentExtraMonth === currentMonth ? totalMonthCashback() : 0;
    const grandTotal = recurrent + extraTotal + cashback;
    document.getElementById('extra-grand-total').textContent = fmt(grandTotal);
  }

  // Plantillas de tarjetas colombianas (datos típicos de mercado abr 2026)
  const CARD_TEMPLATES = {
    // Lulo Bank
    lulo_master: {
      name: 'Lulo Bank Mastercard',
      bank: 'lulo', brand: 'mastercard', cutoffDay: 5, rate: 24,
      cashback: 1, benefits: '1% cashback en todas las compras + sin cuota de manejo'
    },
    // Davivienda
    rappicard_visa: {
      name: 'RappiCard Davivienda VISA',
      bank: 'davivienda', brand: 'visa', cutoffDay: 28, rate: 26,
      cashback: 1, benefits: '1% cashback general, 3% en Rappi + sin cuota de manejo'
    },
    davivienda_clasica: {
      name: 'Davivienda Clásica',
      bank: 'davivienda', brand: 'visa', cutoffDay: 15, rate: 27,
      cashback: 0, benefits: 'Cuota de manejo aplica'
    },
    davivienda_oro: {
      name: 'Davivienda Oro',
      bank: 'davivienda', brand: 'visa', cutoffDay: 15, rate: 26,
      cashback: 0.5, benefits: 'Programa Daviplata Puntos'
    },
    davivienda_platinum: {
      name: 'Davivienda Platinum',
      bank: 'davivienda', brand: 'visa', cutoffDay: 15, rate: 25,
      cashback: 1, benefits: 'Acceso a salas VIP + seguros'
    },
    // Bancolombia
    bancolombia_clasica: {
      name: 'Bancolombia Clásica',
      bank: 'bancolombia', brand: 'mastercard', cutoffDay: 18, rate: 27,
      cashback: 0, benefits: 'Cuota de manejo aplica'
    },
    bancolombia_oro: {
      name: 'Bancolombia Oro',
      bank: 'bancolombia', brand: 'mastercard', cutoffDay: 18, rate: 26,
      cashback: 0.5, benefits: 'Puntos Colombia'
    },
    bancolombia_platinum: {
      name: 'Bancolombia Platinum',
      bank: 'bancolombia', brand: 'mastercard', cutoffDay: 18, rate: 25,
      cashback: 1, benefits: 'Salas VIP + Puntos Colombia 2x'
    },
    bancolombia_amex: {
      name: 'Bancolombia American Express',
      bank: 'bancolombia', brand: 'amex', cutoffDay: 18, rate: 26,
      cashback: 1.5, benefits: 'Membership Rewards + beneficios premium'
    },
    // BBVA
    bbva_aqua: {
      name: 'BBVA Aqua',
      bank: 'bbva', brand: 'visa', cutoffDay: 20, rate: 26,
      cashback: 0, benefits: 'Tarjeta sin numeración visible (más segura)'
    },
    bbva_oro: {
      name: 'BBVA Oro',
      bank: 'bbva', brand: 'visa', cutoffDay: 20, rate: 26,
      cashback: 0.5, benefits: 'Programa BBVA Puntos'
    },
    bbva_platinum: {
      name: 'BBVA Platinum',
      bank: 'bbva', brand: 'visa', cutoffDay: 20, rate: 25,
      cashback: 1, benefits: 'Salas VIP + seguros premium'
    },
    // Banco de Bogotá
    bogota_clasica: {
      name: 'Banco de Bogotá Clásica',
      bank: 'bogota', brand: 'visa', cutoffDay: 12, rate: 27,
      cashback: 0, benefits: 'Cuota de manejo aplica'
    },
    bogota_oro: {
      name: 'Banco de Bogotá Oro',
      bank: 'bogota', brand: 'visa', cutoffDay: 12, rate: 26,
      cashback: 0.5, benefits: 'Programa Aliados'
    },
    bogota_lifemiles: {
      name: 'Banco de Bogotá LifeMiles',
      bank: 'bogota', brand: 'visa', cutoffDay: 12, rate: 25,
      cashback: 0, benefits: '1.5 millas LifeMiles por cada $1.000 pesos'
    },
    // Tuya
    tuya_exito: {
      name: 'Tuya Éxito Mastercard',
      bank: 'tuya', brand: 'mastercard', cutoffDay: 8, rate: 28,
      cashback: 0, benefits: 'Descuentos exclusivos en Éxito y aliados + Puntos Colombia'
    },
    tuya_carulla: {
      name: 'Tuya Carulla Mastercard',
      bank: 'tuya', brand: 'mastercard', cutoffDay: 8, rate: 28,
      cashback: 0, benefits: 'Descuentos en Carulla + Puntos Colombia'
    },
    tuya_alkosto: {
      name: 'Tuya Alkosto',
      bank: 'tuya', brand: 'mastercard', cutoffDay: 8, rate: 28,
      cashback: 0, benefits: 'Compras a cuotas en Alkosto sin intereses'
    },
    // AV Villas
    avvillas_clasica: {
      name: 'AV Villas Clásica',
      bank: 'avvillas', brand: 'visa', cutoffDay: 10, rate: 27,
      cashback: 0, benefits: 'Programa AV Villas Premia'
    },
    avvillas_oro: {
      name: 'AV Villas Oro',
      bank: 'avvillas', brand: 'visa', cutoffDay: 10, rate: 26,
      cashback: 0.5, benefits: 'AV Villas Premia + descuentos'
    },
    // Scotiabank Colpatria
    colpatria_clasica: {
      name: 'Scotiabank Colpatria Clásica',
      bank: 'colpatria', brand: 'mastercard', cutoffDay: 22, rate: 27,
      cashback: 0, benefits: 'Programa Scotia Recompensa'
    },
    colpatria_oro: {
      name: 'Scotiabank Colpatria Oro',
      bank: 'colpatria', brand: 'mastercard', cutoffDay: 22, rate: 26,
      cashback: 0.5, benefits: 'Scotia Recompensa Plus'
    },
    colpatria_platinum: {
      name: 'Scotiabank Colpatria Platinum',
      bank: 'colpatria', brand: 'mastercard', cutoffDay: 22, rate: 25,
      cashback: 1, benefits: 'Salas VIP + Priority Pass'
    },
    // Falabella
    falabella_cmr: {
      name: 'Banco Falabella CMR',
      bank: 'falabella', brand: 'cmr', cutoffDay: 5, rate: 28,
      cashback: 0, benefits: 'Descuentos exclusivos en Falabella, Sodimac, Tottus'
    },
    falabella_visa: {
      name: 'Banco Falabella VISA',
      bank: 'falabella', brand: 'visa', cutoffDay: 5, rate: 27,
      cashback: 0.5, benefits: 'CMR Puntos + descuentos'
    },
    // Itaú
    itau_clasica: {
      name: 'Itaú Clásica',
      bank: 'itau', brand: 'visa', cutoffDay: 17, rate: 27,
      cashback: 0, benefits: 'Programa Always On'
    },
    itau_oro: {
      name: 'Itaú Oro',
      bank: 'itau', brand: 'visa', cutoffDay: 17, rate: 26,
      cashback: 0.5, benefits: 'Descuentos y promociones'
    },
    itau_platinum: {
      name: 'Itaú Platinum',
      bank: 'itau', brand: 'visa', cutoffDay: 17, rate: 25,
      cashback: 1, benefits: 'Salas VIP + Concierge'
    },
    // Banco Popular
    popular_clasica: {
      name: 'Banco Popular Clásica',
      bank: 'popular', brand: 'visa', cutoffDay: 14, rate: 27,
      cashback: 0, benefits: 'Cuota de manejo aplica'
    },
    popular_oro: {
      name: 'Banco Popular Oro',
      bank: 'popular', brand: 'visa', cutoffDay: 14, rate: 26,
      cashback: 0.5, benefits: 'Beneficios estándar'
    },
    // Otros
    caja_social_clasica: {
      name: 'Banco Caja Social Clásica',
      bank: 'caja_social', brand: 'visa', cutoffDay: 20, rate: 27,
      cashback: 0, benefits: 'Tarjeta tradicional'
    },
    bcsc_clasica: {
      name: 'BCSC Clásica',
      bank: 'bcsc', brand: 'mastercard', cutoffDay: 25, rate: 27,
      cashback: 0, benefits: 'Tarjeta tradicional'
    },
    banco_w: {
      name: 'Banco W',
      bank: 'banco_w', brand: 'mastercard', cutoffDay: 15, rate: 27,
      cashback: 0, benefits: 'Microfinanzas'
    },
    bancoomeva: {
      name: 'Bancoomeva',
      bank: 'bancoomeva', brand: 'visa', cutoffDay: 10, rate: 26,
      cashback: 0, benefits: 'Cooperativa financiera'
    },
    cooperativa_minuto: {
      name: 'Cooperativa Minuto de Dios',
      bank: 'other', brand: 'visa', cutoffDay: 15, rate: 25,
      cashback: 0, benefits: 'Cooperativa con tasas preferenciales'
    },
    nu_colombia: {
      name: 'Nu Colombia',
      bank: 'nu', brand: 'mastercard', cutoffDay: 15, rate: 24,
      cashback: 1, benefits: 'Sin cuota de manejo + 100% digital + cashback'
    }
  };

  window.applyCardTemplate = function() {
    const select = document.getElementById('card-template');
    const template = select.value;
    const infoBox = document.getElementById('card-template-info');

    if (!template || template === 'custom') {
      // Limpiar campos para entrada manual
      if (template === 'custom') {
        ['debt-name', 'debt-balance', 'debt-rate', 'debt-payment', 'debt-cutoff',
         'debt-bank', 'debt-brand', 'debt-digits', 'debt-cashback', 'debt-benefits'].forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            if (el.tagName === 'SELECT') el.value = '';
            else if (id === 'debt-rate' || id === 'debt-cashback') el.value = '0';
            else el.value = '';
          }
        });
        infoBox.style.display = 'none';
      } else {
        infoBox.style.display = 'none';
      }
      return;
    }

    const t = CARD_TEMPLATES[template];
    if (!t) return;

    // Aplicar valores de la plantilla (excepto cupo y saldo que el usuario pone)
    document.getElementById('debt-name').value = t.name;
    document.getElementById('debt-rate').value = t.rate;
    document.getElementById('debt-cutoff').value = t.cutoffDay;
    document.getElementById('debt-bank').value = t.bank;
    document.getElementById('debt-brand').value = t.brand;
    document.getElementById('debt-cashback').value = t.cashback;
    document.getElementById('debt-benefits').value = t.benefits;

    // Mostrar info
    infoBox.style.display = 'block';
    infoBox.innerHTML = `
      <strong>📋 ${t.name}</strong><br>
      💵 Tasa: ${t.rate}% E.A.<br>
      📅 Día de corte estándar: ${t.cutoffDay}<br>
      💰 Cashback: ${t.cashback}%<br>
      ✨ Beneficios: ${t.benefits}<br>
      <small style="color: var(--text-tertiary);">⚠️ Verifica tu día de corte real (puede variar) y agrega tu cupo y saldo.</small>
    `;
  };

  window.addDebt = function() {
    const n = document.getElementById('debt-name').value.trim();
    const b = parseFloat(document.getElementById('debt-balance').value);
    const r = parseFloat(document.getElementById('debt-rate').value) || 0;
    const p = parseFloat(document.getElementById('debt-payment').value) || 0;
    const co = parseInt(document.getElementById('debt-cutoff').value) || null;
    const bank = document.getElementById('debt-bank').value || null;
    const brand = document.getElementById('debt-brand').value || null;
    const lastDigits = document.getElementById('debt-digits').value.trim() || null;
    const cashback = parseFloat(document.getElementById('debt-cashback').value) || 0;
    const benefits = document.getElementById('debt-benefits').value.trim() || null;

    if (!n || isNaN(b) || b < 0) return alert('Completa el nombre y el saldo');
    if (p <= 0) return alert('Define un cupo total mayor a 0');

    state.debts.push({
      id: Date.now(),
      name: n, balance: b, rate: r, payment: p,
      cutoffDay: co, bank, brand, lastDigits,
      cashbackPercent: cashback, benefits
    });

    // Limpiar formulario
    ['debt-name', 'debt-balance', 'debt-payment', 'debt-cutoff', 'debt-bank',
     'debt-brand', 'debt-digits', 'debt-benefits', 'card-template'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'SELECT') el.value = '';
        else el.value = '';
      }
    });
    document.getElementById('debt-rate').value = '0';
    document.getElementById('debt-cashback').value = '0';
    document.getElementById('card-template-info').style.display = 'none';

    saveState(); renderAll();
  };
  window.removeDebt = function(id) { state.debts = state.debts.filter(d => d.id !== id); saveState(); renderAll(); };
  window.updateDebt = function(id, field, val) {
    const d = state.debts.find(x => x.id === id);
    if (d) {
      if (field === 'balance') d.balance = parseFloat(val) || 0;
      else if (field === 'cutoffDay') d.cutoffDay = parseInt(val) || null;
      saveState(); renderResumen(); renderDebts();
    }
  };

  window.addGoal = function() {
    const n = document.getElementById('goal-name').value.trim();
    const t = parseFloat(document.getElementById('goal-target').value);
    const c = parseFloat(document.getElementById('goal-current').value) || 0;
    if (!n || !t || t <= 0) return alert('Completa todo');
    state.goals.push({ id: Date.now(), name: n, target: t, current: c });
    document.getElementById('goal-name').value = '';
    document.getElementById('goal-target').value = '';
    document.getElementById('goal-current').value = '0';
    saveState(); renderAll();
  };
  window.removeGoal = function(id) { state.goals = state.goals.filter(g => g.id !== id); saveState(); renderAll(); };
  window.updateGoal = function(id, c) {
    const g = state.goals.find(x => x.id === id);
    if (g) { g.current = parseFloat(c) || 0; saveState(); renderResumen(); renderGoals(); }
  };

  window.updateBudget = function(catId, v) {
    if (!state.budgets[currentMonth]) state.budgets[currentMonth] = {};
    state.budgets[currentMonth][catId] = parseFloat(v) || 0;
    saveState(); renderBudget();
  };

  window.addTransaction = function() {
    const d = document.getElementById('tx-desc').value.trim();
    const a = parseFloat(document.getElementById('tx-amount').value);
    const c = document.getElementById('tx-category').value;
    const dt = document.getElementById('tx-date').value || new Date().toISOString().split('T')[0];
    const method = document.getElementById('tx-payment-method').value;
    const cardId = document.getElementById('tx-card').value;
    const pocketId = document.getElementById('tx-pocket') ? document.getElementById('tx-pocket').value : '';
    if (!d || !a || a <= 0) return alert('Completa descripción y monto');
    if (method === 'tarjeta' && !cardId) return alert('Selecciona la tarjeta usada');

    const m = dt.substring(0, 7);
    if (!state.transactions[m]) state.transactions[m] = [];

    let cashback = 0;
    let cardIdNum = null;
    let pocketIdNum = null;

    if (method === 'tarjeta' && cardId) {
      cashback = a * 0.01;
      cardIdNum = parseInt(cardId);
      const card = state.debts.find(x => x.id === cardIdNum);
      if (card) {
        card.balance += a;
      }
    } else if (pocketId) {
      // Si NO es tarjeta y se seleccionó bolsillo, descontar del bolsillo
      pocketIdNum = parseInt(pocketId);
      const pocket = state.pockets.find(x => x.id === pocketIdNum);
      if (pocket) {
        if (pocket.amount < a) {
          if (!confirm(`El bolsillo "${pocket.name}" tiene ${fmt(pocket.amount)} pero quieres gastar ${fmt(a)}. ¿Continuar de todas formas? (quedará en negativo)`)) {
            return;
          }
        }
        pocket.amount = pocket.amount - a;
      }
    }

    state.transactions[m].push({
      id: Date.now(),
      date: dt, desc: d, amount: a, category: c,
      paymentMethod: method,
      cardId: cardIdNum,
      pocketId: pocketIdNum,
      cashback: cashback
    });

    document.getElementById('tx-desc').value = '';
    document.getElementById('tx-amount').value = '';
    if (document.getElementById('tx-pocket')) document.getElementById('tx-pocket').value = '';
    document.getElementById('tx-cashback-info').style.display = 'none';
    saveState(); populateMonths(); populatePocketsSelector(); renderBudget(); renderTransactions(); renderResumen(); renderDebts(); renderPockets();
  };

  window.removeTransaction = function(m, id) {
    if (state.transactions[m]) {
      const tx = state.transactions[m].find(t => t.id === id);
      if (tx) {
        // Si fue con tarjeta, revertir saldo
        if (tx.paymentMethod === 'tarjeta' && tx.cardId) {
          const card = state.debts.find(x => x.id === tx.cardId);
          if (card) {
            card.balance = Math.max(0, card.balance - tx.amount);
          }
        }
        // Si descontó de un bolsillo, devolverle el dinero
        if (tx.pocketId) {
          const pocket = state.pockets.find(x => x.id === tx.pocketId);
          if (pocket) {
            pocket.amount = pocket.amount + tx.amount;
          }
        }
      }
      state.transactions[m] = state.transactions[m].filter(t => t.id !== id);
      saveState(); populatePocketsSelector(); renderBudget(); renderTransactions(); renderResumen(); renderDebts(); renderPockets();
    }
  };

  window.resetData = function() {
    const c = prompt('Escribe "reset" para volver a los datos iniciales, o "borrar" para vaciar todo:');
    if (c === 'reset') {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      saveState(); renderAll();
    } else if (c === 'borrar') {
      state = { currency: 'COP', pockets: [], incomes: [], debts: [], goals: [], budgets: {}, transactions: {} };
      saveState(); renderAll();
    }
  };

  function renderPockets() {
    const list = document.getElementById('pocket-list');
    const total = totalPockets();
    
    // Calcular totales dinámicamente según los bolsillos del usuario
    const cashTotal = state.pockets.filter(p => p.isCash || p.bank === 'cash').reduce((s, p) => s + p.amount, 0);
    
    // Bolsillos con rentabilidad (rate > 0)
    const investedPockets = state.pockets.filter(p => !p.isCash && p.bank !== 'cash' && (p.rate || 0) > 0);
    const investedTotal = investedPockets.reduce((s, p) => s + p.amount, 0);
    const avgRate = investedPockets.length > 0 
      ? investedPockets.reduce((s, p) => s + (p.rate * p.amount), 0) / investedTotal 
      : 0;
    
    // Bolsillos sin rentabilidad (cuenta tradicional, billeteras digitales sin renta)
    const noRateTotal = total - cashTotal - investedTotal;

    const cashSummary = document.getElementById('cash-summary');
    if (cashSummary) {
      const hasAnyPocket = state.pockets.length > 0;
      
      if (!hasAnyPocket) {
        cashSummary.innerHTML = '';
      } else {
        let cardsHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 1rem;">';
        
        // Card de inversiones / cuentas con renta (solo si hay)
        if (investedTotal > 0) {
          cardsHtml += `
            <div class="metric-hero">
              <div class="metric-hero-icon green">📈</div>
              <div class="metric-hero-label">Cuentas con rentabilidad</div>
              <p class="metric-hero-value" style="color: var(--success-text);">${fmt(investedTotal)}</p>
              <div class="metric-hero-sub">Promedio ${avgRate.toFixed(2)}% E.A. · ${investedPockets.length} ${investedPockets.length === 1 ? 'bolsillo' : 'bolsillos'}</div>
            </div>
          `;
        }
        
        // Card de cuentas/billeteras sin rentabilidad (solo si hay)
        if (noRateTotal > 0) {
          cardsHtml += `
            <div class="metric-hero">
              <div class="metric-hero-icon" style="background: linear-gradient(135deg, #7F77DD, #6e69c8); color: white;">🏦</div>
              <div class="metric-hero-label">Cuentas / billeteras</div>
              <p class="metric-hero-value" style="color: var(--info-text);">${fmt(noRateTotal)}</p>
              <div class="metric-hero-sub">Sin rentabilidad · disponible</div>
            </div>
          `;
        }
        
        // Card de efectivo (solo si hay)
        if (cashTotal > 0) {
          cardsHtml += `
            <div class="metric-hero">
              <div class="metric-hero-icon" style="background: linear-gradient(135deg, #f4d03f, #d4a017); color: white;">💵</div>
              <div class="metric-hero-label">Efectivo en mano</div>
              <p class="metric-hero-value" style="color: var(--warning-text);">${fmt(cashTotal)}</p>
              <div class="metric-hero-sub">Físico · controla siempre</div>
            </div>
          `;
        }
        
        cardsHtml += '</div>';
        cashSummary.innerHTML = cardsHtml;
      }
    }

    if (state.pockets.length === 0) {
      list.innerHTML = `
        <div class="empty-state-fancy">
          <div class="empty-state-icon">👛</div>
          <h3 class="empty-state-title">Aún no tienes bolsillos</h3>
          <p class="empty-state-message">
            Los bolsillos te ayudan a organizar tu dinero por objetivos:
            ahorros, gastos fijos, fondo de emergencias, etc.
          </p>
          <button class="empty-state-action" onclick="document.getElementById('pocket-name')?.focus()">
            ➕ Crear mi primer bolsillo
          </button>
        </div>
      `;
    } else {
      const sorted = [...state.pockets].sort((a, b) => b.amount - a.amount);
      list.innerHTML = sorted.map(p => {
        const pct = total > 0 ? ((p.amount / total) * 100).toFixed(1) : 0;
        let extraClass = '';
        let subLabel = '';
        
        if (p.isCash || p.bank === 'cash') {
          extraClass = ' cash-pocket';
          subLabel = ' · efectivo';
        } else if (p.bank === 'rappi') {
          extraClass = ' rappi-pocket';
          subLabel = ` · ${p.rate || 9}% E.A.`;
        } else if (p.rate && p.rate > 0) {
          subLabel = ` · ${p.rate}% E.A.`;
        } else if (p.bank && p.bank !== 'generic') {
          // Mostrar nombre del banco si hay
          subLabel = ` · ${getBankLabel(p.bank)}`;
        }
        
        return `<div class="pocket-card${extraClass}">
          <button class="delete-btn pocket-delete" onclick="removePocket(${p.id})">×</button>
          <div style="font-size: 22px; margin-bottom: 8px;">${p.icon}</div>
          <div class="pocket-name">${esc(p.name)}${subLabel}</div>
          <div class="pocket-amount">${fmt(p.amount)}</div>
          <div class="pocket-pct">${pct}% del total</div>
          <input type="number" value="${p.amount}" min="0" step="0.01" onfocus="this.select()" onchange="updatePocket(${p.id}, this.value)" placeholder="Editar saldo" style="margin-top: 10px; height: 36px; font-size: 13px; background: var(--bg-secondary); border: 1px solid var(--border-strong); cursor: text;" />
        </div>`;
      }).join('');
    }
    document.getElementById('pocket-total').textContent = fmt(total);
  }

  // Función auxiliar para obtener el nombre del banco
  function getBankLabel(bankCode) {
    const banks = {
      'generic': 'Cuenta bancaria',
      'cash': 'Efectivo',
      'digital': 'Billetera digital',
      'bancolombia': 'Bancolombia',
      'davivienda': 'Davivienda',
      'bbva': 'BBVA',
      'bogota': 'Banco de Bogotá',
      'popular': 'Banco Popular',
      'caja_social': 'Caja Social',
      'av_villas': 'AV Villas',
      'colpatria': 'Colpatria',
      'occidente': 'Occidente',
      'itau': 'Itaú',
      'lulo': 'Lulo Bank',
      'nu': 'Nu',
      'pichincha': 'Pichincha',
      'agrario': 'Agrario',
      'bancoomeva': 'Bancoomeva',
      'banco_w': 'Banco W',
      'nequi': 'Nequi',
      'daviplata': 'Daviplata',
      'rappipay': 'RappiPay',
      'rappi': 'RappiCard',
      'movii': 'Movii',
      'dale': 'Dale!',
      'tpaga': 'Tpaga',
      'cdt': 'CDT',
      'fondos': 'Fondo',
      'acciones': 'Acciones',
      'crypto': 'Crypto',
      'otro': 'Otro'
    };
    return banks[bankCode] || 'Cuenta';
  }

  function renderIncomes() {
    const list = document.getElementById('income-list');
    if (state.incomes.length === 0) {
      list.innerHTML = `
        <div class="empty-state-fancy">
          <div class="empty-state-icon">💰</div>
          <h3 class="empty-state-title">Sin ingresos registrados</h3>
          <p class="empty-state-message">
            Registra tus ingresos recurrentes (salario, mesada, freelance) para
            calcular tu margen mensual.
          </p>
          <button class="empty-state-action" onclick="document.getElementById('income-name')?.focus()">
            ➕ Agregar mi primer ingreso
          </button>
        </div>
      `;
    } else {
      list.innerHTML = state.incomes.map(i => `<div class="item-row">
        <div><strong>${esc(i.name)}</strong></div>
        <div>${fmt(i.amount)}</div>
        <div><span class="badge badge-income">${freqLabel(i.frequency)}</span></div>
        <button class="delete-btn" onclick="removeIncome(${i.id})">×</button>
      </div>`).join('');
    }
    document.getElementById('income-total').textContent = fmt(totalIncome());
  }

  // SVGs de logos
  const VISA_LOGO = `<svg viewBox="0 0 1000 324" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M433.4 6.9L284.7 318.1h-97L114.6 35.5c-4.4-17.5-8.3-23.9-21.9-31.3C70.5-7.9 33.7-19.3 0-26.7L2.2-37h156.2c19.9 0 37.8 13.3 42.3 36.2l38.7 205.7L335.6 6.9h97.8zm383.9 209.5c.4-94.6-130.7-99.8-129.9-142.1.3-12.9 12.5-26.5 39.4-30 13.3-1.7 49.9-3.1 91.4 16l16.2-75.7C812 -22.8 783 -32 747.2-32 656 -32 591.7 16.5 591.2 86c-.6 51.4 45.9 80 80.9 97.1 36.1 17.5 48.2 28.7 48.1 44.4-.3 24-28.7 34.6-55.3 35-46.4.7-73.4-12.5-94.9-22.5l-16.7 78.3c21.6 9.9 61.4 18.5 102.6 18.9 96.9 0 160.3-47.9 160.6-122zm240.9 101.7H1144l-74.5-311.2h-78.8c-17.7 0-32.7 10.3-39.3 26.1L811.7 318.1h96.8l19.2-53.3h118.3l11.2 53.3zM954.2 192l48.5-133.7L1030.6 192H954.2zM565.2 6.9L489 318.1h-92.2L473 6.9h92.2z"/></svg>`;

  const MASTERCARD_LOGO = `<svg viewBox="0 0 152 108" xmlns="http://www.w3.org/2000/svg">
    <circle cx="56" cy="54" r="48" fill="#EB001B"/>
    <circle cx="96" cy="54" r="48" fill="#F79E1B"/>
    <path d="M76 18c-12 9-20 22-20 36s8 27 20 36c12-9 20-22 20-36s-8-27-20-36z" fill="#FF5F00"/>
  </svg>`;

  const DAVIVIENDA_LOGO = `<div style="display: flex; align-items: center; gap: 6px; background: white; padding: 4px 10px; border-radius: 4px;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#c8102e"><path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/></svg>
    <span style="color: #c8102e; font-size: 11px; font-weight: 700; letter-spacing: -0.3px;">Davivienda</span>
  </div>`;

  const LULO_LOGO = `<div style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.95); padding: 4px 10px; border-radius: 4px;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#d4ff3a"><circle cx="12" cy="12" r="10" fill="#0a0e27"/><circle cx="12" cy="12" r="5" fill="#d4ff3a"/></svg>
    <span style="color: #0a0e27; font-size: 11px; font-weight: 700; letter-spacing: -0.3px;">lulo bank</span>
  </div>`;

  const BANK_INFO = {
    davivienda: { name: 'Davivienda', logo: DAVIVIENDA_LOGO, cardClass: 'visa-davivienda' },
    lulo: { name: 'Lulo Bank', logo: LULO_LOGO, cardClass: 'mastercard-lulo' }
  };

  const BRAND_INFO = {
    visa: { name: 'VISA', logo: VISA_LOGO },
    mastercard: { name: 'Mastercard', logo: MASTERCARD_LOGO }
  };

  function renderDebts() {
    const list = document.getElementById('debt-list');
    const debt = totalDebt(), limit = totalLimit();
    if (state.debts.length === 0) {
      list.innerHTML = `
        <div class="empty-state-fancy">
          <div class="empty-state-icon">💳</div>
          <h3 class="empty-state-title">Sin tarjetas registradas</h3>
          <p class="empty-state-message">
            Registra tus tarjetas de crédito para hacer seguimiento de cupos,
            cashback y mejorar tu score crediticio.
          </p>
          <button class="empty-state-action" onclick="document.getElementById('card-template')?.focus()">
            ➕ Agregar mi primera tarjeta
          </button>
        </div>
      `;
    } else {
      list.innerHTML = '<div class="cards-grid">' + state.debts.map(d => {
        const u = d.payment > 0 ? ((d.balance / d.payment) * 100).toFixed(1) : 0;
        const bank = BANK_INFO[d.bank] || { name: '', logo: '', cardClass: '' };
        const brand = BRAND_INFO[d.brand] || { name: '', logo: '' };
        const lastDigits = d.lastDigits || d.id.toString().slice(-4);

        return `<div class="credit-card ${bank.cardClass}">
          <div class="credit-card-top">
            ${bank.logo || `<div class="credit-card-bank-name">${esc(d.name)}</div>`}
            <div class="credit-card-info-label" style="text-align: right;">CUPO TOTAL<br><span class="credit-card-info-value">${fmt(d.payment)}</span></div>
          </div>
          <div>
            <div class="credit-card-chip"></div>
            <div class="credit-card-number">•••• •••• •••• ${lastDigits}</div>
            <div class="credit-card-bottom">
              <div>
                <div class="credit-card-info-label">Saldo actual</div>
                <div class="credit-card-info-value">${fmt(d.balance)}</div>
              </div>
              <div class="credit-card-brand">${brand.logo}</div>
            </div>
          </div>
        </div>`;
      }).join('') + '</div>';

      // Detalles editables debajo de las tarjetas
      list.innerHTML += state.debts.map(d => {
        const u = d.payment > 0 ? ((d.balance / d.payment) * 100).toFixed(1) : 0;
        const cutoffInfo = d.cutoffDay ? getCutoffStatus(d.cutoffDay, d.balance, d.payment) : null;
        const cardStats = getCardMonthStats(d.id);
        const bank = BANK_INFO[d.bank] || { name: 'Banco' };
        const brand = BRAND_INFO[d.brand] || { name: 'Tarjeta' };

        // Determinar si necesita pago para mantener utilización ≤3%
        let utilizationAlert = '';
        if (cutoffInfo && cutoffInfo.needsPayment && cutoffInfo.daysLeft <= 10) {
          const recommendedPayment = cutoffInfo.paymentNeeded;
          const targetMax = cutoffInfo.targetMaxBalance;
          utilizationAlert = `<div style="margin-top: 8px; padding: 10px 12px; background: linear-gradient(135deg, var(--warning-bg), var(--info-bg)); border-left: 3px solid var(--warning-text); border-radius: var(--radius-md); font-size: 12px;">
            <div style="font-weight: 600; color: var(--warning-text); margin-bottom: 4px;">💡 Pago recomendado para mantener score óptimo</div>
            <div style="color: var(--text-primary);">Saldo actual: <strong>${fmt(d.balance)}</strong> (${u}% utilización)</div>
            <div style="color: var(--text-primary);">Objetivo: mantener saldo ≤ <strong>${fmt(targetMax)}</strong> (3% utilización)</div>
            <div style="color: var(--success-text); font-weight: 600; margin-top: 4px;">→ Paga <strong>${fmt(recommendedPayment)}</strong> antes del ${cutoffInfo.dateStr}</div>
          </div>`;
        } else if (cutoffInfo && !cutoffInfo.needsPayment && cutoffInfo.daysLeft <= 10) {
          utilizationAlert = `<div style="margin-top: 8px; padding: 10px 12px; background: var(--success-bg); border-left: 3px solid var(--success-text); border-radius: var(--radius-md); font-size: 12px; color: var(--success-text);">
            <strong>✅ Utilización óptima:</strong> Tu saldo de ${fmt(d.balance)} (${u}%) está debajo del 3% objetivo. No necesitas pago anticipado.
          </div>`;
        }

        return `<div class="card-detail-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <strong style="font-size: 14px;">${esc(d.name)} · ${brand.name}</strong>
            <span style="font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--bg-secondary); color: var(--text-secondary);">${bank.name}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
            <span>Utilización: <strong>${u}%</strong></span>
            <span>Disponible: <strong>${fmt(d.payment - d.balance)}</strong></span>
          </div>
          <div class="progress-bar"><div class="progress-fill ${u > 30 ? 'warning' : (u > 10 ? 'warning' : 'success')}" style="width: ${Math.min(100, u)}%"></div></div>
          ${cutoffInfo ? `<div style="margin-top: 10px; padding: 8px 10px; background: ${cutoffInfo.bg}; color: ${cutoffInfo.color}; border-radius: var(--radius-md); font-size: 12px;">${cutoffInfo.icon} ${cutoffInfo.text}</div>` : ''}
          ${utilizationAlert}
          ${cardStats.txCount > 0 ? `<div style="margin-top: 8px; padding: 10px 12px; background: var(--bg-secondary); border-radius: var(--radius-md); font-size: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: var(--text-secondary);">📊 Compras este mes:</span><span style="font-weight: 500;">${cardStats.txCount} (${fmt(cardStats.totalSpent)})</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">💰 Cashback ganado:</span><span style="font-weight: 500; color: var(--success-text);">+${fmt(cardStats.totalCashback)}</span></div>
          </div>` : ''}
          <div style="display: grid; grid-template-columns: 1fr 100px auto auto; gap: 8px; margin-top: 10px; align-items: center;">
            <input type="number" value="${d.balance}" min="0" step="0.01" onchange="updateDebt(${d.id}, 'balance', this.value)" placeholder="Saldo" />
            <input type="number" value="${d.cutoffDay || ''}" min="1" max="31" onchange="updateDebt(${d.id}, 'cutoffDay', this.value)" placeholder="Día corte" title="Día del mes que cierra el periodo" />
            <span style="font-size: 11px; color: var(--text-tertiary); align-self: center;">corte</span>
            <button class="delete-btn" onclick="removeDebt(${d.id})">×</button>
          </div>
        </div>`;
      }).join('');
    }
    document.getElementById('debt-total').textContent = fmt(debt);
    document.getElementById('debt-available').textContent = fmt(limit - debt);
    document.getElementById('debt-utilization').textContent = limit > 0 ? ((debt / limit) * 100).toFixed(1) + '%' : '—';

    const totalCashbackMonth = state.debts.reduce((s, d) => s + getCardMonthStats(d.id).totalCashback, 0);
    const cashbackEl = document.getElementById('cashback-total');
    if (cashbackEl) cashbackEl.textContent = totalCashbackMonth > 0 ? '+' + fmt(totalCashbackMonth) : '—';
  }

  function getCardMonthStats(cardId) {
    const txs = state.transactions[currentMonth] || [];
    const cardTxs = txs.filter(t => t.cardId === cardId);
    const totalSpent = cardTxs.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const totalCashback = cardTxs.reduce((s, t) => s + (parseFloat(t.cashback) || 0), 0);
    return { txCount: cardTxs.length, totalSpent, totalCashback };
  }

  function getCutoffStatus(cutoffDay, cardBalance, cardLimit) {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Calcular próxima fecha de corte
    let nextCutoff;
    if (currentDay <= cutoffDay) {
      nextCutoff = new Date(currentYear, currentMonth, cutoffDay);
    } else {
      nextCutoff = new Date(currentYear, currentMonth + 1, cutoffDay);
    }

    const daysLeft = Math.ceil((nextCutoff - today) / (1000 * 60 * 60 * 24));
    const dateStr = nextCutoff.toLocaleDateString('es-CO', { day: '2-digit', month: 'long' });

    // Calcular utilización actual y cuánto debe pagar para mantener <3%
    const TARGET_UTILIZATION = 3; // % objetivo para mantener score óptimo
    const targetMaxBalance = cardLimit ? (cardLimit * TARGET_UTILIZATION / 100) : 0;
    const utilization = (cardLimit && cardLimit > 0) ? (cardBalance / cardLimit) * 100 : 0;
    const needsPayment = cardBalance > targetMaxBalance;
    const paymentNeeded = needsPayment ? cardBalance - targetMaxBalance : 0;

    let baseInfo;
    if (daysLeft <= 0) {
      baseInfo = { icon: '🚨', text: `¡HOY es el corte (${dateStr})!`, bg: 'var(--danger-bg)', color: 'var(--danger-text)', priority: 'high' };
    } else if (daysLeft <= 3) {
      baseInfo = { icon: '⚠️', text: `Corte en ${daysLeft} día${daysLeft > 1 ? 's' : ''} (${dateStr})`, bg: 'var(--warning-bg)', color: 'var(--warning-text)', priority: 'high' };
    } else if (daysLeft <= 7) {
      baseInfo = { icon: '🔔', text: `Corte en ${daysLeft} días (${dateStr})`, bg: 'var(--info-bg)', color: 'var(--info-text)', priority: 'medium' };
    } else {
      baseInfo = { icon: '📅', text: `Próximo corte: ${dateStr} (en ${daysLeft} días)`, bg: 'var(--bg-secondary)', color: 'var(--text-secondary)', priority: 'low' };
    }

    return {
      ...baseInfo,
      daysLeft,
      dateStr,
      utilization,
      targetMaxBalance,
      needsPayment,
      paymentNeeded,
      cardBalance,
      cardLimit
    };
  }

  function renderGoals() {
    const list = document.getElementById('goal-list');
    if (state.goals.length === 0) {
      list.innerHTML = `
        <div class="empty-state-fancy">
          <div class="empty-state-icon">🎯</div>
          <h3 class="empty-state-title">Aún no tienes metas</h3>
          <p class="empty-state-message">
            Define metas de ahorro: vacaciones, casa, carro, fondo de emergencia.
            ¡Te ayudaremos a llegar!
          </p>
          <button class="empty-state-action" onclick="document.getElementById('goal-name')?.focus()">
            🎯 Crear mi primera meta
          </button>
        </div>
      `; return;
    }
    list.innerHTML = state.goals.map(g => {
      const pct = Math.min(100, Math.round((g.current / g.target) * 100));
      const rem = Math.max(0, g.target - g.current);
      return `<div style="padding: 14px 0; border-bottom: 0.5px solid var(--border);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <strong style="font-size: 14px;">${esc(g.name)}</strong>
          <span style="font-size: 12px; color: var(--text-secondary);">${pct}%</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">
          <span>${fmt(g.current)} de ${fmt(g.target)}</span>
          <span>Faltan ${fmt(rem)}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill success" style="width: ${pct}%"></div></div>
        <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 8px; margin-top: 10px;">
          <input type="number" value="${g.current}" min="0" step="0.01" onchange="updateGoal(${g.id}, this.value)" />
          <span style="font-size: 11px; color: var(--text-tertiary); align-self: center;">actualizar</span>
          <button class="delete-btn" onclick="removeGoal(${g.id})">×</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderBudget() {
    if (!state.budgets[currentMonth]) state.budgets[currentMonth] = { ...DEFAULT_BUDGETS };
    const b = state.budgets[currentMonth];
    const list = document.getElementById('budget-list');
    const editList = document.getElementById('budget-edit');
    const sum = document.getElementById('budget-summary');
    if (!list) return;

    let tBudget = 0, tSpent = 0;
    let html = '', editHtml = '';

    CATEGORIES.forEach(cat => {
      const bg = b[cat.id] || 0;
      const sp = spentByCategory(cat.id);
      const av = bg - sp;
      const hasBudget = bg > 0;
      const pct = hasBudget ? Math.min(100, (sp / bg) * 100) : 0;
      tBudget += bg; tSpent += sp;
      let cls = 'ok';
      if (hasBudget && pct >= 100) cls = 'over';
      else if (hasBudget && pct >= 80) cls = 'warn';
      
      let status;
      if (!hasBudget) {
        status = sp > 0 ? 'Sin límite (solo seguimiento)' : 'Sin gastos';
      } else {
        status = pct >= 100 ? `Excediste ${fmt(sp - bg)}` : `${pct.toFixed(0)}% usado`;
      }

      // Si no hay presupuesto pero sí hay gastos, mostrar barra neutral
      const barWidth = hasBudget ? pct : (sp > 0 ? 100 : 0);
      const barClass = hasBudget ? cls : 'tracking';

      html += `<div class="budget-row">
        <div>${cat.icon} ${cat.label}</div>
        <div>${hasBudget ? fmt(bg) : '<span style="color: var(--text-tertiary); font-style: italic; font-size: 12px;">Sin límite</span>'}</div>
        <div class="budget-bar-cell">
          <span>${fmt(sp)}</span>
          <div class="budget-bar"><div class="budget-fill ${barClass}" style="width: ${barWidth}%"></div></div>
          <span class="budget-status ${barClass}" style="font-size: 11px;">${status}</span>
        </div>
        <div style="text-align: right; font-weight: 500;" class="${hasBudget && av < 0 ? 'balance-negative' : (hasBudget ? 'balance-positive' : '')}">${hasBudget ? fmt(av) : '—'}</div>
      </div>`;

      editHtml += `<div class="budget-edit-item ${hasBudget ? 'has-budget' : 'no-budget'} ${cls === 'over' ? 'over-budget' : ''}">
        <div class="budget-edit-header">
          <span class="budget-edit-cat">${cat.icon} ${cat.label}</span>
          <span class="budget-edit-status">${sp > 0 ? fmt(sp) : '—'}</span>
        </div>
        <div class="budget-edit-input-row">
          <input type="number" value="${bg || ''}" min="0" step="1000" onchange="updateBudget('${cat.id}', this.value)" placeholder="Sin límite" class="budget-edit-input" />
          ${hasBudget ? `<button onclick="updateBudget('${cat.id}', 0)" class="budget-edit-clear" title="Quitar límite">✕</button>` : ''}
        </div>
        ${hasBudget ? `<div class="budget-edit-bar"><div class="budget-edit-fill ${cls}" style="width: ${Math.min(100, pct)}%"></div></div>` : ''}
      </div>`;
    });

    list.innerHTML = html;
    editList.innerHTML = editHtml;
    document.getElementById('budget-total').textContent = fmt(tBudget);
    document.getElementById('budget-spent-total').textContent = fmt(tSpent);
    const av = tBudget - tSpent;
    const avEl = document.getElementById('budget-available-total');
    avEl.textContent = fmt(av);
    avEl.style.color = av >= 0 ? 'var(--success-text)' : 'var(--danger-text)';

    const inc = totalIncome();
    const margin = inc - tSpent;
    const projMargin = inc - tBudget;
    sum.innerHTML = `<div class="fin-grid-4">
      <div class="metric-card"><div class="metric-label">Ingreso del mes</div><div class="metric-value" style="color: var(--success-text);">${fmt(inc)}</div></div>
      <div class="metric-card"><div class="metric-label">Presupuesto total</div><div class="metric-value" style="color: var(--info-text);">${fmt(tBudget)}</div></div>
      <div class="metric-card"><div class="metric-label">Gastado hasta hoy</div><div class="metric-value" style="color: var(--danger-text);">${fmt(tSpent)}</div></div>
      <div class="metric-card"><div class="metric-label">Margen real</div><div class="metric-value ${margin >= 0 ? 'balance-positive' : 'balance-negative'}">${fmt(margin)}</div><div class="metric-sub">Si gastas todo: ${fmt(projMargin)}</div></div>
    </div>`;
  }

  function renderTransactions() {
    const list = document.getElementById('tx-list');
    if (!list) return;
    const txs = (state.transactions[currentMonth] || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    if (txs.length === 0) {
      list.innerHTML = `
        <div class="empty-state-fancy">
          <div class="empty-state-icon">📝</div>
          <h3 class="empty-state-title">Sin movimientos en ${getMonthLabel(currentMonth)}</h3>
          <p class="empty-state-message">
            Registra tus gastos para hacer seguimiento del presupuesto y
            descubrir patrones de consumo.
          </p>
          <button class="empty-state-action" onclick="document.getElementById('tx-desc')?.focus()">
            💸 Registrar primer gasto
          </button>
        </div>
      `;
      return;
    }

    const PAYMENT_METHODS = getPaymentMethodsAsMap();

    list.innerHTML = txs.map(t => {
      const cat = CATEGORIES.find(c => c.id === t.category) || { icon: '📋', label: 'Otros' };
      const d = new Date(t.date + 'T00:00:00');
      const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
      const method = PAYMENT_METHODS[t.paymentMethod] || { icon: '💵', label: 'Efectivo' };
      const card = t.cardId ? state.debts.find(x => x.id === t.cardId) : null;
      const pocket = t.pocketId ? state.pockets.find(x => x.id === t.pocketId) : null;
      const cashbackStr = t.cashback > 0 ? `<span style="color: var(--success-text); font-size: 11px;"> · +${fmt(t.cashback)} cashback</span>` : '';
      let methodStr;
      if (card) {
        methodStr = `${method.icon} ${esc(card.name)}`;
      } else if (pocket) {
        methodStr = `${method.icon} ${method.label} desde ${pocket.icon} ${esc(pocket.name)}`;
      } else {
        methodStr = `${method.icon} ${method.label}`;
      }

      return `<div class="tx-row" data-tx-id="${t.id}" data-tx-desc="${esc(t.desc).toLowerCase()}" data-tx-category="${t.category}" data-tx-method="${t.paymentMethod || ''}" data-tx-date="${t.date}">
        <div class="tx-date">${ds}</div>
        <div>${esc(t.desc)}<br><span style="font-size: 11px; color: var(--text-tertiary);">${cat.icon} ${cat.label} · ${methodStr}${cashbackStr}</span></div>
        <div style="color: var(--danger-text); font-weight: 500;">${fmt(t.amount)}</div>
        <button class="delete-btn" onclick="removeTransaction('${currentMonth}', ${t.id})">×</button>
      </div>`;
    }).join('');
  }

  function renderResumen() {
    // Actualizar checklist de onboarding
    if (typeof window.updateOnboardingChecklist === 'function') {
      window.updateOnboardingChecklist();
    }
    
    const sav = totalPockets();
    const incRecurrent = totalIncome();
    const incExtras = totalMonthExtraIncome();
    const incCashback = totalMonthCashback();
    const inc = incRecurrent + incExtras + incCashback;
    const debt = totalDebt();
    const nw = sav - debt;
    const spent = totalSpent();
    const budget = totalBudget();
    const exp = spent > 0 ? spent : budget;
    const bal = inc - exp;

    document.getElementById('net-worth').textContent = fmt(nw);
    document.getElementById('net-worth-detail').textContent = `Ahorros ${fmt(sav)} − Deudas ${fmt(debt)}`;
    document.getElementById('m-savings').textContent = sav > 0 ? fmt(sav) : '—';
    if (exp > 0) document.getElementById('m-savings-detail').textContent = `Cubre ${(sav/exp).toFixed(1)} meses de gastos`;

    document.getElementById('m-income').textContent = inc > 0 ? fmt(inc) : '—';
    const incomeBreakdown = [];
    if (incRecurrent > 0) incomeBreakdown.push(`Salario ${fmt(incRecurrent)}`);
    if (incExtras > 0) incomeBreakdown.push(`Extras +${fmt(incExtras)}`);
    if (incCashback > 0) incomeBreakdown.push(`Cashback +${fmt(incCashback)}`);
    const incomeMetric = document.getElementById('m-income');
    if (incomeMetric && incomeBreakdown.length > 1) {
      const sub = incomeMetric.parentElement.querySelector('.metric-hero-sub');
      if (!sub) {
        const newSub = document.createElement('div');
        newSub.className = 'metric-hero-sub';
        newSub.id = 'm-income-detail';
        incomeMetric.parentElement.appendChild(newSub);
      }
      const subEl = document.getElementById('m-income-detail') || incomeMetric.parentElement.querySelector('.metric-hero-sub');
      if (subEl) subEl.textContent = incomeBreakdown.join(' · ');
    }

    document.getElementById('m-expense').textContent = exp > 0 ? fmt(exp) : '—';
    document.getElementById('m-margin').textContent = (inc > 0 || exp > 0) ? fmt(bal) : '—';
    document.getElementById('m-margin').style.color = bal >= 0 ? 'var(--success-text)' : 'var(--danger-text)';
    if (inc > 0) {
      document.getElementById('m-savings-rate').textContent = `Tasa ahorro: ${((bal/inc)*100).toFixed(0)}%`;
      document.getElementById('m-margin-detail').textContent = spent > 0 ? 'Basado en gastos reales' : 'Basado en presupuesto';
    }

    renderHealthScore(sav, inc, exp, debt, bal);
    renderAlerts(sav, inc, exp, debt, bal);
    renderSummary(sav, inc, exp, debt, bal, nw);
    renderReturns();
    renderCashbackStrategy();
    renderCreditScore();
  }

  function renderHealthScore(sav, inc, exp, debt, bal) {
    const sEl = document.getElementById('health-score');
    const stEl = document.getElementById('health-status');
    const tipEl = document.getElementById('health-tip');
    const circleEl = document.getElementById('health-circle-progress');
    let s = 50;
    if (exp > 0) {
      const m = sav / exp;
      if (m >= 6) s += 25; else if (m >= 3) s += 18; else if (m >= 1) s += 8; else s -= 5;
    } else if (sav > 0) s += 10;
    if (inc > 0) {
      const r = (bal / inc) * 100;
      if (r >= 20) s += 15; else if (r >= 10) s += 10; else if (r >= 0) s += 3; else s -= 15;
    }
    if (sav > debt) s += 10;
    if (debt === 0 || (inc > 0 && (debt / inc) < 0.5)) s += 5;
    if (state.pockets.length >= 3) s += 5;
    s = Math.max(0, Math.min(100, s));
    sEl.textContent = s;

    let st, c, tip;
    if (s >= 80) {
      st = '🌟 Excelente · estás muy bien';
      c = '#1D9E75';
      tip = 'Tu disciplina financiera es ejemplar. Considera invertir para hacer crecer más rápido.';
    } else if (s >= 65) {
      st = '✅ Buena · vas por buen camino';
      c = '#639922';
      tip = 'Mantén el ritmo. Pequeñas optimizaciones te llevarán al siguiente nivel.';
    } else if (s >= 45) {
      st = '🟡 Regular · hay espacio para mejorar';
      c = '#BA7517';
      tip = 'Revisa tus gastos variables y empieza con metas pequeñas pero constantes.';
    } else {
      st = '⚠️ Necesita atención';
      c = '#A32D2D';
      tip = 'Es momento de actuar. Empieza por reducir un gasto y construir tu fondo de emergencia.';
    }

    sEl.style.color = c;
    stEl.textContent = st;
    if (tipEl) tipEl.textContent = tip;
    if (circleEl) {
      const circumference = 263.89; // 2 * π * 42
      const offset = circumference - (s / 100) * circumference;
      circleEl.style.strokeDashoffset = offset;
      circleEl.style.stroke = c;
    }
  }

  function renderAlerts(sav, inc, exp, debt, bal) {
    const c = document.getElementById('alerts-container');
    const a = [];

    // Cargar alertas descartadas (con expiración por día)
    const todayKey = new Date().toISOString().split('T')[0];
    let dismissed = {};
    try {
      const raw = localStorage.getItem('dashboard-dismissed-alerts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === todayKey) dismissed = parsed.ids || {};
      }
    } catch(e) {}

    // 1. ALERTAS DE FECHAS DE CORTE DE TARJETAS (prioridad alta)
    state.debts.forEach(d => {
      if (d.cutoffDay) {
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonthIdx = today.getMonth();
        const currentYear = today.getFullYear();
        let nextCutoff;
        if (currentDay <= d.cutoffDay) {
          nextCutoff = new Date(currentYear, currentMonthIdx, d.cutoffDay);
        } else {
          nextCutoff = new Date(currentYear, currentMonthIdx + 1, d.cutoffDay);
        }
        const daysLeft = Math.ceil((nextCutoff - today) / (1000 * 60 * 60 * 24));
        const dateStr = nextCutoff.toLocaleDateString('es-CO', { day: '2-digit', month: 'long' });

        const TARGET_PCT = 3;
        const targetMaxBalance = d.payment ? (d.payment * TARGET_PCT / 100) : 0;
        const utilization = d.payment > 0 ? (d.balance / d.payment) * 100 : 0;
        const needsPayment = d.balance > targetMaxBalance;
        const paymentNeeded = needsPayment ? d.balance - targetMaxBalance : 0;

        const baseId = `cutoff-${d.id}-${daysLeft}`;

        if (daysLeft <= 0) {
          a.push({ id: baseId, t: 'danger', x: `🚨 <strong>${d.name}</strong>: ¡HOY es el corte! Saldo: ${fmt(d.balance)} (${utilization.toFixed(1)}% utilización). ${needsPayment ? `Para mantener score óptimo (3%), paga al menos <strong>${fmt(paymentNeeded)}</strong> antes del cierre.` : 'Tu utilización ya está óptima.'}` });
        } 
        else if (daysLeft <= 3) {
          if (needsPayment) {
            a.push({ id: baseId, t: 'warning', x: `⚠️ <strong>${d.name}</strong>: Corte en ${daysLeft} día${daysLeft > 1 ? 's' : ''} (${dateStr}). Tu utilización es <strong>${utilization.toFixed(1)}%</strong>. Para mantener el 3%, paga <strong>${fmt(paymentNeeded)}</strong> antes del corte.` });
          } else {
            a.push({ id: baseId, t: 'info', x: `✅ <strong>${d.name}</strong>: Corte en ${daysLeft} día${daysLeft > 1 ? 's' : ''} (${dateStr}). Utilización óptima en ${utilization.toFixed(1)}% (≤3%). No requiere pago anticipado.` });
          }
        }
        else if (daysLeft <= 7) {
          if (needsPayment) {
            a.push({ id: baseId, t: 'info', x: `🔔 <strong>${d.name}</strong>: Corte en ${daysLeft} días (${dateStr}). Saldo actual: ${fmt(d.balance)} (${utilization.toFixed(1)}%). Para mantener score óptimo, paga <strong>${fmt(paymentNeeded)}</strong> antes del corte.` });
          } else {
            a.push({ id: baseId, t: 'success', x: `✅ <strong>${d.name}</strong>: Corte en ${daysLeft} días (${dateStr}). Utilización en ${utilization.toFixed(1)}% — perfecto para el score.` });
          }
        }
        else if (daysLeft <= 14 && needsPayment) {
          a.push({ id: baseId, t: 'info', x: `📅 <strong>${d.name}</strong>: Corte en ${daysLeft} días. Tu utilización es ${utilization.toFixed(1)}% — considera abonar ${fmt(paymentNeeded)} antes del ${dateStr} para mantener el score óptimo.` });
        }
      }
    });

    // 2. ALERTAS DE PRESUPUESTO (solo si tiene presupuesto definido)
    const budgets = state.budgets[currentMonth] || {};
    CATEGORIES.forEach(cat => {
      const budget = budgets[cat.id] || 0;
      const spent = spentByCategory(cat.id);
      // Solo alertar si hay un presupuesto > 0 (el usuario quiere control en esta categoría)
      if (budget > 0 && spent > 0) {
        const pct = (spent / budget) * 100;
        const baseId = `budget-${cat.id}-${currentMonth}`;
        if (pct >= 100) {
          a.push({ id: baseId, t: 'danger', x: `🚨 <strong>Excediste presupuesto en ${cat.label}</strong>: gastaste ${fmt(spent)} de ${fmt(budget)} (excedido por ${fmt(spent - budget)}).` });
        } else if (pct >= 80) {
          a.push({ id: baseId, t: 'warning', x: `⚠️ <strong>${cat.label} al ${pct.toFixed(0)}%</strong> del presupuesto. Te quedan ${fmt(budget - spent)} este mes.` });
        }
      }
    });

    // 3. ALERTAS GENERALES (descartables)
    if (inc > 0 && bal < 0) {
      a.push({ id: `deficit-${currentMonth}`, t: 'danger', x: `Déficit mensual de ${fmt(Math.abs(bal))}. Revisa Presupuesto para optimizar.` });
    } else if (inc > 0 && bal >= 0 && bal < 200000) {
      a.push({ id: `tight-${currentMonth}`, t: 'warning', x: `Margen apretado: ${fmt(bal)}/mes.` });
    } else if (inc > 0 && bal >= 200000) {
      a.push({ id: `healthy-margin-${currentMonth}`, t: 'success', x: `Margen saludable de ${fmt(bal)}/mes. Aprovecha para invertir.` });
    }

    if (exp > 0) {
      const m = sav / exp;
      if (m >= 6) a.push({ id: `fund-excellent-${currentMonth}`, t: 'success', x: `Fondo cubre ${m.toFixed(1)} meses de gastos. Excelente colchón.` });
      else if (m >= 3) a.push({ id: `fund-good-${currentMonth}`, t: 'info', x: `Fondo cubre ${m.toFixed(1)} meses. Saludable.` });
    }

    if (debt > 0 && totalLimit() > 0) {
      const u = (debt / totalLimit()) * 100;
      if (u < 30) a.push({ id: `util-good-${currentMonth}`, t: 'success', x: `Utilización de crédito en ${u.toFixed(1)}%. Excelente.` });
    }

    // Filtrar las descartadas y renderizar
    const visible = a.filter(x => !dismissed[x.id]);
    c.innerHTML = visible.map(x => `<div class="alert alert-${x.t}" style="position: relative; padding-right: 36px;">${x.x}<button onclick="dismissAlert('${x.id}')" style="position: absolute; top: 50%; right: 8px; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; padding: 4px 8px; font-size: 16px; color: inherit; opacity: 0.6;" title="Descartar">×</button></div>`).join('');
  }

  window.dismissAlert = function(id) {
    const todayKey = new Date().toISOString().split('T')[0];
    let dismissed = { date: todayKey, ids: {} };
    try {
      const raw = localStorage.getItem('dashboard-dismissed-alerts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === todayKey) dismissed = parsed;
      }
    } catch(e) {}
    dismissed.ids[id] = true;
    localStorage.setItem('dashboard-dismissed-alerts', JSON.stringify(dismissed));
    // Re-renderizar inmediatamente
    if (typeof renderResumen === 'function') renderResumen();
  };

  function renderSummary(sav, inc, exp, debt, bal, nw) {
    const c = document.getElementById('summary-content');
    const aI = inc * 12, aE = exp * 12, aS = bal * 12;
    let h = '';
    h += `<div class="summary-row"><span>Patrimonio neto</span><span style="font-weight: 500;">${fmt(nw)}</span></div>`;
    h += `<div class="summary-row"><span>Ingreso anual</span><span style="font-weight: 500; color: var(--success-text);">${fmt(aI)}</span></div>`;
    h += `<div class="summary-row"><span>Gasto anual</span><span style="font-weight: 500; color: var(--danger-text);">${fmt(aE)}</span></div>`;
    h += `<div class="summary-row"><span>Ahorro anual proyectado</span><span style="font-weight: 500; color: ${bal >= 0 ? 'var(--success-text)' : 'var(--danger-text)'};">${fmt(aS)}</span></div>`;
    h += `<div class="summary-row"><span>Patrimonio en 12 meses</span><span style="font-weight: 500; color: ${bal >= 0 ? 'var(--success-text)' : 'var(--danger-text)'};">${fmt(nw + aS)}</span></div>`;
    if (exp > 0) {
      const ide = exp * 6;
      const e = state.pockets.find(p => /emergencia/i.test(p.name));
      if (e) h += `<div class="summary-row"><span>Fondo emergencia ideal (6 meses)</span><span style="font-weight: 500;">${fmt(ide)} (${((e.amount/ide)*100).toFixed(0)}% logrado)</span></div>`;
    }
    c.innerHTML = h;
  }

  function renderReturns() {
    const c = document.getElementById('returns-content');
    if (!c) return;
    const r = (state.interestRate || 0) / 100;
    const p = totalPockets();
    if (r === 0 || p === 0) { c.innerHTML = '<div class="empty-state">Configura tasa</div>'; return; }
    const aRG = p * r;
    const dRG = aRG / 365;
    const UVT = 52374;
    const dT = UVT * 0.055;
    const ex = dRG > dT;
    const tD = Math.max(0, dRG - dT);
    const mT = ex ? (tD * 30 * 0.07) : 0;
    const aT = ex ? (tD * 365 * 0.07) : 0;
    const mRG = p * (Math.pow(1 + r, 1/12) - 1);
    const mRN = mRG - mT;
    const aRN = aRG - aT;
    const inc = totalIncome();
    const sp = totalSpent() || totalBudget();
    const margin = Math.max(0, inc - sp);
    const eA = aRN / p;
    const eM = Math.pow(1 + eA, 1/12) - 1;
    function proj(m, ct) { let b = p; for (let i = 0; i < m; i++) b = b * (1 + eM) + ct; return b; }

    let h = '';
    h += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">`;
    h += `<div class="metric-card"><div class="metric-label">Renta diaria</div><div class="metric-value" style="font-size: 18px; color: var(--success-text);">${fmt(dRG)}</div></div>`;
    h += `<div class="metric-card"><div class="metric-label">Renta mensual neta</div><div class="metric-value" style="font-size: 18px; color: var(--success-text);">${fmt(mRN)}</div></div>`;
    h += `<div class="metric-card"><div class="metric-label">Renta anual neta</div><div class="metric-value" style="font-size: 18px; color: var(--success-text);">${fmt(aRN)}</div></div>`;
    h += `</div>`;
    if (ex) h += `<div class="alert alert-info" style="font-size: 12px;"><strong>Retefuente activa:</strong> Lulo retiene 7% sobre el excedente del umbral diario.</div>`;
    h += `<p style="font-size: 13px; font-weight: 500; margin: 16px 0 8px;">Proyección con interés compuesto</p>`;
    h += `<table style="width: 100%; font-size: 12px;"><thead><tr style="border-bottom: 0.5px solid var(--border);"><th style="text-align: left; padding: 8px 4px; color: var(--text-secondary); font-weight: 500;">Plazo</th><th style="text-align: right; padding: 8px 4px; color: var(--text-secondary); font-weight: 500;">Sin aportes</th><th style="text-align: right; padding: 8px 4px; color: var(--text-secondary); font-weight: 500;">+ ${fmt(margin)}/mes</th></tr></thead><tbody>`;
    h += `<tr><td style="padding: 8px 4px;">Hoy</td><td style="text-align: right; padding: 8px 4px;">${fmt(p)}</td><td style="text-align: right; padding: 8px 4px;">${fmt(p)}</td></tr>`;
    [12, 60, 120].forEach((m, i) => {
      const lbls = ['1 año', '5 años', '10 años'];
      h += `<tr style="border-top: 0.5px solid var(--border);"><td style="padding: 8px 4px;">En ${lbls[i]}</td><td style="text-align: right; padding: 8px 4px;">${fmt(proj(m, 0))}</td><td style="text-align: right; padding: 8px 4px; color: var(--success-text); font-weight: 500;">${fmt(proj(m, margin))}</td></tr>`;
    });
    h += `</tbody></table>`;
    h += `<p style="font-size: 11px; color: var(--text-tertiary); margin: 12px 0 0;">Tasa: ${state.interestRate}% E.A. · ${state.interestBank}</p>`;
    c.innerHTML = h;
  }

  function renderCashbackStrategy() {
    const c = document.getElementById('cashback-strategy');
    if (!c) return;
    const monthSpent = totalSpent() || totalBudget();
    const gastoTarjetasTotal = monthSpent * 0.85;
    const cashbackCalculado = gastoTarjetasTotal * 0.01;
    const tasaDiaria = (state.interestRate / 100) / 365;
    const floatMensual = gastoTarjetasTotal * tasaDiaria * 25;
    const beneficioTotal = cashbackCalculado + floatMensual;

    let h = '';
    h += `<p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 12px;">Tu plata se queda generando rendimientos en Lulo mientras compras con tarjeta. Pagas la tarjeta el día del corte. Ganas cashback Y rendimientos al mismo tiempo.</p>`;
    h += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">`;
    h += `<div class="metric-card"><div class="metric-label">Cashback estimado/mes</div><div class="metric-value" style="font-size: 18px; color: var(--success-text);">${fmt(cashbackCalculado)}</div><div class="metric-sub">1% de ${fmt(gastoTarjetasTotal)}</div></div>`;
    h += `<div class="metric-card"><div class="metric-label">Float (intereses extras)</div><div class="metric-value" style="font-size: 18px; color: var(--success-text);">${fmt(floatMensual)}</div><div class="metric-sub">25 días al ${state.interestRate}% E.A.</div></div>`;
    h += `<div class="metric-card"><div class="metric-label">Beneficio total/mes</div><div class="metric-value" style="font-size: 18px; color: var(--success-text);">${fmt(beneficioTotal)}</div><div class="metric-sub">${fmt(beneficioTotal*12)}/año</div></div>`;
    h += `</div>`;
    h += `<div style="margin-top: 14px; padding: 12px 14px; background: var(--success-bg); border-radius: var(--radius-md); font-size: 12px; color: var(--success-text);">`;
    h += `<strong>✓ Estrategia inteligente:</strong> Estás aprovechando el "float" — un truco financiero que pocos dominan. Sigue así, pero <strong>nunca dejes de pagar la tarjeta completa</strong>: si pagas mínimo, los intereses (25-30% E.A.) destruyen todo el beneficio.`;
    h += `</div>`;
    c.innerHTML = h;
  }

  function renderCreditScore() {
    const c = document.getElementById('credit-score-content');
    if (!c) return;

    const cs = state.creditScore || { lastReported: null, lastReportedDate: null, history: [], reportData: null };
    const lastScore = cs.lastReported;
    const lastDate = cs.lastReportedDate ? new Date(cs.lastReportedDate + 'T00:00:00') : null;
    const history = (cs.history || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const reportData = cs.reportData || null;

    // Calcular tasa de mejora real basada en historial
    let pointsPerMonth = 5;
    let totalGrowth = 0;
    if (history.length >= 2) {
      const first = history[0];
      const last = history[history.length - 1];
      const daysDiff = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24);
      const monthsDiff = daysDiff / 30;
      totalGrowth = last.score - first.score;
      if (monthsDiff > 0) pointsPerMonth = totalGrowth / monthsDiff;
    }

    function getCategory(score) {
      if (score >= 850) return { label: 'Excelente', color: '#1D9E75', icon: '🌟' };
      if (score >= 751) return { label: 'Muy Bueno', color: '#639922', icon: '✨' };
      if (score >= 671) return { label: 'Bueno', color: '#378ADD', icon: '✓' };
      if (score >= 580) return { label: 'Regular', color: '#BA7517', icon: '⚠️' };
      return { label: 'Pobre', color: '#A32D2D', icon: '🔴' };
    }

    let h = '';

    // ============================================
    // BLOQUE 1: GUÍA - CÓMO OBTENER TU REPORTE
    // ============================================
    h += `<details ${lastScore ? '' : 'open'} style="margin-bottom: 16px; padding: 14px; background: linear-gradient(135deg, var(--info-bg), var(--purple-bg)); border-radius: 12px; border-left: 4px solid var(--info-text);">`;
    h += `<summary style="cursor: pointer; font-weight: 600; color: var(--info-text); font-size: 14px;">📚 ¿Cómo obtengo mi reporte de crédito?</summary>`;
    h += `<div style="margin-top: 12px; font-size: 12px; line-height: 1.6; color: var(--text-primary);">`;
    h += `<p style="margin: 0 0 10px;"><strong>DataCrédito</strong> es la principal central de riesgo crediticio en Colombia. Tu puntaje (Score) refleja qué tan confiable eres como deudor para los bancos.</p>`;
    h += `<div style="background: var(--bg-primary); padding: 12px; border-radius: 8px; margin: 10px 0;">`;
    h += `<p style="margin: 0 0 8px; font-weight: 600;">📥 Cómo descargar tu reporte completo:</p>`;
    h += `<ol style="margin: 0; padding-left: 20px;">`;
    h += `<li>Ve a <a href="https://usuario.midatacredito.com/login?product=os" target="_blank" rel="noopener" style="color: var(--info-text); font-weight: 500;">midatacredito.com</a></li>`;
    h += `<li>Crea tu cuenta o inicia sesión</li>`;
    h += `<li>Compra el producto "Reporte completo" (pago único, generalmente $20.000 - $30.000 COP)</li>`;
    h += `<li>Una vez pagado, podrás <strong>descargarlo cuantas veces quieras durante 30 días</strong></li>`;
    h += `<li>Te llega un PDF con tu puntaje y los factores que lo afectan</li>`;
    h += `</ol>`;
    h += `</div>`;
    h += `<div style="background: var(--success-bg); color: var(--success-text); padding: 10px 12px; border-radius: 8px; margin-top: 8px;">`;
    h += `💡 <strong>Tip:</strong> Consultar tu propio reporte <strong>NO baja tu puntaje</strong>. Solo lo baja cuando un banco lo consulta para evaluarte para un crédito nuevo.`;
    h += `</div>`;
    h += `<div style="background: var(--info-bg); color: var(--info-text); padding: 10px 12px; border-radius: 8px; margin-top: 8px;">`;
    h += `🎁 <strong>Alternativa gratuita:</strong> Las apps de <strong>Nequi</strong> y <strong>Bancolombia</strong> a veces muestran tu puntaje sin costo. Búscalo en la sección de "Crédito" o "Mi perfil financiero".`;
    h += `</div>`;
    h += `</div>`;
    h += `</details>`;

    // ============================================
    // BLOQUE 2: ESTADO ACTUAL
    // ============================================
    if (lastScore) {
      const cat = getCategory(lastScore);
      const minS = 150, maxS = 950;
      const lastPos = ((lastScore - minS) / (maxS - minS)) * 100;

      // Header con puntaje principal
      h += `<div class="metric-card" style="border-left: 4px solid ${cat.color}; background: linear-gradient(135deg, var(--bg-secondary), ${cat.color}15); margin-bottom: 14px;">`;
      h += `<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">`;
      h += `<div>`;
      h += `<div class="metric-label">Tu puntaje actual</div>`;
      h += `<p class="metric-value" style="font-size: 36px; color: ${cat.color}; margin: 4px 0;">${lastScore}</p>`;
      h += `<div class="metric-sub">${cat.icon} ${cat.label} · Reportado ${lastDate.toLocaleDateString('es-CO', {day: '2-digit', month: 'short', year: 'numeric'})}</div>`;
      h += `</div>`;
      if (totalGrowth !== 0) {
        const growthColor = totalGrowth > 0 ? 'var(--success-text)' : 'var(--danger-text)';
        const sign = totalGrowth > 0 ? '+' : '';
        h += `<div style="text-align: right;">`;
        h += `<div style="font-size: 11px; color: var(--text-secondary);">Crecimiento total</div>`;
        h += `<div style="font-size: 20px; color: ${growthColor}; font-weight: 500;">${sign}${totalGrowth} puntos</div>`;
        h += `<div style="font-size: 11px; color: var(--text-secondary);">~${pointsPerMonth.toFixed(1)} pts/mes</div>`;
        h += `</div>`;
      }
      h += `</div></div>`;

      // Barra visual
      h += `<div style="margin: 16px 0;">`;
      h += `<div style="position: relative; height: 30px; background: linear-gradient(to right, #A32D2D 0%, #A32D2D 25%, #BA7517 25%, #BA7517 45%, #378ADD 45%, #378ADD 60%, #639922 60%, #639922 80%, #1D9E75 80%, #1D9E75 100%); border-radius: 6px;">`;
      history.forEach((h_item, idx) => {
        const pos = ((h_item.score - minS) / (maxS - minS)) * 100;
        const isLast = idx === history.length - 1;
        const size = isLast ? 4 : 2;
        const height = isLast ? 46 : 38;
        const offset = isLast ? -8 : -4;
        const color = isLast ? cat.color : 'rgba(0,0,0,0.4)';
        const shadow = isLast ? `box-shadow: 0 0 8px ${cat.color};` : '';
        h += `<div style="position: absolute; top: ${offset}px; left: ${pos}%; width: ${size}px; height: ${height}px; background: ${color}; transform: translateX(-50%); border-radius: 2px; ${shadow}" title="${h_item.date}: ${h_item.score}"></div>`;
      });
      h += `</div>`;
      h += `<div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-tertiary); margin-top: 4px;"><span>150</span><span>580</span><span>670</span><span>750</span><span>850</span><span>950</span></div>`;
      h += `<div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-tertiary);"><span>Pobre</span><span>Regular</span><span>Bueno</span><span>Muy Bueno</span><span>Excelente</span></div>`;
      h += `</div>`;

      // Histórico
      if (history.length > 0) {
        h += `<p style="font-size: 13px; font-weight: 500; margin: 16px 0 8px;">📈 Historial de consultas</p>`;
        h += `<table style="width: 100%; font-size: 12px;">`;
        h += `<thead><tr style="border-bottom: 0.5px solid var(--border);"><th style="text-align: left; padding: 6px 4px; color: var(--text-secondary);">Fecha</th><th style="text-align: right; padding: 6px 4px; color: var(--text-secondary);">Puntaje</th><th style="text-align: right; padding: 6px 4px; color: var(--text-secondary);">Cambio</th><th style="text-align: right; padding: 6px 4px; color: var(--text-secondary);">Categoría</th></tr></thead>`;
        history.forEach((h_item, idx) => {
          const change = idx > 0 ? h_item.score - history[idx-1].score : null;
          const itemCat = getCategory(h_item.score);
          const dateF = new Date(h_item.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
          const changeStr = change === null ? '—' : (change >= 0 ? `+${change}` : change);
          const changeColor = change === null ? 'var(--text-tertiary)' : (change > 0 ? 'var(--success-text)' : 'var(--danger-text)');
          h += `<tr style="border-top: 0.5px solid var(--border);"><td style="padding: 6px 4px;">${dateF}</td><td style="text-align: right; font-weight: 500;">${h_item.score}</td><td style="text-align: right; color: ${changeColor}; font-weight: 500;">${changeStr}</td><td style="text-align: right; color: ${itemCat.color};">${itemCat.icon} ${itemCat.label}</td></tr>`;
        });
        h += `</table>`;
      }
    } else {
      // Sin puntaje aún
      h += `<div style="padding: 30px 20px; text-align: center; background: var(--bg-secondary); border-radius: 12px; margin-bottom: 16px;">`;
      h += `<div style="font-size: 40px; margin-bottom: 8px;">📊</div>`;
      h += `<p style="font-weight: 500; margin: 0 0 6px;">Aún no has registrado tu puntaje crediticio</p>`;
      h += `<p style="font-size: 12px; color: var(--text-secondary); margin: 0;">Sigue las instrucciones de arriba para obtener tu reporte y úsalo en el formulario de abajo.</p>`;
      h += `</div>`;
    }

    // ============================================
    // BLOQUE 3: ANÁLISIS PERSONALIZADO (si tiene reportData)
    // ============================================
    if (reportData) {
      h += renderCreditAnalysis(reportData, lastScore);
    }

    // ============================================
    // BLOQUE 4: PROYECCIÓN
    // ============================================
    if (lastScore) {
      h += `<p style="font-size: 13px; font-weight: 500; margin: 16px 0 8px;">🎯 Proyección con tu ritmo actual (${pointsPerMonth >= 0 ? '+' : ''}${pointsPerMonth.toFixed(1)} pts/mes)</p>`;
      h += `<table style="width: 100%; font-size: 12px;">`;
      [1, 3, 6, 12, 24].forEach(m => {
        const proj = Math.min(820, Math.max(150, Math.round(lastScore + m * pointsPerMonth)));
        const projCat = getCategory(proj);
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + m);
        const dateLabel = futureDate.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
        h += `<tr style="border-top: 0.5px solid var(--border);"><td style="padding: 6px 4px;">En ${m} mes${m > 1 ? 'es' : ''} (${dateLabel})</td><td style="text-align: right; color: ${projCat.color}; font-weight: 500;">${proj} (${projCat.label})</td></tr>`;
      });
      h += `</table>`;
    }

    // ============================================
    // BLOQUE 5: FORMULARIO PARA REGISTRAR REPORTE
    // ============================================
    h += `<details ${!lastScore ? 'open' : ''} style="margin-top: 18px; padding: 14px; background: var(--bg-secondary); border-radius: 12px; border: 1px dashed var(--border);">`;
    h += `<summary style="cursor: pointer; font-weight: 500; font-size: 13px;">📝 ${lastScore ? 'Actualizar mi reporte de crédito' : 'Registrar mi primer reporte'}</summary>`;
    h += `<div style="margin-top: 12px;">`;
    h += `<p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 12px;">Ingresa los datos exactos de tu reporte DataCrédito para obtener un análisis personalizado.</p>`;

    // Datos básicos
    h += `<p style="font-size: 12px; font-weight: 500; margin: 12px 0 6px;">Datos básicos</p>`;
    h += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">`;
    h += `<div><label style="font-size: 11px; color: var(--text-secondary);">Puntaje</label><input type="number" id="cs-score" placeholder="Ej: 691" min="150" max="950" value="${lastScore || ''}" /></div>`;
    h += `<div><label style="font-size: 11px; color: var(--text-secondary);">Fecha del reporte</label><input type="date" id="cs-date" value="${cs.lastReportedDate || ''}" /></div>`;
    h += `</div>`;

    // Sección Endeudamiento
    h += `<details style="margin: 12px 0; padding: 10px; background: var(--bg-primary); border-radius: 8px; border: 0.5px solid var(--border);">`;
    h += `<summary style="cursor: pointer; font-size: 12px; font-weight: 500;">💳 Endeudamiento (opcional)</summary>`;
    h += `<div style="margin-top: 10px;">`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Utilización en tarjetas (%)</label><input type="number" id="rd-util" placeholder="Ej: 4.2" step="0.1" min="0" max="100" value="${reportData?.utilization || ''}" /></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">% pendiente por pagar (saldo total)</label><input type="number" id="rd-pending" placeholder="Ej: 0.04" step="0.01" min="0" max="100" value="${reportData?.pendingPercent || ''}" /></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Comportamiento de tarjetas</label>`;
    h += `<select id="rd-cards-behavior"><option value="">Selecciona</option>`;
    h += `<option value="estable" ${reportData?.cardsBehavior === 'estable' ? 'selected' : ''}>Estable y consistente</option>`;
    h += `<option value="volatil" ${reportData?.cardsBehavior === 'volatil' ? 'selected' : ''}>Volátil/cambiante</option>`;
    h += `</select></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;"><input type="checkbox" id="rd-has-fixed-loan" ${reportData?.hasFixedLoan ? 'checked' : ''}> Tengo crédito a plazo fijo (CDT, libranza, libre inversión)</label></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;"><input type="checkbox" id="rd-has-mortgage" ${reportData?.hasMortgage ? 'checked' : ''}> Tengo crédito hipotecario o leasing</label></div>`;
    h += `</div></details>`;

    // Sección Hábito de pago
    h += `<details style="margin: 12px 0; padding: 10px; background: var(--bg-primary); border-radius: 8px; border: 0.5px solid var(--border);">`;
    h += `<summary style="cursor: pointer; font-size: 12px; font-weight: 500;">⏰ Hábito de pago (opcional)</summary>`;
    h += `<div style="margin-top: 10px;">`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Productos con mora 30 días (últimos 12 meses)</label><input type="number" id="rd-mora30" placeholder="0" min="0" value="${reportData?.mora30 ?? ''}" /></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Productos con mora 60+ días (últimos 48 meses)</label><input type="number" id="rd-mora60" placeholder="0" min="0" value="${reportData?.mora60 ?? ''}" /></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Productos actualmente en mora</label><input type="number" id="rd-currentMora" placeholder="0" min="0" value="${reportData?.currentMora ?? ''}" /></div>`;
    h += `</div></details>`;

    // Sección Experiencia y portafolio
    h += `<details style="margin: 12px 0; padding: 10px; background: var(--bg-primary); border-radius: 8px; border: 0.5px solid var(--border);">`;
    h += `<summary style="cursor: pointer; font-size: 12px; font-weight: 500;">📋 Experiencia y portafolio (opcional)</summary>`;
    h += `<div style="margin-top: 10px;">`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Años de experiencia crediticia</label><input type="number" id="rd-experience" placeholder="Ej: 6" min="0" value="${reportData?.experienceYears ?? ''}" /></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Productos abiertos al día</label><input type="number" id="rd-open-products" placeholder="Ej: 8" min="0" value="${reportData?.openProducts ?? ''}" /></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Nuevas obligaciones (últimos 6 meses)</label><input type="number" id="rd-new-loans" placeholder="Ej: 3" min="0" value="${reportData?.newLoans ?? ''}" /></div>`;
    h += `<div style="margin-bottom: 8px;"><label style="font-size: 11px; color: var(--text-secondary); display: block;">Meses desde apertura más reciente</label><input type="number" id="rd-recent-opening" placeholder="Ej: 5" min="0" value="${reportData?.monthsSinceLastOpen ?? ''}" /></div>`;
    h += `</div></details>`;

    h += `<button onclick="updateCreditScoreFull()" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #7F77DD, #1D9E75); color: white; border: none; border-radius: 10px; font-weight: 500; cursor: pointer; font-size: 13px; margin-top: 8px;">💾 Guardar y analizar</button>`;
    h += `</div></details>`;

    c.innerHTML = h;
  }

  // Análisis personalizado tipo "consultor financiero"
  function renderCreditAnalysis(rd, score) {
    let h = `<div style="margin: 16px 0; padding: 14px; background: linear-gradient(135deg, var(--purple-bg), var(--info-bg)); border-radius: 12px; border-left: 4px solid var(--purple-text);">`;
    h += `<p style="font-weight: 600; font-size: 14px; color: var(--purple-text); margin: 0 0 10px;">🤖 Tu análisis personalizado</p>`;

    // Generar análisis basado en datos
    const positives = [];
    const negatives = [];
    const tips = [];

    // ANÁLISIS DE UTILIZACIÓN
    if (rd.utilization !== undefined && rd.utilization !== null && rd.utilization !== '') {
      const u = parseFloat(rd.utilization);
      if (u < 10) positives.push(`Utilización en ${u}% — está en el rango ÓPTIMO (debajo del 10%)`);
      else if (u < 30) {
        positives.push(`Utilización en ${u}% — saludable (debajo del 30%)`);
        tips.push(`Bajar utilización a menos del 10% puede sumarte +20-30 puntos en próximos reportes`);
      } else if (u < 50) {
        negatives.push(`Utilización en ${u}% — está alta (sobre el 30%)`);
        tips.push(`Pagar antes del corte para bajar utilización al 10% o menos. Esto solo puede subir tu puntaje 30-50 puntos`);
      } else {
        negatives.push(`Utilización en ${u}% — MUY ALTA, está perjudicando seriamente tu puntaje`);
        tips.push(`URGENTE: bajar utilización inmediatamente. Es el factor más importante después del hábito de pago`);
      }
    }

    // ANÁLISIS DE PAGOS
    if (rd.mora30 !== undefined && rd.mora30 !== null && rd.mora30 !== '') {
      const m30 = parseInt(rd.mora30);
      if (m30 === 0) positives.push(`0 productos con mora de 30 días en últimos 12 meses — historial impecable`);
      else negatives.push(`${m30} producto(s) con mora 30 días — afecta tu puntaje significativamente`);
    }
    if (rd.mora60 !== undefined && rd.mora60 !== null && rd.mora60 !== '') {
      const m60 = parseInt(rd.mora60);
      if (m60 === 0) positives.push(`0 productos con mora 60+ días en últimos 48 meses — excelente disciplina a largo plazo`);
      else negatives.push(`${m60} producto(s) con mora 60+ días — esto pesa MUCHO y tarda años en limpiarse`);
    }
    if (rd.currentMora !== undefined && rd.currentMora !== null && rd.currentMora !== '') {
      const cm = parseInt(rd.currentMora);
      if (cm === 0) positives.push(`Actualmente sin productos en mora — al día con todas tus obligaciones`);
      else negatives.push(`${cm} producto(s) actualmente en mora — PRIORIDAD #1: ponerse al día YA`);
    }

    // ANÁLISIS DE COMPORTAMIENTO
    if (rd.cardsBehavior === 'estable') {
      positives.push(`Comportamiento estable de tarjetas — DataCrédito te ve como predecible y confiable`);
    } else if (rd.cardsBehavior === 'volatil') {
      negatives.push(`Comportamiento volátil de tarjetas — los cambios bruscos en uso bajan el puntaje`);
      tips.push(`Mantén un nivel consistente de uso de tarjetas mes a mes para mejorar`);
    }

    // ANÁLISIS DE DIVERSIDAD DE CRÉDITO
    if (!rd.hasFixedLoan && !rd.hasMortgage) {
      negatives.push(`Solo tienes tarjetas de crédito — falta diversidad en tipos de crédito`);
      tips.push(`Considera abrir un CDT o crédito a plazo fijo pequeño ($1M-$3M, 6-12 meses): suma diversidad de productos y puede dar +10-20 puntos`);
    } else if (rd.hasFixedLoan && !rd.hasMortgage) {
      positives.push(`Tienes diversidad básica con préstamos a plazo fijo`);
      tips.push(`A largo plazo, un crédito hipotecario/vehículo bien manejado puede sumar +30-50 puntos`);
    } else if (rd.hasMortgage) {
      positives.push(`Tienes crédito hipotecario o vehicular — máxima diversidad de productos`);
    }

    // ANÁLISIS DE EXPERIENCIA
    if (rd.experienceYears !== undefined && rd.experienceYears !== null && rd.experienceYears !== '') {
      const exp = parseInt(rd.experienceYears);
      if (exp >= 10) positives.push(`${exp} años de experiencia crediticia — historial maduro`);
      else if (exp >= 5) positives.push(`${exp} años de experiencia crediticia — buen recorrido`);
      else {
        negatives.push(`Solo ${exp} año(s) de experiencia crediticia — el tiempo trabajará a tu favor`);
        tips.push(`Mantén las cuentas activas (no las cierres). Cada año que pasa suma a tu antigüedad y por ende a tu puntaje`);
      }
    }

    // ANÁLISIS DE NUEVAS APERTURAS
    if (rd.newLoans !== undefined && rd.newLoans !== null && rd.newLoans !== '') {
      const nl = parseInt(rd.newLoans);
      if (nl === 0) positives.push(`Sin nuevas aperturas en últimos 6 meses — estabilidad`);
      else if (nl >= 3) {
        negatives.push(`${nl} nuevas obligaciones en 6 meses — DataCrédito ve esto como "hambre de crédito"`);
        tips.push(`Evita abrir tarjetas/créditos nuevos en los próximos 6-12 meses para que esto deje de penalizarte`);
      }
    }

    // ANÁLISIS DE APERTURA RECIENTE
    if (rd.monthsSinceLastOpen !== undefined && rd.monthsSinceLastOpen !== null && rd.monthsSinceLastOpen !== '') {
      const m = parseInt(rd.monthsSinceLastOpen);
      if (m >= 12) positives.push(`Han pasado ${m} meses desde tu última apertura — el efecto negativo ya se diluyó`);
      else if (m < 6) {
        tips.push(`Tu última apertura fue hace ${m} meses. Esperar 12+ meses elimina la penalización por "nueva apertura"`);
      }
    }

    // RENDERIZAR
    if (positives.length > 0) {
      h += `<div style="margin-bottom: 12px;">`;
      h += `<p style="font-size: 12px; font-weight: 600; color: var(--success-text); margin: 0 0 6px;">✅ Lo que estás haciendo BIEN (${positives.length}):</p>`;
      h += `<ul style="margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7;">`;
      positives.forEach(p => h += `<li>${p}</li>`);
      h += `</ul></div>`;
    }

    if (negatives.length > 0) {
      h += `<div style="margin-bottom: 12px;">`;
      h += `<p style="font-size: 12px; font-weight: 600; color: var(--warning-text); margin: 0 0 6px;">⚠️ Lo que te está LIMITANDO (${negatives.length}):</p>`;
      h += `<ul style="margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7;">`;
      negatives.forEach(n => h += `<li>${n}</li>`);
      h += `</ul></div>`;
    }

    if (tips.length > 0) {
      h += `<div style="margin-top: 12px; padding: 10px 12px; background: var(--bg-primary); border-radius: 8px; border-left: 3px solid var(--info-text);">`;
      h += `<p style="font-size: 12px; font-weight: 600; color: var(--info-text); margin: 0 0 6px;">💡 Tus próximos pasos para SUBIR el puntaje:</p>`;
      h += `<ol style="margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7;">`;
      tips.forEach(t => h += `<li>${t}</li>`);
      h += `</ol></div>`;
    }

    if (positives.length === 0 && negatives.length === 0 && tips.length === 0) {
      h += `<p style="font-size: 12px; color: var(--text-secondary);">Aún no has llenado los datos del reporte. Llena el formulario abajo para obtener un análisis detallado.</p>`;
    }

    h += `</div>`;
    return h;
  }

  window.updateCreditScoreFull = function() {
    const score = parseInt(document.getElementById('cs-score').value);
    const date = document.getElementById('cs-date').value || new Date().toISOString().split('T')[0];
    if (!score || score < 150 || score > 950) return alert('Ingresa un puntaje válido (150-950)');

    if (!state.creditScore) state.creditScore = { history: [] };
    state.creditScore.lastReported = score;
    state.creditScore.lastReportedDate = date;

    if (!state.creditScore.history) state.creditScore.history = [];
    // No duplicar misma fecha
    const existingIdx = state.creditScore.history.findIndex(h => h.date === date);
    if (existingIdx >= 0) {
      state.creditScore.history[existingIdx] = { date, score, source: 'DataCrédito' };
    } else {
      state.creditScore.history.push({ date, score, source: 'DataCrédito' });
    }

    // Capturar datos del reporte
    const reportData = {
      utilization: parseFloat(document.getElementById('rd-util').value) || null,
      pendingPercent: parseFloat(document.getElementById('rd-pending').value) || null,
      cardsBehavior: document.getElementById('rd-cards-behavior').value || null,
      hasFixedLoan: document.getElementById('rd-has-fixed-loan').checked,
      hasMortgage: document.getElementById('rd-has-mortgage').checked,
      mora30: document.getElementById('rd-mora30').value !== '' ? parseInt(document.getElementById('rd-mora30').value) : null,
      mora60: document.getElementById('rd-mora60').value !== '' ? parseInt(document.getElementById('rd-mora60').value) : null,
      currentMora: document.getElementById('rd-currentMora').value !== '' ? parseInt(document.getElementById('rd-currentMora').value) : null,
      experienceYears: document.getElementById('rd-experience').value !== '' ? parseInt(document.getElementById('rd-experience').value) : null,
      openProducts: document.getElementById('rd-open-products').value !== '' ? parseInt(document.getElementById('rd-open-products').value) : null,
      newLoans: document.getElementById('rd-new-loans').value !== '' ? parseInt(document.getElementById('rd-new-loans').value) : null,
      monthsSinceLastOpen: document.getElementById('rd-recent-opening').value !== '' ? parseInt(document.getElementById('rd-recent-opening').value) : null
    };

    state.creditScore.reportData = reportData;
    saveState();
    renderCreditScore();
    toastSuccess('Análisis listo', 'Revisa tus recomendaciones personalizadas abajo');
  };

  // Mantener compatibilidad con función anterior
  window.updateCreditScore = function() {
    window.updateCreditScoreFull();
  };

  function renderCharts() {
    const c1 = document.getElementById('chart-pockets');
    const c2 = document.getElementById('chart-comparison');
    if (!c1 || !c2 || typeof Chart === 'undefined') return;
    
    // Detectar tema activo correctamente (respeta manual y prefers-color-scheme)
    const html = document.documentElement;
    let isDark;
    if (html.classList.contains('theme-dark')) isDark = true;
    else if (html.classList.contains('theme-light')) isDark = false;
    else isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Colores con buen contraste para cada tema
    const tc = isDark ? '#e8e6df' : '#1a1a18';      // Texto principal (más oscuro en claro)
    const tcSecondary = isDark ? '#a8a8a0' : '#4a4a45'; // Texto secundario
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const cl = ['#7F77DD', '#1D9E75', '#D85A30', '#D4537E', '#378ADD', '#639922', '#BA7517', '#888780', '#E24B4A'];

    const sorted = [...state.pockets].sort((a, b) => b.amount - a.amount);
    const lbls = sorted.map(p => p.name);
    const vals = sorted.map(p => Math.round(p.amount));

    if (chartPockets) chartPockets.destroy();
    const p1 = c1.parentElement;
    if (vals.length > 0) {
      p1.innerHTML = '<canvas id="chart-pockets"></canvas>';
      chartPockets = new Chart(document.getElementById('chart-pockets'), {
        type: 'doughnut',
        data: { labels: lbls, datasets: [{ data: vals, backgroundColor: cl.slice(0, vals.length), borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { 
              position: 'bottom', 
              labels: { 
                color: tc, 
                font: { size: 12, weight: '500' }, 
                boxWidth: 12, 
                padding: 10,
                usePointStyle: true,
                pointStyle: 'circle'
              }
            },
            tooltip: { 
              callbacks: { label: (ctx) => {
                const t = vals.reduce((a, b) => a + b, 0);
                return ctx.label + ': ' + fmt(ctx.parsed) + ' (' + ((ctx.parsed/t)*100).toFixed(1) + '%)';
              }},
              backgroundColor: isDark ? 'rgba(36,36,34,0.95)' : 'rgba(255,255,255,0.95)',
              titleColor: tc,
              bodyColor: tc,
              borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
              borderWidth: 1,
              padding: 10,
              cornerRadius: 8
            }
          }
        }
      });
    }

    const inc = totalIncome();
    const exp = totalSpent() || totalBudget();
    const bal = inc - exp;
    if (chartComparison) chartComparison.destroy();
    const p2 = c2.parentElement;
    if (inc > 0 || exp > 0) {
      p2.innerHTML = '<canvas id="chart-comparison"></canvas>';
      chartComparison = new Chart(document.getElementById('chart-comparison'), {
        type: 'bar',
        data: {
          labels: ['Ingresos', 'Gastos', 'Margen'],
          datasets: [{
            data: [Math.round(inc), Math.round(exp), Math.round(bal)],
            backgroundColor: ['#1D9E75', '#E24B4A', bal >= 0 ? '#378ADD' : '#A32D2D'],
            borderWidth: 0,
            borderRadius: 6
          }]
        },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { 
            legend: { display: false }, 
            tooltip: { 
              callbacks: { label: (ctx) => fmt(ctx.parsed.y) },
              backgroundColor: isDark ? 'rgba(36,36,34,0.95)' : 'rgba(255,255,255,0.95)',
              titleColor: tc,
              bodyColor: tc,
              borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
              borderWidth: 1,
              padding: 10,
              cornerRadius: 8
            }
          },
          scales: {
            y: { 
              ticks: { color: tcSecondary, font: { size: 11, weight: '500' }, callback: (v) => fmt(v) }, 
              grid: { color: gridColor }
            },
            x: { 
              ticks: { color: tc, font: { size: 12, weight: '600' }}, 
              grid: { display: false }
            }
          }
        }
      });
    }
  }
  
  // Re-renderizar charts cuando cambie el tema
  if (typeof window !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        if (m.attributeName === 'class') {
          if (typeof renderCharts === 'function') {
            setTimeout(renderCharts, 50);
          }
        }
      });
    });
    if (document.documentElement) {
      observer.observe(document.documentElement, { attributes: true });
    }
  }

  function freqLabel(f) { return { monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal', yearly: 'Anual', once: 'Único' }[f] || f; }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function renderAll() {
    renderPockets(); renderIncomes(); renderDebts(); renderGoals();
    renderResumen(); renderBudget(); renderTransactions(); renderCharts();
    populateExtraMonths();
    renderExtraIncomes();
    renderIncomeTypesSelect();
    renderCategoriesSelect();
    renderPaymentMethodsSelect();
  }

  if (typeof Chart !== 'undefined') loadState();
  else window.addEventListener('load', loadState);
})();
