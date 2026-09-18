import { ref, set, get, remove, onValue, off } from 'firebase/database';
import { rtdb, auth } from '../firebase';
import { safeStorage } from '../utils/safeHelpers';

export type ExamLevel = 'level4-5' | 'level6-8' | 'level9-10';

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  image?: string;
  pdfAttachment?: {
    name: string;
    sizeBytes: number;
  };
  suggestedTopic?: string;
  timestamp?: number;
  evaluationData?: {
    score?: number; // e.g. 7.5 out of 10
    strengths?: string[];
    weaknesses?: string[];
    tips?: string[];
  };
}

export interface AiChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  level: ExamLevel;
  mode?: 'general' | 'answer_sheet';
  messages: ChatMessage[];
  messageCount: number;
}

const STORAGE_PREFIX = 'btn_ai_chat_sessions_';

/**
 * Intelligent topic title generator based on initial user prompt or attachment
 */
export function generateChatTopicTitle(prompt: string, attachmentName?: string, mode?: string): string {
  if (mode === 'answer_sheet') {
    return '📝 उत्तरपुस्तिका मूल्याङ्कन (Answer Sheet Review)';
  }

  const clean = (prompt || '').trim();
  if (!clean && attachmentName) {
    return `📄 ${attachmentName.replace(/\.[^/.]+$/, '')}`;
  }
  if (!clean) {
    return 'नयाँ अध्ययन कुराकानी';
  }

  const lower = clean.toLowerCase();

  // Pattern checks for prominent banking, Loksewa, economics, public enterprise topics
  if (lower.includes('nrb') || lower.includes('राष्ट्र बैंक ऐन') || lower.includes('केन्द्रीय बैंक')) {
    return 'NRB ऐन २०५८ र केन्द्रीय बैंक';
  }
  if (lower.includes('bafia') || lower.includes('बाफिया') || lower.includes('बैंक वर्गीकरण')) {
    return 'BAFIA २०७३ र बैंक वर्गीकरण';
  }
  if (lower.includes('aml') || lower.includes('शुद्धीकरण') || lower.includes('cft') || lower.includes('ctr') || lower.includes('str')) {
    return 'सम्पत्ति शुद्धीकरण (AML/CFT) दायित्व';
  }
  if (lower.includes('मौद्रिक') || lower.includes('monetary') || lower.includes('crr') || lower.includes('slr') || lower.includes('repo')) {
    return 'नेपालको मौद्रिक नीति र उपकरणहरू';
  }
  if (lower.includes('संविधान') || lower.includes('constitution') || lower.includes('मौलिक हक')) {
    return 'नेपालको संविधान र कानुनी व्यवस्था';
  }
  if (lower.includes('nea') || lower.includes('विद्युत प्राधिकरण')) {
    return 'नेपाल विद्युत प्राधिकरण (NEA) पाठ्यक्रम';
  }
  if (lower.includes('ntc') || lower.includes('टेलिकम')) {
    return 'नेपाल टेलिकम (NTC) सेवा र व्यवस्थापन';
  }
  if (lower.includes('epf') || lower.includes('कर्मचारी सञ्चय')) {
    return 'कर्मचारी सञ्चय कोष (EPF) ऐन र व्यवस्था';
  }
  if (lower.includes('cit') || lower.includes('नागरिक लगानी')) {
    return 'नागरिक लगानी कोष (CIT) योजनाहरू';
  }
  if (lower.includes('rbb') || lower.includes('राष्ट्रिय बाणिज्य')) {
    return 'RBB परीक्षा विशेष तयारी';
  }
  if (lower.includes('माग र पूर्ति') || lower.includes('demand') || lower.includes('supply') || lower.includes('curve') || lower.includes('वक्र')) {
    return 'माग र पूर्ति वक्र (Demand & Supply)';
  }
  if (lower.includes('लागत') || lower.includes('cost curve') || lower.includes('कार्टेल') || lower.includes('cartel') || lower.includes('monopoly')) {
    return 'लागत वक्र तथा बजार संरचना';
  }
  if (lower.includes('लेखा') || lower.includes('account') || lower.includes('brs') || lower.includes('journal')) {
    return 'बैंकिङ लेखा तथा हिसाब (Accounting)';
  }
  if (lower.includes('npl') || lower.includes('कर्जा वर्गीकरण') || lower.includes('loan loss')) {
    return 'कर्जा वर्गीकरण र NPL व्यवस्था';
  }
  if (lower.includes('level 4') || lower.includes('level 5') || lower.includes('तह ४') || lower.includes('तह ५')) {
    return 'तह ४/५ पाठ्यक्रम तथा प्री-टेस्ट';
  }
  if (lower.includes('level 6') || lower.includes('level 7') || lower.includes('अधिकृत') || lower.includes('officer')) {
    return 'अधिकृत तह ६/७ नीतिगत विश्लेषण';
  }

  // Remove common filler question words for concise titles
  let title = clean
    .replace(/^(कृपया|मलाई|नेपालमा|के हो|कसरी|सोध्नुहोस्|सम्बन्धी|बारे|विस्तृतमा|सम्झाउनुहोस्|बताउनुहोस्|explain|what is|how to)\s+/gi, '')
    .replace(/[?!।.,]+$/g, '')
    .trim();

  if (title.length > 36) {
    title = title.substring(0, 36).trim() + '...';
  }

  return title || 'बैंकिङ परीक्षा अध्ययन';
}

export class AiChatSessionService {
  /**
   * Resolve active user ID
   */
  private static resolveUid(providedUid?: string | null): string {
    if (providedUid && providedUid.trim()) return providedUid.trim();
    if (auth?.currentUser?.uid) return auth.currentUser.uid;
    return 'guest';
  }

  /**
   * Get all chat sessions for a user (from LocalStorage and RTDB)
   */
  static async getUserSessions(uid?: string | null): Promise<AiChatSession[]> {
    const userKey = this.resolveUid(uid);
    const localKey = `${STORAGE_PREFIX}${userKey}`;
    let sessions: AiChatSession[] = [];

    // 1. Read local cache first for instant UI response
    const cached = safeStorage.getItem(localKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          sessions = parsed;
        }
      } catch (e) {
        console.warn('Failed to parse local chat sessions:', e);
      }
    }

    // 2. If authenticated and RTDB available, fetch from Firebase Realtime Database
    if (rtdb && userKey !== 'guest') {
      try {
        const dbRef = ref(rtdb, `users/${userKey}/chat_sessions`);
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
          const val = snapshot.val();
          const rtdbSessions: AiChatSession[] = [];
          if (typeof val === 'object' && val !== null) {
            Object.keys(val).forEach(key => {
              const sessionData = val[key];
              if (sessionData && sessionData.id) {
                // Ensure messages is an array
                const msgs = Array.isArray(sessionData.messages) 
                  ? sessionData.messages 
                  : (sessionData.messages ? Object.values(sessionData.messages) : []);
                rtdbSessions.push({
                  ...sessionData,
                  messages: msgs,
                  messageCount: msgs.length
                });
              }
            });
          }

          if (rtdbSessions.length > 0) {
            // Sort most recently updated first
            rtdbSessions.sort((a, b) => b.updatedAt - a.updatedAt);
            sessions = rtdbSessions;
            // Update local cache
            safeStorage.setItem(localKey, JSON.stringify(sessions));
          }
        }
      } catch (rtdbErr) {
        console.warn('RTDB chat sessions fetch notice:', rtdbErr);
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Save or update a single session (both to LocalStorage and Firebase RTDB)
   */
  static async saveSession(session: AiChatSession, uid?: string | null): Promise<void> {
    const userKey = this.resolveUid(uid);
    const localKey = `${STORAGE_PREFIX}${userKey}`;

    // 1. Update local cache
    try {
      const currentSessions = await this.getUserSessions(userKey);
      const existingIdx = currentSessions.findIndex(s => s.id === session.id);
      let updated: AiChatSession[];
      if (existingIdx >= 0) {
        updated = [...currentSessions];
        updated[existingIdx] = session;
      } else {
        updated = [session, ...currentSessions];
      }
      updated.sort((a, b) => b.updatedAt - a.updatedAt);
      safeStorage.setItem(localKey, JSON.stringify(updated.slice(0, 30)));
    } catch (localErr) {
      console.warn('Could not save session locally:', localErr);
    }

    // 2. Sync to Firebase Realtime Database: users/{uid}/chat_sessions/{sessionId}
    if (rtdb && userKey !== 'guest') {
      try {
        const sessionRef = ref(rtdb, `users/${userKey}/chat_sessions/${session.id}`);
        // Strip large base64 preview strings before saving to RTDB to prevent bandwidth bloat
        const sanitizedMessages = session.messages.map(m => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp || Date.now(),
          pdfAttachment: m.pdfAttachment || null,
          image: m.image && m.image.startsWith('data:') && m.image.length > 50000 
            ? undefined // Skip storing multi-megabyte base64 in RTDB history
            : m.image,
          evaluationData: m.evaluationData || null
        }));

        await set(sessionRef, {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          level: session.level,
          mode: session.mode || 'general',
          messageCount: sanitizedMessages.length,
          messages: sanitizedMessages
        });
      } catch (rtdbErr) {
        console.warn('Firebase RTDB save chat session notice:', rtdbErr);
      }
    }
  }

  /**
   * Delete a chat session
   */
  static async deleteSession(sessionId: string, uid?: string | null): Promise<void> {
    const userKey = this.resolveUid(uid);
    const localKey = `${STORAGE_PREFIX}${userKey}`;

    // 1. Remove from local cache
    try {
      const current = await this.getUserSessions(userKey);
      const filtered = current.filter(s => s.id !== sessionId);
      safeStorage.setItem(localKey, JSON.stringify(filtered));
    } catch (e) {
      console.warn('Local session removal notice:', e);
    }

    // 2. Remove from RTDB
    if (rtdb && userKey !== 'guest') {
      try {
        const sessionRef = ref(rtdb, `users/${userKey}/chat_sessions/${sessionId}`);
        await remove(sessionRef);
      } catch (rtdbErr) {
        console.warn('Firebase RTDB delete chat session notice:', rtdbErr);
      }
    }
  }

  /**
   * Create a new session object
   */
  static createNewSession(level: ExamLevel = 'level4-5', mode: 'general' | 'answer_sheet' = 'general'): AiChatSession {
    const now = Date.now();
    return {
      id: `session-${now}-${Math.random().toString(36).substring(2, 7)}`,
      title: mode === 'answer_sheet' ? '📝 उत्तरपुस्तिका मूल्याङ्कन' : 'नयाँ कुराकानी',
      createdAt: now,
      updatedAt: now,
      level,
      mode,
      messageCount: 1,
      messages: [
        {
          id: `msg-${now}`,
          sender: 'ai',
          text: mode === 'answer_sheet'
            ? 'नमस्ते! म तपाईँको लोकसेवा तथा बैंकिङ परीक्षा उत्तरपुस्तिका परीक्षक हुन्। तपाईँले लेखेको हस्तलिखित उत्तरपुस्तिकाको फोटो (Photo) अपलोड गर्नुहोस्, म १० अंकमा प्राप्ताङ्क, सबल पक्ष, कमजोरी र सुधारका टिप्ससहित मूल्याङ्कन गरिदिनेछु।'
            : 'नमस्ते! म तपाईँको AI अध्ययन साथी तथा वरिष्ठ मेन्टर हुन्। बैंकिङ, लोकसेवा वा सार्वजनिक संस्थानका कुनै पनि विषयमा प्रश्न सोध्नुहोस्, हस्तलिखित उत्तरपुस्तिका जाँच गराउनुहोस् वा बोलेर (Mic) सोध्नुहोस्।',
          timestamp: now
        }
      ]
    };
  }
}
