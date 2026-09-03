import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
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

export const auth = getAuth(app);
export const db =
  firebaseConfigJson.firestoreDatabaseId && firebaseConfigJson.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfigJson.firestoreDatabaseId)
    : getFirestore(app);

/**
 * Identity is established exclusively by Firebase Authentication.
 *
 * There is deliberately no local credential store. The API verifies every
 * request with the Admin SDK against Google public signing certificates, so a
 * client-minted identity could never be honoured by the backend anyway.
 * Passwords are never hashed, stored, or transported by this application.
 */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function toAppUser(user: FirebaseUser): AppUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName:
      user.displayName ||
      (user.isAnonymous ? 'Guest Reflector' : user.email?.split('@')[0] || null),
    isAnonymous: user.isAnonymous,
    getIdToken: () => user.getIdToken(),
  };
}

/**
 * Translate Firebase auth errors into messages a user can act on.
 * A disabled provider is a configuration problem rather than a credential
 * problem, so it is called out explicitly instead of reported as a bad login.
 */
function describeAuthError(err: any): Error {
  const code = err?.code || '';
  const map: Record<string, string> = {
    'auth/operation-not-allowed':
      'This sign-in method is not enabled. Enable it in Firebase Console > Authentication > Sign-in method.',
    'auth/admin-restricted-operation':
      'This sign-in method is not enabled. Enable it in Firebase Console > Authentication > Sign-in method.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/user-not-found': 'No account found with this email. Please sign up first.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in window was closed before completing.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and try again.',
    'auth/unauthorized-domain':
      'This domain is not authorised. Add it under Authentication > Settings > Authorized domains.',
  };
  const e = new Error(map[code] || err?.message || 'Authentication failed.');
  (e as any).code = code;
  return e;
}

/**
 * Auth state observer. Emits the signed-in user, or null when signed out.
 */
export function subscribeToAuth(callback: (user: AppUser | null) => void): () => void {
  return onAuthStateChanged(auth, (firebaseUser) => {
    callback(firebaseUser ? toAppUser(firebaseUser) : null);
  });
}

/**
 * Sign in with Google (OAuth popup). Preferred path: no password ever
 * reaches this application.
 */
export async function signInWithGoogle(): Promise<AppUser> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return toAppUser(cred.user);
  } catch (err: any) {
    throw describeAuthError(err);
  }
}

/**
 * Sign in anonymously for a throwaway session.
 */
export async function loginAsGuest(): Promise<AppUser> {
  try {
    const cred = await signInAnonymously(auth);
    return toAppUser(cred.user);
  } catch (err: any) {
    throw describeAuthError(err);
  }
}

/**
 * Email/password sign-in or registration, handled entirely by Firebase.
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
      const fallbackName = cleanEmail.split('@')[0];
      if (!cred.user.displayName && fallbackName) {
        try {
          await updateProfile(cred.user, { displayName: fallbackName });
        } catch {
          /* display name is cosmetic, never block sign-up on it */
        }
      }
      return toAppUser(cred.user);
    }
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, passwordPlain);
    return toAppUser(cred.user);
  } catch (err: any) {
    throw describeAuthError(err);
  }
}

export async function logoutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Current user Firebase ID token, for Authorization: Bearer <token>.
 * The API rejects anything that is not a valid, signed Firebase token.
 */
export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  return user ? user.getIdToken() : null;
}

// ---------------- DATA OPERATIONS (Firestore only) ----------------

/**
 * Guard every read and write against the signed-in identity. This mirrors the
 * Firestore rules client-side so an ownership violation fails fast and loudly
 * rather than as an opaque permission error.
 */
function requireOwner(userId: string): void {
  const current = auth.currentUser;
  if (!current || current.uid !== userId) {
    throw new Error('Not authenticated for this user.');
  }
}

/**
 * Persist a journal entry to users/{uid}/journals/{journalId}.
 * Field limits mirror firestore.rules so a rejected write fails fast.
 */
export async function saveJournalEntry(
  userId: string,
  entry: Omit<JournalEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  customId?: string
): Promise<string> {
  requireOwner(userId);
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

  const journalDocRef = doc(collection(db, 'users', userId, 'journals'), entryId);
  await setDoc(journalDocRef, { ...fullEntry, timestamp: serverTimestamp() });
  return entryId;
}

/**
 * Load journals belonging to the authenticated user. Firestore rules restrict
 * this subtree to request.auth.uid == userId.
 */
export async function getUserJournals(userId: string): Promise<JournalEntry[]> {
  requireOwner(userId);
  const journalsRef = collection(db, 'users', userId, 'journals');
  const snapshot = await getDocs(query(journalsRef, orderBy('createdAt', 'desc')));

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
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
    } as JournalEntry;
  });
}

export async function deleteUserJournal(userId: string, journalId: string): Promise<void> {
  requireOwner(userId);
  await deleteDoc(doc(db, 'users', userId, 'journals', journalId));
}

export async function saveWeeklyInsight(
  userId: string,
  insight: Omit<WeeklyInsight, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  requireOwner(userId);
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

  const insightRef = doc(collection(db, 'users', userId, 'reflections'), insightId);
  await setDoc(insightRef, { ...fullInsight, timestamp: serverTimestamp() });
  return insightId;
}

export async function getUserWeeklyInsights(userId: string): Promise<WeeklyInsight[]> {
  requireOwner(userId);
  const snapshot = await getDocs(collection(db, 'users', userId, 'reflections'));

  return snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      return {
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
      } as WeeklyInsight;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
