import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, HelpCircle, FileText, CheckCircle, Info } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Cleans plain text separators and ensures markdown tables have proper syntax
 * so remark-gfm parses them seamlessly.
 */
function cleanAndNormalizeMarkdown(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Remove long divider lines like ==================== or --------------------
  cleaned = cleaned.replace(/^[ \t]*[=_-]{3,}[ \t]*$/gm, '');

  // 2. Normalize standalone "तालिका X: ..." or "Table X: ..." into markdown heading if needed
  cleaned = cleaned.replace(
    /(?:^|\n)(तालिका\s+[०-९0-9]+[^\n]*)(?=\n)/g,
    '\n\n### $1\n'
  );

  // 3. Normalize "X अङ्कको मोडल उत्तर ..." into markdown heading
  cleaned = cleaned.replace(
    /(?:^|\n)([०-९0-9]+\s*अङ्कको\s+मोडल\s+उत्तर[^\n]*)(?=\n)/g,
    '\n\n### $1\n'
  );

  // 4. Ensure tables have an empty newline before the table header row
  // remark-gfm requires a preceding blank line before a markdown table
  cleaned = cleaned.replace(
    /([^\n])\n(\|[^\n]+\|\n\|[\s:|-]+\|)/g,
    '$1\n\n$2'
  );

  // 5. Ensure an empty newline after a table block
  cleaned = cleaned.replace(
    /(\|[^\n]+\|)\n([^\n|])/g,
    '$1\n\n$2'
  );

  // 6. Reduce excessive consecutive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Ultra-Premium Markdown Renderer with custom Tailwind styling for
 * tables, callouts, headings, and lists.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const normalizedContent = cleanAndNormalizeMarkdown(content);

  return (
    <div className={`prose-content max-w-none ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Styled table wrapper with horizontal scroll and clean borders
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900/90 transition-all">
              <table className="w-full text-left border-collapse text-xs sm:text-sm" {...props}>
                {children}
              </table>
            </div>
          ),

          // Header row with subtle neutral background (#f1f5f9 / #e2e8f0)
          thead: ({ children, ...props }) => (
            <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-white font-extrabold border-b border-slate-200 dark:border-slate-700" {...props}>
              {children}
            </thead>
          ),

          // Table header cell with crisp typography
          th: ({ children, ...props }) => (
            <th className="p-3.5 sm:p-4 text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide text-left border-r border-slate-200/80 dark:border-slate-700/60 last:border-r-0 whitespace-nowrap bg-slate-100 dark:bg-slate-800" {...props}>
              {children}
            </th>
          ),

          // Table body
          tbody: ({ children, ...props }) => (
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80" {...props}>
              {children}
            </tbody>
          ),

          // Table row with alternating subtle shading and hover effect
          tr: ({ children, ...props }) => (
            <tr className="hover:bg-emerald-50/50 dark:hover:bg-slate-800/60 transition-colors even:bg-slate-50/60 dark:even:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/80 last:border-b-0" {...props}>
              {children}
            </tr>
          ),

          // Table data cell
          td: ({ children, ...props }) => (
            <td className="p-3.5 sm:p-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed border-r border-slate-200/60 dark:border-slate-800 last:border-r-0" {...props}>
              {children}
            </td>
          ),

          // Headings with distinctive accent borders (Ultra-Premium Textbook Styling)
          h1: ({ children, ...props }) => (
            <h1 className="border-l-4 border-emerald-600 pl-3 font-bold text-xl sm:text-2xl lg:text-3xl text-slate-900 dark:text-white my-5 tracking-tight" {...props}>
              {children}
            </h1>
          ),

          h2: ({ children, ...props }) => (
            <h2 className="border-l-4 border-emerald-600 pl-3 font-bold text-xl sm:text-2xl text-slate-900 dark:text-white my-4 tracking-tight" {...props}>
              {children}
            </h2>
          ),

          h3: ({ children, ...props }) => (
            <h3 className="border-l-4 border-emerald-600 pl-3 font-bold text-lg sm:text-xl text-emerald-800 dark:text-emerald-400 my-3.5" {...props}>
              {children}
            </h3>
          ),

          h4: ({ children, ...props }) => (
            <h4 className="border-l-4 border-emerald-600 pl-3 font-bold text-base sm:text-lg text-[#0B2046] dark:text-blue-400 my-2.5" {...props}>
              {children}
            </h4>
          ),

          // Paragraph with automatic Callout / Question / Exam Tip / Formula / Legal Clause detection
          p: ({ children, ...props }) => {
            // Check if this paragraph is a special callout
            const textContent = React.Children.toArray(children)
              .map(child => (typeof child === 'string' ? child : ''))
              .join('')
              .trim();

            // NRB IT Guidelines, Legal Clauses, Acts, NAS 1, Golden Rules & Formulas Callout Boxes
            if (
              textContent.startsWith('NRB IT Guidelines') ||
              textContent.startsWith('IT Guidelines') ||
              textContent.startsWith('नेपाल राष्ट्र बैंक IT Guidelines') ||
              textContent.startsWith('कानुनी व्यवस्था') ||
              textContent.startsWith('संवैधानिक आर्थिक व्यवस्थाहरू') ||
              textContent.startsWith('ऐनका मुख्य व्यवस्थाहरू') ||
              textContent.startsWith('कम्पनी ऐन') ||
              textContent.startsWith('बैंक तथा वित्तीय संस्था सम्बन्धी ऐन') ||
              textContent.startsWith('BAFIA') ||
              textContent.startsWith('NAS 1') ||
              textContent.startsWith('NFRS') ||
              textContent.startsWith('गोल्डेन रुल्स') ||
              textContent.startsWith('Golden Rules') ||
              textContent.startsWith('लेखा समीकरण') ||
              textContent.startsWith('सूत्र संग्रह:') ||
              textContent.startsWith('सूत्र:') ||
              textContent.startsWith('Formula:') ||
              textContent.startsWith('Formulas:') ||
              textContent.startsWith('दफा ') ||
              textContent.startsWith('धारा ') ||
              textContent.startsWith('Section ') ||
              textContent.startsWith('Clause ')
            ) {
              return (
                <div className="bg-slate-50 border-l-4 border-emerald-600 dark:bg-slate-800/90 dark:border-emerald-500 p-4 rounded-r-xl my-3 shadow-xs">
                  <div className="text-sm leading-relaxed font-medium text-slate-800 dark:text-slate-200">
                    {children}
                  </div>
                </div>
              );
            }

            // Exam Tip / Note / Alert callout
            if (
              textContent.startsWith('📌') ||
              textContent.startsWith('Exam Tip') ||
              textContent.startsWith('परीक्षा टिप्स:') ||
              textContent.startsWith('मुख्य टिप्स:') ||
              textContent.startsWith('टिप्स:') ||
              textContent.startsWith('नोट:') ||
              textContent.startsWith('Note:')
            ) {
              return (
                <div className="my-4 p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-950 dark:text-amber-200 text-xs sm:text-sm leading-relaxed flex items-start gap-3 shadow-xs">
                  <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 font-sans">{children}</div>
                </div>
              );
            }

            // Question callout
            if (
              textContent.startsWith('प्रश्न:') ||
              textContent.startsWith('प्रश्न ') ||
              textContent.startsWith('Question:')
            ) {
              return (
                <div className="bg-slate-50 border border-slate-200 dark:bg-slate-800/80 dark:border-slate-700 p-4 rounded-xl my-3 text-slate-900 dark:text-slate-100 text-xs sm:text-sm leading-relaxed flex items-start gap-3 shadow-xs">
                  <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div className="flex-1 font-bold text-slate-900 dark:text-white">{children}</div>
                </div>
              );
            }

            // Answer Sheet Evaluation: Score / Rating Callout
            if (
              textContent.includes('प्राप्ताङ्क') ||
              textContent.includes('प्राप्ताङ्क:') ||
              textContent.includes('Score:') ||
              textContent.includes('अंक:')
            ) {
              return (
                <div className="my-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-transparent border-2 border-amber-500/40 dark:border-amber-500/30 text-slate-900 dark:text-white shadow-sm">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-xs">
                      📊 उत्तरपुस्तिका मूल्याङ्कन
                    </span>
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      लोकसेवा / बैंकिङ मानक
                    </span>
                  </div>
                  <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-relaxed">
                    {children}
                  </div>
                </div>
              );
            }

            // Answer heading/lead callout
            if (
              textContent.startsWith('उत्तर:') ||
              textContent.startsWith('Answer:') ||
              textContent.startsWith('निष्कर्ष:')
            ) {
              return (
                <div className="my-3 p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border-l-4 border-emerald-600 text-emerald-950 dark:text-emerald-200 text-xs sm:text-sm leading-relaxed">
                  <div className="font-semibold">{children}</div>
                </div>
              );
            }

            // Strengths / Weaknesses callouts
            if (textContent.startsWith('✅ सबल पक्ष') || textContent.startsWith('सबल पक्षहरू')) {
              return (
                <div className="my-3 p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-100 text-xs sm:text-sm leading-relaxed">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 mb-1">✅ सबल पक्षहरू (Strengths):</div>
                  <div>{children}</div>
                </div>
              );
            }

            if (textContent.startsWith('⚠️ कमजोरी') || textContent.startsWith('सुधार गर्नुपर्ने पक्ष')) {
              return (
                <div className="my-3 p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-rose-950 dark:text-rose-100 text-xs sm:text-sm leading-relaxed">
                  <div className="font-bold text-rose-800 dark:text-rose-300 mb-1">⚠️ कमजोरी वा सुधार गर्नुपर्ने पक्षहरू (Weaknesses):</div>
                  <div>{children}</div>
                </div>
              );
            }

            return (
              <p className="text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-300 my-2.5 font-sans" {...props}>
                {children}
              </p>
            );
          },

          // Blockquote as light-shaded callout box (NRB IT guidelines, legal clauses, acts, formulas)
          blockquote: ({ children, ...props }) => (
            <blockquote className="bg-slate-50 border border-slate-200 dark:bg-slate-800/90 dark:border-slate-700 p-4 rounded-xl my-3 text-slate-800 dark:text-slate-200 text-xs sm:text-sm leading-relaxed shadow-xs" {...props}>
              {children}
            </blockquote>
          ),

          // Lists with custom neat spacing
          ul: ({ children, ...props }) => (
            <ul className="space-y-2 my-3 pl-2" {...props}>
              {children}
            </ul>
          ),

          ol: ({ children, ...props }) => (
            <ol className="list-decimal space-y-2 my-3 pl-5 text-sm sm:text-base text-slate-700 dark:text-slate-300" {...props}>
              {children}
            </ol>
          ),

          li: ({ children, ...props }) => (
            <li className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2" {...props}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2.5" />
              <div className="flex-1">{children}</div>
            </li>
          ),

          strong: ({ children, ...props }) => (
            <strong className="font-extrabold text-slate-950 dark:text-white" {...props}>
              {children}
            </strong>
          ),

          em: ({ children, ...props }) => (
            <em className="italic text-slate-800 dark:text-slate-200" {...props}>
              {children}
            </em>
          ),

          pre: ({ children, ...props }) => {
            const childText = React.Children.toArray(children)
              .map(c => {
                if (typeof c === 'string') return c;
                if (React.isValidElement(c) && (c.props as any)?.children) {
                  const subChildren = (c.props as any).children;
                  return Array.isArray(subChildren) ? subChildren.join('') : String(subChildren || '');
                }
                return '';
              })
              .join('')
              .trim();

            const isSvg = childText.startsWith('<svg') && childText.endsWith('</svg>');
            if (isSvg) {
              return (
                <div className="my-5 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto flex flex-col items-center">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 self-start flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>अर्थशास्त्र रेखाचित्र (SVG Vector Model)</span>
                  </div>
                  <div 
                    className="max-w-full overflow-x-auto flex justify-center py-2"
                    dangerouslySetInnerHTML={{ __html: childText }}
                  />
                </div>
              );
            }

            const isDiagramOrMath = 
              childText.includes('──') || 
              childText.includes('│') || 
              childText.includes('┌') || 
              childText.includes('┼') || 
              childText.includes('-->') || 
              childText.includes('==>') || 
              childText.includes('Demand') || 
              childText.includes('Supply') || 
              childText.includes('Cost') ||
              childText.includes('वक्र');

            return (
              <div className="my-5 rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 text-emerald-300 shadow-md">
                <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                    </span>
                    <span className="font-sans font-semibold text-slate-300 text-[11px] ml-1">
                      {isDiagramOrMath ? '📈 अर्थशास्त्र रेखाचित्र / हिसाब (Diagram & Formulas)' : 'कोड / रेखाचित्र'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans">
                    Loksewa & Banking Visuals
                  </span>
                </div>
                <pre className="p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed whitespace-pre scrollbar-thin scrollbar-thumb-slate-700" {...props}>
                  {children}
                </pre>
              </div>
            );
          },

          code: ({ children, ...props }) => (
            <code className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-mono text-xs sm:text-sm font-semibold" {...props}>
              {children}
            </code>
          ),

          hr: () => <hr className="my-6 border-slate-200 dark:border-slate-800" />
        }}
      >
        {normalizedContent}
      </Markdown>
    </div>
  );
};
