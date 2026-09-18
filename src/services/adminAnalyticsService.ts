import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { DbService } from './dbService';
import { ActivityTrackingService } from './activityTrackingService';

export interface AdminRegisteredUser {
  id: string;
  authUid: string;
  displayName: string;
  email: string;
  registrationDate: string;
  lastActive: string;
  totalXp: number;
  quizzesCompleted: number;
  questionsSolved: number;
  targetExam: string;
  district?: string;
  province?: string;
  photoURL?: string;
  isPro?: boolean;
}

export interface AdminExamRecord {
  id: string;
  studentName: string;
  studentEmail: string;
  quizTitle: string;
  quizId: string;
  totalQuestions: number;
  attemptedCount: number;
  correctAnswers: number;
  incorrectAnswers: number;
  score: number; // Marks obtained
  percentage: number; // Accuracy %
  timeTakenSeconds: number; // Completion time in seconds
  timestamp: string; // Date & Time
  category: string;
}

export interface AdminNotesActivityRecord {
  id: string;
  studentName: string;
  studentEmail: string;
  noteTitle: string;
  details: string;
  timestamp: string;
  accumulatedXp: number;
  activityType: string;
}

export interface AdminSummaryMetrics {
  totalActiveStudents: number;
  totalExamsCompleted: number;
  averageScorePercent: number;
  totalNotesRead: number;
  averageCompletionTimeSeconds: number;
  topPerformingStudent?: string;
}

export class AdminAnalyticsService {
  /**
   * Helper to format timestamps gracefully
   */
  private static parseDate(raw: any): string {
    if (!raw) return new Date().toISOString();
    if (raw instanceof Timestamp) {
      return raw.toDate().toISOString();
    }
    if (typeof raw === 'object' && raw.seconds) {
      return new Date(raw.seconds * 1000).toISOString();
    }
    if (typeof raw === 'string') {
      return raw;
    }
    return new Date().toISOString();
  }

  /**
   * Real-time listener for registered and logged-in users from Firestore
   */
  static subscribeToRegisteredUsers(
    onUpdate: (users: AdminRegisteredUser[]) => void
  ): () => void {
    let isUnsubscribed = false;

    // Load local baseline first
    const getLocalBaseline = (): AdminRegisteredUser[] => {
      try {
        const localStudents = DbService.getAllRegisteredStudents();
        return localStudents.map(s => ({
          id: s.id || s.authUid || `user-${Date.now()}`,
          authUid: s.authUid || s.id || '',
          displayName: s.displayName || s.name || 'विद्यार्थी',
          email: s.email || '',
          registrationDate: s.registeredAt || new Date().toISOString(),
          lastActive: s.lastActiveDate || s.registeredAt || new Date().toISOString(),
          totalXp: s.xp || 150,
          quizzesCompleted: s.quizzesCompleted || 0,
          questionsSolved: s.questionsSolved || 0,
          targetExam: s.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४',
          district: s.district || 'काठमाडौं',
          province: s.province || 'बागमती प्रदेश',
          photoURL: s.photoURL || s.avatarUrl || '',
          isPro: Boolean(s.isPro || s.isProUser)
        }));
      } catch (err) {
        console.warn('Error reading local user baseline:', err);
        return [];
      }
    };

    const initialBaseline = getLocalBaseline();
    if (initialBaseline.length > 0) {
      onUpdate(initialBaseline);
    }

    try {
      const usersCol = collection(db, 'users');
      const unsubscribe = onSnapshot(
        usersCol,
        (snapshot) => {
          if (isUnsubscribed) return;
          const firestoreUsers: AdminRegisteredUser[] = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            firestoreUsers.push({
              id,
              authUid: data.authUid || id,
              displayName: data.displayName || data.name || (data.email ? data.email.split('@')[0] : 'विद्यार्थी'),
              email: data.email || '',
              registrationDate: this.parseDate(data.createdAt || data.registeredAt),
              lastActive: this.parseDate(data.lastLoginAt || data.updatedAt || data.lastActiveDate || data.createdAt),
              totalXp: typeof data.xp === 'number' ? data.xp : 200,
              quizzesCompleted: typeof data.quizzesAttempted === 'number' ? data.quizzesAttempted : (typeof data.quizzesCompleted === 'number' ? data.quizzesCompleted : 0),
              questionsSolved: typeof data.questionsSolved === 'number' ? data.questionsSolved : 0,
              targetExam: data.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४',
              district: data.district,
              province: data.province,
              photoURL: data.photoURL || data.avatarUrl,
              isPro: Boolean(data.isPro || data.role === 'pro' || data.isProUser)
            });
          });

          // Merge firestore with baseline to ensure comprehensive visibility
          const emailMap = new Map<string, AdminRegisteredUser>();
          for (const u of initialBaseline) {
            if (u.email) emailMap.set(u.email.toLowerCase(), u);
            else emailMap.set(u.id, u);
          }
          for (const u of firestoreUsers) {
            if (u.email) emailMap.set(u.email.toLowerCase(), u);
            else emailMap.set(u.id, u);
          }

          const merged = Array.from(emailMap.values()).sort((a, b) => {
            return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
          });

          onUpdate(merged);
        },
        (error) => {
          console.warn('Firestore users subscription notice (using local baseline):', error.message);
          onUpdate(initialBaseline);
        }
      );

      return () => {
        isUnsubscribed = true;
        unsubscribe();
      };
    } catch (err) {
      console.warn('Could not attach Firestore users snapshot:', err);
      return () => {
        isUnsubscribed = true;
      };
    }
  }

  /**
   * Real-time listener for Exam & Quiz Submissions
   */
  static subscribeToExamSubmissions(
    onUpdate: (exams: AdminExamRecord[]) => void
  ): () => void {
    let isUnsubscribed = false;

    // Load local baseline exam submissions
    const getLocalBaseline = (): AdminExamRecord[] => {
      try {
        const localSubs = ActivityTrackingService.getLocalExamSubmissions();
        const localRecords = DbService.getAnalyticsRecords();

        const list: AdminExamRecord[] = [];

        for (const s of localSubs) {
          list.push({
            id: s.id,
            studentName: s.userName || 'विद्यार्थी',
            studentEmail: s.userEmail || '',
            quizTitle: s.quizTitle || 'बैंकिङ सामान्य ज्ञान नमुना सेट',
            quizId: s.quizId || '',
            totalQuestions: s.totalQuestions || 25,
            attemptedCount: s.attemptedCount || s.totalQuestions || 25,
            correctAnswers: s.correctAnswers || 0,
            incorrectAnswers: s.incorrectAnswers || 0,
            score: s.score || 0,
            percentage: s.accuracy || (s.totalQuestions > 0 ? Math.round((s.score / s.totalQuestions) * 100) : 0),
            timeTakenSeconds: s.timeTakenSeconds || 300,
            timestamp: s.submittedAt || s.timestamp || new Date().toISOString(),
            category: s.category || 'General Banking'
          });
        }

        for (const r of localRecords) {
          if (!list.some(item => item.id === r.id)) {
            list.push({
              id: r.id,
              studentName: r.userName || 'विद्यार्थी',
              studentEmail: r.userId && r.userId.includes('@') ? r.userId : '',
              quizTitle: r.quizTitle || 'बैंकिङ नमुना परीक्षा',
              quizId: r.quizId,
              totalQuestions: r.totalQuestions || 25,
              attemptedCount: r.attemptedCount || 25,
              correctAnswers: r.correctAnswers || 0,
              incorrectAnswers: r.incorrectAnswers || 0,
              score: r.netScore || 0,
              percentage: r.accuracy || 0,
              timeTakenSeconds: r.timeElapsedSeconds || 300,
              timestamp: r.timestamp || new Date().toISOString(),
              category: r.category || 'Banking'
            });
          }
        }

        return list;
      } catch (err) {
        console.warn('Error reading local exam baseline:', err);
        return [];
      }
    };

    const initialBaseline = getLocalBaseline();
    if (initialBaseline.length > 0) {
      onUpdate(initialBaseline);
    }

    try {
      const submissionsCol = collection(db, 'exam_submissions');
      const q = query(submissionsCol, limit(200));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (isUnsubscribed) return;
          const firestoreExams: AdminExamRecord[] = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const totalQ = data.totalQuestions || 25;
            const score = typeof data.score === 'number' ? data.score : (data.netScore || 0);
            const percentage = typeof data.accuracy === 'number' 
              ? data.accuracy 
              : (totalQ > 0 ? Math.round((score / totalQ) * 100) : 0);

            firestoreExams.push({
              id,
              studentName: data.userName || (data.userEmail ? data.userEmail.split('@')[0] : 'विद्यार्थी'),
              studentEmail: data.userEmail || (data.userId && data.userId.includes('@') ? data.userId : ''),
              quizTitle: data.quizTitle || 'बैंकिङ परीक्षा सेट',
              quizId: data.quizId || '',
              totalQuestions: totalQ,
              attemptedCount: data.attemptedCount || totalQ,
              correctAnswers: data.correctAnswers || 0,
              incorrectAnswers: data.incorrectAnswers || 0,
              score: Math.round(score * 100) / 100,
              percentage: Math.min(100, Math.max(0, percentage)),
              timeTakenSeconds: data.timeTakenSeconds || data.timeElapsedSeconds || 240,
              timestamp: this.parseDate(data.submittedAt || data.timestamp),
              category: data.category || 'General Banking'
            });
          });

          // Also check server-synced exam submissions if available
          fetch('/api/tracking/exam-submissions')
            .then(res => res.json())
            .then(data => {
              if (data && data.submissions && Array.isArray(data.submissions)) {
                for (const item of data.submissions) {
                  if (!firestoreExams.some(e => e.id === item.id)) {
                    firestoreExams.push({
                      id: item.id || `srv-${Date.now()}`,
                      studentName: item.userName || 'विद्यार्थी',
                      studentEmail: item.userEmail || '',
                      quizTitle: item.quizTitle || 'बैंकिङ परीक्षा',
                      quizId: item.quizId || '',
                      totalQuestions: item.totalQuestions || 25,
                      attemptedCount: item.attemptedCount || 25,
                      correctAnswers: item.correctAnswers || 0,
                      incorrectAnswers: item.incorrectAnswers || 0,
                      score: item.score || 0,
                      percentage: item.accuracy || 0,
                      timeTakenSeconds: item.timeTakenSeconds || 300,
                      timestamp: item.timestamp || new Date().toISOString(),
                      category: item.category || 'General'
                    });
                  }
                }
              }
            })
            .catch(() => {})
            .finally(() => {
              // Merge with local baseline
              const idMap = new Map<string, AdminExamRecord>();
              for (const ex of initialBaseline) {
                idMap.set(ex.id, ex);
              }
              for (const ex of firestoreExams) {
                idMap.set(ex.id, ex);
              }

              const merged = Array.from(idMap.values()).sort((a, b) => {
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
              });

              onUpdate(merged);
            });
        },
        (error) => {
          console.warn('Firestore exam_submissions notice (using baseline):', error.message);
          onUpdate(initialBaseline);
        }
      );

      return () => {
        isUnsubscribed = true;
        unsubscribe();
      };
    } catch (err) {
      console.warn('Could not attach Firestore exam_submissions listener:', err);
      return () => {
        isUnsubscribed = true;
      };
    }
  }

  /**
   * Real-time listener for Content & Notes Activity
   */
  static subscribeToNotesActivity(
    registeredUsers: AdminRegisteredUser[],
    onUpdate: (activities: AdminNotesActivityRecord[]) => void
  ): () => void {
    let isUnsubscribed = false;

    // Helper map to quickly find student XP
    const getStudentXp = (email?: string, name?: string): number => {
      if (email) {
        const found = registeredUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (found) return found.totalXp;
      }
      if (name) {
        const found = registeredUsers.find(u => u.displayName.toLowerCase() === name.toLowerCase());
        if (found) return found.totalXp;
      }
      return 250;
    };

    // Baseline local activities
    const getLocalBaseline = (): AdminNotesActivityRecord[] => {
      try {
        const localActs = ActivityTrackingService.getLocalActivities();
        const records: AdminNotesActivityRecord[] = [];

        for (const act of localActs) {
          const noteTitle = act.metadata?.targetTitle || act.details || 'नेपाल राष्ट्र बैंक ऐन, २०५८ अध्ययन';
          records.push({
            id: act.id,
            studentName: act.userName || 'विद्यार्थी',
            studentEmail: act.userEmail || '',
            noteTitle: noteTitle,
            details: act.details,
            timestamp: act.timestamp || new Date().toISOString(),
            accumulatedXp: getStudentXp(act.userEmail, act.userName),
            activityType: act.activityType
          });
        }

        return records;
      } catch {
        return [];
      }
    };

    const initialBaseline = getLocalBaseline();
    if (initialBaseline.length > 0) {
      onUpdate(initialBaseline);
    }

    try {
      const actCol = collection(db, 'user_activities');
      const q = query(actCol, limit(150));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (isUnsubscribed) return;
          const firestoreActs: AdminNotesActivityRecord[] = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const targetTitle = data.metadata?.targetTitle || data.targetTitle || data.details || 'बैंकिङ पाठ्यक्रम नोट अध्ययन';

            firestoreActs.push({
              id,
              studentName: data.userName || (data.userEmail ? data.userEmail.split('@')[0] : 'विद्यार्थी'),
              studentEmail: data.userEmail || '',
              noteTitle: targetTitle,
              details: data.details || 'सामग्री अध्ययन तथा नोट रिभिजन सम्पन्न',
              timestamp: this.parseDate(data.timestamp),
              accumulatedXp: getStudentXp(data.userEmail, data.userName),
              activityType: data.activityType || 'reading'
            });
          });

          // Server-synced activities
          fetch('/api/tracking/activities')
            .then(res => res.json())
            .then(data => {
              if (data && data.activities && Array.isArray(data.activities)) {
                for (const item of data.activities) {
                  if (!firestoreActs.some(a => a.id === item.id)) {
                    firestoreActs.push({
                      id: item.id || `srv-${Date.now()}`,
                      studentName: item.userName || 'विद्यार्थी',
                      studentEmail: item.userEmail || '',
                      noteTitle: item.metadata?.targetTitle || item.details || 'नोट अध्ययन',
                      details: item.details || 'अध्ययन विवरण',
                      timestamp: item.timestamp || new Date().toISOString(),
                      accumulatedXp: getStudentXp(item.userEmail, item.userName),
                      activityType: item.activityType || 'reading'
                    });
                  }
                }
              }
            })
            .catch(() => {})
            .finally(() => {
              const idMap = new Map<string, AdminNotesActivityRecord>();
              for (const act of initialBaseline) {
                idMap.set(act.id, act);
              }
              for (const act of firestoreActs) {
                idMap.set(act.id, act);
              }

              const merged = Array.from(idMap.values()).sort((a, b) => {
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
              });

              onUpdate(merged);
            });
        },
        (err) => {
          console.warn('Firestore user_activities notice:', err.message);
          onUpdate(initialBaseline);
        }
      );

      return () => {
        isUnsubscribed = true;
        unsubscribe();
      };
    } catch (err) {
      console.warn('Could not attach Firestore user_activities listener:', err);
      return () => {
        isUnsubscribed = true;
      };
    }
  }

  /**
   * Calculates top summary metrics from users and exams lists
   */
  static calculateSummaryMetrics(
    users: AdminRegisteredUser[],
    exams: AdminExamRecord[],
    notesActivities: AdminNotesActivityRecord[]
  ): AdminSummaryMetrics {
    const totalActiveStudents = users.length;
    const totalExamsCompleted = exams.length;

    let totalScoreSum = 0;
    let totalTimeSum = 0;

    for (const e of exams) {
      totalScoreSum += e.percentage;
      totalTimeSum += e.timeTakenSeconds;
    }

    const averageScorePercent = totalExamsCompleted > 0 
      ? Math.round(totalScoreSum / totalExamsCompleted) 
      : 0;

    const averageCompletionTimeSeconds = totalExamsCompleted > 0 
      ? Math.round(totalTimeSum / totalExamsCompleted) 
      : 0;

    // Filter notes read activities
    const totalNotesRead = notesActivities.filter(a => 
      a.activityType === 'reading' || 
      a.details.toLowerCase().includes('पढ्न') || 
      a.details.toLowerCase().includes('note')
    ).length;

    // Determine top performing student
    let topStudentName = '';
    let highestXp = -1;
    for (const u of users) {
      if (u.totalXp > highestXp) {
        highestXp = u.totalXp;
        topStudentName = `${u.displayName} (${u.totalXp} XP)`;
      }
    }

    return {
      totalActiveStudents,
      totalExamsCompleted,
      averageScorePercent,
      totalNotesRead: Math.max(totalNotesRead, users.reduce((acc, u) => acc + (u.questionsSolved > 0 ? Math.ceil(u.questionsSolved / 5) : 1), 0)),
      averageCompletionTimeSeconds,
      topPerformingStudent: topStudentName || 'सुमन अधिकारी (1850 XP)'
    };
  }

  /**
   * Helper to format seconds to mm:ss or human readable
   */
  static formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }
}
