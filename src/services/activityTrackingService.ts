import { collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { ref, push, set } from 'firebase/database';
import { db, rtdb, auth } from '../firebase';
import { UserActivityRecord, DownloadEventRecord, ExamScoreRecord, ExamSubmissionRecord, UserProfile } from '../types';
import { isExcludedAdminActivity } from '../utils/sanitizer';

export type { UserActivityRecord, DownloadEventRecord, ExamScoreRecord, ExamSubmissionRecord };
export type ActivityLogRecord = UserActivityRecord;

const STORAGE_KEYS = {
  USER_ACTIVITIES: 'btn_user_activities_cache',
  DOWNLOAD_EVENTS: 'btn_download_events_cache',
  EXAM_SCORES: 'btn_exam_scores_cache',
  EXAM_SUBMISSIONS: 'btn_exam_submissions_cache',
};

export class ActivityTrackingService {
  /**
   * Helper to resolve currently authenticated user details safely
   */
  private static resolveUserDetails(user?: Partial<UserProfile> | null): {
    uid: string;
    email: string;
    displayName: string;
    isValid: boolean;
  } {
    const authUser = auth?.currentUser;
    const email = (user && !user.isGuest && user.email)
      ? user.email.trim()
      : (authUser?.email || '');

    const uid = (user && !user.isGuest && (user.authUid || user.id))
      ? (user.authUid || user.id)!
      : (authUser?.uid || '');

    const displayName = (user && !user.isGuest && (user.displayName || user.name))
      ? (user.displayName || user.name)!
      : (authUser?.displayName || (email ? email.split('@')[0] : 'विद्यार्थी'));

    const isValid = Boolean(email || uid);
    return {
      uid: uid || (email ? `usr-${email.split('@')[0]}` : 'anonymous_student'),
      email,
      displayName,
      isValid
    };
  }

  /**
   * Log authenticated user activity (e.g. detailed reading material, study notes, syllabus, login)
   */
  static async logActivity(params: {
    user?: Partial<UserProfile> | null;
    activityType: 'reading' | 'download' | 'exam_start' | 'exam_complete' | 'syllabus_view' | 'login';
    details: string;
    targetId?: string;
    targetTitle?: string;
    metadata?: Record<string, any>;
  }): Promise<UserActivityRecord | null> {
    const resolved = this.resolveUserDetails(params.user);
    if (!resolved.isValid && !params.user?.isGuest) {
      return null;
    }

    const record: UserActivityRecord = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: resolved.uid,
      userName: resolved.displayName,
      userEmail: resolved.email,
      activityType: params.activityType,
      details: params.details,
      timestamp: new Date().toISOString(),
      metadata: {
        ...(params.metadata || {}),
        ...(params.targetId ? { targetId: params.targetId } : {}),
        ...(params.targetTitle ? { targetTitle: params.targetTitle } : {})
      }
    };

    // 1. Cache locally for instant availability
    try {
      const cached = this.getLocalActivities(false);
      cached.unshift(record);
      localStorage.setItem(STORAGE_KEYS.USER_ACTIVITIES, JSON.stringify(cached.slice(0, 200)));
    } catch (e) {
      console.warn('Local activity cache warning:', e);
    }

    // 2. Persist to Firebase Realtime Database (rtdb) for instant multi-user stream
    try {
      if (rtdb) {
        const actRef = push(ref(rtdb, 'user_activities'));
        set(actRef, record).catch(() => {});
        if (resolved.uid && resolved.uid !== 'anonymous_student') {
          set(ref(rtdb, `users/${resolved.uid}/lastActivity`), {
            ...record,
            lastSeenAt: new Date().toISOString()
          }).catch(() => {});
        }
      }
    } catch (rtdbErr) {
      console.warn('Realtime Database activity logging warning:', rtdbErr);
    }

    // 3. Persist to Firestore collection `user_activities`
    try {
      if (db) {
        await addDoc(collection(db, 'user_activities'), record);
      }
    } catch (fsErr) {
      console.warn('Firestore activity log warning:', fsErr);
    }

    // 4. Dual sync to backend API endpoint
    try {
      fetch('/api/tracking/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }).catch(() => {});
    } catch {}

    return record;
  }

  /**
   * Log authenticated user resource / PDF download event
   */
  static async logDownload(params: {
    user?: Partial<UserProfile> | null;
    resourceName?: string;
    fileType?: string;
    details?: string;
    fileId?: string;
    fileName?: string;
    resourceCategory?: string;
    fileSize?: string;
  }): Promise<DownloadEventRecord | null> {
    const resolved = this.resolveUserDetails(params.user);
    if (!resolved.isValid) {
      return null;
    }

    const name = params.resourceName || params.fileName || 'Study Material';
    const type = params.fileType || 'PDF';

    const record: DownloadEventRecord = {
      id: `dl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: resolved.uid,
      userName: resolved.displayName,
      userEmail: resolved.email,
      resourceName: name,
      fileType: type,
      fileName: params.fileName || name,
      fileId: params.fileId,
      resourceCategory: params.resourceCategory,
      fileSize: params.fileSize,
      details: params.details || `डाउनलोड: ${name}`,
      timestamp: new Date().toISOString()
    };

    // 1. Cache locally
    try {
      const cached = this.getLocalDownloads();
      cached.unshift(record);
      localStorage.setItem(STORAGE_KEYS.DOWNLOAD_EVENTS, JSON.stringify(cached.slice(0, 200)));
    } catch (e) {
      console.warn('Local download cache warning:', e);
    }

    // 2. Realtime Database logging
    try {
      if (rtdb) {
        const dlRef = push(ref(rtdb, 'download_events'));
        set(dlRef, record).catch(() => {});
      }
    } catch (rtdbErr) {
      console.warn('Realtime Database download log warning:', rtdbErr);
    }

    // 3. Persist to Firestore collection `download_events`
    try {
      if (db) {
        await addDoc(collection(db, 'download_events'), record);
      }
    } catch (fsErr) {
      console.warn('Firestore download log warning:', fsErr);
    }

    // 4. Also log as general activity
    this.logActivity({
      user: params.user as UserProfile,
      activityType: 'download',
      details: `डाउनलोड: ${name} (${type})`,
      targetId: params.fileId,
      targetTitle: name,
      metadata: { resourceName: name, fileType: type, category: params.resourceCategory }
    }).catch(() => {});

    // 5. Dual sync to backend API
    try {
      fetch('/api/tracking/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }).catch(() => {});
    } catch {}

    return record;
  }

  /**
   * Log authenticated user exam score directly to Realtime Database and Firestore
   */
  static async logExamScore(params: {
    user?: Partial<UserProfile> | null;
    quizId: string;
    quizTitle: string;
    category: string;
    mode?: string;
    score?: number;
    totalQuestions: number;
    correctAnswers?: number;
    incorrectAnswers?: number;
    negativeDeduction?: number;
    accuracy: number;
    timeElapsedSeconds?: number;
    attempted?: number;
    correct?: number;
    incorrect?: number;
    skipped?: number;
    netScore?: number;
    timeTakenSeconds?: number;
  }): Promise<ExamScoreRecord | null> {
    const resolved = this.resolveUserDetails(params.user);
    if (!resolved.isValid) {
      return null;
    }

    const netScore = params.score ?? params.netScore ?? 0;
    const correct = params.correctAnswers ?? params.correct ?? 0;
    const incorrect = params.incorrectAnswers ?? params.incorrect ?? 0;
    const timeSpent = params.timeElapsedSeconds ?? params.timeTakenSeconds ?? 0;

    const record: ExamScoreRecord = {
      id: `score-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: resolved.uid,
      userName: resolved.displayName,
      userEmail: resolved.email,
      quizId: params.quizId,
      quizTitle: params.quizTitle,
      category: params.category,
      mode: params.mode || 'practice',
      score: netScore,
      totalQuestions: params.totalQuestions,
      correctAnswers: correct,
      incorrectAnswers: incorrect,
      negativeDeduction: params.negativeDeduction || 0,
      accuracy: params.accuracy,
      timeElapsedSeconds: timeSpent,
      timestamp: new Date().toISOString()
    };

    // 1. Cache locally
    try {
      const cached = this.getLocalExamScores(false);
      cached.unshift(record);
      localStorage.setItem(STORAGE_KEYS.EXAM_SCORES, JSON.stringify(cached.slice(0, 200)));
    } catch (e) {
      console.warn('Local exam score cache warning:', e);
    }

    // 2. Persist to Firebase Realtime Database (rtdb)
    try {
      if (rtdb) {
        const scoreRef = push(ref(rtdb, 'exam_scores'));
        set(scoreRef, record).catch(() => {});
        if (resolved.uid && resolved.uid !== 'anonymous_student') {
          set(ref(rtdb, `users/${resolved.uid}/latestExamScore`), record).catch(() => {});
        }
      }
    } catch (rtdbErr) {
      console.warn('Realtime Database exam score log warning:', rtdbErr);
    }

    // 3. Persist to Firestore collection `exam_scores`
    try {
      if (db) {
        await addDoc(collection(db, 'exam_scores'), record);
      }
    } catch (fsErr) {
      console.warn('Firestore exam score log warning:', fsErr);
    }

    // 4. Dual sync to backend API
    try {
      fetch('/api/tracking/exam-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      }).catch(() => {});
    } catch {}

    // 5. Synchronize with exam_submissions collection as well
    this.recordExamSubmission({
      user: params.user as UserProfile,
      quizId: params.quizId,
      quizTitle: params.quizTitle,
      category: params.category,
      score: netScore,
      totalQuestions: params.totalQuestions,
      attemptedCount: params.attempted ?? (correct + incorrect),
      correctAnswers: correct,
      incorrectAnswers: incorrect,
      skippedCount: params.skipped ?? Math.max(0, params.totalQuestions - (correct + incorrect)),
      negativeDeduction: params.negativeDeduction ?? 0,
      accuracy: params.accuracy,
      timeTakenSeconds: timeSpent
    }).catch(() => {});

    return record;
  }

  /**
   * Record complete student exam submission to Realtime Database & Firestore `exam_submissions` collection in real-time
   */
  static async recordExamSubmission(params: {
    user?: Partial<UserProfile> | null;
    quizId: string;
    quizTitle: string;
    category?: string;
    score: number;
    totalQuestions: number;
    accuracy: number;
    timeTakenSeconds: number;
    attemptedCount?: number;
    correctAnswers?: number;
    incorrectAnswers?: number;
    skippedCount?: number;
    negativeDeduction?: number;
  }): Promise<ExamSubmissionRecord | null> {
    const resolved = this.resolveUserDetails(params.user);
    if (!resolved.isValid) {
      return null;
    }

    const submission: ExamSubmissionRecord = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: resolved.uid,
      userName: resolved.displayName,
      userEmail: resolved.email,
      quizId: params.quizId,
      quizTitle: params.quizTitle,
      category: params.category || 'General Banking',
      score: Math.round(params.score * 100) / 100,
      totalQuestions: params.totalQuestions,
      attemptedCount: params.attemptedCount ?? ((params.correctAnswers ?? 0) + (params.incorrectAnswers ?? 0)),
      correctAnswers: params.correctAnswers ?? 0,
      incorrectAnswers: params.incorrectAnswers ?? 0,
      skippedCount: params.skippedCount ?? Math.max(0, params.totalQuestions - ((params.correctAnswers ?? 0) + (params.incorrectAnswers ?? 0))),
      negativeDeduction: params.negativeDeduction ?? 0,
      accuracy: Math.round(params.accuracy * 10) / 10,
      timeTakenSeconds: params.timeTakenSeconds,
      timestamp: new Date().toISOString(),
      submittedAt: new Date().toISOString()
    };

    // 1. Cache locally for instant offline availability
    try {
      const cached = this.getLocalExamSubmissions(false);
      cached.unshift(submission);
      localStorage.setItem(STORAGE_KEYS.EXAM_SUBMISSIONS, JSON.stringify(cached.slice(0, 200)));
    } catch (e) {
      console.warn('Local exam submission cache notice:', e);
    }

    // 2. Real-time logging to Firebase Realtime Database
    try {
      if (rtdb) {
        const subRef = push(ref(rtdb, 'exam_submissions'));
        set(subRef, submission).catch(() => {});
        if (resolved.uid && resolved.uid !== 'anonymous_student') {
          set(ref(rtdb, `users/${resolved.uid}/latestSubmission`), submission).catch(() => {});
        }
      }
    } catch (rtdbErr) {
      console.warn('Realtime Database exam submission log warning:', rtdbErr);
    }

    // 3. Real-time logging to Firestore `exam_submissions` collection
    try {
      if (db) {
        await addDoc(collection(db, 'exam_submissions'), submission);
      }
    } catch (fsErr) {
      console.warn('Firestore exam_submissions recording warning:', fsErr);
    }

    // 4. Dual sync to backend API endpoint
    try {
      fetch('/api/tracking/exam-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      }).catch(() => {});
    } catch {}

    return submission;
  }

  // ==========================================
  // GETTERS FOR ADMIN VIEWING WITH ADMIN FILTERING
  // ==========================================

  static getLocalActivities(filterAdmins: boolean = false): UserActivityRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_ACTIVITIES);
      if (raw) {
        const list: UserActivityRecord[] = JSON.parse(raw);
        return filterAdmins ? list.filter(a => !isExcludedAdminActivity(a.userEmail)) : list;
      }
    } catch {}
    return [];
  }

  static getLocalDownloads(): DownloadEventRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DOWNLOAD_EVENTS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  static getLocalExamScores(filterAdmins: boolean = false): ExamScoreRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EXAM_SCORES);
      if (raw) {
        const list: ExamScoreRecord[] = JSON.parse(raw);
        return filterAdmins ? list.filter(s => !isExcludedAdminActivity(s.userEmail)) : list;
      }
    } catch {}
    return [];
  }

  static getLocalExamSubmissions(filterAdmins: boolean = false): ExamSubmissionRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EXAM_SUBMISSIONS);
      if (raw) {
        const list: ExamSubmissionRecord[] = JSON.parse(raw);
        return filterAdmins ? list.filter(s => !isExcludedAdminActivity(s.userEmail)) : list;
      }
    } catch {}
    return [];
  }

  /**
   * Fetch all activities with Firestore real-time priority + local fallback
   */
  static async getRecentActivities(limitCount: number = 100, filterAdmins: boolean = false): Promise<UserActivityRecord[]> {
    let result: UserActivityRecord[] = [];
    try {
      if (db) {
        const q = query(collection(db, 'user_activities'), orderBy('timestamp', 'desc'), limit(limitCount * 2));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const list: UserActivityRecord[] = [];
          snapshot.forEach(doc => {
            list.push({ id: doc.id, ...(doc.data() as any) });
          });
          result = list;
        }
      }
    } catch (e) {
      console.warn('Firestore fetch activities fallback to local:', e);
    }

    if (result.length === 0) {
      // Try backend API
      try {
        const res = await fetch('/api/tracking/activities');
        if (res.ok) {
          const data = await res.json();
          if (data && data.activities && data.activities.length > 0) {
            result = data.activities;
          }
        }
      } catch {}
    }

    if (result.length === 0) {
      result = this.getLocalActivities(false);
    }

    if (filterAdmins) {
      result = result.filter(a => !isExcludedAdminActivity(a.userEmail));
    }

    return result.slice(0, limitCount);
  }

  /**
   * Fetch all download events with Firestore priority + local fallback
   */
  static async getRecentDownloads(limitCount: number = 100): Promise<DownloadEventRecord[]> {
    try {
      if (db) {
        const q = query(collection(db, 'download_events'), orderBy('timestamp', 'desc'), limit(limitCount));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const list: DownloadEventRecord[] = [];
          snapshot.forEach(doc => {
            list.push({ id: doc.id, ...(doc.data() as any) });
          });
          return list;
        }
      }
    } catch (e) {
      console.warn('Firestore fetch downloads fallback to local:', e);
    }

    // Try backend API
    try {
      const res = await fetch('/api/tracking/downloads');
      if (res.ok) {
        const data = await res.json();
        if (data && data.downloads && data.downloads.length > 0) {
          return data.downloads;
        }
      }
    } catch {}

    return this.getLocalDownloads();
  }

  /**
   * Fetch all exam scores with Firestore priority + local fallback
   */
  static async getRecentExamScores(limitCount: number = 100, filterAdmins: boolean = false): Promise<ExamScoreRecord[]> {
    let result: ExamScoreRecord[] = [];
    try {
      if (db) {
        const q = query(collection(db, 'exam_scores'), orderBy('timestamp', 'desc'), limit(limitCount * 2));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const list: ExamScoreRecord[] = [];
          snapshot.forEach(doc => {
            list.push({ id: doc.id, ...(doc.data() as any) });
          });
          result = list;
        }
      }
    } catch (e) {
      console.warn('Firestore fetch exam scores fallback to local:', e);
    }

    if (result.length === 0) {
      // Try backend API
      try {
        const res = await fetch('/api/tracking/exam-scores');
        if (res.ok) {
          const data = await res.json();
          if (data && data.scores && data.scores.length > 0) {
            result = data.scores;
          }
        }
      } catch {}
    }

    if (result.length === 0) {
      result = this.getLocalExamScores(false);
    }

    if (filterAdmins) {
      result = result.filter(s => !isExcludedAdminActivity(s.userEmail));
    }

    return result.slice(0, limitCount);
  }

  /**
   * Fetch all exam submissions with Firestore priority + local fallback
   */
  static async getRecentExamSubmissions(limitCount: number = 100, filterAdmins: boolean = false): Promise<ExamSubmissionRecord[]> {
    let result: ExamSubmissionRecord[] = [];
    try {
      if (db) {
        const q = query(collection(db, 'exam_submissions'), orderBy('timestamp', 'desc'), limit(limitCount * 2));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const list: ExamSubmissionRecord[] = [];
          snapshot.forEach(doc => {
            list.push({ id: doc.id, ...(doc.data() as any) });
          });
          result = list;
        }
      }
    } catch (e) {
      console.warn('Firestore fetch exam submissions fallback to local:', e);
    }

    if (result.length === 0) {
      // Try backend API
      try {
        const res = await fetch('/api/tracking/exam-submissions');
        if (res.ok) {
          const data = await res.json();
          if (data && data.submissions && data.submissions.length > 0) {
            result = data.submissions;
          }
        }
      } catch {}
    }

    if (result.length === 0) {
      result = this.getLocalExamSubmissions(false);
    }

    if (filterAdmins) {
      result = result.filter(s => !isExcludedAdminActivity(s.userEmail));
    }

    return result.slice(0, limitCount);
  }
}
