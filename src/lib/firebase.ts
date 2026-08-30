import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously,
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc, 
  deleteDoc, 
  query, 
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { JournalEntry, WeeklyInsight, AppUser } from '../types';

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use explicit database ID if provisioned, or default
export const auth = getAuth(app);
export const db = firebaseConfigJson.firestoreDatabaseId && firebaseConfigJson.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfigJson.firestoreDatabaseId)
  : getFirestore(app);

// Local Vault Storage Keys
const LOCAL_SESSION_KEY = 'gemini_journal_local_session';
const LOCAL_CREDENTIALS_KEY = 'gemini_journal_vault_creds';
const LOCAL_JOURNALS_PREFIX = 'gemini_journal_entries_';
const LOCAL_INSIGHTS_PREFIX = 'gemini_journal_insights_';

// Auth State Subscriptions for unified Firebase + Local Vault
type AuthCallback = (user: AppUser | null) => void;
const authListeners: Set<AuthCallback> = new Set();
let currentLocalUser: AppUser | null = null;

/**
 * Computes SHA-256 hash with cryptographic salt for client-vault password verification
 */
async function computePasswordHash(email: string, passwordPlain: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${email.toLowerCase().trim()}::${passwordPlain}::salt_gemini_vault_2026_isolated`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Initialize local user from localStorage if present
try {
  const saved = localStorage.getItem(LOCAL_SESSION_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.uid) {
      currentLocalUser = {
        uid: parsed.uid,
        email: parsed.email || null,
        displayName: parsed.displayName || 'Vault User',
        isLocalVault: true,
        getIdToken: async () => `guest-token-${parsed.uid}`,
      };
    }
  }
} catch (e) {
  console.warn('[Local Vault]: Could not load cached local session');
}

function notifyAuthListeners(user: AppUser | null) {
  authListeners.forEach((cb) => cb(user));
}

/**
 * Universal Auth State Observer
 */
export function subscribeToAuth(callback: AuthCallback): () => void {
  authListeners.add(callback);

  // If local user is already active and Firebase has no user
  if (currentLocalUser && !auth.currentUser) {
    callback(currentLocalUser);
  }

  const unsubscribeFirebase = onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      const appUser: AppUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || (firebaseUser.isAnonymous ? 'Guest Reflecter' : null),
        isAnonymous: firebaseUser.isAnonymous,
        getIdToken: () => firebaseUser.getIdToken(),
      };
      callback(appUser);
    } else if (currentLocalUser) {
      callback(currentLocalUser);
    } else {
      callback(null);
    }
  });

  return () => {
    authListeners.delete(callback);
    unsubscribeFirebase();
  };
}

/**
 * Sign in as guest (tries Firebase Anonymous first, then Local Vault if console disabled)
 */
export async function loginAsGuest(customIdentifier?: string): Promise<AppUser> {
  try {
    const cred = await signInAnonymously(auth);
    const appUser: AppUser = {
      uid: cred.user.uid,
      email: null,
      displayName: 'Guest Reflector',
      isAnonymous: true,
      getIdToken: () => cred.user.getIdToken(),
    };
    return appUser;
  } catch (err: any) {
    const uid = customIdentifier ? `vault-${customIdentifier.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}` : `guest-${Math.random().toString(36).substring(2, 9)}`;
    const localUser: AppUser = {
      uid,
      email: customIdentifier?.includes('@') ? customIdentifier : 'guest.sandbox@local.vault',
      displayName: customIdentifier?.split('@')[0] || 'Private Vault User',
      isLocalVault: true,
      getIdToken: async () => `guest-token-${uid}`,
    };
    currentLocalUser = localUser;
    try {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
        uid: localUser.uid,
        email: localUser.email,
        displayName: localUser.displayName,
      }));
    } catch {}
    notifyAuthListeners(localUser);
    return localUser;
  }
}

/**
 * Authenticate with Email & Password with STRICT password verification.
 * 1. Tries Firebase Authentication (Cloud). If successful, signs in.
 * 2. If Firebase fails with wrong password or invalid credential, it throws an error and NEVER logs in.
 * 3. If Firebase Email/Password provider is not yet enabled in Firebase Console (auth/operation-not-allowed),
 *    it strictly verifies against the local encrypted vault credentials (SHA-256 salted hash).
 *    Wrong passwords are strictly rejected!
 */
export async function authenticateWithEmailPassword(
  email: string,
  passwordPlain: string,
  mode: 'signin' | 'signup'
): Promise<AppUser> {
  const cleanEmail = email.trim().toLowerCase();

  try {
    if (mode === 'signup') {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, passwordPlain);
      const appUser: AppUser = {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName || cleanEmail.split('@')[0],
        isAnonymous: false,
        getIdToken: () => cred.user.getIdToken(),
      };
      return appUser;
    } else {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, passwordPlain);
      const appUser: AppUser = {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName || cleanEmail.split('@')[0],
        isAnonymous: false,
        getIdToken: () => cred.user.getIdToken(),
      };
      return appUser;
    }
  } catch (firebaseErr: any) {
    // If Firebase returns credential rejection (wrong password, account exists, etc.), throw immediately!
    if (firebaseErr.code !== 'auth/operation-not-allowed') {
      throw firebaseErr;
    }

    // Handle Local Vault credential verification when Firebase Console has not enabled Email/Password provider:
    const enteredHash = await computePasswordHash(cleanEmail, passwordPlain);
    let credsStore: Record<string, { hash: string; uid: string; createdAt: string }> = {};
    try {
      const raw = localStorage.getItem(LOCAL_CREDENTIALS_KEY);
      if (raw) credsStore = JSON.parse(raw);
    } catch {}

    const existing = credsStore[cleanEmail];

    if (mode === 'signup') {
      if (existing) {
        const customErr = new Error('An account with this email already exists.');
        (customErr as any).code = 'auth/email-already-in-use';
        throw customErr;
      }
      const uid = `vault-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-')}`;
      credsStore[cleanEmail] = {
        hash: enteredHash,
        uid,
        createdAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(LOCAL_CREDENTIALS_KEY, JSON.stringify(credsStore));
      } catch {}

      const localUser: AppUser = {
        uid,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0],
        isLocalVault: true,
        getIdToken: async () => `vault-token-${uid}`,
      };
      currentLocalUser = localUser;
      try {
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
          uid: localUser.uid,
          email: localUser.email,
          displayName: localUser.displayName,
        }));
      } catch {}
      notifyAuthListeners(localUser);
      return localUser;
    } else {
      // Sign In mode
      if (!existing) {
        // Known quick-test accounts setup for convenience if never registered
        if (cleanEmail === 'alex.researcher@example.com' || cleanEmail === 'sam.creator@example.com') {
          const defaultSeedHash = await computePasswordHash(cleanEmail, 'Passphrase#2026');
          if (enteredHash !== defaultSeedHash) {
            const customErr = new Error('Invalid email or password.');
            (customErr as any).code = 'auth/wrong-password';
            throw customErr;
          }
          const uid = `vault-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-')}`;
          credsStore[cleanEmail] = {
            hash: defaultSeedHash,
            uid,
            createdAt: new Date().toISOString(),
          };
          try {
            localStorage.setItem(LOCAL_CREDENTIALS_KEY, JSON.stringify(credsStore));
          } catch {}
        } else {
          const customErr = new Error('No account found with this email. Please sign up first.');
          (customErr as any).code = 'auth/user-not-found';
          throw customErr;
        }
      }

      // STRICT Hash Verification
      const record = credsStore[cleanEmail];
      if (!record || record.hash !== enteredHash) {
        const customErr = new Error('Invalid email or password.');
        (customErr as any).code = 'auth/wrong-password';
        throw customErr;
      }

      const uid = record.uid;
      const localUser: AppUser = {
        uid,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0],
        isLocalVault: true,
        getIdToken: async () => `vault-token-${uid}`,
      };
      currentLocalUser = localUser;
      try {
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
          uid: localUser.uid,
          email: localUser.email,
          displayName: localUser.displayName,
        }));
      } catch {}
      notifyAuthListeners(localUser);
      return localUser;
    }
  }
}

/**
 * Sign in with local vault directly (deprecated in favor of authenticateWithEmailPassword)
 */
export function loginWithLocalVault(email: string): AppUser {
  const cleanEmail = email.trim().toLowerCase();
  const uid = `vault-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-')}`;
  const localUser: AppUser = {
    uid,
    email: cleanEmail,
    displayName: cleanEmail.split('@')[0],
    isLocalVault: true,
    getIdToken: async () => `vault-token-${uid}`,
  };
  currentLocalUser = localUser;
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
      uid: localUser.uid,
      email: localUser.email,
      displayName: localUser.displayName,
    }));
  } catch {}
  notifyAuthListeners(localUser);
  return localUser;
}

/**
 * Sign out universal
 */
export async function logoutUser(): Promise<void> {
  currentLocalUser = null;
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {}
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.error('[Sign Out Error]:', err);
  }
  notifyAuthListeners(null);
}

/**
 * Get current user auth ID token for backend API authentication
 */
export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken();
  }
  if (currentLocalUser) {
    return await currentLocalUser.getIdToken();
  }
  return null;
}

// ---------------- LOCAL STORAGE VAULT HELPERS ----------------

function getLocalJournals(userId: string): JournalEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_JOURNALS_PREFIX + userId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalJournals(userId: string, entries: JournalEntry[]): void {
  try {
    localStorage.setItem(LOCAL_JOURNALS_PREFIX + userId, JSON.stringify(entries));
  } catch {}
}

function getLocalInsights(userId: string): WeeklyInsight[] {
  try {
    const raw = localStorage.getItem(LOCAL_INSIGHTS_PREFIX + userId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalInsights(userId: string, insights: WeeklyInsight[]): void {
  try {
    localStorage.setItem(LOCAL_INSIGHTS_PREFIX + userId, JSON.stringify(insights));
  } catch {}
}

// ---------------- DATA OPERATIONS ----------------

/**
 * Save journal entry under isolated user subcollection: users/{uid}/journals/{journalId}
 */
export async function saveJournalEntry(
  userId: string,
  entry: Omit<JournalEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  customId?: string
): Promise<string> {
  const nowIso = new Date().toISOString();
  const entryId = customId || `journal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const fullEntry: JournalEntry = {
    id: entryId,
    userId,
    title: entry.title.slice(0, 200),
    summary: entry.summary.slice(0, 20000),
    mood: entry.mood || 'Reflective',
    tags: entry.tags || [],
    keyTakeaways: entry.keyTakeaways || [],
    actionItems: entry.actionItems || [],
    turnsCount: entry.turnsCount || 0,
    conversation: entry.conversation || [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Always mirror in local isolated vault
  const localList = getLocalJournals(userId);
  const updatedLocal = [fullEntry, ...localList.filter((j) => j.id !== entryId)];
  setLocalJournals(userId, updatedLocal);

  // If Firebase user is active, attempt Firestore sync
  if (auth.currentUser && auth.currentUser.uid === userId) {
    try {
      const journalsCollectionRef = collection(db, 'users', userId, 'journals');
      const journalDocRef = doc(journalsCollectionRef, entryId);
      await setDoc(journalDocRef, {
        ...fullEntry,
        timestamp: serverTimestamp(),
      });
    } catch (err: any) {
      console.warn('[Firestore Sync]: Could not sync to cloud, stored in local vault:', err?.message);
    }
  }

  return entryId;
}

/**
 * Load all journals belonging ONLY to authenticated user
 */
export async function getUserJournals(userId: string): Promise<JournalEntry[]> {
  const localEntries = getLocalJournals(userId);

  // If authenticated with Firebase user, fetch cloud and merge with local
  if (auth.currentUser && auth.currentUser.uid === userId) {
    try {
      const journalsRef = collection(db, 'users', userId, 'journals');
      const q = query(journalsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const cloudResults: JournalEntry[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        cloudResults.push({
          id: docSnap.id,
          userId: data.userId || userId,
          title: data.title || 'Untitled Journal',
          summary: data.summary || '',
          mood: data.mood || 'Reflective',
          tags: data.tags || [],
          keyTakeaways: data.keyTakeaways || [],
          actionItems: data.actionItems || [],
          turnsCount: data.turnsCount || 0,
          conversation: data.conversation || [],
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
      });

      // Merge cloud and local unique entries
      const map = new Map<string, JournalEntry>();
      cloudResults.forEach((j) => map.set(j.id, j));
      localEntries.forEach((j) => {
        if (!map.has(j.id)) map.set(j.id, j);
      });

      return Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.warn('[Firestore Query]: Falling back to local vault storage:', error);
    }
  }

  return localEntries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Delete a user's isolated journal
 */
export async function deleteUserJournal(userId: string, journalId: string): Promise<void> {
  // Delete from local vault
  const localList = getLocalJournals(userId);
  setLocalJournals(userId, localList.filter((j) => j.id !== journalId));

  // Delete from cloud if authenticated
  if (auth.currentUser && auth.currentUser.uid === userId) {
    try {
      const docRef = doc(db, 'users', userId, 'journals', journalId);
      await deleteDoc(docRef);
    } catch (err: any) {
      console.warn('[Firestore Delete]: Error deleting from cloud:', err?.message);
    }
  }
}

/**
 * Save generated weekly reflection insight
 */
export async function saveWeeklyInsight(
  userId: string,
  insight: Omit<WeeklyInsight, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  const nowIso = new Date().toISOString();
  const insightId = `insight_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const fullInsight: WeeklyInsight = {
    id: insightId,
    userId,
    period: insight.period,
    journalCount: insight.journalCount,
    recurringTopics: insight.recurringTopics,
    highlights: insight.highlights,
    goals: insight.goals,
    areasToReflect: insight.areasToReflect,
    motivationalMessage: insight.motivationalMessage,
    createdAt: nowIso,
  };

  const localList = getLocalInsights(userId);
  setLocalInsights(userId, [fullInsight, ...localList]);

  if (auth.currentUser && auth.currentUser.uid === userId) {
    try {
      const reflectionsRef = collection(db, 'users', userId, 'reflections');
      const newDocRef = doc(reflectionsRef, insightId);
      await setDoc(newDocRef, {
        ...fullInsight,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[Firestore Insight Sync]: Stored locally:', err);
    }
  }

  return insightId;
}

/**
 * Load user's saved weekly insights
 */
export async function getUserWeeklyInsights(userId: string): Promise<WeeklyInsight[]> {
  const localInsights = getLocalInsights(userId);

  if (auth.currentUser && auth.currentUser.uid === userId) {
    try {
      const reflectionsRef = collection(db, 'users', userId, 'reflections');
      const snapshot = await getDocs(reflectionsRef);
      const cloudResults: WeeklyInsight[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        cloudResults.push({
          id: docSnap.id,
          userId: data.userId || userId,
          period: data.period || 'Recent Week',
          journalCount: data.journalCount || 0,
          recurringTopics: data.recurringTopics || [],
          highlights: data.highlights || [],
          goals: data.goals || [],
          areasToReflect: data.areasToReflect || [],
          motivationalMessage: data.motivationalMessage || '',
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });

      const map = new Map<string, WeeklyInsight>();
      cloudResults.forEach((i) => map.set(i.id, i));
      localInsights.forEach((i) => {
        if (!map.has(i.id)) map.set(i.id, i);
      });

      return Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (err) {
      console.warn('[Firestore Insights]: Falling back to local store:', err);
    }
  }

  return localInsights.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
