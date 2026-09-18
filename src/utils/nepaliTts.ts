/**
 * Nepali Text-to-Speech (TTS) Voice Engine
 * Uses Web Speech API with fallback across Nepali and South Asian voices.
 */

class NepaliTtsEngine {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isPlaying: boolean = false;
  private currentMessageId: string | null = null;
  private onStateChangeCallbacks: Array<(state: { isPlaying: boolean; messageId: string | null }) => void> = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    }
  }

  public subscribe(callback: (state: { isPlaying: boolean; messageId: string | null }) => void) {
    this.onStateChangeCallbacks.push(callback);
    return () => {
      this.onStateChangeCallbacks = this.onStateChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  private notify(isPlaying: boolean, messageId: string | null) {
    this.isPlaying = isPlaying;
    this.currentMessageId = messageId;
    this.onStateChangeCallbacks.forEach(cb => cb({ isPlaying, messageId }));
  }

  /**
   * Cleans Markdown formatting, code blocks, and symbols for natural spoken speech
   */
  public cleanTextForSpeech(markdownText: string): string {
    if (!markdownText) return '';
    return markdownText
      // Remove SVG blocks and code blocks
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      // Remove Markdown links
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Remove headers, bold, italics, bullets, blockquotes
      .replace(/[#*_~`>]/g, '')
      // Remove table separator lines |---|---|
      .replace(/\|[\s:|-]+\|/g, '')
      // Replace table pipes with commas
      .replace(/\|/g, ', ')
      // Normalize whitespace and blank lines
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Speak a specific message
   */
  public speak(text: string, messageId: string, lang: 'ne-NP' | 'hi-IN' | 'en-US' = 'ne-NP') {
    if (!this.synth) {
      console.warn('SpeechSynthesis is not supported in this browser.');
      return;
    }

    // Stop existing speech
    this.stop();

    const spokenText = this.cleanTextForSpeech(text);
    if (!spokenText) return;

    // SpeechSynthesis might cancel long strings in some engines, chunk if exceptionally long
    const utterance = new SpeechSynthesisUtterance(spokenText.slice(0, 2500));
    this.currentUtterance = utterance;

    // Detect available voices
    const voices = this.synth.getVoices();
    let selectedVoice = voices.find(v => v.lang === 'ne-NP' || v.lang === 'ne_NP');
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.startsWith('ne'));
    }
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang === 'hi-IN' || v.lang.startsWith('hi'));
    }
    if (!selectedVoice && lang === 'en-US') {
      selectedVoice = voices.find(v => v.lang.startsWith('en'));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = lang;
    }

    // Gentle pacing for academic explanations
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      this.notify(true, messageId);
    };

    utterance.onend = () => {
      this.notify(false, null);
      this.currentUtterance = null;
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis utterance error:', e);
      this.notify(false, null);
      this.currentUtterance = null;
    };

    this.synth.speak(utterance);
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.notify(false, null);
    this.currentUtterance = null;
  }

  public pause() {
    if (this.synth && this.isPlaying) {
      this.synth.pause();
    }
  }

  public resume() {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
    }
  }

  public getStatus() {
    return {
      isPlaying: this.isPlaying,
      currentMessageId: this.currentMessageId
    };
  }
}

export const nepaliTts = new NepaliTtsEngine();
