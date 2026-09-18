import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Send, 
  Bot, 
  CheckSquare, 
  Copy, 
  Check, 
  Paperclip, 
  Mic, 
  MicOff, 
  FileText, 
  Volume2, 
  VolumeX, 
  PanelLeftClose, 
  PanelLeft, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Layers, 
  Camera, 
  RotateCcw,
  BookOpen,
  HelpCircle,
  Clock
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { QuizSet } from '../../types';
import { MOCK_QUESTIONS } from '../../data/mockData';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { safeCopyToClipboard } from '../../utils/safeHelpers';
import { nepaliTts } from '../../utils/nepaliTts';
import { 
  AiChatSession, 
  ChatMessage, 
  ExamLevel, 
  AiChatSessionService, 
  generateChatTopicTitle 
} from '../../services/aiChatSessionService';

interface AttachedFile {
  type: 'image' | 'pdf';
  base64: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
  previewUrl?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const AiAssistantModal: React.FC = () => {
  const { isAiModalOpen, setIsAiModalOpen, startQuiz, user, addToast } = useApp();

  // Sessions and Active Thread State
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<AiChatSession | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [examLevel, setExamLevel] = useState<ExamLevel>('level4-5');
  const [sessionMode, setSessionMode] = useState<'general' | 'answer_sheet'>('general');

  // Input & Streaming states
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);

  // Audio / TTS state
  const [ttsState, setTtsState] = useState<{ isPlaying: boolean; messageId: string | null }>({
    isPlaying: false,
    messageId: null
  });

  // Web Speech API (Voice Input - STT)
  const [isListening, setIsListening] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState<'ne-NP' | 'en-US'>('ne-NP');
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to TTS changes
  useEffect(() => {
    const unsubscribe = nepaliTts.subscribe((state) => {
      setTtsState(state);
    });
    return () => {
      unsubscribe();
      nepaliTts.stop();
    };
  }, []);

  // Load chat sessions from Firebase RTDB and LocalStorage when modal opens
  useEffect(() => {
    if (isAiModalOpen) {
      const activeUid = user && !user.isGuest ? (user.authUid || user.id) : 'guest';
      AiChatSessionService.getUserSessions(activeUid).then((loaded) => {
        if (loaded && loaded.length > 0) {
          setSessions(loaded);
          setCurrentSession(loaded[0]);
          setExamLevel(loaded[0].level || 'level4-5');
          setSessionMode(loaded[0].mode || 'general');
        } else {
          const fresh = AiChatSessionService.createNewSession('level4-5', 'general');
          setSessions([fresh]);
          setCurrentSession(fresh);
          AiChatSessionService.saveSession(fresh, activeUid);
        }
      });
    } else {
      nepaliTts.stop();
    }
  }, [isAiModalOpen, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAiModalOpen) {
      scrollToBottom();
    }
  }, [currentSession?.messages, isTyping, isAiModalOpen]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  if (!isAiModalOpen) return null;

  const messages = currentSession?.messages || [];
  const activeUid = user && !user.isGuest ? (user.authUid || user.id) : 'guest';

  // Handle "+ New Chat"
  const handleStartNewChat = (mode: 'general' | 'answer_sheet' = 'general') => {
    nepaliTts.stop();
    const newSession = AiChatSessionService.createNewSession(examLevel, mode);
    const updated = [newSession, ...sessions.filter(s => s.id !== newSession.id)];
    setSessions(updated);
    setCurrentSession(newSession);
    setSessionMode(mode);
    setAttachedFile(null);
    setInputQuery('');
    AiChatSessionService.saveSession(newSession, activeUid);
    
    // On small screens, close sidebar when new chat is started
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Handle selecting an existing session thread from sidebar
  const handleSelectSession = (session: AiChatSession) => {
    nepaliTts.stop();
    setCurrentSession(session);
    setExamLevel(session.level || 'level4-5');
    setSessionMode(session.mode || 'general');
    setAttachedFile(null);
    setInputQuery('');
    
    // On mobile screens, collapse drawer after selection
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Handle deleting a session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    nepaliTts.stop();
    await AiChatSessionService.deleteSession(sessionId, activeUid);
    const remaining = sessions.filter(s => s.id !== sessionId);
    setSessions(remaining);

    if (currentSession?.id === sessionId) {
      if (remaining.length > 0) {
        setCurrentSession(remaining[0]);
        setExamLevel(remaining[0].level || 'level4-5');
      } else {
        const fresh = AiChatSessionService.createNewSession(examLevel, 'general');
        setSessions([fresh]);
        setCurrentSession(fresh);
        AiChatSessionService.saveSession(fresh, activeUid);
      }
    }
    if (addToast) {
      addToast('च्याट सत्र हटाइयो', 'info');
    }
  };

  // Switch Level (Level 4-5, 6-8, 9-10)
  const handleLevelChange = (lvl: ExamLevel) => {
    setExamLevel(lvl);
    if (currentSession) {
      const updated = {
        ...currentSession,
        level: lvl,
        updatedAt: Date.now()
      };
      setCurrentSession(updated);
      AiChatSessionService.saveSession(updated, activeUid);
    }
  };

  // Voice recognition handler
  const handleToggleSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechNotice('तपाईंको ब्राउजरमा Speech Recognition समर्थित छैन। कृपया Chrome वा Edge प्रयोग गर्नुहोस्।');
      setTimeout(() => setSpeechNotice(null), 4000);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = speechLanguage;
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechNotice(speechLanguage === 'ne-NP' ? '🔴 आवाज सुन्दैछ... बोल्नुहोस् (नेपाली)' : '🔴 Listening... speak now (English)');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          setInputQuery(prev => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        setSpeechNotice(`आवाज चिन्न सकिएन (${event.error || 'पुनः प्रयास गर्नुहोस्'})`);
        setTimeout(() => setSpeechNotice(null), 3000);
      };

      recognition.onend = () => {
        setIsListening(false);
        setSpeechNotice(null);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechNotice('आवाज सुरु गर्न सकिएन। कृपया माइक्रोफोन अनुमति दिनुहोस्।');
      setTimeout(() => setSpeechNotice(null), 4000);
    }
  };

  // File selection handler (PDF & Images)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      if (addToast) addToast('फाइल आकार १५ MB भन्दा कम हुनुपर्छ।', 'error');
      return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (!isPdf && !isImage) {
      if (addToast) addToast('केवल PDF दस्तावेज वा तस्बिर (JPG, PNG, WebP) संलग्न गर्न सकिन्छ।', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64Data = resultStr.split(',')[1] || '';
      const previewUrl = isImage ? resultStr : undefined;

      setAttachedFile({
        type: isPdf ? 'pdf' : 'image',
        base64: base64Data,
        mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
        name: file.name,
        sizeBytes: file.size,
        previewUrl
      });
    };
    reader.readAsDataURL(file);

    // Reset input so re-uploading the same file triggers onChange
    e.target.value = '';
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
  };

  // Quick Action: Check Answer Sheet
  const handleTriggerAnswerSheetEvaluation = () => {
    setSessionMode('answer_sheet');
    fileInputRef.current?.click();
  };

  // Send prompt (handles streaming SSE and updates chat session)
  const handleSendPrompt = async (textToSend?: string) => {
    const promptText = (typeof textToSend === 'string' ? textToSend : inputQuery).trim();
    if ((!promptText && !attachedFile) || isTyping) return;

    const fileToSend = attachedFile;
    const isAnswerSheetMode = sessionMode === 'answer_sheet';

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: promptText || (
        fileToSend?.type === 'pdf'
          ? `[संलग्न PDF: ${fileToSend.name}] कृपया यसको विस्तृत अध्ययन गरी मुख्य विषयवस्तु सम्झाउनुहोस्।`
          : (isAnswerSheetMode
              ? `[संलग्न हस्तलिखित उत्तरपुस्तिका: ${fileToSend?.name}] कृपया यस उत्तरपुस्तिकाको १० अंकमा प्राप्ताङ्क, सबल पक्ष, कमजोरी र लोकसेवा/बैंकिङ परीक्षामा उच्चतम अंक प्राप्त गर्ने सुधार टिप्ससहित मूल्याङ्कन गर्नुहोस्।`
              : `[संलग्न तस्बिर: ${fileToSend?.name}] कृपया यस तस्बिरमा भएको विषयवस्तु विश्लेषण गर्नुहोस्।`)
      ),
      pdfAttachment: fileToSend?.type === 'pdf' ? { name: fileToSend.name, sizeBytes: fileToSend.sizeBytes } : undefined,
      image: fileToSend?.type === 'image' ? fileToSend.previewUrl : undefined,
      timestamp: Date.now()
    };

    // Calculate auto title if session is brand new
    let sessionTitle = currentSession?.title || 'नयाँ कुराकानी';
    if (!currentSession || currentSession.messages.length <= 1 || sessionTitle === 'नयाँ कुराकानी') {
      sessionTitle = generateChatTopicTitle(promptText, fileToSend?.name, sessionMode);
    }

    const aiTempId = `ai-${Date.now()}`;
    const initialAiMessage: ChatMessage = {
      id: aiTempId,
      sender: 'ai',
      text: '',
      timestamp: Date.now()
    };

    const updatedMessages = [...messages, userMessage, initialAiMessage];

    // Optimistically update current session
    const baseSession: AiChatSession = currentSession ? {
      ...currentSession,
      title: sessionTitle,
      updatedAt: Date.now(),
      level: examLevel,
      mode: sessionMode,
      messages: updatedMessages,
      messageCount: updatedMessages.length
    } : {
      id: `session-${Date.now()}`,
      title: sessionTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      level: examLevel,
      mode: sessionMode,
      messages: updatedMessages,
      messageCount: updatedMessages.length
    };

    setCurrentSession(baseSession);
    setInputQuery('');
    setAttachedFile(null);
    setIsTyping(true);

    try {
      // Build history payload for Gemini context
      const historyPayload = messages.slice(-10).map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const payload: any = {
        query: promptText,
        history: historyPayload,
        level: examLevel,
        mode: sessionMode
      };

      if (fileToSend) {
        payload.attachment = {
          data: fileToSend.base64,
          mimeType: fileToSend.mimeType,
          name: fileToSend.name
        };
      }

      const response = await fetch('/api/ai-assistant-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedAiText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.chunk) {
                accumulatedAiText += parsed.chunk;
                setCurrentSession(prev => {
                  if (!prev) return prev;
                  const newMsgs = [...prev.messages];
                  const lastIdx = newMsgs.findIndex(m => m.id === aiTempId);
                  if (lastIdx >= 0) {
                    newMsgs[lastIdx] = { ...newMsgs[lastIdx], text: accumulatedAiText };
                  }
                  return { ...prev, messages: newMsgs };
                });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      // Finalize session with complete AI text
      const finalMessages = [...updatedMessages];
      const targetIdx = finalMessages.findIndex(m => m.id === aiTempId);
      if (targetIdx >= 0) {
        finalMessages[targetIdx] = {
          ...finalMessages[targetIdx],
          text: accumulatedAiText.trim() || 'माफ गर्नुहोस्, उत्तर प्राप्त हुन सकेन। कृपया पुनः प्रयास गर्नुहोस्।'
        };
      }

      const finalSession: AiChatSession = {
        ...baseSession,
        title: sessionTitle,
        updatedAt: Date.now(),
        messages: finalMessages,
        messageCount: finalMessages.length
      };

      setCurrentSession(finalSession);
      
      // Update session list and sync to Firebase Realtime Database
      setSessions(prev => {
        const filtered = prev.filter(s => s.id !== finalSession.id);
        return [finalSession, ...filtered];
      });
      await AiChatSessionService.saveSession(finalSession, activeUid);

    } catch (streamErr) {
      console.warn('Streaming error, invoking non-streaming fallback:', streamErr);
      try {
        const fallbackRes = await fetch('/api/ai-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: promptText,
            history: messages.slice(-10).map(m => ({ sender: m.sender, text: m.text })),
            attachment: fileToSend ? {
              data: fileToSend.base64,
              mimeType: fileToSend.mimeType,
              name: fileToSend.name
            } : undefined,
            level: examLevel,
            mode: sessionMode
          })
        });

        const data = await fallbackRes.json();
        const fallbackText = data.answer || 'माफ गर्नुहोस्, सेवामा क्षणिक लोड छ। कृपया केही सेकेन्डपछि पुनः प्रश्न सोध्नुहोस्।';

        const finalMessages = [...updatedMessages];
        const targetIdx = finalMessages.findIndex(m => m.id === aiTempId);
        if (targetIdx >= 0) {
          finalMessages[targetIdx] = {
            ...finalMessages[targetIdx],
            text: fallbackText
          };
        }

        const finalSession: AiChatSession = {
          ...baseSession,
          title: sessionTitle,
          updatedAt: Date.now(),
          messages: finalMessages,
          messageCount: finalMessages.length
        };

        setCurrentSession(finalSession);
        setSessions(prev => [finalSession, ...prev.filter(s => s.id !== finalSession.id)]);
        await AiChatSessionService.saveSession(finalSession, activeUid);
      } catch (fbErr) {
        console.error('AI assistant complete error:', fbErr);
        if (addToast) addToast('सर्भरसँग सम्पर्क हुन सकेन।', 'error');
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleCopyText = async (id: string, text: string) => {
    const success = await safeCopyToClipboard(text);
    if (success) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Toggle Nepali Text-To-Speech for an AI response
  const handleToggleTts = (messageId: string, text: string) => {
    if (ttsState.isPlaying && ttsState.messageId === messageId) {
      nepaliTts.stop();
    } else {
      nepaliTts.speak(text, messageId, 'ne-NP');
    }
  };

  const handleStartAiQuiz = () => {
    setIsAiModalOpen(false);
    nepaliTts.stop();
    const quizSet: QuizSet = {
      id: `ai-quiz-${Date.now()}`,
      title: 'AI टपर मेन्टर - विशेष अभ्यास क्विज',
      description: 'छलफल गरिएका बैंकिङ तथा लोकसेवा विषयहरूमा आधारित १० वटा मानक अभ्यास प्रश्नहरू',
      category: 'Banking',
      difficulty: 'Medium',
      mode: 'practice',
      timeLimitMinutes: 5,
      questions: MOCK_QUESTIONS.slice(0, 10),
      badge: 'Topper Quiz'
    };
    startQuiz(quizSet);
  };

  const samplePrompts = [
    '📈 माग र पूर्ति वक्र (Demand & Supply Equilibrium ASCII)',
    '📊 लागत वक्र (AC, MC, AVC Cost Curves Diagram)',
    '📜 नेपाल राष्ट्र बैंक ऐन २०५८ (दफा ४ र ५ विश्लेषण)',
    '🏦 BAFIA २०७३ अनुसार बैंक वर्गीकरण र चुक्ता पूँजी',
    '🛡️ सम्पत्ति शुद्धीकरण (AML/CFT) र CTR/STR दायित्व',
    '⚡ NEA/NTC/CIT/EPF संस्थान पाठ्यक्रम तथा सेवा नियम',
    '🧮 बैंकिङ हिसाब तथा सूत्र संग्रह (BRS, NPL, CAR, Compound Interest)'
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col sm:items-center sm:justify-center p-0 sm:p-3 md:p-6 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-5xl h-[100dvh] sm:h-[90vh] sm:max-h-[920px] rounded-none sm:rounded-3xl border-0 sm:border sm:border-slate-200 dark:sm:border-slate-800 shadow-2xl flex flex-col overflow-hidden transition-all">
        
        {/* Top Header Bar */}
        <header className="pt-safe px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/95 shrink-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Sidebar Toggle Button (Gemini Style) */}
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              title={isSidebarOpen ? "च्याट इतिहास लुकाउनुहोस् (Collapse Sidebar)" : "च्याट इतिहास हेर्नुहोस् (Open Chat History)"}
              aria-label="च्याट इतिहास टगल गर्नुहोस्"
            >
              {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5 text-amber-500" />}
            </button>

            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-emerald-500 flex items-center justify-center text-slate-950 font-bold shadow-sm shrink-0">
              <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-black text-slate-900 dark:text-white text-xs sm:text-base truncate">
                  AI अध्ययन मेन्टर
                </h2>
                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[9px] font-bold shrink-0">
                  Gemini Flash
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[9px] font-bold shrink-0 hidden md:inline">
                  ४५+ संस्थान
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                {currentSession?.title || 'बैंकिङ तथा लोकसेवा परीक्षा तयारी'}
              </p>
            </div>
          </div>

          {/* Level Adaptive Selector & Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Exam Level Selector Pills */}
            <div className="hidden sm:flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-xl text-[10px] sm:text-xs font-bold">
              <button
                onClick={() => handleLevelChange('level4-5')}
                className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                  examLevel === 'level4-5'
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="तह ४-५ (सहायक/खरिदार/नायब सुब्बा)"
              >
                तह ४-५
              </button>
              <button
                onClick={() => handleLevelChange('level6-8')}
                className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                  examLevel === 'level6-8'
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="तह ६-८ (अधिकृत/वरिष्ठ अधिकृत)"
              >
                तह ६-८
              </button>
              <button
                onClick={() => handleLevelChange('level9-10')}
                className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                  examLevel === 'level9-10'
                    ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
                title="तह ९-१० (प्रबन्धक/उप-निर्देशक/निर्देशक)"
              >
                तह ९-१०
              </button>
            </div>

            {/* Global TTS Stop if currently playing */}
            {ttsState.isPlaying && (
              <button
                onClick={() => nepaliTts.stop()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-bold animate-pulse cursor-pointer border border-rose-300 dark:border-rose-800"
                title="आवाज बन्द गर्नुहोस् (Stop Speech)"
              >
                <VolumeX className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">बोल्दैछ...</span>
              </button>
            )}

            {/* Close Modal Button */}
            <button
              onClick={() => {
                nepaliTts.stop();
                setIsAiModalOpen(false);
              }}
              className="min-w-[36px] min-h-[36px] p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition shrink-0 flex items-center justify-center cursor-pointer"
              title="बन्द गर्नुहोस्"
              aria-label="बन्द गर्नुहोस्"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Body with Gemini-Style Collapsible Sidebar + Conversation */}
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
          
          {/* Collapsible Left Drawer / Sidebar */}
          <aside
            className={`
              absolute md:static inset-y-0 left-0 z-30
              w-64 sm:w-72 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800
              flex flex-col transition-all duration-300 ease-in-out
              ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:w-0 md:hidden md:-translate-x-0'}
            `}
          >
            {/* Top: "+ New Chat" Button */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2">
              <button
                onClick={() => handleStartNewChat('general')}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ नयाँ कुराकानी (New Chat)</span>
              </button>

              {/* Quick Action: Answer Sheet Checking */}
              <button
                onClick={handleTriggerAnswerSheetEvaluation}
                className="w-full py-1.5 px-2.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/40 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800/60 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
                title="हस्तलिखित उत्तरपुस्तिका चेक गर्नुहोस्"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>📝 उत्तरपुस्तिका मूल्याङ्कन (१० अङ्क)</span>
              </button>
            </div>

            {/* Recents Section (हालका कुराकानीहरू) */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
              <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center justify-between">
                <span>हालका कुराकानी (Recents)</span>
                <span className="text-[9px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-full font-mono">
                  {sessions.length}
                </span>
              </div>

              {sessions.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  कुनै अघिल्लो कुराकानी छैन।
                </div>
              ) : (
                sessions.map((sess) => {
                  const isActive = currentSession?.id === sess.id;
                  return (
                    <div
                      key={sess.id}
                      onClick={() => handleSelectSession(sess)}
                      className={`group w-full text-left p-2.5 rounded-xl text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/15 text-amber-950 dark:text-amber-200 font-bold border border-amber-500/30'
                          : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-500' : 'text-slate-400'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs leading-snug">
                            {sess.title || 'नयाँ कुराकानी'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-slate-400 font-medium">
                            <span>{sess.level === 'level9-10' ? 'तह ९-१०' : sess.level === 'level6-8' ? 'तह ६-८' : 'तह ४-५'}</span>
                            <span>•</span>
                            <span>{sess.messageCount || sess.messages?.length || 1} म्यासेज</span>
                          </div>
                        </div>
                      </div>

                      {/* Delete session button */}
                      <button
                        onClick={(e) => handleDeleteSession(e, sess.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 dark:hover:text-rose-400 transition rounded-md hover:bg-slate-300/50 dark:hover:bg-slate-700/50 shrink-0 cursor-pointer"
                        title="च्याट मेटाउनुहोस्"
                        aria-label="च्याट मेटाउनुहोस्"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Sync Status Banner */}
            <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Firebase RTDB सिंक</span>
              </span>
              <span className="text-[9px] font-mono text-slate-400">
                {user && !user.isGuest ? 'अनलाइन' : 'अतिथि (Guest)'}
              </span>
            </div>
          </aside>

          {/* Backdrop for Mobile Sidebar */}
          {isSidebarOpen && (
            <div
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden fixed inset-0 bg-black/40 z-20 backdrop-blur-xs"
            />
          )}

          {/* Chat Stream & Interaction Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 relative">
            
            {/* Mode Banner if evaluating answer sheet */}
            {sessionMode === 'answer_sheet' && (
              <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between shrink-0">
                <span className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-600" />
                  <span>📝 हस्तलिखित उत्तरपुस्तिका मूल्याङ्कन मोड सक्रिय (१० अंकमा परीक्षण)</span>
                </span>
                <button
                  onClick={() => setSessionMode('general')}
                  className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  सामान्य मोडमा फर्कनुहोस्
                </button>
              </div>
            )}

            {/* Chat Stream View */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 sm:space-y-4">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-2 sm:gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'ai' && (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[92%] sm:max-w-[80%] p-3 sm:p-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-emerald-600 text-white font-medium rounded-br-none whitespace-pre-line shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200/70 dark:border-slate-700/70 shadow-sm'
                    }`}
                  >
                    {/* PDF Document Attachment Card in Chat History */}
                    {msg.pdfAttachment && (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-red-500/15 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 mb-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{msg.pdfAttachment.name}</p>
                          <p className="text-[10px] text-red-700 dark:text-red-300 font-medium">
                            PDF दस्तावेज संलग्न ({formatFileSize(msg.pdfAttachment.sizeBytes)}) • सुक्ष्म विश्लेषण
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Image Attachment Thumbnail in Chat History */}
                    {msg.image && (
                      <div className="mb-2.5">
                        <img
                          src={msg.image}
                          alt="संलग्न तस्बिर वा उत्तरपुस्तिका"
                          className="max-h-56 sm:max-h-64 max-w-full rounded-lg sm:rounded-xl border border-white/20 object-contain shadow-sm bg-black/10"
                        />
                      </div>
                    )}

                    {msg.sender === 'ai' ? (
                      <MarkdownRenderer content={msg.text} />
                    ) : (
                      msg.text
                    )}

                    {/* AI Message Footer Toolbar with Nepali Voice (TTS), Copy & Quiz */}
                    {msg.sender === 'ai' && msg.text && (
                      <div className="pt-2 sm:pt-3 mt-2 sm:mt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          {/* Nepali Text-to-Speech (TTS) Voice Button */}
                          <button
                            onClick={() => handleToggleTts(msg.id, msg.text)}
                            className={`flex items-center gap-1 font-bold transition cursor-pointer ${
                              ttsState.isPlaying && ttsState.messageId === msg.id
                                ? 'text-rose-500 animate-pulse'
                                : 'hover:text-amber-600 dark:hover:text-amber-400'
                            }`}
                            title="नेपालीमा आवाज सुन्नुहोस् (Text to Speech)"
                          >
                            {ttsState.isPlaying && ttsState.messageId === msg.id ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5" />
                                <span>आवाज बन्द</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                                <span>आवाज सुन्नुहोस् (TTS)</span>
                              </>
                            )}
                          </button>

                          {/* Copy Button */}
                          <button
                            onClick={() => handleCopyText(msg.id, msg.text)}
                            className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                          >
                            {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedId === msg.id ? 'कपी भयो' : 'कपी'}</span>
                          </button>
                        </div>

                        {/* Start Quiz on Topic */}
                        <button
                          onClick={handleStartAiQuiz}
                          className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>यसबाट Quiz खेल्नुहोस्</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {msg.sender === 'user' && (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs shadow-sm">
                      U
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 p-2">
                  <Sparkles className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="font-medium">AI अध्ययन साथीले उत्तर तयार गर्दैछ...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Topic Prompts (Economics Graphs, Acts, Math) */}
            <div className="py-2 px-2.5 sm:px-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 overflow-x-auto whitespace-nowrap flex gap-1.5 sm:gap-2 scrollbar-none shrink-0">
              {samplePrompts.map((p, pIdx) => (
                <button
                  key={pIdx}
                  onClick={() => handleSendPrompt(p)}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] sm:text-[11px] font-medium hover:border-amber-500 dark:hover:border-amber-400 transition shrink-0 cursor-pointer shadow-2xs"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Speech Notice Banner */}
            {speechNotice && (
              <div className="px-3 sm:px-4 py-1.5 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-[11px] sm:text-xs font-semibold flex items-center justify-between shrink-0 animate-fadeIn">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span className="truncate">{speechNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSpeechLanguage(prev => prev === 'ne-NP' ? 'en-US' : 'ne-NP')}
                  className="text-[10px] bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 font-bold shrink-0 ml-2"
                >
                  भाषा: {speechLanguage === 'ne-NP' ? 'नेपाली' : 'English'}
                </button>
              </div>
            )}

            {/* Attached File Preview Bar (Handwritten Sheet, Image, PDF) */}
            {attachedFile && (
              <div className="px-3 sm:px-4 py-2 bg-slate-100/90 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  {attachedFile.type === 'pdf' ? (
                    <div className="w-9 h-9 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <FileText className="w-5 h-5" />
                    </div>
                  ) : (
                    <img
                      src={attachedFile.previewUrl}
                      alt="Attached"
                      className="w-9 h-9 object-cover rounded-xl border border-slate-300 dark:border-slate-700 shadow-sm shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate max-w-[200px] sm:max-w-md">
                      {attachedFile.name}
                    </p>
                    <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      {sessionMode === 'answer_sheet'
                        ? '📝 उत्तरपुस्तिका जाँचका लागि तयार'
                        : (attachedFile.type === 'pdf' ? '📄 PDF दस्तावेज संलग्न' : '📷 तस्बिर संलग्न')} ({formatFileSize(attachedFile.sizeBytes)})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-bold px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0 cursor-pointer"
                >
                  हटाउनुहोस्
                </button>
              </div>
            )}

            {/* Chat Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inputQuery.trim() || attachedFile) {
                  handleSendPrompt();
                }
              }}
              className="p-2 sm:p-3 pb-safe border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1.5 sm:gap-2 shrink-0 z-20"
            >
              {/* File attachment input: PDF & Images */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".pdf,application/pdf,image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                id="ai-assistant-file-input"
              />

              {/* Upload photo / answer sheet / PDF */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isTyping}
                className="w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-amber-500 dark:hover:text-amber-400 hover:border-amber-500 transition disabled:opacity-40 shrink-0 cursor-pointer shadow-2xs"
                title="हस्तलिखित उत्तरपुस्तिका, प्रश्नपत्र वा PDF संलग्न गर्नुहोस्"
                aria-label="फाइल संलग्न गर्नुहोस्"
              >
                <Paperclip className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400" />
              </button>

              {/* Voice Input (Speech-to-Text) Button */}
              <button
                type="button"
                onClick={handleToggleSpeech}
                disabled={isTyping}
                className={`w-10 h-10 min-w-[40px] flex items-center justify-center rounded-xl border transition disabled:opacity-40 shrink-0 cursor-pointer shadow-2xs ${
                  isListening
                    ? 'bg-rose-500 text-white border-rose-600 animate-pulse ring-2 ring-rose-300 dark:ring-rose-800 shadow-md'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 hover:border-emerald-500'
                }`}
                title={isListening ? "आवाज रेकर्डिङ बन्द गर्नुहोस्" : "बोलेर प्रश्न सोध्नुहोस् (Speech to Text - नेपाली/English)"}
                aria-label="बोलेर प्रश्न सोध्नुहोस्"
              >
                {isListening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400" />}
              </button>

              <input
                id="ai-assistant-input"
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder={
                  attachedFile
                    ? (sessionMode === 'answer_sheet'
                        ? 'उत्तरपुस्तिका मूल्याङ्कन सम्बन्धी विशेष निर्देशन...'
                        : (attachedFile.type === 'pdf' ? 'यस PDF बारे प्रश्न वा निर्देशन...' : 'यस तस्बिर सम्बन्धी प्रश्न...'))
                    : 'सोध्नुहोस् वा बोल्नुहोस् (Mic)...'
                }
                aria-label="आफ्नो प्रश्न यहाँ सोध्नुहोस्..."
                className="flex-1 min-w-0 h-10 sm:h-11 px-3 sm:px-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
              />

              <button
                id="ai-assistant-send-btn"
                type="submit"
                disabled={(!inputQuery.trim() && !attachedFile) || isTyping}
                className="w-10 h-10 sm:w-11 sm:h-11 min-w-[40px] flex items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-600 hover:to-orange-600 transition disabled:opacity-40 cursor-pointer shrink-0 shadow-md font-bold"
                title="पठाउनुहोस्"
                aria-label="पठाउनुहोस्"
              >
                <Send className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950" />
              </button>
            </form>
          </main>

        </div>
      </div>
    </div>
  );
};
