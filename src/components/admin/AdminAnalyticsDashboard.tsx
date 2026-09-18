import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Award, 
  BarChart3, 
  Search, 
  Clock, 
  FileText, 
  Filter, 
  Download, 
  RefreshCw, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Crown,
  Calendar,
  Layers,
  CheckSquare,
  ChevronRight,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { 
  AdminAnalyticsService, 
  AdminRegisteredUser, 
  AdminExamRecord, 
  AdminNotesActivityRecord,
  AdminSummaryMetrics 
} from '../../services/adminAnalyticsService';
import { isOwnerAdmin, PRIMARY_OWNER_EMAIL, BACKUP_ADMIN_EMAIL, isExcludedAdminActivity } from '../../utils/sanitizer';

export const AdminAnalyticsDashboard: React.FC = () => {
  const { user, setActiveTab, addToast } = useApp();

  // Active sub-view in Admin Analytics
  const [activeSubTab, setActiveSubTab] = useState<'exams' | 'users' | 'notes'>('exams');

  // Live Firestore data
  const [registeredUsers, setRegisteredUsers] = useState<AdminRegisteredUser[]>([]);
  const [examRecords, setExamRecords] = useState<AdminExamRecord[]>([]);
  const [notesActivities, setNotesActivities] = useState<AdminNotesActivityRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuizFilter, setSelectedQuizFilter] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');
  // Admin Filter Toggle: false = Students Only (default), true = All including Admin
  const [includeAdmins, setIncludeAdmins] = useState<boolean>(false);

  // Verify access guard
  useEffect(() => {
    if (!isOwnerAdmin(user?.email)) {
      window.history.replaceState(null, '', '/');
      setActiveTab('home');
      addToast('Unauthorized Access: यो एनालिटिक्स केवल एप ओनरका लागि मात्र सुरक्षित छ।', 'error');
    }
  }, [user?.email, setActiveTab, addToast]);

  // Subscribe to real-time updates from Firestore
  useEffect(() => {
    if (!isOwnerAdmin(user?.email)) return;

    const unsubUsers = AdminAnalyticsService.subscribeToRegisteredUsers((users) => {
      setRegisteredUsers(users);
      setLastRefreshedAt(new Date());
    });

    const unsubExams = AdminAnalyticsService.subscribeToExamSubmissions((exams) => {
      setExamRecords(exams);
      setLastRefreshedAt(new Date());
    });

    return () => {
      unsubUsers();
      unsubExams();
    };
  }, [user?.email]);

  // Notes activity subscription depends on registeredUsers to resolve XP
  useEffect(() => {
    if (!isOwnerAdmin(user?.email)) return;
    const unsubNotes = AdminAnalyticsService.subscribeToNotesActivity(registeredUsers, (acts) => {
      setNotesActivities(acts);
      setLastRefreshedAt(new Date());
    });
    return () => {
      unsubNotes();
    };
  }, [registeredUsers, user?.email]);

  // Calculate summary metrics dynamically
  const metrics: AdminSummaryMetrics = useMemo(() => {
    const validUsers = includeAdmins ? registeredUsers : registeredUsers.filter(u => !isExcludedAdminActivity(u.email));
    const validExams = includeAdmins ? examRecords : examRecords.filter(e => !isExcludedAdminActivity(e.studentEmail));
    const validNotes = includeAdmins ? notesActivities : notesActivities.filter(n => !isExcludedAdminActivity(n.studentEmail));
    return AdminAnalyticsService.calculateSummaryMetrics(
      validUsers,
      validExams,
      validNotes
    );
  }, [registeredUsers, examRecords, notesActivities, includeAdmins]);

  // Unique Quizzes for filter dropdown
  const uniqueQuizzes = useMemo(() => {
    const set = new Set<string>();
    for (const e of examRecords) {
      if (e.quizTitle) set.add(e.quizTitle);
    }
    return Array.from(set);
  }, [examRecords]);

  // Manual refresh trigger
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefreshedAt(new Date());
      setIsRefreshing(false);
      addToast('फायरबेसबाट नयाँ एनालिटिक्स डाटा सिङ्क भयो!', 'success');
    }, 600);
  };

  // Filtered Exam Records for the Data Table
  const filteredExams = useMemo(() => {
    return examRecords.filter(exam => {
      // 0. Filter admin accounts if not requested
      if (!includeAdmins && isExcludedAdminActivity(exam.studentEmail)) {
        return false;
      }

      // 1. Search query (Student Name or Email)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = exam.studentName.toLowerCase().includes(q);
        const matchesEmail = exam.studentEmail.toLowerCase().includes(q);
        const matchesQuiz = exam.quizTitle.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesQuiz) {
          return false;
        }
      }

      // 2. Quiz title filter
      if (selectedQuizFilter !== 'all' && exam.quizTitle !== selectedQuizFilter) {
        return false;
      }

      // 3. Score filter
      if (scoreFilter === 'high' && exam.percentage < 80) return false;
      if (scoreFilter === 'medium' && (exam.percentage < 50 || exam.percentage >= 80)) return false;
      if (scoreFilter === 'low' && exam.percentage >= 50) return false;

      // 4. Date filter
      if (dateFilter !== 'all') {
        const examDate = new Date(exam.timestamp).getTime();
        const now = Date.now();
        if (dateFilter === 'today' && now - examDate > 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '7days' && now - examDate > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '30days' && now - examDate > 30 * 24 * 60 * 60 * 1000) return false;
      }

      return true;
    });
  }, [examRecords, searchQuery, selectedQuizFilter, scoreFilter, dateFilter, includeAdmins]);

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    let list = registeredUsers;
    if (!includeAdmins) {
      list = list.filter(u => !isExcludedAdminActivity(u.email));
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(u => 
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.targetExam && u.targetExam.toLowerCase().includes(q)) ||
      (u.district && u.district.toLowerCase().includes(q))
    );
  }, [registeredUsers, searchQuery, includeAdmins]);

  // Filtered Notes Activities List
  const filteredNotesActivities = useMemo(() => {
    return notesActivities.filter(a => {
      if (!includeAdmins && isExcludedAdminActivity(a.studentEmail)) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        a.studentName.toLowerCase().includes(q) ||
        a.studentEmail.toLowerCase().includes(q) ||
        a.noteTitle.toLowerCase().includes(q) ||
        a.details.toLowerCase().includes(q)
      );
    });
  }, [notesActivities, searchQuery, includeAdmins]);

  // Export Table Data to CSV
  const handleExportCSV = () => {
    if (filteredExams.length === 0) {
      addToast('डाउनलोड गर्नका लागि कुनै डाटा भेटिएन।', 'warning');
      return;
    }

    const headers = ['Student Name', 'Email', 'Quiz Title', 'Score', 'Total Questions', 'Percentage', 'Time Taken (s)', 'Date & Time'];
    const rows = filteredExams.map(e => [
      `"${e.studentName.replace(/"/g, '""')}"`,
      `"${e.studentEmail.replace(/"/g, '""')}"`,
      `"${e.quizTitle.replace(/"/g, '""')}"`,
      e.score,
      e.totalQuestions,
      `${e.percentage}%`,
      e.timeTakenSeconds,
      `"${new Date(e.timestamp).toLocaleString()}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `owner_admin_analytics_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('एक्जाम एनालिटिक्स CSV सफलतापूर्वक डाउनलोड भयो।', 'success');
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16">
      
      {/* Top Header / Banner */}
      <div className="w-full bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            
            {/* Left Title */}
            <div className="flex items-center space-x-3.5">
              <button
                onClick={() => {
                  setActiveTab('home');
                  window.history.pushState(null, '', '/');
                }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                title="गृहपृष्ठमा फर्कनुहोस्"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-black shrink-0">
                <Crown className="w-6 h-6" />
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                    प्रशासक एनालिटिक्स ड्यासबोर्ड (Owner Panel)
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-300 text-[10px] font-black border border-amber-500/40">
                    OWNER ONLY
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>Authorized Owner:</span>
                  <span className="font-semibold text-amber-300">{user?.email || PRIMARY_OWNER_EMAIL}</span>
                </p>
              </div>
            </div>

            {/* Right Status & Controls */}
            <div className="flex items-center space-x-2.5 shrink-0">
              <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-emerald-400 font-semibold">Firestore Live</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-400">{lastRefreshedAt.toLocaleTimeString()}</span>
              </div>

              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
                title="फायरबेस डाटाबेसबाट पुनः रिफ्रेस गर्नुहोस्"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
                <span className="hidden sm:inline">रिफ्रेस</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-amber-500/30 transition cursor-pointer"
                title="एक्जाम रेकर्ड्स CSV डाउनलोड गर्नुहोस्"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* =========================================================================
            TOP STAT CARDS
            (Total Active Students | Total Exams Completed | Average Score %)
            ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          
          {/* Card 1: Total Active Students */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                कुल सक्रिय विद्यार्थी
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                {metrics.totalActiveStudents.toLocaleString()}
              </h3>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                <span>फायरबेसमा दर्ता / लगइन प्रोफाइल</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Total Exams Completed */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                सम्पन्न परीक्षाहरू
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                {metrics.totalExamsCompleted.toLocaleString()}
              </h3>
              <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1 font-medium">
                <CheckSquare className="w-3 h-3" />
                <span>MCQ सब्मिसन रेकर्ड्स</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Award className="w-6 h-6" />
            </div>
          </div>

          {/* Card 3: Average Score % */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                औसत प्राप्ताङ्क (Avg Score)
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                {metrics.averageScorePercent}%
              </h3>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
                <TrendingUp className="w-3 h-3" />
                <span>समग्र शुद्धता प्रतिशत (Accuracy)</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6" />
            </div>
          </div>

          {/* Card 4: Notes Read & Completion Time */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                नोट्स अध्ययन तथा औसत समय
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
                {AdminAnalyticsService.formatTime(metrics.averageCompletionTimeSeconds)}
              </h3>
              <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 flex items-center gap-1 font-medium">
                <FileText className="w-3 h-3" />
                <span>{metrics.totalNotesRead} अध्ययन क्रियाकलाप रेकर्ड</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* =========================================================================
            NAVIGATION TABS
            1) Exam & Quiz Tracker
            2) Registered Students Directory
            3) Content & Notes Activity
            ========================================================================= */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-6">
          
          <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            
            {/* Tab Switches */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveSubTab('exams')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                  activeSubTab === 'exams'
                    ? 'bg-slate-900 text-white dark:bg-amber-600 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>१. परीक्षा तथा क्विज ट्र्याकर ({examRecords.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('users')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                  activeSubTab === 'users'
                    ? 'bg-slate-900 text-white dark:bg-amber-600 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>२. दर्ता विद्यार्थी सूची ({registeredUsers.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('notes')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                  activeSubTab === 'notes'
                    ? 'bg-slate-900 text-white dark:bg-amber-600 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>३. सामग्री तथा नोट्स अध्ययन ({notesActivities.length})</span>
              </button>
            </div>

            {/* Filter Toggle: Student Activity Only vs All Activity & Global Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIncludeAdmins(false)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    !includeAdmins
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="एडमिन ईमेल बाहेक केवल वास्तविक विद्यार्थीहरूको गतिविधि देखाउनुहोस्"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>विद्यार्थी मात्र</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeAdmins(true)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    includeAdmins
                      ? 'bg-slate-900 text-white dark:bg-slate-700 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="एडमिन सहित सम्पूर्ण गतिविधि देखाउनुहोस्"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>सबै (All)</span>
                </button>
              </div>

              {/* Global Search Bar */}
              <div className="relative w-full sm:w-64 md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="नाम वा इमेल खोज्नुहोस्..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* =========================================================================
              VIEW 1: EXAM & QUIZ TRACKER (FILTERABLE DATA TABLE)
              Columns: [Student Name | Email | Quiz/Set Title | Score/Marks | Date & Time]
              ========================================================================= */}
          {activeSubTab === 'exams' && (
            <div className="p-4 sm:p-5">
              
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2.5 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold mr-1">
                  <Filter className="w-3.5 h-3.5" />
                  <span>फिल्टर:</span>
                </div>

                {/* Quiz set filter */}
                <select
                  value={selectedQuizFilter}
                  onChange={(e) => setSelectedQuizFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">सबै क्विज / सेटहरू ({uniqueQuizzes.length})</option>
                  {uniqueQuizzes.map((title, idx) => (
                    <option key={idx} value={title}>
                      {title.length > 40 ? title.substring(0, 40) + '...' : title}
                    </option>
                  ))}
                </select>

                {/* Score filter */}
                <select
                  value={scoreFilter}
                  onChange={(e) => setScoreFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">सबै प्राप्ताङ्क (All Scores)</option>
                  <option value="high">८०% भन्दा बढी (High Accuracy)</option>
                  <option value="medium">५०% - ८०% (Average)</option>
                  <option value="low">५०% भन्दा कम (Needs Review)</option>
                </select>

                {/* Date filter */}
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">सबै समय (All Time)</option>
                  <option value="today">आज (Past 24 Hours)</option>
                  <option value="7days">पछिल्लो ७ दिन (Past 7 Days)</option>
                  <option value="30days">पछिल्लो ३० दिन (Past 30 Days)</option>
                </select>

                {/* Counter indicator */}
                <div className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  देखाउँदै: <strong className="text-slate-900 dark:text-white">{filteredExams.length}</strong> / {examRecords.length} रेकर्डहरू
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <th className="py-3 px-4">Student Name (नाम)</th>
                      <th className="py-3 px-4">Email (इमेल)</th>
                      <th className="py-3 px-4">Quiz/Set Title (परीक्षा सेट)</th>
                      <th className="py-3 px-4 text-center">Attempted / Total</th>
                      <th className="py-3 px-4 text-center">Score / Marks</th>
                      <th className="py-3 px-4 text-center">Percentage</th>
                      <th className="py-3 px-4 text-center">Time Taken</th>
                      <th className="py-3 px-4 text-right">Date & Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filteredExams.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-slate-400">
                          कुनै परीक्षा रेकर्ड भेटिएन।
                        </td>
                      </tr>
                    ) : (
                      filteredExams.map((exam) => {
                        const isHigh = exam.percentage >= 80;
                        const isMid = exam.percentage >= 50 && exam.percentage < 80;

                        return (
                          <tr 
                            key={exam.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            {/* Student Name */}
                            <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                              <div className="flex items-center space-x-2">
                                <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                                  {exam.studentName.charAt(0) || 'S'}
                                </div>
                                <span className="truncate max-w-[160px]" title={exam.studentName}>
                                  {exam.studentName}
                                </span>
                              </div>
                            </td>

                            {/* Email */}
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              {exam.studentEmail ? (
                                <span className="truncate max-w-[180px] block" title={exam.studentEmail}>
                                  {exam.studentEmail}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Guest / No Email</span>
                              )}
                            </td>

                            {/* Quiz Title */}
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-200">
                              <span className="line-clamp-1 max-w-[220px]" title={exam.quizTitle}>
                                {exam.quizTitle}
                              </span>
                            </td>

                            {/* Attempted Count */}
                            <td className="py-3 px-4 text-center font-semibold text-slate-600 dark:text-slate-400">
                              {exam.attemptedCount} / {exam.totalQuestions}
                            </td>

                            {/* Score / Marks */}
                            <td className="py-3 px-4 text-center">
                              <span className="font-black text-slate-900 dark:text-white px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                {exam.score}
                              </span>
                            </td>

                            {/* Percentage */}
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                isHigh 
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' 
                                  : isMid
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                              }`}>
                                {exam.percentage}%
                              </span>
                            </td>

                            {/* Completion Time */}
                            <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {AdminAnalyticsService.formatTime(exam.timeTakenSeconds)}
                            </td>

                            {/* Date & Time */}
                            <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 text-[11px]">
                              {new Date(exam.timestamp).toLocaleDateString('ne-NP', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                              <span className="block text-[10px] text-slate-400 font-mono">
                                {new Date(exam.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* =========================================================================
              VIEW 2: REGISTERED USERS DIRECTORY
              (Display Name, Email, Registration Date, Last Active, Total XP)
              ========================================================================= */}
          {activeSubTab === 'users' && (
            <div className="p-4 sm:p-5">
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <th className="py-3 px-4">विद्यार्थी (Display Name)</th>
                      <th className="py-3 px-4">इमेल ठेगाना (Email)</th>
                      <th className="py-3 px-4">लक्षित परीक्षा (Target Exam)</th>
                      <th className="py-3 px-4 text-center">कुल XP (Total XP)</th>
                      <th className="py-3 px-4 text-center">सम्पन्न क्विज</th>
                      <th className="py-3 px-4">दर्ता मिति (Registration Date)</th>
                      <th className="py-3 px-4 text-right">अन्तिम सक्रियता (Last Active)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-slate-400">
                          कुनै विद्यार्थी प्रोफाइल भेटिएन।
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((student) => (
                        <tr 
                          key={student.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          {/* Name & Avatar */}
                          <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center space-x-2.5">
                              {student.photoURL ? (
                                <img 
                                  src={student.photoURL} 
                                  alt="" 
                                  className="w-7 h-7 rounded-full object-cover shrink-0" 
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-500 font-bold text-xs flex items-center justify-center shrink-0">
                                  {student.displayName.charAt(0) || 'U'}
                                </div>
                              )}
                              <div>
                                <span className="block truncate max-w-[170px]" title={student.displayName}>
                                  {student.displayName}
                                </span>
                                {student.district && (
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    {student.district}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {student.email || <span className="italic text-slate-400">अतिथि (Guest)</span>}
                          </td>

                          {/* Target Exam */}
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-[11px]">
                            <span className="truncate max-w-[190px] block" title={student.targetExam}>
                              {student.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४'}
                            </span>
                          </td>

                          {/* Total XP */}
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold text-[11px] inline-flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              {student.totalXp} XP
                            </span>
                          </td>

                          {/* Quizzes Completed */}
                          <td className="py-3 px-4 text-center font-semibold text-slate-600 dark:text-slate-400">
                            {student.quizzesCompleted}
                          </td>

                          {/* Registration Date */}
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                            {new Date(student.registrationDate).toLocaleDateString()}
                          </td>

                          {/* Last Active */}
                          <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 text-[11px]">
                            {new Date(student.lastActive).toLocaleDateString()}
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {new Date(student.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 3: CONTENT & NOTES ACTIVITY
              (Which notes/pages were read and total XP accumulated by each student)
              ========================================================================= */}
          {activeSubTab === 'notes' && (
            <div className="p-4 sm:p-5">
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <th className="py-3 px-4">विद्यार्थी (Student Name)</th>
                      <th className="py-3 px-4">इमेल (Email)</th>
                      <th className="py-3 px-4">अध्ययन गरिएको सामग्री / पृष्ठ (Note / Page Title)</th>
                      <th className="py-3 px-4">विवरण (Activity Details)</th>
                      <th className="py-3 px-4 text-center">विद्यार्थीको कुल XP</th>
                      <th className="py-3 px-4 text-right">समय (Timestamp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filteredNotesActivities.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-slate-400">
                          कुनै अध्ययन क्रियाकलाप रेकर्ड भेटिएन।
                        </td>
                      </tr>
                    ) : (
                      filteredNotesActivities.map((act) => (
                        <tr 
                          key={act.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          {/* Student Name */}
                          <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                            <span className="truncate max-w-[160px] block" title={act.studentName}>
                              {act.studentName}
                            </span>
                          </td>

                          {/* Email */}
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {act.studentEmail || <span className="italic text-slate-400">Guest</span>}
                          </td>

                          {/* Note / Page Title */}
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-200">
                            <div className="flex items-center space-x-2">
                              <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="line-clamp-1 max-w-[260px]" title={act.noteTitle}>
                                {act.noteTitle}
                              </span>
                            </div>
                          </td>

                          {/* Details */}
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-[11px]">
                            <span className="line-clamp-1 max-w-[200px]" title={act.details}>
                              {act.details}
                            </span>
                          </td>

                          {/* Student XP */}
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 font-bold text-[11px] inline-flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              {act.accumulatedXp} XP
                            </span>
                          </td>

                          {/* Timestamp */}
                          <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 text-[11px]">
                            {new Date(act.timestamp).toLocaleDateString()}
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
