import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, CheckSquare, Copy, Check, Paperclip, Mic, MicOff, FileText, FileCheck } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useApp } from '../../context/AppContext';
import { QuizSet } from '../../types';
import { MOCK_QUESTIONS } from '../../data/mockData';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { safeCopyToClipboard } from '../../utils/safeHelpers';

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  image?: string;
  pdfAttachment?: {
    name: string;
    sizeBytes: number;
  };
  suggestedTopic?: string;
}

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
  const { isAiModalOpen, setIsAiModalOpen, startQuiz } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'ai',
      text: 'नमस्ते! म तपाईँको AI अध्ययन साथी हुन्। कुनै पनि प्रश्न सोध्नुहोस्, नोट/PDF Upload गर्नुहोस् वा बोलेर (Mic) सोध्नुहोस्।'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);

  // Web Speech API states
  const [isListening, setIsListening] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState<'ne-NP' | 'en-US'>('ne-NP');
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAiModalOpen) {
      scrollToBottom();
    }
  }, [messages, isTyping, isAiModalOpen]);

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

  const samplePrompts = [
    '📜 नेपाल राष्ट्र बैंक ऐन २०५८ (दफा ४ र ५ विश्लेषण)',
    '🏦 BAFIA २०७३ अनुसार बैंक वर्गीकरण र चुक्ता पूँजी',
    '🛡️ सम्पत्ति शुद्धीकरण (AML/CFT) र CTR/STR दायित्व',
    '📈 मौद्रिक नीतिका मुख्य उपकरणहरू (CRR, SLR, Repo)',
    '💼 सार्वजनिक व्यवस्थापनमा HRM र सुशासन',
    '📝 विषयगत उत्तर लेखन शैली र परीक्षा टिप्स',
    '🧮 बैंकिङ हिसाब तथा लेखा (BRS, NPL, Accounting)'
  ];

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
        let interimText = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          } else {
            interimText += event.results[i][0].transcript;
          }
        }
        const spoken = (finalText || interimText).trim();
        if (spoken) {
          setInputQuery(prev => {
            const trimmed = prev.trim();
            if (!trimmed) return spoken;
            return `${trimmed} ${spoken}`;
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition notice:', event?.error);
        setIsListening(false);
        setSpeechNotice(null);
      };

      recognition.onend = () => {
        setIsListening(false);
        setTimeout(() => setSpeechNotice(null), 1500);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Could not start speech recognition:', err);
      setIsListening(false);
      setSpeechNotice(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (!isPdf && !isImage) {
      alert('कृपया PDF दस्तावेज (.pdf) वा तस्बिर (JPG, PNG, WebP) मात्र अपलोड गर्नुहोस्।');
      return;
    }

    // PDF up to 25MB, Images up to 15MB
    const maxBytes = isPdf ? 25 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert(`फाइलको आकार धेरै ठूलो छ (${formatFileSize(file.size)})। कृपया ${isPdf ? '२५ MB' : '१५ MB'} भन्दा सानो फाइल छान्नुहोस्।`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachedFile({
        type: isPdf ? 'pdf' : 'image',
        base64: dataUrl,
        mimeType: isPdf ? 'application/pdf' : (file.type || 'image/jpeg'),
        previewUrl: isImage ? dataUrl : undefined,
        name: file.name,
        sizeBytes: file.size
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if ((!trimmed && !attachedFile) || isTyping) return;

    // Stop listening if active
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    const currentFile = attachedFile;
    let queryToSend = trimmed;
    if (!queryToSend && currentFile) {
      queryToSend = currentFile.type === 'pdf'
        ? `कृपया संलग्न PDF दस्तावेज (${currentFile.name}) को अध्ययन गरी यसको मुख्य सार तथा महत्वपूर्ण विषयवस्तुहरू प्रस्तुत गर्नुहोस्।`
        : 'कृपया संलग्न तस्बिरमा भएको विषयवस्तु ध्यानपूर्वक पढी स्पष्ट विश्लेषण वा समाधान दिनुहोस्।';
    }

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: queryToSend,
      image: currentFile?.type === 'image' ? currentFile.previewUrl : undefined,
      pdfAttachment: currentFile?.type === 'pdf' ? {
        name: currentFile.name,
        sizeBytes: currentFile.sizeBytes
      } : undefined
    };

    const aiMsgId = `ai-${Date.now()}`;
    const initialAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: 'ai',
      text: ''
    };

    // Multi-turn recent messages for exam context
    const chatHistory = messages
      .filter(m => m.id !== 'msg-1' && m.text && m.text.trim())
      .slice(-8)
      .map(m => ({ sender: m.sender, text: m.text }));

    setMessages(prev => [...prev, userMsg, initialAiMsg]);
    setInputQuery('');
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsTyping(true);

    let streamedAny = false;
    let accumulatedText = '';

    // Primary: Call the server-side streaming API route (/api/ai-assistant-stream)
    // Runs gemini-3.8-flash with temperature 0.3, maxOutputTokens 4096, and 5-tier Lok Sewa Topper instructions
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch('/api/ai-assistant-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryToSend,
          history: chatHistory,
          attachment: currentFile ? {
            data: currentFile.base64,
            mimeType: currentFile.mimeType,
            name: currentFile.name
          } : undefined,
          image: currentFile?.type === 'image' ? {
            data: currentFile.base64,
            mimeType: currentFile.mimeType
          } : undefined
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let isDone = false;

        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data:')) continue;
            const dataStr = trimmedLine.replace(/^data:\s*/, '');
            if (dataStr === '[DONE]') {
              isDone = true;
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.chunk) {
                streamedAny = true;
                accumulatedText += parsed.chunk;
                setMessages(prev =>
                  prev.map(m => (m.id === aiMsgId ? { ...m, text: accumulatedText } : m))
                );
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } catch (streamErr: any) {
      console.warn('Server streaming connection notice:', streamErr?.message || streamErr);
    }

    // Fallback 1: Server non-streaming endpoint (/api/ai-assistant)
    if (!streamedAny || !accumulatedText.trim()) {
      try {
        const fallbackRes = await fetch('/api/ai-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: queryToSend,
            history: chatHistory,
            attachment: currentFile ? {
              data: currentFile.base64,
              mimeType: currentFile.mimeType,
              name: currentFile.name
            } : undefined,
            image: currentFile?.type === 'image' ? {
              data: currentFile.base64,
              mimeType: currentFile.mimeType
            } : undefined
          })
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          if (data.answer && data.answer.trim()) {
            streamedAny = true;
            accumulatedText = data.answer.trim();
            setMessages(prev =>
              prev.map(m => (m.id === aiMsgId ? { ...m, text: accumulatedText } : m))
            );
          }
        }
      } catch (fbErr: any) {
        console.warn('Fallback server API notice:', fbErr?.message || fbErr);
      }
    }

    // Fallback 2: Direct client-side SDK if VITE_GEMINI_API_KEY is present
    const apiKey =
      import.meta.env.VITE_GEMINI_API_KEY ||
      (typeof process !== 'undefined' ? process.env.VITE_GEMINI_API_KEY : '') ||
      '';

    if ((!streamedAny || !accumulatedText.trim()) && apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

        const SYSTEM_INSTRUCTION = `तपाईं नेपालको बैंकिङ तथा लोकसेवा परीक्षाको लागि अत्यन्तै स्मार्ट, सहयोगी र गतिशील AI अध्ययन साथी हुनुहुन्छ। सामान्य प्रश्नमा प्राकृतिक र मैत्रीपूर्ण तरिकाले कुराकानी गर्नुहोस्। परीक्षा तथा पाठ्यक्रमका विषयमा स्पष्ट हेडिङ, बुँदा, कानुनी दफा र गहिरो विश्लेषणसहित उत्तर दिनुहोस्। कुनै कडा वा अनावश्यक ढाँचा उल्लेख नगर्नुहोस्।`;

        const fullPrompt = `${SYSTEM_INSTRUCTION}\n\nप्रयोगकर्ताको प्रश्न:\n"${queryToSend}"`;
        const contentParts: any[] = [fullPrompt];

        if (currentFile && currentFile.base64) {
          const cleanBase64 = currentFile.base64.replace(/^data:[a-zA-Z0-9.+/-]+;base64,/, '').trim();
          contentParts.push({
            inlineData: {
              data: cleanBase64,
              mimeType: currentFile.mimeType
            }
          });
        }

        let streamResult: any = null;
        for (const candidate of candidateModels) {
          try {
            const candidateModel = genAI.getGenerativeModel({
              model: candidate,
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 4096
              }
            });
            streamResult = await candidateModel.generateContentStream(contentParts);
            if (streamResult) break;
          } catch (cErr: any) {
            console.warn(`Direct model ${candidate} notice:`, cErr?.message || cErr);
          }
        }

        if (streamResult && streamResult.stream) {
          for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              streamedAny = true;
              accumulatedText += chunkText;
              setMessages(prev =>
                prev.map(m => (m.id === aiMsgId ? { ...m, text: accumulatedText } : m))
              );
            }
          }
        }
      } catch (clientErr: any) {
        console.warn('Client direct call notice:', clientErr?.message || clientErr);
      }
    }

    // Fallback 3: Pedagogical default if all remote endpoints fail
    if (!streamedAny || !accumulatedText.trim()) {
      accumulatedText = `माफ गर्नुहोस्, हाल AI सेवामा अस्थायी चाप छ। कृपया केही क्षणपछि पुनः आफ्नो प्रश्न सोध्नुहोस्।`;
      setMessages(prev =>
        prev.map(m => (m.id === aiMsgId ? { ...m, text: accumulatedText } : m))
      );
    }

    setIsTyping(false);
  };

  const handleCopyText = async (id: string, text: string) => {
    const success = await safeCopyToClipboard(text);
    if (success) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleStartAiQuiz = () => {
    setIsAiModalOpen(false);
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col sm:items-center sm:justify-center p-0 sm:p-4 md:p-6 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-3xl h-[100dvh] sm:h-[88vh] sm:max-h-[900px] rounded-none sm:rounded-3xl border-0 sm:border sm:border-slate-200 dark:sm:border-slate-800 shadow-2xl flex flex-col overflow-hidden transition-all">
        
        {/* Header */}
        <header className="pt-safe p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-emerald-500/10 dark:from-amber-950/30 dark:to-emerald-950/20 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-emerald-500 flex items-center justify-center text-slate-950 font-bold shadow-md shrink-0">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="font-black text-slate-900 dark:text-white text-sm sm:text-lg truncate">
                  AI अध्ययन साथी (AI Study Assistant)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[9px] sm:text-[10px] font-bold shrink-0">
                  Smart AI
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[9px] sm:text-[10px] font-bold shrink-0 hidden xs:inline">
                  Multimodal
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                नेपालको बैंकिङ तथा लोकसेवा परीक्षाको लागि गतिशील र गहिरो अध्ययन सहायता
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsAiModalOpen(false)}
              className="min-w-[40px] min-h-[40px] p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 flex items-center justify-center cursor-pointer"
              title="बन्द गर्नुहोस्"
              aria-label="बन्द गर्नुहोस्"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

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
                className={`max-w-[90%] sm:max-w-[78%] p-3 sm:p-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white font-medium rounded-br-none whitespace-pre-line shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200/70 dark:border-slate-700/70 shadow-sm'
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
                      alt="संलग्न तस्बिर"
                      className="max-h-48 sm:max-h-60 max-w-full rounded-lg sm:rounded-xl border border-white/20 object-contain shadow-sm bg-black/10"
                    />
                  </div>
                )}

                {msg.sender === 'ai' ? (
                  <MarkdownRenderer content={msg.text} />
                ) : (
                  msg.text
                )}

                {msg.sender === 'ai' && (
                  <div className="pt-2 sm:pt-3 mt-2 sm:mt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                    <button
                      onClick={() => handleCopyText(msg.id, msg.text)}
                      className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer"
                    >
                      {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === msg.id ? 'कपी भयो' : 'कपी गर्नुहोस्'}</span>
                    </button>

                    <button
                      onClick={handleStartAiQuiz}
                      className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>यस विषयबाट Quiz खेल्नुहोस्</span>
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

        {/* Quick Topic Prompts */}
        <div className="py-2 px-2.5 sm:px-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 overflow-x-auto whitespace-nowrap flex gap-1.5 sm:gap-2 scrollbar-none shrink-0">
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

        {/* Speech Notice or Status Banner */}
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
              भाषा: {speechLanguage === 'ne-NP' ? 'नेपाली' : 'English'} (परिवर्तन)
            </button>
          </div>
        )}

        {/* Attached File Preview Bar (PDF or Image) */}
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
                  {attachedFile.type === 'pdf' ? '📄 PDF दस्तावेज संलग्न' : '📷 तस्बिर संलग्न'} ({formatFileSize(attachedFile.sizeBytes)}) • विश्लेषणका लागि तयार
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
              handleSendPrompt(inputQuery);
            }
          }}
          className="p-2 sm:p-3 sm:p-4 pb-safe border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1.5 sm:gap-2 shrink-0 z-20"
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

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isTyping}
            className="w-10 h-10 sm:w-11 sm:h-11 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-amber-500 dark:hover:text-amber-400 hover:border-amber-500 transition disabled:opacity-40 shrink-0 cursor-pointer shadow-2xs"
            title="PDF दस्तावेज वा तस्बिर संलग्न गर्नुहोस् (ऐन, पाठ्यक्रम, प्रश्नपत्र वा नोट)"
            aria-label="PDF दस्तावेज वा तस्बिर संलग्न गर्नुहोस्"
          >
            <Paperclip className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400" />
          </button>

          {/* Voice Input (Speech-to-Text) Button */}
          <button
            type="button"
            onClick={handleToggleSpeech}
            disabled={isTyping}
            className={`w-10 h-10 sm:w-11 sm:h-11 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border transition disabled:opacity-40 shrink-0 cursor-pointer shadow-2xs ${
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
                ? (attachedFile.type === 'pdf'
                    ? 'यस PDF बारे प्रश्न वा निर्देशन...'
                    : 'यस तस्बिर सम्बन्धी प्रश्न...')
                : 'सोध्नुहोस् वा बोल्नुहोस् (Mic)...'
            }
            aria-label="आफ्नो प्रश्न यहाँ सोध्नुहोस्..."
            className="flex-1 min-w-0 h-10 sm:h-11 px-3 sm:px-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
          />

          <button
            id="ai-assistant-send-btn"
            type="submit"
            disabled={(!inputQuery.trim() && !attachedFile) || isTyping}
            className="w-10 h-10 sm:w-11 sm:h-11 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-600 hover:to-orange-600 transition disabled:opacity-40 cursor-pointer shrink-0 shadow-md font-bold"
            title="पठाउनुहोस्"
            aria-label="पठाउनुहोस्"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950" />
          </button>
        </form>

      </div>
    </div>
  );
};
