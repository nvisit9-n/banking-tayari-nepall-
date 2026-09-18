import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  Auth
} from 'firebase/auth';
import { doc, setDoc, Firestore } from 'firebase/firestore';
import { UserProfile } from '../types';
import { app, auth, db } from '../firebase';
import { StorageService } from './storageService';
import { isOwnerAdmin } from '../utils/sanitizer';
import { ActivityTrackingService } from './activityTrackingService';

export class FirebaseAuthService {
  static getAuthInstance(): Auth {
    return auth;
  }

  static getFirestoreInstance(): Firestore {
    return db;
  }

  /**
   * Save user profile directly to Firestore users collection
   */
  static async saveUserToFirestore(profile: UserProfile): Promise<boolean> {
    return this.syncUserProfileToFirestore(profile);
  }

  /**
   * Synchronize user profile directly to Firestore `users` collection
   */
  static async syncUserProfileToFirestore(profile: UserProfile): Promise<boolean> {
    try {
      const uid = profile.authUid || profile.id;
      if (!uid) return false;
      const firestore = this.getFirestoreInstance();
      if (!firestore) return false;

      const userDocRef = doc(firestore, 'users', uid);
      const isEmailAdmin = Boolean(profile.email && profile.email.toLowerCase().includes('admin'));

      const firestorePayload = {
        id: uid,
        name: profile.displayName || profile.name || 'विद्यार्थी',
        displayName: profile.displayName || profile.name || 'विद्यार्थी',
        email: profile.email || '',
        provider: profile.authProvider || 'google',
        photoURL: profile.photoURL || profile.avatarUrl || '',
        role: isEmailAdmin ? 'admin' : (profile.role || 'student'),
        xp: profile.xp || 250,
        totalLogins: (profile.totalLogins || 0) + 1,
        quizzesAttempted: profile.quizzesCompleted || 0,
        questionsSolved: profile.questionsSolved || 0,
        accuracy: profile.accuracy || 100,
        targetExam: profile.targetExam || 'नेपाल राष्ट्र बैंक (NRB) - सहायक ४',
        province: profile.province || 'बागमती प्रदेश',
        district: profile.district || 'काठमाडौं',
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdAt: profile.registeredAt || new Date().toISOString()
      };

      // Wrap in 3-second safety promise
      await Promise.race([
        setDoc(userDocRef, firestorePayload, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore sync timed out')), 3000))
      ]);
      return true;
    } catch (err) {
      console.warn('Firestore user profile sync warning (proceeding with local session):', err);
      return false;
    }
  }

  /**
   * Real Google OAuth Pop-up authentication with Firebase Auth
   */
  static async signInWithGoogle(): Promise<UserProfile> {
    const authInst = this.getAuthInstance();
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(authInst, provider);
    const fbUser = result.user;

    const email = fbUser.email?.toLowerCase().trim() || '';
    const displayName = fbUser.displayName?.trim() || email.split('@')[0] || 'परीक्षार्थी';
    const photoURL = fbUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0B2046&color=fff&size=256`;
    const uid = fbUser.uid || `usr_${Date.now()}`;
    const isOwner = isOwnerAdmin(email);
    const existing = StorageService.getUserProfile();
    const isSame = existing && (existing.email?.toLowerCase().trim() === email || existing.authUid === uid);

    const profile: UserProfile = {
      ...(isSame ? existing : {}),
      id: uid,
      authUid: uid,
      authProvider: 'google',
      isGoogleUser: true,
      name: displayName,
      displayName,
      email,
      photoURL,
      avatarUrl: photoURL,
      phone: fbUser.phoneNumber || (isSame ? existing?.phone : '') || '',
      province: (isSame && existing?.province) ? existing.province : 'बागमती प्रदेश',
      district: (isSame && existing?.district) ? existing.district : 'काठमाडौं',
      targetExam: (isSame && existing?.targetExam) ? existing.targetExam : 'नेपाल राष्ट्र बैंक - सहायक (तह ४)',
      xp: (isSame && existing?.xp) ? Math.max(existing.xp, 250) : 250,
      level: (isSame && existing?.level) ? existing.level : 1,
      streak: (isSame && existing?.streak) ? Math.max(existing.streak, 1) : 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      registeredAt: (isSame && existing?.registeredAt) ? existing.registeredAt : new Date().toISOString(),
      questionsSolved: (isSame && existing?.questionsSolved) ? existing.questionsSolved : 0,
      quizzesCompleted: (isSame && existing?.quizzesCompleted) ? existing.quizzesCompleted : 0,
      accuracy: (isSame && existing?.accuracy) ? existing.accuracy : 100,
      rank: (isSame && existing?.rank) ? existing.rank : 'तह ४: नयाँ प्रतियोगी (Aspirant)',
      isRegistered: true,
      isGuest: false,
      role: isOwner ? 'admin' : (isSame && existing?.role ? existing.role : 'student'),
      isPro: isOwner ? true : (isSame ? Boolean(existing?.isPro || existing?.isProUser) : false),
      isProUser: isOwner ? true : (isSame ? Boolean(existing?.isPro || existing?.isProUser) : false),
      proStatus: isOwner ? 'active' : (isSame && existing?.proStatus ? existing.proStatus : 'inactive'),
      profileCompletion: 85,
      hasReceivedCompletionBonus: (isSame && existing?.hasReceivedCompletionBonus) ? true : false
    };

    // Synchronize user profile directly to Firestore `users` collection in background
    this.syncUserProfileToFirestore(profile).catch(() => {});

    // Log real-time login event in Firebase Realtime Database & Firestore
    ActivityTrackingService.logActivity({
      user: profile,
      activityType: 'login',
      targetId: profile.authUid || profile.id,
      targetTitle: 'प्रयोगकर्ता लगइन (Google Login)',
      details: `${profile.displayName || profile.name} प्रणालीमा लगइन हुनुभयो।`,
      metadata: { email: profile.email, provider: 'google' }
    }).catch(() => {});

    return profile;
  }

  /**
   * Email/Password Sign-In
   */
  static async signInWithEmail(email: string, pass: string): Promise<UserProfile> {
    const authInst = this.getAuthInstance();
    const cleanEmail = email.trim().toLowerCase();

    const result = await signInWithEmailAndPassword(authInst, cleanEmail, pass);
    const fbUser = result.user;

    const displayName = fbUser.displayName?.trim() || cleanEmail.split('@')[0] || 'विद्यार्थी';
    const photoURL = fbUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0B2046&color=fff&size=256`;
    const uid = fbUser.uid;
    const isOwner = isOwnerAdmin(cleanEmail);
    const existing = StorageService.getUserProfile();
    const isSame = existing && (existing.email?.toLowerCase().trim() === cleanEmail || existing.authUid === uid);

    const profile: UserProfile = {
      ...(isSame ? existing : {}),
      id: uid,
      authUid: uid,
      authProvider: 'email',
      isGoogleUser: false,
      name: displayName,
      displayName,
      email: cleanEmail,
      photoURL,
      avatarUrl: photoURL,
      phone: fbUser.phoneNumber || (isSame ? existing?.phone : '') || '',
      province: (isSame && existing?.province) ? existing.province : 'बागमती प्रदेश',
      district: (isSame && existing?.district) ? existing.district : 'काठमाडौं',
      targetExam: (isSame && existing?.targetExam) ? existing.targetExam : 'नेपाल राष्ट्र बैंक - सहायक (तह ४)',
      xp: (isSame && existing?.xp) ? Math.max(existing.xp, 150) : 150,
      level: (isSame && existing?.level) ? existing.level : 1,
      streak: (isSame && existing?.streak) ? Math.max(existing.streak, 1) : 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      registeredAt: (isSame && existing?.registeredAt) ? existing.registeredAt : new Date().toISOString(),
      questionsSolved: (isSame && existing?.questionsSolved) ? existing.questionsSolved : 0,
      quizzesCompleted: (isSame && existing?.quizzesCompleted) ? existing.quizzesCompleted : 0,
      accuracy: (isSame && existing?.accuracy) ? existing.accuracy : 100,
      rank: (isSame && existing?.rank) ? existing.rank : 'तह ४: नयाँ प्रतियोगी (Aspirant)',
      isRegistered: true,
      isGuest: false,
      role: isOwner ? 'admin' : (isSame && existing?.role ? existing.role : 'student'),
      isPro: isOwner ? true : (isSame ? Boolean(existing?.isPro || existing?.isProUser) : false),
      isProUser: isOwner ? true : (isSame ? Boolean(existing?.isPro || existing?.isProUser) : false),
      proStatus: isOwner ? 'active' : (isSame && existing?.proStatus ? existing.proStatus : 'inactive'),
      profileCompletion: 70,
      hasReceivedCompletionBonus: (isSame && existing?.hasReceivedCompletionBonus) ? true : false
    };

    // Synchronize to Firestore
    this.syncUserProfileToFirestore(profile).catch(() => {});

    // Log real-time login event in Firebase Realtime Database & Firestore
    ActivityTrackingService.logActivity({
      user: profile,
      activityType: 'login',
      targetId: profile.authUid || profile.id,
      targetTitle: 'प्रयोगकर्ता लगइन (Email Login)',
      details: `${profile.displayName || profile.name} प्रणालीमा लगइन हुनुभयो।`,
      metadata: { email: profile.email, provider: 'email' }
    }).catch(() => {});

    return profile;
  }

  /**
   * Email/Password Sign-Up
   */
  static async signUpWithEmail(name: string, email: string, pass: string, targetExam?: string): Promise<UserProfile> {
    const authInst = this.getAuthInstance();
    const result = await createUserWithEmailAndPassword(authInst, email.trim().toLowerCase(), pass);
    const fbUser = result.user;

    const cleanEmail = fbUser.email?.toLowerCase().trim() || email.toLowerCase().trim();
    const cleanName = name.trim() || cleanEmail.split('@')[0] || 'नयाँ परीक्षार्थी';
    const photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=0B2046&color=fff&size=256`;
    const uid = fbUser.uid;
    const isOwner = isOwnerAdmin(cleanEmail);

    const profile: UserProfile = {
      id: uid,
      authUid: uid,
      authProvider: 'email',
      isGoogleUser: false,
      name: cleanName,
      displayName: cleanName,
      email: cleanEmail,
      photoURL,
      avatarUrl: photoURL,
      phone: '',
      province: 'बागमती प्रदेश',
      district: 'काठमाडौं',
      targetExam: targetExam || 'नेपाल राष्ट्र बैंक (NRB) - सहायक ४',
      xp: 200,
      level: 1,
      streak: 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      registeredAt: new Date().toISOString(),
      questionsSolved: 0,
      quizzesCompleted: 0,
      accuracy: 100,
      rank: 'तह ४: नयाँ प्रतियोगी (Aspirant)',
      isRegistered: true,
      isGuest: false,
      role: isOwner ? 'admin' : 'student',
      isPro: isOwner ? true : false,
      isProUser: isOwner ? true : false,
      proStatus: isOwner ? 'active' : 'inactive',
      profileCompletion: 80,
      hasReceivedCompletionBonus: false
    };

    // Synchronize to Firestore users collection in real-time
    this.syncUserProfileToFirestore(profile).catch(() => {});

    // Log real-time registration & login event
    ActivityTrackingService.logActivity({
      user: profile,
      activityType: 'login',
      targetId: profile.authUid || profile.id,
      targetTitle: 'नयाँ प्रयोगकर्ता दर्ता तथा लगइन (Registration & Login)',
      details: `${profile.displayName || profile.name} प्रणालीमा दर्ता भई लगइन हुनुभयो।`,
      metadata: { email: profile.email, provider: 'email' }
    }).catch(() => {});

    return profile;
  }

  /**
   * Send Password Reset Link
   */
  static async sendPasswordReset(email: string): Promise<void> {
    const authInst = this.getAuthInstance();
    await sendPasswordResetEmail(authInst, email.trim().toLowerCase());
  }

  /**
   * Sign Out
   */
  static async signOutUser(): Promise<void> {
    try {
      const authInst = this.getAuthInstance();
      await signOut(authInst);
    } catch (e) {
      console.warn('Firebase sign out error:', e);
    }
  }

  private static subscribers = new Set<(user: UserProfile | null) => void>();
  private static cachedUserProfile: UserProfile | null = null;
  private static cachedSignature: string | null = null;
  private static isAuthListenerStarted: boolean = false;
  private static hasAuthSettled: boolean = false;

  /**
   * Check if Firebase Auth has resolved its initial check
   */
  static isAuthSettled(): boolean {
    return this.hasAuthSettled;
  }

  /**
   * Get currently memoized user profile without triggering re-fetch
   */
  static getCachedUser(): UserProfile | null {
    return this.cachedUserProfile;
  }

  /**
   * Internal master listener to Firebase Auth
   */
  private static initMasterAuthListener(): void {
    if (this.isAuthListenerStarted) return;
    this.isAuthListenerStarted = true;

    const authInst = this.getAuthInstance();
    if (!authInst) return;

    onAuthStateChanged(authInst, (fbUser) => {
      this.hasAuthSettled = true;

      if (fbUser && fbUser.email) {
        const cleanEmail = fbUser.email.toLowerCase().trim();
        const displayName = fbUser.displayName?.trim() || cleanEmail.split('@')[0] || 'परीक्षार्थी';
        const photoURL = fbUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0B2046&color=fff&size=256`;
        const uid = fbUser.uid;
        const signature = `${uid}:${cleanEmail}:${displayName}:${photoURL}`;

        // If user signature is unchanged and profile is cached, prevent duplicate re-render triggers
        if (this.cachedSignature === signature && this.cachedUserProfile) {
          return;
        }

        const isOwner = isOwnerAdmin(cleanEmail);
        const existing = StorageService.getUserProfile();
        const isSame = existing && (existing.email?.toLowerCase().trim() === cleanEmail || existing.authUid === uid);

        const profile: UserProfile = {
          ...(isSame ? existing : {}),
          id: uid,
          authUid: uid,
          authProvider: (fbUser.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'email') as any,
          isGoogleUser: fbUser.providerData?.[0]?.providerId === 'google.com',
          name: displayName,
          displayName,
          email: cleanEmail,
          photoURL,
          avatarUrl: photoURL,
          phone: fbUser.phoneNumber || (isSame ? existing?.phone : '') || '',
          province: (isSame && existing?.province) ? existing.province : 'बागमती प्रदेश',
          district: (isSame && existing?.district) ? existing.district : 'काठमाडौं',
          targetExam: (isSame && existing?.targetExam) ? existing.targetExam : 'नेपाल राष्ट्र बैंक - सहायक (तह ४)',
          xp: (isSame && existing?.xp) ? Math.max(existing.xp, 250) : 250,
          level: (isSame && existing?.level) ? existing.level : 1,
          streak: (isSame && existing?.streak) ? Math.max(existing.streak, 1) : 1,
          lastActiveDate: new Date().toISOString().split('T')[0],
          registeredAt: (isSame && existing?.registeredAt) ? existing.registeredAt : new Date().toISOString(),
          questionsSolved: (isSame && existing?.questionsSolved) ? existing.questionsSolved : 0,
          quizzesCompleted: (isSame && existing?.quizzesCompleted) ? existing.quizzesCompleted : 0,
          accuracy: (isSame && existing?.accuracy) ? existing.accuracy : 100,
          rank: (isSame && existing?.rank) ? existing.rank : 'तह ४: नयाँ प्रतियोगी (Aspirant)',
          isRegistered: true,
          isGuest: false,
          role: isOwner ? 'admin' : (isSame && existing?.role ? existing.role : 'student'),
          isPro: isOwner ? true : (isSame ? Boolean(existing?.isPro || existing?.isProUser) : false),
          isProUser: isOwner ? true : (isSame ? Boolean(existing?.isPro || existing?.isProUser) : false),
          proStatus: isOwner ? 'active' : (isSame && existing?.proStatus ? existing.proStatus : 'inactive'),
          profileCompletion: 85,
          hasReceivedCompletionBonus: (isSame && existing?.hasReceivedCompletionBonus) ? true : false
        };

        this.cachedUserProfile = profile;
        this.cachedSignature = signature;

        // Broadcast to all active subscribers
        this.subscribers.forEach((cb) => {
          try {
            cb(profile);
          } catch (e) {
            console.error('Auth subscriber callback error:', e);
          }
        });
      } else {
        // Firebase emitted null
        if (this.cachedUserProfile === null && this.cachedSignature === null) {
          // Already null, do not re-broadcast
          return;
        }

        this.cachedUserProfile = null;
        this.cachedSignature = null;

        this.subscribers.forEach((cb) => {
          try {
            cb(null);
          } catch (e) {
            console.error('Auth subscriber callback error:', e);
          }
        });
      }
    });
  }

  /**
   * Listen to Firebase Auth state changes (Memoized & Deduplicated)
   */
  static onAuthStateChanged(callback: (user: UserProfile | null) => void): () => void {
    this.subscribers.add(callback);
    this.initMasterAuthListener();

    // If auth state has already settled, immediately provide cached state to new subscriber
    if (this.hasAuthSettled) {
      try {
        callback(this.cachedUserProfile);
      } catch (e) {
        console.error('Auth initial callback error:', e);
      }
    }

    return () => {
      this.subscribers.delete(callback);
    };
  }
}
